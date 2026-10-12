#!/usr/bin/env bash
# Семейный VPN: Xray (VLESS + XTLS-Vision + Reality) для клиентов вроде Happ.
#
#   bash vpn.sh install мама папа я   — поставить сервер и создать пользователей
#   vpn add <имя>                     — добавить человека
#   vpn remove <имя>                  — удалить человека
#   vpn list                          — список людей
#   vpn show <имя>                    — снова показать ссылку и QR-код
#   vpn sni <сайт>                    — сменить сайт для маскировки
#   vpn update                        — обновить Xray
#   vpn status | restart              — состояние / перезапуск
#
# После install скрипт копируется в /usr/local/bin/vpn.

set -euo pipefail

XRAY_DIR="${XRAY_DIR:-/usr/local/etc/xray}"
CONFIG="$XRAY_DIR/config.json"
STATE="$XRAY_DIR/family.env"
CLIENTS_DIR="${CLIENTS_DIR:-/root/vpn-clients}"
XRAY_BIN="${XRAY_BIN:-/usr/local/bin/xray}"
SKIP_SYSTEM="${SKIP_SYSTEM:-0}"   # 1 = не трогать apt/systemd/ufw (для тестов)

DEFAULT_SNI="www.microsoft.com"
DEFAULT_PORT=443

say()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mОшибка:\033[0m %s\n' "$*" >&2; exit 1; }

need_root() { [[ $SKIP_SYSTEM == 1 || $EUID -eq 0 ]] || die "запустите от root (sudo -i)"; }

load_state() {
  [[ -f $STATE ]] || die "VPN ещё не установлен — сначала: bash vpn.sh install <имена>"
  # shellcheck disable=SC1090
  source "$STATE"
}

save_state() {
  umask 077
  cat >"$STATE" <<EOF
SERVER_IP='$SERVER_IP'
PORT='$PORT'
SNI='$SNI'
PRIVATE_KEY='$PRIVATE_KEY'
PUBLIC_KEY='$PUBLIC_KEY'
SHORT_ID='$SHORT_ID'
EOF
}

restart_xray() {
  "$XRAY_BIN" run -test -c "$CONFIG" >/dev/null || die "конфиг Xray не прошёл проверку"
  [[ $SKIP_SYSTEM == 1 ]] && return
  systemctl restart xray
  sleep 1
  systemctl is-active --quiet xray || die "Xray не запустился, смотрите: journalctl -u xray -n 50"
}

# Записывает config.json из state и списка клиентов (JSON-массив).
write_config() {
  local clients_json=$1 tmp
  tmp=$(mktemp)
  jq -n \
    --argjson clients "$clients_json" \
    --argjson port "$PORT" \
    --arg sni "$SNI" \
    --arg priv "$PRIVATE_KEY" \
    --arg sid "$SHORT_ID" '
  {
    log: { loglevel: "warning" },
    inbounds: [{
      tag: "vless-reality",
      listen: "0.0.0.0",
      port: $port,
      protocol: "vless",
      settings: { clients: $clients, decryption: "none" },
      streamSettings: {
        network: "tcp",
        security: "reality",
        realitySettings: {
          show: false,
          dest: ($sni + ":443"),
          xver: 0,
          serverNames: [$sni],
          privateKey: $priv,
          shortIds: [$sid]
        }
      },
      sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], routeOnly: true }
    }],
    outbounds: [
      { tag: "direct", protocol: "freedom" },
      { tag: "block",  protocol: "blackhole" }
    ],
    routing: {
      domainStrategy: "IPIfNonMatch",
      rules: [
        { type: "field", ip: ["geoip:private"], outboundTag: "block" },
        { type: "field", protocol: ["bittorrent"], outboundTag: "block" }
      ]
    }
  }' >"$tmp"
  install -m 600 "$tmp" "$CONFIG"
  rm -f "$tmp"
  # Сервис Xray работает от nobody — ему нужно право читать конфиг.
  [[ $SKIP_SYSTEM == 1 ]] || chown nobody:nogroup "$CONFIG" 2>/dev/null || chmod 644 "$CONFIG"
}

clients_json() { jq -c '.inbounds[0].settings.clients' "$CONFIG"; }

