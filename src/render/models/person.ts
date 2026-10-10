import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import type { PersonLook } from '../../logic/customers.ts';
import { add, std, phys, own, rbox, sph, cyl, canvasTex, tube, capsuleBetween, noiseDisplace, blob, mulberry32, shade, mergeTree, bakeVertexColors, V, V2, TAU, Q, setDetail } from '../kit.ts';

/**
 * Клиент: «глиняный» человечек со скелетом и процедурной анимацией.
 *
 * Уроки пробника, которые тут зашиты:
 *  - голова — ОДНА деформированная сфера; щёки и румянец в её форме и цвете
 *    вершин, а не отдельными шариками (они торчали «как прыщи»);
 *  - рот — наклейка DecalGeometry, ложится ровно по лицу и меняет выражение
 *    сменой картинки;
 *  - кисть — ладонь и сомкнутые пальцы с суставами, большой палец отдельно;
 *  - наклон корпуса вперёд уводит руки НАЗАД — в позе «облокотился»
 *    угол плеча это учитывает.
 */

export type Mood = 'smile' | 'talk' | 'closed' | 'sad' | 'wow';

function mouthTex(kind: Mood): THREE.Texture {
  return canvasTex(512, 256, (g) => {
    g.clearRect(0, 0, 512, 256);
    const lip = '#b8574f', inside = '#5a1a22';
    g.lineJoin = 'round'; g.lineCap = 'round';
    if (kind === 'closed') { g.strokeStyle = '#8a3434'; g.lineWidth = 16; g.beginPath(); g.moveTo(160, 100); g.quadraticCurveTo(256, 170, 352, 100); g.stroke(); return; }
    if (kind === 'sad') { g.strokeStyle = '#8a3434'; g.lineWidth = 16; g.beginPath(); g.moveTo(170, 160); g.quadraticCurveTo(256, 100, 342, 160); g.stroke(); return; }
    const path = () => {
      g.beginPath();
      if (kind === 'smile') { g.moveTo(120, 78); g.quadraticCurveTo(256, 104, 392, 78); g.bezierCurveTo(372, 210, 140, 210, 120, 78); }
      else if (kind === 'wow') g.ellipse(256, 128, 60, 74, 0, 0, TAU);
      else g.ellipse(256, 128, 78, 70, 0, 0, TAU);
      g.closePath();
    };
    path(); g.fillStyle = inside; g.fill();
    g.save(); path(); g.clip();
    g.fillStyle = '#fffaf4';
    if (kind === 'smile') { g.beginPath(); g.moveTo(110, 70); g.quadraticCurveTo(256, 98, 402, 70); g.lineTo(402, 108); g.quadraticCurveTo(256, 138, 110, 108); g.fill(); }
    else g.fillRect(150, 40, 212, 34);
    g.fillStyle = '#e0707a'; g.beginPath(); g.ellipse(256, kind === 'smile' ? 204 : 200, 100, 46, 0, 0, TAU); g.fill();
    g.restore();
    path(); g.strokeStyle = lip; g.lineWidth = 9; g.stroke();
  });
}
let MOUTH: Record<Mood, THREE.Texture> | null = null;
const mouths = () => (MOUTH ??= { smile: mouthTex('smile'), talk: mouthTex('talk'), closed: mouthTex('closed'), sad: mouthTex('sad'), wow: mouthTex('wow') });

