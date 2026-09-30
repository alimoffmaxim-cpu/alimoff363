// Локальные тесты: node moto-dashboard/test/run.js
// Загружает все .gs в один контекст с упрощёнными заглушками Google Apps Script.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const dir = path.join(__dirname, '..');

// ---------- Мини-мок таблицы ----------
function colNum(s) { return s.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0); }
function parseA1(a1) {
  const m = a1.match(/^([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?$/);
  const c1 = colNum(m[1]), r1 = m[2] ? +m[2] : 1;
  const c2 = m[3] ? colNum(m[3]) : c1, r2 = m[4] ? +m[4] : m[3] || !m[2] ? 1000 : r1;
  return [r1, c1, r2 - r1 + 1, c2 - c1 + 1];
}
function chain(target) {
  return new Proxy(target, { get: (t, k) => (k in t ? t[k] : () => chain(t)) });
}
function makeSheet(ss, name) {
  const cells = {}; // 'r,c' → {v, f}
  const sh = {
    name, cells, charts: [],
    getName: () => name,
    getRange(a, b, c, d) {
      const [r, col, nr, nc] = typeof a === 'string' ? parseA1(a) : [a, b, c || 1, d || 1];
      const each = fn => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) fn(r + i, col + j, i, j); };
      const range = {
        setValues(v) { each((R, C, i, j) => { cells[R + ',' + C] = { v: v[i][j] }; }); return chain(range); },
        setValue(v) { cells[r + ',' + col] = { v }; return chain(range); },
        setFormulas(f) { each((R, C, i, j) => { cells[R + ',' + C] = { v: '', f: f[i][j] }; }); return chain(range); },
        setFormula(f) { cells[r + ',' + col] = { v: '', f }; return chain(range); },
        getFormula() { return (cells[r + ',' + col] || {}).f || ''; },
        getValue() { return (cells[r + ',' + col] || { v: '' }).v; },
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push((cells[(r + i) + ',' + (col + j)] || { v: '' }).v); out.push(row); }
          return out;
        },
        clearContent() { each((R, C) => { delete cells[R + ',' + C]; }); return chain(range); },
      };
      return chain(range);
    },
    getLastRow() { return Object.keys(cells).reduce((m, k) => (cells[k].v !== '' || cells[k].f ? Math.max(m, +k.split(',')[0]) : m), 0); },
    getLastColumn() { return Object.keys(cells).reduce((m, k) => (cells[k].v !== '' || cells[k].f ? Math.max(m, +k.split(',')[1]) : m), 0); },
    appendRow(row) { const r = sh.getLastRow() + 1; row.forEach((v, j) => { cells[r + ',' + (j + 1)] = { v }; }); },
    deleteRows() {},
    clear() { Object.keys(cells).forEach(k => delete cells[k]); },
    getCharts: () => sh.charts,
    removeChart(c) { sh.charts.splice(sh.charts.indexOf(c), 1); },
    newChart() { const b = chain({ build: () => ({}) }); return b; },
    insertChart(c) { sh.charts.push(c); },
  };
  return chain(sh);
}
function makeSpreadsheet() {
  const sheets = {};
  const ss = {
    sheets,
    getSheetByName: n => sheets[n] || null,
    insertSheet(n) { sheets[n] = makeSheet(ss, n); return sheets[n]; },
    getSheets: () => Object.values(sheets),
    deleteSheet(s) { delete sheets[s.getName()]; },
  };
  return chain(ss);
}

const ss = makeSpreadsheet();
const props = {};
const ctx = {
  console,
  SpreadsheetApp: chain({ getActive: () => ss, newDataValidation: () => chain({}), BorderStyle: {} }),
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, setProperties: o => Object.assign(props, o), deleteProperty: k => delete props[k] }) },
  Charts: { ChartType: { COLUMN: 'COLUMN', LINE: 'LINE' } },
  Utilities: { sleep() {} },
  Session: { getScriptTimeZone: () => 'Europe/Moscow' },
};
vm.createContext(ctx);
const files = fs.readdirSync(dir).filter(f => f.endsWith('.gs')).sort();
const src = files.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n;\n');
const exportsList = ['normalizePhone_', 'matchRule_', 'subType_', 'buildFacts_', 'params_', 'setupSheets', 'rebuildFacts',
  'mergeRows_', 'readRows_', 'chunks_', 'qs_', 'col_', 'window_', 'HEAD', 'SHEETS', 'METRICS', 'metricCol_', 'parseYandexTsv_'];
