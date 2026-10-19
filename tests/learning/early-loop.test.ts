import assert from 'node:assert/strict';
import test from 'node:test';
import {
  composeEarlyLoopProfile,
  earlyLoopForMode,
  compileEarlyLoopControllerProfiles,
  type EarlyLoopCandidates,
  type EarlyLoopKey,
} from '../../src/learning/early-loop.ts';
import { parameterDefinitions, parsePublishableDrivingProfile } from '../../src/profiles';

const keys: readonly EarlyLoopKey[] = [
  'speed_delta_urban',
  'desired_acceleration',
  'stop_full_probability',
];
function read(key: EarlyLoopKey, status: 'READY' | 'NO_EVIDENCE' = 'READY') {
  return {
    key,
    status,
    distinctEpisodes: 3,
    contextBreakdown: [],
    sampleCount: 3,
    quality: 0.8,
    uncertainty: status === 'READY' ? 'LOW' : 'NONE',
    unchanged: true,
    noEstimate: status === 'READY' ? null : 'NO_QUALIFYING_EVIDENCE',
  } as const;
}
const candidates = {
  speed_delta_urban: {
    status: 'CANDIDATE',
    value: 4,
    quality: 0.8,
    sourceEpisodeCount: 3,
    reason: null,
  },
  desired_acceleration: {
    status: 'CANDIDATE',
    value: 5,
    quality: 0.8,
    sourceEpisodeCount: 3,
    reason: null,
  },
  stop_full_probability: {
    status: 'CANDIDATE',
    value: 0.2,
    quality: 0.8,
    sourceEpisodeCount: 3,
    reason: null,
  },
} as unknown as EarlyLoopCandidates;
const base = { speed_delta_urban: 0, desired_acceleration: 2, stop_full_probability: 0.5 };
const source = Object.fromEntries(
  keys.map((key) => [
    key,
    {
      segmentIds: ['seg-a', 'seg-b', 'seg-c'],
      opportunityIds: [`opp-${key}-1`, `opp-${key}-2`, `opp-${key}-3`],
    },
  ]),
) as Record<EarlyLoopKey, { segmentIds: string[]; opportunityIds: string[] }>;

test('three-key blend is quality bounded, directional and provenance-bearing', () => {
  const profile = composeEarlyLoopProfile(
    base,
    keys.map((key) => read(key)),
    candidates,
    source,
  );
  assert.equal(profile.values.speed_delta_urban.value, 0.8);
  assert.equal(profile.values.desired_acceleration.value, 2.6);
  assert.equal(profile.values.stop_full_probability.value, 0.44);
  assert.equal(profile.values.speed_delta_urban.blend, 0.2);
  assert.deepEqual(
    profile.values.stop_full_probability.source.opportunityIds,
    source.stop_full_probability.opportunityIds,
  );
  assert.equal(profile.publication, 'IN_MEMORY_AUTO_ONLY');
});

test('missing evidence or provenance leaves value unchanged and MANUAL cannot learn', () => {
  const noSource = { ...source, desired_acceleration: { segmentIds: [], opportunityIds: [] } };
  const profile = composeEarlyLoopProfile(
    base,
    [
      read('speed_delta_urban'),
      read('desired_acceleration', 'NO_EVIDENCE'),
      read('stop_full_probability'),
    ],
    candidates,
    noSource,
  );
  assert.equal(profile.values.desired_acceleration.value, base.desired_acceleration);
  assert.equal(profile.values.desired_acceleration.candidate, null);
  for (const key of [
    'speed_delta_urban',
    'desired_acceleration',
    'stop_full_probability',
  ] as const) {
    const noEvidenceProfile = composeEarlyLoopProfile(
      base,
      keys.map((entry) => read(entry, 'NO_EVIDENCE')),
      candidates,
      source,
    );
    assert.equal(noEvidenceProfile.values[key].value, base[key]);
    assert.equal(noEvidenceProfile.values[key].candidate, null);
    assert.equal(noEvidenceProfile.values[key].blend, 0);
  }
  assert.equal(earlyLoopForMode('MANUAL', profile), null);
  assert.equal(earlyLoopForMode('AUTO', profile), profile);
});

test('compiled early-loop values cross the real 046/047/051 profile boundaries without LEARNED', () => {
  const definitions = parameterDefinitions,
    values = Object.fromEntries(
      definitions.map((definition) => [definition.key, definition.default]),
    ),
    units = Object.fromEntries(definitions.map((definition) => [definition.key, definition.unit])),
    provenance = Object.fromEntries(definitions.map((definition) => [definition.key, 'BASE'])),
    evidence = Object.fromEntries(definitions.map((definition) => [definition.key, null]));
  const baseProfile = parsePublishableDrivingProfile({
    schemaVersion: 1,
    units: 'SI',
    profileId: '204-fixture',
    versionId: '204-base-v1',
    parentVersionId: null,
    engineVersion: '204-fixture-engine',
    parameters: values,
    unitsByParameter: units,
    provenanceByParameter: provenance,
    evidenceByParameter: evidence,
    sourceSegmentIds: [],
    createdAt: '2026-10-19T00:00:00.000Z',
    checksum: '204-fixture',
  });
  const composed = composeEarlyLoopProfile(
      {
        speed_delta_urban: values.speed_delta_urban,
        desired_acceleration: values.desired_acceleration,
        stop_full_probability: values.stop_full_probability,
      },
      keys.map((key) => read(key)),
      {
        speed_delta_urban: {
          status: 'CANDIDATE',
          value: 4,
          quality: 0.8,
          sourceEpisodeCount: 3,
          reason: null,
        },
        desired_acceleration: {
          status: 'CANDIDATE',
          value: 5,
          quality: 0.8,
          sourceEpisodeCount: 3,
          reason: null,
        },
        stop_full_probability: {
          status: 'CANDIDATE',
          value: 0.2,
          quality: 0.8,
          sourceEpisodeCount: 3,
          reason: null,
        },
      } as unknown as EarlyLoopCandidates,
      source,
    ),
    tokens = compileEarlyLoopControllerProfiles('AUTO', baseProfile, composed);
  assert(tokens !== null);
  assert.equal(compileEarlyLoopControllerProfiles('MANUAL', baseProfile, composed), null);
  assert.equal(compileEarlyLoopControllerProfiles('LEARNING', baseProfile, composed), null);
  assert.equal(tokens.cruise.values.speed_delta_urban, composed.values.speed_delta_urban.value);
  assert.equal(
    tokens.longitudinal.values.desired_acceleration,
    composed.values.desired_acceleration.value,
  );
  assert.equal(tokens.stop.stopFullProbability, composed.values.stop_full_probability.value);
  assert.deepEqual(
    keys.map((key) => tokens.profile.provenanceByParameter[key]),
    ['BASE', 'BASE', 'BASE'],
  );
  assert(keys.every((key) => tokens.profile.provenanceByParameter[key] !== 'LEARNED'));
  assert.equal(tokens.profile.versionId, '204-base-v1-204-early');
});
