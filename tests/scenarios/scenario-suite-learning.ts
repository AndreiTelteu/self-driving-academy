import { blendProfileValue, PROFILE_BLEND_POLICY, confidenceThreshold } from '../../src/learning';
import type { ConfidenceCandidate } from '../../src/learning/evidence-confidence';
import type { ProfileBlendEpisode } from '../../src/learning/profile-blend';
import type { ParameterEvidenceReadModel } from '../../src/learning/parameter-evidence';
import type { ParameterKey } from '../../src/profiles';
import {
  SCENARIO_SUITE_SEED,
  absoluteTolerance,
  checkExact,
  checkNumber,
  checkTrue,
  scenarioOutcome,
} from './scenario-suite-support';
import type { ScenarioCheck, ScenarioOutcome } from './scenario-suite-support';

/**
 * Learning family: the 101 blend step and the 100 evidence gate on a fixed profile key.
 *
 * The oracle re-derives the documented update `oldValue + learningWeight × (estimate − oldValue)`
 * from the published policy constants and the caller's exposure, so a plausible wrong weight or a
 * silent rewrite fails the scenario. The negative case proves that contradictory evidence holds the
 * profile instead of moving it.
 */

const KEY: ParameterKey = 'speed_delta_urban';
const OLD_VALUE = 1.5;
const ESTIMATE = 4;

