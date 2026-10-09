/**
 * Клиенты: архетипы, внешность, голос.
 *
 * Архетип задаёт ВСЁ, что игрок может «прочитать» по человеку у окошка:
 * какие сборки он обычно просит, насколько щедр, торгуется ли. Внешность
 * генерируется из архетипа и сида — один и тот же клиент, пришедший за
 * готовым заказом, выглядит так же, как когда заказывал.
 */

import { Rng } from './rng.ts';

export type Arch =
  | 'gamer' | 'office' | 'grandma' | 'crypto' | 'streamer' | 'boss'
  | 'student' | 'designer' | 'dad' | 'coder' | 'gamergirl' | 'teen'
  | 'oligarch' | 'builder' | 'schoolkid';

export type HairStyle = 'curly' | 'short' | 'bun' | 'long' | 'bald' | 'spiky' | 'bob' | 'cap' | 'pony';
export type TopKind = 'hoodie' | 'shirt' | 'sweater' | 'jersey' | 'suit' | 'tee';
export type Glasses = 'none' | 'round' | 'square' | 'sun';

export interface PersonLook {
  skin: string;
  hair: HairStyle;
  hairColor: string;
  top: TopKind;
  topColor: string;
  topColor2: string;
  pants: string;
  shoes: string;
  glasses: Glasses;
  headphones: boolean;
  beard: boolean;
  /** Ширина и рост тела, около 1. */
  w: number;
  h: number;
  /** Голос: высота (полутоны от базы) и темп. */
  pitch: number;
  rate: number;
  print: 'pad' | 'btc' | 'heart' | 'star' | 'none' | 'logo' | 'rocket';
  /** Строительная каска поверх короткой стрижки. */
  hardhat?: boolean;
  /** Сигнальный жилет поверх рубашки. */
  vest?: boolean;
  /** Школьный рюкзак за спиной. */
  backpack?: string;
  /** Золотая цепь и часы. */
  gold?: boolean;
}

export interface ArchDef {
  presets: string[];
  /** Вероятности видов заказа: сборка / апгрейд / чистка. */
  kinds: [number, number, number];
  budgetK: number;
  /** Шанс согласиться на надбавку при торге. */
  haggle: number;
  tipK: number;
  minRep: number;
  look: (r: Rng) => Partial<PersonLook>;
}

// Самые тёмные тона убраны: в «глиняном» стиле они выходили почти чёрными.
const SKINS = ['#f3c4a2', '#eaa47e', '#d98e66', '#c98a62', '#b97c56', '#f6d2b8', '#e8b48e'];
const HAIR_C = ['#2b1d14', '#4a2f1d', '#6b4429', '#8a5a33', '#b07a3e', '#d9b36a', '#1a1a1e', '#a8a39c', '#e8e4dc', '#c2452d'];

