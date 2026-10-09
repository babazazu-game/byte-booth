#!/usr/bin/env node
// Картинки и «слепой критик» через Codex CLI (подписка ChatGPT).
//
//   node tools/codex_image.cjs gen <out.png> "<описание>" [--transparent] [--ref <img>]...
//   node tools/codex_image.cjs critic "<вопрос>" <img1> [<img2> ...]
//
// gen    — одна картинка. Рисует встроенный генератор Codex; языковая модель лишь
//          ставит ему задачу, поэтому берём недорогую gpt-5.6-sol (low).
//          --transparent: просим прозрачный фон (проверять альфу результата!).
//          --ref: картинки-образцы (стиль, предыдущая версия).
// critic — жёсткое сравнение картинок (наш кадр против эталона). Тут важно
//          суждение, поэтому gpt-6.1-sol (low). Ответ печатается в stdout.
//
// ЗАЧЕМ ТАК. Codex кладёт сгенерированное в ~/.codex/generated_images/<сессия>/,
// а скопировать в проект сам на Windows не может: его песочница команд падает
// с helper_unknown_error. Поэтому Codex работает в read-only, а файл забираем мы —
// самый свежий PNG, появившийся после запуска.
//
// Лимиты подписки не бесконечны: картинки — по одной, критика — только по делу.

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const GEN_MODEL = process.env.CODEX_IMG_MODEL || 'gpt-5.6-sol';
const CRITIC_MODEL = process.env.CODEX_CRITIC_MODEL || 'gpt-6.1-sol';

function codex(model, prompt, images = []) {
  const args = ['exec', '--skip-git-repo-check', '-s', 'read-only', '-m', model, '-c', 'model_reasoning_effort=low'];
  // --image=… а не -i …: -i принимает список и «съедал» следующий аргумент
  for (const im of images) args.push('--image=' + path.resolve(im));
  const tmp = path.join(os.tmpdir(), 'codex_last_' + process.pid + '.txt');
  args.push('-o', tmp, '-');
  // codex на Windows — обёртка .cmd, без оболочки не запускается: зовём его JS напрямую
  const npmRoot = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' }).stdout.trim();
  const entry = path.join(npmRoot, '@openai', 'codex', 'bin', 'codex.js');
  const r = spawnSync(process.execPath, [entry, ...args], { input: prompt, encoding: 'utf8', timeout: 900000, maxBuffer: 64 * 1024 * 1024 });
  if (r.error) console.error(String(r.error));
  const last = fs.existsSync(tmp) ? fs.readFileSync(tmp, 'utf8') : '';
  try { fs.unlinkSync(tmp); } catch { /* нет файла — нет ответа */ }
  return { status: r.status, last, stderr: r.stderr || '', stdout: r.stdout || '' };
}

function newestPng(since) {
  const dir = path.join(os.homedir(), '.codex', 'generated_images');
  let best = null;
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.png$/i.test(e.name)) { const t = fs.statSync(p).mtimeMs; if (t >= since - 2000 && (!best || t > best.t)) best = { p, t }; }
    }
  };
  walk(dir);
  return best?.p ?? null;
}

const [, , mode, ...argv] = process.argv;

if (mode === 'gen') {
  const out = argv[0];
  const refs = [];
  let transparent = false;
  const words = [];
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--transparent') transparent = true;
    else if (argv[i] === '--ref') refs.push(argv[++i]);
    else words.push(argv[i]);
  }
  if (!out || !words.length) { console.error('usage: gen <out.png> "<prompt>" [--transparent] [--ref img]'); process.exit(2); }
  const started = Date.now();
  const prompt = 'Сгенерируй РОВНО ОДНО изображение встроенным инструментом генерации картинок. ' +
    'Не запускай команды и не сохраняй файлы — только сгенерируй. ' +
    (transparent ? 'Фон ПРОЗРАЧНЫЙ (PNG с альфа-каналом), без подложки, теней-плашек и рамок вокруг. ' : '') +
    (refs.length ? 'Приложенные изображения — образец стиля/предыдущая версия. ' : '') + words.join(' ');
  const r = codex(GEN_MODEL, prompt, refs);
  const src = newestPng(started);
  if (!src) { console.error('картинка не найдена. Ответ Codex:'); console.error(r.last || r.stdout.slice(-1500) || r.stderr.slice(-1500)); process.exit(1); }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.copyFileSync(src, out);
  console.log('saved ' + path.resolve(out) + ' (' + fs.statSync(out).size + ' bytes)');
} else if (mode === 'critic') {
  const question = argv[0];
  const imgs = argv.slice(1);
  if (!question || !imgs.length) { console.error('usage: critic "<question>" img...'); process.exit(2); }
  const prompt = 'Ты жёсткий арт-директор игровой студии. Похвала бесполезна. ' +
    'Не запускай команды, просто посмотри на приложенные изображения и ответь. ' + question;
  const r = codex(CRITIC_MODEL, prompt, imgs);
  if (!r.last) { console.error(r.stderr.slice(-1500)); process.exit(1); }
  console.log(r.last.trim());
} else {
  console.error('usage: node tools/codex_image.cjs gen|critic ...');
  process.exit(2);
}
