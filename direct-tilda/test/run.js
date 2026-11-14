// Проверка отчёта «Директ + Тильда» без Google и Директа: node direct-tilda/test/run.js
// Имитирует Google Таблицы, ответы Директа (отчёт + тексты объявлений) и заявки Тильды с разными метками;
// сверяет сопоставление каждой заявки и итоги листов с независимым подсчётом. Код выхода 1 — есть расхождения.
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..');
const code = fs.readdirSync(dir).filter(f => /^\d+_.*\.gs$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b))
  .map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');

// ---------- имитация Таблиц ----------
const A1 = a => { const m = a.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/), c = s => s.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  return [+m[2], c(m[1]), m[3] ? +m[4] - +m[2] + 1 : 1, m[3] ? c(m[3]) - c(m[1]) + 1 : 1]; };
const proxy = api => { const p = new Proxy(api, { get: (t, k) => k in t ? t[k] : () => p }); return p; };
const sheets = [];
function mkSheet(name) {
  const s = { name, cells: {}, maxR: 1000, maxC: 26 };
  const range = (r, c, nr = 1, nc = 1) => {
    if (r + nr - 1 > s.maxR) throw new Error(`вне листа ${name} ${r}+${nr}`);
    s.maxC = Math.max(s.maxC, c + nc - 1);
    const k = (i, j) => (r + i) + ',' + (c + j);
    const px = proxy({
      setValues: v => { if (v.length !== nr || v.some(x => x.length !== nc)) throw new Error(`setValues ${name} ${nr}x${nc} ≠ ${v.length}x${v[0].length}`);
        v.forEach((row, i) => row.forEach((x, j) => { s.cells[k(i, j)] = x; })); return px; },
      setValue: v => { s.cells[k(0, 0)] = v; return px; }, setFormula: f => { s.cells[k(0, 0)] = f; return px; },
      getValue: () => { const v = s.cells[k(0, 0)]; return v === '=TODAY()-1' ? new Date(Date.parse(TODAY) - 864e5) : v ?? ''; },
      getFormula: () => { const v = s.cells[k(0, 0)]; return typeof v === 'string' && v[0] === '=' ? v : ''; },
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => {
        const v = s.cells[k(i, j)]; return v === '=TODAY()-1' ? new Date(Date.parse(TODAY) - 864e5) : v ?? ''; })),
      getSheet: () => s.api, getRow: () => r, getLastRow: () => r + nr - 1, getColumn: () => c, getLastColumn: () => c + nc - 1,
      clear: () => { Object.keys(s.cells).forEach(x => { const [rr, cc] = x.split(',').map(Number);
        if (rr >= r && rr < r + nr && cc >= c && cc < c + nc) delete s.cells[x]; }); return px; },
    });
    return px;
  };
  s.api = proxy({
    getName: () => name, getMaxRows: () => s.maxR, getMaxColumns: () => s.maxC,
    getLastRow: () => Object.keys(s.cells).reduce((m, x) => s.cells[x] === '' ? m : Math.max(m, +x.split(',')[0]), 0),
    getLastColumn: () => Object.keys(s.cells).reduce((m, x) => Math.max(m, +x.split(',')[1]), 0),
    insertRowsAfter: (a, n) => { s.maxR += n; },
    getRange: (...a) => typeof a[0] === 'string' ? range(...A1(a[0])) : range(...a),
    appendRow: row => { const r = s.api.getLastRow() + 1; row.forEach((v, j) => { s.cells[r + ',' + (j + 1)] = v; }); },
  });
  sheets.push(s); return s;
}
mkSheet('Лист1');
const ssApi = proxy({ getSheetByName: n => (sheets.find(s => s.name === n) || {}).api || null,
  insertSheet: n => mkSheet(n).api, getSheets: () => sheets.map(s => s.api),
  deleteSheet: a => { const i = sheets.findIndex(s => s.api === a); sheets.splice(i, 1); } });
const props = {};
const alerts = [];
global.SpreadsheetApp = { getActive: () => ssApi, getUi: () => proxy({ alert: m => alerts.push(m), ButtonSet: {}, Button: {} }),
  newDataValidation: () => proxy({ build: () => ({}) }) };
global.PropertiesService = { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) };
global.LockService = { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) };
global.ContentService = { createTextOutput: t => t };
global.Utilities = { sleep: () => {}, getUuid: () => 'secret-uuid',
  formatDate: (d, tz, f) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).map(x => [x.type, x.value]));
    return f === 'yyyy-MM-dd' ? `${p.year}-${p.month}-${p.day}` : `${p.day}.${p.month} ${p.hour}:${p.minute}`; } };

// ---------- имитация Директа ----------
const TODAY = '2026-11-14T09:00:00Z';
const RealDate = Date;   // «сейчас» в коде — new Date() и Date.now(): подменяем оба
let NOW = RealDate.parse(TODAY);
global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } };
const ADS = [   // объявление, группа, кампания
  [7000001, 6000001, 5000001], [7000002, 6000001, 5000001], [7000003, 6000002, 5000001],
  [7000004, 6000003, 5000002], [7000005, 6000003, 5000002]];
