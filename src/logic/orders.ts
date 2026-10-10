/**
 * Заказы: генерация, решатель, оценка.
 *
 * Бюджет заказа считается от САМОЙ ДЕШЁВОЙ подходящей сборки по БАЗОВЫМ
 * ценам, умноженной на 1.3–1.55. Это гарантирует две вещи:
 *   1) заказ всегда выполним тем, что продаётся при текущей репутации;
 *   2) прибыль зависит от рынка: в майнинг-бум видеокартный заказ может
 *      уйти в минус, если не закупился заранее, — ради этого и рынок.
 */

import { CPUS, GPUS, MBS, RAMS, SSDS, PSUS, COOLERS, CASES, part, type Cat, type GPU, type RAM, type SSD } from './parts.ts';
import { canInstall, gameScore, workScore, runTest, powerDraw, temps, g, type Build, ramTotal } from './compat.ts';
import { ARCHS, makeLook, type Arch, type PersonLook } from './customers.ts';
import { Rng } from './rng.ts';
import { DISTRICTS, type District } from './districts.ts';

export type Kind = 'build' | 'upgrade' | 'clean';

export interface Preset { id: string; score?: number; work?: number; ram: number; ssd: number; itx?: boolean }

export const PRESETS: Record<string, Preset> = {
  office: { id: 'office', score: 14, ram: 16, ssd: 500 },
  esports: { id: 'esports', score: 30, ram: 16, ssd: 500 },
  fhd: { id: 'fhd', score: 44, ram: 16, ssd: 1000 },
  mini: { id: 'mini', score: 42, ram: 16, ssd: 1000, itx: true },
  qhd: { id: 'qhd', score: 62, ram: 32, ssd: 1000 },
  stream: { id: 'stream', score: 66, work: 62, ram: 32, ssd: 1000 },
  uhd: { id: 'uhd', score: 84, ram: 32, ssd: 2000 },
  work: { id: 'work', work: 84, ram: 64, ssd: 2000 },
};

export interface Req {
  preset: string;
  score?: number;
  work?: number;
  ram: number;
  ssd: number;
  itx?: boolean;
  white?: boolean;
  rgb?: boolean;
  silent?: boolean;
  vendor?: 'amd' | 'intel';
  /** «Чтобы работал годами»: блок питания Gold+ с запасом 40%, процессор не горячее 75°. */
  reliable?: boolean;
  /** Главное пожелание: его невыполнение стоит две звезды, остальные — одну. */
  main?: 'white' | 'rgb' | 'silent' | 'vendor' | 'reliable' | 'score';
  /** Апгрейд: какую категорию заменить. */
  upCat?: Cat;
}

export interface Customer { arch: Arch; nameIdx: number; seed: number; look: PersonLook }

export interface Order {
  id: number;
  kind: Kind;
  cust: Customer;
  req: Req;
  pay: number;
  /** Сколько сверху выторговано. */
  haggle: number;
  state: 'active' | 'bench' | 'ready' | 'done' | 'failed';
  /** Для апгрейда и чистки — ПК клиента, для сборки — то, что собрано. */
  build: Build;
  /** Что было в ПК клиента до работы (апгрейд: старая деталь). */
  orig?: Build;
  day: number;
  result?: Evaluation;
  /** Сколько раз клиент возвращал заказ на переделку. */
  rework?: number;
  /** Сколько клиент заплатил (для возврата денег). */
  paid?: number;
  /** День, когда недовольный клиент принесёт ПК обратно. */
  returnAt?: number;
  /** ПК уже возвращался: повторная выдача без оплаты. */
  returned?: boolean;
  /** Клиент — блогер: оценка уйдёт в обзор (репутация ×2, очередь или отток завтра). */
  blogger?: boolean;
  /** Детали, которые клиент принёс свои (id), и в какие слоты они реально встали. */
  brought?: string[];
  ownUsed?: string[];
  /** Сколько клиент попросит скинуть при выдаче (0 — не торгуется). */
  bargain?: number;
  /** Повторный визит постоянного клиента: сколько звёзд было в прошлый раз. */
  regular?: { stars: number };
  /** Слоты, куда мастер поставил б/у детали, и решение «заметил ли клиент» (сумма скидки или 0). */
  usedIn?: string[];
  usedNotice?: number;
}

