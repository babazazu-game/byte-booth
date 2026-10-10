import * as THREE from 'three';
import { buildPerson, type Person, type Mood } from '../render/models/person.ts';
import { buildRetailBox } from '../render/models/retail.ts';
import { makeLook, ARCHS, type Arch, type PersonLook } from '../logic/customers.ts';
import { part } from '../logic/parts.ts';
import { sound } from '../audio/audio.ts';
import { V } from '../render/kit.ts';
import { KIOSK } from '../render/kiosk.ts';

/**
 * Режиссёр сцены за окном: клиент у окошка и прохожие в парке.
 *
 * Клиент ходит по маршруту из точек; когда доходит до окна — поворачивается
 * к игроку, облокачивается и «готов к разговору». Реплика — это облачко
 * с печатающимся текстом и синтезированная «мультяшная» речь в такт.
 */

const WINDOW_SPOT = V(0, 0, -0.88);
const ENTER = [V(-7, 0, -2.4), V(-1.3, 0, -1.8), WINDOW_SPOT];
const EXIT = [WINDOW_SPOT, V(1.2, 0, -1.7), V(7.5, 0, -2.4)];

// пятно-тень под прохожими: одна геометрия и материал на всех
const BLOB_GEO = new THREE.CircleGeometry(0.42, 20);
const BLOB_MAT = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.22, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });

export class Director {
  person: Person | null = null;
  look: PersonLook | null = null;
  state: 'none' | 'in' | 'at' | 'out' = 'none';
  /**
   * Окошко свободно: никого нет, или уходящий клиент уже вышел из кадра окна
   * (ушёл вправо за x > 2.3). Раньше ждали, пока он дойдёт до конца маршрута —
   * игрок сидел секунд восемь перед пустым окном. Новый клиент просто
   * заменяет ушедшего (spawn убирает его, но он уже не виден).
   */
  get free(): boolean { return this.state === 'none' || (this.state === 'out' && !!this.person && this.person.root.position.x > 2.3); }
  private path: THREE.Vector3[] = [];
  private seg = 0;
  private heading = Math.PI / 2;
  private onArrive: (() => void) | null = null;
  private onGone: (() => void) | null = null;
  private stepT = 0;
  /** base — точка на маршруте, side — уход вбок, чтобы разойтись со встречным. */
  private walkers: { p: Person; path: THREE.Vector3[]; i: number; dir: number; speed: number; base: THREE.Vector3; side: number }[] = [];
  /** Облачко речи. */
  private bubble: HTMLElement;
  private bubbleText = '';
  private shown = 0;
  private typeSpeed = 40;
  private bubbleOn = false;
  private who = '';

  constructor(private root: THREE.Group, private camera: THREE.PerspectiveCamera) {
    this.bubble = document.createElement('div');
    this.bubble.className = 'bubble hidden';
    document.getElementById('ui')!.append(this.bubble);
  }

  /* ───────────── клиент ───────────── */

  spawn(look: PersonLook, seed: number, onArrive: () => void): void {
    this.clear();
    const p = buildPerson(look, seed);
    // облокачиваясь, ладони кладёт ровно на столешницу прилавка
    // ладони — на подоконник окна (он на 4,5 см выше прилавка): ниже рука проходила сквозь стену
    p.st.restY = 0.972; p.st.restZ = KIOSK.z0 - 0.075; // ладонь ближе к улице: пальцы кончаются у края подоконника, а не свешиваются в него
    this.person = p; this.look = look;
    this.root.add(p.root);
    p.root.position.copy(ENTER[0]);
    p.st.walking = true; p.st.walkW = 1;
    this.path = ENTER; this.seg = 0; this.state = 'in';
    this.heading = Math.PI / 2;
    p.root.rotation.y = this.heading;
    this.onArrive = onArrive;
  }

  leave(carryPartId: string | null, mood: Mood, onGone?: () => void): void {
    const p = this.person;
    if (!p) { onGone?.(); return; }
    this.hideBubble();
    p.st.leaning = false; p.st.talking = false; p.st.mood = mood;
    if (carryPartId) {
      const b = buildRetailBox(part(carryPartId));
      b.scale.setScalar(0.62);
      p.carrySlot.add(b);
      p.st.carrying = true;
    }
    setTimeout(() => {
      if (this.person !== p) return;
      p.st.walking = true;
      this.path = EXIT; this.seg = 0; this.state = 'out';
      this.onGone = onGone ?? null;
    }, 700);
  }