function round4(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

function evidence(key: ParameterKey, distinctEpisodes: number): ParameterEvidenceReadModel {
  return {
    key,
    status: distinctEpisodes > 0 ? 'READY' : 'NO_EVIDENCE',
    distinctEpisodes,
    contextBreakdown: [],
    sampleCount: distinctEpisodes,
    quality: distinctEpisodes > 0 ? 1 : 0,
    uncertainty: distinctEpisodes > 0 ? 'MODERATE' : 'HIGH',
    unchanged: true,
    noEstimate: distinctEpisodes > 0 ? null : 'NO_QUALIFYING_EVIDENCE',
  } as ParameterEvidenceReadModel;
}

function episodes(count: number, options: { readonly ticks?: number } = {}): ProfileBlendEpisode[] {
  const ticks = options.ticks ?? 600;
  return Array.from({ length: count }, (_, index) =>
    Object.freeze({
      opportunityId: `occ:151:${index + 1}`,
      occurrence: 1,
      observedTicks: ticks,
      ageSeconds: 0,
      value: ESTIMATE,
    }),
  );
}

function candidate(interval: readonly [number, number] | null = null): ConfidenceCandidate {
  return Object.freeze({
    key: KEY,
    status: 'CANDIDATE',
    value: ESTIMATE,
    interval:
      interval === null ? null : (Object.freeze([...interval]) as readonly [number, number]),
  });
}

/** Independent oracle of the documented 101 step for a corpus of fully exposed episodes. */
function expectedBlend(count: number, ticks = 600) {
  const minimumEpisodeTicks = confidenceThreshold(KEY).minimumEpisodeTicks;
  const effective = count * Math.min(1, ticks / minimumEpisodeTicks);
  const saturation = effective / (effective + PROFILE_BLEND_POLICY.saturationEpisodes);
  const cap =
    effective < PROFILE_BLEND_POLICY.novelEvidenceEpisodeLimit
      ? PROFILE_BLEND_POLICY.novelEvidenceWeightCap
      : PROFILE_BLEND_POLICY.maxUpdateWeight;
  const weight = round4(Math.max(0, Math.min(cap, 1 * saturation * 1)));
  return Object.freeze({
    effective,
    saturation,
    weight,
    value: round4(OLD_VALUE + weight * (ESTIMATE - OLD_VALUE)),
  });
}

export function runLearningScenarios(): readonly ScenarioOutcome[] {
  const one = expectedBlend(1);
  const single = blendProfileValue({
    key: KEY,
    oldValue: OLD_VALUE,
    evidence: evidence(KEY, 1),
    episodes: episodes(1),
    candidate: candidate(),
  });
  const many = expectedBlend(16);
  const repeated = blendProfileValue({
    key: KEY,
    oldValue: OLD_VALUE,
    evidence: evidence(KEY, 16),
    episodes: episodes(16),
    candidate: candidate(),
  });
  const held = blendProfileValue({
    key: KEY,
    oldValue: OLD_VALUE,
    evidence: evidence(KEY, 4),
    episodes: episodes(4),
    candidate: candidate([5, 3]),
  });

  const blendChecks = (
    result: typeof single,
    expected: typeof one,
    id: string,
  ): ScenarioCheck[] => [
    checkNumber(
      `${id} learning weight`,
      expected.weight,
      result.learningWeight,
      absoluteTolerance(1e-4, 'ratio', 'pasul este rotunjit la 4 zecimale de contract'),
      'greutatea combină calitatea, saturația și recența',
    ),
    checkNumber(
      `${id} new value`,
      expected.value,
      result.value,
      absoluteTolerance(1e-4, 'm/s', 'valoarea este rotunjită la 4 zecimale de contract'),
      'newValue = oldValue + weight × (estimate − oldValue)',
    ),
    checkExact(`${id} resolution`, 'APPLIED', result.resolution, 'dovada suficientă aplică pasul'),
    checkExact(`${id} changed flag`, true, result.changed, 'valoarea chiar se schimbă'),
    checkTrue(
      `${id} step stays bounded`,
      Math.abs(result.value - OLD_VALUE) <=
        Math.abs(PROFILE_BLEND_POLICY.maxUpdateWeight * (ESTIMATE - OLD_VALUE)),
      result.value,
      'pasul nu poate depăși plafonul publicat per actualizare',
    ),
    checkExact(`${id} not published`, false, result.published, 'modulul nu publică profilul'),
    checkExact(
      `${id} not learned`,
      false,
      result.learned,
      'modulul nu marchează cheia ca învățată',
    ),
  ];

  return Object.freeze([
    scenarioOutcome({
      id: 'learning-single-episode-bounded',
      family: 'LEARNING',
      polarity: 'POSITIVE',
      title: 'O singură demonstrație mută profilul doar până la plafonul de dovezi noi',
      contract: '101-profile-blend-v1 (plafon dovezi noi) + 100 evidence gate',
      seed: SCENARIO_SUITE_SEED,
      steps: 1,
      input: {
        key: KEY,
        oldValue: OLD_VALUE,
        estimate: ESTIMATE,
        episodes: 1,
        observedTicks: 600,
        ageSeconds: 0,
      },
      expected: { learningWeight: one.weight, value: one.value, resolution: 'APPLIED' },
      actual: {
        learningWeight: single.learningWeight,
        value: single.value,
        resolution: single.resolution,
      },
      checks: blendChecks(single, one, 'single'),
      note: 'O demonstrație izolată este tratată ca dovadă, nu ca obicei: plafon 0,15 per actualizare.',
    }),
    scenarioOutcome({
      id: 'learning-repeated-evidence',
      family: 'LEARNING',
      polarity: 'POSITIVE',
      title: 'Șaisprezece episoade consistente produc pasul maxim de 0,6',
      contract: '101-profile-blend-v1 (saturație și plafon maxim)',
      seed: SCENARIO_SUITE_SEED,
      steps: 16,
      input: {
        key: KEY,
        oldValue: OLD_VALUE,
        estimate: ESTIMATE,
        episodes: 16,
        observedTicks: 600,
        ageSeconds: 0,
      },
      expected: { learningWeight: many.weight, value: many.value, saturation: many.saturation },
      actual: {
        learningWeight: repeated.learningWeight,
        value: repeated.value,
        effectiveEpisodeCount: repeated.update.effectiveEpisodeCount,
      },
      checks: [
        ...blendChecks(repeated, many, 'repeated'),
        checkNumber(
          'repeated effective episodes',
          many.effective,
          repeated.update.effectiveEpisodeCount,
          absoluteTolerance(1e-6, 'episoade', 'fiecare episod complet contribuie cu 1'),
          '16 episoade complet expuse',
        ),
      ],
      note: 'Dovezile repetate ridică saturația la 0,8, dar plafonul per actualizare rămâne 0,6.',
    }),
    scenarioOutcome({
      id: 'learning-contradiction-holds-profile',
      family: 'LEARNING',
      polarity: 'NEGATIVE',
      title:
        'Un interval de estimator inversat este contradicție severă și profilul rămâne neschimbat',
      contract: '100-evidence-confidence-v1 + 101-profile-blend-v1',
      seed: SCENARIO_SUITE_SEED,
      steps: 1,
      input: {
        key: KEY,
        oldValue: OLD_VALUE,
        candidateInterval: [5, 3],
        episodes: 4,
        observedTicks: 600,
      },
      expected: {
        resolution: 'HELD_CONTRADICTION',
        contradiction: 'SEVERE',
        value: OLD_VALUE,
        estimate: null,
        changed: false,
      },
      actual: {
        resolution: held.resolution,
        contradiction: held.contradiction.severity,
        value: held.value,
        estimate: held.estimate,
        changed: held.changed,
      },
      checks: [
        checkExact(
          'contradiction resolution',
          'HELD_CONTRADICTION',
          held.resolution,
          'contradicția severă blochează pasul',
        ),
        checkExact(
          'contradiction severity',
          'SEVERE',
          held.contradiction.severity,
          'intervalul inversat este sever',
        ),
        checkNumber(
          'contradiction leaves value unchanged',
          OLD_VALUE,
          held.value,
          absoluteTolerance(0, 'm/s', 'nicio mișcare nu este acceptată'),
          'profilul păstrează valoarea de dinainte',
        ),
        checkExact(
          'contradiction has no estimate',
          null,
          held.estimate,
          'estimarea nu este aplicată',
        ),
        checkExact(
          'contradiction not changed',
          false,
          held.changed,
          'rezultatul declară neschimbat',
        ),
        checkExact('contradiction not published', false, held.published, 'nimic nu este publicat'),
        checkExact(
          'contradiction not learned',
          false,
          held.learned,
          'cheia nu este marcată învățată',
        ),
      ],
      note: 'Dovezile contradictorii nu sunt mediiate și nu rescriu profilul.',
    }),
  ]);
}
