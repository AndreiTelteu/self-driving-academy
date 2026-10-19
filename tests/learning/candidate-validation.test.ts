import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CANDIDATE_LEARNING_KEYS,
  CANDIDATE_VALIDATION_POLICY,
  CANDIDATE_VALIDATION_VERSION,
  candidateRejectionCodes,
  isCandidateValidationAccepted,
  validateCandidateDelta,
} from '../../src/learning/candidate-validation';
import type {
  CandidateDeltaInput,
  CandidateValidationResult,
} from '../../src/learning/candidate-validation';
import { parameterDefinitions, parameterRegistry } from '../../src/profiles';

function entry(key: unknown, value: unknown, unit: unknown): Record<string, unknown> {
  return { key, value, unit };
}

function delta(values: readonly unknown[]): CandidateDeltaInput {
  return { profileVersionId: 'profile-v2', parentVersionId: 'profile-v1', values };
}

function accepted(result: CandidateValidationResult) {
  assert.equal(result.status, 'ACCEPTED');
  if (!isCandidateValidationAccepted(result)) throw new Error('expected an accepted delta');
  return result;
}

function rejected(result: CandidateValidationResult) {
  assert.equal(result.status, 'REJECTED');
  if (isCandidateValidationAccepted(result)) throw new Error('expected a rejected delta');
  return result;
}

function codes(result: CandidateValidationResult): string[] {
  return result.rejections.map((row) => row.code);
}

test('102 a valid delta is accepted and fully frozen', () => {
  const result = accepted(
    validateCandidateDelta({
      profileVersionId: 'profile-v2',
      parentVersionId: 'profile-v1',
      engineVersion: 'engine-1',
      schemaVersion: 1,
      units: 'SI',
      values: [
        entry('speed_delta_urban', 1.4, 'm/s'),
        entry('following_time_headway', 1.8, 's'),
        entry('stop_full_probability', 0.9, 'probability'),
      ],
    }),
  );

  assert.equal(CANDIDATE_VALIDATION_VERSION, '102-candidate-validation-v1');
  assert.equal(result.delta.keyCount, 3);
  assert.equal(result.delta.profileVersionId, 'profile-v2');
  assert.equal(result.delta.parentVersionId, 'profile-v1');
  assert.equal(result.delta.engineVersion, 'engine-1');
  assert.equal(result.rejections.length, 0);
  assert.equal(result.acceptedKeyCount, 3);
  assert.equal(result.behaviour, 'NOT_EVALUATED');
  assert.equal(result.published, false);
  assert.equal(result.learned, false);
  assert.equal(result.delta.values[0].min, -8);
  assert.equal(result.delta.values[0].max, 15);
  assert.equal(result.delta.byKey.following_time_headway?.unit, 's');
  assert.equal(result.delta.byKey.following_time_headway?.value, 1.8);
  assert.equal(CANDIDATE_VALIDATION_POLICY.behaviouralGate, 'NONE');

  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.delta));
  assert.ok(Object.isFrozen(result.delta.values));
  assert.ok(Object.isFrozen(result.delta.values[0]));
  assert.ok(Object.isFrozen(result.delta.byKey));
  assert.ok(Object.isFrozen(result.rejections));
});

test('102 every one of the 24 M keys is supported at the current learning stage', () => {
  const stageKeys = parameterDefinitions
    .filter((definition) => definition.implementationStage === 'initial_learning_target')
    .map((definition) => definition.key);
  assert.deepEqual([...CANDIDATE_LEARNING_KEYS], stageKeys);
  assert.equal(CANDIDATE_LEARNING_KEYS.length, 24);

  const values = CANDIDATE_LEARNING_KEYS.map((key) =>
    entry(key, parameterRegistry[key].default, parameterRegistry[key].unit),
  );
  const result = accepted(validateCandidateDelta({ profileVersionId: 'p2', values }));
  assert.deepEqual(
    result.delta.values.map((row) => row.key),
    [...CANDIDATE_LEARNING_KEYS],
  );
  assert.equal(result.delta.keyCount, 24);
});

