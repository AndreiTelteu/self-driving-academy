import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 152 deterministic session report.
 *
 * `npm run e2e:session` walks the whole session, writes `report.json` and `report.md`, and exits
 * non-zero when a check fails. `--check` compares the committed files with a fresh run. `--browser`
 * is the separate, optional Chromium proof: it needs Playwright (`PLAYWRIGHT_MODULE` points at its
 * entry point) and writes `browser.json` plus a screenshot; without Playwright it skips explicitly
 * and never pretends the browser ran.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '152-e2e-session'),
  defaultOutput = join(directory, 'report.json'),
  reportMarkdown = join(directory, 'report.md'),
  browserBuild = join(root, '.pbi-validation-152', 'build');

const wantsCheck = process.argv.includes('--check'),
  wantsBrowser = process.argv.includes('--browser') && !wantsCheck;

function markdown(report) {
  const steps = report.steps
    .map(
      (step) =>
        `| ${step.id} | ${step.order} | ${step.title} | ${step.contract} | ${step.checks.length} | ${step.verdict} |`,
    )
    .join('\n');
  const checks = report.steps
    .map(
      (step) =>
        `### ${step.id} — ${step.title}\n\n${step.checks
          .map(
            (check) =>
              `- \`${check.name}\`: ${JSON.stringify(check.expected)} → ${JSON.stringify(
                check.actual,
              )} (${check.tolerance.kind}${
                check.tolerance.kind === 'EXACT'
                  ? ''
                  : ` ${check.tolerance.value} ${check.tolerance.unit}`
              }), ${check.pass ? 'PASS' : 'FAIL'} — ${check.detail}`,
          )
          .join('\n')}\n`,
    )
    .join('\n');
  const limitations = report.limitations.map((entry) => `- ${entry}`).join('\n');
  const versionChecksums = report.restart.versionChecksums
    .map((checksum) => `\`${checksum}\``)
    .join(', ');

  return `# 152 — test integral de sesiune și progres

Transcript determinist generat de \`${report.generatedBy}\` cu \`${report.command}\`.
Machine-readable: [report.json](report.json).

Regula oracolului: ${report.oracleRule}

Seed fix: ${report.seed}. Două rulări independente produc același transcript; amprenta SHA-256 a
pașilor este \`${report.reproductions.digest}\`.

## Sesiunea

- sesiune: \`${report.session.sessionId}\`, jucător \`${report.session.playerId}\`, profil
  \`${report.session.profileId}\`;
- flotă: ${report.session.taxis} taxiuri și ${report.session.civilians} civile;
- drumul modurilor: ${report.session.modePath.join(' → ')};
- cursa: ${report.session.rideStates.join(' → ')};
- segmente 005 păstrate: ${report.session.segmentHistory};
- tick final: ${report.session.finalTick}.

## Pași

| Pas | Ordine | Titlu | Contract | Verificări | Verdict |
| --- | ---: | --- | --- | ---: | --- |
${steps}

Total: ${report.summary.steps} pași, ${report.summary.checks} verificări,
${report.summary.passed} pași PASS, ${report.summary.fail} FAIL, overall ${
    report.summary.pass ? 'PASS' : 'FAIL'
  }.

## Profilul și progresul după restart

Exportul 133 și bundle-ul 215 sunt scrise ca text, apoi re-citite dintr-o stare nouă:

| Buclă | Înainte | După | Amprentă |
| --- | --- | --- | --- |
| XP | ${report.restart.xpBefore.balanceXp} XP, nivel ${report.restart.xpBefore.level}, ${
    report.restart.xpBefore.entries
  } intrări | ${report.restart.xpAfter.balanceXp} XP, nivel ${report.restart.xpAfter.level}, ${
    report.restart.xpAfter.entries
  } intrări | \`${report.restart.xpFingerprint}\` |
| Daily | ${report.restart.dailyBefore.instances.length} misiuni, ${
    report.restart.dailyBefore.rewarded
  } recompensată | ${report.restart.dailyAfter.instances.length} misiuni, ${
    report.restart.dailyAfter.rewarded
  } recompensată | \`${report.restart.dailyFingerprint}\` |
| KPI | ${report.restart.kpiBefore.revenueMinorUnits} unități minore, ${
    report.restart.kpiBefore.reviews
  } recenzii | ${report.restart.kpiAfter.revenueMinorUnits} unități minore, ${
    report.restart.kpiAfter.reviews
  } recenzii | \`${report.restart.kpiFingerprint}\` |
| Flotă | ${report.restart.fleetBefore.taxis} taxiuri + ${
    report.restart.fleetBefore.civilians
  } civile pe \`${report.restart.fleetBefore.activeVersionId}\` | versiunea activă \`${
    report.restart.fleetAfterVersionId
  }\` | \`${report.restart.fleetFingerprint}\` |

- profil 133: ${report.restart.profileExportStatus}, checksum verificat
  ${report.restart.profileChecksumVerified}, ${report.restart.persistedBytes.profile} unități
  canonice;
- bundle 215: ${report.restart.economyReadStatus}, checksum verificat
  ${report.restart.economyChecksumVerified}, ${report.restart.persistedBytes.economy} unități
  canonice;
- checksum-urile versiunilor 109: ${versionChecksums}.

## Schimbarea vehiculului la mijlocul cursei

- cursa \`${report.vehicleSwitch.rideId}\` rămâne a taxiului \`${report.vehicleSwitch.taxiId}\`;
- camera trece pe \`${report.vehicleSwitch.otherTaxiId}\`, scaunul devine
  ${report.vehicleSwitch.seatAfterSwitch ?? 'null'};
- segmentul \`${report.vehicleSwitch.segmentId}\` se închide la tick-ul
  ${report.vehicleSwitch.segmentEndTick} cu motivul ${report.vehicleSwitch.closeReason};
- starea cursei rămâne ${report.vehicleSwitch.stateAfterSwitch}, tranzițiile rămân
  ${report.vehicleSwitch.transitionsAfter}, cursa activă rămâne
  ${report.vehicleSwitch.activeRidesAfter};
- assignment-ul 060 și amprenta călătoriei rămân identice.

## Verificări per pas

${checks}
## Browser

${report.browser.reason}

Când rulează, proba separată scrie [browser.json](browser.json) și
[browser-session.png](browser-session.png).

## Limitări

${limitations}
`;
}

