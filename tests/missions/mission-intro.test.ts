import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  TUTORIAL_ID,
  TUTORIAL_LIMITS,
  TUTORIAL_NAMESPACE,
  TUTORIAL_VERSION,
  createTutorial,
  tutorialStepIds,
} from '../../src/missions';
import type { Tutorial } from '../../src/missions';
import {
  TUTORIAL_CIVIL,
  TUTORIAL_CONTEXT,
  TUTORIAL_RIDE,
  TUTORIAL_TAXI,
  TUTORIAL_OTHER_TAXI,
  control,
  createTutorialFixture,
  playFullTutorial,
  selection,
} from './tutorial-fixture';
import {
  MISSION_SESSION_ID,
  MISSION_WORLD_EPOCH,
  dropoff,
  pickup,
  profileActivate,
} from './mission-fixture';
import { runMissionIntroReport } from './mission-intro-report';

const SOURCE_TUTORIAL = join(process.cwd(), 'src', 'missions', 'tutorial.ts');
const SOURCE_PANEL = join(process.cwd(), 'src', 'ui', 'mission-tutorial.ts');
const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '117-mission-intro', 'report.json');

function throwsWith(action: () => unknown, pattern: RegExp): boolean {
  try {
    action();
    return false;
  } catch (error) {
    return error instanceof Error && pattern.test(error.message);
  }
}

function event(
  type: 'PICKUP' | 'DROPOFF',
  eventId: string,
  tick: number,
  vehicleId: string,
  rideId: string,
) {
  return type === 'PICKUP'
    ? pickup(eventId, tick, vehicleId, rideId)
    : dropoff(eventId, tick, vehicleId, rideId);
}

function started(): Tutorial {
  const tutorial = createTutorial({ context: TUTORIAL_CONTEXT });
  tutorial.start({ tick: 0 });
  return tutorial;
}

test('117 tutorial is a fixed five-step path with stable identity', () => {
  const tutorial = createTutorial({ context: TUTORIAL_CONTEXT });
  assert.equal(tutorial.tutorialId, TUTORIAL_ID);
  assert.equal(tutorial.version, TUTORIAL_VERSION);
  assert.equal(tutorial.namespace, TUTORIAL_NAMESPACE);
  assert.equal(TUTORIAL_LIMITS.steps, tutorialStepIds.length);
  assert.deepEqual(
    tutorial.steps().map((step) => step.stepId),
    [...tutorialStepIds],
  );
  assert.deepEqual(
    tutorial.steps().map((step) => step.order),
    [1, 2, 3, 4, 5],
  );
  assert.equal(tutorial.instance(), null);
  const start = tutorial.start({ tick: 0 });
  assert.equal(start.duplicate, false);
  assert.equal(start.instance.state, 'ACTIVE');
  assert.equal(start.instance.stepIndex, 0);
  assert.equal(start.instance.instanceId, tutorial.start({ tick: 1 }).instance.instanceId);
  assert.equal(tutorial.start({ tick: 2 }).duplicate, true);
  assert.equal(tutorial.instance()?.steps.length, 5);
});

test('117 full keyboard path completes the tutorial with no learning job or profile version', () => {
  const { tutorial, bus } = createTutorialFixture();
  const published: string[] = [];
  bus.subscribe((event) => {
    published.push(event.eventId);
    return undefined;
  });
  const run = playFullTutorial(tutorial);
  assert.equal(run.completed, true);
  assert.deepEqual(run.steps, [
    'ACCEPTED',
    'ACCEPTED',
    'ACCEPTED',
    'ACCEPTED',
    'ACCEPTED',
    'COMPLETED',
  ]);
  const instance = tutorial.instance()!;
  assert.equal(instance.state, 'COMPLETED');
  assert.equal(instance.completedBy, 'PLAY');
  assert.equal(instance.stepIndex, 5);
  assert.equal(instance.completedTick, run.tick);
  assert.deepEqual(
    instance.steps.map((step) => step.state),
    ['SATISFIED', 'SATISFIED', 'SATISFIED', 'SATISFIED', 'SATISFIED'],
  );
  assert.deepEqual(run.study, {
    blockedSelections: 0,
    learningJobs: 0,
    profileVersions: 0,
    learningActivationsObserved: 0,
  });
  // The tutorial itself publishes nothing: the only events on the bus are the fixture's own.
  assert.deepEqual(published, []);
  assert.equal(tutorial.stats().accepted, 6);
});

