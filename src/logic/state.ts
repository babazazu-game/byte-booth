/**
 * Состояние партии и все действия игрока над ним.
 *
 * Один объект `GameState` — это и есть сохранение: он сериализуется целиком.
 * Все изменения идут через функции этого модуля, а они возвращают ключ ошибки
 * вместо исключений: интерфейс показывает его тостом, и игрок понимает,
 * почему кнопка «не сработала».
 */

import { part, ALL, GPUS, type Cat, type Paste, RAM_LEGACY } from './parts.ts';
import { newMarket, nextDay as marketNextDay, priceOf, sellPriceOf, type MarketState } from './market.ts';
import { canInstall, canRemove, SLOT_OF, ramSlotsOf, RAM_ORDER4, type SlotKey, type Build } from './compat.ts';
import { makeOrder, evaluate, repLevel, type Order, type Evaluation, type Kind } from './orders.ts';
import { type Arch, makeLook } from './customers.ts';
import { Rng } from './rng.ts';
import { progress, type Daily } from './daily.ts';
import { DISTRICTS, DISTRICT_IDS, MOVE_BACK, LEGEND_REP, type District, type DistrictId } from './districts.ts';

export interface Item {
  uid: number; id: string; used: boolean;
  /** Брак в поставке: выглядит целой, но не работает (видно только на тесте). */
  doa?: boolean;
  /** Подделка (только видеокарты частников); fakeKnown — уже разоблачена тестом. */
  fake?: boolean;
  fakeKnown?: boolean;
  /** Деталь клиента: номер его заказа. Продать нельзя, ставить — только в его ПК. */
  owner?: number;
  /** Неисправна (тест показал): ставить нельзя — починить или сдать на запчасти. */
  broken?: boolean;
}
type Src = { used: boolean; doa?: boolean; fake?: boolean; fakeKnown?: boolean; owner?: number; broken?: boolean };
/** Объявление частника: видеокарта сильно дешевле рынка. Может оказаться подделкой. */
export interface Deal { id: string; price: number; fake: boolean; sold?: boolean }
/** Коробки-сюрпризы: сколько деталей внутри и из какого «уровня» каталога. */
export const BOXES = { small: { price: 150, n: 2, rep: 0, minRep: 1 }, big: { price: 420, n: 3, rep: 1, minRep: 3 } } as const;
export type BoxId = keyof typeof BOXES;

export type UpId = 'shelf' | 'slots' | 'sign' | 'coffee' | 'analytics' | 'wholesale' | 'decor' | 'solder';

export const UPGRADES: Record<UpId, { prices: number[]; values: number[] }> = {
  shelf: { prices: [350, 1000], values: [14, 24, 40] },
  slots: { prices: [350, 900], values: [2, 3, 4] },
  sign: { prices: [500, 1600], values: [0, 1, 2] },
  coffee: { prices: [350], values: [0, 1] },
  analytics: { prices: [700], values: [0, 1] },
  wholesale: { prices: [900, 2200], values: [0, 0.05, 0.1] },
  decor: { prices: [250, 700], values: [0, 1, 2] },
  // паяльная станция: открывает ремонт неисправных деталей за деньги (без мини-игр)
  solder: { prices: [600], values: [0, 1] },
};

export const districtOf = (s: GameState): District => DISTRICTS[s.district ?? 'park'];
export const openDistricts = (s: GameState): DistrictId[] => s.districts ?? ['park'];
/** Легенда города: поработал во всех районах и дошёл до репутации LEGEND_REP. */
export const isLegend = (s: GameState): boolean => openDistricts(s).length >= DISTRICT_IDS.length && level(s) >= LEGEND_REP;

/**
 * Переезд ларька. Первый раз в район — разрешение и эвакуатор (дорого),
 * обратно в уже открытый — только эвакуатор. Нельзя переезжать с
 * незакрытыми заказами: клиенты не найдут ларёк.
 */
export function moveTo(s: GameState, id: DistrictId): Err {
  const d = DISTRICTS[id];
  if ((s.district ?? 'park') === id) return 'err.maxed';
  if (level(s) < d.minRep) return 'err.locked';
  if (activeOrders(s).length || s.pending || s.orders.some((o) => o.returnAt !== undefined)) return 'err.moveBusy';
  const known = openDistricts(s).includes(id);
  const price = known ? MOVE_BACK : d.cost;
  if (s.cash < price) return 'err.noMoney';
  s.cash -= price; s.today.spent += price;
  s.district = id;
  if (!known) s.districts = [...openDistricts(s), id];
  s.deals = [];
  return null;
}
export const moveCost = (s: GameState, id: DistrictId): number => (openDistricts(s).includes(id) ? MOVE_BACK : DISTRICTS[id].cost);

