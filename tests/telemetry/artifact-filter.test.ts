import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ARTIFACT_CAPACITY,
  ARTIFACT_FILTER_TICK_HZ,
  ARTIFACT_MAX_PER_WINDOW,
  ARTIFACT_RECORDER_RAM_BYTES,
  ARTIFACT_RECORD_BYTES_CEILING,
  artifactCauseKinds,
  artifactCauseSources,
  artifactCauses,
  artifactKinds,
  artifactSources,
  createArtifactFilter,
  createEligibilityWindows,
  createOpportunityRegistry,
  opportunitySignalContext,
  splitWindowAtArtifacts,
  windowCompletenessStates,
  type ArtifactFilterInput,
  type EligibleWindowRecord,
  type PrefixEligibleWindowRecord,
} from '../../src/telemetry/index.ts';
import { createStopRules, createSignalController } from '../../src/world/index.ts';
import type { RoadMap, StopObservation } from '../../src/world/index.ts';
import { createEventBus } from '../../src/simulation/index.ts';
import type { SimulationEvent } from '../../src/simulation/index.ts';
import {
  CollisionRegistry,
  createCollisionEpisodes,
  createRecoveryLedger,
} from '../../src/vehicles/index.ts';
import type { CollisionIncident } from '../../src/vehicles/index.ts';
import type { RecoveryRecord } from '../../src/vehicles/index.ts';
import { minimalMap } from '../world/fixture.ts';
import type { Mutable } from '../world/negative-fixtures.ts';

const SESSION = '088-chain';
const EPOCH = 0;
const VEHICLE = 'taxi';
const INCARNATION = 'taxi-1';
const SEGMENT = 'seg-1';
const WORLD = { sessionId: SESSION, worldEpoch: EPOCH };
const BUS_WORLD = Object.freeze({ schemaVersion: 1 as const, units: 'SI' as const, ...WORLD });

/** A clean closed segment; every test overrides only the fact it is about. */
function input(overrides: Partial<ArtifactFilterInput> = {}): ArtifactFilterInput {
  return {
    tick: 100,
    sessionId: SESSION,
    worldEpoch: EPOCH,
    segmentId: SEGMENT,
    vehicleId: VEHICLE,
    incarnation: INCARNATION,
    controlMode: 'LEARNING',
    learningEligible: true,
    startTick: 1,
    endTick: 100,
    segmentCompleteness: 'CLOSED',
    closeReason: 'RIDE_COMPLETED',
    lostCheckpointTick: null,
    observationLoss: null,
    collisions: [],
    recoveries: [],
    suspensions: [],
    ...overrides,
  };
}

test('088 a collision splits the window: the impulse and everything after it are never evidence, the prefix stays usable', () => {
  const layer = createArtifactFilter();
  const record = layer.evaluate(
    input({
      collisions: [{ tick: 41, incidentId: 'incident-1', impulseNs: 1200, otherEntityId: 'wall' }],
    }),
  );
  assert.equal(record.windowClass, 'PREFIX_ELIGIBLE');
  // The split boundary is exact: tick 40 is the last usable tick, tick 41 starts the suppression.
  assert.equal(record.boundaryTick, 41);
  assert.equal(record.boundaryCause, 'COLLISION_IMPULSE');
  assert.deepEqual(record.prefix, { fromTick: 1, toTick: 40, ticks: 40 });
  assert.deepEqual(record.suppressed, { fromTick: 41, toTick: 100, ticks: 60 });
  assert.equal(record.artifactCount, 1);
  const [artifact] = record.artifacts;
  assert.equal(artifact.kind, 'COLLISION');
  assert.equal(artifact.cause, 'COLLISION_IMPULSE');
  assert.equal(artifact.source, 'COLLISION_028');
  assert.equal(artifact.boundaryTick, 41);
  assert.equal(artifact.incidentId, 'incident-1');
  assert.equal(artifact.impulseNs, 1200);
  assert.equal(artifact.otherEntityId, 'wall');
  // Criterion 1: the pre-impact part becomes preference evidence with its own denominator.
  const evidence = layer.emitPreImpactEvidence(record);
  assert.equal(evidence.usableFromTick, 1);
  assert.equal(evidence.usableToTick, 40);
  assert.equal(evidence.usableTicks, 40);
  assert.equal(evidence.wholeWindow, false);
  assert.equal(evidence.boundaryTick, 41);
  assert.equal(evidence.boundaryCause, 'COLLISION_IMPULSE');
  const denominators = layer.getDenominators();
  assert.equal(denominators.total, 1);
  assert.equal(denominators.prefixEligible, 1);
  assert.equal(denominators.fullySuppressed, 0);
  assert.equal(denominators.usableTicks, 40);
  assert.equal(denominators.suppressedTicks, 60);
  assert.equal(denominators.partial, 1);
  assert.equal(record.completeness, 'PARTIAL');
  assert.equal(record.completenessReason, 'TRUNCATED_BY_ARTIFACT');

  // A collision at the first tick leaves no usable tick: the whole window is suppressed and the
  // post-impact segment can never produce a preference record (runtime gate + refusal counter).
  const suppressed = layer.evaluate(
    input({
      tick: 200,
      segmentId: 'seg-suppressed',
      collisions: [{ tick: 1, incidentId: 'incident-2', impulseNs: 90, otherEntityId: 'kerb' }],
    }),
  );
  assert.equal(suppressed.windowClass, 'FULLY_SUPPRESSED');
  assert.equal(suppressed.prefix, null);
  assert.deepEqual(suppressed.suppressed, { fromTick: 1, toTick: 100, ticks: 100 });
  assert.throws(
    () => layer.emitPreImpactEvidence(suppressed as unknown as PrefixEligibleWindowRecord),
    /pre-impact prefix/,
  );
  assert.equal(layer.getDenominators().preferenceEvidenceRefused, 1);
  assert.equal(layer.getDenominators().preferenceEvidenceEmitted, 1);
  // The split rule is exported and reproduces the same boundary.
  assert.deepEqual(
    splitWindowAtArtifacts({
      startTick: 1,
      windowEndTick: 100,
      artifacts: [{ boundaryTick: 41 }],
    }),
    {
      boundaryTick: 41,
      prefix: { fromTick: 1, toTick: 40, ticks: 40 },
      suppressed: { fromTick: 41, toTick: 100, ticks: 60 },
    },
  );
});

