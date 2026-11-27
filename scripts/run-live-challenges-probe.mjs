import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 277 browser probe.
 *
 * It starts the real build, suppresses automatic offers, takes over a real unassigned taxi, asks the
 * live host for a deterministic parking challenge, accepts it through the native Challenges panel,
 * drives the taxi along the real 041 lane path to the objective zone, stops inside the mapped zone
 * and waits for the real 232/233 evaluation to complete. It then checks the single ledger credit,
 * the personal record, the disabled retry and a real tab reload. The destruction template is
 * requested explicitly and must be refused before display with the exact missing capability.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '277-live-challenges'),
  browserJson = join(directory, 'browser.json'),
  reportMarkdown = join(directory, 'browser.md'),
  screenshots = join(directory, 'screenshots'),
  buildDirectory = join(root, '.pbi-validation-277', 'build');

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
    return `# 277 — proba de browser a provocărilor live

Generată de \`npm run challenges:live:probe\`.

**${result.status}** — ${result.reason}

Nu este raportat niciun PASS simulat. Raportul determinist acoperă contractele 231/232/233.
`;
  }
  const run = result.run;
  const checks = run.checks
    .map((entry) => `- \`${entry.name}\`: ${entry.pass ? 'PASS' : 'FAIL'} — ${entry.detail}`)
    .join('\n');
  return `# 277 — proba de browser a provocărilor live

Generată de \`npm run challenges:live:probe\`; Chromium ${run.browser}, backend ${run.backend?.rendererKind ?? 'unknown'},
viewport ${run.viewport}, tick ${run.tickAtStart}–${run.tickAtEnd}.

Secvența reală: start → tutorial sărit → taxi real preluat → ofertă de precizie (checkpointuri)
cerută prin host → Acceptă din panoul nativ → condus pe traseul 041 prin checkpointurile 032 →
verdict 231 → credit 213 o singură dată → record 233 → „Mai încearcă” dezactivat → cerere de
demolare refuzată înainte de afișare → reload cu același record și același XP.

- Taxi: \`${run.taxiId}\`; ofertă: \`${run.offerId}\` (\`${run.templateId}\`), zonă
  \`${run.objectiveZoneId}\`, seed ${run.seed}.
- Acceptare: ${run.accepted}; deadline ${run.deadlineTick}; finalizare la tick ${run.completedTick}.
- Rezultat: ${run.lastStatus}; XP ${run.xpAfter}; intrări ledger ${run.ledgerEntries};
  intrări de recompensă provocare ${run.challengeRewardEntries ?? 0} (${run.challengeCreditedXp ?? 0} XP);
  comparație ${run.comparison}; recorduri ${run.records}; cooldown rămas ${run.cooldownRemaining}.
- Panou: acțiuni ofertă ${run.panelOfferActions.join(', ')}; acțiuni rezultat
  ${run.panelResultActions.join(', ')}; XP afișat „${run.panelXp}”; recorduri ${run.panelRecords}.
- Reluare: \`${run.retryCode}\`; ledger după reluare ${run.entriesAfterRetry} (fără dublare).
- Demolare: ${run.destructionCode} — ${run.destructionDetail.join(', ')}.
- Reload: restaurat ${run.reloadRestored}; XP ${run.reloadXp}; intrări ${run.reloadEntries};
  recorduri ${run.reloadRecords}.

Capturi: ${run.screenshots.map((file) => `[${file}](${file})`).join(', ')}.

${checks}

Limite: proba conduce cu input real și poziția autoritară a compunerii, dar nu înlocuiește un
playtest uman și nu măsoară FPS/GPU. Persistarea probei este sessionStorage; fișierul durabil rămâne
278. Demolarea nu este simulată: refuzul este dovada că 285 nu este montat.
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
    version: '277-live-challenges-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason:
      'Playwright is not installed in this checkout (no `playwright` module and no PLAYWRIGHT_MODULE); the browser probe was not run.',
    run: null,
  });
  console.log('Live challenge browser probe NOT_RUN: Playwright is not installed.');
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
    version: '277-live-challenges-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason: `Browser launch failed: ${launchError instanceof Error ? launchError.message : String(launchError)}`,
    run: null,
  });
  server.close();
  console.log('Live challenge browser probe NOT_RUN: browser launch failed.');
  process.exit(0);
}

function distance(left, right) {
  const dx = left.x - right.x,
    dz = left.z - right.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function normalizeAngle(value) {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
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
  const challenges = () => page.evaluate(() => globalThis.__v3Composition.challenges());
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
        const challengeState = await challenges();
        throw new Error(
          `Timeout waiting for ${label}: lifecycle ${lifecycle?.kind}/${lifecycle?.reason ?? 'none'}, shell ${shellState?.paused}/${shellState?.cause ?? 'none'} tick ${shellState?.tick}, challenge ${challengeState?.read?.lastResult?.status ?? 'none'} tick ${challengeState?.read?.tick}, errors ${pageErrors.slice(-2).join(' | ')}`,
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
  const drivePath = async (taxiId, points, anchor, label) => {
    const raw = (Array.isArray(points) ? points : []).map((point) => ({
      x: point.x,
      z: point.z,
    }));
    if (raw.length === 0) {
      const start = await vehicle(taxiId);
      if (start !== null) raw.push({ x: start.positionM.x, z: start.positionM.z });
    }
    if (raw.length === 0) throw new Error(`Empty route for ${label}`);
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
    const deadline = Date.now() + 300000;
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
      lastLogAt = 0,
      stuckRecoveries = 0;
    for (;;) {
      if (Date.now() > deadline) throw new Error(`Drive timeout for ${label}`);
      await resumeOverload();
      current = await vehicle(taxiId);
      if (current === null) {
        await page.waitForTimeout(150);
        continue;
      }
      const position = current.positionM,
        targetDistance = distance(position, anchor);
      if (Date.now() - lastLogAt > 2000) {
        lastLogAt = Date.now();
        console.log(
          'drive ' +
            label +
            ': pos ' +
            position.x.toFixed(1) +
            ',' +
            position.z.toFixed(1) +
            ' speed ' +
            current.speedMps.toFixed(1) +
            ' wp ' +
            routeIndex +
            '/' +
            waypoints.length +
            ' dist ' +
            targetDistance.toFixed(1),
        );
      }
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
      const target = waypoints[Math.min(routeIndex + 2, waypoints.length - 1)],
        desired = Math.atan2(target.x - position.x, target.z - position.z),
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
        const desiredSpeed = targetDistance > 30 ? 5.5 : Math.max(1.1, targetDistance * 0.5);
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
        if (stuckRecoveries >= 2) throw new Error(`Taxi stuck during ${label}`);
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
  await page.evaluate(() => globalThis.__v3Composition.challengeSuppressAuto(true));
  await focusCanvas();
  const tickAtStart = (await shell()).tick;

  const skip = page.getByRole('button', { name: 'Sari peste tutorial' });
  if ((await skip.count()) > 0) await skip.click().catch(() => {});
  await waitUntil(
    () => globalThis.__v3Composition.missions()?.tutorialInstance?.state === 'COMPLETED',
    null,
    60000,
    'tutorial completed',
  );
  await focusCanvas();

  await waitUntil(
    () => {
      const state = globalThis.__v3Composition.rides();
      const frame = globalThis.__v3Composition.read();
      if (state?.snapshot?.counts?.requests === 0 || !Array.isArray(frame?.vehicles)) return false;
      const assigned = new Set((state.snapshot.assignments ?? []).map((entry) => entry.taxiId));
      return frame.vehicles.some(
        (entry) =>
          entry.driverKind === 'TAXI' && entry.laneId !== null && !assigned.has(entry.vehicleId),
      );
    },
    null,
    180000,
    'an unassigned taxi',
  );
  const frameAtStart = await read();
  const rideState = await rides();
  const assigned = new Set((rideState.snapshot.assignments ?? []).map((entry) => entry.taxiId));
  const taxiCandidates = frameAtStart.vehicles.filter(
    (entry) =>
      entry.driverKind === 'TAXI' && entry.laneId !== null && !assigned.has(entry.vehicleId),
  );
  console.log(
    'free taxi candidates',
    taxiCandidates.map((entry) => ({
      id: entry.vehicleId,
      lane: entry.laneId,
      x: entry.positionM.x.toFixed(1),
      z: entry.positionM.z.toFixed(1),
    })),
  );
  const zones = (await challenges()).zones;
  const firstCheckpoint = zones.find((entry) => entry.zoneId === 'sz:0-2');
  if (firstCheckpoint === undefined) throw new Error('Missing checkpoint sz:0-2');
  let checkpointSeed = null;
  let checkpointPreview = null;
  for (const seed of Array.from({ length: 240 }, (_, index) => 277 + index)) {
    const preview = await page.evaluate(
      (value) =>
        globalThis.__v3Composition.challengePreview('challenge-influencer-single-frame', value),
      seed,
    );
    if (preview === null || preview.objectiveKind !== 'CHECKPOINTS') continue;
    const ids = preview.zoneIds;
    if (preview.target === 2 && ids.length >= 3 && ids[0] === 'sz:0-2' && ids[1] === 'sz:0-3') {
      checkpointSeed = seed;
      checkpointPreview = preview;
      break;
    }
  }
  if (checkpointSeed === null || checkpointPreview === null)
    throw new Error('No north-line checkpoint seed');
  let bestPlan = null;
  for (const candidate of taxiCandidates) {
    const meters = distance(candidate.positionM, firstCheckpoint.anchorM);
    if (bestPlan === null || meters < bestPlan.meters) bestPlan = { taxi: candidate, meters };
  }
  const taxi = bestPlan?.taxi ?? taxiCandidates[0];
  if (taxi === undefined) throw new Error('No unassigned taxi');
  const taxiId = taxi.vehicleId;
  const usedSeed = checkpointSeed;
  console.log(
    `chosen taxi ${taxiId} seed ${usedSeed} checkpoints ${checkpointPreview.zoneIds.join(',')} distance ${bestPlan?.meters.toFixed(1) ?? 'none'}`,
  );
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

  const destruction = await page.evaluate(() =>
    globalThis.__v3Composition.challengeOffer('challenge-influencer-demolition'),
  );
  const destructionRead = await challenges();
  const demolitionReasons =
    destructionRead.read.unavailableTemplates.find(
      (entry) => entry.templateId === 'challenge-influencer-demolition',
    )?.reasons ?? [];
  check(
    'destruction-refused-before-display',
    destruction === null &&
      destructionRead.read.offer === null &&
      destructionRead.read.lastOfferRefusal?.code === 'NO_ELIGIBLE_TEMPLATE' &&
      destructionRead.read.lastOfferRefusal.detail.includes('CAPABILITY:DESTRUCTIBLE_DECOR') &&
      demolitionReasons.includes('CAPABILITY:DESTRUCTIBLE_DECOR'),
    `${destructionRead.read.lastOfferRefusal?.code ?? 'none'} — ${destructionRead.read.lastOfferRefusal?.detail?.join(', ') ?? 'none'}; unavailable ${demolitionReasons.join(', ')}`,
  );

  let offer = await page.evaluate(
    (value) =>
      globalThis.__v3Composition.challengeOffer('challenge-influencer-single-frame', value),
    usedSeed,
  );
  const afterOffer = await challenges();
  check(
    'offer-visible-through-host',
    offer !== null &&
      afterOffer.read.offer?.templateId === 'challenge-influencer-single-frame' &&
      afterOffer.read.offer?.objectiveKind === 'CHECKPOINTS',
    `offer ${offer?.instanceId ?? 'none'}, refusal ${afterOffer.read.lastOfferRefusal?.code ?? 'none'}: ${afterOffer.read.lastOfferRefusal?.detail?.join(',') ?? ''}`,
  );
  if (offer === null) throw new Error('No checkpoint offer could be generated');

  await page.locator('[data-shell-action="challenges"]').click();
  await waitUntil(
    () => globalThis.__v3Composition.challenges().panelOpen === true,
    null,
    30000,
    'challenge panel open',
  );
  const offerPanel = await challenges();
  check(
    'panel-shows-offer',
    offerPanel.panelView?.offer?.templateId === 'challenge-influencer-single-frame' &&
      offerPanel.panelView?.offer?.objectiveLabel.includes('CHECKPOINTS') &&
      offerPanel.panelView?.offer?.premise?.length > 0 &&
      offerPanel.panelView.actions.some((entry) => entry.action === 'ACCEPT'),
    `${offerPanel.panelView?.offer?.objectiveLabel ?? 'none'}`,
  );
  screenshotsTaken.push(await shot('01-offer'));
  await page.locator('.challenge-panel__action[data-action="ACCEPT"]').click();
  await waitUntil(
    () => globalThis.__v3Composition.challenges().read.active !== null,
    null,
    30000,
    'accepted and active',
  );
  const active = (await challenges()).read.active;
  const finalIndex = Math.max(0, (active?.target ?? 1) - 1);
  const zoneId = active.zoneIds[finalIndex];
  const zone = (await challenges()).zones.find((entry) => entry.zoneId === zoneId);
  if (zone === undefined) throw new Error(`Missing live zone ${zoneId}`);
  const route = await page.evaluate((id) => globalThis.__v3Composition.challengeRoute(id), zoneId);
  check(
    'active-deadline-and-zone',
    active !== null && active.target >= 2 && active.deadlineTick > active.remainingTicks,
    `zone ${zoneId}, target ${active?.target ?? 'none'}, route ${route.length} points, remaining ${active?.remainingTicks ?? 'none'}`,
  );
  await page.locator('.challenge-panel__close').click();
  await waitUntil(
    () => globalThis.__v3Composition.challenges().panelOpen === false,
    null,
    30000,
    'challenge panel closed',
  );
  await focusCanvas();
  screenshotsTaken.push(await shot('02-active'));

  const deadline = Date.now() + 240000;
  let driveFailure = null;
  const currentVehicle = await vehicle(taxiId);
  const alreadyInZone =
    currentVehicle !== null && distance(currentVehicle.positionM, zone.anchorM) < 7;
  try {
    if (alreadyInZone) {
      await releaseKeys();
      await keyDown('Space');
      await page.waitForTimeout(3000);
      await keyUp('Space');
    } else {
      await drivePath(taxiId, route, zone.anchorM, 'checkpoint zone');
      await keyDown('Space');
      await page.waitForTimeout(2500);
      await keyUp('Space');
    }
  } catch (error) {
    driveFailure = error instanceof Error ? error.message : String(error);
  }
  if (driveFailure !== null) {
    console.log('drive failure', driveFailure, 'anchor', JSON.stringify(zone.anchorM));
    screenshotsTaken.push(await shot('03-drive-stuck'));
    check('drive-to-zone', false, driveFailure);
  } else {
    check(
      'drive-to-zone',
      true,
      alreadyInZone ? `already inside ${zoneId}; stopped and held` : `stopped inside ${zoneId}`,
    );
  }
  await waitUntil(
    () => {
      const status = globalThis.__v3Composition.challenges().read.lastResult?.status;
      return status === 'COMPLETED' || status === 'FAILED';
    },
    null,
    Math.max(1000, deadline - Date.now()),
    'challenge result',
  );
  const afterChallenge = await challenges();
  const lastResult = afterChallenge.read.lastResult;
  check(
    'precision-challenge-completed',
    lastResult?.status === 'COMPLETED' &&
      lastResult.progress >= lastResult.target &&
      lastResult.creditedXp === 90 &&
      afterChallenge.read.challengeRewardEntries === 1 &&
      afterChallenge.read.challengeCreditedXp === 90,
    `${lastResult?.status ?? 'none'} ${String(lastResult?.progress)}/${String(lastResult?.target)}, xp ${afterChallenge.read.xpBalance}, challenge entries ${afterChallenge.read.challengeRewardEntries}`,
  );
  check(
    'first-record-and-cooldown',
    lastResult?.recordComparison === 'FIRST_RECORD' &&
      afterChallenge.read.cooldownRemainingTicks > 0,
    `${lastResult?.recordComparison ?? 'none'}, cooldown ${afterChallenge.read.cooldownRemainingTicks}`,
  );
  const retry =
    lastResult?.status === 'COMPLETED'
      ? await page.evaluate(() => globalThis.__v3Composition.challengeRetry())
      : null;
  const afterRetry = await challenges();
  check(
    'retry-refused-after-success',
    retry?.code === 'NOT_FAILED' && afterRetry.read.challengeRewardEntries === 1,
    `${retry?.code ?? 'none'}, challenge entries ${afterRetry.read.challengeRewardEntries}`,
  );

  await page.locator('[data-shell-action="challenges"]').click();
  await waitUntil(
    () => globalThis.__v3Composition.challenges().panelOpen === true,
    null,
    30000,
    'result panel open',
  );
  const resultPanel = await challenges();
  const resultView = resultPanel.panelView;
  check(
    'panel-shows-result-record-actions',
    resultView?.result?.status === 'COMPLETED' &&
      resultView.records.length === 1 &&
      resultView.result.xpLabel.includes('90 XP') &&
      resultView.actions.find((entry) => entry.action === 'RETRY')?.enabled === false &&
      resultView.actions.some((entry) => entry.action === 'CONTINUE'),
    `${resultView?.result?.xpLabel ?? 'none'}, records ${String(resultView?.records.length)}`,
  );
  screenshotsTaken.push(await shot('03-result'));
  await page.locator('.challenge-panel__close').click();
  await waitUntil(
    () => globalThis.__v3Composition.challenges().panelOpen === false,
    null,
    30000,
    'challenge panel closed after result',
  );
  await focusCanvas();

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => globalThis.__v3Composition?.ready() === true, null, {
    timeout: 180000,
  });
  await page.waitForFunction(
    () => globalThis.document?.querySelector('.game-shell')?.getAttribute('data-state') === 'READY',
    null,
    { timeout: 180000 },
  );
  const startAgain =
    (await page.getByRole('button', { name: 'Joacă' }).count()) > 0
      ? page.getByRole('button', { name: 'Joacă' })
      : page.getByRole('button', { name: 'Pornește' });
  await startAgain.click();
  await focusCanvas();
  await waitUntil(
    () => globalThis.__v3Composition.challenges().read.restored === true,
    null,
    60000,
    'challenge checkpoint restore',
  );
  const reloaded = await challenges();
  check(
    'reload-keeps-record-and-reward',
    reloaded.read.records === 1 &&
      reloaded.read.challengeRewardEntries === 1 &&
      reloaded.read.challengeCreditedXp === 90 &&
      reloaded.read.lastResult?.status === 'COMPLETED' &&
      reloaded.read.lastResult?.creditedXp === 90,
    `restored ${reloaded.read.restored}, records ${reloaded.read.records}, challenge entries ${reloaded.read.challengeRewardEntries}, reward ${reloaded.read.challengeCreditedXp} XP`,
  );
  await page.locator('[data-shell-action="challenges"]').click();
  await waitUntil(
    () => globalThis.__v3Composition.challenges().panelOpen === true,
    null,
    30000,
    'reloaded challenge panel open',
  );
  screenshotsTaken.push(await shot('04-reload'));
  const shellEnd = await shell();
  const tickAtEnd = shellEnd.tick;

  const failed = checks.filter((entry) => !entry.pass);
  result = {
    version: '277-live-challenges-browser-v1',
    generatedAt,
    status: failed.length === 0 ? 'PASS' : 'FAIL',
    reason:
      failed.length === 0
        ? 'The real precision checkpoint challenge completed once, the record survived a reload and destruction was refused before display.'
        : failed.map((entry) => `${entry.name}: ${entry.detail}`).join(' | '),
    run: {
      browser: await browser.version(),
      backend,
      viewport: '1024x640',
      tickAtStart,
      tickAtEnd,
      taxiId,
      seed: usedSeed,
      offerId: offer.instanceId,
      templateId: offer.templateId,
      objectiveZoneId: zoneId,
      routePoints: route.length,
      accepted: afterChallenge.read.active === null ? 'ACTIVE' : 'ACCEPTED',
      deadlineTick: active.deadlineTick,
      completedTick: lastResult?.endedAtTick ?? null,
      lastStatus: lastResult?.status ?? null,
      xpAfter: afterChallenge.read.xpBalance,
      ledgerEntries: afterChallenge.read.ledgerEntries,
      challengeRewardEntries: afterChallenge.read.challengeRewardEntries,
      challengeCreditedXp: afterChallenge.read.challengeCreditedXp,
      comparison: lastResult?.recordComparison ?? null,
      records: afterChallenge.read.records,
      cooldownRemaining: afterChallenge.read.cooldownRemainingTicks,
      panelOfferActions: offerPanel.panelView?.actions.map((entry) => entry.action) ?? [],
      panelResultActions: resultView?.actions.map((entry) => entry.action) ?? [],
      panelXp: resultView?.result?.xpLabel ?? '',
      panelRecords: resultView?.records.length ?? 0,
      retryCode: retry?.code ?? null,
      entriesAfterRetry: afterRetry.read.ledgerEntries,
      destructionCode: destructionRead.read.lastOfferRefusal?.code ?? null,
      destructionDetail: destructionRead.read.lastOfferRefusal?.detail ?? [],
      destructionReasons: demolitionReasons,
      reloadRestored: reloaded.read.restored,
      reloadXp: reloaded.read.xpBalance,
      reloadEntries: reloaded.read.ledgerEntries,
      reloadRecords: reloaded.read.records,
      pageErrors,
      consoleErrors,
      checks,
      screenshots: screenshotsTaken,
    },
  };
} catch (error) {
  result = {
    version: '277-live-challenges-browser-v1',
    generatedAt,
    status: 'FAIL',
    reason: error instanceof Error ? error.message : String(error),
    run: null,
  };
} finally {
  if (debugPage !== null) await debugPage.close().catch(() => {});
  await browser.close();
  server.close();
}
await writeResult(result);
if (result.status !== 'PASS') process.exitCode = 1;
