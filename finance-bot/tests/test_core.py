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
    assert data["m"][-1] == [2026, 9, 0, 350, 90000, 30000, 0, 0, 0, 0]
    assert data["br"] == -90000
    assert data["c"][data["k"][-1][0]] == "Еда"
    # много длинных категорий — ссылка всё равно не превышает лимит
    many = [Tx("out", 100 * i, f"Категория-номер-{i}-с-длинным-названием", "", TODAY, id=i) for i in range(1, 200)]
    assert len(dashboard.webapp_payload(many, datetime(2026, 9, 29))) <= dashboard.WEBAPP_PAYLOAD_LIMIT


def test_each_month_starts_from_zero():
    from finbot.finance import month_totals

    txs = [Tx("out", 500000, "Еда", "", date(2026, 9, 30), id=1), Tx("in", 1000000, "Зарплата", "", date(2026, 9, 5), id=2),
           Tx("out", 20000, "Кафе", "", date(2026, 10, 1), id=3)]
    sep, octo = month_totals(txs, 2026, 9), month_totals(txs, 2026, 10)
    assert (sep.expense, sep.income) == (500000, 1000000)
    assert (octo.expense, octo.income) == (20000, 0)  # октябрь начат с нуля
    assert balance(txs) == 1000000 - 500000 - 20000  # а остаток — за всё время


def test_two_balances_never_reset():
    from finbot.finance import balances, month_totals

    txs = [
        Tx("adj", 15000000, "Корректировка", "", date(2026, 9, 1), id=1, cur="RUB"),   # стартовые 150 000 ₽
        Tx("adj", 500000, "Корректировка", "", date(2026, 9, 1), id=2),                # стартовые 5 000 ฿
        Tx("fx", 3000000, "", "", date(2026, 9, 10), id=3, rub=9000000),               # 90 000 ₽ → 30 000 ฿
        Tx("out", 1200000, "Жильё", "", date(2026, 9, 11), id=4),                      # −12 000 ฿
        Tx("in", 10000000, "Зарплата", "", date(2026, 9, 25), id=5, cur="RUB"),        # +100 000 ₽
        Tx("in", 500000, "Фриланс", "", date(2026, 10, 1), id=6),                      # +5 000 ฿ (октябрь)
        Tx("out", 35000, "Еда", "", date(2026, 10, 1), id=7),                          # −350 ฿ (октябрь)
    ]
    bal = balances(txs)
    thb, rub = bal["THB"], bal["RUB"]
    assert thb == 500000 + 3000000 - 1200000 + 500000 - 35000      # 27 650 ฿ — копится через месяцы
    assert rub == 15000000 - 9000000 + 10000000                    # 160 000 ₽
    octo = month_totals(txs, 2026, 10)
    assert (octo.income, octo.expense, octo.income_rub) == (500000, 35000, 0)  # а месяц — с нуля
    sep = month_totals(txs, 2026, 9)
    assert (sep.income, sep.income_rub, sep.expense) == (0, 10000000, 1200000)


def test_currency_in_input():
    p = parse_input("+100000₽ зп", TODAY)
    assert (p.kind, p.amount, p.cur, p.category) == ("in", 10000000, "RUB", "Зарплата")
    p = parse_input("доход 100 000 руб", TODAY)
    assert (p.cur, p.category) == ("RUB", None)
    assert parse_input("-350 еда", TODAY).cur is None  # без валюты — баты
    assert parse_input("-350 еда", TODAY).to_tx().cur == "THB"
    p = parse_input("баланс 150000 ₽", TODAY)
    assert (p.kind, p.amount, p.cur) == ("balance", 15000000, "RUB")
    assert parse_input("баланс 12000", TODAY).cur == "THB"
    assert parse_input("-500 рис", TODAY).category == "Рис"  # «р» внутри слова — не рубли


def test_old_records_without_currency_load_as_baht():
    import json
    old = json.dumps({"kind": "out", "amount": 100, "category": "Еда", "note": "", "day": "2026-09-01", "rub": 0}).encode()
    assert Tx.load(1, old).cur == "THB"


def test_balance_command_currency_letters():
    assert parse_input("баланс 100 б", TODAY).cur == "THB"
    assert parse_input("баланс 100 р", TODAY).cur == "RUB"
    assert parse_input("баланс 100 рубли", TODAY).cur == "RUB"
    assert parse_input("баланс 100р", TODAY).cur == "RUB"
    with pytest.raises(ParseError):
        parse_input("баланс 100 долларов", TODAY)  # не угадываем — переспрашиваем


def test_balance_correction_does_not_touch_month_income():
    from finbot.finance import balances, month_totals

    txs = [Tx("adj", 10000000, "Корректировка", "", TODAY, id=1, cur="RUB"),
           Tx("adj", 1200000, "Корректировка", "", TODAY, id=2)]
    m = month_totals(txs, TODAY.year, TODAY.month)
    assert (m.income, m.expense, m.income_rub, m.expense_rub) == (0, 0, 0, 0)
    assert balances(txs) == {"THB": 1200000, "RUB": 10000000, "RUBB": 0}



def test_business_rubles_wallet():
    from finbot.finance import balances, month_totals

    p = parse_input("баланс 500000 рб", TODAY)
    assert (p.kind, p.amount, p.cur) == ("balance", 50000000, "RUBB")
    assert parse_input("+100000 рб", TODAY).cur == "RUBB"
    assert parse_input("доход 100000рб фриланс", TODAY).category == "Фриланс"
    assert parse_input("обмен 90000 30000 рб", TODAY).to_tx().cur == "RUBB"
    assert parse_input("обмен 90000 30000", TODAY).to_tx().cur == "THB"  # личные рубли

    txs = [parse_input(t, TODAY).to_tx() for t in
           ("+100000 рб", "обмен 30000 10000 рб", "обмен 9000 3000", "+50000 р", "-500 еда", "-2000 рб реклама")]
    assert balances(txs) == {"THB": 1250000, "RUB": 4100000, "RUBB": 6800000}
    m = month_totals(txs, TODAY.year, TODAY.month)
    assert (m.income_rubb, m.expense_rubb, m.income_rub, m.expense) == (10000000, 200000, 5000000, 50000)
