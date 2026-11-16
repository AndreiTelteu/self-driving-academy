// PBI 244 (copiat din 243): intervalul real între cadre, fără limita de vsync, pe un build dat (`--dist`).
// Folosire: node perf.mjs --dist <dir> --label before|after --preset HIGH|LOW --backend webgpu|webgl2 --out file.json
// Chromium pornește cu --disable-gpu-vsync și --disable-frame-rate-limit; același script rulează pe
// ambele build-uri, unul după altul (niciodată în paralel). GPU timer nu există pe WebGPU aici.
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
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--ignore-gpu-blocklist',
    '--enable-gpu',
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
    '--force-color-profile=srgb',
  ],
});
try {
  const page = await (
    await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  ).newPage();
  await page.goto(`${origin}/?capture=1&preset=${args.preset}&backend=${args.backend}`, {
    waitUntil: 'load',
  });
  await page.waitForFunction(() => globalThis.__visualCapture?.ready() === true, null, {
    timeout: 60000,
  });
  // PBI 244: costul umbrelor si al AO se masoara separat (`--shadows 0|1`, `--ao 0|1`, implicit 1).
  await page.evaluate(
    ({ shadows, ao }) => globalThis.__v3Composition.daylight?.()?.setEffects({ shadows, occlusion: ao }),
    { shadows: args.shadows !== '0', ao: args.ao !== '0' },
  );
  const info = await page.evaluate(() => globalThis.__visualCapture.info());
  const views = [];
  for (const id of VIEWS) {
    await page.evaluate((view) => globalThis.__visualCapture.go(view), id);
    // `--move 1`: camera se misca in fiecare cadru (cazul real de condus: umbrele nu mai pot fi cache-uite).
    if (args.move === '1')
      await page.evaluate(() => {
        const scene = globalThis.__v3Composition.scene();
        const camera = scene.activeCamera;
        const base = camera.position.clone();
        let frame = 0;
        globalThis.__moveObserver?.remove?.();
        globalThis.__moveObserver = { remove: () => scene.onBeforeRenderObservable.remove(observer) };
        const observer = scene.onBeforeRenderObservable.add(() => {
          frame += 1;
          camera.position.x = base.x + Math.sin(frame * 0.05) * 1.5;
          camera.rotation.y += 0.002;
        });
      });
    const intervals = await page.evaluate(
      ({ frames, warmup }) =>
        new Promise((done) => {
          const samples = [];
          let last = performance.now();
          let count = 0;
          const tick = (now) => {
            if (count >= warmup) samples.push(now - last);
            last = now;
            count += 1;
            if (samples.length >= frames) done(samples);
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
      { frames: FRAMES, warmup: WARMUP },
    );
    intervals.sort((a, b) => a - b);
    const mean = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
    const at = (q) => intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * q))];
    views.push({
      id,
      samples: intervals.length,
      meanMs: +mean.toFixed(3),
      p50Ms: +at(0.5).toFixed(3),
      p95Ms: +at(0.95).toFixed(3),
      fps: +(1000 / mean).toFixed(1),
    });
  }
  const report = {
    label: args.label,
    move: args.move === '1',
    shadows: args.shadows !== '0',
    ao: args.ao !== '0',
    preset: args.preset,
    backend: info.backend.rendererKind,
    renderer: info.backend.renderer,
    viewport: '1920x1080 DPR1',
    flags: 'disable-gpu-vsync, disable-frame-rate-limit',
    frames: FRAMES,
    views,
  };
  await writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `${args.label} ${args.preset} ${report.backend}: ` +
      views.map((view) => `${view.id} ${view.meanMs} ms (${view.fps} fps)`).join(', '),
  );
} finally {
  await browser.close();
  server.close();
}
