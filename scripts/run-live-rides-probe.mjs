import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 264 — browser probe for live rides and dispatch.
 *
 * The probe starts the real build, waits for the authored requests, opens the live rides panel,
 * verifies that the queue and the real 060 claims are visible, then takes over an assigned taxi with
 * 263 and verifies the live module releases it with PLAYER_TAKEOVER and excludes it. Playwright is
 * optional: without it the result is NOT_RUN with the real reason, never a simulated PASS.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '264-live-rides'),
  browserJson = join(directory, 'browser.json'),
  reportMarkdown = join(directory, 'browser.md'),
  screenshots = join(directory, 'screenshots'),
  buildDirectory = join(root, '.pbi-validation-264', 'build');

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
    return `# 264 — proba de browser a curselor live

Generată de \`npm run ride:live:probe\`.

**NOT_RUN** — ${result.reason}

Nu este raportat niciun PASS simulat. Testele deterministe acoperă cererile 059, coada plină,
dispecerizarea 060, replanificarea, excluderea taxiurilor indisponibile și resetul.
`;
  }
  const checks = run.checks
    .map((entry) => `- \`${entry.name}\`: ${entry.pass ? 'PASS' : 'FAIL'} — ${entry.detail}`)
    .join('\n');
  return `# 264 — proba de browser a curselor live

Generată de \`npm run ride:live:probe\`; Chromium ${run.browser}, backend ${run.actualBackend},
viewport ${run.viewport}, tick ${run.tickAtOpen}–${run.tickAtTakeover}.

Secvența reală: start → cereri 059 vizibile în panoul \`Curse\` → taxiuri alocate 060 → preluarea
explicită a unui taxi alocat din panoul \`Flotă\` (263) → eliberare \`PLAYER_TAKEOVER\` și excludere.
Capturi: ${run.screenshots.map((file) => `[${file}](${file})`).join(', ')}.

${checks}

Limite: proba este locală și provizorie; pickup/dropoff fizic, pasagerii și ETA rămân PBI 265.
Nu măsoară FPS/GPU și nu înlocuiește un playtest uman.
`;
}

