/**
 * PBI 282 — live Rapier vehicle owner.
 *
 * One Rapier world, one 024 controller and one 029 damage owner serve the driven composition car
 * and any taken-over traffic car. PLAYER and AUTONOMY packets travel through the same controller
 * and the same fixed 60 Hz step; the live composition only supplies the command and reads the
 * resulting SI state. No second simulation, ledger or vehicle model is created.
 *
 * The adapter never publishes native Rapier objects. It reuses the 022 body/collision ports, the
 * 028 collision episodes, the 029 availability projection and the 030 recovery port. Traffic is a
 * set of kinematic static proxies (the 058 owner keeps its route), while the two composition cars
 * are real dynamic raycast vehicles. Buildings are 028-named static obstacles so a wall impact is
 * a real solver contact with a real damage incident.
 */
import { createCollisionEpisodes } from '../collision-episodes';
import { createVehicleController } from '../controller';
import { createVehicleDamage } from '../damage-state';
import type { DamageHistoryRecord, DamageProjection } from '../damage-port';
import { createRecoveryLedger, recoverySnapshot } from '../recovery-ledger';
import type { RecoveryRecord } from '../recovery-ledger';
import { vehicleClass } from '../vehicle-classes';
import type { VehicleClassId } from '../vehicle-classes';
import type { BodyIdentity, BodyTransform } from '../body-port';
import type { ControlMode, VehicleCommand } from '../contracts';
import type { DriveIntent } from '../drivetrain';
import type { PhysicsProbe } from '../physics';
import type { VehicleController } from '../controller-port';
import type { VehicleControllerFrame } from '../controller-port';
import type { RecoveryRoadProof } from '../recovery-port';
import type { VehicleAvailability } from '../damage-port';
import { createStableId, readContext, requireContract } from '../../sessions';
import type { ContractContext } from '../../sessions';
import type { RoadSurfaceId } from '../road-surfaces';
import { createRapierProbe } from './index';

export const LIVE_VEHICLE_PHYSICS_VERSION = '282-live-rapier-v1' as const;

export const LIVE_VEHICLE_PHYSICS_POLICY = Object.freeze({
  contract: LIVE_VEHICLE_PHYSICS_VERSION,
  /** Composition ground frame is the chassis centre minus the visual ride height (wheels on y=0). */
  chassisRestHeightM: 0.8,
  /** Conservative live chassis collider used by 022; the same for both 023 classes. */
  chassisHalfExtentsM: Object.freeze({ x: 0.85, y: 0.3, z: 2 }),
  /** Kinematic 058 proxy: same chassis box, centred on the road-level body. */
  trafficProxyHalfExtentsM: Object.freeze({ x: 0.85, y: 0.55, z: 2 }),
  trafficProxyCentreYM: 0.55,
  /** All 058 actors get a stable kinematic proxy; 90 buildings + 58 proxies stay below 256. */
  trafficProxyRadiusM: 1000,
  trafficProxyCount: 58,
  /** 028 episodes never emit more than one incident per pair per second. */
  collisionCooldownTicks: 30,
  recovery: Object.freeze({
    maxSegments: 3,
    stepBeyondM: 2,
  }),
});

export interface LivePhysicsStaticBox {
  readonly id: string;
  readonly centerM: Readonly<{ x: number; y: number; z: number }>;
  readonly halfExtentsM: Readonly<{ x: number; y: number; z: number }>;
}

export interface LivePhysicsRecoveryLocator {
  locate(transform: BodyTransform, access: 'TAXI' | 'CIVIL'): RecoveryRoadProof | null;
}

export interface LiveVehiclePhysicsOptions {
  readonly context: ContractContext;
  readonly initialTick?: number;
  readonly surfaceId?: RoadSurfaceId;
  readonly clock?: () => number;
  /** Static building boxes; named so a real 028 incident can damage the car. */
  readonly staticBoxes?: readonly LivePhysicsStaticBox[];
  readonly recovery?: LivePhysicsRecoveryLocator;
  readonly historyCapacity?: number;
}

export interface LiveVehicleRegistration {
  readonly vehicleId: string;
  readonly classId: VehicleClassId;
  readonly positionM: Readonly<{ x: number; y: number; z: number }>;
  readonly yawRad: number;
  readonly speedMps: number;
  readonly access: 'TAXI' | 'CIVIL';
  readonly isTraffic: boolean;
}

export interface LiveVehicleCommand {
  readonly vehicleId: string;
  readonly source: 'PLAYER' | 'AUTONOMY';
  readonly throttle: number;
  readonly brake: number;
  readonly steering: number;
  readonly handbrake: boolean;
  readonly turnSignal: VehicleCommand['turnSignal'];
  readonly driveIntent?: DriveIntent;
}

export interface LiveVehicleTrafficPose {
  readonly vehicleId: string;
  readonly positionM: Readonly<{ x: number; y: number; z: number }>;
  readonly yawRad: number;
}

export interface LiveVehicleWheelState {
  readonly wheelId: string;
  readonly localPositionM: Readonly<{ x: number; y: number; z: number }>;
  readonly radiusM: number;
  readonly spinRad: number;
  readonly steeringRad: number;
  readonly suspensionLengthM: number;
  readonly suspensionForceN: number;
  readonly inContact: boolean;
}

