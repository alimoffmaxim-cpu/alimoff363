// ---------- Отладка: помогает заполнить лист «Настройки» ----------
// Результат пишется на лист «debug».

function debugOut_(rows) {
  const sh = sheet_(SHEETS.debug);
  sh.clearContents();
  const w = Math.max.apply(null, rows.map(r => r.length));
  sh.getRange(1, 1, rows.length, w).setValues(rows.map(r => r.concat(Array(w - r.length).fill(''))));
  SpreadsheetApp.getActive().setActiveSheet(sh);
}

/** Поля последних 250 сделок амо с примерами значений, воронки и статусы, теги. */
function debugAmoFields() {
  const leads = (amoGet_('/api/v4/leads', { limit: 250, 'order[created_at]': 'desc' })._embedded || {}).leads || [];
  const fields = {};
  const tags = {};
  leads.forEach(l => {
    (l.custom_fields_values || []).forEach(f => {
      const k = f.field_name + '|' + (f.field_code || '') + '|' + f.field_id;
      const s = fields[k] = fields[k] || {};
      (f.values || []).forEach(v => { if (Object.keys(s).length < 6) s[String(v.value).slice(0, 80)] = true; });
    });
    ((l._embedded || {}).tags || []).forEach(t => { tags[t.name] = (tags[t.name] || 0) + 1; });
  });
  const rows = [['Поле сделки', 'Код поля', 'ID поля', 'Примеры значений (последние ' + leads.length + ' сделок)']];
  Object.keys(fields).sort().forEach(k => rows.push(k.split('|').concat([Object.keys(fields[k]).join(' ; ')])));
  rows.push([''], ['Тег', 'Сделок']);
  Object.keys(tags).sort((a, b) => tags[b] - tags[a]).forEach(t => rows.push([t, tags[t]]));
  rows.push([''], ['Воронка', 'Статусы']);
  const pipes = amoPipelines_();
  Object.keys(pipes).forEach(id => rows.push([pipes[id].name, Object.keys(pipes[id].statuses).map(s => pipes[id].statuses[s]).join(', ')]));
  debugOut_(rows);
}

/**
 * Мой Класс: какие поля реально заполнены у учеников (ищем рекламный источник),
 * справочник рекламных источников, флаги пробных/посещений, типы платежей
 * и по несколько сырых записей каждого эндпоинта.
 */
