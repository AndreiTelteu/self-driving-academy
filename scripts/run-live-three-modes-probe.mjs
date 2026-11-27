import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 271 browser probe.
 *
 * The real built game is opened in Chrome. A taxi is selected and taken over with the real fleet
 * button, then the real `M`/`L` keys walk all six AUTO/MANUAL/LEARNING transitions. The probe reads
 * the live 069 segments, the one PLAYER seat and the HUD labels through the same debug read model.
 * Playwright is optional: without it the result is `NOT_RUN` with the real reason, never PASS.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '271-live-three-modes'),
  browserJson = join(directory, 'browser.json'),
  browserMarkdown = join(directory, 'browser.md'),
  screenshots = join(directory, 'screenshots'),
  distDirectory = join(root, 'dist');

async function loadPlaywright() {
  const explicit = process.env.PLAYWRIGHT_MODULE;
  try {
    if (explicit) {
      const resolved = resolve(explicit),
        entry = /\.(?:c|m)?js$/.test(resolved) ? resolved : join(resolved, 'index.js');
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
      const url = new URL(request.url ?? '/', 'http://127.0.0.1'),
        pathname = decodeURIComponent(url.pathname);
      if (pathname === '/favicon.ico') {
        response.writeHead(204).end();
        return;
      }
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
  const address = server.address(),
    origin = `http://127.0.0.1:${
      typeof address === 'object' && address !== null ? address.port : 0
    }`;
  return { server, origin };
}

function markdown(result) {
  if (!result.run)
    return `# 271 — proba de browser a celor trei moduri live

Generată de \`npm run modes:live:probe\`.

**NOT_RUN** — ${result.reason}

Nu este raportat niciun PASS simulat. Testele deterministe acoperă matricea celor șase tranziții.
`;
  const checks = result.run.checks
    .map((check) => `- \`${check.name}\`: ${check.pass ? 'PASS' : 'FAIL'} — ${check.detail}`)
    .join('\n');
  return `# 271 — proba de browser a celor trei moduri live

Generată de \`npm run modes:live:probe\`; Chromium ${result.run.browser}, viewport ${result.run.viewport}.

Flux real: start → panoul \`Flotă\` → selectarea unui taxi → preluare \`M\` → tastele reale \`L\`/\`M\`
pentru toate cele șase tranziții. Proba citește numai read model-ul live al segmentelor 069,
scaunul \`PLAYER\` și textele HUD.

${checks}

## Limitări

- Proba este un scurt drum local, nu un playtest complet și nu o măsurare FPS/GPU/hardware.
- Segmentul LEARNING este expus pentru 272; nicio versiune de profil nu este publicată aici.
`;
}

const result = { version: '271-live-three-modes-probe-v1', generatedAt: new Date().toISOString() };
const playwright = await loadPlaywright();
if (playwright === null) {
  result.reason =
    'Playwright is not installed in this checkout (no `playwright` module and no PLAYWRIGHT_MODULE); the browser probe was not run.';
  await mkdir(directory, { recursive: true });
  await writeFile(browserJson, JSON.stringify(result, null, 2) + '\n');
  await writeFile(browserMarkdown, markdown(result));
  console.log('Live three-modes browser probe NOT_RUN: Playwright is not installed.');
  process.exit(0);
}

const executablePath =
  process.env.PLAYWRIGHT_EXECUTABLE ??
  (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : null);
let server;
let browser;
let debugPage;
try {
  const served = await serve(distDirectory);
  server = served.server;
  const { chromium } = playwright.default ?? playwright;
  const launchOptions = {
    headless: process.env.PLAYWRIGHT_HEADED === '1' ? false : true,
    ...(executablePath === null ? {} : { executablePath }),
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--disable-gpu-sandbox',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion',
    ],
  };
  browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  debugPage = page;
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.bringToFront();
  await page.goto(
    `${served.origin}/?capture=1&debug=1&backend=WEBGL2&preset=MEDIUM&models=procedural`,
    {
      waitUntil: 'load',
      timeout: 180000,
    },
  );
  await page.waitForFunction(() => globalThis.__v3Composition?.ready() === true, null, {
    timeout: 180000,
  });
  await page.waitForFunction(
    () => globalThis.document?.querySelector('.game-shell')?.getAttribute('data-state') === 'READY',
    null,
    { timeout: 180000 },
  );
  const backend = await page.evaluate(() => globalThis.__v3Composition.backend());
  const play = page.getByRole('button', { name: 'Joacă' });
  const resumeStart = page.getByRole('button', { name: 'Pornește' });
  const startButton = (await play.count()) > 0 ? play : resumeStart;
  await startButton.click();
  await page.waitForTimeout(500);
  const started = await page.evaluate(() => globalThis.__v3Composition.lifecycle());
  if (started?.kind !== 'PLAYING') {
    const resume = page.locator('[data-shell-action="resume"]');
    if ((await resume.count()) > 0) await resume.click();
  }
  const focusCanvas = () =>
    page.evaluate(() => {
      const canvas = globalThis.document?.querySelector('canvas');
      if (canvas instanceof globalThis.HTMLCanvasElement) canvas.focus();
    });
  const pressKey = async (key) => {
    await page.bringToFront();
    await focusCanvas();
    await page.keyboard.press(key);
  };
  await focusCanvas();
  const read = () => page.evaluate(() => globalThis.__v3Composition.read());
  const fleet = () => page.evaluate(() => globalThis.__v3Composition.fleet());
  const modes = () => page.evaluate(() => globalThis.__v3Composition.modes());
  const shell = () => page.evaluate(() => globalThis.__v3Composition.shell());
  const hudText = () =>
    page.evaluate(() => ({
      mode: globalThis.document?.querySelector(
        '.game-hud__mode[data-action="mode"] .game-hud__mode-text',
      )?.textContent,
      learning: globalThis.document?.querySelector('.game-hud__learning .game-hud__mode-text')
        ?.textContent,
      eligibility: globalThis.document?.querySelector('.game-hud__eligibility')?.textContent,
    }));
  const pumpFrame = () =>
    page.evaluate(
      () => new Promise((resolve) => globalThis.requestAnimationFrame(() => resolve(true))),
    );
  const ensurePlaying = async () => {
    const state = await page.evaluate(() => globalThis.__v3Composition.lifecycle());
    if (state?.kind !== 'PAUSED') return false;
    const resume = page.locator('[data-shell-action="resume"]');
    if ((await resume.count()) > 0) {
      await resume.click();
      await page.waitForTimeout(250);
      await focusCanvas();
      return true;
    }
    return false;
  };
  const waitTicks = async (count) => {
    const start = (await read()).tick;
    const deadline = Date.now() + 180000;
    while ((await read()).tick < start + count) {
      if (Date.now() > deadline) throw new Error(`Tick timeout after ${start} + ${count}`);
      if (await ensurePlaying()) continue;
      await pumpFrame();
      await page.waitForTimeout(50);
    }
  };
  const waitMode = async (mode) => {
    const deadline = Date.now() + 120000;
    while ((await modes())?.model.mode !== mode) {
      if (Date.now() > deadline) throw new Error(`Mode ${mode} timeout`);
      if (await ensurePlaying()) continue;
      await pumpFrame();
      await page.waitForTimeout(50);
    }
  };
  const checks = [];
  const check = (name, pass, detail) => checks.push({ name, pass, detail });
  const shot = async (name) => {
    await mkdir(screenshots, { recursive: true });
    const relative = `screenshots/${name}.png`;
    await page.screenshot({ path: join(directory, relative), timeout: 120000 });
    return relative;
  };

  await waitTicks(20);
  await page.locator('[data-shell-action="fleet"]').click();
  await page.waitForFunction(() => globalThis.__v3Composition.fleet().open === true, null, {
    timeout: 30000,
  });
  check('panel-open', (await fleet()).open === true, 'fleet panel opens over the live frame');
  const opened = await fleet();
  const taxi = opened.snapshot.fleet.vehicles.find((vehicle) => vehicle.kind === 'TAXI');
  await page.locator(`.fleet-selection__list button[data-vehicle-id="${taxi.vehicleId}"]`).click();
  await page.locator('[data-fleet-action="takeover"]').click();
  await page.waitForFunction(
    (vehicleId) => globalThis.__v3Composition.fleet().selection?.playerVehicleId === vehicleId,
    taxi.vehicleId,
    { timeout: 30000 },
  );
  await focusCanvas();
  await waitMode('MANUAL');
  const afterM = await modes();
  check(
    'auto-to-manual-segment',
    afterM.model.active?.mode === 'MANUAL' &&
      afterM.model.active.startTick > 0 &&
      afterM.model.active.startTick <= afterM.model.acceptedTick,
    `active ${afterM.model.active?.mode} start ${afterM.model.active?.startTick} at ${afterM.model.acceptedTick}`,
  );
  check(
    'one-player-seat',
    (await fleet()).snapshot.fleet.vehicles.filter((vehicle) => vehicle.playerControlled).length ===
      1,
    'exactly one PLAYER seat',
  );
  const screenshotsTaken = [await shot('01-manual')];

  await pressKey('KeyL');
  await waitMode('LEARNING');
  await waitTicks(12);
  const learning = await modes();
  const learningHud = await hudText();
  check(
    'manual-to-learning-same-tick',
    learning.model.active?.mode === 'LEARNING' &&
      learning.model.lastClosed?.mode === 'MANUAL' &&
      learning.model.lastClosed.closeReason === 'MODE_CHANGE' &&
      learning.model.active?.startTick === learning.model.lastClosed?.endTick,
    `LEARNING start ${learning.model.active?.startTick}, MANUAL closed ${learning.model.lastClosed?.endTick}`,
  );
  check(
    'learning-hud-label',
    learningHud.mode === 'Conduci · orașul învață' &&
      (learningHud.learning ?? '').includes('Learning · L') &&
      (learningHud.eligibility ?? '').includes('Eligibil'),
    `${learningHud.mode} / ${learningHud.learning} / ${learningHud.eligibility}`,
  );
  check(
    'learning-exposed-not-published',
    learning.learning.workspace === 'TELEMETRY_272' && learning.learning.profilePublications === 0,
    `${learning.learning.workspace}, publications ${learning.learning.profilePublications}`,
  );
  screenshotsTaken.push(await shot('02-learning'));

  await pressKey('KeyL');
  await waitMode('MANUAL');
  const manualAgain = await modes();
  check(
    'learning-to-manual',
    manualAgain.model.active?.mode === 'MANUAL' &&
      manualAgain.model.lastClosed?.mode === 'LEARNING' &&
      manualAgain.model.lastClosed.closeReason === 'MODE_CHANGE',
    `closed ${manualAgain.model.lastClosed?.mode}/${manualAgain.model.lastClosed?.closeReason}`,
  );

  await pressKey('KeyM');
  await waitMode('AUTO');
  await waitTicks(12);
  const autoAgain = await modes();
  const autoHud = await hudText();
  check(
    'manual-to-auto',
    autoAgain.model.active === null &&
      autoAgain.model.lastClosed?.mode === 'MANUAL' &&
      autoAgain.model.lastClosed.closeReason === 'RETURN_TO_AUTO',
    `closed ${autoAgain.model.lastClosed?.mode}/${autoAgain.model.lastClosed?.closeReason}`,
  );
  check('auto-hud-label', autoHud.mode === 'Conduce AI-ul', `${autoHud.mode}`);

  await page.locator('.game-hud__learning').click();
  await waitMode('LEARNING');
  const autoLearning = await modes();
  check(
    'hud-learning-button',
    autoLearning.model.active?.mode === 'LEARNING' &&
      autoLearning.model.lastClosed?.endTick !== autoLearning.model.active?.startTick &&
      autoLearning.model.active.learningEligible === true,
    `active ${autoLearning.model.active?.mode} eligible ${autoLearning.model.active?.learningEligible}`,
  );

  await pressKey('KeyM');
  await waitMode('AUTO');
  await waitTicks(12);
  const final = await modes();
  check(
    'learning-to-auto',
    final.model.active === null &&
      final.model.lastClosed?.mode === 'LEARNING' &&
      final.model.lastClosed.closeReason === 'RETURN_TO_AUTO' &&
      final.learning.segments.length >= 1,
    `closed ${final.model.lastClosed?.mode}/${final.model.lastClosed?.closeReason}; exposed ${final.learning.segments.length}`,
  );
  screenshotsTaken.push(await shot('03-auto-resumed'));

  result.run = {
    browser: await page.evaluate(() => globalThis.navigator.userAgent),
    backend: backend?.rendererKind ?? null,
    viewport: '1440x900',
    tick: (await read()).tick,
    checks,
    screenshots: screenshotsTaken,
    pageErrors,
    consoleErrors,
    segments: final.model.segments,
    learning: final.learning,
  };
  await mkdir(directory, { recursive: true });
  await writeFile(browserJson, JSON.stringify(result, null, 2) + '\n');
  await writeFile(browserMarkdown, markdown(result));
  console.log(
    `Live three-modes browser probe: ${checks.filter((check) => check.pass).length}/${checks.length} PASS`,
  );
} catch (error) {
  result.reason = `Browser launch/run failed: ${error instanceof Error ? error.message : String(error)}`;
  if (debugPage !== undefined) {
    try {
      result.diagnostics = await debugPage.evaluate(() => ({
        life: globalThis.__v3Composition?.lifecycle?.() ?? null,
        shell: globalThis.__v3Composition?.shell?.() ?? null,
        read: globalThis.__v3Composition?.read?.() ?? null,
        hidden: globalThis.document?.hidden ?? null,
        visibility: globalThis.document?.visibilityState ?? null,
      }));
    } catch (inspect) {
      result.diagnostics = { error: String(inspect) };
    }
  }
  await mkdir(directory, { recursive: true });
  await writeFile(browserJson, JSON.stringify(result, null, 2) + '\n');
  await writeFile(browserMarkdown, markdown(result));
  console.log(`Live three-modes browser probe NOT_RUN: ${result.reason}`);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  if (server !== undefined) await new Promise((close) => server.close(close));
}
