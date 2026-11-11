import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EXPERIMENT_LEDGER_ISOLATION_VERSION,
  EXPERIMENT_SNAPSHOT_INTEGRITY,
  EXPERIMENT_SNAPSHOT_VERSION,
  compareExperimentSnapshotState,
  createExperimentLedgerIsolation,
  experimentCompatibilityCodes,
  experimentLedgerFingerprintField,
  experimentLedgerIsolationCodes,
  experimentLedgerNames,
  experimentSnapshotRejectionCodes,
  experimentSnapshotSections,
  runExperimentSnapshot,
} from '../../src/experiments';
import type {
  ExperimentSnapshotPorts,
  ExperimentSnapshotRequest,
  ExperimentSnapshotResult,
} from '../../src/experiments';
import { WORLD_SNAPSHOT_INTEGRITY } from '../../src/persistence';
import type { WorldSnapshotState } from '../../src/persistence';
import {
  EXPERIMENT_FIXTURE,
  corruptSnapshotBody,
  createExperimentLedgers,
  createExperimentSnapshotPorts,
  createExperimentWorld,
  restoredWorld,
} from './experiment-snapshot-fixture';
import { WORLD_FIXTURE, canonicalWorld, runWorld } from '../persistence/world-checkpoint-fixtures';

function request(overrides: Partial<ExperimentSnapshotRequest> = {}): ExperimentSnapshotRequest {
  const fixture = createExperimentWorld();
  return {
    experimentId: EXPERIMENT_FIXTURE.experimentId,
    expectedTick: fixture.tick,
    captureInput: fixture.input,
    envelope: {
      checkpointId: EXPERIMENT_FIXTURE.checkpointId,
      sessionId: EXPERIMENT_FIXTURE.sessionId,
      generation: EXPERIMENT_FIXTURE.generation,
      createdAt: EXPERIMENT_FIXTURE.createdAt,
    },
    storedVersions: EXPERIMENT_FIXTURE.versions,
    currentVersions: EXPERIMENT_FIXTURE.versions,
    ledger: createExperimentLedgers().port,
    ...overrides,
  };
}

function loaded(result: ExperimentSnapshotResult) {
  assert.equal(result.status, 'LOADED', JSON.stringify(result).slice(0, 400));
  return result as Extract<ExperimentSnapshotResult, { status: 'LOADED' }>;
}

test('140 reuses the 206 integrity and payload contract instead of a second format', () => {
  assert.equal(EXPERIMENT_SNAPSHOT_VERSION, '140-experiment-snapshot-v1');
  assert.equal(EXPERIMENT_LEDGER_ISOLATION_VERSION, '140-experiment-ledger-isolation-v1');
  assert.deepEqual(EXPERIMENT_SNAPSHOT_INTEGRITY, WORLD_SNAPSHOT_INTEGRITY);
  assert.deepEqual([...experimentLedgerNames], ['LEARNING', 'REWARDS', 'KPI']);
  assert.equal(experimentLedgerFingerprintField('LEARNING'), 'learning');
  assert.equal(experimentLedgerFingerprintField('REWARDS'), 'rewards');
  assert.equal(experimentLedgerFingerprintField('KPI'), 'kpi');
  assert.deepEqual(
    [...experimentLedgerIsolationCodes],
    ['LIVE_LEDGER_READ_ONLY', 'EXPERIMENT_LEDGER_MISMATCH'],
  );

  const fixture = createExperimentWorld();
  const ports = createExperimentSnapshotPorts();
  const captured = ports.capture(fixture.input);
  assert.equal(captured.status, 'CAPTURED');
  if (captured.status !== 'CAPTURED') return;
  const body = captured.body as Record<string, unknown>;
  assert.deepEqual(
    [...experimentSnapshotSections],
    Object.keys(body).filter((key) => key !== 'checksum'),
    'the 140 section list is the 206 payload, in order',
  );
  assert.match(captured.checksum, /^[0-9a-f]{64}$/);
  assert.deepEqual(
    [...experimentSnapshotRejectionCodes],
    [
      'CAPTURE_REJECTED',
      'SNAPSHOT_INVALID',
      'CHECKSUM_MISMATCH',
      'TICK_MISMATCH',
      'ENGINE_VERSION_MISMATCH',
      'PHYSICS_BACKEND_MISMATCH',
      'MAP_VERSION_MISMATCH',
      'ROUNDTRIP_FIELD_MISMATCH',
      'LEDGER_CHANGED',
    ],
  );
});

