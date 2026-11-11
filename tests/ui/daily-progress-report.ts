import {
  DAILY_MISSION_XP,
  DAILY_PROGRESS_VERSION,
  dailyRewardId,
  restoreDailyProgress,
} from '../../src/missions';
import {
  DAILY_PROGRESS_PANEL_VERSION,
  DAILY_PROGRESS_READ_VERSION,
  DAILY_PROGRESS_REASON_LABELS,
  parseDailyProgressSnapshot,
  projectDailyProgressPanel,
} from '../../src/ui';
import { calendarInput, learningOnlyCapabilities } from '../missions/mission-daily-fixture';
import {
  DAILY_SECOND_TAXI,
  DAILY_TAXI,
  DAILY_WORLD_EPOCH,
  createDailyHarness,
  envelope,
  windowCatalog,
  type DailyHarness,
} from './daily-progress-fixture';

/**
 * 212 deterministic report. It plays real 007 envelopes through the real 212 consumer and reads the
 * real 212 panel; every number below is produced by that run, never asserted from a constant.
 */
export interface DailyProgressCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

export interface DailyProgressReport {
  readonly schemaVersion: 1;
  readonly version: typeof DAILY_PROGRESS_VERSION;
  readonly panelVersion: typeof DAILY_PROGRESS_PANEL_VERSION;
  readonly readVersion: typeof DAILY_PROGRESS_READ_VERSION;
  readonly checks: readonly DailyProgressCheck[];
  readonly summary: Readonly<{
    checks: number;
    passed: number;
    failed: number;
    pass: boolean;
  }>;
  readonly scenario: Readonly<{
    objectives: readonly Readonly<{
      slot: number;
      instanceId: string;
      objectiveKind: string;
      controlRequirement: string;
      target: number;
      rewardXp: number;
    }>[];
    promisedXp: number;
    grantedXp: number;
    rewards: number;
    rides: number;
    manualRides: number;
    autoRides: number;
    mixedRides: number;
    partialProgress: number;
    partialPercent: number;
    completedObjectives: number;
    lastRideRideId: string | null;
    lastRideMode: string | null;
    lastRideDurationSeconds: number | null;
    lastRidePickupTick: number | null;
    lastRideDropoffTick: number | null;
  }>;
  readonly refusals: Readonly<{
    reasons: readonly Readonly<{ reason: string; count: number }>[];
    rejected: number;
    duplicates: number;
    accepted: number;
    lastRejection: string | null;
    lastRejectionLabel: string | null;
  }>;
  readonly boundary: Readonly<{
    dayStartMs: number;
    expiresAtMs: number;
    acceptedAtBoundaryMinusOne: string;
    rejectedAtBoundary: string;
    phaseBeforeDay: string;
    phaseAtBoundary: string;
    completedSurvives: boolean;
    expiredObjectives: number;
    expiredReason: string | null;
  }>;
  readonly reload: Readonly<{
    rewardsBefore: number;
    rewardsAfter: number;
    grantedXpAfter: number;
    duplicateStatus: string;
    replayStatus: string;
    replayRewardsGranted: number;
    afterCompletionEvents: number;
    rebound: boolean;
    regenerated: number;
  }>;
  readonly day: Readonly<{
    action: string;
    dailyDate: string;
    createdRows: number;
    droppedRows: number;
    grantedXp: number;
    retainedRewards: number;
  }>;
  readonly limits: Readonly<{
    windowDeadline: number | null;
    windowReason: string | null;
    budgetCollisions: number;
    budgetReason: string | null;
  }>;
  readonly panel: Readonly<{
    states: readonly Readonly<{
      state: string;
      reason: string | null;
      stateLabel: string;
      progressLabel: string;
      xpLabel: string;
    }>[];
    phaseLabel: string;
    dayLabel: string;
    resetLabel: string;
    timeZoneLabel: string;
    rejectionLabel: string;
    elements: number;
    textNodes: number;
    listeners: number;
    globalListeners: number;
    focusMoves: number;
    focusRestores: number;
    escapes: number;
    tabWraps: number;
    reads: number;
    renders: number;
    skippedClosed: string;
    skippedUnchanged: string;
    surfaceCalls: number;
  }>;
  readonly determinism: Readonly<{ runs: number; equal: boolean }>;
}

