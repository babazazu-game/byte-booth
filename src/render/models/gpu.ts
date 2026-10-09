import * as THREE from 'three';
import type { GPU } from '../../logic/parts.ts';
import { add, std, phys, metal, rbox, box, cyl, extrude, rrPath, circ, canvasTex, decal, tube, fitText, rgbMatH, mulberry32, shade, inkFor, mergeTree, V } from '../kit.ts';
import { buildFan, hubTex, type Fan } from './fan.ts';
import { makeDust, type Dust } from './dust.ts';

/**
 * Видеокарта по данным каталога.
 *
 * Оси: длина — X (планка слева, −X), высота — Y (контакты PCIe внизу),
 * толщина — Z (вентиляторы смотрят в +Z, бэкплейт в −Z).
 *
 * Модель разбирается на четыре слоя — кожух с вентиляторами, радиатор,
 * плата, бэкплейт, — потому что в заказах на чистку игрок её реально
 * разбирает и меняет пасту на чипе. Поэтому на плате есть то, что увидит
 * человек, открывший настоящую карту: кристалл на подложке, банки памяти
 * вокруг, дроссели и конденсаторы питания, разъём доп. питания.
 */

export interface GpuModel {
  group: THREE.Group;
  front: THREE.Group;
  heat: THREE.Group;
  back: THREE.Group;
  pcb: THREE.Group;
  fans: Fan[];
  screws: THREE.Mesh[];
  dust: Dust[];
  L: number; H: number; T: number;
  /** Центр контактов PCIe (локально). */
  finger: THREE.Vector3;
  explode(t: number): void;
  setPaste(state: 'old' | 'clean' | 'new'): void;
  update(dt: number, spin: boolean): void;
}

const texCache = new Map<string, THREE.Texture>();
function memo(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = texCache.get(key);
  if (!t) { t = make(); texCache.set(key, t); }
  return t;
}

const fingersTex = () => memo('fingers', () => canvasTex(512, 32, (g, w, h) => {
  g.fillStyle = '#1d3a2c'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e0ac45'; for (let x = 4; x < w; x += 9) { if (x > 120 && x < 140) continue; g.fillRect(x, 3, 6, h - 3); }
}));
const pwrTex = () => memo('pwr', () => canvasTex(128, 64, (g, w, h) => {
  g.fillStyle = '#16171c'; g.fillRect(0, 0, w, h); g.fillStyle = '#000';
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) { g.beginPath(); g.roundRect(8 + i * 19, 10 + j * 24, 14, 18, 3); g.fill(); }
}));
const chipTex = (label: string) => memo('chip' + label, () => canvasTex(128, 96, (g, w, h) => {
  g.fillStyle = '#1a1b1f'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(220,224,232,.75)'; g.textAlign = 'center';
  fitText(g, label, w / 2, 44, w - 16, 22, 700);
  fitText(g, 'D8BZF', w / 2, 72, w - 16, 16, 500);
}));
const pcbTex = () => memo('gpcb', () => {
  const r = mulberry32(17);
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#17331f'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(80,140,95,.5)'; g.lineWidth = 1.5;
    for (let i = 0; i < 140; i++) {
      let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 3; k++) { const d = r() * 50 + 8; if (r() < 0.5) x += d; else y += d * (r() < 0.5 ? 1 : -1); g.lineTo(x, y); }
      g.stroke();
    }
    g.fillStyle = 'rgba(230,236,240,.7)'; g.font = '600 11px Rubik';
    ['C221', 'R18', 'L4', 'U2', 'PE1', 'C67', 'Q12'].forEach((s) => g.fillText(s, r() * (w - 40), 20 + r() * (h - 30)));
  });
});
const crackTex = () => memo('crack', () => {
  const r = mulberry32(5);
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#8e8a80'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(60,56,50,.8)'; g.lineWidth = 1.5;
    for (let i = 0; i < 26; i++) { g.beginPath(); const a = r() * 6.28; g.moveTo(64, 64); let x = 64, y = 64; for (let k = 0; k < 4; k++) { x += Math.cos(a + r() - 0.5) * 14; y += Math.sin(a + r() - 0.5) * 14; g.lineTo(x, y); } g.stroke(); }
    g.fillStyle = 'rgba(160,156,146,.5)'; for (let i = 0; i < 60; i++) g.fillRect(r() * w, r() * h, 2, 2);
  });
});

