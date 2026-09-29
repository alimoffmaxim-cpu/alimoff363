import asyncio
import logging
import os
import sys

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.memory import MemoryStorage

from .crypto import generate_master_key


async def autolock(vault, janitor) -> None:
    """Блокирует бот и стирает переписку после SESSION_MINUTES бездействия."""
    while True:
        await asyncio.sleep(15)
        if vault.session_expired():
            vault.lock()
            await janitor.purge()


async def run() -> None:
    from .config import load_config
    from .handlers import build_router
    from .security import Janitor, OwnerOnlyMiddleware
    from .storage import Storage
    from .vault import Vault

    config = load_config()
    storage = Storage(config.db_path)
    vault = Vault(storage, config.master_key, config.session_minutes)

    bot = Bot(
        config.bot_token,
        default=DefaultBotProperties(
            parse_mode=ParseMode.HTML,
            protect_content=True,  # запрет пересылки и сохранения сообщений бота
            link_preview_is_disabled=True,
        ),
    )
    janitor = Janitor(bot, config.auto_delete_minutes)

    dp = Dispatcher(storage=MemoryStorage())  # состояние только в памяти, на диск не пишется
    dp.update.outer_middleware(OwnerOnlyMiddleware(config.owner_id))
    dp.include_router(build_router(config, storage, vault, janitor))

    watcher = asyncio.create_task(autolock(vault, janitor))
    try:
        # Long polling: серверу не нужен открытый порт и публичный адрес.
        await dp.start_polling(bot, allowed_updates=["message", "callback_query"])
    finally:
        watcher.cancel()
        vault.lock()
        storage.conn.close()


def main() -> None:
    if sys.argv[1:] == ["genkey"]:
        print(generate_master_key())
        return
    os.umask(0o077)  # все создаваемые файлы (БД, журналы SQLite) — только для владельца процесса
    # Не логируем содержимое сообщений: только служебные события и предупреждения.
    logging.basicConfig(level=logging.WARNING, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    asyncio.run(run())


if __name__ == "__main__":
    main()
