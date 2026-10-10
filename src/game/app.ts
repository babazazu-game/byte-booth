import * as THREE from 'three';
import { Save } from 'yg-core';
import { core } from '../core.ts';
import { watchRewarded, interstitialBetweenLevels } from '../ads.ts';
import { Engine, type Quality } from '../render/engine.ts';
import { buildWorld, type World } from '../render/world.ts';
import { Views, ZONES, type Zone } from '../render/views.ts';
import { Director, walkerArchs } from './director.ts';
import { Bench } from './bench.ts';
import { Shelf } from './shelf.ts';
import { Hud } from '../ui/hud.ts';
import { Site, newsText } from '../ui/site.ts';
import { Menu, pauseMenu } from '../ui/menu.ts';
import { h, btn, toast, modal, confirmBox, floaty, isModalOpen } from '../ui/dom.ts';
import { sound } from '../audio/audio.ts';
import { t, variant, nameOf, money, lang } from '../i18n.ts';
import * as S from '../logic/state.ts';
import * as D from '../logic/daily.ts';
import { part, partOrNull } from '../logic/parts.ts';
import { ARCHS, makeLook } from '../logic/customers.ts';
import { buildPerson } from '../render/models/person.ts';
import { setLabelLang } from '../render/kit.ts';
import { BENCH } from '../render/kiosk.ts';
import { PcRig } from '../render/models/pc.ts';
import { buildFigurine } from '../render/models/figurine.ts';
import { wallOf, POSTERS } from '../logic/collect.ts';
import { repLevel, type Order } from '../logic/orders.ts';
import type { DistrictId } from '../logic/districts.ts';

/**
 * Приложение: состояние, сохранение, связка 3D ↔ логика ↔ интерфейс.
 *
 * Механика сама по себе живёт в logic/*, а здесь — только «режиссура»:
 * кто когда говорит, что показывать после действия, когда сохраняться.
 */

export interface Settings { music: number; sfx: number; amb: boolean; quality: Quality; hints: boolean; qualityChosen?: boolean; fps?: boolean }
interface SaveData extends Record<string, unknown> { game: S.GameState | null; settings: Settings }

