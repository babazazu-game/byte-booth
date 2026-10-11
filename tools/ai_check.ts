import { solve, PRESETS } from '../src/logic/orders.ts';
import { part } from '../src/logic/parts.ts';
import { canInstall } from '../src/logic/compat.ts';
for (const rep of [6, 8, 10]) {
  const r = solve({ preset: 'ai', ram: PRESETS.ai.ram, ssd: PRESETS.ai.ssd, ai: 16 }, rep, (id) => part(id).price);
  console.log(rep, r && JSON.stringify(r.build), r?.cost);
  if (r) { const b = { ...r.build }; const one = { ...b, gpuN: 1 }; console.log('2nd gpu ok?', canInstall(one, b.gpu!).ok); }
}
