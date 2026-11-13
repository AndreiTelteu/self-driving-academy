import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DAILY_DAY_LENGTHS,
  DAILY_LIMITS,
  DAILY_MISSION_XP,
  DAILY_MISSIONS_PER_DAY,
  DAILY_SCHEMA_VERSION,
  DAILY_TEMPLATE_CATALOG_VERSION,
  advanceDailyCalendar,
  createDailyCapabilities,
  createDailyTemplateCatalog,
  dailyCalendarContinuity,
  dailyCalendarSet,
  dailyCapabilities,
  dailyCapabilityGaps,
  dailyMissionSetFamilies,
  dailyMissionSetOrdered,
  dailyRewardFor,
  dailySetExpired,
  dailySetPhase,
  generateDailyMissionSet,
  parseDailyCalendarState,
  parseDailyDate,
  parseDailyMissionSet,
  recordDailyReward,
  resolveDailyCalendarDay,
} from '../../src/missions';
import type { DailyMissionSet, DailyTemplateCatalog } from '../../src/missions';
import {
  DAILY_FIXTURE_PLAYER,
  calendarInput,
  dailyInstant,
  fullCapabilities,
  learningOnlyCapabilities,
  minimalCapabilities,
  setForDay,
  stateForDays,
  step,
} from './mission-daily-fixture';

const DAY_MS = 86_400_000;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

interface RawSet {
  signature: string;
  dayStartMs: number;
  expiresAtMs: number;
  playerId: string;
  instances: { slot: number }[];
  capabilitySnapshot: { capabilityDigest: string };
}

function rawSet(set: DailyMissionSet): RawSet {
  return JSON.parse(JSON.stringify(set)) as RawSet;
}

function refuses(action: () => unknown, pattern: RegExp): void {
  assert.throws(action, pattern);
}

function learningCatalog(version = 'test-learning-v1'): DailyTemplateCatalog {
  return {
    schemaVersion: 1,
    units: 'SI',
    version,
    families: [
      {
        familyId: 'daily-manual-service',
        version: '3',
        category: 'SKILL',
        controlRequirement: 'MANUAL',
        objectiveKind: 'MANUAL_DROPOFFS',
        learningKeyRequired: false,
        allowsManual: true,
        minCampaignMissions: 0,
        targets: [1, 2, 3],
        incidentBudgets: [null, 1],
        windowTicksOptions: [null],
        minDurationOptions: [null],
        title: 'Curse în MANUAL',
        label: 'Finalizează curse cu intervenție MANUAL',
      },
      {
        familyId: 'daily-learning-demonstration',
        version: '2',
        category: 'EXPERIMENT',
        controlRequirement: 'LEARNING',
        objectiveKind: 'LEARNING_ACTIVATIONS',
        learningKeyRequired: true,
        allowsManual: false,
        minCampaignMissions: 0,
        targets: [1, 2],
        incidentBudgets: [null],
        windowTicksOptions: [null],
        minDurationOptions: [null],
        title: 'Demonstrație LEARNING',
        label: 'Publică o versiune LEARNING pentru o cheie deja suportată',
      },
    ],
  };
}

/** Two families, three target options each: enough variants for three distinct missions. */
function smallCatalog(): DailyTemplateCatalog {
  const base = createDailyTemplateCatalog().families;
  const manual = base.find((family) => family.familyId === 'daily-manual-service')!;
  const stops = base.find((family) => family.familyId === 'daily-stop-discipline')!;
  return { schemaVersion: 1, units: 'SI', version: 'test-small-v1', families: [manual, stops] };
}

test('211 contract: three missions per local day and closed vocabularies', () => {
  assert.equal(DAILY_SCHEMA_VERSION, '211-mission-daily-v1');
  assert.equal(DAILY_MISSIONS_PER_DAY, 3);
  assert.equal(DAILY_MISSION_XP, 100);
  assert.deepEqual([...DAILY_DAY_LENGTHS], [82_800, 86_400, 90_000]);
  assert.deepEqual(
    [...dailyCapabilityGaps],
    ['LEARNING_KEYS', 'LEARNING_MODE', 'CAMPAIGN_PROGRESS', 'ZONES'],
  );
  assert.equal(DAILY_LIMITS.missionsPerDay, 3);
  assert.equal(DAILY_TEMPLATE_CATALOG_VERSION, '211-daily-templates-v1');
});

