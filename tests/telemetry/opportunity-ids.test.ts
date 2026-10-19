import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createOpportunityRegistry,
  opportunitySignalContext,
  opportunitySuccessOutcomes,
  OPPORTUNITY_CAPACITY,
  OPPORTUNITY_RECORDER_RAM_BYTES,
  OPPORTUNITY_RECORD_BYTES_CEILING,
  type OpportunityObservation,
  type OpportunityRecord,
} from '../../src/telemetry/index.ts';
import { createStopRules, createSignalController } from '../../src/world/index.ts';
import type { RoadMap, StopObservation } from '../../src/world/index.ts';
import { createEventBus, parseSimulationEvent } from '../../src/simulation/index.ts';
import type { SimulationEvent } from '../../src/simulation/index.ts';
import { minimalMap } from '../world/fixture.ts';
import type { Mutable } from '../world/negative-fixtures.ts';

const SESSION = 'academy-1';
const EPOCH = 2;
const VEHICLE = 'taxi';
const INCARNATION = 'taxi-1';
const SEGMENT = 'seg-1';

/** The two fields that legitimately reflect the consumer cadence; identity never does. */
function cadenceProjection(record: OpportunityRecord) {
  return {
    id: record.id,
    kind: record.kind,
    state: record.state,
    outcome: record.outcome,
    result: record.result,
    truncationReason: record.truncationReason,
    vehicleId: record.vehicleId,
    incarnation: record.incarnation,
    segmentIds: record.segmentIds,
    learningEligible: record.learningEligible,
    occurrence: record.occurrence,
    openedTick: record.openedTick,
    resolvedTick: record.resolvedTick,
    stimulus: record.stimulus,
  };
}

function observation(overrides: Partial<OpportunityObservation> = {}): OpportunityObservation {
  return {
    tick: 1,
    sessionId: SESSION,
    worldEpoch: EPOCH,
    segmentId: SEGMENT,
    learningEligible: false,
    vehicleId: VEHICLE,
    incarnation: INCARNATION,
    signal: null,
    events: [],
    stimuli: [],
    conclusions: [],
    ...overrides,
  };
}

function someEvent(
  type:
    | 'STOP_APPROACH'
    | 'FULL_STOP'
    | 'STOP_LINE_CROSSED'
    | 'LANE_CHANGE_STARTED'
    | 'LANE_CHANGE_COMPLETED',
  tick: number,
  opportunityId: string,
  options: { readonly vehicleId?: string; readonly stopLineId?: string } = {},
): SimulationEvent {
  const vehicleId = options.vehicleId ?? VEHICLE;
  return parseSimulationEvent({
    schemaVersion: 1,
    units: 'SI',
    sessionId: SESSION,
    worldEpoch: EPOCH,
    tick,
    entityIds: [vehicleId],
    eventId: `event-${type}-${tick}-${opportunityId}`,
    type,
    payload:
      type === 'FULL_STOP'
        ? { vehicleId, opportunityId, durationS: 1 }
        : type === 'LANE_CHANGE_STARTED' || type === 'LANE_CHANGE_COMPLETED'
          ? { vehicleId, opportunityId, fromLaneId: 'lane-a', toLaneId: 'lane-b' }
          : { vehicleId, opportunityId, stopLineId: options.stopLineId ?? 'stop-line-1' },
  });
}

/** Map with the real 036 signal and a real STOP line on the same lane. */
function stopSignalMap(): Mutable<RoadMap> {
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
  return map;
}

const WORLD = { sessionId: SESSION, worldEpoch: EPOCH };
const BUS_WORLD = Object.freeze({ schemaVersion: 1 as const, units: 'SI' as const, ...WORLD });

