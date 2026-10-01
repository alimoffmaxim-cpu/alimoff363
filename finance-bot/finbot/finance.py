"""Разбор ввода и расчёт статистики — чистые функции без Telegram.

Все суммы хранятся в сотых долях (сатанги для бат, копейки для рублей).
Основная валюта — тайский бат. Рубли участвуют только в обменах.
"""
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, timedelta

from .storage import Tx

THB = "฿"
RUB = "₽"

MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]
MONTHS_FULL = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
               "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"]

MONTHS_WITH = ["январём", "февралём", "мартом", "апрелем", "маем", "июнем",
               "июлем", "августом", "сентябрём", "октябрём", "ноябрём", "декабрём"]

EXPENSE_CATEGORIES = [
    ("🍜", "Еда"), ("🛒", "Продукты"), ("☕", "Кафе"), ("🛵", "Транспорт"),
    ("🏠", "Жильё"), ("📱", "Связь"), ("💊", "Здоровье"), ("🎉", "Развлечения"),
    ("🛍", "Покупки"), ("✈️", "Путешествия"), ("💆", "Уход"), ("📦", "Другое"),
]
INCOME_CATEGORIES = [("💼", "Зарплата"), ("💻", "Фриланс"), ("🎁", "Подарок"), ("💸", "Возврат"), ("📦", "Другое")]
EMOJI = {name: emoji for emoji, name in EXPENSE_CATEGORIES + INCOME_CATEGORIES}

ALIASES = {
    "еда": "Еда", "обед": "Еда", "ужин": "Еда", "завтрак": "Еда",
    "продукты": "Продукты", "магазин": "Продукты", "7-11": "Продукты", "макро": "Продукты",
    "кафе": "Кафе", "ресторан": "Кафе", "кофе": "Кафе",
    "такси": "Транспорт", "grab": "Транспорт", "bolt": "Транспорт", "байк": "Транспорт",
    "бензин": "Транспорт", "транспорт": "Транспорт",
    "аренда": "Жильё", "жилье": "Жильё", "жильё": "Жильё", "квартира": "Жильё", "свет": "Жильё",
    "связь": "Связь", "интернет": "Связь", "симка": "Связь",
    "здоровье": "Здоровье", "аптека": "Здоровье", "врач": "Здоровье",
    "развлечения": "Развлечения", "кино": "Развлечения", "бар": "Развлечения",
    "покупки": "Покупки", "одежда": "Покупки",
    "путешествия": "Путешествия", "отель": "Путешествия", "билеты": "Путешествия",
    "уход": "Уход", "массаж": "Уход", "маникюр": "Уход",
    "зп": "Зарплата", "зарплата": "Зарплата", "фриланс": "Фриланс",
    "подарок": "Подарок", "возврат": "Возврат", "кэшбек": "Возврат", "кешбэк": "Возврат",
    "другое": "Другое", "прочее": "Другое",
}

OUT_WORDS = {"расход", "расходы", "трата", "потратил", "потратила", "минус"}
IN_WORDS = {"доход", "получил", "получила", "плюс", "приход"}
FX_WORDS = {"обмен", "обменял", "обменяла", "поменял", "поменяла"}
BALANCE_WORDS = {"баланс", "остаток"}
RUB_WORDS = {"₽", "р", "руб", "рубль", "рубля", "рублей", "рубли", "рублях", "rub", "rur"}
THB_WORDS = {"฿", "б", "бат", "бата", "батов", "баты", "батах", "thb", "baht"}
CURRENCY_GLUED_RE = re.compile(r"(\d)(₽|฿|руб\w*|р|б|бат\w*|thb|rub)(?=[\s.]|$)", re.I)

# 350 · 1 500 · 1,500 · 350,50 · 90к · 90 тыс
NUM_RE = re.compile(r"(\d{1,3}(?:[ ,.]\d{3})+|\d+)(?:[.,](\d{1,2}))?(?:\s*(к|k|тыс)(?![а-яa-z]))?", re.I)
DATE_RE = re.compile(r"(?:^|\s)(\d{1,2})\.(\d{1,2})(?:\.(\d{2}|\d{4}))?(?=\s|$)")


def _number(m: re.Match) -> int:
    whole, frac, thousands = m.groups()
    value = int(re.sub(r"[ ,.]", "", whole)) * 100 + int((frac or "0").ljust(2, "0"))
    return value * 1000 if thousands else value


def parse_amount(text: str) -> int | None:
    m = NUM_RE.fullmatch(text.strip())
    return _number(m) if m else None


def normalize_category(word: str) -> str:
    word = word.strip()
    return ALIASES.get(word.lower(), word[:1].upper() + word[1:])[:30]


def label(category: str) -> str:
    return f"{EMOJI.get(category, '🏷')} {category}"


