import { createFleetRegistry, DEFAULT_FLEET_COUNTS } from '../../src/fleet';
import {
  createMissionRewardsLedger,
  createPlayerProgress,
  parsePlayerProgress,
  createExtendedChallengeCatalog,
  createExtendedChallengeCapabilities,
  extendedChallengeVerdictStatuses,
  missionVehicleAccess,
  planExtendedChallengeAttempt,
} from '../../src/missions';
import type {
  CampaignProgress,
  ExtendedChallengeAttemptPlan,
  ExtendedChallengeCapabilities,
  ExtendedChallengeVerdictStatus,
  ExtendedChallengeVerdictReason,
  MissionRewardsLedger,
  MissionUnlockSnapshot,
  PlayerProgress,
} from '../../src/missions';
import { extendedChallengeLearningKeys } from '../../src/missions';
import {
  completeCampaign,
  createRewardsFleet,
  createRewardsTracker,
} from './mission-rewards-fixture';

/**
 * Deterministic fixtures for PBI 188.
 *
 * Every event is an explicit tick inside an explicit 60 Hz window. There is no wall clock, no random
 * source and no browser. A passing fixture honours the governed fact; a failing fixture changes only
 * that fact, so the verdict flip proves what the evaluator measures.
 */

export const EXTENDED_FIXTURE_SEED = 18_188 as const;
export const EXTENDED_FIXTURE_START_TICK = 0 as const;
export const EXTENDED_FIXTURE_PLAYER = 'player:188' as const;

export function extendedCatalog() {
  return createExtendedChallengeCatalog();
}

export function extendedChallenge(challengeId: string) {
  const challenge = createExtendedChallengeCatalog().challenges.find(
    (entry) => entry.challengeId === challengeId,
  );
  if (challenge === undefined)
    throw new Error(`Unknown extended fixture challenge: ${challengeId}`);
  return challenge;
}

/** Every delivered capability: both sessions, manual control and all 56 V2 keys. */
export function fullExtendedCapabilities(
  sessionKind: 'ACADEMY' | 'CHAOS' = 'ACADEMY',
): ExtendedChallengeCapabilities {
  return createExtendedChallengeCapabilities({
    sessionKind,
    controlModes: ['MANUAL', 'AUTO', 'LEARNING'],
    vehicleClasses: ['compact', 'sedan'],
    capabilities: [
      'FREE_DRIVE',
      'MANUAL_CONTROL',
      'V2_LEARNING_KEYS',
      'PEDESTRIAN_TRAFFIC',
      'ROUTE_ALTERNATIVES',
      'SIGNAL_OPPORTUNITIES',
      'HAZARD_STIMULI',
      'SERVICE_STOPS',
    ],
    learningKeys: [...extendedChallengeLearningKeys],
    campaignCompleted: 2,
  });
}

/** A lean but real snapshot: free driving only, no V2 key, no family capability. */
export function leanExtendedCapabilities(
  sessionKind: 'ACADEMY' | 'CHAOS' = 'ACADEMY',
): ExtendedChallengeCapabilities {
  return createExtendedChallengeCapabilities({
    sessionKind,
    controlModes: ['AUTO'],
    vehicleClasses: ['compact'],
    capabilities: ['FREE_DRIVE'],
    learningKeys: [],
    campaignCompleted: 0,
  });
}

export interface ExtendedPlanOptions {
  readonly seed?: number;
  readonly sessionKind?: 'ACADEMY' | 'CHAOS';
  readonly capabilities?: ExtendedChallengeCapabilities;
}

export function extendedPlan(
  challengeId: string,
  options: ExtendedPlanOptions = {},
): ExtendedChallengeAttemptPlan {
  const challenge = extendedChallenge(challengeId);
  const sessionKind = options.sessionKind ?? 'ACADEMY';
  return planExtendedChallengeAttempt({
    challenge,
    catalogVersion: extendedCatalog().version,
    capabilities: options.capabilities ?? fullExtendedCapabilities(sessionKind),
    sessionKind,
    seed: options.seed ?? EXTENDED_FIXTURE_SEED,
    attempt: 1,
    startedTick: EXTENDED_FIXTURE_START_TICK,
  });
}

