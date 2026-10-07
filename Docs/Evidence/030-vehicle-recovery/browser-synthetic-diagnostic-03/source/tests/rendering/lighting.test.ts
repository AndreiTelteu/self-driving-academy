import assert from 'node:assert/strict';
import test from 'node:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { createDaylight } from '../../src/rendering/babylon/daylight';
import { resolveQuality, createAdaptiveQuality } from '../../src/rendering/quality-policy';
const preferences = {
  preset: 'MEDIUM',
  preferredBackend: 'WEBGL2',
  resolutionScale: 1,
  adaptive: false,
} as const;

test('explicit DPR caps/resolution scaling, immutable limits and invalid input rejection', () => {
  const low = resolveQuality(
    { ...preferences, preset: 'LOW', resolutionScale: 0.75 },
    1280,
    720,
    2,
  );
  assert.equal(low.internalWidth, 960);
  assert.equal(low.internalHeight, 540);
  assert.equal(low.effectiveDpr, 1);
  assert.equal(resolveQuality(preferences, 1280, 720, 2).internalWidth, 1920);
  assert.equal(
    resolveQuality({ ...preferences, preset: 'HIGH' }, 1280, 720, 3).internalWidth,
    2560,
  );
  assert.ok(Object.isFrozen(low.limits));
  for (const bad of [NaN, Infinity, 0, -1])
    assert.throws(() => resolveQuality(preferences, bad, 720, 1));
  assert.throws(() => resolveQuality({ ...preferences, resolutionScale: 0.1 }, 640, 360, 1));
});

test('adaptive windows require GPU evidence, hysteresis/cooldown and manual override', () => {
  const quality = createAdaptiveQuality('MEDIUM', true);
  let now = 0;
  const feed = (count: number, frameMs: number, cpuMs: number, gpuMs: number | null) => {
    const changes = [];
    for (let i = 0; i < count; i++) {
      now += 16;
      const next = quality.sample({ frameMs, cpuMs, gpuMs }, now);
      if (next) changes.push(next);
    }
    return changes;
  };
  assert.deepEqual(feed(60, 30, 25, 4), []);
  assert.deepEqual(feed(60, 30, 2, null), []);
  assert.deepEqual(feed(30, 30, 2, 20), []);
  assert.deepEqual(feed(30, 30, 2, 20), ['LOW']);
  assert.deepEqual(feed(120, 10, 2, 5), []); // less than 5s since downgrade
  assert.deepEqual(feed(210, 10, 2, 5), ['MEDIUM']);
  assert.equal(quality.getPreset(), 'MEDIUM');
  quality.setManual('HIGH', now);
  assert.deepEqual(feed(120, 40, 2, 30), []);
  assert.equal(quality.getPreset(), 'HIGH');
  assert.throws(() => quality.sample({ frameMs: 10, cpuMs: 1, gpuMs: 1 }, 0), /regressed/);
});

test('daylight quality switches preserve materials/signals/domain and release shadows without accumulation', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const domain = Object.freeze({
    tick: 23,
    taxiCount: 24,
    dt: 1 / 60,
    xp: 99,
    profile: 'unchanged',
  });
  const before = JSON.stringify(domain);
  const light = createDaylight(scene, preferences, { width: 640, height: 360, dpr: 2 });
  const road = new Mesh('road', scene),
    vehicle = new Mesh('car', scene);
  road.material = light.material('road');
  road.receiveShadows = true;
  vehicle.material = light.material('vehicle');
  light.addShadowCaster(vehicle);
  const red = light.material('red');
  assert.equal(red.disableLighting, true);
  for (let i = 0; i < 20; i++) {
    light.applyPreferences({ ...preferences, preset: 'LOW' });
    assert.equal(light.getResourceCounts().shadowMaps, 0);
    light.applyPreferences(preferences);
    assert.equal(light.getResourceCounts().shadowMaps, 1);
    assert.equal(scene.lights.length, 2);
    assert.equal(scene.materials.length, 7);
    assert.equal(scene.textures.length, 1);
    assert.equal(light.material('red'), red);
  }
  assert.equal(JSON.stringify(domain), before);
  light.resize({ width: 800, height: 400, dpr: 1 });
  assert.equal(light.getQuality().internalWidth, 800);
  light.removeShadowCaster(vehicle);
  assert.equal(light.getResourceCounts().retainedCasters, 0);
  light.dispose();
  light.dispose();
  assert.deepEqual(light.getResourceCounts(), {
    lights: 0,
    materials: 0,
    shadowMaps: 0,
    retainedCasters: 0,
  });
  assert.equal(scene.lights.length, 0);
  assert.equal(scene.materials.length, 0);
  assert.equal(scene.textures.length, 0);
  assert.throws(() => light.material('road'), /disposed/);
  scene.dispose();
  engine.dispose();
});

