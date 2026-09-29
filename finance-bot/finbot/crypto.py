"""Шифрование данных.

Ключ данных = HKDF(MASTER_KEY + scrypt(PIN)). Он существует только в памяти,
пока бот разблокирован. Чтобы расшифровать базу, нужны ОБА секрета:
мастер-ключ с сервера и PIN, который знаете только вы.
"""
import base64
import os
import secrets

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

SCRYPT_N = 2**16  # ~64 МБ памяти и ~0.2 с на попытку — дорого для перебора
NONCE_SIZE = 12

__all__ = ["Cipher", "InvalidTag", "derive_key", "generate_master_key", "load_master_key", "new_salt"]


def generate_master_key() -> str:
    return base64.urlsafe_b64encode(secrets.token_bytes(32)).decode()


def load_master_key(value: str) -> bytes:
    try:
        key = base64.urlsafe_b64decode(value.encode())
    except ValueError as exc:
        raise SystemExit("MASTER_KEY должен быть в base64 (python -m finbot genkey)") from exc
    if len(key) != 32:
        raise SystemExit("MASTER_KEY должен содержать 32 байта (python -m finbot genkey)")
    return key


def new_salt() -> bytes:
    return os.urandom(16)


def derive_key(master_key: bytes, pin: str, salt: bytes) -> bytes:
    stretched = Scrypt(salt=salt, length=32, n=SCRYPT_N, r=8, p=1).derive(pin.encode())
    hkdf = HKDF(algorithm=hashes.SHA256(), length=32, salt=salt, info=b"finbot data key v1")
    return hkdf.derive(master_key + stretched)


class Cipher:
    """AES-256-GCM: шифрует и защищает от подмены каждую запись."""

    def __init__(self, key: bytes):
        self._aead = AESGCM(key)

    def encrypt(self, data: bytes, aad: bytes) -> bytes:
        nonce = os.urandom(NONCE_SIZE)
        return nonce + self._aead.encrypt(nonce, data, aad)

    def decrypt(self, blob: bytes, aad: bytes) -> bytes:
        return self._aead.decrypt(blob[:NONCE_SIZE], blob[NONCE_SIZE:], aad)
