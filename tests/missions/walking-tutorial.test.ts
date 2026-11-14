/**
 * PBI 199 - the walking tutorial advances only from real control events.
 *
 * The suite drives the delivered contract with real 192 walker states, real 195/196 decisions and
 * validated 007 events. Every negative case is a real fact of the wrong kind, not a malformed input,
 * so the proof is about the tutorial's rule and not about input validation.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  WALKING_TUTORIAL_LIMITS,
  WALKING_TUTORIAL_POLICY,
  createWalkingTutorial,
  parseWalkingTutorialState,
  walkingTutorialStepIds,
} from '../../src/missions';
import type { WalkingTutorialInstance } from '../../src/missions';
import {
  createWalkingSegments,
  estimatorCandidate,
  type WalkingSegmentsTarget,
} from '../../src/character';
import type { InputAuthority } from '../../src/input';
import {
  TUTORIAL_CHARACTER_ID,
  TUTORIAL_TAXI_ID,
  TUTORIAL_TICKS,
  TUTORIAL_V1_MISSION_ID,
  compatibilitySnapshot,
  playTutorial,
  playUntil,
  probeTickFor,
  progressKey,
  tutorialDigest,
  walkingFixture,
  wrongEvents,
} from './walking-tutorial-suite';

const stepTicks = [
  TUTORIAL_TICKS.selection,
  TUTORIAL_TICKS.motion,
  TUTORIAL_TICKS.entry,
  TUTORIAL_TICKS.pickup,
  TUTORIAL_TICKS.dropoff,
  TUTORIAL_TICKS.exit,
];

test('199 tutorialul avansează exact șase pași, fiecare din evenimentul lui real', () => {
  const run = playTutorial();
  const instance: WalkingTutorialInstance = run.tutorial.instance()!;
  assert.equal(instance.state, 'COMPLETED');
  assert.equal(instance.stepIndex, walkingTutorialStepIds.length);
  assert.equal(instance.vehicleId, TUTORIAL_TAXI_ID);
  assert.equal(instance.rideId, 'ride:199-1');
  for (let index = 0; index < walkingTutorialStepIds.length; index += 1) {
    const stepId = walkingTutorialStepIds[index]!;
    const entry = instance.steps[index];
    assert.ok(entry !== undefined, stepId);
    assert.equal(entry.stepId, stepId);
    assert.equal(entry.state, 'SATISFIED', stepId);
    assert.equal(entry.satisfiedTick, stepTicks[index], stepId);
    assert.ok(entry.evidenceEventIds.length >= 1, stepId);
  }
  const definitions = run.tutorial.steps();
  for (const [index, definition] of definitions.entries())
    assert.equal(definition.order, index + 1);
  const accepted = run.tape.filter((row) => row.status !== 'IGNORED');
  assert.equal(accepted.length, walkingTutorialStepIds.length);
  assert.deepEqual(
    accepted.map((row) => row.event),
    [
      'TAXI_SELECTION',
      'WALKER_MOTION',
      'VEHICLE_ENTRY',
      'RIDE_PICKUP',
      'RIDE_DROPOFF',
      'VEHICLE_EXIT',
    ],
  );
  assert.equal(run.tape.at(-1)!.status, 'COMPLETED');
  const stats = run.tutorial.stats();
  assert.equal(stats.learningJobs, 0);
  assert.equal(stats.profileVersions, 0);
  assert.equal(stats.demonstrations, 0);
  assert.equal(stats.estimatorCandidates, 0);
  assert.equal(stats.blockedSelections, 0);
  assert.equal(stats.xpGranted, 0);
  assert.equal(stats.skippedSteps, 0);
  assert.ok(stats.walkingDistanceM > 0);
});

test('199 fiecare pas refuză toate celelalte evenimente fără să avanseze nimic', () => {
  const fixture = walkingFixture();
  let probes = 0;
  for (let stepIndex = 0; stepIndex < walkingTutorialStepIds.length; stepIndex += 1) {
    for (const wrong of wrongEvents(stepIndex, fixture)) {
      const tutorial = playUntil(stepIndex, fixture);
      const before = progressKey(tutorial);
      const current = tutorial.instance()!.stepIndex;
      assert.equal(current, stepIndex);
      wrong.feed(tutorial);
      const after = progressKey(tutorial);
      assert.equal(after, before, `step ${stepIndex} advanced on ${wrong.kind}`);
      assert.equal(tutorial.instance()!.stepIndex, stepIndex);
      assert.equal(
        tutorial.instance()!.steps[stepIndex]!.state,
        'PENDING',
        `${walkingTutorialStepIds[stepIndex]} was satisfied by ${wrong.kind}`,
      );
      probes += 1;
    }
  }
  assert.equal(probes, walkingTutorialStepIds.length * 5);
});

test('199 un pas nu se bifează de două ori din același eveniment', () => {
  const run = playTutorial();
  const fixture = run.fixture;
  const before = progressKey(run.tutorial);
  const instanceBefore = run.tutorial.instance()!;
  const accepted = run.tape.filter((row) => row.status !== 'IGNORED');
  assert.equal(accepted.length, walkingTutorialStepIds.length);
  assert.equal(instanceBefore.stepIndex, accepted.length);
  // A second selection arrives after the first one already resolved the step: nothing re-opens.
  const settled = playUntil(1, fixture);
  const settledTick = settled.instance()!.steps[0]!.satisfiedTick;
  const again = settled.observeSelection({
    tick: TUTORIAL_TICKS.selection + 1,
    vehicleId: TUTORIAL_TAXI_ID,
    kind: 'TAXI',
  });
  assert.equal(again.status, 'IGNORED');
  assert.equal(settled.instance()!.stepIndex, 1);
  assert.equal(settled.instance()!.steps[0]!.satisfiedTick, settledTick);
  // Every fact of the completed sequence is refused by the completed instance, in clock order.
  const base = TUTORIAL_TICKS.exit + 1;
  const replay = [
    () =>
      run.tutorial.observeSelection({
        tick: base,
        vehicleId: TUTORIAL_TAXI_ID,
        kind: 'TAXI',
      }),
    () => run.tutorial.observeWalk(fixture.states[base + 1]!),
    () => run.tutorial.observeWalk(fixture.states[base + 2]!),
    () => run.tutorial.observeEntry(fixture.entryAt(base + 3)),
    () => run.tutorial.observeRide(fixture.pickupAt(base + 4)),
    () => run.tutorial.observeRide(fixture.dropoffAt(base + 5)),
    () => run.tutorial.observeExit(fixture.exitAt(base + 6)),
  ];
  for (const feed of replay) {
    const observation = feed();
    assert.equal(observation.status, 'IGNORED');
    assert.equal(observation.reason, 'TUTORIAL_COMPLETE');
  }
  assert.equal(progressKey(run.tutorial), before);
  const instance = run.tutorial.instance()!;
  for (const [index, step] of instance.steps.entries())
    assert.equal(step.satisfiedTick, instanceBefore.steps[index]!.satisfiedTick);
  assert.equal(instance.walkingDistanceM, instanceBefore.walkingDistanceM);
  assert.equal(instance.walkingTicks, instanceBefore.walkingTicks);
});

test('199 mersul are nevoie de mișcare reală între două poziții autoritare', () => {
  const fixture = walkingFixture();
  const tutorial = playUntil(1, fixture);
  const baseline = fixture.states[TUTORIAL_TICKS.baseline]!;
  const seeded = tutorial.observeWalk(baseline);
  assert.equal(seeded.status, 'IGNORED');
  assert.equal(seeded.reason, 'WALK_BASELINE_RECORDED');
  assert.equal(tutorial.instance()!.stepIndex, 1);
  const still = tutorial.observeWalk(baseline);
  assert.equal(still.status, 'IGNORED');
  assert.equal(still.reason, 'NO_WALKER_MOTION');
  assert.equal(tutorial.instance()!.stepIndex, 1);
  const advanced = tutorial.observeWalk(fixture.states[TUTORIAL_TICKS.motion]!);
  assert.equal(advanced.status, 'ACCEPTED');
  assert.equal(advanced.stepId, 'WALK_TO_TAXI');
  assert.equal(tutorial.instance()!.stepIndex, 2);
  assert.ok(tutorial.stats().walkingDistanceM > 0);
  assert.equal(tutorial.stats().xpGranted, 0, 'mersul nu inventează XP de timp');
});

test('199 intrarea refuzată de 195 nu avansează pasul', () => {
  const fixture = walkingFixture();
  const tutorial = playUntil(2, fixture);
  const before = progressKey(tutorial);
  const refused = fixture.entryRefusalAt(TUTORIAL_TICKS.entry);
  assert.equal(refused.accepted, false);
  const observation = tutorial.observeEntry(refused);
  assert.equal(observation.status, 'IGNORED');
  assert.equal(observation.reason, 'ENTRY_REFUSED');
  assert.equal(progressKey(tutorial), before);
});

test('199 ieșirea refuzată de 196 nu avansează pasul', () => {
  const fixture = walkingFixture();
  const tutorial = playUntil(5, fixture);
  const before = progressKey(tutorial);
  const refusal = fixture.exitRefusalAt(TUTORIAL_TICKS.exit);
  assert.equal(refusal.accepted, false);
  const observation = tutorial.observeExit(refusal);
  assert.equal(observation.status, 'IGNORED');
  assert.equal(observation.reason, 'EXIT_REFUSED');
  assert.equal(progressKey(tutorial), before);
});

test('199 o cursă străină sau o coborâre fără îmbarcare nu avansează', () => {
  const fixture = walkingFixture();
  const tutorial = playUntil(3, fixture);
  const before = progressKey(tutorial);
  const foreignPickup = tutorial.observeRide(
    fixture.pickupAt(TUTORIAL_TICKS.pickup, 'ride:199-x', 'vehicle:199-foreign'),
  );
  assert.equal(foreignPickup.status, 'IGNORED');
  assert.equal(foreignPickup.reason, 'FOREIGN_VEHICLE');
  assert.equal(progressKey(tutorial), before);

  const earlyDropoff = tutorial.observeRide(fixture.dropoffAt(TUTORIAL_TICKS.pickup + 1));
  assert.equal(earlyDropoff.status, 'IGNORED');
  assert.equal(earlyDropoff.reason, 'RIDE_NOT_BOARDED');
  assert.equal(progressKey(tutorial), before);

  const pickup = tutorial.observeRide(fixture.pickupAt(TUTORIAL_TICKS.pickup + 2));
  assert.equal(pickup.status, 'ACCEPTED');
  const wrongRide = tutorial.observeRide(
    fixture.dropoffAt(TUTORIAL_TICKS.pickup + 3, 'ride:199-other'),
  );
  assert.equal(wrongRide.status, 'IGNORED');
  assert.equal(wrongRide.reason, 'RIDE_NOT_BOARDED');
  assert.equal(tutorial.instance()!.stepIndex, 4);
});

test('199 tutorialul nu produce learning și nu are cale către un candidat de estimator', () => {
  const fixture = walkingFixture();
  const run = playTutorial({ fixture });
  const tutorial = run.tutorial;
  const completedDigest = progressKey(tutorial);
  for (const tick of [TUTORIAL_TICKS.exit + 1, TUTORIAL_TICKS.exit + 2]) {
    const profile = tutorial.observeRide(fixture.profileAt(tick));
    assert.equal(profile.status, 'IGNORED');
    assert.equal(profile.reason, 'UNRELATED_EVENT', 'profilul rămâne doar dovadă');
  }
  assert.equal(progressKey(tutorial), completedDigest);
  assert.equal(tutorial.stats().learningActivationsObserved, 2);
  const active = playUntil(3, fixture);
  const activeDigest = progressKey(active);
  const profile = active.observeRide(fixture.profileAt(TUTORIAL_TICKS.entry + 1));
  assert.equal(profile.status, 'IGNORED');
  assert.equal(profile.reason, 'UNRELATED_EVENT');
  assert.equal(progressKey(active), activeDigest, 'un PROFILE_ACTIVATE nu schimbă progresul');
  const stats = active.stats();
  assert.equal(stats.learningActivationsObserved, 1);
  assert.equal(stats.learningJobs, 0);
  assert.equal(stats.profileVersions, 0);
  assert.equal(stats.demonstrations, 0);
  assert.equal(stats.estimatorCandidates, 0);
  assert.equal(active.instance()!.stepIndex, 3, 'un PROFILE_ACTIVATE nu este progres');
  const source = readFileSync(
    join(process.cwd(), 'src', 'missions', 'walking-tutorial.ts'),
    'utf8',
  );
  for (const forbidden of [
    "from '../learning'",
    "from '../telemetry'",
    "from '../profiles'",
    "from '../experiments'",
    'createCandidateProfileStore',
    'estimatorCandidate(',
    'createProfileSnapshot',
  ])
    assert.equal(source.includes(forbidden), false, `tutorial imports ${forbidden}`);
  const exported = readFileSync(join(process.cwd(), 'src', 'missions', 'index.ts'), 'utf8');
  assert.ok(exported.includes('createWalkingTutorial'));
});

test('199 martorul 198: mersul produce 0 candidați, iar poarta reală rămâne funcțională', () => {
  const target: WalkingSegmentsTarget = Object.freeze({
    sessionId: '199-witness',
    worldEpoch: 1,
    playerId: 'player:199',
    profileId: 'profile:199',
    baseVersionId: 'style-v1',
    learningEpoch: 1,
    learningEligible: true,
  });
  const segments = createWalkingSegments({
    ownerId: '199',
    characterId: TUTORIAL_CHARACTER_ID,
    target,
  });
  for (let tick = 1; tick <= 120; tick += 1)
    segments.step({
      tick,
      transition: 'WALK',
      authority: Object.freeze({ consumer: 'CHARACTER', characterId: TUTORIAL_CHARACTER_ID }),
      distanceM: 0.02285,
    });
  const walking = segments.getStats().counters;
  assert.equal(walking.closedSegments, 0);
  assert.equal(walking.candidates, 0);
  const vehicle = (vehicleId: string): InputAuthority =>
    Object.freeze({ consumer: 'VEHICLE', vehicleId });
  segments.step({
    tick: 121,
    transition: 'ENTER',
    authority: vehicle(TUTORIAL_TAXI_ID),
    previousAuthority: Object.freeze({
      consumer: 'CHARACTER',
      characterId: TUTORIAL_CHARACTER_ID,
    }),
    vehicleId: TUTORIAL_TAXI_ID,
    mode: 'LEARNING',
  });
  const closed = segments.step({
    tick: 122,
    transition: 'EXIT',
    authority: Object.freeze({ consumer: 'CHARACTER', characterId: TUTORIAL_CHARACTER_ID }),
    previousAuthority: vehicle(TUTORIAL_TAXI_ID),
    vehicleId: TUTORIAL_TAXI_ID,
    maneuverState: 'IDLE',
  });
  assert.equal(closed.transition, 'EXIT');
  if (closed.transition !== 'EXIT') return;
  assert.equal(closed.candidates.length, 1, 'poarta 198/069 este funcțională');
  const segment = closed.closed;
  assert.ok(segment !== null);
  assert.ok(estimatorCandidate(segment, target) !== null);
  assert.equal(playTutorial().tutorial.stats().estimatorCandidates, 0);
});

test('199 reluarea aceleiași secvențe dă aceeași stare finală', () => {
  const first = playTutorial();
  const digest = tutorialDigest(first.tutorial);
  const replay = playTutorial();
  assert.equal(tutorialDigest(replay.tutorial), digest);
  assert.equal(
    replay.tutorial.instance()!.walkingDistanceM,
    first.tutorial.instance()!.walkingDistanceM,
  );
  assert.equal(replay.tutorial.stats().xpGranted, 0);
});

test('199 criteriul 1: catalogul 231, provocările 188, daily, misiunile și deblocările sunt bit-identice', () => {
  const before = compatibilitySnapshot();
  const completed = playTutorial();
  assert.equal(completed.tutorial.instance()!.state, 'COMPLETED');
  const afterFull = compatibilitySnapshot();
  const abandoned = playUntil(2);
  abandoned.abandon({ tick: TUTORIAL_TICKS.abandon });
  assert.equal(abandoned.instance()!.state, 'ABANDONED');
  const afterAbandoned = compatibilitySnapshot();
  for (const after of [afterFull, afterAbandoned]) {
    assert.equal(JSON.stringify(after), JSON.stringify(before));
    assert.equal(after.digest, before.digest);
    assert.equal(after.challengeCatalog.json, before.challengeCatalog.json);
    assert.equal(after.extendedCatalog.json, before.extendedCatalog.json);
    assert.equal(after.daily.json, before.daily.json);
    assert.equal(after.progress.json, before.progress.json);
    assert.equal(after.unlocks.json, before.unlocks.json);
    assert.equal(after.access.json, before.access.json);
    assert.equal(after.playerProgress.json, before.playerProgress.json);
    assert.equal(after.v1Mission.json, before.v1Mission.json);
  }
  assert.equal(before.challengeCatalog.templates, 12);
  assert.equal(before.extendedCatalog.extended, 15);
  assert.equal(before.extendedCatalog.total, 27);
  assert.equal(before.daily.instances, 3);
  assert.equal(before.access.taxis, 24);
  assert.equal(before.access.blockedTaxis, 0);
  assert.equal(before.access.revoked, 0);
  assert.equal(before.v1Mission.missionId, TUTORIAL_V1_MISSION_ID);
  assert.equal(before.v1Mission.state, 'COMPLETED');
});

test('199 starea este serializabilă și reluarea din mijloc dă același rezultat', () => {
  const fixture = walkingFixture();
  const uninterrupted = playTutorial({ fixture });
  const expected = tutorialDigest(uninterrupted.tutorial);
  const partial = playUntil(3, fixture);
  const document = JSON.parse(JSON.stringify(partial.snapshot())) as unknown;
  const resumed = createWalkingTutorial({ resume: document });
  assert.equal(resumed.instance()!.stepIndex, 3);
  const rest = playTutorialFrom(resumed, fixture);
  assert.equal(tutorialDigest(rest), expected);
  assert.throws(() =>
    parseWalkingTutorialState({ ...(document as Record<string, unknown>), version: 'x' }),
  );
  assert.throws(() =>
    parseWalkingTutorialState({ ...(document as Record<string, unknown>), stepIndex: 6 }),
  );
});

function playTutorialFrom(
  tutorial: ReturnType<typeof createWalkingTutorial>,
  fixture: ReturnType<typeof walkingFixture>,
): ReturnType<typeof createWalkingTutorial> {
  tutorial.observeRide(fixture.pickupAt(TUTORIAL_TICKS.pickup));
  tutorial.observeRide(fixture.dropoffAt(TUTORIAL_TICKS.dropoff));
  tutorial.observeExit(fixture.exitAt(TUTORIAL_TICKS.exit));
  return tutorial;
}

test('199 tick-ul stale este refuzat, iar accesul la taxiuri nu este blocat niciodată', () => {
  const fixture = walkingFixture();
  const tutorial = playUntil(2, fixture);
  assert.throws(
    () => tutorial.observeWalk(fixture.states[TUTORIAL_TICKS.baseline]!),
    /Stale walking tutorial tick/,
  );
  for (const vehicleId of ['vehicle:taxi-199', 'vehicle:civil-199']) {
    const access = tutorial.canSelectTaxi(vehicleId);
    assert.equal(access.allowed, true);
    assert.equal(access.reason, 'TUTORIAL_NEVER_GATES_TAXI_ACCESS');
  }
  assert.equal(tutorial.stats().blockedSelections, 0);
  assert.equal(WALKING_TUTORIAL_LIMITS.steps, walkingTutorialStepIds.length);
  assert.equal(WALKING_TUTORIAL_POLICY.learning, 'REFUSED');
  assert.equal(WALKING_TUTORIAL_POLICY.walkingTimeXp, 'NOT_IMPLEMENTED');
  assert.equal(probeTickFor(3), TUTORIAL_TICKS.entry + 1);
});

test('199 abandonat și pauzat nu mai avansează, dar păstrează progresul parțial', () => {
  const fixture = walkingFixture();
  const tutorial = playUntil(2, fixture);
  tutorial.pause({ tick: TUTORIAL_TICKS.entry - 50 });
  const paused = tutorial.observeEntry(fixture.entryAt(TUTORIAL_TICKS.entry));
  assert.equal(paused.status, 'IGNORED');
  assert.equal(paused.reason, 'TUTORIAL_PAUSED');
  tutorial.resume({ tick: TUTORIAL_TICKS.entry + 1 });
  const abandoned = tutorial.abandon({ tick: TUTORIAL_TICKS.entry + 2 });
  assert.equal(abandoned.state, 'ABANDONED');
  assert.equal(abandoned.stepIndex, 2);
  const blocked = tutorial.observeEntry(fixture.entryAt(TUTORIAL_TICKS.entry + 3));
  assert.equal(blocked.status, 'IGNORED');
  assert.equal(blocked.reason, 'TUTORIAL_ABANDONED');
  assert.equal(tutorial.instance()!.stepIndex, 2);
  const skipped = playUntil(1, fixture);
  skipped.skip({ tick: TUTORIAL_TICKS.entry, stepId: 'ALL' });
  assert.equal(skipped.instance()!.state, 'COMPLETED');
  assert.equal(skipped.instance()!.completedBy, 'SKIP');
  assert.equal(skipped.instance()!.skippedSteps, 5);
  assert.equal(compatibilitySnapshot().access.blockedTaxis, 0);
});