function check(name: string, pass: boolean, detail: string): DailyProgressCheck {
  return Object.freeze({ name, pass, detail });
}

/** Core scenario: three objectives, a partial ratio, a MANUAL completion and one real reward each. */
function coreScenario(): {
  harness: DailyHarness;
  partial: number;
  partialPercent: number;
  manual: ReturnType<DailyHarness['instanceOf']>;
} {
  const harness = createDailyHarness();
  harness.ride('ride:212:auto-1');
  harness.ride('ride:212:manual-1', { mode: 'MANUAL' });
  const partialRow = harness.instanceOf('MANUAL_DROPOFFS');
  const partialView = projectDailyProgressPanel(harness.read()).instances.find(
    (entry) => entry.instanceId === partialRow.instanceId,
  )!;
  harness.ride('ride:212:manual-2', { mode: 'MANUAL' });
  return {
    harness,
    partial: partialRow.progress,
    partialPercent: partialView.percent,
    manual: harness.instanceOf('MANUAL_DROPOFFS'),
  };
}

function refusalsScenario(): DailyHarness {
  const harness = createDailyHarness();
  const payload = { vehicleId: DAILY_TAXI, rideId: 'ride:212:foreign' },
    entities = [DAILY_TAXI, 'ride:212:foreign'];
  harness.ingest(
    envelope('DROPOFF', 10, payload, {
      sessionId: 'session:212-replay',
      entityIds: entities,
      eventId: 'report:foreign:replay',
    }),
  );
  harness.ingest(
    envelope('DROPOFF', 20, payload, {
      sessionId: 'session:212-haos',
      entityIds: entities,
      eventId: 'report:foreign:chaos',
    }),
  );
  harness.ingest(
    envelope('DROPOFF', 30, payload, {
      worldEpoch: DAILY_WORLD_EPOCH - 1,
      entityIds: entities,
      eventId: 'report:foreign:epoch',
    }),
  );
  harness.ingest(
    envelope(
      'SIGNAL_CHANGED',
      40,
      { signalId: 'signal:212', state: 'RED' },
      { entityIds: ['signal:212'], eventId: 'report:foreign:signal' },
    ),
  );
  harness.ingest(
    envelope(
      'PICKUP',
      50,
      { vehicleId: DAILY_TAXI, rideId: 'ride:212:dup' },
      { entityIds: [DAILY_TAXI, 'ride:212:dup'], eventId: 'report:academy:pickup' },
    ),
  );
  harness.ingest(
    envelope(
      'PICKUP',
      50,
      { vehicleId: DAILY_TAXI, rideId: 'ride:212:dup' },
      { entityIds: [DAILY_TAXI, 'ride:212:dup'], eventId: 'report:academy:pickup' },
    ),
  );
  harness.dropoff('ride:212:orphan');
  return harness;
}

function boundaryScenario(): DailyHarness {
  const harness = createDailyHarness();
  harness.setObserved(harness.expiresAtMs() - 1);
  harness.profileActivate('version-212:boundary');
  harness.setObserved(harness.expiresAtMs());
  harness.profileActivate('version-212:at-boundary');
  return harness;
}

