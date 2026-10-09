/**
 * Каталог комплектующих.
 *
 * Названия настоящие — так решил автор игры: узнаваемое железо делает рынок
 * «живым», игрок сам знает, что RTX 5090 дорогая, а i3 — офисный. Цены — в
 * долларах, порядок величин соответствует рынку 2025–2026, но это БАЗА:
 * в игре цена каждый день гуляет вокруг неё (см. market.ts).
 *
 * `perf` — условная производительность 0..120. Абсолютные числа не важны,
 * важны соотношения: из них считается игровой балл сборки (compat.ts),
 * а балл сравнивается с требованиями заказов (orders.ts). Поменять баланс —
 * значит менять perf здесь и пороги пресетов в orders.ts, больше нигде.
 *
 * `rep` — с какого уровня репутации деталь появляется на рынке. Новичку
 * сразу 60 позиций не нужны: он утонет в выборе и не поймёт совместимость.
 */

export type Cat = 'cpu' | 'gpu' | 'mb' | 'ram' | 'ssd' | 'psu' | 'cooler' | 'case' | 'paste';
export type Socket = 'LGA1700' | 'LGA1851' | 'AM4' | 'AM5';
export type Form = 'ATX' | 'mATX' | 'ITX';
export type RamType = 'DDR4' | 'DDR5';

/** Внешний вид модели: из этих цветов процедурно собирается 3D и коробка. */
export interface Look {
  main: string;
  accent: string;
  dark?: string;
}

interface Base {
  id: string;
  cat: Cat;
  brand: string;
  name: string;
  /** Базовая цена, $. */
  price: number;
  /** Уровень репутации, с которого деталь продаётся. */
  rep: number;
  look: Look;
}

export interface CPU extends Base { cat: 'cpu'; socket: Socket; cores: number; perf: number; tdp: number; vendor: 'intel' | 'amd' }
export interface GPU extends Base { cat: 'gpu'; chip: string; vendor: 'nvidia' | 'amd'; perf: number; tdp: number; len: number; vram: number; fans: 2 | 3 }
export interface MB extends Base { cat: 'mb'; socket: Socket; form: Form; ram: RamType; chipset: string; /** слотов памяти */ slots: 2 | 4 }
export interface RAM extends Base { cat: 'ram'; type: RamType; gb: number; mhz: number; rgb: boolean }
export interface SSD extends Base { cat: 'ssd'; gb: number; speed: number }
export interface PSU extends Base { cat: 'psu'; watt: number; tier: string }
export interface Cooler extends Base { cat: 'cooler'; cap: number; kind: 'tower' | 'aio' | 'low'; height: number }
export interface Case extends Base { cat: 'case'; form: Form; gpuMax: number; coolerMax: number; color: 'white' | 'black'; glass: boolean; size: 'mid' | 'mini' | 'full';
  /** Вентиляторы с цветной подсветкой (ARGB) — засчитывается в заказ «с подсветкой». */
  rgb?: boolean }
export interface Paste extends Base { cat: 'paste'; uses: number }

export type Part = CPU | GPU | MB | RAM | SSD | PSU | Cooler | Case | Paste;

const L = (main: string, accent: string, dark?: string): Look => ({ main, accent, dark });

