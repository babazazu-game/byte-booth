/**
 * Совместимость, мощность, температуры.
 *
 * Чистые функции над описанием сборки — ни Three.js, ни DOM. Это та самая
 * «логика отдельно от рендера» из AGENTS.md: верстак в 3D только спрашивает
 * отсюда «можно ли поставить» и «что покажет тест», а сам ничего не решает.
 *
 * Правила взяты из реального железа, но упрощены до того, что игрок может
 * проверить глазами по карточке детали:
 *   - сокет процессора = сокет платы;
 *   - тип памяти = тип памяти платы;
 *   - форм-фактор платы помещается в корпус (ATX ⊃ mATX ⊃ ITX);
 *   - длина видеокарты ≤ допуска корпуса, высота кулера тоже;
 *   - блок питания тянет сумму TDP с запасом 20%;
 *   - кулер рассеивает TDP процессора (иначе перегрев и троттлинг).
 */

import { part, type CPU, type GPU, type MB, type RAM, type SSD, type PSU, type Cooler, type Case, type Form, type Cat } from './parts.ts';

export interface Build {
  case?: string;
  mb?: string;
  cpu?: string;
  paste?: boolean;
  cooler?: string;
  ram?: string;
  /** Сколько одинаковых планок памяти стоит (1/2/4). */
  ramN?: number;
  /** В каких слотах стоят планки (0..3); нет поля — раскладка по умолчанию. */
  ramSlots?: number[];
  ssd?: string;
  gpu?: string;
  psu?: string;
  /** Подключённые кабели питания. */
  cab24?: boolean;
  cab8?: boolean;
  cabGpu?: boolean;
  /** Кабели уложены аккуратно (пятнашки собраны) и было ли предложено их уложить. */
  tidy?: boolean;
  tidyAsked?: boolean;
  /** Слоты с бракованной деталью (выясняется на тесте) и показал ли тест брак. */
  bad?: SlotKey[];
  badSeen?: boolean;
  /** Стоит поддельная видеокарта; fakeKnown — тест её уже разоблачил. */
  fakeGpu?: boolean;
  fakeKnown?: boolean;
  /** Боковая панель закрыта. */
  panel?: boolean;
  /** Пыль 0..1 (для заказов на чистку). */
  dust?: number;
  /** Засохшая паста на процессоре (заказ на чистку). */
  oldPaste?: boolean;
  /** Видеокарта перебрана: свежая паста на её чипе. */
  gpuPaste?: boolean;
  gpuOldPaste?: boolean;
}

export type SlotKey = 'case' | 'mb' | 'cpu' | 'paste' | 'cooler' | 'ram' | 'ssd' | 'gpu' | 'psu';

const FORM_RANK: Record<Form, number> = { ITX: 0, mATX: 1, ATX: 2 };

export const g = {
  cpu: (b: Build) => (b.cpu ? (part(b.cpu) as CPU) : undefined),
  gpu: (b: Build) => (b.gpu ? (part(b.gpu) as GPU) : undefined),
  mb: (b: Build) => (b.mb ? (part(b.mb) as MB) : undefined),
  ram: (b: Build) => (b.ram ? (part(b.ram) as RAM) : undefined),
  ssd: (b: Build) => (b.ssd ? (part(b.ssd) as SSD) : undefined),
  psu: (b: Build) => (b.psu ? (part(b.psu) as PSU) : undefined),
  cooler: (b: Build) => (b.cooler ? (part(b.cooler) as Cooler) : undefined),
  case: (b: Build) => (b.case ? (part(b.case) as Case) : undefined),
};

/** Ответ «можно ли поставить»: ключ причины отказа идёт в локализацию. */
export interface Verdict { ok: boolean; why?: string; vars?: Record<string, string | number> }
const OK: Verdict = { ok: true };
const NO = (why: string, vars?: Record<string, string | number>): Verdict => ({ ok: false, why, vars });

/**
 * Можно ли установить деталь в текущую сборку прямо сейчас.
 * Порядок проверок — порядок, в котором игрок ошибается чаще всего.
 */
