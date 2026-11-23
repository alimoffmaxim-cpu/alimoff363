// ---------- Этап заявки, ClientID и yclid, офлайн-конверсии Яндекс Метрики ----------
// «Заявки», колонки U–X: ClientID Метрики (кука _ym_uid — поле ym_client_id из кода для сайта или кука от Тильды),
// yclid (из адреса входа), «Этап» (выпадающий список, у новой заявки — «Новая заявка»), дата смены этапа.
// Лист «Офлайн-конверсии» — в формате загрузки в Метрику: по строке на каждый пройденный этап, цель этапа — GOALS.
// Загрузка: лист → Файл → Скачать → CSV → Метрика → Настройки → Загрузка данных → Офлайн-конверсии.

const DR_OFFLINE = {
  SHEET: 'Офлайн-конверсии',
  STAGES: ['Новая заявка', 'Записан на пробное занятие', 'Посетил пробное занятие'],
  GOALS: ['lead', 'trial_booked', 'trial_visited'],   // идентификаторы JavaScript-целей в Метрике для этих этапов
  LEAD_COLS: ['ClientID (Метрика)', 'yclid', 'Этап', 'Этап изменён'],
};

/** Вызывается из drRecompute_: U–X «Заявок» (ID, этап по умолчанию, список) и лист «Офлайн-конверсии». */
function drOffline_() {
  const leads = SpreadsheetApp.getActive().getSheetByName(DR_SHEETS.LEADS);
  if (!leads || leads.getLastRow() < 2) return;
  const n = leads.getLastRow() - 1, col = DR_LEAD_HEAD.length + 1;
  const raw = drRows_(DR_SHEETS.LEADS, DR_LEAD_RAW), ids = raw.map(drLeadIds_);
  drHead_(leads, 1, DR_LEAD_HEAD.concat(DR_OFFLINE.LEAD_COLS));
  leads.getRange(2, col, n, 2).setNumberFormat('@').setValues(ids);
  const st = leads.getRange(2, col + 2, n, 2).getValues().map(function (r) { return [r[0] || DR_OFFLINE.STAGES[0], r[1]]; });
  leads.getRange(2, col + 2, n, 1).setValues(st.map(function (r) { return [r[0]]; }));
  leads.getRange(2, col + 2, leads.getMaxRows() - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(DR_OFFLINE.STAGES, true).setAllowInvalid(false).build());
  leads.getRange(2, col + 3, n, 1).setNumberFormat('dd.MM.yyyy HH:mm');

  const rows = [], unix = function (d) { return String(Math.floor(d.getTime() / 1000)); };
  raw.forEach(function (r, i) {
    if (!(r[0] instanceof Date) || !(ids[i][0] || ids[i][1])) return;
    const k = DR_OFFLINE.STAGES.indexOf(st[i][0]), when = st[i][1] instanceof Date ? st[i][1] : r[0];
    for (let j = 0; j <= Math.max(k, 0); j++) rows.push([ids[i][0], ids[i][1], DR_OFFLINE.GOALS[j], unix(j ? when : r[0])]);
  });
  const sh = drSheet_(DR_OFFLINE.SHEET);
  drClearFrom_(sh, 1, 4);
  sh.getRange(1, 1, 1, 4).setValues([['ClientId', 'Yclid', 'Target', 'DateTime']]).setFontWeight('bold');
  if (rows.length) drWrite_(sh, 2, rows, ['@', '@', '@', '@']);
}

/** Новая заявка (вебхук): этап «Новая заявка». */
function drStageNew_(sh, row) { sh.getRange(row, DR_LEAD_HEAD.length + 3).setValue(DR_OFFLINE.STAGES[0]); }

/** onEdit: сменили «Этап» — записать время смены (для даты офлайн-конверсии). */
function drStageEdit_(a) {
  const c = DR_LEAD_HEAD.length + 3;
  if (a.getRow() < 2 || a.getColumn() > c || a.getLastColumn() < c) return;
  const r = a.getSheet().getRange(a.getRow(), c + 1, a.getLastRow() - a.getRow() + 1, 1);
  r.setValues(r.getValues().map(function () { return [new Date()]; })).setNumberFormat('dd.MM.yyyy HH:mm');
  drRecompute_();   // записи на пробное — сразу в отчёте
}

/** Строка «Заявок» (A–M) → [ClientID, yclid]. */
function drLeadIds_(r) {
  const all = String(r[12] || ''), q = drQuery_(String(r[11] || ''));
  const cid = (all.match(/(?:^|; )(?:ym_client_id|_ym_uid|ym_uid|client_?id)=(\d{6,})/i) || [])[1] || '';
  const yclid = /^\d+$/.test(q.yclid || '') ? q.yclid : (all.match(/(?:^|; |[?&])yclid=(\d+)/i) || [])[1] || '';
  return [cid, yclid];
}