export const CPUS: CPU[] = [
  { id: 'i3-12100f', cat: 'cpu', brand: 'Intel', name: 'Core i3-12100F', price: 85, rep: 1, socket: 'LGA1700', cores: 4, perf: 30, tdp: 65, vendor: 'intel', look: L('#2f6fd6', '#9cc3ff') },
  { id: 'i5-12400f', cat: 'cpu', brand: 'Intel', name: 'Core i5-12400F', price: 120, rep: 1, socket: 'LGA1700', cores: 6, perf: 45, tdp: 65, vendor: 'intel', look: L('#2f6fd6', '#9cc3ff') },
  { id: 'r5-5600', cat: 'cpu', brand: 'AMD', name: 'Ryzen 5 5600', price: 105, rep: 1, socket: 'AM4', cores: 6, perf: 42, tdp: 65, vendor: 'amd', look: L('#d8382f', '#ffb0a8') },
  { id: 'r7-5700x3d', cat: 'cpu', brand: 'AMD', name: 'Ryzen 7 5700X3D', price: 200, rep: 2, socket: 'AM4', cores: 8, perf: 62, tdp: 105, vendor: 'amd', look: L('#d8382f', '#ffb0a8') },
  { id: 'i5-14600k', cat: 'cpu', brand: 'Intel', name: 'Core i5-14600K', price: 225, rep: 2, socket: 'LGA1700', cores: 14, perf: 70, tdp: 125, vendor: 'intel', look: L('#2f6fd6', '#9cc3ff') },
  { id: 'r5-7600', cat: 'cpu', brand: 'AMD', name: 'Ryzen 5 7600', price: 185, rep: 2, socket: 'AM5', cores: 6, perf: 60, tdp: 65, vendor: 'amd', look: L('#d8382f', '#ffb0a8') },
  { id: 'u5-245k', cat: 'cpu', brand: 'Intel', name: 'Core Ultra 5 245K', price: 260, rep: 3, socket: 'LGA1851', cores: 14, perf: 74, tdp: 125, vendor: 'intel', look: L('#1b3f99', '#7fb0ff') },
  { id: 'i7-14700k', cat: 'cpu', brand: 'Intel', name: 'Core i7-14700K', price: 335, rep: 3, socket: 'LGA1700', cores: 20, perf: 84, tdp: 125, vendor: 'intel', look: L('#2f6fd6', '#9cc3ff') },
  { id: 'r7-7800x3d', cat: 'cpu', brand: 'AMD', name: 'Ryzen 7 7800X3D', price: 380, rep: 3, socket: 'AM5', cores: 8, perf: 92, tdp: 120, vendor: 'amd', look: L('#d8382f', '#ffb0a8') },
  { id: 'u7-265k', cat: 'cpu', brand: 'Intel', name: 'Core Ultra 7 265K', price: 330, rep: 4, socket: 'LGA1851', cores: 20, perf: 90, tdp: 125, vendor: 'intel', look: L('#1b3f99', '#7fb0ff') },
  { id: 'r7-9800x3d', cat: 'cpu', brand: 'AMD', name: 'Ryzen 7 9800X3D', price: 475, rep: 5, socket: 'AM5', cores: 8, perf: 100, tdp: 120, vendor: 'amd', look: L('#d8382f', '#ffb0a8') },
  { id: 'u9-285k', cat: 'cpu', brand: 'Intel', name: 'Core Ultra 9 285K', price: 560, rep: 6, socket: 'LGA1851', cores: 24, perf: 102, tdp: 125, vendor: 'intel', look: L('#1b3f99', '#7fb0ff') },
  { id: 'r9-9950x', cat: 'cpu', brand: 'AMD', name: 'Ryzen 9 9950X', price: 600, rep: 6, socket: 'AM5', cores: 16, perf: 106, tdp: 170, vendor: 'amd', look: L('#d8382f', '#ffb0a8') },
];

