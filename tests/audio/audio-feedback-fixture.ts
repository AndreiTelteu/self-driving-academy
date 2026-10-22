import { createAudioEngine, createFakeAudioBackend } from '../../src/audio';
import type {
  AudioEngine,
  AudioFeedbackVisual,
  FakeAudioBackend,
  FakeAudioVoiceState,
} from '../../src/audio';
import { createAudioFeedback } from '../../src/app';
import type { AudioFeedback } from '../../src/app';
import { createEventBus } from '../../src/simulation';
import type { EventBus, SimulationEvent } from '../../src/simulation';
import type { MissionTracker } from '../../src/missions';
import { createAudioFeedbackIndicator } from '../../src/ui';
import type { AudioFeedbackIndicator } from '../../src/ui';
import { createHudDocument, createHudHost } from '../ui/hud-dom';
import type { HudDocument, HudElement } from '../ui/hud-dom';

/**
 * 149 fixture: the real 148 engine on the deterministic fake backend, the real 007 event bus and
 * the real indicator of the UI module. No browser and no wall clock are involved.
 */
export const AUDIO_FEEDBACK_SESSION_ID = 'session:149-audio-feedback';
export const AUDIO_FEEDBACK_WORLD_EPOCH = 1;

export interface AudioFeedbackHarness {
  readonly backend: FakeAudioBackend;
  readonly engine: AudioEngine;
  readonly bus: EventBus;
  readonly feedback: AudioFeedback;
  readonly doc: HudDocument;
  readonly host: HudElement;
  readonly indicator: AudioFeedbackIndicator;
  /** Every visual companion shown by the feedback, in order. */
  readonly visuals: readonly AudioFeedbackVisual[];
  /** The indicator root, for the DOM assertions. */
  indicatorRoot(): HudElement;
  /** Every voice the backend ever started. */
  voices(): readonly FakeAudioVoiceState[];
  /** The voices that are still playing. */
  playingVoices(): readonly FakeAudioVoiceState[];
  /** The cue ids of the voices that were started, in order. */
  playedCues(): readonly string[];
  dispose(): void;
}

export function createAudioFeedbackHarness(
  options: { readonly gesture?: boolean; readonly missions?: MissionTracker } = {},
): AudioFeedbackHarness {
  const backend = createFakeAudioBackend(),
    engine = createAudioEngine({ backend }),
    bus = createEventBus({
      sessionId: AUDIO_FEEDBACK_SESSION_ID,
      worldEpoch: AUDIO_FEEDBACK_WORLD_EPOCH,
    }),
    doc = createHudDocument(),
    host = createHudHost(doc),
    indicator = createAudioFeedbackIndicator(host as unknown as HTMLElement),
    visuals: AudioFeedbackVisual[] = [];
  const feedback = createAudioFeedback({
    engine,
    eventBus: bus,
    ...(options.missions === undefined ? {} : { missions: options.missions }),
    visual: {
      show: (visual) => {
        visuals.push(visual);
        indicator.show(visual, visuals.length * 1000);
      },
    },
  });
  if (options.gesture !== false) engine.startFromUserGesture('POINTER');
  return {
    backend,
    engine,
    bus,
    feedback,
    doc,
    host,
    indicator,
    visuals,
    indicatorRoot: () => {
      const element = host.children[0];
      if (!element) throw new Error('Audio feedback indicator root is missing');
      return element;
    },
    voices: () => backend.getVoices(),
    playingVoices: () => backend.getVoices().filter((voice) => !voice.stopped),
    playedCues: () => backend.getVoices().map((voice) => voice.cueId),
    dispose: () => {
      feedback.dispose();
      indicator.dispose();
      bus.dispose();
      engine.dispose();
    },
  };
}

/** A real 007 `MANUAL_START` event: the takeover of the 066/068 seat. */
export function manualStartEvent(
  eventId: string,
  tick: number,
  vehicleId: string,
  controlMode: 'MANUAL' | 'LEARNING' = 'MANUAL',
): SimulationEvent {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: AUDIO_FEEDBACK_SESSION_ID,
    worldEpoch: AUDIO_FEEDBACK_WORLD_EPOCH,
    eventId,
    tick,
    entityIds: [vehicleId],
    type: 'MANUAL_START',
    payload: { vehicleId, controlMode },
  };
}

/** A real 007 `PROFILE_ACTIVATE` event: the applied profile version of 110/112. */
export function profileActivateEvent(
  eventId: string,
  tick: number,
  profileId: string,
  versionId: string,
): SimulationEvent {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: AUDIO_FEEDBACK_SESSION_ID,
    worldEpoch: AUDIO_FEEDBACK_WORLD_EPOCH,
    eventId,
    tick,
    entityIds: [profileId],
    type: 'PROFILE_ACTIVATE',
    payload: { profileId, versionId, learningEpoch: 1, activationTick: tick },
  };
}

/** A real 007 `DROPOFF` event: it satisfies the objective of the test mission. */
export function dropoffEvent(
  eventId: string,
  tick: number,
  vehicleId: string,
  rideId: string,
): SimulationEvent {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: AUDIO_FEEDBACK_SESSION_ID,
    worldEpoch: AUDIO_FEEDBACK_WORLD_EPOCH,
    eventId,
    tick,
    entityIds: [vehicleId, rideId],
    type: 'DROPOFF',
    payload: { vehicleId, rideId },
  };
}
