import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 236 — raportul determinist al compunerii V3 și proba de browser.
 *
 * `npm run composition:report` scrie `Docs/Evidence/236-browser-composition/report.json` și
 * `report.md`. `--check` refuză un raport neactualizat. `--browser` construiește aplicația reală,
 * o rulează în Chromium (WebGL2 prin SwiftShader, dacă mediul îl oferă), apasă taste reale și scrie
 * `browser.json` + capturi. Fără Playwright sau fără WebGL2, proba este `NOT_RUN` cu motivul real,
 * niciodată simulată.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '236-browser-composition'),
  reportJson = join(directory, 'report.json'),
  reportMarkdown = join(directory, 'report.md'),
  browserJson = join(directory, 'browser.json'),
  screenshots = join(directory, 'screenshots'),
  browserBuild = join(root, '.pbi-validation-236', 'build');

const wantsCheck = process.argv.includes('--check'),
  wantsBrowser = process.argv.includes('--browser') && !wantsCheck;

function code(value) {
  return value === null || value === undefined ? '—' : `\`${value}\``;
}

function verdict(value) {
  return value ? 'PASS' : 'FAIL';
}

async function readBrowserProof() {
  try {
    return JSON.parse(await readFile(browserJson, 'utf8'));
  } catch {
    return null;
  }
}

function browserSection(browser) {
  if (!browser) {
    return [
      '## Proba de browser',
      '',
      '**NOT_RUN** — proba de browser nu a fost executată încă (`npm run composition:report -- --browser`).',
      'Rețeta manuală: `npm run dev`, deschide pagina, apasă „Pornește”, apoi tastele reale',
      '`W` (mers), `W`+`F` (alergare), `G` (intră în taxi), `W`/`A`/`D` (conducere), `S` (oprire),',
      '`G` (ieșire), `W` (revenire la mers).',
      '',
    ].join('\n');
  }
  if (browser.status !== 'MEASURED') {
    return [
      '## Proba de browser',
      '',
      `**NOT_RUN** — ${browser.reason}.`,
      '',
      'Rețeta manuală: `npm run dev`, butonul „Pornește”, apoi `W`, `F`, `G`, `S` conform tabelului',
      'de taste din HUD.',
      '',
    ].join('\n');
  }
  const cost = browser.cost;
  return [
    '## Proba de browser',
    '',
    `Browser: **${browser.browser}**, backend **${browser.backend.rendererKind}**` +
      ` (WebGL ${browser.backend.webGLVersion ?? '—'}, ${browser.backend.renderer}).`,
    `Capturi: ${browser.screenshots.map((file) => `[${file}](${file})`).join(', ')}.`,
    '',
    '| Secvență | Taste reale | Entitate controlată | Mod | Clip | Poziție (x,z) | Verdict |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...browser.steps.map(
      (step) =>
        `| ${step.sequence} | \`${step.keys}\` | ${code(step.controlledEntity)} | ${code(
          step.mode,
        )} | ${code(step.clipId)} | ${step.position} | ${verdict(step.pass)} |`,
    ),
    '',
    '### Cost măsurat în browser (software, nu hardware)',
    '',
    '| Metrică | eșantioane | medie ms | p50 ms | p95 ms | max ms |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    `| Tick de compunere | ${cost.tick.samples} | ${cost.tick.meanMs.toFixed(4)} | ${cost.tick.p50Ms.toFixed(4)} | ${cost.tick.p95Ms.toFixed(4)} | ${cost.tick.maxMs.toFixed(4)} |`,
    `| Prezentare (personaj + cameră + HUD) | ${cost.present.samples} | ${cost.present.meanMs.toFixed(4)} | ${cost.present.p50Ms.toFixed(4)} | ${cost.present.p95Ms.toFixed(4)} | ${cost.present.maxMs.toFixed(4)} |`,
    `| Interval între cadre | ${cost.frame.samples} | ${cost.frame.meanMs.toFixed(4)} | ${cost.frame.p50Ms.toFixed(4)} | ${cost.frame.p95Ms.toFixed(4)} | ${cost.frame.maxMs.toFixed(4)} |`,
    '',
    'Backendul este SwiftShader (randare software), deci intervalele de cadru **nu** sunt o',
    'măsurătoare FPS hardware și nu sunt comparate cu bugetul de GPU. Tick-ul de compunere este',
    'comparat cu bugetul provizoriu de 8 ms/tick din contractul 25.',
    '',
  ].join('\n');
}

