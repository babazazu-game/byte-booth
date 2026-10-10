import type { App } from '../game/app.ts';
import type { Order } from '../logic/orders.ts';
import { REP_XP } from '../logic/orders.ts';
import { part, CATS, specLine } from '../logic/parts.ts';
import { g as G, gameScore, workScore, ramTotal, powerDraw, temps } from '../logic/compat.ts';
import { GOLD, RELIABLE_PSU, RELIABLE_TEMP } from '../logic/orders.ts';
import * as S from '../logic/state.ts';
import { t, money, lang } from '../i18n.ts';
import { h, btn, icon, thumb, confirmBox, modal } from './dom.ts';
import { sound } from '../audio/audio.ts';
import type { Zone } from '../render/views.ts';

/**
 * Игровой HUD: верхняя строка, карточки заказов, навигация по зонам,
 * действия у окошка, баннер обучения и список склада.
 */
/** Куда вести игрока на каждом шаге обучения. */
const TUT_ZONE: Record<number, Zone> = { 2: 'pc', 3: 'pc', 4: 'bench', 5: 'bench', 6: 'window' };

export class Hud {
  readonly el: HTMLElement;
  private top: HTMLElement;
  private orders: HTMLElement;
  private nav: HTMLElement;
  private actions: HTMLElement;
  private tut: HTMLElement;
  private stock: HTMLElement;
  private expanded = new Set<number>();

  constructor(private app: App) {
    this.top = h('div', { class: 'hud-top' });
    this.orders = h('div', { class: 'hud-orders live' });
    this.nav = h('div', { class: 'nav live' });
    this.actions = h('div', { class: 'actions' });
    this.tut = h('div', { class: 'tut live hidden' });
    this.stock = h('div', { class: 'panel live hidden', style: 'right:calc(10px + var(--safe-r));top:calc(60px + var(--safe-t));bottom:calc(var(--tap) + 24px + var(--safe-b));width:min(300px,calc(100% - 20px))' });
    this.el = h('div', { class: 'hidden' }, this.top, this.orders, this.actions, this.nav, this.tut, this.stock);
    app.uiRoot.append(this.el);
  }

  show(on: boolean): void { this.el.classList.toggle('hidden', !on); }

  render(): void {
    const s = this.app.state;
    if (!s) return;
    const lv = S.level(s);
    const cur = REP_XP[lv] ?? 0, next = REP_XP[lv + 1] ?? cur + 1;
    const pct = Math.max(0, Math.min(100, ((s.xp - cur) / (next - cur)) * 100));
    this.top.innerHTML = '';
    this.top.append(
      h('div', { class: 'chip cash live ' + (s.cash < 0 ? 'neg' : '') }, money(s.cash)),
      h('div', { class: 'chip' }, t('hud.day', { n: s.day }), h('span', { class: 'sub' }, t('hud.visits', { n: s.visitsToday, max: S.visitsMax(s) }))),
      // репутация — с числами до следующего уровня; нажатие открывает объяснение
      (() => { const el = h('button', { class: 'chip rep live', 'aria-label': t('rep.title') }, h('span', {}, '★ ' + t('hud.rep', { n: lv })), h('div', { class: 'repbar' }, h('i', { style: `width:${pct}%` })), h('span', { class: 'sub repn' }, REP_XP[lv + 1] ? `${s.xp - cur}/${next - cur}` : 'MAX')); el.addEventListener('click', () => this.repInfo()); return el; })(),
      h('div', { class: 'spacer' }),
      btn([icon('gear')], () => this.app.pause(), 'small', { 'aria-label': t('menu.pause') }),
    );
    // карточки заказов
    this.orders.innerHTML = '';
    const act = S.activeOrders(s);
    for (const o of act) this.orders.append(this.orderCard(o, this.expanded.has(o.id)));
    // Телефон: у окна карточки наезжали на реплику клиента, на верстаке — друг
    // на друга. По этим меткам CSS прячет лишнее только на маленьком экране.
    this.orders.dataset.zone = this.app.views.zone;
    this.orders.classList.toggle('talk', this.app.views.zone === 'window' && !this.app.director.free);
    // навигация
    this.nav.innerHTML = '';
    const zones: [Zone, string][] = [['window', 'window'], ['bench', 'bench'], ['pc', 'pc'], ['shelf', 'shelf']];
    this.nav.append(btnNav(icon('left'), '', () => this.app.turn(-1), 'A'));
    zones.forEach(([z, ic], i) => {
      const b = btnNav(icon(ic), t('zone.' + z), () => this.app.go(z), String(i + 1));
      if (this.app.views.zone === z) b.classList.add('on');
      // Обучение подсвечивает, КУДА идти: игроки застревали, не найдя магазин на мониторе.
      else if (s.tutorial < 99 && this.app.settings.hints && TUT_ZONE[s.tutorial] === z) b.classList.add('pulse');
      this.nav.append(b);
    });
    this.nav.append(btnNav(icon('right'), '', () => this.app.turn(1), 'D'));
    this.renderActions();
    this.renderTutorial();
    if (this.app.views.zone === 'shelf') this.renderStock(); else this.stock.classList.add('hidden');
  }

