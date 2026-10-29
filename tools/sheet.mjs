// Tile stills into contact sheets: bun tools/sheet.mjs [cols] [perSheet]
import { chromium } from '/root/.nvm/versions/node/v22.23.4/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const cols = Number(process.argv[2] || 2);
const per = Number(process.argv[3] || 6);
const dir = join(import.meta.dir, '..', 'stills');
const files = readdirSync(dir).filter((f) => /^t.*\.(jpg|png)$/.test(f)).sort();
const EXE = '/inner_container/opt/playwright/chromium_headless_shell-1232/chrome-headless-shell-linux64/chrome-headless-shell';
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-zygote', '--single-process', '--disable-crash-reporter', '--no-crashpad'] });
const W = 640;
const page = await browser.newPage({ viewport: { width: cols * W + (cols - 1) * 4, height: 100 } });
for (let s = 0; s * per < files.length; s++) {
  const chunk = files.slice(s * per, (s + 1) * per);
  const html = `<html><body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(${cols},${W}px);gap:4px;font:12px sans-serif;color:#fff">
    ${chunk.map((f) => `<div style="position:relative"><img src="file://${join(dir, f)}" style="width:${W}px;display:block"><span style="position:absolute;left:4px;top:2px;background:#000a;padding:1px 4px">${f}</span></div>`).join('')}</body></html>`;
  const htmlFile = join(dir, `_sheet${s}.html`);
  writeFileSync(htmlFile, html);
  await page.goto('file://' + htmlFile);
  await page.waitForLoadState('load');
  const out = join(dir, `sheet-${Date.now().toString(36)}-${s}.jpg`);
  await page.screenshot({ path: out, type: 'jpeg', quality: 85, fullPage: true });
  console.log(out, chunk.join(' '));
}
await browser.close();