test('117 eligible LEARNING is refused, so the tutorial cannot learn by accident', () => {
  const tutorial = started();
  tutorial.observeSelection(selection(1));
  assert(
    throwsWith(
      () => tutorial.observeControl(control(2, 'LEARNING', true)),
      /Tutorial LEARNING must stay ineligible/,
    ),
  );
  assert(
    throwsWith(
      () => tutorial.observeControl(control(2, 'LEARNING', null)),
      /Tutorial LEARNING must stay ineligible/,
    ),
  );
  assert.equal(tutorial.stats().refusedLearning, 2);
  assert.equal(tutorial.instance()?.stepIndex, 1);
  // The same tick is still usable by the ineligible observation after the refusals.
  const accepted = tutorial.observeControl(control(2, 'MANUAL'));
  assert.equal(accepted.status, 'ACCEPTED');
  assert.equal(tutorial.instance()?.stepIndex, 2);
});

test('117 every taxi stays selectable; another taxi never resets or blocks progress', () => {
  const tutorial = started();
  assert.deepEqual(tutorial.canSelectTaxi(TUTORIAL_TAXI), {
    vehicleId: TUTORIAL_TAXI,
    allowed: true,
    reason: 'TUTORIAL_NEVER_GATES_TAXI_ACCESS',
  });
  assert.equal(tutorial.canSelectTaxi(TUTORIAL_OTHER_TAXI).allowed, true);
  tutorial.observeSelection(selection(1, TUTORIAL_TAXI));
  tutorial.observeControl(control(2, 'MANUAL', false, TUTORIAL_TAXI));
  const switched = tutorial.observeSelection(selection(3, TUTORIAL_OTHER_TAXI));
  assert.equal(switched.status, 'IGNORED');
  assert.equal(switched.reason, 'WRONG_STEP');
  assert.equal(tutorial.instance()?.taxiId, TUTORIAL_OTHER_TAXI);
  assert.equal(tutorial.instance()?.stepIndex, 2);
  assert.deepEqual(
    tutorial
      .instance()!
      .steps.slice(0, 2)
      .map((step) => step.state),
    ['SATISFIED', 'SATISFIED'],
  );
  assert.equal(tutorial.stats().blockedSelections, 0);
  // The new taxi can continue the tutorial without restarting it.
  assert.equal(
    tutorial.observeControl(control(4, 'LEARNING', false, TUTORIAL_OTHER_TAXI)).status,
    'ACCEPTED',
  );
  assert.equal(tutorial.stats().blockedSelections, 0);
});

test('117 civil selection is ignored without blocking and stale ticks throw', () => {
  const tutorial = started();
  const civil = tutorial.observeSelection(selection(1, TUTORIAL_CIVIL, 'CIVIL'));
  assert.equal(civil.reason, 'NOT_A_TAXI');
  assert.equal(tutorial.instance()?.stepIndex, 0);
  assert.equal(tutorial.observeSelection(selection(2)).status, 'ACCEPTED');
  assert.throws(() => tutorial.observeSelection(selection(1, TUTORIAL_OTHER_TAXI)), RangeError);
  assert.throws(
    () =>
      tutorial.observeControl({
        tick: 3,
        vehicleId: TUTORIAL_TAXI,
        mode: 'AUTO',
        learningEligible: true,
      }),
    /Tutorial mode eligibility/,
  );
});

test('117 skipping a step keeps the rest of the path and skipping all completes by SKIP', () => {
  const tutorial = started();
  tutorial.observeSelection(selection(1));
  const skipped = tutorial.skip({ tick: 2, stepId: 'MODE_MANUAL' });
  assert.equal(skipped.steps[1]?.state, 'SKIPPED');
  assert.equal(skipped.stepIndex, 2);
  assert.equal(skipped.skippedSteps, 1);
  assert.equal(tutorial.observeControl(control(3, 'MANUAL')).reason, 'WRONG_MODE');
  assert.equal(tutorial.observeControl(control(4, 'LEARNING', false)).status, 'ACCEPTED');
  assert.equal(tutorial.observeControl(control(5, 'AUTO')).status, 'ACCEPTED');
  const lastStep = tutorial.skip({ tick: 6, stepId: 'COMPLETE_RIDE' });
  assert.equal(lastStep.state, 'COMPLETED');
  assert.equal(lastStep.completedBy, 'SKIP');
  assert.equal(lastStep.skippedSteps, 2);
  assert.equal(lastStep.completedTick, 6);

  const all = started();
  all.observeSelection(selection(1));
  const skippedAll = all.skip({ tick: 2, stepId: 'ALL' });
  assert.equal(skippedAll.state, 'COMPLETED');
  assert.equal(skippedAll.completedBy, 'SKIP');
  assert.equal(skippedAll.skippedSteps, 4);
  assert.equal(skippedAll.steps[0]?.state, 'SATISFIED');
  assert.throws(() => all.skip({ tick: 3, stepId: 'ALL' }), /Only an active tutorial/);
});

