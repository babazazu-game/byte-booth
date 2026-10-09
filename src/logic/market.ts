/**
 * Рынок комплектующих.
 *
 * Цена детали = база × множитель категории × личный шум детали × события.
 *
 *  - Множитель категории медленно бродит вокруг единицы (возврат к среднему),
 *    поэтому «просто подождать» иногда выгодно, но без гарантии.
 *  - События — главное: майнинг-бум, дефицит памяти, распродажа. О большинстве
 *    из них за день до начала пишут новости со словом «слухи». Слух сбывается
 *    не всегда — это и есть риск закупки впрок, ради которого задумывалась игра.
 *  - Улучшение «Аналитика» показывает прогноз на завтра точнее.
 *
 * Всё состояние — простой JSON, лежит в сохранении целиком.
 */

import { ALL, CATS, part, type Cat } from './parts.ts';
import { Rng } from './rng.ts';

export interface EventDef {
  id: string;
  /** Множители по категориям для каждого дня события. */
  days: Partial<Record<Cat, number>>[];
  /** Вероятность, что слух сбудется. */
  truth: number;
  weight: number;
}

const ramp = (cat: Cat, vals: number[]): Partial<Record<Cat, number>>[] => vals.map((v) => ({ [cat]: v }));
const both = (a: Cat, av: number[], b: Cat, bv: number[]): Partial<Record<Cat, number>>[] =>
  av.map((v, i) => ({ [a]: v, [b]: bv[i] ?? 1 }));
const all = (vals: number[]): Partial<Record<Cat, number>>[] =>
  vals.map((v) => Object.fromEntries(CATS.map((c) => [c, v])) as Partial<Record<Cat, number>>);

export const EVENTS: EventDef[] = [
  { id: 'mining', days: ramp('gpu', [1.25, 1.5, 1.62, 1.55, 0.92, 0.8, 0.88]), truth: 0.8, weight: 3 },
  { id: 'aiboom', days: both('gpu', [1.18, 1.3, 1.35, 1.25, 1.1], 'ram', [1.15, 1.25, 1.3, 1.2, 1.1]), truth: 0.75, weight: 2 },
  { id: 'ramshort', days: both('ram', [1.3, 1.45, 1.4, 1.2], 'ssd', [1.1, 1.2, 1.2, 1.1]), truth: 0.8, weight: 2 },
  { id: 'newcpu', days: ramp('cpu', [0.85, 0.8, 0.82, 0.9]), truth: 0.85, weight: 2 },
  { id: 'tariff', days: all([1.08, 1.12, 1.14, 1.12, 1.08]), truth: 0.7, weight: 2 },
  { id: 'sale', days: all([0.85, 0.82, 0.9]), truth: 0.9, weight: 2 },
  { id: 'cryptocrash', days: ramp('gpu', [0.82, 0.72, 0.78, 0.9]), truth: 0.75, weight: 2 },
  { id: 'psurecall', days: ramp('psu', [0.82, 0.78, 0.86]), truth: 0.85, weight: 1 },
  { id: 'caseglut', days: ramp('case', [0.8, 0.76, 0.85]), truth: 0.85, weight: 1 },
  { id: 'ssdglut', days: ramp('ssd', [0.84, 0.75, 0.8, 0.9]), truth: 0.8, weight: 1 },
];
const EVENT_BY_ID = new Map(EVENTS.map((e) => [e.id, e]));

export interface ActiveEvent { id: string; day: number }
export interface Rumor { id: string; real: boolean }
export interface News { day: number; key: string; kind: 'rumor' | 'start' | 'end' | 'fake' | 'flavor'
  /** Подстановки в текст (категория, проценты). */
  vars?: Record<string, string | number>;
}

export interface MarketState {
  day: number;
  cat: Record<Cat, number>;
  noise: Record<string, number>;
  active: ActiveEvent[];
  rumor: Rumor | null;
  history: Record<string, number[]>;
  catHistory: Record<Cat, number[]>;
  news: News[];
}

const HISTORY = 14;

export function newMarket(rng: Rng): MarketState {
  const m: MarketState = {
    day: 1,
    cat: Object.fromEntries(CATS.map((c) => [c, 1])) as Record<Cat, number>,
    noise: Object.fromEntries(ALL.map((p) => [p.id, rng.range(0.96, 1.04)])),
    active: [],
    rumor: null,
    history: {},
    catHistory: Object.fromEntries(CATS.map((c) => [c, [] as number[]])) as Record<Cat, number[]>,
    news: [{ day: 1, key: 'news.welcome', kind: 'flavor' }],
  };
  // Предыстория: две недели цен, чтобы графики не начинались с пустоты.
  for (let i = 0; i < HISTORY; i++) { drift(m, rng); record(m); }
  return m;
}

function eventMult(m: MarketState, cat: Cat): number {
  let k = 1;
  for (const a of m.active) {
    const def = EVENT_BY_ID.get(a.id);
    const d = def?.days[a.day];
    if (d && d[cat] !== undefined) k *= d[cat]!;
  }
  return k;
}

export function catMult(m: MarketState, cat: Cat): number {
  return m.cat[cat] * eventMult(m, cat);
}

