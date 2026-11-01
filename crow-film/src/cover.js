// 封面：B站 16:9（1920×1080）和抖音 9:16（1080×1920）。
// 画面元素都来自片子本身：齐步走的士兵、正在化成灰的士兵、地上留下的影子、乌鸦。
import { C, makePaper } from './draw.js';
import { person } from './figures.js';
import { PEOPLE, DIR, blendSpec, marchPose, drawShadow, ash, perchedCrow, MARCH_T0 } from './queue.js';
import { BEAT } from './draw.js';

export const TITLE = '留影';
const SERIF = '"CoverSerif", "Noto Serif SC", "Source Han Serif SC", "Songti SC", STSong, SimSun, serif';
const SANS = '"CoverSans", "Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
const CREAM = '#e6e5dd';
const SHADOW = '#21050a';

// 下标：0 女孩、1 男孩、2 面包师、3 看报男人、4 青年、5 母亲、6 老人、7 女人
const GIRL = 0, BOY = 1, BAKER = 2, NEWS = 3, VIOLIN = 4, MOTHER = 5, OLD = 6, WOMAN = 7;
const POSE_T = MARCH_T0 + 2.5 * BEAT;     // 齐步走中迈开一大步的瞬间，所有士兵同一步

// ---------- 背景：红色的纸 ----------
const paper = makePaper();
function redPaper(g, w, h) {
  g.save();
  if (w > h) { g.translate(w, 0); g.rotate(Math.PI / 2); g.drawImage(paper, 0, 0, h, w); }
  else g.drawImage(paper, 0, 0, w, h);
  g.restore();
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = C.red; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(200,210,215,0.11)'; g.fillRect(0, 0, w, h);
  g.restore();
  const sky = g.createLinearGradient(0, 0, 0, h * 0.55);
  sky.addColorStop(0, 'rgba(28,32,36,0.46)');
  sky.addColorStop(1, 'rgba(28,32,36,0)');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(10,2,4,0)');
  v.addColorStop(1, 'rgba(10,2,4,0.42)');
  g.fillStyle = v; g.fillRect(0, 0, w, h);
}

function grain(g, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const o = c.getContext('2d');
  const img = o.createImageData(w, h);
  let seed = 7;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 16807) % 2147483647;
    const v = (seed / 2147483647) * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  o.putImageData(img, 0, 0);
  g.save(); g.globalAlpha = 0.06; g.globalCompositeOperation = 'overlay'; g.drawImage(c, 0, 0); g.restore();
}

const hash = (n) => { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };
// 空中飘的灰烬
function floatingAsh(g, w, h, n, seed) {
  g.fillStyle = 'rgba(18,19,20,0.75)';
  for (let k = 0; k < n; k++) {
    const x = hash(seed + k) * w, y = hash(seed + k * 7.1) * h * 0.8, s = 3 + hash(seed + k * 3.3) * 8;
    g.save(); g.translate(x, y); g.rotate(hash(k + seed * 2) * 6);
    g.beginPath(); g.moveTo(-s, -s * 0.4); g.lineTo(s * 0.3, -s * 0.7); g.lineTo(s, s * 0.2); g.lineTo(-s * 0.2, s * 0.6); g.closePath(); g.fill();
    g.restore();
  }
}

// 远处一排很小的士兵，排到画面外，表示队伍没有尽头
function farColumn(g, x0, y0, step, n, k) {
  g.fillStyle = 'rgba(40,6,12,0.42)'; g.strokeStyle = 'rgba(40,6,12,0.42)'; g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = x0 - DIR[0] * step * i, y = y0 - DIR[1] * step * i;
    g.fillRect(x - 5 * k, y - 34 * k, 10 * k, 34 * k);
    g.beginPath(); g.arc(x, y - 40 * k, 5 * k, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(x, y - 42 * k, 7 * k, Math.PI, 0); g.fill();
    g.lineWidth = 1.6 * k;
    g.beginPath(); g.moveTo(x - 2 * k, y - 22 * k); g.lineTo(x + 6 * k, y - 66 * k); g.stroke();
  }
}

