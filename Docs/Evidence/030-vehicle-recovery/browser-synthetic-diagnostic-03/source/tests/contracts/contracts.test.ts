import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseRide } from '../../src/fleet/index';
import { parseDrivingProfile, parseParameterEvidence } from '../../src/profiles/index';
import {
  ContractValidationError,
  fields,
  list,
  number,
  record,
  text,
} from '../../src/sessions/index';
import { parseSimulationEvent } from '../../src/simulation/index';
import { parseInterventionSegment, parseTelemetrySample } from '../../src/telemetry/index';
import { parseVehicleCommand, parseVehicleState } from '../../src/vehicles/index';
import {
  command,
  context,
  event,
  evidence,
  profile,
  ride,
  sample,
  segment,
  state,
} from './fixtures';

const contracts: readonly {
  name: string;
  fixture: () => object;
  parse: (value: unknown) => unknown;
}[] = [
  { name: 'VehicleCommand', fixture: command, parse: parseVehicleCommand },
  { name: 'VehicleState', fixture: state, parse: parseVehicleState },
  { name: 'Ride', fixture: ride, parse: parseRide },
  { name: 'SimulationEvent', fixture: event, parse: parseSimulationEvent },
  { name: 'InterventionSegment', fixture: segment, parse: parseInterventionSegment },
  { name: 'TelemetrySample', fixture: sample, parse: parseTelemetrySample },
  { name: 'DrivingProfile', fixture: profile, parse: parseDrivingProfile },
  { name: 'ParameterEvidence', fixture: evidence, parse: parseParameterEvidence },
];

function assertFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertFrozen(child);
}

function numericPaths(value: unknown, path: string[] = []): string[][] {
  if (typeof value === 'number') return [path];
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]: [string, unknown]) =>
    numericPaths(child, [...path, key]),
  );
}

function replacePath(value: unknown, path: readonly string[], replacement: unknown): unknown {
  if (path.length === 0) return replacement;
  const [key, ...remaining] = path;
  if (Array.isArray(value))
    return value.map((child: unknown, index) =>
      String(index) === key ? replacePath(child, remaining, replacement) : child,
    );
  const data = record(value);
  return Object.fromEntries(
    Object.entries(data).map(([name, child]) => [
      name,
      name === key ? replacePath(child, remaining, replacement) : child,
    ]),
  );
}

for (const contract of contracts) {
  test(`${contract.name}: JSON roundtrip, immutable defensive copy`, () => {
    const input = contract.fixture();
    const parsed = contract.parse(input);
    assert.notEqual(parsed, input);
    assert.deepEqual(JSON.parse(JSON.stringify(parsed)), input);
    assert.deepEqual(contract.parse(JSON.parse(JSON.stringify(parsed))), parsed);
    assertFrozen(parsed);
    const before = JSON.stringify(parsed);
    Object.assign(input, { maliciousMutation: true });
    assert.equal(JSON.stringify(parsed), before);
  });

  test(`${contract.name}: rejects all nonfinite numeric leaves`, () => {
    const valid = contract.fixture();
    for (const path of numericPaths(valid)) {
      for (const invalid of [NaN, Infinity, -Infinity]) {
        assert.throws(
          () => contract.parse(replacePath(valid, path, invalid)),
          ContractValidationError,
          `${path.join('.')}: ${invalid}`,
        );
      }
    }
  });

  test(`${contract.name}: rejects unknown shape, extra/missing fields, unsupported versions`, () => {
    for (const invalid of [null, undefined, true, 1, 'data', [], new Date()])
      assert.throws(() => contract.parse(invalid), ContractValidationError);
    assert.throws(
      () => contract.parse({ ...contract.fixture(), extra: true }),
      ContractValidationError,
    );
    for (const key of Object.keys(contract.fixture())) {
      const missing = Object.fromEntries(
        Object.entries(contract.fixture()).filter(([name]) => name !== key),
      );
      assert.throws(() => contract.parse(missing), ContractValidationError, key);
    }
    if ('schemaVersion' in contract.fixture()) {
      for (const schemaVersion of [0, 2, '1'])
        assert.throws(
          () => contract.parse({ ...contract.fixture(), schemaVersion }),
          ContractValidationError,
        );
      assert.throws(
        () => contract.parse({ ...contract.fixture(), units: 'km/h' }),
        ContractValidationError,
      );
    }
  });
}

