// PBI 242: condus real în browser (build de producție): Pornește, G (intră în taxi), W apăsat până la oprire.
// Folosire: node drive-edge.mjs --dist <dir> --out captura-finala.png
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((entry, index, all) => (entry.startsWith('--') ? [entry.slice(2), all[index + 1]] : null))
    .filter(Boolean),
);
const dist = resolve(args.dist);
const VIEWS = ['street-eye-level', 'city-aerial', 'horizon', 'intersection-crosswalk', 'map-edge'];
const FRAMES = 300;
const WARMUP = 60;
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const cache = join(process.env.LOCALAPPDATA ?? '', 'npm-cache', '_npx');
const candidates = readdirSync(cache)
  .map((name) => join(cache, name, 'node_modules', 'playwright', 'index.js'))
  .filter((file) => existsSync(file))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
let chromium = null;
for (const file of candidates) {
  const module = await import(pathToFileURL(file).href);
  const found = (module.default ?? module).chromium;
  if (existsSync(found.executablePath())) {
    chromium = found;
    break;
  }
}
if (!chromium) throw new Error('Playwright cu Chromium instalat nu a fost găsit');

const server = createServer((request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, 'http://x').pathname));
  const file = join(dist, path === '/' || path === '\\' ? 'index.html' : path);
  if (!file.startsWith(dist) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(response);
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  channel: 'chromium',
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--enable-gpu', '--force-color-profile=srgb'],
});
try {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })).newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`${origin}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => globalThis.__v3Composition?.ready() === true, null, { timeout: 60000 });
  await page.getByRole('button', { name: 'Pornește' }).click();
  await page.waitForTimeout(500);
  await page.keyboard.down('KeyG');
  await page.waitForTimeout(150);
  await page.keyboard.up('KeyG');
  await page.waitForTimeout(500);
  const car = () => page.evaluate(() => {
    const frame = globalThis.__v3Composition.read();
    const v = frame.vehicles?.[0];
    return { auth: frame.hud?.authority ?? frame.authority ?? null, x: v?.positionM.x, z: v?.positionM.z, speed: v?.speedMps };
  });
  console.log('start', JSON.stringify(await car()));
  console.log('events', JSON.stringify(await page.evaluate(() => globalThis.__v3Composition.read().events?.slice(-3))));
  await page.keyboard.down('KeyW');
  let last = null;
  let still = 0;
  const trace = [];
  for (let second = 0; second < 150; second += 1) {
    await page.waitForTimeout(1000);
    const now = await car();
    if (second % 10 === 0) trace.push(now);
    if (last && Math.abs(now.x - last.x) < 1e-4 && now.speed === 0) still += 1;
    else still = 0;
    last = now;
    if (still >= 3) break;
  }
  await page.keyboard.up('KeyW');
  console.log('trace', JSON.stringify(trace));
  console.log('end', JSON.stringify(last));
  console.log('errors', JSON.stringify(errors));
  await page.screenshot({ path: args.out });
} finally {
  await browser.close();
  server.close();
}
