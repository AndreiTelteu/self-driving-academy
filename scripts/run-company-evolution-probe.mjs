import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 269 browser probe: after the live shell is READY, buy the first company vehicle through the
 * same debug command the future 270 panel will call. It verifies the real 057 registry, the real
 * 058 actor, the cash deduction and the closed duplicate refusal. It does not drive or teleport.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '269-company-evolution'),
  browserJson = join(directory, 'browser.json'),
  browserMarkdown = join(directory, 'browser.md'),
  screenshots = join(directory, 'screenshots'),
  buildDirectory = join(root, '.pbi-validation-269', 'build');

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
        pathname = decodeURIComponent(url.pathname),
        file = resolve(directoryPath, '.' + (pathname === '/' ? '/index.html' : pathname));
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
    return `# 269 — proba de browser a evoluției companiei

Generată de \`npm run company:evolution:probe\`.

**NOT_RUN** — ${result.reason}

Nu este raportat niciun PASS simulat. Achiziția, nivelul, upgrade-ul și reload-ul sunt probate
determinist în [report.md](report.md).
`;
  const run = result.run,
    checks = run.checks
      .map((entry) => `- \`${entry.name}\`: ${entry.pass ? 'PASS' : 'FAIL'} — ${entry.detail}`)
      .join('\n');
  return `# 269 — proba de browser a evoluției companiei

Generată de \`npm run company:evolution:probe\`; Chromium ${run.browser}, backend ${run.actualBackend},
viewport ${run.viewport}, tick ${run.tick}.

Achiziția a fost executată prin comanda live \`companyPurchase\`, exact ce va apela panoul 270, fără
nicio scriere în XP, profil sau ledgerul 209.

| Metric | Value |
| --- | ---: |
| Company level | ${run.level} |
| Cash before / after | ${run.cashBeforeMinorUnits} / ${run.cashAfterMinorUnits} SDA |
| Taxis before / after | ${run.taxisBefore} / ${run.taxisAfter} |
| Purchased vehicle | \`${run.vehicleId}\` slot ${run.slot} (${run.classId}) |
| 058 actor present | ${run.simulated} |
| Duplicate reason | \`${run.duplicateReason}\` |
| XP / profile / style writes | ${run.xpWrites} / ${run.profileWrites} / ${run.styleOverrides} |
| historyScans | ${run.historyScans} |

Capturi: ${run.screenshots.map((file) => `[${file}](${file})`).join(', ')}.

${checks}

Limitări: proba nu cumpără un upgrade în browser (efectul next-period este probat determinist) și nu
testează reload-ul, care rămâne 278. Nu măsoară FPS/GPU și nu înlocuiește gate-ul 287.
`;
}