test('unknown data never executes getters or coercion; inherited fields/symbols/sparse arrays rejected', () => {
  let accessed = false;
  const input = command();
  Object.defineProperty(input, 'throttle', {
    enumerable: true,
    get() {
      accessed = true;
      throw new Error('getter executed');
    },
  });
  assert.throws(() => parseVehicleCommand(input), ContractValidationError);
  assert.equal(accessed, false);
  assert.throws(() => parseVehicleCommand(Object.create(command())), ContractValidationError);
  assert.throws(
    () => parseVehicleCommand({ ...command(), [Symbol('extra')]: 1 }),
    ContractValidationError,
  );
  assert.throws(() => parseRide({ ...ride(), eventIds: new Array(2) }), ContractValidationError);
  const values = ['event-1'];
  Object.defineProperty(values, '0', {
    enumerable: true,
    get() {
      accessed = true;
      return 'event-1';
    },
  });
  assert.throws(() => parseRide({ ...ride(), eventIds: values }), ContractValidationError);
  assert.equal(accessed, false);
  assert.throws(
    () =>
      parseVehicleCommand({
        ...command(),
        throttle: {
          valueOf() {
            throw new Error('coercion executed');
          },
        },
      }),
    ContractValidationError,
  );
});

test('vehicle normalized controls, tick identity, quaternion and enums', () => {
  for (const invalid of [
    { throttle: -0.1 },
    { brake: 1.1 },
    { steering: 2 },
    { tick: 0.1 },
    { tick: Number.MAX_SAFE_INTEGER + 1 },
    { source: 'UI' },
    { handbrake: 1 },
    { turnSignal: 'UP' },
    { vehicleId: ' ' },
  ])
    assert.throws(() => parseVehicleCommand({ ...command(), ...invalid }), ContractValidationError);
  assert.throws(
    () =>
      parseVehicleState({
        ...state(),
        transform: { ...state().transform, rotationQuaternion: { x: 0, y: 0, z: 0, w: 0 } },
      }),
    ContractValidationError,
  );
  assert.throws(
    () => parseVehicleState({ ...state(), controlMode: 'CHAOS' }),
    ContractValidationError,
  );
  assert.equal(parseVehicleState({ ...state(), laneId: null }).laneId, null);
});

test('ride terminal metadata and assignment chronology', () => {
  for (const invalid of [
    { completedTick: null },
    { failureReason: 'error' },
    { assignedTick: -1 },
    { assignedTick: 21 },
    { taxiId: null },
    { status: 'AVAILABLE' },
    { status: 'FAILED' },
    { eventIds: ['e', 'e'] },
  ])
    assert.throws(() => parseRide({ ...ride(), ...invalid }), ContractValidationError);
  assert.equal(
    parseRide({ ...ride(), status: 'FAILED', failureReason: 'RECOVERED_WITH_PASSENGER' }).status,
    'FAILED',
  );
  assert.equal(
    parseRide({
      ...ride(),
      status: 'AVAILABLE',
      taxiId: null,
      assignedTick: null,
      completedTick: null,
    }).status,
    'AVAILABLE',
  );
});

