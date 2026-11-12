import {
  CHALLENGE_EXPERIENCE_LIMITS,
  CHALLENGE_EXPERIENCE_STATE_VERSION,
  CHALLENGE_EXPERIENCE_VERSION,
  CHALLENGE_REACTION_VERSION,
  CHALLENGE_RECORD_VERSION,
  challengeDailyConnection,
  challengeDailyVariety,
  challengeFastRetry,
  challengeReaction,
  challengeRewardKey,
  createChallengeTemplateCatalog,
} from '../../src/missions';
import { CHALLENGE_PANEL_VERSION } from '../../src/ui';
import {
  EXPERIENCE_FIRST_DAY,
  EXPERIENCE_PREVIOUS_DAY,
  EXPERIENCE_SECOND_DAY,
  completedChallenge,
  createExperienceHarness,
  declinedChallenge,
  failedChallenge,
} from './challenge-experience-fixture';

/**
 * Deterministic report for PBI 233.
 *
 * No wall clock, no random source and no browser participate: the director seed, the simulated clock,
 * the calendar instant and the real 213 ledger are explicit, so the transcript is byte-stable and
 * `--check` can prove the committed report is current.
 */
export const CHALLENGE_EXPERIENCE_REPORT_VERSION = '233-challenge-experience-report-v1' as const;

export interface ChallengeExperienceCheck {
  readonly name: string;
  readonly expected: string | number | boolean | null;
  readonly actual: string | number | boolean | null;
  readonly pass: boolean;
  readonly detail: string;
}

export interface ChallengeCreditRow {
  readonly scenario: string;
  readonly status: string;
  readonly reason: string | null;
  readonly family: string;
  readonly dailyDate: string;
  readonly calendar: string;
  readonly academyXp: number;
  readonly creditedXp: number;
  readonly xpBalance: number;
  readonly entries: number;
  readonly account: string;
}

export interface ChallengeRecordRow {
  readonly scenario: string;
  readonly comparison: string;
  readonly elapsedTicks: number | null;
  readonly bestElapsedTicks: number | null;
  readonly improved: boolean;
  readonly rank: readonly number[];
}

export interface ChallengeRetryRow {
  readonly status: string;
  readonly code: string | null;
  readonly attempt: number | null;
  readonly sameTemplate: boolean;
  readonly newIdentity: boolean;
  readonly xpDelta: number;
}

export interface ChallengeDailyRow {
  readonly dailyDate: string;
  readonly templates: readonly string[];
  readonly families: number;
  readonly manual: number;
  readonly checks: Readonly<Record<string, boolean>>;
}

export interface ChallengeReactionRow {
  readonly trigger: string;
  readonly tone: string;
  readonly effect: string;
  readonly xpStatement: string;
  readonly authored: boolean;
  readonly xpDelta: number;
  readonly text: string;
}

function fail(message: string): never {
  throw new Error(message);
}

