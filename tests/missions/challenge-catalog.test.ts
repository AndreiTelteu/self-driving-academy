import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  CHALLENGE_CAPABILITY_VERSION,
  CHALLENGE_DAILY_BRIDGE_VERSION,
  CHALLENGE_DEFERRED_TO_233,
  CHALLENGE_EVALUATORS,
  CHALLENGE_EVALUATOR_VERSION,
  CHALLENGE_LIMITS,
  CHALLENGE_SCHEMA_VERSION,
  CHALLENGE_TEMPLATE_CATALOG_VERSION,
  CHALLENGE_TICK_HZ,
  DAILY_TEMPLATE_CATALOG_VERSION,
  challengeCapabilities,
  challengeDailyFamilies,
  challengeFamilies,
  challengeObjectiveKinds,
  challengePrerequisitesMissing,
  challengeSessionKinds,
  challengeVerdictReasons,
  challengeZoneKinds,
  createChallengeCapabilities,
  createDailyTemplateCatalog,
  eligibleChallengeTemplates,
  evaluateChallenge,
  parseChallengeObjectiveSnapshot,
  parseChallengeTemplate,
  parseChallengeTemplateCatalog,
  planChallengeAttempt,
} from '../../src/missions';
import type { ChallengeTemplateCatalog } from '../../src/missions';
import {
  CHALLENGE_FIXTURE_SEED,
  challengeCatalog,
  challengeFacts,
  challengePlan,
  challengeTemplate,
  failingFacts,
  fullChallengeCapabilities,
  leanChallengeCapabilities,
  passingFacts,
  rawTemplate,
} from './challenge-catalog-fixture';
import { calendarInput, fullCapabilities, step } from './mission-daily-fixture';

const TEMPLATE_IDS = [
  'challenge-maternity-run',
  'challenge-toilet-sos',
  'challenge-influencer-no-spill',
  'challenge-influencer-single-frame',
  'challenge-influencer-parking-drift',
  'challenge-influencer-demolition',
  'challenge-cake-delivery',
  'challenge-forgot-something',
  'challenge-last-minute-airport',
  'challenge-city-tour-backwards',
  'challenge-valet-with-style',
  'challenge-city-copies-me',
] as const;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function refuses(action: () => unknown, pattern: RegExp): void {
  assert.throws(action, pattern);
}

test('231 contract: versioned catalog, twelve templates and closed vocabularies', () => {
  assert.equal(CHALLENGE_SCHEMA_VERSION, '231-challenge-catalog-v1');
  assert.equal(CHALLENGE_TEMPLATE_CATALOG_VERSION, '231-challenge-templates-v1');
  assert.equal(CHALLENGE_EVALUATOR_VERSION, '231-challenge-evaluators-v1');
  assert.equal(CHALLENGE_CAPABILITY_VERSION, '231-challenge-capabilities-v1');
  assert.equal(CHALLENGE_TICK_HZ, 60);
  assert.equal(CHALLENGE_LIMITS.minimumTemplates, 12);
  assert.deepEqual(
    [...challengeFamilies],
    [
      'PRECISION',
      'DISCIPLINE',
      'EXPLORATION',
      'CONTROLLED_DESTRUCTION',
      'EFFICIENCY',
      'EXPERIMENT',
    ],
  );
  assert.deepEqual([...challengeSessionKinds], ['ACADEMY', 'CHAOS']);
  assert.deepEqual(
    [...challengeZoneKinds],
    [
      'HOSPITAL',
      'TOILET',
      'TERMINAL',
      'CHECKPOINT',
      'PARKING',
      'DRIFT_PAD',
      'DEMOLITION_ALLEY',
      'LANDMARK',
    ],
  );
  assert.deepEqual(
    [...challengeObjectiveKinds],
    [
      'CHECKPOINTS',
      'ZONE_ORDER',
      'TIMED_DROPOFF',
      'COMFORT',
      'PARKING',
      'DRIFT',
      'DISTRUCTION',
      'LEARNING',
    ],
  );
  assert.equal(Object.keys(CHALLENGE_EVALUATORS).length, 8);
  assert.equal(new Set(challengeVerdictReasons).size, challengeVerdictReasons.length);
  assert.ok(!(challengeCapabilities as readonly string[]).includes('PEDESTRIANS'));
  const catalog = challengeCatalog();
  assert.equal(catalog.version, CHALLENGE_TEMPLATE_CATALOG_VERSION);
  assert.equal(catalog.templates.length, 12);
  assert.deepEqual(
    catalog.templates.map((entry) => entry.templateId),
    [...TEMPLATE_IDS].sort(),
  );
});