test('all event discriminants roundtrip with their specific validated payload', () => {
  const payloads = [
    ['MANUAL_START', { vehicleId: 'taxi-1', controlMode: 'MANUAL' }],
    ['MANUAL_END', { vehicleId: 'taxi-1', controlMode: 'LEARNING' }],
    ['LEADER_ACQUIRED', { vehicleId: 'taxi-1', leaderId: 'civilian-1', gapM: 3 }],
    ['SIGNAL_CHANGED', { signalId: 'signal-1', state: 'GREEN' }],
    ['STOP_APPROACH', { vehicleId: 'taxi-1', opportunityId: 'opp-1', stopLineId: 'line-1' }],
    ['STOP_LINE_CROSSED', { vehicleId: 'taxi-1', opportunityId: 'opp-1', stopLineId: 'line-1' }],
    ['FULL_STOP', { vehicleId: 'taxi-1', opportunityId: 'opp-1', durationS: 1 }],
    [
      'LANE_CHANGE_STARTED',
      { vehicleId: 'taxi-1', opportunityId: 'opp-1', fromLaneId: 'lane-1', toLaneId: 'lane-2' },
    ],
    [
      'LANE_CHANGE_COMPLETED',
      { vehicleId: 'taxi-1', opportunityId: 'opp-1', fromLaneId: 'lane-1', toLaneId: 'lane-2' },
    ],
    ['COLLISION', event().payload],
    ['PICKUP', { vehicleId: 'taxi-1', rideId: 'ride-1' }],
    ['DROPOFF', { vehicleId: 'taxi-1', rideId: 'ride-1' }],
    [
      'PROFILE_ACTIVATE',
      { profileId: 'style-1', versionId: 'style-v1', learningEpoch: 0, activationTick: 11 },
    ],
    ['VEHICLE_RECOVERED', { vehicleId: 'taxi-1', recoveryPointId: 'recovery-1' }],
    ['WORLD_RESET', { previousWorldEpoch: 1, reason: 'SCENARIO_RESET' }],
    ['DESTRUCTIBLE_BROKEN', { objectId: 'crate-1', instigatorId: null, impulseNs: 5 }],
  ] as const;
  for (const [type, payload] of payloads) {
    const input = {
      ...event(),
      entityIds: ['taxi-1', 'civilian-1', 'signal-1', 'crate-1'],
      type,
      payload,
    };
    assert.deepEqual(JSON.parse(JSON.stringify(parseSimulationEvent(input))), input);
    assert.throws(
      () => parseSimulationEvent({ ...input, payload: {} }),
      ContractValidationError,
      type,
    );
    for (const path of numericPaths(payload))
      for (const bad of [NaN, Infinity])
        assert.throws(
          () => parseSimulationEvent({ ...input, payload: replacePath(payload, path, bad) }),
          ContractValidationError,
        );
  }
});

test('event payload discrimination, entity references and reset/activation chronology', () => {
  assert.throws(
    () =>
      parseSimulationEvent({
        ...event(),
        type: 'LEADER_ACQUIRED',
        payload: { vehicleId: 'taxi-1', leaderId: 'taxi-1', gapM: 1 },
      }),
    ContractValidationError,
  );
  for (const invalid of [
    { type: 'FUTURE_EVENT' },
    { entityIds: ['taxi-1'] },
    { entityIds: ['taxi-1', 'taxi-1'] },
    { payload: { ...event().payload, impulseNs: -1 } },
    { payload: { ...event().payload, otherEntityId: 'taxi-1' } },
    { payload: { ...event().payload, extra: 1 } },
  ])
    assert.throws(() => parseSimulationEvent({ ...event(), ...invalid }), ContractValidationError);
  assert.throws(
    () =>
      parseSimulationEvent({
        ...event(),
        type: 'WORLD_RESET',
        payload: { previousWorldEpoch: 2, reason: 'SCENARIO_RESET' },
      }),
    ContractValidationError,
  );
  assert.throws(
    () =>
      parseSimulationEvent({
        ...event(),
        type: 'PROFILE_ACTIVATE',
        payload: { profileId: 'p', versionId: 'v', learningEpoch: 1, activationTick: 9 },
      }),
    ContractValidationError,
  );
});

