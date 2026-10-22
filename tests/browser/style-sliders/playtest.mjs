import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 230 browser playtest driver.
 *
 * Runs a short headed Chromium session at 1280×720 against the real popup, the real 230 session and
 * the real 109/205/110 stack. It writes the screenshots and a machine-readable transcript into
 * `Docs/Evidence/230-style-sliders`. It is not part of `npm test` and it never runs a benchmark.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'),
  evidence = join(root, 'Docs', 'Evidence', '230-style-sliders'),
  url =
    process.env.STYLE_PLAYTEST_URL ??
    'http://localhost:5230/tests/browser/style-sliders/index.html';

let playwright;
try {
  const configured = process.env.PLAYWRIGHT_MODULE;
  playwright = configured
    ? await import(new URL(`file://${configured.replaceAll('\\', '/')}`).href)
    : await import('playwright');
} catch {
  console.error('Playwright is required for the 230 playtest driver.');
  process.exit(2);
}

const { chromium } = playwright,
  browser = await chromium.launch({ headless: false }),
  page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }),
  scenarios = [],
  checks = [],
  pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.stack ?? error)));

const check = (name, expected, actual) => {
  checks.push({
    name,
    expected,
    actual,
    pass: JSON.stringify(expected) === JSON.stringify(actual),
  });
};
const evaluate = (callback, arg) => page.evaluate(callback, arg);
const shot = async (name) => {
  const file = join(evidence, name);
  await page.screenshot({ path: file });
  return name;
};
const scenario = async (name, action, extra = {}) => {
  await action();
  await page.waitForTimeout(220);
  const geometry = await evaluate(() => globalThis.__cs230.geometry());
  const state = await evaluate(() => {
    const api = globalThis.__cs230;
    const view = api.view();
    const state = api.state();
    return {
      tick: api.tick(),
      suspended: api.suspended(),
      head: api.head(),
      epoch: api.epoch(),
      versions: api.versions(),
      fleet: api.fleetVersions(),
      saveState: view?.saveState ?? null,
      changedCount: view?.changedCount ?? null,
      message: state.message,
      messageCode: state.messageCode,
      panelStats: api.panelStats(),
      stats: api.stats(),
      log: api.log(),
    };
  });
  const screenshot = await shot(`${name}.png`);
  scenarios.push({ name, screenshot, geometry, state, ...extra });
  return { geometry, state };
};

