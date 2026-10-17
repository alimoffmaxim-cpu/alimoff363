window.initPage = function () {
  const D = window.DATA, L = D.labels, UI = window.UI;
  const C = D.complexes;

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
  const stats = [
    [C.length, UI.fmt.plural(C.length, ['объект', 'объекта', 'объектов']) + ' в продаже', 'catalog.html'],
    [D.developers.length, UI.fmt.plural(D.developers.length, ['застройщик', 'застройщика', 'застройщиков']), 'developers.html'],
    [C.filter((c) => c.insideMkad).length, 'внутри МКАД', 'catalog.html?mkad=1'],
    [C.filter((c) => c.location === 'newmoscow').length, 'в Новой Москве', 'catalog.html?location=newmoscow']
  ];
  document.getElementById('stats').innerHTML = stats.map(([n, l, h]) =>
    `<a class="stat" href="${h}"><div class="stat__num">${n}</div><div class="stat__label">${l}</div></a>`).join('');

  // Новые объекты
  document.getElementById('new-objects').innerHTML = C.filter((c) => c.isNew).slice(0, 6).map(UI.complexCard).join('');

  // Подборки
  const groups = [
    ['По сроку сдачи', [2026, 2027, 2028, 2029].map((y) => [`Сдача в ${y}`, `year=${y}`])],
    ['По классу', Object.entries(L.cls).map(([k, v]) => [v, `cls=${k}`])],
    ['По локации', Object.entries(L.location).map(([k, v]) => [v, `location=${k}`])],
    ['По транспорту', Object.entries(L.transport).map(([k, v]) => [`Рядом с ${v}`, `transport=${k}`])],
    ['По цене', [7, 10, 15, 25].map((m) => [`До ${m} млн ₽`, `pmax=${m}`])],
    ['Популярное', [['Подземный паркинг', 'parking=1'], ['Закрытая территория', 'closed=1'], ['С отделкой', 'finish=full'], ['Монолитные дома', 'building=monolith'], ['Таунхаусы', 'type=townhouse']]]
  ];
  document.getElementById('quick').innerHTML = groups.map(([t, items]) => `
    <div class="quick-group reveal">
      <div class="quick-group__title">${t}</div>
      <div class="chips">${items.map(([l, q]) => `<a class="chip" href="catalog.html?${q}">${l}</a>`).join('')}</div>
    </div>`).join('');

  // Новости
  const news = D.articles.slice().sort((a, b) => b.date.localeCompare(a.date));
  document.getElementById('home-news').innerHTML = UI.newsCard(news[0], true) + news.slice(1, 5).map((a) => UI.newsCard(a)).join('');

  // Гео-навигация
  const geo = {
    'Округа': ['district', D.districts],
    'Метро': ['metro', D.metros],
    'Шоссе': ['highway', D.highways],
    'Города МО': ['area', D.cities]
  };
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
      const n = C.filter((c) => (key === 'district' || key === 'area' ? c.area : c[key]) === v).length;
      const q = key === 'district' ? 'area' : key;
      return `<a href="catalog.html?${q}=${encodeURIComponent(v)}">${key === 'metro' ? 'м. ' : ''}${UI.esc(v)}${key === 'highway' ? ' ш.' : ''} <span class="gold">${n || ''}</span></a>`;
    }).join('');
  }
  tabs.innerHTML = Object.keys(geo).map((k) => `<button class="tab" type="button" role="tab" data-name="${k}">${k}</button>`).join('');
  tabs.addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (t) show(t.dataset.name); });
  show('Округа');
};
