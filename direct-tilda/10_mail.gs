// ---------- Все заявки из Тильды — из писем-уведомлений Тильды в Gmail ----------
// У Тильды нет API для выгрузки заявок, но о каждой заявке она присылает письмо (Настройки сайта → Формы → Email).
// Скрипт сам находит эти письма в почте Google-аккаунта, от имени которого работает, и переносит заявки
// на лист «Заявки» с метками: кнопка — за всё время, автоматически — каждый час за последние 2 дня.
// Повторов нет: заявка с тем же ID Тильды (из вебхука или письма) не дублируется.

const DR_MAIL_QUERY = 'from:(tilda.ws OR tilda.cc OR tilda.ru OR tildacdn.com)';   // запрос Gmail по умолчанию

function drMailAll() {
  drAlert_(function () {
    let r = drMailLocked_(0);
    if (!r.found) {
      const ui = SpreadsheetApp.getUi();
      const a = ui.prompt('Письма с заявками не найдены', 'В почте ' + Session.getEffectiveUser().getEmail() +
        ' нет писем Тильды по запросу: ' + drMailQuery_() + '\n\nЕсли уведомления о заявках приходят с другого адреса — ' +
        'введите адрес отправителя (как в письме) или запрос Gmail (from:… subject:…). Пусто — отмена.', ui.ButtonSet.OK_CANCEL);
      const q = a.getSelectedButton() === ui.Button.OK ? a.getResponseText().trim() : '';
      if (!q) return 'Заявки не загружены: в почте ' + Session.getEffectiveUser().getEmail() + ' нет писем Тильды. ' +
        'Уведомления о заявках должны приходить в эту почту: Тильда → Настройки сайта → Формы → Email.';
      PropertiesService.getScriptProperties().setProperty('MAIL_QUERY', /:/.test(q) ? q : 'from:(' + q + ')');
      r = drMailLocked_(0);
    }
    const res = r.added ? drRecompute_() : null;
    return 'Письма Тильды: заявок найдено — ' + r.found + ', новых добавлено — ' + r.added + ', уже были — ' + r.skipped + '.' +
      (r.cut ? '\nПисем много — не успел все за раз. Нажмите пункт ещё раз, продолжу без повторов.' : '') +
      (res ? '\nОтчёт пересчитан (заявок за период — ' + res.leads + ').' : '');
  });
}

/** Каждый час (триггер): новые заявки из писем за 2 дня — на случай, если вебхук не сработал. */
function drMailHourly() {
  const r = drMailLocked_(2);
  if (r.added) drRecompute_();
}

function drMailLocked_(days) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return drMailPull_(days); } finally { lock.releaseLock(); }
}

function drMailQuery_() { return drProp_('MAIL_QUERY') || DR_MAIL_QUERY; }

/** Письма Тильды (все или за последние days дней) → новые строки «Заявок». */
function drMailPull_(days) {
  const t0 = Date.now(), q = drMailQuery_() + (days ? ' newer_than:' + days + 'd' : '');
  const seen = {};
  drRows_(DR_SHEETS.LEADS, 2).forEach(function (r) { seen[String(r[1])] = 1; });
  const rows = [];
  let found = 0, skipped = 0, start = 0, more = true, cut = false;
  while (more) {
    const threads = GmailApp.search(q, start, 100);
    more = threads.length === 100;
    start += threads.length;
    GmailApp.getMessagesForThreads(threads).forEach(function (msgs) {
      msgs.forEach(function (m) {
        const p = drMailParams_(m.getPlainBody() || m.getBody());
        if (!drMailIsLead_(p)) return;
        found++;
        p.tranid = p.tranid || 'mail-' + m.getId();
        if (seen[p.tranid]) { skipped++; return; }
        seen[p.tranid] = 1;
        p.formname = p.formname || m.getSubject();
        rows.push(drLeadRow_(p, m.getDate()));
      });
    });
    if (more && Date.now() - t0 > 240000) { cut = true; break; }   // лимит Apps Script — 6 минут
  }
  drAppendLeads_(rows);
  return { found: found, added: rows.length, skipped: skipped, cut: cut };
}

function drAppendLeads_(rows) {
  if (!rows.length) return;
  rows.sort(function (a, b) { return a[0] - b[0]; });
  const sh = drSheet_(DR_SHEETS.LEADS, DR_LEAD_HEAD), r = sh.getLastRow() + 1;
  drWrite_(sh, r, rows, ['dd.MM.yyyy HH:mm']);
  sh.getRange(r, 5, rows.length, 1).setNumberFormat('@').setValues(rows.map(function (x) { return [x[4]]; }));
}

/** Текст письма «Поле: значение» → поля как у вебхука (tranid, formname, referer, utm_*, Name, Phone…). */
function drMailParams_(text) {
  const s = String(text || '').replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  const p = {};
  s.split(/\r?\n/).forEach(function (line) {
    const m = line.match(/^\s*\*?([^:*]{1,40}?)\*?\s*:\s*(.+?)\s*$/);
    if (!m || /^https?$/i.test(m[1].trim())) return;
    const k = m[1].trim();
    const key = /transaction ?id|идентификатор (транзакции|заявки)|^tranid$|^(id|номер) заявки$|^request ?id$/i.test(k) ? 'tranid'
      : /^(form ?name|название формы|имя формы|форма)$/i.test(k) ? 'formname'
      : /^(referer|страница|page|адрес страницы|url страницы)$/i.test(k) ? 'referer' : k;
    if (!(key in p)) p[key] = m[2];
  });
  return p;
}

function drMailIsLead_(p) {
  return Object.keys(p).some(function (k) { return /phone|телефон|e-?mail|почта|^name$|^имя$/i.test(k); });
}

/** Вызывается из drSetupTrigger: ежечасная подгрузка заявок из писем. */
function drSetupMailTrigger_() {
  ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'drMailHourly'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('drMailHourly').timeBased().everyHours(1).create();
}
