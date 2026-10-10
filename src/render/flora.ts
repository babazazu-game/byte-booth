import * as THREE from 'three';
import { add, std, cyl, TAU } from './kit.ts';

/*
 * Деревья и кусты — в стиле нарисованных задников (автор: «деревья хуже, чем
 * на рисунке»): кроны из гранёных шаров (икосаэдр, плоское затенение),
 * сочная салатовая листва — светлее сверху, темнее снизу; у лиственных ствол
 * с двумя ветками, ели — гранёные «свечки». Геометрия общая на всех, материалы
 * общие — mergeTree склеивает парк в несколько вызовов отрисовки.
 */
const FOL = ['#5f9a34', '#78b23e', '#93c64a', '#a9d45c'].map((c) => std(c, { roughness: 0.85, flatShading: true }));
const FOL_DARK = std('#4d8530', { roughness: 0.85, flatShading: true });
const BARK = std('#7a5235', { roughness: 0.9 });
const FLOWERS = ['#ffffff', '#ffc4d6', '#ffe08a'].map((c) => std(c, { roughness: 0.6, flatShading: true }));
const facet = (r: number) => new THREE.IcosahedronGeometry(r, 1);

export function bush(r: () => number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r() * 0.5, d = 0.16 + r() * 0.12, rad = 0.2 + r() * 0.08;
    add(g, facet(rad), i % 2 ? FOL[0] : FOL_DARK, Math.cos(a) * d, rad * 0.8, Math.sin(a) * d, r(), r(), 0).scale.y = 0.85;
  }
  for (let i = 0; i < 3; i++) {
    const a = r() * TAU, d = r() * 0.12, rad = 0.19 + r() * 0.07;
    add(g, facet(rad), FOL[1 + (i % 2)], Math.cos(a) * d, 0.36 + r() * 0.1, Math.sin(a) * d, r(), r(), 0);
  }
  add(g, facet(0.14), FOL[3], 0, 0.55, 0, r(), r(), 0);
  // у части кустов — цветочки, как на рисунке
  if (seed % 3 === 0) for (let i = 0; i < 6; i++) {
    const a = r() * TAU, d = 0.18 + r() * 0.12;
    add(g, new THREE.IcosahedronGeometry(0.035, 0), FLOWERS[i % 3], Math.cos(a) * d, 0.3 + r() * 0.25, Math.sin(a) * d);
  }
  return g;
}

export function tree(r: () => number, kind: number): THREE.Group {
  const g = new THREE.Group();
  const h = 1.5 + r() * 1.2;
  if (kind % 3 === 2) {
    // «свеча» (кипарис/ель с рисунка): гранёный вытянутый конус
    add(g, cyl(0.06, 0.08, 0.4, 6), BARK, 0, 0.2, 0);
    // округлая гранёная «капля», светлее кверху — как кипарисы на рисунке
    add(g, facet(0.5), FOL_DARK, 0, 1.25, 0, r(), r(), 0).scale.set(1, 2.0, 1);
    add(g, facet(0.38), FOL[0], 0, 2.15, 0, r(), r(), 0).scale.set(1, 1.9, 1);
    add(g, facet(0.2), FOL[1], 0, 2.75, 0, r(), r(), 0).scale.set(1, 1.6, 1);
    return g;
  }
  add(g, cyl(0.07, 0.13, h, 7), BARK, 0, h / 2, 0);
  // две ветки из ствола в крону
  for (const s of [-1, 1]) {
    const br = add(g, cyl(0.035, 0.055, 0.7, 6), BARK, s * 0.17, h * 0.85, 0, 0, 0, -s * 0.6);
    br.rotation.y = r() * 0.6;
  }
  // крона: нижний тёмный ярус, средний, светлая верхушка — горкой
  const tiers: [number, number, number, number][] = [[6, 0.55, 0.0, 0.42], [5, 0.38, 0.45, 0.4], [2, 0.16, 0.85, 0.36]];
  tiers.forEach(([n, ring, dy, rad], t) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r() * 0.5;
      const m = add(g, facet(rad * (0.85 + r() * 0.3)), t === 0 ? FOL[0] : t === 1 ? FOL[1 + (i % 2)] : FOL[3], Math.cos(a) * ring, h + 0.25 + dy + r() * 0.1, Math.sin(a) * ring, r(), r(), 0);
      m.scale.y = 0.92;
    }
  });
  add(g, facet(0.5), FOL[1], 0, h + 0.55, 0, r(), r(), 0);
  return g;
}


/*
 * Время года района: листва (общие материалы всех деревьев и кустов)
 * перекрашивается целиком — деревья вокруг ларька тоже меняют сезон.
 */
export type Season = 'summer' | 'autumn' | 'winter' | 'spring' | 'sea';
const PAL: Record<Season, { fol: string[]; dark: string; flowers: string[] }> = {
  summer: { fol: ['#5f9a34', '#78b23e', '#93c64a', '#a9d45c'], dark: '#4d8530', flowers: ['#ffffff', '#ffc4d6', '#ffe08a'] },
  sea: { fol: ['#4f9a3c', '#6cb54a', '#8fd05a', '#b4e070'], dark: '#3f8a34', flowers: ['#ffffff', '#ff8aa8', '#ffd25e'] },
  autumn: { fol: ['#c8562a', '#e07a2c', '#eba23a', '#f2c64a'], dark: '#a8442a', flowers: ['#f2c64a', '#e07a2c', '#c8562a'] },
  winter: { fol: ['#dfe8ee', '#eef3f6', '#f7fafc', '#ffffff'], dark: '#6f8a8e', flowers: ['#ffffff', '#e8f0f6', '#d8e6f0'] },
  spring: { fol: ['#f4b6c8', '#f8c9d6', '#fbe0e8', '#ffffff'], dark: '#86b858', flowers: ['#ffffff', '#ff9ab8', '#ffe08a'] },
};
export function setSeason(s: Season): void {
  const p = PAL[s];
  FOL.forEach((m, i) => m.color.set(p.fol[i]));
  FOL_DARK.color.set(p.dark);
  FLOWERS.forEach((m, i) => m.color.set(p.flowers[i]));
}
export { FOL, FOL_DARK, BARK };