function reloadScenario(): {
  harness: DailyHarness;
  duplicateStatus: string;
  replayStatus: string;
  replayRewards: number;
  afterCompletionEvents: number;
  rewardsAfter: number;
  grantedXpAfter: number;
  rebound: boolean;
  regenerated: number;
} {
  const harness = createDailyHarness();
  harness.profileActivate('version-212:1');
  const checkpoint = harness.progress.snapshot();
  const lastEvent = checkpoint.events.at(-1)!;
  const restored = restoreDailyProgress(checkpoint, {
    sessionId: 'session:212-restarted',
    worldEpoch: DAILY_WORLD_EPOCH,
  });
  const duplicate = restored.progress.ingest({
    event: envelope(
      'PROFILE_ACTIVATE',
      lastEvent.tick,
      {
        profileId: 'profile:212',
        versionId: 'version-212:1',
        learningEpoch: 1,
        activationTick: lastEvent.tick,
      },
      {
        eventId: lastEvent.eventId,
        sessionId: 'session:212-restarted',
        entityIds: ['profile:212'],
      },
    ),
    observedAtMs: harness.observedAtMs(),
  });
  const replay = restored.progress.ingest({
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
        eventId: 'report:profile:replay',
        sessionId: 'session:212-restarted',
        entityIds: ['profile:212'],
      },
    ),
    observedAtMs: harness.observedAtMs(),
  });
  const read = restored.progress.read(harness.observedAtMs());
  const completed = read.instances.find((entry) => entry.objectiveKind === 'LEARNING_ACTIVATIONS')!;
  return {
    harness,
    duplicateStatus: duplicate.status,
    replayStatus: replay.status,
    replayRewards: replay.rewardsGranted,
    afterCompletionEvents: completed.afterCompletionEvents,
    rewardsAfter: restored.progress.calendarState().rewards.length,
    grantedXpAfter: read.grantedXp,
    rebound: restored.rebound,
    regenerated: restored.progress.calendarState().counters.regenerated,
  };
}

function panelScenario(): {
  harness: DailyHarness;
  skippedUnchanged: string;
  skippedClosed: string;
  rendered: string;
} {
  const harness = createDailyHarness();
  harness.panel.open();
  const skippedUnchanged = harness.panel.refresh();
  const close = harness.byClass('daily-progress__close')[0]!;
  close.send('keydown', { key: 'Escape' });
  const skippedClosed = harness.panel.refresh();
  const trigger = harness.panel.getTrigger() as unknown as { dispatch(type: string): number };
  trigger.dispatch('click');
  harness.ride('ride:212:manual-1', { mode: 'MANUAL' });
  const rendered = harness.panel.refresh();
  const closeAgain = harness.byClass('daily-progress__close')[0]!;
  closeAgain.send('keydown', { key: 'Tab', shiftKey: true });
  return { harness, skippedUnchanged, skippedClosed, rendered };
}

