// ---------- Импорт заявок, пришедших до подключения вебхука (выгрузка из Тильды) ----------
// Выгрузку заявок из Тильды (CSV / Excel) вставляют на лист «Импорт Тильды» с заголовками в 1-й строке
// (Файл → Импорт → «Заменить текущий лист»). Меню «Импортировать заявки из Тильды» переносит их на «Заявки»
// в том же виде, что и вебхук: колонки находятся по названиям, заявки, которые уже есть, пропускаются.

const DR_IMPORT_SHEET = 'Импорт Тильды';

function drImportTilda() {
  drAlert_(function () {
    const src = SpreadsheetApp.getActive().getSheetByName(DR_IMPORT_SHEET);
    if (!src || src.getLastRow() < 2) {
      drSheet_(DR_IMPORT_SHEET).getRange('A1').setValue('Вставьте сюда выгрузку заявок из Тильды (с заголовками в 1-й строке)');
      return 'Лист «' + DR_IMPORT_SHEET + '» пуст. Скачайте заявки в Тильде (проект → «Заявки» → «Экспорт»), ' +
        'откройте лист «' + DR_IMPORT_SHEET + '» → Файл → Импорт → загрузите файл → «Заменить текущий лист». Затем повторите.';
    }
    const values = src.getRange(1, 1, src.getLastRow(), src.getLastColumn()).getValues();
    const head = values[0].map(function (h) { return String(h).trim(); });
    const sh = drSheet_(DR_SHEETS.LEADS, DR_LEAD_HEAD);
    const seen = {};
    drRows_(DR_SHEETS.LEADS, 2).forEach(function (r) { seen[String(r[1])] = 1; });
    let added = 0, skipped = 0, bad = 0;
    const rows = [];
    values.slice(1).forEach(function (v) {
      if (!v.some(function (x) { return x !== ''; })) return;
      const params = drImportParams_(head, v), at = drImportDate_(params._date);
      if (!at) { bad++; return; }
      const row = drLeadRow_(params, at);
      if (!row[1]) row[1] = 'import-' + Utilities.formatDate(at, DR.TIMEZONE, 'yyyyMMddHHmmss') + '-' + String(row[4]).replace(/\D/g, '').slice(-4);
      if (seen[String(row[1])]) { skipped++; return; }
      seen[String(row[1])] = 1;
      rows.push(row);
      added++;
    });
    rows.sort(function (a, b) { return a[0] - b[0]; });
    if (rows.length) {
      const r = sh.getLastRow() + 1;
      drWrite_(sh, r, rows, ['dd.MM.yyyy HH:mm']);
      sh.getRange(r, 5, rows.length, 1).setNumberFormat('@').setValues(rows.map(function (x) { return [x[4]]; }));
    }
    const res = drRecompute_();
    return 'Импорт: добавлено заявок — ' + added + ', уже были — ' + skipped + (bad ? ', без даты (пропущены) — ' + bad : '') +
      '.\nОтчёт пересчитан (заявок за период — ' + res.leads + '). Метки и привязка — на листе «Заявки».';
  });
}

/** Строка выгрузки → поля как у вебхука (tranid, formname, referer, utm_*…) + _date. */
function drImportParams_(head, v) {
  const p = {};
  head.forEach(function (h, i) {
    if (!h || v[i] === '' || v[i] == null) return;
    const k = h.toLowerCase(), val = v[i];
    if (/^(utm_(source|medium|campaign|content|term))$/.test(k)) p[k] = String(val);
    else if (!p._date && /^(дата|date|created|sent|время|отправлен)/.test(k)) p._date = val;
    else if (!p.tranid && /(tranid|request ?id|lead ?id|id заявки|номер заявки|^id$)/.test(k)) p.tranid = String(val);
    else if (!p.formname && /(form|форм)/.test(k)) p.formname = String(val);
    else if (!p.referer && /(refer|page|страниц|url|адрес|ссылк)/.test(k)) p.referer = String(val);
    else p[h] = String(val instanceof Date ? Utilities.formatDate(val, DR.TIMEZONE, 'dd.MM.yyyy HH:mm') : val);
  });
  return p;
}

/** Дата из выгрузки: дата таблицы, «2026-11-10 14:23:05» или «10.11.2026 14:23». */
function drImportDate_(v) {
  if (v instanceof Date) return isNaN(v) ? null : v;
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T]?(\d{2})?:?(\d{2})?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0));
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s*(\d{1,2})?:?(\d{2})?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 12), +(m[5] || 0));
  return null;
}
