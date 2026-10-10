import * as THREE from 'three';
import { add, std, phys, own, rbox, box, cyl, sph, canvasTex, mulberry32, mergeTree, flattenStatic, V, V2, TAU, blobShadow} from './kit.ts';
import { buildProps, type Props } from './props.ts';
import { buildKiosk } from './kiosk.ts';
import { BUILDERS, BACKDROPS, SEASON } from './districts.ts';
import { tree, bush, setSeason } from './flora.ts';

/**
 * Мир: ларёк (внутри и снаружи) и парк напротив.
 *
 * Мировые координаты в метрах. Ларёк — коробка x∈[−1.45,1.45], z∈[−0.35,2.2],
 * окно в стене z=−0.35, прилавок на высоте 0.9. Игрок стоит в центре и
 * поворачивает голову к четырём зонам: окно, верстак (слева), полки (справа),
 * компьютер (сзади). Парк — за окном, к −Z.
 */

export { KIOSK, BENCH, SHELF_X, MONITOR } from "./kiosk.ts";

export interface World {
  root: THREE.Group;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sky: THREE.Mesh;
  lamps: THREE.PointLight[];
  lampBulbs: THREE.MeshStandardMaterial[];
  inner: THREE.Light[];
  /** Насколько стемнело, 0..1 (вечер и предрассветная ночь): по ней разгорается свет в ларьке. */
  dusk: number;
  /** Перевезти ларёк: показать окружение района (строится при первом визите). */
  setDistrict(id: string): void;
  /** Материал стен ларька: цвет = покраска. */
  wall: THREE.MeshStandardMaterial;
  bell: THREE.Object3D;
  screen: { mesh: THREE.Mesh; tex: THREE.CanvasTexture; draw(lines: string[], accent?: string): void };
  shelfAnchor: THREE.Group;
  benchAnchor: THREE.Group;
  counterAnchor: THREE.Group;
  decor: THREE.Group[];
  /** Неон на фасаде — уровни «Неоновой вывески». */
  neon: THREE.Group[];
  coffee: THREE.Group;
  blinds: THREE.Object3D;
  setBlinds(k: number): void;
  fountainWater: THREE.Mesh;
  signText: (title: string) => void;
  props: Props;
  setPhase(p: number): void;
  /** Поворот солнца вокруг вертикали (рад): в меню оно смещено, чтобы фасад ларька был освещён. */
  sunYaw: number;
  update(t: number, dt: number): void;
}

/* ─────────────────────────────── небо ─────────────────────────────── */

function makeSky(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#6fb4ea') }, mid: { value: new THREE.Color('#bfe0f5') }, low: { value: new THREE.Color('#f6e6c8') }, sunDir: { value: V(0.3, 0.5, -1).normalize() }, sunCol: { value: new THREE.Color('#fff2d0') } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vP;
      void main(){ float h = vP.y; vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.7, h)) : mix(low, mid, smoothstep(-0.05, 0.12, h));
        float s = max(dot(vP, sunDir), 0.0); c += sunCol * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.25);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), mat);
  // небо — ПОСЛЕДНИМ: depthTest отсечёт его там, где всё закрыто ларьком
  m.renderOrder = 100;
  return m;
}

/* ─────────────────────────────── парк ─────────────────────────────── */

function bench(): THREE.Group {
  const g = new THREE.Group();
  const wood = std('#b07a48', { roughness: 0.7 }), iron = std('#2f3238', { roughness: 0.5, metalness: 0.5 });
  for (let i = 0; i < 3; i++) add(g, rbox(1.5, 0.04, 0.12, 0.01), wood, 0, 0.45, -0.14 + i * 0.14);
  for (let i = 0; i < 2; i++) add(g, rbox(1.5, 0.11, 0.035, 0.01), wood, 0, 0.62 + i * 0.15, -0.26, -0.2, 0, 0);
  for (const x of [-0.65, 0.65]) { add(g, rbox(0.05, 0.45, 0.42, 0.01), iron, x, 0.225, -0.05); add(g, rbox(0.05, 0.4, 0.05, 0.01), iron, x, 0.65, -0.28, -0.2, 0, 0); }
  blobShadow(g, 0.9, 0, -0.05, 1, 0.45);
  return g;
}

