import assert from 'node:assert/strict';
import test from 'node:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import {
  InternalTexture,
  InternalTextureSource,
} from '@babylonjs/core/Materials/Textures/internalTexture.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { createDaylight } from '../../src/rendering/babylon/daylight';
import {
  DAYLIGHT_INPUT,
  DAYLIGHT_SUN_DIRECTION,
  backdropColor,
  buildEnvironmentFaces,
  createAtmosphereState,
  cubeTexelDirection,
  cubeTexelSolidAngle,
  environmentTextureBytes,
  floatToHalf,
  fogVisibility,
  radianceToDisplay,
  skyRadiance,
  sunDirectionFromAngles,
} from '../../src/rendering/atmosphere';
import { ATMOSPHERE_PRESETS } from '../../src/rendering/quality-policy';
import { RENDER_ASSET_CAPS } from '../../src/rendering/asset-budgets';

const prefs = (preset: 'LOW' | 'MEDIUM' | 'HIGH') =>
  ({ preset, preferredBackend: 'WEBGL2', resolutionScale: 1, adaptive: false }) as const;
const viewport = { width: 1280, height: 720, dpr: 1 };

// NullEngine nu are context GL: cubul raw devine o textură internă goală (conținutul se verifică
// separat, pe date, și în browser pe WebGL2 și WebGPU).
function stubCubeTextures(engine: NullEngine): void {
  (engine as unknown as { createRawCubeTexture: unknown }).createRawCubeTexture = () => {
    const texture = new InternalTexture(engine, InternalTextureSource.CubeRaw);
    texture.isCube = true;
    texture.isReady = true;
    return texture;
  };
}

function setup(preset: 'LOW' | 'MEDIUM' | 'HIGH' = 'HIGH') {
  const engine = new NullEngine();
  engine.getCaps().textureHalfFloatRender = true;
  stubCubeTextures(engine);
  const scene = new Scene(engine);
  const camera = new FreeCamera('cam', new Vector3(0, 1, -5), scene);
  scene.activeCamera = camera;
  const daylight = createDaylight(scene, prefs(preset), viewport);
  daylight.attachCamera(camera);
  return { engine, scene, daylight };
}

test('243: soarele din cer este exact opusul direcției luminii daylight-sun', () => {
  const state = createAtmosphereState();
  const light = new Vector3(...DAYLIGHT_SUN_DIRECTION).normalize();
  assert.ok(Vector3.Distance(new Vector3(...state.sunLightDirection), light) < 1e-9);
  assert.ok(Vector3.Distance(new Vector3(...state.sunToward), light.scale(-1)) < 1e-9);
  const { scene, daylight } = setup();
  const sun = scene.getLightByName('daylight-sun') as unknown as { direction: Vector3 };
  assert.ok(Vector3.Distance(sun.direction.normalizeToNew(), light) < 1e-6);
  const at = daylight.getAtmosphere();
  assert.deepEqual(at.sunToward, state.sunToward);
  // Cerul are cel mai strălucitor punct la soare.
  const towardSun = skyRadiance(state, state.sunToward, { disc: true });
  const away = skyRadiance(state, [-state.sunToward[0], state.sunToward[1], -state.sunToward[2]], {
    disc: true,
  });
  assert.ok(towardSun[0] > 10 * away[0]);
  assert.throws(() => createAtmosphereState({ ...DAYLIGHT_INPUT, sunDirection: [0, 1, 0] }));
  // `sunDirectionFromAngles` reproduce direcția `daylight-sun` din azimutul și elevația ei: stările
  // din 252 vor fi construite așa, deci discul și lumina rămân aliniate.
  const reference = new Vector3(...DAYLIGHT_SUN_DIRECTION).normalize();
  const elevationDeg = (Math.asin(-reference.y) * 180) / Math.PI;
  const azimuthDeg = (Math.atan2(-reference.x, -reference.z) * 180) / Math.PI;
  const rebuilt = new Vector3(...sunDirectionFromAngles(azimuthDeg, elevationDeg));
  assert.ok(Vector3.Distance(rebuilt, reference) < 1e-9);
  const fromAngles = createAtmosphereState({
    ...DAYLIGHT_INPUT,
    sunDirection: sunDirectionFromAngles(azimuthDeg, elevationDeg),
  });
  assert.ok(
    Vector3.Distance(new Vector3(...fromAngles.sunToward), new Vector3(...state.sunToward)) < 1e-9,
  );
  assert.ok(Math.abs(fromAngles.sunElevationRad - (elevationDeg * Math.PI) / 180) < 1e-9);
  // Convenția azimutului: 90° = soarele spre +X, deci lumina călătorește spre −X.
  assert.ok(sunDirectionFromAngles(90, 30)[0] < -0.8);
});

