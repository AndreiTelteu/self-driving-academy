import { requireContract, text } from '../sessions';
import type { AudioEngine, AudioOneShotCueId } from '../audio';
import type { AudioFeedbackInput, AudioFeedbackKind, AudioFeedbackVisual } from '../audio';
import {
  AUDIO_FEEDBACK_VERSION,
  audioFeedbackOwner,
  createAudioFeedbackState,
  reduceAudioFeedback,
} from '../audio';
import type { EventBus } from '../simulation';
import type { MissionTracker } from '../missions';
import { learningNotificationKindView } from '../ui';
import type { LearningNotificationEvent } from '../ui';

/**
 * 149 composition root: the real events become the real sounds.
 *
 * The root binds four real sources to the 148 engine:
 *
 * - the 007 `MANUAL_START` event becomes the takeover cue (066/068 seat);
 * - the 007 `PROFILE_ACTIVATE` event and the explicit 110/112 publication payload become the
 *   publication cue;
 * - the 116 mission instance read from the real mission tracker becomes the mission cue;
 * - the 079 learning notification becomes the analysis cue, and a `PUBLISHED` notification shares
 *   the publication key, so the activation and the notification never sound twice.
 *
 * The root never invents an event, never announces an anticipated state and never bypasses the
 * 148 voice limits: every cue goes through `playOneShot`, so the caps, the cooldown and the mute
 * of the engine stay in force.
 */
export const AUDIO_FEEDBACK_APP_VERSION = '149-audio-feedback-app-v1' as const;

/** The visual channel of the feedback. The visual never depends on the audio. */
export interface AudioFeedbackVisualPort {
  show(visual: AudioFeedbackVisual): void;
}

export interface AudioFeedbackServices {
  /** The real 148 engine. */
  readonly engine: AudioEngine;
  /** The real 007 event bus; the takeover and the activation are read from it. */
  readonly eventBus?: EventBus;
  /** The real 116 mission tracker; the mission state is read from it. */
  readonly missions?: MissionTracker;
  /** The visual twin of the feedback; the indicator of the UI module. */
  readonly visual?: AudioFeedbackVisualPort;
}

export type AudioFeedbackStatus =
  'PLAYED' | 'DUPLICATE' | 'SILENT' | 'DROPPED' | 'AWAITING_GESTURE' | 'UNKNOWN_MISSION';

export interface AudioFeedbackResult {
  readonly status: AudioFeedbackStatus;
  readonly kind: AudioFeedbackKind;
  readonly cueId: AudioOneShotCueId | null;
  readonly key: string;
  /** `true` when the feedback arrived after a newer event. */
  readonly late: boolean;
  /** The visual twin of the sound; `null` when nothing was accepted. */
  readonly visual: AudioFeedbackVisual | null;
}

export interface AudioFeedbackStats {
  readonly version: typeof AUDIO_FEEDBACK_VERSION;
  readonly appVersion: typeof AUDIO_FEEDBACK_APP_VERSION;
  /** Feedbacks accepted and turned into a cue. */
  readonly emitted: number;
  /** Feedbacks refused because their key was already emitted. */
  readonly duplicates: number;
  /** Feedbacks without a cue. */
  readonly silent: number;
  /** Cues the 148 engine actually played. */
  readonly played: number;
  /** Cues the 148 engine dropped (voice cap or cooldown). */
  readonly dropped: number;
  /** Cues refused because the engine had no player gesture yet. */
  readonly awaitingGesture: number;
  /** Mission requests for an instance the 116 tracker does not know. */
  readonly unknownMissions: number;
  /** Visual companions shown. */
  readonly visualShown: number;
  /** Keys retained by the bounded idempotency registry. */
  readonly retainedKeys: number;
  /** Keys dropped from the bounded registry. */
  readonly droppedKeys: number;
  /** The newest observed tick. */
  readonly lastTick: number;
  readonly disposed: boolean;
}

export interface AudioFeedback {
  /** The 007 takeover event (066/068) becomes the takeover cue. */
  publishTakeover(input: {
    readonly eventId: string;
    readonly tick: number;
    readonly vehicleId: string;
    readonly controlMode: 'MANUAL' | 'LEARNING';
  }): AudioFeedbackResult;
  /** The real 110/112 publication payload becomes the publication cue. */
  publishPublication(input: {
    readonly eventId: string;
    readonly tick: number;
    readonly publicationVersionId: string;
    readonly profileId: string;
    readonly published: true;
  }): AudioFeedbackResult;
  /** The real 116 mission instance becomes the mission cue. */
  publishMissionState(instanceId: string): AudioFeedbackResult;
  /** The real 079 notification becomes the analysis cue. */
  publishLearningNotification(event: LearningNotificationEvent): AudioFeedbackResult;
  getStats(): AudioFeedbackStats;
  dispose(): void;
}

function statusOf(reason: string): AudioFeedbackStatus {
  if (reason === 'PLAYED') return 'PLAYED';
  if (reason === 'AWAITING_GESTURE') return 'AWAITING_GESTURE';
  return 'DROPPED';
}

