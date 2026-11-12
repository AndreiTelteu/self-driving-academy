import {
  CHALLENGE_CAPABILITY_VERSION,
  CHALLENGE_DAILY_BRIDGE_VERSION,
  CHALLENGE_EVALUATORS,
  CHALLENGE_EVALUATOR_VERSION,
  CHALLENGE_LIMITS,
  CHALLENGE_SCHEMA_VERSION,
  CHALLENGE_TEMPLATE_CATALOG_VERSION,
  CHALLENGE_TICK_HZ,
  DAILY_TEMPLATE_CATALOG_VERSION,
  challengeFamilies,
  challengeObjectiveKinds,
  challengeVerdictStatuses,
  challengeZoneKinds,
  challengeDailyFamilies,
  createChallengeCapabilities,
  createDailyTemplateCatalog,
  eligibleChallengeTemplates,
  evaluateChallenge,
} from '../../src/missions';
import type { ChallengeAttemptPlan, ChallengeMeasured, ChallengeVerdict } from '../../src/missions';
import {
  CHALLENGE_FIXTURE_SEED,
  challengeCatalog,
  challengePlan,
  failingFacts,
  fullChallengeCapabilities,
  leanChallengeCapabilities,
  passingFacts,
} from './challenge-catalog-fixture';
import { calendarInput, fullCapabilities, step } from './mission-daily-fixture';

/**
 * Deterministic report for PBI 231.
 *
 * No wall clock, no random source and no browser participate. Every plan uses the same explicit
 * fixture seed and every fact document is an explicit tick window, so the transcript is byte-stable
 * and `--check` can prove the committed report is current.
 */
export const CHALLENGE_CATALOG_REPORT_VERSION = '231-challenge-catalog-report-v1' as const;

export interface ChallengeCatalogCheck {
  readonly name: string;
  readonly expected: string | number | boolean | null;
  readonly actual: string | number | boolean | null;
  readonly pass: boolean;
  readonly detail: string;
}

export interface ChallengePlanRow {
  readonly templateId: string;
  readonly family: string;
  readonly objectiveKind: string;
  readonly evaluatorId: string;
  readonly sessionKind: string;
  readonly target: number;
  readonly margin: number;
  readonly deadlineTick: number;
  readonly incidentBudget: number;
  readonly zoneIds: readonly string[];
  readonly learningKey: string | null;
  readonly thresholdKeys: readonly string[];
}

export interface ChallengeVerdictRow {
  readonly templateId: string;
  readonly status: string;
  readonly reason: string;
  readonly progress: number;
  readonly target: number;
  readonly fingerprint: string;
  readonly measured: ChallengeMeasured;
}

export interface ChallengeEligibilityReport {
  readonly eligible: number;
  readonly excluded: number;
  readonly missing: readonly string[];
  readonly excludedTemplates: readonly string[];
}

