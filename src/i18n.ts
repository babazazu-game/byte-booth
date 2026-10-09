import { core } from './core.ts';
import { RU } from './locale/ru.ts';
import { EN } from './locale/en.ts';

/**
 * Язык интерфейса.
 *
 * При старте язык определяется АВТОМАТИЧЕСКИ — из SDK площадки, а локально
 * из браузера (п. 2.14: язык обязан быть известен до первого кадра UI).
 * Ручной переключатель в настройках добавлен по решению автора игры: он
 * ничего не меняет при запуске и действует только по нажатию игрока.
 * Выбор игрока запоминается и применяется ПОСЛЕ автоопределения, до первого
 * кадра интерфейса — поэтому «моргания» языка нет.
 */

core.i18n.register('ru', RU);
core.i18n.register('en', EN);

const LANG_KEY = 'bytebooth.lang';

function applyLangOverride(): void {
  if (typeof location === 'undefined') return;
  const asked = new URLSearchParams(location.search).get('lang');
  if (asked === 'ru' || asked === 'en') { core.i18n.setLang(asked); return; }
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'ru' || saved === 'en') core.i18n.setLang(saved);
  } catch { /* приватный режим */ }
}

applyLangOverride();
void core.ready.then(applyLangOverride);

export function setLangByPlayer(l: 'ru' | 'en'): void {
  try { localStorage.setItem(LANG_KEY, l); } catch { /* пусто */ }
  core.i18n.setLang(l);
}

/**
 * Куски строк про клавиатуру размечены ⟦…⟧: на сенсорном экране (телефон,
 * планшет) клавиш нет, и «или клавиша 3» только сбивала с толку — их убираем.
 */
const TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
export const t = (key: string, vars?: Record<string, string | number>): string => {
  const s = core.i18n.t(key, vars);
  return s.includes('⟦') ? s.replace(/⟦([^⟧]*)⟧/g, TOUCH ? '' : '$1') : s;
};
export const lang = (): 'ru' | 'en' => core.i18n.current;

/** Случайный вариант из строки «а|б|в». `seed` — чтобы реплика была стабильной. */
export function variant(key: string, vars?: Record<string, string | number>, seed?: number): string {
  const all = t(key, vars).split('|');
  const i = seed === undefined ? Math.floor(Math.random() * all.length) : Math.abs(seed) % all.length;
  return all[i];
}

export function nameOf(idx: number, female: boolean): string {
  const all = t(female ? 'names.f' : 'names.m').split('|');
  return all[idx % all.length];
}

/** Деньги: $1,234 — одинаково в обоих языках, валюта игры — доллары. */
export function money(n: number): string {
  const s = Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (n < 0 ? '−$' : '$') + s;
}
