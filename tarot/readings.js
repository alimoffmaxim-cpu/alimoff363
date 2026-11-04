// Readings for particular spreads; spreads.js points to them by `reader`.
// Each reader has summary() -> {title, paragraphs} and may have detail() -> [[section title, text], ...].
// They run in the page and use its helpers: spread, tone, cardName, says, lc, suitOf, generalSummary, $.

const SUIT_ADVICE = {
  wands: "Действуй, а не жди: сейчас решают инициатива и энергия. Только не распыляйся на всё сразу.",
  cups: "Прислушайся к чувствам, своим и чужим: ответ лежит скорее в сердце, чем в расчётах.",
  swords: "Сначала проясни мысли и поговори открыто: недосказанность сейчас мешает больше всего.",
  pents: "Опирайся на практические шаги: посчитай ресурсы, составь план и двигайся по нему спокойно.",
  maj: "Доверься ходу событий: часть вещей сейчас решается не тобой, и это нормально."
};
const quoted = i => "«" + spread[i].card[1] + "»";
const tones = () => spread.map(tone);
const sum = (t, idx) => idx.reduce((a, i) => a + t[i], 0);
const question = () => $("question").value.trim();
function leadingSuit() {
  const counts = {};
  spread.forEach(d => { const k = suitOf(d.card); counts[k] = (counts[k] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

// Answer to the question (or the overall picture when none was asked) from the outcome card and the overall tone
function answerSection(outcome, score) {
  const q = question();
  let a;
  if (q) {
    if (outcome > 0 && score >= 0) a = "Ответ скорее «да». Расклад показывает благополучный исход, и путь к нему " + (score >= 3 ? "будет довольно лёгким." : "потребует усилий.");
    else if (outcome > 0) a = "Ответ скорее «да, но не сразу». Итог хороший, однако по дороге придётся пройти через трудности.";
    else if (outcome === 0) a = "Однозначного ответа карты не дают. Исход открыт и во многом зависит от твоих решений.";
    else if (score > 0) a = "Ответ скорее «не так, как ты ждёшь». Поддержка у тебя есть, но итог пока складывается не в твою пользу, и его ещё можно изменить.";
    else a = "Сейчас ответ скорее «нет». Карты предупреждают о трудностях. Это повод пересмотреть подход, а не опускать руки.";
    return ["Ответ на твой вопрос", "«" + q + "» — " + lc(a)];
  }
  if (outcome > 0 && score >= 0) a = "Картина в целом светлая: ситуация идёт к хорошему исходу, и путь к нему " + (score >= 3 ? "будет довольно лёгким." : "потребует усилий.");
  else if (outcome > 0) a = "Итог хороший, но путь к нему лежит через трудности.";
  else if (outcome === 0) a = "Ситуация открыта: многое решится в ближайшее время и зависит от тебя.";
  else if (score > 0) a = "Поддержка у тебя есть, но итог пока складывается не в твою пользу, и его ещё можно изменить.";
  else a = "Карты предупреждают о трудном периоде. Это повод пересмотреть подход, а не опускать руки.";
  return ["Общая картина", a];
}
const trend = (from, to, a, b) => to > from ? "Дальше ситуация улучшается: после " + quoted(a) + " приходит " + quoted(b) + "."
  : to < from ? "Дальше становится сложнее: после " + quoted(a) + " приходит " + quoted(b) + ", так что не стоит расслабляться."
  : "Ситуация развивается ровно: " + quoted(a) + ", затем " + quoted(b) + ".";

window.READERS = {
  // Yes or no: three cards, upright votes for, reversed against
  yesNo: {
    summary() {
      const yes = spread.filter(d => !d.reversed).length;
      const title = ["Нет", "Скорее нет", "Скорее да", "Да"][yes];
      const q = question();
      const out = [(q ? "«" + q + "» — " : "") + ["все три карты против.", "две карты из трёх против.", "две карты из трёх за.", "все три карты за."][yes]];
      const heavy = spread.map((d, i) => i).filter(i => tone(spread[i]) < 0);
      if (yes >= 2 && heavy.length) out.push("Но " + heavy.map(quoted).join(" и ") + " " + (heavy.length > 1 ? "предупреждают" : "предупреждает") + ": на пути к цели будут трудности.");
      if (yes <= 1 && spread.some(d => !d.reversed && tone(d) > 0)) out.push("Шанс всё же есть: " + spread.map((d, i) => i).filter(i => !spread[i].reversed && tone(spread[i]) > 0).map(quoted).join(" и ") + " поддерживает тебя.");
      out.push("Совет: " + lc(SUIT_ADVICE[leadingSuit()]));
      return { title, paragraphs: out };
    }
  },

  // Past, present, future
  three: {
    summary() {
      const t = tones();
      const { title, verdict } = generalSummary();
      return { title, paragraphs: [verdict, trend(t[1], t[2], 1, 2), "Совет: " + lc(SUIT_ADVICE[leadingSuit()])] };
    },
    detail() {
      const t = tones();
      return [
        answerSection(t[2], sum(t, [0, 1, 2])),
        ["Прошлое", "Ситуацию принесла " + says(0) + " " + (t[0] < 0 ? "Отсюда тянутся нынешние сложности." : t[0] > 0 ? "Это хорошая опора." : "Этот этап уже уходит.")],
        ["Настоящее", "Сейчас — " + says(1)],
        ["Будущее", "Впереди — " + says(2) + " " + trend(t[1], t[2], 1, 2)]
      ];
    }
  },

  // Do it or not: path A (cards 2–4) against path B (cards 5–7); the outcome of each path counts double
  twoPaths: {
    summary() {
      const t = tones();
      const a = t[1] + t[2] + 2 * t[3], b = t[4] + t[5] + 2 * t[6];
      const title = a > b + 1 ? "Карты скорее за то, чтобы сделать" : b > a + 1 ? "Карты скорее за то, чтобы не делать" : "Оба пути примерно равны";
      const out = [a > b + 1 ? "Путь «сделать» выглядит светлее: польза и итог перевешивают риски."
        : b > a + 1 ? "Путь «оставить как есть» выглядит спокойнее и надёжнее. Возможно, сейчас не время для этого шага."
        : "Ни один путь не выигрывает явно. Решение стоит принимать по тому, что для тебя важнее."];
      out.push("Итог, если сделать, — " + quoted(3) + ". Итог, если не делать, — " + quoted(6) + ".");
      out.push("Совет — " + quoted(7) + ": " + lc(spread[7].reversed ? spread[7].card[3] : spread[7].card[2]));
      return { title, paragraphs: out };
    },
    detail() {
      const t = tones();
      const path = (i, label) => label + " Что получишь: " + says(i) + " Чем рискуешь: " + says(i + 1) + " К чему придёшь: " + says(i + 2) + " " +
        (t[i + 2] > 0 ? "Этот путь ведёт к хорошему." : t[i + 2] < 0 ? "Этот путь ведёт к трудностям." : "Итог этого пути открыт.");
      return [
        ["Суть выбора", "В центре выбора — " + says(0)],
        ["Если сделать", path(1, "Если сделать этот шаг.")],
        ["Если не делать", path(4, "Если оставить всё как есть.")],
        ["Совет", "Карта совета — " + says(7) + " " + SUIT_ADVICE[leadingSuit()]]
      ];
    }
  },

  // Relationship: you (0), what connects (1), the other person (2), past (3), what divides (4), near future (5), outcome (6)
  relationship: {
    summary() {
      const t = tones();
      const { title, verdict } = generalSummary();
      const out = [verdict];
      out.push(t[1] > t[4] ? "То, что вас связывает (" + quoted(1) + "), сильнее того, что разделяет (" + quoted(4) + ")."
        : t[1] < t[4] ? "Разногласия (" + quoted(4) + ") сейчас заметнее того, что вас связывает (" + quoted(1) + ")."
        : "Связь и разногласия уравновешены: многое зависит от того, как вы будете разговаривать.");
      out.push(t[0] > 0 && t[2] > 0 ? "Вы оба настроены друг к другу хорошо."
        : t[0] !== t[2] ? "Вы сейчас относитесь к отношениям по-разному: " + quoted(0) + " у тебя и " + quoted(2) + " у другого человека."
        : "Обоим сейчас непросто в этих отношениях.");
      out.push(trend(t[5], t[6], 5, 6));
      return { title, paragraphs: out };
    },
    detail() {
      const t = tones();
      return [
        answerSection(t[6], t.reduce((a, b) => a + b, 0)),
        ["Вы двое", "Ты в этих отношениях — " + says(0) + " Другой человек — " + says(2)],
        ["Что связывает и что разделяет", "Вас связывает " + says(1) + " Разделяет " + says(4) + " " +
          (t[4] < 0 ? "Об этом стоит поговорить открыто, пока разногласие не стало привычкой." : "Серьёзных преград между вами нет.")],
        ["Прошлое пары", "На отношения повлияла " + says(3) + " " + (t[3] < 0 ? "Старые обиды стоит отпустить, чтобы двигаться дальше." : "")],
        ["Будущее", "В ближайшее время — " + says(5) + " В итоге — " + says(6)],
        ["Совет", SUIT_ADVICE[leadingSuit()]]
      ];
    }
  },

  // Celtic Cross, the tarot reader's 12-card version
  celtic: {
    summary() {
      const t = tones();
      const { title, verdict, notes } = generalSummary();
      const out = [verdict];
      out.push(t[1] > t[2] ? "Сил, которые помогают (" + quoted(1) + "), больше, чем помех (" + quoted(2) + ")."
        : t[1] < t[2] ? "Помехи (" + quoted(2) + ") сейчас сильнее поддержки (" + quoted(1) + "), поэтому важно беречь силы."
        : "Поддержка (" + quoted(1) + ") и помехи (" + quoted(2) + ") уравновешены.");
      if (t[3] * t[4] < 0) out.push("Мысли и подсознание тянут в разные стороны: умом ты хочешь одного, а глубинные установки ведут к другому.");
      else if (t[3] < 0 && t[4] < 0) out.push("И мысли, и подсознание сейчас настроены тревожно: начни с того, чтобы разобраться в себе.");
      else if (t[3] > 0 && t[4] > 0) out.push("Мысли и подсознание заодно, и это сильная позиция.");
      out.push("Три месяца: " + quoted(9) + ", затем " + quoted(10) + ", затем " + quoted(11) + ". " +
        (t[11] > t[9] ? "К концу срока ситуация улучшится." : t[11] < t[9] ? "К концу срока станет сложнее, лучше подготовиться заранее." : "Ситуация будет развиваться ровно."));
      out.push(...notes);
      return { title, paragraphs: out };
    },
    detail() {
      const t = tones();
      const score = t.reduce((a, b) => a + b, 0);
      const sections = [answerSection(t[11], score)];
      sections.push(["Ситуация", "Суть ситуации — " + says(0)]);
      sections.push(["Что помогает и что мешает", "Помогает " + says(1) + " Мешает " + says(2) + " " +
        (t[2] < 0 && t[1] > 0 ? "Опирайся на то, что помогает: этого хватит, чтобы справиться с помехой."
          : t[2] < 0 ? "С этой помехой придётся поработать в первую очередь." : "Серьёзных преград нет.")]);
      sections.push(["Мысли и подсознание", "В мыслях — " + says(3) + " В подсознании — " + says(4) + " " +
        (t[4] < 0 ? "Именно эта скрытая установка может не давать двигаться дальше. Стоит её заметить и спросить себя, откуда она." : "")]);
      sections.push(["Прошлое и ближайшие дни", "Ситуацию спровоцировала " + says(5) + " В ближайшие дни — " + says(6)]);
      sections.push(["Взгляд со стороны и страхи", "Со стороны ситуацию видят так: " + says(7) + " Твой страх здесь — " + says(8) + " " +
        (t[8] < 0 ? (t[11] >= 0 ? "Итог расклада этот страх не подтверждает." : "Отнесись к нему как к предупреждению, а не как к приговору.") : "")]);
      sections.push(["Три месяца", "Первый месяц — " + says(9) + " Второй — " + says(10) + " Третий — " + says(11)]);
      sections.push(["Совет", SUIT_ADVICE[leadingSuit()] + " " + (t[2] < 0 ? "Главное, над чем стоит поработать, — " + quoted(2) + ". " : "") +
        (t[11] >= 0 ? "Итог на твоей стороне, если ты продолжишь в том же направлении." : "Расклад показывает тенденцию, и её можно изменить своими решениями.")]);
      return sections;
    }
  }
};