test('088 a 030 recovery placement is a TELEPORT artifact keeping its cause and proof; the segment before it stays usable', () => {
  const layer = createArtifactFilter();
  const record = layer.evaluate(
    input({
      segmentId: 'seg-recovery',
      recoveries: [
        {
          tick: 61,
          operationId: 'op-1',
          status: 'COMPLETED',
          pointId: 'point-7',
          mapId: 'map-044',
          laneId: 'lane-a',
          mode: 'MANUAL',
          validatedTick: 59,
          learningEligible: false,
        },
      ],
    }),
  );
  assert.equal(record.windowClass, 'PREFIX_ELIGIBLE');
  assert.equal(record.boundaryTick, 61);
  const [artifact] = record.artifacts;
  assert.equal(artifact.kind, 'TELEPORT');
  assert.equal(artifact.cause, 'RECOVERY_TELEPORT');
  assert.equal(artifact.source, 'RECOVERY_030');
  // Criterion 2: the recovered segment keeps the 030 cause and proof.
  assert.equal(artifact.operationId, 'op-1');
  assert.equal(artifact.recoveryPointId, 'point-7');
  assert.equal(artifact.recoveryMapId, 'map-044');
  assert.equal(artifact.recoveryLaneId, 'lane-a');
  assert.equal(artifact.recoveryMode, 'MANUAL');
  assert.equal(artifact.recoveryValidatedTick, 59);
  assert.equal(record.completeness, 'PARTIAL');
  assert.equal(record.completenessReason, 'RECOVERY');
  // The placement itself is not usable; the segment before it is.
  assert.deepEqual(record.prefix, { fromTick: 1, toTick: 60, ticks: 60 });
  assert.deepEqual(record.suppressed, { fromTick: 61, toTick: 100, ticks: 40 });
  const evidence = layer.emitPreImpactEvidence(record);
  assert.equal(evidence.usableToTick, 60);
  assert.equal(evidence.boundaryCause, 'RECOVERY_TELEPORT');
  // A denied or partial placement keeps its own cause too.
  const denied = layer.evaluate(
    input({
      tick: 200,
      segmentId: 'seg-denied',
      recoveries: [
        {
          tick: 10,
          operationId: 'op-2',
          status: 'DENIED',
          pointId: 'point-1',
          mapId: 'map-044',
          laneId: 'lane-b',
          mode: 'LEARNING',
          validatedTick: 9,
          learningEligible: false,
        },
      ],
    }),
  );
  assert.equal(denied.artifacts[0].cause, 'RECOVERY_DENIED');
  const partial = layer.evaluate(
    input({
      tick: 300,
      segmentId: 'seg-partial',
      recoveries: [
        {
          tick: 20,
          operationId: 'op-3',
          status: 'PARTIAL',
          pointId: 'point-2',
          mapId: 'map-044',
          laneId: 'lane-c',
          mode: 'MANUAL',
          validatedTick: 19,
          learningEligible: false,
        },
      ],
    }),
  );
  assert.equal(partial.artifacts[0].cause, 'RECOVERY_PARTIAL');
  // The 030 contract forbids a learning-eligible placement.
  assert.throws(
    () =>
      layer.evaluate(
        input({
          tick: 400,
          segmentId: 'seg-bad',
          recoveries: [
            {
              tick: 20,
              operationId: 'op-4',
              status: 'COMPLETED',
              pointId: 'p',
              mapId: 'm',
              laneId: 'l',
              mode: 'MANUAL',
              validatedTick: 19,
              learningEligible: true as unknown as false,
            },
          ],
        }),
      ),
    /never learning-eligible/,
  );
});

