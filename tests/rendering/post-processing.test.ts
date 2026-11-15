import assert from 'node:assert/strict';
import test from 'node:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { createDaylight } from '../../src/rendering/babylon/daylight';
import { POST_PROCESSING_PRESETS, QUALITY_PRESETS } from '../../src/rendering/quality-policy';

const prefs = (preset: 'LOW' | 'MEDIUM' | 'HIGH') =>
  ({ preset, preferredBackend: 'WEBGL2', resolutionScale: 1, adaptive: false }) as const;
const viewport = { width: 1280, height: 720, dpr: 1 };

function setup() {
  const engine = new NullEngine();
  // NullEngine nu anunță ținte half-float; pipeline-ul HDR cere capacitatea (ca pe un GPU real).
  engine.getCaps().textureHalfFloatRender = true;
  const scene = new Scene(engine);
  const camera = new FreeCamera('cam', new Vector3(0, 1, -5), scene);
  scene.activeCamera = camera;
  const daylight = createDaylight(scene, prefs('HIGH'), viewport);
  daylight.attachCamera(camera);
  return { engine, scene, daylight };
}
const counts = (scene: Scene) => ({
  textures: scene.textures.length,
  postProcesses: scene.postProcesses.length,
  pipelines: scene.postProcessRenderPipelineManager.supportedPipelines.length,
  cameraPasses: scene.activeCamera!._postProcesses.filter(Boolean).length,
  materials: scene.materials.length,
});

test('presets declare AA and effects per tier; LOW is cheap', () => {
  assert.equal(POST_PROCESSING_PRESETS.HIGH.msaaSamples, 4);
  assert.equal(POST_PROCESSING_PRESETS.MEDIUM.antialias, 'FXAA');
  assert.equal(POST_PROCESSING_PRESETS.LOW.pipeline, false);
  for (const key of ['bloom', 'sharpen', 'vignette', 'grading', 'dithering'] as const)
    assert.equal(POST_PROCESSING_PRESETS.LOW[key], false);
  assert.deepEqual(Object.keys(POST_PROCESSING_PRESETS), Object.keys(QUALITY_PRESETS));
});

test('image processing is applied exactly once: pipeline XOR materials, one configuration', () => {
  const { engine, scene, daylight } = setup();
  const config = scene.imageProcessingConfiguration;
  const owners = (state: ReturnType<typeof daylight.getPostProcessingState>) =>
    Number(state.imageProcessingByPostProcess) + Number(!state.imageProcessingByPostProcess);
  for (const preset of ['HIGH', 'LOW', 'MEDIUM', 'LOW', 'HIGH'] as const) {
    daylight.applyPreferences(prefs(preset), viewport);
    const state = daylight.getPostProcessingState();
    assert.equal(state.toneMappingEnabled, true);
    assert.equal(owners(state), 1);
    assert.equal(state.imageProcessingByPostProcess, preset !== 'LOW', preset);
    assert.equal(state.mode, preset === 'LOW' ? 'MATERIAL_FXAA' : 'PIPELINE');
    assert.equal(config.applyByPostProcess, preset !== 'LOW');
  }
  // Fără configurații paralele: niciun material nu poartă una proprie.
  for (const material of scene.materials)
    assert.equal(
      (material as unknown as { _imageProcessingConfiguration?: unknown })
        ._imageProcessingConfiguration ?? config,
      config,
      material.name,
    );
  daylight.dispose();
  assert.equal(config.applyByPostProcess, false);
  scene.dispose();
  engine.dispose();
});

test('20 live preset switches leave no extra post processes, pipelines or textures', () => {
  const { engine, scene, daylight } = setup();
  const baseline = new Map<string, ReturnType<typeof counts>>();
  for (const preset of ['LOW', 'MEDIUM', 'HIGH'] as const) {
    daylight.applyPreferences(prefs(preset), viewport);
    baseline.set(preset, counts(scene));
  }
  const order = ['LOW', 'MEDIUM', 'HIGH'] as const;
  for (let i = 0; i < 20; i++) {
    const preset = order[(i * 2 + 1) % 3]!;
    daylight.applyPreferences(prefs(preset), viewport);
    assert.deepEqual(counts(scene), baseline.get(preset), `switch ${i} -> ${preset}`);
  }
  assert.equal(counts(scene).pipelines + counts(scene).postProcesses > 0, true);
  daylight.dispose();
  assert.equal(scene.postProcessRenderPipelineManager.supportedPipelines.length, 0);
  assert.equal(scene.activeCamera!._postProcesses.filter(Boolean).length, 0);
  scene.dispose();
  engine.dispose();
});

test('frozen materials are thawed on a pass change and frozen again (stale shader regression)', () => {
  const { engine, scene, daylight } = setup();
  const material = new StandardMaterial('city:frozen', scene);
  material.freeze();
  assert.equal(material.isFrozen, true);
  daylight.applyPreferences(prefs('LOW'), viewport);
  assert.equal(
    material.isFrozen,
    false,
    'thawed so the shader is rebuilt without the pipeline flag',
  );
  for (let i = 0; i < 3; i++) scene.onAfterRenderObservable.notifyObservers(scene);
  assert.equal(material.isFrozen, true, 'frozen again after the new shader had frames to compile');
  daylight.dispose();
  scene.dispose();
  engine.dispose();
});

test('dispose restores the whole image-processing configuration it changed', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const config = scene.imageProcessingConfiguration;
  const before = {
    weight: config.vignetteWeight,
    stretch: config.vignetteStretch,
    blend: config.vignetteBlendMode,
    dither: config.ditheringIntensity,
    curves: config.colorCurves,
    exposure: config.exposure,
    contrast: config.contrast,
    tone: config.toneMappingType,
  };
  const daylight = createDaylight(scene, prefs('HIGH'), viewport);
  assert.notEqual(config.exposure, before.exposure);
  daylight.dispose();
  assert.equal(config.vignetteWeight, before.weight);
  assert.equal(config.vignetteStretch, before.stretch);
  assert.equal(config.vignetteBlendMode, before.blend);
  assert.equal(config.ditheringIntensity, before.dither);
  assert.equal(config.colorCurves, before.curves);
  assert.equal(config.exposure, before.exposure);
  assert.equal(config.contrast, before.contrast);
  assert.equal(config.toneMappingType, before.tone);
  scene.dispose();
  engine.dispose();
});
