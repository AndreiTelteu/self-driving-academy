import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parameterDefinitions, parameterRegistry } from '../../src/profiles/parameter-registry.ts';
import { createParameterEvidenceLedger, parameterEvidenceSpecs } from '../../src/learning/index.ts';
import type { EvidenceObservation } from '../../src/learning/parameter-evidence.ts';
import type { EligibilityWindowRecord, OpportunityRecord } from '../../src/telemetry/index.ts';

function observation(
  id: string,
  occurrence: number,
  options: {
    readonly label?: EligibilityWindowRecord['label'];
    readonly speed?: number;
    readonly ticks?: number;
  } = {},
): EvidenceObservation {
  const label = options.label ?? 'FREE_TRAFFIC';
  const ticks = options.ticks ?? 60;
  const window = {
    windowId: `window-${id}`,
    opportunityId: id,
    kind: 'STOP',
    reason: 'NO_CONSTRAINT',
    source: 'NONE',
    observable: true,
    vehicleId: 'vehicle-1',
    incarnation: 'incarnation-1',
    segmentId: 'segment-1',
    controlMode: 'LEARNING',
    learningEligible: true,
    openedTick: 1,
    lastTick: ticks,
    observationCount: 20,
    reaction: { open: false, reason: 'NOT_OBSERVABLE' },
    windowClass:
      label === 'FREE_TRAFFIC'
        ? 'ELIGIBLE'
        : ['PAUSE', 'FOCUS_LOST', 'MANUAL_SEGMENT', 'AUTO_SEGMENT', 'NOT_OBSERVABLE'].includes(
              label,
            )
          ? 'EXCLUDED'
          : 'EXTERNAL_CONSTRAINT',
    label,
  } as EvidenceObservation['eligibility'];
  const opportunity: OpportunityRecord = {
    id,
    kind: 'STOP',
    state: 'RESOLVED',
    outcome: 'STOPPED',
    result: 'SUCCESS',
    truncationReason: null,
    vehicleId: 'vehicle-1',
    incarnation: 'incarnation-1',
    segmentIds: ['segment-1'],
    learningEligible: true,
    occurrence,
    openedTick: 1,
    lastTick: ticks,
    resolvedTick: ticks,
    observationCount: 20,
    stimulus: {
      stopLineId: 'stop-line-1',
      signalId: null,
      intersectionId: null,
      movementId: null,
      movementPhaseStartedTick: null,
      fromLaneId: null,
      toLaneId: null,
      relationIds: [],
    },
  };
  const artifacts = {
    windowId: window.windowId,
    sessionId: 'session-1',
    worldEpoch: 1,
    segmentId: 'segment-1',
    vehicleId: 'vehicle-1',
    incarnation: 'incarnation-1',
    controlMode: 'LEARNING',
    learningEligible: true,
    startTick: 1,
    endTick: ticks,
    completeness: 'COMPLETE',
    completenessReason: 'SEGMENT_CLOSED',
    artifacts: [],
    artifactCount: 0,
    boundaryTick: null,
    boundaryCause: null,
    suppressed: null,
    openedTick: 1,
    lastTick: ticks,
    observationCount: 20,
    windowClass: 'PREFIX_ELIGIBLE',
    prefix: { fromTick: 1, toTick: ticks, ticks },
  } as EvidenceObservation['artifacts'];
  return {
    eligibility: window,
    opportunity,
    artifacts,
    roadType: 'urban',
    stopOutcome: 'STOPPED',
    ...(options.speed === undefined
      ? {}
      : { speedSamples: [{ tick: 2, speedMps: options.speed }] }),
  };
}

test('specifications cover exactly the 24 registry M keys with identical units and ranges', () => {
  const expected = parameterDefinitions.filter(
    (item) => item.implementationStage === 'initial_learning_target',
  );
  assert.equal(expected.length, 24);
  assert.equal(parameterEvidenceSpecs.length, 24);
  assert.equal(new Set(parameterEvidenceSpecs.map((item) => item.key)).size, 24);
  assert.deepEqual(
    new Set(parameterEvidenceSpecs.map((item) => item.key)),
    new Set(expected.map((item) => item.key)),
  );
  for (const spec of parameterEvidenceSpecs) {
    const definition = parameterRegistry[spec.key];
    assert.equal(spec.unit, definition.unit);
    assert.equal(spec.min, definition.min);
    assert.equal(spec.max, definition.max);
    assert.equal(definition.estimable, false);
  }
  const owners = new Map<string, string[]>();
  for (const spec of parameterEvidenceSpecs) {
    owners.set(spec.estimatorOwner, [...(owners.get(spec.estimatorOwner) ?? []), spec.key]);
  }
  assert.deepEqual([...owners.keys()].sort(), ['094', '095', '096', '097', '098', '099']);
  for (const [owner, keys] of owners) assert.equal(keys.length, 4, `${owner} owns ${keys.length}`);
  assert.deepEqual(owners.get('094')?.sort(), [
    'curve_lateral_accel',
    'intersection_approach_speed',
    'speed_delta_residential',
    'speed_delta_urban',
  ]);
  assert.deepEqual(owners.get('096')?.sort(), [
    'following_min_gap',
    'following_speed_gain',
    'following_time_headway',
    'queue_standstill_gap',
  ]);
  assert.deepEqual(owners.get('098')?.sort(), [
    'stop_dwell_time',
    'stop_full_probability',
    'stop_line_offset',
    'yield_time_gap',
  ]);
});