type Facts = {
  tickHz: number;
  startedTick: number;
  endedTick: number;
  sessionKind: 'ACADEMY' | 'CHAOS';
  controlSource: 'MANUAL' | 'AUTO' | 'LEARNING';
  incidents: number;
  pedestrianCrossings: readonly Record<string, unknown>[];
  routeDecisions: readonly Record<string, unknown>[];
  recoveryAttempts: readonly Record<string, unknown>[];
  signalOpportunities: readonly Record<string, unknown>[];
  hazardPasses: readonly Record<string, unknown>[];
  serviceStops: readonly Record<string, unknown>[];
};

/** A valid window that ends one tick before the written deadline. */
export function extendedFacts(
  plan: ExtendedChallengeAttemptPlan,
  overrides: Partial<Facts> = {},
): Facts {
  return {
    tickHz: 60,
    startedTick: EXTENDED_FIXTURE_START_TICK,
    endedTick: plan.objective.deadlineTick - 1,
    sessionKind: plan.sessionKind,
    controlSource: 'MANUAL',
    incidents: 0,
    pedestrianCrossings: [],
    routeDecisions: [],
    recoveryAttempts: [],
    signalOpportunities: [],
    hazardPasses: [],
    serviceStops: [],
    ...overrides,
  };
}

function at(plan: ExtendedChallengeAttemptPlan, fraction: number): number {
  return Math.max(1, Math.round((plan.objective.deadlineTick - 1) * fraction));
}

function crossing(tick: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    crossingId: `crossing:${tick}`,
    pedestrianEnteredTick: tick - 120,
    pedestrianClearedTick: tick - 10,
    egoEnteredTick: tick,
    egoClearedTick: tick + 30,
    minimumClearanceM: 3,
    approachSpeedMps: 4,
    ...overrides,
  };
}

function stopOpportunity(
  tick: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    opportunityId: `opportunity:${tick}`,
    tick,
    phase: 'YELLOW',
    feasibleStop: true,
    stopTick: tick + 30,
    crossingTick: null,
    crossTrafficGapS: null,
    releaseTick: null,
    launchTick: null,
    launchAccelerationMps2: null,
    ...overrides,
  };
}

function hazard(tick: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    hazardId: `hazard:${tick}`,
    stimulusTick: tick,
    brakeTick: tick + 25,
    minimumClearanceM: 1.5,
    collisionImpulseNs: 0,
    availableDecelMps2: 6,
    appliedDecelMps2: 6,
    requiredStopTick: tick + 200,
    stoppedTick: tick + 180,
    ...overrides,
  };
}

function serviceStop(
  tick: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    stopId: `stop:${tick}`,
    tick,
    kind: 'PICKUP',
    offsetM: 0.5,
    curbDistanceM: 0.3,
    arrivedTick: tick,
    boardedTick: tick + 50,
    departedTick: tick + 180,
    ...overrides,
  };
}

