import * as THREE from 'three';
import { add, std, phys, own, rbox, box, cyl, sph, canvasTex, mulberry32, V, TAU } from './kit.ts';

/**
 * Окружение ларька в спальном районе и в деловом центре.
 *
 * Раскладка улицы у всех районов одна (тротуар перед ларьком, бордюр,
 * пространство до задника на z≈−21): прохожие ходят по тем же линиям, а
 * камера окна видит ту же глубину. Меняется «одежда»: земля, деревья,
 * машины, дворовая мелочь и рисованный задник (Codex).
 *
 * Всё статичное: группа потом склеивается mergeTree в десяток вызовов.
 */

export interface DistrictSet { lamps: THREE.PointLight[]; bulbs: THREE.MeshStandardMaterial[] }

/** Рисованный задник района: две панели (вторая зеркальная), без света, с дымкой. */
export function backdrop(g: THREE.Group, file: string, tint = '#b3aca2'): void {
  const t = new THREE.TextureLoader().load(file);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshBasicMaterial({ map: t, color: tint, transparent: true, alphaTest: 0.35, depthWrite: true, fog: true });
  const m2 = m.clone(); m2.map = t.clone(); m2.map.wrapS = THREE.RepeatWrapping; m2.map.repeat.x = -1; m2.map.needsUpdate = true;
  // прямые и зеркальные копии по очереди — без обрыва по краям
  for (let k = -5; k <= 6; k++) {
    const mm = k % 2 === 0 ? m : m2;
    const p = add(g, new THREE.PlaneGeometry(29, 10.9), mm, -13.5 + k * 28.98, 10.9 / 2 - 0.5, -21 - (Math.abs(k) % 2) * 0.02, 0, 0, 0, false);
    p.receiveShadow = false; p.userData.keep = true;
  }
}

function flat(m: THREE.Mesh): THREE.Mesh { m.castShadow = false; return m; }

/** Тротуар перед ларьком и бордюр — как в парке, но своя плитка. */
function frontWalk(g: THREE.Group, tile: THREE.Texture): void {
  const t = tile.clone(); t.needsUpdate = true; t.repeat.set(24, 1.4);
  flat(add(g, new THREE.PlaneGeometry(60, 3.2), std('#fff', { map: t, roughness: 0.85 }), 0, 0.005, -1.9, -Math.PI / 2));
  add(g, box(60, 0.1, 0.18), std('#9e9a92', { roughness: 0.8 }), 0, 0.05, -3.55);
}

