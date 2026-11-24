"""Логотип aretica: Geologica Bold, буквы переведены в контуры.

Запуск: python3 site/brand/make_logo.py (нужен пакет fonttools).
"""
import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

HERE = os.path.dirname(os.path.abspath(__file__))
# Нужен шрифт Geologica 700 в TTF (Google Fonts): положите рядом как geo700.ttf
F = {w: TTFont(os.path.join(HERE, f"geo{w}.ttf")) for w in (700,)}
NAME = "aretica"

def run(text, w, size, track, x0, base):
    f = F[w]; gs = f.getGlyphSet(); cm = f.getBestCmap(); s = size / f["head"].unitsPerEm
    pen = SVGPathPen(gs); x = x0; top, bot, left, right = 1e9, -1e9, 1e9, -1e9
    for ch in text:
        g = gs[cm[ord(ch)]]
        g.draw(TransformPen(pen, (s, 0, 0, -s, x, base)))
        bp = BoundsPen(gs); g.draw(bp)
        if bp.bounds:
            xmin, ymin, xmax, ymax = bp.bounds
            left = min(left, x + xmin * s); right = max(right, x + xmax * s)
            top = min(top, base - ymax * s); bot = max(bot, base - ymin * s)
        x += g.width * s + track * size
    return pen.getCommands(), (left, top, right, bot)

def lockup(main="#0B0B0D", pad=0):
    d, (L, T, R, B) = run(NAME, 700, 100, -0.05, 0, 100)
    w, h = R - L + 2 * pad, B - T + 2 * pad
    vb = f"{L - pad:.1f} {T - pad:.1f} {w:.1f} {h:.1f}"
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w:.0f}" height="{h:.0f}"><path d="{d}" fill="{main}"/></svg>', (w, h)

def inline(cls="aa-logo__svg"):
    """Для сайта: цвет берётся из currentColor."""
    d, (L, T, R, B) = run(NAME, 700, 100, -0.05, 0, 100)
    return (f'<svg class="{cls}" viewBox="{L:.1f} {T:.1f} {R-L:.1f} {B-T:.1f}" aria-hidden="true" focusable="false">'
            f'<path d="{d}" fill="currentColor"/></svg>')

def icon(size, bg="#0B0B0D", fg="#FFFFFF", radius=0.22):
    d, (l, t, r, b) = run("a", 700, size * 0.64, 0, 0, 0)
    tx = size / 2 - (l + r) / 2; ty = size / 2 - (t + b) / 2
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}">'
            f'<rect width="{size}" height="{size}" rx="{size*radius:.1f}" fill="{bg}"/>'
            f'<g transform="translate({tx:.1f},{ty:.1f})"><path d="{d}" fill="{fg}"/></g></svg>')

if __name__ == "__main__":
    files = {
        "aretica-black.svg": lockup()[0],
        "aretica-white.svg": lockup("#FFFFFF")[0],
        "icon.svg": icon(64),
    }
    for n, s in files.items():
        open(os.path.join(HERE, n), "w").write(s)
    open(os.path.join(HERE, "inline-for-site.svg.txt"), "w").write(inline())
    print(lockup()[1])
