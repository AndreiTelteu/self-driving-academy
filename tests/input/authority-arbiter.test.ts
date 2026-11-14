import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  authorityActions,
  authorityIntent,
  createInputAuthorityArbiter,
  isCharacterCommandEmpty,
  isEmptyAuthorityCommand,
  isVehicleCommandEmpty,
  type AuthorityTickResult,
  type CharacterAuthorityCommand,
  type InputAuthority,
  type VehicleAuthorityCommand,
} from '../../src/input';

const CONTEXT = {
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: 'session-193',
  worldEpoch: 3,
};
const CHARACTER: InputAuthority = { consumer: 'CHARACTER', characterId: 'player-character' };
const VEHICLE: InputAuthority = { consumer: 'VEHICLE', vehicleId: 'taxi-7' };

const arbiter = (authority: InputAuthority = CHARACTER) =>
  createInputAuthorityArbiter({ context: CONTEXT, authority });

function character(result: AuthorityTickResult): CharacterAuthorityCommand {
  if (result.command.consumer !== 'CHARACTER') throw new Error('expected a CHARACTER command');
  return result.command;
}

function vehicle(result: AuthorityTickResult): VehicleAuthorityCommand {
  if (result.command.consumer !== 'VEHICLE') throw new Error('expected a VEHICLE command');
  return result.command;
}

function code(error: unknown): string | null {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : null;
}

test('exactly one consumer is addressed per tick; a second delivery is refused', () => {
  const input = arbiter(CHARACTER);
  input.setAction('throttle', true);
  const result = input.step({ tick: 1, characterYawRad: 0 });
  const received: string[] = [];
  const ports = {
    character: () => received.push('CHARACTER'),
    vehicle: () => received.push('VEHICLE'),
  };
  input.deliver(result, 'CHARACTER', ports);
  assert.deepEqual(received, ['CHARACTER']);
  assert.equal(character(result).input.gait, 'WALK');

  // A doua livrare, către orice consumator, este refuzată explicit.
  for (const consumer of ['CHARACTER', 'VEHICLE'] as const)
    assert.throws(
      () => input.deliver(result, consumer, ports),
      (error) => code(error) === 'DOUBLE_DELIVERY_REFUSED',
    );
  assert.deepEqual(received, ['CHARACTER']);

  // Entitatea inactivă nu poate primi o comandă nici la un tick nou.
  const next = input.step({ tick: 2, characterYawRad: 0 });
  assert.throws(
    () => input.deliver(next, 'VEHICLE', ports),
    (error) => code(error) === 'INACTIVE_CONSUMER_REFUSED',
  );
  assert.deepEqual(received, ['CHARACTER']);

  const stats = input.getStats();
  assert.equal(stats.delivered.CHARACTER, 1);
  assert.equal(stats.delivered.VEHICLE, 0);
  assert.equal(stats.refused.doubleDelivery, 2);
  assert.equal(stats.refused.inactiveConsumer, 1);
  input.dispose();
});

test('a stale result is refused after the tick advanced', () => {
  const input = arbiter(VEHICLE);
  const ports = { character: () => {}, vehicle: () => {} };
  const first = input.step({ tick: 1, characterYawRad: 0 });
  input.step({ tick: 2, characterYawRad: 0 });
  assert.throws(
    () => input.deliver(first, 'VEHICLE', ports),
    (error) => code(error) === 'STALE_RESULT',
  );
  assert.equal(input.getStats().refused.staleResult, 1);
  input.dispose();
});

test('held throttle produces nothing at the first tick after the transition (criterion 2)', () => {
  const input = arbiter(CHARACTER);
  input.setAction('throttle', true);
  const before = input.step({ tick: 1, characterYawRad: 0.25 });
  assert.equal(character(before).input.gait, 'WALK');

  assert.equal(input.setAuthority(VEHICLE), true);
  const after = input.step({ tick: 2, characterYawRad: 0.25 });
  assert.equal(vehicle(after).command.throttle, 0);
  assert.equal(vehicle(after).command.brake, 0);
  assert.equal(vehicle(after).command.steering, 0);
  assert.equal(isVehicleCommandEmpty(vehicle(after)), true);

  // Tasta este încă ținută: neutralizarea persistă pe oricâte tick-uri.
  const later = input.step({ tick: 3, characterYawRad: 0.25 });
  assert.equal(isEmptyAuthorityCommand(later.command), true);
  // Auto-repeat-ul (o nouă apăsare fără eliberare) nu ridică neutralizarea.
  input.setAction('throttle', true);
  const repeated = input.step({ tick: 4, characterYawRad: 0.25 });
  assert.equal(isEmptyAuthorityCommand(repeated.command), true);

  // Eliberarea urmată de o reapăsare rearmă intenția.
  input.setAction('throttle', false);
  input.setAction('throttle', true);
  const rearmed = input.step({ tick: 5, characterYawRad: 0.25 });
  assert.equal(vehicle(rearmed).command.throttle, 1);
  assert.equal(isEmptyAuthorityCommand(rearmed.command), false);
  assert.equal(input.getStats().transitions, 1);
  input.dispose();
});

