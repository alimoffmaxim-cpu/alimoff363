// ---------- Построение отчёта: листы «Сводная», направлений, графики и демо-данные ----------

function sbSummary_(ss, cabs, period) {
  const sh = ss.insertSheet(SB.SUMMARY, 0), n = cabs.length;
  sbSetup_(sh, SB.NAVY, SB.WIDTHS);
  sbBanner_(sh, 'Сова · Сводная по всем направлениям', '="Все кабинеты VK Реклама клиники · данные по "&TEXT($E$3,"DD.MM.YYYY")');
  sbTopInfo_(sh, null);
  sbPeriodInputs_(sh, period || []);
  let r = sbKpi_(sh, 5, null, true);   // строка «Этот месяц» — 7-я, её даты в J7:K7

  sh.getRange(r, 1).setValue(sbLocF_('="🏥 Направления за "&TEXT($J$7,"DD.MM.YYYY")&" — "&TEXT($K$7,"DD.MM.YYYY")&" (те же даты, что выше)"'))
    .setFontSize(12).setFontWeight('bold');
  sbHeader_(sh, r + 1, ['Направление'].concat(SB.COLS.slice(1), ['Доля расхода']));
  const t1 = r + 2, tt = t1 + n, d = sbDerived_(tt);
  const sum = function (L) { return '=SUM(' + L + t1 + ':' + L + (tt - 1) + ')'; };
  const rows = cabs.map(function (c, j) {
    const rr = t1 + j;
    return ['=' + SB.SET + '!$A$' + c.row].concat(sbMetrics_(rr, '$J$7', '$K$7', '$A' + rr), ['=IFERROR(B' + rr + '/$B$' + tt + ',"")']);
  });
  rows.push(['Итого', sum('B'), sum('C'), sum('D'), d[0], d[1], sum('G'), d[2], d[3], '=IFERROR(B' + tt + '/$B$' + tt + ',"")']);
  sh.getRange(t1, 1, n + 1, 10).setValues(sbLoc_(rows));
  sbBody_(sh, t1, tt, SB.FMT.concat(['0%']), tt);
  sbChartsHeading_(sh, '📈 Подписки и расход по неделям и месяцам (завершённые периоды)');
  sbTrends_(sh, cabs);   // со строки tt + 2 = 15 + число направлений
  sh.setFrozenRows(3);
}

/**
 * Тенденция на «Сводной»: подписки, цена подписки и расход по неделям и месяцам и 6 графиков.
 * Недели и месяцы — с первого, где есть данные, до последнего завершённого (не больше 26 и 12),
 * поэтому блок перестраивается после каждой загрузки (sbDaysAll_).
 */
function sbTrends_(sh, cabs) {
  const n = cabs.length, cnt = sbTrendCounts_();
  let r = 15 + n;
  sh.getRange(r, 1, sh.getMaxRows() - r + 1, sh.getMaxColumns()).clear()
    .setFontFamily('Arial').setFontSize(10).setFontColor(SB.INK);
  sh.setConditionalFormatRules(sh.getConditionalFormatRules()
    .filter(function (x) { return x.getRanges()[0].getRow() < r; }));
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });
  const subs = {}, spend = {};
  [['week', 'неделям'], ['month', 'месяцам']].forEach(function (pp) {
    const c = cnt[pp[0]], len = c + 3;   // высота таблицы с заголовком и отступом
    sovaEnsureRows_(sh, r + 3 * len + 2);
    const s = sbPivot_(sh, r, '🧭 Подписки по направлениям, по ' + pp[1], 'subs', pp[0], cabs, null, c);
    sbPivot_(sh, s.next, 'Цена подписки по направлениям, по ' + pp[1], 'cost', pp[0], cabs, { s1: s.r1, e1: s.next + len + 2 }, c);
    spend[pp[0]] = sbPivot_(sh, s.next + len, 'Расход по направлениям, по ' + pp[1], 'spend', pp[0], cabs, null, c);
    r = spend[pp[0]].next;
    subs[pp[0]] = s;
  });
  // Графики в одну колонку справа от таблиц (видно без прокрутки вбок): под подписками — расход за те же периоды
  const w = subs.week, m = subs.month, colors = cabs.map(function (c) { return c.color; });
  sbChart_(sh, 'col', 'Подписки по неделям — вся клиника (линия — тренд)', w, [n + 2], [0, 0], [SB.SUBS], true);
  sbChart_(sh, 'col', 'Расход по неделям — вся клиника, ₽ (линия — тренд)', spend.week, [n + 2], [1, 0], [SB.SPEND], true);
  sbChart_(sh, 'col', 'Подписки по месяцам — вся клиника (линия — тренд)', m, [n + 2], [2, 0], [SB.SUBS], true);
  sbChart_(sh, 'col', 'Расход по месяцам — вся клиника, ₽ (линия — тренд)', spend.month, [n + 2], [3, 0], [SB.SPEND], true);
  sbChart_(sh, 'line', 'Подписки по неделям по направлениям', w, [2, n], [4, 0], colors);
  sbChart_(sh, 'line', 'Подписки по месяцам по направлениям', m, [2, n], [5, 0], colors);
}

