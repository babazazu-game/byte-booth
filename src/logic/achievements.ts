/**
 * Достижения: счётчики событий (s.stats) и список целей с наградами.
 * Проверка — после выдачи заказа, конца дня и мелких событий (паутина, радио).
 * Чистая логика.
 */
import type { GameState } from './state.ts';
import { repLevel } from './orders.ts';

export type StatKey = 'build5' | 'white' | 'clean' | 'tidy' | 'grumpy5' | 'hurryOk' | 'fickleOk' | 'blogGood' | 'noMinus' | 'noMinusBest' | 'cobweb' | 'radio';

export interface Ach { id: string; icon: string; need: number; reward: number; value: (s: GameState) => number }

const st = (s: GameState, k: StatKey): number => s.stats?.[k] ?? 0;

export const ACHS: Ach[] = [
  { id: 'first', icon: '🔧', need: 1, reward: 50, value: (s) => s.built },
  { id: 'build10', icon: '🖥️', need: 10, reward: 200, value: (s) => s.built },
  { id: 'build50', icon: '🏭', need: 50, reward: 800, value: (s) => s.built },
  { id: 'perfect10', icon: '⭐', need: 10, reward: 300, value: (s) => st(s, 'build5') },
  { id: 'white5', icon: '🤍', need: 5, reward: 200, value: (s) => st(s, 'white') },
  { id: 'clean10', icon: '🧹', need: 10, reward: 200, value: (s) => st(s, 'clean') },
  { id: 'tidy10', icon: '🧶', need: 10, reward: 200, value: (s) => st(s, 'tidy') },
  { id: 'grumpy', icon: '😤', need: 1, reward: 150, value: (s) => st(s, 'grumpy5') },
  { id: 'hurry3', icon: '⏱️', need: 3, reward: 200, value: (s) => st(s, 'hurryOk') },
  { id: 'fickle', icon: '📞', need: 1, reward: 100, value: (s) => st(s, 'fickleOk') },
  { id: 'blogger', icon: '🎥', need: 1, reward: 250, value: (s) => st(s, 'blogGood') },
  { id: 'week', icon: '📅', need: 7, reward: 300, value: (s) => st(s, 'noMinusBest') },
  { id: 'rich', icon: '💰', need: 50000, reward: 500, value: (s) => s.totalEarned },
  { id: 'rep5', icon: '🏅', need: 5, reward: 300, value: (s) => repLevel(s.xp) },
  { id: 'rep10', icon: '🏆', need: 10, reward: 1000, value: (s) => repLevel(s.xp) },
  { id: 'districts', icon: '🗺️', need: 5, reward: 1000, value: (s) => (s.districts ?? ['park']).length },
  { id: 'cobweb', icon: '🕷️', need: 5, reward: 50, value: (s) => st(s, 'cobweb') },
  { id: 'radio', icon: '📻', need: 10, reward: 30, value: (s) => st(s, 'radio') },
  { id: 'shop', icon: '🏬', need: 1, reward: 0, value: (s) => (s.shopOwned ? 1 : 0) },
];

export function bump(s: GameState, k: StatKey, n = 1): void {
  const m = (s.stats ??= {});
  m[k] = (m[k] ?? 0) + n;
}

/** Открыть всё, что выполнено: награда сразу в кассу. Возвращает новые. */
export function checkAch(s: GameState): Ach[] {
  const got = (s.ach ??= []);
  const fresh: Ach[] = [];
  for (const a of ACHS) {
    if (got.includes(a.id) || a.value(s) < a.need) continue;
    got.push(a.id); s.cash += a.reward; fresh.push(a);
  }
  return fresh;
}
