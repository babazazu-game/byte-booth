import * as THREE from 'three';
import type { MB, CPU, RAM, SSD, PSU, Cooler } from '../../logic/parts.ts';
import { add, std, phys, metal, own, rbox, box, cyl, canvasTex, decal, tube, fitText, rgbMatV, rgbMatH, rgbTexV, extrude, mulberry32, shade, inkFor, mergeTree, V } from '../kit.ts';
import { buildFan, hubTex, type Fan } from './fan.ts';
import { makeDust, type Dust } from './dust.ts';

/**
 * Материнская плата, процессор, память, SSD, блок питания, кулеры.
 *
 * Плата строится в своей плоскости XY лицом в +Z (как лежит на столе), и
 * отдаёт «якоря» — точки, куда встают процессор, память, M.2, видеокарта
 * и разъёмы кабелей. Корпус ставит плату, верстак берёт якоря и ставит
 * детали ровно туда, без магических чисел в верстаке.
 */

const texCache = new Map<string, THREE.Texture>();
function memo(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = texCache.get(key);
  if (!t) { t = make(); texCache.set(key, t); }
  return t;
}

/**
 * Шаг слотов памяти. В жизни ~9 мм, но пальцем на телефоне в такой слот не
 * попасть — в игре раздвинуто до 12 мм (автор).
 */
export const RAM_PITCH = 0.012;
export const MB_SIZE: Record<MB['form'], [number, number]> = { ATX: [0.244, 0.305], mATX: [0.244, 0.244], ITX: [0.17, 0.17] };

export interface BoardModel {
  group: THREE.Group;
  w: number; h: number;
  /** Крепёжные отверстия (в плоскости платы) — туда встают винты. */
  holes: [number, number][];
  anchors: { cpu: THREE.Object3D; ram: THREE.Object3D; m2: THREE.Object3D; pcie: THREE.Object3D; atx24: THREE.Object3D; cpu8: THREE.Object3D };
}

/**
 * Облик каждой платы (по разбору Codex): различие — крупными пятнами. Свой
 * текстолит и рисунок печати, форма и цвет радиаторов, крупная надпись серии.
 * Раньше у всех девяти был один серый текстолит с одной паутиной дорожек.
 */
type Print = 'bare' | 'diag' | 'camo' | 'clean' | 'angular' | 'traces' | 'stripes' | 'cyber';
interface MbStyle {
  vrm: 'none' | 'fins' | 'block' | 'angular'; heat: string; io: 'short' | 'tall'; rgb?: boolean; m2?: 'plate' | 'cover';
  print: Print; ink: string; logo: string; logoInk: string; slotDark: string; slotLight: string;
}
const MBSTYLE: Record<string, MbStyle> = {
  h610m: { vrm: 'none', heat: '#3a3530', io: 'short', print: 'bare', ink: 'rgba(200,170,130,.18)', logo: 'PRO', logoInk: '#8fb6e8', slotDark: '#15161a', slotLight: '#3a3f47' },
  b550m: { vrm: 'fins', heat: '#c9cdd4', io: 'short', m2: 'plate', print: 'diag', ink: 'rgba(225,230,238,.5)', logo: 'Pro4', logoInk: '#eef1f5', slotDark: '#15161a', slotLight: '#9aa3ad' },
  b760m: { vrm: 'block', heat: '#f4f3f0', io: 'tall', m2: 'plate', print: 'camo', ink: 'rgba(120,128,140,.35)', logo: 'STEEL LEGEND', logoInk: '#5b6470', slotDark: '#3a3f47', slotLight: '#ffffff' },
  b650: { vrm: 'block', heat: '#2b2d31', io: 'tall', m2: 'cover', print: 'clean', ink: 'rgba(160,165,175,.12)', logo: 'TOMAHAWK', logoInk: '#c9cdd4', slotDark: '#15161a', slotLight: '#c9cdd4' },
  z790: { vrm: 'angular', heat: '#3a3d44', io: 'tall', m2: 'cover', print: 'angular', ink: 'rgba(150,155,165,.28)', logo: 'AORUS', logoInk: '#f2a13a', slotDark: '#15161a', slotLight: '#b9bec6' },
  b860m: { vrm: 'angular', heat: '#cfd3d9', io: 'short', m2: 'plate', print: 'traces', ink: 'rgba(150,165,190,.22)', logo: 'GAMING PLUS', logoInk: '#e9ecf0', slotDark: '#15161a', slotLight: '#cfd3d9' },
  b650i: { vrm: 'block', heat: '#c9cdd4', io: 'tall', print: 'clean', ink: 'rgba(150,155,165,.15)', logo: 'AORUS', logoInk: '#f2a13a', slotDark: '#15161a', slotLight: '#c9cdd4' },
  z890: { vrm: 'angular', heat: '#43464d', io: 'tall', m2: 'plate', print: 'stripes', ink: 'rgba(210,180,90,.22)', logo: 'TUF GAMING', logoInk: '#f3c35a', slotDark: '#15161a', slotLight: '#b8a46a' },
  x870e: { vrm: 'angular', heat: '#1d1f24', io: 'tall', rgb: true, m2: 'cover', print: 'cyber', ink: 'rgba(230,60,120,.35)', logo: 'ROG STRIX', logoInk: '#ff5aa0', slotDark: '#15161a', slotLight: '#8a8f99' },
};
const MB_DEFAULT: MbStyle = { vrm: 'block', heat: '#4a4f59', io: 'tall', print: 'traces', ink: 'rgba(150,165,190,.25)', logo: '', logoInk: '#fff', slotDark: '#15161a', slotLight: '#e9edf2' };

/**
 * Крепёжные отверстия платы (в её плоскости, от центра). Одни и те же точки
 * рисуются на текстолите и получают винты на верстаке — раньше винты стояли
 * в 12 мм от края, а отверстия были в 8 мм, и верхний левый уходил под кожух
 * разъёмов. Верхнее левое — под кожухом, не в углу.
 */
