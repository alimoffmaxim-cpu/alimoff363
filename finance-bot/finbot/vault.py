"""Блокировка PIN-кодом, авто-блокировка и защита от перебора."""
import asyncio
import time

from .crypto import Cipher, InvalidTag, derive_key, new_salt
from .storage import Storage

CHECK_PLAIN = b"finbot-pin-check"
CHECK_AAD = b"finbot/check/v1"
MAX_ATTEMPTS = 5
BASE_LOCKOUT_SECONDS = 15 * 60
MIN_PIN_LENGTH = 6


class Vault:
    def __init__(self, storage: Storage, master_key: bytes, session_minutes: int):
        self._storage = storage
        self._master_key = master_key
        self._session_seconds = session_minutes * 60
        self._cipher: Cipher | None = None
        self._expires_at = 0.0

    @property
    def initialized(self) -> bool:
        return self._storage.get_meta("salt") is not None

    @property
    def cipher(self) -> Cipher:
        if not self.is_unlocked():
            raise PermissionError("vault is locked")
        return self._cipher

    def is_unlocked(self) -> bool:
        if self._cipher is not None and time.monotonic() < self._expires_at:
            return True
        self.lock()
        return False

    def session_expired(self) -> bool:
        return self._cipher is not None and time.monotonic() >= self._expires_at

    def touch(self) -> None:
        self._expires_at = time.monotonic() + self._session_seconds

    def lock(self) -> None:
        self._cipher = None
        self._expires_at = 0.0

    async def _derive(self, pin: str, salt: bytes) -> Cipher:
        key = await asyncio.to_thread(derive_key, self._master_key, pin, salt)
        return Cipher(key)

    async def setup(self, pin: str) -> None:
        if self.initialized:
            raise RuntimeError("PIN уже установлен")
        salt = new_salt()
        cipher = await self._derive(pin, salt)
        self._storage.set_meta("salt", salt)
        self._storage.set_meta("check", cipher.encrypt(CHECK_PLAIN, CHECK_AAD))
        self._cipher = cipher
        self.touch()

    def lockout_remaining(self) -> int:
        until = int(self._storage.get_meta("lock_until") or b"0")
        return max(0, until - int(time.time()))

    async def unlock(self, pin: str) -> bool:
        if self.lockout_remaining():
            return False
        cipher = await self._derive(pin, self._storage.get_meta("salt"))
        try:
            cipher.decrypt(self._storage.get_meta("check"), CHECK_AAD)
        except InvalidTag:
            self._register_failure()
            return False
        self._storage.set_meta("failed", b"0")
        self._cipher = cipher
        self.touch()
        return True

    def _register_failure(self) -> None:
        failed = int(self._storage.get_meta("failed") or b"0") + 1
        self._storage.set_meta("failed", str(failed).encode())
        if failed % MAX_ATTEMPTS == 0:
            # 15 мин, 30 мин, 1 ч, 2 ч ... — перебор становится бессмысленным
            seconds = BASE_LOCKOUT_SECONDS * 2 ** (failed // MAX_ATTEMPTS - 1)
            self._storage.set_meta("lock_until", str(int(time.time()) + seconds).encode())

    def attempts_left(self) -> int:
        failed = int(self._storage.get_meta("failed") or b"0")
        return MAX_ATTEMPTS - failed % MAX_ATTEMPTS

    async def change_pin(self, new_pin: str) -> None:
        old = self.cipher
        salt = new_salt()
        new = await self._derive(new_pin, salt)
        self._storage.reencrypt(
            old, new, {"salt": salt, "check": new.encrypt(CHECK_PLAIN, CHECK_AAD), "failed": b"0"}
        )
        self._cipher = new
        self.touch()