/* ─────────────────────────────── решатель ─────────────────────────────── */

/** Надёжная сборка: блок питания не хуже Gold и с запасом 40% по мощности. */
export const GOLD = ['Gold', 'Platinum', 'Titanium'];
export const RELIABLE_PSU = 1.4;
export const RELIABLE_TEMP = 75;

const avail = <T extends { rep: number }>(arr: T[], rep: number) => arr.filter((p) => p.rep <= rep);
const cheapest = <T extends { id: string }>(arr: T[], price: (id: string) => number): T | undefined =>
  arr.slice().sort((a, b) => price(a.id) - price(b.id))[0];

/**
 * Самая дешёвая сборка под требования. Перебор процессор × видеокарта
 * (~130 пар), остальное подбирается жадно — категории независимы, если
 * зафиксированы сокет, тип памяти, мощность и длина видеокарты.
 */
export function solve(req: Req, rep: number, price: (id: string) => number): { build: Build; cost: number } | null {
  // «С подсветкой» закрывает либо RGB-память, либо корпус со светящимися вентиляторами — берём дешевле
  if (!req.rgb) return solveVia(req, rep, price, null);
  const a = solveVia(req, rep, price, 'ram'), b = solveVia(req, rep, price, 'case');
  return !a ? b : !b ? a : a.cost <= b.cost ? a : b;
}

function solveVia(req: Req, rep: number, price: (id: string) => number, rgbVia: 'ram' | 'case' | null): { build: Build; cost: number } | null {
  let best: { build: Build; cost: number } | null = null;
  const cases = avail(CASES, rep).filter((c) => (!req.white || c.color === 'white') && (!req.itx || c.size === 'mini') && (rgbVia !== 'case' || c.rgb));
  for (const cpu of avail(CPUS, rep)) {
    if (req.vendor && cpu.vendor !== req.vendor) continue;
    for (const gpu of avail(GPUS, rep)) {
      const probe: Build = { cpu: cpu.id, gpu: gpu.id, ram: undefined };
      const ramPick = avail(RAMS, rep).filter((r) => (rgbVia !== 'ram' || r.rgb));
      if (!ramPick.length) continue;
      // Балл зависит от памяти только порогом 16 ГБ и каналами; берём пару планок.
      probe.ram = ramPick.find((r) => r.gb * 2 >= Math.max(16, req.ram))?.id ?? ramPick[0].id; probe.ramN = 2;
      if (req.score && gameScore(probe) < req.score) continue;
      if (req.work && workScore({ ...probe, ram: ramPick.find((r) => r.gb >= 32)?.id ?? probe.ram, ramN: 2 }) < req.work) continue;
      for (const mbType of ['DDR4', 'DDR5'] as const) {
        const mbs = avail(MBS, rep).filter((m) => m.socket === cpu.socket && m.ram === mbType && (!req.itx || m.form === 'ITX'));
        const rams = ramPick.filter((r) => r.type === mbType);
        if (!mbs.length || !rams.length) continue;
        // самая дешёвая комбинация «планка × количество» (пара — предпочтительно)
        let ram: { id: string; n: number; cost: number } | null = null;
        for (const r of rams) for (const n of [2, 4, 1]) {
          if (r.gb * n < req.ram || (n === 1 && req.ram > 0)) continue;
          const c = price(r.id) * n;
          if (!ram || c < ram.cost) ram = { id: r.id, n, cost: c };
        }
        if (!ram) continue;
        if (req.work && workScore({ cpu: cpu.id, gpu: gpu.id, ram: ram.id, ramN: ram.n }) < req.work) continue;
        const draw = cpu.tdp + gpu.tdp + 75;
        const psu = cheapest(avail(PSUS, rep).filter((p) => req.reliable ? p.watt >= draw * RELIABLE_PSU && GOLD.includes(p.tier) : p.watt >= draw * 1.2), price);
        const coolerNeed = Math.max(req.silent ? cpu.tdp * 1.6 : cpu.tdp * 1.05, req.reliable ? cpu.tdp * 1.3 : 0);
        const ssd = cheapest(avail(SSDS, rep).filter((s) => s.gb >= req.ssd), price);
        if (!psu || !ssd) continue;
        for (const mb of mbs) {
          if (ram.n > mb.slots) continue;
          const cs = cases.filter((c) => c.gpuMax >= gpu.len && (c.form === 'ATX' || mb.form === 'ITX' || (c.form === 'mATX' && mb.form !== 'ATX')));
          for (const cs1 of cs) {
            const cool = cheapest(avail(COOLERS, rep).filter((c) => c.cap >= coolerNeed && (c.kind !== 'tower' || c.height <= cs1.coolerMax) && !(c.kind === 'aio' && cs1.size === 'mini')), price);
            if (!cool) continue;
            const b: Build = { case: cs1.id, mb: mb.id, cpu: cpu.id, cooler: cool.id, ram: ram.id, ramN: ram.n, ssd: ssd.id, gpu: gpu.id, psu: psu.id };
            const cost = [cs1.id, mb.id, cpu.id, cool.id, ssd.id, gpu.id, psu.id].reduce((s, id) => s + price(id), 0) + ram.cost;
            if (!best || cost < best.cost) best = { build: b, cost };
          }
        }
      }
    }
  }
  return best;
}