test('088 a lost checkpoint or an incomplete segment yields an explicit TRUNCATED segment, never COMPLETE', () => {
  const layer = createArtifactFilter();
  const lost = layer.evaluate(
    input({
      segmentId: 'seg-crash',
      tick: 500,
      endTick: null,
      segmentCompleteness: 'OPEN',
      closeReason: null,
      lostCheckpointTick: 300,
    }),
  );
  assert.equal(lost.completeness, 'TRUNCATED');
  assert.equal(lost.completenessReason, 'CHECKPOINT_LOST');
  const [lostArtifact] = lost.artifacts;
  assert.equal(lostArtifact.kind, 'INCOMPLETE_SAMPLE');
  assert.equal(lostArtifact.cause, 'CHECKPOINT_LOST');
  assert.equal(lostArtifact.source, 'CHECKPOINT_222');
  assert.equal(lostArtifact.boundaryTick, 300);
  // The data before the loss is still attributable; everything at/after it is not.
  assert.deepEqual(lost.prefix, { fromTick: 1, toTick: 299, ticks: 299 });
  assert.deepEqual(lost.suppressed, { fromTick: 300, toTick: 500, ticks: 201 });
  assert.equal(layer.getStats().checkpointLosses, 1);

  // An INCOMPLETE 069/085 segment is TRUNCATED with its own cause and is never reported COMPLETE.
  const incomplete = layer.evaluate(
    input({
      tick: 600,
      segmentId: 'seg-incomplete',
      endTick: 200,
      segmentCompleteness: 'INCOMPLETE',
      closeReason: 'RIDE_COMPLETED',
    }),
  );
  assert.equal(incomplete.completeness, 'TRUNCATED');
  assert.equal(incomplete.completenessReason, 'SEGMENT_INCOMPLETE');
  assert.equal(incomplete.artifacts[0].cause, 'SEGMENT_INCOMPLETE');
  assert.equal(incomplete.artifacts[0].source, 'SEGMENT_069');
  assert.notEqual(incomplete.completeness, 'COMPLETE');

  // A close reason of DATA_LOSS is TRUNCATED with its own cause.
  const dataLoss = layer.evaluate(
    input({
      tick: 700,
      segmentId: 'seg-dataloss',
      endTick: 200,
      segmentCompleteness: 'CLOSED',
      closeReason: 'DATA_LOSS',
    }),
  );
  assert.equal(dataLoss.completeness, 'TRUNCATED');
  assert.equal(dataLoss.completenessReason, 'DATA_LOSS');
  assert.equal(dataLoss.artifacts[0].cause, 'CLOSE_REASON_DATA_LOSS');
  assert.equal(dataLoss.artifacts[0].source, 'SEGMENT_069');

  // Lost observations are PARTIAL/OBSERVATION_GAP with the exact loss tick.
  const gap = layer.evaluate(
    input({
      tick: 800,
      segmentId: 'seg-gap',
      endTick: 400,
      observationLoss: { fromTick: 150, ticks: 3 },
    }),
  );
  assert.equal(gap.completeness, 'PARTIAL');
  assert.equal(gap.completenessReason, 'OBSERVATION_GAP');
  assert.equal(gap.artifacts[0].cause, 'OBSERVATION_GAP');
  assert.equal(gap.artifacts[0].source, 'TICK_SAMPLES_085');
  assert.equal(gap.boundaryTick, 150);
  assert.deepEqual(gap.prefix, { fromTick: 1, toTick: 149, ticks: 149 });

  // An open segment is PARTIAL and never COMPLETE while it is still growing.
  const open = layer.evaluate(
    input({
      tick: 900,
      segmentId: 'seg-open',
      endTick: null,
      segmentCompleteness: 'OPEN',
      closeReason: null,
    }),
  );
  assert.equal(open.completeness, 'PARTIAL');
  assert.equal(open.completenessReason, 'OPEN_SEGMENT');
  for (const record of [lost, incomplete, dataLoss, gap, open]) {
    assert.ok(windowCompletenessStates.includes(record.completeness));
    assert.notEqual(record.completeness, 'COMPLETE');
  }
});