test('211 generation: same day and same inputs produce exactly the same bytes', () => {
  const first = setForDay('2026-11-11');
  const second = setForDay('2026-11-11');
  assert.deepEqual(first, second);
  assert.equal(first.dailyDate, '2026-11-11');
  assert.equal(first.seed, second.seed);
  assert.equal(first.instances.length, 3);
  assert.equal(parseDailyDate(first.dailyDate), parseDailyDate(second.dailyDate));
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.instances[0]), true);
});

test('211 generation: a different local day gets new identities and re-sampled parameters', () => {
  const days = ['2026-11-09', '2026-11-10', '2026-11-11'];
  const sets = days.map((day) => setForDay(day));
  for (const set of sets) {
    assert.equal(set.instances.length, 3);
    assert.equal(new Set(set.instances.map((entry) => entry.instanceId)).size, 3);
    assert.equal(set.distinctFromPrevious, true);
  }
  for (let index = 1; index < sets.length; index += 1) {
    const previous = sets[index - 1]!;
    const current = sets[index]!;
    assert.notEqual(current.seed, previous.seed);
    assert.notEqual(current.signature, previous.signature);
    for (const instance of previous.instances)
      assert.equal(
        current.instances.some((entry) => entry.instanceId === instance.instanceId),
        false,
        'instance identities include the local date',
      );
    assert.equal(dailyCalendarContinuity(previous, current).contiguous, true);
  }
});

test('211 generation: the three missions are distinct and one is MANUAL without learning', () => {
  for (const day of ['2026-11-11', '2026-11-12', '2026-12-01', '2027-01-31']) {
    const set = setForDay(day);
    const ordered = dailyMissionSetOrdered(set);
    assert.deepEqual(
      ordered.map((entry) => entry.slot),
      [1, 2, 3],
    );
    assert.equal(new Set(ordered.map((entry) => entry.familyId + entry.target)).size, 3);
    assert.equal(
      ordered.some((entry) => entry.allowsManual && entry.learningKey === null),
      true,
    );
    for (const entry of ordered) {
      assert.equal(entry.rewardXp, DAILY_MISSION_XP);
      assert.equal(entry.target >= 1, true);
      assert.equal(
        entry.controlRequirement === 'LEARNING' ? entry.learningKey !== null : true,
        true,
        'only a LEARNING objective names a key',
      );
      assert.equal(entry.controlRequirement === 'LEARNING' ? entry.allowsManual : false, false);
    }
    assert.equal(dailyMissionSetFamilies(set).length, 3);
  }
});

test('211 learning: the LEARNING objective names an implemented 092 key and requires LEARNING', () => {
  const set = generateDailyMissionSet({
    playerId: DAILY_FIXTURE_PLAYER,
    calendar: calendarInput('2026-11-11'),
    capabilities: fullCapabilities(),
    generatedAtMs: dailyInstant('2026-11-11', 7_200),
    templateCatalog: learningCatalog(),
  });
  const learning = set.instances.filter((entry) => entry.controlRequirement === 'LEARNING');
  assert.equal(learning.length, 1);
  assert.equal(learning[0]!.objectiveKind, 'LEARNING_ACTIVATIONS');
  assert.equal(
    ['speed_delta_urban', 'following_time_headway'].includes(learning[0]!.learningKey ?? ''),
    true,
  );
  assert.equal(learning[0]!.allowsManual, false);
  for (const entry of set.instances.filter((item) => item.controlRequirement !== 'LEARNING'))
    assert.equal(entry.learningKey, null);
});

