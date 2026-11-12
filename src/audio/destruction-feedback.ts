import {
  boolean,
  choice,
  createStableId,
  fields,
  nullable,
  number,
  record,
  requireContract,
  text,
  tick as readTick,
} from '../sessions';
import type { ContractContext } from '../sessions';
import type { EventBus, SimulationEvent } from '../simulation';
import type { Vector3 } from '../vehicles';
import {
  DESTRUCTIBLE_ARCHETYPES,
  DESTRUCTIBLE_BROKEN_EVENT,
  DESTRUCTIBLE_LIMITS,
  FRAGMENT_LIFETIME_TICKS,
  PRESENTATION_FRAGMENT_BUDGET,
  destructibleArchetypes,
} from '../world';
import type {
  DestructibleArchetype,
  DestructibleDefinition,
  FragmentPreset,
  PresentationPreset,
} from '../world';
import type { AudioEngine } from './engine';

/**
 * PBI 228 — destruction feedback and replay truth.
 *
 * The module is the missing consumer between two delivered contracts: the 227 destructible decor
 * publishes `DESTRUCTIBLE_BROKEN`, the 148 engine owns the voices and the 207/141 replay owns the
 * recorded states. This module never creates a third source of truth:
 *
 * 1. **One reaction per recorded event.** `deriveDestructionReaction` is a pure function of the
 *    event identity, the event payload (`objectId`, `instigatorId`, `impulseNs`, `tick`) and the
 *    227 definition catalog. The archetype names the material, the impulse relative to the real
 *    break threshold names the intensity and the authored object position names the place. There is
 *    no `Math.random`, no wall clock and no per-frame sound.
 * 2. **A material is audible and visible.** The material chooses a playback rate and a gain scale
 *    of the existing 148 `impact` cue, a fragment preset/count of the 227 presentation budget and a
 *    visual companion. Every sound has its visual twin; the reaction is complete without audio.
 * 3. **Presentation is bounded and cosmetic.** Fragments live in a finite pool with a lifetime;
 *    they never block traffic, never score and never create collisions. The intensity setting and
 *    the visual alternative change presentation only, never states or events.
 * 4. **Replay repeats the recording, not the physics.** The 228 replay consumes a sealed
 *    207 chunk through a source port, replays its `DESTRUCTIBLE_BROKEN`/`WORLD_RESET` events in the
 *    recorded order, and declares structural zeros for simulation steps, policy evaluations,
 *    awards and learning artifacts. An event that is not in the recording has no reaction: absence
 *    is reported (`ABSENT`), never filled in. A recording without data produces no sound.
 * 5. **148 stays the only audio owner.** Nothing sounds before a player gesture: the engine answers
 *    `AWAITING_GESTURE`, the visual companion still appears, and no buffer or voice is created.
 */

export const DESTRUCTION_FEEDBACK_VERSION = '228-destruction-feedback-v1' as const;
export const DESTRUCTION_REPLAY_VERSION = '228-destruction-replay-v1' as const;
export const DESTRUCTION_REPLAY_SOURCE = Object.freeze({
  chunk: '207-world-replay-chunk-v1' as const,
  projection: '141-experiment-replay-v1' as const,
});

export const DESTRUCTION_MATERIALS = ['WOOD', 'PLASTIC', 'METAL', 'GLASS'] as const;
export type DestructionMaterial = (typeof DESTRUCTION_MATERIALS)[number];

export const destructionIntensityTiers = ['LIGHT', 'HEAVY'] as const;
export type DestructionIntensityTier = (typeof destructionIntensityTiers)[number];

export const destructionVisualVariants = ['FRAGMENT_BURST', 'SHOCK_RING'] as const;
export type DestructionVisualVariant = (typeof destructionVisualVariants)[number];

/** The structural caps of the feedback, reported and enforced together. */
export const DESTRUCTION_FEEDBACK_LIMITS = Object.freeze({
  version: DESTRUCTION_FEEDBACK_VERSION,
  /** One impact plus its chain cannot produce more reactions than the 227 chain capacity. */
  maxReactionsPerIncident: 24,
  /** Bounded idempotency registry, like the 149 feedback: one event sounds once. */
  maxRetainedEvents: 256,
  /** Fragments are cosmetic and never exceed the 227 presentation cap. */
  maxFragmentPool: DESTRUCTIBLE_LIMITS.maxActiveFragments,
  /** The module installs exactly one event bus listener. */
  maxListeners: 1,
  /** The 207 recorder retains at most 4096 events per session. */
  maxReplayEvents: 4096,
  maxCodeUnits: 512,
});

/** The acoustic and visual identity of one archetype; both are data, never a code branch. */
export interface DestructionArchetypeProfile {
  readonly archetype: DestructibleArchetype;
  readonly material: DestructionMaterial;
  /** Playback rate of the shared 148 `impact` buffer; the six archetypes are all distinct. */
  readonly playbackRate: number;
  /** Material gain scale in (0,1]. */
  readonly gain: number;
  readonly symbol: string;
  readonly label: string;
  readonly fragmentPreset: FragmentPreset;
}

export const DESTRUCTION_ARCHETYPE_PROFILES: Readonly<
  Record<DestructibleArchetype, DestructionArchetypeProfile>
> = Object.freeze({
  FENCE_LIGHT: Object.freeze({
    archetype: 'FENCE_LIGHT',
    material: 'WOOD',
    playbackRate: 0.82,
    gain: 0.55,
    symbol: '▤',
    label: 'gard ușor',
    fragmentPreset: 'PLANKS',
  }),
  CONE: Object.freeze({
    archetype: 'CONE',
    material: 'PLASTIC',
    playbackRate: 1.25,
    gain: 0.35,
    symbol: '▲',
    label: 'con',
    fragmentPreset: 'DISCS',
  }),
  CRATE: Object.freeze({
    archetype: 'CRATE',
    material: 'WOOD',
    playbackRate: 0.7,
    gain: 0.7,
    symbol: '▣',
    label: 'ladă',
    fragmentPreset: 'CUBES',
  }),
  BIN: Object.freeze({
    archetype: 'BIN',
    material: 'METAL',
    playbackRate: 1.05,
    gain: 0.8,
    symbol: '◍',
    label: 'pubelă',
    fragmentPreset: 'SHARDS',
  }),
  DECOR_SIGN: Object.freeze({
    archetype: 'DECOR_SIGN',
    material: 'GLASS',
    playbackRate: 1.45,
    gain: 0.9,
    symbol: '✦',
    label: 'indicator decorativ',
    fragmentPreset: 'SHARDS',
  }),
  STREET_FURNITURE: Object.freeze({
    archetype: 'STREET_FURNITURE',
    material: 'METAL',
    playbackRate: 0.6,
    gain: 1,
    symbol: '▦',
    label: 'mobilier stradal',
    fragmentPreset: 'PLANKS',
  }),
});

/* --------------------------------------------------------------------------------------- catalog */

export interface DestructionCatalogEntry {
  readonly objectId: string;
  readonly archetype: DestructibleArchetype;
  readonly positionM: Vector3;
  readonly breakImpulseNs: number;
  readonly fragmentPreset: FragmentPreset;
  readonly fragmentCount: number;
}

/**
 * The data the reaction needs about an object: its archetype, its authored place and its real 227
 * break threshold. The catalog is derived from the 227 plan, so the feedback never guesses.
 */
export interface DestructionCatalog {
  readonly size: number;
  readonly entries: readonly DestructionCatalogEntry[];
  get(objectId: string): DestructionCatalogEntry | null;
}

