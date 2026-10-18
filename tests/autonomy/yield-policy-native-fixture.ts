import { createRapierProbe } from '../../src/vehicles/rapier/index';
import { createVehicleController } from '../../src/vehicles/controller';
import { createPriorityRules } from '../../src/world/priority-rules';
import { predictPriorityArrival } from '../../src/world/priority-arrival';
import { createIntersectionConflicts } from '../../src/world/intersection-conflicts';
import { priorityFixture } from '../world/priority-rules-fixture';
import { CONTROLLER_CONTEXT, controllerCommand } from '../vehicles/controller-reference';
import { referenceYield } from './yield-policy-reference';
import type { ReferenceYieldInput, ReferenceYieldDecision } from './yield-policy-reference';
import { parsePublishableDrivingProfile } from '../../src/profiles/parameter-registry';

export interface YieldNativeOptions {
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
export async function runYieldNative(options: YieldNativeOptions) {
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
    }),
    world = await createRapierProbe(),
    controller = createVehicleController(CONTROLLER_CONTEXT, world),
    count = options.count ?? 2,
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
  for (let tick = 0; tick < 180; tick++) world.step(inputs);
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
  let commandDigest = 2166136261;
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
  let last: ReferenceYieldDecision | null = null;
  try {
    for (let tick = 1; tick <= 780; tick++) {
      const start = options.measured ? performance.now() : 0;
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
            subject: world.project('subject'),
            other: world.project('priority'),
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
      for (const char of JSON.stringify(physical.controls.map((c) => c.command)))
        commandDigest = Math.imul(commandDigest ^ char.charCodeAt(0), 16777619) >>> 0;
      if (tick % 6 === 0) commands.push(physical.controls.slice(0, 2).map((c) => c.command));
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
      if (tick > 180 && options.measured)
        costs.push({
          tickMs: performance.now() - start,
          stepMs: physical.physics.stepMs,
          policyMs,
        });
    }
    const finalBodies = ids.map((id) => world.project(id)),
      owned = {
        controller: controller.getStats(),
        priority: observer.getStats(),
        bodies: world.bodyResources(),
        collision: world.collisionResources(),
      };
    controller.dispose();
    observer.dispose();
    world.dispose();
    return {
      options: { ...options, evaluator: undefined },
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
      finalBodies,
      costs,
      owned,
      cleanup: {
        controller: controller.getStats(),
        priority: observer.getStats(),
        bodies: world.bodyResources(),
        collision: world.collisionResources(),
      },
    };
  } catch (error) {
    controller.dispose();
    observer.dispose();
    world.dispose();
    throw error;
  }
}
