// ---------- Реклама: общий запуск ----------

/** Дописывает расходы всех подключённых кабинетов на лист raw_ads. */
function updateAds() {
  const p = params_();
  const sources = [
    ['VK Реклама', vkConfigured_, loadVk_],
    ['Яндекс Директ', yandexConfigured_, loadYandex_],
    ['Авито', avitoConfigured_, loadAvito_],
  ];
  const parts = [];
  const errors = [];
  sources.forEach(s => {
    const name = s[0];
    if (!s[1]()) { parts.push(name + ' — не подключено'); return; }
    try {
      const w = window_(hasRows_(SHEETS.ads, r => r[1] === name), p);
      const rows = s[2](w.from, w.to, p);
      mergeRows_(SHEETS.ads, HEAD.ads, rows,
        r => [dayKey_(r[0]), r[1], r[2], r[3]].join('|'),
        r => r[1] === name && inWindow_(r[0], w), 0);
      parts.push(name + ' — ' + rows.length + ' строк за ' + w.from + '…' + w.to);
    } catch (e) {
      errors.push(name + ' — ' + e.message);
    }
  });
  if (errors.length) throw new Error(errors.concat(parts).join('; '));
  return parts.join('; ');
}

// ---------- VK Реклама (ads.vk.com) ----------
// Токены — как в vk-ads-to-sheets: ручной на 24 ч или client_credentials.

function vkConfigured_() { return !!(prop_('VK_CLIENT_ID') || prop_('VK_ACCESS_TOKEN')); }

/** Строки raw_ads: расход и лиды (base.vk.result) по каждой кампании за каждый день. */
function loadVk_(from, to) {
  const names = vkObjectNames_();
  const ids = Object.keys(names);
  const rows = [];
  for (let i = 0; i < ids.length; i += 100) {
    const res = vkGet_('/statistics/' + CFG.VK_LEVEL + '/day.json', {
      id: ids.slice(i, i + 100).join(','), date_from: from, date_to: to, metrics: 'base',
    });
    (res.items || []).forEach(item => {
      (item.rows || []).forEach(r => {
        const b = r.base || {};
        const leads = num_((b.vk || {}).result);
        if (!num_(b.spent) && !num_(b.shows) && !num_(b.clicks) && !leads) return;
        rows.push([day_(r.date), 'VK Реклама', 'VK', String(item.id), names[item.id] || String(item.id),
          num_(b.shows), num_(b.clicks), Math.round(num_(b.spent) * 100) / 100, leads]);
      });
    });
  }
  return rows;
}

/** Объекты выбранного уровня: {id: name}. */
function vkObjectNames_() {
  const names = {};
  const limit = 250;
  for (let offset = 0; ;) {
    const res = vkGet_('/' + CFG.VK_LEVEL + '.json', { fields: 'id,name', limit: limit, offset: offset });
    const items = res.items || [];
    items.forEach(it => { names[it.id] = it.name; });
    offset += items.length;
    if (!items.length || offset >= (res.count || 0)) break;
  }
  return names;
}

function vkGet_(path, params, isRetry) {
  const resp = http_(CFG.VK_API + path + qs_(params), {
    headers: { Authorization: 'Bearer ' + vkAccessToken_() },
  });
  const code = resp.getResponseCode();
  const props = PropertiesService.getScriptProperties();
  if (code === 401 && props.getProperty('VK_MANUAL_TOKEN')) {
    throw new Error('Токен VK недействителен или истёк. Введите новый: «Дашборд → Ключи доступа → VK Реклама: токен на 24 ч».');
  }
  if (code === 401 && !isRetry) {
    props.deleteProperty('VK_ACCESS_TOKEN');
    return vkGet_(path, params, true);
  }
  if (code !== 200) throw new Error('VK API ' + path + ' → ' + code + ': ' + resp.getContentText().slice(0, 500));
  return JSON.parse(resp.getContentText());
}

/** Сохраняет разовый токен из кабинета VK Реклама и сразу обновляет рекламу. */
function promptVkToken() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Токен VK Реклама', 'Вставьте токен доступа (действует 24 часа):', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const token = res.getResponseText().trim().replace(/^Bearer\s+/i, '');
  if (!token) return;
  PropertiesService.getScriptProperties().setProperties({
    VK_ACCESS_TOKEN: token,
    VK_TOKEN_EXPIRES: String(Date.now() + DAY_MS),
    VK_MANUAL_TOKEN: '1',
  });
  ensureTriggers_();
  menuAds();
}

function vkAccessToken_() {
  const props = PropertiesService.getScriptProperties();
  const clientId = props.getProperty('VK_CLIENT_ID');
  const clientSecret = props.getProperty('VK_CLIENT_SECRET');
  const access = props.getProperty('VK_ACCESS_TOKEN');
  const expires = Number(props.getProperty('VK_TOKEN_EXPIRES') || 0);

  if (!clientId || !clientSecret) {
    if (access && props.getProperty('VK_MANUAL_TOKEN') && Date.now() < expires) return access;
    throw new Error('Нет действующего токена VK. Введите новый: «Дашборд → Ключи доступа → VK Реклама».');
  }
  if (access && !props.getProperty('VK_MANUAL_TOKEN') && Date.now() < expires - 5 * 60 * 1000) return access;
  props.deleteProperty('VK_MANUAL_TOKEN');

  // Сначала пробуем обновить токен: у VK лимит на число выданных токенов
  const refresh = props.getProperty('VK_REFRESH_TOKEN');
  let data = null;
  if (refresh) {
    data = vkRequestToken_({ grant_type: 'refresh_token', refresh_token: refresh, client_id: clientId, client_secret: clientSecret }, true);
  }
  if (!data) {
    const agencyClient = props.getProperty('VK_AGENCY_CLIENT_NAME');
    data = vkRequestToken_(agencyClient
      ? { grant_type: 'agency_client_credentials', agency_client_name: agencyClient, client_id: clientId, client_secret: clientSecret }
      : { grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }, false);
  }
  props.setProperties({
    VK_ACCESS_TOKEN: data.access_token,
    VK_REFRESH_TOKEN: data.refresh_token || refresh || '',
    VK_TOKEN_EXPIRES: String(Date.now() + Number(data.expires_in || 86400) * 1000),
  });
  return data.access_token;
}

function vkRequestToken_(payload, allowFail) {
  const resp = http_(CFG.VK_API + '/oauth2/token.json', { method: 'post', payload: payload });
  if (resp.getResponseCode() === 200) return JSON.parse(resp.getContentText());
  if (allowFail) return null;
  throw new Error('Не удалось получить токен VK: ' + resp.getContentText() +
    '\nЕсли ошибка про лимит токенов — запустите deleteAllVkTokens и повторите.');
}

/** Удаляет все токены этого client_id (при ошибке о превышении лимита токенов). */
function deleteAllVkTokens() {
  const props = PropertiesService.getScriptProperties();
  const resp = http_(CFG.VK_API + '/oauth2/token/delete.json', {
    method: 'post',
    payload: { client_id: props.getProperty('VK_CLIENT_ID'), client_secret: props.getProperty('VK_CLIENT_SECRET') },
  });
  ['VK_ACCESS_TOKEN', 'VK_REFRESH_TOKEN', 'VK_TOKEN_EXPIRES'].forEach(k => props.deleteProperty(k));
  Logger.log('Ответ VK: ' + resp.getResponseCode() + ' ' + resp.getContentText());
}