async function writeResult(result) {
  await mkdir(directory, { recursive: true });
  await writeFile(browserJson, `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(reportMarkdown, markdown(result));
  console.log(`Wrote ${browserJson}`);
  console.log(`Wrote ${reportMarkdown}`);
}

const playwright = await loadPlaywright();
await mkdir(directory, { recursive: true });
const generatedAt = new Date().toISOString();

if (playwright === null) {
  await writeResult({
    version: '264-live-rides-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason:
      'Playwright is not installed in this checkout (no `playwright` module and no PLAYWRIGHT_MODULE); the browser probe was not run.',
    run: null,
  });
  console.log('Live rides browser probe NOT_RUN: Playwright is not installed.');
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
const requestedChannel = process.env.PLAYWRIGHT_CHANNEL;
const channels = requestedChannel ? [requestedChannel] : ['chrome', undefined];
let browser = null;
let launchError = null;
for (const channel of channels) {
  try {
    browser = await chromium.launch({
      headless: true,
      ...(channel === undefined ? {} : { channel }),
      args:
        channel === undefined
          ? [
              '--use-gl=angle',
              '--use-angle=swiftshader',
              '--enable-unsafe-swiftshader',
              '--disable-gpu-sandbox',
            ]
          : ['--disable-gpu-sandbox'],
    });
    break;
  } catch (error) {
    launchError = error;
  }
}
if (browser === null) {
  await writeResult({
    version: '264-live-rides-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason: `Browser launch failed: ${launchError instanceof Error ? launchError.message : String(launchError)}`,
    run: null,
  });
  server.close();
  console.log('Live rides browser probe NOT_RUN: browser launch failed.');
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
  const url = `${origin}/?capture=1&backend=WEBGL2&preset=LOW&models=procedural&time=noon`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => globalThis.__v3Composition?.ready() === true, null, {
    timeout: 180000,
  });
  const backend = await page.evaluate(() => globalThis.__v3Composition.backend());
  const actualBackend = backend?.rendererKind ?? null;
  const rides = () => page.evaluate(() => globalThis.__v3Composition.rides());
  const shell = () => page.evaluate(() => globalThis.__v3Composition.shell());
  const read = () => page.evaluate(() => globalThis.__v3Composition.read());
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
  // Headless software rendering can trip the explicit overload pause. Resuming through the host's
  // Reia button keeps the real simulation running; this does not skip ticks or alter the world.
  const resumeOverload = async () => {
    const lifecycle = await page.evaluate(() => globalThis.__v3Composition.lifecycle());
    if (lifecycle?.kind !== 'PAUSED' || lifecycle.reason !== 'overload') return;
    const reia = page.getByRole('button', { name: 'Reia' });
    if ((await reia.count()) === 0) return;
    await reia.click().catch(() => {});
  };
  const waitUntil = async (predicate, argument, timeout, label) => {
    const deadline = Date.now() + timeout;
    for (;;) {
      if (await page.evaluate(predicate, argument)) return;
      await resumeOverload();
      if (Date.now() > deadline) throw new Error(`Timeout waiting for ${label}`);
      await page.waitForTimeout(100);
    }
  };
  const waitTicks = async (count) => {
    const start = (await read()).tick;
    const deadline = Date.now() + 180000;
    while ((await read()).tick < start + count) {
      await resumeOverload();
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

  // Wait until the 059 schedule admitted requests and the 060 dispatcher claimed real taxis.
  await waitUntil(
    () => {
      const state = globalThis.__v3Composition.rides();
      return (
        state?.snapshot?.counts?.requests > 0 &&
        state.snapshot.counts.assigned >= 4 &&
        state.snapshot.assignments.length >= 4
      );
    },
    null,
    180000,
    'live requests and assignments',
  );
  const tickAtOpen = (await read()).tick;
  await page.locator('[data-shell-action="rides"]').click();
  await waitUntil(
    () => globalThis.__v3Composition.rides().panelOpen === true,
    null,
    30000,
    'rides panel open',
  );
  const opened = await rides();
  const shellAtOpen = await shell();
  check(
    'rides-port-present',
    shellAtOpen.systems.some((system) => system.id === 'rides' && system.status === 'PRESENT'),
    'shell mounts the 264 rides port',
  );
  check(
    'panel-surface',
    shellAtOpen.surfaces.panel === true &&
      (shellAtOpen.paused === false || shellAtOpen.cause === 'panel'),
    `panel surface; paused ${shellAtOpen.paused} (${shellAtOpen.cause ?? 'none'})`,
  );
  check(
    'fleet-24-taxis',
    opened.snapshot.counts.taxis === 24,
    `${opened.snapshot.counts.taxis} live taxis`,
  );
  check(
    'requests-visible',
    opened.snapshot.counts.requests >= 8,
    `${opened.snapshot.counts.requests} scenario requests`,
  );
  check(
    'real-zones',
    opened.snapshot.requests.every(
      (request) =>
        request.originZoneId.startsWith('sz:') && request.destinationZoneId.startsWith('sz:'),
    ),
    'pickup/dropoff use real 032 service zones',
  );
  check(
    'assignments-visible',
    opened.snapshot.assignments.length >= 1,
    `${opened.snapshot.assignments.length} active claims`,
  );
  check(
    'both-legs-visible',
    opened.snapshot.assignments.every(
      (assignment) =>
        assignment.pickupRouteLaneIds.length > 0 && assignment.tripRouteLaneIds.length > 0,
    ),
    'each claim carries real pickup and trip lanes',
  );
  check(
    'unique-claims',
    new Set(opened.snapshot.assignments.map((assignment) => assignment.requestId)).size ===
      opened.snapshot.assignments.length &&
      new Set(opened.snapshot.assignments.map((assignment) => assignment.taxiId)).size ===
        opened.snapshot.assignments.length,
    `${opened.snapshot.assignments.length} unique request/taxi claims`,
  );
  check(
    'queue-bounded',
    opened.snapshot.counts.pending <= opened.snapshot.queue.limit,
    `${opened.snapshot.counts.pending}/${opened.snapshot.queue.limit} pending`,
  );
  const requestRows = await page.locator('[data-live-rides] tbody tr[data-request-id]').count();
  const assignmentRows = await page.locator('[data-live-rides] tbody tr[data-taxi-id]').count();
  check(
    'panel-rows',
    requestRows >= opened.snapshot.counts.requests &&
      assignmentRows >= opened.snapshot.assignments.length,
    `${requestRows} request rows, ${assignmentRows} assignment rows`,
  );
  const screenshotsTaken = [await shot('01-rides-panel')];

  // Close the read-only panel, open the real 263 fleet list and take over an assigned taxi.
  await page.locator('[data-live-action="close"]').click();
  await waitUntil(
    () => globalThis.__v3Composition.rides().panelOpen === false,
    null,
    30000,
    'rides panel close',
  );
  const assignedTaxi = opened.snapshot.assignments[0].taxiId;
  await page.locator('[data-shell-action="fleet"]').click();
  await waitUntil(
    () => globalThis.__v3Composition.fleet().open === true,
    null,
    30000,
    'fleet panel open',
  );
  await page.locator(`.fleet-selection__list button[data-vehicle-id="${assignedTaxi}"]`).click();
  await page.locator('[data-fleet-action="takeover"]').click();
  await waitUntil(
    (taxiId) => globalThis.__v3Composition.fleet().selection?.playerVehicleId === taxiId,
    assignedTaxi,
    30000,
    'player takeover',
  );
  await waitUntil(
    (taxiId) => {
      const state = globalThis.__v3Composition.rides();
      return (
        state?.snapshot?.totals?.releasesByCause?.PLAYER_TAKEOVER >= 1 &&
        state.snapshot.assignments.every((assignment) => assignment.taxiId !== taxiId) &&
        state.snapshot.counts.excludedPlayer >= 1
      );
    },
    assignedTaxi,
    30000,
    'player release from the ride claim',
  );
  const afterTakeover = await rides();
  const tickAtTakeover = (await read()).tick;
  check(
    'player-release',
    afterTakeover.snapshot.totals.releasesByCause.PLAYER_TAKEOVER >= 1,
    `${afterTakeover.snapshot.totals.releasesByCause.PLAYER_TAKEOVER} PLAYER_TAKEOVER release(s)`,
  );
  check(
    'player-excluded',
    afterTakeover.snapshot.counts.excludedPlayer >= 1 &&
      afterTakeover.snapshot.assignments.every((assignment) => assignment.taxiId !== assignedTaxi),
    `${assignedTaxi} is player-driven and unassigned`,
  );
  screenshotsTaken.push(await shot('02-player-takeover'));
  await focusCanvas();

  // Release the car back to AUTO so the probe leaves no PLAYER seat behind.
  await page.locator('[data-shell-action="fleet"]').click();
  await waitUntil(
    () => globalThis.__v3Composition.fleet().open === true,
    null,
    30000,
    'fleet panel open after takeover',
  );
  await page.locator('[data-fleet-action="release"]').click();
  await waitUntil(
    () => globalThis.__v3Composition.fleet().selection?.playerVehicleId === null,
    null,
    30000,
    'player release to AUTO',
  );
  await focusCanvas();
  await waitTicks(6);

  check('no-page-errors', pageErrors.length === 0, `${pageErrors.length} page errors`);
  check('no-console-errors', consoleErrors.length === 0, `${consoleErrors.length} console errors`);
  const pass = checks.every((entry) => entry.pass);
  await writeResult({
    version: '264-live-rides-browser-v1',
    generatedAt,
    status: 'MEASURED',
    run: {
      pass,
      browser: browser.version(),
      requestedBackend: 'WEBGL2',
      actualBackend,
      viewport: '1440x900',
      url,
      tickAtOpen,
      tickAtTakeover,
      assignedTaxi,
      requests: opened.snapshot.counts.requests,
      assignments: opened.snapshot.assignments.length,
      pending: opened.snapshot.counts.pending,
      screenshots: screenshotsTaken,
      checks,
      pageErrors,
      consoleErrors,
    },
  });
  console.log(
    `SUMMARY live rides ${pass ? 'PASS' : 'FAIL'} checks ${checks.filter((entry) => entry.pass).length}/${checks.length}`,
  );
} catch (error) {
  await writeResult({
    version: '264-live-rides-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason: `Browser probe failed before completing the real sequence: ${
      error instanceof Error ? error.message : String(error)
    }`,
    run: null,
  });
  console.error('Live rides browser probe did not complete.');
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
