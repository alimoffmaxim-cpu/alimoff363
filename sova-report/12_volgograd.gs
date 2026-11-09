// ---------- Волгоград: статистика по каждой кампании для таблицы клиента ----------
// Лист «Волгоград РК»: одна строка = одна кампания за неделю или за месяц, колонки как в таблице клиента
// (Номер РК, Название РК, Куда ведем, Бюджет, Показы, Клики, CTR, CPC, Пдп/активности, Стоимость пдп, CR в пдп).
// Кампании берутся из всех подключённых кабинетов: в названии есть volg / vlg или номер в списке IDS.
// Лист пересобирается после каждой загрузки данных (4_sync.gs) и пунктом меню «Сова → Обновить лист Волгоград».
// В таблицу клиента — через IMPORTRANGE + QUERY по колонке «Период» (см. README).

const SOVA_VLG = {
  SHEET: 'Волгоград РК',
  NAME_REGEX: 'volg|vlg',     // в названии кампании (без учёта регистра)
  IDS: [],                    // дополнительные номера РК, если в названии нет volg / vlg
  FROM: '2026-08-01',         // с какой даты строить недели и месяцы
};

const SOVA_VLG_HEAD = ['Период', 'Тип', 'Начало', 'Номер РК', 'Название РК', 'Куда ведем', 'Бюджет', 'Показы', 'Клики',
  'CTR', 'CPC', 'Пдп/активности', 'Стоимость пдп', 'CR в пдп', 'Направление', 'Обновлено'];

const SOVA_VLG_MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь',
  'Октябрь', 'Ноябрь', 'Декабрь'];

/** Меню: пересобрать лист «Волгоград РК». */
function sovaVlgMenu() {
  sovaAlert_(function () {
    const n = sovaVlgUpdate_();
    return 'Лист «' + SOVA_VLG.SHEET + '» обновлён: кампаний — ' + n + '.';
  });
}

/** Собирает дневную статистику волгоградских кампаний и пишет недели и месяцы на лист. Возвращает число кампаний. */
function sovaVlgUpdate_() {
  const to = sovaYesterday_();
  const re = new RegExp(SOVA_VLG.NAME_REGEX, 'i');
  const ids = SOVA_VLG.IDS.map(String);
  const groups = {};   // 'w|2026-11-03|id' → строка
  const camps = {};
  sovaCabinets_().forEach(function (cab) {
    let list;
    try { list = sovaVlgCampaigns_(cab); } catch (e) { return; }   // кабинет не подключён
    const mine = list.filter(function (c) { return re.test(c.name || '') || ids.indexOf(String(c.id)) >= 0; });
    if (!mine.length) return;
    mine.forEach(function (c) { camps[c.id] = { name: c.name, cab: cab.name }; });
    const group = cab.leadsMetric.split('.')[0];
    const metrics = group === 'base' ? 'base' : 'base,' + group;
    for (let from = SOVA_VLG.FROM; from <= to; from = sovaAddDays_(from, 90)) {
      const end = sovaAddDays_(from, 89) < to ? sovaAddDays_(from, 89) : to;
      for (let i = 0; i < mine.length; i += 100) {
        const res = sovaApiGet_(cab, '/statistics/' + SOVA.LEVEL + '/day.json', {
          id: mine.slice(i, i + 100).map(function (c) { return c.id; }).join(','),
          date_from: from, date_to: end, metrics: metrics,
        });
        (res.items || []).forEach(function (item) {
          (item.rows || []).forEach(function (r) {
            const b = r.base || {};
            const v = [sovaNum_(b.spent), sovaNum_(b.shows), sovaNum_(b.clicks), sovaNum_(sovaPath_(r, cab.leadsMetric))];
            if (!v[0] && !v[1] && !v[2] && !v[3]) return;
            [sovaVlgWeek_(r.date), sovaVlgMonth_(r.date)].forEach(function (p) {
              const k = p.type + '|' + p.start + '|' + item.id;
              const g = groups[k] || (groups[k] = { p: p, id: item.id, v: [0, 0, 0, 0] });
              for (let j = 0; j < 4; j++) g.v[j] += v[j];
            });
          });
        });
      }
    }
  });
  sovaVlgWrite_(groups, camps);
  return Object.keys(camps).length;
}