export function mbHoles(p: MB): [number, number][] {
  const [w, h] = MB_SIZE[p.form];
  const st = MBSTYLE[p.id] ?? MB_DEFAULT;
  const ioH = st.io === 'tall' ? Math.min(0.13, h * 0.45) : 0.07;
  const e = 0.008;
  return [[-w / 2 + e, h / 2 - 0.01 - ioH - 0.009], [w / 2 - e, h / 2 - e], [-w / 2 + e, -h / 2 + 0.022], [w / 2 - e, -h / 2 + 0.022]];
}

function mbTex(p: MB, st: MbStyle, w: number, h: number): THREE.Texture {
  return memo('mb' + p.id, () => {
    const r = mulberry32(p.price + 3);
    const W = 512, Hh = Math.round((512 * h) / w);
    return canvasTex(W, Hh, (g) => {
      g.fillStyle = p.look.main; g.fillRect(0, 0, W, Hh);
      g.strokeStyle = st.ink; g.fillStyle = st.ink;
      if (st.print === 'diag' || st.print === 'stripes') {
        // широкие диагональные полосы (ASRock Pro4 — светлые, TUF — песочные)
        g.lineWidth = st.print === 'diag' ? 26 : 40;
        for (let k = -Hh; k < W + Hh; k += st.print === 'diag' ? 90 : 130) { g.beginPath(); g.moveTo(k, Hh); g.lineTo(k + Hh, 0); g.stroke(); }
      } else if (st.print === 'camo') {
        for (let i = 0; i < 70; i++) {
          g.beginPath(); const x = r() * W, y = r() * Hh, rr = 10 + r() * 34;
          for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2, q = rr * (0.6 + r() * 0.5); if (k) g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); else g.moveTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
          g.closePath(); g.fill();
        }
      } else if (st.print === 'angular') {
        g.lineWidth = 6;
        for (let i = 0; i < 14; i++) { const x = r() * W, y = r() * Hh, d = 40 + r() * 120; g.beginPath(); g.moveTo(x, y); g.lineTo(x + d, y); g.lineTo(x + d + 30, y - 30); g.stroke(); }
      } else if (st.print === 'cyber') {
        g.font = '700 15px "JetBrains Mono", monospace';
        const words = ['ROG', 'STRIX', '0x7F', 'REPUBLIC', '//', 'X870E'];
        for (let i = 0; i < 26; i++) { g.fillStyle = i % 3 ? st.ink : 'rgba(80,220,255,.3)'; g.fillText(words[i % 6], r() * W, r() * Hh); }
        g.lineWidth = 3; g.strokeStyle = 'rgba(80,220,255,.25)';
        for (let i = 0; i < 6; i++) { const y = r() * Hh; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y + 40); g.stroke(); }
      } else if (st.print !== 'clean') {
        // дорожки: густые у «голой» бюджетной платы, редкие у остальных
        g.lineWidth = 2;
        for (let i = 0; i < (st.print === 'bare' ? 200 : 90); i++) {
          let x = r() * W, y = r() * Hh; g.beginPath(); g.moveTo(x, y);
          for (let k = 0; k < 3; k++) { const d = r() * 70 + 10; const dir = (r() * 4) | 0; if (dir === 0) x += d; else if (dir === 1) y += d; else { x += d * 0.7; y += d * 0.7 * (dir === 2 ? 1 : -1); } g.lineTo(x, y); }
          g.stroke();
        }
      }
      const light = st.print === 'camo';
      g.fillStyle = light ? 'rgba(60,66,76,.8)' : 'rgba(225,232,240,.75)'; g.font = '600 13px Rubik'; g.textAlign = 'left';
      for (const [s2, x, y] of [['PCIEX16_1', 0.45, 0.68], ['DIMM_A1', 0.68, 0.12], ['CPU_FAN', 0.32, 0.07], ['M.2_1', 0.3, 0.6], ['SATA6G', 0.85, 0.85]] as [string, number, number][]) g.fillText(s2, x * W, y * Hh);
      // крупная надпись серии — главная «подпись» платы
      if (st.logo) { g.fillStyle = st.logoInk; g.textAlign = 'right'; fitText(g, st.logo, W - 18, Hh * 0.93, W * 0.62, 46, 900); }
      g.fillStyle = light ? '#7d838c' : '#b8bcc4';
      // крепёжные отверстия: металлическое кольцо и тёмная середина
      for (const [hx, hy] of mbHoles(p)) {
        const x = ((hx + w / 2) / w) * W, y = ((h / 2 - hy) / h) * Hh;
        g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#16171a'; g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); g.fillStyle = light ? '#7d838c' : '#b8bcc4';
      }
    });
  });
}

