import type { App } from '../game/app.ts';
import { t, lang, setLangByPlayer } from '../i18n.ts';
import { h, btn, icon, modal, confirmBox } from './dom.ts';
import { sound } from '../audio/audio.ts';
import { LEGEND_REP } from '../logic/districts.ts';
import type { Quality } from '../render/engine.ts';

/** Главное меню, настройки, справка, пауза. */
export class Menu {
  readonly el: HTMLElement;

  constructor(private app: App) {
    this.el = h('div', { class: 'menu live hidden' });
    app.uiRoot.append(this.el);
  }

  show(on: boolean): void {
    this.el.classList.toggle('hidden', !on);
    if (on) this.render();
  }

  render(): void {
    this.el.innerHTML = '';
    const has = !!this.app.state;
    const btns = h('div', { class: 'btns' });
    if (has) btns.append(btn([icon('play'), t('menu.continue', { day: this.app.state!.day })], () => this.app.play(false), 'primary'));
    else btns.append(btn([icon('play'), t('menu.play')], () => this.app.play(true), 'primary'));
    if (has) btns.append(btn([icon('plus'), t('menu.new')], () => confirmBox(t('menu.confirmNew'), t('menu.yes'), () => this.app.play(true)), ''));
    btns.append(btn([icon('book'), t('menu.howto')], () => howTo(), ''));
    btns.append(btn([icon('gear'), t('menu.settings')], () => settings(this.app), ''));
    this.el.append(
      // нарисованный логотип (Codex) на своём языке; текст — запасной вариант для читалок
      h('div', { class: 'logo logo-img' }, h('img', { src: 'assets/tex/logo_' + (lang() === 'ru' ? 'ru' : 'en') + '.webp', alt: t('title') })),
      h('div', { class: 'tagline' }, t('menu.tagline')),
      btns,
    );
  }
}

export function howTo(): void {
  const body = [1, 2, 3, 4, 5, 6].map((i) => h('p', { style: 'margin:.5em 0' }, `${i}. ${t('how.' + i)}`));
  body.push(h('p', { style: 'margin:.8em 0 0;font-weight:700' }, t('how.keys')));
  body.push(h('p', { style: 'margin:.4em 0 0;color:#6b4a32' }, t('site.goal', { n: LEGEND_REP })));
  modal(t('how.title'), body, [{ label: t('ok'), cls: 'primary' }], { dismissable: true });
}

export function settings(app: App): void {
  const st = app.settings;
  const seg = (opts: [string, string][], cur: string, set: (v: string) => void) => {
    const box = h('div', { class: 'seg' });
    const draw = (val: string) => {
      box.innerHTML = '';
      for (const [v, label] of opts) {
        const b = h('button', { class: 'live ' + (v === val ? 'on' : '') }, label);
        b.addEventListener('click', () => { sound.click(); set(v); draw(v); });
        box.append(b);
      }
    };
    draw(cur);
    return box;
  };
  const slider = (v: number, set: (x: number) => void) => {
    const s = h('input', { type: 'range', min: '0', max: '100', value: String(Math.round(v * 100)), class: 'slider live' }) as HTMLInputElement;
    s.addEventListener('input', () => set(Number(s.value) / 100));
    return s;
  };
  const body = [
    h('div', { class: 'setrow' }, h('span', {}, t('set.music')), slider(st.music, (x) => { st.music = x; app.applySettings(); })),
    h('div', { class: 'setrow' }, h('span', {}, t('set.sfx')), slider(st.sfx, (x) => { st.sfx = x; app.applySettings(); sound.click(); })),
    h('div', { class: 'setrow' }, h('span', {}, t('set.ambience')), seg([['1', t('set.on')], ['0', t('set.off')]], st.amb ? '1' : '0', (v) => { st.amb = v === '1'; app.applySettings(); })),
    h('div', { class: 'setrow' }, h('span', {}, t('set.lang')), seg([['ru', 'Русский'], ['en', 'English']], lang(), (v) => { setLangByPlayer(v as 'ru' | 'en'); app.onLang(); app.saveSettings(); closeSet(); settings(app); })),
    h('div', { class: 'setrow' }, h('span', {}, t('set.quality')), seg([['low', t('set.q.low')], ['mid', t('set.q.mid')], ['high', t('set.q.high')]], st.quality, (v) => { st.quality = v as Quality; st.qualityChosen = true; app.applySettings(); })),
    h('div', { class: 'setrow' }, h('span', {}, t('set.fps')), seg([['1', t('set.on')], ['0', t('set.off')]], st.fps !== false ? '1' : '0', (v) => { st.fps = v === '1'; app.applySettings(); })),
    h('div', { class: 'setrow' }, h('span', {}, t('set.hints')), seg([['1', t('set.on')], ['0', t('set.off')]], st.hints ? '1' : '0', (v) => { st.hints = v === '1'; app.applySettings(); app.refresh(); })),
  ];
  // окно пересобирается при смене языка: иначе оно оставалось на старом языке
  const closeSet = modal(t('set.title'), body, [{ label: t('ok'), cls: 'primary', act: () => { app.saveSettings(); } }], { dismissable: true });
}

export function pauseMenu(app: App): void {
  modal(t('menu.pause'), [], [
    { label: t('menu.toMenu'), act: () => { app.toMenu(); } },
    { label: t('menu.howto'), act: () => { howTo(); } },
    { label: t('menu.settings'), act: () => { settings(app); } },
    { label: t('menu.resume'), cls: 'primary' },
  ], { dismissable: true });
}
