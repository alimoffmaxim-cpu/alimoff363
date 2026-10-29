# Перенос контекста «Электромото Зеленоград» в новую сессию

## Claude Desktop / Claude Code (в том числе выгрузка в Тильду через Claude in Chrome)
1. Открой папку репозитория `alimoff363` (ветка `claude/trusting-turing-vrdq0i`). Если её нет на компьютере: `git clone https://github.com/alimoffmaxim-cpu/alimoff363 && git checkout claude/trusting-turing-vrdq0i`.
2. Всё подхватится само: `CLAUDE.md` в корне и в `gluhov-moto-landing/`, навыки `.claude/skills/moto-*`.
3. Первая фраза для выгрузки:
   > Выгрузи лендинг gluhov-moto-landing в Тильду по навыку moto-tilda-publish и CLAUDE.md. Сначала покажи план, публикуй только после моего «да».
4. Для правок сайта достаточно описать правку и прислать скриншот — навык `moto-landing-edit`.

## Проект claude.ai
1. Создай проект «Электромото Зеленоград».
2. «Инструкции проекта» — вставь текст из `project-instructions.md`.
3. «Знания проекта» — загрузи файлы из архива: `CLAUDE.md`, `decisions-log.md`, все `SKILL.md` (переименованы по навыку), `legal/*.html`, скрипты `tools/*`.
4. Учти: в Проекте claude.ai нет доступа к репозиторию и браузеру — правки кода и выгрузку делай в Claude Code / Claude Desktop, а Проект — для обсуждения, текстов и планирования.

## Что в архиве `moto-handoff.zip`
| Файл | Зачем |
|---|---|
| `project-instructions.md` | Текст для поля «Инструкции проекта» |
| `README.md` | Эта инструкция |
| `CLAUDE.md` | Главный документ: факты, решения, отказы, выгрузка, не доделано |
| `decisions-log.md` | История запросов заказчика 20–29.10 |
| `skills/moto-*.md` | Четыре навыка (в репозитории — `.claude/skills/<имя>/SKILL.md`) |
| `legal/privacy.html`, `legal/consent.html`, `legal/_style.html` | Тексты политики и согласия |
| `tools/*` | Скрипты сборки и проверок |
