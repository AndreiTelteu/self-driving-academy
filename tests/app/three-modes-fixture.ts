import type { ContractContext } from '../../src/sessions';
import type {
  BodyIdentity,
  ControlMode,
  VehicleCommand,
  VehicleCommandPacket,
  VehicleControlProjection,
  VehicleState,
} from '../../src/vehicles';
import { createVehicleController } from '../../src/vehicles/controller';
import { parseVehicleCommand, parseVehicleState } from '../../src/vehicles/contracts';
import {
  bindModeKeyboard,
  createControlAuthority,
  createModeControls,
  createVehicleSelection,
} from '../../src/input';
import type { VehicleSelectionPorts } from '../../src/input';
import { createManualSegmentBridge } from '../../src/app/manual-segment-bridge';
import { createPauseFocusOwner } from '../../src/app/pause-focus';
import { applyKeyRemapping, readKeyRemappingDraft } from '../../src/app/key-remapping';
import { createProfilePipeline } from '../../src/app/profile-pipeline';
import type { ProfileLearningSegment, ProfilePipeline } from '../../src/app/profile-pipeline';
import {
  createInterventionEventTransport,
  createInterventionIntake,
  createInterventionRecordStore,
  parseTelemetrySample,
} from '../../src/telemetry';
import type {
  InterventionCause,
  InterventionPorts,
  InterventionTarget,
  TelemetrySample,
} from '../../src/telemetry';
import { createCandidateProfileStore, LearningEstimatorQueue } from '../../src/learning';
import type {
  ConfidenceCandidate,
  ParameterEvidenceReadModel,
  ProfileBlendEpisode,
} from '../../src/learning';
import type { ParameterKey } from '../../src/profiles';
import { WorkerClient, WorkerResourceGovernor } from '../../src/workers';
import type { Packet, Transport } from '../../src/workers';
import {
  decodeLearningEstimateRequest,
  encodeLearningEstimateResult,
  blendProfileValue,
  LEARNING_ESTIMATE_VERSION,
} from '../../src/learning';
import { getParameterDefinition } from '../../src/profiles';
import { createDefaultSettings, createSettingsStore } from '../../src/settings';
import type { RuntimeSettings } from '../../src/settings';
import { createControlModeHud } from '../../src/ui';
import { setBinding } from '../../src/ui';
import { GovernorMemoryStore } from '../harness/governor-store';
import { createHudDocument } from '../ui/hud-dom';
import type { HudElement } from '../ui/hud-dom';
import {
  THREE_MODES_LIMITS,
  THREE_MODES_LEARNING_KEY,
  type ThreeModeKind,
  type ThreeModesClosedSegment,
  type ThreeModesHudView,
  type ThreeModesLearningResultView,
  type ThreeModesLearningView,
  type ThreeModesPhysicsSnapshot,
  type ThreeModesScenarioRequest,
  type ThreeModesSegmentSnapshot,
  type ThreeModesServices,
  type ThreeModesWorld,
  type ThreeModeVehicleRef,
} from '../../src/app/three-modes';

/** Stable 217 fixture identity; the harness reuses the same frozen tokens across fresh scenes. */
export const THREE_MODES_CONTEXT: ContractContext = Object.freeze({
  schemaVersion: 1,
  units: 'SI',
  sessionId: 'session:217',
  worldEpoch: 0,
});

export const THREE_MODES_PLAYER_ID = 'player:217';
export const THREE_MODES_PROFILE_ID = 'profile:217';
export const THREE_MODES_BASE_VERSION = 'profile-217-v1';
export const THREE_MODES_ENGINE = 'engine-217';
export const THREE_MODES_LEARNING_EPOCH = 1;
export const THREE_MODES_MAP_VERSION = 'map-neighbourhood';
export const THREE_MODES_CONTROL_PREFERENCES = 'keys-217';
export const THREE_MODES_NOW = '2026-10-22T00:00:00Z';
export const THREE_MODES_BASE_PARAMETERS: Readonly<Record<string, number>> = Object.freeze({
  speed_delta_urban: 1.5,
  following_time_headway: 1.8,
  stop_full_probability: 0.6,
});
export const THREE_MODES_BASE_PROOFS: Readonly<Record<string, number>> = Object.freeze({
  speed_delta_urban: 2,
  following_time_headway: 4,
  stop_full_probability: 0,
});

