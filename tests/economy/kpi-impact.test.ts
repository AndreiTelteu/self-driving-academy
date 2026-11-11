import assert from 'node:assert/strict';
import test from 'node:test';
import { KPI_IMPACT_LIMITS, KPI_IMPACT_VERSION, selectKpiImpact } from '../../src/economy';
import type { FleetKpiSnapshot } from '../../src/economy';
import {
  createMissionRewardsLedger,
  createPlayerProgress,
  levelForXpMicro,
  levelThresholdXp,
} from '../../src/missions';
import { ContractValidationError } from '../../src/sessions';
import type { PlayerProgress } from '../../src/missions';
import {
  XP_FIXTURE_PROFILE_ID,
  XP_FIXTURE_START_MS,
  activeWindow,
  completedMissionSettlement,
  createXpProfileStore,
  createXpProgress,
  dailyReward,
  xpProfileParameters,
} from '../missions/player-xp-fixture';
import {
  createMissionTestCatalog,
  createMissionTestTracker,
  testMission,
} from '../missions/mission-fixture';
import {
  bothDown,
  controlModeImpact,
  firstDay,
  noEvents,
  realFailedRide,
  revenueDownRatingUp,
  revenueUpRatingDown,
  steady,
} from './kpi-impact-fixture';

function mutated(snapshot: FleetKpiSnapshot, change: (copy: Record<string, unknown>) => void) {
  const copy = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
  change(copy);
  return copy;
}

/** Credits a real 125 mission and a real active window: 100.5 XP, level 2. */
function creditedProgress(): PlayerProgress {
  const progress = createXpProgress(),
    scenario = completedMissionSettlement();
  progress.creditMission({ settlement: scenario.settlement, observedAtMs: XP_FIXTURE_START_MS });
  progress.observeActiveTime(activeWindow(XP_FIXTURE_START_MS));
  return progress;
}

test('214 the impact read is the published contract and cannot move XP', () => {
  const read = revenueUpRatingDown().read();
  assert.equal(read.version, KPI_IMPACT_VERSION);
  assert.equal(KPI_IMPACT_VERSION, '214-kpi-impact-v1');
  assert.deepEqual(read.xp, { debits: 0, credits: 0, negativeCredits: false });
  assert.equal(read.historyScans, 0);
  assert.equal(KPI_IMPACT_LIMITS.historyScans, 0);
  assert.equal(KPI_IMPACT_LIMITS.days, 2);
  assert.equal(read.state, 'COMPARABLE');
  assert.equal(read.currentDayMatchesTick, true);
});

test('214 revenue up with rating down keeps both facts separate', () => {
  const read = revenueUpRatingDown().read();
  assert.equal(read.current?.revenueMinorUnits, 1_000);
  assert.equal(read.previous?.revenueMinorUnits, 500);
  assert.equal(read.delta.revenueMinorUnits, 500);
  assert.equal(read.delta.revenueDirection, 'UP');
  assert.equal(read.previous?.averageRating, 5);
  assert.equal(read.current?.averageRating, 2);
  assert.equal(read.delta.ratingDelta, -3);
  assert.equal(read.delta.ratingDirection, 'DOWN');
  assert.equal(read.delta.ratingAvailability, 'AVAILABLE');
  assert.equal(read.delta.incidentState, 'NONE');
  assert.equal(read.current?.reviewCount, 1);
  assert.equal(read.previous?.reviewCount, 2);
});

test('214 revenue down with rating up is the inverse consequence', () => {
  const read = revenueDownRatingUp().read();
  assert.equal(read.delta.revenueMinorUnits, -500);
  assert.equal(read.delta.revenueDirection, 'DOWN');
  assert.equal(read.delta.ratingDelta, 3);
  assert.equal(read.delta.ratingDirection, 'UP');
  assert.equal(read.delta.incidentState, 'NONE');
});

test('214 both KPI fall in the same day and the real incident is reported', () => {
  const read = bothDown().read();
  assert.equal(read.delta.revenueDirection, 'DOWN');
  assert.equal(read.delta.ratingDirection, 'DOWN');
  assert.equal(read.current?.failedRides, 1);
  assert.equal(read.current?.incidentRides, 1);
  assert.equal(read.delta.incidentRides, 1);
  assert.equal(read.delta.incidentState, 'INCREASED');
  assert.equal(read.current?.lowRatingReviews, 1);
  assert.equal(read.previous?.lowRatingReviews, 0);
  assert.equal(read.delta.lowRatingDelta, 1);
  // The consequence is a service fact: the read model still cannot debit XP.
  assert.equal(read.xp.debits, 0);
});

test('214 no change reports FLAT, not an invented fall', () => {
  const read = steady().read();
  assert.equal(read.delta.revenueMinorUnits, 0);
  assert.equal(read.delta.revenueDirection, 'FLAT');
  assert.equal(read.delta.ratingDelta, 0);
  assert.equal(read.delta.ratingDirection, 'FLAT');
  assert.equal(read.delta.incidentState, 'NONE');
});

