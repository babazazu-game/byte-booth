/**
 * Служебные сцены для скриншотов (только локально: ?shot=<сцена>).
 * Ставят игру в нужное состояние, ничего не сохраняя, — чтобы снимать экраны
 * безголовым браузером на разных размерах (телефон, планшет) и отдавать
 * на разбор критику. В сборку для игроков не влияет: вызывается только с
 * localhost вместе с отладкой.
 */
import type { App } from './game/app.ts';
import type * as T3 from 'three';
import * as S from './logic/state.ts';
import { solve } from './logic/orders.ts';
import { part } from './logic/parts.ts';

export async function runShot(app: App, scene: string): Promise<void> {
  await runScene(app, scene);
  const q = new URLSearchParams(location.search);
  // ?up=sign:2,decor:2 — улучшения; ?cam=x,y,z,tx,ty,tz — свой ракурс; ?noui=1 — без интерфейса
  if (q.get('up') && app.state) { for (const kv of q.get('up')!.split(',')) { const [k, v] = kv.split(':'); (app.state.up as Record<string, number>)[k] = Number(v); } app.applyUpgrades(); }
  const cam = q.get('cam')?.split(',').map(Number);
  if (cam?.length === 6) {
    const v = app.views as unknown as { update: (...a: unknown[]) => void }; const ou = v.update.bind(v);
    v.update = (...a: unknown[]) => { ou(...a); const c = app.engine.camera; c.position.set(cam[0], cam[1], cam[2]); c.lookAt(cam[3], cam[4], cam[5]); };
    if (app.director.person) app.director.person.root.visible = q.get('person') === '1';
  }
  if (q.get('noui')) document.getElementById('ui')!.style.display = 'none';
}

