import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInterventionSegment } from '../../../src/telemetry';
import { createRecoverySegmentBoundary } from '../../../src/app/vehicle-recovery-segment';
import { segment } from '../../contracts/fixtures';
import { nextFixtureOpenBoundary } from './next-open-boundary';

test('actual005 adapter preserves acknowledged closed history, rejects CLOSED on nextR and admits the unique next OPEN host boundary', () => {
  const initial = parseInterventionSegment({
    ...segment(),
    controlMode: 'MANUAL',
    learningEligible: false,
    startTick: 0,
    endTick: null,
    closeReason: null,
    completeness: 'OPEN',
    samples: [],
    events: [],
  });
  const context = {
    schemaVersion: initial.schemaVersion,
    units: initial.units,
    sessionId: initial.sessionId,
    worldEpoch: initial.worldEpoch,
  };
  const identity = Object.freeze({ entityId: initial.vehicleId, handle: 0, generation: 1 });
  let current = initial;
  let writes = 0;
  const boundary = createRecoverySegmentBoundary(context, {
    read: () => current,
    write: (_token, closed) => {
      writes++;
      current = closed;
    },
  });
  boundary.inspect(identity, 390);
  boundary.close(identity, 390, 'fixture-op');
  const historical = current,
    bytes = JSON.stringify(historical);
  assert.equal(writes, 1);
  assert.equal(historical.completeness, 'CLOSED');
  assert.throws(() => boundary.inspect(identity, 391), /requires open005/);
  boundary.close(identity, 390, 'fixture-op');
  assert.equal(writes, 1); // acknowledged same-operation retry is idempotent
  current = nextFixtureOpenBoundary(historical, 391);
  boundary.inspect(identity, 391);
  assert.notEqual(current.segmentId, historical.segmentId);
  assert.equal(current.startTick, 391);
  assert.deepEqual(current.samples, []);
  assert.deepEqual(current.events, []);
  assert.equal(JSON.stringify(historical), bytes);
});
test('premature OPEN replacement cannot conceal a pending005 suffix retry; invalid closed/start proof rejects', () => {
  const initial = parseInterventionSegment({
    ...segment(),
    controlMode: 'MANUAL',
    learningEligible: false,
    startTick: 0,
    endTick: null,
    closeReason: null,
    completeness: 'OPEN',
    samples: [],
    events: [],
  });
  const context = {
    schemaVersion: initial.schemaVersion,
    units: initial.units,
    sessionId: initial.sessionId,
    worldEpoch: initial.worldEpoch,
  };
  const identity = Object.freeze({ entityId: initial.vehicleId, handle: 0, generation: 1 });
  let current = initial;
  const boundary = createRecoverySegmentBoundary(context, {
    read: () => current,
    write: () => {
      throw Error('before-acceptance write fault');
    },
  });
  assert.throws(() => boundary.close(identity, 390, 'fixture-op'), /write fault/);
  current = parseInterventionSegment({ ...initial, segmentId: 'different-open', startTick: 391 });
  assert.throws(() => boundary.close(identity, 390, 'fixture-op'));
  assert.throws(() => nextFixtureOpenBoundary(initial, 391));
  const closed = parseInterventionSegment({
    ...initial,
    endTick: 390,
    closeReason: 'RECOVERY',
    completeness: 'CLOSED',
  });
  assert.throws(() => nextFixtureOpenBoundary(closed, 390));
  assert.throws(() => nextFixtureOpenBoundary(closed, 392));
});
