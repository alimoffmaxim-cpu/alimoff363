/** Загружает итоги за каждый день периода [dateFrom; dateTo] и дописывает их на лист. */
function exportRange_(dateFrom, dateTo) {
  const leadsGroup = CONFIG.LEADS_METRIC.split('.')[0];
  const metrics = leadsGroup === 'base' ? 'base' : 'base,' + leadsGroup;
  const ids = Object.keys(fetchObjectNames_());

  const totals = {}; // дата → [расход, лиды]; каждый день периода, даже без показов
  const tz = Session.getScriptTimeZone();
  for (let d = new Date(dateFrom + 'T12:00:00'); ; d = new Date(d.getTime() + DAY_MS)) {
    const key = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
    if (key > dateTo) break;
    totals[key] = [0, 0];
  }

  for (let i = 0; i < ids.length; i += 100) {
    const res = apiGet_('/statistics/' + CONFIG.LEVEL + '/day.json', {
      id: ids.slice(i, i + 100).join(','),
      date_from: dateFrom,
      date_to: dateTo,
      metrics: metrics,
    });
    (res.items || []).forEach(function (item) {
      (item.rows || []).forEach(function (r) {
        const t = totals[r.date];
        if (!t) return;
        t[0] += num_((r.base || {}).spent);
        t[1] += num_(getPath_(r, CONFIG.LEADS_METRIC));
      });
    });
  }

  const rows = Object.keys(totals).sort().map(function (d) {
    return [d, Math.round(totals[d][0] * 100) / 100, totals[d][1]];
  });
  appendRows_(rows);
  return { objects: ids.length, rows: rows.length };
}

/** Значение по пути вида 'base.goals'. */
function getPath_(obj, path) {
  return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
}

/** Список объектов выбранного уровня: {id: name}. */
function fetchObjectNames_() {
  const names = {};
  const limit = 250;
  let offset = 0;
  while (true) {
    const res = apiGet_('/' + CONFIG.LEVEL + '.json', { fields: 'id,name', limit: limit, offset: offset });
    const items = res.items || [];
    items.forEach(function (it) { names[it.id] = it.name; });
    offset += items.length;
    if (!items.length || offset >= (res.count || 0)) break;
  }
  return names;
}

/**
 * Дописывает строки снизу. Если дата уже есть на листе — обновляет её строку.
 * Трогает только колонки A–C, свои формулы можно добавлять правее.
 */
function appendRows_(rows) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.SHEET_NAME);
    sh.getRange('A:A').setNumberFormat('@'); // дата — как текст
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  const tz = Session.getScriptTimeZone();
  const rowOf = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r, i) {
      const d = r[0] instanceof Date ? Utilities.formatDate(r[0], tz, 'yyyy-MM-dd') : String(r[0]);
      rowOf[d] = i + 2;
    });
  }
  rows.forEach(function (row) {
    const at = rowOf[row[0]] || sh.getLastRow() + 1;
    sh.getRange(at, 1, 1, HEADERS.length).setValues([row]);
  });
}

function setupDailyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'exportVkAdsStats'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('exportVkAdsStats').timeBased().everyDays(1).atHour(CONFIG.TRIGGER_HOUR).create();
}
