/**
 * PBI 271 — live AUTO / MANUAL / LEARNING boundary integration.
 *
 * The module is the live composition of the existing 069 intervention lifecycle over the existing
 * V3 composition. It owns no mode rule, no physics, no clock and no second segment model: every
 * mode boundary is prepared through `createInterventionLifecycle`, the composition applies the
 * accepted mode in the same authoritative tick, and the lifecycle settles with the real accepted
 * authority.
 *
 * LEARNING segments are exposed to the future 272 telemetry owner as frozen read models. This
 * module never estimates style, never submits a learning job and never publishes a profile version;
 * those remain 272/273.
 */
import type { ContractContext } from '../sessions';
import {
  createInterventionEventTransport,
  createInterventionIntake,
  createInterventionLifecycle,
  createInterventionRecordStore,
} from '../telemetry';
import type {
  InterventionBoundaryPlan,
  InterventionBoundaryTicket,
  InterventionCloseReason,
  InterventionIntakeDescriptor,
  InterventionSegment,
  InterventionTarget,
} from '../telemetry';
import type { BodyIdentity, ControlMode } from '../vehicles';

export const LIVE_THREE_MODES_VERSION = '271-live-three-modes-v1' as const;

export type LiveModeCloseReason = Extract<
  InterventionCloseReason,
  | 'RETURN_TO_AUTO'
  | 'MODE_CHANGE'
  | 'VEHICLE_SWITCH'
  | 'SESSION_CHANGE'
  | 'WORLD_RESET'
  | 'SHUTDOWN'
>;

export interface LiveModeAuthoritySource {
  /** The authoritative composition tick. */
  readonly tick: number;
  /** The single PLAYER seat, `null` in AUTO observation. */
  readonly playerVehicleId: string | null;
  /** Accepted mode of the PLAYER seat; `AUTO` when the seat is empty. */
  readonly mode: ControlMode;
  /** 070 suspension is a fact, not time: a suspended lifecycle admits no tick. */
  readonly suspended: boolean;
}

export interface LiveModeVehicleContext {
  readonly vehicleId: string;
  readonly classId: 'sedan' | 'compact';
  readonly driverKind: 'TAXI' | 'CIVILIAN';
  readonly positionM: Readonly<{ x: number; y: number; z: number }>;
  readonly yawRad: number;
  readonly speedMps: number;
  readonly laneId: string | null;
  readonly routeLaneIds: readonly string[];
  readonly rideId: string | null;
  readonly appliedProfileVersion: string;
}

export interface LiveModeTickPlan {
  readonly tick: number;
  readonly currentVehicleId: string | null;
  readonly currentMode: ControlMode;
  readonly nextVehicleId: string | null;
  readonly nextMode: ControlMode;
  readonly reason: LiveModeCloseReason | null;
  /** Pose/route/class captured before the accepted transition tick. */
  readonly vehicle: LiveModeVehicleContext | null;
}

export interface LiveModeSegmentsOptions {
  readonly context: ContractContext;
  readonly playerId: string;
  readonly profileId: string;
  readonly baseVersionId: string;
  readonly learningEpoch: number;
  readonly controlPreferencesVersion: string;
  readonly engineVersion: string;
  readonly mapVersion: string;
  /** Stable host eligibility fact for the whole lifecycle. */
  readonly learningEligible: boolean;
  readonly readAuthority: () => LiveModeAuthoritySource;
  readonly inputType?: 'KEYBOARD' | 'GAMEPAD';
}

export interface LiveModeSegmentView {
  readonly segmentId: string;
  readonly vehicleId: string;
  readonly mode: ControlMode;
  readonly learningEligible: boolean;
  readonly startTick: number;
  readonly endTick: number | null;
  readonly completeness: 'OPEN' | 'CLOSED' | 'INCOMPLETE';
  readonly closeReason: string | null;
  readonly samples: number;
  readonly playerId: string;
  readonly profileId: string;
  readonly baseVersionId: string;
  readonly learningEpoch: number;
  readonly context: LiveModeVehicleContext | null;
}

export interface LiveModeLearningExposure {
  readonly eligible: boolean;
  readonly segments: readonly LiveModeSegmentView[];
  readonly descriptors: readonly InterventionIntakeDescriptor[];
  readonly workspace: 'TELEMETRY_272';
  readonly profilePublications: 0;
}

