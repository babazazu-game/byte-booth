import * as THREE from 'three';
import { add, std, phys, metal, own, rbox, box, cyl, sph, canvasTex, liveTex, tr, tube, fitText, fitBlock, mulberry32, V, TAU } from './kit.ts';

/**
 * Мелочи, от которых ларёк выглядит обжитым: картон, стикеры, календарь,
 * касса, мусорка, доска с ценами у входа. Каждая вещь — из мира продавца
 * железа, а не «декор вообще»: так интерьер рассказывает про профессию.
 */

/** Холст — в пропорции лицевой грани коробки, иначе надпись на ней растянута. */
function kraftTex(seed: number, label: () => string, aspect = 1): THREE.Texture {
  return liveTex(256, Math.round(256 * aspect), (g, w, h) => {
    const r = mulberry32(seed);
    g.fillStyle = '#b98a57'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { const v = r(); g.fillStyle = `rgba(${v < 0.5 ? '90,60,30' : '230,200,160'},${0.06 + r() * 0.08})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1); }
    g.fillStyle = 'rgba(214,190,140,.75)'; g.fillRect(w * 0.42, 0, w * 0.16, h);
    g.save(); g.translate(w * 0.5, h * 0.7); g.rotate(-0.08);
    g.strokeStyle = '#2b2018'; g.lineWidth = 3; g.strokeRect(-70, -22, 140, 44);
    g.fillStyle = '#2b2018'; g.textAlign = 'center'; g.textBaseline = 'middle';
    fitText(g, label(), 0, 2, 124, 26, 900);
    g.restore();
    g.font = '700 22px Rubik'; g.fillStyle = 'rgba(43,32,24,.7)'; g.fillText('↑↑', 18, 34);
  });
}

function stickyTex(text: string, color: string): THREE.Texture {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(0,0,0,.08)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#26201a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    fitBlock(g, text, w / 2, h / 2, w - 36, h - 50, 58, 700, 'Caveat', 1.0);
  });
}

export interface Props { setDay(n: number, ru: boolean): void; setStickies(lines: string[]): void; setCash(n: number): void; figSlots: THREE.Object3D[]; posterSlots: THREE.Object3D[] }

export function buildProps(root: THREE.Group): Props {
  // ── картонные коробки в углу у прилавка ──
  const boxes: [number, number, number, number, number, () => string][] = [
    [-1.15, 0.0, 0.18, 0.42, 0.32, () => tr('ХРУПКОЕ', 'FRAGILE')], [-1.15, 0.32, 0.2, 0.36, 0.26, () => tr('ВИДЕОКАРТЫ ×4', 'GPU ×4')], [-1.18, 0.58, 0.16, 0.3, 0.2, () => tr('ПАМЯТЬ', 'RAM')],
    [0.98, 0.0, 2.0, 0.4, 0.3, () => tr('БЛОКИ ПИТАНИЯ', 'PSU')],
  ];
  boxes.forEach(([x, y, z, s, hgt, label], i) => {
    const t = kraftTex(40 + i, label, hgt / s);
    const m = add(root, rbox(s, hgt, s * 0.8, 0.008, 2), std('#fff', { map: t, roughness: 0.9 }), x, y + hgt / 2, z, 0, (i - 1.5) * 0.15, 0);
    m.receiveShadow = true;
  });
  // ── мусорка с мятой бумагой ──
  // ── мелочи на прилавке: мастерская должна «рассказывать историю» ──
  const cy = 0.925; // верх столешницы
  // горшок с суккулентом (левый угол)
  const pot = new THREE.Group(); pot.position.set(-1.12, cy, 0.24); root.add(pot);
  add(pot, new THREE.CylinderGeometry(0.05, 0.04, 0.08, 20), std('#c96f4a', { roughness: 0.85 }), 0, 0.04, 0);
  add(pot, cyl(0.046, 0.046, 0.01, 20), std('#4a3527', { roughness: 1 }), 0, 0.076, 0);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU, r = i < 5 ? 0.022 : 0.0;
    const leaf = add(pot, new THREE.SphereGeometry(0.018, 10, 8), std(i % 2 ? '#6f9c5a' : '#88b06b', { roughness: 0.7 }), Math.cos(a) * r, 0.095 + (i < 5 ? 0 : 0.02), Math.sin(a) * r);
    leaf.scale.set(0.7, 1.5, 0.7); leaf.rotation.z = Math.cos(a) * 0.5; leaf.rotation.x = Math.sin(a) * 0.5;
  }
  // стакан с отвёртками и ручками
  const cup = new THREE.Group(); cup.position.set(-0.98, cy, 0.3); root.add(cup);
  add(cup, new THREE.CylinderGeometry(0.035, 0.032, 0.1, 18, 1, true), std('#e7b84a', { roughness: 0.6, side: THREE.DoubleSide }), 0, 0.05, 0);
  add(cup, cyl(0.032, 0.032, 0.004, 18), std('#e7b84a'), 0, 0.002, 0);
  // Карандаши с ластиками — «веером» из центра дна: низ внутри стакана, наклон
  // наружу. Раньше они стояли со смещением и наклоном внутрь и протыкали стенку.
  const ferrule = std('#c9ccd2', { metalness: 0.7, roughness: 0.35 }), eraser = std('#f08aa0', { roughness: 0.8 });
  ['#e2334a', '#3fb6a8', '#2f6fd6', '#f2c94c', '#5e8a4c'].forEach((c, i) => {
    const a = i * 1.26, tilt = 0.12 + (i % 2) * 0.07;
    const pg = new THREE.Group(); pg.position.set(Math.cos(a) * 0.006, 0.006, Math.sin(a) * 0.006);
    pg.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt); cup.add(pg);
    const len = 0.125 + (i % 3) * 0.012;
    add(pg, cyl(0.0055, 0.0055, len, 6), std(c, { roughness: 0.5 }), 0, len / 2, 0);
    add(pg, cyl(0.0058, 0.0058, 0.008, 10), ferrule, 0, len + 0.004, 0);
    add(pg, cyl(0.0054, 0.005, 0.011, 10), eraser, 0, len + 0.013, 0);
  });
  // стопка тетрадей/инструкций и коробочка с винтиками (правый угол)
  const st = new THREE.Group(); st.position.set(1.2, cy, 0.33); st.rotation.y = 0.25; root.add(st);
  ['#3d5a80', '#e0c48a', '#9c4f3a', '#f1ece2'].forEach((c, i) => add(st, rbox(0.21, 0.016, 0.15, 0.003), std(c, { roughness: 0.8 }), (i % 2) * 0.008, 0.008 + i * 0.017, (i % 3) * 0.006).rotation.y = (i - 1.5) * 0.06);
  const tray = new THREE.Group(); tray.position.set(0.32, cy, 0.34); tray.rotation.y = -0.15; root.add(tray);
  add(tray, rbox(0.14, 0.022, 0.09, 0.004), std('#cfd3d8', { metalness: 0.5, roughness: 0.4 }), 0, 0.011, 0);
  const screwM = metal('#b8bcc4', 0.3), r = mulberry32(77);
  for (let i = 0; i < 16; i++) add(tray, cyl(0.004, 0.004, 0.003, 8), screwM, (r() - 0.5) * 0.11, 0.024, (r() - 0.5) * 0.065);
  // маленький робот-фигурка — характер мастера
  const bot = new THREE.Group(); bot.position.set(-0.62, cy, 0.34); bot.rotation.y = 0.5; root.add(bot);
  add(bot, rbox(0.05, 0.05, 0.04, 0.01), std('#e9e4d8', { roughness: 0.5 }), 0, 0.05, 0);
  add(bot, rbox(0.07, 0.05, 0.05, 0.012), std('#e2674f', { roughness: 0.5 }), 0, 0.105, 0);
  for (const s of [-1, 1]) add(bot, sph(0.008, 10, 8), own('#111', { emissive: '#7fd6ff', emissiveIntensity: 1.5 }), s * 0.015, 0.11, 0.026);
  add(bot, cyl(0.002, 0.002, 0.03, 6), std('#333'), 0, 0.145, 0);
  add(bot, sph(0.007, 8, 6), std('#f2c94c'), 0, 0.162, 0);
  for (const s of [-1, 1]) add(bot, rbox(0.016, 0.025, 0.02, 0.004), std('#3d4048'), s * 0.014, 0.012, 0);
  // ── полка над окном: обрамляет вид на улицу, как в мастерской из ReStory ──
  const top = new THREE.Group(); top.position.set(0, 2.19, -0.235); root.add(top);
  const shelfWood = std('#8a5a36', { roughness: 0.75 });
  add(top, rbox(2.5, 0.025, 0.13, 0.004), shelfWood, 0, 0, 0);
  for (const x of [-1.0, 0, 1.0]) add(top, box(0.015, 0.06, 0.1), std('#1b1c20', { metalness: 0.5, roughness: 0.4 }), x, -0.04, -0.01);
  // коробки
  [[-1.05, 0.16, 0.1, '#b98a57'], [-0.86, 0.12, 0.11, '#c9a06a'], [0.95, 0.14, 0.1, '#b98a57'], [1.12, 0.09, 0.1, '#3d5a80']].forEach(([x, w, h, c]) =>
    add(top, rbox(w as number, h as number, 0.1, 0.004), std(c as string, { roughness: 0.9 }), x as number, 0.0125 + (h as number) / 2, 0));
  // радиоприёмник
  const radio = new THREE.Group(); radio.position.set(-0.45, 0.0125, 0); top.add(radio);
  add(radio, rbox(0.24, 0.12, 0.08, 0.012), std('#d9cdb4', { roughness: 0.6 }), 0, 0.06, 0);
  add(radio, cyl(0.035, 0.035, 0.004, 24), std('#3d3a35', { roughness: 0.9 }), -0.06, 0.06, 0.041, Math.PI / 2);
  add(radio, rbox(0.08, 0.03, 0.004, 0.002), own('#2a2a22', { emissive: '#ffb45c', emissiveIntensity: 0.7 }), 0.06, 0.075, 0.041);
  add(radio, cyl(0.002, 0.002, 0.22, 6), metal('#c9ccd2'), 0.08, 0.2, -0.02, 0, 0, -0.5);
  // кустистое растение в горшке: листья растут вверх и в стороны (свисающий плющ проходил сквозь полку)
  const ivy = new THREE.Group(); ivy.position.set(0.45, 0.0125, 0); top.add(ivy);
  add(ivy, new THREE.CylinderGeometry(0.055, 0.045, 0.09, 18), std('#e9e4d8', { roughness: 0.7 }), 0, 0.045, 0);
  add(ivy, cyl(0.05, 0.05, 0.008, 18), std('#4a3527', { roughness: 1 }), 0, 0.087, 0);
  const leafM = std('#5f8f4e', { roughness: 0.7 }), leafM2 = std('#78a660', { roughness: 0.7 }), leafM3 = std('#4e7c41', { roughness: 0.7 });
  const rr = mulberry32(9);
  for (let i = 0; i < 26; i++) {
    const a = rr() * TAU, tilt = 0.25 + rr() * 0.75, len = 0.05 + rr() * 0.05;
    const leaf = new THREE.Group(); leaf.position.set(Math.cos(a) * 0.012, 0.09, Math.sin(a) * 0.012); leaf.rotation.set(0, -a, 0); ivy.add(leaf);
    const stem = new THREE.Group(); stem.rotation.z = -tilt; leaf.add(stem);
    const m = add(stem, new THREE.SphereGeometry(0.018, 10, 8), [leafM, leafM2, leafM3][i % 3], 0, len, 0);
    m.scale.set(0.55, 1.5, 0.22);
  }
  // ── стена у окна: пробковая доска слева, полочки и удлинитель справа ──
  const fz = -0.3 + 0.006; // внутренняя грань передней стены
  // пробковая доска с чеками, заметками и фото
  const corkT = canvasTex(256, 384, (g, w, h) => {
    const rr = mulberry32(14);
    g.fillStyle = '#b98a5a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${rr() < 0.5 ? '120,80,40' : '220,180,130'},${(0.15 + rr() * 0.2).toFixed(2)})`; g.fillRect(rr() * w, rr() * h, 2, 2); }
    g.strokeStyle = '#6b4a2c'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    const note = (x: number, y: number, ww: number, hh: number, c: string, rot: number, lines: number) => {
      g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(-ww / 2 + 3, -hh / 2 + 4, ww, hh);
      g.fillStyle = c; g.fillRect(-ww / 2, -hh / 2, ww, hh);
      g.strokeStyle = 'rgba(40,40,60,.55)'; g.lineWidth = 2; for (let i = 0; i < lines; i++) { g.beginPath(); g.moveTo(-ww / 2 + 8, -hh / 2 + 16 + i * 12); g.lineTo(ww / 2 - 8 - rr() * 20, -hh / 2 + 16 + i * 12); g.stroke(); }
      g.fillStyle = '#d6403a'; g.beginPath(); g.arc(0, -hh / 2 + 6, 5, 0, TAU); g.fill(); g.restore();
    };
    note(70, 70, 90, 110, '#f6f1e6', -0.08, 7);   // чек
    note(180, 90, 80, 80, '#ffd95e', 0.1, 4);      // стикер
    note(80, 210, 100, 70, '#9fe0d6', 0.06, 3);
    note(190, 230, 90, 120, '#fffaf0', -0.05, 8);  // чек
    note(120, 320, 120, 60, '#ff9ab0', 0.04, 2);
    // «фото» с клиентом
    g.save(); g.translate(185, 330); g.rotate(-0.12); g.fillStyle = '#fff'; g.fillRect(-36, -30, 72, 64); g.fillStyle = '#6fa8c9'; g.fillRect(-30, -24, 60, 42); g.fillStyle = '#f2c94c'; g.beginPath(); g.arc(-8, -4, 9, 0, TAU); g.fill(); g.fillStyle = '#5d9a48'; g.fillRect(-30, 8, 60, 10); g.restore();
  });
  add(root, box(0.34, 0.5, 0.018), std('#fff', { map: corkT, roughness: 0.95 }), -1.16, 1.5, fz + 0.009, 0, 0, 0, false);
  // справа: две полочки
  const ws = new THREE.Group(); ws.position.set(1.16, 0, fz); root.add(ws);
  const shelfW2 = std('#8a5a36', { roughness: 0.75 });
  for (const y of [1.38, 1.72]) add(ws, rbox(0.34, 0.02, 0.13, 0.004), shelfW2, 0, y, 0.065);
  // роутер с мигающими индикаторами
  add(ws, rbox(0.16, 0.03, 0.1, 0.008), std('#f2f0eb', { roughness: 0.5 }), -0.05, 1.405, 0.06);
  for (let i = 0; i < 4; i++) add(ws, sph(0.0035, 8, 6), own('#111', { emissive: i % 2 ? '#7dff6a' : '#4fd1c0', emissiveIntensity: 2 }), -0.1 + i * 0.022, 1.405, 0.111);
  for (const s of [-1, 1]) add(ws, cyl(0.003, 0.003, 0.12, 6), std('#1b1c20'), -0.05 + s * 0.06, 1.48, 0.03, 0, 0, s * 0.25);
  // мотки скотча и изоленты
  for (const [x, c] of [[0.09, '#2f6fd6'], [0.13, '#1b1c20']] as const) add(ws, new THREE.TorusGeometry(0.022, 0.01, 8, 20), std(c, { roughness: 0.6 }), x, 1.42, 0.07, Math.PI / 2);
  // верхняя полка: коробочки и маленький кактус
  add(ws, rbox(0.1, 0.07, 0.08, 0.004), std('#c9a06a', { roughness: 0.9 }), -0.09, 1.765, 0.06);
  add(ws, rbox(0.07, 0.05, 0.08, 0.004), std('#3d5a80', { roughness: 0.9 }), 0.0, 1.755, 0.06);
  add(ws, new THREE.CylinderGeometry(0.03, 0.025, 0.05, 16), std('#c96f4a', { roughness: 0.85 }), 0.1, 1.755, 0.06);
  add(ws, new THREE.CapsuleGeometry(0.016, 0.04, 4, 10), std('#6f9c5a', { roughness: 0.7 }), 0.1, 1.81, 0.06);
  // удлинитель на стене и провода вниз к прилавку
  add(ws, rbox(0.06, 0.2, 0.03, 0.006), std('#e9e5dc', { roughness: 0.6 }), -0.11, 1.12, 0.015);
  for (let i = 0; i < 3; i++) add(ws, box(0.018, 0.012, 0.004), std('#2a2d32'), -0.11, 1.18 - i * 0.05, 0.032);
  for (const [dx, c] of [[-0.02, '#1b1c20'], [0.03, '#f2f0eb'], [0.07, '#1b1c20']] as const)
    tube(ws, [V(-0.11, 1.18, 0.035), V(-0.11 + dx, 1.08, 0.06), V(-0.15 + dx * 2, 0.96, 0.12), V(-0.2 + dx * 3, 0.93, 0.2)], 0.003, std(c, { roughness: 0.6 }), 24, 5).castShadow = false;

  // ── места для постеров (заполняются покупками по порядку) ──
  const posterSlots: THREE.Object3D[] = [];
  // Места выбраны там, где постер видно из рабочих зон: по бокам окна, на левой
  // стене над перфопанелью (видно от окошка и с верстака) и по бокам монитора
  // (видно, когда открываешь магазин). На задней стене выше монитора их не было видно вовсе.
  // у окна — строго между пробковой доской/полочкой и верхней полкой (низ полки 2.18):
  // раньше верх постеров заходил в полку
  for (const [x, y, z, ry, w, hh] of [[-1.16, 1.96, -0.293, 0, 0.26, 0.36], [1.16, 2.0, -0.293, 0, 0.2, 0.28], [-1.333, 1.75, 0.0, Math.PI / 2, 0.24, 0.34], [0.45, 1.18, 2.093, Math.PI, 0.17, 0.25], [-0.45, 1.18, 2.093, Math.PI, 0.17, 0.25], [-1.333, 2.15, 1.0, Math.PI / 2, 0.22, 0.32]] as const) {
    const o = new THREE.Object3D(); o.position.set(x, y, z); o.rotation.y = ry; o.userData.w = w; o.userData.h = hh; root.add(o); posterSlots.push(o);
  }
  // ── ступенчатая подставка для коллекционных статуэток (левый угол прилавка) ──
  const stand = new THREE.Group(); stand.position.set(-1.02, cy, -0.2); stand.rotation.y = 0.18; stand.scale.setScalar(1.3); root.add(stand);
  const standWood = std('#7a4d2c', { roughness: 0.7 });
  add(stand, rbox(0.46, 0.02, 0.16, 0.004), standWood, 0, 0.01, 0);
  add(stand, rbox(0.46, 0.05, 0.08, 0.004), standWood, 0, 0.035, 0.04);
  const figSlots: THREE.Object3D[] = [];
  for (let row = 0; row < 2; row++) for (let i = 0; i < 4; i++) {
    const o = new THREE.Object3D();
    o.position.set(-0.165 + i * 0.11, row === 0 ? 0.06 : 0.02, row === 0 ? 0.04 : -0.045);
    stand.add(o); figSlots.push(o);
  }
  const bin = new THREE.Group(); bin.position.set(0.55, 0, 1.55); root.add(bin);
  add(bin, new THREE.CylinderGeometry(0.13, 0.11, 0.32, 24, 1, true), std('#3a3f47', { roughness: 0.6, side: THREE.DoubleSide }), 0, 0.16, 0);
  add(bin, cyl(0.11, 0.11, 0.01, 24), std('#2a2d32'), 0, 0.016, 0); // дно выше пола — без мерцания
  for (let i = 0; i < 4; i++) add(bin, sph(0.045, 7, 5), std('#efece4', { roughness: 0.95, flatShading: true }), Math.cos(i * 1.7) * 0.05, 0.3 + (i % 2) * 0.03, Math.sin(i * 1.7) * 0.05);
  // ── коврик на полу ──
  const rugT = canvasTex(256, 128, (g, w, h) => { g.fillStyle = '#7a3b2e'; g.fillRect(0, 0, w, h); g.strokeStyle = '#e8b45a'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20); for (let x = 30; x < w - 20; x += 20) { g.fillStyle = x % 40 ? '#e8b45a' : '#2f6f6b'; g.fillRect(x, h / 2 - 6, 10, 12); } });
  add(root, box(1.2, 0.006, 0.7), std('#fff', { map: rugT, roughness: 1 }), 0, 0.012, 1.1, 0, 0, 0, false);
  // ── кассовый аппарат на прилавке ──
  // Касса стоит клавишами и экраном к МАСТЕРУ: на экране — сколько денег в кассе.
  const reg = new THREE.Group(); reg.position.set(0.92, 0.925, 0.14); reg.rotation.y = Math.PI - 0.45; root.add(reg);
  add(reg, rbox(0.3, 0.07, 0.24, 0.015), std('#e9e5dc', { roughness: 0.5 }), 0, 0.035, 0);
  add(reg, rbox(0.26, 0.06, 0.14, 0.012), std('#d8d3c8', { roughness: 0.5 }), 0, 0.09, -0.02, -0.35, 0, 0);
  const keysM = std('#3a3f47', { roughness: 0.5 });
  for (let i = 0; i < 12; i++) add(reg, rbox(0.03, 0.012, 0.022, 0.004, 1), i === 11 ? std('#2e8b57') : keysM, -0.09 + (i % 4) * 0.045, 0.125 - Math.floor(i / 4) * 0.012, -0.05 + Math.floor(i / 4) * 0.03, -0.35, 0, 0);
  let cashShown = 0;
  const lcd = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#1d281b'; g.fillRect(0, 0, w, h); g.fillStyle = '#a8e36c'; g.textAlign = 'right'; g.textBaseline = 'middle'; fitText(g, '$' + cashShown.toLocaleString('en-US'), w - 14, h / 2 + 2, w - 28, 44, 700, '"JetBrains Mono", monospace'); });
  const disp = new THREE.Group(); disp.position.set(0, 0.16, 0.06); reg.add(disp);
  add(disp, rbox(0.14, 0.05, 0.02, 0.006), std('#2a2d32'), 0, 0, 0);
  add(disp, new THREE.PlaneGeometry(0.12, 0.03), own('#000', { map: lcd, emissive: '#fff', emissiveMap: lcd, emissiveIntensity: 0.9 }), 0, 0, -0.0105, 0, Math.PI, 0, false);
  add(reg, cyl(0.004, 0.004, 0.08, 6), std('#2a2d32'), 0, 0.12, 0.06);
  // ── стикеры над монитором ──
  const stickyColors = ['#ffd95e', '#9fe0d6', '#ff9ab0', '#c7f08a'];
  const stickies: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.09), new THREE.MeshStandardMaterial({ map: stickyTex('…', stickyColors[i]), roughness: 0.85 }));
    m.position.set(-0.45 + i * 0.13 + (i > 1 ? 0.62 : 0), 1.38 + (i % 2) * 0.09, 2.093);
    m.rotation.set(0, Math.PI, (i - 1.5) * 0.08);
    root.add(m); stickies.push(m);
  }
  // ── календарь на задней стене ──
  const calT = canvasTex(256, 320, () => undefined);
  const cal = new THREE.Group(); cal.position.set(-1.05, 1.22, 2.093); cal.rotation.y = Math.PI; root.add(cal);
  add(cal, new THREE.PlaneGeometry(0.2, 0.25), new THREE.MeshStandardMaterial({ map: calT, roughness: 0.9 }), 0, 0, 0, 0, 0, 0, false);
  add(cal, cyl(0.004, 0.004, 0.18, 6), metal('#c9ccd2'), 0, 0.125, 0.004, 0, 0, Math.PI / 2);
  // ── вентилятор-«ветродуй» на столе ──
  const fan = new THREE.Group(); fan.position.set(0.45, 0.797, 1.75); fan.rotation.y = 2.6; root.add(fan);
  add(fan, cyl(0.06, 0.07, 0.02, 20), std('#e9e5dc'), 0, 0.01, 0);
  add(fan, cyl(0.01, 0.01, 0.16, 8), std('#e9e5dc'), 0, 0.09, 0);
  add(fan, new THREE.TorusGeometry(0.09, 0.006, 6, 32), std('#e9e5dc'), 0, 0.2, 0.0);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; add(fan, cyl(0.002, 0.002, 0.18, 4), std('#d8d3c8'), Math.cos(a) * 0.0, 0.2, 0, 0, 0, a); }
  add(fan, sph(0.025, 10, 8), std('#2f6f6b'), 0, 0.2, -0.01);
  // ── доска с ценами у входа (видна из меню и с улицы) ──
  const chalk = liveTex(256, 360, (g, w, h) => {
    g.fillStyle = '#2b2f2c'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 300; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 1);
    g.fillStyle = '#f2efe6'; g.textAlign = 'center'; g.textBaseline = 'middle';
    fitText(g, tr('Сборка ПК', 'PC build'), w / 2, 60, w - 40, 54, 700, 'Caveat');
    g.fillStyle = '#f3c632'; fitText(g, tr('от $499', 'from $499'), w / 2, 120, w - 40, 46, 700, 'Caveat');
    g.fillStyle = '#9fe0d6'; fitText(g, tr('чистка + паста $49', 'clean + paste $49'), w / 2, 190, w - 30, 38, 700, 'Caveat');
    g.fillStyle = '#ff9ab0'; fitText(g, tr('апгрейд видеокарты', 'GPU upgrade'), w / 2, 250, w - 30, 38, 700, 'Caveat');
    g.fillStyle = '#f2efe6'; fitText(g, '☺', w / 2, 315, 80, 40, 700, 'Caveat');
  });
  const board = new THREE.Group(); board.position.set(1.75, 0, -0.75); board.rotation.y = Math.PI + 0.35; root.add(board);
  const wood = std('#8a5a36', { roughness: 0.8 });
  for (const s of [-1, 1]) {
    // Створки сходятся НАВЕРХУ (шарнир), низ расставлен — как у настоящей
    // доски-«домика». Раньше шарнир был внизу, и доска стояла буквой V.
    const leg = new THREE.Group(); leg.position.y = 0.8; leg.rotation.x = -s * 0.2; board.add(leg);
    add(leg, rbox(0.5, 0.8, 0.02, 0.006), wood, 0, -0.4, s * 0.012);
    add(leg, new THREE.PlaneGeometry(0.42, 0.62), std('#fff', { map: chalk, roughness: 0.95 }), 0, -0.38, s * 0.023, 0, s > 0 ? 0 : Math.PI, 0);
  }
  // ── провод от лампы и удлинитель под столом ──
  add(root, rbox(0.3, 0.04, 0.07, 0.01), std('#e9e5dc'), -1.2, 0.02, 1.6);
  for (let i = 0; i < 4; i++) add(root, box(0.02, 0.005, 0.03), std('#2a2d32'), -1.31 + i * 0.07, 0.042, 1.6);
  tube(root, [V(-1.22, 0.905, 1.6), V(-1.24, 0.905, 1.94), V(-1.27, 0.5, 1.96), V(-1.25, 0.04, 1.62)], 0.004, std('#1b1c20'), 24, 5).castShadow = false;
  void phys;

  let lastDay = -1;
  const setCash = (n: number) => {
    if (n === cashShown) return;
    cashShown = n;
    const c = lcd.image as HTMLCanvasElement, g = c.getContext('2d')!;
    g.fillStyle = '#1d281b'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#a8e36c'; g.textAlign = 'right'; g.textBaseline = 'middle';
    fitText(g, '$' + n.toLocaleString('en-US'), c.width - 14, c.height / 2 + 2, c.width - 28, 44, 700, '"JetBrains Mono", monospace');
    lcd.needsUpdate = true;
  };

  return {
    setCash, figSlots, posterSlots,
    setDay(n: number, ru: boolean) {
      if (n === lastDay) return; lastDay = n;
      const c = calT.image as HTMLCanvasElement, g = c.getContext('2d')!;
      g.fillStyle = '#fffaf0'; g.fillRect(0, 0, 256, 320);
      g.fillStyle = '#d9442e'; g.fillRect(0, 0, 256, 80);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      fitText(g, ru ? 'ДЕНЬ' : 'DAY', 128, 42, 200, 44, 900);
      g.fillStyle = '#17191c'; fitText(g, String(n), 128, 200, 220, 150, 900);
      g.strokeStyle = 'rgba(0,0,0,.15)'; for (let y = 90; y < 320; y += 30) { g.beginPath(); g.moveTo(16, y); g.lineTo(240, y); g.stroke(); }
      calT.needsUpdate = true;
    },
    setStickies(lines: string[]) {
      stickies.forEach((m, i) => {
        const old = (m.material as THREE.MeshStandardMaterial).map;
        (m.material as THREE.MeshStandardMaterial).map = stickyTex(lines[i] ?? '', stickyColors[i]);
        (m.material as THREE.MeshStandardMaterial).needsUpdate = true;
        old?.dispose();
      });
    },
  };
}
