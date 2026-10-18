import assert from 'node:assert/strict';
import test from 'node:test';
import { createPriorityRules } from '../../src/world/priority-rules';
import { parseMapPriorityPolicy } from '../../src/world/priority-policy';
import { predictPriorityArrival } from '../../src/world/priority-arrival';
import { createIntersectionConflicts } from '../../src/world/intersection-conflicts';
import { priorityFixture, priorityObservation } from './priority-rules-fixture';
function setup(options = {}) {
  const { map, policy } = priorityFixture();
  return createPriorityRules(map, policy, { sessionId: 'priority-test', worldEpoch: 0 }, options);
}
test('strict exhaustive authored policy roundtrips JSON; reciprocal queries return the same rule', () => {
  const { map, policy } = priorityFixture();
  const parsed = parseMapPriorityPolicy(policy, map).policy;
  assert.deepEqual(parseMapPriorityPolicy(JSON.parse(JSON.stringify(parsed)), map).policy, parsed);
  const rules = createPriorityRules(map, policy, { sessionId: 'priority-test', worldEpoch: 0 });
  assert.equal(
    rules.getRule('junction', 'west-straight', 'south-straight'),
    rules.getRule('junction', 'south-straight', 'west-straight'),
  );
  assert.equal(
    rules.getRule('junction', 'west-straight', 'south-straight')!.priorityMovementId,
    'south-straight',
  );
  assert.ok(Object.isFrozen(parsed) && Object.isFrozen(parsed.rules[0].movementIds));
});
test('T-junction policy uses only its authored geometric straight and turning conflicts', () => {
  const { map, policy } = priorityFixture('T');
  const parsed = parseMapPriorityPolicy(policy, map).policy;
  assert.ok(parsed.rules.some((rule) => rule.movementIds.includes('south-left')));
  assert.ok(parsed.rules.every((rule) => !rule.movementIds.includes('south-straight')));
  assert.deepEqual(parseMapPriorityPolicy(JSON.parse(JSON.stringify(parsed)), map).policy, parsed);
});
test('priority policy rejects omissions, contradictory pairs, wrong map, foreign winners and compatible geometry', () => {
  for (const mutate of [
    (policy: ReturnType<typeof priorityFixture>['policy']) => {
      policy.rules.pop();
    },
    (policy: ReturnType<typeof priorityFixture>['policy']) => {
      policy.rules.push({
        ...policy.rules[0],
        movementIds: [policy.rules[0].movementIds[1], policy.rules[0].movementIds[0]],
      });
    },
    (policy: ReturnType<typeof priorityFixture>['policy']) => {
      policy.mapId = 'foreign';
    },
    (policy: ReturnType<typeof priorityFixture>['policy']) => {
      policy.rules[0].priorityMovementId = 'foreign';
    },
    (policy: ReturnType<typeof priorityFixture>['policy']) => {
      policy.rules[0].movementIds = ['west-straight', 'east-straight'];
    },
  ]) {
    const { map, policy } = priorityFixture();
    mutate(policy);
    assert.throws(() => parseMapPriorityPolicy(policy, map));
  }
});
test('TTC uses metres/metres-per-second; stationary approach, occupying and cleared remain distinct', () => {
  assert.deepEqual(predictPriorityArrival(10, 4, 5), {
    state: 'APPROACHING',
    timeToEntryS: 2,
    timeToExitS: 2.8,
  });
  assert.deepEqual(predictPriorityArrival(10, 4, 0), {
    state: 'STATIONARY',
    timeToEntryS: null,
    timeToExitS: null,
  });
  assert.deepEqual(predictPriorityArrival(-1, 4, 0), {
    state: 'OCCUPYING',
    timeToEntryS: 0,
    timeToExitS: null,
  });
  assert.deepEqual(predictPriorityArrival(-5, 4, 0), {
    state: 'CLEARED',
    timeToEntryS: null,
    timeToExitS: null,
  });
  assert.throws(() => predictPriorityArrival(1, 4, NaN));
  assert.throws(() => predictPriorityArrival(1, 4, -1));
});
test('absent/inactive/stationary-before-entry/cleared traffic never records refusal or yield', () => {
  for (const configure of [
    (o: ReturnType<typeof priorityObservation>) => {
      o.traffic = [];
    },
    (o: ReturnType<typeof priorityObservation>) => {
      o.traffic[0].active = false;
    },
    (o: ReturnType<typeof priorityObservation>) => {
      o.traffic[0].speedMps = 0;
    },
    (o: ReturnType<typeof priorityObservation>) => {
      o.traffic[0].conflictDistances[0].distanceM = -5;
    },
  ]) {
    const rules = setup();
    for (let tick = 1; tick <= 20; tick++) {
      const observation = priorityObservation(tick);
      configure(observation);
      observation.subject.speedMps = 60;
      observation.subject.conflictDistances[0].distanceM = tick === 1 ? 0.5 : -0.5;
      const result = rules.observe(observation);
      assert.equal(result.status, 'NO_EXPOSURE');
      assert.equal(result.hasPriorityExposure, false);
      assert.deepEqual(result.recordedEvidence, []);
    }
  }
});
test('eligible higher-priority traffic exposes blocked gap and one continuous hold records yield', () => {
  const rules = setup();
  let count = 0;
  for (let tick = 1; tick <= 25; tick++) {
    const observation = priorityObservation(tick);
    observation.traffic[0].conflictDistances[0].distanceM = 10 - ((tick - 1) * 5) / 60;
    const result = rules.observe(observation);
    assert.equal(result.hasPriorityExposure, true);
    assert.equal(result.gaps[0].priority, 'YIELD');
    assert.equal(result.gaps[0].gap, 'BLOCKED');
    count += result.recordedEvidence.length;
    if (result.recordedEvidence.length) {
      assert.equal(tick, 16);
      assert.equal(result.recordedEvidence[0].kind, 'YIELD_OBSERVED');
      assert.equal(result.recordedEvidence[0].learningEligible, null);
    }
    assert.deepEqual(rules.observe(observation).recordedEvidence, []);
  }
  assert.equal(count, 1);
});
test('geometric crossing with actual priority exposure is observed; available gap produces no refusal evidence', () => {
  const rules = setup();
  const before = priorityObservation(1);
  before.subject.speedMps = 60;
  before.subject.conflictDistances[0].distanceM = 0.5;
  before.traffic[0].conflictDistances[0].distanceM = 0.5;
  rules.observe(before);
  const after = priorityObservation(2);
  after.subject.speedMps = 60;
  after.subject.conflictDistances[0].distanceM = -0.5;
  after.traffic[0].conflictDistances[0].distanceM = 0.5 - 5 / 60;
  const result = rules.observe(after);
  assert.equal(result.recordedEvidence.length, 1);
  assert.equal(result.recordedEvidence[0].kind, 'CROSSED_WITH_PRIORITY_EXPOSURE');
  const available = setup({ minGapS: 0.1 });
  before.traffic[0].conflictDistances[0].distanceM = 10;
  available.observe(before);
  after.traffic[0].conflictDistances[0].distanceM = 10 - 5 / 60;
  const safe = available.observe(after);
  assert.equal(safe.gaps[0].gap, 'AVAILABLE');
  assert.deepEqual(safe.recordedEvidence, []);
});
test('EQUAL stays unresolved and never invents a universal right-side or yielding obligation', () => {
  const { map, policy } = priorityFixture();
  policy.rules.find(
    (r) => r.movementIds.includes('west-straight') && r.movementIds.includes('south-straight'),
  )!.priorityMovementId = null;
  const rules = createPriorityRules(map, policy, { sessionId: 'priority-test', worldEpoch: 0 });
  for (let tick = 1; tick <= 20; tick++) {
    const result = rules.observe(priorityObservation(tick));
    assert.equal(result.gaps[0].priority, 'EQUAL');
    assert.equal(result.hasPriorityExposure, false);
    assert.deepEqual(result.recordedEvidence, []);
  }
});
test('unknown traffic coverage/distance/route and discontinuity fail closed rather than reporting a safe gap', () => {
  for (const configure of [
    (o: ReturnType<typeof priorityObservation>) => {
      o.trafficComplete = false;
    },
    (o: ReturnType<typeof priorityObservation>) => {
      o.traffic[0].conflictDistances = [];
    },
    (o: ReturnType<typeof priorityObservation>) => {
      o.traffic[0].movementId = null;
      o.traffic[0].intersectionId = null;
      o.traffic[0].conflictDistances = [];
    },
    (o: ReturnType<typeof priorityObservation>) => {
      o.discontinuity = true;
    },
  ]) {
    const rules = setup();
    const first = priorityObservation(1);
    rules.observe(first);
    const second = priorityObservation(2);
    configure(second);
    second.subject.conflictDistances[0].distanceM = -0.5;
    const result = rules.observe(second);
    assert.equal(result.status, 'UNKNOWN');
    assert.equal(result.hasPriorityExposure, false);
    assert.deepEqual(result.recordedEvidence, []);
    assert.ok(result.gaps.every((g) => g.gap === 'UNKNOWN' && !g.eligible));
  }
  const gap = setup();
  gap.observe(priorityObservation(1));
  const late = priorityObservation(3);
  late.subject.conflictDistances[0].distanceM = -0.5;
  const result = gap.observe(late);
  assert.equal(result.status, 'UNKNOWN');
  assert.deepEqual(result.recordedEvidence, []);
});
test('multiple opponents for one relation never duplicate the physical yield observation', () => {
  const rules = setup();
  let count = 0;
  for (let tick = 1; tick <= 20; tick++) {
    const observation = priorityObservation(tick);
    observation.traffic.push({
      ...structuredClone(observation.traffic[0]),
      vehicleId: 'other-2',
      incarnation: 'other-2-1',
    });
    const result = rules.observe(observation);
    assert.equal(result.gaps.length, 2);
    count += result.recordedEvidence.length;
  }
  assert.equal(count, 1);
});
test('cumulative movement invalidates hold even when each small step is below tolerance', () => {
  const rules = setup();
  for (let tick = 1; tick <= 25; tick++) {
    const observation = priorityObservation(tick);
    observation.subject.conflictDistances[0].distanceM = 1 - 0.005 * tick;
    assert.deepEqual(rules.observe(observation).recordedEvidence, []);
  }
});
test('new incarnation/epoch never inherits evidence; bounded history and tombstones fail closed', () => {
  const rules = setup({ maxVehicles: 1, maxIncarnations: 2 });
  for (let tick = 1; tick <= 15; tick++) rules.observe(priorityObservation(tick));
  const replacement = priorityObservation(16);
  replacement.subject.incarnation = 'subject-2';
  assert.deepEqual(rules.observe(replacement).recordedEvidence, []);
  const other = priorityObservation(17);
  other.subject.vehicleId = 'another';
  assert.throws(() => rules.observe(other), /capacity/);
  rules.forgetVehicle('subject');
  assert.throws(() => rules.observe(replacement), /Retired/);
  rules.advanceWorldEpoch(1);
  const fresh = priorityObservation(1);
  fresh.worldEpoch = 1;
  assert.deepEqual(rules.observe(fresh).recordedEvidence, []);
  assert.equal(rules.getStats().vehicles, 1);
  assert.throws(() => rules.observe(priorityObservation(2)), /Stale/);
  rules.dispose();
  rules.dispose();
  assert.equal(rules.getStats().vehicles, 0);
  assert.equal(rules.getStats().incarnations, 0);
  assert.throws(() => rules.observe(fresh), /disposed/);
});
test('malformed, duplicated, oversized and conflicting observations reject before history mutation', () => {
  const rules = setup(),
    first = priorityObservation(1);
  rules.observe(first);
  const stats = rules.getStats();
  for (const configure of [
    (o: ReturnType<typeof priorityObservation>) => {
      o.subject.speedMps = NaN;
    },
    (o: ReturnType<typeof priorityObservation>) => {
      o.subject.conflictDistances.push({ ...o.subject.conflictDistances[0] });
    },
    (o: ReturnType<typeof priorityObservation>) => {
      o.traffic.push({ ...o.subject });
    },
    (o: ReturnType<typeof priorityObservation>) => {
      o.subject.speedMps = 1;
    },
  ]) {
    const observation = priorityObservation(1);
    configure(observation);
    assert.throws(() => rules.observe(observation));
    assert.deepEqual(rules.getStats(), stats);
  }
  const small = setup({ maxObservationCodeUnits: 10 });
  assert.throws(() => small.observe(priorityObservation(1)), /code-unit capacity/);
  assert.equal(small.getStats().vehicles, 0);
  let invoked = false;
  const malicious = priorityObservation(2);
  Object.defineProperty(malicious.subject, 'speedMps', {
    get() {
      invoked = true;
      return 0;
    },
    enumerable: true,
  });
  assert.throws(() => rules.observe(malicious));
  assert.equal(invoked, false);
});

