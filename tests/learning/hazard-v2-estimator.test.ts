import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getParameterDefinition } from '../../src/profiles';
import {
  HAZARD_V2_ESTIMATOR_KEYS,
  HAZARD_V2_ESTIMATOR_LIMITS,
  estimateHazardV2Style,
  hazardV2EligibleContexts,
  hazardV2EligibleScenarios,
  hazardV2EvidenceReasons,
} from '../../src/learning/hazard-v2-estimator';
import type { HazardV2EvidenceEpisode } from '../../src/learning/hazard-v2-estimator';
import { HAZARD_POLICY_V2_KEYS } from '../../src/autonomy';
import {
  TRUE_HAZARD_PROFILE,
  clearanceWithWrongMEpisodes,
  clearanceWithoutMEpisodes,
  compatibilityProbes,
  crosswalkLimitEpisodes,
  floorClearanceEpisodes,
  forbiddenHornEpisodes,
  hazardInMarginEpisodes,
  manualEpisodes,
  mandatoryYieldEpisodes,
  noSpaceEvasionEpisodes,
  positiveEpisodes,
  reducedAdhesionEpisodes,
  refusedEvasionEpisodes,
  refusedHornEpisodes,
  saturatedReactionEpisodes,
  scatteredReactionEpisodes,
  suppressedEpisodes,
} from './hazard-v2-estimator-reference';
import { evaluate } from '../autonomy/hazard-policy-v2-reference';

const SPLIT_SEED = 184;
const estimate = (episodes: readonly HazardV2EvidenceEpisode[]) =>
  estimateHazardV2Style({ episodes, splitSeed: SPLIT_SEED });
const positive = () => estimate(positiveEpisodes());

test('estimează cele opt chei 183, fiecare din contextul ei eligibil', () => {
  const result = positive();
  assert.deepEqual([...HAZARD_V2_ESTIMATOR_KEYS], [...HAZARD_POLICY_V2_KEYS]);
  for (const key of HAZARD_V2_ESTIMATOR_KEYS) {
    const entry = result.keys[key],
      definition = getParameterDefinition(key);
    assert.equal(entry.status, 'CANDIDATE', `${key} ${entry.reason}`);
    assert.ok(entry.value !== null);
    assert.ok(entry.value >= definition.min && entry.value <= definition.max, key);
    assert.equal(entry.clamped, false, key);
    assert.ok(entry.sourceEpisodes >= HAZARD_V2_ESTIMATOR_LIMITS.minimumEstimateEpisodes, key);
  }
});

test('cele opt chei au opt scenarii și opt contexte eligibile distincte', () => {
  const scenarios = HAZARD_V2_ESTIMATOR_KEYS.map((key) => hazardV2EligibleScenarios[key]),
    contexts = HAZARD_V2_ESTIMATOR_KEYS.map((key) => hazardV2EligibleContexts[key]);
  assert.equal(new Set(scenarios).size, 8);
  assert.equal(new Set(contexts).size, 8);
});

test('fiecare cheie raportează incertitudinea sub pragul ei', () => {
  const result = positive();
  for (const key of HAZARD_V2_ESTIMATOR_KEYS) {
    const entry = result.keys[key];
    assert.ok(entry.uncertainty !== null && entry.uncertainty > 0, key);
    assert.ok(entry.uncertainty! <= entry.uncertaintyThreshold, key);
  }
});

test('validarea folosește episoade ținute deoparte, fără suprapunere', () => {
  const result = positive(),
    estimateIds = new Set(
      result.split.filter((entry) => entry.side === 'ESTIMATE').map((entry) => entry.episodeId),
    );
  assert.equal(result.split.length, result.admittedEpisodes.length);
  for (const entry of result.split)
    assert.equal(
      estimateIds.has(entry.episodeId),
      entry.side === 'ESTIMATE',
      `${entry.episodeId} apare pe ambele părți`,
    );
  for (const key of HAZARD_V2_ESTIMATOR_KEYS) {
    const validation = result.keys[key].validation;
    assert.equal(validation.status, 'VALIDATED', key);
    assert.ok(validation.episodes >= HAZARD_V2_ESTIMATOR_LIMITS.minimumValidationEpisodes, key);
  }
});

test('spațiul măsurat este chiar cheia când plafonul de viteză este sub limită', () => {
  const result = positive();
  assert.equal(result.keys.pedestrian_clearance.value?.toFixed(4), '2.5000');
  assert.equal(result.keys.obstacle_clearance.value?.toFixed(4), '2.4000');
});