export interface DayStats { income: number; tips: number; spent: number; sold: number; rent: number; served: number; stars: number[];
  /** Самый довольный клиент дня и потери с причинами — для итогов дня. */
  best?: { id: number; stars: number };
  losses?: { k: string; n: number }[];
}
/** Записать потерю дня (для итогов: «на чём потерял»). */
export function addLoss(s: GameState, k: string, n: number): void {
  if (n <= 0) return;
  const l = (s.today.losses ??= []);
  const e = l.find((x) => x.k === k);
  if (e) e.n += n; else l.push({ k, n });
}

export interface GameState {
  v: number;
  cash: number;
  /** Цвет стен (id из WALLS) и купленные цвета. */
  wall?: string;
  walls?: string[];
  /** Купленные статуэтки по порядку — так они и стоят на подставке. */
  figs?: string[];
  /** День, новости которого игрок уже открывал (значок «●» на вкладке). */
  newsSeen?: number;
  /** Купленные постеры по порядку — развешиваются по свободным местам. */
  posters?: string[];
  /** Объявления частников на сегодня. */
  deals?: Deal[];
  /** Клиенты, которых уже обслужили (для повторных визитов «ты мне прошлый собирал»). */
  regulars?: { cust: Order['cust']; stars: number; day: number }[];
  /** Где сейчас стоит ларёк и в каких районах он уже побывал. */
  district?: DistrictId;
  districts?: DistrictId[];
  /** Обзор блогера: в день `day` к ларьку придёт на `n` клиентов больше (или меньше). */
  buzz?: { day: number; n: number };
  lastBlogger?: number;
  day: number;
  xp: number;
  rngS: number;
  market: MarketState;
  inv: Item[];
  uid: number;
  pasteUses: number;
  orders: Order[];
  nextOrder: number;
  /** Сколько клиентов уже пришло сегодня (заказавших или нет). */
  visitsToday: number;
  /** Клиент, стоящий у окна прямо сейчас (ещё не договорились). */
  pending: Order | null;
  /** Заказ на верстаке. */
  bench: number | null;
  /** Источник установленных деталей проекта: b/у или нет; undefined — деталь клиента. */
  src: Partial<Record<SlotKey, Src>>;
  /** Снятые с клиентского ПК детали, ещё не решено, что с ними. */
  loose: string[];
  /** Видеокарта снята и разобрана на верстаке. */
  gpuOpen: boolean;
  up: Record<UpId, number>;
  today: DayStats;
  tutorial: number;
  won: boolean;
  totalEarned: number;
  built: number;
  /** Ежедневный бонус и задания (daily.ts). */
  daily?: Daily;
  /** Куплен «Свой магазин» — игра пройдена (можно продолжать). */
  shopOwned?: boolean;
}

const freshDay = (): DayStats => ({ income: 0, tips: 0, spent: 0, sold: 0, rent: 0, served: 0, stars: [] });

export function newGame(seed = Date.now() % 1e9): GameState {
  const rng = new Rng(seed);
  const market = newMarket(rng);
  const s: GameState = {
    v: 1, cash: 1500, day: 1, xp: 0, rngS: rng.s, market, inv: [], uid: 1, pasteUses: 3,
    orders: [], nextOrder: 1, visitsToday: 0, pending: null, bench: null, src: {}, loose: [], gpuOpen: false,
    up: { shelf: 0, slots: 0, sign: 0, coffee: 0, analytics: 0, wholesale: 0, decor: 0, solder: 0 },
    today: freshDay(), tutorial: 0, won: false, totalEarned: 0, built: 0,
  };
  // Стартовый корпус на складе: первая сборка не должна упираться в «нечего ставить».
  give(s, 'zalman-t8', false);
  return s;
}

export const rngOf = (s: GameState): Rng => new Rng(s.rngS);
const saveRng = (s: GameState, r: Rng): void => { s.rngS = r.s; };

export const level = (s: GameState): number => repLevel(s.xp);
export const upVal = (s: GameState, id: UpId): number => UPGRADES[id].values[s.up[id]];
export const capacity = (s: GameState): number => upVal(s, 'shelf');
export const slotsMax = (s: GameState): number => upVal(s, 'slots');
export const visitsMax = (s: GameState): number => Math.max(1, 3 + upVal(s, 'sign') + Math.floor(level(s) / 3) + (s.buzz?.day === s.day ? s.buzz.n : 0));
export const rent = (s: GameState): number => Math.round((30 + level(s) * 9 + s.up.shelf * 10) * districtOf(s).rentK);
export const buyPrice = (s: GameState, id: string): number => priceOf(s.market, id, upVal(s, 'wholesale'));
export const activeOrders = (s: GameState): Order[] => s.orders.filter((o) => o.state === 'active' || o.state === 'bench' || o.state === 'ready');
/**
 * Миграция сохранения: память раньше продавалась комплектами, теперь поштучно.
 * Каждый старый комплект превращается в две планки (на складе и в сборках).
 */
