# Архив игры для загрузки на площадку.
#
# Запуск: npm run zip   (после npm run build)
#
# ── ЗАЧЕМ ОТДЕЛЬНЫЙ СКРИПТ, А НЕ ПРАВЫЙ КЛИК ────────────────────────────────
#
# Из-за СЛЕШЕЙ. В формате ZIP пути внутри архива обязаны разделяться прямым
# слешем — так написано в спецификации. Штатный упаковщик Windows и
# Compress-Archive из PowerShell в ряде версий кладут туда обратный слеш,
# архив при этом открывается локально как ни в чём не бывало, а площадка
# видит один файл с именем `assets\game\tube.webp` вместо папок. Итог —
# игра грузится, а все вложенные файлы отдают 404, и понять это по архиву
# на своей машине невозможно.
#
# Этот разработчик уже получал такой отказ, поэтому упаковка тут своя и
# слеши проверяются сразу после записи.
#
# ── ЧТО ПОПАДАЕТ В АРХИВ ────────────────────────────────────────────────────
#
# Только содержимое `dist/`, и ничего больше: ни исходников, ни документации,
# ни мастер-файлов графики. Отладочная сборка `dist-check/` с чекером внутри
# не попадает тем более — панель аудитора в релизе это нарушение п. 1.15.
#
# Внутри архива index.html лежит В КОРНЕ, без обёртки в папку: площадка ищет
# его именно там.

import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")
OUT = os.path.join(ROOT, "build", "game.zip")

# Мусор, который иногда заводится в сборке сам. Ассеты фильтруются раньше,
# в copy_assets.js, здесь — последняя сетка.
SKIP_NAMES = {".DS_Store", "Thumbs.db", "desktop.ini"}
SKIP_EXT = {".map", ".md", ".txt", ".blend", ".psd", ".zip"}

if not os.path.isdir(DIST):
    sys.exit("нет папки dist — сначала `npm run build`")

if not os.path.isfile(os.path.join(DIST, "index.html")):
    sys.exit("в dist нет index.html — площадка ищет его в корне архива")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
if os.path.exists(OUT):
    os.remove(OUT)

written = []
total_raw = 0

with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for folder, _dirs, files in os.walk(DIST):
        for name in sorted(files):
            ext = os.path.splitext(name)[1].lower()
            if name in SKIP_NAMES or ext in SKIP_EXT:
                print(f"  пропущен: {name}")
                continue

            full = os.path.join(folder, name)
            # ИМЕННО так: относительный путь и замена разделителя на прямой
            # слеш вручную. os.path.relpath на Windows вернёт `a\b\c`.
            arc = os.path.relpath(full, DIST).replace(os.sep, "/")
            z.write(full, arc)
            written.append(arc)
            total_raw += os.path.getsize(full)

# ── проверка готового архива, а не намерений ────────────────────────────────
with zipfile.ZipFile(OUT) as z:
    names = z.namelist()
    bad = [n for n in names if "\\" in n]
    if bad:
        sys.exit(f"в архиве обратные слеши: {bad[:5]}")
    if "index.html" not in names:
        sys.exit("index.html не в корне архива")
    broken = z.testzip()
    if broken:
        sys.exit(f"битый файл в архиве: {broken}")

size = os.path.getsize(OUT)
print(f"\nфайлов: {len(written)}")
print(f"исходно: {total_raw / 1024 / 1024:.2f} МБ")
# Без стрелок и прочей типографики: консоль Windows работает в cp1251,
# и одна такая литера роняет скрипт после того, как архив уже собран.
print(f"архив:   {size / 1024 / 1024:.2f} МБ  в  {os.path.relpath(OUT, ROOT)}")
print("слеши прямые, index.html в корне, целостность проверена")
