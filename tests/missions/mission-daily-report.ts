import {
  DAILY_DAY_LENGTHS,
  DAILY_LIMITS,
  DAILY_MISSION_XP,
  DAILY_MISSIONS_PER_DAY,
  DAILY_SCHEMA_VERSION,
  DAILY_TEMPLATE_CATALOG_VERSION,
  advanceDailyCalendar,
  createDailyCalendarState,
  createDailyTemplateCatalog,
  dailyCalendarContinuity,
  dailyCapabilities,
  dailyCapabilityGaps,
  dailyClockActions,
  dailyMissionSetOrdered,
  dailyRewardFor,
  dailySetPhase,
  generateDailyMissionSet,
  parseDailyMissionSet,
  recordDailyReward,
  resolveDailyCalendarDay,
} from '../../src/missions';
import type { DailyCalendarState, DailyMissionSet, DailyTemplateCatalog } from '../../src/missions';
import {
  DAILY_FIXTURE_PLAYER,
  calendarInput,
  dailyInstant,
  fullCapabilities,
  minimalCapabilities,
  step,
} from './mission-daily-fixture';

/**
 * Deterministic report for PBI 211.
 *
 * No wall clock, no browser and no random source participate: every instant is derived from a local
 * date and a real UTC offset, and every random decision of the generator is seeded by the day.
 */
export const MISSION_DAILY_REPORT_VERSION = '211-mission-daily-report-v1' as const;

export interface MissionDailyReportCheck {
  readonly name: string;
  readonly expected: string | number | boolean | null;
  readonly actual: string | number | boolean | null;
  readonly pass: boolean;
  readonly detail: string;
}

export interface MissionDailyReportDay {
  readonly dailyDate: string;
  readonly seed: number;
  readonly signature: string;
  readonly families: readonly string[];
  readonly targets: readonly number[];
  readonly zones: readonly (string | null)[];
  readonly difficulties: readonly string[];
  readonly manualInstances: number;
  readonly learningInstances: number;
  readonly learningKeys: readonly (string | null)[];
  readonly instanceIds: readonly string[];
  readonly dayStartMs: number;
  readonly expiresAtMs: number;
  readonly windowHours: number;
}

export interface MissionDailyReportRun {
  readonly name: string;
  readonly detail: string;
  readonly days: readonly MissionDailyReportDay[];
  readonly numbers: Readonly<Record<string, number | string | boolean | null>>;
}

export interface MissionDailyReport {
  readonly version: typeof MISSION_DAILY_REPORT_VERSION;
  readonly contract: Readonly<{
    schema: string;
    missionsPerDay: number;
    missionXp: number;
    dayLengths: readonly number[];
    capabilityGaps: readonly string[];
    clockActions: readonly string[];
    generatorAttempts: number;
    retainedSets: number;
    templateCatalogVersion: string;
    templateFamilies: readonly string[];
  }>;
  readonly runs: readonly MissionDailyReportRun[];
  readonly checks: readonly MissionDailyReportCheck[];
  readonly summary: Readonly<{
    runs: number;
    checks: number;
    passed: number;
    pass: boolean;
  }>;
}

function check(
  name: string,
  expected: string | number | boolean | null,
  actual: string | number | boolean | null,
  detail: string,
): MissionDailyReportCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