export function migrate(s: GameState): GameState {
  // улучшения, появившиеся позже, — с нулевого уровня
  for (const k of Object.keys(UPGRADES) as UpId[]) s.up[k] ??= 0;
  const fixBuild = (b: Build | undefined) => {
    if (!b?.ram || !RAM_LEGACY[b.ram]) return;
    const [id, n] = RAM_LEGACY[b.ram]; b.ram = id; b.ramN = n;
  };
  const inv: Item[] = [];
  for (const it of s.inv) {
    const m = RAM_LEGACY[it.id];
    if (m) for (let i = 0; i < m[1]; i++) inv.push({ uid: s.uid++, id: m[0], used: it.used });
    else inv.push(it);
  }
  s.inv = inv;
  s.loose = s.loose.flatMap((id) => (RAM_LEGACY[id] ? Array(RAM_LEGACY[id][1]).fill(RAM_LEGACY[id][0]) : [id]));
  for (const o of [...s.orders, ...(s.pending ? [s.pending] : [])]) { fixBuild(o.build); fixBuild(o.orig); }
  return s;
}

export const benchOrder = (s: GameState): Order | null => (s.bench === null ? null : s.orders.find((o) => o.id === s.bench) ?? null);

function give(s: GameState, id: string, used: boolean, extra: Omit<Src, 'used'> = {}): Item {
  const it: Item = { uid: s.uid++, id, used };
  if (extra.doa) it.doa = true;
  if (extra.fake) { it.fake = true; if (extra.fakeKnown) it.fakeKnown = true; }
  if (extra.owner !== undefined) it.owner = extra.owner;
  if (extra.broken) it.broken = true;
  s.inv.push(it);
  return it;
}

export type Err = string | null;

/* ─────────────────────────────── рынок ─────────────────────────────── */

export function buy(s: GameState, id: string, qty = 1): Err {
  const p = part(id);
  const each = buyPrice(s, id);
  if (s.cash < each * qty) return 'err.noMoney';
  if (p.cat === 'paste') {
    s.cash -= each * qty; s.today.spent += each * qty;
    s.pasteUses += (p as Paste).uses * qty;
    return null;
  }
  if (s.inv.length + qty > capacity(s)) return 'err.shelfFull';
  // Магазин продаёт только новые рабочие детали: брак без возврата выглядел
  // нечестно (автор). Риск остался у частников, в коробках и в старых деталях.
  for (let i = 0; i < qty; i++) give(s, id, false);
  s.cash -= each * qty; s.today.spent += each * qty;
  return null;
}


/** Купить видеокарту по объявлению частника. */
export function buyDeal(s: GameState, i: number): Err {
  const d = s.deals?.[i];
  if (!d || d.sold) return 'err.noItem';
  if (s.cash < d.price) return 'err.noMoney';
  if (s.inv.length + 1 > capacity(s)) return 'err.shelfFull';
  give(s, d.id, false, { fake: d.fake });
  d.sold = true;
  s.cash -= d.price; s.today.spent += d.price;
  return null;
}

/**
 * Открыть коробку-сюрприз: 2–3 случайные б/у детали. Внутри бывает и жирная
 * видеокарта, и мёртвая железка (брак проявится на тесте) — на то и сюрприз.
 */
export function openBox(s: GameState, box: BoxId): Item[] | string {
  const B = BOXES[box];
  if (level(s) < B.minRep) return 'err.locked';
  if (s.cash < B.price) return 'err.noMoney';
  if (s.inv.length + B.n > capacity(s)) return 'err.shelfFull';
  const r = rngOf(s);
  const pool = ALL.filter((p) => p.cat !== 'paste' && p.rep <= level(s) + B.rep);
  const out: Item[] = [];
  for (let i = 0; i < B.n; i++) out.push(give(s, r.pick(pool).id, true, { doa: r.chance(0.18) }));
  saveRng(s, r);
  s.cash -= B.price; s.today.spent += B.price;
  return out;
}

/** Ремонт неисправной детали: 25% цены новой, только с паяльной станцией. */
// 12% цены новой: при 25% ремонт съедал половину выручки от продажи б/у (автор)
export const repairPrice = (s: GameState, it: Item): number => Math.max(5, Math.round((priceOf(s.market, it.id) * 0.12) / 5) * 5);
export function repairItem(s: GameState, uid: number): Err {
  const it = s.inv.find((x) => x.uid === uid);
  if (!it || !it.broken) return 'err.noItem';
  if (!upVal(s, 'solder')) return 'err.needSolder';
  const c = repairPrice(s, it);
  if (s.cash < c) return 'err.noMoney';
  s.cash -= c; s.today.spent += c;
  it.broken = false; it.doa = false; it.used = true;
  return null;
}

/** Цена скупки предмета: разоблачённая подделка почти ничего не стоит, неисправная — на запчасти. */
export function itemSellPrice(s: GameState, it: Item): number {
  if (it.broken) return Math.max(1, Math.round(priceOf(s.market, it.id) * 0.1));
  if (it.fakeKnown) return Math.max(1, Math.round(priceOf(s.market, it.id) * 0.08));
  return sellPriceOf(s.market, it.id, it.used);
}