export interface LiveModeSegmentsReadModel {
  readonly version: typeof LIVE_THREE_MODES_VERSION;
  readonly tick: number;
  readonly acceptedTick: number;
  readonly mode: ControlMode;
  readonly active: LiveModeSegmentView | null;
  readonly lastClosed: LiveModeSegmentView | null;
  readonly segments: readonly LiveModeSegmentView[];
  readonly learning: LiveModeLearningExposure;
  readonly suspended: boolean;
  readonly dispatch: Readonly<{
    prepares: number;
    settles: number;
    rejects: number;
    segments: number;
    learningExposed: number;
    profilePublications: 0;
  }>;
  readonly disposed: boolean;
}

export interface LiveModeSegments {
  readonly version: typeof LIVE_THREE_MODES_VERSION;
  /** Called before the composition applies the next tick; also advances a no-change tick. */
  beginTick(plan: LiveModeTickPlan): void;
  /** Called after the authoritative composition tick with the real accepted seat. */
  settleTick(plan: LiveModeTickPlan, acceptedVehicle: LiveModeVehicleContext | null): void;
  /** Called when the requested transition was refused and no authority changed. */
  rejectTick(plan: LiveModeTickPlan): void;
  observe(): LiveModeSegmentsReadModel;
  learningExposure(): LiveModeLearningExposure;
  /** Close an open segment with a terminal 069 reason; used by session switching/disposal. */
  retire(
    reason: Extract<LiveModeCloseReason, 'SESSION_CHANGE' | 'WORLD_RESET' | 'SHUTDOWN'>,
  ): boolean;
  dispose(): void;
}

export interface LiveModeHudView {
  readonly symbol: 'AI' | 'M' | 'L' | '—';
  readonly label: string;
  readonly manualAction: string;
  readonly learningAction: string;
  readonly eligibility: string;
}

/**
 * PBI 271 HUD labels. They are the mandated texts from Docs/08/217, not a second mode store.
 */
export function readLiveModeHud(
  mode: ControlMode | null,
  learningEligible: boolean | null,
  onFoot = false,
): LiveModeHudView {
  if (onFoot)
    return Object.freeze({
      symbol: '—' as const,
      label: 'Pe jos · M în mașină',
      manualAction: 'M · în mașină',
      learningAction: 'L · în mașină',
      eligibility: 'Eligibilitate indisponibilă',
    });
  return Object.freeze({
    symbol: (mode === 'AUTO' ? 'AI' : mode === 'LEARNING' ? 'L' : mode === 'MANUAL' ? 'M' : '—') as
      'AI' | 'M' | 'L' | '—',
    label:
      mode === 'AUTO'
        ? 'Conduce AI-ul'
        : mode === 'LEARNING'
          ? 'Conduci · orașul învață'
          : 'Conduci · învățare oprită',
    manualAction: mode === 'AUTO' ? 'M · Manual' : mode === 'LEARNING' ? 'M · Auto' : 'M · Auto',
    learningAction:
      mode === 'AUTO' ? 'L · Learning' : mode === 'LEARNING' ? 'L · Manual' : 'L · Learning',
    eligibility:
      learningEligible === null
        ? 'Eligibilitate indisponibilă'
        : learningEligible
          ? 'Eligibil pentru învățare'
          : 'Învățare neeligibilă',
  });
}

