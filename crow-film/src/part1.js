// 第一段（0–16.875 秒）：一列不同的普通人沿对角线排开，每人做着自己的小事。
// 镜头从队尾木桩上的乌鸦开始，匀速沿队列移到队首；前景和背景按不同速度移动，做出景深。
import {
  W, H, BAR, C, lin, smooth, mix, wave, pulse, phaseIn, mod, shade,
  icon, iconPath, makePaper, flyingCrow, garment,
} from './draw.js';
import { person } from './figures.js';

export const PART1_END = 16.875;

// ---------- 队列和镜头 ----------
const DIR = [-0.941, 0.339];                       // 从队尾（右上）指向队首（左下）
const FEET0 = [0, 880];
const feetAt = (s) => [FEET0[0] + DIR[0] * s, FEET0[1] + DIR[1] * s];
const FIRST = 330, SPACING = 465;
const ZOOM = 1.5;
const SC = [W / 2, 1150];                           // 屏幕上的镜头中心
const CAM_OFFSET = [-40, -380];                     // 让当前位置的人脚落在屏幕 (600, 1720)
const SIGMA0 = -191, SIGMA1 = 3571;                 // 镜头沿队列的起点和终点（起点让乌鸦在画面左侧，睁眼时完整可见）
const sigma = (t) => mix(SIGMA0, SIGMA1, lin(t, 0, PART1_END));   // 线性：全程匀速
const SPEED_PX = ((SIGMA1 - SIGMA0) / PART1_END) * ZOOM;          // 主镜头在屏幕上的速度，约 315 px/s
const SCREEN_DIR = [-DIR[0], -DIR[1]];              // 镜头前进时，画面里的东西朝右上移动

const paper = makePaper();

// ---------- 乌鸦（站姿，来自 raven 图标） ----------
// 图标朝右，脚在图标坐标 (300, 480) 附近，眼睛在 (354, 62)
function perchedCrow(g, x, footY, size, { face = -1, peck = 0, eyeOpen = 1, glint = true } = {}) {
  const k = size / 512;
  g.save();
  g.translate(x, footY);
  g.rotate(-face * peck);                           // 啄食时身体向前倾
  g.scale(face * k, k);
  g.translate(-300, -480);
  const p = iconPath('raven');
  g.fillStyle = C.ink;
  g.fill(p);
  g.save();
  g.clip(p);
  const hl = g.createRadialGradient(290, 170, 10, 290, 170, 190);
  hl.addColorStop(0, 'rgba(247,241,227,0.22)');
  hl.addColorStop(1, 'rgba(247,241,227,0)');
  g.fillStyle = hl;
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(247,241,227,0.5)';
  g.lineWidth = 5;
  g.lineCap = 'round';
  for (let i = 0; i < 4; i++) {                     // 翅膀上的羽毛层次
    g.beginPath(); g.moveTo(240 + i * 22, 150 + i * 26); g.quadraticCurveTo(190 + i * 18, 300, 175 + i * 22, 440); g.stroke();
  }
  for (let i = 0; i < 5; i++) {                     // 胸口的小羽毛
    g.beginPath(); g.moveTo(330 + (i % 2) * 18, 170 + i * 34); g.lineTo(345 + (i % 2) * 18, 182 + i * 34); g.stroke();
  }
  g.restore();
  // 眼睛：白色眼圈（原图镂空）+ 黑色瞳孔 + 反光；眼睑从上往下盖住，睁眼时向上收起
  g.fillStyle = C.ink;
  g.beginPath(); g.arc(354, 62, 9, 0, Math.PI * 2); g.fill();
  if (glint) { g.fillStyle = C.cream; g.beginPath(); g.arc(350, 57, 3.5, 0, Math.PI * 2); g.fill(); }
  if (eyeOpen < 1) { g.fillStyle = C.ink; g.beginPath(); g.arc(354, 62 - 46 * eyeOpen, 23, 0, Math.PI * 2); g.fill(); }
  g.restore();
}

