// ---------- Яндекс Директ: статистика по объявлениям (Reports API v5) и тексты объявлений ----------
// Токен — OAuth-токен приложения с доступом к API Директа, выданный на логин клиента.
// «Данные Директа»: 1 строка = 1 день одного объявления (Директ отдаёт только строки с показами или кликами).

const DR_API = 'https://api.direct.yandex.com/json/v5/';
const DR_DATA_HEAD = ['Дата', 'ID кампании', 'Кампания', 'ID группы', 'Группа', 'ID объявления', 'Показы', 'Клики', 'Расход'];
const DR_TEXT_HEAD = ['ID объявления', 'ID группы', 'ID кампании', 'Тип', 'Заголовок', 'Заголовок 2', 'Текст', 'Ссылка', 'Статус'];

function drPromptDirect() {
  const ui = SpreadsheetApp.getUi(), p = PropertiesService.getScriptProperties();
  const a = ui.prompt('Яндекс Директ', 'OAuth-токен с доступом к API Директа (длинная строка, обычно начинается с y0_):', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK || !a.getResponseText().trim()) return;
  const token = a.getResponseText().trim().replace(/^["'«]|["'»]$/g, '').replace(/^(Bearer|OAuth)\s+/i, '');
  const bad = drTokenProblem_(token);
  if (bad && ui.alert('Похоже, это не OAuth-токен', bad + '\n\nВсё равно сохранить?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  p.setProperty('YANDEX_TOKEN', token);
  const b = ui.prompt('Яндекс Директ', 'Логин кабинета клиента в Директе — если токен выдан другому логину ' +
    '(агентство или аккаунт с доступом к нескольким кабинетам). Если токен выдан самому клиенту — оставьте пустым:', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() === ui.Button.OK) p.setProperty('YANDEX_LOGIN', b.getResponseText().trim());
  drAlert_(function () {
    const n = drDirectCampaigns_().length;
    return 'Директ подключён' + (drProp_('YANDEX_LOGIN') ? ' (кабинет ' + drProp_('YANDEX_LOGIN') + ')' : '') + ', кампаний: ' + n +
      '.\nДальше: Отчёт → Загрузить данные из Директа.';
  });
}

/** Частые ошибки при вставке токена; '' — похоже на токен. */
function drTokenProblem_(t) {
  if (/^[0-9a-f]{32}$/i.test(t)) return 'это ClientID или секрет приложения (32 символа 0–9, a–f). Токен получают по ссылке ' +
    'https://oauth.yandex.ru/authorize?response_type=token&client_id=<ClientID> под нужным логином.';
  if (/\s/.test(t)) return 'в строке есть пробелы или переносы — скопируйте токен заново, целиком.';
  if (t.length < 30) return 'слишком короткая строка (' + t.length + ' символов) — скопируйте токен целиком.';
  return '';
}

/** Догружает «Данные Директа»: с последней даты − REFRESH_DAYS (или INITIAL_DAYS) по вчера. Возвращает число строк. */
function drLoadDirect_() {
  if (!drProp_('YANDEX_TOKEN')) throw new Error('нет токена Директа: Отчёт → Токен Яндекс Директа.');
  const to = drYesterday_(), sh = drSheet_(DR_SHEETS.DATA, DR_DATA_HEAD);
  const old = drRows_(DR_SHEETS.DATA, DR_DATA_HEAD.length).filter(function (r) { return drKey_(r[0]); });
  const last = old.map(function (r) { return drKey_(r[0]); }).sort().pop();
  const from = last ? drAddDays_(last < to ? last : to, 1 - DR.REFRESH_DAYS) : drAddDays_(to, 1 - DR.INITIAL_DAYS);
  const fresh = drReport_(from, to);
  const rows = old.filter(function (r) { const k = drKey_(r[0]); return k < from; })   // период перезагрузки — заново
    .concat(fresh).sort(function (a, b) { return drKey_(a[0]) < drKey_(b[0]) ? -1 : drKey_(a[0]) > drKey_(b[0]) ? 1 : 0; });
  drClearFrom_(sh, 2, DR_DATA_HEAD.length);
  drWrite_(sh, 2, rows, ['dd.MM.yyyy', '0', null, '0', null, '0', '#,##0', '#,##0', '#,##0.00']);
  drLoadTexts_(rows);
  return fresh.length;
}

/** Отчёт AD_PERFORMANCE_REPORT за [from; to] → строки «Данных Директа». */
function drReport_(from, to) {
  const body = JSON.stringify({ params: {
    SelectionCriteria: { DateFrom: from, DateTo: to },
    FieldNames: ['Date', 'CampaignId', 'CampaignName', 'AdGroupId', 'AdGroupName', 'AdId', 'Impressions', 'Clicks', 'Cost'],
    ReportName: 'direct-tilda ' + from + ' ' + to + ' ' + Date.now(),
    ReportType: 'AD_PERFORMANCE_REPORT', DateRangeType: 'CUSTOM_DATE', Format: 'TSV', IncludeVAT: 'NO',
  } });
  const headers = drHeaders_({ processingMode: 'auto', returnMoneyInMicros: 'false', skipReportHeader: 'true',
    skipColumnHeader: 'false', skipReportSummary: 'true' });
  for (let i = 0; i < 60; i++) {
    const resp = UrlFetchApp.fetch(DR_API + 'reports', { method: 'post', contentType: 'application/json; charset=utf-8',
      headers: headers, payload: body, muteHttpExceptions: true });
    const code = resp.getResponseCode();
    if (code === 200) return drParseTsv_(resp.getContentText());
    if (code !== 201 && code !== 202) throw new Error('Директ, отчёт → ' + code + ': ' + drApiError_(resp.getContentText()));
    const h = resp.getAllHeaders();
    Utilities.sleep(Math.min(Math.max(drNum_(h.retryIn || h.RetryIn || h.retryin) || 5, 2), 10) * 1000);   // отчёт готовится
  }
  throw new Error('Директ: отчёт не успел сформироваться, повторите позже.');
}

function drParseTsv_(text) {
  const lines = text.split('\n').filter(function (l) { return l.trim(); });
  if (lines.length < 2) return [];
  const head = lines[0].split('\t'), at = function (n) { return head.indexOf(n); };
  return lines.slice(1).map(function (l) {
    const c = l.split('\t'), id = function (n) { return /^\d+$/.test(c[at(n)]) ? +c[at(n)] : ''; };   // «--» — нет ID
    return [drDate_(c[at('Date')]), id('CampaignId'), c[at('CampaignName')], id('AdGroupId'), c[at('AdGroupName')],
      id('AdId'), drNum_(c[at('Impressions')]), drNum_(c[at('Clicks')]), drNum_(c[at('Cost')])];
  }).filter(function (r) { return /^\d{4}-/.test(drKey_(r[0])); });
}

function drHeaders_(extra) {
  const h = Object.assign({ Authorization: 'Bearer ' + drProp_('YANDEX_TOKEN'), 'Accept-Language': 'ru' }, extra || {});
  if (drProp_('YANDEX_LOGIN')) h['Client-Login'] = drProp_('YANDEX_LOGIN');
  return h;
}

/** Вызов JSON API v5 (campaigns, ads …) → result. */
function drCall_(service, method, params) {
  const resp = UrlFetchApp.fetch(DR_API + service, { method: 'post', contentType: 'application/json; charset=utf-8',
    headers: drHeaders_(), payload: JSON.stringify({ method: method, params: params }), muteHttpExceptions: true });
  const data = JSON.parse(resp.getContentText() || '{}');
  if (data.error && +data.error.error_code === 53) throw new Error('Директ не принял токен (недействительный OAuth-токен). ' +
    'Проверьте, что вставлен сам токен (не ClientID), целиком, что он выдан приложению с доступом к API Директа и не отозван. ' +
    'Ввести заново: Отчёт → Токен Яндекс Директа.');
  if (resp.getResponseCode() !== 200 || data.error) throw new Error('Директ, ' + service + ' → ' + drApiError_(resp.getContentText()));
  return data.result || {};
}

function drApiError_(text) {
  try { const e = JSON.parse(text).error; return e.error_string + (e.error_detail ? ': ' + e.error_detail : ''); }
  catch (x) { return String(text).slice(0, 300); }
}

function drDirectCampaigns_() {
  return drCall_('campaigns', 'get', { SelectionCriteria: {}, FieldNames: ['Id', 'Name'] }).Campaigns || [];
}

/** Тексты и ссылки объявлений всех кампаний из данных → лист «Тексты объявлений» (по 10 кампаний за запрос). */
function drLoadTexts_(rows) {
  const camps = Object.keys(rows.reduce(function (o, r) { if (r[1]) o[r[1]] = 1; return o; }, {})).map(Number);
  const out = [];
  for (let i = 0; i < camps.length; i += 10) {
    for (let offset = 0; ; ) {
      const res = drCall_('ads', 'get', { SelectionCriteria: { CampaignIds: camps.slice(i, i + 10) },
        FieldNames: ['Id', 'AdGroupId', 'CampaignId', 'Type', 'State'], TextAdFieldNames: ['Title', 'Title2', 'Text', 'Href'],
        Page: { Limit: 10000, Offset: offset } });
      (res.Ads || []).forEach(function (a) {
        const t = a.TextAd || {};
        out.push([a.Id, a.AdGroupId, a.CampaignId, a.Type, t.Title || '', t.Title2 || '', t.Text || '', t.Href || '', a.State || '']);
      });
      if (!res.LimitedBy) break;
      offset = res.LimitedBy;
    }
  }
  const sh = drSheet_(DR_SHEETS.TEXTS, DR_TEXT_HEAD);
  drClearFrom_(sh, 2, DR_TEXT_HEAD.length);
  drWrite_(sh, 2, out, ['0', '0', '0']);
}