function point(x: number, z: number, y = 0): Vector3 {
  return Object.freeze({ x, y, z });
}

function readVector(value: unknown): Vector3 {
  const data = fields(value, ['x', 'y', 'z']);
  return point(number(data.x, -1e6, 1e6), number(data.z, -1e6, 1e6), number(data.y, -1e6, 1e6));
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  const rounded = Math.round(value * scale) / scale;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Builds the object catalog from the real 227 definitions.
 *
 * Duplicate identities, an unknown archetype, a non-positive threshold or a missing transform are
 * refused: the catalog is the only place where "what does this object sound and look like" is
 * decided, so a partial catalog must fail loudly instead of producing a silent half-reaction.
 */
export function createDestructionCatalog(
  definitions: readonly DestructibleDefinition[],
): DestructionCatalog {
  requireContract(Array.isArray(definitions), 'The destruction catalog needs definitions');
  requireContract(
    definitions.length <= DESTRUCTIBLE_LIMITS.maxObjects,
    'The destruction catalog size is outside the 227 capacity',
  );
  const entries: DestructionCatalogEntry[] = [];
  const ids = new Set<string>();
  for (const definition of definitions) {
    const data = fields(definition, [
      'objectId',
      'archetype',
      'zoneId',
      'initialTransform',
      'collider',
      'massKg',
      'impactThreshold',
      'responseKind',
      'fragmentPreset',
      'resetPolicy',
    ]);
    const objectId = text(data.objectId);
    requireContract(!ids.has(objectId), `Duplicate destruction catalog object ${objectId}`);
    const archetype = choice(data.archetype, destructibleArchetypes);
    const transform = fields(data.initialTransform, ['positionM', 'headingRad']);
    const threshold = fields(data.impactThreshold, ['moveImpulseNs', 'breakImpulseNs']);
    const fragmentPreset = choice(data.fragmentPreset, [
      'NONE',
      'PLANKS',
      'DISCS',
      'CUBES',
      'SHARDS',
    ]);
    const profile = DESTRUCTION_ARCHETYPE_PROFILES[archetype];
    requireContract(
      fragmentPreset === profile.fragmentPreset,
      `The ${archetype} fragment preset does not match the 227 archetype`,
    );
    ids.add(objectId);
    entries.push(
      Object.freeze({
        objectId,
        archetype,
        positionM: readVector(transform.positionM),
        breakImpulseNs: number(threshold.breakImpulseNs, 0.001, 1e6),
        fragmentPreset,
        fragmentCount: number(DESTRUCTIBLE_ARCHETYPES[archetype].fragmentCount, 0, 12),
      }),
    );
  }
  const frozen = Object.freeze(entries);
  const byId = new Map(frozen.map((entry) => [entry.objectId, entry]));
  return Object.freeze({
    size: frozen.length,
    entries: frozen,
    get(objectId: string): DestructionCatalogEntry | null {
      return byId.get(objectId) ?? null;
    },
  });
}

/**
 * Fragment counts come from the delivered 227 archetype table: the catalog never re-authors them.
 */

/* --------------------------------------------------------------------------------------- input */

/** The real event identity and payload the reaction is derived from. */
export interface DestructionEventInput {
  readonly eventId: string;
  readonly tick: number;
  readonly objectId: string;
  readonly instigatorId: string | null;
  readonly impulseNs: number;
}

/** Narrowed reader for the 227 `DESTRUCTIBLE_BROKEN` event; any other type is refused. */
export function destructionEventFromSimulation(event: SimulationEvent): DestructionEventInput {
  const data = fields(event, [
    'schemaVersion',
    'units',
    'sessionId',
    'worldEpoch',
    'eventId',
    'tick',
    'entityIds',
    'type',
    'payload',
  ]);
  requireContract(
    data.type === DESTRUCTIBLE_BROKEN_EVENT,
    'Only DESTRUCTIBLE_BROKEN produces a destruction reaction',
  );
  const payload = fields(data.payload, ['objectId', 'instigatorId', 'impulseNs']);
  return Object.freeze({
    eventId: text(data.eventId),
    tick: readTick(data.tick),
    objectId: text(payload.objectId),
    instigatorId: nullable(payload.instigatorId, text),
    impulseNs: number(payload.impulseNs, 0, 1e9),
  });
}

export interface DestructionFeedbackSettings {
  /** Presentation intensity in [0,1]; it never changes a state, an event or a threshold. */
  readonly intensity: number;
  readonly preset: PresentationPreset;
  /** Reduced-motion alternative: a ring instead of fragments, and the same information. */
  readonly visualAlternative: boolean;
}

export const DEFAULT_DESTRUCTION_SETTINGS: DestructionFeedbackSettings = Object.freeze({
  intensity: 1,
  preset: 'MEDIUM',
  visualAlternative: false,
});

function readSettings(
  value: unknown,
  base: DestructionFeedbackSettings = DEFAULT_DESTRUCTION_SETTINGS,
): DestructionFeedbackSettings {
  const data = record(value);
  const allowed = ['intensity', 'preset', 'visualAlternative'];
  const unknown = Object.keys(data).filter((key) => !allowed.includes(key));
  requireContract(unknown.length === 0, `Unknown destruction setting ${unknown[0]}`);
  return Object.freeze({
    intensity: data.intensity === undefined ? base.intensity : number(data.intensity, 0, 1),
    preset:
      data.preset === undefined ? base.preset : choice(data.preset, ['LOW', 'MEDIUM', 'HIGH']),
    visualAlternative:
      data.visualAlternative === undefined
        ? base.visualAlternative
        : boolean(data.visualAlternative),
  });
}

/* ------------------------------------------------------------------------------------ reaction */

export interface DestructionIntensity {
  readonly impulseNs: number;
  readonly thresholdNs: number;
  /** `impulseNs / breakImpulseNs`, clamped to [0,1] and rounded to three digits. */
  readonly normalized: number;
  readonly tier: DestructionIntensityTier;
}

export type DestructionAudioReason = 'READY' | 'NO_LISTENER' | 'NO_CATALOG' | 'UNKNOWN_OBJECT';

export interface DestructionAudioDecision {
  readonly ready: boolean;
  readonly cueId: 'impact';
  readonly ownerId: string;
  readonly playbackRate: number;
  readonly gain: number;
  readonly distanceM: number | null;
  readonly reason: DestructionAudioReason;
}

export interface DestructionVisual {
  readonly kind: 'DESTRUCTION';
  readonly symbol: string;
  readonly text: string;
  readonly variant: DestructionVisualVariant;
  readonly material: DestructionMaterial;
  /** `false` only for a refused object: the information is never audio-only. */
  readonly audioIndependent: true;
  readonly attributes: readonly (readonly [string, string])[];
}

export interface DestructionFragmentPlan {
  readonly preset: FragmentPreset;
  readonly count: number;
  readonly lifetimeTicks: number;
  readonly poolCap: number;
  readonly blocksTraffic: false;
  readonly producesScore: false;
  readonly createsCollisions: false;
}

export interface DestructionReaction {
  readonly version: typeof DESTRUCTION_FEEDBACK_VERSION;
  readonly reactionId: string;
  readonly eventId: string;
  readonly objectId: string;
  readonly archetype: DestructibleArchetype;
  readonly material: DestructionMaterial;
  readonly tick: number;
  readonly instigatorId: string | null;
  readonly positionM: Vector3;
  readonly intensity: DestructionIntensity;
  readonly audio: DestructionAudioDecision;
  readonly visual: DestructionVisual;
  readonly fragments: DestructionFragmentPlan;
}

export type DestructionAbsenceReason = 'NO_CATALOG' | 'UNKNOWN_OBJECT';

export type DestructionReactionResult =
  | { readonly status: 'REACTION'; readonly reaction: DestructionReaction }
  | {
      readonly status: 'ABSENT';
      readonly eventId: string;
      readonly objectId: string;
      readonly tick: number;
      readonly reason: DestructionAbsenceReason;
      readonly detail: string;
    };

function attributesOf(
  rows: readonly (readonly [string, string])[],
): readonly (readonly [string, string])[] {
  return Object.freeze(rows.map((row) => Object.freeze(row)));
}

function boundedText(value: string): string {
  requireContract(
    value.length > 0 && value.length <= 240,
    'The destruction visual text is outside the code-unit limit',
  );
  return value;
}

/**
 * Derives the complete reaction from one recorded event.
 *
 * The function is pure: the same event, catalog, settings and listener position always produce the
 * same reaction id, material, intensity, gain, rate, fragment count and visual. A missing catalog
 * entry is an explicit `ABSENT`, never an invented material.
 */
export function deriveDestructionReaction(input: {
  readonly event: DestructionEventInput;
  readonly catalog: DestructionCatalog;
  readonly settings?: Partial<DestructionFeedbackSettings>;
  readonly listenerPositionM?: Vector3 | null;
}): DestructionReactionResult {
  const event = input.event;
  const eventId = text(event.eventId);
  requireContract(
    eventId.length <= DESTRUCTION_FEEDBACK_LIMITS.maxCodeUnits,
    'The destruction event identity exceeds the code-unit limit',
  );
  const tick = readTick(event.tick);
  const objectId = text(event.objectId);
  const impulseNs = number(event.impulseNs, 0, 1e9);
  const instigatorId = nullable(event.instigatorId, text);
  const settings = readSettings(input.settings ?? DEFAULT_DESTRUCTION_SETTINGS);
  const listener = input.listenerPositionM ?? null;
  const listenerPositionM = listener === null ? null : readVector(listener);

  requireContract(
    typeof input.catalog === 'object' &&
      input.catalog !== null &&
      typeof input.catalog.get === 'function',
    'The destruction reaction needs a catalog',
  );
  if (input.catalog.size === 0) {
    return Object.freeze({
      status: 'ABSENT' as const,
      eventId,
      objectId,
      tick,
      reason: 'NO_CATALOG' as const,
      detail:
        'The catalog is empty: without a definition there is no material, no place and no sound',
    });
  }
  const entry = input.catalog.get(objectId);
  if (entry === null) {
    return Object.freeze({
      status: 'ABSENT' as const,
      eventId,
      objectId,
      tick,
      reason: 'UNKNOWN_OBJECT' as const,
      detail: `The object ${objectId} has no 227 definition, so no reaction is invented for it`,
    });
  }

  const profile = DESTRUCTION_ARCHETYPE_PROFILES[entry.archetype];
  const normalized = round(clamp01(impulseNs / entry.breakImpulseNs), 3);
  const tier: DestructionIntensityTier = normalized >= 0.85 ? 'HEAVY' : 'LIGHT';
  const materialGain = round(
    clamp01(profile.gain * (0.75 + 0.25 * normalized) * (0.25 + 0.75 * settings.intensity)),
    4,
  );
  const distanceM =
    listenerPositionM === null
      ? null
      : round(
          Math.hypot(
            entry.positionM.x - listenerPositionM.x,
            entry.positionM.z - listenerPositionM.z,
          ),
          3,
        );
  const baseFragments = Math.min(
    entry.fragmentCount,
    PRESENTATION_FRAGMENT_BUDGET[settings.preset],
  );
  const scaledFragments = Math.max(1, Math.round(baseFragments * (0.5 + 0.5 * settings.intensity)));
  const fragmentCount = settings.visualAlternative ? 0 : scaledFragments;
  const variant: DestructionVisualVariant = settings.visualAlternative
    ? 'SHOCK_RING'
    : 'FRAGMENT_BURST';
  const intensityLabel = `${normalized.toFixed(3)} (${tier})`;
  const visual = Object.freeze({
    kind: 'DESTRUCTION' as const,
    symbol: profile.symbol,
    text: boundedText(
      `${profile.material} · ${profile.label} · ${intensityLabel} · ${impulseNs.toFixed(1)} N·s`,
    ),
    variant,
    material: profile.material,
    audioIndependent: true as const,
    attributes: attributesOf([
      ['data-kind', 'DESTRUCTION'],
      ['data-event', eventId],
      ['data-object', objectId],
      ['data-archetype', entry.archetype],
      ['data-material', profile.material],
      ['data-intensity', intensityLabel],
      ['data-tick', String(tick)],
      ['data-variant', variant],
      ['data-instigator', instigatorId ?? 'NONE'],
    ]),
  });
  const reaction = Object.freeze({
    version: DESTRUCTION_FEEDBACK_VERSION,
    reactionId: `destruction-feedback:${eventId}`,
    eventId,
    objectId,
    archetype: entry.archetype,
    material: profile.material,
    tick,
    instigatorId,
    positionM: entry.positionM,
    intensity: Object.freeze({
      impulseNs,
      thresholdNs: entry.breakImpulseNs,
      normalized,
      tier,
    }),
    audio: Object.freeze({
      ready: distanceM !== null,
      cueId: 'impact' as const,
      ownerId: `destruction:${eventId}`,
      playbackRate: profile.playbackRate,
      gain: materialGain,
      distanceM,
      reason: (distanceM === null ? 'NO_LISTENER' : 'READY') as DestructionAudioReason,
    }),
    visual,
    fragments: Object.freeze({
      preset: entry.fragmentPreset,
      count: fragmentCount,
      lifetimeTicks: FRAGMENT_LIFETIME_TICKS,
      poolCap: DESTRUCTION_FEEDBACK_LIMITS.maxFragmentPool,
      blocksTraffic: false as const,
      producesScore: false as const,
      createsCollisions: false as const,
    }),
  });
  return Object.freeze({ status: 'REACTION' as const, reaction });
}

/** Stable fingerprint of one reaction, used by the tests and the report to prove replay equality. */
export function destructionReactionFingerprint(reaction: DestructionReaction): string {
  return [
    reaction.eventId,
    reaction.objectId,
    reaction.archetype,
    reaction.material,
    reaction.intensity.tier,
    reaction.intensity.normalized.toFixed(3),
    reaction.audio.playbackRate.toFixed(3),
    reaction.audio.gain.toFixed(4),
    String(reaction.fragments.count),
    reaction.visual.variant,
  ].join('|');
}

/* ------------------------------------------------------------------------------- presentation */

/**
 * The bounded cosmetic pool.
 *
 * It owns fragment lifetimes and voices only. No fragment is a physics body, no fragment can score
 * and no fragment can create contact: the flags of `DestructionFragmentPlan` are structural.
 */
interface DestructionSink {
  apply(reaction: DestructionReaction): DestructionAppliedReaction;
  advance(tick: number): number;
  reset(): DestructionSinkReset;
  stats(): DestructionSinkStats;
  dispose(): void;
}

export interface DestructionAppliedReaction {
  readonly status: 'APPLIED';
  readonly reactionId: string;
  readonly audio: Readonly<{ played: boolean; reason: string }>;
  readonly fragments: Readonly<{
    spawned: number;
    dropped: number;
    active: number;
    expired: number;
  }>;
}

export interface DestructionSinkReset {
  readonly activeFragments: number;
  readonly expiredFragments: number;
  readonly releasedVoices: number;
}

export interface DestructionSinkStats {
  readonly activeFragments: number;
  readonly peakFragments: number;
  readonly spawnedFragments: number;
  readonly expiredFragments: number;
  readonly droppedFragments: number;
  readonly fragmentPoolCap: number;
  readonly fragmentLifetimeTicks: number;
  readonly audioPlayed: number;
  readonly audioRefused: number;
  readonly audioOwners: number;
  readonly buffersUsed: number;
  readonly listeners: number;
}

interface FragmentRecord {
  readonly count: number;
  readonly expiryTick: number;
}

function createDestructionSink(options: {
  readonly engine?: AudioEngine;
  readonly capacity?: number;
  readonly lifetimeTicks?: number;
}): DestructionSink {
  const capacity = options.capacity ?? DESTRUCTION_FEEDBACK_LIMITS.maxFragmentPool;
  requireContract(
    Number.isSafeInteger(capacity) &&
      capacity > 0 &&
      capacity <= DESTRUCTIBLE_LIMITS.maxActiveFragments,
    'The fragment pool capacity exceeds the 227 presentation cap',
  );
  const lifetimeTicks = options.lifetimeTicks ?? FRAGMENT_LIFETIME_TICKS;
  requireContract(
    Number.isSafeInteger(lifetimeTicks) && lifetimeTicks > 0,
    'The fragment lifetime must be a positive integer',
  );
  const engine = options.engine;
  const fragments: FragmentRecord[] = [];
  const audioOwners = new Set<string>();
  let activeFragments = 0;
  let peakFragments = 0;
  let spawnedFragments = 0;
  let expiredFragments = 0;
  let droppedFragments = 0;
  let audioPlayed = 0;
  let audioRefused = 0;
  let buffersUsed = 0;
  let disposed = false;

  const expire = (at: number): number => {
    let expired = 0;
    for (let index = fragments.length - 1; index >= 0; index -= 1) {
      const record = fragments[index];
      if (record === undefined || record.expiryTick > at) continue;
      fragments.splice(index, 1);
      activeFragments -= record.count;
      expired += record.count;
    }
    if (expired > 0) expiredFragments += expired;
    return expired;
  };

  return Object.freeze({
    apply(reaction: DestructionReaction): DestructionAppliedReaction {
      requireContract(!disposed, 'Destruction feedback is disposed');
      const expired = expire(reaction.tick);
      const requested = reaction.fragments.count;
      const room = Math.max(0, capacity - activeFragments);
      const spawned = Math.min(requested, room);
      const dropped = requested - spawned;
      if (spawned > 0) {
        fragments.push(
          Object.freeze({ count: spawned, expiryTick: reaction.tick + lifetimeTicks }),
        );
        activeFragments += spawned;
        spawnedFragments += spawned;
        if (activeFragments > peakFragments) peakFragments = activeFragments;
      }
      droppedFragments += dropped;
      let played = false;
      let reason = 'NO_ENGINE';
      if (engine !== undefined && reaction.audio.ready) {
        const result = engine.playDestructionImpact({
          ownerId: reaction.audio.ownerId,
          impulseNs: reaction.intensity.impulseNs,
          distanceM: reaction.audio.distanceM ?? 0,
          playbackRate: reaction.audio.playbackRate,
          gain: reaction.audio.gain,
        });
        played = result.played;
        reason = result.reason;
        if (played) {
          audioPlayed += 1;
          audioOwners.add(reaction.audio.ownerId);
          buffersUsed = engine.getStats().buffers;
        } else audioRefused += 1;
      } else {
        audioRefused += 1;
        reason = engine === undefined ? 'NO_ENGINE' : 'NO_LISTENER';
      }
      return Object.freeze({
        status: 'APPLIED' as const,
        reactionId: reaction.reactionId,
        audio: Object.freeze({ played, reason }),
        fragments: Object.freeze({ spawned, dropped, active: activeFragments, expired }),
      });
    },
    advance(tick: number): number {
      requireContract(!disposed, 'Destruction feedback is disposed');
      return expire(readTick(tick));
    },
    reset(): DestructionSinkReset {
      requireContract(!disposed, 'Destruction feedback is disposed');
      const expired = activeFragments;
      fragments.length = 0;
      activeFragments = 0;
      expiredFragments += expired;
      let releasedVoices = 0;
      if (engine !== undefined) {
        for (const owner of audioOwners) releasedVoices += engine.releaseVehicle(owner);
        buffersUsed = engine.getStats().buffers;
      }
      audioOwners.clear();
      return Object.freeze({ activeFragments, expiredFragments: expired, releasedVoices });
    },
    stats(): DestructionSinkStats {
      const engineStats = engine?.getStats();
      return Object.freeze({
        activeFragments,
        peakFragments,
        spawnedFragments,
        expiredFragments,
        droppedFragments,
        fragmentPoolCap: capacity,
        fragmentLifetimeTicks: lifetimeTicks,
        audioPlayed,
        audioRefused,
        audioOwners: audioOwners.size,
        buffersUsed: engineStats?.buffers ?? buffersUsed,
        listeners: 0,
      });
    },
    dispose(): void {
      if (disposed) return;
      if (engine !== undefined) for (const owner of audioOwners) engine.releaseVehicle(owner);
      audioOwners.clear();
      fragments.length = 0;
      activeFragments = 0;
      disposed = true;
    },
  });
}

/* ------------------------------------------------------------------------------------- live bus */

export interface DestructionFeedbackOptions {
  readonly context: ContractContext;
  readonly eventBus: EventBus;
  readonly catalog: DestructionCatalog;
  readonly engine?: AudioEngine;
  readonly listenerPositionM?: Vector3 | null;
  readonly settings?: Partial<DestructionFeedbackSettings>;
  readonly maxReactionsPerIncident?: number;
  readonly fragmentPoolCapacity?: number;
}

export interface DestructionFeedbackStats {
  readonly version: typeof DESTRUCTION_FEEDBACK_VERSION;
  readonly events: number;
  readonly reactions: number;
  readonly absentEvents: number;
  readonly absentByReason: Readonly<Record<DestructionAbsenceReason, number>>;
  readonly duplicateEvents: number;
  readonly droppedPerIncident: number;
  readonly reactionsByArchetype: Readonly<Record<DestructibleArchetype, number>>;
  readonly reactionsByMaterial: Readonly<Record<DestructionMaterial, number>>;
  readonly maxReactionsPerIncident: number;
  readonly retainedEvents: number;
  readonly listeners: number;
  readonly resets: number;
  readonly presentation: DestructionSinkStats;
  readonly lastTick: number;
  readonly settings: DestructionFeedbackSettings;
  readonly disposed: boolean;
}

export interface DestructionFeedbackResetReport {
  readonly reactions: number;
  readonly resets: number;
  readonly activeFragments: number;
  readonly expiredFragments: number;
  readonly releasedVoices: number;
}

export interface DestructionFeedback {
  readonly version: typeof DESTRUCTION_FEEDBACK_VERSION;
  setSettings(patch: Partial<DestructionFeedbackSettings>): DestructionFeedbackSettings;
  setListenerPosition(positionM: Vector3 | null): void;
  advance(tick: number): number;
  reset(): DestructionFeedbackResetReport;
  getStats(): DestructionFeedbackStats;
  dispose(): void;
}

/**
 * Wires the destruction feedback to the real 227 event bus.
 *
 * The module installs one filtered listener, deduplicates by `eventId` in a bounded FIFO, derives
 * the reaction, plays the material impact through the real 148 engine and spawns cosmetic
 * fragments. A foreign world, a stale bus or a second `dispose` is refused.
 */
export function attachDestructionFeedback(
  options: DestructionFeedbackOptions,
): DestructionFeedback {
  const data = record(options);
  const allowed = [
    'context',
    'eventBus',
    'catalog',
    'engine',
    'listenerPositionM',
    'settings',
    'maxReactionsPerIncident',
    'fragmentPoolCapacity',
  ];
  const unknown = Object.keys(data).filter((key) => !allowed.includes(key));
  requireContract(unknown.length === 0, `Unknown destruction feedback option ${unknown[0]}`);
  const contextValue = fields(options.context, [
    'schemaVersion',
    'units',
    'sessionId',
    'worldEpoch',
  ]);
  requireContract(
    contextValue.schemaVersion === 1 && contextValue.units === 'SI',
    'Unsupported destruction feedback context',
  );
  const context: ContractContext = Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    sessionId: text(contextValue.sessionId),
    worldEpoch: readTick(contextValue.worldEpoch),
  });
  const bus = options.eventBus;
  requireContract(
    typeof bus === 'object' && bus !== null && typeof bus.subscribe === 'function',
    'The destruction feedback needs the 227 event bus',
  );
  const catalog = options.catalog;
  requireContract(
    typeof catalog === 'object' && catalog !== null && typeof catalog.get === 'function',
    'The destruction feedback needs a catalog',
  );
  const busStats = bus.getStats();
  requireContract(
    busStats.sessionId === context.sessionId && busStats.worldEpoch === context.worldEpoch,
    'The destruction feedback bus belongs to a stale or foreign world',
  );
  const maxReactionsPerIncident = readTick(
    options.maxReactionsPerIncident ?? DESTRUCTION_FEEDBACK_LIMITS.maxReactionsPerIncident,
  );
  requireContract(
    maxReactionsPerIncident > 0 &&
      maxReactionsPerIncident <= DESTRUCTION_FEEDBACK_LIMITS.maxReactionsPerIncident,
    'The per-incident reaction cap exceeds the 228 limit',
  );
  let settings = readSettings(options.settings ?? DEFAULT_DESTRUCTION_SETTINGS);
  let listenerPositionM =
    options.listenerPositionM === undefined || options.listenerPositionM === null
      ? null
      : readVector(options.listenerPositionM);
  const sink = createDestructionSink({
    engine: options.engine,
    capacity: options.fragmentPoolCapacity,
  });
  const emitted: string[] = [];
  const emittedSet = new Set<string>();
  const reactionsByArchetype = Object.fromEntries(
    destructibleArchetypes.map((archetype) => [archetype, 0]),
  ) as Record<DestructibleArchetype, number>;
  const reactionsByMaterial = Object.fromEntries(
    DESTRUCTION_MATERIALS.map((material) => [material, 0]),
  ) as Record<DestructionMaterial, number>;
  const absentByReason: Record<DestructionAbsenceReason, number> = {
    NO_CATALOG: 0,
    UNKNOWN_OBJECT: 0,
  };
  let events = 0;
  let reactions = 0;
  let absentEvents = 0;
  let duplicateEvents = 0;
  let droppedPerIncident = 0;
  let resets = 0;
  let lastTick = 0;
  let incidentTick = -1;
  let incidentReactions = 0;
  let disposed = false;

  const remember = (eventId: string): void => {
    emitted.push(eventId);
    emittedSet.add(eventId);
    while (emitted.length > DESTRUCTION_FEEDBACK_LIMITS.maxRetainedEvents) {
      const dropped = emitted.shift();
      if (dropped !== undefined) emittedSet.delete(dropped);
    }
  };

  const unsubscribe = bus.subscribe(
    (event) => {
      if (disposed) return;
      if (event.type !== DESTRUCTIBLE_BROKEN_EVENT) return;
      if (event.sessionId !== context.sessionId || event.worldEpoch !== context.worldEpoch) return;
      events += 1;
      lastTick = Math.max(lastTick, event.tick);
      if (emittedSet.has(event.eventId)) {
        duplicateEvents += 1;
        return;
      }
      remember(event.eventId);
      if (event.tick !== incidentTick) {
        incidentTick = event.tick;
        incidentReactions = 0;
      }
      if (incidentReactions >= maxReactionsPerIncident) {
        droppedPerIncident += 1;
        return;
      }
      incidentReactions += 1;
      const input = destructionEventFromSimulation(event);
      const result = deriveDestructionReaction({
        event: input,
        catalog,
        settings,
        listenerPositionM,
      });
      if (result.status === 'ABSENT') {
        absentEvents += 1;
        absentByReason[result.reason] += 1;
        return;
      }
      reactions += 1;
      reactionsByArchetype[result.reaction.archetype] += 1;
      reactionsByMaterial[result.reaction.material] += 1;
      sink.advance(result.reaction.tick);
      sink.apply(result.reaction);
    },
    { type: DESTRUCTIBLE_BROKEN_EVENT },
  );

  return Object.freeze({
    version: DESTRUCTION_FEEDBACK_VERSION,
    setSettings(patch: Partial<DestructionFeedbackSettings>): DestructionFeedbackSettings {
      requireContract(!disposed, 'Destruction feedback is disposed');
      settings = readSettings(patch, settings);
      return settings;
    },
    setListenerPosition(positionM: Vector3 | null): void {
      requireContract(!disposed, 'Destruction feedback is disposed');
      listenerPositionM = positionM === null ? null : readVector(positionM);
    },
    advance(tick: number): number {
      requireContract(!disposed, 'Destruction feedback is disposed');
      return sink.advance(tick);
    },
    reset(): DestructionFeedbackResetReport {
      requireContract(!disposed, 'Destruction feedback is disposed');
      const reset = sink.reset();
      emitted.length = 0;
      emittedSet.clear();
      incidentTick = -1;
      incidentReactions = 0;
      resets += 1;
      return Object.freeze({
        reactions,
        resets,
        activeFragments: reset.activeFragments,
        expiredFragments: reset.expiredFragments,
        releasedVoices: reset.releasedVoices,
      });
    },
    getStats(): DestructionFeedbackStats {
      const presentation = sink.stats();
      return Object.freeze({
        version: DESTRUCTION_FEEDBACK_VERSION,
        events,
        reactions,
        absentEvents,
        absentByReason: Object.freeze({ ...absentByReason }),
        duplicateEvents,
        droppedPerIncident,
        reactionsByArchetype: Object.freeze({ ...reactionsByArchetype }),
        reactionsByMaterial: Object.freeze({ ...reactionsByMaterial }),
        maxReactionsPerIncident,
        retainedEvents: emitted.length,
        listeners: 1,
        resets,
        presentation: Object.freeze({ ...presentation, listeners: 1 }),
        lastTick,
        settings,
        disposed,
      });
    },
    dispose(): void {
      requireContract(!disposed, 'Destruction feedback is disposed');
      sink.dispose();
      unsubscribe();
      emitted.length = 0;
      emittedSet.clear();
      disposed = true;
    },
  });
}

