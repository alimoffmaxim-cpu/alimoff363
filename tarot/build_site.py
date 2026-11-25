"""Copy the Tarot app into ../docs/tarot-test as a standalone page for the site (GitHub Pages).

Usage: python3 tarot/build_site.py
The app itself is written for claude.ai, where the page gets its <!doctype>, <head> and charset
from the host; here they are added around the same index.html.
"""
import os, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "docs", "tarot-test")
FILES = ["cards.js", "spreads.js", "access.js", "readings.js"]

HEAD = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#12131f">
"""


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    page = open(os.path.join(HERE, "index.html"), encoding="utf-8").read()
    # <title> and <style> stay in the head; the rest of the app is the body
    split = page.index("</style>") + len("</style>")
    with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8") as f:
        f.write(HEAD + page[:split] + "\n</head>\n<body>\n" + page[split:].lstrip("\n") + "</body>\n</html>\n")
    for name in FILES:
        shutil.copy(os.path.join(HERE, name), OUT)
    shutil.copytree(os.path.join(HERE, "cards"), os.path.join(OUT, "cards"))
    print("Built the Tarot app into", os.path.normpath(OUT))


if __name__ == "__main__":
    main()
