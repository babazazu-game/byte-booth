import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { add, std, phys, metal, own, rbox, box, cyl, sph, canvasTex, liveTex, decal, tube, woodTex, fitText, fitBlock, mulberry32, capsuleBetween, tr, V, V2, TAU } from './kit.ts';

/**
 * Современный ларёк: графитовые композитные панели снаружи, светлые стеновые
 * панели внутри, полированный бетон, светлый дуб на столешницах, чёрный
 * металл стеллажей. Первая версия была целиком из коричневого дерева и
 * читалась как сарай — автор попросил «в современном стиле».
 *
 * Габариты и якоря те же, что раньше: x∈[−1.45,1.45], z∈[−0.35,2.2],
 * окно в стене z=−0.35, прилавок на 0.9 — от них зависят камера и верстак.
 */

export const KIOSK = { x0: -1.45, x1: 1.45, z0: -0.35, z1: 2.2, h: 2.6, counterY: 0.9 };
export const BENCH = { x: -1.08, y: 0.9, z: 1.0 };
export const SHELF_X = 1.25;
export const MONITOR = { x: 0, y: 1.25, z: 2.02 };

export interface KioskParts {
  bell: THREE.Object3D;
  screen: { mesh: THREE.Mesh; tex: THREE.CanvasTexture; draw(lines: string[], accent?: string): void };
  benchAnchor: THREE.Group;
  shelfAnchor: THREE.Group;
  counterAnchor: THREE.Group;
  decor: THREE.Group[];
  /** Неон снаружи по уровням «Неоновой вывески». */
  neon: THREE.Group[];
  /** Кофемашина на прилавке (улучшение «Кофемашина»). */
  coffee: THREE.Group;
  signText: (title: string) => void;
  /** Материал стен: его цвет = цвет покраски. */
  wall: THREE.MeshStandardMaterial;
}

/** Цвет стен по умолчанию: приглушённый шалфейно-зелёный, тёплый под лампами. */
// светлее и спокойнее: насыщенный зелёный делал интерьер мутным (Codex)
export const WALL_COLOR = '#86a493';

/* ───────────── текстуры ───────────── */

const concreteTex = () => {
  const r = mulberry32(77);
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#a7a49f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { const x = r() * w, y = r() * h, rad = 30 + r() * 90; const gr = g.createRadialGradient(x, y, 0, x, y, rad); const v = r() < 0.5 ? '120,118,114' : '190,188,184'; gr.addColorStop(0, `rgba(${v},.18)`); gr.addColorStop(1, `rgba(${v},0)`); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '70,68,64' : '230,228,224'},${0.2 + r() * 0.3})`; g.beginPath(); g.arc(r() * w, r() * h, 0.6 + r() * 1.6, 0, TAU); g.fill(); }
    g.strokeStyle = 'rgba(60,58,55,.35)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
  }, { repeat: true });
};
// Обшивка — как ларёк на логотипе: графитовый профлист (металл Codex,
// тонированный), а «тепло» дают полосатая маркиза, деревянные доски внизу и
// свет изнутри. Сплошной тёмно-бирюзовый, светло-жёлтый и красный автору не
// понравились: ларёк без маркизы и рельефа читался ровной коробкой.
/** Цвет обшивки и отделки (углы, карниз). Меняется в одном месте. */
export const CLAD = { body: '#9ca2ac', trim: '#6a7079' };
/** Картинка из assets/tex: дорисовывается в холст, когда загрузится (до этого — заливка). */
function withImage(file: string, tex: THREE.CanvasTexture, paint: (g: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) => void): void {
  const img = new Image();
  img.onload = () => { const c = tex.image as HTMLCanvasElement; paint(c.getContext('2d')!, img, c.width, c.height); tex.needsUpdate = true; };
  img.src = file;
}
const ribStripes = (g: CanvasRenderingContext2D, w: number, h: number) => {
  for (let y = 0; y < h; y += 16) { g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(0, y, w, 5); g.fillStyle = 'rgba(0,0,0,.42)'; g.fillRect(0, y + 12, w, 4); }
};
const ribTexImg = () => {
  const t = canvasTex(256, 256, (g, w, h) => { g.fillStyle = CLAD.body; g.fillRect(0, 0, w, h); ribStripes(g, w, h); }, { repeat: true });
  withImage('assets/tex/metal.webp', t, (g, img, w, h) => {
    g.globalCompositeOperation = 'source-over'; g.fillStyle = CLAD.body; g.fillRect(0, 0, w, h);
    // металл Codex светлый и малоконтрастный: умножаем дважды, чтобы потёртости
    // и грязь читались с расстояния, потом возвращаем общую светлоту
    g.globalCompositeOperation = 'multiply'; g.drawImage(img, 0, 0, w, h); g.drawImage(img, 0, 0, w, h);
    g.globalCompositeOperation = 'overlay'; g.drawImage(img, 0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, 0, w, h);
    ribStripes(g, w, h);
  });
  return t;
};
const ribTex = () => canvasTex(256, 256, (g, w, h) => {
  const r = mulberry32(21);
  g.fillStyle = CLAD.body; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 16) { g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(0, y, w, 6); g.fillStyle = 'rgba(90,60,10,.22)'; g.fillRect(0, y + 13, w, 3); }
  for (let i = 0; i < 260; i++) { g.fillStyle = 'rgba(' + (r() < 0.5 ? '255,255,255' : '20,30,30') + ',' + (0.04 + r() * 0.08).toFixed(3) + ')'; g.fillRect(r() * w, r() * h, 1 + r() * 6, 1 + r() * 2); }
  for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(120,70,40,' + (0.08 + r() * 0.1).toFixed(3) + ')'; g.beginPath(); g.ellipse(r() * w, r() * h, 2 + r() * 6, 1 + r() * 3, 0, 0, Math.PI * 2); g.fill(); }
}, { repeat: true });
/*
 * Рельеф профлиста картой нормалей: верх ребра смотрит вверх, паз — вниз.
 * Без неё обшивка была плоской заливкой: фронт и бок не отличались, свет
 * по рёбрам не «бежал».
 */
const ribNormal = () => canvasTex(8, 256, (g, w, h) => {
  for (let y = 0; y < h; y++) {
    const k = y % 16;
    const ny = k < 6 ? 0.55 : k >= 13 ? -0.7 : 0;
    const nz = Math.sqrt(1 - ny * ny);
    // канвас рисуется сверху вниз, а v текстуры — снизу вверх: знак y меняем
    g.fillStyle = `rgb(128,${Math.round((-ny * 0.5 + 0.5) * 255)},${Math.round((nz * 0.5 + 0.5) * 255)})`;
    g.fillRect(0, y, w, 1);
  }
}, { repeat: true, srgb: false });
const slatTex = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#1d2024'; g.fillRect(0, 0, w, h);
  const r = mulberry32(5);
  for (let x = 0; x < w; x += 22) {
    const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, '#c49a68'); gr.addColorStop(1, '#a87e50');
    g.fillStyle = gr; g.fillRect(x + 2, 0, 16, h);
    g.strokeStyle = 'rgba(90,60,30,.25)'; for (let k = 0; k < 6; k++) { g.beginPath(); const y = r() * h; g.moveTo(x + 4, y); g.lineTo(x + 16, y + r() * 10); g.stroke(); }
  }
}, { repeat: true });
const perfTex = () => canvasTex(512, 256, (g, w, h) => {
  g.fillStyle = '#eceae6'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#9a9894';
  for (let y = 10; y < h; y += 20) for (let x = 10; x < w; x += 20) { g.beginPath(); g.roundRect(x - 2, y - 5, 4, 10, 2); g.fill(); }
});

