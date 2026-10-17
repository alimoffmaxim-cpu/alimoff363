window.initPage = function () {
  const D = window.DATA, UI = window.UI;
  const devs = D.developers.slice().sort((a, b) => b.projects - a.projects);
  document.getElementById('app').innerHTML = `
    <section class="page-head">
      <div class="container">
        <div class="breadcrumbs"><a href="index.html">Главная</a><span>/</span><span>Застройщики</span></div>
        <h1>Застройщики</h1>
        <p class="muted" style="margin-top:14px;max-width:620px">${devs.length} девелоперов, чьи проекты представлены в каталоге. Изучите портфолио и историю компании перед покупкой.</p>
      </div>
    </section>
    <section class="section--tight">
      <div class="container grid grid--2">
        ${devs.map((d) => `
          <a class="dev-card reveal" href="developer.html?id=${d.id}">
            <span class="dev-logo">${d.name[0]}</span>
            <div>
              <h3>${UI.esc(d.name)}</h3>
              <p>${UI.esc(d.about)}</p>
              <div class="dev-card__meta"><span>На рынке с ${d.founded}</span><span class="gold">${d.projects} ${UI.fmt.plural(d.projects, ['проект', 'проекта', 'проектов'])}</span></div>
            </div>
          </a>`).join('')}
      </div>
    </section>`;
};
