"""Дашборд: данные для мини-аппа и запасной вариант картинкой (рисуется в память, не на диск)."""
import base64
import io
import json
from datetime import date, datetime

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

from .finance import (  # noqa: E402
    MONTHS_FULL, MONTHS_WITH, RUB, approx_rub, balances, categories, wallet_money, fmt_pct, fmt_rate, last_rate, money, month_label, monthly_totals,
    pct_change,
)
from .storage import Tx  # noqa: E402

SURFACE = "#fcfcfb"
TEXT = "#0b0b0b"
TEXT_2 = "#52514e"
GRID = "#e4e3df"
INCOME = "#2a78d6"  # категориальный слот 1
EXPENSE = "#eb6834"  # категориальный слот 2 (проверенная CVD-безопасная пара)


def _rub(kopecks: int) -> float:
    return kopecks / 100


def _short(value: float) -> str:
    if value >= 1_000_000:
        return f"{value / 1_000_000:.1f} млн".replace(".", ",")
    if value >= 1_000:
        return f"{value / 1_000:.0f}к"
    return f"{value:.0f}"


def render(txs: list[Tx], today: date) -> bytes:
    months = monthly_totals(txs, today, 6)
    cur, prev = months[-1], months[-2]
    cats = categories(txs, cur.year, cur.month)[:7]

    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 11, "text.color": TEXT})
    fig = plt.figure(figsize=(10, 10.5), facecolor=SURFACE)
    grid = fig.add_gridspec(3, 4, height_ratios=[0.9, 2.2, 2.0], hspace=0.55, wspace=0.3)

    fig.text(0.06, 0.965, f"Финансы · {MONTHS_FULL[cur.month - 1]} {cur.year}", fontsize=18, weight="bold")
    fig.text(0.06, 0.94, f"на {today:%d.%m.%Y} · сравнение с {month_label(prev.year, prev.month)}",
             fontsize=10, color=TEXT_2)

    wallets = balances(txs)
    bal = wallets["THB"]
    rate = last_rate(txs)
    tiles = [
        ("Доходы", money(cur.income), fmt_pct(pct_change(cur.income, prev.income))),
        ("Расходы", money(cur.expense), fmt_pct(pct_change(cur.expense, prev.expense))),
        ("Обмен ₽→฿", money(cur.fx_thb), f"курс {fmt_rate(cur.rate)}" if cur.rate else "в этом месяце не было"),
        ("Остаток ฿", money(bal), f"₽ {money(wallets['RUB'], RUB)} · бизнес {money(wallets['RUBB'], RUB)}"),
    ]
    for i, (title, value, sub) in enumerate(tiles):
        ax = fig.add_subplot(grid[0, i])
        ax.axis("off")
        ax.text(0, 0.85, title, fontsize=10, color=TEXT_2, transform=ax.transAxes)
        ax.text(0, 0.45, value, fontsize=14, weight="bold", transform=ax.transAxes)
        ax.text(0, 0.1, sub.replace("нет данных за прошлый месяц", "нет данных"), fontsize=9,
                color=TEXT_2, transform=ax.transAxes)

    # Динамика: доходы и расходы по месяцам
    ax = fig.add_subplot(grid[1, :])
    x = range(len(months))
    width = 0.36
    inc = [_rub(m.income) for m in months]
    exp = [_rub(m.expense) for m in months]
    ax.bar([i - width / 2 - 0.01 for i in x], inc, width, color=INCOME, label="Доходы")
    ax.bar([i + width / 2 + 0.01 for i in x], exp, width, color=EXPENSE, label="Расходы")
    top = max(inc + exp + [1])
    for i in x:
        for dx, v in ((-width / 2, inc[i]), (width / 2, exp[i])):
            if v:
                ax.text(i + dx, v + top * 0.015, _short(v), ha="center", va="bottom", fontsize=8, color=TEXT_2)
    ax.set_xticks(list(x), [month_label(m.year, m.month) for m in months])
    ax.set_ylim(0, top * 1.15)
    ax.yaxis.set_major_formatter(lambda v, _: _short(v))
    ax.set_title("Доходы и расходы за 6 месяцев, ฿", loc="left", fontsize=12, weight="bold", pad=30)
    ax.legend(loc="lower left", frameon=False, ncols=2, bbox_to_anchor=(-0.01, 1.0), borderaxespad=0.2)
    _style(ax)
    ax.grid(axis="y", color=GRID, linewidth=0.8)

    # Структура расходов текущего месяца
    ax = fig.add_subplot(grid[2, :])
    ax.set_title("Куда ушли деньги в этом месяце, ฿", loc="left", fontsize=12, weight="bold", pad=12)
    if cats:
        names = [c for c, _ in cats][::-1]
        values = [_rub(v) for _, v in cats][::-1]
        ax.barh(names, values, color=EXPENSE, height=0.6)
        total = sum(_rub(v) for _, v in categories(txs, cur.year, cur.month))
        for i, v in enumerate(values):
            ax.text(v, i, f"  {_short(v)} · {v / total * 100:.0f}%", va="center", fontsize=9, color=TEXT_2)
        ax.set_xlim(0, max(values) * 1.3)
        ax.xaxis.set_visible(False)
        _style(ax)
        ax.spines["bottom"].set_visible(False)
    else:
        ax.axis("off")
        ax.text(0, 0.5, "Расходов в этом месяце пока нет", color=TEXT_2, transform=ax.transAxes)

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=110, facecolor=SURFACE, bbox_inches="tight", pad_inches=0.3)
    plt.close(fig)
    return buf.getvalue()


