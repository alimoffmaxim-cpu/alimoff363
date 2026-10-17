window.initPage = function () {
  const D = window.DATA, UI = window.UI;
  const app = document.getElementById('app');
  const a = D.articles.find((x) => x.id === UI.params().get('id'));
  if (!a) {
    app.innerHTML = `<div class="container section"><div class="empty"><h3>Материал не найден</h3><a class="btn btn--gold" style="margin-top:28px" href="news.html">Все материалы <span class="arr">→</span></a></div></div>`;
    return;
  }
  document.title = `${a.title} — Ключ`;
  const more = D.articles.filter((x) => x.id !== a.id && x.kind === a.kind).slice(0, 3);
  app.innerHTML = `
    <div class="container">
      <article class="article">
        <div class="breadcrumbs"><a href="index.html">Главная</a><span>/</span><a href="news.html?tab=${a.kind}">${a.kind === 'news' ? 'Новости' : 'Статьи'}</a></div>
        <div class="label"><b>${UI.esc(a.tag)}</b> · ${UI.fmt.date(a.date)}</div>
        <h1>${UI.esc(a.title)}</h1>
        <p class="lead">${UI.esc(a.lead)}</p>
        <div class="cover">${UI.photo(a.photo, '', '', true)}</div>
        <div class="prose">${D.articleBody.map((p) => `<p>${UI.esc(p)}</p>`).join('')}</div>
        <div class="cta" style="margin-top:56px;grid-template-columns:1fr">
          <div style="padding-right:0;display:flex;justify-content:space-between;align-items:center;gap:24px;flex-wrap:wrap">
            <h2 style="font-size:28px">Нужна помощь с выбором?</h2>
            <button class="btn btn--gold" type="button" data-callback>Получить консультацию <span class="arr">→</span></button>
          </div>
        </div>
      </article>
    </div>
    <section class="section rule">
      <div class="container">
        <div class="section-head"><div class="label">Ещё</div><div class="section-head__side"><h2>Читайте также</h2></div></div>
        <div class="news-grid">${more.map((m) => UI.newsCard(m)).join('')}</div>
      </div>
    </section>`;
};
