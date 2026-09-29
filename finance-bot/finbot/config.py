import os
from dataclasses import dataclass
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

from .crypto import load_master_key


@dataclass(frozen=True)
class Config:
    bot_token: str
    owner_id: int
    master_key: bytes
    db_path: Path
    session_minutes: int
    auto_delete_minutes: int
    currency: str
    tz: ZoneInfo


def _required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Не задана переменная окружения {name} (см. .env.example)")
    return value


def load_config() -> Config:
    load_dotenv()
    env_file = Path(".env")
    # На Windows права POSIX не применяются — там проверку пропускаем.
    if os.name != "nt" and env_file.exists() and env_file.stat().st_mode & 0o077:
        raise SystemExit("Файл .env доступен другим пользователям системы. Выполните: chmod 600 .env")

    token = _required("BOT_TOKEN")
    if _required("OWNER_ID") == token.split(":", 1)[0]:
        raise SystemExit("В OWNER_ID указан ID самого бота. Нужен ваш Telegram ID (его пришлёт @userinfobot).")

    config = Config(
        bot_token=token,
        owner_id=int(_required("OWNER_ID")),
        master_key=load_master_key(_required("MASTER_KEY")),
        db_path=Path(os.environ.get("DB_PATH", "data/finance.db")),
        session_minutes=int(os.environ.get("SESSION_MINUTES", "15")),
        auto_delete_minutes=int(os.environ.get("AUTO_DELETE_MINUTES", "10")),
        currency=os.environ.get("CURRENCY", "₽"),
        tz=ZoneInfo(os.environ.get("TIMEZONE", "Europe/Moscow")),
    )
    # Секреты больше не нужны в окружении процесса — убираем, чтобы не утекли в дочерние процессы/дампы.
    for name in ("BOT_TOKEN", "MASTER_KEY"):
        os.environ.pop(name, None)
    return config