export function buildBoard(p: MB): BoardModel {
  const [w, h] = MB_SIZE[p.form];
  const group = new THREE.Group();
  const st = MBSTYLE[p.id] ?? MB_DEFAULT;
  add(group, rbox(w, h, 0.0016, 0.0006, 1), std('#fff', { map: mbTex(p, st, w, h), roughness: 0.6 }));
  const x0 = -w / 2, y1 = h / 2;
  const gray = std('#4a4f59', { metalness: 0.6, roughness: 0.38 });
  const accent = phys(p.look.accent, { roughness: 0.4, clearcoat: 0.3 });
  const dark = std('#1b1d22', { roughness: 0.5 });
  const steel = metal('#b9bec6');
  const heatM = std(st.heat, { metalness: 0.6, roughness: 0.36 });
  const cpuX = x0 + (p.form === 'ITX' ? 0.075 : 0.105), cpuY = y1 - (p.form === 'ITX' ? 0.07 : 0.085);
  // I/O-кожух: низкий у бюджетных плат, высокий «панцирь» у игровых
  const ioH = st.io === 'tall' ? Math.min(0.13, h * 0.45) : 0.07;
  const ioD = st.io === 'tall' ? 0.024 : 0.016;
  add(group, rbox(0.05, ioH, ioD, 0.004), std(st.io === 'tall' ? st.heat : shade(p.look.main, 1.4), { roughness: 0.45, metalness: st.io === 'tall' ? 0.4 : 0 }), x0 + 0.027, y1 - 0.01 - ioH / 2, ioD / 2);
  add(group, rbox(0.004, ioH * 0.7, 0.003, 0.001), st.rgb ? rgbMatV() : accent, x0 + 0.052, y1 - 0.01 - ioH / 2, ioD - 0.002);
  // на высоком кожухе — крупная надпись серии вдоль него; у ROG она светится
  if (st.io === 'tall' && st.logo) {
    const lt = memo('mbio' + p.id, () => canvasTex(512, 96, (c, cw, chh) => {
      c.clearRect(0, 0, cw, chh); c.fillStyle = st.rgb ? '#ffffff' : st.logoInk; c.textBaseline = 'middle';
      fitText(c, st.logo, 16, chh / 2 + 2, cw - 32, 70, 900);
    }));
    const lm = decal(group, ioH * 0.82, 0.03, lt, x0 + 0.027, y1 - 0.01 - ioH / 2, ioD + 0.0006, 0, 0, Math.PI / 2,
      st.rgb ? { emissive: '#ff4fa0', emissiveMap: lt, emissiveIntensity: 3 } : {});
    lm.castShadow = false;
  }
  // дроссели питания — у дешёвых плат голые, у дорогих прячутся под радиаторы
  for (let i = 0; i < 6; i++) add(group, box(0.008, 0.008, 0.006), metal('#7d838c', 0.45), cpuX - 0.03 + i * 0.012, cpuY + 0.036, 0.003);
  if (st.vrm === 'fins') {
    for (let i = 0; i < 9; i++) add(group, box(0.075, 0.0014, 0.012), heatM, cpuX, cpuY + 0.042 + i * 0.0028, 0.008);
    for (let i = 0; i < 7; i++) add(group, box(0.0014, 0.065, 0.012), heatM, cpuX - 0.058 + i * 0.0028, cpuY - 0.002, 0.008);
  } else if (st.vrm === 'block') {
    add(group, rbox(0.075, 0.022, 0.014, 0.003), heatM, cpuX, cpuY + 0.05, 0.007);
    add(group, rbox(0.02, 0.07, 0.014, 0.003), heatM, cpuX - 0.05, cpuY, 0.007);
    for (let i = 0; i < 4; i++) add(group, box(0.072, 0.0015, 0.002), std('#2b2f36'), cpuX, cpuY + 0.044 + i * 0.004, 0.0145);
  } else if (st.vrm === 'angular') {
    const sh = new THREE.Shape(); sh.moveTo(-0.04, -0.011); sh.lineTo(0.03, -0.011); sh.lineTo(0.04, 0.011); sh.lineTo(-0.03, 0.011); sh.closePath();
    add(group, extrude(sh, 0.016, 0.0015, 4), heatM, cpuX, cpuY + 0.05, 0.008);
    const sh2 = new THREE.Shape(); sh2.moveTo(-0.01, -0.035); sh2.lineTo(0.01, -0.025); sh2.lineTo(0.01, 0.035); sh2.lineTo(-0.01, 0.035); sh2.closePath();
    add(group, extrude(sh2, 0.016, 0.0015, 4), heatM, cpuX - 0.05, cpuY, 0.008);
    add(group, box(0.06, 0.0025, 0.0015), st.rgb ? rgbMatH() : accent, cpuX, cpuY + 0.05, 0.0172);
  }
  void shade;
  // сокет
  const sock = new THREE.Group(); sock.position.set(cpuX, cpuY, 0.0008); group.add(sock);
  add(sock, box(0.05, 0.05, 0.003), steel, 0, 0, 0.0015);
  add(sock, box(0.04, 0.04, 0.0036), std('#1e2026', { roughness: 0.5 }), 0, 0, 0.0018);
  add(sock, cyl(0.0012, 0.0012, 0.05, 8), steel, 0.028, 0, 0.004);
  // слоты памяти
  const ramX = cpuX + 0.06, ramY = cpuY - 0.005;
  const nSlots = p.slots;
  for (let i = 0; i < nSlots; i++) {
    // второй и четвёртый (рекомендуемые, A2/B2) — светлые, остальные чёрные: так пары
    // одного цвета читаются на любой плате (цвет акцента у некоторых плат серый)
    add(group, rbox(0.006, 0.136, 0.006, 0.001), i % 2 ? std(st.slotLight, { roughness: 0.4 }) : std(st.slotDark, { roughness: 0.5 }), ramX + i * RAM_PITCH, ramY, 0.003);
    add(group, box(0.006, 0.006, 0.008), std('#e6e2da'), ramX + i * RAM_PITCH, ramY + 0.07, 0.004);
  }
  // 24-pin и 8-pin
  const atx = V(w / 2 - 0.01, ramY + 0.01, 0.006);
  add(group, rbox(0.012, 0.05, 0.012, 0.002), dark, atx.x, atx.y, atx.z);
  // индикаторы самотеста CPU/DRAM/VGA/BOOT у 24-pin: при включении загораются —
  // даже у сборки без RGB видно, что плата «ожила»
  ['#ff3b30', '#ffcc00', '#ffffff', '#34c759'].forEach((c, i) => add(group, box(0.003, 0.0018, 0.0012), own('#111', { emissive: c, emissiveIntensity: 2.5 }), atx.x - 0.014, atx.y - 0.03 - i * 0.004, 0.0012));
  const c8 = V(x0 + 0.02, y1 - 0.012, 0.006);
  add(group, rbox(0.018, 0.009, 0.012, 0.002), dark, c8.x, c8.y, c8.z);
  // чипсет, M.2, PCIe
  const pcieY = cpuY - (p.form === 'ITX' ? 0.075 : 0.105);
  add(group, rbox(0.089, 0.008, 0.009, 0.0015), steel, x0 + 0.06, pcieY, 0.0045);
  if (p.form !== 'ITX') {
    add(group, rbox(0.089, 0.007, 0.008, 0.0015), dark, x0 + 0.06, pcieY - 0.06, 0.004);
    add(group, rbox(0.045, 0.045, 0.008, 0.003), gray, w / 2 - 0.05, pcieY - 0.03, 0.004);
    const chipLogo = memo('chip' + p.id, () => canvasTex(128, 128, (g) => {
      g.fillStyle = '#4a4f59'; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = p.look.accent; g.lineWidth = 8; g.strokeRect(22, 22, 84, 84);
      g.fillStyle = '#e8e2d8'; g.textAlign = 'center'; g.textBaseline = 'middle';
      fitText(g, p.chipset, 64, 66, 76, 32, 900);
    }));
    decal(group, 0.035, 0.035, chipLogo, w / 2 - 0.05, pcieY - 0.03, 0.0082);
  }
  const m2 = V(x0 + 0.075, pcieY + 0.03, 0.0015);
  // радиатор второго M.2 / сплошная накладка нижней части платы — у дорогих моделей
  if (st.m2 === 'plate' && p.form !== 'ITX') add(group, rbox(0.085, 0.024, 0.006, 0.002), heatM, x0 + 0.075, pcieY - 0.032, 0.004);
  if (st.m2 === 'cover') {
    const cw = w - 0.11, ch = Math.max(0.03, pcieY - (-h / 2) - 0.018);
    add(group, rbox(cw, ch, 0.005, 0.003), heatM, x0 + 0.1 + cw / 2 - 0.005, -h / 2 + 0.008 + ch / 2, 0.0035);
    add(group, box(cw * 0.6, 0.002, 0.0012), st.rgb ? rgbMatH() : accent, x0 + 0.1 + cw * 0.3, -h / 2 + 0.008 + ch * 0.7, 0.0064);
  }
  add(group, box(0.012, 0.008, 0.004), dark, m2.x - 0.042, m2.y, 0.002);
  add(group, cyl(0.01, 0.01, 0.003, 24), steel, w / 2 - 0.03, pcieY + 0.035, 0.0015, Math.PI / 2);
  for (let i = 0; i < 6; i++) if (x0 + 0.02 + i * 0.03 < w / 2 - 0.02) add(group, box(0.012, 0.006, 0.006), dark, x0 + 0.02 + i * 0.03, -h / 2 + 0.008, 0.003);
  // конденсаторы
  for (let i = 0; i < 5; i++) add(group, cyl(0.0035, 0.0035, 0.008, 12), metal('#2a2c31', 0.4), cpuX - 0.03 + i * 0.012, cpuY - 0.04, 0.004, Math.PI / 2);

  mergeTree(group);
  const mk = (x: number, y: number, z: number) => { const o = new THREE.Object3D(); o.position.set(x, y, z); group.add(o); return o; };
  return {
    group, w, h, holes: mbHoles(p),
    anchors: {
      cpu: mk(cpuX, cpuY, 0.0035),
      ram: mk(ramX, ramY, 0.006),
      m2: mk(m2.x, m2.y, m2.z),
      pcie: mk(x0 + 0.06, pcieY, 0.009),
      atx24: mk(atx.x, atx.y, atx.z + 0.006),
      cpu8: mk(c8.x, c8.y, c8.z + 0.006),
    },
  };
}

