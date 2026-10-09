"""Build the multilingual Magic 8 Ball site into ../docs (served by GitHub Pages).

Usage: python3 build.py [--base https://example.com/]
Every language gets its own static page with translated title, description, hreflang links and
structured data, so search engines can index each language separately.
"""
import argparse, html, json, os, shutil
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "docs")
DEFAULT_BASE = "https://alimoffmaxim-cpu.github.io/alimoff363/"
FONTS = "https://fonts.googleapis.com/css2?family=Unbounded:wght@500;800&family=Manrope:wght@400;600&display=swap"

e = html.escape


def match_script(langs):
    """Root page only: send visitors to the page in their device language (or their saved pick)."""
    paths = {k: v["path"] for k, v in langs.items()}
    return """<script>
  (function () {
    var P = %s;
    function match(tag) {
      if (!tag) return null;
      var t = String(tag).toLowerCase();
      if (t.indexOf("zh") === 0) return /-(tw|hk|mo|hant)/.test(t) ? "zh-TW" : "zh";
      for (var k in P) if (k.toLowerCase() === t) return k;
      var b = t.split("-")[0];
      return P.hasOwnProperty(b) ? b : null;
    }
    var code = match(location.hash.slice(1));
    if (!code) { try { code = match(localStorage.getItem("lang")); } catch (e) {} }
    if (!code) {
      var list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
      for (var i = 0; i < list.length && !code; i++) code = match(list[i]);
    }
    if (code && code !== "en") location.replace(P[code]);
  })();
</script>""" % json.dumps(paths)


def page(code, langs, base):
    L = langs[code]
    root = "../" if L["path"] else "./"
    url = base + L["path"]
    alternates = "\n".join(
        '<link rel="alternate" hreflang="%s" href="%s">' % (v["hreflang"], base + v["path"]) for v in langs.values()
    ) + '\n<link rel="alternate" hreflang="x-default" href="%s">' % base
    ld = {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": L["h1"],
        "alternateName": "Magic 8 Ball",
        "description": L["description"],
        "url": url,
        "inLanguage": L["hreflang"],
        "applicationCategory": "EntertainmentApplication",
        "operatingSystem": "Any",
        "browserRequirements": "Requires JavaScript",
        "image": base + "og.png",
        "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
    }
    a = L["answers"]
    groups = "".join(
        '<div class="%s"><h3>%s</h3><ul>%s</ul></div>' % (cls, e(L["groups"][i]), "".join("<li>%s</li>" % e(x) for x in part))
        for i, (cls, part) in enumerate([("yes", a[:10]), ("maybe", a[10:15]), ("no", a[15:])])
    )
    options = "".join(
        '<option value="%s"%s>%s</option>' % (k, " selected" if k == code else "", e(v["name"])) for k, v in langs.items()
    )
    links = "".join(
        '<li><a href="%s%s" hreflang="%s" lang="%s" data-code="%s"%s>%s</a></li>'
        % (root, v["path"], v["hreflang"], v["hreflang"], k, ' aria-current="page"' if k == code else "", e(v["name"]))
        for k, v in langs.items()
    )
    data = json.dumps({"answers": a, "code": code}, ensure_ascii=False)
    paths = json.dumps({k: v["path"] for k, v in langs.items()})
    return f"""<!doctype html>
<html lang="{L['hreflang']}" dir="{'rtl' if L['rtl'] else 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(L['title'])}</title>
<meta name="description" content="{e(L['description'])}">
<link rel="canonical" href="{url}">
{alternates}
<meta property="og:type" content="website">
<meta property="og:site_name" content="{e(L['h1'])}">
<meta property="og:title" content="{e(L['title'])}">
<meta property="og:description" content="{e(L['description'])}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{base}og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0e0f1a">
<link rel="icon" href="{root}favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="{root}apple-touch-icon.png">
{match_script(langs) if not L['path'] else ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONTS}">
<link rel="stylesheet" href="{root}style.css">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body>
<main>
  <h1 id="title">{e(L['h1'])}</h1>
  <p class="sub">{e(L['sub'])}</p>
  <input id="q" type="text" placeholder="{e(L['placeholder'])}" aria-label="{e(L['sub'])}" autocomplete="off" maxlength="120">
  <button id="ball" type="button" aria-label="{e(L['shake'])}">
    <div class="window" id="window"><div class="eight">8</div></div>
  </button>
  <p id="answer-text" aria-live="polite"></p>
  <p class="hint">{e(L['hint'])}</p>
  <label class="lang"><span aria-hidden="true">🌐</span><select id="lang" aria-label="Language">{options}</select></label>
</main>
<section class="info">
  <p>{e(L['about'])}</p>
  <h2>{e(L['answersHeading'])}</h2>
  <div class="groups">{groups}</div>
  <h2 aria-label="Languages">🌐</h2>
  <ul class="langs">{links}</ul>
</section>
<script>window.BALL = {data}; window.LANGS = {paths}; window.ROOT = "{root}";</script>
<script src="{root}app.js" defer></script>
</body>
</html>
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=os.environ.get("SITE_URL", DEFAULT_BASE))
    base = ap.parse_args().base.rstrip("/") + "/"
    langs = json.load(open(os.path.join(HERE, "langs.json"), encoding="utf-8"))

    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    for code, L in langs.items():
        d = os.path.join(OUT, L["path"])
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
            f.write(page(code, langs, base))

    for name in ("style.css", "app.js", "favicon.svg", "og.png", "apple-touch-icon.png"):
        src = os.path.join(HERE, name)
        if os.path.exists(src):
            shutil.copy(src, OUT)

    today = date.today().isoformat()
    alt = "".join(
        '\n    <xhtml:link rel="alternate" hreflang="%s" href="%s"/>' % (v["hreflang"], base + v["path"]) for v in langs.values()
    ) + '\n    <xhtml:link rel="alternate" hreflang="x-default" href="%s"/>' % base
    urls = "".join(
        "\n  <url>\n    <loc>%s</loc>\n    <lastmod>%s</lastmod>%s\n  </url>" % (base + v["path"], today, alt)
        for v in langs.values()
    )
    with open(os.path.join(OUT, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
                'xmlns:xhtml="http://www.w3.org/1999/xhtml">%s\n</urlset>\n' % urls)
    with open(os.path.join(OUT, "robots.txt"), "w") as f:
        f.write("User-agent: *\nAllow: /\n\nSitemap: %ssitemap.xml\n" % base)
    open(os.path.join(OUT, ".nojekyll"), "w").close()
    print("Built %d pages into %s for %s" % (len(langs), os.path.normpath(OUT), base))


if __name__ == "__main__":
    main()
