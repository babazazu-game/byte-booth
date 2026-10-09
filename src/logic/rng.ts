/**
 * Детерминированный генератор случайных чисел.
 *
 * Состояние генератора лежит в сохранении: перезагрузка страницы посреди дня
 * не должна перетасовывать рынок и очередь клиентов — иначе игрок «перебрасывает»
 * неудачные цены обновлением вкладки.
 */
export class Rng {
  constructor(public s: number) {}
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number { return a + (b - a) * this.next(); }
  int(a: number, b: number): number { return Math.floor(this.range(a, b + 1)); }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p: number): boolean { return this.next() < p; }
}
