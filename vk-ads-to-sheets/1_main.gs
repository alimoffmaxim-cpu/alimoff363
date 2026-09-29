/**
 * Автоматическая выгрузка статистики VK Реклама (ads.vk.com) в Google Таблицу.
 *
 * СЕКРЕТОВ В ЭТОМ ФАЙЛЕ НЕТ И БЫТЬ НЕ ДОЛЖНО. Два режима:
 *
 * 1) Ручной токен (на 24 часа, из агентского кабинета):
 *    меню таблицы «VK Реклама → Ввести токен VK». Токен сохраняется в Свойствах
 *    скрипта, код не меняется. Пока токен жив, работает ежедневный триггер;
 *    при вводе нового токена скрипт сам догружает пропущенные дни.
 *
 * 2) Полная автоматика (если агентство выдаст доступ к API):
 *    Настройки проекта (шестерёнка) → Свойства скрипта:
 *      VK_CLIENT_ID, VK_CLIENT_SECRET — ключи API
 *      VK_AGENCY_CLIENT_NAME — (для ключей агентства) имя клиента в агентском кабинете
 *    Токены скрипт получает и обновляет сам.
 */

const CONFIG = {
  SHEET_NAME: 'VK Итог',
  // По каким объектам суммировать итог за день (все группы объявлений кабинета)
  LEVEL: 'campaigns',
  // Сколько последних дней перезаписывать при каждом запуске (VK досчитывает статистику задним числом)
  DAYS_BACK: 7,
  // Час запуска ежедневного триггера (по часовому поясу проекта)
  TRIGGER_HOUR: 7,
};

const API_BASE = 'https://ads.vk.com/api/v2';
const HEADERS = ['Дата', 'Расход, ₽', 'Лиды'];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('VK Реклама')
    .addItem('Ввести токен VK (на 24 ч)', 'promptVkToken')
    .addItem('Обновить статистику', 'exportVkAdsStats')
    .addItem('Загрузить последние 90 дней', 'backfill90Days')
    .addItem('Включить ежедневное обновление', 'setupDailyTrigger')
    .addToUi();
}

/** Основная функция: её вызывает ежедневный триггер. Догружает всё с последней даты на листе. */
function exportVkAdsStats() {
  return exportForDays_(Math.max(CONFIG.DAYS_BACK, daysSinceLastRow_()));
}

/** Сохраняет разовый токен из агентского кабинета и сразу выгружает статистику. */
function promptVkToken() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Токен VK Реклама', 'Вставьте токен доступа (действует 24 часа):', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const token = res.getResponseText().trim().replace(/^Bearer\s+/i, '');
  if (!token) return;
  PropertiesService.getScriptProperties().setProperties({
    VK_ACCESS_TOKEN: token,
    VK_TOKEN_EXPIRES: String(Date.now() + 24 * 3600 * 1000),
    VK_MANUAL_TOKEN: '1',
  });
  try {
    const r = exportVkAdsStats();
    ui.alert('Готово. Групп объявлений: ' + r.objects + ', дней со статистикой: ' + r.rows +
      ' (лист «' + CONFIG.SHEET_NAME + '» внизу таблицы). Токен действует до ' +
      Utilities.formatDate(new Date(Date.now() + 24 * 3600 * 1000), Session.getScriptTimeZone(), 'dd.MM HH:mm'));
  } catch (e) {
    ui.alert('Ошибка: ' + e.message);
  }
}

/** Сколько дней прошло с последней даты на листе (90, если лист пуст). */
function daysSinceLastRow_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEET_NAME);
  if (!sh || sh.getLastRow() < 2) return 90;
  const dates = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues()
    .map(function (r) { return r[0] instanceof Date ? r[0] : new Date(String(r[0])); })
    .filter(function (d) { return !isNaN(d); });
  if (!dates.length) return 90;
  const last = Math.max.apply(null, dates);
  return Math.min(365, Math.ceil((Date.now() - last) / (24 * 3600 * 1000)) + 1);
}

/** Разовая дозагрузка истории. */
function backfill90Days() {
  exportForDays_(90);
}
