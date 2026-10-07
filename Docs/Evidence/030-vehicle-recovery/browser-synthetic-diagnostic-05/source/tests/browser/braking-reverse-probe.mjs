import assert from 'node:assert/strict';
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { manyContacts } from '../vehicles/physics-fixture.ts';
import { createVehicleController } from '../../src/vehicles/controller.ts';
import { CONTROLLER_CONTEXT, controllerCommand } from '../vehicles/controller-reference.ts';

const phase = process.argv[2];
assert(['before', 'after'].includes(phase));
const folder = 'Docs/Evidence/027-braking-reverse';
const destination = `${folder}/${phase}-node.json`;
const production = 'src/vehicles/drivetrain.ts';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
};
assert.equal(await exists(destination), false, 'Immutable report already exists');
assert.equal(
  await exists(`${folder}/source-${phase}`),
  false,
  'Immutable source archive already exists',
);
assert.equal(await exists(production), phase === 'after', 'Chronological production guard');
const nativePath = fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat'));
const nativeBytes = await readFile(nativePath);
const nativeArtifact = { path: nativePath, bytes: nativeBytes.length, sha256: hash(nativeBytes) };
const files = execFileSync(
  'rg',
  ['--files', 'src/vehicles', 'src/settings', 'src/sessions', 'src/input'],
  { encoding: 'utf8' },
)
  .trim()
  .split(/\r?\n/)
  .map((path) => path.replaceAll('\\', '/'));
files.push(
  'tests/browser/braking-reverse-probe.mjs',
  'tests/vehicles/physics-fixture.ts',
  'tests/vehicles/controller-reference.ts',
  'scripts/register-typescript.mjs',
  'package.json',
  'package-lock.json',
  'Docs/performance-budgets.json',
);
files.sort();
const source = createHash('sha256'),
  inputs = [];
await mkdir(`${folder}/source-${phase}`, { recursive: true });
await writeFile(`${folder}/source-${phase}/.gitattributes`, '* -text\n');
for (const path of files) {
  const bytes = await readFile(path);
  source.update(path).update(bytes);
  inputs.push({ path, bytes: bytes.length, sha256: hash(bytes) });
  await mkdir(dirname(`${folder}/source-${phase}/${path}`), { recursive: true });
  await copyFile(path, `${folder}/source-${phase}/${path}`);
}
const filterModule = await import('../../src/vehicles/keyboard-filter.ts');
const reverseModule =
  phase === 'after' ? await import('../../src/vehicles/braking-reverse-input.ts') : null;
