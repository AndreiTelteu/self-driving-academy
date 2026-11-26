import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 268 browser probe: wait for a real AI-served 265 ride, then read the company port that the
 * shell feeds from the accepted 209 settlements. It does not drive, teleport or write simulation.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '268-company-finance'),
  browserJson = join(directory, 'browser.json'),
  browserMarkdown = join(directory, 'browser.md'),
  screenshots = join(directory, 'screenshots'),
  buildDirectory = join(root, '.pbi-validation-268', 'build');

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
    return `# 268 — proba de browser a companiei

Generată de \`npm run company:finance:probe\`.

**NOT_RUN** — ${result.reason}

Nu este raportat niciun PASS simulat. Costurile reale ale curselor sunt probate determinist în
[report.md](report.md).
`;
  const run = result.run,
    checks = run.checks
      .map((entry) => `- \`${entry.name}\`: ${entry.pass ? 'PASS' : 'FAIL'} — ${entry.detail}`)
      .join('\n');
  return `# 268 — proba de browser a companiei

Generată de \`npm run company:finance:probe\`; Chromium ${run.browser}, backend ${run.actualBackend},
viewport ${run.viewport}, tick ${run.tick}.

Portul companiei a fost citit după o cursă reală AI din compunerea live, fără nicio scriere în
simulare. Costurile sunt cele versionate 268, revenue-ul este copiat din settle-ul 209.

| Metric | Value |
| --- | ---: |
| Company ride entries | ${run.rideCostEntries} |
| Revenue | ${run.revenueMinorUnits} SDA |
| Gross cost | ${run.grossCostMinorUnits} SDA |
| Net cost | ${run.netCostMinorUnits} SDA |
| Profit | ${run.profitMinorUnits} SDA |
| Cash | ${run.cashMinorUnits} SDA |
| Month terminal rides | ${run.monthTerminalRides} |
| Month fixed cost | ${run.monthFixedCostMinorUnits} SDA |
| historyScans | ${run.historyScans} |
| XP / 209 / investment writes | ${run.xpWrites} / ${run.economyWrites} / ${run.investmentWrites} |

Capturi: ${run.screenshots.map((file) => `[${file}](${file})`).join(', ')}.

${checks}

Limitări: proba nu conduce manual și nu produce un incident 028 în browser; costul de incident este
probatoriu determinist în [report.md](report.md). Nu măsoară FPS/GPU și nu înlocuiește gate-ul 287.
Persistarea companiei după reload rămâne 278.
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
    version: '268-company-finance-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason:
      'Playwright is not installed in this checkout (no `playwright` module and no PLAYWRIGHT_MODULE); the browser probe was not run.',
    run: null,
  });
  console.log('Company finance browser probe NOT_RUN: Playwright is not installed.');
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
    version: '268-company-finance-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason: `Browser launch failed: ${launchError instanceof Error ? launchError.message : String(launchError)}`,
    run: null,
  });
  server.close();
  console.log('Company finance browser probe NOT_RUN: browser launch failed.');
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

  const timeoutAt = Date.now() + 240000;
  for (;;) {
    const state = await page.evaluate(() => globalThis.__v3Composition?.company?.());
    if (state?.read?.totals?.rideCostEntries >= 1) break;
    if (Date.now() > timeoutAt)
      throw new Error(
        `No company ride cost entry appeared; tick ${(await page.evaluate(() => globalThis.__v3Composition?.shell?.()))?.tick}`,
      );
    await page.waitForTimeout(250);
  }
  const company = await page.evaluate(() => globalThis.__v3Composition.company()),
    economy = await page.evaluate(() => globalThis.__v3Composition.economy()),
    read = company.read,
    totals = read.totals,
    snapshot = company.snapshot,
    checks = [];
  const check = (name, pass, detail) => checks.push({ name, pass, detail });
  check('company-port', read !== null, `version ${read?.version}`);
  check(
    'ride-cost-entry',
    totals.rideCostEntries >= 1,
    `${totals.rideCostEntries} ride cost entr${totals.rideCostEntries === 1 ? 'y' : 'ies'}`,
  );
  check('revenue', totals.revenueMinorUnits > 0, `${totals.revenueMinorUnits} SDA`);
  check('gross-cost', totals.grossCostMinorUnits > 0, `${totals.grossCostMinorUnits} SDA`);
  check(
    'profit-formula',
    totals.profitMinorUnits === totals.revenueMinorUnits - totals.netCostMinorUnits,
    `${totals.profitMinorUnits} = ${totals.revenueMinorUnits} - ${totals.netCostMinorUnits}`,
  );
  check(
    'cash-formula',
    totals.cashMinorUnits === Math.max(0, totals.initialCashMinorUnits + totals.profitMinorUnits),
    `${totals.cashMinorUnits} SDA`,
  );
  check(
    'month-pnl',
    read.month !== null && read.month.terminalRides >= 1,
    `${read.month?.periodId} / ${read.month?.terminalRides} rides / ${read.month?.profitMinorUnits} SDA`,
  );
  check(
    'fixed-costs',
    read.month?.fixedCostsApplied === true && read.month?.fixedCostMinorUnits > 0,
    `${read.month?.fixedCostMinorUnits} SDA`,
  );
  check('history-scans', read.historyScans === 0 && snapshot?.historyScans === 0, '0');
  check(
    'no-xp-economy-investment-writes',
    read.counters.xpWrites === 0 &&
      read.counters.economyWrites === 0 &&
      read.counters.investmentWrites === 0,
    `${read.counters.xpWrites}/${read.counters.economyWrites}/${read.counters.investmentWrites}`,
  );
  check(
    'economy-still-owned-by-209',
    economy?.read?.historyScans === 0 && economy.read.totals.settlements >= totals.rideCostEntries,
    `${economy?.read?.totals?.settlements} settlements / ${totals.rideCostEntries} company entries`,
  );
  check('no-page-errors', pageErrors.length === 0, `${pageErrors.length} page errors`);
  check('no-console-errors', consoleErrors.length === 0, `${consoleErrors.length} console errors`);
  const screenshot = 'screenshots/01-company-port.png';
  await page.screenshot({ path: join(directory, screenshot), timeout: 120000 });
  const passed = checks.filter((entry) => entry.pass).length,
    run = {
      browser: await browser.version(),
      actualBackend:
        (await page.evaluate(() => globalThis.__v3Composition.backend()))?.rendererKind ?? null,
      viewport: '1440x900',
      route: url,
      tick: read.tick,
      rideCostEntries: totals.rideCostEntries,
      revenueMinorUnits: totals.revenueMinorUnits,
      grossCostMinorUnits: totals.grossCostMinorUnits,
      adjustmentMinorUnits: totals.adjustmentMinorUnits,
      netCostMinorUnits: totals.netCostMinorUnits,
      profitMinorUnits: totals.profitMinorUnits,
      cashMinorUnits: totals.cashMinorUnits,
      monthTerminalRides: read.month?.terminalRides ?? 0,
      monthFixedCostMinorUnits: read.month?.fixedCostMinorUnits ?? 0,
      historyScans: read.historyScans,
      xpWrites: read.counters.xpWrites,
      economyWrites: read.counters.economyWrites,
      investmentWrites: read.counters.investmentWrites,
      screenshots: [screenshot],
      checks,
      summary: { checks: checks.length, passed, pass: passed === checks.length },
    };
  await writeResult({
    version: '268-company-finance-browser-v1',
    generatedAt,
    status: run.summary.pass ? 'PASS' : 'FAIL',
    reason: run.summary.pass ? null : 'One or more browser checks failed.',
    run,
  });
  console.log(
    `SUMMARY checks ${passed}/${checks.length}, ride entries ${run.rideCostEntries}, profit ${run.profitMinorUnits} SDA, cash ${run.cashMinorUnits} SDA, pass ${run.summary.pass}`,
  );
  if (!run.summary.pass) process.exitCode = 1;
} catch (error) {
  await writeResult({
    version: '268-company-finance-browser-v1',
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
