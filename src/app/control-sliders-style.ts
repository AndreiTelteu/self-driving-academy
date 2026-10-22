import {
  getParameterDefinition,
  parameterDefinitions,
  validateParameterValue,
  verifyProfileVersionChecksum,
} from '../profiles';
import type { ParameterUnit, ProfileStore, ProfileVersion } from '../profiles';
import type { ProfileActivation } from '../fleet';
import {
  STYLE_SLIDERS_HISTORY_ROWS,
  STYLE_SLIDERS_TUNING_MAP_VERSION,
  STYLE_SLIDER_DEFINITIONS,
  STYLE_SLIDER_FIELDS,
  applyStyleSliderDraftChange,
  createStyleSlidersDraft,
  invalidateStyleSlidersSession,
  markStyleSlidersStale,
  parseStyleSlidersDraft,
  projectStyleSliders,
  rebaseStyleSlidersDraft,
  revertStyleSlidersDraft,
  setStyleSliderValue,
  styleSliderFromParameter,
  styleSliderText,
  type StyleSliderField,
  type StyleSliderVersionRef,
  type StyleSlidersDraft,
  type StyleSlidersProjection,
} from '../ui';
import type {
  LearningEpochBarrier,
  LearningEpochBarrierRecord,
  LearningChangeReason,
} from './learning-epoch';
import type { ProfileRestoreResult } from './profile-restore';

/**
 * 230 manual tuning session.
 *
 * This is the composition root of the style tab. It reads the immutable 109 base version, validates
 * the draft against an explicit `baseVersionId`, derives **only the differences** as one
 * `MANUAL_TUNING` version, and resolves the change through the real 205 `learningEpoch` barrier and
 * the real 110 activation. It never estimates, never composes a learned value, never submits a 103
 * job and never writes progression: `learningJobs` and `progressionCalls` are structurally `0`.
 *
 * 205 has no separate manual-tuning reason in its closed vocabulary; the `NEW_PROFILE` reason is
 * the only one whose 110 publication origin is `MANUAL_TUNING` (114 maps it the same way). The
 * version provenance keeps `reason: 'MANUAL_TUNING'` and the tuning-map version, so the value's
 * provenance stays distinct from historical evidence.
 *
 * Restore is delegated to the injected 114 orchestrator (`restoreVersion`), so the same barrier and
 * the same activation are reused instead of being reimplemented here.
 */
export const STYLE_SLIDERS_SESSION_VERSION = '230-style-sliders-session-v1' as const;

/** The active session/world the draft is pinned to. A different value invalidates the draft. */
export interface StyleSlidersTarget {
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly playerId: string;
  readonly profileId: string;
  /** Active learning target read from 205, for display only; never draft identity. */
  readonly baseVersionId: string;
  readonly learningEpoch: number;
}

export type StyleSlidersOpenStatus =
  'OPENED' | 'ALREADY_OPEN' | 'PLAYER_MISMATCH' | 'PROFILE_MISMATCH' | 'VERSION_MISSING';

export type StyleSlidersQueueStatus =
  | 'QUEUED'
  | 'UNCHANGED'
  | 'INVALID'
  | 'STALE_BASE'
  | 'SESSION_CHANGED'
  | 'NOT_OPEN'
  | 'ALREADY_PENDING'
  | 'RESTORE_PENDING';

export type StyleSlidersTickStatus =
  | 'IDLE'
  | 'NOT_DUE'
  | 'PENDING'
  | 'PUBLISHED'
  | 'ACTIVATED'
  | 'STALE_BASE'
  | 'SESSION_CHANGED'
  | 'REJECTED'
  | 'RESTORE_PENDING'
  | 'RESTORED';

export type StyleSlidersRestoreStatus =
  'QUEUED' | 'ALREADY_ACTIVE' | 'NOT_OPEN' | 'UNKNOWN_VERSION' | 'APPLY_PENDING' | 'UNAVAILABLE';

/** One changed parameter with an explicit previous/new value and its display text. */
export interface StyleSlidersChange {
  readonly field: StyleSliderField;
  readonly parameterKey: string;
  readonly unit: ParameterUnit;
  readonly before: number;
  readonly after: number;
  readonly beforeText: string;
  readonly afterText: string;
  /** The adjusted value's provenance; never a claim about evidence. */
  readonly valueProvenance: 'MANUAL_TUNING';
  readonly evidence: 'HISTORICAL_ONLY';
}

export interface StyleSlidersVersionSummary {
  readonly versionId: string;
  readonly parentVersionId: string | null;
  readonly depth: number;
  readonly checksum: string;
  readonly tuningMapVersion: typeof STYLE_SLIDERS_TUNING_MAP_VERSION;
  readonly manualKeys: number;
  readonly learnedKeys: 0;
}

export interface StyleSlidersBarrierSummary {
  readonly barrierId: string;
  readonly reason: LearningChangeReason;
  readonly status: string;
  readonly fromLearningEpoch: number;
  readonly learningEpoch: number;
  readonly targetVersionId: string;
  readonly activationCommandId: string | null;
  readonly activationTick: number | null;
  readonly cancelledJobs: readonly string[];
  readonly physicalPreserved: boolean;
}

