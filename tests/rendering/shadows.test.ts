/**
 * PBI 244 — umbre reale și ocluzie ambientală: matematica hărții care urmărește camera, normalele
 * clădirilor (cauza AO-ului greșit pe pereți), conținutul contractului 157 și ciclul de viață.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { Scene } from '@babylonjs/core/scene.js';
import { createDaylight, SHADOW_MAP_CONTENT } from '../../src/rendering/babylon/daylight';
import { createCityScene } from '../../src/rendering/babylon/city-scene';
import { contactShadowAlpha } from '../../src/rendering/babylon/contact-shadows';
import { AO_PRESETS, SHADOW_PRESETS } from '../../src/rendering/quality-policy';
import {
  followShadowFrame,
  groundFocus,
  lightFrame,
  motionSignature,
  snapToTexelGrid,
  type Vec3,
} from '../../src/rendering/shadow-math';
import { createCityLayout, createNeighbourhoodMap } from '../../src/world';

const SUN: Vec3 = [-0.39, -0.87, 0.3];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

test('244: cadrul luminii este ortonormal și urmează convenția LookAtLH', () => {
  const frame = lightFrame(SUN);
  assert.ok(Math.abs(dot(frame.right, frame.up)) < 1e-9);
  assert.ok(Math.abs(dot(frame.right, frame.forward)) < 1e-9);
  assert.ok(Math.abs(dot(frame.up, frame.forward)) < 1e-9);
  assert.ok(Math.abs(Math.hypot(...frame.right) - 1) < 1e-9);
  // Lumină verticală: ocolul nu produce NaN.
  const vertical = lightFrame([0, -1, 0]);
  assert.ok(vertical.right.every(Number.isFinite) && vertical.up.every(Number.isFinite));
});

test('244: centrul hărții aliniat pe texeli se mișcă numai în pași întregi de texel', () => {
  const half = 30;
  const size = 1024;
  const texel = (2 * half) / size;
  const frame = lightFrame(SUN);
  const gridCoordinates = (point: Vec3): [number, number] => [
    dot(point, frame.right) / texel,
    dot(point, frame.up) / texel,
  ];
  for (let step = 0; step < 200; step += 1) {
    const focus: Vec3 = [100 + step * 0.0137, 0, 12 - step * 0.0091];
    const snapped = snapToTexelGrid(focus, frame, half, size);
    const [r, u] = gridCoordinates(snapped);
    assert.ok(Math.abs(r - Math.round(r)) < 1e-6, `rând ${step}: ${r}`);
    assert.ok(Math.abs(u - Math.round(u)) < 1e-6, `rând ${step}: ${u}`);
    // Adâncimea (axa luminii) nu se modifică.
    assert.ok(Math.abs(dot(snapped, frame.forward) - dot(focus, frame.forward)) < 1e-9);
  }
});

test('244: la rotația camerei de 360° un punct al lumii cade mereu pe aceeași fracție de texel', () => {
  const position: Vec3 = [105, 2, 12];
  const half = 30;
  const size = 1024;
  const frame = lightFrame(SUN);
  const texel = (2 * half) / size;
  // Un colț de clădire: marginea umbrei lui nu are voie să „înoate" peste texeli când privirea se rotește.
  const corner: Vec3 = [118.37, 0, 41.91];
  const fraction = (value: number): number => value - Math.floor(value);
  const reference = fraction(dot(corner, frame.right) / texel);
  const referenceUp = fraction(dot(corner, frame.up) / texel);
  const centres = new Set<string>();
  let worst = 0;
  for (let degrees = 0; degrees < 360; degrees += 2) {
    const radians = (degrees * Math.PI) / 180;
    const target: Vec3 = [
      position[0] + Math.sin(radians) * 20,
      1,
      position[2] + Math.cos(radians) * 20,
    ];
    const map = followShadowFrame(groundFocus(position, target, 18), SUN, half, size, 100);
    centres.add(map.center.map((value) => value.toFixed(3)).join(','));
    // Poziția punctului în rețeaua hărții = (corner − centru) / texel; partea fracționară trebuie
    // să fie cea de referință (centrul este multiplu întreg de texel).
    const r = fraction(dot(corner, frame.right) / texel - dot(map.center, frame.right) / texel);
    const u = fraction(dot(corner, frame.up) / texel - dot(map.center, frame.up) / texel);
    const wrap = (d: number): number => Math.min(Math.abs(d), 1 - Math.abs(d));
    worst = Math.max(worst, wrap(r - reference), wrap(u - referenceUp));
  }
  assert.ok(worst < 1e-6, `deriva sub-texel la rotație: ${worst}`);
  assert.ok(centres.size > 20, 'harta chiar urmărește focarul în timpul rotației');
});

test('244: focarul pe sol este limitat și nu produce valori invalide', () => {
  assert.deepEqual(groundFocus([0, 2, 0], [0, 2, 0], 18), [0, 0, 0]);
  const forward = groundFocus([0, 2, 0], [10, 2, 0], 18);
  assert.ok(Math.abs(forward[0] - 18) < 1e-9 && forward[1] === 0);
  const down = groundFocus([0, 2, 0], [4, 0, 0], 18);
  assert.ok(Math.abs(down[0] - 4) < 1e-9);
});

test('244: semnătura mișcării este stabilă și sensibilă la schimbări de ordin milimetric', () => {
  assert.equal(motionSignature([1, 2, 3]), motionSignature([1, 2, 3]));
  assert.notEqual(motionSignature([1, 2, 3]), motionSignature([1, 2, 3.001]));
  assert.equal(motionSignature([1, 2, 3]), motionSignature([1, 2, 3.00001]));
});

test('244: umbra de contact este moale la margine și maximă în centru', () => {
  assert.ok(contactShadowAlpha(0, 0) > 0.99);
  assert.equal(contactShadowAlpha(1, 0), 0);
  assert.equal(contactShadowAlpha(0.9, 0.9), 0);
  assert.ok(contactShadowAlpha(0.5, 0) > 0 && contactShadowAlpha(0.5, 0) < 1);
});

test('244: presetările umbrelor și AO respectă tier-urile cerute', () => {
  assert.equal(SHADOW_PRESETS.LOW.mode, 'BLOB');
  assert.equal(SHADOW_PRESETS.LOW.mapSize, 0);
  assert.equal(SHADOW_PRESETS.MEDIUM.mode, 'MAP');
  assert.equal(SHADOW_PRESETS.MEDIUM.cascades, 1);
  assert.equal(SHADOW_PRESETS.HIGH.mode, 'CASCADED');
  assert.ok(SHADOW_PRESETS.HIGH.cascades >= 3 && SHADOW_PRESETS.HIGH.cascades <= 4);
  assert.equal(SHADOW_PRESETS.HIGH.filter, 'PCF');
  assert.equal(AO_PRESETS.LOW.enabled, false);
  assert.equal(AO_PRESETS.MEDIUM.enabled, true);
  assert.ok(AO_PRESETS.MEDIUM.totalStrength < AO_PRESETS.HIGH.totalStrength);
  assert.ok(AO_PRESETS.MEDIUM.samples < AO_PRESETS.HIGH.samples);
});

test('244: pereții clădirilor au normale spre exterior (altfel SSAO îi vede ca pe niște găuri)', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const layout = createCityLayout(createNeighbourhoodMap());
  const city = createCityScene(scene, layout);
  try {
    const mesh = city.shadowCasterMeshes()[0]!;
    assert.ok(mesh.name.includes('building'));
    const positions = mesh.getVerticesData('position')!;
    const normals = mesh.getVerticesData('normal')!;
    const buildings = layout.elements.filter((element) => element.kind === 'BUILDING');
    const centre = new Map<string, [number, number]>();
    const topY = new Map<string, number>();
    let wallVertices = 0;
    let inward = 0;
    // Un vârf de perete (normala orizontală) trebuie să arate departe de centrul clădirii lui.
    // 246: cutiile de detaliu ale acoperișului (AC, ventilație, casa scării) sunt obiecte
    // independente pe placă — nu au un „exterior” radial, deci nu intră în verificare.
    // Le recunoaștem geometric: pereții clădirilor 042 sunt pe axe (o componentă a normalei este
    // exact 0), iar vârfurile de colț ale cutiilor poartă normale mediate (ambele componente
    // nenule), iar cele de sus stau peste cota plăcii.
    for (const building of buildings) {
      const planar = building as unknown as {
        footprintM: { x: number; z: number }[];
        baseYM: number;
        heightM: number;
      };
      const xs = planar.footprintM.map((p) => p.x);
      const zs = planar.footprintM.map((p) => p.z);
      centre.set(building.id, [
        xs.reduce((a, b) => a + b, 0) / xs.length,
        zs.reduce((a, b) => a + b, 0) / zs.length,
      ]);
      topY.set(building.id, planar.baseYM + planar.heightM);
    }
    const geometry = (id: string) => city.elementGeometry(id)!;
    for (const building of buildings.slice(0, 20)) {
      const slice = geometry(building.id);
      const [cx, cz] = centre.get(building.id)!;
      const roofY = topY.get(building.id)!;
      for (let v = slice.offset; v < slice.offset + slice.count; v += 1) {
        const nx = normals[v * 3]!;
        const ny = normals[v * 3 + 1]!;
        const nz = normals[v * 3 + 2]!;
        if (Math.abs(ny) > 0.5) continue;
        if (positions[v * 3 + 1]! > roofY + 1e-3) continue; // detaliu de acoperiș (sus)
        if (Math.min(Math.abs(nx), Math.abs(nz)) > 0.05) continue; // colț mediat, nu perete
        wallVertices += 1;
        const toward = (positions[v * 3]! - cx) * nx + (positions[v * 3 + 2]! - cz) * nz;
        if (toward < 0) inward += 1;
      }
    }
    assert.ok(wallVertices > 0);
    assert.equal(inward, 0, `${inward}/${wallVertices} vârfuri de perete cu normala spre interior`);
    // 246: fără `surfaces` clădirile cad pe lotul plat `building` (cu vertex colors);
    // stâlpii și carcasele semafoarelor rămân instanțe.
    assert.deepEqual(
      city.shadowCasterMeshes().map((entry) => entry.name),
      ['city:batch:building', 'city:signal:post', 'city:signal:housing'],
    );
  } finally {
    city.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test('244: contractul 157 declară noua listă și păstrează prioritatea essential', () => {
  const joined = SHADOW_MAP_CONTENT.includes.join(' ');
  assert.match(joined, /clădirile/);
  assert.match(joined, /decorul/);
  assert.match(joined, /essential/);
  assert.match(SHADOW_MAP_CONTENT.excludes.join(' '), /carosabil/);
});

test('244: casterii statici ies din listă când sunt departe de focar, essential rămâne', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const daylight = createDaylight(
    scene,
    { preset: 'MEDIUM', preferredBackend: 'WEBGL2', resolutionScale: 1, adaptive: false },
    { width: 640, height: 360, dpr: 1 },
  );
  const taxi = new Mesh('taxi', scene);
  const near = new Mesh('near-building', scene);
  const far = new Mesh('far-building', scene);
  near.position.set(10, 0, 0);
  far.position.set(900, 0, 0);
  daylight.addShadowCaster(taxi, 'essential');
  daylight.addShadowCaster(near, 'optional');
  daylight.addShadowCaster(far, 'optional');
  // Fără focar (primul cadru) toți sunt în listă; după primul update, cel îndepărtat iese.
  daylight.updateShadows({
    cameraPosition: [0, 2, 0],
    cameraTarget: [0, 1, 10],
    motionSignature: 1,
  });
  const list = scene.lights[1]!.getShadowGenerator()!.getShadowMap()!.renderList!;
  assert.ok(list.includes(taxi) && list.includes(near));
  assert.equal(list.includes(far), false);
  assert.equal(list[0], taxi, 'essential este primul');
  const stats = daylight.getShadowStats();
  assert.equal(stats.mode, 'MAP');
  assert.equal(stats.staticCache, true);
  daylight.dispose();
  scene.dispose();
  engine.dispose();
});

test('244: cache-ul static randează numai la schimbare (soare, mișcare, vedere)', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const daylight = createDaylight(
    scene,
    { preset: 'MEDIUM', preferredBackend: 'WEBGL2', resolutionScale: 1, adaptive: false },
    { width: 640, height: 360, dpr: 1 },
  );
  const view = { cameraPosition: [0, 2, 0] as Vec3, cameraTarget: [0, 1, 10] as Vec3 };
  const before = Object.keys(daylight.getShadowStats().invalidations).length;
  for (let frame = 0; frame < 120; frame += 1)
    daylight.updateShadows({ ...view, motionSignature: 7 });
  const stats = daylight.getShadowStats();
  // După încălzire (45 de cadre) nu se mai cere nicio invalidare pentru o scenă imobilă.
  assert.ok(stats.invalidations.warmup! <= 45);
  const settled = stats.invalidations.warmup! + (stats.invalidations.view ?? 0);
  for (let frame = 0; frame < 60; frame += 1)
    daylight.updateShadows({ ...view, motionSignature: 7 });
  const after = daylight.getShadowStats();
  assert.equal(after.invalidations.warmup! + (after.invalidations.view ?? 0), settled);
  const sunBefore = after.invalidations.sun ?? 0;
  daylight.setAtmosphere({ ...daylight.getAtmosphere() });
  assert.equal(daylight.getShadowStats().invalidations.sun, sunBefore + 1);
  daylight.updateShadows({ ...view, motionSignature: 8 });
  assert.equal(
    (daylight.getShadowStats().invalidations.view ?? 0) > (after.invalidations.view ?? 0),
    true,
  );
  assert.ok(before >= 0);
  daylight.dispose();
  scene.dispose();
  engine.dispose();
});
