// ---------- амоCRM (API v4, долгосрочный токен) ----------

function amoConfigured_() { return !!(prop_('AMO_DOMAIN') && prop_('AMO_TOKEN')); }

function amoGet_(path, params) {
  const domain = prop_('AMO_DOMAIN').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const resp = http_('https://' + domain + path + qs_(params), {
    headers: { Authorization: 'Bearer ' + prop_('AMO_TOKEN') },
  });
  const code = resp.getResponseCode();
  Utilities.sleep(150); // лимит амо — 7 запросов в секунду
  if (code === 204) return {};
  if (code === 401) throw new Error('амоCRM: токен недействителен. Обновите: «Дашборд → Ключи доступа → амоCRM».');
  if (code !== 200) throw new Error('амоCRM ' + path + ' → ' + code + ': ' + resp.getContentText().slice(0, 500));
  return JSON.parse(resp.getContentText());
}

/** Сделки, изменённые за период перезагрузки, → лист raw_amo (обновление по ID сделки). */
function updateAmo() {
  if (!amoConfigured_()) return 'не подключено';
  const p = params_();
  const w = window_(hasRows_(SHEETS.amo), p);
  const since = Math.floor(day_(w.from).getTime() / 1000);
  const pipes = amoPipelines_();

  let leads = [];
  for (let page = 1; ; page++) {
    const res = amoGet_('/api/v4/leads', { limit: 250, page: page, with: 'contacts', 'filter[updated_at][from]': since });
    const items = (res._embedded || {}).leads || [];
    leads = leads.concat(items);
    if (items.length < 250 || !(res._links && res._links.next)) break;
  }

  const contactIds = {};
  leads.forEach(l => { const c = mainContact_(l); if (c) contactIds[c.id] = true; });
  const phones = amoPhones_(Object.keys(contactIds));

  const rows = leads.map(l => amoRow_(l, pipes, phones, p));
  mergeRows_(SHEETS.amo, HEAD.amo, rows, r => String(r[0]), null, 1);
  return rows.length + ' сделок изменено с ' + w.from;
}

function mainContact_(lead) {
  const cs = (lead._embedded || {}).contacts || [];
  return cs.filter(c => c.is_main)[0] || cs[0] || null;
}

/** {id воронки: {name, statuses: {id статуса: name}}} */
function amoPipelines_() {
  const out = {};
  ((amoGet_('/api/v4/leads/pipelines')._embedded || {}).pipelines || []).forEach(pl => {
    const st = {};
    ((pl._embedded || {}).statuses || []).forEach(s => { st[s.id] = s.name; });
    out[pl.id] = { name: pl.name, statuses: st };
  });
  return out;
}

/** {id контакта: телефон 7XXXXXXXXXX} */
function amoPhones_(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const res = amoGet_('/api/v4/contacts', { limit: 250, 'filter[id][]': ids.slice(i, i + 50) });
    ((res._embedded || {}).contacts || []).forEach(c => {
      (c.custom_fields_values || []).forEach(f => {
        if (f.field_code !== 'PHONE' || out[c.id]) return;
        (f.values || []).some(v => (out[c.id] = normalizePhone_(v.value)));
      });
    });
  }
  return out;
}

/** Значения полей сделки по названию и коду поля (в нижнем регистре). */
function amoFields_(lead) {
  const cf = {};
  (lead.custom_fields_values || []).forEach(f => {
    const v = (f.values || []).map(x => x.value).join(', ');
    if (f.field_code) cf[lc_(f.field_code)] = v;
    if (f.field_name) cf[lc_(f.field_name)] = v;
  });
  return cf;
}

function amoRow_(l, pipes, phones, p) {
  const cf = amoFields_(l);
  const utm = k => cf['utm_' + k] || cf['utm ' + k] || '';
  const pipe = pipes[l.pipeline_id] || { name: String(l.pipeline_id), statuses: {} };
  const tags = ((l._embedded || {}).tags || []).map(t => t.name).join(', ');
  const c = mainContact_(l);
  return [
    l.id, day_(new Date(l.created_at * 1000)), pipe.name, pipe.statuses[l.status_id] || String(l.status_id),
    l.name || '', num_(l.price),
    utm('source'), utm('medium'), utm('campaign'), utm('content'), utm('term'),
    cf[lc_(p.AMO_SOURCE_FIELD)] || '', tags, c ? phones[c.id] || '' : '',
  ];
}
