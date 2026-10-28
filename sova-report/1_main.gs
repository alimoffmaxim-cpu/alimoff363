/**
 * Отчёт «Сова»: статистика VK Реклама (ads.vk.com) из нескольких кабинетов → Google Таблица.
 * 1 кабинет = 1 направление клиники.
 *
 * Скрипт только дописывает строки в лист «Данные» (1 строка = 1 день одного направления,
 * итог всех кампаний кабинета). «Сводная», листы направлений и графики считаются
 * формулами из «Данных» и обновляются сами — их скрипт не трогает.
 *
 * СЕКРЕТОВ В КОДЕ НЕТ. Направления — на листе «⚙ Настройки», токен API каждого кабинета
 * (выдаёт eLama) вводится через меню «Сова» и хранится в Свойствах скрипта.
 */

const SOVA = {
  SETTINGS_SHEET: '⚙ Настройки',
  DATA_SHEET: 'Данные',
  LEVEL: 'campaigns',                 // объекты VK, по которым суммируется итог кабинета
  LEADS_METRIC: 'base.vk.result',     // метрика подписок (вступлений): результат по цели кампании; можно переопределить на листе настроек
  INITIAL_DAYS: 365,                  // сколько дней загрузить при первом запуске
  REFRESH_DAYS: 3,                    // последние N дней перезагружаются каждый раз (VK досчитывает конверсии)
  UPDATE_HOUR: 1,                     // автообновление раз в сутки в этот час (Google запускает в пределах ~15 мин)
  TIMEZONE: 'Europe/Moscow',          // часовой пояс автообновления и «вчера»
  VAT_PERCENT: 22,                    // НДС для колонки «Расход с НДС» (VK отдаёт расход без НДС)
  TRENDS_FROM: '2026-09-21',          // недели и месяцы в таблицах — не раньше этой недели (пусто — с первых данных)
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Сова')
    .addItem('🧱 Создать / пересобрать отчёт', 'sovaBuildReport')
    .addItem('🔄 Загрузить новые данные из VK', 'menuUpdateAll')
    .addItem('⏰ Включить автообновление', 'setupSovaTrigger')
    .addItem('🩺 Проверить автообновление', 'sovaCheckUpdates')
    .addSeparator()
    .addItem('🔑 Ввести токен кабинета (из eLama)', 'promptCabinetToken')
    .addItem('🔑 Подключить кабинет по client_id / secret', 'connectCabinet')
    .addSeparator()
    .addItem('🗑 Удалить все строки с листа «Данные»', 'menuClearData')
    .addToUi();
  if (typeof sbResetPeriodEnds_ === 'function') sbResetPeriodEnds_();   // «по» снова «вчера» (11_days.gs)
}

/** Автообновление (триггер, раз в сутки в UPDATE_HOUR по TIMEZONE): догрузить данные всех кабинетов по вчера. */
function sovaDailyUpdate() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) throw new Error('Данные уже загружаются, попробуйте через минуту.');
  try {
    const res = sovaSyncAll_();
    if (res.errors.length) throw new Error('Не загрузились: ' + res.errors.join(' | '));
    sovaStatus_('✅ ' + sovaNow_() + ' — данные загружены по вчера (' + sovaYesterday_().split('-').reverse().join('.') + ')');
    return res;
  } catch (e) {
    sovaStatus_('❌ ' + sovaNow_() + ' — ' + e.message);   // видно на листе настроек; Google ещё пришлёт письмо
    throw e;
  } finally {
    lock.releaseLock();
  }
}

/** Пишет результат последнего обновления в «⚙ Настройки»!F5. */
function sovaStatus_(text) {
  try { sovaSettingsSheet_().getRange('F5').setValue(String(text).slice(0, 300)); } catch (e) { /* лист настроек недоступен */ }
}

function sovaNow_() { return Utilities.formatDate(new Date(), SOVA.TIMEZONE, 'dd.MM HH:mm'); }

/** Вчера по TIMEZONE: 'yyyy-MM-dd'. В 01:00 28.10 — это 27.10. */
function sovaYesterday_() { return Utilities.formatDate(new Date(Date.now() - SOVA_DAY_MS), SOVA.TIMEZONE, 'yyyy-MM-dd'); }

/** Меню: есть ли триггер автообновления и чем закончился последний запуск. */
function sovaCheckUpdates() {
  const n = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'sovaDailyUpdate'; }).length;
  const last = String(sovaSettingsSheet_().getRange('F5').getValue() || 'ещё не запускалось');
  SpreadsheetApp.getUi().alert((n ? '✅ Автообновление включено: каждый день около ' + SOVA.UPDATE_HOUR + ':00 по Москве, данные за вчера.'
    : '❌ Автообновление выключено. Включите: «Сова → Включить автообновление».') +
    (n > 1 ? '\n⚠ Триггеров несколько (' + n + ') — нажмите «Включить автообновление», останется один.' : '') +
    '\n\nПоследнее обновление: ' + last +
    '\n\nПодробности об ошибках: Расширения → Apps Script → «Выполнения».');
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
  sovaAlert_(function () { sovaWriteData_({}); sbDaysAll_(); return 'Данные удалены.'; });
}

function setupSovaTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'sovaDailyUpdate'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sovaDailyUpdate').timeBased().everyDays(1).atHour(SOVA.UPDATE_HOUR).nearMinute(5)
    .inTimezone(SOVA.TIMEZONE).create();
  try {
    SpreadsheetApp.getUi().alert('Автообновление включено: каждый день около ' + SOVA.UPDATE_HOUR + ':00 по Москве: ' +
      'загружаются данные по вчера включительно, последние ' + SOVA.REFRESH_DAYS + ' дня — заново (VK досчитывает).');
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