test('231 catalog covers the Docs/28 situations and six distinct families', () => {
  const catalog = challengeCatalog();
  const families = new Set(catalog.templates.map((entry) => entry.family));
  assert.equal(families.size, challengeFamilies.length);
  for (const family of challengeFamilies)
    assert.ok(families.has(family), `missing family ${family}`);
  const evaluators = new Set(catalog.templates.map((entry) => entry.evaluatorId));
  assert.equal(evaluators.size, 8);
  const sessions = catalog.templates.flatMap((entry) => entry.sessions);
  assert.equal(sessions.filter((entry) => entry === 'ACADEMY').length, 11);
  assert.equal(sessions.filter((entry) => entry === 'CHAOS').length, 11);
  const filming = catalog.templates.filter((entry) => entry.filming.premise);
  assert.deepEqual(filming.map((entry) => entry.templateId).sort(), [
    'challenge-influencer-demolition',
    'challenge-influencer-no-spill',
    'challenge-influencer-parking-drift',
    'challenge-influencer-single-frame',
  ]);
  for (const template of catalog.templates) {
    assert.equal(template.version, '1');
    assert.ok(template.title.length > 0 && template.label.length > 0);
    assert.equal(template.dialogue.length, 4);
    assert.equal(template.replayRules.restartKey, 'R');
    assert.equal(template.rewardPolicy.firstFamilyPerDay, true);
    assert.equal(template.rewardPolicy.replayXp, 0);
    assert.ok(template.deadline.referenceSeconds >= 60);
    assert.ok(template.deadline.referenceSeconds <= 240);
    assert.ok(template.incidentBudgets.length >= 1);
    assert.ok(template.zones.route.required === template.zones.route.checkpoints > 0);
  }
  assert.deepEqual(
    [...CHALLENGE_DEFERRED_TO_233],
    [
      'OFFER_SCHEDULING',
      'INSTANCE_LIFECYCLE',
      'RELOAD_AND_REWARD_CREDIT',
      'REPLAY_AND_RECORD_HISTORY',
      'UNMAPPED_TEMPLATE_OBJECTIVES',
    ],
  );
});

test('231 each objective is calculable from real data and the deadline is feasible', () => {
  for (const templateId of TEMPLATE_IDS) {
    const plan = challengePlan(templateId);
    const objective = plan.objective;
    assert.equal(objective.evaluatorVersion, CHALLENGE_EVALUATORS[objective.evaluatorId].version);
    assert.ok(objective.target >= 1);
    assert.ok(objective.incidentBudget >= 0);
    assert.ok(objective.deadlineTick > 0);
    assert.ok(plan.deadline.durationTicks > plan.deadline.referenceSeconds * CHALLENGE_TICK_HZ);
    assert.equal(plan.deadline.deadlineTick, objective.deadlineTick);
    assert.equal(
      plan.deadline.durationTicks,
      Math.round(plan.deadline.referenceSeconds * (1 + plan.deadline.margin) * CHALLENGE_TICK_HZ),
    );
    assert.deepEqual(
      Object.keys(objective.thresholds).sort(),
      [...CHALLENGE_EVALUATORS[objective.evaluatorId].thresholds.map((entry) => entry.key)].sort(),
    );
    if (objective.objectiveKind === 'CHECKPOINTS')
      assert.ok(objective.zoneIds.length >= objective.target);
    if (objective.objectiveKind === 'LEARNING')
      assert.equal(objective.learningKey, 'speed_delta_urban');
    else assert.equal(objective.learningKey, null);
    const again = challengePlan(templateId);
    assert.equal(JSON.stringify(again), JSON.stringify(plan));
    assert.ok(plan.instanceId.startsWith('id-v1:'));
  }
  const plans = TEMPLATE_IDS.map((id) => challengePlan(id));
  assert.equal(new Set(plans.map((plan) => plan.instanceId)).size, plans.length);
  const otherSeed = TEMPLATE_IDS.map((id) =>
    challengePlan(id, { seed: CHALLENGE_FIXTURE_SEED + 1 }),
  );
  assert.ok(
    plans.some((plan, index) => JSON.stringify(plan) !== JSON.stringify(otherSeed[index])),
    'a different seed must change at least one authored parameter',
  );
});

