#!/usr/bin/env bash
# Проверка скрипта «Совы» без Google: имитация таблицы → xlsx → пересчёт в LibreOffice → сверка с «Данными».
# Запуск из корня репозитория:  bash sova-report/tools/test/run_checks.sh [имя_сценария ...]
# Сценарии: base (по умолчанию), five (5 направлений), period (свой период на листе), open (даты со «Сводной» + открытие).
# Нужны: node, python3 + openpyxl, LibreOffice Calc (apt-get install -y libreoffice-calc-nogui; pip install openpyxl).
set -euo pipefail
cd "$(dirname "$0")"
OUT="${TMPDIR:-/tmp}/sova-checks"; mkdir -p "$OUT"
for f in 1_main 2_settings 3_api 4_sync 5_debug 6_connect 7_build 8_build_blocks 9_build_periods 10_build_sheets 11_days 12_volgograd; do
  cat "../../$f.gs"; echo
done > "$OUT/all.js"
node --check "$OUT/all.js"

run() {   # имя, переменные окружения…
  local name=$1; shift
  echo "=== $name"
  env SEMI=1 TWICE=1 "$@" node mock.js "$OUT/all.js" "$OUT/$name.json" 2>&1 | grep -iE 'ошибка|error' || true
  python3 toxlsx.py "$OUT/$name.json" "$OUT/$name.xlsx"
  rm -rf "$OUT/calc"; timeout 300 soffice --headless --convert-to xlsx --outdir "$OUT/calc" "$OUT/$name.xlsx" >/dev/null 2>&1
  python3 verify.py "$OUT/calc/$name.xlsx"
}
for s in "${@:-base}"; do
  case $s in
    base)     run base ;;
    five)     run five FIVE=1 ;;
    period)   run period EDIT="Направление 2|2026-10-05" EDITJ="Направление 2|2026-10-20" ;;
    open)     run open EDIT="Сводная|2026-10-05" EDITJ="Сводная|2026-10-20" OPEN=1 ;;
    *) echo "неизвестный сценарий: $s"; exit 2 ;;
  esac
done
