import { DECKS } from "../data/decks.js";
import { GRADES, previewLabel, dayStart } from "./srs.js";
import * as store from "./storage.js";
import * as tts from "./tts.js";
import {
  buildQueue, counts, nextCard, nextLearningDue, answer, undo, wordFor,
  deckProgress, collectionStats, streak, history, forecast, isDeckEnabled, todayLog,
} from "./study.js";

const state = store.load();
store.requestPersistence();

const $view = document.getElementById("view");
const $title = document.getElementById("title");
const $undo = document.getElementById("undo");

const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const persist = () => store.save(state);

let tab = "study";
let undoStack = [];
const session = { card: null, revealed: false, shownAt: 0, timer: null };

// ---------- Навигация ----------

const TITLES = { study: "Учить", decks: "Колоды", stats: "Статистика", settings: "Настройки" };

document.querySelector(".tabbar").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-tab]");
  if (!b) return;
  show(b.dataset.tab);
});

function show(name) {
  tab = name;
  for (const b of document.querySelectorAll(".tabbar button")) b.classList.toggle("active", b.dataset.tab === name);
  $title.textContent = TITLES[name];
  clearTimeout(session.timer);
  if (name !== "study") session.card = null;
  $view.scrollTop = 0;
  render();
}

function render() {
  $undo.hidden = !(tab === "study" && undoStack.length);
  ({ study: renderStudy, decks: renderDecks, stats: renderStats, settings: renderSettings })[tab]();
}

// ---------- Занятие ----------

const speakOpts = () => ({ voiceURI: state.settings.voiceURI, rate: state.settings.rate });

function pickCard() {
  const now = Date.now();
  const q = buildQueue(state, now);
  session.card = nextCard(q, now);
  session.revealed = false;
  session.shownAt = now;
  return q;
}

function renderStudy() {
  const now = Date.now();
  let q = buildQueue(state, now);
  if (!session.card) q = pickCard();
  const card = session.card;
  const c = counts(q, now);

  if (!card) {
    renderDone(q);
    return;
  }

  const w = wordFor(card.id);
  const isNew = card.state === "new";
  const isLearn = card.state === "learning" || card.state === "relearning";
  const forward = w.dir === "f";
  const cur = isNew ? "new" : isLearn ? "learn" : "review";

  const english = `
    <div class="word" lang="en">${esc(w.en)}</div>
    ${w.tr ? `<div class="trans">[${esc(w.tr)}]</div>` : ""}
    ${tts.supported() ? `<button class="speak" data-say="${esc(w.en)}" aria-label="Произнести">🔊</button>` : ""}`;
  const russian = `<div class="meaning">${esc(w.ru)}</div>`;

  const front = forward ? english : russian;
  const back = forward ? russian : english;
  const example = w.ex
    ? `<div class="example" lang="en"><span>${esc(w.ex)}</span>${
        tts.supported() ? `<button data-say="${esc(w.ex)}" aria-label="Произнести пример">🔊</button>` : ""
      }</div>`
    : "";

  const deck = DECKS.find((d) => d.id === w.deckId);
  const tag = `${deck?.emoji || ""} ${forward ? "EN → RU" : "RU → EN"}${isNew ? " · новое" : ""}`;

  const grades = [
    [GRADES.AGAIN, "Снова"],
    [GRADES.HARD, "Трудно"],
    [GRADES.GOOD, "Хорошо"],
    [GRADES.EASY, "Легко"],
  ];

  $view.innerHTML = `
    <div class="counts" aria-label="Осталось на сегодня">
      <span class="c-new ${cur === "new" ? "current" : ""}">${c.fresh}<small>новые</small></span>
      <span class="c-learn ${cur === "learn" ? "current" : ""}">${c.learning}<small>изучаемые</small></span>
      <span class="c-review ${cur === "review" ? "current" : ""}">${c.reviews}<small>повторить</small></span>
    </div>
    <div class="card ${session.revealed ? "flip" : ""}" id="card">
      <div class="tag">${esc(tag)}</div>
      ${front}
      ${session.revealed ? `<div class="divider"></div>${back}${example}` : ""}
    </div>
    <div class="actions">
      ${
        session.revealed
          ? `<div class="grades">${grades
              .map(
                ([g, label]) =>
                  `<button class="g${g}" data-grade="${g}"><small>${previewLabel(card, g, now)}</small>${label}</button>`,
              )
              .join("")}</div>`
          : `<button class="primary" id="reveal">Показать ответ</button>`
      }
    </div>`;

  if (state.settings.autoSpeak && (forward ? !session.revealed : session.revealed)) {
    tts.speak(w.en, speakOpts());
  }
}

