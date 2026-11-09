// ---------- Сборка листа fact ----------
// Все события в одном формате: Дата | Событие | Канал | Кампания | Кол-во | Сумма | Объект | ID ученика.
// Сводки на формулах считают только по этому листу.

function rebuildFacts() {
  const rows = buildFacts_(factsInput_(), params_());
  writeTable_(SHEETS.fact, HEAD.fact, rows);
  writeTable_(SHEETS.clients, HEAD.clients, rows.clients || []);
  sheet_(SHEETS.clients).getRange('G:G').setNumberFormat('dd.mm.yyyy');
  sheet_(SHEETS.clients).getRange('K:K').setNumberFormat('#,##0');
  return factsSummary_(rows) + matchSummary_(rows.clients || []);
}

/** Исходные листы для buildFacts_. */
function factsInput_() {
  return {
    ads: readObjects_(SHEETS.ads),
    adsManual: readObjects_(SHEETS.adsManual),
    amo: readObjects_(SHEETS.amo),
    clients: readObjects_(SHEETS.mkClients),
    visits: readObjects_(SHEETS.mkVisits),
    subs: readObjects_(SHEETS.mkSubs),
    pays: readObjects_(SHEETS.mkPays),
    tilda: readObjects_(SHEETS.tilda),
  };
}

/** Короткий итог для сообщения: период данных, расход и количество по событиям. */
function factsSummary_(rows) {
  if (!rows.length) return 'нет данных';
  const qty = {};
  let spend = 0;
  rows.forEach(r => {
    if (r[1] === EV.spend) spend += r[5];
    else qty[r[1]] = (qty[r[1]] || 0) + r[4];
  });
  const lost = rows.filter(r => [EV.spend, EV.lead, EV.adLead, EV.siteLead, EV.impr, EV.click].indexOf(r[1]) < 0 && r[2] === NO_LEAD).length;
  const siteNone = rows.filter(r => r[1] === EV.siteLead && r[2] === NO_CHANNEL).length;
  const fmt = d => pad2_(d.getDate()) + '.' + pad2_(d.getMonth() + 1) + '.' + d.getFullYear();
  return rows.length + ' строк за ' + fmt(rows[0][0]) + '–' + fmt(rows[rows.length - 1][0]) +
    '; расход ' + Math.round(spend) + ' ₽, показы ' + (qty[EV.impr] || 0) + ', клики ' + (qty[EV.click] || 0) +
    '; лиды Тильды ' + (qty[EV.siteLead] || 0) + (siteNone ? ' (из них без канала ' + siteNone + ')' : '') +
    ', сделки амо ' + (qty[EV.lead] || 0) +
    ', пробные ' + (qty[EV.trial] || 0) + ', абонементы ' + (qty[EV.sub] || 0) +
    (lost ? '; событий МК без заявки (нет телефона в амо и Тильде): ' + lost : '');
}

/**
 * Канал заявки Тильды: UTM → метка клика / адрес страницы → сделка амо с тем же телефоном (±1,5 дня).
 * ctx: { p, campaigns, amoByPhone }. how — чем определён канал (для отладки).
 */
function tildaChannel_(row, phone, ctx) {
  const t = Object.assign({}, row);
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(k => { t[k] = cleanUtm_(t[k]); });
  let how = t['utm_source'] ? 'UTM' : '';
  // Старые заявки без UTM: метки из адреса страницы или метка клика (yclid → Яндекс Директ)
  if (!how) {
    const found = clickSource_(String(t['Страница'] || '') + ' ' + String(t['Все поля'] || ''));
    Object.keys(found).forEach(k => { if (!t[k]) t[k] = found[k]; });
    if (t['utm_source']) how = 'метка клика / адрес страницы';
  }
  // Всё ещё без меток — берём источник сделки амо с тем же телефоном
  let dealCh = '';
  if (!how && phone && ctx.amoByPhone[phone]) {
    const day = day_(t['Получена']);
    const near = ctx.amoByPhone[phone]
      .filter(x => x.day && day && Math.abs(x.day - day) <= 1.5 * DAY_MS)
      .sort((x, y) => Math.abs(x.day - day) - Math.abs(y.day - day))[0];
    if (near) {
      how = 'сделка амо';
      if (near.tagCh) dealCh = near.tagCh;
      else Object.keys(near.utm).forEach(k => { if (!t[k]) t[k] = near.utm[k] || ''; });
    }
  }
  const utmCampaign = String(t['utm_campaign'] || '');
  const camp = ctx.campaigns[lc_(utmCampaign)] || utmCampaign;
  const ch = dealCh || matchRule_(ctx.p.rules, {
    utm_source: t['utm_source'], utm_medium: t['utm_medium'], utm_campaign: t['utm_campaign'],
    utm_content: t['utm_content'], utm_term: t['utm_term'], форма: t['Форма'], страница: t['Страница'],
    кампания: camp,
  }) || String(t['utm_source'] || '') || NO_CHANNEL;
  return { ch: ch, camp: camp, how: ch === NO_CHANNEL ? 'не определён' : (how || 'правило по форме / странице') };
}

