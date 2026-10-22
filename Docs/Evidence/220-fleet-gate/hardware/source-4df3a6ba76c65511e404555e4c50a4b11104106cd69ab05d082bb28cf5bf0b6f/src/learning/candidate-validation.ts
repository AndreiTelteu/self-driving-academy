import { parameterDefinitions } from '../profiles';
import type { ParameterDefinition, ParameterKey, ParameterUnit } from '../profiles';

export const CANDIDATE_VALIDATION_VERSION = '102-candidate-validation-v1' as const;

/**
 * Closed rejection vocabulary. A caller may switch on these codes; validation never invents a
 * behavioural reason. Collisions, traffic violations and aggressive styles are not codes because
 * they are not grounds for rejection.
 */
export const candidateRejectionCodes = [
  'DELTA_EMPTY',
  'VALUE_ENTRY_INVALID',
  'DUPLICATE_KEY',
  'KEY_UNKNOWN',
  'KEY_EXTENSION_STAGE',
  'VALUE_NOT_FINITE',
  'VALUE_OUT_OF_RANGE',
  'UNIT_MISMATCH',
  'PROFILE_VERSION_MISSING',
  'PROFILE_VERSION_SELF_PARENT',
  'PROFILE_SCHEMA_MISMATCH',
  'BASE_VERSION_MISMATCH',
  'ENGINE_VERSION_MISMATCH',
] as const;
export type CandidateRejectionCode = (typeof candidateRejectionCodes)[number];

/** The 24 M (`initial_learning_target`) keys; R/`extension` keys are out of the learning stage. */
export const CANDIDATE_LEARNING_KEYS: readonly ParameterKey[] = Object.freeze(
  parameterDefinitions
    .filter((definition) => definition.implementationStage === 'initial_learning_target')
    .map((definition) => definition.key as ParameterKey),
);
if (CANDIDATE_LEARNING_KEYS.length !== 24) {
  throw new Error('Candidate validation must cover the 24 M parameters.');
}

const learningStageKeys = new Set<string>(CANDIDATE_LEARNING_KEYS);
const definitionsByKey = new Map<string, ParameterDefinition>(
  parameterDefinitions.map((definition) => [definition.key, definition]),
);

export const CANDIDATE_VALIDATION_POLICY = Object.freeze({
  /** Only the initial learning targets are accepted; R keys fail with KEY_EXTENSION_STAGE. */
  learningStage: 'initial_learning_target',
  /** Numeric validity only: no collision, violation or aggression gate exists here. */
  behaviouralGate: 'NONE',
  /** Validation never writes a profile, a delta or a 092 capability flag. */
  publishesProfile: false,
  publishesDelta: false,
  marksLearned: false,
  mutatesRegistry: false,
});

/** One candidate value. Fields are `unknown` because validation must inspect hostile input. */
export interface CandidateValueInput {
  readonly key: unknown;
  readonly value: unknown;
  readonly unit: unknown;
}

/** A candidate delta. Only `values` is structural; every leaf is validated and rejected closed. */
export interface CandidateDeltaInput {
  readonly profileVersionId?: unknown;
  readonly parentVersionId?: unknown;
  readonly engineVersion?: unknown;
  readonly schemaVersion?: unknown;
  readonly units?: unknown;
  readonly values: unknown;
}

/** Caller expectations for the base profile contract a delta claims to extend. */
export interface CandidateValidationExpectations {
  /** Version of the profile the delta was produced from; must match `parentVersionId`. */
  readonly baseVersionId?: string;
  /** Application/build engine version the delta is compatible with. */
  readonly engineVersion?: string;
}

export interface CandidateRejection {
  readonly code: CandidateRejectionCode;
  /** Offending key, or null when the problem is not tied to one parameter. */
  readonly key: string | null;
  /** Stable field path such as `values[1].value` or `delta.parentVersionId`. */
  readonly path: string;
  /** Offending value exactly as received; NaN/Infinity are preserved, not coerced. */
  readonly value: unknown;
  readonly message: string;
}

export interface AcceptedCandidateValue {
  readonly key: ParameterKey;
  readonly unit: ParameterUnit;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  /** Echoed 092 metadata. It is informational and never a validation gate here. */
  readonly implemented: boolean;
}

export interface AcceptedCandidateDelta {
  readonly profileVersionId: string;
  readonly parentVersionId: string | null;
  readonly engineVersion: string | null;
  readonly values: readonly AcceptedCandidateValue[];
  readonly byKey: Readonly<Partial<Record<ParameterKey, AcceptedCandidateValue>>>;
  readonly keyCount: number;
}

export interface CandidateValidationAccepted {
  readonly version: typeof CANDIDATE_VALIDATION_VERSION;
  readonly status: 'ACCEPTED';
  readonly delta: AcceptedCandidateDelta;
  /** Always empty: an accepted result cannot hide a rejected value. */
  readonly rejections: readonly [];
  readonly acceptedKeyCount: number;
  readonly rejectedValueCount: 0;
  readonly behaviour: 'NOT_EVALUATED';
  readonly published: false;
  readonly learned: false;
}