function identityFor(vehicleId: string): BodyIdentity {
  // The live composition has stable string vehicle ids, not native Rapier handles. The 069 contract
  // needs a stable identity token, so the handle is a deterministic hash of the exact id and the
  // generation is fixed for the lifetime of the live world.
  let hash = 0x811c9dc5;
  for (let index = 0; index < vehicleId.length; index += 1) {
    hash ^= vehicleId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return Object.freeze({ entityId: vehicleId, handle: 1 + (hash % 1_000_000), generation: 1 });
}

function segmentView(
  record: InterventionSegment,
  context: LiveModeVehicleContext | null,
): LiveModeSegmentView {
  return Object.freeze({
    segmentId: record.segmentId,
    vehicleId: record.vehicleId,
    mode: record.controlMode,
    learningEligible: record.learningEligible,
    startTick: record.startTick,
    endTick: record.endTick,
    completeness: record.completeness,
    closeReason: record.closeReason,
    samples: record.samples.length,
    playerId: record.playerId,
    profileId: record.profileId,
    baseVersionId: record.baseVersionId,
    learningEpoch: record.learningEpoch,
    context,
  });
}

export function createLiveModeSegments(options: LiveModeSegmentsOptions): LiveModeSegments {
  if (options === null || typeof options !== 'object')
    throw new Error('Live mode segments require options.');
  const context = Object.freeze({
    schemaVersion: options.context.schemaVersion,
    units: options.context.units,
    sessionId: options.context.sessionId,
    worldEpoch: options.context.worldEpoch,
  }) as ContractContext;
  const inputType = options.inputType ?? ('KEYBOARD' as const);
  const identities = new Map<string, BodyIdentity>();
  const bodyIdentity = (id: string): BodyIdentity => {
    const existing = identities.get(id);
    if (existing !== undefined) return existing;
    const created = identityFor(id);
    identities.set(id, created);
    return created;
  };
  const records = createInterventionRecordStore(context);
  const events = createInterventionEventTransport(context);
  const intake = createInterventionIntake(context);
  const causes = new Map<string, ReturnType<typeof causeOf>>();
  const intakeDescriptors = new Map<string, InterventionIntakeDescriptor>();
  const contexts = new Map<string, LiveModeVehicleContext>();
  const knownSegments: string[] = [];
  let sequence = 0;
  let prepares = 0;
  let settles = 0;
  let rejects = 0;
  let disposed = false;
  let pending: Readonly<{ ticket: InterventionBoundaryTicket; plan: LiveModeTickPlan }> | null =
    null;

  const target = (): InterventionTarget =>
    Object.freeze({
      ...context,
      version: '069-intervention-target-v1' as const,
      playerId: options.playerId,
      profileId: options.profileId,
      baseVersionId: options.baseVersionId,
      learningEpoch: options.learningEpoch,
      controlPreferencesVersion: options.controlPreferencesVersion,
      engineVersion: options.engineVersion,
      mapVersion: options.mapVersion,
      inputType,
      learningEligible: options.learningEligible,
    });

  function causeOf(reason: InterventionCloseReason, tick: number, identity: BodyIdentity | null) {
    sequence += 1;
    const operationId = `271:${context.sessionId}:${context.worldEpoch}:${tick}:${sequence}`;
    return Object.freeze({
      ...context,
      version: '069-admitted-cause-v1' as const,
      operationId,
      timing: 'AT_LAST_ACCEPTED_TICK' as const,
      tick,
      identity,
      reason,
    });
  }

  const lifecycle = createInterventionLifecycle(context, '271-live-three-modes', {
    bodyIdentity: (id) => identities.get(id),
    readTarget: target,
    preparedCause: (operationId) => causes.get(operationId) ?? null,
    preparedTarget: () => null,
    records: records.port,
    events: events.port,
    reserveIntake: (descriptor) => {
      intakeDescriptors.set(descriptor.operationId, descriptor);
      intake.reserve(descriptor);
    },
    rejectIntake: (operationId) => {
      intakeDescriptors.delete(operationId);
      intake.reject(operationId);
    },
    inspectIntake: (operationId) => intake.inspect(operationId),
    acceptIntake: (descriptor) => intake.accept(descriptor),
    acknowledgeIntake(operationId) {
      const receipt = intake.inspect(operationId);
      if (receipt === null || !receipt.accepted) throw new Error('271 missing intake receipt');
      intake.acknowledge(receipt);
      intakeDescriptors.delete(operationId);
    },
    inspectIntakeRelease: (operationId) => intake.inspectRelease(operationId),
    readAuthority: () => {
      const source = options.readAuthority();
      const vehicleId = source.playerVehicleId;
      return Object.freeze({
        ...context,
        version: '069-accepted-authority-v1' as const,
        tick: source.tick,
        identity: vehicleId === null ? null : bodyIdentity(vehicleId),
        mode: vehicleId === null ? 'AUTO' : source.mode,
        suspended: source.suspended,
        disposed: false,
        fault: null,
      });
    },
  });

  function remember(segmentId: string): void {
    if (segmentId.length === 0) return;
    if (!knownSegments.includes(segmentId)) knownSegments.push(segmentId);
  }

  function segmentOf(segmentId: string): LiveModeSegmentView | null {
    const record = records.port.read(segmentId);
    return record === null ? null : segmentView(record, contexts.get(segmentId) ?? null);
  }

  function observeInternal(): LiveModeSegmentsReadModel {
    const state = lifecycle.observe();
    remember(state.active?.segmentId ?? '');
    remember(state.lastClosed?.segmentId ?? '');
    const active = state.active === null ? null : segmentOf(state.active.segmentId);
    const lastClosed = state.lastClosed === null ? null : segmentOf(state.lastClosed.segmentId);
    const segments = knownSegments
      .map((segmentId) => segmentOf(segmentId))
      .filter((value): value is LiveModeSegmentView => value !== null)
      .sort(
        (left, right) =>
          left.startTick - right.startTick || left.segmentId.localeCompare(right.segmentId),
      );
    const learningSegments = segments.filter(
      (segment) =>
        segment.mode === 'LEARNING' && segment.learningEligible && segment.completeness !== 'OPEN',
    );
    return Object.freeze({
      version: LIVE_THREE_MODES_VERSION,
      tick: options.readAuthority().tick,
      acceptedTick: state.acceptedTick,
      mode: options.readAuthority().mode,
      active,
      lastClosed,
      segments: Object.freeze(segments),
      learning: Object.freeze({
        eligible: options.learningEligible,
        segments: Object.freeze(learningSegments),
        descriptors: Object.freeze([...intakeDescriptors.values()]),
        workspace: 'TELEMETRY_272' as const,
        profilePublications: 0 as const,
      }),
      suspended: state.suspended ?? options.readAuthority().suspended,
      dispatch: Object.freeze({
        prepares,
        settles,
        rejects,
        segments: segments.length,
        learningExposed: learningSegments.length,
        profilePublications: 0 as const,
      }),
      disposed,
    });
  }

  const api: LiveModeSegments = {
    version: LIVE_THREE_MODES_VERSION,
    beginTick(plan: LiveModeTickPlan): void {
      if (disposed) return;
      if (pending !== null) throw new Error('271 mode tick already prepared.');
      if (!Number.isSafeInteger(plan.tick) || plan.tick < 1)
        throw new Error('271 mode tick must be a positive safe integer.');
      const planValue: InterventionBoundaryPlan = Object.freeze({
        ...context,
        version: '069-boundary-plan-v1' as const,
        tick: plan.tick,
        timing: 'PREPARED_BEFORE_NEXT_TICK' as const,
        nextIdentity: plan.nextVehicleId === null ? null : bodyIdentity(plan.nextVehicleId),
        nextMode: plan.nextMode,
        reason: plan.reason,
        cause: null,
        targetChange: null,
      });
      const ticket = lifecycle.prepare(planValue);
      pending = Object.freeze({ ticket, plan });
      prepares += 1;
    },
    settleTick(plan: LiveModeTickPlan, acceptedVehicle: LiveModeVehicleContext | null): void {
      if (disposed || pending === null) return;
      if (pending.plan.tick !== plan.tick)
        throw new Error('271 mode settle tick does not match the prepared tick.');
      const ticket = pending.ticket;
      lifecycle.bindAcceptedPhase(ticket);
      lifecycle.settle(ticket);
      settles += 1;
      const state = lifecycle.observe();
      if (state.active !== null) {
        if (!contexts.has(state.active.segmentId) && acceptedVehicle !== null)
          contexts.set(state.active.segmentId, acceptedVehicle);
        remember(state.active.segmentId);
      }
      if (state.lastClosed !== null) remember(state.lastClosed.segmentId);
      pending = null;
    },
    rejectTick(plan: LiveModeTickPlan): void {
      if (disposed || pending === null) return;
      if (pending.plan.tick !== plan.tick)
        throw new Error('271 mode reject tick does not match the prepared tick.');
      lifecycle.reject(pending.ticket);
      rejects += 1;
      pending = null;
    },
    observe: observeInternal,
    learningExposure: () => observeInternal().learning,
    retire(
      reason: Extract<LiveModeCloseReason, 'SESSION_CHANGE' | 'WORLD_RESET' | 'SHUTDOWN'>,
    ): boolean {
      if (disposed) return false;
      if (pending !== null) throw new Error('271 cannot retire a pending mode tick.');
      const state = lifecycle.observe();
      if (state.active === null) return false;
      const tick = state.acceptedTick;
      const identity = bodyIdentity(state.active.identity.entityId);
      const cause = causeOf(reason, tick, identity);
      causes.set(cause.operationId, cause);
      lifecycle.retire(cause);
      return true;
    },
    dispose(): void {
      if (disposed) return;
      if (pending !== null) {
        try {
          lifecycle.reject(pending.ticket);
        } catch {
          // A pending ticket that was already quarantined cannot be rejected; disposal still
          // releases the bounded stores and reports the owner as disposed.
        }
        pending = null;
      }
      let state: ReturnType<typeof lifecycle.observe> | null = null;
      try {
        state = lifecycle.observe();
      } catch {
        // The composition was never stepped (or already detached); the lifecycle is fresh.
      }
      if (state !== null && state.active !== null) {
        const tick = state.acceptedTick;
        const identity = bodyIdentity(state.active.identity.entityId);
        const cause = causeOf('SHUTDOWN', tick, identity);
        causes.set(cause.operationId, cause);
        lifecycle.retire(cause);
      }
      lifecycle.dispose();
      records.dispose();
      events.dispose();
      intake.dispose();
      identities.clear();
      contexts.clear();
      intakeDescriptors.clear();
      causes.clear();
      knownSegments.length = 0;
      disposed = true;
    },
  };
  return Object.freeze(api);
}
