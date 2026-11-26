import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 260 — proba de browser a shell-ului jocului.
 *
 * `npm run shell:probe` construiește aplicația reală și rulează aceeași secvență pe WebGL2 și
 * WebGPU: start, intrare în taxi, conducere, deschidere panou, verificarea faptului că tick-ul este
 * suspendat, închidere, reluare și conducere din nou. Fiecare backend este raportat separat; dacă
 * unul nu poate rula, rezultatul este `NOT_RUN` cu motivul real, niciodată simulat.
 *
 * Playwright este opțional (`PLAYWRIGHT_MODULE`); `PLAYWRIGHT_CHANNEL=chrome` folosește Chrome-ul
 * instalat când browserul bundled nu corespunde versiunii modulului.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '260-game-shell'),
  browserJson = join(directory, 'browser.json'),
  reportMarkdown = join(directory, 'report.md'),
  screenshots = join(directory, 'screenshots'),
  buildDirectory = join(root, '.pbi-validation-260', 'build');

const only = process.argv.find((argument) => argument.startsWith('--only='))?.slice(7) ?? null;
const CONFIGS = [
  {
    id: 'webgl2',
    preference: 'WEBGL2',
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--disable-gpu-sandbox',
    ],
  },
  {
    id: 'webgpu',
    preference: 'WEBGPU',
    headless: false,
    args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
  },
].filter((config) => only === null || config.id === only);

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
      '.js': 'text/javascript',
      '.css': 'text/css',
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

function summary(costs) {
  return {
    samples: costs.samples,
    meanMs: Number(costs.meanMs.toFixed(4)),
    p50Ms: Number(costs.p50Ms.toFixed(4)),
    p95Ms: Number(costs.p95Ms.toFixed(4)),
    maxMs: Number(costs.maxMs.toFixed(4)),
  };
}