test('140 loads the complete snapshot at the same tick, with no advance and no jump', () => {
  const fixture = createExperimentWorld();
  const result = loaded(runExperimentSnapshot(request(), createExperimentSnapshotPorts()));

  assert.equal(result.tick, WORLD_FIXTURE.captureTick);
  assert.equal(result.expectedTick, WORLD_FIXTURE.captureTick);
  assert.equal(result.ticksAdvanced, 0);
  assert.equal(result.tick - fixture.tick, 0);
  assert.deepEqual(result.mismatches, []);
  assert.ok(result.bytes > 0);
  assert.match(result.checksum, /^[0-9a-f]{64}$/);

  const entities = Object.fromEntries(result.sections.map((row) => [row.section, row.entities]));
  assert.equal(entities.vehicles, WORLD_FIXTURE.taxis + WORLD_FIXTURE.civilians);
  assert.equal(entities.controllers, WORLD_FIXTURE.taxis + WORLD_FIXTURE.civilians);
  assert.equal(entities.passengers, WORLD_FIXTURE.passengers);
  assert.equal(entities.rides, WORLD_FIXTURE.passengers);
  assert.equal(entities.segments, 3);
  assert.equal(entities.opportunities, WORLD_FIXTURE.opportunities);
  assert.equal(entities.signals, WORLD_FIXTURE.signals);
  assert.equal(entities.dispatch, 4);
  assert.ok(result.fields > 0);
  assert.equal(
    result.fields,
    result.sections.reduce((total, row) => total + row.fields, 0),
  );
  assert.equal(
    result.entities,
    result.sections.reduce((total, row) => total + row.entities, 0),
  );
});

test('140 compares the restored state field by field, including memory, RNG and dispatcher', () => {
  const fixture = createExperimentWorld();
  const ports = createExperimentSnapshotPorts();
  const result = loaded(runExperimentSnapshot(request({ captureInput: fixture.input }), ports));
  const captured = ports.capture(fixture.input);
  assert.equal(captured.status, 'CAPTURED');
  if (captured.status !== 'CAPTURED') return;

  const comparison = compareExperimentSnapshotState(captured.body, result.state);
  assert.equal(comparison.mismatches.length, 0);
  assert.equal(comparison.fields, result.fields);
  assert.equal(comparison.entities, result.entities);

  const stored = captured.body as WorldSnapshotState;
  const state = result.state as WorldSnapshotState;
  assert.deepEqual(state.vehicles, stored.vehicles);
  assert.deepEqual(
    state.controllers.map((entry) => entry.memory),
    stored.controllers.map((entry) => entry.memory),
  );
  assert.deepEqual(state.rng, stored.rng);
  assert.deepEqual(state.signals, stored.signals);
  assert.deepEqual(state.opportunities, stored.opportunities);
  assert.deepEqual(state.dispatch, stored.dispatch);
  assert.deepEqual(state.passengers, stored.passengers);
  assert.deepEqual(state.profile, stored.profile);
  assert.deepEqual(state.dedup, stored.dedup);
  // Each keyed RNG stream keeps its exact cursor, not just the seed.
  for (const stream of ['traffic', 'rideDemand', 'opportunities'] as const) {
    assert.equal(state.rng.streams[stream], stored.rng.streams[stream]);
  }
});

test('140 refuses a snapshot whose stored checksum no longer matches', () => {
  const base = createExperimentSnapshotPorts();
  const ports: ExperimentSnapshotPorts = {
    ...base,
    capture: (input) => {
      const captured = base.capture(input);
      if (captured.status !== 'CAPTURED') return captured;
      return {
        ...captured,
        body: corruptSnapshotBody(captured.body),
      };
    },
  };
  const result = runExperimentSnapshot(request(), ports);
  assert.equal(result.status, 'REFUSED');
  if (result.status !== 'REFUSED') return;
  assert.equal(result.stage, 'READ');
  assert.deepEqual(result.codes, ['CHECKSUM_MISMATCH']);
});

test('140 refuses another engine, physics backend or map, per field and in combination', () => {
  const ports = createExperimentSnapshotPorts();
  const cases = [
    { engineVersion: 'babylon-9.28.0' },
    { physicsVersion: 'ammo-0.4.0' },
    { mapVersion: 'city-v2' },
  ] as const;
  const expected = [
    'ENGINE_VERSION_MISMATCH',
    'PHYSICS_BACKEND_MISMATCH',
    'MAP_VERSION_MISMATCH',
  ] as const;
  for (let index = 0; index < cases.length; index += 1) {
    const storedVersions = { ...EXPERIMENT_FIXTURE.versions, ...cases[index] };
    const result = runExperimentSnapshot(request({ storedVersions }), ports);
    assert.equal(result.status, 'REFUSED');
    if (result.status !== 'REFUSED') continue;
    assert.equal(result.stage, 'COMPATIBILITY');
    assert.deepEqual(result.codes, [expected[index]]);
  }

  const all = runExperimentSnapshot(
    request({
      storedVersions: {
        engineVersion: 'babylon-9.28.0',
        physicsVersion: 'ammo-0.4.0',
        mapVersion: 'city-v2',
      },
    }),
    ports,
  );
  assert.equal(all.status, 'REFUSED');
  if (all.status === 'REFUSED') {
    assert.equal(all.stage, 'COMPATIBILITY');
    assert.deepEqual(all.codes, [
      'ENGINE_VERSION_MISMATCH',
      'PHYSICS_BACKEND_MISMATCH',
      'MAP_VERSION_MISMATCH',
    ]);
  }

  assert.deepEqual(
    experimentCompatibilityCodes(EXPERIMENT_FIXTURE.versions, EXPERIMENT_FIXTURE.versions),
    [],
  );
});

