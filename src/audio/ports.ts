import type { AudioBufferSpec, AudioCategory } from './contracts';

/**
 * Backend port of the audio subsystem.
 *
 * The engine owns the mixing policy, the voice pool and the ownership rules; the backend owns the
 * actual audio graph. The real Web Audio implementation lives in `web-audio-backend.ts` and the
 * deterministic Node driver in `fake-backend.ts`.
 */
export type AudioBackendState = 'created' | 'running' | 'suspended' | 'closed';

export interface AudioBackendCounters {
  /** Audio contexts created so far; the engine allows exactly one per engine. */
  readonly contextsCreated: number;
  readonly voicesStarted: number;
  readonly voicesStopped: number;
  readonly buffersCreated: number;
  readonly bufferBytes: number;
  readonly gainUpdates: number;
}

export interface AudioVoiceRequest {
  readonly cueId: string;
  readonly category: AudioCategory;
  /** Owner identity: the vehicle id, the collision event id or the notification owner. */
  readonly ownerId: string;
  /** Linear gain of the voice, 0..1, before the category and master gains. */
  readonly gain: number;
  /** Playback rate of the voice; the engine follows the vehicle speed with it. */
  readonly playbackRate: number;
  readonly loop: boolean;
  /** Duration of a one-shot cue in seconds; ignored for loops. */
  readonly durationS: number;
  readonly buffer: AudioBufferSpec;
}

export interface AudioBackendVoice {
  readonly voiceId: number;
  setGain(gain: number): void;
  setPlaybackRate(rate: number): void;
  stop(): void;
  readonly state: 'playing' | 'stopped';
}

export interface AudioBackend {
  readonly kind: 'web-audio' | 'fake';
  readonly state: AudioBackendState;
  /**
   * Creates the audio context and resumes it.
   *
   * The engine calls this only from a player gesture: the context must not exist before that.
   */
  resume(): void;
  suspend(): void;
  /** Releases every voice and closes the context. */
  close(): void;
  /** Monotonic seconds used for one-shot expiry. */
  now(): number;
  play(request: AudioVoiceRequest): AudioBackendVoice;
  setMasterGain(gain: number): void;
  setCategoryGain(category: AudioCategory, gain: number): void;
  getCounters(): AudioBackendCounters;
}
