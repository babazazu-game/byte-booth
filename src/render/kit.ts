/**
 * Инструменты процедурного моделирования.
 *
 * Всё, из чего собираются модели: скруглённые коробки, выдавливание по
 * контуру, трубы по кривой, «глиняные» капли с шумом, холсты-текстуры.
 * Здесь же кэш материалов: одинаковый цвет с одинаковыми параметрами — один
 * материал на всю сцену, иначе на мобильных растёт число переключений шейдера.
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const V = (x = 0, y = 0, z = 0): THREE.Vector3 => new THREE.Vector3(x, y, z);
export const V2 = (x: number, y: number): THREE.Vector2 => new THREE.Vector2(x, y);
export const TAU = Math.PI * 2;

export function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let maxAniso = 4;
export function setAnisotropy(v: number): void { maxAniso = v; }

type MatOpts = THREE.MeshStandardMaterialParameters & THREE.MeshPhysicalMaterialParameters;

const cache = new Map<string, THREE.Material>();
function key(kind: string, color: THREE.ColorRepresentation, o: MatOpts): string {
  return kind + '|' + String(color) + '|' + JSON.stringify(o, (_k, v) => (v && typeof v === 'object' && (v as THREE.Texture).isTexture ? (v as THREE.Texture).uuid : v));
}

/** Стандартный материал из кэша. С картой — каждый раз свой (карты уникальны). */
export function std(color: THREE.ColorRepresentation, o: MatOpts = {}): THREE.MeshStandardMaterial {
  const k = key('s', color, o);
  let m = cache.get(k) as THREE.MeshStandardMaterial | undefined;
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...o }); cache.set(k, m); envReg(m); }
  return m;
}

/*
 * Карта окружения — только у металлов и лака. Раньше она висела на всей сцене
 * (scene.environment) и стоила ~6 мс на встроенной графике: блики на
 * штукатурке, дереве и ткани всё равно не видны. Диффуз, который она давала,
 * заменяет дешёвый рассеянный свет движка.
 */
const envMats = new Set<THREE.MeshStandardMaterial>();
let envTex: THREE.Texture | null = null;
function envReg(m: THREE.MeshStandardMaterial): void {
  if (m.metalness < 0.3 && !((m as THREE.MeshPhysicalMaterial).clearcoat > 0)) return;
  envMats.add(m);
  m.envMap = envTex; m.envMapIntensity = 0.6;
}
export function setEnv(t: THREE.Texture | null): void {
  envTex = t;
  for (const m of envMats) { m.envMap = t; m.needsUpdate = true; }
}
export function phys(color: THREE.ColorRepresentation, o: MatOpts = {}): THREE.MeshPhysicalMaterial {
  const k = key('p', color, o);
  let m = cache.get(k) as THREE.MeshPhysicalMaterial | undefined;
  if (!m) { m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, metalness: 0, ...o }); cache.set(k, m); envReg(m); }
  return m;
}
/** Материал, который будет меняться в рантайме (подсветка, RGB) — без кэша. */
export function own(color: THREE.ColorRepresentation, o: MatOpts = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...o });
  envReg(m);
  return m;
}

export const metal = (color: THREE.ColorRepresentation, rough = 0.32): THREE.MeshStandardMaterial => std(color, { metalness: 0.9, roughness: rough });

export function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = shadow; m.receiveShadow = true;
  parent.add(m);
  return m;
}

const rboxCache = new Map<string, THREE.BufferGeometry>();
/** Скруглённая коробка. Геометрии кэшируются — их тысячи одинаковых. */
export function rbox(w: number, h: number, d: number, r = 0.01, s = 3): THREE.BufferGeometry {
  const rr = Math.max(1e-5, Math.min(r, Math.min(w, h, d) / 2 - 1e-5));
  const k = [w, h, d, rr, s].map((n) => n.toFixed(5)).join(',');
  let g = rboxCache.get(k);
  if (!g) { g = new RoundedBoxGeometry(w, h, d, s, rr); rboxCache.set(k, g); }
  return g;
}
const boxCache = new Map<string, THREE.BufferGeometry>();
export function box(w: number, h: number, d: number): THREE.BufferGeometry {
  const k = [w, h, d].map((n) => n.toFixed(5)).join(',');
  let g = boxCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); boxCache.set(k, g); }
  return g;
}
/**
 * Детализация геометрии (1 — полная). Далёкие прохожие строятся с ~0.35:
 * сферы, трубки, капсулы получают втрое меньше сегментов — силуэт тот же,
 * треугольников в разы меньше (каждый прохожий весил 15–20 тыс.).
 */
