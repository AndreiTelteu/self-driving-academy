import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PROFILE_STORE_CHECKSUM_ALGORITHM,
  PROFILE_STORE_POLICY,
  PROFILE_STORE_VERSION,
  computeProfileVersionChecksum,
  createProfileStore,
  getParameterDefinition,
  isProfileStoreAccepted,
  parameterDefinitions,
  parameterRegistry,
  profileStoreRejectionCodes,
  verifyProfileVersionChecksum,
} from '../../src/profiles';
import type {
  ProfileDeltaRequest,
  ProfileDeltaValidator,
  ProfileStore,
  ProfileStoreOptions,
  ProfileStoreResult,
  ProfileVersion,
} from '../../src/profiles';
import {
  CANDIDATE_VALIDATION_VERSION,
  createCandidateProfileStore,
  validateCandidateDelta,
} from '../../src/learning';
import { ContractValidationError } from '../../src/sessions';

const ENGINE = 'engine-1';
const BASE_AT = '2026-10-20T00:00:00Z';
const CHILD_AT = '2026-10-20T00:01:00Z';

const BASE_PARAMETERS: Readonly<Record<string, number>> = Object.freeze({
  speed_delta_urban: 0,
  following_time_headway: 1.8,
  stop_full_probability: 1,
});

function entry(key: string, value: number) {
  return { key, value, unit: getParameterDefinition(key).unit };
}

function createStore(
  options: Partial<Omit<ProfileStoreOptions, 'validateDelta'>> = {},
): ProfileStore {
  return createCandidateProfileStore({
    engineVersion: ENGINE,
    now: () => BASE_AT,
    ...options,
  });
}

function createBase(store: ProfileStore, profileId = 'academy', versionId = 'v1'): ProfileVersion {
  const result = store.createBase({
    profileId,
    versionId,
    parameters: BASE_PARAMETERS,
    sourceSegmentIds: [],
    createdAt: BASE_AT,
  });
  assert.equal(result.status, 'ACCEPTED');
  if (!isProfileStoreAccepted(result)) throw new Error('expected an accepted base version');
  return result.profileVersion;
}

function delta(
  versionId: string,
  parentVersionId: string,
  values: readonly { key: string; value: number; unit: string }[],
) {
  return {
    profileVersionId: versionId,
    parentVersionId,
    engineVersion: ENGINE,
    schemaVersion: 1,
    units: 'SI',
    values,
  };
}

function request(overrides: Partial<ProfileDeltaRequest> = {}): ProfileDeltaRequest {
  return {
    profileId: 'academy',
    versionId: 'v2',
    parentVersionId: 'v1',
    segmentId: 'segment-1',
    interventionId: 'intervention-1',
    createdAt: CHILD_AT,
    delta: delta('v2', 'v1', [
      entry('speed_delta_urban', 1.4),
      entry('following_time_headway', 2.2),
    ]),
    ...overrides,
  };
}

function accepted(result: ProfileStoreResult) {
  assert.equal(result.status, 'ACCEPTED');
  if (!isProfileStoreAccepted(result)) throw new Error('expected an accepted result');
  return result;
}

function rejected(result: ProfileStoreResult) {
  assert.equal(result.status, 'REJECTED');
  if (isProfileStoreAccepted(result)) throw new Error('expected a rejected result');
  return result;
}

function code(result: ProfileStoreResult): string {
  return rejected(result).rejection.code;
}

function version(store: ProfileStore, versionId: string): ProfileVersion {
  const stored = store.getVersion(versionId);
  assert.notEqual(stored, null);
  return stored as ProfileVersion;
}

