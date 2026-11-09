// Тесты без Google: код .gs выполняется в vm-контексте с моками Apps Script.
// Запуск: node moto-dashboard/test/run.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// ---------- Моки ----------
function makeSheet(name) {
  const sh = {
    name: name, cells: {},
    getName: () => name,
    getLastRow() { let m = 0; Object.keys(this.cells).forEach(k => { if (this.cells[k] !== '') m = Math.max(m, +k.split(',')[0]); }); return m; },
    getLastColumn() { let m = 0; Object.keys(this.cells).forEach(k => { if (this.cells[k] !== '') m = Math.max(m, +k.split(',')[1]); }); return m; },
    appendRow(row) { const r = this.getLastRow() + 1; row.forEach((v, i) => { this.cells[r + ',' + (i + 1)] = v; }); },
    setFrozenRows() {}, deleteRows() {},
    getRange(r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      const s = this;
      const range = {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => {
          const v = s.cells[(r + i) + ',' + (c + j)]; return v === undefined ? '' : v; })),
        getValue: () => range.getValues()[0][0],
        setValues: rows => { rows.forEach((row, i) => row.forEach((v, j) => { s.cells[(r + i) + ',' + (c + j)] = v; })); return range; },
        setValue: v => { s.cells[r + ',' + c] = v; return range; },
        setFontWeight: () => range, setNumberFormat: () => range,
        clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) delete s.cells[(r + i) + ',' + (c + j)]; return range; },
      };
      return range;
    },
  };
  return sh;
}
const sheets = {};
const props = {};
const fetches = [];
let fetchHandler = () => ({ code: 200, body: '{}' });

const ctx = {
  console,
  SpreadsheetApp: {
    getActive: () => ({
      getSheetByName: n => sheets[n] || null,
      insertSheet: n => (sheets[n] = makeSheet(n)),
    }),
    flush() {},
  },
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => (k in props ? props[k] : null),
    setProperty: (k, v) => { props[k] = String(v); },
    setProperties: o => Object.assign(props, o),
    deleteProperty: k => { delete props[k]; },
  }) },
  UrlFetchApp: { fetch: (url, opts) => {
    fetches.push({ url: url, opts: opts });
    const r = fetchHandler(url, opts);
    return { getResponseCode: () => r.code, getContentText: () => r.body, getAllHeaders: () => ({}) };
  } },
  Utilities: { sleep() {}, newBlob: (data, type, name) => ({ data: data, type: type, name: name }), getUuid: () => 'uuid' },
  ContentService: { createTextOutput: t => ({ text: t }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Logger: { log() {} },
};
vm.createContext(ctx);
const dir = path.join(__dirname, '..');
const src = fs.readdirSync(dir).filter(f => f.endsWith('.gs')).sort()
  .map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
const names = ['tildaRow_', 'ymClientId_', 'clickId_', 'metrikaVisitor_', 'metrikaCsv_', 'metrikaStatusGoals_',
  'sendMetrikaGoals_', 'normalizePhone_', 'localizeFormula_', 'HEAD', 'SHEETS', 'params_', 'tildaSnippet_'];
vm.runInContext(src + '\nthis.t = {' + names.map(n => n + ': ' + n).join(', ') + '};', ctx);
const t = ctx.t;
const plain = x => JSON.parse(JSON.stringify(x));
const D = s => vm.runInContext('new Date("' + s + '")', ctx);

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { process.exitCode = 1; console.log('FAIL ' + name + '\n     ' + (e.stack || e)); }
}

// ---------- Тесты ----------
test('normalizePhone_ и localizeFormula_', () => {
  assert.strictEqual(t.normalizePhone_('8 (916) 123-45-67'), '79161234567');
  assert.strictEqual(t.localizeFormula_('=IF(A1,{1,2},"a,b")', true), '=IF(A1;{1\\2};"a,b")');
});

