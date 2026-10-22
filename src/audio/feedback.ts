import { requireContract, text, tick } from '../sessions';
import type { AudioOneShotCueId } from './engine';

/**
 * 149 audio feedback contract for the modes and the learning.
 *
 * The module owns no clock, no DOM, no event bus and no audio graph: it decides *what* a real
 * event should sound like and it remembers which events already sounded. The composition root
 * (`src/app/audio-feedback.ts`) binds the real events, plays the cue through the real 148 engine
 * and shows the visual companion.
 *
 * Four rules hold the contract:
 *
 * 1. **The sound follows the real event.** The cue is derived from the payload of the event that
 *    produced it: the 007 `MANUAL_START` for a takeover, the 110/112 publication payload for a
 *    publication, the 116 mission instance state for a mission and the 079 notification for an
 *    analysis result. A state that is only anticipated never sounds.
 * 2. **One event sounds once.** Every feedback carries an explicit idempotency key built from the
 *    real identity of the event (the 007 event id, the publication version id, the mission instance
 *    id plus its state, the 079 event id). The keys live in a bounded FIFO registry, so a replayed
 *    event, a repeated relay or a duplicated publication never produces a second sound.
 * 3. **A late result sounds what really happened.** A feedback that arrives after a newer event is
 *    marked `late`, but it still carries the cue of its own real outcome; the module never
 *    substitutes the anticipated state for the observed one.
 * 4. **Every sound has a visual twin.** Each accepted feedback carries a visual companion with a
 *    symbol, a text and `data-*` attributes, so the information never depends on the audio.
 *
 * The cue set is the frozen set of the 148 engine: `takeover-notice` for the takeover,
 * `profile-notice` for the publication and `ui-tick` for the missions and the analysis results.
 * The 149 module adds no cue, no buffer and no voice: the limits of the 148 engine stay in force.
 */
export const AUDIO_FEEDBACK_VERSION = '149-audio-feedback-v1' as const;

/** The four feedback families of 149. */
export const AUDIO_FEEDBACK_KINDS = ['TAKEOVER', 'PUBLICATION', 'MISSION', 'LEARNING'] as const;
export type AudioFeedbackKind = (typeof AUDIO_FEEDBACK_KINDS)[number];

/**
 * The sound descriptors of the 079 notifications. The module mirrors the closed vocabulary
 * instead of importing the UI contract, so the audio module stays independent of the DOM.
 */
export const AUDIO_FEEDBACK_SOUND_CUES = ['NONE', 'SUCCESS', 'WARNING', 'ERROR'] as const;
export type AudioFeedbackSoundCue = (typeof AUDIO_FEEDBACK_SOUND_CUES)[number];

/** The bounded budgets of the feedback module. */
export const AUDIO_FEEDBACK_LIMITS = Object.freeze({
  version: AUDIO_FEEDBACK_VERSION,
  /** Bounded idempotency registry: the emitted keys are remembered in a FIFO. */
  emittedKeys: 256,
  /** Code units of one idempotency key. */
  keyCodeUnits: 256,
  /** Code units of one real identity carried by a feedback. */
  idCodeUnits: 256,
  /** Code units of the visual text of one feedback. */
  textCodeUnits: 240,
  /** The visual indicator keeps only the last companion; there is no history. */
  retainedVisuals: 1,
});

/** The 066/068 takeover, bound to the real 007 `MANUAL_START` event. */
export interface AudioFeedbackTakeoverInput {
  readonly kind: 'TAKEOVER';
  /** Identity of the real 007 event. */
  readonly eventId: string;
  readonly tick: number;
  readonly vehicleId: string;
  readonly controlMode: 'MANUAL' | 'LEARNING';
}

/** The 110/112 publication, bound to the real activation or publication payload. */
export interface AudioFeedbackPublicationInput {
  readonly kind: 'PUBLICATION';
  readonly eventId: string;
  readonly tick: number;
  /** Identity of the immutable published profile version. */
  readonly publicationVersionId: string;
  readonly profileId: string;
  /** Only a real publication carries `published: true`. */
  readonly published: true;
}

/** The 116 mission state, read from the real mission tracker. */
export interface AudioFeedbackMissionInput {
  readonly kind: 'MISSION';
  /** Identity of the real 116 mission instance (the attempt is part of the identity). */
  readonly instanceId: string;
  readonly missionId: string;
  readonly tick: number;
  readonly attempt: number;
  readonly state: 'ACTIVE' | 'COMPLETED' | 'FAILED';
  /** Closed 116 failure reason; `null` outside a failure. */
  readonly failureReason: string | null;
}