function renderDone(q) {
  const next = nextLearningDue(q);
  const now = Date.now();
  const log = todayLog(state, now);
  let msg = "Вы прошли все карточки на сегодня. Возвращайтесь завтра!";
  if (next) {
    const mins = Math.max(1, Math.round((next - now) / 60000));
    msg = `Следующая изучаемая карточка будет через ${mins} мин.`;
    clearTimeout(session.timer);
    session.timer = setTimeout(() => tab === "study" && !session.card && render(), Math.min(next - now + 500, 2 ** 31 - 1));
  }
  $view.innerHTML = `
    <div class="done">
      <div class="big">${next ? "⏳" : "🎉"}</div>
      <h2>${next ? "Небольшой перерыв" : "На сегодня всё!"}</h2>
      <p>${esc(msg)}</p>
      <p>Сегодня: ${log.reviews} ответов, новых слов — ${log.newSeen}.</p>
      ${
        log.newSeen >= state.settings.newPerDay + (log.extraNew || 0) && !next
          ? `<button class="primary" id="more">Ещё ${Math.min(10, state.settings.newPerDay)} новых слов</button>`
          : ""
      }
    </div>`;
}

$view.addEventListener("click", (e) => {
  const say = e.target.closest("[data-say]");
  if (say) {
    e.stopPropagation();
    tts.speak(say.dataset.say, speakOpts());
    return;
  }
  if (tab !== "study") return;

  if (e.target.closest("#more")) {
    // Временно разрешаем ещё немного новых слов на сегодня.
    const log = todayLog(state, Date.now());
    log.extraNew = (log.extraNew || 0) + Math.min(10, state.settings.newPerDay);
    persist();
    session.card = null;
    render();
    return;
  }

  if (e.target.closest("#reveal") || (e.target.closest("#card") && !session.revealed && session.card)) {
    session.revealed = true;
    render();
    return;
  }

  const g = e.target.closest("[data-grade]");
  if (g && session.card) grade(Number(g.dataset.grade));
});

function grade(g) {
  const now = Date.now();
  const rec = answer(state, session.card, g, now, now - session.shownAt);
  undoStack.push(rec);
  if (undoStack.length > 20) undoStack.shift();
  persist();
  session.card = null;
  render();
}

$undo.addEventListener("click", () => {
  const rec = undoStack.pop();
  if (!rec) return;
  undo(state, rec, Date.now());
  persist();
  session.card = rec.prev ? { ...rec.prev } : { id: rec.id, state: "new", due: 0, interval: 0, ease: 0, step: 0, reps: 0, lapses: 0 };
  session.revealed = false;
  session.shownAt = Date.now();
  render();
});

// Клавиатура (удобно на iPad с клавиатурой): пробел — показать, 1–4 — оценка.
document.addEventListener("keydown", (e) => {
  if (tab !== "study" || !session.card || e.target.matches("input, select")) return;
  if (!session.revealed && (e.key === " " || e.key === "Enter")) {
    e.preventDefault();
    session.revealed = true;
    render();
  } else if (session.revealed && ["1", "2", "3", "4"].includes(e.key)) {
    grade(Number(e.key));
  }
});

