# Ключ — каталог новостроек (демо)

Сайт-аналог портала новостроек в тёмном премиум-дизайне: каталог ЖК Москвы и Подмосковья с фильтрами, карточки объектов, застройщики, новости и статьи, заявка на звонок.

Статический сайт без сборки: HTML + CSS + JavaScript. Все данные демонстрационные и вымышленные (`assets/js/data.js`).

## Запуск

```bash
cd realty-site
python3 -m http.server 8000
# открыть http://localhost:8000
```

Можно открыть `index.html` прямо из папки или разместить на GitHub Pages, Netlify, Vercel или любом другом статическом хостинге.

## Страницы

| Файл | Что внутри |
|---|---|
| `index.html` | Главная: поиск, статистика, новые объекты, подборки, журнал, навигация по районам |
| `catalog.html` | Каталог с фильтрами (комнаты, цена, застройщик, срок, класс, отделка, транспорт и др.); фильтры сохраняются в URL |
| `complex.html?id=…` | Страница ЖК: галерея, характеристики, цены по комнатности, форма заявки |
| `developers.html`, `developer.html?id=…` | Застройщики и их проекты |
| `news.html`, `article.html?id=…` | Новости и статьи |
| `about.html` | О проекте, реклама, контакты, соглашение |

## Как менять контент

- ЖК, застройщики, статьи — `assets/js/data.js`.
- Цвета и шрифты (Unbounded, Onest, JetBrains Mono) — переменные в начале `assets/css/style.css`.
- Телефон — константа `PHONE` в `assets/js/common.js`.
- Формы заявок сейчас никуда не отправляются: обработчик находится в `bindLeadForm` (`assets/js/common.js`). Туда можно подключить Telegram-бота, CRM или почту.

## Фотографии

Фото в `assets/img/` взяты с [Unsplash](https://unsplash.com) (лицензия Unsplash: можно использовать бесплатно, в том числе в коммерческих проектах). Они не изображают реальные объекты каталога. Для каждого фото есть два размера: `name.jpg` (1400 px) и `name-s.jpg` (720 px). Замените их на фото настоящих ЖК с теми же именами или поменяйте поле `photos` в `data.js`.

```
ext-01: https://unsplash.com/photos/1431576901776-e539bd916ba2
ext-02: https://unsplash.com/photos/1515263487990-61b07816b324
ext-03: https://unsplash.com/photos/1545324418-cc1a3fa10c00
ext-04: https://unsplash.com/photos/1574958269340-fa927503f3dd
ext-05: https://unsplash.com/photos/1448630360428-65456885c650
ext-06: https://unsplash.com/photos/1460317442991-0ec209397118
ext-07: https://unsplash.com/photos/1479839672679-a46483c0e7c8
ext-08: https://unsplash.com/photos/1582407947304-fd86f028f716
ext-09: https://unsplash.com/photos/1486406146926-c627a92ad1ab
ext-10: https://unsplash.com/photos/1574362848149-11496d93a7c7
ext-11: https://unsplash.com/photos/1511818966892-d7d671e672a2
ext-12: https://unsplash.com/photos/1464938050520-ef2270bb8ce8
house-01: https://unsplash.com/photos/1567496898669-ee935f5f647a
house-02: https://unsplash.com/photos/1600585154340-be6161a56a0c
house-03: https://unsplash.com/photos/1600047509807-ba8f99d2cdde
house-04: https://unsplash.com/photos/1613490493576-7fde63acd811
int-01: https://unsplash.com/photos/1503174971373-b1f69850bded
int-02: https://unsplash.com/photos/1554995207-c18c203602cb
int-03: https://unsplash.com/photos/1600607687939-ce8a6c25118c
int-04: https://unsplash.com/photos/1560448204-e02f11c3d0e2
int-05: https://unsplash.com/photos/1497366216548-37526070297c
int-06: https://unsplash.com/photos/1522708323590-d24dbb6b0267
int-07: https://unsplash.com/photos/1493809842364-78817add7ffb
```
