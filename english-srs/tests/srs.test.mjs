// Запуск: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { schedule, newCard, GRADES, DAY, MIN, dayStart, previewLabel } from "../js/srs.js";
import { buildQueue, nextCard, answer, undo, allIds, streak, forecast } from "../js/study.js";
import { DECKS } from "../data/decks.js";
import { DEFAULT_SETTINGS } from "../js/storage.js";

const NOW = new Date(2026, 9, 10, 12, 0).getTime();
const mid = () => 0.5;
const freshState = () => ({ cards: {}, log: {}, decks: {}, settings: { ...DEFAULT_SETTINGS } });

test("новая карточка проходит шаги обучения и выпускается на 1 день", () => {
  let c = schedule(newCard("x"), GRADES.GOOD, NOW, undefined, mid);
  assert.equal(c.state, "learning");
  assert.equal(c.due, NOW + 10 * MIN);
  c = schedule(c, GRADES.GOOD, NOW + 10 * MIN, undefined, mid);
  assert.equal(c.state, "review");
  assert.equal(c.interval, 1);
  assert.equal(c.due, dayStart(NOW) + DAY);
});

test("«Легко» на новой карточке — сразу 4 дня", () => {
  const c = schedule(newCard("x"), GRADES.EASY, NOW, undefined, mid);
  assert.equal(c.state, "review");
  assert.equal(c.interval, 4);
});

test("интервалы растут по ease, ошибка отправляет на переобучение", () => {
  let c = { ...newCard("x"), state: "review", interval: 10, ease: 2.5 };
  const good = schedule(c, GRADES.GOOD, NOW, undefined, mid);
  assert.equal(good.interval, 25);
  const hard = schedule(c, GRADES.HARD, NOW, undefined, mid);
  assert.equal(hard.interval, 12);
  assert.equal(hard.ease, 2.35);
  const easy = schedule(c, GRADES.EASY, NOW, undefined, mid);
  assert.ok(easy.interval > good.interval);
  const again = schedule(c, GRADES.AGAIN, NOW, undefined, mid);
  assert.equal(again.state, "relearning");
  assert.equal(again.lapses, 1);
  assert.ok(Math.abs(again.ease - 2.3) < 1e-9);
  const back = schedule(again, GRADES.GOOD, NOW + 10 * MIN, undefined, mid);
  assert.equal(back.state, "review");
  assert.equal(back.interval, 1);
});

test("ease не опускается ниже 1.3", () => {
  let c = { ...newCard("x"), state: "review", interval: 5, ease: 1.35 };
  c = schedule(c, GRADES.AGAIN, NOW, undefined, mid);
  assert.equal(c.ease, 1.3);
});

test("подписи на кнопках", () => {
  const c = newCard("x");
  assert.equal(previewLabel(c, GRADES.AGAIN, NOW), "1 мин");
  assert.equal(previewLabel(c, GRADES.HARD, NOW), "6 мин");
  assert.equal(previewLabel(c, GRADES.GOOD, NOW), "10 мин");
  assert.equal(previewLabel(c, GRADES.EASY, NOW), "4 д");
});

test("id карточек уникальны", () => {
  const ids = allIds(freshState());
  assert.equal(new Set(ids).size, ids.length);
  const words = DECKS.reduce((a, d) => a + d.words.length, 0);
  assert.equal(ids.length, words * 2);
  for (const d of DECKS) for (const w of d.words) assert.equal(w.length, 4, w[0]);
});

test("очередь: лимит новых, без двух сторон одного слова в день, отмена", () => {
  const s = freshState();
  s.settings.newPerDay = 3;
  let q = buildQueue(s, NOW);
  assert.equal(q.fresh.length, 3);
  const words = q.fresh.map((id) => id.split("|")[1]);
  assert.equal(new Set(words).size, 3);

  const card = nextCard(q, NOW, () => 0);
  const rec = answer(s, card, GRADES.GOOD, NOW, 5000);
  q = buildQueue(s, NOW);
  assert.equal(q.fresh.length, 2);
  assert.equal(q.learning.length, 1);
  // Сторона RU→EN того же слова сегодня не появляется.
  assert.ok(!q.fresh.some((id) => id.startsWith(card.id.slice(0, card.id.lastIndexOf("|")))));

  undo(s, rec, NOW);
  assert.deepEqual(s.cards, {});
  assert.equal(buildQueue(s, NOW).fresh.length, 3);
});

test("изучаемая карточка возвращается после повторения через 10 минут", () => {
  const s = freshState();
  s.settings.newPerDay = 1;
  const c = nextCard(buildQueue(s, NOW), NOW);
  answer(s, c, GRADES.GOOD, NOW);
  // Опережение до 20 минут — карточку можно показать сразу.
  assert.equal(nextCard(buildQueue(s, NOW), NOW).id, c.id);
});

test("серия дней и прогноз", () => {
  const s = freshState();
  s.settings.newPerDay = 1;
  for (const d of [2, 1, 0]) {
    const t = NOW - d * DAY;
    const c = nextCard(buildQueue(s, t), t) || Object.values(s.cards)[0];
    answer(s, c, GRADES.EASY, t);
  }
  assert.equal(streak(s, NOW), 3);
  assert.equal(streak(s, NOW + DAY), 3);
  assert.equal(streak(s, NOW + 2 * DAY), 0);
  const fc = forecast(s, NOW, 7);
  assert.equal(fc.reduce((a, d) => a + d.due, 0), Object.keys(s.cards).length);
});
