/**
 * Коллекционные статуэтки для прилавка: «глиняные» фигурки 8–12 см.
 *
 * Первая версия была из голых шаров и коробок — с места мастера читалось как
 * заглушка. Теперь тела выточены по профилю (Lathe) и собраны из капсул,
 * есть глаза с бликами, румянец, лапки, мелкие аксессуары — уровень
 * сувенирных фигурок на полках мастерской.
 */

import * as THREE from 'three';
import { add, std, own, rbox, cyl, sph, metal, mergeTree, V2, TAU } from '../kit.ts';

const clay = (c: string) => std(c, { roughness: 0.5 });
const gloss = (c: string) => std(c, { roughness: 0.25 });
/** Золото «полуметаллом»: чистый металл без отражений окружения выглядит чёрным. */
const goldM = (c = '#f0c95a') => std(c, { metalness: 0.45, roughness: 0.28, emissive: '#3a2a08', emissiveIntensity: 0.4 });

/** Тело вращения по профилю [радиус, высота]. */
const lathe = (pts: [number, number][], seg = 32) => new THREE.LatheGeometry(pts.map(([r, y]) => V2(r, y)), seg);
/** Глаз: чёрный зрачок с белым бликом. */
function eye(g: THREE.Object3D, x: number, y: number, z: number, r = 0.0045, ry = 0) {
  const e = new THREE.Group(); e.position.set(x, y, z); e.rotation.y = ry; g.add(e);
  add(e, sph(r, 12, 10), gloss('#141414'), 0, 0, 0);
  add(e, sph(r * 0.35, 8, 6), own('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.6 }), r * 0.35, r * 0.4, r * 0.75);
}
/** Румянец — плоский розовый эллипс. */
function blush(g: THREE.Object3D, x: number, y: number, z: number, ry: number) {
  const b = add(g, new THREE.CircleGeometry(0.006, 16), std('#ff8fa3', { roughness: 0.8, transparent: true, opacity: 0.7 }), x, y, z, 0, ry, 0);
  b.scale.set(1.4, 0.8, 1);
}

export function buildFigurine(id: string): THREE.Group {
  const g = new THREE.Group();
  // подставка: тёмная шайба с фаской и латунным кантом
  add(g, lathe([[0, 0], [0.036, 0], [0.038, 0.003], [0.036, 0.009], [0, 0.009]], 36), std('#2b2620', { roughness: 0.55 }), 0, 0, 0);
  add(g, new THREE.TorusGeometry(0.0365, 0.0012, 6, 40), goldM('#c9a14a'), 0, 0.006, 0, Math.PI / 2);
  const B = 0.009;

  if (id === 'duck') {
    const y = '#f6cf3a';
    add(g, lathe([[0, 0], [0.026, 0.004], [0.033, 0.016], [0.03, 0.03], [0.018, 0.038], [0, 0.04]]), clay(y), 0, B, 0).scale.set(1.15, 1, 1);
    add(g, new THREE.ConeGeometry(0.012, 0.022, 16), clay(y), -0.034, B + 0.03, 0, 0, 0, 1.0); // хвостик
    for (const s of [-1, 1]) { const w = add(g, sph(0.014, 14, 10), clay('#efbf2a'), -0.004, B + 0.024, s * 0.028); w.scale.set(1.4, 0.7, 0.45); }
    add(g, sph(0.019, 18, 14), clay(y), 0.012, B + 0.053, 0);
    const beak = add(g, new THREE.CapsuleGeometry(0.006, 0.012, 4, 10), clay('#f08a24'), 0.033, B + 0.05, 0, 0, 0, Math.PI / 2); beak.scale.set(1, 1, 1.5);
    for (const s of [-1, 1]) eye(g, 0.025, B + 0.059, s * 0.011, 0.0035, s * 0.6);
    for (const s of [-1, 1]) blush(g, 0.026, B + 0.05, s * 0.0155, s * 0.9);
  } else if (id === 'cat') {
    const w = '#f7f2e8';
    add(g, lathe([[0, 0], [0.026, 0.002], [0.029, 0.02], [0.024, 0.04], [0.016, 0.048], [0, 0.05]]), clay(w), 0, B, 0);
    add(g, sph(0.027, 22, 18), clay(w), 0, B + 0.07, 0).scale.set(1.15, 0.95, 1);
    for (const s of [-1, 1]) {
      const ear = add(g, new THREE.ConeGeometry(0.011, 0.02, 12), clay(w), s * 0.019, B + 0.095, 0, 0, 0, -s * 0.25);
      add(ear, new THREE.ConeGeometry(0.006, 0.012, 10), clay('#f4a8b8'), 0, -0.002, 0.004);
      eye(g, s * 0.011, B + 0.073, 0.024, 0.0042);
      blush(g, s * 0.019, B + 0.064, 0.022, s * 0.5);
      for (let k = 0; k < 2; k++) add(g, cyl(0.0006, 0.0006, 0.02, 4), clay('#6b5a50'), s * 0.03, B + 0.064 - k * 0.004, 0.018, 0, 0, Math.PI / 2 + s * (0.15 - k * 0.25));
    }
    add(g, sph(0.003, 8, 6), clay('#e8869a'), 0, B + 0.066, 0.028);
    // Поднятая лапка «манэки» на шарнире у плеча. Машет ВПЕРЁД (вокруг оси X),
    // а не вбок: раньше лапка стояла внутри головы.
    const paw = new THREE.Group(); paw.position.set(0.024, B + 0.042, 0.012); paw.rotation.z = -0.55; paw.userData.keep = true; g.add(paw);
    add(paw, new THREE.CapsuleGeometry(0.0075, 0.024, 4, 10), clay(w), 0, 0.016, 0);
    add(paw, sph(0.0085, 12, 10), clay(w), 0, 0.031, 0);
    add(paw, sph(0.0045, 10, 8), clay('#f4a8b8'), 0, 0.032, 0.006).scale.set(1, 1, 0.5);
    g.userData.tick = (t: number) => { paw.rotation.x = 0.15 + 0.45 * (0.5 + 0.5 * Math.sin(t * 3.2)); };
    add(g, new THREE.CapsuleGeometry(0.007, 0.012, 4, 10), clay(w), -0.012, B + 0.022, 0.024, Math.PI / 2, 0, 0);
    // ошейник с колокольчиком и монетка
    add(g, new THREE.TorusGeometry(0.02, 0.003, 8, 24), clay('#d6403a'), 0, B + 0.048, 0, Math.PI / 2);
    add(g, sph(0.005, 12, 10), goldM(), 0, B + 0.044, 0.021);
    add(g, cyl(0.012, 0.012, 0.003, 24), goldM(), 0, B + 0.028, 0.027, Math.PI / 2);
  } else if (id === 'dino') {
    // Игрушечный тирекс стоя: большая голова с мордой, пузико, крошечные лапки,
    // толстые ноги со ступнями, сужающийся хвост и гребень по спине.
    const gr = '#5fb36c', grD = '#4a9a58', bellyC = '#d6eeb0', plate = '#f2a93a';
    const body = add(g, lathe([[0, 0], [0.021, 0.004], [0.026, 0.018], [0.024, 0.034], [0.017, 0.047], [0, 0.052]], 28), clay(gr), 0, B + 0.012, 0);
    body.scale.set(1, 1, 0.9); body.rotation.x = 0.12;
    add(g, sph(0.019, 18, 14), clay(bellyC), 0, B + 0.03, 0.011).scale.set(0.95, 1.05, 0.7);
    // голова и морда
    add(g, sph(0.022, 22, 18), clay(gr), 0, B + 0.07, 0.01).scale.set(1, 0.92, 1.05);
    add(g, sph(0.017, 20, 16), clay(gr), 0, B + 0.064, 0.027).scale.set(1.05, 0.78, 1.0);
    add(g, sph(0.012, 16, 12), clay(bellyC), 0, B + 0.058, 0.03).scale.set(1.15, 0.5, 0.9);
    add(g, new THREE.TorusGeometry(0.009, 0.0012, 6, 16, Math.PI), clay('#2c4a33'), 0, B + 0.062, 0.042, Math.PI, 0, 0);
    for (const s2 of [-1, 1]) {
      eye(g, s2 * 0.011, B + 0.077, 0.028, 0.0042, s2 * 0.35);
      blush(g, s2 * 0.016, B + 0.066, 0.033, s2 * 0.6);
      add(g, sph(0.0012, 6, 4), clay('#2c4a33'), s2 * 0.004, B + 0.066, 0.044);
      // крошечные передние лапки
      add(g, new THREE.CapsuleGeometry(0.0035, 0.009, 4, 8), clay(gr), s2 * 0.017, B + 0.042, 0.018, -1.0, 0, s2 * 0.3);
      // ноги и ступни с коготками
      add(g, new THREE.CapsuleGeometry(0.009, 0.012, 4, 12), clay(grD), s2 * 0.014, B + 0.012, -0.002);
      add(g, sph(0.009, 12, 10), clay(grD), s2 * 0.014, B + 0.003, 0.007).scale.set(1, 0.5, 1.5);
      for (const c of [-1, 0, 1]) add(g, sph(0.0022, 6, 4), clay('#f4f1ea'), s2 * 0.014 + c * 0.004, B + 0.003, 0.02);
    }
    // хвост — цепочка шаров, тоньше к концу
    for (let i = 0; i < 9; i++) { const t = i / 8; add(g, sph(0.012 - t * 0.008, 14, 10), clay(gr), Math.sin(t * 1.2) * 0.01, B + 0.022 - t * 0.016, -0.018 - t * 0.042); }
    // гребень: пластинки от затылка по спине на хвост
    for (let i = 0; i < 8; i++) {
      const t = i / 7, y = B + 0.088 - t * 0.075, z = -0.002 - t * 0.05 - (t > 0.5 ? (t - 0.5) * 0.02 : 0);
      add(g, new THREE.ConeGeometry(0.005 - t * 0.0022, 0.011 - t * 0.004, 4), clay(plate), 0, y, z, -0.5 - t * 0.6, 0, 0);
    }
    // пятнышки
    for (const [x, y, z] of [[0.018, 0.035, -0.006], [-0.019, 0.026, -0.004], [0.012, 0.081, -0.008], [-0.014, 0.05, -0.012]]) add(g, sph(0.004, 8, 6), clay(grD), x, B + y, z).scale.set(1, 1, 0.4);
  } else if (id === 'rocket') {
    add(g, lathe([[0, 0], [0.012, 0], [0.017, 0.012], [0.018, 0.04], [0.015, 0.06], [0.009, 0.075], [0, 0.084]], 36), gloss('#eef0f2'), 0, B + 0.012, 0);
    // нос чуть шире корпуса: лёжа ровно на той же поверхности, он мерцал
    add(g, lathe([[0.0, 0.058], [0.0152, 0.06], [0.009, 0.075], [0, 0.084]], 36), gloss('#e2334a'), 0, B + 0.012, 0).scale.set(1.04, 1.01, 1.04);
    add(g, new THREE.TorusGeometry(0.0182, 0.0016, 6, 32), gloss('#e2334a'), 0, B + 0.03, 0, Math.PI / 2);
    // иллюминатор с ободком
    add(g, new THREE.TorusGeometry(0.0075, 0.0018, 8, 24), metal('#9aa0a8', 0.3), 0, B + 0.058, 0.0165);
    add(g, sph(0.0068, 16, 12), own('#2a6fb0', { emissive: '#7fd6ff', emissiveIntensity: 0.6, roughness: 0.1 }), 0, B + 0.058, 0.0155).scale.set(1, 1, 0.5);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + Math.PI / 6;
      const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(0.016, -0.004); fin.lineTo(0.014, 0.018); fin.lineTo(0, 0.028);
      const f = add(g, new THREE.ExtrudeGeometry(fin, { depth: 0.003, bevelEnabled: false }), gloss('#e2334a'), Math.cos(a) * 0.016, B + 0.012, Math.sin(a) * 0.016);
      f.rotation.y = -a;
    }
    add(g, lathe([[0, 0], [0.01, 0.004], [0.006, 0.014], [0, 0.016]], 20), own('#ffb347', { emissive: '#ff8a2a', emissiveIntensity: 1.4 }), 0, B + 0.012, 0, Math.PI, 0, 0);
  } else if (id === 'astro') {
    const suit = '#eceef1';
    add(g, new THREE.CapsuleGeometry(0.019, 0.018, 6, 16), clay(suit), 0, B + 0.04, 0);
    add(g, rbox(0.026, 0.03, 0.012, 0.004), clay('#c9ccd2'), 0, B + 0.043, -0.02); // рюкзак
    for (const s of [-1, 1]) {
      add(g, new THREE.CapsuleGeometry(0.0075, 0.014, 4, 10), clay(suit), s * 0.009, B + 0.012, 0);
      add(g, rbox(0.016, 0.006, 0.02, 0.003), clay('#8a8f99'), s * 0.009, B + 0.003, 0.003); // ботинки
      add(g, new THREE.CapsuleGeometry(0.006, 0.016, 4, 10), clay(suit), s * 0.024, B + 0.045, 0.002, 0, 0, s * 0.5);
    }
    add(g, sph(0.023, 22, 18), clay(suit), 0, B + 0.083, 0);
    const visor = add(g, sph(0.017, 20, 16), std('#2b3a5a', { roughness: 0.08, metalness: 0.2 }), 0, B + 0.083, 0.016); visor.scale.set(1.1, 0.82, 0.62);
    add(g, sph(0.004, 8, 6), own('#fff', { emissive: '#fff', emissiveIntensity: 0.7 }), 0.007, B + 0.089, 0.026);
    add(g, rbox(0.01, 0.008, 0.003, 0.001), clay('#e2334a'), -0.008, B + 0.052, 0.019); // нашивка
    add(g, cyl(0.0008, 0.0008, 0.05, 4), metal('#c9ccd2'), 0.03, B + 0.05, 0.004); // флажок
    add(g, new THREE.PlaneGeometry(0.018, 0.012), std('#3a6fd6', { side: THREE.DoubleSide }), 0.039, B + 0.069, 0.004);
  } else if (id === 'gamepad') {
    // постамент-трофей и золотой геймпад над ним
    add(g, lathe([[0, 0], [0.022, 0], [0.018, 0.006], [0.006, 0.012], [0.005, 0.03], [0.012, 0.034], [0, 0.034]], 28), goldM('#e3bd4f'), 0, B, 0);
    add(g, rbox(0.03, 0.01, 0.002, 0.001), std('#2b2620'), 0, B + 0.006, 0.02);
    // Геймпад — цельный силуэт (контур с рукоятками, выдавлен со скруглением),
    // а не набор капсул: из капсул выходило криво. Лицом вверх-вперёд.
    const pad = new THREE.Group(); pad.position.set(0, B + 0.05, 0.002); pad.rotation.x = -0.9; g.add(pad);
    const gold = goldM(), gold2 = goldM('#b8862e');
    const sh = new THREE.Shape();
    sh.moveTo(-0.02, 0.013); sh.lineTo(0.02, 0.013);
    sh.bezierCurveTo(0.033, 0.015, 0.037, 0.007, 0.038, -0.003);
    sh.bezierCurveTo(0.04, -0.016, 0.036, -0.027, 0.028, -0.027);
    sh.bezierCurveTo(0.021, -0.027, 0.018, -0.017, 0.012, -0.011);
    sh.lineTo(-0.012, -0.011);
    sh.bezierCurveTo(-0.018, -0.017, -0.021, -0.027, -0.028, -0.027);
    sh.bezierCurveTo(-0.036, -0.027, -0.04, -0.016, -0.038, -0.003);
    sh.bezierCurveTo(-0.037, 0.007, -0.033, 0.015, -0.02, 0.013);
    const bodyG = new THREE.ExtrudeGeometry(sh, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 4, curveSegments: 24 });
    bodyG.translate(0, 0.004, -0.004);
    add(pad, bodyG, gold);
    const face = 0.0072; // лицевая поверхность (верх выдавливания)
    // крестовина слева
    add(pad, rbox(0.012, 0.004, 0.0025, 0.001), gold2, -0.022, 0.002, face);
    add(pad, rbox(0.004, 0.012, 0.0025, 0.001), gold2, -0.022, 0.002, face);
    // четыре кнопки справа ромбом
    for (const [x, y] of [[0.022, 0.008], [0.028, 0.002], [0.022, -0.004], [0.016, 0.002]]) add(pad, cyl(0.0026, 0.0026, 0.002, 14), gold2, x, y, face, Math.PI / 2, 0, 0);
    // два стика ниже центра
    for (const x of [-0.009, 0.009]) {
      add(pad, cyl(0.004, 0.004, 0.002, 18), gold2, x, -0.006, face, Math.PI / 2, 0, 0);
      add(pad, cyl(0.0032, 0.0032, 0.003, 18), gold, x, -0.006, face + 0.002, Math.PI / 2, 0, 0);
    }
    // центральные кнопки
    for (const x of [-0.004, 0.004]) add(pad, rbox(0.004, 0.002, 0.0015, 0.0006), gold2, x, 0.008, face);
  } else if (id === 'tower') {
    // Мини-системник: белый корпус, стеклянный бок, внутри светятся плата,
    // видеокарта и вентиляторы; подсветка переливается (tick).
    // стеклянным боком к зрителю: иначе светящиеся внутренности не видно
    const T = new THREE.Group(); T.rotation.y = -Math.PI / 2; g.add(T);
    const shell = std('#eeeeea', { roughness: 0.35 });
    const W2 = 0.036, H2 = 0.074, D2 = 0.062, cy = B + 0.04;
    add(T, rbox(0.004, H2, D2, 0.002), shell, -W2 / 2, cy, 0);
    add(T, rbox(W2, 0.004, D2, 0.002), shell, 0, cy + H2 / 2, 0);
    add(T, rbox(W2, 0.004, D2, 0.002), shell, 0, cy - H2 / 2, 0);
    add(T, rbox(W2, H2, 0.004, 0.002), shell, 0, cy, -D2 / 2);
    add(T, rbox(W2, H2, 0.004, 0.002), shell, 0, cy, D2 / 2);
    const rgbM: THREE.MeshStandardMaterial[] = [];
    const glow = (c: string, k = 2.2) => { const m = own('#111', { emissive: c, emissiveIntensity: k }); rgbM.push(m); return m; };
    // плата и детали внутри
    add(T, new THREE.PlaneGeometry(D2 - 0.012, H2 - 0.014), glow('#5a3fd0', 0.9), -W2 / 2 + 0.003, cy, 0, 0, Math.PI / 2, 0);
    // кольца вентиляторов на плате — прямо за стеклом, их видно первыми
    for (const [z, c] of [[-0.014, '#4fd1c0'], [0.014, '#ff4d8d']] as const) {
      add(T, new THREE.TorusGeometry(0.0095, 0.0018, 8, 24), glow(c, 2.8), -W2 / 2 + 0.006, cy + 0.02, z, 0, Math.PI / 2, 0);
      add(T, cyl(0.008, 0.008, 0.002, 16), std('#e6e6e2'), -W2 / 2 + 0.006, cy + 0.02, z, 0, 0, Math.PI / 2);
    }
    add(T, rbox(0.01, 0.012, 0.012, 0.002), std('#c9ccd2', { metalness: 0.6, roughness: 0.3 }), -0.008, cy + 0.016, -0.004);
    for (let i = 0; i < 2; i++) add(T, rbox(0.004, 0.022, 0.0025, 0.0006), glow('#ff4d8d', 3), -0.01, cy - 0.002, 0.012 + i * 0.005);
    add(T, rbox(0.014, 0.008, 0.05, 0.002), std('#2a2d35'), -0.006, cy - 0.02, 0);
    add(T, rbox(0.002, 0.004, 0.048, 0.0006), glow('#4fd1c0', 3), 0.0016, cy - 0.016, 0);
    for (let i = 0; i < 3; i++) {
      add(T, new THREE.TorusGeometry(0.0085, 0.0016, 8, 22), glow(['#ff4d8d', '#4fd1c0', '#8a5bff'][i]), 0, cy + 0.022 - i * 0.022, -D2 / 2 + 0.003);
      add(T, cyl(0.007, 0.007, 0.002, 16), std('#d9d9d4'), 0, cy + 0.022 - i * 0.022, -D2 / 2 + 0.0035, Math.PI / 2);
    }
    // стекло и световая полоса спереди
    add(T, new THREE.PlaneGeometry(D2 - 0.004, H2 - 0.004), std('#bcd8e8', { transparent: true, opacity: 0.18, roughness: 0.05 }), W2 / 2, cy, 0, 0, Math.PI / 2, 0);
    add(T, rbox(0.003, H2 - 0.012, 0.0015, 0.001), glow('#7fd6ff', 2.6), -0.011, cy, D2 / 2 + 0.001);
    add(T, cyl(0.0028, 0.0028, 0.0015, 12), glow('#7fd6ff', 2.2), 0.009, cy + 0.028, D2 / 2 + 0.001, Math.PI / 2);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(T, cyl(0.003, 0.0035, 0.004, 10), std('#bdbdb8'), x * 0.013, B + 0.002, z * 0.024);
    const hsl = new THREE.Color();
    g.userData.tick = (t: number) => rgbM.forEach((m, i) => m.emissive.copy(hsl.setHSL((t * 0.15 + i * 0.13) % 1, 0.85, 0.55)));
  } else {
    // кубок «Лучший сборщик»: точёная чаша, ручки, звезда и табличка
    const gold = goldM();
    add(g, rbox(0.044, 0.016, 0.044, 0.004), std('#2b2620', { roughness: 0.5 }), 0, B + 0.008, 0);
    add(g, rbox(0.03, 0.009, 0.002, 0.001), metal('#c9ccd2', 0.25), 0, B + 0.008, 0.0225);
    add(g, lathe([[0, 0], [0.012, 0], [0.006, 0.006], [0.004, 0.024], [0.008, 0.028], [0.026, 0.05], [0.028, 0.066], [0.025, 0.066], [0.022, 0.054], [0, 0.04]], 36), gold, 0, B + 0.016, 0);
    // Ручки — плавная «С»-дуга трубкой от края чаши к её боку, зеркально.
    // Кусок тора с поворотами торчал вкось.
    const y0 = B + 0.016;
    for (const s2 of [-1, 1]) {
      const pts = [[0.024, 0.062], [0.036, 0.064], [0.043, 0.056], [0.04, 0.046], [0.03, 0.04], [0.019, 0.039]].map(([x, y]) => new THREE.Vector3(s2 * x, y0 + y, 0));
      add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0023, 8, false), gold);
    }
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + Math.PI / 2, r = i % 2 ? 0.0045 : 0.01; if (i) star.lineTo(Math.cos(a) * r, Math.sin(a) * r); else star.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    add(g, new THREE.ExtrudeGeometry(star, { depth: 0.003, bevelEnabled: false }), gold, 0, B + 0.052, 0.022);
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = false; });
  mergeTree(g);
  return g;
}