/** Facts that honour the governed fact of each challenge. */
export function passingExtendedFacts(challengeId: string): Facts {
  const plan = extendedPlan(challengeId);
  const first = at(plan, 0.2);
  const second = at(plan, 0.4);
  const third = at(plan, 0.6);
  const fourth = at(plan, 0.8);
  switch (challengeId) {
    case 'v2-challenge-pedestrian-yield':
    case 'v2-challenge-pedestrian-clearance':
    case 'v2-challenge-crosswalk-approach':
      return extendedFacts(plan, {
        pedestrianCrossings: [first, second, third, fourth].map((tick) => crossing(tick)),
      });
    case 'v2-challenge-reroute-patience':
      return extendedFacts(plan, {
        routeDecisions: [
          {
            decisionId: 'decision:1',
            tick: first,
            betterAlternativeSeenTick: 60,
            rerouteCommittedTick: 60 + 1_200,
            uTurnPermission: 'PERMITTED',
            uTurnStartedTick: null,
          },
        ],
      });
    case 'v2-challenge-u-turn-discipline':
      return extendedFacts(plan, {
        routeDecisions: [first, second, third].map((tick, index) => ({
          decisionId: `decision:${index}`,
          tick,
          betterAlternativeSeenTick: tick,
          rerouteCommittedTick: null,
          uTurnPermission: 'PERMITTED',
          uTurnStartedTick: null,
        })),
      });
    case 'v2-challenge-reverse-recovery':
      return extendedFacts(plan, {
        recoveryAttempts: [
          {
            recoveryId: 'recovery:1',
            tick: first,
            reverseClear: true,
            reverseStartedTick: first + 10,
            reverseEndedTick: first + 10 + 150,
          },
        ],
      });
    case 'v2-challenge-red-gap':
      return extendedFacts(plan, {
        signalOpportunities: [
          {
            opportunityId: 'red:1',
            tick: first,
            phase: 'RED',
            feasibleStop: false,
            stopTick: null,
            crossingTick: first + 30,
            crossTrafficGapS: 3,
            releaseTick: null,
            launchTick: null,
            launchAccelerationMps2: null,
          },
          {
            opportunityId: 'red:2',
            tick: second,
            phase: 'RED',
            feasibleStop: true,
            stopTick: second + 20,
            crossingTick: null,
            crossTrafficGapS: null,
            releaseTick: null,
            launchTick: null,
            launchAccelerationMps2: null,
          },
        ],
      });
    case 'v2-challenge-yellow-decision':
      return extendedFacts(plan, {
        signalOpportunities: [stopOpportunity(first), stopOpportunity(second)],
      });
    case 'v2-challenge-green-launch':
      return extendedFacts(plan, {
        signalOpportunities: [
          stopOpportunity(first, {
            phase: 'GREEN',
            stopTick: null,
            releaseTick: first,
            launchTick: first + 42,
            launchAccelerationMps2: 1.2,
          }),
        ],
      });
    case 'v2-challenge-obstacle-clearance':
      return extendedFacts(plan, { hazardPasses: [hazard(first), hazard(second)] });
    case 'v2-challenge-hazard-reaction':
      return extendedFacts(plan, {
        hazardPasses: [hazard(first), hazard(second, { brakeTick: second + 20 })],
      });
    case 'v2-challenge-emergency-brake':
      return extendedFacts(plan, {
        hazardPasses: [hazard(first), hazard(second, { stoppedTick: second + 190 })],
      });
    case 'v2-challenge-pickup-precision':
    case 'v2-challenge-pickup-dwell':
      return extendedFacts(plan, { serviceStops: [serviceStop(first), serviceStop(second)] });
    case 'v2-challenge-dropoff-curb':
      return extendedFacts(plan, {
        serviceStops: [
          serviceStop(first, { kind: 'DROPOFF' }),
          serviceStop(second, { kind: 'DROPOFF' }),
        ],
      });
    default:
      throw new Error(`No passing fixture for ${challengeId}`);
  }
}

export interface FailingExtendedFacts {
  readonly facts: Facts;
  readonly expectedStatus: ExtendedChallengeVerdictStatus;
  readonly expectedReason: ExtendedChallengeVerdictReason;
}