test('102 NaN is rejected with a closed reason, never silently dropped', () => {
  const result = rejected(
    validateCandidateDelta(delta([entry('speed_delta_urban', Number.NaN, 'm/s')])),
  );

  assert.equal(result.delta, null);
  assert.equal(result.acceptedKeyCount, 0);
  assert.deepEqual(codes(result), ['VALUE_NOT_FINITE']);
  assert.equal(result.rejections[0].key, 'speed_delta_urban');
  assert.equal(result.rejections[0].path, 'values[0].value');
  assert.ok(Number.isNaN(result.rejections[0].value));
  assert.ok(candidateRejectionCodes.includes(result.rejections[0].code));
});

test('102 Infinity and non-numeric values are rejected as not finite', () => {
  const result = rejected(
    validateCandidateDelta(
      delta([
        entry('speed_delta_urban', Number.POSITIVE_INFINITY, 'm/s'),
        entry('desired_acceleration', Number.NEGATIVE_INFINITY, 'm/s²'),
        entry('comfort_deceleration', '2.0', 'm/s²'),
      ]),
    ),
  );

  assert.deepEqual(codes(result), ['VALUE_NOT_FINITE', 'VALUE_NOT_FINITE', 'VALUE_NOT_FINITE']);
  assert.deepEqual(
    result.rejections.map((row) => row.path),
    ['values[0].value', 'values[1].value', 'values[2].value'],
  );
  assert.equal(result.rejectedValueCount, 3);
  assert.equal(result.delta, null);
});

test('102 values outside the 092 range are rejected while the boundaries stay valid', () => {
  const outside = rejected(
    validateCandidateDelta(
      delta([
        entry('speed_delta_urban', 15.1, 'm/s'),
        entry('speed_delta_urban', -8.1, 'm/s'),
        entry('curve_lateral_accel', 0.2, 'm/s²'),
      ]),
    ),
  );
  assert.deepEqual(codes(outside), [
    'VALUE_OUT_OF_RANGE',
    'DUPLICATE_KEY',
    'VALUE_OUT_OF_RANGE',
    'VALUE_OUT_OF_RANGE',
  ]);
  assert.equal(outside.rejections[0].key, 'speed_delta_urban');
  assert.equal(outside.delta, null);
  assert.ok(
    outside.rejections[0].message.includes('[-8, 15]'),
    'the rejection must carry the registry bounds',
  );

  const boundaries = accepted(
    validateCandidateDelta(
      delta([
        entry('speed_delta_urban', 15, 'm/s'),
        entry('speed_delta_residential', -8, 'm/s'),
        entry('curve_lateral_accel', 0.5, 'm/s²'),
      ]),
    ),
  );
  assert.deepEqual(
    boundaries.delta.values.map((row) => row.value),
    [15, -8, 0.5],
  );
});

test('102 unknown keys are rejected instead of being ignored', () => {
  const result = rejected(validateCandidateDelta(delta([entry('speed_delta_moon', 1, 'm/s')])));

  assert.deepEqual(codes(result), ['KEY_UNKNOWN']);
  assert.equal(result.rejections[0].key, 'speed_delta_moon');
  assert.equal(result.rejections[0].path, 'values[0].key');
  assert.equal(result.delta, null);
});

test('102 an R extension key is refused with an explicit stage reason', () => {
  const result = rejected(validateCandidateDelta(delta([entry('speed_delta_arterial', 3, 'm/s')])));

  assert.deepEqual(codes(result), ['KEY_EXTENSION_STAGE']);
  assert.equal(result.rejections[0].key, 'speed_delta_arterial');
  assert.equal(result.rejections[0].path, 'values[0].key');
  assert.equal(result.rejections[0].value, 'speed_delta_arterial');
  assert.equal(result.acceptedKeyCount, 0);
  assert.equal(result.delta, null);
  assert.equal(parameterRegistry.speed_delta_arterial.implemented, false);
});

