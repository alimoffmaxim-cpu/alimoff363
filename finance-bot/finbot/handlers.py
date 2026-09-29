import asyncio
import html
import re
from collections.abc import Awaitable, Callable
from datetime import datetime
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
)

from . import dashboard
from .config import Config
from .finance import money, parse_amount, parse_tx
from .security import Janitor
from .storage import Storage
from .vault import MIN_PIN_LENGTH, Vault

BTN_DASH = "📊 Дашборд"
BTN_HISTORY = "🧾 История"
BTN_ACCOUNTS = "🏦 Счета"
BTN_LOCK = "🔒 Заблокировать"

KEYBOARD = ReplyKeyboardMarkup(
    keyboard=[[KeyboardButton(text=BTN_DASH), KeyboardButton(text=BTN_HISTORY)],
              [KeyboardButton(text=BTN_ACCOUNTS), KeyboardButton(text=BTN_LOCK)]],
    resize_keyboard=True,
    is_persistent=True,
)

HELP = f"""<b>Как пользоваться</b>

<b>Расход:</b> <code>350 кафе обед</code> или <code>-350 кафе</code>
<b>Доход:</b> <code>+120000 зарплата</code>
Дата (по умолчанию сегодня): <code>1500 такси 25.09</code> или <code>900 такси вчера</code>
Первое слово после суммы — категория, остальное — заметка.

/dash — дашборд: доходы, расходы, динамика к прошлому месяцу
/history — последние операции
/undo — удалить последнюю операцию, /del 12 — удалить операцию №12
/acc — балансы счетов; <code>/acc Тинькофф 150000</code> — задать баланс
<code>/acc_del Тинькофф</code> — удалить счёт
/lock — заблокировать бот и стереть переписку
/changepin — сменить PIN

Сообщения с данными автоматически удаляются из чата. Бот сам блокируется после бездействия."""


class PinSetup(StatesGroup):
    first = State()
    confirm = State()


class PinUnlock(StatesGroup):
    pin = State()


class PinChange(StatesGroup):
    first = State()
    confirm = State()


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
            await event.answer("🔒 Бот заблокирован", show_alert=False)
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
            text = "🔒 Введите PIN. После разблокировки повторите команду."
        self.janitor.later(await message.answer(text))
        return None