/** The 079 learning notification, bound to the real notification event. */
export interface AudioFeedbackLearningInput {
  readonly kind: 'LEARNING';
  /** Identity of the real 079 event. */
  readonly eventId: string;
  readonly tick: number;
  /** The 079 kind of the notification, kept verbatim. */
  readonly notificationKind: string;
  /** The 079 sound descriptor of the notification. */
  readonly soundCue: AudioFeedbackSoundCue;
  /** The published version of a `PUBLISHED` notification; `null` for the other kinds. */
  readonly publicationVersionId: string | null;
  /** `true` only for a real `PUBLISHED` notification. */
  readonly published: boolean;
}

export type AudioFeedbackInput =
  | AudioFeedbackTakeoverInput
  | AudioFeedbackPublicationInput
  | AudioFeedbackMissionInput
  | AudioFeedbackLearningInput;

/** The visual twin of one sound. */
export interface AudioFeedbackVisual {
  readonly kind: AudioFeedbackKind;
  readonly symbol: string;
  readonly text: string;
  /** `true` only for a real publication. */
  readonly published: boolean;
  /** `true` when the feedback arrived after a newer event. */
  readonly late: boolean;
  /** Identity attributes; the information is never colour-only. */
  readonly attributes: readonly (readonly [string, string])[];
}

/** The outcome of one feedback decision. */
export type AudioFeedbackOutcome = 'EMITTED' | 'DUPLICATE' | 'SILENT';

export interface AudioFeedbackDecision {
  readonly kind: AudioFeedbackKind;
  readonly outcome: AudioFeedbackOutcome;
  /** The cue of the 148 engine; `null` when the feedback is silent. */
  readonly cueId: AudioOneShotCueId | null;
  /** Linear gain of the cue, applied by the 148 engine. */
  readonly gain: number;
  /** The idempotency key of the feedback. */
  readonly key: string;
  /** The visual twin; `null` only for a silent feedback. */
  readonly visual: AudioFeedbackVisual | null;
  /** `true` when the feedback arrived after a newer event. */
  readonly late: boolean;
}

export interface AudioFeedbackCounters {
  /** Feedbacks that produced a cue. */
  readonly emitted: number;
  /** Feedbacks refused because their key was already emitted. */
  readonly duplicates: number;
  /** Feedbacks without a cue (a `NONE` descriptor or a non-event state). */
  readonly silent: number;
  /** Keys dropped from the bounded registry. */
  readonly droppedKeys: number;
}

export interface AudioFeedbackState {
  readonly version: typeof AUDIO_FEEDBACK_VERSION;
  /** The bounded idempotency registry, oldest first. */
  readonly emitted: readonly string[];
  /** The newest observed tick; a smaller tick marks a late feedback. */
  readonly lastTick: number;
  readonly counters: AudioFeedbackCounters;
}

const EMPTY_COUNTERS: AudioFeedbackCounters = Object.freeze({
  emitted: 0,
  duplicates: 0,
  silent: 0,
  droppedKeys: 0,
});

/** The gains of the 149 cues; they are applied by the 148 engine, never bypassed. */
export const AUDIO_FEEDBACK_GAINS = Object.freeze({
  takeover: 1,
  publication: 1,
  missionStarted: 0.45,
  missionCompleted: 1,
  missionFailed: 0.7,
  learning: 0.6,
});

/**
 * The owner of the cues of a family.
 *
 * The owner is the family and not the event: the 148 engine keeps one cooldown entry per owner,
 * so a burst of events of the same family is bounded and the memory of the engine stays bounded.
 */
export function audioFeedbackOwner(kind: AudioFeedbackKind): string {
  return `feedback:${kind}`;
}

export function createAudioFeedbackState(): AudioFeedbackState {
  return Object.freeze({
    version: AUDIO_FEEDBACK_VERSION,
    emitted: Object.freeze([]),
    lastTick: 0,
    counters: EMPTY_COUNTERS,
  });
}

function boundedId(value: unknown, label: string): string {
  const id = text(value);
  requireContract(
    id.length <= AUDIO_FEEDBACK_LIMITS.idCodeUnits,
    `${label} identity exceeds the code-unit limit`,
  );
  return id;
}

/**
 * The idempotency key of one feedback.
 *
 * The key always names the real identity of the event, never the moment of the call: a replayed
 * event, a repeated relay or a duplicated publication resolves to the same key.
 */
export function audioFeedbackKey(input: AudioFeedbackInput): string {
  switch (input.kind) {
    case 'TAKEOVER':
      return `takeover:${boundedId(input.eventId, 'takeover event')}`;
    case 'PUBLICATION':
      return `publication:${boundedId(input.publicationVersionId, 'publication version')}`;
    case 'MISSION':
      return `mission:${boundedId(input.instanceId, 'mission instance')}:${input.state}`;
    case 'LEARNING':
      if (input.published && input.publicationVersionId !== null)
        return `publication:${boundedId(input.publicationVersionId, 'publication version')}`;
      return `learning:${boundedId(input.eventId, 'learning event')}`;
  }
}

