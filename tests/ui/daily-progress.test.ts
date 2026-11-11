import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAILY_MISSION_XP,
  DAILY_TICK_HZ,
  dailyRewardId,
  missionObjectiveKinds,
  restoreDailyProgress,
} from '../../src/missions';
import {
  DAILY_PROGRESS_PANEL_LIMITS,
  DAILY_PROGRESS_PANEL_VERSION,
  DAILY_PROGRESS_READ_VERSION,
  DAILY_PROGRESS_REASONS,
  DAILY_PROGRESS_STATES,
  parseDailyProgressSnapshot,
  projectDailyProgressPanel,
  type DailyProgressSnapshot,
} from '../../src/ui';
import { calendarInput, learningOnlyCapabilities } from '../missions/mission-daily-fixture';
import {
  DAILY_DATE,
  DAILY_SECOND_TAXI,
  DAILY_TAXI,
  DAILY_WORLD_EPOCH,
  createDailyHarness,
  envelope,
  rewardIdOf,
  windowCatalog,
  type DailyEnvelope,
} from './daily-progress-fixture';

function rawSnapshot(snapshot: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
}

function rawInstances(snapshot: DailyProgressSnapshot): Record<string, unknown>[] {
  return (rawSnapshot(snapshot).instances ?? []) as Record<string, unknown>[];
}

function sendKey(node: unknown, key: string, init: { readonly shiftKey?: boolean } = {}): void {
  (node as { send(type: string, init?: { key?: string; shiftKey?: boolean }): void }).send(
    'keydown',
    { key, ...init },
  );
}

test('212 the panel vocabularies are the delivered 211/116 vocabularies', () => {
  assert.deepEqual([...DAILY_PROGRESS_STATES], ['ACTIVE', 'COMPLETED', 'EXPIRED', 'INELIGIBLE']);
  assert.equal(DAILY_PROGRESS_REASONS.length, 11);
  assert.equal(DAILY_PROGRESS_PANEL_LIMITS.instances, 3);
  assert.equal(DAILY_PROGRESS_PANEL_LIMITS.tickHz, DAILY_TICK_HZ);
  assert.equal(DAILY_PROGRESS_PANEL_LIMITS.globalListeners, 0);
  const harness = createDailyHarness();
  const snapshot = harness.read();
  assert.equal(snapshot.version, DAILY_PROGRESS_READ_VERSION);
  assert.equal(snapshot.instances.length, 3);
  assert.deepEqual(snapshot.instances.map((entry) => entry.objectiveKind).sort(), [
    'CLEAN_DROPOFFS',
    'LEARNING_ACTIVATIONS',
    'MANUAL_DROPOFFS',
  ]);
  for (const instance of snapshot.instances)
    assert.ok((missionObjectiveKinds as readonly string[]).includes(instance.objectiveKind));
  harness.dispose();
});

test('212 the three objectives start active with promised XP, time zone and reset moment', () => {
  const harness = createDailyHarness();
  const snapshot = harness.read();
  assert.equal(snapshot.phase, 'ACTIVE');
  assert.equal(snapshot.dailyDate, DAILY_DATE);
  assert.equal(snapshot.timeZone, 'Europe/Bucharest');
  assert.equal(snapshot.promisedXp, 3 * DAILY_MISSION_XP);
  assert.equal(snapshot.grantedXp, 0);
  assert.equal(snapshot.rewards, 0);
  for (const instance of snapshot.instances) {
    assert.equal(instance.state, 'ACTIVE');
    assert.equal(instance.reason, null);
    assert.equal(instance.progress, 0);
    assert.equal(instance.promisedXp, DAILY_MISSION_XP);
    assert.equal(instance.grantedXp, 0);
  }
  assert.equal(snapshot.expiresAtMs - snapshot.dayStartMs, 86_400_000);

  harness.panel.open();
  const view = harness.panel.getView();
  assert.ok(view !== null);
  assert.equal(view.counts.instances, 3);
  assert.equal(view.counts.active, 3);
  assert.equal(view.counts.completed, 0);
  assert.match(view.dayLabel, /Zi locală: 2026-11-11 \(Europe\/Bucharest \(UTC\+02:00\)\)/);
  assert.match(view.resetLabel, /Reset: 2026-11-12 00:00/);
  assert.match(view.timeZoneLabel, /Europe\/Bucharest \(UTC\+02:00\)/);
  assert.match(view.windowLabel, /2026-11-11 00:00 → 2026-11-12 00:00 \(24 h\) · Activă/);
  assert.equal(view.xpLabel, '0 XP acordat din 300 XP promis (0 recompense unice)');
  const first = view.instances[0]!;
  assert.match(first.xpLabel, /100 XP promis/);
  assert.match(first.progressLabel, /0 din 2/);
  assert.equal(first.percent, 0);
  assert.match(first.stateLabel, /În desfășurare/);
  assert.match(harness.dialog().textContent ?? '', /3 în desfășurare/);
  harness.dispose();
});

