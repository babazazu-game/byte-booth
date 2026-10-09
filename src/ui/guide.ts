/**
 * Справочник сборщика — «шпаргалка на стене» для тех, кто не знает железа.
 *
 * Подсветка «подходит к заказу» живёт только в обучающей сборке; дальше игрок
 * должен САМ сверять сокет, тип памяти и мощность БП. Чтобы это было обучением,
 * а не угадайкой, здесь все правила совместимости, и таблицы строятся прямо из
 * каталога деталей: добавили в каталог плату — она сама появилась в справке,
 * и справка никогда не разойдётся с тем, что реально проверяет верстак.
 */

import { CPUS, GPUS, MBS, RAMS, COOLERS, CASES, type Socket } from '../logic/parts.ts';
import { PRESETS } from '../logic/orders.ts';
import { t } from '../i18n.ts';
import { h, modal } from './dom.ts';

const SOCKETS: Socket[] = ['LGA1700', 'LGA1851', 'AM4', 'AM5'];

function table(head: string[], rows: (string | Node)[][]): HTMLElement {
  return h('table', { class: 'gtab' },
    h('thead', {}, h('tr', {}, ...head.map((x) => h('th', {}, x)))),
    h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map((x) => h('td', {}, x))))));
}

const sec = (title: string, ...body: (Node | string)[]) => h('section', { class: 'gsec' }, h('h4', {}, title), ...body);
const p = (txt: string) => h('p', {}, txt);

/** Тело справки: им пользуются и вкладка магазина, и окно на верстаке. */
export function guideBody(): HTMLElement {
  const short = (name: string) => name.replace(/^Core /, '').replace(/^Ryzen (\d) /, 'R$1 ');
  // 1. Сокет связывает процессор, плату и — через плату — память.
  const sockRows = SOCKETS.map((so) => {
    const boards = MBS.filter((m) => m.socket === so);
    const ram = [...new Set(boards.map((m) => m.ram))].join(' / ');
    return [h('b', {}, so), CPUS.filter((c) => c.socket === so).map((c) => short(c.name)).join(', '), boards.map((m) => `${m.chipset} (${m.ram})`).join(', '), ram];
  });
  // 2. Память: тип пишется прямо в названии платы и планки.
  const ramRows = (['DDR4', 'DDR5'] as const).map((ty) => [h('b', {}, ty), MBS.filter((m) => m.ram === ty).map((m) => m.chipset).join(', '), [...new Set(RAMS.filter((r) => r.type === ty).map((r) => `${r.gb} GB`))].join(', ')]);
  // 3. Видеокарты: потребление и длина — две вещи, о которые спотыкаются.
  const gpuRows = GPUS.map((g) => [g.chip, `${g.tdp} ${t('help.w')}`, `${g.len} ${t('help.mm')}`, String(g.perf)]);
  // 4. Корпуса: форм-фактор платы и допуски.
  const caseRows = CASES.map((c) => [`${c.brand} ${c.name}`, c.form === 'ATX' ? 'ATX · mATX · ITX' : c.form === 'mATX' ? 'mATX · ITX' : 'ITX', `${c.gpuMax}`, `${c.coolerMax}`]);
  // 5. Кулеры: рассеиваемая мощность против TDP процессора.
  const coolRows = COOLERS.map((c) => [`${c.brand} ${c.name}`, `${c.cap} ${t('help.w')}`, c.kind === 'aio' ? t('help.aio') : `${c.height} ${t('help.mm')}`]);
  // 6. Заказы: какие баллы ждёт клиент.
  const preRows = Object.values(PRESETS).map((pr) => [t('preset.' + pr.id), pr.score ? String(pr.score) : '—', pr.work ? String(pr.work) : '—', `${pr.ram} GB`, pr.ssd >= 1000 ? `${pr.ssd / 1000} TB` : `${pr.ssd} GB`]);

  return h('div', { class: 'guide' },
    sec(t('help.orderT'), h('ol', {}, ...['help.o1', 'help.o2', 'help.o3', 'help.o4', 'help.o5', 'help.o6'].map((k) => h('li', {}, t(k))))),
    sec(t('help.sockT'), p(t('help.sock')), table([t('help.socket'), t('help.cpus'), t('help.boards'), t('help.ram')], sockRows)),
    sec(t('help.ramT'), p(t('help.ramTxt')), table([t('help.type'), t('help.boards'), t('help.sticks')], ramRows)),
    sec(t('help.psuT'), p(t('help.psu')), h('p', { class: 'gex' }, t('help.psuEx'))),
    sec(t('help.gpuT'), p(t('help.gpu')), table([t('help.chip'), t('help.power'), t('help.len'), t('help.perf')], gpuRows)),
    sec(t('help.caseT'), p(t('help.case')), table([t('help.case1'), t('help.boards'), t('help.gpuMax'), t('help.coolMax')], caseRows)),
    sec(t('help.coolT'), p(t('help.cool')), table([t('help.cooler'), t('help.cap'), t('help.height')], coolRows)),
    sec(t('help.scoreT'), p(t('help.score')), table([t('help.order'), t('help.game'), t('help.work'), t('help.ram'), 'SSD'], preRows)),
  );
}

export function openGuide(): void {
  modal(t('help.title'), [guideBody()], [{ label: t('help.close'), cls: 'primary' }], { dismissable: true });
}