export interface LiveVehicleState {
  readonly vehicleId: string;
  readonly classId: VehicleClassId;
  readonly identity: BodyIdentity;
  /** Composition ground frame (body centre minus the calibrated rest height). */
  readonly positionM: Readonly<{ x: number; y: number; z: number }>;
  readonly yawRad: number;
  readonly speedMps: number;
  readonly velocityMps: Readonly<{ x: number; y: number; z: number }>;
  readonly angularVelocityRadps: Readonly<{ x: number; y: number; z: number }>;
  readonly wheels: readonly LiveVehicleWheelState[];
  readonly wheelContacts: number;
  readonly suspensionLengthsM: readonly number[];
  readonly availability: VehicleAvailability;
  readonly damage: DamageProjection;
}

export interface LivePhysicsStepCosts {
  readonly controllerMs: number;
  readonly stepMs: number;
  readonly queryMs: number;
  readonly bridgeMs: number;
  readonly collisionMs: number;
  readonly syncMs: number;
  readonly totalMs: number;
  readonly queryCount: number;
  readonly bridgeCalls: number;
}

export interface LiveVehiclePhysicsStep {
  readonly tick: number;
  readonly commands: readonly LiveVehicleCommand[];
  readonly traffic: readonly LiveVehicleTrafficPose[];
  /** PBI 282: the controlled/observed pose selects the nearest bounded traffic proxies. */
  readonly focusPositionM?: Readonly<{ x: number; y: number; z: number }>;
  readonly measure?: boolean;
}

export interface LiveVehiclePhysicsFrame {
  readonly tick: number;
  readonly vehicles: readonly LiveVehicleState[];
  readonly costs: LivePhysicsStepCosts;
  readonly collisions: Readonly<{
    contacts: number;
    candidatePairs: number;
    manifoldContacts: number;
    incidents: number;
    pending: number;
  }>;
  readonly authority: Readonly<{
    mode: ControlMode;
    players: number;
  }>;
}

export interface LiveRecoveryRequest {
  readonly vehicleId: string;
  readonly mode: 'MANUAL' | 'LEARNING';
  readonly tick: number;
  readonly origin: 'R' | 'HUD';
}

export interface LiveRecoveryOutcome {
  readonly status: 'COMPLETED' | 'DENIED' | 'PARTIAL' | 'NO_VALID_POINT' | 'CANCELLED';
  readonly vehicleId: string;
  readonly record: RecoveryRecord | null;
  readonly failure: string | null;
}

export interface LiveRecoveryProjection {
  readonly enabled: boolean;
  readonly available: boolean;
  readonly vehicleId: string | null;
  readonly mode: 'MANUAL' | 'LEARNING' | null;
  readonly pointId: string | null;
  readonly status: LiveRecoveryOutcome['status'] | null;
  readonly failure: string | null;
  readonly history: number;
}

export interface LiveVehiclePhysicsStats {
  readonly version: typeof LIVE_VEHICLE_PHYSICS_VERSION;
  readonly tick: number;
  readonly vehicles: number;
  readonly trafficProxies: number;
  readonly staticBoxes: number;
  readonly controller: Readonly<{
    vehicles: number;
    players: number;
    targets: number;
    projections: number;
    disposed: boolean;
    fault: unknown;
  }>;
  readonly damage: Readonly<{
    vehicles: number;
    historyRecords: number;
    operationIds: number;
    disposed: boolean;
  }>;
  readonly collision: Readonly<{
    trackedPairs: number;
    activePairs: number;
    pending: number;
    lastTick: number;
  }>;
  readonly recovery: Readonly<{
    records: number;
    operations: number;
    pending: boolean;
    result: LiveRecoveryOutcome['status'] | null;
    fault: string | null;
  }>;
  readonly costs: LivePhysicsStepCosts;
  readonly disposed: boolean;
}

export interface LiveVehiclePhysics {
  readonly version: typeof LIVE_VEHICLE_PHYSICS_VERSION;
  readonly policy: typeof LIVE_VEHICLE_PHYSICS_POLICY;
  readonly context: ContractContext;
  registerVehicle(input: LiveVehicleRegistration): boolean;
  removeVehicle(vehicleId: string): boolean;
  hasVehicle(vehicleId: string): boolean;
  identityOf(vehicleId: string): BodyIdentity | null;
  setAuthority(vehicleId: string, mode: ControlMode): boolean;
  /** PBI 282 static-decor resolver: exact SI pose/velocity correction after the native step. */
  setVehiclePose(
    vehicleId: string,
    positionM: Readonly<{ x: number; y: number; z: number }>,
    yawRad: number,
    velocityMps?: Readonly<{ x: number; y: number; z: number }>,
  ): boolean;
  step(input: LiveVehiclePhysicsStep): LiveVehiclePhysicsFrame;
  readVehicle(vehicleId: string): LiveVehicleState | null;
  readDamage(vehicleId: string): DamageProjection | null;
  readDamageHistory(offset?: number, limit?: number): readonly DamageHistoryRecord[];
  requestRecovery(input: LiveRecoveryRequest): string | null;
  clearRecoveryPending(): void;
  commitRecovery(atTick: number): LiveRecoveryOutcome | null;
  readRecovery(): LiveRecoveryProjection;
  readRecoveryHistory(offset?: number, limit?: number): readonly RecoveryRecord[];
  getStats(): LiveVehiclePhysicsStats;
  dispose(): void;
}

