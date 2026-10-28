# Режет landing.html на блоки Tilda, ничего не меняя в дизайне:
#   1-t123-main.html   — шрифты, все стили, разметка до формы, JS верхних секций;
#   [стандартный блок формы Tilda BF204N, класс gm-signup, якорь signup — настраивается в редакторе];
#   3-t123-footer.html — оформление формы Tilda, «Как добраться» + FAQ + подвал, JS нижних секций;
#   preview.html       — блоки вместе, на месте формы — разметка BF204N (t678) как на живой Tilda.
# Запуск: python3 tools/build_tilda.py  (из папки gluhov-moto-landing)
import pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'tilda'
OUT.mkdir(exist_ok=True)
src = (ROOT / 'landing.html').read_text(encoding='utf-8')


def cut(s, start, end, keep_end=False):
    """Возвращает (до start, от start до end, после end)."""
    a = s.index(start)
    b = s.index(end, a) + (len(end) if keep_end else 0)
    return s[:a], s[a:b], s[b:]


# --- части исходника ---
head = src[:src.index('<div id="gm">')]
body = src[src.index('<div id="gm">') + len('<div id="gm">'):src.index('<script>')]
body = body[:body.rindex('</div>')]
js = src[src.index('<script>') + len('<script>'):src.rindex('</script>')]

# Два блока на странице — обёртка из id становится классом
head = re.sub(r'#gm(?=[\s{.,:*>\[])', '.gm', head)
head = head.replace('<!--\n  Лендинг', '<!--\n  БЛОК 1 из 3 (T123). Дальше — блок формы BF204N, затем блок 3 (T123).\n  Лендинг', 1)

main, form_sec, rest = cut(body, '  <!-- 10. Лид-форма', '  </section>\n', keep_end=True)
lightbox = '  <div class="gm-lightbox" id="gm-lightbox"><img alt=""></div>\n'
sticky = '  <div class="gm-sticky" id="gm-sticky"><a class="gm-btn" href="#gm-form">Записаться на тренировку →</a></div>\n'
assert lightbox in rest and sticky in rest
rest = rest.replace(lightbox, '')
main += lightbox
# Все кнопки «Записаться» ведут к якорю блока формы Tilda
main = main.replace('href="#gm-form"', 'href="#signup"')
rest = rest.replace('href="#gm-form"', 'href="#signup"')

# --- JS блока 1: всё, кроме формы, карты и липкой кнопки (их элементы — в блоке 3) ---
def drop(s, a, b, keep_b=False):
    i = s.index(a); j = s.index(b, i)
    return s[:i] + (s[j:] if keep_b else s[j + len(b):])

js1 = js
for line in ("    // TODO: URL веб-приложения Apps Script (README, шаг 2)\n",
             "    SCRIPT_URL: 'https://script.google.com/macros/s/XXXXXXXX/exec',\n",
             "    // TODO: номер счётчика Яндекс.Метрики (если счётчик подключён в настройках Тильды)\n",
             "    METRIKA_ID: 0,\n", "    GOAL: 'lead_form_submit',\n",
             "  if (M.formBg) $('gm-form-bg').appendChild(img(M.formBg, ''));\n",
             "  $('gm-mapframe').src = 'https://yandex.ru/map-widget/v1/?z=14&text=' + encodeURIComponent(CONFIG.ADDRESS);\n",
             "  if (CONFIG.ADDRESS !== 'Зеленоград, картодром') $('gm-address').textContent = CONFIG.ADDRESS;\n"):
    assert line in js1, line
    js1 = js1.replace(line, '')
js1 = js1.replace("  var root = document.getElementById('gm');\n", "  var root = document;\n")
js1 = js1.replace("  function img(src, alt)", "  window.gmConfig = CONFIG; window.gmUrl = url;  // нужны блоку 3\n  function img(src, alt)")
js1 = drop(js1, "\n    var sticky = $('gm-sticky')", "\n  }\n", keep_b=True)
js1 = drop(js1, "  /* ---------- Форма ---------- */", "})();", keep_b=True)
assert 'gm-lead' not in js1 and 'gm-sticky' not in js1