/* ─────────────────────────────── CPU ─────────────────────────────── */

export function buildCPU(p: CPU): THREE.Group {
  const g = new THREE.Group();
  const intel = p.vendor === 'intel';
  add(g, box(0.0375, intel ? 0.045 : 0.04, 0.0012), std('#2f5a3a', { roughness: 0.5 }), 0, 0, 0.0006);
  const ihs = new THREE.Group(); ihs.position.z = 0.0012; g.add(ihs);
  const tex = memo('cpu' + p.id, () => canvasTex(256, 256, (c, w) => {
    c.fillStyle = '#c9ccd2'; c.fillRect(0, 0, w, w);
    const gr = c.createLinearGradient(0, 0, w, w); gr.addColorStop(0, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(0,0,0,.08)'); c.fillStyle = gr; c.fillRect(0, 0, w, w);
    c.fillStyle = '#3d4250'; c.textAlign = 'center';
    fitText(c, intel ? 'intel' : 'AMD', w / 2, 70, w - 50, 46, 900);
    fitText(c, p.name.replace('Core ', 'CORE ').toUpperCase(), w / 2, 130, w - 40, 26, 800);
    c.font = '500 18px Rubik'; c.fillText('X8' + (p.price * 37 % 9999), w / 2, 175);
    fitText(c, `${p.cores}C · ${p.socket}`, w / 2, 210, w - 60, 18, 600);
  }));
  if (intel) add(ihs, rbox(0.03, 0.036, 0.0028, 0.0012, 2), metal('#c9ccd2', 0.28), 0, 0, 0.0014);
  else add(ihs, rbox(0.034, 0.034, 0.0028, 0.002, 2), metal('#c9ccd2', 0.28), 0, 0, 0.0014);
  decal(ihs, intel ? 0.026 : 0.03, intel ? 0.026 : 0.03, tex, 0, 0, 0.0029, 0, 0, 0, { metalness: 0.5, roughness: 0.3 });
  mergeTree(g);
  return g;
}

/** Отпечаток пасты на крышке процессора: свежая капля или засохшая корка. */
export function buildPaste(): { group: THREE.Group; set(state: 'none' | 'old' | 'new'): void } {
  const group = new THREE.Group();
  const fresh = add(group, new THREE.SphereGeometry(0.009, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), phys('#b9bcc2', { roughness: 0.25, clearcoat: 0.6 }), 0, 0, 0, Math.PI / 2);
  fresh.scale.set(1, 0.22, 1);
  const crack = memo('crackcpu', () => {
    const r = mulberry32(9);
    return canvasTex(128, 128, (g) => {
      g.fillStyle = '#8e8a80'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(60,56,50,.8)'; g.lineWidth = 1.5;
      for (let i = 0; i < 24; i++) { g.beginPath(); const a = r() * 6.28; g.moveTo(64, 64); let x = 64, y = 64; for (let k = 0; k < 4; k++) { x += Math.cos(a + r() - 0.5) * 14; y += Math.sin(a + r() - 0.5) * 14; g.lineTo(x, y); } g.stroke(); }
    });
  });
  const old = add(group, cyl(0.014, 0.014, 0.0006, 24), std('#fff', { map: crack, roughness: 0.9 }), 0, 0, 0.0003, Math.PI / 2);
  fresh.userData.keep = true; old.userData.keep = true;
  return { group, set(s) { fresh.visible = s === 'new'; old.visible = s === 'old'; } };
}

/* ─────────────────────────────── RAM ─────────────────────────────── */

/**
 * Планки в слотах платы. idx — номера занятых слотов (шаг 0.009 от первого):
 * пара встаёт в A2/B2 (1 и 3), как велит инструкция к плате.
 */
export function buildRAM(p: RAM, idx: number[] = [0, 2], pitch = RAM_PITCH): THREE.Group {
  const g = new THREE.Group();
  const label = memo('ram' + p.id, () => canvasTex(512, 96, (c, w, h) => {
    c.fillStyle = p.look.main; c.fillRect(0, 0, w, h);
    c.fillStyle = p.look.accent; c.fillRect(0, h - 12, w, 12);
    c.fillStyle = inkFor(p.look.main); c.textBaseline = 'middle';
    fitText(c, p.brand.toUpperCase(), 18, 44, 200, 44, 900);
    c.fillStyle = p.look.accent;
    fitText(c, p.name.replace(p.brand, '').replace(/\d+GB/, '').trim().toUpperCase(), 230, 44, 270, 30, 800);
  }));
  // Профиль радиатора у каждой линейки свой: по нему модуль узнают с полки.
  const kind = p.id === 'r4-16lpx' ? 'lpx' : p.id === 'r5-16rgb' ? 'trident' : p.id === 'r5-32' ? 'dominator' : p.id === 'r4-16rgb' ? 'vrgb' : 'fury';
  const bodyH = kind === 'lpx' ? 0.029 : kind === 'dominator' ? 0.04 : 0.034;
  const body = std(p.look.main, { metalness: 0.55, roughness: 0.38 });
  for (const i of idx) {
    const s = new THREE.Group(); s.position.x = i * pitch; g.add(s);
    add(s, box(0.0012, 0.133, 0.03), std('#1d3a2c'), 0, 0, 0.015);
    // контакты заметно толще текстолита: при равной толщине грани совпадали и мерцали
    add(s, box(0.0017, 0.12, 0.0032), std('#d9a640', { metalness: 0.7, roughness: 0.3 }), 0, 0, 0.0014);
    add(s, rbox(0.0042, 0.132, bodyH, 0.0015), body, 0, 0, 0.002 + bodyH / 2);
    const lz = 0.004 + bodyH * 0.45;
    decal(s, 0.11, 0.021, label, 0.0022, 0, lz, 0, Math.PI / 2, Math.PI / 2);
    decal(s, 0.11, 0.021, label, -0.0022, 0, lz, 0, -Math.PI / 2, -Math.PI / 2);
    if (kind === 'fury') {
      // зубчатый гребень FURY во всю толщину радиатора (раньше — повёрнутые бруски,
      // сбоку они торчали шипами)
      const sh = new THREE.Shape(); const L2 = 0.13, n = 9, tw = L2 / n;
      sh.moveTo(-L2 / 2, 0);
      for (let k = 0; k < n; k++) { const x = -L2 / 2 + k * tw; sh.lineTo(x + tw * 0.25, 0.0045); sh.lineTo(x + tw * 0.75, 0.0045); sh.lineTo(x + tw, 0); }
      sh.lineTo(L2 / 2, -0.001); sh.lineTo(-L2 / 2, -0.001); sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.0042, bevelEnabled: false });
      // контур (x — вдоль планки, y — вверх), выдавливание — по толщине планки
      geo.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, -0.0021, 1, 0, 0, 0, 0, 1, 0, 0.002 + bodyH, 0, 0, 0, 1));
      add(s, geo, body);
    }
    if (kind === 'lpx') for (let k = 0; k < 10; k++) add(s, box(0.0046, 0.003, bodyH * 0.8), std(p.look.accent, { metalness: 0.4, roughness: 0.4 }), 0, -0.054 + k * 0.012, 0.002 + bodyH / 2);
    if (kind === 'trident') {
      add(s, rbox(0.0046, 0.132, 0.012, 0.0015), std(p.look.accent, { metalness: 0.5, roughness: 0.35 }), 0, 0, 0.002 + bodyH - 0.004);
      // световая полоса — насыщенная радуга (бледная почти белая не читалась как RGB)
      add(s, rbox(0.0042, 0.126, 0.008, 0.002), own('#16171b', { emissive: '#ffffff', emissiveMap: rgbTexV, emissiveIntensity: 3.2 }), 0, 0, 0.002 + bodyH + 0.004);
    }
    if (kind === 'dominator') {
      for (let k = 0; k < 6; k++) add(s, box(0.0048, 0.13, 0.0015), std(p.look.accent, { metalness: 0.8, roughness: 0.25 }), 0, 0, 0.002 + bodyH - 0.0075 + k * 0.0018);
      add(s, rbox(0.0046, 0.124, 0.005, 0.0018), rgbMatV(), 0, 0, 0.002 + bodyH + 0.003);
    }
    if (kind === 'vrgb') {
      // Vengeance RGB PRO: широкий матовый рассеиватель во всю длину поверх радиатора
      add(s, rbox(0.0048, 0.13, 0.004, 0.0015), std(p.look.accent, { metalness: 0.6, roughness: 0.3 }), 0, 0, 0.002 + bodyH);
      add(s, rbox(0.0044, 0.124, 0.009, 0.002), own('#1d1f24', { emissive: '#ffffff', emissiveMap: rgbTexV, emissiveIntensity: 3 }), 0, 0, 0.002 + bodyH + 0.0065);
    }
    if (p.rgb && kind === 'fury') add(s, rbox(0.0046, 0.128, 0.006, 0.0018), rgbMatV(), 0, 0, 0.038);
  }
  mergeTree(g);
  return g;
}

