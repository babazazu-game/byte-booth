#!/usr/bin/env node
// Сборка с подключённым чекером Яндекс.Игр — для прогона перед заливкой.
//
// Запуск: npm run check
// Выход:  dist-check/ — копия боевой сборки плюс чекер
//
// ПОЧЕМУ ОТДЕЛЬНЫЙ КАТАЛОГ, А НЕ dist. Чекер обязан подключаться после SDK
// и до игры, то есть тегом в разметке. Если класть его прямо в `dist`,
// однажды архив уедет на модерацию с отладочной панелью внутри — а её наличие
// в релизе тот же чекер справедливо считает нарушением (п. 1.15). Отдельный
// каталог делает такую ошибку невозможной по построению: `dist` не знает
// о чекере вовсе, а `dist-check` в архив не попадает никогда.
//
// ПРОГОНЯТЬ НАДО ИМЕННО СБОРКУ, не dev-сервер. Статический сканер чекера
// читает подключённые файлы, а в разработке код живёт отдельными ES-модулями,
// которые Vite отдаёт по одному. Сканер их не разворачивает и не находит
// ни `YaGames.init()`, ни `LoadingAPI.ready()` — три ложных FAIL на ровном
// месте. В собранном `assets/index.js` всё это лежит рядом, и проверка
// становится честной.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(root, 'dist');
const OUT = path.join(root, 'dist-check');
const CHECKER = path.join(root, 'tools', 'checker', 'debugcheck.js');

if (!fs.existsSync(CHECKER)) {
  console.error('Нет tools/checker/debugcheck.js — положи туда чекер.');
  process.exit(1);
}

console.log('Собираю боевую сборку...');
execSync('npm run build', { cwd: root, stdio: 'inherit' });

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(DIST, OUT, { recursive: true });
fs.mkdirSync(path.join(OUT, 'checker'), { recursive: true });
fs.copyFileSync(CHECKER, path.join(OUT, 'checker', 'debugcheck.js'));

// Тег встаёт сразу после SDK: порядок «SDK → чекер → игра» для чекера
// обязателен, иначе он не перехватит вызовы SDK и не увидит порядок старта.
const indexPath = path.join(OUT, 'index.html');
const sdkTag = '<script src="/sdk.js"></script>';
let html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes(sdkTag)) {
  console.error('В сборке не найден тег SDK — проверь index.html.');
  process.exit(1);
}
html = html.replace(sdkTag, `${sdkTag}\n  <script src="./checker/debugcheck.js"></script>`);
fs.writeFileSync(indexPath, html);

console.log(`
Готово: dist-check/

Дальше:
  npx vite preview --outDir dist-check --host 0.0.0.0 --port 5190

В браузере открыть игру и вызвать в консоли:
  YGDebugChecker.open()

Панель также открывается тройным Ctrl+Shift+2.
`);