/** A lower-bound assertion for a measured count that legitimately varies with the day's draw. */
function checkAtLeast(
  name: string,
  minimum: number,
  actual: number,
  detail: string,
): MissionDailyReportCheck {
  return Object.freeze({
    name,
    expected: `>= ${minimum}`,
    actual,
    pass: actual >= minimum,
    detail,
  });
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function summaryOf(set: DailyMissionSet): MissionDailyReportDay {
  const ordered = dailyMissionSetOrdered(set);
  return Object.freeze({
    dailyDate: set.dailyDate,
    seed: set.seed,
    signature: set.signature,
    families: Object.freeze(ordered.map((entry) => entry.familyId)),
    targets: Object.freeze(ordered.map((entry) => entry.target)),
    zones: Object.freeze(ordered.map((entry) => entry.zone)),
    difficulties: Object.freeze(ordered.map((entry) => entry.difficulty)),
    manualInstances: ordered.filter((entry) => entry.allowsManual && entry.learningKey === null)
      .length,
    learningInstances: ordered.filter((entry) => entry.controlRequirement === 'LEARNING').length,
    learningKeys: Object.freeze(ordered.map((entry) => entry.learningKey)),
    instanceIds: Object.freeze(ordered.map((entry) => entry.instanceId)),
    dayStartMs: set.dayStartMs,
    expiresAtMs: set.expiresAtMs,
    windowHours: round((set.expiresAtMs - set.dayStartMs) / 3_600_000, 6),
  });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
/** Two families with three target options each: a small catalog with a deterministic fallback. */
function smallCatalog(): DailyTemplateCatalog {
  const base = createDailyTemplateCatalog().families;
  return {
    schemaVersion: 1,
    units: 'SI',
    version: 'report-small-v1',
    families: [
      base.find((family) => family.familyId === 'daily-manual-service')!,
      base.find((family) => family.familyId === 'daily-stop-discipline')!,
    ],
  };
}

function consecutiveScenario(): MissionDailyReportRun {
  const days = ['2026-11-09', '2026-11-10', '2026-11-11'];
  let state: DailyCalendarState = createDailyCalendarState(
    DAILY_FIXTURE_PLAYER,
    'Europe/Bucharest',
  );
  const sets: DailyMissionSet[] = [];
  for (const day of days) {
    const result = step({ state, calendar: calendarInput(day), capabilities: fullCapabilities() });
    state = result.state;
    sets.push(result.set!);
  }
  const signatures = sets.map((entry) => entry.signature);
  const instanceIds = sets.flatMap((entry) => entry.instances.map((item) => item.instanceId));
  const seeds = sets.map((entry) => entry.seed);
  const variants = new Set(
    sets.flatMap((entry) =>
      entry.instances.map((item) => `${item.familyId}|${item.target}|${item.zone ?? '-'}`),
    ),
  );
  const continuity = sets
    .slice(1)
    .map((entry, index) => dailyCalendarContinuity(sets[index]!, entry));
  const manualPerDay = sets.map(
    (set) =>
      set.instances.filter((entry) => entry.allowsManual && entry.learningKey === null).length,
  );
  return Object.freeze({
    name: 'consecutive-days',
    detail: 'three consecutive local days, same player, same capabilities',
    days: Object.freeze(sets.map(summaryOf)),
    numbers: Object.freeze({
      days: sets.length,
      instances: instanceIds.length,
      distinctInstances: new Set(instanceIds).size,
      distinctSignatures: new Set(signatures).size,
      distinctSeeds: new Set(seeds).size,
      distinctVariants: variants.size,
      manualInstances: manualPerDay.reduce((total, count) => total + count, 0),
      minManualPerDay: Math.min(...manualPerDay),
      contiguityGaps: continuity.filter((entry) => !entry.contiguous).length,
      maxGapMs: Math.max(...continuity.map((entry) => Math.abs(entry.gapMs))),
    }),
  });
}

function sameDayScenario(): MissionDailyReportRun {
  const first = step({ calendar: calendarInput('2026-11-11', { hour: 9 }) });
  const set = first.set!;
  const bytes = JSON.stringify(set);
  const reloadedSet = parseDailyMissionSet(clone(set));
  const reloaded = advanceDailyCalendar({
    state: clone(first.state),
    playerId: DAILY_FIXTURE_PLAYER,
    calendar: calendarInput('2026-11-11', { hour: 23, minute: 59, second: 59, millisecond: 999 }),
    capabilities: fullCapabilities(),
    generatedAtMs: set.expiresAtMs - 1,
  });
  const unlocked = dailyCapabilities({
    learningKeys: ['speed_delta_urban', 'following_time_headway'],
    zones: ['zone:airport', 'zone:center', 'zone:suburb'],
    vehicleClasses: ['compact', 'sedan'],
    controlModes: ['AUTO', 'LEARNING', 'MANUAL'],
    campaignCompleted: ['campaign-1-first-taxi', 'campaign-2-first-demonstration'],
    unlocks: ['challenge:first-demonstration', 'analysis:learning-review'],
  });
  const unlockedStep = advanceDailyCalendar({
    state: reloaded.state,
    playerId: DAILY_FIXTURE_PLAYER,
    calendar: calendarInput('2026-11-11', { hour: 20 }),
    capabilities: unlocked,
    generatedAtMs: set.expiresAtMs,
  });
  const otherPlayer = advanceDailyCalendar({
    state: null,
    playerId: 'player:211-second-profile',
    calendar: calendarInput('2026-11-11', { hour: 12 }),
    capabilities: fullCapabilities(),
    generatedAtMs: dailyInstant('2026-11-11', 7_200),
  });
  const numbers = {
    reloadedBytesEqual: JSON.stringify(reloadedSet) === bytes,
    sameDayAction: reloaded.action,
    sameDayRegenerated: reloaded.regenerated,
    sameDayBytesEqual: JSON.stringify(reloaded.set) === bytes,
    generatedAtMs: reloaded.set!.generatedAtMs,
    originalGeneratedAtMs: set.generatedAtMs,
    setsAfterSameDay: reloaded.state.sets.length,
    capabilityDrift: reloaded.capabilityDrift,
    unlockBytesEqual: JSON.stringify(unlockedStep.set) === bytes,
    unlockAction: unlockedStep.action,
    unlockDrift: unlockedStep.capabilityDrift,
    setsAfterUnlock: unlockedStep.state.sets.length,
    otherPlayerInstances: otherPlayer.set!.instances.length,
    sharedInstanceIds: otherPlayer.set!.instances.filter((entry) =>
      set.instances.some((current) => current.instanceId === entry.instanceId),
    ).length,
  };
  return Object.freeze({
    name: 'same-day-resume',
    detail:
      'generate once, reload, resume at 23:59:59.999 and unlock a capability: the retained set never changes',
    days: Object.freeze([summaryOf(set)]),
    numbers: Object.freeze(numbers),
  });
}

function smallCatalogScenario(): MissionDailyReportRun {
  const capabilities = minimalCapabilities();
  const set = generateDailyMissionSet({
    playerId: DAILY_FIXTURE_PLAYER,
    calendar: calendarInput('2026-11-11'),
    capabilities,
    generatedAtMs: dailyInstant('2026-11-11', 7_200),
    templateCatalog: smallCatalog(),
  });
  const defaultSet = step({ calendar: calendarInput('2026-11-11'), capabilities }).set!;
  const variants = new Set(
    set.instances.map((entry) => `${entry.familyId}|${entry.target}|${entry.zone ?? '-'}`),
  );
  return Object.freeze({
    name: 'small-catalog',
    detail:
      'a lean snapshot (no learning key, no zone, no campaign progress) with the delivered catalog and with a two-family catalog',
    days: Object.freeze([summaryOf(set), summaryOf(defaultSet)]),
    numbers: Object.freeze({
      instances: set.instances.length,
      distinctInstances: new Set(set.instances.map((entry) => entry.instanceId)).size,
      distinctVariants: variants.size,
      fallbacks: set.fallbacks,
      manualInstances: set.instances.filter(
        (entry) => entry.allowsManual && entry.learningKey === null,
      ).length,
      learningInstances: set.instances.filter((entry) => entry.controlRequirement === 'LEARNING')
        .length,
      capabilityGaps: [...set.capabilityGaps].join(','),
      excludedFamilies: [...set.excludedFamilies].join(','),
      templateCatalogVersion: set.templateCatalogVersion,
      defaultCatalogInstances: defaultSet.instances.length,
      defaultCatalogExcluded: [...defaultSet.excludedFamilies].join(','),
      defaultCatalogZonesNull: defaultSet.instances.filter((entry) => entry.zone === null).length,
    }),
  });
}

function midnightScenario(): MissionDailyReportRun {
  const set = step({ calendar: calendarInput('2026-11-11') }).set!;
  const beforeBoundary = dailySetPhase(set, set.expiresAtMs - 1);
  const atBoundary = dailySetPhase(set, set.expiresAtMs);
  const next = resolveDailyCalendarDay(calendarInput('2026-11-12', { atMs: set.expiresAtMs }));
  const first = step({ calendar: calendarInput('2026-11-11') });
  const midnight = advanceDailyCalendar({
    state: first.state,
    playerId: DAILY_FIXTURE_PLAYER,
    calendar: calendarInput('2026-11-12', { atMs: set.expiresAtMs }),
    capabilities: fullCapabilities(),
    generatedAtMs: set.expiresAtMs,
  });
  const continuity = dailyCalendarContinuity(set, midnight.set!);
  return Object.freeze({
    name: 'midnight',
    detail: 'the expiry boundary is exclusive and generates exactly one next-day set',
    days: Object.freeze([summaryOf(set), summaryOf(midnight.set!)]),
    numbers: Object.freeze({
      windowHours: round((set.expiresAtMs - set.dayStartMs) / 3_600_000, 6),
      phaseBeforeBoundary: beforeBoundary,
      phaseAtBoundary: atBoundary,
      nextDate: next.dailyDate,
      nextStartEqualsExpiry: next.dayStartMs === set.expiresAtMs,
      action: midnight.action,
      skippedDays: midnight.skippedDays,
      sets: midnight.state.sets.length,
      expiredSets: midnight.state.counters.expiredSets,
      gapMs: continuity.gapMs,
      contiguous: continuity.contiguous,
    }),
  });
}

function clockScenario(): MissionDailyReportRun {
  const spring = step({
    calendar: calendarInput('2026-03-29', {
      utcOffsetSeconds: 7_200,
      dayLengthSeconds: 82_800,
      hour: 12,
    }),
  }).set!;
  const springNext = step({
    calendar: calendarInput('2026-03-30', {
      utcOffsetSeconds: 10_800,
      dayLengthSeconds: 86_400,
      hour: 12,
    }),
  }).set!;
  const fall = step({
    calendar: calendarInput('2026-10-25', {
      utcOffsetSeconds: 10_800,
      dayLengthSeconds: 90_000,
      hour: 12,
    }),
  }).set!;
  const fallNext = step({
    calendar: calendarInput('2026-10-26', {
      utcOffsetSeconds: 7_200,
      dayLengthSeconds: 86_400,
      hour: 12,
    }),
  }).set!;

  const state = (() => {
    let current: DailyCalendarState = createDailyCalendarState(
      DAILY_FIXTURE_PLAYER,
      'Europe/Bucharest',
    );
    for (const day of ['2026-11-10', '2026-11-11'])
      current = step({ state: current, calendar: calendarInput(day) }).state;
    return current;
  })();
  const rewardedInstance = state.sets[0]!.instances[0]!.instanceId;
  const grant = recordDailyReward({
    state,
    instanceId: rewardedInstance,
    grantedAtMs: dailyInstant('2026-11-10', 7_200, 18),
  });
  const rollback = advanceDailyCalendar({
    state: grant.state,
    playerId: DAILY_FIXTURE_PLAYER,
    calendar: calendarInput('2026-11-10', { hour: 8 }),
    capabilities: fullCapabilities(),
    generatedAtMs: dailyInstant('2026-11-10', 7_200, 8),
  });
  const duplicate = recordDailyReward({
    state: rollback.state,
    instanceId: rewardedInstance,
    grantedAtMs: dailyInstant('2026-11-10', 7_200, 9),
  });
  const jump = advanceDailyCalendar({
    state: duplicate.state,
    playerId: DAILY_FIXTURE_PLAYER,
    calendar: calendarInput('2026-11-15', { hour: 9 }),
    capabilities: fullCapabilities(),
    generatedAtMs: dailyInstant('2026-11-15', 7_200, 9),
  });
  return Object.freeze({
    name: 'clock-changes',
    detail:
      'DST spring forward and fall back, a clock rollback and a forward jump, all on explicit instants',
    days: Object.freeze([summaryOf(spring), summaryOf(fall), summaryOf(jump.set!)]),
    numbers: Object.freeze({
      springWindowHours: round((spring.expiresAtMs - spring.dayStartMs) / 3_600_000, 6),
      springGapMs: dailyCalendarContinuity(spring, springNext).gapMs,
      fallWindowHours: round((fall.expiresAtMs - fall.dayStartMs) / 3_600_000, 6),
      fallGapMs: dailyCalendarContinuity(fall, fallNext).gapMs,
      springDailyDate: spring.dailyDate,
      fallDailyDate: fall.dailyDate,
      rollbackAction: rollback.action,
      rollbackRegenerated: rollback.regenerated,
      rollbackHighestDate: rollback.state.highestObservedDate,
      rollbackSets: rollback.state.sets.length,
      rollbackRewardRetained: dailyRewardFor(rollback.state, rewardedInstance) !== null,
      duplicateGrant: duplicate.duplicate,
      duplicateGranted: duplicate.granted,
      rewardsAfterRollback: duplicate.state.rewards.length,
      jumpAction: jump.action,
      jumpSkippedDays: jump.skippedDays,
      jumpSets: jump.state.sets.length,
      jumpRewards: jump.state.rewards.length,
      jumpForwardJumps: jump.state.counters.forwardJumps,
      jumpDates: jump.state.sets.map((entry) => entry.dailyDate).join(','),
    }),
  });
}

export function runMissionDailyReport(): MissionDailyReport {
  const consecutive = consecutiveScenario();
  const sameDay = sameDayScenario();
  const small = smallCatalogScenario();
  const midnight = midnightScenario();
  const clock = clockScenario();
  const catalog = createDailyTemplateCatalog();
  const runs = [consecutive, sameDay, small, midnight, clock];
  const checks: MissionDailyReportCheck[] = [];

  checks.push(
    check('contract-schema', DAILY_SCHEMA_VERSION, '211-mission-daily-v1', 'daily mission schema'),
    check('missions-per-day', 3, DAILY_MISSIONS_PER_DAY, 'exactly three missions each day'),
    check('mission-xp', 100, DAILY_MISSION_XP, 'XP proposal of Docs/23'),
    check('day-lengths', '82800,86400,90000', DAILY_DAY_LENGTHS.join(','), '23 h, 24 h, 25 h'),
    check(
      'capability-gaps',
      'LEARNING_KEYS,LEARNING_MODE,CAMPAIGN_PROGRESS,ZONES',
      [...dailyCapabilityGaps].join(','),
      'closed capability gaps',
    ),
    check(
      'clock-actions',
      'NEW_DAY,SAME_DAY,ROLLBACK,FORWARD_JUMP',
      [...dailyClockActions].join(','),
      'closed calendar decisions',
    ),
    check('generator-attempts', 8, DAILY_LIMITS.generatorAttempts, 'bounded anti-repeat attempts'),
    check('retained-sets', 32, DAILY_LIMITS.retainedSets, 'bounded per-player history'),
    check(
      'template-catalog',
      '211-daily-templates-v1',
      DAILY_TEMPLATE_CATALOG_VERSION,
      'delivered versioned catalog',
    ),
    check('template-families', 6, catalog.families.length, 'delivered V1 families'),
  );

  checks.push(
    check('consecutive-days', 3, consecutive.numbers.days, 'local days generated in a row'),
    check('consecutive-instances', 9, consecutive.numbers.instances, 'three per day'),
    check(
      'consecutive-distinct-instances',
      9,
      consecutive.numbers.distinctInstances,
      'instance identity includes the local date',
    ),
    check(
      'consecutive-distinct-signatures',
      3,
      consecutive.numbers.distinctSignatures,
      'no two days share a content signature',
    ),
    check(
      'consecutive-distinct-seeds',
      3,
      consecutive.numbers.distinctSeeds,
      'seed includes the day',
    ),
    checkAtLeast(
      'consecutive-distinct-variants',
      6,
      consecutive.numbers.distinctVariants as number,
      'distinct family/target/zone variants across three days; signatures are always distinct',
    ),
    checkAtLeast(
      'consecutive-manual-instances',
      3,
      consecutive.numbers.manualInstances as number,
      'MANUAL objectives without learning: at least one per day',
    ),
    checkAtLeast(
      'consecutive-manual-minimum',
      1,
      consecutive.numbers.minManualPerDay as number,
      'the smallest daily count of MANUAL objectives',
    ),
    check(
      'consecutive-contiguity',
      0,
      consecutive.numbers.contiguityGaps,
      'days tile the local calendar without gaps',
    ),
  );

  checks.push(
    check(
      'reload-bytes',
      true,
      sameDay.numbers.reloadedBytesEqual,
      'saved set parses to same bytes',
    ),
    check('same-day-action', 'SAME_DAY', sameDay.numbers.sameDayAction, 'resume inside the day'),
    check('same-day-regenerated', false, sameDay.numbers.sameDayRegenerated, 'no regeneration'),
    check(
      'same-day-bytes',
      true,
      sameDay.numbers.sameDayBytesEqual,
      'retained set is authoritative',
    ),
    check(
      'same-day-generated-at',
      sameDay.numbers.originalGeneratedAtMs,
      sameDay.numbers.generatedAtMs,
      'generation instant is preserved',
    ),
    check('same-day-sets', 1, sameDay.numbers.setsAfterSameDay, 'a refresh adds no set'),
    check('same-day-drift', false, sameDay.numbers.capabilityDrift, 'capabilities did not change'),
    check(
      'unlock-bytes',
      true,
      sameDay.numbers.unlockBytesEqual,
      'a later unlock does not rerandomise the day',
    ),
    check('unlock-action', 'SAME_DAY', sameDay.numbers.unlockAction, 'same local date'),
    check('unlock-drift', true, sameDay.numbers.unlockDrift, 'the drift is reported'),
    check('unlock-sets', 1, sameDay.numbers.setsAfterUnlock, 'one set per local day'),
    check(
      'new-profile-instances',
      3,
      sameDay.numbers.otherPlayerInstances,
      'a new player gets its own three missions',
    ),
    check(
      'new-profile-no-shared-identity',
      0,
      sameDay.numbers.sharedInstanceIds,
      'player is part of the identity',
    ),
  );

  checks.push(
    check('small-instances', 3, small.numbers.instances, 'three missions still generated'),
    check(
      'small-distinct-instances',
      3,
      small.numbers.distinctInstances,
      'distinct identities in a small catalog',
    ),
    check(
      'small-distinct-variants',
      3,
      small.numbers.distinctVariants,
      'distinct family/parameter',
    ),
    check('small-fallbacks', 1, small.numbers.fallbacks, 'the third slot repeats a family'),
    check('small-manual', 3, small.numbers.manualInstances, 'MANUAL stays available'),
    check(
      'small-learning',
      0,
      small.numbers.learningInstances,
      'no learning key, no learning task',
    ),
    check(
      'small-gaps',
      'CAMPAIGN_PROGRESS,LEARNING_KEYS,LEARNING_MODE,ZONES',
      small.numbers.capabilityGaps,
      'every missing capability is named',
    ),
    check(
      'small-excluded',
      'daily-learning-demonstration,daily-service-window',
      small.numbers.defaultCatalogExcluded,
      'the delivered catalog excludes the ineligible families, not fakes them',
    ),
    check(
      'small-custom-excluded',
      0,
      String(small.numbers.excludedFamilies).length,
      'the two-family catalog has nothing left to exclude',
    ),
    check(
      'small-catalog-version',
      'report-small-v1',
      small.numbers.templateCatalogVersion,
      'the accepted catalog version is recorded',
    ),
    check(
      'small-default-zones-null',
      3,
      small.numbers.defaultCatalogZonesNull,
      'without map zones the parameter is null, never invented',
    ),
  );

  checks.push(
    check('midnight-window', 24, midnight.numbers.windowHours, 'a regular local day is 24 hours'),
    check('midnight-before', 'ACTIVE', midnight.numbers.phaseBeforeBoundary, 'last active instant'),
    check('midnight-at', 'EXPIRED', midnight.numbers.phaseAtBoundary, 'exclusive boundary'),
    check(
      'midnight-next-date',
      '2026-11-12',
      midnight.numbers.nextDate,
      'the instant is a new date',
    ),
    check(
      'midnight-next-start',
      true,
      midnight.numbers.nextStartEqualsExpiry,
      'the next day starts exactly at the expiry',
    ),
    check('midnight-action', 'NEW_DAY', midnight.numbers.action, 'one new set'),
    check('midnight-skipped', 0, midnight.numbers.skippedDays, 'no skipped day'),
    check('midnight-sets', 2, midnight.numbers.sets, 'the expired set is retained'),
    check('midnight-expired', 1, midnight.numbers.expiredSets, 'one expired set is counted'),
    check('midnight-gap', 0, midnight.numbers.gapMs, 'no gap at the boundary'),
  );

  checks.push(
    check('dst-spring-window', 23, clock.numbers.springWindowHours, '23 h local day'),
    check('dst-spring-gap', 0, clock.numbers.springGapMs, 'the spring day tiles exactly'),
    check('dst-spring-date', '2026-03-29', clock.numbers.springDailyDate, 'the local date is kept'),
    check('dst-fall-window', 25, clock.numbers.fallWindowHours, '25 h local day'),
    check('dst-fall-gap', 0, clock.numbers.fallGapMs, 'the fall day tiles exactly'),
    check('dst-fall-date', '2026-10-25', clock.numbers.fallDailyDate, 'the local date is kept'),
    check('rollback-action', 'ROLLBACK', clock.numbers.rollbackAction, 'an earlier instant'),
    check('rollback-regenerated', false, clock.numbers.rollbackRegenerated, 'no rerandomisation'),
    check(
      'rollback-highest-date',
      '2026-11-11',
      clock.numbers.rollbackHighestDate,
      'the highest observed date is not lowered',
    ),
    check('rollback-sets', 2, clock.numbers.rollbackSets, 'retained sets are kept'),
    check(
      'rollback-reward',
      true,
      clock.numbers.rollbackRewardRetained,
      'a rewarded mission is not reactivated',
    ),
    check(
      'rollback-duplicate',
      true,
      clock.numbers.duplicateGrant,
      'the second grant is a duplicate',
    ),
    check('rollback-no-grant', false, clock.numbers.duplicateGranted, 'no second XP credit'),
    check('rollback-rewards', 1, clock.numbers.rewardsAfterRollback, 'exactly one reward record'),
    check('jump-action', 'FORWARD_JUMP', clock.numbers.jumpAction, 'a clock jump forward'),
    check('jump-skipped', 3, clock.numbers.jumpSkippedDays, 'three skipped local days'),
    check('jump-sets', 3, clock.numbers.jumpSets, 'the two retained days plus the current one'),
    check(
      'jump-rewards',
      1,
      clock.numbers.jumpRewards,
      'skipped days credit no XP; the earlier real reward is retained',
    ),
    check('jump-count', 1, clock.numbers.jumpForwardJumps, 'the jump is counted'),
    check(
      'jump-dates',
      '2026-11-10,2026-11-11,2026-11-15',
      clock.numbers.jumpDates,
      'no set is invented for a skipped day',
    ),
  );

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: MISSION_DAILY_REPORT_VERSION,
    contract: Object.freeze({
      schema: DAILY_SCHEMA_VERSION,
      missionsPerDay: DAILY_MISSIONS_PER_DAY,
      missionXp: DAILY_MISSION_XP,
      dayLengths: Object.freeze([...DAILY_DAY_LENGTHS]),
      capabilityGaps: Object.freeze([...dailyCapabilityGaps]),
      clockActions: Object.freeze([...dailyClockActions]),
      generatorAttempts: DAILY_LIMITS.generatorAttempts,
      retainedSets: DAILY_LIMITS.retainedSets,
      templateCatalogVersion: DAILY_TEMPLATE_CATALOG_VERSION,
      templateFamilies: Object.freeze(catalog.families.map((family) => family.familyId)),
    }),
    runs: Object.freeze(runs),
    checks: Object.freeze(checks),
    summary: Object.freeze({
      runs: runs.length,
      checks: checks.length,
      passed,
      pass: passed === checks.length,
    }),
  });
}

