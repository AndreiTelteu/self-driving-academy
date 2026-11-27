import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 275 browser probe.
 *
 * It starts the real build, completes the five-step tutorial with the real input path, drives a
 * claimed 265 ride manually to its real 032 anchors, verifies that stage 1 and its 125 reward were
 * settled once, then performs a real world reset and verifies that the open stage 2 failed with the
 * real SCENARIO_RESET reason while the learned profile and the granted XP stayed untouched.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '275-live-missions'),
  browserJson = join(directory, 'browser.json'),
  reportMarkdown = join(directory, 'browser.md'),
  screenshots = join(directory, 'screenshots'),
  buildDirectory = join(root, '.pbi-validation-275', 'build');

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
  if (result.status !== 'PASS') {
    return `# 275 — proba de browser a misiunilor live

Generată de \`npm run missions:live:probe\`.

**${result.status}** — ${result.reason}

Nu este raportat niciun PASS simulat. Raportul determinist acoperă contractele 116/117/125.
`;
  }
  const run = result.run;
  const checks = run.checks
    .map((entry) => `- \`${entry.name}\`: ${entry.pass ? 'PASS' : 'FAIL'} — ${entry.detail}`)
    .join('\n');
  return `# 275 — proba de browser a misiunilor live

Generată de \`npm run missions:live:probe\`; Chromium ${run.browser}, backend ${run.backend},
viewport ${run.viewport}, tick ${run.tickAtStart}–${run.tickAtFailure}.

Secvența reală: start → tutorial selectat prin preluarea unui taxi revendicat → MANUAL → LEARNING
eligibil oprit de tutorial → AUTO → pickup/dropoff 032 reale conduse de actorul 058 → etapa 1
\`COMPLETED\` cu recompensa 125 o singură dată → „Oraș proaspăt” real → etapa 2 \`FAILED\` cu motivul
\`SCENARIO_RESET\` → panoul arată etapa 1 completă, etapa 2 eșuată, reluarea disponibilă.

- Taxi: \`${run.taxiId}\`; cursă: \`${run.rideId}\`; pickup \`${run.pickupZoneId}\` → dropoff
  \`${run.dropoffZoneId}\`; boarding ${run.boardingTick}, completion ${run.completionTick}.
- Etapa 1: ${run.stage1State}; XP ${run.xpAfterStage1}; recompense acordate ${run.rewardsAfterStage1}.
- Etapa 2: ${run.stage2State} / ${run.failureReason}; XP după eșec ${run.xpAfterFailure}; amprenta
  profilului ${run.profileFingerprintEqual ? 'identică' : 'diferită'}.
- Panou: ${run.panelMissions} misiuni, etapa 1 \`data-state="${run.stage1PanelState}"\`, etapa 2
  \`data-attempt-state="${run.stage2PanelAttemptState}"\`, \`data-failure="${run.stage2PanelFailure}"\`,
  \`data-replay="${run.stage2PanelReplay}"\`.

Capturi: ${run.screenshots.map((file) => `[${file}](${file})`).join(', ')}.

${checks}

Limite: proba conduce cu input real și poziția autoritară a compunerii, dar nu înlocuiește un
playtest uman și nu măsoară FPS/GPU. Eșecul este produs de resetul real de scenariu al shell-ului,
nu de un eveniment fabricat.
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

if (playwright === null) {
  await writeResult({
    version: '275-live-missions-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason:
      'Playwright is not installed in this checkout (no `playwright` module and no PLAYWRIGHT_MODULE); the browser probe was not run.',
    run: null,
  });
  console.log('Live missions browser probe NOT_RUN: Playwright is not installed.');
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
              '--disable-frame-rate-limit',
            ]
          : ['--disable-gpu-sandbox', '--disable-frame-rate-limit'],
    });
    break;
  } catch (error) {
    launchError = error;
  }
}
if (browser === null) {
  await writeResult({
    version: '275-live-missions-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason: `Browser launch failed: ${launchError instanceof Error ? launchError.message : String(launchError)}`,
    run: null,
  });
  server.close();
  console.log('Live missions browser probe NOT_RUN: browser launch failed.');
  process.exit(0);
}

let result;
let debugPage = null;
try {
  const context = await browser.newContext({ viewport: { width: 1024, height: 640 } });
  const page = await context.newPage();
  debugPage = page;
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.bringToFront();
  const url = `${origin}/?capture=1&backend=WEBGL2&preset=LOW&models=procedural&time=noon&debug=1&nofocuspause`;
  const read = () => page.evaluate(() => globalThis.__v3Composition.read());
  const shell = () => page.evaluate(() => globalThis.__v3Composition.shell());
  const rides = () => page.evaluate(() => globalThis.__v3Composition.rides());
  const missions = () => page.evaluate(() => globalThis.__v3Composition.missions());
  const profile = async () => {
    const learning = await page.evaluate(() => globalThis.__v3Composition.learning());
    return JSON.stringify({
      style: learning?.style?.parameters ?? learning?.style ?? null,
      head: learning?.model?.headVersionId ?? null,
      version: learning?.model?.profileVersionId ?? null,
    });
  };
  const focusCanvas = () =>
    page.evaluate(() => {
      const canvas = globalThis.document?.querySelector('canvas');
      if (canvas instanceof globalThis.HTMLCanvasElement) canvas.focus();
    });
  const resumeOverload = async () => {
    const lifecycle = await page.evaluate(() => globalThis.__v3Composition.lifecycle());
    if (lifecycle?.kind !== 'PAUSED' || lifecycle.reason !== 'overload') return;
    const reia = page.getByRole('button', { name: 'Reia' });
    if ((await reia.count()) === 0) return;
    await reia.click().catch(() => {});
    await focusCanvas();
  };
  const waitUntil = async (predicate, argument, timeout, label) => {
    const deadline = Date.now() + timeout;
    for (;;) {
      if (await page.evaluate(predicate, argument)) return;
      await resumeOverload();
      if (Date.now() > deadline) {
        const lifecycle = await page.evaluate(() => globalThis.__v3Composition.lifecycle());
        const shellState = await page.evaluate(() => globalThis.__v3Composition.shell());
        const missionState = await page.evaluate(() => globalThis.__v3Composition.missions());
        const modeState = await page.evaluate(() => globalThis.__v3Composition.modes());
        throw new Error(
          `Timeout waiting for ${label}: lifecycle ${lifecycle?.kind}/${lifecycle?.reason ?? 'none'}, shell paused ${shellState?.paused}/${shellState?.cause ?? 'none'}, tick ${shellState?.tick}, mode ${modeState?.model?.mode}, tutorial ${missionState?.tutorialInstance?.state}/${missionState?.tutorialInstance?.stepIndex}, page errors ${pageErrors.length}, console errors ${consoleErrors.length}`,
        );
      }
      await page.waitForTimeout(100);
    }
  };
  const shot = async (name) => {
    const relative = `screenshots/${name}.png`;
    await page.screenshot({ path: join(directory, relative), timeout: 120000 });
    return relative;
  };
  const checks = [];
  const screenshotsTaken = [];
  const check = (name, pass, detail) => checks.push({ name, pass, detail });
  const rideFor = async (rideId) => {
    const state = await rides();
    return state?.rides?.rides?.find((entry) => entry.rideId === rideId) ?? null;
  };
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => globalThis.__v3Composition?.ready() === true, null, {
    timeout: 180000,
  });
  const backend = await page.evaluate(() => globalThis.__v3Composition.backend());
  await page.waitForFunction(
    () => globalThis.document?.querySelector('.game-shell')?.getAttribute('data-state') === 'READY',
    null,
    { timeout: 180000 },
  );
  const startButton =
    (await page.getByRole('button', { name: 'Joacă' }).count()) > 0
      ? page.getByRole('button', { name: 'Joacă' })
      : page.getByRole('button', { name: 'Pornește' });
  await startButton.click();
  await focusCanvas();
  const tickAtStart = (await read()).tick;

  await waitUntil(
    () => {
      const status = globalThis.__v3Composition.missions()?.status;
      return (
        status?.activeMissionId === 'campaign-1-first-taxi' &&
        status?.tutorial?.stepId === 'SELECT_TAXI'
      );
    },
    null,
    60000,
    'stage 1 and the tutorial',
  );
  const initial = await missions();
  check(
    'missions-port-present',
    (await shell()).systems.some(
      (system) => system.id === 'missions' && system.status === 'PRESENT',
    ),
    'the shell mounts the 275 missions port',
  );
  check(
    'campaign-starts-stage-1',
    initial?.status?.activeMissionId === 'campaign-1-first-taxi',
    `active ${initial?.status?.activeMissionId}`,
  );
  check(
    'tutorial-starts',
    initial?.status?.tutorial?.stepId === 'SELECT_TAXI' &&
      initial?.status?.tutorial?.learningGate === 'TUTORIAL_BLOCKS_LEARNING',
    `${initial?.status?.tutorial?.stepId}/${initial?.status?.tutorial?.learningGate}`,
  );

  await waitUntil(
    () => {
      const state = globalThis.__v3Composition.rides();
      const active =
        state?.rides?.rides?.filter((ride) => !ride.terminal && ride.state === 'TO_PICKUP') ?? [];
      return state?.snapshot?.counts?.requests > 0 && active.length >= 6;
    },
    null,
    180000,
    'six live rides in TO_PICKUP',
  );
  const rideState = await rides();
  const activePickups = rideState.rides.rides.filter(
    (ride) => !ride.terminal && ride.state === 'TO_PICKUP',
  );
  const ranked = activePickups
    .map((ride) => ({
      ride,
      assignment: rideState.snapshot.assignments.find(
        (entry) => entry.requestId === ride.requestId,
      ),
    }))
    .filter(
      (entry) =>
        entry.assignment !== undefined &&
        entry.assignment.pickupCostSeconds >= 5 &&
        entry.assignment.tripCostSeconds >= 15,
    )
    .sort(
      (left, right) =>
        left.assignment.totalCostSeconds - right.assignment.totalCostSeconds ||
        (left.ride.rideId < right.ride.rideId ? -1 : 1),
    );
  const target = ranked[0];
  if (target === undefined) throw new Error('No mission ride target');
  const rideId = target.ride.rideId,
    taxiId = target.ride.taxiId;

  await page.locator('[data-shell-action="fleet"]').click();
  await waitUntil(
    () => globalThis.__v3Composition.fleet().open === true,
    null,
    30000,
    'fleet panel open',
  );
  await page.locator(`.fleet-selection__list button[data-vehicle-id="${taxiId}"]`).click();
  await page.locator('[data-fleet-action="takeover"]').click();
  await waitUntil(
    (id) => globalThis.__v3Composition.fleet().selection?.playerVehicleId === id,
    taxiId,
    30000,
    'player takeover',
  );
  await focusCanvas();
  await waitUntil(
    () => globalThis.__v3Composition.missions()?.tutorialInstance?.stepIndex >= 2,
    null,
    30000,
    'tutorial selection and MANUAL',
  );
  const manualStep = await missions();
  check(
    'tutorial-select-and-manual',
    manualStep?.tutorialInstance?.stepIndex >= 2,
    `step ${manualStep?.tutorialInstance?.stepIndex}`,
  );
  screenshotsTaken.push(await shot('01-manual'));

  await page.keyboard.press('KeyL');
  await waitUntil(
    () =>
      globalThis.__v3Composition.modes()?.model?.mode === 'LEARNING' &&
      globalThis.__v3Composition.missions()?.tutorialInstance?.stepIndex >= 3,
    null,
    30000,
    'tutorial LEARNING',
  );
  const learningStep = await missions();
  check(
    'tutorial-learning-ineligible',
    learningStep?.tutorialInstance?.steps?.[2]?.state === 'SATISFIED' &&
      learningStep?.status?.tutorial?.learningJobs === 0 &&
      learningStep?.status?.tutorial?.profileVersions === 0,
    `step 3 ${learningStep?.tutorialInstance?.steps?.[2]?.state}, jobs ${learningStep?.status?.tutorial?.learningJobs}`,
  );
  screenshotsTaken.push(await shot('02-learning'));

  await page.keyboard.press('KeyM');
  await waitUntil(
    () =>
      globalThis.__v3Composition.modes()?.model?.mode === 'AUTO' &&
      globalThis.__v3Composition.missions()?.tutorialInstance?.stepIndex >= 4,
    null,
    30000,
    'tutorial AUTO',
  );
  await focusCanvas();
  check(
    'tutorial-auto-and-ride-step',
    (await missions())?.tutorialInstance?.stepIndex === 4,
    `step ${(await missions())?.tutorialInstance?.stepIndex}`,
  );

  // The tutorial's fourth step is AUTO. The real 058 actor continues the claimed route, so both the
  // tutorial's final ride step and the campaign's manual-start dropoff are produced by the same real
  // 265 lifecycle, not by a synthetic completion.
  await waitUntil(
    (id) => {
      const ride = globalThis.__v3Composition
        .rides()
        .rides.rides.find((entry) => entry.rideId === id);
      return (
        ride !== undefined &&
        (ride.boardingTick !== null ||
          ride.state === 'TO_DROPOFF' ||
          ride.state === 'DROPOFF' ||
          ride.state === 'COMPLETED')
      );
    },
    rideId,
    900000,
    'AUTO pickup boarding',
  );
  const boardingTick = (await rideFor(rideId))?.boardingTick ?? null;
  screenshotsTaken.push(await shot('03-pickup'));
  await waitUntil(
    (id) => {
      const ride = globalThis.__v3Composition
        .rides()
        .rides.rides.find((entry) => entry.rideId === id);
      return ride?.state === 'DROPOFF' || ride?.state === 'COMPLETED';
    },
    rideId,
    900000,
    'AUTO dropoff arrival',
  );
  screenshotsTaken.push(await shot('04-dropoff'));
  await waitUntil(
    (id) =>
      globalThis.__v3Composition
        .rides()
        .rides.rides.some((ride) => ride.rideId === id && ride.state === 'COMPLETED'),
    rideId,
    300000,
    'ride completion',
  );
  const completionTick = (await rideFor(rideId))?.completionTick ?? null;
  screenshotsTaken.push(await shot('05-completed'));

  await waitUntil(
    () => {
      const status = globalThis.__v3Composition.missions()?.status;
      return (
        status?.campaign?.completed === 1 &&
        status?.tutorial?.state === 'COMPLETED' &&
        status?.activeMissionId === 'campaign-2-first-demonstration'
      );
    },
    null,
    30000,
    'stage 1 and tutorial completion',
  );
  const afterStageOne = await missions();
  check(
    'tutorial-completed-by-play',
    afterStageOne?.tutorialInstance?.completedBy === 'PLAY' &&
      afterStageOne?.tutorialInstance?.stepIndex === 5,
    `${afterStageOne?.tutorialInstance?.completedBy}/${afterStageOne?.tutorialInstance?.stepIndex}`,
  );
  check(
    'stage-1-completed',
    afterStageOne?.snapshot?.missions?.find((entry) => entry.missionId === 'campaign-1-first-taxi')
      ?.state === 'COMPLETED',
    'stage 1 is COMPLETED in the real 125 progress',
  );
  check(
    'stage-1-reward-once',
    afterStageOne?.status?.rewards?.totals?.xp === 100 &&
      afterStageOne?.status?.rewards?.totals?.granted === 2,
    `XP ${afterStageOne?.status?.rewards?.totals?.xp}, granted ${afterStageOne?.status?.rewards?.totals?.granted}`,
  );
  check(
    'stage-2-started',
    afterStageOne?.status?.activeMissionId === 'campaign-2-first-demonstration',
    `active ${afterStageOne?.status?.activeMissionId}`,
  );
  check(
    'tutorial-no-learning',
    afterStageOne?.status?.tutorial?.learningJobs === 0 &&
      afterStageOne?.status?.tutorial?.profileVersions === 0 &&
      afterStageOne?.status?.profileWrites === 0,
    'zero jobs, versions and profile writes',
  );
  const learningAfterStageOne = await page.evaluate(() => {
    const learning = globalThis.__v3Composition.learning();
    return {
      ineligibleSkipped: learning?.model?.stats?.ineligibleSkipped ?? 0,
      versions: learning?.model?.stats?.versions ?? 0,
      jobs: learning?.model?.stats?.jobs ?? 0,
      style: learning?.style?.parameters ?? null,
    };
  });
  check(
    'learning-gate-skipped-segment',
    learningAfterStageOne.ineligibleSkipped >= 1 &&
      learningAfterStageOne.versions === 0 &&
      learningAfterStageOne.jobs === 0,
    `ineligible ${learningAfterStageOne.ineligibleSkipped}, versions ${learningAfterStageOne.versions}, jobs ${learningAfterStageOne.jobs}`,
  );
  screenshotsTaken.push(await shot('06-stage-1-complete'));

  // Panel evidence before the failure.
  await page.locator('[data-shell-action="missions"]').click();
  await waitUntil(
    () => globalThis.__v3Composition.missions()?.panelOpen === true,
    null,
    30000,
    'mission panel open',
  );
  const stageOnePanel = await page.evaluate(() => {
    const item = globalThis.document?.querySelector(
      '.mission-panel__mission[data-mission-id="campaign-1-first-taxi"]',
    );
    return {
      state: item?.getAttribute('data-state') ?? null,
      attempt: item?.getAttribute('data-attempt-state') ?? null,
      replay: item?.getAttribute('data-replay') ?? null,
      text: item?.textContent ?? '',
    };
  });
  check(
    'panel-stage-1-completed',
    stageOnePanel.state === 'COMPLETED' && stageOnePanel.attempt === 'COMPLETED',
    `${stageOnePanel.state}/${stageOnePanel.attempt}`,
  );
  check(
    'panel-replay-policy',
    stageOnePanel.replay === 'true' && /Reluare/.test(stageOnePanel.text),
    `replay ${stageOnePanel.replay}`,
  );
  screenshotsTaken.push(await shot('07-panel-stage-1'));
  await page.locator('.mission-panel__close').click();
  await focusCanvas();

  const xpBeforeFailure = (await missions())?.status?.rewards?.totals?.xp ?? 0;
  const profileBeforeFailure = await profile();

  // Real world reset: the open stage 2 must fail with SCENARIO_RESET.
  await page.locator('[data-shell-action="panel"]').click();
  await waitUntil(
    () => globalThis.__v3Composition.shellHost().panelOpen === true,
    null,
    30000,
    'integration panel open',
  );
  const worldEpochBefore = (await shell()).worldEpoch;
  await page.locator('[data-shell-action="reset-world"]').click();
  await waitUntil(
    (epoch) => globalThis.__v3Composition.shell().worldEpoch > epoch,
    worldEpochBefore,
    120000,
    'world reset',
  );
  await waitUntil(
    () => {
      const status = globalThis.__v3Composition.missions()?.status;
      const snapshot = globalThis.__v3Composition.missions()?.snapshot;
      const stageTwo = snapshot?.missions?.find(
        (entry) => entry.missionId === 'campaign-2-first-demonstration',
      );
      return (
        status?.rewards?.totals?.xp === 100 &&
        stageTwo?.attempt?.state === 'FAILED' &&
        stageTwo?.attempt?.failureReason === 'SCENARIO_RESET'
      );
    },
    null,
    30000,
    'stage 2 failed with SCENARIO_RESET',
  );
  const afterFailure = await missions();
  const profileAfterFailure = await profile();
  const tickAtFailure = (await read()).tick;
  const xpAfterFailure = afterFailure?.status?.rewards?.totals?.xp ?? 0;

  check(
    'failure-reason-scenario-reset',
    afterFailure?.snapshot?.missions?.find(
      (entry) => entry.missionId === 'campaign-2-first-demonstration',
    )?.attempt?.failureReason === 'SCENARIO_RESET',
    'stage 2 carries the closed failure reason',
  );
  check(
    'failure-preserves-xp',
    xpAfterFailure === xpBeforeFailure,
    `XP ${xpBeforeFailure} -> ${xpAfterFailure}`,
  );
  check(
    'failure-preserves-profile',
    profileBeforeFailure === profileAfterFailure,
    'the learned style fingerprint is identical before and after the failure',
  );
  check(
    'failure-no-profile-write',
    afterFailure?.status?.profileWrites === 0 && afterFailure?.status?.xpDelta === 0,
    'zero profile writes and zero XP delta',
  );
  screenshotsTaken.push(await shot('08-failed'));

  await page.locator('[data-shell-action="missions"]').click();
  await waitUntil(
    () => globalThis.__v3Composition.missions()?.panelOpen === true,
    null,
    30000,
    'mission panel open after failure',
  );
  const failurePanel = await page.evaluate(() => {
    const item = globalThis.document?.querySelector(
      '.mission-panel__mission[data-mission-id="campaign-2-first-demonstration"]',
    );
    return {
      state: item?.getAttribute('data-state') ?? null,
      attempt: item?.getAttribute('data-attempt-state') ?? null,
      failure: item?.getAttribute('data-failure') ?? null,
      replay: item?.getAttribute('data-replay') ?? null,
      text: item?.textContent ?? '',
    };
  });
  check(
    'panel-failure-reason',
    failurePanel.attempt === 'FAILED' &&
      failurePanel.failure === 'SCENARIO_RESET' &&
      /SCENARIO_RESET|Reset/.test(failurePanel.text),
    `${failurePanel.attempt}/${failurePanel.failure}`,
  );
  check(
    'panel-replay-available',
    failurePanel.replay === 'true' && /Reluare/.test(failurePanel.text),
    `replay ${failurePanel.replay}`,
  );
  screenshotsTaken.push(await shot('09-panel-failure'));

  const panelStats = (await missions())?.panel;
  check(
    'panel-focus-and-no-global-listener',
    panelStats?.globalListeners === 0 && panelStats?.surfaceCalls >= 1,
    `global ${panelStats?.globalListeners}, surface ${panelStats?.surfaceCalls}`,
  );

  await page.locator('.mission-panel__close').click();
  const pageHealthy = pageErrors.length === 0 && consoleErrors.length === 0;
  check(
    'page-errors-zero',
    pageHealthy,
    `${pageErrors.length} page, ${consoleErrors.length} console`,
  );

  result = {
    version: '275-live-missions-browser-v1',
    generatedAt,
    status: checks.every((entry) => entry.pass) ? 'PASS' : 'FAIL',
    reason: checks.every((entry) => entry.pass)
      ? null
      : `${checks.filter((entry) => !entry.pass).length} browser check(s) failed`,
    run: {
      browser: await page.evaluate(() => navigator.userAgent),
      backend: backend?.rendererKind ?? null,
      viewport: '1024x640',
      url,
      tickAtStart,
      tickAtFailure,
      taxiId,
      rideId,
      pickupZoneId: target.ride.pickupZoneId,
      dropoffZoneId: target.ride.dropoffZoneId,
      boardingTick,
      completionTick,
      stage1State:
        afterStageOne?.snapshot?.missions?.find(
          (entry) => entry.missionId === 'campaign-1-first-taxi',
        )?.state ?? null,
      xpAfterStage1: afterStageOne?.status?.rewards?.totals?.xp ?? 0,
      rewardsAfterStage1: afterStageOne?.status?.rewards?.totals?.granted ?? 0,
      learningIneligibleSkipped: learningAfterStageOne.ineligibleSkipped,
      learningVersions: learningAfterStageOne.versions,
      stage2State: failurePanel.state,
      stage2Attempt: failurePanel.attempt,
      failureReason: failurePanel.failure,
      xpAfterFailure,
      profileFingerprintEqual: profileBeforeFailure === profileAfterFailure,
      panelMissions:
        afterStageOne?.snapshot?.missions?.length ?? afterFailure?.snapshot?.missions?.length ?? 0,
      stage1PanelState: stageOnePanel.state,
      stage2PanelAttemptState: failurePanel.attempt,
      stage2PanelFailure: failurePanel.failure,
      stage2PanelReplay: failurePanel.replay,
      checks,
      screenshots: screenshotsTaken,
    },
  };
} catch (error) {
  let diagnostics = null;
  if (debugPage !== null) {
    diagnostics = await debugPage
      .evaluate(() => {
        const mission = globalThis.__v3Composition.missions();
        return {
          lifecycle: globalThis.__v3Composition.lifecycle(),
          shell: globalThis.__v3Composition.shell(),
          modes: globalThis.__v3Composition.modes()?.model ?? null,
          tutorial: mission?.tutorialInstance ?? null,
          status: mission?.status ?? null,
          rides: globalThis.__v3Composition.rides(),
          frame: globalThis.__v3Composition.read(),
        };
      })
      .catch(() => null);
  }
  result = {
    version: '275-live-missions-browser-v1',
    generatedAt,
    status: 'FAIL',
    reason: error instanceof Error ? error.message : String(error),
    diagnostics,
    run: null,
  };
} finally {
  await browser.close().catch(() => {});
  server.close();
}

await writeResult(result);
console.log(
  `Live missions browser probe ${result.status}: ${result.reason ?? 'all checks passed'}`,
);
if (result.status !== 'PASS') process.exitCode = 1;
