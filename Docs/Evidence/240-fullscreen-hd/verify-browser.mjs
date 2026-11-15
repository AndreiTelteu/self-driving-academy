/**
 * PBI 240 — verificare în browser real (Chromium, GPU real) a randării pe tot ecranul.
 *
 * Rulare: node verify-browser.mjs --url http://localhost:4321 --out <director> [--backend webgpu|webgl2]
 * Joc real (fără ?capture=1 pentru pagină; `?capture=1` doar ca să existe API-ul de stare):
 * verifică umplerea viewportului, lipsa scroll-ului, rezoluția internă la mai multe viewporturi și DPR,
 * redimensionarea, ecranul complet și absența scurgerilor de ascultători. Scrie `verify.json` + PNG-uri.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const url = opt('url', 'http://localhost:4321');
const out = resolve(opt('out', '.'));
const backend = opt('backend', 'webgpu');
const preset = opt('preset', 'HIGH');

async function loadPlaywright() {
  const cache = join(process.env.LOCALAPPDATA ?? '', 'npm-cache', '_npx');
  const found = existsSync(cache)
    ? readdirSync(cache)
        .map((name) => join(cache, name, 'node_modules', 'playwright', 'index.js'))
        .filter((file) => existsSync(file))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    : [];
  for (const file of found) {
    const module = await import(pathToFileURL(file).href);
    const { chromium } = module.default ?? module;
    if (existsSync(chromium.executablePath())) return chromium;
  }
  throw new Error('Playwright indisponibil');
}

const chromium = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  channel: 'chromium',
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--ignore-gpu-blocklist',
    '--enable-gpu',
    '--force-color-profile=srgb',
  ],
});
await mkdir(out, { recursive: true });
const results = { url, backend, preset, checks: [] };
const record = (name, ok, detail) => {
  results.checks.push({ name, ok, detail });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} ${JSON.stringify(detail)}`);
};

async function open(viewport, deviceScaleFactor) {
  const context = await browser.newContext({ viewport, deviceScaleFactor });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  await page.goto(`${url}/?capture=1&preset=${preset}&backend=${backend}`, { waitUntil: 'load' });
  await page.waitForFunction(() => globalThis.__v3Composition?.ready() === true, null, {
    timeout: 60000,
  });
  await page.waitForTimeout(400);
  return { context, page, errors };
}
const measure = (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const rect = canvas.getBoundingClientRect();
    const info = globalThis.__v3Composition.backend();
    return {
      inner: [innerWidth, innerHeight],
      dpr: devicePixelRatio,
      canvasRect: [rect.left, rect.top, rect.width, rect.height],
      canvasAttr: [canvas.width, canvas.height],
      render: [info.renderWidth, info.renderHeight],
      backend: info.rendererKind,
      scroll: [
        document.documentElement.scrollWidth - innerWidth,
        document.documentElement.scrollHeight - innerHeight,
      ],
      bodyOverflow: getComputedStyle(document.body).overflow,
    };
  });
const near = (a, b) => Math.abs(a - b) <= 1;

// 1) Viewporturi cerute, DPR 1: rezoluția internă = viewport, canvas pe tot ecranul, fără scroll.
for (const [w, h] of [
  [1280, 720],
  [1920, 1080],
  [2560, 1440],
]) {
  const { context, page, errors } = await open({ width: w, height: h }, 1);
  const m = await measure(page);
  const expectedScale = preset === 'LOW' ? 1 : 1;
  record(
    `${preset}/${backend} ${w}x${h}@1 umple ecranul`,
    m.canvasRect[0] === 0 &&
      m.canvasRect[1] === 0 &&
      near(m.canvasRect[2], w) &&
      near(m.canvasRect[3], h) &&
      m.scroll[0] <= 0 &&
      m.scroll[1] <= 0,
    m,
  );
  record(
    `${preset}/${backend} ${w}x${h}@1 rezoluție internă`,
    near(m.render[0], w * expectedScale) && near(m.render[1], h * expectedScale),
    { render: m.render, backend: m.backend },
  );
  await page.screenshot({ path: join(out, `${preset.toLowerCase()}-${backend}-${w}x${h}.png`) });
  record(`${w}x${h} fără erori de consolă`, errors.length === 0, errors);
  await context.close();
}

// 2) DPR real: 2560x1440 CSS la DPR 1,5/2, plafonat de preset.
for (const dpr of [1.5, 2]) {
  const { context, page } = await open({ width: 1280, height: 720 }, dpr);
  const m = await measure(page);
  const cap = { LOW: 1, MEDIUM: 1.5, HIGH: 2 }[preset];
  const eff = Math.min(dpr, cap);
  record(
    `${preset}/${backend} 1280x720@${dpr} => ${eff}x`,
    near(m.render[0], 1280 * eff) && near(m.render[1], 720 * eff),
    m,
  );
  await context.close();
}

// 3) Redimensionare, ecran complet, schimbare DPR fără scenă nouă și fără scurgeri de ascultători.
{
  const { context, page, errors } = await open({ width: 1280, height: 720 }, 1);
  await page.evaluate(() => {
    globalThis.__sceneMarker = globalThis.__v3Composition.stats();
    // Numără addEventListener/removeEventListener pe window și document (scurgeri).
    const counts = { add: 0, remove: 0 };
    for (const target of [window, document]) {
      const add = target.addEventListener.bind(target);
      const remove = target.removeEventListener.bind(target);
      target.addEventListener = (...a) => {
        if (['resize', 'fullscreenchange'].includes(a[0])) counts.add++;
        return add(...a);
      };
      target.removeEventListener = (...a) => {
        if (['resize', 'fullscreenchange'].includes(a[0])) counts.remove++;
        return remove(...a);
      };
    }
    globalThis.__listenerCounts = counts;
  });
  const before = await measure(page);
  const sceneBefore = await page.evaluate(() => JSON.stringify(globalThis.__sceneMarker));
  for (const [w, h] of [
    [1600, 900],
    [1000, 700],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    const m = await measure(page);
    record(
      `resize ${w}x${h}`,
      near(m.render[0], w) && near(m.render[1], h) && near(m.canvasRect[2], w),
      { render: m.render, rect: m.canvasRect },
    );
  }
  // Fără distorsiune: raportul de aspect al randării = al canvasului.
  const m = await measure(page);
  record(
    'aspect randare = aspect canvas',
    Math.abs(m.render[0] / m.render[1] - m.canvasRect[2] / m.canvasRect[3]) < 0.01,
    m,
  );
  // Ecran complet prin API.
  const fs = await page.evaluate(async () => {
    try {
      await document.querySelector('.game-stage').requestFullscreen();
      await new Promise((r) => setTimeout(r, 400));
      return { ok: !!document.fullscreenElement, w: innerWidth, h: innerHeight };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });
  const mf = await measure(page);
  record('ecran complet (API Fullscreen)', fs.ok === true && near(mf.render[0], mf.inner[0]), {
    fs,
    render: mf.render,
    inner: mf.inner,
  });
  await page.screenshot({ path: join(out, `${preset.toLowerCase()}-${backend}-fullscreen.png`) });
  await page.evaluate(() => document.exitFullscreen?.());
  await page.waitForTimeout(300);
  // Schimbare DPR (zoom browser) via CDP: Emulation.setDeviceMetricsOverride.
  const cdp = await context.newCDPSession(page);
  for (const dpr of [2, 1]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1920,
      height: 1080,
      deviceScaleFactor: dpr,
      mobile: false,
    });
    await page.waitForTimeout(1200); // sondajul de siguranță rulează la 500 ms
    const md = await measure(page);
    const eff = Math.min(dpr, { LOW: 1, MEDIUM: 1.5, HIGH: 2 }[preset]);
    record(
      `schimbare DPR la ${dpr} (în sesiune)`,
      near(md.render[0], 1920 * eff) && near(md.render[1], 1080 * eff),
      { dpr: md.dpr, render: md.render },
    );
  }
  const sceneAfter = await page.evaluate(() => JSON.stringify(globalThis.__v3Composition.stats()));
  const sameScene = JSON.parse(sceneAfter).vehicles === JSON.parse(sceneBefore).vehicles;
  record('scena nu a fost recreată (același __v3Composition, aceleași vehicule)', sameScene, {
    before: sceneBefore,
    after: sceneAfter,
  });
  const counts = await page.evaluate(() => globalThis.__listenerCounts);
  record('niciun ascultător nou resize/fullscreenchange adăugat la resize repetat', counts.add === 0, counts);
  void before;
  record('fără erori de consolă (sesiune lungă)', errors.length === 0, errors);
  await context.close();
}

// 4) Scurgeri la dispose: pagehide scoate ascultătorii pe care îi adaugă aplicația.
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const live = new Map();
    for (const target of [window, document]) {
      const add = target.addEventListener.bind(target);
      const remove = target.removeEventListener.bind(target);
      target.addEventListener = (type, fn, opts) => {
        if (['resize', 'fullscreenchange'].includes(type)) {
          const key = `${target === window ? 'w' : 'd'}:${type}`;
          const set = live.get(key) ?? new Set();
          set.add(fn);
          live.set(key, set);
        }
        return add(type, fn, opts);
      };
      target.removeEventListener = (type, fn, opts) => {
        const key = `${target === window ? 'w' : 'd'}:${type}`;
        live.get(key)?.delete(fn);
        return remove(type, fn, opts);
      };
    }
    globalThis.__liveListeners = () =>
      Object.fromEntries([...live].map(([k, v]) => [k, v.size]));
  });
  await page.goto(`${url}/?capture=1&preset=${preset}&backend=${backend}`, { waitUntil: 'load' });
  await page.waitForFunction(() => globalThis.__v3Composition?.ready() === true, null, {
    timeout: 60000,
  });
  const live = await page.evaluate(() => globalThis.__liveListeners());
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => globalThis.__liveListeners());
  record(
    'dispose (pagehide) scoate toți ascultătorii resize/fullscreenchange',
    Object.values(after).every((n) => n === 0) && Object.values(live).some((n) => n > 0),
    { live, after },
  );
  await context.close();
}

await browser.close();
await writeFile(join(out, `verify-${preset.toLowerCase()}-${backend}.json`), `${JSON.stringify(results, null, 2)}\n`);
const failed = results.checks.filter((c) => !c.ok);
console.log(failed.length === 0 ? `TOATE ${results.checks.length} OK` : `${failed.length} ESUATE`);
process.exitCode = failed.length === 0 ? 0 : 1;