valid_name() {
  [[ -n $1 && ${#1} -le 32 && $1 != *[[:space:]/\'\"\\]* ]] \
    || die "некорректное имя «$1»: без пробелов, кавычек и слэшей, до 32 символов"
}

client_link() {
  local name=$1 uuid enc
  uuid=$(jq -r --arg n "$name" '.inbounds[0].settings.clients[] | select(.email == $n) | .id' "$CONFIG")
  [[ -n $uuid ]] || die "нет пользователя «$name»"
  enc=$(jq -rn --arg s "$name" '$s | @uri')
  printf 'vless://%s@%s:%s?encryption=none&flow=xtls-rprx-vision&security=reality&sni=%s&fp=chrome&pbk=%s&sid=%s&type=tcp&headerType=none#%s\n' \
    "$uuid" "$SERVER_IP" "$PORT" "$SNI" "$PUBLIC_KEY" "$SHORT_ID" "$enc"
}

show_client() {
  local name=$1 link
  link=$(client_link "$name")
  mkdir -p "$CLIENTS_DIR"
  chmod 700 "$CLIENTS_DIR"
  printf '%s\n' "$link" >"$CLIENTS_DIR/$name.txt"
  echo
  say "Пользователь: $name"
  echo "$link"
  if command -v qrencode >/dev/null; then
    qrencode -o "$CLIENTS_DIR/$name.png" -s 8 "$link"
    qrencode -t ANSIUTF8 "$link"
  fi
  echo "Сохранено: $CLIENTS_DIR/$name.txt (и .png с QR-кодом)"
}

new_uuid() { "$XRAY_BIN" uuid; }

# --- команды ---------------------------------------------------------------

cmd_add() {
  need_root; load_state
  [[ $# -ge 1 ]] || die "укажите имя: vpn add <имя>"
  local clients name
  clients=$(clients_json)
  for name in "$@"; do
    valid_name "$name"
    if jq -e --arg n "$name" 'any(.[]; .email == $n)' <<<"$clients" >/dev/null; then
      warn "«$name» уже есть — пропускаю"; continue
    fi
    clients=$(jq -c --arg n "$name" --arg id "$(new_uuid)" \
      '. + [{id: $id, email: $n, flow: "xtls-rprx-vision"}]' <<<"$clients")
  done
  write_config "$clients"
  restart_xray
  for name in "$@"; do show_client "$name"; done
}

cmd_remove() {
  need_root; load_state
  [[ $# -eq 1 ]] || die "укажите имя: vpn remove <имя>"
  local clients
  clients=$(clients_json)
  jq -e --arg n "$1" 'any(.[]; .email == $n)' <<<"$clients" >/dev/null || die "нет пользователя «$1»"
  write_config "$(jq -c --arg n "$1" 'map(select(.email != $n))' <<<"$clients")"
  restart_xray
  rm -f "$CLIENTS_DIR/$1.txt" "$CLIENTS_DIR/$1.png"
  say "«$1» удалён — его ссылка больше не работает"
}

cmd_list() {
  load_state
  jq -r '.inbounds[0].settings.clients[].email' "$CONFIG"
}

cmd_show() {
  load_state
  if [[ $# -eq 0 ]]; then
    local n
    while read -r n; do show_client "$n"; done < <(cmd_list)
  else
    show_client "$1"
  fi
}

check_sni() {
  local sni=$1
  command -v curl >/dev/null || return 0
  if ! curl -sS -o /dev/null --max-time 10 --tlsv1.3 --http2 "https://$sni" 2>/dev/null; then
    warn "сайт $sni не ответил по TLS 1.3 с этого сервера — лучше выбрать другой (см. README)"
  fi
}

cmd_sni() {
  need_root; load_state
  [[ $# -eq 1 ]] || die "укажите сайт: vpn sni www.example.com"
  SNI=$1
  check_sni "$SNI"
  save_state
  write_config "$(clients_json)"
  restart_xray
  say "Сайт маскировки: $SNI. Ссылки изменились — заново добавьте их в Happ:"
  cmd_show
}

cmd_status() {
  load_state
  echo "Сервер: $SERVER_IP:$PORT   маскировка: $SNI"
  echo "Пользователи: $(cmd_list | paste -sd ' ')"
  [[ $SKIP_SYSTEM == 1 ]] || systemctl --no-pager status xray | head -n 5
}

cmd_restart() { need_root; load_state; restart_xray; say "Xray перезапущен"; }

install_xray() {
  say "Ставлю/обновляю Xray (официальный скрипт XTLS/Xray-install)"
  bash -c "$(curl -fsSL https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install
}

cmd_update() {
  need_root
  install_xray
  systemctl restart xray
  say "Xray обновлён: $("$XRAY_BIN" version | head -n 1)"
}

setup_system() {
  say "Ставлю пакеты"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq curl jq qrencode openssl ufw ca-certificates >/dev/null

  install_xray

  say "Включаю BBR (быстрее на плохих каналах)"
  cat >/etc/sysctl.d/99-vpn-bbr.conf <<'EOF'
net.core.default_qdisc=fq
net.ipv4.tcp_congestion_control=bbr
EOF
  sysctl --system >/dev/null || true

  say "Настраиваю файрвол: открыты только SSH и порт $PORT"
  local ssh_port
  ssh_port=$(sshd -T 2>/dev/null | awk '/^port /{print $2; exit}')
  ufw allow "${ssh_port:-22}/tcp" >/dev/null
  ufw allow "$PORT/tcp" >/dev/null
  ufw --force enable >/dev/null
}

detect_ip() {
  local ip
  for url in https://api.ipify.org https://ifconfig.me https://icanhazip.com; do
    ip=$(curl -4 -fsS --max-time 5 "$url" 2>/dev/null | tr -d '[:space:]') && [[ -n $ip ]] && { echo "$ip"; return; }
  done
  die "не удалось определить внешний IP — задайте вручную: SERVER_IP=1.2.3.4 bash vpn.sh install ..."
}

cmd_install() {
  need_root
  [[ $# -ge 1 ]] || die "укажите хотя бы одно имя: bash vpn.sh install мама папа я"
  local name
  for name in "$@"; do valid_name "$name"; done

  if [[ -f $STATE ]]; then
    warn "VPN уже установлен — просто добавляю пользователей"
    cmd_add "$@"; return
  fi

  [[ $SKIP_SYSTEM == 1 ]] || setup_system
  [[ -x $XRAY_BIN ]] || die "не найден $XRAY_BIN"
  mkdir -p "$XRAY_DIR"

  PORT="${PORT:-$DEFAULT_PORT}"
  SNI="${SNI:-$DEFAULT_SNI}"
  SERVER_IP="${SERVER_IP:-$(detect_ip)}"
  check_sni "$SNI"

  say "Генерирую ключи Reality"
  local keys
  keys=$("$XRAY_BIN" x25519)
  # Старые версии печатают «Private key/Public key», новые — «PrivateKey/Password».
  PRIVATE_KEY=$(awk -F': *' 'tolower($1) ~ /private/ {print $2; exit}' <<<"$keys")
  PUBLIC_KEY=$(awk -F': *' 'tolower($1) ~ /public|password/ {print $2; exit}' <<<"$keys")
  [[ -n $PRIVATE_KEY && -n $PUBLIC_KEY ]] || die "не удалось разобрать вывод xray x25519: $keys"
  SHORT_ID=$(openssl rand -hex 8)
  save_state

  write_config '[]'
  cmd_add "$@"

  if [[ $SKIP_SYSTEM != 1 ]]; then
    systemctl enable xray >/dev/null 2>&1 || true
    if [[ -f $0 && $(realpath "$0") != /usr/local/bin/vpn ]]; then
      install -m 755 "$0" /usr/local/bin/vpn
    fi
  fi

  echo
  say "Готово! Отправьте каждому его ссылку (или покажите QR) и добавьте в Happ."
  say "Управление дальше: vpn add|remove|list|show|sni|update|status"
}

usage() { sed -n '2,13p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//'; }

main() {
  local cmd=${1:-}
  [[ $# -gt 0 ]] && shift
  case $cmd in
    install) cmd_install "$@" ;;
    add)     cmd_add "$@" ;;
    remove|rm|del) cmd_remove "$@" ;;
    list|ls) cmd_list ;;
    show)    cmd_show "$@" ;;
    sni)     cmd_sni "$@" ;;
    update)  cmd_update ;;
    status)  cmd_status ;;
    restart) cmd_restart ;;
    *)       usage; [[ -z $cmd || $cmd == help || $cmd == -h ]] || exit 1 ;;
  esac
}

main "$@"