const TAXI_IDENTITY: BodyIdentity = Object.freeze({
  entityId: 'taxi:217',
  handle: 1,
  generation: 1,
});
const CIVIL_IDENTITY: BodyIdentity = Object.freeze({
  entityId: 'civil:217',
  handle: 2,
  generation: 1,
});
const SPEED_MPS = 8;
const SEGMENT_SAMPLE_CAP = 32;

/* -------------------------------------------------------------------------------------------------
 * Deterministic DOM used by the real 067 keyboard, the real 080 HUD buttons and the real 070 owner.
 * ----------------------------------------------------------------------------------------------- */

class FakeEvents {
  readonly handlers = new Map<string, Set<(event: Event) => void>>();
  addEventListener(type: string, callback: (event: Event) => void): void {
    const set = this.handlers.get(type) ?? new Set();
    set.add(callback);
    this.handlers.set(type, set);
  }
  removeEventListener(type: string, callback: (event: Event) => void): void {
    this.handlers.get(type)?.delete(callback);
  }
  fire(type: string, values: Record<string, unknown> = {}): Event {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, values);
    for (const handler of [...(this.handlers.get(type) ?? [])]) handler(event);
    return event;
  }
  listenerCount(): number {
    return [...this.handlers.values()].reduce((total, set) => total + set.size, 0);
  }
}

class FakeElement extends FakeEvents {
  ownerDocument!: FakeDocument;
  isContentEditable = false;
  blocked = false;
  closest(): FakeElement | null {
    return this.blocked ? this : null;
  }
}

class FakeDocument extends FakeEvents {
  hidden = false;
  activeElement: FakeElement | null = null;
  defaultView: (FakeEvents & { HTMLElement: typeof FakeElement }) | null = null;
  hasFocus(): boolean {
    return true;
  }
  querySelector(): null {
    return null;
  }
  createElement(): FakeElement {
    return new FakeElement();
  }
}

/* -------------------------------------------------------------------------------------------------
 * Real 103 queue over a gated transport: the deterministic reply can be withheld so that the serial
 * worker is provably busy when a mode/selection/admission latency sample is taken.
 * ----------------------------------------------------------------------------------------------- */

interface GatedQueue {
  readonly queue: LearningEstimatorQueue;
  readonly governor: WorkerResourceGovernor;
  readonly starts: readonly Packet[];
  hold(value: boolean): void;
  release(): void;
  dispose(): void;
}

function createGatedQueue(engineVersion: string): GatedQueue {
  const starts: Packet[] = [];
  const tick = { now: 0 };
  const identity = {
    baseVersionId: 'unused',
    profileId: 'unused',
    learningEpoch: 0,
    sessionId: 'unused',
    worldEpoch: 0,
  };
  const held: (() => void)[] = [];
  let holding = false;
  let receive: (value: unknown) => void = () => {};
  const port: Transport = {
    send(packet) {
      if (packet.type !== 'start') return;
      identity.baseVersionId = packet.baseVersionId;
      identity.profileId = packet.profileId;
      identity.learningEpoch = packet.learningEpoch;
      identity.sessionId = packet.sessionId;
      identity.worldEpoch = packet.worldEpoch;
      starts.push(packet);
      const deliver = () => reply(packet);
      if (holding) held.push(deliver);
      else queueMicrotask(deliver);
    },
    listen(callback) {
      receive = callback;
      return () => {
        receive = () => {};
      };
    },
  };
  const client = new WorkerClient(
    port,
    () => identity,
    () => tick.now,
  );
  const store = new GovernorMemoryStore(128, 32 * 1024 * 1024);
  const governor = new WorkerResourceGovernor(client, store, () => tick.now);
  const queue = new LearningEstimatorQueue({
    governor,
    engineVersion,
    now: () => tick.now,
  });

  function resultFor(start: Packet): ArrayBuffer {
    const request = decodeLearningEstimateRequest(start.buffer);
    const blended = blendProfileValue({
      key: request.key,
      oldValue: request.baseValue,
      evidence: request.evidence,
      episodes: request.episodes,
      candidate: request.candidate,
    });
    const definition = getParameterDefinition(request.key);
    return encodeLearningEstimateResult({
      version: LEARNING_ESTIMATE_VERSION,
      key: request.key,
      baseVersionId: request.baseVersionId,
      segmentId: request.segmentId,
      learningEpoch: request.learningEpoch,
      estimate: blended.estimate,
      learningWeight: blended.learningWeight,
      resolution: blended.resolution,
      changed: blended.changed,
      min: definition.min,
      max: definition.max,
    });
  }

  function reply(start: Packet): void {
    const buffer = resultFor(start);
    receive({
      ...start,
      type: 'result',
      sequence: 1,
      buffer,
      payloadBytes: buffer.byteLength,
      ownership: 'copy',
    });
  }

  return {
    queue,
    governor,
    starts,
    hold(value: boolean): void {
      holding = value;
    },
    release(): void {
      holding = false;
      while (held.length > 0) {
        const deliver = held.shift()!;
        deliver();
      }
    },
    dispose(): void {
      queue.dispose();
      governor.dispose();
    },
  };
}

