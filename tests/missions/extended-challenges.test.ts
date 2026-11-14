import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  CHALLENGE_TEMPLATE_CATALOG_VERSION,
  EXTENDED_CHALLENGE_CATALOG_VERSION,
  EXTENDED_CHALLENGE_LIMITS,
  EXTENDED_CHALLENGE_SCHEMA_VERSION,
  EXTENDED_CHALLENGE_TICK_HZ,
  EXTENDED_CHALLENGE_V1_CONTEXT_VERSION,
  createChallengeTemplateCatalog,
  createComposedChallengeCatalog,
  createExtendedChallengeCapabilities,
  deriveExtendedThreshold,
  eligibleExtendedChallenges,
  evaluateExtendedChallenge,
  extendedChallengeEvaluatorDefinition,
  extendedChallengeEvaluatorIds,
  extendedChallengeFamilies,
  extendedChallengeLearningKeys,
  extendedChallengePrerequisitesMissing,
  extendedChallengeVerdictReasons,
  extendedThresholdDerivations,
  importV1ProgressContext,
  isExtendedLearningKey,
  parseExtendedChallengeCatalog,
  planExtendedChallengeAttempt,
} from '../../src/missions';
import type {
  ExtendedChallengeCatalog,
  ExtendedChallengeThreshold,
  ExtendedThresholdDerivation,
} from '../../src/missions';
import { parameterDefinitions } from '../../src/profiles';
import {
  EXTENDED_FIXTURE_SEED,
  V1_ACCESS_DIGEST,
  V1_ACCESS_EXPECTATION,
  V1_CATALOG_DIGEST,
  V1_CHALLENGE_TEMPLATE_IDS,
  V1_CHECKPOINT_DIGEST,
  V1_PLAYER_DIGEST,
  V1_PROGRESS_DIGEST,
  V1_UNLOCKS_DIGEST,
  extendedCatalog,
  extendedChallenge,
  extendedFacts,
  extendedPlan,
  failingExtendedFacts,
  fullExtendedCapabilities,
  leanExtendedCapabilities,
  passingExtendedFacts,
  v1PreservationSnapshot,
} from './extended-challenges-fixture';

const CHALLENGE_IDS = [
  'v2-challenge-crosswalk-approach',
  'v2-challenge-dropoff-curb',
  'v2-challenge-emergency-brake',
  'v2-challenge-green-launch',
  'v2-challenge-hazard-reaction',
  'v2-challenge-obstacle-clearance',
  'v2-challenge-pedestrian-clearance',
  'v2-challenge-pedestrian-yield',
  'v2-challenge-pickup-dwell',
  'v2-challenge-pickup-precision',
  'v2-challenge-red-gap',
  'v2-challenge-reroute-patience',
  'v2-challenge-reverse-recovery',
  'v2-challenge-u-turn-discipline',
  'v2-challenge-yellow-decision',
] as const;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function refuses(action: () => unknown, pattern: RegExp): void {
  assert.throws(action, pattern);
}

function rawChallenge(challengeId = 'v2-challenge-pedestrian-clearance'): Record<string, unknown> {
  const raw = JSON.parse(JSON.stringify(extendedChallenge(challengeId))) as Record<string, unknown>;
  const threshold = raw['threshold'] as Record<string, unknown>;
  raw['keyValue'] = threshold['keyValue'];
  if (
    threshold['derivation'] === 'MIN_YIELDS_PER_OPPORTUNITY' ||
    threshold['derivation'] === 'MAX_COUNT_PER_OPPORTUNITY'
  )
    raw['opportunities'] = threshold['opportunities'];
  delete raw['threshold'];
  delete raw['target'];
  delete raw['observations'];
  return raw;
}

function catalogWith(challenges: readonly unknown[]): Record<string, unknown> {
  return {
    schemaVersion: 1,
    units: 'SI',
    version: '188-test-catalog',
    challenges,
  };
}

