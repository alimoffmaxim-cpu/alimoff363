/**
 * Автоматическая выгрузка статистики VK Реклама (ads.vk.com) в Google Таблицу.
 * На каждый день — одна строка: дата, общий расход и лиды по всему кабинету.
 *
 * СЕКРЕТОВ В ЭТОМ ФАЙЛЕ НЕТ И БЫТЬ НЕ ДОЛЖНО. Ключи задаются в
 * Настройки проекта → Свойства скрипта:
 *   VITAMIN_API_KEY    — API-ключ Vitamin.Tools (токены VK скрипт получает сам);
 *   VITAMIN_ACCOUNT_ID — ID рекламного кабинета в Vitamin.Tools.
 * Без них работает ручной режим: меню «VK Реклама → Ввести токен VK» (на 24 часа).
 */

const CONFIG = {
  SHEET_NAME: 'VK Итог',
  // По каким объектам суммировать итог за день (все группы объявлений кабинета)
  LEVEL: 'campaigns',
  // Какая метрика VK считается лидами (подбирается функцией debugVkMetrics)
  LEADS_METRIC: 'base.vk.result',
  // Сколько дней загружать, если лист пустой
  INITIAL_DAYS: 90,
  // Час запуска ежедневного триггера (по часовому поясу проекта)
  TRIGGER_HOUR: 7,
};

const API_BASE = 'https://ads.vk.com/api/v2';
const HEADERS = ['Дата', 'Расход, ₽', 'Лиды'];
const DAY_MS = 24 * 3600 * 1000;

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('VK Реклама')
    .addItem('Ввести токен VK (на 24 ч)', 'promptVkToken')
    .addItem('Дописать недостающие дни', 'menuUpdate')
    .addItem('Включить ежедневное обновление', 'setupDailyTrigger')
    .addToUi();
}

/**
 * Ежедневный запуск: дописывает снизу дни после последней даты на листе, до вчера включительно.
 * Обычно это одна строка — за вчера.
 */
function exportVkAdsStats() {
  const tz = Session.getScriptTimeZone();
  const yesterday = new Date(Date.now() - DAY_MS);
  const last = lastDateOnSheet_();
  const from = last ? new Date(last.getTime() + DAY_MS)
    : new Date(yesterday.getTime() - (CONFIG.INITIAL_DAYS - 1) * DAY_MS);
  const dateFrom = Utilities.formatDate(from, tz, 'yyyy-MM-dd');
  const dateTo = Utilities.formatDate(yesterday, tz, 'yyyy-MM-dd');
  if (dateFrom > dateTo) return { objects: 0, rows: 0 }; // вчерашний день уже есть
  return exportRange_(dateFrom, dateTo);
}

/** Последняя дата в колонке A (или null, если лист пуст). */
function lastDateOnSheet_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEET_NAME);
  if (!sh || sh.getLastRow() < 2) return null;
  const dates = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues()
    .map(function (r) { return r[0] instanceof Date ? r[0] : new Date(String(r[0]) + 'T12:00:00'); })
    .filter(function (d) { return !isNaN(d); });
  return dates.length ? new Date(Math.max.apply(null, dates)) : null;
}

/** Сохраняет разовый токен из агентского кабинета и сразу дописывает недостающие дни. */
function promptVkToken() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Токен VK Реклама', 'Вставьте токен доступа (действует 24 часа):', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const token = res.getResponseText().trim().replace(/^Bearer\s+/i, '');
  if (!token) return;
  PropertiesService.getScriptProperties().setProperties({
    VK_ACCESS_TOKEN: token,
    VK_TOKEN_EXPIRES: String(Date.now() + DAY_MS),
    VK_MANUAL_TOKEN: '1',
  });
  runWithAlert_(exportVkAdsStats);
}

function menuUpdate() { runWithAlert_(exportVkAdsStats); }

function runWithAlert_(fn) {
  const ui = SpreadsheetApp.getUi();
  try {
    const r = fn();
    ui.alert(r.rows ? 'Готово. Добавлено дней: ' + r.rows + ' (лист «' + CONFIG.SHEET_NAME + '»).'
      : 'Новых дней нет: данные до вчера уже на листе.');
  } catch (e) {
    ui.alert('Ошибка: ' + e.message);
  }
}
