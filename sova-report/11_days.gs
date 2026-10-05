// ---------- Перестраиваемые части: дни на листах направлений, тенденция на «Сводной» ----------
// Число строк зависит от периода (поля «Период с / по» в H3 и J3, пусто — текущий месяц),
// поэтому таблицу и графики перестраивает скрипт: при сборке отчёта, после смены дат
// в этих полях (onEdit) и после каждой загрузки данных.

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
  ss.getSheets().forEach(function (sh) { if (sbIsDirection_(sh)) sbDays_(sh); });
  if (summary && summary.getRange('G3').getValue() === 'Период с') sbTrends_(summary, sovaCabinets_());
}

/**
 * Сколько завершённых недель и месяцев показать на «Сводной»: с первого периода, где есть расход,
 * показы, клики или подписки, до последнего завершённого (как SB_LAST_WEEK / SB_LAST_MONTH).
 */
function sbTrendCounts_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SOVA.DATA_SHEET), R = sbReportDate_();
  let first = null;
  if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues().forEach(function (x) {
    if (x[0] instanceof Date && (x[2] || x[3] || x[4] || x[5]) && (!first || x[0] < first)) first = x[0];
  });
  if (!first) return { week: SB.WEEKS, month: SB.MONTHS };
  first = sbDay_(first);
  const wd = (R.getDay() + 6) % 7, lastWeek = new Date(R.getFullYear(), R.getMonth(), R.getDate() - wd - (wd < 6 ? 7 : 0));
  const firstMon = new Date(first.getFullYear(), first.getMonth(), first.getDate() - (first.getDay() + 6) % 7);
  const eom = new Date(R.getFullYear(), R.getMonth() + 1, 0).getDate() === R.getDate();
  const lastMonth = R.getFullYear() * 12 + R.getMonth() - (eom ? 0 : 1), firstMonth = first.getFullYear() * 12 + first.getMonth();
  const clamp = function (v, max) { return Math.min(Math.max(v, 1), max); };
  return { week: clamp(Math.round((lastWeek - firstMon) / (7 * SOVA_DAY_MS)) + 1, SB.WEEKS),
    month: clamp(lastMonth - firstMonth + 1, SB.MONTHS) };
}

/** Таблица «по дням» с 11-й строки и 3 графика: ровно дни периода из блока сверху (J7:K7). */
function sbDays_(sh) {
  const r = 11, p = sbPeriodDates_(sh), n = Math.min(Math.max(p.n, 1), SB.MAX_DAYS);
  sovaEnsureRows_(sh, r + 2 + n);
  sh.getRange(r, 1, sh.getMaxRows() - r + 1, 12).clear()
    .setFontFamily('Arial').setFontSize(10).setFontColor(SB.INK);
  sh.setConditionalFormatRules(sh.getConditionalFormatRules()
    .filter(function (x) { return x.getRanges()[0].getRow() < r; }));
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });
  const t = sbPeriodTable_(sh, r, 'day', '$B$3', n);
  sbChart_(sh, 'col', 'Подписки по дням (линия — тренд)', t, [7], [0, 0], [SB.SUBS], true);
  sbChart_(sh, 'col', 'Расход по дням, ₽ (линия — тренд)', t, [2], [0, 1], [SB.SPEND], true);
  sbChart_(sh, 'line', 'Цена подписки по дням, ₽', t, [8], [1, 0], [SB.COST]);
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