export function sell(s: GameState, uid: number): Err {
  const i = s.inv.findIndex((x) => x.uid === uid);
  if (i < 0) return 'err.noItem';
  const it = s.inv[i];
  if (it.owner !== undefined) return 'err.notYours';
  const v = itemSellPrice(s, it);
  s.inv.splice(i, 1);
  s.cash += v; s.today.sold += v;
  return null;
}

/* ─────────────────────────────── клиенты ─────────────────────────────── */

/** Позвать следующего клиента к окну. */
export function callCustomer(s: GameState, basePrice: (id: string) => number, forced?: { arch?: Arch; kind?: Kind; preset?: string }): Err {
  if (s.pending) return 'err.busyWindow';
  if (s.visitsToday >= visitsMax(s)) return 'err.dayOver';
  const r = rngOf(s);
  // Касса почти пуста (всё ушло в ларёк) — чаще приходят на чистку: для неё
  // детали не нужны, только паста, и игрок может заработать на закупку.
  if (!forced && s.cash < 450 && s.day >= 2 && r.chance(0.85)) forced = { kind: 'clean' };
  const o = makeOrder(r, s.nextOrder++, level(s), s.day, basePrice, forced, districtOf(s));
  s.pending = o;
  if (!forced && o.kind === 'build') {
    // Блогер: не чаще раза в 4 дня и с репутации 2 — иначе обзоры обесцениваются.
    if (level(s) >= 2 && s.day - (s.lastBlogger ?? -99) >= 4 && r.chance(0.12)) {
      o.blogger = true; s.lastBlogger = s.day;
      o.cust = { ...o.cust, arch: 'streamer', look: makeLook('streamer', o.cust.seed) };
    } else if (s.day >= 3 && r.chance(0.22)) bringParts(s, o, r, basePrice);
    else {
      // постоянный клиент: тот же человек приходит снова и вспоминает прошлый заказ
      const pool = (s.regulars ?? []).filter((x) => x.day < s.day);
      if (pool.length && r.chance(0.18)) { const reg = r.pick(pool); o.cust = reg.cust; o.regular = { stars: reg.stars }; }
    }
  }
  saveRng(s, r);
  s.visitsToday++;
  return null;
}

/** Попытка поторговаться: true — согласился на надбавку. */
export function haggle(s: GameState, archChance: number): boolean {
  if (!s.pending) return false;
  const r = rngOf(s);
  const ok = r.chance(archChance);
  saveRng(s, r);
  if (ok) s.pending.haggle = Math.round((s.pending.pay * 0.15) / 5) * 5;
  return ok;
}

export function acceptPending(s: GameState): Err {
  if (!s.pending) return 'err.noCustomer';
  if (activeOrders(s).length >= slotsMax(s)) return 'err.slotsFull';
  // свои детали клиент оставляет сразу: они ложатся на склад с пометкой (место не считаем)
  for (const id of s.pending.brought ?? []) give(s, id, true, { owner: s.pending.id });
  s.orders.push(s.pending);
  s.pending = null;
  return null;
}

export function declinePending(s: GameState): void { s.pending = null; }

/* ─────────────────────────────── верстак ─────────────────────────────── */

export function startBench(s: GameState, orderId: number): Err {
  if (s.bench !== null) return 'err.benchBusy';
  const o = s.orders.find((x) => x.id === orderId);
  if (!o || o.state !== 'active') return 'err.noOrder';
  o.state = 'bench';
  s.bench = o.id; s.src = {}; s.loose = []; s.gpuOpen = false;
  if (o.kind !== 'build') {
    // ПК клиента приезжает собранным: все его детали — «чужие», src пуст.
    o.build.panel = true;
  }
  return null;
}

/** Убрать проект с верстака обратно в очередь (детали остаются в сборке). */
export function shelveBench(s: GameState): void {
  const o = benchOrder(s);
  if (o) o.state = 'active';
  s.bench = null;
}

