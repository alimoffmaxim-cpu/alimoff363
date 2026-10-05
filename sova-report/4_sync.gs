// ---------- Загрузка статистики из кабинетов в лист «Данные» ----------
// В «Данные» одна строка = один день одного направления: дата, направление, расход, показы, клики, подписки.

const SOVA_DATA_HEAD = ['Дата', 'Направление', 'Расход', 'Показы', 'Клики', 'Подписки'];

/** Догружает каждый кабинет с последней загруженной даты до вчера. Ошибка одного кабинета не мешает остальным. */
function sovaSyncAll_() {
  const store = sovaReadData_();
  const yesterday = Utilities.formatDate(new Date(Date.now() - SOVA_DAY_MS), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const res = { added: {}, errors: [] };
  sovaCabinets_().forEach(function (cab) {
    try {
      const last = Object.keys(store).filter(function (k) { return store[k][1] === cab.name; })
        .map(function (k) { return store[k][0]; }).sort().pop();
      const from = last ? sovaAddDays_(last, 1 - SOVA.REFRESH_DAYS) : sovaAddDays_(yesterday, 1 - SOVA.INITIAL_DAYS);
      const days = sovaFetchCabinet_(cab, from, yesterday);
      Object.keys(days).forEach(function (d) { store[d + '|' + cab.name] = [d, cab.name].concat(days[d]); });
      res.added[cab.name] = Object.keys(days).length;
    } catch (e) {
      res.errors.push(cab.name + ': ' + e.message);
    }
  });
  sovaWriteData_(store);
  try { sbDaysAll_(); } catch (e) { res.errors.push('таблицы по дням: ' + e.message); }
  return res;
}

/** Итоги кабинета по дням: {дата: [расход, показы, клики, подписки]} — каждый день периода, даже без показов. */
function sovaFetchCabinet_(cab, dateFrom, dateTo) {
  const days = {};
  for (let d = dateFrom; d <= dateTo; d = sovaAddDays_(d, 1)) days[d] = [0, 0, 0, 0];
  const group = cab.leadsMetric.split('.')[0];
  const metrics = group === 'base' ? 'base' : 'base,' + group;
  const ids = sovaObjectIds_(cab);
  for (let from = dateFrom; from <= dateTo; from = sovaAddDays_(from, 90)) {
    const to = sovaAddDays_(from, 89) < dateTo ? sovaAddDays_(from, 89) : dateTo;
    for (let i = 0; i < ids.length; i += 100) {
      const res = sovaApiGet_(cab, '/statistics/' + SOVA.LEVEL + '/day.json',
        { id: ids.slice(i, i + 100).join(','), date_from: from, date_to: to, metrics: metrics });
      (res.items || []).forEach(function (item) {
        (item.rows || []).forEach(function (r) {
          const t = days[r.date];
          if (!t) return;
          const b = r.base || {};
          t[0] += sovaNum_(b.spent);
          t[1] += sovaNum_(b.shows);
          t[2] += sovaNum_(b.clicks);
          t[3] += sovaNum_(sovaPath_(r, cab.leadsMetric));
        });
      });
    }
  }
  Object.keys(days).forEach(function (d) { days[d][0] = Math.round(days[d][0] * 100) / 100; });
  return days;
}

/** ID всех объектов уровня SOVA.LEVEL в кабинете (все кампании, включая остановленные). */
function sovaObjectIds_(cab) {
  const ids = [];
  for (let offset = 0; ; ) {
    const res = sovaApiGet_(cab, '/' + SOVA.LEVEL + '.json', { fields: 'id', limit: 250, offset: offset });
    const items = res.items || [];
    items.forEach(function (it) { ids.push(it.id); });
    offset += items.length;
    if (!items.length || offset >= (res.count || 0)) break;
  }
  return ids;
}

/** Все строки листа «Данные»: {'дата|направление': [дата, направление, расход, показы, клики, подписки]}. */
function sovaReadData_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SOVA.DATA_SHEET);
  const store = {};
  if (!sh || sh.getLastRow() < 2) return store;
  const tz = Session.getScriptTimeZone();
  sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues().forEach(function (r) {
    const d = r[0] instanceof Date ? Utilities.formatDate(r[0], tz, 'yyyy-MM-dd') : String(r[0]).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !r[1]) return;
    store[d + '|' + r[1]] = [d, String(r[1]), sovaNum_(r[2]), sovaNum_(r[3]), sovaNum_(r[4]), sovaNum_(r[5])];
  });
  return store;
}

function sovaWriteData_(store) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SOVA.DATA_SHEET) || ss.insertSheet(SOVA.DATA_SHEET);
  const rows = Object.keys(store).sort().map(function (k) { return store[k]; });
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 6).clearContent();
  sh.getRange(1, 1, 1, 6).setValues([SOVA_DATA_HEAD]).setFontWeight('bold');
  if (!rows.length) return;
  sovaEnsureRows_(sh, rows.length + 1);
  // Дата — настоящая дата (по ней считают формулы отчёта), направление — текстом
  sh.getRange(2, 1, rows.length, 6).setValues(rows.map(function (r) {
    return [sovaParse_(r[0]), r[1], r[2], r[3], r[4], r[5]];
  }));
  sh.getRange(2, 1, rows.length, 1).setNumberFormat('dd.MM.yyyy');
  sh.getRange(2, 3, rows.length, 1).setNumberFormat('#,##0.00');
}

function sovaPath_(obj, path) {
  return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
}

/** 'yyyy-MM-dd' → дата в полдень по часовому поясу таблицы (чтобы не съезжала на соседний день). */
function sovaParse_(s) {
  const p = s.split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12);
}

function sovaAddDays_(s, n) {
  const p = s.split('-');
  const d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n));
  return d.toISOString().slice(0, 10);
}
