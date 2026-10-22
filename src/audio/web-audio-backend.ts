import { requireContract } from '../sessions';
import { AUDIO_CATEGORIES, AUDIO_LIMITS } from './contracts';
import type { AudioCategory, AudioCueId } from './contracts';
import { renderProceduralCue } from './procedural';
import type {
  AudioBackend,
  AudioBackendCounters,
  AudioBackendState,
  AudioBackendVoice,
  AudioVoiceRequest,
} from './ports';

/**
 * Minimal structural view of the Web Audio API.
 *
 * The adapter depends on the shape it needs, not on the DOM library, so the module compiles and
 * is testable under Node and the browser binding stays in one file.
 */
export interface WebAudioParamLike {
  value: number;
}
export interface WebAudioNodeLike {
  connect(target: unknown): unknown;
  disconnect(): void;
}
export interface WebAudioGainLike extends WebAudioNodeLike {
  readonly gain: WebAudioParamLike;
}
export interface WebAudioBufferLike {
  readonly length: number;
  getChannelData(channel: number): Float32Array;
}
export interface WebAudioBufferSourceLike extends WebAudioNodeLike {
  readonly playbackRate: WebAudioParamLike;
  buffer: WebAudioBufferLike | null;
  loop: boolean;
  onended: (() => void) | null;
  start(when?: number): void;
  stop(when?: number): void;
}
export interface WebAudioContextLike {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  createGain(): WebAudioGainLike;
  createBuffer(channels: number, frames: number, sampleRate: number): WebAudioBufferLike;
  createBufferSource(): WebAudioBufferSourceLike;
  resume(): Promise<void> | void;
  close(): Promise<void> | void;
}

export interface WebAudioBackendOptions {
  /** Injected factory; the default reads the browser constructor without touching the DOM lib. */
  readonly contextFactory?: () => WebAudioContextLike;
  /** Upper bound of cached audio buffers. */
  readonly maxBuffers?: number;
}

interface WebAudioVoice {
  readonly voiceId: number;
  readonly source: WebAudioBufferSourceLike;
  readonly gain: WebAudioGainLike;
  stopped: boolean;
}

function defaultContextFactory(): WebAudioContextLike {
  const scope = globalThis as unknown as {
    AudioContext?: new (options?: { sampleRate?: number }) => WebAudioContextLike;
    webkitAudioContext?: new (options?: { sampleRate?: number }) => WebAudioContextLike;
  };
  const constructor = scope.AudioContext ?? scope.webkitAudioContext;
  requireContract(constructor !== undefined, 'Web Audio API is unavailable');
  return new constructor({ sampleRate: 22050 });
}

/**
 * Real Web Audio adapter of the audio backend port.
 *
 * The audio context is created by `resume`, which the engine calls only from a player gesture:
 * nothing is allocated and nothing sounds before the player interacts with the game.
 */
