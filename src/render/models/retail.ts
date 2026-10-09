import * as THREE from 'three';
import { type Part, type Cat, specLine } from '../../logic/parts.ts';
import { rbox, std, canvasTex, fitText, fitBlock, inkFor, shade, isRu, TAU } from '../kit.ts';

/**
 * Коробки товаров для полок и прилавка.
 *
 * Все надписи — через fitText/fitBlock: длинное «GeForce RTX 5070 Ti GamingPro»
 * обязано помещаться на той же коробке, что и «AG400». Это прямое замечание
 * автора игры после пробника, поэтому прямых fillText тут нет вообще.
 */

export const BOX_DIMS: Record<Cat, [number, number, number]> = {
  gpu: [0.38, 0.22, 0.09],
  cpu: [0.12, 0.12, 0.06],
  mb: [0.33, 0.28, 0.075],
  ram: [0.17, 0.1, 0.03],
  ssd: [0.12, 0.075, 0.022],
  psu: [0.2, 0.12, 0.17],
  cooler: [0.17, 0.19, 0.12],
  case: [0.5, 0.56, 0.28],
  paste: [0.09, 0.05, 0.025],
};

export function drawIcon(g: CanvasRenderingContext2D, cat: Cat, x: number, y: number, s: number, main: string, accent: string): void {
  g.save(); g.translate(x, y);
  g.shadowColor = 'rgba(0,0,0,.3)'; g.shadowBlur = s * 0.08; g.shadowOffsetY = s * 0.04;
  const dark = '#2a2e38';
  const rr = (rx: number, ry: number, w: number, h: number, r: number, c: string) => { g.fillStyle = c; g.beginPath(); g.roundRect(rx, ry, w, h, r); g.fill(); };
  const fanDraw = (cx: number, cy: number, r: number) => {
    g.fillStyle = '#232a3b'; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
    g.fillStyle = '#3a4560';
    for (let k = 0; k < 9; k++) { g.save(); g.translate(cx, cy); g.rotate((k * TAU) / 9); g.beginPath(); g.moveTo(r * 0.22, 0); g.quadraticCurveTo(r * 0.6, -r * 0.42, r * 0.92, -r * 0.05); g.quadraticCurveTo(r * 0.6, -r * 0.05, r * 0.22, r * 0.12); g.fill(); g.restore(); }
    g.fillStyle = '#1b1f2a'; g.beginPath(); g.arc(cx, cy, r * 0.25, 0, TAU); g.fill();
    g.strokeStyle = accent; g.lineWidth = Math.max(2, r * 0.06); g.beginPath(); g.arc(cx, cy, r * 0.2, 0, TAU); g.stroke();
  };
  switch (cat) {
    case 'gpu': {
      rr(-s * 0.6, -s * 0.24, s * 1.2, s * 0.48, s * 0.06, dark);
      g.shadowColor = 'transparent';
      rr(-s * 0.58, -s * 0.22, s * 1.16, s * 0.44, s * 0.05, main);
      fanDraw(-s * 0.28, 0, s * 0.18); fanDraw(s * 0.28, 0, s * 0.18);
      g.fillStyle = accent; g.fillRect(-s * 0.03, -s * 0.2, s * 0.06, s * 0.4);
      break;
    }
    case 'cpu': {
      rr(-s * 0.32, -s * 0.32, s * 0.64, s * 0.64, s * 0.04, '#2f5a3a');
      g.shadowColor = 'transparent';
      rr(-s * 0.26, -s * 0.26, s * 0.52, s * 0.52, s * 0.05, '#c9ccd2');
      g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(-s * 0.26, -s * 0.26, s * 0.52, s * 0.1);
      break;
    }
    case 'ram': {
      for (let i = 0; i < 2; i++) { rr(-s * 0.6, -s * 0.2 + i * s * 0.26, s * 1.2, s * 0.2, s * 0.03, main); g.fillStyle = accent; g.fillRect(-s * 0.58, -s * 0.2 + i * s * 0.26, s * 1.16, s * 0.04); }
      break;
    }
    case 'ssd': {
      rr(-s * 0.6, -s * 0.14, s * 1.2, s * 0.28, s * 0.03, '#1d3a2c');
      g.shadowColor = 'transparent';
      rr(-s * 0.4, -s * 0.12, s * 0.9, s * 0.24, s * 0.02, main);
      g.fillStyle = '#d9a640'; g.fillRect(-s * 0.6, -s * 0.12, s * 0.12, s * 0.24);
      break;
    }
    case 'psu': {
      rr(-s * 0.45, -s * 0.32, s * 0.9, s * 0.64, s * 0.05, dark);
      g.shadowColor = 'transparent';
      fanDraw(0, 0, s * 0.26);
      break;
    }
    case 'cooler': {
      rr(-s * 0.3, -s * 0.45, s * 0.6, s * 0.9, s * 0.04, '#c9cdd3');
      g.shadowColor = 'transparent';
      g.strokeStyle = '#9aa0a8'; g.lineWidth = 2; for (let i = 0; i < 16; i++) { g.beginPath(); g.moveTo(-s * 0.3, -s * 0.42 + i * s * 0.056); g.lineTo(s * 0.3, -s * 0.42 + i * s * 0.056); g.stroke(); }
      fanDraw(0, 0, s * 0.26);
      break;
    }
    case 'mb': {
      rr(-s * 0.45, -s * 0.5, s * 0.9, s * 1.0, s * 0.03, main);
      g.shadowColor = 'transparent';
      g.fillStyle = '#c9ccd2'; g.fillRect(-s * 0.1, -s * 0.3, s * 0.24, s * 0.24);
      g.fillStyle = accent; for (let i = 0; i < 4; i++) g.fillRect(s * 0.22 + i * s * 0.05, -s * 0.38, s * 0.025, s * 0.5);
      g.fillStyle = '#9aa0a8'; g.fillRect(-s * 0.38, s * 0.12, s * 0.6, s * 0.05); g.fillRect(-s * 0.38, s * 0.3, s * 0.6, s * 0.05);
      g.fillStyle = shade(main, 1.6); g.fillRect(-s * 0.42, -s * 0.46, s * 0.14, s * 0.4);
      break;
    }
    case 'case': {
      rr(-s * 0.32, -s * 0.5, s * 0.64, s * 1.0, s * 0.04, main);
      g.shadowColor = 'transparent';
      rr(-s * 0.26, -s * 0.44, s * 0.4, s * 0.88, s * 0.02, 'rgba(30,40,55,.75)');
      for (let i = 0; i < 3; i++) { g.strokeStyle = accent; g.lineWidth = s * 0.02; g.beginPath(); g.arc(s * 0.2, -s * 0.3 + i * s * 0.28, s * 0.09, 0, TAU); g.stroke(); }
      break;
    }
    case 'paste': {
      rr(-s * 0.5, -s * 0.12, s * 0.8, s * 0.24, s * 0.1, main);
      g.fillStyle = '#c9ccd2'; g.fillRect(s * 0.3, -s * 0.05, s * 0.25, s * 0.1);
      break;
    }
  }
  g.restore();
}