async function runConfig(playwright, origin, config) {
  const { chromium } = playwright.default ?? playwright;
  const channel = process.env.PLAYWRIGHT_CHANNEL || undefined;
  let browser;
  try {
    browser = await chromium.launch({
      headless: config.headless,
      ...(channel === undefined ? {} : { channel }),
      args: config.args,
    });
  } catch (error) {
    return {
      id: config.id,
      status: 'NOT_RUN',
      requestedBackend: config.preference,
      reason: `Browser launch failed: ${error instanceof Error ? error.message : String(error)}`,
    };
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
    const url =
      `${origin}/?capture=1&backend=${config.preference}` +
      '&preset=MEDIUM&models=procedural&time=noon';
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => globalThis.__v3Composition?.ready() === true, null, {
      timeout: 180000,
    });
    const backend = await page.evaluate(() => globalThis.__v3Composition.backend());
    const actualBackend = backend?.rendererKind ?? null;
    if (actualBackend !== config.preference) {
      return {
        id: config.id,
        status: 'NOT_RUN',
        requestedBackend: config.preference,
        actualBackend,
        reason: `Backend ${config.preference} was not initialized; the app reported ${String(actualBackend)}.`,
        pageErrors,
        consoleErrors,
      };
    }
    await page.waitForFunction(
      () =>
        globalThis.document?.querySelector('.game-shell')?.getAttribute('data-state') === 'READY',
      null,
      { timeout: 180000 },
    );
    const play = page.getByRole('button', { name: 'Joacă' });
    const resumeStart = page.getByRole('button', { name: 'Pornește' });
    const startButton = (await play.count()) > 0 ? play : resumeStart;
    if ((await startButton.count()) === 0)
      return {
        id: config.id,
        status: 'NOT_RUN',
        requestedBackend: config.preference,
        actualBackend,
        reason: 'The start button was not found after READY.',
        pageErrors,
        consoleErrors,
      };
    await startButton.click();
    // Canvasul este suprafața reală de joc; un buton rămas activ ar bloca tastele 025.
    await page.evaluate(() => {
      const canvas = globalThis.document?.querySelector('canvas');
      if (canvas instanceof globalThis.HTMLCanvasElement) canvas.focus();
    });

    const read = () => page.evaluate(() => globalThis.__v3Composition.read());
    const diagnostics = () =>
      page.evaluate(() => {
        const active = globalThis.document?.activeElement;
        return {
          state:
            globalThis.document?.querySelector('.game-shell')?.getAttribute('data-state') ?? null,
          hasFocus: globalThis.document?.hasFocus() ?? false,
          active:
            active === null || active === undefined
              ? null
              : `${active.tagName}.${active.className ?? ''}`,
          lifecycle: globalThis.__v3Composition.lifecycle(),
          shell: globalThis.__v3Composition.shell(),
        };
      });
    const shellStatus = () => page.evaluate(() => globalThis.__v3Composition.shell());
    const shellHostStats = () => page.evaluate(() => globalThis.__v3Composition.shellHost());
    const stateKind = () =>
      page.evaluate(
        () => globalThis.document?.querySelector('.game-shell')?.getAttribute('data-state') ?? null,
      );
    const heldKeys = new Set();
    const keyDown = async (key) => {
      heldKeys.add(key);
      await page.keyboard.down(key);
    };
    const keyUp = async (key) => {
      heldKeys.delete(key);
      await page.keyboard.up(key);
    };
    const resumeIfPaused = async () => {
      if ((await stateKind()) !== 'PAUSED') return false;
      const resume = page.locator('.pause-menu [data-action="resume"]');
      if ((await resume.count()) === 0) return false;
      await resume.click();
      await page.evaluate(() => {
        const canvas = globalThis.document?.querySelector('canvas');
        if (canvas instanceof globalThis.HTMLCanvasElement) canvas.focus();
      });
      // Reluarea golește comenzile ținute (025); tastele fizice se retrimit ca un keydown nou.
      for (const key of heldKeys) {
        await page.keyboard.up(key);
        await page.keyboard.down(key);
      }
      return true;
    };
    const waitTicks = async (count) => {
      const start = (await read()).tick;
      const deadline = Date.now() + 180000;
      while ((await read()).tick < start + count) {
        if (Date.now() > deadline) throw new Error(`Tick timeout after ${start} + ${count}`);
        if (await resumeIfPaused()) continue;
        await page.waitForTimeout(100);
      }
    };
    const shot = async (name) => {
      await mkdir(screenshots, { recursive: true });
      const relative = `screenshots/${name}-${config.id}.png`;
      await page.screenshot({ path: join(directory, relative), timeout: 120000 });
      return relative;
    };

    await waitTicks(20);
    const initial = await read();
    const initialShell = await shellStatus();
    const afterStartDiagnostics = await diagnostics();
    const screenshotsTaken = [await shot('01-start')];

    await page.keyboard.press('KeyG');
    await waitTicks(20);
    const entered = await read();
    const enteredVehicle = entered.authority === 'VEHICLE:taxi-01';
    const taxiAfterEntry = entered.vehicles.find((vehicle) => vehicle.vehicleId === 'taxi-01');
    const afterEntryDiagnostics = await diagnostics();

    await keyDown('KeyW');
    await waitTicks(120);
    await keyUp('KeyW');
    const driven = await read();
    const afterDriveDiagnostics = await diagnostics();
    const taxiAfterDrive = driven.vehicles.find((vehicle) => vehicle.vehicleId === 'taxi-01');
    const driveDistanceM =
      taxiAfterEntry !== undefined && taxiAfterDrive !== undefined
        ? Math.hypot(
            taxiAfterDrive.positionM.x - taxiAfterEntry.positionM.x,
            taxiAfterDrive.positionM.z - taxiAfterEntry.positionM.z,
          )
        : 0;
    screenshotsTaken.push(await shot('02-driving'));

    // Panoul se testează dintr-o stare PLAYING curată: o pauză de suprasarcină rămasă ar
    // masca tranziția panel → suspendat → reluat.
    await resumeIfPaused();
    await page
      .waitForFunction(
        () =>
          globalThis.document?.querySelector('.game-shell')?.getAttribute('data-state') ===
          'PLAYING',
        null,
        { timeout: 15000 },
      )
      .catch(() => {});

    // Panoul se deschide din butonul real al gazdei shell-ului; în MANUAL suspendă tick-ul.
    const panelButton = page.locator('[data-shell-action="panel"]');
    await panelButton.click();
    await page.waitForSelector('[data-shell-panel]', { state: 'visible', timeout: 30000 });
    const tickAtPanelOpen = (await read()).tick;
    const shellAtPanel = await shellStatus();
    const hostAtPanel = await shellHostStats();
    const panelRows = await page.locator('[data-shell-system]').count();
    const absentRows = await page
      .locator('[data-shell-system][data-shell-status="ABSENT"]')
      .count();
    const summaryText = await page.locator('.game-shell-host__summary').textContent();
    screenshotsTaken.push(await shot('03-panel'));
    await page.waitForTimeout(700);
    const tickDuringPanel = (await read()).tick;
    const afterPanelDiagnostics = await diagnostics();
    await page.locator('[data-shell-action="close-panel"]').click();
    // Închiderea readuce focusul pe canvas și poate relua simularea; dacă aplicația era deja în
    // pauză (suprasarcină), meniul de pauză rămâne singura cale explicită de reluare.
    await page.waitForTimeout(250);
    if ((await stateKind()) !== 'PLAYING') await resumeIfPaused();
    const resumedPlaying = await page
      .waitForFunction(
        () =>
          globalThis.document?.querySelector('.game-shell')?.getAttribute('data-state') ===
          'PLAYING',
        null,
        { timeout: 15000 },
      )
      .then(() => true)
      .catch(() => false);
    let resumedDistanceM = 0;
    let tickAfterPanel = tickDuringPanel;
    if (resumedPlaying) {
      await waitTicks(20);
      tickAfterPanel = (await read()).tick;
      await keyDown('KeyW');
      await waitTicks(60);
      await keyUp('KeyW');
    }
    const afterCloseDiagnostics = await diagnostics();
    const resumed = await read();
    const taxiAfterResume = resumed.vehicles.find((vehicle) => vehicle.vehicleId === 'taxi-01');
    if (resumedPlaying && taxiAfterDrive !== undefined && taxiAfterResume !== undefined)
      resumedDistanceM = Math.hypot(
        taxiAfterResume.positionM.x - taxiAfterDrive.positionM.x,
        taxiAfterResume.positionM.z - taxiAfterDrive.positionM.z,
      );
    screenshotsTaken.push(await shot('04-resumed'));

    const finalShell = await shellStatus();
    const finalHost = await shellHostStats();
    const finalState = await stateKind();
    const backendInfo = await page.evaluate(() => globalThis.__v3Composition.backend());
    const costs = finalShell.costs;
    const compositionCosts = resumed.costs;

    // Reload real: o pagină nouă nu are voie să lase două lumi, două bucle sau doi listeneri.
    const tickBeforeReload = finalShell.tick;
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => globalThis.__v3Composition?.ready() === true, null, {
      timeout: 180000,
    });
    await page.waitForFunction(
      () =>
        globalThis.document?.querySelector('.game-shell')?.getAttribute('data-state') === 'READY',
      null,
      { timeout: 180000 },
    );
    const reloadShell = await shellStatus();
    const reloadHost = await shellHostStats();
    const reloadRead = await read();
    const reloadHosts = await page.locator('[data-game-shell-host]').count();
    const reloadPlay = page.getByRole('button', { name: 'Joacă' });
    const hostStart = page.locator('[data-shell-action="start"]');
    if ((await hostStart.count()) > 0 && (await hostStart.isVisible())) await hostStart.click();
    else if ((await reloadPlay.count()) > 0) await reloadPlay.click();
    await waitTicks(5);
    const reloadAfterStart = await shellStatus();

    // Controalele gazdei: start → pauză (suspendare meniu) → reluare, fără al doilea tick owner.
    await resumeIfPaused();
    await page
      .waitForFunction(
        () =>
          globalThis.document?.querySelector('.game-shell')?.getAttribute('data-state') ===
          'PLAYING',
        null,
        { timeout: 15000 },
      )
      .catch(() => {});
    const tickBeforeHostPause = (await read()).tick;
    const hostPause = page.locator('[data-shell-action="pause"]');
    let hostControls = {
      pauseClicked: false,
      resumeClicked: false,
      cause: null,
      tickBefore: tickBeforeHostPause,
      tickAtPause: tickBeforeHostPause,
      tickWhilePaused: tickBeforeHostPause,
      tickAfterResume: tickBeforeHostPause,
      pass: false,
    };
    if ((await hostPause.count()) > 0 && (await hostPause.isVisible())) {
      await hostPause.click();
      await page.waitForFunction(
        () =>
          globalThis.document?.querySelector('.game-shell')?.getAttribute('data-state') ===
          'PAUSED',
        null,
        { timeout: 15000 },
      );
      const pausedShell = await shellStatus();
      // Tick-ul de după confirmarea pauzei este referința; click-ul în sine poate consuma cadre.
      const tickAtPause = (await read()).tick;
      await page.waitForTimeout(350);
      const tickWhilePaused = (await read()).tick;
      const hostResume = page.locator('[data-shell-action="resume"]');
      const resumeClicked = (await hostResume.count()) > 0 && (await hostResume.isVisible());
      if (resumeClicked) await hostResume.click();
      await waitTicks(3);
      const tickAfterResume = (await read()).tick;
      hostControls = {
        pauseClicked: true,
        resumeClicked,
        cause: pausedShell.cause,
        tickBefore: tickBeforeHostPause,
        tickAtPause,
        tickWhilePaused,
        tickAfterResume,
        pass:
          resumeClicked &&
          pausedShell.cause === 'menu' &&
          tickWhilePaused === tickAtPause &&
          tickAfterResume > tickWhilePaused,
      };
    }
    const reload = {
      tickBefore: tickBeforeReload,
      worldTickAtReady: reloadShell.world.tick,
      ticksAtReady: reloadShell.ticks,
      readTickAtReady: reloadRead.tick,
      attachments: reloadShell.world.attachments,
      activeWorlds: reloadShell.world.activeWorlds,
      maxActiveWorlds: reloadShell.world.maxActiveWorlds,
      hostCount: reloadHosts,
      hostListeners: reloadHost.listeners,
      hostGlobalListeners: reloadHost.globalListeners,
      ticksAfterStart: reloadAfterStart.ticks,
      attachmentsAfterStart: reloadAfterStart.world.attachments,
      hostControls,
    };
    const reloadPass =
      reload.hostCount === 1 &&
      reload.hostListeners === 8 &&
      reload.hostGlobalListeners === 0 &&
      reload.ticksAtReady === 0 &&
      reload.worldTickAtReady === 1 &&
      reload.readTickAtReady === 1 &&
      reload.attachments === 1 &&
      reload.activeWorlds === 1 &&
      reload.maxActiveWorlds === 1 &&
      reload.ticksAfterStart >= 5 &&
      reload.attachmentsAfterStart === 1 &&
      reload.hostControls.pass;
    screenshotsTaken.push(await shot('05-reload'));
    const budgetMs = 8;
    const pass =
      actualBackend === config.preference &&
      initialShell.world.attachments === 1 &&
      initialShell.world.maxActiveWorlds === 1 &&
      enteredVehicle &&
      driveDistanceM > 2 &&
      shellAtPanel.panelOpen === true &&
      shellAtPanel.paused === true &&
      panelRows >= 16 &&
      absentRows === finalShell.portsAbsent &&
      finalShell.portsPresent === 1 &&
      tickDuringPanel === tickAtPanelOpen &&
      resumedPlaying &&
      tickAfterPanel > tickDuringPanel &&
      resumedDistanceM > 1 &&
      finalState === 'PLAYING' &&
      reloadPass &&
      finalHost.globalListeners === 0 &&
      finalShell.world.attachments === 1 &&
      pageErrors.length === 0 &&
      consoleErrors.length === 0;
    return {
      id: config.id,
      status: 'MEASURED',
      pass,
      browser: `${browser.version()}${channel === undefined ? '' : ` (${channel})`}`,
      requestedBackend: config.preference,
      actualBackend,
      backendInfo,
      preset: 'MEDIUM',
      viewport: '1440x900',
      fixture: {
        id: '260-game-shell-v1',
        trafficSeed: 256,
        composedVehicles: 'taxi-01 + civil-01 + 24 ambient AI',
        models: 'procedural',
        timeOfDay: 'noon',
        panel: 'integration',
      },
      url,
      finalState,
      start: {
        tick: initial.tick,
        authority: initial.authority,
        mode: initial.hud.mode,
        systems: initialShell.systems.length,
        portsPresent: initialShell.portsPresent,
        portsAbsent: initialShell.portsAbsent,
        tickOrder: initialShell.tickOrder,
      },
      drive: {
        enteredVehicle,
        authority: driven.authority,
        driveDistanceM: Number(driveDistanceM.toFixed(3)),
        resumedDistanceM: Number(resumedDistanceM.toFixed(3)),
      },
      panel: {
        open: shellAtPanel.panelOpen,
        paused: shellAtPanel.paused,
        cause: shellAtPanel.cause,
        liveCause: afterPanelDiagnostics.shell.cause,
        rows: panelRows,
        absentRows,
        summary: summaryText,
        shellHost: hostAtPanel,
        tickAtOpen: tickAtPanelOpen,
        tickDuring: tickDuringPanel,
        tickAfter: tickAfterPanel,
        resumedPlaying,
      },
      reload: { ...reload, pass: reloadPass },
      diagnostics: {
        afterStart: afterStartDiagnostics,
        afterEntry: afterEntryDiagnostics,
        afterDrive: afterDriveDiagnostics,
        afterPanel: afterPanelDiagnostics,
        afterClose: afterCloseDiagnostics,
      },
      world: finalShell.world,
      costs: {
        shellTick: summary(costs.tick),
        shellPresent: summary(costs.present),
        compositionTick: summary(compositionCosts.tick),
        compositionPresent: summary(compositionCosts.present),
        compositionFrame: summary(compositionCosts.frame),
        budgetMs,
        laptopFrameP95BudgetMs: 35,
        shellTickWithinBudget: costs.tick.p95Ms <= budgetMs,
        frameP95WithinLaptopBudget: compositionCosts.frame.p95Ms <= 35,
        shellOverheadP50Ms: Number((costs.tick.p50Ms - compositionCosts.tick.p50Ms).toFixed(4)),
        shellOverheadP95Ms: Number((costs.tick.p95Ms - compositionCosts.tick.p95Ms).toFixed(4)),
      },
      finalShell,
      finalHost,
      pageErrors,
      consoleErrors,
      screenshots: screenshotsTaken,
    };
  } finally {
    await browser.close();
  }
}