function lampPost(): { g: THREE.Group; light: THREE.PointLight; bulb: THREE.MeshStandardMaterial } {
  const g = new THREE.Group();
  const iron = std('#26292f', { roughness: 0.45, metalness: 0.6 });
  add(g, cyl(0.05, 0.07, 3.0, 12), iron, 0, 1.5, 0);
  add(g, cyl(0.12, 0.12, 0.1, 12), iron, 0, 0.05, 0);
  const bulb = own('#fff4d6', { emissive: '#ffcf8a', emissiveIntensity: 0 });
  add(g, sph(0.16, 16, 12), bulb, 0, 3.15, 0);
  add(g, cyl(0.2, 0.08, 0.1, 12), iron, 0, 3.32, 0);
  // Настоящего источника света в фонаре нет: шесть PointLight удорожали КАЖДЫЙ
  // материал сцены. Вечером фонарь «горит» самосвечением и bloom — этого хватает.
  blobShadow(g, 0.35);
  const light = new THREE.PointLight('#ffc88a', 0, 9, 2);
  return { g, light, bulb };
}


function buildPark(root: THREE.Group, lamps: THREE.PointLight[], bulbs: THREE.MeshStandardMaterial[]): { water: THREE.Mesh; tileT: THREE.Texture; r: () => number } {
  const r = mulberry32(2024);
  const grassT = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#7ea25e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { const v = r(); g.fillStyle = v < 0.5 ? 'rgba(90,150,60,.5)' : 'rgba(150,200,100,.4)'; g.fillRect(r() * w, r() * h, 2, 4); }
    // редкие цветочки: пять лепестков и жёлтая серединка, кое-где кучкой
    for (let i = 0; i < 14; i++) {
      const cx = r() * w, cy = r() * h, col = ['#ffffff', '#ffc4d6', '#fff2a8', '#d9c4ff'][i % 4];
      for (let k = 0; k < 1 + (i % 3); k++) {
        const x = cx + (r() - 0.5) * 14, y = cy + (r() - 0.5) * 14;
        g.fillStyle = col; for (let p = 0; p < 5; p++) { const a = (p / 5) * TAU; g.beginPath(); g.arc(x + Math.cos(a) * 2.2, y + Math.sin(a) * 2.2, 1.6, 0, TAU); g.fill(); }
        g.fillStyle = '#f2b632'; g.beginPath(); g.arc(x, y, 1.1, 0, TAU); g.fill();
      }
    }
  }, { repeat: true });
  grassT.repeat.set(42, 42);
  // Земля тянется и ЗА ларёк: камера меню смотрит на ларёк из парка, и раньше за ним была пустота.
  const ground = add(root, new THREE.PlaneGeometry(110, 110), std('#fff', { map: grassT, roughness: 0.95 }), 0, 0, -8, -Math.PI / 2);
  ground.castShadow = false;
  const tileT = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#c9b89c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#a8977b'; g.lineWidth = 4;
    for (let y = 0; y <= h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (let y = 0; y < h; y += 64) for (let x = (y / 64) % 2 ? 32 : 0; x <= w; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 64); g.stroke(); }
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(90,70,50,${r() * 0.15})`; g.fillRect(r() * w, r() * h, 3, 3); }
  }, { repeat: true });
  tileT.repeat.set(24, 1.4);
  // тротуар вдоль ларька и аллея парка
  const walk = add(root, new THREE.PlaneGeometry(60, 3.2), std('#fff', { map: tileT, roughness: 0.85 }), 0, 0.005, -1.9, -Math.PI / 2);
  walk.castShadow = false;
  add(root, box(60, 0.1, 0.18), std('#9e9a92', { roughness: 0.8 }), 0, 0.05, -3.55);
  const alleyT = tileT.clone(); alleyT.needsUpdate = true; alleyT.repeat.set(1.2, 14);
  const alley = add(root, new THREE.PlaneGeometry(2.6, 30), std('#fff', { map: alleyT, roughness: 0.85 }), 1.8, 0.006, -18, -Math.PI / 2);
  alley.castShadow = false;
  // чуть выше продольной аллеи: на перекрёстке плитки двух дорожек мерцали
  const alley2 = add(root, new THREE.PlaneGeometry(40, 2.2), std('#fff', { map: tileT, roughness: 0.85 }), 0, 0.0075, -12, -Math.PI / 2);
  alley2.castShadow = false;
  // фонтан на пересечении аллей
  const stone = std('#d8d2c6', { roughness: 0.75 });
  const basin = new THREE.LatheGeometry([[0, 0], [2.0, 0], [2.05, 0.05], [2.05, 0.45], [1.85, 0.45], [1.85, 0.12], [0, 0.12]].map(([a, b]) => V2(a, b)), 48);
  add(root, basin, stone, 1.8, 0, -12);
  const water = add(root, new THREE.CircleGeometry(1.86, 48), phys('#5aa7d8', { roughness: 0.05, transparent: true, opacity: 0.85, clearcoat: 1 }), 1.8, 0.38, -12, -Math.PI / 2);
  add(root, cyl(0.25, 0.4, 1.2, 20), stone, 1.8, 0.6, -12);
  add(root, new THREE.LatheGeometry([[0, 0], [0.8, 0.02], [0.75, 0.12], [0, 0.1]].map(([a, b]) => V2(a, b)), 32), stone, 1.8, 1.2, -12);
  /*
   * Фонтан работает: струя бьёт вверх, переливается через край верхней чаши
   * «юбкой» и рябит в бассейне. Это три прозрачных меша с одной текстурой
   * штрихов, которая просто едет — ни частиц, ни лишнего света.
   */
  const streakT = canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = 'rgba(220,240,255,.28)'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) { g.fillStyle = `rgba(255,255,255,${(0.25 + r() * 0.6).toFixed(2)})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 8 + r() * 30); }
  }, { repeat: true });
  const flowM = new THREE.MeshBasicMaterial({ map: streakT, color: '#cdeeff', transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide });
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.55, 12, 1, true), flowM); jet.position.set(1.8, 1.48, -12);
  const curtain = new THREE.Mesh(new THREE.CylinderGeometry(0.79, 0.98, 0.84, 36, 1, true), flowM); curtain.position.set(1.8, 0.8, -12);
  for (const m of [jet, curtain]) { m.castShadow = false; m.userData.keep = true; root.add(m); }
  const ripT = canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(w / 2, h / 2, 10 + i * 10, 0, TAU); g.stroke(); }
  });
  const ripple = new THREE.Mesh(new THREE.CircleGeometry(1.84, 40), new THREE.MeshBasicMaterial({ map: ripT, transparent: true, depthWrite: false }));
  ripple.rotation.x = -Math.PI / 2; ripple.position.set(1.8, 0.385, -12); ripple.userData.keep = true; root.add(ripple);
  water.userData.flow = { streakT, ripple };
  // деревья, кусты, клумбы
  const spots: [number, number][] = [];
  for (let i = 0; i < 46; i++) {
    const x = -24 + r() * 48, z = -5.5 - r() * 22;
    if (Math.abs(x - 1.8) < 2.4 || Math.abs(z + 12) < 2.4) continue;
    spots.push([x, z]);
  }
  spots.forEach(([x, z], i) => { const t = tree(r, i); t.position.set(x, 0, z); t.rotation.y = r() * TAU; t.scale.setScalar(0.85 + r() * 0.5); root.add(t); });
  /*
   * Кусты не должны врастать в деревья, лавочки и фонари: занятые места
   * собираем заранее (лавочки и фонари ставятся ниже, но их точки известны)
   * и куст, задевающий любое из них, пропускаем.
   */
  const PARK_BENCH: [number, number][] = [[-4, -4.4], [5.5, -4.4], [-9, -4.4], [0.2, -16.6], [3.4, -9], [-6, -13.4]];
  const PARK_LAMP: [number, number][] = [[-6.5, -4.2], [6.4, -4.2], [12, -4.2], [-15, -4.2], [-1.1, -10.4], [3.6, -14]];
  const busy: [number, number, number][] = [...spots.map(([x, z]) => [x, z, 1.0] as [number, number, number]), ...PARK_BENCH.map(([x, z]) => [x, z, 1.1] as [number, number, number]), ...PARK_LAMP.map(([x, z]) => [x, z, 0.5] as [number, number, number])];
  const free = (x: number, z: number, rad: number) => busy.every(([bx, bz, br]) => Math.hypot(x - bx, z - bz) > br + rad);
  for (let i = 0; i < 26; i++) {
    const x = -20 + r() * 40, z = -4.2 - r() * 3;
    if (Math.abs(x - 1.8) < 2 || !free(x, z, 0.6)) continue;
    busy.push([x, z, 0.6]);
    const b = bush(r, i); b.position.set(x, 0, z); b.scale.setScalar(0.8 + r() * 0.5); root.add(b);
  }
  // (3D-цветы убраны: цветочки нарисованы в текстуре травы — дешевле и аккуратнее)
  // лавочки и фонари вдоль аллеи
  for (const [x, z, ry] of [[-4, -4.4, 0], [5.5, -4.4, 0], [-9, -4.4, 0], [0.2, -16.6, Math.PI / 2], [3.4, -9, -Math.PI / 2], [-6, -13.4, Math.PI]] as const) { // те же точки, что PARK_BENCH
    const b = bench(); b.position.set(x, 0, z); b.rotation.y = ry; root.add(b);
  }
  for (const [x, z] of [[-6.5, -4.2], [6.4, -4.2], [12, -4.2], [-15, -4.2], [-1.1, -10.4], [3.6, -14]] as const) {
    const L = lampPost(); L.g.position.set(x, 0, z); root.add(L.g); lamps.push(L.light); bulbs.push(L.bulb);
  }
  /*
   * Город за парком — рисованный задник (сгенерирован через Codex), как
   * улица за окном в ReStory: тёплые фасады с навесами вместо серых коробок
   * с окнами. Две панели (вторая зеркальная), без расчёта света, с дымкой.
   */
  const streetT = new THREE.TextureLoader().load('assets/tex/street.webp');
  streetT.colorSpace = THREE.SRGBColorSpace;
  const streetM = new THREE.MeshBasicMaterial({ map: streetT, color: '#b3aca2', transparent: true, alphaTest: 0.35, depthWrite: true, fog: true });
  const streetM2 = streetM.clone(); streetM2.map = streetT.clone(); streetM2.map.wrapS = THREE.RepeatWrapping; streetM2.map.repeat.x = -1; streetM2.map.needsUpdate = true;
  for (const x of [streetM, streetM2]) { x.userData.base = x.color.clone(); BACKDROPS.push(x); }
  // Панели чередуются «прямая / зеркальная»: на стыке края совпадают, и улица
  // тянется без обрыва в обе стороны (раньше были две — край был виден).
  for (let k = -5; k <= 6; k++) {
    const m = k % 2 === 0 ? streetM : streetM2;
    // ближе к парку (21 м, было 31): город «теснее», пустого газона меньше
    const p = add(root, new THREE.PlaneGeometry(29, 10.9), m, -13.5 + k * 28.98, 10.9 / 2 - 0.5, -21 - (Math.abs(k) % 2) * 0.25, 0, 0, 0, false);
    p.receiveShadow = false; p.userData.keep = true;
  }
  return { water, tileT, r };
}

