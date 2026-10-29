// Замер загрузки страницы с эмуляцией 4G (9 Мбит/с, 60 мс): время до load и сколько скачано за 6 с, топ-файлы.
// node tools/perf.js <html-файл>     (например tilda/preview.html — медиа с jsDelivr, как на живой странице)
// Ограничение: в Playwright Chromium нет H.264, поэтому mp4 в замер почти не попадают — их вес смотреть по файлам.
// Результат 28.10 после оптимизации: load ~1,1 с, ~1 МБ (было 2,6 с и ~2,3 МБ).
// Если load ~9 с, а скачано ~1 МБ — в песочнице не грузится static.tildacdn.com/css/tilda-grid (подключён только в макете
// preview.html; на живой Тильде его отдаёт сама Тильда). Смотреть объём, а не время, или открыть tilda-example.html.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  for (const [w, h, n, mob] of [[1440, 900, 'desktop', false], [390, 844, 'mobile', true]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob });
    const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 60, downloadThroughput: 9e6 / 8, uploadThroughput: 3e6 / 8 });
    const urls = {}, bytes = {}; let tot = 0;
    cdp.on('Network.responseReceived', e => { urls[e.requestId] = e.response.url; });
    cdp.on('Network.dataReceived', e => {
      const k = (urls[e.requestId] || '').split('?')[0].split('/').pop().slice(0, 40), v = e.encodedDataLength || e.dataLength;
      tot += v; bytes[k] = (bytes[k] || 0) + v;
    });
    const t0 = Date.now(); await p.goto('file://' + path.resolve(process.argv[2]), { waitUntil: 'load' }); const tl = Date.now() - t0;
    await p.waitForTimeout(6000);
    const top = Object.entries(bytes).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${Math.round(v / 1024)}K`).join(', ');
    console.log(`${n}: load ${tl} мс, за 6 с скачано ${Math.round(tot / 1024)} КБ | ${top}`);
    await ctx.close();
  }
  await b.close();
})();