test('088 a pause or a focus loss is excluded with its own reason and never becomes an incomplete sample', () => {
  const layer = createArtifactFilter();
  const paused = layer.evaluate(
    input({
      segmentId: 'seg-pause',
      suspensions: [{ fromTick: 31, toTick: 45, cause: 'panel' }],
    }),
  );
  assert.equal(paused.artifacts[0].kind, 'PAUSE');
  assert.equal(paused.artifacts[0].cause, 'SUSPENSION_PAUSE');
  assert.equal(paused.artifacts[0].source, 'SUSPENSION_070');
  assert.equal(paused.artifacts[0].suspensionCause, 'panel');
  assert.equal(paused.artifacts[0].boundaryTick, 31);
  assert.equal(paused.artifacts[0].endTick, 45);
  // A suspension is never counted as an incomplete sample.
  assert.ok(paused.artifacts.every((artifact) => artifact.kind !== 'INCOMPLETE_SAMPLE'));
  assert.equal(paused.completenessReason, 'TRUNCATED_BY_ARTIFACT');
  assert.deepEqual(paused.prefix, { fromTick: 1, toTick: 30, ticks: 30 });
  assert.deepEqual(paused.suppressed, { fromTick: 31, toTick: 100, ticks: 70 });

  const focus = layer.evaluate(
    input({
      tick: 200,
      segmentId: 'seg-focus',
      suspensions: [{ fromTick: 10, toTick: null, cause: 'focus' }],
    }),
  );
  assert.equal(focus.artifacts[0].cause, 'SUSPENSION_FOCUS_LOST');
  assert.equal(focus.artifacts[0].source, 'SUSPENSION_070');
  assert.equal(focus.artifacts[0].endTick, null);

  // A 012 loop host cause keeps its own provenance.
  const loop = layer.evaluate(
    input({
      tick: 300,
      segmentId: 'seg-loop',
      suspensions: [{ fromTick: 5, toTick: 9, cause: 'overload' }],
    }),
  );
  assert.equal(loop.artifacts[0].cause, 'SUSPENSION_PAUSE');
  assert.equal(loop.artifacts[0].source, 'LOOP_012');
  assert.equal(layer.getDenominators().byKind.find((entry) => entry.kind === 'PAUSE')?.count, 3);
});

test('088 a clean closed segment stays COMPLETE and fully usable (no false positives)', () => {
  const layer = createArtifactFilter();
  const record = layer.evaluate(input());
  assert.equal(record.windowClass, 'PREFIX_ELIGIBLE');
  assert.equal(record.completeness, 'COMPLETE');
  assert.equal(record.completenessReason, 'SEGMENT_CLOSED');
  assert.equal(record.artifactCount, 0);
  assert.equal(record.boundaryTick, null);
  assert.equal(record.boundaryCause, null);
  assert.deepEqual(record.prefix, { fromTick: 1, toTick: 100, ticks: 100 });
  assert.equal(record.suppressed, null);
  const evidence = layer.emitPreImpactEvidence(record);
  assert.equal(evidence.wholeWindow, true);
  assert.equal(evidence.boundaryTick, null);
  assert.equal(evidence.usableTicks, 100);
  const denominators = layer.getDenominators();
  assert.equal(denominators.complete, 1);
  assert.equal(denominators.partial, 0);
  assert.equal(denominators.truncated, 0);
  assert.equal(denominators.artifactsTotal, 0);
  assert.equal(denominators.suppressedTicks, 0);
  assert.equal(denominators.usableTicks, 100);
  assert.equal(denominators.total, denominators.prefixEligible + denominators.fullySuppressed);
  assert.equal(
    denominators.total,
    denominators.complete + denominators.partial + denominators.truncated,
  );
});