// ---------- 队尾：木桩和乌鸦 ----------
function postAndCrow(g, t) {
  const [x, y] = feetAt(0);
  const top = y - 300;
  g.fillStyle = 'rgba(20,18,16,0.14)';
  g.beginPath(); g.ellipse(x + 50, y - 4, 90, 14, 0, 0, Math.PI * 2); g.fill();
  const post = new Path2D();
  post.moveTo(x - 26, y); post.lineTo(x - 24, top + 10); post.lineTo(x, top - 8); post.lineTo(x + 24, top + 10); post.lineTo(x + 26, y); post.closePath();
  garment(g, post, C.brown, { top, bottom: y, edge: x + 4, folds: false });
  g.strokeStyle = 'rgba(20,18,16,0.45)'; g.lineWidth = 2;
  for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(x - 14 + i * 8, top + 30 + i * 40); g.quadraticCurveTo(x - 18 + i * 8, (top + y) / 2, x - 12 + i * 8, y - 20); g.stroke(); }
  const hop = pulse(t, 2 * BAR, BAR * 1.5, 0.45);
  const peck = 0.18 * pulse(t, BAR, BAR * 0.75, 0.5) * lin(t, 2.0, 2.5);
  perchedCrow(g, x + 4, top - 30 * hop, 340, { face: -1, peck, eyeOpen: smooth(t, 0.6, 1.7) });
}

// ---------- 地上的乌鸦 ----------
const GROUND_CROWS = [
  { s: 790, phase: 0.2, size: 200 },
  { s: 1730, phase: 0.9, size: 220 },
  { s: 2650, phase: 0.5, size: 190 },
];
function groundCrow(g, c, t) {
  const [fx, fy] = feetAt(c.s);
  // 每两小节向前跳一步（累计位移，保证连续）
  const period = 2 * BAR;
  const k = Math.floor((t - c.phase) / period);
  const ph = phaseIn(t, period, c.phase);
  const step = 48 * (k + smooth(ph, 0, 0.32));
  const hopY = -26 * Math.sin(Math.PI * lin(ph, 0, 0.32));
  const peck = 0.6 * pulse(t, BAR, c.phase + 0.9, 0.42);
  // 每四小节回头看一次：水平缩放经过 0，看起来像转身
  const turn = smooth(phaseIn(t, 4 * BAR, c.phase + 1.2), 0, 0.3) - smooth(phaseIn(t, 4 * BAR, c.phase + 1.2), 1.4, 1.7);
  const face = -Math.cos(Math.PI * turn);
  g.fillStyle = 'rgba(20,18,16,0.12)';
  g.beginPath(); g.ellipse(fx - step + 20, fy + 30, 60, 9, 0, 0, Math.PI * 2); g.fill();
  perchedCrow(g, fx - step, fy + 30 + hopY, c.size, { face: Math.abs(face) < 0.08 ? 0.08 * Math.sign(face || 1) : face, peck });
}