const settingsModule = await import('../../src/settings/index.ts');
const runs = [];
for (let pair = 0; pair < 5; pair++)
  for (const observe of pair % 2 ? [true, false] : [false, true]) {
    const { world, inputs: physicalInputs } = await manyContacts(70);
    const controller = createVehicleController(
      CONTROLLER_CONTEXT,
      world,
      0,
      phase === 'after' ? { drivetrainVersion: '027-braking-reverse-v1' } : undefined,
    );
    const tokens = [...physicalInputs.keys()].map((id) => world.bodyIdentity(id));
    for (const identity of tokens) controller.register(identity);
    const filter = (
      reverseModule?.createBrakingReverseKeyboardFilter ?? filterModule.createKeyboardFilter
    )(CONTROLLER_CONTEXT, 'car-0', settingsModule.createDefaultSettings('027-probe').input.control);
    const samples = new Float64Array(observe ? 600 : 0),
      incremental = new Float64Array(observe ? 600 : 0),
      drivetrainSamples = new Float64Array(observe && phase === 'after' ? 600 : 0);
    const physicalTrace = [];
    const advance = (tick, measure) => {
      const packets =
        (tick - 1) % 6 === 0
          ? [...physicalInputs].slice(1).map(([id, value]) => ({
              identity: world.bodyIdentity(id),
              command: controllerCommand(id, tick, 'AUTONOMY', value),
            }))
          : [];
      const speedMps = world.project('car-0').speed;
      const filterStart = measure ? performance.now() : 0;
      const command = filter
        ? filter.step({ tick, dtSeconds: 1 / 60, speedMps }).command
        : controllerCommand('car-0', tick, 'PLAYER');
      const filterMs = measure ? performance.now() - filterStart : 0;
      packets.push({ identity: tokens[0], command });
      assert.equal(command.throttle, 0);
      assert.equal(command.brake, 0);
      assert.equal(command.steering, 0);
      const start = measure ? performance.now() : 0;
      const result = controller.step(
        { tick, dtSeconds: 1 / 60 },
        packets,
        tick === 1 ? [{ identity: tokens[0], mode: 'MANUAL' }] : [],
        measure,
      );
      return {
        tickMs: (measure ? performance.now() - start : 0) + filterMs,
        filterMs,
        drivetrainMs: result.drivetrainCpuMs ?? 0,
      };
    };
    let captured;
    try {
      const warmStart = performance.now();
      for (let tick = 1; tick <= 180; tick++) advance(tick, false);
      const warmupWallMs = performance.now() - warmStart;
      const start = performance.now();
      for (let index = 0; index < 600; index++) {
        const costs = advance(index + 181, observe);
        if (observe) {
          samples[index] = costs.tickMs;
          incremental[index] = costs.filterMs;
          if (phase === 'after') drivetrainSamples[index] = costs.drivetrainMs;
        }
        if ((index + 1) % 60 === 0)
          physicalTrace.push({
            tick: index + 181,
            states: ['car-0', 'car-35', 'car-69'].map((id) => world.project(id)),
          });
      }
      const elapsedWallMs = performance.now() - start;
      const percentiles = (values) => {
        values.sort();
        return {
          p50: observe ? values[299] : null,
          p95: observe ? values[569] : null,
          p99: observe ? values[593] : null,
        };
      };
      captured = {
        pair,
        observer: observe,
        warmupTicks: 180,
        measuredTicks: 600,
        warmupWallMs,
        elapsedWallMs,
        tickCpuMs: percentiles(samples),
        filterIncrementalMs: percentiles(incremental),
        drivetrainStageMs: phase === 'after' ? percentiles(drivetrainSamples) : null,
        sampleBytes: samples.byteLength + incremental.byteLength + drivetrainSamples.byteLength,
        physicalTrace,
        finalPhysicalHash: hash(
          JSON.stringify([...physicalInputs.keys()].map((id) => world.project(id))),
        ),
        filterStats: filter?.getStats() ?? null,
        drivetrainStats: controller.getStats().drivetrain ?? null,
      };
    } finally {
      filter?.dispose();
      controller.dispose();
      world.dispose();
      assert.equal(world.bodyResources().entities, 0);
      assert.equal(world.bodyResources().subscriptions, 0);
      assert.equal(world.collisionResources().colliders, 0);
      assert.equal(controller.getStats().vehicles, 0);
      assert.throws(() => world.readBody(tokens[0]));
      if (captured)
        captured.cleanup = {
          body: world.bodyResources(),
          collision: world.collisionResources(),
          controller: controller.getStats(),
          filter: filter?.getStats() ?? null,
          disposedReadRejected: true,
        };
    }
    runs.push(captured);
  }
for (const input of inputs)
  assert.equal(hash(await readFile(input.path)), input.sha256, 'Source drift ' + input.path);
assert.equal(hash(await readFile(nativePath)), nativeArtifact.sha256, 'Native artifact drift');
assert.equal(await exists(production), phase === 'after', 'Production end guard');
const report = {
  capturedAt: new Date().toISOString(),
  phase,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  fixtureVersion: '027-neutral-player-70cars-v1',
  budgetVersion: '203-initial-1',
  sourceHash: source.digest('hex'),
  inputs,
  nativeArtifact,
  runtime: process.version,
  cpu: cpus()[0]?.model,
  os: `${platform()} ${release()}`,
  backend: 'Real Rapier Node CPU; no browser/GPU/FPS',
  scope:
    'Unchanged025 keyboard and024 controller BEFORE027 drivetrain; single neutralPLAYER with70native cars and bounded samples. Supplemental CPU diagnostics; no FPS or page heap claim.',
  runs,
};
if (phase === 'after') {
  const before = JSON.parse(await readFile(`${folder}/before-node.json`, 'utf8'));
  assert.deepEqual(report.nativeArtifact, before.nativeArtifact);
  for (let i = 0; i < runs.length; i++) {
    assert.equal(runs[i].finalPhysicalHash, before.runs[i].finalPhysicalHash);
    assert.equal(
      JSON.stringify(runs[i].physicalTrace),
      JSON.stringify(before.runs[i].physicalTrace),
    );
  }
  report.beforeSourceHash = before.sourceHash;
  report.exactNeutralPhysicalCompatibility = true;
}
await writeFile(destination, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({ saved: destination, sourceHash: report.sourceHash, runs: runs.length }),
);