function runCreditScenarios(): {
  readonly rows: readonly ChallengeCreditRow[];
  readonly ledgerCredits: number;
  readonly ledgerDuplicates: number;
} {
  const rows: ChallengeCreditRow[] = [];
  const harness = createExperienceHarness();
  const completed = completedChallenge(harness, 600);
  const first = harness.credit(completed, EXPERIENCE_FIRST_DAY);
  rows.push({
    scenario: 'academy_first_completion',
    status: first.status,
    reason: first.reason,
    family: first.family,
    dailyDate: first.dailyDate,
    calendar: first.calendarAction,
    academyXp: first.academyXp,
    creditedXp: first.creditedXp,
    xpBalance: first.xpBalance,
    entries: harness.ledger.read().entries.length,
    account: 'one authored credit through the real 213 ledger',
  });
  const duplicate = harness.credit(completed, EXPERIENCE_FIRST_DAY);
  rows.push({
    scenario: 'academy_same_family_same_day',
    status: duplicate.status,
    reason: duplicate.reason,
    family: duplicate.family,
    dailyDate: duplicate.dailyDate,
    calendar: duplicate.calendarAction,
    academyXp: duplicate.academyXp,
    creditedXp: duplicate.creditedXp,
    xpBalance: duplicate.xpBalance,
    entries: harness.ledger.read().entries.length,
    account: 'the family/day identity is already credited',
  });
  const rollback = harness.credit(completed, EXPERIENCE_PREVIOUS_DAY);
  rows.push({
    scenario: 'calendar_rollback',
    status: rollback.status,
    reason: rollback.reason,
    family: rollback.family,
    dailyDate: rollback.dailyDate,
    calendar: rollback.calendarAction,
    academyXp: rollback.academyXp,
    creditedXp: rollback.creditedXp,
    xpBalance: rollback.xpBalance,
    entries: harness.ledger.read().entries.length,
    account: 'a past date opens no new credit',
  });

  harness.skipCooldown();
  const declined = declinedChallenge(harness);
  const declinedCredit = harness.credit(declined, EXPERIENCE_FIRST_DAY);
  rows.push({
    scenario: 'declined_offer',
    status: declinedCredit.status,
    reason: declinedCredit.reason,
    family: declinedCredit.family,
    dailyDate: declinedCredit.dailyDate,
    calendar: declinedCredit.calendarAction,
    academyXp: declinedCredit.academyXp,
    creditedXp: declinedCredit.creditedXp,
    xpBalance: declinedCredit.xpBalance,
    entries: harness.ledger.read().entries.length,
    account: 'a refusal costs no XP',
  });

  harness.skipCooldown();
  const failed = failedChallenge(harness);
  const failedCredit = harness.credit(failed, EXPERIENCE_FIRST_DAY);
  rows.push({
    scenario: 'deadline_failure',
    status: failedCredit.status,
    reason: failedCredit.reason,
    family: failedCredit.family,
    dailyDate: failedCredit.dailyDate,
    calendar: failedCredit.calendarAction,
    academyXp: failedCredit.academyXp,
    creditedXp: failedCredit.creditedXp,
    xpBalance: failedCredit.xpBalance,
    entries: harness.ledger.read().entries.length,
    account: 'a failure costs no XP',
  });

  const chaos = createExperienceHarness({ sessionKind: 'CHAOS' });
  const chaosCompleted = completedChallenge(chaos, 600);
  const chaosCredit = chaos.credit(chaosCompleted, EXPERIENCE_FIRST_DAY);
  rows.push({
    scenario: 'haos_completion',
    status: chaosCredit.status,
    reason: chaosCredit.reason,
    family: chaosCredit.family,
    dailyDate: chaosCredit.dailyDate,
    calendar: chaosCredit.calendarAction,
    academyXp: chaosCredit.academyXp,
    creditedXp: chaosCredit.creditedXp,
    xpBalance: chaosCredit.xpBalance,
    entries: chaos.ledger.read().entries.length,
    account: 'Haos keeps a local record only',
  });

  const secondSession = createExperienceHarness({
    experience: harness.experience,
    ledger: harness.ledger,
  });
  const nextDay = completedChallenge(secondSession, 600);
  const nextDayCredit = secondSession.credit(nextDay, EXPERIENCE_SECOND_DAY);
  rows.push({
    scenario: 'academy_same_family_next_day',
    status: nextDayCredit.status,
    reason: nextDayCredit.reason,
    family: nextDayCredit.family,
    dailyDate: nextDayCredit.dailyDate,
    calendar: nextDayCredit.calendarAction,
    academyXp: nextDayCredit.academyXp,
    creditedXp: nextDayCredit.creditedXp,
    xpBalance: nextDayCredit.xpBalance,
    entries: harness.ledger.read().entries.length,
    account: 'a new local date pays the family credit again',
  });
  const ledger = harness.ledger.read();
  return Object.freeze({
    rows: Object.freeze(rows),
    ledgerCredits: ledger.counters.credits,
    ledgerDuplicates: ledger.counters.duplicates,
  });
}

function runRecordScenarios(): {
  readonly rows: readonly ChallengeRecordRow[];
  templateId: string;
} {
  const first = createExperienceHarness();
  const rows: ChallengeRecordRow[] = [];
  const best = completedChallenge(first, 300);
  const firstOutcome = first.record(best);
  rows.push({
    scenario: 'first_record',
    comparison: firstOutcome.comparison,
    elapsedTicks: firstOutcome.score?.elapsedTicks ?? null,
    bestElapsedTicks: firstOutcome.best?.score.elapsedTicks ?? null,
    improved: firstOutcome.improved,
    rank: firstOutcome.best?.rank ?? [],
  });
  const slower = createExperienceHarness({ experience: first.experience, ledger: first.ledger });
  const worse = first.record(completedChallenge(slower, 900));
  rows.push({
    scenario: 'slower_run',
    comparison: worse.comparison,
    elapsedTicks: worse.score?.elapsedTicks ?? null,
    bestElapsedTicks: worse.best?.score.elapsedTicks ?? null,
    improved: worse.improved,
    rank: worse.best?.rank ?? [],
  });
  const same = createExperienceHarness({ experience: first.experience, ledger: first.ledger });
  const equal = first.record(completedChallenge(same, 300));
  rows.push({
    scenario: 'equal_run',
    comparison: equal.comparison,
    elapsedTicks: equal.score?.elapsedTicks ?? null,
    bestElapsedTicks: equal.best?.score.elapsedTicks ?? null,
    improved: equal.improved,
    rank: equal.best?.rank ?? [],
  });
  const faster = createExperienceHarness({ experience: first.experience, ledger: first.ledger });
  const better = first.record(completedChallenge(faster, 120));
  rows.push({
    scenario: 'faster_run',
    comparison: better.comparison,
    elapsedTicks: better.score?.elapsedTicks ?? null,
    bestElapsedTicks: better.best?.score.elapsedTicks ?? null,
    improved: better.improved,
    rank: better.best?.rank ?? [],
  });
  return Object.freeze({ rows: Object.freeze(rows), templateId: best.templateId });
}

