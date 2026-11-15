import assert from 'node:assert/strict';
import test from 'node:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { createDaylight } from '../../src/rendering/babylon/daylight';
import {
  observeDisplaySurface,
  readDisplayMetrics,
  type DisplayEnvironment,
} from '../../src/rendering/display-surface';
import {
  ADAPTIVE_RESOLUTION_FACTORS,
  createAdaptiveQuality,
  effectiveResolutionScale,
  resolveQuality,
} from '../../src/rendering/quality-policy';

/** PBI 240: rezoluția internă = CSS × min(DPR, maxDpr) × scara, cu limite explicite. */
const prefs = {
  preset: 'HIGH',
  preferredBackend: 'WEBGPU',
  resolutionScale: 1,
  adaptive: false,
} as const;

test('240 HIGH la 1920×1080 cu DPR 1 randează 1920×1080', () => {
  const quality = resolveQuality(prefs, 1920, 1080, 1);
  assert.equal(quality.internalWidth, 1920);
  assert.equal(quality.internalHeight, 1080);
});

test('240 DPR-ul real este plafonat de preset: HIGH 2, MEDIUM 1,5, LOW 1', () => {
  const at = (preset: 'LOW' | 'MEDIUM' | 'HIGH', dpr: number) =>
    resolveQuality({ ...prefs, preset }, 1920, 1080, dpr);
  assert.equal(at('HIGH', 2).internalWidth, 3840);
  assert.equal(at('HIGH', 3).internalWidth, 3840);
  assert.equal(at('MEDIUM', 2).internalWidth, 2880);
  assert.equal(at('MEDIUM', 2).internalHeight, 1620);
  assert.equal(at('LOW', 2).internalWidth, 1920);
  assert.equal(at('HIGH', 1.25).internalWidth, 2400);
  // Un DPR sub 1 (zoom out) scade rezoluția, nu este ridicat la 1.
  assert.equal(at('HIGH', 0.5).internalWidth, 960);
});

test('240 scara se aplică peste DPR și rezultatul se rotunjește în jos, minim 1 px', () => {
  const scaled = resolveQuality({ ...prefs, resolutionScale: 0.75 }, 1921, 1081, 1.5);
  assert.equal(scaled.internalWidth, Math.floor(1921 * 1.5 * 0.75));
  assert.equal(scaled.internalHeight, Math.floor(1081 * 1.5 * 0.75));
  assert.equal(resolveQuality({ ...prefs, resolutionScale: 0.5 }, 1, 1, 1).internalWidth, 1);
});

test('240 valorile în afara limitelor sunt respinse', () => {
  assert.throws(() => resolveQuality(prefs, 0, 1080, 1));
  assert.throws(() => resolveQuality(prefs, 16385, 1080, 1));
  assert.throws(() => resolveQuality(prefs, 1920, 1080, 0));
  assert.throws(() => resolveQuality(prefs, 1920, 1080, 9));
  assert.throws(() => resolveQuality({ ...prefs, resolutionScale: 0.49 }, 1920, 1080, 1));
  assert.throws(() => resolveQuality({ ...prefs, resolutionScale: 1.01 }, 1920, 1080, 1));
});

test('240 scara efectivă combină alegerea jucătorului cu factorul adaptiv și nu coboară sub 0,5', () => {
  assert.equal(effectiveResolutionScale(1, 1), 1);
  assert.equal(effectiveResolutionScale(1, 0.85), 0.85);
  assert.equal(effectiveResolutionScale(0.75, 0.55), 0.5);
  assert.equal(effectiveResolutionScale(0.5, 0.55), 0.5);
  assert.throws(() => effectiveResolutionScale(0.4, 1));
  assert.throws(() => effectiveResolutionScale(1, 0));
  assert.ok(Object.isFrozen(ADAPTIVE_RESOLUTION_FACTORS));
  assert.equal(ADAPTIVE_RESOLUTION_FACTORS[0], 1);
});

