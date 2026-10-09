import * as THREE from 'three';
import type { App } from './app.ts';
import { PcRig } from '../render/models/pc.ts';
import { buildGPU, type GpuModel } from '../render/models/gpu.ts';
import { setDust, type Dust } from '../render/models/dust.ts';
import { add, own, cyl, metal, box, V } from '../render/kit.ts';
import { part, type Cat, type GPU, colorName } from '../logic/parts.ts';
import { canInstall, runTest, SLOT_OF, type Build, type SlotKey, type TestResult } from '../logic/compat.ts';
import * as S from '../logic/state.ts';
import { evaluate } from '../logic/orders.ts';
import { t, money, lang } from '../i18n.ts';
import { h, btn, icon, thumb, toast, confirmBox, modal } from '../ui/dom.ts';
import { openGuide } from '../ui/guide.ts';
import { openCablePuzzle } from '../ui/cablePuzzle.ts';
import { sound } from '../audio/audio.ts';

/**
 * Верстак: 3D-сборка и её интерфейс.
 *
 * Игрок выбирает деталь в лотке снизу → подсвечивается её место в корпусе →
 * нажатие по месту ставит деталь (она «прилетает» и щёлкает). Плата,
 * видеокарта, блок питания и кулер после установки требуют закрутить
 * винты — короткое тактильное действие в духе ReStory: без него сборка
 * превращается в «нажми кнопку и смотри».
 */

type Tool = 'none' | 'remove' | 'brush';
interface Flight { obj: THREE.Object3D; to: THREE.Vector3; from: THREE.Vector3; t: number; dur: number }
interface Screw { mesh: THREE.Group; slot: SlotKey; done: boolean; spin: number }

const SCREWED: Partial<Record<SlotKey, number>> = { mb: 4, gpu: 1, psu: 2, cooler: 2 };

export class Bench {
  readonly rig = new PcRig();
  private root: THREE.Group;
  private sel: { uid?: number; looseId?: string } | null = null;
  private tool: Tool = 'none';
  private flights: Flight[] = [];
  /** Клубы дыма сгоревшего БП: всплывают и тают. */
  private smoke: { m: THREE.Mesh; v: THREE.Vector3; t: number }[] = [];
  private screws: Screw[] = [];
  private gpuLoose: { model: GpuModel; id: string; open: number } | null = null;
  private orderId: number | null = null;
  private dustInit = new Set<number>();
  tested: Record<number, TestResult> = {};
  private running = 0;
  private musicT: ReturnType<typeof setTimeout> | undefined;
  // интерфейс
  readonly el: HTMLElement;
  private toolsEl: HTMLElement;
  private flowEl: HTMLElement;
  private powerEl: HTMLElement;
  private itemsEl: HTMLElement;
  /** Горячие клавиши текущих кнопок верстака: код клавиши → действие. */
  private hotkeys = new Map<string, () => void>();
  private hintEl: HTMLElement;
  private dustEl: HTMLElement;
  private pickEl: HTMLElement;
  private ray = new THREE.Raycaster();
  /** brushing — нажали кистью ПО компьютеру (чистим); мимо него — крутим камеру. */
  private drag: { x: number; y: number; moved: boolean; button: number; brushing: boolean } | null = null;
  private lastBrush = 0;

  constructor(private app: App) {
    this.root = app.world.benchAnchor;
    this.root.add(this.rig.group);
    // Три зоны рук, как на настоящем рабочем месте:
    //  слева — инструменты (что делаю руками), справа — процесс (тест, сдать),
    //  снизу — кабели питания и лоток деталей (что ставлю).
    this.toolsEl = h('div', { class: 'bench-left' });
    this.flowEl = h('div', { class: 'bench-right' });
    this.powerEl = h('div', { class: 'bench-power' });
    this.itemsEl = h('div', { class: 'items live' });
    // на телефоне вместо россыпи кнопок — одна главная по шагу и «Ещё» (Codex: девять кнопок поверх корпуса)
    this.phoneBar = h('div', { class: 'bench-phone' });
    this.el = h('div', { class: 'tray hidden' }, this.toolsEl, this.flowEl, h('div', { class: 'bench-bottom' }, this.phoneBar, this.powerEl, this.itemsEl));
    this.hintEl = h('div', { class: 'hint hidden' });
    this.dustEl = h('div', { class: 'dustbar chip hidden' });
    this.pickEl = h('div', { class: 'panel live hidden', style: 'left:50%;top:50%;transform:translate(-50%,-50%);width:min(560px,calc(100% - 20px));max-height:calc(100% - 220px)' });
    // Выбор заказа — по центру экрана: вверху его перекрывали карточки заказов HUD.
    this.popEl = h('div', { class: 'partpop live hidden' });
    this.testEl = h('div', { class: 'testcard live hidden' });
    app.uiRoot.append(this.el, this.hintEl, this.dustEl, this.pickEl, this.popEl, this.testEl);
  }

  private phoneBar: HTMLElement;
  /** Всплывашка «Снять деталь» у места нажатия. */
  private popEl: HTMLElement;
  private hidePop(): void { this.popEl.classList.add('hidden'); }
  /** Результат теста — карточкой сбоку, чтобы не закрывать само «шоу» включения. */
  private testEl: HTMLElement;
  private hideTest(): void { this.testEl.classList.add('hidden'); }

  private get s(): S.GameState { return this.app.state!; }
  private get order() { return this.app.state ? S.benchOrder(this.app.state) : null; }
  private get build(): Build | null { return this.order?.build ?? null; }

  /* ───────────── синхронизация 3D ───────────── */

