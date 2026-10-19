import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { BodyIdentity, PhysicsProbe } from '../../src/vehicles';
import type { createReferenceResourceScope } from './vehicle-selection-reference';
export const NATIVE_MUTATORS = Object.freeze([
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
] as const);
export const NATIVE_READERS = Object.freeze([
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
] as const);
export interface NativeProof {
  readonly tick: number;
  readonly nativeStepSerial: number;
  readonly bodies: number;
  readonly beforeHash: string;
  readonly afterHash: string;
  readonly selected: string;
}
/** Fixture-only guard;actual exposed methods must exactly match the audited PhysicsProbe surface. */
export function guardedWorld(raw: PhysicsProbe) {
  const methods = [...NATIVE_MUTATORS, ...NATIVE_READERS, 'step'];
  assert.deepEqual(
    Object.keys(raw).sort(),
    [...methods, 'collisionSource'].sort(),
    'Unclassified native probe surface',
  );
  const nativeInputsHash = createHash('sha256');
  const guard = {
    nativeInputDigest: null as string | null,
    phase: 'SETUP',
    setupLabel: 'INITIAL_FIXTURE',
    setupCalls: [] as {
      label: string;
      path: string;
      entityId: string | null;
      classId: string | null;
      nativeStepSerial: number;
    }[],
    drivingCalls: Object.fromEntries(NATIVE_MUTATORS.map((name) => [name, 0])),
    nativeSteps: 0,
    selectionStepAttempts: 0,
    selectionProofs: [] as NativeProof[],
    modeSettlementProofs: [] as NativeProof[],
    auditedMethods: [...methods].sort(),
  };
  const worldRecord: Record<string, unknown> = { ...raw };
  const rawRecord = raw as unknown as Record<string, unknown>;
  for (const name of methods)
    assert.equal(typeof rawRecord[name], 'function', 'Missing native method ' + name);
  for (const name of NATIVE_MUTATORS) {
    const method = rawRecord[name] as (...args: unknown[]) => unknown;
    worldRecord[name] = (...args: unknown[]) => {
      if (guard.phase === 'DRIVING' || guard.phase === 'SELECTION_SETTLEMENT') {
        guard.drivingCalls[name]++;
        throw Error('Host native mutation during driving: ' + name);
      }
      if (guard.phase === 'SETUP') {
        assert(guard.setupCalls.length < 256, 'Setup mutation log cap');
        const first = args[0];
        const id =
          typeof first === 'string'
            ? first
            : typeof first === 'object' &&
                first !== null &&
                'entityId' in first &&
                typeof first.entityId === 'string'
              ? first.entityId
              : null;
        guard.setupCalls.push({
          label: guard.setupLabel,
          path: name,
          entityId: id,
          classId: name === 'addClassCar' && typeof args[2] === 'string' ? args[2] : null,
          nativeStepSerial: raw.collisionStepSerial(),
        });
      }
      return method.apply(raw, args);
    };
  }
  worldRecord.step = (inputs: ReadonlyMap<string, unknown>, measure?: boolean) => {
    if (guard.phase === 'SELECTION_SETTLEMENT') {
      guard.selectionStepAttempts++;
      throw Error('Native step inside selection settlement');
    }
    assert.equal(guard.phase, 'DRIVING', 'Native step outside driving epoch');
    guard.nativeSteps++;
    nativeInputsHash.update(JSON.stringify([...inputs.entries()]));
    return raw.step(inputs as Parameters<PhysicsProbe['step']>[0], measure);
  };
  return {
    world: worldRecord as unknown as PhysicsProbe,
    guard,
    finishNativeDigest: () => {
      guard.nativeInputDigest = nativeInputsHash.copy().digest('hex');
    },
  };
}
export function bodySnapshot(world: PhysicsProbe, ids: readonly BodyIdentity[]) {
  return ids.map((identity) => {
    assert.equal(world.bodyIdentity(identity.entityId), identity, 'Native identity changed');
    return { identity, body: structuredClone(world.readBody(identity)) };
  });
}
export function sameNativeSnapshot(
  world: PhysicsProbe,
  ids: readonly BodyIdentity[],
  before: ReturnType<typeof bodySnapshot>,
  serial: number,
) {
  assert.equal(world.collisionStepSerial(), serial, 'Selection settlement advanced native physics');
  const after = bodySnapshot(world, ids);
  for (let i = 0; i < ids.length; i++) {
    assert.equal(after[i]!.identity, before[i]!.identity);
    assert.deepEqual(
      after[i]!.body,
      before[i]!.body,
      'Selection settlement changed native transform/velocity',
    );
  }
  return after;
}

/** Register acquisition immediately BEFORE surface audit;raw is private to audit/cleanup/readback. */
export function acquireGuardedReferenceWorld(
  raw: PhysicsProbe,
  resources: ReturnType<typeof createReferenceResourceScope>,
) {
  let active: ReturnType<typeof guardedWorld>['guard'] | null = null;
  resources.own('world', () => {
    if (active) active.phase = 'CLEANUP';
    raw.dispose();
  });
  resources.inspect('body', () => raw.bodyResources());
  resources.inspect('collision', () => raw.collisionResources());
  const wrapped = guardedWorld(raw);
  active = wrapped.guard;
  return wrapped;
}
