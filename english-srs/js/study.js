// Очередь занятия и подсчёты. Модуль без DOM — его можно тестировать в node.

import { DECKS } from "../data/decks.js";
import { DAY, MIN, dayStart, dayKey, newCard, schedule } from "./srs.js";

const LEARN_AHEAD = 20 * MIN;
const MATURE_DAYS = 21;

export function cardId(deckId, en, dir) {
  return `${deckId}|${en}|${dir}`;
}

export function parseId(id) {
  const [deckId, en, dir] = id.split("|");
  return { deckId, en, dir };
}

const WORDS = new Map();
for (const deck of DECKS) {
  for (const [en, tr, ru, ex] of deck.words) WORDS.set(`${deck.id}|${en}`, { en, tr, ru, ex });
}

export function wordFor(id) {
  const { deckId, en, dir } = parseId(id);
  return { ...WORDS.get(`${deckId}|${en}`), dir, deckId };
}

export function isDeckEnabled(state, deckId) {
  return state.decks[deckId] !== false;
}

function dirs(settings) {
  if (settings.direction === "en-ru") return ["f"];
  if (settings.direction === "ru-en") return ["r"];
  return ["f", "r"];
}

// Все карточки активных колод в порядке показа новых слов.
export function allIds(state) {
  const ids = [];
  const ds = dirs(state.settings);
  for (const deck of DECKS) {
    if (!isDeckEnabled(state, deck.id)) continue;
    for (const [en] of deck.words) for (const d of ds) ids.push(cardId(deck.id, en, d));
  }
  return ids;
}

export function todayLog(state, now) {
  const k = dayKey(now);
  if (!state.log[k]) state.log[k] = { reviews: 0, newSeen: 0, again: 0, reviewDone: 0, ms: 0 };
  return state.log[k];
}

function wordKey(id) {
  return id.slice(0, id.lastIndexOf("|"));
}

// Слова, на которые уже отвечали сегодня: вторую сторону той же карточки
// в этот день не показываем (как «закапывание» родственных карт в Anki).
function answeredWordsToday(state, now) {
  const start = dayStart(now);
  const set = new Set();
  for (const c of Object.values(state.cards)) if (c.last >= start) set.add(wordKey(c.id));
  return set;
}

export function buildQueue(state, now) {
  const end = dayStart(now) + DAY;
  const log = todayLog(state, now);
  const learning = [];
  const reviews = [];
  const fresh = [];
  const buried = answeredWordsToday(state, now);
  const newLimit = Math.max(0, state.settings.newPerDay + (log.extraNew || 0) - log.newSeen);
  const reviewLimit = Math.max(0, state.settings.maxReviews - log.reviewDone);

  for (const id of allIds(state)) {
    const c = state.cards[id];
    if (!c) {
      if (fresh.length < newLimit && !buried.has(wordKey(id))) {
        fresh.push(id);
        buried.add(wordKey(id));
      }
    } else if (c.state === "learning" || c.state === "relearning") {
      if (c.due < end) learning.push(c);
    } else if (c.state === "review" && c.due < end) {
      reviews.push(c);
    }
  }
  learning.sort((a, b) => a.due - b.due);
  reviews.sort((a, b) => a.due - b.due);
  return { learning, reviews: reviews.slice(0, reviewLimit), fresh };
}

export function counts(q, now) {
  return {
    fresh: q.fresh.length,
    learning: q.learning.filter((c) => c.due <= now + LEARN_AHEAD).length,
    reviews: q.reviews.length,
  };
}

// Следующая карточка: сначала созревшие «изучаемые», затем вперемешку
// повторения и новые, затем изучаемые с опережением до 20 минут.
export function nextCard(q, now, rnd = Math.random) {
  const ready = q.learning.find((c) => c.due <= now);
  if (ready) return ready;
  const r = q.reviews.length;
  const n = q.fresh.length;
  if (r || n) {
    if (n && (!r || rnd() < n / (n + r))) return newCard(q.fresh[0]);
    return q.reviews[0];
  }
  const ahead = q.learning.find((c) => c.due <= now + LEARN_AHEAD);
  return ahead || null;
}

// Когда появится следующая изучаемая карточка (для экрана «на сегодня всё»).
export function nextLearningDue(q) {
  return q.learning.length ? q.learning[0].due : null;
}

export function answer(state, card, grade, now, ms = 0) {
  const log = todayLog(state, now);
  const prev = state.cards[card.id];
  const next = { ...schedule(card, grade, now), last: now };
  log.reviews += 1;
  log.ms += Math.min(ms, 60000);
  if (card.state === "new") log.newSeen += 1;
  if (card.state === "review") log.reviewDone += 1;
  if (grade === 1) log.again += 1;
  state.cards[card.id] = next;
  return { id: card.id, prev, prevState: card.state, grade, ms: Math.min(ms, 60000) };
}

// Отмена последнего ответа.
export function undo(state, rec, now) {
  const log = todayLog(state, now);
  log.reviews = Math.max(0, log.reviews - 1);
  log.ms = Math.max(0, log.ms - rec.ms);
  if (rec.prevState === "new") log.newSeen = Math.max(0, log.newSeen - 1);
  if (rec.prevState === "review") log.reviewDone = Math.max(0, log.reviewDone - 1);
  if (rec.grade === 1) log.again = Math.max(0, log.again - 1);
  if (rec.prev) state.cards[rec.id] = rec.prev;
  else delete state.cards[rec.id];
}

// ---- Статистика ----

export function deckProgress(state, deck) {
  let seen = 0;
  let mature = 0;
  const ds = dirs(state.settings);
  const total = deck.words.length * ds.length;
  for (const [en] of deck.words) {
    for (const d of ds) {
      const c = state.cards[cardId(deck.id, en, d)];
      if (c) seen += 1;
      if (c && c.state === "review" && c.interval >= MATURE_DAYS) mature += 1;
    }
  }
  return { total, seen, mature };
}

export function collectionStats(state) {
  const r = { fresh: 0, learning: 0, young: 0, mature: 0 };
  for (const id of allIds(state)) {
    const c = state.cards[id];
    if (!c) r.fresh += 1;
    else if (c.state !== "review") r.learning += 1;
    else if (c.interval >= MATURE_DAYS) r.mature += 1;
    else r.young += 1;
  }
  return r;
}

export function streak(state, now) {
  let n = 0;
  let t = dayStart(now);
  // Если сегодня ещё не занимались, серия считается со вчерашнего дня.
  if (!(state.log[dayKey(t)]?.reviews > 0)) t -= DAY;
  while (state.log[dayKey(t + MIN)]?.reviews > 0) {
    n += 1;
    t -= DAY;
  }
  return n;
}

export function history(state, now, days = 30) {
  const out = [];
  const start = dayStart(now);
  for (let i = days - 1; i >= 0; i--) {
    const t = start - i * DAY + MIN;
    out.push({ t, reviews: state.log[dayKey(t)]?.reviews || 0 });
  }
  return out;
}

export function forecast(state, now, days = 7) {
  const out = Array.from({ length: days }, (_, i) => ({ t: dayStart(now) + i * DAY + MIN, due: 0 }));
  const start = dayStart(now);
  for (const id of allIds(state)) {
    const c = state.cards[id];
    if (!c || c.state === "new") continue;
    const i = Math.max(0, Math.floor((c.due - start) / DAY));
    if (i < days) out[i].due += 1;
  }
  return out;
}
