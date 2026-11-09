// ---------- Яндекс Метрика: цели из амоCRM (офлайн-конверсии) ----------
// Когда сделка переходит на этап «Записан на пробное» или «Посетил пробное», в Метрику
// отправляется цель trial_booked / trial_visited. Посетителя сайта Метрика узнаёт по ClientID
// (кука _ym_uid) или по yclid — их берём из заявки Тильды с тем же телефоном.
// Ключи (токен и номер счётчика) — «Дашборд → Ключи доступа → Яндекс Метрика».

function metrikaConfigured_() { return !!(prop_('METRIKA_TOKEN') && prop_('METRIKA_COUNTER')); }

function jobMetrika() { return runJob_('Метрика', sendMetrikaGoals_, true); }
function menuMetrika() { alert_(runJob_('Метрика', sendMetrikaGoals_)); }

function promptMetrikaKeys() {
  if (!promptProps_('Яндекс Метрика', [
    ['METRIKA_COUNTER', 'Номер счётчика Метрики (цифры из адреса metrika.yandex.ru/dashboard?id=…):'],
    ['METRIKA_TOKEN', 'OAuth-токен Яндекса с доступом «Яндекс Метрика: запись»:'],
  ])) return;
  debugMetrika();
}

/** Этапы амо для целей: {id этапа: 'trial_booked' | 'trial_visited'} — по названию во всех воронках. */
function metrikaStatusGoals_(pipes, p) {
  const out = {};
  METRIKA_GOALS.forEach(g => {
    const name = lc_(p[g[1]]);
    if (!name) return;
    Object.keys(pipes).forEach(pl => Object.keys(pipes[pl].statuses).forEach(id => {
      if (lc_(pipes[pl].statuses[id]) === name) out[id] = g[0];
    }));
  });
  return out;
}

/** Смена этапа сделок с момента since (сек): [{lead, goal, time}] для этапов из statusGoals. */
function metrikaEvents_(since, statusGoals) {
  const out = [];
  for (let page = 1; ; page++) {
    const res = amoGet_('/api/v4/events', {
      'filter[type]': 'lead_status_changed', 'filter[created_at][from]': since, limit: 100, page: page,
    });
    const items = (res._embedded || {}).events || [];
    items.forEach(ev => {
      const st = ((ev.value_after || [])[0] || {}).lead_status || {};
      const goal = statusGoals[st.id];
      if (goal) out.push({ lead: ev.entity_id, goal: goal, time: ev.created_at });
    });
    if (items.length < 100 || !(res._links && res._links.next)) break;
  }
  return out;
}

/**
 * Идентификатор посетителя для события: ClientID или yclid из заявки Тильды с тем же телефоном
 * (последняя заявка до события, не старше 21 дня), иначе yclid из названия сделки.
 */
function metrikaVisitor_(phone, time, tildaByPhone, dealName) {
  const minTime = (time - METRIKA_MAX_DAYS * 86400) * 1000;
  const rows = (tildaByPhone[phone] || [])
    .filter(t => { const ms = tildaTime_(t['Получена']); return ms >= minTime && ms <= time * 1000 + 3600 * 1000; })
    .sort((a, b) => tildaTime_(b['Получена']) - tildaTime_(a['Получена']));
  // ClientID — из своей колонки или из «Все поля» (заявки, принятые старой версией веб-приложения)
  const cid = t => String(t['ClientID Метрики'] || '').trim() ||
    clickId_(decodeSafe_(t['Все поля'] || ''), 'ym_client_id').replace(/\D/g, '');
  const withId = rows.filter(cid)[0];
  if (withId) return { clientId: cid(withId), yclid: '' };
  for (let i = 0; i < rows.length; i++) {
    const y = String(rows[i]['yclid'] || '').trim() ||
      clickId_(String(rows[i]['Страница'] || '') + ' ' + decodeSafe_(rows[i]['Все поля'] || ''), 'yclid');
    if (y) return { clientId: '', yclid: y };
  }
  return { clientId: '', yclid: clickId_(dealName, 'yclid') };
}

/** CSV офлайн-конверсий: колонка идентификатора, цель, время (unix). */
function metrikaCsv_(idHead, items) {
  return [idHead + ',Target,DateTime'].concat(items.map(x => [x.id, x.goal, x.time].join(','))).join('\n');
}

function metrikaUpload_(type, csv) {
  const resp = http_(CFG.METRIKA_API + '/counter/' + prop_('METRIKA_COUNTER') +
    '/offline_conversions/upload?client_id_type=' + type, {
    method: 'post',
    headers: { Authorization: 'OAuth ' + prop_('METRIKA_TOKEN') },
    payload: { file: Utilities.newBlob(csv, 'text/csv', 'conversions.csv') },
  });
  const code = resp.getResponseCode();
  if (code === 401 || code === 403) throw new Error('Метрика: нет доступа (' + code + '). Проверьте токен (право «Яндекс Метрика: запись») и номер счётчика.');
  if (code !== 200) throw new Error('Метрика ' + type + ' → ' + code + ': ' + resp.getContentText().slice(0, 500));
  const up = JSON.parse(resp.getContentText()).uploading || {};
  return 'загружено в Метрику' + (up.id ? ' (загрузка ' + up.id + ')' : '');
}

