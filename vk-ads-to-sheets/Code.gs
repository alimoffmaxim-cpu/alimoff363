/**
 * Автоматическая выгрузка статистики VK Реклама (ads.vk.com) в Google Таблицу.
 *
 * СЕКРЕТОВ В ЭТОМ ФАЙЛЕ НЕТ И БЫТЬ НЕ ДОЛЖНО.
 * client_id и client_secret задаются в редакторе Apps Script:
 *   Настройки проекта (шестерёнка) → Свойства скрипта:
 *     VK_CLIENT_ID     — client_id из ads.vk.com → Настройки → Доступ к API
 *     VK_CLIENT_SECRET — client_secret оттуда же
 * Токены доступа скрипт получает и хранит там же сам.
 */

const CONFIG = {
  SHEET_NAME: 'VK Ads',
  // Уровень детализации: 'ad_plans' — кампании, 'campaigns' — группы объявлений, 'banners' — объявления
  LEVEL: 'campaigns',
  // Сколько последних дней перезаписывать при каждом запуске (VK досчитывает статистику задним числом)
  DAYS_BACK: 7,
  // Час запуска ежедневного триггера (по часовому поясу проекта)
  TRIGGER_HOUR: 7,
};

const API_BASE = 'https://ads.vk.com/api/v2';
const HEADERS = ['Дата', 'ID', 'Название', 'Показы', 'Клики', 'CTR, %', 'Расход, ₽', 'CPC, ₽', 'CPM, ₽', 'Результаты', 'CPA, ₽'];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('VK Реклама')
    .addItem('Обновить статистику', 'exportVkAdsStats')
    .addItem('Загрузить последние 90 дней', 'backfill90Days')
    .addItem('Включить ежедневное обновление', 'setupDailyTrigger')
    .addToUi();
}

/** Основная функция: её вызывает ежедневный триггер. */
function exportVkAdsStats() {
  exportForDays_(CONFIG.DAYS_BACK);
}

/** Разовая дозагрузка истории. */
function backfill90Days() {
  exportForDays_(90);
}

function exportForDays_(daysBack) {
  const tz = Session.getScriptTimeZone();
  const to = new Date();
  const from = new Date(to.getTime() - daysBack * 24 * 3600 * 1000);
  const dateFrom = Utilities.formatDate(from, tz, 'yyyy-MM-dd');
  const dateTo = Utilities.formatDate(to, tz, 'yyyy-MM-dd');

  const names = fetchObjectNames_();
  const ids = Object.keys(names);
  const rows = [];

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
        const shows = num_(b.shows);
        const spent = num_(b.spent);
        if (!shows && !spent) return; // пропускаем пустые дни
        rows.push([
          r.date, String(item.id), names[item.id] || '',
          shows, num_(b.clicks), num_(b.ctr), spent,
          num_(b.cpc), num_(b.cpm), num_(b.goals), num_(b.cpa),
        ]);
      });
    });
  }

  writeRows_(rows, dateFrom, dateTo);
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
  sh.getRange('A:B').setNumberFormat('@'); // дата и ID — как текст
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
  if (!clientId || !clientSecret) {
    throw new Error('Задайте VK_CLIENT_ID и VK_CLIENT_SECRET в Настройки проекта → Свойства скрипта');
  }

  const access = props.getProperty('VK_ACCESS_TOKEN');
  const expires = Number(props.getProperty('VK_TOKEN_EXPIRES') || 0);
  if (access && Date.now() < expires - 5 * 60 * 1000) return access;

  // Сначала пробуем обновить существующий токен: у VK лимит на число выданных токенов
  const refresh = props.getProperty('VK_REFRESH_TOKEN');
  let data = null;
  if (refresh) {
    data = requestToken_({ grant_type: 'refresh_token', refresh_token: refresh, client_id: clientId, client_secret: clientSecret }, true);
  }
  if (!data) {
    data = requestToken_({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }, false);
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
