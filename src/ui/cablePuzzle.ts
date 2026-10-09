import { h, modal } from './dom.ts';
import { t } from '../i18n.ts';
import { sound } from '../audio/audio.ts';
import { shuffle, slide, solved, trace, SIZE, N, E, S, W, type Board, type Tile, type Wire } from '../logic/puzzle.ts';

/**
 * Окно «Правильная прокладка кабелей»: пятнашки 3×3 из кусков кабеля.
 *
 * Плитки рисуются SVG, а не картинкой: кабель на стыке двух плиток должен
 * совпадать до пикселя, иначе «трасса» выглядит рваной даже собранной.
 * Подключённые к гнезду БП куски светятся — игрок видит, сколько уже верно.
 */

const COL: Record<Wire, { base: string; braid: string; w: number }> = {
  cpu: { base: '#e9a93a', braid: '#ffd77e', w: 17 },
  atx: { base: '#23252b', braid: '#8c929c', w: 27 },
  gpu: { base: '#c8372d', braid: '#ff8a7a', w: 19 },
};
const MID: Record<number, [number, number]> = { [N]: [50, 0], [E]: [100, 50], [S]: [50, 100], [W]: [0, 50] };

function cablePath(ends: number): string {
  const sides = [N, E, S, W].filter((d) => ends & d);
  const [a, b] = sides.map((d) => MID[d]);
  // прямой кусок — линия, поворот — дуга вокруг общего угла
  if ((ends & (N | S)) === (N | S) || (ends & (E | W)) === (E | W)) return `M${a[0]} ${a[1]} L${b[0]} ${b[1]}`;
  return `M${a[0]} ${a[1]} Q50 50 ${b[0]} ${b[1]}`;
}

function tileSvg(tile: Tile, lit: boolean): string {
  const bg = '<rect x="1" y="1" width="98" height="98" rx="9" fill="#2c3139"/>'
    + '<path d="M14 22h22M64 78h22M78 14v18M22 70v18" stroke="#3a414b" stroke-width="2" fill="none"/>';
  if (!tile.wire) {
    // заглушка: пластина с решёткой вентиляции
    const holes = [30, 42, 54, 66].map((y) => `<rect x="26" y="${y}" width="48" height="5" rx="2.5" fill="#1d2127"/>`).join('');
    return bg + `<rect x="14" y="14" width="72" height="72" rx="7" fill="#454c57"/>${holes}<circle cx="21" cy="21" r="3" fill="#8b929c"/><circle cx="79" cy="79" r="3" fill="#8b929c"/>`;
  }
  const c = COL[tile.wire], d = cablePath(tile.ends);
  const glow = lit ? `<path d="${d}" stroke="${c.braid}" stroke-opacity=".35" stroke-width="${c.w + 12}" fill="none" stroke-linecap="butt"/>` : '';
  return bg + glow
    + `<path d="${d}" stroke="#0e0f12" stroke-opacity=".55" stroke-width="${c.w + 5}" fill="none" transform="translate(2 3)"/>`
    + `<path d="${d}" stroke="${c.base}" stroke-width="${c.w}" fill="none"/>`
    + `<path d="${d}" stroke="${c.braid}" stroke-width="${c.w - 6}" stroke-dasharray="3 5" fill="none" opacity="${lit ? 0.9 : 0.45}"/>`
    + `<path d="${d}" stroke="#fff" stroke-opacity=".18" stroke-width="3" fill="none" transform="translate(-${c.w / 4} -${c.w / 4})"/>`;
}

/**
 * Открыть пятнашки. `onDone(true)` — собрано, `onDone(false)` — «как попало».
 */