function runRetryScenarios(): {
  readonly rows: readonly ChallengeRetryRow[];
  readonly creditedAfterRetry: number;
  readonly duplicateAfterRetry: string;
} {
  const harness = createExperienceHarness();
  const failed = failedChallenge(harness);
  const retry = challengeFastRetry({
    director: harness.director,
    instanceId: failed.instanceId,
    capabilities: harness.world().capabilities,
  });
  if (retry.status !== 'RESTARTED' || retry.instance === null) fail('Expected a restart');
  const rows: ChallengeRetryRow[] = [
    {
      status: retry.status,
      code: retry.code,
      attempt: retry.attempt,
      sameTemplate: retry.instance.templateId === failed.templateId,
      newIdentity: retry.newIdentity,
      xpDelta: retry.xpDelta,
    },
  ];
  const completed = harness.complete(retry.instance.instanceId, 600);
  const credit = harness.credit(completed, EXPERIENCE_FIRST_DAY);
  const duplicateSession = createExperienceHarness({
    experience: harness.experience,
    ledger: harness.ledger,
  });
  const duplicate = duplicateSession.credit(
    completedChallenge(duplicateSession, 300),
    EXPERIENCE_FIRST_DAY,
  );
  const completedRetry = challengeFastRetry({
    director: harness.director,
    instanceId: completed.instanceId,
    capabilities: harness.world().capabilities,
  });
  rows.push({
    status: completedRetry.status,
    code: completedRetry.code,
    attempt: completedRetry.attempt,
    sameTemplate: completedRetry.templateId === completed.templateId,
    newIdentity: completedRetry.newIdentity,
    xpDelta: completedRetry.xpDelta,
  });
  return Object.freeze({
    rows: Object.freeze(rows),
    creditedAfterRetry: credit.creditedXp,
    duplicateAfterRetry: duplicate.reason ?? duplicate.status,
  });
}

function runDailyScenarios(): readonly ChallengeDailyRow[] {
  const catalog = createChallengeTemplateCatalog();
  const dates = [
    '2026-11-09',
    '2026-11-10',
    EXPERIENCE_PREVIOUS_DAY,
    EXPERIENCE_FIRST_DAY,
    EXPERIENCE_SECOND_DAY,
  ];
  const rows: ChallengeDailyRow[] = [];
  let previous: readonly string[] = [];
  for (const dailyDate of dates) {
    const set = challengeDailyVariety({
      catalog,
      dailyDate,
      seed: 4_242,
      previousTemplateIds: previous,
    });
    rows.push(
      Object.freeze({
        dailyDate,
        templates: Object.freeze(set.picks.map((entry) => entry.templateId)),
        families: set.counts.families,
        manual: set.counts.manual,
        checks: Object.freeze({
          exactlyThree: set.checks.exactlyThree,
          uniqueTemplates: set.checks.uniqueTemplates,
          atLeastOneManual: set.checks.atLeastOneManual,
          distinctFamilies: set.checks.distinctFamilies,
          catalogOnly: set.checks.catalogOnly,
          noChaosOnly: set.checks.noChaosOnly,
          noRepeatOfPrevious: set.checks.noRepeatOfPrevious,
        }),
      }),
    );
    previous = set.picks.map((entry) => entry.templateId);
  }
  return Object.freeze(rows);
}

