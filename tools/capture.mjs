// Offline frame-accurate render of the whole film to renders/ECHO.webm (VP8 + Opus).
// bun tools/capture.mjs [workers=3] [fps=24] [width=1280]
import { openFilm } from './browser.mjs';
import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const WORKERS = Number(process.argv[2] || 3);
const FPS = Number(process.argv[3] || 24);
const WIDTH = Number(process.argv[4] || 1280);
const HEIGHT = Math.round(WIDTH / 2.39 / 2) * 2;
const root = join(import.meta.dir, '..');
const framesDir = join(root, '.frames');
const outDir = join(root, 'renders');
const FFMPEG = '/inner_container/opt/playwright/ffmpeg-1011/ffmpeg-linux';
mkdirSync(framesDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const DURATION = 88;
const total = Math.round(DURATION * FPS);
const name = (i) => join(framesDir, String(i).padStart(5, '0') + '.jpg');
const t0 = Date.now();
// drop frames truncated by an interrupted previous run (JPEG must end with FFD9)
for (const f of readdirSync(framesDir).filter((f) => f.endsWith('.jpg'))) {
  const b = readFileSync(join(framesDir, f));
  if (b.length < 1000 || b[b.length - 2] !== 0xff || b[b.length - 1] !== 0xd9) rmSync(join(framesDir, f));
}
let done = readdirSync(framesDir).filter((f) => f.endsWith('.jpg')).length;
console.log(`${total} frames @ ${WIDTH}x${HEIGHT}, ${WORKERS} workers, ${done} already on disk`);

async function audioJob() {
  const file = join(outDir, 'echo-audio.webm');
  if (existsSync(file)) return file;
  const { browser, page } = await openFilm({ width: 320, height: 134 });
  const b64 = await page.evaluate((d) => window.ECHO.recordOpus(d), DURATION);
  writeFileSync(file, Buffer.from(b64, 'base64'));
  await browser.close();
  console.log('audio recorded ->', file);
  return file;
}

const LIMIT = Number(process.env.LIMIT || total);
async function worker(k) {
  const { browser, page, logs } = await openFilm({ width: WIDTH, height: HEIGHT });
  console.log(`worker ${k} ready after ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  for (let i = k; i < Math.min(total, LIMIT); i += WORKERS) {
    const f = name(i);
    if (existsSync(f)) continue;
    await page.evaluate((t) => window.ECHO.renderAt(t), i / FPS);
    await page.screenshot({ path: f, type: 'jpeg', quality: 93 });
    done++;
    if (done % 48 === 0) {
      const el = (Date.now() - t0) / 1000;
      console.log(`${done}/${total} frames  ${el.toFixed(0)}s elapsed`);
    }
  }
  const errs = logs.filter((l) => /error/i.test(l));
  if (errs.length) console.log(`worker ${k} errors:\n` + errs.slice(0, 10).join('\n'));
  await browser.close();
}

const audioP = process.env.NOAUDIO ? Promise.resolve(null) : audioJob().catch((e) => (console.log('audio failed:', e.message), null));
await Promise.all(Array.from({ length: WORKERS }, (_, k) => worker(k)));
console.log(`frames done in ${((Date.now() - t0) / 1000).toFixed(0)}s, encoding...`);
if (LIMIT < total) {
  console.log('LIMIT set: skipping encode');
  process.exit(0);
}

// encode (VP8). This ffmpeg build only has the file: protocol, so concatenate
// the JPEGs into one MJPEG stream file and demux it with image2pipe.
const video = join(outDir, 'echo-video.webm');
const stream = join(framesDir, 'all.mjpeg');
{
  const { openSync, writeSync, closeSync } = await import('node:fs');
  const fd = openSync(stream, 'w');
  for (let i = 0; i < total; i++) writeSync(fd, readFileSync(name(i)));
  closeSync(fd);
}
await new Promise((resolve, reject) => {
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', stream,
    '-c:v', 'libvpx', '-b:v', '9M', '-crf', '6', '-qmin', '1', '-qmax', '32', '-deadline', 'good', '-cpu-used', '1', '-auto-alt-ref', '1', '-lag-in-frames', '16', '-threads', '8', video]);
  ff.stderr.on('data', (d) => process.stderr.write(d));
  ff.on('close', (c) => (c === 0 ? resolve() : reject(new Error('ffmpeg ' + c))));
});
rmSync(stream);
console.log('video ->', video);

const audio = await audioP;
const final = join(outDir, 'ECHO.webm');
if (audio) {
  await new Promise((resolve, reject) => {
    const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-i', video, '-i', audio, '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', '-shortest', final]);
    ff.stderr.on('data', (d) => process.stderr.write(d));
    ff.on('close', (c) => (c === 0 ? resolve() : reject(new Error('mux ' + c))));
  });
  console.log('final (video + audio) ->', final);
} else {
  console.log('no audio track; video only at', video);
}
console.log(`total ${((Date.now() - t0) / 60000).toFixed(1)} min`);
