import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { digest, assertFrozen } from './wheel-capture-source.mjs';

function finite(value) {
  if (typeof value === 'number') assert(Number.isFinite(value), 'Nonfinite physics measurement');
  else if (value && typeof value === 'object')
    for (const item of Object.values(value)) finite(item);
}
export async function verifyPhysicsCalibration(folder, current = false) {
  const bytes = await readFile(`${folder}/matrix.json`);
  const matrix = JSON.parse(bytes);
  assert.equal(matrix.fixture, '031-final-calibration-v1');
  assert.equal(matrix.runs.length, 120);
  assert.equal(matrix.binding.runtime.node, 'v24.21.0');
  for (const input of matrix.binding.inputs) {
    const archived = await readFile(`${folder}/source/${input.path}`);
    assert.equal(archived.length, input.bytes);
    assert.equal(digest(archived), input.sha256);
  }
  if (current) await assertFrozen(matrix.binding);
  const outcomes = [];
  for (const entry of matrix.runs) {
    const raw = await readFile(`${folder}/${entry.file}`);
    assert.equal(raw.length, entry.bytes);
    assert.equal(digest(raw), entry.sha256);
    const run = JSON.parse(gunzipSync(raw));
    finite(run);
    const { trace, curve, ...summary } = run;
    assert.deepEqual(entry.summary, summary);
    if (trace) {
      assert.equal(entry.traceHash, digest(JSON.stringify(trace)));
      assert.equal(entry.commandHash, digest(JSON.stringify(trace.map((row) => row.effective))));
      assert.equal(trace.length, run.ticks);
      assert.equal(run.cleanup.bodies.entities, 0);
      assert.equal(run.cleanup.bodies.subscriptions, 0);
      assert.equal(run.cleanup.collisions.colliders, 0);
      assert.equal(run.cleanup.collisions.disposed, true);
      assert.equal(run.cleanup.controllerVehicles, 0);
      assert.equal(run.cleanup.disposedReadRejected, true);
      for (const row of trace) {
        assert.equal(row.effective.tick, row.tick);
        assert.equal(row.contacts.physicsStepSerial, 180 + row.tick);
        assert(row.state.position.y > -1 && row.state.position.y < 5);
        assert(
          row.state.wheels.every(
            (wheel) => wheel.suspensionLengthM >= 0 && wheel.suspensionLengthM <= 0.6,
          ),
        );
        if (run.scenario === 'braking') {
          assert.equal(row.effective.throttle, 0);
          assert.equal(row.drivetrain.physicalInput.throttle, 0);
          assert.equal(row.drivetrain.physicalInput.brake, 1);
        }
      }
      if (run.scenario === 'braking') {
        assert(run.final.speed < 0.1 && run.ticks < 1800);
        const nominal = run.speedMps ** 2 / (2 * run.mechanics.brakeAccelerationMps2);
        assert(run.pathM > nominal * 0.5 && run.pathM < nominal * 2.5);
      }
      if (run.scenario === 'turning')
        assert(
          run.headingRad > 0.2 && run.achievedMeanRadiusM > 5 && run.achievedMeanRadiusM < 100,
        );
      if (run.scenario === 'lane-change')
        assert(
          run.displacementM.x > 0.5 && run.displacementM.x < 15 && Math.abs(run.headingRad) < 0.6,
        );
      if (run.scenario === 'two-cars')
        assert(run.contactImpulseNs > run.mechanics.massKg && run.contactTicks > 0);
      if (run.scenario === 'curb') assert(run.maxHeightM > run.start.position.y + 0.01);
    }
    outcomes.push({ kind: entry.kind, run, entry });
  }
  const players = outcomes.filter((entry) => entry.kind === 'player');
  assert.equal(players.length, 32);
  for (const player of players) {
    const matching = outcomes.filter(
      ({ run }) =>
        run.classId === player.run.classId &&
        run.surface === player.run.surface &&
        run.scenario === player.run.scenario &&
        run.speedMps === player.run.speedMps,
    );
    for (const kind of ['autonomy', 'repeat']) {
      const match = matching.find((entry) => entry.kind === kind);
      assert(match, `Missing ${kind}`);
      assert.deepEqual(match.run.trace, player.run.trace, `Per-tick ${kind} parity failed`);
      assert.equal(match.entry.commandHash, player.entry.commandHash);
    }
    const reference = matching.find((entry) => entry.kind === '026-reference');
    if (reference)
      assert.deepEqual(player.run.final, reference.run.final, 'Controller altered026 mechanics');
  }
  const select = (classId, surface, scenario, speed) =>
    players.find(
      ({ run }) =>
        run.classId === classId &&
        run.surface === surface &&
        run.scenario === scenario &&
        run.speedMps === speed,
    ).run;
  for (const classId of ['sedan', 'compact'])
    for (const speed of [10, 20, 30]) {
      const dry = select(classId, 'dry-asphalt', 'braking', speed);
      const reduced = select(classId, 'reduced-adhesion', 'braking', speed);
      assert(reduced.pathM > dry.pathM * 1.05, 'Reduced adhesion must extend stopping distance');
      if (speed > 10)
        assert(dry.pathM > select(classId, 'dry-asphalt', 'braking', speed - 10).pathM * 1.5);
      if (classId === 'compact')
        assert(dry.pathM < select('sedan', 'dry-asphalt', 'braking', speed).pathM);
    }
  return {
    matrixHash: digest(bytes),
    worlds: matrix.runs.length,
    parityPairs: 32,
    repeatPairs: 32,
    referencePairs: 24,
    hardwareAcceptance: false,
    sourceHash: matrix.binding.sourceHash,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(
    JSON.stringify(
      await verifyPhysicsCalibration(process.argv[2], process.argv.includes('--current')),
      null,
      2,
    ),
  );