export function canInstall(b: Build, id: string): Verdict {
  const p = part(id);
  switch (p.cat) {
    case 'case':
      return b.case ? NO('why.slotBusy') : OK;
    case 'mb': {
      const c = g.case(b);
      if (!c) return NO('why.needCase');
      if (b.mb) return NO('why.slotBusy');
      if (FORM_RANK[p.form] > FORM_RANK[c.form]) return NO('why.formTooBig', { form: p.form, caseForm: c.form });
      return OK;
    }
    case 'cpu': {
      const m = g.mb(b);
      if (!m) return NO('why.needMb');
      if (b.cpu) return NO('why.slotBusy');
      if (p.socket !== m.socket) return NO('why.socket', { cpu: p.socket, mb: m.socket });
      return OK;
    }
    case 'paste':
      if (!b.cpu) return NO('why.needCpu');
      if (b.cooler) return NO('why.coolerOn');
      if (b.oldPaste) return NO('why.wipeFirst');
      if (b.paste) return NO('why.pasteDone');
      return OK;
    case 'cooler': {
      if (!b.cpu) return NO('why.needCpu');
      if (b.cooler) return NO('why.slotBusy');
      // Без пасты кулер не ставим: иначе игрок ставил кулер «насухо», а потом
      // упирался в шаг «термопаста», которую уже некуда нанести.
      if (!b.paste) return NO(b.oldPaste ? 'why.wipeFirst' : 'why.needPaste');
      const c = g.case(b);
      if (c && p.kind === 'tower' && p.height > c.coolerMax) return NO('why.coolerTall', { h: p.height, max: c.coolerMax });
      if (c && p.kind === 'aio' && c.size === 'mini') return NO('why.aioNoRoom');
      return OK;
    }
    case 'ram': {
      const m = g.mb(b);
      if (!m) return NO('why.needMb');
      if (p.type !== m.ram) return NO('why.ramType', { ram: p.type, mb: m.ram });
      // планки ставятся одинаковые и пока есть свободные слоты
      if (b.ram && b.ram !== id) return NO('why.ramMix');
      if (b.ram && (b.ramN ?? 1) >= m.slots) return NO('why.ramSlots', { n: m.slots });
      return OK;
    }
    case 'ssd':
      if (!b.mb) return NO('why.needMb');
      if (b.ssd) return NO('why.slotBusy');
      return OK;
    case 'gpu': {
      const m = g.mb(b);
      const c = g.case(b);
      if (!m || !c) return NO('why.needMb');
      if (b.gpu) return NO('why.slotBusy');
      if (p.len > c.gpuMax) return NO('why.gpuLong', { len: p.len, max: c.gpuMax });
      return OK;
    }
    case 'psu':
      if (!b.case) return NO('why.needCase');
      if (b.psu) return NO('why.slotBusy');
      return OK;
  }
}

/** Что мешает снять деталь: снимать надо в обратном порядке. */
export function canRemove(b: Build, slot: SlotKey): Verdict {
  const blockers: Partial<Record<SlotKey, () => boolean>> = {
    case: () => !!(b.mb || b.psu),
    mb: () => !!(b.cpu || b.ram || b.ssd || b.gpu),
    cpu: () => !!(b.cooler || b.paste),
    gpu: () => !!b.cabGpu,
    psu: () => !!(b.cab24 || b.cab8 || b.cabGpu),
  };
  if (b.panel) return NO('why.panelClosed');
  if (blockers[slot]?.()) return NO('why.removeOrder');
  return OK;
}

/*
 * Слоты памяти раскрашены в два цвета, как на настоящих платах: планки в
 * слотах ОДНОГО цвета работают в двухканальном режиме. Рекомендуемые — второй
 * и четвёртый (A2/B2), они яркие. На плате с двумя слотами каналы разные всегда.
 */