function markdown(result) {
  const runs = result.runs;
  const rows = runs
    .map((run) => {
      if (run.status !== 'MEASURED')
        return `| ${run.id} | ${run.requestedBackend} | ${run.actualBackend ?? '—'} | **NOT_RUN** — ${run.reason} | — | — |`;
      return `| ${run.id} | ${run.requestedBackend} | ${run.actualBackend} | ${run.pass ? 'PASS' : 'FAIL'} | ${run.drive.driveDistanceM} m / ${run.drive.resumedDistanceM} m | ${run.costs.shellTick.p95Ms} ms |`;
    })
    .join('\n');
  const details = runs
    .filter((run) => run.status === 'MEASURED')
    .map(
      (run) => `### ${run.id} — ${run.actualBackend}

- Browser: **${run.browser}**, viewport ${run.viewport}, preset \`${run.preset}\`, fixture \`${run.fixture.id}\` (seed trafic ${run.fixture.trafficSeed}, ${run.fixture.composedVehicles}, modele ${run.fixture.models}).
- GPU: vendor \`${run.backendInfo?.vendor ?? 'unknown'}\`, renderer \`${run.backendInfo?.renderer ?? 'unknown'}\`, engine \`${run.backendInfo?.engineDescription ?? 'unknown'}\`, rezoluție internă ${run.backendInfo?.renderWidth ?? '—'}×${run.backendInfo?.renderHeight ?? '—'}.
- Start: tick ${run.start.tick}, autoritate \`${run.start.authority}\`, mod \`${run.start.mode}\`, porturi ${run.start.portsPresent}/${run.start.portsPresent + run.start.portsAbsent}.
- Conducere: taxi intrat **${run.drive.enteredVehicle ? 'da' : 'nu'}**, deplasare ${run.drive.driveDistanceM} m, apoi ${run.drive.resumedDistanceM} m după panou.
- Panou: deschis ${run.panel.open}, suspendat ${run.panel.paused} (${run.panel.cause ?? '—'}), ${run.panel.rows} rânduri, ${run.panel.absentRows} absente; tick ${run.panel.tickAtOpen} → ${run.panel.tickDuring} → ${run.panel.tickAfter}.
- Lume: ${run.world.attachments} atașări, ${run.world.activeWorlds}/${run.world.maxActiveWorlds} lumi active.
- Reload: ${run.reload.pass ? 'PASS' : 'FAIL'} — tick ${run.reload.tickBefore} → ${run.reload.worldTickAtReady} la READY, ${run.reload.attachments} atașare, ${run.reload.activeWorlds}/${run.reload.maxActiveWorlds} lumi, ${run.reload.hostCount} gazdă, ${run.reload.ticksAfterStart} tick-uri după start. Controale gazdă: start→pauză→reluare ${run.reload.hostControls.pass ? 'PASS' : 'FAIL'} (cauză ${run.reload.hostControls.cause ?? '—'}, tick ${run.reload.hostControls.tickAtPause} → ${run.reload.hostControls.tickWhilePaused} → ${run.reload.hostControls.tickAfterResume}).
- Gazda UI: ${run.finalHost.globalListeners} listeneri globali, ${run.finalHost.listeners} listeneri de element.
- Cost tick shell p50/p95: ${run.costs.shellTick.p50Ms}/${run.costs.shellTick.p95Ms} ms (buget ${run.costs.budgetMs} ms, ${run.costs.shellTickWithinBudget ? 'în buget' : 'peste buget'}); compunere p50/p95: ${run.costs.compositionTick.p50Ms}/${run.costs.compositionTick.p95Ms} ms; overhead shell p50/p95: ${run.costs.shellOverheadP50Ms}/${run.costs.shellOverheadP95Ms} ms.
- Cost prezentare shell p50/p95: ${run.costs.shellPresent.p50Ms}/${run.costs.shellPresent.p95Ms} ms; interval cadru compunere p50/p95: ${run.costs.compositionFrame.p50Ms}/${run.costs.compositionFrame.p95Ms} ms (buget laptop p95 ${run.costs.laptopFrameP95BudgetMs} ms, ${run.costs.frameP95WithinLaptopBudget ? 'în buget' : 'peste buget'}).
- Erori pagină/consolă: ${run.pageErrors.length}/${run.consoleErrors.length}.
- Capturi: ${run.screenshots.map((file) => `[${file}](${file})`).join(', ')}.
`,
    )
    .join('\n');
  return `# 260 — proba de browser a shell-ului jocului

Generată de \`npm run shell:probe\` pe ${result.generatedAt}. Fiecare backend este o rulare separată
a aceleiași secvențe reale: start, intrare în taxi cu \`G\`, conducere cu \`W\`, panou deschis din
butonul shell-ului, verificarea suspendării tick-ului, închidere, reluare și un reload real.

| Rulare | Cerut | Real | Verdict | Deplasare | Tick shell p95 |
| --- | --- | --- | --- | --- | --- |
${rows}

${details}
## Limitări

- WebGL2 rulează pe SwiftShader (randare software); intervalele de cadru nu sunt FPS hardware.
- WebGPU este încercat pe browser headed cu GPU-ul real; dacă nu este disponibil, rularea este
  \`NOT_RUN\` cu motivul real, nu un PASS simulat.
- Proba acoperă shell-ul și compunerea V3 existentă. Flota live, cursele, economia, learning-ul,
  misiunile și persistența rămân dependențe ale taskurilor 261–286 și sunt raportate ca absente.
`;
}