const CN = { 5000001: 'Ремонт квартир | Поиск', 5000002: 'Ремонт квартир | РСЯ' };
const GN = { 6000001: 'Ремонт под ключ', 6000002: 'Дизайн-проект', 6000003: 'Ретаргетинг' };
const stat = (a, day) => { const n = (a % 7) + day; return [100 + n * 13, 5 + (n % 9), 50 + n * 3.25]; };   // показы, клики, расход
let reportCalls = 0;
global.UrlFetchApp = { fetch: (url, o) => {
  const body = JSON.parse(o.payload);
  if (/reports$/.test(url)) {
    if (reportCalls++ === 0) return { getResponseCode: () => 201, getAllHeaders: () => ({ retryIn: '1' }) };   // «отчёт готовится»
    const { DateFrom, DateTo } = body.params.SelectionCriteria, lines = ['Date\tCampaignId\tCampaignName\tAdGroupId\tAdGroupName\tAdId\tImpressions\tClicks\tCost'];
    for (let d = DateFrom, i = 0; d <= DateTo; d = new Date(Date.parse(d) + 864e5).toISOString().slice(0, 10), i++)
      ADS.forEach(([a, g, c]) => { const [sh, cl, sp] = stat(a, i % 30); lines.push([d, c, CN[c], g, GN[g], a, sh, cl, sp].join('\t')); });
    return { getResponseCode: () => 200, getContentText: () => lines.join('\n') };
  }
  if (/ads$/.test(url)) return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ result: {
    Ads: ADS.filter(x => body.params.SelectionCriteria.CampaignIds.includes(x[2])).map(([a, g, c]) => ({ Id: a, AdGroupId: g, CampaignId: c,
      Type: 'TEXT_AD', State: 'ON', TextAd: { Title: 'Заголовок ' + a, Title2: '', Text: 'Текст ' + a, Href: 'https://site.ru/?utm_content={ad_id}' } })) } }) };
  return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ result: { Campaigns: [] } }) };
} };

eval(code + '\nObject.assign(global, { drSetup, drDailyUpdate, doPost, onEdit, drRecompute_ });');
props.YANDEX_TOKEN = 'token';
props.TILDA_SECRET = 'secret-uuid';   // в таблице его создаёт «Отчёт → Подключить Тильду»
drSetup();
const get = n => sheets.find(s => s.name === n);
const val = (n, r, c) => get(n).cells[r + ',' + c];

// правило: «spring» в utm_campaign → объявление 7000005
const rules = get('Сопоставление меток'); rules.cells['2,1'] = 'utm_campaign'; rules.cells['2,2'] = 'содержит'; rules.cells['2,3'] = 'Spring'; rules.cells['2,6'] = 7000005;
drDailyUpdate();