// ---------- 八个人 ----------
// 顺序从队尾到队首。每个人的动作周期都是小节的整数倍，动作重点落在小节线上。
const note = (g, x, y, a) => {
  g.save(); g.globalAlpha = a; g.fillStyle = C.ink; g.strokeStyle = C.ink; g.lineWidth = 4;
  g.beginPath(); g.ellipse(x, y, 13, 9, -0.4, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(x + 11, y - 4); g.lineTo(x + 11, y - 56); g.quadraticCurveTo(x + 30, y - 44, x + 28, y - 26); g.stroke();
  g.restore();
};

const PEOPLE = [
  {
    name: '放风筝的女孩',
    spec: { scale: 0.66, dress: true, dressLen: -250, coat: C.light, pattern: 'dotsBlue', hat: 'braid' },
    pose(t) {
      const pull = pulse(t, BAR, 0, 0.9);
      const wind = wave(t, BAR * 1.5);
      const hand = [118, -880 + 60 * pull];
      return {
        headTilt: 0.22, hairWave: wind, hemWave: wind,
        backArm: [[34, -650], [80, -770], hand],
        arm: [[-24, -660], [-46, -560], [-30, -500]],
        behind(g) {
          // 风筝在女孩右上方、乌鸦的上方，风筝线从乌鸦头顶上越过
          const kx = 650 + 40 * wave(t, 3.75), ky = -1600 - 40 * pull + 20 * wave(t, 2.5);
          const size = 400;
          const ax = kx - size * 0.12, ay = ky + size * 0.22;
          g.strokeStyle = C.ink; g.lineWidth = 3;
          g.beginPath(); g.moveTo(hand[0], hand[1]);
          g.quadraticCurveTo((hand[0] + ax) / 2 + 70, (hand[1] + ay) / 2 + 90 - 60 * pull, ax, ay); g.stroke();
          icon(g, 'kite', kx, ky, size, 0.12 + 0.08 * wave(t, 3.75), 1, C.red, 7);
        },
      };
    },
  },
  {
    name: '踢石子的男孩',
    spec: { scale: 0.74, coat: C.warm, pattern: 'checks', coatLen: 420, hat: 'schoolCap', hatColor: C.char, legs: C.char },
    pose(t) {
      const kick = pulse(t, 2 * BAR, BAR * 0.5, 0.7);
      const ph = phaseIn(t, 2 * BAR, BAR * 0.5);
      return {
        kick: [-80 * kick, -50 * kick], lean: 0.035 * kick,
        arm: [[-24, -660], [-34 - 24 * kick, -545], [-40 - 34 * kick, -445 + 12 * kick]],
        behind(g) { icon(g, 'backpack', 66, -560, 220, 0, 1, C.green, 6); },
        ground(g) {
          let x = -70, y = -12, a = 1;
          if (ph >= 0.35 && ph < 2.6) {
            const d = ph - 0.35;
            x = -70 - 320 * (1 - Math.exp(-1.6 * d));
            y = -12 - 46 * Math.abs(Math.sin(d * 7)) * Math.exp(-2.5 * d);
            a = 1 - lin(d, 1.5, 2.1);
          } else if (ph >= 2.6) a = lin(ph, 3.0, 3.6);
          g.globalAlpha = a; g.fillStyle = C.ink;
          g.beginPath(); g.ellipse(x, y, 14, 10, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = C.light; g.beginPath(); g.arc(x - 4, y - 4, 3, 0, Math.PI * 2); g.fill();
          g.globalAlpha = 1;
        },
      };
    },
  },
  {
    name: '掰面包的面包师',
    spec: { scale: 1.0, coat: C.char, pattern: 'weave', coatLen: 360, apron: true, hat: 'flatCap', hatColor: C.ink },
    pose(t) {
      const brk = pulse(t, 2 * BAR, BAR, 1.2);
      const ph = phaseIn(t, 2 * BAR, BAR);
      const hand = [mix(-110, -170, brk), mix(-555, -515, brk)];
      return {
        headTilt: -0.1,
        backArmFront: true,
        backArm: [[34, -660], [44, -560], [-20, -545]],
        arm: [[-24, -660], [-72, -585], hand],
        prop(g) { icon(g, 'bread', -40, -548, 290, 0.62, 1, C.mustard, 6); },
        over(g) {
          const a = smooth(ph, 0.15, 0.35) * (1 - smooth(ph, 1.0, 1.3));
          if (a > 0) {
            g.globalAlpha = a; g.fillStyle = C.mustard;
            g.beginPath(); g.ellipse(hand[0] - 12, hand[1] - 8, 26, 16, 0.3, 0, Math.PI * 2); g.fill();
            g.globalAlpha = 1;
          }
          if (ph > 0.45 && ph < 1.7) {                  // 面包屑落下
            const d = ph - 0.45;
            g.fillStyle = C.mustard;
            g.globalAlpha = 1 - lin(d, 0.8, 1.25);
            for (let i = 0; i < 5; i++) {
              g.beginPath(); g.arc(-120 - i * 14 - 30 * d, -530 + 0.5 * 1100 * d * d * (0.8 + i * 0.1), 4, 0, Math.PI * 2); g.fill();
            }
            g.globalAlpha = 1;
          }
        },
      };
    },
  },
  {
    name: '看报纸的男人',
    spec: { scale: 1.02, coat: C.char, pattern: 'pinstripe', coatLen: 330, hat: 'fedora', hatColor: C.warm, legs: C.char },
    pose(t) {
      const ph = phaseIn(t, 2 * BAR, BAR * 1.5);
      const ang = Math.PI * smooth(ph, 0, 0.9);
      const pageA = 1 - smooth(ph, 0.85, 1.15);
      return {
        headTilt: -0.12,
        backArmFront: true,
        backArm: [[34, -660], [-10, -590], [-78, -575]],
        arm: [[-24, -660], [-130, -610], [-238, -628]],
        prop(g) {
          // 报纸：浅灰底、黑色标题、灰色文字行、一张小图
          g.fillStyle = C.light;
          g.beginPath(); g.moveTo(-250, -772); g.lineTo(-70, -742); g.lineTo(-70, -500); g.lineTo(-250, -522); g.closePath(); g.fill();
          g.fillStyle = C.ink; g.beginPath(); g.moveTo(-238, -752); g.lineTo(-84, -727); g.lineTo(-84, -705); g.lineTo(-238, -730); g.fill();
          g.fillStyle = C.warm; g.fillRect(-232, -700, 60, 52);
          g.strokeStyle = C.warm; g.lineWidth = 3;
          for (let i = 0; i < 7; i++) {
            const y = -690 + i * 22;
            g.beginPath(); g.moveTo(i < 3 ? -164 : -236, y + (i < 3 ? 4 : 10)); g.lineTo(-86, y + 26); g.stroke();
          }
          if (ph < 1.15) {                               // 翻页：页面绕书脊转过去
            const c = Math.cos(ang), lift = -24 * Math.sin(ang);
            const ex = -70 - 180 * c;
            g.globalAlpha = pageA;
            g.fillStyle = shade('#e3dccd', 0.25 * (1 - Math.abs(c)));
            g.beginPath(); g.moveTo(-70, -742); g.lineTo(ex, -772 + lift); g.lineTo(ex, -522 + lift); g.lineTo(-70, -500); g.closePath(); g.fill();
            g.strokeStyle = 'rgba(20,18,16,0.35)'; g.lineWidth = 2; g.stroke();
            g.globalAlpha = 1;
          }
        },
      };
    },
  },
  {
    name: '拉小提琴的青年',
    spec: { scale: 1.03, coat: '#23201d', coatLen: 300, hat: 'shortHair', scarf: C.blue, legs: C.char },
    pose(t) {
      const bow = wave(t, BAR);
      // 琴弓和琴弦大致垂直，弓杆沿 u 方向来回拉
      const u = [0.42, 0.91];
      const K = [10, -690];
      const o = 110 * bow;
      const frog = [K[0] + u[0] * (o + 150), K[1] + u[1] * (o + 150)];
      return {
        headTilt: -0.18, hairWave: wave(t, BAR * 1.5),
        backArmFront: true,
        backArm: [[34, -660], [100, -600], frog],
        arm: [[-24, -660], [-110, -690], [-180, -735]],
        prop(g) {
          // 琴架在肩上，琴颈朝左前方伸出，左手握住琴颈末端
          icon(g, 'violin', -40, -690, 250, -0.5, -1, C.brown, 6);
          // 琴弓
          const a = [K[0] + u[0] * (o - 175), K[1] + u[1] * (o - 175)];
          const b = [K[0] + u[0] * (o + 165), K[1] + u[1] * (o + 165)];
          g.strokeStyle = C.ink; g.lineWidth = 6; g.lineCap = 'round';
          g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
          g.strokeStyle = C.light; g.lineWidth = 2;
          g.beginPath(); g.moveTo(a[0] + 5, a[1] - 8); g.lineTo(b[0] + 5, b[1] - 8); g.stroke();
        },
        over(g) {                                        // 飘出的音符
          for (const off of [0, BAR / 2]) {
            const p = phaseIn(t, BAR, off) / 1.7;
            if (p < 1) note(g, 60 + 120 * p, -900 - 280 * p, smooth(p, 0, 0.12) * (1 - smooth(p, 0.6, 1)));
          }
        },
      };
    },
  },
  {
    name: '抱婴儿的母亲',
    spec: { scale: 0.94, dress: true, dressLen: -80, coat: C.warm, shawl: C.brown },
    pose(t) {
      const rock = wave(t, 2 * BAR);
      return {
        lean: 0.03 * rock, headTilt: -0.26 + 0.04 * rock, hemWave: 0.6 * wave(t, BAR, 0.2),
        arm: [[-24, -660], [-70, -560], [-150, -600]],
        prop(g) {
          g.save();
          g.translate(-110, -612); g.rotate(-0.25 + 0.08 * rock);
          const b = new Path2D(); b.ellipse(0, 0, 92, 52, 0, 0, Math.PI * 2);
          garment(g, b, C.cream, { top: -60, bottom: 60, edge: 20, folds: false });
          g.strokeStyle = 'rgba(20,18,16,0.35)'; g.lineWidth = 2.5;
          g.beginPath(); g.moveTo(-40, -40); g.quadraticCurveTo(0, 0, 50, 40); g.stroke();
          g.beginPath(); g.moveTo(-10, -48); g.quadraticCurveTo(30, -10, 80, 10); g.stroke();
          g.fillStyle = C.ink; g.beginPath(); g.arc(-74, -24, 27, 0, Math.PI * 2); g.fill();     // 婴儿的头
          g.fillStyle = C.blue; g.beginPath(); g.arc(-70, -34, 26, Math.PI * 0.95, Math.PI * 2.05); g.fill(); // 小帽子
          g.restore();
        },
      };
    },
  },
  {
    name: '撑伞的老人',
    spec: { scale: 0.96, coat: C.warm, pattern: 'weave', coatLen: 300, hat: 'bowler', hatColor: C.ink, hunch: 18, legs: C.char },
    pose(t) {
      const gust = pulse(t, 2 * BAR, BAR * 1.2, 1.0);
      const sway = 0.06 * wave(t, 2 * BAR, 0.1) + 0.12 * gust;
      const hand = [-80 + 30 * sway, -840];
      const down = [[34, -660], [54, -545], [50, -445]], up = [[34, -660], [-14, -760], [-60, -872]];
      return {
        headTilt: 0.12 * gust,
        backArm: down.map((p, i) => [mix(p[0], up[i][0], gust), mix(p[1], up[i][1], gust)]),
        arm: [[-30, -660], [-72, -720], hand],
        over(g) {
          g.save(); g.translate(hand[0], hand[1]); g.rotate(sway);
          icon(g, 'umbrella', 0, -150, 450, 0, 1, C.green);
          g.restore();
        },
      };
    },
  },
  {
    name: '闻向日葵的女人',
    spec: { scale: 0.95, dress: true, dressLen: -70, coat: C.blue, hat: 'longHair' },
    pose(t) {
      const smell = pulse(t, 2 * BAR, BAR * 0.6, 1.6);
      const hand = [mix(-100, -84, smell), mix(-575, -650, smell)];
      const sway = wave(t, BAR * 1.5);
      const F = [hand[0] + mix(-40, -24, smell) + 6 * sway, hand[1] + mix(-210, -150, smell)];
      return {
        headTilt: -0.22 * smell, hairWave: wave(t, BAR * 1.5, 0.3), hemWave: wave(t, BAR, 0.5),
        arm: [[-24, -660], [-66, -570 - 30 * smell], hand],
        over(g) {
          g.strokeStyle = C.green; g.lineWidth = 8;
          g.beginPath(); g.moveTo(hand[0], hand[1] + 14); g.quadraticCurveTo(hand[0] - 24, (hand[1] + F[1]) / 2, F[0], F[1]); g.stroke();
          g.fillStyle = C.green; g.beginPath(); g.ellipse(hand[0] - 26, hand[1] - 70, 26, 10, -0.7, 0, Math.PI * 2); g.fill();
          g.fillStyle = C.brown; g.beginPath(); g.arc(F[0], F[1], 34, 0, Math.PI * 2); g.fill();
          icon(g, 'sunflower', F[0], F[1], 210, 0.1 * sway, 1, C.mustard);
          for (const off of [0, 0.9]) {                   // 被风吹落的花瓣
            const p = phaseIn(t, BAR, off) / 1.8;
            if (p < 1) {
              g.save(); g.globalAlpha = smooth(p, 0, 0.1) * (1 - smooth(p, 0.7, 1));
              g.translate(F[0] + 60 + 380 * p, F[1] - 20 - 90 * p + 30 * Math.sin(p * 9)); g.rotate(p * 7);
              g.fillStyle = C.mustard; g.beginPath(); g.ellipse(0, 0, 16, 6, 0, 0, Math.PI * 2); g.fill();
              g.restore();
            }
          }
        },
      };
    },
  },
];

// ---------- 背景：远处一列浅灰的小人（速度是主镜头的 0.45 倍） ----------
function background(g, shift) {
  g.fillStyle = C.light;
  const ax = 760, ay = 1180;
  for (let i = -12; i < 40; i++) {
    const x = ax + DIR[0] * i * 150 + SCREEN_DIR[0] * shift;
    const y = ay + DIR[1] * i * 150 + SCREEN_DIR[1] * shift;
    if (x < -60 || x > W + 60) continue;
    const k = 0.9 + (i * 37 % 5) * 0.05;         // 高矮略有不同
    // 小人：两条腿、外套、头，部分戴帽子
    g.fillRect(x - 9 * k, y - 46 * k, 7 * k, 46 * k);
    g.fillRect(x + 2 * k, y - 46 * k, 7 * k, 46 * k);
    g.beginPath();
    g.moveTo(x - 16 * k, y - 40 * k); g.lineTo(x - 12 * k, y - 104 * k); g.quadraticCurveTo(x, y - 112 * k, x + 12 * k, y - 104 * k);
    g.lineTo(x + 16 * k, y - 40 * k); g.closePath(); g.fill();
    g.beginPath(); g.arc(x - 1 * k, y - 122 * k, 11 * k, 0, Math.PI * 2); g.fill();
    if (i % 3 === 0) { g.fillRect(x - 16 * k, y - 132 * k, 30 * k, 4 * k); g.fillRect(x - 10 * k, y - 144 * k, 18 * k, 12 * k); }
  }
  g.strokeStyle = C.light; g.lineWidth = 2;
  const l0 = [ax + DIR[0] * -12 * 150 + SCREEN_DIR[0] * shift, ay + DIR[1] * -12 * 150 + SCREEN_DIR[1] * shift];
  const l1 = [ax + DIR[0] * 40 * 150 + SCREEN_DIR[0] * shift, ay + DIR[1] * 40 * 150 + SCREEN_DIR[1] * shift];
  g.beginPath(); g.moveTo(l0[0], l0[1]); g.lineTo(l1[0], l1[1]); g.stroke();
}

// 远处的鸟群
function distantBirds(g, t) {
  g.strokeStyle = C.warm; g.lineWidth = 3; g.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const x = mod(200 + i * 70 + 60 * t, W + 400) - 200;
    const y = 300 + (i % 3) * 40 + 12 * Math.sin(t * 1.3 + i);
    const f = 8 * Math.sin(t * 7 + i);
    g.beginPath(); g.moveTo(x - 14, y - f); g.quadraticCurveTo(x - 6, y - 4, x, y); g.quadraticCurveTo(x + 6, y - 4, x + 14, y - f); g.stroke();
  }
}

// ---------- 风里飘的花瓣、叶子、纸片 ----------
function windDebris(g, t, shift) {
  for (let i = 0; i < 22; i++) {
    const type = i % 3;
    const x = mod(i * 173 + 150 * t + SCREEN_DIR[0] * shift * 1.2, W + 300) - 150;
    const y = mod(i * 311 + 26 * Math.sin(t * 0.8 + i) + SCREEN_DIR[1] * shift * 1.2 - 18 * t, H + 200) - 100;
    g.save();
    g.translate(x, y);
    g.rotate(t * (0.8 + (i % 5) * 0.4) + i);
    if (type === 0) { g.fillStyle = C.mustard; g.beginPath(); g.ellipse(0, 0, 14, 5, 0, 0, Math.PI * 2); g.fill(); }
    else if (type === 1) {
      g.fillStyle = C.green; g.beginPath(); g.ellipse(0, 0, 20, 8, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = C.paper; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-16, 0); g.lineTo(16, 0); g.stroke();
    } else {
      g.fillStyle = C.light; g.fillRect(-14, -10, 28, 20);
      g.strokeStyle = C.warm; g.lineWidth = 1.5;
      for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(-10, -5 + k * 5); g.lineTo(10, -5 + k * 5); g.stroke(); }
    }
    g.restore();
  }
}

