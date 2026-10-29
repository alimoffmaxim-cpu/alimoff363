# Пересобирает tilda-example.html из landing.html: шапка-комментарий + демо-режим отправки формы
# (при заглушке SCRIPT_URL заявка никуда не уходит, показывается «Спасибо»).
# Запуск: python3 tools/make_example.py  (из папки gluhov-moto-landing)
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
HEADER = '''<!--
  ПРИМЕР ДЛЯ ТИЛЬДЫ (демо): вставьте этот файл целиком в блок «Другое → T123 HTML-код».
  Форма работает в демо-режиме: показывает «Спасибо», но заявку никуда не отправляет.
  Чтобы заявки шли на почту/в таблицу — README, шаги 1–3, затем впишите SCRIPT_URL в CONFIG.
-->
'''
FETCH = "    fetch(CONFIG.SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: data })"
DEMO = """    // Демо-режим: пока скрипт приёма заявок не опубликован, заявка никуда не уходит
    var demo = /XXXXXXXX/.test(CONFIG.SCRIPT_URL);
    if (demo) console.warn('Демо-режим: заявка не отправлена, укажите SCRIPT_URL в CONFIG');
    (demo ? Promise.resolve() : fetch(CONFIG.SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: data }))"""

src = (ROOT / 'landing.html').read_text(encoding='utf-8')
assert src.count(FETCH) == 1, 'в landing.html не найден вызов fetch формы'
(ROOT / 'tilda-example.html').write_text(HEADER + src.replace(FETCH, DEMO), encoding='utf-8')
print('tilda-example.html обновлён')