test('segments reject mode eligibility, mismatched world/vehicle/source, unordered ticks and partial closure', () => {
  for (const closeReason of ['MODE_CHANGE', 'RIDE_COMPLETED'])
    assert.equal(parseInterventionSegment({ ...segment(), closeReason }).closeReason, closeReason);
  for (const controlMode of ['AUTO', 'MANUAL'])
    assert.throws(
      () => parseInterventionSegment({ ...segment(), controlMode }),
      ContractValidationError,
    );
  for (const invalid of [
    { worldEpoch: 3 },
    { sessionId: 'chaos-1' },
    { endTick: 9 },
    { closeReason: null },
    { completeness: 'OPEN' },
    { inputType: 'AUTONOMY' },
    { events: [event(), event()] },
    { samples: [sample(), sample()] },
    { baseVersionId: 'style-v2' },
    { vehicleId: 'taxi-2' },
  ])
    assert.throws(
      () => parseInterventionSegment({ ...segment(), ...invalid }),
      ContractValidationError,
    );
  assert.throws(
    () => parseTelemetrySample({ ...sample(), command: { ...command(), source: 'AUTONOMY' } }),
    ContractValidationError,
  );
  assert.throws(
    () => parseTelemetrySample({ ...sample(), command: { ...command(), tick: 11 } }),
    ContractValidationError,
  );
  assert.throws(
    () => parseTelemetrySample({ ...sample(), context: { ...sample().context, leaderGapM: null } }),
    ContractValidationError,
  );
  assert.equal(
    parseInterventionSegment({
      ...segment(),
      completeness: 'OPEN',
      endTick: null,
      closeReason: null,
    }).completeness,
    'OPEN',
  );
  assert.equal(
    parseInterventionSegment({ ...segment(), completeness: 'INCOMPLETE', closeReason: 'DATA_LOSS' })
      .completeness,
    'INCOMPLETE',
  );
  assert.equal(
    parseInterventionSegment({
      ...segment(),
      controlMode: 'MANUAL',
      learningEligible: false,
      samples: [],
      events: [],
    }).learningEligible,
    false,
  );
  assert.equal(
    parseInterventionSegment({
      ...segment(),
      controlMode: 'AUTO',
      learningEligible: false,
      inputType: 'AUTONOMY',
      samples: [],
      events: [],
    }).learningEligible,
    false,
  );
});

test('profiles preserve unknown observations and reserved data without fabricated evidence', () => {
  const parsed = parseDrivingProfile(profile());
  assert.equal(parsed.evidenceByParameter.reserved_future_key, null);
  for (const invalid of [
    { parentVersionId: 'style-v1' },
    { createdAt: '2026-02-30T00:00:00.000Z' },
    { createdAt: 'not-a-date' },
    { sourceSegmentIds: [] },
    { unitsByParameter: {} },
    {
      provenanceByParameter: {
        ...profile().provenanceByParameter,
        following_time_headway: 'MAGIC',
      },
    },
    { evidenceByParameter: { ...profile().evidenceByParameter, following_time_headway: null } },
  ])
    assert.throws(() => parseDrivingProfile({ ...profile(), ...invalid }), ContractValidationError);
  assert.throws(
    () => parseDrivingProfile({ ...profile(), parameters: { constructor: 1 } }),
    ContractValidationError,
  );
  const input = profile();
  const immutable = parseDrivingProfile(input);
  input.parameters.following_time_headway = 4;
  input.evidenceByParameter.following_time_headway.sourceSegmentIds.push('new-segment');
  assert.equal(immutable.parameters.following_time_headway, 1.5);
  assert.deepEqual(immutable.evidenceByParameter.following_time_headway?.sourceSegmentIds, [
    'segment-1',
  ]);
  assert.throws(
    () => Object.assign(immutable.parameters, { following_time_headway: 4 }),
    TypeError,
  );
});

test('current design catalog can be carried structurally without implementing its parameter registry', () => {
  const catalog: unknown = JSON.parse(readFileSync('Docs/driving-parameters.json', 'utf8'));
  const parameters = list(record(catalog).parameters, (value) => {
    const data = record(value);
    const unit = text(data.unit);
    const canonicalUnit =
      (
        {
          raport: 'ratio',
          probabilitate: 'probability',
          pondere: 'weight',
          's/semafor': 's',
          's/viraj': 's',
        } as Record<string, string>
      )[unit] ?? unit;
    return { key: text(data.key), value: number(data.default), unit: canonicalUnit };
  });
  const input = {
    ...profile(),
    parameters: Object.fromEntries(parameters.map(({ key, value }) => [key, value])),
    unitsByParameter: Object.fromEntries(parameters.map(({ key, unit }) => [key, unit])),
    provenanceByParameter: Object.fromEntries(parameters.map(({ key }) => [key, 'BASE'])),
    evidenceByParameter: Object.fromEntries(parameters.map(({ key }) => [key, null])),
    sourceSegmentIds: [],
  };
  assert.equal(Object.keys(parseDrivingProfile(input).parameters).length, 80);
  assert.deepEqual(fields(context, Object.keys(context)), record(context));
});