export interface CandidateValidationRejected {
  readonly version: typeof CANDIDATE_VALIDATION_VERSION;
  readonly status: 'REJECTED';
  /** Always null: there is no partially accepted or hidden delta. */
  readonly delta: null;
  readonly rejections: readonly CandidateRejection[];
  readonly acceptedKeyCount: 0;
  /** Number of delta entries that produced at least one rejection. */
  readonly rejectedValueCount: number;
  readonly behaviour: 'NOT_EVALUATED';
  readonly published: false;
  readonly learned: false;
}

export type CandidateValidationResult = CandidateValidationAccepted | CandidateValidationRejected;

const EMPTY_REJECTIONS = Object.freeze([]) as readonly [];

function rejection(
  code: CandidateRejectionCode,
  key: string | null,
  path: string,
  value: unknown,
  message: string,
): CandidateRejection {
  return Object.freeze({ code, key, path, value, message });
}

function acceptedValue(definition: ParameterDefinition, value: number): AcceptedCandidateValue {
  return Object.freeze({
    key: definition.key as ParameterKey,
    unit: definition.unit,
    value,
    min: definition.min,
    max: definition.max,
    implemented: definition.implemented,
  });
}

function acceptedResult(
  profileVersionId: string,
  parentVersionId: string | null,
  engineVersion: string | null,
  values: readonly AcceptedCandidateValue[],
): CandidateValidationAccepted {
  const byKey = Object.create(null) as Partial<Record<ParameterKey, AcceptedCandidateValue>>;
  for (const row of values) byKey[row.key] = row;
  return Object.freeze({
    version: CANDIDATE_VALIDATION_VERSION,
    status: 'ACCEPTED',
    delta: Object.freeze({
      profileVersionId,
      parentVersionId,
      engineVersion,
      values: Object.freeze([...values]),
      byKey: Object.freeze(byKey),
      keyCount: values.length,
    }),
    rejections: EMPTY_REJECTIONS,
    acceptedKeyCount: values.length,
    rejectedValueCount: 0,
    behaviour: 'NOT_EVALUATED',
    published: false,
    learned: false,
  });
}

/**
 * Validates one candidate delta or value list atomically against the 092 registry and the M
 * learning stage.
 *
 * Every value must be a finite number, use a known key, carry the canonical 092 unit, stay inside
 * the inclusive 092 `min`/`max` and belong to the 24 `initial_learning_target` keys. All problems
 * are collected; if there is at least one, the result is `REJECTED` with `delta: null` and
 * `acceptedKeyCount: 0`, so no caller can apply a partially validated delta. Numerically valid but
 * risky values (possible collisions, violations, aggressive style) are accepted on purpose: this
 * module has no behavioural gate. It never publishes a profile or delta, never writes 092
 * `implemented`/`estimable` and never labels a value `LEARNED`.
 */
