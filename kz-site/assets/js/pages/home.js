window.initPage = function () {
  const D = window.DATA, L = D.labels, UI = window.UI;
  const CITY = UI.CITY;
  const C = D.complexes.filter((c) => c.city === CITY.id);
  const count = (fn) => C.filter(fn).length;

  document.title = `Ключ — новостройки ${CITY.id === 'almaty' ? 'Алматы' : 'Астаны'}`;
  document.getElementById('hero-label').innerHTML = `<b>●</b> Каталог новостроек · ${CITY.name}`;

  // Комнатность
  document.getElementById('hero-rooms').innerHTML = [0, 1, 2, 3, 4, 5].map((r) =>
    `<input type="checkbox" id="hr${r}" value="${r}"><label for="hr${r}">${r === 0 ? 'Ст' : r === 5 ? '5+' : r}</label>`).join('');

  document.getElementById('hero-search').addEventListener('submit', (e) => {
    e.preventDefault();
    const p = new URLSearchParams();
    const rooms = [...document.querySelectorAll('#hero-rooms input:checked')].map((i) => i.value);
    if (rooms.length) p.set('rooms', rooms.join(','));
    const pmin = document.getElementById('pmin').value, pmax = document.getElementById('pmax').value;
    if (pmin) p.set('pmin', pmin);
    if (pmax) p.set('pmax', pmax);
    location.href = 'catalog.html' + (p.toString() ? '?' + p : '');
  });

  // Статистика
  const devCount = new Set(C.map((c) => c.developer)).size;
  const stats = [
    [C.length, UI.fmt.plural(C.length, ['объект', 'объекта', 'объектов']) + ' в продаже', 'catalog.html'],
    [devCount, UI.fmt.plural(devCount, ['застройщик', 'застройщика', 'застройщиков']), 'developers.html'],
    [count((c) => c.prime), CITY.prime.toLowerCase(), 'catalog.html?prime=1']
  ];
  document.getElementById('stats').innerHTML = stats.map(([n, l, h]) =>
    `<a href="${h}"><strong>${n}</strong><span>${l}</span></a>`).join('');

  // Объект недели: самые дорогие проекты города
  const featured = C.filter((c) => (c.type === 'flat' || c.type === 'apartments') && c.pricePerM2)
    .sort((a, b) => b.pricePerM2 - a.pricePerM2).slice(0, 4);
  const box = document.getElementById('feature');
  let fi = 0;
  function showFeature() {
    const c = featured[fi];
    const dev = UI.devById(c.developer);
    box.innerHTML = `
      ${UI.photo(c.photos[0], 'ЖК ' + c.name, '', true)}
      <span class="tag tag--tl">${c.code} · ${c.coords}</span>
      <div class="feature__nav">
        <span class="mono">${String(fi + 1).padStart(2, '0')} / ${String(featured.length).padStart(2, '0')}</span>
        <button type="button" data-dir="-1" aria-label="Предыдущий объект">←</button>
        <button type="button" data-dir="1" aria-label="Следующий объект">→</button>
      </div>
      <span class="dim"><span>${c.floors} этажей</span></span>
      <a class="feature__cap" href="complex.html?id=${c.id}">
        <div>
          <div class="label" style="margin-bottom:12px"><b>●</b> Объект недели</div>
          <h2>${UI.esc(c.name)}</h2>
          <div class="feature__meta mono"><span>${UI.esc(dev.name)}</span><span>${L.cls[c.cls]}</span><span>${UI.fmt.quarter(c)}</span><span>${c.metro ? 'м. ' + UI.esc(c.metro) : UI.esc(c.area)}</span></div>
        </div>
        <div class="feature__price"><span class="mono muted">Цена за м²</span><strong>${c.pricePerM2 ? Math.round(c.pricePerM2 / 1000).toLocaleString('ru-RU') + ' тыс. ₸' : 'По запросу'}</strong></div>
      </a>`;
  }
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-dir]');
    if (!b) return;
    fi = (fi + Number(b.dataset.dir) + featured.length) % featured.length;
    showFeature();
  });
  showFeature();

  // Новые объекты
  const fresh = C.filter((c) => c.id !== featured[0].id).sort((a, b) => b.isNew - a.isNew).slice(0, 5);
  document.getElementById('new-count').innerHTML = `<b>${fresh.length}</b> из ${C.length} · ${CITY.name}`;
  document.getElementById('new-objects').innerHTML = fresh.map(UI.complexCard).join('');

  // Подборки со счётчиками
  const years = [...new Set(C.map((c) => c.year))].sort();
  const groups = [
    ['Срок сдачи', years.map((y) => [`Сдача в ${y}`, `year=${y}`, count((c) => c.year === y)])],
    ['Класс жилья', Object.entries(L.cls).map(([k, v]) => [v, `cls=${k}`, count((c) => c.cls === k)])],
    ['Локация', CITY.transport.map((k) => [`Рядом с ${L.transport[k]}`, `transport=${k}`, count((c) => c.transport === k)])
      .concat([[CITY.prime, 'prime=1', count((c) => c.prime)], ['Пригород', 'location=suburb', count((c) => c.location === 'suburb')]])],
    ['Популярное', [['Подземный паркинг', 'parking=1', count((c) => c.parking)], ['Закрытый двор', 'closed=1', count((c) => c.closed)], ['С чистовой отделкой', 'finish=full', count((c) => c.finish === 'full')], ['Таунхаусы', 'type=townhouse', count((c) => c.type === 'townhouse')], ['Дома', 'type=house', count((c) => c.type === 'house')]].filter((x) => x[2])]
  ];
  document.getElementById('quick').innerHTML = groups.map(([t, items]) => `
    <div class="pick-group">
      <h3>${t}</h3>
      ${items.map(([l, q, n]) => `<a href="catalog.html?${q}"><span>${l}</span><span>${String(n).padStart(2, '0')}</span></a>`).join('')}
    </div>`).join('');

  // Журнал: сначала материалы про этот город и общие
  const news = D.articles.filter((a) => !a.city || a.city === CITY.id).sort((a, b) => b.date.localeCompare(a.date));
  const top = news[0];
  document.getElementById('home-news').innerHTML = `
    <a class="news-feature reveal" href="article.html?id=${top.id}">
      ${UI.photo(top.photo, '')}
      <div class="news-card__top mono"><span class="news-card__tag">${UI.esc(top.tag)}</span><span>${UI.fmt.dateShort(top.date)}</span></div>
      <h3>${UI.esc(top.title)}</h3>
      <p>${UI.esc(top.lead)}</p>
    </a>
    <div class="news-list">${news.slice(1, 5).map(UI.newsRow).join('')}</div>`;

  // Индекс районов
  const geo = { 'Районы': ['area', CITY.districts] };
  if (CITY.metros.length) geo['Метро'] = ['metro', CITY.metros];
  geo['Улицы и проспекты'] = ['street', CITY.streets];
  geo['Пригороды'] = ['area', CITY.suburbs];
  const tabs = document.getElementById('geo-tabs');
  const list = document.getElementById('geo-list');
  function show(name) {
    const [key, items] = geo[name];
    tabs.querySelectorAll('.tab').forEach((t) => {
      const on = t.dataset.name === name;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on);
    });
    list.innerHTML = items.map((v) => {
      const n = count((c) => c[key] === v);
      const label = key === 'metro' ? 'м. ' + v : key === 'area' && name === 'Районы' ? (v.endsWith('ский') ? v + ' район' : 'Район ' + v) : v;
      return `<a href="catalog.html?${key}=${encodeURIComponent(v)}"><span>${UI.esc(label)}</span><span class="n">${String(n).padStart(2, '0')}</span></a>`;
    }).join('');
  }
  tabs.innerHTML = Object.keys(geo).map((k) => `<button class="tab" type="button" role="tab" data-name="${k}">${k}</button>`).join('');
  tabs.addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (t) show(t.dataset.name); });
  show('Районы');

  document.getElementById('about-city').textContent = CITY.id === 'almaty'
    ? 'В Алматы мы отмечаем проекты выше Аль-Фараби и в предгорьях, указываем расчётную сейсмостойкость и расстояние до станций метро и линий БРТ.'
    : 'В Астане мы отмечаем проекты левого берега, указываем близость к линии ЛРТ и набережным Есиля, а также то, что важно для зимы: тёплый паркинг и утеплённые фасады.';
};