vm.runInContext(src + '\n;globalThis.__t = {' + exportsList.join(',') + '};', ctx, { filename: 'bundle.gs' });
const t = ctx.__t;

const plain = x => JSON.parse(JSON.stringify(x));
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; }
}

// ---------- Тесты ----------
test('normalizePhone_', () => {
  assert.strictEqual(t.normalizePhone_('+7 (916) 123-45-67'), '79161234567');
  assert.strictEqual(t.normalizePhone_('8 916 123 45 67'), '79161234567');
  assert.strictEqual(t.normalizePhone_('9161234567'), '79161234567');
  assert.strictEqual(t.normalizePhone_(79161234567), '79161234567');
  assert.strictEqual(t.normalizePhone_('123'), '');
});

test('col_, qs_, chunks_', () => {
  assert.strictEqual(t.col_(1), 'A');
  assert.strictEqual(t.col_(27), 'AA');
  assert.strictEqual(t.qs_({ date: ['2026-01-01', '2026-01-31'], x: 1 }), '?date=2026-01-01&date=2026-01-31&x=1');
  assert.deepStrictEqual(plain(t.chunks_('2026-01-01', '2026-01-10', 7)), [['2026-01-01', '2026-01-07'], ['2026-01-08', '2026-01-10']]);
});

test('subType_', () => {
  const rules = [{ contains: 'пробн', type: 'пробное' }, { contains: 'разов', type: 'разовая' }];
  assert.strictEqual(t.subType_('Разовое занятие', 1, rules), 'разовая');
  assert.strictEqual(t.subType_('Пробная тренировка', 1, rules), 'пробное');
  assert.strictEqual(t.subType_('8 тренировок', 8, rules), 'абонемент');
  assert.strictEqual(t.subType_('Тренировка', 1, rules), 'разовая');
});

const p = t.params_(); // без листа «Настройки» — значения по умолчанию

test('matchRule_: Макс раньше Яндекса, источник без UTM', () => {
  assert.strictEqual(t.matchRule_(p.rules, { площадка: 'Яндекс Директ', кампания: 'Посевы Макс сентябрь' }), 'Макс');
  assert.strictEqual(t.matchRule_(p.rules, { utm_source: 'yandex' }), 'Яндекс Директ');
  assert.strictEqual(t.matchRule_(p.rules, { источник: 'Авито' }), 'Авито');
  assert.strictEqual(t.matchRule_(p.rules, { utm_source: '' }), '');
});

