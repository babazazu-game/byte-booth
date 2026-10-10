import * as THREE from 'three';
import { ramSlotsOf } from '../../logic/compat.ts';
import { part, type Case, type MB, type CPU, type GPU, type RAM, type SSD, type PSU, type Cooler } from '../../logic/parts.ts';
import type { Build, SlotKey } from '../../logic/compat.ts';
import { add, std, phys, metal, own, rbox, box, cyl, extrude, rrPath, canvasTex, decal, tube, fitText, inkFor, shade, mergeTree, V, TAU } from '../kit.ts';
import { buildFan, hubTex, type Fan } from './fan.ts';
import { RAM_PITCH, buildBoard, buildCPU, buildPaste, buildRAM, buildSSD, buildPSU, buildCooler, type BoardModel, type CoolerModel } from './board.ts';
import { buildGPU, type GpuModel } from './gpu.ts';
import { makeDust, setDust, type Dust } from './dust.ts';

/**
 * Собранный (или собираемый) ПК — корпус и всё, что в нём стоит.
 *
 * Оси корпуса: стекло смотрит в +X, перед — в −Z, тыл — в +Z. Плата лежит
 * на левой стенке (−X). Видеокарта висит в слоте вентиляторами вниз,
 * планкой к тылу. Эти соглашения проверены в пробнике стиля.
 *
 * `sync(build)` приводит модель к описанию сборки: ставит недостающее,
 * убирает лишнее. Верстак зовёт его после каждого действия игрока и не
 * думает, какие именно меши надо создать.
 */

let ioTex: THREE.Texture | null = null;
/** Заглушка разъёмов платы: USB, сеть, звук, видеовыходы. */
function memoIo(): THREE.Texture {
  return (ioTex ??= canvasTex(96, 330, (g, w, h) => {
    g.fillStyle = '#a7adb5'; g.fillRect(0, 0, w, h);
    const port = (x: number, y: number, pw: number, ph: number, c: string) => { g.fillStyle = '#15171b'; g.fillRect(x - 2, y - 2, pw + 4, ph + 4); g.fillStyle = c; g.fillRect(x, y, pw, ph); };
    let y = 14;
    for (let i = 0; i < 2; i++) { port(14, y, 30, 12, '#1d1f24'); port(52, y, 30, 12, '#1d1f24'); y += 24; }
    for (let i = 0; i < 2; i++) { port(14, y, 30, 12, '#2f6fd6'); port(52, y, 30, 12, '#2f6fd6'); y += 24; }
    port(26, y + 4, 44, 36, '#1d1f24'); y += 56;
    port(20, y, 56, 22, '#1d1f24'); y += 36;
    port(28, y, 40, 16, '#1d1f24'); y += 30;
    for (const [i, c] of ['#56b3e8', '#7ed957', '#ff8fb1'].entries()) { g.fillStyle = '#15171b'; g.beginPath(); g.arc(30 + i * 18, y + 20, 8, 0, TAU); g.fill(); g.fillStyle = c; g.beginPath(); g.arc(30 + i * 18, y + 20, 5, 0, TAU); g.fill(); }
  }));
}
let grillTex: THREE.Texture | null = null;
function memoGrill(): THREE.Texture {
  return (grillTex ??= canvasTex(256, 256, (g, w) => {
    g.clearRect(0, 0, w, w); g.strokeStyle = '#121418'; g.lineWidth = 5;
    for (let r = 24; r < 124; r += 16) { g.beginPath(); g.arc(128, 128, r, 0, TAU); g.stroke(); }
    for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2 + Math.PI / 4; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * 126, 128 + Math.sin(a) * 126); g.stroke(); }
  }));
}

export const CASE_DIMS: Record<Case['size'], [number, number, number]> = {
  mid: [0.22, 0.47, 0.44],
  mini: [0.19, 0.31, 0.38],
  full: [0.285, 0.47, 0.465],
};

type Content = { id: string; obj: THREE.Object3D; gpu?: GpuModel; cooler?: CoolerModel };

export class PcRig {
  readonly group = new THREE.Group();
  /** Всё, кроме съёмной боковой панели. */
  readonly body = new THREE.Group();
  readonly panel = new THREE.Group();
  caseId = '';
  W = 0.22; H = 0.47; D = 0.44;
  board: BoardModel | null = null;
  private boardId = '';
  private content: Partial<Record<SlotKey, Content>> = {};
  private paste = buildPaste();
  private cables: Partial<Record<'cab24' | 'cab8' | 'cabGpu', THREE.Object3D>> = {};
  private cableKey: Record<string, string> = {};
  readonly fans: Fan[] = [];
  readonly caseDust: Dust[] = [];
  /** Невидимые коробки для попадания по пустым слотам. */
  readonly zones: Partial<Record<SlotKey | 'cab24' | 'cab8' | 'cabGpu' | 'panel', THREE.Mesh>> = {};
  private zoneMat = own('#4fd1c0', { transparent: true, opacity: 0.0, emissive: '#4fd1c0', emissiveIntensity: 1.5, depthWrite: false });
  panelOpen = 0;
  panelTarget = 0;
  /** Плавное «включение» 0..1: раскрутка вентиляторов, разгорание подсветки. */
  private power = 0;
  /** Светящиеся материалы сборки и их полная яркость; собираются после каждой перестановки. */
  private glow: { m: THREE.MeshStandardMaterial; base: number }[] = [];
  private glowDirty = true;
  private powerLed = own('#0b0d10', { emissive: '#7fd6ff', emissiveIntensity: 0, roughness: 0.3 });