export const ARCHS: Record<Arch, ArchDef> = {
  gamer: { presets: ['esports', 'fhd', 'qhd'], kinds: [0.6, 0.3, 0.1], budgetK: 1.0, haggle: 0.45, tipK: 1, minRep: 1,
    look: (r) => ({ hair: r.pick(['curly', 'spiky', 'short']), top: 'hoodie', topColor: r.pick(['#8f6b7c', '#5e7d4f', '#3d5a8a', '#2b2d36']), glasses: r.pick(['round', 'none', 'square']), headphones: true, print: 'pad' }) },
  office: { presets: ['office', 'office', 'esports'], kinds: [0.5, 0.2, 0.3], budgetK: 0.95, haggle: 0.6, tipK: 0.8, minRep: 1,
    look: (r) => ({ hair: r.pick(['short', 'bob', 'bald']), top: 'shirt', topColor: r.pick(['#e9eef4', '#cfe0f0', '#f0e4d4']), topColor2: r.pick(['#3d5a8a', '#8a3d4f', '#2b2d36']), glasses: r.pick(['none', 'square']), print: 'none' }) },
  grandma: { presets: ['office'], kinds: [0.45, 0.1, 0.45], budgetK: 1.1, haggle: 0.8, tipK: 1.6, minRep: 1,
    look: (r) => ({ hair: 'bun', hairColor: r.pick(['#e8e4dc', '#c9c4bc', '#a8a39c']), top: 'sweater', topColor: r.pick(['#c86b8a', '#7d9ac8', '#c8a46b']), glasses: 'round', w: 1.05, h: 0.92, pitch: 5, print: 'none' }) },
  crypto: { presets: ['qhd', 'uhd', 'work'], kinds: [0.75, 0.2, 0.05], budgetK: 1.15, haggle: 0.3, tipK: 1.3, minRep: 3,
    look: (r) => ({ hair: r.pick(['short', 'spiky']), top: 'hoodie', topColor: '#2b2d36', glasses: 'sun', print: 'btc', beard: r.chance(0.5) }) },
  streamer: { presets: ['stream', 'qhd', 'uhd'], kinds: [0.6, 0.35, 0.05], budgetK: 1.05, haggle: 0.4, tipK: 1.2, minRep: 2,
    look: (r) => ({ hair: r.pick(['spiky', 'pony', 'short']), hairColor: r.pick(['#c2452d', '#8a5bff', '#2b1d14']), top: 'jersey', topColor: '#5b3fa8', topColor2: '#f2a13a', headphones: true, print: 'logo' }) },
  boss: { presets: ['uhd', 'work', 'qhd'], kinds: [0.7, 0.2, 0.1], budgetK: 1.2, haggle: 0.15, tipK: 1.4, minRep: 4,
    look: (r) => ({ hair: r.pick(['short', 'bald']), hairColor: r.pick(['#a8a39c', '#2b1d14']), top: 'suit', topColor: '#2c3550', topColor2: '#b8333f', glasses: r.pick(['square', 'none']), print: 'none', w: 1.08 }) },
  student: { presets: ['office', 'esports', 'mini'], kinds: [0.55, 0.3, 0.15], budgetK: 0.9, haggle: 0.7, tipK: 0.7, minRep: 1,
    look: (r) => ({ hair: r.pick(['pony', 'bob', 'long', 'curly']), top: r.pick(['tee', 'hoodie']), topColor: r.pick(['#e6b35a', '#7fc7b8', '#e07a7a']), glasses: r.pick(['none', 'round']), print: r.pick(['heart', 'star']) }) },
  designer: { presets: ['work', 'qhd', 'mini'], kinds: [0.65, 0.25, 0.1], budgetK: 1.1, haggle: 0.35, tipK: 1.2, minRep: 3,
    look: (r) => ({ hair: r.pick(['bob', 'bun', 'long']), hairColor: r.pick(['#1a1a1e', '#c2452d', '#e8d5a8']), top: 'tee', topColor: r.pick(['#1d1f24', '#ecebe7']), glasses: 'square', print: 'star' }) },
  dad: { presets: ['fhd', 'office', 'esports'], kinds: [0.5, 0.3, 0.2], budgetK: 1.0, haggle: 0.55, tipK: 1.1, minRep: 1,
    look: (r) => ({ hair: r.pick(['short', 'bald']), top: r.pick(['sweater', 'shirt']), topColor: r.pick(['#5e7d4f', '#8a6a4a', '#3d5a8a']), topColor2: '#2b2d36', beard: r.chance(0.6), w: 1.12, print: 'none' }) },
  coder: { presets: ['work', 'qhd', 'mini'], kinds: [0.6, 0.3, 0.1], budgetK: 1.05, haggle: 0.4, tipK: 1, minRep: 2,
    look: (r) => ({ hair: r.pick(['long', 'curly', 'short']), top: 'hoodie', topColor: r.pick(['#2b2d36', '#3d5a8a']), glasses: r.pick(['square', 'round']), beard: r.chance(0.7), headphones: r.chance(0.5), print: 'logo' }) },
  gamergirl: { presets: ['fhd', 'qhd', 'stream'], kinds: [0.6, 0.3, 0.1], budgetK: 1.0, haggle: 0.45, tipK: 1.1, minRep: 2,
    look: (r) => ({ hair: r.pick(['pony', 'long', 'bob']), hairColor: r.pick(['#d9b36a', '#c86b8a', '#8a5bff', '#2b1d14']), top: 'hoodie', topColor: r.pick(['#e7a6c0', '#a8d8f0', '#c7b0e8']), headphones: true, print: 'heart' }) },
  teen: { presets: ['esports', 'fhd'], kinds: [0.6, 0.35, 0.05], budgetK: 0.85, haggle: 0.65, tipK: 0.6, minRep: 1,
    look: (r) => ({ hair: r.pick(['cap', 'spiky', 'curly']), top: r.pick(['tee', 'hoodie', 'jersey']), topColor: r.pick(['#3fb6a8', '#e2674f', '#f6d36b']), topColor2: '#2b2d36', w: 0.92, h: 0.88, pitch: 3, print: r.pick(['pad', 'star']) }) },
  // новые лица улицы: богатый, рабочий и школьник — разная публика по районам
  oligarch: { presets: ['uhd', 'work', 'qhd'], kinds: [0.85, 0.15, 0], budgetK: 1.5, haggle: 0.05, tipK: 2.2, minRep: 5,
    look: (r) => ({ hair: r.pick(['short', 'bald']), hairColor: r.pick(['#a8a39c', '#2b1d14', '#4a2f1d']), top: 'suit', topColor: r.pick(['#5a1f2a', '#1c2236', '#f0ece4']), topColor2: '#d4a83a', glasses: 'sun', print: 'none', w: 1.22, h: 1.02, beard: r.chance(0.3), gold: true, pitch: -3 }) },
  builder: { presets: ['office', 'esports', 'fhd'], kinds: [0.45, 0.3, 0.25], budgetK: 0.95, haggle: 0.6, tipK: 0.9, minRep: 1,
    look: (r) => ({ hair: 'short', hairColor: r.pick(['#2b1d14', '#6b4429', '#b07a3e']), top: 'shirt', topColor: r.pick(['#5d6f86', '#6b7a52', '#7a6a58']), topColor2: '#2b2d36', glasses: 'none', print: 'none', beard: r.chance(0.6), hardhat: true, vest: true, pants: '#3a4a6b', shoes: '#6b4a32', w: 1.1 }) },
  schoolkid: { presets: ['esports', 'office'], kinds: [0.55, 0.35, 0.1], budgetK: 0.8, haggle: 0.7, tipK: 0.5, minRep: 1,
    look: (r) => ({ hair: r.pick(['short', 'spiky', 'curly']), hairColor: r.pick(['#2b1d14', '#4a2f1d', '#8a5a33', '#d9b36a']), top: r.pick(['tee', 'hoodie']), topColor: r.pick(['#3fb6a8', '#f6d36b', '#e2674f', '#7d9ac8']), topColor2: r.pick(['#d8382f', '#3b7bd0', '#2fa36b']), glasses: r.pick(['none', 'none', 'round']), print: 'rocket', backpack: r.pick(['#d8382f', '#3b7bd0', '#f2a13a', '#8a5bff']), w: 0.86, h: 0.8, pitch: 6 }) },
};