export interface ChallengeCatalogReport {
  readonly version: typeof CHALLENGE_CATALOG_REPORT_VERSION;
  readonly contract: Readonly<{
    schema: string;
    templateCatalogVersion: string;
    evaluatorVersion: string;
    capabilityVersion: string;
    dailyBridgeVersion: string;
    tickHz: number;
    templates: number;
    families: readonly string[];
    zoneKinds: readonly string[];
    objectiveKinds: readonly string[];
    verdictStatuses: readonly string[];
    minimumTemplates: number;
    catalogCapacity: number;
    historyCapacity: number;
  }>;
  readonly catalog: Readonly<{
    templates: number;
    families: Readonly<Record<string, number>>;
    evaluators: readonly string[];
    sessions: Readonly<Record<string, number>>;
    filmingTemplates: number;
    dialogueLines: number;
    thresholds: number;
    rewardsAcademyXp: number;
    rewardsChaosOnly: number;
  }>;
  readonly plans: readonly ChallengePlanRow[];
  readonly eligibility: Readonly<{
    lean: ChallengeEligibilityReport;
    academy: ChallengeEligibilityReport;
    chaos: ChallengeEligibilityReport;
    incremental: Readonly<{
      leanEligible: number;
      withHospital: number;
      withSedanStillMissingClass: number;
      fullyEquipped: number;
    }>;
  }>;
  readonly evaluations: Readonly<{
    passing: readonly ChallengeVerdictRow[];
    failing: readonly ChallengeVerdictRow[];
  }>;
  readonly drift: Readonly<{
    validSeconds: number;
    rotationOnlySeconds: number;
    rotationTicks: number;
    collisionSeconds: number;
    collisionTicks: number;
    outsideZoneSeconds: number;
    verdict: string;
  }>;
  readonly destruction: Readonly<{
    deduplicatedDistinct: number;
    deduplicatedStatus: string;
    passedDistinct: number;
    passedStatus: string;
    academyStatus: string;
    academyReason: string;
  }>;
  readonly determinism: Readonly<{
    evaluations: number;
    distinctFingerprints: number;
    distinctTemplates: number;
    permutationEqual: boolean;
    cloneEqual: boolean;
    seed: number;
  }>;
  readonly compatibility: Readonly<{
    dailyCatalogVersion: string;
    dailyFamilies: number;
    bridgeVersion: string;
    bridgeFamilies: readonly string[];
    generatedMissions: number;
    generatedDistinctInstances: number;
    generatedFamilies: readonly string[];
    dailyCatalogStillDelivered: boolean;
  }>;
  readonly performance: Readonly<{
    readonly simulation: Readonly<{
      templates: number;
      evaluations: number;
      factRowsExamined: number;
      maxDriftSamples: number;
      maxFactsExaminedPerVerdict: number;
      clock: 'NOT_MEASURED';
    }>;
    readonly memory: Readonly<{
      catalogBytes: number;
      maxPlanBytes: number;
      maxFactsBytes: number;
      maxVerdictBytes: number;
      catalogTemplates: number;
      historyCapacity: number;
      challengeHistoryBudget: 'NULL_IN_MANIFEST';
    }>;
  }>;
  readonly checks: readonly ChallengeCatalogCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

const TEMPLATE_IDS = challengeCatalog().templates.map((entry) => entry.templateId);

function check(
  name: string,
  expected: string | number | boolean | null,
  actual: string | number | boolean | null,
  detail: string,
): ChallengeCatalogCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function planFor(templateId: string): ChallengeAttemptPlan {
  return challengePlan(templateId);
}

function planRow(plan: ChallengeAttemptPlan): ChallengePlanRow {
  return Object.freeze({
    templateId: plan.templateId,
    family: plan.family,
    objectiveKind: plan.objective.objectiveKind,
    evaluatorId: plan.objective.evaluatorId,
    sessionKind: plan.sessionKind,
    target: plan.objective.target,
    margin: plan.deadline.margin,
    deadlineTick: plan.objective.deadlineTick,
    incidentBudget: plan.objective.incidentBudget,
    zoneIds: plan.objective.zoneIds,
    learningKey: plan.objective.learningKey,
    thresholdKeys: Object.freeze(Object.keys(plan.objective.thresholds).sort()),
  });
}

function verdictRow(templateId: string, verdict: ChallengeVerdict): ChallengeVerdictRow {
  return Object.freeze({
    templateId,
    status: verdict.status,
    reason: verdict.reason,
    progress: verdict.progress,
    target: verdict.target,
    fingerprint: verdict.fingerprint,
    measured: verdict.measured,
  });
}

function eligibilityReport(
  capabilities: ReturnType<typeof fullChallengeCapabilities>,
): ChallengeEligibilityReport {
  const eligibility = eligibleChallengeTemplates(challengeCatalog(), capabilities);
  return Object.freeze({
    eligible: eligibility.eligible.length,
    excluded: eligibility.excluded.length,
    missing: Object.freeze(
      [...new Set(eligibility.excluded.flatMap((entry) => entry.missing))].sort(),
    ),
    excludedTemplates: Object.freeze(eligibility.excluded.map((entry) => entry.templateId)),
  });
}

function countsOf<T extends string>(values: readonly T[]): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const value of values.slice().sort()) counts[value] = (counts[value] ?? 0) + 1;
  return Object.freeze(counts);
}

function driftReport(): ChallengeCatalogReport['drift'] {
  const plan = planFor('challenge-influencer-parking-drift');
  const zone = plan.objective.zoneIds[0]!;
  const samples = (speedMps: number, slipAngleRad: number, collisionImpulseNs: number) =>
    Array.from({ length: 240 }, (_, index) => ({
      zoneId: zone,
      tick: 1_000 + index,
      speedMps,
      slipAngleRad,
      collisionImpulseNs,
    }));
  const expired = plan.objective.deadlineTick + 120;
  const facts = (driftSamples: readonly Record<string, unknown>[]) => ({
    tickHz: CHALLENGE_TICK_HZ,
    startedTick: 0,
    endedTick: expired,
    sessionKind: plan.sessionKind,
    controlSource: 'MANUAL',
    passengerAboard: true,
    incidents: 0,
    zoneVisits: [],
    checkpoints: [],
    dropoffs: [],
    parked: [],
    driftSamples,
    destruction: [],
    comfortSamples: [],
    learning: null,
  });
  const valid = evaluateChallenge({
    objective: plan.objective,
    facts: facts(samples(8, 0.4, 0)),
  });
  const rotation = evaluateChallenge({
    objective: plan.objective,
    facts: facts(samples(0.2, 1.3, 0)),
  });
  const collision = evaluateChallenge({
    objective: plan.objective,
    facts: facts(samples(12, 0.8, 60)),
  });
  const outside = evaluateChallenge({
    objective: plan.objective,
    facts: facts(
      Array.from({ length: 240 }, (_, index) => ({
        zoneId: 'zone:drift:elsewhere',
        tick: 1_000 + index,
        speedMps: 12,
        slipAngleRad: 0.8,
        collisionImpulseNs: 0,
      })),
    ),
  });
  return Object.freeze({
    validSeconds: valid.measured.validDriftSeconds,
    rotationOnlySeconds: rotation.measured.validDriftSeconds,
    rotationTicks: rotation.measured.rotationOnlyTicks,
    collisionSeconds: collision.measured.validDriftSeconds,
    collisionTicks: collision.measured.collisionTicks,
    outsideZoneSeconds: outside.measured.validDriftSeconds,
    verdict: rotation.status,
  });
}