  /** Привести 3D к состоянию верстака. Зовётся после любого действия. */
  sync(animate = true): void {
    const o = this.order;
    if (!o) {
      if (this.orderId !== null) { this.rig.sync({}); this.orderId = null; }
      this.clearLooseGpu();
      this.screws.forEach((s) => s.mesh.removeFromParent()); this.screws = [];
      return;
    }
    if (this.orderId !== o.id) { this.hideTest(); this.rig.sync({}); this.screws.forEach((s) => s.mesh.removeFromParent()); this.screws = []; this.orderId = o.id; animate = false; }
    this.rig.justPlaced = [];
    this.rig.sync(o.build);
    this.rig.group.position.set(0, this.rig.H / 2 + 0.012, 0);
    this.rig.panelTarget = o.build.panel ? 0 : 1;
    if (!animate) this.rig.panelOpen = this.rig.panelTarget;
    // пыль: при первом показе заказа — из сохранения, дальше живёт в модели
    const dust = o.build.dust ?? 0;
    if (!this.dustInit.has(o.id)) { this.rig.setDustAll(dust); this.dustInit.add(o.id); }
    // детали, появившиеся позже (вернули кулер на место), — чистые: их только что почистили
    // Винты ставим ДО анимации прилёта: иначе их координаты брались у детали,
    // ещё висящей в воздухе на старте прилёта, — и винты висели над платой.
    if (animate) for (const slot of this.rig.justPlaced) { if (SCREWED[slot]) this.addScrews(slot); this.flyIn(slot); }
    this.syncLooseGpu();
  }

  private flyIn(slot: SlotKey): void {
    const obj = slot === 'case' ? this.rig.group : this.rig.objectOf(slot);
    if (!obj) return;
    const to = obj.position.clone();
    const lift = slot === 'case' ? V(0, 0.25, 0) : slot === 'psu' ? V(0.25, 0.05, 0) : obj.parent === this.rig.board?.group ? V(0, 0, 0.14) : V(0.2, 0.05, 0);
    const from = to.clone().add(lift);
    obj.position.copy(from);
    this.flights.push({ obj, to, from, t: 0, dur: 0.42 });
  }

  private addScrews(slot: SlotKey): void {
    const n = SCREWED[slot] ?? 0;
    const obj = this.rig.objectOf(slot);
    if (!obj || !n) return;
    obj.updateWorldMatrix(true, true);
    const pts: THREE.Vector3[] = [];
    /*
     * Ось винта — нормаль поверхности, в которую он вкручен (в мировых осях).
     * Раньше винт разворачивался «к камере» и на каждой детали торчал под своим
     * случайным углом.
     */
    const axisOf = (o: THREE.Object3D, local: THREE.Vector3) => local.clone().applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const boardObj = this.rig.board?.group ?? obj;
    let axis = axisOf(boardObj, V(0, 0, 1));
    if (slot === 'mb' && this.rig.board) { for (const [x, y] of this.rig.board.holes) pts.push(this.rig.board.group.localToWorld(V(x, y, 0.002))); }
    if (slot === 'gpu') { const gm = this.rig.gpuModel(); if (gm) { pts.push(gm.group.localToWorld(V(-gm.L / 2 + 0.005, 0.0585, 0.014))); axis = axisOf(gm.group, V(0, 1, 0)); } }
    // винты БП — на верхней грани у задней стенки: сзади их с места сборщика не видно
    if (slot === 'psu') { const dm = obj.userData.dims as number[]; for (const x of [-0.05, 0.05]) pts.push(obj.localToWorld(V(x, dm[1] / 2 + 0.001, dm[2] / 2 - 0.012))); axis = axisOf(obj, V(0, 1, 0)); }
    if (slot === 'cooler') { for (const x of [-0.03, 0.03]) pts.push(obj.localToWorld(V(x, 0.03, 0.012))); }
    for (const p of pts.slice(0, n)) {
      const g = new THREE.Group();
      add(g, cyl(0.0045, 0.0045, 0.002, 16), metal('#c9ccd2', 0.25), 0, 0, 0, Math.PI / 2);
      add(g, box(0.006, 0.0014, 0.0008), own('#33363d'), 0, 0, 0.0012);
      const ring = add(g, new THREE.TorusGeometry(0.014, 0.0022, 8, 24), own('#000', { emissive: '#4fd1c0', emissiveIntensity: 3, transparent: true, opacity: 0.9 }), 0, 0, 0.002);
      ring.userData.ring = true;
      // Кольцо видно сквозь детали: винты кулера, например, прячутся под башней,
      // и игрок не понимал, куда нажимать.
      (ring.material as THREE.Material).depthTest = false; ring.renderOrder = 10;
      // зона нажатия винта крупная (4 см): на телефоне в мелкий винт пальцем не попасть
      const hit = add(g, new THREE.SphereGeometry(0.04, 8, 6), own('#fff', { transparent: true, opacity: 0, depthWrite: false }));
      hit.userData.screwHit = true;
      this.root.add(g);
      g.position.copy(this.root.worldToLocal(p.clone()));
      const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
      g.quaternion.setFromUnitVectors(V(0, 0, 1), axis.clone().applyQuaternion(rootQ));
      this.screws.push({ mesh: g, slot, done: false, spin: 0 });
    }
  }

  get pendingScrews(): number { return this.screws.filter((s) => !s.done).length; }

  private syncLooseGpu(): void {
    const s = this.s;
    const gid = s.loose.find((id) => part(id).cat === 'gpu');
    if (!gid || !this.order) { this.clearLooseGpu(); return; }
    if (!this.gpuLoose || this.gpuLoose.id !== gid) {
      this.clearLooseGpu();
      const m = buildGPU(part(gid) as GPU);
      m.group.rotation.set(-Math.PI / 2, 0, 0.35);
      m.group.position.set(0.04, 0.012, 0.42);
      this.root.add(m.group);
      for (const d of m.dust) setDust(d, this.build?.dust ?? 0);
      this.gpuLoose = { model: m, id: gid, open: 0 };
    }
    this.gpuLoose.model.setPaste(this.build?.gpuOldPaste ? 'old' : 'new');
  }
  private clearLooseGpu(): void { this.gpuLoose?.model.group.removeFromParent(); this.gpuLoose = null; }

  /* ───────────── интерфейс ───────────── */

  show(on: boolean): void {
    this.el.classList.toggle('hidden', !on);
    this.hintEl.classList.toggle('hidden', !on);
    // ушёл с верстака — музыка теста стихает сразу, дальше только фоновая
    if (!on) { clearTimeout(this.musicT); sound.setZoneMusic(null); }
    if (!on) { this.hidePop(); this.hideTest(); this.pickEl.classList.add('hidden'); this.dustEl.classList.add('hidden'); this.sel = null; this.tool = 'none'; this.rig.highlight([], 0); }
    else this.refresh();
  }

