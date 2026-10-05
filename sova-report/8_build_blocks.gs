// ---------- Построение отчёта: формулы и оформление блоков ----------

function sbSumifs_(src, frm, to, dir) {
  return 'SUMIFS(' + SB.D + '!$' + src + ':$' + src + ',' + SB.D + '!$A:$A,">="&' + frm + ',' + SB.D + '!$A:$A,"<"&' + to + '+1' +
    (dir ? ',' + SB.D + '!$B:$B,' + dir : '') + ')';
}

/** CTR, CPC, цена подписки, CR для строки r (колонки E, F, H, I). */
function sbDerived_(r) {
  return ['=IFERROR(D' + r + '/C' + r + ',"")', '=IFERROR(B' + r + '/D' + r + ',"")',
    '=IFERROR(B' + r + '/G' + r + ',"")', '=IFERROR(G' + r + '/D' + r + ',"")'];
}

/** B..I строки r: расход, показы, клики, CTR, CPC, подписки, цена подписки, CR за период [frm; to]. */
function sbMetrics_(r, frm, to, dir) {
  const s = function (c) { return '=' + sbSumifs_(c, frm, to, dir); }, d = sbDerived_(r);
  return [s('C'), s('D'), s('E'), d[0], d[1], s('F'), d[2], d[3]];
}

function sbSetup_(sh, tab, widths) {
  if (sh.getMaxColumns() < 40) sh.insertColumnsAfter(sh.getMaxColumns(), 40 - sh.getMaxColumns());
  sh.setHiddenGridlines(true).setTabColor(tab);
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setFontFamily('Arial').setFontSize(10).setFontColor(SB.INK);
  widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
}

function sbBanner_(sh, title, subtitle) {
  sh.getRange(1, 1, 2, 39).setBackground(SB.NAVY);
  sh.setRowHeight(1, 44);
  sh.getRange('A1').setValue(sbLocF_(title)).setFontSize(18).setFontWeight('bold').setFontColor('#ffffff').setVerticalAlignment('middle');
  sh.getRange('A2').setValue(sbLocF_(subtitle)).setFontColor('#c9d1e3');
}

function sbTopInfo_(sh, dirFormula) {
  sh.getRange('A3:E3').setValues(sbLoc_([[dirFormula ? 'Направление' : 'Все направления', dirFormula || '', '', 'Данные по',
    '=' + SB.SET + '!$F$2']]));
  sh.getRange('A3:D3').setFontColor(SB.MUTED);
  sh.getRange('B3').setFontColor(SB.INK).setFontWeight('bold');
  sh.getRange('E3').setFontWeight('bold').setNumberFormat('dd.MM.yyyy');
}

function sbSection_(sh, r, text) { sh.getRange(r, 1).setValue(sbLocF_(text)).setFontSize(12).setFontWeight('bold'); }

function sbHeader_(sh, r, names) {
  sh.getRange(r, 1, 1, names.length).setValues(sbLoc_([names])).setBackground(SB.HEAD).setFontColor('#ffffff')
    .setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
}

