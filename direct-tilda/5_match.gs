// ---------- Сопоставление заявок с кампанией, группой и объявлением Директа ----------
// По порядку, первое сработавшее:
//   1. правило с листа «Сопоставление меток» (метка равна / содержит значение → ID кампании, группы или объявления);
//   2. ID: в метках или в адресе входа есть номер объявления, группы или кампании из Директа;
//   3. название: utm_campaign = название кампании; метка = название группы.
// Объявление определяет свою группу и кампанию, группа — кампанию (по «Данным Директа» и «Текстам объявлений»).

const DR_RULE_HEAD = ['Метка', 'Условие', 'Значение', 'ID кампании', 'ID группы', 'ID объявления', 'Комментарий'];
const DR_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

/** Справочник Директа: объявление → группа → кампания, названия. */
function drDict_() {
  const d = { ads: {}, groups: {}, camps: {}, campByName: {}, groupByName: {} };
  const add = function (c, cn, g, gn, a) {
    if (c) { if (cn || !d.camps[c]) d.camps[c] = cn || d.camps[c] || ''; }
    if (g) { d.groups[g] = { c: c || (d.groups[g] || {}).c, name: gn || (d.groups[g] || {}).name || '' }; }
    if (a) d.ads[a] = { g: g || (d.ads[a] || {}).g, c: c || (d.ads[a] || {}).c };
  };
  drRows_(DR_SHEETS.TEXTS, 3).forEach(function (r) { add(r[2], '', r[1], '', r[0]); });
  drRows_(DR_SHEETS.DATA, 6).forEach(function (r) { add(r[1], r[2], r[3], r[4], r[5]); });
  Object.keys(d.camps).forEach(function (c) { d.campByName[drNorm_(d.camps[c])] = c; });
  Object.keys(d.groups).forEach(function (g) {
    const k = drNorm_(d.groups[g].name);
    if (k) (d.groupByName[k] = d.groupByName[k] || []).push(g);
  });
  return d;
}

function drNorm_(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

/** Правила с листа «Сопоставление меток» (пустые строки пропускаются). */
function drRules_() {
  return drRows_(DR_SHEETS.RULES, DR_RULE_HEAD.length).map(function (r, i) {
    return { row: i + 2, field: drNorm_(r[0]), op: drNorm_(r[1]), value: drNorm_(r[2]), c: r[3], g: r[4], a: r[5] };
  }).filter(function (r) { return r.field && r.value && (r.c || r.g || r.a); });
}

/** Заявка (строка «Заявок» A–M) → [Источник, ID кампании, Кампания, ID группы, Группа, ID объявления, Как сопоставлено]. */
function drMatch_(lead, d, rules) {
  const utm = {}, page = String(lead[11] || '');
  DR_FIELDS.forEach(function (f, i) { utm[f] = String(lead[6 + i] || ''); });
  const q = drQuery_(page);
  let hit = null;
  rules.some(function (r) {   // 1. правила
    const vals = r.field === 'любая' ? DR_FIELDS.map(function (f) { return utm[f]; }).concat(page)
      : [r.field === 'страница входа' ? page : utm[r.field] || ''];
    const ok = vals.some(function (v) { v = drNorm_(v); return r.op === 'содержит' ? v.indexOf(r.value) >= 0 : v === r.value; });
    if (ok) hit = { a: r.a, g: r.g, c: r.c, how: 'правило (строка ' + r.row + ')' };
    return ok;
  });
  if (!hit) {   // 2. ID в метках и адресе входа (кроме служебных меток клика)
    const text = DR_FIELDS.map(function (f) { return utm[f]; }).concat(Object.keys(q).filter(function (k) {
      return !/^(yclid|ybaip|_openstat|gclid|fbclid|ym_|_ym)/i.test(k);
    }).map(function (k) { return q[k]; })).join(' ');
    const nums = text.match(/\d{5,}/g) || [];
    const find = function (map) { return nums.filter(function (n) { return map[n]; })[0]; };
    const a = find(d.ads), g = !a && find(d.groups), c = !a && !g && find(d.camps);
    if (a || g || c) hit = { a: a, g: g, c: c, how: a ? 'ID объявления' : g ? 'ID группы' : 'ID кампании' };
  }
  if (!hit) {   // 3. названия
    const c = d.campByName[drNorm_(utm.utm_campaign)];
    const gs = [utm.utm_content, utm.utm_term, utm.utm_campaign].map(function (v) { return d.groupByName[drNorm_(v)] || []; })
      .reduce(function (x, y) { return x.concat(y); }, []).filter(function (g) { return !c || String(d.groups[g].c) === String(c); });
    if (gs.length === 1) hit = { g: gs[0], how: 'название группы' };
    else if (c) hit = { c: c, how: 'название кампании' };
  }
  const direct = new RegExp(DR.DIRECT_SOURCE, 'i').test(utm.utm_source) || /[?&]yclid=/i.test(page) || /yclid=/i.test(lead[12] || '');
  if (!hit) return [direct ? 'Директ' : utm.utm_source ? 'Другой источник: ' + utm.utm_source : 'Без меток', '', '', '', '', '',
    direct ? 'не сопоставлено' : ''];
  const ad = hit.a && d.ads[hit.a] || {};
  const g = hit.g || ad.g || '', grp = g && d.groups[g] || {};
  const c = hit.c || ad.c || grp.c || '';
  return ['Директ', c ? +c : '', c ? d.camps[c] || '' : '', g ? +g : '', grp.name || '', hit.a ? +hit.a : '', hit.how];
}

/** Сопоставляет все заявки и пишет N–T «Заявок». Возвращает заявки с датой: [{day, m: результат}]. */
function drMatchAll_() {
  const sh = drSheet_(DR_SHEETS.LEADS, DR_LEAD_HEAD), d = drDict_(), rules = drRules_();
  const rows = drRows_(DR_SHEETS.LEADS, DR_LEAD_RAW);
  const res = rows.map(function (r) { return drMatch_(r, d, rules); });
  if (res.length) sh.getRange(2, DR_LEAD_RAW + 1, res.length, 7).setValues(res);
  return rows.map(function (r, i) { return { day: drKey_(r[0]), m: res[i] }; }).filter(function (x) { return x.day; });
}