export const GPUS: GPU[] = [
  { id: 'rtx3050', cat: 'gpu', brand: 'Palit', name: 'GeForce RTX 3050 StormX', chip: 'RTX 3050', vendor: 'nvidia', price: 185, rep: 1, perf: 25, tdp: 130, len: 170, vram: 8, fans: 2, look: L('#2b2f38', '#7fd34e') },
  { id: 'rx7600', cat: 'gpu', brand: 'Sapphire', name: 'Radeon RX 7600 Pulse', chip: 'RX 7600', vendor: 'amd', price: 250, rep: 1, perf: 38, tdp: 165, len: 240, vram: 8, fans: 2, look: L('#23262e', '#d8382f') },
  { id: 'rtx4060', cat: 'gpu', brand: 'MSI', name: 'GeForce RTX 4060 Ventus 2X', chip: 'RTX 4060', vendor: 'nvidia', price: 290, rep: 1, perf: 41, tdp: 115, len: 199, vram: 8, fans: 2, look: L('#30343c', '#c9cdd4') },
  { id: 'rx9060xt', cat: 'gpu', brand: 'XFX', name: 'Radeon RX 9060 XT Swift', chip: 'RX 9060 XT', vendor: 'amd', price: 360, rep: 2, perf: 50, tdp: 160, len: 260, vram: 16, fans: 2, look: L('#1f2228', '#e2674f') },
  { id: 'rtx5060ti', cat: 'gpu', brand: 'ASUS', name: 'GeForce RTX 5060 Ti Dual', chip: 'RTX 5060 Ti', vendor: 'nvidia', price: 430, rep: 2, perf: 53, tdp: 180, len: 230, vram: 16, fans: 2, look: L('#e9e8e4', '#8a8f99') },
  { id: 'rtx5070', cat: 'gpu', brand: 'Gigabyte', name: 'GeForce RTX 5070 Windforce', chip: 'RTX 5070', vendor: 'nvidia', price: 560, rep: 3, perf: 66, tdp: 250, len: 280, vram: 12, fans: 3, look: L('#25282f', '#f2a13a') },
  { id: 'rx9070xt', cat: 'gpu', brand: 'Sapphire', name: 'Radeon RX 9070 XT Nitro+', chip: 'RX 9070 XT', vendor: 'amd', price: 650, rep: 3, perf: 76, tdp: 304, len: 320, vram: 16, fans: 3, look: L('#1c2a44', '#4fa3ff') },
  { id: 'rtx5070ti', cat: 'gpu', brand: 'Palit', name: 'GeForce RTX 5070 Ti GamingPro', chip: 'RTX 5070 Ti', vendor: 'nvidia', price: 780, rep: 4, perf: 80, tdp: 300, len: 300, vram: 16, fans: 3, look: L('#e2674f', '#3fb6a8') },
  { id: 'rtx5080', cat: 'gpu', brand: 'ASUS', name: 'GeForce RTX 5080 TUF Gaming', chip: 'RTX 5080', vendor: 'nvidia', price: 1150, rep: 5, perf: 92, tdp: 360, len: 348, vram: 16, fans: 3, look: L('#3a3c40', '#e8c040') },
  { id: 'rtx5090', cat: 'gpu', brand: 'MSI', name: 'GeForce RTX 5090 Suprim', chip: 'RTX 5090', vendor: 'nvidia', price: 2400, rep: 7, perf: 120, tdp: 575, len: 359, vram: 32, fans: 3, look: L('#55585f', '#d8d9dc') },
];

