// ---------- Тильда: приём заявок вебхуком ----------
// Скрипт публикуется как веб-приложение, его адрес (с секретным ключом) указывается
// в Тильде: Настройки сайта → Формы → Webhook. Каждая заявка дописывается на лист raw_tilda:
// телефон (для сопоставления с Мой Класс и амо) и UTM-метки (для канала).

/** Тильда шлёт заявку POST-запросом: формой (x-www-form-urlencoded) или JSON. */
function doPost(e) {
  const params = tildaParams_(e);
  // При подключении вебхука Тильда присылает test=test и ждёт ответ «ok»
  if (params.test) return ContentService.createTextOutput('ok');
  const secret = prop_('TILDA_SECRET');
  // Ключ может прийти и в адресе, и в теле (поля API NAME / API KEY в Тильде)
  const sent = [].concat((e && e.parameters && e.parameters.key) || [], params.key || []).map(String)
    .filter((k, i, a) => a.indexOf(k) === i);
  if (!secret || sent.indexOf(secret) < 0) {
    const mask = k => k ? k.slice(0, 4) + '…' : '—';
    log_('Тильда', 'ОТКЛОНЕНО: ' + (sent.length ? 'неверный ключ (пришёл ' + sent.map(mask).join(', ') +
      ', ожидается ' + mask(secret) + ')' : 'нет ключа ?key=…') +
      '; формат: ' + ((e && e.postData && e.postData.type) || '—') + '; поля: ' + Object.keys(params).join(', '));
    return ContentService.createTextOutput('forbidden');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const row = tildaRow_(params, new Date());
    const sh = sheet_(SHEETS.tilda, HEAD.tilda);
    // Тильда может повторить отправку — заявку с тем же tranid не дублируем
    const ids = sh.getLastRow() > 1 ? sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0])) : [];
    if (!row[1] || ids.indexOf(String(row[1])) < 0) {
      sh.appendRow(row);
      sh.getRange(sh.getLastRow(), 6).setNumberFormat('@').setValue(row[5]);
    }
  } catch (err) {
    log_('Тильда', 'ОШИБКА при записи заявки: ' + err.message);
    throw err;
  } finally {
    lock.releaseLock();
  }
  return ContentService.createTextOutput('ok');
}

