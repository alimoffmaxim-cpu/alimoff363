// ---------- Настройки ----------
// Лист «Настройки»: A:C — правила каналов, E:F — типы абонементов МК, H:J — параметры.

/** Параметры, правила каналов и типов абонементов с листа «Настройки». */
function params_() {
  const p = {};
  PARAMS.forEach(x => { p[x[0]] = x[1]; });
  p.rules = DEFAULT_RULES.map(r => ({ field: r[0], contains: lc_(r[1]), channel: r[2] }));
  p.subRules = DEFAULT_SUB_RULES.map(r => ({ contains: lc_(r[0]), type: r[1] }));

  const sh = SpreadsheetApp.getActive().getSheetByName(SHEETS.settings);
  if (sh && sh.getLastRow() > 1) {
    const v = sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues();
    p.rules = v.filter(r => r[0] && r[1] && r[2])
      .map(r => ({ field: lc_(r[0]), contains: lc_(r[1]), channel: String(r[2]).trim() }));
    p.subRules = v.filter(r => r[4] && r[5]).map(r => ({ contains: lc_(r[4]), type: lc_(r[5]) }));
    v.forEach(r => { if (r[7] && String(r[7]) in p) p[String(r[7])] = r[8]; });
  }
  p.INITIAL_DAYS = Math.max(1, num_(p.INITIAL_DAYS) || 180);
  p.LOOKBACK_DAYS = Math.max(1, num_(p.LOOKBACK_DAYS) || 30);
  return p;
}

// ---------- Создание листов ----------

/** Создаёт недостающие листы и пересоздаёт сводки и дашборд. Данные и настройки не трогает. */
function setupSheets() {
  setupSettings_();
  sheet_(SHEETS.adsManual, HEAD.adsManual).getRange('A:A').setNumberFormat('dd.mm.yyyy');
  sheet_(SHEETS.costs, HEAD.costs).getRange('A:A').setNumberFormat('mm.yyyy');
  sheet_(SHEETS.costs).getRange('E1').setValue('Месяц — любая дата этого месяца, например 01.09.2026');
  ['ads', 'tilda', 'amo', 'mkClients', 'mkVisits', 'mkSubs', 'mkPays', 'fact', 'log'].forEach(k => sheet_(SHEETS[k], HEAD[k]));

  buildSummaries_();
  buildDashboard_();
  ensureTriggers_(); // ежедневное обновление включается само

  const ss = SpreadsheetApp.getActive();
  [SHEETS.dash, SHEETS.byChannel, SHEETS.byCampaign, SHEETS.byMonth, SHEETS.byDay,
    SHEETS.adsManual, SHEETS.costs, SHEETS.settings].forEach((n, i) => {
    ss.setActiveSheet(ss.getSheetByName(n));
    ss.moveActiveSheet(i + 1);
  });
  ss.setActiveSheet(ss.getSheetByName(SHEETS.dash));
  const def = ss.getSheetByName('Лист1') || ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
}

function setupSettings_() {
  const ss = SpreadsheetApp.getActive();
  const existing = ss.getSheetByName(SHEETS.settings);
  if (existing) { // дописываем параметры, появившиеся в новых версиях
    const last = Math.max(existing.getLastRow(), 1);
    const have = existing.getRange(1, 8, last, 1).getValues().map(r => String(r[0]));
    const missing = PARAMS.filter(x => have.indexOf(x[0]) < 0);
    if (missing.length) {
      // Первое место под списком параметров, где подряд свободно нужное число строк
      const h = existing.getRange(1, 8, last + missing.length, 1).getValues().map(r => r[0]);
      let row = 2;
      while (h.slice(row - 1, row - 1 + missing.length).some(v => v !== '')) row++;
      existing.getRange(row, 8, missing.length, 3).setValues(missing);
    }
    return;
  }
  const sh = ss.insertSheet(SHEETS.settings);
  sh.getRange(1, 1, 1, 10).setValues([['Поле', 'Содержит', 'Канал', '', 'Абонемент МК: название содержит', 'Тип', '',
    'Параметр', 'Значение', 'Пояснение']]).setFontWeight('bold');
  sh.getRange(2, 1, DEFAULT_RULES.length, 3).setValues(DEFAULT_RULES);
  sh.getRange(2, 5, DEFAULT_SUB_RULES.length, 2).setValues(DEFAULT_SUB_RULES);
  sh.getRange(2, 8, PARAMS.length, 3).setValues(PARAMS);
  sh.getRange('A2:A200').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(RULE_FIELDS, true).setAllowInvalid(false).build());
  sh.getRange('F2:F100').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(SUB_TYPES, true).setAllowInvalid(false).build());
  sh.getRange('H2:H100').setFontColor('#888888');
  sh.setFrozenRows(1);
  sh.setColumnWidth(10, 420);
  sh.getRange(PARAMS.length + 4, 8, 6, 1).setValues([
    ['Как работают правила каналов (колонки A:C):'],
    ['• Срабатывает первое подходящее правило сверху вниз — «Содержит» ищется без учёта регистра.'],
    ['• Для лидов амо проверяются utm-поля, «Источник», теги, воронка, статус, название сделки и кампания.'],
    ['• Для расходов — площадка, кабинет, кампания и ID кампании. Если правило не сработало, канал = площадка.'],
    ['• Названия каналов у расходов и у лидов должны совпадать, иначе ДРР и ROMI не посчитаются.'],
    ['• Типы абонементов (E:F): если правило не сработало, 1 занятие = «разовая», больше — «абонемент».'],
  ]);
}

