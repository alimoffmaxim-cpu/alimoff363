#!/usr/bin/env bash
# Сжатие медиа лендинга с утверждёнными параметрами (28.10). Запуск из папки gluhov-moto-landing:
#   bash tools/optimize_media.sh <папка-исходников> 
# В папке-исходников — файлы с теми же именами, что в media/ (hero.mp4, hero-m.mp4, reel-N.mp4, *.jpg, bike-*.png).
# Пишет результат в media/. ПОСЛЕ ЭТОГО: коммит → пуш → новый хеш в CONFIG.MEDIA_BASE (иначе jsDelivr отдаёт старое).
set -euo pipefail
SRC=${1:?папка с исходниками}
enc() { # $1 файл, $2 фильтр масштаба, $3 crf
  ffmpeg -v error -y -i "$SRC/$1" -an -vf "$2,fps=24" -c:v libx264 -preset veryslow -crf "$3" \
    -profile:v main -pix_fmt yuv420p -movflags +faststart -g 48 "media/$1"
  echo "$1: $(( $(stat -c%s "media/$1") / 1024 )) КБ"
}
[ -f "$SRC/hero.mp4" ]   && enc hero.mp4   "scale=960:540" 35   # первый экран, компьютер (под затемнением)
[ -f "$SRC/hero-m.mp4" ] && enc hero-m.mp4 "scale=432:768" 34   # первый экран, телефон
for r in "$SRC"/reel-*.mp4; do [ -f "$r" ] && enc "$(basename "$r")" "scale=360:640" 32; done  # ролики-карточки
python3 - "$SRC" <<'PY'
import sys, os
from PIL import Image
src = sys.argv[1]
for f in sorted(os.listdir(src)):
    p = os.path.join(src, f)
    if f.endswith('.jpg') and not f.startswith(('reel-', 'hero')):   # обложки видео не трогаем
        im = Image.open(p).convert('RGB'); im.thumbnail((1000, 1000), Image.LANCZOS)
        im.save('media/' + f, quality=72, optimize=True, progressive=True); print(f, os.path.getsize('media/' + f) // 1024, 'КБ')
    if f.startswith('bike-') and f.endswith('.png'):                  # рендеры мотоциклов → WebP с прозрачностью
        im = Image.open(p); im.thumbnail((720, 720), Image.LANCZOS); o = 'media/' + f[:-4] + '.webp'
        im.save(o, 'WEBP', quality=82, method=6); print(o, os.path.getsize(o) // 1024, 'КБ')
PY