test('212 a MANUAL objective needs the real MANUAL mode inside the real ride interval', () => {
  const harness = createDailyHarness();
  const manual = harness.instanceOf('MANUAL_DROPOFFS');
  assert.equal(manual.controlRequirement, 'MANUAL');
  assert.equal(manual.target, 2);

  // An AUTO ride is a real ride, but the MANUAL objective refuses it and says why.
  const autoRide = harness.ride('ride:212:auto-1');
  let row = harness.instanceOf('MANUAL_DROPOFFS');
  assert.equal(row.progress, 0);
  assert.equal(row.modeMismatches, 1);
  assert.equal(row.rides, 0);
  assert.equal(row.lastRide, null);

  // A MANUAL ride inside the declared interval advances it once.
  const manualRide = harness.ride('ride:212:manual-1', { mode: 'MANUAL' });
  row = harness.instanceOf('MANUAL_DROPOFFS');
  assert.equal(row.progress, 1);
  assert.equal(row.satisfied, false);
  assert.equal(row.manualRides, 1);
  assert.equal(row.rides, 1);
  assert.equal(row.modeMismatches, 1);
  assert.equal(row.lastRide?.rideId, 'ride:212:manual-1');
  assert.equal(row.lastRide?.pickupTick, manualRide.pickupTick);
  assert.equal(row.lastRide?.dropoffTick, manualRide.dropoffTick);
  assert.equal(row.lastRide?.durationTicks, manualRide.dropoffTick - manualRide.pickupTick);
  assert.equal(
    row.lastRide?.durationSeconds,
    (manualRide.dropoffTick - manualRide.pickupTick) / DAILY_TICK_HZ,
  );
  assert.equal(row.lastRide?.mode, 'MANUAL');
  assert.equal(row.lastRide?.clean, true);
  assert.equal(autoRide.dropoffTick < manualRide.pickupTick, true);

  // The second MANUAL ride completes it and grants exactly one real reward.
  const completed = harness.ride('ride:212:manual-2', { mode: 'MANUAL' });
  row = harness.instanceOf('MANUAL_DROPOFFS');
  assert.ok(completed.dropoffTick > manualRide.dropoffTick);
  assert.equal(row.progress, 2);
  assert.equal(row.satisfied, true);
  assert.equal(row.state, 'COMPLETED');
  assert.equal(row.manualRides, 2);
  assert.equal(row.rewardId, dailyRewardId('player:211-daily', row.instanceId));
  assert.equal(row.rewardXp, DAILY_MISSION_XP);
  assert.equal(row.grantedXp, DAILY_MISSION_XP);
  assert.equal(row.rewardGrantedAtMs, harness.observedAtMs());
  // Both the MANUAL objective and the ANY service objective are real completions of this day.
  assert.equal(harness.progress.calendarState().rewards.length, 2);
  assert.equal(harness.read().grantedXp, 2 * DAILY_MISSION_XP);
  assert.equal(harness.panel.getSnapshot(), null);
  harness.panel.open();
  assert.equal(harness.panel.getSnapshot()?.version, DAILY_PROGRESS_PANEL_VERSION);
  harness.dispose();
});

