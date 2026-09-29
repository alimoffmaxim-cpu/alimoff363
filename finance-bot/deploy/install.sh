#!/bin/bash
# Установка и обновление бота на сервере (Ubuntu 24.04 / Debian 12) одной командой:
#
#   curl -fsSL https://raw.githubusercontent.com/alimoffmaxim-cpu/alimoff363/claude/keen-hawking-q34ozn/finance-bot/deploy/install.sh | sudo bash
#
# Повторный запуск той же команды обновляет код и перезапускает бота; .env и данные сохраняются.
# Токен вводится только здесь и сохраняется только в /opt/finbot/.env (права 600, владелец — служебный пользователь).
set -euo pipefail

REPO="alimoffmaxim-cpu/alimoff363"
BRANCH="${FINBOT_BRANCH:-claude/keen-hawking-q34ozn}"
APP="${FINBOT_APP:-/opt/finbot}"
SRC_DIR="${FINBOT_SRC:-}"          # для проверки: локальная папка finance-bot вместо скачивания
TTY="${FINBOT_TTY:-/dev/tty}"      # ввод с клавиатуры, даже когда скрипт пришёл через «curl | bash»
export PYTHONDONTWRITEBYTECODE=1

step() { printf '\n\033[1m%s\033[0m\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
    echo "Запустите с sudo:  curl -fsSL …/install.sh | sudo bash"
    exit 1
fi

step "1/5 Устанавливаю системные пакеты..."
if [ -z "${FINBOT_SKIP_APT:-}" ]; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq python3 python3-venv curl ca-certificates tar >/dev/null
fi
if ! python3 -c 'import sys; sys.exit(sys.version_info < (3, 11))'; then
    echo "Нужен Python 3.11 или новее. Создайте сервер на Ubuntu 24.04 LTS или Debian 12."
    exit 1
fi

step "2/5 Скачиваю бота..."
id finbot >/dev/null 2>&1 || useradd --system --home-dir "$APP" --shell /usr/sbin/nologin finbot
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
if [ -n "$SRC_DIR" ]; then
    cp -r "$SRC_DIR" "$TMP/finance-bot"
else
    curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/$BRANCH" | tar -xz -C "$TMP"
    mv "$TMP"/*/finance-bot "$TMP/finance-bot"
fi
install -d -m 755 -o root -g root "$APP"
# Код принадлежит root и доступен боту только на чтение — бот не может изменить сам себя.
rm -rf "$APP/finbot" "$APP/deploy"
cp -r "$TMP/finance-bot/finbot" "$TMP/finance-bot/deploy" "$APP/"
cp "$TMP/finance-bot/requirements.txt" "$TMP/finance-bot/.env.example" "$APP/"
chown -R root:root "$APP/finbot" "$APP/deploy" "$APP/requirements.txt" "$APP/.env.example"
chmod -R u=rwX,go=rX "$APP/finbot" "$APP/deploy" "$APP/requirements.txt" "$APP/.env.example"
install -d -m 700 -o finbot -g finbot "$APP/data"

step "3/5 Устанавливаю зависимости (1–3 минуты)..."
[ -x "$APP/.venv/bin/python" ] || python3 -m venv "$APP/.venv"
"$APP/.venv/bin/pip" install -q --disable-pip-version-check --upgrade pip
"$APP/.venv/bin/pip" install -q --disable-pip-version-check --prefer-binary -r "$APP/requirements.txt"

step "4/5 Настройки..."
ENV_FILE="$APP/.env"
if [ ! -f "$ENV_FILE" ]; then
    while true; do
        read -rp "Вставьте токен бота от @BotFather и нажмите Enter: " RAW < "$TTY"
        if [[ "$RAW" =~ ([0-9]{5,}:[A-Za-z0-9_-]{30,}) ]]; then
            TOKEN="${BASH_REMATCH[1]}"
            unset RAW
            [ -t 1 ] && printf '\033[2J\033[3J\033[H'   # убираем токен с экрана
            echo "Токен принят: ${TOKEN:0:4}…${TOKEN: -4}"
            break
        fi
        echo "Токен не найден (получено символов: ${#RAW}). Скопируйте его из сообщения @BotFather ещё раз."
    done
    while true; do
        read -rp "Ваш Telegram ID (цифры, пришлёт @userinfobot): " OWNER < "$TTY"
        OWNER="${OWNER//[[:space:]]/}"
        if [[ ! "$OWNER" =~ ^[0-9]+$ ]]; then
            echo "ID должен состоять только из цифр."
        elif [ "$OWNER" = "${TOKEN%%:*}" ]; then
            echo "Это ID самого бота (цифры из токена). Нужен ВАШ ID от @userinfobot."
        else
            break
        fi
    done
    KEY=$(cd "$APP" && .venv/bin/python -m finbot genkey)
    (
        umask 077
        {
            printf 'BOT_TOKEN=%s\nOWNER_ID=%s\nMASTER_KEY=%s\n' "$TOKEN" "$OWNER" "$KEY"
            grep -vE '^(BOT_TOKEN|OWNER_ID|MASTER_KEY)=' "$APP/.env.example"
        } > "$ENV_FILE"
    )
    unset TOKEN KEY
    echo "Настройки сохранены в $ENV_FILE."
    echo "Сохраните резервную копию MASTER_KEY (менеджер паролей): без него данные не расшифровать."
    echo "Показать ключ:  sudo grep MASTER_KEY $ENV_FILE"
else
    echo "Настройки уже есть — оставляю как есть."
    grep -q '^WEBAPP_URL=' "$ENV_FILE" || grep '^WEBAPP_URL=' "$APP/.env.example" >> "$ENV_FILE"
fi
chown finbot:finbot "$ENV_FILE"
chmod 600 "$ENV_FILE"

step "5/5 Запускаю бота как службу..."
install -m 644 -o root -g root "$APP/deploy/finbot.service" /etc/systemd/system/finbot.service
if [ -n "${FINBOT_SKIP_SYSTEMD:-}" ]; then
    echo "(проверочный режим: запуск службы пропущен)"
    exit 0
fi
SINCE=$(date '+%Y-%m-%d %H:%M:%S')
systemctl daemon-reload
systemctl enable finbot >/dev/null 2>&1
systemctl restart finbot

for _ in $(seq 1 60); do
    if journalctl -u finbot --since "$SINCE" --no-pager -o cat 2>/dev/null | grep -q "подключён к Telegram"; then
        journalctl -u finbot --since "$SINCE" --no-pager -o cat | grep -A1 "подключён к Telegram"
        cat <<'DONE'

🎉 Готово! Бот работает круглосуточно и сам запускается после перезагрузки сервера.
   Если бот ещё запущен на Mac — остановите его там (Ctrl+C): два запуска одного бота мешают друг другу.

   Обновить бота:     та же команда установки
   Посмотреть журнал: sudo journalctl -u finbot -f
   Остановить:        sudo systemctl stop finbot
DONE
        exit 0
    fi
    sleep 2
done

echo "⚠️ Бот не сообщил о запуске за 2 минуты. Последние строки журнала:"
journalctl -u finbot --since "$SINCE" --no-pager -o cat | tail -n 25
exit 1