function backTex(p: GPU): THREE.Texture {
  return memo('back' + p.id, () => canvasTex(1024, 410, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.save(); g.translate(180, h / 2); g.rotate(-0.12);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 5; g.strokeStyle = 'rgba(140,148,165,.55)';
    g.font = '900 170px Rubik';
    g.strokeText(p.vendor === 'nvidia' ? 'RTX' : 'RX', 60, 6);
    g.restore();
    g.strokeStyle = p.look.accent; g.lineWidth = 6;
    g.beginPath(); g.moveTo(40, h - 40); g.lineTo(520, h - 40); g.lineTo(560, h - 80); g.stroke();
    g.fillStyle = '#121419';
    for (let i = 0; i < 9; i++) { g.beginPath(); g.roundRect(640 + i * 36, 70, 16, 270, 8); g.fill(); }
    g.fillStyle = 'rgba(210,214,224,.85)'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    fitText(g, `${p.brand} · ${p.name} · ${p.vram}GB`, 40, 52, 580, 24, 600);
  }));
}
function topTex(p: GPU, bg: string): THREE.Texture {
  return memo('top' + p.id, () => canvasTex(512, 64, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.textBaseline = 'middle';
    g.fillStyle = inkFor(bg);
    const s = fitText(g, p.brand.toUpperCase(), 10, 34, 180, 34, 900);
    void s;
    g.fillStyle = p.vendor === 'nvidia' ? '#76b900' : '#ed1c24';
    fitText(g, p.vendor === 'nvidia' ? 'GEFORCE RTX' : 'RADEON', 210, 34, 290, 30, 900);
  }));
}

/**
 * Дизайн каждой модели. Это не перекраска одного кожуха: у карт разная
 * форма (скругление, рубленые грани, скосы, «кирпич»), разный рисунок
 * акцентов, своё число и форма лопастей, металл или пластик, толщина в слотах
 * и подсветка — как у настоящих линеек Palit, MSI, ASUS, Sapphire и др.
 */
interface GStyle {
  shape: 'round' | 'angular' | 'chamfer' | 'box';
  accent: 'between' | 'stripes' | 'edge' | 'diag' | 'grille' | 'facets';
  blades: number; sweep: number; w0: number; w1: number;
  blade: string; hub: string; ring: string;
  metal?: boolean; screws?: boolean; rgb?: 'top' | 'diag' | 'ring'; slots: number; plateBack?: boolean;
}
const GSTYLE: Record<string, GStyle> = {
  rtx3050: { shape: 'round', accent: 'stripes', blades: 11, sweep: 0.5, w0: 0.14, w1: 0.2, blade: '#1f2329', hub: '#1b1f2a', ring: '#3a3e46', slots: 2, plateBack: false },
  rx7600: { shape: 'chamfer', accent: 'edge', blades: 9, sweep: 0.8, w0: 0.2, w1: 0.32, blade: '#22252b', hub: '#16171b', ring: '#d8382f', slots: 2 },
  rtx4060: { shape: 'angular', accent: 'facets', blades: 10, sweep: 0.62, w0: 0.18, w1: 0.26, blade: '#2a2d33', hub: '#1b1f2a', ring: '#8a8f99', slots: 2 },
  rx9060xt: { shape: 'box', accent: 'grille', blades: 9, sweep: 0.7, w0: 0.2, w1: 0.3, blade: '#1f2228', hub: '#16171b', ring: '#e2674f', slots: 2 },
  rtx5060ti: { shape: 'round', accent: 'between', blades: 13, sweep: 0.45, w0: 0.11, w1: 0.16, blade: '#d9d8d4', hub: '#e9e8e4', ring: '#bfc3c9', slots: 2.5 },
  rtx5070: { shape: 'round', accent: 'stripes', blades: 11, sweep: 0.55, w0: 0.15, w1: 0.22, blade: '#25282f', hub: '#16171b', ring: '#f2a13a', slots: 2.5 },
  rx9070xt: { shape: 'chamfer', accent: 'diag', blades: 9, sweep: 0.85, w0: 0.2, w1: 0.34, blade: '#1f2a3f', hub: '#16171b', ring: '#4fa3ff', metal: true, rgb: 'diag', slots: 3 },
  rtx5070ti: { shape: 'round', accent: 'between', blades: 9, sweep: 0.72, w0: 0.2, w1: 0.3, blade: '#253049', hub: '#1b2130', ring: '#232a3b', rgb: 'top', slots: 2.5 },
  rtx5080: { shape: 'angular', accent: 'facets', blades: 11, sweep: 0.6, w0: 0.16, w1: 0.24, blade: '#2a2c31', hub: '#1b1c20', ring: '#e8c040', metal: true, screws: true, slots: 3.5 },
  rtx5090: { shape: 'chamfer', accent: 'stripes', blades: 11, sweep: 0.65, w0: 0.16, w1: 0.25, blade: '#3a3c42', hub: '#d8d9dc', ring: '#d8d9dc', metal: true, rgb: 'ring', slots: 3.5 },
};
const DEFAULT_STYLE: GStyle = { shape: 'round', accent: 'between', blades: 9, sweep: 0.72, w0: 0.2, w1: 0.3, blade: '#253049', hub: '#1b2130', ring: '#232a3b', slots: 2.5 };