  refresh(): void {
    if (this.app.views.zone !== 'bench' || !this.app.state) return;
    const s = this.s, o = this.order;
    this.toolsEl.innerHTML = ''; this.itemsEl.innerHTML = '';
    if (!o) {
      this.el.classList.add('hidden');
      this.hintEl.textContent = t('bench.empty');
      this.renderPicker();
      this.dustEl.classList.add('hidden');
      return;
    }
    this.el.classList.remove('hidden');
    this.pickEl.classList.add('hidden');
    const b = o.build;
    this.flowEl.innerHTML = ''; this.powerEl.innerHTML = '';
    this.hotkeys.clear();
    const step = this.nextStep();
    /** Клавиша с подписью горячей клавиши; `next` — подсветка «это следующий шаг». */
    const acts: { ic: string; label: string; fn: () => void; cls: string; next: boolean }[] = [];
    const key = (code: string, legend: string, ic: string, label: string, fn: () => void, cls = '', next = false): HTMLButtonElement => {
      const el = btn([h('span', { class: 'key' }, legend), icon(ic), label], fn, cls + (next ? ' next' : ''));
      this.hotkeys.set(code, fn);
      acts.push({ ic, label, fn, cls, next });
      return el;
    };
    const toggleTool = (tl: Tool, hintKey: string) => () => { this.tool = this.tool === tl ? 'none' : tl; this.sel = null; if (this.tool === tl) toast(t(hintKey)); this.refresh(); };
    // ── слева: руки ──
    const tools: HTMLElement[] = [];
    if (b.case) {
      tools.push(key('KeyQ', 'Q', 'panel', t('bench.panel'), () => this.act(S.togglePanel(s), () => sound.panel(!this.build?.panel)), b.panel ? '' : 'on', step === 'open' || step === 'panel'));
      tools.push(key('KeyW', 'W', 'remove', t('bench.remove'), toggleTool('remove', 'bench.removeHint'), this.tool === 'remove' ? 'on' : '', ['removeCooler', 'removeOld', 'removeGpu', 'removeBad', 'removeFake'].includes(step)));
    }
    const dustNow = this.dustLevel();
    if (dustNow > 0.04 && (o.kind === 'clean' || o.kind === 'upgrade')) tools.push(key('KeyE', 'E', 'brush', t('bench.brush'), toggleTool('brush', 'bench.hint.dust'), this.tool === 'brush' ? 'on' : '', step === 'dust'));
    // Паста — в лотке рядом с деталями (ниже): игроки искали её среди деталей,
    // а не в инструментах. Клавиша R осталась.
    const pasteAct = b.cpu && !b.cooler && b.oldPaste ? () => this.act(S.wipePaste(s), () => sound.wipe())
      : b.cpu && !b.cooler && !b.paste ? () => this.act(S.applyPaste(s), () => sound.paste()) : null;
    if (pasteAct) this.hotkeys.set('KeyR', pasteAct);
    if (this.gpuLoose) {
      const open = s.gpuOpen;
      tools.push(key('KeyF', 'F', 'bench', open ? t('bench.gpuClose') : t('bench.gpuOpen'), () => { s.gpuOpen = !s.gpuOpen; sound.screw(); this.app.persist(); this.refresh(); }, open ? 'on' : '', step === 'gpuService' && !open));
      if (open && b.gpuOldPaste) tools.push(key('KeyR', 'R', 'paste', t('bench.gpuRepaste'), () => this.act(S.repasteGpu(s), () => { sound.wipe(); setTimeout(() => sound.paste(), 250); }), 'teal', true));
    }
    this.toolsEl.append(...tools);
    // ── снизу: питание (только когда есть что подключать) ──
    if (b.psu && !b.panel) {
      const cab = (k: S.Cable, legend: string, label: string, need: boolean) => {
        if (!need) return;
        this.powerEl.append(key('Digit' + legend, legend, 'cable', label, () => this.act(S.toggleCable(s, k), () => { sound.cable(); this.maybeTidy(); }), 'small ' + (b[k] ? 'on' : ''), step === 'cables' && !b[k]));
      };
      cab('cab24', '7', t('bench.cab24'), !!b.mb);
      cab('cab8', '8', t('bench.cab8'), !!b.cpu);
      cab('cabGpu', '9', t('bench.cabGpu'), !!b.gpu);
      // пятнашки по желанию: пропустил — можно вернуться кнопкой
      if (o.kind === 'build' && b.cab24 && b.cab8 && b.cabGpu && !b.tidy && b.tidyAsked) {
        this.powerEl.append(btn([icon('cable'), t('cab.again', { n: '$' + this.tidyBonus() })], () => this.openTidy(), 'small teal'));
        acts.push({ ic: 'cable', label: t('cab.again', { n: '$' + this.tidyBonus() }), fn: () => this.openTidy(), cls: 'teal', next: false });
      }
    }
    // ── справа: процесс ──
    this.flowEl.append(
      key('KeyT', 'T', 'test', t('bench.test'), () => this.test(), 'dark', step === 'test'),
      key('Enter', '↵', 'check', t('bench.finish'), () => this.finish(), 'primary', step === 'done'),
      key('KeyH', 'H', 'book', t('help.tab'), () => openGuide(), 'ghost small'),
      btn([icon('aside'), t('bench.shelve')], () => { S.shelveBench(s); this.app.persist(); this.sync(false); this.app.refresh(); }, 'ghost small'),
    );
    acts.push({ ic: 'aside', label: t('bench.shelve'), fn: () => { S.shelveBench(s); this.app.persist(); this.sync(false); this.app.refresh(); }, cls: 'ghost', next: false });
    // ── лоток деталей ──
    const items: HTMLElement[] = [];
    for (const id of s.loose) items.push(this.trayItem(id, { looseId: id }, true));
    const shown = s.inv.filter((it) => {
      const cat = part(it.id).cat;
      if (!b.case) return cat === 'case';
      // память: пока есть свободные слоты, такие же планки остаются в лотке
      if (cat === 'ram' && b.ram) return it.id === b.ram && (b.ramN ?? 1) < ((b.mb ? (part(b.mb) as { slots: number }).slots : 4));
      return cat !== 'case' && !b[SLOT_OF[cat] as keyof Build];
    });
    // сначала то, что можно поставить прямо сейчас
    shown.sort((a, z) => Number(canInstall(b, z.id).ok) - Number(canInstall(b, a.id).ok));
    if (pasteAct) {
      const wipe = !!b.oldPaste;
      const el = h('button', { class: `titem live ${step === 'paste' || step === 'wipe' ? 'next' : ''}` },
        h('img', { src: thumb('mx6'), alt: '' }),
        h('div', { class: 'nm' }, wipe ? t('bench.wipe') : `${t('bench.paste')} ×${s.pasteUses}`),
        h('span', { class: 'tag' }, 'R'));
      el.addEventListener('click', (e) => { e.stopPropagation(); pasteAct(); });
      items.push(el);
    }
    for (const it of shown) items.push(this.trayItem(it.id, { uid: it.uid }, false, it.used));
    // «Нет деталей» — только когда следующий шаг и правда ждёт деталь. Раньше
    // фраза висела и при полностью собранном ПК и сбивала с толку.
    const want = this.nextStep();
    if (!items.length && ['case', 'mb', 'cpu', 'cooler', 'ram', 'ssd', 'gpu', 'psu'].includes(want)) items.push(h('div', { class: 'chip' }, t('bench.noParts')));
    this.itemsEl.append(...items);
    this.renderPhoneBar(acts);
    this.updateHint();
  }