/* -------------------------------------------------------------------------------------------------
 * Learning inputs. The 094-101 estimators run inside the worker; this transport answers with the
 * real 101 blend, exactly like the shared 103 harness, so no estimator is reimplemented here.
 * ----------------------------------------------------------------------------------------------- */

function learningEvidence(key: ParameterKey, distinctEpisodes = 16): ParameterEvidenceReadModel {
  return {
    key,
    status: 'READY',
    distinctEpisodes,
    contextBreakdown: [],
    sampleCount: distinctEpisodes,
    quality: 1,
    uncertainty: 'MODERATE',
    unchanged: true,
    noEstimate: null,
  } as ParameterEvidenceReadModel;
}

function learningEpisodes(count: number, value: number, prefix: string): ProfileBlendEpisode[] {
  return Array.from({ length: count }, (_, index) => ({
    opportunityId: `${prefix}-${index + 1}`,
    occurrence: 1,
    observedTicks: 600,
    ageSeconds: 0,
    value,
  }));
}

function learningCandidate(key: ParameterKey, value: number): ConfidenceCandidate {
  return { key, status: 'CANDIDATE', value };
}

/* -------------------------------------------------------------------------------------------------
 * One scene over the real modules.
 * ----------------------------------------------------------------------------------------------- */

interface WorldInternals {
  readonly world: ThreeModesWorld;
}