test('211 reload: the stored set is authoritative and never rerandomised', () => {
  const set = setForDay('2026-11-11');
  const parsed = parseDailyMissionSet(clone(set));
  assert.deepEqual(parsed, set);

  const first = step({ calendar: calendarInput('2026-11-11', { hour: 9 }) });
  const reloaded = advanceDailyCalendar({
    state: clone(first.state),
    playerId: DAILY_FIXTURE_PLAYER,
    calendar: calendarInput('2026-11-11', { hour: 23, minute: 59, second: 59 }),
    capabilities: fullCapabilities(),
    generatedAtMs: first.set!.expiresAtMs - 1,
  });
  assert.equal(reloaded.action, 'SAME_DAY');
  assert.equal(reloaded.regenerated, false);
  assert.equal(reloaded.skippedDays, 0);
  assert.deepEqual(reloaded.set, first.set);
  assert.equal(reloaded.set!.generatedAtMs, first.set!.generatedAtMs);
  assert.deepEqual(reloaded.state.sets, first.state.sets);
});

test('211 reload: an unlock after generation does not change the day', () => {
  const first = step({ calendar: calendarInput('2026-11-11') });
  const unlocked = dailyCapabilities({
    learningKeys: ['speed_delta_urban', 'following_time_headway'],
    zones: ['zone:airport', 'zone:center', 'zone:suburb'],
    vehicleClasses: ['compact', 'sedan'],
    controlModes: ['AUTO', 'LEARNING', 'MANUAL'],
    campaignCompleted: ['campaign-1-first-taxi', 'campaign-2-first-demonstration'],
    unlocks: ['challenge:first-demonstration', 'analysis:learning-review'],
  });
  assert.notEqual(
    unlocked.capabilityDigest,
    first.set!.capabilitySnapshot.capabilityDigest,
    'the capability content really changed',
  );
  const next = advanceDailyCalendar({
    state: first.state,
    playerId: DAILY_FIXTURE_PLAYER,
    calendar: calendarInput('2026-11-11', { hour: 18 }),
    capabilities: unlocked,
    generatedAtMs: first.set!.generatedAtMs + 1,
  });
  assert.equal(next.action, 'SAME_DAY');
  assert.deepEqual(next.set, first.set);
  assert.equal(next.regenerated, false);
  assert.equal(next.capabilityDrift, true);
  assert.equal(next.state.sets.length, 1);
});

test('211 profile: a new player gets its own set, a new driving profile does not touch the day', () => {
  const first = step({ calendar: calendarInput('2026-11-11') });
  const otherPlayer = advanceDailyCalendar({
    state: null,
    playerId: 'player:211-other',
    calendar: calendarInput('2026-11-11'),
    capabilities: fullCapabilities(),
    generatedAtMs: dailyInstant('2026-11-11', 7_200),
  });
  assert.notEqual(otherPlayer.set!.playerId, first.set!.playerId);
  assert.equal(
    otherPlayer.set!.instances.some((entry) =>
      first.set!.instances.some((current) => current.instanceId === entry.instanceId),
    ),
    false,
  );
  // 211 never reads a DrivingProfile: changing the driving style is not an input at all.
  const again = advanceDailyCalendar({
    state: first.state,
    playerId: DAILY_FIXTURE_PLAYER,
    calendar: calendarInput('2026-11-11', { hour: 20 }),
    capabilities: fullCapabilities(),
    generatedAtMs: first.set!.generatedAtMs,
  });
  assert.deepEqual(again.set, first.set);
});