/** Real 036 + 037 chain: the world always steps every fixed tick; only the consumer cadence varies. */
function driveRealChain(consumer: 'EVERY_TICK' | 'DECISION_CADENCE', ticks: number) {
  const map = stopSignalMap();
  const bus = createEventBus(BUS_WORLD);
  const signals = createSignalController(map, { context: BUS_WORLD, eventBus: bus });
  const rules = createStopRules(map, WORLD);
  const registry = createOpportunityRegistry();
  const queue: SimulationEvent[] = [];
  const opened: OpportunityRecord[] = [];
  let stopSourceKey: string | null = null;
  for (let tick = 1; tick <= ticks; tick += 1) {
    signals.step(tick);
    const x = tick <= 65 ? 7.5 : 8.6;
    const speedMps = tick <= 65 ? 0 : 5;
    const stopObservation: StopObservation = {
      ...WORLD,
      tick,
      vehicleId: VEHICLE,
      incarnation: INCARNATION,
      laneId: 'lane-a',
      access: 'TAXI',
      frontPositionM: { x, y: 0, z: 0 },
      headingRad: 0,
      speedMps,
      discontinuity: false,
    };
    for (const event of rules.observe(stopObservation)) {
      queue.push(event);
      if (event.type === 'STOP_APPROACH') stopSourceKey = event.payload.opportunityId;
    }
    if (consumer === 'EVERY_TICK' || tick % 6 === 0) {
      const movement = signals.getMovementSignal('junction', 'move');
      const snapshot = signals.getSignal('signal');
      for (const record of registry.observe(
        observation({
          tick,
          signal:
            movement && snapshot
              ? opportunitySignalContext(movement, snapshot.phaseStartedTick)
              : null,
          events: queue.splice(0, queue.length),
        }),
      ))
        opened.push(record);
    }
  }
  const all = registry.getOpportunities();
  rules.dispose();
  signals.dispose();
  bus.dispose();
  return { registry, all, touched: opened, stopSourceKey: stopSourceKey as string | null };
}

test('086 the same real chain observed every tick and at the 10 Hz cadence yields one ID per opportunity', () => {
  const every = driveRealChain('EVERY_TICK', 600);
  const decision = driveRealChain('DECISION_CADENCE', 600);
  // Seven real 036 phase occurrences across 600 ticks plus one real 037 STOP approach.
  assert.equal(every.all.length, 8);
  assert.equal(every.all.filter((record) => record.kind === 'STOP').length, 1);
  assert.equal(
    every.all.filter((record) => record.kind === 'RED' || record.kind === 'GREEN').length,
    7,
  );
  assert.deepEqual(
    every.all.map((record) => record.id),
    decision.all.map((record) => record.id),
  );
  assert.deepEqual(every.all.map(cadenceProjection), decision.all.map(cadenceProjection));
  // No ID is ever repeated: each physical occurrence is counted exactly once.
  assert.equal(new Set(every.all.map((record) => record.id)).size, every.all.length);
  // The 10 Hz consumer only touched the same records fewer times (a cadence counter, not identity).
  assert.ok(every.touched.length > decision.touched.length);
  const stop = every.all.find((record) => record.kind === 'STOP');
  assert.ok(stop);
  assert.equal(stop.state, 'RESOLVED');
  assert.equal(stop.outcome, 'STOPPED');
  assert.equal(stop.resolvedTick, 61);
  assert.equal(stop.id.startsWith('id-v1:'), true);
  assert.notEqual(stop.id, every.stopSourceKey);
});