/* ─────────────────────────────── SSD ─────────────────────────────── */

export function buildSSD(p: SSD): THREE.Group {
  const g = new THREE.Group();
  add(g, box(0.08, 0.022, 0.0012), std('#1d3a2c'), 0, 0, 0.0006);
  const lab = memo('ssd' + p.id, () => canvasTex(512, 140, (c, w, h) => {
    c.fillStyle = p.look.main; c.fillRect(0, 0, w, h);
    c.fillStyle = p.look.accent; c.fillRect(0, 0, 14, h);
    c.fillStyle = inkFor(p.look.main); c.textBaseline = 'middle';
    fitText(c, p.brand.toUpperCase(), 36, 44, 200, 40, 900);
    fitText(c, p.name.replace(p.brand, '').trim(), 36, 98, w - 60, 34, 700);
  }));
  add(g, box(0.06, 0.02, 0.0016), std('#1a1b1f'), 0.004, 0, 0.002);
  decal(g, 0.062, 0.017, lab, 0.004, 0, 0.0029);
  add(g, box(0.006, 0.02, 0.0018), std('#d9a640', { metalness: 0.7, roughness: 0.3 }), -0.037, 0, 0.0006);
  return g;
}

/* ─────────────────────────────── PSU ─────────────────────────────── */

