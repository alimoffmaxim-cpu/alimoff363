// ---------- Тильда: приём заявок вебхуком ----------
// Скрипт публикуется как веб-приложение; его адрес с секретным ключом указывается в Тильде:
// Настройки сайта → Формы → Webhook. Каждая заявка дописывается на лист «Заявки» с метками:
// utm_* из полей формы или из куки TILDAUTM, адрес входа с рекламными параметрами (код для сайта).

const DR_LEAD_HEAD = ['Получена', 'ID заявки', 'Форма', 'Имя', 'Телефон', 'Email', 'utm_source', 'utm_medium',
  'utm_campaign', 'utm_content', 'utm_term', 'Страница входа', 'Все поля',
  'Источник', 'ID кампании', 'Кампания', 'ID группы', 'Группа', 'ID объявления', 'Как сопоставлено'];
const DR_LEAD_RAW = 13;   // A–M пишет вебхук, N–T — сопоставление (5_match.gs)

/** Тильда шлёт заявку POST-запросом: формой (x-www-form-urlencoded) или JSON. */
function doPost(e) {
  const params = drTildaParams_(e);
  if (params.test) return ContentService.createTextOutput('ok');   // проверка вебхука при подключении
  const sent = [].concat((e && e.parameters && e.parameters.key) || [], params.key || []).map(String);
  if (!drProp_('TILDA_SECRET') || sent.indexOf(drProp_('TILDA_SECRET')) < 0) return ContentService.createTextOutput('forbidden');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = drSheet_(DR_SHEETS.LEADS, DR_LEAD_HEAD), row = drLeadRow_(params, new Date());
    const ids = sh.getLastRow() > 1 ? sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); }) : [];
    if (!row[1] || ids.indexOf(String(row[1])) < 0) {   // Тильда может повторить отправку — без дублей
      sh.appendRow(row);
      sh.getRange(sh.getLastRow(), 5).setNumberFormat('@').setValue(row[4]);
    }
  } finally {
    lock.releaseLock();
  }
  return ContentService.createTextOutput('ok');
}

function doGet() { return ContentService.createTextOutput('Отчёт «Директ + Тильда»: приём заявок работает.'); }

