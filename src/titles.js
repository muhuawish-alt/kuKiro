import { envelope, smoothstep, clamp, easeOutCubic } from './util.js';
import { TITLE_TIME } from './timeline.js';

// Every on-screen text cue. Times are in seconds on the master timeline.
export const CUES = [
  { type: 'studio', a: 0.8, b: 4.6, en: 'KIRO PICTURES', zh: '出品' },
  { type: 'sub', a: 6.6, b: 10.9, zh: '2187 年，深空阵列捕捉到一段来自银河边缘的信号。', en: 'In 2187, the Deep Space Array caught a signal from the edge of the galaxy.' },
  { type: 'sub', a: 11.3, b: 15.2, zh: '它每十一秒重复一次，已经持续了四万年。', en: 'It repeats every eleven seconds. It has for forty thousand years.' },
  { type: 'credit', pos: 'center', a: 17.6, b: 22.2, zh: '一部 KIRO 影片', en: 'A KIRO FILM' },
  { type: 'sub', a: 24.0, b: 29.2, zh: '信号的源头，是一颗不在任何星图上的行星。', en: 'Its source: a planet on no star chart.' },
  { type: 'credit', pos: 'left', a: 31.0, b: 35.6, zh: '配乐 · 浏览器实时合成', en: 'MUSIC SYNTHESIZED LIVE' },
  { type: 'sub', a: 37.2, b: 42.6, zh: '我们派出了「启明号」，和最后的十二名船员。', en: 'We sent the Daybreak, with its last twelve crew.' },
  { type: 'credit', pos: 'right', a: 45.6, b: 50.0, zh: '视觉 · THREE.JS 实时渲染', en: 'VISUALS RENDERED IN REAL TIME' },
  { type: 'sub', a: 53.0, b: 57.4, zh: '穿过风暴，我们终于找到了它。', en: 'Beyond the storm, we finally found it.' },
  { type: 'sub', a: 57.9, b: 62.4, zh: '四万年来，它只说着同一句话。', en: 'For forty thousand years, it said only one thing.' },
  { type: 'sub', a: 64.0, b: 68.6, zh: '直到今天，我们才终于听懂。', en: 'Only today did we understand it.' },
  { type: 'echo', a: 72.7, b: 76.0, zh: '那是我们自己的声音。', en: 'It was our own voice.' },
  { type: 'title', a: TITLE_TIME, b: 86.6 },
  { type: 'tag', a: 81.6, b: 86.6, zh: '二〇二七 · 即将上映', en: 'COMING 2027' },
];

const el = (tag, cls, parent, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
};