test('117 pause ignores observations and resume continues at the same step', () => {
  const tutorial = started();
  tutorial.observeSelection(selection(1));
  tutorial.observeControl(control(2, 'MANUAL'));
  const paused = tutorial.pause({ tick: 3 });
  assert.equal(paused.state, 'PAUSED');
  assert.equal(paused.stepIndex, 2);
  const ignored = tutorial.observeControl(control(4, 'LEARNING', false));
  assert.equal(ignored.status, 'IGNORED');
  assert.equal(ignored.reason, 'TUTORIAL_PAUSED');
  assert.equal(
    tutorial.ingest(event('PICKUP', 'pickup:paused', 5, TUTORIAL_TAXI, TUTORIAL_RIDE)).reason,
    'TUTORIAL_PAUSED',
  );
  const resumed = tutorial.resume({ tick: 6 });
  assert.equal(resumed.state, 'ACTIVE');
  assert.equal(resumed.stepIndex, 2);
  assert.equal(resumed.pausedTick, null);
  assert.equal(tutorial.observeControl(control(7, 'LEARNING', false)).status, 'ACCEPTED');
  assert.throws(() => tutorial.resume({ tick: 8 }), /Only a paused tutorial/);
});

test('117 the ride needs a real pickup for the selected taxi before the dropoff', () => {
  const tutorial = started();
  playUntilRide(tutorial);
  assert.equal(tutorial.instance()?.stepIndex, 4);
  const foreign = tutorial.ingest(
    event('DROPOFF', 'dropoff:foreign', 10, TUTORIAL_OTHER_TAXI, TUTORIAL_RIDE),
  );
  assert.equal(foreign.reason, 'FOREIGN_VEHICLE');
  const noPickup = tutorial.ingest(
    event('DROPOFF', 'dropoff:no-pickup', 11, TUTORIAL_TAXI, TUTORIAL_RIDE),
  );
  assert.equal(noPickup.reason, 'RIDE_NOT_BOARDED');
  const pickupResult = tutorial.ingest(
    event('PICKUP', 'pickup:ok', 12, TUTORIAL_TAXI, TUTORIAL_RIDE),
  );
  assert.equal(pickupResult.status, 'ACCEPTED');
  assert.equal(tutorial.instance()?.rideId, TUTORIAL_RIDE);
  const wrongRide = tutorial.ingest(
    event('DROPOFF', 'dropoff:other-ride', 13, TUTORIAL_TAXI, 'ride:other'),
  );
  assert.equal(wrongRide.reason, 'RIDE_NOT_BOARDED');
  const done = tutorial.ingest(event('DROPOFF', 'dropoff:ok', 14, TUTORIAL_TAXI, TUTORIAL_RIDE));
  assert.equal(done.status, 'COMPLETED');
  assert.equal(tutorial.instance()?.rideId, null);
});

function playUntilRide(tutorial: Tutorial): void {
  tutorial.observeSelection(selection(1));
  tutorial.observeControl(control(2, 'MANUAL'));
  tutorial.observeControl(control(3, 'LEARNING', false));
  tutorial.observeControl(control(4, 'AUTO'));
}

