/* Демо-данные портала: Алматы и Астана. Все ЖК, застройщики и цены вымышлены. */
window.DATA = (function () {
  const cities = {
    almaty: {
      id: 'almaty', name: 'Алматы', inName: 'в Алматы', region: 'Алматинская область',
      phone: '+7 (727) 350-45-67', center: [43.238, 76.946],
      office: 'Алматы, Бостандыкский район, пр. Аль-Фараби',
      districts: ['Алмалинский', 'Ауэзовский', 'Бостандыкский', 'Жетысуский', 'Медеуский', 'Наурызбайский', 'Турксибский', 'Алатауский'],
      metros: ['Райымбек батыра', 'Жибек Жолы', 'Алмалы', 'Абая', 'Байконур', 'Драмтеатр им. Ауэзова', 'Алатау', 'Сайран', 'Москва', 'Сарыарка', 'Бауыржан Момышулы'],
      streets: ['Аль-Фараби', 'Абая', 'Достык', 'Райымбека', 'Толе би', 'Саина', 'Рыскулова'],
      suburbs: ['Каскелен', 'Талгар', 'Иргели', 'Отеген батыр', 'Бесагаш'],
      transport: ['metro', 'brt', 'bus'],
      prime: 'Выше Аль-Фараби',
      seismic: '9 баллов'
    },
    astana: {
      id: 'astana', name: 'Астана', inName: 'в Астане', region: 'Акмолинская область',
      phone: '+7 (7172) 79-45-67', center: [51.128, 71.430],
      office: 'Астана, Есильский район, пр. Мангилик Ел',
      districts: ['Есильский', 'Алматинский', 'Сарыаркинский', 'Байконурский', 'Нура'],
      metros: [],
      streets: ['Мангилик Ел', 'Кабанбай батыра', 'Туран', 'Республики', 'Сарайшык', 'Тауелсиздик', 'Сейфуллина'],
      suburbs: ['Косшы', 'Коянды', 'Талапкер'],
      transport: ['lrt', 'bus'],
      prime: 'Левый берег',
      seismic: ''
    }
  };

  const developers = [
    { id: 'alatau', name: 'Алатау Девелопмент', founded: 2005, about: 'Строит резиденции бизнес- и премиум-класса в предгорьях Алматы. Камерные дома с видом на горы, закрытые дворы и подземные паркинги.' },
    { id: 'zhetysu', name: 'Жетысу Құрылыс', founded: 1999, about: 'Один из старейших девелоперов Алматы. Жилые кварталы в центре города с коммерцией на первых этажах и благоустроенными дворами.' },
    { id: 'nomad', name: 'Nomad Homes', founded: 2014, about: 'Технологичные дома с умными системами, энергоэффективными фасадами и единым мобильным приложением для жителей. Работает в Алматы и Астане.' },
    { id: 'dala', name: 'Дала Групп', founded: 2009, about: 'Комфортное жильё для семей: собственные школы и детские сады, просторные дворы, отделка «под ключ». Проекты в Алматы и пригородах.' },
    { id: 'kokterek', name: 'Көктерек Строй', founded: 2003, about: 'Монолитное строительство полного цикла, от проектирования до управления домом. Особое внимание сейсмостойкости конструкций.' },
    { id: 'shanyrak', name: 'Шаңырақ Инвест', founded: 2011, about: 'Доступное жильё в Алматы, Астане и пригородах. Квартиры с чистовой отделкой и рассрочкой от застройщика.' },
    { id: 'yesil', name: 'Есиль Девелопмент', founded: 2007, about: 'Жилые комплексы на левом берегу Астаны: набережные Есиля, деловой центр, парки и прогулочные бульвары.' },
    { id: 'nura', name: 'Нұра Билд', founded: 2013, about: 'Бизнес-класс в Астане: высотные дома с панорамными окнами, тёплыми паркингами и закрытыми дворами для суровой зимы.' }
  ];

  // [id, name, devId, city, location, area, metro, street, class, quarter, year, ₸/м² (тыс., 0 = по запросу), building, finish, parking, closed, transport, stage, floors, type, prime]
  const raw = [
    ['tau-samal', 'Тау Самал', 'alatau', 'almaty', 'city', 'Медеуский', '', 'Достык', 'premium', 4, 2026, 2100, 'frame', 'rough', 1, 1, 'bus', 'finishing', 12, 'flat', 1],
    ['abai-avenue', 'Абай Авеню', 'zhetysu', 'almaty', 'city', 'Алмалинский', 'Байконур', 'Абая', 'business', 3, 2026, 1250, 'frame', 'prefinish', 1, 1, 'metro', 'finishing', 18, 'flat', 0],
    ['almaly-city', 'Алмалы Сити', 'nomad', 'almaty', 'city', 'Алмалинский', 'Алмалы', 'Толе би', 'business', 1, 2027, 1150, 'frame', 'prefinish', 1, 0, 'metro', 'frame', 21, 'flat', 0],
    ['sairan-lake', 'Сайран Лэйк', 'dala', 'almaty', 'city', 'Ауэзовский', 'Сайран', 'Толе би', 'comfort', 4, 2026, 780, 'frame', 'full', 1, 1, 'metro', 'finishing', 16, 'flat', 0],
    ['auezov-park', 'Ауэзов Парк', 'kokterek', 'almaty', 'city', 'Ауэзовский', 'Москва', 'Абая', 'comfort', 2, 2027, 720, 'frame', 'full', 1, 0, 'metro', 'frame', 14, 'flat', 0],
    ['zhetysu-park', 'Жетысу Парк', 'zhetysu', 'almaty', 'city', 'Жетысуский', 'Райымбек батыра', 'Райымбека', 'comfort', 3, 2027, 650, 'frame', 'prefinish', 1, 0, 'metro', 'frame', 12, 'flat', 0],
    ['alatau-residence', 'Алатау Резиденс', 'alatau', 'almaty', 'city', 'Бостандыкский', '', 'Аль-Фараби', 'premium', 2, 2027, 0, 'frame', 'rough', 1, 1, 'bus', 'frame', 16, 'apartments', 1],
    ['turksib-garden', 'Турксиб Гарден', 'shanyrak', 'almaty', 'city', 'Турксибский', '', 'Рыскулова', 'econom', 1, 2026, 520, 'panel', 'full', 0, 0, 'brt', 'finishing', 9, 'flat', 0],
    ['nauryzbay-green', 'Наурызбай Грин', 'dala', 'almaty', 'city', 'Наурызбайский', '', 'Саина', 'econom', 4, 2027, 480, 'frame', 'full', 1, 0, 'bus', 'frame', 10, 'flat', 0],
    ['medeu-hills', 'Медеу Хиллс', 'kokterek', 'almaty', 'city', 'Медеуский', '', 'Достык', 'business', 3, 2028, 1400, 'brick', 'rough', 1, 1, 'bus', 'foundation', 7, 'flat', 1],
    ['alatau-smart', 'Алатау Смарт', 'nomad', 'almaty', 'city', 'Алатауский', '', 'Рыскулова', 'econom', 2, 2028, 450, 'panel', 'full', 0, 0, 'brt', 'foundation', 12, 'flat', 0],
    ['gorny-sad', 'Горный Сад', 'alatau', 'almaty', 'city', 'Бостандыкский', '', 'Аль-Фараби', 'premium', 1, 2027, 1600, 'brick', 'rough', 1, 1, 'bus', 'frame', 3, 'townhouse', 1],
    ['kaskelen-park', 'Каскелен Парк', 'shanyrak', 'almaty', 'suburb', 'Каскелен', '', 'Райымбека', 'econom', 3, 2026, 380, 'panel', 'full', 1, 0, 'bus', 'finishing', 9, 'flat', 0],
    ['talgar-village', 'Талгар Вилладж', 'dala', 'almaty', 'suburb', 'Талгар', '', '', 'comfort', 4, 2027, 420, 'brick', 'rough', 1, 1, 'bus', 'frame', 2, 'house', 0],
    ['yesil-river', 'Есиль Ривер', 'yesil', 'astana', 'city', 'Есильский', '', 'Мангилик Ел', 'premium', 4, 2026, 1450, 'frame', 'rough', 1, 1, 'lrt', 'finishing', 22, 'flat', 1],
    ['turan-towers', 'Туран Тауэрс', 'nura', 'astana', 'city', 'Есильский', '', 'Туран', 'business', 2, 2027, 880, 'frame', 'prefinish', 1, 1, 'lrt', 'frame', 25, 'flat', 1],
    ['kabanbay-city', 'Кабанбай Сити', 'shanyrak', 'astana', 'city', 'Есильский', '', 'Кабанбай батыра', 'business', 3, 2026, 820, 'frame', 'prefinish', 1, 1, 'lrt', 'finishing', 18, 'flat', 1],
    ['nura-park', 'Нура Парк', 'nura', 'astana', 'city', 'Нура', '', 'Тауелсиздик', 'comfort', 1, 2027, 560, 'frame', 'full', 1, 0, 'bus', 'frame', 16, 'flat', 1],
    ['baikonur-kvartal', 'Байконур Квартал', 'yesil', 'astana', 'city', 'Байконурский', '', 'Республики', 'comfort', 4, 2026, 520, 'frame', 'full', 1, 0, 'bus', 'finishing', 12, 'flat', 0],
    ['saryarka-life', 'Сарыарка Лайф', 'shanyrak', 'astana', 'city', 'Сарыаркинский', '', 'Сейфуллина', 'econom', 2, 2027, 430, 'panel', 'full', 0, 0, 'lrt', 'frame', 12, 'flat', 0],
    ['dostar-city', 'Достар Сити', 'nomad', 'astana', 'city', 'Алматинский', '', 'Тауелсиздик', 'econom', 3, 2026, 410, 'panel', 'full', 0, 0, 'bus', 'finishing', 10, 'flat', 0],
    ['sarayshyk-residence', 'Сарайшык Резиденс', 'nura', 'astana', 'city', 'Есильский', '', 'Сарайшык', 'premium', 2, 2028, 0, 'frame', 'rough', 1, 1, 'bus', 'foundation', 14, 'apartments', 1],
    ['kosshy-new', 'Косшы Нью', 'shanyrak', 'astana', 'suburb', 'Косшы', '', 'Республики', 'econom', 1, 2027, 330, 'panel', 'full', 0, 0, 'bus', 'frame', 9, 'flat', 0],
    ['talapker-house', 'Талапкер Хаус', 'yesil', 'astana', 'suburb', 'Талапкер', '', '', 'comfort', 3, 2026, 360, 'brick', 'rough', 1, 1, 'bus', 'finishing', 2, 'townhouse', 0]
  ];

  const descriptions = {
    premium: 'Резиденция для тех, кто ценит приватность и статус. Камерная архитектура, авторские лобби, панорамное остекление и сервис уровня пятизвёздочного отеля.',
    business: 'Современный жилой комплекс с продуманной архитектурой, двором без машин, подземным паркингом и коммерческой инфраструктурой на первых этажах.',
    comfort: 'Сбалансированный проект для жизни семьёй: школа и детский сад рядом, просторные дворы, спортивные площадки и удобный выезд на главные проспекты.',
    econom: 'Доступные квартиры с чистовой отделкой рядом с транспортом. Магазины, поликлиника и школы в пешей доступности.'
  };

  const rnd = (seed) => { const x = Math.sin(seed) * 10000; return x - Math.floor(x); };
  const pad = (n) => String(n).padStart(2, '0');

  const complexes = raw.map((r, i) => {
    const [id, name, developer, city, location, area, metro, street, cls, quarter, year, ppm, building, finish, parking, closed, transport, stage, floors, type, prime] = r;
    const low = type === 'townhouse' || type === 'house';
    const roomsAvail = cls === 'premium' && !low ? [2, 3, 4, 5] : low ? [3, 4, 5] : [0, 1, 2, 3, cls === 'econom' ? null : 4].filter((x) => x !== null);
    const baseArea = { 0: 28, 1: 40, 2: 60, 3: 84, 4: 115, 5: 165 };
    const mult = type === 'townhouse' ? 1.8 : type === 'house' ? 2.6 : cls === 'premium' ? 1.5 : 1;
    const layouts = roomsAvail.map((rooms, k) => {
      const areaFrom = Math.round(baseArea[rooms] * mult + rnd(i * 10 + k) * 6);
      return { rooms, areaFrom, priceFrom: ppm ? Math.round(areaFrom * ppm * 1000 * (1 + rnd(i + k) * 0.05)) : 0, count: 3 + Math.round(rnd(i * 7 + k) * 40) };
    });
    const minPrice = layouts.reduce((m, l) => (l.priceFrom && (!m || l.priceFrom < m) ? l.priceFrom : m), 0);
    const main = low ? 'house-' + pad(type === 'townhouse' ? 1 : 2) : 'ext-' + pad((i % 12) + 1);
    const second = low ? 'house-' + pad(type === 'townhouse' ? 3 : 4) : 'ext-' + pad(((i + 5) % 12) + 1);
    const c0 = cities[city].center;
    const spread = location === 'city' ? 0.08 : 0.3;
    const lat = c0[0] + (rnd(i * 11) - 0.5) * spread;
    const lng = c0[1] + (rnd(i * 17) - 0.5) * spread * 1.6;
    return {
      id, name, developer, city, location, area, metro, street, cls, quarter, year, building, finish, transport, stage, floors, type,
      parking: !!parking, closed: !!closed, prime: !!prime,
      code: id.replace(/[^a-z]/g, '').slice(0, 3).toUpperCase() + '-' + pad(i + 1),
      coords: `${lat.toFixed(3)}°N ${lng.toFixed(3)}°E`,
      energy: { premium: 'A+', business: 'A', comfort: 'B+', econom: 'B' }[cls],
      photos: [main, second, 'int-' + pad((i % 7) + 1), 'int-' + pad(((i + 3) % 7) + 1)],
      pricePerM2: ppm * 1000,
      minPrice,
      layouts,
      metroMinutes: metro ? 4 + Math.round(rnd(i * 3) * 12) : 0,
      isNew: i % 3 === 0,
      description: descriptions[cls],
      flats: layouts.reduce((s, l) => s + l.count, 0)
    };
  });

  developers.forEach((d) => {
    const own = complexes.filter((c) => c.developer === d.id);
    d.projects = own.length;
    d.cities = [...new Set(own.map((c) => c.city))];
  });

  const articles = [
    { id: 'n1', kind: 'news', date: '2026-10-15', city: 'almaty', title: 'В Алматы растёт спрос на квартиры с видом на горы', lead: 'Покупатели всё чаще выбирают проекты выше Аль-Фараби и в предгорьях, даже с учётом более высокой цены за квадратный метр.', tag: 'Рынок' },
    { id: 'n2', kind: 'news', date: '2026-10-13', city: 'astana', title: 'Левый берег Астаны: где строят больше всего жилья', lead: 'Разбираем, какие кварталы Есильского района и Нуры активнее всего застраиваются и что там появится в ближайшие годы.', tag: 'Город' },
    { id: 'n3', kind: 'news', date: '2026-10-10', city: '', title: 'Застройщики чаще сдают квартиры с чистовой отделкой', lead: 'Готовая отделка становится стандартом в комфорт-классе: покупатели экономят время и деньги на ремонте.', tag: 'Тренды' },
    { id: 'n4', kind: 'news', date: '2026-10-07', city: '', title: 'Как работает рассрочка от застройщика', lead: 'Первоначальный взнос, сроки, удорожание и риски: что важно проверить в договоре перед подписанием.', tag: 'Финансы' },
    { id: 'n5', kind: 'news', date: '2026-10-03', city: 'almaty', title: 'Метро и БРТ: как транспорт меняет цены в Алматы', lead: 'Квартиры у станций метро и линий БРТ дорожают быстрее рынка. Смотрим, какие районы выигрывают.', tag: 'Инфраструктура' },
    { id: 'a1', kind: 'article', date: '2026-10-14', city: '', title: 'Как выбрать новостройку: чек-лист из 15 пунктов', lead: 'От проверки застройщика и разрешительных документов до оценки транспортной доступности и качества двора.', tag: 'Гид' },
    { id: 'a2', kind: 'article', date: '2026-10-09', city: 'almaty', title: 'Сейсмостойкость: что проверить при покупке квартиры в Алматы', lead: 'Конструктив, расчётная балльность и экспертиза проекта. Объясняем, какие документы запросить у застройщика.', tag: 'Разбор' },
    { id: 'a3', kind: 'article', date: '2026-10-05', city: '', title: 'Черновая, предчистовая или чистовая отделка: что выгоднее', lead: 'Считаем бюджет и сроки ремонта в каждом сценарии на примере двухкомнатной квартиры.', tag: 'Финансы' },
    { id: 'a4', kind: 'article', date: '2026-09-29', city: 'astana', title: 'Зима в Астане: на что смотреть в новостройке', lead: 'Утепление фасада, тёплый паркинг, тамбуры и отопление: что действительно важно в климате столицы.', tag: 'Гид' },
    { id: 'a5', kind: 'article', date: '2026-09-22', city: '', title: 'Ипотека или рассрочка: как выбрать способ покупки', lead: 'Сравниваем переплату, требования к покупателю и гибкость условий. Плюс жилищные программы, о которых стоит спросить в банке.', tag: 'Ипотека' }
  ];
  const articlePhotos = ['ext-08', 'ext-11', 'int-03', 'int-06', 'ext-05', 'ext-02', 'ext-10', 'int-02', 'int-05', 'ext-12'];
  articles.forEach((a, i) => { a.photo = articlePhotos[i % articlePhotos.length]; });

  const articleBody = [
    'Рынок новостроек Алматы и Астаны продолжает меняться. Покупатели становятся требовательнее: важны не только цена и район, но и качество среды — дворы, сервисы, транспорт.',
    'Эксперты советуют начинать выбор с проверки застройщика: изучить его завершённые проекты, соблюдение сроков, разрешение на строительство и гарантии долевого участия. Эти документы застройщик обязан предоставить по запросу.',
    'Следующий шаг — оценка локации. Время в пути до работы, школы и детские сады рядом, планы развития района. В Алматы стоит учитывать и высоту над уровнем города: выше — чище воздух и виды на горы.',
    'Наконец, имеет значение стадия строительства. На этапе котлована цена ниже, но риски выше. Ближе к сдаче стоимость растёт, зато можно оценить качество дома своими глазами.',
    'Мы регулярно обновляем каталог и публикуем аналитику, чтобы помочь вам принять взвешенное решение. Если остались вопросы, оставьте заявку, и эксперт свяжется с вами.'
  ];

  const labels = {
    cls: { econom: 'Эконом', comfort: 'Комфорт', business: 'Бизнес', premium: 'Премиум' },
    building: { frame: 'Монолитно-каркасный', brick: 'Кирпичный', panel: 'Панельный' },
    finish: { rough: 'Черновая', prefinish: 'Предчистовая', full: 'Чистовая' },
    location: { city: 'В городе', suburb: 'Пригород' },
    transport: { metro: 'Метро', brt: 'БРТ', lrt: 'ЛРТ', bus: 'Автобус' },
    stage: { foundation: 'Котлован', frame: 'Строится каркас', finishing: 'Отделочные работы' },
    type: { flat: 'Квартиры', apartments: 'Апартаменты', townhouse: 'Таунхаусы', house: 'Дома' },
    rooms: { 0: 'Студия', 1: '1-комн.', 2: '2-комн.', 3: '3-комн.', 4: '4-комн.', 5: '5+ комн.' }
  };

  // Текущий город: ?city=… или сохранённый выбор, по умолчанию Алматы
  function currentCity() {
    const q = new URLSearchParams(location.search).get('city');
    if (cities[q]) { setCity(q); return q; }
    try { const s = localStorage.getItem('klyuch-city'); if (cities[s]) return s; } catch (e) { /* хранилище недоступно */ }
    return 'almaty';
  }
  function setCity(id) {
    try { localStorage.setItem('klyuch-city', id); } catch (e) { /* хранилище недоступно */ }
  }

  return { cities, developers, complexes, articles, articleBody, labels, currentCity, setCity };
})();
