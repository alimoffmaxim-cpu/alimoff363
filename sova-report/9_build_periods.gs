// ---------- Построение отчёта: таблицы по дням, неделям и месяцам ----------

// Последний завершённый месяц / неделя: неполный текущий период не попадает в тренд
const SB_LAST_MONTH = 'EDATE(DATE(YEAR($E$3),MONTH($E$3),1),-($E$3<EOMONTH($E$3,0)))';
const SB_LAST_WEEK = '($E$3-WEEKDAY($E$3,2)+1-7*(WEEKDAY($E$3,2)<7))';

function sbCol_(i) {
  let s = '';
  for (; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s;
  return s;
}

/**
 * Период: число строк, шапка, начало k-го периода (формула), его конец и подпись.
 * n — число строк: дней для 'day', последних завершённых недель / месяцев для 'week' / 'month'.
 */
function sbPeriod_(kind, n) {
  if (kind === 'month') { n = n > 0 ? n : SB.MONTHS; } else if (kind === 'week') { n = n > 0 ? n : SB.WEEKS; }
  if (kind === 'month') return {
    title: '📅 По завершённым месяцам (' + n + ')', n: n, first: 'Месяц',
    start: function (k) { return 'EDATE(' + SB_LAST_MONTH + ',' + (k - n + 1) + ')'; },
    end: function (a) { return 'EOMONTH(' + a + ',0)'; },
    label: function (a) {
      return 'CHOOSE(MONTH(' + a + '),"янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек")&" "&YEAR(' + a + ')';
    },
  };
  if (kind === 'week') return {
    title: '🗓 По завершённым неделям (' + n + ')', n: n, first: 'Неделя',
    start: function (k) { return '(' + SB_LAST_WEEK + '-7*' + (n - 1 - k) + ')'; },
    end: function (a) { return '(' + a + '+6)'; },
    label: function (a) { return 'TEXT(' + a + ',"DD.MM")&"–"&TEXT(' + a + '+6,"DD.MM")'; },
  };
  return {   // дни периода из блока сверху: с $J$7, n дней (n считает sbDays_)
    title: '="📆 По дням: "&TEXT($J$7,"DD.MM.YYYY")&" — "&TEXT($K$7,"DD.MM.YYYY")', n: n, first: 'День',
    start: function (k) { return '($J$7+' + k + ')'; },
    end: function (a) { return a; },
    label: function (a) { return 'TEXT(' + a + ',"DD.MM")&" "&CHOOSE(WEEKDAY(' + a + ',2),"пн","вт","ср","чт","пт","сб","вс")'; },
  };
}

/** Таблица метрик по периодам одного направления (dir) или всех (dir = null). */
function sbPeriodTable_(sh, r, kind, dir, n) {
  if (kind === 'day' && !(n > 0)) n = Math.min(Math.max(sbPeriodDates_(sh).n, 1), SB.MAX_DAYS || 400);   // вызов без числа дней
  const p = sbPeriod_(kind, n), r1 = r + 2, r2 = r1 + p.n - 1, rows = [];
  sbSection_(sh, r, p.title);
  sbHeader_(sh, r + 1, [p.first].concat(SB.COLS.slice(1)));
  for (let k = 0; k < p.n; k++) {
    const a = p.start(k);
    rows.push(['=' + p.label(a)].concat(sbMetrics_(r1 + k, a, p.end(a), dir)));
  }
  sh.getRange(r1, 1, p.n, 9).setValues(sbLoc_(rows));
  sbBody_(sh, r1, r2, SB.FMT);
  sbHeat_(sh, 'H' + r1 + ':H' + r2);
  return { h: r + 1, r1: r1, r2: r2, next: r2 + 2 };
}

/**
 * Период × направления (+ «Итого»). kind: subs | cost | spend.
 * Цена подписки считается построчно из таблиц подписок и расхода: src = {s1, e1} — их первые строки.
 * count — сколько последних завершённых недель / месяцев показать.
 */
function sbPivot_(sh, r, title, kind, period, cabs, src, count) {
  const p = sbPeriod_(period, count), n = cabs.length, T = sbCol_(n + 2), last = sbCol_(n + 1), trend = kind === 'subs';
  const h = r + 1, r1 = h + 1, r2 = r1 + p.n - 1, rows = [];
  sbSection_(sh, r, title);
  sbHeader_(sh, h, [p.first].concat(cabs.map(function (c) { return '=' + SB.SET + '!$A$' + c.row; }),
    ['Итого'], trend ? ['К прошлой'] : []));
  for (let k = 0; k < p.n; k++) {
    const rr = r1 + k, a = p.start(k), row = ['=' + p.label(a)];
    for (let j = 0; j <= n; j++) {   // направления, затем «Итого»
      const L = sbCol_(2 + j);
      if (kind === 'cost') row.push('=IFERROR(' + L + (src.e1 + k) + '/' + L + (src.s1 + k) + ',"")');
      else if (j === n) row.push('=SUM(B' + rr + ':' + last + rr + ')');
      else row.push('=' + sbSumifs_(kind === 'spend' ? 'C' : 'F', a, p.end(a), L + '$' + h));
    }
    if (trend) row.push(k ? '=IFERROR(' + T + rr + '/' + T + (rr - 1) + '-1,"")' : '');
    rows.push(row);
  }
  sh.getRange(r1, 1, p.n, rows[0].length).setValues(sbLoc_(rows));
  const f = { subs: '#,##0', cost: '#,##0.0" ₽"', spend: '#,##0" ₽"' }[kind];
  sbBody_(sh, r1, r2, [null].concat(new Array(n + 1).fill(f), trend ? [SB.DELTA] : []));
  sh.getRange(r1, n + 2, p.n, 1).setFontWeight('bold');
  if (kind === 'cost') sbHeat_(sh, 'B' + r1 + ':' + last + r2);
  if (trend) {
    const tot = T + r1 + ':' + T + r2, F = sbCol_(n + 3);
    sh.getRange(r, n + 1, 1, 3).setValues(sbLoc_([['Тенденция:',
      p.n >= 4 ? '=IFERROR(SLOPE(' + tot + ',SEQUENCE(' + p.n + '))/AVERAGE(' + tot + '),"")' : '—',   // по 1–3 точкам тренд ни о чём
      p.n >= 4 ? 'в ' + (period === 'week' ? 'неделю' : 'месяц') : 'появится с 4 ' + (period === 'week' ? 'недель' : 'месяцев')]]));
    sh.getRange(r, n + 1).setFontColor(SB.MUTED).setHorizontalAlignment('right');
    sh.getRange(r, n + 2).setNumberFormat('"▲ "0.0%;"▼ "0.0%;0%').setFontWeight('bold').setFontSize(11);
    sh.getRange(r, n + 3).setFontColor(SB.MUTED);
    if (p.n > 1) sbUpDown_(sh, F + (r1 + 1) + ':' + F + r2, 1);
    sbUpDown_(sh, T + r, 1);
  }
  return { h: h, r1: r1, r2: r2, next: r2 + 2 };
}
