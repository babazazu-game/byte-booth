import type { App } from '../game/app.ts';
import { ALL, CATS, part, specLine, type Cat } from '../logic/parts.ts';
import { forecast, EVENTS } from '../logic/market.ts';
import * as S from '../logic/state.ts';
import { solve } from '../logic/orders.ts';
import { canInstall } from '../logic/compat.ts';
import { t, money, lang } from '../i18n.ts';
import { h, btn, icon, thumb, toast, spark, confirmBox, modal, dragScroll } from './dom.ts';
import { sound } from '../audio/audio.ts';
import { guideBody } from './guide.ts';
import { DISTRICTS, DISTRICT_IDS, LEGEND_REP } from '../logic/districts.ts';
import * as D from '../logic/daily.ts';
import { WALLS, FIGS, POSTERS, ownedWalls, wallOf, paintWall, buyFig, buyPoster } from '../logic/collect.ts';

/**
 * PartsHub — сайт поставщика на мониторе ларька.
 *
 * Здесь вся экономика: покупка, продажа, новости, заказы, улучшения.
 * Сайт — DOM-панель поверх 3D: на телефоне «экран в экране» читать
 * невозможно, а так текст всегда нормального кегля (п. 1.8).
 */

type Tab = 'shop' | 'bonus' | 'news' | 'stock' | 'orders' | 'upgrades' | 'guide';

export class Site {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private tabsEl: HTMLElement;
  private cashEl: HTMLElement;
  /** Название магазина — обновляется при смене языка (раньше оставалось «Мегабайт» в EN). */
  private titleEl!: HTMLElement;
  tab: Tab = 'shop';
  cat: Cat | 'all' = 'all';
  private recFor: number | null = null;

  constructor(private app: App) {
    this.tabsEl = dragScroll(h('div', { class: 'tabs' }));
    this.cashEl = h('div', { class: 'chip', style: 'background:#2a3142;color:#e8eef6' });
    this.body = h('div', { class: 'pb' });
    this.el = h('div', { class: 'panel site live hidden' },
      h('div', { class: 'ph' }, this.titleEl = h('h3', {}, t('brand.shop')), this.tabsEl, this.cashEl,
        btn('✕', () => app.go('window'), 'small dark', { 'aria-label': t('site.close') })),
      this.body);
    app.uiRoot.append(this.el);
  }

  show(on: boolean): void {
    this.el.classList.toggle('hidden', !on);
    if (on) this.render();
  }

  render(): void {
    const s = this.app.state;
    if (!s || this.el.classList.contains('hidden')) return;
    this.tabsEl.innerHTML = '';
    const bonusDot = D.bonusState(s, new Date()).ready || D.shopState(s).ready ? ' ●' : '';
    const tabs: [Tab, string][] = [['shop', t('site.shop')], ['news', t('site.news') + (s.newsSeen !== s.day && s.market.news.some((n) => n.day === s.day) ? ' ●' : '')], ['stock', t('site.stock') + ` ${s.inv.length}/${S.capacity(s)}`], ['orders', t('site.orders') + ` ${S.activeOrders(s).length}`], ['upgrades', t('site.upgrades')], ['guide', '? ' + t('help.tab')], ['bonus', '🎁 ' + t('bonus.tab') + bonusDot]];
    for (const [k, label] of tabs) {
      const b = h('button', { class: 'live ' + (this.tab === k ? 'on' : '') }, label);
      b.addEventListener('click', () => { sound.tab(); this.tab = k; this.render(); });
      this.tabsEl.append(b);
    }
    this.cashEl.textContent = money(s.cash);
    this.titleEl.textContent = t('brand.shop');
    const keepScroll = this.body.scrollTop;
    this.body.innerHTML = '';
    if (this.tab === 'shop') this.renderShop();
    if (this.tab === 'bonus') this.renderBonus();
    if (this.tab === 'news') this.renderNews();
    if (this.tab === 'stock') this.renderStock();
    if (this.tab === 'orders') this.renderOrders();
    if (this.tab === 'upgrades') this.renderUpgrades();
    if (this.tab === 'guide') this.body.append(guideBody());
    this.body.scrollTop = keepScroll;
  }

