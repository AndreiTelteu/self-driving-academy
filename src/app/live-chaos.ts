import {
  attachDestructionFeedback,
  createDestructionCatalog,
  createDestructionReplay,
  deriveDestructionReaction,
  destructionReactionFingerprint,
  DESTRUCTION_FEEDBACK_LIMITS,
  type AudioEngine,
  type DestructionCatalog,
  type DestructionFeedback,
  type DestructionFeedbackSettings,
  type DestructionIntensity,
  type DestructionMaterial,
  type DestructionReaction,
  type DestructionSinkStats,
  type DestructionVisualVariant,
} from '../audio';
import {
  createWorldRecorder,
  readWorldReplayChunk,
  type WorldRecorder,
  type WorldReplayChunk,
} from '../replay';
import { createStableId, requireContract, tick as readTick } from '../sessions';
import type { ContractContext } from '../sessions';
import { createEventBus } from '../simulation';
import type { EventBus, SimulationEvent } from '../simulation';
import {
  createDestructibleDecor,
  createDestructiblePlayground,
  DESTRUCTIBLE_ARCHETYPES,
  DESTRUCTIBLE_BROKEN_EVENT,
  DESTRUCTIBLE_LIMITS,
  type CityLayout,
  type DestructibleArchetype,
  type DestructibleDecor,
  type DestructibleDefinition,
  type DestructibleImpactResult,
  type DestructiblePlayground,
  type DestructibleState,
  type PresentationPreset,
} from '../world';
import type { CollisionIncident, LivePhysicsObstacle, LivePhysicsObstacleStats } from '../vehicles';
import type { Vector3 } from '../vehicles';

/**
 * PBI 285 — live destructible decor, material audio and replay truth.
 *
 * This composition is the missing bridge between four real owners and nothing else:
 *
 * - 227 owns the destructible state machine, the definitions, the spatial index and the generation;
 * - 228 owns the derived material reaction, the material sound on the 148 `impact` cue and the
 *   fragment/voice caps;
 * - 207 owns the sealed replay chunk and its checksum; 228's replay consumes that chunk;
 * - 282 owns the one Rapier world. This module only requests bounded named obstacle bindings for the
 *   nearest logical objects and reads the real 028 incidents the same step drained.
 *
 * It never creates a second physics world, a second event ledger or a second reward path. A reset
 * restores the 227 decor and records a real `WORLD_RESET`; it never writes XP or a profile.
 */

export const LIVE_CHAOS_VERSION = '285-live-chaos-v1' as const;

export const LIVE_CHAOS_DEFAULTS = Object.freeze({
  /** The 028 registry has 96 named obstacles in total; buildings already use 90 on this map. */
  maxPhysicalObstacles: 6,
  physicalRadiusM: 48,
  maxAudibleVehicles: 6,
  maxRetainedReactions: 24,
  maxProcessedIncidents: 256,
  maxReplayChunks: 8,
  brakeSquealDecelerationMps2: 3.5,
  tyreScreechLateralMps2: 4,
  oneShotIntervalTicks: 30,
  maxCostSamples: 600,
});

export interface LiveChaosVehicleSample {
  readonly vehicleId: string;
  readonly driverKind: 'TAXI' | 'CIVILIAN';
  readonly positionM: Readonly<{ x: number; y: number; z: number }>;
  readonly yawRad: number;
  readonly speedMps: number;
  readonly controlMode: 'AUTO' | 'MANUAL' | 'LEARNING';
  readonly isPlayer: boolean;
}

export interface LiveChaosStepInput {
  readonly tick: number;
  readonly vehicles: readonly LiveChaosVehicleSample[];
  readonly listenerPositionM?: Vector3 | null;
  /**
   * Real 028 incidents. The live caller normally omits this and the physics port supplies them;
   * the deterministic report passes the exact incidents it expects the same path to process.
   */
  readonly incidents?: readonly CollisionIncident[];
}

/**
 * A probe-only injected contact. It travels the exact live path (028-shaped incident, 227 impact,
 * 228 feedback, 207 recording) but it is not a native car contact; the browser evidence labels it
 * as `PROBE_INJECTED` instead of claiming a driven collision.
 */
export interface LiveChaosProbeImpact {
  readonly objectId: string;
  readonly impulseNs: number;
  readonly tick?: number;
  readonly vehicleId?: string;
  readonly controlSource?: 'AUTO' | 'MANUAL' | 'LEARNING';
}

/** Structural subset of the 282 live owner, so the composition cannot grow a second physics world. */
export interface LiveChaosPhysicsPort {
  addObstacle(input: LivePhysicsObstacle): boolean;
  moveObstacle(
    id: string,
    centerM: Readonly<{ x: number; y: number; z: number }>,
    yawRad: number,
  ): boolean;
  removeObstacle(id: string): boolean;
  hasObstacle(id: string): boolean;
  readIncidents(): readonly CollisionIncident[];
  getStats(): Readonly<{ obstacles: LivePhysicsObstacleStats }>;
}

export interface LiveChaosOptions {
  readonly context: ContractContext;
  readonly layout: CityLayout;
  readonly eventBus?: EventBus;
  readonly engine?: AudioEngine;
  readonly physics?: LiveChaosPhysicsPort;
  readonly settings?: Partial<DestructionFeedbackSettings>;
  readonly maxPhysicalObstacles?: number;
  readonly physicalRadiusM?: number;
  readonly fragmentPoolCapacity?: number;
  readonly maxReactionsPerIncident?: number;
  readonly clock?: () => number;
  readonly now?: () => string;
  /** The real 213 balance; read only, to prove a reset does not withdraw XP. */
  readonly xpMicroXp?: () => number;
  /** The real 109 active profile fingerprint; read only, to prove a reset does not touch it. */
  readonly profileFingerprint?: () => string;
  /** Presentation callback for the HUD; it never feeds back into the simulation. */
  readonly onReaction?: (reaction: LiveChaosReaction) => void;
}