/** One deterministic invalid fixture per challenge, changing only the governed fact. */
export function failingExtendedFacts(challengeId: string): FailingExtendedFacts {
  const plan = extendedPlan(challengeId);
  const first = at(plan, 0.2);
  const second = at(plan, 0.4);
  const third = at(plan, 0.6);
  const fourth = at(plan, 0.8);
  switch (challengeId) {
    case 'v2-challenge-pedestrian-yield':
      return {
        facts: extendedFacts(plan, {
          pedestrianCrossings: [first, second, third, fourth].map((tick, index) =>
            crossing(tick, {
              pedestrianClearedTick: tick + (index === 0 ? 30 : -10),
              egoEnteredTick: tick,
            }),
          ),
        }),
        expectedStatus: 'INCOMPLETE',
        expectedReason: 'PROGRESS',
      };
    case 'v2-challenge-pedestrian-clearance':
      return {
        facts: extendedFacts(plan, {
          pedestrianCrossings: [crossing(first), crossing(second, { minimumClearanceM: 1.2 })],
        }),
        expectedStatus: 'FAILED',
        expectedReason: 'CLEARANCE_SHORTFALL',
      };
    case 'v2-challenge-crosswalk-approach':
      return {
        facts: extendedFacts(plan, {
          pedestrianCrossings: [crossing(first), crossing(second, { approachSpeedMps: 7 })],
        }),
        expectedStatus: 'FAILED',
        expectedReason: 'APPROACH_TOO_FAST',
      };
    case 'v2-challenge-reroute-patience':
      return {
        facts: extendedFacts(plan, {
          routeDecisions: [
            {
              decisionId: 'decision:early',
              tick: first,
              betterAlternativeSeenTick: 60,
              rerouteCommittedTick: 60 + 300,
              uTurnPermission: 'PERMITTED',
              uTurnStartedTick: null,
            },
          ],
        }),
        expectedStatus: 'FAILED',
        expectedReason: 'REROUTE_TOO_EARLY',
      };
    case 'v2-challenge-u-turn-discipline':
      return {
        facts: extendedFacts(plan, {
          routeDecisions: [
            {
              decisionId: 'decision:illegal',
              tick: first,
              betterAlternativeSeenTick: first,
              rerouteCommittedTick: null,
              uTurnPermission: 'FORBIDDEN',
              uTurnStartedTick: first + 10,
            },
            {
              decisionId: 'decision:permitted',
              tick: second,
              betterAlternativeSeenTick: second,
              rerouteCommittedTick: null,
              uTurnPermission: 'PERMITTED',
              uTurnStartedTick: null,
            },
            {
              decisionId: 'decision:permitted-2',
              tick: third,
              betterAlternativeSeenTick: third,
              rerouteCommittedTick: null,
              uTurnPermission: 'PERMITTED',
              uTurnStartedTick: null,
            },
            {
              decisionId: 'decision:permitted-3',
              tick: fourth,
              betterAlternativeSeenTick: fourth,
              rerouteCommittedTick: null,
              uTurnPermission: 'PERMITTED',
              uTurnStartedTick: null,
            },
          ],
        }),
        expectedStatus: 'FAILED',
        expectedReason: 'ILLEGAL_U_TURN',
      };
    case 'v2-challenge-reverse-recovery':
      return {
        facts: extendedFacts(plan, {
          recoveryAttempts: [
            {
              recoveryId: 'recovery:short',
              tick: first,
              reverseClear: true,
              reverseStartedTick: first + 10,
              reverseEndedTick: first + 10 + 60,
            },
          ],
        }),
        expectedStatus: 'FAILED',
        expectedReason: 'RECOVERY_TOO_SHORT',
      };
    case 'v2-challenge-red-gap':
      return {
        facts: extendedFacts(plan, {
          signalOpportunities: [
            {
              opportunityId: 'red:short',
              tick: first,
              phase: 'RED',
              feasibleStop: false,
              stopTick: null,
              crossingTick: first + 30,
              crossTrafficGapS: 1,
              releaseTick: null,
              launchTick: null,
              launchAccelerationMps2: null,
            },
          ],
        }),
        expectedStatus: 'FAILED',
        expectedReason: 'RED_GAP_SHORTFALL',
      };
    case 'v2-challenge-yellow-decision':
      return {
        facts: extendedFacts(plan, {
          signalOpportunities: [
            stopOpportunity(first),
            stopOpportunity(second, { stopTick: null, crossingTick: second + 30 }),
          ],
        }),
        expectedStatus: 'FAILED',
        expectedReason: 'YELLOW_CROSSED',
      };
    case 'v2-challenge-green-launch':
      return {
        facts: extendedFacts(plan, {
          signalOpportunities: [
            stopOpportunity(first, {
              phase: 'GREEN',
              stopTick: null,
              releaseTick: first,
              launchTick: first + 42,
              launchAccelerationMps2: 3.2,
            }),
          ],
        }),
        expectedStatus: 'FAILED',
        expectedReason: 'GREEN_LAUNCH_TOO_HARD',
      };
    case 'v2-challenge-obstacle-clearance':
      return {
        facts: extendedFacts(plan, {
          hazardPasses: [hazard(first), hazard(second, { collisionImpulseNs: 40 })],
        }),
        expectedStatus: 'FAILED',
        expectedReason: 'OBSTACLE_CONTACT',
      };
    case 'v2-challenge-hazard-reaction':
      return {
        facts: extendedFacts(plan, {
          hazardPasses: [hazard(first, { brakeTick: first + 60 })],
        }),
        expectedStatus: 'FAILED',
        expectedReason: 'REACTION_TOO_SLOW',
      };
    case 'v2-challenge-emergency-brake':
      return {
        facts: extendedFacts(plan, {
          hazardPasses: [hazard(first, { appliedDecelMps2: 3 })],
        }),
        expectedStatus: 'FAILED',
        expectedReason: 'BRAKE_TOO_WEAK',
      };
    case 'v2-challenge-pickup-precision':
      return {
        facts: extendedFacts(plan, {
          serviceStops: [serviceStop(first, { offsetM: 2 })],
        }),
        expectedStatus: 'FAILED',
        expectedReason: 'STOP_OUTSIDE_WINDOW',
      };
    case 'v2-challenge-pickup-dwell':
      return {
        facts: extendedFacts(plan, {
          serviceStops: [serviceStop(first, { departedTick: first + 60, boardedTick: first + 50 })],
        }),
        expectedStatus: 'FAILED',
        expectedReason: 'DWELL_TOO_SHORT',
      };
    case 'v2-challenge-dropoff-curb':
      return {
        facts: extendedFacts(plan, {
          serviceStops: [serviceStop(first, { kind: 'DROPOFF', curbDistanceM: 1.4 })],
        }),
        expectedStatus: 'FAILED',
        expectedReason: 'CURB_TOO_FAR',
      };
    default:
      throw new Error(`No failing fixture for ${challengeId}`);
  }
}