function tiles(r: () => number, base: string, line: string, size = 64): THREE.CanvasTexture {
  return canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    c.strokeStyle = line; c.lineWidth = 3;
    for (let y = 0; y <= h; y += size) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    for (let x = 0; x <= w; x += size) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(60,60,60,${(r() * 0.12).toFixed(3)})`; c.fillRect(r() * w, r() * h, 3, 3); }
  }, { repeat: true });
}

function asphalt(r: () => number, marks: boolean): THREE.CanvasTexture {
  return canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#55585d'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) { c.fillStyle = `rgba(255,255,255,${(r() * 0.07).toFixed(3)})`; c.fillRect(r() * w, r() * h, 2, 2); }
    // трещины и заплатки — двор, а не проспект
    c.strokeStyle = 'rgba(30,30,32,.5)'; c.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) { c.beginPath(); let x = r() * w, y = r() * h; c.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 30; y += (r() - 0.5) * 20; c.lineTo(x, y); } c.stroke(); }
    if (marks) { c.fillStyle = '#e8e2cf'; for (let x = 0; x < w; x += 64) c.fillRect(x, h / 2 - 2, 36, 4); }
  }, { repeat: true });
}

function grass(r: () => number, base: string): THREE.CanvasTexture {
  return canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { c.fillStyle = r() < 0.5 ? 'rgba(80,130,55,.45)' : 'rgba(150,190,100,.35)'; c.fillRect(r() * w, r() * h, 2, 4); }
  }, { repeat: true });
}

/** Легковушка вдоль оси X: кузов, кабина со стёклами, колёса, фары. */
function car(color: string): THREE.Group {
  const g = new THREE.Group();
  const paint = phys(color, { roughness: 0.35, clearcoat: 0.6 });
  const glass = std('#2b3644', { roughness: 0.15, metalness: 0.4 });
  const tyre = std('#1b1c1f', { roughness: 0.9 });
  add(g, rbox(1.75, 0.42, 0.82, 0.12), paint, 0, 0.38, 0);
  add(g, rbox(1.0, 0.36, 0.76, 0.12), paint, -0.08, 0.74, 0);
  add(g, rbox(0.9, 0.3, 0.78, 0.1), glass, -0.08, 0.75, 0);
  for (const x of [-0.56, 0.56]) for (const z of [-0.38, 0.38]) add(g, cyl(0.17, 0.17, 0.12, 16), tyre, x, 0.17, z, Math.PI / 2);
  for (const z of [-0.26, 0.26]) { add(g, box(0.02, 0.07, 0.16), std('#fff6dc', { emissive: '#fff1c8', emissiveIntensity: 0.3 }), 0.88, 0.45, z); add(g, box(0.02, 0.06, 0.14), std('#c8372d'), -0.88, 0.45, z); }
  return g;
}

/** Берёза: белый ствол с чёрными чёрточками и светлая лёгкая крона. */
function birch(r: () => number, _i: number): THREE.Group {
  const g = new THREE.Group();
  const h = 2.2 + r() * 1.6;
  add(g, cyl(0.06, 0.1, h, 10), std('#ece8df', { roughness: 0.8 }), 0, h / 2, 0);
  for (let k = 0; k < 7; k++) add(g, box(0.08, 0.025, 0.02), std('#2a2a2a'), Math.cos(k * 2.1) * 0.07, 0.4 + k * (h / 8), Math.sin(k * 2.1) * 0.07, 0, k * 2.1, 0, false);
  const leaf = [std('#a3d05a', { roughness: 0.85, flatShading: true }), std('#82b545', { roughness: 0.85, flatShading: true })];
  for (let k = 0; k < 6; k++) {
    const a = r() * TAU, d = r() * 0.45;
    add(g, new THREE.IcosahedronGeometry(0.38 + r() * 0.25, 1), leaf[k % 2], Math.cos(a) * d, h + r() * 0.8 - 0.1, Math.sin(a) * d, r(), r(), 0).scale.y = 1.2;
  }
  return g;
}

function bench(): THREE.Group {
  const g = new THREE.Group();
  const wood = std('#9c6a3e', { roughness: 0.7 }), iron = std('#2f3238', { roughness: 0.5, metalness: 0.5 });
  for (let i = 0; i < 3; i++) add(g, rbox(1.5, 0.04, 0.12, 0.01), wood, 0, 0.45, -0.14 + i * 0.14);
  add(g, rbox(1.5, 0.11, 0.035, 0.01), wood, 0, 0.7, -0.26, -0.2, 0, 0);
  for (const x of [-0.65, 0.65]) add(g, rbox(0.05, 0.45, 0.42, 0.01), iron, x, 0.225, -0.05);
  return g;
}

function lamp(set: DistrictSet, modern: boolean): THREE.Group {
  const g = new THREE.Group();
  const iron = std(modern ? '#3a3d44' : '#5f6368', { roughness: 0.45, metalness: modern ? 0.6 : 0.2 });
  const bulb = own('#fff4d6', { emissive: '#ffcf8a', emissiveIntensity: 0 });
  if (modern) {
    add(g, cyl(0.04, 0.05, 4.2, 10), iron, 0, 2.1, 0);
    add(g, rbox(0.7, 0.06, 0.18, 0.02), iron, 0.3, 4.2, 0);
    add(g, box(0.55, 0.02, 0.12), bulb, 0.32, 4.16, 0);
  } else {
    // бетонный столб с «коброй» — как во дворах
    add(g, cyl(0.07, 0.1, 4.0, 8), iron, 0, 2.0, 0);
    add(g, cyl(0.025, 0.025, 0.9, 6), iron, 0.4, 3.95, 0, 0, 0, Math.PI / 2 - 0.25);
    add(g, rbox(0.36, 0.08, 0.18, 0.04), std('#44474d'), 0.82, 4.03, 0);
    add(g, box(0.3, 0.02, 0.14), bulb, 0.82, 3.98, 0);
  }
  set.bulbs.push(bulb);
  set.lamps.push(new THREE.PointLight('#ffc88a', 0, 9, 2));
  return g;
}

/* ─────────────────────────────── спальный район ─────────────────────────────── */

export function buildBlock(g: THREE.Group): DistrictSet {
  const set: DistrictSet = { lamps: [], bulbs: [] };
  const r = mulberry32(3131);
  const gr = grass(r, '#77985a'); gr.repeat.set(40, 40);
  flat(add(g, new THREE.PlaneGeometry(110, 110), std('#fff', { map: gr, roughness: 0.95 }), 0, 0, -8, -Math.PI / 2));
  frontWalk(g, tiles(r, '#b9b3a8', '#9a948a'));
  // внутридомовой проезд с парковкой
  const asp = asphalt(r, false); asp.repeat.set(14, 1);
  flat(add(g, new THREE.PlaneGeometry(60, 4), std('#fff', { map: asp, roughness: 0.92 }), 0, 0.004, -6.2, -Math.PI / 2));
  add(g, box(60, 0.12, 0.16), std('#a7a29a', { roughness: 0.8 }), 0, 0.06, -8.25);
  // разметка парковочных мест
  for (let i = 0; i < 14; i++) add(g, box(0.06, 0.005, 1.6), std('#e8e2cf'), -12 + i * 2.2, 0.009, -7.2, 0, 0, 0, false);
  const colors = ['#d8d4cc', '#3d63a8', '#c8372d', '#6a9a4f', '#e2a93a', '#8a8f99', '#ffffff'];
  for (const [x, ci] of [[-9.9, 0], [-7.7, 1], [-3.3, 2], [5.5, 3], [7.7, 4], [9.9, 5], [12.1, 6]] as const) {
    const c = car(colors[ci]); c.position.set(x, 0, -7.1); c.rotation.y = Math.PI / 2 + (r() - 0.5) * 0.08; g.add(c);
  }
  // низкий заборчик-«дуги» вдоль газона
  const fence = std('#2f6a5a', { roughness: 0.6, metalness: 0.3 });
  for (let x = -24; x < 24; x += 0.5) { if (Math.abs(x - 1.2) < 1.2) continue; add(g, new THREE.TorusGeometry(0.25, 0.012, 4, 10, Math.PI), fence, x, 0, -3.9, 0, 0, 0, false); }
  // детская площадка
  const pad = add(g, new THREE.CircleGeometry(3.2, 40), std('#c9573e', { roughness: 0.95 }), -4.5, 0.007, -12.5, -Math.PI / 2); flat(pad);
  const red = std('#d8432f', { roughness: 0.5 }), yel = std('#f2c94c', { roughness: 0.5 }), blu = std('#3b7bd0', { roughness: 0.5 }), post = std('#3a6fb0', { roughness: 0.5, metalness: 0.3 });
  // горка
  for (const [x, z] of [[-5.6, -12.1], [-5.6, -12.9], [-4.8, -12.1], [-4.8, -12.9]] as const) add(g, cyl(0.04, 0.04, 1.4, 8), post, x, 0.7, z);
  add(g, box(0.9, 0.06, 0.9), yel, -5.2, 1.0, -12.5);
  add(g, new THREE.ConeGeometry(0.75, 0.6, 4), red, -5.2, 1.7, -12.5, 0, Math.PI / 4, 0);
  add(g, box(1.9, 0.05, 0.5), blu, -3.65, 0.55, -12.5, 0, 0, 0.5);
  // качели
  for (const x of [-2.6, -1.0]) { add(g, cyl(0.035, 0.035, 2.0, 8), post, x, 0.95, -14.2, 0.35, 0, 0); add(g, cyl(0.035, 0.035, 2.0, 8), post, x, 0.95, -15.0, -0.35, 0, 0); }
  add(g, cyl(0.04, 0.04, 1.7, 8), post, -1.8, 1.88, -14.6, 0, 0, Math.PI / 2);
  for (const x of [-2.2, -1.4]) { add(g, box(0.4, 0.04, 0.18), yel, x, 0.45, -14.6); for (const d of [-0.18, 0.18]) add(g, cyl(0.006, 0.006, 1.4, 4), post, x + d, 1.16, -14.6, 0, 0, 0, false); }
  // песочница
  add(g, box(1.6, 0.25, 0.08), std('#b07a48'), -6.6, 0.12, -10.9); add(g, box(1.6, 0.25, 0.08), std('#b07a48'), -6.6, 0.12, -12.4);
  add(g, box(0.08, 0.25, 1.5), std('#b07a48'), -7.4, 0.12, -11.65); add(g, box(0.08, 0.25, 1.5), std('#b07a48'), -5.8, 0.12, -11.65);
  flat(add(g, new THREE.PlaneGeometry(1.5, 1.4), std('#e3cc93', { roughness: 1 }), -6.6, 0.16, -11.65, -Math.PI / 2));
  // контейнерная площадка
  for (let i = 0; i < 3; i++) { add(g, rbox(1.1, 0.95, 0.8, 0.06), std('#3f7d4f', { roughness: 0.6 }), 8 + i * 1.25, 0.48, -10.2); add(g, rbox(1.15, 0.06, 0.85, 0.02), std('#2e5f3c'), 8 + i * 1.25, 0.98, -10.2); }
  // берёзы и тополя, кусты сирени
  for (let i = 0; i < 30; i++) {
    const x = -24 + r() * 48, z = -9 - r() * 11;
    if (x > -8 && x < 1 && z > -16 && z < -9) continue; // площадка
    if (x > 6.5 && x < 12 && z > -11.5) continue;
    if (x > -2 && x < 4 && z > -16) continue; // прямо перед окном — вид на дома
    const t = birch(r, i); t.position.set(x, 0, z); t.scale.setScalar(0.9 + r() * 0.4); g.add(t);
  }
  const lilac = [std('#b08fd8', { roughness: 0.85, flatShading: true }), std('#78b23e', { roughness: 0.85, flatShading: true })];
  // сирень обходит лавочки и фонари вдоль газона
  const busy: [number, number][] = [[-6, -4.4], [6.5, -4.4], [-7.5, -4.3], [7.0, -4.3], [15, -4.3]];
  for (let i = 0; i < 16; i++) {
    const x = -20 + r() * 40, z = -4.6 - r() * 0.6;
    if (Math.abs(x - 1.2) < 2 || busy.some(([bx, bz]) => Math.hypot(x - bx, z - bz) < 1.4)) continue;
    busy.push([x, z]);
    const b = new THREE.Group(); b.position.set(x, 0, z); g.add(b);
    for (let k = 0; k < 5; k++) add(b, new THREE.IcosahedronGeometry(0.28 + r() * 0.12, 1), lilac[k < 2 ? 0 : 1], (r() - 0.5) * 0.6, 0.35 + r() * 0.3, (r() - 0.5) * 0.4);
  }
  for (const [x, z] of [[-6, -4.4], [6.5, -4.4], [-12, -9.2], [4, -9.2]] as const) { const b = bench(); b.position.set(x, 0, z); g.add(b); }
  for (const x of [-7.5, 7.0, 15]) { const L = lamp(set, false); L.position.set(x, 0, -4.3); g.add(L); }
  backdrop(g, 'assets/tex/street_block.webp');
  return set;
}

/* ─────────────────────────────── деловой центр ─────────────────────────────── */

export function buildCenter(g: THREE.Group): DistrictSet {
  const set: DistrictSet = { lamps: [], bulbs: [] };
  const r = mulberry32(4242);
  const plaza = tiles(r, '#b8b6b0', '#9d9b95', 32); plaza.repeat.set(55, 55);
  flat(add(g, new THREE.PlaneGeometry(110, 110), std('#fff', { map: plaza, roughness: 0.8 }), 0, 0, -8, -Math.PI / 2));
  frontWalk(g, tiles(r, '#c9c5bd', '#a9a59d'));
  // проспект с зеброй
  const asp = asphalt(r, true); asp.repeat.set(16, 1);
  flat(add(g, new THREE.PlaneGeometry(80, 6), std('#fff', { map: asp, roughness: 0.9 }), 0, 0.004, -7.0, -Math.PI / 2));
  add(g, box(80, 0.12, 0.16), std('#a7a29a', { roughness: 0.8 }), 0, 0.06, -10.05);
  for (let i = 0; i < 9; i++) add(g, box(0.45, 0.006, 4.4), std('#ece8dc'), -7.5 + (i - 4) * 0.8, 0.008, -7.0, 0, 0, 0, false);
  const colors = ['#1b1d22', '#e9e7e1', '#f2c230', '#8a8f99', '#2d4a7a'];
  for (const [x, z, ci, ry] of [[-11, -5.6, 0, 0], [-6.5, -5.6, 1, 0], [7.5, -8.4, 2, Math.PI], [12.5, -8.4, 3, Math.PI], [16.5, -5.6, 4, 0]] as const) {
    const c = car(colors[ci]); c.position.set(x, 0, z); c.rotation.y = ry; g.add(c);
  }
  // столбики вдоль бордюра
  const bol = std('#3a3d44', { roughness: 0.4, metalness: 0.6 });
  for (let x = -22; x <= 22; x += 1.6) { if (Math.abs(x - 1.2) < 1.6) continue; add(g, cyl(0.06, 0.07, 0.6, 10), bol, x, 0.3, -3.85); }
  // кадки с подстриженными деревьями
  const conc = std('#b5b1a8', { roughness: 0.85 }), crown = std('#4f8040', { roughness: 0.8 }), crown2 = std('#5f924c', { roughness: 0.8 });
  for (let i = 0; i < 12; i++) {
    const x = -20 + i * 3.6; if (Math.abs(x - 1.5) < 2) continue;
    const z = -11.6 - (i % 2) * 0.4;
    add(g, rbox(1.1, 0.55, 1.1, 0.04), conc, x, 0.28, z);
    add(g, cyl(0.06, 0.08, 1.6, 8), std('#5b4231'), x, 1.3, z);
    add(g, sph(0.75, 16, 12), i % 2 ? crown : crown2, x, 2.4, z).scale.set(1, 0.9, 1);
  }
  // остановка со стеклянным павильоном
  const frame = std('#30343b', { roughness: 0.4, metalness: 0.6 });
  const glass = phys('#bcd8e8', { roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1 });
  const stop = new THREE.Group(); stop.position.set(-8.5, 0, -11.2); g.add(stop);
  for (const x of [-1.4, 1.4]) add(stop, box(0.06, 2.4, 0.06), frame, x, 1.2, -0.5);
  add(stop, box(3.0, 0.08, 1.3), frame, 0, 2.42, -0.1);
  add(stop, box(2.8, 1.9, 0.02), glass, 0, 1.25, -0.55, 0, 0, 0, false);
  add(stop, box(0.02, 1.9, 1.0), glass, -1.4, 1.25, -0.05, 0, 0, 0, false);
  add(stop, rbox(1.8, 0.06, 0.4, 0.01), std('#9c6a3e'), 0, 0.48, -0.3);
  add(stop, box(0.9, 1.4, 0.04), std('#f2c230', { emissive: '#f2c230', emissiveIntensity: 0.15 }), 0.9, 1.4, -0.52);
  // велопарковка
  for (let i = 0; i < 5; i++) add(g, new THREE.TorusGeometry(0.35, 0.025, 6, 16, Math.PI), bol, 5.5 + i * 0.5, 0, -11.0, 0, Math.PI / 2, 0);
  // арт-объект: кольцо на постаменте (вместо фонтана парка)
  add(g, rbox(1.6, 0.5, 1.6, 0.05), conc, 1.8, 0.25, -15);
  add(g, new THREE.TorusGeometry(1.0, 0.12, 12, 48), std('#c8cdd4', { metalness: 0.9, roughness: 0.25 }), 1.8, 1.55, -15, 0, 0.6, 0);
  for (const x of [-12, -3.5, 6, 14]) { const L = lamp(set, true); L.position.set(x, 0, -4.2); g.add(L); }
  backdrop(g, 'assets/tex/street_center.webp', '#b8b4ae');
  void V;
  return set;
}
