// ---------- API VK Реклама и токены (свой доступ на каждый кабинет) ----------
// Основной способ: постоянный токен кабинета от eLama, вводится через меню (6_connect.gs).
// Запасной — client_id / client_secret кабинета:
// У каждого кабинета свои client_id и client_secret (ads.vk.com → Настройки → Доступ к API).
// Они вводятся через меню и хранятся в Свойствах скрипта, в коде и на листах их нет.
// Токен VK живёт 24 часа: скрипт сам продлевает его через refresh_token, а если не вышло —
// получает новый. VK разрешает не больше 5 токенов на кабинет: при переполнении старые удаляются.

const SOVA_API = 'https://ads.vk.com/api/v2';
const SOVA_DAY_MS = 24 * 3600 * 1000;

function sovaApiGet_(cab, path, params, isRetry) {
  const qs = Object.keys(params || {})
    .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
    .join('&');
  const resp = UrlFetchApp.fetch(SOVA_API + path + (qs ? '?' + qs : ''), {
    headers: { Authorization: 'Bearer ' + sovaToken_(cab) },
    muteHttpExceptions: true,
  });
  const code = resp.getResponseCode();
  if (code === 401) {
    PropertiesService.getScriptProperties().deleteProperty(sovaProp_('TOKEN', cab));
    if (sovaCreds_(cab) && !isRetry) return sovaApiGet_(cab, path, params, true);
    throw new Error('токен VK недействителен или отозван — запросите новый в eLama и введите его через меню.');
  }
  if (code === 429 && !isRetry) { Utilities.sleep(2000); return sovaApiGet_(cab, path, params, true); }
  if (code !== 200) throw new Error('VK API ' + path + ' → ' + code + ': ' + sovaMask_(resp.getContentText()));
  return JSON.parse(resp.getContentText());
}

/** Имя свойства скрипта для направления: VK_TOKEN_<hash>, VK_CLIENT_ID_<hash> и т. п. */
function sovaProp_(kind, cab) {
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, cab.name, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('').slice(0, 12);
  return 'VK_' + kind + '_' + hash;
}

function sovaCreds_(cab) {
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty(sovaProp_('CLIENT_ID', cab)), secret = p.getProperty(sovaProp_('CLIENT_SECRET', cab));
  return id && secret ? { client_id: id, client_secret: secret } : null;
}

function sovaToken_(cab) {
  const p = PropertiesService.getScriptProperties();
  const access = p.getProperty(sovaProp_('TOKEN', cab));
  if (access && Date.now() < Number(p.getProperty(sovaProp_('EXPIRES', cab)) || 0) - 5 * 60 * 1000) return access;
  const creds = sovaCreds_(cab);
  if (!creds) throw new Error('кабинет не подключён: меню «🦉 Сова → Подключить кабинет VK».');
  const refresh = p.getProperty(sovaProp_('REFRESH', cab));
  let res = refresh ? sovaOauth_('/oauth2/token.json',
    { grant_type: 'refresh_token', refresh_token: refresh, client_id: creds.client_id, client_secret: creds.client_secret }) : null;
  if (!res || !res.access_token) res = sovaNewToken_(creds);
  p.setProperties({
    [sovaProp_('TOKEN', cab)]: res.access_token,
    [sovaProp_('EXPIRES', cab)]: String(Date.now() + (Number(res.expires_in) || 86400) * 1000),
    [sovaProp_('REFRESH', cab)]: res.refresh_token || refresh || '',
  });
  return res.access_token;
}

/** Новый токен по client_id/secret; при лимите в 5 токенов удаляет старые и пробует снова. */
function sovaNewToken_(creds) {
  const req = { grant_type: 'client_credentials', client_id: creds.client_id, client_secret: creds.client_secret };
  let res = sovaOauth_('/oauth2/token.json', req);
  if (!res.access_token && /limit|exceed|too many/i.test(JSON.stringify(res))) {
    sovaOauth_('/oauth2/token/delete.json', { client_id: creds.client_id, client_secret: creds.client_secret });
    res = sovaOauth_('/oauth2/token.json', req);
  }
  if (!res.access_token) throw new Error('VK не выдал токен (проверьте client_id и client_secret): ' + sovaMask_(JSON.stringify(res)));
  return res;
}

function sovaOauth_(path, form) {
  const resp = UrlFetchApp.fetch(SOVA_API + path, { method: 'post', payload: form, muteHttpExceptions: true });
  try { return JSON.parse(resp.getContentText() || '{}'); } catch (e) { return { error: resp.getContentText() }; }
}

function sovaSaveToken_(cab, token, expires) {
  const p = PropertiesService.getScriptProperties();
  p.setProperties({ [sovaProp_('TOKEN', cab)]: token, [sovaProp_('EXPIRES', cab)]: String(expires) });
  p.deleteProperty(sovaProp_('REFRESH', cab));
}

function sovaSaveCreds_(cab, clientId, secret) {
  const p = PropertiesService.getScriptProperties();
  p.setProperties({ [sovaProp_('CLIENT_ID', cab)]: clientId, [sovaProp_('CLIENT_SECRET', cab)]: secret });
  ['TOKEN', 'EXPIRES', 'REFRESH'].forEach(function (k) { p.deleteProperty(sovaProp_(k, cab)); });
}

/** Скрывает длинные строки (токены, секреты), чтобы они не попадали в сообщения об ошибках. */
function sovaMask_(text) {
  return String(text).slice(0, 500).replace(/[A-Za-z0-9_\-.]{20,}/g, '***');
}

function sovaNum_(v) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}
