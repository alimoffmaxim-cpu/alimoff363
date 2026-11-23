// ---------- Заявки из Google Таблицы Тильды (надёжная замена вебхука) ----------
// Веб-приложение Apps Script всегда отвечает редиректом 302, и Тильда время от времени считает это ошибкой и
// блокирует вебхук («autoblock Unknown error 302»). Встроенная интеграция Тильды «Google Таблицы» пишет заявки
// в таблицу напрямую, без вебхука. Скрипт каждые 5 минут забирает оттуда новые заявки на «Заявки»
// (колонки — по названиям, как у импорта), без дублей: по ID заявки Тильды или по телефону + минуте.

function drMenuTildaSheet() {
  const ui = SpreadsheetApp.getUi();
  const a = ui.prompt('Google Таблица заявок Тильды', 'Вставьте ссылку на Google Таблицу, куда Тильда пишет заявки ' +
    '(Тильда → Настройки сайта → Формы → Google Таблицы):', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const id = (a.getResponseText().match(/\/d\/([\w-]{20,})/) || [])[1] || a.getResponseText().trim();
  drAlert_(function () {
    SpreadsheetApp.openById(id);   // нет доступа — здесь будет понятная ошибка
    PropertiesService.getScriptProperties().setProperty('TILDA_SHEET_ID', id);
    ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'drTildaSheetPull'; })
      .forEach(function (t) { ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger('drTildaSheetPull').timeBased().everyMinutes(5).create();
    const r = drTildaSheetPull();
    return 'Подключено. Новых заявок перенесено: ' + r.added + ' (уже были: ' + r.skipped + '). ' +
      'Дальше скрипт проверяет таблицу Тильды каждые 5 минут.';
  });
}

/** Триггер раз в 5 минут: новые строки таблицы Тильды → «Заявки», пересчёт отчёта, если что-то добавилось. */
function drTildaSheetPull() {
  const id = drProp_('TILDA_SHEET_ID');
  if (!id) return { added: 0, skipped: 0 };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { added: 0, skipped: 0 };   // идёт загрузка Директа — заберём в следующий раз
  try {
    const seen = {};
    drRows_(DR_SHEETS.LEADS, 5).forEach(function (r) { seen[String(r[1])] = 1; seen[drDupKey_(r[0], r[4])] = 1; });
    const rows = [];
    let skipped = 0;
    SpreadsheetApp.openById(id).getSheets().forEach(function (sh) {
      if (sh.getLastRow() < 2) return;
      const v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
      const head = v[0].map(function (h) { return String(h).trim(); });
      v.slice(1).forEach(function (x) {
        const p = drImportParams_(head, x), at = drImportDate_(p._date);
        if (!at) return;
        const row = drLeadRow_(p, at), dup = drDupKey_(at, row[4]);
        if ((row[1] && seen[String(row[1])]) || (dup && seen[dup])) { skipped++; return; }
        if (!row[1]) row[1] = 'gs-' + Utilities.formatDate(at, DR.TIMEZONE, 'yyyyMMddHHmmss') + '-' + String(row[4]).replace(/\D/g, '').slice(-4);
        seen[String(row[1])] = 1;
        if (dup) seen[dup] = 1;
        rows.push(row);
      });
    });
    drAppendLeads_(rows);
    if (rows.length) drRecompute_();
    return { added: rows.length, skipped: skipped };
  } finally {
    lock.releaseLock();
  }
}

/** Телефон (последние 10 цифр) + минута — чтобы не задвоить заявку, пришедшую разными путями. */
function drDupKey_(at, phone) {
  const d = at instanceof Date ? Utilities.formatDate(at, DR.TIMEZONE, 'yyyy-MM-dd HH:mm') : '';
  const p = String(phone || '').replace(/\D/g, '').slice(-10);
  return d && p ? 'dup|' + p + '|' + d : '';
}
