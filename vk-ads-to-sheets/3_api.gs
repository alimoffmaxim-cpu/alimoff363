// ---------- API и токены ----------
// Токен VK живёт 24 часа. Если в Свойствах скрипта заданы VITAMIN_API_KEY и
// VITAMIN_ACCOUNT_ID, скрипт сам получает новый токен через Vitamin.Tools.
// Иначе используется токен, введённый вручную через меню.

const VITAMIN_TOKEN_URL = 'https://app.vitamin.tools/ext/api/v1/external_account/account/get-token-list-by-clients';

function apiGet_(path, params, isRetry) {
  const qs = Object.keys(params || {})
    .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
    .join('&');
  const resp = UrlFetchApp.fetch(API_BASE + path + (qs ? '?' + qs : ''), {
    headers: { Authorization: 'Bearer ' + getAccessToken_() },
    muteHttpExceptions: true,
  });
  const code = resp.getResponseCode();
  if (code === 401) {
    const props = PropertiesService.getScriptProperties();
    props.deleteProperty('VK_ACCESS_TOKEN');
    if (props.getProperty('VITAMIN_API_KEY') && !isRetry) return apiGet_(path, params, true);
    throw new Error('Токен VK недействителен или истёк. Введите новый: меню «VK Реклама → Ввести токен VK».');
  }
  if (code !== 200) throw new Error('VK API ' + path + ' → ' + code + ': ' + resp.getContentText());
  return JSON.parse(resp.getContentText());
}

function getAccessToken_() {
  const props = PropertiesService.getScriptProperties();
  const access = props.getProperty('VK_ACCESS_TOKEN');
  const expires = Number(props.getProperty('VK_TOKEN_EXPIRES') || 0);
  if (access && Date.now() < expires - 5 * 60 * 1000) return access;

  if (!props.getProperty('VITAMIN_API_KEY')) {
    throw new Error('Нет действующего токена VK. Введите новый: меню «VK Реклама → Ввести токен VK» ' +
      'или задайте VITAMIN_API_KEY и VITAMIN_ACCOUNT_ID в Свойствах скрипта.');
  }
  const token = fetchVitaminToken_();
  props.setProperties({
    VK_ACCESS_TOKEN: token,
    VK_TOKEN_EXPIRES: String(Date.now() + 23 * 3600 * 1000), // с запасом от 24 часов
  });
  props.deleteProperty('VK_MANUAL_TOKEN');
  return token;
}

/** Запрашивает свежий токен VK Рекламы для кабинета VITAMIN_ACCOUNT_ID. */
function fetchVitaminToken_() {
  const props = PropertiesService.getScriptProperties();
  const accountId = String(props.getProperty('VITAMIN_ACCOUNT_ID') || '').trim();
  if (!accountId) throw new Error('Задайте VITAMIN_ACCOUNT_ID (ID кабинета в Vitamin.Tools) в Свойствах скрипта.');

  const resp = UrlFetchApp.fetch(VITAMIN_TOKEN_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-API-KEY': props.getProperty('VITAMIN_API_KEY').trim() },
    payload: JSON.stringify({ id: [Number(accountId)] }),
    muteHttpExceptions: true,
  });
  const text = resp.getContentText();
  if (resp.getResponseCode() !== 200) {
    throw new Error('Vitamin.Tools → ' + resp.getResponseCode() + ': ' + maskSecrets_(text));
  }
  const token = (JSON.parse(text).data || {})[accountId] || findToken_(JSON.parse(text));
  if (!token) throw new Error('Не нашёл токен в ответе Vitamin.Tools: ' + maskSecrets_(text));
  return token;
}

/** Ищет в ответе первое строковое поле с «token» в названии (кроме refresh). */
function findToken_(obj) {
  if (obj === null || typeof obj !== 'object') return null;
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const v = obj[keys[i]];
    if (typeof v === 'string' && /token/i.test(keys[i]) && !/refresh/i.test(keys[i]) && v.length >= 20) return v;
  }
  for (let i = 0; i < keys.length; i++) {
    const found = findToken_(obj[keys[i]]);
    if (found) return found;
  }
  return null;
}

/** Скрывает длинные строки (токены), чтобы они не попадали в журналы и письма об ошибках. */
function maskSecrets_(text) {
  return String(text).slice(0, 1000).replace(/[A-Za-z0-9_\-.]{20,}/g, '***');
}

function num_(v) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}
