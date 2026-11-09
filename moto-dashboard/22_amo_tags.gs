// ---------- амоCRM: тег источника в новых сделках ----------
// Каждые 5 минут: новые сделки без тега источника получают тег — канал рекламы
// («Яндекс Директ», «VK Реклама»…) или тип органики («Органика Яндекс», «Прямой заход»…).
// Источник ищется в полях сделки (UTM, yclid, referrer), затем в заявке Тильды с тем же телефоном.

/** Триггер раз в 5 минут. В «Лог» пишет, только если что-то проставлено или случилась ошибка. */
function jobAmoTags() {
  try {
    const r = tagAmoLeads_();
    if (r.tagged) log_('Теги амо', r.message);
  } catch (e) {
    log_('Теги амо', 'ОШИБКА: ' + e.message);
    throw e;
  }
}

function menuAmoTags() { alert_(runJob_('Теги амо', () => tagAmoLeads_().message)); }

/** Все теги, которые считаются тегами источника (в нижнем регистре). */
function sourceTagSet_(p) {
  const set = {};
  p.rules.forEach(r => { set[lc_(r.channel)] = true; });
  ['VK Реклама', 'Яндекс Директ', 'Авито', 'Google Ads', 'Facebook / Instagram']
    .concat(Object.keys(ORGANIC).map(k => ORGANIC[k]), p.AMO_UNKNOWN_TAG || [])
    .forEach(t => { if (t) set[lc_(t)] = true; });
  return set;
}

