import * as THREE from 'three';
import { buildRetailBox, BOX_DIMS } from '../render/models/retail.ts';
import { part } from '../logic/parts.ts';
import type { GameState } from '../logic/state.ts';
import { SHELF_X } from '../render/world.ts';
import { isRu } from '../render/kit.ts';

/**
 * Склад в 3D: каждая деталь на складе — коробка на полке.
 *
 * Игрок видит запасы глазами, как в ларьке, а не только списком: пустые
 * полки сами напоминают, что пора закупаться. Крупное — вниз, мелочь — вверх.
 * Готовые к выдаче ПК стоят коробками у прилавка.
 */

const LEVELS = [0.064, 0.634, 1.134, 1.594, 2.034];
const Z0 = 0.17, Z1 = 1.93;
const BIG = new Set(['case', 'psu', 'mb']);

export class Shelf {
  private group = new THREE.Group();
  private ready = new THREE.Group();
  private sig = '';

  constructor(parent: THREE.Group) {
    parent.add(this.group, this.ready);
  }

  sync(s: GameState): void {
    const readyIds = s.orders.filter((o) => o.state === 'ready').map((o) => o.build.case ?? 'zalman-t8');
    const sig = s.inv.map((i) => i.uid).join(',') + '|' + readyIds.join(',') + (isRu() ? 'ru' : 'en');
    if (sig === this.sig) return;
    this.sig = sig;
    this.group.clear();
    this.ready.clear();
    const items = s.inv.slice().sort((a, b) => Number(BIG.has(part(b.id).cat)) - Number(BIG.has(part(a.id).cat)));
    const cursor = LEVELS.map(() => Z0);
    for (const it of items) {
      const p = part(it.id);
      const [w, hgt, d] = BOX_DIMS[p.cat];
      // крупное — на нижнюю полку (её видно с места продавца), корпуса — на пол
      const order = BIG.has(p.cat) ? [1, 0, 2, 3, 4] : [3, 2, 1, 4, 0];
      const lvl = order.find((L) => cursor[L] + w <= Z1 && hgt < (LEVELS[L + 1] ?? 2.6) - LEVELS[L] - 0.02);
      if (lvl === undefined) continue;
      const m = buildRetailBox(p);
      m.rotation.y = -Math.PI / 2;
      m.position.set(SHELF_X + 0.2 - d / 2 - 0.02, LEVELS[lvl] + hgt / 2, cursor[lvl] + w / 2);
      cursor[lvl] += w + 0.012;
      this.group.add(m);
    }
    readyIds.forEach((id, i) => {
      const m = buildRetailBox(part(id));
      m.scale.setScalar(0.8);
      const [, hgt] = BOX_DIMS.case;
      m.rotation.y = 0.15 * (i % 2 ? 1 : -1);
      m.position.set(-1.05 + (i % 2) * 0.05, 0.03 + (hgt * 0.8) / 2 + Math.floor(i / 1) * 0, 0.12 + i * 0.32);
      this.ready.add(m);
    });
  }
}
