#!/bin/bash
# Установка и запуск в одну команду:  bash start.sh
# Токен вводится скрыто и сохраняется только в локальный файл .env (права 600).
set -euo pipefail
cd "$(dirname "$0")"

# Ищем Python 3.11+: сначала в PATH, затем в стандартных местах установщика python.org и Homebrew.
PYTHON=""
for candidate in python3.13 python3.12 python3.11 python3 \
        /Library/Frameworks/Python.framework/Versions/3.1[1-9]/bin/python3 \
        /opt/homebrew/bin/python3 /usr/local/bin/python3; do
    if command -v "$candidate" >/dev/null 2>&1 &&
            "$candidate" -c 'import sys; sys.exit(sys.version_info < (3, 11))' 2>/dev/null; then
        PYTHON="$candidate"
        break
    fi
done
if [ -z "$PYTHON" ]; then
    echo "Нужен Python 3.11 или новее."
    echo "Скачайте установщик: https://www.python.org/downloads/macos/ (кнопка «Download Python 3...»),"
    echo "установите его и снова дважды щёлкните start-bot.command."
    exit 1
fi

if [ -d .venv ] && ! .venv/bin/python -c 'import sys; sys.exit(sys.version_info < (3, 11))' 2>/dev/null; then
    rm -rf .venv  # окружение от старого Python — пересоздаём
fi
if [ ! -d .venv ]; then
    echo "Устанавливаю зависимости (1–2 минуты)..."
    "$PYTHON" -m venv .venv
fi
.venv/bin/pip install -q --disable-pip-version-check --upgrade pip
.venv/bin/pip install -q --disable-pip-version-check --prefer-binary -r requirements.txt

# Сбрасывает нажатия клавиш, сделанные во время установки, чтобы они не попали в ответы.
flush_input() {
    [ -t 0 ] || return 0
    while read -rs -t 1 -n 10000 _discard 2>/dev/null; do :; done
}

if [ ! -f .env ]; then
    echo
    flush_input
    while true; do
        read -rp "Вставьте токен бота от @BotFather (Cmd+V) и нажмите Enter: " RAW
        # Находим токен внутри вставленного текста — можно скопировать хоть всё сообщение BotFather.
        if [[ "$RAW" =~ ([0-9]{5,}:[A-Za-z0-9_-]{30,}) ]]; then
            TOKEN="${BASH_REMATCH[1]}"
            unset RAW
            # Убираем токен с экрана и из прокрутки окна, чтобы он не попал на скриншот.
            [ -t 1 ] && printf '\033[2J\033[3J\033[H'
            echo "Токен принят: ${TOKEN:0:4}…${TOKEN: -4}"
            break
        fi
        echo "Токен не найден (получено символов: ${#RAW}). Скопируйте токен из сообщения @BotFather и вставьте ещё раз."
    done
    while true; do
        read -rp "Ваш Telegram ID (цифры, узнать у @userinfobot): " OWNER
        OWNER="${OWNER//[[:space:]]/}"
        if [[ ! "$OWNER" =~ ^[0-9]+$ ]]; then
            echo "ID должен состоять только из цифр. Попробуйте ещё раз."
        elif [ "$OWNER" = "${TOKEN%%:*}" ]; then
            echo "Это ID самого бота (цифры из токена). Нужен ВАШ ID — его пришлёт @userinfobot."
        else
            break
        fi
    done
    KEY=$(.venv/bin/python -m finbot genkey)
    umask 077
    {
        printf 'BOT_TOKEN=%s\nOWNER_ID=%s\nMASTER_KEY=%s\n' "$TOKEN" "$OWNER" "$KEY"
        grep -vE '^(BOT_TOKEN|OWNER_ID|MASTER_KEY)=' .env.example
    } > .env
    unset TOKEN KEY RAW
    echo "Настройки сохранены в .env (доступен только вам)."
fi

# Исправляем частую ошибку: в OWNER_ID записан ID бота вместо ID владельца.
SAVED_TOKEN=$(grep -E '^BOT_TOKEN=' .env | cut -d= -f2-)
SAVED_OWNER=$(grep -E '^OWNER_ID=' .env | cut -d= -f2-)
if [ -n "$SAVED_TOKEN" ] && [ "$SAVED_OWNER" = "${SAVED_TOKEN%%:*}" ]; then
    echo "В настройках вместо вашего Telegram ID указан ID самого бота."
    flush_input
    while true; do
        read -rp "Введите ВАШ Telegram ID (пришлёт @userinfobot): " OWNER
        OWNER="${OWNER//[[:space:]]/}"
        if [[ "$OWNER" =~ ^[0-9]+$ ]] && [ "$OWNER" != "${SAVED_TOKEN%%:*}" ]; then
            break
        fi
        echo "Нужны только цифры, и это должен быть ваш ID, а не ID бота."
    done
    umask 077
    awk -v id="$OWNER" '/^OWNER_ID=/{print "OWNER_ID=" id; next} {print}' .env > .env.tmp && mv .env.tmp .env
    echo "ID исправлен."
fi
unset SAVED_TOKEN

# Бот считает в батах: переводим «сегодня» со старого значения по умолчанию на время Таиланда.
if grep -qx 'TIMEZONE=Europe/Moscow' .env; then
    umask 077
    awk '/^TIMEZONE=Europe\/Moscow$/{print "TIMEZONE=Asia/Bangkok"; next} {print}' .env > .env.tmp && mv .env.tmp .env
fi

echo "Запускаю бота... Первый запуск может занять 1–3 минуты (подготовка графиков). Остановить: Ctrl+C"
exec .venv/bin/python -m finbot