test('212 partial progress is shown as the real ratio and 50% of the bar', () => {
  const harness = createDailyHarness();
  harness.ride('ride:212:auto-1');
  harness.ride('ride:212:manual-1', { mode: 'MANUAL' });
  const row = harness.instanceOf('MANUAL_DROPOFFS');
  assert.equal(row.progress, 1);
  assert.equal(row.state, 'ACTIVE');

  harness.panel.open();
  const view = harness.panel.getView();
  assert.ok(view !== null);
  const partial = view.instances.find((entry) => entry.instanceId === row.instanceId)!;
  assert.equal(partial.progressLabel, '1 din 2');
  assert.equal(partial.percent, 50);
  assert.equal(partial.stateLabel, 'În desfășurare');
  assert.match(partial.description, /Progres 1 din 2/);
  assert.match(partial.modeLabel, /1 MANUAL/);
  assert.match(
    partial.rideLabel,
    /ride:212:manual-1: \d+ → \d+ \(\d+\.\d s\), MANUAL, fără incident/,
  );
  assert.match(partial.xpLabel, /100 XP promis/);
  harness.dispose();
});

test('212 the ANY objective counts an AUTO ride while a mixed ride is not a MANUAL ride', () => {
  const harness = createDailyHarness();
  harness.ride('ride:212:auto-1');
  let clean = harness.instanceOf('CLEAN_DROPOFFS');
  assert.equal(clean.progress, 1);
  assert.equal(clean.autoRides, 1);
  assert.equal(clean.controlRequirement, 'ANY');

  // Pickup in AUTO, then MANUAL_START inside the interval: the ride is MIXED.
  harness.pickup('ride:212:mixed-1');
  harness.startManual(DAILY_TAXI, 'MANUAL');
  harness.dropoff('ride:212:mixed-1');
  harness.endManual();
  clean = harness.instanceOf('CLEAN_DROPOFFS');
  const manual = harness.instanceOf('MANUAL_DROPOFFS');
  assert.equal(clean.progress, 2);
  assert.equal(clean.mixedRides, 1);
  assert.equal(clean.lastRide?.mode, 'MIXED');
  assert.equal(manual.progress, 0);
  assert.equal(manual.modeMismatches, 2);
  assert.equal(harness.progress.calendarState().rewards.length, 1);
  harness.dispose();
});

test('212 a DROPOFF without a PICKUP is refused explicitly, not ignored', () => {
  const harness = createDailyHarness();
  const result = harness.dropoff('ride:212:orphan');
  assert.equal(result.status, 'REJECTED');
  assert.equal(result.reason, 'NO_RIDE');
  assert.equal(result.advanced.length, 0);
  const snapshot = harness.read();
  assert.equal(snapshot.counters.rejected, 1);
  assert.deepEqual(
    snapshot.rejections.map((entry) => [entry.reason, entry.count]),
    [['NO_RIDE', 1]],
  );
  assert.equal(snapshot.lastRejection?.reason, 'NO_RIDE');
  assert.equal(snapshot.grantedXp, 0);
  for (const instance of snapshot.instances) assert.equal(instance.progress, 0);
  harness.dispose();
});

test('212 foreign sessions, old epochs and irrelevant events are counted refusals', () => {
  const harness = createDailyHarness();
  const payload = { vehicleId: DAILY_TAXI, rideId: 'ride:212:foreign' };
  const entities = [DAILY_TAXI, 'ride:212:foreign'];
  const replay = harness.ingest(
    envelope('DROPOFF', 10, payload, {
      sessionId: 'session:212-replay',
      entityIds: entities,
      eventId: '212:foreign:replay',
    }),
  );
  assert.equal(replay.status, 'REJECTED');
  assert.equal(replay.reason, 'FOREIGN_SESSION');
  const chaos = harness.ingest(
    envelope('DROPOFF', 20, payload, {
      sessionId: 'session:212-haos',
      entityIds: entities,
      eventId: '212:foreign:chaos',
    }),
  );
  assert.equal(chaos.reason, 'FOREIGN_SESSION');
  const oldEpoch = harness.ingest(
    envelope('DROPOFF', 30, payload, {
      worldEpoch: DAILY_WORLD_EPOCH - 1,
      entityIds: entities,
      eventId: '212:foreign:epoch',
    }),
  );
  assert.equal(oldEpoch.reason, 'STALE_EPOCH');
  const irrelevant = harness.ingest(
    envelope(
      'SIGNAL_CHANGED',
      40,
      { signalId: 'signal:212', state: 'RED' },
      { entityIds: ['signal:212'], eventId: '212:foreign:signal' },
    ),
  );
  assert.equal(irrelevant.reason, 'IRRELEVANT');

  let snapshot = harness.read();
  assert.deepEqual(
    snapshot.rejections.map((entry) => [entry.reason, entry.count]),
    [
      ['FOREIGN_SESSION', 2],
      ['IRRELEVANT', 1],
      ['STALE_EPOCH', 1],
    ],
  );
  assert.equal(snapshot.counters.rejected, 4);
  assert.equal(snapshot.counters.accepted, 0);
  assert.equal(
    snapshot.instances.every((entry) => entry.progress === 0),
    true,
  );

  // The same event inside the Academy session is accepted: the filter is real, not a blanket.
  const accepted = harness.ingest(
    envelope(
      'PICKUP',
      50,
      { vehicleId: DAILY_TAXI, rideId: 'ride:212:academy' },
      { entityIds: [DAILY_TAXI, 'ride:212:academy'], eventId: '212:academy:pickup' },
    ),
  );
  assert.equal(accepted.status, 'ACCEPTED');
  snapshot = harness.read();
  assert.equal(snapshot.counters.accepted, 1);

  // A duplicate of an accepted event changes nothing but is reported.
  const duplicate = harness.ingest(
    envelope(
      'PICKUP',
      50,
      { vehicleId: DAILY_TAXI, rideId: 'ride:212:academy' },
      { entityIds: [DAILY_TAXI, 'ride:212:academy'], eventId: '212:academy:pickup' },
    ),
  );
  assert.equal(duplicate.status, 'DUPLICATE');
  assert.equal(harness.read().counters.duplicates, 1);
  harness.dispose();
});

