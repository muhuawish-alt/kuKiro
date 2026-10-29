// Interactive-mode smoke test: start screen -> click -> playback clock, audio state, keys.
import { chromium } from '/root/.nvm/versions/node/v22.23.4/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs';
import { join } from 'node:path';

const EXE = '/inner_container/opt/playwright/chromium_headless_shell-1232/chrome-headless-shell-linux64/chrome-headless-shell';
const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-crash-reporter', '--no-crashpad', '--no-zygote', '--single-process', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.addInitScript(() => {
  const AC = window.AudioContext;
  window.AudioContext = class extends AC {
    constructor(o) { super(o); window.__ctx = this; }
  };
});
await page.goto('file://' + join(import.meta.dir, '..', 'dist', 'echo.html?t=30'));
await page.waitForSelector('#start.show', { timeout: 600000 });
console.log('start screen visible');
await page.screenshot({ path: join(import.meta.dir, '..', 'stills', 'ui-start.jpg'), type: 'jpeg', quality: 85 });
await page.click('#start-btn');
await page.waitForTimeout(4000);
const a = await page.evaluate(() => ({ time: document.getElementById('time').textContent, ctx: window.__ctx && window.__ctx.state, t: window.__ctx && window.__ctx.currentTime }));
console.log('after 4s:', a);
await page.keyboard.press('Space');
await page.waitForTimeout(1500);
const b = await page.evaluate(() => document.getElementById('time').textContent);
await page.waitForTimeout(1500);
const c = await page.evaluate(() => document.getElementById('time').textContent);
console.log('paused:', JSON.stringify(b), '->', JSON.stringify(c));
await page.keyboard.press('ArrowRight');
await page.keyboard.press('Space');
await page.waitForTimeout(2000);
console.log('seek+resume:', await page.evaluate(() => document.getElementById('time').textContent));
await page.mouse.move(600, 400);
await page.screenshot({ path: join(import.meta.dir, '..', 'stills', 'ui-playing.jpg'), type: 'jpeg', quality: 85 });
const errs = logs.filter((l) => /error/i.test(l));
console.log(errs.length ? errs.join('\n') : 'no console errors');
await browser.close();