  /** Как растёт репутация и что она открывает. */
  private repInfo(): void {
    const s = this.app.state!; const lv = S.level(s);
    const rows = [['5★', '+35'], ['4★', '+22'], ['3★', '+10'], ['2★', '0'], ['1★', '−15']].map(([k, v]) => h('div', { class: 'kv' }, h('span', {}, t('rep.order', { s: k })), h('b', {}, v)));
    const lvls = REP_XP.slice(2).map((x, i) => h('div', { class: 'kv' + (i + 2 <= lv ? ' got' : '') }, h('span', {}, t('hud.rep', { n: i + 2 })), h('b', {}, String(x))));
    modal(t('rep.title'), [h('p', {}, t('rep.text', { xp: s.xp })), ...rows, h('p', { class: 'sp' }, t('rep.extra')), h('h4', { class: 'sect' }, t('rep.levels')), ...lvls], [{ label: t('ok'), cls: 'primary' }], { dismissable: true });
  }

  private renderActions(): void {
    const s = this.app.state!;
    this.actions.innerHTML = '';
    if (this.app.views.zone !== 'window' || this.app.dialogOpen) return;
    const d = this.app.director;
    if (d.free) {
      const ready = s.orders.filter((o) => o.state === 'ready');
      for (const o of ready) this.actions.append(btn([icon('box'), t('hud.deliver', { name: this.app.custName(o) })], () => this.app.callBack(o.id), 'teal live'));
      if (s.visitsToday < S.visitsMax(s)) this.actions.append(btn([h('span', { class: 'key' }, '␣'), icon('bell'), t('hud.callNext')], () => this.app.callNext(), 'primary live' + (s.tutorial === 0 ? ' pulse' : '')));
      else this.actions.append(h('div', { class: 'chip' }, t('hud.dayDone')));
      this.actions.append(btn([icon('moon'), t('hud.closeDay')], () => this.app.closeDay(), 'dark live' + (s.visitsToday >= S.visitsMax(s) && !ready.length ? ' pulse' : '')));
    }
  }

  private renderTutorial(): void {
    const s = this.app.state!;
    const step = s.tutorial;
    // На верстаке у игрока своя строка-подсказка, баннер там только мешал бы лотку деталей.
    const show = this.app.settings.hints && step < 99 && !this.app.dialogOpen && this.app.views.zone !== 'bench';
    this.tut.classList.toggle('hidden', !show);
    this.tut.classList.toggle('low', this.app.views.zone === 'pc' || this.app.views.zone === 'bench');
    if (!show) return;
    this.tut.innerHTML = '';
    this.tut.append(h('span', {}, t('tut.' + step)));
    const skip = h('button', { class: 'x live' }, t('tut.skip'));
    skip.addEventListener('click', () => { sound.click(); s.tutorial = 99; this.app.persist(); this.render(); });
    this.tut.append(skip);
  }

