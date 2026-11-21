"""out.json имитации → xlsx для пересчёта формул в LibreOffice: python3 toxlsx.py out.json built.xlsx

Формулы русской локали («;») переводятся обратно в «,», SEQUENCE(n) — в массив {1;…;n}
(в LibreOffice 24.2 SEQUENCE нет).
"""
import json
import re
import sys
from datetime import datetime

from openpyxl import Workbook


def unsemi(f):
    out, q = '', ''
    for ch in f:
        if q:
            if ch == q:
                q = ''
        elif ch in '"\'':
            q = ch
        elif ch == ';':
            ch = ','
        out += ch
    return out


def main(src, dst):
    wb = Workbook()
    wb.remove(wb.active)
    for s in json.load(open(src)):
        ws = wb.create_sheet(s['name'])
        for k, v in s['cells']:
            r, c = map(int, k.split(','))
            if isinstance(v, dict):
                v = datetime.fromisoformat(v['d'].replace('Z', ''))
            if isinstance(v, str) and v.startswith('='):
                v = re.sub(r'SEQUENCE\((\d+)\)', lambda m: '{' + ';'.join(map(str, range(1, int(m.group(1)) + 1))) + '}', unsemi(v))
            ws.cell(r, c, v)
            f = s['fmt'].get(k)
            if f:
                ws.cell(r, c).number_format = f.replace('dd.MM.yyyy', 'DD.MM.YYYY')
    wb.save(dst)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
