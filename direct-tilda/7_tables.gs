// ---------- Листы «Кампании», «Группы», «Объявления» за период ----------
// Строка = кампания / группа / объявление, где за период были показы, клики, расход или заявки; сверху «Итого».
// Заявки, привязанные только к кампании (без группы) или к группе (без объявления), — отдельные строки
// «(без группы)» / «(без объявления)», чтобы итоги сходились.

function drTables_(p, cur) {
  const texts = {};
  drRows_(DR_SHEETS.TEXTS, DR_TEXT_HEAD.length).forEach(function (r) { texts[r[0]] = r; });
  const agg = function (keyOf, info) {
    const m = {};
    const get = function (k, x) { return m[k] || (m[k] = { info: info(x), v: [0, 0, 0, 0] }); };
    cur.data.forEach(function (x) { const k = keyOf(x); if (k) { const e = get(k, x); e.v[0] += x.sp; e.v[1] += x.sh; e.v[2] += x.cl; } });
    cur.leads.forEach(function (l) {
      if (l.m[0] !== 'Директ') return;
      const x = { c: l.m[1], cn: l.m[2], g: l.m[3], gn: l.m[4], a: l.m[5] }, k = keyOf(x);
      if (k) get(k, x).v[3]++;
    });
    return Object.keys(m).map(function (k) { return m[k]; })
      .sort(function (a, b) { return b.v[0] - a.v[0] || b.v[3] - a.v[3]; });
  };
  const none = cur.leads.filter(function (l) { return l.m[0] === 'Директ' && !l.m[1]; }).length;
  const names = {};   // названия кампаний и групп из данных (у заявок по ID их может не быть)
  cur.data.forEach(function (x) { names['c' + x.c] = x.cn; names['g' + x.g] = x.gn; });
  const cn = function (x) { return x.cn || names['c' + x.c] || ''; }, gn = function (x) { return x.gn || names['g' + x.g] || ''; };

  const noneRow = function (info) { return { info: info, v: [0, 0, 0, none] }; };   // одинаково на всех листах — итоги сходятся
  const camps = agg(function (x) { return x.c ? 'c' + x.c : ''; }, function (x) { return [x.c, cn(x)]; });
  if (none) camps.push(noneRow(['', 'Директ, заявки без привязки к кампании']));
  drTable_(DR_SHEETS.CAMPAIGNS, p, ['ID кампании', 'Кампания'], camps, ['0', null]);

  const groups = agg(function (x) { return x.c ? 'g' + x.c + '|' + (x.g || '') : ''; },
    function (x) { return [cn(x), x.g || '', x.g ? gn(x) : '(без группы)']; });
  if (none) groups.push(noneRow(['Директ, заявки без привязки к кампании', '', '']));
  drTable_(DR_SHEETS.GROUPS, p, ['Кампания', 'ID группы', 'Группа'], groups, [null, '0', null]);

  const ads = agg(function (x) { return x.c ? 'a' + x.c + '|' + (x.g || '') + '|' + (x.a || '') : ''; }, function (x) {
    const t = texts[x.a] || [];
    return [cn(x), x.g ? gn(x) : '(без группы)', x.a || '', x.a ? [t[4], t[5]].filter(Boolean).join(' · ') : '(без объявления)', t[6] || ''];
  });
  if (none) ads.push(noneRow(['Директ, заявки без привязки к кампании', '', '', '', '']));
  ads.forEach(function (e) { const t = texts[e.info[2]] || []; e.tail = [t[7] || '']; });
  drTable_(DR_SHEETS.ADS, p, ['Кампания', 'Группа', 'ID объявления', 'Заголовок', 'Текст'], ads, [null, null, '0', null, null], ['Ссылка']);
}

/** Пишет таблицу листа: заголовок, «Итого», строки. */
function drTable_(name, p, lead, list, leadFmt, tailHead) {
  const sh = drSheet_(name);
  const width = lead.length + DR_METRICS.length + (tailHead || []).length;
  sh.getRange('A1').setValue(name).setFontWeight('bold').setFontSize(16);
  sh.getRange('A2').setValue('Период: ' + drRu_(p.from) + ' — ' + drRu_(p.to) + ' (меняется на «Сводной»). ' +
    'Заявки — из Тильды, сопоставлены по меткам (лист «Заявки»). Расход без НДС.').setFontColor('#6b7280');
  drClearFrom_(sh, 4, Math.max(width, sh.getLastColumn() || 1));
  drHead_(sh, 4, lead.concat(DR_METRICS, tailHead || []));
  const t = list.reduce(function (s, e) { for (let i = 0; i < 4; i++) s[i] += e.v[i]; return s; }, [0, 0, 0, 0]);
  const blank = lead.map(function () { return ''; }), tailBlank = (tailHead || []).map(function () { return ''; });
  const rows = [['Итого'].concat(blank.slice(1), drM_(t[0], t[1], t[2], t[3]), tailBlank)].concat(list.map(function (e) {
    return e.info.concat(drM_(e.v[0], e.v[1], e.v[2], e.v[3]), e.tail || tailBlank);
  }));
  drWrite_(sh, 5, rows, leadFmt.concat(DR_FMT, (tailHead || []).map(function () { return null; })));
  sh.getRange(5, 1, 1, width).setFontWeight('bold').setBackground('#e8ecf4');
  sh.setFrozenRows(5);
}