  /** Рекомендации: только на старте и при включённых подсказках. */
  /** Сколько штук рекомендованной детали нужно (память — парой планок). */
  private recQty = new Map<string, number>();
  private recommended(): Set<string> {
    const s = this.app.state!;
    const out = new Set<string>();
    this.recQty.clear();
    // Подсветка «подходит к заказу» — только в обучающей сборке. Дальше игрок сам
    // сверяет сокет, тип памяти и мощность БП (для этого есть «Справка»).
    if (!this.app.settings.hints || s.tutorial >= 99) return out;
    const o = S.activeOrders(s).find((x) => x.id === this.recFor) ?? S.activeOrders(s).find((x) => x.kind === 'build' && x.state !== 'ready') ?? null;
    if (!o) return out;
    this.recFor = o.id;
    if (o.kind === 'build') {
      const sol = solve(o.req, S.level(s), (id) => S.buyPrice(s, id));
      if (sol) for (const k of ['mb', 'cpu', 'cooler', 'ram', 'ssd', 'gpu', 'psu'] as const) {
        const id = sol.build[k]!;
        // уже есть на складе такая же категория — не подсвечиваем
        if (!s.inv.some((it) => part(it.id).cat === part(id).cat) && !o.build[k]) { out.add(id); this.recQty.set(id, k === 'ram' ? sol.build.ramN ?? 1 : 1); }
      }
    }
    if (s.pasteUses <= 1) out.add('mx6');
    return out;
  }