function sbDirection_(ss, cab, index, period) {
  const sh = ss.insertSheet(cab.name, index);
  sbSetup_(sh, cab.color, SB.WIDTHS);
  sbBanner_(sh, '="Сова · "&$B$3', '="Итоги всех кампаний кабинета VK Реклама · данные по "&TEXT($E$3,"DD.MM.YYYY")');
  sbTopInfo_(sh, '=' + SB.SET + '!$A$' + cab.row);
  sbPeriodInputs_(sh, period || []);
  sbKpi_(sh, 5, '$B$3', true);
  sbChartsHeading_(sh, '📈 Подписки и расход по дням за период выше');
  sbDirTables_(sh);   // таблицы по неделям и месяцам, по дням и графики — 11_days.gs
  sh.setFrozenRows(3);
}

function sbChartsHeading_(sh, text) { sh.getRange('M3').setValue(text).setFontSize(12).setFontWeight('bold'); }

/**
 * График по таблице t ({h, r2}): подписи — колонка A, значения — cols = [первая колонка, число колонок].
 * pos = [ряд, колонка] в сетке графиков справа от таблиц (сейчас всё в колонке 0).
 */
function sbChart_(sh, kind, title, t, cols, pos, colors, trend) {
  const rows = t.r2 - t.h + 1;
  let b = sh.newChart().setChartType(kind === 'line' ? Charts.ChartType.LINE : Charts.ChartType.COLUMN)
    .addRange(sh.getRange(t.h, 1, rows, 1)).addRange(sh.getRange(t.h, cols[0], rows, cols[1] || 1))
    .setNumHeaders(1).setPosition(4 + pos[0] * 15, pos[1] ? 22 : 13, 0, 0)
    .setOption('title', title).setOption('width', 560).setOption('height', 290).setOption('colors', colors)
    .setOption('legend', { position: colors.length > 1 ? 'bottom' : 'none' });
  if (trend) b = b.setOption('trendlines', { 0: { type: 'linear', color: SB.NAVY, lineWidth: 2, opacity: 0.8 } });
  sh.insertChart(b.build());
}

/** Демо-данные за год: чтобы увидеть, как выглядит отчёт, до подключения кабинетов. */
function sbDemoData_(sh, cabs) {
  const rows = [], n = 365, last = new Date();
  last.setHours(12, 0, 0, 0);
  cabs.forEach(function (c, i) {
    const budget = 2500 + 2000 * (i % 3), cps = 35 + 20 * (i % 3);   // цена подписки в демо
    for (let k = n; k >= 1; k--) {
      const d = new Date(last.getTime() - k * SOVA_DAY_MS), wd = d.getDay(), trend = 1 + 0.5 * (n - k) / n;
      const spend = Math.round(budget * trend * (wd === 0 || wd === 6 ? 0.7 : 1) * (0.75 + Math.random() * 0.5));
      const shows = Math.round(spend / (0.18 + Math.random() * 0.06));
      const clicks = Math.round(shows * (0.014 + Math.random() * 0.008));
      const subs = Math.round(spend / (cps * (0.6 + Math.random() * 0.8) / Math.sqrt(trend)));
      rows.push([d, '=' + SB.SET + '!$A$' + c.row, spend, shows, clicks, subs]);
    }
  });
  rows.sort(function (a, b) { return a[0] - b[0]; });
  sovaEnsureRows_(sh, rows.length + 1);
  sh.getRange(2, 1, rows.length, 6).setValues(sbLoc_(rows));
  sh.getRange(2, 1, rows.length, 1).setNumberFormat('dd.MM.yyyy');
  sh.getRange(2, 3, rows.length, 1).setNumberFormat('#,##0.00');
}
