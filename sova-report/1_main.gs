/**
 * Отчёт «Сова»: статистика VK Реклама (ads.vk.com) из нескольких кабинетов → Google Таблица.
 * 1 кабинет = 1 направление клиники.
 *
 * Скрипт только дописывает строки в лист «Данные» (1 строка = 1 день одного направления,
 * итог всех кампаний кабинета). «🦉 Сводная», листы направлений и графики считаются
 * формулами из «Данных» и обновляются сами — их скрипт не трогает.
 *
 * СЕКРЕТОВ В КОДЕ НЕТ. Направления — на листе «⚙ Настройки», токен API каждого кабинета
 * (выдаёт eLama) вводится через меню «🦉 Сова» и хранится в Свойствах скрипта.
 */

const SOVA = {
  SETTINGS_SHEET: '⚙ Настройки',
  DATA_SHEET: 'Данные',
  LEVEL: 'campaigns',                 // объекты VK, по которым суммируется итог кабинета
  LEADS_METRIC: 'base.vk.result',     // метрика лидов по умолчанию (можно переопределить на листе настроек)
  INITIAL_DAYS: 365,                  // сколько дней загрузить при первом запуске
  REFRESH_DAYS: 3,                    // последние N дней перезагружаются каждый раз (VK досчитывает конверсии)
  TRIGGER_HOUR: 7,                    // час ежедневного обновления (часовой пояс проекта)
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🦉 Сова')
    .addItem('🔄 Загрузить новые данные из VK', 'menuUpdateAll')
    .addItem('⏰ Включить ежедневное обновление', 'setupSovaTrigger')
    .addSeparator()
    .addItem('🔑 Ввести токен кабинета (из eLama)', 'promptCabinetToken')
    .addItem('🔑 Подключить кабинет по client_id / secret', 'connectCabinet')
    .addSeparator()
    .addItem('🗑 Удалить все строки с листа «Данные»', 'menuClearData')
    .addToUi();
}

/** Ежедневный запуск (триггер): догрузить данные всех кабинетов до вчера включительно. */
function sovaDailyUpdate() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) throw new Error('Данные уже загружаются, попробуйте через минуту.');
  try {
    const res = sovaSyncAll_();
    if (res.errors.length) throw new Error('Не загрузились: ' + res.errors.join(' | '));
    return res;
  } finally {
    lock.releaseLock();
  }
}

function menuUpdateAll() {
  sovaAlert_(function () {
    const res = sovaDailyUpdate();
    const parts = Object.keys(res.added).map(function (n) { return '• ' + n + ': ' + res.added[n] + ' дн.'; });
    return 'Готово. Загружено:\n' + (parts.join('\n') || 'нет новых дней');
  });
}

function menuClearData() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('Удалить все строки с листа «Данные»?', 'Например, демо-данные перед первой реальной загрузкой. ' +
    'Настройки и оформление отчёта останутся.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  sovaAlert_(function () { sovaWriteData_({}); return 'Данные удалены.'; });
}

function setupSovaTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'sovaDailyUpdate'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sovaDailyUpdate').timeBased().everyDays(1).atHour(SOVA.TRIGGER_HOUR).create();
  try {
    SpreadsheetApp.getUi().alert('Ежедневное обновление включено: каждый день около ' + SOVA.TRIGGER_HOUR + ':00.');
  } catch (e) { /* запуск из редактора без UI */ }
}

/** Выполняет действие меню и показывает результат или ошибку. */
function sovaAlert_(fn) {
  const ui = SpreadsheetApp.getUi();
  try {
    ui.alert(fn());
  } catch (e) {
    ui.alert('Ошибка: ' + e.message);
  }
}
