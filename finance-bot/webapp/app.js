"use strict";
// Данные приходят только во фрагменте ссылки (#d.<base64url JSON>) — на сервер они не попадают.
// Фрагмент читаем сразу, до загрузки скрипта Telegram.
var RAW_HASH = (function () { try { return String(location.hash || ""); } catch (e) { return ""; } })();

(function () {
  var MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь",
    "Октябрь", "Ноябрь", "Декабрь"];
  var MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  var EMOJI = {
    "Еда": "🍜", "Продукты": "🛒", "Кафе": "☕", "Транспорт": "🛵", "Жильё": "🏠", "Связь": "📱",
    "Здоровье": "💊", "Развлечения": "🎉", "Покупки": "🛍", "Путешествия": "✈️", "Уход": "💆",
    "Другое": "📦", "Зарплата": "💼", "Фриланс": "💻", "Подарок": "🎁", "Возврат": "💸"
  };
  var SVG_NS = "http://www.w3.org/2000/svg";

  // ---------- данные ----------
  function decode() {
    var m = RAW_HASH.match(/d\.([A-Za-z0-9_-]+)/);
    if (!m) return null;
    var b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var data = JSON.parse(new TextDecoder("utf-8").decode(bytes));
    return data && data.v === 1 ? data : null;
  }

  function months(data) {
    return data.m.map(function (row, i) {
      var cats = [];
      var pairs = data.k[i] || [];
      for (var j = 0; j < pairs.length; j += 2) cats.push({ name: data.c[pairs[j]], amount: pairs[j + 1] });
      return { year: row[0], month: row[1], income: row[2], expense: row[3], fxRub: row[4], fxThb: row[5],
        rate: row[5] ? row[4] / row[5] : null, cats: cats };
    });
  }

  // ---------- форматирование ----------
  function num(v) { return Math.round(v).toLocaleString("ru-RU").replace(/,/g, " "); }
  function thb(v) { return (v < 0 ? "−" : "") + num(Math.abs(v)) + " ฿"; }
  function rub(v) { return (v < 0 ? "−" : "") + num(Math.abs(v)) + " ₽"; }
  function rate(v) { return v ? v.toFixed(2).replace(".", ",") + " ₽/฿" : "—"; }
  function short(v) {
    if (v >= 1e6) return (v / 1e6).toFixed(1).replace(".", ",") + " млн";
    if (v >= 1e3) return Math.round(v / 1e3) + "к";
    return String(Math.round(v));
  }
  function emoji(name) { return EMOJI[name] || "🏷"; }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function svg(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }

  // Изменение к прошлому месяцу. upIsGood — рост это хорошо (доходы) или плохо (расходы, курс).
  function delta(cur, prev, upIsGood) {
    var span = el("span", "delta");
    if (!prev) { span.textContent = "нет данных для сравнения"; return span; }
    var pct = (cur - prev) / prev * 100;
    var arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "•";
    span.textContent = arrow + " " + (pct > 0 ? "+" : pct < 0 ? "−" : "") +
      Math.abs(pct).toFixed(1).replace(".", ",") + "%";
    if (pct !== 0) span.className += (pct > 0) === upIsGood ? " good" : " bad";
    return span;
  }

  // ---------- рисование ----------
  var state = { data: null, months: [], sel: 0 };

  function render() {
    var app = document.getElementById("app");
    app.textContent = "";
    var data = state.data, ms = state.months, cur = ms[state.sel], prev = ms[state.sel - 1];
    var lastRate = data.r || null;

    var header = el("header");
    header.appendChild(el("h1", null, "Финансы"));
    header.appendChild(el("p", "muted small", "Данные на " + data.t + " · все суммы в батах"));
    app.appendChild(header);

    // Выбор месяца — всё ниже считается только за выбранный месяц
    var bar = el("div", "months");
    ms.forEach(function (m, i) {
      var b = el("button", i === state.sel ? "active" : "", MONTHS[m.month - 1] + (m.year !== ms[ms.length - 1].year ? " " + m.year : ""));
      b.addEventListener("click", function () { select(i); });
      bar.appendChild(b);
    });
    app.appendChild(bar);
    setTimeout(function () { var a = bar.querySelector(".active"); if (a && a.scrollIntoView) a.scrollIntoView({ inline: "center", block: "nearest" }); }, 0);

    var effRate = cur.rate || lastRate;
    var hero = el("div", "hero");
    hero.appendChild(el("div", "label", "Расходы · " + MONTHS[cur.month - 1] + " " + cur.year));
    hero.appendChild(el("div", "value", thb(cur.expense)));
    var heroSub = el("div", "sub");
    heroSub.appendChild(delta(cur.expense, prev && prev.expense, false));
    if (effRate && cur.expense) heroSub.appendChild(document.createTextNode(" · ≈ " + rub(cur.expense * effRate)));
    hero.appendChild(heroSub);
    app.appendChild(hero);

    if (prev) app.appendChild(el("p", "muted small", "Каждый месяц считается с нуля. Изменения — по сравнению с месяцем «" + MONTHS[prev.month - 1].toLowerCase() + "»."));

    // Плитки месяца
    var tiles = el("div", "tiles");
    tiles.appendChild(tile("income", "Доходы за месяц", thb(cur.income), [delta(cur.income, prev && prev.income, true)]));
    var net = cur.income - cur.expense;
    tiles.appendChild(tile(null, "Итог месяца", thb(net), [el("span", null, prev ? "прошлый: " + thb(prev.income - prev.expense) : "доходы − расходы")]));
    tiles.appendChild(tile("rate", "Обмен ₽ → ฿", cur.fxThb ? thb(cur.fxThb) : "—",
      cur.fxThb ? [el("div", null, "за " + rub(cur.fxRub) + " · " + rate(cur.rate)),
        prev && prev.rate ? delta(cur.rate, prev.rate, false) : null] : [el("span", null, "в этом месяце не было")]));
    tiles.appendChild(tile(null, "Остаток на руках", thb(data.b),
      [el("span", null, "за всё время" + (lastRate ? " · ≈ " + rub(data.b * lastRate) : ""))]));
    app.appendChild(tiles);

    app.appendChild(columnsChart(ms));
    var rateSection = rateChart(ms);
    if (rateSection) app.appendChild(rateSection);
    app.appendChild(categories(cur));
    app.appendChild(operations(data));

    app.appendChild(el("footer", null, "Это снимок на момент нажатия «Дашборд». Чтобы обновить — закройте и нажмите кнопку в боте ещё раз."));
  }

  function tile(kind, label, value, subs) {
    var t = el("div", "tile");
    var l = el("div", "label");
    if (kind) l.appendChild(el("span", "swatch " + kind));
    l.appendChild(document.createTextNode(label));
    t.appendChild(l);
    t.appendChild(el("div", "value", value));
    subs.forEach(function (s) { if (s) { var d = el("div", "sub"); d.appendChild(s); t.appendChild(d); } });
    return t;
  }

  function select(i) {
    state.sel = i;
    var y = window.scrollY;
    render();
    window.scrollTo(0, y);
    try { Telegram.WebApp.HapticFeedback.selectionChanged(); } catch (e) { /* не в Telegram */ }
  }

  // Столбцы: доходы и расходы по месяцам. Нажатие на месяц выбирает его.
  function columnsChart(ms) {
    var sec = el("section");
    sec.appendChild(el("h2", null, "Доходы и расходы по месяцам"));
    var legend = el("div", "legend");
    [["income", "Доходы"], ["expense", "Расходы"]].forEach(function (p) {
      var s = el("span"); s.appendChild(el("span", "swatch " + p[0])); s.appendChild(document.createTextNode(p[1])); legend.appendChild(s);
    });
    sec.appendChild(legend);
    var cur = ms[state.sel];
    var readout = el("div", "readout");
    readout.appendChild(document.createTextNode(MONTHS[cur.month - 1] + ": доходы "));
    readout.appendChild(el("b", null, thb(cur.income)));
    readout.appendChild(document.createTextNode(", расходы "));
    readout.appendChild(el("b", null, thb(cur.expense)));
    sec.appendChild(readout);

    var W = chartWidth(), H = 210, top = 16, bottom = 26, left = 40, right = 4;
    var max = Math.max.apply(null, ms.map(function (m) { return Math.max(m.income, m.expense); }).concat([1]));
    var step = niceStep(max / 4);
    var yMax = Math.ceil(max / step) * step;
    var plotH = H - top - bottom, band = (W - left - right) / ms.length;
    var barW = Math.min(24, (band - 14) / 2);
    var root = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Доходы и расходы по месяцам" });
    for (var v = 0; v <= yMax + 0.5; v += step) {
      var y = top + plotH - v / yMax * plotH;
      root.appendChild(svg("line", { x1: left, x2: W - right, y1: y, y2: y, "class": "gridline" }));
      var t = svg("text", { x: left - 6, y: y + 4, "text-anchor": "end" }); t.textContent = short(v); root.appendChild(t);
    }
    ms.forEach(function (m, i) {
      var cx = left + band * i + band / 2;
      var dim = i === state.sel ? "" : " dim";
      [[m.income, "bar-income", cx - barW - 1], [m.expense, "bar-expense", cx + 1]].forEach(function (b) {
        if (!b[0]) return;
        var h = Math.max(1, b[0] / yMax * plotH);
        root.appendChild(svg("path", { d: roundedTop(b[2], top + plotH - h, barW, h, 4), "class": b[1] + dim }));
      });
      var lbl = svg("text", { x: cx, y: H - 8, "text-anchor": "middle", "class": i === state.sel ? "sel" : "" });
      lbl.textContent = MONTHS_SHORT[m.month - 1];
      root.appendChild(lbl);
      var hit = svg("rect", { x: left + band * i, y: 0, width: band, height: H, "class": "hit" });
      hit.addEventListener("click", function () { select(i); });
      root.appendChild(hit);
    });
    sec.appendChild(root);
    return sec;
  }

  // Динамика курса обмена (только месяцы, когда был обмен).
  function rateChart(ms) {
    var pts = [];
    ms.forEach(function (m, i) { if (m.rate) pts.push({ i: i, rate: m.rate, m: m }); });
    if (pts.length < 2) return null;
    var sec = el("section");
    sec.appendChild(el("h2", null, "Курс обмена, ₽ за 1 ฿"));
    var last = pts[pts.length - 1], first = pts[0];
    var ro = el("div", "readout");
    ro.appendChild(document.createTextNode("Последний: "));
    ro.appendChild(el("b", null, rate(last.rate)));
    ro.appendChild(document.createTextNode(" · за период " + (last.rate >= first.rate ? "+" : "−") +
      Math.abs((last.rate - first.rate) / first.rate * 100).toFixed(1).replace(".", ",") + "%"));
    sec.appendChild(ro);

    var W = chartWidth(), H = 130, top = 14, bottom = 24, left = 40, right = 14;
    var lo = Math.min.apply(null, pts.map(function (p) { return p.rate; }));
    var hi = Math.max.apply(null, pts.map(function (p) { return p.rate; }));
    var pad = Math.max((hi - lo) * 0.25, 0.05);
    lo -= pad; hi += pad;
    var band = (W - left - right) / ms.length, plotH = H - top - bottom;
    function X(i) { return left + band * i + band / 2; }
    function Y(r) { return top + (hi - r) / (hi - lo) * plotH; }
    var root = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Курс обмена по месяцам" });
    [lo + pad, hi - pad].forEach(function (v) {
      root.appendChild(svg("line", { x1: left, x2: W - right, y1: Y(v), y2: Y(v), "class": "gridline" }));
      var t = svg("text", { x: left - 6, y: Y(v) + 4, "text-anchor": "end" }); t.textContent = v.toFixed(2).replace(".", ","); root.appendChild(t);
    });
    root.appendChild(svg("path", { d: pts.map(function (p, k) { return (k ? "L" : "M") + X(p.i) + " " + Y(p.rate); }).join(" "), "class": "rate-line" }));
    pts.forEach(function (p) {
      root.appendChild(svg("circle", { cx: X(p.i), cy: Y(p.rate), r: p.i === state.sel ? 6 : 4, "class": "rate-dot" }));
    });
    ms.forEach(function (m, i) {
      var t = svg("text", { x: X(i), y: H - 6, "text-anchor": "middle", "class": i === state.sel ? "sel" : "" });
      t.textContent = MONTHS_SHORT[m.month - 1]; root.appendChild(t);
    });
    sec.appendChild(root);
    return sec;
  }

  function categories(m) {
    var sec = el("section");
    sec.appendChild(el("h2", null, "Расходы по категориям · " + MONTHS[m.month - 1].toLowerCase()));
    if (!m.cats.length) { sec.appendChild(el("p", "muted", "Расходов в этом месяце нет.")); return sec; }
    var total = m.expense || 1, max = m.cats[0].amount || 1;
    var ul = el("ul", "cats");
    m.cats.forEach(function (c) {
      var li = el("li");
      var row = el("div", "row");
      row.appendChild(el("span", null, emoji(c.name) + " " + c.name));
      row.appendChild(el("span", "amt", thb(c.amount) + " · " + Math.round(c.amount / total * 100) + "%"));
      li.appendChild(row);
      var track = el("div", "track"), fill = el("div", "fill");
      fill.style.width = Math.max(2, c.amount / max * 100) + "%";
      track.appendChild(fill); li.appendChild(track);
      ul.appendChild(li);
    });
    sec.appendChild(ul);
    return sec;
  }

  function operations(data) {
    var sec = el("section");
    sec.appendChild(el("h2", null, "Последние операции"));
    if (!data.o.length) { sec.appendChild(el("p", "muted", "Операций пока нет.")); return sec; }
    var ul = el("ul", "ops");
    data.o.forEach(function (o) {
      // [дата, вид, сумма ฿, индекс категории, сумма ₽]
      var li = el("li"), what = el("div", "what"), amt;
      var name = o[3] >= 0 ? data.c[o[3]] : "";
      if (o[1] === "x") {
        what.appendChild(el("div", null, "💱 Обмен"));
        amt = el("div", "amt", "+" + thb(o[2]));
        amt.appendChild(el("div", "when", rub(o[4]) + " · " + rate(o[4] / o[2])));
      } else if (o[1] === "a") {
        what.appendChild(el("div", null, "⚖️ Корректировка"));
        amt = el("div", "amt", (o[2] > 0 ? "+" : "") + thb(o[2]));
      } else {
        what.appendChild(el("div", null, emoji(name) + " " + name));
        amt = el("div", "amt" + (o[1] === "i" ? " in" : ""), (o[1] === "i" ? "+" : "−") + thb(o[2]));
      }
      what.appendChild(el("div", "when", o[0]));
      li.appendChild(what); li.appendChild(amt);
      ul.appendChild(li);
    });
    sec.appendChild(ul);
    return sec;
  }

  function chartWidth() {
    var app = document.getElementById("app");
    return Math.max(280, Math.min(608, (app ? app.clientWidth : 360) - 32));
  }

  function niceStep(raw) {
    var p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
    var n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }

  // Столбец со скруглённой вершиной (4px) и прямым основанием.
  function roundedTop(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    return "M" + x + " " + (y + h) + "V" + (y + r) + "Q" + x + " " + y + " " + (x + r) + " " + y +
      "H" + (x + w - r) + "Q" + (x + w) + " " + y + " " + (x + w) + " " + (y + r) + "V" + (y + h) + "Z";
  }

  function applyTheme() {
    var scheme = "light";
    try { scheme = Telegram.WebApp.colorScheme || scheme; } catch (e) {
      if (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) scheme = "dark";
    }
    document.documentElement.setAttribute("data-theme", scheme);
  }

  function start() {
    try {
      Telegram.WebApp.ready();
      Telegram.WebApp.expand();
      Telegram.WebApp.onEvent("themeChanged", applyTheme);
    } catch (e) { /* открыто не в Telegram */ }
    applyTheme();
    var app = document.getElementById("app");
    var data = null;
    try { data = decode(); } catch (e) { data = null; }
    if (!data) {
      app.textContent = "";
      var box = el("div", "empty");
      box.appendChild(el("h2", null, "Нет данных"));
      box.appendChild(el("p", "muted", "Откройте дашборд из бота: кнопка «📊 Дашборд» → «Открыть дашборд»."));
      app.appendChild(box);
      return;
    }
    state.data = data;
    state.months = months(data);
    state.sel = state.months.length - 1;
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
