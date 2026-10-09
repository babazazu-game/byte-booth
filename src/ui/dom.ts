import { part, type Part } from '../logic/parts.ts';
import { drawIcon } from '../render/models/retail.ts';
import { sound } from '../audio/audio.ts';
import { t } from '../i18n.ts';

/** Мини-фабрика DOM: интерфейс собирается кодом, без фреймворков. */
type Attrs = Record<string, unknown> & { class?: string; on?: Record<string, (e: Event) => void> };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'on') for (const [ev, fn] of Object.entries(v as Record<string, (e: Event) => void>)) el.addEventListener(ev, fn);
    else if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (k === 'html') el.innerHTML = String(v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v !== undefined && v !== null) el.setAttribute(k, String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** Кнопка со щелчком: звук интерфейса — у каждой кнопки одинаковый. */
export function btn(label: (Node | string)[] | string, onClick: () => void, cls = '', extra: Attrs = {}): HTMLButtonElement {
  const b = h('button', { class: 'btn live ' + cls, ...extra, on: { click: (e: Event) => { e.stopPropagation(); sound.click(); onClick(); } } });
  if (Array.isArray(label)) b.append(...label); else b.textContent = label;
  return b;
}

const ICONS: Record<string, string> = {
  window: '<path d="M4 4h16v12H4z M4 10h16 M12 4v12 M2 20h20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  bench: '<path d="M14 6l4-4 4 4-4 4z M15 9L5 19a2 2 0 1 1-2-2L13 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  shelf: '<path d="M3 3v18 M21 3v18 M3 8h18 M3 15h18 M6 5h4v3H6z M12 11h5v4h-5z M6 17h6v4H6z" fill="none" stroke="currentColor" stroke-width="2"/>',
  pc: '<path d="M3 4h18v12H3z M8 20h8 M12 16v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  bell: '<path d="M12 3a6 6 0 0 0-6 6v5l-2 3h16l-2-3V9a6 6 0 0 0-6-6z M10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  gear: '<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M4.9 19.1L7 17 M17 7l2.1-2.1" stroke="currentColor" stroke-width="2"/>',
  left: '<path d="M15 4l-8 8 8 8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  right: '<path d="M9 4l8 8-8 8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  moon: '<path d="M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  test: '<path d="M3 12h4l3-7 4 14 3-7h4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>',
  check: '<path d="M4 12l5 5L20 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  cable: '<path d="M6 3v6a6 6 0 0 0 12 0V3 M9 3v4 M15 3v4 M12 15v6" fill="none" stroke="currentColor" stroke-width="2"/>',
  panel: '<path d="M4 3h12v18H4z M16 7l4-2v16l-4-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  brush: '<path d="M14 3l7 7-6 6-7-7z M8 9l-5 5c-1 1-1 4 0 5s4 1 5 0l5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  remove: '<path d="M4 13v7h16v-7 M12 15V3 M7 8l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  paste: '<path d="M6 18l9-9 3 3-9 9H6z M15 9l3-3 3 3-3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  cart: '<path d="M3 4h2l2 11h11l2-8H6 M9 20a1 1 0 1 0 0-.01 M17 20a1 1 0 1 0 0-.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  star: '<path d="M12 3l2.7 5.6 6.2.9-4.5 4.3 1 6.2L12 17l-5.5 3 1-6.2L3 9.5l6.2-.9z" fill="currentColor"/>',
  play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
  plus: '<path d="M12 5v14 M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  book: '<path d="M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z M20 4h-6v16 M20 4v14h-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  aside: '<path d="M4 12h12 M12 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
};
export function icon(name: string): SVGSVGElement {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'icon');
  s.innerHTML = ICONS[name] ?? '';
  return s;
}

/* ───────────── миниатюры деталей ───────────── */

const thumbs = new Map<string, string>();
export function thumb(id: string): string {
  let u = thumbs.get(id);
  if (u) return u;
  const p = part(id);
  const c = document.createElement('canvas'); c.width = 160; c.height = 120;
  const g = c.getContext('2d')!;
  drawIcon(g, p.cat, 80, 60, p.cat === 'gpu' || p.cat === 'ram' || p.cat === 'ssd' ? 112 : 92, p.look.main, p.look.accent);
  u = c.toDataURL();
  thumbs.set(id, u);
  return u;
}

export function partTitle(p: Part): string { return `${p.brand} ${p.name}`; }

/* ───────────── тосты и окна ───────────── */

let toastBox: HTMLElement | null = null;
export function toast(msg: string, kind: '' | 'good' | 'bad' = ''): void {
  if (!toastBox) { toastBox = h('div', { class: 'toastbox' }); document.getElementById('ui')!.append(toastBox); }
  if (kind === 'bad') sound.error();
  const el = h('div', { class: 'toast ' + kind }, msg);
  toastBox.append(el);
  while (toastBox.children.length > 3) toastBox.firstChild!.remove();
  setTimeout(() => el.remove(), 2600);
}

export interface ModalBtn { label: string; cls?: string; act?: () => void | boolean }
let modalOpen = 0;
export const isModalOpen = (): boolean => modalOpen > 0;
export function modal(title: string, body: (Node | string)[], buttons: ModalBtn[], opts: { dismissable?: boolean } = {}): () => void {
  modalOpen++;
  const back = h('div', { class: 'modal-back live' });
  let closed = false;
  const close = () => { if (closed) return; closed = true; modalOpen--; back.remove(); };
  const mb = h('div', { class: 'mb' }, ...body);
  const mf = h('div', { class: 'mf' }, ...buttons.map((b) => btn(b.label, () => { const keep = b.act?.(); if (keep !== true) close(); }, b.cls ?? '')));
  const m = h('div', { class: 'modal' }, h('h2', {}, title), mb, mf);
  back.append(m);
  if (opts.dismissable) back.addEventListener('click', (e) => { if (e.target === back) close(); });
  document.getElementById('ui')!.append(back);
  return close;
}

export function confirmBox(text: string, yes: string, onYes: () => void, no = t('menu.no')): void {
  modal(text, [], [{ label: no }, { label: yes, cls: 'primary', act: onYes }], { dismissable: true });
}

export function floaty(text: string, x: number, y: number, color = '#2b8a4a'): void {
  const el = h('div', { class: 'floaty', style: `left:${x}px;top:${y}px;color:${color}` }, text);
  document.getElementById('ui')!.append(el);
  setTimeout(() => el.remove(), 1500);
}

/** Спарклайн цены за 14 дней — встроенный SVG, без библиотек. */
export function spark(vals: number[], w = 90, hgt = 26): SVGSVGElement {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', String(w)); s.setAttribute('height', String(hgt)); s.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
  if (vals.length < 2) return s;
  const mn = Math.min(...vals), mx = Math.max(...vals), span = mx - mn || 1;
  const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * (w - 4) + 2).toFixed(1)},${(hgt - 3 - ((v - mn) / span) * (hgt - 6)).toFixed(1)}`).join(' ');
  const up = vals[vals.length - 1] >= vals[0];
  s.innerHTML = `<polyline points="${pts}" fill="none" stroke="${up ? '#d2462f' : '#3f9a5a'}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  return s;
}