function boundedText(value: string, label: string): string {
  requireContract(
    value.length > 0 && value.length <= AUDIO_FEEDBACK_LIMITS.textCodeUnits,
    `${label} text is outside the code-unit limit`,
  );
  return value;
}

/** The identity attributes of one visual companion. */
function attributesOf(
  rows: readonly (readonly [string, string])[],
): readonly (readonly [string, string])[] {
  return Object.freeze(rows.map((row) => Object.freeze(row)));
}

/** The cue of one feedback; `null` when the real event carries no sound. */
export function audioFeedbackCue(input: AudioFeedbackInput): {
  readonly cueId: AudioOneShotCueId;
  readonly gain: number;
} | null {
  switch (input.kind) {
    case 'TAKEOVER':
      return { cueId: 'takeover-notice', gain: AUDIO_FEEDBACK_GAINS.takeover };
    case 'PUBLICATION':
      return { cueId: 'profile-notice', gain: AUDIO_FEEDBACK_GAINS.publication };
    case 'MISSION':
      if (input.state === 'ACTIVE')
        return { cueId: 'ui-tick', gain: AUDIO_FEEDBACK_GAINS.missionStarted };
      if (input.state === 'COMPLETED')
        return { cueId: 'ui-tick', gain: AUDIO_FEEDBACK_GAINS.missionCompleted };
      return { cueId: 'ui-tick', gain: AUDIO_FEEDBACK_GAINS.missionFailed };
    case 'LEARNING':
      if (input.soundCue === 'NONE') return null;
      return { cueId: 'ui-tick', gain: AUDIO_FEEDBACK_GAINS.learning };
  }
}

/** The visual twin of one feedback. */
export function audioFeedbackVisual(
  input: AudioFeedbackInput,
  late: boolean,
): AudioFeedbackVisual | null {
  const cue = audioFeedbackCue(input);
  if (cue === null) return null;
  switch (input.kind) {
    case 'TAKEOVER': {
      const text = boundedText(
        `Preluare control · ${input.vehicleId} · ${input.controlMode}`,
        'takeover',
      );
      return Object.freeze({
        kind: 'TAKEOVER',
        symbol: '✋',
        text,
        published: false,
        late,
        attributes: attributesOf([
          ['data-kind', 'TAKEOVER'],
          ['data-event', input.eventId],
          ['data-vehicle', input.vehicleId],
          ['data-mode', input.controlMode],
          ['data-tick', String(input.tick)],
          ['data-late', late ? 'true' : 'false'],
        ]),
      });
    }
    case 'PUBLICATION': {
      const text = boundedText(`Profil publicat · ${input.publicationVersionId}`, 'publication');
      return Object.freeze({
        kind: 'PUBLICATION',
        symbol: '★',
        text,
        published: true,
        late,
        attributes: attributesOf([
          ['data-kind', 'PUBLICATION'],
          ['data-event', input.eventId],
          ['data-version', input.publicationVersionId],
          ['data-profile', input.profileId],
          ['data-tick', String(input.tick)],
          ['data-late', late ? 'true' : 'false'],
          ['data-published', 'true'],
        ]),
      });
    }
    case 'MISSION': {
      const state =
        input.state === 'ACTIVE'
          ? 'Misiune începută'
          : input.state === 'COMPLETED'
            ? 'Misiune completată'
            : 'Misiune eșuată';
      const reason =
        input.state === 'FAILED' && input.failureReason !== null ? ` · ${input.failureReason}` : '';
      const text = boundedText(`${state} · ${input.missionId}${reason}`, 'mission');
      return Object.freeze({
        kind: 'MISSION',
        symbol: input.state === 'COMPLETED' ? '✓' : input.state === 'FAILED' ? '✕' : '▶',
        text,
        published: false,
        late,
        attributes: attributesOf([
          ['data-kind', 'MISSION'],
          ['data-instance', input.instanceId],
          ['data-mission', input.missionId],
          ['data-state', input.state],
          ['data-attempt', String(input.attempt)],
          ['data-tick', String(input.tick)],
          ['data-late', late ? 'true' : 'false'],
        ]),
      });
    }
    case 'LEARNING': {
      const text = boundedText(`Analiză · ${input.notificationKind}`, 'learning');
      return Object.freeze({
        kind: 'LEARNING',
        symbol: input.published ? '★' : 'ℹ',
        text,
        published: input.published,
        late,
        attributes: attributesOf([
          ['data-kind', 'LEARNING'],
          ['data-event', input.eventId],
          ['data-notification', input.notificationKind],
          ['data-sound', input.soundCue],
          ['data-tick', String(input.tick)],
          ['data-late', late ? 'true' : 'false'],
          ['data-published', input.published ? 'true' : 'false'],
        ]),
      });
    }
  }
}

