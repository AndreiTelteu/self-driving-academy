import { createStableId, requireContract, tick as readTick } from '../sessions';
import { createEventBus, parseSimulationEvent } from '../simulation';
import type { EventBus, SimulationEvent } from '../simulation';
import {
  createCampaignMissionCatalog,
  createMissionRewardsLedger,
  createMissionTracker,
  createTutorial,
  MISSION_FAILURE_REASONS,
  parseMissionCatalog,
} from '../missions';
import type {
  CampaignProgress,
  MissionCatalog,
  MissionCompletionResult,
  MissionFailureReason,
  MissionInstance,
  MissionReplayResult,
  MissionRewardsLedger,
  MissionRewardsSnapshot,
  MissionTracker,
  Tutorial,
  TutorialInstance,
  TutorialStepDefinition,
} from '../missions';
import { composeMissionPanelSnapshot, TUTORIAL_PANEL_VERSION } from '../ui';
import type { MissionPanelSnapshot, TutorialPanelSnapshot } from '../ui';
import type { ControlMode } from '../vehicles';

/**
 * PBI 275 — live campaign, tutorial and mission panel composition.
 *
 * This module is the only live owner of the delivered 116 tracker, 117 tutorial and 125 reward
 * ledger. It creates no second simulation, mission state, XP balance or profile store: live facts
 * from the real owners are translated into validated 007 events on a dedicated mission bus, the
 * tracker judges them, and the 125 ledger settles an authored reward exactly once.
 *
 * The three conclusions stay separate:
 *
 * - campaign state and rewards come from the real 116/125 contracts;
 * - the tutorial is a separate 117 instance with its own five-step path and structurally zero
 *   learning jobs/profile versions;
 * - the mission panel is composed from those read models and never recalculates an objective.
 *
 * Failure is terminal for the attempt only. A failed mission changes no profile, removes no XP and
 * keeps every granted reward; replay creates a new 116 attempt with the same reward identity.
 */

export const LIVE_MISSIONS_VERSION = '275-live-missions-v1' as const;
export const LIVE_MISSIONS_REFRESH_HZ = 10;

export const liveMissionSessionKinds = ['ACADEMY', 'CHAOS'] as const;
export type LiveMissionSessionKind = (typeof liveMissionSessionKinds)[number];

export const liveMissionFailureCauses = ['PLAYER_ABANDONED', 'SCENARIO_RESET', 'SHUTDOWN'] as const;
export type LiveMissionFailureCause = (typeof liveMissionFailureCauses)[number];

export interface LiveMissionModeSegmentFact {
  readonly segmentId: string;
  readonly vehicleId: string;
  readonly mode: ControlMode;
  readonly learningEligible: boolean;
  readonly startTick: number;
  readonly endTick: number | null;
  readonly completeness: 'OPEN' | 'CLOSED' | 'INCOMPLETE';
}

export interface LiveMissionModesSnapshot {
  readonly segments: readonly LiveMissionModeSegmentFact[];
}

export interface LiveMissionRideFact {
  readonly rideId: string;
  readonly taxiId: string;
  readonly boardingTick: number | null;
  readonly completionTick: number | null;
}

export interface LiveMissionRidesSnapshot {
  readonly rides: readonly LiveMissionRideFact[];
}

export interface LiveMissionHealthFact {
  readonly factId: string;
  readonly taxiId: string;
  readonly fact: string;
  readonly tick: number;
  readonly otherEntityId?: string | null;
  readonly impulseNs?: number | null;
}

export interface LiveMissionFollowEpisodeFact {
  readonly episodeId: string;
  readonly vehicleId: string;
  readonly leaderId: string;
  readonly startTick: number;
  readonly minGapM: number;
  readonly maxGapM: number;
}

export interface LiveMissionAuthorityFact {
  readonly tick: number;
  readonly playerVehicleId: string | null;
  readonly mode: ControlMode;
  readonly suspended: boolean;
}

export interface LiveMissionSelectionFact {
  readonly vehicleId: string;
  readonly kind: 'TAXI' | 'CIVIL';
}

/**
 * Read-only ports backed by the real live owners in `main.ts`. A test or deterministic report can
 * supply the same shape without any renderer, clock or simulation.
 */