let GEO_DETAIL = 1;
export function setDetail(k: number): void { GEO_DETAIL = k; }
export const Q = (n: number, min = 3): number => Math.max(min, Math.round(n * GEO_DETAIL));
const cylCache = new Map<string, THREE.BufferGeometry>();
export function cyl(rt: number, rb: number, h: number, seg = 24): THREE.BufferGeometry {
  seg = Q(seg); const k = [rt, rb, h, seg].join(',');
  let g = cylCache.get(k);
  if (!g) { g = new THREE.CylinderGeometry(rt, rb, h, seg); cylCache.set(k, g); }
  return g;
}
const sphCache = new Map<string, THREE.BufferGeometry>();
export function sph(r: number, w = 24, h = 16): THREE.BufferGeometry {
  w = Q(w, 4); h = Q(h, 3); const k = [r, w, h].join(',');
  let g = sphCache.get(k);
  if (!g) { g = new THREE.SphereGeometry(r, w, h); sphCache.set(k, g); }
  return g;
}

export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, opts: { srgb?: boolean; repeat?: boolean } = {}): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Плоская наклейка: текстура на плоскости чуть над поверхностью. */
export function decal(parent: THREE.Object3D, w: number, h: number, tex: THREE.Texture, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, o: MatOpts = {}): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, ...o }));
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function tube(parent: THREE.Object3D, pts: THREE.Vector3[], r: number, mat: THREE.Material, seg = 48, radial = 10): THREE.Mesh {
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Q(seg, 4), r, Q(radial, 4), false);
  return add(parent, g, mat);
}

export function capsuleBetween(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material): THREE.Mesh {
  const d = b.clone().sub(a), len = d.length();
  const m = add(parent, new THREE.CapsuleGeometry(r, Math.max(1e-4, len), Q(8, 2), Q(16, 5)), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
  return m;
}

export function rrPath<P extends THREE.Path>(Ctor: new () => P, w: number, h: number, r: number, cx = 0, cy = 0): P {
  const p = new Ctor(), x = cx - w / 2, y = cy - h / 2;
  p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r); p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h); p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y);
  return p;
}
export function circ(cx: number, cy: number, r: number): THREE.Path {
  const p = new THREE.Path(); p.absarc(cx, cy, r, 0, TAU, true); return p;
}
export function extrude(shape: THREE.Shape, depth: number, bevel = 0, cs = 32): THREE.ExtrudeGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: cs });
  g.translate(0, 0, -depth / 2);
  return g;
}

export function noiseDisplace(g: THREE.BufferGeometry, amp: number, freq: number, seed: number): void {
  const p = g.attributes.position as THREE.BufferAttribute, v = V(), n = V();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); n.copy(v).normalize();
    const k = Math.sin(v.x * freq + seed) * Math.sin(v.y * freq * 1.3 + seed * 2.1) * Math.sin(v.z * freq * 0.9 + seed * 0.7)
      + 0.5 * Math.sin(v.x * freq * 2.3 + seed * 3) * Math.sin(v.z * freq * 2.1 + seed);
    v.addScaledVector(n, amp * k); p.setXYZ(i, v.x, v.y, v.z);
  }
}
export function blob(r: number, detail: number, amp: number, freq: number, seed: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(r, GEO_DETAIL < 1 ? Math.max(1, detail - 1) : detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
  noiseDisplace(g, amp, freq, seed); g.computeVertexNormals();
  return g;
}

/* ─────────────────────────────── язык надписей на предметах ─────────────────────────────── */

/**
 * Надписи на предметах (наклейки, доска с ценами, коврик, коробки) обязаны
 * быть на языке игрока — по-английски остаются только бренды. Рендер не
 * зависит от словаря интерфейса: язык сюда передаёт приложение, а текстуры,
 * созданные через liveTex, перерисовываются при его смене.
 */
let labelLang: 'ru' | 'en' = 'ru';
const live: { tex: THREE.CanvasTexture; draw: (g: CanvasRenderingContext2D, w: number, h: number) => void }[] = [];
export const tr = (ru: string, en: string): string => (labelLang === 'ru' ? ru : en);
export const isRu = (): boolean => labelLang === 'ru';
export function setLabelLang(l: 'ru' | 'en'): void {
  if (l === labelLang) return;
  labelLang = l;
  for (const it of live) {
    const c = it.tex.image as HTMLCanvasElement;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    it.draw(g, c.width, c.height);
    it.tex.needsUpdate = true;
  }
}
export function liveTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const t = canvasTex(w, h, draw);
  live.push({ tex: t, draw });
  return t;
}