  private renderShop(): void {
    const s = this.app.state!;
    const rec = this.recommended();
    const cats = dragScroll(h('div', { class: 'cats' }));
    // Категории «К заказу» нет: подбор деталей — работа игрока (автор), подсказки только в обучении.
    for (const c of ['all', ...CATS] as (Cat | 'all')[]) {
      const b = h('button', { class: 'live ' + (this.cat === c ? 'on' : '') }, c === 'all' ? t('site.all') : t('cat.' + c));
      b.addEventListener('click', () => { sound.tab(); this.cat = c; this.render(); });
      cats.append(b);
    }
    this.body.append(cats);
    // полоса пересоздаётся при каждом выборе — держим выбранную категорию в кадре
    const onB = cats.querySelector<HTMLElement>('button.on');
    if (onB) requestAnimationFrame(() => { cats.scrollLeft = Math.max(0, onB.offsetLeft - (cats.clientWidth - onB.offsetWidth) / 2); });
    if (this.app.settings.hints && rec.size) this.body.append(h('div', { class: 'tag teal', style: 'display:inline-block;margin-bottom:8px' }, '★ ' + t('site.fits')));
    // Обучение: явный список «что ещё купить» и кнопка «купить всё». Без него игрок
    // не понимал, что от него хотят на этом шаге, и застревал.
    const todo = [...rec].filter((id) => part(id).cat !== 'paste');
    if (s.tutorial < 99 && todo.length) {
      const q = (id: string) => this.recQty.get(id) ?? 1;
      const total = todo.reduce((n, id) => n + S.buyPrice(s, id) * q(id), 0);
      const names = todo.map((id) => t('step.' + part(id).cat) + (q(id) > 1 ? ' ×' + q(id) : '')).join(', ');
      this.body.append(h('div', { class: 'tutbuy' },
        h('div', { class: 'grow' }, t('tut.left') + ' ', h('b', {}, names)),
        btn([icon('cart'), t('tut.buyAll', { n: money(total) })], () => { for (const id of todo) if (S.buy(s, id, q(id))) break; sound.coin(); this.app.persist(); this.app.refresh(); this.app.tutorialCheck(); }, 'primary small pulse')));
    }
    if (s.tutorial >= 99 && S.activeOrders(s).some((o) => o.kind === 'build' && o.state !== 'ready')) {
      const link = h('button', { class: 'tutbuy nudge live', style: 'width:100%;border:0;cursor:pointer;text-align:left' }, h('div', { class: 'grow' }, t('help.nudge')));
      link.addEventListener('click', () => { sound.tab(); this.tab = 'guide'; this.render(); });
      this.body.append(link);
    }
    const lvl = S.level(s);
    const bench = S.benchOrder(s);
    const newsCats = todayNews(s);
    // на телефоне спецпредложения — в конце списка: они вытесняли обычные детали с первого экрана
    const phone = !!this.app.views.phone;
    const specials = () => {
    // Объявления частников (видеокарты сильно дешевле — на свой страх и риск)
    if (this.cat === 'all' || this.cat === 'gpu') (s.deals ?? []).forEach((d, i) => {
      if (d.sold) return;
      const p = part(d.id), mkt = S.buyPrice(s, d.id);
      this.body.append(h('div', { class: 'row deal' },
        h('img', { src: thumb(d.id), alt: '' }),
        h('div', {}, h('div', { class: 'nm' }, `${p.brand} ${p.name}`), h('div', { class: 'sp' }, t('deal.desc')),
          h('div', { class: 'tags' }, h('span', { class: 'tag bad' }, t('deal.tag')), h('span', { class: 'tag good' }, '−' + Math.round((1 - d.price / mkt) * 100) + '%'))),
        h('div', { class: 'price' }, h('b', {}, money(d.price)), h('s', { class: 'sp' }, money(mkt)),
          btn([icon('cart'), t('site.buy')], () => confirmBox(t('deal.confirm', { name: p.name, n: money(d.price) }), t('site.buy'), () => {
            const e = S.buyDeal(s, i); if (e) { toast(t(e), 'bad'); return; }
            sound.coin(); this.app.persist(); this.app.refresh();
          }), 'primary small'))));
    });
    // Коробки-сюрпризы
    if (this.cat === 'all') for (const id of Object.keys(S.BOXES) as S.BoxId[]) {
      const B = S.BOXES[id], locked = lvl < B.minRep;
      this.body.append(h('div', { class: 'row box ' + (locked ? 'locked' : '') },
        h('div', { class: 'boxic' }, '?'),
        h('div', {}, h('div', { class: 'nm' }, t('box.' + id)), h('div', { class: 'sp' }, t('box.desc', { n: B.n })),
          h('div', { class: 'tags' }, locked ? h('span', { class: 'tag' }, t('site.locked', { n: B.minRep })) : h('span', { class: 'tag teal' }, t('box.tag')))),
        h('div', { class: 'price' }, h('b', {}, money(B.price)),
          btn([icon('box'), t('box.open')], () => this.openBox(id), 'primary small', locked ? { disabled: true } : {}))));
    }
    };
    if (!phone) specials();
    const list = ALL.filter((p) => this.cat === 'all' || p.cat === this.cat)
      .sort((a, b) => Number(rec.has(b.id)) - Number(rec.has(a.id)) || CATS.indexOf(a.cat) - CATS.indexOf(b.cat) || a.price - b.price);
    for (const p of list) {
      const locked = p.rep > lvl;
      const price = S.buyPrice(s, p.id);
      const hist = s.market.history[p.id] ?? [];
      const week = hist.slice(-7);
      const chg = week.length > 1 ? Math.round(((week[week.length - 1] - week[0]) / week[0]) * 100) : 0;
      const tags = h('div', { class: 'tags' });
      if (rec.has(p.id)) tags.append(h('span', { class: 'tag teal' }, '★ ' + t('site.fits')));
      if (bench && p.cat !== 'paste' && bench.build.case && !locked) {
        const v = canInstall(bench.build, p.id);
        if (v.ok) tags.append(h('span', { class: 'tag good' }, '✓ ' + t('zone.bench')));
      }
      const have = s.inv.filter((i) => i.id === p.id).length;
      if (have) tags.append(h('span', { class: 'tag' }, `×${have}`));
      if (S.upVal(s, 'analytics')) {
        const f = forecast(s.market, p.cat);
        tags.append(h('span', { class: 'tag ' + (f > 1.03 ? 'bad' : f < 0.97 ? 'good' : '') }, `${t('site.forecast')} ${f > 1.03 ? '↑' : f < 0.97 ? '↓' : '→'}`));
      }
      const nw = newsCats.get(p.cat);
      if (nw && !locked) tags.append(h('span', { class: 'tag ' + (nw.includes('↑') ? 'bad' : 'good') }, '📰 ' + nw));
      if (locked) tags.append(h('span', { class: 'tag' }, t('site.locked', { n: p.rep })));
      const buyBtn = btn([icon('cart'), t('site.buy')], () => this.buy(p.id), 'primary small', locked ? { disabled: true } : {});
      this.body.append(h('div', { class: `row ${locked ? 'locked' : ''} ${rec.has(p.id) ? 'rec' : ''}` },
        h('img', { src: thumb(p.id), alt: '' }),
        h('div', {}, h('div', { class: 'nm' }, `${p.brand} ${p.name}`), h('div', { class: 'sp' }, specLine(p, lang() === 'ru')), tags),
        h('div', { class: 'price' }, h('b', {}, money(price)),
          h('div', { style: 'display:flex;align-items:center;gap:6px' }, spark(hist), h('span', { class: 'chg ' + (chg > 0 ? 'up' : chg < 0 ? 'down' : '') }, `${chg > 0 ? '+' : ''}${chg}%`)),
          buyBtn)));
    }
    if (phone) specials();
  }