test('086 two real approaches to the same STOP line produce two distinct opportunities and two denominators', () => {
  const map = stopSignalMap();
  const bus = createEventBus(BUS_WORLD);
  const signals = createSignalController(map, { context: BUS_WORLD, eventBus: bus });
  const rules = createStopRules(map, WORLD);
  const registry = createOpportunityRegistry();
  // Progressively: dwell and stop, leave the zone, return, then roll through without stopping.
  const positions: { x: number; speedMps: number }[] = [];
  for (let tick = 1; tick <= 70; tick += 1) positions.push({ x: 7.5, speedMps: 0 });
  for (let tick = 71; tick <= 90; tick += 1) positions.push({ x: 30, speedMps: 8 });
  for (let tick = 91; tick <= 100; tick += 1) positions.push({ x: 7.5, speedMps: 0 });
  for (let tick = 101; tick <= 102; tick += 1) positions.push({ x: 8.6, speedMps: 6 });
  const sourceKeys: string[] = [];
  for (let tick = 1; tick <= positions.length; tick += 1) {
    signals.step(tick);
    const events = rules.observe({
      ...WORLD,
      tick,
      vehicleId: VEHICLE,
      incarnation: INCARNATION,
      laneId: 'lane-a',
      access: 'TAXI',
      frontPositionM: { x: positions[tick - 1].x, y: 0, z: 0 },
      headingRad: 0,
      speedMps: positions[tick - 1].speedMps,
      discontinuity: false,
    });
    for (const event of events)
      if (event.type === 'STOP_APPROACH') sourceKeys.push(event.payload.opportunityId);
    registry.observe(observation({ tick, events: [...events] }));
  }
  assert.equal(sourceKeys.length, 2, 'the real 037 producer emitted two distinct approaches');
  assert.notEqual(sourceKeys[0], sourceKeys[1]);
  const opportunities = registry.getOpportunities().filter((record) => record.kind === 'STOP');
  assert.equal(opportunities.length, 2);
  assert.notEqual(opportunities[0].id, opportunities[1].id);
  assert.deepEqual(
    opportunities.map((record) => record.outcome),
    ['STOPPED', 'CROSSED_WITHOUT_STOP'],
  );
  const denominators = registry.getDenominators();
  const stop = denominators.byKind.find((entry) => entry.kind === 'STOP');
  assert.ok(stop);
  assert.equal(stop.total, 2);
  assert.equal(stop.certain, 2);
  assert.equal(stop.success, 1);
  assert.equal(stop.failure, 1);
  assert.equal(stop.incomplete, 0);
  assert.equal(stop.entered, 0);
  assert.equal(denominators.total, 2);
  assert.equal(denominators.certain, denominators.success + denominators.failure);
  assert.equal(
    denominators.total,
    denominators.certain + denominators.incomplete + denominators.entered,
  );
  rules.dispose();
  signals.dispose();
  bus.dispose();
});

test('086 a segment closed mid-approach marks the opportunity incomplete and excludes it from the certain denominator', () => {
  const registry = createOpportunityRegistry();
  registry.observe(
    observation({ tick: 10, events: [someEvent('STOP_APPROACH', 10, 'approach-1')] }),
  );
  assert.equal(registry.findEntered('STOP', VEHICLE, INCARNATION)?.state, 'ENTERED');
  const closed = registry.closeSegment({ tick: 40, segmentId: SEGMENT, reason: 'MODE_CHANGE' });
  assert.equal(closed.length, 1);
  const record = closed[0];
  assert.equal(record.state, 'TRUNCATED');
  assert.equal(record.truncationReason, 'SEGMENT_CLOSED');
  assert.equal(record.outcome, null);
  assert.equal(record.result, null);
  const denominators = registry.getDenominators();
  assert.equal(denominators.total, 1);
  assert.equal(denominators.certain, 0);
  assert.equal(denominators.incomplete, 1);
  assert.equal(denominators.entered, 0);
  assert.equal(
    denominators.truncatedByReason.find((entry) => entry.reason === 'SEGMENT_CLOSED')?.count,
    1,
  );
  // A later observation cannot resurrect the truncated opportunity or count it as certain.
  registry.observe(
    observation({ tick: 41, events: [someEvent('STOP_APPROACH', 41, 'approach-2')] }),
  );
  assert.equal(registry.getDenominators().total, 2);
  assert.equal(registry.getDenominators().certain, 0);
});

