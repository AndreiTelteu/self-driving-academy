import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 239 — harnessul de capturi V4: `npm run visual:capture -- --out <dir> --preset HIGH`.
 *
 * Construiește aplicația într-un director temporar, o servește cu `vite preview` pe un port liber
 * (sau `--port`), deschide `?capture=1` în Chromium la 1920×1080, aplică fiecare vedere din
 * `src/rendering/visual-capture.ts` prin `window.__visualCapture.go(id)` și scrie PNG-uri plus
 * `manifest.json`. Serverul, browserul și directorul de build sunt eliberate și la eroare.
 *
 * Opțiuni: --out <dir>  --preset LOW|MEDIUM|HIGH  --backend webgpu|webgl2|auto
 *          --port <n>  --views id,id  --dist <dir> (refolosește un build)  --headed
 *          --software (permite SwiftShader)  --allow-backend-fallback  --measure <cadre>
 * Playwright: PLAYWRIGHT_MODULE (entry point) sau modulul `playwright`; ca ultim recurs, cea mai
 * nouă instalare din cache-ul npx. Nu adaugă dependențe npm.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const VIEWPORT = { width: 1920, height: 1080 };

function parseArgs(argv) {
  const options = {
    out: null,
    preset: 'HIGH',
    backend: 'auto',
    port: null,
    views: null,
    dist: null,
    headed: false,
    software: false,
    allowBackendFallback: false,
    measure: 30,
    models: 'glb',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[(index += 1)];
      if (value === undefined) throw new Error(`Lipsește valoarea pentru ${arg}`);
      return value;
    };
    if (arg === '--out') options.out = next();
    else if (arg === '--preset') options.preset = next().toUpperCase();
    else if (arg === '--backend') options.backend = next().toLowerCase();
    else if (arg === '--port') options.port = Number(next());
    else if (arg === '--views') options.views = next().split(',');
    else if (arg === '--dist') options.dist = resolve(next());
    else if (arg === '--measure') options.measure = Number(next());
    else if (arg === '--models') options.models = next().toLowerCase();
    else if (arg === '--headed') options.headed = true;
    else if (arg === '--software') options.software = true;
    else if (arg === '--allow-backend-fallback') options.allowBackendFallback = true;
    else throw new Error(`Argument necunoscut: ${arg}`);
  }
  if (!['LOW', 'MEDIUM', 'HIGH'].includes(options.preset))
    throw new Error('--preset trebuie să fie LOW, MEDIUM sau HIGH');
  if (!['webgpu', 'webgl2', 'auto'].includes(options.backend))
    throw new Error('--backend trebuie să fie webgpu, webgl2 sau auto');
  if (!['glb', 'procedural'].includes(options.models))
    throw new Error('--models trebuie să fie glb sau procedural');
  if (options.port !== null && !(options.port > 0 && options.port < 65536))
    throw new Error('--port invalid');
  options.out = resolve(
    options.out ??
      join(root, 'output', 'playwright', `visual-${options.preset}-${options.backend}`),
  );
  return options;
}

async function freePort() {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.once('error', fail);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });
}