  /** Требования заказа с отметками «выполнено» по текущей сборке. */
  reqLines(o: Order): { text: string; ok?: boolean; main?: boolean }[] {
    const b = o.build, r = o.req;
    const out: { text: string; ok?: boolean; main?: boolean }[] = [];
    const has = !!(b.case || o.kind !== 'build');
    if (o.kind === 'clean') {
      out.push({ text: t('ord.req.clean.dust'), ok: (b.dust ?? 0) <= 0.12 });
      out.push({ text: t('ord.req.clean.paste'), ok: !!b.paste && !b.oldPaste });
      if (o.orig?.gpuOldPaste) out.push({ text: t('ord.req.clean.gpu'), ok: !b.gpuOldPaste });
      return out;
    }
    if (r.upCat) out.push({ text: t('ord.req.up.' + r.upCat), ok: !!b[r.upCat as 'gpu'] && b[r.upCat as 'gpu'] !== o.orig?.[r.upCat as 'gpu'] });
    if (r.score) out.push({ text: t('ord.req.score', { n: r.score }), ok: has && b.cpu && b.gpu ? gameScore(b) >= r.score : undefined });
    if (r.work) out.push({ text: t('ord.req.work', { n: r.work }), ok: has && b.cpu ? workScore(b) >= r.work : undefined });
    if (r.ram) out.push({ text: t('ord.req.ram', { n: r.ram }), ok: b.ram ? ramTotal(b) >= r.ram : undefined });
    if (r.ssd) out.push({ text: t('ord.req.ssd', { n: r.ssd >= 1000 ? r.ssd / 1000 + 'TB' : r.ssd + 'GB' }), ok: b.ssd ? G.ssd(b)!.gb >= r.ssd : undefined });
    if (r.itx) out.push({ text: t('ord.req.itx'), ok: b.case ? G.case(b)!.size === 'mini' : undefined });
    if (r.white) out.push({ text: t('ord.req.white'), ok: b.case ? G.case(b)!.color === 'white' : undefined });
    if (r.rgb) out.push({ text: t('ord.req.rgb'), ok: (b.ram && G.ram(b)!.rgb) || (b.case && G.case(b)!.rgb) ? true : b.ram && b.case ? false : undefined });
    if (r.silent) out.push({ text: t('ord.req.silent'), ok: b.cooler && b.cpu ? G.cooler(b)!.cap >= G.cpu(b)!.tdp * 1.6 : undefined });
    if (r.vendor) out.push({ text: t('ord.req.vendor', { v: r.vendor === 'amd' ? 'AMD' : 'Intel' }), ok: b.cpu ? G.cpu(b)!.vendor === r.vendor : undefined });
    if (r.reliable) {
      const psu = G.psu(b);
      out.push({ text: t('ord.req.psuTier'), ok: psu ? GOLD.includes(psu.tier) : undefined });
      out.push({ text: t('ord.req.psuMargin'), ok: psu && b.cpu && b.gpu ? psu.watt >= powerDraw(b) * RELIABLE_PSU : undefined });
      out.push({ text: t('ord.req.cool', { n: RELIABLE_TEMP }), ok: b.cpu && b.cooler && b.paste ? temps(b).cpu <= RELIABLE_TEMP : undefined });
    }
    if (o.brought?.length) out.push({ text: t('ord.req.brought', { list: [...new Set(o.brought)].map((id) => part(id).name).join(', ') }) });
    // главное пожелание помечаем звездой
    const MK: Record<string, string[]> = { white: ['ord.req.white'], rgb: ['ord.req.rgb'], silent: ['ord.req.silent'], vendor: ['ord.req.vendor'], reliable: ['ord.req.psuTier', 'ord.req.psuMargin', 'ord.req.cool'], score: ['ord.req.score'] };
    if (r.main) for (const l of out) if (MK[r.main].some((k) => l.text === t(k, { n: k === 'ord.req.cool' ? RELIABLE_TEMP : r.score ?? 0, v: r.vendor === 'amd' ? 'AMD' : 'Intel' }))) l.main = true;
    return out;
  }