const texCache = new Map<string, THREE.Material[]>();

function faces(p: Part): THREE.Material[] {
  const key = p.id + (isRu() ? '|ru' : '|en');
  const hit = texCache.get(key);
  if (hit) return hit;
  const [bw, bh, bd] = BOX_DIMS[p.cat];
  const main = p.look.main, acc = p.look.accent;
  const bg2 = shade(main, 1.35);
  const ink = inkFor(main);
  // Высокая коробка (корпус) — уже холст, а не обрезка высоты до 1024:
  // обрезка растягивала всю лицевую сторону по вертикали.
  const W = bh > bw ? Math.round((1024 * bw) / bh) : 1024, H = Math.round((W * bh) / bw);
  const front = canvasTex(W, H, (g, w, h) => {
    g.fillStyle = main; g.fillRect(0, 0, w, h);
    g.fillStyle = bg2; g.beginPath(); g.moveTo(w * 0.58, 0); g.lineTo(w, 0); g.lineTo(w, h); g.lineTo(w * 0.38, h); g.fill();
    g.fillStyle = acc; g.beginPath(); g.moveTo(w * 0.55, 0); g.lineTo(w * 0.585, 0); g.lineTo(w * 0.385, h); g.lineTo(w * 0.35, h); g.fill();
    const iconS = Math.min(w * 0.4, h * 0.7);
    drawIcon(g, p.cat, w * 0.72, h * 0.46, iconS, main, acc);
    const pad = w * 0.05;
    g.fillStyle = ink; g.textBaseline = 'alphabetic';
    fitText(g, p.brand.toUpperCase(), pad, h * 0.2, w * 0.42, Math.min(h * 0.14, 90), 900);
    g.fillStyle = ink; g.textAlign = 'left'; g.textBaseline = 'middle';
    fitBlock(g, p.name, pad, h * 0.48, w * 0.42, h * 0.38, Math.min(h * 0.16, 100), 900);
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, h * 0.84, w, h * 0.16);
    g.fillStyle = '#fff'; g.textBaseline = 'middle';
    fitText(g, specLine(p, isRu()), pad, h * 0.92, w - pad * 2, Math.min(h * 0.09, 44), 700);
  });
  const side = canvasTex(256, Math.max(64, Math.round((256 * bh) / bd)), (g, w, h) => {
    g.fillStyle = main; g.fillRect(0, 0, w, h);
    g.fillStyle = acc; g.fillRect(0, h * 0.8, w, h * 0.2);
    g.save(); g.translate(w / 2, h * 0.42); g.rotate(-Math.PI / 2);
    g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    fitText(g, p.brand.toUpperCase() + ' ' + p.name, 0, 0, h * 0.74, w * 0.36, 900);
    g.restore();
  });
  const top = canvasTex(512, Math.max(64, Math.round((512 * bd) / bw)), (g, w, h) => {
    g.fillStyle = bg2; g.fillRect(0, 0, w, h);
    g.fillStyle = inkFor(bg2); g.textBaseline = 'middle';
    fitText(g, p.brand.toUpperCase(), w * 0.05, h / 2, w * 0.4, h * 0.6, 900);
    g.fillStyle = acc;
    fitText(g, '↑ ↑', w * 0.8, h / 2, w * 0.15, h * 0.5, 900);
  });
  const back = canvasTex(512, Math.max(64, Math.round((512 * bh) / bw)), (g, w, h) => {
    g.fillStyle = '#f4ead8'; g.fillRect(0, 0, w, h);
    g.fillStyle = main; g.fillRect(0, 0, w, h * 0.18);
    g.fillStyle = ink; g.textBaseline = 'middle';
    fitText(g, `${p.brand} ${p.name}`, 14, h * 0.09, w - 28, h * 0.11, 800);
    g.fillStyle = '#2a2f3a';
    fitText(g, specLine(p, isRu()), 14, h * 0.32, w - 28, h * 0.08, 600);
    g.fillStyle = '#fff'; g.fillRect(w * 0.62, h * 0.55, w * 0.32, h * 0.36);
    g.fillStyle = '#111';
    let x = w * 0.64; let k = p.price * 7;
    while (x < w * 0.92) { const bwid = 1 + (k % 4); g.fillRect(x, h * 0.58, bwid, h * 0.25); x += bwid + 1 + (k % 3); k = (k * 13 + 7) % 97; }
  });
  const mats = [side, side, top, top, front, back].map((t) => std('#fff', { map: t, roughness: 0.62 }));
  texCache.set(key, mats);
  return mats;
}

export function buildRetailBox(p: Part): THREE.Mesh {
  const [w, h, d] = BOX_DIMS[p.cat];
  const m = new THREE.Mesh(rbox(w, h, d, Math.min(0.004, d * 0.15), 2), faces(p));
  m.castShadow = true; m.receiveShadow = true;
  m.userData.dims = [w, h, d];
  return m;
}