test('211 midnight: the day is half-open and the boundary generated the next day', () => {
  const set = setForDay('2026-11-11');
  const resolved = resolveDailyCalendarDay(calendarInput('2026-11-11'));
  assert.equal(set.dayStartMs, resolved.dayStartMs);
  assert.equal(set.expiresAtMs, resolved.expiresAtMs);
  assert.equal(dailySetPhase(set, set.dayStartMs), 'ACTIVE');
  assert.equal(dailySetPhase(set, set.expiresAtMs - 1), 'ACTIVE');
  assert.equal(dailySetPhase(set, set.expiresAtMs), 'EXPIRED');
  assert.equal(dailySetExpired(set, set.expiresAtMs), true);
  const next = resolveDailyCalendarDay(calendarInput('2026-11-12', { atMs: set.expiresAtMs }));
  assert.equal(next.dailyDate, '2026-11-12');
  assert.equal(next.dayStartMs, set.expiresAtMs);

  const first = step({ calendar: calendarInput('2026-11-11') });
  const midnight = advanceDailyCalendar({
    state: first.state,
    playerId: DAILY_FIXTURE_PLAYER,
    calendar: calendarInput('2026-11-12', { atMs: first.set!.expiresAtMs }),
    capabilities: fullCapabilities(),
    generatedAtMs: first.set!.expiresAtMs,
  });
  assert.equal(midnight.action, 'NEW_DAY');
  assert.equal(midnight.set!.dailyDate, '2026-11-12');
  assert.equal(midnight.state.sets.length, 2);
  assert.equal(midnight.state.counters.expiredSets, 1);
});

test('211 DST: 23 h and 25 h local days tile the calendar exactly', () => {
  const spring = setForDay('2026-03-29', fullCapabilities(), {
    utcOffsetSeconds: 7_200,
    dayLengthSeconds: 82_800,
    hour: 12,
  });
  const springNext = setForDay('2026-03-30', fullCapabilities(), {
    utcOffsetSeconds: 10_800,
    dayLengthSeconds: 86_400,
    hour: 12,
  });
  assert.equal(spring.expiresAtMs - spring.dayStartMs, 23 * 3_600_000);
  assert.deepEqual(dailyCalendarContinuity(spring, springNext), {
    gapMs: 0,
    overlap: false,
    contiguous: true,
  });

  const fall = setForDay('2026-10-25', fullCapabilities(), {
    utcOffsetSeconds: 10_800,
    dayLengthSeconds: 90_000,
    hour: 12,
  });
  const fallNext = setForDay('2026-10-26', fullCapabilities(), {
    utcOffsetSeconds: 7_200,
    dayLengthSeconds: 86_400,
    hour: 12,
  });
  assert.equal(fall.expiresAtMs - fall.dayStartMs, 25 * 3_600_000);
  assert.deepEqual(dailyCalendarContinuity(fall, fallNext), {
    gapMs: 0,
    overlap: false,
    contiguous: true,
  });

  // A DST day still resolves one local date, even when the observed offset changes inside the day.
  assert.equal(
    resolveDailyCalendarDay(calendarInput('2026-03-29', { utcOffsetSeconds: 10_800, hour: 23 }))
      .dailyDate,
    '2026-03-29',
  );
  refuses(
    () =>
      resolveDailyCalendarDay(calendarInput('2026-03-29', { dayLengthSeconds: 82_800, hour: 23 })),
    /past its own local day/,
  );
});

test('211 clock: rollback keeps the highest date and does not reactivate a reward', () => {
  const state = stateForDays(['2026-11-10', '2026-11-11']);
  const rewarded = state.sets[0]!.instances[0]!.instanceId;
  const grant = recordDailyReward({ state, instanceId: rewarded, grantedAtMs: 10 });
  assert.equal(grant.granted, true);
  assert.equal(grant.duplicate, false);
  assert.equal(grant.record.rewardId.startsWith('daily-reward-v1:'), true);

  const back = advanceDailyCalendar({
    state: grant.state,
    playerId: DAILY_FIXTURE_PLAYER,
    calendar: calendarInput('2026-11-10', { hour: 8 }),
    capabilities: fullCapabilities(),
    generatedAtMs: 11,
  });
  assert.equal(back.action, 'ROLLBACK');
  assert.equal(back.state.highestObservedDate, '2026-11-11');
  assert.equal(back.state.sets.length, 2);
  assert.equal(back.regenerated, false);
  assert.deepEqual(back.set, state.sets[0]);
  assert.notEqual(dailyRewardFor(back.state, rewarded), null);

  const duplicate = recordDailyReward({
    state: back.state,
    instanceId: rewarded,
    grantedAtMs: 12,
  });
  assert.equal(duplicate.granted, false);
  assert.equal(duplicate.duplicate, true);
  assert.deepEqual(duplicate.state.rewards, back.state.rewards);

  // Forward again past the highest date still generates exactly one set.
  const forward = advanceDailyCalendar({
    state: back.state,
    playerId: DAILY_FIXTURE_PLAYER,
    calendar: calendarInput('2026-11-12', { hour: 9 }),
    capabilities: fullCapabilities(),
    generatedAtMs: 13,
  });
  assert.equal(forward.action, 'NEW_DAY');
  assert.equal(forward.set!.dailyDate, '2026-11-12');
  assert.equal(forward.state.rewards.length, 1);

  // A rollback to a day outside the retained history returns no set and never invents XP.
  const deep = advanceDailyCalendar({
    state: forward.state,
    playerId: DAILY_FIXTURE_PLAYER,
    calendar: calendarInput('2020-01-01', { hour: 9 }),
    capabilities: fullCapabilities(),
    generatedAtMs: 14,
  });
  assert.equal(deep.action, 'ROLLBACK');
  assert.equal(deep.set, null);
  assert.equal(deep.state.rewards.length, 1);
});

