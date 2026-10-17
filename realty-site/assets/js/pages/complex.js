window.initPage = function () {
  const D = window.DATA, L = D.labels, UI = window.UI;
  const app = document.getElementById('app');
  const c = D.complexes.find((x) => x.id === UI.params().get('id'));

  if (!c) {
    app.innerHTML = `<div class="container section"><div class="empty"><h3>Объект не найден</h3><p>Возможно, он снят с продажи.</p><a class="btn btn--gold" style="margin-top:20px" href="catalog.html">В каталог</a></div></div>`;
    return;
  }
  document.title = `ЖК «${c.name}» — Ключ`;
  const dev = UI.devById(c.developer);
  const shots = [0, 1, 2, 3].map((k) => UI.placeholder((c.hue + k * 18) % 360, c.name.length + c.floors + k * 7, c.type === 'townhouse' || c.type === 'house' ? 'low' : ''));

  const specs = [
    ['Срок сдачи', `${c.quarter} кв. ${c.year}`],
    ['Класс', L.cls[c.cls]],
    ['Тип дома', L.building[c.building]],
    ['Этажность', `до ${c.floors}`],
    ['Отделка', L.finish[c.finish]],
    ['Стадия', L.stage[c.stage]],
    ['Паркинг', c.parking ? 'Подземный' : 'Наземный'],
    ['Территория', c.closed ? 'Закрытая' : 'Открытая'],
    ['Квартир в продаже', c.flats]
  ];

  const similar = D.complexes.filter((x) => x.id !== c.id && (x.cls === c.cls || x.location === c.location)).slice(0, 3);

  app.innerHTML = `
    <div class="container">
      <div class="breadcrumbs" style="margin-top:32px"><a href="index.html">Главная</a><span>/</span><a href="catalog.html">Новостройки</a><span>/</span><span>${UI.esc(c.name)}</span></div>
      <div class="complex-hero" id="main-shot">
        ${shots[0]}
        <div class="complex-hero__info">
          <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
            ${c.isNew ? '<span class="badge badge--gold">Новинка</span>' : ''}<span class="badge">${L.cls[c.cls]}</span><span class="badge">${UI.fmt.term(c)}</span>
          </div>
          <h1>ЖК «${UI.esc(c.name)}»</h1>
          <p class="muted" style="margin-top:10px">${c.metro ? 'м. ' + UI.esc(c.metro) + ' · ' + c.metroMinutes + ' мин пешком · ' : ''}${UI.esc(c.area)}${c.highway ? ' · ' + UI.esc(c.highway) + ' шоссе' : ''}</p>
        </div>
      </div>
      <div class="thumbs" id="thumbs">${shots.map((s, i) => `<button class="t ${i === 0 ? 'is-active' : ''}" type="button" data-i="${i}" aria-label="Фото ${i + 1}">${s}</button>`).join('')}</div>

      <div class="complex-layout">
        <div>
          <h2 class="block-title">О проекте</h2>
          <div class="prose"><p>${UI.esc(c.description)}</p><p>Застройщик — ${UI.esc(dev.name)}. ${UI.esc(dev.about)}</p></div>

          <h2 class="block-title">Характеристики</h2>
          <div class="specs">${specs.map(([k, v]) => `<div class="spec"><small>${k}</small>${UI.esc(v)}</div>`).join('')}</div>

          <h2 class="block-title">Квартиры и цены</h2>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Тип</th><th>Площадь</th><th>Стоимость</th><th>В продаже</th><th></th></tr></thead>
            <tbody>${c.layouts.map((l) => `
              <tr>
                <td>${L.rooms[Math.min(l.rooms, 5)]}</td>
                <td>от ${l.areaFrom} м²</td>
                <td><strong>${l.priceFrom ? 'от ' + UI.fmt.money(l.priceFrom) : 'По запросу'}</strong></td>
                <td class="muted">${l.count} ${UI.fmt.plural(l.count, ['вариант', 'варианта', 'вариантов'])}</td>
                <td><button class="btn btn--ghost btn--sm" type="button" data-callback data-title="${L.rooms[Math.min(l.rooms, 5)]} в ЖК «${UI.esc(c.name)}»" data-subtitle="Пришлём планировки и актуальные цены.">Планировки</button></td>
              </tr>`).join('')}</tbody>
          </table></div>

          <h2 class="block-title">Расположение</h2>
          <div class="specs" style="grid-template-columns:repeat(2,1fr)">
            <div class="spec"><small>Регион</small>${L.location[c.location]}</div>
            <div class="spec" style="border-right:0"><small>Район / город</small>${UI.esc(c.area)}</div>
            <div class="spec" style="border-bottom:0"><small>Метро</small>${c.metro ? 'м. ' + UI.esc(c.metro) + ', ' + c.metroMinutes + ' мин' : '—'}</div>
            <div class="spec" style="border:0"><small>Транспорт</small>${L.transport[c.transport]}${c.highway ? ', ' + UI.esc(c.highway) + ' ш.' : ''}</div>
          </div>
        </div>

        <aside class="aside-card">
          <span class="muted" style="font-size:14px">Стоимость</span>
          <div class="price-big">${c.minPrice ? 'от ' + UI.fmt.money(c.minPrice) : 'По запросу'}</div>
          <div class="muted">${UI.fmt.perM2(c.pricePerM2)}</div>
          <hr style="border:0;border-top:1px solid var(--line);width:100%;margin:6px 0">
          <a href="developer.html?id=${dev.id}" style="display:flex;gap:12px;align-items:center">
            <span class="dev-logo" style="width:48px;height:48px;font-size:18px;border-radius:12px">${dev.name[0]}</span>
            <span><small class="muted">Застройщик</small><br>${UI.esc(dev.name)}</span>
          </a>
          <h3 style="font-size:22px;margin-top:10px">Узнать о скидках</h3>
          <form data-lead="Получить предложение" novalidate></form>
        </aside>
      </div>
    </div>

    <section class="section" style="background:var(--bg-2)">
      <div class="container">
        <div class="section-head"><h2>Похожие объекты</h2><a class="link-arrow" href="catalog.html?cls=${c.cls}">Все в классе «${L.cls[c.cls]}» →</a></div>
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
    main.querySelector('.ph').outerHTML = shots[t.dataset.i];
  });
};