export const MBS: MB[] = [
  { id: 'h610m', cat: 'mb', brand: 'MSI', name: 'PRO H610M-E DDR4', price: 85, rep: 1, socket: 'LGA1700', form: 'mATX', ram: 'DDR4', chipset: 'H610', slots: 2, look: L('#2b2421', '#4a8fd8') },
  { id: 'b550m', cat: 'mb', brand: 'ASRock', name: 'B550M Pro4', price: 100, rep: 1, socket: 'AM4', form: 'mATX', ram: 'DDR4', chipset: 'B550', slots: 4, look: L('#1c1d21', '#d8dde4') },
  { id: 'b760m', cat: 'mb', brand: 'ASRock', name: 'B760M Steel Legend', price: 135, rep: 1, socket: 'LGA1700', form: 'mATX', ram: 'DDR5', chipset: 'B760', slots: 4, look: L('#e6e4df', '#9aa3ad') },
  { id: 'b650', cat: 'mb', brand: 'MSI', name: 'MAG B650 TOMAHAWK', price: 200, rep: 2, socket: 'AM5', form: 'ATX', ram: 'DDR5', chipset: 'B650', slots: 4, look: L('#141518', '#9aa0a8') },
  { id: 'z790', cat: 'mb', brand: 'Gigabyte', name: 'Z790 AORUS ELITE', price: 230, rep: 2, socket: 'LGA1700', form: 'ATX', ram: 'DDR5', chipset: 'Z790', slots: 4, look: L('#16171b', '#f2a13a') },
  { id: 'b860m', cat: 'mb', brand: 'MSI', name: 'B860M GAMING PLUS', price: 165, rep: 3, socket: 'LGA1851', form: 'mATX', ram: 'DDR5', chipset: 'B860', slots: 4, look: L('#17181c', '#d8382f') },
  { id: 'b650i', cat: 'mb', brand: 'Gigabyte', name: 'B650I AORUS ULTRA', price: 255, rep: 3, socket: 'AM5', form: 'ITX', ram: 'DDR5', chipset: 'B650', slots: 2, look: L('#18191d', '#f2a13a') },
  { id: 'z890', cat: 'mb', brand: 'ASUS', name: 'TUF GAMING Z890-PLUS', price: 300, rep: 4, socket: 'LGA1851', form: 'ATX', ram: 'DDR5', chipset: 'Z890', slots: 4, look: L('#1e2024', '#f3c35a') },
  { id: 'x870e', cat: 'mb', brand: 'ASUS', name: 'ROG STRIX X870E-E', price: 450, rep: 5, socket: 'AM5', form: 'ATX', ram: 'DDR5', chipset: 'X870E', slots: 4, look: L('#101114', '#e2334a') },
];

/*
 * Память продаётся ПОШТУЧНО: планка 8/16/32 ГБ. В плату ставится 1, 2 или 4
 * одинаковые планки (сколько есть слотов). Одна планка — одноканальный режим,
 * он заметно режет игровой балл: так игрок учится брать пары.
 */
export const RAMS: RAM[] = [
  { id: 'r4-8', cat: 'ram', brand: 'Kingston', name: 'FURY Beast DDR4 8GB', price: 19, rep: 1, type: 'DDR4', gb: 8, mhz: 3200, rgb: false, look: L('#2c2f37', '#e2674f') },
  { id: 'r4-16', cat: 'ram', brand: 'Kingston', name: 'FURY Beast DDR4 16GB', price: 34, rep: 1, type: 'DDR4', gb: 16, mhz: 3200, rgb: false, look: L('#2c2f37', '#e2674f') },
  { id: 'r4-16lpx', cat: 'ram', brand: 'Corsair', name: 'Vengeance LPX DDR4 16GB', price: 38, rep: 1, type: 'DDR4', gb: 16, mhz: 3600, rgb: false, look: L('#1b1c20', '#f3c35a') },
  { id: 'r4-16rgb', cat: 'ram', brand: 'Corsair', name: 'Vengeance RGB PRO DDR4 16GB White', price: 46, rep: 1, type: 'DDR4', gb: 16, mhz: 3600, rgb: true, look: L('#ecebe7', '#c9cdd4') },
  { id: 'r5-8', cat: 'ram', brand: 'Kingston', name: 'FURY Beast DDR5 8GB', price: 27, rep: 1, type: 'DDR5', gb: 8, mhz: 5600, rgb: false, look: L('#2c2f37', '#e2674f') },
  { id: 'r5-16', cat: 'ram', brand: 'Kingston', name: 'FURY Beast DDR5 16GB', price: 46, rep: 1, type: 'DDR5', gb: 16, mhz: 6000, rgb: false, look: L('#2c2f37', '#e2674f') },
  { id: 'r5-16rgb', cat: 'ram', brand: 'G.Skill', name: 'Trident Z5 RGB 16GB', price: 62, rep: 2, type: 'DDR5', gb: 16, mhz: 6400, rgb: true, look: L('#c7cad0', '#1b1c20') },
  { id: 'r5-32', cat: 'ram', brand: 'Corsair', name: 'Dominator Titanium 32GB', price: 125, rep: 4, type: 'DDR5', gb: 32, mhz: 6600, rgb: true, look: L('#2a2b30', '#d8d9dc') },
];
/** Старые комплекты (до планок поштучно) → [планка, сколько штук]: для сохранений. */
export const RAM_LEGACY: Record<string, [string, number]> = {
  'ddr4-16': ['r4-8', 2], 'ddr4-32': ['r4-16lpx', 2], 'ddr5-16': ['r5-8', 2],
  'ddr5-32': ['r5-16', 2], 'ddr5-32rgb': ['r5-16rgb', 2], 'ddr5-64': ['r5-32', 2],
};

