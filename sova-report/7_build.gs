// ---------- Построение отчёта в пустой таблице: меню «Создать / пересобрать отчёт» ----------
// Строит те же листы, что шаблон sova-report.xlsx: «Сводная», лист на каждое направление,
// «⚙ Настройки» и «Данные». Все цифры — формулы из «Данных», поэтому отчёт обновляется сам.

const SB = {
  SUMMARY: 'Сводная',
  OLD_SUMMARY: '\uD83E\uDD89 Сводная',   // название в первой версии, удаляется при пересборке
  // геттеры: SOVA объявлен в другом файле, а порядок загрузки файлов в Apps Script не гарантирован
  get D() { return "'" + SOVA.DATA_SHEET + "'"; },
  get SET() { return "'" + SOVA.SETTINGS_SHEET + "'"; },
  NAVY: '#1f2a44', HEAD: '#2f3e60', BAND: '#f4f6fa', LINE: '#dfe3eb', INK: '#1f2430', MUTED: '#6b7280',
  SUBS: '#1baf7a', SPEND: '#2a78d6', COST: '#eb6834', UP: '#1a7f37', DOWN: '#c62828',
  COLS: ['Период', 'Расход', 'Показы', 'Клики', 'CTR', 'CPC', 'Подписки', 'Цена подписки', 'CR в подписку'],
  FMT: [null, '#,##0" ₽"', '#,##0', '#,##0', '0.00%', '#,##0.0" ₽"', '#,##0', '#,##0.0" ₽"', '0.0%'],
  GOOD: [0, 0, 1, 1, 1, -1, 1, -1, 1],   // +1 — хорошо, когда растёт; −1 — когда падает
  DELTA: '"▲ "0%;"▼ "0%;0%',
  WIDTHS: [130, 89, 89, 89, 89, 89, 89, 89, 89, 82, 82, 26],
  MONTHS: 12, WEEKS: 26, DAYS: 90,
};

function sovaBuildReport() {
  const ss = SpreadsheetApp.getActive(), ui = SpreadsheetApp.getUi();
  if ((ss.getSheetByName(SB.SUMMARY) || ss.getSheetByName(SB.OLD_SUMMARY)) && ui.alert('Пересобрать отчёт?', 'Листы «Сводная» и направлений будут созданы ' +
    'заново. «Данные», токены и направления на листе настроек сохранятся.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  sovaAlert_(function () {
    ss.setSpreadsheetLocale('ru_RU');
    ss.setSpreadsheetTimeZone('Europe/Moscow');
    sbBuildSettings_(ss);
    const cabs = sovaCabinets_(), data = sbBuildData_(ss);
    const demo = data.getLastRow() < 2 && ui.alert('Заполнить демо-данными?', 'Лист «Данные» пуст. Демо-цифры за год ' +
      'покажут, как выглядит отчёт. Перед реальной загрузкой их удаляют через меню «Сова».', ui.ButtonSet.YES_NO) === ui.Button.YES;
    if (demo) sbDemoData_(data, cabs);
    const periods = {};   // ручной период каждого листа переживает пересборку
    [SB.SUMMARY].concat(cabs.map(function (c) { return c.name; })).forEach(function (name) {
      const sh = ss.getSheetByName(name);
      if (sh) periods[name] = sh.getRange('H3:J3').getValues()[0].filter(function (v, i) { return i !== 1; })
        .map(function (v) { return v instanceof Date ? v : ''; });
    });
    const keep = [SOVA.SETTINGS_SHEET, SOVA.DATA_SHEET];
    [SB.SUMMARY, SB.OLD_SUMMARY].concat(cabs.map(function (c) { return c.name; })).forEach(function (name) {
      const s = ss.getSheetByName(name);
      if (s && keep.indexOf(name) < 0) ss.deleteSheet(s);
    });
    ['Лист1', 'Sheet1'].forEach(function (name) {   // пустой лист новой таблицы
      const s = ss.getSheetByName(name);
      if (s && s.getLastRow() === 0) ss.deleteSheet(s);
    });
    sbSummary_(ss, cabs, periods[SB.SUMMARY]);
    cabs.forEach(function (c, i) { sbDirection_(ss, c, i + 1, periods[c.name]); });
    ss.setActiveSheet(ss.getSheetByName(SB.SUMMARY));
    return 'Отчёт построен: «Сводная» и листов направлений: ' + cabs.length + (demo ? ', с демо-данными' : '') +
      '.\nДальше: «Сова → Ввести токен кабинета» для каждого направления.';
  });
}

