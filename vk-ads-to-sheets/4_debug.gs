/**
 * Проверка: какая метрика VK соответствует лидам из кабинета.
 * Запустите из редактора. На лист «VK debug» выпишутся все метрики за последние
 * 7 дней (без сегодня), суммой по всему кабинету. Найдите строку, где значение
 * совпадает с лидами в кабинете за тот же период, и впишите её имя в CONFIG.LEADS_METRIC.
 */
function debugVkMetrics() {
  const tz = Session.getScriptTimeZone();
  const dateFrom = Utilities.formatDate(new Date(Date.now() - 7 * DAY_MS), tz, 'yyyy-MM-dd');
  const dateTo = Utilities.formatDate(new Date(Date.now() - DAY_MS), tz, 'yyyy-MM-dd');
  const ids = Object.keys(fetchObjectNames_());
  const sums = {};

  for (let i = 0; i < ids.length; i += 100) {
    const params = { id: ids.slice(i, i + 100).join(','), date_from: dateFrom, date_to: dateTo, metrics: 'all' };
    let res;
    try {
      res = apiGet_('/statistics/' + CONFIG.LEVEL + '/day.json', params);
    } catch (e) {
      params.metrics = 'base,events,uniques,video,carousel,tps,playable,social_network,romi';
      res = apiGet_('/statistics/' + CONFIG.LEVEL + '/day.json', params);
    }
    (res.items || []).forEach(function (item) {
      (item.rows || []).forEach(function (r) { sumLeaves_(r, '', sums); });
    });
  }

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('VK debug') || ss.insertSheet('VK debug');
  sh.clearContents();
  const rows = Object.keys(sums).sort().map(function (k) { return [k, sums[k]]; });
  sh.getRange(1, 1, 1, 2).setValues([['Метрика (' + dateFrom + ' — ' + dateTo + ')', 'Сумма']]);
  if (rows.length) sh.getRange(2, 1, rows.length, 2).setValues(rows);
}

function sumLeaves_(obj, prefix, sums) {
  Object.keys(obj).forEach(function (k) {
    if (k === 'date') return;
    const v = obj[k];
    const key = prefix ? prefix + '.' + k : k;
    if (v !== null && typeof v === 'object') sumLeaves_(v, key, sums);
    else if (v !== '' && isFinite(Number(v))) sums[key] = (sums[key] || 0) + Number(v);
  });
}