test('240 politica adaptivă coboară rezoluția întâi, o readuce întâi și rămâne neschimbată fără opțiune', () => {
  let now = 0;
  const run = (
    policy: ReturnType<typeof createAdaptiveQuality>,
    frameMs: number,
    gpuMs: number,
  ) => {
    const changes: string[] = [];
    for (let i = 0; i < 60; i++) {
      now += 16;
      const next = policy.sample({ frameMs, cpuMs: 2, gpuMs }, now);
      if (next) changes.push(next);
    }
    return changes;
  };
  const legacy = createAdaptiveQuality('HIGH', true);
  assert.deepEqual(run(legacy, 30, 20), ['MEDIUM']);
  assert.equal(legacy.getResolutionFactor(), 1);

  const policy = createAdaptiveQuality('HIGH', true, { adaptResolution: true });
  assert.deepEqual(run(policy, 30, 20), []);
  assert.equal(policy.getResolutionFactor(), 0.85);
  assert.equal(policy.getPreset(), 'HIGH');
  // CPU-bound sau GPU necunoscut nu schimbă nimic.
  now += 5000;
  assert.deepEqual(run(policy, 30, 0), []);
  assert.equal(policy.getResolutionFactor(), 0.85);
  now += 5000;
  run(policy, 30, 20);
  now += 5000;
  run(policy, 30, 20);
  assert.equal(policy.getResolutionFactor(), 0.55);
  now += 5000;
  assert.deepEqual(run(policy, 30, 20), ['MEDIUM']);
  assert.equal(policy.getResolutionFactor(), 0.55);
  // Revenire: patru ferestre bune readuc un pas de rezoluție, nu presetul.
  now += 5000;
  for (let i = 0; i < 2; i++) assert.deepEqual(run(policy, 10, 4), []);
  assert.equal(policy.getResolutionFactor(), 0.7);
  assert.equal(policy.getPreset(), 'MEDIUM');
  policy.setManual('HIGH', now);
  assert.equal(policy.getResolutionFactor(), 1);
});

test('240 daylight exprimă rezoluția ca nivel hardware și o actualizează la resize/DPR fără scenă nouă', () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  // NullEngine nu memorează nivelul: se înregistrează ultimul apel, exact ce ar primi un motor real.
  let applied = 1;
  engine.setHardwareScalingLevel = (value: number) => {
    applied = value;
  };
  const level = () => applied;
  const rendered = (cssWidth: number) => Math.floor(cssWidth / level());
  const daylight = createDaylight(scene, prefs, { width: 1920, height: 1080, dpr: 1 });
  assert.equal(rendered(1920), 1920);
  daylight.resize({ width: 1920, height: 1080, dpr: 2 });
  assert.equal(rendered(1920), 3840);
  assert.equal(daylight.getQuality().internalHeight, 2160);
  daylight.resize({ width: 1280, height: 720, dpr: 1.25 });
  assert.equal(rendered(1280), 1600);
  assert.equal(daylight.getResolutionState().internalWidth, 1600);
  // Rotunjirea în virgulă mobilă nu pierde niciun pixel la scări netriviale.
  daylight.applyPreferences(
    { ...prefs, resolutionScale: 0.75 },
    { width: 1920, height: 1080, dpr: 1 },
  );
  assert.equal(rendered(1920), 1440);
  assert.throws(() => daylight.resize({ width: 0, height: 1, dpr: 1 }));
  assert.equal(rendered(1920), 1440, 'o intrare invalidă nu schimbă starea');
  daylight.dispose();
  scene.dispose();
  engine.dispose();
});

interface FakeEvents {
  resize: Set<() => void>;
  fullscreen: Set<() => void>;
  dpr: Set<() => void>;
  observer: { callback: () => void; disconnected: boolean } | null;
  polls: Map<number, () => void>;
}
function fakeEnvironment(initial: { w: number; h: number; dpr: number }) {
  const events: FakeEvents = {
    resize: new Set(),
    fullscreen: new Set(),
    dpr: new Set(),
    observer: null,
    polls: new Map(),
  };
  const state = { ...initial };
  const queries: string[] = [];
  const env: DisplayEnvironment = {
    get devicePixelRatio() {
      return state.dpr;
    },
    get innerWidth() {
      return state.w;
    },
    get innerHeight() {
      return state.h;
    },
    addEventListener: (_type, listener) => events.resize.add(listener),
    removeEventListener: (_type, listener) => events.resize.delete(listener),
    matchMedia: (query) => {
      queries.push(query);
      let own: (() => void) | undefined;
      return {
        addEventListener: (_t, listener) => {
          own = listener;
          events.dpr.add(listener);
        },
        removeEventListener: (_t, listener) => {
          if (own === listener) events.dpr.delete(listener);
        },
      };
    },
    ResizeObserver: class {
      constructor(callback: () => void) {
        events.observer = { callback, disconnected: false };
      }
      observe(): void {}
      disconnect(): void {
        if (events.observer) events.observer.disconnected = true;
      }
    },
    setInterval: (callback) => {
      events.polls.set(7, callback);
      return 7;
    },
    clearInterval: (handle) => {
      events.polls.delete(handle);
    },
    document: {
      addEventListener: (_t, listener) => events.fullscreen.add(listener),
      removeEventListener: (_t, listener) => events.fullscreen.delete(listener),
    },
  };
  const canvas = {
    get clientWidth() {
      return state.w;
    },
    get clientHeight() {
      return state.h;
    },
  } as unknown as HTMLCanvasElement;
  return { env, events, state, canvas, queries };
}

