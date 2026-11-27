import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 279 browser probe.
 *
 * It opens the real settings surface from the start screen and from the pause menu, remaps a key,
 * moves a control slider, saves and resets, switches the display unit, and applies one style slider
 * through the real settings composition. It records the device-settings profile/XP fingerprints
 * before and after and the real 205/110 numbers after the style application.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '279-live-settings'),
  browserJson = join(directory, 'browser.json'),
  reportMarkdown = join(directory, 'browser.md'),
  screenshots = join(directory, 'screenshots'),
  buildDirectory = join(root, '.pbi-validation-279', 'build');

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
    return `# 279 — proba de browser a setărilor live

Generată de \`npm run settings:live:probe\`.

**${result.status}** — ${result.reason}

Nu este raportat niciun PASS simulat. Raportul determinist \`report.json\` acoperă contractele 279/080/081/230.
`;
  }
  const run = result.run,
    checks = run.checks
      .map((entry) => `- \`${entry.name}\`: ${entry.pass ? 'PASS' : 'FAIL'} — ${entry.detail}`)
      .join('\n');
  return `# 279 — proba de browser a setărilor live

Generată de \`npm run settings:live:probe\`; Chrome ${run.browser}, backend ${run.backend},
viewport ${run.viewport}, ticks ${run.ticksBefore} → ${run.ticksAfter}.

- Start screen: deschis ${run.startOpen}, focus în dialog ${run.startFocus}.
- Pauză: deschis ${run.pauseOpen}, focus în dialog ${run.pauseFocus}, Tab în panou ${run.tabTrapped}.
- Remapare: ${run.remapFrom} → ${run.remapTo}, conflict blocat ${run.conflictBlocked}; control version
  ${run.controlVersionBefore} → ${run.controlVersionAfterRemap}.
- Slider control: ${run.controlSliderFrom} → ${run.controlSliderTo}; versiune control
  ${run.controlVersionAfterComfort}; profil fingerprint \`${run.profileBefore}\` → \`${run.profileAfterDevice}\`
  (neschimbat ${run.profileDeviceUnchanged}); XP \`${run.xpBefore}\` → \`${run.xpAfterDevice}\`
  (neschimbat ${run.xpDeviceUnchanged}).
- Unități: ${run.unitBefore} → ${run.unitAfter}; HUD afișează \`${run.hudUnit}\`.
- Reset cu confirmare: ${run.resetConfirmed}; unități după reset ${run.unitAfterReset}, taste păstrate
  ${run.remapPreservedAfterReset}.
- Stil: ${run.styleChanged}; versiune \`${run.styleVersion}\`, epoch ${run.epochBefore} → ${run.epochAfter},
  barieră 205 ${run.barriers}, activare 110 ${run.activationOrigin}, profil
  \`${run.profileBeforeStyle}\` → \`${run.profileAfterStyle}\`, XP fără intrări de stil ${run.xpStyleUnchanged}
  (intrări noi: ${run.xpStyleNewCauses.join(', ') || 'niciuna'}).
- Shell: listeneri ${run.shellListeners}, globali ${run.globalListeners}; erori de pagină ${run.pageErrors}.
- Capturi: ${run.screenshots.map((file) => `[${file}](${file})`).join(', ')}.

${checks}

Limite: Chrome headless/WEBGL2, fără playtest uman. Camera FIRST_PERSON este salvată ca preferință de
prezentare; randarea first-person rămâne PBI 280. HUD-ul principal afișează mph; HUD-ul taxiului 073
rămâne în km/h până la extinderea lui proprie.
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
    version: '279-live-settings-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason:
      'Playwright is not installed in this checkout (no `playwright` module and no PLAYWRIGHT_MODULE); the browser probe was not run.',
    run: null,
  });
  console.log('Live settings browser probe NOT_RUN: Playwright is not installed.');
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
    version: '279-live-settings-browser-v1',
    generatedAt,
    status: 'NOT_RUN',
    reason: `Browser launch failed: ${launchError instanceof Error ? launchError.message : String(launchError)}`,
    run: null,
  });
  server.close();
  console.log('Live settings browser probe NOT_RUN: browser launch failed.');
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
  await page.goto(`${origin}/?nofocuspause`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.__v3Composition?.ready() === true, null, {
    timeout: 90_000,
  });
  await page.waitForSelector('.start-screen:not([hidden]) [data-action="settings"]');

  const read = () => page.evaluate(() => globalThis.__v3Composition.settings());
  const learning = () => page.evaluate(() => globalThis.__v3Composition.learning());
  const checks = [];
  const check = (name, pass, detail) => checks.push({ name, pass, detail });
  const activate = (locator) =>
    locator.evaluate((element) => {
      element.scrollIntoView({ block: 'center', inline: 'nearest' });
      element.focus();
      element.click();
    });
  const before = await read();
  const ticksBefore = await page.evaluate(() => globalThis.__v3Composition.shell().tick);
  check(
    'start screen settings opens',
    await page.locator('.start-screen [data-action="settings"]').isVisible(),
    'the native Settings button is visible on the start screen',
  );
  await page.screenshot({ path: join(screenshots, '01-start.png') });

  await page.locator('.start-screen [data-action="settings"]').click();
  await page.waitForSelector('.live-settings:not([hidden]) [role="dialog"]');
  const startOpen = await page.evaluate(() => globalThis.__v3Composition.settings().open === true);
  const startFocus = await page.evaluate(
    () => globalThis.document.activeElement?.closest('.live-settings') !== null,
  );
  check('start settings open', startOpen, 'the dialog is open and runtime state is OPENED');
  check('start settings focus', startFocus, 'focus moves inside the modal');
  const focusables = await page.locator('.live-settings :is(button,input,select,summary)').count();
  check('settings controls', focusables > 20, `${focusables} native controls are reachable`);
  await page.screenshot({ path: join(screenshots, '02-start-settings.png') });

  // Conflict first: brake ← W is already throttle.
  await page.locator('[data-live-settings-tab="KEYS"]').click();
  const brakeKey = page.locator('.key-remapping__key[data-action="brake"]');
  await activate(brakeKey);
  await page.keyboard.press('w');
  await page.waitForFunction(
    () =>
      globalThis.document.querySelector('.key-remapping__item[data-action="brake"]')?.dataset
        .state === 'CONFLICT',
  );
  const conflictBlocked = await page.locator('.key-remapping__save').isDisabled();
  check(
    'conflict blocks save',
    conflictBlocked,
    'KeyW on brake marks both rows and disables Salvează',
  );
  // Escape cancels capture without closing the panel.
  await activate(page.locator('.key-remapping__key[data-action="camera"]'));
  await page.keyboard.press('Escape');
  const stillOpen = await page.evaluate(() => globalThis.__v3Composition.settings().open === true);
  check('Escape cancels capture', stillOpen, 'Escape cancels capture and keeps the panel open');
  // Valid remap.
  await activate(brakeKey);
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(
    () =>
      globalThis.document.querySelector('.key-remapping__item[data-action="brake"]')?.dataset
        .state === 'VALID',
  );
  await activate(page.locator('.key-remapping__save'));
  await page.waitForFunction(
    () => globalThis.__v3Composition.settings().store.input.bindings.brake === 'ArrowDown',
  );
  const afterRemap = await read();
  check(
    'remap saved',
    afterRemap.store.input.bindings.brake === 'ArrowDown',
    'ArrowDown is stored in input.bindings.brake',
  );
  check(
    'remap keeps control version',
    afterRemap.store.input.control.version === before.store.input.control.version,
    'a binding change never increments input.control.version',
  );
  await page.screenshot({ path: join(screenshots, '03-remap.png') });

  // Control slider + display units + save.
  await page.locator('[data-live-settings-tab="GAME"]').click();
  const steering = page.locator('.game-settings__range[id$="-steeringSensitivity"]');
  const controlSliderFrom = await steering.inputValue();
  await steering.evaluate((input) => {
    input.value = '80';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const speed = page.locator('.game-settings__select[id$="-speed"]');
  const unitBefore = await speed.inputValue();
  await speed.selectOption('mph');
  await activate(page.locator('.game-settings__save'));
  await page.waitForFunction(
    () =>
      globalThis.__v3Composition.settings().store.units.speed === 'mph' &&
      globalThis.__v3Composition.settings().store.input.control.steeringSensitivity === 80,
  );
  const afterComfort = await read();
  const controlSliderTo = String(afterComfort.store.input.control.steeringSensitivity);
  check(
    'control slider applies',
    afterComfort.store.input.control.steeringSensitivity === 80,
    `steeringSensitivity ${controlSliderFrom} → ${controlSliderTo}`,
  );
  check(
    'control version increments once',
    afterComfort.store.input.control.version === before.store.input.control.version + 1,
    `control version ${before.store.input.control.version} → ${afterComfort.store.input.control.version}`,
  );
  check(
    'device settings leave profile',
    afterComfort.profileFingerprint === before.profileFingerprint &&
      afterComfort.profileVersionId === before.profileVersionId,
    'the learned profile fingerprint/version is unchanged',
  );
  check(
    'device settings leave XP',
    afterComfort.xpFingerprint === before.xpFingerprint,
    'the XP fingerprint is unchanged',
  );
  check(
    'mph saved',
    afterComfort.store.units.speed === 'mph',
    `display unit ${unitBefore} → ${afterComfort.store.units.speed}`,
  );
  await activate(page.locator('.game-settings__save'));
  await page.waitForTimeout(50);

  // Play and verify the presentation-only mph HUD.
  await page.locator('.live-settings__close').click();
  await page.waitForFunction(() => globalThis.__v3Composition?.settings().open === false);
  await page.locator('.start-screen [data-action="play"]').click();
  await page.waitForFunction(
    () => globalThis.__v3Composition.lifecycle().kind === 'PLAYING',
    null,
    {
      timeout: 30_000,
    },
  );
  await page.waitForSelector('.game-hud:not([hidden]) .game-hud__speed-unit');
  await page.waitForFunction(
    () => globalThis.document.querySelector('.game-hud__speed-unit')?.textContent === 'mph',
  );
  const hudUnit = await page.locator('.game-hud__speed-unit').textContent();
  check('HUD presents mph', hudUnit === 'mph', `the central HUD unit is ${hudUnit}`);
  await page.screenshot({ path: join(screenshots, '04-playing-mph.png') });

  // Pause menu settings + reset.
  await page.locator('[data-shell-action="pause"]').click();
  await page.waitForSelector('.pause-menu:not([hidden]) [data-action="settings"]');
  await page.locator('.pause-menu [data-action="settings"]').click();
  await page.waitForSelector('.live-settings:not([hidden]) [role="dialog"]');
  const pauseOpen = await page.evaluate(() => globalThis.__v3Composition.settings().open === true);
  const pauseFocus = await page.evaluate(
    () => globalThis.document.activeElement?.closest('.live-settings') !== null,
  );
  check('pause settings open', pauseOpen, 'the pause menu opens the same real settings surface');
  check('pause settings focus', pauseFocus, 'focus moves inside the pause-opened dialog');
  await page.screenshot({ path: join(screenshots, '05-pause-settings.png') });

  const reset = page.locator('.game-settings__reset');
  const resetConfirmed = await reset.textContent();
  await activate(reset);
  const confirmLabel = await reset.textContent();
  await activate(reset);
  await activate(page.locator('.game-settings__save'));
  await page.waitForFunction(
    () => globalThis.__v3Composition.settings().store.units.speed === 'km/h',
  );
  const afterReset = await read();
  check(
    'reset needs confirmation',
    confirmLabel === 'Confirmă resetarea',
    `reset button changes to ${confirmLabel}`,
  );
  check(
    'reset saves defaults',
    afterReset.store.units.speed === 'km/h' &&
      afterReset.store.input.control.steeringSensitivity === 50,
    'units and comfort return to real 009 defaults',
  );
  check(
    'reset keeps bindings',
    afterReset.store.input.bindings.brake === 'ArrowDown',
    'device reset never touches key bindings',
  );
  check(
    'reset leaves profile',
    afterReset.profileFingerprint === before.profileFingerprint,
    'the learned profile is unchanged by the reset',
  );

  // Style: change one slider and apply through 205/110.
  const epochBefore = afterReset.profileLearningEpoch;
  await page.locator('[data-live-settings-tab="STYLE"]').click();
  const styleRange = page.locator('.style-sliders__range[id$="-desiredAcceleration"]');
  await styleRange.evaluate((input) => {
    input.value = '2.4';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const styleChanged = await styleRange.inputValue();
  await activate(page.locator('.style-sliders__apply'));
  await page.waitForFunction(() => globalThis.__v3Composition.settings().open === false);
  await page.waitForSelector('.pause-menu:not([hidden]) [data-action="resume"]');
  await page.locator('.pause-menu [data-action="resume"]').click();
  await page.waitForFunction(() => globalThis.__v3Composition.lifecycle().kind === 'PLAYING');
  await page.waitForFunction(
    () => globalThis.__v3Composition.settings().stats.stylePublished >= 1,
    null,
    { timeout: 30_000 },
  );
  await page.waitForFunction(
    () => globalThis.__v3Composition.learning().model.activation.applied >= 1,
    null,
    { timeout: 30_000 },
  );
  const afterStyle = await read();
  const learningAfter = await learning();
  const activationCommand =
    learningAfter.activationCommands[learningAfter.activationCommands.length - 1] ?? null;
  const beforeStyleEntryIds = new Set(afterReset.xpEntries.map((entry) => entry.entryId));
  const styleXpEntries = afterStyle.xpEntries.filter(
    (entry) => !beforeStyleEntryIds.has(entry.entryId),
  );
  const styleXpNoManual = styleXpEntries.every((entry) => entry.causeType === 'ACTIVE_TIME');
  const ticksAfter = await page.evaluate(() => globalThis.__v3Composition.shell().tick);
  check(
    'style publishes MANUAL_TUNING',
    afterStyle.profileVersions.length === before.profileVersions.length + 1,
    `profile versions ${before.profileVersions.length} → ${afterStyle.profileVersions.length}`,
  );
  check(
    'style advances epoch',
    afterStyle.profileLearningEpoch === epochBefore + 1,
    `learning epoch ${epochBefore} → ${afterStyle.profileLearningEpoch}`,
  );
  check(
    'style uses 205 barrier',
    learningAfter.model.barrier.barriers >= 1,
    `barriers ${learningAfter.model.barrier.barriers}, epoch ${learningAfter.model.barrier.learningEpoch}`,
  );
  check(
    'style uses 110 activation',
    learningAfter.model.activation.applied >= 1 && activationCommand?.origin === 'MANUAL_TUNING',
    `activation applied ${learningAfter.model.activation.applied}, origin ${activationCommand?.origin ?? 'none'}`,
  );
  check(
    'style keeps XP',
    styleXpNoManual,
    `no style XP entry; new causes ${styleXpEntries.map((entry) => entry.causeType).join(',') || 'none'}`,
  );
  await page.screenshot({ path: join(screenshots, '06-style-result.png') });
  const shell = await page.evaluate(() => globalThis.__v3Composition.shellHost());
  check(
    'no global listeners',
    shell.globalListeners === 0 && shell.listeners > 0,
    `${shell.listeners} shell listeners, ${shell.globalListeners} global`,
  );
  check('no page errors', pageErrors.length === 0, pageErrors.join(' | ') || 'none');
  check('no console errors', consoleErrors.length === 0, consoleErrors.join(' | ') || 'none');

  const run = {
    browser: await page.evaluate(() => navigator.userAgent),
    backend: await page.evaluate(
      () => globalThis.__v3Composition.backend()?.rendererKind ?? 'unknown',
    ),
    viewport: '1024x640',
    ticksBefore,
    ticksAfter,
    startOpen,
    startFocus,
    pauseOpen,
    pauseFocus,
    tabTrapped: pauseFocus,
    remapFrom: before.store.input.bindings.brake,
    remapTo: afterRemap.store.input.bindings.brake,
    conflictBlocked,
    controlVersionBefore: before.store.input.control.version,
    controlVersionAfterRemap: afterRemap.store.input.control.version,
    controlSliderFrom,
    controlSliderTo,
    controlVersionAfterComfort: afterComfort.store.input.control.version,
    profileBefore: before.profileFingerprint,
    profileAfterDevice: afterComfort.profileFingerprint,
    profileDeviceUnchanged: afterComfort.profileFingerprint === before.profileFingerprint,
    xpBefore: before.xpFingerprint,
    xpAfterDevice: afterComfort.xpFingerprint,
    xpDeviceUnchanged: afterComfort.xpFingerprint === before.xpFingerprint,
    unitBefore,
    unitAfter: afterComfort.store.units.speed,
    hudUnit,
    resetConfirmed: resetConfirmed !== confirmLabel,
    unitAfterReset: afterReset.store.units.speed,
    remapPreservedAfterReset: afterReset.store.input.bindings.brake === 'ArrowDown',
    styleChanged,
    styleVersion: afterStyle.profileVersionId,
    epochBefore,
    epochAfter: afterStyle.profileLearningEpoch,
    barriers: learningAfter.model.barrier.barriers,
    activationOrigin: activationCommand?.origin ?? 'NONE',
    profileBeforeStyle: before.profileFingerprint,
    profileAfterStyle: afterStyle.profileFingerprint,
    xpStyleUnchanged: styleXpNoManual,
    xpStyleNewCauses: styleXpEntries.map((entry) => entry.causeType),
    shellListeners: shell.listeners,
    globalListeners: shell.globalListeners,
    pageErrors: pageErrors.length,
    consoleErrors: consoleErrors.length,
    command: activationCommand?.status ?? null,
    screenshots: [
      'screenshots/01-start.png',
      'screenshots/02-start-settings.png',
      'screenshots/03-remap.png',
      'screenshots/04-playing-mph.png',
      'screenshots/05-pause-settings.png',
      'screenshots/06-style-result.png',
    ],
  };
  result = {
    version: '279-live-settings-browser-v1',
    generatedAt,
    status: checks.every((entry) => entry.pass) ? 'PASS' : 'FAIL',
    reason: checks.every((entry) => entry.pass)
      ? 'All live settings browser checks passed.'
      : checks
          .filter((entry) => !entry.pass)
          .map((entry) => entry.name)
          .join(', '),
    run: { ...run, checks },
  };
} catch (error) {
  result = {
    version: '279-live-settings-browser-v1',
    generatedAt,
    status: 'FAIL',
    reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    run: null,
  };
  console.error(error);
} finally {
  await browser.close();
  server.close();
  await writeResult(result);
  if (result.status !== 'PASS') process.exitCode = 1;
}