@dataclass
class Parsed:
    kind: str  # in / out / fx / balance
    amount: int = 0  # баты; для fx — полученные баты
    rub: int = 0  # для fx — отданные рубли
    category: str | None = None
    note: str = ""
    day: date | None = None
    swapped: bool = False
    cur: str | None = None  # валюта, если указана явно (₽, руб, ฿, бат); иначе — баты

    def to_tx(self) -> Tx:
        return Tx(kind=self.kind, amount=self.amount, category=self.category or "", note=self.note,
                  day=self.day, rub=self.rub, cur=self.cur or "THB")


class ParseError(ValueError):
    pass


def _extract_date(text: str, today: date) -> tuple[date, str]:
    words = text.split()
    for word, delta in (("вчера", 1), ("позавчера", 2)):
        if word in (w.lower() for w in words):
            words = [w for w in words if w.lower() != word]
            return today - timedelta(days=delta), " ".join(words)
    text = " ".join(words)
    if dm := DATE_RE.search(text):
        d, mo, y = dm.groups()
        year = today.year if not y else int(y) + (2000 if len(y) == 2 else 0)
        try:
            day = date(year, int(mo), int(d))
        except ValueError as exc:
            raise ParseError("Не понял дату. Пример: 25.09") from exc
        if not y and day > today:
            day = day.replace(year=year - 1)
        return day, (text[: dm.start()] + " " + text[dm.end():]).strip()
    return today, text


def _extract_currency(text: str) -> tuple[str | None, str]:
    """'100000₽ зп' / 'доход 100000 руб' -> ('RUB', '100000 зп')."""
    text = CURRENCY_GLUED_RE.sub(r"\1 \2", text)
    cur, words = None, []
    for word in text.split():
        bare = word.lower().rstrip(".")
        if bare in RUB_WORDS:
            cur = "RUB"
        elif bare in THB_WORDS:
            cur = "THB"
        else:
            words.append(word)
    return cur, " ".join(words)


def parse_fx(text: str) -> tuple[int, int, bool]:
    """'90000 - 30000', '90к 30к', '90 000 → 30 000' -> (рубли, баты, поменяны_ли_местами)."""
    nums = [_number(m) for m in NUM_RE.finditer(text)]
    if len(nums) < 2 or not all(nums[:2]):
        raise ParseError("Нужны две суммы: сколько рублей отдали и сколько бат получили. "
                         "Например: <code>90000 30000</code>")
    rub, thb = nums[0], nums[1]
    # Рубль дешевле бата, поэтому рублей всегда больше. Если наоборот — перепутан порядок.
    if rub < thb:
        return thb, rub, True
    return rub, thb, False


def parse_input(text: str, today: date, default_kind: str = "out") -> Parsed:
    """Понимает: -350 · 350 еда · расход 350 кафе обед · +5000 · доход 5000 зп ·
    обмен 90000 - 30000 · баланс 12000 · даты '25.09', 'вчера'."""
    day, text = _extract_date(text.strip(), today)
    cur, text = _extract_currency(text)
    first, _, rest = text.partition(" ")
    word = first.lower().rstrip(":")

    if word in FX_WORDS:
        rub, thb, swapped = parse_fx(rest)
        return Parsed("fx", amount=thb, rub=rub, day=day, swapped=swapped)

    if word in BALANCE_WORDS:
        value_text = rest.strip()
        negative = value_text[:1] in "-−"
        number_text = value_text.lstrip("-−").strip()
        m = NUM_RE.match(number_text)
        if not m:
            raise ParseError("Укажите сумму и валюту: <code>баланс 12000 б</code> или <code>баланс 150000 р</code>")
        if number_text[m.end():].strip():
            # Лишнее слово после суммы — скорее всего, неизвестное обозначение валюты. Не угадываем.
            raise ParseError("Не понял валюту. Напишите <code>баланс 12000 б</code> — баты "
                             "или <code>баланс 150000 р</code> — рубли.")
        value = _number(m)
        return Parsed("balance", amount=-value if negative else value, day=day, cur=cur or "THB")

    kind = default_kind
    if word in OUT_WORDS:
        kind, text = "out", rest
    elif word in IN_WORDS:
        kind, text = "in", rest
    text = text.strip()
    if text[:1] in "-−":
        kind, text = "out", text[1:].strip()
    elif text[:1] == "+":
        kind, text = "in", text[1:].strip()

    m = NUM_RE.match(text)
    if not m:
        raise ParseError("Не нашёл сумму. Примеры: <code>-350 еда</code>, <code>+5000 зп</code>, "
                         "<code>обмен 90000 30000</code>")
    amount = _number(m)
    if amount <= 0:
        raise ParseError("Сумма должна быть больше нуля.")
    rest = text[m.end():].strip()
    category, _, note = rest.partition(" ")
    return Parsed(kind, amount=amount, category=normalize_category(category) if category else None,
                  note=note.strip()[:200], day=day, cur=cur)