export function makeLook(arch: Arch, seed: number): PersonLook {
  const r = new Rng(seed);
  const base: PersonLook = {
    skin: r.pick(SKINS),
    hair: 'short',
    hairColor: r.pick(HAIR_C.slice(0, 7)),
    top: 'hoodie',
    topColor: '#8f6b7c',
    topColor2: '#2b2d36',
    pants: r.pick(['#4c6189', '#3a4a6b', '#2b2d36', '#6b5a48', '#55606e']),
    shoes: r.pick(['#f3f1ec', '#2b2d36', '#e2674f', '#c9cdd4']),
    glasses: 'none',
    headphones: false,
    beard: false,
    w: r.range(0.95, 1.08),
    h: r.range(0.95, 1.05),
    pitch: r.range(-3, 3),
    rate: r.range(0.9, 1.15),
    print: 'none',
  };
  const over = ARCHS[arch].look(r);
  const look = { ...base, ...over };
  // Борода у бабушек и студенток не растёт, а вот «женские» причёски
  // ничего не говорят о голосе — высоту голоса задаёт сам архетип.
  if (['bun', 'pony', 'long', 'bob'].includes(look.hair)) { look.beard = false; look.pitch += 4; }
  return look;
}

/** Имена: количество в ru и en словарях одинаковое — индекс общий. */
export const NAME_COUNT = 24;