def _style(ax) -> None:
    ax.set_facecolor(SURFACE)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(GRID)
    ax.tick_params(colors=TEXT_2, length=0)
    ax.set_axisbelow(True)


def caption(txs: list[Tx], today: date) -> str:
    prev, cur = monthly_totals(txs, today, 2)
    lines = [
        f"<b>{MONTHS_FULL[cur.month - 1]}</b> в сравнении с {MONTHS_WITH[prev.month - 1]}",
        f"➕ Доходы: <b>{money(cur.income)}</b> ({fmt_pct(pct_change(cur.income, prev.income))})",
        f"➖ Расходы: <b>{money(cur.expense)}</b> ({fmt_pct(pct_change(cur.expense, prev.expense))})",
    ]
    rate = cur.rate or last_rate(txs)
    if rate and cur.expense:
        lines.append(f"     {approx_rub(cur.expense, rate)} по курсу {fmt_rate(rate)}")
    lines.append(f"📈 Итог месяца: <b>{money(cur.net)}</b>")
    if cur.fx_thb:
        change = fmt_pct(pct_change(cur.rate, prev.rate)) if prev.rate else "курс прошлого месяца неизвестен"
        lines.append(f"💱 Обмен: {money(cur.fx_rub, RUB)} → {money(cur.fx_thb)}, "
                     f"курс {fmt_rate(cur.rate)} ({change})")
    if cur.income_rub or cur.expense_rub:
        lines.append(f"₽ В рублях: доходы {money(cur.income_rub, RUB)} · расходы {money(cur.expense_rub, RUB)}")
    if cur.income_rubb or cur.expense_rubb:
        lines.append(f"💼 Рубли (бизнес): доходы {money(cur.income_rubb, RUB)} · расходы {money(cur.expense_rubb, RUB)}")
    wallets = balances(txs)
    lines.append("💰 Остаток: " + " · ".join(f"<b>{wallet_money(v, w)}</b>" for w, v in wallets.items()))
    return "\n".join(lines)


WEBAPP_PAYLOAD_LIMIT = 1700  # запас до лимита длины ссылки в кнопке Telegram


def webapp_payload(txs: list[Tx], now: datetime) -> str:
    """Снимок для мини-аппа. Если не влезает в ссылку — урезаем детали, но не итоги."""
    for recent, per_month in ((12, 10), (8, 8), (5, 6), (3, 5), (0, 4), (0, 0)):
        payload = _payload(txs, now, recent=recent, per_month_cats=per_month)
        if len(payload) <= WEBAPP_PAYLOAD_LIMIT:
            break
    return payload


def _payload(txs: list[Tx], now: datetime, recent: int, per_month_cats: int, months: int = 6) -> str:
    """Компактный снимок в base64url. Суммы — в целых батах/рублях."""
    today = now.date()
    totals = monthly_totals(txs, today, months)
    names: list[str] = []

    def index(name: str) -> int:
        if name not in names:
            names.append(name)
        return names.index(name)

    per_month = []
    for m in totals:
        pairs: list[int] = []
        for name, amount in categories(txs, m.year, m.month)[:per_month_cats]:
            pairs += [index(name), round(amount / 100)]
        per_month.append(pairs)

    kinds = {"in": "i", "out": "o", "fx": "x", "adj": "a"}
    ops = []
    for tx in sorted(txs, key=lambda t: (t.day, t.id or 0), reverse=True)[:recent]:
        ops.append([f"{tx.day:%d.%m}", kinds.get(tx.kind, "o"), round(tx.amount / 100),
                    index(tx.category) if tx.kind in ("in", "out") and tx.category else -1, round(tx.rub / 100),
                    {"RUB": 1, "RUBB": 2}.get(tx.cur, 0)])

    rate = last_rate(txs)
    wallets = balances(txs)
    data = {
        "v": 1,
        "t": f"{now:%d.%m %H:%M}",
        "m": [[m.year, m.month, round(m.income / 100), round(m.expense / 100),
               round(m.fx_rub / 100), round(m.fx_thb / 100),
               round(m.income_rub / 100), round(m.expense_rub / 100),
               round(m.income_rubb / 100), round(m.expense_rubb / 100)] for m in totals],
        "c": names,
        "k": per_month,
        "b": round(wallets["THB"] / 100),
        "br": round(wallets["RUB"] / 100),
        "bb": round(wallets["RUBB"] / 100),
        "r": round(rate, 4) if rate else 0,
        "o": ops,
    }
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")