/* -------------------------------------------------------------------------------------- replay */

export const destructionReplayRejectionCodes = [
  'INVALID_REQUEST',
  'INVALID_SOURCE',
  'CHECKSUM_MISMATCH',
  'FOREIGN_SOURCE',
  'SOURCE_EMPTY',
  'EVENT_ORDER',
] as const;
export type DestructionReplayRejectionCode = (typeof destructionReplayRejectionCodes)[number];
export type DestructionReplayStage = 'REQUEST' | 'SOURCE' | 'IDENTITY' | 'ORDER';

export interface DestructionReplayEventFactView {
  readonly eventId: string;
  readonly tick: number;
  readonly type: string;
  readonly entityIds: readonly string[];
  readonly payload: Readonly<Record<string, unknown>>;
  readonly sessionId: string;
  readonly worldEpoch: number;
}

/** The structural 207 chunk fields the replay reads; it is a view, not a second chunk format. */
export interface DestructionReplayChunkView {
  readonly chunkId: string;
  readonly sequence: number;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly startTick: number;
  readonly endTick: number;
  readonly events: readonly DestructionReplayEventFactView[];
  readonly bytes: number;
  readonly checksum: string;
  readonly completeness: Readonly<{ readonly status: 'COMPLETE' | 'PARTIAL' }>;
}