function validateInput(input: AudioFeedbackInput): void {
  requireContract(
    (AUDIO_FEEDBACK_KINDS as readonly string[]).includes(input.kind),
    'Unsupported audio feedback kind',
  );
  tick(input.tick);
  switch (input.kind) {
    case 'TAKEOVER':
      boundedId(input.eventId, 'takeover event');
      boundedId(input.vehicleId, 'takeover vehicle');
      requireContract(
        input.controlMode === 'MANUAL' || input.controlMode === 'LEARNING',
        'A takeover requires MANUAL or LEARNING',
      );
      break;
    case 'PUBLICATION':
      boundedId(input.eventId, 'publication event');
      boundedId(input.publicationVersionId, 'publication version');
      boundedId(input.profileId, 'publication profile');
      requireContract(input.published === true, 'A publication requires an explicit publication');
      break;
    case 'MISSION':
      boundedId(input.instanceId, 'mission instance');
      boundedId(input.missionId, 'mission');
      tick(input.attempt);
      requireContract(
        input.state === 'ACTIVE' || input.state === 'COMPLETED' || input.state === 'FAILED',
        'Unsupported mission state',
      );
      break;
    case 'LEARNING':
      boundedId(input.eventId, 'learning event');
      boundedText(input.notificationKind, 'learning notification');
      requireContract(
        (AUDIO_FEEDBACK_SOUND_CUES as readonly string[]).includes(input.soundCue),
        'Unsupported learning sound descriptor',
      );
      break;
  }
}

function freezeEmitted(keys: readonly string[]): readonly string[] {
  const maximum = AUDIO_FEEDBACK_LIMITS.emittedKeys;
  return Object.freeze(keys.length > maximum ? keys.slice(keys.length - maximum) : keys);
}

/**
 * Applies one feedback to the state.
 *
 * The reducer is pure: it never plays, never reads a clock and never mutates a DOM. A key that was
 * already emitted resolves to `DUPLICATE`, so a duplicated event produces no second cue.
 */
export function reduceAudioFeedback(
  state: AudioFeedbackState,
  input: AudioFeedbackInput,
): { readonly state: AudioFeedbackState; readonly decision: AudioFeedbackDecision } {
  validateInput(input);
  const key = audioFeedbackKey(input);
  requireContract(
    key.length <= AUDIO_FEEDBACK_LIMITS.keyCodeUnits,
    'Audio feedback key exceeds the code-unit limit',
  );
  const late = input.tick < state.lastTick;
  if (state.emitted.includes(key)) {
    return Object.freeze({
      state: Object.freeze({
        ...state,
        counters: Object.freeze({ ...state.counters, duplicates: state.counters.duplicates + 1 }),
      }),
      decision: Object.freeze({
        kind: input.kind,
        outcome: 'DUPLICATE',
        cueId: null,
        gain: 0,
        key,
        visual: null,
        late,
      }),
    });
  }
  const cue = audioFeedbackCue(input);
  const visual = audioFeedbackVisual(input, late);
  if (cue === null || visual === null) {
    return Object.freeze({
      state: Object.freeze({
        ...state,
        lastTick: Math.max(state.lastTick, input.tick),
        counters: Object.freeze({ ...state.counters, silent: state.counters.silent + 1 }),
      }),
      decision: Object.freeze({
        kind: input.kind,
        outcome: 'SILENT',
        cueId: null,
        gain: 0,
        key,
        visual: null,
        late,
      }),
    });
  }
  let dropped = 0;
  let emitted = [...state.emitted, key];
  if (emitted.length > AUDIO_FEEDBACK_LIMITS.emittedKeys) {
    dropped = emitted.length - AUDIO_FEEDBACK_LIMITS.emittedKeys;
    emitted = emitted.slice(dropped);
  }
  return Object.freeze({
    state: Object.freeze({
      version: AUDIO_FEEDBACK_VERSION,
      emitted: freezeEmitted(emitted),
      lastTick: Math.max(state.lastTick, input.tick),
      counters: Object.freeze({
        emitted: state.counters.emitted + 1,
        duplicates: state.counters.duplicates,
        silent: state.counters.silent,
        droppedKeys: state.counters.droppedKeys + dropped,
      }),
    }),
    decision: Object.freeze({
      kind: input.kind,
      outcome: 'EMITTED',
      cueId: cue.cueId,
      gain: cue.gain,
      key,
      visual,
      late,
    }),
  });
}