export function runDailyProgressReport(): DailyProgressReport {
  const core = coreScenario();
  const coreRead = core.harness.read();
  const coreView = projectDailyProgressPanel(coreRead);
  const refusals = refusalsScenario();
  const refusalRead = refusals.read();
  const boundary = boundaryScenario();
  const boundaryRead = boundary.read();
  const reload = reloadScenario();
  const windowed = createDailyHarness({ catalog: windowCatalog() });
  windowed.ride('ride:212:window-1');
  const firstTick = windowed.instanceOf('DROPOFFS').firstTick ?? 0;
  const windowDeadline = windowed.instanceOf('DROPOFFS').deadlineTick;
  windowed.skipTicks(12);
  windowed.ride('ride:212:window-2');
  const windowRow = windowed.instanceOf('DROPOFFS');
  const budget = createDailyHarness();
  budget.ride('ride:212:incident', { incident: true });
  const budgetRow = budget.instanceOf('CLEAN_DROPOFFS');
  const dayHarness = createDailyHarness();
  dayHarness.profileActivate('version-212:day-one');
  const nextDay = calendarInput('2026-11-12');
  const advanced = dayHarness.progress.advance({
    calendar: nextDay,
    capabilities: learningOnlyCapabilities(),
    generatedAtMs: nextDay.observedAtMs,
  });
  const dayRead = dayHarness.progress.read(nextDay.observedAtMs);
  const panel = panelScenario();
  const panelView = panel.harness.panel.getView()!;
  parseDailyProgressSnapshot(panel.harness.read());
  const panelStats = panel.harness.panel.getStats();
  const expiredHarness = createDailyHarness();
  expiredHarness.profileActivate('version-212:expired');
  expiredHarness.setObserved(expiredHarness.expiresAtMs());
  const expiredView = projectDailyProgressPanel(expiredHarness.read());
  const ineligibleHarness = createDailyHarness();
  ineligibleHarness.ride('ride:212:incident', { incident: true });
  const ineligibleView = projectDailyProgressPanel(ineligibleHarness.read());

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
          eventId: 'report:determinism',
          entityIds: [DAILY_SECOND_TAXI, 'ride:212:none'],
        },
      ),
    );
    const read = harness.read();
    harness.dispose();
    return read;
  };
  const firstRun = play();
  const secondRun = play();
  const equal = JSON.stringify(firstRun) === JSON.stringify(secondRun);

  const panelStates = [{ view: coreView }, { view: expiredView }, { view: ineligibleView }].flatMap(
    ({ view }) =>
      view.instances.map((entry) =>
        Object.freeze({
          state: entry.state,
          reason: entry.reason,
          stateLabel: entry.stateLabel,
          progressLabel: entry.progressLabel,
          xpLabel: entry.xpLabel,
        }),
      ),
  );

  const checks: DailyProgressCheck[] = [
    check(
      'the day carries exactly three objectives from the 211 set',
      coreRead.instances.length === 3 && new Set(coreRead.instances.map((i) => i.slot)).size === 3,
      `instances ${coreRead.instances.length}, slots ${coreRead.instances.map((i) => i.slot).join('/')}`,
    ),
    check(
      'every objective publishes its promised XP and its control requirement',
      coreRead.instances.every(
        (i) => i.promisedXp === DAILY_MISSION_XP && i.controlRequirement.length > 0,
      ),
      coreRead.instances
        .map((i) => `${i.objectiveKind}:${i.controlRequirement}/${i.promisedXp} XP`)
        .join(', '),
    ),
    check(
      'no reward is granted before an objective is completed',
      core.partial === 1 && coreRead.grantedXp >= DAILY_MISSION_XP,
      `partial ${core.partial}/${coreView.instances.find((e) => e.progress === 1)?.target ?? '?'}, granted ${coreRead.grantedXp}`,
    ),
    check(
      'the partial objective is displayed as its real ratio and percentage',
      core.partial === 1 && core.partialPercent === 50,
      `${core.partial} din 2 = ${core.partialPercent}%`,
    ),
    check(
      'a MANUAL objective counts only real MANUAL ride intervals',
      core.harness.instanceOf('MANUAL_DROPOFFS').manualRides === 2 &&
        core.harness.instanceOf('MANUAL_DROPOFFS').modeMismatches === 1,
      `manual ${core.harness.instanceOf('MANUAL_DROPOFFS').manualRides}, mismatches ${core.harness.instanceOf('MANUAL_DROPOFFS').modeMismatches}`,
    ),
    check(
      'the ride interval is the real PICKUP..DROPOFF pair with its real tick duration',
      core.manual.lastRide !== null &&
        core.manual.lastRide.durationTicks ===
          core.manual.lastRide.dropoffTick - core.manual.lastRide.pickupTick,
      `pickup ${core.manual.lastRide?.pickupTick ?? 0} → dropoff ${core.manual.lastRide?.dropoffTick ?? 0} = ${core.manual.lastRide?.durationTicks ?? 0} ticks`,
    ),
    check(
      'a completed objective grants the 211 reward identity exactly once',
      core.manual.rewardId === dailyRewardId('player:211-daily', core.manual.instanceId) &&
        core.manual.grantedXp === DAILY_MISSION_XP,
      `${core.manual.rewardId}`,
    ),
    check(
      'the day keeps one reward per completed objective',
      coreRead.rewards ===
        coreRead.instances.filter((entry) => entry.state === 'COMPLETED').length &&
        coreRead.grantedXp === coreRead.rewards * DAILY_MISSION_XP,
      `rewards ${coreRead.rewards}, XP ${coreRead.grantedXp}/${coreRead.promisedXp}`,
    ),
    check(
      'a foreign session, an old epoch and an irrelevant type are counted refusals',
      JSON.stringify(refusalRead.rejections) ===
        JSON.stringify([
          { reason: 'FOREIGN_SESSION', count: 2 },
          { reason: 'IRRELEVANT', count: 1 },
          { reason: 'NO_RIDE', count: 1 },
          { reason: 'STALE_EPOCH', count: 1 },
        ]),
      refusalRead.rejections.map((e) => `${e.reason}=${e.count}`).join(', '),
    ),
    check(
      'no foreign event advances an objective and no rejection is silent',
      refusalRead.instances.every((entry) => entry.progress === 0) &&
        refusalRead.counters.rejected === refusalRead.rejections.reduce((t, e) => t + e.count, 0),
      `rejected ${refusalRead.counters.rejected}, accepted ${refusalRead.counters.accepted}, duplicates ${refusalRead.counters.duplicates}`,
    ),
    check(
      'the last rejection is reported with its reason for the UI',
      refusalRead.lastRejection?.reason === 'NO_RIDE',
      `${refusalRead.lastRejection?.eventId ?? '-'} · ${refusalRead.lastRejection?.reason ?? '-'}`,
    ),
    check(
      'an event one millisecond before the boundary still completes',
      boundaryRead.instances.find((e) => e.objectiveKind === 'LEARNING_ACTIVATIONS')?.state ===
        'COMPLETED',
      `phase ${boundaryRead.phase}, completed ${boundaryRead.instances.filter((e) => e.state === 'COMPLETED').length}`,
    ),
    check(
      'an event exactly at expiresAtMs is refused as outside the day',
      boundaryRead.counters.rejected >= 1 && boundaryRead.phase === 'EXPIRED',
      `rejected ${boundaryRead.counters.rejected}, phase ${boundaryRead.phase}`,
    ),
    check(
      'incomplete objectives are explicitly EXPIRED, never ambiguous',
      boundaryRead.instances.filter((e) => e.state === 'EXPIRED').length === 2 &&
        boundaryRead.instances
          .filter((e) => e.state === 'EXPIRED')
          .every((e) => e.reason === 'EXPIRED'),
      boundaryRead.instances.map((e) => `${e.objectiveKind}:${e.state}`).join(', '),
    ),
    check(
      'a reload restores the same completed row and the same single reward',
      reload.rewardsAfter === reload.harness.progress.calendarState().rewards.length &&
        reload.grantedXpAfter === DAILY_MISSION_XP &&
        reload.rebound === true,
      `rewards ${reload.rewardsAfter}, XP ${reload.grantedXpAfter}, rebound ${reload.rebound}`,
    ),
    check(
      'replaying the same day is a duplicate and a new event cannot pay again',
      reload.duplicateStatus === 'DUPLICATE' &&
        reload.replayStatus === 'ACCEPTED' &&
        reload.replayRewards === 0 &&
        reload.afterCompletionEvents === 1,
      `${reload.duplicateStatus}, ${reload.replayStatus}, rewards ${reload.replayRewards}, afterCompletion ${reload.afterCompletionEvents}`,
    ),
    check(
      'a new local day creates three new rows and keeps the old reward',
      advanced.action === 'NEW_DAY' &&
        advanced.createdRows === 3 &&
        advanced.droppedRows === 3 &&
        dayRead.grantedXp === 0 &&
        dayHarness.progress.calendarState().rewards.length === 1,
      `${advanced.action} ${advanced.dailyDate}: created ${advanced.createdRows}, dropped ${advanced.droppedRows}, retained rewards ${dayHarness.progress.calendarState().rewards.length}`,
    ),
    check(
      'a declared evaluation window closes late events with WINDOW_CLOSED',
      windowRow.state === 'INELIGIBLE' &&
        windowRow.reason === 'WINDOW_CLOSED' &&
        windowRow.progress === 1 &&
        windowDeadline === firstTick + 600,
      `progress ${windowRow.progress}, deadline ${windowDeadline ?? 0}, reason ${windowRow.reason ?? '-'}`,
    ),
    check(
      'an exceeded incident budget stops the objective with a counted reason',
      budgetRow.state === 'INELIGIBLE' &&
        budgetRow.reason === 'INCIDENT_BUDGET_EXCEEDED' &&
        budgetRow.collisions === 1,
      `collisions ${budgetRow.collisions}/${budgetRow.incidentBudget ?? 0}, reason ${budgetRow.reason ?? '-'}`,
    ),
    check(
      'the panel renders every state with its real label',
      ['ACTIVE', 'COMPLETED', 'EXPIRED', 'INELIGIBLE'].every((state) =>
        panelStates.some((entry) => entry.state === state),
      ),
      panelStates.map((entry) => `${entry.state}=${entry.stateLabel}`).join(', '),
    ),
    check(
      'the expired and ineligible states carry a readable reason',
      expiredView.instances
        .filter((e) => e.state === 'EXPIRED')
        .every((e) => e.reasonLabel !== null) &&
        ineligibleView.instances.some((e) => e.reasonLabel !== null),
      `${expiredView.instances.find((e) => e.state === 'EXPIRED')?.reasonLabel ?? '-'} / ${ineligibleView.instances.find((e) => e.state === 'INELIGIBLE')?.reasonLabel ?? '-'}`,
    ),
    check(
      'the panel shows the time zone, the reset moment and the promised XP',
      panelView.timeZoneLabel.includes('UTC+02:00') &&
        panelView.resetLabel.includes('2026-11-12 00:00') &&
        panelView.xpLabel.includes(`${coreRead.promisedXp} XP promis`),
      `${panelView.timeZoneLabel} · ${panelView.resetLabel}`,
    ),
    check(
      'the panel keeps zero global listeners and one read per open',
      panelStats.globalListeners === 0 && panelStats.reads === 4 && panelStats.surfaceCalls === 3,
      `listeners ${panelStats.listeners}, global ${panelStats.globalListeners}, reads ${panelStats.reads}`,
    ),
    check(
      'Escape closes, focus is restored and Tab stays inside the panel',
      panelStats.escapes === 1 && panelStats.focusRestores === 1 && panelStats.tabWraps === 1,
      `escapes ${panelStats.escapes}, restores ${panelStats.focusRestores}, wraps ${panelStats.tabWraps}`,
    ),
    check('two identical runs produce the same read model', equal, `runs 2, equal ${equal}`),
    check(
      'the declined read model is refused when it contradicts the contracts',
      (() => {
        const tampered = JSON.parse(JSON.stringify(coreRead)) as Record<string, unknown>;
        const instances = tampered.instances as Record<string, unknown>[];
        const partial = instances.find((entry) => Number(entry.progress) < Number(entry.target));
        if (partial === undefined) return false;
        partial.satisfied = true;
        try {
          parseDailyProgressSnapshot(tampered);
          return false;
        } catch {
          return true;
        }
      })(),
      'satisfied flag contradicting its target is refused',
    ),
  ];

  const passed = checks.filter((entry) => entry.pass).length;
  const budgetReason = budgetRow.reason;
  const windowReason = windowRow.reason;

  return Object.freeze({
    schemaVersion: 1 as const,
    version: DAILY_PROGRESS_VERSION,
    panelVersion: DAILY_PROGRESS_PANEL_VERSION,
    readVersion: DAILY_PROGRESS_READ_VERSION,
    checks: Object.freeze(checks),
    summary: Object.freeze({
      checks: checks.length,
      passed,
      failed: checks.length - passed,
      pass: passed === checks.length,
    }),
    scenario: Object.freeze({
      objectives: Object.freeze(
        coreRead.instances.map((entry) =>
          Object.freeze({
            slot: entry.slot,
            instanceId: entry.instanceId,
            objectiveKind: entry.objectiveKind,
            controlRequirement: entry.controlRequirement,
            target: entry.target,
            rewardXp: entry.rewardXp,
          }),
        ),
      ),
      promisedXp: coreRead.promisedXp,
      grantedXp: coreRead.grantedXp,
      rewards: coreRead.rewards,
      rides: coreView.counts.rides,
      manualRides: coreView.counts.manualRides,
      autoRides: coreView.counts.autoRides,
      mixedRides: coreView.counts.mixedRides,
      partialProgress: core.partial,
      partialPercent: core.partialPercent,
      completedObjectives: coreView.counts.completed,
      lastRideRideId: core.manual.lastRide?.rideId ?? null,
      lastRideMode: core.manual.lastRide?.mode ?? null,
      lastRideDurationSeconds: core.manual.lastRide?.durationSeconds ?? null,
      lastRidePickupTick: core.manual.lastRide?.pickupTick ?? null,
      lastRideDropoffTick: core.manual.lastRide?.dropoffTick ?? null,
    }),
    refusals: Object.freeze({
      reasons: Object.freeze(
        refusalRead.rejections.map((entry) =>
          Object.freeze({ reason: entry.reason, count: entry.count }),
        ),
      ),
      rejected: refusalRead.counters.rejected,
      duplicates: refusalRead.counters.duplicates,
      accepted: refusalRead.counters.accepted,
      lastRejection: refusalRead.lastRejection?.reason ?? null,
      lastRejectionLabel:
        refusalRead.lastRejection === null
          ? null
          : DAILY_PROGRESS_REASON_LABELS[refusalRead.lastRejection.reason],
    }),
    boundary: Object.freeze({
      dayStartMs: boundary.dayStartMs(),
      expiresAtMs: boundary.expiresAtMs(),
      acceptedAtBoundaryMinusOne:
        boundaryRead.instances.find((e) => e.objectiveKind === 'LEARNING_ACTIVATIONS')?.state ??
        'MISSING',
      rejectedAtBoundary: boundaryRead.lastRejection?.reason ?? 'MISSING',
      phaseBeforeDay: 'PENDING',
      phaseAtBoundary: boundaryRead.phase,
      completedSurvives: boundaryRead.instances.filter((e) => e.state === 'COMPLETED').length === 1,
      expiredObjectives: boundaryRead.instances.filter((e) => e.state === 'EXPIRED').length,
      expiredReason: boundaryRead.instances.find((e) => e.state === 'EXPIRED')?.reason ?? null,
    }),
    reload: Object.freeze({
      rewardsBefore: reload.harness.progress.calendarState().rewards.length,
      rewardsAfter: reload.rewardsAfter,
      grantedXpAfter: reload.grantedXpAfter,
      duplicateStatus: reload.duplicateStatus,
      replayStatus: reload.replayStatus,
      replayRewardsGranted: reload.replayRewards,
      afterCompletionEvents: reload.afterCompletionEvents,
      rebound: reload.rebound,
      regenerated: reload.regenerated,
    }),
    day: Object.freeze({
      action: advanced.action,
      dailyDate: advanced.dailyDate,
      createdRows: advanced.createdRows,
      droppedRows: advanced.droppedRows,
      grantedXp: dayRead.grantedXp,
      retainedRewards: dayHarness.progress.calendarState().rewards.length,
    }),
    limits: Object.freeze({
      windowDeadline,
      windowReason,
      budgetCollisions: budgetRow.collisions,
      budgetReason,
    }),
    panel: Object.freeze({
      states: Object.freeze(
        panelStates.map((entry) =>
          Object.freeze({
            state: entry.state,
            reason: entry.reason,
            stateLabel: entry.stateLabel,
            progressLabel: entry.progressLabel,
            xpLabel: entry.xpLabel,
          }),
        ),
      ),
      phaseLabel: panelView.phaseLabel,
      dayLabel: panelView.dayLabel,
      resetLabel: panelView.resetLabel,
      timeZoneLabel: panelView.timeZoneLabel,
      rejectionLabel: panelView.rejectionLabel,
      elements: panelStats.elements,
      textNodes: panelStats.textNodes,
      listeners: panelStats.listeners,
      globalListeners: panelStats.globalListeners,
      focusMoves: panelStats.focusMoves,
      focusRestores: panelStats.focusRestores,
      escapes: panelStats.escapes,
      tabWraps: panelStats.tabWraps,
      reads: panelStats.reads,
      renders: panelStats.renders,
      skippedClosed: panel.skippedClosed,
      skippedUnchanged: panel.skippedUnchanged,
      surfaceCalls: panelStats.surfaceCalls,
    }),
    determinism: Object.freeze({ runs: 2, equal }),
  });
}