/** Текущая цена покупки. `discount` — от улучшения «Оптовик». */
export function priceOf(m: MarketState, id: string, discount = 0): number {
  const p = part(id);
  const raw = p.price * m.cat[p.cat] * (m.noise[id] ?? 1) * eventMult(m, p.cat) * (1 - discount);
  return Math.max(1, Math.round(raw));
}

/** Скупка: новая деталь — 80% рынка, б/у — 45%. */
export function sellPriceOf(m: MarketState, id: string, used: boolean): number {
  return Math.max(1, Math.round(priceOf(m, id) * (used ? 0.45 : 0.8)));
}

function drift(m: MarketState, rng: Rng): void {
  for (const c of CATS) {
    const v = m.cat[c];
    m.cat[c] = Math.min(1.25, Math.max(0.8, v + (1 - v) * 0.25 + rng.range(-0.035, 0.035)));
  }
  for (const p of ALL) {
    const v = m.noise[p.id] ?? 1;
    m.noise[p.id] = Math.min(1.1, Math.max(0.9, v + (1 - v) * 0.3 + rng.range(-0.025, 0.025)));
  }
}

function record(m: MarketState): void {
  for (const p of ALL) {
    const h = (m.history[p.id] ??= []);
    h.push(priceOf(m, p.id));
    if (h.length > HISTORY) h.shift();
  }
  for (const c of CATS) {
    const h = m.catHistory[c];
    h.push(Math.round(catMult(m, c) * 100) / 100);
    if (h.length > HISTORY) h.shift();
  }
}

/**
 * Переход рынка на следующий день. Порядок важен:
 * 1) сдвигаем активные события, 2) слух вчерашнего дня сбывается или нет,
 * 3) с шансом рождается новый слух, 4) шум, 5) запись истории.
 */
export function nextDay(m: MarketState, rng: Rng): void {
  m.day++;
  for (const a of m.active) a.day++;
  const ended = m.active.filter((a) => a.day >= (EVENT_BY_ID.get(a.id)?.days.length ?? 0));
  for (const e of ended) m.news.push({ day: m.day, key: `news.${e.id}.end`, kind: 'end' });
  m.active = m.active.filter((a) => !ended.includes(a));

  if (m.rumor) {
    if (m.rumor.real) {
      m.active.push({ id: m.rumor.id, day: 0 });
      m.news.push({ day: m.day, key: `news.${m.rumor.id}.start`, kind: 'start' });
    } else {
      m.news.push({ day: m.day, key: `news.${m.rumor.id}.fake`, kind: 'fake' });
    }
    m.rumor = null;
  }

  // Слухи не чаще, чем через день, и не о том, что уже идёт.
  if (m.day >= 2 && rng.chance(0.42)) {
    const pool = EVENTS.filter((e) => !m.active.some((a) => a.id === e.id));
    const total = pool.reduce((s, e) => s + e.weight, 0);
    let r = rng.next() * total;
    for (const e of pool) {
      r -= e.weight;
      if (r <= 0) {
        m.rumor = { id: e.id, real: rng.chance(e.truth) };
        m.news.push({ day: m.day, key: `news.${e.id}.rumor`, kind: 'rumor' });
        break;
      }
    }
  } else if (rng.chance(0.5)) {
    m.news.push({ day: m.day, key: `news.flavor${rng.int(1, 12)}`, kind: 'flavor' });
  }

  drift(m, rng);
  record(m);
  /*
   * Сводка рынка каждое утро: какие категории заметнее всего подорожали или
   * подешевели за сутки. Раньше новости были только про события и слухи —
   * выпадали через день-два, и казалось, что новостей нет вовсе.
   */
  const moves = CATS.filter((c) => c !== 'paste').map((c) => {
    const h = m.catHistory[c]; const d = h.length > 1 ? (h[h.length - 1] - h[h.length - 2]) / h[h.length - 2] : 0;
    return { c, d };
  }).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  for (const mv of moves.slice(0, 2)) {
    const pct = Math.round(Math.abs(mv.d) * 100);
    if (pct < 2) continue;
    m.news.push({ day: m.day, key: mv.d > 0 ? 'news.up' : 'news.down', kind: mv.d > 0 ? 'rumor' : 'end', vars: { cat: mv.c, n: pct } });
  }
  if (!m.news.some((n) => n.day === m.day)) m.news.push({ day: m.day, key: 'news.calm', kind: 'flavor' });
  if (m.news.length > 40) m.news.splice(0, m.news.length - 40);
}

/**
 * Прогноз на завтра для улучшения «Аналитика»: стрелка по категории.
 * Честно учитывает и активные события, и слух — но слух только с его
 * вероятностью, поэтому прогноз не всезнающий.
 */
export function forecast(m: MarketState, cat: Cat): number {
  let k = 1;
  for (const a of m.active) {
    const def = EVENT_BY_ID.get(a.id)!;
    const now = def.days[a.day]?.[cat] ?? 1;
    const next = def.days[a.day + 1]?.[cat] ?? 1;
    k *= next / now;
  }
  if (m.rumor) {
    const def = EVENT_BY_ID.get(m.rumor.id)!;
    const first = def.days[0][cat];
    if (first !== undefined) k *= 1 + (first - 1) * def.truth;
  }
  k *= 1 + (1 - m.cat[cat]) * 0.25;
  return k;
}