export function install(s: GameState, uidOrLoose: { uid?: number; looseId?: string }, ramSlot?: number): Err {
  const o = benchOrder(s);
  if (!o) return 'err.noBench';
  const b = o.build;
  let id: string;
  let used = false;
  let extra: Omit<Src, 'used'> = {};
  if (uidOrLoose.uid !== undefined) {
    const it = s.inv.find((x) => x.uid === uidOrLoose.uid);
    if (!it) return 'err.noItem';
    if (it.owner !== undefined && it.owner !== o.id) return 'why.notYours';
    if (it.broken) return 'why.broken';
    id = it.id; used = it.used;
    extra = { doa: it.doa, fake: it.fake, fakeKnown: it.fakeKnown, owner: it.owner };
  } else {
    id = uidOrLoose.looseId!;
  }
  if (b.panel && part(id).cat !== 'case') return 'why.panelClosed';
  const v = canInstall(b, id);
  if (!v.ok) return v.why!;
  const slot = SLOT_OF[part(id).cat];
  if (slot === 'ram') {
    // планка встаёт в выбранный слот (или в первый свободный из рекомендуемых)
    const total = (part(b.mb!) as { slots: number }).slots;
    const used = b.ram ? ramSlotsOf(b, total) : [];
    const order = total === 2 ? [0, 1] : RAM_ORDER4;
    const at = ramSlot ?? order.find((i) => !used.includes(i));
    if (at === undefined || used.includes(at) || at >= total) return 'why.slotBusy';
    if (b.ram === id) b.ramN = (b.ramN ?? 1) + 1; else { b.ram = id; b.ramN = 1; }
    b.ramSlots = [...used, at];
  } else (b as Record<string, unknown>)[slot] = id;
  if (uidOrLoose.uid !== undefined) {
    s.inv = s.inv.filter((x) => x.uid !== uidOrLoose.uid);
    s.src[slot] = { used, ...extra };
    // б/у деталь в новой сборке — клиент может заметить при выдаче
    if (used && extra.owner === undefined) o.usedIn = [...new Set([...(o.usedIn ?? []), slot])];
    if (extra.doa && !b.bad?.includes(slot)) b.bad = [...(b.bad ?? []), slot];
    if (extra.fake && slot === 'gpu') { b.fakeGpu = true; b.fakeKnown = !!extra.fakeKnown; }
    if (extra.owner !== undefined) o.ownUsed = [...new Set([...(o.ownUsed ?? []), slot])];
  } else {
    s.loose.splice(s.loose.indexOf(id), 1);
    delete s.src[slot];
  }
  return null;
}

/** БП сгорел на тесте: из сборки он исчезает совсем (на склад не возвращается). */
export function burnPsu(s: GameState): void {
  const o = benchOrder(s);
  if (!o?.build.psu) return;
  addLoss(s, 'loss.psu', buyPrice(s, o.build.psu));
  delete o.build.psu;
  o.build.cab24 = false; o.build.cab8 = false; o.build.cabGpu = false;
  o.build.tidy = false; o.build.tidyAsked = false;
}

/** Итог пятнашек «Правильная прокладка кабелей». */
export function setTidy(s: GameState, tidy: boolean): void {
  const o = benchOrder(s);
  if (!o) return;
  o.build.tidy = tidy; o.build.tidyAsked = true;
}

export function applyPaste(s: GameState): Err {
  const o = benchOrder(s);
  if (!o) return 'err.noBench';
  if (s.pasteUses <= 0) return 'err.noPaste';
  if (o.build.panel) return 'why.panelClosed';
  const v = canInstall(o.build, 'mx6');
  if (!v.ok) return v.why!;
  o.build.paste = true;
  s.pasteUses--;
  return null;
}

export function wipePaste(s: GameState): Err {
  const o = benchOrder(s);
  if (!o) return 'err.noBench';
  if (o.build.cooler) return 'why.coolerOn';
  o.build.oldPaste = false;
  o.build.paste = false;
  return null;
}

export function remove(s: GameState, slot: SlotKey): Err {
  const o = benchOrder(s);
  if (!o) return 'err.noBench';
  const b = o.build;
  const v = canRemove(b, slot);
  if (!v.ok) return v.why!;
  if (slot === 'paste') { b.paste = false; return null; }
  const id = b[slot as Exclude<SlotKey, 'paste'>] as string | undefined;
  if (!id) return null;
  const src = s.src[slot];
  const bad = !!b.bad?.includes(slot);
  if (src) {
    if (s.inv.length >= capacity(s) + 4) return 'err.shelfFull';
    // разоблачённый тестом брак ложится на полку неисправным (починить или сдать на запчасти),
    // не проверенный — назад как был
    if (bad && b.badSeen) give(s, id, true, { broken: true, owner: src.owner });
    else give(s, id, src.used, { doa: bad, fake: slot === 'gpu' ? b.fakeGpu : undefined, fakeKnown: b.fakeKnown, owner: src.owner });
  } else {
    s.loose.push(id);
  }
  if (bad) b.bad = b.bad!.filter((k) => k !== slot);
  if (slot === 'gpu') { delete b.fakeGpu; delete b.fakeKnown; }
  if (src?.owner !== undefined && o.ownUsed) o.ownUsed = o.ownUsed.filter((k) => k !== slot);
  if (o.usedIn) o.usedIn = o.usedIn.filter((k) => k !== slot);
  // планки снимаются по одной
  if (slot === 'ram' && (b.ramN ?? 1) > 1) {
    const total = (part(b.mb!) as { slots: number }).slots;
    b.ramSlots = ramSlotsOf(b, total).slice(0, -1);
    b.ramN = (b.ramN ?? 1) - 1; return null;
  }
  delete (b as Record<string, unknown>)[slot];
  if (slot === 'ram') { delete b.ramN; delete b.ramSlots; }
  delete s.src[slot];
  if (slot === 'cooler' && b.paste) {
    // Снятый кулер забирает с собой отпечаток пасты: ставить обратно на ту же — плохая идея.
    b.paste = false; b.oldPaste = true;
  }
  return null;
}

