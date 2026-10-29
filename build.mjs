// Build a single self-contained HTML file: bundled JS (three.js included),
// CSS, and subset fonts embedded as base64. Run with: bun build.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = import.meta.dir;
const src = join(root, 'src');
const out = join(root, 'dist');
const tmp = join(root, '.build');
mkdirSync(out, { recursive: true });
mkdirSync(tmp, { recursive: true });

// 1) characters used anywhere in the UI / titles / textures
let text = '';
for (const f of readdirSync(src)) text += readFileSync(join(src, f), 'utf8');
const chars = new Set();
for (let c = 32; c < 127; c++) chars.add(String.fromCharCode(c));
for (const ch of text) if (ch.codePointAt(0) > 127) chars.add(ch);
for (const ch of '·—「」，。：、…❚↺') chars.add(ch);
writeFileSync(join(tmp, 'chars.txt'), [...chars].join(''));

// 2) subset fonts with fontTools (woff, zlib)
const fontsDir = join(root, '.fonts');
const fontTools = join(root, '..', '.tools', 'fonttools', 'Lib');
const subset = (input, output) => {
  const r = Bun.spawnSync(
    ['python3', '-m', 'fontTools.subset', join(fontsDir, input), `--text-file=${join(tmp, 'chars.txt')}`, '--flavor=woff', `--output-file=${join(tmp, output)}`, "--layout-features=*", '--no-hinting', '--desubroutinize'],
    { env: { ...process.env, PYTHONPATH: fontTools } }
  );
  if (r.exitCode !== 0) throw new Error('subset failed: ' + r.stderr.toString());
  return readFileSync(join(tmp, output)).toString('base64');
};
const serif300 = subset('NotoSerifSC-Light.otf', 'serif-300.woff');
const serif400 = subset('NotoSerifSC-Regular.otf', 'serif-400.woff');
const cinzel = subset('Cinzel.ttf', 'cinzel.woff');
const fontsCss = `
@font-face { font-family: "Echo Serif SC"; font-weight: 300; font-display: block; src: url(data:font/woff;base64,${serif300}) format("woff"); }
@font-face { font-family: "Echo Serif SC"; font-weight: 400 900; font-display: block; src: url(data:font/woff;base64,${serif400}) format("woff"); }
@font-face { font-family: "Echo Cinzel"; font-weight: 400 900; font-display: block; src: url(data:font/woff;base64,${cinzel}) format("woff"); }
`;

// 3) bundle JS
const result = await Bun.build({ entrypoints: [join(src, 'main.js')], minify: true, target: 'browser', format: 'esm' });
if (!result.success) {
  console.error(result.logs);
  process.exit(1);
}
const js = (await result.outputs[0].text()).replace(/<\/script/gi, '<\\/script');

// 4) assemble
const html = readFileSync(join(src, 'index.template.html'), 'utf8')
  .replace('/*__FONTS__*/', () => fontsCss)
  .replace('/*__CSS__*/', () => readFileSync(join(src, 'style.css'), 'utf8'))
  .replace('/*__SCRIPT__*/', () => js);
writeFileSync(join(out, 'echo.html'), html);
// same file served by GitHub Pages
mkdirSync(join(root, 'docs'), { recursive: true });
writeFileSync(join(root, 'docs', 'index.html'), html);
const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log(`dist/echo.html  ${kb(html.length)}  (js ${kb(js.length)}, fonts ${kb(fontsCss.length)}, ${chars.size} glyphs)`);