function headGeometry(skin: string): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.28, Q(80, 4), Q(60, 3));
  g.rotateY(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute, n = V(), col: number[] = [];
  const skinC = new THREE.Color(skin), blushC = new THREE.Color(skin).lerp(new THREE.Color('#ee7a6c'), 0.55), c = new THREE.Color();
  const warmC = new THREE.Color(skin).lerp(new THREE.Color('#e0705a'), 0.4);
  for (let i = 0; i < p.count; i++) {
    n.fromBufferAttribute(p, i).normalize();
    const low = Math.max(0, -n.y);
    let x = n.x * 0.28 * (1 + 0.09 * low), z = n.z * 0.26 * (1 + 0.05 * low);
    const y = n.y * 0.27;
    const ch = Math.exp(-(((n.y + 0.3) ** 2) / 0.04 + ((Math.abs(n.x) - 0.48) ** 2) / 0.05)) * Math.max(0, n.z);
    x += Math.sign(n.x) * ch * 0.012; z += ch * 0.02;
    p.setXYZ(i, x, y, z);
    const b = Math.exp(-(((n.y + 0.2) ** 2) / 0.01 + ((Math.abs(n.x) - 0.55) ** 2) / 0.018)) * Math.max(0, n.z);
    c.copy(skinC).lerp(blushC, Math.min(1, b * 0.9));
    /*
     * Объём лица цветом вершин (разбор Codex: лица «пластиковые»): мягкая тень
     * в глазницах и под подбородком, светлее лоб, теплее виски у ушей.
     * Ничего не стоит — это те же цвета вершин, без нового света.
     */
    const sock = Math.exp(-(((n.y - 0.2) ** 2) / 0.012 + ((Math.abs(n.x) - 0.3) ** 2) / 0.02)) * Math.max(0, n.z);
    const chin = Math.max(0, -n.y - 0.45) * 1.6;
    const brow = Math.exp(-(((n.y - 0.5) ** 2) / 0.04 + (n.x ** 2) / 0.08)) * Math.max(0, n.z);
    const temple = Math.exp(-((Math.abs(n.x) - 0.92) ** 2) / 0.02) * Math.max(0, 1 - Math.abs(n.y) * 1.5);
    c.lerp(warmC, Math.min(1, temple * 0.35));
    c.multiplyScalar(1 - sock * 0.13 - Math.min(0.2, chin * 0.2) + brow * 0.06);
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function buildHand(s: number, mat: THREE.Material, simple = false): THREE.Group {
  const h = new THREE.Group();
  const fingers: { f: THREE.Group; k: THREE.Group }[] = [];
  add(h, rbox(0.05, 0.092, 0.094, 0.024, 3), mat, 0, -0.05, 0);
  const fz = [-0.032, -0.0107, 0.0107, 0.032], fl = [0.044, 0.052, 0.054, 0.046];
  if (simple) {
    // Прохожему вдали суставы пальцев не нужны: пальцы — неподвижные капсулы
    // прямо в кисти, и склейка превращает всю кисть в один вызов отрисовки.
    fz.forEach((z, i) => capsuleBetween(h, V(-s * 0.004, -0.09, z), V(-s * 0.012, -0.09 - fl[i], z), 0.0125, mat));
    capsuleBetween(h, V(-s * 0.01, -0.03, 0.044), V(-s * 0.024, -0.072, 0.06), 0.0145, mat);
    h.userData.curl = () => undefined;
    return h;
  }
  fz.forEach((z, i) => {
    const f = new THREE.Group(); f.position.set(0, -0.09, z); h.add(f);
    capsuleBetween(f, V(0, 0, 0), V(0, -fl[i] * 0.55, 0), 0.0128, mat);
    const k = new THREE.Group(); k.position.set(0, -fl[i] * 0.55, 0); f.add(k);
    capsuleBetween(k, V(0, 0, 0), V(0, -fl[i] * 0.45, 0), 0.0122, mat);
    fingers.push({ f, k });
  });
  const t = new THREE.Group(); t.position.set(-s * 0.01, -0.03, 0.044); h.add(t);
  capsuleBetween(t, V(0, 0, 0), V(-s * 0.014, -0.042, 0.016), 0.0145, mat);
  h.userData.curl = (a: number) => fingers.forEach(({ f, k }) => { f.rotation.z = -s * a * 0.55; k.rotation.z = -s * a * 0.85; });
  return h;
}

function buildShoe(color: string): THREE.Group {
  const g = new THREE.Group();
  const up = std(color, { roughness: 0.6 }), sole = std('#f6f4ef', { roughness: 0.5 }), acc = phys(shade(color, color === '#f3f1ec' ? 0.6 : 1.5), { roughness: 0.45 });
  add(g, rbox(0.13, 0.085, 0.25, 0.042), up, 0, -0.03, 0.05);
  add(g, rbox(0.138, 0.03, 0.268, 0.014), sole, 0, -0.082, 0.05);
  add(g, rbox(0.132, 0.03, 0.07, 0.012), acc, 0, -0.045, -0.05);
  for (let i = 0; i < 3; i++) add(g, rbox(0.07, 0.008, 0.012, 0.003), std('#fff'), 0, 0.014 - i * 0.004, 0.06 + i * 0.032, -0.35, 0, 0);
  return g;
}

function printTex(kind: PersonLook['print']): THREE.Texture | null {
  if (kind === 'none') return null;
  return canvasTex(320, 200, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    if (kind === 'pad') {
      // Пиксельный геймпад: рисунок целиком внутри холста — в пробнике он обрезался.
      const map = ['..XXXX....XXXX..', '.XXXXXXXXXXXXXX.', 'XXXbXXXXXXXXXyXX', 'XXbbbXXXXXXrXgXX', 'XXXbXXXXXXXXXcXX', 'XXXXXXX..XXXXXXX', 'XXXXXX....XXXXXX', '.XXXX......XXXX.'];
      const col: Record<string, string> = { X: '#2b2530', b: '#e9e4ea', y: '#f6d36b', r: '#ff6b6b', g: '#6be38a', c: '#5bc0ff' };
      const px = 19, ox = (w - 16 * px) / 2, oy = (h - 8 * px) / 2;
      map.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') { g.fillStyle = col[ch]; g.fillRect(ox + i * px, oy + j * px, px, px); } }));
    } else if (kind === 'btc') {
      g.fillStyle = '#4fa3ff'; g.beginPath(); g.arc(w / 2, h / 2, 94, 0, TAU); g.fill();
      g.strokeStyle = '#1b2a44'; g.lineWidth = 8; g.beginPath(); g.arc(w / 2, h / 2, 83, 0, TAU); g.stroke();
      g.fillStyle = '#1b2a44'; g.font = '900 120px Rubik'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('₿', w / 2, h / 2 + 6);
    } else if (kind === 'heart') {
      g.fillStyle = '#ff6b8a'; g.beginPath(); const x = w / 2, y = h / 2 - 10;
      g.moveTo(x, y + 85); g.bezierCurveTo(x - 150, y - 10, x - 70, y - 105, x, y - 40); g.bezierCurveTo(x + 70, y - 105, x + 150, y - 10, x, y + 85); g.fill();
    } else if (kind === 'star') {
      g.fillStyle = '#f6d36b'; g.beginPath();
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 42 : 98; g.lineTo(w / 2 + r * Math.cos(a), h / 2 + 8 + r * Math.sin(a)); }
      g.fill();
    } else if (kind === 'rocket') {
      // ракета школьника — свой принт, не как у геймера
      const x = w / 2, y = h / 2;
      g.fillStyle = '#ff9a3c'; g.beginPath(); g.moveTo(x - 16, y + 52); g.lineTo(x, y + 92); g.lineTo(x + 16, y + 52); g.fill();
      g.fillStyle = '#e2334a'; g.beginPath(); g.moveTo(x - 22, y + 20); g.lineTo(x - 46, y + 58); g.lineTo(x - 18, y + 50); g.fill(); g.beginPath(); g.moveTo(x + 22, y + 20); g.lineTo(x + 46, y + 58); g.lineTo(x + 18, y + 50); g.fill();
      g.fillStyle = '#f4f2ee'; g.beginPath(); g.moveTo(x, y - 88); g.bezierCurveTo(x + 34, y - 50, x + 26, y + 30, x + 20, y + 54); g.lineTo(x - 20, y + 54); g.bezierCurveTo(x - 26, y + 30, x - 34, y - 50, x, y - 88); g.fill();
      g.fillStyle = '#e2334a'; g.beginPath(); g.moveTo(x, y - 88); g.bezierCurveTo(x + 18, y - 70, x + 22, y - 58, x + 24, y - 50); g.lineTo(x - 24, y - 50); g.bezierCurveTo(x - 22, y - 58, x - 18, y - 70, x, y - 88); g.fill();
      g.fillStyle = '#3b7bd0'; g.beginPath(); g.arc(x, y - 14, 14, 0, TAU); g.fill(); g.strokeStyle = '#9aa0a8'; g.lineWidth = 5; g.stroke();
      g.fillStyle = '#f6d36b'; for (const [sx, sy] of [[-90, -50], [80, -30], [-70, 40], [95, 50]]) { g.beginPath(); g.arc(x + sx, y + sy, 6, 0, TAU); g.fill(); }
    } else if (kind === 'logo') {
      g.fillStyle = '#fff'; g.font = '900 88px Rubik'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('</>', w / 2, h / 2);
    }
  });
}

