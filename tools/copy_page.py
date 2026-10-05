"""Страница для копирования кода Apps Script: карточка на каждый .gs-файл с кнопкой «Скопировать код».

Описание файла — его первый комментарий. Файлы идут в порядке номера в имени.
Запуск:
  python3 tools/copy_page.py sova-report out.html --title "Код отчёта «Сова»" \
    --final "Обновите таблицу и выберите <b>Сова → Создать / пересобрать отчёт</b>."
"""
import argparse
import html
import re
from pathlib import Path

CSS = """
/* Layout: одна колонка — инструкция сверху, ниже карточки файлов с кнопкой копирования */
:root {
  --bg:#f5f6f3; --surface:#ffffff; --fg:#1d2320; --muted:#5f6a64; --line:#dde2dc; --accent:#c2410c; --accent-fg:#ffffff; --ok:#15803d; --code-bg:#f0f2ee;
  --sans:"IBM Plex Sans",system-ui,sans-serif; --mono:"IBM Plex Mono",ui-monospace,Menlo,monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#141816; --surface:#1c211e; --fg:#e6ebe7; --muted:#9aa59f; --line:#2f3632; --accent:#f97316; --accent-fg:#1a0d04; --ok:#4ade80; --code-bg:#171b19; color-scheme:dark } }
:root[data-theme="dark"] { --bg:#141816; --surface:#1c211e; --fg:#e6ebe7; --muted:#9aa59f; --line:#2f3632; --accent:#f97316; --accent-fg:#1a0d04; --ok:#4ade80; --code-bg:#171b19; color-scheme:dark }
body { background:var(--bg); color:var(--fg); font-family:var(--sans); font-size:15px; line-height:1.5; padding-inline:16px; padding-block:32px 64px }
.wrap { max-width:960px; margin:0 auto; display:flex; flex-direction:column; gap:20px }
h1 { font-size:26px; margin:0; text-wrap:balance }
.lead { color:var(--muted); margin:0; max-width:65ch }
ol.steps { margin:0; padding-left:22px; display:flex; flex-direction:column; gap:6px; max-width:70ch }
.warn { border-left:3px solid var(--accent); padding:10px 14px; background:var(--surface); max-width:70ch; margin:0 }
.file { background:var(--surface); border:1px solid var(--line); border-radius:8px; min-width:0 }
.head { display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between; padding:12px 14px; border-bottom:1px solid var(--line) }
.meta { display:flex; flex-wrap:wrap; gap:10px; align-items:baseline; min-width:0 }
.step { font-family:var(--mono); font-size:12px; color:var(--muted); font-variant-numeric:tabular-nums }
.name { font-family:var(--mono); font-size:16px; font-weight:600 }
.desc { color:var(--muted); font-size:13px }
button.copy { font:600 14px var(--sans); background:var(--accent); color:var(--accent-fg); border:0; border-radius:6px; padding:9px 16px; cursor:pointer }
button.copy:focus-visible { outline:3px solid var(--fg); outline-offset:2px }
button.copy.done { background:var(--ok) }
pre.code { margin:0; padding:12px 14px; max-height:260px; overflow:auto; background:var(--code-bg); font:12.5px/1.45 var(--mono); border-radius:0 0 8px 8px; white-space:pre }
code { font-family:var(--mono) }
"""

JS = """
document.querySelectorAll('button.copy').forEach(function (b) {
  b.addEventListener('click', function () {
    var pre = document.getElementById(b.dataset.target);
    var done = function () { b.textContent = 'Скопировано'; b.classList.add('done'); setTimeout(function () { b.textContent = 'Скопировать код'; b.classList.remove('done'); }, 2000); };
    var select = function () { var r = document.createRange(); r.selectNodeContents(pre); var s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = 'Выделено — нажмите Cmd+C'; };
    try { navigator.clipboard.writeText(pre.textContent).then(done, select); } catch (e) { select(); }
  });
});
"""


def describe(src):
    """Первый комментарий файла: «// ---------- X ----------» или первая строка /** … */."""
    for line in src.splitlines():
        s = line.strip()
        if not s:
            continue
        m = re.match(r'^//\s*-*\s*(.*?)\s*-*$', s)
        if m:
            return m.group(1)
        m = re.match(r'^/\*\*?\s*(.*)$', s)
        if m:
            text = m.group(1).rstrip('*/ ').strip()
            if text:
                return text
            continue
        if s.startswith('*'):
            return s.lstrip('* ').strip()
        return ''
    return ''


def order(p):
    m = re.match(r'^(\d+)', p.stem)
    return (int(m.group(1)) if m else 10 ** 6, p.stem)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('dir')
    ap.add_argument('out')
    ap.add_argument('--title', required=True)
    ap.add_argument('--final', required=True, help='последний шаг инструкции (HTML)')
    a = ap.parse_args()
    files = sorted(Path(a.dir).glob('*.gs'), key=order)
    n = len(files)
    cards = []
    for i, f in enumerate(files):
        src = f.read_text(encoding='utf-8')
        lines = src.count('\n') + (0 if src.endswith('\n') else 1)
        desc = describe(src)
        cards.append(f'''<section class="file">
  <div class="head">
    <div class="meta"><span class="step">{i + 1}/{n}</span><code class="name">{html.escape(f.stem)}</code><span class="desc">{html.escape(desc)}{' · ' if desc else ''}{lines} строк</span></div>
    <button class="copy" type="button" data-target="c{i}">Скопировать код</button>
  </div>
  <pre class="code" id="c{i}">{html.escape(src)}</pre>
</section>''')
    page = f'''<title>{html.escape(a.title)}</title>
<style>{CSS}</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;600&display=swap">
<div class="wrap">
  <h1>{html.escape(a.title)}</h1>
  <p class="lead">Файлов для Google Apps Script: {n}. Каждый вставляется в отдельный файл редактора, так вставка не обрежется.</p>
  <ol class="steps">
    <li>В таблице откройте <b>Расширения → Apps Script</b>. Очистите или удалите <code>Код.gs</code>.</li>
    <li>Для каждого блока ниже нажмите <b>Файлы → + → Скрипт</b> и назовите файл как в заголовке блока (например, <code>{html.escape(files[0].stem)}</code>, без <code>.gs</code>).</li>
    <li>Нажмите «Скопировать код», вставьте его в новый файл (Cmd+V) и сохраните (Cmd+S). Порядок файлов не важен.</li>
    <li>{a.final}</li>
  </ol>
  <p class="warn">Перед вставкой убедитесь, что новый файл пуст: Apps Script создаёт его с заготовкой <code>function myFunction() {{}}</code>. Выделите её (Cmd+A) и вставьте код поверх.</p>
{chr(10).join(cards)}
</div>
<script>{JS}</script>
'''
    Path(a.out).write_text(page, encoding='utf-8')
    print(f'{a.out}: {n} файлов')


if __name__ == '__main__':
    main()