export type DestructionReplayChunkRead =
  | {
      readonly status: 'ACCEPTED';
      readonly chunk: DestructionReplayChunkView;
      readonly checksum: string;
      readonly bytes: number;
    }
  | {
      readonly status: 'REJECTED';
      /** The rejection shape of the 207 chunk reader, reused verbatim. */
      readonly rejection: Readonly<{ code: string; message: string; path: string }>;
    };

/**
 * The 207 reader, injected so the audio module never imports the replay adapter. The composition
 * layer passes `{ readChunk: readWorldReplayChunk }`; the tests pass the real reader too.
 */
export interface DestructionReplaySourcePort {
  readonly readChunk: (value: unknown) => DestructionReplayChunkRead;
}

export interface DestructionReplayRequest {
  readonly replayId: string;
  /** The sealed 207 chunk exactly as stored; it is re-read, never trusted. */
  readonly source: unknown;
  readonly expectedSessionId: string;
  readonly expectedWorldEpoch: number;
}

export type DestructionReplayEventType = 'DESTRUCTIBLE_BROKEN' | 'WORLD_RESET';

export interface DestructionReplayEvent {
  readonly sequence: number;
  readonly eventId: string;
  readonly tick: number;
  readonly type: DestructionReplayEventType;
  readonly objectId: string | null;
  readonly instigatorId: string | null;
  readonly impulseNs: number | null;
  readonly entityIds: readonly string[];
  readonly sessionId: string;
  readonly worldEpoch: number;
}