test('vehicle → character transition also neutralizes held keys until release', () => {
  const input = arbiter(VEHICLE);
  input.setAction('throttle', true);
  input.setAction('steerRight', true);
  const before = input.step({ tick: 1, characterYawRad: 0 });
  assert.equal(vehicle(before).command.throttle, 1);
  assert.equal(vehicle(before).command.steering, 1);

  assert.equal(input.setAuthority(CHARACTER), true);
  const after = input.step({ tick: 2, characterYawRad: 0 });
  assert.equal(character(after).input.gait, 'NONE');
  assert.equal(character(after).input.intensity, 0);
  assert.equal(isCharacterCommandEmpty(character(after)), true);
  assert.deepEqual(after.neutralized, ['throttle', 'steerRight']);

  input.setAction('throttle', false);
  input.setAction('steerRight', false);
  input.setAction('throttle', true);
  input.setAction('steerRight', true);
  const rearmed = input.step({ tick: 3, characterYawRad: 0 });
  assert.equal(character(rearmed).input.gait, 'WALK');
  assert.equal(character(rearmed).input.headingRad, Math.PI / 2);
  input.dispose();
});

test('a key pressed after the transition is immediately active; no grace window', () => {
  const input = arbiter(CHARACTER);
  assert.equal(input.setAuthority(VEHICLE), true);
  input.setAction('throttle', true);
  const result = input.step({ tick: 1, characterYawRad: 0 });
  assert.equal(vehicle(result).command.throttle, 1);
  input.dispose();
});

test('the same authority is a no-op and does not create a transition', () => {
  const input = arbiter(CHARACTER);
  input.setAction('throttle', true);
  input.step({ tick: 1, characterYawRad: 0 });
  assert.equal(
    input.setAuthority({ consumer: 'CHARACTER', characterId: 'player-character' }),
    false,
  );
  const next = input.step({ tick: 2, characterYawRad: 0 });
  assert.equal(character(next).input.gait, 'WALK');
  assert.equal(input.getStats().transitions, 0);
  assert.deepEqual(next.neutralized, []);
  input.dispose();
});

test('switching to another vehicle id is a real transition', () => {
  const input = arbiter({ consumer: 'VEHICLE', vehicleId: 'taxi-7' });
  assert.equal(input.setAuthority({ consumer: 'VEHICLE', vehicleId: 'taxi-8' }), true);
  assert.equal(input.getStats().authority.consumer, 'VEHICLE');
  input.dispose();
});

test('axes compose as a closed vocabulary and opposite keys cancel', () => {
  assert.deepEqual(authorityIntent(['throttle']), {
    forward: 1,
    turn: 0,
    sprint: false,
    handbrake: false,
    signalLeft: false,
    signalRight: false,
  });
  assert.equal(authorityIntent(['throttle', 'brake']).forward, 0);
  assert.equal(authorityIntent(['steerLeft', 'steerRight']).turn, 0);
  assert.equal(authorityIntent(['steerLeft']).turn, -1);
  assert.equal(authorityIntent(['throttle', 'sprint'], ['throttle']).forward, 0);
  assert.equal(authorityIntent(['throttle', 'sprint'], ['throttle']).sprint, true);
  assert.equal(Object.isFrozen(authorityIntent([])), true);
  assert.equal(authorityActions.length, 8);
});

test('walking projection: walk/run/intensity, heading follows yaw plus turn', () => {
  const input = arbiter(CHARACTER);
  input.setAction('throttle', true);
  input.setAction('sprint', true);
  input.setAction('steerLeft', true);
  const result = character(input.step({ tick: 1, characterYawRad: 1.2 }));
  assert.equal(result.input.gait, 'RUN');
  assert.equal(result.input.intensity, 1);
  assert.ok(Math.abs(result.input.headingRad - (1.2 - Math.PI / 2)) <= 1e-12);
  assert.equal(Object.isFrozen(result.input), true);
  input.dispose();
});