  private openBox(id: S.BoxId): void {
    const s = this.app.state!;
    const res = S.openBox(s, id);
    if (typeof res === 'string') { toast(t(res), 'bad'); return; }
    sound.paper(); this.app.persist(); this.app.refresh();
    // карточки открываются по одной — маленький «момент распаковки»
    const cards = res.map((it, i) => h('div', { class: 'boxcard', style: `animation-delay:${0.25 + i * 0.45}s` },
      h('img', { src: thumb(it.id), alt: '' }), h('div', { class: 'nm' }, `${part(it.id).brand} ${part(it.id).name}`),
      h('div', { class: 'sp' }, t('cat.' + part(it.id).cat) + ' · ' + t('site.used') + ' · ' + money(S.itemSellPrice(s, it)))));
    res.forEach((_, i) => setTimeout(() => sound.coin(), 250 + i * 450));
    modal(t('box.got'), [h('div', { class: 'boxcards' }, ...cards), h('p', { class: 'sp' }, t('box.note'))], [{ label: t('ok'), cls: 'primary' }]);
  }

  private buy(id: string): void {
    const s = this.app.state!;
    const err = S.buy(s, id, 1);
    if (err) { toast(t(err), 'bad'); return; }
    sound.key(); setTimeout(() => sound.coin(), 60);
    toast(`${part(id).brand} ${part(id).name} · ${money(-S.buyPrice(s, id))}`);
    this.app.persist();
    this.app.refresh();
    this.app.tutorialCheck();
  }

  /**
   * Районы и цель игры: где стоит ларёк, куда можно переехать и сколько это
   * стоит. Прогресс к «легенде города» — галочками.
   */
  private renderDistricts(): void {
    const s = this.app.state!;
    const open = S.openDistricts(s), here = S.districtOf(s).id, lvl = S.level(s);
    this.body.append(h('h4', { class: 'sect', style: 'margin-top:0' }, t('dist.title')),
      h('p', { class: 'sp' }, t('site.goal', { n: LEGEND_REP })));
    const goal = h('div', { class: 'goalrow' },
      ...DISTRICT_IDS.map((id) => h('span', { class: 'tag ' + (open.includes(id) ? 'good' : '') }, (open.includes(id) ? '✓ ' : '○ ') + t('dist.' + id))),
      h('span', { class: 'tag ' + (lvl >= LEGEND_REP ? 'good' : '') }, (lvl >= LEGEND_REP ? '✓ ' : '○ ') + t('dist.goalRep', { n: LEGEND_REP, now: lvl })));
    this.body.append(goal);
    const grid = h('div', { class: 'dists' });
    for (const id of DISTRICT_IDS) {
      const D = DISTRICTS[id], isHere = here === id, locked = lvl < D.minRep, price = S.moveCost(s, id);
      const img = id === 'park' ? 'assets/tex/street.webp' : `assets/tex/street_${id}.webp`;
      const act = isHere ? h('span', { class: 'tag good' }, '📍 ' + t('dist.here'))
        : locked ? h('span', { class: 'tag' }, t('site.locked', { n: D.minRep }))
          : btn(t('dist.move', { n: money(price) }), () => confirmBox(t('dist.confirm', { name: t('dist.' + id), n: money(price) }), t('dist.go'), () => this.app.moveDistrict(id)), 'primary small');
      grid.append(h('div', { class: 'dist' + (isHere ? ' here' : '') + (locked ? ' locked' : '') },
        h('div', { class: 'dimg', style: `background-image:url(${img})` }),
        h('div', { class: 'nm' }, t('dist.' + id)),
        h('div', { class: 'sp' }, t('dist.' + id + '.d')),
        h('div', { class: 'sp' }, t('dist.stats', { rent: Math.round(D.rentK * 100), pay: Math.round(D.payK * 100) })),
        act));
    }
    this.body.append(grid, h('h4', { class: 'sect' }, t('site.upgrades')));
  }