// ---------- 前景：草、电线杆、飞过的乌鸦（速度是主镜头的 2.3 倍，带景深模糊） ----------
const FG_K = 2.3;
const fgLayer = document.createElement('canvas');
fgLayer.width = W; fgLayer.height = H;
const fg = fgLayer.getContext('2d');
const POLE_TIMES = [3.6, 9.6, 14.6];

function foreground(g, t, shift) {
  const v = SPEED_PX * FG_K * SCREEN_DIR[0];      // 前景横向速度
  fg.clearRect(0, 0, W, H);
  // 草
  for (let i = 0; i < 44; i++) {
    const x = mod(i * 37 + shift * FG_K * SCREEN_DIR[0], W + 240) - 120;
    const h = 90 + ((i * 53) % 7) * 22;
    const bend = 18 * wave(t + i * 0.13, 2.5) + 24;
    fg.strokeStyle = i % 3 === 0 ? C.ink : shade(C.green, (i % 2) * 0.35);
    fg.lineWidth = 9 + (i % 3) * 3; fg.lineCap = 'round';
    fg.beginPath(); fg.moveTo(x, H + 10); fg.quadraticCurveTo(x + bend * 0.3, H - h * 0.6, x + bend, H - h); fg.stroke();
  }
  // 电线杆
  for (const T of POLE_TIMES) {
    const x = W / 2 + v * (t - T);
    if (x < -120 || x > W + 120) continue;
    fg.fillStyle = 'rgba(20,18,16,0.9)';
    fg.fillRect(x - 28, 0, 56, H);
    fg.fillRect(x - 150, 210, 300, 18);
    for (const dx of [-120, -60, 60, 120]) { fg.fillStyle = C.char; fg.fillRect(x + dx - 6, 182, 12, 30); }
  }
  g.save();
  g.filter = 'blur(5px)';
  g.drawImage(fgLayer, 0, 0);
  g.restore();
  // 第 7–9.5 秒，一只乌鸦从镜头前飞过
  const p = lin(t, 7.0, 9.5);
  if (p > 0 && p < 1) {
    g.save();
    g.filter = 'blur(1.5px)';
    flyingCrow(g, 1300 - 1750 * p, 420 + 180 * p + 20 * Math.sin(p * 12), 420, Math.sin((2 * Math.PI * t) / 0.469), -1);
    g.restore();
  }
}