await mkdir(evidence, { recursive: true });
let failed = false;
try {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => globalThis.__cs230 !== undefined);
  await evaluate(() => localStorage.removeItem('sda-230-playtest'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => globalThis.__cs230 !== undefined);
  check(
    'viewport',
    { width: 1280, height: 720 },
    await evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    })),
  );

  const open = await scenario('capture-01-open-city-1280x720', async () => {
    await page.click('#playtest-open');
    await page.waitForSelector('.style-sliders');
  });
  check('open-tab', 'CITY', await evaluate(() => globalThis.__cs230.panelStats().tab));
  check('open-rows', 8, open.geometry.rows);
  check('open-unavailable', 3, open.geometry.unavailable);
  check('open-save-state', 'UNCHANGED', open.geometry.saveState);
  check('open-city-enabled', false, open.geometry.cityTabDisabled);
  check('open-suspended', true, open.state.suspended);
  check('open-head', 'style-v1', open.state.head);
  check('open-versions', ['style-v1'], open.state.versions);
  check('open-global-listeners', 0, open.geometry.globalListeners);

  const unsupported = await scenario('capture-02-unsupported-visible', async () => {
    await evaluate(() => {
      const list = document.querySelector('.style-sliders__list');
      if (list) list.scrollTop = list.scrollHeight;
      const root = document.querySelector('.style-sliders');
      if (root) root.scrollTop = root.scrollHeight;
    });
  });
  check('unsupported-visible', true, unsupported.geometry.unavailable === 3);
  check(
    'unsupported-not-hidden',
    true,
    await evaluate(() =>
      [...document.querySelectorAll('.style-sliders__unavailable-row')].every(
        (node) => node.offsetParent !== null && node.getAttribute('aria-disabled') === 'true',
      ),
    ),
  );

  const edited = await scenario('capture-03-edited-draft', async () => {
    await evaluate(() => {
      const api = globalThis.__cs230;
      api.setValue('speedDeltaUrban', 18);
      api.setValue('greenStartDelay', 2.5);
      api.setValue('redStopProbability', 55);
      const root = document.querySelector('.style-sliders');
      if (root) root.scrollTop = 0;
    });
  });
  check('edited-dirty', 'DIRTY', edited.state.saveState);
  check('edited-count', 3, edited.state.changedCount);
  check(
    'edited-apply-enabled',
    false,
    await evaluate(() =>
      document.querySelector('.control-sliders__apply').hasAttribute('disabled'),
    ),
  );
  check(
    'edited-display',
    '+18 km/h',
    await evaluate(
      () =>
        [...document.querySelectorAll('.style-sliders__row')]
          .find((row) => row.getAttribute('data-field') === 'speedDeltaUrban')
          .querySelector('output').textContent,
    ),
  );

  const published = await scenario('capture-04-applied-published', async () => {
    await evaluate(() => {
      globalThis.__cs230.submitJob('job-playtest-103');
      document.querySelector('.control-sliders__apply').click();
    });
    await page.waitForTimeout(700);
  });
  check('apply-closed', false, published.state.suspended);
  check('apply-versions', 2, published.state.versions.length);
  check('apply-head', published.state.versions[1], published.state.head);
  check('apply-epoch', 2, published.state.epoch);
  check('apply-fleet', [published.state.head], published.state.fleet);
  check('apply-worker-cancelled', true, published.state.stats.cancelledJobs >= 1);
  check('apply-learning-jobs', 0, published.state.stats.learningJobs);
  check('apply-progression', 0, published.state.stats.progressionCalls);

  const stale = await scenario('capture-05-stale-draft', async () => {
    await page.click('#playtest-open');
    await page.waitForSelector('.style-sliders');
    await evaluate(() => {
      globalThis.__cs230.setValue('followingMinGap', 9);
      globalThis.__cs230.publishExternal();
    });
  });
  check('stale-state', 'STALE', stale.state.saveState);
  check(
    'stale-apply-disabled',
    true,
    await evaluate(() =>
      document.querySelector('.control-sliders__apply').hasAttribute('disabled'),
    ),
  );
  check(
    'stale-banner-visible',
    true,
    await evaluate(() => {
      const banner = document.querySelector('.style-sliders__stale');
      return banner !== null && !banner.hasAttribute('hidden') && banner.offsetParent !== null;
    }),
  );
  const rebased = await scenario('capture-06-rebased', async () => {
    await page.click('.style-sliders__rebase');
  });
  check('rebase-state', 'UNCHANGED', rebased.state.saveState);
  check(
    'rebase-head',
    rebased.state.head,
    await evaluate(() => globalThis.__cs230.state().view.baseVersionId),
  );

  const restored = await scenario('capture-07-restored', async () => {
    await page.evaluate(() => {
      const select = document.querySelector('.style-sliders__restore-select');
      select.value = 'style-v1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('.style-sliders__restore-button').click();
      document.querySelector('.style-sliders__confirm-button').click();
      globalThis.__cs230.close();
    });
    await page.waitForTimeout(700);
  });
  check('restore-head', 'style-v1', restored.state.head);
  check('restore-versions', 3, restored.state.versions.length);
  check('restore-fleet', ['style-v1'], restored.state.fleet);
  check('restore-count', 1, restored.state.stats.restored);

  const reloaded = await scenario('capture-08-reload-persisted', async () => {
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => globalThis.__cs230 !== undefined);
    await page.click('#playtest-open');
    await page.waitForSelector('.style-sliders');
  });
  check('reload-head', 'style-v1', reloaded.state.head);
  check('reload-versions', 3, reloaded.state.versions.length);
  check('reload-epoch', 4, reloaded.state.epoch);
  check(
    'reload-manual-value',
    true,
    await evaluate(() => {
      const view = globalThis.__cs230.view();
      const red = view?.rows.find((row) => row.field === 'redStopProbability');
      return view !== null && view.baseVersionId === 'style-v1' && red?.displayValue === 100;
    }),
  );

  const switched = await scenario('capture-09-session-changed', async () => {
    await evaluate(() => {
      globalThis.__cs230.setValue('comfortDeceleration', 4);
      globalThis.__cs230.switchSession();
    });
  });
  check('session-changed-state', 'SESSION_CHANGED', switched.state.saveState);
  check('session-changed-code', 'SESSION_CHANGED', switched.state.messageCode);
  check(
    'session-changed-apply-disabled',
    true,
    await evaluate(() =>
      document.querySelector('.control-sliders__apply').hasAttribute('disabled'),
    ),
  );

  const keyboard = await scenario('capture-10-keyboard-escape', async () => {
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  });
  check('escape-closed', false, keyboard.state.suspended);
  const focusRestored = await evaluate(() => document.activeElement?.id ?? null);
  check('focus-restored-to-host', 'playtest-open', focusRestored);

  check('page-errors', [], pageErrors);
  check(
    'popup-in-viewport',
    true,
    open.geometry.rect !== null && open.geometry.rect.x >= 0 && open.geometry.rect.bottom <= 720,
  );
  check(
    'footer-in-viewport',
    true,
    open.geometry.footer !== null && open.geometry.footer.bottom <= 720,
  );
  check(
    'list-scrolls',
    true,
    open.geometry.stylePanel !== null &&
      open.geometry.stylePanel.scrollHeight > open.geometry.stylePanel.height,
  );

  failed = checks.some((entry) => !entry.pass);
  await writeFile(
    join(evidence, 'playtest.json'),
    `${JSON.stringify(
      {
        url,
        browser: `Chromium ${browser.version()}`,
        viewport: { width: 1280, height: 720 },
        checks,
        scenarios,
        pageErrors,
        summary: {
          checks: checks.length,
          passed: checks.filter((entry) => entry.pass).length,
          pass: !failed,
        },
      },
      null,
      2,
    )}\n`,
  );
  for (const entry of checks)
    console.log(`${entry.pass ? 'PASS' : 'FAIL'} ${entry.name} (${JSON.stringify(entry.actual)})`);
  console.log(
    `SUMMARY ${checks.filter((entry) => entry.pass).length}/${checks.length} checks, ${scenarios.length} scenarios, ${failed ? 'FAIL' : 'PASS'}`,
  );
} finally {
  await browser.close();
}
if (failed) process.exitCode = 1;