test('212 one reward per objective across a reload and a replay of the same day', () => {
  const harness = createDailyHarness();
  const learning = harness.instanceOf('LEARNING_ACTIVATIONS');
  const granted = harness.profileActivate('version-212:1');
  assert.equal(granted.completed.length, 1);
  assert.equal(granted.rewardsGranted, 1);
  assert.equal(harness.progress.calendarState().rewards.length, 1);
  assert.equal(
    harness.instanceOf('LEARNING_ACTIVATIONS').rewardId,
    rewardIdOf(learning.instanceId),
  );

  const checkpoint = harness.progress.snapshot();
  const lastEvent = checkpoint.events.at(-1)!;
  const restored = restoreDailyProgress(checkpoint, {
    sessionId: 'session:212-restarted',
    worldEpoch: DAILY_WORLD_EPOCH,
  });
  assert.equal(restored.rebound, true);
  const afterReload = restored.progress.read(harness.observedAtMs());
  const reloaded = afterReload.instances.find((entry) => entry.instanceId === learning.instanceId)!;
  assert.equal(reloaded.state, 'COMPLETED');
  assert.equal(reloaded.grantedXp, DAILY_MISSION_XP);
  assert.equal(afterReload.grantedXp, DAILY_MISSION_XP);
  assert.equal(restored.progress.calendarState().rewards.length, 1);

  // Replaying the identical day: the same event id is a duplicate in the restored ledger.
  const sameAgain = restored.progress.ingest({
    event: envelope(
      'PROFILE_ACTIVATE',
      lastEvent.tick,
      {
        profileId: 'profile:212',
        versionId: 'version-212:1',
        learningEpoch: 1,
        activationTick: lastEvent.tick,
      },
      { eventId: lastEvent.eventId, entityIds: ['profile:212'] },
    ),
    observedAtMs: harness.observedAtMs(),
  });
  assert.equal(sameAgain.status, 'DUPLICATE');

  // A new event for an already completed objective cannot pay a second reward.
  const again = restored.progress.ingest({
    event: envelope(
      'PROFILE_ACTIVATE',
      lastEvent.tick + 60,
      {
        profileId: 'profile:212',
        versionId: 'version-212:2',
        learningEpoch: 1,
        activationTick: lastEvent.tick + 60,
      },
      {
        eventId: '212:profile:replay-2',
        sessionId: 'session:212-restarted',
        entityIds: ['profile:212'],
      },
    ),
    observedAtMs: harness.observedAtMs(),
  });
  assert.equal(again.status, 'ACCEPTED');
  assert.equal(again.rewardsGranted, 0);
  assert.equal(again.completed.length, 0);
  const finalRead = restored.progress.read(harness.observedAtMs());
  const finalRow = finalRead.instances.find((entry) => entry.instanceId === learning.instanceId)!;
  assert.equal(finalRow.state, 'COMPLETED');
  assert.equal(finalRow.afterCompletionEvents, 1);
  assert.equal(finalRead.grantedXp, DAILY_MISSION_XP);
  assert.equal(restored.progress.calendarState().rewards.length, 1);
  assert.equal(restored.progress.calendarState().counters.regenerated, 0);
  harness.dispose();
});