test('active unobservable traffic masks known blocked pairs independently of actor ordering', () => {
  for (const id of ['a-unknown', 'z-unknown']) {
    const rules = setup();
    for (let tick = 1; tick <= 20; tick++) {
      const observation = priorityObservation(tick);
      observation.traffic[0].vehicleId = 'known';
      observation.traffic.push({
        ...structuredClone(observation.traffic[0]),
        vehicleId: id,
        incarnation: id,
        observable: false,
      });
      const result = rules.observe(observation);
      assert.equal(result.status, 'UNKNOWN');
      assert.equal(result.gaps.length, 1);
      assert.equal(result.gaps[0].gap, 'UNKNOWN');
      assert.deepEqual(result.recordedEvidence, []);
    }
  }
});

test('stationary at the conflict entry is occupying and cannot record a pre-entry yield', () => {
  const rules = setup();
  for (let tick = 1; tick <= 20; tick++) {
    const observation = priorityObservation(tick);
    observation.subject.conflictDistances[0].distanceM = 0;
    const result = rules.observe(observation);
    assert.equal(result.gaps[0].subjectArrival!.state, 'OCCUPYING');
    assert.deepEqual(result.recordedEvidence, []);
  }
});

test('a continuous sweep through full clearance retains actual occupied-priority crossing evidence', () => {
  const rules = setup(),
    before = priorityObservation(1),
    after = priorityObservation(2);
  for (const observation of [before, after]) {
    observation.subject.speedMps = 12;
    observation.subject.conflictDistances[0].clearanceM = 0.1;
    observation.traffic[0].speedMps = 0;
    observation.traffic[0].conflictDistances[0].distanceM = -1;
  }
  before.subject.conflictDistances[0].distanceM = 0.05;
  after.subject.conflictDistances[0].distanceM = -0.15;
  rules.observe(before);
  const result = rules.observe(after);
  assert.equal(result.gaps[0].subjectArrival!.state, 'CLEARED');
  assert.equal(result.recordedEvidence.length, 1);
  assert.equal(result.recordedEvidence[0].kind, 'CROSSED_WITH_PRIORITY_EXPOSURE');
  const teleport = setup();
  before.subject.speedMps = 0;
  after.subject.speedMps = 0;
  teleport.observe(before);
  const unknown = teleport.observe(after);
  assert.equal(unknown.status, 'UNKNOWN');
  assert.deepEqual(unknown.recordedEvidence, []);
  const changedRoute = setup();
  before.subject.speedMps = 12;
  after.subject.speedMps = 12;
  changedRoute.observe(before);
  after.subject.movementId = 'south-straight';
  after.traffic = [];
  const changed = changedRoute.observe(after);
  assert.equal(changed.status, 'UNKNOWN');
  assert.deepEqual(changed.recordedEvidence, []);
});