/**
 * Блоки питания различаются длиной, решёткой вентилятора, рисунком кожуха и
 * наклейкой (разбор Codex): раньше все шесть были одной коробкой с разными
 * этикетками и одинаковой красной кнопкой.
 */
interface PsuStyle { D: number; grill: 'wire' | 'rings' | 'tri' | 'mesh'; ribs?: boolean; label: 'band' | 'side' | 'big'; rows: number }
const PSUSTYLE: Record<string, PsuStyle> = {
  pk550: { D: 0.14, grill: 'wire', label: 'band', rows: 1 },
  'sp10-650': { D: 0.14, grill: 'rings', ribs: true, label: 'side', rows: 1 },
  rm750e: { D: 0.14, grill: 'tri', label: 'big', rows: 2 },
  gx850: { D: 0.15, grill: 'rings', label: 'big', rows: 2 },
  'dp13-1000': { D: 0.17, grill: 'mesh', ribs: true, label: 'side', rows: 2 },
  hx1500: { D: 0.18, grill: 'tri', label: 'big', rows: 3 },
};

function grillTex(kind: PsuStyle['grill'], ink: string): THREE.Texture {
  return memo('grill' + kind + ink, () => canvasTex(256, 256, (c) => {
    c.clearRect(0, 0, 256, 256); c.strokeStyle = ink; c.fillStyle = ink;
    if (kind === 'wire') {
      c.lineWidth = 6;
      for (let r = 20; r < 124; r += 14) { c.beginPath(); c.arc(128, 128, r, 0, Math.PI * 2); c.stroke(); }
      c.beginPath(); c.moveTo(4, 128); c.lineTo(252, 128); c.moveTo(128, 4); c.lineTo(128, 252); c.stroke();
    } else if (kind === 'rings') {
      c.lineWidth = 9;
      for (let r = 34; r < 124; r += 22) { c.beginPath(); c.arc(128, 128, r, 0, Math.PI * 2); c.stroke(); }
      c.beginPath(); c.arc(128, 128, 26, 0, Math.PI * 2); c.fill();
    } else if (kind === 'tri') {
      // треугольная перфорация (Corsair)
      for (let y = 10; y < 250; y += 16) for (let x = (y / 16) % 2 ? 18 : 10; x < 250; x += 16) {
        if (Math.hypot(x - 128, y - 128) > 120) continue;
        c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + 6, y + 5); c.lineTo(x - 6, y + 5); c.closePath(); c.fill();
      }
    } else {
      // мелкая сплошная сетка (be quiet! Dark Power)
      c.lineWidth = 2;
      for (let k = 0; k < 256; k += 7) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k, 256); c.moveTo(0, k); c.lineTo(256, k); c.stroke(); }
    }
  }));
}