export interface LiveMissionPorts {
  readonly modes: () => LiveMissionModesSnapshot | null;
  readonly rides: () => LiveMissionRidesSnapshot | null;
  readonly health: () => readonly LiveMissionHealthFact[];
  readonly follow: () => readonly LiveMissionFollowEpisodeFact[];
  readonly authority: () => LiveMissionAuthorityFact | null;
  readonly selection: () => LiveMissionSelectionFact | null;
}

export interface LiveMissionOptions {
  readonly namespace?: string;
  readonly catalog?: unknown;
  readonly ports?: Partial<LiveMissionPorts>;
  /**
   * Read-only observer of every validated 007 event this composition publishes. The 276 daily/XP
   * vertical consumes the same facts instead of translating them a second time.
   */
  readonly onEvent?: (event: SimulationEvent) => void;
  /** Read-only observer of every real 125 completion settlement, paid at most once by its identity. */
  readonly onSettled?: (settlement: MissionCompletionResult) => void;
}

export interface LiveMissionSessionInput {
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly tick: number;
  readonly kind: LiveMissionSessionKind;
}

export interface LiveMissionStepInput {
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly tick: number;
}

export interface LiveMissionStepResult {
  readonly tick: number;
  readonly eventsPublished: number;
  readonly eventsDuplicate: number;
  readonly eventsFailed: number;
  readonly settled: readonly string[];
  readonly started: readonly string[];
  readonly expired: readonly string[];
}

export interface LiveMissionActivationInput {
  readonly profileId: string;
  readonly versionId: string;
  readonly learningEpoch: number;
  readonly activationTick: number;
  readonly tick: number;
}

export interface LiveMissionRewardFacts {
  readonly totals: MissionRewardsSnapshot['totals'];
  readonly byMission: MissionRewardsSnapshot['byMission'];
}

export interface LiveMissionStatus {
  readonly version: typeof LIVE_MISSIONS_VERSION;
  readonly sessionId: string | null;
  readonly worldEpoch: number | null;
  readonly tick: number;
  readonly activeMissionId: string | null;
  readonly campaign: Readonly<{
    missions: number;
    completed: number;
    available: number;
    locked: number;
    nextMissionId: string | null;
    settledCompletions: number;
    duplicateCompletions: number;
    duplicateRewards: number;
  }>;
  readonly rewards: LiveMissionRewardFacts;
  readonly tutorial: Readonly<{
    state: string | null;
    stepId: string | null;
    stepIndex: number | null;
    completedBy: string | null;
    learningGate: 'TUTORIAL_BLOCKS_LEARNING' | 'OPEN';
    learningJobs: 0;
    profileVersions: 0;
  }>;
  readonly eventBus: Readonly<{
    published: number;
    duplicates: number;
    failures: number;
    retained: number;
  }>;
  /** Structural: this composition has no profile writer and no XP balance to mutate. */
  readonly profileWrites: 0;
  readonly xpDelta: 0;
  readonly learningJobsCreated: 0;
}

export interface LiveMissions {
  readonly version: typeof LIVE_MISSIONS_VERSION;
  beginSession(input: LiveMissionSessionInput): LiveMissionStatus;
  step(input: LiveMissionStepInput): LiveMissionStepResult;
  observeLearningActivation(input: LiveMissionActivationInput): LiveMissionStepResult;
  /** Host path for a real 116 replay; the panel only displays the option. */
  replay(missionId: string, atTick: number): MissionReplayResult;
  failActive(reason: Exclude<LiveMissionFailureCause, 'SHUTDOWN'>, atTick: number): number;
  tutorialActive(): boolean;
  tutorialLearningBlocked(): boolean;
  tutorialPause(atTick: number): TutorialInstance;
  tutorialResume(atTick: number): TutorialInstance;
  tutorialSkipStep(atTick: number): TutorialInstance;
  tutorialSkipAll(atTick: number): TutorialInstance;
  tutorialInstance(): TutorialInstance | null;
  tutorialSnapshot(): TutorialPanelSnapshot | null;
  snapshot(): MissionPanelSnapshot | null;
  status(): LiveMissionStatus;
  stats(): LiveMissionStatus;
  dispose(): void;
}

interface Context {
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly kind: LiveMissionSessionKind;
}

