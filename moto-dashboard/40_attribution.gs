// ---------- Сборка листа fact ----------
// Все события в одном формате: Дата | Событие | Канал | Кампания | Кол-во | Сумма | Объект | ID ученика.
// Сводки на формулах считают только по этому листу.

function rebuildFacts() {
  const d = {
    ads: readObjects_(SHEETS.ads),
    adsManual: readObjects_(SHEETS.adsManual),
    amo: readObjects_(SHEETS.amo),
    clients: readObjects_(SHEETS.mkClients),
    visits: readObjects_(SHEETS.mkVisits),
    subs: readObjects_(SHEETS.mkSubs),
    pays: readObjects_(SHEETS.mkPays),
  };
  const rows = buildFacts_(d, params_());
  writeTable_(SHEETS.fact, HEAD.fact, rows);
  return factsSummary_(rows);
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
  const lost = rows.filter(r => r[1] !== EV.spend && r[1] !== EV.lead && r[1] !== EV.adLead && r[2] === NO_LEAD).length;
  const fmt = d => pad2_(d.getDate()) + '.' + pad2_(d.getMonth() + 1) + '.' + d.getFullYear();
  return rows.length + ' строк за ' + fmt(rows[0][0]) + '–' + fmt(rows[rows.length - 1][0]) +
    '; расход ' + Math.round(spend) + ' ₽' +
    '; лиды (кабинет) ' + (qty[EV.adLead] || 0) + ', лиды (CRM) ' + (qty[EV.lead] || 0) +
    ', пробные ' + (qty[EV.trial] || 0) + ', абонементы ' + (qty[EV.sub] || 0) +
    (lost ? '; событий МК без заявки в амо: ' + lost : '');
}

/** Первое подходящее правило {field, contains, channel} или ''. */
function matchRule_(rules, fields) {
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    const v = fields[r.field];
    if (r.contains && v != null && lc_(v).indexOf(r.contains) >= 0) return r.channel;
  }
  return '';
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
    const adLeads = num_(a['Лиды (кабинет)']);
    if (adLeads) push(a['Дата'], EV.adLead, ch, name, adLeads, 0, a['ID кампании'], '');
  });
  d.adsManual.forEach(a => push(a['Дата'], EV.spend, a['Канал'], a['Кампания'], 0, num_(a['Расход']), '', ''));

  // 2. Лиды амо. Канал клиента — первая по дате сделка с его телефоном,
  //    у которой канал определён (first touch).
  const pipes = list_(p.AMO_PIPELINES);
  const skip = list_(p.AMO_EXCLUDE_STATUSES);
  const byPhone = {};
  d.amo
    .filter(l => (!pipes.length || pipes.indexOf(lc_(l['Воронка'])) >= 0) && skip.indexOf(lc_(l['Статус'])) < 0)
    .sort((a, b) => (dayKey_(a['Создана']) + a['ID сделки']) < (dayKey_(b['Создана']) + b['ID сделки']) ? -1 : 1)
    .forEach(l => {
      const utmCampaign = String(l['utm_campaign'] || '');
      const camp = campaigns[lc_(utmCampaign)] || utmCampaign;
      const ch = matchRule_(p.rules, {
        utm_source: l['utm_source'], utm_medium: l['utm_medium'], utm_campaign: l['utm_campaign'],
        utm_content: l['utm_content'], utm_term: l['utm_term'], источник: l['Источник'], теги: l['Теги'],
        воронка: l['Воронка'], статус: l['Статус'], 'название сделки': l['Название'], кампания: camp,
      }) || String(l['utm_source'] || '') || NO_CHANNEL;
      push(l['Создана'], EV.lead, ch, camp, 1, 0, l['ID сделки'], '');
      const phone = normalizePhone_(l['Телефон']);
      if (phone && (!byPhone[phone] || byPhone[phone].ch === NO_CHANNEL)) byPhone[phone] = { ch: ch, camp: camp };
    });

  // 3. Ученики Мой Класс наследуют канал сделки по телефону
  const src = {};
  d.clients.forEach(c => {
    src[String(c['ID ученика'])] = byPhone[normalizePhone_(c['Телефон'])] || { ch: NO_LEAD, camp: '' };
  });
  const of = id => src[String(id)] || { ch: NO_LEAD, camp: '' };

  d.visits.forEach(v => {
    if (!bool_(v['Пробное']) || !bool_(v['Пришёл'])) return;
    const s = of(v['ID ученика']);
    push(v['Дата'], EV.trial, s.ch, s.camp, 1, 0, v['ID записи'], v['ID ученика']);
  });

  d.subs.forEach(x => {
    const type = subType_(x['Абонемент'], x['Занятий'], p.subRules);
    const ev = type === 'разовая' ? EV.repeat : type === 'абонемент' ? EV.sub : null;
    if (!ev) return;
    const s = of(x['ID ученика']);
    push(x['Дата продажи'], ev, s.ch, s.camp, 1, num_(x['Цена']), x['ID'], x['ID ученика']);
  });

  // 4. Выручка — фактические платежи: приход минус возвраты
  const income = list_(p.MK_INCOME);
  const refund = list_(p.MK_REFUND);
  d.pays.forEach(x => {
    const t = lc_(x['Тип операции']);
    const sign = income.indexOf(t) >= 0 ? 1 : refund.indexOf(t) >= 0 ? -1 : 0;
    if (!sign) return;
    const s = of(x['ID ученика']);
    push(x['Дата'], EV.pay, s.ch, s.camp, sign, sign * Math.abs(num_(x['Сумма'])), x['ID'], x['ID ученика']);
  });

  return out.sort((a, b) => a[0] - b[0]);
}
