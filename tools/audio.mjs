// Render the synthesized score offline to renders/echo-score.wav
import { openFilm } from './browser.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outDir = join(import.meta.dir, '..', 'renders');
mkdirSync(outDir, { recursive: true });
const { browser, page, logs } = await openFilm({ width: 320, height: 134 });
const t0 = Date.now();
const b64 = await page.evaluate(() => window.ECHO.renderWav());
const file = join(outDir, 'echo-score.wav');
writeFileSync(file, Buffer.from(b64, 'base64'));
console.log(`wav rendered in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${file}`);
const errs = logs.filter((l) => /error/i.test(l));
if (errs.length) console.log(errs.join('\n'));
await browser.close();