async function runScene(app: App, scene: string): Promise<void> {
  app.persist = () => {};
  app.saveSettings = () => {};
  if (scene === 'menu') return;
  if (scene === 'lineup') {
    // витрина деталей одной категории: ?shot=lineup&cat=mb|psu|gpu|cooler|ram|case
    const THREE = await import('three');
    const M = await import('./render/debugModels.ts');
    const cat = new URLSearchParams(location.search).get('cat') ?? 'mb';
    const sc = new THREE.Scene(); sc.background = new THREE.Color('#d9dde3');
    sc.environment = (app.engine as unknown as { env: T3.Texture }).env; sc.environmentIntensity = 0.5;
    sc.add(new THREE.HemisphereLight('#ffffff', '#8a8f99', 1.6));
    const sun = new THREE.DirectionalLight('#fff', 2.4); sun.position.set(1, 2, 3); sc.add(sun);
    const list: { obj: T3.Object3D; name: string }[] = [];
    const L = M as unknown as Record<string, unknown>;
    const parts = ({ mb: L.MBS, psu: L.PSUS, gpu: L.GPUS, cooler: L.COOLERS, ram: L.RAMS, case: L.CASES } as Record<string, { id: string; brand: string; name: string }[]>)[cat];
    for (const p of parts) {
      let o: T3.Object3D;
      if (cat === 'mb') o = M.buildBoard(p as never).group;
      else if (cat === 'psu') { o = M.buildPSU(p as never); o.rotation.y = 0.7; o.rotation.x = new URLSearchParams(location.search).get('under') ? -0.7 : 0.35; }
      else if (cat === 'gpu') { o = M.buildGPU(p as never).group; o.rotation.x = 0.5; }
      else if (cat === 'cooler') { o = M.buildCooler(p as never).group; o.rotation.x = 0.3; o.rotation.y = 0.5; }
      else if (cat === 'ram') { o = M.buildRAM(p as never, [0]); o.rotation.y = -1.25; o.rotation.x = 0.15; }
      else { const r = new M.PcRig(); r.sync({ case: p.id, panel: false } as never); r.update(0, 0, false); o = r.group; o.rotation.y = -0.6; }
      list.push({ obj: o, name: p.brand + ' ' + p.name });
    }
    const n = list.length, cols = Math.ceil(Math.sqrt(n * 1.6)), rows = Math.ceil(n / cols);
    let size = 0;
    for (const { obj } of list) { const b = new THREE.Box3().setFromObject(obj); const v = b.getSize(new THREE.Vector3()); size = Math.max(size, v.x, v.y); }
    const step = size * 1.25;
    list.forEach(({ obj }, i) => {
      const b = new THREE.Box3().setFromObject(obj); const c = b.getCenter(new THREE.Vector3());
      const g = new THREE.Group(); obj.position.sub(c); g.add(obj);
      g.position.set(((i % cols) - (cols - 1) / 2) * step, (-(Math.floor(i / cols)) + (rows - 1) / 2) * step, 0); sc.add(g);
    });
    const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.01, 50);
    const span = Math.max(cols * step / (innerWidth / innerHeight), rows * step) * 1.1;
    cam.position.set(0, 0, span / 2 / Math.tan((15 * Math.PI) / 180)); cam.lookAt(0, 0, 0);
    app.engine.render = () => app.engine.renderer.render(sc, cam);
    document.getElementById('ui')!.style.display = 'none';
    const lab = document.createElement('div'); lab.style.cssText = 'position:fixed;left:8px;bottom:8px;font:12px monospace;color:#223;z-index:99;background:#fff9;padding:4px';
    lab.textContent = list.map((x, i) => i + 1 + '. ' + x.name).join('  ·  '); document.body.append(lab);
    return;
  }
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
  if (scene === 'clean') {
    // заказ на чистку: ПК клиента с пылью на верстаке, панель снята
    S.callCustomer(s, base, { kind: 'clean' }); const oc = s.pending!; S.acceptPending(s); S.startBench(s, oc.id);
    if (s.bench && oc.build.panel !== false) S.togglePanel(s);
    app.bench.sync(false); app.go('bench');
    for (let i = 0; i < 40; i++) app.debugStep(0.05);
    app.bench.refresh();
    return;
  }
  const o = order(); S.acceptPending(s);
  const sol = solve(o.req, S.level(s), (id) => S.buyPrice(s, id))!.build;
  // ?parts=mb:x870e,cpu:r7-9800x3d — подменить детали (проверка посадки на разных платах)
  for (const kv of (new URLSearchParams(location.search).get('parts') ?? '').split(',').filter(Boolean)) { const [k, v] = kv.split(':'); (sol as Record<string, string>)[k] = v; }
  for (const k of ['case', 'mb', 'cpu', 'cooler', 'ssd', 'gpu', 'psu'] as const) S.buy(s, sol[k]!, 1);
  S.buy(s, sol.ram!, 2);
  if (scene === 'shop' || scene === 'stock' || scene === 'upgrades') {
    app.go('pc');
    app.site.tab = scene === 'shop' ? 'shop' : scene === 'stock' ? 'stock' : 'upgrades'; app.site.render();
    for (let i = 0; i < 60; i++) app.debugStep(0.05);
    return;
  }
  if (scene === 'shelf') { app.go('shelf'); for (let i = 0; i < 40; i++) app.debugStep(0.05); return; }
  S.startBench(s, o.id);
  const ins = (c: string) => { const want = (sol as Record<string, string | undefined>)[c]; const it = s.inv.find((i) => i.id === want) ?? s.inv.find((i) => part(i.id).cat === c); if (it) S.install(s, { uid: it.uid }); };
  ins('case'); ins('psu'); ins('mb');
  if (scene === 'bench2' || scene === 'bench3') { ins('cpu'); S.applyPaste(s); ins('cooler'); ins('ram'); ins('ssd'); ins('gpu'); }
  // bench3: собранный ПК целиком — вторая планка, кабели, панель снята (проверка пересечений)
  if (scene === 'bench3') { ins('ram'); for (const k of ['cab24', 'cab8', 'cabGpu'] as const) S.toggleCable(s, k); }
  app.bench.sync(false); app.go('bench');
  for (let i = 0; i < 40; i++) app.debugStep(0.05);
  app.bench.refresh();
  if (scene === 'puzzle') {
    const { openCablePuzzle } = await import('./ui/cablePuzzle.ts');
    openCablePuzzle(Number(new URLSearchParams(location.search).get('seed') ?? 7), () => {}, 40);
  }
}