test('243: ceața are culoarea orizontului și lizibilitatea sub 80 m rămâne', () => {
  const state = createAtmosphereState();
  assert.deepEqual(state.fog.colorLinear, state.horizon);
  // Cerul la orizont (departe de soare) este chiar culoarea ceții.
  const flat = skyRadiance(state, [-state.sunToward[0], 0, -state.sunToward[2]]);
  for (let channel = 0; channel < 3; channel += 1)
    assert.ok(
      Math.abs(flat[channel]! - state.horizon[channel]!) < 0.02 * state.horizon[channel]! + 0.01,
    );
  assert.ok(fogVisibility(state, 80) > 0.99);
  assert.ok(fogVisibility(state, 700) < 0.8 && fogVisibility(state, 700) > 0.65);
  assert.ok(fogVisibility(state, 2500) < 0.03, 'crestele de la 2,5 km se topesc în cer');
  const { scene } = setup();
  assert.equal(scene.fogMode, 2);
  assert.equal(scene.fogDensity, state.fog.density);
  assert.deepEqual(scene.fogColor.asArray(), [...state.fog.colorGamma]);
  // Culoarea de ștergere: liniară în pipeline, iar pe LOW rezultatul expunerii + tone mapping + gamma
  // (ce ar da pipeline-ul), ca fundalul să arate la fel pe toate presetările.
  const display = radianceToDisplay(state.horizon, state.exposure);
  for (let channel = 0; channel < 3; channel += 1)
    assert.ok(Math.abs(display[channel]! - DAYLIGHT_INPUT.horizonDisplay[channel]!) < 0.1);
  assert.deepEqual(backdropColor(state, true), state.horizon);
});

test('243: o singură stare conduce ceața, ștergerea, soarele și IBL; apply le schimbă împreună', () => {
  const { scene, daylight } = setup();
  const before = daylight.getAtmosphereStats().environmentGenerations;
  const next = createAtmosphereState({
    ...DAYLIGHT_INPUT,
    horizonDisplay: [0.9, 0.7, 0.5],
    fogDensity: 0.002,
    sunDirection: sunDirectionFromAngles(40, 25),
  });
  daylight.setAtmosphere(next);
  assert.equal(scene.fogDensity, 0.002);
  assert.deepEqual(scene.fogColor.asArray(), [...next.fog.colorGamma]);
  assert.deepEqual(scene.clearColor.asArray().slice(0, 3), [...next.horizon]);
  const sun = scene.getLightByName('daylight-sun') as unknown as { direction: Vector3 };
  assert.ok(
    Vector3.Distance(sun.direction.normalizeToNew(), new Vector3(...next.sunLightDirection)) < 1e-6,
  );
  assert.equal(daylight.getAtmosphereStats().environmentGenerations, before + 1);
  assert.ok(scene.environmentTexture);
});

test('243: pe LOW cerul și ștergerea sunt în spațiul de afișare, pe MEDIUM/HIGH liniare', () => {
  const state = createAtmosphereState();
  for (const preset of ['LOW', 'MEDIUM', 'HIGH'] as const) {
    const { scene, daylight } = setup(preset);
    const expected = backdropColor(state, preset !== 'LOW');
    assert.deepEqual(scene.clearColor.asArray().slice(0, 3), [...expected], preset);
    assert.equal(daylight.getAtmosphereStats().imageByMaterials, preset === 'LOW');
  }
  // Comutare live: HIGH → LOW → HIGH.
  const { scene, daylight } = setup('HIGH');
  daylight.applyPreferences(prefs('LOW'), viewport);
  assert.deepEqual(scene.clearColor.asArray().slice(0, 3), [...backdropColor(state, false)]);
  daylight.applyPreferences(prefs('HIGH'), viewport);
  assert.deepEqual(scene.clearColor.asArray().slice(0, 3), [...backdropColor(state, true)]);
});