/** Отправляет в Метрику новые переходы сделок на этапы пробного. Пишет журнал «Метрика_цели». */
function sendMetrikaGoals_() {
  if (!metrikaConfigured_()) return 'не подключено (Ключи доступа → Яндекс Метрика)';
  if (!amoConfigured_()) return 'амоCRM не подключена';
  const p = params_();
  const props = PropertiesService.getScriptProperties();
  const now = Math.floor(Date.now() / 1000);
  const since = Number(props.getProperty('METRIKA_SINCE') || 0) || now - METRIKA_MAX_DAYS * 86400;

  const statusGoals = metrikaStatusGoals_(amoPipelines_(), p);
  if (!Object.keys(statusGoals).length) {
    throw new Error('В амо не найдены этапы «' + p.METRIKA_STATUS_BOOKED + '» и «' + p.METRIKA_STATUS_VISITED +
      '». Проверьте названия на листе «Настройки» (METRIKA_STATUS_…).');
  }
  // Перекрытие в час: повторы отсекает журнал
  const sent = {};
  readObjects_(SHEETS.metrika).forEach(r => { sent[r['ID сделки'] + '|' + r['Цель']] = true; });
  const events = metrikaEvents_(since - 3600, statusGoals)
    .filter((e, i, a) => !sent[e.lead + '|' + e.goal] && a.findIndex(x => x.lead === e.lead && x.goal === e.goal) === i);
  if (!events.length) { props.setProperty('METRIKA_SINCE', String(now)); return 'новых переходов на этапы пробного нет'; }

  // Телефоны и названия сделок
  const leads = {};
  const ids = events.map(e => e.lead).filter((x, i, a) => a.indexOf(x) === i);
  for (let i = 0; i < ids.length; i += 50) {
    const res = amoGet_('/api/v4/leads', { with: 'contacts', limit: 250, 'filter[id][]': ids.slice(i, i + 50) });
    ((res._embedded || {}).leads || []).forEach(l => { leads[l.id] = l; });
  }
  const contactIds = {};
  Object.keys(leads).forEach(id => { const c = mainContact_(leads[id]); if (c) contactIds[c.id] = true; });
  const phones = amoPhones_(Object.keys(contactIds));
  const tildaByPhone = {};
  readObjects_(SHEETS.tilda).forEach(t => {
    const ph = normalizePhone_(t['Телефон']);
    if (ph) (tildaByPhone[ph] = tildaByPhone[ph] || []).push(t);
  });

  const byClient = [], byYclid = [], log = [];
  events.forEach(e => {
    const l = leads[e.lead] || {};
    const c = mainContact_(l);
    const phone = c ? phones[c.id] || '' : '';
    const v = metrikaVisitor_(phone, e.time, tildaByPhone, String(l.name || ''));
    const row = [new Date(e.time * 1000), e.lead, e.goal, phone, v.clientId, v.yclid, new Date(), ''];
    if (v.clientId) byClient.push({ id: v.clientId, goal: e.goal, time: e.time, row: row });
    else if (v.yclid) byYclid.push({ id: v.yclid, goal: e.goal, time: e.time, row: row });
    else { row[7] = 'нет ClientID и yclid (заявки Тильды с этим телефоном нет)'; log.push(row); }
  });
  if (byClient.length) {
    const r = metrikaUpload_('CLIENT_ID', metrikaCsv_('ClientId', byClient));
    byClient.forEach(x => { x.row[7] = r; log.push(x.row); });
  }
  if (byYclid.length) {
    const r = metrikaUpload_('YCLID', metrikaCsv_('Yclid', byYclid));
    byYclid.forEach(x => { x.row[7] = r; log.push(x.row); });
  }
  const sh = sheet_(SHEETS.metrika, HEAD.metrika);
  sh.getRange(sh.getLastRow() + 1, 1, log.length, HEAD.metrika.length).setValues(log);
  props.setProperty('METRIKA_SINCE', String(now));

  const count = g => byClient.concat(byYclid).filter(x => x.goal === g).length;
  return 'отправлено целей: ' + (byClient.length + byYclid.length) +
    ' (trial_booked — ' + count('trial_booked') + ', trial_visited — ' + count('trial_visited') + ')' +
    (log.length > byClient.length + byYclid.length ? '; без ClientID/yclid: ' + (log.length - byClient.length - byYclid.length) : '');
}

/** Проверка настройки: этапы амо найдены, цели в счётчике созданы. */
function debugMetrika() {
  const p = params_();
  const rows = [['Проверка отправки целей в Метрику']];
  if (amoConfigured_()) {
    const pipes = amoPipelines_();
    const sg = metrikaStatusGoals_(pipes, p);
    METRIKA_GOALS.forEach(g => {
      const n = Object.keys(sg).filter(id => sg[id] === g[0]).length;
      rows.push(['Этап амо «' + p[g[1]] + '» → ' + g[0], n ? 'найден (' + n + ')' : 'НЕ НАЙДЕН — проверьте название в «Настройках»']);
    });
  } else rows.push(['амоCRM', 'не подключена']);
  if (metrikaConfigured_()) {
    const resp = http_(CFG.METRIKA_API + '/counter/' + prop_('METRIKA_COUNTER') + '/goals',
      { headers: { Authorization: 'OAuth ' + prop_('METRIKA_TOKEN') } });
    if (resp.getResponseCode() !== 200) {
      rows.push(['Метрика', 'ошибка ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 300)]);
    } else {
      const goals = JSON.parse(resp.getContentText()).goals || [];
      const ids = {};
      goals.forEach(g => (g.conditions || []).forEach(c => { ids[c.url] = g.name + ' (ID ' + g.id + ')'; }));
      METRIKA_GOALS.forEach(g => rows.push(['Цель ' + g[0] + ' в счётчике', ids[g[0]] || 'НЕТ — создайте цель «JavaScript-событие» с этим идентификатором']));
    }
  } else rows.push(['Метрика', 'не подключена: Ключи доступа → Яндекс Метрика']);
  debugOut_(rows);
}