block1 = head + '<div class="gm">\n' + main + '</div>\n\n<script>' + js1 + '</script>\n'

# --- блок 3: оформление формы Tilda + подвал + JS ---
form_css = (ROOT / 'tools' / 'tilda-form.css').read_text(encoding='utf-8')
js3 = r"""
(function () {
  var C = window.gmConfig || {}, url = window.gmUrl || function (s) { return s; };
  function $(id) { return document.getElementById(id); }

  // Карта и адрес
  if (C.ADDRESS) {
    $('gm-mapframe').src = 'https://yandex.ru/map-widget/v1/?z=14&text=' + encodeURIComponent(C.ADDRESS);
    $('gm-address').textContent = C.ADDRESS;
  }

  // Блок формы Tilda: фон с фото, подпись «Запись», акцент в заголовке, преимущества и телефон
  var rec = document.querySelector('.uc-gm-signup');
  if (rec && !rec.querySelector('.gm-sg-bg')) {
    var bg = document.createElement('div'); bg.className = 'gm-sg-bg';
    if (C.MEDIA && C.MEDIA.formBg) { var im = new Image(); im.alt = ''; im.loading = 'lazy'; im.src = url(C.MEDIA.formBg); bg.appendChild(im); }
    rec.insertBefore(bg, rec.firstChild);
    var title = rec.querySelector('.t-section__title'), descr = rec.querySelector('.t-section__descr');
    if (title) {
      var k = document.createElement('div'); k.className = 'gm-sg-kicker'; k.textContent = 'Запись';
      title.parentNode.insertBefore(k, title);
      title.innerHTML = title.innerHTML.replace(/(тренировку)/i, '<span class="gm-sg-accent">$1</span>');
    }
    var extra = document.createElement('div'); extra.className = 'gm-sg-extra';
    extra.innerHTML = '<ul class="gm-sg-perks"><li>Перезвоним в течение дня</li><li>Подберём удобное время</li>' +
      '<li>Расскажем, что взять с собой</li></ul><p class="gm-sg-call">Удобнее позвонить? ' +
      '<a href="tel:+79152779121">+7 915 277-91-21</a></p>';
    (descr || title || rec).insertAdjacentElement('afterend', extra);
  }

  // Липкая кнопка на телефоне: видна после первого экрана, прячется у формы
  var sticky = $('gm-sticky'), hero = $('gm-hero');
  if (sticky && hero && 'IntersectionObserver' in window) {
    var heroOut = false, formIn = false;
    var upd = function () { sticky.classList.toggle('gm-show', heroOut && !formIn); };
    new IntersectionObserver(function (es) { heroOut = !es[0].isIntersecting; upd(); }).observe(hero);
    if (rec) new IntersectionObserver(function (es) { formIn = es[0].isIntersecting; upd(); }).observe(rec);
  }

  // Появление при прокрутке для нижних секций
  var low = document.querySelectorAll('.gm-low .gm-reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.remove('gm-pre'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    low.forEach(function (el) { if (el.getBoundingClientRect().top > innerHeight) el.classList.add('gm-pre'); io.observe(el); });
  }
})();
"""
block3 = ('<!-- БЛОК 3 из 3 (T123): оформление формы Tilda (класс gm-signup), подвал, скрипты. -->\n'
          '<style>\n' + form_css + '</style>\n\n<div class="gm gm-low">\n' + rest + '</div>\n\n<script>' + js3 + '</script>\n')

(OUT / '1-t123-main.html').write_text(block1, encoding='utf-8')
(OUT / '3-t123-footer.html').write_text(block3, encoding='utf-8')

# --- предпросмотр: разметка BF204N (t678) с нашими полями, как её отдаёт Tilda ---
def group(kind, name, title, inner):
    return (f'<div class="t-input-group t-input-group_{kind}" data-field-name="{name}">'
            f'<label class="t-input-title t-descr t-descr_md">{title}</label>'
            f'<div class="t-input-block">{inner}</div><div class="t-input-error"></div></div>')