function drTildaParams_(e) {
  const params = Object.assign({}, (e && e.parameter) || {});
  const body = e && e.postData && e.postData.contents;
  if (body && /^\s*[{[]/.test(body)) {
    try {
      const data = JSON.parse(body), obj = Array.isArray(data) ? data[0] || {} : data;
      Object.keys(obj).forEach(function (k) {
        if (k === 'key' && params.key) return;
        params[k] = obj[k] !== null && typeof obj[k] === 'object' ? JSON.stringify(obj[k]) : obj[k];
      });
    } catch (x) { /* не JSON */ }
  }
  return params;
}

/** Поля вебхука → строка «Заявок» (A–M). */
function drLeadRow_(params, at) {
  const keys = Object.keys(params).filter(function (k) { return k !== 'key'; });
  const find = function (re) { const k = keys.filter(function (x) { return re.test(x); })[0]; return k ? String(params[k]) : ''; };
  const page = String(params.landing_page || params.page_url || params.referer || params.page || params.url || '');
  const utm = drUtm_(params, page);
  const all = keys.filter(function (k) { return k !== 'COOKIES'; }).map(function (k) { return k + '=' + params[k]; }).join('; ');
  return [at, params.tranid || '', params.formname || params.formid || '', find(/^(name|имя|fio|фио)$/i),
    find(/phone|телефон|tel/i), find(/e-?mail|почта/i), utm.utm_source, utm.utm_medium, utm.utm_campaign,
    utm.utm_content, utm.utm_term, page, all.slice(0, 2000)];
}

/** UTM: поля формы utm_* → кука TILDAUTM (utm_source=x|||utm_medium=y) → параметры адреса входа. */
function drUtm_(params, page) {
  const out = { utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '' };
  const fill = function (k, v) { if (k in out && !out[k] && v) out[k] = drDecode_(v); };
  Object.keys(params).forEach(function (k) { fill(k.toLowerCase(), params[k]); });
  const m = String(params.COOKIES || params.cookies || '').match(/TILDAUTM=([^;]+)/);
  if (m) drDecode_(m[1]).split('|||').forEach(function (p) { const i = p.indexOf('='); fill(p.slice(0, i).toLowerCase(), p.slice(i + 1)); });
  const q = drQuery_(page);
  Object.keys(q).forEach(function (k) { fill(k.toLowerCase(), q[k]); });
  return out;
}

/** Параметры адреса: 'https://x.ru/?a=1&b=2' → {a: '1', b: '2'}. */
function drQuery_(url) {
  const out = {}, s = String(url || ''), i = s.indexOf('?');
  if (i < 0) return out;
  s.slice(i + 1).split('#')[0].split('&').forEach(function (p) {
    const j = p.indexOf('=');
    if (j > 0) out[drDecode_(p.slice(0, j))] = drDecode_(p.slice(j + 1));
  });
  return out;
}

function drDecode_(v) { try { return decodeURIComponent(String(v).replace(/\+/g, ' ')); } catch (e) { return String(v); } }

function drSecret_() {
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('TILDA_SECRET')) p.setProperty('TILDA_SECRET', Utilities.getUuid().replace(/-/g, ''));
  return p.getProperty('TILDA_SECRET');
}

/** Код для сайта: запоминает адрес входа по рекламной ссылке на 30 дней и кладёт его в каждую форму (landing_page). */
function drSnippet_() {
  return ['<script>', '(function () {',
    '  var ads = /[?&](utm_[a-z]+|yclid|_openstat)=/i;',
    '  function get(n) { var m = document.cookie.match("(?:^|; )" + n + "=([^;]*)"); return m ? decodeURIComponent(m[1]) : ""; }',
    '  if (ads.test(location.search) || !get("dt_landing")) document.cookie = "dt_landing=" + encodeURIComponent(location.href) + "; path=/; max-age=" + 30 * 86400;',
    '  function fill() { var f = document.querySelectorAll("form"); for (var i = 0; i < f.length; i++) {',
    '    var el = f[i].querySelector("input[name=landing_page]");',
    '    if (!el) { el = document.createElement("input"); el.type = "hidden"; el.name = "landing_page"; f[i].appendChild(el); }',
    '    el.value = get("dt_landing"); } }',
    '  document.addEventListener("DOMContentLoaded", fill);',
    '  ["mousedown", "touchstart", "keydown", "submit"].forEach(function (ev) { document.addEventListener(ev, fill, true); });',
    '})();', '</script>'].join('\n');
}

function drMenuTilda() {
  const url = ScriptApp.getService().getUrl(), key = drSecret_();
  drSheet_(DR_SHEETS.LEADS, DR_LEAD_HEAD);
  const esc = function (s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput('<div style="font:14px Arial;line-height:1.5">' +
    (url ? '<p>1. Адрес вебхука для Тильды (скопируйте целиком):</p><textarea style="width:100%;height:60px" onclick="this.select()">' +
      url + '?key=' + key + '</textarea>'
      : '<p><b>1. Сначала опубликуйте скрипт</b>: Apps Script → «Начать развертывание → Новое развертывание → Веб-приложение», ' +
        'запуск от имени «Меня», доступ «Все». Потом откройте это окно снова.</p>') +
    '<p>2. В Тильде: <b>Настройки сайта → Формы → Webhook</b> → вставьте адрес, отметьте «Передавать Cookies» → «Добавить». ' +
    'В настройках каждой формы отметьте этот Webhook.</p>' +
    '<p>3. Код для сайта — чтобы в заявку попадал адрес входа с метками Директа: <b>Настройки сайта → Ещё → ' +
    'HTML-код для вставки внутрь HEAD</b>, сохраните и опубликуйте все страницы.</p>' +
    '<textarea style="width:100%;height:150px;font:11px monospace" onclick="this.select()">' + esc(drSnippet_()) + '</textarea></div>')
    .setWidth(600).setHeight(520), 'Подключение Тильды');
}

/** Тестовая заявка — так же, как от Тильды (строку потом удалите). */
function drTestLead() {
  doPost({ parameter: { key: drSecret_(), tranid: 'test-' + Date.now(), formname: 'Тестовая заявка (удалите строку)',
    Name: 'Тест', Phone: '+7 900 000-00-00', utm_source: 'yandex', utm_campaign: 'test' } });
  drRecompute_();
  SpreadsheetApp.getActive().setActiveSheet(drSheet_(DR_SHEETS.LEADS, DR_LEAD_HEAD));
  SpreadsheetApp.getUi().alert('Тестовая заявка записана на лист «Заявки» (последняя строка).');
}