/** Лист настроек: направления (сохраняются, если лист уже был), отчётная дата и подсказки. */
function sbBuildSettings_(ss) {
  let sh = ss.getSheetByName(SOVA.SETTINGS_SHEET), rows = [];
  if (sh) {
    const vals = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues() : [];
    for (let i = 0; i < vals.length && String(vals[i][0]).trim(); i++) rows.push(vals[i]);
    sh.clear();
    sh.clearConditionalFormatRules();
  } else {
    sh = ss.insertSheet(SOVA.SETTINGS_SHEET);
  }
  if (!rows.length) rows = [1, 2, 3].map(function (i) { return ['Направление ' + i, '❌ не подключён', '', SOVA_DIR_COLORS[i - 1]]; });
  sbSetup_(sh, '#9aa3b2', [240, 260, 200, 110, 24, 720]);
  sbHeader_(sh, 1, ['Направление (= название листа)', 'Подключение (заполняет скрипт)', 'Метрика подписок (необяз.)', 'Цвет (необяз.)']);
  sh.getRange(2, 1, rows.length, 4).setValues(sbLoc_(rows));
  sh.getRange(2, 1, rows.length, 1).setFontWeight('bold');
  sh.getRange(2, 2, rows.length, 1).setFontColor(SB.MUTED);
  rows.forEach(function (r, i) {
    const c = String(r[3]).trim();
    if (/^#[0-9a-f]{6}$/i.test(c)) sh.getRange(i + 2, 4).setBackground(c).setFontColor('#ffffff').setFontWeight('bold');
  });
  sh.getRange('F1').setValue('Отчёт строится по дату (последний день в «Данные», а если они пусты — вчера)')
    .setBackground(SB.HEAD).setFontColor('#ffffff').setFontWeight('bold');
  sh.getRange('F2').setFormula(sbLocF_('=IF(COUNT(' + SB.D + '!$A:$A),INT(MAX(' + SB.D + '!$A:$A)),TODAY()-1)')).setNumberFormat('dd.MM.yyyy').setFontWeight('bold');
  sh.getRange(4, 6, 8, 1).setValues(sbLoc_([
    ['Как пользоваться:'],
    ['• Направления — в колонке A подряд, без пустых строк: 1 строка = 1 кабинет VK. Строка, начинающаяся с #, пропускается.'],
    ['• Название направления — это и название его листа. Переименовали — подключите кабинет заново и пересоберите отчёт.'],
    ['• Токен кабинета (из eLama): меню «Сова → Ввести токен кабинета». Статус появится в колонке B.'],
    ['• Метрика подписок — оставьте пустой, если подписки считаются как обычно (' + SOVA.LEADS_METRIC + ').'],
    ['• Все цифры берутся с листа «Данные»: 1 строка = 1 день одного направления (итог всех кампаний кабинета).'],
    ['• «Этот месяц» = с 1-го числа по отчётную дату; сравнение — с теми же днями прошлого месяца. Неделя — пн–вс.'],
    ['• Добавили направление — «Сова → Создать / пересобрать отчёт».'],
  ])).setFontColor(SB.MUTED);
  sh.getRange('F4').setFontWeight('bold').setFontColor(SB.INK);
  sh.setFrozenRows(1);
  return sh;
}

function sbBuildData_(ss) {
  const sh = ss.getSheetByName(SOVA.DATA_SHEET) || ss.insertSheet(SOVA.DATA_SHEET);
  sbSetup_(sh, '#9aa3b2', [90, 160, 90, 90, 75, 75]);
  sbHeader_(sh, 1, SOVA_DATA_HEAD);
  sh.setFrozenRows(1);
  return sh;
}