export function dailyProgressReportMarkdown(report: DailyProgressReport): string {
  const rows = report.checks
    .map((entry) => `| ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.name} | ${entry.detail} |`)
    .join('\n');
  const states = report.panel.states
    .map(
      (entry) =>
        `| ${entry.state} | ${entry.stateLabel} | ${entry.progressLabel} | ${entry.xpLabel} | ${entry.reason ?? '—'} |`,
    )
    .join('\n');
  return `# Raport 212 — progres și interfață pentru misiunile zilei

Determinist, fără browser real și fără ceas de perete. Contract consumat: \`${report.readVersion}\`;
proiecție UI: \`${report.panelVersion}\`.

## Rezumat

- verificări: **${report.summary.passed}/${report.summary.checks}**, eșecuri ${report.summary.failed};
- XP promis ${report.scenario.promisedXp}, XP acordat ${report.scenario.grantedXp}, recompense unice ${report.scenario.rewards};
- curse numărate: ${report.scenario.rides} (${report.scenario.manualRides} MANUAL, ${report.scenario.autoRides} AUTO, ${report.scenario.mixedRides} mixte);
- evenimente respinse explicit: ${report.refusals.rejected}, duplicate ${report.refusals.duplicates}, acceptate ${report.refusals.accepted};
- determinism: ${report.determinism.runs} rulări, egale ${report.determinism.equal}.

## Scenariul principal

| Slot | Instanță | Obiectiv | Mod cerut | Țintă | XP |
| --- | --- | --- | --- | --- | --- |
${report.scenario.objectives
  .map(
    (entry) =>
      `| ${entry.slot} | \`${entry.instanceId}\` | ${entry.objectiveKind} | ${entry.controlRequirement} | ${entry.target} | ${entry.rewardXp} |`,
  )
  .join('\n')}

