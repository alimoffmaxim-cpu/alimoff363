function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Дашборд')
    .addItem('Обновить всё', 'menuUpdateAll')
    .addSeparator()
    .addItem('Обновить рекламу', 'menuAds')
    .addItem('Обновить амоCRM', 'menuAmo')
    .addItem('Обновить Мой Класс', 'menuMk')
    .addItem('Пересобрать сводку (fact)', 'menuFacts')
    .addSeparator()
    .addSubMenu(ui.createMenu('Ключи доступа')
      .addItem('VK Реклама: токен на 24 ч', 'promptVkToken')
      .addItem('VK Реклама: client_id / secret', 'promptVkKeys')
      .addItem('Яндекс Директ', 'promptYandexKeys')
      .addItem('Авито', 'promptAvitoKeys')
      .addItem('амоCRM', 'promptAmoKeys')
      .addItem('Мой Класс', 'promptMkKey'))
    .addSubMenu(ui.createMenu('Отладка')
      .addItem('Поля сделок амоCRM', 'debugAmoFields')
      .addItem('Примеры данных Мой Класс', 'debugMk')
      .addItem('Операции Авито за 7 дней', 'debugAvito')
      .addItem('Метрики VK за 7 дней', 'debugVkMetrics'))
    .addSeparator()
    .addItem('Создать / обновить листы', 'setupSheets')
    .addItem('Включить ежедневное обновление', 'setupTriggers')
    .addToUi();
}

// ---------- Задачи (их же вызывают триггеры) ----------

function jobAds() { return runJob_('Реклама', updateAds, true); }
function jobAmo() { return runJob_('амоCRM', updateAmo, true); }
function jobMk() { return runJob_('Мой Класс', updateMk, true); }
function jobFacts() { return runJob_('Сводка', rebuildFacts, true); }

/** Выполняет задачу, пишет результат в «Лог». В триггере ошибка пробрасывается — Google пришлёт письмо. */
function runJob_(name, fn, rethrow) {
  try {
    const msg = fn();
    log_(name, msg);
    return name + ': ' + msg;
  } catch (e) {
    log_(name, 'ОШИБКА: ' + e.message);
    if (rethrow) throw e;
    return name + ': ОШИБКА — ' + e.message;
  }
}

// ---------- Меню ----------

function alert_(text) { SpreadsheetApp.getUi().alert(text); }

function menuUpdateAll() {
  alert_([
    runJob_('Реклама', updateAds),
    runJob_('амоCRM', updateAmo),
    runJob_('Мой Класс', updateMk),
    runJob_('Сводка', rebuildFacts),
  ].join('\n'));
}
/** Загрузка из меню: сразу пересобирает fact, чтобы данные появились в сводках. */
function withFacts_(name, fn) {
  alert_(runJob_(name, fn) + '\n' + runJob_('Сводка', rebuildFacts));
}
function menuAds() { withFacts_('Реклама', updateAds); }
function menuAmo() { withFacts_('амоCRM', updateAmo); }
function menuMk() { withFacts_('Мой Класс', updateMk); }
function menuFacts() { alert_(runJob_('Сводка', rebuildFacts)); }

function setupTriggers() {
  const jobs = ['jobAds', 'jobAmo', 'jobMk', 'jobFacts'];
  ScriptApp.getProjectTriggers()
    .filter(t => jobs.indexOf(t.getHandlerFunction()) >= 0)
    .forEach(t => ScriptApp.deleteTrigger(t));
  // Разные часы: каждая задача укладывается в лимит 6 минут, сводка собирается последней
  jobs.forEach((fn, i) => {
    ScriptApp.newTrigger(fn).timeBased().everyDays(1).atHour((CFG.TRIGGER_HOUR + i) % 24).create();
  });
  alert_('Ежедневное обновление включено: реклама в ' + CFG.TRIGGER_HOUR + ':00, амоCRM, Мой Класс и сводка — каждый следующий час.');
}

// ---------- Ввод ключей (хранятся в Свойствах скрипта, не в коде) ----------

/** Спрашивает свойства по очереди. Пустой ответ — оставить как есть. */
function promptProps_(title, fields) {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  for (let i = 0; i < fields.length; i++) {
    const key = fields[i][0];
    const hint = props.getProperty(key) ? '\n\nУже задано. Оставьте пустым, чтобы не менять.' : '';
    const res = ui.prompt(title, fields[i][1] + hint, ui.ButtonSet.OK_CANCEL);
    if (res.getSelectedButton() !== ui.Button.OK) return false;
    const v = res.getResponseText().trim();
    if (v) props.setProperty(key, v);
  }
  return true;
}

function promptVkKeys() {
  if (!promptProps_('VK Реклама', [
    ['VK_CLIENT_ID', 'client_id API VK Реклама:'],
    ['VK_CLIENT_SECRET', 'client_secret API VK Реклама:'],
    ['VK_AGENCY_CLIENT_NAME', 'Только для агентских ключей — логин клиента в агентстве (иначе пусто):'],
  ])) return;
  ['VK_ACCESS_TOKEN', 'VK_REFRESH_TOKEN', 'VK_TOKEN_EXPIRES', 'VK_MANUAL_TOKEN']
    .forEach(k => PropertiesService.getScriptProperties().deleteProperty(k));
  menuAds();
}

function promptYandexKeys() {
  if (!promptProps_('Яндекс Директ', [
    ['YANDEX_TOKEN', 'OAuth-токен Яндекс Директа:'],
    ['YANDEX_CLIENT_LOGINS', 'Логины рекламных кабинетов через запятую (для агентского аккаунта или если кабинетов несколько; иначе пусто):'],
  ])) return;
  menuAds();
}

function promptAvitoKeys() {
  if (!promptProps_('Авито', [
    ['AVITO_CLIENT_ID', 'client_id Авито (Профиль → Для профессионалов → API):'],
    ['AVITO_CLIENT_SECRET', 'client_secret Авито:'],
  ])) return;
  PropertiesService.getScriptProperties().deleteProperty('AVITO_TOKEN');
  menuAds();
}

function promptAmoKeys() {
  if (!promptProps_('амоCRM', [
    ['AMO_DOMAIN', 'Адрес аккаунта, например motoschool.amocrm.ru:'],
    ['AMO_TOKEN', 'Долгосрочный токен интеграции амоCRM:'],
  ])) return;
  menuAmo();
}

function promptMkKey() {
  if (!promptProps_('Мой Класс', [['MK_API_KEY', 'API-ключ Мой Класс (Настройки → API):']])) return;
  PropertiesService.getScriptProperties().deleteProperty('MK_TOKEN');
  menuMk();
}