async function writeResult(result) {
  await mkdir(directory, { recursive: true });
  await writeFile(browserJson, `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(browserMarkdown, markdown(result));
  console.log(`Wrote ${browserJson}`);
  console.log(`Wrote ${browserMarkdown}`);
}

const playwright = await loadPlaywright();
await mkdir(directory, { recursive: true });
await rm(screenshots, { recursive: true, force: true });
await mkdir(screenshots, { recursive: true });
const generatedAt = new Date().toISOString();

if (playwright === null) {
  await writeResult({
    version: '269-company-evolution-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason:
      'Playwright is not installed in this checkout (no `playwright` module and no PLAYWRIGHT_MODULE); the browser probe was not run.',
    run: null,
  });
  console.log('Company evolution browser probe NOT_RUN: Playwright is not installed.');
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
const requestedChannel = process.env.PLAYWRIGHT_CHANNEL,
  channels = requestedChannel ? [requestedChannel] : ['chrome', undefined];
let browser = null,
  launchError = null;
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
    version: '269-company-evolution-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason: `Browser launch failed: ${launchError instanceof Error ? launchError.message : String(launchError)}`,
    run: null,
  });
  server.close();
  console.log('Company evolution browser probe NOT_RUN: browser launch failed.');
  process.exit(0);
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }),
    page = await context.newPage(),
    pageErrors = [],
    consoleErrors = [];
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
  await page.waitForFunction(
    () => globalThis.document?.querySelector('.game-shell')?.getAttribute('data-state') === 'READY',
    null,
    { timeout: 180000 },
  );
  const play = page.getByRole('button', { name: 'Joacă' }),
    resumeStart = page.getByRole('button', { name: 'Pornește' }),
    startButton = (await play.count()) > 0 ? play : resumeStart;
  await startButton.click();
  await page.evaluate(() => {
    const canvas = globalThis.document?.querySelector('canvas');
    if (canvas instanceof globalThis.HTMLCanvasElement) canvas.focus();
  });
  await page.waitForFunction(
    () => (globalThis.__v3Composition?.company?.()?.evolution?.tick ?? 0) > 0,
    null,
    { timeout: 120000 },
  );
  const before = await page.evaluate(() => globalThis.__v3Composition.company().evolution),
    outcome = await page.evaluate(() =>
      globalThis.__v3Composition.companyPurchase('offer-city-compact-1'),
    ),
    after = await page.evaluate(() => globalThis.__v3Composition.company().evolution),
    duplicate = await page.evaluate(() =>
      globalThis.__v3Composition.companyPurchase('offer-city-compact-1'),
    ),
    purchase = outcome?.purchase;
  await page.waitForTimeout(1000);
  const fleetAfter = await page.evaluate(() => globalThis.__v3Composition.fleet()),
    checks = [];
  const check = (name, pass, detail) => checks.push({ name, pass, detail });
  check('purchase-accepted', outcome?.status === 'ACCEPTED', `status ${outcome?.status}`);
  check(
    'purchase-cash',
    after?.cash?.cashMinorUnits === before?.cash?.cashMinorUnits - 12_000,
    `${before?.cash?.cashMinorUnits} -> ${after?.cash?.cashMinorUnits} SDA`,
  );
  check(
    'purchase-fleet',
    after?.fleet?.taxis === before?.fleet?.taxis + 1,
    `${before?.fleet?.taxis} -> ${after?.fleet?.taxis} taxis`,
  );
  check('purchase-slot', purchase?.slot === 25, `slot ${purchase?.slot}`);
  check(
    'purchase-actor',
    after?.fleet?.purchased?.[0]?.simulated === true,
    `simulated ${after?.fleet?.purchased?.[0]?.simulated}`,
  );
  check(
    'frame-actor',
    (fleetAfter?.snapshot?.vehicles ?? []).some(
      (vehicle) => vehicle.vehicleId === purchase?.vehicleId,
    ),
    `${fleetAfter?.snapshot?.vehicles?.length ?? 0} frame vehicles`,
  );
  check(
    'duplicate-refused',
    duplicate?.status === 'REJECTED' && duplicate?.reason === 'ALREADY_OWNED',
    `status ${duplicate?.status} / ${duplicate?.reason}`,
  );
  check(
    'no-xp-profile-style-writes',
    after?.counters?.xpWrites === 0 &&
      after?.counters?.profileWrites === 0 &&
      after?.counters?.styleOverrides === 0,
    `${after?.counters?.xpWrites}/${after?.counters?.profileWrites}/${after?.counters?.styleOverrides}`,
  );
  check('history-scans', after?.historyScans === 0, '0');
  check('no-page-errors', pageErrors.length === 0, `${pageErrors.length} page errors`);
  check('no-console-errors', consoleErrors.length === 0, `${consoleErrors.length} console errors`);
  const screenshot = 'screenshots/01-company-purchase.png';
  await page.screenshot({ path: join(directory, screenshot), timeout: 120000 });
  const passed = checks.filter((entry) => entry.pass).length,
    run = {
      browser: await browser.version(),
      actualBackend:
        (await page.evaluate(() => globalThis.__v3Composition.backend()))?.rendererKind ?? null,
      viewport: '1440x900',
      route: url,
      tick: after?.tick ?? 0,
      level: after?.companyLevel?.level ?? 0,
      cashBeforeMinorUnits: before?.cash?.cashMinorUnits ?? 0,
      cashAfterMinorUnits: after?.cash?.cashMinorUnits ?? 0,
      taxisBefore: before?.fleet?.taxis ?? 0,
      taxisAfter: after?.fleet?.taxis ?? 0,
      vehicleId: purchase?.vehicleId ?? null,
      slot: purchase?.slot ?? null,
      classId: purchase?.classId ?? null,
      simulated: after?.fleet?.purchased?.[0]?.simulated ?? null,
      duplicateReason: duplicate?.reason ?? null,
      xpWrites: after?.counters?.xpWrites ?? null,
      profileWrites: after?.counters?.profileWrites ?? null,
      styleOverrides: after?.counters?.styleOverrides ?? null,
      historyScans: after?.historyScans ?? null,
      screenshots: [screenshot],
      checks,
      summary: { checks: checks.length, passed, pass: passed === checks.length },
    };
  await writeResult({
    version: '269-company-evolution-browser-v1',
    generatedAt,
    status: run.summary.pass ? 'PASS' : 'FAIL',
    reason: run.summary.pass ? null : 'One or more browser checks failed.',
    run,
  });
  console.log(
    `SUMMARY checks ${passed}/${checks.length}, cash ${run.cashBeforeMinorUnits}->${run.cashAfterMinorUnits}, ` +
      `taxis ${run.taxisBefore}->${run.taxisAfter}, slot ${run.slot}, pass ${run.summary.pass}`,
  );
  if (!run.summary.pass) process.exitCode = 1;
} catch (error) {
  await writeResult({
    version: '269-company-evolution-browser-v1',
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
