import * as THREE from 'three';
import { canvasTex, mulberry32, TAU } from '../kit.ts';

/**
 * Пыль для заказов на чистку.
 *
 * Пылевой «войлок» — полупрозрачная плоскость с ворсистой текстурой поверх
 * вентилятора или радиатора. У каждого пятна своё `amount` 0..1: кисть
 * уменьшает его там, где прошла, и игрок видит, что вычистил, а что нет.
 */

let tex: THREE.Texture | null = null;
function dustTex(): THREE.Texture {
  if (tex) return tex;
  const r = mulberry32(31);
  tex = canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const x = r() * w, y = r() * h, rad = 2 + r() * 9;
      const v = 150 + (r() * 60) | 0;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(${v},${v - 6},${v - 14},${0.25 + r() * 0.3})`);
      gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
    }
    g.strokeStyle = 'rgba(210,205,195,.5)';
    for (let i = 0; i < 160; i++) {
      g.lineWidth = 0.6 + r();
      g.beginPath(); const x = r() * w, y = r() * h; g.moveTo(x, y);
      g.quadraticCurveTo(x + r() * 20 - 10, y + r() * 20 - 10, x + r() * 30 - 15, y + r() * 30 - 15); g.stroke();
    }
  }, { repeat: true });
  return tex;
}

export interface Dust extends THREE.Mesh { userData: { amount: number; dust: true } }

/** По умолчанию пыли НЕТ: новое железо чистое, пыль включает верстак для заказов на чистку. */
export function makeDust(w: number, h: number, amount = 0): Dust {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    // DoubleSide нужен не для вида, а для кисти: пыль на вентиляторах видеокарты смотрит
    // вниз, и односторонняя плоскость не ловила луч сверху — дочистить было невозможно.
    new THREE.MeshStandardMaterial({ map: dustTex(), transparent: true, opacity: 0.92 * amount, depthWrite: false, roughness: 1, color: '#c9bfb0', side: THREE.DoubleSide }),
  ) as unknown as Dust;
  m.userData = { amount, dust: true };
  m.renderOrder = 2;
  m.visible = amount > 0.02;
  return m;
}

export function setDust(m: Dust, amount: number): void {
  m.userData.amount = Math.max(0, Math.min(1, amount));
  (m.material as THREE.MeshStandardMaterial).opacity = 0.92 * m.userData.amount;
  m.visible = m.userData.amount > 0.02;
}
