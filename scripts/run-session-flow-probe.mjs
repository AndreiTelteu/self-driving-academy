import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 261 — proba de browser a sesiunilor Academie/Haos.
 *
 * Secvența reală: Academie → reset „Oraș proaspăt, păstrează stilul” → Haos → Academie.
 * Fiecare tranziție este citită din read model-ul `__v3Composition.session()` (identitate,
 * epoci, checkpointuri, reset) și din shell (portul `sessions` prezent, un singur tick owner).
 * Playwright este opțional; fără el rezultatul este `NOT_RUN` cu motivul real, niciodată simulat.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '261-session-flow'),
  browserJson = join(directory, 'browser.json'),
  reportMarkdown = join(directory, 'report.md'),
  screenshots = join(directory, 'screenshots'),
  buildDirectory = join(root, '.pbi-validation-261', 'build');

const only = process.argv.find((argument) => argument.startsWith('--only='))?.slice(7) ?? null;
const CONFIGS = [
  {
    id: 'webgl2',
    preference: 'WEBGL2',
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--disable-gpu-sandbox',
    ],
  },
  {
    id: 'webgpu',
    preference: 'WEBGPU',
    headless: false,
    args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
  },
].filter((config) => only === null || config.id === only);

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
      '.js': 'text/javascript',
      '.css': 'text/css',
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

function menuSnapshot(menu) {
  if (menu === null || menu === undefined) return null;
  return {
    live: menu.live,
    labels: menu.choices.map((choice) => choice.label),
    choices: menu.choices.map((choice) => ({
      kind: choice.kind,
      profileId: choice.profileId,
      sessionId: choice.sessionId,
      worldEpoch: choice.worldEpoch,
      learningEpoch: choice.learningEpoch,
      checkpoints: choice.checkpoints,
    })),
  };
}

