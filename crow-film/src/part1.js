// 第一段（0–16.875 秒）：白底，一列不同的普通人沿对角线排开。
// 镜头从队尾的乌鸦开始，匀速沿队列移向队首。16.875 秒副歌进入时停在队首。
import { W, H, C, lin, mix, icon, figure } from './draw.js';

export const PART1_END = 16.875;

// 队列方向：从右上（队尾）指向左下（队首）
const DIR = [-0.941, 0.339];
const FEET0 = [0, 880];
const SPACING = 340;
const FIRST = 300;
const feetAt = (s) => [FEET0[0] + DIR[0] * s, FEET0[1] + DIR[1] * s];

// 镜头：从乌鸦开始，线性移到队首的女人。ZOOM 是画面放大倍数。
// 起点让乌鸦在画面上部，终点让女人站在画面中下部。
const ZOOM = 1.3;
const SCREEN_CENTER = [W / 2, 1150];
const CAM0 = [183, 330];
const CAM1 = (() => { const f = feetAt(FIRST + 5 * SPACING); return [f[0] + 40, f[1] - (1640 - 1150) / ZOOM]; })();

// 乌鸦和电线
const WIRE_Y = (x) => 0.03 * x;
const CROW = { x: 60, size: 260 };

// 六个人，从队尾到队首
const PEOPLE = [
  { name: '放风筝的女孩', scale: 0.66, hat: 'braid', dress: true, dressLen: -250,
    arm: [[-20, -650], [-56, -760], [-80, -880]], prop: 'kite' },
  { name: '背书包的男孩', scale: 0.74, hat: 'schoolCap', coatLen: 430,
    arm: [[-24, -660], [-36, -545], [-40, -440]], prop: 'backpack' },
  { name: '面包师', scale: 1.0, hat: 'flatCap', coatLen: 360, apron: true,
    arm: [[-24, -660], [-30, -560], [-82, -520]], prop: 'bread' },
  { name: '拉小提琴的青年', scale: 1.03, hat: 'shortHair', coatLen: 300,
    arm: [[-24, -660], [-60, -560], [-46, -500]], prop: 'violin' },
  { name: '撑伞的老人', scale: 0.96, hat: 'bowler', coatLen: 300, hunch: 18,
    arm: [[-30, -660], [-70, -720], [-78, -840]], prop: 'umbrella' },
  { name: '拿向日葵的女人', scale: 0.95, hat: 'longHair', dress: true, dressLen: -70,
    arm: [[-24, -660], [-66, -570], [-100, -575]], prop: 'sunflower' },
];

function drawPerson(g, p, i, t) {
  const [x, y] = feetAt(FIRST + i * SPACING);
  const s = p.scale;
  // 背在身后的道具先画，会被身体挡住一部分
  if (p.prop === 'backpack') icon(g, 'backpack', x + 62 * s, y - 560 * s, 190 * s);
  const [hx, hy] = figure(g, x, y, p);
  switch (p.prop) {
    case 'kite': {
      // 风筝以 7.5 秒为周期缓慢摆动
      const sway = Math.sin((t / 7.5) * Math.PI * 2);
      const kx = hx - 170 + 14 * sway, ky = hy - 420 + 8 * sway;
      const size = 240;
      g.strokeStyle = C.black; g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(hx, hy);
      g.quadraticCurveTo(hx - 20, ky + 260, kx - size * 0.36, ky + size * 0.4);
      g.stroke();
      icon(g, 'kite', kx, ky, size, 0.05 * sway);
      break;
    }
    case 'bread':
      icon(g, 'bread', hx + 30, hy - 10, 260 * s, 0.55, 1, C.black, 4);
      break;
    case 'violin': {
      // 青年把小提琴抱在胸前，琴身斜着压在外套上，用白边和身体分开
      const size = 300 * s;
      icon(g, 'violin', hx + 10, hy - 60, size, -0.35, -1, C.black, 5);
      break;
    }
    case 'umbrella': {
      // 手握在伞柄弯钩上方
      const size = 430 * s;
      icon(g, 'umbrella', hx + 4, hy - size * 0.30, size);
      break;
    }
    case 'sunflower': {
      g.strokeStyle = C.black; g.lineWidth = 7;
      const fx = hx - 40, fy = hy - 210;
      g.beginPath(); g.moveTo(hx, hy + 10); g.quadraticCurveTo(hx - 30, hy - 100, fx, fy); g.stroke();
      icon(g, 'sunflower', fx, fy, 190 * s, 0, 1, C.black, 3);
      break;
    }
  }
}

function drawCrow(g, t) {
  const { x, size } = CROW;
  const y = WIRE_Y(x);
  const cy = y - size * 0.47;
  icon(g, 'raven', x, cy, size, 0, -1);
  // 眼睛在 1.0–2.5 秒之间慢慢睁开：用黑色"眼睑"盖住原图的白色眼睛，再逐渐收起
  const open = lin(t, 1.5, 3.0);
  const ex = x - (EYE[0] - 256) * size / 512, ey = cy + (EYE[1] - 256) * size / 512;
  const r = 18 * size / 512;
  g.fillStyle = C.black;
  g.beginPath(); g.ellipse(ex, ey - r * open * 2.6, r * 1.25, r * 1.25, 0, 0, Math.PI * 2); g.fill();
}
// 乌鸦图标中眼睛的位置和半径（图标坐标 0–512），由像素扫描测得：中心约 (354, 62)，半径约 18
const EYE = [354, 62];

export function part1(g, t) {
  g.fillStyle = C.white;
  g.fillRect(0, 0, W, H);

  const p = lin(t, 0, PART1_END);
  const cam = [mix(CAM0[0], CAM1[0], p), mix(CAM0[1], CAM1[1], p)];
  g.save();
  g.translate(SCREEN_CENTER[0], SCREEN_CENTER[1]);
  g.scale(ZOOM, ZOOM);
  g.translate(-cam[0], -cam[1]);

  // 电线
  g.strokeStyle = C.black; g.lineWidth = 3;
  g.beginPath(); g.moveTo(-1600, WIRE_Y(-1600)); g.lineTo(1600, WIRE_Y(1600)); g.stroke();
  drawCrow(g, t);

  // 队列脚下的一条细线
  const a = feetAt(-300), b = feetAt(380 + PEOPLE.length * SPACING + 400);
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();

  PEOPLE.forEach((person, i) => drawPerson(g, person, i, t));
  g.restore();

  // 开头 1 个小节从黑色淡入
  const fade = 1 - lin(t, 0, 1.875);
  if (fade > 0) { g.fillStyle = `rgba(11,11,11,${fade})`; g.fillRect(0, 0, W, H); }
}
