import type { ProfileVersion } from '../profiles';
import {
  SESSION_KINDS_VERSION,
  canonicalizeJson,
  computeSessionKindCheckpointChecksum,
  createMemorySessionKindStore,
  createSessionKindHost,
  createSessionKindIsolation,
  sessionKindLabels,
  sessionKinds,
  sha256Hex,
} from '../persistence';
import type {
  ChaosProfileCopy,
  SessionAcademyLedgers,
  SessionJobResultDecision,
  SessionKind,
  SessionKindCheckpointStore,
  SessionKindHost,
  SessionKindHostStatus,
  SessionLaunch,
  SessionLedgerFingerprint,
  SessionLedgerGate,
  SessionReloadOutcome,
  SessionRestoreOutcome,
  SessionSwitchResult,
  SessionWorldCapture,
  SessionWorldIdentity,
  SessionWorldPort,
} from '../persistence';

/**
 * PBI 261 — fluxul viu al sesiunilor Academie/Haos peste shell-ul 260.
 *
 * Modulul nu inventează un al doilea checkpoint, ledger sau model de simulare: compune
 * `createSessionKindHost` (225) și, când proprietarii reali sunt furnizați, poarta de izolare
 * `createSessionKindIsolation`. Adaugă doar tranzițiile cerute de jocul live:
 *
 * - alegerea explicită a sesiunii și identitatea stabilă `sessionId`/`worldEpoch`/`learningEpoch`;
 * - schimbarea care închide segmentul, comite un singur checkpoint, anulează joburile lumii vechi și
 *   pornește în `PAUSED_AUTO`;
 * - resetul aceleiași sesiuni, cu checkpoint `SCENARIO_RESET` comis înainte de schimbarea epocilor;
 * - refuzul închis al rezultatelor târzii prin identitatea 225;
 * - amprenta daily/XP/recompense (și KPI, când este furnizat) înainte și după reset.
 *
 * Modulul este pur: fără DOM, Babylon, ceas de perete implicit sau `Math.random`. Lumea fizică,
 * segmentul și joburile sunt porturi injectate de compoziție.
 */

export const SESSION_FLOW_VERSION = '261-session-flow-v1' as const;

export interface SessionFlowMenuChoice {
  readonly kind: SessionKind;
  readonly label: string;
  readonly live: boolean;
  readonly profileId: string;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly learningEpoch: number;
  readonly checkpoints: number;
  readonly lastCheckpointId: string | null;
  readonly lastTick: number | null;
}

export interface SessionFlowMenu {
  readonly version: typeof SESSION_FLOW_VERSION;
  readonly live: SessionKind | null;
  readonly choices: readonly SessionFlowMenuChoice[];
  readonly ledgerIsolation: boolean;
}

export interface SessionFlowFingerprint extends SessionLedgerFingerprint {
  readonly kpi: string | null;
}

export interface SessionFlowPreserved {
  readonly profile: boolean;
  readonly style: boolean;
  readonly xp: boolean | null;
  readonly daily: boolean | null;
  readonly rewards: boolean | null;
  readonly kpi: boolean | null;
}

export interface SessionResetAccepted {
  readonly status: 'RESET';
  readonly sessionKind: SessionKind;
  readonly checkpointId: string;
  readonly previousEpochs: Readonly<{
    worldEpoch: number;
    learningEpoch: number;
  }>;
  readonly epochs: Readonly<{ worldEpoch: number; learningEpoch: number }>;
  readonly closedSegments: number;
  readonly invalidatedJobs: number;
  readonly releasedInputs: number;
  readonly launch: SessionLaunch;
  readonly identity: SessionWorldIdentity;
  readonly preserved: SessionFlowPreserved;
  readonly missionCompletions: 0;
  readonly rewardGrants: 0;
  readonly resets: number;
}

export interface SessionResetRejected {
  readonly status: 'REJECTED';
  readonly code:
    | 'NOT_STARTED'
    | 'SWITCH_IN_PROGRESS'
    | 'CAPTURE_FAILED'
    | 'CHECKPOINT_INVALID'
    | 'SAVE_FAILED'
    | 'WORLD_RESTART_FAILED';
  readonly message: string;
  readonly world: SessionKind | null;
  readonly checkpointId: string | null;
  readonly closedSegments: number;
}

