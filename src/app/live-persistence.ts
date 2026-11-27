import {
  LIVE_SAVE_EXTENSION,
  LIVE_SAVE_LIMITS,
  LiveSaveError,
  buildLiveSave,
  liveSaveFileName,
  liveSaveFingerprint,
  readLiveSave,
} from '../persistence';
import type {
  LiveSaveBuildResult,
  LiveSaveFingerprints,
  LiveSaveRejection,
  LiveSaveResume,
  LiveSaveSessionIdentity,
  LiveSaveSummary,
  LiveSaveValidationAccepted,
} from '../persistence';

/**
 * PBI 278 live persistence composition.
 *
 * It owns no simulation, ledger or store. Every generation is a plain snapshot produced by the
 * mounted owners (276 daily/XP, 277 challenges, 268/269 company, the active 109 style and the 271
 * segments) and is committed as one 225 checkpoint + 278 file envelope. The composition has:
 *
 * - one generation in preparation and one in commit (periodic requests coalesce into a single
 *   pending tick, exactly like the 222/131 lane);
 * - simulated time (`tick`, `lastSavedTick`, `unsavedTicks`, `nextDueTick`) reported separately from
 *   the real save time (`lastAttemptAt`, `lastSuccessAt`, `lastCommitMs`);
 * - a preview identity before any replacement, and an explicit confirmation that must name the
 *   checksum of exactly the file being shown;
 * - a rollback of the live owners and the stored row when an import or a staging step fails. A bad
 *   checksum never reaches the owners, so the current session stays byte-for-byte untouched.
 */

export const LIVE_PERSISTENCE_VERSION = '278-live-persistence-v1' as const;
export const LIVE_PERSISTENCE_INTERVAL_TICKS = 900 as const;

export const livePersistencePhases = ['IDLE', 'PREPARING', 'COMMITTING', 'FAILED'] as const;
export type LivePersistencePhase = (typeof livePersistencePhases)[number];

export const livePersistenceViewLabels = [
  'NOT_SAVED_YET',
  'SAVING',
  'SAVED',
  'SAVE_FAILED',
  'RESTORED',
  'IMPORTED',
] as const;
export type LivePersistenceViewLabel = (typeof livePersistenceViewLabels)[number];

export interface LivePersistenceStorage {
  load(): string | null;
  save(text: string): void;
  clear(): void;
}

export interface LivePersistenceOwner<T> {
  capture(): T;
  restore(value: unknown): void;
}

export interface LivePersistenceChallengeOwner {
  capture(): unknown | null;
  restore(value: unknown): Readonly<{
    status: 'RESTORED' | 'REJECTED';
    code: string | null;
    message: string;
  }>;
}

export interface LivePersistenceCompanyOwner {
  capture(tick: number): unknown | null;
  restore(value: unknown | null): void;
}

export interface LivePersistenceSegment {
  readonly segmentId: string;
  readonly vehicleId: string;
  readonly mode: string;
}

export interface LivePersistenceIdentity {
  readonly sessionKind: 'ACADEMY' | 'CHAOS';
  readonly sessionId: string;
  readonly playerId: string;
  readonly profileId: string;
  readonly activeVersionId: string;
  readonly worldEpoch: number;
  readonly learningEpoch: number;
  readonly tick: number;
  readonly mode: 'AUTO' | 'MANUAL' | 'LEARNING';
  readonly vehicles: number;
  readonly manualVehicles: number;
}

export interface LivePersistenceOptions {
  readonly identity: () => LivePersistenceIdentity;
  readonly versions: Readonly<{ engine: string; physics: string; map: string }>;
  readonly profile: LivePersistenceOwner<unknown>;
  readonly metrics: () => Readonly<{
    xp: number;
    xpMicroXp: number;
    level: number;
    dailyRewards: number;
  }>;
  readonly daily: {
    capture(): unknown;
    restore(value: unknown): Readonly<{
      status: 'RESTORED' | 'REJECTED';
      reason: string | null;
    }>;
  };
  readonly challenges: LivePersistenceChallengeOwner | null;
  readonly company: LivePersistenceCompanyOwner | null;
  readonly economy: { capture(tick: number): unknown | null };
  readonly segments: { open(): readonly LivePersistenceSegment[] };
  readonly fingerprints: () => LiveSaveFingerprints;
  readonly storage: LivePersistenceStorage;
  readonly intervalTicks?: number;
  readonly now?: () => string;
  readonly monotonic?: () => number;
}