test('231 missing prerequisites exclude a template explicitly instead of generating it', () => {
  const lean = leanChallengeCapabilities();
  const eligibility = eligibleChallengeTemplates(challengeCatalog(), lean);
  assert.deepEqual(eligibility.eligible, [
    'challenge-cake-delivery',
    'challenge-influencer-no-spill',
  ]);
  assert.equal(eligibility.excluded.length, 10);
  const reasons = eligibility.excluded.flatMap((entry) => entry.missing);
  assert.ok(reasons.includes('ZONE:HOSPITAL'));
  assert.ok(reasons.includes('ZONE:DEMOLITION_ALLEY'));
  assert.ok(reasons.includes('VEHICLE_CLASS:sedan'));
  assert.ok(reasons.includes('LEARNING_KEY:speed_delta_urban'));
  assert.ok(reasons.includes('CAMPAIGN:1'));
  assert.ok(reasons.includes('CAPABILITY:LEARNING'));
  assert.ok(reasons.includes('CAPABILITY:DESTRUCTIBLE_DECOR'));
  refuses(
    () => challengePlan('challenge-maternity-run', { capabilities: lean }),
    /excluded: .*ZONE:HOSPITAL/,
  );
  refuses(
    () => challengePlan('challenge-influencer-parking-drift', { capabilities: lean }),
    /excluded: .*ZONE:DRIFT_PAD/,
  );
  const withHospital = createChallengeCapabilities({
    ...lean,
    zones: [{ zoneId: 'zone:hospital:central', kind: 'HOSPITAL' }],
  });
  assert.deepEqual(
    challengePrerequisitesMissing(challengeTemplate('challenge-maternity-run'), withHospital),
    [],
  );
  const withSedan = createChallengeCapabilities({ ...lean, vehicleClasses: ['compact', 'sedan'] });
  assert.ok(
    !challengePrerequisitesMissing(
      challengeTemplate('challenge-influencer-parking-drift'),
      withSedan,
    ).some((entry) => entry.startsWith('VEHICLE_CLASS')),
  );
  assert.deepEqual(
    challengePrerequisitesMissing(challengeTemplate('challenge-city-copies-me'), lean),
    ['CONTROL:LEARNING', 'CAPABILITY:LEARNING', 'LEARNING_KEY:speed_delta_urban', 'CAMPAIGN:1'],
  );
  const full = eligibleChallengeTemplates(challengeCatalog(), fullChallengeCapabilities());
  assert.equal(full.eligible.length, 11);
  assert.deepEqual(
    full.excluded.map((entry) => entry.templateId),
    ['challenge-influencer-demolition'],
  );
  assert.deepEqual(full.excluded[0]!.missing, ['SESSION:ACADEMY']);
  const chaos = eligibleChallengeTemplates(challengeCatalog(), fullChallengeCapabilities('CHAOS'));
  assert.equal(chaos.eligible.length, 11);
  assert.deepEqual(
    chaos.excluded.map((entry) => entry.templateId),
    ['challenge-city-copies-me'],
  );
});

