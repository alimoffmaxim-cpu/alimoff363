/**
 * Отчёт «Директ + Тильда»: расход, показы и клики из Яндекс Директа (по кампаниям, группам и объявлениям)
 * и реальные заявки с сайта на Тильде, сопоставленные с кампанией, группой и объявлением по меткам.
 *
 * Данные Директа и заявки хранятся на листах «Данные Директа» и «Заявки»; листы отчёта («Сводная»,
 * «Кампании», «Группы», «Объявления») скрипт пересчитывает за период, заданный на «Сводной».
 *
 * СЕКРЕТОВ В КОДЕ НЕТ: токен Директа и ключ вебхука Тильды — в Свойствах скрипта, вводятся через меню.
 */

const DR = {
  TIMEZONE: 'Europe/Moscow',     // часовой пояс отчёта и автообновления
  UPDATE_HOUR: 1,                // автообновление раз в сутки в этот час: загружаются данные по вчера
  INITIAL_DAYS: 180,             // глубина первой загрузки из Директа
  REFRESH_DAYS: 3,               // последние N дней перезагружаются каждый раз (Директ досчитывает)
  VAT_PERCENT: 22,               // для колонки «Расход с НДС» (Директ отдаёт расход без НДС)
  DIRECT_SOURCE: 'yandex|yadirect|direct|^ya$',   // utm_source заявок из Директа (регулярное выражение)
};

const DR_SHEETS = {
  SUMMARY: 'Сводная', CAMPAIGNS: 'Кампании', GROUPS: 'Группы', ADS: 'Объявления',
  LEADS: 'Заявки', RULES: 'Сопоставление меток', DATA: 'Данные Директа', TEXTS: 'Тексты объявлений',
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Отчёт')
    .addItem('🧱 Создать / обновить листы', 'drSetup')
    .addItem('🔄 Загрузить данные из Директа', 'drMenuUpdate')
    .addItem('🧮 Пересчитать отчёт', 'drMenuRecompute')
    .addItem('⏰ Включить автообновление', 'drSetupTrigger')
    .addSeparator()
    .addItem('🔑 Токен Яндекс Директа', 'drPromptDirect')
    .addItem('🌐 Подключить Тильду (вебхук)', 'drMenuTilda')
    .addItem('🧪 Тестовая заявка', 'drTestLead')
    .addToUi();
  try { drResetPeriodEnd_(); } catch (e) { /* листов ещё нет */ }
}

/** Автообновление (раз в сутки в UPDATE_HOUR по TIMEZONE): Директ по вчера + пересчёт отчёта. */
function drDailyUpdate() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) throw new Error('Отчёт уже обновляется, попробуйте через минуту.');
  try {
    const n = drLoadDirect_();
    drRecompute_();
    drStatus_('✅ ' + drNow_() + ' — Директ загружен по ' + drYesterday_().split('-').reverse().join('.') + ' (' + n + ' строк)');
    return n;
  } catch (e) {
    drStatus_('❌ ' + drNow_() + ' — ' + e.message);
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function drMenuUpdate() {
  drAlert_(function () { return 'Готово: загружено строк Директа — ' + drDailyUpdate() + '. Отчёт пересчитан.'; });
}

function drMenuRecompute() {
  drAlert_(function () { const r = drRecompute_(); return 'Отчёт пересчитан: заявок за период — ' + r.leads + '.'; });
}

function drSetupTrigger() {
  ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'drDailyUpdate'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('drDailyUpdate').timeBased().everyDays(1).atHour(DR.UPDATE_HOUR).nearMinute(5)
    .inTimezone(DR.TIMEZONE).create();
  SpreadsheetApp.getUi().alert('Автообновление включено: каждый день около ' + DR.UPDATE_HOUR + ':00 по Москве ' +
    'загружаются данные Директа по вчера и пересчитывается отчёт. Заявки с Тильды приходят сразу.');
}

/** Простой триггер: поменяли даты периода на «Сводной» (B3 или D3) — пересчитать отчёт. */
function onEdit(e) {
  const a = e && e.range;
  if (!a || a.getSheet().getName() !== DR_SHEETS.SUMMARY || a.getRow() > 3 || a.getLastRow() < 3 ||
    a.getColumn() > 4 || a.getLastColumn() < 2) return;
  drRecompute_();
}

/** Статус последнего обновления — строка 2 «Сводной» (справа). */
function drStatus_(text) {
  try { SpreadsheetApp.getActive().getSheetByName(DR_SHEETS.SUMMARY).getRange('H2').setValue(String(text).slice(0, 250)); }
  catch (e) { /* «Сводной» ещё нет */ }
}

function drAlert_(fn) {
  const ui = SpreadsheetApp.getUi();
  try { ui.alert(fn()); } catch (e) { ui.alert('Ошибка: ' + e.message); }
}

function drProp_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }
