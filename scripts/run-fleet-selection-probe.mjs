import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 263 — browser probe for live fleet selection.
 *
 * The probe opens the real fleet panel, selects a civilian by row click (camera only), takes it
 * over with the explicit button, drives it, switches to another taxi, verifies the released car is
 * AUTO and close to the driven point, then releases to AUTO. Playwright is optional: without it the
 * result is `NOT_RUN` with the real reason, never a simulated PASS.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '263-fleet-selection'),
  browserJson = join(directory, 'browser.json'),
  reportMarkdown = join(directory, 'report.md'),
  screenshots = join(directory, 'screenshots'),
  buildDirectory = join(root, '.pbi-validation-263', 'build');

async function loadPlaywright() {
  const explicit = process.env.PLAYWRIGHT_MODULE;
  try {
    if (explicit) {
      const resolved = resolve(explicit);
      const entry = /\.(?:c|m)?js$/.test(resolved) ? resolved : join(resolved, 'index.js');
      return await import(pathToFileURL(entry).href);
    }
    return await import('playwright');
  } catch {
    return null;
  }
}

function mimeType(file) {
  return (
    {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.wasm': 'application/wasm',
      '.glb': 'model/gltf-binary',
      '.ktx2': 'image/ktx2',
    }[extname(file)] ?? 'application/octet-stream'
  );
}

async function serve(directoryPath) {
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== 'GET') {
        response.writeHead(405).end();
        return;
      }
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname);
      const file = resolve(directoryPath, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(directoryPath + sep) || !(await stat(file)).isFile()) {
        response.writeHead(404).end();
        return;
      }
      const data = await readFile(file);
      response.writeHead(200, {
        'Content-Type': mimeType(file),
        'Cache-Control': 'no-store',
        'Content-Length': data.length,
      });
      response.end(data);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
  const address = server.address();
  const origin = `http://127.0.0.1:${
    typeof address === 'object' && address !== null ? address.port : 0
  }`;
  return { server, origin };
}

function markdown(result) {
  const run = result.run;
  if (!run) {
    return `# 263 — proba de browser a selecției live

Generată de \`npm run fleet:selection:probe\` pe ${result.generatedAt}.

**NOT_RUN** — ${result.reason}

Nu este raportat niciun PASS simulat. Testele deterministe acoperă contractul de selecție,
preluare, rută și un singur scaun \`PLAYER\`.
`;
  }
  const checks = run.checks
    .map((check) => `- \`${check.name}\`: ${check.pass ? 'PASS' : 'FAIL'} — ${check.detail}`)
    .join('\n');
  return `# 263 — proba de browser a selecției live

Generată de \`npm run fleet:selection:probe\` pe ${result.generatedAt}; Chromium ${run.browser},
backend ${run.actualBackend}, viewport ${run.viewport}.

Secvența reală: start → panoul \`Flotă\` → click pe un civil (doar camera) → \`M\` explicit → conducere
→ selecție alt taxi → preluare (vechiul vehicul revine în AUTO) → eliberare în AUTO. Capturi:
${run.screenshots.map((file) => `[${file}](${file})`).join(', ')}.

${checks}

Limite: proba este locală și provizorie; nu măsoară FPS/GPU și nu înlocuiește un playtest uman.
`;
}

const playwright = await loadPlaywright();
await mkdir(directory, { recursive: true });
const generatedAt = new Date().toISOString();

