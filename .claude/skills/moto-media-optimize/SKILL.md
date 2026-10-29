---
name: moto-media-optimize
description: Добавление, замена и сжатие фото и видео лендинга «Электромото Зеленоград», скорость загрузки страницы. Утверждённые параметры ffmpeg/Pillow, перезакрепление MEDIA_BASE на jsDelivr, проверка ссылок и замер. Использовать, когда меняются файлы в media/ или жалуются на медленную загрузку.
---

# Медиа и скорость

## Как устроено
- Файлы лежат в `gluhov-moto-landing/media/`, сайт берёт их с jsDelivr по **закреплённому коммиту**: `CONFIG.MEDIA_BASE = 'https://cdn.jsdelivr.net/gh/alimoffmaxim-cpu/alimoff363@<хеш>/gluhov-moto-landing/media/'`. Репозиторий должен оставаться публичным.
- Видео первого экрана грузится после `load` (до этого — обложка `hero.jpg`/`hero-m.jpg`), при Save-Data/2G — только обложка. Ролики грузятся, когда видны. Мотоциклы — `loading="lazy"`.
- План на будущее: перенести медиа на CDN Тильды (CLAUDE.md, «Не доделано», п. 1).

## Утверждённые параметры (28.10)
`tools/optimize_media.sh <папка-исходников>`:
| Файл | Размер | Сжатие |
|---|---|---|
| `hero.mp4` (компьютер) | 960×540 | H.264 main, crf 35, 24 fps, без звука, faststart |
| `hero-m.mp4` (телефон) | 432×768 | crf 34 |
| `reel-N.mp4` | 360×640 | crf 32 |
| фото `*.jpg` | ≤1000 px | JPEG q72 progressive |
| `bike-50/65` | 720 px | WebP q82 с прозрачностью |
Исходники заказчика: https://disk.yandex.ru/d/CMeTPXP51OMJKg. Сравнивай кадр «до/после» (ffmpeg `-ss N -frames:v 1`) перед заменой.

## Порядок замены
1. Сжать → положить в `media/` → `git add media && git commit && git push`.
2. `H=$(git rev-parse --short=12 HEAD)` → вписать в `MEDIA_BASE` в `landing.html` (через Python replace) → `make_example.py`, `build_tilda.py`.
3. Проверить, что **каждый** файл из `CONFIG.MEDIA` и `data-media` отвечает 200 по новому хешу:
   `curl -s -o /dev/null -w "%{http_code}" "https://cdn.jsdelivr.net/gh/alimoffmaxim-cpu/alimoff363@$H/gluhov-moto-landing/media/<файл>"`.
4. `node tools/perf.js tilda/preview.html` — сравнить объём «за 6 с» (было ~2,3 МБ → стало ~1 МБ). Учти ограничения из шапки `perf.js` (нет H.264; tilda-grid в песочнице не грузится).
5. Обновить превью (`make_preview.py` → публикация с `files` для изменённых media) и страницу кода; коммит.
6. Записать новые параметры/хеш в CLAUDE.md.