test('243: rezoluția IBL scade pe LOW și rămâne mult sub bugetul de texturi 223', () => {
  assert.deepEqual(
    Object.values(ATMOSPHERE_PRESETS).map((tier) => tier.environmentSize),
    [32, 64, 128],
  );
  assert.deepEqual(
    Object.values(ATMOSPHERE_PRESETS).map((tier) => tier.clouds),
    [false, false, true],
  );
  for (const preset of ['LOW', 'MEDIUM', 'HIGH'] as const) {
    const { daylight } = setup(preset);
    const stats = daylight.getAtmosphereStats();
    assert.equal(stats.environmentSize, ATMOSPHERE_PRESETS[preset].environmentSize);
    assert.equal(
      stats.environmentGpuBytes,
      environmentTextureBytes(stats.environmentSize, stats.environmentFormat === 'HALF_FLOAT'),
    );
    assert.ok(stats.environmentGpuBytes < 0.01 * RENDER_ASSET_CAPS.textureGpuBytes[preset], preset);
    assert.equal(stats.drawCalls, 1);
  }
  // O singură generare la încărcare (preset aplicat o dată), nu una pe cadru.
  const { scene, daylight } = setup('MEDIUM');
  const generations = daylight.getAtmosphereStats().environmentGenerations;
  for (let frame = 0; frame < 5; frame += 1) scene.render();
  assert.equal(daylight.getAtmosphereStats().environmentGenerations, generations);
});

test('243: cubul de mediu are fețele în ordinea GL, soare exclus, cer sus și sol jos', () => {
  const state = createAtmosphereState();
  const size = 16;
  const faces = buildEnvironmentFaces(state, size);
  assert.equal(faces.length, 6);
  const center = () => (size / 2 - 1 + (size / 2 - 1) * size) * 4;
  // +Y este cerul (spre zenit), -Y este solul.
  const up = faces[2]![center() + 2]!;
  const down = faces[3]![center() + 2]!;
  assert.ok(up > 0.1 && up > 2 * down);
  // Direcțiile texelilor acoperă sfera: suma unghiurilor solide este 4π pe șase fețe.
  let solid = 0;
  for (let face = 0; face < 6; face += 1)
    for (let row = 0; row < size; row += 1)
      for (let column = 0; column < size; column += 1)
        solid += cubeTexelSolidAngle(column, row, size);
  assert.ok(Math.abs(solid - 4 * Math.PI) < 1e-6);
  // Convenția Babylon: fața +X are dir = (1, -v, -u).
  assert.deepEqual(cubeTexelDirection(0, 0, 0, 2), [1, 0.5, 0.5]);
  // Fără disc: valoarea maximă a cubului rămâne mică (nu 34× discul).
  let max = 0;
  for (const face of faces) for (const value of face) max = Math.max(max, value);
  assert.ok(max < 3, `max ${max}`);
  assert.throws(() => buildEnvironmentFaces(state, 24));
  // Half-float: valori exacte pentru puteri ale lui 2 și saturare.
  assert.equal(floatToHalf(1), 0x3c00);
  assert.equal(floatToHalf(0.5), 0x3800);
  assert.equal(floatToHalf(1e9), 0x7bff);
  assert.equal(floatToHalf(0), 0);
});

test('243: ceața și IBL dezgheață materialele înghețate și le îngheață din nou', () => {
  const engine = new NullEngine();
  engine.getCaps().textureHalfFloatRender = true;
  stubCubeTextures(engine);
  const scene = new Scene(engine);
  const camera = new FreeCamera('cam', new Vector3(0, 1, -5), scene);
  scene.activeCamera = camera;
  const material = new StandardMaterial('city-like', scene);
  const mesh = new Mesh('m', scene);
  mesh.material = material;
  material.freeze();
  assert.equal(material.isFrozen, true);
  const daylight = createDaylight(scene, prefs('HIGH'), viewport);
  daylight.attachCamera(camera);
  assert.equal(material.isFrozen, false, 'dezghețat pentru recompilare');
  for (let frame = 0; frame < 4; frame += 1) scene.render();
  assert.equal(material.isFrozen, true, 'înghețat din nou după recompilare');
  daylight.dispose();
  assert.equal(scene.fogMode, 0);
  assert.equal(scene.environmentTexture, null);
});

test('243: ambientul hemisferic de rezervă este redus și poate fi coborât de materialele PBR', () => {
  const { scene, daylight } = setup();
  const ambient = scene.getLightByName('daylight-ambient') as unknown as { intensity: number };
  const state = daylight.getAtmosphere();
  assert.ok(ambient.intensity < 0.55, 'sub 0,55 de la 241');
  assert.equal(ambient.intensity, state.legacyAmbient.intensity);
  daylight.setLegacyAmbientScale(0);
  assert.equal(ambient.intensity, 0);
  assert.throws(() => daylight.setLegacyAmbientScale(2));
});
