/**
 * «Правильная прокладка кабелей» — пятнашки 3×3 из кусков кабеля.
 *
 * Блок питания внизу, у него три модульных гнезда (под колонками 0, 1, 2).
 * Собранная раскладка — три аккуратных трассы:
 *   - CPU 8-pin: из гнезда 0 прямо вверх по левой колонке к процессору;
 *   - 24-pin: из гнезда 1 вверх и поворот вправо, к разъёму платы справа;
 *   - питание видеокарты: из гнезда 2 сразу поворот вправо.
 * Две клетки сверху справа без кабеля: одна пустая (по ней двигают),
 * вторая — «заглушка». Они взаимозаменяемы, как и два одинаковых куска
 * CPU-кабеля, поэтому победа — «каждый кусок кабеля стоит на месте трассы»,
 * а не «каждая плитка на своём номере»: иначе игрок собирал рисунок
 * правильно, а пазл не засчитывался.
 *
 * Логика чистая (без DOM): перемешивание, ход, проверка, трассировка.
 */

import { Rng } from './rng.ts';

/** Стороны клетки битами: верх, право, низ, лево. */
export const N = 1, E = 2, S = 4, W = 8;
export type Wire = 'cpu' | 'atx' | 'gpu';
export interface Tile { wire: Wire | null; ends: number }

export const SIZE = 3;
/** Решённое поле, по строкам сверху вниз; null — пустая клетка. */
export const SOLVED: (Tile | null)[] = [
  { wire: 'cpu', ends: N | S }, { wire: null, ends: 0 }, null,
  { wire: 'cpu', ends: N | S }, { wire: 'atx', ends: S | E }, { wire: 'atx', ends: W | E },
  { wire: 'cpu', ends: N | S }, { wire: 'atx', ends: N | S }, { wire: 'gpu', ends: S | E },
];

/** Куда ведёт каждый кабель: гнездо БП (колонка снизу) и выход трассы. */
export const ROUTES: Record<Wire, { port: number; out: { side: 'top' | 'right'; at: number } }> = {
  cpu: { port: 0, out: { side: 'top', at: 0 } },
  atx: { port: 1, out: { side: 'right', at: 1 } },
  gpu: { port: 2, out: { side: 'right', at: 2 } },
};

export interface Board { cells: (Tile | null)[]; moves: number }

const key = (t: Tile | null) => (t && t.wire ? t.wire + t.ends : '');
const nbrs = (i: number): number[] => {
  const r = Math.floor(i / SIZE), c = i % SIZE, out: number[] = [];
  if (r > 0) out.push(i - SIZE);
  if (r < SIZE - 1) out.push(i + SIZE);
  if (c > 0) out.push(i - 1);
  if (c < SIZE - 1) out.push(i + 1);
  return out;
};

/**
 * Перемешать случайными ХОДАМИ от собранного поля: так пазл всегда решаем
 * (случайная перестановка пятнашек нерешаема в половине случаев).
 * `steps` — сложность: 14–22 хода дают задачу секунд на 20–40.
 */
export function shuffle(seed: number, steps = 18): Board {
  const r = new Rng(seed);
  const cells = SOLVED.slice();
  let empty = cells.indexOf(null), prev = -1;
  for (let k = 0; k < steps || solved({ cells, moves: 0 }); k++) {
    const opts = nbrs(empty).filter((i) => i !== prev);
    const j = r.pick(opts);
    cells[empty] = cells[j]; cells[j] = null;
    prev = empty; empty = j;
  }
  return { cells, moves: 0 };
}

/** Сдвинуть плитку в пустую клетку, если она рядом. */
export function slide(b: Board, i: number): boolean {
  const e = b.cells.indexOf(null);
  if (!nbrs(e).includes(i)) return false;
  b.cells[e] = b.cells[i]; b.cells[i] = null;
  b.moves++;
  return true;
}

export function solved(b: Board): boolean {
  return b.cells.every((t, i) => key(t) === key(SOLVED[i]));
}

/**
 * Какие клетки уже соединены со своим гнездом БП — для подсветки «ток идёт»:
 * игрок видит, сколько трассы уже правильно, и пятнашки не превращаются
 * в перебор вслепую. Возвращает индексы клеток по каждому кабелю и признак
 * «дошёл до разъёма».
 */
export function trace(b: Board): Record<Wire, { cells: number[]; done: boolean }> {
  const res = {} as Record<Wire, { cells: number[]; done: boolean }>;
  for (const w of Object.keys(ROUTES) as Wire[]) {
    const R = ROUTES[w];
    let i = (SIZE - 1) * SIZE + R.port, from = S;
    const cells: number[] = [];
    let done = false;
    for (let guard = 0; guard < 9; guard++) {
      const t = b.cells[i];
      if (!t || t.wire !== w || !(t.ends & from)) break;
      cells.push(i);
      const out = t.ends & ~from;
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