test('231 demolition is Haos only and never pays Academy XP', () => {
  const demolition = challengeTemplate('challenge-influencer-demolition');
  assert.deepEqual([...demolition.sessions], ['CHAOS']);
  assert.equal(demolition.rewardPolicy.academyXp, 0);
  assert.equal(demolition.controlRequirement, 'MANUAL');
  refuses(
    () =>
      challengePlan('challenge-influencer-demolition', {
        capabilities: fullChallengeCapabilities('ACADEMY'),
        sessionKind: 'ACADEMY',
      }),
    /not offered in ACADEMY/,
  );
  const chaos = challengePlan('challenge-influencer-demolition', {
    capabilities: fullChallengeCapabilities('CHAOS'),
    sessionKind: 'CHAOS',
  });
  assert.equal(chaos.sessionKind, 'CHAOS');
  for (const other of challengeCatalog().templates)
    if (other.objectiveKind !== 'DISTRUCTION')
      assert.ok(
        other.sessions.includes('ACADEMY'),
        `${other.templateId} must stay playable in the Academy`,
      );
});

test('231 every template passes a realizable fixture and fails an invalid one', () => {
  for (const templateId of TEMPLATE_IDS) {
    const passed = evaluateChallenge({
      objective: challengePlan(templateId).objective,
      facts: passingFacts(templateId),
    });
    assert.equal(passed.status, 'PASSED', `${templateId}: ${passed.reason}`);
    assert.equal(passed.reason, 'TARGET_REACHED');
    assert.equal(passed.progress, passed.target);
    assert.notEqual(passed.fingerprint, '');
    const failure = failingFacts(templateId);
    const verdict = evaluateChallenge({
      objective: challengePlan(templateId).objective,
      facts: failure.facts,
    });
    assert.equal(verdict.status, failure.expectedStatus, `${templateId}: ${verdict.reason}`);
    assert.equal(verdict.reason, failure.expectedReason, templateId);
    assert.ok(Object.isFrozen(verdict));
    assert.ok(Object.isFrozen(verdict.measured));
  }
});

test('231 evaluators are deterministic, pure and permutation invariant', () => {
  for (const templateId of TEMPLATE_IDS) {
    const plan = challengePlan(templateId);
    const facts = passingFacts(templateId);
    const first = evaluateChallenge({ objective: plan.objective, facts });
    const second = evaluateChallenge({ objective: plan.objective, facts });
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    assert.equal(first.fingerprint, second.fingerprint);
    const reversed = clone(facts);
    reversed.checkpoints = [...reversed.checkpoints].reverse();
    reversed.zoneVisits = [...reversed.zoneVisits].reverse();
    reversed.driftSamples = [...reversed.driftSamples].reverse();
    reversed.destruction = [...reversed.destruction].reverse();
    reversed.comfortSamples = [...reversed.comfortSamples].reverse();
    reversed.dropoffs = [...reversed.dropoffs].reverse();
    reversed.parked = [...reversed.parked].reverse();
    const permuted = evaluateChallenge({ objective: plan.objective, facts: reversed });
    assert.equal(permuted.status, first.status);
    assert.deepEqual(permuted.measured, first.measured);
    const altered = clone(facts);
    altered.incidents = 99;
    const changed = evaluateChallenge({ objective: plan.objective, facts: altered });
    assert.notEqual(changed.fingerprint, first.fingerprint);
  }
  const source = readFileSync(join(process.cwd(), 'src', 'missions', 'challenges.ts'), 'utf8');
  assert.ok(!source.includes('Math.random('), 'the evaluators never use Math.random');
  assert.ok(!source.includes('Date.now('), 'the evaluators never read the wall clock');
});