/* ─────────────────────────────── склейка геометрии ─────────────────────────────── */

/**
 * Склеить неподвижные меши в пределах каждого узла дерева — по материалу.
 *
 * ── ЗАЧЕМ ────────────────────────────────────────────────────────────────
 * Процедурные модели состоят из сотен мелких деталей (винты, рёбра, пряди),
 * и каждая — отдельный вызов отрисовки. На встроенной видеокарте Intel это
 * давало ~740 вызовов на кадр плюс столько же в проход теней — игра тормозила
 * на любом качестве. После склейки деталей одного материала внутри узла
 * вызовов становится в разы меньше, а выглядит всё так же.
 *
 * ── ЧТО НЕ ТРОГАЕМ ──────────────────────────────────────────────────────
 * Склейка идёт внутри узла: анимируемые узлы (ротор вентилятора, суставы
 * персонажа) остаются отдельными и двигаются как раньше. Не склеиваются меши
 * с `userData.keep` (видимость переключается в игре), зоны нажатия, пыль,
 * инстансы и меши с детьми.
 */
export function mergeTree(root: THREE.Object3D): void {
  const visit = (node: THREE.Object3D) => {
    if (node.userData.keep) return;
    const groups = new Map<string, THREE.Mesh[]>();
    for (const ch of node.children) {
      const m = ch as THREE.Mesh;
      /*
       * Three сортирует непрозрачное по renderOrder, потом по материалу, и
       * только потом по глубине. Стены и пол, созданные раньше мелочи,
       * рисовались первыми, а мелочь перекрашивала их пиксели. Крупное —
       * позже: early-Z отбрасывает закрытые пиксели до шейдера.
       */
      if (m.isMesh && !m.renderOrder && !(m.material as THREE.Material).transparent) {
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
        const sc = Math.max(m.scale.x, m.scale.y, m.scale.z);
        if ((m.geometry.boundingSphere?.radius ?? 0) * sc > 0.9) m.renderOrder = 1;
      }
      if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || m.children.length || m.userData.keep || m.userData.zone || m.userData.dust || m.userData.slot || Array.isArray(m.material) || !m.visible) continue;
      const g = m.geometry;
      const k = [(m.material as THREE.Material).uuid, Object.keys(g.attributes).sort().join(','), g.index ? 'i' : 'n', m.castShadow ? 'c' : '', m.receiveShadow ? 'r' : '', m.renderOrder].join('|');
      let arr = groups.get(k);
      if (!arr) groups.set(k, (arr = []));
      arr.push(m);
    }
    for (const arr of groups.values()) {
      if (arr.length < 2) continue;
      const geos = arr.map((m) => { m.updateMatrix(); const g = m.geometry.clone(); g.applyMatrix4(m.matrix); g.clearGroups(); return g; });
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, arr[0].material);
      mesh.castShadow = arr[0].castShadow; mesh.receiveShadow = arr[0].receiveShadow; mesh.renderOrder = arr[0].renderOrder;
      for (const m of arr) node.remove(m);
      node.add(mesh);
    }
    for (const ch of [...node.children]) if (!(ch as THREE.Mesh).isMesh || ch.children.length) visit(ch);
  };
  root.updateMatrixWorld(true);
  visit(root);
}

/**
 * Дальний LOD: все непрозрачные меши каждого узла сливаются в ОДИН меш с цветом
 * в вершинах и общим материалом. Прохожий так стоит ~15 вызовов отрисовки
 * вместо ~47 — именно прохожие съедали кадр на слабых видеокартах (каждый
 * сустав держал по 3–6 мешей разных материалов, mergeTree их не склеивал).
 * Текстуры (принт худи) заменяются средним цветом: с десяти метров не видно.
 */
