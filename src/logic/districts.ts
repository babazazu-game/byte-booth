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

export type DistrictId = 'park' | 'block' | 'center';

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
  center: { id: 'center', minRep: 5, cost: 6500, rentK: 1.7, payK: 1.25, archs: ['boss', 'designer', 'coder', 'office', 'streamer', 'crypto', 'oligarch'], kinds: [0.72, 0.23, 0.05] },
};
export const DISTRICT_IDS = Object.keys(DISTRICTS) as DistrictId[];

/** Повторный переезд в уже открытый район — только эвакуатор. */
export const MOVE_BACK = 300;
export const LEGEND_REP = 8;