const suite = await import(pathToFileURL(join(root, 'tests', 'e2e', 'session-e2e.ts')).href),
  report = await suite.runE2ESession(),
  json = `${JSON.stringify(report, null, 2)}\n`;

for (const step of report.steps) {
  const failed = step.checks.filter((check) => !check.pass);
  console.log(
    `${step.verdict} ${step.id} (${step.checks.length} checks${
      failed.length === 0 ? '' : `, failed: ${failed.map((check) => check.name).join(', ')}`
    })`,
  );
}
console.log(
  `SUMMARY steps ${report.summary.steps}, checks ${report.summary.checks}, passed ${report.summary.passed}, fail ${report.summary.fail}, xp ${report.restart.xpAfter.balanceXp}/level ${report.restart.xpAfter.level}, daily ${report.restart.dailyAfter.rewarded}/${report.restart.dailyAfter.instances.length}, kpi ${report.restart.kpiAfter.revenueMinorUnits}, switch ${report.vehicleSwitch.closeReason}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);

if (wantsCheck) {
  const saved = await readFile(defaultOutput, 'utf8');
  if (saved !== json) {
    console.error(`E2E session report is stale: ${defaultOutput}`);
    process.exitCode = 1;
  } else console.log(`E2E session report is current: ${defaultOutput}`);
  const markdownSaved = await readFile(reportMarkdown, 'utf8');
  if (markdownSaved !== markdown(report)) {
    console.error(`E2E session markdown is stale: ${reportMarkdown}`);
    process.exitCode = 1;
  } else console.log(`E2E session markdown is current: ${reportMarkdown}`);
} else {
  await mkdir(directory, { recursive: true });
  await writeFile(defaultOutput, json);
  await writeFile(reportMarkdown, markdown(report));
  console.log(`Wrote ${defaultOutput}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
  if (wantsBrowser && report.summary.pass) await runBrowserProof();
}

/** Real Chromium proof: fresh context, session run, reload, read-back and screenshot. */
async function runBrowserProof() {
  const explicit = process.env.PLAYWRIGHT_MODULE;
  let playwright;
  try {
    playwright = await import(explicit ? pathToFileURL(resolve(explicit)).href : 'playwright');
  } catch {
    console.log(
      'SKIP browser session: Playwright is not installed. Set PLAYWRIGHT_MODULE to its entry point.',
    );
    return;
  }
  const { build } = await import('vite');
  await build({
    configFile: false,
    root: join(root, 'tests', 'browser', 'session-e2e'),
    base: './',
    cacheDir: join(root, '.pbi-validation-152', 'cache'),
    build: { outDir: browserBuild, emptyOutDir: true },
  });

  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
  };
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== 'GET') {
        response.writeHead(405).end();
        return;
      }
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname);
      const file = resolve(browserBuild, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(browserBuild + sep) || !(await stat(file)).isFile()) {
        response.writeHead(404).end();
        return;
      }
      const data = await readFile(file);
      response.writeHead(200, {
        'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
        'Content-Length': data.length,
      });
      response.end(data);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
  const address = server.address();
  const origin = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`;

  const { chromium } = playwright.default ?? playwright;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(origin, { waitUntil: 'load' });
    await page.waitForFunction(() => globalThis.__sessionReady === true);
    const session = await page.evaluate(() => globalThis.__sessionPhase1());
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => globalThis.__sessionReady === true);
    const restart = await page.evaluate(() => globalThis.__sessionPhase2());
    await mkdir(directory, { recursive: true });
    const screenshot = join(directory, 'browser-session.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    const proof = {
      schemaVersion: 1,
      generatedBy: 'scripts/run-e2e-session-report.mjs --browser',
      browser: `Chromium ${browser.version()}`,
      viewport: '1440x900',
      profile: 'new browser context with empty storage',
      session,
      restart,
      pageErrors: errors,
      pass: errors.length === 0 && restart.pass === true,
      note: 'Un context de browser nou este profilul nou; reîncărcarea paginii este restartul; IndexedDB păstrează documentele exportate între cele două încărcări.',
    };
    await writeFile(join(directory, 'browser.json'), `${JSON.stringify(proof, null, 2)}\n`);
    console.log(`Browser proof: ${proof.pass ? 'PASS' : 'FAIL'}, ${screenshot}`);
    if (!proof.pass) process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
}
