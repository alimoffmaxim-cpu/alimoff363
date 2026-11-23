// ---------- Подключение кабинетов через меню ----------

/** Спрашивает направление (номер или название); возвращает его или null. */
function sovaAskCabinet_(title) {
  const ui = SpreadsheetApp.getUi();
  const cabs = sovaCabinets_();
  const list = cabs.map(function (c, i) { return (i + 1) + ' — ' + c.name; }).join('\n');
  const a = ui.prompt(title, 'Шаг 1 из 2. Введите только номер направления (цифру), токен спросим следующим окном:\n' + list,
    ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return null;
  const text = a.getResponseText().trim(), num = text.match(/^\d+/);
  const cab = num ? cabs[Number(num[0]) - 1]
    : cabs.filter(function (c) { return c.name.toLowerCase() === text.toLowerCase(); })[0];
  if (cab) return cab;
  ui.alert(text.length > 30
    ? 'Похоже, в это окно вставлен токен. Сначала введите номер направления (1–' + cabs.length + '), токен — в следующем окне.'
    : 'Нет направления «' + text + '». Введите цифру от 1 до ' + cabs.length + '.');
  return null;
}

function sovaAskText_(title, text) {
  const ui = SpreadsheetApp.getUi();
  const a = ui.prompt(title, text, ui.ButtonSet.OK_CANCEL);
  return a.getSelectedButton() === ui.Button.OK ? a.getResponseText().trim() : '';
}

/** Если вместо токена выдали client_id и client_secret — дальше токены скрипт получает сам. */
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

/** Основной способ: постоянный токен кабинета, который выдаёт eLama (свой на каждый кабинет). */
function promptCabinetToken() {
  const cab = sovaAskCabinet_('Токен кабинета VK');
  if (!cab) return;
  const token = sovaAskText_('Токен — ' + cab.name, 'Шаг 2 из 2. Вставьте токен API этого кабинета (из письма eLama):').replace(/^Bearer\s+/i, '');
  if (!token) return;
  sovaSaveToken_(cab, token, Date.now() + 100 * 365 * SOVA_DAY_MS); // токен eLama бессрочный
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
      '.\nТеперь: Сова → Загрузить новые данные из VK.');
  } catch (e) {
    cell.setValue('❌ ошибка: ' + e.message.slice(0, 120));
    SpreadsheetApp.getUi().alert('Не удалось подключить «' + cab.name + '»: ' + e.message);
  }
}
