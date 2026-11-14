// ---------- Подбор метрики подписок ----------

/**
 * Подбор метрики подписок: запустите из редактора. На лист «VK debug» выпишутся все метрики
 * первого направления за 7 дней. Найдите значение, равное вступлениям в сообщество в кабинете за тот же период,
 * и впишите имя метрики в колонку «Метрика подписок» на листе настроек (или в SOVA.LEADS_METRIC).
 */
function debugVkMetrics() {
  const cab = sovaCabinets_()[0];
  const tz = Session.getScriptTimeZone();
  const from = Utilities.formatDate(new Date(Date.now() - 7 * SOVA_DAY_MS), tz, 'yyyy-MM-dd');
  const to = Utilities.formatDate(new Date(Date.now() - SOVA_DAY_MS), tz, 'yyyy-MM-dd');
  const ids = sovaObjectIds_(cab), sums = {};
  for (let i = 0; i < ids.length; i += 100) {
    const p = { id: ids.slice(i, i + 100).join(','), date_from: from, date_to: to, metrics: 'all' };
    let res;
    try { res = sovaApiGet_(cab, '/statistics/' + SOVA.LEVEL + '/day.json', p); } catch (e) {
      p.metrics = 'base,events,uniques,video,carousel,tps,playable,social_network,romi';
      res = sovaApiGet_(cab, '/statistics/' + SOVA.LEVEL + '/day.json', p);
    }
    (res.items || []).forEach(function (it) { (it.rows || []).forEach(function (r) { sovaLeaves_(r, '', sums); }); });
  }
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('VK debug') || ss.insertSheet('VK debug');
  sh.clearContents();
  const rows = Object.keys(sums).sort().map(function (k) { return [k, sums[k]]; });
  sh.getRange(1, 1, 1, 2).setValues([[cab.name + ': метрика (' + from + ' — ' + to + ')', 'Сумма']]);
  if (rows.length) sh.getRange(2, 1, rows.length, 2).setValues(rows);
}

function sovaLeaves_(obj, prefix, sums) {
  Object.keys(obj).forEach(function (k) {
    if (k === 'date') return;
    const v = obj[k], key = prefix ? prefix + '.' + k : k;
    if (v !== null && typeof v === 'object') sovaLeaves_(v, key, sums);
    else if (v !== '' && isFinite(Number(v))) sums[key] = (sums[key] || 0) + Number(v);
  });
}