test('212 an event at the day boundary is refused while one before it keeps its completion', () => {
  const harness = createDailyHarness();
  const expiresAtMs = harness.expiresAtMs();
  const dayStartMs = harness.dayStartMs();

  // Exactly one millisecond before the exclusive boundary: accepted and completed.
  harness.setObserved(expiresAtMs - 1);
  const before = harness.profileActivate('version-212:before');
  assert.equal(before.status, 'ACCEPTED');
  assert.equal(before.phase, 'ACTIVE');
  assert.equal(before.rewardsGranted, 1);

  // Exactly at the boundary: the set is EXPIRED and the event contributes nothing.
  harness.setObserved(expiresAtMs);
  const atBoundary = harness.profileActivate('version-212:at-boundary');
  assert.equal(atBoundary.status, 'REJECTED');
  assert.equal(atBoundary.reason, 'OUTSIDE_DAY');
  assert.equal(atBoundary.phase, 'EXPIRED');
  assert.equal(atBoundary.rewardsGranted, 0);

  const expired = harness.read();
  assert.equal(expired.phase, 'EXPIRED');
  assert.equal(expired.observedAtMs, expiresAtMs);
  const completed = expired.instances.find(
    (entry) => entry.objectiveKind === 'LEARNING_ACTIVATIONS',
  )!;
  assert.equal(completed.state, 'COMPLETED');
  assert.equal(completed.grantedXp, DAILY_MISSION_XP);
  for (const instance of expired.instances.filter((entry) => entry !== completed)) {
    assert.equal(instance.state, 'EXPIRED');
    assert.equal(instance.reason, 'EXPIRED');
  }

  // Before the day the same objective is explicitly ineligible, never ambiguously active.
  harness.setObserved(dayStartMs - 1);
  const pending = harness.read();
  assert.equal(pending.phase, 'PENDING');
  for (const instance of pending.instances) {
    if (instance.state === 'COMPLETED') assert.equal(instance.reason, null);
    else assert.equal(instance.reason, 'OUTSIDE_DAY');
  }

  harness.setObserved(expiresAtMs);
  harness.panel.open();
  const view = harness.panel.getView();
  assert.ok(view !== null);
  assert.equal(view.phase, 'EXPIRED');
  assert.equal(view.counts.completed, 1);
  assert.equal(view.counts.expired, 2);
  assert.match(view.instances[0]!.description, /Ziua este încheiată/);
  const expiredInstance = view.instances.find((entry) => entry.state === 'EXPIRED')!;
  assert.equal(expiredInstance.reasonLabel, 'ziua s-a încheiat înainte de îndeplinire');
  assert.equal(harness.dialog().getAttribute('data-phase'), 'EXPIRED');
  harness.dispose();
});

test('212 a new local day replaces the objectives and keeps the granted reward in history', () => {
  const harness = createDailyHarness();
  harness.profileActivate('version-212:day-one');
  assert.equal(harness.progress.calendarState().rewards.length, 1);
  const firstName = harness.instanceOf('MANUAL_DROPOFFS').instanceId;

  const nextDay = calendarInput('2026-11-12');
  const advanced = harness.progress.advance({
    calendar: nextDay,
    capabilities: learningOnlyCapabilities(),
    generatedAtMs: nextDay.observedAtMs,
  });
  assert.equal(advanced.action, 'NEW_DAY');
  assert.equal(advanced.dailyDate, '2026-11-12');
  assert.equal(advanced.createdRows, 3);
  assert.equal(advanced.droppedRows, 3);
  const read = harness.progress.read(nextDay.observedAtMs);
  assert.equal(read.dailyDate, '2026-11-12');
  assert.equal(read.grantedXp, 0);
  assert.equal(read.rewards, 0);
  assert.equal(
    read.instances.some((entry) => entry.instanceId === firstName),
    false,
  );
  assert.equal(harness.progress.calendarState().rewards.length, 1);
  assert.equal(harness.progress.calendarState().counters.generated, 2);
  harness.dispose();
});

