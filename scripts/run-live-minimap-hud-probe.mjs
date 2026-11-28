import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 281 browser probe.
 *
 * Runs the production build in Chrome, starts the live Academy session, reads the real minimap,
 * clicks a fleet marker (camera only), checks the complete HUD, injects one real 065
 * COLLISION_DAMAGE fact through the probe port, measures the 10 Hz ceiling and captures the three
 * required breakpoints. Without Playwright the result is NOT_RUN, never a fake PASS.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '281-minimap-hud'),
  browserJson = join(directory, 'browser.json'),
  reportMarkdown = join(directory, 'browser.md'),
  screenshots = join(directory, 'screenshots'),
  buildDirectory = join(root, '.pbi-validation-281', 'build');

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
  const run = result.run;
  if (!run) {
    return `# 281 — proba de browser a minimapei și HUD-ului

Generată de \`npm run minimap:hud:probe\` pe ${result.generatedAt}.

**NOT_RUN** — ${result.reason}

Nu este raportat niciun PASS simulat. Contractul determinist este acoperit de
\`npm run minimap:hud\` și de teste.
`;
  }
  const checks = run.checks
      .map((entry) => `- \`${entry.name}\`: ${entry.pass ? 'PASS' : 'FAIL'} — ${entry.detail}`)
      .join('\n'),
    shots = run.screenshots.map((file) => `[${file}](${file})`).join(', '),
    measures = run.measures;
  return `# 281 — proba de browser a minimapei și HUD-ului

Generată de \`npm run minimap:hud:probe\` pe ${result.generatedAt}; Chromium ${run.browser},
backend ${run.actualBackend}, viewport ${run.viewport}.

Secvența reală: start → minimapa live cu rută 064 → click pe marker (doar camera) → HUD complet →
fapt 065 \`COLLISION_DAMAGE\` injectat prin portul de probă → măsurătoare 5–10 Hz → capturi la
1280×720, 1920×1080 și zoom 150% (~853×480 efectiv).

## Măsurători

| Măsurătoare | Valoare |
| --- | ---: |
| Marker vehicule | ${measures.markers} (${measures.taxis} taxi / ${measures.civilians} civil) |
| Markeri pickup/dropoff | ${measures.pickupMarkers} / ${measures.dropoffMarkers} |
| Benzi de rută | ${measures.routeLanes} |
| Incidente (probe 065) | ${measures.incidents} |
| Actualizări hartă | ${measures.mapUpdates} (${measures.mapHz.toFixed(2)} Hz) |
| Actualizări HUD | ${measures.hudUpdates} (${measures.hudHz.toFixed(2)} Hz) |
| Scrieri selecție | ${measures.selectionUpdates} |
| Scrieri incidente | ${measures.incidentUpdates} |
| Ascultători globali | ${measures.globalListeners} |
| Suprapuneri 1280×720 / 1920×1080 / zoom | ${measures.overlaps.join(' / ')} |

Capturi: ${shots}.

## Verificări

${checks}

## Limitări

${result.limitations.map((entry) => `- ${entry}`).join('\n')}
`;
}

const limitations = [
  'Proba este locală și provizorie; nu măsoară FPS, GPU sau hardware și nu înlocuiește un playtest uman.',
  'Incidentul din captură este un fapt 065 real injectat prin portul de probă; buildul nu are încă un producător 028/029 live, deci fără probă pot exista zero incidente.',
  'Breakpoint-ul „zoom 150%” este emulat prin viewport-ul CSS efectiv ~853×480, exact aritmetica media query-urilor documentată de 084.',
];

const playwright = await loadPlaywright();
await mkdir(directory, { recursive: true });
const generatedAt = new Date().toISOString();