/** Время получения заявки (мс) для сортировки и поиска повторов. */
function tildaTime_(v) {
  if (v instanceof Date) return v.getTime();
  const d = day_(v);
  return d ? d.getTime() : 0;
}

/** «; ученики сопоставлены с заявками: 12 из 15 (80%)» */
function matchSummary_(clients) {
  if (!clients.length) return '';
  const ok = clients.filter(c => c[5] !== 'нет').length;
  return '; ученики сопоставлены с заявками: ' + ok + ' из ' + clients.length +
    ' (' + Math.round(ok * 100 / clients.length) + '%)';
}

/** Первое подходящее правило {field, contains, channel} или ''. */
function matchRule_(rules, fields) {
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    const v = fields[r.field];
    if (r.contains && v != null && ruleHit_(lc_(v), r.contains)) return r.channel;
  }
  return '';
}

/**
 * Короткие образцы (до 3 символов: «vk», «tg», «ya») ищутся только в начале слова —
 * иначе «tg» срабатывает на «chatgpt». Длинные — как раньше, в любом месте.
 */
function ruleHit_(value, pattern) {
  if (pattern.length > 3) return value.indexOf(pattern) >= 0;
  return value.split(/[^a-zа-яё0-9]+/i).some(w => w.indexOf(pattern) === 0);
}

/** Тип проданного абонемента: по правилам «название содержит», иначе 1 занятие — разовая. */
function subType_(name, visits, rules) {
  const n = lc_(name);
  for (let i = 0; i < rules.length; i++) {
    if (rules[i].contains && n.indexOf(rules[i].contains) >= 0) return rules[i].type;
  }
  return num_(visits) === 1 ? 'разовая' : 'абонемент';
}

