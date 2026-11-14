// ---------- Таблица клиента: новый блок недели на листе «неделя» ----------
// Каждый понедельник после ночной загрузки (4_sync.gs) скрипт дописывает в таблицу клиента блок прошедшей недели
// по образцу последнего блока: заголовок «46 неделя», строки РК (Номер, Название, Куда ведем, Бюджет, Показы, Клики,
// Пдп/активности — значениями из листа «Волгоград РК»), CTR / CPC / стоимость / CR формулами, ИТОГО и РАЗНИЦА.
// Блок этой недели уже есть — цифры в нём перезаписываются. Вручную: «Сова → Заполнить неделю в таблице клиента».

const SOVA_CW = {
  SPREADSHEET_ID: '1lCTPq2Ie4hCOsdHAAdaR4Cpvsr8_shcvu7glIked8vg',   // «Отчеты таргет» (таблица клиента)
  SHEET: 'неделя',
  WEEKDAY: 1,                    // в какой день недели дописывать (1 — понедельник), по SOVA.TIMEZONE
  DIFF_COLS: ['G', 'K', 'N'],    // в строке РАЗНИЦА — разность (проценты), в остальных колонках — отношение
};

function sovaCwMenu() {
  sovaAlert_(function () { return sovaClientWeek_(); });
}

/** Прошедшая неделя (пн–вс до последнего воскресенья) → блок в таблице клиента. Возвращает текст для статуса. */
function sovaClientWeek_() {
  const today = Utilities.formatDate(new Date(), SOVA.TIMEZONE, 'yyyy-MM-dd');
  const dow = Number(Utilities.formatDate(new Date(), SOVA.TIMEZONE, 'u'));   // 1 — пн … 7 — вс
  const week = sovaVlgWeek_(sovaAddDays_(today, -dow));   // неделя, закончившаяся в последнее воскресенье
  const num = Number(week.label.split(' ')[0]);
  const rows = sovaCwRows_(week.label);
  const sh = SpreadsheetApp.openById(SOVA_CW.SPREADSHEET_ID).getSheetByName(SOVA_CW.SHEET);
  if (!sh) throw new Error('в таблице клиента нет листа «' + SOVA_CW.SHEET + '»');
  let b = sovaCwFind_(sh, num), prevTotal = 0;
  if (!b) {
    const last = sovaCwLastBlock_(sh);
    if (!last) throw new Error('на листе «' + SOVA_CW.SHEET + '» не найден ни один блок «NN неделя» для образца');
    const top = last.diff + 2;   // как у клиента: пустая строка между блоками
    sh.getRange(last.head, 1, last.diff - last.head + 1, sh.getLastColumn()).copyTo(sh.getRange(top, 1));
    sh.getRange(top, 4).setValue(num + ' неделя ');
    b = sovaCwFind_(sh, num);
    prevTotal = last.total;
  }
  b = sovaCwResize_(sh, b, Math.max(rows.length, 1));
  if (prevTotal) sovaCwDiffRow_(sh, b, prevTotal);   // после вставки строк: ИТОГО уже на своём месте
  const first = b.head + 2, n = b.total - first;
  sh.getRange(first, 1, n, 6).clearContent();
  sh.getRange(first, 9, n, 1).clearContent();
  if (rows.length) {
    sh.getRange(first, 1, rows.length, 6).setValues(rows.map(function (r) { return r.slice(0, 6); }));
  }
  for (let r = first; r < b.total; r++) {
    sh.getRange(r, 7, 1, 5).setFormulas([['=IFERROR(F' + r + '/E' + r + ')', '=IFERROR(D' + r + '/F' + r + ')', '',
      '=IFERROR(D' + r + '/I' + r + ')', '=IFERROR(I' + r + '/F' + r + ')']]);
    sh.getRange(r, 9).setValue(rows[r - first] ? rows[r - first][6] : '');
  }
  sh.getRange(b.diff, 1).setValue('РАЗНИЦА ' + num + '/' + (num - 1));
  return 'Таблица клиента: «' + num + ' неделя» — РК: ' + rows.length + '.';
}

/** Строки РК недели с листа «Волгоград РК»: [номер, название, куда ведем, бюджет, показы, клики, пдп]. */
function sovaCwRows_(label) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SOVA_VLG.SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 12).getValues()
    .filter(function (r) { return r[0] === label; })
    .map(function (r) { return [r[3], r[4], r[5], r[6], r[7], r[8], r[11]]; })
    .sort(function (a, b) { return a[0] - b[0]; });
}

/** Блок недели num: {head — строка «NN неделя», total — ИТОГО, diff — РАЗНИЦА} или null. */
function sovaCwFind_(sh, num) {
  const vals = sh.getRange(1, 1, sh.getLastRow(), 4).getDisplayValues();
  for (let i = vals.length - 1; i >= 0; i--) {
    const m = String(vals[i][3]).match(/^\s*(\d+)\s*неделя/i);
    if (m && Number(m[1]) === num) return sovaCwBounds_(vals, i);
  }
  return null;
}

function sovaCwLastBlock_(sh) {
  const vals = sh.getRange(1, 1, sh.getLastRow(), 4).getDisplayValues();
  for (let i = vals.length - 1; i >= 0; i--) {
    if (/^\s*\d+\s*неделя/i.test(String(vals[i][3]))) return sovaCwBounds_(vals, i);
  }
  return null;
}

function sovaCwBounds_(vals, i) {
  const b = { head: i + 1, total: 0, diff: 0 };
  for (let j = i + 2; j < vals.length && !b.diff; j++) {
    const a = String(vals[j][0]).trim().toUpperCase();
    if (!b.total && a.indexOf('ИТОГО') === 0) b.total = j + 1;
    else if (b.total && a.indexOf('РАЗНИЦА') === 0) b.diff = j + 1;
  }
  if (!b.total || !b.diff) throw new Error('в блоке со строки ' + b.head + ' не найдены строки ИТОГО и РАЗНИЦА');
  return b;
}

/** Делает в блоке ровно n строк РК: вставляет строки внутрь диапазона (SUM в ИТОГО растягиваются) или удаляет лишние. */
function sovaCwResize_(sh, b, n) {
  const first = b.head + 2, have = b.total - first;
  if (n > have) {
    sh.insertRowsBefore(b.total - 1, n - have);
    const src = b.total - 1 + (n - have);   // бывшая последняя строка РК — её формулы L…T копируем в новые
    sh.getRange(src, 1, 1, sh.getLastColumn()).copyTo(sh.getRange(b.total - 1, 1, n - have, sh.getLastColumn()));
  } else if (n < have) {
    sh.deleteRows(first + n, have - n);
  }
  const d = n - have;
  return { head: b.head, total: b.total + d, diff: b.diff + d };
}

/** Строка РАЗНИЦА: эта ИТОГО к ИТОГО прошлого блока (у клиента между блоками разное число строк). */
function sovaCwDiffRow_(sh, b, prevTotal) {
  const cols = sh.getLastColumn(), f = [];
  for (let c = 4; c <= Math.min(cols, 20); c++) {
    const L = sovaCwCol_(c);
    f.push(SOVA_CW.DIFF_COLS.indexOf(L) >= 0 ? '=IFERROR(' + L + b.total + '-' + L + prevTotal + ')'
      : '=IFERROR(' + L + b.total + '/' + L + prevTotal + '-1)');
  }
  sh.getRange(b.diff, 4, 1, f.length).setFormulas([f]);
}

function sovaCwCol_(c) { return String.fromCharCode(64 + c); }