export function createTitles(root) {
  const items = CUES.map((c) => {
    const box = el('div', `cue cue-${c.type}${c.pos ? ' pos-' + c.pos : ''}`, root);
    const it = { c, box };
    if (c.type === 'studio') {
      it.en = el('div', 'studio-en', box, c.en);
      it.line = el('div', 'studio-line', box);
      it.zh = el('div', 'studio-zh', box, c.zh);
    } else if (c.type === 'sub') {
      it.zh = el('div', 'sub-zh', box, c.zh);
      it.en = el('div', 'sub-en', box, c.en);
    } else if (c.type === 'credit') {
      it.zh = el('div', 'credit-zh', box, c.zh);
      it.en = el('div', 'credit-en', box, c.en);
    } else if (c.type === 'echo') {
      it.layers = [];
      for (let i = 3; i >= 0; i--) {
        const l = el('div', 'echo-layer' + (i === 0 ? ' main' : ''), box);
        el('div', 'echo-zh', l, c.zh);
        el('div', 'echo-en', l, c.en);
        it.layers.push({ l, i });
      }
    } else if (c.type === 'title') {
      it.flare = el('div', 'title-flare', box);
      it.zh = el('div', 'title-zh', box);
      it.chars = ['回', '声'].map((ch) => el('span', 'title-char', it.zh, ch));
      it.en = el('div', 'title-en', box, 'ECHO');
      it.rule = el('div', 'title-rule', box);
    } else if (c.type === 'tag') {
      it.zh = el('div', 'tag-zh', box, c.zh);
      it.en = el('div', 'tag-en', box, c.en);
    }
    box.style.opacity = '0';
    return it;
  });

  function update(t) {
    for (const it of items) {
      const { c, box } = it;
      const active = t > c.a - 0.05 && t < c.b + 0.05;
      box.style.display = active ? '' : 'none';
      if (!active) continue;
      const lt = t - c.a;
      const dur = c.b - c.a;
      if (c.type === 'studio') {
        const e = envelope(t, c.a, c.a + 1.2, c.b - 1.0, c.b);
        box.style.opacity = e.toFixed(3);
        const ls = 0.42 + 0.18 * (lt / dur);
        it.en.style.letterSpacing = ls.toFixed(3) + 'em';
        it.en.style.filter = `blur(${((1 - smoothstep(0, 1.4, lt)) * 6).toFixed(2)}px)`;
        const sweep = -30 + 160 * smoothstep(0.6, 3.4, lt);
        it.en.style.backgroundPosition = `${sweep.toFixed(1)}% 50%`;
        it.line.style.transform = `scaleX(${easeOutCubic(smoothstep(0.4, 2.6, lt)).toFixed(3)})`;
        it.zh.style.opacity = smoothstep(1.4, 2.4, lt).toFixed(3);
      } else if (c.type === 'sub') {
        const e = envelope(t, c.a, c.a + 0.45, c.b - 0.5, c.b);
        box.style.opacity = e.toFixed(3);
        box.style.filter = `blur(${((1 - e) * 5).toFixed(2)}px)`;
        box.style.transform = `translate(-50%, ${((1 - smoothstep(c.a, c.a + 0.6, t)) * 6).toFixed(2)}px)`;
        it.zh.style.letterSpacing = (0.14 - 0.03 * smoothstep(0, dur, lt)).toFixed(3) + 'em';
      } else if (c.type === 'credit') {
        const e = envelope(t, c.a, c.a + 0.9, c.b - 0.9, c.b);
        box.style.opacity = e.toFixed(3);
        box.style.filter = `blur(${((1 - e) * 6).toFixed(2)}px)`;
        it.en.style.letterSpacing = (0.38 + 0.16 * (lt / dur)).toFixed(3) + 'em';
        it.zh.style.letterSpacing = (0.5 + 0.12 * (lt / dur)).toFixed(3) + 'em';
      } else if (c.type === 'echo') {
        const e = envelope(t, c.a, c.a + 0.6, c.b - 0.8, c.b);
        box.style.opacity = e.toFixed(3);
        for (const { l, i } of it.layers) {
          if (i === 0) {
            l.style.opacity = '1';
            l.style.filter = `blur(${((1 - smoothstep(c.a, c.a + 0.8, t)) * 4).toFixed(2)}px)`;
            continue;
          }
          // echoes expand outward like ripples, delayed per layer
          const age = Math.max(0, lt - 0.35 * i);
          const s = 1 + age * 0.05 * i;
          const o = Math.max(0, 0.5 - age * 0.16) * (1 - i * 0.22);
          l.style.opacity = o.toFixed(3);
          l.style.transform = `translate(-50%, -50%) scale(${s.toFixed(4)})`;
          l.style.filter = `blur(${(age * 2.2 * i).toFixed(2)}px)`;
        }
      } else if (c.type === 'title') {
        const e = envelope(t, c.a, c.a + 0.05, c.b - 1.6, c.b);
        box.style.opacity = e.toFixed(3);
        const hit = Math.exp(-lt * 1.6);
        // characters: slam in from a slightly larger, blurred state then breathe apart
        it.chars.forEach((ch, i) => {
          const k = smoothstep(0.0 + i * 0.12, 0.9 + i * 0.12, lt);
          const sc = 1.18 - 0.18 * easeOutCubic(k) + 0.02 * smoothstep(1, dur, lt);
          ch.style.opacity = k.toFixed(3);
          ch.style.transform = `scale(${sc.toFixed(4)})`;
          ch.style.filter = `blur(${((1 - k) * 10).toFixed(2)}px)`;
        });
        it.zh.style.letterSpacing = (0.42 + 0.16 * smoothstep(0, dur, lt)).toFixed(3) + 'em';
        it.zh.style.textShadow = `0 0 ${(18 + 50 * hit).toFixed(1)}px rgba(120,200,255,${(0.35 + 0.6 * hit).toFixed(3)})`;
        it.en.style.opacity = smoothstep(1.0, 2.4, lt).toFixed(3);
        it.en.style.letterSpacing = (1.1 + 0.5 * smoothstep(1.0, dur, lt)).toFixed(3) + 'em';
        it.rule.style.transform = `scaleX(${easeOutCubic(smoothstep(0.8, 3.0, lt)).toFixed(3)})`;
        it.rule.style.opacity = (0.8 * smoothstep(0.8, 1.6, lt)).toFixed(3);
        const fl = clamp(1 - lt / 2.2);
        it.flare.style.opacity = (Math.pow(fl, 1.5) * 0.95).toFixed(3);
        it.flare.style.transform = `translate(-50%, -50%) scaleX(${(0.2 + 1.6 * easeOutCubic(smoothstep(0, 1.2, lt))).toFixed(3)})`;
      } else if (c.type === 'tag') {
        const e = envelope(t, c.a, c.a + 1.2, c.b - 1.4, c.b);
        box.style.opacity = e.toFixed(3);
        it.en.style.letterSpacing = (0.5 + 0.2 * (lt / dur)).toFixed(3) + 'em';
      }
    }
  }

  return { update };
}
