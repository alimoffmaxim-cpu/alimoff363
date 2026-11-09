/**
 * Сквозная аналитика школы мотокросса в Google Таблице.
 *
 * Реклама (VK Реклама, Яндекс Директ, Авито + ручной лист) → лиды амоCRM →
 * пробные, повторные тренировки, абонементы и оплаты в «Мой Класс».
 * Всё сводится на листе `fact`, а сводки и дашборд считаются формулами.
 *
 * СЕКРЕТОВ В КОДЕ НЕТ И БЫТЬ НЕ ДОЛЖНО: ключи вводятся через меню
 * «Дашборд → Ключи доступа» и хранятся в Свойствах скрипта.
 */

const CFG = {
  // Час ежедневного обновления (по часовому поясу проекта)
  TRIGGER_HOUR: 6,
  // Уровень статистики VK: 'campaigns' — группы объявлений, 'ad_plans' — кампании
  VK_LEVEL: 'campaigns',
  VK_API: 'https://ads.vk.com/api/v2',
  YANDEX_API: 'https://api.direct.yandex.com/json/v5/reports',
  AVITO_API: 'https://api.avito.ru',
  MK_API: 'https://api.moyklass.com/v1/company',
  MK_PAGE: 100,
  METRIKA_API: 'https://api-metrika.yandex.net/management/v1',
  // Сколько строк держать в сводках
  ROWS_CHANNELS: 30,
  ROWS_CAMPAIGNS: 150,
  ROWS_MONTHS: 36,
  ROWS_DAYS: 370,
};

const SHEETS = {
  dash: 'Дашборд',
  byChannel: 'Сводка_каналы',
  byCampaign: 'Сводка_кампании',
  byMonth: 'Сводка_месяцы',
  byDay: 'Сводка_дни',
  settings: 'Настройки',
  adsManual: 'Реклама_вручную',
  costs: 'Расходы',
  fact: 'fact',
  clients: 'Клиенты_каналы',
  ads: 'raw_ads',
  amo: 'raw_amo',
  mkClients: 'raw_mk_clients',
  mkVisits: 'raw_mk_visits',
  mkSubs: 'raw_mk_subs',
  mkPays: 'raw_mk_payments',
  tilda: 'raw_tilda',
  metrika: 'Метрика_цели',
  chartData: 'Данные_графиков',
  log: 'Лог',
  debug: 'debug',
};

const HEAD = {
  ads: ['Дата', 'Площадка', 'Кабинет', 'ID кампании', 'Кампания', 'Показы', 'Клики', 'Расход', 'Лиды (кабинет)'],
  adsManual: ['Дата', 'Канал', 'Кампания', 'Расход', 'Комментарий'],
  costs: ['Месяц', 'Статья', 'Сумма', 'Комментарий'],
  amo: ['ID сделки', 'Создана', 'Воронка', 'Статус', 'Название', 'Бюджет',
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'Источник', 'Теги', 'Телефон'],
  mkClients: ['ID ученика', 'Имя', 'Телефон', 'Создан'],
  mkVisits: ['ID записи', 'Дата', 'ID ученика', 'ID занятия', 'Пробное', 'Пришёл'],
  mkSubs: ['ID', 'Дата продажи', 'ID ученика', 'ID вида абонемента', 'Абонемент', 'Занятий', 'Цена'],
  mkPays: ['ID', 'Дата', 'ID ученика', 'Тип операции', 'Сумма', 'Комментарий'],
  tilda: ['Получена', 'ID заявки', 'Форма', 'Страница', 'Имя', 'Телефон', 'Email',
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'Все поля', 'ClientID Метрики', 'yclid'],
  fact: ['Дата', 'Событие', 'Канал', 'Кампания', 'Кол-во', 'Сумма', 'Объект', 'ID ученика'],
  clients: ['ID ученика', 'Имя', 'Телефон', 'Канал', 'Кампания', 'Сопоставлен по', 'Первое обращение',
    'Пробные', 'Повторные', 'Абонементы', 'Выручка, ₽', 'Реклама'],
  metrika: ['Событие амо', 'ID сделки', 'Цель', 'Телефон', 'ClientID Метрики', 'yclid', 'Отправлено', 'Результат'],
  log: ['Время', 'Задача', 'Результат'],
};

// События листа fact
const EV = { spend: 'расход', lead: 'лид', adLead: 'лид_кабинет', impr: 'показы', click: 'клики', siteLead: 'заявка_сайт', trial: 'пробное', repeat: 'повторная', sub: 'абонемент', pay: 'оплата' };
const NO_CHANNEL = 'Не определён';
const NO_LEAD = 'Без заявки';

