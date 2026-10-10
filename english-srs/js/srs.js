// Интервальные повторения по алгоритму SM-2 в варианте Anki:
// new → learning (шаги в минутах) → review (дни) → при ошибке relearning.

export const MIN = 60 * 1000;
export const DAY = 24 * 60 * MIN;
// Как в Anki, новый день начинается в 4:00 по местному времени.
const ROLLOVER_HOURS = 4;

export const GRADES = { AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 };

export const DEFAULT_SCHED = {
  learningSteps: [1, 10],   // минуты
  relearningSteps: [10],    // минуты
  graduatingInterval: 1,    // дни
  easyInterval: 4,          // дни
  startingEase: 2.5,
  minEase: 1.3,
  easyBonus: 1.3,
  hardInterval: 1.2,
  maxInterval: 36500,
};

// Начало «учебного дня» (с учётом сдвига на 4:00), в мс.
export function dayStart(now) {
  const d = new Date(now - ROLLOVER_HOURS * 60 * MIN);
  d.setHours(0, 0, 0, 0);
  return d.getTime() + ROLLOVER_HOURS * 60 * MIN;
}

// Ключ дня вида 2026-10-10 для журнала статистики.
export function dayKey(now) {
  const d = new Date(dayStart(now));
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function newCard(id) {
  return { id, state: "new", due: 0, interval: 0, ease: 0, step: 0, reps: 0, lapses: 0 };
}

function fuzz(ivl, rnd) {
  if (ivl < 3) return ivl;
  const spread = Math.max(1, Math.round(ivl * 0.05));
  return ivl + Math.round((rnd() * 2 - 1) * spread);
}

function clampIvl(ivl, s) {
  return Math.min(s.maxInterval, Math.max(1, Math.round(ivl)));
}

// Возвращает новое состояние карточки после ответа. Исходный объект не меняется.
export function schedule(card, grade, now, s = DEFAULT_SCHED, rnd = Math.random) {
  const c = { ...card, reps: card.reps + 1 };
  const toReview = (ivl) => {
    c.state = "review";
    c.interval = clampIvl(ivl, s);
    c.step = 0;
    c.due = dayStart(now) + c.interval * DAY;
    return c;
  };

  if (c.state === "new" || c.state === "learning") {
    const steps = s.learningSteps;
    if (c.state === "new") {
      c.state = "learning";
      c.step = 0;
      c.ease = s.startingEase;
    }
    if (grade === GRADES.EASY) return toReview(s.easyInterval);
    if (grade === GRADES.AGAIN) {
      c.step = 0;
      c.due = now + steps[0] * MIN;
      return c;
    }
    if (grade === GRADES.HARD) {
      const delay = c.step === 0 && steps.length > 1 ? (steps[0] + steps[1]) / 2 : steps[c.step];
      c.due = now + delay * MIN;
      return c;
    }
    // GOOD
    c.step += 1;
    if (c.step >= steps.length) return toReview(s.graduatingInterval);
    c.due = now + steps[c.step] * MIN;
    return c;
  }

  if (c.state === "relearning") {
    const steps = s.relearningSteps;
    if (grade === GRADES.AGAIN) {
      c.step = 0;
      c.due = now + steps[0] * MIN;
      return c;
    }
    if (grade === GRADES.HARD) {
      c.due = now + steps[c.step] * MIN;
      return c;
    }
    if (grade === GRADES.EASY) return toReview(c.interval + 1);
    c.step += 1;
    if (c.step >= steps.length) return toReview(c.interval);
    c.due = now + steps[c.step] * MIN;
    return c;
  }

  // review
  const ivl = c.interval;
  if (grade === GRADES.AGAIN) {
    c.lapses += 1;
    c.ease = Math.max(s.minEase, c.ease - 0.2);
    c.state = "relearning";
    c.step = 0;
    c.interval = 1;
    c.due = now + s.relearningSteps[0] * MIN;
    return c;
  }
  if (grade === GRADES.HARD) {
    c.ease = Math.max(s.minEase, c.ease - 0.15);
    return toReview(fuzz(Math.max(ivl + 1, ivl * s.hardInterval), rnd));
  }
  const good = Math.max(ivl + 1, ivl * c.ease);
  if (grade === GRADES.GOOD) return toReview(fuzz(good, rnd));
  c.ease += 0.15;
  return toReview(fuzz(Math.max(good + 1, ivl * c.ease * s.easyBonus), rnd));
}

// Подпись над кнопкой: через сколько карточка вернётся.
export function previewLabel(card, grade, now, s = DEFAULT_SCHED) {
  const next = schedule(card, grade, now, s, () => 0.5);
  if (next.state === "review") return formatDays(next.interval);
  return formatMinutes(Math.round((next.due - now) / MIN));
}

export function formatMinutes(m) {
  if (m < 60) return `${Math.max(1, m)} мин`;
  return `${Math.round(m / 60)} ч`;
}

export function formatDays(d) {
  if (d < 30) return `${d} д`;
  if (d < 365) return `${(d / 30).toFixed(d < 300 ? 1 : 0).replace(".0", "")} мес`;
  return `${(d / 365).toFixed(1).replace(".0", "")} г`;
}
