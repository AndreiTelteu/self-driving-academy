import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import {
  getParameterDefinition,
  parameterDefinitions,
  parameterRegistry,
  parseParameterCatalog,
  parseDrivingProfile,
  parsePublishableDrivingProfile,
  validateParameterValue,
} from '../../src/profiles';
import type { ParameterKey } from '../../src/profiles';
import { ContractValidationError } from '../../src/sessions';

const canonicalPath = new URL('../../Docs/driving-parameters.json', import.meta.url);
function catalog() {
  return JSON.parse(readFileSync(canonicalPath, 'utf8'));
}

function profile(key = 'following_time_headway', source = 'BASE') {
  const definition = getParameterDefinition(key);
  return {
    schemaVersion: 1,
    units: 'SI',
    profileId: 'style',
    versionId: 'v1',
    parentVersionId: null,
    engineVersion: 'engine-1',
    parameters: { [key]: definition.default },
    unitsByParameter: { [key]: definition.unit },
    provenanceByParameter: { [key]: source },
    evidenceByParameter: {
      [key]:
        source === 'LEARNED'
          ? {
              key,
              effectiveCount: 2,
              contexts: ['fixture'],
              quality: 0.8,
              uncertainty: 0.1,
              sourceSegmentIds: ['segment'],
              estimatorVersion: 'fixture-only',
            }
          : null,
    },
    sourceSegmentIds: source === 'LEARNED' ? ['segment'] : [],
    createdAt: '2026-10-05T00:00:00Z',
    checksum: 'unverified:fixture',
  };
}

test('80 unique keys, 24 M targets; planned stages grant no capabilities', () => {
  const typedKey: ParameterKey = 'speed_delta_urban';
  assert.equal(parameterRegistry[typedKey].key, typedKey);
  assert.equal(parameterDefinitions.length, 80);
  assert.equal(new Set(parameterDefinitions.map((entry) => entry.key)).size, 80);
  assert.equal(Object.keys(parameterRegistry).length, 80);
  assert.equal(
    parameterDefinitions.filter((entry) => entry.implementationStage === 'initial_learning_target')
      .length,
    24,
  );
  assert(parameterDefinitions.every((entry) => !entry.implemented && !entry.estimable));
  assert.deepEqual(parseParameterCatalog(catalog()), parameterDefinitions);
});

test('every key validates default, inclusive bounds, canonical unit and finite range', () => {
  for (const entry of parameterDefinitions) {
    for (const value of [entry.default, entry.min, entry.max]) {
      assert.equal(validateParameterValue(entry.key, value, entry.unit), value);
    }
    for (const value of [NaN, Infinity, -Infinity, entry.min - 1, entry.max + 1, '1', null]) {
      assert.throws(
        () => validateParameterValue(entry.key, value, entry.unit),
        ContractValidationError,
      );
    }
    assert.throws(
      () => validateParameterValue(entry.key, entry.default, 'km/h'),
      ContractValidationError,
    );
  }
  for (const key of ['missing', '__proto__', 'constructor', 'toString']) {
    assert.throws(() => getParameterDefinition(key), ContractValidationError);
  }
  assert.equal(getParameterDefinition('route_turn_penalty').unit, 's');
  assert.equal(getParameterDefinition('route_turn_penalty').sourceUnit, 's/viraj');
  assert.equal(getParameterDefinition('route_signal_penalty').sourceUnit, 's/semafor');
  assert.equal(getParameterDefinition('red_stop_probability').unit, 'probability');
  assert.equal(getParameterDefinition('coasting_bias').unit, 'ratio');
  assert.equal(getParameterDefinition('route_time_weight').unit, 'weight');
});

test('publication gate rejects LEARNED and manual tuning for all unsupported keys', () => {
  for (const entry of parameterDefinitions) {
    for (const source of ['LEARNED', 'MANUAL_TUNING']) {
      const candidate = profile(entry.key, source);
      assert.doesNotThrow(() => parseDrivingProfile(candidate));
      assert.throws(() => parsePublishableDrivingProfile(candidate), ContractValidationError);
    }
    for (const source of ['BASE', 'IMPORTED']) {
      const candidate = profile(entry.key, source);
      assert.deepEqual(parsePublishableDrivingProfile(candidate), parseDrivingProfile(candidate));
    }
  }
});

