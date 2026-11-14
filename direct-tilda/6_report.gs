// ---------- Пересчёт отчёта за период («Сводная») ----------
// Период — «Сводная»: B3 «с» (пусто — с 1-го числа месяца), D3 «по» (по умолчанию вчера). Цифры считает скрипт:
// при смене дат (onEdit), после загрузки Директа и пунктом меню «Пересчитать отчёт».

const DR_METRICS = ['Расход', 'Расход с НДС', 'Показы', 'Клики', 'CTR', 'CPC', 'Заявки', 'Цена заявки', 'CR в заявку'];
const DR_FMT = ['#,##0" ₽"', '#,##0" ₽"', '#,##0', '#,##0', '0.00%', '#,##0.0" ₽"', '#,##0', '#,##0" ₽"', '0.0%'];

/** Период из «Сводной»: {from, to} 'yyyy-MM-dd'. */
function drPeriod_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(DR_SHEETS.SUMMARY);
  const v = sh ? sh.getRange('B3:D3').getValues()[0] : ['', '', ''];
  const to = drKey_(v[2]) || drYesterday_(), from = drKey_(v[0]) || to.slice(0, 8) + '01';
  return from <= to ? { from: from, to: to } : { from: to, to: from };
}

/** Метрики строки: расход, показы, клики, заявки → 9 колонок DR_METRICS. */
function drM_(sp, sh, cl, ld) {
  const div = function (a, b) { return b ? a / b : ''; };
  return [sp, sp * (100 + DR.VAT_PERCENT) / 100, sh, cl, div(cl, sh), div(sp, cl), ld, div(sp, ld), div(ld, cl)];
}

/** Пересчёт: сопоставление заявок, итоги за период, листы отчёта. */
function drRecompute_() {
  const p = drPeriod_(), len = drDays_(p.from, p.to);
  const prev = { from: drAddDays_(p.from, -len), to: drAddDays_(p.from, -1) };
  const data = drRows_(DR_SHEETS.DATA, DR_DATA_HEAD.length).map(function (r) {
    return { day: drKey_(r[0]), c: r[1], cn: r[2], g: r[3], gn: r[4], a: r[5], sh: drNum_(r[6]), cl: drNum_(r[7]), sp: drNum_(r[8]) };
  }).filter(function (r) { return r.day; });
  const leads = drMatchAll_();
  const inP = function (x, q) { return x.day >= q.from && x.day <= q.to; };
  const cur = { data: data.filter(function (x) { return inP(x, p); }), leads: leads.filter(function (x) { return inP(x, p); }) };
  const old = { data: data.filter(function (x) { return inP(x, prev); }), leads: leads.filter(function (x) { return inP(x, prev); }) };
  drSummary_(p, prev, cur, old);
  drTables_(p, cur);
  return { leads: cur.leads.length };
}

function drTotals_(set) {
  const t = set.data.reduce(function (s, x) { s[0] += x.sp; s[1] += x.sh; s[2] += x.cl; return s; }, [0, 0, 0]);
  return drM_(t[0], t[1], t[2], set.leads.filter(function (x) { return x.m[0] === 'Директ'; }).length);
}

function drSummary_(p, prev, cur, old) {
  const sh = drSheet_(DR_SHEETS.SUMMARY);
  sh.getRange('A2').setValue('Отчёт за ' + drRu_(p.from) + ' — ' + drRu_(p.to) + ' · заявки — из Директа (по меткам), ' +
    'расход без НДС; сравнение — с предыдущим периодом той же длины');
  drClearFrom_(sh, 5, 12);
  sh.getRange('A5').setValue('Итоги за период').setFontWeight('bold').setFontSize(12);
  drHead_(sh, 6, ['Период'].concat(DR_METRICS, ['с', 'по']));
  const a = drTotals_(cur), b = drTotals_(old);
  drWrite_(sh, 7, [['Выбранный период'].concat(a, [drDate_(p.from), drDate_(p.to)]),
    ['Предыдущий, той же длины'].concat(b, [drDate_(prev.from), drDate_(prev.to)])], [null].concat(DR_FMT, ['dd.MM.yyyy', 'dd.MM.yyyy']));
  drWrite_(sh, 9, [['Изменение'].concat(a.map(function (v, i) { return b[i] && v !== '' ? v / b[i] - 1 : ''; }), ['', ''])],
    [null].concat(DR_FMT.map(function () { return '"▲ "0%;"▼ "0%;0%'; })));
  sh.getRange(7, 1, 1, 12).setFontWeight('bold').setFontSize(12);
  sh.getRange(8, 1, 2, 12).setFontColor('#6b7280');

  const L = cur.leads, cnt = function (f) { return L.filter(f).length; };
  const dir = function (x) { return x.m[0] === 'Директ'; };
  const src = [
    ['Директ → до объявления', cnt(function (x) { return dir(x) && x.m[5]; })],
    ['Директ → до группы', cnt(function (x) { return dir(x) && !x.m[5] && x.m[3]; })],
    ['Директ → только кампания', cnt(function (x) { return dir(x) && !x.m[3] && x.m[1]; })],
    ['Директ → не сопоставлено (см. «Заявки», «Сопоставление меток»)', cnt(function (x) { return dir(x) && !x.m[1]; })],
    ['Другие источники', cnt(function (x) { return /^Другой/.test(x.m[0]); })],
    ['Без меток', cnt(function (x) { return x.m[0] === 'Без меток'; })],
  ];
  src.push(['Всего заявок с сайта', L.length]);
  sh.getRange('A11').setValue('Заявки за период по источникам').setFontWeight('bold').setFontSize(12);
  drHead_(sh, 12, ['Источник', 'Заявок', 'Доля']);
  drWrite_(sh, 13, src.map(function (s) { return [s[0], s[1], L.length ? s[1] / L.length : '']; }), [null, '#,##0', '0%']);
  sh.getRange(13 + src.length - 1, 1, 1, 3).setFontWeight('bold');

  const r0 = 13 + src.length + 1, days = [];
  for (let d = p.from; d <= p.to; d = drAddDays_(d, 1)) {
    const one = function (x) { return x.day === d; };
    days.push([drDate_(d)].concat(drTotals_({ data: cur.data.filter(one), leads: cur.leads.filter(one) })));
  }
  sh.getRange(r0, 1).setValue('По дням').setFontWeight('bold').setFontSize(12);
  drHead_(sh, r0 + 1, ['День'].concat(DR_METRICS));
  drWrite_(sh, r0 + 2, days, ['dd.MM.yyyy ddd'].concat(DR_FMT));
}