// ---------- Сводки ----------


function sumF_(col, event, cond) {
  return 'SUMIFS(fact!$' + col + ':$' + col + ',fact!$B:$B,"' + event + '"' + cond + ')';
}

function resetSheet_(name) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.getCharts().forEach(c => sh.removeChart(c));
  sh.clear();
  return sh;
}

/**
 * Лист сводки: строка 1 — заголовок, 2 — итого, 4 — шапка, с 5-й — строки из формулы-списка.
 * o: {name, title, dims, list, cond(r, total), rows, total, extra}
 */
function buildSummary_(o) {
  const sh = resetSheet_(o.name);
  const metrics = METRICS.concat(o.extra || []);
  const nd = o.dims.length;
  const first = 5;
  setF_(sh.getRange('A1'), o.title).setFontWeight('bold').setFontSize(13);
  sh.getRange(4, 1, 1, nd + metrics.length).setValues([o.dims.concat(metrics.map(m => m.h))])
    .setFontWeight('bold').setWrap(true).setBackground('#eeeeee');

  const rowFormulas = (r, total) => {
    const cells = {};
    metrics.forEach((m, i) => { cells[m.key] = col_(nd + i + 1) + r; });
    return metrics.map(m => {
      const e = m.sum ? sumF_(m.sum[0], m.sum[1], o.cond(r, total))
        : m.raw ? m.raw(r, total) : m.calc(cells);
      return '=' + (total ? e : 'IF($A' + r + '="","",' + e + ')');
    });
  };
  if (o.total) {
    sh.getRange(2, 1).setValue('Итого');
    setFs_(sh.getRange(2, nd + 1, 1, metrics.length), [rowFormulas(2, true)]);
    sh.getRange(2, 1, 1, nd + metrics.length).setFontWeight('bold').setBackground('#fff8e1');
  }
  const f = [];
  for (let r = first; r < first + o.rows; r++) f.push(rowFormulas(r, false));
  setFs_(sh.getRange(first, nd + 1, o.rows, metrics.length), f);
  setF_(sh.getRange(first, 1), o.list);

  metrics.forEach((m, i) => sh.getRange(2, nd + i + 1, first + o.rows - 2, 1).setNumberFormat(m.fmt || '#,##0'));
  if (o.dimFormat) sh.getRange(first, 1, o.rows, 1).setNumberFormat(o.dimFormat);
  sh.setFrozenRows(4);
  sh.setFrozenColumns(nd);
  sh.setColumnWidth(1, 170);
  if (nd > 1) sh.setColumnWidth(2, 240);
  return sh;
}


function buildSummaries_() {
  buildSummary_({
    name: SHEETS.byChannel, title: periodTitle_('Сводка по каналам'), dims: ['Канал'], total: true,
    rows: CFG.ROWS_CHANNELS,
    list: '=IFERROR(SORT(UNIQUE(FILTER(fact!C2:C,fact!C2:C<>"",' + inPeriod_ + '))),"")',
    cond: (r, total) => PERIOD + (total ? '' : ',fact!$C:$C,$A' + r),
  });
  buildSummary_({
    name: SHEETS.byCampaign, title: periodTitle_('Сводка по кампаниям (utm_campaign)'), dims: ['Канал', 'Кампания'],
    total: true, rows: CFG.ROWS_CAMPAIGNS,
    list: '=IFERROR(SORT(UNIQUE(FILTER({fact!C2:C,fact!D2:D},fact!D2:D<>"",' + inPeriod_ + '))),"")',
    cond: (r, total) => PERIOD + (total ? '' : ',fact!$C:$C,$A' + r + ',fact!$D:$D,$B' + r),
  });
  buildSummary_({
    name: SHEETS.byMonth, title: '="Сводка по месяцам (все данные)"', dims: ['Месяц'], total: true,
    rows: CFG.ROWS_MONTHS, extra: MONTH_EXTRA, dimFormat: 'mmmm yyyy',
    list: '=ARRAYFORMULA(IFERROR(SORT(UNIQUE(FILTER(DATE(YEAR(fact!A2:A),MONTH(fact!A2:A),1),fact!A2:A<>""))),""))',
    cond: (r, total) => total ? '' : ',fact!$A:$A,">="&$A' + r + ',fact!$A:$A,"<"&EDATE($A' + r + ',1)',
  });
  buildSummary_({
    name: SHEETS.byDay, title: periodTitle_('Сводка по дням'), dims: ['Дата'], total: true,
    rows: CFG.ROWS_DAYS, dimFormat: 'dd.mm.yyyy',
    list: '=IF(' + TO + '<' + FROM + ',"",SEQUENCE(MIN(' + CFG.ROWS_DAYS + ',' + TO + '-' + FROM + '+1),1,' + FROM + '))',
    cond: (r, total) => total ? PERIOD : ',fact!$A:$A,$A' + r,
  });
}