  /**
   * Телефон: действия верстака — плитками «значок + подпись» (панель, снять,
   * кисть, кабели, тест, готово), следующий шаг подсвечен. Раньше была одна
   * кнопка и «Ещё», и всё нужное приходилось искать в списке. В «⋯» остались
   * только справка и «Отложить».
   */
  private renderPhoneBar(acts: { ic: string; label: string; fn: () => void; cls: string; next: boolean }[]): void {
    this.phoneBar.innerHTML = '';
    const extra = (a: { ic: string }) => a.ic === 'book' || a.ic === 'aside';
    // на плитке кабеля значок уже говорит «питание» — подпись короче
    const short: Record<string, string> = { [t('bench.cab24')]: t('bench.cab24s'), [t('bench.cab8')]: t('bench.cab8s') };
    for (const a of acts.filter((x) => !extra(x))) {
      const cls = ['tile', a.cls.includes('on') ? 'on' : '', a.cls.includes('primary') ? 'primary' : '', a.next ? 'next' : ''].join(' ');
      this.phoneBar.append(btn([icon(a.ic), h('span', { class: 'tl' }, short[a.label] ?? a.label)], a.fn, cls));
    }
    const rest = acts.filter(extra);
    const more = btn([h('span', { class: 'dots' }, '⋯')], () => {
      let close = () => {};
      const list = h('div', { class: 'sheet' }, ...rest.map((a) => btn([icon(a.ic), a.label], () => { close(); a.fn(); }, 'ghost')));
      close = modal(t('bench.more'), [list], [{ label: t('site.close'), cls: 'ghost' }], { dismissable: true });
    }, 'tile more', { 'aria-label': t('bench.more') });
    this.phoneBar.append(more);
  }

  private trayItem(id: string, ref: { uid?: number; looseId?: string }, loose: boolean, used = false): HTMLElement {
    const p = part(id);
    const it = ref.uid !== undefined ? this.s.inv.find((x) => x.uid === ref.uid) : undefined;
    const foreign = (it?.owner !== undefined && it.owner !== this.order?.id) || !!it?.broken;
    const v = foreign ? { ok: false } : this.build ? canInstall(this.build, id) : { ok: false };
    const sel = this.sel && ((ref.uid !== undefined && this.sel.uid === ref.uid) || (ref.looseId && this.sel.looseId === ref.looseId));
    // Подсказка «ставь это следующим» — только в обучении: дальше игрок думает сам.
    const isNext = v.ok && this.s.tutorial < 99 && this.nextStep() === p.cat;
    const el = h('button', { class: `titem live ${sel ? 'sel' : ''} ${v.ok ? '' : 'bad'} ${isNext ? 'next' : ''}` },
      h('img', { src: thumb(id), alt: '' }),
      h('div', { class: 'nm' }, `${p.brand} ${p.name}`),
      // объём памяти — отдельной меткой: в названии «16GB» уезжало за край карточки
      p.cat === 'ram' ? h('span', { class: 'tag teal' }, (p as { gb: number }).gb + (lang() === 'ru' ? ' ГБ' : ' GB')) : null,
      p.cat === 'cpu' ? null : h('span', { class: 'tag' }, colorName(p, lang() === 'ru')),
      it?.owner !== undefined ? h('span', { class: 'tag teal' }, t('own.tag', { name: this.ownerName(it.owner) })) : loose || used ? h('span', { class: 'tag' }, t('site.used')) : null,
      it?.fakeKnown ? h('span', { class: 'tag bad' }, t('site.fake')) : null,
      it?.broken ? h('span', { class: 'tag bad' }, t('site.broken')) : null);
    el.addEventListener('click', (e) => { e.stopPropagation(); sound.pickup(); this.select(ref, id); });
    return el;
  }

  private select(ref: { uid?: number; looseId?: string }, id: string): void {
    const b = this.build; if (!b) return;
    this.tool = 'none';
    const same = this.sel && ((ref.uid !== undefined && this.sel.uid === ref.uid) || (ref.looseId && this.sel.looseId === ref.looseId));
    if (same) { this.install(); return; }
    const cat = part(id).cat;
    const it = ref.uid !== undefined ? this.s.inv.find((x) => x.uid === ref.uid) : undefined;
    if (it?.owner !== undefined && it.owner !== this.order?.id) { toast(t('why.notYours'), 'bad'); return; }
    if (it?.broken) { toast(t('why.broken'), 'bad'); return; }
    if (b.panel && cat !== 'case') { toast(t('why.panelClosed'), 'bad'); return; }
    const v = canInstall(b, id);
    if (!v.ok) { toast(t(v.why!, v.vars), 'bad'); return; }
    this.sel = ref;
    if (cat === 'case') { this.install(); return; }
    const z = this.rig.zones[SLOT_OF[cat]];
    if (z) this.app.views.setFocus(z.getWorldPosition(V()), cat === 'gpu' || cat === 'psu' ? 0.72 : cat === 'ram' ? 0.42 : 0.55); // подъезд мягкий, не вплотную
    this.refresh();
  }

  private install(ramSlot?: number): void {
    if (!this.sel) return;
    const err = S.install(this.s, this.sel, ramSlot);
    this.sel = null;
    if (err) { toast(t(err), 'bad'); this.refresh(); return; }
    sound.snap();
    this.app.persist();
    this.sync(true);
    this.app.views.setFocus(null);
    this.focusScrews();
    this.app.refresh();
    this.app.tutorialCheck();
  }

