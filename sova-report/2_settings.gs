// ---------- Лист настроек: список направлений (кабинетов) и их подключение ----------

const SOVA_DIR_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7'];

/** Направления из листа настроек: [{name, row, leadsMetric, color}]. */
function sovaCabinets_() {
  const sh = sovaSettingsSheet_();
  const n = Math.max(sh.getLastRow() - 1, 0);
  const rows = n ? sh.getRange(2, 1, n, 4).getDisplayValues() : [];
  const cabs = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const name = sovaSheetName_(r[0]);
    if (!name) break;                       // список направлений — до первой пустой строки
    if (name.charAt(0) === '#') continue;   // закомментированное направление
    cabs.push({
      name: name,
      row: i + 2,
      leadsMetric: String(r[2]).trim() || SOVA.LEADS_METRIC,
      color: /^#[0-9a-f]{6}$/i.test(String(r[3]).trim()) ? String(r[3]).trim()
        : SOVA_DIR_COLORS[cabs.length % SOVA_DIR_COLORS.length],
    });
  }
  if (!cabs.length) throw new Error('На листе «' + SOVA.SETTINGS_SHEET + '» не указано ни одного направления.');
  return cabs;
}

/** Лист настроек; если его нет — создаётся с примером на 3 направления (7_build.gs). */
function sovaSettingsSheet_() {
  const ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(SOVA.SETTINGS_SHEET) || sbBuildSettings_(ss);
}

/** Убирает символы, недопустимые в названии листа. */
function sovaSheetName_(s) {
  return String(s || '').replace(/[\[\]\*\?\/\\:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
}

/** В новом листе 1000 строк, а за год по нескольким кабинетам выходит больше. */
function sovaEnsureRows_(sh, n) {
  if (sh.getMaxRows() < n) sh.insertRowsAfter(sh.getMaxRows(), n - sh.getMaxRows());
}