test('117 the real 007 bus drives the ride and PROFILE_ACTIVATE stays evidence only', () => {
  const { tutorial, bus } = createTutorialFixture();
  const stop = tutorial.attachBus(bus);
  assert.throws(() => tutorial.attachBus(bus), /already attached/);
  tutorial.start({ tick: 0 });
  playUntilRide(tutorial);
  bus.publish(pickup('pickup:bus', 10, TUTORIAL_TAXI, TUTORIAL_RIDE));
  const activation = profileActivate('activation:117', 11, 'profile:117', 'v117');
  bus.publish(activation);
  assert.equal(tutorial.stats().learningActivationsObserved, 1);
  assert.equal(tutorial.instance()?.stepIndex, 4);
  bus.publish(dropoff('dropoff:bus', 12, TUTORIAL_TAXI, TUTORIAL_RIDE));
  assert.equal(tutorial.instance()?.state, 'COMPLETED');
  stop();
  const afterStop = tutorial.ingest(profileActivate('activation:after', 13, 'profile:117', 'v118'));
  assert.equal(afterStop.status, 'IGNORED');
  assert.equal(tutorial.stats().learningJobs, 0);
  assert.equal(tutorial.stats().profileVersions, 0);
});

test('117 a foreign world is refused on observations and on the bus', () => {
  const tutorial = createTutorial({ context: TUTORIAL_CONTEXT });
  const foreignBus = {
    publish: () => ({ status: 'delivered', failures: [] }),
    subscribe: () => () => undefined,
    getStats: () => ({ sessionId: 'session-other', worldEpoch: MISSION_WORLD_EPOCH }),
  };
  assert.throws(
    () => tutorial.attachBus(foreignBus as unknown as Parameters<Tutorial['attachBus']>[0]),
    /Foreign tutorial event bus world/,
  );
  const tutorialWithContext = createTutorial({ context: TUTORIAL_CONTEXT });
  tutorialWithContext.start({ tick: 0 });
  tutorialWithContext.observeSelection(selection(1));
  assert.throws(
    () =>
      tutorialWithContext.ingest({
        schemaVersion: 1,
        units: 'SI',
        sessionId: 'session-other',
        worldEpoch: MISSION_WORLD_EPOCH,
        eventId: 'pickup:foreign',
        tick: 2,
        entityIds: [TUTORIAL_TAXI, TUTORIAL_RIDE],
        type: 'PICKUP',
        payload: { vehicleId: TUTORIAL_TAXI, rideId: TUTORIAL_RIDE },
      }),
    /Foreign tutorial event world/,
  );
  tutorial.dispose();
  tutorialWithContext.dispose();
});

test('117 evidence per step is bounded and dispose clears owned state', () => {
  const tutorial = started();
  tutorial.observeSelection(selection(1));
  tutorial.dispose();
  assert.equal(tutorial.instance(), null);
  assert.equal(tutorial.stats().retainedInstances, 0);
  assert.equal(tutorial.stats().disposed, true);
  assert.throws(() => tutorial.canSelectTaxi(TUTORIAL_TAXI), /disposed/);
  const live = started();
  live.observeSelection(selection(1));
  for (let index = 0; index < 10; index += 1) live.observeControl(control(2 + index, 'AUTO'));
  const evidence = live.instance()!.steps[0]!.evidenceEventIds;
  assert(evidence.length <= TUTORIAL_LIMITS.evidencePerStep);
});

test('117 tutorial source is deterministic and free of DOM, clocks and randomness', () => {
  for (const file of [SOURCE_TUTORIAL, SOURCE_PANEL]) {
    const source = readFileSync(file, 'utf8');
    for (const token of [
      'Date',
      'performance.now',
      'Math.random',
      'setTimeout',
      'setInterval',
      'requestAnimationFrame',
      'localStorage',
      'document.',
    ])
      assert.equal(source.includes(token), false, `${file} contains ${token}`);
  }
  const tutorialSource = readFileSync(SOURCE_TUTORIAL, 'utf8');
  for (const forbidden of [
    "from '../ui'",
    "from '../input'",
    "from '../app'",
    "from '../telemetry'",
  ])
    assert.equal(tutorialSource.includes(forbidden), false);
  assert.equal(MISSION_SESSION_ID.trim(), MISSION_SESSION_ID);
});

test('117 report transcript is deterministic and matches the saved evidence', () => {
  const report = runMissionIntroReport();
  const first = JSON.stringify(report);
  const second = JSON.stringify(runMissionIntroReport());
  assert.equal(first, second);
  assert.equal(report.summary.pass, true, JSON.stringify(report.checks.filter((c) => !c.pass)));
  assert.equal(report.summary.checks, report.checks.length);
  const saved = readFileSync(EVIDENCE, 'utf8');
  assert.equal(`${JSON.stringify(report, null, 2)}\n`, saved);
});