export function validateCandidateDelta(
  input: CandidateDeltaInput,
  expectations: CandidateValidationExpectations = {},
): CandidateValidationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid candidate delta: expected an object');
  }
  if (!Array.isArray(input.values)) {
    throw new Error('Invalid candidate delta: values must be an array');
  }
  const entries = input.values as readonly unknown[];
  const rejections: CandidateRejection[] = [];
  const rejectedIndices = new Set<number>();

  const profileVersionId = typeof input.profileVersionId === 'string' ? input.profileVersionId : '';
  if (profileVersionId.length === 0) {
    rejections.push(
      rejection(
        'PROFILE_VERSION_MISSING',
        null,
        'delta.profileVersionId',
        input.profileVersionId,
        'The delta must declare a non-empty profile version id',
      ),
    );
  }

  if (input.schemaVersion !== undefined && input.schemaVersion !== 1) {
    rejections.push(
      rejection(
        'PROFILE_SCHEMA_MISMATCH',
        null,
        'delta.schemaVersion',
        input.schemaVersion,
        'Unsupported profile schema version',
      ),
    );
  }
  if (input.units !== undefined && input.units !== 'SI') {
    rejections.push(
      rejection(
        'PROFILE_SCHEMA_MISMATCH',
        null,
        'delta.units',
        input.units,
        'Unsupported profile units',
      ),
    );
  }

  let parentVersionId: string | null = null;
  let parentUsable = true;
  if (input.parentVersionId !== undefined && input.parentVersionId !== null) {
    if (typeof input.parentVersionId !== 'string' || input.parentVersionId.length === 0) {
      parentUsable = false;
      rejections.push(
        rejection(
          'PROFILE_SCHEMA_MISMATCH',
          null,
          'delta.parentVersionId',
          input.parentVersionId,
          'A parent version id must be a non-empty string or null',
        ),
      );
    } else {
      parentVersionId = input.parentVersionId;
      if (parentVersionId === profileVersionId) {
        rejections.push(
          rejection(
            'PROFILE_VERSION_SELF_PARENT',
            null,
            'delta.parentVersionId',
            parentVersionId,
            'A delta cannot extend its own profile version',
          ),
        );
      }
    }
  }
  if (parentUsable && expectations.baseVersionId !== undefined) {
    if (parentVersionId !== expectations.baseVersionId) {
      rejections.push(
        rejection(
          'BASE_VERSION_MISMATCH',
          null,
          'delta.parentVersionId',
          parentVersionId,
          `The delta must be based on profile version ${expectations.baseVersionId}`,
        ),
      );
    }
  }

  let engineVersion: string | null = null;
  if (input.engineVersion !== undefined) {
    if (typeof input.engineVersion !== 'string') {
      rejections.push(
        rejection(
          'PROFILE_SCHEMA_MISMATCH',
          null,
          'delta.engineVersion',
          input.engineVersion,
          'An engine version must be a string',
        ),
      );
    } else {
      engineVersion = input.engineVersion;
      if (
        expectations.engineVersion !== undefined &&
        engineVersion !== expectations.engineVersion
      ) {
        rejections.push(
          rejection(
            'ENGINE_VERSION_MISMATCH',
            null,
            'delta.engineVersion',
            engineVersion,
            `The delta requires engine version ${expectations.engineVersion}`,
          ),
        );
      }
    }
  }

  if (entries.length === 0) {
    rejections.push(
      rejection(
        'DELTA_EMPTY',
        null,
        'values',
        entries.length,
        'The delta must contain at least one value',
      ),
    );
  }

  const seen = new Set<string>();
  const accepted: AcceptedCandidateValue[] = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const path = `values[${index}]`;
    let entryRejected = false;
    const reject = (
      code: CandidateRejectionCode,
      key: string | null,
      field: string | null,
      value: unknown,
      message: string,
    ): void => {
      rejectedIndices.add(index);
      entryRejected = true;
      rejections.push(
        rejection(code, key, field === null ? path : `${path}.${field}`, value, message),
      );
    };

    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      reject(
        'VALUE_ENTRY_INVALID',
        null,
        null,
        entry,
        'Expected an entry with key, value and unit',
      );
      continue;
    }
    const row = entry as Readonly<Record<string, unknown>>;
    const key = row.key;
    const definition = typeof key === 'string' ? definitionsByKey.get(key) : undefined;

    if (typeof key !== 'string' || key.length === 0) {
      reject('KEY_UNKNOWN', null, 'key', key, 'Expected a known parameter key');
    } else if (!definition) {
      reject('KEY_UNKNOWN', key, 'key', key, `Unknown parameter: ${key}`);
    } else {
      if (seen.has(key)) {
        reject('DUPLICATE_KEY', key, 'key', key, `Duplicate delta value for ${key}`);
      } else {
        seen.add(key);
      }
      if (!learningStageKeys.has(definition.key)) {
        reject(
          'KEY_EXTENSION_STAGE',
          key,
          'key',
          key,
          `Parameter ${key} is an extension (R) key and is not supported by the current learning stage`,
        );
      }
      if (row.unit !== definition.unit) {
        reject(
          'UNIT_MISMATCH',
          key,
          'unit',
          row.unit,
          `Parameter ${key} requires unit ${definition.unit}`,
        );
      }
    }

    const numericValue =
      typeof row.value === 'number' && Number.isFinite(row.value) ? row.value : null;
    if (numericValue === null) {
      reject(
        'VALUE_NOT_FINITE',
        typeof key === 'string' ? key : null,
        'value',
        row.value,
        'Every candidate value must be a finite number',
      );
    } else if (definition && (numericValue < definition.min || numericValue > definition.max)) {
      reject(
        'VALUE_OUT_OF_RANGE',
        typeof key === 'string' ? key : null,
        'value',
        numericValue,
        `Parameter ${definition.key} must stay within [${definition.min}, ${definition.max}]`,
      );
    }

    if (!entryRejected && definition && numericValue !== null) {
      accepted.push(acceptedValue(definition, numericValue));
    }
  }

  if (rejections.length > 0) {
    return Object.freeze({
      version: CANDIDATE_VALIDATION_VERSION,
      status: 'REJECTED',
      delta: null,
      rejections: Object.freeze(rejections),
      acceptedKeyCount: 0,
      rejectedValueCount: rejectedIndices.size,
      behaviour: 'NOT_EVALUATED',
      published: false,
      learned: false,
    });
  }

  return acceptedResult(profileVersionId, parentVersionId, engineVersion, accepted);
}

/** Type guard for callers that only need the accepted branch. */
export function isCandidateValidationAccepted(
  result: CandidateValidationResult,
): result is CandidateValidationAccepted {
  return result.status === 'ACCEPTED';
}