test('fără decelerația de confort M, ambele spații rămân neobservate', () => {
  const result = estimate(clearanceWithoutMEpisodes());
  for (const key of ['pedestrian_clearance', 'obstacle_clearance'] as const) {
    assert.equal(result.keys[key].status, 'UNOBSERVED', key);
    assert.equal(result.keys[key].reason, 'CLEARANCE_M_UNKNOWN', key);
    assert.equal(result.keys[key].value, null, key);
    assert.ok((result.keys[key].excluded.CLEARANCE_M_UNKNOWN ?? 0) > 0, key);
  }
});

test('o decelerație M declarată greșit nu reproduce plafonul raportat', () => {
  const result = estimate(clearanceWithWrongMEpisodes());
  for (const key of ['pedestrian_clearance', 'obstacle_clearance'] as const) {
    assert.equal(result.keys[key].status, 'UNOBSERVED', key);
    assert.equal(result.keys[key].reason, 'CLEARANCE_M_INCONSISTENT', key);
  }
});

test('spațiul sub podeaua fizică este saturat, nu estimat', () => {
  const result = estimate(floorClearanceEpisodes());
  for (const key of ['pedestrian_clearance', 'obstacle_clearance'] as const) {
    assert.equal(result.keys[key].status, 'UNOBSERVED', key);
    assert.equal(result.keys[key].reason, 'CLEARANCE_FLOOR_SATURATED', key);
    assert.equal(result.keys[key].value, null, key);
  }
});

test('un hazard deja în marjă comandă 0 m/s fără să spună nimic despre spațiu', () => {
  const episodes = hazardInMarginEpisodes(),
    pedestrian = episodes[0]!.samples[0]!.clearance.pedestrian,
    obstacle = episodes[0]!.samples[0]!.clearance.obstacle;
  assert.equal(pedestrian?.stopNow, true);
  assert.equal(obstacle?.stopNow, true);
  assert.equal(pedestrian?.speedCapMps, 0);
  assert.equal(obstacle?.speedCapMps, 0);
  const result = estimate(episodes);
  for (const key of ['pedestrian_clearance', 'obstacle_clearance'] as const) {
    assert.equal(result.keys[key].status, 'UNOBSERVED', key);
    assert.equal(result.keys[key].reason, 'CLEARANCE_ROOM_EXHAUSTED', key);
  }
});

test('întârzierea de reacție saturată este refuzată, nu interpretată ca estimare', () => {
  const episodes = saturatedReactionEpisodes(),
    sample = episodes[0]!.samples[0]!;
  assert.equal(sample.reaction?.saturated, true);
  assert.ok(sample.reaction!.demandedDelayS > sample.reaction!.maximumFeasibleDelayS);
  const result = estimate(episodes);
  assert.equal(result.keys.hazard_reaction_delay.status, 'UNOBSERVED');
  assert.equal(result.keys.hazard_reaction_delay.reason, 'REACTION_DELAY_SATURATED');
  assert.equal(result.keys.hazard_reaction_delay.value, null);
});

test('întârzierea nesaturată este cheia deasupra lui M', () => {
  const result = positive(),
    delays = result.keys.hazard_reaction_delay;
  assert.equal(delays.status, 'CANDIDATE');
  assert.equal(delays.value?.toFixed(4), '0.8000');
  const sample = positiveEpisodes()[32]!.samples[0]!;
  assert.equal(sample.reaction?.saturated, false);
  assert.equal(
    sample.reaction!.delayS - sample.reaction!.inheritedDelayS,
    TRUE_HAZARD_PROFILE.hazard_reaction_delay,
  );
});

test('plafonul de aderență ascunde intensitățile mari', () => {
  const episodes = reducedAdhesionEpisodes(),
    sample = episodes[0]!.samples[0]!;
  assert.equal(sample.surfaceId, 'reduced-adhesion');
  assert.equal(sample.emergencyBrake?.adhesionLimited, true);
  assert.ok(
    sample.emergencyBrake!.requestedDecelerationMps2 > sample.emergencyBrake!.adhesionLimitMps2,
  );
  const result = estimate(episodes);
  assert.equal(result.keys.emergency_brake_intensity.status, 'UNOBSERVED');
  assert.equal(result.keys.emergency_brake_intensity.reason, 'ADHESION_CAP_SATURATED');
});

