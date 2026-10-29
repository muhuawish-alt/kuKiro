// 通用绘图工具：颜色、图标、人物剪影。
import { ICONS } from './icons.js';

export const W = 1080, H = 1920;
export const C = {
  black: '#0b0b0b',
  white: '#f2efe8',
  red: '#b3001b',
  grey: '#8a8780',
};

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lin = (t, t0, t1) => clamp((t - t0) / (t1 - t0));
export const smooth = (t, t0, t1) => { const x = lin(t, t0, t1); return x * x * (3 - 2 * x); };
export const mix = (a, b, p) => a + (b - a) * p;

// ---------- 图标 ----------
const iconCache = {};
function iconPath(name) {
  if (!iconCache[name]) iconCache[name] = new Path2D(ICONS[name]);
  return iconCache[name];
}

// 以 (cx, cy) 为中心画图标；size 是图标边长；flip=-1 水平翻转
// outline 是白色描边的屏幕像素宽度：道具压在黑色身体上时，用白边把两者分开
export function icon(g, name, cx, cy, size, rot = 0, flip = 1, color = C.black, outline = 0) {
  g.save();
  g.translate(cx, cy);
  g.rotate(rot);
  g.scale(flip * size / 512, size / 512);
  g.translate(-256, -256);
  if (outline > 0) {
    g.strokeStyle = C.white;
    g.lineJoin = 'round';
    g.lineWidth = outline * 2 * 512 / size;
    g.stroke(iconPath(name));
  }
  g.fillStyle = color;
  g.fill(iconPath(name));
  g.restore();
}

// ---------- 人物剪影 ----------
// 局部坐标：脚底在 (0, 0)，人物朝左（-x 是前方），成年人身高约 820。
// 剪影是黑色平涂，细节用白色细线，参考《喜鹊谋杀案》片头的插画方式。

function limb(g, pts, width) {
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.stroke();
}

function shoe(g, x) {
  g.beginPath();
  g.ellipse(x - 14, -11, 34, 13, 0, 0, Math.PI * 2);
  g.fill();
}

function head(g, hx, hy) {
  g.beginPath(); g.arc(hx, hy, 46, 0, Math.PI * 2); g.fill();
  // 鼻子和下巴
  g.beginPath(); g.moveTo(hx - 40, hy - 8); g.lineTo(hx - 58, hy + 10); g.lineTo(hx - 40, hy + 16); g.fill();
  g.beginPath(); g.ellipse(hx - 14, hy + 36, 26, 18, 0, 0, Math.PI * 2); g.fill();
  // 脖子
  g.fillRect(hx - 14, hy + 30, 30, 50);
}

const HATS = {
  flatCap(g, hx, hy) {
    g.beginPath(); g.ellipse(hx + 4, hy - 30, 54, 26, -0.08, Math.PI, 0); g.fill();
    g.beginPath(); g.moveTo(hx - 40, hy - 30); g.quadraticCurveTo(hx - 70, hy - 26, hx - 84, hy - 14); g.lineTo(hx - 30, hy - 18); g.fill();
  },
  bowler(g, hx, hy) {
    g.beginPath(); g.ellipse(hx + 2, hy - 40, 44, 46, 0, Math.PI, 0); g.fill();
    g.fillRect(hx - 42, hy - 44, 88, 14);
    g.beginPath(); g.ellipse(hx + 2, hy - 30, 66, 9, 0, 0, Math.PI * 2); g.fill();
  },
  schoolCap(g, hx, hy) {
    g.beginPath(); g.ellipse(hx + 2, hy - 28, 50, 30, 0, Math.PI, 0); g.fill();
    g.beginPath(); g.moveTo(hx - 36, hy - 28); g.lineTo(hx - 76, hy - 20); g.lineTo(hx - 30, hy - 14); g.fill();
  },
  shortHair(g, hx, hy) {
    g.beginPath(); g.ellipse(hx + 8, hy - 18, 50, 40, 0.2, Math.PI * 0.9, Math.PI * 2.15); g.fill();
  },
  braid(g, hx, hy) {
    g.beginPath(); g.ellipse(hx + 8, hy - 12, 52, 44, 0.1, Math.PI * 0.85, Math.PI * 2.2); g.fill();
    g.lineWidth = 16; g.lineCap = 'round';
    g.beginPath(); g.moveTo(hx + 44, hy); g.quadraticCurveTo(hx + 66, hy + 60, hx + 52, hy + 120); g.stroke();
  },
  longHair(g, hx, hy) {
    g.beginPath();
    g.moveTo(hx - 40, hy - 20);
    g.quadraticCurveTo(hx - 20, hy - 70, hx + 30, hy - 50);
    g.quadraticCurveTo(hx + 80, hy - 20, hx + 70, hy + 90);
    g.quadraticCurveTo(hx + 70, hy + 170, hx + 50, hy + 200);
    g.lineTo(hx + 10, hy + 150);
    g.quadraticCurveTo(hx + 30, hy + 40, hx + 10, hy - 10);
    g.closePath(); g.fill();
  },
};