/** Кампании кабинета с названиями (уровень SOVA.LEVEL, включая остановленные). */
function sovaVlgCampaigns_(cab) {
  const out = [];
  for (let offset = 0; ; ) {
    const res = sovaApiGet_(cab, '/' + SOVA.LEVEL + '.json', { fields: 'id,name', limit: 250, offset: offset });
    const items = res.items || [];
    items.forEach(function (it) { out.push(it); });
    offset += items.length;
    if (!items.length || offset >= (res.count || 0)) break;
  }
  return out;
}

/** Неделя с понедельника; подпись как в таблице клиента: «45 неделя 2026» (номер по ISO). */
function sovaVlgWeek_(d) {
  const p = d.split('-').map(Number);
  const t = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  const dow = t.getUTCDay() || 7;
  const start = sovaAddDays_(d, 1 - dow);
  t.setUTCDate(t.getUTCDate() + 4 - dow);   // четверг этой недели определяет год и номер
  const y0 = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t - y0) / SOVA_DAY_MS + 1) / 7);
  return { type: 'неделя', start: start, label: week + ' неделя ' + t.getUTCFullYear() };
}

function sovaVlgMonth_(d) {
  const p = d.split('-');
  return { type: 'месяц', start: p[0] + '-' + p[1] + '-01', label: SOVA_VLG_MONTHS[Number(p[1]) - 1] + ' ' + p[0] };
}

/** «Куда ведем» по названию кампании: subscribe / subscribers → подписка, остальное — активности. */
function sovaVlgGoal_(name) {
  return /subscri|подпис/i.test(name || '') ? 'подписка' : 'активности';
}

function sovaVlgWrite_(groups, camps) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SOVA_VLG.SHEET) || ss.insertSheet(SOVA_VLG.SHEET);
  const now = Utilities.formatDate(new Date(), SOVA.TIMEZONE, 'dd.MM.yyyy HH:mm');
  const rows = Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) {
    return a.p.type !== b.p.type ? (a.p.type === 'неделя' ? -1 : 1)
      : a.p.start !== b.p.start ? (a.p.start < b.p.start ? -1 : 1) : String(a.id).localeCompare(String(b.id));
  }).map(function (g) {
    const c = camps[g.id] || {}, s = Math.round(g.v[0] * 100) / 100, sh_ = g.v[1], cl = g.v[2], ld = g.v[3];
    return [g.p.label, g.p.type, sovaParse_(g.p.start), Number(g.id), c.name || '', sovaVlgGoal_(c.name), s, sh_, cl,
      sh_ ? cl / sh_ : '', cl ? s / cl : '', ld, ld ? s / ld : '', cl ? ld / cl : '', c.cab || '', now];
  });
  sh.clearContents();
  sh.getRange(1, 1, 1, SOVA_VLG_HEAD.length).setValues([SOVA_VLG_HEAD]).setFontWeight('bold').setBackground('#cfe2f3');
  sh.setFrozenRows(1);
  if (!rows.length) return;
  sovaEnsureRows_(sh, rows.length + 1);
  sh.getRange(2, 1, rows.length, SOVA_VLG_HEAD.length).setValues(rows);
  sh.getRange(2, 3, rows.length, 1).setNumberFormat('dd.MM.yyyy');
  sh.getRange(2, 7, rows.length, 1).setNumberFormat('#,##0.00');
  sh.getRange(2, 10, rows.length, 1).setNumberFormat('0.00%');
  sh.getRange(2, 11, rows.length, 1).setNumberFormat('#,##0.00');
  sh.getRange(2, 13, rows.length, 1).setNumberFormat('#,##0.00');
  sh.getRange(2, 14, rows.length, 1).setNumberFormat('0.00%');
}
