"""Логотип alimov AGENCY: Geologica Bold + Geologica Medium, буквы переведены в контуры.

Запуск: python3 site/brand/make_logo.py (нужен пакет fonttools).
"""
import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

HERE = os.path.dirname(os.path.abspath(__file__))
# Нужен шрифт Geologica 500 и 700 в TTF (Google Fonts): положите рядом как geo500.ttf и geo700.ttf
F = {w: TTFont(os.path.join(HERE, f"geo{w}.ttf")) for w in (500, 700)}

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

def lockup(main="#0B0B0D", sub="#6B6B75", with_agency=True, pad=0):
    d1, b1 = run("alimov", 700, 100, -0.05, 0, 100)
    parts = [f'<path d="{d1}" fill="{main}"/>']
    L, T, R, B = b1
    if with_agency:
        d2, b2 = run("AGENCY", 500, 33, 0.2, b1[2] + 18, 100)
        parts.append(f'<path d="{d2}" fill="{sub}"/>')
        R = b2[2]
    w, h = R - L + 2 * pad, B - T + 2 * pad
    vb = f"{L - pad:.1f} {T - pad:.1f} {w:.1f} {h:.1f}"
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w:.0f}" height="{h:.0f}">{"".join(parts)}</svg>', (w, h)

def inline(cls="aa-logo__svg"):
    """Для сайта: цвет берётся из currentColor, AGENCY — полупрозрачный."""
    d1, b1 = run("alimov", 700, 100, -0.05, 0, 100)
    d2, b2 = run("AGENCY", 500, 33, 0.2, b1[2] + 18, 100)
    L, T, R, B = b1[0], b1[1], b2[2], b1[3]
    return (f'<svg class="{cls}" viewBox="{L:.1f} {T:.1f} {R-L:.1f} {B-T:.1f}" aria-hidden="true" focusable="false">'
            f'<path d="{d1}" fill="currentColor"/><path d="{d2}" fill="currentColor" opacity=".55"/></svg>')

def icon(size, bg="#0B0B0D", fg="#FFFFFF", radius=0.22):
    d, (l, t, r, b) = run("a", 700, size * 0.64, 0, 0, 0)
    tx = size / 2 - (l + r) / 2; ty = size / 2 - (t + b) / 2
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}">'
            f'<rect width="{size}" height="{size}" rx="{size*radius:.1f}" fill="{bg}"/>'
            f'<g transform="translate({tx:.1f},{ty:.1f})"><path d="{d}" fill="{fg}"/></g></svg>')

if __name__ == "__main__":
    out = HERE
    files = {
        "alimov-agency-black.svg": lockup()[0],
        "alimov-agency-white.svg": lockup("#FFFFFF", "#9D9DA8")[0],
        "alimov-black.svg": lockup(with_agency=False)[0],
        "alimov-white.svg": lockup("#FFFFFF", with_agency=False)[0],
        "icon.svg": icon(64),
    }
    for n, s in files.items():
        open(f"{out}/{n}", "w").write(s)
    open(os.path.join(HERE, "inline-for-site.svg.txt"), "w").write(inline())
    print(lockup()[1])