  /** Есть незакрученные винты — камера мягко подъезжает к ним; закрутил все — отъезжает. */
  private focusScrews(): void {
    const left = this.screws.filter((s) => !s.done);
    if (!left.length) { this.app.views.setFocus(null); return; }
    const c = V();
    for (const s of left) c.add(s.mesh.getWorldPosition(V()));
    this.app.views.setFocus(c.multiplyScalar(1 / left.length), 0.55);
  }

  /**
   * Ближайший к пальцу объект по ЭКРАНУ (в пределах maxPx): на телефоне в
   * винт или слот точно не попасть, поэтому засчитываем касание рядом.
   */
  private nearestOnScreen(objs: THREE.Object3D[], x: number, y: number, maxPx = 32): THREE.Object3D | null {
    const r = this.app.engine.renderer.domElement.getBoundingClientRect();
    let best: THREE.Object3D | null = null, bd = maxPx;
    for (const o of objs) {
      const p = o.getWorldPosition(V()).project(this.app.engine.camera);
      if (p.z > 1) continue;
      const d = Math.hypot(r.left + ((p.x + 1) / 2) * r.width - x, r.top + ((1 - p.y) / 2) * r.height - y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  private act(err: string | null, ok?: () => void): void {
    if (err) { toast(t(err), 'bad'); return; }
    ok?.();
    this.app.persist();
    this.sync(true);
    this.app.refresh();
    this.app.tutorialCheck();
  }

  /**
   * Подключён последний из трёх кабелей новой сборки — предлагаем уложить их
   * правильно (пятнашки). Один раз на подключение: отказался — до следующего
   * переподключения не пристаём.
   */
  private maybeTidy(): void {
    const o = this.order; if (!o || o.kind !== 'build') return;
    const b = o.build;
    if (!b.cab24 || !b.cab8 || !b.cabGpu || b.tidyAsked) return;
    b.tidyAsked = true;
    setTimeout(() => this.openTidy(), 350);
  }
  /** Сколько примерно добавят аккуратные кабели к чаевым (показываем заранее). */
  private tidyBonus(): number { const o = this.order; return o ? Math.max(5, Math.round((o.pay * 0.08 * 0.4) / 5) * 5) : 0; }
  private openTidy(): void {
    const o = this.order; if (!o) return;
    openCablePuzzle(o.id * 7919 + this.s.day, (tidy) => {
      S.setTidy(this.s, tidy);
      if (tidy) toast(t('cab.bonus'), 'good');
      this.app.persist(); this.refresh();
    }, this.tidyBonus());
  }

  private renderPicker(): void {
    const s = this.s;
    const list = s.orders.filter((o) => o.state === 'active');
    this.pickEl.innerHTML = '';
    const body = h('div', { class: 'pb' });
    if (!list.length) body.append(h('p', {}, t('site.noOrders')));
    for (const o of list) {
      body.append(h('div', { class: 'row', style: 'grid-template-columns:1fr auto' },
        h('div', {}, h('div', { class: 'nm' }, `${t('ord.' + o.kind)} · ${this.app.custName(o)}`), h('div', { class: 'sp' }, `${t('preset.' + o.req.preset)} · ${money(o.pay + o.haggle)}`)),
        btn(t('ord.toBench'), () => { const e = S.startBench(s, o.id); if (e) { toast(t(e), 'bad'); return; } sound.pickup(); this.app.persist(); this.sync(false); this.app.refresh(); this.app.tutorialCheck(); }, 'primary small')));
    }
    this.pickEl.append(h('div', { class: 'ph' }, h('h3', {}, t('bench.pick'))), body);
    this.pickEl.classList.remove('hidden');
  }

  /** Пятна, которые ещё видно (их и надо дочистить). */
  private dustSpots(): Dust[] {
    return [...this.rig.allDust(), ...(this.gpuLoose?.model.dust ?? [])].filter((d) => d.visible && d.userData.amount > 0.05);
  }

  dustLevel(): number {
    const all: Dust[] = [...this.rig.allDust(), ...(this.gpuLoose?.model.dust ?? [])];
    return all.length ? all.reduce((s, d) => s + d.userData.amount, 0) / all.length : 0;
  }

  /** Следующий шаг для подсказки — в порядке, в котором собирают настоящий ПК. */
  nextStep(): string {
    const o = this.order; if (!o) return '';
    const b = o.build;
    if (!b.case) return 'case';
    if (this.pendingScrews) return 'screws';
    if (o.kind === 'clean') {
      if (b.panel && (this.dustLevel() > 0.12 || b.oldPaste)) return 'open';
      if (this.dustLevel() > 0.12) return 'dust';
      if (b.oldPaste) return b.cooler ? 'removeCooler' : 'wipe';
      if (!b.paste) return 'paste';
      if (!b.cooler) return 'cooler';
      if (o.orig?.gpuOldPaste && b.gpuOldPaste) return b.gpu ? 'removeGpu' : 'gpuService';
      if (!b.gpu && this.s.loose.length) return 'gpu';
    } else if (o.kind === 'upgrade' && o.req.upCat) {
      const k = o.req.upCat as 'gpu' | 'ram' | 'ssd';
      if (b.panel && b[k] === o.orig?.[k]) return 'open';
      if (b[k] && b[k] === o.orig?.[k]) return 'removeOld';
      if (!b[k]) return k;
      if (k === 'gpu' && !b.cabGpu) return 'cables';
    } else {
      for (const k of ['psu', 'mb', 'cpu'] as const) if (!b[k]) return k;
      if (!b.paste) return b.cooler ? 'removeCooler' : b.oldPaste ? 'wipe' : 'paste';
      for (const k of ['cooler', 'ram', 'ssd', 'gpu'] as const) if (!b[k]) return k;
      if (!b.cab24 || !b.cab8 || !b.cabGpu) return 'cables';
    }
    // Сначала тест при открытой панели (как делают сборщики — и видно, как ПК
    // оживает), потом закрыть панель и сдавать.
    // тест разоблачил брак или подделку — сначала убрать их
    if (b.badSeen && b.bad?.length) return 'removeBad';
    if (b.fakeKnown && b.gpu) return 'removeFake';
    const tr = this.tested[o.id];
    if (!tr || (tr.stage !== 'ok' && tr.stage !== 'throttle')) return 'test';
    if (!b.panel) return 'panel';
    return 'done';
  }

  private updateHint(): void {
    const step = this.nextStep();
    // Детали для шага нет на складе — говорим прямо, ЧТО купить. Игрок застревал
    // на «Следующий шаг: кулер», не понимая, что кулера у него просто нет.
    const isPart = ['case', 'mb', 'cpu', 'cooler', 'ram', 'ssd', 'gpu', 'psu'].includes(step);
    const missing = (isPart && !this.s.inv.some((it) => part(it.id).cat === step) && !this.s.loose.some((id) => part(id).cat === step)) || (step === 'paste' && this.s.pasteUses <= 0);
    const txt = !step ? '' : missing ? t('bench.hint.buy', { s: t('step.' + step) }) : t('bench.hint.next', { s: t('step.' + step) });
    const selRam = this.sel && part(this.sel.looseId ?? this.s.inv.find((i) => i.uid === this.sel!.uid)?.id ?? 'mx6').cat === 'ram';
    this.hintEl.textContent = selRam ? t('bench.hint.ramSlot') : this.sel ? t('bench.hint.click') : this.tool === 'brush' ? t('bench.hint.dust') : this.tool === 'remove' ? t('bench.removeHint') : txt;
    const d = this.dustLevel();
    const spots = this.dustSpots().length;
    this.dustEl.classList.toggle('hidden', d < 0.02 || !spots);
    this.dustEl.textContent = t('bench.dustLeft', { n: Math.round(d * 100) }) + (spots ? ' · ' + t('bench.dustSpots', { n: spots }) : '');
  }

  /* ───────────── тест и завершение ───────────── */

  private test(): void {
    const o = this.order; if (!o) return;
    if (this.pendingScrews) { toast(t('bench.screws'), 'bad'); return; }
    const r = runTest(o.build);
    this.tested[o.id] = r;
    // брак и подделка становятся «известны»: снятая деталь уйдёт в утиль / подписана как подделка
    const doaLine = r.lines.find((k) => k.startsWith('test.doa.'));
    if (doaLine) o.build.badSeen = true;
    if (o.build.fakeGpu && (r.stage === 'ok' || r.stage === 'throttle')) o.build.fakeKnown = true;
    this.app.persist();
    sound.boot();
    const powered = r.stage !== 'nopower';
    if (r.stage === 'burn') {
      // перегруженный БП: секунду крутится, потом хлопок, дым — и блока больше нет
      setTimeout(() => {
        const psu = this.rig.objectOf('psu');
        const at = psu ? psu.getWorldPosition(new THREE.Vector3()) : this.root.getWorldPosition(new THREE.Vector3());
        this.root.worldToLocal(at);
        for (let i = 0; i < 9; i++) {
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.03 + Math.random() * 0.03, 10, 8), new THREE.MeshStandardMaterial({ color: '#4a4b4f', transparent: true, opacity: 0.7, depthWrite: false, roughness: 1 }));
          m.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.08, 0.04, (Math.random() - 0.5) * 0.08));
          this.root.add(m);
          this.smoke.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 0.05, 0.12 + Math.random() * 0.1, (Math.random() - 0.5) * 0.05), t: -i * 0.08 });
        }
        sound.burn();
        this.running = 0; sound.fan(false);
        S.burnPsu(this.s);
        this.app.persist(); this.sync(false); this.app.refresh();
      }, 1100);
    }
    // ПК «работает» 9 секунд: столько длится показ подсветки и вентиляторов
    if (powered) { sound.fan(true); this.running = 9; }
    /*
     * Музыка первого включения: если сборка тянет заказ хотя бы на 3 звезды —
     * драйв, иначе (1–2 звезды, не завелась, сгорел БП) — уныло. Звучит, пока
     * идёт показ, потом возвращается обычный плейлист.
     */
    const okRun = r.stage === 'ok' || r.stage === 'throttle';
    const stars = okRun ? evaluate(o, { ...o.build, panel: true }, 1).stars : 1;
    sound.setZoneMusic(stars >= 3 ? 'test_drive' : 'test_gloom');
    clearTimeout(this.musicT);
    this.musicT = setTimeout(() => sound.setZoneMusic(null), 22000);
    const lines = r.lines.map((k) => h('div', { class: k === 'test.post' || k === 'test.boot' || k === 'test.bench' ? 'good' : 'bad' }, '> ' + t(k)));
    const meter = (label: string, v: number, max: number, suffix: string) => h('div', { class: 'meter' }, h('span', {}, label), h('div', { class: 'bar' }, h('i', { style: `width:${Math.min(100, (v / max) * 100)}%` })), h('b', {}, `${v}${suffix}`));
    const body = h('div', { class: 'post' }, h('div', {}, `BIOS v2.6 · ${o.build.mb ? part(o.build.mb).name : '—'}`), ...lines);
    // объяснение по-человечески: что сломано и что с этим делать
    if (doaLine) body.append(h('p', { class: 'warn' }, t('test.doaHint')));
    if (o.build.fakeKnown && o.build.gpu) body.append(h('p', { class: 'warn' }, t('test.fakeHint', { name: part(o.build.gpu).name })));
    if (r.stage === 'ok' || r.stage === 'throttle') {
      body.append(meter(t('test.score'), r.score, 120, ''), meter(t('test.work'), r.work, 120, ''), meter(t('test.cpuT'), r.temps.cpu, 105, '°C'), meter(t('test.gpuT'), r.temps.gpu, 100, '°C'), meter(t('test.draw'), r.draw, Math.max(r.draw, (this.build?.psu ? (part(this.build.psu) as { watt: number }).watt : r.draw)), 'W'));
      setTimeout(() => sound.success(), 1300);
    } else setTimeout(() => sound.error(), 700);
    this.testEl.innerHTML = '';
    this.testEl.append(h('div', { class: 'th' }, h('b', {}, t('test.title')), btn('✕', () => this.hideTest(), 'small ghost', { 'aria-label': t('test.close') })), body);
    this.testEl.classList.add('hidden');
    // сначала зритель смотрит, как ПК оживает, потом выезжает отчёт
    const oid = o.id;
    setTimeout(() => { if (this.order?.id === oid && this.app.views.zone === 'bench') this.testEl.classList.remove('hidden'); }, powered ? 1400 : 400);
    this.refresh();
    this.app.tutorialCheck();
  }

  private finish(): void {
    const o = this.order; if (!o) return;
    if (this.pendingScrews) { toast(t('bench.screws'), 'bad'); return; }
    const go = () => {
      const err = S.finishBench(this.s);
      if (err) { toast(t(err), 'bad'); return; }
      sound.success();
      toast(t('ord.ready') + ' · ' + this.app.custName(o), 'good');
      this.app.persist();
      this.sync(false);
      this.app.refresh();
      this.app.tutorialCheck();
    };
    const tr = this.tested[o.id];
    if (!tr || (tr.stage !== 'ok' && tr.stage !== 'throttle')) confirmBox(t('bench.confirmFinish'), t('bench.finish'), go);
    else go();
  }

  /* ───────────── ввод ───────────── */

  private rayAt(x: number, y: number): void {
    const el = this.app.engine.renderer.domElement;
    const r = el.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.app.engine.camera);
  }

  pointerDown(e: PointerEvent): void {
    // С кистью в руке камеру тоже можно крутить: тянуть надо мимо компьютера.
    const brushing = this.tool === 'brush' && this.overPc(e.clientX, e.clientY);
    this.drag = { x: e.clientX, y: e.clientY, moved: false, button: e.button, brushing };
    if (brushing) this.brushAt(e.clientX, e.clientY);
  }
  pointerMove(e: PointerEvent): void {
    if (!this.drag) return;
    const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
    // 10 px: на телефоне палец «дрожит», и при 6 px нажатие часто превращалось в поворот камеры
    if (Math.abs(dx) + Math.abs(dy) > 10) this.drag.moved = true;
    if (this.drag.brushing) { this.brushAt(e.clientX, e.clientY); return; }
    if (this.drag.moved) {
      const v = this.app.views;
      v.orbitYaw = Math.max(-1.0, Math.min(1.0, v.orbitYaw - dx * 0.006));
      v.orbitPitch = Math.max(-0.35, Math.min(0.75, v.orbitPitch + dy * 0.005));
      this.drag.x = e.clientX; this.drag.y = e.clientY;
    }
  }
  pointerUp(e: PointerEvent): void {
    const d = this.drag; this.drag = null;
    if (!d || d.moved || this.tool === 'brush') return;
    this.tap(e.clientX, e.clientY);
  }
  wheel(dy: number): void { const v = this.app.views; v.zoom = Math.max(0, Math.min(1, v.zoom - dy * 0.0015)); }

  private tap(x: number, y: number): void {
    if (!this.order) return;
    this.rayAt(x, y);
    // винты — в первую очередь
    const hits = this.ray.intersectObjects(this.screws.filter((s) => !s.done).map((s) => s.mesh), true);
    const sh = hits.find((hh) => hh.object.userData.screwHit);
    const near = sh ? sh.object.parent : this.nearestOnScreen(this.screws.filter((s) => !s.done).map((s) => s.mesh), x, y);
    if (near) {
      const sc = this.screws.find((s) => s.mesh === near);
      if (sc) { sc.done = true; sc.spin = 0.001; sound.screw(); this.focusScrews(); this.refresh(); this.app.tutorialCheck(); }
      return;
    }
    if (this.sel) {
      const cat = part(this.sel.looseId ?? this.s.inv.find((i) => i.uid === this.sel!.uid)?.id ?? 'mx6').cat;
      // память — в тот свободный слот, по которому нажали
      if (cat === 'ram') {
        let rs = this.rig.ramSlotHit(this.ray);
        if (rs === null) { const z = this.nearestOnScreen(this.rig.ramZones.filter((m) => m.userData.free), x, y, 30); if (z) rs = z.userData.ramSlot as number; }
        if (rs !== null) { this.install(rs); return; }
      }
      const z = this.rig.zones[SLOT_OF[cat as Cat]];
      if (z && cat !== 'ram' && this.ray.intersectObject(z, false).length) { this.install(); return; }
      this.sel = null; this.app.views.setFocus(null); this.refresh();
      return;
    }
    if (this.tool === 'remove') {
      // Первое попадание по ДЕТАЛИ: кабели и стенки корпуса пропускаем — иначе
      // жгут 24-pin, лежащий поверх видеокарты, перехватывал нажатие.
      let slot: SlotKey | undefined;
      for (const hh of this.ray.intersectObject(this.rig.group, true)) {
        if (!hh.object.visible || hh.object.userData.zone) continue;
        let o: THREE.Object3D | null = hh.object;
        while (o && !o.userData.slot) o = o.parent;
        if (o) { slot = o.userData.slot as SlotKey; break; }
      }
      if (slot && slot !== 'case') this.removeSlot(slot);
      return;
    }
    /*
     * Без инструмента нажатие по установленной детали открывает кнопку «Снять …»
     * прямо у пальца. Раньше снять можно было только через инструмент «Снять»
     * (W), и игроки не находили, как вернуть кулер обратно.
     */
    const ps = this.slotAt();
    if (ps && ps !== 'case' && ps !== 'paste' && this.order.build[ps]) {
      const p = part(this.order.build[ps] as string);
      this.popEl.innerHTML = '';
      this.popEl.append(h('div', { class: 'nm' }, p.brand + ' ' + p.name),
        btn([icon('remove'), t('bench.removePart')], () => { this.hidePop(); this.removeSlot(ps); }, 'small'),
        btn('✕', () => this.hidePop(), 'small ghost', { 'aria-label': t('site.close') }));
      const W = this.app.uiRoot.clientWidth, H = this.app.uiRoot.clientHeight;
      this.popEl.style.left = Math.max(10, Math.min(W - 270, x - 120)) + 'px';
      this.popEl.style.top = Math.max(60, Math.min(H - 150, y + 14)) + 'px';
      this.popEl.classList.remove('hidden');
      sound.click();
      return;
    }
    this.hidePop();
    // нажали по корпусу — подсказка, что делать
    const zh = this.ray.intersectObjects(this.rig.pickables(), false)[0];
    if (zh?.object.userData.zone === 'panel' && this.order.build.panel) { this.act(S.togglePanel(this.s), () => sound.panel(true)); }
  }

  /** Слот детали под последним лучом (кабели и стенки корпуса пропускаем). */
  private slotAt(): SlotKey | undefined {
    for (const hh of this.ray.intersectObject(this.rig.group, true)) {
      if (!hh.object.visible || hh.object.userData.zone) continue;
      let o: THREE.Object3D | null = hh.object;
      while (o && !o.userData.slot) o = o.parent;
      if (o) return o.userData.slot as SlotKey;
    }
    return undefined;
  }
  private removeSlot(slot: SlotKey): void {
    const b0 = this.build;
    const trash = !!(b0?.bad?.includes(slot) && b0.badSeen && this.s.src[slot]);
    const err = S.remove(this.s, slot);
    if (!err && trash) toast(t('bench.trash'), 'bad');
    if (err) { toast(t(err), 'bad'); return; }
    sound.pickup();
    this.screws.filter((s) => s.slot === slot).forEach((s) => s.mesh.removeFromParent());
    this.screws = this.screws.filter((s) => s.slot !== slot);
    this.app.persist(); this.sync(true); this.app.refresh();
    this.app.tutorialCheck();
  }

  /** Попадает ли точка экрана в сам компьютер (корпус, детали, снятую видеокарту). */
  private overPc(x: number, y: number): boolean {
    this.rayAt(x, y);
    const targets: THREE.Object3D[] = [this.rig.group];
    if (this.gpuLoose) targets.push(this.gpuLoose.model.group);
    return this.ray.intersectObjects(targets, true).some((h) => h.object.visible && !h.object.userData.zone);
  }

  private brushAt(x: number, y: number): void {
    this.rayAt(x, y);
    const all = [...this.rig.allDust(), ...(this.gpuLoose?.model.dust ?? [])].filter((d) => d.visible);
    const hit = this.ray.intersectObjects(all, false)[0];
    if (!hit) return;
    const d = hit.object as Dust;
    setDust(d, d.userData.amount - 0.09);
    const now = performance.now();
    if (now - this.lastBrush > 110) { sound.brush(); this.lastBrush = now; }
    const avg = this.dustLevel();
    S.setDust(this.s, avg);
    /*
     * Чистка засчитана — остатки убираем совсем: раньше засчитывалось по среднему,
     * а отдельные пятна оставались, и было непонятно, где ещё «до 100%».
     */
    if (avg < 0.12 && this.build && this.build.dust !== 0) {
      this.build.dust = 0;
      for (const dd of [...this.rig.allDust(), ...(this.gpuLoose?.model.dust ?? [])]) setDust(dd, 0);
      S.setDust(this.s, 0);
      sound.success(); toast(t('bench.dustDone'), 'good');
      this.tool = 'none'; this.refresh(); this.app.persist();
    }
    this.updateHint();
    if (now % 7 < 1) this.app.persist();
  }

  /* ───────────── кадр ───────────── */

  update(t: number, dt: number): void {
    const running = this.running > 0;
    if (running) { this.running -= dt; if (this.running <= 0) sound.fan(false); }
    this.rig.update(dt, t, running);
    // пыльные места мягко пульсируют тёплым, пока чистка не засчитана — видно, что осталось
    const dustWork = this.order && this.build && (this.build.dust ?? 0) !== 0 && this.dustLevel() >= 0.12;
    const pulse = dustWork ? 0.16 + 0.12 * Math.sin(t * 4.2) : 0; // < 0.3: не попадает в «свечение» сборки
    for (const d of [...this.rig.allDust(), ...(this.gpuLoose?.model.dust ?? [])]) {
      const m = d.material as THREE.MeshStandardMaterial;
      if (!d.visible) continue;
      if (pulse) { m.emissive.set('#ffa040'); m.emissiveIntensity = pulse * Math.min(1, d.userData.amount * 2); } else if (m.emissiveIntensity) m.emissiveIntensity = 0;
    }
    for (const f of this.flights) {
      f.t += dt / f.dur;
      const k = Math.min(1, f.t), e = 1 - Math.pow(1 - k, 3);
      f.obj.position.lerpVectors(f.from, f.to, e);
    }
    this.flights = this.flights.filter((f) => f.t < 1);
    for (const p of this.smoke) {
      p.t += dt; if (p.t < 0) continue;
      p.m.position.addScaledVector(p.v, dt); p.m.scale.multiplyScalar(1 + dt * 0.9);
      (p.m.material as THREE.MeshStandardMaterial).opacity = Math.max(0, 0.7 - p.t * 0.3);
      if (p.t > 2.4) { p.m.removeFromParent(); p.m.geometry.dispose(); (p.m.material as THREE.Material).dispose(); }
    }
    this.smoke = this.smoke.filter((p) => p.t <= 2.4);
    for (const s of this.screws) {
      const ring = s.mesh.children.find((c) => c.userData.ring) as THREE.Mesh | undefined;
      if (!s.done) { if (ring) ring.scale.setScalar(1 + Math.sin(t * 6) * 0.15); }
      else if (s.spin < 1) {
        s.spin += dt * 2.2;
        s.mesh.children[0].rotation.y += dt * 20; s.mesh.children[1].rotation.z += dt * 20;
        if (ring) ring.visible = false;
        if (s.spin >= 1) { s.mesh.position.add(V(0, 0, 0)); }
      }
    }
    // подсветка выбранного места
    if (this.sel && this.build) {
      const id = this.sel.looseId ?? this.s.inv.find((i) => i.uid === this.sel!.uid)?.id;
      if (id) this.rig.highlight([SLOT_OF[part(id).cat]], t);
    } else this.rig.highlight([], t);
    // разобранная видеокарта
    if (this.gpuLoose) {
      const target = this.s.gpuOpen ? 1 : 0;
      this.gpuLoose.open += (target - this.gpuLoose.open) * Math.min(1, dt * 4);
      this.gpuLoose.model.explode(this.gpuLoose.open);
    }
  }

  hasProject(): boolean { return !!this.order; }

  /** Имя клиента, чья это деталь. */
  ownerName(id: number): string {
    const o = this.s.orders.find((x) => x.id === id);
    return o ? this.app.custName(o) : '?';
  }

  /** Горячая клавиша верстака (по коду клавиши — не зависит от раскладки). */
  hotkey(code: string): boolean {
    const fn = this.hotkeys.get(code);
    if (!fn) return false;
    sound.click();
    fn();
    return true;
  }
}
