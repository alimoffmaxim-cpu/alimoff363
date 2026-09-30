// ---------- Даты ----------

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

/** Date или строка 'yyyy-MM-dd…' → Date в полночь (часовой пояс проекта). */
function day_(v) {
  if (v instanceof Date) return isNaN(v) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** Любая дата → 'yyyy-MM-dd' (или '' если не дата). */
function dayKey_(v) {
  const d = day_(v);
  return d ? d.getFullYear() + '-' + pad2_(d.getMonth() + 1) + '-' + pad2_(d.getDate()) : '';
}

function addDays_(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

/**
 * Период загрузки: при первой загрузке — INITIAL_DAYS, дальше — последние LOOKBACK_DAYS.
 * Конец периода — сегодня.
 */
function window_(hasData, p) {
  const today = day_(new Date());
  const days = hasData ? p.LOOKBACK_DAYS : p.INITIAL_DAYS;
  return { from: dayKey_(addDays_(today, -(days - 1))), to: dayKey_(today) };
}

function inWindow_(v, w) {
  const k = dayKey_(v);
  return k >= w.from && k <= w.to;
}

/** Разбивает период на куски по n дней: [[from, to], …]. */
function chunks_(from, to, n) {
  const out = [];
  for (let a = day_(from); dayKey_(a) <= to; a = addDays_(a, n)) {
    const b = addDays_(a, n - 1);
    out.push([dayKey_(a), dayKey_(b) < to ? dayKey_(b) : to]);
  }
  return out;
}

// ---------- Значения ----------

function num_(v) {
  const n = Number(String(v == null ? '' : v).replace(',', '.'));
  return isFinite(n) ? n : 0;
}

function bool_(v) {
  if (v === true) return true;
  return ['true', '1', 'да', 'yes'].indexOf(String(v).trim().toLowerCase()) >= 0;
}

function lc_(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

/** 'a, b ,c' → ['a','b','c'] в нижнем регистре. */
function list_(v) { return String(v || '').split(',').map(lc_).filter(String); }

/** Телефон → 7XXXXXXXXXX (или '' если номер не распознан). */
function normalizePhone_(v) {
  let d = String(v == null ? '' : v).replace(/\D/g, '');
  if (d.length === 10) d = '7' + d;
  if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
  return d.length >= 11 ? d.slice(-11) : '';
}

/** Номер колонки → буквы (1 → A, 27 → AA). */
function col_(n) {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
}

// ---------- Свойства скрипта ----------

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }

// ---------- HTTP ----------

/** Query-string; массив превращается в повторяющийся ключ: date=a&date=b. */
function qs_(params) {
  const parts = [];
  Object.keys(params || {}).forEach(k => {
    [].concat(params[k]).forEach(v => parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v)));
  });
  return parts.length ? '?' + parts.join('&') : '';
}

/** UrlFetchApp с повтором при 429 и 5xx. */
function http_(url, opts) {
  opts = Object.assign({ muteHttpExceptions: true }, opts || {});
  for (let i = 0; ; i++) {
    const resp = UrlFetchApp.fetch(url, opts);
    const code = resp.getResponseCode();
    if ((code === 429 || code >= 500) && i < 4) {
      Utilities.sleep(1000 * Math.pow(2, i));
      continue;
    }
    return resp;
  }
}

// ---------- Листы ----------

function sheet_(name, headers) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (headers) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

/** Строки листа без заголовка (пустые пропускаются). */
function readRows_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues()
    .filter(r => r.some(v => v !== ''));
}

/** Строки листа как объекты {заголовок: значение}. */
function readObjects_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  return readRows_(name).map(r => {
    const o = {};
    head.forEach((h, i) => { if (h) o[h] = r[i]; });
    return o;
  });
}

/** Перезаписывает колонки таблицы целиком (колонки правее не трогает). */
function writeTable_(name, headers, rows) {
  const sh = sheet_(name, headers);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).clearContent();
  if (!rows.length) return;
  sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  rows[0].forEach((v, i) => {
    if (v instanceof Date) sh.getRange(2, i + 1, rows.length, 1).setNumberFormat('dd.mm.yyyy');
  });
}

/**
 * Сливает свежие строки с листом: старые строки, для которых dropOld(r) = true, удаляются
 * (так из окна перезагрузки уходят удалённые записи), остальные обновляются по ключу keyOf.
 * Результат сортируется по колонке dateCol.
 */
function mergeRows_(name, headers, fresh, keyOf, dropOld, dateCol) {
  const old = readRows_(name).map(r => r.slice(0, headers.length)).filter(r => !(dropOld && dropOld(r)));
  const at = {};
  const out = [];
  old.concat(fresh).forEach(r => {
    const k = keyOf(r);
    if (k in at) out[at[k]] = r;
    else { at[k] = out.length; out.push(r); }
  });
  out.sort((a, b) => {
    const x = dayKey_(a[dateCol]), y = dayKey_(b[dateCol]);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  writeTable_(name, headers, out);
}

function hasRows_(name, filter) {
  return readRows_(name).some(filter || (() => true));
}

// ---------- Лог ----------

function log_(task, msg) {
  const sh = sheet_(SHEETS.log, HEAD.log);
  sh.appendRow([new Date(), task, msg]);
  if (sh.getLastRow() > 1000) sh.deleteRows(2, sh.getLastRow() - 1000);
}

// ---------- Формулы и локаль таблицы ----------
// В русской (и других «запятая = дробь») локали аргументы разделяются «;»,
// а столбцы массива {…} — «\». Формулы в коде пишутся с запятыми и переводятся здесь.

/** Переводит запятые формулы в синтаксис локали. Строки "…" и имена листов '…' не трогает. */
function localizeFormula_(f, semi) {
  if (!semi) return f;
  let out = '';
  let quote = '';
  let depth = 0;
  for (let i = 0; i < f.length; i++) {
    const ch = f[i];
    if (quote) {
      if (ch === quote) quote = '';
      out += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
    } else {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      out += ch === ',' ? (depth > 0 ? '\\' : ';') : ch;
    }
  }
  return out;
}

let formulaSemi_ = null;

/** true, если таблица не понимает формулы с запятыми (проверка на служебной ячейке). */
function formulaSemicolons_() {
  if (formulaSemi_ !== null) return formulaSemi_;
  const sh = sheet_(SHEETS.log, HEAD.log);
  const cell = sh.getRange(1, 26);
  cell.setFormula('=SUM(1,2)');
  SpreadsheetApp.flush();
  formulaSemi_ = cell.getValue() !== 3;
  cell.clearContent();
  return formulaSemi_;
}

function setF_(range, f) { return range.setFormula(localizeFormula_(f, formulaSemicolons_())); }

function setFs_(range, rows) {
  const semi = formulaSemicolons_();
  return range.setFormulas(rows.map(r => r.map(f => localizeFormula_(f, semi))));
}