test('intensitatea este raportul dintre decelerație și capacitatea clasei', () => {
  const result = positive();
  assert.equal(result.keys.emergency_brake_intensity.value?.toFixed(4), '0.6500');
  const sample = positiveEpisodes()[40]!.samples[0]!;
  assert.equal(sample.emergencyBrake?.adhesionLimited, false);
  assert.equal(
    sample.emergencyBrake!.decelerationMps2 / sample.geometry.brakeAccelerationMps2,
    TRUE_HAZARD_PROFILE.emergency_brake_intensity,
  );
});

test('ocolirea fără spațiul lateral verificat este inertă', () => {
  const episodes = noSpaceEvasionEpisodes();
  assert.equal(episodes[0]!.samples[0]!.evasion?.feasible, false);
  assert.equal(episodes[0]!.samples[0]!.evasion?.sample, null);
  const result = estimate(episodes);
  assert.equal(result.keys.evasive_steer_willingness.status, 'UNOBSERVED');
  assert.equal(result.keys.evasive_steer_willingness.reason, 'EVASION_NO_SPACE');
});

test('comanda de apropiere egală cu limita postată este doar o margine inferioară', () => {
  const episodes = crosswalkLimitEpisodes(),
    sample = episodes[0]!.samples[0]!;
  assert.equal(sample.crosswalk?.commandedSpeedMps, sample.crosswalk?.postedLimitMps);
  const result = estimate(episodes);
  assert.equal(result.keys.crosswalk_approach_speed.status, 'UNOBSERVED');
  assert.equal(result.keys.crosswalk_approach_speed.reason, 'CROSSWALK_LIMIT_SATURATED');
});

test('unde lumea interzice claxonul nu se trage niciun eșantion', () => {
  const episodes = forbiddenHornEpisodes(),
    sample = episodes[0]!.samples[0]!;
  assert.equal(sample.horn?.permitted, false);
  assert.equal(sample.horn?.sample, null);
  const result = estimate(episodes);
  assert.equal(result.keys.horn_use_probability.status, 'UNOBSERVED');
  assert.equal(result.keys.horn_use_probability.reason, 'HORN_FORBIDDEN');
});

test('cedarea obligatorie nu intră în numitorul probabilității', () => {
  const episodes = mandatoryYieldEpisodes();
  assert.equal(episodes[0]!.samples[0]!.pedestrian?.mandatoryYield, true);
  const result = estimate(episodes);
  assert.equal(result.keys.pedestrian_yield_probability.status, 'UNOBSERVED');
  assert.equal(
    result.keys.pedestrian_yield_probability.reason,
    'PEDESTRIAN_ALL_CROSSINGS_MANDATORY',
  );
  assert.equal(result.keys.pedestrian_clearance.status, 'CANDIDATE');
});

test('probabilitatea de cedare numără oportunități, nu cadre', () => {
  const result = positive(),
    episodes = positiveEpisodes().filter((entry) => entry.episodeId.startsWith('pedestrian-'));
  assert.equal(result.keys.pedestrian_yield_probability.value, 0.5);
  assert.equal(
    result.keys.pedestrian_yield_probability.sourceSamples,
    (episodes.length / 2) * 2,
    'fiecare oportunitate de traversare este numărată o singură dată',
  );
});

test('reacții contradictorii rămân sub prag, nu sunt mediate', () => {
  const result = estimate(scatteredReactionEpisodes());
  assert.equal(result.keys.hazard_reaction_delay.status, 'UNOBSERVED');
  assert.equal(result.keys.hazard_reaction_delay.reason, 'UNCERTAINTY_ABOVE_THRESHOLD');
  assert.ok(
    result.keys.hazard_reaction_delay.uncertainty! >
      result.keys.hazard_reaction_delay.uncertaintyThreshold,
  );
});

test('zerourile demonstrate rămân candidate, distincte de „fără dovezi”', () => {
  const horn = estimate(refusedHornEpisodes()).keys.horn_use_probability,
    evasion = estimate(refusedEvasionEpisodes()).keys.evasive_steer_willingness;
  assert.equal(horn.status, 'CANDIDATE');
  assert.equal(horn.value, 0);
  assert.equal(evasion.status, 'CANDIDATE');
  assert.equal(evasion.value, 0);
});

test('MANUAL și fereastra fără prefix sunt refuzate înainte de orice cheie', () => {
  const manual = estimate(manualEpisodes()),
    suppressed = estimate(suppressedEpisodes());
  assert.equal(manual.admittedEpisodes.length, 0);
  assert.ok(manual.refusedEpisodes.every((entry) => entry.reason === 'NOT_LEARNING_ELIGIBLE'));
  assert.ok(suppressed.refusedEpisodes.every((entry) => entry.reason === 'NO_USABLE_PREFIX'));
  for (const key of HAZARD_V2_ESTIMATOR_KEYS) {
    assert.equal(manual.keys[key].reason, 'NO_ELIGIBLE_EPISODES', key);
    assert.equal(suppressed.keys[key].status, 'UNOBSERVED', key);
  }
});