// spec: { scale, hat, dress, coatLen, arm, hunch }
// arm 是前臂的关键点（局部坐标），返回手的位置，方便挂道具
export function figure(g, x, y, spec) {
  const s = spec.scale;
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.fillStyle = C.black;
  g.strokeStyle = C.black;
  const hunch = spec.hunch || 0;          // 老人略微前倾
  const hx = -6 - hunch, hy = -760 + hunch * 0.3;

  // 腿和鞋
  const legTop = spec.dress ? -330 : -440;
  limb(g, [[-24, legTop], [-28, -20]], 50);
  limb(g, [[20, legTop], [26, -20]], 50);
  shoe(g, -28); shoe(g, 22);

  // 后臂：藏在身体后面，只露出一点轮廓，让身形更饱满
  limb(g, [[34, -660], [52, -540], [50, -440]], 32);

  // 躯干：外套或连衣裙
  const hem = spec.dress ? (spec.dressLen || -170) : -(spec.coatLen || 400);
  g.beginPath();
  g.moveTo(-62 - hunch * 0.6, -684);
  g.quadraticCurveTo(-86 - hunch * 0.4, -600, -78, -470);
  if (spec.dress) { g.lineTo(-128, hem); g.lineTo(118, hem); } else { g.lineTo(-86, hem); g.lineTo(84, hem); }
  g.lineTo(76, -470);
  g.quadraticCurveTo(82, -620, 56 - hunch * 0.4, -684);
  g.quadraticCurveTo(-3 - hunch * 0.5, -716, -62 - hunch * 0.6, -684);
  g.fill();

  // 头和帽子/头发
  head(g, hx, hy);
  if (spec.hat) HATS[spec.hat](g, hx, hy);

  // 前臂
  const arm = spec.arm || [[-24, -660], [-40, -540], [-44, -430]];
  limb(g, arm, 34);
  const hand = arm[arm.length - 1];
  g.beginPath(); g.arc(hand[0], hand[1], 18, 0, Math.PI * 2); g.fill();

  // 白色细节线
  g.strokeStyle = C.white; g.fillStyle = C.white; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-30 - hunch * 0.5, -684); g.lineTo(-46, -600); g.stroke();           // 领口
  if (!spec.dress) {
    g.beginPath(); g.moveTo(-58, -600); g.lineTo(-68, hem + 6); g.stroke();                       // 门襟
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(-46, -590 + i * 48, 4, 0, Math.PI * 2); g.fill(); }
    g.beginPath(); g.moveTo(-76, -478); g.lineTo(74, -478); g.stroke();                           // 腰带
  } else {
    g.beginPath(); g.moveTo(-76, -470); g.lineTo(72, -470); g.stroke();                           // 腰线
    g.beginPath(); g.moveTo(-112, hem + 20); g.lineTo(104, hem + 20); g.stroke();                 // 裙摆边
  }
  if (spec.apron) {
    g.beginPath(); g.moveTo(-74, -560); g.lineTo(-86, hem + 30); g.lineTo(24, hem + 30); g.stroke();
  }
  g.restore();
  // 返回手在世界坐标中的位置
  return [x + hand[0] * s, y + hand[1] * s];
}