function knitTex(color: string): THREE.Texture {
  const r = mulberry32(3);
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 12) for (let x = 0; x < w; x += 12) {
      g.fillStyle = `rgba(255,255,255,${0.06 + r() * 0.05})`; g.beginPath(); g.ellipse(x + 3, y + 6, 3, 6, 0.5, 0, TAU); g.fill();
      g.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.05})`; g.beginPath(); g.ellipse(x + 9, y + 6, 3, 6, -0.5, 0, TAU); g.fill();
    }
  }, { repeat: true });
}
function stripeTex(a: string, b: string): THREE.Texture {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = a; g.fillRect(0, 0, w, h);
    g.fillStyle = b; g.fillRect(0, h * 0.42, w, h * 0.1); g.fillRect(0, h * 0.58, w, h * 0.04);
    g.fillStyle = 'rgba(255,255,255,.08)'; for (let x = 0; x < w; x += 6) g.fillRect(x, 0, 2, h);
  });
}

export interface Person {
  root: THREE.Group;
  head: THREE.Group;
  st: { walkW: number; leanW: number; carryW: number; walking: boolean; leaning: boolean; carrying: boolean; grip: number; talking: boolean; speed: number; mood: Mood; restY: number | null; restZ?: number | null };
  carrySlot: THREE.Group;
  update(t: number, dt: number): void;
}

export function buildPerson(L: PersonLook, seed = 1, far = false): Person {
  // далёким прохожим — меньше сегментов (см. kit.setDetail)
  if (far) setDetail(0.35);
  try { return buildPersonFull(L, seed, far); } finally { setDetail(1); }
}

function buildPersonFull(L: PersonLook, seed: number, far: boolean): Person {
  const root = new THREE.Group();
  const skin = phys(L.skin, { roughness: 0.62, sheen: 0.25, sheenColor: new THREE.Color('#ffcdb2'), sheenRoughness: 0.5 });
  const skinWarm = phys(shade(L.skin, 0.92), { roughness: 0.6 });
  const top = L.top;
  const topMap = top === 'sweater' ? knitTex(L.topColor) : top === 'jersey' ? stripeTex(L.topColor, L.topColor2) : null;
  const cloth = topMap ? phys('#fff', { map: topMap, roughness: 0.9, sheen: 0.4, sheenColor: new THREE.Color(shade(L.topColor, 1.4)) }) : phys(L.topColor, { roughness: 0.88, sheen: 0.45, sheenColor: new THREE.Color(shade(L.topColor, 1.45)), sheenRoughness: 0.6 });
  const clothD = phys(shade(L.topColor, 0.82), { roughness: 0.9, sheen: 0.45, sheenColor: new THREE.Color(shade(L.topColor, 1.3)), sheenRoughness: 0.6 });
  const sleeveM = top === 'tee' || top === 'jersey' ? skin : cloth;
  const jeans = phys(L.pants, { roughness: 0.85, sheen: 0.3, sheenColor: new THREE.Color(shade(L.pants, 1.6)) });
  const hairM = std(L.hairColor, { roughness: 0.72 });
  const frameM = std('#1d1d22', { roughness: 0.3 });
  const R = { thigh: [] as THREE.Group[], knee: [] as THREE.Group[], ankle: [] as THREE.Group[], shoulder: [] as THREE.Group[], elbow: [] as THREE.Group[], wrist: [] as THREE.Group[], hand: [] as THREE.Group[] };
  const hips = new THREE.Group(); hips.position.y = 0.6; root.add(hips);
  [-1, 1].forEach((s, k) => {
    const th = new THREE.Group(); th.position.set(s * 0.135, 0, 0); hips.add(th);
    capsuleBetween(th, V(0, 0.02, 0), V(0, -0.27, 0), 0.105, jeans);
    const kn = new THREE.Group(); kn.position.y = -0.27; th.add(kn);
    capsuleBetween(kn, V(0, 0, 0), V(0, -0.2, 0), 0.092, jeans);
    add(kn, cyl(0.1, 0.1, 0.035, 20), phys(shade(L.pants, 1.25), { roughness: 0.85 }), 0, -0.205, 0);
    const an = new THREE.Group(); an.position.y = -0.23; kn.add(an);
    an.add(buildShoe(L.shoes));
    R.thigh[k] = th; R.knee[k] = kn; R.ankle[k] = an;
  });
  const torso = new THREE.Group(); hips.add(torso);
  const body = new THREE.Group(); torso.add(body);
  const prof = [[0, -0.1], [0.3, -0.095], [0.34, -0.05], [0.36, 0.1], [0.36, 0.3], [0.33, 0.44], [0.27, 0.55], [0.17, 0.62], [0.1, 0.655], [0, 0.665]].map(([r, y]) => V2(r, y));
  add(body, new THREE.LatheGeometry(prof, 48), cloth).scale.set(1, 1, 0.78);
  add(body, new THREE.TorusGeometry(0.305, 0.035, Q(10), Q(48, 6)), top === 'suit' ? cloth : clothD, 0, -0.08, 0, Math.PI / 2).scale.set(1, 0.78, 1);
  add(body, sph(0.28, 40, 28), cloth, 0, 0.18, 0.07).scale.set(1.05, 1, 0.85);
  const BS = [1.05, 1, 0.85];
  if (top === 'hoodie') {
    add(body, new THREE.TorusGeometry(0.14, 0.055, Q(14), Q(40, 6)), clothD, 0, 0.64, 0, Math.PI / 2).scale.set(1.18, 1, 1);
    const hoodG = blob(0.19, 3, 0.01, 9, 2);
    add(body, hoodG, clothD, 0, 0.62, -0.16).scale.set(1.25, 0.78, 0.62);
    const str = std('#e3dbd0', { roughness: 0.8 });
    [-1, 1].forEach((s) => {
      tube(body, [V(s * 0.055, 0.62, 0.16), V(s * 0.062, 0.53, 0.235), V(s * 0.068, 0.44, 0.27), V(s * 0.072, 0.36, 0.285)], 0.008, str, 20, 6);
      add(body, cyl(0.011, 0.009, 0.035, 10), std('#c9c2b8', { metalness: 0.5, roughness: 0.3 }), s * 0.072, 0.335, 0.287);
    });
  } else if (top === 'shirt' || top === 'suit') {
    const collar = std(top === 'suit' ? '#f4f2ee' : L.topColor, { roughness: 0.7 });
    [-1, 1].forEach((s) => { const c = add(body, rbox(0.1, 0.06, 0.012, 0.005), collar, s * 0.06, 0.62, 0.16, -0.5, 0, s * 0.5); c.castShadow = false; });
    if (top === 'suit') {
      add(body, new THREE.SphereGeometry(0.28, Q(20, 4), Q(10, 3), Math.PI / 2 - 0.22, 0.44, 0.75, 0.7), std('#f4f2ee', { roughness: 0.7 }), 0, 0.18, 0.07).scale.set(BS[0] * 1.01, BS[1] * 1.01, BS[2] * 1.01);
      [-1, 1].forEach((s) => add(body, rbox(0.05, 0.22, 0.012, 0.004), clothD, s * 0.075, 0.5, 0.235, -0.35, 0, s * -0.25));
    }
    const tie = std(L.topColor2, { roughness: 0.55 });
    add(body, rbox(0.035, 0.03, 0.02, 0.008), tie, 0, 0.6, 0.2);
    tube(body, [V(0, 0.58, 0.205), V(0, 0.48, 0.25), V(0, 0.36, 0.285), V(0, 0.3, 0.29)], 0.017, tie, 16, 6).scale.set(1.4, 1, 0.5);
  } else if (top === 'sweater') {
    add(body, new THREE.TorusGeometry(0.13, 0.05, Q(14), Q(40, 6)), clothD, 0, 0.64, 0, Math.PI / 2).scale.set(1.18, 1, 1);
  } else {
    add(body, new THREE.TorusGeometry(0.12, 0.022, Q(10), Q(40, 6)), clothD, 0, 0.645, 0.01, Math.PI / 2).scale.set(1.2, 1, 1);
  }
  if (L.vest) {
    // Сигнальный жилет до плеч. Светоотражающие полосы нарисованы на самой
    // ткани (текстура по высоте), а не надеты кольцами — кольца торчали обручами.
    const vp = prof.filter((p) => p.y > -0.07 && p.y < 0.6).map((p) => V2(p.x * 1.035 + 0.004, p.y));
    const STRIPES = [0.1, 0.27];
    const vestTex = (yOfV: (v: number) => number) => canvasTex(4, 256, (c, w, hh) => {
      for (let j = 0; j < hh; j++) {
        const y = yOfV(1 - j / (hh - 1));
        c.fillStyle = STRIPES.some((sy) => Math.abs(y - sy) < 0.022) ? '#e6ecf0' : '#ff7a1a';
        c.fillRect(0, j, w, 1);
      }
    });
    // у тела вращения v идёт по точкам профиля, у сферы — по широте
    const lathe = vestTex((v) => { const f2 = v * (vp.length - 1), i = Math.min(vp.length - 2, Math.floor(f2)); return vp[i].y + (vp[i + 1].y - vp[i].y) * (f2 - i); });
    const sphT = vestTex((v) => 0.18 + Math.cos((1 - v) * Math.PI) * 0.28 * BS[1] * 1.02);
    add(body, new THREE.LatheGeometry(vp, 48), std('#fff', { map: lathe, roughness: 0.7 })).scale.set(1, 1, 0.86);
    add(body, sph(0.28, 40, 28), std('#fff', { map: sphT, roughness: 0.7 }), 0, 0.18, 0.07).scale.set(BS[0] * 1.03, BS[1] * 1.02, BS[2] * 1.05);
  }
  if (L.backpack) {
    const bag = std(L.backpack, { roughness: 0.8 }), bagD = std(shade(L.backpack, 0.75), { roughness: 0.8 });
    add(body, rbox(0.42, 0.48, 0.18, 0.07), bag, 0, 0.27, -0.33);
    add(body, rbox(0.3, 0.2, 0.08, 0.04), bagD, 0, 0.16, -0.43);
    // Лямки через плечи и вниз по груди — поверх кофты (раньше концы уходили внутрь
    // и спереди лямок не было видно).
    [-1, 1].forEach((s) => {
      tube(body, [V(s * 0.14, 0.46, -0.27), V(s * 0.16, 0.58, -0.15), V(s * 0.17, 0.645, 0.02), V(s * 0.17, 0.57, 0.2), V(s * 0.18, 0.42, 0.28), V(s * 0.2, 0.24, 0.3)], 0.018, bagD, 32, 8).scale.set(1, 1, 1);
      add(body, rbox(0.04, 0.03, 0.012, 0.004), std('#2b2d36', { roughness: 0.5 }), s * 0.19, 0.33, 0.3);
    });
    add(body, rbox(0.3, 0.02, 0.012, 0.006), bagD, 0, 0.36, 0.305);
  }
  if (L.gold) {
    const goldM = std('#e0b54a', { metalness: 0.95, roughness: 0.25 });
    add(body, new THREE.TorusGeometry(0.13, 0.014, Q(8), Q(40, 6)), goldM, 0, 0.56, 0.1, Math.PI / 2 - 0.5).scale.set(1.15, 1, 1);
  }
  const pt = printTex(L.print);
  if (pt) {
    // Принт — на животе, ниже шнурков капюшона, и с запасом над тканью: на груди
    // его закрывали шнурки и воротник, а у самой поверхности он «тонул» в кофте.
    const pr = new THREE.Mesh(new THREE.SphereGeometry(0.28, Q(32, 4), Q(16, 3), Math.PI / 2 - 0.5, 1.0, 1.2, 0.62), new THREE.MeshStandardMaterial({ map: pt, alphaTest: 0.5, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4 }));
    pr.position.set(0, 0.18, 0.07); pr.scale.set(BS[0] * 1.03, BS[1] * 1.03, BS[2] * 1.03); pr.castShadow = false; body.add(pr);
  }
  add(torso, cyl(0.085, 0.095, 0.16, 20), skin, 0, 0.71, 0);
  [-1, 1].forEach((s, k) => {
    const sh = new THREE.Group(); sh.position.set(s * 0.29, 0.52, 0); torso.add(sh);
    capsuleBetween(sh, V(0, 0.02, 0), V(0, -0.25, 0), 0.085, top === 'tee' || top === 'jersey' ? cloth : cloth);
    const el = new THREE.Group(); el.position.y = -0.25; sh.add(el);
    capsuleBetween(el, V(0, 0, 0), V(0, -0.17, 0), 0.075, sleeveM);
    if (sleeveM !== skin) capsuleBetween(el, V(0, -0.15, 0), V(0, -0.215, 0), 0.08, top === 'suit' ? std('#f4f2ee') : clothD);
    else capsuleBetween(sh, V(0, -0.12, 0), V(0, -0.2, 0), 0.09, clothD);
    const wr = new THREE.Group(); wr.position.y = -0.225; el.add(wr);
    if (L.gold && s > 0) add(el, cyl(0.082, 0.082, 0.03, 20), std('#e0b54a', { metalness: 0.95, roughness: 0.25 }), 0, -0.17, 0);
    const hand = buildHand(s, skin, far); hand.scale.setScalar(1.3); wr.add(hand);
    R.shoulder[k] = sh; R.elbow[k] = el; R.wrist[k] = wr; R.hand[k] = hand;
  });

  // ── голова: строится в начале координат, чтобы наклейка рта легла точно ──
  const head = new THREE.Group();
  const headMat = phys('#ffffff', { vertexColors: true, roughness: 0.62, sheen: 0.25, sheenColor: new THREE.Color('#ffcdb2'), sheenRoughness: 0.5 });
  const headMesh = add(head, headGeometry(L.skin), headMat);
  headMesh.updateMatrixWorld(true);
  const mouthMat = new THREE.MeshStandardMaterial({ map: mouths().smile, transparent: true, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false });
  const mouth = new THREE.Mesh(new DecalGeometry(headMesh, V(0, -0.115, 0.235), new THREE.Euler(0.42, 0, 0), V(0.22, 0.11, 0.14)), mouthMat);
  head.add(mouth);
  [-1, 1].forEach((s) => {
    add(head, sph(0.062, 20, 14), skin, s * 0.275, 0, 0).scale.set(0.45, 1, 0.75);
    add(head, sph(0.033, 14, 10), skinWarm, s * 0.297, 0, 0.005).scale.set(0.3, 1, 0.75);
  });
  add(head, sph(0.05, 28, 20), skinWarm, 0, -0.035, 0.262).scale.set(1.1, 0.85, 0.8);
  const eyes: THREE.Group[] = [];
  const white = phys('#fbf8f4', { roughness: 0.2, clearcoat: 1 });
  const iris = std(seed % 3 === 0 ? '#3b6a8a' : seed % 3 === 1 ? '#4a2c19' : '#5a6b3a', { roughness: 0.3 }), pupil = std('#120b08', { roughness: 0.2 }), hl = std('#fff', { emissive: '#fff', emissiveIntensity: 1.2 });
  [-1, 1].forEach((s) => {
    const e = new THREE.Group(); e.position.set(s * 0.095, 0.035, 0); head.add(e); eyes.push(e);
    add(e, sph(0.066, 28, 20), white, 0, 0, 0.218).scale.set(1, 1.12, 0.55);
    add(e, sph(0.037, 20, 14), iris, s * -0.004, -0.004, 0.25).scale.set(1, 1.05, 0.35);
    add(e, sph(0.02, 16, 10), pupil, s * -0.004, -0.004, 0.258).scale.set(1, 1.05, 0.3);
    add(e, sph(0.008, 10, 6), hl, s * -0.004 + 0.012, 0.012, 0.265);
  });
  // очки
  if (L.glasses !== 'none') {
    const lensM = L.glasses === 'sun' ? std('#15171c', { roughness: 0.1, metalness: 0.4 }) : phys('#dfeaf2', { roughness: 0.05, transparent: true, opacity: 0.12, depthWrite: false });
    [-1, 1].forEach((s) => {
      if (L.glasses === 'round') add(head, new THREE.TorusGeometry(0.079, 0.0125, Q(12), Q(40, 6)), frameM, s * 0.095, 0.035, 0.287);
      else {
        const sh = new THREE.Shape(); const w = 0.16, h = 0.12, r = 0.03;
        sh.moveTo(-w / 2 + r, -h / 2); sh.lineTo(w / 2 - r, -h / 2); sh.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); sh.lineTo(w / 2, h / 2 - r); sh.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); sh.lineTo(-w / 2 + r, h / 2); sh.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); sh.lineTo(-w / 2, -h / 2 + r); sh.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
        const pts = sh.getSpacedPoints(48).map((p) => V(p.x, p.y, 0));
        const fr = tube(head, pts, 0.011, frameM, 64, 8);
        fr.position.set(s * 0.095, 0.035, 0.289);
      }
      const lens = add(head, L.glasses === 'round' ? new THREE.CircleGeometry(0.079, 32) : new THREE.PlaneGeometry(0.15, 0.11), lensM, s * 0.095, 0.035, 0.284);
      lens.castShadow = false;
      tube(head, [V(s * 0.172, 0.045, 0.278), V(s * 0.235, 0.045, 0.2), V(s * 0.262, 0.038, 0.11), V(s * 0.272, 0.03, 0.04)], 0.008, frameM, 16, 6);
    });
    tube(head, [V(-0.02, 0.045, 0.291), V(0, 0.056, 0.297), V(0.02, 0.045, 0.291)], 0.0085, frameM, 10, 6);
  }
  const brows: THREE.Mesh[] = [];
  [-1, 1].forEach((s) => brows.push(tube(head, [V(s * 0.045, 0.15, 0.232), V(s * 0.1, 0.17, 0.222), V(s * 0.15, 0.155, 0.2)], 0.0145, hairM, 16, 8)));
  if (L.beard) {
    /*
     * Усы и небольшая бородка вместо сплошной бороды (автор: «бороды ужасные»).
     * Три варианта по seed: только усы, бородка-эспаньолка, усы с бородкой.
     * Всё лежит по поверхности лица (точки посчитаны по форме headGeometry).
     */
    const bm = std(L.hairColor, { roughness: 0.8 });
    const style = seed % 3;
    if (style !== 1) [-1, 1].forEach((sx) => tube(head, [V(0, -0.086, 0.259), V(sx * 0.035, -0.089, 0.255), V(sx * 0.07, -0.1, 0.24), V(sx * 0.085, -0.118, 0.228)], 0.0125, bm, 12, 6));
    if (style !== 0) {
      const gt = add(head, new THREE.SphereGeometry(0.04, Q(16, 4), Q(10, 3)), bm, 0, -0.212, 0.178);
      gt.scale.set(1.15, 1.15, 0.6);
      if (style === 2) [-1, 1].forEach((sx) => tube(head, [V(sx * 0.085, -0.118, 0.228), V(sx * 0.05, -0.18, 0.205), V(0, -0.2, 0.19)], 0.008, bm, 10, 6));
    }
  }
  buildHair(head, L, hairM, seed);
  if (L.headphones) {
    const hpM = std('#2b2d36', { roughness: 0.35 }), hpA = std(shade(L.topColor, 1.3), { roughness: 0.4 });
    add(head, new THREE.TorusGeometry(0.335, 0.026, Q(12), Q(48, 6), Math.PI), hpM, 0, 0, -0.04);
    [-1, 1].forEach((s) => {
      add(head, cyl(0.088, 0.088, 0.06, 32), hpM, s * 0.322, -0.01, -0.04, 0, 0, Math.PI / 2);
      add(head, new THREE.TorusGeometry(0.068, 0.026, Q(12), Q(32, 6)), std('#3b3e49', { roughness: 0.8 }), s * 0.288, -0.01, -0.04, 0, Math.PI / 2, 0);
      add(head, cyl(0.05, 0.05, 0.004, 32), hpA, s * 0.353, -0.01, -0.04, 0, 0, Math.PI / 2);
    });
  }
  brows.forEach((b) => (b.userData.keep = true));
  head.position.set(0, 0.93, 0.02);
  torso.add(head);
  const carrySlot = new THREE.Group(); carrySlot.position.set(0, 0.32, 0.42); torso.add(carrySlot);
  root.scale.set(L.w, L.h, L.w);
  // Прохожим — дешёвый LOD с цветом в вершинах, клиенту у окна — полная детализация.
  if (far) bakeVertexColors(root); else mergeTree(root);

  type P = { bob: number; yaw: number; lean: number; roll: number; thigh: number[]; knee: number[]; ankle: number[]; arm: number[]; out: number[]; elbow: number[]; ayaw: number[]; twist: number[]; curl: number[]; hx: number; hy: number; hz: number };
  const P0 = (): P => ({ bob: 0, yaw: 0, lean: 0, roll: 0, thigh: [0, 0], knee: [0, 0], ankle: [0, 0], arm: [0, 0], out: [0.2, 0.2], elbow: [-0.15, -0.15], ayaw: [0, 0], twist: [0, 0], curl: [0.3, 0.3], hx: 0, hy: 0, hz: 0 });
  const A = P0(), B = P0(), C = P0(), D = P0();
  const mix = (a: P, b: P, w: number, o: P): P => {
    for (const k of Object.keys(a) as (keyof P)[]) {
      const av = a[k], bv = b[k];
      if (Array.isArray(av)) for (let i = 0; i < 2; i++) (o[k] as number[])[i] = av[i] + ((bv as number[])[i] - av[i]) * w;
      else (o[k] as number) = (av as number) + ((bv as number) - (av as number)) * w;
    }
    return o;
  };
  const idle = (t: number, o: P): P => {
    Object.assign(o, P0());
    o.bob = Math.sin(t * 2.1) * 0.004; o.arm = [0.04 + Math.sin(t * 1.3) * 0.02, 0.04 - Math.sin(t * 1.3) * 0.02]; o.elbow = [-0.18, -0.18]; o.curl = [0.35, 0.35];
    o.hx = Math.sin(t * 1.1) * 0.03; o.hy = Math.sin(t * 0.45) * 0.15; o.hz = Math.sin(t * 0.7) * 0.05;
    return o;
  };
  const walk = (ph: number, o: P): P => {
    const s = Math.sin(ph), c = Math.cos(ph), amp = 0.38;
    o.thigh = [s * amp, -s * amp];
    o.knee = [0.95 * Math.max(0, -c), 0.95 * Math.max(0, c)];
    o.ankle = [-(o.thigh[0] + o.knee[0]) * 0.75, -(o.thigh[1] + o.knee[1]) * 0.75];
    o.bob = 0.004 - 0.042 * Math.abs(s); o.yaw = 0.12 * s; o.roll = 0.06 * s; o.lean = 0.07;
    o.arm = [-0.45 * s, 0.45 * s]; o.out = [0.2, 0.2];
    o.elbow = [-0.35 - 0.25 * Math.max(0, s), -0.35 - 0.25 * Math.max(0, -s)]; o.twist = [0, 0]; o.curl = [0.45, 0.45];
    o.hx = -0.03; o.hy = -0.08 * s; o.hz = -0.05 * s;
    return o;
  };
  const lean = (t: number, o: P): P => {
    o.bob = -0.02; o.yaw = 0; o.roll = 0; o.lean = 0.2;
    o.thigh = [0.04, -0.1]; o.knee = [0.06, 0.16]; o.ankle = [-0.1, -0.06];
    o.arm = [-1.55 + Math.sin(t * 1.7) * 0.02, -1.55]; o.out = [0.1, 0.1]; o.elbow = [-0.2, -0.2];
    o.twist = [Math.PI / 2, -Math.PI / 2]; o.curl = [0.12, 0.12];
    o.hx = -0.28 + Math.sin(t * 1.3) * 0.03; o.hy = Math.sin(t * 0.6) * 0.12; o.hz = Math.sin(t * 0.9) * 0.05;
    return o;
  };
  const carry = (o: P): P => {
    /*
     * Несёт ПК как настоящий: плечи опущены вперёд, локти согнуты, предплечья
     * лежат вдоль боков корпуса, ладони внутрь. Поворот плеча подбирается
     * по ширине корпуса (st.grip — половина в локальных единицах), чтобы
     * предплечья прижимались к боковинам, но не уходили внутрь.
     */
    const want = st.grip + 0.085; // ось предплечья: бок корпуса + толщина руки
    const yaw = Math.max(-0.35, Math.min(0.55, Math.asin(Math.max(-1, Math.min(1, (0.29 - want) / 0.3)))));
    o.arm = [-0.36, -0.36]; o.out = [0.02, 0.02]; o.ayaw = [yaw, yaw]; o.elbow = [-1.6, -1.6];
    o.twist = [0, 0]; o.curl = [0.3, 0.3];
    return o;
  };
  const apply = (p: P) => {
    hips.position.y = 0.6 + p.bob; hips.rotation.y = p.yaw;
    torso.rotation.set(p.lean, -p.yaw * 0.7, p.roll);
    for (let k = 0; k < 2; k++) {
      const s = k ? 1 : -1;
      R.thigh[k].rotation.x = p.thigh[k]; R.knee[k].rotation.x = p.knee[k]; R.ankle[k].rotation.x = p.ankle[k];
      R.shoulder[k].rotation.set(p.arm[k], -s * p.ayaw[k], s * p.out[k]);
      R.elbow[k].rotation.x = p.elbow[k];
      R.wrist[k].rotation.set(0, p.twist[k], 0);
      (R.hand[k].userData.curl as (a: number) => void)(p.curl[k]);
    }
    head.rotation.set(p.hx, p.hy, p.hz);
  };

  let nextBlink = 1.5, blinkT = -1, phase = 0, talkT = 0;
  const st: Person['st'] = { walkW: 0, leanW: 0, carryW: 0, walking: false, leaning: false, carrying: false, grip: 0.2, talking: false, speed: 0.9, mood: 'smile', restY: null };
  const hw = V();
  const M = mouths();
  return {
    root, head, st, carrySlot,
    update(t: number, dt: number) {
      st.walkW += ((st.walking ? 1 : 0) - st.walkW) * Math.min(1, dt * 6);
      st.leanW += ((st.leaning ? 1 : 0) - st.leanW) * Math.min(1, dt * 3.5);
      st.carryW += ((st.carrying ? 1 : 0) - st.carryW) * Math.min(1, dt * 5);
      phase += dt * ((TAU * st.speed) / 0.89);
      idle(t, A); walk(phase, B); mix(A, B, st.walkW, C); lean(t, B); mix(C, B, st.leanW, D);
      if (st.carryW > 0.001) {
        // руки «несут» поверх ходьбы: ноги и корпус остаются от ходьбы
        const cr = carry(Object.assign(P0(), D));
        for (const k of ['arm', 'out', 'ayaw', 'elbow', 'twist', 'curl'] as const) for (let i = 0; i < 2; i++) D[k][i] += (cr[k][i] - D[k][i]) * st.carryW;
      }
      apply(D);
      /*
       * Ладони — плашмя на подоконник окна. Двухзвенный IK: по точке, куда
       * должна лечь середина ладони (restY — высота поверхности, restZ — где по
       * глубине), считаются плечо и локоть, кисть доворачивается горизонтально.
       * Раньше поза была одна на всех: у одних руки уходили в столешницу и
       * проходили сквозь стену под окном, у других висели в воздухе.
       */
      if (st.restY !== null && st.restZ != null && st.leanW > 0.01) {
        root.updateMatrixWorld(true);
        const L1 = 0.25, L2 = 0.225, HC = 0.065, half = 0.033;
        for (let k = 0; k < 2; k++) {
          const s2 = k ? 1 : -1;
          R.hand[k].getWorldPosition(hw);
          // цель запястья в мире: середина ладони на поверхности, запястье — на ладонь ближе к клиенту
          const fwd = V(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
          const target = V(hw.x, st.restY + half * root.scale.y, 0).setZ(st.restZ).addScaledVector(fwd, -HC * root.scale.z);
          const loc = torso.worldToLocal(target.clone());
          const dy = loc.y - 0.52, dz = loc.z;
          const dist = Math.max(0.08, Math.min(L1 + L2 - 0.002, Math.hypot(dy, dz)));
          const phi = Math.atan2(dz, -dy);
          const al = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist))));
          const be = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + L2 * L2 - dist * dist) / (2 * L1 * L2))));
          const sh = -(phi - al), el = -(Math.PI - be);
          // кисть горизонтально: вперёд от «низа» туловища — π/2 + наклон корпуса
          const wr = -((Math.PI / 2 + D.lean) - (phi - al) - (Math.PI - be));
          const w = st.leanW * (1 - st.carryW);
          R.shoulder[k].rotation.x += (sh - R.shoulder[k].rotation.x) * w;
          R.shoulder[k].rotation.z += (s2 * 0.05 - R.shoulder[k].rotation.z) * w;
          R.shoulder[k].rotation.y *= 1 - w;
          R.elbow[k].rotation.x += (el - R.elbow[k].rotation.x) * w;
          R.wrist[k].rotation.x += (wr - R.wrist[k].rotation.x) * w;
          // пальцы плашмя, пока опирается (согнутые уходили кончиками в подоконник)
          (R.hand[k].userData.curl as (a: number) => void)(0.12 * (1 - w) + 0.02 * w);
        }
      }
      body.scale.y = 1 + Math.sin(t * 2.1) * 0.01 * (1 - st.walkW);
      if (t > nextBlink) { blinkT = t; nextBlink = t + 2.2 + Math.random() * 2.5; }
      const b = blinkT > 0 && t - blinkT < 0.14 ? Math.sin(((t - blinkT) / 0.14) * Math.PI) : 0;
      eyes.forEach((e) => (e.scale.y = 1 - b * 0.92));
      brows.forEach((br) => (br.position.y = b * 0.01 + (st.talking ? Math.max(0, Math.sin(t * 3)) * 0.012 : 0) + (st.mood === 'sad' ? -0.012 : st.mood === 'wow' ? 0.02 : 0)));
      if (st.talking) {
        talkT -= dt;
        if (talkT <= 0) { talkT = 0.08 + Math.random() * 0.09; const r = Math.random(); mouthMat.map = r < 0.45 ? M.talk : r < 0.8 ? M.smile : M.closed; }
      } else mouthMat.map = M[st.mood];
    },
  };
}

/* ─────────────────────────────── причёски ─────────────────────────────── */

function buildHair(head: THREE.Group, L: PersonLook, hairM: THREE.Material, seed: number): void {
  if (L.hair === 'bald') {
    // Венчик волос — по затылку и вискам. rx = −π/2 разворачивает дугу назад:
    // с +π/2 она ложилась на лоб «ободком».
    // Венчик — оболочкой по затылку и вискам до линии шеи (раньше был тонкий
    // «бублик» вокруг головы, и сзади под ним торчала голая кожа).
    const fringe = new THREE.SphereGeometry(1, Q(48, 4), Q(20, 3), Math.PI - 0.15, Math.PI + 0.3, 1.12, 0.86);
    fringe.scale(0.293, 0.283, 0.272);
    noiseDisplace(fringe, 0.004, 24, 17); fringe.computeVertexNormals();
    add(head, fringe, hairM);
    return;
  }
  const hr = mulberry32(seed * 7 + 77);
  const g = new THREE.Group(); g.rotation.x = -0.42; head.add(g);
  const capLen = L.hair === 'short' || L.hair === 'cap' ? 0.98 : L.hair === 'bob' ? 1.5 : 1.08;
  const capR = L.hair === 'short' ? 0.285 : 0.292;
  if (L.hair !== 'cap') {
    const cap = new THREE.SphereGeometry(capR, Q(56, 4), Q(28, 3), 0, TAU, 0, capLen);
    noiseDisplace(cap, L.hair === 'short' ? 0.004 : 0.008, 24, 5); cap.computeVertexNormals();
    add(g, cap, std(L.hairColor, { roughness: 0.72, side: THREE.DoubleSide }));
  }
  g.scale.set(1.0, 0.97, 0.95);
  /*
   * Затылок. Шапка волос наклонена вперёд и кончается высоко: сзади и сбоку
   * открывалась голая кожа, голова сливалась с шеей в толстый столб (игрок
   * принял это за «проблему с шеей»). Оболочка повторяет эллипсоид головы
   * и спускается до линии шеи; у хвоста и пучка уши остаются открытыми.
   */
  const tied = L.hair === 'pony' || L.hair === 'bun';
  const low = L.hair === 'long' || L.hair === 'bob' ? 2.3 : tied ? 2.15 : L.hair === 'short' || L.hair === 'cap' ? 1.85 : 2.05;
  // у кепки затылок начинается ниже её края — иначе волосы лезли сквозь ткань
  const top0 = L.hair === 'cap' ? 0.8 : 0.6;
  const nape = new THREE.SphereGeometry(1, Q(48, 4), Q(24, 3), Math.PI + (tied ? 0.45 : 0.12), Math.PI - (tied ? 0.9 : 0.24), top0, low - top0);
  nape.scale(0.293, 0.283, 0.272);
  noiseDisplace(nape, 0.004, 24, 11); nape.computeVertexNormals();
  // у каре и длинных волос затылок входит в цельную оболочку ниже
  const framed = L.hair === 'bob' || L.hair === 'long';
  if (!framed) add(head, nape, hairM);
  /*
   * Каре и длинные волосы — одна гладкая оболочка, обрамляющая лицо: закрывает
   * виски, уши и затылок, открыто только лицо (±54° от носа), книзу чуть
   * расходится. Раньше по бокам висели отдельные шары-«плиты», между ними и
   * чёлкой был виден голый висок, а ухо торчало поверх волос.
   */
  if (framed) {
    const lowF = L.hair === 'long' ? 2.6 : 2.25;
    const sh = new THREE.SphereGeometry(1, Q(56, 4), Q(28, 3), Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0.45, lowF - 0.45);
    sh.scale(0.305, 0.29, 0.29);
    const pp = sh.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pp.count; i++) {
      const y = pp.getY(i);
      const k = 1 + Math.max(0, -y - 0.04) * 0.55;
      pp.setX(i, pp.getX(i) * k); pp.setZ(i, pp.getZ(i) * k);
    }
    noiseDisplace(sh, 0.005, 20, 13); sh.computeVertexNormals();
    add(head, sh, std(L.hairColor, { roughness: 0.72, side: THREE.DoubleSide }));
  }
  // под кепкой прядей нет: они протыкали её насквозь
  const clumps = L.hair === 'curly' ? 30 : L.hair === 'short' || L.hair === 'cap' ? 0 : L.hair === 'spiky' ? 8 : 14;
  for (let i = 0; i < clumps; i++) {
    const pol = hr() * 1.0, az = hr() * TAU;
    const d = V(Math.sin(pol) * Math.sin(az), Math.cos(pol), Math.sin(pol) * Math.cos(az));
    const r = (L.hair === 'curly' ? 0.075 : 0.06) + hr() * 0.04;
    const m = add(g, blob(r, 2, r * 0.12, 22, i), hairM);
    m.position.copy(d).multiplyScalar(0.27); m.scale.set(1, 0.7, 1);
    m.lookAt(d.clone().multiplyScalar(2));
  }
  // чёлка по краю шапки
  if (L.hair !== 'cap') {
    const n = L.hair === 'short' ? 7 : 9;
    for (let i = 0; i < n; i++) {
      const az = (i / (n - 1) - 0.5) * TAU * 0.5, pol = capLen - 0.04;
      const d = V(Math.sin(pol) * Math.sin(az), Math.cos(pol), Math.sin(pol) * Math.cos(az));
      const m = add(g, blob(L.hair === 'short' ? 0.04 : 0.058, 2, 0.006, 25, i + 40), hairM);
      m.position.copy(d).multiplyScalar(capR - 0.004); m.scale.set(1, 0.85, 0.7);
    }
  }
  if (L.hair === 'spiky') {
    for (let i = 0; i < 9; i++) {
      const pol = 0.15 + hr() * 0.7, az = hr() * TAU;
      const d = V(Math.sin(pol) * Math.sin(az), Math.cos(pol), Math.sin(pol) * Math.cos(az));
      const c = add(g, new THREE.ConeGeometry(0.045, 0.13, Q(12)), hairM);
      c.position.copy(d).multiplyScalar(0.3); c.quaternion.setFromUnitVectors(V(0, 1, 0), d);
    }
  }
  if (L.hair === 'bun') {
    add(head, blob(0.1, 2, 0.008, 22, 3), hairM, 0, 0.24, -0.16);
  }
  if (L.hair === 'pony') {
    tube(head, [V(0, 0.16, -0.25), V(0, 0.08, -0.33), V(0, -0.08, -0.33), V(0, -0.2, -0.28)], 0.055, hairM, 16, 10).scale.set(1, 1, 1);
    add(head, sph(0.05, 12, 8), hairM, 0, -0.2, -0.28);
    add(head, new THREE.TorusGeometry(0.045, 0.012, Q(8), Q(20, 6)), std('#e2674f'), 0, 0.12, -0.29, Math.PI / 2.4, 0, 0);
  }
  if (L.hair === 'long') {
    // длина — плоская прядь по спине, продолжает оболочку (шар-«горб» убран)
    const back = add(head, blob(0.2, 3, 0.01, 14, 9), hairM, 0, -0.3, -0.19);
    back.scale.set(1.25, 1.0, 0.32);
  }
  if (L.hardhat) {
    // каска: купол, поля и рёбра жёсткости
    const hat = std('#f2c230', { roughness: 0.35 });
    // купол — до самого экватора: обрезанный на 1.45 рад, он кончался на 1 см выше
    // полей, и между каской и козырьком светилась щель
    add(head, new THREE.SphereGeometry(0.31, Q(40, 4), Q(20, 3), 0, TAU, 0, Math.PI / 2), hat, 0, 0.05, -0.01).scale.set(1, 0.92, 1.02);
    add(head, cyl(0.36, 0.36, 0.018, 40), hat, 0, 0.065, 0.02).scale.set(1, 1, 1.08);
    // гребень жёсткости — дуга точно по куполу, спереди назад (была прямая палка)
    const ridge = add(head, new THREE.TorusGeometry(0.31, 0.022, Q(10), Q(48, 6), Math.PI * 0.86), hat, 0, 0.05, -0.01, 0, Math.PI / 2, Math.PI * 0.07);
    ridge.scale.set(1.02, 0.92, 1);
    add(head, cyl(0.04, 0.04, 0.01, 24), std('#f4f1ea', { roughness: 0.5 }), 0, 0.2, 0.272, 1.1, 0, 0);
  }
  if (L.hair === 'cap') {
    const capC = own(L.topColor2 === '#2b2d36' ? '#e2674f' : L.topColor2, { roughness: 0.7 });
    // Кепка сдвинута на затылок: спереди край над бровями (брови на 0.15–0.17
    // раньше оказывались внутри), сзади она закрывает затылок, а не сидит
    // маленькой шапочкой на макушке.
    const capM = add(head, new THREE.SphereGeometry(0.298, Q(40, 4), Q(20, 3), 0, TAU, 0, 1.3), capC, 0, 0.02, -0.01, -0.42, 0, 0);
    capM.scale.set(1, 0.95, 0.97);
    const brim = add(head, cyl(0.17, 0.17, 0.014, 32), capC, 0, 0.2, 0.24, 0.12, 0, 0);
    brim.scale.set(1, 1, 0.75);
    add(head, sph(0.02, 10, 8), capC, 0, 0.305, 0);
    [-1, 1].forEach((s) => add(head, blob(0.05, 2, 0.006, 25, s), hairM, s * 0.27, 0.0, -0.03).scale.set(0.6, 1, 1));
  }
}
