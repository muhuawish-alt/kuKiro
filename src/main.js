import * as THREE from 'three';
import { createPost } from './post.js';
import { createSpace } from './space.js';
import { createSurface } from './surface.js';
import { createDirector } from './director.js';
import { createTitles } from './titles.js';
import { buildScore, renderScoreWav } from './audio.js';
import { DURATION } from './timeline.js';

const ASPECT = 2.39;
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');
const START_AT = parseFloat(params.get('t') || '0') || 0;

const stage = document.getElementById('stage');
const ui = document.getElementById('ui');
const loading = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const startScreen = document.getElementById('start');
const startBtn = document.getElementById('start-btn');
const hud = document.getElementById('hud');
const bar = document.getElementById('bar-fill');
const timeLabel = document.getElementById('time');
const endScreen = document.getElementById('end');
const replayBtn = document.getElementById('replay');

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const setLoading = async (msg) => {
  if (loadingText) loadingText.textContent = msg;
  await nextFrame();
  await nextFrame();
};

let W = 1280;
let H = 536;
let PR = 1;

function layout() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw / vh > ASPECT) {
    H = vh;
    W = Math.round(vh * ASPECT);
  } else {
    W = vw;
    H = Math.round(vw / ASPECT);
  }
  stage.style.width = W + 'px';
  stage.style.height = H + 'px';
  stage.style.setProperty('--u', H / 100 + 'px');
  PR = CAPTURE ? 1 : Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(2.4e6 / (W * H)));
}