export interface LivePersistenceSimulatedTime {
  readonly tick: number | null;
  readonly lastSavedTick: number | null;
  readonly unsavedTicks: number | null;
  readonly sortTick: number | null;
  readonly nextDueTick: number | null;
  readonly pendingTick: number | null;
  readonly generation: number;
}

export interface LivePersistenceSaveTime {
  readonly lastAttemptAt: string | null;
  readonly lastSuccessAt: string | null;
  readonly lastErrorAt: string | null;
  readonly lastCommitMs: number | null;
}

export interface LivePersistenceCycle {
  readonly generation: number;
  readonly tick: number;
  readonly bytes: number;
  readonly checksum: string;
  readonly commitMs: number;
  readonly createdAt: string;
  readonly simulated: LivePersistenceSimulatedTime;
  readonly saveTime: LivePersistenceSaveTime;
  readonly summary: LiveSaveSummary;
}

export interface LivePersistenceError {
  readonly code: string;
  readonly message: string;
  readonly at: string;
  readonly tick: number | null;
}

export interface LivePersistenceStatus {
  readonly version: typeof LIVE_PERSISTENCE_VERSION;
  readonly sessionId: string;
  readonly intervalTicks: number;
  readonly phase: LivePersistencePhase;
  readonly view: Readonly<{
    label: LivePersistenceViewLabel;
    claimsCompletedSave: boolean;
    detail: string;
  }>;
  readonly simulated: LivePersistenceSimulatedTime;
  readonly saveTime: LivePersistenceSaveTime;
  readonly lastCycle: LivePersistenceCycle | null;
  readonly lastError: LivePersistenceError | null;
  readonly restored: LiveSaveSummary | null;
  readonly lastImport: LivePersistenceImportAccepted | null;
  /** False until the autosave row was read once; no tick may overwrite it before that. */
  readonly autosaveEnabled: boolean;
  readonly counters: Readonly<{
    ticks: number;
    requests: number;
    deferred: number;
    captures: number;
    commits: number;
    failures: number;
    previews: number;
    imports: number;
  }>;
}

export interface LivePersistenceTickDecision {
  readonly status: 'SKIPPED' | 'SCHEDULED' | 'DEFERRED' | 'REJECTED';
  readonly tick: number;
  readonly generation: number | null;
  readonly code: string | null;
  readonly message: string | null;
}

export interface LivePersistenceCurrent {
  readonly sessionId: string;
  readonly playerId: string;
  readonly tick: number;
  readonly xp: number;
  readonly level: number;
  readonly companyFingerprint: string | null;
  readonly kpiFingerprint: string;
  readonly profileVersionId: string;
  readonly dailyRewards: number;
  readonly fingerprint: string;
}

export interface LivePersistenceExportAccepted {
  readonly status: 'ACCEPTED';
  readonly fileName: string;
  readonly text: string;
  readonly checksum: string;
  readonly bytes: number;
  readonly summary: LiveSaveSummary;
  readonly rejection: null;
}

export interface LivePersistenceExportRejected {
  readonly status: 'REJECTED';
  readonly fileName: null;
  readonly text: null;
  readonly checksum: null;
  readonly bytes: 0;
  readonly summary: null;
  readonly rejection: LiveSaveRejection;
}

export type LivePersistenceExport = LivePersistenceExportAccepted | LivePersistenceExportRejected;

export interface LivePersistencePreviewAccepted {
  readonly status: 'ACCEPTED';
  readonly previewId: string;
  readonly summary: LiveSaveSummary;
  readonly current: LivePersistenceCurrent;
  readonly rejection: null;
}

export interface LivePersistencePreviewRejected {
  readonly status: 'REJECTED';
  readonly previewId: null;
  readonly summary: null;
  readonly current: LivePersistenceCurrent | null;
  readonly rejection: LiveSaveRejection;
}

export type LivePersistencePreview =
  LivePersistencePreviewAccepted | LivePersistencePreviewRejected;

export interface LivePersistenceImportAccepted {
  readonly status: 'COMMITTED';
  readonly checksum: string;
  readonly bytes: number;
  readonly summary: LiveSaveSummary;
  readonly launch: LiveSaveResume;
  readonly previousSegment: 'INCOMPLETE' | 'NONE';
  readonly openSegmentIds: readonly string[];
  readonly rewards: Readonly<{ settled: 0; granted: 0 }>;
  readonly xpDelta: number;
  readonly dailyRewardsDelta: number;
  readonly companyFingerprint: string | null;
  readonly kpiFingerprint: string;
  readonly rollback: false;
}

