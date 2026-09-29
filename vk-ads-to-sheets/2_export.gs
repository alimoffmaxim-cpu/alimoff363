function exportForDays_(daysBack) {
  const tz = Session.getScriptTimeZone();
  const to = new Date();
  const from = new Date(to.getTime() - daysBack * 24 * 3600 * 1000);
  const dateFrom = Utilities.formatDate(from, tz, 'yyyy-MM-dd');
  const dateTo = Utilities.formatDate(to, tz, 'yyyy-MM-dd');

  const names = fetchObjectNames_();
  const ids = Object.keys(names);
  const totals = {}; // дата → [расход, лиды]

  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const res = apiGet_('/statistics/' + CONFIG.LEVEL + '/day.json', {
      id: chunk.join(','),
      date_from: dateFrom,
      date_to: dateTo,
      metrics: 'base',
    });
    (res.items || []).forEach(function (item) {
      (item.rows || []).forEach(function (r) {
        const b = r.base || {};
        const t = totals[r.date] || (totals[r.date] = [0, 0]);
        t[0] += num_(b.spent);
        t[1] += num_(b.goals);
      });
    });
  }

  const rows = Object.keys(totals)
    .filter(function (d) { return totals[d][0] || totals[d][1]; }) // пропускаем пустые дни
    .map(function (d) { return [d, Math.round(totals[d][0] * 100) / 100, totals[d][1]]; });
  writeRows_(rows, dateFrom, dateTo);
  return { objects: ids.length, rows: rows.length };
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

/** Перезаписывает строки за период [dateFrom; dateTo], остальную историю сохраняет. */
function writeRows_(newRows, dateFrom, dateTo) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CONFIG.SHEET_NAME) || ss.insertSheet(CONFIG.SHEET_NAME);
  const tz = Session.getScriptTimeZone();

  let kept = [];
  if (sh.getLastRow() > 1) {
    kept = sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS.length).getValues()
      .map(function (r) {
        if (r[0] instanceof Date) r[0] = Utilities.formatDate(r[0], tz, 'yyyy-MM-dd');
        return r;
      })
      .filter(function (r) { return r[0] && (r[0] < dateFrom || r[0] > dateTo); });
  }

  const all = kept.concat(newRows).sort(function (a, b) {
    return a[0] === b[0] ? String(a[2]).localeCompare(String(b[2])) : (a[0] < b[0] ? 1 : -1);
  });

  sh.clearContents();
  sh.getRange('A:A').setNumberFormat('@'); // дата — как текст
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  if (all.length) sh.getRange(2, 1, all.length, HEADERS.length).setValues(all);
}

function setupDailyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'exportVkAdsStats'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('exportVkAdsStats').timeBased().everyDays(1).atHour(CONFIG.TRIGGER_HOUR).create();
}

