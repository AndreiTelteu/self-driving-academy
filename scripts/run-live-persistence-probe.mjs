import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 278 browser probe.
 *
 * It starts the real build, waits for the real company/economy to produce revenue, credits real
 * 213 active-time windows through the live daily owner, exports a `.sdasave`, mutates XP and (when
 * the AI settles another ride) company revenue, imports the file through preview + confirmation,
 * verifies XP/company restored and the KPI slot preserved, reloads the page and verifies the
 * autosave restores the same generation paused/AUTO with no offline income, then imports the file a
 * second time and checks that XP, daily rewards and company revenue do not change.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '278-live-persistence'),
  browserJson = join(directory, 'browser.json'),
  reportMarkdown = join(directory, 'browser.md'),
  screenshots = join(directory, 'screenshots'),
  saveFile = join(directory, 'probe.sdasave'),
  buildDirectory = join(root, '.pbi-validation-278', 'build');

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
    return `# 278 — proba de browser a persistenței live

Generată de \`npm run save:live:probe\`.

**${result.status}** — ${result.reason}

Nu este raportat niciun PASS simulat. Raportul determinist acoperă contractele 225/278.
`;
  }
  const run = result.run;
  const checks = run.checks
    .map((entry) => `- \`${entry.name}\`: ${entry.pass ? 'PASS' : 'FAIL'} — ${entry.detail}`)
    .join('\n');
  return `# 278 — proba de browser a persistenței live

Generată de \`npm run save:live:probe\`; Chrome ${run.browser}, backend ${run.backend},
viewport ${run.viewport}, tick ${run.tickAtExport}.

- Fișier: \`${run.fileName}\` (${run.bytes} bytes), checksum \`${run.checksum}\`.
- Generație: ${run.generation}, tick ${run.checkpointTick}, corp 225 ${run.bodyBytes} bytes.
- Autosave: tick simulat ${run.simulatedTick}, ultimul tick salvat ${run.lastSavedTick},
  cost commit ${run.commitMs} ms.
- XP: ${run.xpBefore} → ${run.xpMutated} → ${run.xpAfterImport} (fingerprint
  \`${run.xpFingerprintBefore}\` → \`${run.xpFingerprintAfter}\`).
- KPI: zile ${run.kpiDays}, fingerprint \`${run.kpiFingerprint}\`; păstrat în slot după import/reload:
  ${run.kpiPreserved}.
- Companie: revenue ${run.companyRevenueBefore} → ${run.companyRevenueAfterImport}
  (fingerprint \`${run.companyFingerprintBefore}\` → \`${run.companyFingerprintAfter}\`);
  modificată înainte de import: ${run.companyMutated}.
- Reload: ${run.reloadRestored}, XP ${run.reloadXp}, companie ${run.reloadCompany}, launch
  ${run.reloadLaunch}, offline income ${run.reloadOfflineIncome}.
- Al doilea import: ΔXP ${run.secondImportXpDelta}, Δ daily ${run.secondImportDailyDelta}, companie
  neschimbată ${run.secondImportCompanyStable}.
- Refuzuri: checksum \`${run.invalidCode}\`, confirmare \`${run.previewRequiredCode}\`.
- Panou: Salvează/Încarcă ${run.panelActions.join(', ')}; ${run.shellListeners} listeneri în shell,
  0 globali.

Capturi: ${run.screenshots.map((file) => `[${file}](${file})`).join(', ')}.

${checks}

Limite: proba este Chrome headless/WEBGL2 și nu înlocuiește un playtest uman. KPI-ul 209 este un slot
read-only: fișierul îl păstrează și îl verifică prin fingerprint, dar ledgerul live 209 nu este
rehidratat (owner-ul 266 nu expune restore); compania 268/269 este reconstruită prin replay real.
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
    version: '278-live-persistence-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason:
      'Playwright is not installed in this checkout (no `playwright` module and no PLAYWRIGHT_MODULE); the browser probe was not run.',
    run: null,
  });
  console.log('Live persistence browser probe NOT_RUN: Playwright is not installed.');
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
    version: '278-live-persistence-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason: `Browser launch failed: ${launchError instanceof Error ? launchError.message : String(launchError)}`,
    run: null,
  });
  server.close();
  console.log('Live persistence browser probe NOT_RUN: browser launch failed.');
  process.exit(0);
}

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
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const waitUntil = async (predicate, argument, timeout, label) => {
    const deadline = Date.now() + timeout;
    for (;;) {
      if (await page.evaluate(predicate, argument)) return;
      if (Date.now() > deadline) {
        const shell = await page.evaluate(() => globalThis.__v3Composition?.shell?.() ?? null);
        throw new Error(
          `Timeout waiting for ${label}: shell ${shell?.paused}/${shell?.cause ?? 'none'} tick ${shell?.tick}, errors ${pageErrors.slice(-3).join(' | ')}`,
        );
      }
      await page.waitForTimeout(150);
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

  await waitUntil(
    () => globalThis.__v3Composition?.ready?.() === true,
    null,
    120000,
    'composition ready',
  );
  const playDeadline = Date.now() + 120000;
  for (;;) {
    const tick = await page.evaluate(() => globalThis.__v3Composition?.shell?.()?.tick ?? 0);
    if (tick > 60) break;
    if (Date.now() > playDeadline)
      throw new Error(`Timeout waiting for first live ticks (tick ${tick})`);
    const reia = page.getByRole('button', { name: 'Reia' });
    if ((await reia.count()) > 0) await reia.click().catch(() => {});
    const start = page.getByRole('button', { name: 'Start' });
    if ((await start.count()) > 0) await start.click().catch(() => {});
    const skipTutorial = page.getByRole('button', { name: 'Sari peste tutorial' });
    if ((await skipTutorial.count()) > 0) await skipTutorial.click().catch(() => {});
    await page.waitForTimeout(250);
  }
  screenshotsTaken.push(await shot('01-live-before-save'));

  // Real AI revenue is produced by the same 266/268 owners; wait for at least one settlement.
  await waitUntil(
    () => {
      const read = globalThis.__v3Composition?.company?.()?.read;
      return (
        typeof read?.totals?.revenueMinorUnits === 'number' && read.totals.revenueMinorUnits > 0
      );
    },
    null,
    180000,
    'company revenue',
  );

  await page.evaluate(() => globalThis.__v3Composition.probeActiveXp(120));
  await page.evaluate(async () => globalThis.__v3Composition.persistenceSaveNow());
  const exported = await page.evaluate(() => globalThis.__v3Composition.persistenceExport());
  if (exported?.status !== 'ACCEPTED')
    throw new Error(
      `Export refused: ${exported?.rejection?.code} ${exported?.rejection?.message} ${exported?.rejection?.path}`,
    );
  await writeFile(saveFile, exported.text);

  const before = await page.evaluate(() => {
    const c = globalThis.__v3Composition;
    return {
      xp: c.progress()?.read?.player?.xpBalance ?? null,
      xpFingerprint: c.progress()?.read?.xpFingerprint ?? null,
      company: c.company()?.read?.totals ?? null,
      companyFingerprint:
        c.persistence()?.status?.lastCycle?.summary?.fingerprints?.company ?? null,
      kpiDays: c.economy()?.snapshot?.kpi?.days?.length ?? 0,
      kpiFingerprint:
        c.persistence()?.status?.lastCycle?.summary?.fingerprints?.kpi ??
        exported.summary.fingerprints.kpi,
      shell: c.shell(),
      persistence: c.persistence()?.status,
    };
  });

  const invalid = await page.evaluate(
    (text) =>
      globalThis.__v3Composition.persistencePreview(text.replace('"checksum":"', '"checksum":"0')),
    exported.text,
  );
  const previewRequired = await page.evaluate(async (text) => {
    const c = globalThis.__v3Composition;
    c.persistencePreview(text);
    return c.persistence()?.status?.lastImport ?? null;
  }, exported.text);

  // Mutate XP through the real 213 owner and let the live company settle at least one more AI ride
  // when it happens; the probe records whether the company actually changed.
  await page.evaluate(() => globalThis.__v3Composition.probeActiveXp(120));
  await page.waitForTimeout(8000);
  const mutated = await page.evaluate(() => {
    const c = globalThis.__v3Composition;
    return {
      xp: c.progress()?.read?.player?.xpBalance ?? null,
      company: c.company()?.read?.totals ?? null,
    };
  });

  // Open the native load surface for the screenshot before importing.
  await page.getByRole('button', { name: 'Încarcă jocul din fișier' }).click();
  screenshotsTaken.push(await shot('02-load-preview'));
  const panelActions = await page.evaluate(() =>
    [...globalThis.document.querySelectorAll('[data-shell-save] button')].map(
      (button) => button.textContent,
    ),
  );
  const preview = await page.evaluate(
    (text) => globalThis.__v3Composition.persistencePreview(text),
    exported.text,
  );
  if (preview?.status !== 'PREVIEW') throw new Error(`Preview refused: ${JSON.stringify(preview)}`);
  const importedUi = await page.evaluate(() => globalThis.__v3Composition.persistenceConfirm());
  const imported = await page.evaluate(
    () => globalThis.__v3Composition.persistence()?.status?.lastImport ?? null,
  );
  if (imported?.status !== 'COMMITTED') throw new Error(`Import refused: ${importedUi?.message}`);
  const afterImport = await page.evaluate(() => {
    const c = globalThis.__v3Composition;
    return {
      xp: c.progress()?.read?.player?.xpBalance ?? null,
      xpFingerprint: c.progress()?.read?.xpFingerprint ?? null,
      company: c.company()?.read?.totals ?? null,
      companyFingerprint: c.persistence()?.status?.lastImport?.companyFingerprint ?? null,
      kpiFingerprint: c.persistence()?.status?.lastImport?.kpiFingerprint ?? null,
      lifecycle: c.lifecycle(),
    };
  });
  screenshotsTaken.push(await shot('03-after-import'));

  const secondPreview = await page.evaluate(
    (text) => globalThis.__v3Composition.persistencePreview(text),
    exported.text,
  );
  await page.evaluate(() => globalThis.__v3Composition.persistenceConfirm());
  const secondImport = await page.evaluate(
    () => globalThis.__v3Composition.persistence()?.status?.lastImport ?? null,
  );
  const second = await page.evaluate(() => {
    const c = globalThis.__v3Composition;
    return {
      xp: c.progress()?.read?.player?.xpBalance ?? null,
      company: c.company()?.read?.totals ?? null,
      companyFingerprint: c.persistence()?.status?.lastImport?.companyFingerprint ?? null,
      dailyRewards: c.progress()?.read?.daily?.rewards ?? null,
      status: c.persistence()?.status,
    };
  });

  // Real reload: the autosave row is the only source after a new page context.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitUntil(
    () => globalThis.__v3Composition?.ready?.() === true,
    null,
    120000,
    'composition ready after reload',
  );
  await waitUntil(
    () => globalThis.__v3Composition?.persistence?.()?.restored !== null,
    null,
    60000,
    'autosave restored after reload',
  );
  const reloaded = await page.evaluate(() => {
    const c = globalThis.__v3Composition;
    const persistence = c.persistence();
    return {
      restored: persistence?.restored,
      xp: c.progress()?.read?.player?.xpBalance ?? null,
      xpFingerprint: c.progress()?.read?.xpFingerprint ?? null,
      company: c.company()?.read?.totals ?? null,
      companyFingerprint: persistence?.restored?.fingerprints?.company ?? null,
      kpiFingerprint: persistence?.restored?.fingerprints?.kpi ?? null,
      shell: c.shell(),
      lifecycle: c.lifecycle(),
      status: persistence?.status,
    };
  });
  screenshotsTaken.push(await shot('04-after-reload'));

  const xpBefore = before.xp;
  const xpMutated = mutated.xp;
  const xpAfter = afterImport.xp;
  const companyBefore = before.company?.revenueMinorUnits ?? null;
  const companyAfter = afterImport.company?.revenueMinorUnits ?? null;
  const companyMutated = (mutated.company?.revenueMinorUnits ?? 0) > (companyBefore ?? 0);
  const reloadLaunch = reloaded.restored?.resume?.launch ?? null;
  const reloadOfflineIncome = reloaded.restored?.resume?.offlineIncome ?? null;
  const secondImportXpDelta = secondImport?.xpDelta ?? null;
  const secondImportDailyDelta = secondImport?.dailyRewardsDelta ?? null;
  const companyFingerprintBefore = exported.summary.fingerprints.company;
  const kpiFingerprint = exported.summary.fingerprints.kpi;
  const shellListeners = await page.evaluate(
    () => globalThis.__v3Composition.shellHost().listeners,
  );

  check('export accepted', exported.status === 'ACCEPTED', exported.checksum);
  check('checksum length', exported.checksum.length === 64, exported.checksum);
  check('file bytes', exported.bytes > 0 && exported.bytes <= 1048576, `${exported.bytes} bytes`);
  check('XP before', xpBefore > 0, String(xpBefore));
  check('KPI days', before.kpiDays > 0, String(before.kpiDays));
  check('company revenue before', (companyBefore ?? 0) > 0, String(companyBefore));
  check(
    'invalid checksum refused',
    invalid?.status === 'ERROR' && String(invalid?.message ?? '').includes('CHECKSUM_MISMATCH'),
    invalid?.message ?? null,
  );
  check(
    'preview accepted',
    preview?.status === 'PREVIEW' && previewRequired === null,
    'preview accepted, no implicit import',
  );
  check('XP mutated before import', xpMutated > xpBefore, `${xpBefore} -> ${xpMutated}`);
  check(
    'company mutated before import',
    companyMutated,
    `${companyBefore} -> ${mutated.company?.revenueMinorUnits}`,
  );
  check('import committed', imported?.status === 'COMMITTED', imported?.checksum);
  check('XP restored', xpAfter === xpBefore, `${xpAfter}`);
  check(
    'company restored',
    companyAfter === companyBefore && afterImport.companyFingerprint === companyFingerprintBefore,
    `${companyAfter}`,
  );
  check(
    'KPI slot preserved',
    afterImport.kpiFingerprint === kpiFingerprint,
    afterImport.kpiFingerprint,
  );
  check(
    'launch after import',
    imported?.launch?.launch === 'PAUSED_AUTO',
    imported?.launch?.launch,
  );
  check('second import XP delta', secondImportXpDelta === 0, String(secondImportXpDelta));
  check(
    'second preview accepted',
    secondPreview?.status === 'PREVIEW',
    secondPreview?.message ?? null,
  );
  check('second import daily delta', secondImportDailyDelta === 0, String(secondImportDailyDelta));
  check(
    'second import company stable',
    second.companyFingerprint === afterImport.companyFingerprint,
    second.companyFingerprint,
  );
  check('reload restored', reloaded.restored !== null, reloaded.restored?.checksum ?? null);
  check('reload XP', reloaded.xp === xpBefore, `${reloaded.xp}`);
  check(
    'reload company',
    reloaded.companyFingerprint === companyFingerprintBefore &&
      reloaded.company?.revenueMinorUnits === companyBefore,
    `${reloaded.company?.revenueMinorUnits}`,
  );
  check('reload KPI slot', reloaded.kpiFingerprint === kpiFingerprint, reloaded.kpiFingerprint);
  check('reload paused launch', reloadLaunch === 'PAUSED_AUTO', String(reloadLaunch));
  check('reload no offline income', reloadOfflineIncome === 0, String(reloadOfflineIncome));
  check('shell listeners', shellListeners > 0, String(shellListeners));

  const passed = checks.filter((entry) => entry.pass).length;
  result = {
    version: '278-live-persistence-browser-v1',
    generatedAt,
    status: passed === checks.length ? 'PASS' : 'FAIL',
    reason: passed === checks.length ? null : `${checks.length - passed} checks failed`,
    run: {
      browser: browser.version(),
      backend: 'WEBGL2',
      viewport: '1024x640',
      tickAtExport: before.shell?.tick ?? null,
      fileName: exported.fileName,
      checksum: exported.checksum,
      bytes: exported.bytes,
      bodyBytes: exported.summary.bodyBytes,
      generation: exported.summary.generation,
      checkpointTick: exported.summary.tick,
      simulatedTick: before.persistence?.simulated?.tick ?? null,
      lastSavedTick: before.persistence?.simulated?.lastSavedTick ?? null,
      commitMs: before.persistence?.saveTime?.lastCommitMs ?? null,
      xpBefore,
      xpMutated,
      xpAfterImport: xpAfter,
      xpFingerprintBefore: before.xpFingerprint,
      xpFingerprintAfter: afterImport.xpFingerprint,
      kpiDays: before.kpiDays,
      kpiFingerprint,
      kpiPreserved:
        afterImport.kpiFingerprint === kpiFingerprint && reloaded.kpiFingerprint === kpiFingerprint,
      companyRevenueBefore: companyBefore,
      companyRevenueAfterImport: companyAfter,
      companyFingerprintBefore,
      companyFingerprintAfter: afterImport.companyFingerprint,
      companyMutated,
      invalidCode:
        invalid?.status === 'ERROR' && String(invalid?.message ?? '').includes('CHECKSUM_MISMATCH')
          ? 'CHECKSUM_MISMATCH'
          : (invalid?.message ?? null),
      previewRequiredCode: null,
      reloadRestored: reloaded.restored !== null,
      reloadXp: reloaded.xp,
      reloadCompany: reloaded.companyFingerprint,
      reloadLaunch,
      reloadOfflineIncome,
      secondImportXpDelta,
      secondImportDailyDelta,
      secondImportCompanyStable: second.companyFingerprint === afterImport.companyFingerprint,
      panelActions,
      shellListeners,
      pageErrors,
      consoleErrors,
      screenshots: screenshotsTaken,
      checks,
      checksPassed: passed,
    },
  };
  await writeResult(result);
  console.log(`Persistence browser probe ${result.status}: ${passed}/${checks.length}`);
  if (result.status !== 'PASS') process.exitCode = 1;
} catch (error) {
  await writeResult({
    version: '278-live-persistence-browser-v1',
    generatedAt,
    status: 'ERROR',
    reason: error instanceof Error ? error.message : String(error),
    run: null,
  });
  console.error('Persistence browser probe ERROR:', error);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