const BACKTICK = '`';

function code(value: string | number | boolean | null): string {
  return `${BACKTICK}${String(value)}${BACKTICK}`;
}

function cell(value: string | number | boolean | null): string {
  return value === null ? '—' : String(value).replaceAll('|', '\\|');
}

export function missionDailyReportMarkdown(report: MissionDailyReport): string {
  const lines: string[] = [];
  lines.push(
    '# 211 daily mission generation report',
    '',
    'Machine-readable transcript: [report.json](report.json). Generated by ' +
      code('npm run missions:daily') +
      '; no wall-clock value, random source or browser state participates. Version: ' +
      code(report.version) +
      '.',
    '',
    '## Contract',
    '',
    '- Schema: ' + code(report.contract.schema) + '.',
    '- Missions per local day: ' + String(report.contract.missionsPerDay) + '.',
    '- XP per daily mission: ' + String(report.contract.missionXp) + ' (calibration proposal).',
    '- Local day lengths: ' +
      report.contract.dayLengths.map((entry) => code(entry)).join(', ') +
      '.',
    '- Clock decisions: ' +
      report.contract.clockActions.map((entry) => code(entry)).join(', ') +
      '.',
    '- Capability gaps: ' +
      report.contract.capabilityGaps.map((entry) => code(entry)).join(', ') +
      '.',
    '- Template catalog: ' +
      code(report.contract.templateCatalogVersion) +
      ' with families ' +
      report.contract.templateFamilies.map((entry) => code(entry)).join(', ') +
      '.',
    '',
    '## Days',
    '',
    '| Scenario | Date | Seed | Families | Targets | Zones | MANUAL | LEARNING | Window (h) |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...report.runs.flatMap((run) =>
      run.days.map(
        (day) =>
          `| ${run.name} | ${day.dailyDate} | ${day.seed} | ${day.families.join(', ')} | ${day.targets.join(', ')} | ${day.zones.map((entry) => entry ?? '—').join(', ')} | ${day.manualInstances} | ${day.learningInstances} | ${day.windowHours} |`,
      ),
    ),
    '',
    '## Scenario numbers',
    '',
    ...report.runs.flatMap((run) => [
      '### ' + run.name,
      '',
      run.detail + '.',
      '',
      '| Key | Value |',
      '| --- | --- |',
      ...Object.entries(run.numbers).map(([key, value]) => `| ${key} | ${cell(value)} |`),
      '',
    ]),
    '## Checks',
    '',
    '| Check | Expected | Actual | Result | Detail |',
    '| --- | --- | --- | --- | --- |',
    ...report.checks.map(
      (entry) =>
        `| ${entry.name} | ${cell(entry.expected)} | ${cell(entry.actual)} | ${
          entry.pass ? 'PASS' : 'FAIL'
        } | ${entry.detail} |`,
    ),
    '',
    '## Summary',
    '',
    '- Runs: ' + String(report.summary.runs),
    '- Checks: ' + String(report.summary.passed) + '/' + String(report.summary.checks),
    '- Overall: ' + (report.summary.pass ? 'PASS' : 'FAIL'),
    '',
    '## Limitations',
    '',
    '- Deterministic Node run: no browser, renderer or human session participates.',
    '- The caller owns the IANA zone database; the module receives the UTC offset and the real length',
    '  of the local day and never reads a system clock. DST is therefore represented by a 23 h or 25 h',
    '  day, and both are verified to tile the timeline exactly.',
    '- Daily XP is credited by the caller through the stable reward identity; this PBI does not write',
    '  the 209 KPI ledger or the PlayerProgress ledger.',
    '- Template parameters are proposals pending calibration; no FPS, GPU or hardware number is',
    '  claimed.',
    '',
  );
  return lines.join('\n');
}