// Параметры на листе «Настройки» (колонки H:J): код, значение по умолчанию, пояснение
const PARAMS = [
  ['AMO_PIPELINES', '', 'Воронки амо, сделки которых считаются лидами, через запятую. Пусто — все воронки'],
  ['AMO_EXCLUDE_STATUSES', 'Спам, Дубль', 'Статусы амо, которые не считаются лидами, через запятую'],
  ['AMO_SOURCE_FIELD', 'Источник', 'Название поля сделки амо, где записан источник (если есть)'],
  ['INITIAL_DAYS', 180, 'Сколько дней истории грузить при первой загрузке'],
  ['LOOKBACK_DAYS', 30, 'Сколько последних дней перезагружать при каждом обновлении'],
  ['YANDEX_VAT', 'да', 'Расход Яндекс Директа с НДС (да/нет)'],
  ['YANDEX_GOALS', '', 'Яндекс Директ: ID целей Метрики для лидов, через запятую. Пусто — цели из настроек кампаний'],
  ['YANDEX_ATTRIBUTION', 'AUTO', 'Яндекс Директ: модель атрибуции конверсий, как в кабинете: AUTO, LSC, LC, FC, LYDC, LYDCCD (только при заданных YANDEX_GOALS)'],
  ['AVITO_SPEND', 'списание', 'Авито: слова в типе операции, которые считаются расходом, через запятую'],
  ['MK_INCOME', 'income', 'Мой Класс: типы платежей — приход (выручка)'],
  ['MK_REFUND', 'refund', 'Мой Класс: типы платежей — возврат (вычитается из выручки)'],
  ['MK_ONLY_ADS', 'да', 'Мой Класс: учитывать пробные, покупки и выручку только учеников из рекламных каналов (да/нет)'],
  ['AMO_TAGGING', 'да', 'амоCRM: ставить новым сделкам тег источника (да/нет)'],
  ['METRIKA_STATUS_BOOKED', 'Записан на пробное', 'амоCRM: этап, при переходе на который в Метрику уходит цель trial_booked'],
  ['METRIKA_STATUS_VISITED', 'Посетил пробное', 'амоCRM: этап, при переходе на который в Метрику уходит цель trial_visited'],
  ['AMO_UNKNOWN_TAG', 'Источник не определён', 'амоCRM: тег, если источник не найден за 30 минут. Пусто — не ставить'],
];

// Поля, по которым могут срабатывать правила каналов. «кампания» есть и у расходов, и у лидов:
// для лида это кампания из utm_campaign (ID из кабинета заменяется названием).
const RULE_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'источник', 'теги', 'воронка', 'статус', 'название сделки', 'площадка', 'кабинет', 'кампания', 'id кампании', 'форма', 'страница'];

// Правила по умолчанию. Срабатывает первое подходящее, поэтому «Макс» стоит выше Яндекса.
const DEFAULT_RULES = [
  ['кампания', 'макс', 'Макс'],
  ['кампания', 'max', 'Макс'],
  ['utm_campaign', 'max', 'Макс'],
  ['utm_source', 'max', 'Макс'],
  ['utm_source', 'vk', 'VK Реклама'],
  ['utm_source', 'yandex', 'Яндекс Директ'],
  ['utm_source', 'avito', 'Авито'],
  ['utm_source', 'telegram', 'Telegram'],
  ['utm_source', 'google', 'Google Ads'],
  ['utm_source', 'facebook', 'Facebook / Instagram'],
  ['utm_source', 'tg', 'Telegram'],
  ['источник', 'макс', 'Макс'],
  ['источник', 'вк', 'VK Реклама'],
  ['источник', 'vk', 'VK Реклама'],
  ['источник', 'яндекс', 'Яндекс Директ'],
  ['источник', 'авито', 'Авито'],
  ['источник', 'телеграм', 'Telegram'],
  ['теги', 'авито', 'Авито'],
  ['воронка', 'авито', 'Авито'],
];

// Типы абонементов Мой Класс: «название содержит» → тип
const SUB_TYPES = ['разовая', 'абонемент', 'пробное', 'не учитывать'];
const DEFAULT_SUB_RULES = [
  ['пробн', 'пробное'],
  ['разов', 'разовая'],
];

const DAY_MS = 24 * 3600 * 1000;

// Метки клика, которые рекламные системы сами добавляют к ссылке (если UTM-меток нет):
// параметр → [utm_source, utm_medium]
const CLICK_IDS = [
  ['yclid', 'yandex', 'cpc'],     // Яндекс Директ
  ['ybaip', 'yandex', 'cpc'],
  ['_openstat', 'yandex', 'cpc'],
  ['rb_clickid', 'vk', 'cpc'],    // VK Реклама
  ['gclid', 'google', 'cpc'],     // Google Ads
  ['fbclid', 'facebook', 'social'],
];

// Ежедневное обновление: одна задача по очереди выполняет шаги (функции из 01_menu)
const DAILY_STEPS = ['jobAds', 'jobAmo', 'jobMk', 'jobFacts'];
// Старые отдельные триггеры по шагам и вспомогательный триггер продолжения
const JOB_TRIGGERS = ['jobDaily', 'jobDailyContinue', 'jobAmoTags', 'jobMetrika'].concat(DAILY_STEPS);

