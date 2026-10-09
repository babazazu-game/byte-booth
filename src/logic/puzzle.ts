/**
 * «Правильная прокладка кабелей» — плитки 3×3, каждая на своём месте, но
 * повёрнута. Нажатие поворачивает плитку на 90°; цель — чтобы все три кабеля
 * дошли от гнёзд блока питания (снизу) до своих разъёмов.
 *
 * Раньше были пятнашки со сдвигом плиток — автор ни разу не смог их собрать.
 * Поворот читается сразу: видно, какой кусок «смотрит не туда».
 *
 * Раскладка (какой кабель в каком гнезде, куда выходит) строится заново
 * для каждой партии, свободные клетки — заглушки. Логика чистая (без DOM).
 */

import { Rng } from './rng.ts';

/** Стороны клетки битами: верх, право, низ, лево. */
export const N = 1, E = 2, S = 4, W = 8;
export type Wire = 'cpu' | 'atx' | 'gpu';
export interface Tile { wire: Wire | null; ends: number }

export const SIZE = 3;

/** Куда ведёт кабель: гнездо БП (колонка снизу) и выход трассы на краю поля. */
export interface Route { port: number; out: { side: 'top' | 'right'; at: number } }

/**
 * rot — сколько раз плитка повёрнута на 90° по часовой относительно правильного
 * положения; cells — правильные плитки; routes — гнёзда и выходы этой партии.
 */
export interface Board { cells: Tile[]; rot: number[]; moves: number; routes: Record<Wire, Route> }

/**
 * Раскладка каждый раз своя: кабели по-разному распределены по гнёздам БП,
 * трассы идут вверх/вправо по свободным клеткам и выходят к разным разъёмам
 * (сверху над колонкой или справа у строки). Раньше поле было одно и то же.
 */
export function layout(r: Rng): { cells: Tile[]; routes: Record<Wire, Route> } {
  const wires: Wire[] = ['cpu', 'atx', 'gpu'];
  for (let tries = 0; tries < 400; tries++) {
    const order = wires.slice().sort(() => r.next() - 0.5);
    const cells: Tile[] = Array.from({ length: SIZE * SIZE }, () => ({ wire: null, ends: 0 }));
    const routes = {} as Record<Wire, Route>;
    const used = new Set<string>();
    let ok = true, corners = 0;
    for (const port of [0, 1, 2].sort(() => r.next() - 0.5)) {
      const w = order[port];
      let i = (SIZE - 1) * SIZE + port, from = S, steps = 0;
      if (cells[i].wire) { ok = false; break; }
      for (;;) {
        const row = Math.floor(i / SIZE), col = i % SIZE;
        // варианты: дальше вверх/вправо по свободной клетке или выход на краю
        const opts: { dir: number; exit: boolean }[] = [];
        if (row > 0 && !cells[i - SIZE].wire) opts.push({ dir: N, exit: false });
        if (col < SIZE - 1 && !cells[i + 1].wire) opts.push({ dir: E, exit: false });
        if (row === 0 && !used.has('top' + col) && steps > 0) opts.push({ dir: N, exit: true });
        if (col === SIZE - 1 && !used.has('right' + row) && steps > 0) opts.push({ dir: E, exit: true });
        if (!opts.length) { ok = false; break; }
        const o = opts[r.int(0, opts.length - 1)];
        cells[i] = { wire: w, ends: from | o.dir };
        if (!((from | o.dir) === (N | S) || (from | o.dir) === (E | W))) corners++;
        steps++;
        if (o.exit) {
          const side = o.dir === N ? 'top' : 'right', at = o.dir === N ? col : row;
          used.add(side + at); routes[w] = { port, out: { side, at } };
          break;
        }
        if (o.dir === N) { i -= SIZE; from = S; } else { i += 1; from = W; }
      }
      if (!ok) break;
    }
    // скучные поля (почти без поворотов) — заново
    if (ok && corners >= 2) return { cells, routes };
  }
  // запасной вариант: прежнее поле
  return {
    cells: [
      { wire: 'cpu', ends: N | S }, { wire: null, ends: 0 }, { wire: null, ends: 0 },
      { wire: 'cpu', ends: N | S }, { wire: 'atx', ends: S | E }, { wire: 'atx', ends: W | E },
      { wire: 'cpu', ends: N | S }, { wire: 'atx', ends: N | S }, { wire: 'gpu', ends: S | E },
    ],
    routes: { cpu: { port: 0, out: { side: 'top', at: 0 } }, atx: { port: 1, out: { side: 'right', at: 1 } }, gpu: { port: 2, out: { side: 'right', at: 2 } } },
  };
}

/** Повернуть набор концов на 90° по часовой: верх→право→низ→лево. */
export const rotEnds = (e: number, k = 1): number => { let x = e; for (let i = 0; i < ((k % 4) + 4) % 4; i++) x = ((x << 1) | (x >> 3)) & 15; return x; };
/** Текущие концы плитки с учётом поворота. */
export const endsAt = (b: Board, i: number): number => rotEnds(b.cells[i].ends, b.rot[i]);

/** Перемешать: каждой плитке с кабелем — случайный поворот (минимум три «не так»). */
export function shuffle(seed: number): Board {
  const r = new Rng(seed);
  const L = layout(r);
  const b: Board = { cells: L.cells, rot: L.cells.map(() => 0), moves: 0, routes: L.routes };
  for (let tries = 0; tries < 50; tries++) {
    b.rot = b.cells.map((t) => (t.wire ? r.int(0, 3) : 0));
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
  for (const w of Object.keys(b.routes) as Wire[]) {
    const R = b.routes[w];
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