  orderCard(o: Order, open: boolean): HTMLElement {
    const s = this.app.state!;
    const st = o.state === 'ready' ? t('ord.ready') : o.state === 'bench' ? t('ord.onBench') : t('ord.day', { n: o.day });
    const card = h('div', { class: `ocard ${o.state}` },
      h('div', { class: 'h' }, h('span', {}, `${o.blogger ? '🎥 ' : ''}${o.trait ? { hurry: '⏱ ', grumpy: '😤 ', fickle: '📞 ' }[o.trait] : ''}${t('ord.' + o.kind)} · ${this.app.custName(o)}`), h('span', {}, money(o.pay + o.haggle))),
      h('div', { class: 'm' }, `${t('preset.' + o.req.preset)} · ${st}${o.rework ? ' · ⟲ ' + t('ord.rework') : ''}`));
    if (open) {
      const ul = h('ul');
      for (const l of this.reqLines(o)) ul.append(h('li', { class: (l.ok === true ? 'ok' : l.ok === false ? 'no' : '') + (l.main ? ' main' : '') }, (l.ok === true ? '✓ ' : l.ok === false ? '✗ ' : '• ') + l.text + (l.main ? ' ★' : '')));
      card.append(ul);
      if (o.trait) card.append(h('div', { class: 'trait' }, t('trait.hint.' + o.trait)));
      const row = h('div', { style: 'display:flex;gap:6px;margin-top:6px;flex-wrap:wrap' });
      if (o.state === 'active' && s.bench === null) row.append(btn(t('ord.toBench'), () => { const e = S.startBench(s, o.id); if (!e) { this.app.persist(); this.app.go('bench'); this.app.bench.sync(false); this.app.refresh(); this.app.tutorialCheck(); } }, 'primary small'));
      if (o.state !== 'ready') row.append(btn(t('ord.cancel'), () => confirmBox(t('ord.cancelConfirm'), t('ord.cancel'), () => { S.cancelOrder(s, o.id); this.app.persist(); this.app.bench.sync(false); this.app.refresh(); }), 'small ghost'));
      card.append(row);
    }
    card.addEventListener('click', () => { sound.paper(); if (this.expanded.has(o.id)) this.expanded.delete(o.id); else this.expanded.add(o.id); this.render(); this.app.site.render(); });
    return card;
  }

  private renderStock(): void {
    const s = this.app.state!;
    this.stock.innerHTML = '';
    const body = h('div', { class: 'pb' });
    if (!s.inv.length) body.append(h('p', {}, t('site.empty')));
    const sorted = s.inv.slice().sort((a, b) => CATS.indexOf(part(a.id).cat) - CATS.indexOf(part(b.id).cat));
    for (const it of sorted) {
      const p = part(it.id);
      body.append(h('div', { class: 'row', style: 'grid-template-columns:56px 1fr' }, h('img', { src: thumb(it.id), alt: '', style: 'width:56px;height:42px' }), h('div', {}, h('div', { class: 'nm' }, `${p.brand} ${p.name}`), h('div', { class: 'sp' }, specLine(p, lang() === 'ru') + (it.owner !== undefined ? ' · ' + t('own.tag', { name: this.app.bench.ownerName(it.owner) }) : it.used ? ' · ' + t('site.used') : '') + (it.fakeKnown ? ' · ' + t('site.fake') : '') + (it.broken ? ' · ' + t('site.broken') : '')))));
    }
    this.stock.append(h('div', { class: 'ph' }, h('h3', {}, t('site.capacity', { n: s.inv.length, max: S.capacity(s) })), h('span', { class: 'chip' }, t('hud.paste', { n: s.pasteUses })), btn([icon('pc')], () => { this.app.go('pc'); this.app.site.tab = 'stock'; this.app.site.render(); }, 'small')), body);
    this.stock.classList.remove('hidden');
  }

  setActionsVisible(on: boolean): void { this.actions.classList.toggle('hidden', !on); }
}

function btnNav(ic: SVGSVGElement, label: string, fn: () => void, key: string): HTMLButtonElement {
  // Подпись в углу — настоящая горячая клавиша зоны, как легенда на кейкапе.
  const b = h('button', { class: 'live', 'aria-label': label || key }, h('span', { class: 'key' }, key), ic, label ? h('span', { class: 'lbl' }, label) : null);
  b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
  return b;
}
