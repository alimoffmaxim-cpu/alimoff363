window.initPage = function () {
  document.getElementById('app').innerHTML = `
    <section class="page-head">
      <div class="container">
        <div class="breadcrumbs"><a href="index.html">Главная</a><span>/</span><span>О проекте</span></div>
        <h1>О проекте</h1>
      </div>
    </section>
    <section class="section--tight">
      <div class="container prose" style="max-width:860px">
        <p>«Ключ» — независимый онлайн-каталог новостроек Москвы и Московской области. Мы помогаем покупателям сравнивать жилые комплексы по цене, локации, срокам сдачи и качеству среды, а застройщикам — находить своих клиентов.</p>
        <p>Информация о проектах поступает напрямую от девелоперов и обновляется ежедневно. Редакция публикует новости рынка, аналитику и практические руководства для покупателей.</p>

        <h2 class="block-title" id="ads">Реклама</h2>
        <p>Размещение проектов в каталоге, спецпроекты в журнале, баннерная и нативная реклама. Медиакит и прайс-лист — по запросу на <a class="gold" href="mailto:adv@klyuch.example">adv@klyuch.example</a>.</p>

        <h2 class="block-title" id="contacts">Контакты</h2>
        <div class="specs specs--2">
          <div class="spec"><small>Телефон</small>+7 (495) 120-45-67</div>
          <div class="spec"><small>E-mail</small>info@klyuch.example</div>
          <div class="spec"><small>Адрес</small>Москва, Пресненская наб., 10</div>
          <div class="spec"><small>Время работы</small>Ежедневно, 9:00–21:00</div>
        </div>

        <h2 class="block-title" id="terms">Пользовательское соглашение</h2>
        <p>Используя сайт, вы соглашаетесь с обработкой персональных данных, указанных в формах обратной связи, исключительно в целях консультации по выбору недвижимости. Данные не передаются третьим лицам без вашего согласия.</p>
        <p>Информация о ценах и наличии квартир носит справочный характер и не является публичной офертой. Актуальные условия уточняйте у застройщика.</p>

        <h2 class="block-title" id="photos">Фотографии</h2>
        <p>Иллюстрации на сайте — фотографии с Unsplash, распространяемые по лицензии Unsplash. Они не изображают реальные объекты каталога.</p>
      </div>
    </section>
    <section class="section--tight">
      <div class="container">
        <div class="cta">
          <div><h2>Свяжитесь с нами</h2><p class="muted" style="margin-top:20px">Ответим на вопросы о проектах и сотрудничестве.</p></div>
          <form id="about-form" novalidate></form>
        </div>
      </div>
    </section>`;
  const f = document.getElementById('about-form');
  f.innerHTML = window.UI.leadForm('Отправить');
  window.UI.bindLeadForm(f, (n) => { f.innerHTML = window.UI.successHtml(n); });
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
};