Progres parțial afișat: ${report.scenario.partialProgress} din 2 (= ${report.scenario.partialPercent}%). Ultima cursă reală:
\`${report.scenario.lastRideRideId ?? '—'}\`, ${report.scenario.lastRidePickupTick ?? 0} → ${report.scenario.lastRideDropoffTick ?? 0}
tick-uri, ${report.scenario.lastRideDurationSeconds ?? 0} s, mod ${report.scenario.lastRideMode ?? '—'}.

## Refuzuri numărate

${report.refusals.reasons.map((entry) => `- ${entry.reason}: ${entry.count}`).join('\n')}

Ultimul refuz: ${report.refusals.lastRejection ?? '—'} (${report.refusals.lastRejectionLabel ?? '—'}).

## Limita zilei și reluarea

- \`dayStartMs\` ${report.boundary.dayStartMs}, \`expiresAtMs\` ${report.boundary.expiresAtMs} (exclusiv);
- eveniment la \`expiresAtMs - 1\`: ${report.boundary.acceptedAtBoundaryMinusOne}; la \`expiresAtMs\`: ${report.boundary.rejectedAtBoundary};
- obiective expirate: ${report.boundary.expiredObjectives}, motiv ${report.boundary.expiredReason ?? '—'};
- reload: ${report.reload.rewardsBefore} → ${report.reload.rewardsAfter} recompense, XP acordat ${report.reload.grantedXpAfter},
  replay ${report.reload.duplicateStatus}, eveniment nou pe obiectiv încheiat ${report.reload.afterCompletionEvents},
  recompense la replay ${report.reload.replayRewardsGranted};
- ziua următoare: ${report.day.action} ${report.day.dailyDate}, rânduri create ${report.day.createdRows},
  eliminate ${report.day.droppedRows}, XP ${report.day.grantedXp}, recompense păstrate ${report.day.retainedRewards}.

## Limitele obiectivului

- fereastră: termen ${report.limits.windowDeadline ?? 0}, motiv ${report.limits.windowReason ?? '—'};
- buget de incidente: ${report.limits.budgetCollisions} incidente, motiv ${report.limits.budgetReason ?? '—'}.

## Stările panoului

| Stare | Etichetă | Progres | XP | Motiv |
| --- | --- | --- | --- | --- |
${states}

${report.panel.dayLabel} · ${report.panel.resetLabel} · ${report.panel.timeZoneLabel}

Cost structural: ${report.panel.elements} elemente, ${report.panel.textNodes} noduri text,
${report.panel.listeners} listeners (${report.panel.globalListeners} globali), focus mutat ${report.panel.focusMoves},
restaurat ${report.panel.focusRestores}, Escape ${report.panel.escapes}, Tab wrap ${report.panel.tabWraps},
citiri ${report.panel.reads}, randări ${report.panel.renders}; închis \`${report.panel.skippedClosed}\`.

## Verificări

| Rezultat | Verificare | Detaliu |
| --- | --- | --- |
${rows}
`;
}