/* ─────────────────────────────── генерация ─────────────────────────────── */

// С какого уровня репутации пресет может прийти — пресет должен быть решаем
// каталогом этого уровня (проверяется прогоном `npm run sim`).
// QHD — с 3-й репутации: на 2-й нужного железа ещё нет (балл 57 < 62, аудит Codex)
const PRESET_REP: Record<string, number> = { office: 1, esports: 1, fhd: 2, mini: 3, qhd: 3, stream: 3, uhd: 5, work: 5 };

export function pickArch(rng: Rng, rep: number, only: Arch[] | null = null): Arch {
  const pool = (Object.keys(ARCHS) as Arch[]).filter((a) => ARCHS[a].minRep <= rep);
  // район задаёт свою публику; если из неё никто ещё не «открыт» репутацией — берём всех
  const local = only ? pool.filter((a) => only.includes(a)) : pool;
  return rng.pick(local.length ? local : pool);
}

/** Новый клиент с заказом. `basePrice` — базовые цены каталога (без рынка). */
export function makeOrder(rng: Rng, id: number, rep: number, day: number, basePrice: (id: string) => number, forced?: { arch?: Arch; kind?: Kind; preset?: string }, dist: District = DISTRICTS.park): Order {
  const o = makeOrderRaw(rng, id, rep, day, basePrice, forced, dist);
  // в богатом районе платят больше, в спальном — меньше
  if (dist.payK !== 1) o.pay = Math.round((o.pay * dist.payK) / 5) * 5;
  return o;
}

function makeOrderRaw(rng: Rng, id: number, rep: number, day: number, basePrice: (id: string) => number, forced: { arch?: Arch; kind?: Kind; preset?: string } | undefined, dist: District): Order {
  const arch = forced?.arch ?? pickArch(rng, rep, dist.archs);
  const A = ARCHS[arch];
  const seed = rng.int(1, 1e9);
  const cust: Customer = { arch, nameIdx: rng.int(0, 11), seed, look: makeLook(arch, seed) };
  let kind: Kind = forced?.kind ?? 'build';
  if (!forced?.kind) {
    const r = rng.next();
    const K = dist.kinds ?? A.kinds;
    kind = r < K[0] ? 'build' : r < K[0] + K[1] ? 'upgrade' : 'clean';
    // Апгрейды и чистку открываем со второго дня: в первый игрок учится собирать.
    if (day < 2) kind = 'build';
  }
  const presets = A.presets.filter((p) => PRESET_REP[p] <= rep);
  const presetId = forced?.preset ?? rng.pick(presets.length ? presets : ['office']);

  if (kind === 'clean') return makeClean(rng, id, rep, day, cust, basePrice);
  if (kind === 'upgrade') {
    const up = makeUpgrade(rng, id, rep, day, cust, basePrice, presetId);
    if (up) return up;
  }
  return makeBuild(rng, id, rep, day, cust, basePrice, presetId);
}

