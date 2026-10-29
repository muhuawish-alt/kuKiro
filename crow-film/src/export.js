// 逐帧导出 WebM（VP9 视频 + Opus 音频）。
// 每一帧都按精确时间渲染再编码，不依赖实时播放，所以在慢的机器上也不会掉帧。
// 需要浏览器支持 WebCodecs（Chrome / Edge 94 以上），并且页面在 https 或 localhost 下打开。

export const canExport = () => typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined';

// ---------- EBML（Matroska / WebM）写入 ----------
const enc = new TextEncoder();
function sizeBytes(n) {                       // 固定 8 字节长度，简单可靠
  const b = new Uint8Array(8);
  b[0] = 0x01;
  for (let i = 7; i >= 1; i--) { b[i] = n % 256; n = Math.floor(n / 256); }
  return b;
}
function concat(parts) {
  const len = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const el = (id, ...children) => {
  const body = concat(children.flat());
  return concat([new Uint8Array(id), sizeBytes(body.length), body]);
};
function uint(id, v) {
  const bytes = [];
  do { bytes.unshift(v % 256); v = Math.floor(v / 256); } while (v > 0);
  return el(id, new Uint8Array(bytes));
}
function float(id, v) {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, v);
  return el(id, b);
}
const str = (id, s) => el(id, enc.encode(s));
const bin = (id, b) => el(id, new Uint8Array(b));

function simpleBlock(track, relMs, key, data) {
  const head = new Uint8Array(4);
  head[0] = 0x80 | track;
  new DataView(head.buffer).setInt16(1, relMs);
  head[3] = key ? 0x80 : 0x00;
  return el([0xA3], head, data);
}

function opusHead(channels, preSkip, rate) {
  const b = new Uint8Array(19);
  b.set(enc.encode('OpusHead'), 0);
  const v = new DataView(b.buffer);
  b[8] = 1; b[9] = channels;
  v.setUint16(10, preSkip, true);
  v.setUint32(12, rate, true);
  v.setInt16(16, 0, true);
  b[18] = 0;
  return b;
}

function muxWebM({ width, height, durationMs, video, audio, opus }) {
  const header = el([0x1A, 0x45, 0xDF, 0xA3],
    uint([0x42, 0x86], 1), uint([0x42, 0xF7], 1), uint([0x42, 0xF2], 4), uint([0x42, 0xF3], 8),
    str([0x42, 0x82], 'webm'), uint([0x42, 0x87], 4), uint([0x42, 0x85], 2));
  const info = el([0x15, 0x49, 0xA9, 0x66],
    uint([0x2A, 0xD7, 0xB1], 1000000), str([0x4D, 0x80], 'crow-film'), str([0x57, 0x41], 'crow-film'),
    float([0x44, 0x89], durationMs));
  const tracks = el([0x16, 0x54, 0xAE, 0x6B],
    el([0xAE], uint([0xD7], 1), uint([0x73, 0xC5], 1), uint([0x83], 1), str([0x86], 'V_VP9'),
      el([0xE0], uint([0xB0], width), uint([0xBA], height))),
    el([0xAE], uint([0xD7], 2), uint([0x73, 0xC5], 2), uint([0x83], 2), str([0x86], 'A_OPUS'),
      bin([0x63, 0xA2], opus.head), uint([0x56, 0xAA], opus.codecDelayNs), uint([0x56, 0xBB], 80000000),
      el([0xE1], float([0xB5], opus.rate), uint([0x9F], opus.channels))));
  // 每个关键帧开始一个新簇，簇内按时间交错放视频和音频
  const keyTimes = video.filter((v) => v.key).map((v) => v.ms);
  const clusters = [];
  for (let k = 0; k < keyTimes.length; k++) {
    const t0 = keyTimes[k], t1 = k + 1 < keyTimes.length ? keyTimes[k + 1] : Infinity;
    const blocks = [
      ...video.filter((v) => v.ms >= t0 && v.ms < t1).map((v) => ({ ...v, track: 1 })),
      ...audio.filter((a) => (k === 0 ? a.ms < t1 : a.ms >= t0 && a.ms < t1)).map((a) => ({ ...a, track: 2, key: true })),
    ].sort((a, b) => a.ms - b.ms || a.track - b.track);
    clusters.push(el([0x1F, 0x43, 0xB6, 0x75], uint([0xE7], t0),
      ...blocks.map((b) => simpleBlock(b.track, Math.round(b.ms - t0), b.key, b.data))));
  }
  const segment = el([0x18, 0x53, 0x80, 0x67], info, tracks, ...clusters);
  return new Blob([header, segment], { type: 'video/webm' });
}