function buildFacts_(d, p) {
  const out = [];
  const push = (date, ev, ch, camp, qty, sum, obj, client) => {
    const day = day_(date);
    if (day) out.push([day, ev, ch || NO_CHANNEL, camp || '', qty, sum, obj == null ? '' : String(obj), client == null ? '' : client]);
  };

  // 1. Расходы. Заодно собираем справочник кампаний, чтобы utm_campaign
  //    (ID или название) приводить к названию кампании из кабинета.
  const campaigns = {};
  d.ads.forEach(a => {
    const name = String(a['Кампания'] || a['ID кампании'] || '');
    campaigns[lc_(a['ID кампании'])] = name;
    campaigns[lc_(name)] = name;
    const ch = matchRule_(p.rules, {
      площадка: a['Площадка'], кабинет: a['Кабинет'], кампания: name, 'id кампании': a['ID кампании'],
    }) || a['Площадка'];
    push(a['Дата'], EV.spend, ch, name, 0, num_(a['Расход']), a['ID кампании'], '');
    // Показы и клики — из кабинета; лиды считаются по заявкам Тильды
    const impr = num_(a['Показы']), clicks = num_(a['Клики']);
    if (impr) push(a['Дата'], EV.impr, ch, name, impr, 0, a['ID кампании'], '');
    if (clicks) push(a['Дата'], EV.click, ch, name, clicks, 0, a['ID кампании'], '');
    const adLeads = num_(a['Лиды (кабинет)']);
    if (adLeads) push(a['Дата'], EV.adLead, ch, name, adLeads, 0, a['ID кампании'], '');
  });
  d.adsManual.forEach(a => push(a['Дата'], EV.spend, a['Канал'], a['Кампания'], 0, num_(a['Расход']), '', ''));

  // 2. Лиды амо. Канал клиента — первая по дате сделка с его телефоном,
  //    у которой канал определён (first touch).
  const pipes = list_(p.AMO_PIPELINES);
  const skip = list_(p.AMO_EXCLUDE_STATUSES);
  const byPhone = {};
  const amoByPhone = {}; // телефон → сделки амо: чтобы подставить источник заявке Тильды без меток
  const sourceTags = sourceTagSet_(p);
  const unknownTag = lc_(p.AMO_UNKNOWN_TAG);
  d.amo
    .filter(l => (!pipes.length || pipes.indexOf(lc_(l['Воронка'])) >= 0) && skip.indexOf(lc_(l['Статус'])) < 0)
    .sort((a, b) => (dayKey_(a['Создана']) + a['ID сделки']) < (dayKey_(b['Создана']) + b['ID сделки']) ? -1 : 1)
    .forEach(row => {
      // Нет UTM в полях — ищем метки в названии сделки («Lead from: адрес страницы» от Тильды)
      const l = Object.assign({}, row);
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(k => { l[k] = cleanUtm_(l[k]); });
      if (!l['utm_source']) {
        const found = clickSource_(String(l['Название'] || ''));
        Object.keys(found).forEach(k => { if (!l[k]) l[k] = found[k]; });
      }
      const utmCampaign = String(l['utm_campaign'] || '');
      const camp = campaigns[lc_(utmCampaign)] || utmCampaign;
      // Тег источника, который поставил скрипт (или менеджер), важнее правил
      const tagCh = String(l['Теги'] || '').split(',').map(x => x.trim())
        .filter(x => sourceTags[lc_(x)] && lc_(x) !== unknownTag)[0];
      const ch = tagCh || matchRule_(p.rules, {
        utm_source: l['utm_source'], utm_medium: l['utm_medium'], utm_campaign: l['utm_campaign'],
        utm_content: l['utm_content'], utm_term: l['utm_term'], источник: l['Источник'], теги: l['Теги'],
        воронка: l['Воронка'], статус: l['Статус'], 'название сделки': l['Название'], кампания: camp,
      }) || String(l['utm_source'] || '') || NO_CHANNEL;
      push(l['Создана'], EV.lead, ch, camp, 1, 0, l['ID сделки'], '');
      const phone = normalizePhone_(l['Телефон']);
      if (phone) {
        (amoByPhone[phone] = amoByPhone[phone] || []).push({ day: day_(l['Создана']), ch: ch, tagCh: tagCh || '', camp: camp,
          utm: { utm_source: l['utm_source'], utm_medium: l['utm_medium'], utm_campaign: l['utm_campaign'],
            utm_content: l['utm_content'], utm_term: l['utm_term'] } });
      }
      if (phone && (!byPhone[phone] || byPhone[phone].ch === NO_CHANNEL)) {
        byPhone[phone] = { ch: ch, camp: camp, via: 'амо, сделка ' + l['ID сделки'], date: day_(l['Создана']) };
      }
    });

  // 2б. Заявки с сайта (Тильда). Если по телефону ещё нет сделки амо с каналом,
  //     канал клиента берётся из его первой заявки.
  const ctx = { p: p, campaigns: campaigns, amoByPhone: amoByPhone };
  const siteLeads = []; // для отладки: как определён канал каждой заявки
  const lastSiteLead = {}; // телефон → время последней учтённой заявки (повторы за сутки не считаем)
  (d.tilda || [])
    .slice()
    .sort((a, b) => tildaTime_(a['Получена']) - tildaTime_(b['Получена']))
    .forEach(row => {
      const phone = normalizePhone_(row['Телефон']);
      const time = tildaTime_(row['Получена']);
      // Повторная отправка формы тем же человеком в течение суток — та же заявка
      if (phone && lastSiteLead[phone] != null && time - lastSiteLead[phone] < DAY_MS) return;
      if (phone) lastSiteLead[phone] = time;

      const r = tildaChannel_(row, phone, ctx);
      const ch = r.ch, camp = r.camp;
      siteLeads.push({ row: row, ch: ch, how: r.how });
      push(row['Получена'], EV.siteLead, ch, camp, 1, 0, row['ID заявки'], '');
      if (phone && (!byPhone[phone] || byPhone[phone].ch === NO_CHANNEL)) {
        byPhone[phone] = { ch: ch, camp: camp, via: 'Тильда, заявка ' + (row['ID заявки'] || ''), date: day_(row['Получена']) };
      }
    });

  // 3. Ученики Мой Класс наследуют канал сделки или заявки по телефону
  const src = {};
  const none = { ch: NO_LEAD, camp: '', via: 'нет', date: '' };
  d.clients.forEach(c => {
    src[String(c['ID ученика'])] = byPhone[normalizePhone_(c['Телефон'])] || none;
  });
  const of = id => src[String(id)] || { ch: NO_LEAD, camp: '' };

  // Рекламные каналы: с расходом в кабинетах / ручном листе или из правил «Настроек».
  // Органика, «Без заявки», «Не определён» и «Источник не определён» — не реклама.
  const adChannels = {};
  out.forEach(r => { if (r[1] === EV.spend) adChannels[lc_(r[2])] = true; });
  p.rules.forEach(r => { adChannels[lc_(r.channel)] = true; });
  ['VK Реклама', 'Яндекс Директ', 'Авито', 'Google Ads', 'Facebook / Instagram'].forEach(c => { adChannels[lc_(c)] = true; });
  Object.keys(ORGANIC).map(k => ORGANIC[k]).concat(NO_LEAD, NO_CHANNEL, p.AMO_UNKNOWN_TAG || '')
    .forEach(c => { delete adChannels[lc_(c)]; });
  const onlyAds = bool_(p.MK_ONLY_ADS);
  // События Мой Класс: в fact — только рекламные (если MK_ONLY_ADS), в «Клиенты_каналы» — все
  const stat = {};
  const mkPush = (date, ev, s, qty, sum, obj, client) => {
    const st = stat[String(client)] = stat[String(client)] || { trial: 0, repeat: 0, sub: 0, pay: 0 };
    if (ev === EV.trial) st.trial += qty;
    if (ev === EV.repeat) st.repeat += qty;
    if (ev === EV.sub) st.sub += qty;
    if (ev === EV.pay) st.pay += sum;
    if (!onlyAds || adChannels[lc_(s.ch)]) push(date, ev, s.ch, s.camp, qty, sum, obj, client);
  };

  d.visits.forEach(v => {
    if (!bool_(v['Пробное']) || !bool_(v['Пришёл'])) return;
    const s = of(v['ID ученика']);
    mkPush(v['Дата'], EV.trial, s, 1, 0, v['ID записи'], v['ID ученика']);
  });

  d.subs.forEach(x => {
    const type = subType_(x['Абонемент'], x['Занятий'], p.subRules);
    const ev = type === 'разовая' ? EV.repeat : type === 'абонемент' ? EV.sub : null;
    if (!ev) return;
    const s = of(x['ID ученика']);
    mkPush(x['Дата продажи'], ev, s, 1, num_(x['Цена']), x['ID'], x['ID ученика']);
  });

  // 4. Выручка — фактические платежи: приход минус возвраты
  const income = list_(p.MK_INCOME);
  const refund = list_(p.MK_REFUND);
  d.pays.forEach(x => {
    const t = lc_(x['Тип операции']);
    const sign = income.indexOf(t) >= 0 ? 1 : refund.indexOf(t) >= 0 ? -1 : 0;
    if (!sign) return;
    const s = of(x['ID ученика']);
    mkPush(x['Дата'], EV.pay, s, sign, sign * Math.abs(num_(x['Сумма'])), x['ID'], x['ID ученика']);
  });

  out.sort((a, b) => a[0] - b[0]);

  // Лист «Клиенты_каналы»: как каждый ученик сопоставлен с заявкой и что он купил (все ученики)
  out.clients = d.clients.map(c => {
    const id = String(c['ID ученика']);
    const m = src[id] || none;
    const s = stat[id] || { trial: 0, repeat: 0, sub: 0, pay: 0 };
    return [c['ID ученика'], c['Имя'] || '', normalizePhone_(c['Телефон']), m.ch, m.camp, m.via, m.date || '',
      s.trial, s.repeat, s.sub, s.pay, adChannels[lc_(m.ch)] ? 'да' : 'нет'];
  }).filter(r => r[7] || r[8] || r[9] || r[10]) // только ученики, у которых есть события
    .sort((a, b) => b[10] - a[10]);
  out.siteLeads = siteLeads;
  return out;
}
