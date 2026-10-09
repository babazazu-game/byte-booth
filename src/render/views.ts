import * as THREE from 'three';
import { V } from './kit.ts';
import { BENCH, MONITOR } from './world.ts';

/**
 * Камера игрока: четыре зоны ларька и плавные переходы между ними.
 *
 * Игрок не ходит — он поворачивается на месте, как продавец в ларьке.
 * Это и проще для телефона (кнопки зон вместо стиков), и даёт ту самую
 * «уютную» камеру ReStory. Мышью/пальцем можно чуть оглядеться в пределах
 * зоны; на верстаке — ещё и приблизиться к детали.
 */

export type Zone = 'window' | 'bench' | 'shelf' | 'pc';
export const ZONES: Zone[] = ['window', 'bench', 'pc', 'shelf'];

const DEF: Record<Zone, { pos: THREE.Vector3; look: THREE.Vector3 }> = {
  window: { pos: V(0, 1.64, 1.85), look: V(0, 1.2, -1.6) },
  bench: { pos: V(-0.22, 1.48, 1.0), look: V(BENCH.x, 1.06, BENCH.z) },
  // смотрим чуть правее центра стеллажа: справа его закрывает список склада
  shelf: { pos: V(-0.62, 1.12, 0.98), look: V(1.3, 1.02, 1.32) },
  pc: { pos: V(0, 1.38, 1.38), look: V(MONITOR.x, 1.22, MONITOR.z + 0.2) },
};

export class Views {
  zone: Zone = 'window';
  /** Меню: камера снаружи облетает ларёк. */
  menu = true;
  private pos = V(4, 2.4, -6);
  private look = V(0, 1.3, 0);
  private lookOff = new THREE.Vector2();
  private focus: { point: THREE.Vector3; dist: number } | null = null;
  /** Отдаление на верстаке: 0 — обзор, 1 — вплотную к фокусу. */
  zoom = 0;
  orbitYaw = 0;
  orbitPitch = 0;
  /** Центр и нормаль экрана монитора (мировые) и его полуразмеры — для зоны «Компьютер». */
  pcScreen: { c: THREE.Vector3; n: THREE.Vector3; hw: number; hh: number } | null = null;

  constructor(private camera: THREE.PerspectiveCamera) {}

  go(z: Zone): void { this.zone = z; this.focus = null; this.lookOff.set(0, 0); this.zoom = 0; this.orbitYaw = 0; this.orbitPitch = 0; }
  next(dir: number): Zone {
    const i = ZONES.indexOf(this.zone);
    const z = ZONES[(i + dir + ZONES.length) % ZONES.length];
    this.go(z);
    return z;
  }
  /** Телефон: куда сдвинуть кадр верстака, чтобы корпус не прятался под кнопками. */
  phone: 'portrait' | 'landscape' | null = null;
  setFocus(point: THREE.Vector3 | null, dist = 0.45): void { this.focus = point ? { point: point.clone(), dist } : null; }
  /** Сдвиг взгляда от указателя: −1..1 по каждой оси. */
  pointer(x: number, y: number): void { this.lookOff.set(x, y); }

  update(dt: number, t: number): void {
    let tp: THREE.Vector3, tl: THREE.Vector3;
    if (this.menu) {
      const a = t * 0.07;
      // ларёк держим в правой части кадра: слева — логотип и кнопки меню.
      // Камера смотрит из парка в +Z, поэтому экранное «вправо» — это мировой −X.
      tp = V(2.4 + Math.sin(a) * 1.4, 2.1 + Math.sin(t * 0.2) * 0.15, -6.2 + Math.cos(a) * 0.5);
      tl = V(1.7, 1.5, 0.2);
    } else {
      const d = DEF[this.zone];
      tp = d.pos.clone(); tl = d.look.clone();
      if (this.zone === 'pc' && this.pcScreen) {
        /*
         * Камера «в мониторе»: экран почти во весь кадр, магазин (DOM) потом
         * выравнивается ровно по его углам. Мышь чуть смещает камеру — экран
         * плывёт в перспективе, и видно, что это живой монитор, а не попап.
         */
        const sc = this.pcScreen, cam = this.camera;
        const tf = Math.tan((cam.fov * Math.PI) / 360);
        const d = Math.max(sc.hh / (tf * 0.8), sc.hw / (tf * cam.aspect * 0.93));
        const right = V(0, 1, 0).cross(sc.n).normalize(), up = sc.n.clone().cross(right).normalize();
        tl = sc.c.clone();
        tp = sc.c.clone().addScaledVector(sc.n, d).addScaledVector(right, -this.lookOff.x * 0.035).addScaledVector(up, this.lookOff.y * 0.025);
      } else if (this.zone === 'bench') {
        const center = this.focus?.point ?? V(BENCH.x, 1.13, BENCH.z);
        // Ближе, чем было (0.98): корпус должен занимать кадр, иначе винты и разъёмы не разглядеть.
        const dist = (this.focus?.dist ?? 0.76) * (1 - this.zoom * 0.5);
        const yaw = this.orbitYaw, pitch = 0.42 + this.orbitPitch;
        tl = center.clone();
        tp = V(center.x + Math.cos(yaw) * Math.cos(pitch) * dist, center.y + Math.sin(pitch) * dist, center.z - Math.sin(yaw) * Math.cos(pitch) * dist);
        /*
         * Телефон: интерфейс верстака занимает низ (вертикально) или правый
         * край (горизонтально). Сдвигаем камеру вместе с целью — корпус
         * уезжает в свободную часть кадра, угол обзора тот же.
         */
        if (this.phone) {
          const fwd = V(0, 0, 0).subVectors(tl, tp).normalize();
          const right = fwd.clone().cross(V(0, 1, 0)).normalize();
          const sh = this.phone === 'portrait' ? V(0, -0.17, 0).addScaledVector(fwd, -0.12) : right.multiplyScalar(0.11).add(V(0, -0.03, 0));
          tl.add(sh); tp.add(sh);
        }
      } else {
        // лёгкое «оглядывание»
        const right = V(0, 0, 0).subVectors(tl, tp).cross(V(0, 1, 0)).normalize();
        tl.addScaledVector(right, this.lookOff.x * 0.35).add(V(0, -this.lookOff.y * 0.2, 0));
      }
    }
    /*
     * Поворачиваем НАПРАВЛЕНИЕ взгляда (slerp кватерниона), а не тянем точку,
     * на которую смотрим. Раньше при повороте к монитору за спиной эта точка
     * проходила почти через саму камеру, и взгляд «нырял» вниз через тело.
     */
    const k = 1 - Math.pow(0.0015, dt);
    this.pos.lerp(tp, k);
    this.look.lerp(tl, k);
    const m = new THREE.Matrix4().lookAt(tp, tl, this.camera.up);
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    this.camera.position.copy(this.pos);
    if (dt >= 5) this.camera.quaternion.copy(q); else this.camera.quaternion.slerp(q, k);
  }

  snap(): void { this.update(10, 0); }
}
