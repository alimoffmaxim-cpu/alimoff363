window.initPage = function () {
  const D = window.DATA, UI = window.UI;
  const tabs = [['all', 'Все материалы'], ['news', 'Новости'], ['article', 'Статьи']];
  let cur = UI.params().get('tab') || 'all';

  document.getElementById('app').innerHTML = `
    <section class="page-head">
      <div class="container">
        <div class="breadcrumbs"><a href="index.html">Главная</a><span>/</span><span>Журнал</span></div>
        <h1>Новости и статьи</h1>
      </div>
    </section>
    <section class="section--tight">
      <div class="container">
        <div class="geo-tabs" role="tablist" id="tabs">${tabs.map(([k, t]) => `<button class="tab" type="button" role="tab" data-k="${k}">${t}</button>`).join('')}</div>
        <div class="news-grid" id="list"></div>
      </div>
    </section>`;

  function render() {
    document.querySelectorAll('#tabs .tab').forEach((t) => {
      t.classList.toggle('is-active', t.dataset.k === cur);
      t.setAttribute('aria-selected', t.dataset.k === cur);
    });
    // Подсветка пункта меню в шапке
    document.querySelectorAll('.nav a').forEach((a) => {
      const h = a.getAttribute('href');
      a.classList.toggle('is-active', (cur === 'news' && h.includes('tab=news')) || (cur === 'article' && h.includes('tab=article')));
    });
    const items = D.articles.filter((a) => cur === 'all' || a.kind === cur).sort((a, b) => b.date.localeCompare(a.date));
    const list = document.getElementById('list');
    list.innerHTML = items.map((a, i) => UI.newsCard(a, i === 0)).join('');
    UI.reveal(list);
  }
  document.getElementById('tabs').addEventListener('click', (e) => {
    const t = e.target.closest('.tab');
    if (!t) return;
    cur = t.dataset.k;
    history.replaceState(null, '', cur === 'all' ? 'news.html' : 'news.html?tab=' + cur);
    render();
  });
  render();
};
