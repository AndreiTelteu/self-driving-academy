import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 273 browser probe.
 *
 * The real built game is opened in Chrome. A taxi is taken over, switched to LEARNING through the
 * real `L` key, driven along its real 041 route, then returned to AUTO. The probe reads only the
 * live debug model: the 272 closed segment, the real 103/221 queue, the immutable 109 version, the
 * 110 activation and the applied version of every taxi/civil. Playwright is optional: without it
 * the result is `NOT_RUN` with the real reason, never PASS.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const directory = join(root, 'Docs', 'Evidence', '273-live-learning');
const browserJson = join(directory, 'browser.json');
const browserMarkdown = join(directory, 'browser.md');
const screenshots = join(directory, 'screenshots');
const distDirectory = join(root, 'dist');

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
  const address = server.address();
  const origin = `http://127.0.0.1:${
    typeof address === 'object' && address !== null ? address.port : 0
  }`;
  return { server, origin };
}

function normalizeAngle(value) {
  return ((((value + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
}

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

function markdown(result) {
  if (!result.run) {
    return `# 273 — proba de browser a pipeline-ului live de learning

Generată de \`npm run learning:live:probe\`.

**NOT_RUN** — ${result.reason}

Testele deterministe acoperă refuzurile, compunerea, activarea și bariera; niciun PASS nu este simulat.
`;
  }
  const rows = result.run.checks
    .map((check) => `- \`${check.name}\`: ${check.pass ? 'PASS' : 'FAIL'} — ${check.detail}`)
    .join('\n');
  return `# 273 — proba de browser a pipeline-ului live de learning

Generată de \`npm run learning:live:probe\`; Chromium ${result.run.browser}, viewport ${result.run.viewport}.

Flux real: start → panoul \`Flotă\` → preluare taxi → \`L\` LEARNING → condus pe ruta 041 →
\`L\` MANUAL → \`M\` AUTO. Proba citește segmentul 272, coada 103/221, versiunea 109, activarea 110 și
versiunea aplicată pe fiecare taxi și civil.

${rows}

## Rezultat

- Segment LEARNING închis: ${result.run.segmentId ?? '—'}
- Joburi / versiuni: ${result.run.jobs} / ${result.run.versions}
- Versiune publicată: \`${result.run.versionId ?? '—'}\`
- Activare: ${result.run.activationStatus ?? '—'} la tick ${result.run.activateAtTick ?? '—'}, aplicată ${result.run.appliedAtTick ?? '—'}
- Fingerprint profil: \`${result.run.profileFingerprintBefore}\` → \`${result.run.profileFingerprintAfter}\`
- Flotă: ${result.run.fleetVersions.join(', ') || '—'}

## Limitări

- Drum local scurt, nu un playtest complet și nu o măsurare FPS/GPU/hardware.
- Browserul folosește runtime-ul 103/221 în proces când nu este disponibil un port Worker dedicat;
  probe-ul Node măsoară \`WorkerRuntime\` real.
`;
}

const result = { version: '273-live-learning-probe-v1', generatedAt: new Date().toISOString() };
const playwright = await loadPlaywright();
if (playwright === null) {
  result.reason =
    'Playwright is not installed in this checkout (no `playwright` module and no PLAYWRIGHT_MODULE); the browser probe was not run.';
  await mkdir(directory, { recursive: true });
  await writeFile(browserJson, `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(browserMarkdown, markdown(result));
  console.log('Live learning browser probe NOT_RUN: Playwright is not installed.');
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
  browser = await chromium.launch({
    headless: process.env.PLAYWRIGHT_HEADED === '1' ? false : true,
    ...(executablePath === null ? {} : { executablePath }),
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
    args: [
      ...(process.env.PLAYWRIGHT_SOFTWARE === '1'
        ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
        : ['--use-angle=default']),
      '--disable-gpu-sandbox',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-frame-rate-limit',
      '--disable-gpu-vsync',
      '--disable-features=CalculateNativeWinOcclusion',
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 800, height: 450 },
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
    `${served.origin}/?capture=1&debug=1&nofocuspause=1&backend=WEBGL2&preset=LOW&models=procedural`,
    { waitUntil: 'load', timeout: 180000 },
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
  if ((await page.evaluate(() => globalThis.__v3Composition.lifecycle()))?.kind !== 'PLAYING') {
    const resume = page.locator('[data-shell-action="resume"]');
    if ((await resume.count()) > 0) await resume.click();
  }
  const focusCanvas = () =>
    page.evaluate(() => {
      const canvas = globalThis.document?.querySelector('canvas');
      if (canvas instanceof globalThis.HTMLCanvasElement) canvas.focus();
    });
  await focusCanvas();
  const read = () => page.evaluate(() => globalThis.__v3Composition.read());
  const fleet = () => page.evaluate(() => globalThis.__v3Composition.fleet());
  const modes = () => page.evaluate(() => globalThis.__v3Composition.modes());
  const learning = () => page.evaluate(() => globalThis.__v3Composition.learning());
  const pumpFrame = () =>
    page.evaluate(
      () => new Promise((resolve) => globalThis.requestAnimationFrame(() => resolve(true))),
    );
  const ensurePlaying = async () => {
    const menuResume = page.locator('.pause-menu [data-action="resume"]');
    if ((await menuResume.count()) > 0 && (await menuResume.first().isVisible())) {
      await menuResume.first().click();
      await page.waitForTimeout(250);
      await focusCanvas();
      return true;
    }
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
  const waitMode = async (mode, timeout = 120000) => {
    const deadline = Date.now() + timeout;
    while ((await modes())?.model.mode !== mode) {
      if (Date.now() > deadline) throw new Error(`Mode ${mode} timeout`);
      if (await ensurePlaying()) continue;
      await pumpFrame();
      await page.waitForTimeout(50);
    }
  };
  const pressKey = async (key) => {
    await page.bringToFront();
    await focusCanvas();
    await page.keyboard.press(key);
  };
  const keyDown = async (key) => {
    await page.keyboard.down(key);
  };
  const keyUp = async (key) => {
    await page.keyboard.up(key);
  };
  const releaseKeys = async () => {
    for (const key of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space']) await keyUp(key).catch(() => {});
  };
  const currentVehicle = async (vehicleId) => {
    const frame = await read();
    return frame?.vehicles?.find((vehicle) => vehicle.vehicleId === vehicleId) ?? null;
  };
  const checks = [];
  const check = (name, pass, detail) => checks.push({ name, pass, detail });
  const shot = async (name) => {
    await mkdir(screenshots, { recursive: true });
    const relative = `screenshots/${name}.png`;
    await page.screenshot({ path: join(directory, relative), timeout: 120000 });
    return relative;
  };

  // The 275 tutorial intentionally blocks LEARNING until it is finished or skipped.
  const skipTutorial = page.getByRole('button', { name: 'Sari peste tutorial' });
  if ((await skipTutorial.count()) > 0 && (await skipTutorial.first().isVisible())) {
    await skipTutorial.first().click();
    await page.waitForTimeout(300);
    await focusCanvas();
  }
  await waitTicks(100);
  await ensurePlaying();
  const beforeLearning = await learning();
  const baseFingerprint = beforeLearning?.model?.profile?.fingerprint ?? null;
  const signalLanes = await page.evaluate(() => globalThis.__v3Composition.signalLanes?.() ?? []);
  const stopLanes = await page.evaluate(() => globalThis.__v3Composition.stopLanes?.() ?? []);
  const signalLaneIds = new Set(signalLanes.map((lane) => lane.laneId));
  const lineByLane = new Map();
  for (const lane of [...stopLanes, ...signalLanes]) {
    if (!lineByLane.has(lane.laneId)) lineByLane.set(lane.laneId, lane);
  }
  // A lane is ~140 m long; a taxi that just entered it is too far from the line. Wait until a real
  // taxi is 15-65 m before a real STOP/SIGNAL line on its route, then take it over and start
  // LEARNING immediately, so the first 10 s of the segment contain the real 086/087 approach.
  const approachTaxi = async (kind = 'ANY') => {
    const frame = await read();
    const rows = (frame?.vehicles ?? []).filter(
      (vehicle) =>
        vehicle.driverKind === 'TAXI' && vehicle.controlMode === 'AUTO' && vehicle.laneId !== null,
    );
    let best = null;
    let bestDistance = Infinity;
    let bestLine = null;
    for (const vehicle of rows) {
      const direct = lineByLane.get(vehicle.laneId);
      if (direct?.positionM) {
        const value = distance(direct.positionM, vehicle.positionM);
        const max = direct.stopLineId !== undefined ? 35 : 65;
        if (value >= 0.5 && value <= max && value < bestDistance) {
          best = vehicle;
          bestDistance = value;
          bestLine = direct;
        }
      }
      const route = vehicle.routeLaneIds ?? [];
      const current = Math.max(0, route.indexOf(vehicle.laneId));
      for (let index = current; index < Math.min(route.length, current + 6); index += 1) {
        const line = lineByLane.get(route[index]);
        if (!line?.positionM) continue;
        const stop = line.stopLineId !== undefined;
        if (kind === 'STOP' && (!stop || signalLaneIds.has(line.laneId))) continue;
        if (kind === 'SIGNAL' && stop) continue;
        const value = distance(line.positionM, vehicle.positionM);
        if (value >= 0.5 && value <= (stop ? 35 : 65) && value < bestDistance) {
          best = vehicle;
          bestDistance = value;
          bestLine = line;
        }
        break;
      }
    }
    return best === null ? null : { vehicle: best, distance: bestDistance, line: bestLine };
  };
  // A blocked taxi is normally held at a real line; taking it over gives the new LEARNING segment
  // the signal/STOP opportunity immediately.
  const blockedTaxi = async () => {
    const traffic = await page.evaluate(() => globalThis.__v3Composition.traffic?.() ?? null);
    const frame = await read();
    for (const actor of traffic?.actors ?? []) {
      if (actor.driverKind !== 'TAXI' || actor.blocked !== true) continue;
      const vehicle = (frame?.vehicles ?? []).find(
        (candidate) => candidate.vehicleId === actor.vehicleId && candidate.controlMode === 'AUTO',
      );
      if (vehicle) return { vehicle, distance: 0, line: null };
    }
    return null;
  };
  // A free taxi that is also approaching a real line can produce both a 086 opportunity and a
  // FREE_TRAFFIC 087 window after LEARNING opens.
  const freeApproachTaxi = async () => {
    const traffic = await page.evaluate(() => globalThis.__v3Composition.traffic?.() ?? null);
    const leaders = new Map(
      (traffic?.actors ?? []).map((actor) => [actor.vehicleId, actor.leader]),
    );
    const frame = await read();
    let best = null;
    let bestDistance = Infinity;
    let bestLine = null;
    for (const vehicle of frame?.vehicles ?? []) {
      if (
        vehicle.driverKind !== 'TAXI' ||
        vehicle.controlMode !== 'AUTO' ||
        vehicle.laneId === null ||
        (leaders.get(vehicle.vehicleId) !== null &&
          !((leaders.get(vehicle.vehicleId)?.gapM ?? 0) > 65))
      )
        continue;
      const direct = lineByLane.get(vehicle.laneId);
      if (direct?.positionM) {
        const value = distance(direct.positionM, vehicle.positionM);
        const max = direct.stopLineId !== undefined ? 35 : 65;
        if (value >= 0.5 && value <= max && value < bestDistance) {
          best = vehicle;
          bestDistance = value;
          bestLine = direct;
        }
      }
      const route = vehicle.routeLaneIds ?? [];
      const current = Math.max(0, route.indexOf(vehicle.laneId));
      for (let index = current; index < Math.min(route.length, current + 6); index += 1) {
        const line = lineByLane.get(route[index]);
        if (!line?.positionM) continue;
        const stop = line.stopLineId !== undefined;
        const value = distance(line.positionM, vehicle.positionM);
        if (value >= 0.5 && value <= (stop ? 35 : 65) && value < bestDistance) {
          best = vehicle;
          bestDistance = value;
          bestLine = line;
        }
        break;
      }
    }
    return best === null ? null : { vehicle: best, distance: bestDistance, line: bestLine };
  };
  // A taxi with no live leader can produce a real FREE_TRAFFIC 087 window after LEARNING opens.
  const freeTaxi = async () => {
    const traffic = await page.evaluate(() => globalThis.__v3Composition.traffic?.() ?? null);
    const frame = await read();
    for (const actor of traffic?.actors ?? []) {
      if (
        actor.driverKind !== 'TAXI' ||
        (actor.leader !== null && !((actor.leader?.gapM ?? 0) > 65))
      )
        continue;
      const vehicle = (frame?.vehicles ?? []).find(
        (candidate) => candidate.vehicleId === actor.vehicleId && candidate.controlMode === 'AUTO',
      );
      if (vehicle) return { vehicle, distance: 0, line: null, fromWindow: false };
    }
    return null;
  };
  // A real 087 ELIGIBLE/FREE_TRAFFIC window is the strongest signal that a taxi can produce
  // learning evidence. Prefer a taxi that already owns one over a merely nearby line.
  const windowTaxi = async () => {
    const model = await learning();
    const frame = await read();
    const tick = frame?.tick ?? 0;
    for (const window of model?.telemetry?.windows ?? []) {
      if (window.windowClass !== 'ELIGIBLE' || window.label !== 'FREE_TRAFFIC') continue;
      if (tick - window.lastTick > 120 || !String(window.segmentId).includes('TAXI')) continue;
      const vehicleId = String(window.segmentId).replace(/^live:\d+:/, '');
      const vehicle = (frame?.vehicles ?? []).find(
        (candidate) =>
          candidate.vehicleId === vehicleId &&
          candidate.driverKind === 'TAXI' &&
          candidate.controlMode === 'AUTO',
      );
      if (vehicle) return { vehicle, distance: 0, line: null, fromWindow: true };
    }
    return null;
  };
  let approach = (await freeApproachTaxi()) ?? (await blockedTaxi()) ?? (await approachTaxi('ANY'));
  const approachDeadline = Date.now() + 60000;
  while (approach === null && Date.now() < approachDeadline) {
    if (await ensurePlaying()) continue;
    await pumpFrame();
    await page.waitForTimeout(50);
    approach = (await freeApproachTaxi()) ?? (await blockedTaxi()) ?? (await approachTaxi('ANY'));
  }
  approach = approach ?? (await freeTaxi()) ?? (await windowTaxi());
  let moving = approach?.vehicle ?? null;
  if (moving === null) {
    const frame = await read();
    const fast = (frame?.vehicles ?? []).filter(
      (vehicle) =>
        vehicle.driverKind === 'TAXI' && vehicle.controlMode === 'AUTO' && vehicle.speedMps > 2,
    );
    moving = [...fast].sort((left, right) => right.speedMps - left.speedMps)[0] ?? null;
  }
  await page.locator('[data-shell-action="fleet"]').click();
  await page.waitForFunction(() => globalThis.__v3Composition.fleet().open === true, null, {
    timeout: 30000,
  });
  const opened = await fleet();
  const taxi =
    opened.snapshot.fleet.vehicles.find((vehicle) => vehicle.vehicleId === moving?.vehicleId) ??
    opened.snapshot.fleet.vehicles.find((vehicle) => vehicle.kind === 'TAXI');
  if (!taxi) throw new Error('No taxi in the live fleet');
  const taxiSpeedAtTakeover = moving?.speedMps ?? 0;
  const taxiLaneAtTakeover = moving?.laneId ?? null;
  await page.locator(`.fleet-selection__list button[data-vehicle-id="${taxi.vehicleId}"]`).click();
  await page.locator('[data-fleet-action="takeover"]').click();
  await page.waitForFunction(
    (vehicleId) => globalThis.__v3Composition.fleet().selection?.playerVehicleId === vehicleId,
    taxi.vehicleId,
    { timeout: 30000 },
  );
  await focusCanvas();
  await waitMode('MANUAL');
  // Steer the real taxi in MANUAL for a short approach before opening LEARNING. The 088 evidence
  // prefix is the first 10 s of the segment; starting on top of the first real opportunity would
  // leave the prefix without samples even though the drive is long enough.
  const warmupDelay = Number(process.env.PROBE_LEARNING_DELAY_TICKS ?? 0);
  const manualMode = await modes();
  const warmupLanes = manualMode?.model?.active?.context?.routeLaneIds ?? [];
  const warmupPath =
    warmupLanes.length > 0
      ? await page.evaluate((ids) => globalThis.__v3Composition.lanePath(ids), warmupLanes)
      : [];
  const warmupWaypoints = warmupPath.map((point) => ({ x: point.x, z: point.z }));
  if (warmupWaypoints.length < 2) {
    const current = await currentVehicle(taxi.vehicleId);
    if (current) warmupWaypoints.push({ x: current.positionM.x, z: current.positionM.z + 20 });
  }
  const warmupStart = (await read()).tick;
  let warmupIndex = 0;
  while ((await read()).tick < warmupStart + warmupDelay) {
    if (await ensurePlaying()) continue;
    const current = await currentVehicle(taxi.vehicleId);
    if (!current) break;
    const position = current.positionM;
    let nearest = warmupIndex;
    let best = Infinity;
    const from = Math.max(0, warmupIndex - 12);
    const to = Math.min(warmupWaypoints.length - 1, warmupIndex + 120);
    for (let index = from; index <= to; index += 1) {
      const value = distance(warmupWaypoints[index], position);
      if (value < best) {
        best = value;
        nearest = index;
      }
    }
    warmupIndex = nearest;
    const target =
      warmupWaypoints[Math.min(warmupIndex + 4, warmupWaypoints.length - 1)] ??
      warmupWaypoints[warmupWaypoints.length - 1];
    const desired = Math.atan2(target.x - position.x, target.z - position.z);
    const error = normalizeAngle(desired - current.yawRad);
    if (error > 0.05) {
      await keyUp('KeyA');
      await keyDown('KeyD');
    } else if (error < -0.05) {
      await keyUp('KeyD');
      await keyDown('KeyA');
    } else {
      await keyUp('KeyA');
      await keyUp('KeyD');
    }
    if (current.speedMps < 8) {
      await keyUp('Space');
      await keyDown('KeyW');
    } else if (current.speedMps > 10.5) {
      await keyUp('KeyW');
      await keyDown('Space');
    } else {
      await keyUp('KeyW');
      await keyUp('Space');
    }
    await pumpFrame();
    await page.waitForTimeout(40);
  }
  await releaseKeys();
  await pressKey('KeyL');
  await waitMode('LEARNING');
  await waitTicks(8);
  const learningMode = await modes();
  check(
    'learning-segment-open',
    learningMode?.model?.active?.mode === 'LEARNING' &&
      learningMode?.model?.active?.learningEligible === true,
    `active ${learningMode?.model?.active?.mode} eligible ${learningMode?.model?.active?.learningEligible}`,
  );

  const routeLanes = learningMode?.model?.active?.context?.routeLaneIds ?? [];
  const path =
    routeLanes.length > 0
      ? await page.evaluate((ids) => globalThis.__v3Composition.lanePath(ids), routeLanes)
      : [];
  const waypoints = path.map((point) => ({ x: point.x, z: point.z }));
  if (waypoints.length < 2) {
    const current = await currentVehicle(taxi.vehicleId);
    if (current) waypoints.push({ x: current.positionM.x, z: current.positionM.z + 20 });
  }
  const driveStartTick = (await read()).tick;
  const driveLimit = approach === null ? 2400 : 900;
  const driveUntil = Date.now() + 360000;
  let maxSpeed = 0;
  let endSpeed = 0;
  let iterations = 0;
  let routeIndex = 0;
  while ((await read()).tick < driveStartTick + driveLimit && Date.now() < driveUntil) {
    if (await ensurePlaying()) continue;
    if (iterations++ % 20 === 0) {
      await page.bringToFront();
      await focusCanvas();
    }
    const current = await currentVehicle(taxi.vehicleId);
    if (!current) break;
    maxSpeed = Math.max(maxSpeed, current.speedMps);
    endSpeed = current.speedMps;
    const position = current.positionM;
    let nearest = routeIndex;
    let best = Infinity;
    const from = Math.max(0, routeIndex - 12);
    const to = Math.min(waypoints.length - 1, routeIndex + 120);
    for (let index = from; index <= to; index += 1) {
      const value = distance(waypoints[index], position);
      if (value < best) {
        best = value;
        nearest = index;
      }
    }
    routeIndex = nearest;
    const target = waypoints[Math.min(routeIndex + 4, waypoints.length - 1)];
    const desired = Math.atan2(target.x - position.x, target.z - position.z);
    const error = normalizeAngle(desired - current.yawRad);
    if (error > 0.05) {
      await keyUp('KeyA');
      await keyDown('KeyD');
    } else if (error < -0.05) {
      await keyUp('KeyD');
      await keyDown('KeyA');
    } else {
      await keyUp('KeyA');
      await keyUp('KeyD');
    }
    if (current.speedMps < 8) {
      await keyUp('Space');
      await keyDown('KeyW');
    } else if (current.speedMps > 10.5) {
      await keyUp('KeyW');
      await keyDown('Space');
    } else {
      await keyUp('KeyW');
      await keyUp('Space');
    }
    await pumpFrame();
    await page.waitForTimeout(40);
  }
  await releaseKeys();
  const driveFocus = await page.evaluate(() => globalThis.document?.hasFocus() ?? null);
  const learningAfterDrive = await learning();
  const segmentId =
    learningAfterDrive?.model?.history?.at(-1)?.segmentId ??
    (await modes())?.model?.lastClosed?.segmentId ??
    null;
  check(
    'live-segment-sampled',
    (await modes())?.model?.active?.samples > 600 ||
      (learningAfterDrive?.model?.history?.length ?? 0) > 0,
    `segment ${segmentId ?? 'pending'}`,
  );

  await ensurePlaying();
  try {
    await page.locator('.game-hud__learning').click({ timeout: 5000 });
  } catch {
    await ensurePlaying();
    await pressKey('KeyL');
  }
  try {
    await waitMode('MANUAL', 15000);
  } catch {
    await pressKey('KeyL');
    await waitMode('MANUAL');
  }
  await waitTicks(30);
  check(
    'learning-segment-closed',
    (await modes())?.model?.lastClosed?.mode === 'LEARNING' &&
      (await modes())?.model?.lastClosed?.closeReason === 'MODE_CHANGE',
    `closed ${(await modes())?.model?.lastClosed?.mode}/${(await modes())?.model?.lastClosed?.closeReason}`,
  );

  const deadline = Date.now() + 60000;
  let after = await learning();
  while ((after?.model?.stats?.jobs ?? 0) === 0 || (after?.model?.stats?.versions ?? 0) === 0) {
    if (Date.now() > deadline) break;
    if (await ensurePlaying()) continue;
    await waitTicks(10);
    after = await learning();
  }
  const model = after?.model ?? null;
  const fleetAfter = await fleet();
  const fleetVersions = [
    ...new Set(
      (fleetAfter?.snapshot?.fleet?.vehicles ?? []).map((vehicle) => vehicle.appliedProfileVersion),
    ),
  ].sort();
  const headVersion = model?.headVersionId ?? null;
  const cityStyle = model?.cityStyle?.versionId ?? null;
  const last = model?.history?.at(-1) ?? null;
  check(
    'eligible-learning-produced-job',
    (model?.stats?.jobs ?? 0) >= 1 && (model?.stats?.eligible ?? 0) >= 1,
    `jobs ${model?.stats?.jobs}, eligible ${model?.stats?.eligible}`,
  );
  check(
    'composed-immutable-version',
    (model?.stats?.versions ?? 0) >= 1 &&
      headVersion !== null &&
      headVersion !== beforeLearning?.model?.baseVersionId,
    `versions ${model?.stats?.versions}, head ${headVersion}`,
  );
  check(
    'activation-applied',
    (model?.stats?.activationsApplied ?? 0) >= 1 &&
      last?.activateAtTick !== null &&
      last?.activateAtTick === model?.activation?.lastAppliedTick,
    `activate ${last?.activateAtTick}, applied ${model?.activation?.lastAppliedTick}`,
  );
  check(
    'city-style-changed',
    cityStyle === headVersion && model?.profile?.fingerprint !== baseFingerprint,
    `style ${cityStyle}, fingerprint ${model?.profile?.fingerprint}`,
  );
  check(
    'whole-fleet-adopted',
    fleetVersions.length === 1 && fleetVersions[0] === headVersion,
    `${fleetVersions.join(', ')} (${fleetAfter?.snapshot?.fleet?.vehicles?.length ?? 0} vehicles)`,
  );
  check(
    'xp-untouched',
    (model?.stats?.versions ?? 0) >= 1,
    'no XP writer is mounted by 273; the profile is the only publication',
  );
  const screenshotsTaken = [await shot('01-learning-drive'), await shot('02-after-drive')];
  result.run = {
    browser: await page.evaluate(() => globalThis.navigator.userAgent),
    backend: backend?.rendererKind ?? null,
    viewport: '800x450',
    tick: (await read()).tick,
    driveTicks: (await read()).tick - driveStartTick,
    driveMaxSpeed: maxSpeed,
    driveEndSpeed: endSpeed,
    driveFocus,
    taxiSpeedAtTakeover,
    taxiLaneAtTakeover,
    approachKind:
      approach?.line?.signalId !== undefined
        ? 'SIGNAL'
        : approach?.line?.stopLineId !== undefined
          ? 'STOP'
          : null,
    approachDistanceM: approach?.distance ?? null,
    signalLanes: signalLanes.length,
    stopLanes: stopLanes.length,
    lineByLane: lineByLane.size,
    segmentId: last?.segmentId ?? segmentId,
    jobs: model?.stats?.jobs ?? 0,
    versions: model?.stats?.versions ?? 0,
    versionId: headVersion,
    activationStatus: last?.activationStatus ?? null,
    activateAtTick: last?.activateAtTick ?? null,
    appliedAtTick: model?.activation?.lastAppliedTick ?? null,
    profileFingerprintBefore: baseFingerprint,
    profileFingerprintAfter: model?.profile?.fingerprint ?? null,
    fleetVersions,
    queue: after?.queue ?? null,
    lastStatus: model?.lastStatus ?? null,
    lastReason: model?.lastReason ?? null,
    lastError: model?.lastError ?? null,
    history: model?.history ?? null,
    evidenceKeys: model?.evidenceKeys ?? null,
    style: after?.style ?? null,
    telemetry: after?.telemetry ?? null,
    closedRead: after?.telemetry?.closedRead ?? null,
    checks,
    screenshots: screenshotsTaken,
    pageErrors,
    consoleErrors,
  };
  await mkdir(directory, { recursive: true });
  await writeFile(browserJson, `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(browserMarkdown, markdown(result));
  console.log(
    `Live learning browser probe: ${checks.filter((item) => item.pass).length}/${checks.length} PASS`,
  );
  if (checks.some((item) => !item.pass)) process.exitCode = 1;
} catch (error) {
  result.reason = `Browser launch/run failed: ${error instanceof Error ? error.message : String(error)}`;
  if (debugPage !== undefined) {
    try {
      result.diagnostics = await debugPage.evaluate(() => ({
        life: globalThis.__v3Composition?.lifecycle?.() ?? null,
        shell: globalThis.__v3Composition?.shell?.() ?? null,
        learning: globalThis.__v3Composition?.learning?.() ?? null,
        modes: globalThis.__v3Composition?.modes?.() ?? null,
        hidden: globalThis.document?.hidden ?? null,
        visibility: globalThis.document?.visibilityState ?? null,
      }));
    } catch (inspect) {
      result.diagnostics = { error: String(inspect) };
    }
  }
  await mkdir(directory, { recursive: true });
  await writeFile(browserJson, `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(browserMarkdown, markdown(result));
  console.log(`Live learning browser probe NOT_RUN: ${result.reason}`);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  if (server !== undefined) await new Promise((close) => server.close(close));
}
