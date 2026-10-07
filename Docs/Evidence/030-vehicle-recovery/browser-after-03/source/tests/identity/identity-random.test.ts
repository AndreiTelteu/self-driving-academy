import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ContractValidationError,
  createStableId,
  deriveOpportunitySeed,
  deriveScenarioSeed,
  deriveVehicleSeed,
  IDENTITY_VERSION,
  randomUint32,
  randomUnit,
  RANDOM_VERSION,
} from '../../src/sessions/index.ts';

function opportunity(root = 12345, scenario = 'city:one', vehicle = 'taxi-7', key = 'STOP:main:3') {
  return deriveOpportunitySeed(deriveVehicleSeed(deriveScenarioSeed(root, scenario), vehicle), key);
}

test('versioned identity and RNG golden vectors fix encoding and algorithm', () => {
  assert.equal(IDENTITY_VERSION, 1);
  assert.equal(RANDOM_VERSION, 1);
  assert.equal(randomUint32(1, '🚕'), 75481929);
  assert.equal(randomUint32(1, '\ud800'), 1093624163);
  assert.equal(
    createStableId('vehicle', 'city:one', ['taxi-7', '🚕']),
    'id-v1:7:vehicle8:city:one6:taxi-72:🚕',
  );
  const scenario = deriveScenarioSeed(12345, 'city:one');
  assert.equal(scenario, 3054818983);
  const vehicle = deriveVehicleSeed(scenario, 'taxi-7');
  assert.equal(vehicle, 1945142871);
  const seed = deriveOpportunitySeed(vehicle, 'STOP:main:3');
  assert.equal(seed, 2770425298);
  assert.deepEqual(
    [0, 1, 2, 3, Number.MAX_SAFE_INTEGER].map((i) => randomUint32(seed, 'decision', i)),
    [2651730780, 2303379157, 3315660770, 3021006712, 881791003],
  );
});

test('IDs preserve boundaries, namespace, kind and exact Unicode code units', () => {
  const cases = [
    ['a:b', 'c'],
    ['a', 'b:c'],
    ['a', 'bc'],
    ['ab', 'c'],
    ['🚕', 'ă'],
    ['\ud800', 'x'],
    ['é', 'x'],
    ['e\u0301', 'x'],
    ['x', 'y'],
  ];
  const ids = cases.map((parts) => createStableId('vehicle', 'city', parts));
  assert.equal(new Set(ids).size, cases.length);
  assert.notEqual(createStableId('vehicle', 'city', ['x']), createStableId('event', 'city', ['x']));
  assert.notEqual(
    createStableId('vehicle', 'city', ['x']),
    createStableId('vehicle', 'city2', ['x']),
  );
  assert.notEqual(
    createStableId('vehicle', 'city', ['x']),
    createStableId('vehicle', 'city', [' x']),
  );
  assert.equal(createStableId('vehicle', 'city', ['x']), createStableId('vehicle', 'city', ['x']));
});

test('inserted events and reversed evaluation preserve addressed opportunity samples', () => {
  const keys = ['STOP:main:3', 'RED:cross:2', 'LANE:road:1'];
  const collect = (order: readonly string[]) =>
    new Map(
      order.map((key) => [
        key,
        [0, 1, 2, 3].map((index) =>
          randomUint32(opportunity(12345, 'city:one', 'taxi-7', key), 'decision', index),
        ),
      ]),
    );
  const baseline = collect(keys);
  const inserted = collect(['other-event', ...[...keys].reverse(), 'new-taxi-event']);
  for (const key of keys) assert.deepEqual(inserted.get(key), baseline.get(key));
  const seed = opportunity();
  const saved = randomUint32(seed, 'decision', 2);
  randomUint32(seed, 'unrelated-purpose', 100);
  randomUint32(opportunity(99), 'decision', 2);
  assert.equal(randomUint32(seed, 'decision', 2), saved);
});

test('seed scopes and sample purpose/index distinguish fixed fixtures', () => {
  const seeds = [
    opportunity(),
    opportunity(12346),
    opportunity(12345, 'city:two'),
    opportunity(12345, 'city:one', 'taxi-8'),
    opportunity(12345, 'city:one', 'taxi-7', 'STOP:main:4'),
  ];
  assert.equal(new Set(seeds).size, seeds.length);
  const samples = [
    randomUint32(seeds[0], 'decision', 0),
    randomUint32(seeds[0], 'decision', 1),
    randomUint32(seeds[0], 'reaction', 0),
  ];
  assert.equal(new Set(samples).size, samples.length);
  assert.notEqual(deriveScenarioSeed(1, 'same'), deriveVehicleSeed(1, 'same'));
  assert.notEqual(deriveVehicleSeed(1, 'same'), deriveOpportunitySeed(1, 'same'));
});

