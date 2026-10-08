"""Доступ только владельцу и автоудаление сообщений из чата."""
import asyncio
import json
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any

from aiogram import BaseMiddleware, Bot
from aiogram.types import Message, TelegramObject

log = logging.getLogger("finbot.security")


class OwnerOnlyMiddleware(BaseMiddleware):
    """Молча игнорирует всех, кроме владельца, и любые чаты, кроме личного.

    Чужой пользователь не получает ни одного байта ответа — даже не узнает, что бот жив.
    Владельцу приходит короткое уведомление о попытке (без текста сообщения).
    """

    def __init__(self, owner_id: int):
        self.owner_id = owner_id
        self._notified: dict[int, float] = {}

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        user = data.get("event_from_user")
        chat = data.get("event_chat")
        if user is not None and user.id == self.owner_id and (chat is None or chat.type == "private"):
            return await handler(event, data)

        if user is not None and user.id != self.owner_id:
            log.warning(
                "Сообщение от чужого пользователя id %s отклонено. "
                "Если это вы — в .env указан неверный OWNER_ID (сейчас %s), замените его на %s.",
                user.id, self.owner_id, user.id,
            )
            await self._notify_owner(data["bot"], user.id, user.username)
        if chat is not None and chat.type != "private":
            try:
                await data["bot"].leave_chat(chat.id)
            except Exception:  # noqa: BLE001 — бот мог уже выйти
                pass
        return None

    async def _notify_owner(self, bot: Bot, user_id: int, username: str | None) -> None:
        now = time.monotonic()
        if now - self._notified.get(user_id, -3600) < 3600:
            return
        self._notified[user_id] = now
        who = f"@{username}" if username else "без username"
        try:
            await bot.send_message(self.owner_id, f"⚠️ Кто-то пытался воспользоваться ботом: id {user_id}, {who}.")
        except Exception:  # noqa: BLE001
            log.exception("Не удалось уведомить владельца")


class Janitor:
    """Удаляет сообщения из переписки по таймеру и при блокировке.

    Номера сообщений (только номера, без текста) сохраняются в базе, чтобы после
    перезапуска бота всё, что не успели удалить, было удалено при старте.
    """

    def __init__(self, bot: Bot, delay_minutes: int, storage=None):
        self.bot = bot
        self.delay = delay_minutes * 60
        self._storage = storage
        self._tasks: dict[tuple[int, int], asyncio.Task | None] = {}

    # --- учёт сообщений ---
    def _save(self) -> None:
        if self._storage is not None:
            self._storage.set_meta("janitor", json.dumps(sorted(self._tasks)).encode())

    def _forget(self, key: tuple[int, int]) -> None:
        task = self._tasks.pop(key, None)
        if task is not None and task is not asyncio.current_task():
            task.cancel()

    def later(self, *messages: Message | None, delay: float | None = None) -> None:
        """Удалить через delay секунд (по умолчанию AUTO_DELETE_MINUTES) и при блокировке."""
        wait = self.delay if delay is None else delay
        for msg in messages:
            if msg is None:
                continue
            key = (msg.chat.id, msg.message_id)
            if key not in self._tasks:
                self._tasks[key] = asyncio.create_task(self._delete_after(key, wait)) if wait > 0 else None
        self._save()

    def keep(self, msg: Message | None) -> None:
        """Не удалять по таймеру, только при следующей очистке (экран блокировки)."""
        if msg is not None:
            self._tasks.setdefault((msg.chat.id, msg.message_id), None)
            self._save()

    async def now(self, *messages: Message | None) -> None:
        for msg in messages:
            if msg is not None:
                key = (msg.chat.id, msg.message_id)
                self._forget(key)
                await self._delete(key)
        self._save()

    async def purge(self) -> None:
        keys = list(self._tasks)
        for key in keys:
            self._forget(key)
        self._save()
        for key in keys:
            await self._delete(key)

    async def restore(self) -> int:
        """При старте: удалить сообщения, оставшиеся с прошлого запуска."""
        if self._storage is None:
            return 0
        raw = self._storage.get_meta("janitor")
        keys = [tuple(k) for k in json.loads(raw)] if raw else []
        self._storage.set_meta("janitor", b"[]")
        for key in keys:
            await self._delete(key)
        return len(keys)

    async def _delete_after(self, key: tuple[int, int], delay: float) -> None:
        await asyncio.sleep(delay)
        self._tasks.pop(key, None)
        self._save()
        await self._delete(key)

    async def _delete(self, key: tuple[int, int]) -> None:
        try:
            await self.bot.delete_message(*key)
        except Exception:  # noqa: BLE001 — сообщение уже удалено или старше 48 ч
            pass
