// ---------- Создание листов и период на «Сводной» ----------

function drSetup() {
  const missing = [['1_main', typeof drDailyUpdate], ['2_util', typeof drSheet_], ['3_direct', typeof drLoadDirect_],
    ['4_tilda', typeof drLeadRow_], ['5_match', typeof drMatch_], ['6_report', typeof drRecompute_],
    ['7_tables', typeof drTables_]].filter(function (f) { return f[1] !== 'function'; }).map(function (f) { return f[0]; });
  if (missing.length) return SpreadsheetApp.getUi().alert('Не хватает кода в Apps Script: ' + missing.join(', ') +
    '. Создайте эти файлы кодом со страницы «Код отчёта Директ + Тильда». Всего файлов — 8.');
  drAlert_(function () {
    const ss = SpreadsheetApp.getActive();
    ss.setSpreadsheetLocale('ru_RU');
    ss.setSpreadsheetTimeZone(DR.TIMEZONE);
    const sh = drSheet_(DR_SHEETS.SUMMARY);
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(1);
    sh.getRange('A1').setValue('Директ + Тильда · Сводная').setFontSize(18).setFontWeight('bold');
    sh.getRange('A3:D3').setValues([['Период с', sh.getRange('B3').getValue() || '', 'по', '']]);
    sh.getRange('D3').setFormula('=TODAY()-1');
    sh.getRange('A3').setFontColor('#6b7280');
    sh.getRange('C3').setFontColor('#6b7280').setHorizontalAlignment('right');
    const rule = SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false)
      .setHelpText('Дата: двойной щелчок — календарь.').build();
    sh.getRange('B3:D3').setNumberFormat('dd.MM.yyyy');
    ['B3', 'D3'].forEach(function (a) {
      sh.getRange(a).setBackground('#fff6d6').setFontWeight('bold').setHorizontalAlignment('center').setDataValidation(rule);
    });
    sh.getRange('E3').setValue('«С» пусто — с 1-го числа месяца; «по» — вчера, можно поменять (при открытии таблицы снова вчера). ' +
      'Даты действуют на все листы отчёта.').setFontColor('#6b7280').setFontSize(9);
    sh.setColumnWidth(1, 300);
    drSheet_(DR_SHEETS.LEADS, DR_LEAD_HEAD);
    drSheet_(DR_SHEETS.DATA, DR_DATA_HEAD);
    drSheet_(DR_SHEETS.TEXTS, DR_TEXT_HEAD);
    const rules = drSheet_(DR_SHEETS.RULES, DR_RULE_HEAD);
    rules.getRange(2, 1, rules.getMaxRows() - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'страница входа', 'любая']).build());
    rules.getRange(2, 2, rules.getMaxRows() - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(['равно', 'содержит']).build());
    rules.getRange('I1').setValue('Правила проверяются сверху вниз, первое подошедшее — выигрывает. Заполните хотя бы один ID: ' +
      'объявления (тогда группа и кампания определятся сами), группы или кампании. Регистр не важен.').setFontColor('#6b7280');
    [DR_SHEETS.CAMPAIGNS, DR_SHEETS.GROUPS, DR_SHEETS.ADS].forEach(function (n) { drSheet_(n); });
    ['Лист1', 'Sheet1'].forEach(function (n) { const s = ss.getSheetByName(n); if (s && s.getLastRow() === 0) ss.deleteSheet(s); });
    drRecompute_();
    return 'Листы готовы. Дальше: Отчёт → Токен Яндекс Директа, затем Отчёт → Подключить Тильду.';
  });
}

/** При открытии таблицы «по» (D3) снова «вчера»; если там стояла своя дата — пересчитать. */
function drResetPeriodEnd_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(DR_SHEETS.SUMMARY);
  if (!sh || sh.getRange('D3').getFormula()) return;
  sh.getRange('D3').setFormula('=TODAY()-1');
  drRecompute_();
}
