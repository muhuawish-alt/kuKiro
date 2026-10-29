// Decode renders/echo-audio.webm in Chrome and print loudness per 8 s section.
import { chromium } from '/root/.nvm/versions/node/v22.23.4/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const EXE = '/inner_container/opt/playwright/chromium_headless_shell-1232/chrome-headless-shell-linux64/chrome-headless-shell';
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-zygote', '--single-process', '--disable-crash-reporter', '--no-crashpad'] });
const page = await browser.newPage();
await page.goto('about:blank');
const b64 = readFileSync(join(import.meta.dir, '..', 'renders', 'echo-audio.webm')).toString('base64');
const out = await page.evaluate(async (b64) => {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const ctx = new OfflineAudioContext(2, 48000, 48000);
  const buf = await ctx.decodeAudioData(bin.buffer);
  const d = buf.getChannelData(0);
  const rows = [`decoded ${buf.duration.toFixed(2)}s @ ${buf.sampleRate}Hz`];
  for (let s = 0; s < buf.duration; s += 8) {
    let sum = 0, n = 0, pk = 0;
    for (let i = Math.floor(s * buf.sampleRate); i < Math.min(d.length, (s + 8) * buf.sampleRate); i += 5) { sum += d[i] * d[i]; n++; pk = Math.max(pk, Math.abs(d[i])); }
    rows.push(`${String(s).padStart(2)}-${String(s + 8).padStart(2)}s rms ${(20 * Math.log10(Math.sqrt(sum / n) + 1e-9)).toFixed(1)} dBFS peak ${pk.toFixed(2)}`);
  }
  return rows.join('\n');
}, b64);
console.log(out);
await browser.close();
