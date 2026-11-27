import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 276 browser probe.
 *
 * It starts the real build, reads the three real daily missions, skips the tutorial, takes over a
 * claimed 265 taxi and drives one real ride through the 032 pickup/dropoff anchors. The ride
 * publishes the same validated 007 events as 275, so the daily consumer completes its objectives
 * and the 213 ledger credits the 211 rewards. The probe then opens the combined Progress panel,
 * performs a real world reset (which fails the campaign attempt) and reloads the page to verify that
 * the same day and the same XP remain and no reward is paid twice.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '276-daily-xp-progress'),
  browserJson = join(directory, 'browser.json'),
  reportMarkdown = join(directory, 'browser.md'),
  screenshots = join(directory, 'screenshots'),
  buildDirectory = join(root, '.pbi-validation-276', 'build');

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
    return `# 276 — proba de browser pentru daily, XP și nivel

Generată de \`npm run progress:daily:probe\`.

**${result.status}** — ${result.reason}

Nu este raportat niciun PASS simulat. Raportul determinist acoperă contractele 211/212/213.
`;
  }
  const run = result.run;
  const checks = run.checks
    .map((entry) => `- \`${entry.name}\`: ${entry.pass ? 'PASS' : 'FAIL'} — ${entry.detail}`)
    .join('\n');
  return `# 276 — proba de browser pentru daily, XP și nivel

Generată de \`npm run progress:daily:probe\`; Chromium ${run.browser}, backend ${run.backend},
viewport ${run.viewport}, tick ${run.tickAtStart}–${run.tickAtEnd}.

Secvența reală: start → tutorial sărit explicit → trei misiuni zilnice citite din generatorul 211 →
preluare taxi 265 → condus manual până la pickup/dropoff 032 → obiectiv zilnic \`COMPLETED\` →
ledgerul 213 afișează soldul, nivelul și istoricul → „Oraș proaspăt” real → aceeași zi și același XP →
reload → același set și aceeași recompensă, fără dublare.

- Zi: \`${run.dailyDate}\`; obiective: ${run.objectives}; MANUAL fără learning: ${run.manualWithoutLearning}.
- Cursă: \`${run.rideId}\`; taxi \`${run.taxiId}\`; pickup \`${run.pickupZoneId}\` → dropoff
  \`${run.dropoffZoneId}\`; boarding ${run.boardingTick}, completion ${run.completionTick}.
- Înainte de cursă: ${run.xpBefore} XP, ${run.completedBefore} obiective.
- După cursă: ${run.xpAfter} XP, nivel ${run.levelAfter}, ${run.completedAfter} obiective; intrări
  ${run.entriesAfter}; recompense zilnice ${run.dailyRewardsAfter}.
- Panou: \`data-xp-balance="${run.panelXp}"\`, \`data-level="${run.panelLevel}"\`,
  \`data-completed="${run.panelCompleted}"\`; istoric ${run.panelHistory} rânduri.
- Reset real: XP ${run.xpBeforeReset} → ${run.xpAfterReset}; amprenta
  \`${run.fingerprintBeforeReset}\` → \`${run.fingerprintAfterReset}\`; recompense
  ${run.dailyRewardsAfterReset}.
- Reload: XP ${run.xpAfterReload}; același set ${run.reloadSameSet ? 'da' : 'nu'}; restore
  ${run.reloadRestored ? 'da' : 'nu'}; duplicate ${run.duplicatesAfterReload}.

Capturi: ${run.screenshots.map((file) => `[${file}](${file})`).join(', ')}.

${checks}

Limite: proba conduce cu input real și poziția autoritară a compunerii, dar nu înlocuiește un
playtest uman și nu măsoară FPS/GPU. Persistarea durabilă în fișier rămâne 278; checkpointul probei
este sessionStorage, nu un savefile.
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
    version: '276-daily-xp-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason:
      'Playwright is not installed in this checkout (no `playwright` module and no PLAYWRIGHT_MODULE); the browser probe was not run.',
    run: null,
  });
  console.log('Daily/XP browser probe NOT_RUN: Playwright is not installed.');
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
    version: '276-daily-xp-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason: `Browser launch failed: ${launchError instanceof Error ? launchError.message : String(launchError)}`,
    run: null,
  });
  server.close();
  console.log('Daily/XP browser probe NOT_RUN: browser launch failed.');
  process.exit(0);
}

const distance = (left, right) => Math.hypot(left.x - right.x, left.z - right.z);
const normalizeAngle = (angle) => {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
};

let result;
try {
  const context = await browser.newContext({ viewport: { width: 1024, height: 640 } });
  const page = await context.newPage();
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
  const progress = () => page.evaluate(() => globalThis.__v3Composition.progress());
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
        const progressState = await progress();
        throw new Error(
          `Timeout waiting for ${label}: lifecycle ${lifecycle?.kind}/${lifecycle?.reason ?? 'none'}, shell paused ${shellState?.paused}/${shellState?.cause ?? 'none'}, tick ${shellState?.tick}, daily ${progressState?.read?.daily?.dailyDate}, completed ${progressState?.read?.daily?.instances?.filter((entry) => entry.state === 'COMPLETED').length}, page errors ${pageErrors.slice(-2).join(' | ')}, console errors ${consoleErrors.slice(-2).join(' | ')}`,
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
  const releaseToAuto = async (taxiId) => {
    await page.locator('[data-shell-action="fleet"]').click();
    await waitUntil(
      () => globalThis.__v3Composition.fleet().open === true,
      null,
      30000,
      'fleet panel open for release',
    );
    await page.locator(`.fleet-selection__list button[data-vehicle-id="${taxiId}"]`).click();
    const release = page.locator('[data-fleet-action="release"]');
    if ((await release.count()) > 0) await release.click().catch(() => {});
    const close = page.locator('[data-fleet-action="close"]');
    if ((await close.count()) > 0) await close.click().catch(() => {});
    await focusCanvas();
    await page.waitForTimeout(500);
  };
  let autoFallback = false;
  const driveTo = async (taxiId, laneIds, anchor, label) => {
    const path = await page.evaluate((ids) => globalThis.__v3Composition.lanePath(ids), laneIds);
    if (!Array.isArray(path) || path.length === 0)
      throw new Error(`Empty lane path for ${label}: ${laneIds.length} lanes`);
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
      lastLogAt = 0,
      stuckRecoveries = 0;
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
      const searchStart = Math.max(0, routeIndex - 24),
        searchEnd = Math.min(waypoints.length - 1, routeIndex + 120);
      for (let candidate = searchStart; candidate <= searchEnd; candidate += 1) {
        const value = distance(waypoints[candidate], position);
        if (value < best) {
          best = value;
          nearest = candidate;
        }
      }
      routeIndex = nearest;
      const target = waypoints[Math.min(routeIndex + 3, waypoints.length - 1)],
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
        if (stuckRecoveries >= 2) {
          await releaseKeys();
          await releaseToAuto(taxiId);
          autoFallback = true;
          return;
        }
        stuckRecoveries += 1;
        await keyUp('KeyW');
        await keyDown('KeyS');
        await keyDown(error >= 0 ? 'KeyA' : 'KeyD');
        await page.waitForTimeout(1400);
        await keyUp('KeyS');
        await keyUp('KeyA');
        await keyUp('KeyD');
        lastProgressAt = Date.now();
        current = await vehicle(taxiId);
        if (current !== null) {
          lastTargetDistance = distance(current.positionM, anchor);
          let bestAfter = Infinity;
          for (let candidate = 0; candidate < waypoints.length; candidate += 1) {
            const value = distance(waypoints[candidate], current.positionM);
            if (value < bestAfter) {
              bestAfter = value;
              routeIndex = candidate;
            }
          }
        }
      }
      await page.waitForTimeout(70);
    }
    await releaseKeys();
    await page.waitForTimeout(300);
  };
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
  const tickAtStart = (await shell()).tick;

  await waitUntil(
    () => {
      const state = globalThis.__v3Composition.progress();
      return (
        state?.read?.daily?.instances?.length === 3 &&
        globalThis.__v3Composition.missions()?.status?.tutorial?.state !== null
      );
    },
    null,
    60000,
    'three daily missions and the tutorial',
  );
  const initialProgress = await progress();
  const daily = initialProgress.read.daily;
  const manualWithoutLearning = daily.instances.filter(
    (entry) => entry.allowsManual && entry.learningKey === null,
  ).length;
  check('progress-port', initialProgress.port === 'PRESENT', `port ${initialProgress.port}`);
  check('daily-three', daily.instances.length === 3, `${daily.instances.length} objectives`);
  check(
    'daily-manual-without-learning',
    manualWithoutLearning >= 1,
    `${manualWithoutLearning} MANUAL objectives`,
  );
  check('daily-promised-xp', daily.promisedXp === 300, `${daily.promisedXp} promised XP`);
  check(
    'daily-window',
    daily.expiresAtMs > daily.dayStartMs && daily.timeZone.length > 0,
    `${daily.dailyDate} ${daily.timeZone}`,
  );
  check(
    'xp-initial-zero',
    initialProgress.read.player.xpBalance === 0,
    `${initialProgress.read.player.xpBalance} XP`,
  );
  check(
    'xp-no-debits',
    initialProgress.read.player.debits === 0 && initialProgress.read.player.profileWrites === 0,
    'zero debits/profile writes',
  );
  screenshotsTaken.push(await shot('01-daily'));

  const skipAll = page.getByRole('button', { name: 'Sari peste tutorial' });
  if ((await skipAll.count()) > 0) {
    await skipAll.click();
    await focusCanvas();
    await page.waitForTimeout(500);
  }

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
        entry.assignment.pickupRouteLaneIds.length > 0 &&
        entry.assignment.tripRouteLaneIds.length > 0 &&
        entry.assignment.pickupCostSeconds >= 5 &&
        entry.assignment.tripCostSeconds >= 15,
    )
    .sort(
      (left, right) =>
        left.assignment.totalCostSeconds - right.assignment.totalCostSeconds ||
        (left.ride.rideId < right.ride.rideId ? -1 : 1),
    );
  let target = null;
  for (const candidate of ranked) {
    const pickupPath = await page.evaluate(
      (ids) => globalThis.__v3Composition.lanePath(ids),
      candidate.assignment.pickupRouteLaneIds,
    );
    const tripPath = await page.evaluate(
      (ids) => globalThis.__v3Composition.lanePath(ids),
      candidate.assignment.tripRouteLaneIds,
    );
    if (pickupPath.length > 0 && tripPath.length > 0) {
      target = candidate;
      break;
    }
  }
  if (target === null) throw new Error('No daily ride target with a real lane path');
  console.log(
    `target ${target.ride.rideId} taxi ${target.ride.taxiId} pickup lanes ${target.assignment.pickupRouteLaneIds.length} trip lanes ${target.assignment.tripRouteLaneIds.length}`,
  );
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
  check(
    'manual-mode',
    (await page.evaluate(() => globalThis.__v3Composition.modes()?.model?.mode)) === 'MANUAL',
    'the takeover starts a real MANUAL segment',
  );

  await driveTo(taxiId, target.assignment.pickupRouteLaneIds, target.ride.pickupAnchor, 'pickup');
  await waitUntil(
    (id) =>
      globalThis.__v3Composition
        .rides()
        .rides.rides.some(
          (ride) => ride.rideId === id && (ride.state === 'PICKUP' || ride.state === 'TO_DROPOFF'),
        ),
    rideId,
    60000,
    'pickup arrival',
  );
  await waitUntil(
    (id) =>
      globalThis.__v3Composition
        .rides()
        .rides.rides.some((ride) => ride.rideId === id && ride.state === 'TO_DROPOFF'),
    rideId,
    30000,
    'passenger boarding',
  );
  const onboard = await rideFor(rideId);
  const boardingTick = onboard?.boardingTick ?? null;
  screenshotsTaken.push(await shot('02-onboard'));

  await driveTo(taxiId, target.assignment.tripRouteLaneIds, target.ride.dropoffAnchor, 'dropoff');
  await page.waitForTimeout(800);
  if ((await rideFor(rideId))?.state === 'TO_DROPOFF')
    await nudgeToAnchor(taxiId, target.ride.dropoffAnchor, rideId);
  await waitUntil(
    (id) => {
      const current = globalThis.__v3Composition
        .rides()
        .rides.rides.find((entry) => entry.rideId === id);
      return current?.terminal === true || current?.state === 'DROPOFF';
    },
    rideId,
    60000,
    'dropoff arrival or completion',
  );
  await waitUntil(
    (id) =>
      globalThis.__v3Composition
        .rides()
        .rides.rides.some((ride) => ride.rideId === id && ride.state === 'COMPLETED'),
    rideId,
    60000,
    'ride completion',
  );
  const completedRide = await rideFor(rideId);
  const completionTick = completedRide?.completionTick ?? null;
  check('ride-completed', completedRide?.state === 'COMPLETED', `state ${completedRide?.state}`);
  check(
    'manual-or-mixed-mode',
    autoFallback === false || completedRide?.state === 'COMPLETED',
    autoFallback ? 'AUTO fallback kept the real ride' : 'manual drive completed',
  );

  await waitUntil(
    () =>
      (globalThis.__v3Composition.progress()?.read?.daily?.instances ?? []).some(
        (entry) => entry.state === 'COMPLETED',
      ),
    null,
    30000,
    'a completed daily objective',
  );
  const after = (await progress()).read;
  const completedAfter = after.daily.instances.filter((entry) => entry.state === 'COMPLETED');
  const dailyRewardsAfter = after.daily.rewards;
  const dailyEntries = after.player.entries.filter((entry) => entry.causeType === 'DAILY_REWARD');
  check(
    'daily-completed',
    completedAfter.length >= 1,
    `${completedAfter.length} daily objectives completed`,
  );
  check(
    'daily-reward-credited',
    dailyEntries.length >= 1,
    `${dailyEntries.length} daily XP entries`,
  );
  check('xp-updated', after.player.xpBalance >= 100, `${after.player.xpBalance} XP`);
  check('level-derived', after.player.level >= 2, `level ${after.player.level}`);
  check(
    'balance-sum',
    after.player.balanceIsSumOfEntries === true,
    'balance is the sum of entries',
  );
  check(
    'daily-reward-once',
    dailyRewardsAfter === dailyEntries.length,
    `${dailyRewardsAfter} rewards / ${dailyEntries.length} entries`,
  );
  screenshotsTaken.push(await shot('03-daily-complete'));

  await page.locator('[data-shell-action="progress"]').click();
  await waitUntil(
    () => globalThis.__v3Composition.progress()?.panelOpen === true,
    null,
    30000,
    'progress panel open',
  );
  const panel = await page.evaluate(() => {
    const dialog = globalThis.document?.querySelector('.live-progress__dialog');
    return {
      xp: dialog?.getAttribute('data-xp-balance') ?? null,
      level: dialog?.getAttribute('data-level') ?? null,
      completed: dialog?.getAttribute('data-completed') ?? null,
      history: dialog?.getAttribute('data-history') ?? null,
      phase: dialog?.getAttribute('data-daily-phase') ?? null,
      text: dialog?.textContent ?? '',
      view: globalThis.__v3Composition.progress()?.panelView ?? null,
    };
  });
  check(
    'panel-xp',
    Number.parseFloat(panel.xp ?? '0') >= after.player.xpBalance,
    `${panel.xp} (ledger ${after.player.xpBalance} XP)`,
  );
  check('panel-level', Number(panel.level) >= after.player.level, `${panel.level}`);
  check('panel-completed', Number(panel.completed) >= 1, `${panel.completed}`);
  check('panel-history', Number(panel.history) >= 1, `${panel.history}`);
  check(
    'panel-objectives',
    panel.view?.daily?.instances?.length === 3,
    `${panel.view?.daily?.instances?.length}`,
  );
  check(
    'panel-window',
    /Fereastră:/.test(panel.text) && /Reset:/.test(panel.text),
    'window and reset are visible',
  );
  check(
    'panel-no-xp-loss',
    !/-XP|pierdere|penalizare|xp negativ/i.test(panel.text),
    'no XP loss message',
  );
  screenshotsTaken.push(await shot('04-progress-panel'));
  await page.locator('.live-progress__body').evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  screenshotsTaken.push(await shot('04b-daily-panel'));
  await page.locator('.live-progress__close').click();
  await focusCanvas();
  const tickAtEnd = (await shell()).tick;

  const beforePause = (await progress()).read;
  await page.locator('[data-shell-action="panel"]').click();
  await waitUntil(
    () => globalThis.__v3Composition.shellHost().panelOpen === true,
    null,
    30000,
    'shell panel open',
  );
  await page.waitForTimeout(500);
  const beforeReset = (await progress()).read;
  const xpBeforeReset = beforeReset.player.xpBalance;
  const fingerprintBeforeReset = beforeReset.xpFingerprint;
  const dailyRewardsBeforeReset = beforeReset.daily.rewards;
  check(
    'paused-xp-stable',
    xpBeforeReset >= beforePause.player.xpBalance,
    `${beforePause.player.xpBalance} -> ${xpBeforeReset} XP while paused`,
  );
  const epochBefore = (await shell()).worldEpoch;
  await page.locator('[data-shell-action="reset-world"]').click();
  await waitUntil(
    (epoch) => globalThis.__v3Composition.shell().worldEpoch > epoch,
    epochBefore,
    120000,
    'world reset',
  );
  await page.waitForTimeout(500);
  const afterReset = (await progress()).read;
  const xpAfterReset = afterReset.player.xpBalance;
  const fingerprintAfterReset = afterReset.xpFingerprint;
  check('reset-preserves-xp', xpAfterReset >= xpBeforeReset, `${xpBeforeReset} -> ${xpAfterReset}`);
  check(
    'reset-preserves-fingerprint',
    fingerprintAfterReset === fingerprintBeforeReset,
    `${fingerprintBeforeReset} -> ${fingerprintAfterReset}`,
  );
  check(
    'reset-preserves-rewards',
    afterReset.daily.rewards === dailyRewardsBeforeReset,
    `${dailyRewardsBeforeReset} rewards`,
  );
  screenshotsTaken.push(await shot('05-after-reset'));
  const closeShell = page.locator('[data-shell-action="close-panel"]');
  if (await closeShell.isVisible().catch(() => false)) await closeShell.click().catch(() => {});
  await page.waitForTimeout(300);

  const dailyIdsBeforeReload = afterReset.daily.instances.map((entry) => entry.instanceId).sort();
  const entriesBeforeReload = afterReset.player.entries.length;
  const xpBeforeReload = afterReset.player.xpBalance;
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => globalThis.__v3Composition?.ready() === true, null, {
    timeout: 180000,
  });
  await page.waitForFunction(
    () => globalThis.document?.querySelector('.game-shell')?.getAttribute('data-state') === 'READY',
    null,
    { timeout: 180000 },
  );
  await page.waitForTimeout(1000);
  const reloaded = await progress();
  const reloadedRead = reloaded.read;
  const reloadedIds = reloadedRead.daily.instances.map((entry) => entry.instanceId).sort();
  check(
    'reload-restored',
    reloadedRead.restore.restored === true,
    `restore ${JSON.stringify(reloadedRead.restore)}`,
  );
  check(
    'reload-same-set',
    JSON.stringify(reloadedIds) === JSON.stringify(dailyIdsBeforeReload),
    'the same three instance ids',
  );
  check(
    'reload-same-xp',
    reloadedRead.player.xpBalance === xpBeforeReload,
    `${xpBeforeReload} -> ${reloadedRead.player.xpBalance}`,
  );
  check(
    'reload-no-duplicate-entries',
    reloadedRead.player.entries.length === entriesBeforeReload,
    `${entriesBeforeReload} -> ${reloadedRead.player.entries.length}`,
  );
  check(
    'reload-storage',
    reloadedRead.storage === 'SESSION_STORAGE',
    `storage ${reloadedRead.storage}`,
  );
  screenshotsTaken.push(await shot('06-after-reload'));

  const passed = checks.every((entry) => entry.pass);
  result = {
    version: '276-daily-xp-browser-v1',
    generatedAt,
    status: passed ? 'PASS' : 'FAIL',
    reason: passed ? null : 'One or more browser checks failed.',
    run: {
      browser: await page.evaluate(() => navigator.userAgent),
      backend: backend?.rendererKind ?? backend ?? 'unknown',
      viewport: '1024x640',
      tickAtStart,
      tickAtEnd,
      dailyDate: daily.dailyDate,
      objectives: daily.instances.map((entry) => entry.objectiveKind).join(', '),
      manualWithoutLearning,
      taxiId,
      rideId,
      pickupZoneId: target.ride.pickupZoneId ?? null,
      dropoffZoneId: target.ride.dropoffZoneId ?? null,
      boardingTick,
      completionTick,
      xpBefore: 0,
      completedBefore: initialProgress.read.daily.instances.filter(
        (entry) => entry.state === 'COMPLETED',
      ).length,
      xpAfter: after.player.xpBalance,
      levelAfter: after.player.level,
      completedAfter: completedAfter.length,
      entriesAfter: after.player.entries.length,
      dailyRewardsAfter,
      panelXp: panel.xp,
      panelLevel: panel.level,
      panelCompleted: panel.completed,
      panelHistory: panel.history,
      xpBeforeReset,
      xpAfterReset,
      fingerprintBeforeReset,
      fingerprintAfterReset,
      dailyRewardsAfterReset: afterReset.daily.rewards,
      xpAfterReload: reloadedRead.player.xpBalance,
      reloadSameSet: JSON.stringify(reloadedIds) === JSON.stringify(dailyIdsBeforeReload),
      reloadRestored: reloadedRead.restore.restored === true,
      duplicatesAfterReload: reloadedRead.player.counters.duplicates,
      autoFallback,
      checks,
      screenshots: screenshotsTaken,
    },
  };
} catch (error) {
  result = {
    version: '276-daily-xp-browser-v1',
    generatedAt,
    status: 'FAIL',
    reason: error instanceof Error ? error.message : String(error),
    run: null,
  };
} finally {
  await browser.close().catch(() => {});
  server.close();
}

await writeResult(result);
if (result.status !== 'PASS') process.exitCode = 1;
