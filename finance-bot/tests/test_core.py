import asyncio
from datetime import date

import pytest

from finbot import crypto, dashboard
from finbot.finance import money, monthly_totals, parse_tx, pct_change
from finbot.storage import Storage, Tx
from finbot.vault import MAX_ATTEMPTS, Vault

crypto.SCRYPT_N = 2**10  # быстро для тестов
TODAY = date(2026, 9, 29)


def test_parse_expense_income_and_dates():
    tx = parse_tx("350 кафе обед с коллегами", TODAY)
    assert (tx.kind, tx.amount, tx.category, tx.note, tx.day) == ("out", 35000, "кафе", "обед с коллегами", TODAY)
    tx = parse_tx("+120 000 зарплата", TODAY)
    assert (tx.kind, tx.amount, tx.category) == ("in", 12000000, "зарплата")
    assert parse_tx("-99,5 такси 25.09", TODAY).amount == 9950
    assert parse_tx("-99,5 такси 25.09", TODAY).day == date(2026, 9, 25)
    assert parse_tx("500 еда вчера", TODAY).day == date(2026, 9, 28)
    assert parse_tx("500 еда 15.12", TODAY).day == date(2025, 12, 15)
    assert parse_tx("привет", TODAY) is None
    assert parse_tx("0 еда", TODAY) is None


def test_stats():
    txs = [Tx("in", 100000, "з", "", date(2026, 8, 5)), Tx("in", 150000, "з", "", date(2026, 9, 5)),
           Tx("out", 30000, "еда", "", date(2026, 9, 6))]
    months = monthly_totals(txs, TODAY, 2)
    assert [(m.month, m.income, m.expense) for m in months] == [(8, 100000, 0), (9, 150000, 30000)]
    assert pct_change(150000, 100000) == 50
    assert money(1250050) == "12 500,50 ₽"
    png = dashboard.render(txs, TODAY, "₽", 500000)
    assert png.startswith(b"\x89PNG")


def test_vault_encrypts_and_locks(tmp_path):
    async def scenario():
        storage = Storage(tmp_path / "db.sqlite")
        master = crypto.load_master_key(crypto.generate_master_key())
        vault = Vault(storage, master, 15)
        await vault.setup("secret-pin")
        storage.add_tx(vault.cipher, Tx("out", 777700, "секретнаякатегория", "", TODAY))
        storage.set_account(vault.cipher, "МойБанк", 123)

        raw = (tmp_path / "db.sqlite").read_bytes()
        assert "секретнаякатегория".encode() not in raw and "МойБанк".encode() not in raw

        vault.lock()
        with pytest.raises(PermissionError):
            vault.cipher
        assert not await vault.unlock("wrong-pin")
        assert await vault.unlock("secret-pin")

        await vault.change_pin("new-secret")
        vault.lock()
        assert not await vault.unlock("secret-pin")
        assert await vault.unlock("new-secret")
        assert storage.list_tx(vault.cipher)[0].amount == 777700
        assert storage.list_accounts(vault.cipher)[0].name == "МойБанк"

        # Другой мастер-ключ с тем же PIN данные не открывает
        other = Vault(storage, crypto.load_master_key(crypto.generate_master_key()), 15)
        assert not await other.unlock("new-secret")

        vault.lock()
        for _ in range(MAX_ATTEMPTS):
            await vault.unlock("bad-pin!")
        assert vault.lockout_remaining() > 0
        assert not await vault.unlock("new-secret")  # даже верный PIN не принимается во время блокировки

    asyncio.run(scenario())