export function createWebAudioBackend(options: WebAudioBackendOptions = {}): AudioBackend {
  const factory = options.contextFactory ?? defaultContextFactory;
  const maxBuffers = options.maxBuffers ?? AUDIO_LIMITS.maxBuffers;
  let state: AudioBackendState = 'created';
  let context: WebAudioContextLike | null = null;
  let master: WebAudioGainLike | null = null;
  const categoryNodes = new Map<AudioCategory, WebAudioGainLike>();
  const voices = new Map<number, WebAudioVoice>();
  const buffers = new Map<AudioCueId, WebAudioBufferLike>();
  let nextVoiceId = 1;
  let contextsCreated = 0;
  let voicesStarted = 0;
  let voicesStopped = 0;
  let buffersCreated = 0;
  let bufferBytes = 0;
  let gainUpdates = 0;

  const ensureGraph = (): WebAudioContextLike => {
    if (context !== null) return context;
    context = factory();
    contextsCreated += 1;
    master = context.createGain();
    master.connect(context.destination);
    for (const category of AUDIO_CATEGORIES) {
      const node = context.createGain();
      node.connect(master);
      categoryNodes.set(category, node);
    }
    return context;
  };
  const bufferFor = (cueId: AudioCueId, frames: number, sampleRate: number): WebAudioBufferLike => {
    const existing = buffers.get(cueId);
    if (existing !== undefined) return existing;
    const active = ensureGraph();
    requireContract(buffers.size < maxBuffers, 'Web Audio buffer cache is full');
    const buffer = active.createBuffer(1, frames, sampleRate);
    const channel = buffer.getChannelData(0);
    const rendered = renderProceduralCue(cueId, frames, sampleRate);
    channel.set(rendered);
    buffers.set(cueId, buffer);
    buffersCreated += 1;
    bufferBytes += frames * 4;
    return buffer;
  };
  const stopVoice = (voice: WebAudioVoice): void => {
    if (voice.stopped) return;
    voice.stopped = true;
    voices.delete(voice.voiceId);
    try {
      voice.source.stop();
    } catch {
      // The source may already be stopped by the browser; the node is released anyway.
    }
    voice.source.disconnect();
    voice.gain.disconnect();
    voicesStopped += 1;
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
    kind: 'web-audio',
    get state() {
      return state;
    },
    resume(): void {
      requireContract(state !== 'closed', 'Audio backend is closed');
      const active = ensureGraph();
      const resumed = active.resume();
      if (resumed instanceof Promise) resumed.catch(() => undefined);
      state = 'running';
    },
    suspend(): void {
      requireContract(state !== 'closed', 'Audio backend is closed');
      state = 'suspended';
    },
    close(): void {
      if (state === 'closed') return;
      for (const voice of [...voices.values()]) stopVoice(voice);
      voices.clear();
      buffers.clear();
      for (const node of categoryNodes.values()) node.disconnect();
      categoryNodes.clear();
      if (master !== null) {
        master.disconnect();
        master = null;
      }
      if (context !== null) {
        const closed = context.close();
        if (closed instanceof Promise) closed.catch(() => undefined);
        context = null;
      }
      state = 'closed';
    },
    now: () => (context === null ? 0 : context.currentTime),
    play(request: AudioVoiceRequest): AudioBackendVoice {
      requireContract(state === 'running', 'Audio backend is not running');
      const active = ensureGraph();
      const node = categoryNodes.get(request.category);
      requireContract(node !== undefined, 'Unknown audio category');
      const buffer = bufferFor(
        request.cueId as AudioCueId,
        request.buffer.frames,
        request.buffer.sampleRate,
      );
      const source = active.createBufferSource();
      source.buffer = buffer;
      source.loop = request.loop;
      source.playbackRate.value = request.playbackRate;
      const gain = active.createGain();
      gain.gain.value = request.gain;
      source.connect(gain);
      gain.connect(node);
      const voiceId = nextVoiceId++;
      const voice: WebAudioVoice = { voiceId, source, gain, stopped: false };
      voices.set(voiceId, voice);
      voicesStarted += 1;
      source.onended = () => {
        stopVoice(voice);
      };
      source.start();
      return Object.freeze({
        voiceId,
        setGain(value: number): void {
          if (voice.stopped) return;
          gain.gain.value = value;
          gainUpdates += 1;
        },
        setPlaybackRate(rate: number): void {
          if (voice.stopped) return;
          source.playbackRate.value = rate;
        },
        stop(): void {
          stopVoice(voice);
        },
        get state() {
          return voice.stopped ? 'stopped' : 'playing';
        },
      });
    },
    setMasterGain(gain: number): void {
      if (context === null || master === null) return;
      master.gain.value = gain;
      gainUpdates += 1;
    },
    setCategoryGain(category: AudioCategory, gain: number): void {
      const node = categoryNodes.get(category);
      if (node === undefined) return;
      node.gain.value = gain;
      gainUpdates += 1;
    },
    getCounters: counters,
  });
}
