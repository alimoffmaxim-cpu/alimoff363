import asyncio
import html
from collections.abc import Awaitable, Callable
from dataclasses import asdict
from datetime import date, datetime
from typing import Any

from aiogram import BaseMiddleware, F, Router
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    BufferedInputFile,
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    Message,
    ReplyKeyboardMarkup,
    TelegramObject,
    WebAppInfo,
)

from . import dashboard
from .config import Config
from .finance import (
    RUB,
    THB,
    ParseError,
    approx_rub,
    fmt_pct,
    pct_change,
    Parsed,
    WALLET_CMD,
    WALLET_ICONS,
    WALLET_NAMES,
    WALLETS,
    balances,
    fmt_rate_change,
    fx_by_month,
    fx_history,
    wallet_money,
    categories,
    fmt_rate,
    frequent_categories,
    label,
    last_rate,
    money,
    MONTHS_FULL,
    MONTHS_WITH,
    month_totals,
    monthly_totals,
    shift_month,
    normalize_category,
    parse_input,
)
from .security import Janitor
from .storage import Storage, Tx
from .vault import MIN_PIN_LENGTH, Vault

BTN_OUT = "➖ Расход"
BTN_IN = "➕ Доход"
BTN_FX = "💱 Обмен"
BTN_DASH = "📊 Дашборд"
BTN_HISTORY = "🧾 История"
BTN_MONTH = "📅 Месяц"
BTN_BALANCE = "💰 Остаток"
BTN_BALANCE_OLD = "💰 Баланс"  # старая кнопка — может остаться в клавиатуре до /start
BTN_LOCK = "🔒 Заблокировать"
BUTTONS = {BTN_OUT, BTN_IN, BTN_FX, BTN_DASH, BTN_HISTORY, BTN_MONTH, BTN_BALANCE, BTN_BALANCE_OLD, BTN_LOCK}

KEYBOARD = ReplyKeyboardMarkup(
    keyboard=[
        [KeyboardButton(text=BTN_OUT), KeyboardButton(text=BTN_IN), KeyboardButton(text=BTN_FX)],
        [KeyboardButton(text=BTN_DASH), KeyboardButton(text=BTN_HISTORY), KeyboardButton(text=BTN_MONTH)],
        [KeyboardButton(text=BTN_BALANCE), KeyboardButton(text=BTN_LOCK)],
    ],
    resize_keyboard=True,
    is_persistent=True,
    input_field_placeholder="-350 еда · +5000 · обмен 90000 30000",
)

HELP = """<b>Как пользоваться</b>

Нажимайте кнопки внизу — бот сам спросит сумму и предложит категорию.
Или пишите сразу одной строкой (без значка валюты — в батах):

<b>Расход:</b> <code>-350</code> · <code>350 еда</code> · <code>расход 1200 такси</code>
<b>Доход</b> (по умолчанию в рублях): <code>+100000 зп</code> · бизнес: <code>+100000 рб</code> · в батах: <code>+5000 б</code>
<b>Обмен:</b> <code>обмен 90000 - 30000</code> — отдали ₽, получили ฿
<b>Остатки:</b> <code>баланс 12000 б</code> — баты, <code>баланс 150000 р</code> — рубли, <code>баланс 500000 рб</code> — рубли (бизнес)
(только выравнивает остаток, в доходы и расходы не попадает)

Три остатка — ฿, ₽ и 💼 ₽ (бизнес) — копятся всё время: расход уменьшает остаток
своего кошелька, доход добавляется в свой, обмен списывает ₽ (с «рб» — бизнес) и добавляет ฿.

Доходы и расходы считаются по календарным месяцам: 1-го числа счёт начинается с нуля.
«📅 Месяц» — итоги текущего месяца по категориям, стрелками можно листать прошлые.

Если категория не указана — бот покажет кнопки с категориями.
Можно указать дату: <code>-500 еда вчера</code>, <code>-900 такси 25.09</code>
Суммы можно сокращать: <code>90к</code> = 90 000.

/rates — история курса обмена: все обмены, курс, динамика по месяцам
/undo — отменить последнюю операцию, /del 12 — удалить операцию №12
/lock — заблокировать и стереть переписку · /changepin — сменить PIN
/reset — удалить все данные и начать заново

Сообщения с цифрами удаляются из чата сами. После бездействия бот блокируется."""


class PinSetup(StatesGroup):
    first = State()
    confirm = State()


class PinUnlock(StatesGroup):
    pin = State()


class PinChange(StatesGroup):
    first = State()
    confirm = State()


