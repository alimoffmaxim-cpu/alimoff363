# Собирает папку превью для артефакта claude.ai (https://claude.ai/artifact/8R8jMkRNuTic4txxohGfEn):
#   <out>/index.html      — tilda-example.html (демо-форма), медиа из соседней папки media/
#   <out>/media/          — копия media/
#   <out>/legal/*.html    — политика и согласие полными страницами
# Запуск: python3 tools/make_preview.py <папка>   (из папки gluhov-moto-landing; сначала make_example.py)
# Публикация: Artifact file_path=<папка>/index.html, files = media/* и legal/* (изменённые файлы).
import pathlib, re, shutil, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'preview').resolve()
(out / 'legal').mkdir(parents=True, exist_ok=True)

pv = (ROOT / 'tilda-example.html').read_text(encoding='utf-8')
pv, n = re.subn(r"MEDIA_BASE: '[^']*'", "MEDIA_BASE: 'media/'", pv)
assert n == 1, 'MEDIA_BASE не найден'
pv = pv.replace('href="/privacy-moto"', 'href="legal/privacy.html"').replace('href="/consent-moto"', 'href="legal/consent.html"')
(out / 'index.html').write_text(pv, encoding='utf-8')

if (out / 'media').exists():
    shutil.rmtree(out / 'media')
shutil.copytree(ROOT / 'media', out / 'media')

css = (ROOT / 'legal' / '_style.html').read_text(encoding='utf-8')
titles = {'privacy': 'Политика обработки ПДн', 'consent': 'Согласие на обработку ПДн'}
for name, title in titles.items():
    body = (ROOT / 'legal' / f'{name}.html').read_text(encoding='utf-8')
    body = (body.replace('href="/privacy-moto"', 'href="privacy.html"').replace('href="/consent-moto"', 'href="consent.html"')
                .replace('href="/moto-zelenograd"', 'href="../index.html"'))
    (out / 'legal' / f'{name}.html').write_text(
        '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        f'<title>{title}</title><style>html,body{{margin:0;background:#0d0f13}}</style>{css}</head><body>{body}</body></html>', encoding='utf-8')
print('превью собрано в', out)
