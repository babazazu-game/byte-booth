import * as THREE from 'three';
import { add, std, own, rbox, cyl, extrude, rrPath, circ, canvasTex, fitText, V2, TAU } from '../kit.ts';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Вентилятор: лопасти с настоящей винтовой круткой, ступица, рамка.
 *
 * Лопасть — контур в полярных координатах, выдавленный и потом закрученный
 * по радиусу. Плоская «пропеллерная» лопасть читается как игрушка, а крутка
 * даёт тот самый блик на вращении, по которому глаз узнаёт вентилятор.
 */

const bladeCache = new Map<string, THREE.BufferGeometry>();
function bladeGeo(r0: number, r1: number, sweep: number, w0: number, w1: number, th: number, pitch: number): THREE.BufferGeometry {
  const k = [r0, r1, sweep, w0, w1, th, pitch].map((n) => n.toFixed(4)).join(',');
  const hit = bladeCache.get(k);
  if (hit) return hit;
  const N = 12, lead: THREE.Vector2[] = [], trail: THREE.Vector2[] = [];
  const cl = (t: number) => sweep * (0.35 * t + 0.65 * t * t);
  for (let i = 0; i <= N; i++) {
    const t = i / N, r = r0 + (r1 - r0) * t, c = cl(t), w = w0 + (w1 - w0) * Math.sin(t * Math.PI / 2);
    lead.push(V2(r * Math.cos(c + w), r * Math.sin(c + w)));
    trail.push(V2(r * Math.cos(c - w), r * Math.sin(c - w)));
  }
  const s = new THREE.Shape(); s.moveTo(trail[0].x, trail[0].y); s.lineTo(lead[0].x, lead[0].y);
  for (let i = 1; i <= N; i++) s.lineTo(lead[i].x, lead[i].y);
  s.quadraticCurveTo(r1 * 1.05 * Math.cos(sweep), r1 * 1.05 * Math.sin(sweep), trail[N].x, trail[N].y);
  for (let i = N - 1; i >= 0; i--) s.lineTo(trail[i].x, trail[i].y);
  let g: THREE.BufferGeometry = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: true, bevelThickness: th * 0.45, bevelSize: th * 0.45, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -th / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), r = Math.hypot(x, y);
    const t = Math.min(1, Math.max(0, (r - r0) / (r1 - r0)));
    p.setZ(i, p.getZ(i) - pitch * r * (Math.atan2(y, x) - cl(t)));
  }
  g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g, 1e-7); g.computeVertexNormals();
  bladeCache.set(k, g);
  return g;
}

const hubTexCache = new Map<string, THREE.Texture>();
export function hubTex(text: string, bg = '#1b1f2a', ink = '#f6e9da', ring = '#ff8a5c'): THREE.Texture {
  const k = text + bg + ink + ring;
  let t = hubTexCache.get(k);
  if (!t) {
    t = canvasTex(256, 256, (g) => {
      g.fillStyle = bg; g.beginPath(); g.arc(128, 128, 128, 0, TAU); g.fill();
      if (ring) { g.strokeStyle = ring; g.lineWidth = 9; g.beginPath(); g.arc(128, 128, 110, 0, TAU); g.stroke(); }
      g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
      fitText(g, text, 128, 134, 170, 64, 900);
    });
    hubTexCache.set(k, t);
  }
  return t;
}

export interface Fan { group: THREE.Group; rotor: THREE.Group; rgb: THREE.MeshStandardMaterial[] }

export interface FanOpts { R?: number; n?: number; blade?: string; hub?: string; logo?: THREE.Texture; frame?: boolean; frameColor?: string; rgb?: boolean; depth?: number;
  /** Форма лопасти: закрутка и ширина у ступицы/края — у каждого бренда своя. */
  sweep?: number; w0?: number; w1?: number }

const hubCache = new Map<number, THREE.BufferGeometry>();

export function buildFan(o: FanOpts = {}): Fan {
  const R = o.R ?? 0.045, n = o.n ?? 9, depth = o.depth ?? 0.025;
  const group = new THREE.Group(), rotor = new THREE.Group();
  group.add(rotor);
  const res: Fan = { group, rotor, rgb: [] };
  let bm: THREE.MeshStandardMaterial;
  if (o.rgb) { bm = own('#a4a4ac', { transparent: true, opacity: 0.88, emissive: '#ff4d8d', emissiveIntensity: 0.5, roughness: 0.25, side: THREE.DoubleSide }); res.rgb.push(bm); }
  else bm = std(o.blade ?? '#253049', { roughness: 0.42, side: THREE.DoubleSide });
  const bg = bladeGeo(R * 0.33, R * 0.96, o.sweep ?? 0.72, o.w0 ?? 0.2, o.w1 ?? 0.3, R * 0.032, 0.55);
  for (let i = 0; i < n; i++) { const m = add(rotor, bg, bm); m.rotation.z = (i * TAU) / n; m.castShadow = false; }
  let hg = hubCache.get(R);
  if (!hg) {
    hg = new THREE.LatheGeometry([[0, 0.18], [0.16, 0.175], [0.27, 0.15], [0.33, 0.1], [0.35, 0.03], [0.35, -0.16], [0, -0.16]].map(([r, y]) => V2(r * R, y * R)), 32);
    hubCache.set(R, hg);
  }
  add(rotor, hg, std(o.hub ?? '#1b2130', { roughness: 0.35 }), 0, 0, 0, Math.PI / 2);
  const st = new THREE.Mesh(new THREE.CircleGeometry(R * 0.26, 32), std('#fff', { map: o.logo ?? hubTex('FAN'), roughness: 0.4 }));
  st.position.z = R * 0.181;
  rotor.add(st);
  if (o.frame) {
    const S = R * 2.14, fm = std(o.frameColor ?? '#f1f0ec', { roughness: 0.5 });
    const sh = rrPath(THREE.Shape, S, S, R * 0.18); sh.holes.push(circ(0, 0, R * 1.04));
    add(group, extrude(sh, depth, 0.0015, 20), fm);
    add(group, cyl(R * 0.36, R * 0.36, depth * 0.35, 24), fm, 0, 0, -depth * 0.35, Math.PI / 2);
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2, L = R * 1.05;
      add(group, rbox(L, R * 0.07, depth * 0.18, 0.001, 1), fm, (Math.cos(a) * L) / 2, (Math.sin(a) * L) / 2, -depth * 0.42, 0, 0, a);
    }
    if (o.rgb) {
      const rm = own('#111', { emissive: '#ff4d8d', emissiveIntensity: 4, roughness: 0.3 }); res.rgb.push(rm);
      add(group, new THREE.TorusGeometry(R * 1.035, R * 0.04, 8, 48), rm, 0, 0, depth * 0.42);
    }
  }
  return res;
}
