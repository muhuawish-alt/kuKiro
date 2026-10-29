// 通用绘图工具：调色板、时间函数、图标、图案、纸张质感、带阴影的衣服。
import { ICONS } from './icons.js';

export const W = 1080, H = 1920;
export const BAR = 1.875;          // 一小节（128 BPM）
export const BEAT = BAR / 4;

// 冷调：纸偏灰绿，个人颜色都压低饱和度，只有红色保持原样
export const C = {
  paper: '#dcdbd3',
  ink: '#121314',      // 剪影
  char: '#26282a',     // 深色衣服
  warm: '#76756f',     // 灰
  light: '#b9b9b2',    // 浅灰
  cream: '#e6e5dd',    // 围裙、襁褓
  red: '#a3192a',      // 风筝、传单上的印章
  mustard: '#a58f45',
  green: '#3a4842',
  blue: '#4b5965',
  brown: '#5c4536',
  ash: '#8e9192',      // 灰烬
};

// ---------- 时间函数 ----------
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lin = (t, t0, t1) => clamp((t - t0) / (t1 - t0));
export const smooth = (t, t0, t1) => { const x = lin(t, t0, t1); return x * x * (3 - 2 * x); };
export const mix = (a, b, p) => a + (b - a) * p;
export const mixPt = (a, b, p) => [mix(a[0], b[0], p), mix(a[1], b[1], p)];
export const wave = (t, period, phase = 0) => Math.sin(2 * Math.PI * (t / period + phase));
const mod = (a, n) => ((a % n) + n) % n;
export { mod };
// 周期性的平滑脉冲：每个周期里，从 offset 开始，持续 dur 秒，0 → 1 → 0
export function pulse(t, period, offset, dur) {
  const p = mod(t - offset, period);
  return p > dur ? 0 : 0.5 - 0.5 * Math.cos((2 * Math.PI * p) / dur);
}
// 当前周期里经过的时间
export const phaseIn = (t, period, offset = 0) => mod(t - offset, period);

// 颜色加深（amt 0..1）
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(v * (1 - amt));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// ---------- 图标 ----------
const iconCache = {};
export function iconPath(name) {
  if (!iconCache[name]) iconCache[name] = new Path2D(ICONS[name]);
  return iconCache[name];
}

// 以 (cx, cy) 为中心画图标；flip=-1 水平翻转；outline 是白边宽度（当前坐标系单位）
export function icon(g, name, cx, cy, size, rot = 0, flip = 1, color = C.ink, outline = 0, outlineColor = C.paper) {
  g.save();
  g.translate(cx, cy);
  g.rotate(rot);
  g.scale(flip * size / 512, size / 512);
  g.translate(-256, -256);
  if (outline > 0) {
    g.strokeStyle = outlineColor;
    g.lineJoin = 'round';
    g.lineWidth = outline * 2 * 512 / size;
    g.stroke(iconPath(name));
  }
  g.fillStyle = color;
  g.fill(iconPath(name));
  g.restore();
}