/** Поля заявки: параметры формы/адреса плюс JSON-тело, если Тильда шлёт JSON. */
function tildaParams_(e) {
  const params = Object.assign({}, (e && e.parameter) || {});
  const body = e && e.postData && e.postData.contents;
  if (body && /json/i.test(e.postData.type || '') || /^\s*[{[]/.test(body || '')) {
    try {
      const data = JSON.parse(body);
      const obj = Array.isArray(data) ? data[0] || {} : data;
      Object.keys(obj).forEach(k => {
        const v = obj[k];
        if (k === 'key' && params.key) return; // ключ из адреса важнее
        params[k] = v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
      });
    } catch (err) { /* не JSON — оставляем поля формы */ }
  }
  return params;
}

/** Проверка адреса в браузере. */
function doGet() {
  return ContentService.createTextOutput('Дашборд: приём заявок с Тильды работает.');
}

/** Параметры вебхука Тильды → строка raw_tilda. */
function tildaRow_(params, receivedAt) {
  const keys = Object.keys(params).filter(k => k !== 'key');
  const find = re => {
    const k = keys.filter(x => re.test(x))[0];
    return k ? String(params[k]) : '';
  };
  const utm = tildaUtm_(params);
  const all = keys.filter(k => k !== 'COOKIES').map(k => k + '=' + params[k])
    .concat('COOKIES=' + (params.COOKIES || params.cookies ? 'есть' : 'нет')).join('; ');
  return [
    receivedAt,
    params.tranid || '',
    params.formname || params.formid || '',
    tildaPage_(params),
    find(/^(name|имя|fio|фио)$/i),
    normalizePhone_(find(/phone|телефон|tel/i)),
    find(/e-?mail|почта/i),
    utm.utm_source, utm.utm_medium, utm.utm_campaign, utm.utm_content, utm.utm_term,
    all.slice(0, 2000),
  ];
}

/**
 * UTM-метки заявки: из полей utm_* (если в форме есть скрытые поля) или из куки
 * TILDAUTM, которую Тильда передаёт в поле COOKIES: utm_source=x|||utm_medium=y…
 */
function tildaUtm_(params) {
  const out = { utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '' };
  const m = String(params.COOKIES || params.cookies || '').match(/TILDAUTM=([^;]+)/);
  if (m) {
    let raw = m[1];
    try { raw = decodeURIComponent(raw); } catch (e) { /* оставляем как есть */ }
    raw.split('|||').forEach(pair => {
      const i = pair.indexOf('=');
      const k = lc_(pair.slice(0, i));
      if (k in out) out[k] = pair.slice(i + 1);
    });
  }
  Object.keys(out).forEach(k => {
    const own = Object.keys(params).filter(x => lc_(x) === k)[0];
    if (own && params[own]) out[k] = String(params[own]);
  });
  // Нет меток — ищем UTM в адресе страницы и метки клика (yclid и т. п.) во всех полях
  if (!out.utm_source) {
    const text = [tildaPage_(params)].concat(Object.keys(params).filter(k => k !== 'key')
      .map(k => k + '=' + decodeSafe_(params[k]))).join(' ');
    const found = clickSource_(text);
    Object.keys(out).forEach(k => { if (!out[k]) out[k] = found[k]; });
  }
  return out;
}

function decodeSafe_(v) {
  try { return decodeURIComponent(String(v)); } catch (e) { return String(v); }
}

/** Адрес страницы, с которой пришла заявка (если Тильда его передала). */
function tildaPage_(params) {
  // landing_page и page_url добавляет код для сайта (см. tildaSnippet_)
  const own = params.landing_page || params.page_url || params.pageurl || params.page || params.referer ||
    params.url || params.URL || '';
  if (own) return String(own);
  const k = Object.keys(params).filter(x => x !== 'COOKIES' && /^https?:\/\//i.test(String(params[x])))[0];
  return k ? String(params[k]) : '';
}

/**
 * Источник по тексту с адресом страницы: UTM-метки из адреса, а если их нет — метки клика,
 * которые рекламные системы добавляют сами (yclid → yandex, gclid → google…, см. CLICK_IDS).
 */
function clickSource_(text) {
  const out = { utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '' };
  const s = String(text || '');
  const re = /[?&]utm_(source|medium|campaign|content|term)=([^&#\s;]*)/gi;
  for (let m; (m = re.exec(s));) {
    const k = 'utm_' + m[1].toLowerCase();
    if (!out[k]) {
      try { out[k] = decodeURIComponent(m[2].replace(/\+/g, ' ')); } catch (e) { out[k] = m[2]; }
    }
  }
  if (!out.utm_source) {
    const hit = CLICK_IDS.filter(c => new RegExp('(^|[?&;\\s])' + c[0] + '=', 'i').test(s))[0];
    if (hit) { out.utm_source = hit[1]; if (!out.utm_medium) out.utm_medium = hit[2]; }
  }
  return out;
}

/** Отладка: записывает тестовую заявку так же, как это делает вебхук. */
function debugTildaTest() {
  menuTildaSecret_();
  doPost({ parameter: {
    key: prop_('TILDA_SECRET'), tranid: 'test-' + Date.now(), formname: 'Тестовая заявка (удалите строку)',
    Name: 'Тест', Phone: '+7 900 000-00-00', utm_source: 'test', utm_campaign: 'check',
  } });
  SpreadsheetApp.getActive().setActiveSheet(sheet_(SHEETS.tilda, HEAD.tilda));
  SpreadsheetApp.getUi().alert('Тестовая заявка записана на лист raw_tilda. Если её там нет — смотрите лист «Лог».');
}

function menuTildaSecret_() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty('TILDA_SECRET');
  if (!secret) {
    secret = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('TILDA_SECRET', secret);
  }
  return secret;
}

/**
 * Код для сайта (Настройки сайта → Ещё → HTML-код для вставки внутрь HEAD).
 * Запоминает адрес входа по рекламной ссылке (UTM, yclid и т. п.) на 30 дней и добавляет
 * в каждую форму скрытые поля landing_page, referrer, page_url — они приходят в вебхук.
 */
function tildaSnippet_() {
  return [
    '<script>',
    '(function () {',
    '  var DAYS = 30, ads = /[?&](utm_[a-z]+|yclid|ybaip|_openstat|gclid|fbclid|rb_clickid)=/i;',
    '  function get(n) { var m = document.cookie.match("(?:^|; )" + n + "=([^;]*)"); return m ? decodeURIComponent(m[1]) : ""; }',
    '  function set(n, v) { document.cookie = n + "=" + encodeURIComponent(v) + "; path=/; max-age=" + DAYS * 86400; }',
    '  if (ads.test(location.search) || !get("mx_landing")) set("mx_landing", location.href);',
    '  if (document.referrer && document.referrer.indexOf(location.hostname) < 0) set("mx_ref", document.referrer);',
    '  function fill() {',
    '    var vals = { landing_page: get("mx_landing"), referrer: get("mx_ref"), page_url: location.href };',
    '    var forms = document.querySelectorAll("form");',
    '    for (var i = 0; i < forms.length; i++) {',
    '      for (var name in vals) {',
    '        var el = forms[i].querySelector("input[name=\'" + name + "\']");',
    '        if (!el) { el = document.createElement("input"); el.type = "hidden"; el.name = name; forms[i].appendChild(el); }',
    '        el.value = vals[name];',
    '      }',
    '    }',
    '  }',
    '  document.addEventListener("DOMContentLoaded", fill);',
    '  ["mousedown", "touchstart", "keydown", "submit"].forEach(function (ev) { document.addEventListener(ev, fill, true); });',
    '})();',
    '</script>',
  ].join('\n');
}

/** Меню: создаёт секретный ключ и показывает адрес для Тильды. */
function menuTilda() {
  const secret = menuTildaSecret_();
  sheet_(SHEETS.tilda, HEAD.tilda);
  const url = ScriptApp.getService().getUrl();
  const html = HtmlService.createHtmlOutput(
    '<div style="font:14px Arial;line-height:1.5">' +
    (url
      ? '<p>Адрес вебхука для Тильды (скопируйте целиком):</p>' +
        '<textarea style="width:100%;height:70px" onclick="this.select()">' + url + '?key=' + secret + '</textarea>'
      : '<p><b>Сначала опубликуйте скрипт как веб-приложение</b>: в редакторе Apps Script ' +
        '«Начать развертывание → Новое развертывание → Веб-приложение», ' +
        'запуск от имени «Меня», доступ «Все». Потом откройте это окно снова.</p>' +
        '<p>Ключ, который нужно будет дописать к адресу: <code>?key=' + secret + '</code></p>') +
    '<p>В Тильде: <b>Настройки сайта → Формы → Webhook</b> → вставьте адрес → «Добавить». ' +
    'Затем в настройках каждой формы на страницах отметьте этот Webhook.</p>' +
    '<p>Чтобы в заявках были UTM-метки, в Тильде включите передачу Cookies: ' +
    'в настройках вебхука отметьте «Передавать Cookies».</p>' +
    '<p><b>Код для сайта</b> — чтобы в заявки попадал адрес входа с рекламными метками (yclid, UTM). ' +
    'Вставьте его в Тильде: <b>Настройки сайта → Ещё → HTML-код для вставки внутрь HEAD</b>, ' +
    'сохраните и <b>опубликуйте все страницы</b>.</p>' +
    '<textarea style="width:100%;height:150px;font:11px monospace" onclick="this.select()">' +
    tildaSnippet_().replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</textarea></div>'
  ).setWidth(600).setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, 'Подключение Тильды');
}