test('109 base versions are deep-frozen, copied on read and independent of caller data', () => {
  const store = createStore();
  const mutable = { ...BASE_PARAMETERS };
  const created = accepted(
    store.createBase({
      profileId: 'academy',
      versionId: 'v1',
      parameters: mutable,
      createdAt: BASE_AT,
    }),
  );
  mutable.speed_delta_urban = 99;

  const first = created.profileVersion;
  const second = version(store, 'v1');
  assert.notEqual(first, second);
  assert.deepEqual(first, second);
  assert.equal(second.parameters.speed_delta_urban, 0);
  assert.equal(second.parentVersionId, null);
  assert.equal(second.engineVersion, ENGINE);
  assert.equal(second.depth, 0);
  assert.equal(second.provenance.origin, 'BASE');
  assert.equal(second.provenance.delta, null);

  assert(Object.isFrozen(second));
  assert(Object.isFrozen(second.parameters));
  assert(Object.isFrozen(second.provenance));
  assert(Object.isFrozen(second.provenance.sourceSegmentIds));
  assert(Object.isFrozen(second.sourceSegmentIds));
  assert.throws(() => {
    (second.parameters as Record<string, number>).speed_delta_urban = 40;
  }, TypeError);

  assert.equal(second.checksum, computeProfileVersionChecksum(second));
  assert.equal(verifyProfileVersionChecksum(second), true);
  assert.equal(PROFILE_STORE_CHECKSUM_ALGORITHM, 'fnv1a64');
  assert.equal(PROFILE_STORE_VERSION, '109-profile-store-v1');
});

test('109 derived versions record parent, engine, full values and delta provenance', () => {
  const store = createStore();
  const base = createBase(store);
  const result = accepted(store.derive(request()));

  assert.equal(result.created, true);
  assert.equal(result.deduplicated, false);
  assert.equal(result.versionId, 'v2');
  const child = result.profileVersion;
  assert.equal(child.parentVersionId, base.versionId);
  assert.equal(child.engineVersion, ENGINE);
  assert.equal(child.depth, base.depth + 1);
  assert.equal(child.parameters.speed_delta_urban, 1.4);
  assert.equal(child.parameters.following_time_headway, 2.2);
  assert.equal(child.parameters.stop_full_probability, 1);
  assert.deepEqual([...child.sourceSegmentIds], ['segment-1']);
  assert.equal(child.provenance.origin, 'DERIVED');
  assert.deepEqual([...child.provenance.sourceInterventionIds], ['intervention-1']);

  const deltaRecord = child.provenance.delta;
  assert.notEqual(deltaRecord, null);
  assert.equal(deltaRecord?.baseVersionId, 'v1');
  assert.equal(deltaRecord?.validationVersion, CANDIDATE_VALIDATION_VERSION);
  assert.equal(deltaRecord?.segmentId, 'segment-1');
  assert.equal(deltaRecord?.interventionId, 'intervention-1');
  assert.equal(deltaRecord?.keyCount, 2);
  assert.deepEqual(
    deltaRecord?.changes.map((change) => [change.key, change.previousValue, change.newValue]),
    [
      ['speed_delta_urban', 0, 1.4],
      ['following_time_headway', 1.8, 2.2],
    ],
  );
  assert.equal(verifyProfileVersionChecksum(child), true);
});

test('109 the parent version is never edited in place', () => {
  const store = createStore();
  const base = createBase(store);
  const baseChecksum = base.checksum;
  accepted(store.derive(request()));
  accepted(
    store.derive(
      request({
        versionId: 'v3',
        parentVersionId: 'v2',
        segmentId: 'segment-2',
        delta: delta('v3', 'v2', [entry('speed_delta_urban', 2.5)]),
      }),
    ),
  );

  const reread = version(store, 'v1');
  assert.equal(reread.parameters.speed_delta_urban, 0);
  assert.equal(reread.parameters.following_time_headway, 1.8);
  assert.equal(reread.checksum, baseChecksum);
  assert.notEqual(reread, base);
  assert.throws(() => {
    (reread.parameters as Record<string, number>).following_time_headway = 0.2;
  }, TypeError);

  const child = version(store, 'v2');
  assert.notEqual(child.parameters, reread.parameters);
  assert.throws(() => {
    (child.parameters as Record<string, number>).speed_delta_urban = 10;
  }, TypeError);
});