test('publication gate rejects unknown keys, wrong units and invalid ranges for all provenance', () => {
  for (const source of ['BASE', 'IMPORTED', 'LEARNED', 'MANUAL_TUNING']) {
    const candidate = profile('following_time_headway', source);
    candidate.parameters.following_time_headway = 6;
    assert.throws(() => parsePublishableDrivingProfile(candidate), ContractValidationError);
    candidate.parameters.following_time_headway = 1;
    candidate.unitsByParameter.following_time_headway = 'm';
    assert.throws(() => parsePublishableDrivingProfile(candidate), ContractValidationError);
  }
  const candidate = profile();
  candidate.parameters = { unknown_key: 1 };
  candidate.unitsByParameter = { unknown_key: 's' };
  candidate.provenanceByParameter = { unknown_key: 'BASE' };
  candidate.evidenceByParameter = { unknown_key: null };
  assert.doesNotThrow(() => parseDrivingProfile(candidate));
  assert.throws(() => parsePublishableDrivingProfile(candidate), ContractValidationError);
});

test('publication retains structural evidence and provenance checks and roundtrip', () => {
  const candidate = profile('following_time_headway', 'LEARNED');
  candidate.evidenceByParameter.following_time_headway = null;
  assert.throws(() => parsePublishableDrivingProfile(candidate), ContractValidationError);
  const invalidSource = profile('following_time_headway', 'NOT_A_SOURCE');
  assert.throws(() => parsePublishableDrivingProfile(invalidSource), ContractValidationError);
  const base = profile();
  const parsed = parsePublishableDrivingProfile(base);
  assert.deepEqual(parsePublishableDrivingProfile(JSON.parse(JSON.stringify(parsed))), parsed);
  base.parameters.following_time_headway = 4;
  assert.equal(parsed.parameters.following_time_headway, 1.8);
  assert(Object.isFrozen(parsed.parameters));
});

test('malformed catalog rejects schema, shape, duplicate/unknown keys and invalid definitions', () => {
  const mutations: ((data: ReturnType<typeof catalog>) => void)[] = [
    (data) => {
      data.schemaVersion = 2;
    },
    (data) => {
      data.units = 'imperial';
    },
    (data) => {
      data.status = 'implemented';
    },
    (data) => {
      data.updatedOn = '2026-02-30';
    },
    (data) => {
      data.extra = 1;
    },
    (data) => {
      data.parameters.pop();
    },
    (data) => {
      data.parameters[1] = data.parameters[0];
    },
    (data) => {
      data.parameters[0].key = 'unknown_key';
    },
    (data) => {
      data.parameters[0].unit = 'mph';
    },
    (data) => {
      data.parameters[0].default = NaN;
    },
    (data) => {
      data.parameters[0].min = Infinity;
    },
    (data) => {
      data.parameters[0].max = -9;
    },
    (data) => {
      data.parameters[0].default = 99;
    },
    (data) => {
      data.parameters[0].implemented = true;
    },
    (data) => {
      data.parameters[0].implementationStage = 'extension';
    },
    (data) => {
      data.parameters[0].implementationStage = 'M';
    },
    (data) => {
      data.parameters[0].estimable = true;
    },
    (data) => {
      data.parameters[0].description = '';
    },
    (data) => {
      delete data.parameters[0].evidenceContext;
    },
    (data) => {
      data.parameters[0].unit = 'probabilitate';
    },
    (data) => {
      delete data.parameters[0];
    },
    (data) => {
      Object.defineProperty(data.parameters[0], 'unit', {
        get() {
          throw new Error('Getter must not execute');
        },
      });
    },
  ];
  for (const mutate of mutations) {
    const data = catalog();
    mutate(data);
    assert.throws(() => parseParameterCatalog(data), ContractValidationError);
  }
});

test('registry and parsed catalog are defensive immutable data', () => {
  const data = catalog();
  const parsed = parseParameterCatalog(data);
  data.parameters[0].default = 10;
  assert.equal(parsed[0].default, 0);
  assert(Object.isFrozen(parsed));
  assert(Object.isFrozen(parameterRegistry));
  assert(Object.isFrozen(parameterDefinitions));
  assert(parameterDefinitions.every(Object.isFrozen));
  assert.equal(Reflect.set(parameterRegistry.speed_delta_urban, 'implemented', true), false);
});

test('generated runtime catalog is synchronized with canonical JSON', () => {
  execFileSync(process.execPath, ['scripts/generate-parameter-catalog.mjs', '--check'], {
    cwd: new URL('../../', import.meta.url),
    encoding: 'utf8',
  });
});
