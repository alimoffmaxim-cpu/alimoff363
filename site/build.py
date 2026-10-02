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
import json
import re
import sys

sys.dont_write_bytecode = True  # не оставлять site/__pycache__ после сборки
from pathlib import Path

from cases import CASES

here = Path(__file__).parent
SITE = "https://alimov.agency/"
START, END = "<!-- cases:start -->", "<!-- cases:end -->"

# SEO: заголовки и описания страниц. Их же нужно вписать в настройки страниц Tilda (см. site/SEO.md).
BRAND = "Alimov Agency"
MAIN_TITLE = "Реклама детских школ ВКонтакте — заявки от 135 ₽ | Alimov Agency"
MAIN_DESC = ("Таргетированная реклама VK для детских онлайн-школ и сетей студий. "
             "37 784 заявки в 5 кейсах, цена заявки от 135 ₽, ROMI до 1600%. Обсудим вашу школу в Telegram.")
SAME_AS = ["https://t.me/alimov_pro", "https://t.me/alimoffmaxim", "https://vk.com/alimovmaksim"]


def plain(text):
    return re.sub(r"<[^>]+>", "", text).replace("&nbsp;", " ").replace("\u00a0", " ").strip()


def case_title(c):
    t = f"Кейс: {plain(c['title'])} | {BRAND}"
    return t if len(t) <= 70 else f"Кейс: {plain(c['title'])}"


def case_desc(c):
    where = "ВКонтакте" if c["channel"].startswith("VK") else ""
    first = f"{plain(c['title'])} из таргетированной рекламы {where}".strip() + "."
    if c["romi"]:
        second = f"Средний ROMI {c['romi'][0]}%, рекордный {c['romi'][1]}%."
    else:
        second = f"Цена заявки {plain(num(c['cpl']))} ₽, бюджет {plain(money_short(c['budget']))}."
    full = f"{first} {second} Какие аудитории и креативы сработали."
    return full if len(full) <= 160 else f"{first} {second}"


def ld(data):
    """JSON-LD для поисковиков (Google и Яндекс читают его и в теле страницы)."""
    return '<script type="application/ld+json">' + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "</script>"


ORG = {"@type": "ProfessionalService", "@id": f"{SITE}#org", "name": BRAND, "url": SITE,
       "description": "Таргетированная реклама ВКонтакте для детских онлайн-школ и сетей офлайн-студий.",
       "areaServed": {"@type": "Country", "name": "Россия"}, "sameAs": SAME_AS,
       "knowsAbout": ["таргетированная реклама ВКонтакте", "VK Ads", "реклама детских школ", "реклама онлайн-школ"]}


def between(text, start, end):
    """Кусок text от start до end включительно."""
    a = text.index(start)
    b = text.index(end, a) + len(end)
    return text[a:b]


def page(title, description, body, url, image):
    """Полная HTML-страница: для предпросмотра и на случай хостинга вне Tilda."""
    return f"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{description}">