function polyShape(pts: [number, number][]): THREE.Shape {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

function shroudShape(st: GStyle, L: number, h: number): THREE.Shape {
  const x0 = -L / 2, x1 = L / 2, y0 = -h / 2, y1 = h / 2;
  if (st.shape === 'round') return rrPath(THREE.Shape, L, h, 0.013);
  if (st.shape === 'box') return rrPath(THREE.Shape, L, h, 0.004);
  if (st.shape === 'chamfer') { const c = 0.022; return polyShape([[x0 + c, y0], [x1 - c, y0], [x1, y0 + c], [x1, y1 - c], [x1 - c, y1], [x0 + c, y1], [x0, y1 - c], [x0, y0 + c]]); }
  // angular: ступенька сверху и косой срез справа — силуэт «агрессивных» линеек
  return polyShape([[x0, y0], [x1 - 0.035, y0], [x1, y0 + 0.03], [x1, y1], [x0 + 0.06, y1], [x0 + 0.045, y1 - 0.012], [x0, y1 - 0.012]]);
}

export function buildGPU(p: GPU): GpuModel {
  const group = new THREE.Group();
  const st = GSTYLE[p.id] ?? DEFAULT_STYLE;
  const L = Math.min(0.36, Math.max(0.17, p.len / 1000));
  const big = p.fans === 3;
  const H = L < 0.25 ? 0.108 : st.slots >= 3.5 ? 0.135 : 0.12;
  const hsT = st.slots >= 3.5 ? 0.046 : st.slots >= 3 ? 0.038 : st.slots >= 2.5 ? 0.03 : 0.022;
  const front = new THREE.Group(), heat = new THREE.Group(), back = new THREE.Group(), pcb = new THREE.Group();
  group.add(front, heat, back, pcb);
  const fans: Fan[] = [];
  const screws: THREE.Mesh[] = [];
  const dust: Dust[] = [];

  // ── плата ──────────────────────────────────────────────────────────────
  add(pcb, rbox(L - 0.012, H - 0.006, 0.0016, 0.0006, 1), std('#fff', { map: pcbTex(), roughness: 0.55 }), 0.004, 0, 0);
  add(pcb, box(0.075, 0.009, 0.0017), std('#fff', { map: fingersTex(), metalness: 0.6, roughness: 0.35 }), -L / 2 + 0.065, -H / 2 - 0.0035, 0);
  const dieX = -L / 2 + 0.105, dieY = 0.004;
  add(pcb, box(0.044, 0.044, 0.0014), std('#2f5a3a', { roughness: 0.5 }), dieX, dieY, 0.0012);
  add(pcb, box(0.022, 0.022, 0.0012), phys('#3a3d44', { roughness: 0.15, metalness: 0.4, clearcoat: 1 }), dieX, dieY, 0.0024);
  const memMat = std('#fff', { map: chipTex(p.vendor === 'nvidia' ? 'MICRON' : 'SAMSUNG'), roughness: 0.4 });
  const memPos = [[-0.034, 0.03], [0, 0.036], [0.034, 0.03], [-0.04, 0], [0.04, 0], [-0.034, -0.03], [0, -0.036], [0.034, -0.03]];
  for (const [dx, dy] of memPos.slice(0, p.vram >= 16 ? 8 : 6)) add(pcb, box(0.014, 0.012, 0.0012), memMat, dieX + dx, dieY + dy, 0.0014);
  const choke = metal('#7d838c', 0.45), chokeTop = std('#2a2c31', { roughness: 0.5 });
  const vrmX0 = dieX + 0.07, vrmN = Math.max(4, Math.round((L - 0.2) / 0.012));
  for (let i = 0; i < vrmN; i++) {
    const x = vrmX0 + i * 0.012;
    if (x > L / 2 - 0.03) break;
    add(pcb, box(0.009, 0.009, 0.007), choke, x, 0.028, 0.0043);
    add(pcb, box(0.0085, 0.0085, 0.0006), chokeTop, x, 0.028, 0.0081);
    add(pcb, cyl(0.003, 0.003, 0.007, 12), metal('#b7bcc4', 0.3), x, -0.03, 0.0043, Math.PI / 2);
    add(pcb, box(0.006, 0.005, 0.0015), std('#111216'), x, 0.012, 0.0015);
  }
  // мелкие SMD-компоненты россыпью — без них плата выглядит пластиковой заготовкой
  const smd = new THREE.InstancedMesh(box(0.002, 0.001, 0.0006), std('#3b2e22', { roughness: 0.6 }), 90);
  const r = mulberry32(p.price), dm = new THREE.Object3D();
  for (let i = 0; i < 90; i++) {
    dm.position.set(-L / 2 + 0.03 + r() * (L - 0.06), -H / 2 + 0.012 + r() * (H - 0.024), 0.0011);
    dm.rotation.z = r() < 0.5 ? 0 : Math.PI / 2;
    dm.updateMatrix(); smd.setMatrixAt(i, dm.matrix);
  }
  pcb.add(smd);
  add(pcb, rbox(0.022, 0.009, 0.01, 0.0012), std('#fff', { map: pwrTex(), roughness: 0.5 }), L / 2 - 0.045, H / 2 + 0.001, 0.006);

  // паста на кристалле
  const pasteOld = add(pcb, cyl(0.011, 0.011, 0.0008, 24), std('#fff', { map: crackTex(), roughness: 0.9 }), dieX, dieY, 0.0034, Math.PI / 2);
  const pasteNew = add(pcb, new THREE.SphereGeometry(0.0095, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), phys('#b9bcc2', { roughness: 0.25, clearcoat: 0.6 }), dieX, dieY, 0.003, Math.PI / 2);
  pasteNew.scale.set(1, 0.18, 1);
  pasteOld.visible = false;
  pasteOld.userData.keep = true; pasteNew.userData.keep = true;

  // ── радиатор ───────────────────────────────────────────────────────────
  add(heat, box(0.05, 0.05, 0.003), metal('#c87a4c', 0.25), dieX, dieY, 0.0048);
  const finCount = Math.round((L - 0.02) / 0.0034);
  const fins = new THREE.InstancedMesh(box(0.0007, H - 0.014, hsT), metal('#c9cdd3', 0.32), finCount);
  for (let i = 0; i < finCount; i++) { dm.position.set(-L / 2 + 0.012 + i * 0.0034, -0.002, 0.0065 + hsT / 2); dm.rotation.set(0, 0, 0); dm.updateMatrix(); fins.setMatrixAt(i, dm.matrix); }
  fins.castShadow = true; heat.add(fins);
  const copper = metal('#c87a4c', 0.26);
  const pipes = big ? 4 : 3;
  for (let i = 0; i < pipes; i++) {
    // Трубки не длиннее самой карты: на короткой RTX 3050 (170 мм) они раньше
    // торчали за торец петлями, и карта выглядела сломанной.
    const x0 = Math.max(-L / 2 + 0.015, dieX - 0.02 + i * 0.012), z = 0.008 + i * 0.004;
    const span = Math.max(0.02, Math.min(0.07 + i * 0.03, L / 2 - 0.014 - x0));
    const y0 = H / 2 - 0.02, top = H / 2 + 0.004 + i * 0.0015;
    tube(heat, [V(x0, y0, z), V(x0, top - 0.006, z), V(x0 + 0.006, top, z), V(x0 + span - 0.006, top, z), V(x0 + span, top - 0.006, z), V(x0 + span, y0, z)], 0.0028, copper, 40, 8);
  }
  const dFins = makeDust(L - 0.02, hsT * 0.9);
  dFins.position.set(0, H / 2 - 0.006, 0.0065 + hsT / 2); dFins.rotation.x = -Math.PI / 2;
  heat.add(dFins); dust.push(dFins);

  // ── кожух ──────────────────────────────────────────────────────────────
  const shroudZ = 0.0065 + hsT + 0.0045;
  const main = st.metal ? std(p.look.main, { metalness: 0.65, roughness: 0.34 }) : phys(p.look.main, { roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.4 });
  const acc = phys(p.look.accent, { roughness: 0.38, clearcoat: 0.4 });
  const top = 0.006;
  const n = p.fans;
  const spacing = (L - 0.03) / n;
  const R = Math.min(H * 0.4, spacing / 2 - 0.004);
  const sh = shroudShape(st, L, H - 0.004);
  const fx: number[] = [];
  for (let i = 0; i < n; i++) { const x = -((n - 1) / 2) * spacing + i * spacing + 0.006; fx.push(x); sh.holes.push(circ(x, 0, R + 0.004)); }
  add(front, extrude(sh, 0.007, 0.0024, 24), main, 0, 0, shroudZ);
  const az = shroudZ + top;
  // ── фирменный рисунок модели ──
  if (st.accent === 'between' || st.accent === 'diag') {
    const wide = st.accent === 'diag' ? 0.013 : 0.008;
    const m = st.rgb === 'diag' ? rgbMatH() : acc;
    for (let i = 0; i < n - 1; i++) {
      const cx = (fx[i] + fx[i + 1]) / 2;
      add(front, extrude(polyShape([[cx - wide, -H * 0.45], [cx + wide * 0.5, -H * 0.45], [cx + wide, H * 0.45], [cx - wide * 0.5, H * 0.45]]), 0.002, 0.0008, 4), m, 0, 0, az + 0.0002);
    }
  }
  if (st.accent === 'stripes' || st.accent === 'between') {
    add(front, rbox(L * 0.55, 0.005, 0.0025, 0.0012), acc, -L * 0.15, -H / 2 + 0.008, az);
    add(front, rbox(L * 0.2, 0.005, 0.0025, 0.0012), acc, L * 0.33, H / 2 - 0.008, az);
  }
  if (st.accent === 'stripes') add(front, rbox(L * 0.8, 0.0025, 0.0022, 0.001), acc, 0, -H / 2 + 0.015, az);
  if (st.accent === 'edge') {
    // цветная «кромка» на торце карты и тонкая полоса вдоль низа
    add(front, extrude(polyShape([[L / 2 - 0.03, -H / 2 + 0.003], [L / 2 - 0.016, -H / 2 + 0.003], [L / 2 - 0.004, -H / 2 + 0.02], [L / 2 - 0.004, H / 2 - 0.02], [L / 2 - 0.016, H / 2 - 0.003], [L / 2 - 0.03, H / 2 - 0.003]]), 0.002, 0.0008, 4), acc, 0, 0, az);
    add(front, rbox(L * 0.6, 0.004, 0.0022, 0.001), acc, -L * 0.12, -H / 2 + 0.007, az);
  }
  if (st.accent === 'grille') {
    // решётка между вентиляторами — как у XFX
    const g = canvasTex(64, 256, (c, w, h) => { c.fillStyle = '#121418'; c.fillRect(0, 0, w, h); c.fillStyle = '#2c3038'; for (let y = 6; y < h; y += 10) for (let x = 6 + ((y / 10) % 2) * 5; x < w; x += 10) { c.beginPath(); c.arc(x, y, 3, 0, 6.28); c.fill(); } });
    for (let i = 0; i < n - 1; i++) {
      const cx = (fx[i] + fx[i + 1]) / 2;
      add(front, rbox(0.024, H * 0.86, 0.0022, 0.002), std('#fff', { map: g, roughness: 0.6 }), cx, 0, az);
      add(front, rbox(0.003, H * 0.86, 0.0026, 0.001), acc, cx - 0.0135, 0, az);
    }
  }
  if (st.accent === 'facets') {
    // приподнятые грани по углам и тонкая линия-акцент: «рубленый» стиль
    const faceM = st.metal ? std(shade(p.look.main, 1.25), { metalness: 0.6, roughness: 0.3 }) : phys(shade(p.look.main, 1.2), { roughness: 0.38, clearcoat: 0.4 });
    add(front, extrude(polyShape([[-L / 2 + 0.004, H / 2 - 0.016], [-L / 2 + 0.05, H / 2 - 0.016], [-L / 2 + 0.03, -H / 2 + 0.03], [-L / 2 + 0.004, -H / 2 + 0.03]]), 0.003, 0.0008, 4), faceM, 0, 0, az);
    add(front, extrude(polyShape([[L / 2 - 0.004, -H / 2 + 0.032], [L / 2 - 0.04, -H / 2 + 0.006], [L / 2 - 0.004, -H / 2 + 0.006]]), 0.003, 0.0008, 4), faceM, 0, 0, az);
    add(front, rbox(L * 0.7, 0.0022, 0.002, 0.0008), acc, 0.01, H / 2 - 0.009, az + 0.001);
    for (let i = 0; i < n - 1; i++) add(front, rbox(0.0025, H * 0.7, 0.0022, 0.001), acc, (fx[i] + fx[i + 1]) / 2, 0, az);
  }
  if (st.screws) {
    const hx = metal('#9aa0a8', 0.3);
    for (const [x, y] of [[-L / 2 + 0.012, H / 2 - 0.014], [-L / 2 + 0.012, -H / 2 + 0.014], [L / 2 - 0.012, H / 2 - 0.014], [L / 2 - 0.02, -H / 2 + 0.01], [0, H / 2 - 0.01], [0, -H / 2 + 0.01]]) add(front, cyl(0.0028, 0.0028, 0.0016, 6), hx, x, y, az + 0.0008, Math.PI / 2);
  }
  const trim = st.rgb === 'ring' ? rgbMatH() : std(st.ring, { roughness: 0.4, metalness: st.metal ? 0.5 : 0 });
  const logo = hubTex(p.brand, st.hub, st.hub === '#e9e8e4' || st.hub === '#d8d9dc' ? '#2a2f3a' : '#f6e9da', st.ring);
  for (const x of fx) {
    add(front, new THREE.TorusGeometry(R + 0.0042, st.rgb === 'ring' ? 0.003 : 0.0022, 8, 56), trim, x, 0, shroudZ + 0.0048);
    const f = buildFan({ R, logo, n: st.blades, blade: st.blade, hub: st.hub, sweep: st.sweep, w0: st.w0, w1: st.w1 });
    f.group.position.set(x, 0, shroudZ - 0.004);
    front.add(f.group); fans.push(f);
    const d = makeDust(R * 2.1, R * 2.1);
    d.position.set(x, 0, shroudZ + 0.0062);
    front.add(d); dust.push(d);
  }
  add(front, rbox(L - 0.014, 0.004, hsT + 0.006, 0.0015), main, 0, H / 2 - 0.002, 0.0065 + hsT / 2 + 0.002);
  // логотип на торце — с подсветкой, как у настоящих карт: загорается при тесте
  const tt = topTex(p, p.look.main);
  decal(front, 0.11, 0.0138, tt, -L / 2 + 0.075, H / 2 + 0.0003, 0.0065 + hsT / 2 + 0.002, -Math.PI / 2, 0, 0, { emissive: '#ffffff', emissiveMap: tt, emissiveIntensity: 0.9 });
  if (st.rgb === 'top' || st.rgb === 'ring') add(front, rbox(st.rgb === 'ring' ? L * 0.5 : 0.075, 0.0032, 0.0045, 0.0012), rgbMatH(), L / 2 - (st.rgb === 'ring' ? L * 0.3 : 0.09), H / 2 + 0.0007, 0.0065 + hsT / 2 + 0.002);

  // ── бэкплейт (у бюджетных карт его нет — видна изнанка платы) ───────────
  if (st.plateBack !== false) {
    add(back, rbox(L - 0.006, H - 0.004, 0.0022, 0.002), std(st.metal ? shade(p.look.main, 0.8) : '#2a2d35', { metalness: 0.65, roughness: 0.42 }), 0, 0, -0.0035);
    decal(back, L - 0.02, ((L - 0.02) * 410) / 1024, backTex(p), 0, 0, -0.0048, 0, Math.PI, 0, { metalness: 0.3 });
  } else {
    add(back, rbox(L - 0.012, H - 0.006, 0.0006, 0.0003, 1), std('#fff', { map: pcbTex(), roughness: 0.55 }), 0.004, 0, -0.0012);
  }
  const screwM = metal('#8d939c', 0.3);
  for (const [dx, dy] of [[-0.024, 0.024], [-0.024, -0.024], [0.024, 0.024], [0.024, -0.024]]) {
    const s = add(back, cyl(0.0032, 0.0032, 0.0016, 16), screwM, dieX + dx, dieY + dy, -0.0052, Math.PI / 2);
    add(s, box(0.004, 0.0018, 0.0006), std('#3a3d44'), 0, 0.0008, 0);
    screws.push(s);
  }

  // ── планка ─────────────────────────────────────────────────────────────
  const steel = metal('#b9bec6');
  const slotW = big ? 0.05 : 0.04;
  add(pcb, rbox(0.0012, 0.124, slotW, 0.0004, 1), steel, -L / 2 - 0.001, -0.003, slotW / 2 - 0.006);
  add(pcb, rbox(0.012, 0.0012, slotW, 0.0004, 1), steel, -L / 2 + 0.005, 0.0585, slotW / 2 - 0.006);
  /*
   * Выходы на мониторы — рисунком на наружной стороне планки (3×DisplayPort +
   * HDMI) и с лёгким самосвечением: сзади корпуса планка всегда в тени, и
   * объёмные чёрные коробочки портов там просто не читались.
   */
  const zc = slotW / 2 - 0.006, PH = 0.124;
  const ioT = memo('gpuio' + slotW, () => canvasTex(128, 320, (c, w, h) => {
    c.fillStyle = '#c3c8cf'; c.fillRect(0, 0, w, h);
    const u = (z: number) => (0.5 + (z - zc) / slotW) * w, v = (y: number) => (1 - (0.5 + (y + 0.003) / PH)) * h;
    [-0.05, -0.033, -0.016, 0.001].forEach((y, i) => {
      const cx = u(0.004), cy = v(y), pw = 26, ph = 38;
      c.fillStyle = '#2a2d33'; c.fillRect(cx - pw / 2 - 3, cy - ph / 2 - 3, pw + 6, ph + 6);
      c.fillStyle = '#0c0d10'; c.beginPath();
      if (i === 3) { c.moveTo(cx - pw / 2, cy - ph / 2); c.lineTo(cx + pw / 2, cy - ph / 2); c.lineTo(cx + pw / 2, cy + ph / 2 - 6); c.lineTo(cx + pw / 2 - 6, cy + ph / 2); c.lineTo(cx - pw / 2 + 6, cy + ph / 2); c.lineTo(cx - pw / 2, cy + ph / 2 - 6); }
      else { c.moveTo(cx - pw / 2, cy - ph / 2); c.lineTo(cx + pw / 2, cy - ph / 2); c.lineTo(cx + pw / 2, cy + ph / 2); c.lineTo(cx - pw / 2 + 8, cy + ph / 2); c.lineTo(cx - pw / 2, cy + ph / 2 - 8); }
      c.closePath(); c.fill();
      c.fillStyle = '#c9a54a'; c.fillRect(cx - 3, cy - ph / 2 + 6, 6, ph - 12);
    });
    // вентиляционные прорези в планке
    c.fillStyle = '#1b1d22';
    for (let k = 0; k < 9; k++) c.fillRect(u(0.02) - 14, v(0.058) + 10 + k * 14, 28, 7);
  }));
  const ioM = new THREE.MeshStandardMaterial({ map: ioT, emissive: '#ffffff', emissiveMap: ioT, emissiveIntensity: 0.22, metalness: 0.5, roughness: 0.4 });
  add(pcb, new THREE.PlaneGeometry(slotW, PH), ioM, -L / 2 - 0.0018, -0.003, zc, 0, -Math.PI / 2, 0, false);
  for (let i = 0; i < 5; i++) add(pcb, rbox(0.0016, 0.0045, 0.016, 0.001), std('#14161b'), -L / 2 - 0.0018, 0.014 + i * 0.0085, 0.02);

  mergeTree(group);
  const T = shroudZ + 0.008;
  const model: GpuModel = {
    group, front, heat, back, pcb, fans, screws, dust, L, H, T,
    finger: V(-L / 2 + 0.065, -H / 2 - 0.004, 0),
    explode(t: number) {
      front.position.z = t * 0.09;
      heat.position.z = t * 0.045;
      back.position.z = -t * 0.035;
    },
    setPaste(state) {
      pasteOld.visible = state === 'old';
      pasteNew.visible = state === 'new';
    },
    update(dt: number, spin: boolean) {
      if (spin) fans.forEach((f, i) => { f.rotor.rotation.z -= dt * (6 + i * 0.4); });
    },
  };
  model.setPaste('new');
  return model;
}