export function buildPSU(p: PSU): THREE.Group {
  const g = new THREE.Group();
  const st = PSUSTYLE[p.id] ?? { D: p.watt >= 1000 ? 0.18 : 0.14, grill: 'wire', label: 'band', rows: 1 } as PsuStyle;
  const W = 0.15, H = 0.086, D = st.D;
  const white = inkFor(p.look.main) === '#1d1f24'; // светлый корпус — тёмные надписи
  const bodyM = std(p.look.main, { metalness: white ? 0.1 : 0.4, roughness: 0.5 });
  add(g, rbox(W, H, D, 0.004), bodyM);
  // Холст в пропорции наклейки: у длинных БП она шире, и общий холст растягивал текст.
  const lab = memo('psu' + p.id, () => canvasTex(512, Math.round((512 * H) / D), (c, w, h) => {
    const ink = inkFor(p.look.main);
    c.fillStyle = p.look.main; c.fillRect(0, 0, w, h);
    c.textBaseline = 'middle';
    if (st.label === 'band') {
      c.fillStyle = p.look.accent; c.fillRect(0, h - 70, w, 70);
      c.fillStyle = ink; fitText(c, p.brand.toUpperCase(), 30, 70, w - 60, 56, 900);
      fitText(c, p.name.replace(p.brand, '').trim(), 30, 150, w - 60, 40, 700);
      c.fillStyle = inkFor(p.look.accent); fitText(c, `80 PLUS ${p.tier.toUpperCase()} · ${p.watt}W`, 30, h - 35, w - 60, 34, 800);
    } else if (st.label === 'side') {
      // сдержанная наклейка: тонкая линия акцента сверху и светлый логотип
      c.fillStyle = p.look.accent; c.fillRect(30, 30, w - 60, 6);
      c.fillStyle = ink; fitText(c, p.brand, 30, h * 0.42, w - 60, 64, 900);
      c.globalAlpha = 0.75; fitText(c, p.name.replace(p.brand, '').trim(), 30, h * 0.66, w - 60, 34, 700);
      c.globalAlpha = 1; c.fillStyle = p.look.accent; fitText(c, `${p.tier.toUpperCase()} · ${p.watt}W`, 30, h - 40, w - 60, 30, 800);
    } else {
      // крупная модель на весь бок (RM750e, FOCUS, HX1500i)
      const model = p.name.replace(p.brand, '').trim().split(' ')[0].toUpperCase();
      c.fillStyle = ink; c.globalAlpha = 0.9; fitText(c, model, 24, h * 0.5, w - 48, h * 0.5, 900);
      c.globalAlpha = 1; c.fillStyle = p.look.accent; fitText(c, p.brand.toUpperCase(), 26, 40, w * 0.6, 34, 900);
      fitText(c, `80+ ${p.tier.toUpperCase()}`, 26, h - 32, w * 0.6, 28, 800);
    }
  }));
  decal(g, D * 0.8, H * 0.8, lab, W / 2 + 0.0005, 0, 0, 0, Math.PI / 2, 0);
  decal(g, D * 0.8, H * 0.8, lab, -W / 2 - 0.0005, 0, 0, 0, -Math.PI / 2, 0);
  // вентилятор снизу: своя решётка у каждой линейки
  const gInk = white ? '#b9bcc2' : '#5a5f68';
  decal(g, Math.min(0.13, D * 0.86), Math.min(0.13, D * 0.86), grillTex(st.grill, gInk), 0, -H / 2 - 0.0005, 0, Math.PI / 2, 0, 0);
  // рёбра на крышке (be quiet!) — видны сверху в корпусе
  if (st.ribs) for (let i = 0; i < 7; i++) add(g, box(W * 0.8, 0.0015, 0.003), std(shade(p.look.main, white ? 0.9 : 1.6), { roughness: 0.5 }), 0, H / 2 + 0.0008, -D * 0.35 + i * (D * 0.7) / 6);
  // резьбовые отверстия под винты крепления (те же точки, что у винтов на верстаке)
  for (const x of [-0.05, 0.05]) { add(g, cyl(0.0052, 0.0052, 0.0006, 16), std(shade(p.look.main, white ? 0.8 : 1.5), { metalness: 0.5, roughness: 0.4 }), x, H / 2 + 0.0003, D / 2 - 0.012); add(g, cyl(0.0022, 0.0022, 0.0008, 12), std('#0b0c0e'), x, H / 2 + 0.0004, D / 2 - 0.012); }
  // задняя панель: сетевой разъём и выключатель рядом (тёмный, как у всех настоящих)
  add(g, box(0.022, 0.016, 0.002), std('#111'), -0.045, 0.02, D / 2 + 0.001);
  add(g, box(0.009, 0.013, 0.004), std('#1d1f24', { roughness: 0.4 }), -0.045, -0.006, D / 2 + 0.002);
  add(g, box(0.06, 0.05, 0.0012), std(shade(p.look.main, white ? 0.85 : 0.6)), 0.035, 0, D / 2 + 0.0006);
  // модульные разъёмы спереди: у дорогих рядов больше
  for (let r2 = 0; r2 < st.rows; r2++) for (let i = 0; i < 5; i++) add(g, box(0.016, 0.008, 0.004), std('#0d0e10'), -0.05 + i * 0.024, 0.02 - r2 * 0.016, -D / 2 - 0.002);
  g.userData.dims = [W, H, D];
  mergeTree(g);
  return g;
}

/* ─────────────────────────────── Кулеры ─────────────────────────────── */

export interface CoolerModel { group: THREE.Group; fans: Fan[]; dust: Dust[]; height: number }

/**
 * Кулер ставится на якорь процессора: локальная +Z — ОТ платы.
 * У башни рёбра идут параллельно плате, а вентилятор дует вдоль платы (по Y).
 */