interface RegistrationEntry {
  readonly input: LiveVehicleRegistration;
  readonly identity: BodyIdentity;
  readonly massKg: number;
  desiredMode: ControlMode;
  appliedMode: ControlMode;
}

interface ProxyEntry {
  readonly handle: number;
}

interface PendingRecovery {
  readonly vehicleId: string;
  readonly mode: 'MANUAL' | 'LEARNING';
  readonly tick: number;
  readonly origin: 'R' | 'HUD';
  readonly operationId: string;
}

interface RecoveryCandidate {
  readonly transform: BodyTransform;
  readonly road: RecoveryRoadProof;
  readonly pointId: string;
}

const zeroCosts = (): LivePhysicsStepCosts =>
  Object.freeze({
    controllerMs: 0,
    stepMs: 0,
    queryMs: 0,
    bridgeMs: 0,
    collisionMs: 0,
    syncMs: 0,
    totalMs: 0,
    queryCount: 0,
    bridgeCalls: 0,
  });

function yawFromQuaternion(q: Readonly<{ x: number; y: number; z: number; w: number }>): number {
  return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
}

function forwardOf(q: Readonly<{ x: number; y: number; z: number; w: number }>) {
  return Object.freeze({
    x: 2 * (q.x * q.z + q.w * q.y),
    z: 1 - 2 * (q.x * q.x + q.y * q.y),
  });
}

function yawQuaternion(yawRad: number) {
  return Object.freeze({
    x: 0,
    y: Math.sin(yawRad / 2),
    z: 0,
    w: Math.cos(yawRad / 2),
  });
}

function bodyTransform(
  positionM: Readonly<{ x: number; y: number; z: number }>,
  yawRad: number,
): BodyTransform {
  return Object.freeze({
    positionM: Object.freeze({ ...positionM }),
    rotationQuaternion: yawQuaternion(yawRad),
  });
}

function commandPacket(
  world: ContractContext,
  tick: number,
  input: LiveVehicleCommand,
): VehicleCommand {
  return Object.freeze({
    ...world,
    vehicleId: input.vehicleId,
    tick,
    throttle: input.throttle,
    brake: input.brake,
    steering: input.steering,
    handbrake: input.handbrake,
    turnSignal: input.turnSignal,
    source: input.source,
    ...(input.driveIntent ? { driveIntent: input.driveIntent } : {}),
  });
}

function recoveryFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function createLiveVehiclePhysics(
  options: LiveVehiclePhysicsOptions,
): Promise<LiveVehiclePhysics> {
  requireContract(options !== null && typeof options === 'object', 'Live physics needs options');
  const {
    context: suppliedContext,
    initialTick = 0,
    surfaceId = 'dry-asphalt',
    clock = () => performance.now(),
    staticBoxes = [],
    recovery: recoveryLocator,
    historyCapacity,
  } = options;
  // The composition carries learningEpoch as well; domain contracts accept exactly the four
  // ContractContext fields, so the live owner binds its own exact copy once.
  const context = Object.freeze(
    readContext(suppliedContext as unknown as Record<string, unknown>),
  ) as ContractContext;
  const initial = tickValue(initialTick);
  const probe: PhysicsProbe = await createRapierProbe(clock, surfaceId);
  const damage = createVehicleDamage(
    context,
    {
      bodyIdentity: (entityId) => probe.bodyIdentity(entityId),
      collisionSource: probe.collisionSource,
    },
    historyCapacity,
  );
  const controller: VehicleController = createVehicleController(
    context,
    {
      bodyIdentity: (entityId) => probe.bodyIdentity(entityId),
      readBody: (identity) => probe.readBody(identity),
      step: (inputs, measure) => probe.step(inputs, measure),
    },
    initial,
    { drivetrainVersion: '027-braking-reverse-v1', availability: damage },
  );
  const episodes = createCollisionEpisodes(context, probe.collisionSource, {
    cooldownTicks: LIVE_VEHICLE_PHYSICS_POLICY.collisionCooldownTicks,
  });
  const ledger = createRecoveryLedger();
  const nativeRecovery = probe.createRecoveryPort?.(context) ?? null;
  let disposed = false;
  let currentTick = initial;
  let lastCosts = zeroCosts();
  let lastCollisions: Readonly<{
    contacts: number;
    candidatePairs: number;
    manifoldContacts: number;
    incidents: number;
    pending: number;
  }> = Object.freeze({
    contacts: 0,
    candidatePairs: 0,
    manifoldContacts: 0,
    incidents: 0,
    pending: 0,
  });
  const registrations = new Map<string, RegistrationEntry>();
  const proxies = new Map<string, ProxyEntry>();
  const buildingCount = staticBoxes.length;
  let pendingRecovery: PendingRecovery | null = null;
  let lastRecoveryResult: LiveRecoveryOutcome['status'] | null = null;
  let recoveryFault: string | null = null;
  let lastRecoveryPointId: string | null = null;

  for (const box of staticBoxes) {
    const id = `building:${box.id}`;
    probe.addNamedBox(id, box.centerM, box.halfExtentsM);
  }

  const requireActive = () => {
    if (disposed) throw new Error('Live physics disposed');
  };
  const proxyFor = (pose: LiveVehicleTrafficPose): void => {
    if (registrations.has(pose.vehicleId)) return;
    const existing = proxies.get(pose.vehicleId);
    if (existing) {
      probe.setStaticBoxPose(
        existing.handle,
        {
          x: pose.positionM.x,
          y: LIVE_VEHICLE_PHYSICS_POLICY.trafficProxyCentreYM,
          z: pose.positionM.z,
        },
        pose.yawRad,
      );
      return;
    }
    const half = LIVE_VEHICLE_PHYSICS_POLICY.trafficProxyHalfExtentsM;
    const handle = probe.addStaticBox(
      {
        x: pose.positionM.x,
        y: LIVE_VEHICLE_PHYSICS_POLICY.trafficProxyCentreYM,
        z: pose.positionM.z,
      },
      half,
    );
    probe.setStaticBoxPose(
      handle,
      {
        x: pose.positionM.x,
        y: LIVE_VEHICLE_PHYSICS_POLICY.trafficProxyCentreYM,
        z: pose.positionM.z,
      },
      pose.yawRad,
    );
    proxies.set(pose.vehicleId, Object.freeze({ handle }));
  };
  const syncTraffic = (
    poses: readonly LiveVehicleTrafficPose[],
    focus: Readonly<{ x: number; y: number; z: number }> | undefined,
  ): void => {
    const available = poses.filter((pose) => !registrations.has(pose.vehicleId));
    const selected =
      focus === undefined || LIVE_VEHICLE_PHYSICS_POLICY.trafficProxyCount >= available.length
        ? available
        : available
            .map((pose) => ({
              pose,
              distance: Math.hypot(pose.positionM.x - focus.x, pose.positionM.z - focus.z),
            }))
            .filter((entry) => entry.distance <= LIVE_VEHICLE_PHYSICS_POLICY.trafficProxyRadiusM)
            .sort(
              (left, right) =>
                left.distance - right.distance ||
                left.pose.vehicleId.localeCompare(right.pose.vehicleId),
            )
            .slice(0, LIVE_VEHICLE_PHYSICS_POLICY.trafficProxyCount)
            .map((entry) => entry.pose);
    const wanted = new Set<string>();
    for (const pose of selected) {
      wanted.add(pose.vehicleId);
      proxyFor(pose);
    }
    for (const [vehicleId, proxy] of proxies) {
      if (wanted.has(vehicleId)) continue;
      probe.removeStaticBox(proxy.handle);
      proxies.delete(vehicleId);
    }
  };
  const readVehicleState = (entry: RegistrationEntry): LiveVehicleState => {
    const { identity, input } = entry;
    const projection = probe.project(input.vehicleId);
    const velocity = projection.velocity;
    const forward = forwardOf(projection.rotation);
    const speed = velocity.x * forward.x + velocity.z * forward.z;
    const wheels = Object.freeze(
      projection.wheels.map((wheel) =>
        Object.freeze({
          wheelId: wheel.wheelId,
          localPositionM: Object.freeze({
            x: wheel.localPositionM.x,
            y: wheel.localPositionM.y,
            z: wheel.localPositionM.z,
          }),
          radiusM: wheel.radiusM,
          spinRad: wheel.spinRad,
          steeringRad: wheel.steeringRad,
          suspensionLengthM: wheel.suspensionLengthM,
          suspensionForceN: wheel.suspensionForceN,
          inContact: wheel.inContact,
        }),
      ),
    );
    return Object.freeze({
      vehicleId: input.vehicleId,
      classId: input.classId,
      identity,
      positionM: Object.freeze({
        x: projection.position.x,
        y: projection.position.y - LIVE_VEHICLE_PHYSICS_POLICY.chassisRestHeightM,
        z: projection.position.z,
      }),
      yawRad: yawFromQuaternion(projection.rotation),
      speedMps: speed,
      velocityMps: Object.freeze({ x: velocity.x, y: velocity.y, z: velocity.z }),
      angularVelocityRadps: Object.freeze({
        x: projection.angularVelocityRadps.x,
        y: projection.angularVelocityRadps.y,
        z: projection.angularVelocityRadps.z,
      }),
      wheels,
      wheelContacts: projection.wheelContacts,
      suspensionLengthsM: projection.suspension,
      availability: damage.readDamage(identity).availability,
      damage: damage.readDamage(identity),
    });
  };
  const readAll = (): readonly LiveVehicleState[] =>
    Object.freeze([...registrations.values()].map((entry) => readVehicleState(entry)));
  const candidateTransforms = (
    current: BodyTransform,
    access: 'TAXI' | 'CIVIL',
  ): RecoveryCandidate[] => {
    if (recoveryLocator === undefined) return [];
    const found: RecoveryCandidate[] = [];
    const seen = new Set<string>();
    const pushAlong = (road: RecoveryRoadProof, distances: readonly number[]) => {
      const dx = road.end.x - road.start.x,
        dz = road.end.z - road.start.z,
        length = Math.hypot(dx, dz);
      if (!(length > 0)) return;
      const ux = dx / length,
        uz = dz / length,
        yawRad = Math.atan2(dx, dz);
      for (const distance of distances) {
        const along = Math.max(0.5, Math.min(length - 0.5, distance));
        const x = road.start.x + ux * along,
          z = road.start.z + uz * along;
        const pointId = createStableId('recovery-point', road.mapId, [
          access,
          road.laneId,
          x.toFixed(3),
          z.toFixed(3),
        ]);
        if (seen.has(pointId)) continue;
        seen.add(pointId);
        found.push(
          Object.freeze({
            transform: bodyTransform(
              { x, y: LIVE_VEHICLE_PHYSICS_POLICY.chassisRestHeightM, z },
              yawRad,
            ),
            road,
            pointId,
          }),
        );
      }
    };
    const located = recoveryLocator.locate(current, access);
    if (located !== null) {
      const dx = located.end.x - located.start.x,
        dz = located.end.z - located.start.z,
        length = Math.hypot(dx, dz);
      if (length > 0) {
        const ux = dx / length,
          uz = dz / length,
          projection =
            (current.positionM.x - located.start.x) * ux +
            (current.positionM.z - located.start.z) * uz;
        // Local first: same longitudinal position, then progressively farther along the same lane.
        pushAlong(located, [
          projection,
          projection - 2,
          projection + 2,
          projection - 5,
          projection + 5,
          projection - 10,
          projection + 10,
        ]);
      }
    }
    let road = located;
    for (
      let index = 0;
      road !== null && index < LIVE_VEHICLE_PHYSICS_POLICY.recovery.maxSegments;
      index += 1
    ) {
      const dx = road.end.x - road.start.x,
        dz = road.end.z - road.start.z,
        length = Math.hypot(dx, dz);
      if (!(length > 0)) break;
      const ux = dx / length,
        uz = dz / length,
        step = LIVE_VEHICLE_PHYSICS_POLICY.recovery.stepBeyondM;
      const next = recoveryLocator.locate(
        bodyTransform(
          { x: road.end.x + ux * step, y: 0, z: road.end.z + uz * step },
          Math.atan2(dx, dz),
        ),
        access,
      );
      if (next === null || next.laneId === road.laneId) break;
      pushAlong(next, [step, step + 3, step + 8]);
      road = next;
    }
    return found;
  };
  const applyRecovery = (request: PendingRecovery, atTick: number): LiveRecoveryOutcome => {
    const entry = registrations.get(request.vehicleId);
    if (!entry || probe.bodyIdentity(request.vehicleId) !== entry.identity)
      return Object.freeze({
        status: 'DENIED' as const,
        vehicleId: request.vehicleId,
        record: null,
        failure: 'Unknown live physics vehicle',
      });
    if (nativeRecovery === null)
      return Object.freeze({
        status: 'DENIED' as const,
        vehicleId: request.vehicleId,
        record: null,
        failure: 'Recovery port unavailable',
      });
    const currentProjection = probe.project(request.vehicleId);
    const current = bodyTransform(
      {
        x: currentProjection.position.x,
        y: currentProjection.position.y,
        z: currentProjection.position.z,
      },
      yawFromQuaternion(currentProjection.rotation),
    );
    const candidates = candidateTransforms(current, entry.input.access);
    if (candidates.length === 0) {
      lastRecoveryResult = 'NO_VALID_POINT';
      return Object.freeze({
        status: 'NO_VALID_POINT' as const,
        vehicleId: request.vehicleId,
        record: null,
        failure: null,
      });
    }
    const operationId = request.operationId;
    const fingerprint = JSON.stringify({
      operationId,
      mode: request.mode,
      origin: request.origin,
    });
    let chosen: RecoveryCandidate | null = null;
    let chosenInspection: ReturnType<
      NonNullable<typeof nativeRecovery>['inspectPlacement']
    > | null = null;
    let inspectedCount = 0;
    for (const candidate of candidates) {
      inspectedCount += 1;
      const inspection = nativeRecovery.inspectPlacement({
        identity: entry.identity,
        context: Object.freeze({ ...context }),
        expectedPhysicsSerial: probe.collisionStepSerial(),
        transform: candidate.transform,
        road: candidate.road,
      });
      if (inspection.status !== 'SAFE') continue;
      chosen = candidate;
      chosenInspection = inspection;
      break;
    }
    if (chosen === null || chosenInspection === null) {
      const record = buildRecoveryRecord({
        request,
        entry,
        atTick,
        candidate: candidates[0]!,
        inspection: chosenInspection,
        placement: null,
        status: 'DENIED',
        failure: null,
      });
      admitRecovery(record, fingerprint);
      lastRecoveryResult = 'DENIED';
      return Object.freeze({
        status: 'DENIED' as const,
        vehicleId: request.vehicleId,
        record,
        failure: null,
      });
    }
    // Invalidate the 024 realization before the native teleport. The controller clears its
    // drivetrain/control state; the next packet is a fresh command, never a stale held input.
    try {
      controller.invalidateRealization?.(entry.identity, atTick, request.mode);
    } catch (error) {
      const failure = recoveryFailure(error);
      recoveryFault = failure;
      lastRecoveryResult = 'PARTIAL';
      return Object.freeze({
        status: 'PARTIAL' as const,
        vehicleId: request.vehicleId,
        record: null,
        failure,
      });
    }
    let placement;
    try {
      placement = nativeRecovery.applyPlacement({
        identity: entry.identity,
        context: Object.freeze({ ...context }),
        expectedPhysicsSerial: probe.collisionStepSerial(),
        transform: chosen.transform,
        road: chosen.road,
      });
    } catch (error) {
      const failure = recoveryFailure(error);
      recoveryFault = failure;
      lastRecoveryResult = 'PARTIAL';
      return Object.freeze({
        status: 'PARTIAL' as const,
        vehicleId: request.vehicleId,
        record: null,
        failure,
      });
    }
    const success =
      placement.inspection.status === 'SAFE' &&
      placement.failure === null &&
      placement.completed === 5 &&
      placement.after !== null;
    if (!success) {
      const failure =
        placement.failure ??
        (placement.inspection.status !== 'SAFE'
          ? `Native placement ${placement.inspection.status}`
          : 'Incomplete native recovery');
      const record = buildRecoveryRecord({
        request,
        entry,
        atTick,
        candidate: chosen,
        inspection: placement.inspection,
        placement,
        status: placement.inspection.status === 'SAFE' ? 'PARTIAL' : 'DENIED',
        failure,
      });
      admitRecovery(record, fingerprint);
      lastRecoveryResult = record.status === 'DENIED' ? 'DENIED' : 'PARTIAL';
      if (record.status === 'PARTIAL') recoveryFault = failure;
      return Object.freeze({
        status: record.status === 'DENIED' ? ('DENIED' as const) : ('PARTIAL' as const),
        vehicleId: request.vehicleId,
        record,
        failure,
      });
    }
    try {
      damage.recover(entry.identity, {
        context: Object.freeze({ ...context }),
        operationId,
        tick: atTick,
      });
    } catch (error) {
      const failure = recoveryFailure(error);
      recoveryFault = failure;
      lastRecoveryResult = 'PARTIAL';
      const record = buildRecoveryRecord({
        request,
        entry,
        atTick,
        candidate: chosen,
        inspection: placement.inspection,
        placement,
        status: 'PARTIAL',
        failure,
      });
      admitRecovery(record, fingerprint);
      return Object.freeze({
        status: 'PARTIAL' as const,
        vehicleId: request.vehicleId,
        record,
        failure,
      });
    }
    const record = buildRecoveryRecord({
      request,
      entry,
      atTick,
      candidate: chosen,
      inspection: placement.inspection,
      placement,
      status: 'COMPLETED',
      failure: null,
    });
    admitRecovery(record, fingerprint);
    lastRecoveryResult = 'COMPLETED';
    lastRecoveryPointId = chosen.pointId;
    recoveryFault = null;
    return Object.freeze({
      status: 'COMPLETED' as const,
      vehicleId: request.vehicleId,
      record,
      failure: null,
    });
  };
  const buildRecoveryRecord = (params: {
    readonly request: PendingRecovery;
    readonly entry: RegistrationEntry;
    readonly atTick: number;
    readonly candidate: RecoveryCandidate;
    readonly inspection: ReturnType<NonNullable<typeof nativeRecovery>['inspectPlacement']> | null;
    readonly placement: ReturnType<NonNullable<typeof nativeRecovery>['applyPlacement']> | null;
    readonly status: RecoveryRecord['status'];
    readonly failure: string | null;
  }): RecoveryRecord => {
    const { request, entry, atTick, candidate, placement } = params;
    return Object.freeze({
      context: Object.freeze({ ...context }),
      operationId: request.operationId,
      vehicleId: request.vehicleId,
      bodyGeneration: entry.identity.generation,
      pointId: candidate.pointId,
      mapId: candidate.road.mapId,
      laneId: candidate.road.laneId,
      access: candidate.road.access,
      mode: request.mode,
      validatedTick: atTick,
      requestedTick: request.tick,
      acceptedTick: atTick,
      origin: request.origin,
      kind: 'TELEPORT' as const,
      learningEligible: false as const,
      status: params.status,
      before: placement ? recoverySnapshot(placement.before) : null,
      placement: placement
        ? Object.freeze({
            status: placement.inspection.status,
            physicsStepSerial: placement.inspection.physicsStepSerial,
            colliderCount: placement.inspection.colliderCount,
            after: placement.after ? recoverySnapshot(placement.after) : null,
            attempted: placement.attempted,
            completed: placement.completed,
            failure: placement.failure,
          })
        : null,
      deliveredStages: params.status === 'COMPLETED' ? 4 : 0,
      failure: params.failure,
    });
  };
  const admitRecovery = (record: RecoveryRecord, fingerprint: string): void => {
    try {
      const prior = ledger.lookup(record.operationId, fingerprint);
      if (prior !== null) return;
      const index = ledger.admit(record, fingerprint);
      ledger.finish(index);
    } catch (error) {
      recoveryFault = recoveryFailure(error);
    }
  };
  const stats = (): LiveVehiclePhysicsStats => {
    const controllerStats = controller.getStats();
    const damageStats = damage.getStats();
    const episodeStats = episodes.getStats();
    return Object.freeze({
      version: LIVE_VEHICLE_PHYSICS_VERSION,
      tick: currentTick,
      vehicles: registrations.size,
      trafficProxies: proxies.size,
      staticBoxes: buildingCount,
      controller: Object.freeze({
        vehicles: controllerStats.vehicles,
        players: controllerStats.players,
        targets: controllerStats.targets,
        projections: controllerStats.projections,
        disposed: controllerStats.disposed,
        fault: controllerStats.fault,
      }),
      damage: Object.freeze({
        vehicles: damageStats.vehicles,
        historyRecords: damageStats.historyRecords,
        operationIds: damageStats.operationIds,
        disposed: damageStats.disposed,
      }),
      collision: Object.freeze({
        trackedPairs: episodeStats.trackedPairs,
        activePairs: episodeStats.activePairs,
        pending: episodeStats.pending,
        lastTick: episodeStats.lastTick,
      }),
      recovery: Object.freeze({
        records: ledger.getStats().records,
        operations: ledger.getStats().operations,
        pending: pendingRecovery !== null,
        result: lastRecoveryResult,
        fault: recoveryFault,
      }),
      costs: lastCosts,
      disposed,
    });
  };

  const api: LiveVehiclePhysics = {
    version: LIVE_VEHICLE_PHYSICS_VERSION,
    policy: LIVE_VEHICLE_PHYSICS_POLICY,
    context: Object.freeze({ ...context }),
    registerVehicle(input) {
      requireActive();
      if (registrations.has(input.vehicleId)) return false;
      const config = vehicleClass(input.classId);
      probe.addClassCar(
        input.vehicleId,
        {
          x: input.positionM.x,
          y: input.positionM.y + LIVE_VEHICLE_PHYSICS_POLICY.chassisRestHeightM,
          z: input.positionM.z,
        },
        input.classId,
      );
      const identity = probe.bodyIdentity(input.vehicleId);
      if (!identity) throw new Error('Live physics body identity missing');
      probe.setPose(
        identity,
        bodyTransform(
          {
            x: input.positionM.x,
            y: input.positionM.y + LIVE_VEHICLE_PHYSICS_POLICY.chassisRestHeightM,
            z: input.positionM.z,
          },
          input.yawRad,
        ),
      );
      probe.setVelocity(input.vehicleId, {
        x: Math.sin(input.yawRad) * input.speedMps,
        y: 0,
        z: Math.cos(input.yawRad) * input.speedMps,
      });
      try {
        damage.register(identity, config.massKg);
        controller.register(identity);
      } catch (error) {
        try {
          damage.remove(identity);
        } catch {
          // The damage owner may not have admitted this identity; keep the primary cause.
        }
        probe.removeBody(identity);
        throw error;
      }
      registrations.set(input.vehicleId, {
        input: Object.freeze({ ...input }),
        identity,
        massKg: config.massKg,
        desiredMode: 'AUTO',
        appliedMode: 'AUTO',
      });
      const proxy = proxies.get(input.vehicleId);
      if (proxy) {
        probe.removeStaticBox(proxy.handle);
        proxies.delete(input.vehicleId);
      }
      return true;
    },
    removeVehicle(vehicleId) {
      requireActive();
      const entry = registrations.get(vehicleId);
      if (!entry) return false;
      if (pendingRecovery?.vehicleId === vehicleId) {
        pendingRecovery = null;
        lastRecoveryResult = 'CANCELLED';
      }
      controller.remove(entry.identity);
      damage.remove(entry.identity);
      probe.removeBody(entry.identity);
      registrations.delete(vehicleId);
      return true;
    },
    hasVehicle(vehicleId) {
      return (
        registrations.get(vehicleId) !== undefined && probe.bodyIdentity(vehicleId) !== undefined
      );
    },
    identityOf(vehicleId) {
      return registrations.get(vehicleId)?.identity ?? null;
    },
    setAuthority(vehicleId, mode) {
      requireActive();
      const entry = registrations.get(vehicleId);
      if (!entry) return false;
      if (mode === 'AUTO' && pendingRecovery?.vehicleId === vehicleId) {
        pendingRecovery = null;
        lastRecoveryResult = 'CANCELLED';
      }
      entry.desiredMode = mode;
      return true;
    },
    setVehiclePose(vehicleId, positionM, yawRad, velocityMps) {
      requireActive();
      const entry = registrations.get(vehicleId);
      if (!entry || probe.bodyIdentity(vehicleId) !== entry.identity) return false;
      probe.setPose(
        entry.identity,
        bodyTransform(
          {
            x: positionM.x,
            y: positionM.y + LIVE_VEHICLE_PHYSICS_POLICY.chassisRestHeightM,
            z: positionM.z,
          },
          yawRad,
        ),
      );
      if (velocityMps !== undefined) probe.setBodyVelocity(entry.identity, velocityMps);
      return true;
    },
    step(input) {
      requireActive();
      const atTick = tickValue(input.tick);
      requireContract(atTick === currentTick + 1, 'Live physics tick must be next physical tick');
      const started = input.measure ? clock() : 0;
      syncTraffic(input.traffic, input.focusPositionM);
      const packets: { identity: BodyIdentity; command: VehicleCommand }[] = [];
      for (const command of input.commands) {
        if (!registrations.has(command.vehicleId)) continue;
        const identity = registrations.get(command.vehicleId)!.identity;
        packets.push({
          identity,
          command: commandPacket(context, atTick, command),
        });
      }
      const changes: { identity: BodyIdentity; mode: ControlMode }[] = [];
      for (const entry of registrations.values()) {
        if (entry.desiredMode !== entry.appliedMode) {
          changes.push({ identity: entry.identity, mode: entry.desiredMode });
          entry.appliedMode = entry.desiredMode;
        }
      }
      let frame: VehicleControllerFrame;
      try {
        frame = controller.step(
          { tick: atTick, dtSeconds: 1 / 60 },
          packets,
          changes,
          input.measure === true,
        );
      } catch (error) {
        lastCosts = zeroCosts();
        throw error;
      }
      const physics = frame.physics;
      const collisionStarted = input.measure ? clock() : 0;
      let collisions = lastCollisions;
      if (nativeRecovery !== null) {
        const readback = probe.readCollisionContacts();
        const emitted = episodes.update(atTick, readback.contacts);
        const drained = episodes.drain((incident) => {
          damage.applyIncident(incident);
          return undefined;
        });
        collisions = Object.freeze({
          contacts: readback.contacts.length,
          candidatePairs: readback.candidatePairs,
          manifoldContacts: readback.manifoldContacts,
          incidents: emitted,
          pending: drained.pending,
        });
      }
      const collisionEnd = input.measure ? clock() : 0;
      const vehicles = readAll();
      const syncEnd = input.measure ? clock() : 0;
      const costs = Object.freeze({
        controllerMs: physics.controllerMs,
        stepMs: physics.stepMs,
        queryMs: physics.queryMs,
        bridgeMs: physics.bridgeMs,
        collisionMs: collisionEnd - collisionStarted,
        syncMs: syncEnd - collisionEnd,
        totalMs: input.measure ? syncEnd - started : 0,
        queryCount: physics.queryCount,
        bridgeCalls: physics.bridgeCalls,
      });
      lastCosts = costs;
      lastCollisions = collisions;
      currentTick = atTick;
      const player = [...registrations.values()].find((entry) => entry.appliedMode !== 'AUTO');
      return Object.freeze({
        tick: atTick,
        vehicles,
        costs,
        collisions,
        authority: Object.freeze({
          mode: player?.appliedMode ?? 'AUTO',
          players: [...registrations.values()].filter((entry) => entry.appliedMode !== 'AUTO')
            .length,
        }),
      });
    },
    readVehicle(vehicleId) {
      const entry = registrations.get(vehicleId);
      return entry && probe.bodyIdentity(vehicleId) === entry.identity
        ? readVehicleState(entry)
        : null;
    },
    readDamage(vehicleId) {
      const entry = registrations.get(vehicleId);
      return entry && probe.bodyIdentity(vehicleId) === entry.identity
        ? damage.readDamage(entry.identity)
        : null;
    },
    readDamageHistory(offset = 0, limit = 64) {
      return damage.readHistory(offset, limit);
    },
    requestRecovery(input) {
      requireActive();
      const entry = registrations.get(input.vehicleId);
      if (!entry) return null;
      requireContract(
        controller.readBoundary?.().tick === input.tick ||
          controller.getStats().tick === input.tick,
        'Recovery request is not at the accepted controller tick',
      );
      if (pendingRecovery !== null) return null;
      const operationId = createStableId('recovery', context.sessionId, [
        String(context.worldEpoch),
        input.vehicleId,
        String(entry.identity.generation),
        String(input.tick),
        input.origin,
      ]);
      pendingRecovery = Object.freeze({
        vehicleId: input.vehicleId,
        mode: input.mode,
        tick: input.tick,
        origin: input.origin,
        operationId,
      });
      return operationId;
    },
    clearRecoveryPending() {
      pendingRecovery = null;
      lastRecoveryResult = 'CANCELLED';
    },
    commitRecovery(atTick) {
      requireActive();
      if (pendingRecovery === null) return null;
      const request = pendingRecovery;
      pendingRecovery = null;
      const at = tickValue(atTick);
      if (request.tick !== at) {
        lastRecoveryResult = 'CANCELLED';
        return Object.freeze({
          status: 'CANCELLED' as const,
          vehicleId: request.vehicleId,
          record: null,
          failure: 'Recovery boundary changed',
        });
      }
      return applyRecovery(request, at);
    },
    readRecovery() {
      const player = [...registrations.values()].find((entry) => entry.desiredMode !== 'AUTO');
      const entry = player ?? null;
      return Object.freeze({
        enabled: !disposed && pendingRecovery === null && recoveryFault === null,
        available:
          entry !== null &&
          recoveryLocator !== undefined &&
          entry.desiredMode !== 'AUTO' &&
          probe.bodyIdentity(entry.input.vehicleId) === entry.identity,
        vehicleId: entry?.input.vehicleId ?? null,
        mode: entry === null ? null : entry.desiredMode === 'LEARNING' ? 'LEARNING' : 'MANUAL',
        pointId: lastRecoveryPointId,
        status: lastRecoveryResult,
        failure: recoveryFault,
        history: ledger.getStats().records,
      });
    },
    readRecoveryHistory(offset = 0, limit = 64) {
      return ledger.readHistory(offset, limit);
    },
    getStats: stats,
    dispose() {
      if (disposed) return;
      disposed = true;
      pendingRecovery = null;
      for (const proxy of proxies.values()) {
        try {
          probe.removeStaticBox(proxy.handle);
        } catch {
          // The probe owns the native world; disposal below releases it even if a proxy is stale.
        }
      }
      proxies.clear();
      try {
        nativeRecovery?.release();
      } catch {
        // No second cleanup: the probe disposal releases the remaining native world.
      }
      controller.dispose();
      damage.dispose();
      episodes.dispose();
      ledger.clear();
      registrations.clear();
      probe.dispose();
    },
  };
  return Object.freeze(api);
}

function tickValue(value: number): number {
  requireContract(
    Number.isSafeInteger(value) && value >= 0,
    'Live physics tick must be a non-negative safe integer',
  );
  return value;
}
