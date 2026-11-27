import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 267 browser probe.
 *
 * The fixture page mounts the real 209/210 KPI popup, the real 082/061/028/065 city dashboard and
 * the real 214 consequence HUD. The live page opens the same popup through the native shell button
 * and the `K` hotkey, then closes it with Escape without reading while closed.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '267-kpi-dashboard'),
  browserJson = join(directory, 'browser.json'),
  browserMarkdown = join(directory, 'browser.md'),
  screenshots = join(directory, 'screenshots'),
  buildDirectory = join(root, '.pbi-validation-267', 'kpi-probe');

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
        pathname = decodeURIComponent(url.pathname);
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
  const address = server.address(),
    origin = `http://127.0.0.1:${
      typeof address === 'object' && address !== null ? address.port : 0
    }`;
  return { server, origin };
}

function markdown(result) {
  if (!result.run)
    return `# 267 — proba de browser KPI, oraș și consecințe

Generată de \`npm run kpi:dashboard:probe\`.

**NOT_RUN** — ${result.reason}

Nu este raportat niciun PASS simulat. Proiecțiile deterministe sunt în [report.md](report.md).
`;
  const run = result.run,
    checks = run.checks
      .map((entry) => `- \`${entry.name}\`: ${entry.pass ? 'PASS' : 'FAIL'} — ${entry.detail}`)
      .join('\n');
  return `# 267 — proba de browser KPI, oraș și consecințe

Generată de \`npm run kpi:dashboard:probe\`; Chromium ${run.browser}, viewport ${run.viewport}.

Două pagini reale din același build:

1. \`tests/ui/kpi-dashboard-fixture.html\`: popup-ul real 210 peste bucketurile 209, tabloul real
   082 peste 061/028/065 și HUD-ul real 214. Proba a deschis KPI, a inspectat luna fără date, a
   verificat Tab/Escape, a deschis orașul cu șapte indicatori și a rulat 600 tick-uri de feedback.
2. \`index.html\`: buildul jocului. Butonul nativ \`KPIs\` și hotkey-ul \`K\` deschid același dialog,
   suprafața 070 este activă, Escape închide și panoul închis nu citește.

| Metric | Value |
| --- | ---: |
| KPI months / month rows | ${run.fixture.kpi.months} / ${run.fixture.dom.kpiMonthRows} |
| KPI missing month | ${run.fixture.kpi.missing?.state} · ${run.fixture.kpi.missing?.revenueLabel} |
| KPI zero month | ${run.fixture.kpi.zero?.state} · ${run.fixture.kpi.zero?.revenueLabel} |
| KPI reads closed / open / after close | 0 / ${run.fixture.kpi.reads} / ${run.fixture.kpi.reads} |
| City metrics / incidents | ${run.fixture.city.metrics} / ${run.fixture.city.rows} |
| Impact ticks / reads / renders / writes | ${run.fixture.impact.ticks} / ${run.fixture.impact.reads} / ${run.fixture.impact.renders} / ${run.fixture.impact.planeUpdates} |
| historyScans | ${run.fixture.kpi.historyScans} |
| Live panel reads closed / open | ${run.live.panelReadsClosed} / ${run.live.panelReadsOpen} |
| Live surface KPI / city / closed | ${run.live.shellSurface} / ${run.live.citySurface} / ${run.live.closedSurface} |
| Live historyScans | ${run.live.historyScans} |

Capturi: ${run.screenshots.map((file) => `[${file}](${file})`).join(', ')}.

${checks}

Limitări: fixture-ul rulează modulele reale 209/210/214/082/061/028/065, nu o lume Babylon completă;
proba live verifică montarea, suprafața, hotkey-ul și focusul, nu parcurge 12 luni simulate în timp
real. Nu măsoară FPS/GPU și nu înlocuiește gate-ul 287.
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
    version: '267-kpi-dashboard-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason:
      'Playwright is not installed in this checkout (no `playwright` module and no PLAYWRIGHT_MODULE); the browser probe was not run.',
    run: null,
  });
  console.log('KPI dashboard browser probe NOT_RUN: Playwright is not installed.');
  process.exit(0);
}

const { build } = await import('vite');
await build({
  configFile: join(root, 'vite.config.ts'),
  logLevel: 'error',
  build: {
    outDir: buildDirectory,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: join(root, 'index.html'),
        dashboard: join(root, 'tests', 'ui', 'kpi-dashboard-fixture.html'),
      },
    },
  },
});
const { server, origin } = await serve(buildDirectory);
const { chromium } = playwright.default ?? playwright;
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  requestedChannel = process.env.PLAYWRIGHT_CHANNEL,
  channels = executablePath
    ? [null]
    : requestedChannel
      ? [requestedChannel]
      : ['chrome', undefined];
let browser = null,
  launchError = null;
for (const channel of channels) {
  try {
    browser = await chromium.launch({
      headless: true,
      ...(executablePath === undefined ? {} : { executablePath }),
      ...(channel === null || channel === undefined ? {} : { channel }),
      args: ['--disable-gpu-sandbox'],
    });
    break;
  } catch (error) {
    launchError = error;
  }
}
if (browser === null) {
  await writeResult({
    version: '267-kpi-dashboard-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason: `Browser launch failed: ${launchError instanceof Error ? launchError.message : String(launchError)}`,
    run: null,
  });
  server.close();
  console.log('KPI dashboard browser probe NOT_RUN: browser launch failed.');
  process.exit(0);
}

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } }),
    page = await context.newPage(),
    pageErrors = [],
    consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  const url = `${origin}/tests/ui/kpi-dashboard-fixture.html`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => globalThis.__kpiDashboardProbe?.ready === true, null, {
    timeout: 120000,
  });
  const checks = [],
    check = (name, pass, detail) => checks.push({ name, pass, detail }),
    snapshot = () => page.evaluate(() => globalThis.__kpiDashboardProbe.snapshot());

  const closed = await snapshot();
  check(
    'closed-reads-nothing',
    closed.kpi.reads === 0 &&
      closed.kpi.renders === 0 &&
      closed.city.reads === 0 &&
      closed.kpi.historyScans === 0,
    `KPI ${closed.kpi.reads} citiri, oraș ${closed.city.reads}, historyScans ${closed.kpi.historyScans}`,
  );
  await page.click('#kpi-trigger');
  const opened = await snapshot(),
    openedFocus = await page.evaluate(() => globalThis.document?.activeElement?.className ?? null);
  check(
    'open-reads-once-and-12-months',
    opened.kpi.open === true &&
      opened.kpi.reads === 1 &&
      opened.kpi.renders === 1 &&
      opened.kpi.months === 12 &&
      opened.dom.kpiMonthRows === 12,
    `open ${opened.kpi.open}, reads ${opened.kpi.reads}, luni ${opened.kpi.months}, rânduri ${opened.dom.kpiMonthRows}`,
  );
  check('open-surface', opened.surfaces.panel === true, `surface ${opened.surfaces.panel}`);
  check('open-focus', (openedFocus ?? '').includes('kpi-history__close'), `focus ${openedFocus}`);
  check(
    'no-data-vs-real-zero',
    opened.kpi.missing?.state === 'NO_DATA' &&
      (opened.kpi.missing?.revenueLabel ?? '').includes('fără date') &&
      opened.kpi.zero?.state === 'COMPLETE' &&
      opened.kpi.zero?.revenueLabel === '0 SDA' &&
      opened.kpi.missing?.revenueLabel !== opened.kpi.zero?.revenueLabel,
    `lipsă ${opened.kpi.missing?.state}/${opened.kpi.missing?.revenueLabel}, zero ${opened.kpi.zero?.state}/${opened.kpi.zero?.revenueLabel}`,
  );
  const kpiScreenshot = 'screenshots/01-kpi-fixture.png';
  await page
    .locator('.kpi-history__table[data-table="months"] tr[data-key="m0003"]')
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(directory, kpiScreenshot), timeout: 120000 });
  await page.keyboard.press('Tab');
  const tabFocus = await page.evaluate(() => globalThis.document?.activeElement?.className ?? null);
  check('tab-stays-inside', (tabFocus ?? '').includes('kpi-history__body'), `focus ${tabFocus}`);
  await page.keyboard.press('Escape');
  const escaped = await snapshot(),
    escapedFocus = await page.evaluate(() => globalThis.document?.activeElement?.id ?? null);
  check(
    'escape-closes-and-restores',
    escaped.kpi.open === false &&
      escaped.surfaces.panel === false &&
      escaped.kpi.focusRestores === 1 &&
      escapedFocus === 'kpi-trigger',
    `open ${escaped.kpi.open}, surface ${escaped.surfaces.panel}, focus ${escapedFocus}`,
  );
  check(
    'closed-after-escape-no-read',
    escaped.kpi.reads === 1 && escaped.kpi.renders === 1,
    `reads ${escaped.kpi.reads}, renders ${escaped.kpi.renders}`,
  );

  await page.click('#city-trigger');
  const cityOpen = await snapshot();
  check(
    'city-seven-indicators',
    cityOpen.city.open === true &&
      cityOpen.city.metrics === 7 &&
      cityOpen.dom.cityCards === 7 &&
      cityOpen.city.rows === 2 &&
      cityOpen.dom.cityRows === 2,
    `${cityOpen.city.metrics} indicatori, ${cityOpen.city.rows} incidente, ${cityOpen.city.reads} citiri`,
  );
  check('city-surface', cityOpen.surfaces.city === true, `surface ${cityOpen.surfaces.city}`);
  const cityScreenshot = 'screenshots/02-city-fixture.png';
  await page.screenshot({ path: join(directory, cityScreenshot), timeout: 120000 });
  await page.keyboard.press('Escape');
  const cityClosed = await snapshot();
  check(
    'city-escape-no-read',
    cityClosed.city.open === false &&
      cityClosed.surfaces.city === false &&
      cityClosed.city.reads === 1 &&
      cityClosed.city.focusRestores === 1,
    `open ${cityClosed.city.open}, reads ${cityClosed.city.reads}`,
  );

  await page.click('#impact-run');
  const impact = await snapshot();
  check(
    'impact-10hz-no-xp',
    impact.impact.ticks === 600 &&
      impact.impact.reads === 100 &&
      impact.impact.renders === 2 &&
      impact.impact.planeUpdates === 4 &&
      impact.impact.xpLossMessages === 0 &&
      impact.impact.historyRebuilds === 0,
    `${impact.impact.ticks} tick-uri → ${impact.impact.reads} citiri, ${impact.impact.renders} randări, ${impact.impact.planeUpdates} scrieri`,
  );
  check('history-scans-zero', escaped.kpi.historyScans === 0, String(escaped.kpi.historyScans));
  check('no-page-errors', pageErrors.length === 0, `${pageErrors.length} page errors`);
  check(
    'no-console-errors',
    consoleErrors.length === 0,
    `${consoleErrors.length} console errors${consoleErrors.length === 0 ? '' : `: ${consoleErrors.slice(0, 3).join(' | ')}`}`,
  );

  // -------------------------------------------------------------------------------------
  // Live shell: the same build serves index.html; the native KPIs button and K open the
  // already mounted popup, the 070 surface is active and Escape closes it without reads.
  // -------------------------------------------------------------------------------------
  const livePage = await context.newPage(),
    livePageErrors = [],
    liveConsoleErrors = [];
  livePage.on('pageerror', (error) => livePageErrors.push(String(error)));
  livePage.on('console', (message) => {
    if (message.type() === 'error') liveConsoleErrors.push(message.text());
  });
  const liveUrl = `${origin}/?capture=1&backend=WEBGL2&preset=LOW&models=procedural&time=noon&debug=1`;
  await livePage.goto(liveUrl, { waitUntil: 'load' });
  await livePage.waitForFunction(() => globalThis.__v3Composition?.ready() === true, null, {
    timeout: 180000,
  });
  await livePage.waitForFunction(
    () => globalThis.document?.querySelector('.game-shell')?.getAttribute('data-state') === 'READY',
    null,
    { timeout: 180000 },
  );
  const play = livePage.getByRole('button', { name: 'Joacă' }),
    resumeStart = livePage.getByRole('button', { name: 'Pornește' }),
    startButton = (await play.count()) > 0 ? play : resumeStart;
  await startButton.click();
  await livePage.waitForFunction(
    () =>
      (globalThis.__v3Composition?.kpi?.()?.panel?.opens ?? 0) >= 0 &&
      (globalThis.__v3Composition?.shell?.()?.tick ?? 0) > 0,
    null,
    { timeout: 120000 },
  );
  const liveBefore = await livePage.evaluate(() => ({
      kpi: globalThis.__v3Composition.kpi(),
      shell: globalThis.__v3Composition.shell(),
    })),
    kpisButton = livePage.locator('[data-shell-action="kpis"]'),
    cityButton = livePage.locator('[data-shell-action="city"]');
  check(
    'live-buttons',
    (await kpisButton.count()) === 1 &&
      (await kpisButton.textContent()) === 'KPIs' &&
      (await cityButton.count()) === 1 &&
      (await cityButton.textContent()) === 'Oraș',
    `${await kpisButton.count()} KPIs, ${await cityButton.count()} oraș`,
  );
  check(
    'live-closed-no-read',
    liveBefore.kpi.panel.reads === 0,
    `${liveBefore.kpi.panel.reads} citiri`,
  );
  await kpisButton.click();
  await livePage.waitForFunction(
    () => globalThis.__v3Composition?.kpi?.()?.panelOpen === true,
    null,
    { timeout: 30000 },
  );
  const liveOpened = await livePage.evaluate(() => ({
      kpi: globalThis.__v3Composition.kpi(),
      shell: globalThis.__v3Composition.shell(),
      focus: globalThis.document?.activeElement?.className ?? null,
    })),
    liveScreenshot = 'screenshots/03-live-shell-kpi.png';
  await livePage.screenshot({ path: join(directory, liveScreenshot), timeout: 120000 });
  check(
    'live-open-reads-once',
    liveOpened.kpi.panelOpen === true &&
      liveOpened.kpi.panel.reads > 0 &&
      liveOpened.kpi.triggerHidden === true,
    `open ${liveOpened.kpi.panelOpen}, reads ${liveOpened.kpi.panel.reads}`,
  );
  check(
    'live-shell-surface',
    liveOpened.shell.activePanelId === 'kpis' && liveOpened.shell.surfaces.panel === true,
    `panel ${liveOpened.shell.activePanelId}, surface ${liveOpened.shell.surfaces.panel}`,
  );
  check(
    'live-focus',
    (liveOpened.focus ?? '').includes('kpi-history__close'),
    `focus ${liveOpened.focus}`,
  );
  await livePage.keyboard.press('Escape');
  await livePage.waitForFunction(
    () => globalThis.__v3Composition?.kpi?.()?.panelOpen === false,
    null,
    { timeout: 30000 },
  );
  const liveClosed = await livePage.evaluate(() => ({
    kpi: globalThis.__v3Composition.kpi(),
    shell: globalThis.__v3Composition.shell(),
    focus: globalThis.document?.activeElement?.id ?? null,
  }));
  check(
    'live-escape-close',
    liveClosed.shell.activePanelId === null && liveClosed.shell.surfaces.panel === false,
    `panel ${liveClosed.shell.activePanelId}, surface ${liveClosed.shell.surfaces.panel}, focus ${liveClosed.focus}`,
  );
  await livePage.keyboard.press('k');
  await livePage.waitForFunction(
    () => globalThis.__v3Composition?.kpi?.()?.panelOpen === true,
    null,
    { timeout: 30000 },
  );
  const liveHotkey = await livePage.evaluate(() => globalThis.__v3Composition.kpi());
  check(
    'live-k-hotkey',
    liveHotkey.panelOpen === true && liveHotkey.panel.opens === 2,
    `open ${liveHotkey.panelOpen}, opens ${liveHotkey.panel.opens}`,
  );
  await livePage.keyboard.press('Escape');
  await cityButton.click();
  await livePage.waitForFunction(
    () => globalThis.__v3Composition?.kpi?.()?.cityOpen === true,
    null,
    { timeout: 30000 },
  );
  const liveCity = await livePage.evaluate(() => ({
    kpi: globalThis.__v3Composition.kpi(),
    shell: globalThis.__v3Composition.shell(),
    cards: globalThis.document?.querySelectorAll('.city-dashboard__metric').length ?? 0,
  }));
  check(
    'live-city-seven',
    liveCity.kpi.cityOpen === true &&
      liveCity.kpi.city.dashboard.metrics === 7 &&
      liveCity.cards === 7 &&
      liveCity.shell.activePanelId === 'city',
    `${liveCity.kpi.city.dashboard.metrics} indicatori, ${liveCity.cards} carduri`,
  );
  await livePage.keyboard.press('Escape');
  const liveFinal = await livePage.evaluate(() => ({
    kpi: globalThis.__v3Composition.kpi(),
    shell: globalThis.__v3Composition.shell(),
  }));
  check(
    'live-history-scans-zero',
    liveFinal.kpi.historyScans === 0 && liveFinal.kpi.panel.lastHistoryScans === 0,
    String(liveFinal.kpi.historyScans),
  );
  check('live-no-page-errors', livePageErrors.length === 0, `${livePageErrors.length} page errors`);
  check(
    'live-no-console-errors',
    liveConsoleErrors.length === 0,
    `${liveConsoleErrors.length} console errors${liveConsoleErrors.length === 0 ? '' : `: ${liveConsoleErrors.slice(0, 3).join(' | ')}`}`,
  );

  const passed = checks.filter((entry) => entry.pass).length,
    run = {
      browser: await browser.version(),
      viewport: '1280x720',
      route: url,
      liveRoute: liveUrl,
      fixture: {
        kpi: escaped.kpi,
        city: cityClosed.city,
        impact: impact.impact,
        dom: cityClosed.dom,
      },
      live: {
        panelReadsClosed: liveBefore.kpi.panel.reads,
        panelReadsOpen: liveOpened.kpi.panel.reads,
        shellSurface: liveOpened.shell.surfaces.panel,
        citySurface: liveCity.shell.surfaces.panel,
        closedSurface: liveClosed.shell.surfaces.panel,
        activePanelId: liveOpened.shell.activePanelId,
        historyScans: liveFinal.kpi.historyScans,
      },
      screenshots: [kpiScreenshot, cityScreenshot, liveScreenshot],
      checks,
      summary: { checks: checks.length, passed, pass: passed === checks.length },
    };
  await writeResult({
    version: '267-kpi-dashboard-browser-v1',
    generatedAt,
    status: run.summary.pass ? 'PASS' : 'FAIL',
    reason: run.summary.pass ? null : 'One or more browser checks failed.',
    run,
  });
  console.log(
    `SUMMARY checks ${passed}/${checks.length}, KPI reads ${run.fixture.kpi.reads}, city metrics ${run.fixture.city.metrics}, ` +
      `impact ${run.fixture.impact.renders} renders, pass ${run.summary.pass}`,
  );
  if (!run.summary.pass) process.exitCode = 1;
} catch (error) {
  await writeResult({
    version: '267-kpi-dashboard-browser-v1',
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
