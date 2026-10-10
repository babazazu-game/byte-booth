/**
 * Зачем возвращаться каждый день и чем игра кончается.
 *
 * - Ежедневный бонус по РЕАЛЬНОМУ календарю: серия из 7 дней, награда растёт;
 *   пропуск дня — серия начинается заново.
 * - Три задания на реальный день («собери 2 ПК на 5★» и т.п.): деньги и опыт.
 * - Финал: «Свой магазин». Кнопка видна с начала, но работает только при
 *   высокой репутации и большом общем заработке; покупка — титры, дальше
 *   можно играть без конца.
 *
 * Чистая логика: дата передаётся снаружи (в тестах — любая).
 */
import type { GameState } from './state.ts';
import { repLevel } from './orders.ts';

export interface Daily {
  /** День (YYYYMMDD), за который последний раз забран бонус. */
  claimed: number;
  streak: number;
  /** Задания текущего реального дня. */
  tasksDay: number;
  tasks: Task[];
}
export type TaskKind = 'build5' | 'clean' | 'earn' | 'upgrade' | 'serve';
export interface Task { kind: TaskKind; need: number; have: number; reward: number; xp: number; done: boolean }

export const dayKey = (d: Date): number => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
const prevKey = (d: Date): number => { const p = new Date(d); p.setDate(p.getDate() - 1); return dayKey(p); };

/** Награда за день серии (1…7). */
export const bonusFor = (streakDay: number): number => 100 + 50 * (Math.min(7, streakDay) - 1);

export function dailyOf(s: GameState): Daily {
  return (s.daily ??= { claimed: 0, streak: 0, tasksDay: 0, tasks: [] });
}

/** Можно ли забрать бонус сегодня и какой он будет (номер дня серии). */
export function bonusState(s: GameState, now: Date): { ready: boolean; day: number; amount: number } {
  const d = dailyOf(s), k = dayKey(now);
  if (d.claimed === k) return { ready: false, day: d.streak, amount: bonusFor(d.streak) };
  const day = d.claimed === prevKey(now) ? (d.streak % 7) + 1 : 1;
  return { ready: true, day, amount: bonusFor(day) };
}

export function claimBonus(s: GameState, now: Date): number {
  const b = bonusState(s, now);
  if (!b.ready) return 0;
  const d = dailyOf(s);
  d.claimed = dayKey(now); d.streak = b.day;
  s.cash += b.amount;
  if (b.day === 7) s.pasteUses += 5; // неделя подряд — ещё и тюбик пасты
  return b.amount;
}

/** Задания на сегодня: создаются при первом заходе за реальный день. */
export function tasksToday(s: GameState, now: Date): Task[] {
  const d = dailyOf(s), k = dayKey(now);
  if (d.tasksDay !== k) {
    const lv = repLevel(s.xp);
    // набор зависит от даты: у всех в один день одни и те же задания
    const pool: Task[] = [
      { kind: 'build5', need: 2, have: 0, reward: 150 + lv * 30, xp: 20, done: false },
      { kind: 'clean', need: 1, have: 0, reward: 80 + lv * 15, xp: 10, done: false },
      { kind: 'earn', need: 1000 + lv * 300, have: 0, reward: 120 + lv * 25, xp: 15, done: false },
      { kind: 'upgrade', need: 1, have: 0, reward: 120 + lv * 20, xp: 12, done: false },
      { kind: 'serve', need: 4, have: 0, reward: 100 + lv * 20, xp: 12, done: false },
    ];
    const start = k % pool.length;
    d.tasks = [0, 1, 2].map((i) => pool[(start + i * 2) % pool.length]);
    d.tasksDay = k;
  }
  return d.tasks;
}

/** Засчитать событие в задания (после выдачи заказа и т.п.). Возвращает выполненные сейчас. */
export function progress(s: GameState, kind: TaskKind, amount = 1): Task[] {
  const d = dailyOf(s);
  const out: Task[] = [];
  for (const t of d.tasks) {
    if (t.done || t.kind !== kind) continue;
    t.have = Math.min(t.need, t.have + amount);
    if (t.have >= t.need) { t.done = true; s.cash += t.reward; s.xp += t.xp; out.push(t); }
  }
  return out;
}

/* ─────────────────────────────── финал ─────────────────────────────── */

export const SHOP = { rep: 9, earned: 150000, price: 60000 };
export function shopState(s: GameState): { repOk: boolean; earnedOk: boolean; cashOk: boolean; ready: boolean; owned: boolean } {
  const repOk = repLevel(s.xp) >= SHOP.rep, earnedOk = s.totalEarned >= SHOP.earned, cashOk = s.cash >= SHOP.price;
  return { repOk, earnedOk, cashOk, ready: repOk && earnedOk && cashOk && !s.shopOwned, owned: !!s.shopOwned };
}
export function buyShop(s: GameState): boolean {
  if (!shopState(s).ready) return false;
  s.cash -= SHOP.price; s.today.spent += SHOP.price; s.shopOwned = true;
  return true;
}
