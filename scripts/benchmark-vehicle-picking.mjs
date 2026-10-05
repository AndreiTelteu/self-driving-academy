import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import '@babylonjs/core/Culling/ray.js';
import { writeFileSync, existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { execFileSync } from 'node:child_process';
const after = process.argv.includes('--after');
const output = `Docs/Evidence/018-vehicle-picking/${after ? 'after' : 'baseline'}-cpu.json`;
if (!after && existsSync(output))
  throw Error('Refusing to overwrite baseline; use a new evidence path for an approved revision');
const engine = new NullEngine(),
  scene = new Scene(engine);
new FreeCamera('camera', new Vector3(0, 0, -10), scene);
for (let i = 0; i < 70; i++) {
  const m = CreateBox('car' + i, {}, scene);
  m.position.x = (i % 10) * 3;
  m.position.y = Math.floor(i / 10) * 3;
  m.computeWorldMatrix(true);
}
scene.render();
let registry, picker;
if (after) {
  const { VehiclePickingRegistry } =
    await import('../src/rendering/babylon/vehicle-picking-registry.ts');
  const { BabylonVehiclePicker } = await import('../src/rendering/babylon/vehicle-picking.ts');
  registry = new VehiclePickingRegistry(scene);
  for (const m of scene.meshes) registry.register(m, m.name);
  picker = new BabylonVehiclePicker(scene, registry);
}
const pick = () =>
  after
    ? picker.pick(engine.getRenderWidth() / 2, engine.getRenderHeight() / 2)
    : scene.pick(engine.getRenderWidth() / 2, engine.getRenderHeight() / 2);
const runs = [];
let hits = 0;
for (let r = 0; r < 6; r++) {
  const samples = [];
  const runStarted = performance.now();
  for (let i = 0; i < 1000; i++) {
    const t = performance.now(),
      hit = pick();
    samples.push(performance.now() - t);
    if (after ? hit?.entityId === 'car0' : hit.hit) hits++;
  }
  const observedTotalMs = performance.now() - runStarted;
  samples.sort((a, b) => a - b);
  if (r) runs.push({ p50: samples[499], p95: samples[949], p99: samples[989], observedTotalMs });
}
const observerDisabledTotalsMs = [];
for (let run = 0; run < 5; run++) {
  const started = performance.now();
  for (let i = 0; i < 1000; i++) pick();
  observerDisabledTotalsMs.push(performance.now() - started);
}
if (hits !== 6000) throw Error('Missing actual hit');
writeFileSync(
  output,
  JSON.stringify(
    {
      fixture: '018-70-boxes-v1',
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      runtime: process.version,
      cpu: cpus()[0].model,
      backend: 'NullEngine CPU-only; no GPU/FPS claim',
      mode: after
        ? 'new full picker cost; includes same ray scan plus identity resolution'
        : 'existing Babylon scene.pick; adapter not implemented',
      samples: 1000,
      warmupRuns: 1,
      hits,
      runs,
      observerDisabledTotalsMs,
    },
    null,
    2,
  ),
);
picker?.dispose();
registry?.dispose();
scene.dispose();
engine.dispose();