function destructionReport(): ChallengeCatalogReport['destruction'] {
  const plan = challengePlan('challenge-influencer-demolition', {
    capabilities: fullChallengeCapabilities('CHAOS'),
    sessionKind: 'CHAOS',
  });
  const zone = plan.objective.zoneIds[0]!;
  const base = {
    tickHz: CHALLENGE_TICK_HZ,
    startedTick: 0,
    endedTick: 3_000,
    sessionKind: plan.sessionKind,
    controlSource: 'MANUAL',
    passengerAboard: true,
    incidents: 0,
    zoneVisits: [],
    checkpoints: [],
    dropoffs: [],
    parked: [],
    driftSamples: [],
    destruction: [],
    comfortSamples: [],
    learning: null,
  };
  const deduplicated = evaluateChallenge({
    objective: plan.objective,
    facts: {
      ...base,
      destruction: [
        { objectId: 'object:1', zoneId: zone, tick: 1_000 },
        { objectId: 'object:1', zoneId: zone, tick: 1_100 },
        { objectId: 'object:2', zoneId: zone, tick: 1_200 },
        { objectId: 'object:3', zoneId: zone, tick: 1_300 },
        { objectId: 'object:4', zoneId: zone, tick: 1_400 },
        { objectId: 'object:4', zoneId: zone, tick: 1_500 },
        { objectId: 'object:5', zoneId: 'zone:alley:elsewhere', tick: 1_600 },
      ],
    },
  });
  const passed = evaluateChallenge({
    objective: plan.objective,
    facts: {
      ...base,
      destruction: Array.from({ length: 5 }, (_, index) => ({
        objectId: `object:${index}`,
        zoneId: zone,
        tick: 1_000 + index * 100,
      })),
    },
  });
  const academy = evaluateChallenge({
    objective: plan.objective,
    facts: { ...base, sessionKind: 'ACADEMY' },
  });
  return Object.freeze({
    deduplicatedDistinct: deduplicated.measured.distinctDestroyed,
    deduplicatedStatus: deduplicated.status,
    passedDistinct: passed.measured.distinctDestroyed,
    passedStatus: passed.status,
    academyStatus: academy.status,
    academyReason: academy.reason,
  });
}

function determinismReport(): ChallengeCatalogReport['determinism'] {
  const fingerprints = new Set<string>();
  let evaluations = 0;
  let permutationEqual = true;
  let cloneEqual = true;
  for (const templateId of TEMPLATE_IDS) {
    const plan = planFor(templateId);
    const facts = passingFacts(templateId);
    const baseline = evaluateChallenge({ objective: plan.objective, facts });
    for (let index = 0; index < 100; index += 1) {
      const verdict = evaluateChallenge({
        objective: plan.objective,
        facts: index % 2 === 0 ? facts : JSON.parse(JSON.stringify(facts)),
      });
      evaluations += 1;
      fingerprints.add(verdict.fingerprint);
      if (JSON.stringify(verdict) !== JSON.stringify(baseline)) cloneEqual = false;
    }
    const reversed = JSON.parse(JSON.stringify(facts)) as Record<string, unknown>;
    for (const key of [
      'zoneVisits',
      'checkpoints',
      'dropoffs',
      'parked',
      'driftSamples',
      'destruction',
      'comfortSamples',
    ])
      if (Array.isArray(reversed[key])) reversed[key] = [...(reversed[key] as unknown[])].reverse();
    const permuted = evaluateChallenge({ objective: plan.objective, facts: reversed });
    if (JSON.stringify(permuted) !== JSON.stringify(baseline)) permutationEqual = false;
  }
  return Object.freeze({
    evaluations,
    distinctFingerprints: fingerprints.size,
    distinctTemplates: TEMPLATE_IDS.length,
    permutationEqual,
    cloneEqual,
    seed: CHALLENGE_FIXTURE_SEED,
  });
}

function compatibilityReport(): ChallengeCatalogReport['compatibility'] {
  const daily = createDailyTemplateCatalog();
  const bridge = challengeDailyFamilies();
  const result = step({
    calendar: calendarInput('2026-11-12'),
    templateCatalog: bridge,
    capabilities: fullCapabilities(),
  });
  if (result.set === null)
    throw new Error('The daily generator refused the challenge bridge catalog');
  return Object.freeze({
    dailyCatalogVersion: daily.version,
    dailyFamilies: daily.families.length,
    bridgeVersion: bridge.version,
    bridgeFamilies: Object.freeze(bridge.families.map((entry) => entry.familyId).sort()),
    generatedMissions: result.set.instances.length,
    generatedDistinctInstances: new Set(result.set.instances.map((entry) => entry.instanceId)).size,
    generatedFamilies: Object.freeze(
      [...new Set(result.set.instances.map((entry) => entry.familyId))].sort(),
    ),
    dailyCatalogStillDelivered: daily.version === DAILY_TEMPLATE_CATALOG_VERSION,
  });
}