test('088 the closed vocabulary is total, the split rule is exact and the tightening is deterministic', () => {
  // Every cause maps to exactly one kind and to at least one authoritative source.
  for (const cause of artifactCauses) {
    assert.ok(artifactKinds.includes(artifactCauseKinds[cause]), `${cause} has a kind`);
    assert.ok(artifactCauseSources[cause].length > 0, `${cause} has a source`);
    for (const source of artifactCauseSources[cause])
      assert.ok(artifactSources.includes(source), `${cause} source ${source} is declared`);
  }
  assert.equal(new Set(artifactCauses).size, artifactCauses.length);
  assert.equal(
    artifactKinds.every((kind) =>
      artifactCauses.some((cause) => artifactCauseKinds[cause] === kind),
    ),
    true,
    'every kind is reachable',
  );

  // Determinism: the same input twice, in two fresh layers, produces an identical record.
  const build = () => {
    const layer = createArtifactFilter();
    const record = layer.evaluate(
      input({
        collisions: [{ tick: 41, incidentId: 'i', impulseNs: 5, otherEntityId: 'w' }],
        suspensions: [{ fromTick: 61, toTick: 70, cause: 'menu' }],
      }),
    );
    const result = JSON.stringify(record);
    layer.dispose();
    return result;
  };
  assert.equal(build(), build());

  // A later evaluation can only add artifacts or worsen the completeness, never restore it.
  const layer = createArtifactFilter();
  const first = layer.evaluate(
    input({ tick: 50, endTick: null, segmentCompleteness: 'OPEN', closeReason: null }),
  );
  assert.equal(first.completeness, 'PARTIAL');
  assert.equal(first.observationCount, 1);
  const second = layer.evaluate(
    input({
      tick: 100,
      segmentId: SEGMENT,
      collisions: [{ tick: 51, incidentId: 'i2', impulseNs: 7, otherEntityId: 'w' }],
    }),
  );
  assert.equal(second.completeness, 'PARTIAL');
  assert.equal(second.completenessReason, 'TRUNCATED_BY_ARTIFACT');
  assert.equal(second.observationCount, 2);
  assert.equal(second.artifacts.length, 1);
  assert.equal(
    second.windowId,
    first.windowId,
    'the window identity is stable across observations',
  );
  assert.equal(second.boundaryTick, 51);
  const third = layer.evaluate(
    input({
      tick: 150,
      segmentId: SEGMENT,
      endTick: 150,
      collisions: [{ tick: 51, incidentId: 'i2', impulseNs: 7, otherEntityId: 'w' }],
      lostCheckpointTick: 140,
    }),
  );
  assert.equal(third.completeness, 'TRUNCATED', 'the completeness can only tighten');
  assert.equal(third.completenessReason, 'CHECKPOINT_LOST');
  assert.equal(third.artifacts.length, 2, 'the collision is not dropped when the loss is added');
  assert.equal(layer.getStats().windowsEvaluated, 1, 'one window was evaluated, not three');
  assert.equal(layer.getStats().evaluationCalls, 3);
  // A closed segment cannot silently reopen.
  assert.throws(
    () =>
      layer.evaluate(
        input({
          tick: 200,
          segmentId: SEGMENT,
          endTick: null,
          segmentCompleteness: 'OPEN',
          closeReason: null,
        }),
      ),
    /cannot reopen/,
  );
  assert.equal(ARTIFACT_FILTER_TICK_HZ, 60);
});