export function createAudioFeedback(services: AudioFeedbackServices): AudioFeedback {
  const engine = services.engine;
  requireContract(
    typeof engine === 'object' && engine !== null && typeof engine.playOneShot === 'function',
    'The audio feedback requires the real 148 engine',
  );
  const visual = services.visual;
  if (visual !== undefined)
    requireContract(
      typeof visual.show === 'function',
      'The audio feedback visual port requires a show function',
    );
  let state = createAudioFeedbackState();
  let played = 0;
  let dropped = 0;
  let awaitingGesture = 0;
  let unknownMissions = 0;
  let visualShown = 0;
  let disposed = false;
  let unsubscribe: (() => void) | null = null;

  const assertLive = () => {
    requireContract(!disposed, 'Audio feedback is disposed');
  };

  const apply = (input: AudioFeedbackInput): AudioFeedbackResult => {
    assertLive();
    const reduced = reduceAudioFeedback(state, input);
    state = reduced.state;
    const decision = reduced.decision;
    if (decision.outcome === 'DUPLICATE')
      return Object.freeze({
        status: 'DUPLICATE',
        kind: decision.kind,
        cueId: null,
        key: decision.key,
        late: decision.late,
        visual: null,
      });
    if (decision.outcome === 'SILENT')
      return Object.freeze({
        status: 'SILENT',
        kind: decision.kind,
        cueId: null,
        key: decision.key,
        late: decision.late,
        visual: null,
      });
    // The visual twin is shown even when the engine refuses the sound: the information never
    // depends on the audio being available.
    if (visual !== undefined && decision.visual !== null) {
      visual.show(decision.visual);
      visualShown += 1;
    }
    const result = engine.playOneShot(
      decision.cueId as AudioOneShotCueId,
      audioFeedbackOwner(decision.kind),
      decision.gain,
    );
    if (result.played) played += 1;
    else if (result.reason === 'AWAITING_GESTURE') awaitingGesture += 1;
    else dropped += 1;
    return Object.freeze({
      status: result.played ? 'PLAYED' : statusOf(result.reason),
      kind: decision.kind,
      cueId: decision.cueId,
      key: decision.key,
      late: decision.late,
      visual: decision.visual,
    });
  };

  const publishTakeover = (input: {
    readonly eventId: string;
    readonly tick: number;
    readonly vehicleId: string;
    readonly controlMode: 'MANUAL' | 'LEARNING';
  }): AudioFeedbackResult =>
    apply({
      kind: 'TAKEOVER',
      eventId: input.eventId,
      tick: input.tick,
      vehicleId: input.vehicleId,
      controlMode: input.controlMode,
    });

  const publishPublication = (input: {
    readonly eventId: string;
    readonly tick: number;
    readonly publicationVersionId: string;
    readonly profileId: string;
    readonly published: true;
  }): AudioFeedbackResult =>
    apply({
      kind: 'PUBLICATION',
      eventId: input.eventId,
      tick: input.tick,
      publicationVersionId: input.publicationVersionId,
      profileId: input.profileId,
      published: true,
    });

  const publishMissionState = (instanceId: string): AudioFeedbackResult => {
    assertLive();
    const tracker = services.missions;
    if (tracker === undefined) {
      unknownMissions += 1;
      return Object.freeze({
        status: 'UNKNOWN_MISSION',
        kind: 'MISSION',
        cueId: null,
        key: `mission:${text(instanceId)}:UNKNOWN`,
        late: false,
        visual: null,
      });
    }
    const instance = tracker.instance(text(instanceId));
    if (instance === undefined) {
      unknownMissions += 1;
      return Object.freeze({
        status: 'UNKNOWN_MISSION',
        kind: 'MISSION',
        cueId: null,
        key: `mission:${text(instanceId)}:UNKNOWN`,
        late: false,
        visual: null,
      });
    }
    return apply({
      kind: 'MISSION',
      instanceId: instance.instanceId,
      missionId: instance.missionId,
      tick: instance.updatedTick,
      attempt: instance.attempt,
      state: instance.state,
      failureReason: instance.failureReason,
    });
  };

  const publishLearningNotification = (event: LearningNotificationEvent): AudioFeedbackResult => {
    const view = learningNotificationKindView(event.kind);
    const published = event.kind === 'PUBLISHED';
    return apply({
      kind: 'LEARNING',
      eventId: event.eventId,
      tick: event.tick,
      notificationKind: event.kind,
      soundCue: view.soundCue,
      publicationVersionId: published ? event.publicationVersionId : null,
      published,
    });
  };

  if (services.eventBus !== undefined) {
    const bus = services.eventBus;
    unsubscribe = bus.subscribe((event) => {
      if (disposed) return;
      if (event.type === 'MANUAL_START') {
        // The 007 parser admits MANUAL and LEARNING only; AUTO is not a takeover.
        if (event.payload.controlMode === 'AUTO') return;
        publishTakeover({
          eventId: event.eventId,
          tick: event.tick,
          vehicleId: event.payload.vehicleId,
          controlMode: event.payload.controlMode,
        });
        return;
      }
      if (event.type === 'PROFILE_ACTIVATE')
        publishPublication({
          eventId: event.eventId,
          tick: event.tick,
          publicationVersionId: event.payload.versionId,
          profileId: event.payload.profileId,
          published: true,
        });
    });
  }

  return Object.freeze({
    publishTakeover,
    publishPublication,
    publishMissionState,
    publishLearningNotification,
    getStats(): AudioFeedbackStats {
      return Object.freeze({
        version: AUDIO_FEEDBACK_VERSION,
        appVersion: AUDIO_FEEDBACK_APP_VERSION,
        emitted: state.counters.emitted,
        duplicates: state.counters.duplicates,
        silent: state.counters.silent,
        played,
        dropped,
        awaitingGesture,
        unknownMissions,
        visualShown,
        retainedKeys: state.emitted.length,
        droppedKeys: state.counters.droppedKeys,
        lastTick: state.lastTick,
        disposed,
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (unsubscribe !== null) {
        const stop = unsubscribe;
        unsubscribe = null;
        stop();
      }
    },
  });
}