function makeBuild(rng: Rng, id: number, rep: number, day: number, cust: Customer, basePrice: (id: string) => number, presetId: string): Order {
  const P = PRESETS[presetId];
  const req: Req = { preset: P.id, score: P.score, work: P.work, ram: P.ram, ssd: P.ssd, itx: P.itx };
  // Пожелания сверху — чем выше репутация, тем привередливее публика.
  if (rep >= 2 && rng.chance(0.3)) req.white = true;
  if (rep >= 2 && rng.chance(0.25) && P.id !== 'office') req.rgb = true;
  if (rep >= 3 && rng.chance(0.2)) req.silent = true;
  if (rep >= 3 && rng.chance(0.15)) req.vendor = rng.pick(['amd', 'intel'] as const);
  // Люди «чтобы годами работал» — не геймеры: им важнее блок питания и холодный процессор.
  if (rep >= 2 && ['office', 'dad', 'grandma', 'boss', 'designer', 'coder'].includes(cust.arch) && rng.chance(0.35)) req.reliable = true;
  let sol = solve(req, rep, basePrice);
  if (!sol) {
    // Пожелания несовместимы с доступным каталогом — отбрасываем их по одному.
    delete req.vendor; delete req.silent; delete req.rgb; delete req.white; delete req.reliable;
    sol = solve(req, rep, basePrice);
  }
  // одно пожелание — главное («Главное — тихий»): клиент — человек с приоритетом, а не список
  const wishes = (['white', 'rgb', 'silent', 'vendor', 'reliable'] as const).filter((k) => req[k]);
  if (wishes.length) req.main = rng.pick(wishes);
  else if (req.score && rng.chance(0.35)) req.main = 'score';
  const cost = sol?.cost ?? 600;
  // наценка ниже (симуляция tools/econ_sim.ts: деньги копились быстрее, чем их было куда тратить)
  const k = rng.range(1.25, 1.45) * ARCHS[cust.arch].budgetK;
  const pay = Math.round((cost * k) / 10) * 10;
  return { id, kind: 'build', cust, req, pay, haggle: 0, state: 'active', build: {}, day };
}

function makeUpgrade(rng: Rng, id: number, rep: number, day: number, cust: Customer, basePrice: (id: string) => number, presetId: string): Order | null {
  // Текущий ПК клиента — дешёвая сборка «на ступень ниже», с запасом по БП,
  // чтобы новая видеокарта влезла без замены блока питания.
  const order = ['office', 'esports', 'fhd', 'qhd', 'uhd'];
  const target = order.includes(presetId) ? presetId : 'fhd';
  const ti = Math.max(1, order.indexOf(target));
  const lower = order[ti - 1];
  const P0 = PRESETS[lower];
  const old = solve({ preset: lower, score: P0.score, ram: 16, ssd: 500 }, Math.max(1, rep - 1), basePrice);
  if (!old) return null;
  const b: Build = { ...old.build, paste: true, cab24: true, cab8: true, cabGpu: true, panel: true, dust: 0.15 };
  // Блок питания у клиента бывает с запасом: иначе почти любой апгрейд видеокарты требует и БП.
  const strongPsu = PSUS.filter((p) => p.rep <= rep).sort((a, c) => a.watt - c.watt).find((p) => p.watt >= 750);
  if (strongPsu) b.psu = strongPsu.id;
  const roll = rng.next();
  const upCat: Cat = roll < 0.6 ? 'gpu' : roll < 0.8 ? 'ram' : 'ssd';
  const T = PRESETS[target];
  const req: Req = { preset: target, ram: T.ram, ssd: T.ssd, upCat };
  let partCost = 0;
  if (upCat === 'gpu') {
    const c = g.case(b)!;
    const psuW = g.psu(b)!.watt;
    const cpu = g.cpu(b)!;
    const ok = GPUS.filter((x) => x.rep <= rep && x.len <= c.gpuMax && (cpu.tdp + x.tdp + 75) * 1.2 <= psuW)
      .filter((x) => gameScore({ ...b, gpu: x.id }) > gameScore(b) + 6)
      .sort((a, z) => basePrice(a.id) - basePrice(z.id));
    if (!ok.length) return null;
    // Цель — балл, которого достигает ВТОРАЯ по цене подходящая карта: есть выбор, но нужна не любая.
    const pickG = ok[Math.min(1, ok.length - 1)];
    req.score = gameScore({ ...b, gpu: pickG.id }) - 2;
    req.ram = 0; req.ssd = 0;
    // оплата — от той же карты, по которой поставлена цель (раньше от самой дешёвой,
    // которая цели могла не достигать)
    partCost = basePrice(pickG.id);
  } else if (upCat === 'ram') {
    const mb = g.mb(b)!;
    // апгрейд памяти: удвоить объём одинаковыми планками в пределах слотов платы
    const target = ramTotal(b) * 2;
    let best: { id: string; n: number } | null = null, bestC = Infinity;
    for (const r of RAMS) for (const n of [2, 4]) {
      if (r.rep > rep || r.type !== mb.ram || n > mb.slots || r.gb * n < target) continue;
      const c = basePrice(r.id) * n;
      if (c < bestC) { bestC = c; best = { id: r.id, n }; }
    }
    if (!best) return null;
    req.ram = target; req.ssd = 0;
    partCost = bestC;
  } else {
    const cur = g.ssd(b)!;
    const better = SSDS.filter((s) => s.rep <= rep && s.gb > cur.gb).sort((a, z) => basePrice(a.id) - basePrice(z.id))[0];
    if (!better) return null;
    req.ssd = better.gb; req.ram = 0;
    partCost = basePrice(better.id);
  }
  const pay = Math.round((partCost * rng.range(1.25, 1.45) + 30) / 5) * 5;
  return { id, kind: 'upgrade', cust, req, pay, haggle: 0, state: 'active', build: b, orig: { ...b }, day };
}