const defaultQuality = (): Quality => (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mid' : 'high');

export class App {
  readonly engine: Engine;
  readonly world: World;
  readonly views: Views;
  readonly director: Director;
  readonly bench: Bench;
  readonly shelf: Shelf;
  readonly hud: Hud;
  readonly site: Site;
  readonly menu: Menu;
  readonly uiRoot: HTMLElement;
  state: S.GameState | null = null;
  settings: Settings;
  private save: Save<SaveData>;
  private clock = new THREE.Clock();
  private paused = false;
  dialogOpen = false;
  private choices: HTMLElement;
  private ptr = { x: 0, y: 0, down: false };
  /** Палец на холсте вне верстака: ведём взгляд, как мышью на ПК. */
  private look: { id: number; x: number; y: number; ox: number; oy: number; moved: boolean } | null = null;
  private lastLevel = 1;
  private lastDirState = 'none';
  private notesKey = '';
  /** Ответы в диалоге по клавишам 1–4 (пока открыт выбор, зоны цифрами не листаются). */
  private choiceKeys: (() => void)[] = [];

  constructor(parent: HTMLElement) {
    this.uiRoot = document.getElementById('ui')!;
    this.save = new Save<SaveData>('bytebooth.v1', { game: null, settings: { music: 0.55, sfx: 0.85, amb: true, quality: defaultQuality(), hints: true } });
    this.settings = { ...this.save.get('settings') };
    const g = this.save.get('game');
    this.state = g && g.v === 1 ? S.migrate(g) : null;
    // язык надписей на предметах — ДО постройки мира: текстуры рисуются сразу
    setLabelLang(lang());
    this.engine = new Engine(parent);
    // Встроенная/мобильная видеокарта — по умолчанию среднее качество. Только пока
    // игрок сам не выбрал: его выбор важнее догадки.
    if (!this.settings.qualityChosen && this.settings.quality === 'high' && /Intel|UHD|Iris|Mali|Adreno|PowerVR|SwiftShader/i.test(this.engine.gpuName())) this.settings.quality = 'mid';
    this.world = buildWorld(this.engine.scene);
    this.views = new Views(this.engine.camera);
    {
      // экран монитора в мировых координатах — для камеры «в мониторе»
      const m = this.world.screen.mesh;
      this.world.root.updateMatrixWorld(true);
      const c = m.getWorldPosition(new THREE.Vector3());
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(m.getWorldQuaternion(new THREE.Quaternion())).normalize();
      const g = (m.geometry as THREE.PlaneGeometry).parameters;
      this.views.pcScreen = { c, n, hw: g.width / 2, hh: g.height / 2 };
    }
    this.director = new Director(this.world.root, this.engine.camera);
    this.bench = new Bench(this);
    this.shelf = new Shelf(this.world.root);
    this.hud = new Hud(this);
    this.site = new Site(this);
    this.menu = new Menu(this);
    this.choices = h('div', { class: 'choices hidden' });
    this.uiRoot.append(this.choices);
    this.applySettings();
    this.world.signText(t('title').toUpperCase());
    this.spawnWalkers();
    this.bindInput();
    core.audio.setHandlers({ onSuspend: () => sound.suspend(), onResume: () => sound.resume() });
    core.i18n.onChange(() => this.onLang());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.clock.getDelta(); });
  }

  /* ───────────── запуск и меню ───────────── */

  /** Солнце в меню повёрнуто на 90° по часовой (вид сверху): фасад ларька не в тени. */
  private menuSun(on: boolean): void { this.world.sunYaw = on ? -Math.PI / 2 : 0; this.world.setPhase(this.phaseCur); }

  start(): void {
    this.views.menu = true;
    this.menuSun(true);
    this.views.snap();
    this.menu.show(true);
    if (this.state) this.syncAll();
    this.engine.renderer.setAnimationLoop(() => this.frame());
    /*
     * Музыка должна звучать уже в меню. Браузер не даёт звука до первого жеста,
     * поэтому контекст создаём сразу (если страница уже «активирована» кликом —
     * например, в iframe площадки, — музыка пойдёт мгновенно), а включаем по
     * ПЕРВОМУ касанию где угодно. Раньше звук будился только кнопкой «Играть»
     * и кликом по холсту, и меню стояло в тишине.
     */
    // тёплая виньетка по краям кадра — CSS-слой поверх холста, кадр не дорожает
    if (!this.uiRoot.querySelector('.vignette')) { const v = document.createElement('div'); v.className = 'vignette'; this.uiRoot.prepend(v); }
    sound.unlock();
    const wake = () => sound.unlock();
    for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(ev, wake, { capture: true, passive: true });
  }

  play(fresh: boolean): void {
    sound.unlock();
    if (fresh || !this.state) {
      this.state = S.newGame();
      this.bench.tested = {};
      this.persist();
    }
    this.lastLevel = S.level(this.state);
    this.menu.show(false);
    this.views.menu = false;
    this.menuSun(false);
    this.views.go('window');
    // из меню камера снаружи — не пролетаем сквозь стену, а сразу оказываемся внутри
    this.views.snap();
    this.hud.show(true);
    this.syncAll();
    this.warmGPU();
    core.gameplayStart();
    // ежедневный бонус ждёт — напоминаем, где его забрать
    if (this.state && this.state.tutorial >= 99 && D.bonusState(this.state, new Date()).ready) setTimeout(() => toast(t('bonus.toast'), 'good'), 1200);
    this.refresh();
  }

  toMenu(): void {
    this.persist();
    this.menuSun(true);
    this.closeDialog();
    this.views.menu = true;
    this.views.snap();
    this.hud.show(false);
    this.bench.show(false);
    this.site.show(false);
    this.menu.show(true);
    core.gameplayStop();
  }

  pause(): void { if (!this.views.menu) pauseMenu(this); }

  /**
   * Прогрев видеокарты: собрать шейдеры всех материалов и загрузить все
   * текстуры заранее, включая скрытое (верстак, полки, монитор, район).
   * Иначе это происходило при первом повороте к зоне — кадр «спотыкался».
   */
  warmGPU(): void {
    const R = this.engine.renderer, sc = this.engine.scene;
    const hidden: THREE.Object3D[] = [];
    sc.traverse((o) => { if (!o.visible && !o.userData.zone) { hidden.push(o); o.visible = true; } });
    sc.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      for (const mm of m ? (Array.isArray(m) ? m : [m]) : []) for (const v of Object.values(mm)) if ((v as THREE.Texture)?.isTexture) R.initTexture(v as THREE.Texture);
    });
    // compileAsync ставит программы в очередь синхронно — видимость можно вернуть сразу,
    // а сборку шейдеров драйвер доделает параллельно (KHR_parallel_shader_compile)
    void R.compileAsync(sc, this.engine.camera);
    for (const o of hidden) o.visible = false;
  }

  /** Привести 3D-мир к сохранению (после загрузки или новой игры). */
  private syncAll(): void {
    const s = this.state!;
    this.applyUpgrades();
    this.shelf.sync(s);
    this.bench.sync(false);
    this.phaseNow(this.phase());
    this.director.clear();
    // клиент, с которым не договорились до перезагрузки, ждёт у окна снова
    if (s.pending) { const o = s.pending; this.director.spawn(o.cust.look, o.cust.seed, () => this.offer()); }
  }

  phase(): number {
    const s = this.state;
    if (!s) return 0.25;
    return 0.12 + 0.78 * Math.min(1, s.visitsToday / S.visitsMax(s));
  }

  applyUpgrades(): void {
    const s = this.state; if (!s) return;
    this.world.setDistrict(s.district ?? 'park');
    const dec = S.upVal(s, 'decor');
    this.world.decor.forEach((d, i) => (d.visible = i < dec));
    const neon = S.upVal(s, 'sign');
    this.world.neon.forEach((n, i) => (n.visible = i < neon));
    this.world.coffee.visible = S.upVal(s, 'coffee') > 0;
    // покраска стен и коллекция статуэток на подставке
    this.world.wall.color.set(wallOf(s).hex);
    const slots = this.world.props.figSlots;
    const figs = s.figs ?? [];
    slots.forEach((slot, i) => {
      const want = figs[i] ?? '';
      if ((slot.userData.fig ?? '') === want) return;
      slot.clear(); slot.userData.fig = want;
      if (want) slot.add(buildFigurine(want));
    });
    const posters = s.posters ?? [];
    this.world.props.posterSlots.forEach((slot, i) => {
      const want = posters[i] ?? '';
      if ((slot.userData.poster ?? '') === want) return;
      slot.clear(); slot.userData.poster = want;
      if (!want) return;
      const w = slot.userData.w as number, hh = slot.userData.h as number;
      const tex = new THREE.TextureLoader().load('assets/tex/poster_' + POSTERS.findIndex((x) => x.id === want) + '.webp');
      tex.colorSpace = THREE.SRGBColorSpace;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.024, hh + 0.024, 0.012), new THREE.MeshStandardMaterial({ color: '#2a1d14', roughness: 0.6 }));
      frame.position.z = 0.006; slot.add(frame);
      const art = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
      art.position.z = 0.0125; slot.add(art);
    });
  }

  /**
   * Переезд в другой район: экран гаснет («эвакуатор везёт ларёк»), мир за
   * окном меняется, ларёк внутри остаётся тем же.
   */
  async moveDistrict(id: DistrictId): Promise<void> {
    const s = this.state!;
    const err = S.moveTo(s, id);
    if (err) { toast(t(err), 'bad'); return; }
    this.persist();
    const fade = this.fadeEl();
    fade.textContent = t('dist.moving');
    fade.classList.add('on');
    sound.whoosh();
    await new Promise((r) => setTimeout(r, 1300));
    this.world.setDistrict(id);
    this.warmGPU();
    this.director.clear();
    this.spawnWalkers();
    this.go('window');
    this.views.snap();
    await new Promise((r) => setTimeout(r, 500));
    fade.classList.remove('on');
    setTimeout(() => { fade.textContent = ''; }, 1800);
    toast(t('dist.arrived', { name: t('dist.' + id) }), 'good');
    if (!s.won && S.isLegend(s)) { s.won = true; this.persist(); setTimeout(() => this.victory(), 1500); }
    this.refresh();
  }

  /** Миниатюра статуэтки для магазина: один раз рендерится в картинку. */
  private figThumbs = new Map<string, string>();
  figThumb(id: string): string {
    const hit = this.figThumbs.get(id); if (hit) return hit;
    const W = 160, H = 160, R = this.engine.renderer;
    const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
    const sc = new THREE.Scene(); sc.background = null;
    sc.add(new THREE.HemisphereLight('#fff6ea', '#5a4a3a', 2.2));
    const dl = new THREE.DirectionalLight('#ffffff', 2.2); dl.position.set(0.3, 0.6, 0.8); sc.add(dl);
    const f = buildFigurine(id); sc.add(f);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 2); cam.position.set(0.12, 0.13, 0.24); cam.lookAt(0, 0.055, 0);
    const prev = R.getRenderTarget(); const env = sc.environment;
    R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear(); R.render(sc, cam); R.setRenderTarget(prev);
    void env;
    const px = new Uint8Array(W * H * 4); R.readRenderTargetPixels(rt, 0, 0, W, H, px);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    g.putImageData(img, 0, 0);
    rt.dispose();
    const u = c.toDataURL(); this.figThumbs.set(id, u); return u;
  }

  applySettings(): void {
    sound.setVolumes(this.settings.music, this.settings.sfx);
    sound.setAmbience(this.settings.amb);
    this.engine.setQuality(this.settings.quality, this.world.sun);
    // Лампы внутри ларька (точечная и прожектор над верстаком) — по ~2 мс каждая на
    // встроенной графике. На низком их заменяет рассеянный свет движка.
    // На среднем гасим ещё и прожектор над верстаком (~5 мс на встроенной графике):
    // свет считается для КАЖДОГО материала сцены, а не только под лампой.
    const q = this.settings.quality;
    for (const l of this.world.inner) l.visible = q === 'high' || (q === 'mid' && !(l as THREE.SpotLight).isSpotLight);
    if (this.walkersQ !== this.settings.quality) this.spawnWalkers();
    this.resizeNow();
  }
  /** Счётчик FPS: среднее за полсекунды, плюс текущий масштаб разрешения. */
  private fpsEl: HTMLElement | null = null;
  private fpsAcc = 0; private fpsN = 0;
  private tickFps(dt: number): void {
    // счётчик FPS по умолчанию включён — автор замеряет на телефонах
    if (this.settings.fps === false) { this.fpsEl?.remove(); this.fpsEl = null; return; }
    if (!this.fpsEl) { this.fpsEl = document.createElement('div'); this.fpsEl.className = 'fps'; this.uiRoot.append(this.fpsEl); }
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc < 0.5) return;
    const fps = Math.round(this.fpsN / this.fpsAcc), sc = Math.round(this.engine.renderScale * 100);
    const cv = this.engine.renderer.domElement;
    this.fpsEl.textContent = fps + ' FPS · ' + cv.width + '×' + cv.height + (sc < 100 ? ' · ' + sc + '%' : '');
    this.fpsEl.classList.toggle('bad', fps < 40);
    this.fpsAcc = 0; this.fpsN = 0;
  }
  /*
   * Время суток меняется плавно (а не скачком после каждого клиента): небо,
   * солнце и свет в ларьке «доезжают» до цели со скоростью phaseSpeed в секунду.
   */
  private phaseCur = 0.25; private phaseTo = 0.25; private phaseSpeed = 0.06;
  private phaseNow(p: number): void { this.phaseCur = this.phaseTo = p; this.world.setPhase(p); }
  private fade: HTMLElement | null = null;
  private fadeEl(): HTMLElement {
    if (!this.fade) { this.fade = document.createElement('div'); this.fade.className = 'fadeov'; this.uiRoot.append(this.fade); }
    return this.fade;
  }
  /**
   * Свет в ларьке. Вечером потолочный свет разгорается, экспозиция чуть
   * поднимается («глаз привыкает»). На среднем качестве прожектора над
   * верстаком нет (он дорог), поэтому единственная потолочная лампа
   * подъезжает к зоне, где игрок работает: над верстаком чёрный корпус
   * иначе тонул в темноте. Сдвиг лампы ничего не стоит — шейдеры те же.
   */
  private lightHome: THREE.Vector3 | null = null;
  private updateLight(dt: number): void {
    if (Math.abs(this.phaseTo - this.phaseCur) > 1e-4) {
      const d = this.phaseTo - this.phaseCur, st = this.phaseSpeed * dt;
      this.phaseCur += Math.abs(d) < st ? d : Math.sign(d) * st;
      this.world.setPhase(this.phaseCur);
    }
    const w = this.world, dusk = w.dusk;
    const ceil = w.inner.find((l) => (l as THREE.PointLight).isPointLight) as THREE.PointLight | undefined;
    const spot = w.inner.find((l) => (l as THREE.SpotLight).isSpotLight) as THREE.SpotLight | undefined;
    const spotOn = this.settings.quality === 'high';
    if (ceil) {
      if (!this.lightHome) { this.lightHome = ceil.position.clone(); ceil.userData.base = ceil.intensity; ceil.userData.dist = ceil.distance; }
      const z = this.views.zone, menu = this.views.menu;
      const tgt = menu ? this.lightHome : z === 'bench' && !spotOn ? new THREE.Vector3(BENCH.x + 0.28, 1.75, BENCH.z + 0.05)
        : z === 'shelf' ? new THREE.Vector3(0.6, 2.15, 1.3) : z === 'pc' ? new THREE.Vector3(0.1, 2.1, 1.45) : this.lightHome;
      ceil.position.lerp(tgt, Math.min(1, dt * 3));
      const work = !menu && z === 'bench' && !spotOn ? 0.8 : 1;
      ceil.intensity = (ceil.userData.base as number) * (1 + 0.5 * dusk) * work;
      ceil.distance = (ceil.userData.dist as number) * (1 + 0.3 * dusk);
    }
    if (spot) { if (spot.userData.base === undefined) spot.userData.base = spot.intensity; spot.intensity = (spot.userData.base as number) * (1 + 0.9 * dusk); }
    this.engine.renderer.toneMappingExposure = 1 + 0.12 * dusk * (this.views.menu ? 0.4 : 1);
  }
  /**
   * Магазин — «в мониторе»: DOM-панель натягивается ровно на четыре угла
   * экрана 3D-монитора через CSS matrix3d (гомография). Прямоугольник по
   * крайним точкам проекции при взгляде чуть сбоку торчал за рамку монитора.
   * Пока камера едет к монитору, панель скрыта и проявляется по прибытии.
   */
  private siteShown = 0;
  private placeSite(): void {
    const el = this.site.el, sc = this.views.pcScreen;
    // На низком экране (телефон лёжа) магазин «в мониторе» выходил крошечным —
    // там он обычной панелью во весь экран (стиль .site без .inmon).
    const compact = this.uiRoot.clientHeight < 560 || this.uiRoot.clientWidth < 700;
    const on = !compact && !this.views.menu && this.views.zone === 'pc' && !!sc;
    el.classList.toggle('inmon', on);
    // 3D-экран под открытым магазином прячем: его эмиссия просвечивала сквозь
    // слой с matrix3d «призрачным» текстом (видно на снимках экрана)
    this.world.screen.mesh.visible = !(on && this.siteShown > 0.9);
    if (!on || !sc) {
      this.siteShown = 0;
      if (el.style.transform) { el.style.transform = el.style.left = el.style.top = el.style.width = el.style.height = el.style.right = el.style.bottom = el.style.opacity = el.style.transformOrigin = ''; }
      return;
    }
    const cam = this.engine.camera; cam.updateMatrixWorld();
    const right = new THREE.Vector3(0, 1, 0).cross(sc.n).normalize(), up = sc.n.clone().cross(right).normalize();
    const W = this.uiRoot.clientWidth, H = this.uiRoot.clientHeight;
    // углы экрана: левый-верх, правый-верх, правый-низ, левый-низ (в пикселях)
    const P = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([a, b]) => {
      const p = sc.c.clone().addScaledVector(right, a * sc.hw).addScaledVector(up, b * sc.hh).project(cam);
      return [((p.x + 1) / 2) * W, ((1 - p.y) / 2) * H];
    });
    // CSS-размер панели ≈ её видимый размер, чтобы текст был почти 1:1
    const w0 = Math.max(320, (Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]) + Math.hypot(P[2][0] - P[3][0], P[2][1] - P[3][1])) / 2);
    const h0 = w0 * (sc.hh / sc.hw);
    const m = homography([[0, 0], [w0, 0], [w0, h0], [0, h0]], P);
    // показываем, когда камера доехала: угол между взглядом и нормалью экрана мал
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    const arrived = -dir.dot(sc.n) > 0.97 && cam.position.distanceTo(sc.c) < 0.9;
    this.siteShown = Math.min(1, Math.max(0, this.siteShown + (arrived ? 0.12 : -0.2)));
    Object.assign(el.style, {
      left: '0px', top: '0px', right: 'auto', bottom: 'auto', width: w0.toFixed(1) + 'px', height: h0.toFixed(1) + 'px',
      transformOrigin: '0 0', transform: m, opacity: String(this.siteShown), pointerEvents: this.siteShown > 0.5 ? '' : 'none',
    });
  }

  private walkersQ: Quality | null = null;
  /** Число прохожих и их тени зависят от качества — пересоздаём при смене. */
  private spawnWalkers(): void {
    const q = this.settings.quality;
    this.walkersQ = q;
    this.director.spawnWalkers(q === 'low' ? 1 : q === 'mid' ? 3 : 5, walkerArchs, q === 'high');
  }
  saveSettings(): void { this.save.set('settings', { ...this.settings }); }

  onLang(): void {
    setLabelLang(lang());
    document.title = t('title');
    this.world.signText(t('title').toUpperCase());
    this.menu.render();
    this.refresh();
  }

  persist(): void {
    if (!this.state) return;
    this.save.patch({ game: this.state, settings: { ...this.settings } });
  }

  /** Перерисовать всё, что зависит от состояния. */
  refresh(): void {
    const s = this.state;
    if (!s || this.views.menu) return;
    this.syncReturns();
    this.world.props.setCash(s.cash);
    this.hud.render();
    this.site.render();
    this.bench.refresh();
    this.shelf.sync(s);
    this.world.screen.draw([
      `${t('hud.day', { n: s.day })} · ${money(s.cash)}`,
      ...s.market.news.slice(-4).reverse().map((n) => t(n.key)),
    ]);
    this.world.props.setDay(s.day, lang() === 'ru');
    const notes = [`: `, t('hud.paste', { n: s.pasteUses }), t('hud.rep', { n: S.level(s) }), `→ `];
    const key = notes.join('|');
    if (key !== this.notesKey) { this.notesKey = key; this.world.props.setStickies(notes); }
    const lv = S.level(s);
    if (lv > this.lastLevel) { this.lastLevel = lv; sound.levelUp(); toast(t('day.levelUp', { n: lv }), 'good'); }
  }

  /* ───────────── зоны ───────────── */

  go(z: Zone): void {
    if (this.views.menu) return;
    if (this.views.zone === z) return;
    if (this.dialogOpen && z !== 'window') { toast(t('err.busyWindow')); return; }
    sound.whoosh();
    this.views.go(z);
    this.bench.show(z === 'bench');
    this.site.show(z === 'pc');
    if (z === 'pc') this.site.render();
    this.refresh();
    this.tutorialCheck();
  }
  turn(dir: number): void {
    const i = ZONES.indexOf(this.views.zone);
    this.go(ZONES[(i + dir + ZONES.length) % ZONES.length]);
  }

  custName(o: Order): string {
    const fem = ['bun', 'pony', 'long', 'bob'].includes(o.cust.look.hair);
    if (o.id === 1 && this.state && this.state.day === 1 && o.kind === 'build' && o.req.preset === 'office') return lang() === 'ru' ? 'Вовчик' : 'Vova';
    if (o.blogger) return t('blog.name');
    return nameOf(o.cust.nameIdx, fem);
  }

  /* ───────────── клиенты у окна ───────────── */

  callNext(): void {
    const s = this.state!;
    if (!this.director.free) return;
    // Очередь у окна: сначала тот, кто принёс ПК обратно, потом те, чей заказ
    // готов (приходят забирать сами), и только потом — новый клиент.
    const ret = S.dueReturn(s);
    if (ret) { this.returnVisit(ret); return; }
    const ready = s.orders.find((x) => x.state === 'ready');
    if (ready) { this.callBack(ready.id); return; }
    sound.deskBell();
    const first = s.day === 1 && s.nextOrder === 1;
    const err = S.callCustomer(s, (id) => part(id).price, first ? { arch: 'gamer', kind: 'build', preset: 'office' } : undefined);
    if (err) { toast(t(err), 'bad'); return; }
    const o = s.pending!;
    this.persist();
    this.director.spawn(o.cust.look, o.cust.seed, () => this.offer());
    this.phaseTo = this.phase(); this.phaseSpeed = 0.06;
    this.refresh();
  }

  /** Отладка: все архетипы в ряд за окном — проверить внешность глазами. */
  debugLineup(): void {
    const archs = Object.keys(ARCHS) as (keyof typeof ARCHS)[];
    archs.forEach((a, i) => {
      const seed = 500 + i * 37;
      const p = buildPerson(makeLook(a, seed), seed);
      p.root.position.set(-2.4 + (i % 6) * 0.95, 0, -1.6 - Math.floor(i / 6) * 1.6);
      this.world.root.add(p.root);
      p.update(1, 0.016);
    });
  }

  /** Отладка: все модели категории в ряд за окном. */
  debugShowcase(make: (i: number) => THREE.Object3D | null, cols = 5, dx = 0.42, dy = 0.3): void {
    for (let i = 0; i < 20; i++) {
      const o = make(i);
      if (!o) break;
      o.position.set(-((cols - 1) / 2) * dx + (i % cols) * dx, 1.45 - Math.floor(i / cols) * dy, -0.7);
      this.world.root.add(o);
    }
  }

  /** Отладка (?debug=1): позвать клиента с заданным видом заказа. */
  debugCustomer(kind: 'build' | 'upgrade' | 'clean', preset = 'fhd'): void {
    const s = this.state!;
    if (!this.director.free) return;
    S.callCustomer(s, (id) => part(id).price, { kind, preset });
    const o = s.pending;
    if (o) this.director.spawn(o.cust.look, o.cust.seed, () => this.offer());
  }

  private offerText(o: Order, seed: number): string {
    if (o.id === 1 && this.state!.day === 1) return t('tut.friend', { n: o.pay });
    const r = o.req;
    const need = o.kind === 'clean' ? variant('need.clean', undefined, seed) : o.kind === 'upgrade' ? variant('need.upgrade.' + r.upCat, undefined, seed) : variant('need.build.' + r.preset, undefined, seed);
    const extras: string[] = [];
    if (r.white) extras.push(t('extra.white'));
    if (r.rgb) extras.push(t('extra.rgb'));
    if (r.silent) extras.push(t('extra.silent'));
    if (r.vendor) extras.push(t('extra.vendor', { v: r.vendor === 'amd' ? 'AMD' : 'Intel' }));
    if (r.reliable) extras.push(t('extra.reliable'));
    if (r.main) extras.push(t('main.' + r.main));
    if (o.brought?.length) extras.push(t('extra.brought', { list: [...new Set(o.brought)].map((id) => t('step.' + part(id).cat) + ' ' + part(id).name).join(', ') }));
    const hello = o.blogger ? t('blog.intro') : o.regular ? variant(o.regular.stars >= 4 ? 'greet.regularGood' : 'greet.regularBad', undefined, seed) : variant('greet.' + o.cust.arch, undefined, seed);
    return [hello, need, ...extras, variant('ask.budget', { n: (o.pay + o.haggle).toLocaleString('en-US') }, seed)].join(' ');
  }

  /** Клиент дошёл до окна — предложение и варианты ответа. */
  private offer(): void {
    const s = this.state!;
    const o = s.pending;
    if (!o) return;
    this.dialogOpen = true;
    this.director.say(this.offerText(o, o.cust.seed), this.custName(o));
    let haggled = false;
    const draw = () => {
      this.showChoices([
        { label: t('dlg.take', { n: (o.pay + o.haggle).toLocaleString('en-US') }), cls: 'primary', fn: () => this.accept() },
        ...(haggled ? [] : [{ label: t('dlg.haggle'), cls: '', fn: () => {
          haggled = true;
          const ok = S.haggle(s, ARCHS[o.cust.arch].haggle);
          this.persist();
          if (ok) { this.director.setMood('wow'); this.director.say(variant('reply.haggleYes'), this.custName(o)); sound.coin(); draw(); }
          else if (Math.random() < 0.3) { this.director.say(variant('reply.haggleLeave'), this.custName(o)); this.hideChoices(); setTimeout(() => this.decline(true), 1600); }
          else { this.director.setMood('closed'); this.director.say(variant('reply.haggleNo'), this.custName(o)); draw(); }
        } }]),
        { label: t('dlg.details'), cls: '', fn: () => { this.director.say(this.hud.reqLines(o).map((l) => l.text).join(' · '), this.custName(o)); } },
        { label: t('dlg.decline'), cls: 'ghost', fn: () => this.decline(false) },
      ]);
    };
    draw();
    this.refresh();
    this.tutorialCheck();
  }

  private accept(): void {
    const s = this.state!;
    const o = s.pending; if (!o) return;
    const err = S.acceptPending(s);
    if (err) { toast(t(err === 'err.slotsFull' ? 'dlg.slotsFull' : err), 'bad'); return; }
    sound.paper();
    this.director.setMood('smile');
    this.director.say(variant('reply.accept'), this.custName(o));
    this.hideChoices();
    this.persist();
    setTimeout(() => { this.director.leave(null, 'smile', () => this.refresh()); this.dialogOpen = false; this.refresh(); }, 1300);
    this.refresh();
    this.tutorialCheck();
  }

  private decline(silent: boolean): void {
    const s = this.state!;
    const o = s.pending; if (!o) return;
    S.declinePending(s);
    this.persist();
    if (!silent) this.director.say(variant('reply.decline'), this.custName(o));
    this.director.setMood('sad');
    this.hideChoices();
    setTimeout(() => { this.director.leave(null, 'sad', () => this.refresh()); this.dialogOpen = false; this.refresh(); }, silent ? 200 : 1300);
  }

  /** Позвать клиента за готовым заказом. */
  callBack(orderId: number): void {
    const s = this.state!;
    const o = s.orders.find((x) => x.id === orderId);
    if (!o || !this.director.free) return;
    sound.deskBell();
    this.dialogOpen = true;
    this.showPickup(o);
    this.director.spawn(o.cust.look, o.cust.seed, () => {
      // пара фраз перед выдачей: клиент интересуется, мастер может рассказать о сборке
      this.director.say(variant('reply.come'), this.custName(o));
      this.showChoices([
        { label: t('dlg.give'), cls: 'primary', fn: () => this.handOver(o) },
        { label: t('dlg.explain'), cls: '', fn: () => {
          this.hideChoices();
          this.director.setMood('wow');
          this.director.say(variant(o.kind === 'clean' ? 'talk.clean' : 'talk.build'), this.custName(o));
          setTimeout(() => this.showChoices([{ label: t('dlg.give'), cls: 'primary', fn: () => this.handOver(o) }]), 1500);
        } },
      ]);
    });
    this.refresh();
  }

  /**
   * Перед выдачей — разговор о деньгах:
   *  - детали клиента не подошли и мастер поставил свои — просим доплату,
   *    клиент может согласиться или поторговаться;
   *  - иначе клиент сам иногда просит скинуть немного.
   * Только потом сама выдача (handOverNow).
   */
  private handOver(o: Order): void {
    const s = this.state!;
    const name = this.custName(o);
    const extra = S.surcharge(s, o);
    const hag = ARCHS[o.cust.arch].haggle;
    if (extra > 0) {
      this.director.say(variant('own.ask'), name);
      this.showChoices([
        { label: t('own.askBtn', { n: money(extra) }), cls: 'primary', fn: () => {
          this.hideChoices();
          // согласится ли сразу — зависит от характера; иначе встречное предложение
          if (Math.random() > hag * 0.8) { this.director.setMood('smile'); this.director.say(variant('own.yes'), name); setTimeout(() => this.handOverNow(o, { extra }), 1200); return; }
          const half = Math.round((extra * 0.6) / 5) * 5;
          this.director.setMood('closed');
          this.director.say(t('own.counter', { n: money(half) }), name);
          this.showChoices([
            { label: t('own.agree', { n: money(half) }), cls: 'primary', fn: () => this.handOverNow(o, { extra: half }) },
            { label: t('own.insist', { n: money(extra) }), cls: '', fn: () => { this.hideChoices(); this.director.say(variant('own.grumble'), name); setTimeout(() => this.handOverNow(o, { extra, noTip: true }), 1300); } },
          ]);
        } },
        { label: t('own.free'), cls: 'ghost', fn: () => { s.xp += 3; this.handOverNow(o, {}); } },
      ]);
      return;
    }
    // заметил б/у в новой сборке — крутит носом и просит скинуть
    S.rollUsedNotice(s, o);
    if (o.usedNotice) {
      const n = o.usedNotice;
      this.hideChoices();
      this.director.setMood('closed');
      this.director.say(variant('usedn.ask', { n: money(n) }), name);
      setTimeout(() => this.showChoices([
        { label: t('usedn.yes', { n: money(n) }), cls: 'primary', fn: () => this.handOverNow(o, { discount: n }) },
        { label: t('usedn.no'), cls: '', fn: () => { this.hideChoices(); s.xp = Math.max(0, s.xp - 2); this.director.say(variant('usedn.grumble'), name); setTimeout(() => this.handOverNow(o, { noTip: true }), 1300); } },
      ]), 600);
      return;
    }
    S.rollBargain(s, o, hag);
    if (o.bargain) {
      this.hideChoices();
      this.director.setMood('closed');
      this.director.say(variant('barg.ask', { n: money(o.bargain) }), name);
      setTimeout(() => this.showChoices([
        { label: t('barg.yes', { n: money(o.bargain!) }), cls: 'primary', fn: () => { s.xp += 2; this.handOverNow(o, { discount: o.bargain }); } },
        { label: t('barg.no'), cls: '', fn: () => { this.hideChoices(); this.director.say(variant('barg.grumble'), name); setTimeout(() => this.handOverNow(o, { noTip: true }), 1300); } },
      ]), 600);
      return;
    }
    this.handOverNow(o, {});
  }

  private handOverNow(o: Order, opt: { discount?: number; extra?: number; noTip?: boolean }): void {
    const s = this.state!;
    this.hideChoices();
    const wonBefore = s.won;
    const ev = S.deliver(s, o.id, opt);
    if (!ev) return;
    this.persist();
    // плохую сборку клиент на месте не замечает — радуется сдержанно и уходит
    const bad = ev.stars <= 2;
    const mood = ev.stars >= 4 && !bad ? 'wow' : 'smile';
    this.director.setMood(mood);
    // живая реакция: про главное пожелание или про то, ради чего покупал
    const mainOk = o.req.main && ev.checks.filter((c) => c.main).every((c) => c.ok);
    const line = bad ? variant('react.later') : ev.stars >= 4 && mainOk ? variant('react.main.' + o.req.main) : ev.stars >= 4 ? variant('react.p.' + (o.kind === 'build' ? o.req.preset : o.kind)) : variant('react.' + ev.stars);
    this.director.say(line, this.custName(o));
    if (ev.payout + ev.tip > 0) { sound.cash(); const ui = this.uiRoot; floaty('+' + money(ev.payout + ev.tip), ui.clientWidth / 2 - 40, ui.clientHeight * 0.45); }
    setTimeout(() => {
      const stars = h('div', { class: 'stars' }, ...[1, 2, 3, 4, 5].map((i) => h('span', { class: i <= ev.stars ? '' : 'off' }, '★')));
      const list = h('div', {}, ...ev.checks.map((c) => h('div', { class: 'kv' }, h('span', {}, t(c.key, c.vars)), h('b', { style: `color:${c.ok ? '#3f9a5a' : '#d2462f'}` }, c.ok ? '✓' : '✗'))));
      const money1 = h('div', {}, h('div', { class: 'kv' }, h('span', {}, t('res.paid')), h('b', {}, money(ev.payout))), h('div', { class: 'kv' }, h('span', {}, t('res.tip')), h('b', {}, money(ev.tip))), h('div', { class: 'kv' }, h('span', {}, t('res.rep')), h('b', {}, bad ? '?' : (ev.xp >= 0 ? '+' : '') + ev.xp)));
      const body: (Node | string)[] = [stars, list, money1];
      if (bad) body.push(h('p', { class: 'warn' }, t('res.willReturn')));
      const buttons = [{ label: t('ok'), cls: 'primary' }] as { label: string; cls?: string; act?: () => boolean | void }[];
      if (ev.tip > 0) buttons.unshift({ label: '▶ ' + t('ad.double'), cls: 'teal', act: () => { void watchRewarded().then((ok) => { if (ok) { s.cash += ev.tip; s.today.tips += ev.tip; this.persist(); sound.cash(); toast('+' + money(ev.tip), 'good'); this.refresh(); } }); } });
      modal(t('res.title'), body, buttons);
      if (!wonBefore && s.won) setTimeout(() => this.victory(), 400);
    }, 900);
    setTimeout(() => {
      // забирает свой ПК с прилавка в руки и уходит с ним
      const rig = this.pickupRig; this.pickupRig = null;
      if (rig) this.director.leaveWith(rig.group, mood, () => this.refresh(), rig.W * 1.15, rig.D / 2);
      else this.director.leave(o.build.case ?? null, mood, () => this.refresh());
      this.dialogOpen = false;
      this.refresh();
    }, 2200);
    this.refresh();
    this.tutorialCheck(true);
  }

  /**
   * Клиент вернулся с ПК: называет, что не так, и мастер выбирает исход —
   * переделать бесплатно, вернуть деньги или вернуть часть.
   */
  private returnVisit(o: Order): void {
    const s = this.state!;
    sound.deskBell();
    this.dialogOpen = true;
    this.director.spawn(o.cust.look, o.cust.seed, () => {
      this.director.setMood('sad');
      const ev = o.result;
      // Претензия называет, ЧТО не так: иначе игрок не поймёт, за что его ругают, и не научится.
      const why = ev ? ev.checks.filter((c) => !c.ok).slice(0, 2).map((c) => t(c.key, c.vars)).join('; ') : '';
      this.director.say(variant('complain.text') + (why ? ' ' + t('complain.why') + ' ' + why + '.' : ''), this.custName(o));
      const share = (ev?.stars ?? 1) <= 1 ? 0.6 : 0.3;
      const part = Math.round(((o.paid ?? 0) * share) / 5) * 5;
      const bye = (line: string, mood: 'sad' | 'smile') => {
        this.hideChoices();
        this.director.say(line, this.custName(o));
        this.persist();
        setTimeout(() => { this.director.leave(null, mood, () => this.refresh()); this.dialogOpen = false; this.refresh(); }, 1600);
        this.syncReturns();
        this.refresh();
      };
      this.showChoices([
        { label: t('complain.fix'), cls: 'primary', fn: () => { S.returnFix(s, o.id); sound.paper(); bye(variant('complain.fixReply'), 'smile'); toast(t('complain.fixToast'), 'good'); } },
        { label: t('complain.refund', { n: money(o.paid ?? 0) }), cls: '', fn: () => { const back = S.returnRefund(s, o.id); sound.error(); bye(variant('complain.refundReply'), 'sad'); toast(t('complain.refundToast', { n: back.length }), 'bad'); } },
        { label: t('complain.discount', { n: money(part) }), cls: 'ghost', fn: () => { S.returnDiscount(s, o.id, share); sound.coin(); bye(variant('complain.discountReply'), 'smile'); } },
      ]);
    });
    this.refresh();
  }

  /*
   * Возвращённый ПК стоит на прилавке у окна, пока заказ не уйдёт на верстак:
   * видно, что клиент принёс компьютер обратно и он ждёт переделки.
   */
  /** Готовый ПК клиента стоит на прилавке, пока он его не заберёт. */
  private pickupRig: PcRig | null = null;
  private showPickup(o: Order): void {
    this.pickupRig?.group.removeFromParent();
    const rig = new PcRig();
    rig.sync({ ...o.build, panel: true });
    rig.panelOpen = 0; rig.panelTarget = 0; rig.update(0, 0, false);
    // справа от окна, стеклом к мастеру: собранное видно, клиента не закрывает
    // чуть крупнее натуральной величины: с места мастера корпус читается лучше
    rig.group.scale.setScalar(1.15);
    rig.group.position.set(0.5, (rig.H / 2) * 1.15 + 0.002, -0.16);
    rig.group.rotation.y = -Math.PI / 2 + 0.4;
    this.world.counterAnchor.add(rig.group);
    this.pickupRig = rig;
  }

  private returnRig: PcRig | null = null;
  syncReturns(): void {
    const s = this.state; if (!s) return;
    const o = s.orders.find((x) => x.returned && x.state === 'active' && s.bench !== x.id && x.build.case);
    if (!o) { if (this.returnRig) this.returnRig.group.visible = false; return; }
    if (!this.returnRig) {
      this.returnRig = new PcRig();
      this.returnRig.group.position.set(-1.0, 0, 0.14);
      this.returnRig.group.rotation.y = -Math.PI / 2 + 0.35;
      this.world.counterAnchor.add(this.returnRig.group);
    }
    this.returnRig.sync({ case: o.build.case, panel: true });
    // начало координат модели — центр корпуса: ставим дном на столешницу
    this.returnRig.group.position.y = this.returnRig.H / 2 + 0.002;
    this.returnRig.panelOpen = 0; this.returnRig.panelTarget = 0;
    this.returnRig.update(0, 0, false);
    this.returnRig.group.visible = true;
  }

  /** Финал: купить свой магазин — титры и выбор «играть дальше». */
  buyShop(): void {
    const s = this.state!;
    confirmBox(t('shop.confirm', { n: money(D.SHOP.price) }), t('shop.buy', { n: money(D.SHOP.price) }), () => {
      if (!D.buyShop(s)) return;
      this.persist(); sound.levelUp(); this.refresh();
      modal(t('shop.endTitle'), [h('p', {}, t('shop.endText', { days: s.day, built: s.built, earned: money(s.totalEarned) }))], [{ label: t('shop.continue'), cls: 'primary' }, { label: t('shop.toMenu'), cls: 'ghost', act: () => { this.toMenu(); } }]);
    });
  }

  private victory(): void {
    sound.levelUp();
    modal(t('win.title'), [h('p', {}, t('win.text'))], [{ label: t('win.ok'), cls: 'primary' }]);
  }

  private showChoices(list: { label: string; cls: string; fn: () => void }[]): void {
    this.choices.innerHTML = '';
    this.choiceKeys = list.map((c) => c.fn);
    list.forEach((c, i) => this.choices.append(btn([h('span', { class: 'key' }, String(i + 1)), c.label], c.fn, c.cls)));
    this.choices.classList.remove('hidden');
    this.hud.setActionsVisible(false);
  }
  private hideChoices(): void { this.choices.classList.add('hidden'); this.choiceKeys = []; this.hud.setActionsVisible(true); }
  private closeDialog(): void { this.hideChoices(); this.dialogOpen = false; }

  /* ───────────── день ───────────── */

  closeDay(): void {
    const s = this.state!;
    if (!this.director.free) return;
    confirmBox(t('day.closeConfirm', { n: S.rent(s) }), t('hud.closeDay'), () => this.endDay());
  }

  private endDay(): void {
    const s = this.state!;
    const st = S.endDay(s);
    this.phaseTo = 1; this.phaseSpeed = 0.18;
    sound.cash();
    this.persist();
    const net = st.income + st.tips + st.sold - st.spent - st.rent;
    const kv = (k: string, v: number, cls = '') => h('div', { class: 'kv ' + cls }, h('span', {}, t(k)), h('b', { style: v < 0 ? 'color:#d2462f' : '' }, money(v)));
    const body: (Node | string)[] = [
      kv('day.income', st.income), kv('day.tips', st.tips), kv('day.sold', st.sold), kv('day.spent', -st.spent), kv('day.rent', -st.rent), kv('day.net', net, 'total'), kv('day.cash', s.cash, 'total'),
    ];
    if (st.stars.length) body.unshift(h('div', { class: 'stars' }, '★'.repeat(Math.round(st.stars.reduce((a, b) => a + b, 0) / st.stars.length))));
    // три факта дня: сколько заработал, кто был доволен больше всех, на чём потерял
    const bestO = st.best ? s.orders.find((o) => o.id === st.best!.id) : undefined;
    const loss = (st.losses ?? []).slice().sort((a, b) => b.n - a.n)[0];
    body.unshift(h('div', { class: 'dayfacts' },
      h('div', {}, '💰 ' + t(net >= 0 ? 'day.f.profit' : 'day.f.minus', { n: money(Math.abs(net)) })),
      h('div', {}, '😊 ' + (bestO ? t('day.f.best', { name: this.custName(bestO), n: '★'.repeat(st.best!.stars) }) : t('day.f.nobody'))),
      h('div', {}, '📉 ' + (loss ? t('day.f.loss', { what: t(loss.k), n: money(loss.n) }) : t('day.f.noloss')))));
    if (s.cash < 0) body.push(h('p', { style: 'color:#d2462f;font-weight:700' }, t('day.debt')));
    modal(t('day.title', { n: s.day }), body, [{ label: t('day.next'), cls: 'primary', act: () => { void this.nextDay(); } }]);
    this.refresh();
  }

  private async nextDay(): Promise<void> {
    const s = this.state!;
    core.gameplayStop();
    // Полноэкранная реклама — только здесь: между днями и по нажатию игрока (п. 4.4).
    // экран гаснет — ночь — и новый день начинается с рассвета
    const fade = this.fadeEl();
    fade.classList.add('on');
    await new Promise((r) => setTimeout(r, 900));
    await interstitialBetweenLevels();
    S.startNextDay(s);
    this.persist();
    this.phaseNow(-0.3);
    this.phaseTo = this.phase(); this.phaseSpeed = 0.09;
    setTimeout(() => fade.classList.remove('on'), 250);
    core.gameplayStart();
    this.refresh();
    toast(t('hud.day', { n: s.day }), 'good');
    // первая новость дня — сразу на экран, остальные во вкладке «Новости»
    const first = s.market.news.find((n) => n.day === s.day);
    if (first) setTimeout(() => toast('📰 ' + newsText(first)), 1800);
  }

  /* ───────────── обучение ───────────── */

  tutorialCheck(delivered = false): void {
    const s = this.state;
    if (!s || s.tutorial >= 99) return;
    const step = s.tutorial;
    let next = step;
    const first = s.orders.find((o) => o.id === 1);
    if (step === 0 && s.pending) next = 1;
    if (step <= 1 && first && first.state !== 'done') next = Math.max(next, 2);
    if (next === 2 && this.views.zone === 'pc') next = 3;
    if (next === 3) {
      const cats = new Set(s.inv.map((i) => part(i.id).cat));
      const b = first?.build ?? {};
      const need = ['mb', 'cpu', 'cooler', 'ram', 'ssd', 'gpu', 'psu'] as const;
      if (need.every((c) => cats.has(c) || b[c])) next = 4;
    }
    if (next === 4 && first) {
      const b = first.build;
      if (b.mb && b.cpu && b.paste && b.cooler && b.ram && b.ssd && b.gpu && b.psu && !this.bench.pendingScrews) next = 5;
    }
    if (next === 5 && first) { const tr = this.bench.tested[first.id]; if (tr && (tr.stage === 'ok' || tr.stage === 'throttle')) next = 6; if (first.state === 'ready') next = 6; }
    if (delivered && next >= 2) next = 7;
    if (next !== step) {
      s.tutorial = next;
      this.persist();
      this.hud.render();
      if (next === 7) setTimeout(() => { if (this.state && this.state.tutorial === 7) { this.state.tutorial = 99; this.persist(); this.hud.render(); } }, 9000);
    }
  }

  /* ───────────── ввод ───────────── */

  private bindInput(): void {
    const cv = this.engine.renderer.domElement;
    cv.addEventListener('pointerdown', (e) => {
      sound.unlock();
      this.ptr.down = true;
      if (!this.views.menu && this.views.zone === 'bench' && !isModalOpen()) this.bench.pointerDown(e);
      else if (e.pointerType !== 'mouse' && !this.views.menu) { const lo = this.views.lookOff; this.look = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: lo.x, oy: lo.y, moved: false }; }
    });
    window.addEventListener('pointermove', (e) => {
      const r = cv.getBoundingClientRect();
      this.ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.ptr.y = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (!this.views.menu && this.views.zone === 'bench') this.bench.pointerMove(e);
      else if (e.pointerType === 'mouse') this.views.pointer(this.ptr.x, this.ptr.y);
      else if (this.look && e.pointerId === this.look.id) {
        // палец ведёт взгляд, как мышь на ПК: вправо — смотрим правее (по сдвигу, без рывка к пальцу)
        const L = this.look, dx = (e.clientX - L.x) / r.width, dy = (e.clientY - L.y) / r.height;
        if (Math.abs(e.clientX - L.x) + Math.abs(e.clientY - L.y) > 10) L.moved = true;
        const cl = (v: number) => Math.max(-1, Math.min(1, v));
        this.views.pointer(cl(L.ox + dx * 2.4), cl(L.oy + dy * 2.4));
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (!this.ptr.down) return;
      this.ptr.down = false;
      const dragged = !!this.look?.moved; this.look = null;
      if (dragged) return;
      if (this.views.menu || isModalOpen()) return;
      if (this.views.zone === 'bench') this.bench.pointerUp(e);
      else if (this.views.zone === 'window') this.tapWindow(e);
    });
    cv.addEventListener('wheel', (e) => { if (this.views.zone === 'bench') { this.bench.wheel(e.deltaY); e.preventDefault(); } }, { passive: false });
    window.addEventListener('keydown', (e) => {
      sound.unlock();
      if (e.key === 'Escape') { if (!isModalOpen()) this.pause(); return; }
      if (this.views.menu || isModalOpen() || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      // e.code, а не e.key: в русской раскладке «A» — это «Ф», и клавиши молча не работали бы.
      if (this.views.zone === 'bench' && this.bench.hotkey(e.code)) { e.preventDefault(); return; }
      const dg = /^Digit([1-4])$/.exec(e.code);
      if (dg && this.choiceKeys.length) { const fn = this.choiceKeys[Number(dg[1]) - 1]; if (fn) { sound.click(); fn(); } return; }
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.turn(-1);
      if (e.code === 'KeyD' || e.code === 'ArrowRight') this.turn(1);
      const m = /^Digit([1-4])$/.exec(e.code);
      if (m) this.go((['window', 'bench', 'pc', 'shelf'] as Zone[])[Number(m[1]) - 1]);
      if (this.views.zone === 'window' && e.code === 'Space' && this.director.free && !this.dialogOpen) { e.preventDefault(); this.callNext(); }
    });
  }

  /** Нажатие по звонку на прилавке — то же, что кнопка «Позвать клиента». */
  private tapWindow(e: PointerEvent): void {
    const cv = this.engine.renderer.domElement;
    const r = cv.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.engine.camera);
    if (ray.intersectObject(this.world.bell, true).length && this.director.free && !this.dialogOpen) {
      const s = this.state!;
      if (s.visitsToday < S.visitsMax(s)) this.callNext(); else { sound.deskBell(); toast(t('err.dayOver')); }
    }
  }

  /* ───────────── кадр ───────────── */

  resizeNow(): void {
    const p = this.engine.renderer.domElement.parentElement;
    if (p) this.engine.resize(p.clientWidth || 1, p.clientHeight || 1, Math.min(window.devicePixelRatio || 1, 2));
    this.setLayout(this.uiRoot.clientWidth, this.uiRoot.clientHeight);
  }
  /** Раскладка под телефон: вертикально / горизонтально / обычная. */
  setLayout(W: number, H: number): void {
    this.views.phone = H < 560 ? 'landscape' : W < 700 ? 'portrait' : null;
  }

  /**
   * Перемотка времени для отладки (?debug=1): когда вкладка в фоне,
   * браузер не даёт кадров, и проверить анимацию иначе нельзя.
   */
  debugStep(seconds: number): void {
    const steps = Math.ceil(seconds * 30);
    let t = this.clock.elapsedTime;
    for (let i = 0; i < steps; i++) {
      t += 1 / 30;
      this.views.update(1 / 30, t);
      this.director.update(t, 1 / 30);
      this.bench.update(t, 1 / 30);
      this.updateLight(1 / 30);
    }
    this.placeSite();
    this.engine.render();
  }

  private frame(): void {
    const raw = this.clock.getDelta();
    const dt = Math.min(0.05, raw);
    if (this.paused || document.hidden) return;
    this.engine.adapt(raw);
    this.tickFps(raw);
    this.updateLight(dt);
    this.placeSite();
    const t = this.clock.elapsedTime;
    this.views.update(dt, t);
    this.director.update(t, dt);
    // Клиент ушёл — кнопки у окошка («Позвать», «Закрыть смену») перерисовываем
    // всегда, а не только в колбэке ухода: после последней выдачи кнопка
    // «Закрыть смену» иногда не загоралась, пока игрок не заходил в магазин.
    const ds = this.director.free ? 'free' : this.director.state;
    if (ds !== this.lastDirState) { this.lastDirState = ds; if (ds === 'free' && !this.views.menu) { this.dialogOpen = false; this.refresh(); } }
    this.bench.update(t, dt);
    this.world.update(t, dt);
    // как часто перерисовывать тени: клиент двигается — каждый кадр, стоит — раз в 3, нет — раз в 12
    const pp = this.director.person;
    // клиент у окна — тени каждый кадр (иначе его тень дёргалась), никого — раз в 8 кадров
    this.engine.shadowEvery = pp ? 1 : 8;
    if (this.bench.shadowDirty) { this.engine.shadowDirty = true; this.bench.shadowDirty = false; }
    // живые статуэтки: машущая кошка, переливающийся мини-ПК
    for (const slot of this.world.props.figSlots) for (const c of slot.children) (c.userData.tick as ((t: number) => void) | undefined)?.(t);
    this.engine.render();
  }
}

export { partOrNull, repLevel };

/**
 * CSS matrix3d, переводящая четырёхугольник src в dst (по 4 точкам).
 * Решаем 8 уравнений гомографии методом Гаусса.
 */
function homography(src: number[][], dst: number[][]): string {
  const A: number[][] = [], b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const n = 8;
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const k = A[r][c] / A[c][c]; for (let q = c; q < n; q++) A[r][q] -= k * A[c][q]; b[r] -= k * b[c]; }
  }
  const h = b.map((v, i) => v / A[i][i]);
  // h = [a b c d e f g k]: u = (a x + b y + c)/(g x + k y + 1)
  const M = [h[0], h[3], 0, h[6], h[1], h[4], 0, h[7], 0, 0, 1, 0, h[2], h[5], 0, 1];
  return 'matrix3d(' + M.map((v) => v.toFixed(8)).join(',') + ')';
}
