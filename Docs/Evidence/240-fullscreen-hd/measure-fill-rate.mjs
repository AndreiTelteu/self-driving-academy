/**
 * PBI 240 — masurarea costului de fill-rate (frame time) pe GPU real, la 1920x1080.
 *
 * Rulare: node measure-fill-rate.mjs --dist <dir build> --preset HIGH|LOW --backend webgpu|webgl2
 *         [--frames 300] [--views street-eye-level,ui-hud] [--dpr 1] [--label before|after] [--out fisier.json]
 * Serveste `dist` cu `vite preview`, deschide `?capture=1`, DESCHIDE panoul Diagnostic (GPU timer) si
 * masoara intervalul dintre cadre cu limita de vsync oprita (`--disable-gpu-vsync`,
 * `--disable-frame-rate-limit`), ca sa se vada costul real, nu plafonul de 60 Hz.
 * Nu ruleaza doua masuratori in paralel. Playwright: PLAYWRIGHT_MODULE sau cache-ul npx.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const dist = resolve(opt('dist'));
const preset = opt('preset', 'HIGH').toUpperCase();
const backend = opt('backend', 'webgpu').toLowerCase();
const frames = Number(opt('frames', '300'));
const views = opt('views', 'street-eye-level,ui-hud').split(',');
const label = opt('label', 'run');
const dpr = Number(opt('dpr', '1'));
const out = opt('out', null);
const repo = resolve(process.env.SDA_ROOT ?? join(import.meta.dirname, '..', '..', '..'));

async function loadPlaywright() {
  const attempts = [];
  if (process.env.PLAYWRIGHT_MODULE)
    attempts.push(pathToFileURL(join(resolve(process.env.PLAYWRIGHT_MODULE), 'index.js')).href);
  attempts.push('playwright');
  const cache = join(process.env.LOCALAPPDATA ?? '', 'npm-cache', '_npx');
  if (existsSync(cache))
    for (const name of readdirSync(cache).sort(
      (a, b) => statSync(join(cache, b)).mtimeMs - statSync(join(cache, a)).mtimeMs,
    )) {
      const file = join(cache, name, 'node_modules', 'playwright', 'index.js');
      if (existsSync(file)) attempts.push(pathToFileURL(file).href);
    }
  for (const specifier of attempts) {
    try {
      const module = await import(specifier);
      const { chromium } = module.default ?? module;
      if (existsSync(chromium.executablePath())) return chromium;
    } catch {
      /* urmatorul */
    }
  }
  throw new Error('Playwright indisponibil');
}

const freePort = () =>
  new Promise((done, fail) => {
    const probe = createServer();
    probe.once('error', fail);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });

const stats = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (f) => sorted[Math.min(sorted.length - 1, Math.round(f * (sorted.length - 1)))];
  return {
    samples: sorted.length,
    meanMs: +(sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(3),
    p50Ms: +at(0.5).toFixed(3),
    p95Ms: +at(0.95).toFixed(3),
  };
};

const { preview } = await import(pathToFileURL(join(repo, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href);
const port = await freePort();
const server = await preview({
  configFile: join(repo, 'vite.config.ts'),
  root: repo,
  logLevel: 'warn',
  build: { outDir: dist },
  preview: { host: '127.0.0.1', port, strictPort: true, open: false },
});
const chromium = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  channel: 'chromium',
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--ignore-gpu-blocklist',
    '--enable-gpu',
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
    '--enable-dawn-features=allow_unsafe_apis',
  ],
});
const result = { label, preset, backend, viewport: `1920x1080 DPR${dpr}`, frames, views: [] };
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/?capture=1&preset=${preset}&backend=${backend}`, {
    waitUntil: 'load',
  });
  await page.waitForFunction(() => globalThis.__visualCapture?.ready() === true, null, {
    timeout: 60000,
  });
  const info = await page.evaluate(() => globalThis.__visualCapture.info());
  result.backendActual = info.backend.rendererKind;
  result.gpu = info.backend.renderer;
  await page.evaluate(() => {
    const details = document.querySelector('details');
    if (details) details.open = true;
  });
  for (const id of views) {
    await page.evaluate(([v]) => globalThis.__visualCapture.go(v, { measureFrames: 5 }), [id]);
    // Reincalzire + lasa timerul GPU sa adune esantioane.
    await page.waitForTimeout(2500);
    const intervals = await page.evaluate(
      (n) =>
        new Promise((resolve) => {
          const list = [];
          let last = performance.now();
          const tick = (now) => {
            list.push(now - last);
            last = now;
            if (list.length >= n) resolve(list);
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
      frames,
    );
    const after = await page.evaluate(() => globalThis.__visualCapture.info());
    const diag = await page.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll('details dl dt')].map((dt) => [
          dt.textContent,
          dt.nextElementSibling?.textContent ?? null,
        ]),
      ),
    );
    result.views.push({
      id,
      render: `${after.backend.renderWidth}x${after.backend.renderHeight}`,
      frameIntervalMs: stats(intervals.slice(5)),
      fps: +(1000 / stats(intervals.slice(5)).meanMs).toFixed(1),
      diagnostic: {
        gpuP95: diag['GPU p95'],
        gpuStatus: diag['GPU status'],
        cpuRenderP95: diag['CPU render p95'],
        drawCalls: diag['Draw calls'],
      },
    });
  }
} finally {
  await browser.close();
  await server.close();
}
const text = JSON.stringify(result, null, 2);
console.log(text);
if (out) await writeFile(out, `${text}\n`);