  /**
   * Уйти, забрав предмет с прилавка (готовый ПК): предмет плавно, по дуге,
   * переезжает со стола в руки, клиент перехватывает его и уходит с ним.
   */
  /*
   * ПК в руках НЕ привязан к телу: туловище наклоняется и масштабировано по
   * росту/ширине, и привязанный корпус перекашивало. Он живёт в мире и каждый
   * кадр ставится ровно перед клиентом — по его курсу, в натуральную величину.
   */
  private handoff: { obj: THREE.Object3D; t: number; p0: THREE.Vector3; q0: THREE.Quaternion; s0: number; depth: number; halfH: number; rz0: number } | null = null;
  leaveWith(obj: THREE.Object3D, mood: Mood, onGone?: () => void, depth = 0.22, grip = 0.2): void {
    const p = this.person;
    if (!p) { obj.removeFromParent(); onGone?.(); return; }
    this.hideBubble();
    p.st.leaning = false; p.st.talking = false; p.st.mood = mood;
    this.root.updateMatrixWorld(true);
    this.root.attach(obj);
    const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
    this.handoff = { obj, t: 0, p0: obj.position.clone(), q0: obj.quaternion.clone(), s0: obj.scale.x, depth, halfH: size.y / 2, rz0: p.root.position.z };
    // половина ширины корпуса в руках — в единицах тела (тело масштабировано по ширине)
    p.st.grip = (grip * obj.scale.x) / p.root.scale.x;
    p.st.carrying = true;
    setTimeout(() => {
      if (this.person !== p) return;
      p.st.walking = true;
      this.path = EXIT; this.seg = 0; this.state = 'out';
      this.onGone = onGone ?? null;
    }, 1750);
  }

  clear(): void {
    if (this.person) this.person.root.removeFromParent();
    if (this.handoff) { this.handoff.obj.removeFromParent(); this.handoff = null; }
    this.person = null; this.state = 'none';
    this.hideBubble();
  }

  setMood(m: Mood): void { if (this.person) this.person.st.mood = m; }

  /** Сказать фразу: текст печатается, голос синтезируется. Возвращает длительность. */
  say(text: string, who: string): number {
    const p = this.person, L = this.look;
    if (!p || !L) return 0;
    this.who = who;
    this.bubbleText = text; this.shown = 0;
    const dur = sound.speak(text, L.pitch, L.rate);
    this.typeSpeed = Math.max(28, text.length / Math.max(0.6, dur));
    p.st.talking = true;
    this.bubbleOn = true;
    this.bubble.classList.remove('hidden');
    setTimeout(() => { if (this.person === p && this.shown >= this.bubbleText.length) p.st.talking = false; }, dur * 1000 + 150);
    return dur;
  }
  hideBubble(): void { this.bubbleOn = false; this.bubble.classList.add('hidden'); }

  /* ───────────── прохожие ───────────── */

  spawnWalkers(n: number, archs: Arch[], shadows = true): void {
    for (const w of this.walkers) w.p.root.removeFromParent();
    this.walkers = [];
    const routes = [
      // порядок важен: на низком качестве берётся только первый маршрут, на среднем — три
      [V(-14, 0, -3.1), V(14, 0, -3.1)],
      [V(14, 0, 4.2), V(-14, 0, 4.2)], // за ларьком — их видно в меню
      // аллея и поперечная дорожка огибают фонтан (центр 1.8, −12, радиус ~2.1)
      [V(1.2, 0, -26), V(1.2, 0, -15), V(-0.9, 0, -12.6), V(-0.9, 0, -10.2), V(1.2, 0, -9), V(1.2, 0, -5)],
      // встречная дорожка — в 80 см от первой (было 30: люди шли сквозь друг друга)
      [V(14, 0, -2.3), V(-14, 0, -2.3)],
      [V(-16, 0, 10.5), V(16, 0, 10.5)],
      [V(-16, 0, -12.3), V(-1.2, 0, -12.3), V(0.2, 0, -14.6), V(3.4, 0, -14.6), V(4.8, 0, -12.3), V(16, 0, -12.3)],
    ];
    for (let i = 0; i < n; i++) {
      const seed = 1000 + i * 77 + Math.floor(Math.random() * 1000);
      const arch = archs[(i + seed) % archs.length];
      const p = buildPerson(makeLook(arch, seed), seed, true);
      const path = routes[i % routes.length];
      // старт на случайном отрезке ломаной, идём в случайную сторону
      const seg = (Math.random() * (path.length - 1)) | 0, dir = Math.random() < 0.5 ? 1 : -1;
      p.root.position.copy(path[seg]).lerp(path[seg + 1], Math.random());
      p.st.walking = true; p.st.walkW = 1; p.st.speed = 0.7 + Math.random() * 0.4;
      // Настоящая тень прохожего — второй проход на каждый его меш, а карта теней
      // обновляется не каждый кадр (Engine.shadowEvery): тень шла рывками.
      // Вместо неё — мягкое пятно под ногами: движется вместе с ним, почти бесплатно.
      p.root.traverse((o) => { o.castShadow = false; });
      if (shadows) { const b = new THREE.Mesh(BLOB_GEO, BLOB_MAT); b.rotation.x = -Math.PI / 2; b.position.y = 0.015; b.renderOrder = 2; b.castShadow = false; p.root.add(b); }
      this.root.add(p.root);
      this.walkers.push({ p, path, i: dir > 0 ? seg + 1 : seg, dir, speed: p.st.speed, base: p.root.position.clone(), side: 0 });
    }
  }