test('102 a unit that does not match 092 is rejected', () => {
  const result = rejected(
    validateCandidateDelta(
      delta([entry('speed_delta_urban', 1.4, 'km/h'), entry('following_min_gap', 3, undefined)]),
    ),
  );

  assert.deepEqual(codes(result), ['UNIT_MISMATCH', 'UNIT_MISMATCH']);
  assert.equal(result.rejections[0].path, 'values[0].unit');
  assert.equal(result.rejections[0].value, 'km/h');
  assert.equal(result.rejections[1].path, 'values[1].unit');
  assert.equal(result.delta, null);
});

test('102 a mixed delta is rejected atomically instead of partially accepted', () => {
  const result = rejected(
    validateCandidateDelta(
      delta([
        entry('speed_delta_urban', 1.4, 'm/s'),
        entry('following_time_headway', Number.NaN, 's'),
        entry('speed_delta_arterial', 3, 'm/s'),
        entry('speed_delta_moon', 2, 'm/s'),
      ]),
    ),
  );

  assert.equal(result.delta, null, 'no accepted part may leak to the caller');
  assert.equal(result.acceptedKeyCount, 0);
  assert.equal(result.rejectedValueCount, 3);
  assert.deepEqual(codes(result), ['VALUE_NOT_FINITE', 'KEY_EXTENSION_STAGE', 'KEY_UNKNOWN']);
  assert.ok(!('values' in result), 'a rejected result exposes no partial value list');
  assert.equal(result.published, false);
  assert.equal(result.learned, false);
});

test('102 risky but numerically valid values are accepted without hidden clamping', () => {
  const result = accepted(
    validateCandidateDelta(
      delta([
        entry('speed_delta_urban', 15, 'm/s'),
        entry('curve_lateral_accel', 8, 'm/s²'),
        entry('following_min_gap', 0.2, 'm'),
        entry('following_time_headway', 0.2, 's'),
        entry('lane_change_cooldown', 0.5, 's'),
      ]),
    ),
  );

  assert.deepEqual(
    result.delta.values.map((row) => row.value),
    [15, 8, 0.2, 0.2, 0.5],
    'collision-prone or aggressive values must not be softened or rejected',
  );
  assert.equal(result.behaviour, 'NOT_EVALUATED');
  assert.equal(result.rejections.length, 0);
  assert.equal(result.acceptedKeyCount, 5);
  assert.equal(result.delta.byKey.following_time_headway?.value, 0.2);
});

test('102 profile version, base contract and engine compatibility are explicit', () => {
  const valid = [entry('speed_delta_urban', 1.4, 'm/s')];

  const matching = accepted(
    validateCandidateDelta(
      { profileVersionId: 'p2', parentVersionId: 'p1', engineVersion: 'engine-1', values: valid },
      { baseVersionId: 'p1', engineVersion: 'engine-1' },
    ),
  );
  assert.equal(matching.delta.keyCount, 1);

  const wrongBase = rejected(
    validateCandidateDelta(
      { profileVersionId: 'p2', parentVersionId: 'p1', values: valid },
      { baseVersionId: 'p9' },
    ),
  );
  assert.deepEqual(codes(wrongBase), ['BASE_VERSION_MISMATCH']);
  assert.equal(wrongBase.rejections[0].path, 'delta.parentVersionId');
  assert.equal(wrongBase.rejections[0].value, 'p1');

  const selfParent = rejected(
    validateCandidateDelta({ profileVersionId: 'p2', parentVersionId: 'p2', values: valid }),
  );
  assert.deepEqual(codes(selfParent), ['PROFILE_VERSION_SELF_PARENT']);

  const missingVersion = rejected(validateCandidateDelta({ values: valid }));
  assert.deepEqual(codes(missingVersion), ['PROFILE_VERSION_MISSING']);
  assert.equal(missingVersion.rejections[0].path, 'delta.profileVersionId');
  assert.equal(missingVersion.rejections[0].value, undefined);

  const wrongSchema = rejected(
    validateCandidateDelta({
      profileVersionId: 'p2',
      schemaVersion: 2,
      units: 'imperial',
      values: valid,
    }),
  );
  assert.deepEqual(codes(wrongSchema), ['PROFILE_SCHEMA_MISMATCH', 'PROFILE_SCHEMA_MISMATCH']);

  const wrongEngine = rejected(
    validateCandidateDelta(
      { profileVersionId: 'p2', engineVersion: 'engine-1', values: valid },
      { engineVersion: 'engine-2' },
    ),
  );
  assert.deepEqual(codes(wrongEngine), ['ENGINE_VERSION_MISMATCH']);
  assert.equal(wrongEngine.rejections[0].path, 'delta.engineVersion');
});