export interface LivePersistenceImportRejected {
  readonly status: 'REJECTED';
  readonly checksum: null;
  readonly bytes: 0;
  readonly summary: null;
  readonly launch: null;
  readonly previousSegment: null;
  readonly openSegmentIds: null;
  readonly rewards: null;
  readonly xpDelta: 0;
  readonly dailyRewardsDelta: 0;
  readonly companyFingerprint: null;
  readonly kpiFingerprint: null;
  readonly rollback: boolean;
  readonly rejection: LiveSaveRejection;
}

export type LivePersistenceImportResult =
  LivePersistenceImportAccepted | LivePersistenceImportRejected;

export interface LivePersistenceRestoreResult {
  readonly status: 'RESTORED' | 'EMPTY' | 'REJECTED';
  readonly summary: LiveSaveSummary | null;
  readonly launch: LiveSaveResume | null;
  readonly rejection: LiveSaveRejection | null;
}

export interface LivePersistence {
  readonly version: typeof LIVE_PERSISTENCE_VERSION;
  onTick(tick: number): LivePersistenceTickDecision;
  saveNow(tick?: number): Promise<LivePersistenceCycle | null>;
  flush(): Promise<void>;
  status(): LivePersistenceStatus;
  exportFile(): LivePersistenceExport;
  preview(text: unknown): LivePersistencePreview;
  importFile(
    text: unknown,
    confirmation?: Readonly<{ previewId: string }>,
  ): Promise<LivePersistenceImportResult>;
  restore(): LivePersistenceRestoreResult;
  close(): Promise<LivePersistenceCycle | null>;
  dispose(): void;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function keyOf(error: unknown): string {
  return error instanceof LiveSaveError ? error.code : 'LIVE_SAVE_RESTORE_FAILED';
}

function rejectionOf(error: unknown): LiveSaveRejection {
  if (error instanceof LiveSaveError)
    return Object.freeze({ code: error.code, message: error.message, path: error.path });
  return Object.freeze({
    code: 'LIVE_SAVE_RESTORE_FAILED' as const,
    message: describe(error),
    path: '$',
  });
}

function defaultNow(): string {
  return new Date().toISOString();
}

function defaultMonotonic(): number {
  if (typeof performance === 'object' && typeof performance.now === 'function')
    return performance.now();
  return Date.now();
}

function intervalOf(value: number | undefined): number {
  if (value === undefined) return LIVE_PERSISTENCE_INTERVAL_TICKS;
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error('The live persistence interval must be a positive safe integer');
  return value;
}

interface CapturedState {
  readonly identity: LiveSaveSessionIdentity;
  readonly metrics: Readonly<{
    xp: number;
    xpMicroXp: number;
    level: number;
    dailyRewards: number;
  }>;
  readonly profile: unknown;
  readonly daily: unknown;
  readonly challenges: unknown | null;
  readonly company: unknown | null;
  readonly economy: unknown | null;
  readonly resume: LiveSaveResume;
  readonly fingerprints: LiveSaveFingerprints;
}

interface PendingPreview {
  readonly checksum: string;
  readonly text: string;
}

export function createLivePersistence(options: LivePersistenceOptions): LivePersistence {
  if (options === null || typeof options !== 'object')
    throw new Error('Live persistence requires options');
  for (const callback of [
    options.identity,
    options.profile?.capture,
    options.profile?.restore,
    options.daily?.capture,
    options.daily?.restore,
    options.economy.capture,
    options.segments.open,
    options.fingerprints,
    options.storage.load,
    options.storage.save,
  ])
    if (typeof callback !== 'function')
      throw new Error('Live persistence owners must be synchronous functions');
  const intervalTicks = intervalOf(options.intervalTicks);
  const now = options.now ?? defaultNow;
  const monotonic = options.monotonic ?? defaultMonotonic;
  const storage = options.storage;

  let disposed = false;
  let autosaveEnabled = false;
  let phase: LivePersistencePhase = 'IDLE';
  let generation = 0;
  let lastSavedTick: number | null = null;
  let lastAttemptAt: string | null = null;
  let lastSuccessAt: string | null = null;
  let lastErrorAt: string | null = null;
  let lastCommitMs: number | null = null;
  let lastCycle: LivePersistenceCycle | null = null;
  let lastError: LivePersistenceError | null = null;
  let restoredSummary: LiveSaveSummary | null = null;
  let lastImport: LivePersistenceImportAccepted | null = null;
  let pendingPreview: PendingPreview | null = null;
  let pendingTick: number | null = null;
  let currentTick: number | null = null;
  let nextDueTick: number | null = null;
  let committing: Promise<LivePersistenceCycle | null> | null = null;
  const counters = {
    ticks: 0,
    requests: 0,
    deferred: 0,
    captures: 0,
    commits: 0,
    failures: 0,
    previews: 0,
    imports: 0,
  };

  function assertLive(): void {
    if (disposed) throw new Error('Live persistence is disposed');
  }

  function identityOf(): LiveSaveSessionIdentity {
    const identity = options.identity();
    return Object.freeze({
      sessionKind: identity.sessionKind,
      sessionId: identity.sessionId,
      playerId: identity.playerId,
      profileId: identity.profileId,
      activeVersionId: identity.activeVersionId,
      worldEpoch: identity.worldEpoch,
      learningEpoch: identity.learningEpoch,
      tick: identity.tick,
      mode: identity.mode,
      vehicles: identity.vehicles,
      manualVehicles: identity.manualVehicles,
    });
  }

  function openSegments(): readonly LivePersistenceSegment[] {
    return options.segments.open().map((entry) =>
      Object.freeze({
        segmentId: entry.segmentId,
        vehicleId: entry.vehicleId,
        mode: entry.mode,
      }),
    );
  }

  function captureState(): CapturedState {
    const identity = identityOf();
    const open = openSegments();
    const company = options.company?.capture(identity.tick) ?? null;
    const economy = options.economy.capture(identity.tick);
    return {
      identity,
      metrics: options.metrics(),
      profile: options.profile.capture(),
      daily: options.daily.capture(),
      challenges: options.challenges?.capture() ?? null,
      company,
      economy,
      resume: Object.freeze({
        launch: 'PAUSED_AUTO' as const,
        paused: true as const,
        auto: true as const,
        inputReleased: true as const,
        previousSegment: open.length > 0 ? ('INCOMPLETE' as const) : ('NONE' as const),
        openSegmentIds: Object.freeze(open.map((entry) => entry.segmentId)),
        offlineIncome: 0 as const,
        offlineXp: 0 as const,
      }),
      fingerprints: options.fingerprints(),
    };
  }

  function nextDueFor(tick: number): number {
    return (Math.floor(tick / intervalTicks) + 1) * intervalTicks;
  }

  function buildState(
    state: CapturedState,
    reason: 'AUTOSAVE' | 'SESSION_SWITCH' | 'CLOSE' | 'SCENARIO_RESET',
    generationValue: number,
    createdAt: string,
  ): LiveSaveBuildResult {
    return buildLiveSave({
      createdAt,
      checkpointId: `live-278:${state.identity.sessionId}:${generationValue}`,
      reason,
      generation: generationValue,
      identity: state.identity,
      metrics: state.metrics,
      versions: options.versions,
      profile: state.profile,
      daily: state.daily,
      challenges: state.challenges,
      company: state.company,
      economy: state.economy,
      resume: state.resume,
      fingerprints: state.fingerprints,
    });
  }

  function simulated(): LivePersistenceSimulatedTime {
    const tick = currentTick;
    const unsaved =
      tick === null || lastSavedTick === null ? null : Math.max(0, tick - lastSavedTick);
    return Object.freeze({
      tick,
      lastSavedTick,
      unsavedTicks: unsaved,
      sortTick: tick,
      nextDueTick,
      pendingTick,
      generation,
    });
  }

  function saveTime(): LivePersistenceSaveTime {
    return Object.freeze({
      lastAttemptAt,
      lastSuccessAt,
      lastErrorAt,
      lastCommitMs,
    });
  }

  function phaseLabel(): {
    label: LivePersistenceViewLabel;
    claimsCompletedSave: boolean;
    detail: string;
  } {
    if (lastError !== null)
      return Object.freeze({
        label: 'SAVE_FAILED' as const,
        claimsCompletedSave: false,
        detail: `${lastError.code}: ${lastError.message}`,
      });
    if (phase === 'PREPARING' || phase === 'COMMITTING')
      return Object.freeze({
        label: 'SAVING' as const,
        claimsCompletedSave: false,
        detail: 'Se salvează generația curentă',
      });
    if (lastSavedTick === null)
      return Object.freeze({
        label: 'NOT_SAVED_YET' as const,
        claimsCompletedSave: false,
        detail: 'Nicio generație durabilă încă',
      });
    const unsaved = Math.max(0, (currentTick ?? lastSavedTick) - lastSavedTick);
    return Object.freeze({
      label: 'SAVED' as const,
      claimsCompletedSave: unsaved === 0,
      detail:
        unsaved === 0
          ? `Salvat la tick ${lastSavedTick}`
          : `Salvat la tick ${lastSavedTick}; ${unsaved} tick-uri nesalvate`,
    });
  }

  function commitBuilt(built: LiveSaveBuildResult, createdAt: string): LivePersistenceCycle {
    if (built.status === 'REJECTED') {
      const error = Object.freeze({
        code: built.rejection.code,
        message: built.rejection.message,
        at: createdAt,
        tick: currentTick,
      });
      lastError = error;
      lastErrorAt = createdAt;
      phase = 'FAILED';
      counters.failures += 1;
      throw new LiveSaveError(built.rejection.code, built.rejection.message, built.rejection.path);
    }
    const started = monotonic();
    try {
      storage.save(built.text);
    } catch (error) {
      lastError = Object.freeze({
        code: 'LIVE_SAVE_WRITE_FAILED',
        message: describe(error),
        at: createdAt,
        tick: currentTick,
      });
      lastErrorAt = createdAt;
      phase = 'FAILED';
      counters.failures += 1;
      throw new LiveSaveError('LIVE_SAVE_WRITE_FAILED', describe(error), '$');
    }
    const commitMs = Math.max(0, monotonic() - started);
    lastCommitMs = commitMs;
    lastSavedTick = built.summary.tick;
    lastSuccessAt = createdAt;
    lastError = null;
    lastErrorAt = null;
    phase = 'IDLE';
    counters.commits += 1;
    const cycle: LivePersistenceCycle = Object.freeze({
      generation: built.summary.generation,
      tick: built.summary.tick,
      bytes: built.bytes,
      checksum: built.checksum,
      commitMs,
      createdAt,
      simulated: simulated(),
      saveTime: saveTime(),
      summary: built.summary,
    });
    lastCycle = cycle;
    return cycle;
  }

  async function commitNow(
    tick: number,
    reason: 'AUTOSAVE' | 'SESSION_SWITCH' | 'CLOSE' | 'SCENARIO_RESET',
  ): Promise<LivePersistenceCycle | null> {
    if (!autosaveEnabled) return null;
    if (disposed || committing !== null) return committing;
    currentTick = tick;
    lastAttemptAt = now();
    phase = 'PREPARING';
    counters.requests += 1;
    let state: CapturedState;
    try {
      state = captureState();
      counters.captures += 1;
    } catch (error) {
      lastError = Object.freeze({
        code: keyOf(error),
        message: describe(error),
        at: lastAttemptAt ?? now(),
        tick,
      });
      lastErrorAt = lastAttemptAt;
      phase = 'FAILED';
      counters.failures += 1;
      return null;
    }
    generation += 1;
    const createdAt = lastAttemptAt;
    const built = buildState(state, reason, generation, createdAt);
    phase = 'COMMITTING';
    let resolve: (value: LivePersistenceCycle | null) => void = () => {};
    let reject: (error: unknown) => void = () => {};
    const promise = new Promise<LivePersistenceCycle | null>((settle, fail) => {
      resolve = settle;
      reject = fail;
    });
    committing = promise;
    try {
      const cycle = commitBuilt(built, createdAt);
      resolve(cycle);
      return cycle;
    } catch (error) {
      reject(error);
      return null;
    } finally {
      committing = null;
      nextDueTick = nextDueFor(tick);
      const deferred = pendingTick;
      pendingTick = null;
      if (deferred !== null && deferred > tick) void commitNow(deferred, 'AUTOSAVE');
    }
  }

  function onTick(tick: number): LivePersistenceTickDecision {
    assertLive();
    counters.ticks += 1;
    currentTick = tick;
    if (!autosaveEnabled)
      return Object.freeze({
        status: 'SKIPPED' as const,
        tick,
        generation: null,
        code: null,
        message: null,
      });
    if (nextDueTick === null)
      nextDueTick =
        tick < intervalTicks ? intervalTicks : Math.floor(tick / intervalTicks) * intervalTicks;
    if (tick < (nextDueTick ?? 0))
      return Object.freeze({
        status: 'SKIPPED' as const,
        tick,
        generation: null,
        code: null,
        message: null,
      });
    if (phase === 'PREPARING' || phase === 'COMMITTING') {
      pendingTick = tick;
      counters.deferred += 1;
      return Object.freeze({
        status: 'DEFERRED' as const,
        tick,
        generation: null,
        code: null,
        message: null,
      });
    }
    void commitNow(tick, 'AUTOSAVE');
    return Object.freeze({
      status: 'SCHEDULED' as const,
      tick,
      generation,
      code: null,
      message: null,
    });
  }

  async function saveNow(tick?: number): Promise<LivePersistenceCycle | null> {
    if (disposed) return null;
    const at = tick ?? currentTick ?? options.identity().tick;
    const cycle = await commitNow(at, 'AUTOSAVE');
    return cycle;
  }

  async function flush(): Promise<void> {
    while (committing !== null) {
      try {
        await committing;
      } catch {
        // The failure is already reported in the status; flush never throws.
      }
    }
  }

  function status(): LivePersistenceStatus {
    return Object.freeze({
      version: LIVE_PERSISTENCE_VERSION,
      sessionId: options.identity().sessionId,
      intervalTicks,
      phase,
      view: phaseLabel(),
      simulated: simulated(),
      saveTime: saveTime(),
      lastCycle,
      lastError,
      restored: restoredSummary,
      lastImport,
      autosaveEnabled,
      counters: Object.freeze({ ...counters }),
    });
  }

  function current(): LivePersistenceCurrent {
    const state = captureState();
    const profile = recordOf(state.profile);
    const versionId = profile.versionId;
    return Object.freeze({
      sessionId: state.identity.sessionId,
      playerId: state.identity.playerId,
      tick: state.identity.tick,
      xp: state.metrics.xp,
      level: state.metrics.level,
      companyFingerprint: state.company === null ? null : liveSaveFingerprint(state.company),
      kpiFingerprint: state.fingerprints.kpi,
      profileVersionId: typeof versionId === 'string' ? versionId : state.identity.activeVersionId,
      dailyRewards: state.metrics.dailyRewards,
      fingerprint: liveSaveFingerprint({
        identity: state.identity,
        fingerprints: state.fingerprints,
        resume: state.resume,
      }),
    });
  }

  function exportFile(): LivePersistenceExport {
    assertLive();
    try {
      const state = captureState();
      const createdAt = now();
      const built = buildState(state, 'CLOSE', generation + 1, createdAt);
      if (built.status === 'REJECTED')
        return Object.freeze({
          status: 'REJECTED' as const,
          fileName: null,
          text: null,
          checksum: null,
          bytes: 0 as const,
          summary: null,
          rejection: built.rejection,
        });
      return Object.freeze({
        status: 'ACCEPTED' as const,
        fileName: liveSaveFileName(createdAt),
        text: built.text,
        checksum: built.checksum,
        bytes: built.bytes,
        summary: built.summary,
        rejection: null,
      });
    } catch (error) {
      return Object.freeze({
        status: 'REJECTED' as const,
        fileName: null,
        text: null,
        checksum: null,
        bytes: 0 as const,
        summary: null,
        rejection: rejectionOf(error),
      });
    }
  }

  function preview(text: unknown): LivePersistencePreview {
    assertLive();
    counters.previews += 1;
    const identity = options.identity();
    const validation = readLiveSave(text, {
      sessionKind: identity.sessionKind,
      sessionId: identity.sessionId,
    });
    if (validation.status === 'REJECTED')
      return Object.freeze({
        status: 'REJECTED' as const,
        previewId: null,
        summary: null,
        current: null,
        rejection: validation.rejection,
      });
    pendingPreview = Object.freeze({
      checksum: validation.summary.checksum,
      text: validation.text,
    });
    return Object.freeze({
      status: 'ACCEPTED' as const,
      previewId: validation.summary.checksum,
      summary: validation.summary,
      current: current(),
      rejection: null,
    });
  }

  function importRejected(
    rejection: LiveSaveRejection,
    rollback = false,
  ): LivePersistenceImportRejected {
    return Object.freeze({
      status: 'REJECTED' as const,
      checksum: null,
      bytes: 0 as const,
      summary: null,
      launch: null,
      previousSegment: null,
      openSegmentIds: null,
      rewards: null,
      xpDelta: 0 as const,
      dailyRewardsDelta: 0 as const,
      companyFingerprint: null,
      kpiFingerprint: null,
      rollback,
      rejection,
    });
  }

  function applyOwners(state: unknown): void {
    options.profile.restore(stateProfile(state));
    const daily = options.daily.restore(stateDaily(state));
    if (daily.status !== 'RESTORED')
      throw new LiveSaveError(
        'LIVE_SAVE_RESTORE_FAILED',
        `The daily checkpoint was refused: ${daily.reason ?? 'unknown'}`,
        'state.daily',
      );
    if (options.challenges !== null) {
      const challenges = stateChallenges(state);
      if (challenges === null && options.challenges.capture() !== null)
        throw new LiveSaveError(
          'LIVE_SAVE_RESTORE_FAILED',
          'The file has no challenge checkpoint',
          'state.challenges',
        );
      if (challenges !== null) {
        const applied = options.challenges.restore(challenges);
        if (applied.status !== 'RESTORED')
          throw new LiveSaveError(
            'LIVE_SAVE_RESTORE_FAILED',
            `The challenge checkpoint was refused: ${applied.message}`,
            'state.challenges',
          );
      }
    }
    options.company?.restore(stateCompany(state));
  }

  function rollbackOwners(before: CapturedState): void {
    try {
      options.profile.restore(before.profile);
    } catch {
      // The rollback is best effort per owner; the next owner is still restored.
    }
    try {
      options.daily.restore(before.daily);
    } catch {
      // Reported by the status; the old stored row is restored below.
    }
    try {
      if (before.challenges !== null) options.challenges?.restore(before.challenges);
    } catch {
      // Same closed rollback path.
    }
    try {
      options.company?.restore(before.company);
    } catch {
      // Same closed rollback path.
    }
  }

  function stateProfile(state: unknown): unknown {
    return recordOf(state).profile;
  }
  function stateDaily(state: unknown): unknown {
    return recordOf(state).daily;
  }
  function stateChallenges(state: unknown): unknown | null {
    const value = recordOf(state).challenges;
    return value === undefined ? null : value;
  }
  function stateCompany(state: unknown): unknown | null {
    const value = recordOf(state).company;
    return value === undefined ? null : value;
  }

  function recordOf(value: unknown): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      throw new LiveSaveError('LIVE_SAVE_RESTORE_FAILED', 'Expected a state object', '$');
    return value as Record<string, unknown>;
  }