async function loadPlaywright() {
  const explicit = process.env.PLAYWRIGHT_MODULE;
  const attempts = [];
  if (explicit) {
    const resolved = resolve(explicit);
    attempts.push(
      pathToFileURL(/\.(?:c|m)?js$/.test(resolved) ? resolved : join(resolved, 'index.js')).href,
    );
  } else {
    attempts.push('playwright');
    const cache = join(process.env.LOCALAPPDATA ?? '', 'npm-cache', '_npx');
    if (existsSync(cache)) {
      const found = readdirSync(cache)
        .map((name) => join(cache, name, 'node_modules', 'playwright', 'index.js'))
        .filter((file) => existsSync(file))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
      for (const file of found) attempts.push(pathToFileURL(file).href);
    }
  }
  const errors = [];
  for (const specifier of attempts) {
    try {
      const module = await import(specifier);
      const { chromium } = module.default ?? module;
      // Verifică și browserul: versiunea de Playwright trebuie să aibă Chromium instalat.
      if (existsSync(chromium.executablePath())) return { chromium, specifier };
      errors.push(`${specifier}: Chromium lipsește (${chromium.executablePath()})`);
    } catch (error) {
      errors.push(`${specifier}: ${String(error).split('\n')[0]}`);
    }
  }
  throw new Error(`Playwright indisponibil. Setează PLAYWRIGHT_MODULE.\n${errors.join('\n')}`);
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

const SOFTWARE = /swiftshader|llvmpipe|software|basic render|microsoft basic/i;

export async function run(argv) {
  const options = parseArgs(argv);
  const { chromium, specifier } = await loadPlaywright();
  const cleanups = [];
  const cleanup = async () => {
    for (const task of cleanups.splice(0).reverse()) {
      try {
        await task();
      } catch (error) {
        console.error(`cleanup: ${String(error)}`);
      }
    }
  };
  const onSignal = () => {
    void cleanup().finally(() => process.exit(130));
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    const { CAPTURE_VIEWS } = await import(
      pathToFileURL(join(root, 'src', 'rendering', 'visual-capture.ts')).href
    );
    const views = options.views
      ? options.views.map((id) => {
          const view = CAPTURE_VIEWS.find((candidate) => candidate.id === id);
          if (!view) throw new Error(`Vedere necunoscută: ${id}`);
          return view;
        })
      : CAPTURE_VIEWS;

    let dist = options.dist;
    if (!dist) {
      const work = await mkdtemp(join(tmpdir(), 'sda-visual-capture-'));
      cleanups.push(() => rm(work, { recursive: true, force: true }));
      dist = join(work, 'dist');
      const { build } = await import('vite');
      await build({
        configFile: join(root, 'vite.config.ts'),
        root,
        base: './',
        cacheDir: join(work, 'cache'),
        logLevel: 'warn',
        build: { outDir: dist, emptyOutDir: true },
      });
    }
    const { preview } = await import('vite');
    const port = options.port ?? (await freePort());
    const server = await preview({
      configFile: join(root, 'vite.config.ts'),
      root,
      logLevel: 'warn',
      build: { outDir: dist },
      preview: { host: '127.0.0.1', port, strictPort: true, open: false },
    });
    cleanups.push(() => server.close());
    const origin = `http://127.0.0.1:${port}`;

    const flags = [
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan',
      '--ignore-gpu-blocklist',
      '--enable-gpu',
      '--hide-scrollbars',
      '--force-color-profile=srgb',
    ];
    if (options.software) flags.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
    const browser = await chromium.launch({
      headless: !options.headed,
      channel: 'chromium',
      args: flags,
    });
    cleanups.push(() => browser.close());
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(String(error)));

    const query = new URLSearchParams({
      capture: '1',
      preset: options.preset,
      backend: options.backend,
      models: options.models,
    });
    await page.goto(`${origin}/?${query}`, { waitUntil: 'load' });
    await page.waitForFunction(() => globalThis.__visualCapture?.ready() === true, null, {
      timeout: 60000,
    });
    // PBI 251 a așezat ecranul de start peste canvas în starea READY; capturile 239 trebuie să
    // fotografieze scena, nu overlay-ul. Se ascunde doar în harness, starea rămâne READY.
    await page.addStyleTag({ content: '.start-screen{display:none !important}' });
    const info = await page.evaluate(() => globalThis.__visualCapture.info());
    const adapter = await page.evaluate(async () => {
      try {
        const found = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
        return found
          ? {
              vendor: found.info?.vendor ?? null,
              architecture: found.info?.architecture ?? null,
              description: found.info?.description ?? null,
              isFallbackAdapter: found.isFallbackAdapter ?? null,
            }
          : null;
      } catch {
        return null;
      }
    });
    const glRenderer = await page.evaluate(() => {
      const gl = globalThis.document.createElement('canvas').getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return gl && ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
    });
    const actualBackend = info.backend.rendererKind;
    const requested = options.backend === 'auto' ? 'auto' : options.backend.toUpperCase();
    const mismatch = requested !== 'auto' && requested !== actualBackend;
    const rendererString =
      actualBackend === 'WEBGL2'
        ? (glRenderer ?? info.backend.renderer)
        : [adapter?.vendor, adapter?.architecture, adapter?.description]
            .filter(Boolean)
            .join(' ') || info.backend.renderer;
    const software =
      adapter?.isFallbackAdapter === true ||
      SOFTWARE.test(`${rendererString} ${glRenderer ?? ''} ${info.backend.renderer}`);
    if (mismatch && !options.allowBackendFallback)
      throw new Error(
        `Backend cerut ${requested}, obținut ${actualBackend}. Folosește --allow-backend-fallback ca să capturezi oricum.`,
      );
    if (software && !options.software)
      console.warn('ATENȚIE: renderer software (SwiftShader); manifestul îl marchează.');

    await mkdir(options.out, { recursive: true });
    const records = [];
    for (const view of views) {
      const result = await page.evaluate(
        ([id, frames]) => globalThis.__visualCapture.go(id, { measureFrames: frames }),
        [view.id, options.measure],
      );
      const after = await page.evaluate(() => globalThis.__visualCapture.info());
      const file = `${view.id}.png`;
      const buffer = await page.screenshot({ path: join(options.out, file), type: 'png' });
      records.push({
        id: view.id,
        category: view.category,
        title: view.title,
        surface: view.surface,
        file,
        bytes: buffer.length,
        sha256: createHash('sha256').update(buffer).digest('hex'),
        renderWidth: after.backend.renderWidth,
        renderHeight: after.backend.renderHeight,
        cpuRenderMs: result.cpuRenderMs,
        frameIntervalMs: result.frameIntervalMs,
      });
      console.log(
        `${view.id}: ${(buffer.length / 1024).toFixed(0)} KB, cpu ${result.cpuRenderMs.meanMs.toFixed(2)} ms, frame ${result.frameIntervalMs.meanMs.toFixed(2)} ms`,
      );
    }
    const dirty =
      (git(['status', '--porcelain', '--', 'src', 'index.html', 'package.json']) ?? '') !== '';
    const manifest = {
      version: info.version,
      commit: git(['rev-parse', 'HEAD']),
      sourceDirty: dirty,
      preset: options.preset,
      viewport: { ...VIEWPORT, deviceScaleFactor: 1 },
      backend: {
        requested,
        actual: actualBackend,
        engine: info.backend.engineDescription,
        renderer: rendererString,
        webglRenderer: glRenderer,
        webgpuAdapter: adapter,
        software,
        note: software
          ? 'Renderer software (SwiftShader): timpii nu sunt hardware.'
          : 'GPU real; timpii de cadru sunt plafonați de vsync, CPU render este costul de trimitere.',
      },
      browser: {
        name: 'chromium (new headless)',
        version: browser.version(),
        headless: !options.headed,
        playwright: specifier,
        flags,
      },
      determinism: { seed: info.seed, clock: info.clock, models: options.models },
      measureFrames: options.measure,
      consoleErrors,
      pageErrors,
      views: records,
    };
    await writeFile(join(options.out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(
      `OK ${records.length} cadre, ${options.preset}/${actualBackend}, ${rendererString}${software ? ' (SOFTWARE)' : ''} -> ${options.out}`,
    );
    if (pageErrors.length > 0) process.exitCode = 1;
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    await cleanup();
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  run(process.argv.slice(2)).catch((error) => {
    console.error(String(error?.stack ?? error));
    process.exit(1);
  });
}
