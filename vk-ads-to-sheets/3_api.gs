// ---------- API и токены ----------

function apiGet_(path, params, isRetry) {
  const qs = Object.keys(params || {})
    .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
    .join('&');
  const resp = UrlFetchApp.fetch(API_BASE + path + (qs ? '?' + qs : ''), {
    headers: { Authorization: 'Bearer ' + getAccessToken_() },
    muteHttpExceptions: true,
  });
  const code = resp.getResponseCode();
  if (code === 401 && PropertiesService.getScriptProperties().getProperty('VK_MANUAL_TOKEN')) {
    throw new Error('Токен VK недействителен или истёк. Введите новый: меню «VK Реклама → Ввести токен VK».');
  }
  if (code === 401 && !isRetry) {
    PropertiesService.getScriptProperties().deleteProperty('VK_ACCESS_TOKEN');
    return apiGet_(path, params, true);
  }
  if (code !== 200) throw new Error('VK API ' + path + ' → ' + code + ': ' + resp.getContentText());
  return JSON.parse(resp.getContentText());
}

function getAccessToken_() {
  const props = PropertiesService.getScriptProperties();
  const clientId = props.getProperty('VK_CLIENT_ID');
  const clientSecret = props.getProperty('VK_CLIENT_SECRET');
  const access = props.getProperty('VK_ACCESS_TOKEN');
  const expires = Number(props.getProperty('VK_TOKEN_EXPIRES') || 0);

  if (!clientId || !clientSecret) {
    // Ручной режим: используем введённый токен, пока он не истёк
    if (access && props.getProperty('VK_MANUAL_TOKEN') && Date.now() < expires) return access;
    throw new Error('Нет действующего токена VK. Введите новый: меню «VK Реклама → Ввести токен VK».');
  }
  if (access && !props.getProperty('VK_MANUAL_TOKEN') && Date.now() < expires - 5 * 60 * 1000) return access;
  props.deleteProperty('VK_MANUAL_TOKEN');

  // Сначала пробуем обновить существующий токен: у VK лимит на число выданных токенов
  const refresh = props.getProperty('VK_REFRESH_TOKEN');
  let data = null;
  if (refresh) {
    data = requestToken_({ grant_type: 'refresh_token', refresh_token: refresh, client_id: clientId, client_secret: clientSecret }, true);
  }
  if (!data) {
    const agencyClient = props.getProperty('VK_AGENCY_CLIENT_NAME');
    data = requestToken_(agencyClient
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

function requestToken_(payload, allowFail) {
  const resp = UrlFetchApp.fetch(API_BASE + '/oauth2/token.json', {
    method: 'post',
    payload: payload,
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() === 200) return JSON.parse(resp.getContentText());
  if (allowFail) return null;
  throw new Error('Не удалось получить токен VK: ' + resp.getContentText() +
    '\nЕсли ошибка про лимит токенов — запустите deleteAllVkTokens и повторите.');
}

/** Удаляет все токены этого client_id (на случай ошибки о превышении лимита токенов). */
function deleteAllVkTokens() {
  const props = PropertiesService.getScriptProperties();
  const resp = UrlFetchApp.fetch(API_BASE + '/oauth2/token/delete.json', {
    method: 'post',
    payload: { client_id: props.getProperty('VK_CLIENT_ID'), client_secret: props.getProperty('VK_CLIENT_SECRET') },
    muteHttpExceptions: true,
  });
  ['VK_ACCESS_TOKEN', 'VK_REFRESH_TOKEN', 'VK_TOKEN_EXPIRES'].forEach(function (k) { props.deleteProperty(k); });
  Logger.log('Ответ VK: ' + resp.getResponseCode() + ' ' + resp.getContentText());
}

function num_(v) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}