  /** Ежедневный бонус, задания дня и финальная цель «Свой магазин». */
  private renderBonus(): void {
    const s = this.app.state!, now = new Date();
    const b = D.bonusState(s, now);
    const days = h('div', { class: 'bdays' }, ...[1, 2, 3, 4, 5, 6, 7].map((i) => {
      const got = b.ready ? i < b.day : i <= b.day;
      const cur = b.ready && i === b.day;
      return h('div', { class: 'bday' + (got ? ' got' : '') + (cur ? ' cur' : '') }, h('div', { class: 'n' }, t('bonus.day', { n: i })), h('b', {}, money(D.bonusFor(i))), i === 7 ? h('div', { class: 'n' }, t('bonus.paste')) : null);
    }));
    this.body.append(h('h4', { class: 'sect', style: 'margin-top:0' }, t('bonus.daily')), h('p', { class: 'sp' }, t('bonus.dailyHint')), days,
      b.ready ? btn([icon('star'), t('bonus.claim', { n: money(b.amount) })], () => { const got = D.claimBonus(s, now); if (got) { sound.cash(); toast('+' + money(got), 'good'); this.app.persist(); this.app.refresh(); } }, 'primary')
        : h('p', { class: 'sp' }, t('bonus.tomorrow')));
    // задания дня
    this.body.append(h('h4', { class: 'sect' }, t('bonus.tasks')));
    for (const tk of D.tasksToday(s, now)) {
      const pct = Math.round((tk.have / tk.need) * 100);
      this.body.append(h('div', { class: 'row task' + (tk.done ? ' done' : '') },
        h('div', { class: 'ticon' }, tk.done ? '✓' : '★'),
        h('div', {}, h('div', { class: 'nm' }, t('task.' + tk.kind, { n: tk.kind === 'earn' ? money(tk.need) : tk.need })), h('div', { class: 'repbar' }, h('i', { style: `width:${pct}%` })), h('div', { class: 'sp' }, tk.kind === 'earn' ? money(tk.have) + ' / ' + money(tk.need) : tk.have + ' / ' + tk.need)),
        h('div', { class: 'price' }, h('b', {}, '+' + money(tk.reward)), h('span', { class: 'sp' }, '+' + tk.xp + ' ' + t('bonus.xp')))));
    }
    this.app.persist();
    // финальная цель
    const sh = D.shopState(s);
    const req = (ok: boolean, txt: string) => h('div', { class: 'kv' }, h('span', {}, txt), h('b', { style: `color:${ok ? '#3f9a5a' : '#d2462f'}` }, ok ? '✓' : '✗'));
    this.body.append(h('h4', { class: 'sect' }, t('shop.goal')),
      h('div', { class: 'row goal' + (sh.owned ? ' done' : '') },
        h('div', { class: 'ticon' }, '🏬'),
        h('div', {}, h('div', { class: 'nm' }, t('shop.title')), h('div', { class: 'sp' }, t(sh.owned ? 'shop.owned' : 'shop.desc')),
          req(sh.repOk, t('shop.reqRep', { n: D.SHOP.rep, now: S.level(s) })),
          req(sh.earnedOk, t('shop.reqEarned', { n: money(D.SHOP.earned), now: money(s.totalEarned) })),
          req(sh.cashOk, t('shop.reqCash', { n: money(D.SHOP.price) }))),
        h('div', { class: 'price' }, sh.owned ? h('b', {}, '✓') : btn(t('shop.buy', { n: money(D.SHOP.price) }), () => this.app.buyShop(), 'primary', sh.ready ? {} : { disabled: true }))));
  }

  private renderNews(): void {
    const s = this.app.state!;
    const news = s.market.news.slice().reverse();
    if (!news.length) this.body.append(h('p', {}, t('site.newsEmpty')));
    // свежие отдельно сверху, старые ниже и приглушённые; новость о нашем ларьке помечена
    const row = (n: (typeof news)[number]) => h('div', { class: 'news ' + n.kind + (n.day >= s.day ? ' fresh' : ' old') },
      h('span', { class: 'd' }, t('hud.day', { n: n.day })),
      h('span', {}, n.key.startsWith('news.blog') ? h('b', { class: 'tag teal', style: 'margin-right:6px' }, t('site.newsOurs')) : null, n.day >= s.day ? h('b', { class: 'tag good', style: 'margin-right:6px' }, t('site.newsNew')) : null, newsText(n)));
    const fresh = news.filter((n) => n.day >= s.day), old = news.filter((n) => n.day < s.day);
    if (fresh.length) { this.body.append(h('h4', { class: 'newsh' }, t('site.newsToday'))); for (const n of fresh) this.body.append(row(n)); }
    if (old.length) { this.body.append(h('h4', { class: 'newsh' }, t('site.newsOld'))); for (const n of old) this.body.append(row(n)); }
    s.newsSeen = s.day;
  }