test('214 a first day has no baseline and is never compared', () => {
  const read = firstDay().read();
  assert.equal(read.state, 'NO_BASELINE');
  assert.equal(read.previous, null);
  assert.equal(read.current?.revenueMinorUnits, 500);
  assert.equal(read.delta.revenueDirection, 'UP');
  assert.equal(read.delta.ratingAvailability, 'NO_BASELINE');
  assert.equal(read.delta.ratingDirection, 'UNKNOWN');
  assert.equal(read.delta.ratingDelta, null);
});

test('214 a snapshot without events is NO_EVENT and still scan free', () => {
  const read = noEvents().read();
  assert.equal(read.state, 'NO_EVENT');
  assert.equal(read.current, null);
  assert.equal(read.previous, null);
  assert.equal(read.delta.revenueDirection, 'UNKNOWN');
  assert.equal(read.delta.ratingDirection, 'UNKNOWN');
  assert.equal(read.historyScans, 0);
});

test('214 a real failed ride and its real review reach the KPI consequence', () => {
  const scenario = revenueUpRatingDown();
  const incident = realFailedRide(scenario.tick - 60, 'ride:214:real-incident');
  try {
    scenario.kpi.applySettlement(incident.settlement);
    scenario.kpi.applyReview(incident.review);
    const snapshot = scenario.snapshot();
    const read = selectKpiImpact(snapshot);
    const day = snapshot.currentDay;
    assert.ok(day !== null);
    assert.equal(read.current?.failedRides, day.failedRides);
    assert.equal(read.current?.reviewCount, day.reviewCount);
    assert.equal(read.current?.ratingSum, day.ratingSum);
    assert.equal(
      read.current?.lowRatingReviews,
      (day.ratingHistogram[0] ?? 0) + (day.ratingHistogram[1] ?? 0) + (day.ratingHistogram[2] ?? 0),
    );
    assert.equal(read.current?.incidentRides, day.failedRides + day.cancelledRides);
    assert.equal(read.delta.incidentState, 'INCREASED');
  } finally {
    incident.dispose();
  }
});

test('214 MANUAL, LEARNING and AUTO produce the same consequence from the same facts', () => {
  const readings = (['MANUAL', 'LEARNING', 'AUTO'] as const).map((mode) => {
    const scenario = controlModeImpact(mode);
    try {
      return { mode, review: scenario.review, read: scenario.read };
    } finally {
      scenario.dispose();
    }
  });
  const first = readings[0]!;
  for (const entry of readings) {
    assert.equal(entry.review.rating, first.review.rating);
    assert.equal(entry.read.delta.revenueDirection, first.read.delta.revenueDirection);
    assert.equal(entry.read.delta.ratingDirection, first.read.delta.ratingDirection);
    assert.equal(entry.read.xp.debits, 0);
    assert.equal(entry.read.state, 'COMPARABLE');
  }
  assert.equal(first.read.delta.ratingDirection, 'DOWN');
  assert.ok(first.review.rating < 5);
});

test('214 the read copies the 209 bucket instead of recounting it', () => {
  const scenario = bothDown();
  const snapshot = scenario.snapshot();
  const read = selectKpiImpact(snapshot);
  const day = snapshot.currentDay;
  assert.ok(day !== null);
  assert.equal(read.current?.periodId, day.periodId);
  assert.equal(read.current?.revenueMinorUnits, day.revenueMinorUnits);
  assert.equal(read.current?.completedRides, day.completedRides);
  assert.equal(read.current?.failedRides, day.failedRides);
  assert.equal(read.current?.cancelledRides, day.cancelledRides);
  assert.equal(read.current?.terminalRides, day.terminalRides);
  assert.equal(read.current?.reviewCount, day.reviewCount);
  assert.equal(read.current?.ratingSum, day.ratingSum);
  assert.equal(read.current?.averageRating, day.averageRating);
  assert.deepEqual(read.current?.ratingHistogram, day.ratingHistogram);
  assert.equal(read.current?.completeness, 'PARTIAL');
  assert.equal(read.current?.index, 1);
  assert.equal(read.current?.startTick, 72_000);
});

test('214 an invalid or scanned snapshot is refused', () => {
  const snapshot = revenueUpRatingDown().snapshot();
  assert.throws(
    () => selectKpiImpact(mutated(snapshot, (copy) => (copy.version = 'other')) as never),
    ContractValidationError,
  );
  assert.throws(
    () => selectKpiImpact(mutated(snapshot, (copy) => (copy.historyScans = 1)) as never),
    ContractValidationError,
  );
  const negative = mutated(snapshot, (copy) => {
    const days = copy.days as { revenueMinorUnits: number }[];
    if (days[0] !== undefined) days[0].revenueMinorUnits = -1;
  });
  assert.throws(() => selectKpiImpact(negative as never), ContractValidationError);
});