function createWorld(request: ThreeModesScenarioRequest): WorldInternals {
  const context = THREE_MODES_CONTEXT;
  const vehicles: ThreeModeVehicleRef[] = [
    request.primary,
    ...(request.secondary === null ? [] : [request.secondary]),
  ];
  const identities = new Map<string, BodyIdentity>(
    vehicles.map((vehicle) => [vehicle.identity.entityId, vehicle.identity]),
  );
  const bodyIdentity = (id: string): BodyIdentity | undefined => identities.get(id);
  const primary = request.primary.identity;
  const profileId = THREE_MODES_PROFILE_ID;
  const playerId = THREE_MODES_PLAYER_ID;

  let selected: BodyIdentity | null = primary;
  let camera: BodyIdentity | null = primary;
  let eligibility: boolean | null = request.learningEligible;
  let paused = false;

  const settingsStore = createSettingsStore(createDefaultSettings(playerId));
  let settings: RuntimeSettings = settingsStore.getSnapshot();

  const controller = createVehicleController(context, {
    bodyIdentity,
    step() {
      return {
        controllerMs: 0,
        stepMs: 0,
        queryMs: 0,
        bridgeMs: 0,
        totalMs: 0,
        queryCount: 0,
        bridgeCalls: 0,
      };
    },
  });
  const authority = createControlAuthority(context, controller, {
    bodyIdentity,
    clearOldPlayer: () => undefined,
  });

  const profileStore = createCandidateProfileStore({
    engineVersion: THREE_MODES_ENGINE,
    now: () => THREE_MODES_NOW,
  });
  const created = profileStore.createBase({
    profileId,
    versionId: THREE_MODES_BASE_VERSION,
    parameters: THREE_MODES_BASE_PARAMETERS,
    createdAt: THREE_MODES_NOW,
  });
  if (created.status !== 'ACCEPTED')
    throw new Error(`217 fixture base version rejected: ${created.rejection.code}`);

  const gated = createGatedQueue(THREE_MODES_ENGINE);
  let pipeline: ProfilePipeline | null = null;
  const pipelineRef = (): ProfilePipeline => {
    if (pipeline === null) throw new Error('217 fixture pipeline is not mounted');
    return pipeline;
  };

  const modes = createModeControls(context, {
    readAuthority: () => authority.getStats(),
    selectedIdentity: () => selected,
    bodyIdentity,
    eligibility: (identity, factContext, tick) => {
      const value = (): boolean | null => eligibility;
      return {
        ...factContext,
        version: '067-mode-eligibility-v1' as const,
        tick,
        identity,
        eligible: value(),
      };
    },
  });

  const records = createInterventionRecordStore(context);
  const events = createInterventionEventTransport(context);
  const intake = createInterventionIntake(context);
  const causes = new Map<string, InterventionCause>();
  const target = (): InterventionTarget =>
    Object.freeze({
      ...context,
      version: '069-intervention-target-v1' as const,
      playerId,
      profileId,
      baseVersionId: THREE_MODES_BASE_VERSION,
      learningEpoch: THREE_MODES_LEARNING_EPOCH,
      controlPreferencesVersion: THREE_MODES_CONTROL_PREFERENCES,
      engineVersion: THREE_MODES_ENGINE,
      mapVersion: THREE_MODES_MAP_VERSION,
      inputType: 'KEYBOARD' as const,
      learningEligible: eligibility === true,
    });

  const ports: Omit<InterventionPorts, 'readAuthority'> = {
    bodyIdentity,
    readTarget: target,
    preparedCause: (operationId: string) => causes.get(operationId) ?? null,
    preparedTarget: () => null,
    records: records.port,
    events: events.port,
    reserveIntake: (descriptor) => intake.reserve(descriptor),
    rejectIntake: (operationId) => intake.reject(operationId),
    inspectIntake: (operationId) => intake.inspect(operationId),
    acceptIntake: (descriptor) => intake.accept(descriptor),
    acknowledgeIntake(operationId: string) {
      const receipt = intake.inspect(operationId);
      if (receipt === null || !receipt.accepted) throw new Error('217 missing intake receipt');
      intake.acknowledge(receipt);
    },
    inspectIntakeRelease: (operationId) => intake.inspectRelease(operationId),
  };
  const bridge = createManualSegmentBridge(
    context,
    `three-modes:${request.scenarioId}`,
    authority,
    ports,
  );

  const selectionPorts: VehicleSelectionPorts = {
    readAuthority: () => authority.getStats(),
    bodyIdentity,
    readPresentation: (identity) => {
      const vehicle = vehicles.find((entry) => entry.identity === identity);
      return {
        identity,
        kind: vehicle?.kind ?? 'TAXI',
        visible: true,
        selectable: true,
      };
    },
    readCameraTarget: () => camera,
    selectCamera: (identity) => {
      camera = identity;
    },
    clearInput: () => undefined,
    readAssignment: (identity) => ({
      context,
      identity,
      routeFingerprint: `route:${identity.entityId}`,
      tripFingerprint: `trip:${identity.entityId}`,
    }),
    readBoundary: (identity) => bridge.selectionBoundary.readBoundary(identity),
    closeBoundary: (event) => bridge.selectionBoundary.closeBoundary(event),
  };
  const selection = createVehicleSelection(context, selectionPorts);
  bridge.bind(modes, selection);

  for (const vehicle of vehicles) {
    authority.register(vehicle.identity);
    selection.register(vehicle.identity, vehicle.kind === 'TAXI' ? 'TAXI' : 'CIVIL');
  }

  pipeline = createProfilePipeline({
    engineVersion: THREE_MODES_ENGINE,
    playerId,
    profileId,
    learningEpoch: THREE_MODES_LEARNING_EPOCH,
    sessionId: context.sessionId,
    worldEpoch: context.worldEpoch,
    queue: gated.queue,
    store: profileStore,
    tick: () => authority.getStats().tick,
  });

  function headParameter(): number {
    const head = profileStore.getVersion(pipelineRef().head());
    return (
      head?.parameters[THREE_MODES_LEARNING_KEY] ??
      THREE_MODES_BASE_PARAMETERS[THREE_MODES_LEARNING_KEY]
    );
  }

  /* ---------------------------------------------------------------- visual surfaces (067 / 080) */

  const doc = new FakeDocument();
  const win = Object.assign(new FakeEvents(), { HTMLElement: FakeElement });
  doc.defaultView = win;
  const surface = new FakeElement();
  surface.ownerDocument = doc as never;
  doc.activeElement = surface;

  const keyboard = bindModeKeyboard({
    surface: surface as never,
    bindings: settings.input.bindings,
    port: {
      enqueue: (action) => modes.enqueue(action),
      clear: () => modes.clear(),
    },
    enabled: () => !paused && !doc.hidden,
  });
  const hudDocument = createHudDocument();
  const hudHost = hudDocument.createElement('div') as unknown as HudElement;
  const hud = createControlModeHud(hudHost as never, {
    intent: (action, expectedIdentity) => modes.enqueue(action, expectedIdentity),
    bindings: {
      manualMode: settings.input.bindings.manualMode,
      learningMode: settings.input.bindings.learningMode,
    },
  });

  const pauseFocus = createPauseFocusOwner({
    suspend: () => {
      paused = true;
      bridge.suspend();
      keyboard.sync();
    },
    resume: () => {
      paused = false;
      bridge.resume();
      keyboard.sync();
    },
    resetHeldCommands: () => {
      keyboard.sync();
    },
  });

  /* ------------------------------------------------------------------------------- 069 tracking */

  const segmentOrder: string[] = [];
  const closedOrder: ThreeModesClosedSegment[] = [];
  let lastClosedId: string | null = null;
  let stageClosed = false;

  function recordOf(segmentId: string) {
    return records.port.read(segmentId);
  }

  function remember(segmentId: string): void {
    if (!segmentOrder.includes(segmentId)) segmentOrder.push(segmentId);
  }

  function syncSegments(): void {
    const view = bridge.lifecycle.observe();
    if (view.lastClosed !== null) {
      remember(view.lastClosed.segmentId);
      if (view.lastClosed.segmentId !== lastClosedId) {
        lastClosedId = view.lastClosed.segmentId;
        const record = recordOf(view.lastClosed.segmentId);
        if (record !== null && record.completeness === 'CLOSED' && record.endTick !== null)
          closedOrder.push(
            Object.freeze({
              segmentId: record.segmentId,
              vehicleId: record.vehicleId,
              mode: record.controlMode,
              learningEligible: record.learningEligible,
              startTick: record.startTick,
              endTick: record.endTick,
              closeReason: record.closeReason ?? 'UNKNOWN',
              samples: record.samples.length,
            }),
          );
      }
    }
    if (view.active !== null) remember(view.active.segmentId);
  }

  /* ---------------------------------------------------------------------------- physical readback */

  function physicsAt(identity: BodyIdentity, atTick: number): ThreeModesPhysicsSnapshot {
    const civil = identity.entityId === CIVIL_IDENTITY.entityId;
    const heading = civil ? Math.PI / 2 : 0;
    const distance = SPEED_MPS * (atTick / THREE_MODES_LIMITS.tickHz);
    return Object.freeze({
      tick: atTick,
      positionM: Object.freeze({
        x: (civil ? 40 : 0) + Math.cos(heading) * distance,
        y: 0,
        z: Math.sin(heading) * distance,
      }),
      speedMps: SPEED_MPS,
      headingRad: heading,
    });
  }

  function modeFor(identity: BodyIdentity): ControlMode {
    const seat = authority.getStats().seat;
    if (seat !== null && seat.identity === identity) return seat.mode;
    return 'AUTO';
  }

  function stateFor(identity: BodyIdentity, atTick: number): VehicleState {
    const physics = physicsAt(identity, atTick);
    const heading = physics.headingRad;
    return parseVehicleState({
      ...context,
      vehicleId: identity.entityId,
      classId: 'sedan',
      tick: atTick,
      transform: {
        positionM: { ...physics.positionM },
        rotationQuaternion: { x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) },
      },
      velocityMps: {
        x: Math.cos(heading) * physics.speedMps,
        y: 0,
        z: Math.sin(heading) * physics.speedMps,
      },
      laneId: null,
      controlMode: modeFor(identity),
      appliedProfileVersion: THREE_MODES_BASE_VERSION,
      maneuverState: 'IDLE',
    });
  }

  function commandFor(
    identity: BodyIdentity,
    atTick: number,
    source: 'PLAYER' | 'AUTONOMY',
  ): VehicleCommand {
    return parseVehicleCommand({
      ...context,
      vehicleId: identity.entityId,
      tick: atTick,
      source,
      throttle: source === 'PLAYER' ? 0.4 : 0.15,
      brake: 0,
      steering: 0.05,
      handbrake: false,
      turnSignal: 'OFF',
    });
  }

  function packetsFor(atTick: number): readonly VehicleCommandPacket[] {
    const packets: VehicleCommandPacket[] = [];
    for (const vehicle of vehicles) {
      packets.push({
        identity: vehicle.identity,
        command: commandFor(vehicle.identity, atTick, 'AUTONOMY'),
      });
      packets.push({
        identity: vehicle.identity,
        command: commandFor(vehicle.identity, atTick, 'PLAYER'),
      });
    }
    return packets;
  }

  function telemetryFor(
    identity: BodyIdentity,
    atTick: number,
    control: VehicleControlProjection | null,
  ): TelemetrySample {
    const state = stateFor(identity, atTick);
    const effective = control?.command ?? commandFor(identity, atTick, 'PLAYER');
    const raw = control?.raw ?? effective;
    return parseTelemetrySample({
      tick: atTick,
      state,
      command: effective,
      rawInput: {
        throttle: raw.throttle,
        brake: raw.brake,
        steering: raw.steering,
        handbrake: raw.handbrake,
      },
      longitudinalAccelerationMps2: 1.1,
      lateralAccelerationMps2: 0.05,
      capabilities: {
        maxAccelerationMps2: 6,
        maxDecelerationMps2: 8,
        maxLateralAccelerationMps2: 5,
      },
      context: {
        roadType: 'URBAN',
        speedLimitMps: 13,
        curvaturePerM: 0,
        leaderId: null,
        leaderGapM: null,
        signalId: null,
        signalState: null,
        stopLineId: null,
        distanceToStopLineM: null,
        conflictEntityIds: [],
        rideId: null,
      },
      excludedReason: null,
    });
  }

  /* -------------------------------------------------------------------------------------- ticks */

  function step(): void {
    if (paused) throw new Error('217 world is suspended; a paused world executes no tick');
    const before = authority.getStats();
    if (before.suspended) throw new Error('217 authority is suspended');
    const atTick = before.tick + 1;
    const result = bridge.step(
      {
        ...context,
        version: '066-control-authority-v1',
        tick: atTick,
        dtSeconds: THREE_MODES_LIMITS.dtSeconds,
      },
      packetsFor(atTick),
    );
    const after = authority.getStats();
    if (after.tick !== atTick) throw new Error('217 world did not accept exactly one tick');
    syncSegments();
    const view = bridge.lifecycle.observe();
    const active = view.active;
    if (active !== null) {
      const record = recordOf(active.segmentId);
      if (record !== null && record.samples.length < SEGMENT_SAMPLE_CAP) {
        const control =
          result.frame.controls.find((entry) => entry.identity === active.identity) ?? null;
        bridge.lifecycle.appendSample(
          active.identity,
          telemetryFor(active.identity, atTick, control),
        );
      }
    }
    hud.update(modes.observe(), atTick * 1000);
    pauseFocus.setMode(authority.getStats().seat?.mode ?? 'AUTO');
  }

  function segmentSnapshots(): readonly ThreeModesSegmentSnapshot[] {
    return Object.freeze(
      segmentOrder
        .map((segmentId) => recordOf(segmentId))
        .filter((record): record is NonNullable<typeof record> => record !== null)
        .map((record) =>
          Object.freeze({
            segmentId: record.segmentId,
            vehicleId: record.vehicleId,
            mode: record.controlMode,
            learningEligible: record.learningEligible,
            startTick: record.startTick,
            endTick: record.endTick,
            completeness: record.completeness,
            closeReason: record.closeReason,
            samples: record.samples.length,
          }),
        ),
    );
  }

  function descriptor(closed: ThreeModesClosedSegment): ProfileLearningSegment {
    return {
      segmentId: closed.segmentId,
      mode: closed.mode as 'MANUAL' | 'LEARNING' | 'AUTO',
      eligible: closed.learningEligible,
      order: segmentOrder.indexOf(closed.segmentId) + 1,
      key: THREE_MODES_LEARNING_KEY,
      baseValue: headParameter(),
      evidence: learningEvidence(THREE_MODES_LEARNING_KEY, 16),
      episodes: learningEpisodes(16, 4, closed.segmentId),
      candidate: learningCandidate(THREE_MODES_LEARNING_KEY, 4),
      learningEpoch: THREE_MODES_LEARNING_EPOCH,
      baseVersionId: pipelineRef().head(),
      interventionId: `intervention:${closed.segmentId}`,
      reason: `${closed.closeReason}:${closed.segmentId}`,
    };
  }

  function viewOf(result: {
    readonly segmentId: string;
    readonly mode: string;
    readonly status: string;
    readonly reason: string | null;
    readonly versionId: string | null;
    readonly jobSubmitted: boolean;
    readonly composition: { readonly key: string; readonly value: number } | null;
  }): ThreeModesLearningResultView {
    return Object.freeze({
      segmentId: result.segmentId,
      mode: result.mode,
      status: result.status,
      reason: result.reason,
      versionId: result.versionId,
      jobSubmitted: result.jobSubmitted,
      compositionKey: result.composition?.key ?? null,
      compositionValue: result.composition?.value ?? null,
    });
  }

  async function waitForBusyQueue(): Promise<void> {
    for (let attempt = 0; attempt < 64 && gated.queue.usage.active !== 1; attempt += 1)
      await Promise.resolve();
    if (gated.queue.usage.active !== 1)
      throw new Error('217 secondary job did not occupy the queue');
  }

  let secondaryOrder = 9000;

  function learningView(): ThreeModesLearningView {
    const stats = pipelineRef().stats();
    const head = profileStore.getVersion(pipelineRef().head());
    return Object.freeze({
      segments: stats.segments,
      jobs: stats.jobs,
      versions: stats.versions,
      manualSkipped: stats.manualSkipped,
      ineligibleSkipped: stats.ineligibleSkipped,
      noChange: stats.noChange,
      failed: stats.failed,
      stale: stats.stale,
      deduplicated: stats.deduplicated,
      headVersionId: pipelineRef().head(),
      storeVersions: profileStore.getHistory(profileId).length,
      headParameters: Object.freeze({ ...(head?.parameters ?? {}) }),
      queueStarts: gated.starts.length,
      queueActive: gated.queue.usage.active,
      queuePending: gated.queue.usage.pending,
      results: Object.freeze(pipelineRef().history().map(viewOf)),
    });
  }

  function hudView(): ThreeModesHudView {
    const root = hudHost.children[0];
    const text = (index: number): string => root.children[index]?.textContent ?? '';
    return Object.freeze({
      symbol: text(0),
      label: text(1),
      subject: text(2),
      eligibility: text(3),
      actionSubject: text(4),
    });
  }

  function pressCode(code: string): boolean {
    const event = doc.fire('keydown', {
      code,
      key: code,
      repeat: false,
      isComposing: false,
      metaKey: false,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
    });
    return event.defaultPrevented;
  }

  const world: ThreeModesWorld = {
    request,
    tick: () => authority.getStats().tick,
    mode: () => authority.getStats().seat?.mode ?? 'AUTO',
    seat: () => authority.getStats().seat,
    cameraTarget: () => camera,
    bindings: () => ({
      manualMode: settings.input.bindings.manualMode,
      learningMode: settings.input.bindings.learningMode,
    }),
    hud: hudView,
    pressKey(action) {
      const code =
        action === 'M' ? settings.input.bindings.manualMode : settings.input.bindings.learningMode;
      const accepted = pressCode(code);
      doc.fire('keyup', { code, key: code });
      return accepted;
    },
    keyDown: pressCode,
    remap(manualMode, learningMode) {
      const draft = readKeyRemappingDraft(settings, playerId);
      const manual = setBinding(draft, 'manualMode', manualMode);
      const learning = setBinding(manual.draft, 'learningMode', learningMode);
      const applied = applyKeyRemapping({ store: settingsStore, settings }, learning.draft);
      if (applied.status !== 'SAVED')
        throw new Error(`217 remap rejected: ${JSON.stringify(applied.reason)}`);
      settings = applied.settings;
      keyboard.remap(settings.input.bindings);
      hud.remap({
        manualMode: settings.input.bindings.manualMode,
        learningMode: settings.input.bindings.learningMode,
      });
    },
    select(identity) {
      selected = identity;
      if (identity === null) return;
      if (!selection.enqueue(identity, 'WORLD'))
        throw new Error(`217 selection enqueue refused for ${identity.entityId}`);
    },
    step,
    pause() {
      pauseFocus.setMode(authority.getStats().seat?.mode ?? 'AUTO');
      pauseFocus.setSurface('panel', true);
    },
    resume() {
      pauseFocus.setSurface('panel', false);
      pauseFocus.requestResume();
    },
    focusLost(lost) {
      pauseFocus.setFocusLost(lost);
    },
    paused: () => pauseFocus.getState().suspended,
    heldKeys: () => keyboard.getStats().heldCodes,
    physics: (identity) => physicsAt(identity, authority.getStats().tick),
    segments: segmentSnapshots,
    takeClosed() {
      const drained = [...closedOrder];
      closedOrder.length = 0;
      return Object.freeze(drained);
    },
    async submitSegment(closed) {
      const promise = pipelineRef().onSegmentClosed(descriptor(closed));
      gated.release();
      return viewOf(await promise);
    },
    async occupyQueue(segmentId) {
      const job = {
        playerId,
        profileId,
        learningEpoch: THREE_MODES_LEARNING_EPOCH,
        baseVersionId: pipelineRef().head(),
        segmentId,
        mode: 'LEARNING' as const,
        eligible: true,
        order: (secondaryOrder += 1),
        sessionId: context.sessionId,
        worldEpoch: context.worldEpoch,
        key: THREE_MODES_LEARNING_KEY,
        baseValue: headParameter(),
        evidence: learningEvidence(THREE_MODES_LEARNING_KEY, 16),
        episodes: learningEpisodes(16, 4, segmentId),
        candidate: learningCandidate(THREE_MODES_LEARNING_KEY, 4),
      };
      gated.hold(true);
      const admission = gated.queue.submit(job);
      if (admission.status !== 'QUEUED' || admission.ticket === null)
        throw new Error(
          `217 secondary job rejected: ${admission.status}/${admission.reason ?? ''}`,
        );
      await waitForBusyQueue();
    },
    learning: learningView,
    setLearningEligible(value) {
      eligibility = value;
    },
    dispose() {
      if (!stageClosed) {
        stageClosed = true;
        try {
          const view = bridge.lifecycle.observe();
          if (view.active !== null) {
            const operationId = `three-modes:${request.scenarioId}:shutdown:${authority.getStats().tick}`;
            const cause: InterventionCause = Object.freeze({
              ...context,
              version: '069-admitted-cause-v1',
              operationId,
              timing: 'AT_LAST_ACCEPTED_TICK',
              tick: authority.getStats().tick,
              identity: view.active.identity,
              reason: 'SHUTDOWN',
            });
            causes.set(operationId, cause);
            bridge.lifecycle.retire(cause);
          }
        } catch {
          /* The scene is being discarded; retirement cannot hide a reported failure. */
        }
      }
      gated.release();
      try {
        bridge.dispose();
      } catch {
        /* already reported through the harness row */
      }
      keyboard.dispose();
      hud.dispose();
      pauseFocus.dispose();
      pipeline?.dispose();
      gated.dispose();
      modes.dispose();
      selection.dispose();
      authority.dispose();
      controller.dispose();
      records.dispose();
      events.dispose();
      intake.dispose();
      profileStore.dispose();
    },
  };
  return { world };
}

export function createThreeModesServices(): ThreeModesServices {
  const vehicles: Record<ThreeModeKind, ThreeModeVehicleRef> = {
    TAXI: Object.freeze({ identity: TAXI_IDENTITY, kind: 'TAXI' as const }),
    CIVIL: Object.freeze({ identity: CIVIL_IDENTITY, kind: 'CIVIL' as const }),
  };
  return Object.freeze({
    context: THREE_MODES_CONTEXT,
    vehicles: Object.freeze(vehicles),
    createWorld(request: ThreeModesScenarioRequest): ThreeModesWorld {
      return createWorld(request).world;
    },
    profileBaseline: Object.freeze({
      values: THREE_MODES_BASE_PARAMETERS,
      proofs: THREE_MODES_BASE_PROOFS,
    }),
  });
}