test('231 drift does not accumulate by spinning in place or by a collision impulse', () => {
  const plan = challengePlan('challenge-influencer-parking-drift');
  const zone = plan.objective.zoneIds[0]!;
  const rotation = challengeFacts(plan, {
    endedTick: plan.objective.deadlineTick + 120,
    driftSamples: Array.from({ length: 240 }, (_, index) => ({
      zoneId: zone,
      tick: 1_000 + index,
      speedMps: 0.2,
      slipAngleRad: 1.3,
      collisionImpulseNs: 0,
    })),
  });
  const rotationVerdict = evaluateChallenge({ objective: plan.objective, facts: rotation });
  assert.equal(rotationVerdict.status, 'FAILED');
  assert.equal(rotationVerdict.reason, 'NO_VALID_DRIFT');
  assert.equal(rotationVerdict.measured.validDriftSeconds, 0);
  assert.equal(rotationVerdict.measured.rotationOnlyTicks, 240);
  const collision = challengeFacts(plan, {
    endedTick: plan.objective.deadlineTick + 120,
    driftSamples: Array.from({ length: 240 }, (_, index) => ({
      zoneId: zone,
      tick: 1_000 + index,
      speedMps: 12,
      slipAngleRad: 0.8,
      collisionImpulseNs: 60,
    })),
  });
  const collisionVerdict = evaluateChallenge({ objective: plan.objective, facts: collision });
  assert.equal(collisionVerdict.reason, 'NO_VALID_DRIFT');
  assert.equal(collisionVerdict.measured.validDriftSeconds, 0);
  assert.equal(collisionVerdict.measured.collisionTicks, 240);
  const outside = challengeFacts(plan, {
    driftSamples: Array.from({ length: 240 }, (_, index) => ({
      zoneId: 'zone:drift:elsewhere',
      tick: 1_000 + index,
      speedMps: 12,
      slipAngleRad: 0.8,
      collisionImpulseNs: 0,
    })),
  });
  assert.equal(
    evaluateChallenge({ objective: plan.objective, facts: outside }).measured.validDriftSeconds,
    0,
  );
  const valid = passingFacts('challenge-influencer-parking-drift');
  const validVerdict = evaluateChallenge({ objective: plan.objective, facts: valid });
  assert.equal(validVerdict.status, 'PASSED');
  assert.ok(validVerdict.measured.validDriftSeconds >= 3);
});

test('231 destruction counts distinct objects, deduplicates and refuses the Academy', () => {
  const plan = challengePlan('challenge-influencer-demolition', {
    capabilities: fullChallengeCapabilities('CHAOS'),
    sessionKind: 'CHAOS',
  });
  const zone = plan.objective.zoneIds[0]!;
  const facts = challengeFacts(plan, {
    endedTick: 3_000,
    destruction: [
      { objectId: 'object:1', zoneId: zone, tick: 1_000 },
      { objectId: 'object:1', zoneId: zone, tick: 1_100 },
      { objectId: 'object:1', zoneId: zone, tick: 1_200 },
      { objectId: 'object:2', zoneId: zone, tick: 1_300 },
      { objectId: 'object:3', zoneId: zone, tick: 1_400 },
      { objectId: 'object:4', zoneId: zone, tick: 1_500 },
      { objectId: 'object:4', zoneId: zone, tick: 1_600 },
      { objectId: 'foreign', zoneId: 'zone:alley:elsewhere', tick: 1_700 },
    ],
  });
  const verdict = evaluateChallenge({ objective: plan.objective, facts });
  assert.equal(verdict.status, 'INCOMPLETE');
  assert.equal(verdict.measured.distinctDestroyed, 4);
  const passed = evaluateChallenge({
    objective: plan.objective,
    facts: challengeFacts(plan, {
      destruction: Array.from({ length: 5 }, (_, index) => ({
        objectId: `object:${index}`,
        zoneId: zone,
        tick: 1_000 + index * 100,
      })),
    }),
  });
  assert.equal(passed.status, 'PASSED');
  assert.equal(passed.measured.distinctDestroyed, 5);
  const academy = evaluateChallenge({
    objective: plan.objective,
    facts: challengeFacts(plan, { sessionKind: 'ACADEMY' }),
  });
  assert.equal(academy.status, 'EXCLUDED');
  assert.equal(academy.reason, 'SESSION_NOT_ALLOWED');
});