function digest(value: unknown): string {
  const canonical = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/** The V2 key set of the 187 table, derived from the delivered catalog stage. */
const v2Keys = parameterDefinitions
  .filter((entry) => entry.implementationStage === 'extension')
  .map((entry) => entry.key);

test('188 contract: five families, fifteen challenges and one real V2 key each', () => {
  assert.equal(EXTENDED_CHALLENGE_SCHEMA_VERSION, '188-extended-challenges-v1');
  assert.equal(EXTENDED_CHALLENGE_CATALOG_VERSION, '188-extended-challenge-catalog-v1');
  assert.equal(EXTENDED_CHALLENGE_TICK_HZ, 60);
  assert.equal(EXTENDED_CHALLENGE_LIMITS.minimumChallenges, 5);
  assert.deepEqual(
    [...extendedChallengeFamilies],
    ['PEDESTRIAN', 'ROUTING', 'SIGNALLING', 'HAZARD', 'SERVICE'],
  );
  assert.equal(extendedChallengeEvaluatorIds.length, 15);
  assert.equal(new Set(extendedChallengeEvaluatorIds).size, 15);
  assert.equal(
    new Set(extendedChallengeVerdictReasons).size,
    extendedChallengeVerdictReasons.length,
  );
  const catalog = extendedCatalog();
  assert.equal(catalog.version, EXTENDED_CHALLENGE_CATALOG_VERSION);
  assert.equal(catalog.challenges.length, 15);
  assert.deepEqual(
    catalog.challenges.map((entry) => entry.challengeId),
    [...CHALLENGE_IDS].sort(),
  );
  const perFamily = new Map<string, number>();
  for (const challenge of catalog.challenges) {
    perFamily.set(challenge.family, (perFamily.get(challenge.family) ?? 0) + 1);
    assert.equal(challenge.version, '1');
    assert.equal(challenge.controlRequirement, 'MANUAL');
    assert.equal(challenge.scoring, 'OBSERVABLE_FACTS_ONLY');
    assert.equal(challenge.learningKeys.length, 1);
    assert.ok(isExtendedLearningKey(challenge.learningKeys[0]!), challenge.challengeId);
    assert.ok(v2Keys.includes(challenge.learningKeys[0]!), challenge.challengeId);
    assert.ok(challenge.title.length > 0 && challenge.label.length > 0);
    assert.ok(challenge.explanation.why.length >= 20);
    assert.ok(challenge.explanation.feels.length >= 20);
    assert.ok(
      challenge.observations.includes(challenge.explanation.observation),
      `${challenge.challengeId} explanation is bound to a real observation`,
    );
    assert.ok(challenge.deadline.referenceSeconds >= 60);
    assert.ok(challenge.deadline.referenceSeconds <= 240);
    assert.equal(challenge.threshold.key, challenge.learningKeys[0]);
    assert.equal(
      challenge.threshold.comparison,
      extendedChallengeEvaluatorDefinition(challenge.evaluatorId).comparison,
    );
    assert.equal(
      challenge.threshold.unit,
      extendedChallengeEvaluatorDefinition(challenge.evaluatorId).unit,
    );
  }
  for (const family of extendedChallengeFamilies) assert.equal(perFamily.get(family), 3, family);
  assert.equal(
    new Set(catalog.challenges.map((entry) => entry.learningKeys[0])).size,
    15,
    'the delivered catalog covers fifteen distinct V2 keys',
  );
  assert.equal(new Set(catalog.challenges.map((entry) => entry.evaluatorId)).size, 15);
  assert.equal(extendedChallengeLearningKeys.length, 56);
  for (const key of extendedChallengeLearningKeys) assert.ok(v2Keys.includes(key), key);
});

test('188 a threshold is derived from its key and structurally matches the measured unit', () => {
  const expectedCatalogUnit: Readonly<Record<ExtendedThresholdDerivation, string>> = {
    MIN_METRES: 'm',
    MAX_METRES: 'm',
    MAX_SPEED_MPS: 'm/s',
    MAX_ACCEL_MPS2: 'm/s²',
    MIN_TICKS: 's',
    MAX_TICKS: 's',
    MIN_RATIO: 'ratio',
    MIN_YIELDS_PER_OPPORTUNITY: 'probability',
    MAX_COUNT_PER_OPPORTUNITY: 'probability',
  };
  for (const derivation of extendedThresholdDerivations)
    assert.ok(expectedCatalogUnit[derivation].length > 0);
  for (const challenge of extendedCatalog().challenges) {
    const definition = extendedChallengeEvaluatorDefinition(challenge.evaluatorId);
    const recomputed = deriveExtendedThreshold({
      learningKey: challenge.learningKeys[0]!,
      keyValue: challenge.threshold.keyValue,
      derivation: definition.derivation,
      ...(definition.derivation === 'MIN_YIELDS_PER_OPPORTUNITY' ||
      definition.derivation === 'MAX_COUNT_PER_OPPORTUNITY'
        ? { opportunities: challenge.threshold.opportunities }
        : {}),
      ...(definition.floor === null ? {} : { floor: definition.floor }),
    });
    assert.deepEqual(recomputed, challenge.threshold, challenge.challengeId);
    assert.equal(challenge.threshold.catalogUnit, expectedCatalogUnit[definition.derivation]);
    const source = parameterDefinitions.find((entry) => entry.key === challenge.threshold.key);
    assert.ok(source !== undefined);
    assert.equal(challenge.threshold.catalogDefault, source.default);
    assert.ok(challenge.threshold.keyValue >= source.min);
    assert.ok(challenge.threshold.keyValue <= source.max);
    if (definition.targetKind === 'THRESHOLD') assert.equal(challenge.target, recomputed.value);
    else assert.equal(challenge.target, 1);
  }
});

test('188 a bigger key value moves its threshold in the direction the key governs', () => {
  const cases: readonly [string, ExtendedThresholdDerivation, number, number, number][] = [
    ['pedestrian_yield_probability', 'MIN_YIELDS_PER_OPPORTUNITY', 0.25, 1, 4],
    ['pedestrian_clearance', 'MIN_METRES', 0.5, 6, 0],
    ['crosswalk_approach_speed', 'MAX_SPEED_MPS', 2, 12, 0],
    ['reroute_patience', 'MIN_TICKS', 2, 60, 0],
    ['u_turn_willingness', 'MAX_COUNT_PER_OPPORTUNITY', 0, 1, 0],
    ['reverse_recovery_duration', 'MIN_TICKS', 2, 6, 0],
    ['red_run_gap_acceptance', 'MIN_TICKS', 0.5, 6, 0],
    ['yellow_stop_probability', 'MIN_YIELDS_PER_OPPORTUNITY', 0.25, 1, 0],
    ['green_launch_acceleration', 'MAX_ACCEL_MPS2', 0.5, 5, 0],
    ['obstacle_clearance', 'MIN_METRES', 0.5, 3, 0],
    ['hazard_reaction_delay', 'MAX_TICKS', 0.2, 2, 0],
    ['emergency_brake_intensity', 'MIN_RATIO', 0.4, 1, 0],
    ['pickup_stop_precision', 'MAX_METRES', 0.2, 4, 0],
    ['pickup_dwell_time', 'MIN_TICKS', 1, 8, 0],
    ['dropoff_curb_distance', 'MAX_METRES', 0.2, 1.5, 0],
  ];
  for (const [key, derivation, low, high, opportunities] of cases) {
    const source = parameterDefinitions.find((entry) => entry.key === key);
    assert.ok(source !== undefined, key);
    const derive = (keyValue: number): ExtendedChallengeThreshold =>
      deriveExtendedThreshold({
        learningKey: key,
        keyValue,
        derivation,
        ...(derivation === 'MIN_YIELDS_PER_OPPORTUNITY' ||
        derivation === 'MAX_COUNT_PER_OPPORTUNITY'
          ? { opportunities: opportunities === 0 ? 4 : opportunities }
          : {}),
        ...(key === 'reverse_recovery_duration' ? { floor: 2.5 } : {}),
      });
    const lowValue = derive(Math.max(source.min, low));
    const highValue = derive(Math.min(source.max, high));
    assert.ok(highValue.value > lowValue.value, `${key}: ${lowValue.value} -> ${highValue.value}`);
    assert.equal(lowValue.comparison, highValue.comparison);
    assert.equal(lowValue.unit, highValue.unit);
  }
  refuses(
    () =>
      deriveExtendedThreshold({
        learningKey: 'pedestrian_clearance',
        keyValue: 2,
        derivation: 'MAX_TICKS',
      }),
    /not in s; the derivation does not measure it/,
  );
  refuses(
    () =>
      deriveExtendedThreshold({
        learningKey: 'speed_delta_urban',
        keyValue: 1,
        derivation: 'MIN_METRES',
      }),
    /Not a V2 learning key of the 187 table/,
  );
});

test('188 each challenge passes a realizable fixture and fails an invalid one', () => {
  for (const challengeId of CHALLENGE_IDS) {
    const plan = extendedPlan(challengeId);
    const passed = evaluateExtendedChallenge({
      objective: plan.objective,
      facts: passingExtendedFacts(challengeId),
    });
    assert.equal(passed.status, 'PASSED', `${challengeId}: ${passed.reason}`);
    assert.equal(passed.reason, 'TARGET_REACHED');
    assert.equal(passed.progress, passed.target);
    assert.notEqual(passed.fingerprint, '');
    assert.equal(passed.profileWrites, 0);
    assert.equal(passed.learningJobs, 0);
    assert.equal(passed.measured.unit, plan.objective.threshold.unit);
    assert.equal(passed.measured.threshold, plan.objective.threshold.value);
    const failure = failingExtendedFacts(challengeId);
    const verdict = evaluateExtendedChallenge({
      objective: plan.objective,
      facts: failure.facts,
    });
    assert.equal(verdict.status, failure.expectedStatus, `${challengeId}: ${verdict.reason}`);
    assert.equal(verdict.reason, failure.expectedReason, challengeId);
    assert.ok(Object.isFrozen(verdict));
    assert.ok(Object.isFrozen(verdict.measured));
  }
});

test('188 the evaluator flips exactly at the derived threshold of the governed fact', () => {
  const clearance = extendedPlan('v2-challenge-pedestrian-clearance');
  const threshold = clearance.objective.threshold.value;
  const atThreshold = extendedFacts(clearance, {
    pedestrianCrossings: [
      {
        crossingId: 'crossing:at',
        pedestrianEnteredTick: 100,
        pedestrianClearedTick: 200,
        egoEnteredTick: 300,
        egoClearedTick: 340,
        minimumClearanceM: threshold,
        approachSpeedMps: 4,
      },
    ],
  });
  assert.equal(
    evaluateExtendedChallenge({ objective: clearance.objective, facts: atThreshold }).status,
    'PASSED',
  );
  const below = clone(atThreshold) as Record<string, unknown>;
  below['pedestrianCrossings'] = [
    {
      crossingId: 'crossing:below',
      pedestrianEnteredTick: 100,
      pedestrianClearedTick: 200,
      egoEnteredTick: 300,
      egoClearedTick: 340,
      minimumClearanceM: threshold - 0.01,
      approachSpeedMps: 4,
    },
  ];
  assert.equal(
    evaluateExtendedChallenge({ objective: clearance.objective, facts: below }).reason,
    'CLEARANCE_SHORTFALL',
  );

  const reaction = extendedPlan('v2-challenge-hazard-reaction');
  const reactionThreshold = reaction.objective.threshold.value;
  const reactionFacts = (reactionTicks: number) => {
    const current = extendedPlan('v2-challenge-hazard-reaction');
    return extendedFacts(current, {
      hazardPasses: [
        {
          hazardId: 'hazard:at',
          stimulusTick: 100,
          brakeTick: 100 + reactionTicks,
          minimumClearanceM: 2,
          collisionImpulseNs: 0,
          availableDecelMps2: 6,
          appliedDecelMps2: 6,
          requiredStopTick: 900,
          stoppedTick: 800,
        },
      ],
    });
  };
  assert.equal(
    evaluateExtendedChallenge({
      objective: reaction.objective,
      facts: reactionFacts(reactionThreshold),
    }).status,
    'PASSED',
  );
  assert.equal(
    evaluateExtendedChallenge({
      objective: reaction.objective,
      facts: reactionFacts(reactionThreshold + 1),
    }).reason,
    'REACTION_TOO_SLOW',
  );

  const red = extendedPlan('v2-challenge-red-gap');
  const redThreshold = red.objective.threshold.value;
  const redFacts = (gapTicks: number) => {
    const current = extendedPlan('v2-challenge-red-gap');
    return extendedFacts(current, {
      signalOpportunities: [
        {
          opportunityId: 'red:boundary',
          tick: 100,
          phase: 'RED',
          feasibleStop: false,
          stopTick: null,
          crossingTick: 130,
          crossTrafficGapS: gapTicks / 60,
          releaseTick: null,
          launchTick: null,
          launchAccelerationMps2: null,
        },
      ],
    });
  };
  assert.equal(
    evaluateExtendedChallenge({ objective: red.objective, facts: redFacts(redThreshold) }).status,
    'PASSED',
  );
  assert.equal(
    evaluateExtendedChallenge({
      objective: red.objective,
      facts: redFacts(redThreshold - 1),
    }).reason,
    'RED_GAP_SHORTFALL',
  );
});

test('188 no challenge accepts a score, a boolean verdict or a foreign field', () => {
  const plan = extendedPlan('v2-challenge-obstacle-clearance');
  const facts = clone(passingExtendedFacts('v2-challenge-obstacle-clearance')) as Record<
    string,
    unknown
  >;
  facts['score'] = 100;
  refuses(
    () => evaluateExtendedChallenge({ objective: plan.objective, facts }),
    /Unknown extended challenge facts field: score/,
  );
  const withYielded = extendedFacts(extendedPlan('v2-challenge-pedestrian-yield'), {
    pedestrianCrossings: [
      {
        crossingId: 'crossing:score',
        pedestrianEnteredTick: 100,
        pedestrianClearedTick: 200,
        egoEnteredTick: 300,
        egoClearedTick: 340,
        minimumClearanceM: 3,
        approachSpeedMps: 4,
        yielded: true,
      },
    ],
  });
  refuses(
    () =>
      evaluateExtendedChallenge({
        objective: extendedPlan('v2-challenge-pedestrian-yield').objective,
        facts: withYielded,
      }),
    /Unknown extended pedestrian crossing field: yielded/,
  );
  const source = readFileSync(
    join(process.cwd(), 'src', 'missions', 'extended-challenges.ts'),
    'utf8',
  );
  assert.ok(!source.includes('Math.random('), 'the evaluators never use Math.random');
  assert.ok(!source.includes('Date.now('), 'the evaluators never read the wall clock');
  assert.ok(!source.includes('document.'), 'the module never touches the DOM');
});

test('188 evaluators are deterministic, pure and permutation invariant', () => {
  for (const challengeId of CHALLENGE_IDS) {
    const plan = extendedPlan(challengeId);
    const facts = passingExtendedFacts(challengeId);
    const first = evaluateExtendedChallenge({ objective: plan.objective, facts });
    const second = evaluateExtendedChallenge({
      objective: clone(plan.objective),
      facts: clone(facts),
    });
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    assert.equal(first.fingerprint, second.fingerprint);
    const reversed = clone(facts);
    reversed.pedestrianCrossings = [...reversed.pedestrianCrossings].reverse();
    reversed.routeDecisions = [...reversed.routeDecisions].reverse();
    reversed.recoveryAttempts = [...reversed.recoveryAttempts].reverse();
    reversed.signalOpportunities = [...reversed.signalOpportunities].reverse();
    reversed.hazardPasses = [...reversed.hazardPasses].reverse();
    reversed.serviceStops = [...reversed.serviceStops].reverse();
    const permuted = evaluateExtendedChallenge({ objective: plan.objective, facts: reversed });
    assert.equal(permuted.status, first.status);
    assert.deepEqual(permuted.measured, first.measured);
    const altered = clone(facts) as Record<string, unknown>;
    altered['incidents'] = plan.objective.incidentBudget + 1;
    assert.notEqual(
      evaluateExtendedChallenge({ objective: plan.objective, facts: altered }).fingerprint,
      first.fingerprint,
    );
  }
  const firstPlan = extendedPlan('v2-challenge-pedestrian-yield');
  const secondPlan = extendedPlan('v2-challenge-pedestrian-yield', {
    seed: EXTENDED_FIXTURE_SEED + 1,
  });
  assert.ok(firstPlan.instanceId.startsWith('id-v1:'));
  assert.notEqual(firstPlan.instanceId, secondPlan.instanceId);
});

test('188 missing prerequisites exclude a challenge explicitly, never generate it', () => {
  const lean = leanExtendedCapabilities();
  const eligibility = eligibleExtendedChallenges(extendedCatalog(), lean);
  assert.equal(eligibility.eligible.length, 0);
  assert.equal(eligibility.excluded.length, 15);
  const reasons = eligibility.excluded.flatMap((entry) => entry.missing);
  assert.ok(reasons.includes('CONTROL:MANUAL'));
  assert.ok(reasons.includes('CAPABILITY:MANUAL_CONTROL'));
  assert.ok(reasons.includes('CAPABILITY:V2_LEARNING_KEYS'));
  assert.ok(reasons.includes('CAPABILITY:PEDESTRIAN_TRAFFIC'));
  assert.ok(reasons.includes('LEARNING_KEY:pedestrian_clearance'));
  assert.ok(reasons.includes('LEARNING_KEY:pickup_dwell_time'));
  const keyless = createExtendedChallengeCapabilities({
    ...lean,
    controlModes: ['MANUAL'],
    capabilities: [
      'FREE_DRIVE',
      'MANUAL_CONTROL',
      'V2_LEARNING_KEYS',
      'PEDESTRIAN_TRAFFIC',
      'ROUTE_ALTERNATIVES',
      'SIGNAL_OPPORTUNITIES',
      'HAZARD_STIMULI',
      'SERVICE_STOPS',
    ],
    campaignCompleted: 2,
  });
  assert.deepEqual(
    extendedChallengePrerequisitesMissing(extendedChallenge('v2-challenge-pickup-dwell'), keyless),
    ['LEARNING_KEY:pickup_dwell_time'],
  );
  assert.deepEqual(
    extendedChallengePrerequisitesMissing(
      extendedChallenge('v2-challenge-pickup-dwell'),
      fullExtendedCapabilities(),
    ),
    [],
  );
  refuses(
    () =>
      extendedPlan('v2-challenge-pickup-dwell', {
        capabilities: keyless,
      }),
    /excluded: LEARNING_KEY:pickup_dwell_time/,
  );
  const full = eligibleExtendedChallenges(extendedCatalog(), fullExtendedCapabilities());
  assert.equal(full.eligible.length, 15);
  assert.equal(full.excluded.length, 0);
  const chaos = eligibleExtendedChallenges(extendedCatalog(), fullExtendedCapabilities('CHAOS'));
  assert.equal(chaos.eligible.length, 15);
});

test('188 exclusions, incident budget, deadline and opportunity mismatch are explicit', () => {
  const plan = extendedPlan('v2-challenge-pickup-precision');
  const facts = passingExtendedFacts('v2-challenge-pickup-precision');
  const auto = evaluateExtendedChallenge({
    objective: plan.objective,
    facts: { ...facts, controlSource: 'AUTO' },
  });
  assert.equal(auto.status, 'EXCLUDED');
  assert.equal(auto.reason, 'CONTROL_NOT_ALLOWED');
  const chaos = evaluateExtendedChallenge({
    objective: plan.objective,
    facts: { ...facts, sessionKind: 'CHAOS' },
  });
  assert.equal(chaos.status, 'EXCLUDED');
  assert.equal(chaos.reason, 'SESSION_NOT_ALLOWED');
  const budget = evaluateExtendedChallenge({
    objective: plan.objective,
    facts: { ...facts, incidents: plan.objective.incidentBudget + 1 },
  });
  assert.equal(budget.status, 'FAILED');
  assert.equal(budget.reason, 'INCIDENT_BUDGET_EXCEEDED');
  const late = evaluateExtendedChallenge({
    objective: plan.objective,
    facts: { ...facts, endedTick: plan.objective.deadlineTick, serviceStops: [] },
  });
  assert.equal(late.status, 'FAILED');
  assert.equal(late.reason, 'NO_OPPORTUNITY');
  const mismatch = evaluateExtendedChallenge({
    objective: extendedPlan('v2-challenge-yellow-decision').objective,
    facts: {
      ...passingExtendedFacts('v2-challenge-yellow-decision'),
      signalOpportunities: [
        {
          opportunityId: 'yellow:only-one',
          tick: 100,
          phase: 'YELLOW',
          feasibleStop: true,
          stopTick: 120,
          crossingTick: null,
          crossTrafficGapS: null,
          releaseTick: null,
          launchTick: null,
          launchAccelerationMps2: null,
        },
      ],
    },
  });
  assert.equal(mismatch.status, 'EXCLUDED');
  assert.equal(mismatch.reason, 'OPPORTUNITY_MISMATCH');
});

test('188 the delivered 231 catalog is untouched and the composed catalog adds 15', () => {
  const v1 = createChallengeTemplateCatalog();
  assert.equal(v1.version, CHALLENGE_TEMPLATE_CATALOG_VERSION);
  assert.equal(v1.templates.length, 12);
  assert.deepEqual(
    v1.templates.map((entry) => entry.templateId),
    [...V1_CHALLENGE_TEMPLATE_IDS].sort(),
  );
  for (const template of v1.templates) assert.equal(template.version, '1');
  assert.equal(digest(v1), V1_CATALOG_DIGEST);
  const composed = createComposedChallengeCatalog();
  assert.equal(composed.counts.v1, 12);
  assert.equal(composed.counts.extended, 15);
  assert.equal(composed.counts.total, 27);
  assert.deepEqual(composed.families, extendedChallengeFamilies);
  assert.equal(composed.learningKeys.length, 15);
  for (const challenge of composed.extended.challenges)
    assert.ok(
      !composed.v1.templates.some((template) => template.templateId === challenge.challengeId),
    );
  assert.notEqual(digest(createComposedChallengeCatalog()), '');
});

test('188 V1 progress import and vehicle access are byte-identical before and after', () => {
  const before = v1PreservationSnapshot();
  assert.deepEqual(before.access, V1_ACCESS_EXPECTATION);
  assert.equal(before.progressDigest, V1_PROGRESS_DIGEST);
  assert.equal(before.unlocksDigest, V1_UNLOCKS_DIGEST);
  assert.equal(digest(before.accessJson), V1_ACCESS_DIGEST);
  assert.equal(digest(before.playerProgressJson), V1_PLAYER_DIGEST);
  assert.equal(digest(before.playerProgressCheckpointJson), V1_CHECKPOINT_DIGEST);
  assert.equal(before.progress.completedMissionIds.length, 8);
  assert.equal(before.unlocks.monotone, true);
  const progressJsonBefore = before.progressJson;
  const unlocksJsonBefore = before.unlocksJson;
  const importBefore = importV1ProgressContext(before.progress, before.unlocks);
  assert.equal(importBefore.version, EXTENDED_CHALLENGE_V1_CONTEXT_VERSION);
  assert.equal(importBefore.completedMissionIds.length, 8);
  assert.equal(importBefore.profileWrites, 0);
  assert.equal(importBefore.learningJobs, 0);
  assert.equal(importBefore.progressDigest.length, 'fnv1a32:00000000'.length);
  assert.equal(before.progressJson, progressJsonBefore);
  assert.equal(before.unlocksJson, unlocksJsonBefore);

  // Every delivered extended feature runs here: catalog, eligibility, plan, evaluation, import.
  const composed = createComposedChallengeCatalog();
  assert.equal(composed.counts.extended, 15);
  const eligibility = eligibleExtendedChallenges(composed.extended, fullExtendedCapabilities());
  assert.equal(eligibility.eligible.length, 15);
  for (const challengeId of CHALLENGE_IDS) {
    const plan = extendedPlan(challengeId);
    assert.equal(
      evaluateExtendedChallenge({
        objective: plan.objective,
        facts: passingExtendedFacts(challengeId),
      }).status,
      'PASSED',
    );
  }
  const importAfter = importV1ProgressContext(before.progress, before.unlocks);

  const after = v1PreservationSnapshot();
  assert.equal(after.progressJson, before.progressJson);
  assert.equal(after.unlocksJson, before.unlocksJson);
  assert.equal(after.accessJson, before.accessJson);
  assert.equal(after.progressDigest, V1_PROGRESS_DIGEST);
  assert.equal(after.unlocksDigest, V1_UNLOCKS_DIGEST);
  assert.equal(digest(after.accessJson), V1_ACCESS_DIGEST);
  assert.equal(after.playerProgressJson, before.playerProgressJson);
  assert.equal(after.playerProgressCheckpointJson, before.playerProgressCheckpointJson);
  assert.equal(digest(after.playerProgressJson), V1_PLAYER_DIGEST);
  assert.equal(digest(after.playerProgressCheckpointJson), V1_CHECKPOINT_DIGEST);
  assert.deepEqual(after.access, V1_ACCESS_EXPECTATION);
  assert.equal(importAfter.progressDigest, importBefore.progressDigest);
  assert.equal(importAfter.unlocksDigest, importBefore.unlocksDigest);
  assert.equal(importAfter.vehicleClasses.length, 2);
  assert.ok(importAfter.vehicleClasses.includes('sedan'));
  assert.ok(importAfter.vehicleClasses.includes('compact'));
  assert.deepEqual(importBefore.completedMissionIds, importAfter.completedMissionIds);
});

test('188 the catalog validator refuses contradictions and foreign data', () => {
  refuses(
    () => parseExtendedChallengeCatalog(catalogWith(extendedCatalog().challenges.slice(0, 4))),
    /declares 5..32 challenges/,
  );
  const duplicate = clone(extendedCatalog()) as unknown as ExtendedChallengeCatalog;
  const challenges = duplicate.challenges.map((entry) => clone(entry));
  challenges.push({
    ...clone(challenges[0]!),
    challengeId: 'v2-challenge-duplicate',
    title: 'Duplicat',
  });
  refuses(
    () =>
      parseExtendedChallengeCatalog({
        schemaVersion: 1,
        units: 'SI',
        version: '188-test',
        challenges,
      }),
    /describe the same objective|Duplicate extended challenge id/,
  );
  const learningKeyOnUnknown = rawChallenge();
  learningKeyOnUnknown['learningKeys'] = ['speed_delta_urban'];
  refuses(
    () => parseExtendedChallengeCatalog(catalogWith([learningKeyOnUnknown])),
    /Not a V2 learning key/,
  );
  const inventedKey = rawChallenge();
  inventedKey['learningKeys'] = ['invented_v2_key'];
  refuses(() => parseExtendedChallengeCatalog(catalogWith([inventedKey])), /Not a V2 learning key/);
  const twoKeys = rawChallenge();
  twoKeys['learningKeys'] = ['pedestrian_clearance', 'obstacle_clearance'];
  refuses(
    () => parseExtendedChallengeCatalog(catalogWith([twoKeys])),
    /exactly one V2 learning key/,
  );
  const wrongFamily = rawChallenge();
  wrongFamily['family'] = 'ROUTING';
  refuses(
    () => parseExtendedChallengeCatalog(catalogWith([wrongFamily])),
    /belongs to PEDESTRIAN|cover every authored family/,
  );
  const wrongScoring = rawChallenge();
  wrongScoring['scoring'] = 'CALLER_SCORE';
  refuses(
    () => parseExtendedChallengeCatalog(catalogWith([wrongScoring])),
    /observable facts only/,
  );
  const wrongDeadline = rawChallenge();
  wrongDeadline['deadline'] = { referenceSeconds: 240, marginOptions: [0.5] };
  refuses(
    () => parseExtendedChallengeCatalog(catalogWith([wrongDeadline])),
    /1-4 minute challenge window/,
  );
  const outOfRange = rawChallenge();
  outOfRange['keyValue'] = 99;
  refuses(
    () => parseExtendedChallengeCatalog(catalogWith([outOfRange])),
    /Expected finite number in range/,
  );
  const strayOpportunities = rawChallenge('v2-challenge-hazard-reaction');
  strayOpportunities['opportunities'] = 3;
  refuses(
    () => parseExtendedChallengeCatalog(catalogWith([strayOpportunities])),
    /Only a per-opportunity derivation declares opportunities/,
  );
});

test('188 plan identities are stable across a reload-shaped clone', () => {
  const plan = extendedPlan('v2-challenge-red-gap');
  const reloaded = planExtendedChallengeAttempt({
    challenge: extendedChallenge('v2-challenge-red-gap'),
    catalogVersion: extendedCatalog().version,
    capabilities: fullExtendedCapabilities(),
    sessionKind: plan.sessionKind,
    seed: plan.seed,
    attempt: plan.attempt,
    startedTick: 0,
  });
  assert.equal(JSON.stringify(reloaded), JSON.stringify(plan));
  const verdict = evaluateExtendedChallenge({
    objective: plan.objective,
    facts: passingExtendedFacts('v2-challenge-red-gap'),
  });
  const second = evaluateExtendedChallenge({
    objective: clone(plan.objective),
    facts: clone(passingExtendedFacts('v2-challenge-red-gap')),
  });
  assert.equal(JSON.stringify(second), JSON.stringify(verdict));
  assert.equal(second.fingerprint, verdict.fingerprint);
});