export interface LiveChaosReaction {
  readonly sequence: number;
  readonly tick: number;
  readonly eventId: string;
  readonly objectId: string;
  readonly archetype: DestructibleArchetype;
  readonly material: DestructionMaterial;
  readonly intensity: DestructionIntensity;
  readonly variant: DestructionVisualVariant;
  readonly symbol: string;
  readonly text: string;
  readonly positionM: Vector3;
  readonly fragments: number;
  readonly audioPlayed: boolean;
  readonly audioReason: string;
  /** True when the information is presented without a played sound; the visual never depends on it. */
  readonly visualAlternative: boolean;
  readonly fingerprint: string;
}

export interface LiveChaosObjectView {
  readonly objectId: string;
  readonly archetype: DestructibleArchetype;
  readonly state: DestructibleState;
  readonly positionM: Vector3;
  readonly headingRad: number;
  readonly displacementM: number;
  readonly obstacleClass: 'LIGHT' | 'LARGE';
  readonly physical: boolean;
}

export interface LiveChaosVisualFrame {
  readonly version: typeof LIVE_CHAOS_VERSION;
  readonly tick: number;
  readonly generation: number;
  readonly objects: readonly LiveChaosObjectView[];
  /** Reactions collected since the previous visual call; the renderer spawns each exactly once. */
  readonly reactions: readonly LiveChaosReaction[];
  readonly lastReaction: LiveChaosReaction | null;
  readonly audioState: string;
  readonly audioFallback: boolean;
  readonly fragmentLifetimeTicks: number;
  readonly fragmentPoolCap: number;
  readonly resets: number;
}

export interface LiveChaosResetReport {
  readonly status: 'RESET';
  readonly tick: number;
  readonly generation: number;
  readonly resets: number;
  readonly restored: number;
  readonly kept: number;
  readonly worldResetEventId: string;
  readonly replayChunkId: string | null;
  readonly xpMicroXpBefore: number | null;
  readonly xpMicroXpAfter: number | null;
  readonly profileFingerprintBefore: string | null;
  readonly profileFingerprintAfter: string | null;
  readonly xpDeltaMicroXp: number;
  readonly profileChanged: boolean;
  readonly xpWithdrawn: boolean;
}

export interface LiveChaosReplayCheck {
  readonly status: 'REPLAYED' | 'REFUSED';
  readonly version: string;
  readonly chunkId: string | null;
  readonly recordedEvents: number;
  readonly replayedEvents: number;
  readonly destructionEvents: number;
  readonly resetEvents: number;
  readonly recordedEventIds: readonly string[];
  readonly replayedEventIds: readonly string[];
  readonly orderIdentical: boolean;
  readonly eventsIdentical: boolean;
  readonly reactionFingerprints: readonly string[];
  readonly stepsSimulation: 0;
  readonly physicsSteps: 0;
  readonly policyEvaluations: 0;
  readonly awardsGranted: 0;
  readonly learningArtifacts: 0;
  readonly absentEvents: number;
  readonly detail: string | null;
}

export interface LiveChaosStats {
  readonly version: typeof LIVE_CHAOS_VERSION;
  readonly tick: number;
  readonly generation: number;
  readonly objects: number;
  readonly objectsByState: Readonly<Record<DestructibleState, number>>;
  readonly objectsByArchetype: Readonly<Record<DestructibleArchetype, number>>;
  readonly definitions: number;
  readonly bodies: number;
  readonly colliders: number;
  readonly physicalObstacles: number;
  readonly physicalCapacity: number;
  readonly physicalAvailable: number;
  readonly fragments: DestructionSinkStats;
  readonly feedback: ReturnType<DestructionFeedback['getStats']>;
  readonly audio: ReturnType<AudioEngine['getStats']> | null;
  readonly audioState: string;
  readonly bus: Readonly<{
    retainedEvents: number;
    listeners: number;
    watermarkTick: number;
  }>;
  readonly recorder: Readonly<{
    eventsRecorded: number;
    eventsRejected: number;
    incidentsRegistered: number;
    incidentsSealed: number;
    chunksRetained: number;
    chargedBytes: number;
    peakChargedBytes: number;
    replayChunks: number;
  }>;
  readonly reactions: number;
  readonly lastReaction: LiveChaosReaction | null;
  readonly impacts: number;
  readonly impactsBySource: Readonly<Record<'MANUAL' | 'LEARNING' | 'AUTO', number>>;
  readonly brokenEvents: number;
  readonly duplicateBreaks: number;
  readonly chainBreaks: number;
  readonly resets: number;
  readonly replayChecks: number;
  readonly cost: Readonly<{
    samples: number;
    meanMs: number;
    p95Ms: number;
    maxMs: number;
  }>;
  readonly caps: Readonly<{
    objects: number;
    fragments: number;
    reactionsPerIncident: number;
    retainedReactions: number;
    retainedEvents: number;
    replayEvents: number;
    physicalObstacles: number;
    audioVoices: number;
    audioImpactVoices: number;
    audioBuffers: number;
  }>;
  readonly assets: Readonly<{
    definitions: number;
    archetypes: number;
    fragmentPresets: number;
    audioCue: 'impact';
    audioBufferBytes: number;
    heapBytes: null;
  }>;
  readonly listeners: number;
  readonly disposed: boolean;
}

export interface LiveChaos {
  readonly version: typeof LIVE_CHAOS_VERSION;
  /** The real 227 plan derived from the layout, exposed read-only for the renderer and evidence. */
  readonly plan: DestructiblePlayground;
  readonly decor: DestructibleDecor;
  readonly context: ContractContext;
  readonly eventBus: EventBus;
  step(input: LiveChaosStepInput): LiveChaosStats;
  visual(): LiveChaosVisualFrame;
  setSettings(patch: Partial<DestructionFeedbackSettings>): DestructionFeedbackSettings;
  setPresentationPreset(preset: PresentationPreset): void;
  reset(atTick: number): LiveChaosResetReport;
  /** Probe-only impact through the same live path; never called by gameplay. */
  probeImpact(input: LiveChaosProbeImpact): DestructibleImpactResult | null;
  replayChunks(): readonly Readonly<{
    chunkId: string;
    sequence: number;
    startTick: number;
    endTick: number;
    events: number;
    bytes: number;
    completeness: string;
  }>[];
  checkReplay(chunkIndex?: number): LiveChaosReplayCheck;
  getStats(): LiveChaosStats;
  dispose(): void;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  const rounded = Math.round(value * scale) / scale;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function quantile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  return sorted[
    Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))))
  ]!;
}

