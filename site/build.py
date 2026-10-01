"""Собирает index.html из tilda-t123.html: тот же фрагмент в полноценной HTML-странице.

Запуск: python3 site/build.py
"""
from pathlib import Path

here = Path(__file__).parent
fragment = (here / "tilda-t123.html").read_text(encoding="utf-8")

page = f"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Alimov Agency — клиенты для детских школ</title>
<meta name="description" content="Заявки для детских онлайн-школ и офлайн-студий из VK Рекламы: от 135 ₽ за заявку, ROMI до 1600% в кейсах.">
<meta name="theme-color" content="#F2F6F6">
<style>html {{ scroll-behavior: smooth; scroll-padding-top: 80px; }} body {{ margin: 0; background: #F2F6F6; }}</style>
</head>
<body>
{fragment}
</body>
</html>
"""
(here / "index.html").write_text(page, encoding="utf-8")
print("site/index.html собран")