async function runConfig(playwright, origin, config) {
  const { chromium } = playwright.default ?? playwright;
  const channel = process.env.PLAYWRIGHT_CHANNEL || undefined;
  let browser;
  try {
    browser = await chromium.launch({
      headless: config.headless,
      ...(channel === undefined ? {} : { channel }),
      args: config.args,
    });
  } catch (error) {
    return {
      id: config.id,
      status: 'NOT_RUN',
      requestedBackend: config.preference,
      reason: `Browser launch failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.bringToFront();
    const url =
      `${origin}/?capture=1&backend=${config.preference}` +
      '&preset=MEDIUM&models=procedural&time=noon';
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => globalThis.__v3Composition?.ready() === true, null, {
      timeout: 180000,
    });
    await page.waitForFunction(
      () => globalThis.__v3Composition?.sessionMenu()?.live === 'ACADEMY',
      null,
      {
        timeout: 180000,
      },
    );
    const backend = await page.evaluate(() => globalThis.__v3Composition.backend());
    const actualBackend = backend?.rendererKind ?? null;
    if (actualBackend !== config.preference) {
      return {
        id: config.id,
        status: 'NOT_RUN',
        requestedBackend: config.preference,
        actualBackend,
        reason: `Backend ${config.preference} was not initialized; the app reported ${String(actualBackend)}.`,
        pageErrors,
        consoleErrors,
      };
    }
    await page.waitForFunction(
      () =>
        globalThis.document?.querySelector('.game-shell')?.getAttribute('data-state') === 'READY',
      null,
      { timeout: 180000 },
    );
    const start = page.locator('[data-shell-action="start"]');
    const play = page.getByRole('button', { name: 'Joacă' });
    if ((await start.count()) > 0 && (await start.isVisible())) await start.click();
    else await play.click();
    await page.waitForFunction(
      () =>
        globalThis.document?.querySelector('.game-shell')?.getAttribute('data-state') === 'PLAYING',
      null,
      { timeout: 30000 },
    );
    const initial = await page.evaluate(() => ({
      session: globalThis.__v3Composition.session(),
      menu: globalThis.__v3Composition.sessionMenu(),
      shell: globalThis.__v3Composition.shell(),
      host: globalThis.__v3Composition.shellHost(),
      lifecycle: globalThis.__v3Composition.lifecycle(),
    }));
    await mkdir(screenshots, { recursive: true });
    const screenshotsTaken = [];
    const shot = async (name) => {
      const relative = `screenshots/${name}-${config.id}.png`;
      await page.screenshot({ path: join(directory, relative), timeout: 120000 });
      screenshotsTaken.push(relative);
    };
    await shot('01-academy');

    // Resetul se cere din panoul real, cu butonul owner-ului 261.
    await page.locator('[data-shell-action="panel"]').click();
    await page.waitForSelector('[data-shell-panel]', { state: 'visible', timeout: 30000 });
    const resetButton = page.locator('[data-shell-action="reset-world"]');
    const resetPresent = (await resetButton.count()) > 0;
    if (resetPresent) await resetButton.click();
    await page.waitForFunction(
      () => (globalThis.__v3Composition.session()?.resets ?? 0) === 1,
      null,
      { timeout: 30000 },
    );
    const afterReset = await page.evaluate(() => ({
      session: globalThis.__v3Composition.session(),
      menu: globalThis.__v3Composition.sessionMenu(),
      state: globalThis.document?.querySelector('.game-shell')?.getAttribute('data-state') ?? null,
      shell: globalThis.__v3Composition.shell(),
    }));
    await shot('02-reset');

    const selector = page.locator('[data-shell-action="session"]');
    await selector.selectOption('CHAOS');
    await page.waitForFunction(
      () => globalThis.__v3Composition.sessionMenu()?.live === 'CHAOS',
      null,
      { timeout: 30000 },
    );
    const afterChaos = await page.evaluate(() => ({
      session: globalThis.__v3Composition.session(),
      menu: globalThis.__v3Composition.sessionMenu(),
      state: globalThis.document?.querySelector('.game-shell')?.getAttribute('data-state') ?? null,
      shell: globalThis.__v3Composition.shell(),
    }));
    await shot('03-haos');

    await selector.selectOption('ACADEMY');
    await page.waitForFunction(
      () => globalThis.__v3Composition.sessionMenu()?.live === 'ACADEMY',
      null,
      { timeout: 30000 },
    );
    const afterBack = await page.evaluate(() => ({
      session: globalThis.__v3Composition.session(),
      menu: globalThis.__v3Composition.sessionMenu(),
      state: globalThis.document?.querySelector('.game-shell')?.getAttribute('data-state') ?? null,
      shell: globalThis.__v3Composition.shell(),
      host: globalThis.__v3Composition.shellHost(),
      notice: globalThis.__v3Composition.sessionNotice(),
    }));
    await shot('04-academy-back');

    const choice = (menu, kind) => menu?.choices.find((entry) => entry.kind === kind) ?? null;
    const academy = choice(afterBack.menu, 'ACADEMY');
    const chaos = choice(afterBack.menu, 'CHAOS');
    const sessionsSystem = afterBack.shell?.systems?.find((system) => system.id === 'sessions');
    const pass =
      initial.menu?.live === 'ACADEMY' &&
      initial.menu?.choices?.length === 2 &&
      initial.menu.choices[0].label === 'Academie' &&
      initial.menu.choices[1].label === 'Joacă liberă / Haos' &&
      initial.menu.choices[0].sessionId !== initial.menu.choices[1].sessionId &&
      initial.menu.choices[0].profileId !== initial.menu.choices[1].profileId &&
      resetPresent &&
      afterReset.session?.resets === 1 &&
      afterReset.session?.lastReset?.sessionKind === 'ACADEMY' &&
      afterReset.session?.lastReset?.next?.worldEpoch === 2 &&
      afterReset.session?.lastReset?.next?.learningEpoch === 1 &&
      afterReset.session?.live === 'ACADEMY' &&
      afterReset.state === 'PAUSED' &&
      afterChaos.session?.live === 'CHAOS' &&
      afterChaos.state === 'PAUSED' &&
      choice(afterChaos.menu, 'ACADEMY')?.checkpoints === 2 &&
      choice(afterChaos.menu, 'CHAOS')?.checkpoints === 0 &&
      choice(afterChaos.menu, 'ACADEMY')?.worldEpoch === 3 &&
      afterBack.session?.live === 'ACADEMY' &&
      afterBack.state === 'PAUSED' &&
      academy?.checkpoints === 2 &&
      chaos?.checkpoints === 1 &&
      academy?.worldEpoch === 3 &&
      academy?.learningEpoch === 2 &&
      afterBack.shell?.portsPresent === 1 &&
      sessionsSystem?.status === 'PRESENT' &&
      afterBack.shell?.world?.activeWorlds === 1 &&
      afterBack.shell?.world?.maxActiveWorlds === 1 &&
      afterBack.host?.listeners === 8 &&
      afterBack.host?.globalListeners === 0 &&
      afterBack.notice === null &&
      pageErrors.length === 0 &&
      consoleErrors.length === 0;
    return {
      id: config.id,
      status: 'MEASURED',
      pass,
      browser: `${browser.version()}${channel === undefined ? '' : ` (${channel})`}`,
      requestedBackend: config.preference,
      actualBackend,
      backendInfo: backend,
      preset: 'MEDIUM',
      viewport: '1440x900',
      url,
      initial: {
        ...initial,
        menu: menuSnapshot(initial.menu),
      },
      reset: {
        present: resetPresent,
        session: afterReset.session,
        menu: menuSnapshot(afterReset.menu),
        state: afterReset.state,
      },
      chaos: {
        session: afterChaos.session,
        menu: menuSnapshot(afterChaos.menu),
        state: afterChaos.state,
      },
      back: {
        session: afterBack.session,
        menu: menuSnapshot(afterBack.menu),
        state: afterBack.state,
        host: afterBack.host,
        notice: afterBack.notice,
        sessionsSystem,
      },
      finalShell: afterBack.shell,
      pageErrors,
      consoleErrors,
      screenshots: screenshotsTaken,
    };
  } finally {
    await browser.close();
  }
}

function markdown(result) {
  const rows =
    result.runs.length === 0
      ? '| — | — | — | **NOT_RUN** — Playwright is not installed. | — |'
      : result.runs
          .map((run) => {
            if (run.status !== 'MEASURED')
              return `| ${run.id} | ${run.requestedBackend} | ${run.actualBackend ?? '—'} | **NOT_RUN** — ${run.reason} | — |`;
            return `| ${run.id} | ${run.requestedBackend} | ${run.actualBackend} | ${run.pass ? 'PASS' : 'FAIL'} | ${run.initial?.menu?.live ?? '—'} → ${run.chaos?.session?.live ?? '—'} → ${run.back?.session?.live ?? '—'} |`;
          })
          .join('\n');
  const details = result.runs
    .filter((run) => run.status === 'MEASURED')
    .map(
      (run) => `### ${run.id} — ${run.actualBackend}

- Browser: **${run.browser}**, viewport ${run.viewport}, preset \`${run.preset}\`.
- Meniu: ${run.initial.menu.labels.join(' / ')}; sesiuni \`${run.initial.menu.choices.map((choice) => choice.sessionId).join('`, `')}\`.
- Reset: \`${run.reset.session.lastReset?.checkpointId ?? '—'}\`, epoch ${run.reset.session.lastReset?.previous?.worldEpoch ?? '—'} → ${run.reset.session.lastReset?.next?.worldEpoch ?? '—'}, learning ${run.reset.session.lastReset?.previous?.learningEpoch ?? '—'} → ${run.reset.session.lastReset?.next?.learningEpoch ?? '—'}, stare ${run.reset.state}, reseturi ${run.reset.session.resets}.
- Haos: live \`${run.chaos.session.live}\`, epoch ${run.chaos.session.kinds.CHAOS.worldEpoch}, learning ${run.chaos.session.kinds.CHAOS.learningEpoch}, checkpointuri ${run.chaos.menu.choices.find((choice) => choice.kind === 'CHAOS')?.checkpoints}, stare ${run.chaos.state}.
- Înapoi în Academie: epoch ${run.back.session.kinds.ACADEMY.worldEpoch}, learning ${run.back.session.kinds.ACADEMY.learningEpoch}, checkpointuri ${run.back.menu.choices.find((choice) => choice.kind === 'ACADEMY')?.checkpoints}, stare ${run.back.state}.
- Shell: porturi ${run.finalShell.portsPresent}/${run.finalShell.portsPresent + run.finalShell.portsAbsent}, sistem \`sessions\` ${run.back.sessionsSystem?.status ?? '—'}, lumi ${run.finalShell.world.activeWorlds}/${run.finalShell.world.maxActiveWorlds}.
- Gazda UI: ${run.back.host.listeners} listeneri de element, ${run.back.host.globalListeners} globali; notificare \`${run.back.notice ?? 'niciuna'}\`.
- Erori pagină/consolă: ${run.pageErrors.length}/${run.consoleErrors.length}.
- Capturi: ${run.screenshots.map((file) => `[${file}](${file})`).join(', ')}.
`,
    )
    .join('\n');
  return `# 261 — proba de browser a sesiunilor Academie și Haos

Generată de \`npm run session:probe\` pe ${result.generatedAt}. Secvența reală este Academie →
„Oraș proaspăt, păstrează stilul” → Haos → Academie, citită din \`__v3Composition.session()\`,
\`sessionMenu()\`, \`shell()\` și \`shellHost()\`.

| Rulare | Cerut | Real | Verdict | Traseu |
| --- | --- | --- | --- | --- |
${rows}

${details}
## Limitări

- WebGL2 rulează pe SwiftShader (randare software); proba nu este un FPS hardware.
- WebGPU este încercat pe browser headed cu GPU-ul real; dacă nu este disponibil, rularea este
  \`NOT_RUN\` cu motivul real.
- Checkpointul live este magazinul determinist 225 din memorie; adaptorul durabil rămâne al lui
  278, deci un reload de pagină nu promite reluarea fizică a snapshotului.
- Restaurarea fizică a pozițiilor din snapshot rămâne la 278; proba verifică identitatea,
  checkpointul comis, epocile, PAUSED_AUTO, un singur tick owner și un singur port.
`;
}

const playwright = await loadPlaywright();
await mkdir(directory, { recursive: true });
if (playwright === null) {
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: 'NOT_RUN',
    reason: 'Playwright is not installed. Set PLAYWRIGHT_MODULE to its entry point.',
    runs: [],
  };
  await writeFile(browserJson, `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(reportMarkdown, markdown(result));
  console.log('Session flow browser probe NOT_RUN: Playwright is not installed.');
  process.exitCode = 1;
} else {
  const { build } = await import('vite');
  await build({
    configFile: join(root, 'vite.config.ts'),
    root,
    base: './',
    cacheDir: join(root, '.pbi-validation-261', 'cache'),
    logLevel: 'warn',
    build: { outDir: buildDirectory, emptyOutDir: true },
  });
  const { server, origin } = await serve(buildDirectory);
  const runs = [];
  try {
    for (const config of CONFIGS) {
      console.log(
        `Session flow probe: ${config.id} (${config.preference}, headless=${config.headless})`,
      );
      const run = await runConfig(playwright, origin, config);
      runs.push(run);
      console.log(
        `  ${run.status}${run.status === 'MEASURED' ? ` ${run.pass ? 'PASS' : 'FAIL'}` : ` — ${run.reason}`}`,
      );
    }
  } finally {
    server.close();
  }
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: runs.some((run) => run.status === 'MEASURED' && run.pass) ? 'MEASURED' : 'NOT_RUN',
    runs,
  };
  await writeFile(browserJson, `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(reportMarkdown, markdown(result));
  console.log(`Wrote ${browserJson}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (runs.some((run) => run.status !== 'MEASURED' || !run.pass)) process.exitCode = 1;
}