test('212 the declared evaluation window closes late events with an explicit reason', () => {
  const harness = createDailyHarness({ catalog: windowCatalog() });
  harness.ride('ride:212:window-1');
  const row = harness.instanceOf('DROPOFFS');
  assert.equal(row.target, 2);
  assert.equal(row.progress, 1);
  assert.ok(row.firstTick !== null);
  assert.equal(row.deadlineTick, (row.firstTick ?? 0) + 600);
  harness.skipTicks(12);
  harness.ride('ride:212:window-2');
  const closed = harness.instanceOf('DROPOFFS');
  assert.equal(closed.progress, 1);
  assert.equal(closed.state, 'INELIGIBLE');
  assert.equal(closed.reason, 'WINDOW_CLOSED');
  const view = projectDailyProgressPanel(harness.read());
  assert.match(
    view.instances.find((entry) => entry.instanceId === closed.instanceId)?.reasonLabel ?? '',
    /fereastra de evaluare/,
  );
  harness.dispose();
});

test('212 the incident budget stops the objective with a counted reason', () => {
  const harness = createDailyHarness();
  harness.ride('ride:212:incident', { incident: true });
  const clean = harness.instanceOf('CLEAN_DROPOFFS');
  assert.equal(clean.incidentBudget, 0);
  assert.equal(clean.collisions, 1);
  assert.equal(clean.state, 'INELIGIBLE');
  assert.equal(clean.reason, 'INCIDENT_BUDGET_EXCEEDED');
  assert.equal(clean.progress, 0);
  const manual = harness.instanceOf('MANUAL_DROPOFFS');
  assert.equal(manual.state, 'ACTIVE');
  assert.equal(manual.collisions, 0);
  harness.dispose();
});

test('212 focus, Escape, Tab, one read per open and zero global listeners', () => {
  const harness = createDailyHarness();
  const trigger = harness.panel.getTrigger();
  const dialog = harness.dialog();
  harness.byClass('daily-progress__trigger')[0]!.focus();
  (trigger as unknown as { dispatch(type: string): number }).dispatch('click');
  assert.equal(harness.panel.isOpen(), true);
  assert.equal(harness.panel.getStats().focusMoves, 1);
  const close = harness.byClass('daily-progress__close')[0]!;
  assert.equal(harness.document.activeElement, close);
  assert.equal(harness.panel.getStats().listeners, 3);
  assert.equal(harness.panel.getStats().globalListeners, 0);
  assert.deepEqual(harness.surface, [true]);
  assert.equal(harness.reads(), 1);
  assert.equal(dialog.getAttribute('data-reads'), '1');
  assert.equal(dialog.getAttribute('data-instances'), '3');

  sendKey(close, 'Tab');
  const body = harness.byClass('daily-progress__body')[0]!;
  assert.equal(harness.document.activeElement, body);
  sendKey(body, 'Tab');
  assert.equal(harness.document.activeElement, close);
  assert.equal(harness.panel.getStats().tabWraps, 1);

  sendKey(close, 'Escape');
  assert.equal(harness.panel.isOpen(), false);
  assert.equal(harness.panel.getStats().escapes, 1);
  assert.equal(harness.panel.getStats().focusRestores, 1);
  assert.deepEqual(harness.surface, [true, false]);
  assert.equal(harness.panel.refresh(), 'SKIPPED_CLOSED');
  assert.equal(harness.reads(), 1);

  harness.panel.open();
  assert.equal(harness.panel.refresh(), 'SKIPPED_UNCHANGED');
  harness.ride('ride:212:refresh', { mode: 'MANUAL' });
  assert.equal(harness.panel.refresh(), 'RENDERED');
  assert.equal(harness.panel.getStats().renders, 3);
  assert.equal(harness.reads(), 4);
  assert.equal(dialog.getAttribute('data-active'), '3');
  assert.equal(harness.panel.getStats().globalListeners, 0);

  harness.panel.dispose();
  assert.equal(harness.panel.getStats().disposed, true);
  assert.equal(harness.host.children.length, 0);
});

