function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Дашборд')
    .addItem('Обновить всё', 'menuUpdateAll')
    .addSeparator()
    .addItem('Обновить рекламу', 'menuAds')
    .addItem('Перезагрузить рекламу полностью', 'menuAdsFull')
    .addItem('Обновить амоCRM', 'menuAmo')
    .addItem('Обновить Мой Класс', 'menuMk')
    .addItem('Пересобрать сводку (fact)', 'menuFacts')
    .addItem('Подключить Тильду (заявки с сайта)', 'menuTilda')
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
      .addItem('Метрики VK за 7 дней', 'debugVkMetrics')
      .addItem('Тестовая заявка Тильды', 'debugTildaTest'))
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

/**
 * Ежедневное обновление одним запуском: реклама → амоCRM → Мой Класс → сводка.
 * Ошибка одного шага не останавливает остальные. Если до лимита Apps Script (6 минут)
 * остаётся мало времени, оставшиеся шаги продолжатся отдельным запуском через минуту.
 */
function jobDaily() { runDailyFrom_(0); }

function jobDailyContinue() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'jobDailyContinue')
    .forEach(t => ScriptApp.deleteTrigger(t));
  runDailyFrom_(Number(prop_('DAILY_NEXT_STEP') || 0));
}

function runDailyFrom_(start) {
  const props = PropertiesService.getScriptProperties();
  const began = Date.now();
  const errors = [];
  const run = { jobAds: jobAds, jobAmo: jobAmo, jobMk: jobMk, jobFacts: jobFacts };
  for (let i = start; i < DAILY_STEPS.length; i++) {
    if (i > start && Date.now() - began > 4 * 60 * 1000) {
      props.setProperty('DAILY_NEXT_STEP', String(i));
      ScriptApp.newTrigger('jobDailyContinue').timeBased().after(60 * 1000).create();
      log_('Обновление', 'продолжится через минуту с шага ' + DAILY_STEPS[i]);
      return;
    }
    try {
      run[DAILY_STEPS[i]]();
    } catch (e) {
      errors.push(DAILY_STEPS[i] + ': ' + e.message);
    }
  }
  props.deleteProperty('DAILY_NEXT_STEP');
  // Ошибка в конце — чтобы Google прислал письмо о сбое (подробности уже в «Логе»)
  if (errors.length) throw new Error(errors.join('; '));
}

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

/** Удаляет всю рекламу с raw_ads и грузит заново за INITIAL_DAYS (нужно после добавления новых колонок). */
function menuAdsFull() {
  const ui = SpreadsheetApp.getUi();
  const ok = ui.alert('Перезагрузить рекламу', 'Лист raw_ads будет очищен и загружен заново за ' +
    params_().INITIAL_DAYS + ' дней. Продолжить?', ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEETS.ads);
  if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  withFacts_('Реклама', updateAds);
}
function menuFacts() { alert_(runJob_('Сводка', rebuildFacts)); }

/**
 * Включает ежедневное обновление: один триггер jobDaily. Старые отдельные триггеры по шагам
 * удаляются. Если всё уже настроено, ничего не меняет. Возвращает число созданных триггеров.
 */
function ensureTriggers_() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.filter(t => DAILY_STEPS.indexOf(t.getHandlerFunction()) >= 0).forEach(t => ScriptApp.deleteTrigger(t));
  if (triggers.some(t => t.getHandlerFunction() === 'jobDaily')) return 0;
  ScriptApp.newTrigger('jobDaily').timeBased().everyDays(1).atHour(CFG.TRIGGER_HOUR).create();
  return 1;
}

/** Меню: пересоздаёт триггеры и показывает расписание. */
function setupTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(t => JOB_TRIGGERS.indexOf(t.getHandlerFunction()) >= 0)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ensureTriggers_();
  alert_('Ежедневное обновление включено: каждый день около ' + CFG.TRIGGER_HOUR + ':00 по очереди обновляются ' +
    'реклама, амоCRM, Мой Класс и сводка.');
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
  ensureTriggers_();
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