// 化灰的断口：静帧里一条直线像被切开，改成参差的边
function raggedClip(g, top, seed) {
  g.beginPath();
  g.moveTo(-500, 80);
  g.lineTo(-500, top);
  for (let x = -500; x <= 500; x += 16) {
    g.lineTo(x, top + (hash(seed + x * 0.37) - 0.5) * 44 + Math.sin(x * 0.021 + seed) * 16);
  }
  g.lineTo(500, 80);
  g.closePath();
  g.clip();
}

// ---------- 队列 ----------
// slots：k 是从队首往后数的位置；type 是 soldier（齐步走）、dissolve（正在化成灰，同时露出影子）、shadow（只剩影子）
function column(g, { origin, scale, spacing, slots, crow }) {
  const at = (k) => [origin[0] - DIR[0] * spacing * scale * k, origin[1] - DIR[1] * spacing * scale * k];
  // 地面线
  g.strokeStyle = C.ink; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(origin[0] + DIR[0] * 4000, origin[1] + DIR[1] * 4000); g.lineTo(origin[0] - DIR[0] * 4000, origin[1] - DIR[1] * 4000); g.stroke();
  const local = (k, fn) => { const [x, y] = at(k); g.save(); g.translate(x, y); g.scale(scale, scale); fn(); g.restore(); };
  // 影子在最下层
  slots.forEach((s) => { if (s.shadow !== undefined) local(s.k, () => drawShadow(g, s.shadow, 0, 0, s.shadowA || 0.92)); });
  // 地上的乌鸦，看着影子
  if (crow) local(crow.k, () => perchedCrow(g, crow.dx || 0, 0, 230, { face: crow.face || 1 }));
  // 士兵从后往前画
  [...slots].sort((a, b) => b.k - a.k).forEach((s) => {
    if (s.type !== 'soldier' && s.type !== 'dissolve') return;
    local(s.k, () => {
      const spec = blendSpec(PEOPLE[s.who].spec, 1);
      const pose = marchPose(POSE_T);
      if (s.type === 'soldier') { person(g, 0, 0, spec, pose); return; }
      g.save();
      raggedClip(g, -560, s.who * 13 + 5);                         // 头到胸口已经化掉，断口参差
      person(g, 0, 0, spec, pose);
      g.restore();
      ash(g, s.who, 0, 0, 0, 0.47);
      ash(g, s.who + 20, 30, 0, 0, 0.62);
    });
  });
}

// ---------- 文字 ----------
function text(g, str, x, y, { font, size, color = CREAM, align = 'left', spacing = 0, alpha = 1, weight = 900 }) {
  g.save();
  g.font = `${weight} ${size}px ${font}`;
  g.fillStyle = color;
  g.globalAlpha = alpha;
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  if ('letterSpacing' in g) g.letterSpacing = `${spacing}px`;
  g.fillText(str, x, y);
  g.restore();
}
// 片名：“影”字身后多一层深色的影子
function title(g, x, y, size, align = 'left') {
  g.save();
  g.font = `900 ${size}px ${SERIF}`;
  const w1 = g.measureText(TITLE[0]).width, w2 = g.measureText(TITLE[1]).width;
  g.restore();
  const left = align === 'center' ? x - (w1 + w2) / 2 : x;
  const off = size * 0.07;
  text(g, TITLE[1], left + w1 + off, y + off, { font: SERIF, size, color: SHADOW, alpha: 0.9 });
  text(g, TITLE[0], left, y, { font: SERIF, size });
  text(g, TITLE[1], left + w1, y, { font: SERIF, size });
}