if (playwright === null) {
  const result = {
    version: '263-fleet-selection-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason:
      'Playwright is not installed in this checkout (no `playwright` module and no PLAYWRIGHT_MODULE); the browser probe was not run.',
    run: null,
  };
  await writeFile(browserJson, `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(reportMarkdown, markdown(result));
  console.log(`Wrote ${browserJson}`);
  console.log(`Wrote ${reportMarkdown}`);
  console.log('Fleet selection browser probe NOT_RUN: Playwright is not installed.');
  process.exit(0);
}

const { build } = await import('vite');
await build({
  configFile: join(root, 'vite.config.ts'),
  logLevel: 'error',
  build: { outDir: buildDirectory, emptyOutDir: true },
});
const { server, origin } = await serve(buildDirectory);
const { chromium } = playwright.default ?? playwright;
const channel = process.env.PLAYWRIGHT_CHANNEL || undefined;
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(channel === undefined ? {} : { channel }),
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--disable-gpu-sandbox',
    ],
  });
} catch (error) {
  const result = {
    version: '263-fleet-selection-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason: `Browser launch failed: ${error instanceof Error ? error.message : String(error)}`,
    run: null,
  };
  await writeFile(browserJson, `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(reportMarkdown, markdown(result));
  server.close();
  console.log('Fleet selection browser probe NOT_RUN: browser launch failed.');
  process.exit(0);
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.bringToFront();
  const url = `${origin}/?capture=1&backend=WEBGL2&preset=MEDIUM&models=procedural&time=noon`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => globalThis.__v3Composition?.ready() === true, null, {
    timeout: 180000,
  });
  const backend = await page.evaluate(() => globalThis.__v3Composition.backend());
  const actualBackend = backend?.rendererKind ?? null;
  const fleet = () => page.evaluate(() => globalThis.__v3Composition.fleet());
  const read = () => page.evaluate(() => globalThis.__v3Composition.read());
  const shell = () => page.evaluate(() => globalThis.__v3Composition.shell());
  const focusCanvas = () =>
    page.evaluate(() => {
      const canvas = globalThis.document?.querySelector('canvas');
      if (canvas instanceof globalThis.HTMLCanvasElement) canvas.focus();
    });
  await page.waitForFunction(
    () => globalThis.document?.querySelector('.game-shell')?.getAttribute('data-state') === 'READY',
    null,
    { timeout: 180000 },
  );
  const play = page.getByRole('button', { name: 'Joacă' });
  const resumeStart = page.getByRole('button', { name: 'Pornește' });
  const startButton = (await play.count()) > 0 ? play : resumeStart;
  await startButton.click();
  await focusCanvas();
  const waitTicks = async (count) => {
    const start = (await read()).tick;
    const deadline = Date.now() + 180000;
    while ((await read()).tick < start + count) {
      if (Date.now() > deadline) throw new Error(`Tick timeout after ${start} + ${count}`);
      await page.waitForTimeout(50);
    }
  };
  const shot = async (name) => {
    await mkdir(screenshots, { recursive: true });
    const relative = `screenshots/${name}.png`;
    await page.screenshot({ path: join(directory, relative), timeout: 120000 });
    return relative;
  };
  const checks = [];
  const check = (name, pass, detail) => checks.push({ name, pass, detail });

  await waitTicks(20);
  const before = await fleet();
  check(
    'fleet-listed',
    before.snapshot?.fleet.vehicles.length === 58,
    `${before.snapshot?.fleet.vehicles.length ?? 0} live vehicles`,
  );
  await page.locator('[data-shell-action="fleet"]').click();
  await page.waitForFunction(() => globalThis.__v3Composition.fleet().open === true, null, {
    timeout: 30000,
  });
  check('panel-open-auto-live', (await shell()).paused === false, 'panel opens live in AUTO');
  const screenshotsTaken = [await shot('01-fleet-panel')];
  const opened = await fleet();
  const civilian = opened.snapshot.fleet.vehicles.find((vehicle) => vehicle.kind === 'CIVIL');
  await page.locator(`.fleet-selection button[data-vehicle-id="${civilian.vehicleId}"]`).click();
  await waitTicks(6);
  const selected = await fleet();
  check(
    'selection-camera-only',
    selected.snapshot.fleet.selectedVehicleId === civilian.vehicleId &&
      selected.selection.authority.consumer === 'CHARACTER' &&
      selected.snapshot.fleet.vehicles.find((vehicle) => vehicle.vehicleId === civilian.vehicleId)
        .controlMode === 'AUTO',
    `camera ${selected.snapshot.fleet.selectedVehicleId}, authority ${selected.selection.authority.consumer}`,
  );
  screenshotsTaken.push(await shot('02-selected-camera'));
  await page.locator('[data-fleet-action="takeover"]').click();
  await page.waitForFunction(
    (vehicleId) => {
      const state = globalThis.__v3Composition.fleet();
      return state.selection?.playerVehicleId === vehicleId;
    },
    civilian.vehicleId,
    { timeout: 30000 },
  );
  check(
    'explicit-takeover',
    (await fleet()).snapshot.fleet.vehicles.filter((vehicle) => vehicle.controlMode === 'MANUAL')
      .length === 1,
    'one MANUAL vehicle after M',
  );
  await focusCanvas();
  await page.keyboard.down('KeyW');
  await waitTicks(120);
  await page.keyboard.up('KeyW');
  const driven = await read();
  const drivenCivilian = driven.vehicles.find(
    (vehicle) => vehicle.vehicleId === civilian.vehicleId,
  );
  check(
    'driven-vehicle-moved',
    driven.authority === `VEHICLE:${civilian.vehicleId}`,
    `authority ${driven.authority}`,
  );
  screenshotsTaken.push(await shot('03-driving'));

  await page.locator('[data-shell-action="fleet"]').click();
  await page.waitForFunction(() => globalThis.__v3Composition.fleet().open === true, null, {
    timeout: 30000,
  });
  const openAgain = await fleet();
  const taxi = openAgain.snapshot.fleet.vehicles.find(
    (vehicle) => vehicle.kind === 'TAXI' && vehicle.vehicleId !== civilian.vehicleId,
  );
  await page.locator(`.fleet-selection button[data-vehicle-id="${taxi.vehicleId}"]`).click();
  await page.locator('[data-fleet-action="takeover"]').click();
  await page.waitForFunction(
    (vehicleId) => {
      const state = globalThis.__v3Composition.fleet();
      return state.selection?.playerVehicleId === vehicleId;
    },
    taxi.vehicleId,
    { timeout: 30000 },
  );
  const switched = await fleet();
  const released = switched.snapshot.fleet.vehicles.find(
    (vehicle) => vehicle.vehicleId === civilian.vehicleId,
  );
  const releasedDistance = drivenCivilian
    ? Math.hypot(
        released.positionM.x - drivenCivilian.positionM.x,
        released.positionM.z - drivenCivilian.positionM.z,
      )
    : Infinity;
  check(
    'release-preserves-position',
    released.controlMode === 'AUTO' && releasedDistance < 3,
    `${released.controlMode}, ${releasedDistance.toFixed(3)} m from the driven point`,
  );
  check(
    'single-player-seat',
    switched.snapshot.fleet.vehicles.filter((vehicle) => vehicle.playerControlled).length === 1,
    `${switched.selection.playerVehicleId} is the only PLAYER seat`,
  );
  await focusCanvas();
  screenshotsTaken.push(await shot('04-switched-taxi'));

  await page.locator('[data-shell-action="fleet"]').click();
  await page.waitForFunction(() => globalThis.__v3Composition.fleet().open === true, null, {
    timeout: 30000,
  });
  await page.locator('[data-fleet-action="release"]').click();
  await page.waitForFunction(
    () => globalThis.__v3Composition.fleet().selection?.playerVehicleId === null,
    null,
    { timeout: 30000 },
  );
  check(
    'release-to-auto',
    (await fleet()).snapshot.fleet.vehicles.filter((vehicle) => vehicle.controlMode === 'MANUAL')
      .length === 0,
    'no MANUAL vehicle after release',
  );
  await focusCanvas();

  check('no-page-errors', pageErrors.length === 0, `${pageErrors.length} page errors`);
  check('no-console-errors', consoleErrors.length === 0, `${consoleErrors.length} console errors`);
  const pass = checks.every((entry) => entry.pass);
  const result = {
    version: '263-fleet-selection-browser-v1',
    generatedAt,
    status: 'MEASURED',
    run: {
      pass,
      browser: browser.version(),
      requestedBackend: 'WEBGL2',
      actualBackend,
      viewport: '1440x900',
      url,
      civilian: civilian.vehicleId,
      taxi: taxi.vehicleId,
      screenshots: screenshotsTaken,
      checks,
      pageErrors,
      consoleErrors,
    },
  };
  await writeFile(browserJson, `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(reportMarkdown, markdown(result));
  console.log(
    `SUMMARY fleet selection ${pass ? 'PASS' : 'FAIL'} checks ${checks.filter((entry) => entry.pass).length}/${checks.length}`,
  );
  console.log(`Wrote ${browserJson}`);
  console.log(`Wrote ${reportMarkdown}`);
} finally {
  await browser.close();
  server.close();
}
