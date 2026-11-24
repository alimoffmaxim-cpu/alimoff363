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
SITE = "https://aretica.ru/"
START, END = "<!-- cases:start -->", "<!-- cases:end -->"

# SEO: заголовки и описания страниц. Их же нужно вписать в настройки страниц Tilda (см. site/SEO.md).
BRAND = "Aretica"
MAIN_TITLE = "Реклама в VK, Яндекс Директе, Telegram и на Ozon | Aretica"
MAIN_DESC = ("Агентство интернет-рекламы: VK Реклама, Яндекс Директ, Telegram Ads и посевы, MAX, Ozon, Яндекс Карты. "
             "37 784 заявки в кейсах, ROMI до 1600%.")
SAME_AS = ["https://t.me/alimoffmaxim", "https://vk.com/alimovmaksim"]


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
       "legalName": "ИП Алимов Максим Александрович", "taxID": "561411013401", "email": "info@aretica.ru",
       "description": "Агентство интернет-рекламы: VK Реклама, Яндекс Директ, Telegram Ads, посевы в Telegram, MAX, Ozon, Яндекс Бизнес и Карты.",
       "areaServed": {"@type": "Country", "name": "Россия"}, "sameAs": SAME_AS,
       "knowsAbout": ["таргетированная реклама ВКонтакте", "VK Реклама", "Яндекс Директ", "Telegram Ads", "посевы в Telegram",
                      "реклама в MAX", "продвижение на Ozon", "Яндекс Бизнес", "реклама онлайн-школ"]}


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
order = {"genius_school": 0, "irbis_case": 1, "tetrica_case": 2, "unicode_case": 3}
heroes.sort(key=lambda c: order.get(c["slug"], 99))
items = [{
    "label": f"{c['channel']} · {c['client']}",
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
    {"@type": "Service", "name": "Настройка и ведение интернет-рекламы", "serviceType": "Интернет-реклама",
     "provider": {"@id": f"{SITE}#org"}, "areaServed": {"@type": "Country", "name": "Россия"},
     "hasOfferCatalog": {"@type": "OfferCatalog", "name": "Рекламные каналы", "itemListElement": [
         {"@type": "Offer", "itemOffered": {"@type": "Service", "name": n}} for n in
         ["VK Реклама", "Яндекс Директ", "Telegram Ads", "Посевы в Telegram", "Реклама в MAX", "Продвижение на Ozon", "Яндекс Бизнес и Карты"]]}},
    {"@type": "ItemList", "name": "Кейсы", "itemListElement": [
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
        <a class="aa-logo" href="{home}" aria-label="Aretica — на главную"><svg class="aa-logo__svg" viewBox="3.2 23.2 308.9 78.3" aria-hidden="true" focusable="false"><path d="M21.150000000000002 101.5Q16.05 101.5 12.0 99.525Q7.95 97.55 5.6 93.875Q3.25 90.2 3.25 85.05Q3.25 80.65 5.425000000000001 77.25Q7.6000000000000005 73.85 12.000000000000002 71.65Q16.400000000000002 69.45 23.075000000000003 68.67500000000001Q29.75 67.9 38.7 68.7L38.85 78.9Q34.1 78.05 30.275000000000002 78.025Q26.450000000000003 78.0 23.775000000000002 78.675Q21.1 79.35 19.65 80.75Q18.2 82.15 18.2 84.2Q18.2 86.85 20.225 88.25Q22.25 89.65 25.650000000000002 89.65Q28.6 89.65 30.975 88.6Q33.35 87.55 34.775000000000006 85.525Q36.2 83.5 36.2 80.55V68.9Q36.2 66.15 35.05 64.05Q33.9 61.949999999999996 31.425 60.77499999999999Q28.950000000000003 59.599999999999994 24.85 59.599999999999994Q20.900000000000002 59.599999999999994 17.0 60.77499999999999Q13.100000000000001 61.949999999999996 10.0 64.3L5.800000000000001 53.05Q10.75 49.949999999999996 16.4 48.474999999999994Q22.05 47.0 27.5 47.0Q34.7 47.0 40.175000000000004 49.3Q45.650000000000006 51.599999999999994 48.75 56.39999999999999Q51.85 61.199999999999996 51.85 68.7V100.0H37.7V94.6Q35.25 97.9 30.950000000000003 99.7Q26.650000000000002 101.5 21.150000000000002 101.5ZM59.8 100.0V49.0H76.2V54.949999999999996Q78.5 51.0 82.3 49.2Q86.1 47.4 90.55000000000001 47.4Q92.25 47.4 93.6 47.599999999999994Q94.95 47.8 96.25 48.05L94.30000000000001 64.9Q92.6 64.3 90.7 63.925Q88.80000000000001 63.55 86.9 63.55Q82.25 63.55 79.225 66.225Q76.2 68.9 76.2 74.05V100.0ZM123.3 101.5Q114.89999999999999 101.5 108.54999999999998 98.125Q102.19999999999999 94.75 98.64999999999999 88.675Q95.1 82.6 95.1 74.45Q95.1 68.55 97.175 63.599999999999994Q99.25 58.65 102.975 55.05Q106.69999999999999 51.449999999999996 111.77499999999999 49.474999999999994Q116.85 47.5 122.94999999999999 47.5Q129.65 47.5 134.9 49.875Q140.15 52.25 143.575 56.474999999999994Q147.0 60.699999999999996 148.3 66.425Q149.6 72.15 148.4 78.85H110.1Q110.14999999999999 81.85 111.89999999999999 84.1Q113.64999999999999 86.35 116.69999999999999 87.625Q119.75 88.9 123.8 88.9Q128.3 88.9 132.35000000000002 87.725Q136.4 86.55 140.1 84.1L145.25 95.2Q142.9 97.0 139.175 98.425Q135.45 99.85 131.27499999999998 100.675Q127.1 101.5 123.3 101.5ZM111.1 67.8H132.8Q132.7 63.949999999999996 129.95 61.64999999999999Q127.19999999999999 59.349999999999994 122.5 59.349999999999994Q117.75 59.349999999999994 114.625 61.64999999999999Q111.5 63.949999999999996 111.1 67.8ZM176.0 101.5Q167.5 101.5 162.65 96.725Q157.8 91.95 157.8 82.45V34.39999999999999H174.2V49.0H186.15V62.0H174.2V79.6Q174.2 83.7 176.0 85.35Q177.8 87.0 180.65 87.0Q182.2 87.0 183.725 86.625Q185.25 86.25 186.55 85.5L188.65 98.35Q186.3 99.65 183.0 100.575Q179.7 101.5 176.0 101.5ZM147.9 62.0V49.0H159.3V62.0ZM193.45000000000002 100.0V49.0H209.85000000000002V100.0ZM201.65 41.449999999999996Q197.7 41.449999999999996 194.77499999999998 38.974999999999994Q191.85 36.5 191.85 32.3Q191.85 28.099999999999994 194.77499999999998 25.64999999999999Q197.7 23.19999999999999 201.65 23.19999999999999Q205.65 23.19999999999999 208.55 25.64999999999999Q211.45 28.099999999999994 211.45 32.3Q211.45 36.5 208.55 38.974999999999994Q205.65 41.449999999999996 201.65 41.449999999999996ZM242.70000000000002 101.5Q234.60000000000002 101.5 228.22500000000002 97.975Q221.85000000000002 94.45 218.15000000000003 88.325Q214.45000000000002 82.2 214.45000000000002 74.5Q214.45000000000002 68.7 216.625 63.8Q218.8 58.9 222.75 55.224999999999994Q226.70000000000002 51.55 231.95000000000002 49.525Q237.20000000000002 47.5 243.35000000000002 47.5Q249.15000000000003 47.5 254.10000000000002 49.075Q259.05 50.65 263.0 53.8L255.8 65.94999999999999Q253.35000000000002 63.699999999999996 250.425 62.64999999999999Q247.50000000000003 61.599999999999994 244.3 61.599999999999994Q240.10000000000002 61.599999999999994 237.05 63.099999999999994Q234.00000000000003 64.6 232.37500000000003 67.5Q230.75000000000003 70.4 230.75000000000003 74.45Q230.75000000000003 80.55 234.37500000000003 83.975Q238.00000000000003 87.4 244.35000000000002 87.4Q247.95000000000002 87.4 251.125 86.075Q254.3 84.75 256.95000000000005 82.2L263.6 94.6Q259.3 97.8 253.77500000000003 99.65Q248.25000000000003 101.5 242.70000000000002 101.5ZM281.45 101.5Q276.35 101.5 272.3 99.525Q268.25 97.55 265.9 93.875Q263.55 90.2 263.55 85.05Q263.55 80.65 265.725 77.25Q267.90000000000003 73.85 272.3 71.65Q276.7 69.45 283.375 68.67500000000001Q290.05 67.9 299.0 68.7L299.15000000000003 78.9Q294.40000000000003 78.05 290.57500000000005 78.025Q286.75 78.0 284.07500000000005 78.675Q281.40000000000003 79.35 279.95000000000005 80.75Q278.5 82.15 278.5 84.2Q278.5 86.85 280.525 88.25Q282.55 89.65 285.95 89.65Q288.90000000000003 89.65 291.27500000000003 88.6Q293.65000000000003 87.55 295.07500000000005 85.525Q296.5 83.5 296.5 80.55V68.9Q296.5 66.15 295.35 64.05Q294.2 61.949999999999996 291.725 60.77499999999999Q289.25 59.599999999999994 285.15000000000003 59.599999999999994Q281.2 59.599999999999994 277.3 60.77499999999999Q273.40000000000003 61.949999999999996 270.3 64.3L266.1 53.05Q271.05 49.949999999999996 276.70000000000005 48.474999999999994Q282.35 47.0 287.8 47.0Q295.0 47.0 300.475 49.3Q305.95000000000005 51.599999999999994 309.05000000000007 56.39999999999999Q312.15000000000003 61.199999999999996 312.15000000000003 68.7V100.0H298.0V94.6Q295.55 97.9 291.25 99.7Q286.95 101.5 281.45 101.5Z" fill="currentColor"/></svg></a>
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
    head = f"<!--\n  Aretica — кейс «{c['client']}».\n  Этот файл целиком вставляется в Tilda в блок T123 на странице {SITE}{c['slug']}.\n  Собран командой python3 site/build.py из site/cases.py — правьте там, а не здесь.\n-->"
    return "\n".join([head, fonts, "", style, CASE_CSS, "", case_body(c, home, link, publish), "", script, ""])


# --- build -----------------------------------------------------------------

# главная: в предпросмотре ссылки на кейсы ведут на локальные страницы
preview_main = main
for c in CASES:
    preview_main = preview_main.replace(f'href="{SITE}{c["slug"]}"', f'href="cases/{c["slug"]}.html"')
    preview_main = preview_main.replace(f'"href": "{SITE}{c["slug"]}"', f'"href": "cases/{c["slug"]}.html"')
preview_main = preview_main.replace(f'href="{SITE}privacy"', 'href="privacy.html"')
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
        case_title(c), case_desc(c), case_fragment(c, "../index.html", lambda s: f"{s}.html").replace(f'href="{SITE}privacy"', 'href="../privacy.html"'),
        f"{SITE}{c['slug']}", f"{SITE}og/{c['slug']}.png"), encoding="utf-8")
    rows.append((c["short"], f"/{c['slug']}", case_title(c), case_desc(c), f"og/{c['slug']}.png"))
    (pub / f"{c['slug']}.html").write_text(strip_drafts(case_fragment(c, SITE, lambda s: f"{SITE}{s}", publish=True)), encoding="utf-8")
    print(f"site/cases/{c['slug']}.t123.html, site/cases/{c['slug']}.html")

# страница «Политика обработки персональных данных»: текст в privacy-content.html
PRIVACY_TITLE = "Политика обработки персональных данных | Aretica"
PRIVACY_DESC = "Как ИП Алимов Максим Александрович (Aretica) обрабатывает и защищает персональные данные посетителей сайта aretica.ru."
PRIVACY_CSS = """<style>
/* legal page: one readable column */
.aa-legal { padding-block: clamp(36px, 5vw, 64px) clamp(56px, 7vw, 96px); }
.aa-legal .aa-crumbs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: clamp(24px, 3vw, 40px); font-size: 14px; color: var(--aa-muted); }
.aa-legal .aa-crumbs a { color: var(--aa-muted); text-decoration: none; }
.aa-legal .aa-crumbs a:hover { color: var(--aa-ink); }
.aa-legal .aa-crumbs [aria-current] { color: var(--aa-ink); font-weight: 600; }
.aa-legal .aa-h1 { max-width: 16em; }
.aa-legal__date { margin-top: 16px; color: var(--aa-muted); }
.aa-legal__text { max-width: 46em; margin-top: clamp(32px, 4vw, 48px); padding: clamp(24px, 4vw, 48px); border-radius: var(--aa-r); background: var(--aa-card); display: grid; gap: 14px; }
.aa-legal__text h2 { font-family: var(--aa-display); font-weight: 600; font-size: clamp(20px, 2vw, 24px); letter-spacing: -0.02em; margin-top: 18px; }
.aa-legal__text h2:first-child { margin-top: 0; }
.aa-legal__text p, .aa-legal__text li { color: #33333A; }
.aa-legal__text ul { list-style: disc; padding-left: 22px; display: grid; gap: 8px; }
.aa-legal__text a { color: var(--aa-accent-text); }
.aa-legal + .aa-sec { padding-top: 0; }
</style>"""
privacy_text = (here / "privacy-content.html").read_text(encoding="utf-8")
privacy_text = re.sub(r"<!--.*?-->\s*", "", privacy_text, flags=re.S)
main_header = between(main, '<header class="aa-head"', "</header>")


def privacy_fragment(home):
    head = main_header.replace('href="#top"', f'href="{home}"')
    for a in ("services", "cases", "how", "faq"):
        head = head.replace(f'href="#{a}"', f'href="{home}#{a}"')
    body = f"""<div class="aa" id="top">
  <div class="aa-bg" aria-hidden="true"><i class="aa-blob aa-blob--1"></i><i class="aa-blob aa-blob--2"></i><i class="aa-blob aa-blob--3"></i></div>
  {head}

  <main>
    <section class="aa-legal">
      <div class="aa-wrap">
        <nav class="aa-crumbs" aria-label="Хлебные крошки"><a href="{home}">Главная</a><span aria-hidden="true">/</span><span aria-current="page">Политика обработки персональных данных</span></nav>
        <h1 class="aa-h1">Политика обработки персональных данных</h1>
        <p class="aa-legal__date">Редакция от 8 октября 2026 года</p>
        <article class="aa-legal__text">
{privacy_text}
        </article>
      </div>
    </section>

    {contact.replace('href="#top"', f'href="{home}"', 1)}
</div>"""
    comment = f"<!--\n  Aretica — политика обработки персональных данных.\n  Этот файл целиком вставляется в Tilda в блок T123 на странице {SITE}privacy.\n  Собран командой python3 site/build.py из site/privacy-content.html — правьте там.\n-->"
    return "\n".join([comment, fonts, "", style, PRIVACY_CSS, "", body, "", script, ""])


(pub / "privacy.html").write_text(strip_drafts(privacy_fragment(SITE)), encoding="utf-8")
(here / "privacy.html").write_text(page(PRIVACY_TITLE, PRIVACY_DESC,
    privacy_fragment("index.html").replace(f'href="{SITE}privacy"', 'href="privacy.html"'),
    f"{SITE}privacy", f"{SITE}og/main.png"), encoding="utf-8")
rows.append(("Политика обработки персональных данных", "/privacy", PRIVACY_TITLE, PRIVACY_DESC, "og/main.png"))
print("site/privacy.html, site/publish/privacy.html")

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
