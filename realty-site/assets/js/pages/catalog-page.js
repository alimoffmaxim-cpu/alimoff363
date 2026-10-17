window.initPage = function () {
  const D = window.DATA, L = D.labels, UI = window.UI;
  const form = document.getElementById('filter-form');
  const results = document.getElementById('results');
  const sortSel = document.getElementById('sort');
  const filters = document.getElementById('filters');

  const opts = (sel, entries, any) => {
    document.getElementById(sel).innerHTML = `<option value="">${any}</option>` + entries.map(([v, t]) => `<option value="${v}">${UI.esc(t)}</option>`).join('');
  };
  opts('f-location', Object.entries(L.location), 'Любая');
  opts('f-dev', D.developers.map((d) => [d.id, d.name]), 'Все застройщики');
  opts('f-year', [2026, 2027, 2028, 2029].map((y) => [y, `${y} год`]), 'Любой');
  opts('f-cls', Object.entries(L.cls), 'Любой');
  opts('f-type', Object.entries(L.type), 'Любой');
  opts('f-building', Object.entries(L.building), 'Любой');
  opts('f-finish', Object.entries(L.finish), 'Любая');
  opts('f-stage', Object.entries(L.stage), 'Любая');
  opts('f-transport', Object.entries(L.transport), 'Любой');
  document.getElementById('f-rooms').innerHTML = [0, 1, 2, 3, 4, 5].map((r) =>
    `<input type="checkbox" id="fr${r}" value="${r}" data-room><label for="fr${r}">${r === 0 ? 'Ст' : r === 5 ? '5+' : r}</label>`).join('');

  // Параметры, которых нет в форме (гео из ссылок), сохраняем отдельно
  const geoKeys = ['area', 'metro', 'highway'];

  function fromUrl() {
    const p = UI.params();
    form.querySelectorAll('[name]').forEach((el) => {
      if (el.type === 'checkbox') el.checked = !!p.get(el.name);
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
      if (el.type === 'checkbox') { if (el.checked) p.set(el.name, '1'); }
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
    document.getElementById('count').textContent = `Найдено ${n} ${UI.fmt.plural(n, ['объект', 'объекта', 'объектов'])}`;
    const geo = geoKeys.map((k) => p.get(k) && (k === 'metro' ? 'м. ' : '') + p.get(k) + (k === 'highway' ? ' шоссе' : '')).filter(Boolean)[0];
    document.getElementById('active-geo').innerHTML = geo ? `· ${UI.esc(geo)} <a class="gold" href="#" id="clear-geo">×</a>` : '';
    const loc = p.get('location') ? L.location[p.get('location')] : geo;
    document.getElementById('catalog-title').textContent = loc ? `Новостройки: ${loc}` : 'Новостройки Москвы и Подмосковья';

    results.innerHTML = n ? list.map(UI.complexCard).join('') : `
      <div class="empty" style="grid-column:1/-1">
        <h3>Ничего не нашлось</h3>
        <p>Попробуйте изменить параметры поиска или оставьте заявку — подберём варианты вручную.</p>
        <div style="margin-top:22px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <button class="btn btn--ghost" type="button" id="empty-reset">Сбросить фильтры</button>
          <button class="btn btn--gold" type="button" data-callback>Подобрать с экспертом</button>
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

  fromUrl();
  render();
};