export interface SessionResetPartial {
  readonly status: 'PARTIAL';
  readonly sessionKind: SessionKind;
  readonly checkpointId: string;
  readonly stage: 'INVALIDATE_JOBS' | 'RELEASE_INPUT' | 'STOP_WORLD' | 'RESTART_WORLD';
  readonly message: string;
}

export type SessionResetOutcome = SessionResetAccepted | SessionResetRejected | SessionResetPartial;

export interface SessionFlowOptions {
  /** Store-ul 225; implicit magazinul determinist în memorie, nu un al doilea checkpoint. */
  readonly store?: SessionKindCheckpointStore;
  readonly world: SessionWorldPort;
  readonly academyProfile: ProfileVersion;
  readonly chaosProfile: ChaosProfileCopy;
  readonly academySessionId: string;
  readonly chaosSessionId: string;
  /** Ceas explicit; fluxul nu citește ceasul de perete. */
  readonly now: () => string;
  /** Proprietarii reali 212/213/125; când lipsesc, porțile ledgerelor nu sunt pretinse. */
  readonly ledgers?: SessionAcademyLedgers;
  /** Snapshot KPI 209; amprenta lui dovedește că resetul nu atinge KPI. */
  readonly kpi?: () => unknown;
  /** Pornește aplicația în pauză/AUTO după fiecare tranzițiune confirmată. */
  readonly onLaunch?: (launch: SessionLaunch, identity: SessionWorldIdentity) => void;
}

export interface SessionFlowStatus extends SessionKindHostStatus {
  readonly versionFlow: typeof SESSION_FLOW_VERSION;
  readonly resets: number;
  readonly contextMismatches: number;
  readonly lastReset: Readonly<{
    checkpointId: string;
    sessionKind: SessionKind;
    previous: Readonly<{ worldEpoch: number; learningEpoch: number }>;
    next: Readonly<{ worldEpoch: number; learningEpoch: number }>;
  }> | null;
  readonly fingerprint: SessionFlowFingerprint | null;
}

export interface SessionFlow {
  readonly version: typeof SESSION_FLOW_VERSION;
  /** Alege explicit sesiunea: prima alegere pornește lumea, următoarele o schimbă. */
  choose(sessionKind: SessionKind): Promise<SessionSwitchResult>;
  restore(sessionKind: SessionKind): Promise<SessionRestoreOutcome>;
  reload(): Promise<SessionReloadOutcome>;
  /** Resetează lumea aceleiași sesiuni, păstrând stilul și progresul. */
  resetWorld(): Promise<SessionResetOutcome>;
  /** Verifică identitatea din tick-ul shell-ului; un context vechi este un fault, nu un pas. */
  observeTick(
    context: Readonly<{
      tick: number;
      sessionId: string;
      worldEpoch: number;
      learningEpoch: number;
    }>,
  ): boolean;
  acceptJobResult(value: unknown): SessionJobResultDecision;
  menu(): SessionFlowMenu;
  status(): SessionFlowStatus;
  fingerprint(): SessionFlowFingerprint | null;
  ledgerGate(sessionKind: SessionKind): SessionLedgerGate | null;
}

function isKind(value: unknown): value is SessionKind {
  return value === 'ACADEMY' || value === 'CHAOS';
}

function requireKind(value: unknown): SessionKind {
  if (!isKind(value)) throw new Error('Session flow: unknown session kind.');
  return value;
}

function digest(value: unknown): string | null {
  try {
    const canonical = canonicalizeJson(value, { maxDepth: 32 });
    if (canonical.status === 'REJECTED') return null;
    return `sha256:${sha256Hex(canonical.text)}`;
  } catch {
    return null;
  }
}

function canonicalBody(value: unknown): {
  body: Readonly<Record<string, unknown>>;
  bodyBytes: number;
} {
  const canonical = canonicalizeJson(value, { maxDepth: 32 });
  if (canonical.status === 'REJECTED')
    throw new Error(
      `Session flow: the checkpoint body is not canonical: ${canonical.rejection.message}`,
    );
  return Object.freeze({
    body: Object.freeze(value as Readonly<Record<string, unknown>>),
    bodyBytes: new TextEncoder().encode(canonical.text).length,
  });
}