export const SSDS: SSD[] = [
  { id: 'nv3-500', cat: 'ssd', brand: 'Kingston', name: 'NV3 500GB', price: 38, rep: 1, gb: 500, speed: 5000, look: L('#1f2a3a', '#e2674f') },
  { id: '990evo-1', cat: 'ssd', brand: 'Samsung', name: '990 EVO 1TB', price: 82, rep: 1, gb: 1000, speed: 5000, look: L('#20242c', '#4fa3ff') },
  { id: 'sn850x-2', cat: 'ssd', brand: 'WD', name: 'Black SN850X 2TB', price: 145, rep: 2, gb: 2000, speed: 7300, look: L('#16171b', '#d8d9dc') },
  { id: '990pro-4', cat: 'ssd', brand: 'Samsung', name: '990 PRO 4TB', price: 310, rep: 4, gb: 4000, speed: 7450, look: L('#20242c', '#e2674f') },
];

export const PSUS: PSU[] = [
  { id: 'pk550', cat: 'psu', brand: 'DeepCool', name: 'PK550D 550W', price: 52, rep: 1, watt: 550, tier: 'Bronze', look: L('#22252b', '#4fd1c0') },
  { id: 'sp10-650', cat: 'psu', brand: 'be quiet!', name: 'System Power 10 650W', price: 72, rep: 1, watt: 650, tier: 'Bronze', look: L('#202124', '#d9d6cf') },
  { id: 'rm750e', cat: 'psu', brand: 'Corsair', name: 'RM750e 750W', price: 98, rep: 1, watt: 750, tier: 'Gold', look: L('#1b1c20', '#f3c35a') },
  { id: 'gx850', cat: 'psu', brand: 'Seasonic', name: 'Focus GX-850 White', price: 132, rep: 2, watt: 850, tier: 'Gold', look: L('#ecebe7', '#c9a24a') },
  { id: 'dp13-1000', cat: 'psu', brand: 'be quiet!', name: 'Dark Power 13 1000W', price: 225, rep: 4, watt: 1000, tier: 'Titanium', look: L('#141518', '#f2a13a') },
  { id: 'hx1500', cat: 'psu', brand: 'Corsair', name: 'HX1500i 1500W', price: 370, rep: 6, watt: 1500, tier: 'Platinum', look: L('#1b1c20', '#e8e8ea') },
];

export const COOLERS: Cooler[] = [
  { id: 'ag400', cat: 'cooler', brand: 'DeepCool', name: 'AG400', price: 24, rep: 1, cap: 120, kind: 'tower', height: 150, look: L('#1d1f24', '#c9cdd4') },
  { id: 'ak400', cat: 'cooler', brand: 'DeepCool', name: 'AK400', price: 35, rep: 1, cap: 170, kind: 'tower', height: 155, look: L('#2a2d35', '#efe6da') },
  { id: 'pa120', cat: 'cooler', brand: 'Thermalright', name: 'Peerless Assassin 120', price: 40, rep: 2, cap: 220, kind: 'tower', height: 157, look: L('#c9cdd4', '#1d1f24') },
  { id: 'l9i', cat: 'cooler', brand: 'Noctua', name: 'NH-L9i chromax', price: 50, rep: 2, cap: 95, kind: 'low', height: 37, look: L('#1d1f24', '#7a5a46') },
  { id: 'lf3-360', cat: 'cooler', brand: 'Arctic', name: 'Liquid Freezer III 360', price: 110, rep: 3, cap: 300, kind: 'aio', height: 50, look: L('#16171b', '#e9e8e4') },
  { id: 'nhd15', cat: 'cooler', brand: 'Noctua', name: 'NH-D15 G2', price: 150, rep: 4, cap: 260, kind: 'tower', height: 168, look: L('#c9a98a', '#7a5a46') },
];

