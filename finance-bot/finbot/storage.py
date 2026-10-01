"""SQLite, где каждая запись целиком зашифрована.

В открытом виде в файле лежат только номера строк и служебные данные
(соль, счётчик неверных PIN). Суммы, категории, даты, названия счетов — только в шифротексте.
"""
import json
import sqlite3
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path

from .crypto import Cipher

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, blob BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, blob BLOB NOT NULL);
"""
TABLES = ("transactions", "accounts")


@dataclass
class Tx:
    kind: str  # "in" — доход, "out" — расход, "fx" — обмен ₽→฿, "adj" — корректировка баланса
    amount: int  # баты в сотых (для "adj" может быть отрицательной)
    category: str
    note: str
    day: date
    id: int | None = None
    rub: int = 0  # для "fx": сколько рублей отдано (в копейках)
    cur: str = "THB"  # кошелёк: "THB", "RUB" или "RUBB" (рубли, бизнес); для "fx" — откуда списаны рубли

    def dump(self) -> bytes:
        data = asdict(self)
        data.pop("id")
        data["day"] = self.day.isoformat()
        return json.dumps(data, ensure_ascii=False).encode()

    @classmethod
    def load(cls, row_id: int, raw: bytes) -> "Tx":
        data = json.loads(raw)
        data["day"] = date.fromisoformat(data["day"])
        return cls(id=row_id, **data)


@dataclass
class Account:
    name: str
    balance: int  # в копейках
    id: int | None = None

    def dump(self) -> bytes:
        return json.dumps({"name": self.name, "balance": self.balance}, ensure_ascii=False).encode()

    @classmethod
    def load(cls, row_id: int, raw: bytes) -> "Account":
        return cls(id=row_id, **json.loads(raw))


def _aad(table: str) -> bytes:
    return f"finbot/{table}/v1".encode()


class Storage:
    def __init__(self, path: Path):
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.conn = sqlite3.connect(path)
        path.chmod(0o600)
        self.conn.execute("PRAGMA secure_delete = ON")  # удалённые записи затираются нулями
        self.conn.executescript(SCHEMA)

    # --- служебные значения ---
    def get_meta(self, key: str) -> bytes | None:
        row = self.conn.execute("SELECT v FROM meta WHERE k = ?", (key,)).fetchone()
        return row[0] if row else None

    def set_meta(self, key: str, value: bytes) -> None:
        with self.conn:
            self.conn.execute("INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)", (key, value))

    # --- операции ---
    def add_tx(self, cipher: Cipher, tx: Tx) -> int:
        with self.conn:
            cur = self.conn.execute(
                "INSERT INTO transactions (blob) VALUES (?)",
                (cipher.encrypt(tx.dump(), _aad("transactions")),),
            )
        tx.id = cur.lastrowid
        return tx.id

    def list_tx(self, cipher: Cipher) -> list[Tx]:
        rows = self.conn.execute("SELECT id, blob FROM transactions ORDER BY id").fetchall()
        return [Tx.load(i, cipher.decrypt(b, _aad("transactions"))) for i, b in rows]

    def delete_tx(self, tx_id: int) -> bool:
        with self.conn:
            cur = self.conn.execute("DELETE FROM transactions WHERE id = ?", (tx_id,))
        return cur.rowcount > 0

    # --- счета ---
    def list_accounts(self, cipher: Cipher) -> list[Account]:
        rows = self.conn.execute("SELECT id, blob FROM accounts ORDER BY id").fetchall()
        return [Account.load(i, cipher.decrypt(b, _aad("accounts"))) for i, b in rows]

    def set_account(self, cipher: Cipher, name: str, balance: int) -> None:
        existing = next((a for a in self.list_accounts(cipher) if a.name.lower() == name.lower()), None)
        blob = cipher.encrypt(Account(name, balance).dump(), _aad("accounts"))
        with self.conn:
            if existing:
                self.conn.execute("UPDATE accounts SET blob = ? WHERE id = ?", (blob, existing.id))
            else:
                self.conn.execute("INSERT INTO accounts (blob) VALUES (?)", (blob,))

    def delete_account(self, cipher: Cipher, name: str) -> bool:
        existing = next((a for a in self.list_accounts(cipher) if a.name.lower() == name.lower()), None)
        if not existing:
            return False
        with self.conn:
            self.conn.execute("DELETE FROM accounts WHERE id = ?", (existing.id,))
        return True

    # --- полный сброс ---
    def wipe(self) -> None:
        with self.conn:
            for table in (*TABLES, "meta"):
                self.conn.execute(f"DELETE FROM {table}")
            self.conn.execute("DELETE FROM sqlite_sequence")
        self.conn.execute("VACUUM")

    # --- смена PIN ---
    def reencrypt(self, old: Cipher, new: Cipher, meta: dict[str, bytes]) -> None:
        """Перешифровывает всё одной транзакцией: либо целиком, либо никак."""
        with self.conn:
            for table in TABLES:
                rows = self.conn.execute(f"SELECT id, blob FROM {table}").fetchall()
                for row_id, blob in rows:
                    plain = old.decrypt(blob, _aad(table))
                    self.conn.execute(
                        f"UPDATE {table} SET blob = ? WHERE id = ?", (new.encrypt(plain, _aad(table)), row_id)
                    )
            for key, value in meta.items():
                self.conn.execute("INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)", (key, value))
        self.conn.execute("VACUUM")  # не оставляем старые шифротексты в свободных страницах
