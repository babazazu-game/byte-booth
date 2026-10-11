/**
 * Проверка посадки (только локально: ?debug=1&shot=sweep). Перебирает все
 * сборки, которые разрешает compat.canInstall, строит их 3D-модель и ищет
 * детали, вошедшие друг в друга или в корпус (вентиляторы, кожух БП, стенки).
 * Замер — по вершинам в осях корпуса (с копиями InstancedMesh). Итог — в
 * window.__sweep и в текст на странице.
 */
import * as THREE from 'three';
import { PcRig } from './render/models/pc.ts';
import { CASES, MBS, CPUS, COOLERS, RAMS, SSDS, GPUS, PSUS, part } from './logic/parts.ts';
import { canInstall, type Build } from './logic/compat.ts';

type Box = { mn: THREE.Vector3; mx: THREE.Vector3 };
const TOL = 0.0015; // перекрытие меньше 1,5 мм — касание, не ошибка

function boxOf(o: THREE.Object3D, inv: THREE.Matrix4): Box | null {
  const mn = new THREE.Vector3(Infinity, Infinity, Infinity), mx = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const v = new THREE.Vector3(), im = new THREE.Matrix4(), mw = new THREE.Matrix4();
  o.updateWorldMatrix(true, true);
  o.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (!mesh.isMesh || m.userData.zone || !visibleChain(m)) return;
    const pos = mesh.geometry.attributes.position; if (!pos) return;
    const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh) : null;
    const n = inst ? inst.count : 1;
    for (let k = 0; k < n; k++) {
      mw.copy(mesh.matrixWorld);
      if (inst) { inst.getMatrixAt(k, im); mw.multiply(im); }
      mw.premultiply(inv);
      for (let i = 0; i < pos.count; i += inst ? 2 : 1) { v.fromBufferAttribute(pos, i).applyMatrix4(mw); mn.min(v); mx.max(v); }
    }
  });
  return mn.x === Infinity ? null : { mn, mx };
}
function visibleChain(o: THREE.Object3D): boolean { for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false; return true; }
/** Глубина взаимного проникновения (минимум по осям), 0 — не пересекаются. */
function depth(a: Box, b: Box): number {
  const d = Math.min(a.mx.x - b.mn.x, b.mx.x - a.mn.x, a.mx.y - b.mn.y, b.mx.y - a.mn.y, a.mx.z - b.mn.z, b.mx.z - a.mn.z);
  return d > 0 ? d : 0;
}

/** Точная проверка пары: глубина по самым «плотным» элементам (каждый меш отдельно). */
export function leafDepth(rig: PcRig, a: THREE.Object3D, b: THREE.Object3D): { d: number; ma: string; mb: string } {
  rig.group.updateWorldMatrix(true, true); const inv = new THREE.Matrix4().copy(rig.group.matrixWorld).invert();
  const leaves = (o: THREE.Object3D) => { const out: { box: Box; m: THREE.Object3D }[] = []; o.traverse((m) => { if ((m as THREE.Mesh).isMesh && !m.userData.zone && visibleChain(m) && !(m as THREE.Mesh).geometry.type.startsWith('Plane')) { const bx = boxOf(m, inv); if (bx) out.push({ box: bx, m }); } }); return out; };
  const A = leaves(a), B = leaves(b); let best = { d: 0, ma: '', mb: '' };
  const nm = (m: THREE.Object3D) => `${(m as THREE.Mesh).geometry.type}:${((m as THREE.Mesh).material as THREE.MeshStandardMaterial).color?.getHexString?.()}`;
  for (const x of A) for (const y of B) { const d = depth(x.box, y.box); if (d > best.d) best = { d, ma: nm(x.m), mb: nm(y.m) }; }
  return best;
}