function frameTex(title: () => string, sub: () => string, bg: string, fg: string, seed: number): THREE.Texture {
  return liveTex(256, 360, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const r = mulberry32(seed);
    g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 2;
    for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(0, r() * h); g.lineTo(w, r() * h); g.stroke(); }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    fitText(g, title(), w / 2, h * 0.42, w - 34, 70, 900, 'Unbounded, Rubik');
    fitBlock(g, sub(), w / 2, h * 0.62, w - 40, 60, 24, 700, 'Onest, Rubik');
  });
}

/* ───────────── ларёк ───────────── */

export function buildKiosk(root: THREE.Group, inner: THREE.Light[]): KioskParts {
  const K = KIOSK;
  const W = K.x1 - K.x0, D = K.z1 - K.z0, cz = (K.z0 + K.z1) / 2;
  /*
   * Стены — рисованная штукатурка (сгенерирована через Codex, tools/codex_image.cjs),
   * тонированная цветом материала: так цвет стен меняется одной строкой
   * (как покраска стен в ReStory) без новой текстуры.
   */
  const plaster = new THREE.TextureLoader().load('assets/tex/plaster.jpg');
  plaster.colorSpace = THREE.SRGBColorSpace;
  plaster.wrapS = plaster.wrapT = THREE.RepeatWrapping;
  plaster.repeat.set(2.4, 2.2);
  plaster.anisotropy = 4;
  const wall = own(WALL_COLOR, { map: plaster, roughness: 0.93 });
  const ribs = ribTexImg(); ribs.repeat.set(3, 6); void ribTex;
  // без металлика: без карты отражений он темнил краску в тени
  const ribN = ribNormal(); ribN.repeat.set(3, 6);
  // лёгкая собственная подсветка: фронт ларька днём в тени, и без неё фактура
  // профлиста сливалась в тёмное пятно
  const outM = std('#fff', { map: ribs, emissiveMap: ribs, emissive: '#56585d', normalMap: ribN, normalScale: new THREE.Vector2(1.6, 1.6), roughness: 0.5 });
  const alu = std('#1c1f23', { metalness: 0.55, roughness: 0.35 });
  // тёплое коричневое дерево (критик: светлый дуб делал кадр холодным)
  // дерево — текстура Codex (4 доски в тайле), чуть приглушена цветом материала
  const oakT = new THREE.TextureLoader().load('assets/tex/wood.webp'); oakT.colorSpace = THREE.SRGBColorSpace;
  oakT.wrapS = oakT.wrapT = THREE.RepeatWrapping; oakT.repeat.set(1.2, 0.5); oakT.anisotropy = 4;
  const oak = std('#f2e2cf', { map: oakT, roughness: 0.55 });
  void woodTex;
  const graphite = std('#2b3036', { roughness: 0.6, metalness: 0.1 });
  const steelBlack = std('#1e2125', { metalness: 0.6, roughness: 0.4 });

  // пол — полированный бетон, потолок со световой панелью
  const floorT = new THREE.TextureLoader().load('assets/tex/floor.webp'); floorT.colorSpace = THREE.SRGBColorSpace;
  floorT.wrapS = floorT.wrapT = THREE.RepeatWrapping; floorT.repeat.set(1.6, 1.4); floorT.anisotropy = 4;
  void concreteTex;
  add(root, box(W, 0.06, D), std('#fff', { map: floorT, roughness: 0.38, metalness: 0.05 }), 0, -0.02, cz);
  add(root, box(W + 0.2, 0.08, D + 0.4), std('#f1efea', { roughness: 0.9 }), 0, K.h + 0.04, cz + 0.05, 0, 0, 0, false);
  add(root, box(1.2, 0.012, 0.6), own('#fff', { emissive: '#fff4e2', emissiveIntensity: 1.6 }), 0, K.h - 0.006, 0.95, 0, 0, 0, false);
  add(root, box(1.24, 0.02, 0.64), alu, 0, K.h + 0.001, 0.95, 0, 0, 0, false);
  // стены: внутри светлые панели, снаружи графитовый композит с рёбрами
  for (const x of [K.x0 + 0.05, K.x1 - 0.05]) {
    add(root, box(0.1, K.h, D), wall, x, K.h / 2, cz);
    add(root, box(0.02, K.h, D + 0.02), outM, x + (x < 0 ? -0.06 : 0.06), K.h / 2, cz, 0, 0, 0, false);
  }
  add(root, box(W, K.h, 0.1), wall, 0, K.h / 2, K.z1 - 0.05);
  add(root, box(W + 0.12, K.h, 0.02), outM, 0, K.h / 2, K.z1 + 0.01, 0, 0, 0, false);
  // плинтус — тонкая тёмная полоса, без неё стена «висит» над полом
  for (const x of [K.x0 + 0.105, K.x1 - 0.105]) add(root, box(0.012, 0.07, D - 0.1), graphite, x, 0.035, cz);
  add(root, box(W - 0.2, 0.07, 0.012), graphite, 0, 0.035, K.z1 - 0.105);
  // передняя стена с окном
  // окно уже (±0.95, было ±1.25): мастерская — главный план, улица — фон (критик)
  const winY0 = 0.97, winY1 = 2.12, winX = 0.95;
  // верх окна 2.12, а не 2.3: над проёмом видна полоса стены с полкой — окно в рамке, как в ReStory
  // широкие вертикальные доски под окном — как на логотипе (раньше узкие тёмные рейки)
  const slats = canvasTex(512, 256, (g, w, h) => { g.fillStyle = '#b98352'; g.fillRect(0, 0, w, h); }, { repeat: true });
  withImage('assets/tex/wood.webp', slats, (g, img, w, h) => {
    // тайл повёрнут: доски встают вертикально, 4 доски на тайл
    g.save(); g.translate(w / 2, h / 2); g.rotate(Math.PI / 2); g.drawImage(img, -h / 2, -w / 2, h, w); g.restore();
    g.fillStyle = 'rgba(255,236,205,.26)'; g.fillRect(0, 0, w, h);
    for (let x = 0; x <= w; x += w / 4) { g.fillStyle = 'rgba(40,22,10,.55)'; g.fillRect(x - 2, 0, 4, h); }
  });
  slats.repeat.set(3, 1); void slatTex;
  add(root, box(W - 0.004, winY0, 0.1), graphite, 0, winY0 / 2, K.z0);
  add(root, box(W + 0.12, winY0 - 0.02, 0.02), std('#fff', { map: slats, roughness: 0.7 }), 0, winY0 / 2 - 0.01, K.z0 - 0.06, 0, 0, 0, false);
  add(root, box(W, K.h - winY1, 0.1), wall, 0, (K.h + winY1) / 2, K.z0);
  add(root, box(K.x1 - winX, winY1 - winY0, 0.1), wall, (winX + K.x1) / 2, (winY0 + winY1) / 2, K.z0);
  add(root, box(K.x1 - winX, winY1 - winY0, 0.1), wall, (-winX + K.x0) / 2, (winY0 + winY1) / 2, K.z0);
  add(root, box(W + 0.12, K.h - winY1, 0.02), outM, 0, (K.h + winY1) / 2, K.z0 - 0.06, 0, 0, 0, false);
  // обшивка снаружи по бокам окна — от рамы до угла
  for (const s of [-1, 1]) add(root, box(K.x1 + 0.06 - winX, winY1 - winY0, 0.02), outM, s * ((K.x1 + 0.06 + winX) / 2), (winY0 + winY1) / 2, K.z0 - 0.06, 0, 0, 0, false);
  /*
   * Объём снаружи: светлые угловые стойки, выступающий карниз под крышей
   * (даёт тень на стену) и тёмный цоколь. Без них ларёк был ровной коробкой
   * одного цвета — фронт сливался с боком.
   */
  const trim = std(CLAD.trim, { roughness: 0.5, emissive: CLAD.trim, emissiveIntensity: 0.3 });
  const ox = K.x1 + 0.07, fz = K.z0 - 0.07, bz = K.z1 + 0.02;
  for (const x of [-ox, ox]) for (const z of [fz, bz]) add(root, rbox(0.1, K.h + 0.02, 0.1, 0.012), trim, x, K.h / 2, z);
  for (const x of [-1, 1]) add(root, rbox(0.1, 0.16, D + 0.32, 0.015), trim, x * (ox + 0.03), K.h - 0.06, cz);
  add(root, rbox(W + 0.38, 0.16, 0.1, 0.015), trim, 0, K.h - 0.06, bz + 0.04);
  add(root, rbox(W + 0.38, 0.12, 0.1, 0.015), trim, 0, K.h - 0.04, fz - 0.03);
  // Кашпо с кустом справа от ларька — как на логотипе
  {
    // с той стороны, где нет штендера
    const pg = new THREE.Group(); pg.position.set(-ox - 0.42, 0, fz - 0.32); root.add(pg);
    add(pg, rbox(0.46, 0.42, 0.46, 0.03), std('#efe9df', { roughness: 0.7 }), 0, 0.21, 0);
    add(pg, rbox(0.5, 0.05, 0.5, 0.02), std('#d9d2c6', { roughness: 0.7 }), 0, 0.42, 0);
    add(pg, box(0.4, 0.02, 0.4), std('#4a3527', { roughness: 1 }), 0, 0.44, 0, 0, 0, 0, false);
    // листья гранёные и салатовые — в стиле деревьев парка (автор)
    const lf = [std('#5f9a34', { roughness: 0.75, flatShading: true }), std('#78b23e', { roughness: 0.75, flatShading: true }), std('#4d8530', { roughness: 0.75, flatShading: true })];
    const pr = mulberry32(17);
    for (let i = 0; i < 40; i++) {
      // листья веером вверх и в стороны, как у растения на логотипе — пышно
      // каждый пятый лист крупный; основание каждого листа — в земле
      const big = i % 5 === 0;
      const a = pr() * TAU, tilt = 0.1 + pr() * 0.95, len = (0.32 + pr() * 0.3) * (big ? 1.35 : 1);
      const st = new THREE.Group(); st.position.set(Math.cos(a) * 0.04, 0.43, Math.sin(a) * 0.04); st.rotation.set(0, -a, 0); pg.add(st);
      const arm = new THREE.Group(); arm.rotation.z = -tilt; st.add(arm);
      // лист — вытянутый эллипсоид, нижний кончик ровно у точки роста (раньше висел над землёй)
      const hl = len * 0.5;
      add(arm, sph(0.05, 6, 4), lf[i % 3], 0, hl, 0).scale.set(big ? 1.35 : 0.75, hl / 0.05, big ? 0.3 : 0.22);
    }
  }
  const plinth = std('#3a3d42', { roughness: 0.8 });
  for (const x of [-1, 1]) add(root, box(0.05, 0.18, D + 0.12), plinth, x * (ox + 0.005), 0.09, cz, 0, 0, 0, false);
  add(root, box(W + 0.14, 0.18, 0.05), plinth, 0, 0.09, bz + 0.015, 0, 0, 0, false);
  add(root, box(W + 0.14, 0.12, 0.05), plinth, 0, 0.06, fz - 0.015, 0, 0, 0, false);
  // Рама окна — тёмное дерево и внутренние откосы (критик: чёрная алюминиевая
  // рама делала окно «чёрной витриной»). Глубина 0.13, а не 0.14: иначе лицевая
  // грань рамы совпадала с обшивкой.
  const frameT = woodTex('#5a3a22', '40,22,10', 47); frameT.repeat.set(0.4, 2);
  const frameW = std('#fff', { map: frameT, roughness: 0.6 });
  for (const s of [-1, 1]) add(root, box(0.06, winY1 - winY0 + 0.06, 0.13), frameW, s * (winX + 0.0), (winY0 + winY1) / 2, K.z0);
  add(root, box(2 * winX + 0.06, 0.06, 0.13), frameW, 0, winY1, K.z0);
  // откосы: светлая штукатурка внутрь от рамы
  for (const s of [-1, 1]) add(root, box(0.012, winY1 - winY0, 0.12), wall, s * (winX - 0.036), (winY0 + winY1) / 2, K.z0 + 0.07);
  add(root, box(2 * winX - 0.06, 0.012, 0.12), wall, 0, winY1 - 0.036, K.z0 + 0.07);
  // приспущенные деревянные жалюзи: прикрывают верх яркой улицы
  // жалюзи подняты (9 → 5 ламелей): низко висящие нависали над головой клиента (Codex)
  const slatN = 5, slatG = new THREE.BoxGeometry(2 * winX - 0.1, 0.004, 0.035);
  const blinds = new THREE.InstancedMesh(slatG, std('#c79a63', { roughness: 0.7 }), slatN);
  const sm = new THREE.Object3D();
  for (let i = 0; i < slatN; i++) { sm.position.set(0, winY1 - 0.07 - i * 0.026, K.z0 + 0.1); sm.rotation.set(0.5, 0, 0); sm.updateMatrix(); blinds.setMatrixAt(i, sm.matrix); }
  blinds.castShadow = true; blinds.userData.keep = true; root.add(blinds);
  add(root, box(2 * winX - 0.08, 0.02, 0.045), std('#8a5a36', { roughness: 0.6 }), 0, winY1 - 0.07 - slatN * 0.026, K.z0 + 0.1);
  for (const x of [-0.8, 0, 0.8]) add(root, cyl(0.0015, 0.0015, slatN * 0.026 + 0.04, 4), std('#e9e1d2'), x, winY1 - 0.06 - (slatN * 0.026) / 2, K.z0 + 0.1, 0, 0, 0, false);
  // плоский козырёк с LED-полосой снизу
  /*
   * Полосатая маркиза с фестонами — как на логотипе. Скат от стены над окном
   * вперёд-вниз, полосы жёлтая/кремовая идут по скату, по нижнему краю —
   * полукруглые «зубчики». Видна и снаружи, и изнутри над окном.
   */
  const AW = W + 0.3, aTop = K.h - 0.1, aBot = winY1 + 0.02, aDep = 0.78;
  const aLen = Math.hypot(aTop - aBot, aDep), aAng = Math.atan2(aTop - aBot, aDep);
  const stripeT = canvasTex(256, 32, (g, w, h) => { g.fillStyle = '#fff1d2'; g.fillRect(0, 0, w, h); g.fillStyle = '#f5b41f'; g.fillRect(0, 0, w / 2, h); g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(w / 2 - 2, 0, 4, h); }, { repeat: true });
  stripeT.repeat.set(AW / 0.4, 1);
  const awM = std('#fff', { map: stripeT, roughness: 0.85, side: THREE.DoubleSide });
  const aw = add(root, new THREE.PlaneGeometry(AW, aLen), awM, 0, (aTop + aBot) / 2, K.z0 - 0.08 - aDep / 2, -Math.PI / 2 - aAng, 0, 0);
  aw.castShadow = true;
  // фестоны: полукруги по 20 см, цвета полос по очереди
  const yel = std('#f5b41f', { roughness: 0.85, side: THREE.DoubleSide }), crm = std('#fff1d2', { roughness: 0.85, side: THREE.DoubleSide });
  for (let i = 0; i < Math.round(AW / 0.2); i++) {
    const x = -AW / 2 + 0.1 + i * 0.2;
    add(root, new THREE.CircleGeometry(0.1, 16, Math.PI, Math.PI), i % 2 ? crm : yel, x, aBot, K.z0 - 0.08 - aDep - 0.002, 0, 0, 0);
  }
  // бока маркизы — треугольники, чтобы сбоку она не была «листом бумаги»
  for (const sx of [-1, 1]) {
    const tri = new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), V(0, 0, -aDep), V(0, aTop - aBot, 0)]);
    tri.computeVertexNormals();
    add(root, tri, yel, sx * AW / 2, aBot, K.z0 - 0.08, 0, 0, 0);
  }
  // тёплые споты под маркизой — подсвечивают прилавок вечером
  for (const x of [-0.9, 0, 0.9]) add(root, cyl(0.035, 0.035, 0.01, 20), own('#fff', { emissive: '#fff1d6', emissiveIntensity: 2.5 }), x, aBot + 0.16, K.z0 - 0.3, -aAng, 0, 0, false);
  // световой короб-вывеска
  const signMat = own('#000', { emissive: '#ffffff', emissiveIntensity: 1.8 });
  let signTitle = 'BYTE BOOTH';
  const signTex = liveTex(1024, 160, (g, w, h) => {
    g.fillStyle = '#20242a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f5b41f'; g.fillRect(0, h - 10, w, 10);
    g.fillStyle = '#fff6ea'; g.textAlign = 'center'; g.textBaseline = 'middle';
    fitText(g, signTitle, w / 2, h / 2 - 2, w - 120, 86, 900, 'Unbounded, Rubik');
  });
  signMat.map = signTex; signMat.emissiveMap = signTex;
  // Вывеска стоит на крыше над передней стеной, на двух опорах с раскосами
  // (раньше висела в воздухе над козырьком), буквы светятся ярко.
  const sY = K.h + 0.42, sZ = K.z0 - 0.12;
  signMat.emissiveIntensity = 2.8;
  add(root, new THREE.PlaneGeometry(2.6, 0.4), signMat, 0, sY, sZ - 0.056, 0, Math.PI, 0, false);
  add(root, box(2.7, 0.48, 0.1), graphite, 0, sY, sZ, 0, 0, 0, false);
  add(root, box(2.72, 0.02, 0.012), own('#111', { emissive: '#ffb347', emissiveIntensity: 2.4 }), 0, sY - 0.25, sZ - 0.05, 0, 0, 0, false);
  for (const x of [-1.05, 1.05]) {
    add(root, box(0.05, sY - 0.24 - (K.h + 0.08), 0.05), steelBlack, x, (sY - 0.24 + K.h + 0.08) / 2, sZ);
    add(root, box(0.03, 0.4, 0.03), steelBlack, x, K.h + 0.24, sZ + 0.16, 0.9, 0, 0);
  }
  /*
   * Свечение букв без постобработки (её убрали ради FPS): поверх вывески
   * прозрачная плоскость с размытой копией надписи, складывается со сценой —
   * получается мягкий ореол, как от неоновых букв.
   */
  const haloCv = document.createElement('canvas'); haloCv.width = 1024; haloCv.height = 256;
  const haloTex = new THREE.CanvasTexture(haloCv); haloTex.colorSpace = THREE.SRGBColorSpace;
  const drawHalo = (title: string) => {
    const g = haloCv.getContext('2d')!;
    g.clearRect(0, 0, 1024, 256);
    g.filter = 'blur(18px)'; g.fillStyle = '#ffcf6a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    fitText(g, title, 512, 128, 900, 86, 900, 'Unbounded, Rubik');
    // только широкий мягкий ореол: резкий внутренний слой «замыливал» буквы
    g.filter = 'none';
    haloTex.needsUpdate = true;
  };
  drawHalo(signTitle);
  const signHalo = add(root, new THREE.PlaneGeometry(2.6, 2.6 * 256 / 1024) /* тот же масштаб пикселей, что у вывески */, new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.4 }), 0, sY - 0.005, sZ - 0.075, 0, Math.PI, 0, false);
  signHalo.renderOrder = 5;
  const signText = (title: string) => {
    signTitle = title;
    drawHalo(title);
    const c = signTex.image as HTMLCanvasElement, g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = '#20242a'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#f5b41f'; g.fillRect(0, c.height - 10, c.width, 10);
    g.fillStyle = '#fff6ea'; g.textAlign = 'center'; g.textBaseline = 'middle';
    fitText(g, title, c.width / 2, c.height / 2 - 2, c.width - 120, 86, 900, 'Unbounded, Rubik');
    signTex.needsUpdate = true;
  };
  // прилавок: светлый дуб, торец — алюминиевая кромка
  // Столешница выступает за фасад на 4 см: при глубине 0.8 её торец совпадал
  // с плоскостью реек и мерцал (z-fighting).
  add(root, rbox(2.66, 0.05, 0.84, 0.01), oak, 0, K.counterY, -0.04);
  add(root, box(2.66, 0.02, 0.012), alu, 0, K.counterY - 0.005, -0.466);
  const counterAnchor = new THREE.Group(); counterAnchor.position.set(0, K.counterY + 0.025, -0.02); root.add(counterAnchor);
  // Надпись на рейках — крупно, во всю ширину: из меню её раньше было не прочесть.
  const sticker = liveTex(1024, 160, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#fff6ea'; g.textAlign = 'center'; g.textBaseline = 'middle';
    fitText(g, tr('СБОРКА · АПГРЕЙД · ЧИСТКА', 'BUILD · UPGRADE · CLEAN'), w / 2, h / 2, w - 40, 110, 800, 'Onest, Rubik');
  });
  decal(root, 2.3, 0.36, sticker, 0, 0.6, K.z0 - 0.072, 0, Math.PI, 0);
  // звонок на прилавке
  // звонок правее подставки со статуэтками (она занимает левый угол прилавка)
  const bell = new THREE.Group(); bell.position.set(-0.52, K.counterY + 0.025, -0.24); root.add(bell);
  add(bell, cyl(0.045, 0.05, 0.012, 24), std('#1d2024', { roughness: 0.4 }), 0, 0.006, 0);
  add(bell, new THREE.SphereGeometry(0.04, 24, 12, 0, TAU, 0, Math.PI / 2), metal('#d9dde2', 0.15), 0, 0.012, 0);
  add(bell, cyl(0.006, 0.006, 0.02, 8), metal('#9aa0a8'), 0, 0.06, 0);
  // терминал и кружка
  const term = new THREE.Group(); term.position.set(0.6, K.counterY + 0.025, 0.27); term.rotation.y = -0.2; root.add(term);
  add(term, rbox(0.08, 0.035, 0.16, 0.01), std('#26282e'), 0, 0.018, 0);
  add(term, box(0.06, 0.002, 0.05), own('#000', { emissive: '#4fd1c0', emissiveIntensity: 1.2 }), 0, 0.037, -0.04);
  const mug = new THREE.Group(); mug.position.set(-0.74, K.counterY + 0.025, 0.24); root.add(mug);
  add(mug, new THREE.LatheGeometry([[0, 0], [0.045, 0], [0.05, 0.01], [0.05, 0.11], [0.044, 0.11], [0.044, 0.012], [0, 0.012]].map(([a, b]) => V2(a, b)), 32), phys('#2f6f6b', { roughness: 0.35, clearcoat: 0.6 }));
  add(mug, cyl(0.044, 0.044, 0.004, 24), std('#3b2416', { roughness: 0.2 }), 0, 0.095, 0);
  add(mug, new THREE.TorusGeometry(0.03, 0.009, 8, 20, Math.PI), phys('#2f6f6b', { roughness: 0.35 }), 0.05, 0.055, 0, 0, 0, -Math.PI / 2);
  // LED-полоса над окном изнутри вместо гирлянды
  add(root, box(2 * winX - 0.1, 0.012, 0.025), own('#fff', { emissive: '#ffe1b8', emissiveIntensity: 0.7 }), 0, winY1 - 0.04, K.z0 + 0.06, 0, 0, 0, false);

  // ── верстак: дуб на чёрном металле, тумба с ящиками ──
  add(root, rbox(0.72, 0.045, 1.7, 0.008), oak, -1.07, 0.875, 1.05);
  for (const z of [0.3, 1.8]) for (const x of [-1.38, -0.76]) add(root, box(0.04, 0.85, 0.04), steelBlack, x, 0.425, z);
  for (const x of [-1.38, -0.76]) add(root, box(0.04, 0.04, 1.5), steelBlack, x, 0.12, 1.05);
  add(root, rbox(0.5, 0.5, 0.45, 0.01), graphite, -1.1, 0.5, 1.5);
  for (let i = 0; i < 3; i++) { add(root, box(0.004, 0.13, 0.4), std('#3a4048'), -0.848, 0.66 - i * 0.16, 1.5); add(root, rbox(0.012, 0.012, 0.14, 0.005), metal('#c9ccd2'), -0.84, 0.69 - i * 0.16, 1.5); }
  const matT = liveTex(256, 512, (g, w, h) => {
    g.fillStyle = '#3a3f48'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 2;
    for (let i = 0; i < w; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); }
    for (let j = 0; j < h; j += 32) { g.beginPath(); g.moveTo(0, j); g.lineTo(w, j); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,.35)'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    fitText(g, tr('АНТИСТАТИК', 'ESD SAFE'), 12, h - 14, w - 24, 18, 700);
  });
  add(root, box(0.6, 0.004, 1.3), std('#fff', { map: matT, roughness: 0.9 }), -1.06, 0.9, 1.05);
  const benchAnchor = new THREE.Group(); benchAnchor.position.set(BENCH.x, 0.902, BENCH.z); root.add(benchAnchor);
  // белая перфопанель с инструментами
  add(root, box(0.02, 0.7, 1.5), std('#fff', { map: perfTex(), roughness: 0.5, metalness: 0.2 }), K.x0 + 0.11, 1.45, 1.05);
  ['#e8742f', '#3fb6a8', '#f2c94c', '#e2334a'].forEach((c, i) => {
    const sd = new THREE.Group(); sd.position.set(K.x0 + 0.14, 1.5, 0.55 + i * 0.09); root.add(sd);
    add(sd, cyl(0.014, 0.016, 0.1, 12), phys(c, { roughness: 0.4, clearcoat: 0.4 }), 0, 0, 0);
    add(sd, cyl(0.003, 0.003, 0.12, 6), metal('#c9ccd2'), 0, -0.11, 0);
  });
  const pliers = new THREE.Group(); pliers.position.set(K.x0 + 0.14, 1.52, 1.0); root.add(pliers);
  for (const s of [-1, 1]) add(pliers, rbox(0.02, 0.14, 0.012, 0.005), std('#e2334a'), 0, -0.04, s * 0.012, 0, 0, s * 0.12);
  add(pliers, rbox(0.012, 0.06, 0.02, 0.004), metal('#9aa0a8'), 0, 0.06, 0);
  // лампа-пантограф: плафон смотрит в рабочую зону, прожектор стоит в нём
  const arm = std('#1e2125', { roughness: 0.4, metalness: 0.5 });
  // Основание отодвинуто от стены: перфопанель стоит на x≈−1.34, и прежняя
  // стойка проходила прямо сквозь неё.
  const P0 = V(-1.21, 0.9, 1.66), P1 = V(-1.19, 1.32, 1.64), P2 = V(-1.05, 1.42, 1.44);
  const T = V(-1.06, 0.95, 1.0);
  add(root, cyl(0.075, 0.085, 0.024, 28), arm, P0.x, P0.y + 0.012, P0.z);
  for (const off of [-0.012, 0.012]) {
    capsuleBetween(root, P0.clone().add(V(0, 0.03, off)), P1.clone().add(V(0, 0, off)), 0.006, arm);
    capsuleBetween(root, P1.clone().add(V(0, 0, off)), P2.clone().add(V(0, 0, off)), 0.006, arm);
  }
  tube(root, [P0.clone().add(V(0.02, 0.06, 0)), P0.clone().lerp(P1, 0.5).add(V(0.025, 0, 0)), P1.clone().add(V(0.02, -0.04, 0))], 0.0035, metal('#9aa0a8'), 16, 5);
  add(root, sph(0.018, 12, 8), arm, P1.x, P1.y, P1.z);
  add(root, sph(0.016, 12, 8), arm, P2.x, P2.y, P2.z);
  const dir = T.clone().sub(P2).normalize();
  const lampHead = new THREE.Group(); lampHead.position.copy(P2).addScaledVector(dir, 0.05); root.add(lampHead);
  lampHead.quaternion.setFromUnitVectors(V(0, -1, 0), dir);
  add(lampHead, new THREE.CylinderGeometry(0.03, 0.085, 0.11, 28, 1, true), std('#e9e6e0', { roughness: 0.45, side: THREE.DoubleSide }), 0, 0, 0);
  add(lampHead, cyl(0.03, 0.03, 0.01, 20), std('#e9e6e0', { roughness: 0.45 }), 0, 0.055, 0);
  add(lampHead, sph(0.026, 14, 10), own('#000', { emissive: '#ffe0b0', emissiveIntensity: 1.4 }), 0, 0.015, 0);
  const benchLight = new THREE.SpotLight('#ffe8cc', 2.6, 2.6, 0.75, 0.6, 1.5);
  benchLight.position.copy(lampHead.position); benchLight.target.position.copy(T);
  root.add(benchLight, benchLight.target);
  inner.push(benchLight);

  // ── стеллаж: чёрный металл и дубовые полки ──
  const shelfAnchor = new THREE.Group(); root.add(shelfAnchor);
  for (const y of [0.05, 0.62, 1.12, 1.58, 2.02]) {
    // стеллаж начинается за краем прилавка (0.38): раньше передние стойки и полки
    // заходили на прилавок у окна на 25 см и мешали кассе
    add(root, rbox(0.42, 0.025, 1.5, 0.004), oak, SHELF_X, y, 1.2);
    add(root, box(0.012, 0.03, 1.5), steelBlack, SHELF_X - 0.21, y, 1.2);
  }
  for (const z of [0.465, 1.97]) for (const x of [SHELF_X - 0.2, SHELF_X + 0.19]) add(root, box(0.03, 2.1, 0.03), steelBlack, x, 1.05, z);
  // ── стол с компьютером: белая столешница, чёрные ножки ──
  add(root, rbox(1.3, 0.035, 0.6, 0.006), std('#f2f0eb', { roughness: 0.5 }), 0, 0.78, 1.9);
  for (const x of [-0.6, 0.6]) for (const z of [1.65, 2.15]) add(root, box(0.035, 0.76, 0.035), steelBlack, x, 0.38, z);
  const mon = new THREE.Group(); mon.position.set(MONITOR.x, 0.797, MONITOR.z); mon.rotation.y = Math.PI; root.add(mon);
  add(mon, rbox(0.62, 0.38, 0.02, 0.008), std('#16181b', { roughness: 0.4 }), 0, 0.42, 0);
  add(mon, rbox(0.05, 0.22, 0.03, 0.01), std('#2a2c31', { metalness: 0.5 }), 0, 0.15, -0.035);
  add(mon, rbox(0.22, 0.01, 0.16, 0.005), std('#2a2c31', { metalness: 0.5 }), 0, 0.005, -0.03);
  const scrT = canvasTex(1024, 600, () => undefined);
  const scr = add(mon, new THREE.PlaneGeometry(0.6, 0.355), new THREE.MeshStandardMaterial({ map: scrT, emissive: '#ffffff', emissiveMap: scrT, emissiveIntensity: 0.9, roughness: 0.3 }), 0, 0.425, 0.0105, 0, 0, 0, false);
  const kb = new THREE.Group(); kb.position.set(0.0, 0.797, 1.75); root.add(kb);
  add(kb, rbox(0.42, 0.016, 0.14, 0.004), std('#d9d6cf', { metalness: 0.3 }), 0, 0.008, 0);
  const keys = new THREE.InstancedMesh(rbox(0.022, 0.008, 0.022, 0.003, 1), std('#f5f3ee', { roughness: 0.5 }), 60);
  const dm = new THREE.Object3D(); let ki = 0;
  for (let rr = 0; rr < 4; rr++) for (let c = 0; c < 15; c++) { dm.position.set(-0.19 + c * 0.026, 0.02, -0.045 + rr * 0.03); dm.updateMatrix(); keys.setMatrixAt(ki++, dm.matrix); }
  kb.add(keys);
  // мышь на коврике: обтекаемый корпус, щель между кнопками и колёсико
  add(root, rbox(0.2, 0.003, 0.17, 0.02), std('#2b3038', { roughness: 0.9 }), 0.335, 0.7985, 1.76, 0, 0, 0, false);
  const mouse = new THREE.Group(); mouse.position.set(0.335, 0.8, 1.74); mouse.rotation.y = 0.12; root.add(mouse);
  const shell = add(mouse, new THREE.SphereGeometry(1, 24, 14, 0, TAU, 0, Math.PI / 2), std('#ecebe6', { roughness: 0.35 }), 0, 0, 0);
  shell.scale.set(0.031, 0.022, 0.05);
  add(mouse, box(0.0012, 0.004, 0.03), std('#9a9890'), 0, 0.019, 0.022, -0.3, 0, 0);
  add(mouse, cyl(0.0045, 0.0045, 0.005, 12), std('#3a3f47'), 0, 0.021, 0.026, 0, 0, Math.PI / 2);
  const drawScreen = (lines: string[], accent = '#4fd1c0') => {
    const c = scrT.image as HTMLCanvasElement; const g = c.getContext('2d')!;
    const w = c.width, h = c.height;
    g.fillStyle = '#10161f'; g.fillRect(0, 0, w, h);
    g.fillStyle = accent; g.fillRect(0, 0, w, 70);
    g.fillStyle = '#0e1218'; g.textBaseline = 'middle'; g.textAlign = 'left'; fitText(g, tr('Мегабайт', 'PartsHub'), 30, 36, 400, 44, 900);
    g.fillStyle = '#d8e2ee';
    lines.slice(0, 8).forEach((s, i) => fitText(g, s, 30, 120 + i * 58, w - 60, 34, 600));
    scrT.needsUpdate = true;
  };
  drawScreen(['…']);
  // ── постеры в тонких чёрных рамах ──
  const posters: [() => string, () => string, string, string][] = [
    [() => 'RTX', () => tr('Играй на максимуме', 'Max settings'), '#20242a', '#9be15d'],
    [() => 'DDR5', () => tr('Больше памяти — меньше лагов', 'More memory, less lag'), '#e2674f', '#fff4e6'],
    [() => tr('144 Гц', '144 Hz'), () => tr('Плавная картинка', 'Smooth frames'), '#3d5a8a', '#f6d36b'],
  ];
  const spots: [number, number][] = [[-1.05, 1.68], [-0.2, 1.92], [1.0, 1.66]];
  posters.forEach(([a, b, bg, fg], i) => {
    const [x, y] = spots[i];
    add(root, box(0.33, 0.45, 0.012), alu, x, y, K.z1 - 0.106);
    decal(root, 0.3, 0.42, frameTex(a, b, bg, fg, i), x, y, K.z1 - 0.113, 0, Math.PI, 0, { transparent: false });
  });
  // часы — минималистичные
  const clock = new THREE.Group(); clock.position.set(-0.65, 2.0, K.z1 - 0.11); clock.rotation.y = Math.PI; root.add(clock);
  add(clock, cyl(0.12, 0.12, 0.02, 40), std('#f5f3ee'), 0, 0, 0, Math.PI / 2);
  add(clock, new THREE.TorusGeometry(0.12, 0.008, 8, 40), alu, 0, 0, 0.0);
  add(clock, box(0.006, 0.07, 0.004), std('#1c1f23'), 0, 0.03, 0.013);
  add(clock, box(0.004, 0.09, 0.004), std('#ff8a5c'), 0.02, 0.0, 0.014, 0, 0, -1);
  // декор (улучшение «Уют» включает по уровням)
  // горшок — на левом краю компьютерного стола: справа стоят мышь и вентилятор
  const d1 = new THREE.Group(); d1.position.set(-0.49, 0.797, 1.98); root.add(d1);
  add(d1, cyl(0.07, 0.055, 0.12, 16), std('#f2f0eb', { roughness: 0.6 }), 0, 0.06, 0);
  {
    // гранёные листья веером — тот же стиль, что у куста в кашпо и деревьев парка
    const dl = [std('#5f9a34', { roughness: 0.75, flatShading: true }), std('#78b23e', { roughness: 0.75, flatShading: true }), std('#93c64a', { roughness: 0.75, flatShading: true })];
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * TAU * 2.1, tilt = 0.15 + (i % 4) * 0.2, len = 0.15 + (i % 3) * 0.04;
      const st = new THREE.Group(); st.position.set(0, 0.11, 0); st.rotation.set(0, -a, 0); d1.add(st);
      const arm = new THREE.Group(); arm.rotation.z = -tilt; st.add(arm);
      add(arm, sph(0.03, 6, 4), dl[i % 3], 0, len / 2, 0).scale.set(0.9, len / 0.06, 0.3);
    }
  }
  const d2 = new THREE.Group(); d2.position.set(K.x0 + 0.12, 2.25, 0.4); root.add(d2);
  const neon = canvasTex(512, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = '#ff6fa8'; g.lineWidth = 8; g.shadowColor = '#ff6fa8'; g.shadowBlur = 20; g.font = '900 86px Rubik'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.strokeText('PC ♥', w / 2, h / 2); });
  add(d2, new THREE.PlaneGeometry(0.6, 0.15), own('#000', { map: neon, emissive: '#fff', emissiveMap: neon, emissiveIntensity: 3, transparent: true }), 0, 0, 0, 0, Math.PI / 2, 0, false);
  const decor: THREE.Group[] = [d1, d2];
  /*
   * «Неоновая вывеска» (улучшение sign) видна снаружи — на обшивке по бокам
   * окна: 1-й уровень — «ОТКРЫТО», 2-й — «PC» с монитором. Раньше улучшение
   * только добавляло клиентов, и купленного не было видно ни в игре, ни в меню.
   */
  const neonSign = (x: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, color: string): THREE.Group => {
    const n = new THREE.Group(); n.position.set(x, 1.62, K.z0 - 0.072); n.rotation.y = Math.PI; root.add(n);
    add(n, rbox(0.44, 0.26, 0.012, 0.004), std('#14161b', { roughness: 0.3, metalness: 0.2 }), 0, 0, -0.006, 0, 0, 0, false);
    const t2 = canvasTex(512, 300, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = color; g.fillStyle = color; g.shadowColor = color; g.shadowBlur = 24; g.lineWidth = 9; g.lineJoin = 'round'; draw(g, w, h); });
    add(n, new THREE.PlaneGeometry(0.42, 0.246), own('#000', { map: t2, emissive: '#fff', emissiveMap: t2, emissiveIntensity: 3, transparent: true, depthWrite: false }), 0, 0, 0.002, 0, 0, 0, false);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, color + '66'); gr.addColorStop(1, color + '00'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(0.8, 0.55, 1); halo.position.z = 0.01; n.add(halo);
    n.userData.keep = true; n.visible = false;
    return n;
  };
  const neonA = neonSign(-1.21, (g, w, h) => { g.font = '900 96px Rubik'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, tr('ОТКРЫТО', 'OPEN'), w / 2, h / 2 - 30, w - 50, 110, 900); g.strokeRect(24, 24, w - 48, h - 48); g.font = '700 44px Rubik'; fitText(g, tr('сборка ПК', 'PC builds'), w / 2, h - 70, w - 120, 50, 700); }, '#ff5fa2');
  const neonB = neonSign(1.21, (g, w) => { g.strokeRect(w / 2 - 120, 40, 240, 150); g.beginPath(); g.moveTo(w / 2, 190); g.lineTo(w / 2, 230); g.moveTo(w / 2 - 60, 240); g.lineTo(w / 2 + 60, 240); g.stroke(); g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, 'PC', w / 2, 116, 200, 100, 900); }, '#4fe0ff');
  const neonUp: THREE.Group[] = [neonA, neonB];
  /*
   * Кофемашина (улучшение «Кофемашина») — на правом конце прилавка у окна,
   * справа от кассы: ближе к центру стоит ПК клиента при выдаче.
   */
  const coffee = new THREE.Group(); coffee.position.set(1.18, K.counterY + 0.025, -0.1); coffee.rotation.y = -0.25; root.add(coffee); // лицом к мастеру, в 3 см от удлинителя на стене
  {
    const body = std('#2b2e34', { roughness: 0.35, metalness: 0.3 }), chrome = metal('#d4d8de', 0.18), red = std('#c8402e', { roughness: 0.35 });
    add(coffee, rbox(0.17, 0.03, 0.2, 0.008), body, 0, 0.015, 0);                 // поддон
    add(coffee, rbox(0.15, 0.004, 0.11, 0.002), chrome, 0, 0.032, 0.035);          // решётка поддона
    add(coffee, rbox(0.17, 0.26, 0.09, 0.012), red, 0, 0.16, -0.055);              // корпус сзади
    add(coffee, rbox(0.17, 0.05, 0.2, 0.012), red, 0, 0.29, 0);                   // верх с головой
    add(coffee, cyl(0.032, 0.028, 0.03, 20), chrome, 0, 0.25, 0.04);             // группа
    add(coffee, box(0.012, 0.03, 0.06), body, 0.0, 0.245, 0.09);                  // ручка холдера
    add(coffee, cyl(0.004, 0.004, 0.05, 8), chrome, 0.06, 0.24, 0.05);           // капучинатор
    add(coffee, cyl(0.016, 0.016, 0.008, 16), chrome, -0.05, 0.31, 0.06, Math.PI / 2); // манометр
    add(coffee, cyl(0.013, 0.013, 0.002, 16), own('#f4f1ea', { emissive: '#fff4e0', emissiveIntensity: 0.3 }), -0.05, 0.31, 0.065, Math.PI / 2);
    for (let i = 0; i < 2; i++) add(coffee, cyl(0.007, 0.007, 0.006, 12), own('#111', { emissive: i ? '#6fe08a' : '#ffb347', emissiveIntensity: 1.6 }), 0.02 + i * 0.025, 0.29, 0.101, Math.PI / 2);
    // чашка под группой и пара на поддоне
    const cupM = phys('#f4f1ea', { roughness: 0.25, clearcoat: 0.5 });
    // кружка крупнее (автор): R 4 см, 7.5 см высотой — под краником (низ 0.235) и перед корпусом (z −0.01) с запасом
    add(coffee, new THREE.LatheGeometry([[0, 0], [0.032, 0], [0.037, 0.005], [0.04, 0.075], [0.036, 0.075], [0.033, 0.008], [0, 0.008]].map(([a, b]) => V2(a, b)), 24), cupM, 0, 0.034, 0.042);
    add(coffee, cyl(0.035, 0.035, 0.003, 20), std('#5a3a22', { roughness: 0.3 }), 0, 0.099, 0.042);
    add(coffee, new THREE.TorusGeometry(0.017, 0.0055, 8, 16, Math.PI * 1.2), cupM, 0.042, 0.071, 0.042, 0, 0, -Math.PI * 0.6);
  }
  {
    // шнур кофемашины — к удлинителю на стене (он чуть левее и выше)
    coffee.updateMatrixWorld(true);
    const pts = [V(1.07, 1.12, -0.258), V(1.09, 1.04, -0.25), V(1.12, 0.99, -0.215), V(1.14, 0.98, -0.19)].map((p) => coffee.worldToLocal(p));
    tube(coffee, pts, 0.003, std('#1b1c20', { roughness: 0.6 }), 20, 5).castShadow = false;
  }
  { const cb = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(10,6,4,0.55)'); gr.addColorStop(1, 'rgba(10,6,4,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); cb.position.y = 0.0005; cb.renderOrder = 2; coffee.add(cb); }
  coffee.userData.keep = true; coffee.visible = false;
  // свет: одна точка под световой панелью
  // потолочный свет — тёплый и с быстрым спадом: центр светлый, углы уходят в тень
  const ceil = new THREE.PointLight('#ffcf94', 5.2, 4.6, 2); ceil.position.set(0, 2.3, 0.95); root.add(ceil); inner.push(ceil);
  /* ───────────── тёплая лампа над прилавком (нарисованный свет) ───────────── */
  // Настоящий источник света стоит ~4 мс на встроенной графике. Здесь свет
  // «нарисован»: светящийся плафон, ореол и тёплое пятно на столешнице —
  // глаз считывает это как лампу, а кадр не дорожает.
  // над рабочим ковриком: на фоне жалюзи лампа уже не заслоняет улицу
  const pend = new THREE.Group(); pend.position.set(-0.08, 2.02, 0.16); root.add(pend);
  add(pend, cyl(0.004, 0.004, 0.6, 6), std('#1b1c20'), 0, 0.3, 0, 0, 0, 0, false);
  add(pend, new THREE.CylinderGeometry(0.05, 0.16, 0.14, 28, 1, true), std('#2d4a3c', { roughness: 0.5, side: THREE.DoubleSide }), 0, 0, 0, 0, 0, 0, false);
  add(pend, sph(0.04, 14, 10), own('#fff', { emissive: '#ffc98a', emissiveIntensity: 3.2 }), 0, -0.03, 0, 0, 0, 0, false);
  const radial = (inner: string, outer: string) => canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, inner); gr.addColorStop(1, outer);
    g.clearRect(0, 0, w, h); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial('rgba(255,200,130,0.55)', 'rgba(255,170,90,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.set(0.55, 0.55, 1); halo.position.set(0, -0.06, 0); pend.add(halo);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.1), new THREE.MeshBasicMaterial({ map: radial('rgba(255,186,110,0.42)', 'rgba(255,170,90,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(-0.08, K.counterY + 0.026, 0.18); pool.renderOrder = 2; pool.userData.keep = true; root.add(pool);
  // следы обжитости на прилавке: круги от кружки, полоска скотча, потёртость у края
  {
    const wearT = canvasTex(512, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = 'rgba(60,30,12,.28)';
      for (const [x, y, r] of [[118, 150, 26], [142, 162, 25]] as const) { g.lineWidth = 3; g.beginPath(); g.arc(x, y, r, 0.3, Math.PI * 1.9); g.stroke(); }
      g.fillStyle = 'rgba(240,226,180,.55)'; g.save(); g.translate(330, 70); g.rotate(-0.25); g.fillRect(-36, -9, 72, 18); g.restore();
      const gr = g.createLinearGradient(0, h - 50, 0, h); gr.addColorStop(0, 'rgba(255,240,215,0)'); gr.addColorStop(1, 'rgba(255,240,215,.16)');
      g.fillStyle = gr; g.fillRect(40, h - 50, w - 80, 50);
    });
    const wm = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshBasicMaterial({ map: wearT, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    wm.rotation.x = -Math.PI / 2; wm.position.set(-0.45, K.counterY + 0.0256, 0.0); wm.renderOrder = 2; wm.userData.keep = true; root.add(wm);
  }
  // такие же тёплые пятна под лампой верстака и у монитора: тёплые рабочие
  // зоны, остальное — спокойнее (разбор Codex: «нужен световой центр»)
  for (const [x, y, z, w, d, op] of [[BENCH.x + 0.05, 0.9, 1.0, 0.9, 1.3, 0.75], [0, 0.799, 1.85, 1.1, 0.55, 0.55]] as const) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, d), (pool.material as THREE.MeshBasicMaterial).clone());
    (pl.material as THREE.MeshBasicMaterial).opacity = op;
    pl.rotation.x = -Math.PI / 2; pl.position.set(x, y + 0.001, z); pl.renderOrder = 2; pl.userData.keep = true; root.add(pl);
  }
  // контактные тени под предметами на прилавке: мягкие тёмные пятна
  const blobT = radial('rgba(10,6,4,0.55)', 'rgba(10,6,4,0)');
  const blobM = new THREE.MeshBasicMaterial({ map: blobT, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  /*
   * Все пятна — одна склеенная сетка (один вызов отрисовки): под мелочами на
   * прилавке, под кассой, на компьютерном столе. Без них предметы «висели» над
   * поверхностью (разбор Codex: контактные тени — главный дешёвый выигрыш).
   * [x, y, z, ширина, глубина]
   */
  const cY = K.counterY + 0.0255, dY = 0.7985;
  const blobs: [number, number, number, number, number][] = [
    [-0.52, cY, -0.24, 0.2, 0.2], [-0.74, cY, 0.24, 0.2, 0.2], [0.6, cY, 0.27, 0.2, 0.26],
    [-1.14, cY, 0.22, 0.16, 0.16], [-1.02, cY, 0.3, 0.12, 0.12], [-0.9, cY, 0.33, 0.12, 0.1],
    [0.875, cY, 0.245, 0.44, 0.36],
    [0, dY, 2.0, 0.34, 0.26], [0, dY, 1.75, 0.5, 0.22], [0.53, dY, 1.95, 0.18, 0.18], [0.335, dY, 1.74, 0.12, 0.14],
  ];
  const blobGeo = mergeGeometries(blobs.map(([x, y, z, w, d]) => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, y, z)));
  const blobMesh = new THREE.Mesh(blobGeo, blobM); blobMesh.renderOrder = 2; blobMesh.userData.keep = true; blobMesh.castShadow = false; root.add(blobMesh);

  /* ───────────── уют в духе ReStory ───────────── */
  // Мягкие затемнения в углах и на стыках стен с полом/потолком: запечённый
  // «ambient occlusion» градиентными полосками — одна склеенная сетка, без
  // постобработки. Именно они дают ощущение объёма комнаты.
  const aoT = canvasTex(4, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, h, 0, 0);
    gr.addColorStop(0, 'rgba(20,14,10,0.55)'); gr.addColorStop(0.35, 'rgba(20,14,10,0.22)'); gr.addColorStop(1, 'rgba(20,14,10,0)');
    g.clearRect(0, 0, w, h); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const aoM = new THREE.MeshBasicMaterial({ map: aoT, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const aoParts: THREE.BufferGeometry[] = [];
  const strip = (len: number, h: number, pos: THREE.Vector3, rot: THREE.Euler) => {
    const g = new THREE.PlaneGeometry(len, h);
    g.applyMatrix4(new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), V(1, 1, 1)));
    aoParts.push(g);
  };
  const ix0 = K.x0 + 0.1, ix1 = K.x1 - 0.1, iz0 = K.z0 + 0.05, iz1 = K.z1 - 0.1, top = K.h - 0.005;
  const iw = ix1 - ix0, id = iz1 - iz0;
  // стены у пола (полоса «растёт» от пола вверх) и у потолка (вниз)
  for (const [y, flip] of [[0.012 + 0.16, 0], [top - 0.16, Math.PI]] as const) {
    strip(id, 0.32, V(ix0 + 0.003, y, (iz0 + iz1) / 2), new THREE.Euler(0, Math.PI / 2, flip));
    strip(id, 0.32, V(ix1 - 0.003, y, (iz0 + iz1) / 2), new THREE.Euler(0, -Math.PI / 2, flip));
    strip(iw, 0.32, V(0, y, iz1 - 0.003), new THREE.Euler(0, Math.PI, flip));
  }
  // пол вдоль стен
  strip(id, 0.36, V(ix0 + 0.18, 0.013, (iz0 + iz1) / 2), new THREE.Euler(-Math.PI / 2, 0, -Math.PI / 2));
  strip(id, 0.36, V(ix1 - 0.18, 0.013, (iz0 + iz1) / 2), new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2));
  strip(iw, 0.36, V(0, 0.013, iz1 - 0.18), new THREE.Euler(-Math.PI / 2, 0, Math.PI));
  // вертикальные углы у задней стены
  for (const s of [-1, 1]) {
    const x = s < 0 ? ix0 : ix1;
    strip(K.h, 0.26, V(x - s * 0.003, K.h / 2, iz1 - 0.13), new THREE.Euler(0, -s * Math.PI / 2, s * Math.PI / 2));
    strip(K.h, 0.26, V(x - s * 0.13, K.h / 2, iz1 - 0.003), new THREE.Euler(0, Math.PI, -s * Math.PI / 2));
  }
  // стена с окном: у пола и потолка, вертикальные углы
  for (const [y, flip] of [[0.012 + 0.16, 0], [top - 0.16, Math.PI]] as const) strip(iw, 0.32, V(0, y, iz0 + 0.003), new THREE.Euler(0, 0, flip));
  strip(iw, 0.36, V(0, 0.013, iz0 + 0.18), new THREE.Euler(-Math.PI / 2, 0, 0));
  for (const s of [-1, 1]) {
    const x = s < 0 ? ix0 : ix1;
    strip(K.h, 0.26, V(x - s * 0.003, K.h / 2, iz0 + 0.13), new THREE.Euler(0, -s * Math.PI / 2, -s * Math.PI / 2));
    strip(K.h, 0.26, V(x - s * 0.13, K.h / 2, iz0 + 0.003), new THREE.Euler(0, 0, s * Math.PI / 2));
  }
  // тень от прилавка на пол под ним и под полкой над окном на стену
  strip(2.6, 0.5, V(0, 0.014, 0.6), new THREE.Euler(-Math.PI / 2, 0, Math.PI));
  strip(2.4, 0.22, V(0, 2.07, iz0 + 0.004), new THREE.Euler(0, 0, Math.PI));
  const aoMesh = new THREE.Mesh(mergeGeometries(aoParts, false)!, aoM);
  aoMesh.renderOrder = 2; aoMesh.userData.keep = true; aoMesh.castShadow = false; aoMesh.receiveShadow = false;
  root.add(aoMesh);

  // Гирлянда тёплых лампочек под окном: провисающий провод, лампочки одной
  // инстанс-группой и мягкое свечение одним облаком точек (аддитивно).
  const pts: THREE.Vector3[] = [];
  const nB = 22, gy = 2.07, gz = K.z0 + 0.135; // перед жалюзи
  for (let i = 0; i < nB; i++) {
    const u = i / (nB - 1), x = -(winX - 0.03) + u * 2 * (winX - 0.03);
    const sag = Math.abs(Math.sin(u * Math.PI * 3)) * 0.1;
    pts.push(V(x, gy - sag, gz));
  }
  tube(root, pts, 0.0018, std('#2a2620', { roughness: 0.8 }), 120, 4).castShadow = false;
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.011, 8, 6), own('#fff3dc', { emissive: '#ffcf86', emissiveIntensity: 1.3 }), nB);
  // гирлянда — тихий акцент: главный свет над окном — подвесная лампа (Codex: три источника спорили)
  const bm = new THREE.Object3D();
  pts.forEach((p, i) => { bm.position.copy(p).add(V(0, -0.012, 0)); bm.updateMatrix(); bulbs.setMatrixAt(i, bm.matrix); });
  bulbs.castShadow = false; bulbs.userData.keep = true; root.add(bulbs);
  const glowT = canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,214,150,0.9)'); gr.addColorStop(0.3, 'rgba(255,190,110,0.35)'); gr.addColorStop(1, 'rgba(255,170,90,0)');
    g.clearRect(0, 0, w, h); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const glowG = new THREE.BufferGeometry().setFromPoints(pts.map((p) => p.clone().add(V(0, -0.012, 0.004))));
  const glow = new THREE.Points(glowG, new THREE.PointsMaterial({ map: glowT, size: 0.08, sizeAttenuation: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.renderOrder = 3; glow.userData.keep = true; root.add(glow);

  return { bell, screen: { mesh: scr, tex: scrT, draw: drawScreen }, benchAnchor, shelfAnchor, counterAnchor, decor, neon: neonUp, coffee, signText, wall };
}