test('140 refuses a snapshot taken at another tick instead of advancing the experiment', () => {
  const fixture = createExperimentWorld();
  const result = runExperimentSnapshot(
    request({ captureInput: fixture.input, expectedTick: fixture.tick + 1 }),
    createExperimentSnapshotPorts(),
  );
  assert.equal(result.status, 'REFUSED');
  if (result.status !== 'REFUSED') return;
  assert.equal(result.stage, 'TICK');
  assert.deepEqual(result.codes, ['TICK_MISMATCH']);

  const insideStep = runExperimentSnapshot(
    request({ captureInput: { ...fixture.input, tickBoundary: 'IN_STEP' } }),
    createExperimentSnapshotPorts(),
  );
  assert.equal(insideStep.status, 'REFUSED');
  if (insideStep.status === 'REFUSED') {
    assert.equal(insideStep.stage, 'CAPTURE');
    assert.deepEqual(insideStep.codes, ['CAPTURE_REJECTED']);
    assert.match(insideStep.detail, /TICK_NOT_BOUNDARY/);
  }
});

test('140 isolates the live ledgers structurally and behaviourally', () => {
  const ledgers = createExperimentLedgers();
  const isolation = createExperimentLedgerIsolation(ledgers.port);
  const before = isolation.fingerprint();

  // Structural: the experiment handle exposes observation and a copy, never a live mutator.
  const surface = Object.keys(isolation).sort();
  assert.deepEqual(surface, [
    'fingerprint',
    'fork',
    'structuralIsolation',
    'verify',
    'version',
    'write',
  ]);
  assert.equal(isolation.structuralIsolation, true);

  // Behavioural: a direct write is refused and never applied to the live ledger.
  const direct = isolation.write({
    ledger: 'REWARDS',
    rowId: 'row-140-direct',
    value: { xp: 500 },
  });
  assert.equal(direct.status, 'REFUSED');
  assert.equal(direct.code, 'LIVE_LEDGER_READ_ONLY');
  assert.equal(direct.appliedToLive, false);

  // The same write into a fork is accepted, but only in the detached copy.
  const fork = isolation.fork('REWARDS');
  const copied = fork.write({ ledger: 'REWARDS', rowId: 'row-140-copy', value: { xp: 500 } });
  assert.equal(copied.status, 'ACCEPTED_IN_COPY');
  assert.equal(copied.appliedToLive, false);
  assert.equal(copied.copyRows, 1);
  assert.equal(fork.rows.length, 1);
  const mismatch = fork.write({ ledger: 'KPI', rowId: 'row-140-wrong', value: { rides: 1 } });
  assert.equal(mismatch.status, 'REFUSED');
  assert.equal(mismatch.code, 'EXPERIMENT_LEDGER_MISMATCH');

  const verification = isolation.verify();
  assert.deepEqual(verification.before, before);
  assert.equal(verification.unchanged, true);
  assert.deepEqual(verification.changedLedgers, []);
  assert.equal(verification.liveWrites, 0);
  assert.equal(verification.refusedWrites, 2);
  assert.equal(verification.copyWrites, 1);

  // Control: a real write on the live KPI ledger is detected, so the fingerprint is not a constant.
  ledgers.kpi.ingest({
    eventId: 'event:ride:140:control',
    kind: 'RIDE_TERMINAL',
    rideId: 'ride-140-control',
    taxiId: 'taxi-02',
    state: 'COMPLETED',
    tick: 61,
    pickupSeconds: 11,
    tripSeconds: 25,
    distanceM: 700,
  });
  const changed = isolation.verify();
  assert.equal(changed.unchanged, false);
  assert.deepEqual(changed.changedLedgers, ['KPI']);
  assert.notEqual(changed.after.kpi, changed.before.kpi);
  assert.equal(changed.after.learning, changed.before.learning);
  assert.equal(changed.after.rewards, changed.before.rewards);
});

test('140 reports the live ledger fingerprint unchanged around a successful load', () => {
  const ledgers = createExperimentLedgers();
  const before = ledgers.fingerprint();
  const result = loaded(
    runExperimentSnapshot(request({ ledger: ledgers.port }), createExperimentSnapshotPorts()),
  );
  assert.equal(result.ledger.unchanged, true);
  assert.equal(result.ledger.liveWrites, 0);
  assert.deepEqual(result.ledger.before, before);
  assert.deepEqual(result.ledger.after, before);
  assert.deepEqual(ledgers.fingerprint(), before);
});

test('140 restores a world that keeps simulating exactly like the original', () => {
  const fixture = createExperimentWorld();
  const result = loaded(
    runExperimentSnapshot(
      request({ captureInput: fixture.input }),
      createExperimentSnapshotPorts(),
    ),
  );
  runWorld(fixture.world, EXPERIMENT_FIXTURE.continuationTicks);
  const restored = restoredWorld(result.state);
  runWorld(restored, EXPERIMENT_FIXTURE.continuationTicks);
  assert.equal(
    canonicalWorld(restored),
    canonicalWorld(fixture.world),
    'the restored world sees the same RNG, FSM, signals and dispatcher as the original',
  );
});
