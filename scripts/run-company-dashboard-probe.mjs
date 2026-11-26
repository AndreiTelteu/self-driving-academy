import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 270 browser probe.
 *
 * The page is a real Chrome page built by Vite from `tests/ui/company-dashboard-fixture.html`. It
 * mounts the real 270 panel over the real 268 ledger and 269 evolution (same modules, no stub
 * company), clicks the native purchase/upgrade/confirm buttons, then advances one simulated month
 * and verifies that the next month's service cost and profit reflect the versioned modifier.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '270-company-dashboard'),
  browserJson = join(directory, 'browser.json'),
  browserMarkdown = join(directory, 'browser.md'),
  screenshots = join(directory, 'screenshots'),
  buildDirectory = join(root, '.pbi-validation-270', 'dashboard-probe');

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
    return `# 270 — proba de browser a panoului companiei

Generată de \`npm run company:dashboard:probe\`.

**NOT_RUN** — ${result.reason}

Nu este raportat niciun PASS simulat. Proiecția, refuzurile și costul panoului sunt probate
determinist în [report.md](report.md).
`;
  const run = result.run,
    checks = run.checks
      .map((entry) => `- \`${entry.name}\`: ${entry.pass ? 'PASS' : 'FAIL'} — ${entry.detail}`)
      .join('\n');
  return `# 270 — proba de browser a panoului companiei

Generată de \`npm run company:dashboard:probe\`; Chromium ${run.browser}, viewport ${run.viewport},
tick ${run.tick}.

Două pagini reale din același build:

1. \`tests/ui/company-dashboard-fixture.html\`: panoul real 270 peste ledgerul real 268 și evoluția
   reală 269. Proba a deschis panoul, a verificat focusul și Tab, a cumpărat un taxi, a cumpărat
   upgrade-ul de service, a avansat la luna simulată următoare și a citit profitul acelei luni.
2. \`index.html\`: buildul jocului. Butonul nativ \`Companie\` din shell a deschis dialogul prin
   \`src/main.ts\`, suprafața 070 a fost activă, iar Escape a închis panoul fără citiri cât timp a
   fost închis.

| Metric | Value |
| --- | ---: |
| Cash before / after purchase | ${run.cashBefore} / ${run.cashAfterPurchase} SDA |
| Cash after upgrade | ${run.cashAfterUpgrade} SDA |
| Level before / after purchase | ${run.levelBefore} / ${run.levelAfterPurchase} |
| Taxis before / after purchase | ${run.taxisBefore} / ${run.taxisAfterPurchase} |
| Service month 0 → next month | ${run.serviceMonth0} → ${run.serviceNextMonth} SDA |
| Next month revenue / profit | ${run.revenueNextMonth} / ${run.profitNextMonth} SDA |
| Pending effects before / after | ${run.pendingBefore} / ${run.pendingAfter} |
| Panel reads closed / after open | ${run.closedReads} / ${run.openReads} |
| Live shell reads closed / after open | ${run.liveShell.panelReadsClosed} / ${run.liveShell.panelReadsOpen} |
| Live surface open / closed | ${run.liveShell.surface} / ${run.liveShell.closedSurface} |
| historyScans | ${run.historyScans} |
| XP / economy / profile writes | ${run.xpWrites} / ${run.economyWrites} / ${run.profileWrites} |

Capturi: ${run.screenshots.map((file) => `[${file}](${file})`).join(', ')}.

${checks}

Limitări: proba de fixture rulează modulele reale 268/269/270, nu o lume Babylon completă; proba
live deschide buildul real și verifică doar montarea, suprafața și focusul, nu cumpără upgrade-ul în
lumea live (nivelul și profitul live nu sunt pregătite pentru asta). Nu măsoară FPS/GPU și nu
înlocuiește gate-ul 287.
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
    version: '270-company-dashboard-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason:
      'Playwright is not installed in this checkout (no `playwright` module and no PLAYWRIGHT_MODULE); the browser probe was not run.',
    run: null,
  });
  console.log('Company dashboard browser probe NOT_RUN: Playwright is not installed.');
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
        dashboard: join(root, 'tests', 'ui', 'company-dashboard-fixture.html'),
      },
    },
  },
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
      args: channel === undefined ? ['--disable-gpu-sandbox'] : ['--disable-gpu-sandbox'],
    });
    break;
  } catch (error) {
    launchError = error;
  }
}
if (browser === null) {
  await writeResult({
    version: '270-company-dashboard-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason: `Browser launch failed: ${launchError instanceof Error ? launchError.message : String(launchError)}`,
    run: null,
  });
  server.close();
  console.log('Company dashboard browser probe NOT_RUN: browser launch failed.');
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
  const url = `${origin}/tests/ui/company-dashboard-fixture.html`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => globalThis.__companyDashboardProbe?.ready === true, null, {
    timeout: 120000,
  });
  const checks = [],
    check = (name, pass, detail) => checks.push({ name, pass, detail }),
    snapshot = () => page.evaluate(() => globalThis.__companyDashboardProbe.snapshot());

  const closed = await snapshot();
  check(
    'closed-no-read',
    closed.stats.reads === 0 && closed.stats.renders === 0 && closed.open === false,
    `reads ${closed.stats.reads}, renders ${closed.stats.renders}, open ${closed.open}`,
  );
  await page.click('#company-trigger');
  const opened = await snapshot(),
    focused = await page.evaluate(
      () => globalThis.document?.activeElement?.getAttribute('data-company-focus') ?? null,
    );
  check(
    'open-reads-once',
    opened.open === true && opened.stats.reads === 1 && opened.stats.renders === 1,
    `open ${opened.open}, reads ${opened.stats.reads}, renders ${opened.stats.renders}`,
  );
  check('open-surface', opened.surfaceOpen === true, `surface ${opened.surfaceOpen}`);
  check('open-focus', focused === 'close', `focus ${focused}`);
  check(
    'panel-dialog',
    (await page.getByRole('dialog').count()) === 1,
    `${await page.getByRole('dialog').count()} dialogs`,
  );
  await page.keyboard.press('Tab');
  const tabFocus = await page.evaluate(
    () => globalThis.document?.activeElement?.getAttribute('data-company-focus') ?? null,
  );
  check('tab-body', tabFocus === 'body', `focus ${tabFocus}`);
  await page.keyboard.press('Escape');
  const escaped = await snapshot(),
    escapedFocus = await page.evaluate(() => globalThis.document?.activeElement?.id ?? null);
  check(
    'escape-closes',
    escaped.open === false && escaped.surfaceOpen === false && escaped.stats.escapes === 1,
    `open ${escaped.open}, surface ${escaped.surfaceOpen}, escapes ${escaped.stats.escapes}`,
  );
  check('escape-restores-focus', escapedFocus === 'company-trigger', `focus ${escapedFocus}`);

  await page.click('#company-trigger');
  const offerId = await page.evaluate(() => globalThis.__companyDashboardProbe.offerId),
    upgradeId = await page.evaluate(() => globalThis.__companyDashboardProbe.upgradeId),
    purchaseSelector = `[data-company-action="purchase"][data-company-key="offer:${offerId}"]`;
  await page.locator(purchaseSelector).click();
  const confirmationText = await page.locator('.company-dashboard__confirmation').textContent();
  check(
    'purchase-confirmation',
    (confirmationText ?? '').includes('Confirmă cumpărarea') &&
      (confirmationText ?? '').includes('12000 SDA'),
    confirmationText ?? '',
  );
  await page.locator('[data-company-action="confirm"]').click();
  const afterPurchase = await snapshot();
  check(
    'purchase-accepted',
    afterPurchase.stats.acceptedPurchases === 1 &&
      afterPurchase.cashMinorUnits === 43_100 &&
      afterPurchase.level === 2 &&
      afterPurchase.fleetTaxis === 21,
    `purchases ${afterPurchase.stats.acceptedPurchases}, cash ${afterPurchase.cashMinorUnits}, level ${afterPurchase.level}, taxis ${afterPurchase.fleetTaxis}`,
  );
  check(
    'purchase-owned',
    afterPurchase.offers.find((offer) => offer.offerId === offerId)?.state === 'OWNED',
    afterPurchase.offers.find((offer) => offer.offerId === offerId)?.state ?? 'missing',
  );

  await page
    .locator(`[data-company-action="upgrade"][data-company-key="upgrade:${upgradeId}"]`)
    .click();
  const upgradeConfirmation = await page.locator('.company-dashboard__confirmation').textContent();
  check(
    'upgrade-confirmation',
    (upgradeConfirmation ?? '').includes('8000 SDA') &&
      (upgradeConfirmation ?? '').includes('Reduce costul Serviciu cu 50%'),
    upgradeConfirmation ?? '',
  );
  await page.locator('[data-company-action="confirm"]').click();
  const afterUpgrade = await snapshot();
  check(
    'upgrade-accepted',
    afterUpgrade.stats.acceptedUpgrades === 1 &&
      afterUpgrade.pendingEffects.some(
        (effect) => effect.category === 'SERVICE' && effect.basisPoints === 5_000,
      ) &&
      afterUpgrade.upgrades.find((upgrade) => upgrade.upgradeId === upgradeId)?.state === 'OWNED',
    `upgrades ${afterUpgrade.stats.acceptedUpgrades}, pending ${afterUpgrade.pendingEffects.length}`,
  );

  const next = await page.evaluate(() => globalThis.__companyDashboardProbe.nextMonth());
  check(
    'next-month-service',
    next.month?.periodId === 'm0003' && next.month?.service === 80,
    `${next.month?.periodId ?? 'missing'} service ${next.month?.service ?? 'missing'}`,
  );
  check(
    'next-month-profit',
    next.month?.revenue === 5_200 && next.month?.profit === 700 && next.pendingEffects.length === 0,
    `revenue ${next.month?.revenue}, profit ${next.month?.profit}, pending ${next.pendingEffects.length}`,
  );
  check('history-scans', next.historyScans === 0, String(next.historyScans));
  check(
    'no-xp-economy-profile-writes',
    next.xpWrites === 0 && next.economyWrites === 0 && next.profileWrites === 0,
    `${next.xpWrites}/${next.economyWrites}/${next.profileWrites}`,
  );
  check('listeners', next.stats.listeners === 2, String(next.stats.listeners));
  check('global-listeners', next.stats.globalListeners === 0, String(next.stats.globalListeners));
  check('no-page-errors', pageErrors.length === 0, `${pageErrors.length} page errors`);
  check(
    'no-console-errors',
    consoleErrors.length === 0,
    `${consoleErrors.length} console errors${consoleErrors.length === 0 ? '' : `: ${consoleErrors.slice(0, 3).join(' | ')}`}`,
  );

  const screenshot = 'screenshots/01-company-dashboard.png';
  await page.screenshot({ path: join(directory, screenshot), timeout: 120000 });

  // ---------------------------------------------------------------------------------------
  // Live shell integration: the same build also serves index.html; the native Company button
  // must open the panel through src/main.ts and the shell surface, without a second company.
  // ---------------------------------------------------------------------------------------
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
    () => (globalThis.__v3Composition?.company?.()?.evolution?.tick ?? 0) > 0,
    null,
    { timeout: 120000 },
  );
  const liveBefore = await livePage.evaluate(() => ({
      panel: globalThis.__v3Composition.company().panel,
      evolutionTick: globalThis.__v3Composition.company().evolution?.tick ?? 0,
    })),
    companyButton = livePage.locator('[data-shell-action="company"]');
  check(
    'live-company-button',
    (await companyButton.count()) === 1 && (await companyButton.textContent()) === 'Companie',
    `${await companyButton.count()} company buttons`,
  );
  check(
    'live-closed-no-read',
    liveBefore.panel.reads === 0,
    `reads ${liveBefore.panel.reads} while closed`,
  );
  await companyButton.click();
  await livePage.waitForFunction(
    () => globalThis.__v3Composition?.company?.()?.panelOpen === true,
    null,
    { timeout: 30000 },
  );
  const liveOpened = await livePage.evaluate(() => ({
      company: globalThis.__v3Composition.company(),
      shell: globalThis.__v3Composition.shell(),
      focus: globalThis.document?.activeElement?.getAttribute('data-company-focus') ?? null,
    })),
    liveScreenshot = 'screenshots/02-live-shell-company.png';
  await livePage.screenshot({ path: join(directory, liveScreenshot), timeout: 120000 });
  check(
    'live-panel-open',
    liveOpened.company.panelOpen === true &&
      liveOpened.company.panel.open === true &&
      liveOpened.company.panel.reads > 0,
    `open ${liveOpened.company.panelOpen}, reads ${liveOpened.company.panel.reads}`,
  );
  check(
    'live-shell-surface',
    liveOpened.shell.activePanelId === 'company' && liveOpened.shell.surfaces.panel === true,
    `panel ${liveOpened.shell.activePanelId}, surface ${liveOpened.shell.surfaces.panel}`,
  );
  check('live-focus', liveOpened.focus === 'close', `focus ${liveOpened.focus}`);
  await livePage.keyboard.press('Escape');
  await livePage.waitForFunction(
    () => globalThis.__v3Composition?.company?.()?.panelOpen === false,
    null,
    { timeout: 30000 },
  );
  const liveClosed = await livePage.evaluate(() => globalThis.__v3Composition.shell());
  check(
    'live-escape-close',
    liveClosed.activePanelId === null && liveClosed.surfaces.panel === false,
    `panel ${liveClosed.activePanelId}, surface ${liveClosed.surfaces.panel}`,
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
      viewport: '1440x900',
      route: url,
      liveRoute: liveUrl,
      tick: next.tick,
      cashBefore: closed.cashMinorUnits,
      cashAfterPurchase: afterPurchase.cashMinorUnits,
      cashAfterUpgrade: afterUpgrade.cashMinorUnits,
      levelBefore: closed.level,
      levelAfterPurchase: afterPurchase.level,
      taxisBefore: closed.fleetTaxis,
      taxisAfterPurchase: afterPurchase.fleetTaxis,
      serviceMonth0: next.serviceMonth0,
      serviceNextMonth: next.month?.service ?? null,
      revenueNextMonth: next.month?.revenue ?? null,
      profitNextMonth: next.month?.profit ?? null,
      pendingBefore: afterPurchase.pendingEffects.length,
      pendingAfter: afterUpgrade.pendingEffects.length,
      closedReads: closed.stats.reads,
      openReads: opened.stats.reads,
      historyScans: next.historyScans,
      xpWrites: next.xpWrites,
      economyWrites: next.economyWrites,
      profileWrites: next.profileWrites,
      liveShell: {
        evolutionTick: liveBefore.evolutionTick,
        panelReadsClosed: liveBefore.panel.reads,
        panelReadsOpen: liveOpened.company.panel.reads,
        activePanelId: liveOpened.shell.activePanelId,
        surface: liveOpened.shell.surfaces.panel,
        closedSurface: liveClosed.surfaces.panel,
      },
      screenshots: [screenshot, liveScreenshot],
      checks,
      summary: { checks: checks.length, passed, pass: passed === checks.length },
    };
  await writeResult({
    version: '270-company-dashboard-browser-v1',
    generatedAt,
    status: run.summary.pass ? 'PASS' : 'FAIL',
    reason: run.summary.pass ? null : 'One or more browser checks failed.',
    run,
  });
  console.log(
    `SUMMARY checks ${passed}/${checks.length}, cash ${run.cashBefore}->${run.cashAfterPurchase}->${run.cashAfterUpgrade}, ` +
      `service ${run.serviceMonth0}->${run.serviceNextMonth}, profit ${run.profitNextMonth}, ` +
      `pass ${run.summary.pass}`,
  );
  if (!run.summary.pass) process.exitCode = 1;
} catch (error) {
  await writeResult({
    version: '270-company-dashboard-browser-v1',
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
