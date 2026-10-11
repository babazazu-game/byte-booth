/**
 * Иконки деталей для магазина и склада (холст 160×120). Раньше у всех
 * процессоров была одна и та же серая плашка, у видеокарт — один силуэт:
 * в списке их различали только по тексту. Теперь иконка сама говорит, что это:
 * фирма и линейка процессора, длина и число вентиляторов видеокарты, объём
 * памяти и диска, мощность блока питания, тип кулера, размер платы и корпуса.
 */
import type { Part, CPU, GPU, RAM, SSD, PSU, Cooler, MB, Case } from '../logic/parts.ts';

const TAU = Math.PI * 2;
const DARK = '#262a33';

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, c: string): void {
  g.fillStyle = c; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill();
}
/** Надпись, ужатая по ширине; цвет и жирность — снаружи. */
function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, size: number, color: string, weight = 900, align: CanvasTextAlign = 'center'): void {
  g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle';
  let s = size; g.font = `${weight} ${s}px Rubik, Onest, sans-serif`;
  while (s > 7 && g.measureText(text).width > maxW) { s -= 1; g.font = `${weight} ${s}px Rubik, Onest, sans-serif`; }
  g.fillText(text, x, y);
}
function fan(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, hub: string, ring?: string): void {
  g.fillStyle = '#1d2230'; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
  g.fillStyle = '#3b4560';
  for (let k = 0; k < 9; k++) { g.save(); g.translate(cx, cy); g.rotate((k * TAU) / 9); g.beginPath(); g.moveTo(r * 0.22, 0); g.quadraticCurveTo(r * 0.6, -r * 0.42, r * 0.92, -r * 0.05); g.quadraticCurveTo(r * 0.6, -r * 0.05, r * 0.22, r * 0.12); g.fill(); g.restore(); }
  g.fillStyle = hub; g.beginPath(); g.arc(cx, cy, r * 0.26, 0, TAU); g.fill();
  if (ring) { g.strokeStyle = ring; g.lineWidth = Math.max(2, r * 0.12); g.beginPath(); g.arc(cx, cy, r * 0.95, 0, TAU); g.stroke(); }
}
const rainbow = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
  const gr = g.createLinearGradient(x, 0, x + w, 0);
  ['#ff4d6d', '#ffb347', '#ffe66d', '#5fd38a', '#45a6ff', '#b06ad8'].forEach((c, i, a) => gr.addColorStop(i / (a.length - 1), c));
  g.fillStyle = gr; g.fillRect(x, y, w, h);
};