test('JSON restart reproduces samples from version, seed, purpose and index only', () => {
  const saved: unknown = JSON.parse(
    JSON.stringify({ version: RANDOM_VERSION, seed: opportunity(), key: 'decision', index: 15 }),
  );
  assert.ok(
    typeof saved === 'object' &&
      saved !== null &&
      'seed' in saved &&
      'key' in saved &&
      'index' in saved &&
      'version' in saved,
  );
  assert.equal(saved.version, RANDOM_VERSION);
  assert.equal(typeof saved.seed, 'number');
  assert.equal(typeof saved.key, 'string');
  assert.equal(typeof saved.index, 'number');
  if (
    typeof saved.seed !== 'number' ||
    typeof saved.key !== 'string' ||
    typeof saved.index !== 'number'
  )
    throw new Error('Invalid fixture');
  assert.equal(
    randomUint32(saved.seed, saved.key, saved.index),
    randomUint32(opportunity(), 'decision', 15),
  );
});

test('unit samples are exact uint32 fractions in the half-open unit interval', () => {
  for (let index = 0; index < 1000; index += 1) {
    const value = randomUnit(opportunity(), 'decision', index);
    assert.ok(value >= 0 && value < 1);
    assert.equal(value * 0x1_0000_0000, randomUint32(opportunity(), 'decision', index));
  }
  assert.equal(randomUint32(0, 'zero'), randomUint32(-0, 'zero'));
  assert.ok(Number.isInteger(randomUint32(0xffff_ffff, 'max')));
  assert.notEqual(randomUint32(1, '🚕'), randomUint32(1, '🚖'));
});

test('unknown invalid inputs fail without coercion or accessor execution', () => {
  const largestPart = 'x'.repeat(256);
  assert.equal(createStableId(largestPart, largestPart, Array(16).fill(largestPart)).length, 4686);
  assert.ok(Number.isInteger(randomUint32(0, 'x'.repeat(8192))));
  const invalidSeeds = [null, undefined, '1', -1, 0x1_0000_0000, 1.5, NaN, Infinity, -Infinity];
  for (const seed of invalidSeeds) {
    assert.throws(() => Reflect.apply(randomUint32, null, [seed, 'x']), ContractValidationError);
    assert.throws(
      () => Reflect.apply(deriveScenarioSeed, null, [seed, 'x']),
      ContractValidationError,
    );
    assert.throws(
      () => Reflect.apply(deriveVehicleSeed, null, [seed, 'x']),
      ContractValidationError,
    );
    assert.throws(
      () => Reflect.apply(deriveOpportunitySeed, null, [seed, 'x']),
      ContractValidationError,
    );
  }
  for (const key of [null, undefined, 2, '', '  ', 'x'.repeat(8193)]) {
    assert.throws(() => Reflect.apply(randomUint32, null, [1, key]), ContractValidationError);
    assert.throws(
      () => Reflect.apply(deriveOpportunitySeed, null, [1, key]),
      ContractValidationError,
    );
  }
  for (const index of [null, '0', -1, 1.1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => Reflect.apply(randomUint32, null, [1, 'x', index]),
      ContractValidationError,
    );
  }
  for (const parts of [
    null,
    undefined,
    [],
    [''],
    ['x'.repeat(257)],
    Array(1),
    Array(17).fill('x'),
  ]) {
    assert.throws(
      () => Reflect.apply(createStableId, null, ['vehicle', 'city', parts]),
      ContractValidationError,
    );
  }
  for (const part of [null, undefined, '', ' ', 1, 'x'.repeat(257)]) {
    assert.throws(
      () => Reflect.apply(createStableId, null, [part, 'city', ['key']]),
      ContractValidationError,
    );
    assert.throws(
      () => Reflect.apply(createStableId, null, ['vehicle', part, ['key']]),
      ContractValidationError,
    );
  }
  const keys = ['key'];
  Object.defineProperty(keys, '0', {
    get: () => {
      throw new Error('Getter executed');
    },
    enumerable: true,
  });
  assert.throws(() => createStableId('vehicle', 'city', keys), ContractValidationError);
});
