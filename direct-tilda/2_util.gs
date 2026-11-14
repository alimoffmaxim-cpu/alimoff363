// ---------- Даты, числа, листы ----------

const DR_DAY_MS = 24 * 3600 * 1000;

function drNow_() { return Utilities.formatDate(new Date(), DR.TIMEZONE, 'dd.MM HH:mm'); }

/** Вчера по Москве: 'yyyy-MM-dd'. */
function drYesterday_() { return Utilities.formatDate(new Date(Date.now() - DR_DAY_MS), DR.TIMEZONE, 'yyyy-MM-dd'); }

/** Дата (Date или 'yyyy-MM-dd…') → 'yyyy-MM-dd' по Москве; '' если не дата. */
function drKey_(v) {
  if (v instanceof Date) return isNaN(v) ? '' : Utilities.formatDate(v, DR.TIMEZONE, 'yyyy-MM-dd');
  const m = String(v || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function drAddDays_(s, n) {
  const p = s.split('-');
  return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)).toISOString().slice(0, 10);
}

/** 'yyyy-MM-dd' → Date в полдень (чтобы дата не съезжала на соседний день в любом часовом поясе). */
function drDate_(s) { const p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }

function drDays_(from, to) { return Math.round((Date.UTC.apply(null, drYmd_(to)) - Date.UTC.apply(null, drYmd_(from))) / DR_DAY_MS) + 1; }

function drYmd_(s) { const p = s.split('-'); return [+p[0], +p[1] - 1, +p[2]]; }

function drNum_(v) {
  const n = Number(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.'));
  return isFinite(n) ? n : 0;
}

/** Лист по имени; если его нет — создаётся с заголовком. */
function drSheet_(name, head) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (head) drHead_(sh, 1, head);
  }
  return sh;
}

function drHead_(sh, r, names) {
  sh.getRange(r, 1, 1, names.length).setValues([names]).setFontWeight('bold').setBackground('#2f3e60')
    .setFontColor('#ffffff').setWrap(true).setVerticalAlignment('middle');
  if (r === 1) sh.setFrozenRows(1);
}

/** Строки листа без заголовка (до последней непустой строки). */
function drRows_(name, cols) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, cols || sh.getLastColumn()).getValues();
}

function drEnsureRows_(sh, n) {
  if (sh.getMaxRows() < n) sh.insertRowsAfter(sh.getMaxRows(), n - sh.getMaxRows());
}

/** Очищает лист с строки r (значения и оформление). */
function drClearFrom_(sh, r, cols) {
  if (sh.getMaxRows() >= r) sh.getRange(r, 1, sh.getMaxRows() - r + 1, cols || sh.getMaxColumns()).clear();
}

/** Пишет таблицу rows с строки r; форматы — по колонкам (null — без формата). */
function drWrite_(sh, r, rows, formats) {
  if (!rows.length) return;
  drEnsureRows_(sh, r + rows.length);
  sh.getRange(r, 1, rows.length, rows[0].length).setValues(rows);
  (formats || []).forEach(function (f, i) { if (f) sh.getRange(r, i + 1, rows.length, 1).setNumberFormat(f); });
}

/** «dd.MM.yyyy» для подписей. */
function drRu_(s) { return s ? s.split('-').reverse().join('.') : ''; }