export const CASES: Case[] = [
  { id: 'zalman-t8', cat: 'case', brand: 'Zalman', name: 'T8', price: 40, rep: 1, form: 'ATX', gpuMax: 320, coolerMax: 160, color: 'black', glass: false, size: 'mid', look: L('#2a2c31', '#9aa0a8') },
  { id: 'cc560', cat: 'case', brand: 'DeepCool', name: 'CC560', price: 62, rep: 1, form: 'ATX', gpuMax: 370, coolerMax: 163, color: 'black', glass: true, size: 'mid', rgb: true, look: L('#2a2c31', '#4fd1c0') },
  { id: 'popmini', cat: 'case', brand: 'Fractal', name: 'Pop Mini Air', price: 78, rep: 1, form: 'mATX', gpuMax: 325, coolerMax: 170, color: 'white', glass: true, size: 'mid', rgb: true, look: L('#e4e1da', '#3d4048') },
  { id: 'ch560', cat: 'case', brand: 'DeepCool', name: 'CH560 WH', price: 95, rep: 2, form: 'ATX', gpuMax: 380, coolerMax: 175, color: 'white', glass: true, size: 'mid', rgb: true, look: L('#e4e1da', '#ff8a5c') },
  { id: 'h5flow', cat: 'case', brand: 'NZXT', name: 'H5 Flow', price: 95, rep: 2, form: 'ATX', gpuMax: 365, coolerMax: 165, color: 'black', glass: true, size: 'mid', look: L('#1d1f24', '#8a5bff') },
  { id: 'nr200p', cat: 'case', brand: 'Cooler Master', name: 'NR200P', price: 100, rep: 3, form: 'ITX', gpuMax: 330, coolerMax: 155, color: 'white', glass: true, size: 'mini', look: L('#e4e1da', '#5b7cff') },
  { id: 'o11evo', cat: 'case', brand: 'Lian Li', name: 'O11 Dynamic EVO', price: 165, rep: 4, form: 'ATX', gpuMax: 420, coolerMax: 167, color: 'white', glass: true, size: 'full', rgb: true, look: L('#ecebe7', '#4fd1c0') },
];

export const PASTES: Paste[] = [
  { id: 'mx6', cat: 'paste', brand: 'Arctic', name: 'MX-6 4g', price: 8, rep: 1, uses: 5, look: L('#2f6fd6', '#ffffff') },
];

export const ALL: Part[] = [...CPUS, ...GPUS, ...MBS, ...RAMS, ...SSDS, ...PSUS, ...COOLERS, ...CASES, ...PASTES];
const BY_ID = new Map(ALL.map((p) => [p.id, p]));

export function part(id: string): Part {
  const p = BY_ID.get(id);
  if (!p) throw new Error(`нет детали ${id}`);
  return p;
}
export const partOrNull = (id: string): Part | undefined => BY_ID.get(id);

export const CATS: Cat[] = ['cpu', 'gpu', 'mb', 'ram', 'ssd', 'psu', 'cooler', 'case', 'paste'];

/** Короткая строка характеристик для карточек — без локализации, это термины. */
/** Строка характеристик. Термины (сокет, DDR5, ГБ) — как пишут в магазинах; слова — на языке игрока. */
export function specLine(p: Part, ru = false): string {
  // цвет — в конце строки у всех деталей, кроме пасты (у корпуса он уже есть)
  // процессору цвет не пишем: в каталоге у него цвет коробки, а сам чип всегда серебристый
  const col = p.cat === 'paste' || p.cat === 'case' || p.cat === 'cpu' ? '' : ' · ' + colorName(p, ru);
  return specCore(p, ru) + col;
}