export async function runSweep(onLine: (s: string) => void): Promise<string[]> {
  const rig = new PcRig();
  const inv = new THREE.Matrix4();
  const R = rig as unknown as { content: Record<string, { obj: THREE.Object3D } | undefined>; gpu2: { group: THREE.Object3D } | null; coverH: number };
  const issues = new Map<string, string[]>();
  let n = 0;
  const check = (b: Build) => {
    rig.sync(b); n++;
    rig.group.updateWorldMatrix(true, true); inv.copy(rig.group.matrixWorld).invert();
    const W = rig.W, H = rig.H, D = rig.D;
    const parts: Record<string, Box | null> = {};
    for (const k of ['cooler', 'ram', 'ssd', 'gpu', 'psu', 'cpu']) { const o = R.content[k]?.obj; parts[k] = o ? boxOf(o, inv) : null; }
    parts.gpu2 = R.gpu2 ? boxOf(R.gpu2.group, inv) : null;
    const obst: Record<string, Box | null> = {};
    rig.fans.forEach((f, i) => { obst[i === rig.fans.length - 1 ? 'rearFan' : 'frontFan' + i] = boxOf(f.group, inv); });
    const ch = R.coverH, coverD = D - 0.25;
    obst.psuCover = { mn: new THREE.Vector3(-W / 2 + 0.006, -H / 2 + 0.01, -D / 2 + 0.01), mx: new THREE.Vector3(W / 2 - 0.006, -H / 2 + 0.01 + ch, -D / 2 + 0.01 + coverD) };
    const tag = `${b.case} ${b.mb} ${b.cooler} ${b.gpu}${(b.gpuN ?? 1) > 1 ? '×2' : ''} ${b.psu}`;
    const hit = (what: string, d: number) => { const key = what; const arr = issues.get(key) ?? []; arr.push(`${tag} (${(d * 1000).toFixed(1)} мм)`); issues.set(key, arr); };
    const pairs: [string, string][] = [['cooler', 'ram'], ['cooler', 'gpu'], ['gpu', 'psu'], ['gpu', 'ram'], ['gpu2', 'psu'], ['gpu2', 'gpu'], ['cooler', 'psu'], ['ram', 'psu']];
    const objOf = (k: string) => (k === 'gpu2' ? R.gpu2?.group : R.content[k]?.obj) ?? null;
    for (const [a, c] of pairs) { const A = parts[a], C = parts[c]; if (A && C && depth(A, C) > TOL) { const r = leafDepth(rig, objOf(a)!, objOf(c)!); if (r.d > TOL) hit(`${a}↔${c} [${r.ma} / ${r.mb}]`, r.d); } }
    for (const a of ['cooler', 'gpu', 'gpu2', 'ram', 'psu']) {
      const A = parts[a]; if (!A) continue;
      for (const [o, Bx] of Object.entries(obst)) {
        if (!Bx || (a === 'psu' && o === 'psuCover')) continue;
        if (depth(A, Bx) <= TOL) continue;
        const fo = o === 'psuCover' ? null : rig.fans[o === 'rearFan' ? rig.fans.length - 1 : Number(o.slice(8))]?.group;
        const r = fo ? leafDepth(rig, objOf(a)!, fo) : { d: depth(A, Bx), ma: '', mb: '' };
        if (r.d > TOL) hit(`${a}↔${o.replace(/\d+$/, '')} [${r.ma} / ${r.mb}]`, r.d);
      }
      // стенки: боковая панель (x), крыша/дно (y), перед (z); зад не проверяем — туда выходят планки
      const out = Math.max(A.mx.x - (W / 2 - 0.002), (-W / 2 + 0.006) - A.mn.x, A.mx.y - (H / 2 - 0.008), (-H / 2 + 0.01) - A.mn.y, (-D / 2 + 0.004) - A.mn.z);
      if (out > TOL) hit(`${a}↔стенка`, out);
    }
  };
  const fit = (b: Build, id: string) => canInstall(b, id).ok;
  for (const c of CASES) for (const m of MBS) {
    const b0: Build = { case: c.id };
    if (!fit(b0, m.id)) continue;
    b0.mb = m.id;
    const cpu = CPUS.find((x) => fit(b0, x.id)); if (!cpu) continue;
    b0.cpu = cpu.id; b0.paste = true;
    const rams = RAMS.filter((r) => fit(b0, r.id));
    const ram = rams.find((r) => r.rgb) ?? rams[0]; if (!ram) continue;
    b0.ram = ram.id; b0.ramN = m.slots; b0.ssd = SSDS[0].id;
    const coolers = COOLERS.filter((x) => fit(b0, x.id));
    const gpus = GPUS.filter((x) => fit(b0, x.id));
    const psus = PSUS.filter((x) => fit(b0, x.id));
    const bigPsu = psus[psus.length - 1]?.id;
    for (const cl of coolers) for (const gp of gpus) check({ ...b0, cooler: cl.id, gpu: gp.id, psu: bigPsu });
    // каждый БП с самой толстой и длинной картой
    const fat = [...gpus].sort((x, y) => y.tdp - x.tdp || y.len - x.len)[0];
    for (const ps of psus) if (fat) check({ ...b0, cooler: coolers[0]?.id, gpu: fat.id, psu: ps.id });
    // пара видеокарт
    for (const gp of gpus) { const b1: Build = { ...b0, cooler: coolers[0]?.id, gpu: gp.id, psu: bigPsu }; if (fit(b1, gp.id)) check({ ...b1, gpuN: 2 }); }
    onLine(`${c.id} / ${m.id}: проверено ${n}`);
    await new Promise((r) => setTimeout(r, 0));
  }
  const out = [`Сборок проверено: ${n}`];
  for (const [k, arr] of issues) { out.push(`■ ${k}: ${arr.length}`); for (const s of arr.slice(0, 6)) out.push('   ' + s); }
  if (issues.size === 0) out.push('Пересечений нет');
  void part;
  return out;
}
