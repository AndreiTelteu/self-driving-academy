import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 265 — browser probe for a complete manual ride and a terminal failed ride.
 *
 * The probe starts the real build, waits for a real 264 assignment, takes over the claimed taxi
 * (the ride survives by design), drives it to the validated 032 pickup/dropoff anchors, stops for
 * the real dwell, verifies the passenger/HUD/panel, then makes another claimed taxi BLOCKED through
 * the real health port and verifies the FAILED/TAXI_BLOCKED terminal with one release.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '265-ride-lifecycle'),
  browserJson = join(directory, 'browser.json'),
  reportMarkdown = join(directory, 'browser.md'),
  screenshots = join(directory, 'screenshots'),
  buildDirectory = join(root, '.pbi-validation-265', 'build');

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
    return `# 265 — proba de browser a ciclului de cursă

Generată de \`npm run ride:live:lifecycle:probe\`.

**NOT_RUN** — ${result.reason}

Nu este raportat niciun PASS simulat. Raportul determinist acoperă lifecycle-ul 061–064, pasagerul
147, HUD-ul 073, eliberarea revendicării și resetul.
`;
  }
  const checks = run.checks
    .map((entry) => `- \`${entry.name}\`: ${entry.pass ? 'PASS' : 'FAIL'} — ${entry.detail}`)
    .join('\n');
  return `# 265 — proba de browser a ciclului de cursă

Generată de \`npm run ride:live:lifecycle:probe\`; Chromium ${run.browser}, backend ${run.actualBackend},
viewport ${run.viewport}, tick ${run.tickAtTakeover}–${run.tickAtFailure}.

Secvența reală: start → asignare 060 → preluarea taxiului revendicat (cursa supraviețuiește) → condus
manual la ancora 032 de pickup → oprire pentru dwell → pasager 147 la bord → condus la ancora de
dropoff → oprire pentru dwell → \`COMPLETED\` cu o singură eliberare → un alt taxi revendicat devine
\`BLOCKED\` prin portul real de sănătate → \`FAILED / TAXI_BLOCKED\` cu o singură eliberare.

Cursă completă: ${run.completedRideId} (${run.completedTaxiId}), pickup ${run.pickupZoneId} → dropoff
${run.dropoffZoneId}, boarding ${run.boardingTick}, completion ${run.completionTick}.
Cursă eșuată: ${run.failedRideId} (${run.failedTaxiId}), motiv ${run.failedReason}.

Capturi: ${run.screenshots.map((file) => `[${file}](${file})`).join(', ')}.

${checks}

Limite: proba condusă manual folosește tastatura reală și poziția autoritară a compunerii; nu
înlocuiește un playtest uman. Cursa autonomă completă rămâne o limitare explicită (taxiurile AI nu
primesc încă un traseu de cursă în compunere). Nu măsoară FPS/GPU și nu înlocuiește gate-ul 287.
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
const generatedAt = new Date().toISOString();

if (playwright === null) {
  await writeResult({
    version: '265-live-ride-lifecycle-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason:
      'Playwright is not installed in this checkout (no `playwright` module and no PLAYWRIGHT_MODULE); the browser probe was not run.',
    run: null,
  });
  console.log('Live ride lifecycle browser probe NOT_RUN: Playwright is not installed.');
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
    version: '265-live-ride-lifecycle-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason: `Browser launch failed: ${launchError instanceof Error ? launchError.message : String(launchError)}`,
    run: null,
  });
  server.close();
  console.log('Live ride lifecycle browser probe NOT_RUN: browser launch failed.');
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
          `Timeout waiting for ${label}: lifecycle ${lifecycle?.kind}/${lifecycle?.reason ?? 'none'}, shell paused ${shellState?.paused}/${shellState?.cause ?? 'none'}, fault ${shellState?.fault ?? 'none'}, tick ${shellState?.tick}, page errors ${pageErrors.length}`,
        );
      }
      await page.waitForTimeout(100);
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
  const passengerFor = async (rideId) => {
    const state = await rides();
    return state?.passenger?.[rideId] ?? null;
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
    const startedAt = Date.now();
    const deadline = startedAt + 360000;
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
        if (Date.now() - missingSince > 15000) {
          const frame = await read(),
            sh = await shell(),
            rideState = await rides();
          throw new Error(
            `Taxi ${taxiId} disappeared during ${label}: read ${frame === null ? 'null' : `${frame.vehicles?.length ?? 'no'} vehicles @ ${frame.tick}`}, shell ${sh?.paused}/${sh?.cause ?? 'none'}/${sh?.fault ?? 'ok'}, ride ${rideState?.rides?.rides?.find((entry) => entry.taxiId === taxiId)?.state ?? 'missing'}, page ${pageErrors.slice(-2).join(' | ')}, console ${consoleErrors.slice(-2).join(' | ')}`,
          );
        }
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
          `drive ${label}: pos ${position.x.toFixed(1)},${position.z.toFixed(1)} yaw ${current.yawRad.toFixed(2)} speed ${current.speedMps.toFixed(1)} wp ${nearest}/${waypoints.length} target ${target.x.toFixed(1)},${target.z.toFixed(1)} dist ${targetDistance.toFixed(1)} err ${error.toFixed(2)}`,
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
          // The centre stopped just outside the small 032 zone: creep toward the anchor, never
          // away from it, then brake with the handbrake so no reverse is accidentally engaged.
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

  // Wait for a real 264 assignment and take over the claimed taxi.
  await waitUntil(
    () => {
      const frame = globalThis.__v3Composition.read();
      return frame !== null && Array.isArray(frame.vehicles) && frame.vehicles.length > 0;
    },
    null,
    60000,
    'the authoritative composition frame',
  );
  await waitUntil(
    () => {
      const state = globalThis.__v3Composition.rides();
      return (
        state?.snapshot?.counts?.requests > 0 &&
        state?.rides?.rides?.length > 0 &&
        state.rides.rides.some((ride) => !ride.terminal && ride.state === 'TO_PICKUP')
      );
    },
    null,
    180000,
    'a live ride in TO_PICKUP',
  );
  let state = await rides();
  const target =
    state.rides.rides.find((ride) => !ride.terminal && ride.state === 'TO_PICKUP') ?? null;
  if (target === null) throw new Error('No live ride to drive');
  const assignment = state.snapshot.assignments.find(
    (entry) => entry.requestId === target.requestId,
  );
  if (assignment === undefined) throw new Error('The ride lost its 060 claim');
  const tickAtTakeover = (await read()).tick;
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
  await waitUntil(
    (rideId) => {
      const current = globalThis.__v3Composition.rides();
      return (
        current?.rides?.rides?.some(
          (ride) => ride.rideId === rideId && !ride.terminal && ride.state === 'TO_PICKUP',
        ) && current.snapshot.totals.releasesByCause.PLAYER_TAKEOVER === 0
      );
    },
    target.rideId,
    30000,
    'ride survives the player takeover',
  );
  const afterTakeover = await rides();
  check(
    'ride-survives-takeover',
    afterTakeover.rides.rides.some((ride) => ride.rideId === target.rideId && !ride.terminal) &&
      afterTakeover.snapshot.totals.releasesByCause.PLAYER_TAKEOVER === 0,
    'the claimed taxi became MANUAL and kept its 061 ride and 060 claim',
  );
  check(
    'player-claim-kept',
    afterTakeover.snapshot.assignments.some(
      (entry) => entry.requestId === target.requestId && entry.taxiId === target.taxiId,
    ),
    'the assignment is still present for the player-driven taxi',
  );
  const shellAtOpen = await shell();
  check(
    'rides-port-present',
    shellAtOpen.systems.some((system) => system.id === 'rides' && system.status === 'PRESENT'),
    'shell mounts the 265 rides port',
  );

  // Drive to the real pickup anchor and stop for the real dwell.
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
  const atPickup = await rideFor(target.rideId);
  const pickupPassenger = await passengerFor(target.rideId);
  const hudAtPickup = await page.locator('.taxi-hud').textContent();
  check(
    'pickup-zone-arrival',
    atPickup?.state === 'PICKUP' || atPickup?.state === 'TO_DROPOFF',
    `ride state ${atPickup?.state}; pickup ${target.pickupZoneId}`,
  );
  check(
    'pickup-dwell',
    (atPickup?.pickup?.requiredDwellTicks ?? 0) === 180,
    `required dwell ${atPickup?.pickup?.requiredDwellTicks}`,
  );
  check(
    'passenger-boarding-visible',
    pickupPassenger === null || ['BOARDING', 'ONBOARD'].includes(pickupPassenger.phase),
    `passenger phase ${pickupPassenger?.phase}`,
  );
  check(
    'hud-pickup',
    ['Spre pasager', 'La pasager', 'Spre destinație'].some((stage) =>
      (hudAtPickup ?? '').includes(stage),
    ),
    (hudAtPickup ?? '').slice(0, 160),
  );
  check(
    'hud-pickup-progress',
    (hudAtPickup ?? '').includes('100%') || (hudAtPickup ?? '').includes('Progres'),
    'the HUD exposes the certified progress at the pickup anchor',
  );
  const screenshotsTaken = [await shot('01-pickup')];
  await waitUntil(
    (rideId) =>
      globalThis.__v3Composition
        .rides()
        .rides.rides.some((ride) => ride.rideId === rideId && ride.state === 'TO_DROPOFF'),
    target.rideId,
    60000,
    'boarding',
  );
  const onboard = await rideFor(target.rideId);
  const onboardPassenger = await passengerFor(target.rideId);
  const hudOnboard = await page.locator('.taxi-hud').textContent();
  const markersOnboard = (await rides()).markers;
  check(
    'passenger-onboard',
    onboardPassenger?.phase === 'ONBOARD' && onboardPassenger.occupancy === 1,
    `phase ${onboardPassenger?.phase}, occupancy ${onboardPassenger?.occupancy}`,
  );
  check(
    'passenger-marker-onboard',
    markersOnboard.markers === 1 && markersOnboard.passengerVisible === true,
    `${markersOnboard.markers} marker(s), visible ${markersOnboard.passengerVisible}`,
  );
  check(
    'hud-trip',
    (hudOnboard ?? '').includes('Spre destinație'),
    (hudOnboard ?? '').slice(0, 160),
  );
  screenshotsTaken.push(await shot('02-onboard'));

  // Drive to the real dropoff anchor and stop for the dwell.
  await driveTo(target.taxiId, assignment.tripRouteLaneIds, target.dropoffAnchor, 'dropoff');
  await waitUntil(
    (rideId) =>
      globalThis.__v3Composition
        .rides()
        .rides.rides.some((ride) => ride.rideId === rideId && ride.state === 'DROPOFF'),
    target.rideId,
    30000,
    'dropoff arrival',
  );
  const atDropoff = await rideFor(target.rideId);
  const dropoffPassenger = await passengerFor(target.rideId);
  check(
    'dropoff-zone-arrival',
    atDropoff?.state === 'DROPOFF',
    `ride state ${atDropoff?.state}; dropoff ${target.dropoffZoneId}`,
  );
  check(
    'passenger-dropping-off',
    dropoffPassenger?.phase === 'DROPPING_OFF',
    `passenger phase ${dropoffPassenger?.phase}`,
  );
  screenshotsTaken.push(await shot('03-dropoff'));
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
  const completedPassenger = await passengerFor(target.rideId);
  const stateAfterCompletion = await rides();
  check(
    'ride-completed',
    completed !== null && completed.terminal && completed.reason === null,
    `terminal ${completed?.terminal}, reason ${completed?.reason ?? '—'}`,
  );
  check(
    'completion-release',
    completed?.release?.reason === 'COMPLETED' &&
      !stateAfterCompletion.snapshot.assignments.some(
        (entry) => entry.requestId === target.requestId,
      ),
    `release ${completed?.release?.reason}, claim removed`,
  );
  check(
    'passenger-hidden-after-dropoff',
    completedPassenger?.phase === 'NONE' && completedPassenger.reset === true,
    `phase ${completedPassenger?.phase}, reset ${completedPassenger?.reset}`,
  );
  const hudAfterCompletion = (await page.locator('.taxi-hud').textContent()) ?? '';
  check(
    'hud-after-completion',
    !hudAfterCompletion.includes('Spre destinație'),
    'the HUD no longer claims an active trip',
  );
  const completedTick = (await read()).tick;
  screenshotsTaken.push(await shot('04-completed'));

  // Failed ride: another claimed taxi becomes BLOCKED through the real health port.
  const beforeFailure = await rides();
  const failureTarget =
    beforeFailure.rides.rides.find(
      (ride) => !ride.terminal && ride.taxiId !== target.taxiId && ride.state === 'TO_PICKUP',
    ) ?? null;
  if (failureTarget === null) throw new Error('No active ride for the failure probe');
  const health = await page.evaluate(
    (taxiId) => globalThis.__v3Composition.setTaxiHealth?.(taxiId, 'BLOCKED') ?? null,
    failureTarget.taxiId,
  );
  const tickAtFailure = (await read()).tick;
  await waitUntil(
    (rideId) =>
      globalThis.__v3Composition
        .rides()
        .rides.terminals.some((entry) => entry.rideId === rideId && entry.cause === 'BLOCKED'),
    failureTarget.rideId,
    30000,
    'failed ride receipt',
  );
  const failed = await rideFor(failureTarget.rideId);
  const afterFailure = await rides();
  check('failure-health-port', health === 'BLOCKED', `setTaxiHealth returned ${health}`);
  check(
    'failure-terminal',
    failed?.state === 'FAILED' && failed.reason === 'TAXI_BLOCKED',
    `state ${failed?.state}, reason ${failed?.reason ?? '—'}`,
  );
  check(
    'failure-release',
    failed?.release?.reason === 'FAILED' &&
      !afterFailure.snapshot.assignments.some(
        (entry) => entry.requestId === failureTarget.requestId,
      ),
    `release ${failed?.release?.reason}, claim removed`,
  );
  check(
    'failure-single-receipt',
    afterFailure.rides.terminals.filter((entry) => entry.rideId === failureTarget.rideId).length ===
      1,
    `${afterFailure.rides.terminals.filter((entry) => entry.rideId === failureTarget.rideId).length} receipt(s)`,
  );
  screenshotsTaken.push(await shot('05-failed'));

  // The read-only panel shows the completed and failed rows with the real reasons.
  await page.locator('[data-shell-action="rides"]').click();
  await waitUntil(
    () => globalThis.__v3Composition.rides().panelOpen === true,
    null,
    30000,
    'rides panel open',
  );
  const panelText = await page.locator('[data-live-rides]').textContent();
  check(
    'panel-completed-row',
    (panelText ?? '').includes('Cursă încheiată'),
    'the panel shows the completed ride',
  );
  check(
    'panel-failed-reason',
    (panelText ?? '').includes('Cursă eșuată') && (panelText ?? '').includes('TAXI_BLOCKED'),
    'the panel shows FAILED and its closed reason',
  );
  screenshotsTaken.push(await shot('06-panel'));
  await page.locator('[data-live-action="close"]').click();
  await focusCanvas();
  await releaseKeys();

  check('no-page-errors', pageErrors.length === 0, `${pageErrors.length} page errors`);
  check('no-console-errors', consoleErrors.length === 0, `${consoleErrors.length} console errors`);
  const pass = checks.every((entry) => entry.pass);
  await writeResult({
    version: '265-live-ride-lifecycle-browser-v1',
    generatedAt,
    status: 'MEASURED',
    run: {
      pass,
      browser: browser.version(),
      requestedBackend: 'WEBGL2',
      actualBackend,
      viewport: '1440x900',
      url,
      tickAtTakeover,
      tickAtFailure,
      completedRideId: target.rideId,
      completedTaxiId: target.taxiId,
      pickupZoneId: target.pickupZoneId,
      dropoffZoneId: target.dropoffZoneId,
      boardingTick: onboard?.boardingTick ?? null,
      completionTick: completed?.completionTick ?? completedTick,
      failedRideId: failureTarget.rideId,
      failedTaxiId: failureTarget.taxiId,
      failedReason: failed?.reason ?? null,
      screenshots: screenshotsTaken,
      checks,
      pageErrors,
      consoleErrors,
    },
  });
  console.log(
    `SUMMARY live ride lifecycle ${pass ? 'PASS' : 'FAIL'} checks ${checks.filter((entry) => entry.pass).length}/${checks.length}`,
  );
} catch (error) {
  await writeResult({
    version: '265-live-ride-lifecycle-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason: `Browser probe failed before completing the real sequence: ${
      error instanceof Error ? error.message : String(error)
    }`,
    run: null,
  });
  console.error('Live ride lifecycle browser probe did not complete.');
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
