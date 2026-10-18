import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LANE_CHANGE_EMPTY_STATE,
  LANE_CHANGE_LIMITS,
  evaluateLaneChange,
  getLaneChangeStats,
  laneChangeBehaviorFacts,
  projectLaneChangeProfile,
} from '../../src/autonomy/lane-change-policy';
import type {
  LaneChangeDecision,
  LaneChangeInput,
  LaneChangeProfile,
  LaneChangeState,
} from '../../src/autonomy/lane-change-policy';
import { createBehaviorFSM } from '../../src/autonomy/behavior-fsm';
import type { BehaviorFacts } from '../../src/autonomy/behavior-fsm';
import {
  getParameterDefinition,
  parsePublishableDrivingProfile,
} from '../../src/profiles/parameter-registry';
import { laneAdjacency, laneProbeFixture, parallelLaneMap } from './policy-probe-fixture';
import { createLaneGraph } from '../../src/world';
import { referenceLaneChange } from './lane-change-policy-reference';

const SCOPE = { sessionId: 'lane-test', worldEpoch: 0 };
const ACTOR = { id: 'taxi', incarnation: 1 };
function published(values: Partial<Record<string, number>> = {}) {
  return parsePublishableDrivingProfile({
    schemaVersion: 1,
    units: 'SI',
    profileId: 'lane-style',
    versionId: 'lane-base-v1',
    parentVersionId: null,
    engineVersion: 'test',
    parameters: {
      lane_change_front_gap: 12,
      lane_change_back_gap: 10,
      lane_change_speed_gain: 2,
      lane_change_cooldown: 6,
      ...values,
    },
    unitsByParameter: {
      lane_change_front_gap: 'm',
      lane_change_back_gap: 'm',
      lane_change_speed_gain: 'm/s',
      lane_change_cooldown: 's',
    },
    provenanceByParameter: {
      lane_change_front_gap: 'BASE',
      lane_change_back_gap: 'BASE',
      lane_change_speed_gain: 'BASE',
      lane_change_cooldown: 'BASE',
    },
    evidenceByParameter: {
      lane_change_front_gap: null,
      lane_change_back_gap: null,
      lane_change_speed_gain: null,
      lane_change_cooldown: null,
    },
    sourceSegmentIds: [],
    createdAt: '2026-10-19T00:00:00.000Z',
    checksum: 'fixture',
  });
}
function profile(overrides: Partial<LaneChangeProfile> = {}): LaneChangeProfile {
  return Object.freeze({ ...projectLaneChangeProfile(published()), ...overrides });
}
const FIXTURE = laneProbeFixture();
const ADJACENCY = FIXTURE.adjacency('lane-a', 'TAXI');
const COMPLETED_ADJACENCY = FIXTURE.adjacency('lane-par', 'TAXI');
if (!ADJACENCY.neighbors.some((neighbor) => neighbor.laneId === 'lane-par'))
  throw new Error('053 probe fixture must expose lane-par as an authored lateral neighbour');
if (COMPLETED_ADJACENCY.neighbors.some((neighbor) => neighbor.laneId === 'lane-par'))
  throw new Error('053 completed-lane adjacency must no longer offer lane-par');