// ---------- 图案 ----------
// 图案在当前坐标系中平铺，所以会跟着人物一起移动，不会"游动"
function tile(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'));
  return c;
}
const TILES = {
  halftone: tile(12, 12, (g) => { g.fillStyle = 'rgba(20,18,16,0.55)'; g.beginPath(); g.arc(6, 6, 2.4, 0, Math.PI * 2); g.fill(); }),
  pinstripe: tile(18, 18, (g) => { g.fillStyle = 'rgba(239,232,218,0.28)'; g.fillRect(8, 0, 2, 18); }),
  checks: tile(44, 44, (g) => {
    g.fillStyle = 'rgba(20,18,16,0.32)'; g.fillRect(0, 18, 44, 8); g.fillRect(18, 0, 8, 44);
    g.fillStyle = 'rgba(239,232,218,0.3)'; g.fillRect(0, 40, 44, 2); g.fillRect(40, 0, 2, 44);
  }),
  dotsBlue: tile(40, 40, (g) => {
    g.fillStyle = C.blue;
    g.beginPath(); g.arc(10, 10, 5, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(30, 30, 5, 0, Math.PI * 2); g.fill();
  }),
  weave: tile(10, 10, (g) => { g.fillStyle = 'rgba(239,232,218,0.12)'; g.fillRect(0, 0, 5, 1); g.fillRect(5, 5, 5, 1); }),
};
const patterns = new Map();
export function pattern(g, key) {
  if (!patterns.has(key)) patterns.set(key, g.createPattern(TILES[key], 'repeat'));
  return patterns.get(key);
}

// ---------- 带阴影的衣服 ----------
// 光从左上方来：衣服右侧（背光面）加一块锯齿边的阴影，阴影里加网点，阴影边缘加两条白色褶线
export function garment(g, path, color, { pat = null, top = -720, bottom = 0, edge = 14, folds = true } = {}) {
  g.fillStyle = color;
  g.fill(path);
  g.save();
  g.clip(path);
  if (pat) { g.fillStyle = pattern(g, pat); g.fill(path); }
  g.beginPath();
  g.moveTo(edge, top - 40);
  let k = 0;
  for (let y = top; y <= bottom + 40; y += 64, k++) g.lineTo(edge + (k % 2 ? 16 : -10) + k * 2, y);
  g.lineTo(400, bottom + 60);
  g.lineTo(400, top - 60);
  g.closePath();
  g.fillStyle = 'rgba(20,18,16,0.42)';
  g.fill();
  g.fillStyle = pattern(g, 'halftone');
  g.fill();
  if (folds) {
    g.strokeStyle = 'rgba(247,241,227,0.55)';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(edge - 6, top + 120); g.quadraticCurveTo(edge - 24, (top + bottom) / 2, edge - 14, bottom - 20); g.stroke();
    g.beginPath(); g.moveTo(edge - 40, top + 260); g.quadraticCurveTo(edge - 52, (top + bottom) / 2 + 80, edge - 46, bottom - 10); g.stroke();
  }
  g.restore();
}

// ---------- 纸张质感（静态，只生成一次） ----------
export function makePaper() {
  return tile(W, H, (g) => {
    g.fillStyle = C.paper;
    g.fillRect(0, 0, W, H);
    // 大块的淡污渍
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 9; i++) {
      const x = rnd() * W, y = rnd() * H, r = 160 + rnd() * 420;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(88,96,100,0.11)');
      grd.addColorStop(1, 'rgba(88,96,100,0)');
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // 纸纤维
    g.strokeStyle = 'rgba(70,78,82,0.08)';
    g.lineWidth = 1;
    for (let i = 0; i < 500; i++) {
      const x = rnd() * W, y = rnd() * H, a = rnd() * Math.PI, l = 6 + rnd() * 18;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    // 四角压暗
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
    v.addColorStop(0, 'rgba(20,24,28,0)');
    v.addColorStop(1, 'rgba(20,24,28,0.26)');
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
  });
}

// ---------- 飞行的乌鸦（剪影，翅尖有分开的飞羽） ----------
// flap 取 -1..1：-1 翅膀在下，1 翅膀在上；dir=1 朝右飞
export function flyingCrow(g, x, y, size, flap, dir = 1, color = C.ink) {
  g.save();
  g.translate(x, y);
  g.scale(dir * size / 100, size / 100);
  g.fillStyle = color;
  // 身体、头、嘴
  g.beginPath(); g.ellipse(0, 0, 34, 12, -0.08, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(32, -5, 10, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(38, -9); g.lineTo(56, -3); g.lineTo(38, 1); g.fill();
  // 尾羽
  g.beginPath(); g.moveTo(-28, -4); g.lineTo(-58, -12); g.lineTo(-62, 6); g.lineTo(-28, 6); g.fill();
  // 翅膀：先画一只向上张开的翅膀（前缘弧线、翅尖五根分开的飞羽、后缘回到身体），
  // 再按 flap 在竖直方向缩放：1 是翅膀在上，0 是展平，-1 是翅膀在下
  const wing = (k) => {
    g.beginPath();
    g.moveTo(16, -2);                                             // 前缘根部（肩）
    g.quadraticCurveTo(14, -40 * k, -6 * k, -74 * k);             // 前缘到翅尖
    const fingers = [[-6, -74], [-16, -70], [-24, -63], [-31, -54], [-37, -44]];
    for (let i = 1; i < fingers.length; i++) {                    // 翅尖的飞羽：每根之间切一个小口
      const [x0, y0] = fingers[i - 1], [x1, y1] = fingers[i];
      g.lineTo((x0 + x1) / 2 * k + 5, (y0 + y1) / 2 * k + 9 * k);
      g.lineTo(x1 * k, y1 * k);
    }
    g.quadraticCurveTo(-30 * k, -22 * k, -12, -2);                // 后缘回到身体
    g.closePath();
    g.fill();
  };
  for (const side of [1, 0]) {
    g.save();
    g.fillStyle = side ? shade(color, -0.6) : color;              // 远侧翅膀略浅
    g.scale(1, (side ? 0.8 : 1) * (Math.abs(flap) < 0.06 ? 0.06 * Math.sign(flap || 1) : flap));
    wing(side ? 0.85 : 1);
    g.restore();
  }
  g.restore();
}