function debugMk() {
  const today = dayKey_(new Date());
  const monthAgo = dayKey_(addDays_(new Date(), -30));
  const rows = [];
  const tryGet = (path, params) => {
    try { return mkGet_(path, params); } catch (e) { return { error: e.message }; }
  };

  // 1. Поля учеников: сколько заполнено и примеры
  const users = (tryGet('/users', { limit: 500 }).users) || [];
  const fields = {};
  const walk = (v, key) => {
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return;
    if (Array.isArray(v)) { v.forEach(x => walk(x, key + '[]')); return; }
    if (typeof v === 'object') { Object.keys(v).forEach(k => walk(v[k], key + '.' + k)); return; }
    const f = fields[key] = fields[key] || { n: 0, ex: {} };
    f.n++;
    if (Object.keys(f.ex).length < 5) f.ex[String(v).slice(0, 60)] = true;
  };
  users.forEach(u => Object.keys(u).forEach(k => walk(u[k], k)));
  rows.push(['ПОЛЯ УЧЕНИКОВ (первые ' + users.length + ')', 'Заполнено', 'Примеры значений']);
  Object.keys(fields).sort().forEach(k => rows.push([k, fields[k].n, Object.keys(fields[k].ex).join(' ; ')]));

  // 2. Справочник рекламных источников
  rows.push([''], ['РЕКЛАМНЫЕ ИСТОЧНИКИ (/advSources)']);
  const adv = tryGet('/advSources', {});
  if (adv.error) rows.push(['нет данных: ' + adv.error.slice(0, 200)]);
  else (Array.isArray(adv) ? adv : adv.advSources || adv.sources || []).forEach(x => rows.push([x.id, x.name || JSON.stringify(x)]));

  // 3. Пробные и посещения за 30 дней
  const lessons = (tryGet('/lessons', { date: [monthAgo, today], includeRecords: true, limit: 100 }).lessons) || [];
  let recs = 0, test = 0, visit = 0, both = 0;
  lessons.forEach(l => (l.records || []).forEach(r => {
    recs++;
    if (bool_(r.test)) test++;
    if (bool_(r.visit)) visit++;
    if (bool_(r.test) && bool_(r.visit)) both++;
  }));
  rows.push([''], ['ЗАНЯТИЯ ЗА 30 ДНЕЙ (до 100)', 'Значение'],
    ['занятий', lessons.length], ['записей', recs], ['test = true (пробные)', test],
    ['visit = true (пришёл)', visit], ['пробные, где пришёл', both]);

  // 4. Типы платежей за 30 дней
  const pays = (tryGet('/payments', { date: [monthAgo, today], limit: 500 }).payments) || [];
  const types = {};
  pays.forEach(x => { const t = x.optype || x.type || '(пусто)'; types[t] = (types[t] || [0, 0]); types[t][0]++; types[t][1] += num_(x.summa); });
  rows.push([''], ['ПЛАТЕЖИ ЗА 30 ДНЕЙ: тип операции', 'Кол-во', 'Сумма']);
  Object.keys(types).forEach(t => rows.push([t, types[t][0], types[t][1]]));

  // 5. Сырые примеры
  rows.push([''], ['ЗАПРОС', 'ОТВЕТ (первые записи)']);
  [
    ['/users', {}],
    ['/subscriptions', {}],
    ['/lessons', { date: [monthAgo, today], includeRecords: true }],
    ['/userSubscriptions', { sellDate: [monthAgo, today] }],
    ['/payments', { date: [monthAgo, today] }],
  ].forEach(c => {
    const res = tryGet(c[0], Object.assign({ limit: 3 }, c[1]));
    const text = res.error ? 'ОШИБКА: ' + res.error : JSON.stringify(res, null, 1);
    rows.push([c[0] + qs_(c[1]), text.slice(0, 45000)]);
  });
  debugOut_(rows);
}

/** Операции кошелька Авито за 7 дней — чтобы выбрать, что считать расходом (AVITO_SPEND). */
function debugAvito() {
  const today = dayKey_(new Date());
  const ops = avitoOperations_(dayKey_(addDays_(new Date(), -6)), today);
  const rows = [['Дата', 'operationType', 'operationName', 'serviceName', 'Сумма', 'JSON']];
  ops.forEach(op => rows.push([op.updatedAt || op.createdAt || '', op.operationType || '', op.operationName || '',
    op.serviceName || '', op.amountTotal != null ? op.amountTotal : op.amountRub != null ? op.amountRub : op.amount,
    JSON.stringify(op).slice(0, 2000)]));
  if (rows.length === 1) rows.push(['Операций за 7 дней нет']);
  debugOut_(rows);
}

/** Все метрики VK за 7 дней суммой по кабинету — для сверки с кабинетом. */
function debugVkMetrics() {
  const from = dayKey_(addDays_(new Date(), -7));
  const to = dayKey_(addDays_(new Date(), -1));
  const ids = Object.keys(vkObjectNames_());
  const sums = {};
  for (let i = 0; i < ids.length; i += 100) {
    const res = vkGet_('/statistics/' + CFG.VK_LEVEL + '/day.json',
      { id: ids.slice(i, i + 100).join(','), date_from: from, date_to: to, metrics: 'base,events' });
    (res.items || []).forEach(item => (item.rows || []).forEach(r => sumLeaves_(r, '', sums)));
  }
  const rows = [['Метрика VK (' + from + ' — ' + to + ')', 'Сумма']];
  Object.keys(sums).sort().forEach(k => rows.push([k, sums[k]]));
  debugOut_(rows);
}

function sumLeaves_(obj, prefix, sums) {
  Object.keys(obj).forEach(k => {
    if (k === 'date') return;
    const v = obj[k];
    const key = prefix ? prefix + '.' + k : k;
    if (v !== null && typeof v === 'object') sumLeaves_(v, key, sums);
    else if (v !== '' && isFinite(Number(v))) sums[key] = (sums[key] || 0) + Number(v);
  });
}