const TARGET = 'lane-par';
function packet(overrides: Partial<LaneChangeInput> = {}): LaneChangeInput {
  const decisionTick = overrides.decisionTick ?? 600;
  return {
    ...SCOPE,
    actor: ACTOR,
    decisionTick,
    profile: profile(),
    state: LANE_CHANGE_EMPTY_STATE,
    adjacency: ADJACENCY,
    observation: {
      version: LANE_CHANGE_LIMITS.observationVersion,
      units: 'SI',
      tick: decisionTick - 1,
      targetLaneId: TARGET,
      coverage: 'COMPLETE',
      frontGapM: 20,
      backGapM: 18,
      targetLaneSpeedMps: 12,
    },
    speedMps: 8,
    ownLaneLeaderSpeedMps: 6,
    intent: 'OPTIONAL_OVERTAKE',
    ...overrides,
  };
}
test('053 projectLaneChangeProfile reads only its four published values and does not grant estimator support', () => {
  const projected = projectLaneChangeProfile(published({ lane_change_speed_gain: 3.5 }));
  assert.deepEqual(projected, {
    versionId: 'lane-base-v1',
    frontGapM: 12,
    backGapM: 10,
    speedGainMps: 3.5,
    cooldownS: 6,
  });
  assert(Object.isFrozen(projected));
  for (const key of [
    'lane_change_front_gap',
    'lane_change_back_gap',
    'lane_change_speed_gain',
    'lane_change_cooldown',
  ]) {
    assert.equal(getParameterDefinition(key).implemented, true);
    assert.equal(getParameterDefinition(key).estimable, false);
  }
  assert.throws(() =>
    projectLaneChangeProfile({
      ...published(),
      unitsByParameter: { ...published().unitsByParameter, lane_change_cooldown: 'm' },
    }),
  );
  assert.throws(() =>
    projectLaneChangeProfile({ ...published(), parameters: { lane_change_front_gap: 41 } }),
  );
});
test('053 access and lateral availability come from the real033 neighbour projection', () => {
  const accepted = evaluateLaneChange(packet());
  assert.equal(accepted.action, 'CHANGE');
  assert.equal(accepted.reason, 'OPTIONAL_CHANGE_VALIDATED');
  assert.equal(accepted.targetLaneId, TARGET);
  assert.equal(accepted.speedAdvantageMps, 6);
  assert.equal(accepted.state.committed?.targetLaneId, TARGET);
  assert.equal(accepted.state.committed?.startedTick, 600);
  assert.equal(accepted.state.lastChangeTick, 600);
  // A lane that 033 does not expose as a lateral neighbour of lane-a is never invented.
  for (const targetLaneId of ['lane-b', 'lane-c', 'lane-invented', 'lane-a'])
    assert.equal(
      evaluateLaneChange(packet({ observation: { ...packet().observation!, targetLaneId } }))
        .reason,
      'TARGET_LANE_NOT_ADJACENT',
    );
  // An access-restricted neighbour disappears for the excluded class because 033 filters it.
  const restricted = parallelLaneMap();
  restricted.lanes.find((lane) => lane.id === 'lane-par')!.access = ['CIVIL'];
  const taxiAdjacency = laneAdjacency(createLaneGraph(restricted), 'lane-a', 'TAXI'),
    civilAdjacency = laneAdjacency(createLaneGraph(restricted), 'lane-a', 'CIVIL');
  assert.deepEqual(taxiAdjacency.neighbors, []);
  assert.deepEqual(civilAdjacency.neighbors, [{ laneId: TARGET, side: 'LEFT' }]);
  assert.equal(evaluateLaneChange(packet({ adjacency: taxiAdjacency })).reason, 'NO_ADJACENT_LANE');
  assert.equal(
    evaluateLaneChange(packet({ adjacency: taxiAdjacency, intent: 'NONE' })).reason,
    'NO_ADJACENT_LANE',
  );
  // The adjacency must state the lane the subject is on; an empty identity is refused.
  assert.throws(() =>
    evaluateLaneChange(packet({ adjacency: { ...ADJACENCY, currentLaneId: '' } })),
  );
});
test('053 insufficient gap or absent speed advantage keeps the vehicle in its own lane', () => {
  const front = evaluateLaneChange(
    packet({ observation: { ...packet().observation!, frontGapM: 11.9 } }),
  );
  assert.equal(front.action, 'NO_CHANGE');
  assert.equal(front.reason, 'INSUFFICIENT_FRONT_GAP');
  assert.equal(front.state.committed, null);
  assert.equal(front.state.lastChangeTick, null);
  const back = evaluateLaneChange(
    packet({ observation: { ...packet().observation!, backGapM: 9.9 } }),
  );
  assert.equal(back.reason, 'INSUFFICIENT_BACK_GAP');
  // No leader: the advantage is measured against the ego speed only, and 12 - 8 clears it.
  const absent = evaluateLaneChange(
    packet({
      ownLaneLeaderSpeedMps: null,
      observation: { ...packet().observation!, targetLaneSpeedMps: 9 },
    }),
  );
  assert.equal(absent.action, 'NO_CHANGE');
  assert.equal(absent.reason, 'INSUFFICIENT_SPEED_GAIN');
  assert.equal(absent.targetLaneId, TARGET);
  assert.equal(absent.speedAdvantageMps, 1);
  assert.equal(absent.state.committed, null);
  // An own-lane leader makes the same target lane attractive.
  assert.equal(evaluateLaneChange(packet({ ownLaneLeaderSpeedMps: 6 })).action, 'CHANGE');
  const noIntent = evaluateLaneChange(packet({ intent: 'NONE' }));
  assert.equal(noIntent.reason, 'NO_INTENT');
  assert.equal(
    evaluateLaneChange(
      packet({ observation: { ...packet().observation!, coverage: 'LOCAL_ONLY' } }),
    ).reason,
    'INCOMPLETE_LANE_COVERAGE',
  );
  // Complete coverage plus a null gap is an observed clear lane, not unknown availability.
  const clear = evaluateLaneChange(
    packet({
      observation: { ...packet().observation!, frontGapM: null, backGapM: null },
    }),
  );
  assert.equal(clear.action, 'CHANGE');
  for (const observation of [
    { frontGapM: 11.9, backGapM: 18, targetLaneSpeedMps: 12 },
    { frontGapM: 20, backGapM: 9.9, targetLaneSpeedMps: 12 },
    { frontGapM: 20, backGapM: 18, targetLaneSpeedMps: 10 },
  ]) {
    const decision = evaluateLaneChange(
      packet({ observation: { ...packet().observation!, ...observation } }),
    );
    assert.equal(
      decision.reason,
      referenceLaneChange({
        frontGapM: 12,
        backGapM: 10,
        speedGainMps: 2,
        cooldownS: 6,
        decisionTick: 600,
        neighbors: [TARGET],
        targetLaneId: TARGET,
        coverage: 'COMPLETE',
        observedFrontGapM: observation.frontGapM,
        observedBackGapM: observation.backGapM,
        targetLaneSpeedMps: observation.targetLaneSpeedMps,
        speedMps: 8,
        ownLaneLeaderSpeedMps: 6,
        intent: 'OPTIONAL_OVERTAKE',
        committedTargetLaneId: null,
        lastChangeTick: null,
      }).reason,
    );
  }
});
test('053 two optional changes too close together are blocked by the profile cooldown', () => {
  let latch: LaneChangeState = LANE_CHANGE_EMPTY_STATE;
  const decide = (overrides: Partial<LaneChangeInput> = {}) => {
    const decision = evaluateLaneChange(packet({ ...overrides, state: latch }));
    latch = decision.state;
    return decision;
  };
  const first = decide();
  assert.equal(first.action, 'CHANGE');
  assert.equal(first.cooldownTicks, 360);
  assert.equal(first.cooldownRemainingTicks, null);
  // The commitment ends; the cooldown survives it in the carried latch.
  latch = Object.freeze({ committed: null, lastChangeTick: first.state.lastChangeTick });
  const tooSoon = decide({ decisionTick: 959 });
  assert.equal(tooSoon.action, 'NO_CHANGE');
  assert.equal(tooSoon.reason, 'COOLDOWN_ACTIVE');
  assert.equal(tooSoon.cooldownRemainingTicks, 1);
  assert.equal(tooSoon.state.lastChangeTick, 600);
  latch = Object.freeze({ committed: null, lastChangeTick: 600 });
  const allowed = decide({ decisionTick: 960 });
  assert.equal(allowed.action, 'CHANGE');
  assert.equal(allowed.cooldownRemainingTicks, 0);
  // A shorter configured cooldown allows the same second change earlier.
  latch = Object.freeze({ committed: null, lastChangeTick: 600 });
  assert.equal(
    decide({ decisionTick: 630, profile: profile({ cooldownS: 0.5 }) }).action,
    'CHANGE',
  );
  assert.equal(
    evaluateLaneChange(
      packet({
        decisionTick: 629,
        profile: profile({ cooldownS: 0.5 }),
        state: { committed: null, lastChangeTick: 600 },
      }),
    ).reason,
    'COOLDOWN_ACTIVE',
  );
});
test('053 an accepted manoeuvre keeps continuity and is never re-validated or reset every frame', () => {
  let latch: LaneChangeState = LANE_CHANGE_EMPTY_STATE;
  const decide = (overrides: Partial<LaneChangeInput> = {}) => {
    const decision = evaluateLaneChange(packet({ ...overrides, state: latch }));
    latch = decision.state;
    return decision;
  };
  const accepted = decide();
  assert.equal(accepted.action, 'CHANGE');
  const started = accepted.state.committed;
  const continuations: LaneChangeDecision[] = [];
  for (let tick = 606; tick <= 660; tick += 6)
    // Gaps now fail every fresh gate, and the cooldown is also active: neither resets the manoeuvre.
    continuations.push(
      decide({
        decisionTick: tick,
        observation: {
          ...packet().observation!,
          tick: tick - 1,
          frontGapM: 1,
          backGapM: 1,
          targetLaneSpeedMps: 0,
        },
      }),
    );
  assert(continuations.every((decision) => decision.action === 'CHANGE'));
  assert(continuations.every((decision) => decision.reason === 'COMMITTED_CONTINUITY'));
  // The latch is carried by value: the committed target and its start tick never change mid-manoeuvre.
  assert(
    continuations.every(
      (decision) =>
        decision.state.committed?.targetLaneId === started?.targetLaneId &&
        decision.state.committed?.startedTick === started?.startedTick,
    ),
  );
  assert(continuations.every((decision) => decision.state.lastChangeTick === 600));
  assert(continuations.every((decision) => decision.frontGapM === 1));
  // The manoeuvre is complete once the vehicle sits on the target lane: that lane is no longer its
  // own lateral neighbour, so the latch releases while the cooldown tick survives.
  const released = decide({
    decisionTick: 666,
    adjacency: COMPLETED_ADJACENCY,
    observation: { ...packet().observation!, tick: 665, targetLaneId: 'lane-a' },
  });
  assert.equal(released.action, 'NO_CHANGE');
  assert.equal(released.reason, 'COMMITMENT_RELEASED');
  assert.equal(released.targetLaneId, TARGET);
  assert.equal(released.state.committed, null);
  assert.equal(released.state.lastChangeTick, 600);
  // A new optional change back is still refused: the first change's cooldown was never reset.
  const repointed = decide({
    decisionTick: 672,
    adjacency: COMPLETED_ADJACENCY,
    observation: { ...packet().observation!, tick: 671, targetLaneId: 'lane-a' },
  });
  assert.equal(repointed.reason, 'COOLDOWN_ACTIVE');
  assert.equal(repointed.state.committed, null);
  assert.equal(repointed.state.lastChangeTick, 600);
  // The same latch is ready for the next legal manoeuvre once the cooldown has elapsed.
  assert.equal(
    decide({
      decisionTick: 972,
      adjacency: COMPLETED_ADJACENCY,
      observation: { ...packet().observation!, tick: 971, targetLaneId: 'lane-a' },
    }).action,
    'CHANGE',
  );
});
test('053 unknown facts, admission and the real045 composition stay explicit', () => {
  const base: BehaviorFacts = {
    version: '045-decision-facts-v1',
    profileVersionId: 'lane-base-v1',
    routeBlocked: false,
    stop: 'NONE',
    yield: 'NONE',
    service: 'NONE',
    laneChange: 'NONE',
  };
  const changing = evaluateLaneChange(packet());
  assert.deepEqual(laneChangeBehaviorFacts(base, changing), { ...base, laneChange: 'VALIDATED' });
  const cleared = laneChangeBehaviorFacts(
    { ...base, laneChange: 'VALIDATED' },
    evaluateLaneChange(packet({ intent: 'NONE' })),
  );
  assert.equal(cleared!.laneChange, 'NONE');
  assert.equal(laneChangeBehaviorFacts(base, evaluateLaneChange(packet({ profile: null }))), null);
  assert.throws(() => laneChangeBehaviorFacts({ ...base, profileVersionId: 'foreign' }, changing));
  assert.equal(evaluateLaneChange(packet({ profile: null })).action, 'UNKNOWN');
  assert.equal(evaluateLaneChange(packet({ profile: null })).reason, 'MISSING_PROFILE');
  assert.equal(evaluateLaneChange(packet({ adjacency: null })).action, 'UNKNOWN');
  assert.equal(evaluateLaneChange(packet({ adjacency: null })).reason, 'MISSING_LANE_GRAPH');
  assert.equal(evaluateLaneChange(packet({ observation: null })).reason, 'NO_OBSERVATION');
  for (const observation of [
    { ...packet().observation!, tick: 601 },
    { ...packet().observation!, tick: 590 },
  ])
    assert.equal(evaluateLaneChange(packet({ observation })).reason, 'OBSERVATION_UNAVAILABLE');
  const scope = { sessionId: SCOPE.sessionId, worldEpoch: 0 },
    owner = createBehaviorFSM(scope);
  owner.setActors([ACTOR], scope);
  const context = {
      ...scope,
      sourceTick: 599,
      subject: ACTOR,
      laneId: 'lane-a',
      leaderId: null,
      vehiclesComplete: true,
      discontinuity: false,
    },
    decision = owner.decide({
      ...scope,
      actor: ACTOR,
      decisionTick: 600,
      context,
      facts: laneChangeBehaviorFacts(base, changing),
    });
  assert.equal(decision.state, 'CHANGE_LANE');
  assert.equal(decision.reason, 'LANE_CHANGE_VALIDATED');
  owner.dispose();
  let getterCalls = 0;
  const getter = {
    ...packet(),
    get decisionTick() {
      getterCalls++;
      return 600;
    },
  };
  assert.throws(() => evaluateLaneChange(getter as LaneChangeInput));
  assert.equal(getterCalls, 0);
  for (const invalid of [
    { ...packet(), decisionTick: -1 },
    { ...packet(), speedMps: 101 },
    { ...packet(), ownLaneLeaderSpeedMps: 101 },
    { ...packet(), intent: 'OVERTAKE' },
    { ...packet(), profile: profile({ frontGapM: 41 }) },
    {
      ...packet(),
      state: { committed: { targetLaneId: TARGET, startedTick: 601 }, lastChangeTick: null },
    },
    { ...packet(), state: { committed: null, lastChangeTick: 601 } },
    { ...packet(), state: { committed: null, lastChangeTick: null, extra: 1 } },
    {
      ...packet(),
      adjacency: {
        ...ADJACENCY,
        neighbors: [
          { laneId: TARGET, side: 'LEFT' },
          { laneId: TARGET, side: 'RIGHT' },
        ],
      },
    },
    { ...packet(), adjacency: { ...ADJACENCY, access: 'AMBULANCE' } },
    { ...packet(), adjacency: { ...ADJACENCY, mapId: '' } },
    {
      ...packet(),
      adjacency: {
        ...ADJACENCY,
        neighbors: [
          { laneId: 'a', side: 'LEFT' },
          { laneId: 'b', side: 'RIGHT' },
          { laneId: 'c', side: 'LEFT' },
        ],
      },
    },
    {
      ...packet(),
      adjacency: {
        ...ADJACENCY,
        neighbors: [{ laneId: TARGET, side: 'LEFT', kind: 'CONTINUATION' }],
      },
    },
    {
      ...packet(),
      adjacency: { ...ADJACENCY, neighbors: [{ laneId: TARGET }] },
    },
    { ...packet(), observation: { ...packet().observation!, coverage: 'GUESSED' } },
    { ...packet(), observation: { ...packet().observation!, frontGapM: -1 } },
    { ...packet(), observation: { ...packet().observation!, targetLaneSpeedMps: 101 } },
    { ...packet(), observation: { ...packet().observation!, targetLaneId: '' } },
    { ...packet(), extra: true },
  ])
    assert.throws(() => evaluateLaneChange(invalid as LaneChangeInput));
  assert.deepEqual(getLaneChangeStats(), {
    evaluating: false,
    retainedActors: 0,
    retainedManoeuvres: 0,
    retainedHistory: 0,
  });
  const before = JSON.stringify(packet());
  for (let cycle = 0; cycle < 20; cycle++)
    assert.equal(evaluateLaneChange(packet()).retainedHistory, 0);
  assert.equal(JSON.stringify(packet()), before);
});
