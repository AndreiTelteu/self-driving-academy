// Distinct V7 source entry; physical stepping and original phase clock reads are unchanged from V6.
import { browserLifetime } from '../yield-policy-v2/lifetime';
import { createRapierProbe } from '../../../src/vehicles/rapier/index';
import { createVehicleController } from '../../../src/vehicles/controller';
import { createPriorityRules } from '../../../src/world/priority-rules';
import { predictPriorityArrival } from '../../../src/world/priority-arrival';
import { createIntersectionConflicts } from '../../../src/world/intersection-conflicts';
import { priorityFixture } from '../../world/priority-rules-fixture';
import { CONTROLLER_CONTEXT, controllerCommand } from '../../vehicles/controller-reference';
import { referenceYield } from '../../autonomy/yield-policy-reference';
import type {
  ReferenceYieldInput,
  ReferenceYieldDecision,
} from '../../autonomy/yield-policy-reference';
import { parsePublishableDrivingProfile } from '../../../src/profiles/parameter-registry';

import type { PhysicsProbe } from '../../../src/vehicles/physics';
import type { ClockPoint, NativeCounter } from '../yield-policy-v5/clock-proof';
export interface NativePartialDiagnostic {
  attemptedTick: number;
  lastCompleted: NativeCounter | null;
  beforeDisposal: NativeCounter | null;
  phaseEntry: ClockPoint | null;
  phaseCompletion: ClockPoint | null;
  cleanup?: unknown;
}
export interface YieldNativeOptions {
  readonly measuredFromTick?: number;
  readonly phaseBoundary?: (kind: 'ENTRY' | 'COMPLETION', point: ClockPoint) => void;
  readonly ticks?: number;
  readonly beforeTick?: (
    world: PhysicsProbe,
    tick: number,
    readCounter: () => { nativeSerial: number; controllerTick: number | null },
  ) => Promise<void> | void;
  readonly onTick?: (
    world: PhysicsProbe,
    tick: number,
    costs: { tickMs: number; stepMs: number; policyMs: number },
    actualCounter: () => NativeCounter,
  ) => Promise<void>;
  readonly thresholdS: number;
  readonly otherDistanceM: number;
  readonly otherSpeedMps: number;
  readonly otherThrottle: number;
  readonly classId: 'sedan' | 'compact';
  readonly mode?: 'AUTO' | 'MANUAL';
  readonly count?: number;
  readonly measured?: boolean;
  readonly evaluator?: (input: ReferenceYieldInput) => ReferenceYieldDecision;
}

