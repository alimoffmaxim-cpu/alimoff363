// ---------- Яндекс Директ (Reports API v5) ----------
// Сюда же попадают посевы в Макс, если они запускаются из кабинета Яндекса:
// канал «Макс» выделяется правилом по названию кампании на листе «Настройки».

function yandexConfigured_() { return !!prop_('YANDEX_TOKEN'); }

function loadYandex_(from, to, p) {
  const logins = list_(prop_('YANDEX_CLIENT_LOGINS'));
  let rows = [];
  (logins.length ? logins : ['']).forEach(login => { rows = rows.concat(yandexReport_(login, from, to, p)); });
  return rows;
}

function yandexReport_(login, from, to, p) {
  // Лиды — конверсии по целям Метрики: заданным в YANDEX_GOALS или целям из настроек кампаний
  const goals = list_(p.YANDEX_GOALS).map(Number).filter(n => n > 0);
  const params = {
    SelectionCriteria: { DateFrom: from, DateTo: to },
    FieldNames: ['Date', 'CampaignId', 'CampaignName', 'Impressions', 'Clicks', 'Cost', 'Conversions'],
    ReportName: 'dashboard ' + (login || 'main') + ' ' + from + ' ' + to + ' ' + Date.now(),
    ReportType: 'CAMPAIGN_PERFORMANCE_REPORT',
    DateRangeType: 'CUSTOM_DATE',
    Format: 'TSV',
    IncludeVAT: bool_(p.YANDEX_VAT) ? 'YES' : 'NO',
  };
  if (goals.length) { params.Goals = goals; params.AttributionModels = ['AUTO']; }
  // Тело не меняется между повторами: по ReportName Директ отдаёт уже готовый отчёт
  const body = JSON.stringify({ params: params });
  const headers = {
    Authorization: 'Bearer ' + prop_('YANDEX_TOKEN'),
    'Accept-Language': 'ru',
    processingMode: 'auto',
    returnMoneyInMicros: 'false',
    skipReportHeader: 'true',
    skipColumnHeader: 'false', // при нескольких целях колонок Conversions_… несколько
    skipReportSummary: 'true',
  };
  if (login) headers['Client-Login'] = login;

  for (let i = 0; i < 40; i++) {
    const resp = http_(CFG.YANDEX_API, {
      method: 'post', contentType: 'application/json; charset=utf-8', headers: headers, payload: body,
    });
    const code = resp.getResponseCode();
    if (code === 200) return parseYandexTsv_(resp.getContentText(), login);
    if (code === 201 || code === 202) { // отчёт формируется в фоне
      const h = resp.getAllHeaders();
      const wait = num_(h.retryIn || h.RetryIn || h.retryin) || 5;
      Utilities.sleep(Math.min(Math.max(wait, 2), 10) * 1000);
      continue;
    }
    throw new Error('Яндекс Директ ' + login + ' → ' + code + ': ' + resp.getContentText().slice(0, 500));
  }
  throw new Error('Яндекс Директ: отчёт не успел сформироваться, повторите обновление позже.');
}

/** TSV с заголовком колонок → строки raw_ads. Все колонки Conversions* складываются в лиды. */
function parseYandexTsv_(text, login) {
  const lines = text.split('\n').filter(l => l.trim());
  if (!lines.length) return [];
  const head = lines[0].split('\t');
  const at = name => head.indexOf(name);
  const conv = head.map((h, i) => (/^Conversions/.test(h) ? i : -1)).filter(i => i >= 0);
  return lines.slice(1).map(l => {
    const c = l.split('\t');
    const leads = conv.reduce((s, i) => s + num_(c[i]), 0);
    return [day_(c[at('Date')]), 'Яндекс Директ', login || 'основной', c[at('CampaignId')], c[at('CampaignName')],
      num_(c[at('Impressions')]), num_(c[at('Clicks')]), num_(c[at('Cost')]), leads];
  }).filter(r => r[0]);
}

// ---------- Авито ----------
// Расход берётся из истории операций кошелька: операции, в типе которых есть слова из
// параметра AVITO_SPEND. Проверьте их функцией «Отладка → Операции Авито за 7 дней».

function avitoConfigured_() { return !!(prop_('AVITO_CLIENT_ID') && prop_('AVITO_CLIENT_SECRET')); }

function avitoToken_() {
  const props = PropertiesService.getScriptProperties();
  const t = props.getProperty('AVITO_TOKEN');
  if (t && Date.now() < Number(props.getProperty('AVITO_TOKEN_EXPIRES') || 0) - 60000) return t;
  const resp = http_(CFG.AVITO_API + '/token', {
    method: 'post',
    payload: { grant_type: 'client_credentials', client_id: prop_('AVITO_CLIENT_ID'), client_secret: prop_('AVITO_CLIENT_SECRET') },
  });
  if (resp.getResponseCode() !== 200) throw new Error('Авито: не удалось получить токен: ' + resp.getContentText().slice(0, 300));
  const data = JSON.parse(resp.getContentText());
  if (!data.access_token) throw new Error('Авито: не удалось получить токен: ' + resp.getContentText().slice(0, 300));
  props.setProperties({
    AVITO_TOKEN: data.access_token,
    AVITO_TOKEN_EXPIRES: String(Date.now() + Number(data.expires_in || 3600) * 1000),
  });
  return data.access_token;
}

function avitoFetch_(method, path, body) {
  const opts = { method: method, headers: { Authorization: 'Bearer ' + avitoToken_() } };
  if (body) { opts.contentType = 'application/json'; opts.payload = JSON.stringify(body); }
  const resp = http_(CFG.AVITO_API + path, opts);
  if (resp.getResponseCode() !== 200) {
    throw new Error('Авито ' + path + ' → ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 500));
  }
  return JSON.parse(resp.getContentText());
}

/** Операции кошелька за период (запросы по 7 дней). */
function avitoOperations_(from, to) {
  let ops = [];
  chunks_(from, to, 7).forEach(c => {
    const res = avitoFetch_('post', '/core/v1/accounts/operations_history/', {
      dateTimeFrom: c[0] + 'T00:00:00', dateTimeTo: c[1] + 'T23:59:59',
    });
    ops = ops.concat((res.result && res.result.operations) || res.operations || []);
  });
  return ops;
}

function loadAvito_(from, to, p) {
  const words = list_(p.AVITO_SPEND);
  const sums = {};
  avitoOperations_(from, to).forEach(op => {
    const kind = lc_((op.operationType || '') + ' ' + (op.operationName || ''));
    if (!words.some(w => kind.indexOf(w) >= 0)) return;
    const d = dayKey_(op.updatedAt || op.createdAt || op.date);
    if (!d) return;
    const service = String(op.serviceName || op.operationName || 'Авито');
    const k = d + '|' + service;
    const amount = op.amountTotal != null ? op.amountTotal : op.amountRub != null ? op.amountRub : op.amount;
    sums[k] = (sums[k] || 0) + Math.abs(num_(amount));
  });
  return Object.keys(sums).map(k => {
    const parts = k.split('|');
    return [day_(parts[0]), 'Авито', 'Авито', parts[1], parts[1], 0, 0, Math.round(sums[k] * 100) / 100, 0];
  });
}
