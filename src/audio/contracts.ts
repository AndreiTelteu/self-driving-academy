import { requireContract } from '../sessions';

/**
 * Mix buses of the audio engine.
 *
 * Each category owns an independent gain; `master` is the only global output control and `muted`
 * is the only switch that silences the output without touching the simulation.
 */
export const AUDIO_CATEGORIES = ['engine', 'impact', 'ui'] as const;
export type AudioCategory = (typeof AUDIO_CATEGORIES)[number];

/**
 * Engine lifecycle.
 *
 * `IDLE` means no audio context exists yet: the audio graph is only created from a player
 * gesture, never on page load. `SUSPENDED` means a context exists but is not producing sound.
 * `RUNNING` means the graph is live. `CLOSED` is terminal.
 */
export const AUDIO_ENGINE_STATES = ['IDLE', 'SUSPENDED', 'RUNNING', 'CLOSED'] as const;
export type AudioEngineState = (typeof AUDIO_ENGINE_STATES)[number];

/**
 * Player gestures that may unlock the audio context. The engine refuses any other trigger.
 */
export const AUDIO_GESTURE_KINDS = ['POINTER', 'KEYBOARD', 'TOUCH'] as const;
export type AudioGestureKind = (typeof AUDIO_GESTURE_KINDS)[number];

/**
 * Cues of the V1 audio set.
 *
 * The buffers are procedurally synthesised placeholders, not final recorded assets: the manifest
 * of module 16 admits them as placeholder buffers with a deterministic generator, and the real
 * recorded assets replace them without changing the engine contract.
 */
export const AUDIO_CUE_IDS = [
  'engine-loop',
  'tyre-screech',
  'brake-squeal',
  'impact',
  'takeover-notice',
  'profile-notice',
  'ui-tick',
] as const;
export type AudioCueId = (typeof AUDIO_CUE_IDS)[number];

/** Procedural buffers are mono, 22.05 kHz: half the memory of a 44.1 kHz stereo placeholder. */
export const AUDIO_SAMPLE_RATE = 22050;

export interface AudioBufferSpec {
  readonly cueId: AudioCueId;
  readonly sampleRate: number;
  readonly frames: number;
  readonly channels: number;
}

export interface AudioCueDefinition {
  readonly cueId: AudioCueId;
  readonly category: AudioCategory;
  /** Looping cues stay alive until their owner releases them; one-shot cues expire. */
  readonly loop: boolean;
  /** Higher priority wins a contested voice slot. */
  readonly priority: number;
  /** Duration of a one-shot cue in seconds; `0` marks an owned loop. */
  readonly durationS: number;
  readonly buffer: AudioBufferSpec;
}

function cue(
  cueId: AudioCueId,
  category: AudioCategory,
  loop: boolean,
  priority: number,
  durationS: number,
  seconds: number,
): AudioCueDefinition {
  const frames = Math.round(seconds * AUDIO_SAMPLE_RATE);
  return Object.freeze({
    cueId,
    category,
    loop,
    priority,
    durationS,
    buffer: Object.freeze({
      cueId,
      sampleRate: AUDIO_SAMPLE_RATE,
      frames,
      channels: 1,
    }),
  });
}

/** Fixed cue table. The set never grows at runtime, so the buffer registry is bounded by design. */
export const AUDIO_CUES: Readonly<Record<AudioCueId, AudioCueDefinition>> = Object.freeze({
  'engine-loop': cue('engine-loop', 'engine', true, 10, 0, 0.5),
  'tyre-screech': cue('tyre-screech', 'engine', false, 30, 0.6, 0.6),
  'brake-squeal': cue('brake-squeal', 'engine', false, 30, 0.5, 0.5),
  impact: cue('impact', 'impact', false, 60, 0.45, 0.45),
  'takeover-notice': cue('takeover-notice', 'ui', false, 40, 0.4, 0.4),
  'profile-notice': cue('profile-notice', 'ui', false, 40, 0.4, 0.4),
  'ui-tick': cue('ui-tick', 'ui', false, 20, 0.12, 0.12),
});