export type DestructionReplayPlanEntry =
  | {
      readonly status: 'REACTION';
      readonly sequence: number;
      readonly event: DestructionReplayEvent;
      readonly reaction: DestructionReaction;
    }
  | {
      readonly status: 'ABSENT';
      readonly sequence: number;
      readonly event: DestructionReplayEvent;
      readonly reason: DestructionAbsenceReason;
      readonly detail: string;
    }
  | {
      readonly status: 'RESET';
      readonly sequence: number;
      readonly event: DestructionReplayEvent;
    };

export interface DestructionReplayDeclaration {
  readonly version: typeof DESTRUCTION_REPLAY_VERSION;
  readonly source: typeof DESTRUCTION_REPLAY_SOURCE;
  readonly repeatsRecordedEvents: true;
  readonly stepsSimulation: 0;
  readonly recalculatesPhysics: false;
  readonly evaluatesPolicy: false;
  readonly inventsEvents: false;
  readonly grantsRewards: 0;
  readonly learningArtifacts: 0;
  readonly listeners: 1;
}

export interface DestructionReplayProjection {
  readonly generation: number;
  readonly resets: number;
  readonly states: readonly Readonly<{ objectId: string; state: 'BROKEN' }>[];
}

export interface DestructionReplayStep {
  readonly status: 'ADVANCED' | 'AT_END';
  readonly entry: DestructionReplayPlanEntry | null;
  readonly applied: DestructionAppliedReaction | null;
  readonly position: number;
}