def build_router(config: Config, storage: Storage, vault: Vault, janitor: Janitor) -> Router:
    router = Router()
    gate = LockGate(vault, janitor)
    router.message.middleware(gate)
    router.callback_query.middleware(gate)

    def today():
        return datetime.now(config.tz).date()

    async def reply(message: Message, text: str, **kwargs) -> Message:
        sent = await message.answer(text, **kwargs)
        janitor.later(message, sent)
        return sent

    # ---------- PIN ----------
    @router.message(PinSetup.first, F.text)
    @router.message(PinChange.first, F.text)
    async def pin_first(message: Message, state: FSMContext) -> None:
        pin = message.text
        await janitor.now(message)
        if await state.get_state() == PinChange.first.state and not vault.is_unlocked():
            await state.clear()
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
        else:
            if not vault.is_unlocked():
                return
            await vault.change_pin(pin)
            await reply(message, "✅ PIN изменён, все данные перешифрованы новым ключом.")

    @router.message(PinUnlock.pin, F.text)
    async def pin_unlock(message: Message, state: FSMContext) -> None:
        pin = message.text
        await janitor.now(message)
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

    # ---------- команды ----------
    @router.message(CommandStart())
    @router.message(Command("help"))
    async def cmd_help(message: Message) -> None:
        await reply(message, HELP, reply_markup=KEYBOARD)

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

    @router.message(Command("dash"))
    @router.message(F.text == BTN_DASH)
    async def cmd_dash(message: Message) -> None:
        txs = storage.list_tx(vault.cipher)
        accounts = storage.list_accounts(vault.cipher)
        total = sum(a.balance for a in accounts) if accounts else None
        png = await asyncio.to_thread(dashboard.render, txs, today(), config.currency, total)
        sent = await message.answer_photo(
            BufferedInputFile(png, filename="dashboard.png"),
            caption=dashboard.caption(txs, today(), config.currency),
        )
        janitor.later(message, sent)

    @router.message(Command("history"))
    @router.message(F.text == BTN_HISTORY)
    async def cmd_history(message: Message) -> None:
        txs = storage.list_tx(vault.cipher)
        txs.sort(key=lambda t: (t.day, t.id), reverse=True)
        if not txs:
            await reply(message, "Операций пока нет.")
            return
        lines = ["<b>Последние операции</b>"]
        for tx in txs[:20]:
            sign = "+" if tx.kind == "in" else "−"
            note = f" — {html.escape(tx.note)}" if tx.note else ""
            lines.append(f"<code>#{tx.id}</code> {tx.day:%d.%m} {sign}{money(tx.amount, config.currency)} "
                         f"· {html.escape(tx.category)}{note}")
        lines.append("\nУдалить: /del номер")
        await reply(message, "\n".join(lines))

    @router.message(Command("undo"))
    async def cmd_undo(message: Message) -> None:
        txs = storage.list_tx(vault.cipher)
        if not txs:
            await reply(message, "Нечего отменять.")
            return
        last = max(txs, key=lambda t: t.id)
        storage.delete_tx(last.id)
        await reply(message, f"🗑 Удалено: #{last.id} {money(last.amount, config.currency)} · "
                             f"{html.escape(last.category)}")

    @router.message(Command("del"))
    async def cmd_del(message: Message, command: CommandObject) -> None:
        arg = (command.args or "").strip().lstrip("#")
        if not arg.isdigit():
            await reply(message, "Укажите номер: /del 12 (номера — в /history)")
            return
        ok = storage.delete_tx(int(arg))
        await reply(message, f"🗑 Операция #{arg} удалена." if ok else "Такой операции нет.")

    @router.message(Command("acc"))
    @router.message(F.text == BTN_ACCOUNTS)
    async def cmd_acc(message: Message, command: CommandObject | None = None) -> None:
        args = (command.args or "").strip() if command else ""
        if args:
            m = re.fullmatch(r"(.+?)\s+(-?[\d ]+(?:[.,]\d{1,2})?)", args)
            amount = parse_amount(m.group(2)) if m else None
            if not m or amount is None:
                await reply(message, "Формат: <code>/acc Название 150000</code>")
                return
            if m.group(2).strip().startswith("-"):
                amount = -amount
            storage.set_account(vault.cipher, m.group(1).strip()[:40], amount)
        accounts = storage.list_accounts(vault.cipher)
        if not accounts:
            await reply(message, "Счетов пока нет. Добавьте: <code>/acc Тинькофф 150000</code>")
            return
        lines = ["<b>Счета</b>"]
        lines += [f"{html.escape(a.name)}: <b>{money(a.balance, config.currency)}</b>" for a in accounts]
        lines.append(f"\nВсего: <b>{money(sum(a.balance for a in accounts), config.currency)}</b>")
        await reply(message, "\n".join(lines))

    @router.message(Command("acc_del"))
    async def cmd_acc_del(message: Message, command: CommandObject) -> None:
        name = (command.args or "").strip()
        ok = bool(name) and storage.delete_account(vault.cipher, name)
        await reply(message, "🗑 Счёт удалён." if ok else "Укажите точное название: /acc_del Название")

    # ---------- ввод операций ----------
    @router.message(F.text)
    async def add_tx(message: Message) -> None:
        tx = parse_tx(message.text, today())
        if tx is None:
            await reply(message, "Не понял. Пример: <code>350 кафе</code> или <code>+50000 зарплата</code>. /help")
            return
        storage.add_tx(vault.cipher, tx)
        label = "Доход" if tx.kind == "in" else "Расход"
        note = f" — {html.escape(tx.note)}" if tx.note else ""
        markup = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="↩️ Отменить",
                                                                             callback_data=f"del:{tx.id}")]])
        await reply(message, f"✅ {label} {money(tx.amount, config.currency)} · {html.escape(tx.category)}"
                             f"{note} · {tx.day:%d.%m.%Y} <code>#{tx.id}</code>", reply_markup=markup)

    @router.callback_query(F.data.startswith("del:"))
    async def cb_delete(call: CallbackQuery) -> None:
        tx_id = int(call.data.split(":", 1)[1])
        ok = storage.delete_tx(tx_id)
        await call.answer("Удалено" if ok else "Уже удалено")
        if ok and call.message:
            await call.message.edit_text(f"↩️ Операция #{tx_id} отменена.")

    @router.message()
    async def other(message: Message) -> None:
        janitor.later(message)

    return router
