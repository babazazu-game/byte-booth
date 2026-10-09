/**
 * Точка входа. Порядок запуска — требование площадки, менять его нельзя:
 *
 *   1. Экран загрузки уже на экране: он в разметке, а не в движке.
 *   2. Ждём SDK. Язык обязан быть известен ДО первого кадра (п. 2.14).
 *   3. Ждём шрифты: надписи на коробках и ценниках рисуются на холсте,
 *      и если шрифт не успел, текстуры навсегда останутся с системным.
 *   4. Строим мир и интерфейс.
 *   5. Убираем заставку и говорим площадке `LoadingAPI.ready()` — когда меню
 *      ДЕЙСТВИТЕЛЬНО видно, но не позже 90 секунд (п. 1.19.2).
 */

import '@fontsource/rubik/400.css';
import '@fontsource/rubik/500.css';
import '@fontsource/rubik/700.css';
import '@fontsource/rubik/900.css';
import '@fontsource/caveat/700.css';
// Rubik — для надписей НА ПРЕДМЕТАХ (коробки, ценники); интерфейс — Onest/Unbounded/JetBrains Mono.
import '@fontsource/onest/500.css';
import '@fontsource/onest/600.css';
import '@fontsource/onest/700.css';
import '@fontsource/onest/800.css';
import '@fontsource/unbounded/700.css';
import '@fontsource/unbounded/800.css';
import '@fontsource/unbounded/900.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/jetbrains-mono/800.css';
import './ui/styles.css';
import { pixelRatio, showFpsMeter, splashCaption, splashHide, splashProgress } from 'yg-core';
import { core } from './core.ts';
import { t } from './i18n.ts';
import { showStickyBanner } from './ads.ts';
import { App } from './game/app.ts';

const SDK_DEADLINE_MS = 8000;

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise.then((v) => v).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

async function boot(): Promise<void> {
  splashProgress(0.08);
  await withDeadline(core.ready, SDK_DEADLINE_MS);
  splashCaption(t('loading'));
  document.title = t('title');
  splashProgress(0.3);
  await withDeadline(Promise.all(['400 20px Rubik', '700 20px Rubik', '900 20px Rubik', '700 20px Caveat'].map((f) => document.fonts.load(f, 'AбвZ'))), 4000);
  splashProgress(0.5);
  // даём заставке перерисоваться перед тяжёлой постройкой мира
  await new Promise((r) => setTimeout(r, 30));
  const parent = document.getElementById('game')!;
  const app = new App(parent);
  splashProgress(0.92);
  watchSize(app, parent);
  showFpsMeter(() => `вызовы ${app.engine.renderer.info.render.calls}`);
  app.start();
  splashProgress(1);
  let shown = false;
  const reveal = () => {
    if (shown) return;
    shown = true;
    splashHide();
    core.loadingReady();
    void showStickyBanner();
  };
  requestAnimationFrame(reveal);
  // В фоновой вкладке кадров нет вовсе — заставка не должна висеть вечно.
  setTimeout(reveal, 1500);
  // отладка в локальной сборке: ?debug=1
  if (new URLSearchParams(location.search).get('debug') && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    const w = window as unknown as Record<string, unknown>;
    w.app = app;
    // модели — для отладочной витрины
    void import('./render/debugModels.ts').then((m) => { w.models = m; });
    // ?shot=<сцена> — служебная сцена для скриншотов (см. devShots.ts)
    const shot = new URLSearchParams(location.search).get('shot');
    if (shot) setTimeout(() => { void import('./devShots.ts').then((m) => m.runShot(app, shot)); }, 1500);
  }
}

/**
 * Размер холста — через ResizeObserver: контейнер меняется не только от
 * поворота, но и от sticky-баннера и адресной строки телефона.
 */
function watchSize(app: App, parent: HTMLElement): void {
  let last = { w: 0, h: 0, dpr: 0 };
  const sync = (): void => {
    const w = parent.clientWidth, h = parent.clientHeight, dpr = pixelRatio();
    if (w === last.w && h === last.h && dpr === last.dpr) return;
    last = { w, h, dpr };
    if (w <= 0 || h <= 0) return;
    app.engine.resize(w, h, dpr);
    app.setLayout(w, h);
  };
  sync();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(sync).observe(parent);
  else window.addEventListener('resize', sync);
  window.addEventListener('orientationchange', () => { sync(); requestAnimationFrame(sync); });
}

void boot();