export interface DestructionReplayTruth {
  readonly recordedEvents: number;
  readonly replayedEvents: number;
  readonly destructionEvents: number;
  readonly resetEvents: number;
  readonly replayedEventIds: readonly string[];
  readonly recordedEventIds: readonly string[];
  readonly orderIdentical: boolean;
  readonly eventsIdentical: boolean;
  readonly inventedReactions: 0;
  readonly absentEvents: number;
  readonly reDecidedPhysics: false;
  readonly awardsGranted: 0;
  readonly learningArtifacts: 0;
}

export interface DestructionReplayRun {
  readonly status: 'REPLAYED';
  readonly version: typeof DESTRUCTION_REPLAY_VERSION;
  readonly replayId: string;
  readonly events: readonly DestructionReplayEvent[];
  readonly reactions: readonly DestructionReaction[];
  readonly absent: readonly DestructionReplayPlanEntry[];
  readonly truth: DestructionReplayTruth;
  readonly projection: DestructionReplayProjection;
  readonly stats: DestructionReplayStats;
}

export interface DestructionReplayStats {
  readonly version: typeof DESTRUCTION_REPLAY_VERSION;
  readonly replayId: string;
  readonly recordedEvents: number;
  readonly destructionEvents: number;
  readonly resetEvents: number;
  readonly reactions: number;
  readonly absentEvents: number;
  readonly duplicateEvents: number;
  readonly audioPlayed: number;
  readonly audioRefused: number;
  readonly fragmentsActive: number;
  readonly fragmentsPeak: number;
  readonly fragmentsExpired: number;
  readonly fragmentsDropped: number;
  readonly fragmentPoolCap: number;
  readonly listeners: 1;
  readonly buffersUsed: number;
  readonly stepsSimulation: 0;
  readonly physicsSteps: 0;
  readonly policyEvaluations: 0;
  readonly awardsGranted: 0;
  readonly learningArtifacts: 0;
  readonly position: number;
  readonly disposed: boolean;
}

export interface DestructionReplay {
  readonly version: typeof DESTRUCTION_REPLAY_VERSION;
  readonly replayId: string;
  readonly declaration: DestructionReplayDeclaration;
  readonly source: Readonly<{
    chunkId: string;
    sequence: number;
    sessionId: string;
    worldEpoch: number;
    startTick: number;
    endTick: number;
    checksum: string;
    bytes: number;
    completeness: 'COMPLETE' | 'PARTIAL';
    recordedEvents: number;
  }>;
  events(): readonly DestructionReplayEvent[];
  plan(): readonly DestructionReplayPlanEntry[];
  projection(): DestructionReplayProjection;
  playNext(): DestructionReplayStep;
  run(): DestructionReplayRun;
  stats(): DestructionReplayStats;
  reset(): DestructionSinkReset;
  dispose(): void;
}

export interface DestructionReplayReady {
  readonly status: 'READY';
  readonly version: typeof DESTRUCTION_REPLAY_VERSION;
  readonly replayId: string;
  readonly replay: DestructionReplay;
}

export interface DestructionReplayRefused {
  readonly status: 'REFUSED';
  readonly version: typeof DESTRUCTION_REPLAY_VERSION;
  readonly replayId: string | null;
  readonly stage: DestructionReplayStage;
  readonly codes: readonly DestructionReplayRejectionCode[];
  readonly detail: string;
}

export type DestructionReplayResult = DestructionReplayReady | DestructionReplayRefused;

export interface DestructionReplayOptions {
  readonly catalog: DestructionCatalog;
  readonly sourcePort: DestructionReplaySourcePort;
  readonly engine?: AudioEngine;
  readonly listenerPositionM?: Vector3 | null;
  readonly settings?: Partial<DestructionFeedbackSettings>;
  readonly fragmentPoolCapacity?: number;
}

