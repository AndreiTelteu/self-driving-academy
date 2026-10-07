import type { BodyIdentity, PhysicsProbe } from '../../../src/vehicles';
export function check(value: unknown, message: string): asserts value {
  if (!value) throw Error(message);
}
export const mutations = [
  'setPose',
  'setBodyVelocity',
  'setVelocity',
  'addCar',
  'addClassCar',
  'addBox',
  'addNamedBox',
  'removeBody',
  'removeCollisionEntity',
  'subscribeBody',
  'publishBodies',
  'dispose',
] as const;
const readers = [
  'collisionIdentity',
  'collisionForColliderHandle',
  'collisionStepSerial',
  'collisionResources',
  'readVehicleMechanics',
  'readCollisionContacts',
  'bodyIdentity',
  'entityForBodyHandle',
  'readBody',
  'bodyResources',
  'project',
  'contacts',
  'counts',
];
export function browserWorld(raw: PhysicsProbe) {
  const names = [...mutations, ...readers, 'step'];
  check(
    JSON.stringify(Object.keys(raw).sort()) ===
      JSON.stringify([...names, 'collisionSource'].sort()),
    'Unknown native surface',
  );
  const guard = {
    phase: 'SETUP',
    nativeSteps: 0,
    selectionStepAttempts: 0,
    drivingCalls: Object.fromEntries(mutations.map((name) => [name, 0])),
    setupCalls: [] as string[],
    nativeInputs: null as [string, unknown][] | null,
  };
  const record: Record<string, unknown> = { ...raw },
    source = raw as unknown as Record<string, unknown>;
  for (const name of names)
    check(typeof source[name] === 'function', 'Missing native method ' + name);
  for (const name of mutations) {
    const method = source[name] as (...args: unknown[]) => unknown;
    record[name] = (...args: unknown[]) => {
      if (guard.phase === 'DRIVING' || guard.phase === 'SETTLEMENT') {
        guard.drivingCalls[name]++;
        throw Error('Native mutation during driving ' + name);
      }
      if (guard.phase === 'SETUP') {
        check(guard.setupCalls.length < 256, 'Setup cap');
        guard.setupCalls.push(name);
      }
      return method.apply(raw, args);
    };
  }
  record.step = (inputs: Parameters<PhysicsProbe['step']>[0], measure?: boolean) => {
    if (guard.phase === 'SETTLEMENT') {
      guard.selectionStepAttempts++;
      throw Error('Step during selection');
    }
    check(guard.phase === 'DRIVING', 'Step outside driving');
    guard.nativeSteps++;
    guard.nativeInputs = structuredClone([...inputs.entries()]);
    return raw.step(inputs, measure);
  };
  return { world: record as unknown as PhysicsProbe, guard };
}
export function snapshot(world: PhysicsProbe, ids: readonly BodyIdentity[]) {
  return ids.map((identity) => {
    check(world.bodyIdentity(identity.entityId) === identity, 'Native identity changed');
    return { identity, body: structuredClone(world.readBody(identity)) };
  });
}
export function unchanged(
  world: PhysicsProbe,
  ids: readonly BodyIdentity[],
  before: ReturnType<typeof snapshot>,
  serial: number,
) {
  check(world.collisionStepSerial() === serial, 'Settlement stepped native world');
  const after = snapshot(world, ids);
  check(
    after.every(
      (value, i) =>
        value.identity === before[i]!.identity &&
        JSON.stringify(value.body) === JSON.stringify(before[i]!.body),
    ),
    'Settlement changed native state',
  );
  return after;
}
export function distribution(values: readonly number[]) {
  check(
    values.length === 600 && values.every((v) => Number.isFinite(v) && v >= 0),
    'Invalid raw frame samples',
  );
  const v = [...values].sort((a, b) => a - b);
  return {
    p50: v[Math.floor((v.length - 1) * 0.5)]!,
    p95: v[Math.floor((v.length - 1) * 0.95)]!,
    p99: v[Math.floor((v.length - 1) * 0.99)]!,
  };
}
export function immutableMechanics(m: ReturnType<PhysicsProbe['readVehicleMechanics']>) {
  return {
    classId: m.classId,
    version: m.version,
    massKg: m.massKg,
    powerW: m.powerW,
    grip: m.grip,
    brakeAccelerationMps2: m.brakeAccelerationMps2,
    wheels: m.wheels,
    turningRadiusM: m.turningRadiusM,
  };
}
export async function digest(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}

export function browserScope() {
  const owners: { name: string; release: () => void }[] = [],
    readers = new Map<string, () => unknown>();
  let closed = false;
  return {
    own(name: string, release: () => void, read?: () => unknown) {
      check(
        !closed &&
          owners.length < 192 &&
          !owners.some((v) => v.name === name) &&
          !readers.has(name) &&
          (!read || readers.size < 192),
        'Browser owner capacity/state',
      );
      owners.push({ name, release });
      if (read) readers.set(name, read);
    },
    inspect(name: string, read: () => unknown) {
      check(!closed && readers.size < 192 && !readers.has(name), 'Browser readback capacity/state');
      readers.set(name, read);
    },
    close() {
      check(!closed, 'Browser scope already closed');
      closed = true;
      const attempts: string[] = [],
        errors: { resource: string; phase: string; message: string }[] = [],
        snapshots: Record<string, unknown> = {};
      for (const owner of [...owners].reverse()) {
        attempts.push(owner.name);
        try {
          owner.release();
        } catch (error) {
          errors.push({ resource: owner.name, phase: 'DISPOSE', message: String(error) });
        }
      }
      for (const [name, read] of readers) {
        try {
          snapshots[name] = read();
        } catch (error) {
          snapshots[name] = null;
          errors.push({ resource: name, phase: 'READBACK', message: String(error) });
        }
      }
      return { attempts, errors, snapshots, resourceCap: 192, readerCap: 192 };
    },
  };
}