// ---------- заявки ----------
const L = [   // [поля вебхука, ожидание: источник, кампания, группа, объявление, как]
  [{ utm_source: 'yandex', utm_campaign: '5000001', utm_content: '7000001' }, ['Директ', 5000001, 6000001, 7000001, 'ID объявления']],
  [{ utm_source: 'yandex', utm_campaign: 'search', utm_content: 'gid|6000003|aid|0' }, ['Директ', 5000002, 6000003, '', 'ID группы']],
  [{ utm_source: 'yandex', utm_campaign: 'Ремонт квартир | Поиск' }, ['Директ', 5000001, '', '', 'название кампании']],
  [{ utm_source: 'yandex', utm_term: 'дизайн-проект' }, ['Директ', 5000001, 6000002, '', 'название группы']],
  [{ utm_source: 'yandex', utm_campaign: 'unknownxyz' }, ['Директ', '', '', '', 'не сопоставлено']],
  [{ utm_source: 'vk', utm_campaign: 'promo' }, ['Другой источник: vk', '', '', '', '']],
  [{}, ['Без меток', '', '', '', '']],
  [{ landing_page: 'https://site.ru/?utm_source=yandex&utm_medium=cpc&utm_content=7000004&yclid=123456789' }, ['Директ', 5000002, 6000003, 7000004, 'ID объявления']],
  [{ utm_source: 'yandex', utm_campaign: 'SPRING_sale' }, ['Директ', 5000002, 6000003, 7000005, 'правило (строка 2)']],
  [{ COOKIES: 'a=1; TILDAUTM=' + encodeURIComponent('utm_source=yandex|||utm_campaign=5000002|||utm_term=xyz') }, ['Директ', 5000002, '', '', 'ID кампании']],
  [{ landing_page: 'https://site.ru/?yclid=987654321' }, ['Директ', '', '', '', 'не сопоставлено']],
];
let bad = 0, n = 0;
const send = (f, i, when) => { NOW = RealDate.parse(when); doPost({ parameter: Object.assign({ key: 'secret-uuid', tranid: 't' + i, formname: 'Заявка', Name: 'Имя', Phone: '+79000000000' }, f) }); };
L.forEach(([f], i) => send(f, i, '2026-11-0' + (1 + i % 9) + 'T10:00:00Z'));
send(L[0][0], 0, '2026-11-05T10:00:00Z');                       // повтор от Тильды — не дублируется
send({ utm_source: 'yandex', utm_content: '7000001' }, 99, '2026-10-20T10:00:00Z');   // вне периода
doPost({ parameter: { key: 'wrong', tranid: 'x' } });            // чужой ключ — не записывается
NOW = RealDate.parse(TODAY);
const lead = get('Заявки'), leadsCount = lead.api.getLastRow() - 1;
if (leadsCount !== L.length + 1) { bad++; console.log(`✗ заявок на листе ${leadsCount}, ждали ${L.length + 1} (дубль или чужой ключ прошли)`); }
drRecompute_();
L.forEach(([f, exp], i) => {
  const got = [14, 15, 17, 19, 20].map(c => val('Заявки', i + 2, c) ?? '');
  const ok = JSON.stringify(got) === JSON.stringify(exp); n++;
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} заявка ${i + 1}: ${JSON.stringify(f).slice(0, 90)} → ${got.join(' | ')}${ok ? '' : '   ждали: ' + exp.join(' | ')}`);
});

// ---------- итоги: период 01.11–13.11 (по умолчанию: с 1-го числа по вчера) ----------
const data = Object.keys(get('Данные Директа').cells).filter(k => k.endsWith(',1') && k !== '1,1').map(k => +k.split(',')[0])
  .map(r => [1, 2, 4, 6, 7, 8, 9].map(c => val('Данные Директа', r, c)));
const key = d => Utilities.formatDate(d, 'Europe/Moscow', 'yyyy-MM-dd');
const inP = r => key(r[0]) >= '2026-11-01' && key(r[0]) <= '2026-11-13';
const tot = data.filter(inP).reduce((s, r) => [s[0] + r[6], s[1] + r[4], s[2] + r[5]], [0, 0, 0]);
const directLeads = L.filter(x => x[1][0] === 'Директ').length;
const check = (name, got, exp) => { n++; const ok = Math.abs(got - exp) < 1e-6; if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${name}: ${got} ${ok ? '' : '≠ ' + exp}`); };
check('Сводная: расход', val('Сводная', 7, 2), tot[0]);
check('Сводная: расход с НДС', val('Сводная', 7, 3), tot[0] * 1.22);
check('Сводная: показы', val('Сводная', 7, 4), tot[1]);
check('Сводная: заявки из Директа', val('Сводная', 7, 8), directLeads);
check('Сводная: всего заявок с сайта', val('Сводная', 19, 2), L.length);
['Кампании', 'Группы', 'Объявления'].forEach(s => {
  const lc = s === 'Кампании' ? 2 : s === 'Группы' ? 3 : 5;
  check(`${s}: итого расход`, val(s, 5, lc + 1), tot[0]);
  check(`${s}: итого заявок`, val(s, 5, lc + 7), directLeads);
  let rows = 0, sp = 0, ld = 0; for (let r = 6; val(s, r, 1) !== undefined || val(s, r, 2) !== undefined; r++) { rows++; sp += val(s, r, lc + 1); ld += val(s, r, lc + 7); }
  check(`${s}: сумма строк = итого (расход)`, sp, tot[0]); check(`${s}: сумма строк = итого (заявки)`, ld, directLeads);
});
const adRow = r => [val('Объявления', r, 3), val('Объявления', r, 4), val('Объявления', r, 12)];
let r7 = 6; while (val('Объявления', r7, 3) !== 7000001) r7++;
check('Объявления: заявки 7000001', val('Объявления', r7, 12), 1);
const ad = data.filter(x => inP(x) && x[3] === 7000001).reduce((s, x) => s + x[6], 0);
check('Объявления: расход 7000001', val('Объявления', r7, 6), ad);
console.log(adRow(r7).join(' | '), '| ссылка:', val('Объявления', r7, 15));

// смена периода на «Сводной» → пересчёт
get('Сводная').cells['3,2'] = new Date('2026-11-05T12:00:00Z'); get('Сводная').cells['3,4'] = new Date('2026-11-05T12:00:00Z');
onEdit({ range: get('Сводная').api.getRange('B3') });
check('Период 05.11: заявок из Директа', val('Сводная', 7, 8), L.filter((x, i) => x[1][0] === 'Директ' && 1 + i % 9 === 5).length);
check('Период 05.11: дней в таблице «По дням»', [...Array(30).keys()].filter(i => val('Сводная', 23 + i, 1) instanceof Date).length, 1);
console.log(`\nИТОГ: ${bad ? 'РАСХОЖДЕНИЙ ' + bad : 'всё совпало'} (проверок ${n})`);
process.exit(bad ? 1 : 0);
