import { requireContract } from '../sessions';
import type { AudioCategory } from './contracts';
import type {
  AudioBackend,
  AudioBackendCounters,
  AudioBackendState,
  AudioBackendVoice,
  AudioVoiceRequest,
} from './ports';

export type FakeAudioLogType =
  | 'context-created'
  | 'resumed'
  | 'suspended'
  | 'closed'
  | 'voice-start'
  | 'voice-stop'
  | 'gain'
  | 'playback-rate'
  | 'master-gain'
  | 'category-gain';

export interface FakeAudioLogEntry {
  readonly type: FakeAudioLogType;
  readonly voiceId?: number;
  readonly cueId?: string;
  readonly category?: AudioCategory;
  readonly ownerId?: string;
  readonly gain?: number;
  readonly value?: number;
  readonly at: number;
}

export interface FakeAudioVoiceRecord {
  readonly voiceId: number;
  readonly cueId: string;
  readonly category: AudioCategory;
  readonly ownerId: string;
  gain: number;
  playbackRate: number;
  readonly loop: boolean;
  readonly startedAt: number;
  readonly expiresAt: number | null;
  stopped: boolean;
}

export type FakeAudioVoiceState = Readonly<FakeAudioVoiceRecord>;

export interface FakeAudioBackend extends AudioBackend {
  /** Advances the deterministic clock; one-shot voices expire through the engine. */
  advance(seconds: number): void;
  readonly log: readonly FakeAudioLogEntry[];
  /** Entries dropped because the bounded log reached its capacity. */
  readonly droppedLogEntries: number;
  getVoices(): readonly FakeAudioVoiceState[];
  getMasterGain(): number;
  getCategoryGain(category: AudioCategory): number;
}

/** The fake keeps a bounded journal: a test driver never grows without a limit. */
export const FAKE_AUDIO_LOG_CAPACITY = 512;

/**
 * Deterministic Node driver of the audio backend port.
 *
 * It records every graph operation so the tests can prove what the engine asked for without a
 * browser: the context creation, the voices, the gains and the ownership.
 */
export function createFakeAudioBackend(): FakeAudioBackend {
  let state: AudioBackendState = 'created';
  let now = 0;
  let nextVoiceId = 1;
  let masterGain = 1;
  const categoryGains: Record<AudioCategory, number> = { engine: 1, impact: 1, ui: 1 };
  const voices = new Map<number, FakeAudioVoiceRecord>();
  const log: FakeAudioLogEntry[] = [];
  let contextsCreated = 0;
  let voicesStarted = 0;
  let voicesStopped = 0;
  let buffersCreated = 0;
  let bufferBytes = 0;
  let gainUpdates = 0;
  let droppedLogEntries = 0;
  const push = (entry: FakeAudioLogEntry) => {
    log.push(Object.freeze(entry));
    if (log.length > FAKE_AUDIO_LOG_CAPACITY) {
      log.shift();
      droppedLogEntries += 1;
    }
  };
  const counters = (): AudioBackendCounters =>
    Object.freeze({
      contextsCreated,
      voicesStarted,
      voicesStopped,
      buffersCreated,
      bufferBytes,
      gainUpdates,
    });
  return Object.freeze({
    kind: 'fake',
    get state() {
      return state;
    },
    resume(): void {
      requireContract(state !== 'closed', 'Audio backend is closed');
      if (state === 'created') {
        contextsCreated += 1;
        state = 'running';
        push(Object.freeze({ type: 'context-created', at: now }));
      }
      state = 'running';
      push(Object.freeze({ type: 'resumed', at: now }));
    },
    suspend(): void {
      requireContract(state !== 'closed', 'Audio backend is closed');
      state = 'suspended';
      push(Object.freeze({ type: 'suspended', at: now }));
    },
    close(): void {
      if (state === 'closed') return;
      for (const voice of voices.values()) {
        if (voice.stopped) continue;
        voice.stopped = true;
        voicesStopped += 1;
        push(Object.freeze({ type: 'voice-stop', voiceId: voice.voiceId, at: now }));
      }
      state = 'closed';
      push(Object.freeze({ type: 'closed', at: now }));
    },
    now: () => now,
    play(request: AudioVoiceRequest): AudioBackendVoice {
      requireContract(state === 'running', 'Audio backend is not running');
      const voiceId = nextVoiceId++;
      buffersCreated += 1;
      bufferBytes += request.buffer.frames * request.buffer.channels * 4;
      const state0: FakeAudioVoiceRecord = {
        voiceId,
        cueId: request.cueId,
        category: request.category,
        ownerId: request.ownerId,
        gain: request.gain,
        playbackRate: request.playbackRate,
        loop: request.loop,
        startedAt: now,
        expiresAt: request.loop ? null : now + request.durationS,
        stopped: false,
      };
      voices.set(voiceId, state0);
      voicesStarted += 1;
      push(
        Object.freeze({
          type: 'voice-start',
          voiceId,
          cueId: request.cueId,
          category: request.category,
          ownerId: request.ownerId,
          gain: request.gain,
          at: now,
        }),
      );
      return Object.freeze({
        voiceId,
        setGain(gain: number): void {
          const current = voices.get(voiceId);
          if (current === undefined || current.stopped) return;
          current.gain = gain;
          gainUpdates += 1;
          push(Object.freeze({ type: 'gain', voiceId, gain, at: now }));
        },
        setPlaybackRate(rate: number): void {
          const current = voices.get(voiceId);
          if (current === undefined || current.stopped) return;
          current.playbackRate = rate;
          push(Object.freeze({ type: 'playback-rate', voiceId, value: rate, at: now }));
        },
        stop(): void {
          const current = voices.get(voiceId);
          if (current === undefined || current.stopped) return;
          current.stopped = true;
          voicesStopped += 1;
          push(Object.freeze({ type: 'voice-stop', voiceId, at: now }));
        },
        get state() {
          return voiceState(voices.get(voiceId));
        },
      });
    },
    setMasterGain(gain: number): void {
      masterGain = gain;
      gainUpdates += 1;
      push(Object.freeze({ type: 'master-gain', value: gain, at: now }));
    },
    setCategoryGain(category: AudioCategory, gain: number): void {
      categoryGains[category] = gain;
      gainUpdates += 1;
      push(Object.freeze({ type: 'category-gain', category, value: gain, at: now }));
    },
    getCounters: counters,
    advance(seconds: number): void {
      requireContract(Number.isFinite(seconds) && seconds >= 0, 'Invalid fake clock advance');
      now += seconds;
    },
    get log(): readonly FakeAudioLogEntry[] {
      return Object.freeze([...log]);
    },
    get droppedLogEntries(): number {
      return droppedLogEntries;
    },
    getVoices(): readonly FakeAudioVoiceState[] {
      return Object.freeze([...voices.values()].map((voice) => Object.freeze({ ...voice })));
    },
    getMasterGain: () => masterGain,
    getCategoryGain: (category: AudioCategory) => categoryGains[category],
  });
}

function voiceState(voice: FakeAudioVoiceRecord | undefined): 'playing' | 'stopped' {
  if (voice === undefined) return 'stopped';
  return voice.stopped ? 'stopped' : 'playing';
}
