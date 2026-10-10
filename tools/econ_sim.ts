/**
 * Симуляция экономики: бот играет N дней по настоящим правилам (src/logic).
 * Собирает всё на 5 звёзд по самой дешёвой подходящей сборке, берёт заказ,
 * только если хватает денег на детали, покупает улучшения, когда в кассе
 * вдвое больше их цены. Сборка: npx esbuild tools/econ_sim.ts --bundle --platform=node --outfile=… && node …
 */
import * as S from '../src/logic/state.ts';
import { solve, evaluate } from '../src/logic/orders.ts';
import { part, ALL } from '../src/logic/parts.ts';
import { canInstall } from '../src/logic/compat.ts';

const DAYS = Number(process.argv[2] ?? 30);
const seeds = [11, 222, 3333];
const UPS: S.UpId[] = ['coffee', 'sign', 'slots', 'wholesale', 'shelf'];
for (const seed of seeds) {
  const s = S.newGame(seed); s.tutorial = 99;
  const base = (id: string) => part(id).price;
  const log: string[] = [];
  let declined = 0, done = 0, broke = 0;
  for (let d = 0; d < DAYS; d++) {
    while (!S.callCustomer(s, base)) {
      const o = s.pending!;
      const price = (id: string) => S.buyPrice(s, id);
      let cost = Infinity; let build: typeof o.build | null = null;
      if (o.kind === 'build') {
        const sol = solve(o.req, S.level(s), price);
        if (sol) { cost = sol.cost; build = { ...sol.build, paste: true, cab24: true, cab8: true, cabGpu: true, panel: true }; }
      } else if (o.kind === 'clean') {
        cost = s.pasteUses > 0 ? 0 : price('mx6');
        build = { ...o.build, dust: 0, paste: true, oldPaste: false, gpuOldPaste: false, panel: true };
      } else if (o.req.upCat) {
        const cat = o.req.upCat;
        const cands = ALL.filter((p) => p.cat === cat && p.rep <= S.level(s)).sort((a, b) => price(a.id) - price(b.id));
        for (const p of cands) {
          const n = cat === 'ram' ? 2 : 1;
          const b2 = { ...o.build, [cat]: undefined } as typeof o.build;
          if (!canInstall(b2, p.id).ok) continue;
          const b3 = { ...o.build, [cat]: p.id, ...(cat === 'ram' ? { ramN: n, ramSlots: undefined } : {}) } as typeof o.build;
          if (evaluate(o, b3, 1).stars >= 4) { cost = price(p.id) * n; build = b3; break; }
        }
      }
      if (!build || s.cash < cost || S.acceptPending(s)) { S.declinePending(s); declined++; continue; }
      s.cash -= cost; s.today.spent += cost;
      if (o.kind === 'clean' && cost) { s.pasteUses += 4; } else if (o.kind === 'clean') s.pasteUses--;
      o.build = build; o.state = 'ready';
      S.deliver(s, o.id); done++;
    }
    S.endDay(s); if (s.cash < 0) broke++;
    for (const u of UPS) { const pr = S.UPGRADES[u].prices[s.up[u]]; if (pr !== undefined && s.cash > pr * 2.2) S.buyUpgrade(s, u); }
    S.startNextDay(s);
    if ((d + 1) % 5 === 0) log.push(`д${d + 1}: $${s.cash} реп ${S.level(s)} аренда $${S.rent(s)} визитов ${S.visitsMax(s)}`);
  }
  console.log(`seed ${seed}: выполнено ${done}, отказ ${declined}, дней в минусе ${broke}, улучш ${JSON.stringify(s.up)}\n  ` + log.join('\n  '));
}