// Даты и массивы создаём внутри контекста: instanceof Date не работает между контекстами vm
const D = s => vm.runInContext('new Date("' + s + 'T00:00:00")', ctx);
const data = {
  ads: [
    { 'Дата': D('2026-09-01'), 'Площадка': 'VK Реклама', 'Кабинет': 'VK', 'ID кампании': '11', 'Кампания': 'Мотокросс дети', 'Расход': 1000 },
    { 'Дата': D('2026-09-01'), 'Площадка': 'Яндекс Директ', 'Кабинет': 'основной', 'ID кампании': '555', 'Кампания': 'Посевы Макс', 'Расход': 500 },
  ],
  adsManual: [{ 'Дата': D('2026-09-02'), 'Канал': 'Telegram', 'Кампания': 'Посев @moto', 'Расход': 3000 }],
  amo: [
    { 'ID сделки': 2, 'Создана': D('2026-09-03'), 'Воронка': 'Основная', 'Статус': 'Новая', 'utm_source': 'vk', 'utm_campaign': '11', 'Телефон': '79160000001' },
    { 'ID сделки': 1, 'Создана': D('2026-09-02'), 'Воронка': 'Основная', 'Статус': 'Новая', 'utm_source': '', 'Источник': '', 'Телефон': '79160000001' },
    { 'ID сделки': 3, 'Создана': D('2026-09-04'), 'Воронка': 'Основная', 'Статус': 'Новая', 'utm_source': 'yandex', 'utm_campaign': '555', 'Телефон': '8 (916) 000-00-02' },
    { 'ID сделки': 4, 'Создана': D('2026-09-04'), 'Воронка': 'Основная', 'Статус': 'Спам', 'utm_source': 'vk', 'Телефон': '79160000003' },
  ],
  clients: [
    { 'ID ученика': 101, 'Телефон': '79160000001' },
    { 'ID ученика': 102, 'Телефон': '79160000002' },
    { 'ID ученика': 103, 'Телефон': '79160000009' },
  ],
  visits: [
    { 'ID записи': 'v1', 'Дата': D('2026-09-05'), 'ID ученика': 101, 'Пробное': true, 'Пришёл': true },
    { 'ID записи': 'v2', 'Дата': D('2026-09-05'), 'ID ученика': 102, 'Пробное': true, 'Пришёл': false },
    { 'ID записи': 'v3', 'Дата': D('2026-09-06'), 'ID ученика': 102, 'Пробное': false, 'Пришёл': true },
  ],
  subs: [
    { 'ID': 's1', 'Дата продажи': D('2026-09-06'), 'ID ученика': 101, 'Абонемент': '8 тренировок', 'Занятий': 8, 'Цена': 20000 },
    { 'ID': 's2', 'Дата продажи': D('2026-09-06'), 'ID ученика': 102, 'Абонемент': 'Разовая тренировка', 'Занятий': 1, 'Цена': 3000 },
    { 'ID': 's3', 'Дата продажи': D('2026-09-06'), 'ID ученика': 103, 'Абонемент': 'Пробное', 'Занятий': 1, 'Цена': 1000 },
  ],
  pays: [
    { 'ID': 'p1', 'Дата': D('2026-09-06'), 'ID ученика': 101, 'Тип операции': 'income', 'Сумма': 20000 },
    { 'ID': 'p2', 'Дата': D('2026-09-06'), 'ID ученика': 102, 'Тип операции': 'income', 'Сумма': 3000 },
    { 'ID': 'p3', 'Дата': D('2026-09-07'), 'ID ученика': 102, 'Тип операции': 'refund', 'Сумма': 1000 },
    { 'ID': 'p4', 'Дата': D('2026-09-07'), 'ID ученика': 101, 'Тип операции': 'debit', 'Сумма': 2500 },
  ],
};

test('buildFacts_: атрибуция first touch, фильтр статусов, выручка', () => {
  const rows = t.buildFacts_(data, p);
  const by = (ev, ch) => plain(rows).filter(r => r[1] === ev && (!ch || r[2] === ch));
  const sum = (rs, i) => rs.reduce((s, r) => s + r[i], 0);

  assert.deepStrictEqual(by('расход').map(r => [r[2], r[5]]), [['VK Реклама', 1000], ['Макс', 500], ['Telegram', 3000]]);
  // Спам не лид; сделка без UTM — «Не определён»
  assert.strictEqual(by('лид').length, 3);
  assert.strictEqual(by('лид', 'Не определён').length, 1);
  // utm_campaign=555 → название кампании из кабинета → правило «Макс»
  assert.deepStrictEqual(by('лид', 'Макс').map(r => r[3]), ['Посевы Макс']);
  assert.deepStrictEqual(by('лид', 'VK Реклама').map(r => r[3]), ['Мотокросс дети']);
  // Клиент 101: первая сделка без канала, вторая — VK → канал VK
  assert.deepStrictEqual(by('пробное').map(r => [r[2], r[7]]), [['VK Реклама', 101]]);
  assert.deepStrictEqual(by('абонемент').map(r => [r[2], r[5]]), [['VK Реклама', 20000]]);
  assert.deepStrictEqual(by('повторная').map(r => [r[2], r[5]]), [['Макс', 3000]]);
  // «Пробное» в продажах не считается, клиент 103 без заявки
  assert.strictEqual(rows.filter(r => r[6] === 's3').length, 0);
  // Выручка: приход − возврат, списания с баланса не выручка
  assert.strictEqual(sum(by('оплата', 'VK Реклама'), 5), 20000);
  assert.strictEqual(sum(by('оплата', 'Макс'), 5), 2000);
  assert.strictEqual(sum(by('оплата'), 5), 22000);
  // Отсортировано по дате
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1][0] <= rows[i][0]);
});