export const RAM_ORDER4 = [1, 3, 0, 2];
export function ramSlotsOf(b: Build, slots: number): number[] {
  const n = b.ram ? (b.ramN ?? 1) : 0;
  if (b.ramSlots && b.ramSlots.length === n) return b.ramSlots;
  if (slots === 2) return [0, 1].slice(0, n);
  return n === 1 ? [1] : n === 2 ? [1, 3] : n === 3 ? [1, 3, 0] : [0, 1, 2, 3].slice(0, n);
}
export function dualChannel(b: Build): boolean {
  const n = b.ram ? (b.ramN ?? 1) : 0;
  if (n < 2) return false;
  const slots = g.mb(b)?.slots ?? 4;
  if (slots === 2 || n >= 3) return true;
  const s = ramSlotsOf(b, slots);
  return s[0] % 2 === s[1] % 2;
}

/** Потребление системы под нагрузкой, Вт. 75 — плата, память, диски, вентиляторы. */
/** Объём памяти всего, ГБ: планка × количество. */
export function ramTotal(b: Build): number {
  return b.ram ? (g.ram(b)?.gb ?? 0) * (b.ramN ?? 1) : 0;
}

export function powerDraw(b: Build): number {
  return (g.cpu(b)?.tdp ?? 0) + (g.gpu(b)?.tdp ?? 0) + 75;
}

/** Рекомендованная мощность БП: потребление × 1.2 с округлением вверх до 50. */
export function psuNeeded(b: Build): number {
  return Math.ceil((powerDraw(b) * 1.2) / 50) * 50;
}

/**
 * Игровой балл. Видеокарта решает 75%, процессор 25%, но слабый процессор
 * «душит» сильную видеокарту: каждые недостающие пункты срезают половину.
 * Ровно так игрок интуитивно понимает «узкое горлышко» — и учится не ставить
 * RTX 5090 к i3.
 */
/**
 * Подделка — перешитая старая карта: по наклейке RTX, по факту уровень
 * давно снятой с продаж модели. Балл считается по настоящему чипу.
 */
export const FAKE_PERF = 18;
export const gpuPerf = (b: Build): number => (b.gpu ? (b.fakeGpu ? FAKE_PERF : g.gpu(b)!.perf) : 0);

export function gameScore(b: Build): number {
  const c = g.cpu(b), v = g.gpu(b);
  if (!c || !v) return 0;
  const vp = gpuPerf(b);
  const neck = Math.max(0, vp * 0.8 - c.perf) * 0.5;
  const ramGb = ramTotal(b);
  const ramPenalty = ramGb === 0 ? 30 : ramGb < 16 ? 10 : 0;
  // одна планка — одноканальный режим: процессору не хватает пропускной способности
  const single = b.ram && !dualChannel(b) ? 0.9 : 1;
  return Math.max(0, Math.round((vp * 0.75 + c.perf * 0.25 - neck - ramPenalty) * single));
}

/** Рабочий балл (рендер, нейросети): процессор и память важнее. */
export function workScore(b: Build): number {
  const c = g.cpu(b), v = g.gpu(b);
  if (!c) return 0;
  const ramGb = ramTotal(b);
  const ramK = ramGb >= 64 ? 1 : ramGb >= 32 ? 0.85 : 0.65;
  return Math.round((c.perf * 0.6 + (v ? gpuPerf(b) : 0) * 0.4) * ramK);
}

export interface Temps { cpu: number; gpu: number }

/** Температуры под нагрузкой. Пыль и засохшая паста — главный враг. */
export function temps(b: Build): Temps {
  const c = g.cpu(b), cl = g.cooler(b), v = g.gpu(b);
  const dust = b.dust ?? 0;
  let cpu = 30;
  if (c) {
    const cap = cl?.cap ?? 0;
    cpu = cap <= 0 ? 105 : 38 + (c.tdp / cap) * 42;
    if (!b.paste) cpu += b.oldPaste ? 24 : 38;
    cpu += dust * 22;
  }
  let gpu = 30;
  if (v) {
    gpu = 58 + v.tdp / 30;
    if (b.gpuOldPaste) gpu += 18;
    gpu += dust * 16;
  }
  return { cpu: Math.round(Math.min(cpu, 105)), gpu: Math.round(Math.min(gpu, 98)) };
}

export type TestStage = 'nopower' | 'nopost' | 'noboot' | 'burn' | 'shutdown' | 'throttle' | 'ok';

