// 播放、音频同步和导出。目前完成前两段（0–26.25 秒）。
import { W, H } from './draw.js';
import { queue, PART2_END } from './queue.js';
import { canExport, exportWebM } from './export.js';

const AUDIO_START = 44.18;           // 原曲中的起点
const PREVIEW_END = PART2_END;       // 现阶段播放到第二段结束
const EXPORT_NAME = '鸦_0-26秒.webm';
const FILE = 'Kam Ridr - the other side of paradise（顶级智斗）_627244913.mp3';
// 放在仓库里时音频在 ../；在沙盒工作区时在 ../kuKiro/
const AUDIO_CANDIDATES = ['../' + FILE, '../kuKiro/' + FILE];

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

// 静态颗粒：只生成一次，不会闪烁
const grain = (() => {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  let seed = 7;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 16807) % 2147483647;
    const v = (seed / 2147483647) * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
})();

export function render(t) {
  queue(ctx, Math.min(t, PREVIEW_END));
  ctx.globalAlpha = 0.05;
  ctx.globalCompositeOperation = 'overlay';
  ctx.drawImage(grain, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}
window.renderAt = render;

// ---------- 音频 ----------
// 用 Web Audio 解码整首歌，再从 AUDIO_START 处精确开始播放。
// 不依赖 <audio> 的跳转，所以在不支持分段请求的服务器上也能对齐。
const label = document.getElementById('time');
const ui = document.getElementById('ui');
const audioCtx = new AudioContext();
const audioDest = audioCtx.createMediaStreamDestination();
let audioBuffer = null;

let audioBytes = null;                 // 原始 MP3 数据，逐帧导出时重新解码用
async function loadAudio(urlOrBlob) {
  const data = typeof urlOrBlob === 'string'
    ? await fetch(encodeURI(urlOrBlob)).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
    : await urlOrBlob.arrayBuffer();
  audioBytes = data.slice(0);
  audioBuffer = await audioCtx.decodeAudioData(data);
  label.textContent = '音频已就绪';
}

const audioReady = (async () => {
  for (const url of AUDIO_CANDIDATES) {
    try { await loadAudio(url); return true; } catch (e) { /* 试下一个路径 */ }
  }
  label.textContent = '没找到音频，请点"选择音频"';
  return false;
})();
window.audioReady = audioReady;

// ---------- 播放 ----------
let playing = false, t0 = 0, source = null, recorder = null;
const now = () => audioCtx.currentTime - t0;

function loop() {
  if (!playing) return;
  const t = Math.max(0, now());
  if (t >= PREVIEW_END) { render(PREVIEW_END); stop(); return; }
  render(t);
  label.textContent = t.toFixed(2) + ' s';
  requestAnimationFrame(loop);
}

async function start() {
  await audioReady;
  await audioCtx.resume();
  render(0);
  t0 = audioCtx.currentTime + 0.1;     // 留 0.1 秒缓冲，保证第一帧和音乐同时开始
  if (audioBuffer) {
    source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    source.connect(audioDest);
    source.start(t0, AUDIO_START, PREVIEW_END);
  }
  playing = true;
  requestAnimationFrame(loop);
}

function stop() {
  playing = false;
  if (source) { try { source.stop(); } catch (e) { /* 已经停止 */ } source = null; }
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  ui.classList.remove('hidden');
}

document.getElementById('play').onclick = () => (playing ? stop() : start());

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

document.getElementById('rec').onclick = async () => {
  await audioReady;
  if (canExport() && audioBytes) {
    // 逐帧导出：每帧按精确时间渲染，速度慢的电脑也不会掉帧
    ui.classList.add('hidden');
    const blob = await exportWebM({
      canvas, render, duration: PREVIEW_END, fps: 30, audioBytes, audioStart: AUDIO_START, fadeOut: 0.25,
      onProgress: (p) => { label.textContent = '导出中 ' + Math.round(p * 100) + '%'; },
    });
    ui.classList.remove('hidden');
    label.textContent = '导出完成';
    download(blob, EXPORT_NAME);
    return;
  }
  // 浏览器不支持 WebCodecs 时，退回实时录制
  const stream = canvas.captureStream(30);
  audioDest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
  const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    .find((m) => MediaRecorder.isTypeSupported(m));
  recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = () => download(new Blob(chunks, { type: 'video/webm' }), EXPORT_NAME);
  ui.classList.add('hidden');
  recorder.start();
  await start();
};

const fileInput = document.getElementById('file');
document.getElementById('pick').onclick = () => fileInput.click();
fileInput.onchange = () => { if (fileInput.files[0]) loadAudio(fileInput.files[0]); };

// 预览单帧：index.html?t=12.5
const qt = new URLSearchParams(location.search).get('t');
render(qt !== null ? parseFloat(qt) : 0);
if (qt !== null) ui.classList.add('hidden');