async function main() {
  layout();
  await setLoading('正在载入字体…');
  try {
    await Promise.all([
      document.fonts.load('300 32px "Echo Serif SC"', '回声'),
      document.fonts.load('400 32px "Echo Serif SC"', '回声'),
      document.fonts.load('600 32px "Echo Cinzel"', 'ECHO'),
    ]);
  } catch (e) {
    /* fall back to system fonts */
  }

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
  renderer.setPixelRatio(PR);
  renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.insertBefore(renderer.domElement, ui);

  const camera = new THREE.PerspectiveCamera(45, ASPECT, 1, 40000);
  const post = createPost(renderer, W, H, PR);

  await setLoading('正在构建深空与行星…');
  const space = createSpace(renderer);
  await setLoading('正在生成地形、云层与方尖碑…');
  const surface = createSurface(renderer);
  const director = createDirector({ space, surface, post, camera, renderer });
  const titles = createTitles(ui);

  const black = new THREE.Scene();
  black.background = new THREE.Color(0, 0, 0);

  function renderAt(t) {
    const r = director.apply(t);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    const scene = r.set === 'space' ? space.scene : r.set === 'surface' ? surface.scene : black;
    post.scenePass.scene = scene;
    post.scenePass.camera = camera;
    post.overlayPass.enabled = r.set === 'space' && r.overlay;
    post.overlayPass.scene = space.flares.scene;
    post.overlayPass.camera = space.flares.camera;
    const f = post.final.uniforms;
    f.uTime.value = t;
    f.uFade.value = r.fade;
    f.uFlash.value = r.flash;
    f.uGrain.value = 0.045;
    f.uCA.value = 0.28;
    post.composer.render(1 / 24);
    titles.update(t);
    return r;
  }

  window.addEventListener('resize', () => {
    layout();
    renderer.setPixelRatio(PR);
    renderer.setSize(W, H);
    post.setSize(W, H, PR);
  });
  post.setSize(W, H, PR);

  // Warm up: compile every shader path and upload every texture before playback.
  await setLoading('正在编译着色器…');
  for (const t of [6, 20, 24, 36, 47, 57, 68, 70.5, 80]) {
    renderAt(t);
    await nextFrame();
  }

  if (CAPTURE) {
    window.ECHO = {
      ready: true,
      duration: DURATION,
      size: [W, H],
      renderAt: (t) => {
        const r = renderAt(t);
        return r.name;
      },
      async renderWav() {
        const { wav } = await renderScoreWav(48000);
        const bytes = new Uint8Array(wav);
        let s = '';
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(s);
      },
      async recordOpus(seconds = DURATION) {
        // Encode the offline-rendered score to Opus/WebM through MediaRecorder (realtime).
        const { buffer } = await renderScoreWav(48000);
        const ctx = new AudioContext({ sampleRate: 48000 });
        await ctx.resume();
        const dest = ctx.createMediaStreamDestination();
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(dest);
        const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192000 });
        const chunks = [];
        rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        const done = new Promise((r) => (rec.onstop = r));
        rec.start(1000);
        src.start();
        await new Promise((r) => setTimeout(r, seconds * 1000 + 600));
        rec.stop();
        await done;
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let s = '';
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(s);
      },
    };
    loading.style.display = 'none';
    startScreen.style.display = 'none';
    hud.style.display = 'none';
    renderAt(START_AT);
    return;
  }

  // ---------------- interactive playback ----------------
  let audioCtx = null;
  let score = null;
  let playing = false;
  let startClock = 0; // audio/perf time corresponding to timeline `startOffset`
  let startOffset = START_AT;
  let pausedAt = START_AT;
  let muted = false;
  let ended = false;

  const now = () => (audioCtx ? audioCtx.currentTime : performance.now() / 1000);
  const currentT = () => (playing ? startOffset + (now() - startClock) : pausedAt);

  function startFrom(t) {
    t = Math.max(0, Math.min(DURATION, t));
    if (score) score.stop();
    score = null;
    startOffset = t;
    if (audioCtx) {
      const at = audioCtx.currentTime + 0.06;
      if (!muted) score = buildScore(audioCtx, audioCtx.destination, { startAt: at, offset: t });
      startClock = at;
    } else {
      startClock = now();
    }
    playing = true;
    ended = false;
    endScreen.classList.remove('show');
  }
  function pause() {
    if (!playing) return;
    pausedAt = currentT();
    playing = false;
    if (score) score.stop();
    score = null;
  }
  function togglePause() {
    if (playing) pause();
    else startFrom(pausedAt >= DURATION - 0.05 ? 0 : pausedAt);
  }

  loading.style.display = 'none';
  startScreen.classList.add('show');
  renderAt(START_AT);

  startBtn.addEventListener('click', async () => {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
      await audioCtx.resume();
    } catch (e) {
      audioCtx = null;
    }
    startScreen.classList.remove('show');
    startScreen.classList.add('gone');
    startFrom(START_AT);
    pokeHud();
  });
  replayBtn.addEventListener('click', () => startFrom(0));

  let hudTimer = 0;
  function pokeHud() {
    hud.classList.add('show');
    document.body.classList.remove('idle');
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => {
      hud.classList.remove('show');
      document.body.classList.add('idle');
    }, 2600);
  }
  window.addEventListener('mousemove', pokeHud);
  document.getElementById('bar').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = ((e.clientX - r.left) / r.width) * DURATION;
    if (playing) startFrom(t);
    else pausedAt = t;
  });

  window.addEventListener('keydown', (e) => {
    if (startScreen.classList.contains('show')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      togglePause();
    } else if (e.code === 'KeyR') startFrom(0);
    else if (e.code === 'KeyF') {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    } else if (e.code === 'ArrowRight') {
      const t = currentT() + 5;
      if (playing) startFrom(t);
      else pausedAt = Math.min(DURATION, t);
    } else if (e.code === 'ArrowLeft') {
      const t = currentT() - 5;
      if (playing) startFrom(t);
      else pausedAt = Math.max(0, t);
    } else if (e.code === 'KeyM') {
      muted = !muted;
      if (playing) startFrom(currentT());
    }
    pokeHud();
  });

  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function loop() {
    requestAnimationFrame(loop);
    let t = currentT();
    if (playing && t >= DURATION) {
      t = DURATION;
      pausedAt = DURATION;
      playing = false;
      ended = true;
      endScreen.classList.add('show');
    }
    renderAt(Math.min(t, DURATION - 0.001));
    bar.style.width = ((t / DURATION) * 100).toFixed(2) + '%';
    timeLabel.textContent = `${fmt(t)} / ${fmt(DURATION)}${playing ? '' : ended ? '' : '  ❚❚'}`;
  }
  loop();
}

main().catch((err) => {
  console.error(err);
  if (loadingText) loadingText.textContent = '初始化失败：' + (err && err.message ? err.message : err);
});
