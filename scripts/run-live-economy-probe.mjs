import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 266 — browser probe for one real completed ride and the visible live economy.
 *
 * The probe starts the real build, takes over a claimed 265 taxi, drives it to the validated 032
 * pickup/dropoff anchors through the real keyboard/authority path, waits for COMPLETED, then reads
 * the economy port and the HUD. It also opens the rides panel to prove that the economy read keeps
 * `historyScans: 0` before and after the panel.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '266-live-economy'),
  browserJson = join(directory, 'browser.json'),
  reportMarkdown = join(directory, 'browser.md'),
  screenshots = join(directory, 'screenshots'),
  buildDirectory = join(root, '.pbi-validation-266', 'build');

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
  if (!result.run)
    return `# 266 — proba de browser a economiei live

Generată de \`npm run economy:live:probe\`.

**NOT_RUN** — ${result.reason}

Nu este raportat niciun PASS simulat.
`;
  const run = result.run;
  const checks = run.checks
    .map((entry) => `- \`${entry.name}\`: ${entry.pass ? 'PASS' : 'FAIL'} — ${entry.detail}`)
    .join('\n');
  return `# 266 — proba de browser a economiei live

Generată de \`npm run economy:live:probe\`; Chromium ${run.browser}, backend ${run.actualBackend},
viewport ${run.viewport}, tick ${run.tickAtCompletion}.

O cursă reală 265 a fost preluată de jucător, condusă la ancora 032 de pickup, lăsată pentru dwell,
condusă la destinație și închisă \`COMPLETED\`. Economia a produs o singură decontare și un review,
iar HUD-ul live a afișat revenue și rating.

| Metric | Value |
| --- | ---: |
| Ride / taxi | \`${run.rideId}\` / \`${run.taxiId}\` |
| Completion tick | ${run.tickAtCompletion} |
| Target settlements / reviews | ${run.targetSettlementCount} / ${run.targetReviewCount} |
| Session settlements / reviews (AI + player) | ${run.settlementCount} / ${run.reviewCount} |
| Revenue | ${run.revenueMinorUnits} SDA |
| Day revenue | ${run.dayRevenueMinorUnits} SDA |
| Rating / reasons | ${run.rating ?? '—'} / ${run.reasons.join(', ')} |
| Comfort samples → intervals | ${run.comfortSamples} → ${run.comfortIntervals} |
| historyScans before / after panel | ${run.historyScansBeforePanel} / ${run.historyScansAfterPanel} |
| Economy port | ${run.economyPort} |

HUD: \`${run.hudText}\`

Capturi: ${run.screenshots.map((file) => `[${file}](${file})`).join(', ')}.

${checks}

Limite: proba folosește tastatura reală și poziția autoritară a compunerii, dar nu înlocuiește un
playtest uman. Nu măsoară FPS/GPU și nu înlocuiește gate-ul 287. Persistarea economiei după reload
rămâne 278.
`;
}