  async function importFile(
    text: unknown,
    confirmation?: Readonly<{ previewId: string }>,
  ): Promise<LivePersistenceImportResult> {
    assertLive();
    const identity = options.identity();
    const validation = readLiveSave(text, {
      sessionKind: identity.sessionKind,
      sessionId: identity.sessionId,
    });
    if (validation.status === 'REJECTED') return importRejected(validation.rejection);
    if (confirmation === undefined)
      return importRejected({
        code: 'LIVE_SAVE_PREVIEW_REQUIRED',
        message: 'The replacement needs an explicit confirmation of the previewed file',
        path: 'confirmation',
      });
    if (pendingPreview === null)
      return importRejected({
        code: 'LIVE_SAVE_PREVIEW_REQUIRED',
        message: 'The replacement needs the checksum of a validated preview',
        path: 'confirmation',
      });
    if (
      confirmation.previewId !== pendingPreview.checksum ||
      validation.summary.checksum !== pendingPreview.checksum
    )
      return importRejected({
        code: 'LIVE_SAVE_PREVIEW_STALE',
        message: 'The confirmed preview does not describe this file',
        path: 'confirmation.previewId',
      });
    const before = captureState();
    const previousText = storage.load();
    const beforeXp = summaryOfCurrentXp(before);
    const beforeRewards = summaryOfCurrentRewards(before);
    try {
      applyOwners(validation.state);
      try {
        storage.save(validation.text);
      } catch (error) {
        throw new LiveSaveError('LIVE_SAVE_WRITE_FAILED', describe(error), '$');
      }
    } catch (error) {
      rollbackOwners(before);
      try {
        if (previousText === null) storage.clear();
        else storage.save(previousText);
      } catch {
        // The old row could not be rewritten; rollback of the owners already happened.
      }
      counters.failures += 1;
      return importRejected(rejectionOf(error), true);
    }
    generation = validation.summary.generation;
    lastSavedTick = validation.summary.tick;
    const liveTick = options.identity().tick;
    currentTick = liveTick;
    nextDueTick = nextDueFor(Math.max(liveTick, validation.summary.tick));
    lastSuccessAt = now();
    lastAttemptAt = lastSuccessAt;
    lastError = null;
    lastErrorAt = null;
    lastCommitMs = 0;
    phase = 'IDLE';
    pendingPreview = null;
    counters.imports += 1;
    const after = captureState();
    const accepted: LivePersistenceImportAccepted = Object.freeze({
      status: 'COMMITTED' as const,
      checksum: validation.summary.checksum,
      bytes: validation.bytes,
      summary: validation.summary,
      launch: validation.summary.resume,
      previousSegment: validation.summary.resume.previousSegment,
      openSegmentIds: validation.summary.resume.openSegmentIds,
      rewards: Object.freeze({ settled: 0 as const, granted: 0 as const }),
      xpDelta: summaryOfCurrentXp(after) - beforeXp,
      dailyRewardsDelta: summaryOfCurrentRewards(after) - beforeRewards,
      companyFingerprint:
        stateCompany(validation.state) === null
          ? null
          : liveSaveFingerprint(stateCompany(validation.state)),
      kpiFingerprint: validation.summary.fingerprints.kpi,
      rollback: false as const,
    });
    lastImport = accepted;
    autosaveEnabled = true;
    return accepted;
  }

