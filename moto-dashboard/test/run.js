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
  ScriptApp: (() => {
    const list = [];
    const builder = fn => chain({ create: () => { list.push({ getHandlerFunction: () => fn }); } });
    return { list, getProjectTriggers: () => list.slice(), deleteTrigger: t => list.splice(list.indexOf(t), 1), newTrigger: builder };
  })(),
  Session: { getScriptTimeZone: () => 'Europe/Moscow' },
};
vm.createContext(ctx);
const files = fs.readdirSync(dir).filter(f => f.endsWith('.gs')).sort();
const src = files.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n;\n');
const exportsList = ['jobDaily', 'ensureTriggers_', 'doPost', 'tildaRow_', 'tildaUtm_', 'localizeFormula_', 'normalizePhone_', 'matchRule_', 'subType_', 'buildFacts_', 'params_', 'setupSheets', 'rebuildFacts',
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

test('localizeFormula_: запятые → ; и \\ в массивах, строки и листы не трогаются', () => {
  const L = f => t.localizeFormula_(f, true);
  assert.strictEqual(t.localizeFormula_('=SUM(1,2)', false), '=SUM(1,2)');
  assert.strictEqual(L('=DATE(YEAR(TODAY()),MONTH(TODAY()),1)'), '=DATE(YEAR(TODAY());MONTH(TODAY());1)');
  assert.strictEqual(L('=IFERROR(TEXT(A1,"dd.mm, yyyy"),"a,b")'), '=IFERROR(TEXT(A1;"dd.mm, yyyy");"a,b")');
  assert.strictEqual(L("=SUM('Лист, 1'!A:A,B1)"), "=SUM('Лист, 1'!A:A;B1)");
  assert.strictEqual(L('=FILTER({A1:A,B1:B},A1:A<>"")'), '=FILTER({A1:A\\B1:B};A1:A<>"")');
  assert.strictEqual(L('={A4:M4;A2:M2}'), '={A4:M4;A2:M2}');
  const once = L('=IFERROR(FILTER({A,B},C),"")');
  assert.strictEqual(L(once), once);
});

test('Тильда: телефон, имя, UTM из COOKIES и из полей формы', () => {
  const at = vm.runInContext('new Date(2026, 8, 3, 14, 5)', ctx);
  const cookies = 'TILDAUTM=' + encodeURIComponent('utm_source=yandex|||utm_medium=cpc|||utm_campaign=555|||utm_content=ad1') + '; _ym_uid=1';
  const r = plain(t.tildaRow_({ Name: 'Иван', Phone: '+7 (916) 000-00-09', Email: 'a@b.ru', tranid: '123:456',
    formname: 'Пробная тренировка', COOKIES: cookies, key: 'secret' }, at));
  assert.deepStrictEqual(r.slice(1, 12), ['123:456', 'Пробная тренировка', '', 'Иван', '79160000009', 'a@b.ru',
    'yandex', 'cpc', '555', 'ad1', '']);
  assert.ok(!r[12].includes('secret') && !r[12].includes('TILDAUTM'));
  // Скрытые поля формы важнее куки
  assert.strictEqual(t.tildaUtm_({ utm_source: 'vk', COOKIES: cookies }).utm_source, 'vk');
  assert.strictEqual(t.tildaUtm_({}).utm_source, '');
});

test('Тильда: вебхук принимает форму и JSON, ключ из адреса или тела', () => {
  ctx.ContentService = { createTextOutput: x => x };
  ctx.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  props.TILDA_SECRET = 'sekret123';
  const before = t.readRows_('raw_tilda').length;
  assert.strictEqual(t.doPost({ parameter: { test: 'test' } }), 'ok');
  // JSON-тело, ключ в адресе
  assert.strictEqual(t.doPost({ parameter: { key: 'sekret123' }, parameters: { key: ['sekret123'] },
    postData: { type: 'application/json', contents: JSON.stringify({ Name: 'Ира', Phone: '89161112233', tranid: 'j1' }) } }), 'ok');
  // Форма, ключ в теле (поля API NAME / API KEY)
  assert.strictEqual(t.doPost({ parameter: { key: 'sekret123', Phone: '+79162223344', tranid: 'f1' },
    postData: { type: 'application/x-www-form-urlencoded', contents: 'key=sekret123&Phone=%2B79162223344&tranid=f1' } }), 'ok');
  // В адресе старый ключ, в теле правильный — принимается
  assert.strictEqual(t.doPost({ parameter: { key: 'old' }, parameters: { key: ['old', 'sekret123'] }, postData: { type: 'x', contents: '' } }), 'ok');
  assert.strictEqual(t.doPost({ parameter: { key: 'bad', Phone: '1' }, parameters: { key: ['bad'] } }), 'forbidden');
  const rows = plain(t.readRows_('raw_tilda')).slice(before);
  assert.deepStrictEqual(rows.slice(0, 2).map(r => [r[1], r[5]]), [['j1', '79161112233'], ['f1', '79162223344']]);
  const log = plain(t.readRows_('Лог')).map(r => r[2]).join('\n');
  assert.ok(/неверный ключ \(пришёл bad…, ожидается sekr…\)/.test(log), log);
  ss.sheets['raw_tilda'].clear();
});

test('ensureTriggers_: один ежедневный триггер вместо четырёх старых', () => {
  const L = ctx.ScriptApp.list;
  L.length = 0;
  ['jobAds', 'jobAmo', 'jobMk', 'jobFacts', 'onOpenOther'].forEach(fn => L.push({ getHandlerFunction: () => fn }));
  assert.strictEqual(t.ensureTriggers_(), 1);
  assert.strictEqual(t.ensureTriggers_(), 0);
  assert.deepStrictEqual(L.map(x => x.getHandlerFunction()), ['onOpenOther', 'jobDaily']);
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
    { 'Дата': D('2026-09-01'), 'Площадка': 'Яндекс Директ', 'Кабинет': 'основной', 'ID кампании': '555', 'Кампания': 'Посевы Макс', 'Расход': 500, 'Лиды (кабинет)': 4 },
  ],
  adsManual: [{ 'Дата': D('2026-09-02'), 'Канал': 'Telegram', 'Кампания': 'Посев @moto', 'Расход': 3000 }],
  tilda: [{ 'Получена': D('2026-09-03'), 'ID заявки': 't1', 'Форма': 'Пробная', 'Телефон': '79160000009',
    'utm_source': 'yandex', 'utm_campaign': '555' }],
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
    { 'ID записи': 'v4', 'Дата': D('2026-09-07'), 'ID ученика': 103, 'Пробное': true, 'Пришёл': true },
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
  // Лиды из кабинета — отдельное событие с каналом кампании
  assert.deepStrictEqual(by('лид_кабинет').map(r => [r[2], r[3], r[4]]), [['Макс', 'Посевы Макс', 4]]);
  // Спам не лид; сделка без UTM — «Не определён»
  assert.strictEqual(by('лид').length, 3);
  assert.strictEqual(by('лид', 'Не определён').length, 1);
  // utm_campaign=555 → название кампании из кабинета → правило «Макс»
  assert.deepStrictEqual(by('лид', 'Макс').map(r => r[3]), ['Посевы Макс']);
  assert.deepStrictEqual(by('лид', 'VK Реклама').map(r => r[3]), ['Мотокросс дети']);
  // Клиент 101: первая сделка без канала, вторая — VK → канал VK
  assert.deepStrictEqual(by('пробное').map(r => [r[2], r[7]]), [['VK Реклама', 101], ['Макс', 103]]);
  // Заявка с Тильды: канал по UTM, ученик 103 нашёлся по телефону только в Тильде
  assert.deepStrictEqual(by('заявка_сайт').map(r => [r[2], r[3], r[6]]), [['Макс', 'Посевы Макс', 't1']]);
  assert.deepStrictEqual(by('абонемент').map(r => [r[2], r[5]]), [['VK Реклама', 20000]]);
  assert.deepStrictEqual(by('повторная').map(r => [r[2], r[5]]), [['Макс', 3000]]);
  // «Пробное» в продажах не считается
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
  const tsv = 'Date\tCampaignId\tCampaignName\tImpressions\tClicks\tCost\tConversions_1_AUTO\tConversions_2_AUTO\n' +
    '2026-09-01\t555\tПосевы Макс\t1000\t20\t1234.5\t3\t--\n2026-09-02\t555\tПосевы Макс\t10\t1\t50\t1\t2\n';
  const rows = plain(t.parseYandexTsv_(tsv, ''));
  assert.deepStrictEqual(rows.map(r => [r[2], r[3], r[4], r[7], r[8]]),
    [['основной', '555', 'Посевы Макс', 1234.5, 3], ['основной', '555', 'Посевы Макс', 50, 3]]);
  // Одна колонка Conversions (цели по умолчанию)
  const one = t.parseYandexTsv_('Date\tCampaignId\tCampaignName\tImpressions\tClicks\tCost\tConversions\n2026-09-01\t1\tA\t1\t1\t10\t4\n', 'login');
  assert.strictEqual(one[0][8], 4);
  assert.strictEqual(one[0][2], 'login');
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
  console.log('     Сводка_каналы!Q5 =', f('Сводка_каналы', 'Q5'));
  console.log('     Сводка_месяцы!P5 =', f('Сводка_месяцы', 'P5'));
  console.log('     Сводка_месяцы!Q2 =', f('Сводка_месяцы', 'Q2'));
  console.log('     Дашборд!K7     =', f('Дашборд', 'K7'));
  console.log('     Данные_графиков!A2 =', f('Данные_графиков', 'A2'));
  assert.ok(f('Сводка_каналы', 'Q5').includes('IFERROR((N5-B5)/B5'));
  assert.ok(f('Сводка_каналы', 'G5').includes('"заявка_сайт"'));
  assert.ok(f('Сводка_каналы', 'E5').includes('"лид_кабинет"'));
  // Мок не считает формулы, поэтому проверка локали видит «ошибку» и включает «;».
  // Ни в одной формуле не должно остаться запятых вне строк и имён листов.
  const bare = x => x.replace(/"[^"]*"|'[^']*'/g, '');
  Object.values(ss.sheets).forEach(s => Object.keys(s.cells).forEach(k => {
    const fm = s.cells[k].f;
    if (fm) assert.ok(!bare(fm).includes(','), s.getName() + ' ' + k + ': ' + fm);
  }));
  assert.strictEqual(f('Дашборд', 'B3'), '=DATE(YEAR(TODAY());MONTH(TODAY());1)');
  assert.ok(f('Сводка_месяцы', 'S5').includes('N5-B5-R5'));
  assert.strictEqual(f('Дашборд', 'M7'), '=I7-A7-L7');

  // Повторный запуск на старом листе «Настройки» без YANDEX_GOALS: параметр дописывается, правила целы
  const st = sh('Настройки');
  const rowOf = code => Object.keys(st.cells).find(k => k.endsWith(',8') && st.cells[k].v === code);
  const gk = rowOf('YANDEX_GOALS');
  delete st.cells[gk]; delete st.cells[gk.replace(',8', ',9')]; delete st.cells[gk.replace(',8', ',10')];
  t.setupSheets();
  assert.ok(rowOf('YANDEX_GOALS'), 'YANDEX_GOALS не дописан');
  assert.strictEqual(t.params_().rules.length, p.rules.length);
  assert.strictEqual(Object.keys(st.cells).filter(k => k.endsWith(',8') && st.cells[k].v === 'YANDEX_GOALS').length, 1);

  // Сырые данные → fact
  const put = (name, head, objs) => sh(name).getRange(2, 1, objs.length, head.length).setValues(objs.map(o => head.map(h => (h in o ? o[h] : ''))));
  put('raw_ads', t.HEAD.ads, data.ads);
  put('raw_amo', t.HEAD.amo, data.amo);
  put('raw_mk_clients', t.HEAD.mkClients, data.clients);
  put('raw_mk_visits', t.HEAD.mkVisits, data.visits);
  put('raw_mk_subs', t.HEAD.mkSubs, data.subs);
  put('raw_mk_payments', t.HEAD.mkPays, data.pays);
  // Ежедневная задача проходит все шаги (источники не подключены) и пересобирает сводку
  t.jobDaily();
  const steps = plain(t.readRows_('Лог')).map(r => r[1]);
  ['Реклама', 'амоCRM', 'Мой Класс', 'Сводка'].forEach(x => assert.ok(steps.indexOf(x) >= 0, x + ' нет в Логе'));
  const msg = t.rebuildFacts();
  assert.ok(/лиды \(кабинет\) 4, заявки с сайта 0, лиды \(CRM\) 3/.test(msg), msg);
  console.log('     rebuildFacts →', msg);
  assert.strictEqual(t.readRows_('fact').length, t.buildFacts_(Object.assign({}, data, { adsManual: [], tilda: [] }), p).length);
});

console.log('\n' + passed + ' тестов пройдено' + (process.exitCode ? ', есть ошибки' : ''));