# ---------- статистика ----------

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
    fx_rub: int = 0
    fx_thb: int = 0
    income_rub: int = 0  # доходы и расходы в рублях — отдельно от батовых
    expense_rub: int = 0

    @property
    def net(self) -> int:
        return self.income - self.expense

    @property
    def rate(self) -> float | None:
        return self.fx_rub / self.fx_thb if self.fx_thb else None


def monthly_totals(txs: list[Tx], today: date, months: int = 6) -> list[MonthTotals]:
    keys = [shift_month(today.year, today.month, -i) for i in reversed(range(months))]
    totals = {k: MonthTotals(*k) for k in keys}
    for tx in txs:
        bucket = totals.get((tx.day.year, tx.day.month))
        if bucket is None:
            continue
        rub = tx.cur == "RUB"
        if tx.kind == "in":
            if rub:
                bucket.income_rub += tx.amount
            else:
                bucket.income += tx.amount
        elif tx.kind == "out":
            if rub:
                bucket.expense_rub += tx.amount
            else:
                bucket.expense += tx.amount
        elif tx.kind == "fx":
            bucket.fx_rub += tx.rub
            bucket.fx_thb += tx.amount
    return [totals[k] for k in keys]


def month_totals(txs: list[Tx], year: int, month: int) -> MonthTotals:
    """Итоги одного календарного месяца — каждый месяц считается с нуля."""
    return monthly_totals(txs, date(year, month, 1), 1)[0]


def categories(txs: list[Tx], year: int, month: int, kind: str = "out") -> list[tuple[str, int]]:
    sums: dict[str, int] = defaultdict(int)
    for tx in txs:
        if tx.kind == kind and tx.cur == "THB" and tx.day.year == year and tx.day.month == month:
            sums[tx.category] += tx.amount
    return sorted(sums.items(), key=lambda kv: kv[1], reverse=True)


def balances(txs: list[Tx]) -> tuple[int, int]:
    """Остатки за всё время (не обнуляются по месяцам): (баты, рубли).

    Расход уменьшает остаток своей валюты, доход увеличивает,
    обмен списывает рубли и добавляет баты, корректировка выравнивает остаток.
    """
    thb = rub = 0
    for tx in txs:
        if tx.kind == "fx":
            thb += tx.amount
            rub -= tx.rub
            continue
        sign = -1 if tx.kind == "out" else 1
        if tx.cur == "RUB":
            rub += sign * tx.amount
        else:
            thb += sign * tx.amount
    return thb, rub


def balance(txs: list[Tx]) -> int:
    """Остаток в батах."""
    return balances(txs)[0]


def last_rate(txs: list[Tx]) -> float | None:
    fx = [t for t in txs if t.kind == "fx" and t.amount]
    if not fx:
        return None
    last = max(fx, key=lambda t: (t.day, t.id or 0))
    return last.rub / last.amount


def frequent_categories(txs: list[Tx], kind: str, limit: int = 12) -> list[str]:
    """Сначала ваши частые категории, затем стандартные."""
    defaults = [name for _, name in (EXPENSE_CATEGORIES if kind == "out" else INCOME_CATEGORIES)]
    used = Counter(t.category for t in txs if t.kind == kind and t.category)
    ordered = [c for c, _ in used.most_common()]
    ordered += [c for c in defaults if c not in ordered]
    if "Другое" in ordered[:limit]:
        ordered.remove("Другое")
    return ordered[: limit - 1] + ["Другое"]


def pct_change(current: int | float, previous: int | float | None) -> float | None:
    if not previous:
        return None
    return (current - previous) / previous * 100


def money(value: int, currency: str = THB) -> str:
    whole, frac = divmod(abs(value), 100)
    sign = "−" if value < 0 else ""
    text = f"{whole:,}".replace(",", " ")
    if frac:
        text += f",{frac:02d}"
    return f"{sign}{text} {currency}"


def approx_rub(thb: int, rate: float) -> str:
    """Рублёвый эквивалент, округлённый до рубля: '≈ 90 000 ₽'."""
    return "≈ " + money(round(thb * rate / 100) * 100, RUB)


def fmt_rate(rate: float | None) -> str:
    return "—" if rate is None else f"{rate:.2f}".replace(".", ",") + f" {RUB}/{THB}"


def fmt_pct(value: float | None) -> str:
    if value is None:
        return "нет данных за прошлый месяц"
    arrow = "▲" if value > 0 else "▼" if value < 0 else "•"
    return f"{arrow} {value:+.1f}%".replace(".", ",").replace("-", "−")