export function buildCooler(p: Cooler, radiatorAt?: THREE.Vector3): CoolerModel {
  const group = new THREE.Group();
  const fans: Fan[] = [];
  const dust: Dust[] = [];
  const logo = hubTex(p.brand, p.look.main, inkFor(p.look.main), p.look.accent);
  const capTex = memo('cap' + p.id, () => canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = p.look.main; c.fillRect(0, 0, w, h);
    c.fillStyle = inkFor(p.look.main); c.textAlign = 'center'; c.textBaseline = 'middle';
    fitText(c, p.brand.toUpperCase(), w / 2, 92, w - 60, 72, 900);
    c.fillStyle = p.look.accent;
    fitText(c, p.name, w / 2, 178, w - 60, 52, 800);
  }));
  const copper = metal('#c87a4c', 0.28);
  if (p.kind === 'tower') {
    // Двухбашенные (NH-D15, Peerless Assassin) — две стопки рёбер и вентилятор
    // между ними; маленький AG400 — узкая башня с 92-мм вентилятором.
    const dual = p.id === 'nhd15' || p.id === 'pa120';
    const small = p.id === 'ag400';
    const H = p.height / 1000, finH = H - 0.03;
    const finW = small ? 0.042 : 0.05, finL = small ? 0.1 : 0.12;
    const noctua = p.brand === 'Noctua';
    add(group, rbox(0.04, 0.04, 0.01, 0.002), noctua ? metal('#d4d8de', 0.25) : copper, 0, 0, 0.005);
    const n = Math.round(finH / 0.0033);
    const stacks = dual ? [-0.038, 0.038] : [0];
    const finM = metal(p.look.main === '#c9cdd4' ? '#d4d8de' : '#c9cdd3', 0.3);
    const dm = new THREE.Object3D();
    for (const sx of stacks) {
      // Рёбра: вдоль потока (локальная X платы = перед-зад корпуса), поперёк — 120 мм.
      const fins = new THREE.InstancedMesh(box(finW, finL, 0.0006), finM, n);
      for (let i = 0; i < n; i++) { dm.position.set(sx, 0, 0.03 + i * 0.0033); dm.updateMatrix(); fins.setMatrixAt(i, dm.matrix); }
      fins.castShadow = true; group.add(fins);
      add(group, rbox(finW + 0.004, finL + 0.004, 0.006, 0.003), dual && noctua ? metal('#d4d8de', 0.25) : std(p.look.main, { metalness: 0.3, roughness: 0.4 }), sx, 0, H - 0.002);
    }
    const pipeM = noctua ? metal('#d4d8de', 0.22) : copper;
    for (const [dy, dx] of [[-0.03, -0.012], [-0.01, 0.012], [0.01, -0.012], [0.03, 0.012]]) {
      for (const sx of stacks) {
        tube(group, [V(dx * 0.5, dy * 0.4, 0.01), V(sx * 0.6 + dx, dy, 0.03), V(sx + dx, dy, H)], 0.003, pipeM, 16, 8);
        add(group, new THREE.SphereGeometry(0.003, 10, 6), pipeM, sx + dx, dy, H);
      }
    }
    // Ширина наклейки — вдоль рёбер (после поворота на 90°): текст идёт по длинной
    // стороне. Раньше стороны были перепутаны, и надпись сжималась вчетверо.
    decal(group, finL * 0.8, finW - 0.004, capTex, stacks[stacks.length - 1], 0, H + 0.0012, 0, 0, Math.PI / 2);
    const brown = noctua;
    const R = small ? 0.044 : 0.056;
    const fanAt = (x: number) => {
      const f = buildFan({ R, frame: true, frameColor: brown ? '#7a5a46' : p.look.main === '#c9cdd4' ? '#1d1f24' : p.look.main, logo, blade: brown ? '#c9a98a' : '#2a2d35', n: brown ? 7 : 9, sweep: brown ? 0.9 : 0.72, w0: brown ? 0.26 : 0.2, w1: brown ? 0.4 : 0.3 });
      f.group.rotation.y = Math.PI / 2;
      f.group.position.set(x, 0, 0.03 + finH / 2);
      group.add(f.group); fans.push(f);
      const d = makeDust(R * 2, R * 2); d.rotation.y = Math.PI / 2; d.position.set(x + 0.014, 0, 0.03 + finH / 2); group.add(d); dust.push(d);
    };
    if (dual) { fanAt(0); fanAt(0.038 + finW / 2 + 0.014); } else fanAt(finW / 2 + 0.015);
    const d2 = makeDust(finW, finL); d2.position.set(stacks[0], 0, H + 0.003); group.add(d2); dust.push(d2);
    mergeTree(group);
    return { group, fans, dust, height: H };
  }
  if (p.kind === 'low') {
    add(group, rbox(0.04, 0.04, 0.008, 0.002), copper, 0, 0, 0.004);
    const fins = new THREE.InstancedMesh(box(0.095, 0.0006, 0.018), metal('#3a3d44', 0.35), 26);
    const dm = new THREE.Object3D();
    for (let i = 0; i < 26; i++) { dm.position.set(0, -0.046 + i * 0.0037, 0.017); dm.updateMatrix(); fins.setMatrixAt(i, dm.matrix); }
    group.add(fins);
    const f = buildFan({ R: 0.044, frame: true, frameColor: '#2a2d35', logo, blade: '#5a4436' });
    f.group.position.z = 0.033; group.add(f.group); fans.push(f);
    const d = makeDust(0.09, 0.09); d.position.z = 0.047; group.add(d); dust.push(d);
    return { group, fans, dust, height: 0.037 };
  }
  // AIO: помпа на процессоре, шланги к радиатору под крышей корпуса
  add(group, cyl(0.032, 0.034, 0.03, 40), std(p.look.main, { roughness: 0.35 }), 0, 0, 0.015, Math.PI / 2);
  const pumpTop = memo('pump' + p.id, () => canvasTex(256, 256, (c) => {
    c.fillStyle = '#16171b'; c.beginPath(); c.arc(128, 128, 128, 0, Math.PI * 2); c.fill();
    c.strokeStyle = p.look.accent; c.lineWidth = 10; c.beginPath(); c.arc(128, 128, 100, 0, Math.PI * 2); c.stroke();
    c.fillStyle = p.look.accent; c.textAlign = 'center'; c.textBaseline = 'middle';
    fitText(c, p.brand.toUpperCase(), 128, 132, 160, 44, 900);
  }));
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.03, 40), std('#fff', { map: pumpTop, emissive: '#ffffff', emissiveMap: pumpTop, emissiveIntensity: 0.4 }));
  top.position.z = 0.0302; group.add(top);
  const rad = radiatorAt ?? V(0.02, 0.2, 0.06);
  const hose = std('#16171b', { roughness: 0.6 });
  for (const dx of [-0.012, 0.012]) tube(group, [V(dx, 0.03, 0.02), V(dx, 0.07, 0.04), V(rad.x + dx * 2, rad.y - 0.02, rad.z - 0.01), V(rad.x + dx * 4, rad.y - 0.005, rad.z)], 0.006, hose, 32, 10);
  // Радиатор лежит под крышей вдоль корпуса: его длина — по локальной X платы.
  const radG = new THREE.Group(); radG.position.copy(rad); radG.rotation.y = Math.PI / 2; group.add(radG);
  add(radG, rbox(0.12, 0.028, 0.36, 0.004), std('#1d1f24', { roughness: 0.6 }));
  for (let i = 0; i < 3; i++) {
    const f = buildFan({ R: 0.056, frame: true, frameColor: p.look.accent, logo, blade: '#2a2d35' });
    f.group.rotation.x = Math.PI / 2; f.group.position.set(0, -0.027, -0.12 + i * 0.12);
    radG.add(f.group); fans.push(f);
    const d = makeDust(0.11, 0.11); d.rotation.x = Math.PI / 2; d.position.set(0, -0.041, -0.12 + i * 0.12); radG.add(d); dust.push(d);
  }
  return { group, fans, dust, height: 0.05 };
}