test('211 clock: a forward jump credits no skipped day', () => {
  const first = step({ calendar: calendarInput('2026-11-11') });
  const jump = advanceDailyCalendar({
    state: first.state,
    playerId: DAILY_FIXTURE_PLAYER,
    calendar: calendarInput('2026-11-15', { hour: 9 }),
    capabilities: fullCapabilities(),
    generatedAtMs: dailyInstant('2026-11-15', 7_200, 9),
  });
  assert.equal(jump.action, 'FORWARD_JUMP');
  assert.equal(jump.skippedDays, 3);
  assert.equal(jump.state.sets.length, 2);
  assert.equal(jump.state.rewards.length, 0);
  assert.equal(jump.state.counters.forwardJumps, 1);
  assert.equal(jump.state.counters.generated, 2);
  assert.deepEqual(
    jump.state.sets.map((entry) => entry.dailyDate),
    ['2026-11-11', '2026-11-15'],
  );
});

test('211 capability gaps: a lean snapshot still produces three realisable missions', () => {
  const set = setForDay('2026-11-11', minimalCapabilities());
  assert.equal(set.instances.length, 3);
  assert.equal(
    set.instances.some((entry) => entry.controlRequirement === 'LEARNING'),
    false,
  );
  assert.equal(
    set.instances.some((entry) => entry.allowsManual && entry.learningKey === null),
    true,
  );
  assert.deepEqual(
    [...set.capabilityGaps],
    ['CAMPAIGN_PROGRESS', 'LEARNING_KEYS', 'LEARNING_MODE', 'ZONES'],
  );
  assert.equal(set.excludedFamilies.includes('daily-learning-demonstration'), true);
  assert.equal(set.excludedFamilies.includes('daily-service-window'), true);
  assert.equal(
    set.instances.every((entry) => entry.zone === null),
    true,
    'without zones the parameter is null, not invented',
  );
  assert.equal(
    set.instances.every((entry) => entry.difficulty === 'EASY'),
    true,
    'a new player gets the easiest declared target',
  );
});

test('211 small catalog: fallback fills the three slots with distinct variants', () => {
  const set = generateDailyMissionSet({
    playerId: DAILY_FIXTURE_PLAYER,
    calendar: calendarInput('2026-11-11'),
    capabilities: minimalCapabilities(),
    generatedAtMs: dailyInstant('2026-11-11', 7_200),
    templateCatalog: smallCatalog(),
  });
  assert.equal(set.instances.length, 3);
  assert.equal(set.fallbacks, 1);
  assert.equal(new Set(set.instances.map((entry) => entry.instanceId)).size, 3);
  assert.equal(new Set(set.instances.map((entry) => `${entry.familyId}|${entry.target}`)).size, 3);
  assert.equal(set.templateCatalogVersion, 'test-small-v1');
});

