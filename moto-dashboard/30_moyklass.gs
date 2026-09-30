// ---------- Мой Класс (api.moyklass.com) ----------

function mkConfigured_() { return !!prop_('MK_API_KEY'); }

function mkToken_() {
  const props = PropertiesService.getScriptProperties();
  const t = props.getProperty('MK_TOKEN');
  if (t && Date.now() < Number(props.getProperty('MK_TOKEN_EXPIRES') || 0) - 60000) return t;
  const resp = http_(CFG.MK_API + '/auth/getToken', {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ apiKey: prop_('MK_API_KEY') }),
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('Мой Класс: не удалось получить токен (' + resp.getResponseCode() + '): ' + resp.getContentText().slice(0, 300));
  }
  const data = JSON.parse(resp.getContentText());
  const exp = data.expiresAt ? new Date(data.expiresAt).getTime() : NaN;
  props.setProperties({ MK_TOKEN: data.accessToken, MK_TOKEN_EXPIRES: String(isNaN(exp) ? Date.now() + 3600000 : exp) });
  return data.accessToken;
}

function mkGet_(path, params, isRetry) {
  const resp = http_(CFG.MK_API + path + qs_(params), { headers: { 'x-access-token': mkToken_() } });
  const code = resp.getResponseCode();
  Utilities.sleep(150);
  if (code === 401 && !isRetry) {
    PropertiesService.getScriptProperties().deleteProperty('MK_TOKEN');
    return mkGet_(path, params, true);
  }
  if (code !== 200) throw new Error('Мой Класс ' + path + ' → ' + code + ': ' + resp.getContentText().slice(0, 500));
  return JSON.parse(resp.getContentText());
}

/** Все страницы списка. key — имя массива в ответе (users, lessons, …). */
function mkList_(path, params, key) {
  let out = [];
  for (let offset = 0; ;) {
    const res = mkGet_(path, Object.assign({}, params, { limit: CFG.MK_PAGE, offset: offset }));
    const items = Array.isArray(res) ? res : res[key] || [];
    out = out.concat(items);
    offset += items.length;
    const total = res.stats && res.stats.totalItems;
    if (items.length < CFG.MK_PAGE || (total != null && offset >= total)) break;
  }
  return out;
}

function updateMk() {
  if (!mkConfigured_()) return 'не подключено';
  const p = params_();
  const parts = [];

  // Ученики — целиком: нужны телефоны для связи с амо
  const users = mkList_('/users', {}, 'users');
  writeTable_(SHEETS.mkClients, HEAD.mkClients,
    users.map(u => [u.id, u.name || '', normalizePhone_(u.phone), day_(u.createdAt)]));
  parts.push('учеников ' + users.length);

  // Записи на занятия: пробные и посещения
  let w = window_(hasRows_(SHEETS.mkVisits), p);
  const visits = [];
  mkList_('/lessons', { date: [w.from, w.to], includeRecords: true }, 'lessons').forEach(l => {
    (l.records || []).forEach(r => {
      visits.push([String(r.id || l.id + '-' + r.userId), day_(l.date), r.userId, l.id, bool_(r.test), bool_(r.visit)]);
    });
  });
  mergeRows_(SHEETS.mkVisits, HEAD.mkVisits, visits, r => String(r[0]), r => inWindow_(r[1], w), 1);
  parts.push('записей на занятия ' + visits.length);

  // Проданные абонементы и разовые тренировки
  const catalog = {};
  const cat = mkGet_('/subscriptions', {});
  (Array.isArray(cat) ? cat : cat.subscriptions || []).forEach(s => { catalog[s.id] = s; });
  w = window_(hasRows_(SHEETS.mkSubs), p);
  const subs = mkList_('/userSubscriptions', { sellDate: [w.from, w.to] }, 'subscriptions').map(s => {
    const c = catalog[s.subscriptionId] || {};
    return [String(s.id), day_(s.sellDate || s.createdAt), s.userId, s.subscriptionId, c.name || s.name || '',
      num_(s.visitCount != null ? s.visitCount : c.visitCount), num_(s.price != null ? s.price : c.price)];
  });
  mergeRows_(SHEETS.mkSubs, HEAD.mkSubs, subs, r => String(r[0]), r => inWindow_(r[1], w), 1);
  parts.push('абонементов ' + subs.length);

  // Платежи
  w = window_(hasRows_(SHEETS.mkPays), p);
  const pays = mkList_('/payments', { date: [w.from, w.to] }, 'payments').map(x => [
    String(x.id), day_(x.date || x.createdAt), x.userId, x.optype || x.type || '', num_(x.summa), x.comment || '',
  ]);
  mergeRows_(SHEETS.mkPays, HEAD.mkPays, pays, r => String(r[0]), r => inWindow_(r[1], w), 1);
  parts.push('платежей ' + pays.length);

  return parts.join(', ');
}