/** Буква колонки метрики на листе сводки с nd колонками-измерениями. */
function metricCol_(key, nd) {
  return col_(nd + 1 + METRICS.map(m => m.key).indexOf(key));
}

// ---------- Дашборд ----------

function buildDashboard_() {
  const ss = SpreadsheetApp.getActive();
  const old = ss.getSheetByName(SHEETS.dash);
  // Период, который выбрал пользователь, сохраняем
  const keep = old ? [old.getRange('B3').getFormula() || old.getRange('B3').getValue(),
    old.getRange('B4').getFormula() || old.getRange('B4').getValue()] : null;
  const sh = resetSheet_(SHEETS.dash);
  const ch = "'" + SHEETS.byChannel + "'!";

  sh.getRange('A1').setValue('Школа мотокросса — сквозная аналитика').setFontWeight('bold').setFontSize(16);
  const lastRun = 'MAX(\'' + SHEETS.log + '\'!A:A)';
  setF_(sh.getRange('A2'), '=IFERROR(IF(NOW()-' + lastRun + '>26/24,"⚠ Данные не обновлялись больше суток: проверьте лист «Лог» и меню «Включить ежедневное обновление»",' +
    '"Последнее обновление: "&TEXT(' + lastRun + ',"dd.mm.yyyy hh:mm")),"")')
    .setFontColor('#888888');
  sh.getRange('A3:A4').setValues([['Период с'], ['по']]).setFontWeight('bold');
  const setDate = (a1, v, def) => {
    const cell = sh.getRange(a1);
    if (v === '' || v == null) setF_(cell, def);
    else if (String(v)[0] === '=') setF_(cell, v);
    else cell.setValue(v);
  };
  setDate('B3', keep && keep[0], '=DATE(YEAR(TODAY()),MONTH(TODAY()),1)');
  setDate('B4', keep && keep[1], '=TODAY()');
  sh.getRange('B3:B4').setNumberFormat('dd.mm.yyyy').setBackground('#e3f2fd')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().build());
  sh.getRange('C3').setValue('← впишите даты, чтобы сменить период (по умолчанию — текущий месяц)').setFontColor('#888888');

  // KPI
  const m = key => ch + metricCol_(key, 1) + '2';
  const kpi = [
    ['Расход на рекламу', '=' + m('spend'), '#,##0 ₽'],
    ['Лиды (CRM)', '=' + m('leads'), '#,##0'],
    ['Лиды (кабинет)', '=' + m('adLeads'), '#,##0'],
    ['Заявки с сайта', '=' + m('siteLeads'), '#,##0'],
    ['Цена лида (CRM)', '=' + m('cpl'), '#,##0 ₽'],
    ['Пробные', '=' + m('trials'), '#,##0'],
    ['Повторные', '=' + m('repeat'), '#,##0'],
    ['Абонементы', '=' + m('subs'), '#,##0'],
    ['Выручка', '=' + m('revenue'), '#,##0 ₽'],
    ['ДРР', '=' + m('drr'), '0.0%'],
    ['ROMI', '=' + m('romi'), '0%'],
    ['Прочие расходы', "=SUMIFS(" + COSTS + "!$C:$C," + COSTS + "!$A:$A,\">=\"&DATE(YEAR(B3),MONTH(B3),1)," +
      COSTS + "!$A:$A,\"<=\"&B4)", '#,##0 ₽'],
    ['Чистая прибыль', null, '#,##0 ₽'],
  ];
  const kc = label => col_(kpi.findIndex(k => k[0] === label) + 1) + '7';
  kpi[kpi.length - 1][1] = '=' + kc('Выручка') + '-' + kc('Расход на рекламу') + '-' + kc('Прочие расходы');
  sh.getRange(6, 1, 1, kpi.length).setValues([kpi.map(k => k[0])])
    .setFontColor('#666666').setWrap(true).setVerticalAlignment('bottom');
  setFs_(sh.getRange(7, 1, 1, kpi.length), [kpi.map(k => k[1])])
    .setFontSize(15).setFontWeight('bold');
  kpi.forEach((k, i) => sh.getRange(7, i + 1).setNumberFormat(k[2]));
  sh.getRange(6, 1, 2, kpi.length).setBackground('#fafafa')
    .setBorder(true, true, true, true, true, false, '#dddddd', SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange('A8').setValue('Прочие расходы — за все месяцы, которые задевает период (лист «Расходы»).')
    .setFontColor('#888888').setFontSize(9);

  // Таблица по каналам
  const last = col_(1 + METRICS.length);
  const end = 4 + CFG.ROWS_CHANNELS;
  sh.getRange('A10').setValue('По каналам').setFontWeight('bold').setFontSize(12);
  setF_(sh.getRange('A11'), '={' + ch + 'A4:' + last + '4;' + ch + 'A2:' + last + '2}');
  setF_(sh.getRange('A13'), '=IFERROR(FILTER(' + ch + 'A5:' + last + end + ',' + ch + 'A5:A' + end + '<>""),"Нет данных за период")');
  sh.getRange(11, 1, 1, 1 + METRICS.length).setFontWeight('bold').setWrap(true).setBackground('#eeeeee');
  sh.getRange(12, 1, 1, 1 + METRICS.length).setFontWeight('bold').setBackground('#fff8e1');
  METRICS.forEach((mt, i) => sh.getRange(12, i + 2, CFG.ROWS_CHANNELS + 2, 1).setNumberFormat(mt.fmt || '#,##0'));
  sh.setColumnWidth(1, 150);

  buildCharts_(sh, 13 + CFG.ROWS_CHANNELS + 2);
  sh.setFrozenRows(4);
}