/**
 * Название цвета детали по основному цвету её модели — чтобы при сборке было
 * понятно, что белая плата к белому корпусу, а не «какая-то». Чистая функция:
 * переводит hex в оттенок/светлоту и выбирает слово.
 */
export function colorName(p: Part, ru = false): string {
  if (p.cat === 'case') return p.color === 'white' ? (ru ? 'белый' : 'white') : (ru ? 'чёрный' : 'black');
  const hex = p.look.main.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16) / 255, g = parseInt(hex.slice(2, 4), 16) / 255, b = parseInt(hex.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const W = (ru: string, en: string) => ({ ru, en });
  let w = W('серый', 'grey');
  if (l < 0.16) w = W('чёрный', 'black');
  else if (s < 0.22) w = l > 0.84 ? W('белый', 'white') : l > 0.62 ? W('серебристый', 'silver') : l < 0.3 ? W('графитовый', 'graphite') : W('серый', 'grey');
  else if (h >= 15 && h < 50 && s < 0.5 && l < 0.75) w = W('коричневый', 'brown');
  else if (h < 15 || h >= 345) w = W('красный', 'red');
  else if (h < 40) w = W('оранжевый', 'orange');
  else if (h < 65) w = W('жёлтый', 'yellow');
  else if (h < 165) w = W('зелёный', 'green');
  else if (h < 200) w = W('бирюзовый', 'teal');
  else if (h < 255) w = W('синий', 'blue');
  else if (h < 290) w = W('фиолетовый', 'purple');
  else w = W('розовый', 'pink');
  const rgb = 'rgb' in p && p.rgb ? (ru ? ' + подсветка' : ' + RGB') : '';
  return (ru ? w.ru : w.en) + rgb;
}

function specCore(p: Part, ru: boolean): string {
  switch (p.cat) {
    case 'cpu': return ru ? `${p.socket} · ${p.cores} ядер · ${p.tdp} Вт` : `${p.socket} · ${p.cores}C · ${p.tdp}W`;
    case 'gpu': return ru ? `${p.vram} ГБ · ${p.tdp} Вт · ${p.len} мм` : `${p.vram}GB · ${p.tdp}W · ${p.len}mm`;
    case 'mb': return `${p.socket} · ${p.form} · ${p.ram} ×${p.slots}`;
    case 'ram': return `${p.type} · ${ru ? '1 планка' : '1 stick'} ${p.gb}${ru ? ' ГБ' : 'GB'} · ${p.mhz}${ru ? ' МГц' : ''}`;
    case 'ssd': return `M.2 NVMe · ${p.gb >= 1000 ? p.gb / 1000 + 'TB' : p.gb + 'GB'}`;
    case 'psu': return `${p.watt}${ru ? ' Вт' : 'W'} · 80+ ${p.tier}`;
    case 'cooler': return `${p.kind === 'aio' ? (ru ? 'СВО 360' : 'AIO 360') : p.kind === 'low' ? (ru ? 'Низкий' : 'Low-profile') : (ru ? 'Башня' : 'Tower')} · ${p.cap}W`;
    case 'case': return `${p.form} · ${ru ? 'видеокарта' : 'GPU'} ≤${p.gpuMax}${ru ? ' мм' : 'mm'} · ${p.color === 'white' ? (ru ? 'белый' : 'White') : (ru ? 'чёрный' : 'Black')}${p.glass ? (ru ? ' · стекло' : ' · Glass') : ''}${p.rgb ? (ru ? ' · подсветка вентиляторов' : ' · RGB fans') : ''}`;
    case 'paste': return ru ? `×${p.uses} нанесений` : `×${p.uses} uses`;
  }
}

export const fullName = (p: Part): string => `${p.brand} ${p.name}`;
