window.initPage = function () {
  const D = window.DATA, UI = window.UI;
  const app = document.getElementById('app');
  const d = UI.devById(UI.params().get('id'));
  if (!d) {
    app.innerHTML = `<div class="container section"><div class="empty"><h3>Застройщик не найден</h3><a class="btn btn--gold" style="margin-top:20px" href="developers.html">Все застройщики</a></div></div>`;
    return;
  }
  document.title = `${d.name} — Ключ`;
  const list = D.complexes.filter((c) => c.developer === d.id);
  app.innerHTML = `
    <section class="page-head">
      <div class="container">
        <div class="breadcrumbs"><a href="index.html">Главная</a><span>/</span><a href="developers.html">Застройщики</a><span>/</span><span>${UI.esc(d.name)}</span></div>
        <div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap">
          <span class="dev-logo" style="width:96px;height:96px;font-size:36px">${d.name[0]}</span>
          <div><h1>${UI.esc(d.name)}</h1><p class="muted" style="margin-top:8px">На рынке с ${d.founded} года · ${d.projects} ${UI.fmt.plural(d.projects, ['проект', 'проекта', 'проектов'])} в каталоге</p></div>
        </div>
        <p class="prose" style="margin-top:24px;max-width:760px;color:var(--text-2);font-size:17px">${UI.esc(d.about)}</p>
      </div>
    </section>
    <section class="section--tight">
      <div class="container">
        <h2 class="block-title" style="margin-top:0">Проекты застройщика</h2>
        <div class="grid grid--3">${list.map(UI.complexCard).join('')}</div>
      </div>
    </section>`;
};