// Цели Метрики (тип «JavaScript-событие») ← параметр с названием этапа амо
const METRIKA_GOALS = [['trial_booked', 'METRIKA_STATUS_BOOKED'], ['trial_visited', 'METRIKA_STATUS_VISITED']];
// Метрика принимает офлайн-конверсии по визитам не старше 21 дня
const METRIKA_MAX_DAYS = 21;

// Теги источника для сделок амо без рекламных меток: по сайту, с которого пришёл посетитель
const ORGANIC = { yandex: 'Органика Яндекс', google: 'Органика Google', social: 'Соцсети',
  site: 'Переход с сайта', direct: 'Прямой заход' };
const ORGANIC_REFERRERS = [
  [/(^|\.)(yandex\.[a-z.]+|ya\.ru)$/, ORGANIC.yandex],
  [/(^|\.)google\.[a-z.]+$/, ORGANIC.google],
  [/(^|\.)(vk\.com|vk\.ru|ok\.ru|t\.me|telegram\.org|instagram\.com|facebook\.com|dzen\.ru|youtube\.com|rutube\.ru)$/, ORGANIC.social],
];
// Сколько минут ждать заявку Тильды к сделке, прежде чем поставить «Источник не определён»
const AMO_TAG_WAIT_MIN = 30;

// ---------- Формулы сводок ----------
// Все верхнеуровневые константы собраны в этом файле,
// поэтому порядок файлов в редакторе Apps Script не важен.

const FROM = "'" + SHEETS.dash + "'!$B$3";
const TO = "'" + SHEETS.dash + "'!$B$4";
const PERIOD = ',fact!$A:$A,">="&' + FROM + ',fact!$A:$A,"<="&' + TO;

const div_ = (a, b) => 'IFERROR(' + a + '/' + b + ',"")';

// Колонки сводок. sum: [колонка fact, событие]; calc: формула из ссылок на ячейки строки.
const METRICS = [
  { key: 'spend', h: 'Расход, ₽', sum: ['F', EV.spend] },
  { key: 'impr', h: 'Показы', sum: ['E', EV.impr] },
  { key: 'clicks', h: 'Клики', sum: ['E', EV.click] },
  { key: 'ctr', h: 'CTR', calc: c => div_(c.clicks, c.impr), fmt: '0.00%' },
  { key: 'cpc', h: 'Цена клика, ₽', calc: c => div_(c.spend, c.clicks), fmt: '#,##0.0' },
  { key: 'siteLeads', h: 'Лиды (Тильда по меткам)', sum: ['E', EV.siteLead] },
  { key: 'cplSite', h: 'Цена лида, ₽', calc: c => div_(c.spend, c.siteLeads) },
  { key: 'crLead', h: 'CR клик → лид', calc: c => div_(c.siteLeads, c.clicks), fmt: '0.0%' },
  { key: 'leads', h: 'Сделки амо', sum: ['E', EV.lead] },
  { key: 'cpl', h: 'Цена сделки, ₽', calc: c => div_(c.spend, c.leads) },
  { key: 'trials', h: 'Пробные (пришли)', sum: ['E', EV.trial] },
  { key: 'crTrial', h: 'CR лид → пробное', calc: c => div_(c.trials, c.siteLeads), fmt: '0.0%' },
  { key: 'repeat', h: 'Повторные тренировки', sum: ['E', EV.repeat] },
  { key: 'subs', h: 'Абонементы', sum: ['E', EV.sub] },
  { key: 'crSub', h: 'CR пробное → абонемент', calc: c => div_(c.subs, c.trials), fmt: '0.0%' },
  { key: 'revenue', h: 'Выручка, ₽', sum: ['F', EV.pay] },
  { key: 'margin', h: 'Выручка − реклама, ₽', calc: c => c.revenue + '-' + c.spend },
  { key: 'drr', h: 'ДРР', calc: c => div_(c.spend, c.revenue), fmt: '0.0%' },
  { key: 'romi', h: 'ROMI', calc: c => div_('(' + c.revenue + '-' + c.spend + ')', c.spend), fmt: '0%' },
];

// Для месяцев — плюс постоянные расходы и чистая прибыль
const COSTS = "'" + SHEETS.costs + "'";
const MONTH_EXTRA = [
  { key: 'costs', h: 'Прочие расходы, ₽',
    raw: (r, total) => total ? 'SUM(' + COSTS + '!$C:$C)'
      : 'SUMIFS(' + COSTS + '!$C:$C,' + COSTS + '!$A:$A,">="&$A' + r + ',' + COSTS + '!$A:$A,"<"&EDATE($A' + r + ',1))' },
  { key: 'profit', h: 'Чистая прибыль, ₽', calc: c => c.revenue + '-' + c.spend + '-' + c.costs },
];

const periodTitle_ = t => '="' + t + ': "&TEXT(' + FROM + ',"dd.mm.yyyy")&" — "&TEXT(' + TO + ',"dd.mm.yyyy")';
const inPeriod_ = 'fact!A2:A>=' + FROM + ',fact!A2:A<=' + TO;
