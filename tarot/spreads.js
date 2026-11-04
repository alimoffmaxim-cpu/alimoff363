// Spread catalogue. The page builds the menu, the table and the readings from these descriptions,
// so a new spread is added here without touching the app.
//
// Fields:
//   id        address of the spread page (#id) and its key for access rights
//   type      "day" — one card turned over on its own screen; "spread" — cards dealt onto a table
//   access    "free" or "paid"; see access.js
//   menu      [count label, title, one-line description] for the choice screen
//   title, lead   heading and intro on the spread page
//   positions [{name, what, when, read: [light, mixed, heavy]}] — one per card, in dealing order;
//             `read` is the comment for a light, mixed or heavy card in that position
//   layout(u) card centres in card widths: u = {w: 1, h, g}; returns {width, height, deck: [x, y], slots: [[x, y, rotation]]}
//   overlaps  pairs of positions that lie on top of each other (the first tap raises the lower card)
//   reader    key of the reading in the page (READERS); omit for the general reading only

window.LAYOUTS = {
  // Cards side by side in one row, deck above them
  row(n) {
    return u => {
      const width = n * u.w + (n - 1) * u.g;
      const y = u.h * 1.5 + u.g;
      return {
        width, height: u.h * 2 + u.g, deck: [u.w / 2, u.h / 2],
        slots: Array.from({ length: n }, (_, i) => [u.w / 2 + i * (u.w + u.g), y, 0])
      };
    };
  }
};

window.SPREADS = [
  {
    id: "day",
    type: "day",
    access: "free",
    menu: ["1 карта", "Карта дня", "Одна карта — настроение и совет на сегодня."]
  },
  {
    id: "celtic-cross",
    type: "spread",
    access: "free",
    menu: ["10 карт", "Полный расклад", "Кельтский крест: ситуация, препятствия, прошлое, будущее и итог."],
    title: "Кельтский крест",
    lead: "Самый известный полный расклад: 10 карт показывают ситуацию целиком. Задай вопрос, если хочешь, и разложи карты.",
    reader: "celtic",
    overlaps: [[0, 1]],
    positions: [
      { name: "Ситуация", what: "Суть вопроса, то, что происходит сейчас", when: "Время: сейчас",
        read: ["Ситуация в целом складывается в твою пользу.", "Ситуация пока неоднозначна и может повернуть в любую сторону.", "Сейчас ситуация непростая, и это стоит честно признать."] },
      { name: "Препятствие", what: "Что мешает или усложняет ситуацию", when: "Время: сейчас",
        read: ["Препятствие мягкое: мешает не беда, а то, что может отвлечь или расслабить.", "Мешает неопределённость: ясности пока не хватает.", "Это главная трудность, с которой предстоит справиться."] },
      { name: "Основа", what: "Глубинная причина, корни ситуации", when: "Время: давнее прошлое, корни",
        read: ["В основе ситуации хороший фундамент, на него можно опереться.", "Причины глубже, чем кажется: стоит в них разобраться.", "Корень проблемы здесь: пока он не проработан, ситуация будет повторяться."] },
      { name: "Прошлое", what: "Что уходит и уже влияет на тебя", when: "Время: недавнее прошлое",
        read: ["Недавнее прошлое дало тебе силы, которые ещё работают.", "Недавний этап завершается, его влияние слабеет.", "Недавние события оставили след, но эта полоса уже уходит."] },
      { name: "Цель", what: "К чему ты стремишься, лучший возможный исход", when: "О чём: твоя цель и лучший исход",
        read: ["Лучший сценарий светлый, к нему стоит стремиться.", "Цель пока размыта: стоит точнее понять, чего ты хочешь.", "Осторожнее с ожиданиями: желаемое может принести не только радость."] },
      { name: "Ближайшее будущее", what: "Что произойдёт в ближайшее время", when: "Время: ближайшие недели",
        read: ["В ближайшее время жди хороших перемен.", "Ближайшее время переходное: многое зависит от твоих решений.", "В ближайшие недели возможны трудности, к ним лучше подготовиться заранее."] },
      { name: "Ты сам", what: "Твоё отношение и роль в ситуации", when: "О чём: ты сам",
        read: ["Ты в хорошей форме и можешь влиять на ситуацию.", "Ты в поиске, и ясной позиции пока нет.", "Мешать может твоё собственное состояние, стоит позаботиться о себе."] },
      { name: "Окружение", what: "Люди и обстоятельства вокруг", when: "О чём: люди и обстоятельства вокруг",
        read: ["Окружение на твоей стороне, не бойся просить поддержки.", "Окружение нейтрально: многое зависит от того, как ты выстроишь отношения.", "Присмотрись к людям и обстоятельствам вокруг: не всё работает на тебя."] },
      { name: "Надежды и страхи", what: "Чего ты ждёшь и чего опасаешься", when: "О чём: твои надежды и страхи",
        read: ["Твои надежды светлые, и они дают силы.", "В тебе смешаны надежда и тревога, это нормально.", "Именно это тебя тревожит. Часто страх сильнее реальной угрозы."] },
      { name: "Итог", what: "К чему всё придёт", when: "Время: итог, ближайшие месяцы",
        read: ["Итог благоприятный: ситуация разрешится хорошо.", "Итог открыт: многое решат твои шаги.", "Итог пока тяжёлый, но расклад показывает тенденцию, а не приговор."] }
    ],
    // The cross on the left (card 2 lies across card 1), the staff of four on the right, deck in the free top-left corner
    layout(u) {
      const width = 5.882;
      const height = 4 * u.h + 3 * u.g;
      const dx = u.h / 2 + u.w / 2 + u.g;    // neighbours keep clear of the long side of the crossing card
      const cx = dx + u.w / 2, cy = height / 2, sx = width - u.w / 2;
      return {
        width, height, deck: [u.w / 2, u.h / 2],
        slots: [
          [cx, cy, 0], [cx, cy, 90], [cx, cy + u.h + u.g, 0], [cx - dx, cy, 0], [cx, cy - u.h - u.g, 0], [cx + dx, cy, 0],
          [sx, height - u.h / 2, 0], [sx, height - u.h * 1.5 - u.g, 0], [sx, u.h * 1.5 + u.g, 0], [sx, u.h / 2, 0]
        ]
      };
    }
  }
];