test('empty evidence, including a demonstration with no STOP outcome, never becomes zero', () => {
  const ledger = createParameterEvidenceLedger();
  const result = ledger.read('stop_full_probability');
  assert.equal(result.status, 'NO_EVIDENCE');
  assert.equal(result.unchanged, true);
  assert.equal(result.noEstimate, 'NO_QUALIFYING_EVIDENCE');
  assert.equal('value' in result, false);
  assert.equal('delta' in result, false);
  assert.equal(result.distinctEpisodes, 0);
});

test('read models and context breakdowns are immutable', () => {
  const ledger = createParameterEvidenceLedger();
  const read = ledger.read('stop_full_probability');
  assert.ok(Object.isFrozen(read));
  assert.ok(Object.isFrozen(read.contextBreakdown));
  assert.ok(Object.isFrozen(ledger.readAll()));
});

test('foreign context is rejected instead of guessed', () => {
  const ledger = createParameterEvidenceLedger();
  assert.throws(() => ledger.observe({} as never), /086\/087\/088 facts/);
});

test('20 correlated STOP observations deduplicate by opportunity identity and occurrence', () => {
  const ledger = createParameterEvidenceLedger();
  for (let frame = 0; frame < 20; frame += 1) ledger.observe(observation('stop-1', 1));
  assert.equal(ledger.read('stop_full_probability').distinctEpisodes, 1);
  ledger.observe(observation('stop-1', 1));
  assert.equal(ledger.read('stop_full_probability').distinctEpisodes, 1);
  ledger.observe(observation('stop-1-next-occurrence', 2));
  assert.equal(ledger.read('stop_full_probability').distinctEpisodes, 2);
});

test('speed requires ten seconds of free traffic and excludes constrained contexts', () => {
  const ledger = createParameterEvidenceLedger();
  ledger.observe(observation('short', 1, { ticks: 599, speed: 10 }));
  ledger.observe(observation('leader', 2, { label: 'LEADER', ticks: 600, speed: 10 }));
  assert.equal(ledger.read('speed_delta_urban').distinctEpisodes, 0);
  ledger.observe(observation('free', 3, { ticks: 600, speed: 10 }));
  assert.equal(ledger.read('speed_delta_urban').distinctEpisodes, 1);
});

test('following evidence remains insufficient at one speed and needs varied speeds', () => {
  const ledger = createParameterEvidenceLedger();
  ledger.observe({
    ...observation('leader-1', 1, { label: 'LEADER', speed: 5 }),
    headway: { gapM: 6, speedMps: 5 },
  });
  assert.equal(ledger.read('following_time_headway').status, 'INSUFFICIENT');
  ledger.observe({
    ...observation('leader-2', 2, { label: 'LEADER', speed: 12 }),
    headway: { gapM: 8, speedMps: 12 },
  });
  ledger.observe({
    ...observation('leader-3', 3, { label: 'LEADER', speed: 20 }),
    headway: { gapM: 10, speedMps: 20 },
  });
  assert.equal(ledger.read('following_time_headway').distinctEpisodes, 3);
  assert.equal(ledger.read('following_time_headway').status, 'READY');
});

test('TRUNCATED 088 evidence uses its prefix; FULLY_SUPPRESSED and excluded windows add nothing', () => {
  const ledger = createParameterEvidenceLedger();
  const truncated = observation('prefix', 1, { ticks: 600, speed: 10 });
  ledger.observe({
    ...truncated,
    artifacts: { ...truncated.artifacts, completeness: 'TRUNCATED' },
  });
  assert.equal(ledger.read('speed_delta_urban').distinctEpisodes, 1);
  const suppressed = observation('suppressed', 2, { ticks: 600, speed: 10 });
  ledger.observe({
    ...suppressed,
    artifacts: { ...suppressed.artifacts, windowClass: 'FULLY_SUPPRESSED', prefix: null },
  });
  const paused = observation('paused', 3, { label: 'PAUSE', ticks: 600, speed: 10 });
  ledger.observe(paused);
  assert.equal(ledger.read('speed_delta_urban').distinctEpisodes, 1);
});