test('086 a signal change never produces both a success and a failure for one opportunity', () => {
  const registry = createOpportunityRegistry();
  const green = {
    signalId: 'signal',
    intersectionId: 'junction',
    phaseId: 'green',
    movementId: 'move',
    state: 'GREEN' as const,
    phaseStartedTick: 0,
  };
  registry.observe(observation({ tick: 1, signal: green }));
  const opened = registry.getOpportunities();
  assert.equal(opened.length, 1);
  assert.equal(opened[0].kind, 'GREEN');
  assert.equal(opened[0].openedTick, 0);
  // The 050 owner concludes the release before the phase changes.
  registry.conclude({ tick: 60, opportunityId: opened[0].id, outcome: 'RELEASED' });
  assert.equal(registry.getOpportunity(opened[0].id)?.result, 'SUCCESS');
  // The phase occurrence changes: the resolved GREEN is terminal, the RED is a new occurrence.
  registry.observe(
    observation({
      tick: 120,
      signal: { ...green, phaseId: 'red', state: 'RED', phaseStartedTick: 120 },
    }),
  );
  const greenAfter = registry.getOpportunity(opened[0].id);
  assert.ok(greenAfter);
  assert.equal(greenAfter.state, 'RESOLVED');
  assert.equal(greenAfter.outcome, 'RELEASED');
  assert.equal(greenAfter.truncationReason, null);
  assert.equal(registry.getOpportunities().length, 2);
  const red = registry.getOpportunities().find((record) => record.kind === 'RED');
  assert.ok(red);
  assert.equal(red.state, 'ENTERED');
  assert.equal(red.outcome, null);
  // Two opposing conclusions cannot both land on one opportunity.
  registry.conclude({ tick: 121, opportunityId: opened[0].id, outcome: 'MISSED' });
  const after = registry.getOpportunity(opened[0].id);
  assert.ok(after);
  assert.equal(after.outcome, 'RELEASED');
  assert.equal(after.result, 'SUCCESS');
  assert.equal(registry.getStats().contradictionTotal, 1);
});

test('086 an unresolved signal opportunity is truncated as superseded, not resolved as success or failure', () => {
  const registry = createOpportunityRegistry();
  registry.observe(
    observation({
      tick: 1,
      signal: {
        signalId: 'signal',
        intersectionId: 'junction',
        phaseId: 'green',
        movementId: 'move',
        state: 'GREEN',
        phaseStartedTick: 0,
      },
    }),
  );
  const greenId = registry.getOpportunities()[0].id;
  registry.observe(
    observation({
      tick: 120,
      signal: {
        signalId: 'signal',
        intersectionId: 'junction',
        phaseId: 'red',
        movementId: 'move',
        state: 'RED',
        phaseStartedTick: 120,
      },
    }),
  );
  const green = registry.getOpportunity(greenId);
  assert.ok(green);
  assert.equal(green.state, 'TRUNCATED');
  assert.equal(green.truncationReason, 'SUPERSEDED');
  assert.equal(green.outcome, null);
  assert.equal(green.result, null);
  // YELLOW is not an opportunity kind: it closes the previous occurrence without opening one.
  registry.observe(
    observation({
      tick: 180,
      signal: {
        signalId: 'signal',
        intersectionId: 'junction',
        phaseId: 'yellow',
        movementId: 'move',
        state: 'YELLOW',
        phaseStartedTick: 180,
      },
    }),
  );
  assert.equal(registry.getOpportunities().length, 2);
  assert.equal(registry.getStats().truncatedTotal, 2);
  const denominators = registry.getDenominators();
  assert.equal(denominators.total, 2);
  assert.equal(denominators.certain, 0);
  assert.equal(denominators.incomplete, 2);
});