function costSummary(samples: readonly number[]) {
  if (samples.length === 0) return Object.freeze({ samples: 0, meanMs: 0, p95Ms: 0, maxMs: 0 });
  const sorted = [...samples].sort((left, right) => left - right);
  return Object.freeze({
    samples: sorted.length,
    meanMs: round(sorted.reduce((total, value) => total + value, 0) / sorted.length, 4),
    p95Ms: round(quantile(sorted, 0.95), 4),
    maxMs: round(sorted[sorted.length - 1]!, 4),
  });
}

function colliderOf(definition: DestructibleDefinition) {
  return Object.freeze({
    x: definition.collider.radiusM,
    y: definition.collider.heightM / 2,
    z: definition.collider.radiusM,
  });
}

function obstacleInput(
  definition: DestructibleDefinition,
  positionM: Vector3,
): LivePhysicsObstacle {
  return Object.freeze({
    id: definition.objectId,
    centerM: Object.freeze({
      x: positionM.x,
      y: definition.collider.heightM / 2,
      z: positionM.z,
    }),
    halfExtentsM: colliderOf(definition),
  });
}

function distance2D(
  a: Readonly<{ x: number; z: number }>,
  b: Readonly<{ x: number; z: number }>,
): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function rotationFor(yawRad: number) {
  return Object.freeze({
    x: 0,
    y: Math.sin(yawRad / 2),
    z: 0,
    w: Math.cos(yawRad / 2),
  });
}

