"use strict";
// Загружает свежие app.js и style.css при каждом открытии: бот добавляет к адресу ?v=<время>,
// поэтому Telegram не показывает закэшированную старую версию дашборда.
// Фрагмент ссылки (#d.… — данные) запоминаем сразу, до загрузки скрипта Telegram.
window.FINBOT_HASH = (function () { try { return String(location.hash || ""); } catch (e) { return ""; } })();
(function () {
  var m = /[?&]v=(\d+)/.exec(location.search);
  var v = m ? m[1] : String(Date.now());
  var css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "style.css?v=" + v;
  document.head.appendChild(css);
  var js = document.createElement("script");
  js.src = "app.js?v=" + v;
  js.async = false;
  document.head.appendChild(js);
})();
