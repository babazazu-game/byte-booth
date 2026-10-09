// Прогон логики без рендера: решатель, бюджеты, рынок. Запуск: npm run sim
import { solve, makeOrder, PRESETS, evaluate } from '../src/logic/orders.ts';
import { part, fullName } from '../src/logic/parts.ts';
import { Rng } from '../src/logic/rng.ts';
import { newMarket, nextDay, priceOf } from '../src/logic/market.ts';
import { runTest } from '../src/logic/compat.ts';

const base = (id: string) => part(id).price;
for (const rep of [1, 3, 5, 7]) {
  console.log(`\n=== rep ${rep}`);
  for (const p of Object.values(PRESETS)) {
    const t0 = performance.now();
    const s = solve({ preset: p.id, score: p.score, work: p.work, ram: p.ram, ssd: p.ssd, itx: p.itx }, rep, base);
    const ms = (performance.now() - t0).toFixed(1);
    if (!s) { console.log(p.id.padEnd(8), 'НЕТ РЕШЕНИЯ', ms + 'ms'); continue; }
    const t = runTest({ ...s.build, paste: true, cab24: true, cab8: true, cabGpu: true, panel: true });
    console.log(p.id.padEnd(8), `$${s.cost}`.padEnd(7), t.stage, `score ${t.score} work ${t.work} cpu ${t.temps.cpu}°`, ms + 'ms', '|', [s.build.cpu, s.build.gpu, s.build.case].map((i) => fullName(part(i!))).join(' + '));
  }
}
const rng = new Rng(42);
for (let i = 0; i < 12; i++) {
  const o = makeOrder(rng, i, 3, 3, base);
  const ev = o.kind === 'build' ? null : evaluate(o, o.build, 1);
  console.log(o.kind.padEnd(8), o.cust.arch.padEnd(9), o.req.preset.padEnd(8), `$${o.pay}`, JSON.stringify(o.req), ev ? `raw stars ${ev.stars}` : '');
}
const m = newMarket(rng);
const line: string[] = [];
for (let d = 0; d < 30; d++) { nextDay(m, rng); line.push(String(priceOf(m, 'rtx5070ti'))); }
console.log('\nRTX 5070 Ti 30 дней:', line.join(' '));
console.log('новости:', m.news.slice(-10).map((n) => `${n.day}:${n.key}`).join(', '));