export function openCablePuzzle(seed: number, onDone: (tidy: boolean) => void, bonus = 0): void {
  const b: Board = shuffle(seed);
  // клетка ужимается под экран: на телефоне в альбомной ориентации окно иначе не влезало
  const CELL = Math.round(Math.max(60, Math.min(92, (innerHeight - 300) / 3.1, (innerWidth - 190) / 3.1))), GAP = 4, SZ = SIZE * CELL + (SIZE - 1) * GAP;
  const grid = h('div', { class: 'cp-grid', style: `width:${SZ}px;height:${SZ}px` });
  const els = new Map<Tile, HTMLElement>();
  b.cells.forEach((tile) => {
    if (!tile) return;
    const el = h('button', { class: 'cp-tile live', style: `width:${CELL}px;height:${CELL}px`, 'aria-label': tile.wire ? t('cab.' + tile.wire) : '' });
    el.addEventListener('click', (e) => { e.stopPropagation(); move(b.cells.indexOf(tile)); });
    els.set(tile, el); grid.append(el);
  });
  // выходы трасс: сверху над левой колонкой — процессор, справа — плата и видеокарта
  const outs: Record<Wire, HTMLElement> = {
    cpu: h('div', { class: 'cp-out top', style: `left:${CELL / 2 - 34}px` }, t('cab.cpu')),
    atx: h('div', { class: 'cp-out right', style: `top:${CELL + GAP + CELL / 2 - 12}px` }, t('cab.atx')),
    gpu: h('div', { class: 'cp-out right', style: `top:${2 * (CELL + GAP) + CELL / 2 - 12}px` }, t('cab.gpu')),
  };
  const psu = h('div', { class: 'cp-psu' }, h('span', {}, t('cab.psu')),
    ...([0, 1, 2] as const).map((i) => h('i', { style: `left:${i * (CELL + GAP) + CELL / 2 - 13}px` })));
  const board = h('div', { class: 'cp-board' }, grid, outs.cpu, outs.atx, outs.gpu, psu);
  const movesEl = h('div', { class: 'cp-moves' });
  let finished = false;

  const draw = () => {
    const tr = trace(b);
    const lit = new Set<number>();
    for (const w of Object.keys(tr) as Wire[]) { tr[w].cells.forEach((i) => lit.add(i)); outs[w].classList.toggle('on', tr[w].done); }
    b.cells.forEach((tile, i) => {
      if (!tile) return;
      const el = els.get(tile)!;
      const r = Math.floor(i / SIZE), c = i % SIZE;
      el.style.transform = `translate(${c * (CELL + GAP)}px,${r * (CELL + GAP)}px)`;
      el.innerHTML = `<svg viewBox="0 0 100 100" width="${CELL}" height="${CELL}">${tileSvg(tile, lit.has(i))}</svg>`;
    });
    movesEl.textContent = t('cab.moves', { n: b.moves });
  };

  const move = (i: number) => {
    if (finished || !slide(b, i)) return;
    sound.cable();
    draw();
    if (solved(b)) {
      finished = true;
      board.classList.add('win');
      sound.success();
      movesEl.textContent = t('cab.done');
      window.removeEventListener('keydown', keys, true);
      setTimeout(() => { close(); onDone(true); }, 1100);
    }
  };
  // стрелки двигают плитку В пустую клетку (как в классических пятнашках)
  const keys = (e: KeyboardEvent) => {
    const em = b.cells.indexOf(null), r = Math.floor(em / SIZE), c = em % SIZE;
    const map: Record<string, number> = { ArrowUp: r < SIZE - 1 ? em + SIZE : -1, ArrowDown: r > 0 ? em - SIZE : -1, ArrowLeft: c < SIZE - 1 ? em + 1 : -1, ArrowRight: c > 0 ? em - 1 : -1 };
    if (!(e.code in map)) return;
    e.preventDefault(); e.stopPropagation();
    if (map[e.code] >= 0) move(map[e.code]);
  };
  window.addEventListener('keydown', keys, true);
  draw();
  const close = modal(t('cab.title'), [h('p', { class: 'cp-hint' }, t('cab.hint')), ...(bonus > 0 ? [h('p', { class: 'cp-bonus' }, t('cab.bonusEst', { n: '$' + bonus }))] : []), board, movesEl], [
    { label: t('cab.skip'), cls: 'ghost', act: () => { finished = true; window.removeEventListener('keydown', keys, true); onDone(false); } },
  ]);
}