test('231 comfort thresholds are versioned and cannot be loosened', () => {
  const noSpill = challengeTemplate('challenge-influencer-no-spill');
  const cake = challengeTemplate('challenge-cake-delivery');
  assert.equal(noSpill.thresholds['maxAccelerationMps2'], 2);
  assert.equal(cake.thresholds['maxAccelerationMps2'], 1.5);
  assert.ok((cake.thresholds['maxJerkMps3'] ?? 0) < 2);
  const raw = rawTemplate('challenge-influencer-no-spill');
  raw['thresholds'] = { maxAccelerationMps2: 3, maxJerkMps3: 2 };
  refuses(() => parseChallengeTemplate(raw), /outside the evaluator range/);
  const rawDrift = rawTemplate('challenge-influencer-parking-drift');
  rawDrift['thresholds'] = { minSpeedMps: 1, minSlipAngleRad: 0.05, minSeconds: 3 };
  refuses(() => parseChallengeTemplate(rawDrift), /outside the evaluator range/);
});

test('231 validator refuses missing evaluators, zones, routes and contradictory objectives', () => {
  const cases: readonly [string, (raw: Record<string, unknown>) => void, RegExp][] = [
    [
      'unknown evaluator',
      (raw) => {
        raw['evaluatorId'] = 'missing-evaluator';
      },
      /Unsupported enum value|Unknown challenge evaluator/,
    ],
    [
      'missing evaluator for objective',
      (raw) => {
        raw['evaluatorId'] = 'comfort-budget';
      },
      /does not belong to evaluator|solves/,
    ],
    [
      'missing zone kind',
      (raw) => {
        raw['objectiveKind'] = 'CHECKPOINTS';
        raw['evaluatorId'] = 'checkpoint-sequence';
        raw['controlRequirement'] = 'MANUAL';
        raw['zones'] = {
          requirements: [{ kind: 'HOSPITAL', count: 2 }],
          route: { required: true, checkpoints: 2 },
        };
        raw['targets'] = [2];
      },
      /does not accept a HOSPITAL zone/,
    ],
    [
      'missing route',
      (raw) => {
        raw['objectiveKind'] = 'CHECKPOINTS';
        raw['evaluatorId'] = 'checkpoint-sequence';
        raw['controlRequirement'] = 'MANUAL';
        raw['zones'] = {
          requirements: [{ kind: 'CHECKPOINT', count: 2 }],
          route: { required: false, checkpoints: 0 },
        };
        raw['targets'] = [2];
      },
      /route plan must declare 2 checkpoints/,
    ],
    [
      'short route',
      (raw) => {
        raw['objectiveKind'] = 'CHECKPOINTS';
        raw['evaluatorId'] = 'checkpoint-sequence';
        raw['controlRequirement'] = 'MANUAL';
        raw['zones'] = {
          requirements: [{ kind: 'CHECKPOINT', count: 3 }],
          route: { required: true, checkpoints: 2 },
        };
      },
      /route plan must declare 3 checkpoints/,
    ],
    [
      'target beyond zone plan',
      (raw) => {
        raw['objectiveKind'] = 'CHECKPOINTS';
        raw['evaluatorId'] = 'checkpoint-sequence';
        raw['controlRequirement'] = 'MANUAL';
        raw['zones'] = {
          requirements: [{ kind: 'CHECKPOINT', count: 2 }],
          route: { required: true, checkpoints: 2 },
        };
        raw['targets'] = [3];
      },
      /route plan must declare 3 checkpoints|target needs/,
    ],
    [
      'demolition in the Academy',
      (raw) => {
        raw['templateId'] = 'challenge-demolition-academy';
        raw['objectiveKind'] = 'DISTRUCTION';
        raw['evaluatorId'] = 'distinct-destruction';
        raw['sessions'] = ['ACADEMY'];
        raw['controlRequirement'] = 'MANUAL';
        raw['zones'] = {
          requirements: [{ kind: 'DEMOLITION_ALLEY', count: 1 }],
          route: { required: false, checkpoints: 0 },
        };
        raw['rewardPolicy'] = {
          academyXp: 100,
          chaos: 'LOCAL_RECORD_ONLY',
          familyRewardKey: true,
          firstFamilyPerDay: true,
          replayXp: 0,
        };
        raw['prerequisites'] = {
          vehicleClasses: ['sedan'],
          capabilities: ['FREE_DRIVE', 'MANUAL_CONTROL', 'DESTRUCTIBLE_DECOR'],
          learningKeys: [],
          minCampaignMissions: 0,
        };
      },
      /not offered in ACADEMY|Destruction is a Haos objective only/,
    ],
    [
      'pedestrians in a driving scene',
      (raw) => {
        raw['prerequisites'] = {
          vehicleClasses: [],
          capabilities: ['FREE_DRIVE', 'MANUAL_CONTROL', 'PEDESTRIANS_V2'],
          learningKeys: [],
          minCampaignMissions: 0,
        };
      },
      /cannot ask for pedestrians or walking/,
    ],
    [
      'external publication in dialogue',
      (raw) => {
        const dialogue = raw['dialogue'] as readonly Record<string, unknown>[];
        raw['dialogue'] = dialogue.map((line, index) =>
          index === 0 ? { ...line, text: 'Filmez și urc pe TikTok imediat.' } : line,
        );
      },
      /cannot promise an external publication/,
    ],
    [
      'learning key on a manual objective',
      (raw) => {
        raw['prerequisites'] = {
          vehicleClasses: [],
          capabilities: ['FREE_DRIVE', 'MANUAL_CONTROL'],
          learningKeys: ['speed_delta_urban'],
          minCampaignMissions: 0,
        };
      },
      /Exactly a LEARNING objective declares one supported learning key/,
    ],
    [
      'unsupported learning key',
      (raw) => {
        raw['prerequisites'] = {
          vehicleClasses: [],
          capabilities: ['FREE_DRIVE', 'MANUAL_CONTROL'],
          learningKeys: ['invented_key'],
          minCampaignMissions: 0,
        };
      },
      /Unsupported learning key/,
    ],
    [
      'deadline beyond the challenge window',
      (raw) => {
        raw['deadline'] = { referenceSeconds: 240, marginOptions: [0.5] };
      },
      /1-4 minute challenge window/,
    ],
    [
      'replay rules missing R',
      (raw) => {
        const replay = raw['replayRules'] as Record<string, unknown>;
        raw['replayRules'] = { ...replay, restartKey: 'F5' };
      },
      /restart key is R/,
    ],
    [
      'social upload enabled',
      (raw) => {
        raw['filming'] = { premise: true, capture: 'INTERNAL_REPLAY', socialUpload: true };
      },
      /never uploads to a social network/,
    ],
  ];
  for (const [label, mutate, pattern] of cases) {
    const raw = rawTemplate();
    mutate(raw);
    assert.throws(() => parseChallengeTemplate(raw), pattern, label);
  }
  const shortCatalog = {
    schemaVersion: 1,
    units: 'SI',
    version: 'test-short',
    templates: challengeCatalog().templates.slice(0, 11),
  };
  refuses(() => parseChallengeTemplateCatalog(shortCatalog), /declares 12..32 templates/);
  const duplicate = clone(challengeCatalog()) as ChallengeTemplateCatalog;
  const templates = duplicate.templates
    .filter((entry) => entry.templateId !== 'challenge-maternity-run')
    .map((entry) => clone(entry));
  const airport = templates.find((entry) => entry.templateId === 'challenge-last-minute-airport')!;
  templates.push({
    ...airport,
    templateId: 'challenge-airport-copy',
    title: 'Copie',
    label: 'Copie',
  });
  assert.throws(
    () =>
      parseChallengeTemplateCatalog({
        ...duplicate,
        templates,
      }),
    /describe the same objective|Duplicate challenge template title/,
  );
});

