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
    balances,
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
BTN_BALANCE_OLD = "💰 Баланс"  # старая кнопка — может остаться в клавиатуре до /start
BTN_LOCK = "🔒 Заблокировать"
BUTTONS = {BTN_OUT, BTN_IN, BTN_FX, BTN_DASH, BTN_HISTORY, BTN_MONTH, BTN_BALANCE_OLD, BTN_LOCK}

KEYBOARD = ReplyKeyboardMarkup(
    keyboard=[
        [KeyboardButton(text=BTN_OUT), KeyboardButton(text=BTN_IN), KeyboardButton(text=BTN_FX)],
        [KeyboardButton(text=BTN_DASH), KeyboardButton(text=BTN_HISTORY), KeyboardButton(text=BTN_MONTH)],
        [KeyboardButton(text=BTN_LOCK)],
    ],
    resize_keyboard=True,
    is_persistent=True,
    input_field_placeholder="-350 еда · +5000 · обмен 90000 30000",
)

HELP = """<b>Как пользоваться</b>

Нажимайте кнопки внизу — бот сам спросит сумму и предложит категорию.
Или пишите сразу одной строкой (без значка валюты — в батах):

<b>Расход:</b> <code>-350</code> · <code>350 еда</code> · <code>расход 1200 такси</code>
<b>Доход:</b> <code>+50000</code> · <code>доход 50000 зп</code> · в рублях: <code>+100000₽ зп</code>
<b>Обмен:</b> <code>обмен 90000 - 30000</code> — отдали ₽, получили ฿
<b>Остатки:</b> <code>баланс 12000</code> — баты, <code>баланс 150000 ₽</code> — рубли

Два остатка, ฿ и ₽, копятся всё время: расход в батах уменьшает ฿,
обмен списывает ₽ и добавляет ฿, доход добавляется в своей валюте.

Доходы и расходы считаются по календарным месяцам: 1-го числа счёт начинается с нуля.
«📅 Месяц» — итоги текущего месяца по категориям, стрелками можно листать прошлые.

Если категория не указана — бот покажет кнопки с категориями.
Можно указать дату: <code>-500 еда вчера</code>, <code>-900 такси 25.09</code>
Суммы можно сокращать: <code>90к</code> = 90 000.

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

    def today() -> date:
        return datetime.now(config.tz).date()

    async def reply(message: Message, text: str, **kwargs) -> Message:
        sent = await message.answer(text, **kwargs)
        janitor.later(message, sent)
        return sent

    def undo_markup(tx_id: int) -> InlineKeyboardMarkup:
        return InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="↩️ Отменить", callback_data=f"del:{tx_id}")]])

    def cur_sign(tx: Tx) -> str:
        return RUB if tx.cur == "RUB" else THB

    def balances_line(txs: list[Tx]) -> str:
        thb, rub = balances(txs)
        return f"💰 Остаток: <b>{money(thb)}</b> · <b>{money(rub, RUB)}</b>"

    def describe(tx: Tx) -> str:
        note = f" · {html.escape(tx.note)}" if tx.note else ""
        day = "" if tx.day == today() else f" · {tx.day:%d.%m}"
        if tx.kind == "fx":
            return (f"💱 Обмен: {money(tx.rub, RUB)} → <b>{money(tx.amount)}</b>, "
                    f"курс {fmt_rate(tx.rub / tx.amount)}{day}")
        if tx.kind == "adj":
            return f"⚖️ Корректировка остатка {'+' if tx.amount > 0 else ''}{money(tx.amount, cur_sign(tx))}{day}"
        sign = "+" if tx.kind == "in" else "−"
        return f"{sign}{money(tx.amount, cur_sign(tx))} · {label(html.escape(tx.category))}{note}{day}"

    def save(parsed: Parsed) -> tuple[str, InlineKeyboardMarkup]:
        """Сохраняет операцию и возвращает подтверждение с кнопкой отмены."""
        tx = parsed.to_tx()
        storage.add_tx(vault.cipher, tx)
        text = "✅ " + describe(tx)
        txs = storage.list_tx(vault.cipher)
        if tx.kind == "fx" and parsed.swapped:
            text += "\n(суммы поменял местами: рублей при обмене всегда больше, чем бат)"
        m = month_totals(txs, tx.day.year, tx.day.month)
        name = MONTHS_FULL[tx.day.month - 1]
        text += f"\n\n📅 <b>{name}</b>: расходы {money(m.expense)} · доходы {money(m.income)}"
        if m.income_rub or m.expense_rub:
            text += f"\n     в рублях: расходы {money(m.expense_rub, RUB)} · доходы {money(m.income_rub, RUB)}"
        if tx.kind == "out" and tx.cur == "THB":
            spent = dict(categories(txs, tx.day.year, tx.day.month)).get(tx.category, 0)
            text += f"\n{label(html.escape(tx.category))} за {name.lower()}: {money(spent)}"
        if tx.kind == "fx":
            text += f"\n💱 Обменяно за {name.lower()}: {money(m.fx_thb)} (курс {fmt_rate(m.rate)})"
        text += "\n" + balances_line(txs)
        return text, undo_markup(tx.id)

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
            sign = RUB if cur == "RUB" else THB
            thb, rub = balances(storage.list_tx(vault.cipher))
            current = rub if cur == "RUB" else thb
            delta = parsed.amount - current
            if delta == 0:
                await reply(message, f"💰 Остаток уже {money(current, sign)}, ничего менять не нужно.")
                return
            tx = Tx(kind="adj", amount=delta, category="Корректировка", note="", day=parsed.day, cur=cur)
            storage.add_tx(vault.cipher, tx)
            await reply(message, f"✅ Остаток в {'рублях' if cur == 'RUB' else 'батах'}: <b>{money(parsed.amount, sign)}</b> "
                                 f"(корректировка {'+' if delta > 0 else ''}{money(delta, sign)})\n"
                                 + balances_line(storage.list_tx(vault.cipher)),
                        reply_markup=undo_markup(tx.id))
            return
        if parsed.kind in ("in", "out") and not parsed.category:
            cats = frequent_categories(storage.list_tx(vault.cipher), parsed.kind)
            await state.set_state(Entry.category)
            await state.update_data(pending=_pending_dump(parsed), cats=cats)
            what = "Расход" if parsed.kind == "out" else "Доход"
            sign = RUB if parsed.cur == "RUB" else THB
            await reply(message, f"{what} <b>{money(parsed.amount, sign)}</b> — выберите категорию:",
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
                             "Расход в рублях — добавьте ₽: <code>990₽ подписка</code>")

    @router.message(F.text == BTN_IN)
    async def btn_income(message: Message, state: FSMContext) -> None:
        await state.clear()
        markup = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="฿ В батах", callback_data="income:THB"),
            InlineKeyboardButton(text="₽ В рублях", callback_data="income:RUB")]])
        await reply(message, "➕ В какой валюте доход?", reply_markup=markup)

    @router.callback_query(F.data.startswith("income:"))
    async def cb_income_currency(call: CallbackQuery, state: FSMContext) -> None:
        cur = call.data.split(":", 1)[1]
        await state.set_state(Entry.amount)
        await state.update_data(kind="in", cur=cur)
        await call.answer()
        where = "рублях" if cur == "RUB" else "батах"
        await call.message.edit_text(f"Сумма дохода в {where}? Например, <code>50000</code> или сразу <code>50000 зп</code>")

    @router.message(F.text == BTN_FX)
    async def btn_fx(message: Message, state: FSMContext) -> None:
        await state.set_state(Entry.fx)
        rate = last_rate(storage.list_tx(vault.cipher))
        hint = f"\nПрошлый курс: {fmt_rate(rate)}" if rate else ""
        await reply(message, "💱 Сколько <b>рублей</b> отдали и сколько <b>бат</b> получили?\n"
                             f"Например: <code>90000 30000</code> или <code>90к 30к</code>{hint}")

    @router.message(Command("dash"))
    @router.message(F.text == BTN_DASH)
    async def cmd_dash(message: Message, state: FSMContext) -> None:
        await state.clear()
        txs = storage.list_tx(vault.cipher)
        if config.webapp_url:
            # Данные идут во фрагменте ссылки (после #): браузер не отправляет его на сервер.
            url = f"{config.webapp_url}#d.{dashboard.webapp_payload(txs, datetime.now(config.tz))}"
            markup = InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(text="📊 Открыть дашборд", web_app=WebAppInfo(url=url))]])
            await reply(message, dashboard.caption(txs, today()), reply_markup=markup)
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
        lines.append(f"➕ Доходы: <b>{money(m.income)}</b>{change(m.income, prev.income)}")
        lines.append(f"📈 Итог месяца: <b>{money(m.net)}</b>")
        if m.income_rub or m.expense_rub:
            lines.append(f"₽ В рублях: доходы {money(m.income_rub, RUB)} · расходы {money(m.expense_rub, RUB)}")
        if m.fx_thb:
            lines.append(f"💱 Обмен: {money(m.fx_rub, RUB)} → {money(m.fx_thb)} ({fmt_rate(m.rate)})")
        cats = categories(txs, year, month)
        if cats:
            lines += ["", "<b>Расходы по категориям</b>"]
            for cat, amount in cats[:12]:
                share = round(amount / m.expense * 100) if m.expense else 0
                lines.append(f"{label(html.escape(cat))}: {money(amount)} · {share}%")
        if (prev.income or prev.expense) and not (m.income or m.expense):
            lines += ["", "В этом месяце операций пока нет — счёт начат с нуля."]
        if prev.income or prev.expense:
            lines += ["", f"<i>В скобках — изменение по сравнению с {MONTHS_WITH[pm - 1]}.</i>"]
        lines += ["", balances_line(txs) + " <i>(копится, не обнуляется)</i>"]

        ny, nm = shift_month(year, month, 1)
        nav = [InlineKeyboardButton(text=f"◀ {MONTHS_FULL[pm - 1]}", callback_data=f"month:{py}-{pm}")]
        if (ny, nm) <= (today().year, today().month):
            nav.append(InlineKeyboardButton(text=f"{MONTHS_FULL[nm - 1]} ▶", callback_data=f"month:{ny}-{nm}"))
        return "\n".join(lines), InlineKeyboardMarkup(inline_keyboard=[nav])

    @router.message(Command("month"))
    @router.message(Command("balance"))
    @router.message(F.text == BTN_MONTH)
    @router.message(F.text == BTN_BALANCE_OLD)
    async def cmd_month(message: Message, state: FSMContext) -> None:
        await state.clear()
        text, markup = month_report(today().year, today().month)
        # Заодно обновляем клавиатуру, если у пользователя осталась старая кнопка.
        if message.text == BTN_BALANCE_OLD:
            await reply(message, "Кнопка «💰 Баланс» теперь называется «📅 Месяц».", reply_markup=KEYBOARD)
        await reply(message, text, reply_markup=markup)

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
        lines.append("\nУдалить: /del номер, последнюю — /undo")
        await reply(message, "\n".join(lines))

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
