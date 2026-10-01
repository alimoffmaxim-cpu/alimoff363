"""Собирает страницы сайта из tilda-t123.html и cases.py.

Запуск: python3 site/build.py

Что делает:
  site/tilda-t123.html           — обновляет карточки кейсов между метками cases:start и cases:end
  site/index.html                — главная для предпросмотра в браузере
  site/cases/<slug>.t123.html    — страница кейса для блока T123 в Tilda
  site/cases/<slug>.html         — та же страница кейса для предпросмотра

Стили, скрипт, блок контактов и подвал страницы кейса берутся из tilda-t123.html,
поэтому правки дизайна на главной сразу попадают и в кейсы.
"""
import re
import sys

sys.dont_write_bytecode = True  # не оставлять site/__pycache__ после сборки
from pathlib import Path

from cases import CASES

here = Path(__file__).parent
SITE = "https://alimov.agency/"
START, END = "<!-- cases:start -->", "<!-- cases:end -->"


def between(text, start, end):
    """Кусок text от start до end включительно."""
    a = text.index(start)
    b = text.index(end, a) + len(end)
    return text[a:b]


def page(title, description, body):
    return f"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{description}">
<meta name="theme-color" content="#E4E4E8">
<style>html {{ scroll-behavior: smooth; scroll-padding-top: 90px; }} body {{ margin: 0; background: #E4E4E8; }}</style>
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


def leads_word(c):
    return plural(c["leads"], "заявка", "заявки", "заявок")


ARROW = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m0 0-6-6m6 6-6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'


def case_card(c, href):
    """Карточка кейса: одна и та же на главной и в блоке «Другие кейсы»."""
    if c["target"]:
        pct = round(c["cpl"] / c["target"] * 100)
        meter = f"""<div class="aa-meter"><span>заявка <b>{num(c['cpl'])} ₽</b> при цели {num(c['target'])} ₽</span><div class="aa-meter__track"><div class="aa-meter__fill" style="--w:{pct}%"></div></div></div>"""
    elif c["romi"]:
        meter = f"""<div class="aa-meter"><span>ROMI <b>до {c['romi'][1]}%</b>, средний {c['romi'][0]}%</span></div>"""
    else:
        meter = f"""<div class="aa-meter"><span>бюджет <b>{money_short(c['budget'])}</b></span></div>"""
    return f"""            <a class="aa-case" href="{href}">
              <div class="aa-case__top"><span class="aa-case__logo">{c['card_logo']}</span><div><b>{c['client']}</b><small>{c['card_sub']}</small></div></div>
              <p class="aa-case__num">{num(c['leads'])}<small>{leads_word(c)} по {num(c['cpl'])} ₽</small></p>
              {meter}
              <p>{c['card_text']}</p>
              <span class="aa-case__more">Открыть кейс<i>{ARROW}</i></span>
            </a>"""


# --- главная: вставляем карточки кейсов -------------------------------------

src = here / "tilda-t123.html"
main = src.read_text(encoding="utf-8")
cards = "\n".join(case_card(c, f"{SITE}{c['slug']}") for c in CASES)
main = main.replace(between(main, START, END), f"{START}\n{cards}\n{END}")

# график «Цена заявки по кейсам»: полоса — цена заявки, белая отметка — цель клиента
scale = max(max(c["cpl"], c["target"] or 0) for c in CASES) * 1.08
rows = []
for c in sorted(CASES, key=lambda c: c["cpl"]):
    goal = f'<i class="aa-chart__goal" style="--g:{c["target"] / scale * 100:.1f}%" title="цель {num(c["target"])} ₽"></i>' if c["target"] else ""
    rows.append(f'              <li><span>{c["short"]}</span><div class="aa-chart__track"><i class="aa-chart__bar" style="--w:{c["cpl"] / scale * 100:.1f}%"></i>{goal}</div><b>{num(c["cpl"])} ₽</b></li>')
chart = f"""          <figure class="aa-chart">
            <figcaption><b>Цена заявки по кейсам</b><span class="aa-chart__legend">цель клиента</span></figcaption>
            <ol>
{chr(10).join(rows)}
            </ol>
          </figure>"""
# первый экран: карточка кейса, которая меняется вместе с нишей в заголовке
import json
heroes = [c for c in CASES if c.get("hero")]
order = {"genius_school": 0, "irbis_2324": 1, "tetrica_case": 2, "uchi_case": 3}
heroes.sort(key=lambda c: order.get(c["slug"], 99))
items = [{
    "word": c["hero"]["word"], "label": f"Кейс · {c['client']}",
    "badge": c["hero"]["badge"], "leads": num(c["leads"]), "count": c["leads"], "desc": c["hero"]["desc"],
    "cpl": f"{num(c['cpl'])} ₽", "row_label": c["hero"]["row"][0], "row_value": c["hero"]["row"][1],
    "budget": f"{num(c['budget'])} ₽", "href": f"{SITE}{c['slug']}",
} for c in heroes]
f0 = items[0]
dots = "\n".join(f'            <button class="aa-dot" type="button" aria-pressed="{"true" if i == 0 else "false"}">{c["short"].split(",")[0]}</button>' for i, c in enumerate(heroes))
hero_html = f"""        <div class="aa-hero__side">
          <div class="aa-stack">
            <div class="aa-sticker aa-sticker--main">
              <small data-k="label">{f0['label']}</small>
              <p class="aa-seal" data-k="badge">{f0['badge']}</p>
              <p class="aa-big" data-k="leads" data-count="{f0['count']}">{f0['leads']}</p>
              <small data-k="desc">{f0['desc']}</small>
            </div>
            <dl class="aa-sticker aa-sticker--table">
              <div><dt>Цена заявки</dt><dd data-k="cpl">{f0['cpl']}</dd></div>
              <div><dt data-k="row_label">{f0['row_label']}</dt><dd data-k="row_value">{f0['row_value']}</dd></div>
              <div><dt>Бюджет</dt><dd data-k="budget">{f0['budget']}</dd></div>
              <a data-k="href" href="{f0['href']}">Открыть кейс <span aria-hidden="true">→</span></a>
            </dl>
          </div>
          <div class="aa-dots" role="group" aria-label="Кейсы на первом экране">
{dots}
          </div>
          <script type="application/json" id="aa-hero-data">{json.dumps(items, ensure_ascii=False)}</script>
        </div>"""
H_START, H_END = "<!-- hero:start -->", "<!-- hero:end -->"
main = main.replace(between(main, H_START, H_END), f"{H_START}\n{hero_html}\n{H_END}")

CH_START, CH_END = "<!-- chart:start -->", "<!-- chart:end -->"
main = main.replace(between(main, CH_START, CH_END), f"{CH_START}\n{chart}\n{CH_END}")
src.write_text(main, encoding="utf-8")
print("site/tilda-t123.html: карточки кейсов обновлены")

fonts = "\n".join(line for line in main.splitlines() if "fonts.g" in line)
style = between(main, "<style>", "</style>")
script = between(main, "<script>", "</script>")
# блок контактов, конец <main> и подвал
contact = between(main, '<section class="aa-sec aa-sec--flush" id="contact"', "</footer>")


# --- страница кейса ----------------------------------------------------------

CASE_CSS = """<style>
/* case page: facts list beside the title, dark result board, A→B, method cards, highlight, plan-vs-fact */
.aa-chero { padding-block: clamp(36px, 5vw, 64px) clamp(56px, 7vw, 96px); }
.aa-back { display: inline-flex; align-items: center; gap: 8px; margin-bottom: clamp(24px, 3vw, 40px); font-size: 15px; font-weight: 600; text-decoration: none; color: var(--aa-muted); transition: color .2s; }
.aa-back:hover { color: var(--aa-ink); }
.aa-back svg { width: 16px; height: 16px; transform: rotate(180deg); }
.aa-chero__grid { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: 32px 64px; align-items: end; }
.aa-chero__text { display: grid; gap: 22px; justify-items: start; }
.aa-facts { border-top: 1px solid var(--aa-ink); }
.aa-facts div { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding-block: 13px; border-bottom: 1px solid var(--aa-line); font-size: 15px; }
.aa-facts dt { color: var(--aa-muted); flex: none; }
.aa-facts dd { font-weight: 600; text-align: right; min-width: 0; }

.aa-board { position: relative; overflow: hidden; isolation: isolate; margin-top: clamp(40px, 5vw, 64px); display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 28px 48px; align-items: end; padding: clamp(28px, 4vw, 52px); border-radius: 28px; background: var(--aa-dark); color: #fff; }
.aa-board::after { content: ""; position: absolute; z-index: -1; right: -10%; top: -70%; width: 50%; aspect-ratio: 1; border-radius: 50%; border: 1px solid rgba(230, 0, 126, .45); box-shadow: 0 0 0 60px rgba(230, 0, 126, .05), 0 0 0 120px rgba(230, 0, 126, .03); }
.aa-board__main { display: grid; gap: 12px; justify-items: start; }
.aa-board__main .aa-chip { color: var(--aa-dark-muted); }
.aa-board__main small { font-size: 16px; color: #D6D6DD; }
.aa-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; background: var(--aa-dark-line); border: 1px solid var(--aa-dark-line); border-radius: 16px; overflow: hidden; }
.aa-tile { background: var(--aa-dark); padding: 18px 20px; display: grid; gap: 4px; }
.aa-tile b { font-family: var(--aa-display); font-weight: 600; font-size: clamp(22px, 2.4vw, 30px); letter-spacing: -0.04em; line-height: 1.1; font-variant-numeric: tabular-nums; }
.aa-tile span { color: var(--aa-dark-muted); font-size: 14px; }
.aa-tile--hot b { color: var(--aa-accent); }

.aa-csec { padding-block: 0 clamp(72px, 9vw, 112px); }
.aa-about { font-size: clamp(18px, 1.7vw, 22px); line-height: 1.5; max-width: 40em; }

.aa-ab { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 16px; align-items: center; }
.aa-ab__card { align-self: stretch; display: grid; gap: 18px; align-content: start; padding: clamp(24px, 3vw, 36px); border-radius: var(--aa-r); background: var(--aa-card); font-size: clamp(17px, 1.5vw, 20px); line-height: 1.45; }
.aa-ab__card--b { background: var(--aa-dark); color: #fff; }
.aa-ab__label { display: flex; align-items: center; gap: 12px; font-size: 13px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--aa-muted); }
.aa-ab__label b { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--aa-line); color: var(--aa-ink); font-family: var(--aa-display); font-size: 18px; font-weight: 600; letter-spacing: 0; }
.aa-ab__card--b .aa-ab__label { color: var(--aa-dark-muted); }
.aa-ab__card--b .aa-ab__label b { border: 0; background: var(--aa-accent); color: var(--aa-on-accent); }
.aa-ab__arrow { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%; background: var(--aa-card); color: var(--aa-accent); }
.aa-ab__arrow svg { width: 20px; height: 20px; }

.aa-did { display: grid; grid-template-columns: repeat(var(--cols, 2), minmax(0, 1fr)); gap: 16px; }
.aa-did > li { background: var(--aa-card); border-radius: var(--aa-r); padding: clamp(24px, 3vw, 30px); display: grid; gap: 12px; align-content: start; }
.aa-did p { color: var(--aa-muted); font-size: 16px; }
.aa-did__label { display: inline-flex; align-items: center; gap: 8px; color: var(--aa-muted); font-size: 13px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
.aa-did__label::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--aa-accent); }
.aa-did .aa-niches { margin-top: 2px; }

.aa-hl { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: 20px 56px; align-items: end; padding-top: clamp(32px, 4vw, 48px); border-top: 1px solid var(--aa-ink); }
.aa-hl__head { display: grid; gap: 18px; justify-items: start; }
.aa-hl .aa-h2 { font-size: clamp(30px, 4.2vw, 56px); }
.aa-hl__text { color: var(--aa-muted); font-size: clamp(17px, 1.5vw, 19px); }

.aa-plan { background: var(--aa-card); border-radius: var(--aa-r); padding: clamp(24px, 4vw, 48px); display: grid; grid-template-columns: minmax(0, 4fr) minmax(0, 8fr); gap: 28px 56px; align-items: center; }
.aa-plan__delta b { display: block; font-family: var(--aa-display); font-weight: 600; font-size: clamp(56px, 8vw, 104px); line-height: .95; letter-spacing: -0.06em; color: var(--aa-accent); }
.aa-plan__delta span { display: block; margin-top: 10px; color: var(--aa-muted); }
.aa-bars { display: grid; gap: 22px; }
.aa-bar { display: grid; gap: 10px; }
.aa-bar__label { display: flex; justify-content: space-between; gap: 16px; font-size: 15px; }
.aa-bar__label b { font-weight: 600; font-variant-numeric: tabular-nums; }
.aa-bar__track { height: 12px; border-radius: 12px; background: var(--aa-paper); overflow: hidden; }
.aa-bar__fill { height: 100%; width: var(--w); border-radius: 12px; background: #B9B9C2; }
.aa-bar--fact .aa-bar__fill { background: var(--aa-accent); }

.aa-dark + .aa-sec { padding-top: clamp(72px, 10vw, 128px); }

@media (max-width: 960px) {
  .aa-chero__grid, .aa-board, .aa-plan, .aa-did, .aa-ab, .aa-hl { grid-template-columns: minmax(0, 1fr); }
  .aa-ab__arrow { justify-self: center; transform: rotate(90deg); }
}
</style>"""


def case_body(c, home, link):
    """home — адрес главной, link(slug) — адрес другого кейса."""
    meta = [("Клиент", c["client"]), ("Ниша", c["niche"]), ("Формат", c["format"]), ("Канал", c["channel"])]
    if c["period"]:
        meta.append(("Период", c["period"]))
    meta_html = "\n".join(f"            <div><dt>{k}</dt><dd>{v}</dd></div>" for k, v in meta)

    tiles = [("aa-tile aa-tile--hot", f"{num(c['cpl'])} ₽", "цена заявки"),
             ("aa-tile", money_short(c["budget"]), "рекламный бюджет")]
    if c["romi"]:
        tiles += [("aa-tile", f"{c['romi'][1]}%", "рекордный ROMI"), ("aa-tile", f"{c['romi'][0]}%", "средний ROMI")]
    elif c["target"]:
        tiles += [("aa-tile", f"до {num(c['target'])} ₽", "цель по цене заявки"), ("aa-tile", c["format"], "формат")]
    else:
        tiles += [("aa-tile", c["channel"], "канал"), ("aa-tile", c["format"], "формат")]
    tiles_html = "\n".join(f'            <li class="{cls}"><b>{b}</b><span>{s}</span></li>' for cls, b, s in tiles)

    draft_a = "Что было до начала работы: была ли реклама, сколько стоила заявка, сколько заявок приходило в месяц."
    point_a = f"<p>{c['point_a']}</p>" if c["point_a"] else f"<p data-draft>{draft_a}</p>"
    point_b_text = c["point_b"] or c["goal"]
    point_b = f"<p>{point_b_text}</p>" if point_b_text else "<p data-draft>Какую цель ставил клиент: сколько заявок и по какой цене.</p>"
    hl_title, hl_text = c["highlight"]

    narrow = ""
    if c["narrow"]:
        narrow = '\n              <ul class="aa-niches" aria-label="Примеры узких аудиторий">' + "".join(f"<li>{n}</li>" for n in c["narrow"]) + "</ul>"
    vk = c["channel"].startswith("VK")
    did = [("Канал", c["channel"], "Таргетированная реклама ВКонтакте." if vk else "Таргетированная реклама.", ""),
           ("Аудитория", "Мамы", c["audience"], narrow),
           ("Креативы", "Видео и изображения" if "изображ" in c["creatives"] else "Видео", c["creatives"], "")]
    if c["offer"]:
        did.append(("Оффер", c["offer"].rstrip("."), "Заявку оставляют на пробное занятие.", ""))
    did_html = "\n".join(f"""            <li>
              <span class="aa-did__label">{label}</span>
              <h3 class="aa-h3">{h}</h3>
              <p>{text}</p>{extra}
            </li>""" for label, h, text, extra in did)

    plan = ""
    if c["target"]:
        pct = round(c["cpl"] / c["target"] * 100)
        plan = f"""
    <section class="aa-csec" aria-labelledby="aa-plan-title">
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

    # три следующих кейса по кругу
    i = next(k for k, o in enumerate(CASES) if o["slug"] == c["slug"])
    others = [CASES[(i + k) % len(CASES)] for k in (1, 2, 3)]
    others_html = "\n".join(case_card(o, link(o["slug"])) for o in others)

    return f"""<div class="aa" id="top">

  <header class="aa-head" id="aa-head">
    <div class="aa-wrap">
      <div class="aa-head__bar">
        <a class="aa-logo" href="{home}" aria-label="Alimov Agency — на главную"><span>alimov</span><i aria-hidden="true"></i></a>
        <button class="aa-burger" type="button" id="aa-burger" aria-expanded="false" aria-controls="aa-nav" aria-label="Открыть меню"><span></span><span></span></button>
        <nav class="aa-nav" id="aa-nav" aria-label="Разделы">
          <a href="{home}#services">Услуги</a>
          <a href="{home}#cases">Кейсы</a>
          <a href="{home}#faq">Вопросы</a>
          <a class="aa-btn aa-btn--dark" href="https://t.me/alimoffmaxim" target="_blank" rel="noopener">Обсудить проект</a>
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
            <span class="aa-chip">Кейс · {c['channel']}</span>
            <h1 class="aa-h1">{c['title']}</h1>
          </div>
          <dl class="aa-facts">
{meta_html}
          </dl>
        </div>

        <div class="aa-board">
          <div class="aa-board__main">
            <span class="aa-chip">Результат</span>
            <p class="aa-big" data-count="{c['leads']}">{num(c['leads'])}</p>
            <small>{leads_word(c)} за {num(c['budget'])} ₽</small>
          </div>
          <ul class="aa-tiles">
{tiles_html}
          </ul>
        </div>
      </div>
    </section>

    <section class="aa-csec" aria-labelledby="aa-story-title">
      <div class="aa-wrap">
        <div class="aa-sec__head">
          <p class="aa-kicker">Клиент</p>
          <h2 class="aa-h2" id="aa-story-title">{c['niche']}</h2>
        </div>
        <p class="aa-about">{c['about']}</p>
      </div>
    </section>

    <section class="aa-csec" aria-labelledby="aa-ab-title">
      <div class="aa-wrap">
        <div class="aa-sec__head">
          <p class="aa-kicker">Задача</p>
          <h2 class="aa-h2" id="aa-ab-title">Из точки А в&nbsp;точку&nbsp;Б</h2>
        </div>
        <div class="aa-ab">
          <div class="aa-ab__card">
            <span class="aa-ab__label"><b>А</b>Было</span>
            {point_a}
          </div>
          <span class="aa-ab__arrow" aria-hidden="true">{ARROW}</span>
          <div class="aa-ab__card aa-ab__card--b">
            <span class="aa-ab__label"><b>Б</b>Цель</span>
            {point_b}
          </div>
        </div>
      </div>
    </section>

    <section class="aa-csec" aria-labelledby="aa-did-title">
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

    <section class="aa-csec" aria-labelledby="aa-hl-title">
      <div class="aa-wrap">
        <div class="aa-hl">
          <div class="aa-hl__head">
            <p class="aa-kicker">Самое крутое в проекте</p>
            <h2 class="aa-h2" id="aa-hl-title"><mark class="aa-mark aa-mark--solid">{hl_title}</mark></h2>
          </div>
          <p class="aa-hl__text">{hl_text}</p>
        </div>
      </div>
    </section>
{plan}
    <div class="aa-dark">
      <section class="aa-sec" id="cases" aria-labelledby="aa-cases-title">
        <div class="aa-wrap">
          <div class="aa-sec__row">
            <div class="aa-sec__head">
              <p class="aa-kicker">Ещё результаты</p>
              <h2 class="aa-h2" id="aa-cases-title">Другие кейсы</h2>
            </div>
            <a class="aa-btn aa-btn--accent" href="{home}#cases">Все кейсы</a>
          </div>
          <div class="aa-cases">
{others_html}
          </div>
          <p class="aa-note">* Instagram и Facebook принадлежат Meta Platforms Inc., деятельность которой признана экстремистской и запрещена в России.</p>
        </div>
      </section>
    </div>

    {contact.replace('href="#top"', f'href="{home}"', 1)}
</div>"""


def case_fragment(c, home, link):
    head = f"<!--\n  Alimov Agency — кейс «{c['client']}».\n  Этот файл целиком вставляется в Tilda в блок T123 на странице {SITE}{c['slug']}.\n  Собран командой python3 site/build.py из site/cases.py — правьте там, а не здесь.\n-->"
    return "\n".join([head, fonts, "", style, CASE_CSS, "", case_body(c, home, link), "", script, ""])


# --- build -----------------------------------------------------------------

# главная: в предпросмотре ссылки на кейсы ведут на локальные страницы
preview_main = main
for c in CASES:
    preview_main = preview_main.replace(f'href="{SITE}{c["slug"]}"', f'href="cases/{c["slug"]}.html"')
    preview_main = preview_main.replace(f'"href": "{SITE}{c["slug"]}"', f'"href": "cases/{c["slug"]}.html"')
(here / "index.html").write_text(page(
    "Alimov Agency — клиенты для детских школ",
    "Заявки для детских онлайн-школ и офлайн-студий из VK Рекламы: от 135 ₽ за заявку, ROMI до 1600% в кейсах.",
    preview_main), encoding="utf-8")
print("site/index.html")

out = here / "cases"
out.mkdir(exist_ok=True)
for c in CASES:
    desc = f"{num(c['leads'])} {leads_word(c)} по {num(c['cpl'])} ₽ для клиента {c['client']}.".replace(" ", " ")
    title = re.sub(r"&nbsp;", " ", c["title"])
    (out / f"{c['slug']}.t123.html").write_text(case_fragment(c, SITE, lambda s: f"{SITE}{s}"), encoding="utf-8")
    (out / f"{c['slug']}.html").write_text(page(
        f"{title} — кейс Alimov Agency", desc,
        case_fragment(c, "../index.html", lambda s: f"{s}.html")), encoding="utf-8")
    print(f"site/cases/{c['slug']}.t123.html, site/cases/{c['slug']}.html")