test('086 a suspension truncates the entered opportunity and fabricates no resolution or tick', () => {
  const registry = createOpportunityRegistry();
  registry.observe(
    observation({ tick: 10, events: [someEvent('STOP_APPROACH', 10, 'approach-1')] }),
  );
  const suspended = registry.suspend({ tick: 20 });
  assert.equal(suspended.length, 1);
  assert.equal(suspended[0].state, 'TRUNCATED');
  assert.equal(suspended[0].truncationReason, 'SUSPENDED');
  assert.equal(suspended[0].outcome, null);
  // 070/008: the clock is re-anchored, so the fixed-tick sequence stays contiguous.
  registry.resume({ tick: 20 });
  const reopened = registry.observe(
    observation({ tick: 21, events: [someEvent('STOP_APPROACH', 21, 'approach-2')] }),
  );
  assert.equal(reopened.length, 1);
  assert.notEqual(reopened[0].id, suspended[0].id);
  assert.equal(reopened[0].state, 'ENTERED');
  const stats = registry.getStats();
  assert.equal(stats.suspensions, 1);
  assert.equal(stats.resumptions, 1);
  assert.equal(stats.skippedTicks, 0, 'no tick is fabricated across a suspension');
  const denominators = registry.getDenominators();
  assert.equal(denominators.total, 2);
  assert.equal(denominators.certain, 0);
  assert.equal(denominators.incomplete, 1);
  assert.equal(denominators.entered, 1);
});

test('086 identical inputs produce deep-equal opportunities and other sessions or epochs produce other IDs', () => {
  const run = (sessionId: string, worldEpoch: number) => {
    const registry = createOpportunityRegistry();
    const events = [
      someEvent('STOP_APPROACH', 5, 'approach-1'),
      someEvent('FULL_STOP', 20, 'approach-1'),
      someEvent('LANE_CHANGE_STARTED', 25, 'change-1'),
      someEvent('LANE_CHANGE_COMPLETED', 40, 'change-1'),
    ];
    registry.observe(observation({ tick: 5, sessionId, worldEpoch, events: events.slice(0, 1) }));
    registry.observe(observation({ tick: 20, sessionId, worldEpoch, events: events.slice(1, 2) }));
    registry.observe(observation({ tick: 25, sessionId, worldEpoch, events: events.slice(2, 3) }));
    registry.observe(observation({ tick: 40, sessionId, worldEpoch, events: events.slice(3) }));
    registry.observe(
      observation({
        tick: 45,
        sessionId,
        worldEpoch,
        stimuli: [
          {
            kind: 'YIELD',
            tick: 45,
            sourceKey: 'yield-1',
            relatedIds: ['junction', 'west-straight'],
          },
        ],
      }),
    );
    registry.conclude({
      tick: 46,
      opportunityId: registry.getOpportunities()[2].id,
      outcome: 'YIELDED',
    });
    return registry.getOpportunities().map(cadenceProjection);
  };
  assert.deepEqual(run(SESSION, EPOCH), run(SESSION, EPOCH));
  const other = run(SESSION, EPOCH + 1);
  const base = run(SESSION, EPOCH);
  assert.notDeepEqual(
    other.map((record) => record.id),
    base.map((record) => record.id),
  );
  const otherSession = run('academy-2', EPOCH);
  assert.notDeepEqual(
    otherSession.map((record) => record.id),
    base.map((record) => record.id),
  );
  assert.equal(base.length, 3);
  assert.deepEqual(
    base.map((record) => record.kind),
    ['STOP', 'LANE_CHANGE', 'YIELD'],
  );
  assert.deepEqual(
    base.map((record) => record.outcome),
    ['STOPPED', 'COMPLETED', 'YIELDED'],
  );
});

