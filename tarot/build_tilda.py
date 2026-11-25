"""Build one HTML block of the Tarot app for a Tilda page (block T123, "HTML-код").

Usage: python3 tarot/build_tilda.py
Writes tarot/publish/tilda-t123.html. Scripts are inlined; card pictures load from jsDelivr,
which serves this repository's files pinned to the current commit (push before publishing).
"""
import os, re, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "publish", "tilda-t123.html")
REPO = "alimoffmaxim-cpu/alimoff363"


def main():
    sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=HERE, text=True).strip()
    base = "https://cdn.jsdelivr.net/gh/%s@%s/tarot/cards/" % (REPO, sha)
    page = open(os.path.join(HERE, "index.html"), encoding="utf-8").read()
    page = re.sub(r"<title>.*?</title>\n", "", page, count=1)   # Tilda sets the title in page settings

    def inline(m):
        code = open(os.path.join(HERE, m.group(1)), encoding="utf-8").read()
        return "<script>\n" + code.replace("</script", "<\\/script") + "\n</script>"
    page = re.sub(r'<script src="([\w.]+\.js)"></script>', inline, page)
    page = '<script>window.CARD_BASE = "%s";</script>\n' % base + page
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "w", encoding="utf-8").write(page)
    print("Wrote %s (%d KB), pictures from %s" % (os.path.relpath(OUT), len(page.encode()) // 1024, base))


if __name__ == "__main__":
    main()