export interface StyleSlidersTickResult {
  readonly version: typeof STYLE_SLIDERS_SESSION_VERSION;
  readonly status: StyleSlidersTickStatus;
  readonly tick: number;
  readonly reason: string | null;
  readonly profileId: string | null;
  readonly baseVersionId: string | null;
  readonly versionId: string | null;
  readonly changes: readonly StyleSlidersChange[];
  readonly versionSummary: StyleSlidersVersionSummary | null;
  readonly barrier: StyleSlidersBarrierSummary | null;
  readonly learningEpoch: number | null;
  readonly activation: Readonly<{
    commandId: string | null;
    origin: 'MANUAL_TUNING' | null;
    activateAtTick: number | null;
    appliedAtTick: number | null;
  }> | null;
  readonly message: string;
}

export interface StyleSlidersSessionState {
  readonly version: typeof STYLE_SLIDERS_SESSION_VERSION;
  readonly open: boolean;
  readonly pendingApply: boolean;
  readonly pendingRestore: string | null;
  readonly draft: StyleSlidersDraft | null;
  readonly view: StyleSlidersProjection | null;
  readonly publishedVersionId: string | null;
  readonly message: string;
  readonly messageCode: StyleSlidersTickStatus | StyleSlidersQueueStatus | 'CLOSED';
  readonly disposed: boolean;
}

export interface StyleSlidersSessionStats {
  readonly version: typeof STYLE_SLIDERS_SESSION_VERSION;
  readonly tuningMapVersion: typeof STYLE_SLIDERS_TUNING_MAP_VERSION;
  readonly opens: number;
  readonly closes: number;
  readonly queueRequests: number;
  readonly queued: number;
  readonly unchanged: number;
  readonly invalid: number;
  readonly stale: number;
  readonly sessionChanged: number;
  readonly derives: number;
  readonly storeRejections: number;
  readonly barrierRejections: number;
  readonly published: number;
  readonly activated: number;
  readonly cancelledJobs: number;
  readonly restoreRequests: number;
  readonly restored: number;
  readonly restoreRejections: number;
  readonly withdrawn: number;
  readonly sessionIdentityChecks: number;
  readonly retainedDrafts: 1;
  readonly retainedHistoryRows: number;
  readonly versions: number;
  readonly versionsAdded: number;
  readonly learningJobs: 0;
  readonly progressionCalls: 0;
  readonly observationWrites: 0;
  readonly storeWrites: number;
  readonly lastPublishedVersionId: string | null;
  readonly lastAppliedTick: number | null;
  readonly pendingApply: boolean;
  readonly pendingRestore: string | null;
  readonly disposed: boolean;
}

export interface StyleSlidersSessionOptions {
  readonly playerId: string;
  readonly profileId: string;
  readonly engineVersion: string;
  readonly store: ProfileStore;
  readonly barrier: LearningEpochBarrier;
  readonly activation: Pick<ProfileActivation, 'pending' | 'applyAt' | 'activeProfile'>;
  /** The active session/world; a change invalidates the draft instead of crossing worlds. */
  readonly readTarget: () => StyleSlidersTarget;
  readonly tick: () => number;
  /** 114 `restoreVersion(services, {profileId, versionId, tick})`; required for restore. */
  readonly restore?: (versionId: string, tick: number) => ProfileRestoreResult;
  readonly now?: () => string;
  readonly operationPrefix?: string;
  /** Display-only readback of in-flight 103 jobs. It never blocks an apply. */
  readonly readInFlightJobs?: () => number;
}

export interface StyleSlidersSession {
  readonly version: typeof STYLE_SLIDERS_SESSION_VERSION;
  open(): StyleSlidersOpenStatus;
  close(): boolean;
  isOpen(): boolean;
  getDraft(): StyleSlidersDraft | null;
  getView(): StyleSlidersProjection | null;
  /** Adopts a validated draft from the panel; it must belong to the same target and base. */
  adopt(candidate: StyleSlidersDraft): StyleSlidersDraft;
  /** Sets one slider from its UI value; the draft converts it to the 092 unit immediately. */
  setValue(field: StyleSliderField, value: number): StyleSlidersDraft | null;
  revert(): StyleSlidersDraft | null;
  /** Re-reads the active head; marks the draft stale instead of rebasing silently. */
  refresh(): StyleSlidersProjection | null;
  /** Explicit stale recovery; discards the local proposal and adopts the new head. */
  rebase(): StyleSlidersDraft | null;
  queueApply(): StyleSlidersQueueStatus;
  withdraw(): boolean;
  requestRestore(versionId: string): StyleSlidersRestoreStatus;
  observeTick(tick: number): void;
  /** Called by the host before the physical tick; the only place that derives and publishes. */
  applyAtTick(tick: number): StyleSlidersTickResult;
  getState(): StyleSlidersSessionState;
  getStats(): StyleSlidersSessionStats;
  dispose(): void;
}

const MAX_ID = 256;
const EMPTY_CHANGES = Object.freeze([]) as readonly StyleSlidersChange[];

function requireTick(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error(`Style sliders ${label}`);
  return value;
}

function requireId(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() !== value || value === '' || value.length > MAX_ID)
    throw new Error(`Style sliders ${label}`);
  return value;
}

function bounded(value: string, maximum: number): string {
  return value.length > maximum ? value.slice(0, maximum) : value;
}