// ---------- Колоды ----------

const openDecks = new Set();

function renderDecks() {
  $view.innerHTML = `
    <div class="group">
      ${DECKS.map((d) => {
        const p = deckProgress(state, d);
        const on = isDeckEnabled(state, d.id);
        const seenPct = (100 * (p.seen - p.mature)) / p.total;
        const maturePct = (100 * p.mature) / p.total;
        return `
          <div class="row">
            <div class="emoji">${d.emoji}</div>
            <div class="grow">
              <div>${esc(d.title)}</div>
              <div class="sub">${d.words.length} слов · начато ${p.seen} из ${p.total} карт</div>
              <div class="progress" title="Выучено надолго / начато">
                ${maturePct ? `<i class="p-mature" style="width:${maturePct}%"></i>` : ""}
                ${seenPct ? `<i class="p-seen" style="width:${seenPct}%"></i>` : ""}
              </div>
              <button class="link-btn" data-open="${d.id}" style="margin-top:8px">${openDecks.has(d.id) ? "Скрыть слова" : "Показать слова"}</button>
            </div>
            <label class="switch" aria-label="Изучать колоду «${esc(d.title)}»">
              <input type="checkbox" data-deck="${d.id}" ${on ? "checked" : ""}><span></span>
            </label>
          </div>
          ${
            openDecks.has(d.id)
              ? `<ul class="words">${d.words
                  .map(([en, , ru]) => `<li><span lang="en">${esc(en)}</span><span class="ru">${esc(ru)}</span></li>`)
                  .join("")}</ul>`
              : ""
          }`;
      }).join("")}
    </div>
    <p class="note">Выключенные колоды не участвуют в занятиях, но прогресс по ним сохраняется.</p>`;
}

$view.addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.deck) {
    state.decks[t.dataset.deck] = t.checked;
    persist();
    session.card = null;
  }
});

$view.addEventListener("click", (e) => {
  const o = e.target.closest("[data-open]");
  if (!o) return;
  const id = o.dataset.open;
  openDecks.has(id) ? openDecks.delete(id) : openDecks.add(id);
  render();
});

// ---------- Статистика ----------