/** Строки r1..r2: полосы, линии между строками, форматы чисел по колонкам; строка totalRow — итог. */
function sbBody_(sh, r1, r2, formats, totalRow) {
  const n = formats.length, rows = r2 - r1 + 1, bg = [];
  for (let r = r1; r <= r2; r++) bg.push(new Array(n).fill(r === totalRow ? '#e8ecf4' : (r - r1) % 2 ? SB.BAND : '#ffffff'));
  sh.getRange(r1, 1, rows, n).setBackgrounds(bg).setHorizontalAlignment('right')
    .setBorder(null, null, true, null, null, true, SB.LINE, SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(r1, 1, rows, 1).setHorizontalAlignment('left');
  formats.forEach(function (f, i) { if (f) sh.getRange(r1, i + 1, rows, 1).setNumberFormat(f); });
  if (totalRow) sh.getRange(totalRow, 1, 1, n).setFontWeight('bold')
    .setBorder(true, null, null, null, null, null, SB.NAVY, SpreadsheetApp.BorderStyle.SOLID);
}

function sbRule_(sh, builder) { sh.setConditionalFormatRules(sh.getConditionalFormatRules().concat([builder.build()])); }

/** Цветовая шкала: дешевле — зеленее, дороже — краснее. */
function sbHeat_(sh, a1) {
  sbRule_(sh, SpreadsheetApp.newConditionalFormatRule().setRanges([sh.getRange(a1)]).setGradientMinpoint('#d8f0e0')
    .setGradientMidpointWithValue('#ffffff', SpreadsheetApp.InterpolationType.PERCENTILE, '50').setGradientMaxpoint('#f8d7d5'));
}

/** Изменение к лучшему — зелёным, к худшему — красным. good: +1 — хорошо, когда растёт; −1 — когда падает. */
function sbUpDown_(sh, a1, good) {
  const first = a1.split(':')[0];
  [['>', '', SB.UP, SB.DOWN], ['<', '-', SB.DOWN, SB.UP]].forEach(function (o) {
    sbRule_(sh, SpreadsheetApp.newConditionalFormatRule().setRanges([sh.getRange(a1)])
      .whenFormulaSatisfied(sbLocF_('=AND(ISNUMBER(' + first + '),' + first + o[0] + o[1] + '1/200)'))
      .setFontColor(good > 0 ? o[2] : o[3]).setBold(true));
  });
}

/**
 * Этот месяц (с 1-го по отчётную дату) против тех же дней прошлого месяца.
 * manual — период можно задать вручную в H3 («с») и J3 («по»), тогда сравнение
 * идёт с предыдущим периодом той же длины.
 */
function sbKpi_(sh, r, dir, manual) {
  const cur = r + 2, prev = r + 3, delta = r + 4, J = 'J' + cur, K = 'K' + cur;
  const M = manual ? 'OR(ISNUMBER($H$3),ISNUMBER($J$3))' : 'FALSE';
  sh.getRange(r, 1).setValue(sbLocF_(manual ? '=IF(' + M + ',"Выбранный период против предыдущего той же длины",' +
    '"Этот месяц против тех же дней прошлого")' : 'Этот месяц против тех же дней прошлого')).setFontSize(12).setFontWeight('bold');
  sbHeader_(sh, r + 1, ['Период'].concat(SB.COLS.slice(1), ['с', 'по']));
  const from = manual ? '=IF(ISNUMBER($H$3),$H$3,DATE(YEAR(' + K + '),MONTH(' + K + '),1))' : '=DATE(YEAR($E$3),MONTH($E$3),1)';
  const to = manual ? '=IF(ISNUMBER($J$3),$J$3,$E$3)' : '=$E$3';
  sh.getRange(cur, 1, 3, 11).setValues(sbLoc_([
    [manual ? '=IF(' + M + ',"Выбранный период","Этот месяц")' : 'Этот месяц']
      .concat(sbMetrics_(cur, '$J$' + cur, '$K$' + cur, dir), [from, to]),
    [manual ? '=IF(' + M + ',"Предыдущий, той же длины","Прошлый, те же дни")' : 'Прошлый, те же дни']
      .concat(sbMetrics_(prev, '$J$' + prev, '$K$' + prev, dir),
        ['=IF(' + M + ',2*' + J + '-' + K + '-1,EDATE(' + J + ',-1))', '=IF(' + M + ',' + J + '-1,EDATE(' + K + ',-1))']),
    ['Изменение'].concat('BCDEFGHI'.split('').map(function (L) { return '=IFERROR(' + L + cur + '/' + L + prev + '-1,"")'; }), ['', '']),
  ]));
  sbBody_(sh, cur, delta, SB.FMT.concat(['dd.MM.yyyy', 'dd.MM.yyyy']));
  sh.getRange(cur, 1, 1, 11).setFontSize(14).setFontWeight('bold');
  sh.getRange(prev, 1, 1, 11).setFontColor(SB.MUTED);
  sh.getRange(delta, 1, 1, 11).setFontWeight('bold').setFontColor(SB.MUTED);
  sh.getRange(delta, 2, 1, 8).setNumberFormat(SB.DELTA);
  sh.setRowHeight(cur, 34);
  SB.GOOD.forEach(function (g, i) { if (g) sbUpDown_(sh, sbCol_(i + 1) + delta, g); });
  return delta + 2;
}

/** Поля ручного периода (на «Сводной» и листах направлений): H3 — «с», J3 — «по» (даты из календаря); period — прежние значения. */
function sbPeriodInputs_(sh, period) {
  sh.getRange('G3:J3').setValues([['Период с', period[0] || '', 'по', period[1] || '']]);
  sh.getRange('G3:J3').setFontColor(SB.MUTED).setHorizontalAlignment('right');
  const rule = SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false)
    .setHelpText('Дата: дважды щёлкните, чтобы выбрать в календаре. Пусто — текущий месяц.').build();
  ['H3', 'J3'].forEach(function (a) {
    sh.getRange(a).setBackground('#fff6d6').setFontColor(SB.INK).setFontWeight('bold').setHorizontalAlignment('center')
      .setNumberFormat('dd.MM.yyyy').setDataValidation(rule)
      .setBorder(true, true, true, true, null, null, '#e0c46c', SpreadsheetApp.BorderStyle.SOLID);
  });
  sh.getRange('H4').setValue(sbLocF_('=IF(AND(ISNUMBER(H3),ISNUMBER(J3),H3>J3),"⚠ Дата «с» позже даты «по»",' +
    'IF(OR(ISNUMBER(H3),ISNUMBER(J3)),"Сравнение — с предыдущим периодом той же длины. Очистите поля, чтобы вернуть текущий месяц.",' +
    '"Пусто — текущий месяц. Дату выбирают двойным щелчком."))')).setFontColor(SB.MUTED).setFontSize(9);
}

// ---------- Формулы под локаль таблицы ----------
// В русской локали аргументы формул разделяются «;», а не «,». Формулы в коде пишутся
// с запятыми и переводятся здесь; строки "…" и имена листов '…' не трогаются.

let sbSemi_ = null;

/** true, если таблица не понимает формулы с запятыми (проверка на временном листе, один раз на локаль). */
function sbSemicolons_() {
  if (sbSemi_ !== null) return sbSemi_;
  const ss = SpreadsheetApp.getActive(), props = PropertiesService.getDocumentProperties();
  const key = 'SOVA_SEMI_' + ss.getSpreadsheetLocale(), saved = props.getProperty(key);   // ответ на локаль запоминается
  if (saved) return (sbSemi_ = saved === '1');
  const sh = ss.insertSheet('_sova_locale_check');
  const cell = sh.getRange(1, 1).setFormula('=SUM(1,2)');
  SpreadsheetApp.flush();
  sbSemi_ = cell.getValue() !== 3;
  ss.deleteSheet(sh);
  props.setProperty(key, sbSemi_ ? '1' : '0');
  return sbSemi_;
}

function sbLocF_(f) {
  if (typeof f !== 'string' || f.charAt(0) !== '=' || !sbSemicolons_()) return f;
  let out = '', quote = '', depth = 0;
  for (let i = 0; i < f.length; i++) {
    const ch = f[i];
    if (quote) { if (ch === quote) quote = ''; out += ch; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    out += ch === ',' ? (depth > 0 ? '\\' : ';') : ch;
  }
  return out;
}

function sbLoc_(rows) { return rows.map(function (r) { return r.map(sbLocF_); }); }