// ---------- B站：1920×1080 ----------
export function renderBili(canvas) {
  canvas.width = 1920; canvas.height = 1080;
  const g = canvas.getContext('2d');
  redPaper(g, 1920, 1080);
  farColumn(g, 1960, 470, 64, 40, 1.0);
  floatingAsh(g, 1920, 1080, 46, 11);
  column(g, {
    origin: [770, 1012], scale: 0.55, spacing: 420,
    slots: [
      { k: 0, type: 'soldier', who: VIOLIN },
      { k: 1, type: 'soldier', who: NEWS },
      { k: 2, shadow: MOTHER },
      { k: 3, type: 'dissolve', who: GIRL, shadow: GIRL, shadowA: 0.9 },
      { k: 4, shadow: BOY },
      { k: 5, shadow: BAKER },          // 面包篮在胸口，不会挡住右上方的风筝影子
    ],
    crow: { k: 2.45, face: 1 },
  });
  // 文字放在左上，避开右下角的时长标记
  title(g, 112, 400, 270);
  g.fillStyle = 'rgba(230,229,221,0.55)'; g.fillRect(118, 452, 470, 3);
  text(g, '一列人走进战争，只留下影子', 116, 540, { font: SANS, size: 46, weight: 500 });
  text(g, '原创动画 · 纯代码绘制 · 一分钟', 118, 606, { font: SANS, size: 30, weight: 500, spacing: 4, alpha: 0.72 });
  grain(g, 1920, 1080);
}

// ---------- 抖音：1080×1920 ----------
// 主页列表会把封面裁成 3:4（中间 1080×1440，上下各裁掉 240），文字都放在这个范围里
export function renderDouyin(canvas) {
  canvas.width = 1080; canvas.height = 1920;
  const g = canvas.getContext('2d');
  redPaper(g, 1080, 1920);
  farColumn(g, 1140, 900, 58, 30, 0.95);
  floatingAsh(g, 1080, 1920, 50, 23);
  column(g, {
    origin: [3, 1442], scale: 0.5, spacing: 380,
    slots: [
      { k: 0, type: 'soldier', who: OLD },
      { k: 1, type: 'soldier', who: NEWS },
      { k: 2, shadow: WOMAN },
      { k: 3, type: 'dissolve', who: GIRL, shadow: GIRL, shadowA: 0.9 },
      { k: 4, shadow: BOY },            // 竖版间距小，个子高的影子会顶到风筝，这里放男孩
      { k: 5, type: 'soldier', who: VIOLIN },
      { k: 6, shadow: MOTHER },
    ],
    crow: { k: 2.5, face: 1 },
  });
  text(g, '别眨眼', 540, 470, { font: SERIF, size: 172, align: 'center', spacing: 10 });
  text(g, '数一数，还剩几个人', 540, 590, { font: SANS, size: 66, weight: 500, align: 'center', spacing: 2 });
  title(g, 540, 1610, 120, 'center');
  grain(g, 1080, 1920);
}

// 封面用的字体（思源 / Noto CJK，SIL OFL 1.1）。字体文件较大（12 MB + 8 MB），不放进仓库：
// 先找本地的 /.fonts 或 fonts/，找不到就从 notofonts/noto-cjk 仓库直接下载，再不行用系统中文字体
const NOTO = 'https://raw.githubusercontent.com/notofonts/noto-cjk/main/';
export async function loadFonts() {
  const tries = [
    ['CoverSerif', ['/.fonts/NotoSerifSC-Black.otf', 'fonts/NotoSerifSC-Black.otf', NOTO + 'Serif/SubsetOTF/SC/NotoSerifSC-Black.otf'], '900'],
    ['CoverSans', ['/.fonts/NotoSansSC-Medium.otf', 'fonts/NotoSansSC-Medium.otf', NOTO + 'Sans/SubsetOTF/SC/NotoSansSC-Medium.otf'], '500'],
  ];
  for (const [name, urls, weight] of tries) {
    for (const u of urls) {
      try { const f = new FontFace(name, `url(${u})`, { weight }); await f.load(); document.fonts.add(f); break; } catch (e) { /* 试下一个 */ }
    }
  }
}