export function createSessionFlow(options: SessionFlowOptions): SessionFlow {
  if (options === undefined || options === null || typeof options !== 'object')
    throw new Error('Session flow: options are required.');
  if (typeof options.now !== 'function') throw new Error('Session flow: now is required.');
  if (typeof options.world?.capture !== 'function')
    throw new Error('Session flow: the world port is required.');
  const store = options.store ?? createMemorySessionKindStore();
  const host: SessionKindHost = createSessionKindHost({
    store,
    world: options.world,
    academyProfile: options.academyProfile,
    chaosProfile: options.chaosProfile,
    academySessionId: options.academySessionId,
    chaosSessionId: options.chaosSessionId,
    now: options.now,
  });
  const isolation =
    options.ledgers === undefined
      ? null
      : createSessionKindIsolation({
          daily: options.ledgers.daily,
          xp: options.ledgers.xp,
          campaign: options.ledgers.campaign,
        });
  const checkpointCounts: Record<SessionKind, number> = { ACADEMY: 0, CHAOS: 0 };
  let resets = 0;
  let contextMismatches = 0;
  let lastReset: SessionFlowStatus['lastReset'] = null;

  function identityOf(sessionKind: SessionKind): SessionWorldIdentity {
    const current = host.status().kinds[sessionKind];
    return Object.freeze({
      sessionKind,
      sessionId: current.sessionId,
      worldEpoch: current.worldEpoch,
      learningEpoch: current.learningEpoch,
    });
  }

  function fingerprint(): SessionFlowFingerprint | null {
    if (isolation === null) return null;
    const base = isolation.fingerprint();
    return Object.freeze({ ...base, kpi: digest(options.kpi?.() ?? null) });
  }

  function preservedFrom(
    before: SessionFlowFingerprint | null,
    after: SessionFlowFingerprint | null,
    sessionKind: SessionKind,
  ): SessionFlowPreserved {
    const status = host.status();
    const profile = Object.freeze({ ...status.kinds[sessionKind] });
    const same = (field: keyof SessionFlowFingerprint): boolean | null => {
      if (before === null || after === null) return null;
      if (field === 'counts') return null;
      return before[field] === after[field];
    };
    return Object.freeze({
      // Owner-ul profilului este 109; fluxul nu îl scrie, iar identitatea lui rămâne aceeași.
      profile: profile.profileId.length > 0,
      style: profile.profileId.length > 0,
      xp: same('xp'),
      daily: same('daily'),
      rewards: same('campaign'),
      kpi: same('kpi'),
    });
  }

  async function choose(sessionKind: SessionKind): Promise<SessionSwitchResult> {
    const kind = requireKind(sessionKind);
    const status = host.status();
    if (status.live === null) {
      const started = host.start(kind);
      if (started.status === 'STARTED') options.onLaunch?.(started.launch, started.identity);
      return started;
    }
    const switched = await host.switchTo(kind);
    if (switched.status === 'SWITCHED') {
      checkpointCounts[switched.from] += 1;
      options.onLaunch?.(switched.launch, switched.identity);
    }
    return switched;
  }

  async function resetWorld(): Promise<SessionResetOutcome> {
    const status = host.status();
    const kind = status.live;
    if (kind === null) {
      return Object.freeze({
        status: 'REJECTED' as const,
        code: 'NOT_STARTED' as const,
        message: 'No session kind is live; choose a session before resetting the world',
        world: null,
        checkpointId: null,
        closedSegments: 0,
      });
    }
    if (status.switching) {
      return Object.freeze({
        status: 'REJECTED' as const,
        code: 'SWITCH_IN_PROGRESS' as const,
        message: 'A session switch is already in progress',
        world: kind,
        checkpointId: null,
        closedSegments: 0,
      });
    }
    const identity = identityOf(kind);
    let closedSegments = 0;
    let capture: SessionWorldCapture;
    try {
      closedSegments = options.world.closeSegment(identity);
      capture = options.world.capture(identity);
    } catch (error: unknown) {
      return Object.freeze({
        status: 'REJECTED' as const,
        code: 'CAPTURE_FAILED' as const,
        message: error instanceof Error ? error.message : String(error),
        world: kind,
        checkpointId: null,
        closedSegments,
      });
    }
    const next = Object.freeze({
      worldEpoch: identity.worldEpoch + 1,
      learningEpoch: identity.learningEpoch + 1,
    });
    if (!Number.isSafeInteger(next.worldEpoch) || !Number.isSafeInteger(next.learningEpoch)) {
      return Object.freeze({
        status: 'REJECTED' as const,
        code: 'CHECKPOINT_INVALID' as const,
        message: 'The reset would pass the epoch ceiling',
        world: kind,
        checkpointId: null,
        closedSegments,
      });
    }
    const checkpointId = `reset:${identity.sessionId}:${String(next.worldEpoch)}`;
    let measured: { body: Readonly<Record<string, unknown>>; bodyBytes: number };
    try {
      measured = canonicalBody({
        ...capture.body,
        reset: {
          reason: 'SCENARIO_RESET',
          previousWorldEpoch: identity.worldEpoch,
          previousLearningEpoch: identity.learningEpoch,
          worldEpoch: next.worldEpoch,
          learningEpoch: next.learningEpoch,
        },
      });
    } catch (error: unknown) {
      return Object.freeze({
        status: 'REJECTED' as const,
        code: 'CHECKPOINT_INVALID' as const,
        message: error instanceof Error ? error.message : String(error),
        world: kind,
        checkpointId,
        closedSegments,
      });
    }
    const draft = {
      version: SESSION_KINDS_VERSION,
      checkpointId,
      sessionKind: kind,
      sessionId: identity.sessionId,
      profileId: status.kinds[kind].profileId,
      worldEpoch: next.worldEpoch,
      learningEpoch: next.learningEpoch,
      tick: capture.tick,
      generation: checkpointCounts[kind] + 1,
      reason: 'SCENARIO_RESET' as const,
      createdAt: options.now(),
      vehicles: capture.vehicles,
      manualVehicles: capture.manualVehicles,
      launch: 'PAUSED_AUTO' as const,
      body: measured.body,
      bodyBytes: measured.bodyBytes,
    };
    const checkpoint = Object.freeze({
      ...draft,
      checksum: computeSessionKindCheckpointChecksum(draft),
    });
    const before = fingerprint();
    const committed = await store.commit(checkpoint);
    if (committed.status === 'REJECTED') {
      return Object.freeze({
        status: 'REJECTED' as const,
        code: committed.rejection.code === 'SAVE_FAILED' ? 'SAVE_FAILED' : 'CHECKPOINT_INVALID',
        message: committed.rejection.message,
        world: kind,
        checkpointId,
        closedSegments,
      });
    }

    let invalidatedJobs = 0;
    let releasedInputs = 0;
    let stage: SessionResetPartial['stage'] = 'INVALIDATE_JOBS';
    try {
      invalidatedJobs = options.world.invalidateJobs(identity, 'WORLD_RESET');
      stage = 'RELEASE_INPUT';
      releasedInputs = options.world.releaseInput(identity);
      stage = 'STOP_WORLD';
      options.world.stop(identity);
      stage = 'RESTART_WORLD';
    } catch (error: unknown) {
      return Object.freeze({
        status: 'PARTIAL' as const,
        sessionKind: kind,
        checkpointId,
        stage,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    let restored: SessionRestoreOutcome;
    try {
      restored = await host.restore(kind);
    } catch (error: unknown) {
      return Object.freeze({
        status: 'PARTIAL' as const,
        sessionKind: kind,
        checkpointId,
        stage: 'RESTART_WORLD' as const,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (restored.status !== 'RESTORED') {
      return Object.freeze({
        status: 'PARTIAL' as const,
        sessionKind: kind,
        checkpointId,
        stage: 'RESTART_WORLD' as const,
        message: restored.message,
      });
    }
    checkpointCounts[kind] = Math.max(checkpointCounts[kind] + 1, draft.generation);
    resets += 1;
    lastReset = Object.freeze({
      checkpointId,
      sessionKind: kind,
      previous: Object.freeze({
        worldEpoch: identity.worldEpoch,
        learningEpoch: identity.learningEpoch,
      }),
      next: Object.freeze({
        worldEpoch: restored.worldEpoch,
        learningEpoch: restored.learningEpoch,
      }),
    });
    options.onLaunch?.(restored.launch, {
      sessionKind: kind,
      sessionId: identity.sessionId,
      worldEpoch: restored.worldEpoch,
      learningEpoch: restored.learningEpoch,
    });
    return Object.freeze({
      status: 'RESET' as const,
      sessionKind: kind,
      checkpointId,
      previousEpochs: lastReset.previous,
      epochs: lastReset.next,
      closedSegments,
      invalidatedJobs,
      releasedInputs,
      launch: restored.launch,
      identity: Object.freeze({
        sessionKind: kind,
        sessionId: identity.sessionId,
        worldEpoch: restored.worldEpoch,
        learningEpoch: restored.learningEpoch,
      }),
      preserved: preservedFrom(before, fingerprint(), kind),
      missionCompletions: 0 as const,
      rewardGrants: 0 as const,
      resets,
    });
  }

  function menu(): SessionFlowMenu {
    const status = host.status();
    return Object.freeze({
      version: SESSION_FLOW_VERSION,
      live: status.live,
      ledgerIsolation: isolation !== null,
      choices: Object.freeze(
        sessionKinds.map((kind) => {
          const current = status.kinds[kind];
          return Object.freeze({
            kind,
            label: sessionKindLabels[kind],
            live: status.live === kind,
            profileId: current.profileId,
            sessionId: current.sessionId,
            worldEpoch: current.worldEpoch,
            learningEpoch: current.learningEpoch,
            checkpoints: checkpointCounts[kind],
            lastCheckpointId: current.lastCheckpointId,
            lastTick: current.lastTick,
          });
        }),
      ),
    });
  }

  return Object.freeze({
    version: SESSION_FLOW_VERSION,
    choose,
    async restore(sessionKind: SessionKind) {
      const kind = requireKind(sessionKind);
      const restored = await host.restore(kind);
      if (restored.status === 'RESTORED')
        options.onLaunch?.(restored.launch, {
          sessionKind: kind,
          sessionId: statusSessionId(kind),
          worldEpoch: restored.worldEpoch,
          learningEpoch: restored.learningEpoch,
        });
      return restored;
    },
    async reload() {
      const reloaded = await host.reload();
      if (reloaded.status === 'RESUMED')
        options.onLaunch?.(reloaded.launch, identityOf(reloaded.sessionKind));
      return reloaded;
    },
    resetWorld,
    observeTick(
      context: Readonly<{
        tick: number;
        sessionId: string;
        worldEpoch: number;
        learningEpoch: number;
      }>,
    ) {
      const live = host.status().live;
      if (live === null) {
        contextMismatches += 1;
        return false;
      }
      const current = host.status().kinds[live];
      const matches =
        context.sessionId === current.sessionId &&
        context.worldEpoch === current.worldEpoch &&
        context.learningEpoch === current.learningEpoch;
      if (!matches) contextMismatches += 1;
      return matches;
    },
    acceptJobResult: (value: unknown) => host.acceptJobResult(value),
    menu,
    status: () => {
      const base = host.status();
      return Object.freeze({
        ...base,
        versionFlow: SESSION_FLOW_VERSION,
        resets,
        contextMismatches,
        lastReset,
        fingerprint: fingerprint(),
        kinds: Object.freeze({
          ACADEMY: Object.freeze({
            ...base.kinds.ACADEMY,
            checkpoints: checkpointCounts.ACADEMY,
          }),
          CHAOS: Object.freeze({ ...base.kinds.CHAOS, checkpoints: checkpointCounts.CHAOS }),
        }),
        resident: Object.freeze({
          ...base.resident,
          checkpoints: checkpointCounts.ACADEMY + checkpointCounts.CHAOS,
        }),
      });
    },
    fingerprint,
    ledgerGate: (sessionKind: SessionKind) => {
      const kind = requireKind(sessionKind);
      return isolation === null ? null : isolation.gate(kind);
    },
  });

  function statusSessionId(sessionKind: SessionKind): string {
    return host.status().kinds[sessionKind].sessionId;
  }
}