test('102 duplicate keys and empty deltas are rejected closed', () => {
  const duplicate = rejected(
    validateCandidateDelta(
      delta([
        entry('desired_acceleration', 1.5, 'm/s²'),
        entry('desired_acceleration', 2.5, 'm/s²'),
      ]),
    ),
  );
  assert.deepEqual(codes(duplicate), ['DUPLICATE_KEY']);
  assert.equal(duplicate.rejections[0].path, 'values[1].key');
  assert.equal(duplicate.delta, null);

  const empty = rejected(validateCandidateDelta(delta([])));
  assert.deepEqual(codes(empty), ['DELTA_EMPTY']);
  assert.equal(empty.rejections[0].path, 'values');
  assert.equal(empty.delta, null);
});

test('102 malformed structure throws while value problems return closed reasons', () => {
  assert.throws(() => validateCandidateDelta({ profileVersionId: 'p2', values: null }));
  assert.throws(() => validateCandidateDelta({ profileVersionId: 'p2', values: 'x' }));
  assert.throws(() => validateCandidateDelta(null as unknown as CandidateDeltaInput));

  const malformed = rejected(
    validateCandidateDelta(delta([null, entry('speed_delta_urban', 1.4, 'm/s')])),
  );
  assert.deepEqual(codes(malformed), ['VALUE_ENTRY_INVALID']);
  assert.equal(malformed.rejections[0].path, 'values[0]');
  assert.equal(malformed.delta, null);
});

test('102 validation is deterministic, reads the registry read-only and never publishes', () => {
  const implementedBefore = Object.fromEntries(
    CANDIDATE_LEARNING_KEYS.map((key) => [key, parameterRegistry[key].implemented]),
  );
  const estimableBefore = Object.fromEntries(
    CANDIDATE_LEARNING_KEYS.map((key) => [key, parameterRegistry[key].estimable]),
  );
  const input = Object.freeze({
    profileVersionId: 'p2',
    parentVersionId: 'p1',
    values: Object.freeze([
      Object.freeze(entry('speed_delta_urban', 1.4, 'm/s')),
      Object.freeze(entry('curve_lateral_accel', 7.5, 'm/s²')),
    ]),
  });

  const first = accepted(validateCandidateDelta(input));
  const second = accepted(validateCandidateDelta(input));
  assert.deepEqual(first.delta, second.delta);
  assert.equal(first.delta.values[0].value, 1.4);
  assert.equal(first.delta.values[1].value, 7.5);

  for (const key of CANDIDATE_LEARNING_KEYS) {
    assert.equal(parameterRegistry[key].implemented, implementedBefore[key]);
    assert.equal(parameterRegistry[key].estimable, estimableBefore[key]);
  }
  assert.equal(first.published, false);
  assert.equal(first.learned, false);
  assert.equal(CANDIDATE_VALIDATION_POLICY.publishesDelta, false);
  assert.equal(CANDIDATE_VALIDATION_POLICY.marksLearned, false);
});