// ---------- 编码 ----------
// render(t) 把第 t 秒画到 canvas 上；audioBytes 是整首 MP3 的原始数据
export async function exportWebM({ canvas, render, duration, fps = 30, audioBytes, audioStart, fadeOut = 0, onProgress = () => {} }) {
  const width = canvas.width, height = canvas.height;
  const video = [];
  const venc = new VideoEncoder({
    output: (chunk) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      video.push({ ms: chunk.timestamp / 1000, key: chunk.type === 'key', data });
    },
    error: (e) => { throw e; },
  });
  venc.configure({ codec: 'vp09.00.10.08', width, height, bitrate: 14_000_000, framerate: fps, latencyMode: 'quality' });

  const frames = Math.round(duration * fps);
  for (let i = 0; i < frames; i++) {
    render(i / fps);
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
    venc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    while (venc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 5));
    if (i % 10 === 0) onProgress(i / frames * 0.9);
  }
  await venc.flush();
  venc.close();

  // 音频：重采样到 48 kHz，截取片段，编码成 Opus
  const rate = 48000, channels = 2;
  const off = new OfflineAudioContext(channels, 1, rate);
  const full = await off.decodeAudioData(audioBytes.slice(0));
  const startF = Math.round(audioStart * rate);
  const total = Math.round(duration * rate);
  const ch = [];
  for (let c = 0; c < channels; c++) {
    const src = full.getChannelData(Math.min(c, full.numberOfChannels - 1));
    const out = new Float32Array(total);
    out.set(src.subarray(startF, startF + total));
    if (fadeOut > 0) {
      const n = Math.round(fadeOut * rate);
      for (let i = 0; i < n; i++) out[total - n + i] *= 1 - i / n;
    }
    ch.push(out);
  }
  const audio = [];
  let opusDesc = null;
  const aenc = new AudioEncoder({
    output: (chunk, meta) => {
      if (meta && meta.decoderConfig && meta.decoderConfig.description) opusDesc = new Uint8Array(meta.decoderConfig.description);
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      audio.push({ ms: chunk.timestamp / 1000, data });
    },
    error: (e) => { throw e; },
  });
  aenc.configure({ codec: 'opus', sampleRate: rate, numberOfChannels: channels, bitrate: 192000 });
  const step = 960; // 20 ms
  for (let f = 0; f < total; f += step) {
    const n = Math.min(step, total - f);
    const planar = new Float32Array(step * channels);
    for (let c = 0; c < channels; c++) planar.set(ch[c].subarray(f, f + n), c * step);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: rate, numberOfFrames: step, numberOfChannels: channels, timestamp: Math.round((f * 1e6) / rate), data: planar });
    aenc.encode(ad);
    ad.close();
  }
  await aenc.flush();
  aenc.close();
  onProgress(0.97);

  // OpusHead：优先用编码器给出的，没有就按标准值生成（pre-skip 312 个采样）
  const head = opusDesc && opusDesc.length >= 19 ? opusDesc : opusHead(channels, 312, rate);
  const preSkip = new DataView(head.buffer, head.byteOffset).getUint16(10, true);
  const blob = muxWebM({
    width, height, durationMs: duration * 1000, video, audio,
    opus: { head, rate, channels, codecDelayNs: Math.round((preSkip / rate) * 1e9) },
  });
  onProgress(1);
  return blob;
}