export function createLiveChaos(options: LiveChaosOptions): LiveChaos {
  const sessionId = options.context.sessionId;
  const layout = options.layout;
  requireContract(layout !== null && typeof layout === 'object', 'The live chaos needs a layout');
  const plan = createDestructiblePlayground(layout);
  const catalog: DestructionCatalog = createDestructionCatalog(plan.definitions);
  const engine = options.engine;
  const physics = options.physics;
  const clock = options.clock ?? (() => performance.now());
  const ownsBus = options.eventBus === undefined;
  let context: ContractContext = Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    sessionId,
    worldEpoch: readTick(options.context.worldEpoch),
  });
  let bus: EventBus =
    options.eventBus ??
    createEventBus({
      sessionId,
      worldEpoch: context.worldEpoch,
      maxEventsPerEpoch: 10_000,
      maxListeners: 8,
    });
  const busStats = bus.getStats();
  requireContract(
    busStats.sessionId === context.sessionId && busStats.worldEpoch === context.worldEpoch,
    'The live chaos event bus belongs to a stale or foreign world',
  );
  let decor: DestructibleDecor = createDestructibleDecor({ context, eventBus: bus, layout, plan });
  let recorder: WorldRecorder = createWorldRecorder({
    sessionId,
    worldEpoch: context.worldEpoch,
    versions: Object.freeze({
      engineVersion: LIVE_CHAOS_VERSION,
      physicsVersion: '282-live-rapier-v1',
      mapVersion: layout.mapId,
    }),
    tickHz: 60,
    sampleHz: 20,
    now: options.now,
  });
  let feedback: DestructionFeedback = attachDestructionFeedback({
    context,
    eventBus: bus,
    catalog,
    ...(engine === undefined ? {} : { engine }),
    ...(options.settings === undefined ? {} : { settings: options.settings }),
    ...(options.fragmentPoolCapacity === undefined
      ? {}
      : { fragmentPoolCapacity: options.fragmentPoolCapacity }),
    ...(options.maxReactionsPerIncident === undefined
      ? {}
      : { maxReactionsPerIncident: options.maxReactionsPerIncident }),
  });
  let unsubscribeRecorder: () => void = () => undefined;
  let unsubscribeVisual: () => void = () => undefined;

  const maxPhysicalObstacles = Math.min(
    options.maxPhysicalObstacles ?? LIVE_CHAOS_DEFAULTS.maxPhysicalObstacles,
    DESTRUCTIBLE_LIMITS.maxObjects,
  );
  requireContract(
    Number.isSafeInteger(maxPhysicalObstacles) && maxPhysicalObstacles > 0,
    'The physical obstacle window must be a positive integer',
  );
  const physicalRadiusM = options.physicalRadiusM ?? LIVE_CHAOS_DEFAULTS.physicalRadiusM;
  requireContract(physicalRadiusM > 0, 'The physical obstacle radius must be positive');

  const byId = new Map(plan.definitions.map((definition) => [definition.objectId, definition]));
  const physical = new Map<
    string,
    Readonly<{ definition: DestructibleDefinition; lastMoveTick: number }>
  >();
  const processedIncidents: string[] = [];
  const processedSet = new Set<string>();
  const pendingReactions: LiveChaosReaction[] = [];
  const replayChunks: WorldReplayChunk[] = [];
  const costs: number[] = [];
  const lastSpeeds = new Map<string, number>();
  const lastYaws = new Map<string, number>();
  const oneShotTicks = new Map<string, number>();
  const xpMicroXp = options.xpMicroXp;
  const profileFingerprint = options.profileFingerprint;
  const impactsBySource = { MANUAL: 0, LEARNING: 0, AUTO: 0 };
  let settings: DestructionFeedbackSettings = feedback.getStats().settings;
  let currentTick = 0;
  let lastStepTick = -1;
  let generation = decor.getStats().generation;
  let resets = 0;
  let reactions = 0;
  let impacts = 0;
  let replayChecks = 0;
  let lastReaction: LiveChaosReaction | null = null;
  const pendingIncidentIds: string[] = [];
  const pendingIncidentSet = new Set<string>();
  let disposed = false;
  let lastAudioPlayed = 0;
  let visualFallback = false;

  const assertLive = (): void => {
    requireContract(!disposed, 'The live chaos composition is disposed');
  };

  const rememberIncident = (incidentId: string): void => {
    processedIncidents.push(incidentId);
    processedSet.add(incidentId);
    while (processedIncidents.length > LIVE_CHAOS_DEFAULTS.maxProcessedIncidents) {
      const dropped = processedIncidents.shift();
      if (dropped !== undefined) processedSet.delete(dropped);
    }
  };

  const publishCollision = (incident: CollisionIncident): void => {
    // The exact 028 incident becomes the real 007 COLLISION of this world. The recorder pins its
    // replay window on it; no second collision model and no invented event is created.
    bus.publish(
      Object.freeze({
        schemaVersion: 1 as const,
        units: 'SI' as const,
        sessionId: context.sessionId,
        worldEpoch: context.worldEpoch,
        eventId: incident.incidentId,
        tick: incident.tick,
        entityIds: Object.freeze([incident.vehicleId, incident.otherEntityId]),
        type: 'COLLISION' as const,
        payload: Object.freeze({
          vehicleId: incident.vehicleId,
          otherEntityId: incident.otherEntityId,
          impulseNs: incident.impulseNs,
        }),
      }),
    );
  };

  // The 207 recorder sees the same validated 007 events the bus delivers. 228's feedback already
  // has its own listener; the recorder is a consumer, never a second ledger.
  const attachConsumers = (): void => {
    unsubscribeRecorder = bus.subscribe(
      (event) => {
        if (disposed) return;
        if (
          event.type !== DESTRUCTIBLE_BROKEN_EVENT &&
          event.type !== 'WORLD_RESET' &&
          event.type !== 'COLLISION'
        )
          return;
        const result = recorder.recordEvent(event);
        if (result.status === 'RECORDED' && result.incidentId !== null) {
          if (!pendingIncidentSet.has(result.incidentId)) {
            pendingIncidentSet.add(result.incidentId);
            pendingIncidentIds.push(result.incidentId);
          }
        }
      },
      { order: 20 },
    );
    /**
     * The visual twin of the 228 reaction. It is derived from the same event and catalog, runs after
     * the 228 listener, and never creates a sound, a fragment pool or a state transition.
     */
    unsubscribeVisual = bus.subscribe(
      (event) => {
        if (disposed) return;
        if (event.type !== DESTRUCTIBLE_BROKEN_EVENT) return;
        const result = deriveDestructionReaction({
          event: {
            eventId: event.eventId,
            tick: event.tick,
            objectId: event.payload.objectId,
            instigatorId: event.payload.instigatorId,
            impulseNs: event.payload.impulseNs,
          },
          catalog,
          settings,
          listenerPositionM: null,
        });
        if (result.status !== 'REACTION') return;
        const reaction = result.reaction;
        const sink = feedback.getStats().presentation;
        const played = sink.audioPlayed > lastAudioPlayed;
        if (played) lastAudioPlayed = sink.audioPlayed;
        visualFallback = !played;
        const variant: DestructionVisualVariant = played ? reaction.visual.variant : 'SHOCK_RING';
        const entry: LiveChaosReaction = Object.freeze({
          sequence: reactions,
          tick: reaction.tick,
          eventId: reaction.eventId,
          objectId: reaction.objectId,
          archetype: reaction.archetype,
          material: reaction.material,
          intensity: reaction.intensity,
          variant,
          symbol: reaction.visual.symbol,
          text: reaction.visual.text,
          positionM: reaction.positionM,
          fragments: variant === 'SHOCK_RING' ? 0 : reaction.fragments.count,
          audioPlayed: played,
          audioReason: played
            ? 'PLAYED'
            : engine === undefined
              ? 'NO_ENGINE'
              : engine.getStats().state === 'RUNNING'
                ? 'DROPPED'
                : 'AWAITING_GESTURE',
          visualAlternative: !played,
          fingerprint: destructionReactionFingerprint(reaction),
        });
        reactions += 1;
        lastReaction = entry;
        pendingReactions.push(entry);
        while (pendingReactions.length > LIVE_CHAOS_DEFAULTS.maxRetainedReactions)
          pendingReactions.shift();
        options.onReaction?.(entry);
      },
      { order: 30 },
    );
  };

  const syncPhysical = (listener: Vector3 | null): void => {
    if (physics === undefined) return;
    const stats = physics.getStats();
    const capacity = Math.min(maxPhysicalObstacles, stats.obstacles.capacity);
    const selected = new Set<string>();
    if (listener !== null) {
      const candidates = plan.definitions
        .map((definition) => {
          const state = decor.getState(definition.objectId);
          return { definition, state, distance: distance2D(state.positionM, listener) };
        })
        .filter(
          (entry) =>
            entry.state.state !== 'BROKEN' &&
            entry.state.bodyAdmitted &&
            entry.distance <= physicalRadiusM,
        )
        .sort(
          (left, right) =>
            left.distance - right.distance ||
            (left.definition.objectId < right.definition.objectId ? -1 : 1),
        )
        .slice(0, capacity);
      for (const entry of candidates) selected.add(entry.definition.objectId);
    }
    for (const objectId of [...physical.keys()]) {
      if (selected.has(objectId)) continue;
      physics.removeObstacle(objectId);
      physical.delete(objectId);
    }
    for (const objectId of selected) {
      const definition = byId.get(objectId);
      if (definition === undefined) continue;
      const state = decor.getState(objectId);
      if (!state.bodyAdmitted) continue;
      const existing = physical.get(objectId);
      if (existing === undefined) {
        if (physics.addObstacle(obstacleInput(definition, state.positionM)))
          physical.set(objectId, Object.freeze({ definition, lastMoveTick: currentTick }));
        continue;
      }
      if (existing.lastMoveTick !== currentTick && physics.hasObstacle(objectId)) {
        physics.moveObstacle(
          objectId,
          Object.freeze({
            x: state.positionM.x,
            y: definition.collider.heightM / 2,
            z: state.positionM.z,
          }),
          state.headingRad,
        );
        physical.set(objectId, Object.freeze({ definition, lastMoveTick: currentTick }));
      }
    }
    // Prefer the nearest free slots: an object that broke this tick is released immediately.
  };

  const applyIncident = (
    incident: CollisionIncident,
    vehicles: ReadonlyMap<string, LiveChaosVehicleSample>,
  ): DestructibleImpactResult | null => {
    if (processedSet.has(incident.incidentId)) return null;
    rememberIncident(incident.incidentId);
    publishCollision(incident);
    const vehicle = vehicles.get(incident.vehicleId);
    const listener = vehicle?.positionM ?? null;
    const prefix = 'destructible:';
    const objectId = incident.otherEntityId.startsWith(prefix)
      ? incident.otherEntityId.slice(prefix.length)
      : null;
    const definition = objectId === null ? undefined : byId.get(objectId);
    if (definition === undefined || objectId === null) {
      // A wall or another named world obstacle: the real 028 impact still sounds, but it never
      // becomes a destructible state or a 227 event.
      if (engine !== undefined && vehicle !== undefined) {
        engine.handleImpact({
          eventId: incident.incidentId,
          tick: incident.tick,
          vehicleId: incident.vehicleId,
          otherEntityId: incident.otherEntityId,
          impulseNs: incident.impulseNs,
          distanceM:
            listener === null
              ? 35
              : Math.hypot(vehicle.positionM.x - listener.x, vehicle.positionM.z - listener.z),
        });
      }
      return null;
    }
    impacts += 1;
    const source = vehicle?.controlMode ?? 'AUTO';
    impactsBySource[source] += 1;
    const result: DestructibleImpactResult = decor.applyImpact({
      tick: incident.tick,
      objectId,
      impulseNs: incident.impulseNs,
      pointM: vehicle?.positionM ?? definition.initialTransform.positionM,
      instigatorId: incident.vehicleId,
      controlSource: source,
    });
    void listener;
    return result;
  };

  const updateAudio = (
    vehicles: readonly LiveChaosVehicleSample[],
    listener: Vector3 | null,
    atTick: number,
  ): void => {
    if (engine === undefined || listener === null) return;
    const ranked = [...vehicles]
      .map((vehicle) => ({ vehicle, distance: distance2D(vehicle.positionM, listener) }))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, LIVE_CHAOS_DEFAULTS.maxAudibleVehicles);
    const audible = new Set<string>();
    for (const { vehicle, distance } of ranked) {
      if (distance > 35) continue;
      audible.add(vehicle.vehicleId);
      const previousSpeed = lastSpeeds.get(vehicle.vehicleId) ?? vehicle.speedMps;
      const deceleration = Math.max(0, (previousSpeed - vehicle.speedMps) * 60);
      const previousYaw = lastYaws.get(vehicle.vehicleId) ?? vehicle.yawRad;
      const yawRate = Math.abs(vehicle.yawRad - previousYaw) * 60;
      const lateral = Math.abs(yawRate * Math.max(0, vehicle.speedMps));
      const brakeFactor = clamp01(deceleration / 8);
      const slipFactor = clamp01(lateral / 9.81);
      engine.updateVehicle({
        entityId: vehicle.vehicleId,
        speedMps: vehicle.speedMps,
        loadFactor: clamp01(vehicle.speedMps / 12),
        brakeFactor,
        slipFactor,
        distanceM: distance,
      });
      lastSpeeds.set(vehicle.vehicleId, vehicle.speedMps);
      lastYaws.set(vehicle.vehicleId, vehicle.yawRad);
      const previous = oneShotTicks.get(`${vehicle.vehicleId}:brake`) ?? -1;
      if (
        deceleration >= LIVE_CHAOS_DEFAULTS.brakeSquealDecelerationMps2 &&
        atTick - previous >= LIVE_CHAOS_DEFAULTS.oneShotIntervalTicks
      ) {
        engine.playOneShot('brake-squeal', `${vehicle.vehicleId}:brake`, clamp01(deceleration / 8));
        oneShotTicks.set(`${vehicle.vehicleId}:brake`, atTick);
      }
      const previousTyre = oneShotTicks.get(`${vehicle.vehicleId}:tyre`) ?? -1;
      if (
        lateral >= LIVE_CHAOS_DEFAULTS.tyreScreechLateralMps2 &&
        atTick - previousTyre >= LIVE_CHAOS_DEFAULTS.oneShotIntervalTicks
      ) {
        engine.playOneShot('tyre-screech', `${vehicle.vehicleId}:tyre`, clamp01(lateral / 12));
        oneShotTicks.set(`${vehicle.vehicleId}:tyre`, atTick);
      }
    }
    // A vehicle that left the audible window releases its loop; the 148 caps stay authoritative.
    for (const vehicle of vehicles) {
      if (!audible.has(vehicle.vehicleId) && lastSpeeds.has(vehicle.vehicleId)) {
        engine.releaseVehicle(vehicle.vehicleId);
        lastSpeeds.delete(vehicle.vehicleId);
        lastYaws.delete(vehicle.vehicleId);
      }
    }
  };

  const recordFrame = (input: LiveChaosStepInput, listener: Vector3 | null): void => {
    const vehicles = input.vehicles
      .map((vehicle) => ({
        vehicle,
        distance: listener === null ? 0 : distance2D(vehicle.positionM, listener),
      }))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, 8)
      .map(({ vehicle }) =>
        Object.freeze({
          entityId: vehicle.vehicleId,
          handle: 0,
          vehicleClass: vehicle.driverKind,
          controlMode: vehicle.controlMode,
          position: Object.freeze({
            x: vehicle.positionM.x,
            y: vehicle.positionM.y,
            z: vehicle.positionM.z,
          }),
          rotation: rotationFor(vehicle.yawRad),
          linearVelocity: Object.freeze({
            x: Math.sin(vehicle.yawRad) * vehicle.speedMps,
            y: 0,
            z: Math.cos(vehicle.yawRad) * vehicle.speedMps,
          }),
          fsmState: 'DRIVING',
          rideId: null,
          passengerIds: Object.freeze([]),
          inCamera: true,
        }),
      );
    recorder.recordTick({
      tick: input.tick,
      vehicles: Object.freeze(vehicles),
      signals: Object.freeze([]),
    });
  };

  attachConsumers();

  const step = (input: LiveChaosStepInput): LiveChaosStats => {
    assertLive();
    const atTick = readTick(input.tick);
    requireContract(atTick >= currentTick, 'The live chaos tick must not move backwards');
    const started = clock();
    currentTick = atTick;
    decor.advance(atTick);
    bus.advanceTick(atTick);
    const listener =
      input.listenerPositionM ??
      input.vehicles.find((vehicle) => vehicle.isPlayer)?.positionM ??
      null;
    feedback.setListenerPosition(listener);
    if (lastStepTick !== atTick) {
      try {
        recordFrame(input, listener);
      } catch {
        // A repeated or non-monotonic probe tick is a rejected sample, never a corrupted chunk.
      }
    }
    const vehicleMap = new Map(input.vehicles.map((vehicle) => [vehicle.vehicleId, vehicle]));
    const incidents = input.incidents ?? physics?.readIncidents() ?? [];
    for (const incident of incidents) applyIncident(incident, vehicleMap);
    feedback.advance(atTick);
    updateAudio(input.vehicles, listener, atTick);
    syncPhysical(listener);
    generation = decor.getStats().generation;
    if (costs.length >= LIVE_CHAOS_DEFAULTS.maxCostSamples) costs.shift();
    costs.push(Math.max(0, clock() - started));
    lastStepTick = atTick;
    return getStatsInternal();
  };

  const getStatsInternal = (): LiveChaosStats => {
    const decorStats = decor.getStats();
    const feedbackStats = feedback.getStats();
    const audioStats = engine?.getStats() ?? null;
    const recorderStats = recorder.getStats();
    const busState = bus.getStats();
    const physicalStats = physics?.getStats().obstacles ?? null;
    const archetypes = Object.fromEntries(
      plan.definitions.map((definition) => [definition.archetype, 0]),
    ) as Record<DestructibleArchetype, number>;
    for (const definition of plan.definitions) archetypes[definition.archetype] += 1;
    return Object.freeze({
      version: LIVE_CHAOS_VERSION,
      tick: currentTick,
      generation,
      objects: decorStats.objects,
      objectsByState: decorStats.states,
      objectsByArchetype: Object.freeze(archetypes),
      definitions: plan.definitions.length,
      bodies: decorStats.bodies,
      colliders: decorStats.colliders,
      physicalObstacles: physical.size,
      physicalCapacity: physicalStats?.capacity ?? 0,
      physicalAvailable: physicalStats?.available ?? 0,
      fragments: feedbackStats.presentation,
      feedback: feedbackStats,
      audio: audioStats,
      audioState: audioStats?.state ?? 'ABSENT',
      bus: Object.freeze({
        retainedEvents: busState.retainedEvents,
        listeners: busState.listeners,
        watermarkTick: busState.watermarkTick,
      }),
      recorder: Object.freeze({
        eventsRecorded: recorderStats.eventsRecorded,
        eventsRejected: recorderStats.eventsRejected,
        incidentsRegistered: recorderStats.incidentsRegistered,
        incidentsSealed: recorderStats.incidentsSealed,
        chunksRetained: recorderStats.chunksRetained,
        chargedBytes: recorderStats.chargedBytes,
        peakChargedBytes: recorderStats.peakChargedBytes,
        replayChunks: replayChunks.length,
      }),
      reactions,
      lastReaction,
      impacts,
      impactsBySource: Object.freeze({ ...impactsBySource }),
      brokenEvents: decorStats.brokenEvents,
      duplicateBreaks: decorStats.duplicateBreaks,
      chainBreaks: decorStats.chainBreaks,
      resets,
      replayChecks,
      cost: costSummary(costs),
      caps: Object.freeze({
        objects: DESTRUCTIBLE_LIMITS.maxObjects,
        fragments: DESTRUCTIBLE_LIMITS.maxActiveFragments,
        reactionsPerIncident: DESTRUCTION_FEEDBACK_LIMITS.maxReactionsPerIncident,
        retainedReactions: LIVE_CHAOS_DEFAULTS.maxRetainedReactions,
        retainedEvents: DESTRUCTION_FEEDBACK_LIMITS.maxRetainedEvents,
        replayEvents: DESTRUCTION_FEEDBACK_LIMITS.maxReplayEvents,
        physicalObstacles: maxPhysicalObstacles,
        audioVoices: 14,
        audioImpactVoices: 4,
        audioBuffers: 8,
      }),
      assets: Object.freeze({
        definitions: plan.definitions.length,
        archetypes: Object.keys(DESTRUCTIBLE_ARCHETYPES).length,
        fragmentPresets: 5,
        audioCue: 'impact' as const,
        audioBufferBytes: audioStats?.bufferBytes ?? 0,
        heapBytes: null,
      }),
      listeners: busState.listeners,
      disposed,
    });
  };

  const reset = (atTick: number): LiveChaosResetReport => {
    assertLive();
    const tick = readTick(atTick);
    currentTick = tick;
    const xpBefore = xpMicroXp === undefined ? null : xpMicroXp();
    const profileBefore = profileFingerprint === undefined ? null : profileFingerprint();
    const xpBeforeNumber = xpBefore ?? null;
    const profileBeforeText = profileBefore ?? null;
    for (const objectId of [...physical.keys()]) {
      if (physics !== undefined) physics.removeObstacle(objectId);
      physical.delete(objectId);
    }
    const resetDecor = decor.reset();
    pendingReactions.length = 0;
    lastReaction = null;
    // The real chunks of this generation are sealed before the world identity advances. The reset
    // event itself belongs to the next generation and is recorded there, in order.
    let chunkId: string | null = null;
    for (const incidentId of pendingIncidentIds) {
      const sealed = recorder.sealIncident(incidentId, tick);
      if (sealed.status === 'REJECTED') continue;
      const chunk = sealed.chunk;
      const taken = recorder.takeChunk(chunk.sequence) ?? chunk;
      replayChunks.push(taken);
      while (replayChunks.length > LIVE_CHAOS_DEFAULTS.maxReplayChunks) replayChunks.shift();
      chunkId = taken.chunkId;
    }
    pendingIncidentIds.length = 0;
    pendingIncidentSet.clear();
    unsubscribeVisual();
    unsubscribeRecorder();
    feedback.dispose();
    decor.dispose();
    recorder.dispose();
    const previousEpoch = context.worldEpoch;
    const nextEpoch = previousEpoch + 1;
    context = Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId,
      worldEpoch: nextEpoch,
    });
    if (ownsBus) {
      bus.dispose();
      bus = createEventBus({
        sessionId,
        worldEpoch: nextEpoch,
        maxEventsPerEpoch: 10_000,
        maxListeners: 8,
      });
    } else {
      bus.advanceWorldEpoch(nextEpoch);
    }
    decor = createDestructibleDecor({ context, eventBus: bus, layout, plan });
    recorder = createWorldRecorder({
      sessionId,
      worldEpoch: nextEpoch,
      versions: Object.freeze({
        engineVersion: LIVE_CHAOS_VERSION,
        physicsVersion: '282-live-rapier-v1',
        mapVersion: layout.mapId,
      }),
      tickHz: 60,
      sampleHz: 20,
      now: options.now,
    });
    feedback = attachDestructionFeedback({
      context,
      eventBus: bus,
      catalog,
      ...(engine === undefined ? {} : { engine }),
      settings,
      ...(options.fragmentPoolCapacity === undefined
        ? {}
        : { fragmentPoolCapacity: options.fragmentPoolCapacity }),
      ...(options.maxReactionsPerIncident === undefined
        ? {}
        : { maxReactionsPerIncident: options.maxReactionsPerIncident }),
    });
    attachConsumers();
    lastAudioPlayed = 0;
    visualFallback = false;
    processedIncidents.length = 0;
    processedSet.clear();
    lastSpeeds.clear();
    lastYaws.clear();
    oneShotTicks.clear();
    lastStepTick = -1;
    try {
      const aligned = tick - (tick % 3);
      recorder.recordTick({
        tick: aligned,
        vehicles: Object.freeze([]),
        signals: Object.freeze([]),
      });
    } catch {
      // The new generation still records events; a missing sample is declared by the chunk.
    }
    const eventId = createStableId('world-reset', sessionId, [
      String(previousEpoch),
      String(tick),
      String(resets + 1),
    ]);
    bus.advanceTick(tick);
    const worldReset: SimulationEvent = Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId,
      worldEpoch: nextEpoch,
      eventId,
      tick,
      entityIds: Object.freeze([]),
      type: 'WORLD_RESET' as const,
      payload: Object.freeze({
        previousWorldEpoch: previousEpoch,
        reason: 'SCENARIO_RESET' as const,
      }),
    });
    bus.publish(worldReset);
    resets += 1;
    generation = decor.getStats().generation;
    const xpAfter = xpMicroXp === undefined ? null : xpMicroXp();
    const profileAfter = profileFingerprint === undefined ? null : profileFingerprint();
    const xpDelta = xpAfter === null ? 0 : xpAfter - (xpBefore ?? 0);
    return Object.freeze({
      status: 'RESET' as const,
      tick,
      generation,
      resets,
      restored: resetDecor.restored,
      kept: resetDecor.kept,
      worldResetEventId: eventId,
      replayChunkId: chunkId,
      xpMicroXpBefore: xpBeforeNumber,
      xpMicroXpAfter: xpAfter,
      profileFingerprintBefore: profileBeforeText,
      profileFingerprintAfter: profileAfter,
      xpDeltaMicroXp: xpDelta,
      profileChanged: profileBeforeText !== null && profileBeforeText !== profileAfter,
      xpWithdrawn: xpBeforeNumber !== null && xpAfter !== null && xpAfter < xpBeforeNumber,
    });
  };

  const checkReplay = (chunkIndex = -1): LiveChaosReplayCheck => {
    assertLive();
    const index = chunkIndex < 0 ? replayChunks.length + chunkIndex : chunkIndex;
    const chunk = replayChunks[index];
    replayChecks += 1;
    if (chunk === undefined) {
      return Object.freeze({
        status: 'REFUSED' as const,
        version: '285-live-chaos-replay-v1',
        chunkId: null,
        recordedEvents: 0,
        replayedEvents: 0,
        destructionEvents: 0,
        resetEvents: 0,
        recordedEventIds: Object.freeze([]),
        replayedEventIds: Object.freeze([]),
        orderIdentical: false,
        eventsIdentical: false,
        reactionFingerprints: Object.freeze([]),
        stepsSimulation: 0 as const,
        physicsSteps: 0 as const,
        policyEvaluations: 0 as const,
        awardsGranted: 0 as const,
        learningArtifacts: 0 as const,
        absentEvents: 0,
        detail: 'No sealed replay chunk exists yet',
      });
    }
    const result = createDestructionReplay(
      {
        replayId: `285-replay:${chunk.chunkId}`,
        source: chunk,
        expectedSessionId: chunk.sessionId,
        expectedWorldEpoch: chunk.worldEpoch,
      },
      {
        catalog,
        sourcePort: Object.freeze({ readChunk: readWorldReplayChunk }),
      },
    );
    if (result.status === 'REFUSED') {
      return Object.freeze({
        status: 'REFUSED' as const,
        version: '285-live-chaos-replay-v1',
        chunkId: chunk.chunkId,
        recordedEvents: chunk.events.length,
        replayedEvents: 0,
        destructionEvents: 0,
        resetEvents: 0,
        recordedEventIds: Object.freeze([]),
        replayedEventIds: Object.freeze([]),
        orderIdentical: false,
        eventsIdentical: false,
        reactionFingerprints: Object.freeze([]),
        stepsSimulation: 0 as const,
        physicsSteps: 0 as const,
        policyEvaluations: 0 as const,
        awardsGranted: 0 as const,
        learningArtifacts: 0 as const,
        absentEvents: 0,
        detail: `${result.stage}: ${result.codes.join(', ')} ${result.detail}`,
      });
    }
    const run = result.replay.run();
    const recordedIds = run.truth.recordedEventIds;
    const replayedIds = run.truth.replayedEventIds;
    return Object.freeze({
      status: 'REPLAYED' as const,
      version: '285-live-chaos-replay-v1',
      chunkId: chunk.chunkId,
      recordedEvents: run.truth.recordedEvents,
      replayedEvents: run.truth.replayedEvents,
      destructionEvents: run.truth.destructionEvents,
      resetEvents: run.truth.resetEvents,
      recordedEventIds: recordedIds,
      replayedEventIds: replayedIds,
      orderIdentical: run.truth.orderIdentical,
      eventsIdentical: run.truth.eventsIdentical,
      reactionFingerprints: Object.freeze(
        run.reactions.map((reaction: DestructionReaction) =>
          destructionReactionFingerprint(reaction),
        ),
      ),
      stepsSimulation: 0 as const,
      physicsSteps: 0 as const,
      policyEvaluations: 0 as const,
      awardsGranted: 0 as const,
      learningArtifacts: 0 as const,
      absentEvents: run.truth.absentEvents,
      detail: null,
    });
  };

  const probeImpact = (input: LiveChaosProbeImpact): DestructibleImpactResult | null => {
    assertLive();
    const definition = byId.get(input.objectId);
    if (definition === undefined) return null;
    const at = readTick(input.tick ?? currentTick);
    const vehicleId = input.vehicleId ?? 'probe-vehicle';
    const controlSource = input.controlSource ?? 'MANUAL';
    const otherEntityId = `destructible:${definition.objectId}`;
    const incident: CollisionIncident = Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId,
      worldEpoch: context.worldEpoch,
      incidentId: createStableId('collision', sessionId, [
        '285-probe',
        String(context.worldEpoch),
        String(at),
        definition.objectId,
      ]),
      tick: at,
      vehicleId,
      otherEntityId,
      impulseNs: input.impulseNs,
      first: Object.freeze({
        entityId: vehicleId,
        kind: 'VEHICLE' as const,
        serial: 1,
        colliderHandle: 1,
      }),
      second: Object.freeze({
        entityId: otherEntityId,
        kind: 'OBSTACLE' as const,
        serial: 2,
        colliderHandle: 2,
      }),
    });
    const sample: LiveChaosVehicleSample = Object.freeze({
      vehicleId,
      driverKind: 'TAXI' as const,
      positionM: definition.initialTransform.positionM,
      yawRad: definition.initialTransform.headingRad,
      speedMps: 8,
      controlMode: controlSource,
      isPlayer: true,
    });
    bus.advanceTick(at);
    decor.advance(at);
    feedback.setListenerPosition(sample.positionM);
    return applyIncident(incident, new Map([[vehicleId, sample]]));
  };

  const visual = (): LiveChaosVisualFrame => {
    assertLive();
    const collected = pendingReactions.splice(0, pendingReactions.length);
    const feedbackStats = feedback.getStats();
    const audioState = engine?.getStats().state ?? 'ABSENT';
    return Object.freeze({
      version: LIVE_CHAOS_VERSION,
      tick: currentTick,
      generation,
      objects: Object.freeze(
        plan.definitions.map((definition) => {
          const state = decor.getState(definition.objectId);
          return Object.freeze({
            objectId: definition.objectId,
            archetype: definition.archetype,
            state: state.state,
            positionM: state.positionM,
            headingRad: state.headingRad,
            displacementM: state.displacementM,
            obstacleClass: state.obstacleClass,
            physical: physical.has(definition.objectId),
          });
        }),
      ),
      reactions: Object.freeze(collected),
      lastReaction,
      audioState,
      audioFallback: visualFallback || audioState !== 'RUNNING',
      fragmentLifetimeTicks: feedbackStats.presentation.fragmentLifetimeTicks,
      fragmentPoolCap: feedbackStats.presentation.fragmentPoolCap,
      resets,
    });
  };

  const api: LiveChaos = {
    version: LIVE_CHAOS_VERSION,
    plan,
    get decor() {
      return decor;
    },
    get context() {
      return context;
    },
    get eventBus() {
      return bus;
    },
    step,
    visual,
    setSettings(patch) {
      assertLive();
      settings = feedback.setSettings(patch);
      return settings;
    },
    setPresentationPreset(preset) {
      assertLive();
      decor.setPresentationPreset(preset);
    },
    reset,
    probeImpact,
    replayChunks() {
      return Object.freeze(
        replayChunks.map((chunk) =>
          Object.freeze({
            chunkId: chunk.chunkId,
            sequence: chunk.sequence,
            startTick: chunk.startTick,
            endTick: chunk.endTick,
            events: chunk.events.length,
            bytes: chunk.bytes,
            completeness: chunk.completeness.status,
          }),
        ),
      );
    },
    checkReplay,
    getStats: getStatsInternal,
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeVisual();
      unsubscribeRecorder();
      for (const objectId of [...physical.keys()]) {
        try {
          physics?.removeObstacle(objectId);
        } catch {
          // The 282 owner disposes its native world below.
        }
      }
      physical.clear();
      pendingReactions.length = 0;
      processedIncidents.length = 0;
      processedSet.clear();
      replayChunks.length = 0;
      feedback.dispose();
      decor.dispose();
      recorder.dispose();
      if (options.eventBus === undefined) bus.dispose();
    },
  };
  return Object.freeze(api);
}

/** The live window of physical bindings, exposed for evidence without a second physics read. */
export function liveChaosPhysicalWindow(stats: LiveChaosStats): LivePhysicsObstacleStats | null {
  if (stats.physicalCapacity === 0) return null;
  return Object.freeze({
    active: stats.physicalObstacles,
    capacity: stats.physicalCapacity,
    worldObstacles: Math.max(
      0,
      stats.physicalCapacity - stats.physicalAvailable - stats.physicalObstacles,
    ),
    available: stats.physicalAvailable,
    added: 0,
    moved: 0,
    removed: 0,
    refused: 0,
  });
}