export type Cable = 'cab24' | 'cab8' | 'cabGpu';

export function toggleCable(s: GameState, c: Cable): Err {
  const o = benchOrder(s);
  if (!o) return 'err.noBench';
  const b = o.build;
  if (b.panel) return 'why.panelClosed';
  // отключил кабель — укладку придётся делать заново
  if (b[c]) { b[c] = false; b.tidy = false; b.tidyAsked = false; return null; }
  if (!b.psu) return 'why.needPsu';
  if (c === 'cab24' && !b.mb) return 'why.needMb';
  if (c === 'cab8' && !b.cpu) return 'why.needCpu';
  if (c === 'cabGpu' && !b.gpu) return 'why.needGpu';
  b[c] = true;
  return null;
}

export function togglePanel(s: GameState): Err {
  const o = benchOrder(s);
  if (!o) return 'err.noBench';
  if (!o.build.case) return 'why.needCase';
  o.build.panel = !o.build.panel;
  return null;
}

export function setDust(s: GameState, v: number): void {
  const o = benchOrder(s);
  if (o) o.build.dust = Math.max(0, v);
}

export function repasteGpu(s: GameState): Err {
  const o = benchOrder(s);
  if (!o) return 'err.noBench';
  if (s.pasteUses <= 0) return 'err.noPaste';
  o.build.gpuOldPaste = false;
  o.build.gpuPaste = true;
  s.pasteUses--;
  return null;
}

/** Готово: ПК упакован и ждёт клиента. */
export function finishBench(s: GameState): Err {
  const o = benchOrder(s);
  if (!o) return 'err.noBench';
  if (!o.build.case) return 'err.emptyBuild';
  // Детали клиента, снятые и не вернутые на место, при апгрейде отходят мастеру
  // как б/у («trade-in»), при чистке — так нельзя, их надо вернуть.
  if (s.loose.length) {
    // снятые со старого ПК детали — б/у, и изредка уже мёртвые (покажет тест)
    if (o.kind === 'upgrade') { const r = rngOf(s); for (const id of s.loose) give(s, id, true, { doa: r.chance(0.1) }); saveRng(s, r); s.loose = []; }
    else return 'err.looseParts';
  }
  o.state = 'ready';
  s.bench = null; s.src = {}; s.gpuOpen = false;
  return null;
}

/**
 * Клиент принёс свои детали (1–2 штуки из старого ПК). Они могут не подойти
 * к сборке — тогда мастер ставит свои и при выдаче просит доплату.
 * Бюджет заказа уменьшается на их стоимость: клиент же платит меньше.
 */
function bringParts(s: GameState, o: Order, r: Rng, basePrice: (id: string) => number): void {
  const cats = r.chance(0.35) ? [r.pick(['gpu', 'ssd', 'psu'] as const), r.pick(['ram', 'case'] as const)] : [r.pick(['gpu', 'ram', 'ssd', 'psu', 'case'] as const)];
  const ids: string[] = [];
  for (const c of cats) {
    const pool = ALL.filter((p) => p.cat === c && p.rep <= level(s));
    const p = r.pick(pool);
    ids.push(p.id);
    if (c === 'ram') ids.push(p.id); // память — парой планок
  }
  const worth = ids.reduce((n, id) => n + basePrice(id), 0);
  o.brought = ids;
  o.pay = Math.max(Math.round(o.pay * 0.4 / 10) * 10, Math.round((o.pay - worth * 0.9) / 10) * 10);
}

/**
 * Доплата при выдаче: детали клиента, которые мастер заменил своими.
 * Цена — сегодняшняя рыночная за то, что стоит вместо них.
 */
export function surcharge(s: GameState, o: Order): number {
  if (!o.brought?.length || o.returned) return 0;
  let n = 0;
  const seen = new Set<string>();
  for (const id of o.brought) {
    const slot = SLOT_OF[part(id).cat];
    if (seen.has(slot)) continue;
    seen.add(slot);
    const now = o.build[slot as 'gpu'];
    if (!now || o.ownUsed?.includes(slot)) continue;
    n += buyPrice(s, now) * (slot === 'ram' ? (o.build.ramN ?? 1) : 1);
  }
  return Math.round(n / 5) * 5;
}

/** Заметит ли клиент б/у детали в новой сборке (в 25% случаев) — и сколько попросит скинуть. */
export function rollUsedNotice(s: GameState, o: Order): void {
  if (o.usedNotice !== undefined) return;
  const r = rngOf(s);
  o.usedNotice = o.kind === 'build' && !o.returned && o.usedIn?.length && r.chance(0.25) ? Math.max(10, Math.round((o.pay * 0.12) / 5) * 5) : 0;
  saveRng(s, r);
}