  constructor() {
    this.group.add(this.body, this.panel);
    /*
     * Прогрев шейдера подсветки зон. Зоны скрыты, пока игрок не взял деталь,
     * а скрытое движок не компилирует — и при первом выборе детали кадр
     * подвисал на 30–40 мс (на встроенной графике дольше): «просадка, когда
     * камера подъезжает». Крошечный невидимый кубик с тем же материалом стоит
     * всегда, и шейдер собирается при первой же отрисовке верстака.
     */
    const warm = new THREE.Mesh(box(0.002, 0.002, 0.002), this.zoneMat.clone());
    (warm.material as THREE.MeshStandardMaterial).opacity = 0.001;
    warm.frustumCulled = false; warm.castShadow = false;
    this.group.add(warm);
  }

  /* ───────────── корпус ───────────── */

  private buildCase(c: Case): void {
    this.body.clear(); this.panel.clear(); this.fans.length = 0; this.caseDust.length = 0;
    this.content = {}; this.board = null; this.boardId = ''; this.cables = {}; this.cableKey = {};
    const [W, H, D] = CASE_DIMS[c.size];
    this.W = W; this.H = H; this.D = D;
    this.caseRef = c;
    const white = c.color === 'white';
    const shell = std(c.look.main, { roughness: 0.5 });
    const dark = std('#24262c', { roughness: 0.5 });
    const B = this.body;
    /*
     * Тёмные детали разведены по оттенкам: поддон платы светлее корпуса,
     * рамки вентиляторов светлее поддона, кабели — серые, а не чёрные.
     * Раньше всё внутри было одного почти чёрного цвета и сливалось (Codex).
     */
    const lift = (hex: string, k: number) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
    const tray = white ? shell : std(lift(c.look.main, 1.55), { roughness: 0.6 });
    const fanFrame = white ? c.look.main : lift(c.look.main, 2.1);
    add(B, rbox(0.006, H, D, 0.004), tray, -W / 2 + 0.003, 0, 0);
    /*
     * Глубина внутри корпуса (разбор Codex): мягкое затемнение по краям поддона
     * платы и у дна — как будто свет в углы не доходит. Две плоскости с одной
     * маленькой текстурой-«виньеткой», без нового света.
     */
    const vig = canvasTex(64, 64, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const gr = g.createRadialGradient(w / 2, h / 2, w * 0.22, w / 2, h / 2, w * 0.72);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${white ? 0.32 : 0.5})`);
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    const vigM = new THREE.MeshBasicMaterial({ map: vig, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const vt = add(B, new THREE.PlaneGeometry(D - 0.01, H - 0.01), vigM, -W / 2 + 0.0065, 0, 0, 0, Math.PI / 2, 0, false); vt.renderOrder = 2;
    const vb = add(B, new THREE.PlaneGeometry(W - 0.01, D - 0.01), vigM, 0, -H / 2 + 0.0105, 0, -Math.PI / 2, 0, 0, false); vb.renderOrder = 2;
    add(B, rbox(W, 0.008, D, 0.004), shell, 0, H / 2 - 0.004, 0);
    add(B, rbox(W, 0.01, D, 0.004), shell, 0, -H / 2 + 0.005, 0);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(B, cyl(0.013, 0.015, 0.012, 20), dark, x * (W / 2 - 0.025), -H / 2 - 0.006, z * (D / 2 - 0.05));
    // верхняя сетка — декаль с отверстиями
    const top = canvasTex(256, 512, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = white ? '#3a3c42' : '#0e0f12'; for (let y = 8; y < h; y += 12) for (let x = 8 + ((y / 12) % 2) * 6; x < w; x += 12) { g.beginPath(); g.arc(x, y, 3.4, 0, TAU); g.fill(); } });
    decal(B, W - 0.05, D - 0.12, top, 0, H / 2 + 0.0004, 0.02, -Math.PI / 2);
    // кнопка и порты
    add(B, cyl(0.008, 0.008, 0.004, 24), shell, 0, H / 2 + 0.002, -D / 2 + 0.03);
    // кольцо кнопки питания гаснет/загорается вместе с тестом (см. update)
    this.powerLed.emissive.set(c.look.accent);
    add(B, new THREE.TorusGeometry(0.0085, 0.0012, 8, 32), this.powerLed, 0, H / 2 + 0.0035, -D / 2 + 0.03, Math.PI / 2);
    for (const x of [-0.04, -0.06]) add(B, rbox(0.012, 0.003, 0.005, 0.001), dark, x, H / 2 + 0.0005, -D / 2 + 0.03);
    // перед: рамка + перфорация
    const bz = rrPath(THREE.Shape, W + 0.004, H, 0.012);
    bz.holes.push(rrPath(THREE.Path, W - 0.032, H - 0.07, 0.008));
    add(B, extrude(bz, 0.014, 0.003, 12), shell, 0, 0, -D / 2 - 0.004);
    // Фронт у каждой модели свой: по нему корпус узнают с первого взгляда.
    const pattern = c.id === 'zalman-t8' ? 'slots' : c.id === 'cc560' ? 'tri' : c.id === 'popmini' ? 'hex' : c.id === 'nr200p' ? 'square' : c.id === 'h5flow' ? 'fine' : c.id === 'o11evo' ? 'glass' : 'dots';
    const holes = canvasTex(256, 512, (g, w, h) => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#000';
      if (pattern === 'dots') for (let y = 6; y < h; y += 12) for (let x = 6 + ((y / 12) % 2) * 6; x < w; x += 12) { g.beginPath(); g.arc(x, y, 3.8, 0, TAU); g.fill(); }
      if (pattern === 'fine') for (let y = 4; y < h - 60; y += 7) for (let x = 4 + ((y / 7) % 2) * 3.5; x < w; x += 7) { g.beginPath(); g.arc(x, y, 2.1, 0, TAU); g.fill(); }
      if (pattern === 'square') for (let y = 5; y < h; y += 11) for (let x = 5; x < w; x += 11) g.fillRect(x, y, 7, 7);
      if (pattern === 'slots') for (const x0 of [12, w - 40]) for (let y = 20; y < h - 20; y += 14) g.fillRect(x0, y, 28, 6);
      if (pattern === 'tri') for (let y = 0; y < h; y += 14) for (let x = 0; x < w; x += 14) { const up = ((x + y) / 14) % 2 === 0; g.beginPath(); g.moveTo(x + 2, up ? y + 12 : y + 2); g.lineTo(x + 12, up ? y + 12 : y + 2); g.lineTo(x + 7, up ? y + 3 : y + 11); g.fill(); }
      // Pop Mini Air — крупные соты (её главный признак), видно издалека
      if (pattern === 'hex') for (let y = 14; y < h; y += 26) for (let x = 14 + ((y / 26) % 2) * 15; x < w; x += 30) { g.beginPath(); for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3; g.lineTo(x + 12 * Math.cos(a), y + 12 * Math.sin(a)); } g.fill(); }
    }, { srgb: false });
    const fm = pattern === 'glass'
      ? add(B, new THREE.PlaneGeometry(W - 0.032, H - 0.07), phys('#6f8796', { roughness: 0.05, transparent: true, opacity: 0.14, depthWrite: false }), 0, 0, -D / 2 - 0.006)
      : add(B, new THREE.PlaneGeometry(W - 0.032, H - 0.07), new THREE.MeshStandardMaterial({ color: c.look.main, alphaMap: holes, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.55 }), 0, 0, -D / 2 - 0.006);
    fm.castShadow = false;
    // узнаваемые детали фронта: CH560 — светящиеся полосы акцента по бокам,
    // H5 Flow — сплошная плашка сверху с логотипом, CC560 — полоска снизу
    const accM = own(c.look.accent, { emissive: c.look.accent, emissiveIntensity: 0.8 });
    if (c.id === 'ch560') for (const sx of [-1, 1]) add(B, box(0.004, H - 0.09, 0.003), accM, sx * (W / 2 - 0.022), 0, -D / 2 - 0.0075);
    if (c.id === 'h5flow') {
      add(B, box(W - 0.03, 0.07, 0.004), shell, 0, H / 2 - 0.07, -D / 2 - 0.0075);
      add(B, box(0.03, 0.004, 0.002), accM, 0, H / 2 - 0.07, -D / 2 - 0.0098);
    }
    if (c.id === 'cc560') add(B, box(W - 0.06, 0.004, 0.003), accM, 0, -H / 2 + 0.05, -D / 2 - 0.0075);
    // нижняя крышка спереди с логотипом
    // Крышка кончается в 6 см от блока питания: в этом зазоре поднимается кабель
    // видеокарты. При D − 0.2 зазора не было, и кабель шёл сквозь крышку.
    const coverD = D - 0.25;
    // в мини-корпусе крышка ниже: длинная видеокарта висит там низко и врезалась в неё
    const coverH = this.coverH = c.size === 'mini' ? 0.052 : 0.09;
    add(B, rbox(W - 0.012, coverH, coverD, 0.004), shell, 0, -H / 2 + 0.01 + coverH / 2, -D / 2 + coverD / 2 + 0.01);
    const logo = canvasTex(512, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = inkFor(c.look.main); g.textBaseline = 'middle'; fitText(g, c.brand.toUpperCase(), 16, h / 2, w * 0.68, 64, 900); g.fillStyle = c.look.accent; g.fillRect(w - 140, 44, 110, 9); g.fillRect(w - 140, 66, 70, 9); });
    decal(B, Math.min(0.16, coverD * 0.85), Math.min(0.04, coverH * 0.7), logo, W / 2 - 0.0055, -H / 2 + 0.01 + coverH / 2, -D / 2 + coverD / 2 + 0.01, 0, Math.PI / 2, 0);
    // вентиляторы корпуса: спереди и сзади
    const nFront = c.size === 'mini' ? 2 : 3;
    const fanLogo = hubTex(c.brand.split(' ')[0].toUpperCase().slice(0, 9), '#f3f3f5', '#2a2f3a', '');
    for (let i = 0; i < nFront; i++) {
      const y = (H - 0.08) / 2 - 0.065 - i * 0.125;
      // вентилятор целиком выше крышки БП (верх крышки на −H/2 + 0.1), иначе он в неё врезался
      if (y - 0.06 < -H / 2 + 0.1) break;
      const f = buildFan({ R: 0.056, frame: true, frameColor: fanFrame, rgb: !!c.rgb, logo: fanLogo, blade: '#4a4f59' });
      f.group.position.set(0, y, -D / 2 + 0.02); f.group.rotation.y = Math.PI;
      B.add(f.group); this.fans.push(f);
      const d = makeDust(0.112, 0.112); d.position.set(0, y, -D / 2 + 0.034); B.add(d); this.caseDust.push(d);
    }
    const rf = buildFan({ R: 0.056, frame: true, frameColor: fanFrame, rgb: !!c.rgb, logo: fanLogo, blade: '#4a4f59' });
    const rx = this.rearGeo().fan[0];
    rf.group.position.set(rx, H / 2 - 0.09, D / 2 - 0.017); B.add(rf.group); this.fans.push(rf);
    const rd = makeDust(0.112, 0.112); rd.position.set(rx, H / 2 - 0.09, D / 2 - 0.032); rd.rotation.y = Math.PI; B.add(rd); this.caseDust.push(rd);
    // заднюю стенку с настоящими вырезами строит buildRear(); старая нарисованная
    // «заглушка слотов» лежала поверх и закрывала выход видеокарты
    // боковая панель: стекло или сталь
    const P = this.panel;
    if (c.glass) {
      const gl = add(P, rbox(0.004, H - 0.012, D - 0.012, 0.002), phys('#6f8796', { roughness: 0.05, transparent: true, opacity: 0.12, depthWrite: false }), 0, 0, 0);
      gl.castShadow = false;
    } else {
      add(P, rbox(0.004, H - 0.012, D - 0.012, 0.002), shell, 0, 0, 0);
      const vent = canvasTex(128, 256, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#0e0f12'; for (let y = 10; y < h; y += 14) g.fillRect(10, y, w - 20, 5); });
      decal(P, 0.004 + 0.001, 0.12, vent, 0.0026, 0.05, 0.1, 0, Math.PI / 2, 0).scale.set(1, 1, 1);
    }
    for (const [y, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) add(P, cyl(0.006, 0.006, 0.006, 16), metal('#b9bec6'), 0.004, y * (H / 2 - 0.03), z * (D / 2 - 0.03), 0, 0, Math.PI / 2);
    P.position.x = W / 2 - 0.001;
    // зона «боковая панель»
    this.zone('panel', box(0.02, H, D), V(W / 2, 0, 0));
    this.zone('psu', box(0.15, 0.086, 0.15), V(0, -H / 2 + 0.055, D / 2 - 0.09));
    this.buildRear(); this.rear.userData.keep = true; this.rear.userData.boardId = '';
    // Точечный свет внутри корпуса убран: каждый источник света дорожает на всех материалах сцены.
    mergeTree(B); mergeTree(P);
  }

  private zone(name: keyof PcRig['zones'], geo: THREE.BufferGeometry, pos: THREE.Vector3, parent: THREE.Object3D = this.body, rot?: THREE.Euler): THREE.Mesh {
    const old = this.zones[name];
    if (old) old.removeFromParent();
    const m = new THREE.Mesh(geo, this.zoneMat.clone());
    m.position.copy(pos);
    if (rot) m.rotation.copy(rot);
    m.userData.zone = name;
    m.visible = false;
    parent.add(m);
    this.zones[name] = m;
    return m;
  }

  /* ───────────── синхронизация ───────────── */

  sync(b: Build): void {
    if ((b.case ?? '') !== this.caseId) {
      this.caseId = b.case ?? '';
      if (b.case) { this.buildCase(part(b.case) as Case); this.justPlaced.push('case'); }
      else { this.body.clear(); this.panel.clear(); this.content = {}; this.board = null; this.boardId = ''; }
    }
    if (!b.case) return;
    // плата
    if ((b.mb ?? '') !== this.boardId) {
      for (const k of ['mb', 'cpu', 'cooler', 'ram', 'ssd', 'gpu'] as SlotKey[]) this.drop(k);
      this.board?.group.removeFromParent();
      this.board = null; this.boardId = b.mb ?? '';
      if (b.mb) {
        const bm = buildBoard(part(b.mb) as MB);
        const w = bm.w, h = bm.h;
        bm.group.rotation.y = Math.PI / 2;
        // задний край платы в 1.2 см от стенки: кронштейн видеокарты и порты
        // выходят ровно в вырезы задней стенки (при 3 см висели внутри)
        bm.group.position.set(-this.W / 2 + 0.012, this.H / 2 - 0.03 - h / 2, this.D / 2 - 0.012 - w / 2);
        this.body.add(bm.group);
        this.board = bm;
        this.content.mb = { id: b.mb, obj: bm.group };
        bm.group.userData.slot = 'mb';
        this.justPlaced.push('mb');
        bm.group.add(this.paste.group);
        this.paste.group.position.copy(bm.anchors.cpu.position).add(V(0, 0, 0.0045));
      }
    }
    if (this.rear.userData.boardId !== this.boardId) { this.buildRear(); this.rear.userData.keep = true; this.rear.userData.boardId = this.boardId; }
    const bd = this.board;
    this.zone('mb', box(0.02, 0.26, 0.24), V(-this.W / 2 + 0.02, this.H / 2 - 0.16, this.D / 2 - 0.15));
    if (bd) {
      const z = (name: keyof PcRig['zones'], a: THREE.Object3D, size: [number, number, number], off = V()) => this.zone(name, box(...size), a.position.clone().add(off), bd.group);
      z('cpu', bd.anchors.cpu, [0.05, 0.05, 0.02], V(0, 0, 0.01));
      z('paste', bd.anchors.cpu, [0.04, 0.04, 0.02], V(0, 0, 0.012));
      z('cooler', bd.anchors.cpu, [0.12, 0.12, 0.16], V(0, 0, 0.08));
      z('ram', bd.anchors.ram, [0.04, 0.14, 0.045], V(0.013, 0, 0.022));
      z('ssd', bd.anchors.m2, [0.085, 0.03, 0.02], V(0, 0, 0.005));
      z('gpu', bd.anchors.pcie, [0.28, 0.03, 0.12], V(0.1, -0.02, 0.06));
      z('cab24', bd.anchors.atx24, [0.03, 0.07, 0.04]);
      z('cab8', bd.anchors.cpu8, [0.04, 0.03, 0.04]);
    }
    this.place('psu', b.psu, () => {
      const g = buildPSU(part(b.psu!) as PSU);
      // В мини-корпусе — компактный блок (как SFX): полноразмерный упирался в видеокарту
      const k = this.caseRef?.size === 'mini' ? 0.75 : 1;
      g.scale.setScalar(k); g.userData.k = k;
      const dims = (g.userData.dims as number[]).map((v) => v * k);
      g.position.set(0, -this.H / 2 + 0.01 + dims[1] / 2, this.D / 2 - 0.02 - dims[2] / 2);
      this.body.add(g);
      return { id: b.psu!, obj: g };
    });
    if (!bd) return;
    this.place('cpu', b.cpu, () => { const g = buildCPU(part(b.cpu!) as CPU); g.position.copy(bd.anchors.cpu.position); bd.group.add(g); return { id: b.cpu!, obj: g }; });
    this.paste.set(b.cpu ? (b.paste ? 'new' : b.oldPaste ? 'old' : 'none') : 'none');
    this.place('cooler', b.cooler, () => {
      // Радиатор СВО — под крышей корпуса: считаем его точку в системе якоря процессора.
      const top = V(-0.02, this.H / 2 - 0.035, 0.02);
      const anchorWorld = bd.anchors.cpu.position.clone();
      bd.group.updateMatrix();
      const inv = bd.group.matrix.clone().invert();
      const local = top.clone().applyMatrix4(inv).sub(anchorWorld);
      const cm = buildCooler(part(b.cooler!) as Cooler, local.add(V(0, 0, -0.0045)));
      cm.group.position.copy(bd.anchors.cpu.position).add(V(0, 0, 0.0045));
      bd.group.add(cm.group);
      return { id: b.cooler!, obj: cm.group, cooler: cm };
    });
    // планки: 1 → слот A2, 2 → A2+B2, 4 → все; на плате с двумя слотами — по порядку
    const slots = (part(b.mb!) as MB).slots;
    const idx = ramSlotsOf(b, slots);
    const rk = b.ram ? b.ram + 'x' + idx.join('') : undefined;
    this.place('ram', rk, () => { const g = buildRAM(part(b.ram!) as RAM, idx); g.position.copy(bd.anchors.ram.position); bd.group.add(g); return { id: rk!, obj: g }; });
    // зоны отдельных слотов: при выборе планки подсвечиваются свободные
    for (const m of this.ramZones) m.removeFromParent();
    this.ramZones = [];
    for (let i = 0; i < slots; i++) {
      // зона нажатия шире самого слота — по ней попадают пальцем
      const m = new THREE.Mesh(box(RAM_PITCH * 0.95, 0.14, 0.05), this.zoneMat.clone());
      m.position.copy(bd.anchors.ram.position).add(V(i * RAM_PITCH, 0, 0.022));
      m.userData.zone = 'ramSlot'; m.userData.ramSlot = i; m.userData.free = !idx.includes(i); m.visible = false;
      bd.group.add(m); this.ramZones.push(m);
    }
    this.place('ssd', b.ssd, () => { const g = buildSSD(part(b.ssd!) as SSD); g.position.copy(bd.anchors.m2.position); bd.group.add(g); return { id: b.ssd!, obj: g }; });
    this.place('gpu', b.gpu, () => {
      const gm = buildGPU(part(b.gpu!) as GPU);
      gm.group.rotation.x = Math.PI / 2;
      const f = gm.finger.clone().applyEuler(gm.group.rotation);
      gm.group.position.copy(bd.anchors.pcie.position).sub(f).add(V(0, 0, 0.002));
      bd.group.add(gm.group);
      return { id: b.gpu!, obj: gm.group, gpu: gm };
    });
    if (b.gpu) this.content.gpu?.gpu?.setPaste(b.gpuOldPaste ? 'old' : 'new');
    this.syncCables(b);
    this.syncCovers();
    this.glowDirty = true;
  }

  private place(slot: SlotKey, id: string | undefined, make: () => Content): void {
    const cur = this.content[slot];
    if (cur && cur.id === id) return;
    this.drop(slot);
    if (id) {
      const c = make();
      c.obj.userData.slot = slot;
      this.content[slot] = c;
      this.justPlaced.push(slot);
    }
  }

  /** Слоты, модели которых появились в последнем sync — их анимирует верстак. */
  justPlaced: SlotKey[] = [];

  private drop(slot: SlotKey): void {
    const c = this.content[slot];
    if (!c) return;
    c.obj.removeFromParent();
    delete this.content[slot];
  }

  /** Модель, стоящая в слоте (для анимации снятия и подсветки). */
  objectOf(slot: SlotKey): THREE.Object3D | null { return this.content[slot]?.obj ?? null; }
  gpuModel(): GpuModel | undefined { return this.content.gpu?.gpu; }
  coolerModel(): CoolerModel | undefined { return this.content.cooler?.cooler; }

  /* ───────────── кабели ───────────── */

  private syncCables(b: Build): void {
    const bd = this.board;
    const want: Record<'cab24' | 'cab8' | 'cabGpu', boolean> = { cab24: !!(b.cab24 && b.psu && bd), cab8: !!(b.cab8 && b.psu && bd && b.cpu), cabGpu: !!(b.cabGpu && b.psu && b.gpu) };
    for (const k of ['cab24', 'cab8', 'cabGpu'] as const) {
      const sig = want[k] ? `${b.psu}|${b.mb}|${b.gpu}|${this.caseId}` : '';
      if (this.cableKey[k] === sig) continue;
      this.cableKey[k] = sig;
      this.cables[k]?.removeFromParent();
      delete this.cables[k];
      if (!want[k]) continue;
      const g = new THREE.Group();
      this.body.add(g);
      this.body.updateMatrixWorld(true);
      const toBody = (o: THREE.Object3D, off = V()) => this.body.worldToLocal(o.localToWorld(off.clone()));
      /*
       * Кабели идут так, как их укладывают сборщики: жгут выходит из резинового
       * окна (граммета) в поддоне платы прямо рядом с разъёмом, а сам тянется
       * за поддоном и не виден. Раньше жгуты шли от БП напрямую через корпус
       * и протыкали плату, кулер и видеокарту.
       */
      const trayX = -this.W / 2 + 0.007;
      const grommetM = std('#16171b', { roughness: 0.9 });
      const sleeve = std('#cfccc4', { roughness: 0.85 }), sleeveB = std('#454a53', { roughness: 0.8 });
      const sl = (i: number) => (i % 2 ? sleeve : sleeveB);
      if (k === 'cab24' && bd) {
        const end = toBody(bd.anchors.atx24, V(0, 0, 0.012));
        const G = V(trayX, end.y, end.z - 0.035);
        add(g, rbox(0.004, 0.07, 0.026, 0.004), grommetM, G.x, G.y, G.z);
        for (let i = 0; i < 6; i++) {
          const o = (i - 2.5) * 0.0068;
          tube(g, [V(G.x, G.y + o, G.z), V(G.x + 0.014, G.y + o, G.z + 0.006), V(end.x - 0.002, end.y + o * 0.9, end.z - 0.018), V(end.x, end.y + o * 0.9, end.z - 0.004)], 0.0029, sl(i), 24, 6);
        }
      }
      if (k === 'cab8' && bd) {
        const end = toBody(bd.anchors.cpu8, V(0, 0, 0.012));
        const G = V(trayX, Math.min(end.y + 0.03, this.H / 2 - 0.016), end.z);
        add(g, rbox(0.004, 0.018, 0.04, 0.004), grommetM, G.x, G.y, G.z);
        for (let i = 0; i < 3; i++) {
          const o = (i - 1) * 0.0068;
          tube(g, [V(G.x, G.y, G.z + o), V(G.x + 0.012, G.y - 0.004, G.z + o), V(end.x, end.y + 0.016, end.z + o * 0.8), V(end.x, end.y + 0.004, end.z + o * 0.8)], 0.0029, sl(i + 1), 20, 6);
        }
      }
      if (k === 'cabGpu') {
        const gm = this.content.gpu?.gpu;
        const psu = this.content.psu?.obj;
        if (gm && psu) {
          const conn = new THREE.Object3D(); conn.position.set(gm.L / 2 - 0.045, gm.H / 2 + 0.006, 0.006); gm.group.add(conn);
          const end = toBody(conn);
          conn.removeFromParent();
          /*
           * Жгут питания видеокарты — из МОДУЛЬНОГО разъёма на передней стенке
           * БП: штекер в разъёме, кабель поднимается в зазоре между БП и
           * крышкой, ложится поверх крышки и подходит к карте снаружи её края
           * (в 3 см: медные трубки радиатора торчат за край почти на сантиметр).
           * Раньше он вылезал из отверстия в крышке, и не было видно, что он от БП.
           */
          const dims = (psu.userData.dims as number[]).map((v) => v * ((psu.userData.k as number) ?? 1));
          const coverTop = -this.H / 2 + 0.01 + this.coverH;
          const psuTop = -this.H / 2 + 0.01 + dims[1];
          const top = Math.max(coverTop, psuTop);
          const xo = Math.min(end.x + 0.03, this.W / 2 - 0.012);
          const pf = psu.position.z - dims[2] / 2 - 0.004;
          const py = psu.position.y + dims[1] * 0.18;
          const xc = Math.max(-dims[0] / 2 + 0.02, Math.min(dims[0] / 2 - 0.02, xo - 0.01));
          add(g, rbox(0.026, 0.012, 0.014, 0.002), grommetM, xc, py, pf - 0.002);
          for (let i = 0; i < 3; i++) {
            const o = (i - 1) * 0.0062;
            const pts = [V(xc + o, py, pf - 0.006), V(xc + o, py + 0.004, pf - 0.024), V(xo + o * 0.6, top + 0.022, pf - 0.032)];
            // разъём карты дальше к передней стенке — кабель ложится на крышку
            if (end.z < pf - 0.06) pts.push(V(xo + o * 0.6, top + 0.012, (pf - 0.032 + end.z) / 2), V(xo + o * 0.6, top + 0.016, end.z + 0.02 + o));
            pts.push(V(xo + o * 0.5, Math.max(top + 0.03, end.y - 0.025), end.z + o * 0.6), V(xo - 0.008, end.y + 0.004, end.z + o * 0.6), V(end.x + 0.004, end.y, end.z + o * 0.6));
            tube(g, pts, 0.0028, sl(i), 40, 6);
          }
          this.zone('cabGpu', box(0.05, 0.03, 0.03), end);
        }
      }
      this.cables[k] = g;
    }
    if (b.gpu && !this.zones.cabGpu?.parent) {
      const gm = this.content.gpu?.gpu;
      if (gm) { this.body.updateMatrixWorld(true); const conn = new THREE.Object3D(); conn.position.set(gm.L / 2 - 0.045, gm.H / 2 + 0.006, 0.006); gm.group.add(conn); this.zone('cabGpu', box(0.05, 0.03, 0.03), this.body.worldToLocal(conn.getWorldPosition(V()))); conn.removeFromParent(); }
    }
  }

  /* ───────────── пыль ───────────── */

  allDust(): Dust[] {
    const d = [...this.caseDust];
    const gm = this.content.gpu?.gpu; if (gm) d.push(...gm.dust);
    const cm = this.content.cooler?.cooler; if (cm) d.push(...cm.dust);
    return d;
  }

  setDustAll(v: number): void { for (const d of this.allDust()) setDust(d, v); }

  dustAverage(): number {
    const d = this.allDust();
    return d.length ? d.reduce((s, x) => s + x.userData.amount, 0) / d.length : 0;
  }

  /* ───────────── кадр ───────────── */

  update(dt: number, t: number, running: boolean): void {
    this.panelOpen += (this.panelTarget - this.panelOpen) * Math.min(1, dt * 6);
    this.panel.position.x = this.W / 2 - 0.001 + this.panelOpen * 0.16;
    this.panel.position.y = -this.panelOpen * 0.02;
    this.panel.rotation.z = -this.panelOpen * 0.08;
    this.panel.visible = this.panelOpen < 0.97;
    /*
     * Тест — маленькое шоу: кольцо кнопки загорается сразу, вентиляторы
     * раскручиваются за секунду, подсветка разгорается из почти погасшей.
     * Вне теста RGB приглушена — иначе включать нечего и «вау» не получается.
     */
    const target = running ? 1 : 0;
    this.power += (target - this.power) * Math.min(1, dt * (running ? 1.6 : 1.2));
    if (this.glowDirty) this.collectGlow();
    const p = this.power;
    this.powerLed.emissiveIntensity = running ? 3.2 : p * 3.2;
    for (const g of this.glow) g.m.emissiveIntensity = g.base * (0.08 + 0.92 * p);
    if (p > 0.01) {
      for (const [i, f] of this.fans.entries()) f.rotor.rotation.z -= dt * (9 + i * 0.4) * p;
      this.content.gpu?.gpu?.update(dt * p, true);
      for (const f of this.content.cooler?.cooler?.fans ?? []) f.rotor.rotation.z -= dt * 12 * p;
      const c = new THREE.Color();
      for (const [i, f] of this.fans.entries()) { c.setHSL((t * 0.12 + i * 0.12) % 1, 0.9, 0.55); for (const m of f.rgb) m.emissive.copy(c); }
    }
  }

  /*
   * Задняя стенка с настоящими вырезами: окно под разъёмы платы, круг заднего
   * вентилятора, прорези слотов расширения (с заглушками) и проём под БП.
   * Раньше это была глухая пластина, и ни порты платы, ни видеокарта, ни БП
   * «наружу» не выходили. Слоты строятся от фактического положения PCIe
   * установленной платы, поэтому стенка пересобирается при смене платы.
   */
  private rear = new THREE.Group();
  private covers: { m: THREE.Mesh; y: number }[] = [];
  private ioShield: THREE.Mesh | null = null;
  private caseRef: Case | null = null;
  /** Высота нижней крышки корпуса (у мини-корпуса ниже). */
  private coverH = 0.09;
  private rearGeo(): { io: number[]; fan: number[]; slots: number[]; psu: number[] } {
    const W = this.W, H = this.H, mini = this.caseRef?.size === 'mini';
    const ioH = mini ? 0.125 : 0.165;
    const io = [-W / 2 + 0.016, -W / 2 + 0.062, H / 2 - 0.035 - ioH, H / 2 - 0.035];
    const r = 0.052, fx = Math.max(0, io[1] + 0.006 + r);
    const fan = [fx, H / 2 - 0.09, r];
    const pk = mini ? 0.75 : 1; // компактный БП в мини-корпусе (как в place('psu'))
    const psuTop = -H / 2 + 0.01 + 0.086 * pk;
    let top = io[2] - 0.006;
    if (this.board) {
      // верх первого слота — на уровне PCIe платы (в осях корпуса)
      top = Math.min(top, this.board.group.position.y + this.board.anchors.pcie.position.y + 0.012);
    }
    const form = this.caseRef?.form ?? 'ATX';
    let n = form === 'ATX' ? 7 : form === 'mATX' ? 4 : 2;
    while (n > 1 && top - n * 0.0203 < psuTop + 0.004) n--;
    const slots = [-W / 2 + 0.016, -W / 2 + 0.13, top - n * 0.0203, top, n];
    const psu = [-0.074 * pk, 0.074 * pk, -H / 2 + 0.014, psuTop - 0.002];
    return { io, fan, slots, psu };
  }
  private buildRear(): void {
    this.rear.removeFromParent(); this.rear = new THREE.Group(); this.body.add(this.rear);
    this.covers = []; this.ioShield = null;
    const c = this.caseRef; if (!c) return;
    const W = this.W, H = this.H, D = this.D;
    const g = this.rearGeo();
    const rect = (x0: number, x1: number, y0: number, y1: number) => { const p = new THREE.Path(); p.moveTo(x0, y0); p.lineTo(x0, y1); p.lineTo(x1, y1); p.lineTo(x1, y0); p.lineTo(x0, y0); return p; };
    const sh = new THREE.Shape(); sh.moveTo(-W / 2, -H / 2); sh.lineTo(W / 2, -H / 2); sh.lineTo(W / 2, H / 2); sh.lineTo(-W / 2, H / 2); sh.lineTo(-W / 2, -H / 2);
    sh.holes.push(rect(g.io[0], g.io[1], g.io[2], g.io[3]));
    const fh = new THREE.Path(); fh.absarc(g.fan[0], g.fan[1], g.fan[2], 0, TAU, true); sh.holes.push(fh);
    sh.holes.push(rect(g.slots[0], g.slots[1], g.slots[2], g.slots[3]));
    sh.holes.push(rect(g.psu[0], g.psu[1], g.psu[2], g.psu[3]));
    const white = c.color === 'white';
    const inner = std(shade(c.look.main, white ? 0.9 : 1.15), { roughness: 0.7 });
    add(this.rear, extrude(sh, 0.004, 0, 40), inner, 0, 0, D / 2 - 0.002);
    // заглушка разъёмов платы — появляется вместе с платой
    const ioT = memoIo();
    this.ioShield = add(this.rear, new THREE.PlaneGeometry(g.io[1] - g.io[0], g.io[3] - g.io[2]), std('#fff', { map: ioT, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide }), (g.io[0] + g.io[1]) / 2, (g.io[2] + g.io[3]) / 2, D / 2 + 0.0004);
    this.ioShield.visible = !!this.board;
    // заглушки слотов: по одной на слот, снимаются там, где стоит видеокарта
    const coverM = metal(white ? '#d9d6cf' : '#2b2e34', 0.4);
    const n = g.slots[4];
    for (let i = 0; i < n; i++) {
      const y = g.slots[3] - 0.0203 * (i + 0.5);
      const m = add(this.rear, box(g.slots[1] - g.slots[0] - 0.006, 0.0172, 0.0012), coverM, (g.slots[0] + g.slots[1]) / 2, y, D / 2 - 0.0035);
      this.covers.push({ m, y });
    }
    // решётка вентилятора
    const grill = memoGrill();
    add(this.rear, new THREE.CircleGeometry(g.fan[2], 40), std('#fff', { map: grill, transparent: true, alphaTest: 0.4, roughness: 0.6 }), g.fan[0], g.fan[1], D / 2 + 0.0005, 0, 0, 0, false);
    this.syncCovers();
  }
  /** Заглушки слотов, занятых видеокартой, сняты. */
  private syncCovers(): void {
    const gm = this.content.gpu?.gpu;
    if (!gm || !this.board) { for (const c of this.covers) c.m.visible = true; return; }
    // по фактическим габаритам карты в осях корпуса (толщина бывает 2–3.5 слота)
    this.body.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(gm.group);
    const inv = this.body.matrixWorld.clone().invert();
    bb.applyMatrix4(inv);
    for (const c of this.covers) c.m.visible = c.y + 0.0086 < bb.min.y || c.y - 0.0086 > bb.max.y;
  }

  /** Собрать светящиеся материалы сборки; общие (кэшированные) — клонировать, чтобы не гасить витрину. */
  private collectGlow(): void {
    this.glowDirty = false;
    this.glow = [];
    const fanMats = new Set<THREE.Material>(); for (const f of [...this.fans, ...(this.content.cooler?.cooler?.fans ?? [])]) for (const m of f.rgb) fanMats.add(m);
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material) || o.userData.zone) return;
      let m = mesh.material as THREE.MeshStandardMaterial;
      if (!m.emissive || m === this.powerLed || m.emissive.getHex() === 0 || m.emissiveIntensity < 0.3) return;
      if (!fanMats.has(m) && !m.userData.rigOwn) { m = m.clone(); m.userData.rigOwn = true; m.userData.baseI = (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity; mesh.material = m; }
      if (m.userData.baseI === undefined) m.userData.baseI = m.emissiveIntensity;
      this.glow.push({ m, base: m.userData.baseI as number });
    });
  }

  /** Подсветка зоны для подсказки «сюда». */
  /** Зоны слотов памяти (по одной на слот) — для выбора, куда ставить планку. */
  ramZones: THREE.Mesh[] = [];
  /** Свободный слот памяти под лучом или null. */
  ramSlotHit(ray: THREE.Raycaster): number | null {
    const free = this.ramZones.filter((m) => m.userData.free);
    const h = ray.intersectObjects(free, false)[0];
    return h ? (h.object.userData.ramSlot as number) : null;
  }

  highlight(names: string[], t: number): void {
    const ramPick = names.includes('ram') && this.ramZones.length > 0;
    for (const m of this.ramZones) {
      const on = ramPick && !!m.userData.free;
      m.visible = on;
      (m.material as THREE.MeshStandardMaterial).opacity = on ? 0.5 + Math.sin(t * 6) * 0.15 : 0;
    }
    for (const [name, m] of Object.entries(this.zones)) {
      if (!m) continue;
      const on = names.includes(name) && !(name === 'ram' && ramPick);
      m.visible = on;
      (m.material as THREE.MeshStandardMaterial).opacity = on ? 0.16 + Math.sin(t * 6) * 0.08 : 0;
    }
  }

  pickables(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const m of Object.values(this.zones)) if (m) out.push(m);
    return out;
  }
}

export const boardZ = (bm: BoardModel): THREE.Vector3 => bm.group.position.clone();
export const slotNames: SlotKey[] = ['case', 'mb', 'cpu', 'paste', 'cooler', 'ram', 'ssd', 'gpu', 'psu'];
export { box as boxGeo };