test('109 a delta preserves its base and cannot perform a hidden absolute replacement', () => {
  const store = createStore();
  const base = createBase(store);
  const child = accepted(store.derive(request())).profileVersion;

  assert.equal(child.parentVersionId, base.versionId);
  assert.equal(child.provenance.delta?.baseVersionId, base.versionId);
  for (const change of child.provenance.delta?.changes ?? []) {
    assert.equal(change.previousValue, base.parameters[change.key]);
    assert.equal(child.parameters[change.key], change.newValue);
  }
  assert.equal(child.parameters.stop_full_probability, base.parameters.stop_full_probability);

  const wrongBase = rejected(
    store.derive(
      request({
        versionId: 'v9',
        parentVersionId: 'v1',
        segmentId: 'segment-9',
        delta: delta('v9', 'ghost-base', [entry('speed_delta_urban', 1)]),
      }),
    ),
  );
  assert.equal(wrongBase.rejection.code, 'DELTA_BASE_MISMATCH');

  const absentKey = rejected(
    store.derive(
      request({
        versionId: 'v8',
        segmentId: 'segment-8',
        delta: delta('v8', 'v1', [entry('desired_acceleration', 2)]),
      }),
    ),
  );
  assert.equal(absentKey.rejection.code, 'DELTA_KEY_NOT_IN_BASE');
  assert.equal(store.getVersion('v9'), null);
  assert.equal(store.getVersion('v8'), null);
});

test('109 the same intervention is idempotent across retries and conflicts stay closed', () => {
  const store = createStore();
  createBase(store);
  const first = accepted(store.derive(request()));
  assert.equal(first.created, true);

  const retry = accepted(store.derive(request()));
  assert.equal(retry.versionId, first.versionId);
  assert.equal(retry.created, false);
  assert.equal(retry.deduplicated, true);
  assert.equal(store.listVersions('academy').length, 2);

  const delayedRetry = accepted(
    store.derive(
      request({
        versionId: 'v2-retry',
        delta: delta('v2-retry', 'v1', [
          entry('speed_delta_urban', 1.4),
          entry('following_time_headway', 2.2),
        ]),
        createdAt: '2026-10-20T00:05:00Z',
      }),
    ),
  );
  assert.equal(delayedRetry.versionId, 'v2');
  assert.equal(delayedRetry.deduplicated, true);

  const conflict = rejected(
    store.derive(
      request({
        versionId: 'v2-conflict',
        delta: delta('v2-conflict', 'v1', [entry('speed_delta_urban', 3)]),
      }),
    ),
  );
  assert.equal(conflict.rejection.code, 'INTERVENTION_CONFLICT');
  assert.equal(store.listVersions('academy').length, 2);
  assert.equal(store.getInterventionVersion('academy', 'segment-1'), 'v2');
  assert.deepEqual(store.stats(), {
    version: PROFILE_STORE_VERSION,
    engineVersion: ENGINE,
    disposed: false,
    versions: 2,
    baseVersions: 1,
    derivedVersions: 1,
    profiles: 1,
    interventions: 1,
    deduplicated: 2,
    rejected: 1,
    historyLimitRejections: 0,
    clears: 0,
    disposes: 0,
  });
});

test('109 invalid deltas are rejected closed with the 102 reasons', () => {
  const store = createStore();
  createBase(store);
  const cases: readonly [string, ProfileDeltaRequest, string][] = [
    [
      'out of range',
      request({
        versionId: 'bad-range',
        segmentId: 'bad-range',
        delta: delta('bad-range', 'v1', [entry('speed_delta_urban', 99)]),
      }),
      'VALUE_OUT_OF_RANGE',
    ],
    [
      'not finite',
      request({
        versionId: 'bad-nan',
        segmentId: 'bad-nan',
        delta: delta('bad-nan', 'v1', [{ ...entry('speed_delta_urban', 1), value: NaN }]),
      }),
      'VALUE_NOT_FINITE',
    ],
    [
      'extension key',
      request({
        versionId: 'bad-r',
        segmentId: 'bad-r',
        delta: delta('bad-r', 'v1', [entry('route_turn_penalty', 2)]),
      }),
      'KEY_EXTENSION_STAGE',
    ],
    [
      'empty',
      request({
        versionId: 'bad-empty',
        segmentId: 'bad-empty',
        delta: delta('bad-empty', 'v1', []),
      }),
      'DELTA_EMPTY',
    ],
  ];
  for (const [label, input, expected] of cases) {
    const failure = rejected(store.derive(input));
    assert.equal(failure.rejection.code, 'DELTA_INVALID', label);
    assert(failure.rejection.deltaCodes.includes(expected), label);
    assert(profileStoreRejectionCodes.includes(failure.rejection.code));
    assert.equal(store.getVersion(input.versionId), null);
  }

  const malformed = rejected(
    store.derive(
      request({
        versionId: 'bad-structure',
        segmentId: 'bad-structure',
        delta: { ...delta('bad-structure', 'v1', []), values: 'not-an-array' } as never,
      }),
    ),
  );
  assert.equal(malformed.rejection.code, 'DELTA_INVALID');
  assert.equal(store.stats().versions, 1);
});

