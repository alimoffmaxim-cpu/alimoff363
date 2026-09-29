"""Разбор ввода и расчёт статистики — чистые функции без Telegram."""
import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta

from .storage import Tx

AMOUNT_RE = re.compile(r"^\s*([+-]?)\s*(\d{1,3}(?: \d{3})+|\d+)(?:[.,](\d{1,2}))?(?=\s|$)\s*(.*)$", re.S)
DATE_RE = re.compile(r"(?:^|\s)(\d{1,2})\.(\d{1,2})(?:\.(\d{2}|\d{4}))?(?=\s|$)")
MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]


def parse_amount(text: str) -> int | None:
    """'12 500,50' -> 1250050 (копейки)."""
    m = re.fullmatch(r"\s*-?(\d{1,3}(?: \d{3})+|\d+)(?:[.,](\d{1,2}))?\s*", text)
    if not m:
        return None
    return int(m.group(1).replace(" ", "")) * 100 + int((m.group(2) or "0").ljust(2, "0"))


def parse_tx(text: str, today: date) -> Tx | None:
    """'-350 кафе обед', '+120 000 зарплата', '1500 такси 25.09', 'вчера'."""
    m = AMOUNT_RE.match(text)
    if not m:
        return None
    sign, whole, frac, rest = m.groups()
    amount = int(whole.replace(" ", "")) * 100 + int((frac or "0").ljust(2, "0"))
    if amount <= 0:
        return None

    day = today
    words = rest.split()
    if "вчера" in (w.lower() for w in words):
        day = today - timedelta(days=1)
        words = [w for w in words if w.lower() != "вчера"]
    rest = " ".join(words)
    if dm := DATE_RE.search(rest):
        d, mo, y = dm.groups()
        year = today.year if not y else int(y) + (2000 if len(y) == 2 else 0)
        try:
            day = date(year, int(mo), int(d))
        except ValueError:
            return None
        if not y and day > today:
            day = day.replace(year=year - 1)
        rest = (rest[: dm.start()] + rest[dm.end() :]).strip()

    kind = "in" if sign == "+" else "out"
    category, _, note = rest.strip().partition(" ")
    category = category.lower() or ("доход" if kind == "in" else "прочее")
    return Tx(kind=kind, amount=amount, category=category[:40], note=note.strip()[:200], day=day)


def shift_month(year: int, month: int, delta: int) -> tuple[int, int]:
    index = year * 12 + (month - 1) + delta
    return index // 12, index % 12 + 1


def month_label(year: int, month: int) -> str:
    return f"{MONTHS[month - 1]} {str(year)[2:]}"


@dataclass
class MonthTotals:
    year: int
    month: int
    income: int = 0
    expense: int = 0

    @property
    def net(self) -> int:
        return self.income - self.expense


def monthly_totals(txs: list[Tx], today: date, months: int = 6) -> list[MonthTotals]:
    keys = [shift_month(today.year, today.month, -i) for i in reversed(range(months))]
    totals = {k: MonthTotals(*k) for k in keys}
    for tx in txs:
        bucket = totals.get((tx.day.year, tx.day.month))
        if bucket is None:
            continue
        if tx.kind == "in":
            bucket.income += tx.amount
        else:
            bucket.expense += tx.amount
    return [totals[k] for k in keys]


def categories(txs: list[Tx], year: int, month: int, kind: str = "out") -> list[tuple[str, int]]:
    sums: dict[str, int] = defaultdict(int)
    for tx in txs:
        if tx.kind == kind and tx.day.year == year and tx.day.month == month:
            sums[tx.category] += tx.amount
    return sorted(sums.items(), key=lambda kv: kv[1], reverse=True)


def pct_change(current: int, previous: int) -> float | None:
    if previous == 0:
        return None
    return (current - previous) / previous * 100


def money(kopecks: int, currency: str = "₽") -> str:
    rub, kop = divmod(abs(kopecks), 100)
    sign = "−" if kopecks < 0 else ""
    text = f"{rub:,}".replace(",", " ")
    if kop:
        text += f",{kop:02d}"
    return f"{sign}{text} {currency}"


def fmt_pct(value: float | None) -> str:
    if value is None:
        return "нет данных за прошлый месяц"
    arrow = "▲" if value > 0 else "▼" if value < 0 else "•"
    return f"{arrow} {value:+.1f}%".replace(".", ",").replace("-", "−")