function markdown(report, browser) {
  const rows = report.rows
    .map(
      (row) =>
        `| ${row.sequence} | ${row.input} | ${code(row.controlledEntity)} | ${code(
          row.mode,
        )} | ${row.position} | ${row.verdict} |`,
    )
    .join('\n');
  const checks = report.checks
    .map(
      (check) =>
        `- \`${check.name}\`: ${JSON.stringify(check.expected)} → ${JSON.stringify(
          check.actual,
        )} (${verdict(check.pass)}) — ${check.detail}`,
    )
    .join('\n');
  const operations = Object.entries(report.operations)
    .map(([key, value]) => `- \`${key}\`: ${value}`)
    .join('\n');
  const limitations = report.limitations.map((entry) => `- ${entry}`).join('\n');
  return `# 236 — compunerea în browser a lanțului V3

Transcript determinist generat de \`${report.generatedBy}\` cu \`${report.command}\`.
Machine-readable: [report.json](report.json), proba de browser: [browser.json](browser.json).
Contract: \`${report.contract}\`, tick fix la ${report.tickHz} Hz, harta \`${report.mapId}\`,
start la (${report.spawn.x.toFixed(2)}, ${report.spawn.z.toFixed(2)}) cu yaw
${report.spawn.yawRad.toFixed(4)} rad.

Ordinea unui tick în compunere: intenția reală (193) → tranziția cerută (195/196) → 193 \`step\`
și \`deliver\` → 192 \`walker.step\` (sau mișcarea mașinii conduse) → 194 \`camera.step\` →
198 \`segments.step\` → proiecția HUD.

## Secvențe

| Secvență | Intrare | Entitate controlată | Mod | Poziție (x,y,z) | Verdict |
| --- | --- | --- | --- | --- | --- |
${rows}

## Verificări (${report.summary.passed}/${report.summary.checks})

${checks}

## Operații

${operations}

## Cost

**${report.cost.status}** — ${report.cost.reason}

${browserSection(browser)}
## Limitări

${limitations}
`;
}

const suite = await import(
  pathToFileURL(join(root, 'tests', 'character', 'walking-composition-suite.ts')).href
);
const report = await suite.runCompositionReport();
const json = `${JSON.stringify(report, null, 2)}\n`;
const existingBrowser = await readBrowserProof();
const md = markdown(report, existingBrowser);

if (wantsCheck) {
  let stale = false;
  const savedJson = await readFile(reportJson, 'utf8').catch(() => null);
  if (savedJson !== json) {
    console.error(`Composition report is stale: ${reportJson}`);
    stale = true;
  } else console.log(`Composition report is current: ${reportJson}`);
  const savedMarkdown = await readFile(reportMarkdown, 'utf8').catch(() => null);
  if (savedMarkdown !== md) {
    console.error(`Composition markdown is stale: ${reportMarkdown}`);
    stale = true;
  } else console.log(`Composition markdown is current: ${reportMarkdown}`);
  if (stale) process.exitCode = 1;
} else {
  await mkdir(directory, { recursive: true });
  await writeFile(reportJson, json);
  await writeFile(reportMarkdown, md);
  console.log(`Wrote ${reportJson}`);
  console.log(`Wrote ${reportMarkdown}`);
  for (const check of report.checks) {
    if (!check.pass) console.error(`FAIL ${check.name}: ${JSON.stringify(check.actual)}`);
  }
  console.log(
    `SUMMARY rows ${report.summary.rows}, checks ${report.summary.passed}/${report.summary.checks}, pass ${report.summary.pass}, digest ${report.digest}`,
  );
  if (!report.summary.pass) process.exitCode = 1;
  if (wantsBrowser && report.summary.pass) await runBrowserProof();
}