test('231 objective snapshot and facts refuse foreign data and out-of-window facts', () => {
  const plan = challengePlan('challenge-maternity-run');
  const facts = passingFacts('challenge-maternity-run');
  const broken = clone(facts) as Record<string, unknown>;
  broken['tickHz'] = 30;
  refuses(() => evaluateChallenge({ objective: plan.objective, facts: broken }), /60 Hz/);
  const outside = clone(facts) as Record<string, unknown>;
  outside['dropoffs'] = [{ zoneId: plan.objective.zoneIds[0], tick: 999_999 }];
  refuses(
    () => evaluateChallenge({ objective: plan.objective, facts: outside }),
    /outside the evaluated window/,
  );
  const checkpointPlan = challengePlan('challenge-influencer-single-frame');
  const foreign = clone(checkpointPlan.objective) as unknown as Record<string, unknown>;
  foreign['zoneIds'] = [...checkpointPlan.objective.zoneIds, checkpointPlan.objective.zoneIds[0]!];
  refuses(() => parseChallengeObjectiveSnapshot(foreign), /Duplicate objective zone/);
  const stale = clone(plan.objective) as unknown as Record<string, unknown>;
  stale['evaluatorVersion'] = '231-eval-stale-v1';
  refuses(() => parseChallengeObjectiveSnapshot(stale), /evaluator version is stale/);
});

