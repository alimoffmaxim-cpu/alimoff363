/* Общие компоненты: шапка, подвал, модалка заявки, карточки, утилиты. */
(function () {
  const D = window.DATA;
  const L = D.labels;
  // На странице ЖК текущим становится город этого ЖК
  if (/complex\.html$/.test(location.pathname)) {
    const own = D.complexes.find((c) => c.id === new URLSearchParams(location.search).get('id'));
    if (own) D.setCity(own.city);
  }
  const CITY = D.cities[D.currentCity()];
  const PHONE = CITY.phone;
  const TEL = PHONE.replace(/[^\d+]/g, '');

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const fmt = {
    money(v) {
      if (!v) return 'Цена по запросу';
      if (v >= 1e6) return (v / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' млн ₸';
      return Math.round(v).toLocaleString('ru-RU') + ' ₸';
    },
    perM2(v) { return v ? 'от ' + Math.round(v / 1000).toLocaleString('ru-RU') + ' тыс. ₸/м²' : 'Цена по запросу'; },
    quarter(c) { return `${c.year}·Q${c.quarter}`; },
    term(c) { return `Срок сдачи ${c.quarter} кв. ${c.year}`; },
    date(s) { return new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); },
    dateShort(s) { return new Date(s).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }); },
    plural(n, forms) { const a = Math.abs(n) % 100, b = a % 10; return forms[a > 10 && a < 20 ? 2 : b > 1 && b < 5 ? 1 : b === 1 ? 0 : 2]; }
  };

  // Фото с общим тонированием. size: 's' — карточки, '' — крупные кадры.
  function photo(name, alt, size, eager) {
    const src = `assets/img/${name}${size === 's' ? '-s' : ''}.jpg`;
    return `<div class="media"><img src="${src}" alt="${esc(alt || '')}" ${eager ? '' : 'loading="lazy"'} decoding="async"></div>`;
  }

  const devById = (id) => D.developers.find((d) => d.id === id);

  function complexCard(c) {
    const dev = devById(c.developer);
    const spec = [
      c.metro ? `м. ${esc(c.metro)} ${c.metroMinutes}′` : esc(c.area),
      `${c.floors} эт.`,
      L.finish[c.finish]
    ];
    return `
      <a class="card reveal" href="complex.html?id=${c.id}">
        <div class="media-wrap">
          ${photo(c.photos[0], 'ЖК ' + c.name, 's')}
          <span class="tag tag--tl">${c.code}</span>
          <span class="tag tag--tr ${c.isNew ? 'tag--gold' : ''}">${c.isNew ? 'Новинка' : fmt.quarter(c)}</span>
          <span class="vf"></span>
        </div>
        <div class="card__body">
          <div class="card__row"><h3 class="card__title">${esc(c.name)}</h3><span class="card__cls mono">${L.cls[c.cls]}</span></div>
          <div class="card__dev">${esc(dev.name)}</div>
          <div class="card__spec mono">${spec.map((s) => `<span>${s}</span>`).join('')}</div>
          <div class="card__price">
            <strong>${fmt.perM2(c.pricePerM2)}</strong>
            <small>${c.minPrice ? 'от ' + fmt.money(c.minPrice) : fmt.quarter(c)}</small>
          </div>
        </div>
      </a>`;
  }

  function newsCard(a, feature) {
    return `
      <a class="news-card reveal ${feature ? 'news-card--feature' : ''}" href="article.html?id=${a.id}">
        ${photo(a.photo, '', feature ? '' : 's')}
        <div class="news-card__top mono"><span class="news-card__tag">${esc(a.tag)}</span><span>${fmt.dateShort(a.date)}</span></div>
        <h3>${esc(a.title)}</h3>
        <p>${esc(a.lead)}</p>
      </a>`;
  }

  function newsRow(a) {
    return `
      <a class="news-row reveal" href="article.html?id=${a.id}">
        <div class="news-row__meta mono"><span>${fmt.dateShort(a.date)}</span><b>${esc(a.tag)}</b></div>
        <div><h3>${esc(a.title)}</h3><p>${esc(a.lead)}</p></div>
        <span class="news-row__arr">→</span>
      </a>`;
  }

  function header() {
    const page = document.body.dataset.page;
    const links = [
      ['catalog', 'catalog.html', 'Новостройки'],
      ['commercial', 'catalog.html?type=apartments', 'Апартаменты'],
      ['news', 'news.html?tab=news', 'Новости'],
      ['articles', 'news.html?tab=article', 'Статьи'],
      ['developers', 'developers.html', 'Застройщики']
    ];
    const nav = links.map(([k, href, t]) => `<a href="${href}" class="${page === k ? 'is-active' : ''}">${t}</a>`).join('');
    const grid = document.createElement('div');
    grid.className = 'gridlines';
    grid.setAttribute('aria-hidden', 'true');
    const el = document.createElement('header');
    el.className = 'header';
    el.innerHTML = `
      <div class="container header__inner">
        <a class="logo" href="index.html" aria-label="Ключ — на главную">Ключ<span class="dot">/</span></a>
        <nav class="nav" aria-label="Основное меню">${nav}</nav>
        <div class="header__contact">
          <a href="tel:${TEL}">${PHONE}</a>
          <span class="city" role="group" aria-label="Город">${Object.values(D.cities).map((c) => `<button type="button" data-city="${c.id}" class="${c.id === CITY.id ? 'is-active' : ''}">${c.name}</button>`).join(' / ')}</span>
        </div>
        <button class="btn btn--sm" type="button" data-callback>Звонок <span class="arr">→</span></button>
        <button class="burger" type="button" aria-label="Меню" aria-expanded="false"><span></span></button>
      </div>
      <nav class="mobile-nav" aria-label="Мобильное меню">
        ${nav}
        <div class="seg seg--full" style="margin-top:20px" role="group" aria-label="Город">${Object.values(D.cities).map((c) => `<input type="radio" name="m-city" id="m-city-${c.id}" ${c.id === CITY.id ? 'checked' : ''}><label for="m-city-${c.id}" data-city="${c.id}">${c.name}</label>`).join('')}</div>
        <a href="tel:${TEL}">${PHONE}</a>
        <button class="btn btn--gold" type="button" data-callback>Заказать звонок <span class="arr">→</span></button>
      </nav>`;
    document.body.prepend(el);
    document.body.prepend(grid);
    const burger = el.querySelector('.burger');
    const mnav = el.querySelector('.mobile-nav');
    burger.addEventListener('click', () => {
      const open = mnav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', open);
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-city]');
      if (!b || b.dataset.city === CITY.id) return;
      D.setCity(b.dataset.city);
      // Фильтры и страницы объектов относятся к прежнему городу, поэтому уходим на чистый адрес
      const page = location.pathname.split('/').pop() || 'index.html';
      const keep = ['index.html', 'catalog.html', 'news.html', 'developers.html', 'about.html'].includes(page) ? page : 'index.html';
      location.href = keep + '?city=' + b.dataset.city;
    });
  }

  function footer() {
    const el = document.createElement('footer');
    el.className = 'footer';
    el.innerHTML = `
      <div class="container">
        <div class="footer__grid">
          <div>
            <p class="muted" style="max-width:360px">Каталог новостроек Алматы и Астаны. Проверенные застройщики, актуальные цены и аналитика рынка.</p>
            <p style="margin-top:28px;display:grid;gap:6px">
              <span class="label">Реклама и сотрудничество</span>
              <a class="gold" href="mailto:adv@klyuch.example">adv@klyuch.example</a>
              <span>${PHONE}</span>
            </p>
          </div>
          <div><h4>Каталог</h4><ul>
            <li><a href="catalog.html">Все новостройки</a></li>
            <li><a href="catalog.html?city=almaty">В Алматы</a></li>
            <li><a href="catalog.html?city=astana">В Астане</a></li>
            <li><a href="catalog.html?location=suburb">В пригородах</a></li>
            <li><a href="catalog.html?type=townhouse">Таунхаусы</a></li>
          </ul></div>
          <div><h4>Журнал</h4><ul>
            <li><a href="news.html?tab=news">Новости</a></li>
            <li><a href="news.html?tab=article">Статьи</a></li>
            <li><a href="developers.html">Застройщики</a></li>
            <li><a href="catalog.html?sort=price-asc">Спецпредложения</a></li>
          </ul></div>
          <div><h4>Компания</h4><ul>
            <li><a href="about.html">О проекте</a></li>
            <li><a href="about.html#ads">Реклама</a></li>
            <li><a href="about.html#contacts">Контакты</a></li>
            <li><a href="about.html#terms">Соглашение</a></li>
          </ul></div>
        </div>
        <div class="footer__mark" aria-hidden="true">КЛЮЧ<span>/</span></div>
        <div class="footer__bottom mono">
          <span>© 2026 Ключ · Демо-проект, данные вымышлены</span>
          <span>${CITY.center[0].toFixed(3)}°N ${CITY.center[1].toFixed(3)}°E</span>
        </div>
      </div>`;
    document.body.append(el);
  }

  function leadForm(btnText) {
    return `
      <div class="field"><label>Имя</label><input class="input" name="name" placeholder="Как к вам обращаться" autocomplete="name" required></div>
      <div class="field"><label>Телефон</label><input class="input" name="phone" type="tel" placeholder="+7 (___) ___-__-__" autocomplete="tel" required></div>
      <div class="form-error" aria-live="polite"></div>
      <button class="btn btn--gold btn--block" type="submit">${btnText || 'Отправить заявку'} <span class="arr">→</span></button>
      <p class="form-note">Нажимая кнопку, вы соглашаетесь с <a href="about.html#terms">условиями обработки данных</a>.</p>`;
  }

  function phoneMask(input) {
    input.addEventListener('input', () => {
      let d = input.value.replace(/\D/g, '');
      if (d.startsWith('8')) d = '7' + d.slice(1);
      if (!d.startsWith('7')) d = '7' + d;
      d = d.slice(0, 11);
      let out = '+7';
      if (d.length > 1) out += ' (' + d.slice(1, 4);
      if (d.length >= 4) out += ')';
      if (d.length > 4) out += ' ' + d.slice(4, 7);
      if (d.length > 7) out += '-' + d.slice(7, 9);
      if (d.length > 9) out += '-' + d.slice(9, 11);
      input.value = out;
    });
  }

  let formSeq = 0;
  function bindLeadForm(form, onSuccess) {
    const phone = form.querySelector('[name=phone]');
    const name = form.querySelector('[name=name]');
    const err = form.querySelector('.form-error');
    const n = ++formSeq;
    [name, phone].forEach((el) => {
      el.id = `lead-${n}-${el.name}`;
      el.closest('.field').querySelector('label').htmlFor = el.id;
    });
    phoneMask(phone);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      name.classList.remove('is-invalid');
      phone.classList.remove('is-invalid');
      if (name.value.trim().length < 2) { name.classList.add('is-invalid'); err.textContent = 'Укажите имя'; name.focus(); return; }
      if (phone.value.replace(/\D/g, '').length !== 11) { phone.classList.add('is-invalid'); err.textContent = 'Введите номер телефона полностью'; phone.focus(); return; }
      err.textContent = '';
      onSuccess(name.value.trim());
    });
  }

  function successHtml(n) {
    return `<div class="success"><div class="success__icon">✓</div><h3>Спасибо, ${esc(n)}</h3><p class="muted">Заявка принята. Эксперт перезвонит в течение 15 минут в рабочее время.</p></div>`;
  }

  let modal;
  function openModal(title, subtitle) {
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      document.body.append(modal);
      modal.addEventListener('click', (e) => { if (e.target.matches('.modal__backdrop, .modal__close')) closeModal(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
    }
    modal.innerHTML = `
      <div class="modal__backdrop"></div>
      <div class="modal__box">
        <button class="modal__close" type="button" aria-label="Закрыть">×</button>
        <div class="modal__content">
          <div class="label" style="margin-bottom:16px"><b>●</b> Ответим за 15 минут</div>
          <h3>${esc(title || 'Заказать звонок')}</h3>
          <p class="muted">${esc(subtitle || 'Подберём квартиру под ваш бюджет и расскажем об актуальных скидках застройщиков.')}</p>
          <form novalidate>${leadForm()}</form>
        </div>
      </div>`;
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    const form = modal.querySelector('form');
    bindLeadForm(form, (n) => { modal.querySelector('.modal__content').innerHTML = successHtml(n); });
    setTimeout(() => form.querySelector('input').focus(), 50);
  }
  function closeModal() {
    if (!modal) return;
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  function toast(text) {
    const t = document.createElement('div');
    t.textContent = text;
    t.className = 'mono';
    t.style.cssText = 'position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:var(--bg-2);border:1px solid var(--gold);padding:14px 20px;z-index:200;max-width:calc(100% - 32px);text-align:center;color:var(--text)';
    document.body.append(t);
    setTimeout(() => t.remove(), 2600);
  }

  function reveal(root) {
    const items = (root || document).querySelectorAll('.reveal:not(.is-visible)');
    if (!('IntersectionObserver' in window)) { items.forEach((i) => i.classList.add('is-visible')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -40px 0px' });
    items.forEach((i) => io.observe(i));
  }

  const params = () => new URLSearchParams(location.search);

  document.addEventListener('DOMContentLoaded', () => {
    header();
    footer();
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-callback]');
      if (b) { e.preventDefault(); openModal(b.dataset.title, b.dataset.subtitle); }
    });
    document.querySelectorAll('form[data-lead]').forEach((f) => {
      f.innerHTML = leadForm(f.dataset.lead);
      bindLeadForm(f, (n) => { f.innerHTML = successHtml(n); });
    });
    if (window.initPage) window.initPage();
    reveal();
  });

  window.UI = { CITY, esc, fmt, photo, complexCard, newsCard, newsRow, devById, openModal, reveal, params, leadForm, bindLeadForm, successHtml, toast };
})();