/** Тип перехода по адресу referrer: органика Яндекс / Google, соцсети, другой сайт ('' — свой сайт или пусто). */
function referrerKind_(ref, ownHost) {
  const m = String(ref || '').match(/^https?:\/\/([^\/?#:]+)/i);
  if (!m) return '';
  const host = m[1].toLowerCase().replace(/^www\./, '');
  const own = String(ownHost || '').toLowerCase().replace(/^www\./, '');
  if (own && (host === own || host.endsWith('.' + own))) return '';
  for (let i = 0; i < ORGANIC_REFERRERS.length; i++) {
    if (ORGANIC_REFERRERS[i][0].test(host)) return ORGANIC_REFERRERS[i][1];
  }
  return ORGANIC.site;
}

function hostOf_(url) {
  const m = String(url || '').match(/^https?:\/\/([^\/?#:]+)/i);
  return m ? m[1].toLowerCase().replace(/^www\./, '') : '';
}

/**
 * Тег источника для сделки или null, если пока рано решать.
 * deal: {fields: {имя/код поля → значение}, tags: [..], pipeline, ageMin}
 * tilda: строка raw_tilda с тем же телефоном (или null).
 */
function leadSourceTag_(deal, tilda, p) {
  const f = deal.fields || {};
  const utm = { utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '' };
  Object.keys(utm).forEach(k => { utm[k] = cleanUtm_(f[k] || f[k.replace('_', ' ')] || ''); });

  // 1. Метки клика и UTM в адресах из полей и названия сделки (Тильда пишет «Lead from: адрес»)
  if (!utm.utm_source) {
    const text = Object.keys(f).map(k => k + '=' + f[k]).concat('name=' + (deal.name || '')).join('; ');
    const found = clickSource_(text);
    Object.keys(utm).forEach(k => { if (!utm[k]) utm[k] = found[k]; });
  }
  // 2. Заявка Тильды с тем же телефоном
  if (!utm.utm_source && tilda) {
    Object.keys(utm).forEach(k => { if (!utm[k]) utm[k] = String(tilda[k] || ''); });
    if (!utm.utm_source) {
      const found = clickSource_(String(tilda['Страница'] || '') + ' ' + String(tilda['Все поля'] || ''));
      Object.keys(utm).forEach(k => { if (!utm[k]) utm[k] = found[k]; });
    }
  }
  // 3. Канал по правилам «Настроек» (UTM, поле «Источник», теги, воронка)
  const ch = matchRule_(p.rules, {
    utm_source: utm.utm_source, utm_medium: utm.utm_medium, utm_campaign: utm.utm_campaign,
    utm_content: utm.utm_content, utm_term: utm.utm_term, источник: f[lc_(p.AMO_SOURCE_FIELD)] || '',
    теги: (deal.tags || []).join(', '), воронка: deal.pipeline || '', 'название сделки': deal.name || '',
  });
  if (ch) return ch;
  if (utm.utm_source) return utm.utm_source;

  // 4. Без рекламных меток — органика по referrer
  const page = tilda ? String(tilda['Страница'] || '') : '';
  const allTilda = tilda ? String(tilda['Все поля'] || '') : '';
  const refMatch = allTilda.match(/(?:^|; )referrer=([^;]+)/);
  const ref = f.referrer || f.utm_referrer || (refMatch ? refMatch[1] : '');
  const kind = referrerKind_(ref, hostOf_(page) || hostOf_(f.referrer_page || ''));
  if (kind) return kind;
  // Прямой заход — только если адрес входа известен (код для сайта стоит), а внешнего referrer нет
  if (page || ref) return ORGANIC.direct;

  // 5. Ничего не нашлось: ждём заявку Тильды, потом ставим «Источник не определён»
  if ((deal.ageMin || 0) < AMO_TAG_WAIT_MIN) return null;
  return p.AMO_UNKNOWN_TAG ? String(p.AMO_UNKNOWN_TAG) : null;
}

/** Проставляет теги новым сделкам. Возвращает {tagged, message}. */
function tagAmoLeads_() {
  if (!amoConfigured_()) return { tagged: 0, message: 'амоCRM не подключена' };
  const p = params_();
  if (!bool_(p.AMO_TAGGING)) return { tagged: 0, message: 'выключено (параметр AMO_TAGGING в «Настройках»)' };
  const props = PropertiesService.getScriptProperties();
  const now = Date.now();
  const since = Number(props.getProperty('AMO_TAGS_SINCE') || 0) || now - 2 * DAY_MS;
  // Перекрытие в час: сделки, которые ждали заявку Тильды, проверяются ещё раз
  const from = Math.floor((since - 3600 * 1000) / 1000);

  let leads = [];
  for (let page = 1; ; page++) {
    const res = amoGet_('/api/v4/leads', { limit: 250, page: page, with: 'contacts', 'filter[created_at][from]': from });
    const items = (res._embedded || {}).leads || [];
    leads = leads.concat(items);
    if (items.length < 250 || !(res._links && res._links.next)) break;
  }

  const known = sourceTagSet_(p);
  const tagsOf = l => ((l._embedded || {}).tags || []).map(t => t.name);
  leads = leads.filter(l => !tagsOf(l).some(t => known[lc_(t)]));

  const pipes = list_(p.AMO_PIPELINES);
  const skip = list_(p.AMO_EXCLUDE_STATUSES);
  const pipeInfo = leads.length ? amoPipelines_() : {};
  leads = leads.filter(l => {
    const pl = pipeInfo[l.pipeline_id] || { name: '', statuses: {} };
    l._pipelineName = pl.name;
    return (!pipes.length || pipes.indexOf(lc_(pl.name)) >= 0) && skip.indexOf(lc_(pl.statuses[l.status_id] || '')) < 0;
  });

  // Заявки Тильды за последние 3 дня по телефону (самая свежая)
  const tildaByPhone = {};
  const minDay = dayKey_(addDays_(new Date(), -3));
  readObjects_(SHEETS.tilda).forEach(t => {
    const ph = normalizePhone_(t['Телефон']);
    if (ph && dayKey_(t['Получена']) >= minDay) tildaByPhone[ph] = t;
  });

  const contactIds = {};
  leads.forEach(l => { const c = mainContact_(l); if (c) contactIds[c.id] = true; });
  const phones = leads.length ? amoPhones_(Object.keys(contactIds)) : {};

  const updates = [];
  const counts = {};
  leads.forEach(l => {
    const c = mainContact_(l);
    const tilda = c ? tildaByPhone[phones[c.id]] || null : null;
    const tag = leadSourceTag_({
      fields: amoFields_(l), tags: tagsOf(l), pipeline: l._pipelineName, name: l.name,
      ageMin: (now / 1000 - l.created_at) / 60,
    }, tilda, p);
    if (!tag) return;
    updates.push({ id: l.id, tags_to_add: [{ name: tag }] });
    counts[tag] = (counts[tag] || 0) + 1;
  });
  for (let i = 0; i < updates.length; i += 50) amoPatch_('/api/v4/leads', updates.slice(i, i + 50));

  props.setProperty('AMO_TAGS_SINCE', String(now));
  const parts = Object.keys(counts).map(k => k + ' — ' + counts[k]);
  return { tagged: updates.length,
    message: updates.length ? 'проставлено тегов: ' + updates.length + ' (' + parts.join(', ') + ')' : 'новых сделок без тега нет' };
}