/** Proba reală: aplicația construită, Chromium, taste reale, capturi și cost. */
async function runBrowserProof() {
  const explicit = process.env.PLAYWRIGHT_MODULE;
  let playwright;
  try {
    if (explicit) {
      const resolved = resolve(explicit);
      const entry = /\.(?:c|m)?js$/.test(resolved) ? resolved : join(resolved, 'index.js');
      playwright = await import(pathToFileURL(entry).href);
    } else {
      playwright = await import('playwright');
    }
  } catch {
    await writeBrowserNotRun(
      'Playwright nu este instalat. Setează PLAYWRIGHT_MODULE la entry point-ul modulului.',
    );
    return;
  }
  const { build } = await import('vite');
  await build({
    configFile: join(root, 'vite.config.ts'),
    root,
    base: './',
    cacheDir: join(root, '.pbi-validation-236', 'cache'),
    logLevel: 'warn',
    build: { outDir: browserBuild, emptyOutDir: true },
  });

  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm',
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
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
  const address = server.address();
  const origin = `http://127.0.0.1:${
    typeof address === 'object' && address !== null ? address.port : 0
  }`;

  const { chromium } = playwright.default ?? playwright;
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--disable-gpu-sandbox',
    ],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.goto(origin, { waitUntil: 'load' });
    await page.waitForFunction(() => globalThis.__v3Composition?.ready() === true, null, {
      timeout: 30000,
    });
    const backend = await page.evaluate(() => globalThis.__v3Composition.backend());
    if (
      backend === null ||
      (backend.rendererKind !== 'WEBGL2' && backend.rendererKind !== 'WEBGPU')
    ) {
      await writeBrowserNotRun(
        `Backendul nu a inițializat WebGL2/WebGPU: ${JSON.stringify(backend)}`,
        { backend },
      );
      return;
    }
    const play = page.getByRole('button', { name: 'Pornește' });
    if ((await play.count()) === 0) {
      await writeBrowserNotRun('Butonul „Pornește” nu există; aplicația nu a ajuns în READY.', {
        backend,
      });
      return;
    }
    await play.click();
    await page.evaluate(() => {
      const active = globalThis.document?.activeElement;
      if (active instanceof globalThis.HTMLElement) active.blur();
    });
    const read = () => page.evaluate(() => globalThis.__v3Composition.read());
    const waitTicks = async (count) => {
      const start = (await read()).tick;
      await page.waitForFunction(
        (target) => globalThis.__v3Composition.read().tick >= target,
        start + count,
        { timeout: 30000 },
      );
    };
    const hud = async () => ({
      clip: await page.locator('.character-hud').getAttribute('data-clip'),
      mode: await page.locator('.character-hud').getAttribute('data-mode'),
      controlled: await page.locator('.character-hud').getAttribute('data-controlled'),
      camera: await page.locator('.character-hud').getAttribute('data-camera'),
    });
    const steps = [];
    const shot = async (name) => {
      await mkdir(screenshots, { recursive: true });
      const relative = `screenshots/${name}.png`;
      await page.screenshot({ path: join(directory, relative) });
      return relative;
    };
    await waitTicks(20);
    const initial = await read();
    steps.push(sequenceStep('start', '—', initial, await hud(), await shot('01-start'), true));

    await page.keyboard.down('KeyW');
    await waitTicks(90);
    const walk = await read();
    const walkHud = await hud();
    steps.push(
      sequenceStep(
        'mers',
        'W',
        walk,
        walkHud,
        await shot('02-mers'),
        walk.authority === 'CHARACTER:player-character' &&
          walk.hud.clipId === 'walk' &&
          walk.character.positionBits !== initial.character.positionBits &&
          walk.hud.cameraEntityId === 'player-character',
      ),
    );

    await page.keyboard.down('KeyF');
    await waitTicks(80);
    const run = await read();
    const runHud = await hud();
    steps.push(
      sequenceStep(
        'alergare',
        'W+F',
        run,
        runHud,
        await shot('03-alergare'),
        run.hud.clipId === 'run' && run.character.speedMps > 1.371 * 1.05,
      ),
    );
    await page.keyboard.up('KeyF');
    await page.keyboard.up('KeyW');

    await page.evaluate(() => globalThis.__v3Composition.reset());
    await waitTicks(6);
    const reset = await read();

    await page.keyboard.press('KeyG');
    await waitTicks(25);
    const enter = await read();
    const enterHud = await hud();
    steps.push(
      sequenceStep(
        'intrare în taxi',
        'G',
        enter,
        enterHud,
        await shot('04-intrare'),
        enter.authority === 'VEHICLE:taxi-01' &&
          enter.hud.mode === 'MANUAL' &&
          enter.hud.cameraEntityId === 'taxi-01' &&
          enter.character.positionBits === reset.character.positionBits,
      ),
    );

    await page.keyboard.down('KeyW');
    await waitTicks(120);
    const drive = await read();
    const driveHud = await hud();
    const taxiStart = enter.vehicles.find((vehicle) => vehicle.vehicleId === 'taxi-01');
    const taxiNow = drive.vehicles.find((vehicle) => vehicle.vehicleId === 'taxi-01');
    steps.push(
      sequenceStep(
        'conducere',
        'W',
        drive,
        driveHud,
        await shot('05-conducere'),
        drive.authority === 'VEHICLE:taxi-01' &&
          taxiStart !== undefined &&
          taxiNow !== undefined &&
          Math.hypot(
            taxiNow.positionM.x - taxiStart.positionM.x,
            taxiNow.positionM.z - taxiStart.positionM.z,
          ) > 3 &&
          drive.character.positionBits === reset.character.positionBits,
      ),
    );
    await page.keyboard.up('KeyW');

    await page.keyboard.down('KeyS');
    let stopped = false;
    for (let attempt = 0; attempt < 160; attempt += 1) {
      await page.waitForTimeout(50);
      const snapshot = await read();
      const taxi = snapshot.vehicles.find((vehicle) => vehicle.vehicleId === 'taxi-01');
      if (taxi && taxi.speedMps === 0) {
        stopped = true;
        break;
      }
    }
    await page.keyboard.up('KeyS');
    const braking = await read();
    steps.push(
      sequenceStep(
        'frânare până la oprire',
        'S',
        braking,
        await hud(),
        null,
        stopped,
        'fără captură separată',
      ),
    );

    await page.keyboard.press('KeyG');
    await waitTicks(25);
    const exit = await read();
    const exitHud = await hud();
    const released = exit.vehicles.find((vehicle) => vehicle.vehicleId === 'taxi-01');
    steps.push(
      sequenceStep(
        'ieșire din taxi',
        'G',
        exit,
        exitHud,
        await shot('06-iesire'),
        exit.authority === 'CHARACTER:player-character' &&
          released?.controlMode === 'AUTO' &&
          exit.hud.cameraEntityId === 'player-character',
      ),
    );

    await page.keyboard.down('KeyW');
    await waitTicks(60);
    const afterWalk = await read();
    const afterHud = await hud();
    steps.push(
      sequenceStep(
        'revenire la mers',
        'W',
        afterWalk,
        afterHud,
        await shot('07-revenire'),
        afterWalk.hud.clipId === 'walk' &&
          afterWalk.character.positionBits !== exit.character.positionBits,
      ),
    );
    await page.keyboard.up('KeyW');

    const doubleDelivery = await page.evaluate(() =>
      globalThis.__v3Composition.probeDoubleDelivery(),
    );
    const stats = await page.evaluate(() => globalThis.__v3Composition.stats());
    const final = await read();
    const pass =
      steps.every((step) => step.pass) &&
      doubleDelivery === 'DOUBLE_DELIVERY_REFUSED' &&
      pageErrors.length === 0 &&
      consoleErrors.length === 0;
    const proof = {
      schemaVersion: 1,
      generatedBy: 'scripts/run-v3-composition-report.mjs -- --browser',
      status: 'MEASURED',
      browser: `Chromium ${browser.version()}`,
      viewport: '1440x900',
      backend,
      sequenceNote:
        'Tastele sunt trimise de Playwright către documentul real; după mers/alergare scenariul de probă este resetat la spawn (butonul de reset al probei), apoi intrarea/ieșirea folosesc exact tastele G/S/W.',
      steps,
      doubleDelivery,
      final: {
        authority: final.authority,
        deliveries: final.deliveries,
        refused: final.refused,
        segments: final.segments,
        costs: final.costs,
      },
      scene: stats,
      cost: final.costs,
      pageErrors,
      consoleErrors,
      screenshots: steps.map((step) => step.screenshot).filter((file) => typeof file === 'string'),
      pass,
    };
    await writeFile(browserJson, `${JSON.stringify(proof, null, 2)}\n`);
    await writeFile(reportMarkdown, markdown(report, proof));
    console.log(`Browser proof: ${pass ? 'PASS' : 'FAIL'}, backend ${backend.rendererKind}`);
    for (const step of steps) {
      if (!step.pass) console.error(`FAIL browser step ${step.sequence}`);
    }
    if (!pass) process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
}

