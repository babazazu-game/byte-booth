/**
 * Районы города. Ларёк один и тот же (с покраской, статуэтками и постерами),
 * но его можно перевезти — и вокруг меняется всё: вид из окна, публика,
 * её деньги и аренда.
 *
 * Цель игры — не «накопить на магазин» (магазина в игре нет и не будет:
 * вся жизнь в ларьке), а поработать во всех трёх районах и стать
 * «легендой города» — дойти до репутации LEGEND_REP.
 *
 * Чистые данные и функции, без 3D.
 */

import type { Arch } from './customers.ts';

export type DistrictId = 'park' | 'block' | 'harbor' | 'center' | 'old';

export interface District {
  id: DistrictId;
  /** С какой репутации можно переехать и сколько стоит первый переезд (разрешение + эвакуатор). */
  minRep: number;
  cost: number;
  /** Множители аренды и бюджета заказов. */
  rentK: number;
  payK: number;
  /** Кто сюда ходит (null — все архетипы). */
  archs: Arch[] | null;
  /** Вероятности видов заказа: сборка / апгрейд / чистка (null — как у архетипа). */
  kinds: [number, number, number] | null;
}

export const DISTRICTS: Record<DistrictId, District> = {
  park: { id: 'park', minRep: 1, cost: 0, rentK: 1, payK: 1, archs: null, kinds: null },
  // Спальный район: семьи, пенсионеры, школьники. Денег меньше, зато много
  // апгрейдов и чисток старых компьютеров, аренда дешевле.
  block: { id: 'block', minRep: 3, cost: 1500, rentK: 0.8, payK: 0.97, archs: ['dad', 'grandma', 'student', 'teen', 'office', 'gamer', 'gamergirl', 'builder', 'schoolkid'], kinds: [0.42, 0.33, 0.25] },
  // Деловой центр: офисы и богатые клиенты. Дорогие сборки и щедрые чаевые,
  // но аренда кусается, а заказы капризнее (чаще «надёжный», «тихий», «белый»).
  // Набережная: туристы и молодёжь у моря — игровые сборки и апгрейды, щедрые чаевые.
  harbor: { id: 'harbor', minRep: 4, cost: 3500, rentK: 1.2, payK: 1.1, archs: ['gamer', 'gamergirl', 'streamer', 'student', 'designer', 'teen', 'dad'], kinds: [0.62, 0.3, 0.08] },
  center: { id: 'center', minRep: 6, cost: 6500, rentK: 1.7, payK: 1.25, archs: ['boss', 'designer', 'coder', 'office', 'streamer', 'crypto', 'oligarch'], kinds: [0.72, 0.23, 0.05] },
  // Старый город: коллекционеры и солидная публика — дорогие надёжные сборки, аренда высокая.
  old: { id: 'old', minRep: 8, cost: 12000, rentK: 2.0, payK: 1.35, archs: ['grandma', 'boss', 'designer', 'coder', 'oligarch', 'dad', 'crypto'], kinds: [0.6, 0.3, 0.1] },
};
export const DISTRICT_IDS = Object.keys(DISTRICTS) as DistrictId[];

/** Повторный переезд в уже открытый район — только эвакуатор. */
export const MOVE_BACK = 300;
export const LEGEND_REP = 8;
