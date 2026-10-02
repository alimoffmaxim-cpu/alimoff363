// Рисует картинки для соцсетей (site/og/*.png, 1200×630) и иконки сайта (site/icons/).
// Запуск: node site/make_images.js  (нужен пакет playwright и Chromium)
// Данные берутся из site/cases.json, который пишет build.py.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const here = __dirname;
const LOGO = fs.readFileSync(path.join(__dirname, 'brand', 'alimov-agency-white.svg'), 'utf8').replace(/width="[\d.]+" height="[\d.]+"/, 'height="40"');
const data = JSON.parse(fs.readFileSync(path.join(here, 'cases.json'), 'utf8'));
const FONT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geologica:wght@500;600;700&family=Golos+Text:wght@500;600&display=swap">';
const RINGS = '<svg viewBox="-300 -300 600 600" style="position:absolute;right:-170px;top:-150px;width:760px;color:rgba(255,255,255,.12)"><g fill="none" stroke="currentColor"><circle r="70"/><circle r="140"/><circle r="210"/><circle r="280"/><path d="M-300 0H-90M90 0H300M0 -300V-90M0 90V300" stroke-dasharray="2 7"/></g><circle r="175" fill="none" stroke="#E6007E" stroke-width="2" stroke-dasharray="3 13"/><circle r="5" fill="#E6007E"/></svg>';

const card = ({ kicker, big, title, foot }) => `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>
*{box-sizing:border-box;margin:0}body{width:1200px;height:630px;overflow:hidden;background:#0B0B0D;color:#fff;font-family:"Golos Text",Arial,sans-serif}
.w{position:relative;height:100%;padding:64px 72px;display:flex;flex-direction:column;justify-content:space-between}
.glow{position:absolute;left:-200px;bottom:-320px;width:760px;height:760px;border-radius:50%;background:radial-gradient(closest-side,rgba(230,0,126,.35),transparent)}
.logo{display:flex}.logo svg{height:40px;width:auto}
.k{display:flex;align-items:center;gap:12px;font-size:22px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#A6A6B0}.k:before{content:"";width:12px;height:12px;border-radius:50%;background:#E6007E}
.big{font-family:Geologica;font-weight:600;font-size:150px;line-height:.9;letter-spacing:-.06em;background:linear-gradient(100deg,#fff 40%,#E6007E 100%);-webkit-background-clip:text;color:transparent}
.t{font-family:Geologica;font-weight:600;font-size:46px;line-height:1.1;letter-spacing:-.03em;max-width:900px}
.f{font-size:24px;color:#D6D6DD}
</style></head><body><div class="w"><div class="glow"></div>${RINGS}
<div class="logo">${LOGO}</div>
<div style="display:grid;gap:22px"><div class="k">${kicker}</div>${big ? `<div class="big">${big}</div>` : ''}<div class="t">${title}</div></div>
<div class="f">${foot}</div></div></body></html>`;

const icon = (size) => `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>*{margin:0}body{width:${size}px;height:${size}px;background:transparent}
.i{width:100%;height:100%;border-radius:${size * 0.22}px;background:#0B0B0D;display:grid;place-items:center;position:relative}
.a{font-family:Geologica;font-weight:700;color:#fff;font-size:${size * 0.66}px;line-height:1;letter-spacing:-.05em;transform:translate(-${size * 0.04}px,-${size * 0.06}px)}
.d{position:absolute;width:${size * 0.17}px;height:${size * 0.17}px;border-radius:50%;background:#E6007E;right:${size * 0.17}px;bottom:${size * 0.2}px}</style></head>
<body><div class="i"><span class="a">a</span><span class="d"></span></div></body></html>`;

(async () => {
  const exe = process.env.CHROMIUM_PATH;
  const browser = await chromium.launch(exe ? { executablePath: exe, args: process.env.HTTPS_PROXY ? ['--proxy-server=' + process.env.HTTPS_PROXY, '--ignore-certificate-errors'] : [] } : {});
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  const shots = [['main', card({ kicker: 'Таргет ВКонтакте для детских школ', big: '37 784', title: 'заявки для детских школ в пяти кейсах', foot: 'от 135 ₽ за заявку · ROMI до 1600% · alimov.agency' })]];
  for (const c of data) shots.push([c.slug, card({ kicker: 'Кейс · ' + c.short, big: c.leads, title: c.client, foot: `цена заявки ${c.cpl} ₽ · бюджет ${c.budget} · alimov.agency` })]);
  for (const [name, html] of shots) {
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(here, 'og', name + '.png') });
  }
  for (const size of [32, 180, 512]) {
    const p = await browser.newPage({ viewport: { width: size, height: size } });
    await p.setContent(icon(size), { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(here, 'icons', `icon-${size}.png`), omitBackground: true });
    await p.close();
  }
  await browser.close();
  console.log('site/og/*.png, site/icons/*.png');
})();