test('086 the bounded store enforces its cap, evicts terminal records and zeroes live counters on dispose', () => {
  const registry = createOpportunityRegistry({ maxOpportunities: OPPORTUNITY_CAPACITY.minimum });
  const cap = OPPORTUNITY_CAPACITY.minimum;
  for (let index = 0; index < cap + 8; index += 1) {
    const key = `approach-${index}`;
    registry.observe(
      observation({
        tick: index * 2 + 1,
        events: [
          someEvent('STOP_APPROACH', index * 2 + 1, key),
          someEvent('FULL_STOP', index * 2 + 2, key),
        ],
      }),
    );
  }
  let stats = registry.getStats();
  assert.equal(stats.retained, cap);
  assert.equal(stats.openedTotal, cap + 8);
  assert.equal(stats.resolvedTotal, cap + 8);
  assert.equal(stats.retiredTotal, 8);
  assert.equal(stats.rejectedTotal, 0);
  assert.ok(stats.estimatedBytes <= stats.estimatedBytesMaximum);
  assert.equal(stats.estimatedBytesMaximum, cap * OPPORTUNITY_RECORD_BYTES_CEILING);
  // With every retained record still entered, admission refuses explicitly instead of growing.
  const full = createOpportunityRegistry({ maxOpportunities: cap });
  for (let index = 0; index < cap; index += 1) {
    const vehicleId = `v-${index}`;
    full.observe(
      observation({
        tick: index + 1,
        events: [someEvent('STOP_APPROACH', index + 1, `open-${index}`, { vehicleId })],
      }),
    );
  }
  assert.equal(full.getStats().entered, cap);
  const refused = full.observe(
    observation({
      tick: cap + 1,
      events: [someEvent('STOP_APPROACH', cap + 1, 'open-refused', { vehicleId: 'v-refused' })],
    }),
  );
  assert.deepEqual(refused, []);
  assert.equal(full.getStats().rejectedTotal, 1);
  assert.equal(full.getStats().retained, cap);
  // Denominators are cumulative aggregates and are not erased by eviction.
  assert.equal(registry.getDenominators().success, cap + 8);
  registry.dispose();
  stats = registry.getStats();
  assert.equal(stats.disposed, true);
  assert.equal(stats.retained, 0);
  assert.equal(stats.entered, 0);
  assert.equal(stats.resolved, 0);
  assert.equal(stats.truncated, 0);
  assert.equal(stats.identityCodeUnits, 0);
  assert.equal(stats.estimatedBytes, 0);
  assert.throws(() => registry.observe(observation({ tick: 1 })), /disposed/);
  // Cumulative evidence survives disposal.
  assert.equal(registry.getDenominators().success, cap + 8);
});

test('086 only a learning-eligible segment can produce a certain learning denominator', () => {
  for (const learningEligible of [false, true]) {
    const registry = createOpportunityRegistry();
    registry.observe(
      observation({
        tick: 1,
        learningEligible,
        events: [
          someEvent('STOP_APPROACH', 1, 'approach-1'),
          someEvent('FULL_STOP', 30, 'approach-1'),
        ],
      }),
    );
    const denominators = registry.getDenominators();
    assert.equal(denominators.certain, 1);
    assert.equal(denominators.learningEligibleCertain, learningEligible ? 1 : 0);
    assert.equal(denominators.success, 1);
    assert.equal(denominators.failure, 0);
  }
});

