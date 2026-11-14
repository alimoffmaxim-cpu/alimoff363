// Имитация Google Таблиц для проверки скрипта «Совы» без Google.
// Запуск: node mock.js all.js out.json   (all.js — все .gs подряд, собирает run_checks.sh)
// Пишет out.json: листы с ячейками (значения и формулы), форматами, графиками; toxlsx.py делает из него xlsx.
// Переменные окружения:
//   SEMI=1          таблица в русской локали (формулы должны прийти с «;»)
//   TWICE=1         собрать отчёт дважды (проверка пересборки)
//   FIVE=1          заранее лист настроек на 5 направлений (реальные названия клиента)
//   ADD_DAYS=N      после сборки дописать N дней данных вперёд и запустить обновление листов (sbDaysAll_)
//   ZERO_BEFORE=YYYY-MM-DD  обнулить данные раньше даты и запустить sbDaysAll_
//   EDIT="Лист|YYYY-MM-DD"   поставить «Период с» (H3) и вызвать onEdit
//   EDITJ="Лист|YYYY-MM-DD"  поставить «по» (J3) и вызвать onEdit
//   SNAP=file.json  сохранить состояние до OPEN;  OPEN=1 — вызвать onOpen (сброс «по» на вчера)
const fs = require('fs');

function a1ToRC(a1) {
  const m = a1.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
  const c = s => s.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const r1 = +m[2], c1 = c(m[1]), r2 = m[3] ? +m[4] : r1, c2 = m[3] ? c(m[3]) : c1;
  return [r1, c1, r2 - r1 + 1, c2 - c1 + 1];
}
const proxy = (api) => { const px = new Proxy(api, { get(t, k) { return k in t ? t[k] : () => px; } }); return px; };

class Sheet {
  constructor(name) { Object.assign(this, { name, cells: {}, fmt: {}, maxR: 1000, maxC: 26, charts: [], rules: [] }); this.self = makeSheet(this); }
}
function makeSheet(s) {
  return proxy({
    getName: () => s.name, getMaxRows: () => s.maxR, getMaxColumns: () => s.maxC,
    insertColumnsAfter: (a, n) => { s.maxC += n; }, insertRowsAfter: (a, n) => { s.maxR += n; },
    getLastRow: () => Object.keys(s.cells).reduce((m, k) => Math.max(m, +k.split(',')[0]), 0),
    getRange: (...a) => makeRange(s, ...(typeof a[0] === 'string' ? a1ToRC(a[0]) : [a[0], a[1], a[2] || 1, a[3] || 1])),
    newChart: () => makeChart(), insertChart: c => s.charts.push(c), getCharts: () => s.charts.slice(),
    removeChart: c => { s.charts = s.charts.filter(x => x !== c); },
    getConditionalFormatRules: () => s.rules.slice(), setConditionalFormatRules: r => { s.rules = r; },
    clear: () => { s.cells = {}; s.fmt = {}; }, clearConditionalFormatRules: () => { s.rules = []; },
  });
}
function makeRange(s, r, c, nr, nc) {
  if (r < 1 || c < 1 || nr < 1 || nc < 1 || r + nr - 1 > s.maxR || c + nc - 1 > s.maxC)
    throw new Error(`диапазон вне листа ${s.name}: ${r},${c},${nr},${nc} (лист ${s.maxR}×${s.maxC})`);
  const key = (i, j) => (r + i) + ',' + (c + j);
  const px = proxy({
    setValues: v => {
      if (v.length !== nr || v.some(row => row.length !== nc)) throw new Error(`setValues ${s.name} ${r},${c}: ждали ${nr}×${nc}, пришло ${v.length}×${v[0].length}`);
      v.forEach((row, i) => row.forEach((x, j) => { s.cells[key(i, j)] = x; })); return px;
    },
    setValue: v => { s.cells[key(0, 0)] = v; return px; }, setFormula: v => { s.cells[key(0, 0)] = v; return px; },
    getValue: () => { const v = s.cells[key(0, 0)]; return v === '=SUM(1,2)' && !process.env.SEMI ? 3 : (v ?? ''); },
    getFormula: () => { const v = s.cells[key(0, 0)]; return typeof v === 'string' && v.startsWith('=') ? v : ''; },
    getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => s.cells[key(i, j)] ?? '')),
    getDisplayValues: () => px.getValues().map(rw => rw.map(String)),
    setNumberFormat: f => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) s.fmt[key(i, j)] = f; return px; },
    setBackgrounds: b => { if (b.length !== nr || b[0].length !== nc) throw new Error('setBackgrounds: размеры'); return px; },
    clear: () => { Object.keys(s.cells).forEach(k => { const [rr, cc] = k.split(',').map(Number); if (rr >= r && rr < r + nr && cc >= c && cc < c + nc) delete s.cells[k]; }); return px; },
    getA1: () => [r, c, nr, nc], getRow: () => r, getLastRow: () => r + nr - 1, getColumn: () => c, getLastColumn: () => c + nc - 1,
    getSheet: () => s.self,
  });
  return px;
}
function makeChart() {
  const ch = { ranges: [], opts: {} };
  const px = proxy({ addRange: rg => { ch.ranges.push(rg.getA1()); return px; }, setOption: (k, v) => { ch.opts[k] = v; return px; },
    setChartType: t => { ch.type = t; return px; }, setPosition: (...a) => { ch.pos = a; return px; }, build: () => ch });
  return px;
}