test('088 the bounded store retires oldest-first, keeps cumulative denominators and rejects malformed input', () => {
  const cap = ARTIFACT_CAPACITY.minimum;
  const layer = createArtifactFilter({ maxWindows: cap });
  for (let index = 0; index < cap + 5; index += 1)
    layer.evaluate(
      input({ tick: index + 1, segmentId: `seg-${index}`, startTick: 1, endTick: index + 1 }),
    );
  const stats = layer.getStats();
  assert.equal(stats.retained, cap);
  assert.equal(stats.windowsEvaluated, cap + 5);
  assert.equal(stats.retiredTotal, 5);
  assert.equal(stats.rejectedTotal, 0);
  assert.ok(stats.estimatedBytes <= stats.estimatedBytesMaximum);
  assert.equal(stats.estimatedBytesMaximum, cap * ARTIFACT_RECORD_BYTES_CEILING);
  assert.equal(
    ARTIFACT_CAPACITY.default * ARTIFACT_RECORD_BYTES_CEILING <= ARTIFACT_RECORDER_RAM_BYTES,
    true,
  );
  assert.equal(
    ARTIFACT_CAPACITY.maximum * ARTIFACT_RECORD_BYTES_CEILING <= ARTIFACT_RECORDER_RAM_BYTES,
    true,
  );
  // Cumulative evidence survives retirement, exactly like the 086/087 denominators.
  assert.equal(layer.getDenominators().total, cap + 5);
  assert.equal(layer.getDenominators().prefixEligible, cap + 5);
  layer.dispose();
  const disposed = layer.getStats();
  assert.equal(disposed.disposed, true);
  assert.equal(disposed.retained, 0);
  assert.equal(disposed.identityCodeUnits, 0);
  assert.equal(disposed.estimatedBytes, 0);
  assert.equal(layer.getDenominators().total, cap + 5);
  assert.throws(() => layer.evaluate(input({ tick: cap + 10, segmentId: 'late' })), /disposed/);

  assert.throws(() => createArtifactFilter({ maxWindows: 1 }), /capacity out of range/);
  assert.throws(
    () => createArtifactFilter({ maxWindows: ARTIFACT_CAPACITY.maximum + 1 }),
    /capacity out of range/,
  );
  assert.throws(
    () => createArtifactFilter({ unknown: 1 } as never),
    /Unknown artifact filter option/,
  );

  const other = createArtifactFilter();
  assert.throws(
    () => other.evaluate({ ...input(), extra: true } as never),
    /Missing or unknown contract fields/,
  );
  other.evaluate(input({ tick: 2, segmentId: 'a', startTick: 1, endTick: 2 }));
  assert.throws(() => other.evaluate(input({ tick: 1, segmentId: 'b' })), /tick regressed/);
  assert.throws(
    () => other.evaluate(input({ tick: 3, segmentId: 'c', worldEpoch: EPOCH + 1 })),
    /another session or world epoch/,
  );
  assert.throws(
    () =>
      other.evaluate(
        input({ tick: 4, segmentId: 'd', controlMode: 'MANUAL', learningEligible: true }),
      ),
    /Only LEARNING/,
  );
  assert.throws(
    () =>
      other.evaluate(
        input({
          tick: 5,
          segmentId: 'e',
          endTick: 10,
          collisions: [{ tick: 50, incidentId: 'x', impulseNs: 1, otherEntityId: 'y' }],
        }),
      ),
    /outside the window/,
  );
  assert.throws(
    () =>
      other.evaluate(
        input({
          tick: 6,
          segmentId: 'f',
          lostCheckpointTick: 900,
          endTick: null,
          segmentCompleteness: 'OPEN',
          closeReason: null,
          startTick: 905,
        }),
      ),
    /Lost checkpoint precedes the window/,
  );
  assert.throws(
    () => other.evaluate(input({ tick: 7, segmentId: 'g', segmentCompleteness: 'OPEN' })),
    /completeness and end tick disagree/,
  );
  assert.throws(
    () => other.evaluate(input({ tick: 8, segmentId: 'h', classId: 'truck' } as never)),
    /Missing or unknown contract fields/,
  );
  assert.throws(
    () =>
      other.evaluate(
        input({
          tick: 9,
          segmentId: 'i',
          collisions: [{ tick: 3, incidentId: 'z', impulseNs: -1, otherEntityId: 'y' }],
        }),
      ),
    /finite number in range/,
  );

  // A window above the artefact capacity is refused without leaving partial state behind.
  const capacity = createArtifactFilter();
  const tooMany = Array.from({ length: ARTIFACT_MAX_PER_WINDOW + 1 }, (_, index) => ({
    tick: index + 1,
    incidentId: `incident-${index}`,
    impulseNs: 1,
    otherEntityId: 'wall',
  }));
  assert.throws(
    () => capacity.evaluate(input({ tick: 500, segmentId: 'cap', collisions: tooMany })),
    /capacity exceeded/,
  );
  assert.equal(capacity.getStats().retained, 0, 'a refused window is never retained');
  assert.equal(capacity.getStats().rejectedTotal, 1);
  assert.equal(capacity.getDenominators().total, 0, 'a refused window adds no denominator entry');
  assert.equal(capacity.getDenominators().artifactsTotal, 0, 'a refused window adds no artefact');
  capacity.dispose();
  other.dispose();
});