test('211 versioned catalog: the accepted catalog version and family versions are recorded', () => {
  const catalog = learningCatalog('test-learning-v7');
  const set = generateDailyMissionSet({
    playerId: DAILY_FIXTURE_PLAYER,
    calendar: calendarInput('2026-11-11'),
    capabilities: fullCapabilities(),
    generatedAtMs: dailyInstant('2026-11-11', 7_200),
    templateCatalog: catalog,
  });
  assert.equal(set.templateCatalogVersion, 'test-learning-v7');
  const manual = set.instances.find((entry) => entry.familyId === 'daily-manual-service')!;
  assert.equal(manual.templateVersion, '3');
  const learning = set.instances.find(
    (entry) => entry.familyId === 'daily-learning-demonstration',
  )!;
  assert.equal(learning.templateVersion, '2');
});

test('211 refusals: invalid calendar, capability and catalog inputs are rejected', () => {
  refuses(() => parseDailyDate('2026-02-30'), /real calendar date/);
  refuses(() => parseDailyDate('2026-13-01'), /supported calendar range/);
  refuses(() => parseDailyDate('11-11-2026'), /YYYY-MM-DD/);
  refuses(
    () => resolveDailyCalendarDay(calendarInput('2026-11-11', { utcOffsetSeconds: 60_000 })),
    /finite number/,
  );
  refuses(
    () => resolveDailyCalendarDay(calendarInput('2026-11-11', { dayLengthSeconds: 86_399 })),
    /23, 24 or 25 hours/,
  );
  refuses(
    () =>
      resolveDailyCalendarDay({ ...calendarInput('2026-11-11'), timeZone: 'Europe//Bucharest' }),
    /time zone/,
  );

  const empty = {
    learningKeys: [] as string[],
    zones: [] as string[],
    vehicleClasses: ['sedan'],
    controlModes: ['AUTO', 'MANUAL'],
    campaignCompleted: [] as string[],
    unlocks: [] as string[],
  };
  refuses(() => dailyCapabilities({ ...empty, controlModes: ['AUTO'] }), /MANUAL control mode/);
  refuses(() => dailyCapabilities({ ...empty, vehicleClasses: ['spaceship'] }), /vehicle class/);
  refuses(
    () => dailyCapabilities({ ...empty, campaignCompleted: ['campaign-9-unknown'] }),
    /Unknown campaign mission/,
  );
  refuses(
    () => dailyCapabilities({ ...empty, campaignCompleted: ['campaign-2-first-demonstration'] }),
    /prerequisite/,
  );
  refuses(
    () => dailyCapabilities({ ...empty, unlocks: ['challenge:invented'] }),
    /Unknown daily unlock/,
  );

  // A digest is verified against the content: a forged structural digest grants nothing.
  const valid = dailyCapabilities(empty);
  refuses(
    () => createDailyCapabilities({ ...clone(valid), capabilityDigest: '0'.repeat(32) }),
    /digest/,
  );
  const structurallyValid = createDailyCapabilities(clone(valid));
  assert.deepEqual([...structurallyValid.learningKeys], []);
  assert.equal(structurallyValid.capabilityDigest, valid.capabilityDigest);
});

test('211 refusals: an uncertified learning key and a catalog without MANUAL are rejected', () => {
  const implemented = fullCapabilities();
  refuses(
    () =>
      dailyCapabilities({
        learningKeys: ['speed_delta_moon'],
        zones: [...implemented.zones],
        vehicleClasses: [...implemented.vehicleClasses],
        controlModes: [...implemented.controlModes],
        campaignCompleted: [...implemented.campaignCompleted],
        unlocks: [...implemented.unlocks],
      }),
    /not implemented/,
  );

  const catalog = learningCatalog();
  const manualFree: DailyTemplateCatalog = {
    ...catalog,
    families: catalog.families.filter((family) => family.allowsManual === false),
  };
  refuses(
    () =>
      generateDailyMissionSet({
        playerId: DAILY_FIXTURE_PLAYER,
        calendar: calendarInput('2026-11-11'),
        capabilities: fullCapabilities(),
        generatedAtMs: dailyInstant('2026-11-11', 7_200),
        templateCatalog: manualFree,
      }),
    /MANUAL/,
  );

  const degenerate: DailyTemplateCatalog = {
    ...catalog,
    families: [
      {
        ...catalog.families[0]!,
        targets: [1],
        incidentBudgets: [null],
      },
    ],
  };
  refuses(
    () =>
      generateDailyMissionSet({
        playerId: DAILY_FIXTURE_PLAYER,
        calendar: calendarInput('2026-11-11'),
        capabilities: minimalCapabilities(),
        generatedAtMs: dailyInstant('2026-11-11', 7_200),
        templateCatalog: degenerate,
      }),
    /distinct mission/,
  );
});