ages = ''.join(f'<option value="{a}">{a}</option>' for a in list(range(4, 13)) + ['Опытный спортсмен'])
days = ''.join(f'<label class="t-radio__control t-text t-text_xs"><input type="radio" name="Day" value="{d}" class="t-radio"'
               f'{" checked" if d == "Любой" else ""}><div class="t-radio__indicator"></div>{d}</label>' for d in ('Среда', 'Суббота', 'Любой'))
mock_form = f'''<div id="rec000" class="r t-rec uc-gm-signup" data-record-type="678"><a name="signup"></a><div id="signup"></div>
<div class="t678"><div class="t-section__container t-container t-container_flex js-block-header"><div class="t-col t-col_12">
<div class="t-section__title t-title t-title_xs">Запишите ребёнка на тренировку</div>
<div class="t-section__descr t-descr t-descr_xl">Оставьте заявку — администратор перезвонит, подберёт группу и класс мотоцикла и ответит на все вопросы.</div>
</div></div>
<div class="t-container"><div class="t-col t-col_10 t-prefix_2"><div><form class="t-form t-form_inputs-total_5">
<div class="t-form__inputsbox t-form__inputsbox_vertical-form t-form__inputsbox_inrow">
{group('nm', 'Name', 'Имя родителя', '<input type="text" name="Name" class="t-input" placeholder="Как к вам обращаться">')}
{group('ph', 'Phone', 'Телефон', '<input type="tel" name="Phone" class="t-input" placeholder="+7(000)000-0000">')}
{group('sb', 'Age', 'Возраст ребёнка', '<div class="t-select__wrapper"><select name="Age" class="t-select"><option value="">Выберите возраст</option>' + ages + '</select></div>')}
{group('rd', 'Day', 'Удобный день', '<div class="t-radio__wrapper">' + days + '</div>')}
<div class="t-input-group t-input-group_cb"><div class="t-input-block"><label class="t-checkbox__control t-checkbox__control_flex t-text t-text_xs">
<input type="checkbox" name="Checkbox" value="yes" class="t-checkbox" checked><div class="t-checkbox__indicator"></div>
<span>Согласен(на) на обработку персональных данных в соответствии с <a href="#">политикой конфиденциальности</a></span></label></div></div>
<div class="t-form__submit"><button class="t-submit t-btnflex t-btnflex_type_submit t-btnflex_md" type="submit"><span class="t-btnflex__text">Отправить заявку →</span></button></div>
</div></form></div></div></div></div></div>
'''
preview = ('<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
           '<title>Электромото — предпросмотр блоков Tilda</title>'
           '<link rel="stylesheet" href="https://static.tildacdn.com/css/tilda-grid-3.0.min.css">'
           '<link rel="stylesheet" href="https://static.tildacdn.com/css/tilda-forms-1.0.min.css">'
           '<style>body{margin:0;background:#0d0f13}</style></head><body>\n'
           + block1 + mock_form + block3 + '</body></html>\n')
(OUT / 'preview.html').write_text(preview, encoding='utf-8')
for f in ('1-t123-main.html', '3-t123-footer.html', 'preview.html'):
    print(f, len((OUT / f).read_text(encoding='utf-8')), 'символов')

# --- страница копирования для пользователя ---
import html as _h
b1 = (OUT / '1-t123-main.html').read_text(encoding='utf-8')
b3 = (OUT / '3-t123-footer.html').read_text(encoding='utf-8')
def card(n, step, name, desc, code):
    return f'''<section class="file"><div class="head"><div class="meta"><span class="step">{step}</span><code class="name">{name}</code>
<span class="desc">{desc} · {len(code)} символов</span></div><button class="copy" type="button" data-target="c{n}">Скопировать код</button></div>
<textarea class="code" id="c{n}" readonly spellcheck="false">{_h.escape(code)}</textarea></section>'''
rows = ''.join(f'<tr><td>{a}</td><td>{b}</td><td><code>{c}</code></td><td>{d}</td></tr>' for a, b, c, d in [
    ('Имя родителя', 'Имя', 'Name', 'да'), ('Телефон', 'Телефон, маска «с кодом страны», RU', 'Phone', 'да'),
    ('Возраст ребёнка', 'Выпадающий список: 4, 5, 6, 7, 8, 9, 10, 11, 12, Опытный спортсмен; подсказка «Выберите возраст»', 'Age', 'да'),
    ('Удобный день', 'Варианты (радио): Среда, Суббота, Любой', 'Day', 'нет'),
    ('Согласие на обработку ПДн', 'Галочка, «Отмечено по умолчанию», лейбл со ссылкой на политику', 'Checkbox', 'да')])