test('Тильда: ClientID Метрики и yclid в строке заявки', () => {
  const r = plain(t.tildaRow_({ Phone: '+7 916 000-00-01', tranid: '1',
    COOKIES: 'TILDAUTM=x; _ym_uid=1712345678901234567; _ym_d=1',
    landing_page: 'https://motocrossmoscow.ru/?yclid=987654321&utm_source=yandex' }, new Date()));
  assert.strictEqual(r.length, t.HEAD.tilda.length);
  assert.strictEqual(r[t.HEAD.tilda.indexOf('ClientID Метрики')], '1712345678901234567');
  assert.strictEqual(r[t.HEAD.tilda.indexOf('yclid')], '987654321');
  // Скрытое поле из кода для сайта важнее куки
  assert.strictEqual(t.ymClientId_({ ym_client_id: '555', COOKIES: '_ym_uid=1' }), '555');
  assert.strictEqual(t.ymClientId_({}), '');
  assert.strictEqual(t.clickId_('ref=myclid=1', 'yclid'), '');
  assert.ok(t.tildaSnippet_().includes('ym_client_id: get("_ym_uid")'));
});

test('metrikaVisitor_: ClientID из свежей заявки, иначе yclid, иначе название сделки', () => {
  const ev = Date.parse('2026-11-05T12:00:00Z') / 1000;
  const by = { '79160000001': [
    { 'Получена': D('2026-11-01T10:00:00Z'), 'ClientID Метрики': '', 'yclid': '', 'Страница': 'https://x.ru/?yclid=42', 'Все поля': '' },
    { 'Получена': D('2026-11-02T10:00:00Z'), 'ClientID Метрики': '777', 'yclid': '' },
    { 'Получена': D('2026-09-01T10:00:00Z'), 'ClientID Метрики': '111', 'yclid': '' }, // старше 21 дня
  ] };
  assert.deepStrictEqual(plain(t.metrikaVisitor_('79160000001', ev, by, '')), { clientId: '777', yclid: '42' });
  by['79160000001'][1]['ClientID Метрики'] = '';
  assert.deepStrictEqual(plain(t.metrikaVisitor_('79160000001', ev, by, '')), { clientId: '', yclid: '42' });
  assert.deepStrictEqual(plain(t.metrikaVisitor_('79990000000', ev, by, 'Lead from: https://x.ru/?yclid=9')), { clientId: '', yclid: '9' });
  // Старая версия веб-приложения: ClientID только в «Все поля»
  const old = { '79160000002': [{ 'Получена': D('2026-11-02T10:00:00Z'), 'Все поля': 'Phone=1; ym_client_id=1762700000123456789; landing_page=https://x.ru/?yclid=5' }] };
  assert.deepStrictEqual(plain(t.metrikaVisitor_('79160000002', ev, old, '')), { clientId: '1762700000123456789', yclid: '5' });
  // Нет заявки Тильды — yclid из поля сделки амо
  assert.deepStrictEqual(plain(t.metrikaVisitor_('79990000000', ev, {}, '', { page_url: 'https://motocrossmoscow.ru/adult_school?utm_source=yandex&yclid=925086552511741951#signup' })), { clientId: '', yclid: '925086552511741951' });
  assert.deepStrictEqual(plain(t.metrikaVisitor_('79990000000', ev, {}, '', { yclid: '5832436442284949503' })), { clientId: '', yclid: '5832436442284949503' });
  assert.strictEqual(t.metrikaCsv_('ClientId', [{ id: '1', goal: 'trial_booked', time: 100 }]), 'ClientId,Target,DateTime\n1,trial_booked,100');
});

