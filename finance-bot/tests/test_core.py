import asyncio
from datetime import date

import pytest

from finbot import crypto, dashboard
from finbot.finance import (
    ParseError, balance, fmt_rate, frequent_categories, last_rate, money, monthly_totals, parse_input, pct_change,
)
from finbot.storage import Storage, Tx
from finbot.vault import MAX_ATTEMPTS, Vault

crypto.SCRYPT_N = 2**10  # быстро для тестов
TODAY = date(2026, 9, 29)


def test_parse_formats():
    p = parse_input("-350", TODAY)
    assert (p.kind, p.amount, p.category, p.day) == ("out", 35000, None, TODAY)
    p = parse_input("350 кафе обед с коллегами", TODAY)
    assert (p.kind, p.amount, p.category, p.note) == ("out", 35000, "Кафе", "обед с коллегами")
    p = parse_input("расход 1200 такси", TODAY)
    assert (p.kind, p.amount, p.category) == ("out", 120000, "Транспорт")
    p = parse_input("Расход: 99,5 новая_штука", TODAY)
    assert (p.kind, p.amount, p.category) == ("out", 9950, "Новая_штука")
    p = parse_input("+50 000 зп", TODAY)
    assert (p.kind, p.amount, p.category) == ("in", 5000000, "Зарплата")
    p = parse_input("доход 5к", TODAY)
    assert (p.kind, p.amount, p.category) == ("in", 500000, None)
    assert parse_input("5 кафе", TODAY).amount == 500  # «к» от «кафе» — не тысячи
    assert parse_input("1,500 еда", TODAY).amount == 150000
    assert parse_input("500 еда вчера", TODAY).day == date(2026, 9, 28)
    assert parse_input("500 еда 15.12", TODAY).day == date(2025, 12, 15)
    # в пошаговом вводе дохода сумма без знака — доход
    assert parse_input("5000", TODAY, default_kind="in").kind == "in"
    with pytest.raises(ParseError):
        parse_input("привет", TODAY)
    with pytest.raises(ParseError):
        parse_input("0 еда", TODAY)


def test_parse_exchange_and_balance():
    for text in ("обмен 90000 - 30000", "обмен 90 000 → 30 000", "обмен 90к 30к", "Обменял 90000/30000"):
        p = parse_input(text, TODAY)
        assert (p.kind, p.rub, p.amount, p.swapped) == ("fx", 9000000, 3000000, False), text
    p = parse_input("обмен 30000 90000", TODAY)
    assert (p.rub, p.amount, p.swapped) == (9000000, 3000000, True)
    with pytest.raises(ParseError):
        parse_input("обмен 90000", TODAY)
    p = parse_input("баланс 12 000", TODAY)
    assert (p.kind, p.amount) == ("balance", 1200000)
    assert parse_input("баланс -500", TODAY).amount == -50000


def test_stats():
    txs = [Tx("in", 100000, "Зарплата", "", date(2026, 8, 5)), Tx("in", 150000, "Зарплата", "", date(2026, 9, 5)),
           Tx("out", 30000, "Еда", "", date(2026, 9, 6)),
           Tx("fx", 3000000, "", "", date(2026, 9, 7), rub=9000000),
           Tx("adj", -1000, "Корректировка", "", date(2026, 9, 8))]
    months = monthly_totals(txs, TODAY, 2)
    assert [(m.month, m.income, m.expense) for m in months] == [(8, 100000, 0), (9, 150000, 30000)]
    assert months[1].rate == 3.0
    assert balance(txs) == 100000 + 150000 - 30000 + 3000000 - 1000
    assert last_rate(txs) == 3.0
    assert pct_change(150000, 100000) == 50
    assert money(1250050) == "12 500,50 ฿"
    assert fmt_rate(3.0) == "3,00 ₽/฿"
    assert frequent_categories(txs, "out")[0] == "Еда"
    assert frequent_categories(txs, "out")[-1] == "Другое"
    assert dashboard.render(txs, TODAY).startswith(b"\x89PNG")
    assert "Обмен" in dashboard.caption(txs, TODAY)


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


def test_webapp_payload_roundtrip_and_limit():
    import base64
    import json
    from datetime import datetime

    txs = [Tx("out", 35000, "Еда", "", TODAY, id=1), Tx("fx", 3000000, "", "", TODAY, id=2, rub=9000000)]
    raw = dashboard.webapp_payload(txs, datetime(2026, 9, 29, 20, 15))
    data = json.loads(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)))
    assert data["v"] == 1 and data["b"] == 30000 - 350 and data["r"] == 3.0
    assert data["m"][-1] == [2026, 9, 0, 350, 90000, 30000]
    assert data["c"][data["k"][-1][0]] == "Еда"
    # много длинных категорий — ссылка всё равно не превышает лимит
    many = [Tx("out", 100 * i, f"Категория-номер-{i}-с-длинным-названием", "", TODAY, id=i) for i in range(1, 200)]
    assert len(dashboard.webapp_payload(many, datetime(2026, 9, 29))) <= dashboard.WEBAPP_PAYLOAD_LIMIT
