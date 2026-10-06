// ---------- Перестраиваемые части листов направлений и «Сводной» ----------
// Лист направления с 11-й строки: таблица по неделям, по месяцам (постоянные — меняются только
// после загрузки данных) и по дням выбранного периода (поля «Период с / по» в H3 и J3, пусто —
// текущий месяц; перестраивается и при смене дат, onEdit). Число строк скрипт считает сам.

/** Простой триггер: изменили «Период с / по» на листе направления — перестроить дни. */
function onEdit(e) {
  const a = e && e.range;
  if (!a || a.getRow() > 3 || a.getLastRow() < 3 || a.getColumn() > 10 || a.getLastColumn() < 8) return;
  const sh = a.getSheet();
  if (sbIsDirection_(sh)) sbDays_(sh);
}

function sbIsDirection_(sh) {
  return sh.getRange('A3').getValue() === 'Направление' && sh.getRange('G3').getValue() === 'Период с';
}

/** После загрузки данных: дни на листах направлений и тенденция на «Сводной». */
function sbDaysAll_() {
  const ss = SpreadsheetApp.getActive(), summary = ss.getSheetByName(SB.SUMMARY);
  ss.getSheets().forEach(function (sh) { if (sbIsDirection_(sh)) sbDirTables_(sh); });
  if (summary && summary.getRange('G3').getValue() === 'Период с') sbTrends_(summary, sovaCabinets_());
}

/**
 * Сколько завершённых недель и месяцев показать: с первого периода, где есть расход, показы, клики
 * или подписки (но не раньше SOVA.TRENDS_FROM), до последнего завершённого (как SB_LAST_WEEK / SB_LAST_MONTH).
 * Вся история — старые недели и месяцы не уходят (предохранитель — SB.MAX_WEEKS / MAX_MONTHS).
 */
function sbTrendCounts_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SOVA.DATA_SHEET), R = sbReportDate_();
  let first = null;
  if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues().forEach(function (x) {
    if (x[0] instanceof Date && (x[2] || x[3] || x[4] || x[5]) && (!first || x[0] < first)) first = x[0];
  });
  const from = SOVA.TRENDS_FROM ? sovaParse_(SOVA.TRENDS_FROM) : null;   // не раньше этой недели
  if (from && (!first || first < from)) first = from;
  if (!first) return { week: SB.WEEKS, month: SB.MONTHS };
  first = sbDay_(first);
  const wd = (R.getDay() + 6) % 7, lastWeek = new Date(R.getFullYear(), R.getMonth(), R.getDate() - wd - (wd < 6 ? 7 : 0));
  const firstMon = new Date(first.getFullYear(), first.getMonth(), first.getDate() - (first.getDay() + 6) % 7);
  const eom = new Date(R.getFullYear(), R.getMonth() + 1, 0).getDate() === R.getDate();
  const lastMonth = R.getFullYear() * 12 + R.getMonth() - (eom ? 0 : 1), firstMonth = first.getFullYear() * 12 + first.getMonth();
  const clamp = function (v, max) { return Math.min(Math.max(v, 1), max); };
  return { week: clamp(Math.round((lastWeek - firstMon) / (7 * SOVA_DAY_MS)) + 1, SB.MAX_WEEKS || 520),
    month: clamp(lastMonth - firstMonth + 1, SB.MAX_MONTHS || 120) };
}

/** Постоянные таблицы по неделям и месяцам с 11-й строки (строка «Разница» — последний к предыдущему), затем дни. */
function sbDirTables_(sh) {
  const cnt = sbTrendCounts_();
  sbClearFrom_(sh, 11);
  let r = 11;
  [['week', 'Разница с прошлой неделей'], ['month', 'Разница с прошлым месяцем']].forEach(function (pp) {
    sovaEnsureRows_(sh, r + cnt[pp[0]] + 4);
    const t = sbPeriodTable_(sh, r, pp[0], '$B$3', cnt[pp[0]]), d = t.r2 + 1;
    sh.getRange(d, 1, 1, 9).setValues(sbLoc_([[pp[1]].concat('BCDEFGHI'.split('').map(function (L) {
      return t.r2 > t.r1 ? '=IFERROR(' + L + t.r2 + '/' + L + (t.r2 - 1) + '-1,"")' : '—';
    }))]));
    sh.getRange(d, 1, 1, 9).setBackground('#e8ecf4').setFontWeight('bold').setHorizontalAlignment('right')
      .setBorder(true, null, true, null, null, null, SB.NAVY, SpreadsheetApp.BorderStyle.SOLID);
    sh.getRange(d, 1).setHorizontalAlignment('left');
    sh.getRange(d, 2, 1, 8).setNumberFormat('0.00%');
    SB.GOOD.forEach(function (g, i) { if (g) sbUpDown_(sh, sbCol_(i + 1) + d, g); });
    r = d + 2;
  });
  sbDays_(sh, cnt);
}

/** Строка, с которой начинается таблица по дням: под таблицами по неделям и месяцам. */
function sbDayRow_(cnt) { return 11 + (cnt.week + 4) + (cnt.month + 4); }

/** Очищает лист с строки r вниз: значения, оформление, условное форматирование. */
function sbClearFrom_(sh, r) {
  sh.getRange(r, 1, sh.getMaxRows() - r + 1, 12).clear()
    .setFontFamily('Arial').setFontSize(10).setFontColor(SB.INK);
  sh.setConditionalFormatRules(sh.getConditionalFormatRules()
    .filter(function (x) { return x.getRanges()[0].getRow() < r; }));
}

/** Таблица «по дням» под таблицами по неделям и месяцам и 3 графика: ровно дни периода из блока сверху (J7:K7). */
function sbDays_(sh, cnt) {
  const r = sbDayRow_(cnt || sbTrendCounts_()), p = sbPeriodDates_(sh), n = Math.min(Math.max(p.n, 1), SB.MAX_DAYS);
  sovaEnsureRows_(sh, r + 2 + n);
  sbClearFrom_(sh, r);
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });
  const t = sbPeriodTable_(sh, r, 'day', '$B$3', n);
  sbChart_(sh, 'col', 'Подписки по дням (линия — тренд)', t, [7], [0, 0], [SB.SUBS], true);
  sbChart_(sh, 'col', 'Расход по дням, ₽ (линия — тренд)', t, [2], [1, 0], [SB.SPEND], true);
  sbChart_(sh, 'line', 'Цена подписки по дням, ₽', t, [8], [2, 0], [SB.COST]);
}

/** Даты периода, как их считают формулы J7:K7: «с» = H3 или 1-е число месяца «по», «по» = J3 или отчётная дата. */
function sbPeriodDates_(sh) {
  const v = sh.getRange('H3:J3').getValues()[0];
  const to = v[2] instanceof Date ? sbDay_(v[2]) : sbReportDate_();
  const from = v[0] instanceof Date ? sbDay_(v[0]) : new Date(to.getFullYear(), to.getMonth(), 1);
  return { from: from, to: to, n: Math.round((to - from) / SOVA_DAY_MS) + 1 };
}

/** Последний день в «Данных», а если они пусты — вчера (как в «⚙ Настройки»!F2). */
function sbReportDate_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SOVA.DATA_SHEET);
  let max = null;
  if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (x) {
    if (x[0] instanceof Date && (!max || x[0] > max)) max = x[0];
  });
  return sbDay_(max || new Date(Date.now() - SOVA_DAY_MS));
}

function sbDay_(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
