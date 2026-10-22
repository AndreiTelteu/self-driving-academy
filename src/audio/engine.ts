import { requireContract } from '../sessions';
import { defaultAudioPreferences, parseAudioPreferences, type AudioPreferences } from '../settings';
import {
  AUDIO_CATEGORIES,
  AUDIO_LIMITS as DEFAULT_LIMITS,
  audioCue,
  estimateAudioBufferBytes,
  validateAudioLimits,
} from './contracts';
import type {
  AudioCategory,
  AudioCueId,
  AudioEngineState,
  AudioGestureKind,
  AudioLimits,
  ImpactAudioEvent,
  VehicleAudioSample,
} from './contracts';
import type { AudioBackend, AudioBackendVoice } from './ports';

/** One-shot cue kinds that the simulation may request explicitly. */
export const AUDIO_ONE_SHOT_CUES = [
  'tyre-screech',
  'brake-squeal',
  'takeover-notice',
  'profile-notice',
  'ui-tick',
] as const;
export type AudioOneShotCueId = (typeof AUDIO_ONE_SHOT_CUES)[number];

export interface AudioEngineOptions {
  /** Backend port. The Web Audio adapter and the deterministic fake share this contract. */
  readonly backend: AudioBackend;
  readonly preferences?: AudioPreferences;
  readonly limits?: AudioLimits;
}

export interface VehicleAudioUpdate {
  readonly entityId: string;
  /** True when the vehicle holds an audible voice after the update. */
  readonly audible: boolean;
  /** Audibility in 0..1 before the category and master gains. */
  readonly audibility: number;
  /** Voice allocated, reused or released by this update. */
  readonly voice: 'ALLOCATED' | 'REUSED' | 'RELEASED' | 'SKIPPED';
  /** The engine was not running yet: nothing was played. */
  readonly skipped: boolean;
}

export interface ImpactAudioResult {
  readonly played: boolean;
  readonly voiceId: number | null;
  readonly reason: 'PLAYED' | 'AWAITING_GESTURE' | 'DROPPED' | 'DISPOSED';
}

export interface AudioEngineStats {
  readonly state: AudioEngineState;
  readonly muted: boolean;
  readonly masterGain: number;
  /** Category gains as configured, independent of the master and the mute switch. */
  readonly categoryGains: Readonly<Record<AudioCategory, number>>;
  /** Product of master, mute and category gain: the gain actually applied to the output. */
  readonly effectiveGains: Readonly<Record<AudioCategory, number>>;
  readonly activeVoices: number;
  readonly voicesByCategory: Readonly<Record<AudioCategory, number>>;
  readonly audibleVehicles: number;
  readonly inaudibleVehicles: number;
  readonly buffers: number;
  readonly bufferBytes: number;
  readonly voiceStarts: number;
  readonly voiceStops: number;
  readonly gainUpdates: number;
  readonly stolenVoices: number;
  readonly droppedCues: number;
  readonly evictedVehicles: number;
  /** Vehicles refused because the audible vehicle cap was reached. */
  readonly capSkips: number;
  readonly vehicleUpdates: number;
  readonly audibleUpdates: number;
  readonly inaudibleUpdates: number;
  /** One-shot cues suppressed because their owner was still inside the cooldown. */
  readonly cooldownSkips: number;
  /** Cues refused because the engine had no player gesture yet. */
  readonly skippedBeforeGesture: number;
  readonly impactsPlayed: number;
  readonly impactsSkipped: number;
  readonly disposed: boolean;
}

interface VoiceRecord {
  readonly voiceId: number;
  readonly cueId: AudioCueId;
  readonly category: AudioCategory;
  readonly ownerId: string;
  readonly priority: number;
  readonly sequence: number;
  readonly loop: boolean;
  /** Backend time at which a one-shot voice expires; `null` for loops. */
  readonly expiresAt: number | null;
  readonly backend: AudioBackendVoice;
}

