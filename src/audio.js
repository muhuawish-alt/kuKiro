import { mulberry32 } from './util.js';
import { PINGS, DRUM_HITS, DRUM_BEAT, BEAM_TIME, TITLE_TIME, DURATION } from './timeline.js';

// ---------------------------------------------------------------------------
// The score, synthesized with Web Audio. buildScore() schedules the whole film
// onto any BaseAudioContext (realtime or offline) starting at timeline `offset`.
// ---------------------------------------------------------------------------

const NOTE = {
  D1: 36.71, A1: 55.0, Bb1: 58.27, D2: 73.42, F2: 87.31, G2: 98.0, A2: 110.0, Bb2: 116.54, C3: 130.81,
  D3: 146.83, Eb3: 155.56, F3: 174.61, G3: 196.0, A3: 220.0, Bb3: 233.08, C4: 261.63, D4: 293.66,
  F4: 349.23, G4: 392.0, A4: 440.0, C5: 523.25, D5: 587.33, A5: 880.0, B5: 987.77, E6: 1318.51, D6: 1174.66,
};

function makeNoise(ctx, seconds, rand) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = rand() * 2 - 1;
  }
  return buf;
}

function makeImpulse(ctx, seconds, decay, rand) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const k = i / len;
      d[i] = (rand() * 2 - 1) * Math.pow(1 - k, decay) * (i < 200 ? i / 200 : 1);
    }
  }
  return buf;
}

function shaperCurve(k) {
  const n = 2048;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return c;
}