const playwright = await loadPlaywright();
if (playwright === null) {
  await mkdir(directory, { recursive: true });
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: 'NOT_RUN',
    reason: 'Playwright is not installed. Set PLAYWRIGHT_MODULE to its entry point.',
    runs: [],
  };
  await writeFile(browserJson, `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(reportMarkdown, markdown(result));
  console.log('Game shell browser probe NOT_RUN: Playwright is not installed.');
  process.exitCode = 1;
} else {
  const { build } = await import('vite');
  await build({
    configFile: join(root, 'vite.config.ts'),
    root,
    base: './',
    cacheDir: join(root, '.pbi-validation-260', 'cache'),
    logLevel: 'warn',
    build: { outDir: buildDirectory, emptyOutDir: true },
  });
  const { server, origin } = await serve(buildDirectory);
  const runs = [];
  try {
    for (const config of CONFIGS) {
      console.log(
        `Game shell probe: ${config.id} (${config.preference}, headless=${config.headless})`,
      );
      const run = await runConfig(playwright, origin, config);
      runs.push(run);
      console.log(
        `  ${run.status}${run.status === 'MEASURED' ? ` ${run.pass ? 'PASS' : 'FAIL'}` : ` — ${run.reason}`}`,
      );
    }
  } finally {
    server.close();
  }
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: runs.some((run) => run.status === 'MEASURED' && run.pass) ? 'MEASURED' : 'NOT_RUN',
    runs,
  };
  await mkdir(directory, { recursive: true });
  await writeFile(browserJson, `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(reportMarkdown, markdown(result));
  console.log(`Wrote ${browserJson}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (runs.some((run) => run.status !== 'MEASURED' || !run.pass)) process.exitCode = 1;
}