interface AudibleVehicle {
  readonly distanceM: number;
  readonly audibility: number;
  readonly sequence: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Audio engine of 148.
 *
 * The engine owns the mixing policy, the voice pool with its caps and the ownership of every
 * voice. It never touches the simulation: muting silences the output only, and disposing the
 * engine releases the audio resources only.
 */
export function createAudioEngine(options: AudioEngineOptions) {
  const backend = options.backend;
  const limits = validateAudioLimits(options.limits ?? DEFAULT_LIMITS);
  let preferences = options.preferences
    ? parseAudioPreferences(options.preferences)
    : defaultAudioPreferences();
  let state: AudioEngineState = 'IDLE';
  let disposed = false;
  const voices = new Map<number, VoiceRecord>();
  /** Engine loops owned by a vehicle; an owner holds at most one loop voice per category. */
  const owners = new Map<string, number>();
  const audibleVehicles = new Map<string, AudibleVehicle>();
  const buffers = new Map<AudioCueId, number>();
  const lastOneShotAt = new Map<string, number>();
  let nextVoiceId = 1;
  let nextSequence = 1;
  let voiceStarts = 0;
  let voiceStops = 0;
  let gainUpdates = 0;
  let stolenVoices = 0;
  let droppedCues = 0;
  let evictedVehicles = 0;
  let capSkips = 0;
  let vehicleUpdates = 0;
  let audibleUpdates = 0;
  let inaudibleUpdates = 0;
  let cooldownSkips = 0;
  let skippedBeforeGesture = 0;
  let impactsPlayed = 0;
  let impactsSkipped = 0;
  let inaudibleVehicles = 0;

  const assertLive = () => {
    requireContract(!disposed, 'Audio engine is disposed');
  };
  const categoryGains = (): Record<AudioCategory, number> => ({
    engine: preferences.engine,
    impact: preferences.impact,
    ui: preferences.ui,
  });
  const effectiveGains = (): Record<AudioCategory, number> => {
    const master = preferences.muted ? 0 : preferences.master;
    return {
      engine: master * preferences.engine,
      impact: master * preferences.impact,
      ui: master * preferences.ui,
    };
  };
  const pushGains = () => {
    backend.setMasterGain(preferences.muted ? 0 : preferences.master);
    const gains = categoryGains();
    for (const category of AUDIO_CATEGORIES) backend.setCategoryGain(category, gains[category]);
  };
  const releaseVoice = (record: VoiceRecord) => {
    if (!voices.has(record.voiceId)) return;
    voices.delete(record.voiceId);
    if (owners.get(record.ownerId) === record.voiceId) owners.delete(record.ownerId);
    record.backend.stop();
    voiceStops += 1;
  };
  const expireOneShots = () => {
    const now = backend.now();
    for (const record of [...voices.values()]) {
      if (record.expiresAt !== null && record.expiresAt <= now) releaseVoice(record);
    }
  };
  const voicesInCategory = (category: AudioCategory): VoiceRecord[] =>
    [...voices.values()].filter((record) => record.category === category);
  /**
   * Deterministic victim selection: the lowest priority first, the oldest sequence breaks ties.
   */
  const pickVictim = (category: AudioCategory, ownerId: string): VoiceRecord | null => {
    const candidates = voicesInCategory(category).filter((record) => record.ownerId !== ownerId);
    if (candidates.length === 0) return null;
    candidates.sort(
      (left, right) => left.priority - right.priority || right.sequence - left.sequence,
    );
    return candidates[0] ?? null;
  };
  const registerBuffer = (cueId: AudioCueId): void => {
    if (buffers.has(cueId)) return;
    const definition = audioCue(cueId);
    const bytes = estimateAudioBufferBytes(definition.buffer);
    requireContract(
      buffers.size < limits.maxBuffers && bytes <= limits.maxBufferBytes,
      'Audio buffer admission cap exceeded',
    );
    buffers.set(cueId, bytes);
  };
  const allocateVoice = (options2: {
    readonly cueId: AudioCueId;
    readonly category: AudioCategory;
    readonly ownerId: string;
    readonly gain: number;
    readonly priority: number;
    readonly loop: boolean;
    readonly durationS: number;
  }): VoiceRecord | null => {
    const definition = audioCue(options2.cueId);
    const categoryCap =
      options2.category === 'engine'
        ? limits.engineVoices
        : options2.category === 'impact'
          ? limits.impactVoices
          : limits.uiVoices;
    const categoryVoices = voicesInCategory(options2.category);
    if (categoryVoices.length >= categoryCap) {
      const victim = pickVictim(options2.category, options2.ownerId);
      if (victim === null || victim.priority >= options2.priority) {
        droppedCues += 1;
        return null;
      }
      stolenVoices += 1;
      releaseVoice(victim);
    }
    if (voices.size >= limits.totalVoices) {
      droppedCues += 1;
      return null;
    }
    registerBuffer(options2.cueId);
    const voiceId = nextVoiceId++;
    const sequence = nextSequence++;
    const now = backend.now();
    const backendVoice = backend.play({
      cueId: options2.cueId,
      category: options2.category,
      ownerId: options2.ownerId,
      gain: options2.gain,
      playbackRate: 1,
      loop: options2.loop,
      durationS: options2.durationS,
      buffer: definition.buffer,
    });
    voiceStarts += 1;
    const record: VoiceRecord = {
      voiceId,
      cueId: options2.cueId,
      category: options2.category,
      ownerId: options2.ownerId,
      priority: options2.priority,
      sequence,
      loop: options2.loop,
      expiresAt: options2.loop ? null : now + options2.durationS,
      backend: backendVoice,
    };
    voices.set(voiceId, record);
    if (options2.loop) owners.set(options2.ownerId, voiceId);
    return record;
  };
  const releaseVehicle = (entityId: string): number => {
    let released = 0;
    for (const record of [...voices.values()]) {
      if (record.ownerId !== entityId) continue;
      releaseVoice(record);
      released += 1;
    }
    audibleVehicles.delete(entityId);
    return released;
  };
  const audibilityOf = (sample: VehicleAudioSample): number => {
    const distanceFactor = clamp01(1 - sample.distanceM / limits.audibleDistanceM);
    const motionFactor = clamp01(sample.speedMps / limits.referenceSpeedMps);
    const loadGain = 0.55 + 0.45 * clamp01(sample.loadFactor);
    return clamp01(distanceFactor * motionFactor * loadGain);
  };
  const evictFarthestVehicle = (keep: string): void => {
    let worstId = '';
    let worst: AudibleVehicle | null = null;
    for (const [entityId, entry] of audibleVehicles) {
      if (entityId === keep) continue;
      if (
        worst === null ||
        entry.distanceM > worst.distanceM ||
        (entry.distanceM === worst.distanceM && entityId > worstId)
      ) {
        worst = entry;
        worstId = entityId;
      }
    }
    if (worst === null) return;
    evictedVehicles += 1;
    releaseVehicle(worstId);
  };
  /** Distance of the farthest audible vehicle, used to keep the closest vehicles audible. */
  const farthestAudibleDistanceM = (keep: string): number => {
    let farthest = -1;
    for (const [entityId, entry] of audibleVehicles) {
      if (entityId === keep) continue;
      if (entry.distanceM > farthest) farthest = entry.distanceM;
    }
    return farthest;
  };
  const applyPreferences = (next: AudioPreferences): AudioPreferences => {
    preferences = parseAudioPreferences(next);
    if (state === 'RUNNING') pushGains();
    return preferences;
  };

  return Object.freeze({
    /**
     * Unlocks the audio graph from a player gesture.
     *
     * The audio context is created here and nowhere else: before the gesture the engine stays
     * `IDLE` and every cue is refused instead of playing in the background.
     */
    startFromUserGesture(gesture: AudioGestureKind): AudioEngineState {
      assertLive();
      requireContract(
        gesture === 'POINTER' || gesture === 'KEYBOARD' || gesture === 'TOUCH',
        'Audio requires a player gesture',
      );
      if (state === 'RUNNING') return state;
      backend.resume();
      state = 'RUNNING';
      pushGains();
      return state;
    },
    /** Suspends the output without releasing the voices or the ownership. */
    suspend(): AudioEngineState {
      assertLive();
      if (state === 'RUNNING') {
        backend.suspend();
        state = 'SUSPENDED';
      }
      return state;
    },
    /** Publishes the per-vehicle audio state of the current tick. */
    updateVehicle(sample: VehicleAudioSample): VehicleAudioUpdate {
      assertLive();
      requireContract(
        typeof sample.entityId === 'string' && sample.entityId.length > 0,
        'Bad owner',
      );
      vehicleUpdates += 1;
      if (state !== 'RUNNING') {
        skippedBeforeGesture += 1;
        inaudibleUpdates += 1;
        return Object.freeze({
          entityId: sample.entityId,
          audible: false,
          audibility: 0,
          voice: 'SKIPPED',
          skipped: true,
        });
      }
      expireOneShots();
      const audibility = audibilityOf(sample);
      if (audibility < limits.audibleGainThreshold) {
        inaudibleUpdates += 1;
        releaseVehicle(sample.entityId);
        return Object.freeze({
          entityId: sample.entityId,
          audible: false,
          audibility,
          voice: 'RELEASED',
          skipped: false,
        });
      }
      audibleUpdates += 1;
      if (!audibleVehicles.has(sample.entityId)) {
        // Only the closest vehicles stay audible: a distant one never takes a voice slot.
        if (audibleVehicles.size >= limits.maxAudibleVehicles) {
          const farthest = farthestAudibleDistanceM(sample.entityId);
          if (farthest >= 0 && sample.distanceM >= farthest) {
            inaudibleUpdates += 1;
            audibleUpdates -= 1;
            capSkips += 1;
            return Object.freeze({
              entityId: sample.entityId,
              audible: false,
              audibility,
              voice: 'SKIPPED',
              skipped: false,
            });
          }
          evictFarthestVehicle(sample.entityId);
        }
        audibleVehicles.set(sample.entityId, {
          distanceM: sample.distanceM,
          audibility,
          sequence: nextSequence++,
        });
      } else {
        const entry = audibleVehicles.get(sample.entityId);
        audibleVehicles.set(sample.entityId, {
          distanceM: sample.distanceM,
          audibility,
          sequence: entry?.sequence ?? nextSequence++,
        });
      }
      const priority = Math.max(1, Math.round(audibility * 100));
      const existingId = owners.get(sample.entityId);
      const existing = existingId === undefined ? undefined : voices.get(existingId);
      if (existing !== undefined && existing.cueId === 'engine-loop') {
        existing.backend.setGain(audibility);
        existing.backend.setPlaybackRate(
          clamp01(sample.speedMps / limits.referenceSpeedMps) * 0.8 + 0.6,
        );
        gainUpdates += 1;
        return Object.freeze({
          entityId: sample.entityId,
          audible: true,
          audibility,
          voice: 'REUSED',
          skipped: false,
        });
      }
      const record = allocateVoice({
        cueId: 'engine-loop',
        category: 'engine',
        ownerId: sample.entityId,
        gain: audibility,
        priority,
        loop: true,
        durationS: 0,
      });
      if (record === null) {
        audibleVehicles.delete(sample.entityId);
        return Object.freeze({
          entityId: sample.entityId,
          audible: false,
          audibility,
          voice: 'SKIPPED',
          skipped: false,
        });
      }
      record.backend.setPlaybackRate(
        clamp01(sample.speedMps / limits.referenceSpeedMps) * 0.8 + 0.6,
      );
      return Object.freeze({
        entityId: sample.entityId,
        audible: true,
        audibility,
        voice: 'ALLOCATED',
        skipped: false,
      });
    },
    /** Plays the collision impact published by the 028 collision events. */
    handleImpact(event: ImpactAudioEvent): ImpactAudioResult {
      assertLive();
      if (state !== 'RUNNING') {
        skippedBeforeGesture += 1;
        impactsSkipped += 1;
        return Object.freeze({ played: false, voiceId: null, reason: 'AWAITING_GESTURE' });
      }
      expireOneShots();
      const distanceFactor = clamp01(1 - event.distanceM / limits.audibleDistanceM);
      const impulseGain = clamp01(event.impulseNs / 5_000_000);
      const gain = clamp01(Math.max(0.2, impulseGain) * distanceFactor);
      if (gain < limits.audibleGainThreshold) {
        impactsSkipped += 1;
        return Object.freeze({ played: false, voiceId: null, reason: 'DROPPED' });
      }
      const record = allocateVoice({
        cueId: 'impact',
        category: 'impact',
        ownerId: event.eventId,
        gain,
        priority: 60,
        loop: false,
        durationS: audioCue('impact').durationS,
      });
      if (record === null) {
        impactsSkipped += 1;
        return Object.freeze({ played: false, voiceId: null, reason: 'DROPPED' });
      }
      impactsPlayed += 1;
      return Object.freeze({ played: true, voiceId: record.voiceId, reason: 'PLAYED' });
    },
    /** Plays an explicit one-shot cue, for example a takeover or profile notification. */
    playOneShot(cueId: AudioOneShotCueId, ownerId: string, gain = 1): ImpactAudioResult {
      assertLive();
      requireContract(
        (AUDIO_ONE_SHOT_CUES as readonly string[]).includes(cueId),
        'Unsupported one-shot cue',
      );
      if (state !== 'RUNNING') {
        skippedBeforeGesture += 1;
        return Object.freeze({ played: false, voiceId: null, reason: 'AWAITING_GESTURE' });
      }
      expireOneShots();
      const definition = audioCue(cueId);
      const now = backend.now();
      const previous = lastOneShotAt.get(ownerId);
      if (previous !== undefined && now - previous < limits.oneShotCooldownS) {
        cooldownSkips += 1;
        return Object.freeze({ played: false, voiceId: null, reason: 'DROPPED' });
      }
      const record = allocateVoice({
        cueId,
        category: definition.category,
        ownerId,
        gain: clamp01(gain),
        priority: definition.priority,
        loop: false,
        durationS: definition.durationS,
      });
      if (record === null)
        return Object.freeze({ played: false, voiceId: null, reason: 'DROPPED' });
      lastOneShotAt.set(ownerId, now);
      return Object.freeze({ played: true, voiceId: record.voiceId, reason: 'PLAYED' });
    },
    /** Applies the persisted audio preferences: master, the three category gains and the mute. */
    applyPreferences(next: AudioPreferences): AudioPreferences {
      assertLive();
      return applyPreferences(next);
    },
    /** Mutes or unmutes the output. The simulation, the telemetry and the HUD are untouched. */
    setMuted(muted: boolean): AudioPreferences {
      assertLive();
      return applyPreferences({ ...preferences, muted });
    },
    /** Releases every voice owned by a vehicle, for example when the vehicle leaves the world. */
    releaseVehicle(entityId: string): number {
      assertLive();
      return releaseVehicle(entityId);
    },
    getStats(): AudioEngineStats {
      const byCategory: Record<AudioCategory, number> = { engine: 0, impact: 0, ui: 0 };
      for (const record of voices.values()) byCategory[record.category] += 1;
      let bufferBytes = 0;
      for (const bytes of buffers.values()) bufferBytes += bytes;
      inaudibleVehicles = vehicleUpdates - audibleUpdates;
      return Object.freeze({
        state,
        muted: preferences.muted,
        masterGain: preferences.master,
        categoryGains: Object.freeze(categoryGains()),
        effectiveGains: Object.freeze(effectiveGains()),
        activeVoices: voices.size,
        voicesByCategory: Object.freeze(byCategory),
        audibleVehicles: audibleVehicles.size,
        inaudibleVehicles,
        buffers: buffers.size,
        bufferBytes,
        voiceStarts,
        voiceStops,
        gainUpdates,
        stolenVoices,
        droppedCues,
        evictedVehicles,
        capSkips,
        vehicleUpdates,
        audibleUpdates,
        inaudibleUpdates,
        cooldownSkips,
        skippedBeforeGesture,
        impactsPlayed,
        impactsSkipped,
        disposed,
      });
    },
    /** Releases every voice, the ownership and the audio context. The call is idempotent. */
    dispose(): void {
      if (disposed) return;
      for (const record of [...voices.values()]) releaseVoice(record);
      owners.clear();
      audibleVehicles.clear();
      lastOneShotAt.clear();
      buffers.clear();
      backend.close();
      disposed = true;
      state = 'CLOSED';
    },
  });
}

export type AudioEngine = ReturnType<typeof createAudioEngine>;