/** Данные для графиков — компактные диапазоны без пустых строк на служебном листе. */
function buildCharts_(dash, row) {
  const sh = resetSheet_(SHEETS.chartData);
  const ch = "'" + SHEETS.byChannel + "'!";
  const dy = "'" + SHEETS.byDay + "'!";
  const cEnd = 4 + CFG.ROWS_CHANNELS;
  const dEnd = 4 + CFG.ROWS_DAYS;
  const c = key => metricCol_(key, 1);
  const block = (at, src, end, keys, heads) => {
    sh.getRange(1, at, 1, heads.length).setValues([heads]).setFontWeight('bold');
    setF_(sh.getRange(2, at), '=IFERROR(FILTER({' + keys.map(k => src + k + '5:' + k + end).join(',') + '},' +
      src + 'A5:A' + end + '<>""),"")');
  };
  block(1, ch, cEnd, ['A', c('adLeads'), c('siteLeads'), c('leads'), c('trials'), c('subs')],
    ['Канал', 'Лиды (кабинет)', 'Заявки с сайта', 'Лиды (CRM)', 'Пробные', 'Абонементы']);
  block(7, ch, cEnd, ['A', c('spend'), c('revenue')], ['Канал', 'Расход', 'Выручка']);
  block(11, dy, dEnd, ['A', c('spend'), c('revenue'), c('adLeads'), c('siteLeads'), c('leads')],
    ['Дата', 'Расход', 'Выручка', 'Лиды (кабинет)', 'Заявки с сайта', 'Лиды (CRM)']);
  sh.getRange('K2:K').setNumberFormat('dd.mm');
  sh.getRange('R1').setValue('Служебный лист для графиков дашборда — не редактируйте.').setFontColor('#888888');

  const add = (type, ranges, title, r, col, opts) => {
    let b = dash.newChart().setChartType(type).setPosition(r, col, 0, 0)
      .setOption('title', title).setOption('width', 620).setOption('height', 340)
      .setOption('legend', { position: 'bottom' }).setNumHeaders(1);
    ranges.forEach(a1 => { b = b.addRange(sh.getRange(a1)); });
    Object.keys(opts || {}).forEach(k => { b = b.setOption(k, opts[k]); });
    dash.insertChart(b.build());
  };
  add(Charts.ChartType.COLUMN, ['A1:F' + (CFG.ROWS_CHANNELS + 1)], 'Лиды → пробные → абонементы по каналам', row, 1);
  add(Charts.ChartType.COLUMN, ['G1:I' + (CFG.ROWS_CHANNELS + 1)], 'Расход и выручка по каналам', row, 8);
  add(Charts.ChartType.LINE, ['K1:M' + (CFG.ROWS_DAYS + 1)], 'Расход и выручка по дням', row + 18, 1, { curveType: 'function' });
  add(Charts.ChartType.COLUMN, ['K1:K' + (CFG.ROWS_DAYS + 1), 'N1:P' + (CFG.ROWS_DAYS + 1)], 'Лиды и заявки по дням', row + 18, 8);
}
