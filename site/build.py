"""Собирает страницы сайта из tilda-t123.html и cases.py.

Запуск: python3 site/build.py

Что получается:
  site/index.html                — главная для предпросмотра в браузере
  site/cases/<slug>.t123.html    — страница кейса для блока T123 в Tilda
  site/cases/<slug>.html         — та же страница кейса для предпросмотра

Стили, скрипт, блок контактов и подвал страницы кейса берутся из tilda-t123.html,
поэтому правки дизайна на главной сразу попадают и в кейсы.
"""
import re
from pathlib import Path

from cases import CASES

here = Path(__file__).parent
SITE = "https://alimov.agency/"
main = (here / "tilda-t123.html").read_text(encoding="utf-8")


def between(text, start, end):
    """Кусок text от start до end включительно."""
    a = text.index(start)
    b = text.index(end, a) + len(end)
    return text[a:b]


fonts = "\n".join(line for line in main.splitlines() if "fonts.g" in line)
style = between(main, "<style>", "</style>")
script = between(main, "<script>", "</script>")
contact = between(main, '<section class="aa-sec aa-sec--flush" id="contact"', "</footer>")


def page(title, description, body):
    return f"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{description}">
<meta name="theme-color" content="#F2F6F6">
<style>html {{ scroll-behavior: smooth; scroll-padding-top: 90px; }} body {{ margin: 0; background: #F2F6F6; }}</style>
</head>
<body>
{body}
</body>
</html>
"""


# --- helpers ---------------------------------------------------------------

def num(n):
    """12652 -> «12 652», 567.4 -> «567,4»; пробел неразрывный."""
    if isinstance(n, float) and not n.is_integer():
        whole, frac = f"{n:.1f}".split(".")
        return num(int(whole)) + "," + frac
    return f"{int(n):,}".replace(",", " ")


def money_short(n):
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}".replace(".", ",").replace(",0", "") + " млн ₽"
    return f"{round(n / 1000)} тыс. ₽"


def plural(n, one, few, many):
    n = int(n)
    if n % 10 == 1 and n % 100 != 11:
        return one
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return few
    return many


ARROW = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m0 0-6-6m6 6-6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
TG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.4 4.2 2.9 11.3c-1.3.5-1.2 1.2-.2 1.5l4.7 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.4l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.3-.5-1.9-1.4-1.5ZM9.4 14l9-5.7c.4-.3.8-.1.5.2l-7.4 6.7-.3 3.1L9.4 14Z"/></svg>'

CASE_CSS = """<style>
/* case page: left-aligned hero with a facts list, plan-vs-fact bars, story and method cards */
.aa-chero { padding-block: clamp(40px, 6vw, 72px) 0; }
.aa-back { display: inline-flex; align-items: center; gap: 8px; margin-bottom: clamp(24px, 3vw, 36px); font-size: 15px; font-weight: 500; text-decoration: none; opacity: .7; transition: opacity .2s; }
.aa-back:hover { opacity: 1; }
.aa-back svg { width: 16px; height: 16px; transform: rotate(180deg); }
.aa-chero__grid { display: grid; grid-template-columns: minmax(0, 8fr) minmax(0, 4fr); gap: 32px 56px; align-items: end; }
.aa-chero__text { display: grid; gap: 20px; }
.aa-chero .aa-h1 { font-size: clamp(34px, 5vw, 64px); }
.aa-meta { display: grid; border-top: 1px solid #D6DEDE; }
.aa-meta div { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding-block: 12px; border-bottom: 1px solid #D6DEDE; font-size: 15px; }
.aa-meta dt { color: var(--aa-muted); flex: none; }
.aa-meta dd { font-weight: 500; text-align: right; min-width: 0; }

.aa-sec__head .aa-kicker { margin-bottom: -4px; }
.aa-chero ~ .aa-sec:not(:last-child) { padding-bottom: clamp(48px, 6vw, 80px); }

.aa-plan { background: var(--aa-card); border-radius: 28px; padding: clamp(24px, 4vw, 48px); display: grid; grid-template-columns: minmax(0, 4fr) minmax(0, 8fr); gap: 32px 56px; align-items: center; }
.aa-plan__delta b { display: block; font-weight: 500; font-size: clamp(64px, 9vw, 120px); line-height: .9; letter-spacing: -0.06em; color: var(--aa-orange); }
.aa-plan__delta span { display: block; margin-top: 12px; color: var(--aa-muted); }
.aa-bars { display: grid; gap: 18px; }
.aa-bar { display: grid; gap: 8px; }
.aa-bar__label { display: flex; justify-content: space-between; gap: 16px; font-size: 15px; }
.aa-bar__label b { font-weight: 600; font-variant-numeric: tabular-nums; }
.aa-bar__track { height: 44px; border-radius: 999px; background: #E6ECEC; overflow: hidden; }
.aa-bar__fill { height: 100%; width: var(--w); border-radius: 999px; background: #C3CDCD; }
.aa-bar--fact .aa-bar__fill { background: var(--aa-grad); }

.aa-story { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.aa-story > div { background: var(--aa-card); border-radius: 24px; padding: clamp(24px, 3vw, 32px); display: grid; gap: 12px; align-content: start; }
.aa-story > div:only-child { grid-column: 1 / -1; }
.aa-story p { color: var(--aa-muted); }

.aa-did { display: grid; grid-template-columns: repeat(var(--cols, 2), minmax(0, 1fr)); gap: 16px; }
.aa-did > li { border: 1.5px solid #D6DEDE; border-radius: 24px; padding: clamp(24px, 3vw, 28px); display: grid; gap: 12px; align-content: start; }
.aa-did > li:first-child { background: var(--aa-ink); border-color: var(--aa-ink); color: #fff; }
.aa-did > li:first-child p { color: var(--aa-dark-muted); }
.aa-did p { color: var(--aa-muted); font-size: 16px; }
.aa-did__label { color: var(--aa-orange); font-size: 14px; font-weight: 600; }
.aa-did .aa-chips { justify-content: flex-start; margin-top: 4px; }
.aa-did .aa-chips li { padding: 8px 14px; font-size: 14px; background: #E3E9E9; }
.aa-did .aa-chips li:nth-child(3n+2) { background: var(--aa-orange); }

@media (max-width: 960px) {
  .aa-chero__grid, .aa-plan, .aa-story, .aa-did { grid-template-columns: minmax(0, 1fr); }
}
</style>"""


def case_card(c, href):
    return f"""            <a class="aa-case" href="{href}">
              <div class="aa-case__top"><span class="aa-case__logo">{c['card_logo']}</span><div><b>{c['client']}</b><small>{c['card_sub']}</small></div></div>
              <p class="aa-case__num">{num(c['leads'])}<small>{plural(c['leads'], 'заявка', 'заявки', 'заявок')} по {num(c['cpl'])} ₽</small></p>
              <p>{c['card_text']}</p>
              <span class="aa-case__more">Открыть кейс<i>{ARROW}</i></span>
            </a>"""


def case_body(c, home, link):
    """home — адрес главной, link(slug) — адрес другого кейса."""
    leads_word = plural(c["leads"], "заявка", "заявки", "заявок")

    meta = [("Клиент", c["client"]), ("Ниша", c["niche"]), ("Формат", c["format"]), ("Канал", c["channel"])]
    if c["period"]:
        meta.append(("Период", c["period"]))
    meta_html = "\n".join(f"            <div><dt>{k}</dt><dd>{v}</dd></div>" for k, v in meta)

    stats = [("aa-stat aa-stat--hot", f"{num(c['cpl'])} ₽", "цена заявки"),
             ("aa-stat", money_short(c["budget"]), "рекламный бюджет")]
    if c["romi"]:
        stats += [("aa-stat", f"{c['romi'][1]}%", "рекордный ROMI"), ("aa-stat", f"{c['romi'][0]}%", "средний ROMI")]
    elif c["target"]:
        stats += [("aa-stat", f"до {num(c['target'])} ₽", "цель по цене заявки"),
                  ("aa-stat", c["format"], "формат")]
    else:
        stats += [("aa-stat", c["channel"], "канал"), ("aa-stat", c["format"], "формат")]
    stats_html = "\n".join(f'            <li class="{cls}"><b>{b}</b><span>{s}</span></li>' for cls, b, s in stats)

    plan = ""
    if c["target"]:
        pct = round(c["cpl"] / c["target"] * 100)
        plan = f"""
    <section class="aa-sec aa-sec--tight" aria-labelledby="aa-plan-title">
      <div class="aa-wrap">
        <div class="aa-sec__head">
          <p class="aa-kicker">Цель и результат</p>
          <h2 class="aa-h2" id="aa-plan-title">Цена заявки ниже цели</h2>
        </div>
        <div class="aa-plan">
          <p class="aa-plan__delta"><b>−{100 - pct}%</b><span>к цели по цене заявки</span></p>
          <div class="aa-bars">
            <div class="aa-bar">
              <div class="aa-bar__label"><span>Цель клиента</span><b>не дороже {num(c['target'])} ₽</b></div>
              <div class="aa-bar__track"><div class="aa-bar__fill" style="--w:100%"></div></div>
            </div>
            <div class="aa-bar aa-bar--fact">
              <div class="aa-bar__label"><span>Результат</span><b>{num(c['cpl'])} ₽ за заявку</b></div>
              <div class="aa-bar__track"><div class="aa-bar__fill" style="--w:{pct}%"></div></div>
            </div>
          </div>
        </div>
      </div>
    </section>
"""

    story = f"""          <div>
            <h3 class="aa-h3">О клиенте</h3>
            <p>{c['about']}</p>
          </div>"""
    if c["goal"]:
        story += f"""
          <div>
            <h3 class="aa-h3">Задача</h3>
            <p>{c['goal']}</p>
          </div>"""

    chips = ""
    if c["narrow"]:
        chips = '\n              <ul class="aa-chips" aria-label="Примеры узких аудиторий">' + "".join(f"<li>{n}</li>" for n in c["narrow"]) + "</ul>"
    vk = c["channel"].startswith("VK")
    did = [("Канал", c["channel"], "Таргетированная реклама ВКонтакте." if vk else "Таргетированная реклама.", ""),
           ("Аудитория", "Мамы", c["audience"], chips),
           ("Креативы", "Видео и изображения" if "изображ" in c["creatives"] else "Видео", c["creatives"], "")]
    if c["offer"]:
        did.append(("Оффер", c["offer"].rstrip("."), "Заявку оставляют на пробное занятие.", ""))
    did_html = "\n".join(f"""            <li>
              <span class="aa-did__label">{label}</span>
              <h3 class="aa-h3">{h}</h3>
              <p>{text}</p>{extra}
            </li>""" for label, h, text, extra in did)

    others = "\n".join(case_card(o, link(o["slug"])) for o in CASES if o["slug"] != c["slug"])

    return f"""<div class="aa" id="top">

  <header class="aa-head" id="aa-head">
    <div class="aa-wrap">
      <div class="aa-head__bar">
        <a class="aa-logo" href="{home}" aria-label="Alimov Agency — на главную"><i aria-hidden="true"></i>alimov</a>
        <button class="aa-burger" type="button" id="aa-burger" aria-expanded="false" aria-controls="aa-nav" aria-label="Открыть меню"><span></span><span></span></button>
        <nav class="aa-nav" id="aa-nav" aria-label="Разделы">
          <a href="{home}#services">Услуги</a>
          <a href="{home}#cases">Кейсы</a>
          <a href="{home}#faq">Вопросы</a>
          <a class="aa-btn" href="https://t.me/alimoffmaxim" target="_blank" rel="noopener">Обсудить проект
            <span class="aa-btn__ico">{TG}</span>
          </a>
        </nav>
      </div>
    </div>
  </header>

  <main>
    <section class="aa-chero">
      <div class="aa-wrap">
        <a class="aa-back" href="{home}#cases">{ARROW}Все кейсы</a>
        <div class="aa-chero__grid">
          <div class="aa-chero__text">
            <p class="aa-eyebrow">Кейс · <em>{c['channel']}</em></p>
            <h1 class="aa-h1">{c['title']}</h1>
          </div>
          <dl class="aa-meta">
{meta_html}
          </dl>
        </div>

        <div class="aa-stage">
          <div class="aa-stage__case">
            <span class="aa-tag">Результат</span>
            <p class="aa-stage__big">{num(c['leads'])}<small>{leads_word} за {num(c['budget'])} ₽</small></p>
          </div>
          <ul class="aa-stats">
{stats_html}
          </ul>
        </div>
      </div>
    </section>
{plan}
    <section class="aa-sec aa-sec--tight" aria-labelledby="aa-story-title">
      <div class="aa-wrap">
        <div class="aa-sec__head">
          <p class="aa-kicker">Клиент</p>
          <h2 class="aa-h2" id="aa-story-title">{c['niche']}</h2>
        </div>
        <div class="aa-story">
{story}
        </div>
      </div>
    </section>

    <section class="aa-sec aa-sec--flush" aria-labelledby="aa-did-title">
      <div class="aa-wrap">
        <div class="aa-sec__head">
          <p class="aa-kicker">Как получили заявки</p>
          <h2 class="aa-h2" id="aa-did-title">Что сделали</h2>
        </div>
        <ul class="aa-did" style="--cols:{2 if len(did) == 4 else 3}">
{did_html}
        </ul>
      </div>
    </section>

    <div class="aa-dark">
      <section class="aa-sec" id="cases" aria-labelledby="aa-cases-title">
        <div class="aa-wrap">
          <div class="aa-cases__head">
            <div class="aa-sec__head">
              <h2 class="aa-h2" id="aa-cases-title">Другие кейсы</h2>
              <p class="aa-muted">Детские онлайн-школы и сети офлайн-студий</p>
            </div>
            <div class="aa-arrows">
              <button class="aa-arrow" type="button" data-dir="-1" aria-label="Предыдущие кейсы"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
              <button class="aa-arrow" type="button" data-dir="1" aria-label="Следующие кейсы"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            </div>
          </div>
          <div class="aa-track" id="aa-track">
{others}
          </div>
          <p class="aa-note">* Instagram и Facebook принадлежат Meta Platforms Inc., деятельность которой признана экстремистской и запрещена в России.</p>
        </div>
      </section>

      {contact}
    </div>
  </main>
</div>"""


def case_fragment(c, home, link):
    head = f"<!--\n  Alimov Agency — кейс «{c['client']}».\n  Этот файл целиком вставляется в Tilda в блок T123 на странице {SITE}{c['slug']}.\n  Собран командой python3 site/build.py из site/cases.py — правьте там, а не здесь.\n-->"
    return "\n".join([head, fonts, "", style, CASE_CSS, "", case_body(c, home, link), "", script, ""])


# --- build -----------------------------------------------------------------

# главная: в предпросмотре ссылки на кейсы ведут на локальные страницы
preview_main = main
for c in CASES:
    preview_main = preview_main.replace(f'href="{SITE}{c["slug"]}"', f'href="cases/{c["slug"]}.html"')
preview_main = re.sub(r'(href="cases/[^"]+\.html") target="_blank" rel="noopener"', r"\1", preview_main)
(here / "index.html").write_text(page(
    "Alimov Agency — клиенты для детских школ",
    "Заявки для детских онлайн-школ и офлайн-студий из VK Рекламы: от 135 ₽ за заявку, ROMI до 1600% в кейсах.",
    preview_main), encoding="utf-8")
print("site/index.html")

out = here / "cases"
out.mkdir(exist_ok=True)
for c in CASES:
    desc = f"{num(c['leads'])} {plural(c['leads'], 'заявка', 'заявки', 'заявок')} по {num(c['cpl'])} ₽ для клиента {c['client']}.".replace(" ", " ")
    title = re.sub(r"&nbsp;", " ", c["title"])
    (out / f"{c['slug']}.t123.html").write_text(case_fragment(c, SITE, lambda s: f"{SITE}{s}"), encoding="utf-8")
    (out / f"{c['slug']}.html").write_text(page(
        f"{title} — кейс Alimov Agency", desc,
        case_fragment(c, "../index.html", lambda s: f"{s}.html")), encoding="utf-8")
    print(f"site/cases/{c['slug']}.t123.html, site/cases/{c['slug']}.html")