test('212 the panel refuses a read model that contradicts the delivered contracts', () => {
  const harness = createDailyHarness();
  const snapshot = rawSnapshot(harness.read());
  assert.ok(parseDailyProgressSnapshot(snapshot));

  const unsatisfied = rawInstances(harness.read());
  unsatisfied[0]!.satisfied = true;
  assert.throws(
    () => parseDailyProgressSnapshot({ ...snapshot, instances: unsatisfied }),
    /satisfied flag contradicts its target/,
  );

  const completed = rawInstances(harness.read());
  completed[0]!.progress = Number(completed[0]!.target);
  completed[0]!.satisfied = true;
  completed[0]!.state = 'COMPLETED';
  completed[0]!.grantedXp = completed[0]!.rewardXp;
  assert.throws(
    () => parseDailyProgressSnapshot({ ...snapshot, instances: completed }),
    /completed row has no reward identity/,
  );

  assert.throws(
    () =>
      parseDailyProgressSnapshot({
        ...snapshot,
        instances: rawInstances(harness.read()),
        dailyDate: '2026-11-12',
      }),
    /local date does not match its day window/,
  );

  assert.throws(
    () =>
      parseDailyProgressSnapshot({
        ...snapshot,
        instances: rawInstances(harness.read()),
        phase: 'EXPIRED',
      }),
    /day is not expired at the observed instant/,
  );

  const counters = JSON.parse(JSON.stringify(snapshot.counters)) as Record<string, unknown>;
  counters.rejected = 2;
  assert.throws(
    () =>
      parseDailyProgressSnapshot({
        ...snapshot,
        instances: rawInstances(harness.read()),
        counters,
      }),
    /rejection counters disagree/,
  );

  assert.throws(
    () =>
      parseDailyProgressSnapshot({
        ...snapshot,
        instances: rawInstances(harness.read()),
        extra: 1,
      }),
    /unknown field/,
  );
  harness.dispose();
});

test('212 the consumer refuses conflicting identities and malformed checkpoints', () => {
  const harness = createDailyHarness();
  const first = envelope(
    'PICKUP',
    10,
    { vehicleId: DAILY_TAXI, rideId: 'ride:212:conflict' },
    { eventId: '212:conflict:pickup', entityIds: [DAILY_TAXI, 'ride:212:conflict'] },
  );
  assert.equal(harness.ingest(first).status, 'ACCEPTED');
  const conflicting = envelope(
    'PICKUP',
    20,
    { vehicleId: DAILY_TAXI, rideId: 'ride:212:conflict' },
    { eventId: '212:conflict:pickup', entityIds: [DAILY_TAXI, 'ride:212:conflict'] },
  );
  assert.throws(() => harness.ingest(conflicting), /Conflicting daily progress event identity/);
  assert.throws(
    () => harness.ingest({ ...first, unexpected: true } as unknown as DailyEnvelope),
    /Missing or unknown contract fields/,
  );

  const checkpoint = rawSnapshot(harness.progress.snapshot());
  assert.throws(
    () =>
      restoreDailyProgress(checkpoint, {
        sessionId: 'session:212-restart',
        worldEpoch: DAILY_WORLD_EPOCH - 1,
      }),
    /older world epoch/,
  );
  const rows = (checkpoint.rows ?? []) as Record<string, unknown>[];
  assert.throws(
    () =>
      restoreDailyProgress(
        {
          ...checkpoint,
          rows: [{ ...rows[0]!, instanceId: 'daily-v1:unknown' }, ...rows.slice(1)],
        },
        { sessionId: 'session:212-restart', worldEpoch: DAILY_WORLD_EPOCH },
      ),
    /not a mission of the day/,
  );
  assert.throws(
    () =>
      restoreDailyProgress(
        { ...checkpoint, dailyDate: '2026-11-12' },
        { sessionId: 'session:212-restart', worldEpoch: DAILY_WORLD_EPOCH },
      ),
    /no set for its own date/,
  );
  harness.dispose();
});

test('212 two identical runs produce the same read model and the same refusal board', () => {
  const play = (): unknown => {
    const harness = createDailyHarness();
    harness.ride('ride:212:auto-1');
    harness.startManual(DAILY_SECOND_TAXI, 'MANUAL');
    harness.ingest(
      envelope(
        'DROPOFF',
        999,
        { vehicleId: DAILY_SECOND_TAXI, rideId: 'ride:212:none' },
        {
          sessionId: 'session:212-replay',
          eventId: '212:foreign:determinism',
          entityIds: [DAILY_SECOND_TAXI, 'ride:212:none'],
        },
      ),
    );
    const read = harness.read();
    harness.dispose();
    return read;
  };
  assert.deepEqual(play(), play());
});