export function drawPartIcon(g: CanvasRenderingContext2D, p: Part, W: number, H: number): void {
  g.save();
  g.shadowColor = 'rgba(0,0,0,.28)'; g.shadowBlur = 6; g.shadowOffsetY = 3;
  const cx = W / 2, cy = H / 2;
  switch (p.cat) {
    case 'cpu': {
      const c = p as CPU, amd = c.vendor === 'amd';
      // зелёная подложка, металлическая крышка, фирменный знак и линейка
      rr(g, cx - 42, cy - 42, 84, 84, 5, '#2f5a3a');
      g.shadowColor = 'transparent';
      for (let i = 0; i < 9; i++) { g.fillStyle = '#d9b04a'; g.fillRect(cx - 38 + i * 9.4, cy + 37, 4, 4); g.fillRect(cx - 38 + i * 9.4, cy - 41, 4, 4); }
      const lid = g.createLinearGradient(cx - 34, cy - 34, cx + 34, cy + 34); lid.addColorStop(0, '#e9ebef'); lid.addColorStop(1, '#a9adb5');
      g.fillStyle = lid; g.beginPath(); g.roundRect(cx - 34, cy - 34, 68, 68, 6); g.fill();
      const tier = amd ? (c.name.match(/Ryzen (\d)/)?.[1] ?? '') : (c.name.match(/(?:i|Ultra )(\d)/)?.[1] ?? '');
      label(g, amd ? 'AMD' : 'intel', cx, cy - 18, 60, 15, amd ? '#d8382f' : '#1f6fd6', 900);
      // кружок линейки: Ryzen 5/7/9 — красный, Core i3/i5/i7, Ultra — синий
      g.fillStyle = amd ? '#d8382f' : '#1f6fd6'; g.beginPath(); g.arc(cx, cy + 10, 15, 0, TAU); g.fill();
      label(g, (amd ? '' : c.name.includes('Ultra') ? 'U' : 'i') + tier, cx, cy + 10.5, 26, 15, '#fff', 900);
      label(g, c.name.replace(/^(Core |Ryzen )/, '').replace(/^i\d-|^Ultra \d /, '').replace(/^\d /, ''), cx, cy + 30, 62, 9, '#3a3f49', 800);
      break;
    }
    case 'gpu': {
      const c = p as GPU, nv = c.vendor === 'nvidia';
      // длина иконки — по настоящей длине карты (170–360 мм)
      const len = 74 + ((c.len - 170) / 190) * 74, h = c.tdp >= 350 ? 52 : 44;
      const x0 = cx - len / 2;
      rr(g, x0, cy - h / 2, len, h, 6, DARK);
      g.shadowColor = 'transparent';
      rr(g, x0 + 2, cy - h / 2 + 2, len - 4, h - 4, 5, p.look.main);
      const n = c.fans, R = Math.min(h * 0.36, (len - 10) / n / 2 - 1.5);
      for (let i = 0; i < n; i++) fan(g, x0 + 5 + (len - 10) * (i + 0.5) / n, cy - 2, R, '#1b1f2a', p.look.accent);
      // полоса вендора по верхнему краю и номер модели
      g.fillStyle = nv ? '#76b900' : '#ed1c24'; g.fillRect(x0 + 4, cy - h / 2 - 5, len - 8, 4);
      rr(g, cx - 26, cy + h / 2 + 3, 52, 15, 4, nv ? '#1d2a10' : '#2a1012');
      label(g, c.chip.replace(/^(RTX|RX) /, ''), cx, cy + h / 2 + 11, 48, 11, nv ? '#9ee04a' : '#ff7a7a', 900);
      // объём памяти — плашкой в углу кожуха (под картой у коротких моделей не помещался)
      rr(g, x0 + len - 31, cy - h / 2 + 3, 27, 11, 3, 'rgba(10,12,16,.82)');
      label(g, `${c.vram}GB`, x0 + len - 17.5, cy - h / 2 + 9, 24, 8.5, '#fff', 900);
      break;
    }
    case 'ram': {
      const c = p as RAM;
      rr(g, cx - 64, cy - 22, 128, 36, 4, '#1d4a32');
      g.shadowColor = 'transparent';
      rr(g, cx - 62, cy - 26, 124, 32, 4, p.look.main);
      if (c.rgb) rainbow(g, cx - 60, cy - 30, 120, 6); else { g.fillStyle = p.look.accent; g.fillRect(cx - 60, cy - 28, 120, 4); }
      g.fillStyle = '#d9b04a'; for (let i = 0; i < 26; i++) g.fillRect(cx - 58 + i * 4.5, cy + 10, 2.5, 4);
      const light = parseInt(p.look.main.slice(1, 3), 16) + parseInt(p.look.main.slice(3, 5), 16) + parseInt(p.look.main.slice(5, 7), 16) > 450;
      label(g, `${c.gb}GB`, cx - 18, cy - 10, 60, 16, light ? '#23262d' : '#fff', 900);
      rr(g, cx + 22, cy - 18, 34, 15, 3, c.type === 'DDR5' ? '#3b6fd0' : '#6a7280');
      label(g, c.type, cx + 39, cy - 10, 30, 10, '#fff', 900);
      label(g, `${c.mhz}`, cx, cy + 28, 80, 9, '#4a4f59', 800);
      break;
    }
    case 'ssd': {
      const c = p as SSD;
      // M.2: длина палочки одинаковая, по наклейке видно объём и скорость
      rr(g, cx - 62, cy - 16, 124, 32, 3, '#1d3a2c');
      g.shadowColor = 'transparent';
      rr(g, cx - 44, cy - 14, 100, 28, 2, p.look.main);
      g.fillStyle = '#d9b04a'; g.fillRect(cx - 62, cy - 12, 14, 24);
      label(g, c.gb >= 1000 ? `${c.gb / 1000}TB` : `${c.gb}GB`, cx + 6, cy - 2, 70, 15, '#fff', 900);
      g.fillStyle = p.look.accent; g.fillRect(cx - 40, cy + 8, Math.min(92, (c.speed / 7500) * 92), 3);
      label(g, `${(c.speed / 1000).toFixed(1)} GB/s`, cx, cy + 28, 90, 9, '#4a4f59', 800);
      break;
    }
    case 'psu': {
      const c = p as PSU;
      rr(g, cx - 46, cy - 34, 92, 68, 6, p.look.main);
      g.shadowColor = 'transparent';
      fan(g, cx - 12, cy - 2, 25, '#1b1f2a');
      const tierC: Record<string, string> = { Bronze: '#b0703a', Gold: '#d9a640', Platinum: '#9fb3c8', Titanium: '#6f7d8c' };
      rr(g, cx + 17, cy - 30, 26, 60, 3, '#16181d');
      label(g, `${c.watt}`, cx + 30, cy - 12, 24, 11, '#fff', 900);
      label(g, 'W', cx + 30, cy + 1, 24, 9, '#c9ccd2', 800);
      g.fillStyle = tierC[c.tier] ?? '#888'; g.beginPath(); g.arc(cx + 30, cy + 18, 7, 0, TAU); g.fill();
      label(g, c.tier, cx, cy + 44, 90, 9, '#4a4f59', 800);
      break;
    }
    case 'cooler': {
      const c = p as Cooler;
      if (c.kind === 'aio') {
        // помпа + шланги + радиатор с тремя вентиляторами
        rr(g, cx - 66, cy - 40, 132, 30, 4, DARK);
        g.shadowColor = 'transparent';
        for (let i = 0; i < 3; i++) fan(g, cx - 44 + i * 44, cy - 25, 13, '#1b1f2a', c.look.accent);
        g.strokeStyle = '#16171b'; g.lineWidth = 4; g.beginPath(); g.moveTo(cx - 6, cy + 18); g.quadraticCurveTo(cx - 20, cy, cx - 20, cy - 10); g.moveTo(cx + 6, cy + 18); g.quadraticCurveTo(cx + 20, cy, cx + 20, cy - 10); g.stroke();
        rr(g, cx - 18, cy + 12, 36, 26, 7, '#16171b');
        g.strokeStyle = c.look.accent; g.lineWidth = 2.5; g.beginPath(); g.arc(cx, cy + 25, 9, 0, TAU); g.stroke();
      } else if (c.kind === 'low') {
        // низкий: широкий плоский радиатор и вентилятор сверху
        rr(g, cx - 52, cy + 6, 104, 18, 3, '#b7bcc4');
        g.shadowColor = 'transparent';
        for (let i = 0; i < 14; i++) { g.fillStyle = '#8d939c'; g.fillRect(cx - 50 + i * 7.4, cy + 7, 2, 16); }
        rr(g, cx - 42, cy - 14, 84, 18, 4, c.look.main);
        g.fillStyle = c.look.accent; g.fillRect(cx - 40, cy - 6, 80, 3);
      } else {
        // башня: одна или две стопки рёбер, вентилятор сбоку
        const dual = c.cap >= 200, h = 50 + ((c.height - 140) / 30) * 20;
        const stacks = dual ? [cx - 30, cx + 18] : [cx - 6];
        for (const x of stacks) {
          rr(g, x - 16, cy - h / 2, 32, h, 3, '#c9cdd3');
          g.shadowColor = 'transparent';
          for (let i = 0; i < 12; i++) { g.fillStyle = '#9aa0a8'; g.fillRect(x - 15, cy - h / 2 + 3 + i * (h - 6) / 12, 30, 1.5); }
          rr(g, x - 17, cy - h / 2 - 4, 34, 6, 2, c.look.main === '#c9cdd4' ? '#2a2d35' : c.look.main);
        }
        const fx = dual ? cx - 6 : cx + 20;
        g.fillStyle = c.brand === 'Noctua' ? '#7a5a46' : c.rgb ? '#f4f4f2' : DARK; g.beginPath(); g.roundRect(fx - 9, cy - 24, 18, 48, 3); g.fill();
        if (c.rgb) rainbow(g, fx - 7, cy - 22, 3, 44);
        for (let i = 0; i < 4; i++) { g.fillStyle = '#c87a4c'; g.fillRect(cx - 34 + i * 18, cy + h / 2, 5, 8); }
      }
      label(g, c.brand, cx, H - 9, W - 20, 9, '#4a4f59', 800);
      break;
    }
    case 'mb': {
      const c = p as MB;
      // размер — по форм-фактору: ATX высокая, mATX квадратная, ITX маленькая
      const [bw, bh] = c.form === 'ATX' ? [76, 96] : c.form === 'mATX' ? [80, 80] : [62, 62];
      const x0 = cx - bw / 2, y0 = cy - bh / 2;
      rr(g, x0, y0, bw, bh, 3, c.look.main);
      g.shadowColor = 'transparent';
      g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(x0, y0 + 10 + i * bh / 6); g.lineTo(x0 + bw, y0 + 10 + i * bh / 6 + 6); g.stroke(); }
      rr(g, x0 + bw * 0.22, y0 + bh * 0.12, 22, 22, 2, '#c9ccd2'); // сокет
      for (let i = 0; i < c.slots; i++) { g.fillStyle = '#16181d'; g.fillRect(x0 + bw - 18 + i * 3.5, y0 + 6, 2.2, bh * 0.42); }
      g.fillStyle = c.look.accent; g.fillRect(x0 + 4, y0 + 4, 10, bh * 0.4); // радиатор VRM
      g.fillStyle = '#16181d'; g.fillRect(x0 + 6, y0 + bh * 0.62, bw - 14, 4); if (c.pcie2) g.fillRect(x0 + 6, y0 + bh * 0.82, bw - 14, 4);
      rr(g, x0 + bw * 0.5 - 2, y0 + bh * 0.66, 18, 12, 2, c.look.accent);
      label(g, c.chipset, cx, y0 + bh + 9, 80, 10, '#3a3f49', 900);
      label(g, c.form, x0 + bw + 4, y0 + 8, 40, 9, '#4a4f59', 800, 'left');
      break;
    }
    case 'case': {
      const c = p as Case;
      const [bw, bh] = c.size === 'mini' ? [54, 62] : c.size === 'full' ? [84, 92] : [64, 90];
      const x0 = cx - bw / 2, y0 = cy - bh / 2;
      rr(g, x0, y0, bw, bh, 5, c.look.main);
      g.shadowColor = 'transparent';
      // окно: стекло — тёмное с отражением, сталь — решётка
      if (c.glass) {
        rr(g, x0 + 6, y0 + 7, bw - 12, bh - 22, 3, 'rgba(20,26,36,.85)');
        g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.moveTo(x0 + 10, y0 + 9); g.lineTo(x0 + 22, y0 + 9); g.lineTo(x0 + 10, y0 + 30); g.fill();
        if (c.rgb) for (let i = 0; i < (c.size === 'mini' ? 2 : 3); i++) { g.strokeStyle = ['#ff4d8d', '#45a6ff', '#5fd38a'][i]; g.lineWidth = 2.5; g.beginPath(); g.arc(x0 + bw - 16, y0 + 18 + i * 19, 7, 0, TAU); g.stroke(); }
      } else {
        g.fillStyle = 'rgba(0,0,0,.25)'; for (let y = y0 + 10; y < y0 + bh - 18; y += 6) g.fillRect(x0 + 10, y, bw - 20, 2.5);
      }
      g.fillStyle = c.look.accent; g.fillRect(x0 + 6, y0 + bh - 10, bw - 12, 3);
      label(g, c.brand, cx, y0 + bh + 9, 90, 9, '#4a4f59', 800);
      break;
    }
    default: {
      // термопаста — тюбик
      rr(g, cx - 14, cy - 34, 28, 58, 6, p.look.main);
      g.shadowColor = 'transparent';
      rr(g, cx - 8, cy + 24, 16, 12, 2, '#9aa0a8');
      g.fillStyle = p.look.accent; g.fillRect(cx - 14, cy - 12, 28, 14);
      label(g, p.brand, cx, cy - 5, 26, 8, '#fff', 900);
    }
  }
  g.restore();
}
