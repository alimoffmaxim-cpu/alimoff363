/**
 * Приём заявок с лендинга «Электромотоциклы в Зеленограде» (Тильда, блок T123).
 * Каждая заявка: строка в листе «Заявки» + сообщение в Telegram + письмо на почту.
 *
 * СЕКРЕТОВ В ЭТОМ ФАЙЛЕ НЕТ И БЫТЬ НЕ ДОЛЖНО. Ключи задаются в
 * Настройки проекта → Свойства скрипта:
 *   TG_BOT_TOKEN — токен Telegram-бота от @BotFather (необязательно);
 *   TG_CHAT_ID   — ID чата/группы, куда слать заявки (необязательно);
 *   NOTIFY_EMAIL — почта для уведомлений, можно несколько через запятую (необязательно).
 * Любой канал без настроек просто пропускается — заявка всё равно попадёт в таблицу.
 */

const CONFIG = {
  SHEET_NAME: 'Заявки',
  LEAD_TITLE: 'Электромотоциклы, Зеленоград',
};

const HEADERS = ['Дата', 'Имя', 'Телефон', 'Возраст ребёнка', 'Удобный день',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'Страница', 'Откуда пришёл'];

/** Точка входа веб-приложения: сюда лендинг отправляет форму. */
function doPost(e) {
  const p = (e && e.parameter) || {};
  // Honeypot: живой человек это скрытое поле не заполняет
  if (p.website) return json_({ ok: true });

  const lead = {
    name: clean_(p.name, 80),
    phone: normalizePhone_(p.phone),
    age: clean_(p.age, 10),
    day: clean_(p.day, 40),
  };
  if (!lead.name || !lead.phone) return json_({ ok: false, error: 'invalid' });

  const utm = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
    .map(k => clean_(p[k], 200));
  // Апостроф: иначе таблица превратит «+7915…» в число
  const row = [new Date(), lead.name, "'" + lead.phone, lead.age, lead.day]
    .concat(utm, [clean_(p.page, 300), clean_(p.referrer, 300)]);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    getSheet_().appendRow(row);
  } finally {
    lock.releaseLock();
  }

  // Уведомления не должны терять заявку: ошибки только логируем
  const text = formatLead_(lead, utm[0]);
  [sendTelegram_, sendEmail_, sendToCrm_].forEach(fn => {
    try { fn(text, lead); } catch (err) { console.error(fn.name + ': ' + err); }
  });

  return json_({ ok: true });
}

/** Открытие URL веб-приложения в браузере — быстрая проверка, что деплой живой. */
function doGet() {
  return json_({ ok: true, service: 'lead-form' });
}

function getSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

function formatLead_(lead, source) {
  return [
    '🏁 Новая заявка: ' + CONFIG.LEAD_TITLE,
    'Имя: ' + lead.name,
    'Телефон: ' + lead.phone,
    'Возраст ребёнка: ' + (lead.age || '—'),
    'Удобный день: ' + (lead.day || '—'),
    'Источник: ' + (source || '—'),
  ].join('\n');
}

function sendTelegram_(text) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('TG_BOT_TOKEN');
  const chatId = props.getProperty('TG_CHAT_ID');
  if (!token || !chatId) return;
  UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post',
    payload: { chat_id: chatId, text: text },
    muteHttpExceptions: true,
  });
}

function sendEmail_(text) {
  const to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL');
  if (!to) return;
  MailApp.sendEmail(to, 'Заявка: ' + CONFIG.LEAD_TITLE, text);
}

/** Заглушка под CRM: когда появится amoCRM/Bitrix24 — отправку вебхука добавить сюда. */
function sendToCrm_(text, lead) {}

/** Приводит телефон к виду +7XXXXXXXXXX; возвращает '' если номер неполный. */
function normalizePhone_(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 11 && (d[0] === '7' || d[0] === '8')) d = d.slice(1);
  return d.length === 10 ? '+7' + d : '';
}

function clean_(v, max) {
  // Апостроф в начале не даёт таблице выполнить «=формулу» из формы
  const s = String(v || '').trim().slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Запустите вручную в редакторе: создаст лист и проверит Telegram/почту тестовой заявкой. */
function testLead() {
  doPost({ parameter: { name: 'Тест', phone: '+7 915 000-00-00', age: '6', day: 'Суббота',
    utm_source: 'test' } });
}
