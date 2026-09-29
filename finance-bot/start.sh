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

if [ ! -f .env ]; then
    read -rsp "Вставьте токен бота от @BotFather (ввод скрыт) и нажмите Enter: " TOKEN; echo
    if [[ ! "$TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]+$ ]]; then
        echo "Это не похоже на токен (формат 123456:ABC...). Запустите скрипт снова."
        exit 1
    fi
    read -rp "Ваш Telegram ID (цифры, узнать у @userinfobot): " OWNER
    if [[ ! "$OWNER" =~ ^[0-9]+$ ]]; then
        echo "ID должен состоять только из цифр. Запустите скрипт снова."
        exit 1
    fi
    KEY=$(.venv/bin/python -m finbot genkey)
    umask 077
    {
        printf 'BOT_TOKEN=%s\nOWNER_ID=%s\nMASTER_KEY=%s\n' "$TOKEN" "$OWNER" "$KEY"
        grep -vE '^(BOT_TOKEN|OWNER_ID|MASTER_KEY)=' .env.example
    } > .env
    unset TOKEN KEY
    echo "Настройки сохранены в .env (доступен только вам)."
fi

echo "Бот запущен. Напишите ему /start в Telegram. Остановить: Ctrl+C"
exec .venv/bin/python -m finbot