function readTarget(value: unknown): StyleSlidersTarget {
  if (!value || typeof value !== 'object') throw new Error('Style sliders target');
  const target = value as StyleSlidersTarget;
  return Object.freeze({
    sessionId: requireId(target.sessionId, 'target sessionId'),
    worldEpoch: requireTick(target.worldEpoch, 'target worldEpoch'),
    playerId: requireId(target.playerId, 'target playerId'),
    profileId: requireId(target.profileId, 'target profileId'),
    baseVersionId: requireId(target.baseVersionId, 'target baseVersionId'),
    learningEpoch: requireTick(target.learningEpoch, 'target learningEpoch'),
  });
}

function identityOf(target: StyleSlidersTarget): string {
  return JSON.stringify([target.sessionId, target.worldEpoch, target.playerId, target.profileId]);
}

function versionRefs(
  history: readonly ProfileVersion[],
  head: string,
): readonly StyleSliderVersionRef[] {
  const rows: StyleSliderVersionRef[] = [];
  for (
    let index = history.length - 1;
    index >= 0 && rows.length < STYLE_SLIDERS_HISTORY_ROWS;
    index -= 1
  ) {
    const version = history[index];
    if (version === undefined) continue;
    rows.push(
      Object.freeze({
        versionId: version.versionId,
        createdAt: version.createdAt,
        changedKeys: version.provenance.delta?.keyCount ?? 0,
        current: version.versionId === head,
      }),
    );
  }
  return Object.freeze(rows);
}

function fieldOfKey(key: string): StyleSliderField | null {
  for (const field of STYLE_SLIDER_FIELDS)
    if (STYLE_SLIDER_DEFINITIONS[field].parameterKey === key) return field;
  return null;
}

function changeText(field: StyleSliderField, parameterValue: number): string {
  return styleSliderText(field, styleSliderFromParameter(field, parameterValue));
}

function changesOfVersion(version: ProfileVersion): readonly StyleSlidersChange[] {
  const delta = version.provenance.delta;
  if (delta === null) return EMPTY_CHANGES;
  const changes: StyleSlidersChange[] = [];
  for (const change of delta.changes) {
    const field = fieldOfKey(change.key);
    if (field === null) continue;
    changes.push(
      Object.freeze({
        field,
        parameterKey: change.key,
        unit: change.unit as ParameterUnit,
        before: change.previousValue,
        after: change.newValue,
        beforeText: changeText(field, change.previousValue),
        afterText: changeText(field, change.newValue),
        valueProvenance: 'MANUAL_TUNING' as const,
        evidence: 'HISTORICAL_ONLY' as const,
      }),
    );
  }
  return Object.freeze(changes);
}

function barrierSummaryOf(
  record: LearningEpochBarrierRecord | null,
): StyleSlidersBarrierSummary | null {
  if (record === null) return null;
  return Object.freeze({
    barrierId: record.barrierId,
    reason: record.reason,
    status: record.status,
    fromLearningEpoch: record.fromLearningEpoch,
    learningEpoch: record.learningEpoch,
    targetVersionId: record.targetVersionId,
    activationCommandId: record.activationCommandId,
    activationTick: record.activationTick,
    cancelledJobs: Object.freeze([...record.cancelledJobs]),
    physicalPreserved: record.physicalPreserved,
  });
}

interface PendingApply {
  readonly draft: StyleSlidersDraft;
  readonly queuedAtTick: number;
  readonly versionId: string;
  derived: boolean;
  changes: readonly StyleSlidersChange[];
  versionSummary: StyleSlidersVersionSummary | null;
  barrier: LearningEpochBarrierRecord | null;
}

interface PendingRestore {
  readonly versionId: string;
  readonly requestedAtTick: number;
  attempts: number;
}