/* ---------------------------------------------------------------------------------------------
 * V1 preservation: a snapshot of the delivered progress and vehicle access
 * ------------------------------------------------------------------------------------------- */

export interface V1PreservationSnapshot {
  readonly progress: CampaignProgress;
  readonly unlocks: MissionUnlockSnapshot;
  readonly progressJson: string;
  readonly unlocksJson: string;
  readonly accessJson: string;
  readonly progressDigest: string;
  readonly unlocksDigest: string;
  readonly access: Readonly<{
    vehicles: number;
    taxis: number;
    civilians: number;
    vehiclesDriveable: number;
    taxisSelectable: number;
    revoked: number;
    blockedTaxis: number;
    baseCapabilitiesPresent: boolean;
  }>;
  readonly playerProgressJson: string;
  readonly playerProgressCheckpointJson: string;
}

function stableDigest(parts: readonly string[]): string {
  const canonical = parts.map((part) => `s${part.length}:${part}`).join('|');
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Completes the whole delivered campaign through the real 116 tracker, settles it through the real
 * 125 ledger, credits one real settlement into the real 213 player progress and proves vehicle
 * access on the real 057 fleet. Nothing is authored: every completion comes from its real events.
 */
export function v1PreservationSnapshot(): V1PreservationSnapshot {
  const tracker = createRewardsTracker();
  const run = completeCampaign(tracker);
  const ledger: MissionRewardsLedger = createMissionRewardsLedger({ catalog: tracker.catalog() });
  let firstSettlement = null as ReturnType<MissionRewardsLedger['settle']> | null;
  for (const completion of run.completions) {
    const settlement = ledger.settle({ instance: completion.instance });
    firstSettlement ??= settlement;
  }
  if (firstSettlement === null) throw new Error('The V1 campaign did not settle any mission');
  const progress = ledger.progress();
  const unlocks = ledger.unlocks();
  const fleet = createFleetRegistry({
    schemaVersion: 1,
    units: 'SI',
    sessionId: 'session-188-v1',
    worldEpoch: 1,
    scenarioId: 'scenario:188-v1',
    seed: 188,
    namespace: 'fleet:188-v1',
    taxiCount: DEFAULT_FLEET_COUNTS.taxis,
    civilianCount: DEFAULT_FLEET_COUNTS.civilians,
    profile: { profileId: 'city:common', versionId: 'profile-version:188' },
  });
  const access = missionVehicleAccess(unlocks, fleet.list());
  const player: PlayerProgress = createPlayerProgress({ playerId: EXTENDED_FIXTURE_PLAYER });
  player.creditMission({ settlement: firstSettlement, observedAtMs: 1_000 });
  const checkpoint = player.checkpoint();
  const restored = parsePlayerProgress(JSON.parse(JSON.stringify(checkpoint)) as unknown);
  return Object.freeze({
    progress,
    unlocks,
    progressJson: JSON.stringify(progress),
    unlocksJson: JSON.stringify(unlocks),
    accessJson: JSON.stringify(access),
    progressDigest: stableDigest([
      progress.namespace,
      progress.version,
      ...progress.completedMissionIds,
      '|',
      ...progress.availableMissionIds,
      '|',
      ...progress.missions.map(
        (mission) => `${mission.missionId}@${mission.definitionVersion}:${mission.state}`,
      ),
    ]),
    unlocksDigest: stableDigest([
      unlocks.namespace,
      unlocks.version,
      ...unlocks.base.map((entry) => entry.capabilityId),
      '|',
      ...unlocks.capabilities.map((entry) => entry.capabilityId),
    ]),
    access: Object.freeze({
      vehicles: access.vehicles,
      taxis: access.taxis,
      civilians: access.civilians,
      vehiclesDriveable: access.vehiclesDriveable,
      taxisSelectable: access.taxisSelectable,
      revoked: access.revoked.length,
      blockedTaxis: access.blockedTaxis.length,
      baseCapabilitiesPresent: access.baseCapabilitiesPresent,
    }),
    playerProgressJson: JSON.stringify(player.read()),
    playerProgressCheckpointJson: JSON.stringify(restored.checkpoint()),
  });
}

/** The exact ids of the delivered 231 templates; PBI 188 must never re-author them. */
export const V1_CHALLENGE_TEMPLATE_IDS = Object.freeze([
  'challenge-cake-delivery',
  'challenge-city-copies-me',
  'challenge-city-tour-backwards',
  'challenge-forgot-something',
  'challenge-influencer-demolition',
  'challenge-influencer-no-spill',
  'challenge-influencer-parking-drift',
  'challenge-influencer-single-frame',
  'challenge-last-minute-airport',
  'challenge-maternity-run',
  'challenge-toilet-sos',
  'challenge-valet-with-style',
] as const);

/** The real 125 vehicle access after the whole campaign: every vehicle stays driveable. */
export const V1_ACCESS_EXPECTATION = Object.freeze({
  vehicles: 64,
  taxis: 24,
  civilians: 40,
  vehiclesDriveable: 64,
  taxisSelectable: 24,
  revoked: 0,
  blockedTaxis: 0,
  baseCapabilitiesPresent: true,
});

/**
 * Digests captured from the delivered V1 code before PBI 188 added its module. The test recomputes
 * them and asserts equality, so a silent change to the 231 catalog, the 125 progress, the 125
 * unlocks, the 125 vehicle access or the 213 player progress cannot hide behind a green suite.
 */
export const V1_CATALOG_DIGEST = 'fnv1a32:9714302b' as const;
export const V1_PROGRESS_DIGEST = 'fnv1a32:7f45fc70' as const;
export const V1_UNLOCKS_DIGEST = 'fnv1a32:0da1f677' as const;
export const V1_ACCESS_DIGEST = 'fnv1a32:bdd636b4' as const;
export const V1_PLAYER_DIGEST = 'fnv1a32:8646bf48' as const;
export const V1_CHECKPOINT_DIGEST = 'fnv1a32:92f67b0f' as const;

/** Status vocabulary re-exported so the fixture pins the closed set the tests expect. */
export const EXTENDED_FIXTURE_STATUSES = extendedChallengeVerdictStatuses;

/** The real fleet helper kept next to the snapshot so a test can reuse the same 057 registry. */
export { createRewardsFleet };