  private renderStock(): void {
    const s = this.app.state!;
    this.body.append(h('div', { class: 'chip', style: 'display:inline-flex;margin-bottom:8px' }, t('site.capacity', { n: s.inv.length, max: S.capacity(s) }), h('span', { class: 'sub' }, t('hud.paste', { n: s.pasteUses }))));
    if (!s.inv.length) this.body.append(h('p', {}, t('site.empty')));
    for (const it of s.inv.slice().sort((a, b) => CATS.indexOf(part(a.id).cat) - CATS.indexOf(part(b.id).cat))) {
      const p = part(it.id);
      const sp = S.itemSellPrice(s, it);
      const mine = it.owner === undefined;
      this.body.append(h('div', { class: 'row' },
        h('img', { src: thumb(it.id), alt: '' }),
        h('div', {}, h('div', { class: 'nm' }, `${p.brand} ${p.name}`), h('div', { class: 'sp' }, specLine(p, lang() === 'ru')), h('div', { class: 'tags' }, it.owner !== undefined ? h('span', { class: 'tag teal' }, t('own.tag', { name: this.app.bench.ownerName(it.owner) })) : h('span', { class: 'tag ' + (it.used ? '' : 'good') }, it.used ? t('site.used') : t('site.new')), it.fakeKnown ? h('span', { class: 'tag bad' }, t('site.fake')) : null, it.broken ? h('span', { class: 'tag bad' }, t('site.broken')) : null)),
        h('div', { class: 'price' }, mine ? h('b', {}, money(sp)) : null,
          // неисправная: «на запчасти» можно всегда, «починить» — с паяльной станцией
          mine ? btn(it.broken ? t('site.scrap') : t('site.sell'), () => { const e = S.sell(s, it.uid); if (e) { toast(t(e), 'bad'); return; } sound.cash(); this.app.persist(); this.app.refresh(); }, 'small') : h('span', { class: 'sp' }, t('own.noSell')),
          it.broken && mine ? (S.upVal(s, 'solder')
            ? btn(t('site.repair', { n: money(S.repairPrice(s, it)) }), () => { const e = S.repairItem(s, it.uid); if (e) { toast(t(e), 'bad'); return; } sound.screw(); toast(t('site.repaired'), 'good'); this.app.persist(); this.app.refresh(); }, 'primary small')
            : h('span', { class: 'sp' }, t('site.repairLocked'))) : null)));
    }
  }

  private renderOrders(): void {
    const s = this.app.state!;
    const list = S.activeOrders(s);
    if (!list.length) this.body.append(h('p', {}, t('site.noOrders')));
    for (const o of list) this.body.append(this.app.hud.orderCard(o, true));
  }

