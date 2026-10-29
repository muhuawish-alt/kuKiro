// Shared headless-Chrome launcher (SwiftShader WebGL2) for stills and video capture.
import { chromium } from '/root/.nvm/versions/node/v22.23.4/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs';
import { join } from 'node:path';

const EXE = '/inner_container/opt/playwright/chromium_headless_shell-1232/chrome-headless-shell-linux64/chrome-headless-shell';

export async function openFilm({ width = 1280, height = 536, query = 'capture=1' } = {}) {
  const browser = await chromium.launch({
    executablePath: EXE,
    args: [
      '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      '--disable-crash-reporter', '--no-crashpad', '--no-zygote', '--single-process',
      '--autoplay-policy=no-user-gesture-required',
    ],
    ignoreDefaultArgs: ['--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const file = join(import.meta.dir ?? new URL('.', import.meta.url).pathname, '..', 'dist', 'echo.html');
  await page.goto(`file://${file}?${query}`);
  await page.waitForFunction(() => (window.ECHO && window.ECHO.ready) || document.getElementById('loading-text')?.textContent.startsWith('初始化失败'), null, { timeout: 600000, polling: 500 });
  return { browser, page, logs };
}