test('240 suprafața observă resize, ecran complet și DPR, notifică doar schimbările și nu scurge ascultători', () => {
  const fake = fakeEnvironment({ w: 1280, h: 720, dpr: 1 });
  const seen: string[] = [];
  const surface = observeDisplaySurface({
    canvas: fake.canvas,
    env: fake.env,
    onChange: (m) => seen.push(`${m.width}x${m.height}@${m.dpr}`),
  });
  assert.equal(surface.listeners(), 5);
  assert.deepEqual(surface.metrics(), { width: 1280, height: 720, dpr: 1 });
  // Nimic schimbat: niciun apel.
  for (const listener of fake.events.resize) listener();
  assert.deepEqual(seen, []);
  // Redimensionare fereastră.
  fake.state.w = 1920;
  fake.state.h = 1080;
  for (const listener of fake.events.resize) listener();
  // Ecran complet: același eveniment de metrici prin ResizeObserver/fullscreenchange.
  fake.state.w = 2560;
  fake.state.h = 1440;
  for (const listener of fake.events.fullscreen) listener();
  // Mutare pe un monitor cu alt DPR: interogarea veche declanșează și se re-armează pe noul DPR.
  fake.state.dpr = 2;
  for (const listener of [...fake.events.dpr]) listener();
  assert.deepEqual(seen, ['1920x1080@1', '2560x1440@1', '2560x1440@2']);
  assert.deepEqual(fake.queries, ['(resolution: 1dppx)', '(resolution: 2dppx)']);
  assert.equal(fake.events.dpr.size, 1, 'interogarea veche a fost scoasă');
  fake.events.observer?.callback();
  assert.equal(seen.length, 3);
  // DPR schimbat fără niciun eveniment (de exemplu sub emulare): sondajul de siguranță îl prinde.
  fake.state.dpr = 1.5;
  fake.events.polls.get(7)?.();
  assert.deepEqual(seen.at(-1), '2560x1440@1.5');
  assert.equal(seen.length, 4);
  surface.dispose();
  assert.equal(fake.events.resize.size, 0);
  assert.equal(fake.events.fullscreen.size, 0);
  assert.equal(fake.events.dpr.size, 0);
  assert.equal(fake.events.observer?.disconnected, true);
  assert.equal(fake.events.polls.size, 0);
  assert.equal(surface.listeners(), 0);
  // După dispose nimic nu mai notifică.
  fake.state.w = 800;
  assert.equal(surface.refresh(), false);
  assert.equal(seen.length, 4);
  surface.dispose();
});

test('240 metricile sunt limitate la intervalul contractului și cad pe fereastră când canvasul e ascuns', () => {
  const metrics = readDisplayMetrics(
    { clientWidth: 0, clientHeight: 0 },
    { devicePixelRatio: 2, innerWidth: 1600, innerHeight: 900 },
  );
  assert.deepEqual({ ...metrics }, { width: 1600, height: 900, dpr: 2 });
  const extreme = readDisplayMetrics(
    { clientWidth: 99999, clientHeight: 99999 },
    { devicePixelRatio: 99, innerWidth: 1, innerHeight: 1 },
  );
  assert.deepEqual({ ...extreme }, { width: 16384, height: 16384, dpr: 8 });
  const broken = readDisplayMetrics(
    { clientWidth: 0, clientHeight: 0 },
    { devicePixelRatio: Number.NaN, innerWidth: 0, innerHeight: 0 },
  );
  assert.deepEqual({ ...broken }, { width: 1, height: 1, dpr: 1 });
  // Rezultatul trece mereu prin resolveQuality fără să arunce.
  assert.doesNotThrow(() => resolveQuality(prefs, extreme.width, extreme.height, extreme.dpr));
});
