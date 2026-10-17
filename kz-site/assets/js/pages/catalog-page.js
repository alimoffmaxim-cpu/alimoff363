window.initPage = function () {
  const D = window.DATA, L = D.labels, UI = window.UI;
  const form = document.getElementById('filter-form');
  const results = document.getElementById('results');
  const sortSel = document.getElementById('sort');
  const filters = document.getElementById('filters');

  const opts = (sel, entries, any) => {
    document.getElementById(sel).innerHTML = `<option value="">${any}</option>` + entries.map(([v, t]) => `<option value="${v}">${UI.esc(t)}</option>`).join('');
  };
  opts('f-dev', D.developers.filter((d) => d.cities.includes(UI.CITY.id)).map((d) => [d.id, d.name]), 'Все застройщики');
  document.getElementById('f-prime-label').textContent = UI.CITY.prime;
  opts('f-type', Object.entries(L.type), 'Любой');

  // Сегментированные переключатели: «Все» + варианты
  const short = {
    location: { city: 'Город', suburb: 'Пригород' },
    building: { frame: 'Монолит', brick: 'Кирпич', panel: 'Панель' },
    stage: { foundation: 'Котлован', frame: 'Каркас', finishing: 'Отделка' },
    finish: { rough: 'Черновая', prefinish: 'Предчист.', full: 'Чистовая' }
  };
  const segs = {
    location: Object.keys(L.location),
    cls: Object.keys(L.cls),
    year: ['2026', '2027', '2028', '2029'],
    finish: Object.keys(L.finish),
    building: Object.keys(L.building),
    stage: Object.keys(L.stage),
    transport: UI.CITY.transport
  };
  form.querySelectorAll('[data-seg]').forEach((box) => {
    const name = box.dataset.seg;
    const label = (v) => (short[name] && short[name][v]) || (L[name] && L[name][v]) || v;
    box.innerHTML = ['', ...segs[name]].map((v, i) =>
      `<input type="radio" name="${name}" id="f-${name}-${i}" value="${v}"><label for="f-${name}-${i}">${v ? UI.esc(label(v)) : 'Все'}</label>`).join('');
  });
  document.getElementById('f-rooms').innerHTML = [0, 1, 2, 3, 4, 5].map((r) =>
    `<input type="checkbox" id="fr${r}" value="${r}" data-room><label for="fr${r}">${r === 0 ? 'Ст' : r === 5 ? '5+' : r}</label>`).join('');

  // Параметры, которых нет в форме (гео из ссылок), сохраняем отдельно
  const geoKeys = ['area', 'metro', 'street'];

  function fromUrl() {
    const p = UI.params();
    form.querySelectorAll('[name]').forEach((el) => {
      if (el.type === 'checkbox') el.checked = !!p.get(el.name);
      else if (el.type === 'radio') el.checked = (p.get(el.name) || '') === el.value;
      else el.value = p.get(el.name) || '';
    });
    const rooms = (p.get('rooms') || '').split(',');
    form.querySelectorAll('[data-room]').forEach((el) => { el.checked = rooms.includes(el.value); });
    sortSel.value = p.get('sort') || '';
  }

  function toParams() {
    const cur = UI.params();
    const p = new URLSearchParams();
    geoKeys.forEach((k) => { if (cur.get(k)) p.set(k, cur.get(k)); });
    form.querySelectorAll('[name]').forEach((el) => {
      if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked && el.value) p.set(el.name, el.type === 'checkbox' ? '1' : el.value); }
      else if (el.value) p.set(el.name, el.value);
    });
    const rooms = [...form.querySelectorAll('[data-room]:checked')].map((i) => i.value);
    if (rooms.length) p.set('rooms', rooms.join(','));
    if (sortSel.value) p.set('sort', sortSel.value);
    return p;
  }

  function render() {
    const p = UI.params();
    const list = window.Catalog.sort(window.Catalog.filter(p), p.get('sort'));
    const n = list.length;
    document.getElementById('count-n').textContent = n;
    document.getElementById('count-l').textContent = UI.fmt.plural(n, ['объект', 'объекта', 'объектов']);
    const geo = geoKeys.map((k) => p.get(k) && (k === 'metro' ? 'м. ' : '') + p.get(k) ).filter(Boolean)[0];
    document.getElementById('active-geo').innerHTML = geo ? `· ${UI.esc(geo)} <a href="#" id="clear-geo" aria-label="Убрать район">×</a>` : '';
    const CITY = UI.CITY;
    document.getElementById('catalog-title').textContent = geo ? `Новостройки: ${geo}` : p.get('location') === 'suburb' ? `Пригороды: ${CITY.name}` : `Новостройки ${CITY.inName}`;

    results.innerHTML = n ? list.map(UI.complexCard).join('') : `
      <div class="empty" style="grid-column:1/-1">
        <h3>Ничего не нашлось</h3>
        <p>Измените параметры поиска или оставьте заявку, и эксперт подберёт варианты вручную.</p>
        <div style="margin-top:28px;display:flex;gap:12px;flex-wrap:wrap">
          <button class="btn btn--ghost" type="button" id="empty-reset">Сбросить фильтры</button>
          <button class="btn btn--gold" type="button" data-callback>Подобрать с экспертом <span class="arr">→</span></button>
        </div>
      </div>`;
    UI.reveal(results);
  }

  function apply() {
    const p = toParams();
    history.replaceState(null, '', 'catalog.html' + (p.toString() ? '?' + p : ''));
    render();
  }

  function reset() {
    history.replaceState(null, '', 'catalog.html');
    fromUrl();
    render();
  }

  form.addEventListener('input', apply);
  form.addEventListener('change', apply);
  form.addEventListener('submit', (e) => e.preventDefault());
  sortSel.addEventListener('change', apply);
  document.getElementById('reset').addEventListener('click', reset);
  document.addEventListener('click', (e) => {
    if (e.target.id === 'empty-reset') reset();
    if (e.target.id === 'clear-geo') {
      e.preventDefault();
      const p = UI.params();
      geoKeys.forEach((k) => p.delete(k));
      history.replaceState(null, '', 'catalog.html' + (p.toString() ? '?' + p : ''));
      render();
    }
  });
  document.getElementById('filters-open').addEventListener('click', () => filters.classList.add('is-open'));
  document.getElementById('filters-close').addEventListener('click', () => filters.classList.remove('is-open'));

  // Вид: сетка или список (запоминаем в браузере)
  const viewBtns = document.querySelectorAll('[data-view]');
  function setView(v) {
    results.classList.toggle('is-list', v === 'list');
    viewBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.view === v));
    try { localStorage.setItem('klyuch-view', v); } catch (e) { /* хранилище недоступно */ }
  }
  viewBtns.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  let saved = 'grid';
  try { saved = localStorage.getItem('klyuch-view') || 'grid'; } catch (e) { /* хранилище недоступно */ }
  setView(saved);

  fromUrl();
  render();
};