test('bounded caster registry and atomic quality validation', () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const light = createDaylight(
    scene,
    { ...preferences, preset: 'LOW' },
    { width: 640, height: 360, dpr: 1 },
  );
  for (let i = 0; i < 96; i++)
    assert.equal(light.addShadowCaster(new Mesh(String(i), scene)), true);
  assert.equal(light.addShadowCaster(new Mesh('overflow', scene)), false);
  assert.throws(() => light.applyPreferences({ ...preferences, resolutionScale: NaN }));
  assert.equal(light.getQuality().preset, 'LOW');
  light.dispose();
  scene.dispose();
  engine.dispose();
});

test('removed active caster is refilled deterministically; foreign/disposed meshes rejected', () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    foreign = new Scene(engine);
  const daylight = createDaylight(scene, preferences, { width: 640, height: 360, dpr: 1 });
  const meshes = Array.from({ length: 49 }, (_, i) => new Mesh(`car${i}`, scene));
  meshes.forEach((mesh) => daylight.addShadowCaster(mesh));
  const shadow = scene.lights[1]!.getShadowGenerator()!;
  assert.equal(shadow.getShadowMap()!.renderList!.length, 48);
  assert.equal(shadow.getShadowMap()!.renderList!.includes(meshes[48]!), false);
  daylight.removeShadowCaster(meshes[0]!);
  assert.equal(shadow.getShadowMap()!.renderList!.length, 48);
  assert.equal(shadow.getShadowMap()!.renderList![47], meshes[48]);
  assert.throws(() => daylight.addShadowCaster(new Mesh('foreign', foreign)), /Invalid/);
  meshes[1]!.dispose();
  assert.throws(() => daylight.addShadowCaster(meshes[1]!), /Invalid/);
  daylight.dispose();
  scene.dispose();
  foreign.dispose();
  assert.throws(
    () => createDaylight(scene, preferences, { width: 640, height: 360, dpr: 1 }),
    /disposed/,
  );
  engine.dispose();
});

test('automatic presentation port applies GPU downgrade and manual preferences stop it', () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const daylight = createDaylight(
    scene,
    { ...preferences, adaptive: true },
    { width: 640, height: 360, dpr: 2 },
  );
  let changes = 0;
  for (let i = 1; i <= 60; i++)
    if (daylight.observe({ frameMs: 30, cpuMs: 2, gpuMs: 20 }, i * 16)) changes++;
  assert.equal(changes, 1);
  assert.equal(daylight.getQuality().preset, 'LOW');
  assert.equal(daylight.getQuality().internalWidth, 640);
  assert.equal(daylight.getResourceCounts().shadowMaps, 0);
  daylight.applyPreferences(preferences);
  for (let i = 1; i <= 60; i++)
    assert.equal(daylight.observe({ frameMs: 30, cpuMs: 2, gpuMs: 20 }, i * 16), false);
  assert.equal(daylight.getQuality().preset, 'MEDIUM');
  assert.equal(daylight.getResourceCounts().shadowMaps, 1);
  daylight.dispose();
  scene.dispose();
  engine.dispose();
});
