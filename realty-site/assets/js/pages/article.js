window.initPage = function () {
  const D = window.DATA, UI = window.UI;
  const app = document.getElementById('app');
  const a = D.articles.find((x) => x.id === UI.params().get('id'));
  if (!a) {
    app.innerHTML = `<div class="container section"><div class="empty"><h3>Материал не найден</h3><a class="btn btn--gold" style="margin-top:20px" href="news.html">Все материалы</a></div></div>`;
    return;
  }
  document.title = `${a.title} — Ключ`;
  const more = D.articles.filter((x) => x.id !== a.id && x.kind === a.kind).slice(0, 3);
  app.innerHTML = `
    <div class="container">
      <article class="article">
        <div class="breadcrumbs"><a href="index.html">Главная</a><span>/</span><a href="news.html?tab=${a.kind}">${a.kind === 'news' ? 'Новости' : 'Статьи'}</a></div>
        <span class="eyebrow">${UI.esc(a.tag)} · ${UI.fmt.date(a.date)}</span>
        <h1>${UI.esc(a.title)}</h1>
        <p class="lead">${UI.esc(a.lead)}</p>
        <div class="cover">${UI.placeholder(220, a.title.length, '')}</div>
        <div class="prose">${D.articleBody.map((p) => `<p>${UI.esc(p)}</p>`).join('')}</div>
        <div class="cta" style="margin-top:40px;grid-template-columns:1fr;padding:32px">
          <h2 style="font-size:28px">Нужна помощь с выбором?</h2>
          <button class="btn btn--gold" type="button" data-callback style="justify-self:start">Получить консультацию</button>
        </div>
      </article>
    </div>
    <section class="section" style="background:var(--bg-2)">
      <div class="container">
        <div class="section-head"><h2>Читайте также</h2></div>
        <div class="grid grid--3">${more.map((m) => UI.newsCard(m)).join('')}</div>
      </div>
    </section>`;
};