test('231 the daily generator keeps working and consumes the versioned bridge', () => {
  const daily = createDailyTemplateCatalog();
  assert.equal(daily.version, DAILY_TEMPLATE_CATALOG_VERSION);
  assert.equal(daily.families.length, 6);
  const bridge = challengeDailyFamilies();
  assert.equal(bridge.version, CHALLENGE_DAILY_BRIDGE_VERSION);
  assert.deepEqual(bridge.families.map((family) => family.familyId).sort(), [
    'challenge-city-copies-me',
    'challenge-last-minute-airport',
    'challenge-maternity-run',
  ]);
  for (const family of bridge.families) {
    assert.ok(
      family.objectiveKind === 'DROPOFFS' || family.objectiveKind === 'LEARNING_ACTIVATIONS',
    );
    assert.ok(family.controlRequirement !== 'LEARNING' || family.learningKeyRequired);
  }
  const result = step({
    calendar: calendarInput('2026-11-12'),
    templateCatalog: bridge,
    capabilities: fullCapabilities(),
  });
  assert.ok(result.set !== null);
  assert.equal(result.set.instances.length, 3);
  assert.equal(new Set(result.set.instances.map((entry) => entry.instanceId)).size, 3);
  assert.ok(
    result.set.instances.every((entry) =>
      bridge.families.some((family) => family.familyId === entry.familyId),
    ),
  );
  assert.ok(result.state.sets.length === 1);
});

test('231 plan and verdict identities are stable across a reload-shaped clone', () => {
  const plan = challengePlan('challenge-influencer-single-frame');
  const reloaded = planChallengeAttempt({
    template: challengeTemplate('challenge-influencer-single-frame'),
    catalogVersion: challengeCatalog().version,
    capabilities: fullChallengeCapabilities(),
    sessionKind: plan.sessionKind,
    seed: plan.seed,
    attempt: plan.attempt,
    startedTick: 0,
  });
  assert.equal(JSON.stringify(reloaded), JSON.stringify(plan));
  const verdict = evaluateChallenge({
    objective: plan.objective,
    facts: passingFacts(plan.templateId),
  });
  const second = evaluateChallenge({
    objective: clone(plan.objective),
    facts: clone(passingFacts(plan.templateId)),
  });
  assert.equal(JSON.stringify(second), JSON.stringify(verdict));
  assert.equal(second.fingerprint, verdict.fingerprint);
});