export interface TestResult {
  stage: TestStage;
  /** Ключи сообщений POST/BIOS для экрана монитора. */
  lines: string[];
  score: number;
  work: number;
  temps: Temps;
  draw: number;
}

/**
 * Что покажет тест на стенде. Порядок как у настоящего включения:
 * питание → POST (процессор, память) → загрузка с диска → нагрузка.
 */
export function runTest(b: Build): TestResult {
  const t = temps(b);
  const base = { score: 0, work: 0, temps: t, draw: powerDraw(b) };
  if (!b.psu || !b.cab24) return { ...base, stage: 'nopower', lines: [!b.psu ? 'test.noPsu' : 'test.no24'] };
  if (!b.mb) return { ...base, stage: 'nopower', lines: ['test.noMb'] };
  if (!b.cpu) return { ...base, stage: 'nopost', lines: ['test.noCpu'] };
  if (!b.cab8) return { ...base, stage: 'nopost', lines: ['test.no8'] };
  if (!b.ram) return { ...base, stage: 'nopost', lines: ['test.noRam'] };
  if (!b.cooler) return { ...base, stage: 'nopost', lines: ['test.noCooler'] };
  if (b.gpu && !b.cabGpu && (g.gpu(b)!.tdp > 75)) return { ...base, stage: 'nopost', lines: ['test.noGpuPower'] };
  if (!b.gpu) return { ...base, stage: 'nopost', lines: ['test.noGpu'] };
  if (!b.ssd) return { ...base, stage: 'noboot', lines: ['test.post', 'test.noSsd'] };
  // Брак в поставке: деталь установлена, но мёртвая. Тест говорит, КАКАЯ —
  // иначе игрок менял бы всё подряд.
  const doa = (['psu', 'mb', 'cpu', 'ram', 'gpu', 'ssd'] as const).find((k) => b.bad?.includes(k));
  if (doa) {
    const key = 'test.doa.' + doa;
    if (doa === 'psu' || doa === 'mb') return { ...base, stage: 'nopower', lines: [key] };
    if (doa === 'ssd') return { ...base, stage: 'noboot', lines: ['test.post', key] };
    return { ...base, stage: 'nopost', lines: [key] };
  }
  const need = powerDraw(b);
  // Сильный перегруз (БП слабее нужного больше чем на 15%) — блок сгорает;
  // небольшой — срабатывает защита, ПК просто выключается под нагрузкой.
  if (g.psu(b)!.watt < need * 0.85) return { ...base, stage: 'burn', lines: ['test.post', 'test.boot', 'test.psuBurn'] };
  if (g.psu(b)!.watt < need) return { ...base, stage: 'shutdown', lines: ['test.post', 'test.boot', 'test.psuWeak'] };
  const score = gameScore(b), work = workScore(b);
  if (t.cpu >= 95 || t.gpu >= 92) {
    return { ...base, score: Math.round(score * 0.7), work: Math.round(work * 0.7), stage: 'throttle', lines: ['test.post', 'test.boot', ...(b.fakeGpu ? ['test.fake'] : []), 'test.hot'] };
  }
  // подделку выдаёт драйвер: определяется не тот чип, что на наклейке
  return { ...base, score, work, stage: 'ok', lines: ['test.post', 'test.boot', ...(b.fakeGpu ? ['test.fake'] : []), 'test.bench'] };
}

/** Сколько стоит сборка по ЗАДАННЫМ ценам (рынок передаёт свои). */
export function buildCost(b: Build, price: (id: string) => number): number {
  let s = 0;
  for (const k of ['case', 'mb', 'cpu', 'cooler', 'ram', 'ssd', 'gpu', 'psu'] as const) {
    const id = b[k];
    if (id) s += price(id);
  }
  return s;
}

export const SLOT_OF: Record<Cat, SlotKey> = {
  case: 'case', mb: 'mb', cpu: 'cpu', paste: 'paste', cooler: 'cooler', ram: 'ram', ssd: 'ssd', gpu: 'gpu', psu: 'psu',
};
