/**
 * «Правильная прокладка кабелей» — плитки 3×3, каждая на своём месте, но
 * повёрнута. Нажатие поворачивает плитку на 90°; цель — чтобы все три кабеля
 * дошли от гнёзд блока питания (снизу) до своих разъёмов.
 *
 * Раньше были пятнашки со сдвигом плиток — автор ни разу не смог их собрать.
 * Поворот читается сразу: видно, какой кусок «смотрит не туда».
 *
 * Собранная раскладка — три трассы:
 *   - CPU 8-pin: из гнезда 0 прямо вверх по левой колонке к процессору;
 *   - 24-pin: из гнезда 1 вверх и поворот вправо, к разъёму платы справа;
 *   - питание видеокарты: из гнезда 2 сразу поворот вправо.
 * Две клетки сверху справа — заглушки. Логика чистая (без DOM).
 */

import { Rng } from './rng.ts';

/** Стороны клетки битами: верх, право, низ, лево. */
export const N = 1, E = 2, S = 4, W = 8;
export type Wire = 'cpu' | 'atx' | 'gpu';
export interface Tile { wire: Wire | null; ends: number }

export const SIZE = 3;
/** Решённое поле, по строкам сверху вниз. */
export const SOLVED: Tile[] = [
  { wire: 'cpu', ends: N | S }, { wire: null, ends: 0 }, { wire: null, ends: 0 },
  { wire: 'cpu', ends: N | S }, { wire: 'atx', ends: S | E }, { wire: 'atx', ends: W | E },
  { wire: 'cpu', ends: N | S }, { wire: 'atx', ends: N | S }, { wire: 'gpu', ends: S | E },
];

/** Куда ведёт каждый кабель: гнездо БП (колонка снизу) и выход трассы. */
export const ROUTES: Record<Wire, { port: number; out: { side: 'top' | 'right'; at: number } }> = {
  cpu: { port: 0, out: { side: 'top', at: 0 } },
  atx: { port: 1, out: { side: 'right', at: 1 } },
  gpu: { port: 2, out: { side: 'right', at: 2 } },
};

/** rot — сколько раз плитка повёрнута на 90° по часовой относительно правильного положения. */
export interface Board { cells: Tile[]; rot: number[]; moves: number }

/** Повернуть набор концов на 90° по часовой: верх→право→низ→лево. */
export const rotEnds = (e: number, k = 1): number => { let x = e; for (let i = 0; i < ((k % 4) + 4) % 4; i++) x = ((x << 1) | (x >> 3)) & 15; return x; };
/** Текущие концы плитки с учётом поворота. */
export const endsAt = (b: Board, i: number): number => rotEnds(b.cells[i].ends, b.rot[i]);

/** Перемешать: каждой плитке с кабелем — случайный поворот (минимум три «не так»). */
export function shuffle(seed: number): Board {
  const r = new Rng(seed);
  const b: Board = { cells: SOLVED.slice(), rot: SOLVED.map(() => 0), moves: 0 };
  for (let tries = 0; tries < 50; tries++) {
    b.rot = SOLVED.map((t) => (t.wire ? r.int(0, 3) : 0));
    const wrong = b.cells.filter((t, i) => t.wire && endsAt(b, i) !== t.ends).length;
    if (wrong >= 3) break;
  }
  return b;
}

/** Повернуть плитку на 90°. Заглушки не крутятся. */
export function turn(b: Board, i: number): boolean {
  if (!b.cells[i].wire) return false;
  b.rot[i] = (b.rot[i] + 1) % 4;
  b.moves++;
  return true;
}

export function solved(b: Board): boolean {
  return b.cells.every((t, i) => !t.wire || endsAt(b, i) === t.ends);
}

/**
 * Какие клетки уже соединены со своим гнездом БП — для подсветки «ток идёт».
 */
export function trace(b: Board): Record<Wire, { cells: number[]; done: boolean }> {
  const res = {} as Record<Wire, { cells: number[]; done: boolean }>;
  for (const w of Object.keys(ROUTES) as Wire[]) {
    const R = ROUTES[w];
    let i = (SIZE - 1) * SIZE + R.port, from = S;
    const cells: number[] = [];
    let done = false;
    for (let guard = 0; guard < 9; guard++) {
      const t = b.cells[i], ends = endsAt(b, i);
      if (!t.wire || t.wire !== w || !(ends & from)) break;
      cells.push(i);
      const out = ends & ~from;
      const r = Math.floor(i / SIZE), c = i % SIZE;
      if (out === N && r === 0) { done = R.out.side === 'top' && R.out.at === c; break; }
      if (out === E && c === SIZE - 1) { done = R.out.side === 'right' && R.out.at === r; break; }
      if (out === N) { i -= SIZE; from = S; } else if (out === E) { i += 1; from = W; }
      else if (out === S) { if (r === SIZE - 1) break; i += SIZE; from = N; } else { if (c === 0) break; i -= 1; from = E; }
    }
    res[w] = { cells, done };
  }
  return res;
}