const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const fmtDate = (t) => {
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// Столбчатая диаграмма одной серии: тонкие столбцы со скруглённым верхом,
// подпись значения появляется при касании.
function barChart(id, data, { label, value, highlightLast = false, tick }) {
  const W = 320;
  const H = 120;
  const pad = { t: 6, b: 18 };
  const max = Math.max(1, ...data.map(value));
  const n = data.length;
  const slot = W / n;
  const bw = Math.max(3, Math.min(22, slot - 2));
  const bars = data
    .map((d, i) => {
      const v = value(d);
      const h = v ? Math.max(4, ((H - pad.t - pad.b) * v) / max) : 0;
      const x = i * slot + (slot - bw) / 2;
      const y = H - pad.b - h;
      const r = Math.min(4, bw / 2, h);
      const path = h
        ? `M${x},${H - pad.b} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${H - pad.b} Z`
        : "";
      const dim = highlightLast && i !== n - 1 ? "dim" : "";
      return `${path ? `<path class="bar ${dim}" d="${path}"/>` : ""}
        <rect class="hit" x="${i * slot}" y="0" width="${slot}" height="${H}" data-i="${i}"/>
        ${tick(d, i) ? `<text class="axis" x="${i * slot + slot / 2}" y="${H - 4}" text-anchor="middle">${tick(d, i)}</text>` : ""}`;
    })
    .join("");
  return `<svg id="${id}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    <line class="base" x1="0" x2="${W}" y1="${H - pad.b + 0.5}" y2="${H - pad.b + 0.5}"/>${bars}</svg>`;
}

function attachReadout(svgId, readoutId, data, text) {
  const svg = document.getElementById(svgId);
  const out = document.getElementById(readoutId);
  const def = out.textContent;
  const showAt = (e) => {
    const r = e.target.closest?.(".hit");
    if (r) out.textContent = text(data[Number(r.dataset.i)]);
  };
  svg.addEventListener("pointerover", showAt);
  svg.addEventListener("pointerdown", showAt);
  svg.addEventListener("pointerleave", () => (out.textContent = def));
}

function renderStats() {
  const now = Date.now();
  const log = todayLog(state, now);
  const s = streak(state, now);
  const cs = collectionStats(state);
  const hist = history(state, now, 30);
  const fc = forecast(state, now, 7);
  const acc = log.reviews ? Math.round((100 * (log.reviews - log.again)) / log.reviews) : null;
  const mins = Math.round(log.ms / 60000);
  const total30 = hist.reduce((a, d) => a + d.reviews, 0);
  const days30 = hist.filter((d) => d.reviews > 0).length;
  const fcTotal = fc.reduce((a, d) => a + d.due, 0);
  const WD = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

  $view.innerHTML = `
    <div class="tiles">
      <div class="tile"><div class="v">🔥 ${s}</div><div class="l">${plural(s, "день", "дня", "дней")} подряд</div></div>
      <div class="tile"><div class="v">${log.reviews}</div><div class="l">ответов сегодня</div></div>
      <div class="tile"><div class="v">${acc === null ? "—" : acc + "%"}</div><div class="l">правильно сегодня</div></div>
      <div class="tile"><div class="v">${mins}</div><div class="l">${plural(mins, "минута", "минуты", "минут")} сегодня</div></div>
    </div>

    <div class="group-title">Коллекция</div>
    <div class="group breakdown">
      ${[
        ["Новые", cs.fresh, "var(--new)", "ещё не показывались"],
        ["Изучаемые", cs.learning, "var(--learn)", "короткие интервалы"],
        ["Молодые", cs.young, "var(--review)", "интервал до 3 недель"],
        ["Выученные", cs.mature, "var(--text)", "интервал от 3 недель"],
      ]
        .map(
          ([t, v, col, sub]) => `<div class="row"><span class="dot" style="background:${col}"></span>
          <div class="grow">${t}<div class="sub">${sub}</div></div><span class="num">${v}</span></div>`,
        )
        .join("")}
    </div>

    <div class="group chart">
      <h3>Прогноз повторений</h3>
      <div class="readout" id="fc-out">${fcTotal} ${plural(fcTotal, "карточка", "карточки", "карточек")} на 7 дней</div>
      ${barChart("fc", fc, {
        label: "Прогноз повторений на 7 дней",
        value: (d) => d.due,
        tick: (d, i) => (i === 0 ? "сег" : WD[new Date(d.t).getDay()]),
      })}
    </div>

    <div class="group chart">
      <h3>Активность за 30 дней</h3>
      <div class="readout" id="h-out">${total30} ${plural(total30, "ответ", "ответа", "ответов")} · занимались ${days30} из 30 дней</div>
      ${barChart("hist", hist, {
        label: "Ответов в день за последние 30 дней",
        value: (d) => d.reviews,
        highlightLast: true,
        tick: (d, i) => (i % 7 === 2 || i === 29 ? (i === 29 ? "сег" : fmtDate(d.t)) : ""),
      })}
    </div>
    <p class="note">Коснитесь столбца, чтобы увидеть значение.</p>`;

  attachReadout("fc", "fc-out", fc, (d) =>
    `${dayStart(d.t) === dayStart(now) ? "Сегодня" : fmtDate(d.t)}: ${d.due} ${plural(d.due, "карточка", "карточки", "карточек")}`,
  );
  attachReadout("hist", "h-out", hist, (d) =>
    `${fmtDate(d.t)}: ${d.reviews} ${plural(d.reviews, "ответ", "ответа", "ответов")}`,
  );
}

// ---------- Настройки ----------

function renderSettings() {
  const st = state.settings;
  const voices = tts.englishVoices();
  $view.innerHTML = `
    <div class="group-title">Занятия</div>
    <div class="group">
      <div class="row"><div class="grow">Новых слов в день</div>
        <input type="number" inputmode="numeric" min="0" max="200" data-set="newPerDay" value="${st.newPerDay}"></div>
      <div class="row"><div class="grow">Максимум повторений в день</div>
        <input type="number" inputmode="numeric" min="0" max="9999" data-set="maxReviews" value="${st.maxReviews}"></div>
      <div class="row"><div class="grow">Направление</div>
        <select data-set="direction">
          <option value="both" ${st.direction === "both" ? "selected" : ""}>Оба</option>
          <option value="en-ru" ${st.direction === "en-ru" ? "selected" : ""}>EN → RU</option>
          <option value="ru-en" ${st.direction === "ru-en" ? "selected" : ""}>RU → EN</option>
        </select></div>
    </div>

    <div class="group-title">Произношение</div>
    <div class="group">
      ${
        tts.supported()
          ? `<div class="row"><div class="grow">Озвучивать автоматически</div>
              <label class="switch"><input type="checkbox" data-set="autoSpeak" ${st.autoSpeak ? "checked" : ""}><span></span></label></div>
            <div class="row"><div class="grow">Голос</div>
              <select data-set="voiceURI">
                <option value="">Автоматически</option>
                ${voices
                  .map((v) => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === st.voiceURI ? "selected" : ""}>${esc(v.name)} (${esc(v.lang)})</option>`)
                  .join("")}
              </select></div>
            <div class="row"><div class="grow">Скорость<div class="sub" id="rate-v">${st.rate.toFixed(2)}×</div></div>
              <input type="range" min="0.5" max="1.2" step="0.05" data-set="rate" value="${st.rate}"></div>
            <div class="row"><button class="link-btn" data-say="Hello! Let's learn some English words.">▶︎ Проверить голос</button></div>`
          : `<div class="row"><div class="grow sub">Этот браузер не поддерживает синтез речи.</div></div>`
      }
    </div>
    <p class="note">Больше качественных голосов: Настройки iPhone → Универсальный доступ → Устный контент → Голоса → English.</p>

    <div class="group-title">Данные</div>
    <div class="group">
      <div class="row"><button class="link-btn danger" id="reset">Сбросить весь прогресс</button></div>
    </div>
    <p class="note">Прогресс хранится только на этом устройстве. Чтобы iPhone его не удалил, установите приложение на экран «Домой».</p>`;
}

$view.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.set !== "rate") return;
  state.settings.rate = Number(t.value);
  document.getElementById("rate-v").textContent = `${state.settings.rate.toFixed(2)}×`;
  persist();
});

$view.addEventListener("change", (e) => {
  const t = e.target;
  const key = t.dataset.set;
  if (!key) return;
  if (t.type === "checkbox") state.settings[key] = t.checked;
  else if (t.type === "number") {
    const v = Math.max(0, Math.floor(Number(t.value) || 0));
    state.settings[key] = v;
    t.value = v;
  } else if (key === "rate") state.settings.rate = Number(t.value);
  else state.settings[key] = t.value;
  persist();
  session.card = null;
});

$view.addEventListener("click", (e) => {
  if (!e.target.closest("#reset")) return;
  if (!confirm("Удалить весь прогресс и статистику? Это нельзя отменить.")) return;
  state.cards = {};
  state.log = {};
  undoStack = [];
  persist();
  session.card = null;
  show("study");
});

// Голоса в Safari подгружаются асинхронно — обновим список в настройках.
window.speechSynthesis?.addEventListener?.("voiceschanged", () => tab === "settings" && render());

// Если приложение долго было в фоне — после возвращения обновляем очередь.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && tab !== "settings") render();
});

render();