test('sendMetrikaGoals_: этапы амо → офлайн-конверсии, повтор не отправляется', () => {
  Object.assign(props, { AMO_DOMAIN: 'x.amocrm.ru', AMO_TOKEN: 'a', METRIKA_TOKEN: 'm', METRIKA_COUNTER: '123' });
  const tilda = sheets[t.SHEETS.tilda] = makeSheet(t.SHEETS.tilda);
  tilda.getRange(1, 1, 1, t.HEAD.tilda.length).setValues([t.HEAD.tilda]);
  const row = t.HEAD.tilda.map(h => ({ 'Получена': vm.runInContext('new Date(Date.now() - 86400000)', ctx), 'Телефон': '79160000001',
    'ClientID Метрики': '777' })[h] || '');
  tilda.getRange(2, 1, 1, row.length).setValues([row]);
  const now = Math.floor(Date.now() / 1000);
  fetchHandler = url => {
    if (url.includes('/leads/pipelines')) return { code: 200, body: JSON.stringify({ _embedded: { pipelines: [
      { id: 1, name: 'Воронка', _embedded: { statuses: [{ id: 10, name: 'Записан на пробное' }, { id: 11, name: 'Посетил пробное' }, { id: 12, name: 'Думает' }] } }] } }) };
    if (url.includes('/api/v4/events')) return { code: 200, body: JSON.stringify({ _embedded: { events: [
      { entity_id: 501, created_at: now - 600, value_after: [{ lead_status: { id: 10, pipeline_id: 1 } }] },
      { entity_id: 501, created_at: now - 300, value_after: [{ lead_status: { id: 11, pipeline_id: 1 } }] },
      { entity_id: 502, created_at: now - 200, value_after: [{ lead_status: { id: 10, pipeline_id: 1 } }] },
      { entity_id: 503, created_at: now - 100, value_after: [{ lead_status: { id: 12, pipeline_id: 1 } }] },
      { entity_id: 504, created_at: now - 50, value_after: [{ lead_status: { id: 11, pipeline_id: 1 } }] }] } }) };
    if (url.includes('/api/v4/leads')) return { code: 200, body: JSON.stringify({ _embedded: { leads: [
      { id: 501, name: 'Сделка', _embedded: { contacts: [{ id: 9, is_main: true }] } },
      { id: 502, name: 'Lead from: https://x.ru/?yclid=55', _embedded: { contacts: [] } },
      { id: 504, name: 'Звонок', _embedded: { contacts: [] } }] } }) };
    if (url.includes('/api/v4/contacts')) return { code: 200, body: JSON.stringify({ _embedded: { contacts: [
      { id: 9, custom_fields_values: [{ field_code: 'PHONE', values: [{ value: '+7 916 000-00-01' }] }] }] } }) };
    if (url.includes('offline_conversions/upload')) return { code: 200, body: '{"uploading":{"id":77}}' };
    return { code: 404, body: url };
  };
  fetches.length = 0;
  const msg = t.sendMetrikaGoals_();
  assert.ok(/отправлено целей: 3 \(trial_booked — 2, trial_visited — 1\)/.test(msg), msg);
  const ups = fetches.filter(f => f.url.includes('offline_conversions/upload'));
  assert.deepStrictEqual(ups.map(f => f.url.split('client_id_type=')[1]), ['CLIENT_ID', 'YCLID']);
  assert.ok(ups[0].url.startsWith('https://api-metrika.yandex.net/management/v1/counter/123/'));
  assert.strictEqual(ups[0].opts.headers.Authorization, 'OAuth m');
  assert.strictEqual(ups[0].opts.payload.file.data,
    'ClientId,Target,DateTime\n777,trial_booked,' + (now - 600) + '\n777,trial_visited,' + (now - 300));
  assert.strictEqual(ups[1].opts.payload.file.data, 'Yclid,Target,DateTime\n55,trial_booked,' + (now - 200));
  assert.ok(/без ClientID\/yclid: 1/.test(msg), msg);
  assert.strictEqual(sheets[t.SHEETS.metrika].getLastRow(), 5);

  fetches.length = 0;
  // Загруженная строка без yclid: при следующем запуске yclid дописывается, повторной отправки нет
  const jr = sheets[t.SHEETS.metrika];
  const r501 = Object.keys(jr.cells).filter(k => k.endsWith(',2') && jr.cells[k] === 501).map(k => +k.split(',')[0]);
  r501.forEach(r => { jr.cells[r + ',6'] = ''; });
  tilda.cells['2,' + (t.HEAD.tilda.indexOf('yclid') + 1)] = '31337';
  const again = t.sendMetrikaGoals_();
  r501.forEach(r => assert.strictEqual(jr.cells[r + ',6'], '31337'));
  // Загруженное не повторяется, сделка без идентификатора проверена снова и не задублирована в журнале
  assert.ok(/отправлено целей: 0/.test(again), again);
  assert.strictEqual(sheets[t.SHEETS.metrika].getLastRow(), 5);
  assert.ok(!fetches.some(f => f.url.includes('offline_conversions')));
});

console.log('\n' + passed + ' тестов пройдено' + (process.exitCode ? ', есть ошибки' : ''));