function refused(
  replayId: string | null,
  stage: DestructionReplayStage,
  codes: readonly DestructionReplayRejectionCode[],
  detail: string,
): DestructionReplayRefused {
  return Object.freeze({
    status: 'REFUSED' as const,
    version: DESTRUCTION_REPLAY_VERSION,
    replayId,
    stage,
    codes: Object.freeze([...codes]),
    detail,
  });
}

function readReplayEvent(
  fact: DestructionReplayEventFactView,
  sequence: number,
): DestructionReplayEvent {
  const eventId = text(fact.eventId);
  const tick = readTick(fact.tick);
  const type = choice(fact.type, [DESTRUCTIBLE_BROKEN_EVENT, 'WORLD_RESET'] as const);
  const sessionId = text(fact.sessionId);
  const worldEpoch = readTick(fact.worldEpoch);
  requireContract(Array.isArray(fact.entityIds), 'The replay event entities are not an array');
  const entityIds = Object.freeze(fact.entityIds.map((id) => text(id)));
  const payload = record(fact.payload);
  if (type === DESTRUCTIBLE_BROKEN_EVENT) {
    const data = fields(payload, ['objectId', 'instigatorId', 'impulseNs']);
    return Object.freeze({
      sequence,
      eventId,
      tick,
      type,
      objectId: text(data.objectId),
      instigatorId: nullable(data.instigatorId, text),
      impulseNs: number(data.impulseNs, 0, 1e9),
      entityIds,
      sessionId,
      worldEpoch,
    });
  }
  const data = fields(payload, ['previousWorldEpoch', 'reason']);
  readTick(data.previousWorldEpoch);
  requireContract(data.reason === 'SCENARIO_RESET', 'Unsupported world reset reason');
  return Object.freeze({
    sequence,
    eventId,
    tick,
    type,
    objectId: null,
    instigatorId: null,
    impulseNs: null,
    entityIds,
    sessionId,
    worldEpoch,
  });
}

/**
 * Replays the destruction and reset events of one sealed 207 chunk.
 *
 * The events are replayed in the recorded order; the reaction of every `DESTRUCTIBLE_BROKEN` is
 * derived from the same payload and catalog as the live path, so the identity, the material, the
 * intensity and the order are identical. No tick is invented, no physics is stepped, no reward is
 * granted. A destruction event whose object has no definition is an explicit `ABSENT` with no
 * sound and no fragments.
 */