test('o identitate de episod duplicată este raportată', () => {
  const episodes = positiveEpisodes(),
    result = estimateHazardV2Style({
      episodes: [episodes[0]!, { ...episodes[0]! }],
      splitSeed: SPLIT_SEED,
    });
  assert.equal(result.admittedEpisodes.length, 1);
  assert.equal(result.refusedEpisodes[0]?.reason, 'DUPLICATE_EPISODE');
});

test('aceleași episoade și același seed produc aceeași estimare', () => {
  const first = positive(),
    second = positive();
  assert.equal(JSON.stringify(first.keys), JSON.stringify(second.keys));
  assert.deepEqual(first.split, second.split);
});

test('alt seed schimbă împărțirea, nu măsurătorile', () => {
  const base = positive(),
    other = estimateHazardV2Style({ episodes: positiveEpisodes(), splitSeed: 185 });
  assert.notDeepEqual(base.split, other.split);
  for (const key of HAZARD_V2_ESTIMATOR_KEYS)
    assert.ok(
      Math.abs(base.keys[key].value! - other.keys[key].value!) <= 0.15,
      `${key}: ${base.keys[key].value} versus ${other.keys[key].value}`,
    );
});

test('estimările pot fi citite de 183 fără schimbare de semantică', () => {
  const result = positive(),
    estimated: Partial<Record<(typeof HAZARD_POLICY_V2_KEYS)[number], number>> = {};
  for (const key of HAZARD_V2_ESTIMATOR_KEYS)
    // The report reads the estimate at six decimals, so the replay does the same.
    estimated[key] = Math.round(result.keys[key].value! * 1e6) / 1e6;
  for (const probe of compatibilityProbes()) {
    const authored = probe.fact(
        evaluate(probe.scene, {
          tick: probe.tick,
          opportunityKey: probe.opportunityKey,
          rValues: TRUE_HAZARD_PROFILE,
        }).command,
      ),
      replay = probe.fact(
        evaluate(probe.scene, {
          tick: probe.tick,
          opportunityKey: probe.opportunityKey,
          rValues: estimated,
        }).command,
      );
    assert.equal(replay, authored, probe.key);
  }
});

test('eșantionul de dovezi nu poartă nicio valoare R a profilului', () => {
  const sample = positiveEpisodes()[0]!.samples[0]!,
    fields = Object.keys(sample);
  assert.ok(!fields.includes('profile'));
  assert.ok(!fields.includes('values'));
  assert.ok(!fields.includes('rValues'));
  for (const key of HAZARD_V2_ESTIMATOR_KEYS) assert.ok(!fields.includes(key), key);
  assert.deepEqual(
    [...hazardV2EvidenceReasons].sort(),
    [
      'CROSSWALK_APPROACH',
      'EVASION_COMMITTED',
      'EVASION_NO_SPACE',
      'EVASION_REFUSED',
      'FOREIGN_OR_STALE_OBSERVATION',
      'FREE_ROAD',
      'HAZARD_POLICY_V2',
      'HAZARD_REACTION',
      'HAZARD_REACTION_SATURATED',
      'HAZARD_STOPPING_DISTANCE_EXCEEDED',
      'HORN_FORBIDDEN',
      'HORN_REFUSED',
      'HORN_USED',
      'MISSING_PROFILE',
      'NO_AUTO_AUTHORITY',
      'OBSTACLE_CLEARANCE',
      'PEDESTRIAN_CLEARANCE',
      'PEDESTRIAN_MANDATORY_YIELD',
      'PEDESTRIAN_PROCEED',
      'PEDESTRIAN_YIELD',
    ].sort(),
  );
});

test('o intrare malformată este refuzată', () => {
  assert.throws(
    () =>
      estimateHazardV2Style({
        episodes: [
          {
            ...positiveEpisodes()[0]!,
            samples: [{ ...positiveEpisodes()[0]!.samples[0]!, tick: -1 }],
          },
        ],
        splitSeed: SPLIT_SEED,
      }),
    /hazard evidence/,
  );
  assert.throws(() => estimateHazardV2Style({ episodes: [], splitSeed: -1 }), /hazard evidence/);
});