const BAKED = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
const texAvg = new WeakMap<THREE.Texture, THREE.Color>();
function avgColor(tex: THREE.Texture): THREE.Color {
  let c = texAvg.get(tex);
  if (c) return c;
  c = new THREE.Color(1, 1, 1);
  const img = tex.image as CanvasImageSource | undefined;
  if (img) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1;
    const g = cv.getContext('2d')!;
    g.drawImage(img, 0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data;
    c.setRGB(d[0] / 255, d[1] / 255, d[2] / 255, THREE.SRGBColorSpace);
  }
  texAvg.set(tex, c);
  return c;
}
export function bakeVertexColors(root: THREE.Object3D): void {
  const visit = (node: THREE.Object3D) => {
    const arr: THREE.Mesh[] = [];
    for (const ch of node.children) {
      const m = ch as THREE.Mesh;
      if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || m.children.length || Array.isArray(m.material) || !m.visible) continue;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat.transparent || !mat.color) continue;
      arr.push(m);
    }
    if (arr.length) {
      const col = new THREE.Color();
      const geos = arr.map((m) => {
        m.updateMatrix();
        let g = m.geometry.clone().applyMatrix4(m.matrix);
        if (g.index) g = g.toNonIndexed();
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', g.getAttribute('position'));
        out.setAttribute('normal', g.getAttribute('normal'));
        const mat = m.material as THREE.MeshStandardMaterial;
        col.copy(mat.color); if (mat.map) col.multiply(avgColor(mat.map));
        const n = out.getAttribute('position').count, ca = new Float32Array(n * 3);
        // Свои цвета вершин (кожа и румянец головы) сохраняем, умножая на цвет
        // материала. Раньше их затирал белый цвет материала — лица прохожих белели.
        const src = mat.vertexColors ? g.getAttribute('color') : undefined;
        for (let i = 0; i < n; i++) {
          const r = src ? src.getX(i) : 1, gg = src ? src.getY(i) : 1, b = src ? src.getZ(i) : 1;
          ca[i * 3] = col.r * r; ca[i * 3 + 1] = col.g * gg; ca[i * 3 + 2] = col.b * b;
        }
        out.setAttribute('color', new THREE.BufferAttribute(ca, 3));
        return out;
      });
      const merged = mergeGeometries(geos, false);
      if (merged) {
        const mesh = new THREE.Mesh(merged, BAKED);
        mesh.castShadow = arr.some((m) => m.castShadow); mesh.receiveShadow = arr.some((m) => m.receiveShadow);
        for (const m of arr) node.remove(m);
        node.add(mesh);
      }
    }
    for (const ch of [...node.children]) if (!(ch as THREE.Mesh).isMesh || ch.children.length) visit(ch);
  };
  root.updateMatrixWorld(true);
  visit(root);
}

/**
 * Поднять все неподвижные меши поддерева на уровень корня (с сохранением
 * мирового положения), чтобы mergeTree склеил, например, все стволы деревьев
 * парка в один меш, а не по меш-на-дерево. Узлы с `userData.keep` не трогаем.
 */
export function flattenStatic(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const moved: THREE.Object3D[] = [];
  const walk = (node: THREE.Object3D) => {
    for (const ch of [...node.children]) {
      if (ch.userData.keep || (ch as THREE.Light).isLight) continue;
      if ((ch as THREE.Mesh).isMesh && !ch.children.length) { if (node !== root) moved.push(ch); continue; }
      walk(ch);
    }
  };
  walk(root);
  for (const m of moved) root.attach(m);
  // опустевшие группы убираем, чтобы не обходить их каждый кадр
  const prune = (node: THREE.Object3D) => {
    for (const ch of [...node.children]) {
      if (ch.userData.keep || (ch as THREE.Mesh).isMesh || (ch as THREE.Light).isLight) continue;
      prune(ch);
      if (!ch.children.length && ch.type === 'Group') node.remove(ch);
    }
  };
  prune(root);
}

/* ─────────────────────────────── текст на холсте ─────────────────────────────── */

/**
 * Текст, который ГАРАНТИРОВАННО помещается в ширину: кегль уменьшается,
 * пока строка не влезет. Автор игры отдельно жаловался на вылезающие надписи
 * на ценниках и коробках — поэтому fillText напрямую в моделях не используется.
 */