export function buildScore(ctx, destination, { startAt = ctx.currentTime + 0.05, offset = 0 } = {}) {
  const rand = mulberry32(1234);
  // events already in the past (when seeking) collapse to t=0, i.e. "apply immediately"
  const T = (tl) => Math.max(0, startAt + (tl - offset));
  const live = (end) => end > offset - 0.01;
  const sources = [];
  const track = (s) => (sources.push(s), s);

  // ---- bus ----
  const master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.01;
  comp.release.value = 0.35;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.1;
  master.connect(comp);
  comp.connect(limiter);
  limiter.connect(destination);

  const MV = 0.9;
  const mg = master.gain;
  mg.setValueAtTime(MV, T(0));
  mg.setValueAtTime(MV, T(71.92));
  mg.linearRampToValueAtTime(0.0001, T(72.0));
  mg.setValueAtTime(0.0001, T(72.45));
  mg.linearRampToValueAtTime(MV, T(72.6));
  mg.setValueAtTime(MV, T(86.0));
  mg.linearRampToValueAtTime(0.0001, T(DURATION));

  const verb = ctx.createConvolver();
  verb.buffer = makeImpulse(ctx, 5.5, 2.6, rand);
  const verbOut = ctx.createGain();
  verbOut.gain.value = 0.6;
  verb.connect(verbOut);
  verbOut.connect(master);

  // the "echo" that gives the film its name
  const echoIn = ctx.createGain();
  const delay = ctx.createDelay(2);
  delay.delayTime.value = 0.42;
  const fb = ctx.createGain();
  fb.gain.value = 0.5;
  const fbLP = ctx.createBiquadFilter();
  fbLP.type = 'lowpass';
  fbLP.frequency.value = 2400;
  echoIn.connect(delay);
  delay.connect(fbLP);
  fbLP.connect(fb);
  fb.connect(delay);
  const echoOut = ctx.createStereoPanner();
  echoOut.pan.value = 0.35;
  fbLP.connect(echoOut);
  echoOut.connect(master);
  const echoVerb = ctx.createGain();
  echoVerb.gain.value = 0.5;
  fbLP.connect(echoVerb);
  echoVerb.connect(verb);

  const noiseBuf = makeNoise(ctx, 4, rand);
  const send = (node, amt, target = verb) => {
    const g = ctx.createGain();
    g.gain.value = amt;
    node.connect(g);
    g.connect(target);
  };
  const noise = (a, b) => {
    const s = track(ctx.createBufferSource());
    s.buffer = noiseBuf;
    s.loop = true;
    s.start(T(a), (rand() * 3) % 3);
    s.stop(T(b));
    return s;
  };
  const osc = (type, f, a, b, detune = 0) => {
    const o = track(ctx.createOscillator());
    o.type = type;
    o.frequency.setValueAtTime(f, T(a));
    o.detune.value = detune;
    o.start(T(a));
    o.stop(T(b));
    return o;
  };

  // ---- instruments ----
  function pad(notes, a, b, { gain = 0.05, cut = [300, 1200, 500], atk = 3, rel = 3, type = 'sawtooth', det = 9, rev = 0.6, q = 0.7 } = {}) {
    if (!live(b + rel)) return;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(cut[0], T(a));
    f.frequency.linearRampToValueAtTime(cut[1], T((a + b) / 2));
    f.frequency.linearRampToValueAtTime(cut[2], T(b + rel));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, T(a));
    g.gain.linearRampToValueAtTime(gain, T(a + atk));
    g.gain.setValueAtTime(gain, T(b));
    g.gain.linearRampToValueAtTime(0.0001, T(b + rel));
    f.connect(g);
    g.connect(master);
    send(g, rev);
    notes.forEach((n, i) => {
      for (const d of [-det, det]) {
        const o = osc(type, n, a, b + rel + 0.1, d + (rand() - 0.5) * 4);
        const p = ctx.createStereoPanner();
        p.pan.value = (i % 2 ? 1 : -1) * (d > 0 ? 0.45 : 0.2);
        o.connect(p);
        p.connect(f);
      }
    });
  }

  function ping(t, gain = 0.12) {
    if (!live(t + 6)) return;
    const motif = [[NOTE.A5, 0], [NOTE.E6, 0.16], [NOTE.B5, 0.5]];
    motif.forEach(([f, dt], i) => {
      const g = ctx.createGain();
      const s = t + dt;
      g.gain.setValueAtTime(0.0001, T(s));
      g.gain.linearRampToValueAtTime(gain * (i === 2 ? 0.8 : 1), T(s + 0.005));
      g.gain.exponentialRampToValueAtTime(0.0001, T(s + 1.4));
      const o = osc('sine', f, s, s + 1.5);
      const o2 = osc('triangle', f * 2.001, s, s + 1.5);
      const g2 = ctx.createGain();
      g2.gain.value = 0.15;
      o.connect(g);
      o2.connect(g2);
      g2.connect(g);
      const p = ctx.createStereoPanner();
      p.pan.value = [-0.3, 0.3, 0][i];
      g.connect(p);
      p.connect(master);
      send(p, 0.9, echoIn);
      send(p, 0.5);
    });
  }

  function boom(t, gain = 0.5, f0 = 60, f1 = 28, dur = 2.5) {
    if (!live(t + dur)) return;
    const o = osc('sine', f0, t, t + dur + 0.1);
    o.frequency.exponentialRampToValueAtTime(f1, T(t + 0.9));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, T(t));
    g.gain.linearRampToValueAtTime(gain, T(t + 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, T(t + dur));
    o.connect(g);
    g.connect(master);
    send(g, 0.25);
    const n = noise(t, t + 1.0);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(gain * 0.5, T(t));
    ng.gain.exponentialRampToValueAtTime(0.0001, T(t + 0.8));
    n.connect(lp);
    lp.connect(ng);
    ng.connect(master);
    send(ng, 0.4);
  }

  function braam(t, notes, gain = 0.3, dur = 5) {
    if (!live(t + dur)) return;
    const shaper = ctx.createWaveShaper();
    shaper.curve = shaperCurve(3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 4;
    lp.frequency.setValueAtTime(120, T(t));
    lp.frequency.exponentialRampToValueAtTime(2400, T(t + 0.12));
    lp.frequency.exponentialRampToValueAtTime(380, T(t + dur * 0.55));
    lp.frequency.exponentialRampToValueAtTime(120, T(t + dur));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, T(t));
    g.gain.linearRampToValueAtTime(gain, T(t + 0.04));
    g.gain.exponentialRampToValueAtTime(gain * 0.4, T(t + dur * 0.4));
    g.gain.exponentialRampToValueAtTime(0.0001, T(t + dur));
    const pre = ctx.createGain();
    pre.gain.value = 0.5;
    pre.connect(shaper);
    shaper.connect(lp);
    lp.connect(g);
    g.connect(master);
    send(g, 0.45);
    for (const n of notes) {
      for (const d of [-7, 0, 7]) {
        const o = osc('sawtooth', n, t, t + dur + 0.1, d);
        o.connect(pre);
      }
    }
  }

  function riser(a, b, gain = 0.2) {
    if (!live(b)) return;
    const n = noise(a, b + 0.05);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(300, T(a));
    bp.frequency.exponentialRampToValueAtTime(7000, T(b));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, T(a));
    g.gain.exponentialRampToValueAtTime(gain, T(b - 0.02));
    g.gain.linearRampToValueAtTime(0.0001, T(b + 0.04));
    n.connect(bp);
    bp.connect(g);
    g.connect(master);
    send(g, 0.4);
    const o = osc('sawtooth', 110, a, b + 0.05);
    o.frequency.exponentialRampToValueAtTime(1760, T(b));
    const olp = ctx.createBiquadFilter();
    olp.type = 'lowpass';
    olp.frequency.value = 2200;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, T(a));
    og.gain.exponentialRampToValueAtTime(gain * 0.12, T(b - 0.02));
    og.gain.linearRampToValueAtTime(0.0001, T(b + 0.04));
    o.connect(olp);
    olp.connect(og);
    og.connect(master);
    send(og, 0.6);
  }

  function swell(a, b, gain = 0.14) {
    if (!live(b + 0.3)) return;
    const n = noise(a, b + 0.3);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, T(a));
    g.gain.exponentialRampToValueAtTime(gain, T(b));
    g.gain.exponentialRampToValueAtTime(0.0001, T(b + 0.25));
    n.connect(hp);
    hp.connect(g);
    g.connect(master);
    send(g, 0.5);
  }

  function crash(t, gain = 0.15, dur = 2.5) {
    if (!live(t + dur)) return;
    const n = noise(t, t + dur);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, T(t));
    g.gain.linearRampToValueAtTime(gain, T(t + 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, T(t + dur));
    n.connect(hp);
    hp.connect(g);
    g.connect(master);
    send(g, 0.7);
  }

  function rumble(a, b, peak, gain = 0.5) {
    if (!live(b)) return;
    const n = noise(a, b);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 85;
    lp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, T(a));
    g.gain.exponentialRampToValueAtTime(gain, T(peak));
    g.gain.exponentialRampToValueAtTime(0.0001, T(b));
    n.connect(lp);
    lp.connect(g);
    g.connect(master);
    const o = osc('sine', 38, a, b);
    const lfo = osc('sine', 0.6, a, b);
    const lg = ctx.createGain();
    lg.gain.value = 6;
    lfo.connect(lg);
    lg.connect(o.frequency);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, T(a));
    og.gain.exponentialRampToValueAtTime(gain * 0.5, T(peak));
    og.gain.exponentialRampToValueAtTime(0.0001, T(b));
    o.connect(og);
    og.connect(master);
  }

  function whoosh(t, dur, gain = 0.25, f = [200, 1600, 300], pan = [-0.8, 0.8]) {
    if (!live(t + dur)) return;
    const n = noise(t, t + dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(f[0], T(t));
    bp.frequency.exponentialRampToValueAtTime(f[1], T(t + dur * 0.6));
    bp.frequency.exponentialRampToValueAtTime(f[2], T(t + dur));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, T(t));
    g.gain.exponentialRampToValueAtTime(gain, T(t + dur * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, T(t + dur));
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(pan[0], T(t));
    p.pan.linearRampToValueAtTime(pan[1], T(t + dur));
    n.connect(bp);
    bp.connect(g);
    g.connect(p);
    p.connect(master);
    send(p, 0.4);
  }

  function wind(a, b, gain = 0.08) {
    if (!live(b)) return;
    const n = noise(a, b);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    bp.frequency.value = 700;
    const lfo = osc('sine', 0.17, a, b);
    const lg = ctx.createGain();
    lg.gain.value = 380;
    lfo.connect(lg);
    lg.connect(bp.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, T(a));
    g.gain.linearRampToValueAtTime(gain, T(a + 1.2));
    g.gain.setValueAtTime(gain, T(b - 1.5));
    g.gain.linearRampToValueAtTime(0.0001, T(b));
    n.connect(bp);
    bp.connect(g);
    g.connect(master);
    send(g, 0.3);
  }

  function taiko(t, v = 1) {
    if (!live(t + 1.2)) return;
    const o = osc('sine', 150, t, t + 1.1);
    o.frequency.exponentialRampToValueAtTime(46, T(t + 0.2));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, T(t));
    g.gain.linearRampToValueAtTime(0.55 * v, T(t + 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, T(t + 1.0));
    o.connect(g);
    g.connect(master);
    send(g, 0.35);
    const n = noise(t, t + 0.12);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 0.8;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.25 * v, T(t));
    ng.gain.exponentialRampToValueAtTime(0.0001, T(t + 0.09));
    n.connect(bp);
    bp.connect(ng);
    ng.connect(master);
    send(ng, 0.5);
  }

  function pluck(t, f, gain = 0.03) {
    if (!live(t + 0.6)) return;
    const o = osc('sawtooth', f, t, t + 0.6);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 6;
    lp.frequency.setValueAtTime(3200, T(t));
    lp.frequency.exponentialRampToValueAtTime(260, T(t + 0.22));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, T(t));
    g.gain.linearRampToValueAtTime(gain, T(t + 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, T(t + 0.5));
    o.connect(lp);
    lp.connect(g);
    g.connect(master);
    send(g, 0.35, echoIn);
    send(g, 0.25);
  }

  function heartbeat(t, gain = 0.35) {
    if (!live(t + 0.4)) return;
    const o = osc('sine', 75, t, t + 0.35);
    o.frequency.exponentialRampToValueAtTime(38, T(t + 0.1));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, T(t));
    g.gain.linearRampToValueAtTime(gain, T(t + 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, T(t + 0.3));
    o.connect(g);
    g.connect(master);
  }

  // Formant "voice": a vowel-shaped sawtooth phrase, the reveal that the signal is human.
  function voice(a, gain = 0.09) {
    const b = a + 2.8;
    if (!live(b + 6)) return;
    const o = osc('sawtooth', NOTE.A3, a, b + 0.2);
    const contour = [[0, NOTE.A3], [0.7, NOTE.C4], [1.5, NOTE.A3], [2.2, NOTE.G3]];
    contour.forEach(([dt, f]) => o.frequency.linearRampToValueAtTime(f, T(a + dt + 0.08)));
    const vib = osc('sine', 5.4, a, b + 0.2);
    const vg = ctx.createGain();
    vg.gain.value = 9;
    vib.connect(vg);
    vg.connect(o.detune);
    const vowels = { a: [800, 1150, 2900], o: [450, 800, 2830], e: [400, 2000, 2550] };
    const seq = [['a', 0], ['o', 0.8], ['e', 1.6], ['a', 2.3]];
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, T(a));
    out.gain.linearRampToValueAtTime(gain, T(a + 0.15));
    out.gain.linearRampToValueAtTime(gain * 0.35, T(a + 0.75));
    out.gain.linearRampToValueAtTime(gain, T(a + 0.9));
    out.gain.linearRampToValueAtTime(gain * 0.35, T(a + 1.5));
    out.gain.linearRampToValueAtTime(gain, T(a + 1.65));
    out.gain.linearRampToValueAtTime(0.0001, T(b));
    for (let k = 0; k < 3; k++) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = [9, 11, 13][k];
      seq.forEach(([v, dt], i) => {
        const f = vowels[v][k];
        if (i === 0) bp.frequency.setValueAtTime(f, T(a));
        else bp.frequency.linearRampToValueAtTime(f, T(a + dt));
      });
      const kg = ctx.createGain();
      kg.gain.value = [1.0, 0.6, 0.25][k] * 3;
      o.connect(bp);
      bp.connect(kg);
      kg.connect(out);
    }
    out.connect(master);
    send(out, 1.0, echoIn);
    send(out, 0.8);
  }

  // ---- arrangement ----
  // Studio card
  pad([NOTE.D2, NOTE.A2], 0.4, 4.4, { gain: 0.045, cut: [180, 520, 260], atk: 2.5, rel: 2.5 });
  boom(0.8, 0.22, 48, 30, 3.5);

  // Deep space
  pad([NOTE.D2, NOTE.A2, NOTE.D3, NOTE.F3], 4.6, 15.6, { gain: 0.04, cut: [240, 950, 420], atk: 3.5, rel: 2.0 });
  pad([NOTE.D5, NOTE.A5], 7.5, 15.0, { gain: 0.006, cut: [2000, 4000, 2000], type: 'triangle', atk: 4, rel: 2, rev: 1.0 });

  // Sunrise
  pad([NOTE.Bb1, NOTE.F2, NOTE.Bb2, NOTE.D3, NOTE.F3], 15.8, 29.6, { gain: 0.04, cut: [220, 1300, 600], atk: 3.0, rel: 1.4 });
  swell(19.2, 22.0, 0.12);
  boom(22.0, 0.3, 52, 26, 4);
  pad([NOTE.D4, NOTE.F4, NOTE.A4, NOTE.C5], 21.6, 29.4, { gain: 0.018, cut: [900, 2600, 1200], atk: 2.5, rel: 1.6, rev: 0.9 });

  // Flyover
  boom(30.0, 0.32, 70, 30, 2.2);
  pad([NOTE.G2, NOTE.D3, NOTE.G3, NOTE.Bb3], 30.0, 43.5, { gain: 0.04, cut: [200, 900, 500], atk: 1.5, rel: 1.0 });
  pad([NOTE.D1 * 1.335, NOTE.G2 / 2], 30.0, 43.5, { gain: 0.05, cut: [90, 160, 90], atk: 2.0, rel: 1.0, rev: 0.2 });
  rumble(30.5, 44.0, 38.5, 0.45);
  whoosh(38.3, 4.0, 0.22, [150, 900, 250], [-0.6, 0.6]);
  swell(41.8, 44.0, 0.16);
  whoosh(43.2, 2.6, 0.3, [400, 2200, 500], [0.7, -0.7]);

  // Cloud dive
  wind(44.0, 52.2, 0.09);
  pad([NOTE.F2, NOTE.C3, NOTE.F3, NOTE.A3, NOTE.C4], 44.0, 51.6, { gain: 0.032, cut: [500, 1700, 700], atk: 1.6, rel: 1.0, rev: 0.8 });
  whoosh(46.0, 3.0, 0.18, [300, 1400, 400], [-0.5, 0.5]);
  swell(50.2, 52.0, 0.12);

  // Valley run: drums + ostinato
  for (const h of DRUM_HITS) taiko(h.t, h.v);
  pad([NOTE.D2, NOTE.A2, NOTE.D3, NOTE.F3], 52.0, 62.5, { gain: 0.036, cut: [300, 1500, 600], atk: 0.8, rel: 0.4 });
  {
    const arpDm = [NOTE.D3, NOTE.A3, NOTE.D4, NOTE.F4, NOTE.A3, NOTE.D4, NOTE.A4, NOTE.F4];
    const arpBb = [NOTE.Bb2, NOTE.F3, NOTE.Bb3, NOTE.D4, NOTE.F3, NOTE.Bb3, NOTE.F4, NOTE.D4];
    const step = DRUM_BEAT / 2;
    let i = 0;
    for (let t = 52.0; t < 62.5; t += step, i++) {
      const bar = Math.floor((t - 52) / (DRUM_BEAT * 4));
      const arp = bar % 2 === 1 ? arpBb : arpDm;
      pluck(t, arp[i % 8], 0.026 + 0.012 * ((t - 52) / 10));
    }
  }
  whoosh(61.6, 1.2, 0.2, [300, 2500, 800], [0, 0]);

  // Monolith: drone, tension, riser, heartbeats
  pad([NOTE.D1, NOTE.D2], 62.9, 70.0, { gain: 0.07, cut: [120, 260, 200], atk: 1.0, rel: 0.2, rev: 0.3 });
  pad([NOTE.D3, NOTE.Eb3, NOTE.A3], 63.2, 70.0, { gain: 0.03, cut: [400, 2400, 2400], atk: 5.5, rel: 0.15, type: 'triangle' });
  riser(64.4, 70.0, 0.22);
  for (const hb of [64.5, 65.6, 66.5, 67.2, 67.8, 68.3, 68.7, 69.0, 69.3, 69.5, 69.7, 69.85]) heartbeat(hb, 0.3);

  // Signal pings
  for (const p of PINGS) ping(p, p > 63 ? 0.14 : 0.11);

  // The beam
  braam(BEAM_TIME, [NOTE.D1, NOTE.D2, NOTE.A2, NOTE.D3, NOTE.F3], 0.42, 4.5);
  boom(BEAM_TIME, 0.65, 72, 24, 3.0);
  crash(BEAM_TIME, 0.16, 2.5);

  // Black: the voice
  voice(72.9, 0.08);
  ping(75.4, 0.05);

  // Title
  braam(TITLE_TIME, [NOTE.D1, NOTE.D2, NOTE.A2, NOTE.D3], 0.45, 7.5);
  boom(TITLE_TIME, 0.7, 60, 22, 5);
  pad([NOTE.D3, NOTE.F3, NOTE.A3, NOTE.D4], TITLE_TIME + 0.2, 85.5, { gain: 0.03, cut: [600, 1800, 500], atk: 1.8, rel: 2.5, rev: 1.0 });
  pad([NOTE.D5, NOTE.A5, NOTE.D6], TITLE_TIME + 1.0, 85.5, { gain: 0.006, cut: [3000, 5000, 3000], type: 'sine', atk: 3, rel: 2.5, rev: 1.2 });
  ping(82.2, 0.06);

  return {
    master,
    stop() {
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
        master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
      } catch (e) {
        /* ignore */
      }
      const when = ctx.currentTime + 0.1;
      for (const s of sources) {
        try {
          s.stop(when);
        } catch (e) {
          /* already stopped */
        }
      }
      setTimeout(() => master.disconnect(), 200);
    },
  };
}

// Render the full score offline (used for the video export) and return a WAV ArrayBuffer.
export async function renderScoreWav(sampleRate = 48000) {
  const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * DURATION), sampleRate);
  buildScore(ctx, ctx.destination, { startAt: 0, offset: 0 });
  const buf = await ctx.startRendering();
  return { buffer: buf, wav: encodeWav(buf) };
}

function encodeWav(buf) {
  const ch = buf.numberOfChannels;
  const len = buf.length;
  const out = new ArrayBuffer(44 + len * ch * 2);
  const v = new DataView(out);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + len * ch * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, buf.sampleRate, true);
  v.setUint32(28, buf.sampleRate * ch * 2, true);
  v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, len * ch * 2, true);
  const data = [];
  for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return out;
}