export function createStyleSlidersSession(
  options: StyleSlidersSessionOptions,
): StyleSlidersSession {
  if (!options || typeof options !== 'object') throw new Error('Style sliders session options');
  const playerId = requireId(options.playerId, 'player identity'),
    profileId = requireId(options.profileId, 'profile identity'),
    engineVersion = requireId(options.engineVersion, 'engine version');
  const store = options.store;
  if (
    !store ||
    typeof store.getVersion !== 'function' ||
    typeof store.getHistory !== 'function' ||
    typeof store.derive !== 'function'
  )
    throw new Error('Style sliders requires the real 109 profile store');
  if (store.engineVersion !== engineVersion)
    throw new Error('Style sliders store and session engines differ');
  const barrier = options.barrier;
  if (
    !barrier ||
    typeof barrier.current !== 'function' ||
    typeof barrier.requestChange !== 'function' ||
    typeof barrier.resolve !== 'function'
  )
    throw new Error('Style sliders requires the real 205 learning epoch barrier');
  if (barrier.profileId !== profileId)
    throw new Error('Style sliders barrier belongs to another profile');
  if (barrier.engineVersion !== engineVersion)
    throw new Error('Style sliders barrier and session engines differ');
  if (barrier.playerId !== playerId)
    throw new Error('Style sliders barrier belongs to another player');
  const activation = options.activation;
  if (
    !activation ||
    typeof activation.pending !== 'function' ||
    typeof activation.applyAt !== 'function'
  )
    throw new Error('Style sliders requires the real 110 profile activation');
  for (const port of ['readTarget', 'tick'] as const)
    if (typeof options[port] !== 'function') throw new Error(`Style sliders ${port} port`);
  if (options.restore !== undefined && typeof options.restore !== 'function')
    throw new Error('Style sliders restore port');
  if (options.readInFlightJobs !== undefined && typeof options.readInFlightJobs !== 'function')
    throw new Error('Style sliders worker readback port');
  const now = options.now ?? (() => new Date().toISOString());
  if (typeof now !== 'function') throw new Error('Style sliders clock');
  const prefix = options.operationPrefix ?? 'manual-tune';
  if (typeof prefix !== 'string' || prefix.length === 0 || prefix.length > 120)
    throw new Error('Style sliders operation prefix');

  const availableKeys = Object.freeze(
    parameterDefinitions.filter((definition) => definition.implemented).map((entry) => entry.key),
  );

  let draft: StyleSlidersDraft | null = null,
    view: StyleSlidersProjection | null = null,
    open = false,
    disposed = false,
    sessionIdentity: string | null = null,
    pending: PendingApply | null = null,
    pendingRestore: PendingRestore | null = null,
    pendingActivation: { commandId: string; versionId: string; activateAtTick: number } | null =
      null,
    lastSeenTick = -1,
    lastActivationTick: number | null = null,
    lastPublishedVersionId: string | null = null,
    message = 'Editorul de stil este închis.',
    messageCode: StyleSlidersSessionState['messageCode'] = 'CLOSED',
    sequence = 0;
  const counters = {
    opens: 0,
    closes: 0,
    queueRequests: 0,
    queued: 0,
    unchanged: 0,
    invalid: 0,
    stale: 0,
    sessionChanged: 0,
    derives: 0,
    storeRejections: 0,
    barrierRejections: 0,
    published: 0,
    activated: 0,
    cancelledJobs: 0,
    restoreRequests: 0,
    restored: 0,
    restoreRejections: 0,
    withdrawn: 0,
    sessionIdentityChecks: 0,
    versionsAdded: 0,
    storeWrites: 0,
  };

  const assertLive = () => {
    if (disposed) throw new Error('Style sliders session disposed');
  };
  const setMessage = (text: string, code: StyleSlidersSessionState['messageCode']) => {
    message = text;
    messageCode = code;
  };
  const currentTarget = (): StyleSlidersTarget => readTarget(options.readTarget());
  const tickNow = () => requireTick(options.tick(), 'tick');
  const result = (
    status: StyleSlidersTickStatus,
    tick: number,
    extra: Partial<StyleSlidersTickResult> = {},
  ): StyleSlidersTickResult =>
    Object.freeze({
      version: STYLE_SLIDERS_SESSION_VERSION,
      status,
      tick,
      reason: null,
      profileId,
      baseVersionId: draft?.baseVersionId ?? null,
      versionId: null,
      changes: EMPTY_CHANGES,
      versionSummary: null,
      barrier: null,
      learningEpoch: null,
      activation: null,
      message,
      ...extra,
    });

  const identityChanged = (target: StyleSlidersTarget): boolean =>
    sessionIdentity !== null && identityOf(target) !== sessionIdentity;

  const invalidate = (target: StyleSlidersTarget) => {
    counters.sessionChanged += 1;
    sessionIdentity = identityOf(target);
    pending = null;
    pendingRestore = null;
    pendingActivation = null;
    if (draft !== null) {
      draft = invalidateStyleSlidersSession(draft);
      view = projectStyleSliders(draft);
    }
    setMessage(
      `Sesiunea activă s-a schimbat (${target.sessionId}, worldEpoch ${target.worldEpoch}); draftul a fost invalidat și nu traversează lumile.`,
      'SESSION_CHANGED',
    );
  };

  const readHead = (): ProfileVersion => {
    const generation = barrier.current();
    const version = store.getVersion(generation.baseVersionId);
    if (version === null)
      throw new Error(`Style sliders active version ${generation.baseVersionId} is missing`);
    if (version.profileId !== profileId)
      throw new Error('Style sliders active version belongs to another profile');
    if (!verifyProfileVersionChecksum(version))
      throw new Error('Style sliders active version is corrupt');
    return version;
  };

  const draftFor = (version: ProfileVersion, target: StyleSlidersTarget): StyleSlidersDraft =>
    createStyleSlidersDraft({
      playerId,
      profileId,
      sessionId: target.sessionId,
      worldEpoch: target.worldEpoch,
      baseVersionId: version.versionId,
      headVersionId: version.versionId,
      learningEpoch: barrier.current().learningEpoch,
      baseParameters: version.parameters,
      availableKeys,
      history: versionRefs(store.getHistory(profileId), version.versionId),
    });

  const failPending = (
    status: StyleSlidersTickStatus,
    reason: string,
    tick: number = tickNow(),
  ): StyleSlidersTickResult => {
    pending = null;
    setMessage(reason, status);
    if (status === 'STALE_BASE') counters.stale += 1;
    return result(status, tick, { reason });
  };

  const applyActivation = (tick: number): boolean => {
    if (pendingActivation === null) return false;
    if (tick < pendingActivation.activateAtTick) return false;
    const report = activation.applyAt(tick);
    if (report.status === 'APPLIED') {
      counters.activated += 1;
      lastActivationTick = tick;
      pendingActivation = null;
      setMessage(
        `Versiunea ${report.versionId ?? lastPublishedVersionId} este activă la tick ${tick} pentru taxiuri și mașinile civile.`,
        'ACTIVATED',
      );
      return true;
    }
    if (report.status === 'REJECTED') {
      pendingActivation = null;
      setMessage(
        `Activarea a fost refuzată (${report.rejection?.code ?? report.failure?.stage ?? 'REJECTED'}); versiunea nu este activă.`,
        'REJECTED',
      );
      return true;
    }
    return false;
  };

  return Object.freeze({
    version: STYLE_SLIDERS_SESSION_VERSION,
    open(): StyleSlidersOpenStatus {
      assertLive();
      if (open) return 'ALREADY_OPEN';
      const target = currentTarget();
      if (target.playerId !== playerId) {
        setMessage('Sesiunea activă aparține altui jucător.', 'SESSION_CHANGED');
        return 'PLAYER_MISMATCH';
      }
      if (target.profileId !== profileId) {
        setMessage(
          'Sesiunea activă folosește alt profil; editorul acestei lumi nu editează profilul altei sesiuni.',
          'SESSION_CHANGED',
        );
        return 'PROFILE_MISMATCH';
      }
      let version: ProfileVersion;
      try {
        version = readHead();
      } catch {
        setMessage('Versiunea activă lipsește din istoricul imuabil.', 'REJECTED');
        return 'VERSION_MISSING';
      }
      draft = draftFor(version, target);
      view = projectStyleSliders(draft);
      open = true;
      sessionIdentity = identityOf(target);
      counters.opens += 1;
      setMessage(
        `Editezi versiunea activă ${draft.baseVersionId}. Mișcarea sliderele nu publică nimic; Aplică trimite doar diferențele la următorul tick.`,
        'QUEUED',
      );
      tickNow();
      return 'OPENED';
    },
    close(): boolean {
      assertLive();
      if (!open) return false;
      open = false;
      counters.closes += 1;
      draft = null;
      view = null;
      sessionIdentity = null;
      // A queued apply or restore survives closing: it publishes at the next tick after the world
      // resumes. Only „Anulează” (`withdraw`) drops it.
      setMessage(
        pending === null && pendingRestore === null
          ? 'Editorul de stil este închis; nimic nu a fost scris.'
          : 'Editor închis; schimbarea în așteptare se publică la următorul tick.',
        'CLOSED',
      );
      return true;
    },
    isOpen: () => open,
    getDraft: () => draft,
    getView: () => view,
    adopt(candidate: StyleSlidersDraft): StyleSlidersDraft {
      assertLive();
      if (!open || draft === null) throw new Error('Style sliders editor is closed');
      const parsed = applyStyleSliderDraftChange(draft, candidate);
      if (parsed.baseVersionId !== draft.baseVersionId)
        throw new Error('Style sliders draft belongs to another base version');
      draft = parsed;
      view = projectStyleSliders(draft);
      return draft;
    },
    setValue(field: StyleSliderField, value: number): StyleSlidersDraft | null {
      assertLive();
      if (!open || draft === null) return null;
      draft = setStyleSliderValue(draft, field, value);
      view = projectStyleSliders(draft);
      return draft;
    },
    revert(): StyleSlidersDraft | null {
      assertLive();
      if (draft === null) return null;
      draft = revertStyleSlidersDraft(draft);
      view = projectStyleSliders(draft);
      return draft;
    },
    refresh(): StyleSlidersProjection | null {
      assertLive();
      if (draft === null) return null;
      const target = currentTarget();
      if (identityChanged(target)) {
        invalidate(target);
        return view;
      }
      const generation = barrier.current();
      draft = markStyleSlidersStale(draft, generation.baseVersionId);
      view = projectStyleSliders(draft);
      return view;
    },
    rebase(): StyleSlidersDraft | null {
      assertLive();
      if (draft === null) return null;
      const target = currentTarget();
      if (identityChanged(target)) {
        invalidate(target);
        return draft;
      }
      const version = readHead();
      draft = rebaseStyleSlidersDraft(draft, {
        baseVersionId: version.versionId,
        headVersionId: version.versionId,
        learningEpoch: barrier.current().learningEpoch,
        baseParameters: version.parameters,
        history: versionRefs(store.getHistory(profileId), version.versionId),
      });
      view = projectStyleSliders(draft);
      setMessage(
        `Baza a fost reîncărcată la ${version.versionId}; propunerea locală a fost renunțată, fără suprascriere.`,
        'QUEUED',
      );
      return draft;
    },
    queueApply(): StyleSlidersQueueStatus {
      assertLive();
      counters.queueRequests += 1;
      if (!open || draft === null || view === null) {
        setMessage('Editorul este închis; nu există nimic de aplicat.', 'NOT_OPEN');
        return 'NOT_OPEN';
      }
      if (pendingRestore !== null) {
        setMessage('O restaurare este în așteptare; așteaptă tick-ul ei.', 'RESTORE_PENDING');
        return 'RESTORE_PENDING';
      }
      if (!draft.sessionActive) {
        setMessage(
          'Sesiunea activă s-a schimbat; draftul a fost invalidat și nu poate fi aplicat.',
          'SESSION_CHANGED',
        );
        return 'SESSION_CHANGED';
      }
      const target = currentTarget();
      if (identityChanged(target)) {
        invalidate(target);
        return 'SESSION_CHANGED';
      }
      const generation = barrier.current();
      if (generation.baseVersionId !== draft.baseVersionId) {
        pending = null;
        draft = markStyleSlidersStale(draft, generation.baseVersionId);
        view = projectStyleSliders(draft);
        counters.stale += 1;
        setMessage(
          `Draftul are baza ${draft.baseVersionId}, dar versiunea activă este ${generation.baseVersionId}. Reîncarcă baza; nimic nu este suprascris.`,
          'STALE_BASE',
        );
        return 'STALE_BASE';
      }
      const projected = projectStyleSliders(draft);
      view = projected;
      if (projected.issues.length > 0) {
        counters.invalid += 1;
        setMessage('Valorile din afara limitelor nu pot fi aplicate.', 'INVALID');
        return 'INVALID';
      }
      if (projected.changedCount === 0) {
        counters.unchanged += 1;
        setMessage(
          'Nicio diferență față de versiunea editată; nu se creează versiune.',
          'UNCHANGED',
        );
        return 'UNCHANGED';
      }
      if (pending !== null) {
        pending = null;
        counters.withdrawn += 1;
      }
      sequence += 1;
      const versionId = bounded(
        `${prefix}-${bounded(target.sessionId, 80)}-${sequence}`.replace(/\s+/g, '-'),
        128,
      );
      pending = {
        draft: parseStyleSlidersDraft(draft),
        queuedAtTick: tickNow(),
        versionId,
        derived: false,
        changes: EMPTY_CHANGES,
        versionSummary: null,
        barrier: null,
      };
      counters.queued += 1;
      setMessage(
        'Aplicarea este în așteptare: se derivează doar diferențele și se publică la următorul tick, prin bariera de generație.',
        'QUEUED',
      );
      return 'QUEUED';
    },
    withdraw(): boolean {
      assertLive();
      if (pending === null && pendingRestore === null) return false;
      pending = null;
      pendingRestore = null;
      counters.withdrawn += 1;
      setMessage('Aplicarea în așteptare a fost retrasă; nimic nu a fost scris.', 'CLOSED');
      return true;
    },
    requestRestore(versionId: string): StyleSlidersRestoreStatus {
      assertLive();
      counters.restoreRequests += 1;
      if (!open || draft === null) {
        setMessage('Editorul este închis; nu există versiune de restaurat.', 'NOT_OPEN');
        return 'NOT_OPEN';
      }
      if (options.restore === undefined) {
        setMessage('Restaurarea nu este disponibilă în această compoziție.', 'REJECTED');
        return 'UNAVAILABLE';
      }
      if (pending !== null) {
        setMessage('O aplicare este în așteptare; așteaptă tick-ul ei.', 'QUEUED');
        return 'APPLY_PENDING';
      }
      const id = requireId(versionId, 'restore version');
      if (store.getVersion(id) === null) {
        counters.restoreRejections += 1;
        setMessage(`Versiunea ${id} nu există în istoricul acestui profil.`, 'REJECTED');
        return 'UNKNOWN_VERSION';
      }
      if (id === barrier.current().baseVersionId) {
        setMessage(`Versiunea ${id} este deja activă.`, 'UNCHANGED');
        return 'ALREADY_ACTIVE';
      }
      pendingRestore = { versionId: id, requestedAtTick: tickNow(), attempts: 0 };
      setMessage(
        `Restaurarea versiunii ${id} este în așteptare; bariera 205 și activarea 110 se rezolvă la limita tick-ului.`,
        'RESTORE_PENDING',
      );
      return 'QUEUED';
    },
    observeTick(tick: number): void {
      assertLive();
      const at = requireTick(tick, 'tick');
      if (at > lastSeenTick) lastSeenTick = at;
      if (disposed) return;
      const target = currentTarget();
      counters.sessionIdentityChecks += 1;
      if (identityChanged(target)) invalidate(target);
      if (pendingActivation !== null && at >= pendingActivation.activateAtTick) applyActivation(at);
    },
    applyAtTick(tick: number): StyleSlidersTickResult {
      assertLive();
      const at = requireTick(tick, 'apply tick');
      const activationDone = applyActivation(at);
      const target = currentTarget();
      counters.sessionIdentityChecks += 1;
      if (identityChanged(target)) {
        invalidate(target);
        return result('SESSION_CHANGED', at, { reason: 'SESSION_CHANGED' });
      }
      if (pendingRestore !== null) {
        pendingRestore.attempts += 1;
        let restored: ProfileRestoreResult;
        try {
          restored = options.restore!(pendingRestore.versionId, at);
        } catch {
          pendingRestore = null;
          counters.restoreRejections += 1;
          setMessage('Restaurarea a fost respinsă de contractul 114.', 'REJECTED');
          return result('REJECTED', at, { reason: 'RESTORE_REJECTED' });
        }
        if (restored.status === 'COMMITTED' || restored.status === 'ALREADY_ACTIVE') {
          const versionId = restored.versionId ?? pendingRestore.versionId;
          pendingRestore = null;
          counters.restored += 1;
          const committedBarrier = barrier.barriers().at(-1) ?? null;
          if (
            committedBarrier !== null &&
            committedBarrier.activationCommandId !== null &&
            committedBarrier.activationTick !== null
          )
            pendingActivation = {
              commandId: committedBarrier.activationCommandId,
              versionId: committedBarrier.targetVersionId,
              activateAtTick: committedBarrier.activationTick,
            };
          draft = null;
          view = null;
          open = false;
          setMessage(
            `Versiunea ${versionId} a fost restaurată printr-o activare nouă, cu bariera de generație.`,
            'RESTORED',
          );
          return result('RESTORED', at, {
            reason: restored.reason,
            versionId,
            learningEpoch: barrier.current().learningEpoch,
          });
        }
        if (restored.status === 'REJECTED') {
          pendingRestore = null;
          counters.restoreRejections += 1;
          setMessage(`Restaurarea a fost refuzată: ${restored.reason}.`, 'REJECTED');
          return result('REJECTED', at, { reason: restored.reason });
        }
        if (at > lastSeenTick) lastSeenTick = at;
        setMessage('Restaurarea așteaptă limita de tick a barierei 205.', 'RESTORE_PENDING');
        return result('RESTORE_PENDING', at);
      }
      if (pending === null) {
        if (at > lastSeenTick) lastSeenTick = at;
        return result(activationDone ? 'ACTIVATED' : 'IDLE', at);
      }
      if (at <= pending.queuedAtTick) {
        if (at > lastSeenTick) lastSeenTick = at;
        return result('NOT_DUE', at);
      }
      if (at > lastSeenTick) lastSeenTick = at;
      const generation = barrier.current();
      if (draft !== null && generation.baseVersionId !== pending.draft.baseVersionId) {
        if (draft !== null) {
          draft = markStyleSlidersStale(draft, generation.baseVersionId);
          view = projectStyleSliders(draft);
        }
        return failPending(
          'STALE_BASE',
          `Versiunea activă a devenit ${generation.baseVersionId}; draftul cu baza ${pending.draft.baseVersionId} nu suprascrie nimic.`,
          at,
        );
      }

      if (!pending.derived) {
        const changes: { key: string; unit: string; value: number }[] = [];
        for (const field of STYLE_SLIDER_FIELDS) {
          const definition = STYLE_SLIDER_DEFINITIONS[field],
            before = pending.draft.base[field],
            after = pending.draft.proposed[field];
          if (!pending.draft.available[field] || before === null || after === null) continue;
          if (before === after) continue;
          let validated: number;
          try {
            validated = validateParameterValue(
              definition.parameterKey,
              after,
              definition.parameterUnit,
            );
          } catch {
            counters.invalid += 1;
            return failPending(
              'REJECTED',
              `Valoarea pentru ${definition.label} nu respectă catalogul 092.`,
              at,
            );
          }
          changes.push({
            key: definition.parameterKey,
            unit: definition.parameterUnit,
            value: validated,
          });
        }
        if (changes.length === 0) {
          counters.unchanged += 1;
          pending = null;
          setMessage('Nicio diferență reală; nu s-a creat nicio versiune.', 'UNCHANGED');
          return result('IDLE', at, { reason: 'NO_CHANGE' });
        }
        const versionId = pending.versionId;
        let derived;
        try {
          counters.derives += 1;
          counters.storeWrites += 1;
          derived = store.derive({
            profileId,
            versionId,
            parentVersionId: pending.draft.baseVersionId,
            segmentId: `manual:${versionId}`,
            interventionId: `manual:${versionId}`,
            reason: bounded(`MANUAL_TUNING ${STYLE_SLIDERS_TUNING_MAP_VERSION}`, 200),
            createdAt: now(),
            delta: {
              profileVersionId: versionId,
              parentVersionId: pending.draft.baseVersionId,
              engineVersion,
              schemaVersion: 1,
              units: 'SI',
              values: changes,
            },
          });
        } catch {
          counters.storeRejections += 1;
          return failPending('REJECTED', 'Magazinul 109 a refuzat structura diferențelor.', at);
        }
        if (derived.status !== 'ACCEPTED') {
          counters.storeRejections += 1;
          return failPending(
            'REJECTED',
            `Diferențele au fost refuzate de contractul 109/102: ${derived.rejection.code}.`,
            at,
          );
        }
        counters.versionsAdded += 1;
        const changeRows = changesOfVersion(derived.profileVersion);
        pending = {
          ...pending,
          derived: true,
          changes: changeRows,
          versionSummary: Object.freeze({
            versionId: derived.versionId,
            parentVersionId: derived.profileVersion.parentVersionId,
            depth: derived.profileVersion.depth,
            checksum: derived.profileVersion.checksum,
            tuningMapVersion: STYLE_SLIDERS_TUNING_MAP_VERSION,
            manualKeys: changeRows.length,
            learnedKeys: 0 as const,
          }),
        };
        const requested = barrier.requestChange({
          reason: 'NEW_PROFILE',
          targetProfileId: profileId,
          targetVersionId: derived.versionId,
          importValid: true,
        });
        if (requested.status === 'REJECTED') {
          counters.barrierRejections += 1;
          return failPending(
            'REJECTED',
            `Bariera 205 a refuzat schimbarea: ${requested.code}.`,
            at,
          );
        }
        if (requested.barrier !== null) pending = { ...pending, barrier: requested.barrier };
      }

      const resolved = barrier.resolve();
      if (resolved.status === 'TICK_NOT_REACHED') {
        setMessage(
          'Versiunea cu diferențe a fost creată; publicarea și activarea se fac la următorul tick.',
          'PENDING',
        );
        return result('PENDING', at, {
          versionId: pending.versionId,
          changes: pending.changes,
          versionSummary: pending.versionSummary,
          barrier: barrierSummaryOf(resolved.barrier),
          learningEpoch: barrier.current().learningEpoch,
        });
      }
      if (resolved.status !== 'APPLIED') {
        counters.barrierRejections += 1;
        const reason = resolved.code ?? resolved.status;
        const barrierRow = barrierSummaryOf(resolved.barrier);
        pending = null;
        setMessage(`Bariera 205 nu a aplicat schimbarea: ${reason}.`, 'REJECTED');
        return result('REJECTED', at, { reason, barrier: barrierRow });
      }
      const committed = resolved.barrier,
        changes = pending.changes,
        summary = pending.versionSummary,
        versionId = pending.versionId;
      counters.published += 1;
      lastPublishedVersionId = versionId;
      lastActivationTick = null;
      if (
        committed !== null &&
        committed.activationCommandId !== null &&
        committed.activationTick !== null
      ) {
        pendingActivation = {
          commandId: committed.activationCommandId,
          versionId: committed.targetVersionId,
          activateAtTick: committed.activationTick,
        };
      }
      const cancelled = committed?.cancelledJobs ?? [];
      counters.cancelledJobs += cancelled.length;
      pending = null;
      draft = null;
      view = null;
      open = false;
      sessionIdentity = null;
      setMessage(
        `Publicat ${versionId}: ${changes.length} ${changes.length === 1 ? 'diferență' : 'diferențe'}, generația ${committed?.learningEpoch ?? barrier.current().learningEpoch}, activare la tick ${committed?.activationTick ?? '—'}.`,
        'PUBLISHED',
      );
      applyActivation(at);
      return result('PUBLISHED', at, {
        versionId,
        changes,
        versionSummary: summary,
        barrier: barrierSummaryOf(committed),
        learningEpoch: committed?.learningEpoch ?? barrier.current().learningEpoch,
        activation: Object.freeze({
          commandId: committed?.activationCommandId ?? null,
          origin: 'MANUAL_TUNING' as const,
          activateAtTick: committed?.activationTick ?? null,
          appliedAtTick: lastActivationTick,
        }),
      });
    },
    getState: () =>
      Object.freeze({
        version: STYLE_SLIDERS_SESSION_VERSION,
        open,
        pendingApply: pending !== null,
        pendingRestore: pendingRestore?.versionId ?? null,
        draft,
        view,
        publishedVersionId: lastPublishedVersionId,
        message,
        messageCode,
        disposed,
      }),
    getStats: () => {
      const stats = store.stats();
      return Object.freeze({
        version: STYLE_SLIDERS_SESSION_VERSION,
        tuningMapVersion: STYLE_SLIDERS_TUNING_MAP_VERSION,
        opens: counters.opens,
        closes: counters.closes,
        queueRequests: counters.queueRequests,
        queued: counters.queued,
        unchanged: counters.unchanged,
        invalid: counters.invalid,
        stale: counters.stale,
        sessionChanged: counters.sessionChanged,
        derives: counters.derives,
        storeRejections: counters.storeRejections,
        barrierRejections: counters.barrierRejections,
        published: counters.published,
        activated: counters.activated,
        cancelledJobs: counters.cancelledJobs,
        restoreRequests: counters.restoreRequests,
        restored: counters.restored,
        restoreRejections: counters.restoreRejections,
        withdrawn: counters.withdrawn,
        sessionIdentityChecks: counters.sessionIdentityChecks,
        retainedDrafts: 1 as const,
        retainedHistoryRows: draft?.history.length ?? 0,
        versions: stats.versions,
        versionsAdded: counters.versionsAdded,
        learningJobs: 0 as const,
        progressionCalls: 0 as const,
        observationWrites: 0 as const,
        storeWrites: counters.storeWrites,
        lastPublishedVersionId,
        lastAppliedTick: lastActivationTick,
        pendingApply: pending !== null,
        pendingRestore: pendingRestore?.versionId ?? null,
        disposed,
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      open = false;
      pending = null;
      pendingRestore = null;
      pendingActivation = null;
      draft = null;
      view = null;
      sessionIdentity = null;
      setMessage('Editorul de stil a fost eliberat.', 'CLOSED');
    },
  });
}

/** The eight UI fields are exactly the eight accepted 092 keys; no extra key is invented. */
export const STYLE_SLIDERS_EDITABLE_KEYS = Object.freeze(
  STYLE_SLIDER_FIELDS.map(
    (field) => getParameterDefinition(STYLE_SLIDER_DEFINITIONS[field].parameterKey).key,
  ),
);
