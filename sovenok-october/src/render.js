// Рендер слайдов в PNG: node render.js
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
  await page.goto('file://' + path.join(__dirname, 'slides.html'), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const out = path.join(__dirname, '..');
  for (const [id, name] of [['s1', '1-oblozhka'], ['s2', '2-sovety'], ['s3', '3-zapis'], ['s1sq', '1-oblozhka-1x1']]) {
    await page.locator('#' + id).screenshot({ path: path.join(out, name + '.png') });
  }
  await browser.close();
})();