const ss = { sheets: [] };
const ssApi = {
  getSheetByName: n => { const s = ss.sheets.find(x => x.name === n); return s ? s.self : null; },
  insertSheet: (n, idx) => { if (ss.sheets.find(x => x.name === n)) throw new Error('лист уже есть: ' + n); const s = new Sheet(n); idx === undefined ? ss.sheets.push(s) : ss.sheets.splice(idx, 0, s); return s.self; },
  deleteSheet: sh => { ss.sheets = ss.sheets.filter(x => x.self !== sh); },
  getSheets: () => ss.sheets.map(x => x.self),
  setActiveSheet: () => {}, setSpreadsheetLocale: () => {}, setSpreadsheetTimeZone: () => {}, getSpreadsheetLocale: () => 'ru_RU',
};
ssApi.insertSheet('Лист1');
if (process.env.FIVE) {
  const st = new Sheet('⚙ Настройки'); ss.sheets.push(st); st.cells['1,1'] = 'Направление';
  [['Сова (Саратов)', '✅', '', '#2a78d6'], ['Совенок (Саратов)', '✅', '', '#eb6834'], ['Сова комфорт (Саратов)', '✅', '', '#1baf7a'],
    ['Волгоград (Сова)', '❌ не подключён', '', '#eda100'], ['Волгоград (Стационар)', '❌ не подключён', '', '#e87ba4']]
    .forEach((row, i) => row.forEach((v, j) => { st.cells[(i + 2) + ',' + (j + 1)] = v; }));
}
const alerts = [];
const menu = new Proxy({}, { get: () => () => menu });
const ui = { createMenu: () => menu, alert: (...a) => { alerts.push(a.slice(0, 2).join(' | ')); return 'YES'; }, ButtonSet: { YES_NO: 1, OK_CANCEL: 2 }, Button: { YES: 'YES', OK: 'OK' }, prompt: () => ({}) };
const rule = () => { const o = { conds: [], getRanges: () => o.rg }; const px = new Proxy(o, { get(t, k) { if (k === 'build') return () => o; return (...a) => { if (k === 'setRanges') o.rg = a[0]; o.conds.push([k, a]); return px; }; } }); return px; };
const fmtDate = (d, tz, f) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).map(x => [x.type, x.value]));
  return f === 'yyyy-MM-dd' ? `${p.year}-${p.month}-${p.day}` : f === 'dd.MM HH:mm' ? `${p.day}.${p.month} ${p.hour}:${p.minute}` : `${p.day}.${p.month}.${p.year}`;
};
const props = () => { const m = {}; return { getProperty: k => m[k] || null, setProperty: (k, v) => { m[k] = v; }, setProperties: o => Object.assign(m, o), deleteProperty: k => { delete m[k]; } }; };
const docProps = props(), scriptProps = props();
global.SpreadsheetApp = { getActive: () => ssApi, getUi: () => ui, flush: () => {}, newConditionalFormatRule: rule,
  newDataValidation: () => proxy({ build: () => ({}) }), BorderStyle: { SOLID: 1 }, InterpolationType: { PERCENTILE: 'P' } };
