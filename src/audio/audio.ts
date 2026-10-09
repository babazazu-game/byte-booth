/**
 * Звук игры — синтез в WebAudio. Исключение — музыка: десять треков в
 * assets/music (ElevenLabs); их процедурные «двойники» в TRACKS играют, только
 * если файлы не загрузились.
 *
 * «Не 8 бит» здесь значит: шум и FM-синтез через фильтры, огибающие с
 * мягкими хвостами, общая реверберация, синтезированная из затухающего шума,
 * стереопанорама. Звуки собраны из нескольких слоёв, как делают звуковые
 * дизайнеры: «щелчок + тело + хвост».
 *
 * Шлюз молчания (уход со вкладки, реклама) — `core.audio` из каркаса: он
 * зовёт suspend/resume здесь, и других путей выключить звук нет.
 */

type Bus = 'sfx' | 'music' | 'voice' | 'amb';

/* ───────────── треки ───────────── */

/**
 * Трек — это не ноты, а «рецепт»: темп, гармония, рисунки партий по 16-м и
 * тембры. Мелодия сочиняется заново при каждом запуске из мотива на два такта,
 * поэтому треки узнаваемы по настроению, но не надоедают дословным повтором.
 * Рисунки: 16 символов на такт, x — сильный удар, o — слабый, . — пауза.
 */
interface Track {
  id: string;
  bpm: number;
  /** Задержка нечётных 16-х в долях шестнадцатой: свинг лоу-фая и босса-новы. */
  swing: number;
  /** По аккорду (MIDI) на такт; длина 4 или 8, чтобы делить восьмитактовую фразу. */
  chords: number[][];
  /** Лад мелодии: полутоны от тоники и тоника в нужном регистре. */
  scale: number[];
  root: number;
  keys: 'epiano' | 'pad' | 'pluck' | 'stab';
  bass: 'sub' | 'saw' | 'pluck';
  lead: 'pluck' | 'bell' | 'epiano' | 'saw';
  comp: string; bassPat: string; kick: string; snare: string; hat: string; perc?: string;
  /** Срез общего фильтра музыки, Гц: чем ниже, тем «теплее» и дальше. */
  lpf: number;
  crackle: number;
  /** Насколько густо поёт мелодия (0..1). */
  density: number;
}

const MAJ = [0, 2, 4, 5, 7, 9, 11], MIN = [0, 2, 3, 5, 7, 8, 10];

/**
 * Плейлист записанных треков (assets/music/<id>.mp3). Первые пять имеют
 * процедурных «двойников» в TRACKS — на случай, если файлы не загрузятся.
 */
const FILES = ['park', 'solder', 'evening', 'market', 'overclock', 'jazzhop', 'acoustic', 'deephouse', 'nudisco', 'downtempo'];

const TRACKS: Track[] = [
  { // «Утро в парке» — лоу-фай: электропиано, свинг, винил
    id: 'park', bpm: 76, swing: 0.45, chords: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]],
    scale: MAJ, root: 72, keys: 'epiano', bass: 'sub', lead: 'pluck',
    comp: 'x.......x..o....', bassPat: 'x.......x.....o.', kick: 'x.........x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
    lpf: 3200, crackle: 0.05, density: 0.42,
  },
  { // «Паяльник и кофе» — сити-поп: синкопы, слэп-бас, стабы
    id: 'solder', bpm: 104, swing: 0.08, chords: [[50, 57, 60, 64], [55, 59, 65, 69], [48, 55, 59, 64], [57, 61, 64, 67]],
    scale: MAJ, root: 74, keys: 'stab', bass: 'pluck', lead: 'epiano',
    comp: '..x...x...x..x..', bassPat: 'x..x..+.x.o..x..', kick: 'x...x...x...x...', snare: '....x.......x..o', hat: 'xoxoxoxoxoxoxoxo',
    lpf: 5200, crackle: 0, density: 0.5,
  },
  { // «Вечерняя смена» — чиллвейв: подушки, колокольчики, неспешно
    id: 'evening', bpm: 88, swing: 0, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
    scale: MIN, root: 69, keys: 'pad', bass: 'saw', lead: 'bell',
    comp: 'x.......x.......', bassPat: 'x.....x.x.....x.', kick: 'x......x..x.....', snare: '....x.......x...', hat: '..x...x...x...x.',
    lpf: 2600, crackle: 0, density: 0.38,
  },
  { // «Рыночный день» — босса-нова: щипковые аккорды, клаве, шейкер
    id: 'market', bpm: 124, swing: 0.1, chords: [[48, 52, 55, 59], [57, 61, 64, 67], [50, 53, 57, 60], [55, 59, 62, 65]],
    scale: MAJ, root: 72, keys: 'pluck', bass: 'sub', lead: 'epiano',
    comp: 'x..x..x...x..x..', bassPat: 'x.....o.x.....o.', kick: 'x.....o.x.....o.', snare: '................', hat: 'xoxoxoxoxoxoxoxo', perc: '...x..x...x..x..',
    lpf: 4200, crackle: 0, density: 0.36,
  },
  { // «Ночной разгон» — синтвейв: пила-бас восьмыми, мелодия с вибрато
    id: 'overclock', bpm: 108, swing: 0, chords: [[52, 55, 59], [48, 52, 55], [55, 59, 62], [50, 54, 57]],
    scale: MIN, root: 76, keys: 'pad', bass: 'saw', lead: 'saw',
    comp: 'x...............', bassPat: 'x.x.x.x.x.x.x.x.', kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.',
    lpf: 4800, crackle: 0, density: 0.5,
  },
];

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * Восьмитактовая мелодия по форме A A' B A: двухтактовый мотив, его вариация,
 * ответ и возврат. На сильных долях нота подтягивается к ближайшему звуку
 * аккорда — иначе случайная прогулка по ладу звучит как ошибки.
 * Возвращает 128 шестнадцатых: 0 — пауза, иначе MIDI-нота.
 */
