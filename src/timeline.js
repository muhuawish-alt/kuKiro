// Master timeline. Visuals, titles and the score all read from here so they stay in sync.

export const DURATION = 88;

// Shot boundaries (seconds)
export const SHOTS = {
  studio: [0, 5],
  deepSpace: [5, 16],
  sunrise: [16, 30],
  flyover: [30, 44],
  clouds: [44, 52],
  valley: [52, 63],
  monolith: [63, 72],
  black: [72, 76.5],
  title: [76.5, DURATION],
};

// The alien signal: a three-note "ping" motif that repeats every 11 s,
// then accelerates while the monolith charges up.
export const PINGS = [6.0, 17.0, 28.0, 39.0, 50.0, 61.0, 64.6, 66.9, 68.4, 69.3];

export const BEAM_TIME = 70.0;
export const TITLE_TIME = 76.5;

// Taiko-style hits during the valley run (88 BPM)
const BEAT = 60 / 88;
export const DRUM_HITS = (() => {
  const hits = [];
  for (let bar = 0; bar < 8; bar++) {
    const t0 = 52.0 + bar * BEAT * 2;
    if (t0 > 62.4) break;
    hits.push({ t: t0, v: 1.0 });
    hits.push({ t: t0 + BEAT, v: 0.7 });
    if (bar % 2 === 1) hits.push({ t: t0 + BEAT * 1.5, v: 0.45 });
    if (bar >= 5) hits.push({ t: t0 + BEAT * 1.75, v: 0.5 });
  }
  return hits;
})();
export const DRUM_BEAT = BEAT;

// age (s) since most recent ping, or large number if none yet
export function pingAge(t) {
  let last = -1e6;
  for (const p of PINGS) if (p <= t) last = p;
  return t - last;
}

export function drumEnergy(t) {
  let e = 0;
  for (const h of DRUM_HITS) {
    const age = t - h.t;
    if (age >= 0 && age < 1.2) e = Math.max(e, h.v * Math.exp(-age * 7));
  }
  return e;
}