/**
 * Задний план ЗА ларьком (+Z). В игре его не видно — камера смотрит в окно, —
 * но меню показывает ларёк снаружи, и голая трава до горизонта выглядела
 * недоделкой. Здесь только статика: она склеивается mergeTree в пару вызовов
 * отрисовки, тени не отбрасывает, поэтому почти ничего не стоит.
 */
function buildBackdrop(root: THREE.Group, r: () => number, tileT: THREE.Texture, lamps: THREE.PointLight[], bulbs: THREE.MeshStandardMaterial[]): THREE.MeshBasicMaterial[] {
  const far: THREE.MeshBasicMaterial[] = [];
  const flat = (m: THREE.Mesh) => { m.castShadow = false; return m; };
  // тротуар позади ларька и вторая аллея, по ним ходят прохожие
  const backT = tileT.clone(); backT.needsUpdate = true; backT.repeat.set(24, 1);
  flat(add(root, new THREE.PlaneGeometry(60, 2.4), std('#fff', { map: backT, roughness: 0.85 }), 0, 0.006, 4.4, -Math.PI / 2));
  flat(add(root, new THREE.PlaneGeometry(60, 2.0), std('#fff', { map: backT, roughness: 0.85 }), 0, 0.006, 10.5, -Math.PI / 2));
  add(root, box(60, 0.1, 0.18), std('#9e9a92', { roughness: 0.8 }), 0, 0.05, 3.1);
  // проезжая часть за дальней аллеей
  const roadT = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#4a4d52'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { g.fillStyle = 'rgba(255,255,255,' + (r() * 0.06).toFixed(3) + ')'; g.fillRect(r() * w, r() * h, 2, 2); }
    g.fillStyle = '#e8e2cf'; for (let x = 0; x < w; x += 64) g.fillRect(x, h / 2 - 2, 36, 4);
  }, { repeat: true });
  roadT.repeat.set(16, 1);
  flat(add(root, new THREE.PlaneGeometry(80, 7), std('#fff', { map: roadT, roughness: 0.9 }), 0, 0.004, 16, -Math.PI / 2));
  // деревья между аллеями и вдоль дороги
  const busy: [number, number, number][] = [];
  for (let i = 0; i < 26; i++) {
    const x = -22 + i * 1.75 + (r() - 0.5) * 0.8;
    if (Math.abs(x) < 2.2) continue;
    const z = i % 2 ? 7.4 + r() * 1.2 : 12.6 + r() * 0.6;
    const t = tree(r, i + 3); t.position.set(x, 0, z); t.rotation.y = r() * TAU; t.scale.setScalar(0.8 + r() * 0.45); root.add(t);
    busy.push([x, z, 1.0]);
  }
  // кусты обходят деревья, лавочки и фонари (раньше врастали в них)
  for (const x of [-5.5, 4.8, -11]) busy.push([x, 6.0, 1.1]);
  for (const x of [-8, 0.5, 8.5]) busy.push([x, 5.8, 0.5]);
  for (let i = 0; i < 26; i++) {
    const x = -16 + r() * 32, z = 6.0 + r() * 0.6;
    if (!busy.every(([bx, bz, br]) => Math.hypot(x - bx, z - bz) > br + 0.55)) continue;
    busy.push([x, z, 0.55]);
    const b = bush(r, i + 40); b.position.set(x, 0, z); b.scale.setScalar(0.7 + r() * 0.4); root.add(b);
  }
  for (const [x, ry] of [[-5.5, Math.PI], [4.8, Math.PI], [-11, Math.PI]] as const) { const b = bench(); b.position.set(x, 0, 6.0); b.rotation.y = ry; root.add(b); }
  for (const x of [-8, 0.5, 8.5]) { const L = lampPost(); L.g.position.set(x, 0, 5.8); root.add(L.g); lamps.push(L.light); bulbs.push(L.bulb); }
  // дома за дорогой (фон меню) — тот же рисованный задник улицы, развёрнутый
  // к камере меню: единый стиль с видом из окна вместо серых коробок
  const bt = new THREE.TextureLoader().load('assets/tex/street.webp');
  bt.colorSpace = THREE.SRGBColorSpace; bt.wrapS = THREE.RepeatWrapping;
  for (let i = 0; i < 2; i++) {
    const t2 = i ? bt.clone() : bt; if (i) { t2.repeat.x = -1; t2.needsUpdate = true; }
    far.push(new THREE.MeshBasicMaterial({ map: t2, color: '#c9c2b8', transparent: true, alphaTest: 0.35, fog: true }));
  }
  // Камера меню ездит вдоль ларька: две панели кончались, и был виден обрыв.
  // Ряд из прямых и зеркальных копий продолжает дома в обе стороны.
  for (let k = -5; k <= 5; k++) {
    const m = add(root, new THREE.PlaneGeometry(32, 12), far[Math.abs(k) % 2], 14 - k * 31.98, 12 / 2 - 0.4, 22 + (Math.abs(k) % 2) * 0.25, 0, Math.PI, 0, false);
    m.receiveShadow = false; m.userData.keep = true;
  }
  return far;
}