function makeClean(rng: Rng, id: number, rep: number, day: number, cust: Customer, basePrice: (id: string) => number): Order {
  const old = solve({ preset: 'esports', score: 30, ram: 16, ssd: 500 }, Math.max(1, rep), basePrice)!;
  const b: Build = { ...old.build, paste: false, oldPaste: true, cab24: true, cab8: true, cabGpu: true, panel: true, dust: 1, gpuOldPaste: rng.chance(0.55) };
  const pay = Math.round((45 + rep * 6 + rng.range(0, 15)) / 5) * 5;
  return { id, kind: 'clean', cust, req: { preset: 'clean', ram: 0, ssd: 0 }, pay, haggle: 0, state: 'active', build: b, orig: { ...b }, day };
}

/* ─────────────────────────────── оценка ─────────────────────────────── */

export interface Check { key: string; ok: boolean; vars?: Record<string, string | number>; major?: boolean; main?: boolean }
export interface Evaluation { stars: number; checks: Check[]; score: number; work: number; payout: number; tip: number; xp: number }

export function evaluate(o: Order, b: Build, tipK: number): Evaluation {
  const checks: Check[] = [];
  const test = runTest(b);
  const sc = test.score, wk = test.work;
  checks.push({ key: 'chk.boots', ok: test.stage === 'ok' || test.stage === 'throttle', major: true });
  if (o.kind === 'clean') {
    checks.push({ key: 'chk.dust', ok: (b.dust ?? 0) <= 0.12 });
    checks.push({ key: 'chk.paste', ok: !!b.paste && !b.oldPaste });
    if (o.orig?.gpuOldPaste) checks.push({ key: 'chk.gpuPaste', ok: !b.gpuOldPaste });
    checks.push({ key: 'chk.cool', ok: temps(b).cpu < 85 });
  } else {
    const r = o.req;
    if (o.kind === 'upgrade' && r.upCat) {
      const was = o.orig?.[r.upCat as 'gpu'];
      const now = b[r.upCat as 'gpu'];
      checks.push({ key: 'chk.replaced', ok: !!now && now !== was, vars: { cat: r.upCat } });
    }
    if (r.score) checks.push({ key: 'chk.score', ok: sc >= r.score, vars: { need: r.score, got: sc } });
    if (r.work) checks.push({ key: 'chk.work', ok: wk >= r.work, vars: { need: r.work, got: wk } });
    if (r.ram) checks.push({ key: 'chk.ram', ok: ramTotal(b) >= r.ram, vars: { need: r.ram } });
    if (r.ssd) checks.push({ key: 'chk.ssd', ok: (g.ssd(b)?.gb ?? 0) >= r.ssd, vars: { need: r.ssd >= 1000 ? r.ssd / 1000 + 'TB' : r.ssd + 'GB' } });
    if (r.itx) checks.push({ key: 'chk.itx', ok: g.case(b)?.size === 'mini' });
    if (r.white) checks.push({ key: 'chk.white', ok: g.case(b)?.color === 'white' });
    if (r.rgb) checks.push({ key: 'chk.rgb', ok: !!g.ram(b)?.rgb || !!g.case(b)?.rgb });
    if (r.silent) checks.push({ key: 'chk.silent', ok: (g.cooler(b)?.cap ?? 0) >= (g.cpu(b)?.tdp ?? 999) * 1.6 });
    if (r.vendor) checks.push({ key: 'chk.vendor', ok: g.cpu(b)?.vendor === r.vendor, vars: { v: r.vendor === 'amd' ? 'AMD' : 'Intel' } });
    checks.push({ key: 'chk.temps', ok: test.stage !== 'throttle' });
    checks.push({ key: 'chk.closed', ok: !!b.panel });
    // аккуратные кабели — только плюс (бонус к чаевым), «как попало» звёзд не снимает
    if (r.reliable) {
      const psu = g.psu(b);
      checks.push({ key: 'chk.psuTier', ok: !!psu && GOLD.includes(psu.tier) });
      checks.push({ key: 'chk.psuMargin', ok: !!psu && psu.watt >= powerDraw(b) * RELIABLE_PSU });
      checks.push({ key: 'chk.coolMargin', ok: test.temps.cpu <= RELIABLE_TEMP, vars: { n: RELIABLE_TEMP } });
    }
    if (b.tidy) checks.push({ key: 'chk.tidy', ok: true });
  }
  let stars = 5;
  // главное пожелание весит больше
  const MAIN_KEYS: Record<string, string[]> = { white: ['chk.white'], rgb: ['chk.rgb'], silent: ['chk.silent'], vendor: ['chk.vendor'], reliable: ['chk.psuTier', 'chk.psuMargin', 'chk.coolMargin'], score: ['chk.score'] };
  const mainKeys = o.req.main ? MAIN_KEYS[o.req.main] : [];
  for (const c of checks) if (mainKeys.includes(c.key)) c.main = true;
  for (const c of checks) if (!c.ok) stars -= c.major ? 4 : c.main ? 2 : 1;
  stars = Math.max(1, Math.min(5, stars));
  const pay = o.pay + o.haggle;
  const payout = Math.round(pay * (stars >= 3 ? 1 : stars === 2 ? 0.7 : 0.4));
  const tidyK = b.tidy ? 1.4 : 1;
  const tip = Math.round((stars === 5 ? pay * 0.08 * tipK * ARCHS[o.cust.arch].tipK : stars === 4 ? pay * 0.03 * tipK : 0) * tidyK);
  const xp = [0, -15, 0, 10, 22, 35][stars] + (b.tidy && stars >= 3 ? 3 : 0);
  return { stars, checks, score: sc, work: wk, payout, tip, xp };
}

/** Детали, которые игрок СНЯЛ с клиентского ПК при апгрейде, остаются ему б/у. */
export function swappedOut(o: Order, b: Build): string[] {
  if (!o.orig) return [];
  const out: string[] = [];
  for (const k of ['gpu', 'ram', 'ssd', 'cpu', 'psu', 'cooler'] as const) {
    const was = o.orig[k];
    if (was && b[k] !== was) out.push(was);
  }
  return out;
}

// верхние уровни дороже: бот без ошибок брал 10-й уровень к 15-му дню
export const REP_XP = [0, 0, 60, 160, 340, 640, 1100, 1700, 2500, 3500, 4800];
export function repLevel(xp: number): number {
  let lv = 1;
  for (let i = 1; i < REP_XP.length; i++) if (xp >= REP_XP[i]) lv = i;
  return lv;
}

/** Мелочи для UI. */
export const isGpu = (id?: string): id is string => !!id && part(id).cat === 'gpu';
export const ramGb = (id?: string): number => (id ? (part(id) as RAM).gb : 0);
export const ssdGb = (id?: string): number => (id ? (part(id) as SSD).gb : 0);
export const gpuPerf = (id?: string): number => (id ? (part(id) as GPU).perf : 0);
export { canInstall, powerDraw };