function makeMelody(tr: Track, seed: number): number[] {
  let a = seed >>> 0;
  const r = () => { a = (a + 0x6d2b79f5) >>> 0; let x = a; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const motif = (): (number | null)[] => {
    const out: (number | null)[] = [];
    let d = 2 + ((r() * 3) | 0);
    for (let i = 0; i < 32; i++) {
      const p = i % 4 === 0 ? tr.density * 1.3 : i % 2 === 0 ? tr.density * 0.8 : tr.density * 0.2;
      if (r() < p) { d = Math.max(0, Math.min(9, d + [-2, -1, -1, 0, 1, 1, 2][(r() * 7) | 0])); out.push(d); } else out.push(null);
    }
    return out;
  };
  const A = motif(), B = motif();
  const A2 = A.map((d, i) => (i >= 24 && d !== null ? Math.max(0, Math.min(9, d + ((r() * 3) | 0) - 1)) : d));
  const deg = [...A, ...A2, ...B, ...A];
  // фраза заканчивается тоникой и паузой
  for (let i = 112; i < 128; i++) deg[i] = null;
  deg[112] = 0;
  return deg.map((d, k) => {
    if (d === null) return 0;
    let m = tr.root + 12 * Math.floor(d / 7) + tr.scale[d % 7] - 12;
    if (k % 8 === 0) {
      const ch = tr.chords[Math.floor(k / 16) % tr.chords.length];
      let best = m, bd = 99;
      for (const c of ch) for (const o of [-24, -12, 0, 12, 24]) { const n = c + o; const dd = Math.abs(n - m); if (dd < bd) { bd = dd; best = n; } }
      m = best;
    }
    return m;
  });
}

class Sound {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses = {} as Record<Bus, GainNode>;
  private rev!: ConvolverNode;
  private revSend!: GainNode;
  private noise!: AudioBuffer;
  private pink!: AudioBuffer;
  private musicOn = true;
  private ambOn = true;
  vol = { music: 0.55, sfx: 0.85, amb: 0.6 };
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private ambTimer: ReturnType<typeof setInterval> | null = null;
  private fanNode: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

  /** Создаётся по первому жесту игрока: браузеры не дают звука без него. */
  unlock(): void {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    this.master.connect(comp).connect(ctx.destination);
    for (const b of ['sfx', 'music', 'voice', 'amb'] as Bus[]) { const g = ctx.createGain(); g.connect(this.master); this.buses[b] = g; }
    this.applyVolumes();
    this.rev = ctx.createConvolver();
    this.rev.buffer = this.impulse(1.6, 2.6);
    this.revSend = ctx.createGain(); this.revSend.gain.value = 0.28;
    this.revSend.connect(this.rev).connect(this.master);
    this.noise = this.makeNoise(2, false);
    this.pink = this.makeNoise(4, true);
    this.startMusic();
    this.startAmbience();
  }

  suspend(): void { void this.ctx?.suspend(); }
  resume(): void { void this.ctx?.resume(); }

  setVolumes(music: number, sfx: number): void { this.vol.music = music; this.vol.sfx = sfx; this.vol.amb = sfx * 0.7; this.applyVolumes(); }
  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.buses.music.gain.setTargetAtTime(this.musicOn ? this.vol.music * 0.5 : 0, t, 0.1);
    this.buses.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.buses.voice.gain.setTargetAtTime(this.vol.sfx * 0.9, t, 0.05);
    this.buses.amb.gain.setTargetAtTime(this.ambOn ? this.vol.amb * 0.5 : 0, t, 0.3);
  }

  private impulse(sec: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 200 ? i / 200 : 1);
    }
    return b;
  }
  private makeNoise(sec: number, pink: boolean): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (pink) { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18; }
      else d[i] = w;
    }
    return b;
  }

  /* ───────────── строительные блоки ───────────── */

  private out(bus: Bus, pan = 0, wet = 0.25): AudioNode {
    const ctx = this.ctx!;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    p.connect(this.buses[bus]);
    if (wet > 0) { const s = ctx.createGain(); s.gain.value = wet; p.connect(s).connect(this.revSend); }
    return p;
  }
  private env(g: GainNode, t: number, a: number, peak: number, d: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  /** Шумовой всплеск через полосовой фильтр. */
  private burst(t: number, f: number, q: number, peak: number, dur: number, dst: AudioNode, type: BiquadFilterType = 'bandpass', fEnd?: number): void {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (fEnd) fl.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
    const g = ctx.createGain(); this.env(g, t, 0.003, peak, dur);
    s.connect(fl).connect(g).connect(dst);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  /** Тон с огибающей и, по желанию, скольжением частоты. */
  private tone(t: number, f: number, peak: number, dur: number, dst: AudioNode, type: OscillatorType = 'sine', fEnd?: number, a = 0.004): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (fEnd) o.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
    const g = ctx.createGain(); this.env(g, t, a, peak, dur);
    o.connect(g).connect(dst); o.start(t); o.stop(t + a + dur + 0.05);
  }
  /** FM-колокол: неровные обертоны дают «металл», а не «пищалку». */
  private bellTone(t: number, f: number, peak: number, dur: number, dst: AudioNode, ratios = [1, 2.76, 5.4, 8.93], amps = [1, 0.5, 0.25, 0.12]): void {
    ratios.forEach((r, i) => this.tone(t, f * r, peak * amps[i], dur / (1 + i * 0.6), dst, 'sine', undefined, 0.002));
  }
  private fmPluck(t: number, f: number, peak: number, dur: number, dst: AudioNode, index = 2.2): void {
    const ctx = this.ctx!;
    const car = ctx.createOscillator(); car.frequency.value = f;
    const mod = ctx.createOscillator(); mod.frequency.value = f;
    const mg = ctx.createGain(); mg.gain.setValueAtTime(f * index, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + dur * 0.6);
    mod.connect(mg).connect(car.frequency);
    const g = ctx.createGain(); this.env(g, t, 0.006, peak, dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    car.connect(lp).connect(g).connect(dst);
    car.start(t); mod.start(t); car.stop(t + dur + 0.1); mod.stop(t + dur + 0.1);
  }

  /** Пока клиент говорит, музыка отходит на второй план. */
  private duck(sec: number): void {
    if (!this.ctx || !this.musicOn) return;
    const g = this.buses.music.gain, t = this.ctx.currentTime, v = this.vol.music * 0.5;
    g.cancelScheduledValues(t); g.setTargetAtTime(v * 0.6, t, 0.15); g.setTargetAtTime(v, t + sec, 0.6);
  }
  private ok(): boolean { return !!this.ctx && this.ctx.state === 'running'; }
  private now(): number { return this.ctx!.currentTime + 0.005; }

  /* ───────────── звуки интерфейса и мира ───────────── */

  click(): void { if (!this.ok()) return; const t = this.now(), o = this.out('sfx', 0, 0.1); this.tone(t, 1500, 0.12, 0.04, o, 'triangle', 900); this.burst(t, 4000, 2, 0.05, 0.02, o); }
  hover(): void { if (!this.ok()) return; const t = this.now(); this.tone(t, 1900, 0.03, 0.03, this.out('sfx', 0, 0), 'sine', 1700); }
  tab(): void { if (!this.ok()) return; const t = this.now(), o = this.out('sfx', 0, 0.12); this.tone(t, 700, 0.07, 0.06, o, 'triangle', 1000); this.tone(t + 0.04, 1050, 0.06, 0.08, o, 'triangle'); }
  whoosh(): void { if (!this.ok()) return; const t = this.now(); this.burst(t, 300, 1.2, 0.08, 0.3, this.out('sfx', 0, 0.15), 'bandpass', 1800); }
  /** Хлопок сгоревшего блока питания: удар, треск искр, шипение. */
  burn(): void {
    if (!this.ok()) return; const t = this.now(), o = this.out('sfx', -0.2, 0.3);
    this.burst(t, 400, 0.7, 0.5, 0.25, o, 'lowpass');
    this.tone(t, 90, 0.3, 0.3, o, 'sine', 40, 0.002);
    for (let i = 0; i < 14; i++) this.burst(t + 0.05 + Math.random() * 0.6, 3000 + Math.random() * 4000, 4, 0.12, 0.02, o, 'bandpass');
    this.burst(t + 0.2, 5000, 0.6, 0.06, 1.4, o, 'highpass', 2000);
  }
  error(): void { if (!this.ok()) return; const t = this.now(), o = this.out('sfx', 0, 0.15); this.tone(t, 330, 0.12, 0.12, o, 'triangle', 300); this.tone(t + 0.13, 247, 0.12, 0.2, o, 'triangle', 220); }
  success(): void { if (!this.ok()) return; const t = this.now(), o = this.out('sfx', 0, 0.3); [523, 659, 784, 1046].forEach((f, i) => this.fmPluck(t + i * 0.07, f, 0.12, 0.5, o, 1.6)); }
  snap(): void {
    if (!this.ok()) return; const t = this.now(), o = this.out('sfx', -0.2, 0.18);
    this.burst(t, 2600, 3, 0.22, 0.03, o); this.tone(t, 160, 0.25, 0.09, o, 'sine', 70); this.burst(t + 0.02, 6000, 4, 0.06, 0.02, o);
  }
  screw(): void {
    if (!this.ok()) return; const t = this.now(), o = this.out('sfx', -0.2, 0.15);
    for (let i = 0; i < 7; i++) this.burst(t + i * 0.045, 3200 + Math.random() * 800, 6, 0.1, 0.018, o);
    this.bellTone(t + 0.33, 1400, 0.05, 0.25, o);
  }
  cable(): void { if (!this.ok()) return; const t = this.now(), o = this.out('sfx', -0.1, 0.15); this.burst(t, 900, 1.5, 0.15, 0.08, o, 'lowpass'); this.burst(t + 0.06, 3000, 5, 0.14, 0.02, o); this.tone(t + 0.06, 220, 0.12, 0.06, o, 'sine', 120); }
  panel(open: boolean): void { if (!this.ok()) return; const t = this.now(), o = this.out('sfx', -0.1, 0.2); this.burst(t, open ? 600 : 1800, 0.8, 0.1, 0.35, o, 'bandpass', open ? 1800 : 600); this.tone(t + 0.3, 120, 0.2, 0.12, o, 'sine', 70); }
  paste(): void { if (!this.ok()) return; const t = this.now(), o = this.out('sfx', -0.1, 0.1); this.burst(t, 500, 2, 0.12, 0.25, o, 'lowpass', 200); this.tone(t, 300, 0.05, 0.2, o, 'sine', 180); }
  brush(): void { if (!this.ok()) return; const t = this.now(); this.burst(t, 2400, 0.7, 0.07, 0.12, this.out('sfx', -0.2, 0.05), 'bandpass', 1600); }
  air(): void { if (!this.ok()) return; const t = this.now(); this.burst(t, 5000, 0.5, 0.12, 0.35, this.out('sfx', -0.2, 0.05), 'highpass', 3000); }
  wipe(): void { if (!this.ok()) return; const t = this.now(); this.burst(t, 1200, 1, 0.09, 0.22, this.out('sfx', 0, 0.05), 'bandpass', 2400); }
  pickup(): void { if (!this.ok()) return; const t = this.now(), o = this.out('sfx', 0, 0.1); this.burst(t, 800, 1, 0.08, 0.06, o, 'lowpass'); this.tone(t, 500, 0.05, 0.08, o, 'sine', 800); }
  paper(): void { if (!this.ok()) return; const t = this.now(), o = this.out('sfx', 0, 0.1); for (let i = 0; i < 3; i++) this.burst(t + i * 0.05, 3500, 0.6, 0.07, 0.06, o, 'highpass'); }
  key(): void { if (!this.ok()) return; const t = this.now(); this.burst(t, 2500 + Math.random() * 1500, 4, 0.08, 0.025, this.out('sfx', 0.2, 0.05)); }
  deskBell(): void { if (!this.ok()) return; const t = this.now(); this.bellTone(t, 1320, 0.22, 1.8, this.out('sfx', -0.3, 0.45), [1, 2.01, 2.98, 4.12, 5.3], [1, 0.45, 0.3, 0.15, 0.08]); this.burst(t, 6000, 3, 0.06, 0.02, this.out('sfx', -0.3, 0)); }
  cash(): void {
    if (!this.ok()) return; const t = this.now(), o = this.out('sfx', 0.1, 0.35);
    this.burst(t, 1500, 2, 0.12, 0.05, o); this.bellTone(t + 0.06, 2093, 0.14, 1.1, o, [1, 2.01, 3.0], [1, 0.4, 0.2]);
    for (let i = 0; i < 9; i++) this.bellTone(t + 0.15 + Math.random() * 0.35, 3000 + Math.random() * 3000, 0.03, 0.15, o, [1, 2.7], [1, 0.4]);
  }
  coin(): void { if (!this.ok()) return; const t = this.now(), o = this.out('sfx', 0, 0.3); this.bellTone(t, 2637, 0.08, 0.35, o, [1, 2.4], [1, 0.3]); this.bellTone(t + 0.08, 3520, 0.07, 0.4, o, [1, 2.4], [1, 0.3]); }
  levelUp(): void { if (!this.ok()) return; const t = this.now(), o = this.out('sfx', 0, 0.4); [523, 659, 784, 1046, 1318].forEach((f, i) => { this.fmPluck(t + i * 0.09, f, 0.12, 0.7, o, 1.4); this.bellTone(t + i * 0.09, f * 2, 0.025, 0.6, o); }); }
  boot(): void {
    if (!this.ok()) return; const t = this.now(), o = this.out('sfx', -0.2, 0.2);
    this.burst(t, 120, 0.7, 0.18, 0.12, o, 'lowpass');
    this.tone(t + 0.6, 1000, 0.08, 0.14, o, 'square');
  }
  fan(on: boolean): void {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (on && !this.fanNode) {
      const src = ctx.createBufferSource(); src.buffer = this.pink; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(200, t); lp.frequency.linearRampToValueAtTime(900, t + 1.2);
      const hum = ctx.createOscillator(); hum.frequency.value = 118; const hg = ctx.createGain(); hg.gain.value = 0.015; hum.connect(hg);
      const gain = ctx.createGain(); gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(0.14, t + 1.0); // тише: шум вентиляторов гудел на телефоне
      src.connect(lp).connect(gain); hg.connect(gain); gain.connect(this.out('sfx', -0.2, 0.1));
      src.start(); hum.start();
      this.fanNode = { src, gain };
      src.onended = () => hum.stop();
    } else if (!on && this.fanNode) {
      const n = this.fanNode; this.fanNode = null;
      n.gain.gain.setTargetAtTime(0.0001, t, 0.25);
      n.src.stop(t + 1.2);
    }
  }
  footstep(pan: number, vol = 1): void { if (!this.ok()) return; const t = this.now(); this.burst(t, 700, 1, 0.05 * vol, 0.07, this.out('amb', pan, 0.1), 'lowpass'); }

  /* ───────────── речь ───────────── */

  /**
   * «Мультяшная» речь в духе Animal Crossing: на слог — короткий упругий «бип»
   * с подскоком высоты в начале, между словами паузы, мелодия фразы прыгает
   * по пентатонике вокруг голоса персонажа (поэтому звучит весело, а не
   * фальшиво). Вопрос к концу уходит вверх, восклицание — выше и громче.
   * Прежний вариант (пила через узкие форманты, слоги сплошной лентой)
   * звучал как зажёванная плёнка.
   * Возвращает длительность, чтобы текст в облачке печатался в такт.
   */
  speak(text: string, pitch: number, rate: number): number {
    const words = text.split(/\s+/).map((w) => w.replace(/[^\p{L}\d]/gu, '')).filter(Boolean).slice(0, 14);
    const syl = 0.066 / rate, gap = 0.055 / rate;
    let dur = 0;
    const plan: { t: number; st: number; len: number }[] = [];
    const question = /\?\s*$/.test(text), excl = /!\s*$/.test(text);
    const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
    let total = 0; for (const w of words) total += Math.max(1, Math.min(4, Math.round(w.length / 2.6)));
    let k = 0, step = 2;
    for (const w of words) {
      const n = Math.max(1, Math.min(4, Math.round(w.length / 2.6)));
      for (let i = 0; i < n; i++, k++) {
        // мелодия: шаг по пентатонике на ±1–2 ступени, иногда скачок
        step = Math.max(0, Math.min(PENTA.length - 1, step + [-3, -2, -1, 0, 1, 2, 3][(Math.random() * 7) | 0]));
        let st = PENTA[step] - 4;
        const end = k / Math.max(1, total - 1);
        if (question && end > 0.6) st += (end - 0.6) * 14;
        if (excl) st += 2;
        const len = syl * (0.75 + Math.random() * 0.35);
        plan.push({ t: dur, st, len });
        dur += len;
      }
      dur += gap;
    }
    if (!this.ok() || !plan.length) return Math.max(0.3, dur);
    const ctx = this.ctx!;
    const t0 = this.now();
    const o = this.out('voice', (Math.random() - 0.5) * 0.2, 0.12);
    this.duck(dur + 0.3);
    const base = 290 * Math.pow(2, pitch / 12);
    /*
     * Мультяшная тарабарщина: у каждого слога своя «гласная» (две форманты
     * поверх пилы), высота подпрыгивает «боинг» вверх-вниз, лёгкое дрожание
     * голоса, а последний слог фразы смешно уезжает вверх (вопрос/восклицание)
     * или вниз. Ровные бипы одного тембра звучали как робот, а не как персонаж.
     */
    const VOW: [number, number][] = [[800, 1200], [500, 900], [350, 2200], [320, 800], [550, 1800]];
    plan.forEach((s0, idx) => {
      const t = t0 + s0.t, f = base * Math.pow(2, s0.st / 12), last = idx === plan.length - 1;
      const [f1, f2] = VOW[(Math.random() * VOW.length) | 0];
      const src = ctx.createOscillator(); src.type = 'sawtooth';
      const len = last ? s0.len * 1.8 : s0.len;
      const endK = last ? (question || excl ? 1.45 : 0.72) : 0.9;
      src.frequency.setValueAtTime(f * 1.4, t);
      src.frequency.exponentialRampToValueAtTime(f, t + 0.03);
      src.frequency.exponentialRampToValueAtTime(f * endK, t + len);
      // дрожание: быстрое «ва-ва» по высоте
      const lfo = ctx.createOscillator(); lfo.frequency.value = 9 + Math.random() * 4;
      const lg = ctx.createGain(); lg.gain.value = f * 0.035;
      lfo.connect(lg).connect(src.frequency);
      const b1 = ctx.createBiquadFilter(); b1.type = 'bandpass'; b1.Q.value = 5;
      const b2 = ctx.createBiquadFilter(); b2.type = 'bandpass'; b2.Q.value = 7;
      // гласная «переливается» внутри слога: «уа», «ои» — смешнее, чем стоячий звук
      b1.frequency.setValueAtTime(f1 * 0.7, t); b1.frequency.linearRampToValueAtTime(f1, t + len * 0.5);
      b2.frequency.setValueAtTime(f2 * 0.8, t); b2.frequency.linearRampToValueAtTime(f2, t + len * 0.5);
      const g2 = ctx.createGain(); g2.gain.value = 0.6;
      const body = ctx.createOscillator(); body.type = 'triangle';
      body.frequency.setValueAtTime(f * 1.4, t); body.frequency.exponentialRampToValueAtTime(f, t + 0.03); body.frequency.exponentialRampToValueAtTime(f * endK, t + len);
      const bg = ctx.createGain(); bg.gain.value = 0.35;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
      g.gain.setValueAtTime(0.5, t + len * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + len * 0.95);
      src.connect(b1).connect(g); src.connect(b2).connect(g2).connect(g); body.connect(bg).connect(g);
      g.connect(o);
      for (const x of [src, body, lfo]) { x.start(t); x.stop(t + len + 0.03); }
    });
    return dur;
  }

  /* ───────────── музыка: пять процедурных треков в случайном порядке ───────────── */

  setMusic(on: boolean): void { this.musicOn = on; this.applyVolumes(); }
  setAmbience(on: boolean): void { this.ambOn = on; this.applyVolumes(); }
  /** Название играющего трека меняется — UI может показать «♪ …». */
  onTrack: ((id: string) => void) | null = null;

  private musicBus!: BiquadFilterNode;
  private crackleGain!: GainNode;
  private bag: number[] = [];
  private lastTrack = -1;
  private cur: { tr: Track; step: number; bars: number; t: number; mel: number[] } | null = null;

  private startMusic(): void {
    const ctx = this.ctx!;
    this.musicBus = ctx.createBiquadFilter(); this.musicBus.type = 'lowpass'; this.musicBus.frequency.value = 3400;
    this.musicBus.connect(this.buses.music);
    const send = ctx.createGain(); send.gain.value = 0.32; this.musicBus.connect(send).connect(this.revSend);
    // виниловый треск — только у лоу-фай трека, громкость задаёт трек
    const crackle = ctx.createBufferSource(); crackle.buffer = this.makeCrackle(); crackle.loop = true;
    this.crackleGain = ctx.createGain(); this.crackleGain.gain.value = 0;
    crackle.connect(this.crackleGain).connect(this.musicBus); crackle.start();
    this.fileBus = ctx.createGain(); this.fileBus.gain.value = 0.85; this.fileBus.connect(this.buses.music);
    void this.playFileTrack();
  }

  /*
   * Основная музыка — пять записанных треков (ElevenLabs, бесшовные петли по 30 с
   * в assets/music). Каждый крутится петлёй ~2,5 минуты, затем плавно уходит,
   * и из «мешка» встаёт следующий. Если файл не загрузился (нет сети, битый
   * архив) — тихо переходим на процедурный синтез ниже: тишина хуже.
   */
  private fileBus!: GainNode;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private synthOn = false;
  private loadTrack(id: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(id);
    if (!p) {
      p = fetch('assets/music/' + id + '.mp3')
        .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })
        .then((a) => this.ctx!.decodeAudioData(a))
        .catch(() => null);
      this.buffers.set(id, p);
    }
    return p;
  }
  private async playFileTrack(): Promise<void> {
    const id = FILES[this.pickTrack()];
    const buf = await this.loadTrack(id);
    const ctx = this.ctx!;
    if (!buf) { this.startSynth(); return; }
    // следующий трек грузим заранее, пока играет этот
    const next = FILES[this.peekTrack()];
    void this.loadTrack(next);
    // в памяти только текущий и следующий: разжатые 30 с стерео — ~10 МБ каждый
    for (const k of [...this.buffers.keys()]) if (k !== id && k !== next && !k.startsWith('test_')) this.buffers.delete(k);
    const t = ctx.currentTime + 0.1;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 2);
    const len = Math.max(1, Math.round(150 / buf.duration)) * buf.duration;
    g.gain.setValueAtTime(1, t + len - 4); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(g).connect(this.fileBus);
    src.start(t); src.stop(t + len + 0.05);
    src.onended = () => { g.disconnect(); void this.playFileTrack(); };
    this.onTrack?.(id);
  }
  /*
   * Музыка момента поверх плейлиста: на первом включении собранного ПК —
   * драйвовая (сборка тянет на 3+ звезды) или унылая (1–2 звезды, не завёлся).
   * Плейлист на это время уходит в тишину, потом плавно возвращается.
   */
  private zoneTrack: { id: string; src: AudioBufferSourceNode; g: GainNode } | null = null;
  private zoneWant: string | null = null;
  setZoneMusic(id: string | null): void {
    if (this.zoneWant === id) return;
    this.zoneWant = id;
    if (!this.ctx || !this.fileBus) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (this.zoneTrack) { const z = this.zoneTrack; z.g.gain.cancelScheduledValues(t); z.g.gain.setTargetAtTime(0.0001, t, 0.35); z.src.stop(t + 2); this.zoneTrack = null; }
    this.fileBus.gain.cancelScheduledValues(t);
    // фон уходит быстро, чтобы мелодия теста не звучала поверх него
    this.fileBus.gain.setTargetAtTime(id ? 0.0001 : 0.85, t, id ? 0.12 : 0.8);
    if (!id) return;
    void this.loadTrack(id).then((buf) => {
      if (!buf || this.zoneWant !== id || !this.ctx) return;
      const now = this.ctx.currentTime;
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.85, now + 1.2);
      src.connect(g).connect(this.buses.music); src.start(now);
      this.zoneTrack = { id, src, g };
    });
  }
  private startSynth(): void {
    if (this.synthOn) return;
    this.synthOn = true;
    this.nextTrack(this.ctx!.currentTime + 0.3);
    this.musicTimer = setInterval(() => this.schedMusic(), 80);
  }
  /** «Мешок» без повторов: все треки по разу, затем новая перетасовка. */
  private pickTrack(): number {
    this.peekTrack();
    const idx = this.bag.shift()!;
    this.lastTrack = idx;
    return idx;
  }
  private peekTrack(): number {
    if (!this.bag.length) {
      this.bag = FILES.map((_, i) => i);
      for (let i = this.bag.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]]; }
      // только что сыгравший трек не встаёт первым после перетасовки
      if (this.bag[0] === this.lastTrack) this.bag.push(this.bag.shift()!);
    }
    return this.bag[0];
  }

  /** Запасной путь: процедурный трек с тем же «рецептом», если mp3 не загрузился. */
  private nextTrack(at: number): void {
    const tr = TRACKS[this.pickTrack() % TRACKS.length];
    // ~2,5 минуты, кратно 8 тактам: так фразы мелодии ложатся на форму
    const bars = Math.max(24, Math.round((150 / ((60 / tr.bpm) * 4)) / 8) * 8);
    this.cur = { tr, step: 0, bars, t: at, mel: makeMelody(tr, (Math.random() * 1e9) | 0) };
    const t = this.ctx!.currentTime;
    this.musicBus.frequency.setTargetAtTime(tr.lpf, t, 0.5);
    this.crackleGain.gain.setTargetAtTime(tr.crackle, t, 0.5);
    this.onTrack?.(tr.id);
  }

  private schedMusic(): void {
    const ctx = this.ctx, c = this.cur;
    if (!ctx || ctx.state !== 'running' || !c) return;
    const s16 = 60 / c.tr.bpm / 4;
    // после долгой паузы (реклама, свёрнутая вкладка) не догоняем пропущенное
    if (c.t < ctx.currentTime - 0.5) c.t = ctx.currentTime + 0.05;
    while (c.t < ctx.currentTime + 0.35) {
      const bar = Math.floor(c.step / 16), i = c.step % 16;
      // такт тишины между треками, затем следующий из мешка
      if (bar > c.bars) { this.nextTrack(c.t); return; }
      if (bar < c.bars) this.playStep(c.tr, c.mel, bar, i, c.bars, c.t + (i % 2 ? c.tr.swing * s16 : 0), s16);
      c.step++; c.t += s16;
    }
  }

  private playStep(tr: Track, mel: number[], bar: number, i: number, n: number, t: number, s16: number): void {
    const bus = this.musicBus;
    const intro = bar < 4, outro = bar >= n - 4;
    const brk = bar >= n / 2 - 4 && bar < n / 2 + 4;
    const v = outro ? Math.max(0.15, 1 - ((bar - (n - 4)) * 16 + i) / 64) : 1;
    const ch = tr.chords[bar % tr.chords.length];
    const at = (p: string) => p[i] ?? '.';
    // ударные: во вступлении только хэт, в брейке и концовке — без бочки и малого
    if (!intro && !brk && !outro) {
      if (at(tr.kick) !== '.') this.kick(t, bus, at(tr.kick) === 'x' ? 1 : 0.6);
      if (at(tr.snare) !== '.') this.snare(t, bus, at(tr.snare) === 'x' ? 1 : 0.5);
      if (tr.perc && at(tr.perc) !== '.') this.burst(t, 2600, 6, at(tr.perc) === 'x' ? 0.05 : 0.03, 0.03, bus);
    }
    if (!outro && at(tr.hat) !== '.') this.hat(t, bus, (at(tr.hat) === 'x' ? 0.028 : 0.014) * (brk ? 0.6 : 1));
    // аккомпанемент: длительность — до следующего удара в рисунке
    const comp = at(tr.comp);
    if (comp !== '.') {
      let len = 1; while (len < 16 && tr.comp[(i + len) % 16] === '.') len++;
      this.keys(tr.keys, t, ch, s16 * len, v * (comp === 'x' ? 1 : 0.6));
    }
    // бас: x — тоника, o — квинта, + — октава
    const b = at(tr.bassPat);
    if (b !== '.' && !(outro && bar >= n - 2)) {
      const root = ch[0] - 12 * (ch[0] >= 52 ? 2 : 1);
      const note = b === 'o' ? root + 7 : b === '+' ? root + 12 : root;
      let len = 1; while (len < 8 && tr.bassPat[(i + len) % 16] === '.') len++;
      this.bassNote(tr.bass, t, mtof(note), s16 * len, v);
    }
    // мелодия: восьмитактовая фраза, в брейке тише, во вступлении и концовке молчит
    if (!intro && !outro) {
      const k = (bar % 8) * 16 + i, m = mel[k];
      if (m) {
        let len = 1; while (len < 6 && !mel[(k + len) % mel.length]) len++;
        this.leadNote(tr.lead, t, mtof(m), s16 * len * 1.05, brk ? 0.6 : 1);
      }
    }
  }

  private keys(kind: Track['keys'], t: number, ch: number[], dur: number, v: number): void {
    const bus = this.musicBus;
    if (kind === 'epiano') ch.forEach((n, k) => this.epiano(t + k * 0.012, mtof(n), 0.045 * v, Math.max(0.3, dur), bus));
    else if (kind === 'pluck') ch.forEach((n, k) => this.fmPluck(t + k * 0.018, mtof(n), 0.03 * v, Math.max(0.25, dur * 0.9), bus, 0.9));
    else if (kind === 'stab') ch.forEach((n) => this.tone(t, mtof(n + 12), 0.018 * v, Math.min(0.18, dur), bus, 'sawtooth', undefined, 0.004));
    else ch.forEach((n) => this.pad(t, mtof(n), 0.022 * v, Math.max(0.6, dur)));
  }
  /** Подушка: два расстроенных пилообразных через мягкий фильтр, медленная атака. */
  private pad(t: number, f: number, peak: number, dur: number): void {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(600, t); lp.frequency.linearRampToValueAtTime(1600, t + dur * 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + Math.min(0.35, dur * 0.4)); g.gain.setTargetAtTime(0.0001, t + dur * 0.85, 0.12);
    lp.connect(g).connect(this.musicBus);
    for (const d of [-7, 7]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(lp); o.start(t); o.stop(t + dur + 0.6); }
  }
  private bassNote(kind: Track['bass'], t: number, f: number, dur: number, v: number): void {
    const bus = this.musicBus;
    if (kind === 'sub') this.tone(t, f, 0.13 * v, dur * 0.9, bus, 'sine', undefined, 0.015);
    else if (kind === 'pluck') this.fmPluck(t, f, 0.1 * v, Math.max(0.12, dur * 0.8), bus, 3);
    else {
      // пила через закрывающийся фильтр — «синтвейв»-бас
      const ctx = this.ctx!;
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4;
      lp.frequency.setValueAtTime(1400, t); lp.frequency.exponentialRampToValueAtTime(180, t + Math.max(0.08, dur * 0.8));
      const g = ctx.createGain(); this.env(g, t, 0.005, 0.07 * v, Math.max(0.08, dur * 0.9));
      o.connect(lp).connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.1);
      this.tone(t, f, 0.06 * v, dur * 0.85, bus, 'sine', undefined, 0.01);
    }
  }
  private leadNote(kind: Track['lead'], t: number, f: number, dur: number, v: number): void {
    const bus = this.musicBus;
    if (kind === 'pluck') this.fmPluck(t, f, 0.04 * v, Math.max(0.2, dur * 1.3), bus, 1.2);
    else if (kind === 'bell') this.bellTone(t, f, 0.03 * v, Math.max(0.5, dur * 2), bus, [1, 2, 3.01, 4.2], [1, 0.35, 0.15, 0.06]);
    else if (kind === 'epiano') this.epiano(t, f, 0.05 * v, Math.max(0.25, dur * 1.2), bus);
    else {
      // мягкая пила с вибрато — вести синтвейв-мелодию
      const ctx = this.ctx!;
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const vib = ctx.createOscillator(); vib.frequency.value = 5.2; const vg = ctx.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.006, t + 0.25);
      vib.connect(vg).connect(o.frequency);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
      const g = ctx.createGain(); this.env(g, t, 0.02, 0.028 * v, Math.max(0.15, dur));
      o.connect(lp).connect(g).connect(bus); o.start(t); vib.start(t); o.stop(t + dur + 0.1); vib.stop(t + dur + 0.1);
    }
  }

  private epiano(t: number, f: number, peak: number, dur: number, dst: AudioNode): void {
    const ctx = this.ctx!;
    const car = ctx.createOscillator(); car.frequency.value = f;
    const mod = ctx.createOscillator(); mod.frequency.value = f * 14;
    const mg = ctx.createGain(); mg.gain.setValueAtTime(f * 0.6, t); mg.gain.exponentialRampToValueAtTime(1, t + 0.25);
    mod.connect(mg).connect(car.frequency);
    const trem = ctx.createOscillator(); trem.frequency.value = 4.5; const tg = ctx.createGain(); tg.gain.value = 0.15;
    const g = ctx.createGain(); this.env(g, t, 0.01, peak, dur);
    trem.connect(tg).connect(g.gain);
    car.connect(g).connect(dst);
    car.start(t); mod.start(t); trem.start(t);
    car.stop(t + dur + 0.1); mod.stop(t + dur + 0.1); trem.stop(t + dur + 0.1);
  }
  private kick(t: number, dst: AudioNode, v = 1): void { this.tone(t, 110, 0.35 * v, 0.28, dst, 'sine', 42, 0.003); this.burst(t, 1200, 1, 0.04 * v, 0.01, dst, 'lowpass'); }
  private snare(t: number, dst: AudioNode, v = 1): void { this.burst(t, 1800, 0.8, 0.07 * v, 0.16, dst); this.tone(t, 190, 0.05 * v, 0.07, dst, 'triangle', 150); }
  private hat(t: number, dst: AudioNode, v: number): void { this.burst(t, 8000, 1, v, 0.035, dst, 'highpass'); }
  private makeCrackle(): AudioBuffer {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 3;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) { d[i] = (Math.random() * 2 - 1) * 0.02; if (Math.random() < 0.0004) d[i] = (Math.random() * 2 - 1) * 0.6; }
    return b;
  }

  /* ───────────── фон: парк ───────────── */

  private startAmbience(): void {
    const ctx = this.ctx!;
    const bus = this.buses.amb;
    // ветер: розовый шум через подвижный фильтр. Тихо: на динамике телефона
    // ветер с гомоном сливались в сплошной гул (автор: «фон прям гудит»)
    const wind = ctx.createBufferSource(); wind.buffer = this.pink; wind.loop = true;
    const wl = ctx.createBiquadFilter(); wl.type = 'lowpass'; wl.frequency.value = 420;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = 180; lfo.connect(lg).connect(wl.frequency);
    const wg = ctx.createGain(); wg.gain.value = 0.07;
    wind.connect(wl).connect(wg).connect(bus); wind.start(); lfo.start();
    // далёкий гомон: полосовой шум с медленной амплитудной модуляцией
    const ch = ctx.createBufferSource(); ch.buffer = this.pink; ch.loop = true; ch.playbackRate.value = 0.7;
    const cb = ctx.createBiquadFilter(); cb.type = 'bandpass'; cb.frequency.value = 650; cb.Q.value = 0.9;
    const cgn = ctx.createGain(); cgn.gain.value = 0.035;
    const alfo = ctx.createOscillator(); alfo.frequency.value = 0.3; const ag = ctx.createGain(); ag.gain.value = 0.02; alfo.connect(ag).connect(cgn.gain);
    ch.connect(cb).connect(cgn).connect(bus); ch.start(); alfo.start();
    // птицы: короткие трели с глиссандо, случайно по стерео
    this.ambTimer = setInterval(() => {
      if (!this.ok() || !this.ambOn) return;
      if (Math.random() < 0.45) this.bird();
    }, 1400);
  }
  private bird(): void {
    const t = this.now(), o = this.out('amb', Math.random() * 1.6 - 0.8, 0.35);
    const f0 = 2600 + Math.random() * 2200, n = 2 + ((Math.random() * 5) | 0);
    for (let i = 0; i < n; i++) {
      const s = t + i * (0.08 + Math.random() * 0.05);
      this.tone(s, f0 * (1 + Math.random() * 0.2), 0.03, 0.06, o, 'sine', f0 * (0.7 + Math.random() * 0.6), 0.005);
    }
  }

  dispose(): void {
    if (this.musicTimer) clearInterval(this.musicTimer);
    if (this.ambTimer) clearInterval(this.ambTimer);
  }
}

export const sound = new Sound();