export function audioCue(cueId: AudioCueId): AudioCueDefinition {
  const definition = AUDIO_CUES[cueId];
  requireContract(definition !== undefined, 'Unknown audio cue');
  return definition;
}

/** Float32 PCM estimate of a buffer. Backing stores are owned by the backend, counted here. */
export function estimateAudioBufferBytes(spec: AudioBufferSpec): number {
  return spec.frames * spec.channels * 4;
}

/**
 * Admission caps of the audio subsystem.
 *
 * The caps are finite and explicit: voices per category, voices in total, audible vehicles,
 * distinct buffers and owned buffer bytes. A vehicle outside the audible radius or below the gain
 * threshold never reaches the pool, so a full city does not multiply the audio work.
 */
export interface AudioLimits {
  readonly version: string;
  readonly engineVoices: number;
  readonly impactVoices: number;
  readonly uiVoices: number;
  readonly totalVoices: number;
  readonly maxAudibleVehicles: number;
  /** Minimum audible gain of a vehicle or one-shot cue. */
  readonly audibleGainThreshold: number;
  /** Vehicles beyond this distance are inaudible and consume no voice. */
  readonly audibleDistanceM: number;
  /** Speed that maps to a fully open engine tone. */
  readonly referenceSpeedMps: number;
  readonly maxBuffers: number;
  readonly maxBufferBytes: number;
  /** Minimum interval between two repeated one-shot cues of the same owner. */
  readonly oneShotCooldownS: number;
}

export const AUDIO_LIMITS: AudioLimits = Object.freeze({
  version: '148-audio-v1',
  engineVoices: 6,
  impactVoices: 4,
  uiVoices: 4,
  totalVoices: 14,
  maxAudibleVehicles: 6,
  audibleGainThreshold: 0.05,
  audibleDistanceM: 35,
  referenceSpeedMps: 12,
  maxBuffers: 8,
  maxBufferBytes: 1024 * 1024,
  oneShotCooldownS: 0.4,
});

export function validateAudioLimits(limits: AudioLimits): AudioLimits {
  const positive = [
    limits.engineVoices,
    limits.impactVoices,
    limits.uiVoices,
    limits.totalVoices,
    limits.maxAudibleVehicles,
    limits.maxBuffers,
  ];
  requireContract(
    positive.every((value) => Number.isSafeInteger(value) && value > 0),
    'Audio limits must be positive integers',
  );
  requireContract(
    limits.engineVoices + limits.impactVoices + limits.uiVoices <= limits.totalVoices,
    'Category voice caps exceed the total voice cap',
  );
  requireContract(
    limits.audibleGainThreshold > 0 && limits.audibleGainThreshold <= 1,
    'Audible gain threshold must be within (0,1]',
  );
  requireContract(
    limits.audibleDistanceM > 0 && limits.referenceSpeedMps > 0,
    'Audible distance and reference speed must be positive',
  );
  requireContract(
    limits.maxBufferBytes > 0 && limits.oneShotCooldownS >= 0,
    'Buffer byte cap and cooldown must be valid',
  );
  return Object.freeze({ ...limits });
}

/** Per-vehicle audio state published by the simulation each tick. */
export interface VehicleAudioSample {
  readonly entityId: string;
  /** Forward speed in m/s. */
  readonly speedMps: number;
  /** Engine load in 0..1 (throttle plus payload). */
  readonly loadFactor: number;
  /** Brake pressure in 0..1. */
  readonly brakeFactor: number;
  /** Tyre slip in 0..1. */
  readonly slipFactor: number;
  /** Distance from the listener in metres. */
  readonly distanceM: number;
}

/** Collision impact published by the 028 collision events. */
export interface ImpactAudioEvent {
  readonly eventId: string;
  readonly tick: number;
  readonly vehicleId: string;
  readonly otherEntityId: string;
  /** Collision impulse in nanoseconds, as published by the 028 adapter. */
  readonly impulseNs: number;
  /** Distance from the listener in metres. */
  readonly distanceM: number;
}