async function writeResult(result) {
  await mkdir(directory, { recursive: true });
  await writeFile(browserJson, `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(reportMarkdown, markdown(result));
  console.log(`Wrote ${browserJson}`);
  console.log(`Wrote ${reportMarkdown}`);
}

function normalizeAngle(rad) {
  return ((((rad + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
}

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

const playwright = await loadPlaywright();
await mkdir(directory, { recursive: true });
await rm(screenshots, { recursive: true, force: true });
await mkdir(screenshots, { recursive: true });
const generatedAt = new Date().toISOString();

if (playwright === null) {
  await writeResult({
    version: '266-live-economy-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason:
      'Playwright is not installed in this checkout (no `playwright` module and no PLAYWRIGHT_MODULE); the browser probe was not run.',
    run: null,
  });
  console.log('Live economy browser probe NOT_RUN: Playwright is not installed.');
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
    version: '266-live-economy-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason: `Browser launch failed: ${launchError instanceof Error ? launchError.message : String(launchError)}`,
    run: null,
  });
  server.close();
  console.log('Live economy browser probe NOT_RUN: browser launch failed.');
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
  const url = `${origin}/?capture=1&backend=WEBGL2&preset=LOW&models=procedural&time=noon&debug=1`;
  const rides = () => page.evaluate(() => globalThis.__v3Composition.rides());
  const economy = () => page.evaluate(() => globalThis.__v3Composition.economy());
  const shell = () => page.evaluate(() => globalThis.__v3Composition.shell());
  const read = () => page.evaluate(() => globalThis.__v3Composition.read());
  const focusCanvas = () =>
    page.evaluate(() => {
      const canvas = globalThis.document?.querySelector('canvas');
      if (canvas instanceof globalThis.HTMLCanvasElement) canvas.focus();
    });
  let actualBackend = null;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => globalThis.__v3Composition?.ready() === true, null, {
    timeout: 180000,
  });
  const backend = await page.evaluate(() => globalThis.__v3Composition.backend());
  actualBackend = backend?.rendererKind ?? null;
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
        throw new Error(
          `Timeout waiting for ${label}: lifecycle ${lifecycle?.kind}/${lifecycle?.reason ?? 'none'}, shell paused ${shellState?.paused}/${shellState?.cause ?? 'none'}, fault ${shellState?.fault ?? 'none'}, tick ${shellState?.tick}, page errors ${pageErrors.slice(-2).join(' | ')}`,
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
  const heldKeys = new Set();
  const keyDown = async (key) => {
    if (heldKeys.has(key)) return;
    heldKeys.add(key);
    await page.keyboard.down(key);
  };
  const keyUp = async (key) => {
    if (!heldKeys.has(key)) return;
    heldKeys.delete(key);
    await page.keyboard.up(key);
  };
  const releaseKeys = async () => {
    for (const key of [...heldKeys]) await keyUp(key);
  };
  const vehicle = async (taxiId) => {
    const frame = await read();
    if (frame === null || !Array.isArray(frame.vehicles)) return null;
    return frame.vehicles.find((entry) => entry.vehicleId === taxiId) ?? null;
  };
  const rideFor = async (rideId) => {
    const state = await rides();
    return state?.rides?.rides?.find((entry) => entry.rideId === rideId) ?? null;
  };
  const driveTo = async (taxiId, laneIds, anchor, label) => {
    const path = await page.evaluate((ids) => globalThis.__v3Composition.lanePath(ids), laneIds);
    const raw = path.map((point) => ({ x: point.x, z: point.z }));
    raw.push({ x: anchor.x, z: anchor.z });
    const waypoints = [raw[0]];
    for (let index = 1; index < raw.length; index += 1) {
      const from = raw[index - 1],
        to = raw[index],
        length = distance(from, to),
        steps = Math.max(1, Math.ceil(length / 2));
      for (let step = 1; step <= steps; step += 1) {
        const fraction = step / steps;
        waypoints.push({
          x: from.x + (to.x - from.x) * fraction,
          z: from.z + (to.z - from.z) * fraction,
        });
      }
    }
    let current = await vehicle(taxiId);
    const startDeadline = Date.now() + 15000;
    while (current === null && Date.now() < startDeadline) {
      await page.waitForTimeout(150);
      current = await vehicle(taxiId);
    }
    if (current === null) throw new Error(`Missing taxi ${taxiId}`);
    const deadline = Date.now() + 360000;
    let routeIndex = 0;
    {
      let best = Infinity;
      for (let candidate = 0; candidate < waypoints.length; candidate += 1) {
        const value = distance(waypoints[candidate], current.positionM);
        if (value < best) {
          best = value;
          routeIndex = candidate;
        }
      }
    }
    let lastProgressAt = Date.now(),
      lastTargetDistance = distance(current.positionM, anchor),
      missingSince = null,
      lastLogAt = 0;
    for (;;) {
      if (Date.now() > deadline) throw new Error(`Drive timeout for ${label}`);
      await resumeOverload();
      current = await vehicle(taxiId);
      if (current === null) {
        if (missingSince === null) missingSince = Date.now();
        if (Date.now() - missingSince > 15000)
          throw new Error(`Taxi ${taxiId} disappeared during ${label}`);
        await page.waitForTimeout(150);
        continue;
      }
      missingSince = null;
      const position = current.positionM,
        targetDistance = distance(position, anchor);
      if (targetDistance < 2.6 && current.speedMps < 0.08) {
        await releaseKeys();
        break;
      }
      let nearest = routeIndex,
        best = Infinity;
      const searchEnd = Math.min(waypoints.length - 1, routeIndex + 120);
      for (let candidate = routeIndex; candidate <= searchEnd; candidate += 1) {
        const value = distance(waypoints[candidate], position);
        if (value < best) {
          best = value;
          nearest = candidate;
        }
      }
      routeIndex = Math.max(routeIndex, nearest);
      const target = waypoints[Math.min(routeIndex + 6, waypoints.length - 1)],
        desired = Math.atan2(target.x - position.x, target.z - position.z),
        error = normalizeAngle(desired - current.yawRad);
      if (Date.now() - lastLogAt > 2000) {
        lastLogAt = Date.now();
        console.log(
          `drive ${label}: pos ${position.x.toFixed(1)},${position.z.toFixed(1)} speed ${current.speedMps.toFixed(1)} wp ${nearest}/${waypoints.length} dist ${targetDistance.toFixed(1)} err ${error.toFixed(2)}`,
        );
      }
      if (error > 0.05) {
        await keyDown('KeyD');
        await keyUp('KeyA');
      } else if (error < -0.05) {
        await keyDown('KeyA');
        await keyUp('KeyD');
      } else {
        await keyUp('KeyA');
        await keyUp('KeyD');
      }
      if (targetDistance < 4) {
        await keyUp('KeyW');
        if (current.speedMps > 0.08) {
          await keyDown('Space');
        } else {
          await keyUp('Space');
          if (targetDistance < 2.6) break;
          const forward = { x: Math.sin(current.yawRad), z: Math.cos(current.yawRad) },
            toTarget = { x: anchor.x - position.x, z: anchor.z - position.z },
            dot = forward.x * toTarget.x + forward.z * toTarget.z;
          const creep = dot >= 0 ? 'KeyW' : 'KeyS';
          await keyDown(creep);
          await page.waitForTimeout(650);
          await keyUp(creep);
          await keyDown('Space');
          await page.waitForTimeout(500);
          await keyUp('Space');
          lastProgressAt = Date.now();
          lastTargetDistance = targetDistance;
          await page.waitForTimeout(100);
          continue;
        }
      } else {
        const desiredSpeed = targetDistance > 30 ? 8 : Math.max(1.1, targetDistance * 0.55);
        if (current.speedMps < desiredSpeed - 0.35) {
          await keyUp('Space');
          await keyDown('KeyW');
        } else if (current.speedMps > desiredSpeed + 0.35) {
          await keyUp('KeyW');
          await keyDown('Space');
        } else {
          await keyUp('KeyW');
          await keyUp('Space');
        }
      }
      if (targetDistance < lastTargetDistance - 0.5 || current.speedMps > 0.5) {
        lastProgressAt = Date.now();
        lastTargetDistance = targetDistance;
      } else if (targetDistance > 10 && Date.now() - lastProgressAt > 4000) {
        await keyUp('KeyW');
        await keyDown('KeyS');
        await page.waitForTimeout(900);
        await keyUp('KeyS');
        lastProgressAt = Date.now();
        current = await vehicle(taxiId);
        if (current !== null) lastTargetDistance = distance(current.positionM, anchor);
      }
      await page.waitForTimeout(70);
    }
    await releaseKeys();
    await page.waitForTimeout(300);
  };
  /**
   * Last-metre fallback: the route driver stops at 2.6 m from the anchor, but a small 032 zone may
   * start just inside that radius. The nudge steers at the anchor and creeps a short distance, then
   * brakes, so the authoritative centre enters the real polygon. It never teleports or writes state.
   */
  const nudgeToAnchor = async (taxiId, anchor, rideId) => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const view = await rideFor(rideId);
      if (view === null || view.terminal || view.state === 'DROPOFF') return;
      const current = await vehicle(taxiId);
      if (current === null) {
        await page.waitForTimeout(200);
        continue;
      }
      const targetDistance = distance(current.positionM, anchor);
      if (targetDistance < 0.4 && current.speedMps < 0.3) {
        await releaseKeys();
        await page.waitForTimeout(1200);
        continue;
      }
      const desired = Math.atan2(anchor.x - current.positionM.x, anchor.z - current.positionM.z),
        error = normalizeAngle(desired - current.yawRad);
      if (error > 0.05) {
        await keyDown('KeyD');
        await keyUp('KeyA');
      } else if (error < -0.05) {
        await keyDown('KeyA');
        await keyUp('KeyD');
      } else {
        await keyUp('KeyA');
        await keyUp('KeyD');
      }
      const forward = { x: Math.sin(current.yawRad), z: Math.cos(current.yawRad) },
        toTarget = { x: anchor.x - current.positionM.x, z: anchor.z - current.positionM.z },
        creep = forward.x * toTarget.x + forward.z * toTarget.z >= 0 ? 'KeyW' : 'KeyS';
      await keyDown(creep);
      await page.waitForTimeout(Math.min(900, 250 + targetDistance * 120));
      await keyUp(creep);
      await keyDown('Space');
      await page.waitForTimeout(350);
      await keyUp('Space');
      await page.waitForTimeout(250);
    }
    await releaseKeys();
  };

  await waitUntil(
    () => {
      const current = globalThis.__v3Composition.rides();
      return (
        current?.snapshot?.counts?.requests > 0 &&
        current.rides.rides.some((ride) => !ride.terminal && ride.state === 'TO_PICKUP')
      );
    },
    null,
    180000,
    'a live ride in TO_PICKUP',
  );
  const initial = await rides(),
    target = initial.rides.rides.find((ride) => !ride.terminal && ride.state === 'TO_PICKUP');
  if (target === undefined) throw new Error('No live ride target');
  const assignment = initial.snapshot.assignments.find(
    (entry) => entry.requestId === target.requestId,
  );
  if (assignment === undefined) throw new Error('The live ride lost its 060 claim');
  await page.locator('[data-shell-action="fleet"]').click();
  await waitUntil(
    () => globalThis.__v3Composition.fleet().open === true,
    null,
    30000,
    'fleet panel open',
  );
  await page.locator(`.fleet-selection__list button[data-vehicle-id="${target.taxiId}"]`).click();
  await page.locator('[data-fleet-action="takeover"]').click();
  await waitUntil(
    (taxiId) => globalThis.__v3Composition.fleet().selection?.playerVehicleId === taxiId,
    target.taxiId,
    30000,
    'player takeover',
  );
  await focusCanvas();
  check(
    'ride-survives-takeover',
    (await rideFor(target.rideId))?.terminal === false,
    'the player takeover keeps the real 061 ride',
  );

  await driveTo(target.taxiId, assignment.pickupRouteLaneIds, target.pickupAnchor, 'pickup');
  await waitUntil(
    (rideId) =>
      globalThis.__v3Composition
        .rides()
        .rides.rides.some(
          (ride) =>
            ride.rideId === rideId && (ride.state === 'PICKUP' || ride.state === 'TO_DROPOFF'),
        ),
    target.rideId,
    30000,
    'pickup arrival',
  );
  await waitUntil(
    (rideId) =>
      globalThis.__v3Composition
        .rides()
        .rides.rides.some((ride) => ride.rideId === rideId && ride.state === 'TO_DROPOFF'),
    target.rideId,
    30000,
    'passenger boarding',
  );
  const onboard = await rideFor(target.rideId);
  check(
    'passenger-onboard',
    onboard?.boardingTick !== null && onboard?.boardingTick !== undefined,
    `boarding tick ${onboard?.boardingTick}`,
  );

  await driveTo(target.taxiId, assignment.tripRouteLaneIds, target.dropoffAnchor, 'dropoff');
  await page.waitForTimeout(800);
  if ((await rideFor(target.rideId))?.state === 'TO_DROPOFF')
    await nudgeToAnchor(target.taxiId, target.dropoffAnchor, target.rideId);
  await waitUntil(
    (rideId) => {
      const current = globalThis.__v3Composition
        .rides()
        .rides.rides.find((ride) => ride.rideId === rideId);
      return current?.terminal === true || current?.state === 'DROPOFF';
    },
    target.rideId,
    60000,
    'dropoff arrival or completion',
  );
  await waitUntil(
    (rideId) =>
      globalThis.__v3Composition
        .rides()
        .rides.rides.some((ride) => ride.rideId === rideId && ride.state === 'COMPLETED'),
    target.rideId,
    60000,
    'ride completion',
  );
  const completed = await rideFor(target.rideId);
  check(
    'ride-completed',
    completed?.state === 'COMPLETED' && completed?.terminal === true,
    `state ${completed?.state}`,
  );

  await waitUntil(
    () => {
      const current = globalThis.__v3Composition.economy();
      return current?.read?.counters?.settlements >= 1 && current?.read?.counters?.reviews >= 1;
    },
    null,
    30000,
    'live economy settlement and review',
  );
  const firstEconomy = await economy(),
    readState = firstEconomy.read,
    snapshot = firstEconomy.snapshot,
    hudText = firstEconomy.hudText ?? '',
    targetReview =
      snapshot.reviews.reviews.find((review) => review.rideId === target.rideId) ?? null,
    targetSettlements = snapshot.ledger.settlements.filter(
      (settlement) => settlement.rideId === target.rideId,
    ),
    targetReviews = snapshot.reviews.reviews.filter((review) => review.rideId === target.rideId),
    hudBefore = {
      revenue: readState.totals.netRevenueMinorUnits,
      settlements: readState.totals.settlements,
      reviews: readState.counters.reviews,
      historyScans: readState.historyScans,
    };
  check('economy-port', firstEconomy.port === 'PRESENT', `port ${firstEconomy.port}`);
  check(
    'settlements-present',
    readState.counters.settlements >= 1,
    `${readState.counters.settlements} terminal settlements (AI + player)`,
  );
  check(
    'target-single-settlement',
    targetSettlements.length === 1,
    `${targetSettlements.length} settlements for ${target.rideId}`,
  );
  check(
    'target-single-review',
    targetReviews.length === 1,
    `${targetReviews.length} reviews for ${target.rideId}`,
  );
  check(
    'revenue',
    readState.totals.netRevenueMinorUnits > 0,
    `${readState.totals.netRevenueMinorUnits} SDA`,
  );
  check(
    'day-revenue',
    readState.today?.revenueMinorUnits === readState.totals.netRevenueMinorUnits,
    `${readState.today?.revenueMinorUnits} vs ${readState.totals.netRevenueMinorUnits}`,
  );
  check(
    'target-rating',
    typeof targetReview?.rating === 'number' &&
      targetReview.rating >= 0 &&
      targetReview.rating <= 5,
    `${targetReview?.rating}`,
  );
  check(
    'history-scans',
    readState.historyScans === 0 &&
      snapshot?.historyScans === 0 &&
      snapshot?.kpi?.historyScans === 0,
    `read ${readState.historyScans}, snapshot ${snapshot?.historyScans}, kpi ${snapshot?.kpi?.historyScans}`,
  );
  check(
    'hud-visible',
    firstEconomy.hudView?.empty === false &&
      hudText.includes('Venit:') &&
      hudText.includes('Rating:'),
    `${firstEconomy.hudView?.empty} · ${hudText.replace(/\s+/g, ' ').slice(0, 180)}`,
  );
  screenshotsTaken.push(await shot('01-live-economy'));

  await page.locator('[data-shell-action="rides"]').click();
  await waitUntil(
    () => globalThis.__v3Composition.rides().panelOpen === true,
    null,
    30000,
    'rides panel open',
  );
  const panelEconomy = await economy(),
    panelRead = panelEconomy.read;
  check(
    'panel-history-scans',
    panelRead.historyScans === 0,
    `historyScans ${panelRead.historyScans}`,
  );
  check(
    'panel-revenue-stable',
    panelRead.totals.netRevenueMinorUnits === hudBefore.revenue,
    `${panelRead.totals.netRevenueMinorUnits} vs ${hudBefore.revenue}`,
  );
  check(
    'panel-settlements-stable',
    panelRead.totals.settlements === hudBefore.settlements &&
      panelRead.counters.reviews === hudBefore.reviews,
    `${panelRead.totals.settlements}/${panelRead.counters.reviews}`,
  );
  screenshotsTaken.push(await shot('02-economy-with-rides-panel'));
  await page.locator('[data-live-action="close"]').click();
  await focusCanvas();

  const shellState = await shell();
  check(
    'economy-in-shell',
    shellState.systems.some(
      (system) => system.id === 'economy' && system.status === 'PRESENT' && system.steps > 0,
    ),
    `steps ${shellState.systems.find((system) => system.id === 'economy')?.steps}`,
  );
  check(
    'no-page-errors',
    pageErrors.length === 0,
    pageErrors.length === 0 ? '0 page errors' : pageErrors.slice(-2).join(' | '),
  );
  check(
    'no-console-errors',
    consoleErrors.length === 0,
    consoleErrors.length === 0 ? '0 console errors' : consoleErrors.slice(-2).join(' | '),
  );

  const passed = checks.filter((entry) => entry.pass).length;
  const run = {
    browser: await browser.version(),
    actualBackend,
    viewport: '1440x900',
    route: url,
    tickAtCompletion: completed?.completionTick ?? readState.tick,
    rideId: target.rideId,
    taxiId: target.taxiId,
    settlementCount: readState.totals.settlements,
    reviewCount: readState.counters.reviews,
    targetSettlementCount: targetSettlements.length,
    targetReviewCount: targetReviews.length,
    revenueMinorUnits: readState.totals.netRevenueMinorUnits,
    dayRevenueMinorUnits: readState.today?.revenueMinorUnits ?? 0,
    rating: targetReview?.rating ?? null,
    reasons: targetReview?.reasonCodes ?? [],
    comfortSamples: readState.counters.comfortSamples,
    comfortIntervals: readState.counters.comfortIntervals,
    historyScansBeforePanel: hudBefore.historyScans,
    historyScansAfterPanel: panelRead.historyScans,
    economyPort: firstEconomy.port,
    hudText,
    screenshots: screenshotsTaken,
    checks,
    summary: { checks: checks.length, passed, pass: passed === checks.length },
  };
  await writeResult({
    version: '266-live-economy-browser-v1',
    generatedAt,
    status: run.summary.pass ? 'PASS' : 'FAIL',
    reason: run.summary.pass ? null : 'One or more browser checks failed.',
    run,
  });
  console.log(
    `SUMMARY checks ${passed}/${checks.length}, revenue ${run.revenueMinorUnits} SDA, rating ${run.rating}, reviews ${run.reviewCount}, history scans ${run.historyScansAfterPanel}, pass ${run.summary.pass}`,
  );
  if (!run.summary.pass) process.exitCode = 1;
} catch (error) {
  await writeResult({
    version: '266-live-economy-browser-v1',
    generatedAt,
    status: 'FAIL',
    reason: error instanceof Error ? error.message : String(error),
    run: null,
  });
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