/** Решить при выдаче, попросит ли клиент скидку (один раз на заказ). */
export function rollBargain(s: GameState, o: Order, archHaggle: number): void {
  if (o.bargain !== undefined) return;
  const r = rngOf(s);
  // торгуются при выдаче редко и только «торгующиеся» типы: после согласованной цены это раздражает
  o.bargain = !o.returned && o.kind !== 'clean' && archHaggle >= 0.5 && r.chance(archHaggle * 0.2) ? Math.max(10, Math.round((o.pay * r.range(0.07, 0.12)) / 5) * 5) : 0;
  saveRng(s, r);
}

/** Выдать готовый заказ клиенту — возвращает оценку для реакции у окна. */
/*
 * Выдача и возвраты. Клиент забирает ПК, платит полную цену и уходит — на
 * месте он проблем не видит. Если сборка не тянет его задачи (1–2 звезды:
 * слабо по баллам, греется, не то, что просил), он ВОЗВРАЩАЕТСЯ на следующий
 * день с компьютером. Тогда три исхода, как в жизни:
 *  - «переделаю бесплатно» — ПК остаётся у мастера, заказ снова в работе,
 *    повторная выдача уже без оплаты (деньги получены);
 *  - «верну деньги» — мастер отдаёт оплату, детали достаются ему как б/у;
 *  - «частичный возврат» — клиент оставляет ПК себе, мастер возвращает часть.
 */
export function deliver(s: GameState, orderId: number, opt: { discount?: number; extra?: number; noTip?: boolean } = {}): Evaluation | null {
  const o = s.orders.find((x) => x.id === orderId);
  if (!o || o.state !== 'ready') return null;
  const ev = evaluate(o, o.build, upVal(s, 'coffee') ? 1.3 : 1);
  o.result = ev;
  o.state = 'done';
  // повторная выдача после возврата — деньги уже были уплачены
  const pay = o.returned ? 0 : Math.max(0, o.pay + o.haggle - (opt.discount ?? 0) + (opt.extra ?? 0));
  const tip = ev.stars >= 4 && !o.returned && !opt.noTip ? ev.tip : 0;
  // неиспользованные детали клиент забирает с собой
  s.inv = s.inv.filter((it) => it.owner !== o.id);
  o.paid = (o.paid ?? 0) + pay;
  s.cash += pay + tip;
  s.today.income += pay; s.today.tips += tip; s.today.served++;
  if (opt.discount) addLoss(s, 'loss.discount', opt.discount);
  if (!o.returned && ev.stars > (s.today.best?.stars ?? 0)) s.today.best = { id: o.id, stars: ev.stars };
  // постоянные клиенты: помним, кого обслужили и как
  if (!o.returned && !o.blogger) {
    const reg = (s.regulars ??= []).filter((x) => x.cust.seed !== o.cust.seed);
    reg.push({ cust: o.cust, stars: ev.stars, day: s.day });
    s.regulars = reg.slice(-10);
  }
  s.totalEarned += pay + tip;
  // задания дня
  if (!o.returned) {
    progress(s, 'serve');
    progress(s, 'earn', pay + tip);
    if (o.kind === 'build' && ev.stars >= 5) progress(s, 'build5');
    if (o.kind === 'clean' && ev.stars >= 4) progress(s, 'clean');
    if (o.kind === 'upgrade' && ev.stars >= 4) progress(s, 'upgrade');
  }
  if (ev.stars <= 2) {
    // проблему клиент обнаружит дома: вернётся завтра
    o.returnAt = s.day + 1;
  } else {
    s.today.stars.push(ev.stars);
    // чистка — вполовину опыта: иначе репутация (и аренда) обгоняли деньги
    s.xp = Math.max(0, s.xp + (o.kind === 'clean' ? Math.round(ev.xp * 0.5) : ev.xp));
  }
  if (o.blogger && !o.returned) {
    // Обзор выходит завтра: хорошая сборка — очередь к ларьку, плохая — отток.
    const good = ev.stars >= 4, bad = ev.stars <= 2;
    if (good) s.xp += ev.xp;
    if (bad) s.xp = Math.max(0, s.xp - 25);
    s.buzz = { day: s.day + 1, n: good ? 2 : bad ? -1 : 0 };
    s.market.news.push({ day: s.day + 1, key: good ? 'news.blogGood' : bad ? 'news.blogBad' : 'news.blogOk', kind: good ? 'start' : bad ? 'fake' : 'flavor' });
  }
  if (o.kind === 'build' && !o.returned) s.built++;
  if (!s.won && isLegend(s)) s.won = true;
  return { ...ev, payout: pay, tip };
}

/** Заказ, с которым клиент пришёл обратно (первый по очереди), или null. */
export function dueReturn(s: GameState): Order | null {
  return s.orders.find((o) => o.state === 'done' && o.returnAt !== undefined && o.returnAt <= s.day) ?? null;
}

/** «Переделаю бесплатно»: ПК остаётся у мастера, заказ снова активен. */
export function returnFix(s: GameState, orderId: number): void {
  const o = s.orders.find((x) => x.id === orderId);
  if (!o) return;
  delete o.returnAt;
  o.state = 'active';
  o.returned = true;
  o.rework = (o.rework ?? 0) + 1;
  o.day = s.day;
  s.today.stars.push(2);
  s.xp = Math.max(0, s.xp - 5);
}

