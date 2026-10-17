/* Демо-данные портала. Все названия вымышлены. */
window.DATA = (function () {
  const developers = [
    { id: 'aurum', name: 'Аурум Девелопмент', founded: 2004, projects: 0, about: 'Строит жильё бизнес- и премиум-класса в пределах Садового кольца и на западе Москвы. Специализация — клубные дома и квартальная застройка с благоустроенными дворами.' },
    { id: 'severstroy', name: 'Северная Линия', founded: 1998, projects: 0, about: 'Один из старейших девелоперов столичного региона. Масштабные жилые кварталы комфорт-класса с собственной социальной инфраструктурой.' },
    { id: 'gorizont', name: 'ГК Горизонт', founded: 2011, projects: 0, about: 'Компания делает ставку на технологичные дома: умные системы, энергоэффективные фасады, единое мобильное приложение для жителей.' },
    { id: 'kvartal', name: 'Квартал Групп', founded: 2008, projects: 0, about: 'Доступное жильё в Новой Москве и ближайшем Подмосковье. Отделка «под ключ» в каждом проекте.' },
    { id: 'monolit', name: 'Монолит Инвест', founded: 2001, projects: 0, about: 'Монолитное строительство полного цикла: от проектирования до управления домом. Комфорт- и бизнес-класс.' },
    { id: 'prime', name: 'Prime Estate', founded: 2015, projects: 0, about: 'Бутиковый девелопер премиальных резиденций и апартаментов с видом на Москву-реку и исторический центр.' },
    { id: 'rechnoy', name: 'Речной Порт Девелопмент', founded: 2012, projects: 0, about: 'Редевелопмент бывших промзон у воды: набережные, парки и жилые кварталы нового формата.' },
    { id: 'podmoskovie', name: 'Подмосковье-Строй', founded: 2006, projects: 0, about: 'Малоэтажные кварталы, таунхаусы и коттеджные посёлки в Московской области.' }
  ];

  const districts = ['ЦАО', 'ЗАО', 'САО', 'ЮАО', 'СЗАО', 'ЮВАО', 'СВАО', 'ЮЗАО', 'ВАО', 'Новая Москва'];
  const metros = ['Шелепиха', 'Технопарк', 'Савёловская', 'ЗИЛ', 'Мневники', 'Ховрино', 'Нагатинская', 'Раменки', 'Саларьево', 'Коммунарка', 'Лефортово', 'Аминьевская', 'Мякинино', 'Бутово', 'Котельники', 'Некрасовка'];
  const highways = ['Ленинградское', 'Дмитровское', 'Ярославское', 'Щёлковское', 'Новорижское', 'Калужское', 'Киевское', 'Каширское', 'Рублёво-Успенское', 'Минское'];
  const cities = ['Химки', 'Мытищи', 'Красногорск', 'Балашиха', 'Люберцы', 'Одинцово', 'Подольск', 'Королёв'];

  // [id, name, devId, location, district/city, metro, highway, class, quarter, year, pricePerM2 (тыс ₽, 0 = по запросу), buildingType, finish, parking, closedArea, transport, stage, hue, floors, type]
  const raw = [
    ['zolotoy-ostrov', 'Золотой Остров', 'prime', 'moscow', 'ЦАО', 'Технопарк', '', 'premium', 4, 2026, 1250, 'monolith-brick', 'none', true, true, 'metro', 'finishing', 38, 24, 'apartments'],
    ['nabereznaya-7', 'Набережная 7', 'rechnoy', 'moscow', 'ЗАО', 'Шелепиха', '', 'business', 2, 2027, 610, 'monolith', 'whitebox', true, true, 'mck', 'frame', 205, 42, 'flat'],
    ['severny-park', 'Северный Парк', 'severstroy', 'moscow', 'САО', 'Ховрино', 'Ленинградское', 'comfort', 1, 2027, 345, 'monolith', 'full', true, false, 'metro', 'frame', 150, 25, 'flat'],
    ['level-zil', 'Уровень ЗИЛ', 'gorizont', 'moscow', 'ЮАО', 'ЗИЛ', '', 'business', 3, 2026, 485, 'monolith', 'whitebox', true, true, 'mcd', 'finishing', 265, 33, 'flat'],
    ['mnevniki-riverside', 'Мнёвники Риверсайд', 'rechnoy', 'moscow', 'СЗАО', 'Мневники', '', 'business', 4, 2028, 540, 'monolith', 'whitebox', true, true, 'metro', 'foundation', 190, 38, 'flat'],
    ['kvartal-salaryevo', 'Квартал Саларьево', 'kvartal', 'newmoscow', 'Новая Москва', 'Саларьево', 'Киевское', 'econom', 2, 2026, 248, 'panel', 'full', false, false, 'metro', 'finishing', 120, 17, 'flat'],
    ['kommunarka-city', 'Коммунарка Сити', 'kvartal', 'newmoscow', 'Новая Москва', 'Коммунарка', 'Калужское', 'comfort', 4, 2027, 290, 'monolith', 'full', true, false, 'metro', 'frame', 95, 22, 'flat'],
    ['savelovsky-dom', 'Савёловский Дом', 'aurum', 'moscow', 'САО', 'Савёловская', 'Дмитровское', 'business', 1, 2026, 520, 'monolith-brick', 'whitebox', true, true, 'mck', 'finishing', 20, 28, 'flat'],
    ['patriki-club', 'Клубный дом Патриарший', 'aurum', 'moscow', 'ЦАО', 'Маяковская', '', 'premium', 3, 2027, 0, 'monolith-brick', 'none', true, true, 'metro', 'frame', 45, 9, 'flat'],
    ['nagatino-towers', 'Нагатино Тауэрс', 'monolit', 'moscow', 'ЮАО', 'Нагатинская', 'Каширское', 'comfort', 2, 2028, 365, 'monolith', 'full', true, false, 'mcd', 'foundation', 230, 31, 'flat'],
    ['ramenki-grand', 'Раменки Гранд', 'monolit', 'moscow', 'ЗАО', 'Раменки', 'Минское', 'business', 4, 2026, 455, 'monolith', 'whitebox', true, true, 'metro', 'finishing', 175, 27, 'flat'],
    ['lefortovo-loft', 'Лефортово Лофт', 'gorizont', 'moscow', 'ЮВАО', 'Лефортово', '', 'business', 3, 2027, 470, 'monolith-brick', 'whitebox', true, true, 'metro', 'frame', 10, 14, 'apartments'],
    ['aminyevo-park', 'Аминьево Парк', 'severstroy', 'moscow', 'ЗАО', 'Аминьевская', 'Минское', 'comfort', 1, 2028, 395, 'monolith', 'full', true, true, 'mck', 'foundation', 140, 24, 'flat'],
    ['butovo-green', 'Бутово Грин', 'kvartal', 'moscow', 'ЮЗАО', 'Бутово', 'Варшавское', 'econom', 4, 2026, 275, 'panel', 'full', false, false, 'metro', 'finishing', 110, 17, 'flat'],
    ['nekrasovka-sky', 'Некрасовка Скай', 'severstroy', 'moscow', 'ВАО', 'Некрасовка', '', 'econom', 2, 2027, 255, 'panel', 'full', true, false, 'metro', 'frame', 160, 25, 'flat'],
    ['himki-forest', 'Химки Форест', 'monolit', 'mo', 'Химки', 'Ховрино', 'Ленинградское', 'comfort', 3, 2026, 225, 'monolith', 'full', true, true, 'mcd', 'finishing', 130, 19, 'flat'],
    ['mytishchi-lake', 'Мытищи Лэйк', 'gorizont', 'mo', 'Мытищи', '', 'Ярославское', 'comfort', 1, 2027, 210, 'monolith', 'full', true, false, 'mcd', 'frame', 200, 16, 'flat'],
    ['krasnogorsk-bay', 'Красногорск Бэй', 'rechnoy', 'mo', 'Красногорск', 'Мякинино', 'Новорижское', 'business', 4, 2027, 305, 'monolith', 'whitebox', true, true, 'metro', 'frame', 215, 21, 'flat'],
    ['balashikha-park', 'Балашиха Парк', 'kvartal', 'mo', 'Балашиха', '', 'Щёлковское', 'econom', 2, 2026, 175, 'panel', 'full', false, false, 'mcd', 'finishing', 85, 14, 'flat'],
    ['lyubertsy-new', 'Новые Люберцы', 'podmoskovie', 'mo', 'Люберцы', 'Котельники', '', 'econom', 3, 2028, 185, 'panel', 'full', true, false, 'metro', 'foundation', 60, 17, 'flat'],
    ['odintsovo-hills', 'Одинцовские Холмы', 'podmoskovie', 'mo', 'Одинцово', '', 'Минское', 'comfort', 4, 2026, 215, 'monolith-brick', 'none', true, true, 'mcd', 'finishing', 100, 4, 'townhouse'],
    ['rublevo-village', 'Рублёво Виллидж', 'prime', 'mo', 'Одинцово', '', 'Рублёво-Успенское', 'premium', 2, 2027, 0, 'monolith-brick', 'none', true, true, 'mcd', 'frame', 30, 3, 'house'],
    ['podolsk-centr', 'Подольск Центральный', 'podmoskovie', 'mo', 'Подольск', '', 'Симферопольское', 'comfort', 1, 2029, 165, 'monolith', 'full', true, false, 'mcd', 'foundation', 250, 18, 'flat'],
    ['korolev-space', 'Королёв Спейс', 'gorizont', 'mo', 'Королёв', '', 'Ярославское', 'comfort', 3, 2029, 190, 'monolith', 'full', true, true, 'mcd', 'foundation', 180, 23, 'flat']
  ];

  const descriptions = {
    premium: 'Резиденция для тех, кто ценит приватность и статус. Камерная архитектура, авторские лобби, панорамное остекление и сервис уровня пятизвёздочного отеля.',
    business: 'Современный жилой комплекс с продуманной архитектурой, двором без машин, подземным паркингом и коммерческой инфраструктурой на первых этажах.',
    comfort: 'Сбалансированный проект для жизни семьёй: собственная школа и детский сад, просторные дворы, спортивные площадки и удобный выезд на магистрали.',
    econom: 'Доступные квартиры с готовой отделкой рядом с транспортом. Всё необходимое — магазины, поликлиника, школы — в пешей доступности.'
  };

  const rnd = (seed) => { let x = Math.sin(seed) * 10000; return x - Math.floor(x); };

  const complexes = raw.map((r, i) => {
    const [id, name, developer, location, area, metro, highway, cls, quarter, year, ppm, building, finish, parking, closed, transport, stage, hue, floors, type] = r;
    const isMoscow = location === 'moscow';
    const roomsAvail = cls === 'premium' ? [2, 3, 4, 5] : type === 'townhouse' || type === 'house' ? [3, 4, 5] : [0, 1, 2, 3, cls === 'econom' ? null : 4].filter((x) => x !== null);
    const baseArea = { 0: 24, 1: 38, 2: 56, 3: 78, 4: 110, 5: 160 };
    const mult = type === 'townhouse' ? 1.8 : type === 'house' ? 2.6 : cls === 'premium' ? 1.6 : 1;
    const layouts = roomsAvail.map((rooms, k) => {
      const areaFrom = Math.round(baseArea[rooms] * mult + rnd(i * 10 + k) * 6);
      return { rooms, areaFrom, priceFrom: ppm ? Math.round(areaFrom * ppm * 1000 * (1 + rnd(i + k) * 0.05)) : 0, count: 3 + Math.round(rnd(i * 7 + k) * 40) };
    });
    const minPrice = layouts.reduce((m, l) => (l.priceFrom && (!m || l.priceFrom < m) ? l.priceFrom : m), 0);
    const low = type === 'townhouse' || type === 'house';
    const pad = (n) => String(n).padStart(2, '0');
    const main = low ? 'house-' + pad(type === 'townhouse' ? 1 : 2) : 'ext-' + pad((i % 12) + 1);
    const second = low ? 'house-' + pad(type === 'townhouse' ? 3 : 4) : 'ext-' + pad(((i + 5) % 12) + 1);
    const photos = [main, second, 'int-' + pad((i % 7) + 1), 'int-' + pad(((i + 3) % 7) + 1)];
    // Координаты: центр Москвы ± смещение, область — дальше от центра
    const spread = location === 'moscow' ? 0.12 : location === 'newmoscow' ? 0.2 : 0.35;
    const lat = 55.7558 + (rnd(i * 11) - 0.5) * spread * 1.4;
    const lng = 37.6173 + (rnd(i * 17) - 0.5) * spread * 2.2;
    return {
      id, name, developer,
      code: id.replace(/[^a-z]/g, '').slice(0, 3).toUpperCase() + '-' + pad(i + 1),
      coords: `${lat.toFixed(3)}°N ${lng.toFixed(3)}°E`,
      energy: { premium: 'A+', business: 'A', comfort: 'B+', econom: 'B' }[cls],
      photos, location, area, metro, highway, cls, quarter, year, building, finish, parking, closed, transport, stage, hue, floors, type,
      pricePerM2: ppm * 1000,
      minPrice,
      layouts,
      insideMkad: isMoscow && !['Бутово', 'Некрасовка'].includes(metro),
      metroMinutes: metro ? 4 + Math.round(rnd(i * 3) * 14) : 0,
      isNew: i % 3 === 0,
      description: descriptions[cls],
      flats: layouts.reduce((s, l) => s + l.count, 0)
    };
  });

  developers.forEach((d) => { d.projects = complexes.filter((c) => c.developer === d.id).length; });

  const articles = [
    { id: 'n1', kind: 'news', date: '2026-10-15', title: 'Спрос на новостройки бизнес-класса в Москве вырос на 12% за квартал', lead: 'Аналитики фиксируют оживление рынка после стабилизации ключевой ставки: покупатели возвращаются к сделкам в проектах с высокой стадией готовности.', tag: 'Рынок' },
    { id: 'n2', kind: 'news', date: '2026-10-13', title: 'В Новой Москве откроют три станции метро до конца 2027 года', lead: 'Строительство продлится в районах Коммунарки и Саларьево — это повысит транспортную доступность новых жилых кварталов.', tag: 'Инфраструктура' },
    { id: 'n3', kind: 'news', date: '2026-10-10', title: 'Девелоперы увеличили долю квартир с отделкой до 64%', lead: 'Готовая отделка становится стандартом в комфорт-классе: покупатели экономят время и средства на ремонт.', tag: 'Тренды' },
    { id: 'n4', kind: 'news', date: '2026-10-07', title: 'Семейная ипотека: какие изменения вступят в силу с января', lead: 'Правительство уточнило условия льготной программы — разбираемся, кого коснутся новые правила.', tag: 'Ипотека' },
    { id: 'n5', kind: 'news', date: '2026-10-03', title: 'На месте бывшей промзоны у реки появится парк площадью 18 га', lead: 'Проект редевелопмента включает набережную, жилые кварталы и культурный кластер.', tag: 'Город' },
    { id: 'a1', kind: 'article', date: '2026-10-14', title: 'Как выбрать новостройку: чек-лист из 15 пунктов', lead: 'От проверки застройщика и проектной декларации до оценки транспортной доступности и качества двора.', tag: 'Гид' },
    { id: 'a2', kind: 'article', date: '2026-10-09', title: 'Монолит, панель или кирпич: в чём разница и что выбрать', lead: 'Сравниваем технологии строительства по шумоизоляции, теплу, долговечности и свободе планировок.', tag: 'Разбор' },
    { id: 'a3', kind: 'article', date: '2026-10-05', title: 'White box или чистовая отделка: что выгоднее в 2026 году', lead: 'Считаем бюджет и сроки ремонта в обоих сценариях на примере двухкомнатной квартиры.', tag: 'Финансы' },
    { id: 'a4', kind: 'article', date: '2026-09-29', title: 'Апартаменты против квартир: юридические нюансы', lead: 'Прописка, налоги, коммунальные платежи и инфраструктура — всё, что стоит знать до покупки.', tag: 'Право' },
    { id: 'a5', kind: 'article', date: '2026-09-22', title: 'Пять районов Москвы, где цены вырастут быстрее рынка', lead: 'Где строят метро, парки и деловые центры — и почему это важно для инвестора.', tag: 'Инвестиции' }
  ];

  const articleBody = [
    'Рынок новостроек Москвы и Подмосковья продолжает меняться. Покупатели становятся требовательнее: важны не только цена и локация, но и качество среды — дворы, сервисы, транспортная доступность.',
    'Эксперты советуют начинать выбор с проверки застройщика: изучить его завершённые проекты, соблюдение сроков, наличие проектной декларации и разрешения на строительство. Все эти документы публикуются в открытом доступе.',
    'Следующий шаг — оценка локации. Время в пути до метро и работы, наличие школ, детских садов и поликлиник, планы развития района. Стоит обратить внимание на генеральный план и программы реновации поблизости.',
    'Наконец, имеет значение стадия строительства. На этапе котлована цена ниже, но риски выше. Ближе к сдаче стоимость растёт, зато можно оценить качество дома своими глазами.',
    'Мы регулярно обновляем каталог и публикуем аналитику, чтобы помочь вам принять взвешенное решение. Если остались вопросы — оставьте заявку, и эксперт свяжется с вами.'
  ];

  const labels = {
    cls: { econom: 'Эконом', comfort: 'Комфорт', business: 'Бизнес', premium: 'Премиум' },
    building: { 'monolith-brick': 'Монолитно-кирпичный', monolith: 'Монолитный', panel: 'Панельный' },
    finish: { none: 'Без отделки', whitebox: 'White box', full: 'Чистовая' },
    location: { moscow: 'Москва', mo: 'Московская область', newmoscow: 'Новая Москва' },
    transport: { metro: 'Метро', mck: 'МЦК', mcd: 'МЦД' },
    stage: { foundation: 'Котлован', frame: 'Строится каркас', finishing: 'Отделочные работы' },
    type: { flat: 'Квартиры', apartments: 'Апартаменты', townhouse: 'Таунхаусы', house: 'Дома' },
    rooms: { 0: 'Студия', 1: '1-комн.', 2: '2-комн.', 3: '3-комн.', 4: '4-комн.', 5: '5+ комн.' }
  };

  const articlePhotos = ['ext-08', 'ext-11', 'int-03', 'int-06', 'ext-05', 'ext-02', 'ext-10', 'int-02', 'int-05', 'ext-12'];
  articles.forEach((a, i) => { a.photo = articlePhotos[i % articlePhotos.length]; });

  return { developers, complexes, articles, articleBody, labels, districts, metros, highways, cities };
})();
