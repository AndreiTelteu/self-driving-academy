import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 280 browser probe.
 *
 * Runs the real production build in Chrome on WebGL2 and WebGPU. It changes the FOV through the real
 * live settings surface, takes over a taxi, captures CHASE and FIRST_PERSON at rest and while
 * driving, exits/re-enters, and reloads to prove the saved preference. A backend that is not
 * available is recorded as NOT_RUN; a failed check is FAIL, never PASS.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '280-first-person-camera'),
  browserJson = join(directory, 'browser.json'),
  reportMarkdown = join(directory, 'browser.md'),
  screenshots = join(directory, 'screenshots'),
  buildDirectory = join(root, '.pbi-validation-280', 'build');

const BACKENDS = ['WEBGL2', 'WEBGPU'];

async function loadPlaywright() {
  const explicit = process.env.PLAYWRIGHT_MODULE;
  const candidates = [
    explicit,
    'playwright',
    'C:/Users/aandr/Sites/exim-pilot/web/node_modules/playwright',
  ].filter((candidate) => typeof candidate === 'string' && candidate.length > 0);
  for (const candidate of candidates) {
    try {
      if (/^[A-Za-z]:[\\/]/.test(candidate) || candidate.includes(sep)) {
        const resolved = resolve(candidate);
        const entry = /\.(?:c|m)?js$/.test(resolved) ? resolved : join(resolved, 'index.js');
        return await import(pathToFileURL(entry).href);
      }
      return await import(candidate);
    } catch {
      // Try the next documented location; no fake browser is returned.
    }
  }
  return null;
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
  const lines = result.runs.map((run) => {
    const checks = run.checks
      .map((entry) => `  - \`${entry.name}\`: ${entry.pass ? 'PASS' : 'FAIL'} — ${entry.detail}`)
      .join('\n');
    return `## ${run.backend} — ${run.status}\n\n${run.reason ? `Motiv: ${run.reason}\n\n` : ''}${
      checks || '  - nicio verificare executată'
    }\n\n${
      run.screenshots?.length
        ? `Capturi: ${run.screenshots.map((file) => `[${file}](${file})`).join(', ')}`
        : 'Capturi: niciuna'
    }`;
  });
  return `# 280 — proba de browser first-person

Generată de \`npm run camera:first-person:probe\`. Status general: **${result.status}**.

${lines.join('\n\n')}

## Limitări

${result.limitations.map((entry) => `- ${entry}`).join('\n')}
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
await rm(screenshots, { recursive: true, force: true });
await mkdir(screenshots, { recursive: true });
const generatedAt = new Date().toISOString();
const limitations = [
  'The probe uses Chrome headless and a procedural vehicle fixture; it is not a human playtest and does not measure FPS/GPU/hardware budgets.',
  'The live car has no modelled cabin interior, so first person hides the driven exterior shell; the road, city, traffic and lights stay rendered.',
  'Mouse look/recenter and pointer capture are still the 017 fixture contract; PBI 280 mounts C, the driver anchor and the saved preference.',
];

if (playwright === null) {
  await writeResult({
    version: '280-first-person-camera-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason:
      'Playwright is not installed (no `playwright` module and no PLAYWRIGHT_MODULE); the browser probe was not run.',
    runs: [],
    limitations,
  });
  console.log('First-person camera browser probe NOT_RUN: Playwright is not installed.');
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
let browser = null;
let launchError = null;
try {
  browser = await chromium.launch({
    headless: process.env.PLAYWRIGHT_HEADED === '1' ? false : true,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
    args: [
      '--enable-unsafe-webgpu',
      '--ignore-gpu-blocklist',
      '--disable-gpu-sandbox',
      '--disable-frame-rate-limit',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion',
    ],
  });
} catch (error) {
  launchError = error;
}
if (browser === null) {
  await writeResult({
    version: '280-first-person-camera-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason: `Browser launch failed: ${launchError instanceof Error ? launchError.message : String(launchError)}`,
    runs: [],
    limitations,
  });
  server.close();
  console.log('First-person camera browser probe NOT_RUN: browser launch failed.');
  process.exit(0);
}

const runs = [];
try {
  for (const requestedBackend of BACKENDS) {
    const run = {
      backend: requestedBackend,
      status: 'NOT_RUN',
      reason: null,
      browser: null,
      checks: [],
      numbers: {},
      screenshots: [],
      pageErrors: [],
      consoleErrors: [],
    };
    let page = null;
    try {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
      });
      page = await context.newPage();
      page.on('pageerror', (error) => run.pageErrors.push(String(error)));
      page.on('console', (message) => {
        if (message.type() === 'error') run.consoleErrors.push(message.text());
      });
      await page.goto(
        `${origin}/?capture=1&debug=1&backend=${requestedBackend}&preset=MEDIUM&models=procedural&nofocuspause`,
        { waitUntil: 'load', timeout: 180000 },
      );
      await page.waitForFunction(() => globalThis.__v3Composition?.ready() === true, null, {
        timeout: 180000,
      });
      await page.waitForFunction(
        () =>
          globalThis.document?.querySelector('.game-shell')?.getAttribute('data-state') === 'READY',
        null,
        { timeout: 180000 },
      );
      const backend = await page.evaluate(() => globalThis.__v3Composition.backend());
      run.browser = await page.evaluate(() => globalThis.navigator.userAgent);
      run.numbers.backend = { requested: requestedBackend, actual: backend?.rendererKind ?? null };
      if (backend?.rendererKind !== requestedBackend) {
        run.status = 'NOT_RUN';
        run.reason = `Requested ${requestedBackend}, the live engine selected ${backend?.rendererKind ?? 'unknown'}; no PASS is claimed for this backend.`;
        await context.close();
        runs.push(run);
        continue;
      }

      const read = () => page.evaluate(() => globalThis.__v3Composition.read());
      const modes = () => page.evaluate(() => globalThis.__v3Composition.modes());
      const lifecycle = () => page.evaluate(() => globalThis.__v3Composition.lifecycle());
      const pumpFrame = () =>
        page.evaluate(
          () =>
            new Promise((resolveFrame) =>
              globalThis.requestAnimationFrame(() => resolveFrame(true)),
            ),
        );
      const ensurePlaying = async () => {
        const state = await lifecycle();
        if (state?.kind !== 'PAUSED') return false;
        const resume = page.locator('[data-shell-action="resume"]');
        if ((await resume.count()) > 0) {
          await resume.click();
          await page.waitForTimeout(150);
          await focusCanvas();
          return true;
        }
        return false;
      };
      const waitTicks = async (count) => {
        const start = (await read()).tick;
        const deadline = Date.now() + 120000;
        while ((await read()).tick < start + count) {
          if (Date.now() > deadline) throw new Error(`Tick timeout after ${start} + ${count}`);
          if (await ensurePlaying()) continue;
          await pumpFrame();
          await page.waitForTimeout(20);
        }
      };
      const focusCanvas = async () => {
        await page.bringToFront();
        await page.evaluate(() => {
          globalThis.focus();
          const canvas = globalThis.document?.querySelector('canvas');
          if (canvas instanceof globalThis.HTMLCanvasElement) canvas.focus();
        });
        await page.waitForTimeout(50);
      };
      const pressKey = async (key) => {
        await focusCanvas();
        await page.keyboard.press(key);
      };
      const shot = async (name) => {
        const relative = `screenshots/${requestedBackend.toLowerCase()}-${name}.png`;
        await page.screenshot({ path: join(directory, relative), timeout: 120000 });
        run.screenshots.push(relative);
        return relative;
      };
      const check = (name, pass, detail) => run.checks.push({ name, pass, detail });
      const sceneState = (vehicleId) =>
        page.evaluate((id) => {
          const scene = globalThis.__v3Composition.scene();
          const root = scene.getTransformNodeByName(`vehicle:${id}`);
          const meshes = root ? root.getChildMeshes(false) : [];
          return {
            minZ: scene.activeCamera.minZ,
            fov: scene.activeCamera.fov,
            vehicleMeshes: meshes.length,
            visibleVehicleMeshes: meshes.filter((mesh) => mesh.isVisible).length,
          };
        }, vehicleId);

      // Set the FOV through the real settings surface before the world starts.
      await page.evaluate(() => globalThis.__v3Composition.settingsOpen('GAME'));
      await page.waitForFunction(
        () => globalThis.document?.querySelector('.live-settings')?.hidden === false,
        null,
        { timeout: 30000 },
      );
      await page.locator('input.game-settings__range[id$="-fov"]').evaluate((element) => {
        element.value = '75';
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.locator('.live-settings .game-settings__save').click();
      await page.waitForFunction(
        () => globalThis.__v3Composition.settings().store.input.control.fov === 75,
        null,
        { timeout: 30000 },
      );
      await page.evaluate(() => globalThis.__v3Composition.settingsClose());
      run.numbers.fovSetting = 75;

      const play = page.getByRole('button', { name: 'Joacă' });
      const resumeStart = page.getByRole('button', { name: 'Pornește' });
      const startButton = (await play.count()) > 0 ? play : resumeStart;
      await startButton.click();
      await page.waitForTimeout(500);
      if ((await lifecycle())?.kind !== 'PLAYING') {
        const resume = page.locator('[data-shell-action="resume"]');
        if ((await resume.count()) > 0) await resume.click();
      }
      await focusCanvas();
      await page.locator('[data-shell-action="fleet"]').click();
      await page.waitForFunction(() => globalThis.__v3Composition.fleet().open === true, null, {
        timeout: 30000,
      });
      await page.locator('.fleet-selection__list button[data-vehicle-id="taxi-01"]').click();
      await page.locator('[data-fleet-action="takeover"]').click();
      await page.waitForFunction(
        () => globalThis.__v3Composition.fleet().selection?.playerVehicleId === 'taxi-01',
        null,
        { timeout: 30000 },
      );
      await focusCanvas();
      await waitTicks(30);
      const chaseBefore = await read();
      const chaseScene = await sceneState('taxi-01');
      const segmentBefore = (await modes()).model.active;
      await shot('01-chase-rest');
      check(
        'chase-before',
        chaseBefore.camera.mode === 'CHASE' &&
          chaseBefore.authority === 'VEHICLE:taxi-01' &&
          chaseScene.visibleVehicleMeshes > 0 &&
          Math.abs(chaseScene.minZ - 0.1) < 1e-9,
        `mode ${chaseBefore.camera.mode}, visible car meshes ${chaseScene.visibleVehicleMeshes}, minZ ${chaseScene.minZ}`,
      );

      await focusCanvas();
      run.numbers.focusBeforeC = await page.evaluate(() => ({
        hasFocus: globalThis.document.hasFocus(),
        activeElement: globalThis.document.activeElement?.tagName ?? null,
      }));
      await page.keyboard.press('KeyC');
      await page.waitForFunction(
        () => globalThis.__v3Composition.read().camera.mode === 'FIRST_PERSON',
        null,
        { timeout: 30000 },
      );
      await pumpFrame();
      await pumpFrame();
      const firstRest = await read();
      const firstScene = await sceneState('taxi-01');
      const segmentFirst = (await modes()).model.active;
      await shot('02-first-person-rest');
      check(
        'first-person-driver-anchor',
        firstRest.camera.mode === 'FIRST_PERSON' &&
          firstRest.camera.entityId === 'taxi-01' &&
          firstRest.camera.anchorM.y === firstRest.camera.positionM.y &&
          firstRest.camera.distanceM === 0,
        `mode ${firstRest.camera.mode}, anchor ${JSON.stringify(firstRest.camera.anchorM)}, distance ${firstRest.camera.distanceM}`,
      );
      check(
        'first-person-fov',
        Math.abs(firstRest.camera.fovRadians * (180 / Math.PI) - 75) < 1e-6 &&
          Math.abs(firstScene.fov - firstRest.camera.fovRadians) < 1e-6,
        `scene ${(firstScene.fov * (180 / Math.PI)).toFixed(4)}°, frame ${(firstRest.camera.fovRadians * (180 / Math.PI)).toFixed(4)}°`,
      );
      check(
        'no-car-body-in-first-person',
        firstScene.visibleVehicleMeshes === 0 && Math.abs(firstScene.minZ - 0.05) < 1e-9,
        `visible car meshes ${firstScene.visibleVehicleMeshes}/${firstScene.vehicleMeshes}, minZ ${firstScene.minZ}`,
      );
      check(
        'camera-only-switch',
        firstRest.authority === chaseBefore.authority &&
          firstRest.selection.playerVehicleId === chaseBefore.selection.playerVehicleId &&
          firstRest.selection.selectedVehicleId === chaseBefore.selection.selectedVehicleId &&
          segmentFirst?.segmentId === segmentBefore?.segmentId &&
          segmentFirst?.startTick === segmentBefore?.startTick &&
          Math.abs(firstRest.hud.speedMps - chaseBefore.hud.speedMps) < 1e-9,
        `authority ${firstRest.authority}, segment ${segmentFirst?.segmentId ?? 'none'}, speed ${firstRest.hud.speedMps}`,
      );
      run.numbers.firstRest = {
        authority: firstRest.authority,
        segment: segmentFirst?.segmentId ?? null,
        segmentStartTick: segmentFirst?.startTick ?? null,
        fovDegrees: firstRest.camera.fovRadians * (180 / Math.PI),
        positionM: firstRest.camera.positionM,
        lookAtM: firstRest.camera.lookAtM,
        minZ: firstScene.minZ,
        visibleVehicleMeshes: firstScene.visibleVehicleMeshes,
      };

      await pressKey('KeyC');
      await page.waitForFunction(
        () => globalThis.__v3Composition.read().camera.mode === 'CHASE',
        null,
        { timeout: 30000 },
      );
      await pumpFrame();
      const chaseRest = await read();
      const chaseRestScene = await sceneState('taxi-01');
      check(
        'back-to-chase',
        chaseRest.camera.mode === 'CHASE' &&
          chaseRest.authority === chaseBefore.authority &&
          chaseRestScene.visibleVehicleMeshes > 0 &&
          Math.abs(chaseRestScene.minZ - 0.1) < 1e-9,
        `mode ${chaseRest.camera.mode}, visible car meshes ${chaseRestScene.visibleVehicleMeshes}`,
      );

      // First person while driving, then C back to chase.
      await pressKey('KeyC');
      await page.waitForFunction(
        () => globalThis.__v3Composition.read().camera.mode === 'FIRST_PERSON',
        null,
        { timeout: 30000 },
      );
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(1200);
      await page.keyboard.up('KeyW');
      await waitTicks(12);
      const firstDriving = await read();
      const firstDrivingScene = await sceneState('taxi-01');
      await shot('03-first-person-driving');
      check(
        'first-person-driving',
        firstDriving.camera.mode === 'FIRST_PERSON' &&
          firstDriving.authority === 'VEHICLE:taxi-01' &&
          firstDriving.hud.speedMps > 0 &&
          firstDriving.camera.fovRadians * (180 / Math.PI) >= 75 &&
          firstDrivingScene.visibleVehicleMeshes === 0,
        `speed ${firstDriving.hud.speedMps.toFixed(3)} m/s, fov ${(firstDriving.camera.fovRadians * (180 / Math.PI)).toFixed(3)}°, visible car meshes ${firstDrivingScene.visibleVehicleMeshes}`,
      );
      run.numbers.firstDriving = {
        speedMps: firstDriving.hud.speedMps,
        fovDegrees: firstDriving.camera.fovRadians * (180 / Math.PI),
        positionM: firstDriving.camera.positionM,
      };

      await pressKey('KeyC');
      await page.waitForFunction(
        () => globalThis.__v3Composition.read().camera.mode === 'CHASE',
        null,
        { timeout: 30000 },
      );
      await pumpFrame();
      const chaseDrivingScene = await sceneState('taxi-01');
      await shot('04-chase-driving');
      check(
        'chase-driving-body-visible',
        chaseDrivingScene.visibleVehicleMeshes > 0,
        `visible car meshes ${chaseDrivingScene.visibleVehicleMeshes}/${chaseDrivingScene.vehicleMeshes}`,
      );

      // Leave the saved preference in FIRST_PERSON for the exit/re-entry checks.
      await pressKey('KeyC');
      await page.waitForFunction(
        () => globalThis.__v3Composition.read().camera.mode === 'FIRST_PERSON',
        null,
        { timeout: 30000 },
      );

      // 196 admits an exit only at a stopped car; brake with the real key first.
      await focusCanvas();
      await page.keyboard.down('KeyS');
      await page.waitForFunction(
        () => globalThis.__v3Composition.read().hud.speedMps <= 0.01,
        null,
        { timeout: 30000 },
      );
      await page.keyboard.up('KeyS');
      await waitTicks(6);
      await pressKey('KeyG');
      await page.waitForFunction(
        () => globalThis.__v3Composition.read().authority === 'CHARACTER:player-character',
        null,
        { timeout: 30000 },
      );
      // The released taxi resumes AUTO on the next ticks; re-enter while the door is still in range.
      await waitTicks(2);
      const walking = await read();
      await shot('05-walking-after-exit');
      check(
        'exit-keeps-camera-coherent',
        walking.camera.mode === 'CHASE' &&
          walking.camera.entityId === 'player-character' &&
          walking.selection.selectedVehicleId === null,
        `mode ${walking.camera.mode}, camera ${walking.camera.entityId}`,
      );

      await pressKey('KeyG');
      await page.waitForFunction(
        () => globalThis.__v3Composition.read().authority.startsWith('VEHICLE:'),
        null,
        { timeout: 30000 },
      );
      await page.waitForFunction(
        () => globalThis.__v3Composition.read().camera.mode === 'FIRST_PERSON',
        null,
        { timeout: 30000 },
      );
      await pumpFrame();
      await shot('06-first-person-reenter');
      check(
        're-enter-first-person',
        (await read()).camera.mode === 'FIRST_PERSON',
        're-entry returned to the driver seat',
      );

      // Reload: the camera mode must be restored from the 009 preference before any C press.
      await page.reload({ waitUntil: 'load', timeout: 180000 });
      await page.waitForFunction(() => globalThis.__v3Composition?.ready() === true, null, {
        timeout: 180000,
      });
      await page.waitForFunction(
        () =>
          globalThis.document?.querySelector('.game-shell')?.getAttribute('data-state') === 'READY',
        null,
        { timeout: 180000 },
      );
      const reloadedSettings = await page.evaluate(
        () => globalThis.__v3Composition.settings().store.input.cameraMode,
      );
      const playAfterReload = page.getByRole('button', { name: 'Joacă' });
      const resumeAfterReload = page.getByRole('button', { name: 'Pornește' });
      const startAfterReload =
        (await playAfterReload.count()) > 0 ? playAfterReload : resumeAfterReload;
      await startAfterReload.click();
      await page.waitForTimeout(500);
      await focusCanvas();
      await page.locator('[data-shell-action="fleet"]').click();
      await page.waitForFunction(() => globalThis.__v3Composition.fleet().open === true, null, {
        timeout: 30000,
      });
      await page.locator('.fleet-selection__list button[data-vehicle-id="taxi-01"]').click();
      await page.locator('[data-fleet-action="takeover"]').click();
      await page.waitForFunction(
        () => globalThis.__v3Composition.read().camera.mode === 'FIRST_PERSON',
        null,
        { timeout: 30000 },
      );
      await pumpFrame();
      await shot('07-first-person-reload');
      const reloadedFrame = await read();
      check(
        'reload-restores-first-person',
        reloadedSettings === 'FIRST_PERSON' && reloadedFrame.camera.mode === 'FIRST_PERSON',
        `store ${reloadedSettings}, camera ${reloadedFrame.camera.mode}`,
      );
      run.numbers.reload = {
        storeCameraMode: reloadedSettings,
        cameraMode: reloadedFrame.camera.mode,
      };
      check(
        'browser-errors',
        run.pageErrors.length === 0,
        `page errors ${run.pageErrors.length}${run.pageErrors.length ? `: ${run.pageErrors.join(' | ')}` : ''}`,
      );

      run.status = run.checks.every((entry) => entry.pass) ? 'PASS' : 'FAIL';
      run.reason =
        run.status === 'PASS'
          ? null
          : run.checks
              .filter((entry) => !entry.pass)
              .map((entry) => entry.name)
              .join(', ');
      await context.close();
    } catch (error) {
      run.status = 'FAIL';
      run.reason = `Browser run failed: ${error instanceof Error ? error.message : String(error)}`;
      if (page !== null) {
        try {
          run.diagnostics = await page.evaluate(() => ({
            read: globalThis.__v3Composition?.read?.() ?? null,
            modes: globalThis.__v3Composition?.modes?.() ?? null,
            fleet: globalThis.__v3Composition?.fleet?.() ?? null,
            lifecycle: globalThis.__v3Composition?.lifecycle?.() ?? null,
            shell: globalThis.__v3Composition?.shell?.() ?? null,
            activeElement: globalThis.document?.activeElement?.tagName ?? null,
          }));
        } catch (inspect) {
          run.diagnostics = { error: String(inspect) };
        }
        try {
          await page.screenshot({
            path: join(directory, `screenshots/${requestedBackend.toLowerCase()}-failure.png`),
            timeout: 120000,
          });
          run.screenshots.push(`screenshots/${requestedBackend.toLowerCase()}-failure.png`);
        } catch {
          // The failure report remains the evidence when the page cannot be captured.
        }
      }
    }
    runs.push(run);
  }
} finally {
  await browser.close().catch(() => undefined);
  server.close();
}

const passed = runs.filter((run) => run.status === 'PASS').length;
const notRun = runs.filter((run) => run.status === 'NOT_RUN').length;
const failed = runs.filter((run) => run.status === 'FAIL').length;
const status =
  passed === BACKENDS.length ? 'PASS' : passed === 0 && failed === 0 ? 'NOT_RUN' : 'PARTIAL';
const result = {
  version: '280-first-person-camera-browser-v1',
  generatedAt,
  status,
  note:
    status === 'PASS'
      ? 'Both requested backends passed every check.'
      : 'A backend that is unavailable is NOT_RUN; a failed check is FAIL. No backend is marked PASS without its own run.',
  runs,
  summary: { requested: BACKENDS.length, passed, notRun, failed },
  limitations,
};
await writeResult(result);
console.log(
  `First-person camera browser probe: ${status}; ${passed}/${BACKENDS.length} backends PASS, ${notRun} NOT_RUN, ${failed} FAIL`,
);
if (status !== 'PASS') process.exitCode = 1;
