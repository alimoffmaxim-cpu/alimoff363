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

/** По несколько записей каждого эндпоинта Мой Класс — сверить названия полей. */
function debugMk() {
  const today = dayKey_(new Date());
  const monthAgo = dayKey_(addDays_(new Date(), -30));
  const calls = [
    ['/users', {}],
    ['/subscriptions', {}],
    ['/lessons', { date: [monthAgo, today], includeRecords: true }],
    ['/userSubscriptions', { sellDate: [monthAgo, today] }],
    ['/payments', { date: [monthAgo, today] }],
  ];
  const rows = [['Запрос', 'Ответ (первые записи)']];
  calls.forEach(c => {
    let text;
    try {
      text = JSON.stringify(mkGet_(c[0], Object.assign({ limit: 3 }, c[1])), null, 1);
    } catch (e) {
      text = 'ОШИБКА: ' + e.message;
    }
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