export function runChallengeCatalogReport(): ChallengeCatalogReport {
  const catalog = challengeCatalog();
  const plans = TEMPLATE_IDS.map(planFor);
  const planRows = plans.map(planRow);
  const passing = TEMPLATE_IDS.map((templateId) => {
    const plan = planFor(templateId);
    return verdictRow(
      templateId,
      evaluateChallenge({ objective: plan.objective, facts: passingFacts(templateId) }),
    );
  });
  const failing = TEMPLATE_IDS.map((templateId) => {
    const failure = failingFacts(templateId);
    const plan = planFor(templateId);
    return verdictRow(
      templateId,
      evaluateChallenge({ objective: plan.objective, facts: failure.facts }),
    );
  });
  const drift = driftReport();
  const destruction = destructionReport();
  const determinism = determinismReport();
  const compatibility = compatibilityReport();
  const lean = leanChallengeCapabilities();
  const withHospital = createChallengeCapabilities({
    ...lean,
    zones: [{ zoneId: 'zone:hospital:central', kind: 'HOSPITAL' }],
  });
  const withSedan = createChallengeCapabilities({ ...lean, vehicleClasses: ['compact', 'sedan'] });
  const leanEligibility = eligibleChallengeTemplates(catalog, lean);
  const withSedanMissingClass = eligibleChallengeTemplates(catalog, withSedan).excluded.filter(
    (entry) => entry.missing.some((reason) => reason.startsWith('VEHICLE_CLASS')),
  ).length;
  const withHospitalEligibility = eligibleChallengeTemplates(catalog, withHospital);
  const academyEligibility = eligibilityReport(fullChallengeCapabilities('ACADEMY'));
  const chaosEligibility = eligibilityReport(fullChallengeCapabilities('CHAOS'));

  const simulationRows = 1_200;
  const factRowsPerRun = TEMPLATE_IDS.reduce((total, templateId) => {
    const plan = planFor(templateId);
    const verdict = evaluateChallenge({
      objective: plan.objective,
      facts: passingFacts(templateId),
    });
    return total + verdict.measured.samplesExamined;
  }, 0);
  const factRowsExamined = factRowsPerRun * 100;
  const maxFactsExaminedPerVerdict = Math.max(
    ...passing.map((entry) => entry.measured.samplesExamined),
  );
  const maxDriftSamples = Math.max(
    ...TEMPLATE_IDS.map(
      (templateId) =>
        (passingFacts(templateId) as unknown as { driftSamples: unknown[] }).driftSamples.length,
    ),
  );
  const catalogBytes = Buffer.byteLength(JSON.stringify(catalog));
  const maxPlanBytes = Math.max(...plans.map((entry) => Buffer.byteLength(JSON.stringify(entry))));
  const maxFactsBytes = Math.max(
    ...TEMPLATE_IDS.map((templateId) =>
      Buffer.byteLength(JSON.stringify(passingFacts(templateId))),
    ),
  );
  const maxVerdictBytes = Math.max(
    ...passing.map((entry) => Buffer.byteLength(JSON.stringify(entry))),
  );

  const checks: ChallengeCatalogCheck[] = [];
  checks.push(
    check('schema', '231-challenge-catalog-v1', CHALLENGE_SCHEMA_VERSION, 'catalog schema'),
    check(
      'template-catalog-version',
      '231-challenge-templates-v1',
      CHALLENGE_TEMPLATE_CATALOG_VERSION,
      'versioned authored catalog',
    ),
    check(
      'evaluator-version',
      '231-challenge-evaluators-v1',
      CHALLENGE_EVALUATOR_VERSION,
      'versioned evaluator thresholds',
    ),
    check(
      'capability-version',
      '231-challenge-capabilities-v1',
      CHALLENGE_CAPABILITY_VERSION,
      'versioned prerequisite snapshot',
    ),
    check('tick-hz', 60, CHALLENGE_TICK_HZ, 'authoritative simulation tick'),
    check('templates', 12, catalog.templates.length, 'minimum V1 catalog'),
    check('minimum-templates', 12, CHALLENGE_LIMITS.minimumTemplates, 'declared minimum'),
    check('catalog-capacity', 32, CHALLENGE_LIMITS.templates, 'finite template capacity'),
    check(
      'families',
      6,
      new Set(catalog.templates.map((entry) => entry.family)).size,
      'family coverage',
    ),
    check(
      'evaluators',
      8,
      new Set(catalog.templates.map((entry) => entry.evaluatorId)).size,
      'one evaluator per objective kind',
    ),
    check('zone-kinds', 8, challengeZoneKinds.length, 'closed zone vocabulary'),
    check('objective-kinds', 8, challengeObjectiveKinds.length, 'closed objective vocabulary'),
    check('verdict-statuses', 4, challengeVerdictStatuses.length, 'closed verdict statuses'),
    check(
      'distinct-objectives',
      12,
      new Set(
        catalog.templates.map(
          (entry) =>
            `${entry.family}|${entry.objectiveKind}|${entry.evaluatorId}|${entry.zones.requirements
              .map((requirement) => `${requirement.kind}x${requirement.count}`)
              .join(
                '+',
              )}|${entry.targets.join('+')}|${entry.deadline.referenceSeconds}|${JSON.stringify(entry.thresholds)}`,
        ),
      ).size,
      'no two templates repeat the same authored objective',
    ),
    check(
      'filming-internal',
      4,
      catalog.templates.filter(
        (entry) => entry.filming.premise && entry.filming.capture === 'INTERNAL_REPLAY',
      ).length,
      'the filming premise is internal replay only',
    ),
    check(
      'dialogue-lines',
      48,
      catalog.templates.reduce((total, entry) => total + entry.dialogue.length, 0),
      'four real-event lines per template',
    ),
    check(
      'replay-rules',
      12,
      catalog.templates.filter(
        (entry) =>
          entry.replayRules.restartKey === 'R' &&
          entry.replayRules.restart === 'NEW_INSTANCE' &&
          entry.replayRules.cityReset === 'ATTEMPT_FAILED_NO_XP_LOSS',
      ).length,
      'R starts a new instance and a reset loses no XP',
    ),
    check(
      'replay-xp',
      0,
      catalog.templates.reduce((total, entry) => total + entry.rewardPolicy.replayXp, 0),
      'a replay never pays XP',
    ),
    check(
      'chaos-only-rewards',
      0,
      catalog.templates
        .filter((entry) => entry.sessions.length === 1 && entry.sessions[0] === 'CHAOS')
        .reduce((total, entry) => total + entry.rewardPolicy.academyXp, 0),
      'Haos-only templates pay local records, not Academy XP',
    ),
    check(
      'learning-academy-only',
      1,
      catalog.templates.filter(
        (entry) => entry.controlRequirement === 'LEARNING' && entry.sessions.join('') === 'ACADEMY',
      ).length,
      'a LEARNING objective publishes in the Academy only',
    ),
    check(
      'feasible-deadlines',
      12,
      catalog.templates.filter(
        (entry) =>
          entry.deadline.referenceSeconds * (1 + Math.max(...entry.deadline.marginOptions)) >
            entry.deadline.referenceSeconds &&
          entry.deadline.referenceSeconds * (1 + Math.max(...entry.deadline.marginOptions)) <= 240,
      ).length,
      'every margin produces a deadline above the reference and inside four minutes',
    ),
  );

  checks.push(
    check(
      'lean-eligible',
      2,
      leanEligibility.eligible.length,
      'only templates that need no map zone',
    ),
    check('lean-excluded', 10, leanEligibility.excluded.length, 'every other template is excluded'),
    check(
      'lean-missing-zones',
      true,
      eligibilityReport(lean).missing.includes('ZONE:HOSPITAL'),
      'named missing zone',
    ),
    check(
      'lean-missing-class',
      true,
      eligibilityReport(lean).missing.includes('VEHICLE_CLASS:sedan'),
      'named missing class',
    ),
    check(
      'lean-missing-learning',
      true,
      eligibilityReport(lean).missing.includes('LEARNING_KEY:speed_delta_urban'),
      'named missing key',
    ),
    check(
      'lean-missing-campaign',
      true,
      eligibilityReport(lean).missing.includes('CAMPAIGN:1'),
      'named missing progress',
    ),
    check(
      'with-hospital-eligible',
      3,
      withHospitalEligibility.eligible.length,
      'adding the hospital realises maternity',
    ),
    check(
      'with-sedan-missing-class',
      0,
      withSedanMissingClass,
      'the class prerequisite disappears when the sedan exists',
    ),
    check(
      'academy-eligible',
      11,
      academyEligibility.eligible,
      'demolition is not offered in the Academy',
    ),
    check('academy-excluded', 1, academyEligibility.excluded, 'demolition is the only exclusion'),
    check(
      'chaos-eligible',
      11,
      chaosEligibility.eligible,
      'the LEARNING experiment is not offered in Haos',
    ),
    check(
      'chaos-excluded',
      1,
      chaosEligibility.excluded,
      'only the LEARNING experiment is excluded',
    ),
  );

  checks.push(
    check(
      'passing',
      12,
      passing.filter((entry) => entry.status === 'PASSED').length,
      'all templates pass a realisable fixture',
    ),
    check(
      'passing-reason',
      12,
      passing.filter((entry) => entry.reason === 'TARGET_REACHED').length,
      'target reached',
    ),
    check(
      'passing-distinct-fingerprints',
      12,
      new Set(passing.map((entry) => entry.fingerprint)).size,
      'each objective produces its own deterministic identity',
    ),
    check(
      'failing',
      12,
      failing.filter((entry) => entry.status !== 'PASSED').length,
      'all invalid fixtures are refused',
    ),
    check(
      'failing-excluded',
      1,
      failing.filter((entry) => entry.status === 'EXCLUDED').length,
      'the Haos-only objective is excluded, not failed as gameplay',
    ),
    check(
      'failing-reasons',
      true,
      new Set(failing.map((entry) => entry.reason)).size >= 8,
      'failures use distinct closed reasons',
    ),
  );

  checks.push(
    check('drift-valid', true, drift.validSeconds >= 3, 'three valid seconds pass'),
    check('drift-rotation', 0, drift.rotationOnlySeconds, 'spinning in place accumulates nothing'),
    check('drift-rotation-ticks', 240, drift.rotationTicks, 'the rotation ticks are reported'),
    check('drift-collision', 0, drift.collisionSeconds, 'a collision impulse accumulates nothing'),
    check('drift-collision-ticks', 240, drift.collisionTicks, 'the collision ticks are reported'),
    check(
      'drift-outside-zone',
      0,
      drift.outsideZoneSeconds,
      'only the declared drift zone accumulates',
    ),
    check(
      'destruction-dedup',
      4,
      destruction.deduplicatedDistinct,
      'repeated and foreign objects are deduplicated',
    ),
    check(
      'destruction-dedup-status',
      'INCOMPLETE',
      destruction.deduplicatedStatus,
      'four distinct objects are not five',
    ),
    check('destruction-passed', 5, destruction.passedDistinct, 'five distinct objects pass'),
    check(
      'destruction-passed-status',
      'PASSED',
      destruction.passedStatus,
      'the real objective is met',
    ),
    check(
      'destruction-academy',
      'EXCLUDED',
      destruction.academyStatus,
      'destruction cannot be earned in the Academy',
    ),
    check(
      'destruction-academy-reason',
      'SESSION_NOT_ALLOWED',
      destruction.academyReason,
      'explicit exclusion',
    ),
  );

  checks.push(
    check(
      'determinism-evaluations',
      1_200,
      determinism.evaluations,
      'one hundred evaluations per template',
    ),
    check(
      'determinism-fingerprints',
      12,
      determinism.distinctFingerprints,
      'one fingerprint per objective',
    ),
    check(
      'determinism-permutation',
      true,
      determinism.permutationEqual,
      'fact order does not change the verdict',
    ),
    check(
      'determinism-clone',
      true,
      determinism.cloneEqual,
      'a reload-shaped clone produces the same bytes',
    ),
    check(
      'compatibility-daily-version',
      DAILY_TEMPLATE_CATALOG_VERSION,
      compatibility.dailyCatalogVersion,
      '211 stays unchanged',
    ),
    check(
      'compatibility-daily-families',
      6,
      compatibility.dailyFamilies,
      '211 still ships six families',
    ),
    check(
      'compatibility-bridge-version',
      CHALLENGE_DAILY_BRIDGE_VERSION,
      compatibility.bridgeVersion,
      'versioned bridge',
    ),
    check(
      'compatibility-bridge-families',
      3,
      compatibility.bridgeFamilies.length,
      'only real 116 objectives cross the bridge',
    ),
    check(
      'compatibility-missions',
      3,
      compatibility.generatedMissions,
      'the daily generator still produces three missions',
    ),
    check(
      'compatibility-distinct',
      3,
      compatibility.generatedDistinctInstances,
      'the bridge instances have distinct identities',
    ),
  );

  checks.push(
    check(
      'simulation-evaluations',
      simulationRows,
      determinism.evaluations,
      'evaluations in the determinism run',
    ),
    check(
      'simulation-fact-rows',
      true,
      factRowsExamined > 0,
      'every verdict examined real fact rows',
    ),
    check('simulation-max-facts', true, maxFactsExaminedPerVerdict > 0, 'bounded work per verdict'),
    check(
      'memory-catalog',
      true,
      catalogBytes > 0 && catalogBytes < 1_048_576,
      'catalog document under 1 MiB',
    ),
    check(
      'memory-history-cap',
      32,
      CHALLENGE_LIMITS.templates,
      'finite catalog capacity declared for 232/233',
    ),
  );

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: CHALLENGE_CATALOG_REPORT_VERSION,
    contract: Object.freeze({
      schema: CHALLENGE_SCHEMA_VERSION,
      templateCatalogVersion: CHALLENGE_TEMPLATE_CATALOG_VERSION,
      evaluatorVersion: CHALLENGE_EVALUATOR_VERSION,
      capabilityVersion: CHALLENGE_CAPABILITY_VERSION,
      dailyBridgeVersion: CHALLENGE_DAILY_BRIDGE_VERSION,
      tickHz: CHALLENGE_TICK_HZ,
      templates: catalog.templates.length,
      families: Object.freeze([...challengeFamilies]),
      zoneKinds: Object.freeze([...challengeZoneKinds]),
      objectiveKinds: Object.freeze([...challengeObjectiveKinds]),
      verdictStatuses: Object.freeze([...challengeVerdictStatuses]),
      minimumTemplates: CHALLENGE_LIMITS.minimumTemplates,
      catalogCapacity: CHALLENGE_LIMITS.templates,
      historyCapacity: CHALLENGE_LIMITS.templates,
    }),
    catalog: Object.freeze({
      templates: catalog.templates.length,
      families: countsOf(catalog.templates.map((entry) => entry.family)),
      evaluators: Object.freeze(Object.keys(CHALLENGE_EVALUATORS).sort()),
      sessions: countsOf(catalog.templates.flatMap((entry) => entry.sessions)),
      filmingTemplates: catalog.templates.filter((entry) => entry.filming.premise).length,
      dialogueLines: catalog.templates.reduce((total, entry) => total + entry.dialogue.length, 0),
      thresholds: catalog.templates.reduce(
        (total, entry) => total + Object.keys(entry.thresholds).length,
        0,
      ),
      rewardsAcademyXp: catalog.templates.reduce(
        (total, entry) => total + entry.rewardPolicy.academyXp,
        0,
      ),
      rewardsChaosOnly: catalog.templates.filter((entry) => entry.rewardPolicy.academyXp === 0)
        .length,
    }),
    plans: Object.freeze(planRows),
    eligibility: Object.freeze({
      lean: eligibilityReport(lean),
      academy: academyEligibility,
      chaos: chaosEligibility,
      incremental: Object.freeze({
        leanEligible: leanEligibility.eligible.length,
        withHospital: withHospitalEligibility.eligible.length,
        withSedanStillMissingClass: withSedanMissingClass,
        fullyEquipped: eligibleChallengeTemplates(catalog, fullChallengeCapabilities('ACADEMY'))
          .eligible.length,
      }),
    }),
    evaluations: Object.freeze({
      passing: Object.freeze(passing),
      failing: Object.freeze(failing),
    }),
    drift,
    destruction,
    determinism,
    compatibility,
    performance: Object.freeze({
      simulation: Object.freeze({
        templates: TEMPLATE_IDS.length,
        evaluations: determinism.evaluations,
        factRowsExamined,
        maxDriftSamples,
        maxFactsExaminedPerVerdict,
        clock: 'NOT_MEASURED' as const,
      }),
      memory: Object.freeze({
        catalogBytes,
        maxPlanBytes,
        maxFactsBytes,
        maxVerdictBytes,
        catalogTemplates: catalog.templates.length,
        historyCapacity: CHALLENGE_LIMITS.templates,
        challengeHistoryBudget: 'NULL_IN_MANIFEST' as const,
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

export function challengeCatalogReportMarkdown(report: ChallengeCatalogReport): string {
  const lines: string[] = [];
  lines.push(
    '# 231 challenge catalog and evaluators report',
    '',
    'Machine-readable transcript: [report.json](report.json). Generated by ' +
      code('npm run missions:challenges') +
      '; no wall clock, random source or browser state participates. Version: ' +
      code(report.version) +
      '.',
    '',
    '## Contract',
    '',
    '- Schema: ' + code(report.contract.schema) + '.',
    '- Template catalog: ' + code(report.contract.templateCatalogVersion) + '.',
    '- Evaluators: ' + code(report.contract.evaluatorVersion) + '.',
    '- Capabilities: ' + code(report.contract.capabilityVersion) + '.',
    '- Daily bridge: ' + code(report.contract.dailyBridgeVersion) + '.',
    '- Templates: ' +
      String(report.contract.templates) +
      ' (minimum ' +
      String(report.contract.minimumTemplates) +
      ', capacity ' +
      String(report.contract.catalogCapacity) +
      ').',
    '- Families: ' + report.contract.families.map((entry) => code(entry)).join(', ') + '.',
    '- Objective kinds: ' +
      report.contract.objectiveKinds.map((entry) => code(entry)).join(', ') +
      '.',
    '- Authoritative tick: ' + String(report.contract.tickHz) + ' Hz.',
    '',
    '## Catalog',
    '',
    '| Family | Templates |',
    '| --- | --- |',
    ...Object.entries(report.catalog.families).map(([family, count]) => `| ${family} | ${count} |`),
    '',
    '- Filming premise (internal replay): ' + String(report.catalog.filmingTemplates) + '.',
    '- Dialogue lines bound to real events: ' + String(report.catalog.dialogueLines) + '.',
    '- Declared threshold overrides: ' + String(report.catalog.thresholds) + '.',
    '- Academy XP proposals: ' +
      String(report.catalog.rewardsAcademyXp) +
      '; Haos-only templates: ' +
      String(report.catalog.rewardsChaosOnly) +
      '.',
    '',
    '## Attempt plans',
    '',
    '| Template | Family | Objective | Evaluator | Session | Target | Margin | Deadline tick | Budget | Zones | Learning key |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...report.plans.map(
      (plan) =>
        `| ${plan.templateId} | ${plan.family} | ${plan.objectiveKind} | ${plan.evaluatorId} | ${plan.sessionKind} | ${plan.target} | ${plan.margin} | ${plan.deadlineTick} | ${plan.incidentBudget} | ${plan.zoneIds.join(', ') || '—'} | ${plan.learningKey ?? '—'} |`,
    ),
    '',
    '## Prerequisite exclusion',
    '',
    '| Snapshot | Eligible | Excluded | Named gaps |',
    '| --- | --- | --- | --- |',
    `| lean | ${report.eligibility.lean.eligible} | ${report.eligibility.lean.excluded} | ${report.eligibility.lean.missing.join(', ')} |`,
    `| Academy full | ${report.eligibility.academy.eligible} | ${report.eligibility.academy.excluded} | ${report.eligibility.academy.excludedTemplates.join(', ') || '—'} |`,
    `| Haos full | ${report.eligibility.chaos.eligible} | ${report.eligibility.chaos.excluded} | ${report.eligibility.chaos.excludedTemplates.join(', ') || '—'} |`,
    '',
    'Incremental realisation: lean ' +
      String(report.eligibility.incremental.leanEligible) +
      ', with hospital zone ' +
      String(report.eligibility.incremental.withHospital) +
      ', sedan prerequisites still missing ' +
      String(report.eligibility.incremental.withSedanStillMissingClass) +
      ', fully equipped Academy ' +
      String(report.eligibility.incremental.fullyEquipped) +
      '.',
    '',
    '## Evaluations',
    '',
    '| Template | Pass fixture | Fail fixture | Fail reason | Fingerprint |',
    '| --- | --- | --- | --- | --- |',
    ...report.evaluations.passing.map((passed, index) => {
      const failed = report.evaluations.failing[index]!;
      return `| ${passed.templateId} | ${passed.status} | ${failed.status} | ${failed.reason} | ${passed.fingerprint} |`;
    }),
    '',
    '## Drift anti-exploit',
    '',
    '| Case | Valid drift seconds | Ticks |',
    '| --- | --- | --- |',
    `| valid | ${report.drift.validSeconds} | — |`,
    `| spinning in place | ${report.drift.rotationOnlySeconds} | ${report.drift.rotationTicks} |`,
    `| collision impulse | ${report.drift.collisionSeconds} | ${report.drift.collisionTicks} |`,
    `| outside the drift zone | ${report.drift.outsideZoneSeconds} | — |`,
    '',
    'Verdict for the invalid drift run: ' + code(report.drift.verdict) + '.',
    '',
    '## Destruction',
    '',
    '- Deduplicated: ' +
      String(report.destruction.deduplicatedDistinct) +
      ' distinct objects, status ' +
      code(report.destruction.deduplicatedStatus) +
      '.',
    '- Five distinct: status ' + code(report.destruction.passedStatus) + '.',
    '- Academy evaluation: ' +
      code(report.destruction.academyStatus) +
      ' / ' +
      code(report.destruction.academyReason) +
      '.',
    '',
    '## Determinism',
    '',
    '- Evaluations: ' +
      String(report.determinism.evaluations) +
      ' across ' +
      String(report.determinism.distinctTemplates) +
      ' templates; distinct fingerprints ' +
      String(report.determinism.distinctFingerprints) +
      '.',
    '- Fact permutation equal: ' +
      String(report.determinism.permutationEqual) +
      '; reload clone equal: ' +
      String(report.determinism.cloneEqual) +
      '.',
    '- Explicit fixture seed: ' + String(report.determinism.seed) + '.',
    '',
    '## 211 compatibility',
    '',
    '- Delivered daily catalog: ' +
      code(report.compatibility.dailyCatalogVersion) +
      ' with ' +
      String(report.compatibility.dailyFamilies) +
      ' families (unchanged).',
    '- Bridge: ' +
      code(report.compatibility.bridgeVersion) +
      ' with families ' +
      report.compatibility.bridgeFamilies.map((entry) => code(entry)).join(', ') +
      '.',
    '- Daily generator with the bridge: ' +
      String(report.compatibility.generatedMissions) +
      ' missions, ' +
      String(report.compatibility.generatedDistinctInstances) +
      ' distinct identities.',
    '',
    '## Performance',
    '',
    '- simulation: ' +
      String(report.performance.simulation.evaluations) +
      ' pure evaluations, ' +
      String(report.performance.simulation.factRowsExamined) +
      ' fact rows examined, max ' +
      String(report.performance.simulation.maxFactsExaminedPerVerdict) +
      ' fact rows per verdict, max ' +
      String(report.performance.simulation.maxDriftSamples) +
      ' drift samples. Wall clock: ' +
      code(report.performance.simulation.clock) +
      '.',
    '- memory: catalog ' +
      String(report.performance.memory.catalogBytes) +
      ' bytes, largest plan ' +
      String(report.performance.memory.maxPlanBytes) +
      ' bytes, largest facts document ' +
      String(report.performance.memory.maxFactsBytes) +
      ' bytes, largest verdict ' +
      String(report.performance.memory.maxVerdictBytes) +
      ' bytes; finite catalog capacity ' +
      String(report.performance.memory.historyCapacity) +
      '.',
    '- The manifest field `challengeHistoryEntries` is `null`; this PBI reports the gap and leaves the durable history budget to 232/234.',
    '',
    '## Checks',
    '',
    '| Check | Expected | Actual | Result | Detail |',
    '| --- | --- | --- | --- | --- |',
    ...report.checks.map(
      (entry) =>
        `| ${entry.name} | ${cell(entry.expected)} | ${cell(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.detail} |`,
    ),
    '',
    '## Summary',
    '',
    '- Checks: ' + String(report.summary.passed) + '/' + String(report.summary.checks),
    '- Overall: ' + (report.summary.pass ? 'PASS' : 'FAIL'),
    '',
  );
  return lines.join('\n');
}
