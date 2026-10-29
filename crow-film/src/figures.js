// 人物剪影。局部坐标：脚底在 (0, 0)，人物朝左（-x 是前方），成年人身高约 820。
// spec 是人物的固定外观，pose 是随时间变化的姿势和道具。
import { C, shade, garment, mix } from './draw.js';

function limb(g, pts, width, color) {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 3) g.quadraticCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1]);
  else for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.stroke();
}

function shoe(g, x, y) {
  g.fillStyle = C.ink;
  g.beginPath(); g.ellipse(x - 14, y - 11, 34, 13, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(247,241,227,0.5)'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(x - 40, y - 16); g.quadraticCurveTo(x - 20, y - 24, x + 4, y - 18); g.stroke();
}

function head(g, hx, hy) {
  g.fillStyle = C.ink;
  g.beginPath(); g.arc(hx, hy, 46, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(hx - 40, hy - 8); g.lineTo(hx - 58, hy + 10); g.lineTo(hx - 40, hy + 16); g.fill(); // 鼻子
  g.beginPath(); g.ellipse(hx - 14, hy + 36, 26, 18, 0, 0, Math.PI * 2); g.fill();                          // 下巴
  g.fillRect(hx - 14, hy + 30, 30, 50);                                                                   // 脖子
  g.strokeStyle = 'rgba(247,241,227,0.6)'; g.lineWidth = 3;
  g.beginPath(); g.arc(hx + 10, hy + 4, 11, -1.2, 1.6); g.stroke();                                       // 耳朵
}

const HATS = {
  flatCap(g, hx, hy, color) {
    g.fillStyle = color;
    g.beginPath(); g.ellipse(hx + 4, hy - 30, 56, 28, -0.08, Math.PI, 0); g.fill();
    g.beginPath(); g.moveTo(hx - 40, hy - 30); g.quadraticCurveTo(hx - 70, hy - 26, hx - 86, hy - 12); g.lineTo(hx - 30, hy - 18); g.fill();
    g.strokeStyle = 'rgba(247,241,227,0.5)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(hx - 30, hy - 40); g.quadraticCurveTo(hx + 10, hy - 58, hx + 50, hy - 38); g.stroke();
  },
  bowler(g, hx, hy, color) {
    g.fillStyle = color;
    g.beginPath(); g.ellipse(hx + 2, hy - 40, 44, 46, 0, Math.PI, 0); g.fill();
    g.fillRect(hx - 42, hy - 44, 88, 14);
    g.beginPath(); g.ellipse(hx + 2, hy - 30, 66, 9, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(247,241,227,0.55)'; g.fillRect(hx - 42, hy - 44, 88, 4);                   // 帽带
  },
  fedora(g, hx, hy, color) {
    g.fillStyle = color;
    g.beginPath(); g.moveTo(hx - 40, hy - 32); g.quadraticCurveTo(hx - 34, hy - 96, hx + 4, hy - 84);
    g.quadraticCurveTo(hx + 42, hy - 96, hx + 46, hy - 32); g.closePath(); g.fill();
    g.beginPath(); g.ellipse(hx + 2, hy - 30, 74, 11, -0.05, 0, Math.PI * 2); g.fill();
    g.fillStyle = C.ink; g.fillRect(hx - 39, hy - 48, 84, 12);                                      // 帽带
  },
  schoolCap(g, hx, hy, color) {
    g.fillStyle = color;
    g.beginPath(); g.ellipse(hx + 2, hy - 28, 50, 30, 0, Math.PI, 0); g.fill();
    g.beginPath(); g.moveTo(hx - 36, hy - 28); g.lineTo(hx - 78, hy - 20); g.lineTo(hx - 30, hy - 14); g.fill();
    g.fillStyle = 'rgba(247,241,227,0.55)'; g.beginPath(); g.arc(hx, hy - 52, 5, 0, Math.PI * 2); g.fill();
  },
  shortHair(g, hx, hy) {
    g.fillStyle = C.ink;
    g.beginPath(); g.ellipse(hx + 8, hy - 18, 52, 42, 0.2, Math.PI * 0.9, Math.PI * 2.15); g.fill();
    g.strokeStyle = 'rgba(247,241,227,0.45)'; g.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(hx - 20 + i * 18, hy - 50); g.quadraticCurveTo(hx + i * 18, hy - 60, hx + 20 + i * 18, hy - 40); g.stroke(); }
  },
  braid(g, hx, hy, color, wind) {
    g.fillStyle = C.ink;
    g.beginPath(); g.ellipse(hx + 8, hy - 12, 52, 44, 0.1, Math.PI * 0.85, Math.PI * 2.2); g.fill();
    limb(g, [[hx + 44, hy], [hx + 76 + 10 * wind, hy + 60], [hx + 70 + 22 * wind, hy + 124]], 16, C.ink);
    g.fillStyle = C.blue; g.beginPath(); g.arc(hx + 70 + 22 * wind, hy + 126, 9, 0, Math.PI * 2); g.fill(); // 发绳
  },
  longHair(g, hx, hy, color, wind) {
    g.fillStyle = C.ink;
    const w = 26 * wind;
    g.beginPath();
    g.moveTo(hx - 40, hy - 20);
    g.quadraticCurveTo(hx - 20, hy - 70, hx + 30, hy - 50);
    g.quadraticCurveTo(hx + 84, hy - 20, hx + 82 + w * 0.5, hy + 90);
    g.quadraticCurveTo(hx + 92 + w, hy + 170, hx + 70 + w * 1.4, hy + 220);
    g.lineTo(hx + 14, hy + 150);
    g.quadraticCurveTo(hx + 30, hy + 40, hx + 10, hy - 10);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(247,241,227,0.4)'; g.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) {
      g.beginPath(); g.moveTo(hx + 30 + i * 12, hy - 40);
      g.quadraticCurveTo(hx + 66 + i * 8 + w * 0.4, hy + 60, hx + 50 + i * 8 + w, hy + 180); g.stroke();
    }
  },
};

const dressAmt = (spec) => (spec.dressAmt !== undefined ? spec.dressAmt : spec.dress ? 1 : 0);
const hemOf = (spec) => (spec.hem !== undefined ? spec.hem : spec.dress ? (spec.dressLen || -170) : -(spec.coatLen || 400));

// 钢盔：圆顶，后沿向下外翻，前沿一道短帽檐
function helmet(g, hx, hy) {
  g.fillStyle = C.ink;
  g.beginPath();
  g.moveTo(hx - 62, hy - 14);
  g.quadraticCurveTo(hx - 58, hy - 30, hx - 48, hy - 34);
  g.quadraticCurveTo(hx - 34, hy - 92, hx + 10, hy - 90);
  g.quadraticCurveTo(hx + 58, hy - 86, hx + 60, hy - 30);
  g.quadraticCurveTo(hx + 66, hy - 6, hx + 78, hy + 10);
  g.lineTo(hx + 46, hy + 4);
  g.quadraticCurveTo(hx + 20, hy - 22, hx - 30, hy - 18);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(247,241,227,0.45)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(hx - 30, hy - 60); g.quadraticCurveTo(hx, hy - 84, hx + 34, hy - 70); g.stroke();
}

// 步枪：从枪托 (0,0) 沿 -y 方向延伸，grow 0..1 控制长出来的长度
export function rifle(g, grow = 1) {
  if (grow <= 0) return;
  const L = 560 * grow;
  g.save();
  g.fillStyle = C.ink;
  // 枪托和护木
  g.beginPath();
  g.moveTo(-16, 0); g.lineTo(16, 0); g.lineTo(10, -Math.min(L, 200)); g.lineTo(-8, -Math.min(L, 200)); g.closePath(); g.fill();
  if (L > 200) {
    g.fillRect(-7, -Math.min(L, 400), 13, Math.min(L, 400) - 200);                 // 护木
    g.fillRect(-4, -L, 7, L - Math.min(L, 400) + 2);                               // 枪管
    g.fillRect(6, -230, 18, 7);                                                     // 枪栓
  }
  if (grow > 0.92) {                                                                 // 刺刀
    const b = (grow - 0.92) / 0.08;
    g.fillStyle = C.light;
    g.beginPath(); g.moveTo(-3, -L); g.lineTo(4, -L); g.lineTo(0.5, -L - 110 * b); g.closePath(); g.fill();
  }
  g.strokeStyle = 'rgba(247,241,227,0.4)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(-6, -20); g.lineTo(0, -Math.min(L, 190)); g.stroke();
  g.restore();
}

function torsoPath(spec, pose, hem) {
  const p = new Path2D();
  const h = spec.hunch || 0;
  // d：0 是外套（直下摆），1 是裙子（外扩、随风摆）；中间值用于变形
  const d = dressAmt(spec);
  const wv = (pose.hemWave || 0) * d;
  p.moveTo(-62 - h * 0.6, -684);
  p.quadraticCurveTo(-86 - h * 0.4, -600, -78, -470);
  p.lineTo(mix(-86, -128, d) + 8 * wv, hem);
  p.quadraticCurveTo(-5, hem + 16 * wv, mix(84, 118, d) + 22 * wv, hem - 8 * wv);
  p.lineTo(76, -470);
  p.quadraticCurveTo(82, -620, 56 - h * 0.4, -684);
  p.quadraticCurveTo(-3 - h * 0.5, -716, -62 - h * 0.6, -684);
  p.closePath();
  return p;
}

// 画一个人。pose 的回调都在人物局部坐标里执行：
//   behind(g)  画在身体后面的道具（书包、风筝）
//   prop(g)    画在前臂下面的道具（小提琴、报纸）
//   over(g)    画在最上层的道具（伞、花）
export function person(g, x, y, spec, pose) {
  const s = spec.scale;
  const coat = spec.coat || C.char;
  g.save();
  g.translate(x, y);
  g.scale(s, s);

  // 地上的影子，偏向右后方
  g.fillStyle = 'rgba(20,18,16,0.14)';
  g.beginPath(); g.ellipse(70, -4, 170, 20, 0, 0, Math.PI * 2); g.fill();
  if (pose.ground) pose.ground(g);   // 地上的小物件（石子），不随上半身倾斜

  // 腿（裙子下露出的细腿，到外套下的粗裤腿，可以连续变化）
  const d = dressAmt(spec);
  const legColor = spec.legs || C.ink;
  const legW = mix(50, 34, d);
  const legTop = mix(-440, -330, d);
  const accA = spec.accA !== undefined ? spec.accA : 1;      // 围裙、披肩、围巾、旧帽子的不透明度
  const helmA = spec.helmet || 0;
  const kick = pose.kick || [0, 0];
  limb(g, [[22, legTop], [26, -20]], legW, shade(legColor, 0.15));
  limb(g, [[-24, legTop], [-26 + kick[0] * 0.4, -230 + kick[1] * 0.4], [-28 + kick[0], -20 + kick[1]]], legW, legColor);
  shoe(g, 22, 0);
  shoe(g, -28 + kick[0], kick[1]);

  // 上半身绕髋部前后倾
  g.save();
  g.translate(0, -440); g.rotate(pose.lean || 0); g.translate(0, 440);
  const hx = -6 - (spec.hunch || 0), hy = -760 + (spec.hunch || 0) * 0.3;

  if (pose.behind) pose.behind(g);
  const backArm = pose.backArm || [[34, -660], [54, -545], [50, -445]];
  if (!pose.backArmFront) limb(g, backArm, 32, shade(coat, 0.35));

  const hem = hemOf(spec);
  garment(g, torsoPath(spec, pose, hem), coat, { pat: spec.pattern, patA: spec.patA !== undefined ? spec.patA : 1, top: -720, bottom: hem });

  // 白色细节：领口、门襟、纽扣、腰带（外套的细节随 1-d 出现，裙子的随 d 出现）
  const a0 = g.globalAlpha;
  g.strokeStyle = 'rgba(247,241,227,0.85)'; g.fillStyle = 'rgba(247,241,227,0.85)';
  g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-34, -686); g.lineTo(-50, -600); g.lineTo(-10, -660); g.stroke();
  if (d < 1) {
    g.globalAlpha = a0 * (1 - d);
    g.beginPath(); g.moveTo(-58, -600); g.lineTo(-68, hem + 6); g.stroke();
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(-46, -590 + i * 48, 4.5, 0, Math.PI * 2); g.fill(); }
    g.beginPath(); g.moveTo(-76, -478); g.lineTo(74, -478); g.stroke();
    g.beginPath(); g.moveTo(-70, -560); g.lineTo(-30, -560); g.stroke();                  // 胸袋
  }
  if (d > 0) {
    g.globalAlpha = a0 * d;
    g.beginPath(); g.moveTo(-76, -470); g.lineTo(72, -470); g.stroke();
  }
  g.globalAlpha = a0 * accA;

  if (spec.apron) {
    const a = new Path2D();
    a.moveTo(-80, -570); a.lineTo(-20, -570); a.lineTo(10, hem + 30); a.lineTo(-92, hem + 30); a.closePath();
    garment(g, a, C.cream, { top: -570, bottom: hem + 30, edge: -30, folds: false });
    g.strokeStyle = C.cream; g.lineWidth = 6;
    g.beginPath(); g.moveTo(-76, -520); g.lineTo(70, -500); g.stroke();                   // 围裙带
  }

  // 头（绕脖子转动）
  g.save();
  g.translate(hx, hy + 40); g.rotate(pose.headTilt || 0); g.translate(-hx, -(hy + 40));
  g.globalAlpha = a0;
  head(g, hx, hy);
  if (spec.hat && helmA < 1) {
    g.globalAlpha = a0 * (1 - helmA);
    HATS[spec.hat](g, hx, hy, spec.hatColor || C.ink, pose.hairWave || 0);
  }
  if (helmA > 0) { g.globalAlpha = a0 * helmA; helmet(g, hx, hy); }
  g.globalAlpha = a0 * accA;
  if (spec.shawl) {
    const sh = new Path2D();
    sh.moveTo(hx - 48, hy + 6);
    sh.quadraticCurveTo(hx - 40, hy - 74, hx + 20, hy - 64);
    sh.quadraticCurveTo(hx + 86, hy - 40, hx + 90, hy + 60);
    sh.lineTo(hx + 30, hy + 50);
    sh.quadraticCurveTo(hx + 30, hy - 30, hx - 20, hy - 28);
    sh.closePath();
    garment(g, sh, spec.shawl, { top: hy - 70, bottom: hy + 60, edge: hx + 30, folds: false });
  }
  g.restore();

  // 披肩下摆（在肩上）
  if (spec.shawl) {
    const cape = new Path2D();
    cape.moveTo(-70, -690); cape.quadraticCurveTo(-5, -730, 70, -690);
    cape.lineTo(96, -560); cape.quadraticCurveTo(10, -530, -92, -570); cape.closePath();
    garment(g, cape, spec.shawl, { top: -720, bottom: -540, edge: 10, folds: false });
    g.strokeStyle = shade(spec.shawl, 0.4); g.lineWidth = 2;
    for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(-86 + i * 24, -566 + i * 2); g.lineTo(-90 + i * 24, -540 + i * 2); g.stroke(); } // 流苏
  }

  if (spec.scarf) {
    const w = pose.hairWave || 0;
    g.fillStyle = spec.scarf;
    g.beginPath(); g.ellipse(-4, -690, 50, 20, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(30, -694); g.quadraticCurveTo(90 + 20 * w, -680, 130 + 36 * w, -640 + 10 * w);
    g.lineTo(120 + 36 * w, -610 + 10 * w); g.quadraticCurveTo(80, -650, 20, -672); g.fill();
    g.strokeStyle = 'rgba(247,241,227,0.5)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-40, -694); g.lineTo(36, -686); g.stroke();
  }

  g.globalAlpha = a0;
  if (pose.backArmFront) limb(g, backArm, 32, shade(coat, 0.2));
  if (pose.prop) pose.prop(g);

  // 前臂、袖口、手
  const arm = pose.arm || [[-24, -660], [-40, -545], [-44, -440]];
  limb(g, arm, 34, coat);
  const hand = arm[arm.length - 1];
  const prev = arm[arm.length - 2];
  const ang = Math.atan2(hand[1] - prev[1], hand[0] - prev[0]);
  g.strokeStyle = 'rgba(247,241,227,0.8)'; g.lineWidth = 3;
  const cx = hand[0] - Math.cos(ang) * 22, cy = hand[1] - Math.sin(ang) * 22;
  g.beginPath(); g.moveTo(cx - Math.sin(ang) * 17, cy + Math.cos(ang) * 17); g.lineTo(cx + Math.sin(ang) * 17, cy - Math.cos(ang) * 17); g.stroke();
  g.fillStyle = C.ink; g.beginPath(); g.arc(hand[0], hand[1], 18, 0, Math.PI * 2); g.fill();
  const bh = backArm[backArm.length - 1];
  if (pose.backArmFront) { g.beginPath(); g.arc(bh[0], bh[1], 17, 0, Math.PI * 2); g.fill(); }

  if (pose.over) pose.over(g);
  g.restore(); // 前倾
  g.restore();
}
