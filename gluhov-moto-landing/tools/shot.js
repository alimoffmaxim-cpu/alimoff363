// Скриншоты страницы или её части (Playwright; Chromium уже установлен в облачной сессии).
// node tools/shot.js <html-файл> <css-селектор|page> <out-префикс> [ширины через запятую, по умолчанию 1440,390]
// Пример: node tools/shot.js tilda/preview.html '.gm-gear' /tmp/gear  →  /tmp/gear-1440.png, /tmp/gear-390.png
// Раскрывает анимации появления, прячет липкую кнопку, ждёт картинки; печатает scrollWidth (должен = ширине окна).
// Внимание: в Playwright Chromium нет H.264 — mp4 не играют, видна обложка.
const { chromium } = require('playwright');
const path = require('path');
const [file, sel = 'page', out = 'shot', widths = '1440,390'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  for (const w of widths.split(',').map(Number)) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    await p.goto('file://' + path.resolve(file));
    await p.addStyleTag({ content: '.gm-sticky,#gm-sticky,#gm-cookie{display:none!important}' });
    await p.evaluate(() => document.querySelectorAll('.gm-reveal').forEach(e => e.classList.remove('gm-pre')));
    let el = null;
    if (sel !== 'page') { el = await p.$(sel); if (!el) throw new Error('нет элемента ' + sel); await el.evaluate(e => e.scrollIntoView({ block: 'center' })); }
    await p.waitForTimeout(1500);
    await p.evaluate(async () => { for (const i of document.images) { i.loading = 'eager'; if (!i.complete) await new Promise(r => { i.onload = i.onerror = r; }); } });
    const f = `${out}-${w}.png`;
    if (el) await el.screenshot({ path: f }); else await p.screenshot({ path: f });
    console.log(f, 'scrollWidth', await p.evaluate(() => document.documentElement.scrollWidth));
    await p.close();
  }
  await b.close();
})();
