/**
 * Служебные сцены для скриншотов (только локально: ?shot=<сцена>).
 * Ставят игру в нужное состояние, ничего не сохраняя, — чтобы снимать экраны
 * безголовым браузером на разных размерах (телефон, планшет) и отдавать
 * на разбор критику. В сборку для игроков не влияет: вызывается только с
 * localhost вместе с отладкой.
 */
import type { App } from './game/app.ts';
import * as S from './logic/state.ts';
import { solve } from './logic/orders.ts';
import { part } from './logic/parts.ts';

export async function runShot(app: App, scene: string): Promise<void> {
  app.persist = () => {};
  app.saveSettings = () => {};
  if (scene === 'menu') return;
  app.play(true);
  const s = app.state!;
  s.tutorial = 99; s.cash = 9999; s.xp = 200; s.up.shelf = 2;
  const base = (id: string) => part(id).price;
  const order = () => {
    S.callCustomer(s, base, { kind: 'build', preset: 'fhd', arch: 'gamergirl' });
    return s.pending!;
  };
  if (scene === 'window') {
    const o = order();
    app.director.spawn(o.cust.look, o.cust.seed, () => (app as unknown as { offer(): void }).offer());
    for (let i = 0; i < 140; i++) app.debugStep(0.1);
    return;
  }
  if (scene === 'carry' || scene === 'carry2') {
    // клиент забирает собранный ПК: проверка, как руки держат корпус
    const o = order();
    app.director.spawn(o.cust.look, o.cust.seed, () => {});
    for (let i = 0; i < 140; i++) app.debugStep(0.1);
    const { PcRig } = await import('./render/models/pc.ts');
    const rig = new PcRig();
    const sol = solve(o.req, S.level(s), (id) => S.buyPrice(s, id))!.build;
    rig.sync({ case: sol.case, mb: sol.mb, panel: true } as never);
    rig.group.scale.setScalar(1.15); rig.group.position.set(0.5, (rig.H / 2) * 1.15, -0.16);
    app.world.counterAnchor.add(rig.group);
    const st = window.setTimeout; (window as { setTimeout: unknown }).setTimeout = () => 0;
    app.director.leaveWith(rig.group, 'smile', () => {}, rig.W * 1.15, rig.D / 2);
    (window as { setTimeout: unknown }).setTimeout = st;
    const p = (app.director as unknown as { person: { root: { rotation: { y: number } } } }).person;
    if (scene === 'carry2') p.root.rotation.y += 1.2;
    for (let i = 0; i < 40; i++) app.debugStep(0.05);
    return;
  }
  const o = order(); S.acceptPending(s);
  const sol = solve(o.req, S.level(s), (id) => S.buyPrice(s, id))!.build;
  for (const k of ['mb', 'cpu', 'cooler', 'ssd', 'gpu', 'psu'] as const) S.buy(s, sol[k]!, 1);
  S.buy(s, sol.ram!, 2);
  if (scene === 'shop' || scene === 'stock' || scene === 'upgrades') {
    app.go('pc');
    app.site.tab = scene === 'shop' ? 'shop' : scene === 'stock' ? 'stock' : 'upgrades'; app.site.render();
    for (let i = 0; i < 60; i++) app.debugStep(0.05);
    return;
  }
  if (scene === 'shelf') { app.go('shelf'); for (let i = 0; i < 40; i++) app.debugStep(0.05); return; }
  S.startBench(s, o.id);
  const ins = (c: string) => { const it = s.inv.find((i) => part(i.id).cat === c); if (it) S.install(s, { uid: it.uid }); };
  ins('case'); ins('psu'); ins('mb');
  if (scene === 'bench2') { ins('cpu'); S.applyPaste(s); ins('cooler'); ins('ram'); ins('ssd'); ins('gpu'); }
  app.bench.sync(false); app.go('bench');
  for (let i = 0; i < 40; i++) app.debugStep(0.05);
  app.bench.refresh();
  if (scene === 'puzzle') {
    const { openCablePuzzle } = await import('./ui/cablePuzzle.ts');
    openCablePuzzle(7, () => {}, 40);
  }
}