function sequenceStep(sequence, keys, snapshot, hud, screenshot, pass, note) {
  const controlledVehicle =
    snapshot.hud.controlledKind === 'VEHICLE'
      ? snapshot.vehicles.find((vehicle) => vehicle.vehicleId === snapshot.hud.controlledEntityId)
      : undefined;
  const positionM = controlledVehicle?.positionM ?? snapshot.character.positionM;
  return {
    sequence,
    keys,
    controlledEntity: snapshot.authority,
    mode: snapshot.hud.mode,
    clipId: snapshot.hud.clipId,
    position: `${positionM.x.toFixed(2)}, ${positionM.z.toFixed(2)}`,
    hud,
    tick: snapshot.tick,
    screenshot,
    note: note ?? null,
    pass,
  };
}

async function writeBrowserNotRun(reason, extra = {}) {
  const proof = {
    schemaVersion: 1,
    generatedBy: 'scripts/run-v3-composition-report.mjs -- --browser',
    status: 'NOT_RUN',
    reason,
    ...extra,
    manualRecipe:
      'npm run dev, butonul „Pornește”, apoi W (mers), W+F (alergare), G (intrare taxi), W/A/D (conducere), S (oprire), G (ieșire), W (revenire la mers).',
  };
  await mkdir(directory, { recursive: true });
  await writeFile(browserJson, `${JSON.stringify(proof, null, 2)}\n`);
  await writeFile(reportMarkdown, markdown(report, proof));
  console.log(`Browser proof NOT_RUN: ${reason}`);
}