test('simultaneous conflict pairs share one physical yield and changed exposure cannot inherit elapsed hold', () => {
  const { map } = priorityFixture(),
    conflicts = createIntersectionConflicts(map);
  const secondId = conflicts.getRelation('junction', 'west-straight', 'south-left')!.id;
  function observation(tick: number) {
    const value = priorityObservation(tick);
    value.subject.conflictDistances.push({ relationId: secondId, distanceM: 1, clearanceM: 4 });
    value.traffic.push({
      ...structuredClone(value.traffic[0]),
      vehicleId: 'other-left',
      incarnation: 'other-left-1',
      movementId: 'south-left',
      conflictDistances: [{ relationId: secondId, distanceM: 10, clearanceM: 4 }],
    });
    return value;
  }
  const simultaneous = setup();
  let count = 0;
  for (let tick = 1; tick <= 20; tick++) {
    const result = simultaneous.observe(observation(tick));
    count += result.recordedEvidence.length;
    if (result.recordedEvidence.length)
      assert.equal(result.recordedEvidence[0].relationIds.length, 2);
  }
  assert.equal(count, 1);
  const changed = setup();
  for (let tick = 1; tick <= 15; tick++) {
    const value = observation(tick);
    value.traffic = value.traffic.slice(0, 1);
    assert.deepEqual(changed.observe(value).recordedEvidence, []);
  }
  for (let tick = 16; tick <= 30; tick++) {
    const value = observation(tick);
    value.traffic = value.traffic.slice(1);
    assert.deepEqual(changed.observe(value).recordedEvidence, []);
  }
  const last = observation(31);
  last.traffic = last.traffic.slice(1);
  assert.equal(changed.observe(last).recordedEvidence.length, 1);
});