// ---------- 合成 ----------
export function part1(g, t) {
  g.drawImage(paper, 0, 0);
  const sig = sigma(t);
  const shift = (sig - SIGMA0) * ZOOM;              // 主镜头已经移动的屏幕距离

  background(g, shift * 0.45);
  distantBirds(g, t);

  const cam = feetAt(sig);
  g.save();
  g.translate(SC[0], SC[1]);
  g.scale(ZOOM, ZOOM);
  g.translate(-(cam[0] + CAM_OFFSET[0]), -(cam[1] + CAM_OFFSET[1]));

  // 地面线
  const a = feetAt(-400), b = feetAt(FIRST + PEOPLE.length * SPACING + 600);
  g.strokeStyle = C.ink; g.lineWidth = 2;
  g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();

  // 按队列位置从后往前画：木桩、人、地上的乌鸦
  const items = [{ s: 0, draw: () => postAndCrow(g, t) }];
  PEOPLE.forEach((p, i) => {
    const s = FIRST + i * SPACING;
    items.push({ s, draw: () => { const [x, y] = feetAt(s); person(g, x, y, p.spec, p.pose(t)); } });
  });
  GROUND_CROWS.forEach((c) => items.push({ s: c.s, draw: () => groundCrow(g, c, t) }));
  items.sort((p, q) => p.s - q.s).forEach((it) => it.draw());
  g.restore();

  windDebris(g, t, shift);
  foreground(g, t, shift);

  // 开头两拍从黑色淡入
  const fade = 1 - lin(t, 0, 0.94);
  if (fade > 0) { g.fillStyle = `rgba(20,18,16,${fade})`; g.fillRect(0, 0, W, H); }
}