export function createDestructionReplay(
  request: DestructionReplayRequest,
  options: DestructionReplayOptions,
): DestructionReplayResult {
  let validRequest: DestructionReplayRequest;
  try {
    const data = fields(request, ['replayId', 'source', 'expectedSessionId', 'expectedWorldEpoch']);
    validRequest = {
      replayId: text(data.replayId),
      source: data.source,
      expectedSessionId: text(data.expectedSessionId),
      expectedWorldEpoch: readTick(data.expectedWorldEpoch),
    };
  } catch (error) {
    return refused(
      null,
      'REQUEST',
      ['INVALID_REQUEST'],
      error instanceof Error ? error.message : 'The replay request could not be read',
    );
  }
  if (
    typeof options !== 'object' ||
    options === null ||
    typeof options.sourcePort !== 'object' ||
    options.sourcePort === null ||
    typeof options.sourcePort.readChunk !== 'function'
  ) {
    return refused(
      validRequest.replayId,
      'REQUEST',
      ['INVALID_REQUEST'],
      'The 207 source port is missing',
    );
  }
  const catalog = options.catalog;
  if (typeof catalog !== 'object' || catalog === null || typeof catalog.get !== 'function') {
    return refused(
      validRequest.replayId,
      'REQUEST',
      ['INVALID_REQUEST'],
      'The replay needs a destruction catalog',
    );
  }
  const read = options.sourcePort.readChunk(validRequest.source);
  if (read.status === 'REJECTED') {
    const code: DestructionReplayRejectionCode =
      read.rejection.code === 'CHECKSUM_MISMATCH' ? 'CHECKSUM_MISMATCH' : 'INVALID_SOURCE';
    return refused(
      validRequest.replayId,
      'SOURCE',
      [code],
      `${read.rejection.code}: ${read.rejection.message} (${read.rejection.path})`,
    );
  }
  const chunk = read.chunk;
  if (read.checksum !== chunk.checksum || read.bytes !== chunk.bytes) {
    return refused(
      validRequest.replayId,
      'SOURCE',
      ['CHECKSUM_MISMATCH'],
      `The reader reported ${read.checksum}/${read.bytes} bytes; the chunk declares ${chunk.checksum}/${chunk.bytes}`,
    );
  }
  if (
    chunk.sessionId !== validRequest.expectedSessionId ||
    chunk.worldEpoch !== validRequest.expectedWorldEpoch
  ) {
    return refused(
      validRequest.replayId,
      'IDENTITY',
      ['FOREIGN_SOURCE'],
      `The chunk belongs to ${chunk.sessionId}/${chunk.worldEpoch}; the replay expects ${validRequest.expectedSessionId}/${validRequest.expectedWorldEpoch}`,
    );
  }
  if (chunk.startTick > chunk.endTick) {
    return refused(
      validRequest.replayId,
      'SOURCE',
      ['INVALID_SOURCE'],
      `The stored window ${chunk.startTick}..${chunk.endTick} is not ordered`,
    );
  }
  if (!Array.isArray(chunk.events)) {
    return refused(
      validRequest.replayId,
      'SOURCE',
      ['INVALID_SOURCE'],
      'The stored chunk has no event table',
    );
  }
  if (chunk.events.length > DESTRUCTION_FEEDBACK_LIMITS.maxReplayEvents) {
    return refused(
      validRequest.replayId,
      'SOURCE',
      ['SOURCE_EMPTY'],
      `The chunk retains ${chunk.events.length} events, above the 228 replay cap`,
    );
  }

  const destructionEvents: DestructionReplayEvent[] = [];
  const recordedFactIds: string[] = [];
  let duplicateEvents = 0;
  const seen = new Set<string>();
  let previousTick = -1;
  try {
    for (const fact of chunk.events) {
      if (fact.type !== DESTRUCTIBLE_BROKEN_EVENT && fact.type !== 'WORLD_RESET') continue;
      const event = readReplayEvent(fact, destructionEvents.length);
      recordedFactIds.push(event.eventId);
      if (seen.has(event.eventId)) {
        duplicateEvents += 1;
        continue;
      }
      if (event.tick < previousTick) {
        return refused(
          validRequest.replayId,
          'ORDER',
          ['EVENT_ORDER'],
          `The event ${event.eventId} at tick ${event.tick} precedes the previous tick ${previousTick}`,
        );
      }
      seen.add(event.eventId);
      previousTick = event.tick;
      destructionEvents.push(event);
    }
  } catch (error) {
    return refused(
      validRequest.replayId,
      'SOURCE',
      ['INVALID_SOURCE'],
      error instanceof Error ? error.message : 'A replay event could not be read',
    );
  }
  const events = Object.freeze(destructionEvents);
  const settings = readSettings(options.settings ?? DEFAULT_DESTRUCTION_SETTINGS);
  const listenerPositionM =
    options.listenerPositionM === undefined || options.listenerPositionM === null
      ? null
      : readVector(options.listenerPositionM);
  const sink = createDestructionSink({
    engine: options.engine,
    capacity: options.fragmentPoolCapacity,
  });

  /** The plan is a pure projection of the recording: one entry per recorded event. */
  const plan: DestructionReplayPlanEntry[] = [];
  for (const event of events) {
    if (event.type === 'WORLD_RESET') {
      plan.push(Object.freeze({ status: 'RESET' as const, sequence: event.sequence, event }));
      continue;
    }
    const result = deriveDestructionReaction({
      event: {
        eventId: event.eventId,
        tick: event.tick,
        objectId: event.objectId!,
        instigatorId: event.instigatorId,
        impulseNs: event.impulseNs!,
      },
      catalog,
      settings,
      listenerPositionM,
    });
    if (result.status === 'ABSENT') {
      plan.push(
        Object.freeze({
          status: 'ABSENT' as const,
          sequence: event.sequence,
          event,
          reason: result.reason,
          detail: result.detail,
        }),
      );
      continue;
    }
    plan.push(
      Object.freeze({
        status: 'REACTION' as const,
        sequence: event.sequence,
        event,
        reaction: result.reaction,
      }),
    );
  }
  const frozenPlan = Object.freeze(plan);

  const declaration: DestructionReplayDeclaration = Object.freeze({
    version: DESTRUCTION_REPLAY_VERSION,
    source: DESTRUCTION_REPLAY_SOURCE,
    repeatsRecordedEvents: true,
    stepsSimulation: 0,
    recalculatesPhysics: false,
    evaluatesPolicy: false,
    inventsEvents: false,
    grantsRewards: 0,
    learningArtifacts: 0,
    listeners: 1,
  });
  const source = Object.freeze({
    chunkId: chunk.chunkId,
    sequence: chunk.sequence,
    sessionId: chunk.sessionId,
    worldEpoch: chunk.worldEpoch,
    startTick: chunk.startTick,
    endTick: chunk.endTick,
    checksum: chunk.checksum,
    bytes: chunk.bytes,
    completeness: chunk.completeness.status,
    recordedEvents: events.length,
  });
  const projectionOf = (): DestructionReplayProjection => {
    const states = new Map<string, 'BROKEN'>();
    let generation = 0;
    let resets = 0;
    for (const entry of frozenPlan) {
      if (entry.status === 'RESET') {
        states.clear();
        generation += 1;
        resets += 1;
      } else if (entry.status === 'REACTION') {
        states.set(entry.reaction.objectId, 'BROKEN');
      }
    }
    return Object.freeze({
      generation,
      resets,
      states: Object.freeze(
        [...states.entries()]
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          .map(([objectId, state]) => Object.freeze({ objectId, state })),
      ),
    });
  };
  let index = 0;
  let disposed = false;
  let playedReactions = 0;
  let absentEntries = 0;

  const statsFor = (): DestructionReplayStats => {
    const presentation = sink.stats();
    return Object.freeze({
      version: DESTRUCTION_REPLAY_VERSION,
      replayId: validRequest.replayId,
      recordedEvents: events.length,
      destructionEvents: events.filter((event) => event.type === DESTRUCTIBLE_BROKEN_EVENT).length,
      resetEvents: events.filter((event) => event.type === 'WORLD_RESET').length,
      reactions: playedReactions,
      absentEvents: absentEntries,
      duplicateEvents,
      audioPlayed: presentation.audioPlayed,
      audioRefused: presentation.audioRefused,
      fragmentsActive: presentation.activeFragments,
      fragmentsPeak: presentation.peakFragments,
      fragmentsExpired: presentation.expiredFragments,
      fragmentsDropped: presentation.droppedFragments,
      fragmentPoolCap: presentation.fragmentPoolCap,
      listeners: 1,
      buffersUsed: presentation.buffersUsed,
      stepsSimulation: 0,
      physicsSteps: 0,
      policyEvaluations: 0,
      awardsGranted: 0,
      learningArtifacts: 0,
      position: index,
      disposed,
    });
  };
  const stats = (): DestructionReplayStats => statsFor();

  const replay: DestructionReplay = Object.freeze({
    version: DESTRUCTION_REPLAY_VERSION,
    replayId: validRequest.replayId,
    declaration,
    source,
    events: () => events,
    plan: () => frozenPlan,
    projection: projectionOf,
    playNext(): DestructionReplayStep {
      requireContract(!disposed, 'Destruction replay is disposed');
      const entry = frozenPlan[index] ?? null;
      if (entry === null) {
        return Object.freeze({
          status: 'AT_END' as const,
          entry: null,
          applied: null,
          position: index,
        });
      }
      index += 1;
      let applied: DestructionAppliedReaction | null = null;
      if (entry.status === 'REACTION') {
        sink.advance(entry.reaction.tick);
        applied = sink.apply(entry.reaction);
        playedReactions += 1;
      } else if (entry.status === 'ABSENT') {
        absentEntries += 1;
      } else {
        sink.reset();
      }
      return Object.freeze({
        status: 'ADVANCED' as const,
        entry,
        applied,
        position: index,
      });
    },
    run(): DestructionReplayRun {
      requireContract(!disposed, 'Destruction replay is disposed');
      sink.reset();
      index = 0;
      playedReactions = 0;
      absentEntries = 0;
      const reactions: DestructionReaction[] = [];
      const absent: DestructionReplayPlanEntry[] = [];
      for (let cursor = 0; cursor < frozenPlan.length; cursor += 1) {
        const entry = frozenPlan[cursor]!;
        index = cursor + 1;
        if (entry.status === 'REACTION') {
          sink.advance(entry.reaction.tick);
          sink.apply(entry.reaction);
          reactions.push(entry.reaction);
          playedReactions += 1;
        } else if (entry.status === 'ABSENT') {
          absent.push(entry);
          absentEntries += 1;
        } else {
          sink.reset();
        }
      }
      const replayedEventIds = events.map((event) => event.eventId);
      const recordedEventIds = [...recordedFactIds];
      const truth: DestructionReplayTruth = Object.freeze({
        recordedEvents: events.length,
        replayedEvents: index,
        destructionEvents: events.filter((event) => event.type === DESTRUCTIBLE_BROKEN_EVENT)
          .length,
        resetEvents: events.filter((event) => event.type === 'WORLD_RESET').length,
        replayedEventIds: Object.freeze(replayedEventIds),
        recordedEventIds: Object.freeze(recordedEventIds),
        orderIdentical: index === events.length,
        eventsIdentical:
          replayedEventIds.length === recordedEventIds.length &&
          replayedEventIds.every((id, position) => id === recordedEventIds[position]),
        inventedReactions: 0 as const,
        absentEvents: absent.length,
        reDecidedPhysics: false as const,
        awardsGranted: 0 as const,
        learningArtifacts: 0 as const,
      });
      const runResult: DestructionReplayRun = Object.freeze({
        status: 'REPLAYED' as const,
        version: DESTRUCTION_REPLAY_VERSION,
        replayId: validRequest.replayId,
        events,
        reactions: Object.freeze(reactions),
        absent: Object.freeze(absent),
        truth,
        projection: projectionOf(),
        stats: statsFor(),
      });
      return runResult;
    },
    stats,
    reset(): DestructionSinkReset {
      requireContract(!disposed, 'Destruction replay is disposed');
      index = 0;
      playedReactions = 0;
      absentEntries = 0;
      return sink.reset();
    },
    dispose(): void {
      requireContract(!disposed, 'Destruction replay is disposed');
      sink.dispose();
      disposed = true;
    },
  });

  return Object.freeze({
    status: 'READY' as const,
    version: DESTRUCTION_REPLAY_VERSION,
    replayId: validRequest.replayId,
    replay,
  });
}

/** One stable identity for a replay of one chunk and one catalog, for the evidence report. */
export function destructionReplayId(sessionId: string, chunkId: string): string {
  return createStableId('destruction-replay', sessionId, [chunkId]);
}