function runReactionScenarios(): readonly ChallengeReactionRow[] {
  const harness = createExperienceHarness();
  const rows: ChallengeReactionRow[] = [];
  const offer = harness.offer();
  const push = (reaction: ReturnType<typeof challengeReaction>) => {
    rows.push(
      Object.freeze({
        trigger: reaction.trigger,
        tone: reaction.tone,
        effect: reaction.effect,
        xpStatement: reaction.xpStatement,
        authored: reaction.authored,
        xpDelta: reaction.xpDelta,
        text: reaction.text,
      }),
    );
  };
  push(challengeReaction({ instance: offer }));
  harness.accept(offer.instanceId);
  push(challengeReaction({ instance: harness.director.instance(offer.instanceId)! }));
  harness.activate(offer.instanceId);
  const completed = harness.complete(offer.instanceId, 600);
  push(challengeReaction({ instance: completed }));
  const credit = harness.credit(completed, EXPERIENCE_FIRST_DAY);
  push(challengeReaction({ instance: completed, credit }));
  const duplicate = harness.credit(completed, EXPERIENCE_FIRST_DAY);
  push(challengeReaction({ instance: completed, credit: duplicate }));
  harness.skipCooldown();
  push(challengeReaction({ instance: declinedChallenge(harness) }));
  harness.skipCooldown();
  push(challengeReaction({ instance: failedChallenge(harness) }));
  return Object.freeze(rows);
}