export function fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, size: number, weight = 700, family = 'Rubik', minSize = 8): number {
  let s = size;
  g.font = `${weight} ${s}px ${family}`;
  while (s > minSize && g.measureText(text).width > maxW) { s -= 1; g.font = `${weight} ${s}px ${family}`; }
  g.fillText(text, x, y);
  return s;
}

/** Перенос по словам в прямоугольник; кегль уменьшается, пока всё не влезет. */
export function fitBlock(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, maxH: number, size: number, weight = 700, family = 'Rubik', lineK = 1.12): void {
  let s = size;
  let lines: string[] = [];
  for (; s >= 8; s--) {
    g.font = `${weight} ${s}px ${family}`;
    lines = [];
    let cur = '';
    for (const word of text.split(' ')) {
      const t = cur ? cur + ' ' + word : word;
      if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = word; } else cur = t;
    }
    if (cur) lines.push(cur);
    const widest = Math.max(...lines.map((l) => g.measureText(l).width));
    if (lines.length * s * lineK <= maxH && widest <= maxW) break;
  }
  const lh = s * lineK;
  const top = y - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => g.fillText(l, x, top + i * lh));
}

/* ─────────────────────────────── общие текстуры ─────────────────────────────── */

export function woodTex(base = '#a8713f', dark = '70,40,18', seed = 99): THREE.CanvasTexture {
  const r = mulberry32(seed);
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 110; i++) {
      const y = r() * h; g.strokeStyle = `rgba(${dark},${0.1 + r() * 0.22})`; g.lineWidth = 1 + r() * 3; g.beginPath();
      for (let x = 0; x <= w; x += 8) { const yy = y + Math.sin(x * 0.02 + i) * 3 + Math.sin(x * 0.006 + i * 2) * 7; if (x) g.lineTo(x, yy); else g.moveTo(x, yy); }
      g.stroke();
    }
    for (let k = 0; k < 2; k++) {
      const x = r() * w, y = r() * h;
      for (let q = 18; q > 2; q -= 3) { g.strokeStyle = `rgba(${dark},.35)`; g.beginPath(); g.ellipse(x, y, q * 2.4, q, 0, 0, TAU); g.stroke(); }
    }
  }, { repeat: true });
}

/** Шум для «живости»: царапины, пятна, грязь — накладывается как карта шероховатости. */
export function grimeTex(seed = 7, density = 1): THREE.CanvasTexture {
  const r = mulberry32(seed);
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400 * density; i++) {
      const v = 110 + r() * 110 | 0;
      g.fillStyle = `rgba(${v},${v},${v},${0.15 + r() * 0.3})`;
      g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * 6, 0, TAU); g.fill();
    }
    g.strokeStyle = 'rgba(230,230,230,.25)';
    for (let i = 0; i < 30 * density; i++) { g.lineWidth = 0.5 + r(); g.beginPath(); const x = r() * w, y = r() * h; g.moveTo(x, y); g.lineTo(x + r() * 40 - 20, y + r() * 10 - 5); g.stroke(); }
  }, { srgb: false, repeat: true });
}

const RAINBOW = ['#ff3b6b', '#ffb13b', '#4fffa0', '#3bd5ff', '#8a5bff', '#ff3b6b'];
export const rgbTexH = canvasTex(512, 8, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); RAINBOW.forEach((c, i, a) => gr.addColorStop(i / (a.length - 1), c)); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, { repeat: true });
export const rgbTexV = canvasTex(8, 512, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); RAINBOW.forEach((c, i, a) => gr.addColorStop(i / (a.length - 1), c)); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, { repeat: true });
export const rgbMatH = (): THREE.MeshStandardMaterial => std('#111', { emissive: '#ffffff', emissiveMap: rgbTexH, emissiveIntensity: 5, roughness: 0.3 });
export const rgbMatV = (): THREE.MeshStandardMaterial => std('#111', { emissive: '#ffffff', emissiveMap: rgbTexV, emissiveIntensity: 5, roughness: 0.3 });

/** Пометка для общих текстур, которые нельзя освобождать при dispose моделей. */
export function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l * k)));
  return '#' + c.getHexString();
}

/** Яркость цвета: тёмный фон → светлый текст и наоборот. */
export function inkFor(hex: string): string {
  const c = new THREE.Color(hex);
  return c.r * 0.3 + c.g * 0.59 + c.b * 0.11 > 0.45 ? '#1d1f24' : '#f6efe4';
}