copy_page = f'''<title>Электромото: блоки для Tilda</title>
<style>
/* Layout: одна колонка — шаги сверху вниз, между ними карточки кода с кнопкой копирования */
:root{{--bg:#f5f6f3;--surface:#fff;--fg:#1d2320;--muted:#5f6a64;--line:#dde2dc;--accent:#b45309;--accent-fg:#fff;--ok:#15803d;--code-bg:#f0f2ee;
  --sans:"IBM Plex Sans",system-ui,sans-serif;--mono:"IBM Plex Mono",ui-monospace,Menlo,monospace}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#141816;--surface:#1c211e;--fg:#e6ebe7;--muted:#9aa59f;--line:#2f3632;--accent:#ffd400;--accent-fg:#141816;--ok:#4ade80;--code-bg:#171b19;color-scheme:dark}}}}
:root[data-theme="dark"]{{--bg:#141816;--surface:#1c211e;--fg:#e6ebe7;--muted:#9aa59f;--line:#2f3632;--accent:#ffd400;--accent-fg:#141816;--ok:#4ade80;--code-bg:#171b19;color-scheme:dark}}
body{{background:var(--bg);color:var(--fg);font-family:var(--sans);font-size:15px;line-height:1.5;padding-inline:16px;padding-block:32px 64px}}
.wrap{{max-width:960px;margin:0 auto;display:flex;flex-direction:column;gap:20px}}
h1{{font-size:26px;margin:0;text-wrap:balance}} h2{{font-size:18px;margin:12px 0 0}}
.lead{{color:var(--muted);margin:0;max-width:65ch}}
ol.steps{{margin:0;padding-left:22px;display:flex;flex-direction:column;gap:6px;max-width:70ch}}
.warn{{border-left:3px solid var(--accent);padding:10px 14px;background:var(--surface);max-width:70ch;margin:0}}
.file{{background:var(--surface);border:1px solid var(--line);border-radius:8px;min-width:0}}
.head{{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--line)}}
.meta{{display:flex;flex-wrap:wrap;gap:10px;align-items:baseline;min-width:0}}
.step{{font-family:var(--mono);font-size:12px;color:var(--muted)}} .name{{font-family:var(--mono);font-size:16px;font-weight:600}} .desc{{color:var(--muted);font-size:13px}}
button.copy{{font:600 14px var(--sans);background:var(--accent);color:var(--accent-fg);border:0;border-radius:6px;padding:9px 16px;cursor:pointer}}
button.copy:focus-visible{{outline:3px solid var(--fg);outline-offset:2px}} button.copy.done{{background:var(--ok);color:#fff}}
textarea.code{{display:block;width:100%;box-sizing:border-box;height:220px;margin:0;padding:12px 14px;border:0;resize:vertical;background:var(--code-bg);color:var(--fg);font:12.5px/1.45 var(--mono);border-radius:0 0 8px 8px;white-space:pre;overflow:auto}}
code{{font-family:var(--mono);overflow-wrap:anywhere}}
.tbl{{overflow-x:auto;background:var(--surface);border:1px solid var(--line);border-radius:8px}}
table{{border-collapse:collapse;width:100%;min-width:560px;font-size:14px}} th,td{{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}} th{{color:var(--muted);font-weight:600}}
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;600&display=swap">
<div class="wrap">
<h1>Электромото Зеленоград: блоки для Tilda</h1>
<p class="lead">Страница в Тильде собирается из трёх блоков сверху вниз: HTML-код, стандартная форма Тильды, HTML-код. Дизайн один в один с утверждённым макетом; форма — стандартная, поэтому заявки уходят в Tilda CRM, Google Таблицу, Telegram и на почту.</p>
<h2>1. Новая страница</h2>
<ol class="steps"><li>Мои сайты → проект → <b>Создать новую страницу</b> → «Пустая страница».</li>
<li>Настройки страницы: заголовок «Электромотоциклы для детей в Зеленограде», адрес, например <code>/moto-zelenograd</code>.</li></ol>
<h2>2. Блок 1 — основная часть</h2>
<ol class="steps"><li><b>Все блоки → Другое → T123 «HTML-код»</b> → «Контент».</li><li>«Скопировать код» ниже → вставить целиком → «Сохранить и закрыть».</li></ol>
{card(1, 'блок 1 из 3', 'T123 · основная часть', 'шрифты, стили, всё до формы, 3D-трасса', b1)}
<h2>3. Блок 2 — форма Тильды BF204N</h2>
<ol class="steps"><li><b>Все блоки → Форма → BF204N</b> «Вертикальная форма с множеством полей», поставить под блоком 1.</li>
<li><b>Контент → Шапка блока:</b> заголовок «Запишите ребёнка на тренировку», описание «Оставьте заявку — администратор перезвонит, подберёт группу и класс мотоцикла и ответит на все вопросы.»</li>
<li><b>Контент → Поля для ввода</b> — как в таблице; Email и прочие лишние поля удалить.</li>
<li><b>Текст кнопки:</b> «Отправить заявку →». <b>Сообщение об успехе:</b> «Спасибо! Администратор перезвонит вам в ближайшее время.»</li>
<li><b>Контент → Приём данных:</b> отметить Tilda CRM, Google Таблицу, Telegram и/или Email (сначала подключить их: Настройки сайта → Формы).</li>
<li><b>Настройки блока:</b> отступы сверху/снизу 0 (и для 480), ширина 12 колонок, фон <code>#0d0f13</code>, название формы «Электромото Зеленоград — запись», якорная ссылка <code>signup</code>, CSS Class Name <code>gm-signup</code>.</li></ol>
<div class="tbl"><table><tr><th>Поле</th><th>Тип и варианты</th><th>Переменная</th><th>Обязательное</th></tr>{rows}</table></div>
<p class="warn">Оформление формы (тёмная карточка, жёлтая кнопка, дни-«пилюли», фото на фоне, список «Перезвоним в течение дня…») подтягивается из блока 3 по CSS-классу <code>gm-signup</code>. Без класса форма останется стандартной.</p>
<h2>4. Блок 3 — подвал и скрипты</h2>
<ol class="steps"><li>Ещё один <b>T123 «HTML-код»</b> под формой → вставить код ниже → «Сохранить и закрыть».</li>
<li><b>Опубликовать.</b> Проверять вид только на опубликованной странице: редактор и «Предпросмотр» Тильды код T123 не выполняют.</li>
<li>Отправить тестовую заявку «ТЕСТ» → проверить «Заявки», Tilda CRM, таблицу и Telegram → удалить тест.</li></ol>
{card(3, 'блок 3 из 3', 'T123 · подвал и скрипты', 'оформление формы, «Как добраться», FAQ, липкая кнопка', b3)}
</div>
<script>
document.querySelectorAll('button.copy').forEach(function (btn) {{
  btn.addEventListener('click', function () {{
    var ta = document.getElementById(btn.dataset.target);
    function ok() {{ btn.textContent = 'Скопировано ✓'; btn.classList.add('done'); setTimeout(function () {{ btn.textContent = 'Скопировать код'; btn.classList.remove('done'); }}, 2500); }}
    ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length);
    var done = false; try {{ done = document.execCommand('copy'); }} catch (e) {{}}
    if (done) return ok();
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(ok, function () {{ btn.textContent = 'Код выделен — нажмите Cmd+C'; }});
    else btn.textContent = 'Код выделен — нажмите Cmd+C';
  }});
}});
</script>
'''
(OUT / 'copy.html').write_text(copy_page, encoding='utf-8')
print('copy.html', len(copy_page), 'символов')