  /* ───────────── кадр ───────────── */

  update(t: number, dt: number): void {
    const p = this.person;
    const ho = this.handoff;
    if (ho && p) {
      const stepping = ho.t < 1;
      ho.t = Math.min(1, ho.t + dt / 1.4);
      const ease = (x: number) => { const c = Math.max(0, Math.min(1, x)); return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2; };
      // клиент отступает на шаг: в руках у самого окна корпус стоял в стене ларька
      if (stepping) p.root.position.z = ho.rz0 - 0.24 * ease(ho.t / 0.6);
      // цель: перед грудью, боком к себе (длинная сторона между ладонями)
      const rs = p.root.scale;
      const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.root.rotation.y);
      const off = new THREE.Vector3(0, 1.0 * rs.y, 0.3 * rs.z + ho.depth / 2).applyQuaternion(yaw);
      const tp = p.root.position.clone().add(off);
      const tq = yaw.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
      /*
       * Путь в три шага: поднять над подоконником (низ корпуса выше 0.97 м),
       * вынести через окно, опустить к груди. По прямой корпус проходил сквозь
       * стену под окном.
       */
      const hy = Math.max(tp.y, 0.97 + ho.halfH + 0.05);
      const pA = new THREE.Vector3(ho.p0.x, hy, ho.p0.z), pB = new THREE.Vector3(tp.x, hy, tp.z);
      const t = ho.t;
      if (t < 0.3) ho.obj.position.lerpVectors(ho.p0, pA, ease(t / 0.3));
      else if (t < 0.72) ho.obj.position.lerpVectors(pA, pB, ease((t - 0.3) / 0.42));
      else ho.obj.position.lerpVectors(pB, tp, ease((t - 0.72) / 0.28));
      ho.obj.quaternion.slerpQuaternions(ho.q0, tq, ease(t));
      ho.obj.scale.setScalar(ho.s0);
    }
    if (!p && ho) { ho.obj.removeFromParent(); this.handoff = null; }
    if (p) {
      if (this.state === 'in' || this.state === 'out') {
        const tgt = this.path[this.seg + 1];
        const d = tgt.clone().sub(p.root.position); d.y = 0;
        let L = d.length(), step = p.st.speed * dt;
        // клиент тоже не идёт сквозь прохожего: тот прямо впереди — пауза, пока не разойдутся
        const dn = d.clone().normalize();
        for (const w of this.walkers) {
          const rel = w.p.root.position.clone().sub(p.root.position); rel.y = 0;
          const ahead = rel.dot(dn);
          if (ahead > 0 && ahead < 0.6 && rel.clone().addScaledVector(dn, -ahead).length() < 0.45) step *= 0.15;
        }
        L = d.length();
        if (L <= step) {
          p.root.position.copy(tgt); this.seg++;
          if (this.seg >= this.path.length - 1) {
            p.st.walking = false;
            if (this.state === 'in') {
              this.state = 'at'; this.heading = 0;
              setTimeout(() => { if (this.person === p) { p.st.leaning = true; setTimeout(() => this.onArrive?.(), 650); } }, 300);
            } else {
              const cb = this.onGone; this.clear(); cb?.();
              return;
            }
          }
        } else {
          p.root.position.addScaledVector(d.normalize(), step);
          this.heading = Math.atan2(d.x, d.z);
          this.stepT -= dt;
          if (this.stepT <= 0) { this.stepT = 0.89 / 2 / p.st.speed; const dist = p.root.position.length(); if (dist < 5) sound.footstep(Math.max(-1, Math.min(1, p.root.position.x / 4)), Math.max(0.2, 1 - dist / 5)); }
        }
      }
      let dh = this.heading - p.root.rotation.y; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      p.root.rotation.y += dh * Math.min(1, dt * 6);
      p.update(t, dt);
    }
    /*
     * Прохожие не проходят сквозь людей: видят кого-то впереди (другого
     * прохожего или клиента у окна) — плавно уходят вправо («держись правее»,
     * поэтому встречные расходятся в разные стороны), совсем близко —
     * притормаживают. Идут по маршруту точкой base, а видимое положение —
     * base плюс сдвиг вбок.
     */
    const bodies: THREE.Vector3[] = this.walkers.map((w) => w.p.root.position);
    if (p) bodies.push(p.root.position);
    for (const w of this.walkers) {
      const tgt = w.path[w.i];
      const d = tgt.clone().sub(w.base); d.y = 0;
      const L = d.length();
      // дошёл до точки — к следующей; на концах ломаной разворачивается
      if (L < 0.1) { if (w.i + w.dir < 0 || w.i + w.dir >= w.path.length) w.dir = -w.dir; w.i += w.dir; continue; }
      d.normalize();
      const right = V(d.z, 0, -d.x);
      let push = 0, slow = 1;
      for (const o of bodies) {
        if (o === w.p.root.position) continue;
        const rel = o.clone().sub(w.p.root.position); rel.y = 0;
        const ahead = rel.dot(d), lat = rel.dot(right);
        if (ahead > -0.3 && ahead < 1.6 && Math.abs(lat) < 0.7) {
          push += (lat > 0.05 ? -1 : 1) * (1.6 - Math.max(0, ahead));
          if (ahead > 0 && ahead < 0.55 && Math.abs(lat) < 0.45) slow = 0.25;
        }
      }
      const want = Math.max(-0.75, Math.min(0.75, push * 0.5));
      w.side += (want - w.side) * Math.min(1, dt * (want === 0 ? 1.2 : 3));
      w.base.addScaledVector(d, Math.min(L, w.speed * slow * dt));
      w.p.root.position.copy(w.base).addScaledVector(right, w.side);
      const hd = Math.atan2(d.x, d.z) - (want - w.side) * 0.6;
      let dh = hd - w.p.root.rotation.y; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      w.p.root.rotation.y += dh * Math.min(1, dt * 4);
      w.p.update(t, dt);
    }
    // облачко над головой
    if (this.bubbleOn && p) {
      if (this.shown < this.bubbleText.length) {
        this.shown = Math.min(this.bubbleText.length, this.shown + this.typeSpeed * dt);
        if (Math.random() < 0.02) sound.key();
      }
      const hp = p.head.getWorldPosition(V()); hp.y += 0.5;
      hp.project(this.camera);
      const vis = hp.z < 1 && Math.abs(hp.x) < 1.2;
      this.bubble.style.opacity = vis ? '1' : '0';
      const ui = document.getElementById('ui')!;
      const x = ((hp.x + 1) / 2) * ui.clientWidth, y = ((1 - hp.y) / 2) * ui.clientHeight;
      /*
       * Над головой места нет (низкий экран телефона лёжа) — пузырь встаёт
       * сбоку от головы. Раньше его прижимало вниз, и текст ложился на лицо.
       */
      const bh = this.bubble.offsetHeight || 80, bw = this.bubble.offsetWidth || 260;
      const hc = p.head.getWorldPosition(V()).project(this.camera);
      const hx = ((hc.x + 1) / 2) * ui.clientWidth, hy = ((1 - hc.y) / 2) * ui.clientHeight;
      const side = y - bh < 50;
      this.bubble.classList.toggle('side', side);
      if (side) {
        const r = Math.abs(x - hx) + ui.clientHeight * 0.16; // примерно полголовы вбок
        const right = hx + r + bw < ui.clientWidth - 8;
        this.bubble.classList.toggle('left', !right);
        this.bubble.style.left = (right ? hx + r : hx - r - bw) + 'px';
        this.bubble.style.top = Math.max(50 + bh / 2, Math.min(ui.clientHeight - bh / 2 - 8, hy)) + 'px';
      } else {
        this.bubble.style.left = Math.max(170, Math.min(ui.clientWidth - 170, x)) + 'px';
        this.bubble.style.top = Math.max(150, y) + 'px';
      }
      const txt = this.bubbleText.slice(0, Math.floor(this.shown));
      const html = `<div class="who">${this.who}</div>${txt.replace(/</g, '&lt;')}`;
      if (this.bubble.innerHTML !== html) this.bubble.innerHTML = html;
    }
  }

  get atWindow(): boolean { return this.state === 'at'; }
}

export const walkerArchs = Object.keys(ARCHS) as Arch[];
