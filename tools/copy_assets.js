#!/usr/bin/env node
// Копирует assets/ в сборку. Запускается сам после `vite build`.
//
// ЗАЧЕМ. Vite кладёт в dist только то, что импортировано из кода. Картинки,
// звуки и атлас грузит Phaser по строковым путям уже в рантайме — сборщик
// о них не знает и молча собирает dist без единого ассета. Внешне сборка
// проходит успешно, а распакованный архив даёт чёрный экран: игра стучится
// за фоном и колбами и получает 404.
//
// Ловится это только запуском самой сборки, поэтому шаг и вшит в `npm run
// build`, а не оставлен ручной операцией перед заливкой.
//
// Документация к проекту и исходники в архив не едут: модерация смотрит вес,
// а лицензии и мастер-файлы живут в репозитории.

import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'assets');
const to = join(root, 'dist', 'assets');

if (!existsSync(from)) {
  console.error(`нет папки ассетов: ${from}`);
  process.exit(1);
}

const SKIP = new Set(['.md', '.txt', '.blend', '.psd']);

mkdirSync(to, { recursive: true });
cpSync(from, to, {
  recursive: true,
  filter: (src) => SKIP.has(extname(src).toLowerCase()) === false,
});

console.log(`ассеты скопированы: ${from} -> ${to}`);