global.Charts = { ChartType: { LINE: 'LINE', COLUMN: 'COLUMN' } };
global.Session = { getScriptTimeZone: () => 'Europe/Moscow' };
global.PropertiesService = { getScriptProperties: () => scriptProps, getDocumentProperties: () => docProps };
global.Utilities = { formatDate: fmtDate, sleep: () => {} };
global.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };

eval(fs.readFileSync(process.argv[2], 'utf8') + '\nObject.assign(global, { sovaBuildReport, onEdit, onOpen, sbDaysAll_ });');

const dataSheet = () => ss.sheets.find(x => x.name === 'Данные');
const editCell = (spec, cell, a1) => { const [name, d] = spec.split('|'); const sm = ss.sheets.find(x => x.name === name);
  sm.cells[cell] = d ? new Date(d + 'T00:00:00Z') : ''; onEdit({ range: sm.self.getRange(a1) }); };

sovaBuildReport();
if (process.env.TWICE) { alerts.push('--- пересборка ---'); sovaBuildReport(); }
if (process.env.ZERO_BEFORE) {
  const dsh = dataSheet(), lim = new Date(process.env.ZERO_BEFORE + 'T00:00:00Z');
  Object.keys(dsh.cells).forEach(k => { const [r, c] = k.split(',').map(Number); const d = dsh.cells[r + ',1'];
    if (r > 1 && c >= 3 && d instanceof Date && d < lim) dsh.cells[k] = 0; });
  sbDaysAll_();
}
if (process.env.ADD_DAYS) {
  const dsh = dataSheet(); let last = 0, maxD = null;
  Object.keys(dsh.cells).forEach(k => { const r = +k.split(',')[0]; last = Math.max(last, r); const v = dsh.cells[r + ',1']; if (v instanceof Date && (!maxD || v > maxD)) maxD = v; });
  for (let i = 1; i <= +process.env.ADD_DAYS; i++) for (const n of [2, 3, 4]) {   // цифры разные, чтобы ошибка в сумме не совпала случайно
    last++; const d = new Date(maxD.getTime() + i * 864e5);
    [d, "='⚙ Настройки'!$A$" + n, 3000 + 7 * i + n, 20000 + 11 * i, 300 + (i % 13) * n, 50 + (i * n) % 37].forEach((v, j) => { dsh.cells[last + ',' + (j + 1)] = v; });
  }
  dsh.maxR = Math.max(dsh.maxR, last + 1); sbDaysAll_();
}
if (process.env.EDIT) editCell(process.env.EDIT, '3,8', 'H3');
if (process.env.EDITJ) editCell(process.env.EDITJ, '3,10', 'J3');
const dump = () => JSON.stringify(ss.sheets.map(s => ({ name: s.name, cells: Object.entries(s.cells).map(([k, v]) => [k, v instanceof Date ? { d: v.toISOString() } : v]),
  fmt: s.fmt, charts: s.charts, rules: s.rules.length })));
if (process.env.SNAP) fs.writeFileSync(process.env.SNAP, dump());
if (process.env.OPEN) onOpen();
console.error(alerts.join('\n'));
fs.writeFileSync(process.argv[3] || 'out.json', dump());