test('vehicle projection: signals, brake, handbrake and PLAYER source', () => {
  const input = arbiter(VEHICLE);
  input.setAction('brake', true);
  input.setAction('signalLeft', true);
  const result = vehicle(input.step({ tick: 1, characterYawRad: 0 }));
  assert.equal(result.command.tick, 1);
  assert.equal(result.command.vehicleId, 'taxi-7');
  assert.equal(result.command.brake, 1);
  assert.equal(result.command.throttle, 0);
  assert.equal(result.command.turnSignal, 'LEFT');
  assert.equal(result.command.source, 'PLAYER');
  assert.equal(result.command.sessionId, 'session-193');
  assert.equal(result.command.worldEpoch, 3);
  assert.equal(Object.isFrozen(result.command), true);
  input.dispose();
});

test('the state is plain JSON, survives a round trip and neutralizes held keys on restore', () => {
  const input = arbiter(VEHICLE);
  input.setAction('throttle', true);
  input.setAction('steerLeft', true);
  input.step({ tick: 1, characterYawRad: 0 });
  const snapshot = input.snapshot();
  const json = JSON.stringify(snapshot);
  assert.deepEqual(JSON.parse(json), snapshot);
  assert.deepEqual(snapshot.held, ['throttle', 'steerLeft']);
  assert.equal(snapshot.tick, 1);
  assert.equal(snapshot.authority.consumer, 'VEHICLE');

  const restored = arbiter(CHARACTER);
  restored.restore(JSON.parse(json));
  const replayed = restored.snapshot();
  assert.equal(replayed.tick, 1);
  assert.equal(replayed.authority.consumer, 'VEHICLE');
  assert.deepEqual(replayed.held, ['throttle', 'steerLeft']);
  // După reload nu există adevăr fizic: tot ce era ținut rămâne neutralizat.
  assert.deepEqual(replayed.neutralized, ['throttle', 'steerLeft']);
  const next = restored.step({ tick: 2, characterYawRad: 0 });
  assert.equal(isEmptyAuthorityCommand(next.command), true);
  input.dispose();
  restored.dispose();
});

test('invalid state, tick, action, authority and consumer are refused with closed codes', () => {
  const input = arbiter(CHARACTER);
  const ports = { character: () => {}, vehicle: () => {} };
  assert.throws(
    () => input.restore({ ...input.snapshot(), version: '193-input-authority-v0' }),
    (error) => code(error) === 'INVALID_STATE',
  );
  assert.throws(
    () => input.restore({ ...input.snapshot(), neutralized: ['throttle'] }),
    (error) => code(error) === 'INVALID_STATE',
  );
  assert.throws(
    () => input.restore({ ...input.snapshot(), tick: -1 }),
    (error) => code(error) === 'INVALID_STATE',
  );
  assert.throws(
    () => input.restore({ ...input.snapshot(), authority: { consumer: 'VEHICLE' } }),
    (error) => code(error) === 'INVALID_AUTHORITY',
  );
  assert.throws(
    () => input.restore({ ...input.snapshot(), extra: true }),
    (error) => code(error) === 'INVALID_STATE',
  );
  assert.throws(
    () => input.setAction('warp' as never, true),
    (error) => code(error) === 'INVALID_ACTION',
  );
  assert.throws(
    () => input.setAuthority({ consumer: 'CAMERA' } as never),
    (error) => code(error) === 'INVALID_AUTHORITY',
  );
  assert.throws(
    () => input.step({ tick: 5, characterYawRad: 0 }),
    (error) => code(error) === 'INVALID_TICK',
  );
  assert.throws(
    () => input.step({ tick: 1, characterYawRad: Number.NaN }),
    (error) => code(error) === 'INVALID_REQUEST',
  );
  const result = input.step({ tick: 1, characterYawRad: 0 });
  assert.throws(
    () => input.deliver(result, 'CAMERA' as never, ports),
    (error) => code(error) === 'INVALID_REQUEST',
  );
  input.dispose();
});

test('releaseAll clears held keys and their neutralization', () => {
  const input = arbiter(CHARACTER);
  input.setAction('throttle', true);
  input.step({ tick: 1, characterYawRad: 0 });
  input.setAuthority(VEHICLE);
  assert.deepEqual(input.snapshot().neutralized, ['throttle']);
  input.releaseAll();
  const after = input.snapshot();
  assert.deepEqual(after.held, []);
  assert.deepEqual(after.neutralized, []);
  input.setAction('throttle', true);
  const active = input.step({ tick: 2, characterYawRad: 0 });
  assert.equal(vehicle(active).command.throttle, 1);
  input.dispose();
});

test('dispose closes the port and every later mutation', () => {
  const input = arbiter(CHARACTER);
  input.dispose();
  assert.throws(
    () => input.port.setAction('throttle', true),
    (error) => code(error) === 'DISPOSED',
  );
  assert.throws(
    () => input.step({ tick: 1, characterYawRad: 0 }),
    (error) => code(error) === 'DISPOSED',
  );
  input.dispose();
  assert.equal(input.getStats().disposed, true);
});
