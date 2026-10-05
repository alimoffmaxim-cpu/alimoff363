// ---------- Подключение кабинетов через меню ----------

/** Спрашивает номер направления; возвращает его или null. */
function sovaAskCabinet_(title) {
  const ui = SpreadsheetApp.getUi();
  const cabs = sovaCabinets_();
  const list = cabs.map(function (c, i) { return (i + 1) + ' — ' + c.name; }).join('\n');
  const a = ui.prompt(title, 'Номер направления:\n' + list, ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return null;
  const cab = cabs[Number(a.getResponseText().trim()) - 1];
  if (!cab) ui.alert('Нет направления с таким номером.');
  return cab || null;
}

function sovaAskText_(title, text) {
  const ui = SpreadsheetApp.getUi();
  const a = ui.prompt(title, text, ui.ButtonSet.OK_CANCEL);
  return a.getSelectedButton() === ui.Button.OK ? a.getResponseText().trim() : '';
}

/** Основной способ: client_id и client_secret кабинета — дальше токены скрипт получает сам. */
function connectCabinet() {
  const cab = sovaAskCabinet_('Подключить кабинет VK');
  if (!cab) return;
  const id = sovaAskText_('Кабинет «' + cab.name + '»', 'client_id (ads.vk.com → Настройки → Доступ к API):');
  if (!id) return;
  const secret = sovaAskText_('Кабинет «' + cab.name + '»', 'client_secret:');
  if (!secret) return;
  sovaSaveCreds_(cab, id, secret);
  sovaCheckCabinet_(cab);
}

/** Запасной способ: готовый токен на 24 часа (например, если доступ к API ещё не выдан). */
function promptCabinetToken() {
  const cab = sovaAskCabinet_('Токен VK на 24 часа');
  if (!cab) return;
  const token = sovaAskText_('Токен VK — ' + cab.name, 'Вставьте токен доступа (действует 24 часа):').replace(/^Bearer\s+/i, '');
  if (!token) return;
  sovaSaveToken_(cab, token, Date.now() + SOVA_DAY_MS);
  sovaCheckCabinet_(cab);
}

/** Пробный запрос к кабинету: пишет статус на лист настроек и показывает результат. */
function sovaCheckCabinet_(cab) {
  const cell = sovaSettingsSheet_().getRange(cab.row, 2);
  const tz = Session.getScriptTimeZone();
  try {
    const n = sovaObjectIds_(cab).length;
    cell.setValue('✅ подключён, кампаний: ' + n + ' (' + Utilities.formatDate(new Date(), tz, 'dd.MM HH:mm') + ')');
    SpreadsheetApp.getUi().alert('Кабинет «' + cab.name + '» подключён, кампаний: ' + n +
      '.\nТеперь: 🦉 Сова → Загрузить новые данные из VK.');
  } catch (e) {
    cell.setValue('❌ ошибка: ' + e.message.slice(0, 120));
    SpreadsheetApp.getUi().alert('Не удалось подключить «' + cab.name + '»: ' + e.message);
  }
}