test('109 engine version mismatch is rejected with a closed reason', () => {
  const store = createStore();
  createBase(store);

  const wrong = rejected(
    store.derive(
      request({
        versionId: 'wrong-engine',
        segmentId: 'wrong-engine',
        delta: {
          ...delta('wrong-engine', 'v1', [entry('speed_delta_urban', 1)]),
          engineVersion: 'engine-2',
        },
      }),
    ),
  );
  assert.equal(wrong.rejection.code, 'ENGINE_VERSION_MISMATCH');

  const missing = rejected(
    store.derive(
      request({
        versionId: 'missing-engine',
        segmentId: 'missing-engine',
        delta: {
          ...delta('missing-engine', 'v1', [entry('speed_delta_urban', 1)]),
          engineVersion: undefined,
        },
      }),
    ),
  );
  assert.equal(missing.rejection.code, 'ENGINE_VERSION_MISMATCH');
  assert.equal(store.listVersions('academy').length, 1);
});

test('109 missing, foreign and self parents are rejected closed', () => {
  const store = createStore();
  createBase(store, 'academy', 'v1');
  createBase(store, 'haos', 'h1');

  assert.equal(
    code(
      store.derive(
        request({
          versionId: 'v2',
          parentVersionId: 'ghost',
          segmentId: 'ghost',
          delta: delta('v2', 'ghost', [entry('speed_delta_urban', 1)]),
        }),
      ),
    ),
    'PARENT_NOT_FOUND',
  );
  assert.equal(
    code(
      store.derive(
        request({
          versionId: 'v2',
          parentVersionId: 'h1',
          segmentId: 'foreign',
          delta: delta('v2', 'h1', [entry('speed_delta_urban', 1)]),
        }),
      ),
    ),
    'PARENT_FOREIGN',
  );
  assert.equal(
    code(
      store.derive(
        request({
          versionId: 'v1',
          parentVersionId: 'v1',
          segmentId: 'self',
          delta: delta('v1', 'v1', [entry('speed_delta_urban', 1)]),
        }),
      ),
    ),
    'PARENT_SELF',
  );
  assert.equal(store.listVersions('academy').length, 1);
  assert.equal(store.listVersions('haos').length, 1);
});

test('109 delta metadata that does not match the request is rejected closed', () => {
  const store = createStore();
  createBase(store);

  assert.equal(
    code(
      store.derive(
        request({ delta: delta('other-version', 'v1', [entry('speed_delta_urban', 1)]) }),
      ),
    ),
    'DELTA_VERSION_MISMATCH',
  );
  assert.equal(
    code(
      store.derive(
        request({
          versionId: 'v7',
          segmentId: 's7',
          delta: delta('v7', 'ghost', [entry('speed_delta_urban', 1)]),
        }),
      ),
    ),
    'DELTA_BASE_MISMATCH',
  );
});

test('109 history is bounded by explicit limits instead of growing without bound', () => {
  const bounded = createStore({ maxVersions: 2 });
  createBase(bounded);
  accepted(bounded.derive(request()));
  const overflow = rejected(
    bounded.derive(
      request({
        versionId: 'v3',
        parentVersionId: 'v2',
        segmentId: 'segment-3',
        delta: delta('v3', 'v2', [entry('speed_delta_urban', 2)]),
      }),
    ),
  );
  assert.equal(overflow.rejection.code, 'HISTORY_LIMIT');
  assert.equal(bounded.stats().versions, 2);
  assert.equal(bounded.stats().rejected, 1);
  assert.equal(bounded.stats().historyLimitRejections, 1);
  assert.equal(bounded.getVersion('v3'), null);

  const perProfile = createStore({ maxVersions: 8, maxVersionsPerProfile: 2 });
  createBase(perProfile);
  accepted(perProfile.derive(request()));
  assert.equal(
    code(
      perProfile.derive(
        request({
          versionId: 'v3',
          parentVersionId: 'v2',
          segmentId: 'segment-3',
          delta: delta('v3', 'v2', [entry('speed_delta_urban', 2)]),
        }),
      ),
    ),
    'HISTORY_LIMIT',
  );

  const interventions = createStore({ maxInterventions: 1 });
  createBase(interventions);
  accepted(interventions.derive(request()));
  assert.equal(
    code(
      interventions.derive(
        request({
          versionId: 'v3',
          parentVersionId: 'v2',
          segmentId: 'segment-2',
          delta: delta('v3', 'v2', [entry('speed_delta_urban', 2.5)]),
        }),
      ),
    ),
    'INTERVENTION_LIMIT',
  );
});

