// ---------- Проверка вебхука Тильды ----------
// Скрипт сам отправляет проверочную заявку на тот адрес, что указан в Тильде, и говорит, что не так:
// тестовый адрес /dev, нет ключа, доступ не «Все», развёртывание удалено — или всё работает и дело в настройке форм.

function drCheckHook() {
  const ui = SpreadsheetApp.getUi();
  const a = ui.prompt('Проверка вебхука', 'Скопируйте адрес вебхука из Тильды (Настройки сайта → Формы → Webhook) ' +
    'и вставьте сюда целиком:', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  ui.alert('Проверка вебхука', drHookCheck_(a.getResponseText().trim()), ui.ButtonSet.OK);
}

function drHookCheck_(url) {
  const deploy = 'Apps Script → Начать развертывание → Управление развертываниями';
  if (/\/dev(\?|#|$)/.test(url)) return '❌ Адрес заканчивается на /dev — это тестовый адрес, он открывается только вам, ' +
    'Тильде он не отвечает. Нужен адрес, который заканчивается на /exec: ' + deploy + ' → скопируйте «URL веб-приложения», ' +
    'допишите ?key=' + drSecret_() + ' и замените адрес в Тильде.';
  if (!/^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[\w-]+\/exec/.test(url)) return '❌ Это не адрес веб-приложения ' +
    'Apps Script: он должен начинаться с https://script.google.com/macros/s/ и заканчиваться на /exec?key=…';
  const key = (url.match(/[?&]key=([^&#]+)/) || [])[1];
  if (!key) return '❌ В адресе нет ?key=… — скрипт отклоняет такие заявки. Допишите в конец адреса в Тильде: ?key=' + drSecret_();
  if (key !== drSecret_()) return '❌ Ключ в адресе (?key=…) не тот. Правильный конец адреса: ?key=' + drSecret_();
  const id = 'check-' + Date.now();
  let res;
  try {
    res = UrlFetchApp.fetch(url, { method: 'post', muteHttpExceptions: true, followRedirects: true,
      payload: { tranid: id, formname: 'Проверка вебхука', Name: 'Проверка', Phone: '0' } });
  } catch (e) { return '❌ Адрес не отвечает: ' + e.message; }
  const code = res.getResponseCode(), text = String(res.getContentText()).trim();
  const written = drHookCleanup_(id);
  if (text === 'ok' && written) return '✅ Адрес рабочий: проверочная заявка дошла и записалась (строку я удалил).\n\n' +
    'Значит, Тильда просто не отправляет заявки на этот адрес. Проверьте:\n' +
    '1) Настройки сайта → Формы: вебхук с этим адресом добавлен и подключён;\n' +
    '2) в каждой форме на странице: блок → Контент → «Приём данных» → отмечен этот Webhook;\n' +
    '3) страница переопубликована («Опубликовать»), заявка отправлена с опубликованного сайта, а не из предпросмотра.';
  if (text === 'ok') return '❌ Адрес отвечает, но заявка не записалась — веб-приложение работает на старом коде. ' +
    deploy + ' → ✏️ → Версия: «Новая версия» → Развернуть.';
  if (text === 'forbidden') return '❌ Веб-приложение отклонило ключ — оно работает на старом коде. ' +
    deploy + ' → ✏️ → Версия: «Новая версия» → Развернуть.';
  if (code === 404) return '❌ По этому адресу развёртывания нет (404) — его удалили или адрес скопирован не полностью. ' +
    deploy + ' → скопируйте «URL веб-приложения».';
  if (code === 401 || code === 403 || /accounts\.google\.com|ServiceLogin/i.test(text)) return '❌ Тильда получает страницу ' +
    'входа Google: у веб-приложения доступ не «Все». ' + deploy + ' → ✏️ → «У кого есть доступ: Все» → Развернуть.';
  return '❌ Неожиданный ответ (' + code + '): ' + text.slice(0, 200);
}

/** Удаляет проверочную строку из «Заявок»; true — если она там была. */
function drHookCleanup_(id) {
  const sh = SpreadsheetApp.getActive().getSheetByName(DR_SHEETS.LEADS);
  if (!sh || sh.getLastRow() < 2) return false;
  const ids = sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues();
  for (let i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === id) { sh.deleteRow(i + 2); return true; }
  return false;
}