test('211 refusals: a forged or truncated saved set is rejected', () => {
  const set = setForDay('2026-11-11');
  const raw = rawSet(set);
  refuses(() => parseDailyMissionSet({ ...raw, signature: 'manual-service@1#1#-' }), /signature/);
  refuses(() => parseDailyMissionSet({ ...raw, dayStartMs: set.dayStartMs + DAY_MS }), /day start/);
  refuses(() => parseDailyMissionSet({ ...raw, expiresAtMs: set.expiresAtMs + 1 }), /expiry/);
  refuses(
    () => parseDailyMissionSet({ ...raw, instances: raw.instances.slice(0, 2) }),
    /exactly three missions/,
  );
  refuses(
    () =>
      parseDailyMissionSet({
        ...raw,
        capabilitySnapshot: { ...raw.capabilitySnapshot, capabilityDigest: 'f'.repeat(32) },
      }),
    /digest/,
  );
  refuses(
    () =>
      parseDailyMissionSet({
        ...raw,
        instances: [raw.instances[0]!, { ...raw.instances[1]!, slot: 1 }, raw.instances[2]!],
      }),
    /slot|identity/,
  );
  refuses(
    () => parseDailyMissionSet({ ...raw, playerId: 'player:211-stranger' }),
    /identity|player/,
  );
});

test('211 refusals: a reward for an unknown instance and a foreign state are rejected', () => {
  const state = stateForDays(['2026-11-11']);
  refuses(
    () =>
      recordDailyReward({
        state,
        instanceId: 'daily-v1:player:211-daily:2026-11-11:s1:daily-manual-service@1',
        grantedAtMs: 1,
      }),
    /unknown mission instance/,
  );
  refuses(
    () => parseDailyCalendarState({ ...clone(state), playerId: 'player:211-stranger' }),
    /another player/,
  );
  assert.equal(dailyCalendarSet(state, '2026-11-11') === null, false);
  assert.equal(dailyCalendarSet(state, '2026-11-12'), null);

  const duplicate = recordDailyReward({
    state,
    instanceId: state.sets[0]!.instances[0]!.instanceId,
    grantedAtMs: 1,
  });
  const twice = recordDailyReward({
    state: duplicate.state,
    instanceId: state.sets[0]!.instances[0]!.instanceId,
    grantedAtMs: 2,
  });
  assert.equal(twice.duplicate, true);
  assert.equal(twice.state.rewards.length, 1);
});

test('211 learning-only snapshot: the learning family appears and the advanced one is excluded', () => {
  const set = setForDay('2026-11-11', learningOnlyCapabilities());
  assert.equal(set.excludedFamilies.includes('daily-service-window'), true);
  assert.equal(set.capabilityGaps.includes('CAMPAIGN_PROGRESS'), true);
  assert.equal(set.capabilityGaps.includes('LEARNING_KEYS'), false);
  assert.equal(
    set.instances.every((entry) => entry.difficulty === 'EASY'),
    true,
  );
});

test('211 helper: ordered instances and families are stable and immutable', () => {
  const set: DailyMissionSet = setForDay('2026-11-11');
  const ordered = dailyMissionSetOrdered(set);
  assert.equal(Object.isFrozen(ordered), true);
  assert.deepEqual(
    [...ordered].sort((left, right) => left.slot - right.slot),
    [...ordered],
  );
  const families = dailyMissionSetFamilies(set);
  assert.equal(Object.isFrozen(families), true);
  assert.deepEqual([...families], [...families].sort());
});