<link rel="canonical" href="{url}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:type" content="website">
<meta property="og:locale" content="ru_RU">
<meta property="og:site_name" content="{BRAND}">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:image" content="{image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="{SITE}favicon.svg" type="image/svg+xml">
<meta name="theme-color" content="#0B0B0D">
<style>html {{ scroll-behavior: smooth; scroll-padding-top: 90px; }} body {{ margin: 0; background: #E6E6EA; }}</style>
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
heroes = [c for c in CASES if c.get("hero")]
order = {"genius_school": 0, "irbis_case": 1, "tetrica_case": 2, "uchi_case": 3}
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

# разметка Schema.org для главной; вопросы берутся из блока «Вопросы» (кроме черновых)
faq = []
for m in re.finditer(r'<details>\s*<summary[^>]*>(.*?)<i[^>]*></i></summary>\s*<p([^>]*)>(.*?)</p>', main, re.S):
    if "data-draft" in m.group(2):
        continue
    faq.append({"@type": "Question", "name": plain(m.group(1)),
                "acceptedAnswer": {"@type": "Answer", "text": plain(m.group(3))}})
schema = {"@context": "https://schema.org", "@graph": [
    ORG,
    {"@type": "WebSite", "@id": f"{SITE}#site", "url": SITE, "name": BRAND, "inLanguage": "ru", "publisher": {"@id": f"{SITE}#org"}},
    {"@type": "Service", "name": "Таргетированная реклама ВКонтакте для детских школ", "serviceType": "Таргетированная реклама VK Ads",
     "provider": {"@id": f"{SITE}#org"}, "areaServed": {"@type": "Country", "name": "Россия"},
     "audience": {"@type": "Audience", "audienceType": "Детские онлайн-школы, сети детских студий и образовательные центры"}},
    {"@type": "ItemList", "name": "Кейсы по рекламе детских школ", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "url": f"{SITE}{c['slug']}", "name": plain(c["title"])} for i, c in enumerate(CASES)]},
    {"@type": "FAQPage", "mainEntity": faq},
]}
SC_START, SC_END = "<!-- schema:start -->", "<!-- schema:end -->"
main = main.replace(between(main, SC_START, SC_END), f"{SC_START}\n{ld(schema)}\n{SC_END}")
src.write_text(main, encoding="utf-8")
print("site/tilda-t123.html: карточки кейсов обновлены")

fonts = "\n".join(line for line in main.splitlines() if "fonts.g" in line)
style = between(main, "<style>", "</style>")
script = between(main, "<script>", "</script>")
# блок контактов, конец <main> и подвал
contact = between(main, '<section class="aa-sec aa-sec--flush" id="contact"', "</footer>")


# --- страница кейса ----------------------------------------------------------

CASE_CSS = """<style>
.aa-rings--case { width: min(760px, 90vw); right: max(-26vw, -380px); top: -300px; }
/* case page: facts list beside the title, dark result board, A→B, method cards, highlight, plan-vs-fact */
.aa-chero { position: relative; isolation: isolate; padding-block: clamp(36px, 5vw, 64px) clamp(56px, 7vw, 96px); }
.aa-crumbs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: clamp(24px, 3vw, 40px); font-size: 14px; color: var(--aa-muted); }
.aa-crumbs a { color: var(--aa-muted); text-decoration: none; transition: color .2s; }
.aa-crumbs a:hover { color: var(--aa-ink); }
.aa-crumbs [aria-current] { color: var(--aa-ink); font-weight: 600; }
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

.aa-stages { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; counter-reset: none; }
.aa-stage { background: var(--aa-card); border-radius: var(--aa-r); padding: clamp(24px, 3vw, 32px); display: grid; gap: 12px; align-content: start; }
.aa-stage:last-child { background: var(--aa-dark); color: #fff; }
.aa-stage__n { justify-self: start; padding: 5px 12px; border-radius: 999px; background: var(--aa-accent); color: var(--aa-on-accent); font-size: 13px; font-weight: 600; }
.aa-stage__period { color: var(--aa-muted); font-size: 15px; }
.aa-stage:last-child .aa-stage__period, .aa-stage:last-child > p:last-child { color: var(--aa-dark-muted); }
.aa-stage__nums { display: flex; flex-wrap: wrap; gap: 10px 28px; padding-block: 8px; }
.aa-stage__nums li { display: grid; gap: 2px; }
.aa-stage__nums b { font-family: var(--aa-display); font-weight: 600; font-size: clamp(22px, 2.4vw, 30px); letter-spacing: -0.04em; line-height: 1.1; }
.aa-stage__nums span { font-size: 13px; color: var(--aa-muted); }
.aa-stage:last-child .aa-stage__nums span { color: var(--aa-dark-muted); }
.aa-stage > p:last-child { color: var(--aa-muted); }
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
  .aa-chero__grid, .aa-board, .aa-plan, .aa-did, .aa-ab, .aa-hl, .aa-stages { grid-template-columns: minmax(0, 1fr); }
  .aa-ab__arrow { justify-self: center; transform: rotate(90deg); }
}
</style>"""


def case_body(c, home, link, publish=False):
    """home — адрес главной, link(slug) — адрес другого кейса."""
    meta = [("Клиент", c["client"]), ("Ниша", c["niche"]), ("Формат", c["format"]), ("Канал", c["channel"])]
    if c["period"]:
        meta.append(("Период", c["period"]))
    meta_html = "\n".join(f"            <div><dt>{k}</dt><dd>{v}</dd></div>" for k, v in meta)

    tiles = [("aa-tile aa-tile--hot", f"{num(c['cpl'])} ₽", "цена заявки"),
             ("aa-tile", money_short(c["budget"]), "рекламный бюджет")]
    if c.get("stages"):
        first, last = c["stages"][0], c["stages"][-1]
        tiles += [("aa-tile", f"{num(first['cpl'])} → {num(last['cpl'])} ₽", "цена заявки: тест → масштаб"),
                  ("aa-tile", f"×{round(last['budget'] / first['budget'])}", "рост бюджета после теста")]
    elif c["romi"]:
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
    stages_section = ""
    if c.get("stages"):
        cards = []
        for i, st in enumerate(c["stages"], 1):
            goal = f'<li><b>до {num(st["target"])} ₽</b><span>цель по цене заявки</span></li>' if st["target"] else ""
            cards.append(f"""          <li class="aa-stage">
            <span class="aa-stage__n">Этап {i}</span>
            <h3 class="aa-h3">{st['name']}</h3>
            <p class="aa-stage__period">{st['period']}</p>
            <ul class="aa-stage__nums"><li><b>{num(st['leads'])}</b><span>{plural(st['leads'], 'заявка', 'заявки', 'заявок')}</span></li><li><b>{num(st['cpl'])} ₽</b><span>цена заявки</span></li><li><b>{money_short(st['budget'])}</b><span>бюджет</span></li>{goal}</ul>
            <p>{st['text']}</p>
          </li>""")
        stages_section = f"""    <section class="aa-csec" aria-labelledby="aa-stages-title">
      <div class="aa-wrap">
        <div class="aa-sec__head">
          <p class="aa-kicker">Ход проекта</p>
          <h2 class="aa-h2" id="aa-stages-title">Этапы проекта</h2>
        </div>
        <ol class="aa-stages">
{chr(10).join(cards)}
        </ol>
      </div>
    </section>
"""
    if not publish or c["point_a"]:
        ab_section = f"""    <section class="aa-csec" aria-labelledby="aa-ab-title">
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
"""
    elif point_b_text:
        # для публикации без «Точки А»: показываем только задачу клиента
        ab_section = f"""    <section class="aa-csec" aria-labelledby="aa-ab-title">
      <div class="aa-wrap">
        <div class="aa-sec__head">
          <p class="aa-kicker">Задача</p>
          <h2 class="aa-h2" id="aa-ab-title">Задача клиента</h2>
        </div>
        <p class="aa-about">{point_b_text}</p>
      </div>
    </section>
"""
    else:
        ab_section = ""

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
  <div class="aa-bg" aria-hidden="true"><i class="aa-blob aa-blob--1"></i><i class="aa-blob aa-blob--2"></i><i class="aa-blob aa-blob--3"></i></div>

  <header class="aa-head" id="aa-head">
    <div class="aa-wrap">
      <div class="aa-head__bar">
        <a class="aa-logo" href="{home}" aria-label="Alimov Agency — на главную"><svg class="aa-logo__svg" viewBox="3.2 23.2 494.2 78.3" aria-hidden="true" focusable="false"><path d="M21.150000000000002 101.5Q16.05 101.5 12.0 99.525Q7.95 97.55 5.6 93.875Q3.25 90.2 3.25 85.05Q3.25 80.65 5.425000000000001 77.25Q7.6000000000000005 73.85 12.000000000000002 71.65Q16.400000000000002 69.45 23.075000000000003 68.67500000000001Q29.75 67.9 38.7 68.7L38.85 78.9Q34.1 78.05 30.275000000000002 78.025Q26.450000000000003 78.0 23.775000000000002 78.675Q21.1 79.35 19.65 80.75Q18.2 82.15 18.2 84.2Q18.2 86.85 20.225 88.25Q22.25 89.65 25.650000000000002 89.65Q28.6 89.65 30.975 88.6Q33.35 87.55 34.775000000000006 85.525Q36.2 83.5 36.2 80.55V68.9Q36.2 66.15 35.05 64.05Q33.9 61.949999999999996 31.425 60.77499999999999Q28.950000000000003 59.599999999999994 24.85 59.599999999999994Q20.900000000000002 59.599999999999994 17.0 60.77499999999999Q13.100000000000001 61.949999999999996 10.0 64.3L5.800000000000001 53.05Q10.75 49.949999999999996 16.4 48.474999999999994Q22.05 47.0 27.5 47.0Q34.7 47.0 40.175000000000004 49.3Q45.650000000000006 51.599999999999994 48.75 56.39999999999999Q51.85 61.199999999999996 51.85 68.7V100.0H37.7V94.6Q35.25 97.9 30.950000000000003 99.7Q26.650000000000002 101.5 21.150000000000002 101.5ZM59.8 100.0V28.0H76.2V100.0ZM84.85 100.0V49.0H101.25V100.0ZM93.05 41.449999999999996Q89.1 41.449999999999996 86.175 38.974999999999994Q83.25 36.5 83.25 32.3Q83.25 28.099999999999994 86.175 25.64999999999999Q89.1 23.19999999999999 93.05 23.19999999999999Q97.05 23.19999999999999 99.94999999999999 25.64999999999999Q102.85 28.099999999999994 102.85 32.3Q102.85 36.5 99.94999999999999 38.974999999999994Q97.05 41.449999999999996 93.05 41.449999999999996ZM109.89999999999999 100.0V49.0H126.3V55.3Q128.15 52.699999999999996 130.65 50.974999999999994Q133.15 49.25 136.0 48.375Q138.85 47.5 141.75 47.5Q147.35 47.5 151.425 50.025Q155.5 52.55 157.0 56.8Q160.0 51.949999999999996 165.05 49.724999999999994Q170.1 47.5 175.8 47.5Q183.2 47.5 187.45 50.325Q191.7 53.15 193.475 57.625Q195.25 62.1 195.25 67.1V100.0H178.85V71.8Q178.85 67.5 176.6 64.925Q174.35 62.35 170.05 62.35Q167.35 62.35 165.25 63.5Q163.15 64.65 161.97500000000002 66.575Q160.8 68.5 160.8 70.9V100.0H144.4V71.8Q144.4 67.5 142.125 64.925Q139.85 62.35 135.6 62.35Q132.85 62.35 130.75 63.5Q128.65 64.65 127.475 66.575Q126.3 68.5 126.3 70.9V100.0ZM227.75 101.5Q219.4 101.5 213.0 97.825Q206.6 94.15 202.975 88.0Q199.35 81.85 199.35 74.5Q199.35 69.15 201.425 64.275Q203.5 59.4 207.3 55.625Q211.1 51.849999999999994 216.3 49.675Q221.5 47.5 227.75 47.5Q236.1 47.5 242.5 51.175Q248.9 54.849999999999994 252.5 61.0Q256.1 67.15 256.1 74.5Q256.1 79.85 254.05 84.725Q252.0 89.6 248.2 93.35Q244.4 97.1 239.2 99.3Q234.0 101.5 227.75 101.5ZM227.75 87.4Q231.25 87.4 234.05 85.825Q236.85 84.25 238.45 81.35Q240.05 78.45 240.05 74.5Q240.05 70.5 238.47500000000002 67.625Q236.9 64.75 234.10000000000002 63.175Q231.3 61.599999999999994 227.75 61.599999999999994Q224.2 61.599999999999994 221.39999999999998 63.175Q218.6 64.75 217.0 67.625Q215.4 70.5 215.4 74.5Q215.4 78.45 217.025 81.35Q218.65 84.25 221.45 85.825Q224.25 87.4 227.75 87.4ZM272.7 100.0 254.70000000000002 49.0H272.3L283.15 85.85H281.35L291.95 49.0H309.15L291.8 100.0Z" fill="currentColor"/><path d="M327.4305 100.0 336.291 76.9H341.07599999999996L350.118 100.0H345.2835L343.32 94.7695H334.03049999999996L332.133 100.0ZM335.0865 91.123H342.231L338.601 81.751ZM371.40299999999996 100.495Q368.6805 100.495 366.32925 99.65350000000001Q363.97799999999995 98.812 362.2125 97.24449999999999Q360.44699999999995 95.67699999999999 359.457 93.45775Q358.467 91.2385 358.467 88.483Q358.467 85.72749999999999 359.41575 83.5Q360.36449999999996 81.27250000000001 362.0805 79.6885Q363.7965 78.1045 366.09 77.25475Q368.38349999999997 76.405 371.073 76.405Q372.3105 76.405 373.614 76.60300000000001Q374.91749999999996 76.801 376.21274999999997 77.263Q377.508 77.725 378.69599999999997 78.5335L376.86449999999996 81.883Q375.62699999999995 81.091 374.20799999999997 80.70325Q372.789 80.3155 371.25449999999995 80.3155Q369.32399999999996 80.3155 367.77299999999997 80.8765Q366.222 81.4375 365.133 82.50175Q364.044 83.566 363.4665 85.07575Q362.88899999999995 86.5855 362.88899999999995 88.483Q362.88899999999995 91.1395 364.01924999999994 92.9875Q365.1495 94.8355 367.12125 95.78425Q369.09299999999996 96.733 371.63399999999996 96.733Q372.8055 96.733 373.779 96.51025Q374.7525 96.2875 375.39599999999996 96.007V90.925H370.3305V87.42699999999999H379.2075V98.548Q378.2505 99.142 376.87275 99.5875Q375.49499999999995 100.033 374.0347499999999 100.26400000000001Q372.57449999999994 100.495 371.40299999999996 100.495ZM391.30199999999996 100.0V76.9H406.66349999999994V80.662H395.592V86.2555H405.063V89.77H395.592V96.205H406.77899999999994V100.0ZM418.36199999999997 100.0V76.9H422.52L433.45949999999993 92.806V76.9H437.63399999999996V100.0H433.47599999999994L422.5365 83.896V100.0ZM460.635 100.495Q457.03799999999995 100.495 454.332 99.01Q451.626 97.525 450.1245 94.82724999999999Q448.623 92.1295 448.623 88.483Q448.623 85.8265 449.50575 83.62375Q450.38849999999996 81.42099999999999 452.01374999999996 79.79575Q453.63899999999995 78.1705 455.84174999999993 77.28775Q458.04449999999997 76.405 460.68449999999996 76.405Q463.407 76.405 465.3375 77.08975000000001Q467.268 77.7745 468.7695 79.0285L466.575 82.543Q465.519 81.5365 464.10825 81.04975Q462.6975 80.563 460.9815 80.563Q459.15 80.563 457.698 81.1075Q456.246 81.652 455.22299999999996 82.68325Q454.2 83.7145 453.65549999999996 85.1665Q453.111 86.6185 453.111 88.4335Q453.111 90.925 454.0845 92.68225Q455.058 94.4395 456.8565 95.38Q458.655 96.3205 461.13 96.3205Q462.7965 96.3205 464.38874999999996 95.809Q465.981 95.2975 467.4 94.1755L469.38 97.789Q467.72999999999996 99.076 465.56025 99.7855Q463.3905 100.495 460.635 100.495ZM485.0055 100.0V90.133L476.871 76.9H481.7385L487.2495 86.008L492.711 76.9H497.4465L489.312 90.166V100.0Z" fill="currentColor" opacity=".55"/></svg></a>
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
      <svg class="aa-rings aa-rings--case" viewBox="-300 -300 600 600" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1"><circle r="70"/><circle r="140"/><circle r="210"/><circle r="280"/><path d="M-300 0H-90M90 0H300M0 -300V-90M0 90V300" stroke-dasharray="2 7"/></g><circle class="aa-rings__spin" r="175" fill="none" stroke-width="1.5" stroke-dasharray="3 13"/><circle class="aa-rings__dot" r="4"/></svg>
      <div class="aa-wrap">
        <nav class="aa-crumbs" aria-label="Хлебные крошки"><a href="{home}">Главная</a><span aria-hidden="true">/</span><a href="{home}#cases">Кейсы</a><span aria-hidden="true">/</span><span aria-current="page">{c['short']}</span></nav>
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

{ab_section}
{stages_section}
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
</div>

{ld({"@context": "https://schema.org", "@graph": [
    {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Главная", "item": SITE},
        {"@type": "ListItem", "position": 2, "name": "Кейсы", "item": f"{SITE}#cases"},
        {"@type": "ListItem", "position": 3, "name": c["short"], "item": f"{SITE}{c['slug']}"}]},
    {"@type": "Article", "headline": plain(c["title"]), "description": case_desc(c), "inLanguage": "ru",
     "mainEntityOfPage": f"{SITE}{c['slug']}", "image": f"{SITE}og/{c['slug']}.png",
     "author": {"@type": "Organization", "name": BRAND, "url": SITE},
     "publisher": {"@type": "Organization", "name": BRAND, "url": SITE},
     "about": ["таргетированная реклама ВКонтакте", c["niche"]]},
]})}"""


def strip_drafts(html):
    """Убирает черновые элементы (data-draft) для публикации: вопрос без ответа, пустые реквизиты."""
    html = re.sub(r"\s*<details>(?:(?!</details>).)*?data-draft(?:(?!</details>).)*?</details>", "", html, flags=re.S)
    html = re.sub(r"\s*<(span|a)\b[^>]*data-draft[^>]*>.*?</\1>", "", html, flags=re.S)
    return html


def case_fragment(c, home, link, publish=False):
    head = f"<!--\n  Alimov Agency — кейс «{c['client']}».\n  Этот файл целиком вставляется в Tilda в блок T123 на странице {SITE}{c['slug']}.\n  Собран командой python3 site/build.py из site/cases.py — правьте там, а не здесь.\n-->"
    return "\n".join([head, fonts, "", style, CASE_CSS, "", case_body(c, home, link, publish), "", script, ""])


# --- build -----------------------------------------------------------------

# главная: в предпросмотре ссылки на кейсы ведут на локальные страницы
preview_main = main
for c in CASES:
    preview_main = preview_main.replace(f'href="{SITE}{c["slug"]}"', f'href="cases/{c["slug"]}.html"')
    preview_main = preview_main.replace(f'"href": "{SITE}{c["slug"]}"', f'"href": "cases/{c["slug"]}.html"')
(here / "index.html").write_text(page(MAIN_TITLE, MAIN_DESC, preview_main, SITE, f"{SITE}og/main.png"), encoding="utf-8")
print("site/index.html")

out = here / "cases"
out.mkdir(exist_ok=True)
rows = [("Главная", "/", MAIN_TITLE, MAIN_DESC, "og/main.png")]
# чистые версии для вставки в Tilda: без черновых элементов
pub = here / "publish"
pub.mkdir(exist_ok=True)
(pub / "main.html").write_text(strip_drafts(main), encoding="utf-8")
for c in CASES:
    (out / f"{c['slug']}.t123.html").write_text(case_fragment(c, SITE, lambda s: f"{SITE}{s}"), encoding="utf-8")
    (out / f"{c['slug']}.html").write_text(page(
        case_title(c), case_desc(c), case_fragment(c, "../index.html", lambda s: f"{s}.html"),
        f"{SITE}{c['slug']}", f"{SITE}og/{c['slug']}.png"), encoding="utf-8")
    rows.append((c["short"], f"/{c['slug']}", case_title(c), case_desc(c), f"og/{c['slug']}.png"))
    (pub / f"{c['slug']}.html").write_text(strip_drafts(case_fragment(c, SITE, lambda s: f"{SITE}{s}", publish=True)), encoding="utf-8")
    print(f"site/cases/{c['slug']}.t123.html, site/cases/{c['slug']}.html")

# таблица для настроек SEO в Tilda
meta = ["# Заголовки и описания страниц для Tilda", "",
        "Собрано командой `python3 site/build.py`. Вставьте в Tilda: Настройки страницы → SEO (заголовок и описание) и → Соцсети (картинка из `site/og/`).", ""]
for name, path, t, d, img in rows:
    meta += [f"## {name} — `{path}`", "", f"- **Заголовок (title, {len(t)} симв.):** {t}", f"- **Описание (description, {len(d)} симв.):** {d}", f"- **Картинка для соцсетей:** `site/{img}`", ""]
# данные для make_images.js (картинки для соцсетей)
(here / "cases.json").write_text(json.dumps([{"slug": c["slug"], "short": c["short"], "client": c["client"],
    "leads": plain(num(c["leads"])), "cpl": plain(num(c["cpl"])), "budget": plain(money_short(c["budget"]))} for c in CASES],
    ensure_ascii=False, indent=1), encoding="utf-8")
(here / "seo-meta.md").write_text("\n".join(meta), encoding="utf-8")
print("site/seo-meta.md")
