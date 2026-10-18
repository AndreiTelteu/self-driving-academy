import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateYieldPolicy,
  YIELD_POLICY_LIMITS,
  yieldBehaviorFacts,
  projectYieldProfile,
} from '../../src/autonomy/yield-policy';
import {
  parsePublishableDrivingProfile,
  getParameterDefinition,
} from '../../src/profiles/parameter-registry';
import type { YieldPolicyInput } from '../../src/autonomy/yield-policy';
import type { BehaviorFacts } from '../../src/autonomy/behavior-fsm';
function packet(): YieldPolicyInput {
  return {
    version: YIELD_POLICY_LIMITS.version,
    units: 'SI',
    sessionId: 'yield-test',
    worldEpoch: 0,
    subjectId: 'taxi',
    observationTick: 1,
    decisionTick: 1,
    profile: { versionId: 'common-style', yieldTimeGapS: 3 },
    coverage: 'COMPLETE_HORIZON',
    horizonS: 10,
    discontinuity: false,
    actors: [
      { id: 'taxi', incarnation: 1, active: true, observable: true, routeKnown: true },
      { id: 'civil', incarnation: 1, active: true, observable: true, routeKnown: true },
    ],
    candidates: [{ relationId: 'conflict', entryS: 1, exitS: 2 }],
    pairs: [
      {
        relationId: 'conflict',
        otherActorId: 'civil',
        priority: 'YIELD',
        arrival: { state: 'APPROACHING', timeToEntryS: 5, timeToExitS: 6 },
      },
    ],
  };
}
test('selected common published profile is immutable and grants no estimator/publication capability', () => {
  const profile = parsePublishableDrivingProfile({
    schemaVersion: 1,
    units: 'SI',
    profileId: 'common-style',
    versionId: 'base-v1',
    parentVersionId: null,
    engineVersion: 'test',
    parameters: { yield_time_gap: 0.2 },
    unitsByParameter: { yield_time_gap: 's' },
    provenanceByParameter: { yield_time_gap: 'BASE' },
    evidenceByParameter: { yield_time_gap: null },
    sourceSegmentIds: [],
    createdAt: '2026-10-05T00:00:00.000Z',
    checksum: 'fixture',
  });
  const projected = projectYieldProfile(profile);
  assert.deepEqual(projected, { versionId: 'base-v1', yieldTimeGapS: 0.2 });
  assert(Object.isFrozen(projected));
  assert.equal(getParameterDefinition('yield_time_gap').estimable, false);
  assert.throws(() =>
    projectYieldProfile({ ...profile, unitsByParameter: { yield_time_gap: 'm' } }),
  );
});
test('common profile inclusive interval boundaries, overlapping occupancy and deterministic limiting relation', () => {
  const input = packet();
  assert.equal(evaluateYieldPolicy(input).action, 'ACCEPT');
  assert.equal(
    evaluateYieldPolicy({ ...input, profile: { ...input.profile, yieldTimeGapS: 3.0001 } }).action,
    'REFUSE',
  );
  assert.equal(
    evaluateYieldPolicy({
      ...input,
      candidates: [{ relationId: 'conflict', entryS: 9, exitS: 10 }],
      horizonS: 13,
    }).action,
    'ACCEPT',
  );
  const overlapping = evaluateYieldPolicy({
    ...input,
    candidates: [{ relationId: 'conflict', entryS: 5.5, exitS: 7 }],
  });
  assert.equal(overlapping.action, 'REFUSE');
  assert.equal(overlapping.minimumGapS, -0.5);
  assert.equal(overlapping.limitingRelationId, 'conflict');
  assert(Object.isFrozen(overlapping));
  // Driver kind never enters the evaluator or overrides the common style.
  const civilSubject = {
    ...input,
    subjectId: 'civil',
    pairs: [{ ...input.pairs[0], otherActorId: 'taxi' }],
  };
  assert.equal(evaluateYieldPolicy(civilSubject).thresholdS, evaluateYieldPolicy(input).thresholdS);
});
test('local/unknown/incomplete facts override even known availability; source tick is not restamped', () => {
  const input = packet();
  for (const unknown of [
    { ...input, coverage: 'LOCAL_ONLY' as const, pairs: [] },
    { ...input, coverage: 'INCOMPLETE' as const },
    { ...input, horizonS: 4.99 },
    { ...input, discontinuity: true },
    { ...input, decisionTick: 8 },
    { ...input, observationTick: 2 },
    { ...input, candidates: [] },
    { ...input, pairs: [] },
    {
      ...input,
      candidates: [...input.candidates, { relationId: 'second-conflict', entryS: 1, exitS: 2 }],
    },
    { ...input, pairs: [{ ...input.pairs[0], relationId: 'missing-candidate' }] },
    { ...input, pairs: [{ ...input.pairs[0], priority: 'EQUAL' as const }] },
    { ...input, pairs: [{ ...input.pairs[0], arrival: null }] },
    { ...input, actors: input.actors.map((a) => ({ ...a, observable: a.id === 'taxi' })) },
    {
      ...input,
      pairs: [
        {
          ...input.pairs[0],
          arrival: { state: 'OCCUPYING' as const, timeToEntryS: 0, timeToExitS: null },
        },
      ],
    },
  ])
    assert.equal(evaluateYieldPolicy(unknown).action, 'UNKNOWN');
  assert.equal(evaluateYieldPolicy({ ...input, decisionTick: 7 }).sourceTick, 1);
  assert.equal(
    evaluateYieldPolicy({
      ...input,
      pairs: [],
      actors: input.actors.map((actor) => ({ ...actor, active: actor.id === 'taxi' })),
    }).reason,
    'NO_EXPOSURE',
  );
});
test('strict admission rejects getters, duplicate identities, contradictory arrivals and finite capacities without mutation', () => {
  const input = packet();
  let getterCalls = 0;
  const getter = {
    ...input,
    get horizonS() {
      getterCalls++;
      return 10;
    },
  };
  assert.throws(() => evaluateYieldPolicy(getter));
  assert.equal(getterCalls, 0);
  for (const invalid of [
    { ...input, actors: [...input.actors, input.actors[0]] },
    {
      ...input,
      actors: Array.from({ length: 111 }, (_, i) => ({ ...input.actors[0], id: `actor-${i}` })),
    },
    {
      ...input,
      candidates: Array.from({ length: 129 }, (_, i) => ({
        relationId: `c-${i}`,
        entryS: 0,
        exitS: 1,
      })),
    },
    { ...input, pairs: Array.from({ length: 4097 }, () => input.pairs[0]) },
    {
      ...input,
      actors: [
        input.actors[0],
        ...Array.from({ length: 109 }, (_, i) => ({ ...input.actors[1], id: `other-${i}` })),
      ],
      candidates: Array.from({ length: 128 }, (_, i) => ({
        relationId: `c-${i}`,
        entryS: 0,
        exitS: 1,
      })),
      pairs: [],
    },
    { ...input, pairs: [...input.pairs, input.pairs[0]] },
    { ...input, pairs: [{ ...input.pairs[0], otherActorId: 'absent' }] },
    { ...input, profile: { ...input.profile, yieldTimeGapS: NaN } },
    { ...input, profile: { ...input.profile, yieldTimeGapS: 0.199 } },
    { ...input, horizonS: 60.01 },
    {
      ...input,
      pairs: [
        {
          ...input.pairs[0],
          arrival: { state: 'CLEARED' as const, timeToEntryS: 0, timeToExitS: 1 },
        },
      ],
    },
  ])
    assert.throws(() => evaluateYieldPolicy(invalid));
  assert.equal(evaluateYieldPolicy(input).action, 'ACCEPT');
  const before = JSON.stringify(input);
  for (let cycle = 0; cycle < 20; cycle++)
    assert.equal(evaluateYieldPolicy(input).retainedHistory, 0);
  assert.equal(JSON.stringify(input), before);
});
test('045 composition preserves explicit STOP/service facts; unknown produces no fabricated route blockage', () => {
  const input = packet();
  const facts: BehaviorFacts = {
    version: '045-decision-facts-v1',
    profileVersionId: 'common-style',
    routeBlocked: false,
    stop: 'RED_BY_PROFILE',
    yield: 'NONE',
    service: 'ACCEPTED',
    laneChange: 'NONE',
  };
  const refusal = evaluateYieldPolicy({
    ...input,
    profile: { ...input.profile, yieldTimeGapS: 4 },
  });
  assert.deepEqual(yieldBehaviorFacts(facts, refusal), { ...facts, yield: 'CONFLICT_BY_POLICY' });
  assert.equal(
    yieldBehaviorFacts(facts, evaluateYieldPolicy({ ...input, coverage: 'LOCAL_ONLY' })),
    null,
  );
  assert.throws(() => yieldBehaviorFacts({ ...facts, profileVersionId: 'foreign' }, refusal));
});
