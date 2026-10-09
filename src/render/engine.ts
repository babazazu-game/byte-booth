import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { setAnisotropy, setEnv } from './kit.ts';

/**
 * Рендерер, сцена, камера, пост-обработка и уровни качества.
 *
 * Качество — три ступени, и разница между ними не косметическая:
 *   low  — без теней, без bloom, плотность пикселей 1: старые телефоны;
 *   mid  — тени 1024 (PCF);
 *   high — тени 2048 (PCFSoft), отражения окружения.
 *
 * Bloom (пост-обработку) убрали совсем: через EffectComposer терялось штатное
 * сглаживание, а буфер с MSAA для него стоил на встроенной графике дороже всей
 * сцены. Свечение вывесок и экранов держится на самосвечении материалов.
 * По умолчанию на мобильных — mid, на десктопе — high.
 */

export type Quality = 'low' | 'mid' | 'high';

/*
 * Пропуск расчёта света там, куда он не достаёт (за радиусом лампы, вне конуса
 * прожектора). Штатный шейдер считает GGX для каждого света во всех пикселях;
 * при visible = false вклад и так нулевой, картинка идентична.
 */
THREE.ShaderChunk.lights_fragment_begin = THREE.ShaderChunk.lights_fragment_begin
  .split('RE_Direct( directLight,').join('if ( directLight.visible ) RE_Direct( directLight,');

/** Бюджет пикселей буфера по качеству: время кадра пропорционально их числу. */
const MAX_PX: Record<Quality, number> = { low: 0.8e6, mid: 1.2e6, high: 1.45e6 };

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  // near 0.05, не 0.03: ближе 35 см камера ни к чему не подходит, а точность
  // глубины от near зависит сильнее всего — дальние грани парка мерцали.
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.05, 140);
  quality: Quality = 'high';
  private w = 1; private h = 1; private dpr = 1;
  private env: THREE.Texture | null = null;
  /** Подмена карты окружения на слабых качествах: равномерный «рассеянный» свет почти бесплатен. */
  private amb = new THREE.AmbientLight('#ffe4c8', 0);
  /** Динамическое разрешение: 1 — штатное, меньше — кадр не успевал. */
  renderScale = 1;

  constructor(parent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    parent.appendChild(this.renderer.domElement);
    setAnisotropy(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.add(this.amb);
    this.scene.environmentIntensity = 0.35;
    this.scene.background = new THREE.Color('#bfe0f5');
  }

  gpuName(): string {
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    } catch { return ''; }
  }

  setQuality(q: Quality, sun?: THREE.DirectionalLight): void {
    this.quality = q;
    this.renderer.shadowMap.enabled = q !== 'low';
    // PCFSoft в r185 устарел и молча подменяется на PCF (5 выборок) — ставим PCF
    // явно, мягкость даёт radius.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    if (sun) {
      sun.castShadow = q !== 'low';
      const size = q === 'high' ? 1536 : 1024;
      sun.shadow.radius = q === 'high' ? 1.6 : 1;
      if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); sun.shadow.map?.dispose(); sun.shadow.map = null as unknown as THREE.WebGLRenderTarget; }
    }
    // Карта окружения (IBL) — самая дорогая часть закраски: на Intel UHD она одна
    // съедала ~6 мс из 16 при 1024×768. На низком и среднем её заменяет ровный
    // рассеянный свет: металл тускнеет, зато кадр вдвое легче.
    this.scene.environment = null;
    setEnv(q === 'high' ? this.env : null);
    // тёплый и слабее: внутри ларька должно быть темнее, чем на улице
    this.amb.intensity = q === 'high' ? 0.24 : 0.42;
    this.renderScale = 1; this.locked = false; this.probing = false;
    this.resize(this.w, this.h, this.dpr);
    // смена качества теней требует перекомпиляции материалов
    this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true)); });
  }

  resize(w: number, h: number, dpr: number): void {
    this.w = w; this.h = h; this.dpr = dpr;
    // Плотность пикселей выше единицы — только на высоком качестве: закраска
    // растёт квадратично, и именно она душит встроенную графику.
    const base = this.quality === 'high' ? Math.min(dpr, 1.5) : this.quality === 'mid' ? Math.min(dpr, 1.25) : Math.min(dpr, 1);
    // не больше бюджета пикселей: на большом окне с dpr 1.25–1.5 высокое качество
    // рисовало в 2–2.5 раза больше пикселей, чем при замерах 1280×720
    const cap = Math.sqrt(MAX_PX[this.quality] / Math.max(1, w * h));
    const ratio = Math.max(0.5, Math.min(base, cap) * this.renderScale);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, true);
    this.camera.aspect = w / h;
    // В портрете кадр узкий: расширяем вертикальный угол, чтобы окно и прилавок
    // помещались целиком, а не только середина (п. 1.10.1 — ничего не обрезать).
    this.camera.fov = w / h < 1 ? 78 : w / h < 1.4 ? 64 : 55;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Подстройка разрешения под железо. Кадр упирается в закраску пикселей,
   * а не в число вызовов, поэтому самый действенный рычаг — внутреннее
   * разрешение. Снижаем быстро (лаг заметнее мыла), поднимаем медленно.
   */
  private acc = 0; private n = 0; private before = 0; private probing = false; private locked = false;
  adapt(dt: number): void {
    if (dt > 0.1 || this.locked) return; // вкладка просыпалась или GC — не повод мылить картинку
    this.acc += dt; this.n++;
    if (this.acc < 1.0) return;
    const avg = this.acc / this.n;
    this.acc = 0; this.n = 0;
    if (this.probing) {
      this.probing = false;
      // Понижение не ускорило кадр — значит, упирается не в пиксели (экран 30 Гц,
      // режим экономии, процессор). Возвращаем чёткость и больше не трогаем:
      // иначе картинка «мылилась» бы до минимума без всякой пользы.
      if (avg > this.before * 0.92) { this.renderScale = Math.min(1, this.renderScale + 0.1); this.locked = true; this.resize(this.w, this.h, this.dpr); return; }
    }
    // время кадра ∝ числу пикселей ⇒ масштаб ∝ √(цель/факт): сразу к нужному, без ступенек
    const target = 1 / 45;
    if (avg > target * 1.08 && this.renderScale > 0.46) {
      this.before = avg; this.probing = true;
      this.renderScale = Math.max(0.45, this.renderScale * Math.max(0.7, Math.sqrt(target / avg)));
      this.resize(this.w, this.h, this.dpr);
    } else if (avg < 1 / 57 && this.renderScale < 1) {
      this.renderScale = Math.min(1, this.renderScale + 0.05);
      this.resize(this.w, this.h, this.dpr);
    }
  }

  /*
   * Тени обновляются каждый кадр. Пробовали раз в 2–4 кадра (экономия ~1 мс):
   * тени идущих людей дёргались и мерцали — не стоит того.
   */
  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