/** «Верну деньги»: оплата назад, детали — мастеру как б/у. Возвращает их id. */
export function returnRefund(s: GameState, orderId: number): string[] {
  const o = s.orders.find((x) => x.id === orderId);
  if (!o) return [];
  delete o.returnAt;
  const paid = o.paid ?? 0;
  s.cash -= paid; s.today.income -= paid; s.totalEarned -= paid;
  addLoss(s, 'loss.refund', paid);
  const back: string[] = [];
  if (o.kind === 'build') {
    for (const k of ['case', 'mb', 'cpu', 'cooler', 'ram', 'ssd', 'gpu', 'psu'] as const) {
      const id = o.build[k];
      if (id) { const n = k === 'ram' ? (o.build.ramN ?? 1) : 1; for (let i = 0; i < n; i++) { give(s, id, true); back.push(id); } }
    }
  } else if (o.orig) {
    // апгрейд: клиенту — его старый ПК, мастеру — поставленные им новые детали
    for (const k of ['ram', 'ssd', 'gpu', 'cooler', 'psu', 'cpu'] as const) {
      const now = o.build[k];
      if (now && now !== o.orig[k]) { give(s, now, true); back.push(now); }
    }
  }
  o.state = 'failed';
  s.today.stars.push(1);
  s.xp = Math.max(0, s.xp - 15);
  return back;
}

/** «Частичный возврат»: клиент оставляет ПК, мастер возвращает долю оплаты. */
export function returnDiscount(s: GameState, orderId: number, share: number): number {
  const o = s.orders.find((x) => x.id === orderId);
  if (!o) return 0;
  delete o.returnAt;
  const back = Math.round(((o.paid ?? 0) * share) / 5) * 5;
  s.cash -= back; s.today.income -= back; s.totalEarned -= back;
  addLoss(s, 'loss.discount', back);
  o.paid = (o.paid ?? 0) - back;
  s.today.stars.push(2);
  s.xp = Math.max(0, s.xp - 8);
  return back;
}

/** Отказаться от принятого заказа (штраф репутацией). */
export function cancelOrder(s: GameState, orderId: number): void {
  const o = s.orders.find((x) => x.id === orderId);
  if (!o) return;
  if (s.bench === o.id) {
    // Свои детали возвращаем на склад, чужие уезжают с клиентом.
    for (const [slot, src] of Object.entries(s.src)) {
      const id = o.build[slot as 'gpu'];
      if (src && id) give(s, id, src.used);
    }
    s.bench = null; s.src = {}; s.loose = []; s.gpuOpen = false;
  }
  // свои детали клиент забирает
  s.inv = s.inv.filter((it) => it.owner !== o.id);
  o.state = 'failed';
  s.xp = Math.max(0, s.xp - 20);
}

/* ─────────────────────────────── день ─────────────────────────────── */

export function endDay(s: GameState): DayStats {
  const r = rent(s);
  s.cash -= r;
  s.today.rent = r;
  const stats = s.today;
  // Посетитель у окна, с которым не договорились, уходит.
  s.pending = null;
  return stats;
}

export function startNextDay(s: GameState): void {
  const r = rngOf(s);
  marketNextDay(s.market, r);
  s.day++;
  // совсем без денег и без пасты — поставщик дарит пробник: хватит на одну чистку
  if (s.cash < 8 && s.pasteUses <= 0) s.pasteUses = 1;
  // Объявления частников: видеокарта на 40–55% дешевле рынка. Чаще всего это
  // перешитая подделка — но иногда и правда выгодная сделка.
  s.deals = [];
  if (s.day >= 2 && r.chance(0.5)) {
    const pool = GPUS.filter((g0) => g0.rep <= level(s) + 1 && g0.rep >= 2);
    if (pool.length) {
      const g0 = r.pick(pool);
      s.deals.push({ id: g0.id, price: Math.round((priceOf(s.market, g0.id) * r.range(0.45, 0.6)) / 5) * 5, fake: r.chance(0.6) });
    }
  }
  saveRng(s, r);
  s.visitsToday = 0;
  s.today = freshDay();
  // Заказы, висящие дольше трёх дней, клиент забирает назад — с потерей репутации.
  for (const o of s.orders) {
    if ((o.state === 'active') && s.day - o.day > 3) { o.state = 'failed'; s.xp = Math.max(0, s.xp - 15); }
  }
  s.orders = s.orders.filter((o) => o.state !== 'done' && o.state !== 'failed' || s.day - o.day < 2);
}

export function buyUpgrade(s: GameState, id: UpId): Err {
  const lv = s.up[id];
  const price = UPGRADES[id].prices[lv];
  if (price === undefined) return 'err.maxed';
  if (s.cash < price) return 'err.noMoney';
  s.cash -= price; s.today.spent += price;
  s.up[id]++;
  return null;
}

export const catOfItem = (it: Item): Cat => part(it.id).cat;