interface PendingEvent {
  readonly type: SimulationEvent['type'];
  readonly factId: string;
  readonly entityIds: readonly string[];
  readonly payload: Readonly<Record<string, unknown>>;
}

const emptyRewardTotals: MissionRewardsSnapshot['totals'] = Object.freeze({
  granted: 0,
  xp: 0,
  unlocks: 0,
  duplicates: 0,
});

function readPorts(value: Partial<LiveMissionPorts> | undefined): LiveMissionPorts {
  const ports = value ?? {};
  return Object.freeze({
    modes: typeof ports.modes === 'function' ? ports.modes : () => null,
    rides: typeof ports.rides === 'function' ? ports.rides : () => null,
    health: typeof ports.health === 'function' ? ports.health : () => Object.freeze([]),
    follow: typeof ports.follow === 'function' ? ports.follow : () => Object.freeze([]),
    authority: typeof ports.authority === 'function' ? ports.authority : () => null,
    selection: typeof ports.selection === 'function' ? ports.selection : () => null,
  });
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function latestInstance(
  instances: readonly MissionInstance[],
  missionId: string,
): MissionInstance | null {
  let latest: MissionInstance | null = null;
  for (const instance of instances) {
    if (instance.missionId !== missionId) continue;
    if (latest === null || instance.attempt > latest.attempt) latest = instance;
  }
  return latest;
}

function currentStep(
  tutorial: Tutorial,
  instance: TutorialInstance,
): TutorialStepDefinition | null {
  if (instance.state === 'COMPLETED' || instance.stepIndex >= instance.steps.length) return null;
  return tutorial.steps()[instance.stepIndex] ?? null;
}

export function createLiveMissions(options: LiveMissionOptions = {}): LiveMissions {
  const catalog = parseMissionCatalog(
    options.catalog === undefined
      ? createCampaignMissionCatalog(options.namespace)
      : options.catalog,
  );
  const missionCatalog: MissionCatalog = catalog;
  const tracker: MissionTracker = createMissionTracker({ catalog: missionCatalog });
  const ledger: MissionRewardsLedger = createMissionRewardsLedger({ catalog: missionCatalog });
  const tutorial: Tutorial = createTutorial();
  const ports = readPorts(options.ports);

  let context: Context | null = null;
  let bus: EventBus | null = null;
  let detachBus: (() => void) | null = null;
  let lastTick = 0;
  let lastPublishedTick = 0;
  let disposed = false;
  let tutorialStarted = false;
  let tutorialPausedForSession = false;

  const settled = new Set<string>();
  const seenModes = new Set<string>();
  const seenBoarding = new Set<string>();
  const seenCompletion = new Set<string>();
  const seenHealth = new Set<string>();
  const seenFollow = new Set<string>();
  const playerTaxis = new Set<string>();
  const recordedFailures = new Set<string>();

  let publishedEvents = 0;
  let duplicateEvents = 0;
  let failedEvents = 0;
  let settledCompletions = 0;
  let duplicateCompletions = 0;
  let duplicateRewards = 0;

  function assertLive(): void {
    requireContract(!disposed, 'Live missions are disposed');
  }

  function requireContext(): Context {
    requireContract(context !== null, 'Live missions have no active session');
    return context;
  }

  function rewardFacts(): LiveMissionRewardFacts {
    const snapshot = ledger.rewards();
    return Object.freeze({
      totals: snapshot.totals ?? emptyRewardTotals,
      byMission: snapshot.byMission,
    });
  }

  function campaignProgress(): CampaignProgress {
    return ledger.progress();
  }

  function activeMissionId(): string | null {
    const active = tracker.active();
    return active.length === 0 ? null : active[0]!.missionId;
  }

  function startMission(missionId: string, atTick: number): MissionInstance | null {
    const existing = latestInstance(tracker.instances(), missionId);
    if (existing !== null) return null;
    const result = tracker.start({ missionId, tick: atTick, difficulty: 'NORMAL' });
    return result.instance;
  }

  /**
   * Starts the first playable mission when nothing has ever started, and the next one after a real
   * completion. A failed attempt is never auto-replayed: the player explicitly decides via the host
   * replay path.
   */
  function advanceCampaign(atTick: number): readonly string[] {
    const started: string[] = [];
    if (tracker.instances().length === 0) {
      const progress = campaignProgress();
      const first = progress.missions.find(
        (entry) => entry.state === 'AVAILABLE' && entry.playable,
      );
      if (first !== undefined) {
        const instance = startMission(first.missionId, atTick);
        if (instance !== null) started.push(first.missionId);
      }
      return Object.freeze(started);
    }
    if (tracker.active().length > 0) return Object.freeze(started);
    const progress = campaignProgress();
    const next = progress.missions.find((entry) => entry.state === 'AVAILABLE' && entry.playable);
    if (next === undefined) return Object.freeze(started);
    const instance = startMission(next.missionId, atTick);
    if (instance !== null) started.push(next.missionId);
    return Object.freeze(started);
  }

  function settleCompleted(): readonly string[] {
    const settledNow: string[] = [];
    for (const instance of tracker.instances()) {
      if (instance.state !== 'COMPLETED' || settled.has(instance.instanceId)) continue;
      const result: MissionCompletionResult = ledger.settle({ instance });
      settled.add(instance.instanceId);
      settledCompletions += 1;
      if (result.status === 'DUPLICATE') duplicateCompletions += 1;
      duplicateRewards += result.rewardsDuplicate;
      options.onSettled?.(result);
      settledNow.push(instance.instanceId);
    }
    return Object.freeze(settledNow);
  }

  function recordFailedAttempts(atTick: number): void {
    const at = Math.max(readTick(atTick), lastTick);
    for (const instance of tracker.instances()) {
      if (instance.state !== 'FAILED' || recordedFailures.has(instance.instanceId)) continue;
      ledger.recordAttemptFailure({
        missionId: instance.missionId,
        attempt: instance.attempt,
        tick: Math.max(at, instance.failedTick ?? at),
      });
      recordedFailures.add(instance.instanceId);
    }
  }

  function failActive(
    reason: Exclude<LiveMissionFailureCause, 'SHUTDOWN'>,
    atTick: number,
  ): number {
    const at = Math.max(readTick(atTick), lastTick);
    let failed = 0;
    for (const instance of tracker.active()) {
      tracker.fail({ instanceId: instance.instanceId, reason, tick: at });
      failed += 1;
    }
    lastTick = Math.max(lastTick, at);
    recordFailedAttempts(at);
    return failed;
  }

  function eventIdOf(type: SimulationEvent['type'], factId: string, atTick: number): string {
    const active = requireContext();
    const suffix = [String(active.worldEpoch), type, factId, String(atTick)];
    return createStableId('live-mission-event', active.sessionId, suffix);
  }

  function publishPending(pending: readonly PendingEvent[], atTick: number): void {
    const active = requireContext();
    const target = Math.max(readTick(atTick), lastTick, lastPublishedTick);
    for (const entry of pending) {
      const event = {
        schemaVersion: 1 as const,
        units: 'SI' as const,
        sessionId: active.sessionId,
        worldEpoch: active.worldEpoch,
        eventId: eventIdOf(entry.type, entry.factId, target),
        tick: target,
        entityIds: [...entry.entityIds],
        type: entry.type,
        payload: entry.payload,
      };
      const parsed = parseSimulationEvent(event);
      const result = bus!.publish(parsed);
      if (result.status === 'duplicate') {
        duplicateEvents += 1;
      } else {
        publishedEvents += 1;
        if (result.failures.length > 0) {
          failedEvents += result.failures.length;
          const first = result.failures[0]!.error;
          throw new Error(
            `Live mission event ${entry.type} was refused: ${
              first instanceof Error ? first.message : String(first)
            }`,
          );
        }
        options.onEvent?.(parsed);
      }
      lastPublishedTick = target;
      lastTick = Math.max(lastTick, target);
      if (entry.type === 'PICKUP' || entry.type === 'DROPOFF') {
        try {
          tutorial.ingest(parsed);
        } catch (error: unknown) {
          // The tutorial is a separate 117 contract. A refused observation is never allowed to break
          // the mission tick or the live world; the refusal stays visible in tutorial stats.
          if (!(error instanceof Error)) throw error;
        }
      }
    }
  }

  function baseline(): void {
    const modes = ports.modes();
    if (modes !== null) for (const segment of modes.segments) seenModes.add(segment.segmentId);
    const rides = ports.rides();
    if (rides !== null) {
      for (const ride of rides.rides) {
        if (ride.boardingTick !== null)
          seenBoarding.add(`${ride.rideId}:${String(ride.boardingTick)}`);
        if (ride.completionTick !== null)
          seenCompletion.add(`${ride.rideId}:${String(ride.completionTick)}`);
      }
    }
    for (const fact of ports.health()) seenHealth.add(fact.factId);
    for (const episode of ports.follow()) seenFollow.add(episode.episodeId);
  }

  function collectModeEvents(): PendingEvent[] {
    const modes = ports.modes();
    if (modes === null) return [];
    const pending: PendingEvent[] = [];
    for (const segment of modes.segments) {
      if (seenModes.has(segment.segmentId)) continue;
      seenModes.add(segment.segmentId);
      if (segment.mode === 'AUTO') continue;
      playerTaxis.add(segment.vehicleId);
      pending.push(
        Object.freeze({
          type: 'MANUAL_START',
          factId: `${segment.segmentId}:start`,
          entityIds: Object.freeze([segment.vehicleId]),
          payload: Object.freeze({
            vehicleId: segment.vehicleId,
            controlMode: segment.mode,
          }),
        }),
      );
      if (segment.completeness !== 'OPEN')
        pending.push(
          Object.freeze({
            type: 'MANUAL_END',
            factId: `${segment.segmentId}:end`,
            entityIds: Object.freeze([segment.vehicleId]),
            payload: Object.freeze({
              vehicleId: segment.vehicleId,
              controlMode: segment.mode,
            }),
          }),
        );
    }
    return pending;
  }

  function collectFollowEvents(): PendingEvent[] {
    const pending: PendingEvent[] = [];
    for (const episode of ports.follow()) {
      if (seenFollow.has(episode.episodeId)) continue;
      seenFollow.add(episode.episodeId);
      pending.push(
        Object.freeze({
          type: 'LEADER_ACQUIRED',
          factId: episode.episodeId,
          entityIds: Object.freeze([episode.vehicleId, episode.leaderId]),
          payload: Object.freeze({
            vehicleId: episode.vehicleId,
            leaderId: episode.leaderId,
            gapM: Math.max(0, Math.min(episode.minGapM, episode.maxGapM)),
          }),
        }),
      );
    }
    return pending;
  }

  function collectHealthEvents(): PendingEvent[] {
    const pending: PendingEvent[] = [];
    for (const fact of ports.health()) {
      if (seenHealth.has(fact.factId)) continue;
      seenHealth.add(fact.factId);
      // A health fact is not a collision by itself. Only the explicit 028 collision damage fact is
      // translated, and it must name the other real entity; a bare damage mark is not invented into
      // a crash.
      if (fact.fact !== 'COLLISION_DAMAGE') continue;
      const other = fact.otherEntityId ?? null;
      if (other === null || other === fact.taxiId) continue;
      pending.push(
        Object.freeze({
          type: 'COLLISION',
          factId: fact.factId,
          entityIds: Object.freeze([fact.taxiId, other]),
          payload: Object.freeze({
            vehicleId: fact.taxiId,
            otherEntityId: other,
            impulseNs: fact.impulseNs ?? 0,
          }),
        }),
      );
    }
    return pending;
  }

  function collectRideEvents(): PendingEvent[] {
    const rides = ports.rides();
    if (rides === null) return [];
    const pending: PendingEvent[] = [];
    for (const ride of rides.rides) {
      // Campaign ride objectives are the player's service, not every AI fare settled by the economy.
      if (!playerTaxis.has(ride.taxiId)) continue;
      if (ride.boardingTick !== null) {
        const key = `${ride.rideId}:${String(ride.boardingTick)}`;
        if (!seenBoarding.has(key)) {
          seenBoarding.add(key);
          pending.push(
            Object.freeze({
              type: 'PICKUP',
              factId: `${ride.rideId}:pickup:${String(ride.boardingTick)}`,
              entityIds: Object.freeze([ride.taxiId, ride.rideId]),
              payload: Object.freeze({ vehicleId: ride.taxiId, rideId: ride.rideId }),
            }),
          );
        }
      }
      if (ride.completionTick !== null) {
        const key = `${ride.rideId}:${String(ride.completionTick)}`;
        if (!seenCompletion.has(key)) {
          seenCompletion.add(key);
          pending.push(
            Object.freeze({
              type: 'DROPOFF',
              factId: `${ride.rideId}:dropoff:${String(ride.completionTick)}`,
              entityIds: Object.freeze([ride.taxiId, ride.rideId]),
              payload: Object.freeze({ vehicleId: ride.taxiId, rideId: ride.rideId }),
            }),
          );
        }
      }
    }
    pending.sort((left, right) => {
      if (left.type !== right.type) return left.type === 'PICKUP' ? -1 : 1;
      return compareText(left.factId, right.factId);
    });
    return pending;
  }

  let lastSelectionKey = '';
  let lastControlKey = '';

  function observeTutorial(atTick: number): void {
    const instance = tutorial.instance();
    if (instance === null || instance.state !== 'ACTIVE') return;
    const selection = ports.selection();
    if (selection !== null) {
      const key = `${selection.vehicleId}:${selection.kind}`;
      if (key !== lastSelectionKey) {
        lastSelectionKey = key;
        if (instance.state === 'ACTIVE')
          tutorial.observeSelection({
            tick: atTick,
            vehicleId: selection.vehicleId,
            kind: selection.kind,
          });
      }
    }
    const authority = ports.authority();
    const current = tutorial.instance();
    if (authority === null || current === null) return;
    if (current.state !== 'ACTIVE') return;
    // AUTO releases the PLAYER seat, so the accepted authority has no player vehicle. The camera
    // selection or the tutorial's own taxi is the real vehicle the AUTO step refers to.
    const vehicleId = authority.playerVehicleId ?? selection?.vehicleId ?? current.taxiId;
    if (vehicleId === null) return;
    const controlKey = `${vehicleId}:${authority.mode}`;
    if (controlKey === lastControlKey) return;
    lastControlKey = controlKey;
    // The tutorial is a learning-free classroom. The host gate keeps the 272/273 pipeline from
    // producing a job for this segment, and the 117 contract requires explicit ineligibility here.
    tutorial.observeControl({
      tick: atTick,
      vehicleId,
      mode: authority.mode,
      learningEligible: false,
    });
  }

  function status(): LiveMissionStatus {
    const active = context;
    const progress = campaignProgress();
    const tutorialInstance = tutorial.instance();
    const step = tutorialInstance === null ? null : currentStep(tutorial, tutorialInstance);
    const rewards = rewardFacts();
    return Object.freeze({
      version: LIVE_MISSIONS_VERSION,
      sessionId: active?.sessionId ?? null,
      worldEpoch: active?.worldEpoch ?? null,
      tick: lastTick,
      activeMissionId: activeMissionId(),
      campaign: Object.freeze({
        missions: progress.counts.missions,
        completed: progress.counts.completed,
        available: progress.counts.available,
        locked: progress.counts.locked,
        nextMissionId: progress.nextMissionId,
        settledCompletions,
        duplicateCompletions,
        duplicateRewards,
      }),
      rewards,
      tutorial: Object.freeze({
        state: tutorialInstance?.state ?? null,
        stepId: step?.stepId ?? null,
        stepIndex: tutorialInstance?.stepIndex ?? null,
        completedBy: tutorialInstance?.completedBy ?? null,
        learningGate: tutorialLearningBlocked() ? 'TUTORIAL_BLOCKS_LEARNING' : 'OPEN',
        learningJobs: 0 as const,
        profileVersions: 0 as const,
      }),
      eventBus: Object.freeze({
        published: publishedEvents,
        duplicates: duplicateEvents,
        failures: failedEvents,
        retained: bus?.getStats().retainedEvents ?? 0,
      }),
      profileWrites: 0 as const,
      xpDelta: 0 as const,
      learningJobsCreated: 0 as const,
    });
  }

  function tutorialLearningBlocked(): boolean {
    const instance = tutorial.instance();
    return instance !== null && instance.state !== 'COMPLETED';
  }

  function tutorialInstance(): TutorialInstance | null {
    return tutorial.instance();
  }

  function tutorialSnapshot(): TutorialPanelSnapshot | null {
    if (context === null) return null;
    const instance = tutorial.instance();
    if (instance === null) return null;
    const step = currentStep(tutorial, instance);
    const complete = instance.state === 'COMPLETED';
    const definition =
      step ??
      tutorial.steps()[Math.max(0, Math.min(tutorial.steps().length - 1, instance.stepIndex - 1))]!;
    return Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId: context.sessionId,
      worldEpoch: context.worldEpoch,
      version: TUTORIAL_PANEL_VERSION,
      tick: Math.max(lastTick, instance.updatedTick),
      state: instance.state,
      stepId: complete ? null : (step?.stepId ?? null),
      stepIndex: instance.stepIndex,
      stepCount: instance.steps.length,
      title: complete ? 'Tutorial finalizat' : definition.title,
      instruction: complete
        ? 'Tutorialul nu a produs learning; poți continua cu orice taxi.'
        : definition.instruction,
      taxiId: instance.taxiId,
    });
  }

  function snapshot(): MissionPanelSnapshot | null {
    if (context === null) return null;
    return composeMissionPanelSnapshot({
      sessionId: context.sessionId,
      worldEpoch: context.worldEpoch,
      tick: Math.max(lastTick, tracker.stats().tick),
      catalog: missionCatalog,
      progress: campaignProgress(),
      instances: tracker.instances(),
    });
  }

  function beginSession(input: LiveMissionSessionInput): LiveMissionStatus {
    assertLive();
    const atTick = readTick(input.tick);
    const kind = input.kind;
    requireContract(
      (liveMissionSessionKinds as readonly string[]).includes(kind),
      'Live mission session kind',
    );
    if (
      context !== null &&
      context.sessionId === input.sessionId &&
      context.worldEpoch === input.worldEpoch
    ) {
      lastTick = Math.max(lastTick, atTick);
      return status();
    }
    if (context !== null) {
      const reason: 'PLAYER_ABANDONED' | 'SCENARIO_RESET' =
        context.sessionId !== input.sessionId ? 'PLAYER_ABANDONED' : 'SCENARIO_RESET';
      failActive(reason, atTick);
      if (detachBus !== null) {
        detachBus();
        detachBus = null;
      }
      bus?.dispose();
      bus = null;
    }
    context = Object.freeze({
      sessionId: input.sessionId,
      worldEpoch: input.worldEpoch,
      kind,
    });
    lastTick = Math.max(lastTick, atTick);
    lastPublishedTick = lastTick;
    bus = createEventBus({
      sessionId: input.sessionId,
      worldEpoch: input.worldEpoch,
      maxEventsPerEpoch: 10_000,
      maxListeners: 32,
    });
    detachBus = tracker.attachBus(bus);
    baseline();
    if (kind === 'ACADEMY') {
      const instance = tutorial.instance();
      if (!tutorialStarted) {
        if (instance === null) {
          tutorial.start({ tick: lastTick });
          tutorialStarted = true;
        }
      } else if (instance !== null && instance.state === 'PAUSED' && tutorialPausedForSession) {
        tutorial.resume({ tick: lastTick });
        tutorialPausedForSession = false;
      }
    } else {
      const instance = tutorial.instance();
      if (instance !== null && instance.state === 'ACTIVE') {
        tutorial.pause({ tick: lastTick });
        tutorialPausedForSession = true;
      }
    }
    const started = advanceCampaign(lastTick);
    if (started.length > 0) lastTick = Math.max(lastTick, atTick);
    return status();
  }

  function step(input: LiveMissionStepInput): LiveMissionStepResult {
    assertLive();
    const active = requireContext();
    requireContract(
      active.sessionId === input.sessionId && active.worldEpoch === input.worldEpoch,
      'Live mission step belongs to another session',
    );
    const atTick = Math.max(readTick(input.tick), lastTick);
    lastTick = atTick;
    const authority = ports.authority();
    if (authority !== null && authority.playerVehicleId !== null)
      playerTaxis.add(authority.playerVehicleId);
    const expired = tracker.advance(atTick).expired;
    recordFailedAttempts(atTick);
    observeTutorial(atTick);
    const before = publishedEvents;
    publishPending(
      [...collectModeEvents(), ...collectFollowEvents(), ...collectHealthEvents()],
      atTick,
    );
    publishPending(collectRideEvents(), atTick);
    recordFailedAttempts(atTick);
    const settledNow = settleCompleted();
    const started = advanceCampaign(atTick);
    return Object.freeze({
      tick: atTick,
      eventsPublished: publishedEvents - before,
      eventsDuplicate: duplicateEvents,
      eventsFailed: failedEvents,
      settled: settledNow,
      started,
      expired,
    });
  }

  function observeLearningActivation(input: LiveMissionActivationInput): LiveMissionStepResult {
    assertLive();
    requireContext();
    const atTick = Math.max(readTick(input.tick), lastTick);
    const activationTick = Math.max(readTick(input.activationTick), atTick);
    lastTick = atTick;
    const before = publishedEvents;
    publishPending(
      [
        Object.freeze({
          type: 'PROFILE_ACTIVATE',
          factId: `${input.versionId}:${String(activationTick)}`,
          entityIds: Object.freeze([input.profileId]),
          payload: Object.freeze({
            profileId: input.profileId,
            versionId: input.versionId,
            learningEpoch: readTick(input.learningEpoch),
            activationTick,
          }),
        }),
      ],
      atTick,
    );
    const settledNow = settleCompleted();
    const started = advanceCampaign(atTick);
    return Object.freeze({
      tick: atTick,
      eventsPublished: publishedEvents - before,
      eventsDuplicate: duplicateEvents,
      eventsFailed: failedEvents,
      settled: settledNow,
      started,
      expired: Object.freeze([]),
    });
  }

  function replay(missionId: string, atTick: number): MissionReplayResult {
    assertLive();
    const instance = latestInstance(tracker.instances(), missionId);
    requireContract(instance !== null, `No mission attempt exists for ${missionId}`);
    const at = Math.max(readTick(atTick), lastTick);
    const result = tracker.replay({ instanceId: instance.instanceId, tick: at });
    lastTick = at;
    return result;
  }

  function tutorialAction(
    action: 'pause' | 'resume' | 'skipStep' | 'skipAll',
    atTick: number,
  ): TutorialInstance {
    assertLive();
    const instance = tutorial.instance();
    requireContract(instance !== null, 'Tutorial has not started');
    const at = Math.max(readTick(atTick), lastTick);
    lastTick = at;
    if (action === 'pause') return tutorial.pause({ tick: at });
    if (action === 'resume') return tutorial.resume({ tick: at });
    if (action === 'skipAll') return tutorial.skip({ tick: at, stepId: 'ALL' });
    const step = currentStep(tutorial, instance);
    requireContract(step !== null, 'Tutorial has no current step to skip');
    return tutorial.skip({ tick: at, stepId: step.stepId });
  }

  return Object.freeze({
    version: LIVE_MISSIONS_VERSION,
    beginSession,
    step,
    observeLearningActivation,
    replay,
    failActive,
    tutorialActive: () => tutorial.instance()?.state === 'ACTIVE',
    tutorialLearningBlocked,
    tutorialPause: (atTick: number) => tutorialAction('pause', atTick),
    tutorialResume: (atTick: number) => tutorialAction('resume', atTick),
    tutorialSkipStep: (atTick: number) => tutorialAction('skipStep', atTick),
    tutorialSkipAll: (atTick: number) => tutorialAction('skipAll', atTick),
    tutorialInstance,
    tutorialSnapshot,
    snapshot,
    status,
    stats: status,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (detachBus !== null) {
        detachBus();
        detachBus = null;
      }
      bus?.dispose();
      bus = null;
      tutorial.dispose();
      tracker.dispose();
      settled.clear();
      seenModes.clear();
      seenBoarding.clear();
      seenCompletion.clear();
      seenHealth.clear();
      seenFollow.clear();
      recordedFailures.clear();
      playerTaxis.clear();
      context = null;
    },
  });
}

/** The closed failure vocabulary is shared with 116 so a host cannot invent a reason. */
export function liveMissionFailureReason(value: unknown): MissionFailureReason {
  requireContract(
    typeof value === 'string' && (MISSION_FAILURE_REASONS as readonly string[]).includes(value),
    'Unknown live mission failure reason',
  );
  return value as MissionFailureReason;
}
