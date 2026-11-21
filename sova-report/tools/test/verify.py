"""Сверка пересчитанного отчёта с листом «Данные»: python3 verify.py calc/built.xlsx

Проверяет: нет ошибок формул; недели и месяцы идут подряд с TRENDS_FROM (21.09.2026) до последнего
завершённого, подписи верные, подписки и расход в каждой строке = прямой сумме по «Данным»;
«Разница с прошлой неделей»; таблица по дням ниже месяцев и её сумма = блоку периода;
«Расход с НДС» = расход × 1,22 во всех таблицах. Код выхода 1 — есть расхождения.
"""
import sys
from datetime import date, timedelta

from openpyxl import load_workbook

START = date(2026, 9, 21)
MON = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
SUBS, SPEND = 8, 2   # колонки H (подписки) и B (расход) в таблицах метрик

wb = load_workbook(sys.argv[1], data_only=True)
data = [r for r in wb['Данные'].iter_rows(min_row=2, values_only=True) if r[0]]
d = lambda v: v.date() if hasattr(v, 'date') else v
summary = wb['Сводная']
R = d(wb['⚙ Настройки']['F2'].value)   # отчётная дата («вчера» или по последним данным)
names = [wb['⚙ Настройки'].cell(r, 1).value for r in range(2, 20) if wb['⚙ Настройки'].cell(r, 1).value]
bad = []


def tot(f, t, col, name=None):
    return sum(r[col] for r in data if f <= r[0].date() <= t and (name is None or r[1] == name))


lw = R - timedelta(days=R.weekday()) - (timedelta(7) if R.weekday() < 6 else timedelta(0))
weeks = []
w = START
while w <= lw:
    weeks.append(w)
    w += timedelta(7)
lm = (R.year, R.month) if (R + timedelta(1)).day == 1 else ((R.year, R.month - 1) if R.month > 1 else (R.year - 1, 12))
months, (y, m) = [], (START.year, START.month)
while (y, m) <= lm:
    months.append((y, m))
    y, m = (y + (m == 12), m % 12 + 1)
mend = lambda y, m: date(y + (m == 12), m % 12 + 1, 1) - timedelta(1)

errs = [(ws.title, c.coordinate) for ws in wb for row in ws.iter_rows() for c in row
        if isinstance(c.value, str) and c.value.startswith('#') and not ws.title.startswith('⚙')]
if errs:
    bad.append(f'ошибки формул: {errs[:5]}')


def table(s, title):
    r = next(r for r in range(1, s.max_row + 1) if str(s.cell(r, 1).value or '').startswith(title)) + 2
    out = []
    while s.cell(r, 1).value and not str(s.cell(r, 1).value).startswith('Разница'):
        out.append((r, s.cell(r, 1).value))
        r += 1
    return out, r


for name in names:
    s = wb[name]
    wt, wdiff = table(s, '🗓')
    mt, mdiff = table(s, '📅')
    if len(wt) != len(weeks) or len(mt) != len(months):
        bad.append(f'{name}: недель {len(wt)} из {len(weeks)}, месяцев {len(mt)} из {len(months)}')
    for (r, lab), w in zip(wt, weeks):
        e = w + timedelta(6)
        if lab != f'{w:%d.%m}–{e:%d.%m.%Y}' or s.cell(r, SUBS).value != tot(w, e, 5, name) \
                or round(s.cell(r, SPEND).value, 2) != round(tot(w, e, 2, name), 2):
            bad.append(f'{name} строка {r}: неделя {lab}')
    for (r, lab), (y, m) in zip(mt, months):
        if lab != f'{MON[m - 1]} {y}' or s.cell(r, SUBS).value != tot(date(y, m, 1), mend(y, m), 5, name):
            bad.append(f'{name} строка {r}: месяц {lab}')
    if len(wt) > 1 and abs(s.cell(wdiff, SUBS).value - (s.cell(wt[-1][0], SUBS).value / s.cell(wt[-2][0], SUBS).value - 1)) > 1e-9:
        bad.append(f'{name}: «Разница с прошлой неделей»')
    t = next(r for r in range(1, s.max_row + 1) if str(s.cell(r, 1).value or '').startswith('📆'))
    days = [r for r in range(t + 2, s.max_row + 1) if s.cell(r, 1).value]
    k, l = d(s['K7'].value), d(s['L7'].value)
    if t <= mdiff or len(days) != (l - k).days + 1 or sum(s.cell(r, SUBS).value for r in days) != s['H7'].value \
            or s['H7'].value != tot(k, l, 5, name):
        bad.append(f'{name}: таблица по дням / блок периода {k}–{l}')
    print(f'  {name}: недель {len(wt)} ({wt[0][1] if wt else "—"} … {wt[-1][1] if wt else "—"}), месяцев {len(mt)}, '
          f'период {k:%d.%m}–{l:%d.%m}, дней {len(days)}')

wt, _ = table(summary, '🧭 Подписки по направлениям, по неделям')
mt, _ = table(summary, '🧭 Подписки по направлениям, по месяцам')
tc = len(names) + 2   # колонка «Итого»
for (r, lab), w in zip(wt, weeks):
    if summary.cell(r, tc).value != tot(w, w + timedelta(6), 5):
        bad.append(f'Сводная строка {r}: неделя {lab}')
for (r, lab), (y, m) in zip(mt, months):
    if summary.cell(r, tc).value != tot(date(y, m, 1), mend(y, m), 5):
        bad.append(f'Сводная строка {r}: месяц {lab}')
k, l = d(summary['K7'].value), d(summary['L7'].value)
if summary['H7'].value != tot(k, l, 5):
    bad.append('Сводная: блок периода')

vat = 0
for name in ['Сводная'] + names:
    s, hdr = wb[name], False
    for r in range(1, s.max_row + 1):
        a, b, c = s.cell(r, 1).value, s.cell(r, 2).value, s.cell(r, 3).value
        if c == 'Расход с НДС':
            hdr = True
        elif not a:
            hdr = False
        elif hdr and isinstance(b, (int, float)) and not str(a).startswith(('Изменение', 'Разница')):
            vat += 1
            if not isinstance(c, (int, float)) or abs(c - b * 1.22) > 0.01:
                bad.append(f'{name} строка {r}: НДС')
print(f'  Сводная: недель {len(wt)}, месяцев {len(mt)}, период {k:%d.%m}–{l:%d.%m} | строк с НДС проверено: {vat}')
print('ИТОГ:', 'всё совпало' if not bad else 'РАСХОЖДЕНИЯ:\n  ' + '\n  '.join(bad[:30]))
sys.exit(1 if bad else 0)