class Entry(StatesGroup):
    amount = State()  # ждём сумму (data: kind)
    category = State()  # ждём выбор категории (data: pending, cats)
    custom = State()  # ждём название своей категории (data: pending)
    fx = State()  # ждём две суммы обмена


PIN_STATES = {s.state for s in (PinSetup.first, PinSetup.confirm, PinUnlock.pin, PinChange.first, PinChange.confirm)}


class LockGate(BaseMiddleware):
    """Пропускает к данным только после ввода PIN."""

    def __init__(self, vault: Vault, janitor: Janitor):
        self.vault = vault
        self.janitor = janitor

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        state: FSMContext = data["state"]
        if await state.get_state() in PIN_STATES:
            return await handler(event, data)
        if self.vault.is_unlocked():
            self.vault.touch()
            return await handler(event, data)

        if isinstance(event, CallbackQuery):
            await event.answer("🔒 Бот заблокирован — введите PIN", show_alert=False)
            message = event.message
        else:
            message = event
            self.janitor.later(message)
        await self.janitor.purge()

        if not self.vault.initialized:
            await state.set_state(PinSetup.first)
            text = (f"👋 Придумайте PIN или пароль (не короче {MIN_PIN_LENGTH} символов). "
                    "Он нужен для доступа к данным и участвует в шифровании — "
                    "<b>восстановить его нельзя</b>, без него данные не расшифровать.")
        elif remaining := self.vault.lockout_remaining():
            await state.set_state(PinUnlock.pin)
            text = f"⛔ Слишком много неверных попыток. Попробуйте через {remaining // 60 + 1} мин."
        else:
            await state.set_state(PinUnlock.pin)
            text = "🔒 Введите PIN. После разблокировки повторите действие."
        self.janitor.later(await message.answer(text))
        return None


def _pending_dump(p: Parsed) -> dict:
    data = asdict(p)
    data["day"] = p.day.isoformat()
    return data


def _pending_load(data: dict) -> Parsed:
    data = dict(data)
    data["day"] = date.fromisoformat(data["day"])
    return Parsed(**data)