test('109 clear and dispose have explicit lifecycle semantics and counters', () => {
  const store = createStore();
  createBase(store);
  accepted(store.derive(request()));
  store.clear();
  let stats = store.stats();
  assert.equal(stats.versions, 0);
  assert.equal(stats.interventions, 0);
  assert.equal(stats.clears, 1);
  assert.equal(store.getVersion('v1'), null);
  assert.equal(
    code(
      store.derive(
        request({
          delta: delta('v2', 'v1', [entry('speed_delta_urban', 1)]),
        }),
      ),
    ),
    'PARENT_NOT_FOUND',
  );

  createBase(store, 'academy', 'v10');
  accepted(
    store.derive(
      request({
        versionId: 'v11',
        parentVersionId: 'v10',
        segmentId: 'segment-11',
        delta: delta('v11', 'v10', [entry('speed_delta_urban', 1.1)]),
      }),
    ),
  );
  assert.equal(store.listVersions('academy').length, 2);

  store.dispose();
  stats = store.stats();
  assert.equal(stats.disposed, true);
  assert.equal(stats.disposes, 1);
  assert.equal(stats.versions, 0);
  store.dispose();
  assert.equal(store.stats().disposes, 1);
  assert.equal(code(store.derive(request())), 'STORE_DISPOSED');
  assert.equal(
    code(store.createBase({ profileId: 'academy', versionId: 'v12', parameters: BASE_PARAMETERS })),
    'STORE_DISPOSED',
  );
  assert.equal(store.getVersion('v11'), null);
  assert.equal(store.stats().disposed, true);
});

test('109 checksum is deterministic and detects tampering', () => {
  const store = createStore();
  createBase(store);
  const child = accepted(store.derive(request())).profileVersion;

  assert.equal(computeProfileVersionChecksum(child), child.checksum);
  assert.equal(version(store, 'v2').checksum, child.checksum);
  assert.notEqual(
    computeProfileVersionChecksum({ ...child, createdAt: '2026-10-20T00:02:00Z' }),
    child.checksum,
  );

  const tampered = {
    ...child,
    parameters: { ...child.parameters, speed_delta_urban: 12 },
  } as ProfileVersion;
  assert.notEqual(computeProfileVersionChecksum(tampered), child.checksum);
  assert.equal(verifyProfileVersionChecksum(tampered), false);
  assert.equal(verifyProfileVersionChecksum({ ...child, checksum: 'bad' }), false);
});

test('109 history and listings are scoped to one profile', () => {
  const store = createStore();
  createBase(store, 'academy', 'a1');
  createBase(store, 'haos', 'h1');
  accepted(
    store.derive(
      request({
        profileId: 'academy',
        versionId: 'a2',
        parentVersionId: 'a1',
        segmentId: 'segment-a2',
        delta: delta('a2', 'a1', [entry('speed_delta_urban', 1)]),
      }),
    ),
  );
  accepted(
    store.derive(
      request({
        profileId: 'academy',
        versionId: 'a3',
        parentVersionId: 'a2',
        segmentId: 'segment-a3',
        delta: delta('a3', 'a2', [entry('speed_delta_urban', 2)]),
      }),
    ),
  );

  assert.deepEqual(
    store.getHistory('academy').map((item) => item.versionId),
    ['a1', 'a2', 'a3'],
  );
  assert.deepEqual(
    store.getHistory('academy', 'a2').map((item) => item.versionId),
    ['a1', 'a2'],
  );
  assert.deepEqual(
    store.getHistory('haos').map((item) => item.versionId),
    ['h1'],
  );
  assert.deepEqual(
    store.listVersions('academy').map((item) => item.versionId),
    ['a1', 'a2', 'a3'],
  );
  assert.deepEqual(
    store.listVersions('haos').map((item) => item.versionId),
    ['h1'],
  );
  assert.equal(store.listVersions().length, 4);
});