/** Authored straight035crossing: west +X at z=-2, south +Z at x=-2. */
async function captureNative(
  options: YieldNativeOptions,
  lifetime: ReturnType<typeof browserLifetime>,
  diagnostic: NativePartialDiagnostic,
) {
  if (
    !Number.isSafeInteger(options.count ?? 2) ||
    (options.count ?? 2) < 2 ||
    (options.count ?? 2) > 110
  )
    throw new Error('052native actor capacity');
  const profile = parsePublishableDrivingProfile({
    schemaVersion: 1,
    units: 'SI',
    profileId: '052-common-base-style',
    versionId: `052-base-gap-${options.thresholdS}`,
    parentVersionId: null,
    engineVersion: '052-native-crossing-owner-prediction-v1',
    parameters: { yield_time_gap: options.thresholdS },
    unitsByParameter: { yield_time_gap: 's' },
    provenanceByParameter: { yield_time_gap: 'BASE' },
    evidenceByParameter: { yield_time_gap: null },
    sourceSegmentIds: [],
    createdAt: '2026-10-05T00:00:00.000Z',
    checksum: 'FIXTURE_ONLY_NOT_INTEGRITY',
  });
  const fixture = priorityFixture(),
    conflicts = createIntersectionConflicts(fixture.map),
    relation = conflicts.getRelation('junction', 'west-straight', 'south-straight')!;
  const rule = fixture.policy.rules.find(
    (r) => r.movementIds.includes('west-straight') && r.movementIds.includes('south-straight'),
  )!;
  rule.priorityMovementId = 'south-straight';
  const scope = { sessionId: CONTROLLER_CONTEXT.sessionId, worldEpoch: 0 },
    observer = createPriorityRules(fixture.map, fixture.policy, scope, {
      maxVehicles: 110,
      maxIncarnations: 1024,
      maxTraffic: 110,
    });
  lifetime.own('priority', () => observer.dispose());
  lifetime.inspect(
    'priority',
    () => observer.getStats(),
    (value) => {
      if ((value as ReturnType<typeof observer.getStats>).vehicles !== 0)
        throw new Error('052 priority cleanup nonzero');
    },
  );
  const world = await createRapierProbe();
  lifetime.own('world', () => world.dispose());
  lifetime.inspect(
    'bodies',
    () => world.bodyResources(),
    (value) => {
      if ((value as ReturnType<typeof world.bodyResources>).entities !== 0)
        throw new Error('052 bodies cleanup nonzero');
    },
  );
  lifetime.inspect(
    'collision',
    () => world.collisionResources(),
    (value) => {
      if ((value as ReturnType<typeof world.collisionResources>).colliders !== 0)
        throw new Error('052 collision cleanup nonzero');
    },
  );
  let lastApplied: ReadonlyMap<string, unknown> = new Map();
  const controller = createVehicleController(CONTROLLER_CONTEXT, {
    ...world,
    step(inputs, measure) {
      lastApplied = inputs;
      return world.step(inputs, measure);
    },
  });
  lifetime.own('controller', () => controller.dispose());
  lifetime.own('actual-counter-before-disposal', () => {
    diagnostic.beforeDisposal = {
      nativeSerial: world.collisionStepSerial(),
      controllerTick: controller.getStats().tick,
    };
  });
  lifetime.inspect(
    'controller',
    () => controller.getStats(),
    (value) => {
      if ((value as ReturnType<typeof controller.getStats>).vehicles !== 0)
        throw new Error('052 controller cleanup nonzero');
    },
  );
  const count = options.count ?? 2,
    evaluate = options.evaluator ?? referenceYield;
  const ids = [
    'subject',
    'priority',
    ...Array.from({ length: count - 2 }, (_, i) => `parked-${i}`),
  ];
  for (const [index, id] of ids.entries()) {
    const position =
      index === 0
        ? { x: -15, y: 0.8, z: -2 }
        : index === 1
          ? { x: -2, y: 0.8, z: -4.85 - options.otherDistanceM }
          : { x: 50 + (index % 10) * 6, y: 0.8, z: 50 + Math.floor(index / 10) * 7 };
    world.addClassCar(id, position, options.classId);
    const yaw = index === 0 ? Math.PI / 2 : 0;
    world.setPose(world.bodyIdentity(id)!, {
      positionM: position,
      rotationQuaternion: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
    });
    controller.register(world.bodyIdentity(id)!);
  }
  if (world.counts().vehicles !== ids.length || ids.some((id) => !world.bodyIdentity(id)))
    throw new Error('052complete registry coverage mismatch');
  // Physical envelope:2m longitudinal half length plus opposing0.85m half width.
  // Entry centres -4.85; exit0.85 => clearance5.7m. Meshes never set poses after launch.
  const inputs = new Map(ids.map((id) => [id, { throttle: 0, brake: 1, steering: 0 }]));
  for (let tick = 0; tick < 180; tick++) {
    await options.beforeTick?.(world, 0, () => ({
      nativeSerial: world.collisionStepSerial(),
      controllerTick: controller.getStats().tick,
    }));
    world.step(inputs);
  }
  world.setVelocity('subject', { x: 5, y: 0, z: 0 });
  world.setVelocity('priority', { x: 0, y: 0, z: options.otherSpeedMps });
  const mode = options.mode ?? 'AUTO';
  let committed = false,
    acceptedTick: number | null = null,
    firstEntryTick: number | null = null,
    clearTick: number | null = null,
    collisionTick: number | null = null,
    maxImpulseNs = 0;
  const commands: unknown[] = [],
    evidence: unknown[] = [],
    trace: unknown[] = [],
    costs: { tickMs: number; stepMs: number; policyMs: number }[] = [];
  let commandDigest = 2166136261,
    packetDigest = 2166136261,
    nativeDigest = 2166136261,
    physicalDigest = 2166136261;
  const nativeReadbacks: unknown[] = [];
  const checkpoints: { tick: number; physicalDigest: number }[] = [];
  const digest = (seed: number, data: unknown) => {
    for (const char of JSON.stringify(data))
      seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
    return seed;
  };
  const immutableMechanics = (id: string) => {
    const { appliedEngineForceN, appliedSteeringRadians, wheelBrakeImpulseLimitNs, ...mechanics } =
      world.readVehicleMechanics(id);
    return mechanics;
  };
  const initialMechanics = ids.map(immutableMechanics);
  // The shared Rapier probe now also returns per-wheel and angular state. The yield fixture never
  // reads it, and recording it per trace row and per body multiplied the arm metadata so far that
  // the bounded report exceeded its transport limit. Record only the stable crossing fields.
  const recordedBody = (id: string) => {
    const body = world.project(id);
    return {
      id: body.id,
      position: body.position,
      rotation: body.rotation,
      velocity: body.velocity,
      speed: body.speed,
      suspension: body.suspension,
      wheelContacts: body.wheelContacts,
    };
  };
  const actor = (id: string, movementId: string) => {
    const body = world.project(id),
      distanceM = -4.85 - (id === 'subject' ? body.position.x : body.position.z);
    return {
      vehicleId: id,
      incarnation: String(world.bodyIdentity(id)!.generation),
      intersectionId: 'junction',
      movementId,
      speedMps: Math.hypot(body.velocity.x, body.velocity.z),
      active: true,
      observable: true,
      conflictDistances: [{ relationId: relation.id, distanceM, clearanceM: 5.7 }],
    };
  };
  const observe = (tick: number) => {
    const subject = actor('subject', 'west-straight'),
      other = actor('priority', 'south-straight');
    const result = observer.observe({
      schemaVersion: 1,
      units: 'SI',
      ...scope,
      tick,
      subject,
      traffic: [other],
      trafficComplete: true,
      discontinuity: false,
    });
    evidence.push(...result.recordedEvidence);
  };
  // Parked actors physically outside all crossing routes are explicitly inactive for this owner.
  observe(0);
  const actualCounter = (): NativeCounter => {
    const stats = controller.getStats();
    if (stats.fault || stats.disposed) throw new Error('052 actual controller unavailable');
    const value = { nativeSerial: world.collisionStepSerial(), controllerTick: stats.tick };
    if (value.nativeSerial !== value.controllerTick + 180)
      throw new Error('052 actual native/controller serial mismatch');
    return value;
  };
  let last: ReferenceYieldDecision | null = null;
  for (let tick = 1; tick <= (options.ticks ?? 780); tick++) {
    diagnostic.attemptedTick = tick;
    if (tick === options.measuredFromTick) {
      const point = { ...actualCounter(), timeMs: performance.now() };
      diagnostic.phaseEntry = point;
      options.phaseBoundary?.('ENTRY', point);
    }
    const start = options.measured ? performance.now() : 0;
    await options.beforeTick?.(world, tick, actualCounter);
    let policyMs = 0;
    if (tick === 1 || tick % 6 === 0) {
      const subject = actor('subject', 'west-straight'),
        other = actor('priority', 'south-straight'),
        remaining = subject.conflictDistances[0].distanceM,
        speed = subject.speedMps > 0.5 ? subject.speedMps : 5;
      // Owner's explicit constant-speed candidate/5m/s launch forecast. Actual error is preserved.
      const request: ReferenceYieldInput = {
        thresholdS: profile.parameters.yield_time_gap,
        coverage: 'COMPLETE_HORIZON',
        horizonS: 60,
        discontinuity: false,
        candidate: {
          entryS: Math.max(0, remaining) / speed,
          exitS: Math.max(0, remaining + 5.7) / speed,
        },
        pairs: [
          {
            priority: 'YIELD',
            arrival: predictPriorityArrival(
              other.conflictDistances[0].distanceM,
              5.7,
              other.speedMps,
            ),
          },
        ],
      };
      const before = options.measured ? performance.now() : 0;
      last = evaluate(request);
      policyMs = options.measured ? performance.now() - before : 0;
      if (!committed && last.action === 'ACCEPT') {
        committed = true;
        acceptedTick = tick;
      }
      if (trace.length < 130)
        trace.push({
          tick,
          request,
          decision: last,
          subject: recordedBody('subject'),
          other: recordedBody('priority'),
        });
    }
    // Accepted manoeuvre is committed by this fixture owner until clearance, not secretly vetoed.
    const packets = ids.map((id) => ({
      identity: world.bodyIdentity(id),
      command: controllerCommand(
        id,
        tick,
        id === 'subject' && mode === 'MANUAL' ? 'PLAYER' : 'AUTONOMY',
        id === 'subject'
          ? { throttle: committed ? 0.25 : 0, brake: committed ? 0 : 1 }
          : id === 'priority'
            ? { throttle: options.otherThrottle, brake: 0 }
            : { brake: 1 },
      ),
    }));
    const physical = controller.step(
      { tick, dtSeconds: 1 / 60 },
      packets,
      tick === 1 && mode === 'MANUAL' ? [{ identity: world.bodyIdentity('subject'), mode }] : [],
      options.measured ?? false,
    );
    diagnostic.lastCompleted = {
      nativeSerial: world.collisionStepSerial(),
      controllerTick: controller.getStats().tick,
    };
    packetDigest = digest(packetDigest, packets);
    nativeDigest = digest(nativeDigest, [...lastApplied.entries()]);
    const allBodyStates = ids.map((id) => world.readBody(world.bodyIdentity(id)!));
    physicalDigest = digest(physicalDigest, allBodyStates);
    if (tick % 120 === 0) {
      if (checkpoints.length >= 75) throw new Error('052 checkpoint capacity');
      checkpoints.push({ tick, physicalDigest });
    }
    if (tick % 6 === 0 && nativeReadbacks.length < 130)
      nativeReadbacks.push({
        tick,
        packets: packets.slice(0, 2),
        controls: physical.controls.slice(0, 2),
        nativeInputs: [...lastApplied.entries()].slice(0, 2),
      });
    for (const char of JSON.stringify(physical.controls.map((c) => c.command)))
      commandDigest = Math.imul(commandDigest ^ char.charCodeAt(0), 16777619) >>> 0;
    if (tick % 6 === 0 && commands.length < 130)
      commands.push(physical.controls.slice(0, 2).map((c) => c.command));
    for (const id of ids) {
      const body = world.readBody(world.bodyIdentity(id)!);
      if (
        ![
          ...Object.values(body.transform.positionM),
          ...Object.values(body.transform.rotationQuaternion),
          ...Object.values(body.velocityMps),
        ].every(Number.isFinite)
      )
        throw new Error('052 nonfinite native body');
    }
    observe(tick);
    const subject = world.project('subject');
    if (firstEntryTick === null && subject.position.x >= -4.85) firstEntryTick = tick;
    if (clearTick === null && subject.position.x >= 0.85) clearTick = tick;
    const contacts = world
      .readCollisionContacts()
      .contacts.filter(
        (c) =>
          [c.first.entityId, c.second.entityId].includes('subject') &&
          [c.first.entityId, c.second.entityId].includes('priority'),
      );
    for (const contact of contacts) {
      if (collisionTick === null) collisionTick = tick;
      maxImpulseNs = Math.max(maxImpulseNs, contact.impulseNs);
    }
    if (tick > 180 && options.measured && costs.length < 600)
      costs.push({
        tickMs: performance.now() - start,
        stepMs: physical.physics.stepMs,
        policyMs,
      });
    if (evidence.length > 2048) throw new Error('052browser evidence capacity');
    if (tick === (options.ticks ?? 780)) {
      const point = { ...actualCounter(), timeMs: performance.now() };
      diagnostic.phaseCompletion = point;
      options.phaseBoundary?.('COMPLETION', point);
    }
    await options.onTick?.(
      world,
      tick,
      {
        tickMs: options.measured ? performance.now() - start : 0,
        stepMs: physical.physics.stepMs,
        policyMs,
      },
      actualCounter,
    );
  }
  const finalBodies = ids.map((id) => recordedBody(id)),
    owned = {
      controller: controller.getStats(),
      priority: observer.getStats(),
      bodies: world.bodyResources(),
      collision: world.collisionResources(),
    };
  const finalMechanics = ids.map(immutableMechanics);
  lifetime.dispose();
  const cleanup = {
    controller: lifetime.readback<ReturnType<typeof controller.getStats>>('controller'),
    priority: lifetime.readback<ReturnType<typeof observer.getStats>>('priority'),
    bodies: lifetime.readback<ReturnType<typeof world.bodyResources>>('bodies'),
    collision: lifetime.readback<ReturnType<typeof world.collisionResources>>('collision'),
  };
  lifetime.throwIfFailed();
  return {
    options: {
      ...options,
      evaluator: undefined,
      onTick: undefined,
      beforeTick: undefined,
      phaseBoundary: undefined,
    },
    profileVersionId: profile.versionId,
    acceptedTick,
    firstEntryTick,
    clearTick,
    collisionTick,
    maxImpulseNs,
    trace,
    evidence,
    commands,
    commandDigest,
    packetDigest,
    nativeDigest,
    physicalDigest,
    checkpoints,
    nativeReadbacks,
    initialMechanics,
    finalMechanics,
    finalBodies,
    costs,
    owned,
    cleanup,
  };
}

export async function runBrowserYieldNative(options: YieldNativeOptions) {
  const lifetime = browserLifetime();
  const diagnostic: NativePartialDiagnostic = {
    attemptedTick: 0,
    lastCompleted: null,
    beforeDisposal: null,
    phaseEntry: null,
    phaseCompletion: null,
  };
  try {
    return await captureNative(options, lifetime, diagnostic);
  } catch (error) {
    lifetime.record('primary', error);
  } finally {
    lifetime.dispose();
  }
  diagnostic.cleanup = lifetime.snapshot();
  try {
    lifetime.throwIfFailed();
  } catch (error) {
    throw Object.assign(error as Error, { nativeDiagnostics: diagnostic });
  }
  throw Object.assign(new Error('052 native capture unavailable'), {
    nativeDiagnostics: diagnostic,
  });
}