test('088 integration: real 028 collisions, real 030 recovery, real 087 labels and real 086 opportunities at the 219 cadence', () => {
  // A real 028 collision chain on the real registry: one taxi/obstacle contact at tick 306.
  const collisions = new CollisionRegistry();
  const taxiIdentity = collisions.register(VEHICLE, 'VEHICLE', 1);
  const wallIdentity = collisions.register('wall', 'OBSTACLE', 2);
  const episodes = createCollisionEpisodes(BUS_WORLD, collisions, { cooldownTicks: 60 });
  // A real 030 recovery history: the record is admitted, completed and read back through the ledger.
  const ledger = createRecoveryLedger();
  const recoveryRecord: RecoveryRecord = {
    context: Object.freeze({ schemaVersion: 1 as const, units: 'SI' as const, ...WORLD }),
    operationId: 'recovery-op-1',
    vehicleId: VEHICLE,
    bodyGeneration: 3,
    pointId: 'recovery-point-1',
    mapId: 'map-044',
    laneId: 'lane-a',
    access: 'TAXI',
    mode: 'MANUAL',
    validatedTick: 396,
    requestedTick: 397,
    acceptedTick: 402,
    origin: 'R',
    kind: 'TELEPORT',
    learningEligible: false,
    status: 'ADMITTED',
    before: null,
    placement: null,
    deliveredStages: 0,
    failure: null,
  };
  const recoveryIndex = ledger.admit(recoveryRecord, 'fingerprint');
  ledger.update(recoveryIndex, Object.freeze({ ...recoveryRecord, status: 'COMPLETED' }));
  ledger.finish(recoveryIndex);
  const recovered = ledger.readHistory(0, 1)[0]!;

  // The real 036 signal controller, real 037 stop rules and real 086 registry on the real 044 fixture.
  const map = structuredClone(minimalMap()) as Mutable<RoadMap>;
  map.stopLines = map.stopLines.map((line) =>
    line.id === 'signal-stop' ? { ...line, kind: 'STOP' as const, signalId: null } : line,
  );
  map.signals = [
    {
      id: 'signal',
      intersectionId: 'junction',
      phases: [
        { id: 'green', durationS: 2, movementStates: [{ movementId: 'move', state: 'GREEN' }] },
        { id: 'red', durationS: 1, movementStates: [{ movementId: 'move', state: 'RED' }] },
      ],
    },
  ];
  const bus = createEventBus(BUS_WORLD);
  const signals = createSignalController(map, { context: BUS_WORLD, eventBus: bus });
  const rules = createStopRules(map, WORLD);
  const registry = createOpportunityRegistry();
  const eligibility = createEligibilityWindows();
  const filter = createArtifactFilter();

  const COLLISION_TICK = 306;
  const RECOVERY_TICK = recovered.acceptedTick;
  const queue: SimulationEvent[] = [];
  const collisionFacts: CollisionIncident[] = [];
  const recoveryFacts = [
    {
      tick: recovered.acceptedTick,
      operationId: recovered.operationId,
      status: recovered.status,
      pointId: recovered.pointId,
      mapId: recovered.mapId,
      laneId: recovered.laneId,
      mode: recovered.mode,
      validatedTick: recovered.validatedTick,
      learningEligible: false as const,
    },
  ];

  for (let tick = 1; tick <= 600; tick += 1) {
    signals.step(tick);
    // Real 028: one contact at the collision tick, drained every tick with strict consecutive coverage.
    const contacts =
      tick === COLLISION_TICK
        ? [{ first: taxiIdentity, second: wallIdentity, impulseNs: 4400 }]
        : [];
    episodes.update(tick, contacts);
    episodes.drain((incident) => {
      collisionFacts.push(incident);
      return undefined;
    });
    const stopObservation: StopObservation = {
      ...WORLD,
      tick,
      vehicleId: VEHICLE,
      incarnation: INCARNATION,
      laneId: 'lane-a',
      access: 'TAXI',
      frontPositionM: { x: tick <= 65 ? 7.5 : 8.6, y: 0, z: 0 },
      headingRad: 0,
      speedMps: tick <= 65 ? 0 : 5,
      discontinuity: false,
    };
    for (const event of rules.observe(stopObservation)) queue.push(event);
    // The real 219 decision cadence: 60 Hz ticks, a decision every six ticks (10 Hz).
    if (tick % 6 !== 0) continue;
    const movement = signals.getMovementSignal('junction', 'move');
    const snapshot = signals.getSignal('signal');
    const records = registry.observe({
      tick,
      sessionId: SESSION,
      worldEpoch: EPOCH,
      segmentId: SEGMENT,
      learningEligible: true,
      vehicleId: VEHICLE,
      incarnation: INCARNATION,
      signal:
        movement && snapshot ? opportunitySignalContext(movement, snapshot.phaseStartedTick) : null,
      events: queue.splice(0, queue.length),
      stimuli: [],
      conclusions: [],
    });
    for (const record of records) {
      eligibility.observe({
        tick,
        sessionId: SESSION,
        worldEpoch: EPOCH,
        opportunityId: record.id,
        kind: record.kind,
        vehicleId: VEHICLE,
        incarnation: INCARNATION,
        segmentId: SEGMENT,
        controlMode: 'LEARNING',
        learningEligible: true,
        classId: 'sedan',
        suspension: 'NONE',
        visibility: { source: 'CONTROLLED_FIXTURE', observable: true },
        leader: null,
        signal: movement
          ? {
              signalId: movement.signalId,
              intersectionId: movement.intersectionId,
              movementId: movement.movementId,
              state: movement.state,
            }
          : null,
        greenExit: null,
        mechanical: null,
        impact: null,
      });
    }
    const closed = tick === 600;
    filter.evaluate({
      tick,
      sessionId: SESSION,
      worldEpoch: EPOCH,
      segmentId: 'ride-segment',
      vehicleId: VEHICLE,
      incarnation: INCARNATION,
      controlMode: 'LEARNING',
      learningEligible: true,
      startTick: 1,
      endTick: closed ? 600 : null,
      segmentCompleteness: closed ? 'CLOSED' : 'OPEN',
      closeReason: closed ? 'RIDE_COMPLETED' : null,
      lostCheckpointTick: null,
      observationLoss: null,
      collisions: collisionFacts.map((incident) => ({
        tick: incident.tick,
        incidentId: incident.incidentId,
        impulseNs: incident.impulseNs,
        otherEntityId: incident.otherEntityId,
      })),
      recoveries: tick >= RECOVERY_TICK ? recoveryFacts : [],
      suspensions: [],
    });
  }

  assert.equal(collisionFacts.length, 1, 'the real 028 chain emitted exactly one incident');
  assert.equal(collisionFacts[0].tick, COLLISION_TICK);
  assert.equal(collisionFacts[0].impulseNs, 4400);
  assert.equal(recovered.kind, 'TELEPORT');
  assert.equal(recovered.status, 'COMPLETED');

  const window = filter.getWindow('ride-segment');
  assert.ok(window);
  assert.equal(window.windowClass, 'PREFIX_ELIGIBLE');
  assert.equal(
    window.boundaryTick,
    COLLISION_TICK,
    'the earliest artifact sets the exact boundary',
  );
  assert.equal(window.boundaryCause, 'COLLISION_IMPULSE');
  assert.deepEqual(window.prefix, {
    fromTick: 1,
    toTick: COLLISION_TICK - 1,
    ticks: COLLISION_TICK - 1,
  });
  assert.deepEqual(window.suppressed, {
    fromTick: COLLISION_TICK,
    toTick: 600,
    ticks: 600 - COLLISION_TICK + 1,
  });
  assert.equal(window.artifacts.length, 2);
  assert.deepEqual(
    window.artifacts.map((artifact) => [artifact.kind, artifact.cause, artifact.boundaryTick]),
    [
      ['COLLISION', 'COLLISION_IMPULSE', COLLISION_TICK],
      ['TELEPORT', 'RECOVERY_TELEPORT', RECOVERY_TICK],
    ],
  );
  assert.equal(window.completeness, 'PARTIAL');
  assert.equal(window.completenessReason, 'RECOVERY');

  const evidence = filter.emitPreImpactEvidence(window);
  const prefixEnd = evidence.usableToTick;
  assert.equal(prefixEnd, COLLISION_TICK - 1);

  // Only the real 087 ELIGIBLE windows observed strictly before the boundary may become preference
  // evidence; the post-impact segment can produce none.
  const eligibleWindows = eligibility
    .getWindows()
    .filter((record): record is EligibleWindowRecord => record.windowClass === 'ELIGIBLE');
  const inPrefix = eligibleWindows.filter(
    (record) => record.openedTick >= evidence.usableFromTick && record.lastTick <= prefixEnd,
  );
  const postImpact = eligibleWindows.filter((record) => record.lastTick > prefixEnd);
  assert.ok(inPrefix.length > 0, 'the real chain opened eligible windows before the impact');
  assert.ok(postImpact.length > 0, 'the real chain opened opportunities after the impact');
  let emitted = 0;
  for (const record of inPrefix) {
    eligibility.emitPreferenceEvidence(record);
    emitted += 1;
  }
  // The post-impact windows are structurally outside the evidence span, so they cannot be emitted.
  for (const record of postImpact) assert.ok(record.lastTick > evidence.usableToTick);
  assert.equal(eligibility.getDenominators().preferenceEvidenceEmitted, emitted);
  assert.equal(filter.getDenominators().preferenceEvidenceRefused, 0);
  assert.equal(filter.getDenominators().preferenceEvidenceEmitted, 1);
  assert.equal(filter.getDenominators().artifactsTotal, 2);
  assert.equal(filter.getDenominators().usableTicks, prefixEnd);
  assert.equal(filter.getStats().checkpointLosses, 0);

  rules.dispose();
  signals.dispose();
  bus.dispose();
  registry.dispose();
  eligibility.dispose();
  filter.dispose();
  episodes.dispose();
  ledger.clear();
  collisions.dispose();
});