test('109 the store never publishes, marks LEARNED or activates 092 capabilities', () => {
  const before = parameterDefinitions.map((definition) => [
    definition.key,
    definition.implemented,
    definition.estimable,
  ]);
  const store = createStore();
  createBase(store);
  accepted(store.derive(request()));

  const after = parameterDefinitions.map((definition) => [
    definition.key,
    definition.implemented,
    definition.estimable,
  ]);
  assert.deepEqual(after, before);
  assert(parameterDefinitions.every((definition) => !definition.estimable));
  assert.equal(parameterRegistry.route_turn_penalty.implemented, false);
  assert.equal(PROFILE_STORE_POLICY.publishesProfile, false);
  assert.equal(PROFILE_STORE_POLICY.publishesDelta, false);
  assert.equal(PROFILE_STORE_POLICY.marksLearned, false);
  assert.equal(PROFILE_STORE_POLICY.activatesProfile, false);
  assert.equal(PROFILE_STORE_POLICY.mutatesRegistry, false);

  const child = version(store, 'v2');
  assert.equal(Object.hasOwn(child, 'published'), false);
  assert.equal(Object.hasOwn(child, 'learned'), false);
  assert.equal(
    Object.keys(child.parameters).some(
      (key) => !parameterDefinitions.some((definition) => definition.key === key),
    ),
    false,
  );
});

test('109 the injected validator is the only numeric gate and is not blindly trusted', () => {
  const seen: string[] = [];
  const spy: ProfileDeltaValidator = (input, expectations) => {
    seen.push(`${expectations?.baseVersionId ?? ''}:${expectations?.engineVersion ?? ''}`);
    return validateCandidateDelta(input, expectations);
  };
  const store = createProfileStore({
    engineVersion: ENGINE,
    validateDelta: spy,
    now: () => BASE_AT,
  });
  createBase(store);
  accepted(store.derive(request()));
  assert.deepEqual(seen, ['v1:engine-1']);

  const rogue: ProfileDeltaValidator = () => ({
    status: 'ACCEPTED',
    version: 'rogue-v1',
    delta: {
      profileVersionId: 'v2',
      parentVersionId: 'v1',
      engineVersion: ENGINE,
      keyCount: 1,
      values: [{ key: 'speed_delta_urban', unit: 'm/s', value: 99 }],
    },
  });
  const guarded = createProfileStore({
    engineVersion: ENGINE,
    validateDelta: rogue,
    now: () => BASE_AT,
  });
  createBase(guarded);
  assert.equal(
    code(
      guarded.derive(
        request({
          versionId: 'v2',
          segmentId: 'segment-1',
          delta: delta('v2', 'v1', [entry('speed_delta_urban', 1)]),
        }),
      ),
    ),
    'DELTA_INVALID',
  );
});

test('109 structural request errors throw while domain failures stay closed', () => {
  const store = createStore();
  assert.throws(() => store.createBase(null as never), ContractValidationError);
  assert.throws(
    () =>
      store.createBase({
        profileId: 'academy',
        versionId: 'v1',
        parameters: { unknown_key: 1 },
      }),
    ContractValidationError,
  );
  assert.throws(() => store.getVersion(''), ContractValidationError);
  assert.throws(
    () => store.derive({ ...request(), extra: true } as never),
    ContractValidationError,
  );

  createBase(store);
  const unknownParent = rejected(
    store.derive(
      request({
        versionId: 'v2',
        parentVersionId: 'missing',
        delta: delta('v2', 'missing', [entry('speed_delta_urban', 1)]),
      }),
    ),
  );
  assert.equal(unknownParent.rejection.code, 'PARENT_NOT_FOUND');
  assert(profileStoreRejectionCodes.includes(unknownParent.rejection.code));
  assert.equal(isProfileStoreAccepted(store.derive(request())), true);
});