test('214 a real KPI fall, an accident and a failed objective never lower XP or the level', () => {
  const progress = creditedProgress();
  const before = progress.read();
  assert.equal(before.xpBalance, 100.5);
  assert.equal(before.level, 2);
  assert.equal(levelForXpMicro(before.xpBalanceMicroXp), before.level);
  assert.equal(levelThresholdXp(2), 100);

  // 1. Both KPI fall in a real 209 day.
  const kpi = bothDown();
  const read = kpi.read();
  assert.equal(read.delta.revenueDirection, 'DOWN');
  assert.equal(read.delta.ratingDirection, 'DOWN');
  assert.equal(read.xp.debits, 0);

  // 2. A real accident: a failed ride with its real low review.
  const incident = realFailedRide(kpi.tick - 60, 'ride:214:xp-invariant');
  let accidentRating = 0;
  try {
    assert.equal(incident.settlement.terminalState, 'FAILED');
    accidentRating = incident.rating;
    const dayAverage = read.current?.averageRating ?? 5;
    assert.ok(accidentRating <= dayAverage);
  } finally {
    incident.dispose();
  }

  // 3. A failed and expired mission: the 125 ledger refuses to settle it.
  const tracker = createMissionTestTracker({
    catalog: createMissionTestCatalog([testMission({ windowTicks: 600 })]),
  });
  tracker.start({ missionId: 'test-mission', tick: 100 });
  const expiredId = tracker.advance(1_000).expired[0] ?? '';
  const expired = tracker.instance(expiredId);
  assert.ok(expired !== undefined);
  assert.equal(expired.state, 'FAILED');
  const ledger = createMissionRewardsLedger({ catalog: tracker.catalog() });
  let settlementRefused = false;
  try {
    ledger.settle({ instance: expired });
  } catch (error: unknown) {
    settlementRefused = error instanceof ContractValidationError;
  }
  assert.equal(settlementRefused, true);

  const after = progress.read();
  assert.equal(after.xpBalanceMicroXp, before.xpBalanceMicroXp);
  assert.equal(after.xpBalance, before.xpBalance);
  assert.equal(after.level, before.level);
  assert.equal(after.entries.length, before.entries.length);
  assert.equal(after.debits, 0);
  assert.equal(after.monotone, true);
  assert.equal(after.profileWrites, 0);
  assert.equal(levelForXpMicro(after.xpBalanceMicroXp), before.level);
});

test('214 a negative credit is refused explicitly, not silently ignored', () => {
  const progress = creditedProgress();
  const before = progress.read();
  const scenario = completedMissionSettlement();
  const tampered = {
    ...scenario.settlement,
    rewards: scenario.settlement.rewards.map((row) =>
      row.kind === 'XP' ? { ...row, amount: -25 } : row,
    ),
  };
  let refusal: unknown;
  try {
    progress.creditMission({ settlement: tampered, observedAtMs: XP_FIXTURE_START_MS + 5_000 });
  } catch (error: unknown) {
    refusal = error;
  }
  assert.ok(refusal instanceof ContractValidationError);
  assert.match((refusal as Error).message, /range|whole number/);
  const after = progress.read();
  assert.equal(after.xpBalanceMicroXp, before.xpBalanceMicroXp);
  assert.equal(after.entries.length, before.entries.length);

  const checkpoint = JSON.parse(JSON.stringify(progress.checkpoint())) as {
    entries: { amountMicroXp: number; amountXp: number }[];
  };
  const entry = checkpoint.entries[0];
  assert.ok(entry !== undefined);
  entry.amountMicroXp = -1;
  entry.amountXp = -0.000001;
  assert.throws(
    () => createPlayerProgress({ playerId: 'player:213-xp', entries: checkpoint.entries }),
    ContractValidationError,
  );
});

test('214 a duplicate reward and a profile restore keep the XP balance', () => {
  const progress = creditedProgress();
  const before = progress.read();
  const daily = dailyReward();
  const first = progress.creditDaily({ record: daily.record, instance: daily.instance });
  const balanceAfterGrant = progress.read().xpBalanceMicroXp;
  const duplicate = progress.creditDaily({ record: daily.record, instance: daily.instance });
  assert.equal(first.creditedXp, 100);
  assert.equal(duplicate.creditedXp, 0);
  assert.equal(duplicate.duplicates, 1);
  assert.equal(progress.read().xpBalanceMicroXp, balanceAfterGrant);

  const saved = JSON.parse(JSON.stringify(progress.checkpoint()));
  const store = createXpProfileStore();
  store.clear();
  const imported = store.createBase({
    profileId: XP_FIXTURE_PROFILE_ID,
    versionId: 'profile-214-imported',
    parameters: xpProfileParameters(),
    sourceSegmentIds: [],
    createdAt: '2026-11-11T00:00:00.000Z',
  });
  assert.equal(imported.status, 'ACCEPTED');
  const restored = createPlayerProgress({
    playerId: saved.playerId,
    entries: saved.entries,
    accountedThroughMs: saved.accountedThroughMs,
    counters: saved.counters,
  });
  const after = restored.read();
  assert.equal(after.xpBalanceMicroXp, progress.read().xpBalanceMicroXp);
  assert.equal(after.level, progress.read().level);
  assert.ok(after.xpBalanceMicroXp > before.xpBalanceMicroXp);
  assert.equal(after.debits, 0);
});
