// Render stills at given timeline seconds: bun tools/stills.mjs 20 36.5 57 ...
import { openFilm } from './browser.mjs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const times = process.argv.slice(2).map(Number).filter((x) => !Number.isNaN(x));
const outDir = join(import.meta.dir, '..', 'stills');
mkdirSync(outDir, { recursive: true });
const t0 = Date.now();
const { browser, page, logs } = await openFilm();
console.log(`loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
const failed = await page.evaluate(() => !window.ECHO);
if (failed) {
  console.log(await page.evaluate(() => document.getElementById('loading-text').textContent));
}
for (const t of failed ? [] : times) {
  const s = Date.now();
  const name = await page.evaluate((t) => window.ECHO.renderAt(t), t);
  const file = join(outDir, `t${t.toFixed(1).padStart(5, '0')}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 90 });
  console.log(`t=${t} (${name}) ${((Date.now() - s) / 1000).toFixed(2)}s -> ${file}`);
}
const errs = logs.filter((l) => /error|warn/i.test(l));
console.log(errs.length ? errs.slice(0, 30).join('\n') : 'no console errors/warnings');
await browser.close();
