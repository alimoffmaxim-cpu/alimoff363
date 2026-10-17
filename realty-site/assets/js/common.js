/* Общие компоненты: шапка, подвал, модалка заявки, карточки, утилиты. */
(function () {
  const D = window.DATA;
  const L = D.labels;
  const PHONE = '+7 (495) 120-45-67';

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const fmt = {
    money(v) {
      if (!v) return 'Цена по запросу';
      if (v >= 1e6) return (v / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' млн ₽';
      return Math.round(v).toLocaleString('ru-RU') + ' ₽';
    },
    perM2(v) { return v ? 'от ' + Math.round(v / 1000).toLocaleString('ru-RU') + ' тыс. ₽/м²' : 'Цена по запросу'; },
    term(c) { return c.stage === 'finishing' && c.year === 2026 ? `Сдача ${c.quarter} кв. ${c.year}` : `Срок сдачи ${c.quarter} квартал ${c.year}`; },
    date(s) { return new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); },
    plural(n, forms) { const a = Math.abs(n) % 100, b = a % 10; return forms[a > 10 && a < 20 ? 2 : b > 1 && b < 5 ? 1 : b === 1 ? 0 : 2]; }
  };

  // Генеративная «архитектурная» иллюстрация: силуэт зданий с окнами.
  function placeholder(hue, seed, variant) {
    const r = (n) => { const x = Math.sin(seed * 97 + n * 13.7) * 10000; return x - Math.floor(x); };
    let rects = '';
    let x = 0, i = 0;
    while (x < 400) {
      const w = 34 + r(i) * 50;
      const h = 70 + r(i + 50) * (variant === 'low' ? 60 : 210);
      const y = 300 - h;
      const shade = 8 + r(i + 9) * 10;
      rects += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="hsl(${hue} 20% ${shade}%)"/>`;
      for (let wy = y + 10; wy < 290; wy += 14) {
        for (let wx = x + 6; wx < x + w - 8; wx += 10) {
          if (r(wx * wy) > 0.62) rects += `<rect x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="4" height="6" fill="hsl(40 80% ${60 + r(wx + wy) * 25}%)" opacity="${(0.35 + r(wy) * 0.6).toFixed(2)}"/>`;
        }
      }
      x += w + 2 + r(i + 3) * 6;
      i++;
    }
    return `<div class="ph" style="--h:${hue}"><svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${rects}</svg></div>`;
  }

  const devById = (id) => D.developers.find((d) => d.id === id);

  function complexCard(c) {
    const dev = devById(c.developer);
    const place = c.metro ? `<span><i class="metro-dot"></i>${esc(c.metro)}${c.metroMinutes ? ' · ' + c.metroMinutes + ' мин' : ''}</span>` : `<span>${esc(c.area)}</span>`;
    return `
      <a class="card reveal" href="complex.html?id=${c.id}">
        <div class="card__media">
          ${placeholder(c.hue, c.name.length + c.floors, c.type === 'townhouse' || c.type === 'house' ? 'low' : '')}
          <div class="card__badges">
            ${c.isNew ? '<span class="badge badge--gold">Новинка</span>' : ''}
            <span class="badge">${L.cls[c.cls]}</span>
          </div>
        </div>
        <div class="card__body">
          <div class="card__term">${fmt.term(c)}</div>
          <h3 class="card__title">${esc(c.name)}</h3>
          <div class="card__dev">${esc(dev.name)}</div>
          <div class="card__meta">${place}<span>${L.location[c.location]}</span></div>
          <div class="card__price">
            <strong>${fmt.perM2(c.pricePerM2)}</strong>
            <small>${c.minPrice ? 'от ' + fmt.money(c.minPrice) : ''}</small>
          </div>
        </div>
      </a>`;
  }

  function newsCard(a, feature) {
    return `
      <a class="news-card reveal ${feature ? 'news-card--feature' : ''}" href="article.html?id=${a.id}">
        ${feature ? placeholder(220, a.title.length, '') : ''}
        <div class="news-card__top"><span class="news-card__tag">${esc(a.tag)}</span><span>${fmt.date(a.date)}</span></div>
        <h3>${esc(a.title)}</h3>
        <p>${esc(a.lead)}</p>
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
    const el = document.createElement('header');
    el.className = 'header';
    el.innerHTML = `
      <div class="container header__inner">
        <a class="logo" href="index.html" aria-label="Ключ — на главную">
          <span class="logo__mark"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="8" r="5"/><path d="M11.5 11.5 21 21M17 17l2-2M15 19l2-2"/></svg></span>
          <span>Ключ<span class="dot">.</span></span>
        </a>
        <div class="city-switch" role="group" aria-label="Город">
          <button class="is-active" type="button">Москва</button><button type="button">СПб</button>
        </div>
        <nav class="nav" aria-label="Основное меню">${nav}</nav>
        <a class="header__phone" href="tel:${PHONE.replace(/[^\d+]/g, '')}">${PHONE}</a>
        <button class="btn btn--gold btn--sm" type="button" data-callback>Заказать звонок</button>
        <button class="burger" type="button" aria-label="Меню" aria-expanded="false"><span></span></button>
      </div>
      <nav class="mobile-nav" aria-label="Мобильное меню">
        ${nav}
        <a href="tel:${PHONE.replace(/[^\d+]/g, '')}">${PHONE}</a>
        <button class="btn btn--gold" type="button" data-callback>Заказать звонок</button>
      </nav>`;
    document.body.prepend(el);
    const burger = el.querySelector('.burger');
    const mnav = el.querySelector('.mobile-nav');
    burger.addEventListener('click', () => {
      const open = mnav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', open);
    });
    el.querySelectorAll('.city-switch button').forEach((b, idx) => b.addEventListener('click', () => {
      if (idx === 1) { toast('Каталог Санкт-Петербурга скоро появится'); return; }
    }));
  }

  function footer() {
    const el = document.createElement('footer');
    el.className = 'footer';
    el.innerHTML = `
      <div class="container">
        <div class="footer__grid">
          <div>
            <a class="logo" href="index.html">Ключ<span class="dot">.</span></a>
            <p class="muted" style="margin-top:16px;max-width:320px;font-size:15px">Каталог новостроек Москвы и Подмосковья: проверенные застройщики, актуальные цены и аналитика рынка.</p>
            <p style="margin-top:20px"><a class="gold" href="mailto:adv@klyuch.example">adv@klyuch.example</a><br><span class="muted" style="font-size:14px">Реклама и сотрудничество</span></p>
          </div>
          <div><h4>Каталог</h4><ul>
            <li><a href="catalog.html">Все новостройки</a></li>
            <li><a href="catalog.html?location=moscow">В Москве</a></li>
            <li><a href="catalog.html?location=newmoscow">В Новой Москве</a></li>
            <li><a href="catalog.html?location=mo">В Подмосковье</a></li>
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
            <li><a href="about.html#terms">Пользовательское соглашение</a></li>
          </ul></div>
        </div>
        <div class="footer__bottom">
          <span>© 2026 Ключ. Все права защищены. Демо-проект, данные вымышлены.</span>
          <span>Информация на сайте не является публичной офертой</span>
        </div>
      </div>`;
    document.body.append(el);
  }

  function leadForm(btnText) {
    return `
      <input class="input" name="name" placeholder="Ваше имя" autocomplete="name" required>
      <input class="input" name="phone" type="tel" placeholder="+7 (___) ___-__-__" autocomplete="tel" required>
      <div class="form-error" aria-live="polite"></div>
      <button class="btn btn--gold btn--block" type="submit">${btnText || 'Отправить заявку'}</button>
      <p class="form-note">Нажимая кнопку, вы соглашаетесь с <a class="gold" href="about.html#terms">условиями обработки данных</a>.</p>`;
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

  function bindLeadForm(form, onSuccess) {
    const phone = form.querySelector('[name=phone]');
    const name = form.querySelector('[name=name]');
    const err = form.querySelector('.form-error');
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
    return `<div class="success"><div class="success__icon">✓</div><h3>Спасибо, ${esc(n)}!</h3><p class="muted">Заявка принята. Эксперт перезвонит вам в течение 15 минут в рабочее время.</p></div>`;
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
          <h3>${esc(title || 'Заказать звонок')}</h3>
          <p class="muted">${esc(subtitle || 'Оставьте контакты — подберём квартиру под ваш бюджет и расскажем об актуальных акциях.')}</p>
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
    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--surface-2);border:1px solid var(--gold);padding:12px 20px;border-radius:999px;z-index:200;font-size:14px;max-width:calc(100% - 32px);text-align:center';
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

  window.UI = { esc, fmt, placeholder, complexCard, newsCard, devById, openModal, reveal, params, leadForm, bindLeadForm, successHtml, toast };
})();