test('mergeRows_: окно перезагрузки удаляет старые строки, ключ обновляет', () => {
  const H = ['ID', 'Дата', 'X'];
  t.mergeRows_('m', H, [['a', D('2026-09-01'), 1], ['b', D('2026-09-05'), 2]], r => r[0], null, 1);
  const w = { from: '2026-09-04', to: '2026-09-10' };
  t.mergeRows_('m', H, [['c', D('2026-09-06'), 3], ['a', D('2026-09-01'), 10]], r => r[0],
    r => { const k = r[1].toISOString(); return new Date(k) >= D(w.from); }, 1);
  assert.deepStrictEqual(t.readRows_('m').map(r => [r[0], r[2]]), [['a', 10], ['c', 3]]);
});

test('parseYandexTsv_', () => {
  const rows = t.parseYandexTsv_('2026-09-01\t555\tПосевы Макс\t1000\t20\t1234.5\n', '');
  assert.deepStrictEqual([rows[0][2], rows[0][3], rows[0][4], rows[0][7]], ['основной', '555', 'Посевы Макс', 1234.5]);
});

test('setupSheets + rebuildFacts на моке таблицы', () => {
  t.setupSheets();
  const sh = n => ss.sheets[n];
  assert.ok(sh('Дашборд') && sh('Сводка_каналы') && sh('Настройки') && sh('fact'));
  assert.strictEqual(sh('Дашборд').charts.length, 4);
  // Настройки читаются обратно в те же правила
  const p2 = t.params_();
  assert.strictEqual(p2.rules.length, p.rules.length);
  assert.strictEqual(p2.LOOKBACK_DAYS, 30);
  const f = (s, a1) => sh(s).getRange(a1).getFormula();
  console.log('     Сводка_каналы!A5 =', f('Сводка_каналы', 'A5'));
  console.log('     Сводка_каналы!B2 =', f('Сводка_каналы', 'B2'));
  console.log('     Сводка_каналы!D5 =', f('Сводка_каналы', 'D5'));
  console.log('     Сводка_каналы!M5 =', f('Сводка_каналы', 'M5'));
  console.log('     Сводка_месяцы!N5 =', f('Сводка_месяцы', 'N5'));
  console.log('     Сводка_месяцы!O2 =', f('Сводка_месяцы', 'O2'));
  console.log('     Дашборд!J7     =', f('Дашборд', 'J7'));
  console.log('     Данные_графиков!A2 =', f('Данные_графиков', 'A2'));
  assert.ok(f('Сводка_каналы', 'M5').includes('IFERROR((J5-B5)/B5'));
  assert.ok(f('Сводка_месяцы', 'O5').includes('J5-B5-N5'));

  // Сырые данные → fact
  const put = (name, head, objs) => sh(name).getRange(2, 1, objs.length, head.length).setValues(objs.map(o => head.map(h => (h in o ? o[h] : ''))));
  put('raw_ads', t.HEAD.ads, data.ads);
  put('raw_amo', t.HEAD.amo, data.amo);
  put('raw_mk_clients', t.HEAD.mkClients, data.clients);
  put('raw_mk_visits', t.HEAD.mkVisits, data.visits);
  put('raw_mk_subs', t.HEAD.mkSubs, data.subs);
  put('raw_mk_payments', t.HEAD.mkPays, data.pays);
  const msg = t.rebuildFacts();
  assert.ok(/строк/.test(msg), msg);
  assert.strictEqual(t.readRows_('fact').length, t.buildFacts_(Object.assign({}, data, { adsManual: [] }), p).length);
});

console.log('\n' + passed + ' тестов пройдено' + (process.exitCode ? ', есть ошибки' : ''));