test('086 rejects malformed observations, unknown ids, out-of-range options and foreign worlds', () => {
  const registry = createOpportunityRegistry();
  assert.throws(() => createOpportunityRegistry({ maxOpportunities: 1 }), /capacity out of range/);
  assert.throws(
    () => createOpportunityRegistry({ maxOpportunities: OPPORTUNITY_CAPACITY.maximum + 1 }),
    /capacity out of range/,
  );
  // The declared capacities are a real bound: the default store fits the manifest recorder budget.
  assert.equal(
    OPPORTUNITY_CAPACITY.default * OPPORTUNITY_RECORD_BYTES_CEILING <=
      OPPORTUNITY_RECORDER_RAM_BYTES,
    true,
  );
  assert.equal(
    OPPORTUNITY_CAPACITY.maximum * OPPORTUNITY_RECORD_BYTES_CEILING <=
      OPPORTUNITY_RECORDER_RAM_BYTES,
    true,
  );
  assert.throws(
    () => createOpportunityRegistry({ unknown: 1 } as never),
    /Unknown opportunity registry option/,
  );
  assert.throws(
    () => registry.conclude({ tick: 1, opportunityId: 'missing', outcome: 'STOPPED' }),
    /unknown id/,
  );
  assert.throws(
    () => registry.truncate({ tick: 1, opportunityId: 'missing', reason: 'SUPERSEDED' }),
    /unknown id/,
  );
  assert.throws(
    () => registry.observe({ ...observation(), unexpected: true } as never),
    /Missing or unknown contract fields/,
  );
  registry.observe(observation({ tick: 1, events: [someEvent('STOP_APPROACH', 1, 'approach-1')] }));
  registry.observe(observation({ tick: 2 }));
  assert.throws(() => registry.observe(observation({ tick: 1 })), /regressed/);
  assert.throws(
    () => registry.observe(observation({ tick: 3, worldEpoch: EPOCH + 1 })),
    /another session or world epoch/,
  );
  assert.throws(
    () => registry.observe(observation({ tick: 3, sessionId: 'other' })),
    /another session or world epoch/,
  );
  assert.throws(
    () =>
      registry.truncate({
        tick: 3,
        opportunityId: registry.getOpportunities()[0].id,
        reason: 'NOPE' as never,
      }),
    /Unsupported enum value/,
  );
  // A truncated opportunity cannot be resolved afterwards; the cause stays the first one.
  const id = registry.getOpportunities()[0].id;
  registry.truncate({ tick: 3, opportunityId: id, reason: 'OBSERVATION_LOST' });
  registry.conclude({ tick: 4, opportunityId: id, outcome: 'STOPPED' });
  const record = registry.getOpportunity(id);
  assert.ok(record);
  assert.equal(record.state, 'TRUNCATED');
  assert.equal(record.truncationReason, 'OBSERVATION_LOST');
  assert.equal(record.outcome, null);
});

test('086 every kind declares one certain success outcome and the remaining half is certain failure', () => {
  assert.deepEqual([...opportunitySuccessOutcomes].sort(), [
    'COMPLETED',
    'HELD',
    'RELEASED',
    'STOPPED',
    'YIELDED',
  ]);
  const registry = createOpportunityRegistry();
  const kinds = ['STOP', 'RED', 'GREEN', 'YIELD', 'LANE_CHANGE'] as const;
  const failures = ['CROSSED_WITHOUT_STOP', 'CROSSED', 'MISSED', 'PROCEEDED', 'ABORTED'] as const;
  const successes = ['STOPPED', 'HELD', 'RELEASED', 'YIELDED', 'COMPLETED'] as const;
  kinds.forEach((kind, index) => {
    registry.observe(
      observation({
        tick: index + 1,
        // One vehicle per kind: a RED and a GREEN occurrence on the same movement supersede each other.
        vehicleId: `vehicle-${index}`,
        incarnation: `incarnation-${index}`,
        stimuli:
          kind === 'YIELD' || kind === 'LANE_CHANGE'
            ? [{ kind, tick: index + 1, sourceKey: `${kind.toLowerCase()}-1`, relatedIds: [] }]
            : [],
        signal:
          kind === 'RED' || kind === 'GREEN'
            ? {
                signalId: 'signal',
                intersectionId: 'junction',
                phaseId: kind === 'RED' ? 'red' : 'green',
                movementId: 'move',
                state: kind,
                phaseStartedTick: index + 1,
              }
            : null,
        events: kind === 'STOP' ? [someEvent('STOP_APPROACH', index + 1, 'stop-1')] : [],
      }),
    );
  });
  const opened = registry.getOpportunities();
  assert.equal(opened.length, 5);
  opened.forEach((record, index) => {
    registry.conclude({ tick: 100 + index, opportunityId: record.id, outcome: failures[index] });
  });
  const denominators = registry.getDenominators();
  assert.equal(denominators.total, 5);
  assert.equal(denominators.certain, 5);
  assert.equal(denominators.success, 0);
  assert.equal(denominators.failure, 5);
  assert.equal(denominators.incomplete, 0);
  for (const entry of denominators.byKind) {
    assert.equal(entry.total, 1);
    assert.equal(entry.failure, 1);
    assert.equal(entry.success, 0);
  }
  assert.equal(successes.length, kinds.length);
});