  private renderUpgrades(): void {
    const s = this.app.state!;
    this.renderDistricts();
    const grid = h('div', { class: 'grid2' });
    for (const id of Object.keys(S.UPGRADES) as S.UpId[]) {
      const U = S.UPGRADES[id];
      const lv = s.up[id];
      const price = U.prices[lv];
      const nextV = U.values[Math.min(lv + 1, U.values.length - 1)];
      const shownV = id === 'wholesale' ? Math.round(nextV * 100) : nextV;
      const dots = h('div', { class: 'lvl' }, ...U.prices.map((_, i) => h('i', { class: i < lv ? 'on' : '' })));
      grid.append(h('div', { class: 'upg' }, h('h4', {}, t('up.' + id)), h('div', { class: 'sp' }, t(`up.${id}.d`, { v: shownV })), dots,
        price === undefined ? h('span', { class: 'tag good' }, t('up.max')) :
          btn(t('up.buy', { n: price.toLocaleString('en-US') }), () => {
            const e = S.buyUpgrade(s, id);
            if (e) { toast(t(e), 'bad'); return; }
            sound.levelUp(); this.app.persist(); this.app.applyUpgrades(); this.app.refresh();
          }, 'primary small')));
    }
    this.body.append(grid);
    // Покупки «для души» — только через подтверждение: раньше клик по цвету сразу списывал деньги.
    const confirmBuy = (name: string, price: number, buy: () => string | null, snd: () => void) =>
      confirmBox(t('up.confirm', { name, n: price.toLocaleString('en-US') }), t('yes'), () => {
        const e = buy();
        if (e) { toast(t(e), 'bad'); return; }
        snd(); this.app.persist(); this.app.applyUpgrades(); this.app.refresh();
      });
    // Покраска стен: купленный цвет можно менять бесплатно (без подтверждения)
    const owned = ownedWalls(s), cur = wallOf(s).id;
    const pal = h('div', { class: 'paint' });
    for (const w of WALLS) {
      const has = owned.includes(w.id);
      const b = h('button', { class: 'live swatch' + (cur === w.id ? ' on' : '') },
        h('i', { style: 'background:' + w.hex }, cur === w.id ? '✓' : ''),
        h('b', {}, t('wall.' + w.id)), h('small', {}, has ? (cur === w.id ? t('paint.now') : t('paint.owned')) : '$' + w.price));
      b.addEventListener('click', () => {
        if (has) { paintWall(s, w.id); sound.paper(); this.app.persist(); this.app.applyUpgrades(); this.app.refresh(); return; }
        confirmBuy(t('wall.' + w.id), w.price, () => paintWall(s, w.id), () => sound.paper());
      });
      pal.append(b);
    }
    this.body.append(h('h4', { class: 'sect' }, t('up.paint')), h('p', { class: 'sp' }, t('up.paint.d')), pal);
    // Коллекция статуэток и постеры — одной ровной сеткой карточек
    const card = (img: string, name: string, has: boolean, price: number, onBuy: () => void) =>
      h('div', { class: 'fig' + (has ? ' own' : '') }, h('img', { src: img, alt: '' }), h('div', { class: 'nm' }, name),
        has ? h('span', { class: 'tag good' }, '✓ ' + t('fig.onStand')) : btn(t('up.buy', { n: price.toLocaleString('en-US') }), onBuy, 'primary small'));
    const figs = s.figs ?? [];
    const col = h('div', { class: 'figs' });
    for (const f of FIGS) col.append(card(this.app.figThumb(f.id), t('fig.' + f.id), figs.includes(f.id), f.price, () => confirmBuy(t('fig.' + f.id), f.price, () => buyFig(s, f.id), () => sound.coin())));
    this.body.append(h('h4', { class: 'sect' }, t('up.figs')), h('p', { class: 'sp' }, t('up.figs.d', { n: figs.length, m: FIGS.length })), col);
    const posters = s.posters ?? [];
    const pcol = h('div', { class: 'figs posters' });
    POSTERS.forEach((pp, i) => pcol.append(card('assets/tex/poster_' + i + '.webp', t('poster.' + pp.id), posters.includes(pp.id), pp.price, () => confirmBuy(t('poster.' + pp.id), pp.price, () => buyPoster(s, pp.id), () => sound.paper()))));
    this.body.append(h('h4', { class: 'sect' }, t('up.posters')), h('p', { class: 'sp' }, t('up.posters.d', { n: posters.length, m: POSTERS.length })), pcol);
  }
}

/**
 * Какие категории задеты сегодняшними новостями: значок 📰 со стрелкой у
 * деталей в магазине — новость сразу подсказывает, что делать (купить
 * сейчас или подождать). Слух помечен «?»: он может не сбыться.
 */
function todayNews(s: S.GameState): Map<string, string> {
  const out = new Map<string, string>();
  for (const n of s.market.news) {
    if (n.day !== s.day) continue;
    if ((n.key === 'news.up' || n.key === 'news.down') && typeof n.vars?.cat === 'string') out.set(n.vars.cat, n.key === 'news.up' ? '↑' : '↓');
    const m = /^news\.(\w+)\.(rumor|start)$/.exec(n.key);
    if (m) {
      const ev = EVENTS.find((e) => e.id === m[1]);
      if (ev) for (const [cat, k] of Object.entries(ev.days[0])) out.set(cat, (k! > 1 ? '↑' : '↓') + (m[2] === 'rumor' ? '?' : ''));
    }
  }
  return out;
}

/** Текст новости с подстановками (категория — словом на языке игрока). */
export function newsText(n: { key: string; vars?: Record<string, string | number> }): string {
  const v = n.vars ? { ...n.vars } : undefined;
  if (v && typeof v.cat === 'string') v.cat = t('cat.' + v.cat);
  return t(n.key, v);
}
