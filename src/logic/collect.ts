/**
 * Обустройство мастерской: покраска стен и коллекционные статуэтки.
 *
 * Не влияет на экономику — это «для души», как в ReStory: игрок тратит
 * заработанное на то, чтобы ларёк стал его. Чистые данные и функции, без 3D.
 */

import type { GameState } from './state.ts';

export interface WallPaint { id: string; hex: string; price: number }
/** Палитра стен. Первая — бесплатная, по умолчанию. */
export const WALLS: WallPaint[] = [
  { id: 'sage', hex: '#86a493', price: 0 },
  { id: 'teal', hex: '#3e7471', price: 150 },
  { id: 'navy', hex: '#3d5175', price: 150 },
  { id: 'plum', hex: '#6d4a6b', price: 150 },
  { id: 'terra', hex: '#a35f45', price: 150 },
  { id: 'mustard', hex: '#b48e3c', price: 150 },
  { id: 'cream', hex: '#d6c8aa', price: 150 },
  { id: 'graphite', hex: '#4b5059', price: 150 },
];

export interface Figurine { id: string; price: number }
/** Коллекция статуэток: встают на подставку на прилавке по порядку покупки. */
export const FIGS: Figurine[] = [
  { id: 'duck', price: 60 },
  { id: 'cat', price: 120 },
  { id: 'dino', price: 180 },
  { id: 'rocket', price: 220 },
  { id: 'astro', price: 300 },
  { id: 'gamepad', price: 400 },
  { id: 'tower', price: 500 },
  { id: 'cup', price: 900 },
];

export interface Poster { id: string; price: number }
/**
 * Постеры — пародии на известные игры: узнаваемо, но без настоящих названий
 * и логотипов (чужие арты и товарные знаки площадка не пропустит).
 * Картинки — assets/tex/poster_N.webp, N = индекс. Id старые, чтобы купленные
 * постеры в сохранениях остались на своих местах.
 */
export const POSTERS: Poster[] = [
  { id: 'fantasy', price: 90 },
  { id: 'space', price: 110 },
  { id: 'racing', price: 130 },
  { id: 'cyber', price: 150 },
  { id: 'retro', price: 170 },
  { id: 'blocks', price: 190 },
];

export function buyPoster(s: GameState, id: string): string | null {
  const p = POSTERS.find((x) => x.id === id);
  if (!p) return 'err.noItem';
  if ((s.posters ?? []).includes(id)) return 'err.maxed';
  if (s.cash < p.price) return 'err.noMoney';
  s.cash -= p.price; s.today.spent += p.price;
  s.posters = [...(s.posters ?? []), id];
  return null;
}

export const wallOf = (s: GameState): WallPaint => WALLS.find((w) => w.id === s.wall) ?? WALLS[0];
export const ownedWalls = (s: GameState): string[] => ['sage', ...(s.walls ?? [])];

/** Купить цвет (или выбрать уже купленный). */
export function paintWall(s: GameState, id: string): string | null {
  const w = WALLS.find((x) => x.id === id);
  if (!w) return 'err.noItem';
  if (!ownedWalls(s).includes(id)) {
    if (s.cash < w.price) return 'err.noMoney';
    s.cash -= w.price; s.today.spent += w.price;
    s.walls = [...(s.walls ?? []), id];
  }
  s.wall = id;
  return null;
}

export function buyFig(s: GameState, id: string): string | null {
  const f = FIGS.find((x) => x.id === id);
  if (!f) return 'err.noItem';
  if ((s.figs ?? []).includes(id)) return 'err.maxed';
  if (s.cash < f.price) return 'err.noMoney';
  s.cash -= f.price; s.today.spent += f.price;
  s.figs = [...(s.figs ?? []), id];
  return null;
}
