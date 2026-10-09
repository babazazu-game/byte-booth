/**
 * Просмотр всех персонажей (только для разработки: characters.html в сборку
 * не попадает). Нужен, чтобы автор игры крутил модели и говорил правки, а не
 * ловил клиентов у окошка.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ARCHS, makeLook, type Arch } from '../logic/customers.ts';
import { buildPerson, type Person, type Mood } from '../render/models/person.ts';
import { buildFigurine } from '../render/models/figurine.ts';
import { FIGS } from '../logic/collect.ts';

const FIG_NAMES: Record<string, string> = { duck: 'Уточка', cat: 'Кошка-манэки', dino: 'Динозаврик', rocket: 'Ракета', astro: 'Космонавт', gamepad: 'Золотой геймпад', tower: 'Мини-ПК', cup: 'Кубок сборщика' };
let figs: { g: THREE.Group; tag: HTMLElement }[] = [];

const NAMES: Record<Arch, [string, string]> = {
  gamer: ['Геймер', 'худи, наушники'],
  gamergirl: ['Геймерша', 'худи, наушники, яркие волосы'],
  office: ['Офисный работник', 'рубашка и галстук'],
  grandma: ['Бабушка', 'вязаный свитер, пучок'],
  crypto: ['Криптан', 'чёрное худи, очки, биткоин'],
  streamer: ['Стример / блогер ЖелезоТВ', 'полосатая джерси, наушники'],
  boss: ['Начальник', 'костюм'],
  student: ['Студент(ка)', 'футболка или худи'],
  designer: ['Дизайнер', 'футболка, квадратные очки'],
  dad: ['Папа', 'свитер или рубашка, часто борода'],
  coder: ['Программист', 'худи, очки, борода'],
  teen: ['Подросток', 'невысокий, кепка или вихры'],
  oligarch: ['Олигарх', 'костюм, золотая цепь и часы, тёмные очки'],
  builder: ['Строитель', 'каска и сигнальный жилет'],
  schoolkid: ['Школьник', 'рюкзак за спиной, невысокий'],
};
const ORDER = Object.keys(NAMES) as Arch[];

const main = document.getElementById('main')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
main.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#e9e3d8');
scene.add(new THREE.HemisphereLight('#fff6ea', '#7a6a58', 1.6));
const sun = new THREE.DirectionalLight('#fff1d8', 2.4);
sun.position.set(2, 4, 3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 4, bottom: -2 });
scene.add(sun);
const rim = new THREE.DirectionalLight('#cfe0ff', 0.9); rim.position.set(-3, 2, -3); scene.add(rim);
const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: '#d9d1c3', roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 80);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.target.set(0, 1.0, 0);
camera.position.set(0, 1.35, 3.2);

let people: { p: Person; arch: Arch; seed: number; tag: HTMLElement }[] = [];
let current: Arch | 'all' | 'figs' = 'gamer';
const seeds: Partial<Record<Arch, number>> = {};
let mood: Mood = 'smile';
let pose: 'idle' | 'walk' | 'lean' | 'carry' | 'talk' = 'idle';
let spin = false;

const stepM = new THREE.MeshStandardMaterial({ color: '#cfc5b4', roughness: 0.9 });
const steps: THREE.Mesh[] = [];
function clear(): void {
  for (const x of figs) { x.g.removeFromParent(); x.tag.remove(); }
  figs = [];
  for (const x of people) { x.p.root.removeFromParent(); x.tag.remove(); }
  people = [];
  for (const st of steps) st.removeFromParent();
  steps.length = 0;
}

function spawn(arch: Arch, x: number, label: boolean): void {
  const seed = seeds[arch] ??= 100 + ORDER.indexOf(arch) * 37;
  const p = buildPerson(makeLook(arch, seed), seed);
  p.root.position.x = x;
  p.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  scene.add(p.root);
  const tag = document.createElement('div');
  tag.className = 'tag';
  tag.innerHTML = label ? NAMES[arch][0].split(' / ')[0] : NAMES[arch][0];
  tag.style.display = label ? '' : 'none';
  main.append(tag);
  people.push({ p, arch, seed, tag });
}

function show(which: Arch | 'all' | 'figs'): void {
  current = which;
  clear();
  if (which === 'figs') {
    // статуэтки 8–12 см — показываем в 12 раз крупнее, по кругу
    FIGS.forEach((f, i) => {
      const g = buildFigurine(f.id); g.scale.setScalar(12);
      // два ряда по четыре, лицом к камере; задний ряд чуть выше
      g.position.set(((i % 4) - 1.5) * 1.25, i < 4 ? 0 : 0.35, i < 4 ? 0.9 : -0.9); g.rotation.y = -0.35;
      g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
      scene.add(g);
      const tag = document.createElement('div'); tag.className = 'tag'; tag.textContent = FIG_NAMES[f.id] ?? f.id; main.append(tag);
      figs.push({ g, tag });
    });
    controls.target.set(0, 0.7, 0); camera.position.set(0, 2.4, 6.2);
    renderList(); renderTitle(); renderBar();
    return;
  }
  if (which === 'all') {
    // «фото класса»: три ступеньки по пять — видно всех целиком, подписи у ног
    const cols = 5, gap = 1.3, rise = 1.3, depth = 1.2;
    ORDER.forEach((a, i) => {
      const row = Math.floor(i / cols), k = i % cols, n = Math.min(cols, ORDER.length - row * cols);
      spawn(a, (k - (n - 1) / 2) * gap, true);
      people[people.length - 1].p.root.position.set((k - (n - 1) / 2) * gap, row * rise, -row * depth);
    });
    const rows = Math.ceil(ORDER.length / cols);
    for (let r = 1; r < rows; r++) { const st = new THREE.Mesh(new THREE.BoxGeometry(cols * gap + 0.6, r * rise, depth), stepM); st.position.set(0, (r * rise) / 2, -r * depth); st.receiveShadow = st.castShadow = true; scene.add(st); steps.push(st); }
    const hf = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    const dist = Math.max(7, ((cols * gap) / 2 + 0.4) / Math.tan(hf) + 2.2);
    controls.target.set(0, 2.0, -1.2); camera.position.set(0, 2.9, dist);
  } else {
    spawn(which, 0, false);
    controls.target.set(0, 0.95, 0); camera.position.set(0.9, 1.3, 4.6);
  }
  applyPose();
  renderList(); renderTitle(); renderBar();
}

function applyPose(): void {
  for (const { p } of people) {
    p.st.walking = pose === 'walk';
    p.st.leaning = pose === 'lean';
    p.st.carrying = pose === 'carry';
    p.st.talking = pose === 'talk';
    p.st.mood = mood;
    p.st.restY = pose === 'lean' ? 0.9 : null;
  }
}

function renderList(): void {
  const list = document.getElementById('list')!;
  list.innerHTML = '';
  const mk = (id: Arch | 'all' | 'figs', name: string, hint: string, cls = '') => {
    const b = document.createElement('button');
    b.className = cls + (current === id ? ' on' : '');
    b.innerHTML = `<b>${name}</b><small>${hint}</small>`;
    b.onclick = () => show(id);
    list.append(b);
  };
  mk('all', 'Все в ряд', String(ORDER.length), 'all');
  for (const a of ORDER) mk(a, NAMES[a][0], a);
  mk('figs', 'Статуэтки', String(FIGS.length), 'all');
}

function renderTitle(): void {
  const el = document.getElementById('title')!;
  if (current === 'figs') { el.innerHTML = '<b>Статуэтки</b><div>Показаны в 12 раз крупнее. Кошка машет лапкой, мини-ПК переливается.</div>'; return; }
  if (current === 'all') { el.innerHTML = '<b>Все персонажи</b><div>Подписи над головами. Нажми на имя слева, чтобы рассмотреть одного.</div>'; return; }
  const A = ARCHS[current];
  el.innerHTML = `<b>${NAMES[current][0]}</b> <small style="color:#6b7280">(${current}, вариант ${seeds[current]})</small>
    <div>${NAMES[current][1]} · заказы: ${A.presets.join(', ')} · с репутации ${A.minRep}</div>`;
}

function renderBar(): void {
  const bar = document.getElementById('bar')!;
  bar.innerHTML = '';
  const group = (label: string, items: [string, string, boolean, () => void][]) => {
    const g = document.createElement('div'); g.className = 'grp';
    const s = document.createElement('span'); s.textContent = label; g.append(s);
    for (const [, text, on, fn] of items) {
      const b = document.createElement('button'); b.textContent = text; if (on) b.className = 'on';
      b.onclick = () => { fn(); renderBar(); };
      g.append(b);
    }
    bar.append(g);
  };
  group('Поза', ([['idle', 'стоит'], ['walk', 'идёт'], ['lean', 'у прилавка'], ['carry', 'несёт'], ['talk', 'говорит']] as const)
    .map(([k, t]) => [k, t, pose === k, () => { pose = k; applyPose(); }]));
  group('Лицо', ([['smile', 'улыбка'], ['wow', 'восторг'], ['closed', 'хмурится'], ['sad', 'грусть']] as const)
    .map(([k, t]) => [k, t, mood === k, () => { mood = k; applyPose(); }]));
  group('', [
    ['spin', 'вращать', spin, () => { spin = !spin; }],
    ...(current !== 'all' && current !== 'figs' ? [['next', 'другой вариант', false, () => { const a = current as Arch; seeds[a] = (seeds[a] ?? 1) + 1; show(a); }] as [string, string, boolean, () => void]] : []),
  ]);
}

function resize(): void {
  const w = main.clientWidth, h = main.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(main);

const clock = new THREE.Clock();
const v = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
  for (const { p, tag } of people) {
    p.root.updateMatrixWorld();
    p.update(t, dt);
    // идущий — на месте (как на дорожке), иначе уходит из кадра
    if (spin) p.root.rotation.y += dt * 0.6;
    if (tag.style.display !== 'none') {
      p.root.getWorldPosition(v); v.y += 1.95 * p.root.scale.y;
      v.project(camera);
      tag.style.left = ((v.x + 1) / 2) * main.clientWidth + 'px';
      tag.style.top = ((1 - v.y) / 2) * main.clientHeight + 'px';
    }
  }
  for (const { g, tag } of figs) {
    (g.userData.tick as ((t: number) => void) | undefined)?.(t);
    if (spin) g.rotation.y += dt * 0.6;
    g.getWorldPosition(v); v.y += 1.35; v.project(camera);
    tag.style.left = ((v.x + 1) / 2) * main.clientWidth + 'px';
    tag.style.top = ((1 - v.y) / 2) * main.clientHeight + 'px';
  }
  controls.update();
  renderer.render(scene, camera);
});

resize();
show('all');