export interface ChallengeExperienceReport {
  readonly version: typeof CHALLENGE_EXPERIENCE_REPORT_VERSION;
  readonly contract: Readonly<{
    experience: string;
    state: string;
    record: string;
    reaction: string;
    panel: string;
    rewardKeyExample: string;
    limits: Readonly<{
      records: number;
      rewardedKeys: number;
      dailyPicks: number;
      reactionCodeUnits: number;
      globalListeners: number;
    }>;
  }>;
  readonly credit: readonly ChallengeCreditRow[];
  readonly records: Readonly<{ rows: readonly ChallengeRecordRow[]; templateId: string }>;
  readonly retry: Readonly<{
    rows: readonly ChallengeRetryRow[];
    creditedAfterRetry: number;
    duplicateAfterRetry: string;
  }>;
  readonly daily: readonly ChallengeDailyRow[];
  readonly connection: Readonly<{
    bridgeVersion: string;
    dailyMissionsPerDay: number;
    expressible: number;
    deferred: number;
    expressibleTemplateIds: readonly string[];
    deferredTemplateIds: readonly string[];
  }>;
  readonly reactions: readonly ChallengeReactionRow[];
  readonly storage: Readonly<{
    snapshotBytes: number;
    ledgerEntryBytes: number;
    ledgerEntries: number;
    records: number;
    rewardedKeys: number;
    manifestChallengeHistoryEntries: 'NULL_IN_MANIFEST';
    admissionCap: 'PROVISIONAL_FINITE';
  }>;
  readonly performance: Readonly<{
    readonly simulation: Readonly<{
      creditCalls: number;
      ledgerCredits: number;
      ledgerDuplicates: number;
      perTickWork: 'NONE';
      clock: 'NOT_MEASURED';
    }>;
    readonly ui: Readonly<{
      panelVersion: string;
      globalListeners: 0;
      readsPerOpen: number;
      loopJoined: false;
      frameBudgetP95Ms: 18.5;
      frameBudgetSource: 'Docs/performance-budgets.json';
      frameMeasurement: 'NOT_MEASURED_DEV';
    }>;
    readonly storage: Readonly<{
      stateVersion: string;
      recordRowsCap: number;
      rewardedKeysCap: number;
      droppedKeyPolicy: string;
      clock: 'NOT_MEASURED';
    }>;
  }>;
  readonly checks: readonly ChallengeExperienceCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function check(
  name: string,
  expected: string | number | boolean | null,
  actual: string | number | boolean | null,
  detail: string,
): ChallengeExperienceCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function findCredit(rows: readonly ChallengeCreditRow[], scenario: string): ChallengeCreditRow {
  const row = rows.find((entry) => entry.scenario === scenario);
  if (row === undefined) fail(`Missing credit scenario ${scenario}`);
  return row;
}

export function runChallengeExperienceReport(): ChallengeExperienceReport {
  const creditOutcome = runCreditScenarios();
  const credit = creditOutcome.rows;
  const records = runRecordScenarios();
  const retry = runRetryScenarios();
  const daily = runDailyScenarios();
  const reactions = runReactionScenarios();
  const connection = challengeDailyConnection();
  const shared = createExperienceHarness();
  const completed = completedChallenge(shared, 300);
  shared.record(completed);
  shared.credit(completed, EXPERIENCE_FIRST_DAY);
  const snapshot = shared.experience.snapshot();
  const ledgerRead = shared.ledger.read();
  const recordRow = shared.experience.recordFor(completed.templateId, completed.templateVersion);
  if (recordRow === undefined) fail('Expected the recorded challenge');

  const checks: ChallengeExperienceCheck[] = [
    check(
      'experience-version',
      '233-challenge-experience-v1',
      CHALLENGE_EXPERIENCE_VERSION,
      'versioned contract',
    ),
    check(
      'state-version',
      '233-challenge-experience-state-v1',
      CHALLENGE_EXPERIENCE_STATE_VERSION,
      'versioned snapshot',
    ),
    check(
      'record-version',
      '233-challenge-record-v1',
      CHALLENGE_RECORD_VERSION,
      'versioned record rows',
    ),
    check(
      'reaction-version',
      '233-challenge-reaction-v1',
      CHALLENGE_REACTION_VERSION,
      'versioned reactions',
    ),
    check(
      'panel-version',
      '233-challenge-panel-v1',
      CHALLENGE_PANEL_VERSION,
      'read-only UI projection',
    ),
    check('records-cap', 32, CHALLENGE_EXPERIENCE_LIMITS.records, 'finite record rows'),
    check(
      'rewarded-keys-cap',
      64,
      CHALLENGE_EXPERIENCE_LIMITS.rewardedKeys,
      'finite calendar keys',
    ),
    check(
      'daily-picks',
      3,
      CHALLENGE_EXPERIENCE_LIMITS.dailyPicks,
      'exactly three daily challenges',
    ),
    check(
      'credit-first',
      'CREDITED',
      findCredit(credit, 'academy_first_completion').status,
      'the first Academy completion pays its authored XP',
    ),
    check(
      'credit-first-xp',
      true,
      findCredit(credit, 'academy_first_completion').creditedXp > 0,
      'the credited amount is the real authored XP',
    ),
    check(
      'credit-duplicate',
      'DUPLICATE',
      findCredit(credit, 'academy_same_family_same_day').status,
      'the same family and day never pays twice',
    ),
    check(
      'credit-duplicate-zero',
      0,
      findCredit(credit, 'academy_same_family_same_day').creditedXp,
      'a duplicate pays nothing',
    ),
    check(
      'credit-rollback',
      'CALENDAR_ROLLBACK',
      findCredit(credit, 'calendar_rollback').reason,
      'a past date opens no credit',
    ),
    check(
      'credit-decline',
      'NOT_COMPLETED',
      findCredit(credit, 'declined_offer').reason,
      'a refusal pays nothing',
    ),
    check(
      'credit-failure',
      'NOT_COMPLETED',
      findCredit(credit, 'deadline_failure').reason,
      'a failure pays nothing',
    ),
    check(
      'credit-haos',
      'LOCAL_RECORD_ONLY',
      findCredit(credit, 'haos_completion').reason,
      'Haos keeps a local record only',
    ),
    check(
      'credit-next-day',
      'CREDITED',
      findCredit(credit, 'academy_same_family_next_day').status,
      'a new day pays the family credit again',
    ),
    check(
      'credit-ledger-entries',
      2,
      findCredit(credit, 'academy_same_family_next_day').entries,
      'two real 213 entries for two real credits',
    ),
    check('record-first', 'FIRST_RECORD', records.rows[0]!.comparison, 'first pass is a record'),
    check('record-worse', 'WORSE', records.rows[1]!.comparison, 'a slower pass is worse'),
    check('record-equal', 'EQUAL', records.rows[2]!.comparison, 'an equal pass is equal'),
    check('record-better', 'BETTER', records.rows[3]!.comparison, 'a faster pass is better'),
    check(
      'record-never-lowers',
      '300,300,300,120',
      records.rows.map((entry) => String(entry.bestElapsedTicks)).join(','),
      'a worse or equal run never rewrites the best; only a faster run does',
    ),
    check(
      'record-improved-flags',
      'true,false,false,true',
      records.rows.map((entry) => String(entry.improved)).join(','),
      'only a first or a strictly better run rewrites the best',
    ),
    check(
      'retry-status',
      'RESTARTED',
      retry.rows[0]!.status,
      'a failed challenge restarts immediately',
    ),
    check(
      'retry-new-identity',
      true,
      retry.rows[0]!.newIdentity,
      'the retry has a new instance identity',
    ),
    check(
      'retry-same-template',
      true,
      retry.rows[0]!.sameTemplate,
      'the template identity is unchanged',
    ),
    check('retry-attempt', 2, retry.rows[0]!.attempt, 'the retry is a new attempt'),
    check('retry-no-xp', 0, retry.rows[0]!.xpDelta, 'a retry never changes the balance'),
    check(
      'retry-credit-once',
      true,
      retry.creditedAfterRetry > 0,
      'the first completion after the retry pays once',
    ),
    check(
      'retry-duplicate',
      'FAMILY_REWARDED_TODAY',
      retry.duplicateAfterRetry,
      'a further same-family run that day is a duplicate',
    ),
    check(
      'retry-refuses-completed',
      'NOT_FAILED',
      retry.rows[1]!.code,
      'a completed challenge is not retried',
    ),
    check(
      'daily-exactly-three',
      true,
      daily.every((entry) => entry.checks.exactlyThree),
      'five days of exactly three',
    ),
    check(
      'daily-unique',
      true,
      daily.every((entry) => entry.checks.uniqueTemplates),
      'no template repeats in a day',
    ),
    check(
      'daily-manual',
      true,
      daily.every((entry) => entry.checks.atLeastOneManual),
      'at least one MANUAL per day',
    ),
    check(
      'daily-families',
      true,
      daily.every((entry) => entry.checks.distinctFamilies),
      'varied families',
    ),
    check(
      'daily-no-chaos',
      true,
      daily.every((entry) => entry.checks.noChaosOnly),
      'no Haos-only objective',
    ),
    check(
      'daily-no-repeat',
      true,
      daily.every((entry) => entry.checks.noRepeatOfPrevious),
      'a previous day is not repeated when alternatives exist',
    ),
    check(
      'daily-bridge',
      '231-challenge-daily-bridge-v1',
      connection.bridgeVersion,
      'the 211 bridge stays authoritative',
    ),
    check(
      'daily-expressible',
      3,
      connection.counts.expressible,
      'three template families map to 211',
    ),
    check(
      'daily-deferred',
      9,
      connection.counts.deferred,
      'nine objectives keep their own 231 evaluator',
    ),
    check('reaction-offer', 'OFFER', reactions[0]!.trigger, 'the offer shows the authored premise'),
    check(
      'reaction-progress',
      'PROGRESS',
      reactions[1]!.trigger,
      'the live attempt shows the authored progress line',
    ),
    check(
      'reaction-success',
      'SUCCESS',
      reactions[2]!.trigger,
      'a completion shows the authored success line',
    ),
    check(
      'reaction-credited',
      'XP_CREDITED',
      reactions[3]!.xpStatement,
      'a credit states the single XP credit',
    ),
    check(
      'reaction-record-only',
      'RECORD_ONLY',
      reactions[4]!.xpStatement,
      'a duplicate states record only',
    ),
    check('reaction-decline', 'DECLINE', reactions[5]!.trigger, 'a refusal has a closed safe line'),
    check(
      'reaction-failure',
      'FAILURE',
      reactions[6]!.trigger,
      'a failure shows the authored failure line',
    ),
    check(
      'reaction-xp-safe',
      true,
      reactions.every((entry) => entry.xpDelta === 0),
      'every reaction carries xpDelta 0',
    ),
    check('storage-records', 1, snapshot.records.length, 'the snapshot keeps the record'),
    check(
      'storage-keys',
      1,
      snapshot.rewardedKeys.length,
      'the snapshot keeps the family/day denial key',
    ),
    check(
      'storage-highest-date',
      EXPERIENCE_FIRST_DAY,
      snapshot.highestObservedDate,
      'the calendar never lowers the highest observed date',
    ),
    check(
      'storage-snapshot-bounded',
      true,
      Buffer.byteLength(JSON.stringify(snapshot)) < 8_192,
      'bounded snapshot bytes',
    ),
    check('ledger-balance', 1, ledgerRead.entries.length, 'the ledger is the single XP truth'),
    check(
      'record-template',
      records.templateId,
      recordRow.templateId,
      'the record belongs to the offered template',
    ),
  ];
  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: CHALLENGE_EXPERIENCE_REPORT_VERSION,
    contract: Object.freeze({
      experience: CHALLENGE_EXPERIENCE_VERSION,
      state: CHALLENGE_EXPERIENCE_STATE_VERSION,
      record: CHALLENGE_RECORD_VERSION,
      reaction: CHALLENGE_REACTION_VERSION,
      panel: CHALLENGE_PANEL_VERSION,
      rewardKeyExample: challengeRewardKey('PRECISION', EXPERIENCE_FIRST_DAY),
      limits: Object.freeze({
        records: CHALLENGE_EXPERIENCE_LIMITS.records,
        rewardedKeys: CHALLENGE_EXPERIENCE_LIMITS.rewardedKeys,
        dailyPicks: CHALLENGE_EXPERIENCE_LIMITS.dailyPicks,
        reactionCodeUnits: CHALLENGE_EXPERIENCE_LIMITS.reactionCodeUnits,
        globalListeners: CHALLENGE_EXPERIENCE_LIMITS.globalListeners,
      }),
    }),
    credit,
    records,
    retry,
    daily,
    connection: Object.freeze({
      bridgeVersion: connection.bridgeVersion,
      dailyMissionsPerDay: connection.dailyMissionsPerDay,
      expressible: connection.counts.expressible,
      deferred: connection.counts.deferred,
      expressibleTemplateIds: connection.expressibleTemplateIds,
      deferredTemplateIds: connection.deferredTemplateIds,
    }),
    reactions,
    storage: Object.freeze({
      snapshotBytes: Buffer.byteLength(JSON.stringify(snapshot)),
      ledgerEntryBytes: Buffer.byteLength(JSON.stringify(ledgerRead.entries)),
      ledgerEntries: ledgerRead.entries.length,
      records: snapshot.records.length,
      rewardedKeys: snapshot.rewardedKeys.length,
      manifestChallengeHistoryEntries: 'NULL_IN_MANIFEST' as const,
      admissionCap: 'PROVISIONAL_FINITE' as const,
    }),
    performance: Object.freeze({
      simulation: Object.freeze({
        creditCalls: credit.length,
        ledgerCredits: creditOutcome.ledgerCredits,
        ledgerDuplicates: creditOutcome.ledgerDuplicates,
        perTickWork: 'NONE' as const,
        clock: 'NOT_MEASURED' as const,
      }),
      ui: Object.freeze({
        panelVersion: CHALLENGE_PANEL_VERSION,
        globalListeners: 0 as const,
        readsPerOpen: 1,
        loopJoined: false as const,
        frameBudgetP95Ms: 18.5,
        frameBudgetSource: 'Docs/performance-budgets.json' as const,
        frameMeasurement: 'NOT_MEASURED_DEV' as const,
      }),
      storage: Object.freeze({
        stateVersion: CHALLENGE_EXPERIENCE_STATE_VERSION,
        recordRowsCap: CHALLENGE_EXPERIENCE_LIMITS.records,
        rewardedKeysCap: CHALLENGE_EXPERIENCE_LIMITS.rewardedKeys,
        droppedKeyPolicy:
          'the oldest reward key is dropped with a counter; the real 213 ledger still deduplicates it',
        clock: 'NOT_MEASURED' as const,
      }),
    }),
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}

const BACKTICK = '`';

function code(value: string | number | boolean | null): string {
  return `${BACKTICK}${String(value)}${BACKTICK}`;
}

function cell(value: string | number | boolean | null): string {
  return value === null ? '—' : String(value).replaceAll('|', '\\|');
}

export function challengeExperienceReportMarkdown(report: ChallengeExperienceReport): string {
  const lines: string[] = [];
  lines.push(
    '# 233 challenge experience report',
    '',
    'Transcript mașină-citibil: [report.json](report.json). Generat de ' +
      code('npm run missions:challenge-experience') +
      '; niciun ceas de perete, generator aleator sau browser nu participă. Versiune: ' +
      code(report.version) +
      '.',
    '',
    '## Contract',
    '',
    '- Experiență: ' +
      code(report.contract.experience) +
      '; stare: ' +
      code(report.contract.state) +
      '.',
    '- Record: ' +
      code(report.contract.record) +
      '; reacție: ' +
      code(report.contract.reaction) +
      '.',
    '- Panou: ' + code(report.contract.panel) + '.',
    '- Identitate recompensă: ' + code(report.contract.rewardKeyExample) + '.',
    '- Capacități: ' +
      String(report.contract.limits.records) +
      ' rânduri de record, ' +
      String(report.contract.limits.rewardedKeys) +
      ' chei de recompensă, ' +
      String(report.contract.limits.dailyPicks) +
      ' provocări zilnice, ' +
      String(report.contract.limits.reactionCodeUnits) +
      ' unități per replică, ' +
      String(report.contract.limits.globalListeners) +
      ' listeners globali.',
    '',
    '## Credit XP',
    '',
    '| Scenariu | Status | Motiv | Familie | Data | Calendar | XP autorat | XP creditat | Sold | Intrări | Cont |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...report.credit.map(
      (entry) =>
        `| ${entry.scenario} | ${entry.status} | ${cell(entry.reason)} | ${entry.family} | ${entry.dailyDate} | ${entry.calendar} | ${entry.academyXp} | ${entry.creditedXp} | ${entry.xpBalance} | ${entry.entries} | ${entry.account} |`,
    ),
    '',
    '## Recorduri personale',
    '',
    '| Scenariu | Comparație | Timp încercare | Cel mai bun | Îmbunătățit | Rang |',
    '| --- | --- | --- | --- | --- | --- |',
    ...report.records.rows.map(
      (entry) =>
        `| ${entry.scenario} | ${entry.comparison} | ${cell(entry.elapsedTicks)} | ${cell(entry.bestElapsedTicks)} | ${String(entry.improved)} | ${entry.rank.join(', ')} |`,
    ),
    '',
    '## Reluare rapidă',
    '',
    '| Status | Cod | Încercare | Același șablon | Identitate nouă | XP |',
    '| --- | --- | --- | --- | --- | --- |',
    ...report.retry.rows.map(
      (entry) =>
        `| ${entry.status} | ${cell(entry.code)} | ${cell(entry.attempt)} | ${String(entry.sameTemplate)} | ${String(entry.newIdentity)} | ${entry.xpDelta} |`,
    ),
    '',
    '- XP după reluare: ' +
      String(report.retry.creditedAfterRetry) +
      '; a doua reușită a familiei în aceeași zi: ' +
      code(report.retry.duplicateAfterRetry) +
      '.',
    '',
    '## Varietate zilnică',
    '',
    '| Data | Șabloane | Familii | MANUAL | Exact trei | Unice | Fără Haos | Fără repetare |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...report.daily.map(
      (entry) =>
        `| ${entry.dailyDate} | ${entry.templates.join(', ')} | ${entry.families} | ${entry.manual} | ${String(entry.checks.exactlyThree)} | ${String(entry.checks.uniqueTemplates)} | ${String(entry.checks.noChaosOnly)} | ${String(entry.checks.noRepeatOfPrevious)} |`,
    ),
    '',
    '- Punte 211: ' +
      code(report.connection.bridgeVersion) +
      '; ' +
      String(report.connection.expressible) +
      ' familii expresabile, ' +
      String(report.connection.deferred) +
      ' șabloane cu evaluator propriu 231 rămân deschise.',
    '',
    '## Reacții comice',
    '',
    '| Trigger | Ton | Efect | XP | Autorată | Text |',
    '| --- | --- | --- | --- | --- | --- |',
    ...report.reactions.map(
      (entry) =>
        `| ${entry.trigger} | ${entry.tone} | ${entry.effect} | ${entry.xpStatement} | ${String(entry.authored)} | ${cell(entry.text)} |`,
    ),
    '',
    '## Stocare și performanță',
    '',
    '- Snapshot: ' +
      String(report.storage.snapshotBytes) +
      ' bytes, ' +
      String(report.storage.records) +
      ' recorduri, ' +
      String(report.storage.rewardedKeys) +
      ' chei; intrări 213: ' +
      String(report.storage.ledgerEntries) +
      ' (' +
      String(report.storage.ledgerEntryBytes) +
      ' bytes).',
    '- `challengeHistoryEntries` este ' +
      code(report.storage.manifestChallengeHistoryEntries) +
      '; PBI-ul stabilește capacitatea finită ' +
      code(report.storage.admissionCap) +
      ' și raportează lacuna de calibrare.',
    '- UI: panoul ' +
      code(report.performance.ui.panelVersion) +
      ' are ' +
      String(report.performance.ui.globalListeners) +
      ' listeners globali, o citire per deschidere și nu intră în bucla 3D. Bugetul de frame p95 ' +
      String(report.performance.ui.frameBudgetP95Ms) +
      ' ms provine din ' +
      code(report.performance.ui.frameBudgetSource) +
      '; măsurarea este ' +
      code(report.performance.ui.frameMeasurement) +
      ' (PBI targeted, fără lucru pe tick).',
    '- Simulare: ' +
      String(report.performance.simulation.creditCalls) +
      ' cereri de credit, ' +
      String(report.performance.simulation.ledgerCredits) +
      ' credite și ' +
      String(report.performance.simulation.ledgerDuplicates) +
      ' duplicate în ledgerul real; lucru per tick: ' +
      code(report.performance.simulation.perTickWork) +
      '.',
    '- Stocare: ' +
      code(report.performance.storage.stateVersion) +
      ', ' +
      String(report.performance.storage.recordRowsCap) +
      ' rânduri, ' +
      String(report.performance.storage.rewardedKeysCap) +
      ' chei; ' +
      report.performance.storage.droppedKeyPolicy +
      '.',
    '',
    '## Checks',
    '',
    '| Check | Așteptat | Real | Rezultat | Detaliu |',
    '| --- | --- | --- | --- | --- |',
    ...report.checks.map(
      (entry) =>
        `| ${entry.name} | ${cell(entry.expected)} | ${cell(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.detail} |`,
    ),
    '',
    '## Sumar',
    '',
    '- Checks: ' + String(report.summary.passed) + '/' + String(report.summary.checks),
    '- Overall: ' + (report.summary.pass ? 'PASS' : 'FAIL'),
    '',
  );
  return lines.join('\n');
}