  function summaryOfCurrentXp(state: CapturedState): number {
    return state.metrics.xpMicroXp;
  }

  function summaryOfCurrentRewards(state: CapturedState): number {
    return state.metrics.dailyRewards;
  }

  function restore(): LivePersistenceRestoreResult {
    assertLive();
    let text: string | null;
    try {
      text = storage.load();
    } catch (error) {
      lastError = Object.freeze({
        code: 'LIVE_SAVE_RESTORE_FAILED',
        message: describe(error),
        at: now(),
        tick: null,
      });
      return Object.freeze({
        status: 'REJECTED' as const,
        summary: null,
        launch: null,
        rejection: rejectionOf(error),
      });
    }
    if (text === null) {
      autosaveEnabled = true;
      return Object.freeze({
        status: 'EMPTY' as const,
        summary: null,
        launch: null,
        rejection: null,
      });
    }
    const identity = options.identity();
    const validation = readLiveSave(text, {
      sessionKind: identity.sessionKind,
      sessionId: identity.sessionId,
    });
    if (validation.status === 'REJECTED') {
      lastError = Object.freeze({
        code: validation.rejection.code,
        message: validation.rejection.message,
        at: now(),
        tick: null,
      });
      return Object.freeze({
        status: 'REJECTED' as const,
        summary: null,
        launch: null,
        rejection: validation.rejection,
      });
    }
    const before = captureState();
    try {
      applyOwners(validation.state);
    } catch (error) {
      rollbackOwners(before);
      lastError = Object.freeze({
        code: keyOf(error),
        message: describe(error),
        at: now(),
        tick: null,
      });
      return Object.freeze({
        status: 'REJECTED' as const,
        summary: null,
        launch: null,
        rejection: rejectionOf(error),
      });
    }
    generation = validation.summary.generation;
    lastSavedTick = validation.summary.tick;
    currentTick = validation.summary.tick;
    nextDueTick = nextDueFor(validation.summary.tick);
    restoredSummary = validation.summary;
    autosaveEnabled = true;
    lastSuccessAt = now();
    lastAttemptAt = lastSuccessAt;
    lastError = null;
    lastErrorAt = null;
    lastCommitMs = 0;
    phase = 'IDLE';
    return Object.freeze({
      status: 'RESTORED' as const,
      summary: validation.summary,
      launch: validation.summary.resume,
      rejection: null,
    });
  }

  async function close(): Promise<LivePersistenceCycle | null> {
    if (disposed) return null;
    return saveNow(options.identity().tick);
  }

  return Object.freeze({
    version: LIVE_PERSISTENCE_VERSION,
    onTick,
    saveNow,
    flush,
    status,
    exportFile,
    preview,
    importFile,
    restore,
    close,
    dispose(): void {
      disposed = true;
      pendingPreview = null;
      pendingTick = null;
    },
  });
}

/** The public file limits re-exported for the shell and the evidence tooling. */
export const LIVE_PERSISTENCE_BUDGET = Object.freeze({
  intervalTicks: LIVE_PERSISTENCE_INTERVAL_TICKS,
  maxFileBytes: LIVE_SAVE_LIMITS.maxFileBytes,
  maxBodyBytes: LIVE_SAVE_LIMITS.maxBodyBytes,
  extension: LIVE_SAVE_EXTENSION,
});

export type { LiveSaveValidationAccepted };
