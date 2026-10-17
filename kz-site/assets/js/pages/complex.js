window.initPage = function () {
  const D = window.DATA, L = D.labels, UI = window.UI;
  const app = document.getElementById('app');
  const c = D.complexes.find((x) => x.id === UI.params().get('id'));

  if (!c) {
    app.innerHTML = `<div class="container section"><div class="empty"><h3>Объект не найден</h3><p>Возможно, он снят с продажи.</p><a class="btn btn--gold" style="margin-top:28px" href="catalog.html">В каталог <span class="arr">→</span></a></div></div>`;
    return;
  }
  document.title = `ЖК «${c.name}» — Ключ`;
  const dev = UI.devById(c.developer);
  const city = D.cities[c.city];

  const specs = [
    ['Код лота', c.code],
    ['Срок сдачи', `${c.quarter} кв. ${c.year}`],
    ['Класс', L.cls[c.cls]],
    ['Конструктив', L.building[c.building]],
    ['Этажность', `до ${c.floors}`],
    ['Отделка', L.finish[c.finish]],
    ['Стадия', L.stage[c.stage]],
    ['Паркинг', c.parking ? 'Подземный' : 'Наземный'],
    ['Территория', c.closed ? 'Закрытая' : 'Открытая'],
    ['Энергоэффективность', c.energy],
    city.seismic ? ['Сейсмостойкость', city.seismic] : [city.prime, c.prime ? 'Да' : 'Нет'],
    ['Координаты', c.coords]
  ];

  const similar = D.complexes.filter((x) => x.id !== c.id && x.city === c.city && (x.cls === c.cls || x.location === c.location)).slice(0, 3);

  app.innerHTML = `
    <div class="container">
      <div class="breadcrumbs" style="margin:32px 0 20px"><a href="index.html">Главная</a><span>/</span><a href="catalog.html">Новостройки</a><span>/</span><span>${UI.esc(c.name)}</span></div>
      <div class="complex-hero" id="main-shot">
        ${UI.photo(c.photos[0], 'ЖК ' + c.name, '', true)}
        <span class="tag tag--tl">${c.code}</span>
        <span class="tag tag--tr">${c.coords}</span>
        <span class="dim"><span>${c.floors} этажей</span></span>
      </div>
      <div class="thumbs" id="thumbs">${c.photos.map((p, i) => `<button class="t ${i === 0 ? 'is-active' : ''}" type="button" data-i="${i}" aria-label="Фото ${i + 1}">${UI.photo(p, '', 's')}</button>`).join('')}</div>

      <div class="complex-title">
        <div>
          <div class="label" style="margin-bottom:20px">${c.isNew ? '<b>● Новинка</b> · ' : ''}${L.cls[c.cls]} · ${UI.fmt.quarter(c)}</div>
          <h1>${UI.esc(c.name)}</h1>
          <div class="addr mono">${c.metro ? `<span>м. ${UI.esc(c.metro)} · ${c.metroMinutes} мин пешком</span>` : ''}<span>${UI.esc(c.area)}</span>${c.street ? `<span>${UI.esc(c.street)}</span>` : ''}<span>${city.name}</span></div>
        </div>
        <div class="price">
          <span class="mono">Стоимость</span>
          <strong>${c.minPrice ? 'от ' + UI.fmt.money(c.minPrice) : 'По запросу'}</strong>
          <span class="mono">${UI.fmt.perM2(c.pricePerM2)}</span>
        </div>
      </div>

      <div class="complex-layout">
        <div>
          <h2 class="block-title">О проекте</h2>
          <div class="prose"><p>${UI.esc(c.description)}</p><p>Застройщик — ${UI.esc(dev.name)}. ${UI.esc(dev.about)}</p></div>

          <h2 class="block-title">Спецификация <span class="label">${specs.length} параметров</span></h2>
          <div class="specs">${specs.map(([k, v]) => `<div class="spec"><small>${k}</small>${UI.esc(v)}</div>`).join('')}</div>

          <h2 class="block-title">Квартиры и цены <span class="label">${c.flats} в продаже</span></h2>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Тип</th><th>Площадь</th><th>Стоимость</th><th>Лотов</th><th></th></tr></thead>
            <tbody>${c.layouts.map((l) => `
              <tr>
                <td>${L.rooms[Math.min(l.rooms, 5)]}</td>
                <td class="num">от ${l.areaFrom} м²</td>
                <td class="num">${l.priceFrom ? 'от ' + UI.fmt.money(l.priceFrom) : 'По запросу'}</td>
                <td class="num muted">${String(l.count).padStart(2, '0')}</td>
                <td style="text-align:right"><button class="btn btn--ghost btn--sm" type="button" data-callback data-title="${L.rooms[Math.min(l.rooms, 5)]} в ЖК «${UI.esc(c.name)}»" data-subtitle="Пришлём планировки и актуальные цены.">Планировки</button></td>
              </tr>`).join('')}</tbody>
          </table></div>

          <h2 class="block-title">Расположение</h2>
          <div class="specs specs--2">
            <div class="spec"><small>Город</small>${c.location === 'suburb' ? city.region : city.name}</div>
            <div class="spec"><small>${c.location === 'suburb' ? 'Населённый пункт' : 'Район'}</small>${UI.esc(c.area)}</div>
            <div class="spec"><small>${c.metro ? 'Метро' : 'Улица'}</small>${c.metro ? 'м. ' + UI.esc(c.metro) + ', ' + c.metroMinutes + ' мин' : UI.esc(c.street || '—')}</div>
            <div class="spec"><small>Транспорт</small>${L.transport[c.transport]}</div>
          </div>
        </div>

        <aside class="aside-card">
          <a class="dev-mini" href="developer.html?id=${dev.id}">
            <span class="dev-logo" style="width:52px;height:52px;font-size:20px">${dev.name[0]}</span>
            <span><span class="mono muted">Застройщик</span><br>${UI.esc(dev.name)}</span>
          </a>
          <h3>Узнать о скидках</h3>
          <p class="muted" style="font-size:15px">Пришлём планировки, актуальные цены и условия рассрочки.</p>
          <form data-lead="Получить предложение" novalidate style="display:grid;gap:18px"></form>
        </aside>
      </div>
    </div>

    <section class="section rule">
      <div class="container">
        <div class="section-head"><div class="label">Подборка</div><div class="section-head__side"><h2>Похожие объекты</h2><a class="link-arrow" href="catalog.html?cls=${c.cls}">Класс «${L.cls[c.cls]}» →</a></div></div>
        <div class="grid grid--3">${similar.map(UI.complexCard).join('')}</div>
      </div>
    </section>`;

  const form = app.querySelector('form[data-lead]');
  form.innerHTML = UI.leadForm(form.dataset.lead);
  UI.bindLeadForm(form, (n) => { form.innerHTML = UI.successHtml(n); });

  const main = document.getElementById('main-shot');
  document.getElementById('thumbs').addEventListener('click', (e) => {
    const t = e.target.closest('.t');
    if (!t) return;
    document.querySelectorAll('#thumbs .t').forEach((x) => x.classList.toggle('is-active', x === t));
    main.querySelector('.media').outerHTML = UI.photo(c.photos[t.dataset.i], 'ЖК ' + c.name, '', true);
  });
};
