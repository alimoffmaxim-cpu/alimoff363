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

/** Лист настроек; при первом запуске создаётся с примером на 3 направления. */
function sovaSettingsSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SOVA.SETTINGS_SHEET);
  if (sh) return sh;
  sh = ss.insertSheet(SOVA.SETTINGS_SHEET);
  const head = ['Направление (= название листа)', 'Подключение (заполняет скрипт)', 'Метрика лидов (необяз.)', 'Цвет (необяз.)'];
  sh.getRange(1, 1, 1, 4).setValues([head]).setFontWeight('bold').setFontColor('#ffffff').setBackground('#1f2a44');
  sh.getRange(2, 1, 3, 4).setValues([1, 2, 3].map(function (i) {
    return ['Направление ' + i, '❌ не подключён', '', SOVA_DIR_COLORS[i - 1]];
  }));
  sh.getRange(9, 1, 6, 1).setValues([
    ['Как заполнить:'],
    ['• Направление — название, так будет называться лист отчёта (например, «Стоматология»). 1 строка = 1 кабинет VK.'],
    ['• Затем меню «🦉 Сова → Подключить кабинет VK»: client_id и client_secret из ads.vk.com → Настройки → Доступ к API.'],
    ['• Метрика лидов — оставьте пустой, если лиды считаются как обычно (' + SOVA.LEADS_METRIC + ').'],
    ['• Направления перечисляются подряд, без пустых строк. Строка, начинающаяся с #, пропускается.'],
    ['• Переименовали направление — подключите его кабинет заново.'],
  ]);
  sh.getRange(9, 1).setFontWeight('bold');
  sh.getRange(10, 1, 5, 1).setFontColor('#6b7280');
  sh.setColumnWidth(1, 260).setColumnWidth(2, 240).setColumnWidth(3, 200).setColumnWidth(4, 120);
  sh.setFrozenRows(1);
  sh.setTabColor('#9aa3b2');
  return sh;
}

/** Убирает символы, недопустимые в названии листа. */
function sovaSheetName_(s) {
  return String(s || '').replace(/[\[\]\*\?\/\\:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
}