/* Ларёк вынесен в kiosk.ts. */

/* ─────────────────────────────── сборка мира ─────────────────────────────── */

export function buildWorld(scene: THREE.Scene): World {
  const root = new THREE.Group();
  scene.add(root);
  const sky = makeSky(); scene.add(sky);
  const lamps: THREE.PointLight[] = [], bulbs: THREE.MeshStandardMaterial[] = [], inner: THREE.Light[] = [];
  // Окружение каждого района — своя группа: строится при первом переезде,
  // склеивается отдельно и просто прячется, когда ларёк стоит в другом месте.
  const parkG = new THREE.Group(); parkG.userData.keep = true; root.add(parkG);
  const { water, tileT, r: pr } = buildPark(parkG, lamps, bulbs);
  const farMats = buildBackdrop(root, pr, tileT, lamps, bulbs);
  const groups: Record<string, THREE.Group> = { park: parkG };
  const farTex: Record<string, THREE.Texture> = {};
  const finalize = (g: THREE.Group) => {
    g.updateMatrixWorld(true);
    const p = V();
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.getWorldPosition(p); if (p.z < -4.5 || Math.abs(p.x) > 5) o.castShadow = false; } });
    g.userData.keep = false; flattenStatic(g); mergeTree(g); g.userData.keep = true;
  };
  let curDistrict = 'park';
  const k = buildKiosk(root, inner);
  const props = buildProps(root);
  const sun = new THREE.DirectionalLight('#fff1d8', 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  // ±4.5 м хватает на ларёк и тротуар с прохожими; тексель тени мельче
  Object.assign(sun.shadow.camera, { left: -4.5, right: 4.5, top: 4.5, bottom: -4.5, near: 1, far: 40 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  sun.target.position.set(0, 0, -1);
  const hemi = new THREE.HemisphereLight('#cfe6ff', '#6b5a40', 0.9);
  scene.add(hemi);
  // Дымка даёт парку глубину и прячет край земли; небо её не получает (fog: false).
  // ближе к камере дымка гуще: дальние дома — мягкие силуэты, а не кирпич фактуры
  const fog = new THREE.Fog('#d6e4ee', 18, 70);
  scene.fog = fog;
  const skyMat = sky.material as THREE.ShaderMaterial;
  const c1 = new THREE.Color(), c2 = new THREE.Color(), c3 = new THREE.Color(), nightC = new THREE.Color('#3a4462');
  // p < 0 — предрассветная ночь: с неё начинается новый день, и «восход» видно
  const keys = [
    { p: -0.3, top: '#141c38', mid: '#2c3352', low: '#a8687a', sun: '#ff8a5a', si: 0.35, h: 0.03 },
    // днём улица приглушена (критик: яркий парк перетягивал внимание со стола)
    { p: 0, top: '#6f9fcc', mid: '#c4d2db', low: '#e9c7a2', sun: '#ffd2a0', si: 1.7, h: 0.18 },
    { p: 0.35, top: '#4a8ac2', mid: '#97bcd6', low: '#d9dfdc', sun: '#fff1da', si: 2.3, h: 0.75 },
    { p: 0.7, top: '#5a86c8', mid: '#f0b98a', low: '#ffb27a', sun: '#ffb070', si: 2.2, h: 0.25 },
    { p: 1, top: '#24305a', mid: '#7a5a8a', low: '#e88a6a', sun: '#ff8a5a', si: 0.9, h: 0.06 },
  ];
  let phase = 0.2;
  const world: World = {
    root, sun, hemi, sky, lamps, lampBulbs: bulbs, inner, bell: k.bell, screen: k.screen,
    shelfAnchor: k.shelfAnchor, benchAnchor: k.benchAnchor, counterAnchor: k.counterAnchor, decor: k.decor, neon: k.neon, coffee: k.coffee, blinds: k.blinds, setBlinds: k.setBlinds,
    fountainWater: water, signText: k.signText, props, dusk: 0, wall: k.wall, sunYaw: 0,
    setDistrict(id: string) {
      if (!groups[id]) {
        const g = new THREE.Group(); g.userData.keep = true; root.add(g);
        const set = BUILDERS[id](g);
        bulbs.push(...set.bulbs);
        finalize(g);
        groups[id] = g;
        world.setPhase(phase);
      }
      for (const [k2, g] of Object.entries(groups)) g.visible = k2 === id;
      setSeason(SEASON[id] ?? 'summer');
      if (curDistrict === id) return;
      curDistrict = id;
      // дома за ларьком (фон меню) — тот же задник, что у района
      const file = id === 'park' ? 'assets/tex/street.webp' : `assets/tex/street_${id}.webp`;
      const t = (farTex[id] ??= (() => { const x = new THREE.TextureLoader().load(file); x.colorSpace = THREE.SRGBColorSpace; x.wrapS = THREE.RepeatWrapping; return x; })());
      farMats[0].map = t;
      const t2 = t.clone(); t2.repeat.x = -1; t2.needsUpdate = true; farMats[1].map = t2;
      for (const m of farMats) m.needsUpdate = true;
    },
    setPhase(p: number) {
      phase = Math.max(-0.3, Math.min(1, p));
      let a = keys[0], b = keys[1];
      for (let i = 0; i < keys.length - 1; i++) if (phase >= keys[i].p && phase <= keys[i + 1].p) { a = keys[i]; b = keys[i + 1]; }
      const t = (phase - a.p) / (b.p - a.p || 1);
      (skyMat.uniforms.top.value as THREE.Color).copy(c1.set(a.top).lerp(c2.set(b.top), t));
      (skyMat.uniforms.mid.value as THREE.Color).copy(c1.set(a.mid).lerp(c2.set(b.mid), t));
      (skyMat.uniforms.low.value as THREE.Color).copy(c1.set(a.low).lerp(c2.set(b.low), t));
      fog.color.copy(c1.set(a.mid).lerp(c2.set(b.mid), t));
      const sunC = c3.set(a.sun).lerp(c2.set(b.sun), t);
      sun.color.copy(sunC);
      sun.intensity = a.si + (b.si - a.si) * t;
      const h = a.h + (b.h - a.h) * t;
      // солнце идёт с востока на запад над парком, светит в окно ларька
      const az = -1.1 + phase * 2.2;
      const dir = V(Math.sin(az) * Math.cos(Math.asin(h)), h, -Math.cos(az) * Math.cos(Math.asin(h)) * 0.4 + 0.6).normalize();
      if (world.sunYaw) dir.applyAxisAngle(V(0, 1, 0), world.sunYaw);
      sun.position.copy(dir.clone().multiplyScalar(20)).add(V(0, 0, -1));
      (skyMat.uniforms.sunDir.value as THREE.Vector3).copy(dir);
      (skyMat.uniforms.sunCol.value as THREE.Color).copy(sunC);
      hemi.intensity = 0.55 + h * 0.6;
      hemi.color.copy(c1.set('#cfe6ff').lerp(c2.set('#ffb88a'), Math.max(0, phase - 0.6) * 2));
      const night = Math.max(0, (phase - 0.72) / 0.28, -phase / 0.3);
      world.dusk = Math.min(1, Math.max(0, (phase - 0.5) / 0.4, -phase / 0.3));
      for (const l of lamps) l.intensity = night * 14;
      for (const m of bulbs) m.emissiveIntensity = night * 5;
      // рисованные дома не освещаются сценой — вечером приглушаем их к сумеречно-синему
      // сами (раньше ночью город за окном оставался дневным)
      const dk = Math.min(1, world.dusk) * 0.72;
      for (const m of [...BACKDROPS, ...farMats]) { if (!m.userData.base) m.userData.base = m.color.clone(); m.color.copy(m.userData.base as THREE.Color).lerp(nightC, dk); }
    },
    update(t: number, dt: number) {
      (water.material as THREE.MeshPhysicalMaterial).color.setHSL(0.56, 0.55, 0.55 + Math.sin(t * 2) * 0.02);
      const flow = water.userData.flow as { streakT: THREE.Texture; ripple: THREE.Mesh };
      flow.streakT.offset.y = (t * 0.9) % 1;
      const k = (t * 0.35) % 1; flow.ripple.scale.setScalar(0.85 + k * 0.15); (flow.ripple.material as THREE.MeshBasicMaterial).opacity = 0.9 - k * 0.6;
      props.update(dt);
    },
  };
  world.setPhase(0.2);
  // Тени отбрасывает только то, что рядом с ларьком: дальние деревья в карту
  // теней всё равно не влезают, а каждое — лишний проход отрисовки.
  root.updateMatrixWorld(true);
  const wp = V();
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.getWorldPosition(wp); if (wp.z < -4.5 || Math.abs(wp.x) > 5) o.castShadow = false; } });
  // Узлы, которые меняются в игре, склейке не подлежат.
  for (const o of [k.bell, k.benchAnchor, k.shelfAnchor, k.counterAnchor, ...k.decor, ...k.neon, k.coffee]) o.userData.keep = true;
  flattenStatic(root);
  mergeTree(root);
  finalize(parkG);
  return world;
}