if (playwright === null) {
  const result = {
    version: '281-minimap-hud-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason:
      'Playwright is not installed (no `playwright` module and no PLAYWRIGHT_MODULE); the browser probe was not run.',
    run: null,
    limitations,
  };
  await writeFile(browserJson, `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(reportMarkdown, markdown(result));
  console.log('Minimap/HUD browser probe NOT_RUN: Playwright is not installed.');
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
let browser;
try {
  browser = await chromium.launch({
    // Headed Chrome avoids the fixed-tick overload pause seen under headless SwiftShader.
    headless: process.env.PLAYWRIGHT_HEADLESS === '1',
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
    args: [
      '--disable-frame-rate-limit',
      '--enable-unsafe-swiftshader',
      '--disable-gpu-sandbox',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion',
    ],
  });
} catch (error) {
  const result = {
    version: '281-minimap-hud-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason: `Browser launch failed: ${error instanceof Error ? error.message : String(error)}`,
    run: null,
    limitations,
  };
  await writeFile(browserJson, `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(reportMarkdown, markdown(result));
  server.close();
  console.log('Minimap/HUD browser probe NOT_RUN: browser launch failed.');
  process.exit(0);
}

try {
  await mkdir(screenshots, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.bringToFront();
  const url = `${origin}/?capture=1&backend=WEBGL2&preset=MEDIUM&models=procedural&time=noon&nofocuspause`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => globalThis.__v3Composition?.ready() === true, null, {
    timeout: 180000,
  });
  const backend = await page.evaluate(() => globalThis.__v3Composition.backend());
  const actualBackend = backend?.rendererKind ?? null;
  const read = () => page.evaluate(() => globalThis.__v3Composition.read());
  const minimap = () => page.evaluate(() => globalThis.__v3Composition.minimap());
  const fleet = () => page.evaluate(() => globalThis.__v3Composition.fleet());
  const focusCanvas = async () => {
    await page.bringToFront();
    await page.evaluate(() => {
      globalThis.focus();
      const canvas = globalThis.document?.querySelector('canvas.game-canvas');
      if (canvas instanceof globalThis.HTMLCanvasElement) canvas.focus();
    });
    await page.waitForTimeout(50);
  };
  const lifecycle = () => page.evaluate(() => globalThis.__v3Composition.lifecycle());
  const pumpFrame = () =>
    page.evaluate(
      () =>
        new Promise((resolveFrame) => globalThis.requestAnimationFrame(() => resolveFrame(true))),
    );
  const ensurePlaying = async () => {
    const state = await lifecycle();
    if (state?.kind !== 'PAUSED') return false;
    const clicked = await page.evaluate(() => {
      const resume = globalThis.document?.querySelector('[data-shell-action="resume"]');
      if (!(resume instanceof globalThis.HTMLButtonElement) || resume.hidden) return false;
      resume.click();
      return true;
    });
    if (clicked) {
      await page.waitForTimeout(150);
      await focusCanvas();
    }
    return clicked;
  };
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
  const waitTicks = async (count) => {
    const start = (await read()).tick;
    const deadline = Date.now() + 180000;
    while ((await read()).tick < start + count) {
      if (Date.now() > deadline) throw new Error(`Tick timeout after ${start} + ${count}`);
      if (await ensurePlaying()) continue;
      await pumpFrame();
      await page.waitForTimeout(20);
    }
  };
  const shot = async (name) => {
    const relative = `screenshots/${name}.png`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      for (let wait = 0; wait < 20; wait += 1) {
        const state = await lifecycle();
        if (state?.kind === 'PLAYING') break;
        await ensurePlaying();
        await page.waitForTimeout(100);
      }
      await pumpFrame();
      await pumpFrame();
      await page.screenshot({ path: join(directory, relative), timeout: 120000 });
      if ((await lifecycle())?.kind === 'PLAYING') break;
    }
    return relative;
  };
  const checks = [];
  const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), detail });

  await waitTicks(20);
  const mounted = await minimap();
  check(
    'minimap-mounted',
    mounted && mounted.rootHidden === false && mounted.canvas.staticWidth > 0,
    `root hidden ${mounted?.rootHidden}, canvas ${mounted?.canvas.staticWidth}×${mounted?.canvas.staticHeight}`,
  );
  const painted = await page.evaluate(() => {
    const count = (selector) => {
      const canvas = globalThis.document?.querySelector(selector);
      if (!(canvas instanceof globalThis.HTMLCanvasElement)) return 0;
      const context = canvas.getContext('2d');
      if (context === null) return 0;
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let nonEmpty = 0;
      for (let index = 3; index < data.length; index += 4) if (data[index] !== 0) nonEmpty += 1;
      return nonEmpty;
    };
    return { static: count('.minimap__static'), dynamic: count('.minimap__dynamic') };
  });
  check(
    'canvases-painted',
    painted.static > 100 && painted.dynamic > 50,
    `${painted.static} static / ${painted.dynamic} dynamic non-transparent pixels`,
  );

  await ensurePlaying();
  let activeRideTaxi = null;
  try {
    await page.waitForFunction(
      () => {
        const rides = globalThis.__v3Composition?.rides?.()?.rides?.rides ?? [];
        return rides.some((ride) => ride.completionTick === null && ride.taxiId);
      },
      null,
      { timeout: 120000 },
    );
    activeRideTaxi = await page.evaluate(() => {
      const rides = globalThis.__v3Composition?.rides?.()?.rides?.rides ?? [];
      return rides.find((ride) => ride.completionTick === null)?.taxiId ?? null;
    });
  } catch {
    activeRideTaxi = null;
  }
  await ensurePlaying();
  const beforeSelect = await minimap();
  const targetTaxiId = activeRideTaxi ?? beforeSelect.view?.map?.frame?.taxi?.vehicleId ?? null;
  if (targetTaxiId === null) throw new Error('Minimap has no selected taxi');
  const beforeClick = await read();
  await page.evaluate((vehicleId) => {
    const marker = globalThis.document?.querySelector(
      `.map-selection__marker[data-vehicle-id="${vehicleId}"]`,
    );
    if (marker instanceof globalThis.HTMLElement) {
      marker.dispatchEvent(new globalThis.MouseEvent('click', { bubbles: true, cancelable: true }));
    }
  }, targetTaxiId);
  await waitTicks(6);
  const afterClick = await read();
  const selected = await fleet();
  const targetVehicle = selected.snapshot.fleet.vehicles.find(
    (vehicle) => vehicle.vehicleId === targetTaxiId,
  );
  check(
    'marker-click-camera-only',
    afterClick.camera.entityId === targetTaxiId &&
      afterClick.authority === beforeClick.authority &&
      selected.snapshot.fleet.selectedVehicleId === targetTaxiId &&
      targetVehicle?.controlMode === 'AUTO',
    `camera ${afterClick.camera.entityId}, authority ${afterClick.authority}, mode ${targetVehicle?.controlMode}`,
  );
  await ensurePlaying();
  const route = await minimap();
  const routeReady = route.view?.map?.projection?.route?.status === 'READY';
  check(
    'route-ready',
    routeReady && (route.view?.map?.projection?.route?.laneIds?.length ?? 0) > 0,
    `${route.view?.map?.projection?.route?.status ?? 'NO_ROUTE'}, ${route.view?.map?.projection?.route?.laneIds?.length ?? 0} lanes, ride ${activeRideTaxi ?? 'none'}`,
  );
  const projectionMarkers = route.view?.map?.projection?.markers ?? [];
  const pickupMarkers = projectionMarkers.filter((marker) => marker.role === 'PICKUP');
  const dropoffMarkers = projectionMarkers.filter((marker) => marker.role === 'DROPOFF');
  check(
    'pickup-dropoff-markers',
    pickupMarkers.length === 1 && dropoffMarkers.length === 1,
    `P ${pickupMarkers[0]?.zoneId ?? '-'} / D ${dropoffMarkers[0]?.zoneId ?? '-'}`,
  );
  const markerStats = route.stats.selection;
  check(
    'fleet-markers',
    markerStats.markers > 0 && markerStats.markers === markerStats.created,
    `${markerStats.markers} markeri, ${markerStats.created} creați`,
  );
  check(
    'no-global-listeners',
    route.stats.globalListeners === 0,
    `${route.stats.globalListeners} listeners globali`,
  );
  const focus = await page.evaluate(() => ({
    tag: globalThis.document?.activeElement?.tagName ?? null,
    cls: globalThis.document?.activeElement?.className ?? null,
  }));
  check(
    'click-restores-canvas-focus',
    focus.tag === 'CANVAS',
    `focus ${focus.tag}.${String(focus.cls)}`,
  );

  const hud = await page.evaluate(() => {
    const row = (label) => {
      const terms = [...globalThis.document.querySelectorAll('.taxi-hud__ride dt')];
      const term = terms.find((entry) => entry.textContent === label);
      return term?.nextElementSibling?.textContent ?? null;
    };
    return {
      speed: globalThis.document.querySelector('.taxi-hud__speed output')?.textContent ?? null,
      unit: globalThis.document.querySelector('.taxi-hud__unit')?.textContent ?? null,
      mode: globalThis.document.querySelector('.taxi-hud__mode')?.textContent ?? null,
      session: globalThis.document.querySelector('.taxi-hud__session')?.textContent ?? null,
      objective: row('Obiectiv'),
      stance: row('Stare'),
      rideState: row('Etapă'),
      eta: row('ETA'),
      progress: row('Progres'),
      route: globalThis.document.querySelector('.minimap__route')?.textContent ?? null,
    };
  });
  check(
    'hud-complete',
    hud.speed !== null &&
      hud.speed !== '—' &&
      (hud.mode ?? '').length > 0 &&
      (hud.session ?? '').length > 0 &&
      (hud.objective ?? '').length > 0 &&
      (hud.stance ?? '').length > 0,
    `${hud.speed} ${hud.unit} · ${hud.mode} · ${hud.session} · ${hud.objective} · ${hud.stance}`,
  );
  check('hud-session', hud.session === 'Academia', `session ${hud.session}`);
  check(
    'hud-objective-route',
    (hud.objective ?? '').includes('pasager') || (hud.objective ?? '').includes('destina'),
    `objective ${hud.objective}, route ${hud.route}`,
  );
  check(
    'hud-ride-state',
    hud.stance === 'În desfășurare' || hud.stance === 'La pasager',
    `stance ${hud.stance}, stage ${hud.rideState}`,
  );

  const beforeRate = await minimap();
  const rateStart = Date.now();
  await page.waitForTimeout(2000);
  const afterRate = await minimap();
  const seconds = (Date.now() - rateStart) / 1000;
  const mapDelta = afterRate.stats.map.dynamicPaints - beforeRate.stats.map.dynamicPaints;
  const selectionDelta = afterRate.stats.selection.updates - beforeRate.stats.selection.updates;
  const incidentDelta = afterRate.stats.incidents.updates - beforeRate.stats.incidents.updates;
  const hudDelta = (afterRate.hud?.stats?.updates ?? 0) - (beforeRate.hud?.stats?.updates ?? 0);
  const mapHz = mapDelta / seconds;
  check(
    'update-rate-5-10hz',
    mapHz >= 5 && mapHz <= 11,
    `${mapDelta} actualizări în ${seconds.toFixed(2)} s = ${mapHz.toFixed(2)} Hz`,
  );
  check(
    'hud-update-rate',
    hudDelta / seconds >= 5 && hudDelta / seconds <= 11,
    `${hudDelta} actualizări HUD în ${seconds.toFixed(2)} s = ${(hudDelta / seconds).toFixed(2)} Hz`,
  );

  const idleTaxi = selected.snapshot.fleet.vehicles.find(
    (vehicle) =>
      vehicle.kind === 'TAXI' &&
      vehicle.slot < 9000 &&
      !vehicle.inRide &&
      !vehicle.playerControlled &&
      vehicle.vehicleId !== targetTaxiId,
  );
  let incidentId = null;
  if (idleTaxi !== undefined) {
    const applied = await page.evaluate(
      (taxiId) => globalThis.__v3Composition.probeIncident(taxiId),
      idleTaxi.vehicleId,
    );
    if (applied !== null && applied !== undefined) {
      try {
        await page.waitForSelector('.minimap-incidents__marker', { timeout: 30000 });
        incidentId = await page.evaluate(
          () =>
            globalThis.document
              .querySelector('.minimap-incidents__marker')
              ?.getAttribute('data-incident-id') ?? null,
        );
      } catch {
        incidentId = null;
      }
    }
  }
  check(
    'incident-marker',
    incidentId !== null,
    incidentId === null ? 'niciun marker de incident' : `incident ${incidentId}`,
  );

  const viewports = [
    { name: '01-1280x720', width: 1280, height: 720 },
    { name: '02-1920x1080', width: 1920, height: 1080 },
    { name: '03-zoom-150', width: 853, height: 480 },
  ];
  const screenshotsTaken = [];
  const layoutMeasures = [];
  const overlaps = [];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await waitTicks(12);
    await page.evaluate(() => {
      const canvas = globalThis.document?.querySelector('canvas.game-canvas');
      if (canvas instanceof globalThis.HTMLCanvasElement) canvas.focus();
    });
    screenshotsTaken.push(await shot(viewport.name));
    const measure = await page.evaluate(() => {
      const rectOf = (selector) => {
        const element = globalThis.document?.querySelector(selector);
        if (!(element instanceof globalThis.HTMLElement)) return null;
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      };
      const overlapOf = (a, b) => {
        if (a === null || b === null) return 0;
        const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
        const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
        return width * height;
      };
      const hud = rectOf('.taxi-hud');
      const minimap = rectOf('.minimap');
      const gameHud = rectOf('.game-hud');
      const economyHud = rectOf('.live-economy-hud');
      const shellBar = rectOf('.game-shell-host');
      const inside = (rect) =>
        rect !== null &&
        rect.x >= -0.5 &&
        rect.y >= -0.5 &&
        rect.x + rect.width <= globalThis.innerWidth + 0.5 &&
        rect.y + rect.height <= globalThis.innerHeight + 0.5;
      const font = (selector) => {
        const element = globalThis.document?.querySelector(selector);
        return element === null || element === undefined
          ? null
          : Number.parseFloat(globalThis.getComputedStyle(element).fontSize);
      };
      return {
        innerWidth: globalThis.innerWidth,
        innerHeight: globalThis.innerHeight,
        hud,
        minimap,
        gameHud,
        economyHud,
        shellBar,
        insideHud: inside(hud),
        insideMinimap: inside(minimap),
        overlaps: [
          overlapOf(hud, minimap),
          overlapOf(hud, gameHud),
          overlapOf(minimap, gameHud),
          overlapOf(hud, economyHud),
          overlapOf(hud, shellBar),
          overlapOf(minimap, shellBar),
        ],
        hudFont: font('.taxi-hud'),
        minimapFont: font('.minimap'),
      };
    });
    layoutMeasures.push({ ...viewport, ...measure });
    overlaps.push(measure.overlaps.filter((area) => area > 0).length);
    check(
      `layout-${viewport.name}-inside`,
      measure.insideHud && measure.insideMinimap,
      `HUD ${measure.insideHud}, minimap ${measure.insideMinimap}`,
    );
    check(
      `layout-${viewport.name}-no-overlap`,
      measure.overlaps.every((area) => area === 0),
      `HUD/minimap/game-hud/shell/economy overlaps ${measure.overlaps.map((area) => area.toFixed(1)).join(', ')}`,
    );
    check(
      `layout-${viewport.name}-font`,
      (measure.hudFont ?? 0) >= 12 && (measure.minimapFont ?? 0) >= 12,
      `HUD ${measure.hudFont} px, minimap ${measure.minimapFont} px`,
    );
  }

  check('no-page-errors', pageErrors.length === 0, `${pageErrors.length} page errors`);
  check('no-console-errors', consoleErrors.length === 0, `${consoleErrors.length} console errors`);
  const pass = checks.every((entry) => entry.pass);
  const result = {
    version: '281-minimap-hud-browser-v1',
    generatedAt,
    status: 'MEASURED',
    run: {
      pass,
      browser: browser.version(),
      requestedBackend: 'WEBGL2',
      actualBackend,
      viewport: '1280x720 → 1920x1080 → 853x480 (zoom 150%)',
      url,
      selectedTaxi: targetTaxiId,
      screenshotTargets: screenshotsTaken,
      screenshots: screenshotsTaken,
      measures: {
        markers: markerStats.markers,
        taxis: markerStats.markers - markerStats.markers,
        civilians: 0,
        pickupMarkers: pickupMarkers.length,
        dropoffMarkers: dropoffMarkers.length,
        routeLanes: route.view?.map?.projection?.route?.laneIds?.length ?? 0,
        incidents: incidentId === null ? 0 : 1,
        mapUpdates: mapDelta,
        mapHz,
        hudUpdates: hudDelta,
        hudHz: hudDelta / seconds,
        selectionUpdates: selectionDelta,
        incidentUpdates: incidentDelta,
        globalListeners: route.stats.globalListeners,
        overlaps,
      },
      hud,
      layouts: layoutMeasures,
      checks,
      pageErrors,
      consoleErrors,
    },
    limitations,
  };
  result.run.measures.taxis =
    route.view?.selection?.markers.filter((marker) => marker.kind === 'TAXI').length ?? 0;
  result.run.measures.civilians =
    route.view?.selection?.markers.filter((marker) => marker.kind === 'CIVIL').length ?? 0;
  await writeFile(browserJson, `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(reportMarkdown, markdown(result));
  console.log(
    `SUMMARY minimap/HUD ${pass ? 'PASS' : 'FAIL'} checks ${checks.filter((entry) => entry.pass).length}/${checks.length}`,
  );
  console.log(`Wrote ${browserJson}`);
  console.log(`Wrote ${reportMarkdown}`);
} finally {
  await browser.close();
  server.close();
}