def build_router(config: Config, storage: Storage, vault: Vault, janitor: Janitor) -> Router:
    router = Router()
    gate = LockGate(vault, janitor)
    router.message.middleware(gate)
    router.callback_query.middleware(gate)

    last_dashboard: list[Message] = []  # последнее сообщение с кнопкой дашборда

    def today() -> date:
        return datetime.now(config.tz).date()

    async def reply(message: Message, text: str, **kwargs) -> Message:
        sent = await message.answer(text, **kwargs)
        janitor.later(message, sent)
        return sent

    RATES_BUTTON = InlineKeyboardButton(text="📈 История курса", callback_data="rates")

    def undo_markup(tx_id: int, rates: bool = False) -> InlineKeyboardMarkup:
        row = [InlineKeyboardButton(text="↩️ Отменить", callback_data=f"del:{tx_id}")]
        if rates:
            row.append(RATES_BUTTON)
        return InlineKeyboardMarkup(inline_keyboard=[row])

    def rates_report() -> str:
        history = fx_history(storage.list_tx(vault.cipher))
        if not history:
            return ("📈 Обменов пока не было.\n"
                    "Запишите обмен — бот сам посчитает курс: <code>обмен 90000 30000</code>")
        last = history[-1]
        rates = [e.rate for e in history]
        lo = min(history, key=lambda e: e.rate)
        hi = max(history, key=lambda e: e.rate)
        total_rub = sum(e.tx.rub for e in history)
        total_thb = sum(e.tx.amount for e in history)
        lines = [
            "📈 <b>Курс обмена ₽ → ฿</b> (сколько рублей за 1 бат)",
            "",
            f"Последний: <b>{fmt_rate(last.rate)}</b> ({last.tx.day:%d.%m.%Y})",
            f"Средний за всё время: {fmt_rate(total_rub / total_thb)}",
        ]
        if len(rates) > 1:
            lines.append(f"Лучший: {fmt_rate(lo.rate)} ({lo.tx.day:%d.%m.%y}) · "
                         f"худший: {fmt_rate(hi.rate)} ({hi.tx.day:%d.%m.%y})")
        months = fx_by_month(history)
        if len(months) > 1:
            lines += ["", "<b>По месяцам</b> (средний курс, взвешенный по сумме)"]
            for i, (y, mo, rate, thb_sum, n) in enumerate(months[:12]):
                older = months[i + 1][2] if i + 1 < len(months) else None
                change = f" {fmt_rate_change(pct_change(rate, older))}" if older else ""
                lines.append(f"{MONTHS_FULL[mo - 1]} {y}: <b>{fmt_rate(rate)}</b>{change} · {money(thb_sum)}, обменов: {n}")
        lines += ["", "<b>Все обмены</b> (новые сверху)"]
        for e in reversed(history[-30:]):
            biz = " 💼" if e.tx.cur == "RUBB" else ""
            change = f" {fmt_rate_change(e.change)}" if e.change is not None else ""
            lines.append(f"{e.tx.day:%d.%m.%y} · {money(e.tx.rub, RUB)}{biz} → {money(e.tx.amount)} · "
                         f"<b>{fmt_rate(e.rate)}</b>{change}")
        if len(history) > 30:
            lines.append(f"…и ещё {len(history) - 30} раньше")
        lines += ["", "<i>▲ — бат подорожал (за 1 ฿ отдали больше рублей), ▼ — подешевел. 💼 — рубли бизнеса.</i>"]
        return "\n".join(lines)

    def balances_line(txs: list[Tx]) -> str:
        bal = balances(txs)
        line = "💰 Остаток: " + " · ".join(f"<b>{wallet_money(bal[w], w)}</b>" for w in WALLETS)
        for w in WALLETS:
            if bal[w] < 0:
                line += (f"\n⚠️ {WALLET_NAMES[w]}: остаток ушёл в минус — задайте реальный: "
                         f"<code>баланс 10000 {WALLET_CMD[w]}</code>")
        return line

    def income_text(m) -> str:
        """Доходы месяца: основные — в рублях (личные + бизнес), баты — только если были."""
        text = money(m.income_rub_total, RUB)
        if m.income_rubb:
            text += f" (из них 💼 {money(m.income_rubb, RUB)})"
        if m.income:
            text += f" + {money(m.income)}"
        return text

    def net_text(m, rate: float | None) -> str | None:
        """Итог месяца в рублях: батовые суммы по курсу обмена."""
        view = m.in_rubles(rate)
        if view is None:
            return None
        net = view[0] - view[1]
        return f"{'+' if net > 0 else ''}{money(net, RUB)}" + (f" (по курсу {fmt_rate(rate)})" if rate and m.expense else "")

    def describe(tx: Tx) -> str:
        note = f" · {html.escape(tx.note)}" if tx.note else ""
        day = "" if tx.day == today() else f" · {tx.day:%d.%m}"
        if tx.kind == "fx":
            return (f"💱 Обмен: {wallet_money(tx.rub, 'RUBB' if tx.cur == 'RUBB' else 'RUB')} → <b>{money(tx.amount)}</b>, "
                    f"курс {fmt_rate(tx.rub / tx.amount)}{day}")
        if tx.kind == "adj":
            return f"⚖️ Корректировка остатка {'+' if tx.amount > 0 else ''}{wallet_money(tx.amount, tx.cur)}{day}"
        sign = "+" if tx.kind == "in" else "−"
        return f"{sign}{wallet_money(tx.amount, tx.cur)} · {label(html.escape(tx.category))}{note}{day}"

    def save(parsed: Parsed) -> tuple[str, InlineKeyboardMarkup]:
        """Сохраняет операцию и возвращает подтверждение с кнопкой отмены."""
        tx = parsed.to_tx()
        storage.add_tx(vault.cipher, tx)
        text = "✅ " + describe(tx)
        txs = storage.list_tx(vault.cipher)
        if tx.kind == "fx" and parsed.swapped:
            text += "\n(суммы поменял местами: рублей при обмене всегда больше, чем бат)"
        if tx.kind == "fx":
            history = fx_history(txs)
            idx = next(i for i, e in enumerate(history) if e.tx.id == tx.id)
            entry = history[idx]
            prev_rate = history[idx - 1].rate if idx > 0 else None
            if prev_rate:
                trend = "бат подорожал" if entry.change > 0.05 else "бат подешевел" if entry.change < -0.05 else "курс тот же"
                text += (f"\n📈 К прошлому обмену ({fmt_rate(prev_rate)}): "
                         f"{fmt_rate_change(entry.change)} — {trend}")
            else:
                text += "\n📈 Первый обмен — с него начнётся история курса"
        m = month_totals(txs, tx.day.year, tx.day.month)
        name = MONTHS_FULL[tx.day.month - 1]
        text += f"\n\n📅 <b>{name}</b>: расходы {money(m.expense)} · доходы {income_text(m)}"
        if m.expense_rub or m.expense_rubb:
            text += f"\n     расходы в рублях: {money(m.expense_rub + m.expense_rubb, RUB)}"
        if tx.kind == "out" and tx.cur == "THB":
            spent = dict(categories(txs, tx.day.year, tx.day.month)).get(tx.category, 0)
            text += f"\n{label(html.escape(tx.category))} за {name.lower()}: {money(spent)}"
        if tx.kind == "fx":
            text += f"\n💱 Обменяно за {name.lower()}: {money(m.fx_thb)} (курс {fmt_rate(m.rate)})"
        text += "\n" + balances_line(txs)
        return text, undo_markup(tx.id, rates=tx.kind == "fx")

    def category_markup(cats: list[str]) -> InlineKeyboardMarkup:
        buttons = [InlineKeyboardButton(text=label(c), callback_data=f"cat:{i}") for i, c in enumerate(cats)]
        rows = [buttons[i:i + 3] for i in range(0, len(buttons), 3)]
        rows.append([InlineKeyboardButton(text="✏️ Своя категория", callback_data="cat:custom"),
                     InlineKeyboardButton(text="✖️ Отмена", callback_data="cancel")])
        return InlineKeyboardMarkup(inline_keyboard=rows)

    async def handle_parsed(message: Message, state: FSMContext, parsed: Parsed) -> None:
        if parsed.kind == "balance":
            await state.clear()
            cur = parsed.cur or "THB"
            current = balances(storage.list_tx(vault.cipher))[cur]
            delta = parsed.amount - current
            if delta == 0:
                await reply(message, f"💰 {WALLET_NAMES[cur]}: остаток уже {wallet_money(current, cur)}, менять не нужно.")
                return
            tx = Tx(kind="adj", amount=delta, category="Корректировка", note="", day=parsed.day, cur=cur)
            storage.add_tx(vault.cipher, tx)
            await reply(message, f"✅ {WALLET_NAMES[cur]}: остаток <b>{wallet_money(parsed.amount, cur)}</b> "
                                 f"(корректировка {'+' if delta > 0 else ''}{wallet_money(delta, cur)}; в доходы не идёт)\n"
                                 + balances_line(storage.list_tx(vault.cipher)),
                        reply_markup=undo_markup(tx.id))
            return
        if parsed.kind in ("in", "out") and not parsed.category:
            cats = frequent_categories(storage.list_tx(vault.cipher), parsed.kind)
            await state.set_state(Entry.category)
            await state.update_data(pending=_pending_dump(parsed), cats=cats)
            what = "Расход" if parsed.kind == "out" else "Доход"
            await reply(message, f"{what} <b>{wallet_money(parsed.amount, parsed.wallet)}</b> — выберите категорию:",
                        reply_markup=category_markup(cats))
            return
        await state.clear()
        text, markup = save(parsed)
        await reply(message, text, reply_markup=markup)

    # ---------- PIN ----------
    @router.message(PinSetup.first, F.text)
    @router.message(PinChange.first, F.text)
    async def pin_first(message: Message, state: FSMContext) -> None:
        pin = message.text
        await janitor.now(message)
        if await state.get_state() == PinChange.first.state and not vault.is_unlocked():
            await state.clear()
            return
        if pin in BUTTONS:
            await reply(message, "Сначала придумайте PIN — напишите его сообщением.")
            return
        if len(pin) < MIN_PIN_LENGTH:
            await reply(message, f"Слишком коротко: нужно минимум {MIN_PIN_LENGTH} символов. Введите ещё раз.")
            return
        await state.update_data(pin=pin)
        nxt = PinSetup.confirm if await state.get_state() == PinSetup.first.state else PinChange.confirm
        await state.set_state(nxt)
        await reply(message, "Повторите PIN.")

    @router.message(PinSetup.confirm, F.text)
    @router.message(PinChange.confirm, F.text)
    async def pin_confirm(message: Message, state: FSMContext) -> None:
        pin = message.text
        await janitor.now(message)
        current = await state.get_state()
        first = (await state.get_data()).get("pin")
        await state.clear()
        if pin != first:
            await state.set_state(PinSetup.first if current == PinSetup.confirm.state else PinChange.first)
            await reply(message, "PIN не совпал. Введите новый PIN заново.")
            return
        if current == PinSetup.confirm.state:
            await vault.setup(pin)
            await reply(message, "✅ PIN установлен, данные зашифрованы.\n\n" + HELP, reply_markup=KEYBOARD)
        elif vault.is_unlocked():
            await vault.change_pin(pin)
            await reply(message, "✅ PIN изменён, все данные перешифрованы новым ключом.")

    @router.message(PinUnlock.pin, F.text)
    async def pin_unlock(message: Message, state: FSMContext) -> None:
        pin = message.text
        await janitor.now(message)
        if pin in BUTTONS or pin.startswith("/"):
            # Нажатие кнопки — не попытка ввода PIN, не тратим попытки.
            await reply(message, "🔒 Сначала введите PIN.")
            return
        if remaining := vault.lockout_remaining():
            await reply(message, f"⛔ Слишком много неверных попыток. Попробуйте через {remaining // 60 + 1} мин.")
            return
        if await vault.unlock(pin):
            await state.clear()
            await reply(message, "🔓 Разблокировано.", reply_markup=KEYBOARD)
        elif vault.lockout_remaining():
            await reply(message, "⛔ Неверный PIN. Ввод заблокирован на время.")
        else:
            await reply(message, f"❌ Неверный PIN. Осталось попыток: {vault.attempts_left()}.")

    @router.message(PinSetup.first)
    @router.message(PinSetup.confirm)
    @router.message(PinUnlock.pin)
    @router.message(PinChange.first)
    @router.message(PinChange.confirm)
    async def pin_not_text(message: Message) -> None:
        await janitor.now(message)

    # ---------- команды и кнопки меню (работают из любого шага) ----------
    @router.message(CommandStart())
    @router.message(Command("help"))
    async def cmd_help(message: Message, state: FSMContext) -> None:
        await state.clear()
        await reply(message, HELP, reply_markup=KEYBOARD)

    @router.message(Command("cancel"))
    async def cmd_cancel(message: Message, state: FSMContext) -> None:
        await state.clear()
        await reply(message, "Отменено.", reply_markup=KEYBOARD)

    @router.message(Command("lock"))
    @router.message(F.text == BTN_LOCK)
    async def cmd_lock(message: Message, state: FSMContext) -> None:
        vault.lock()
        await state.clear()
        janitor.later(message)
        await janitor.purge()
        sent = await message.answer("🔒 Заблокировано, переписка очищена.")
        janitor.later(sent, delay=10)

    @router.message(Command("changepin"))
    async def cmd_changepin(message: Message, state: FSMContext) -> None:
        await state.set_state(PinChange.first)
        await reply(message, f"Введите новый PIN (не короче {MIN_PIN_LENGTH} символов).")

    @router.message(F.text == BTN_OUT)
    async def btn_expense(message: Message, state: FSMContext) -> None:
        await state.set_state(Entry.amount)
        await state.update_data(kind="out", cur="THB")
        await reply(message, "Сумма расхода в батах? Например, <code>350</code> или сразу <code>350 еда обед</code>\n"
                             "Расход в рублях — добавьте р: <code>990 р подписка</code>, бизнес — рб: <code>5000 рб реклама</code>")

    @router.message(F.text == BTN_IN)
    async def btn_income(message: Message, state: FSMContext) -> None:
        # Основной доход — в рублях: сразу спрашиваем сумму, другие кошельки — кнопками ниже.
        await state.set_state(Entry.amount)
        await state.update_data(kind="in", cur="RUB")
        await reply(message, income_prompt("RUB"), reply_markup=income_markup("RUB"))

    def income_prompt(cur: str) -> str:
        return (f"➕ Доход — {WALLET_ICONS[cur]} <b>{WALLET_NAMES[cur].lower()}</b>. Сумма? "
                "Например, <code>100000</code> или сразу <code>100000 зп</code>")

    def income_markup(cur: str) -> InlineKeyboardMarkup:
        options = {"RUB": "₽ В рубли", "RUBB": "💼 В бизнес", "THB": "฿ В баты"}
        return InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text=text, callback_data=f"income:{w}") for w, text in options.items() if w != cur]])

    @router.callback_query(F.data.startswith("income:"))
    async def cb_income_currency(call: CallbackQuery, state: FSMContext) -> None:
        cur = call.data.split(":", 1)[1]
        if cur not in WALLETS:
            await call.answer()
            return
        await state.set_state(Entry.amount)
        await state.update_data(kind="in", cur=cur)
        await call.answer()
        await call.message.edit_text(income_prompt(cur), reply_markup=income_markup(cur))

    @router.message(F.text == BTN_FX)
    async def btn_fx(message: Message, state: FSMContext) -> None:
        await state.set_state(Entry.fx)
        rate = last_rate(storage.list_tx(vault.cipher))
        hint = f"\nПрошлый курс: {fmt_rate(rate)}" if rate else ""
        await reply(message, "💱 Сколько <b>рублей</b> отдали и сколько <b>бат</b> получили?\n"
                             f"Например: <code>90000 30000</code> или <code>90к 30к</code>\n"
                             f"Рубли с бизнес-кошелька — добавьте рб: <code>90000 30000 рб</code>\n"
                             f"Курс бот посчитает сам.{hint}",
                    reply_markup=InlineKeyboardMarkup(inline_keyboard=[[RATES_BUTTON]]))

    @router.message(Command("rates"))
    @router.message(Command("kurs"))
    async def cmd_rates(message: Message, state: FSMContext) -> None:
        await state.clear()
        await reply(message, rates_report())

    @router.callback_query(F.data == "rates")
    async def cb_rates(call: CallbackQuery, state: FSMContext) -> None:
        await state.clear()
        await call.answer()
        sent = await call.message.answer(rates_report())
        janitor.later(sent)

    @router.message(Command("dash"))
    @router.message(F.text == BTN_DASH)
    async def cmd_dash(message: Message, state: FSMContext) -> None:
        await state.clear()
        txs = storage.list_tx(vault.cipher)
        if config.webapp_url:
            now = datetime.now(config.tz)
            # Данные идут во фрагменте ссылки (после #): браузер не отправляет его на сервер.
            # ?v=<время> — только чтобы Telegram не показывал закэшированную старую версию страницы.
            url = f"{config.webapp_url}?v={int(now.timestamp())}#d.{dashboard.webapp_payload(txs, now)}"
            markup = InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(text="📊 Открыть дашборд", web_app=WebAppInfo(url=url))]])
            # Старое сообщение с дашбордом удаляем, чтобы случайно не открыть устаревший снимок.
            if last_dashboard:
                await janitor.now(last_dashboard.pop())
            sent = await reply(message, dashboard.caption(txs, today()) + f"\n\n<i>Снимок на {now:%H:%M}</i>",
                               reply_markup=markup)
            last_dashboard.append(sent)
            return
        png = await asyncio.to_thread(dashboard.render, txs, today())
        sent = await message.answer_photo(BufferedInputFile(png, filename="dashboard.png"),
                                          caption=dashboard.caption(txs, today()))
        janitor.later(message, sent)

    @router.message(Command("dash_png"))
    async def cmd_dash_png(message: Message) -> None:
        txs = storage.list_tx(vault.cipher)
        png = await asyncio.to_thread(dashboard.render, txs, today())
        sent = await message.answer_photo(BufferedInputFile(png, filename="dashboard.png"),
                                          caption=dashboard.caption(txs, today()))
        janitor.later(message, sent)

    def month_report(year: int, month: int) -> tuple[str, InlineKeyboardMarkup]:
        txs = storage.list_tx(vault.cipher)
        m = month_totals(txs, year, month)
        py, pm = shift_month(year, month, -1)
        prev = month_totals(txs, py, pm)
        name = MONTHS_FULL[month - 1]

        def change(cur: int, old: int) -> str:
            pct = pct_change(cur, old)
            return "" if pct is None else f" ({fmt_pct(pct)})"

        lines = [f"📅 <b>{name} {year}</b>", ""]
        lines.append(f"➖ Расходы: <b>{money(m.expense)}</b>{change(m.expense, prev.expense)}")
        rate = m.rate or last_rate(txs)
        if rate and m.expense:
            lines.append(f"     {approx_rub(m.expense, rate)}")
        if m.expense_rub or m.expense_rubb:
            lines.append(f"     и в рублях: {money(m.expense_rub + m.expense_rubb, RUB)}")
        lines.append(f"➕ Доходы: <b>{income_text(m)}</b>{change(m.income_rub_total, prev.income_rub_total)}")
        if net := net_text(m, rate):
            lines.append(f"📈 Итог месяца: <b>{net}</b>")
        if m.fx_thb:
            lines.append(f"💱 Обмен: {money(m.fx_rub, RUB)} → {money(m.fx_thb)} ({fmt_rate(m.rate)})")
        cats = categories(txs, year, month)
        if cats:
            lines += ["", "<b>Расходы по категориям</b>"]
            for cat, amount in cats[:12]:
                share = round(amount / m.expense * 100) if m.expense else 0
                lines.append(f"{label(html.escape(cat))}: {money(amount)} · {share}%")
        if (prev.income_rub_total or prev.expense) and not (m.income_rub_total or m.income or m.expense):
            lines += ["", "В этом месяце операций пока нет — счёт начат с нуля."]
        if prev.income_rub_total or prev.expense:
            lines += ["", f"<i>В скобках — изменение по сравнению с {MONTHS_WITH[pm - 1]}.</i>"]
        lines += ["", balances_line(txs) + " <i>(копится, не обнуляется)</i>"]

        ny, nm = shift_month(year, month, 1)
        nav = [InlineKeyboardButton(text=f"◀ {MONTHS_FULL[pm - 1]}", callback_data=f"month:{py}-{pm}")]
        if (ny, nm) <= (today().year, today().month):
            nav.append(InlineKeyboardButton(text=f"{MONTHS_FULL[nm - 1]} ▶", callback_data=f"month:{ny}-{nm}"))
        return "\n".join(lines), InlineKeyboardMarkup(inline_keyboard=[nav])

    @router.message(Command("month"))
    @router.message(F.text == BTN_MONTH)
    async def cmd_month(message: Message, state: FSMContext) -> None:
        await state.clear()
        text, markup = month_report(today().year, today().month)
        await reply(message, text, reply_markup=markup)

    @router.message(Command("balance"))
    @router.message(F.text == BTN_BALANCE)
    @router.message(F.text == BTN_BALANCE_OLD)
    async def cmd_balance(message: Message, state: FSMContext) -> None:
        await state.clear()
        txs = storage.list_tx(vault.cipher)
        bal = balances(txs)
        rate = last_rate(txs)
        lines = ["💰 <b>Остатки</b> — копятся всё время, со сменой месяца не обнуляются", ""]
        for w in WALLETS:
            extra = f"  ({approx_rub(bal[w], rate)})" if w == "THB" and rate and bal[w] else ""
            lines.append(f"{WALLET_ICONS[w]} {WALLET_NAMES[w]}: <b>{money(bal[w], THB if w == 'THB' else RUB)}</b>{extra}")
        if rate:
            lines.append(f"Последний курс обмена: {fmt_rate(rate)}")
        lines += [
            "",
            "Расход уменьшает остаток своего кошелька, доход — увеличивает. "
            "Обмен списывает рубли (личные; с «рб» — бизнес) и добавляет баты.",
            "",
            "Чтобы задать или поправить остаток, отправьте свою реальную сумму:",
            "<code>баланс 12000 б</code> — баты",
            "<code>баланс 150000 р</code> — рубли",
            "<code>баланс 500000 рб</code> — рубли (бизнес)",
            "Это только выравнивает остаток — в доходы и расходы месяца не попадает.",
        ]
        # reply_markup=KEYBOARD заодно обновит клавиатуру, если в ней осталась старая кнопка
        await reply(message, "\n".join(lines), reply_markup=KEYBOARD)

    @router.callback_query(F.data.startswith("month:"))
    async def cb_month(call: CallbackQuery) -> None:
        year, month = (int(x) for x in call.data.split(":", 1)[1].split("-"))
        text, markup = month_report(year, month)
        await call.answer()
        await call.message.edit_text(text, reply_markup=markup)

    @router.message(Command("history"))
    @router.message(F.text == BTN_HISTORY)
    async def cmd_history(message: Message, state: FSMContext) -> None:
        await state.clear()
        txs = storage.list_tx(vault.cipher)
        txs.sort(key=lambda t: (t.day, t.id), reverse=True)
        if not txs:
            await reply(message, "Операций пока нет. Нажмите «➖ Расход» или напишите <code>-350 еда</code>.")
            return
        lines = ["<b>Последние операции</b>"]
        current_day = None
        for tx in txs[:25]:
            if tx.day != current_day:
                current_day = tx.day
                lines.append(f"\n<b>{tx.day:%d.%m}</b>")
            text = describe(tx).replace(f" · {tx.day:%d.%m}", "")
            lines.append(f"<code>#{tx.id}</code> {text}")
        lines.append("\nУдалить: /del номер, последнюю — /undo · история курса обмена — /rates")
        await reply(message, "\n".join(lines), reply_markup=InlineKeyboardMarkup(inline_keyboard=[[RATES_BUTTON]]))

    @router.message(Command("undo"))
    async def cmd_undo(message: Message) -> None:
        txs = storage.list_tx(vault.cipher)
        if not txs:
            await reply(message, "Нечего отменять.")
            return
        last = max(txs, key=lambda t: t.id)
        storage.delete_tx(last.id)
        await reply(message, f"🗑 Удалено: {describe(last)}")

    @router.message(Command("del"))
    async def cmd_del(message: Message, command: CommandObject) -> None:
        arg = (command.args or "").strip().lstrip("#")
        if not arg.isdigit():
            await reply(message, "Укажите номер: /del 12 (номера — в «🧾 История»)")
            return
        ok = storage.delete_tx(int(arg))
        await reply(message, f"🗑 Операция #{arg} удалена." if ok else "Такой операции нет.")

    @router.message(Command("reset"))
    async def cmd_reset(message: Message, state: FSMContext) -> None:
        await state.clear()
        markup = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="🗑 Да, удалить всё", callback_data="reset:yes"),
            InlineKeyboardButton(text="Отмена", callback_data="cancel")]])
        await reply(message, "⚠️ Удалить <b>все</b> операции и PIN? Это необратимо. "
                             "После сброса бот попросит придумать новый PIN.", reply_markup=markup)

    # ---------- пошаговый ввод ----------
    @router.message(Entry.amount, F.text)
    async def entry_amount(message: Message, state: FSMContext) -> None:
        data = await state.get_data()
        try:
            parsed = parse_input(message.text, today(), default_kind=data.get("kind", "out"))
        except ParseError as exc:
            await reply(message, f"{exc}\nВведите сумму ещё раз или /cancel.")
            return
        if parsed.cur is None:
            parsed.cur = data.get("cur", "THB")
        await handle_parsed(message, state, parsed)

    @router.message(Entry.fx, F.text)
    async def entry_fx(message: Message, state: FSMContext) -> None:
        text = message.text
        if not text.lower().startswith("обмен"):
            text = "обмен " + text
        try:
            parsed = parse_input(text, today())
        except ParseError as exc:
            await reply(message, f"{exc}\nИли /cancel.")
            return
        await handle_parsed(message, state, parsed)

    @router.message(Entry.custom, F.text)
    @router.message(Entry.category, F.text)
    async def entry_custom_category(message: Message, state: FSMContext) -> None:
        data = await state.get_data()
        parsed = _pending_load(data["pending"])
        parsed.category = normalize_category(message.text)
        await state.clear()
        text, markup = save(parsed)
        await reply(message, text, reply_markup=markup)

    @router.callback_query(Entry.category, F.data.startswith("cat:"))
    async def cb_category(call: CallbackQuery, state: FSMContext) -> None:
        data = await state.get_data()
        choice = call.data.split(":", 1)[1]
        if choice == "custom":
            await state.set_state(Entry.custom)
            await call.answer()
            await call.message.edit_text("Напишите название категории:")
            return
        parsed = _pending_load(data["pending"])
        parsed.category = data["cats"][int(choice)]
        await state.clear()
        text, markup = save(parsed)
        await call.answer("Сохранено")
        await call.message.edit_text(text, reply_markup=markup)

    @router.callback_query(F.data.startswith("cat:"))
    async def cb_category_stale(call: CallbackQuery) -> None:
        await call.answer("Эта операция уже неактуальна — введите заново", show_alert=True)

    @router.callback_query(F.data == "cancel")
    async def cb_cancel(call: CallbackQuery, state: FSMContext) -> None:
        await state.clear()
        await call.answer("Отменено")
        await call.message.edit_text("Отменено.")

    @router.callback_query(F.data == "reset:yes")
    async def cb_reset(call: CallbackQuery, state: FSMContext) -> None:
        await state.clear()
        vault.reset()
        await call.answer("Все данные удалены")
        await janitor.purge()
        await call.message.answer("🗑 Все данные удалены. Напишите /start, чтобы придумать новый PIN.")

    @router.callback_query(F.data.startswith("del:"))
    async def cb_delete(call: CallbackQuery) -> None:
        tx_id = int(call.data.split(":", 1)[1])
        ok = storage.delete_tx(tx_id)
        await call.answer("Отменено" if ok else "Уже удалено")
        if ok:
            await call.message.edit_text(f"↩️ Операция #{tx_id} отменена.")

    # ---------- быстрый ввод одной строкой ----------
    @router.message(F.text)
    async def quick_input(message: Message, state: FSMContext) -> None:
        try:
            parsed = parse_input(message.text, today())
        except ParseError as exc:
            await reply(message, f"{exc}\n\nИли воспользуйтесь кнопками внизу. /help — все форматы.",
                        reply_markup=KEYBOARD)
            return
        await handle_parsed(message, state, parsed)

    @router.message()
    async def other(message: Message) -> None:
        janitor.later(message)

    return router
