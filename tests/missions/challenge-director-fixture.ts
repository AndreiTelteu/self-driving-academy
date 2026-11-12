import { CHALLENGE_TICK_HZ, createChallengeDirector } from '../../src/missions';
import type {
  ChallengeDirector,
  ChallengeDirectorInstance,
  ChallengeObjectiveSnapshot,
  ChallengeRoutePort,
  ChallengeWorldSnapshot,
} from '../../src/missions';
import {
  CHALLENGE_FIXTURE_ZONES,
  fullChallengeCapabilities,
  leanChallengeCapabilities,
} from './challenge-catalog-fixture';

/**
 * Deterministic fixtures for PBI 232.
 *
 * Nothing here reads a clock, a browser, a renderer or a random source. The director seed, the
 * simulated tick and every route estimate are explicit, so the transcript is byte-stable.
 */

export const DIRECTOR_FIXTURE_SEED = 4_242 as const;
export const DIRECTOR_SESSION_ID = 'session:fixture' as const;
export const DIRECTOR_WORLD_EPOCH = 1 as const;
export const DIRECTOR_TAXI_ID = 'taxi:player' as const;
export const DIRECTOR_PICKUP_ZONE = 'zone:pickup:central' as const;
export const DIRECTOR_FALLBACK_DROPOFF = 'zone:dropoff:central' as const;
export const DIRECTOR_GRAPH_VERSION = 'fixture-graph-v1' as const;

export const DIRECTOR_REACHABLE_ZONES: readonly string[] = Object.freeze([
  ...CHALLENGE_FIXTURE_ZONES.map((entry) => entry.zoneId),
  DIRECTOR_PICKUP_ZONE,
  DIRECTOR_FALLBACK_DROPOFF,
]);

export interface DirectorRouteFixtureOptions {
  readonly reachable?: boolean;
  readonly seconds?: number;
  readonly unreachableTemplateIds?: readonly string[];
  readonly calls?: { count: number };
}

/** A deterministic route double: the same input always answers the same seconds. */
export function directorRoutes(options: DirectorRouteFixtureOptions = {}): ChallengeRoutePort {
  return Object.freeze({
    estimate(input: {
      taxiId: string;
      templateId: string;
      pickupZoneId: string;
      dropoffZoneId: string;
    }) {
      if (options.calls !== undefined) options.calls.count += 1;
      const blocked = options.unreachableTemplateIds?.includes(input.templateId) ?? false;
      return {
        reachable: (options.reachable ?? true) && !blocked,
        seconds: options.seconds ?? 40,
        graphVersion: DIRECTOR_GRAPH_VERSION,
      };
    },
  });
}

export interface DirectorWorldOptions {
  readonly simulatedTick?: number;
  readonly sessionKind?: 'ACADEMY' | 'CHAOS';
  readonly sessionId?: string;
  readonly worldEpoch?: number;
  readonly transferInProgress?: boolean;
  readonly taxiStatus?: 'AVAILABLE' | 'ASSIGNED' | 'BLOCKED' | 'DAMAGED' | 'OFFLINE';
  readonly freeTaxis?: number;
  readonly passengerAboard?: boolean;
  readonly assignment?: ChallengeWorldSnapshot['assignment'];
  readonly lean?: boolean;
  readonly reachableZoneIds?: readonly string[];
}

export function directorWorld(options: DirectorWorldOptions = {}): ChallengeWorldSnapshot {
  const sessionKind = options.sessionKind ?? 'ACADEMY';
  return {
    sessionKind,
    sessionId: options.sessionId ?? DIRECTOR_SESSION_ID,
    worldEpoch: options.worldEpoch ?? DIRECTOR_WORLD_EPOCH,
    simulatedTick: options.simulatedTick ?? 0,
    transferInProgress: options.transferInProgress ?? false,
    taxi: {
      taxiId: DIRECTOR_TAXI_ID,
      status: options.taxiStatus ?? 'AVAILABLE',
      freeTaxis: options.freeTaxis ?? 3,
    },
    assignment: options.assignment ?? null,
    passengerAboard: options.passengerAboard ?? false,
    pickupZoneId: DIRECTOR_PICKUP_ZONE,
    fallbackDropoffZoneId: DIRECTOR_FALLBACK_DROPOFF,
    reachableZoneIds: options.reachableZoneIds ?? DIRECTOR_REACHABLE_ZONES,
    capabilities: options.lean
      ? leanChallengeCapabilities(sessionKind)
      : fullChallengeCapabilities(sessionKind),
  };
}

export interface DirectorFixtureOptions extends DirectorWorldOptions {
  readonly seed?: number;
  readonly enabled?: boolean;
  readonly routes?: ChallengeRoutePort;
}

export function createDirectorFixture(options: DirectorFixtureOptions = {}): ChallengeDirector {
  return createChallengeDirector({
    seed: options.seed ?? DIRECTOR_FIXTURE_SEED,
    enabled: options.enabled,
    routes: options.routes ?? directorRoutes(),
  });
}

/** The world at the director's current simulated tick. */
export function directorWorldAt(
  director: ChallengeDirector,
  options: DirectorWorldOptions = {},
): ChallengeWorldSnapshot {
  return directorWorld({ ...options, simulatedTick: director.stats().simulatedTick });
}

type FactList = readonly Record<string, unknown>[];

export interface DirectorFactOverrides {
  readonly endedTick?: number;
  readonly sessionKind?: 'ACADEMY' | 'CHAOS';
  readonly controlSource?: 'MANUAL' | 'LEARNING' | 'AUTO';
  readonly passengerAboard?: boolean;
  readonly incidents?: number;
  readonly zoneVisits?: FactList;
  readonly checkpoints?: FactList;
  readonly dropoffs?: FactList;
  readonly parked?: FactList;
  readonly driftSamples?: FactList;
  readonly destruction?: FactList;
  readonly comfortSamples?: FactList;
  readonly learning?: Record<string, unknown> | null;
}

export interface DirectorFacts {
  tickHz: number;
  startedTick: number;
  endedTick: number;
  sessionKind: 'ACADEMY' | 'CHAOS';
  controlSource: 'MANUAL' | 'LEARNING' | 'AUTO';
  passengerAboard: boolean;
  incidents: number;
  zoneVisits: FactList;
  checkpoints: FactList;
  dropoffs: FactList;
  parked: FactList;
  driftSamples: FactList;
  destruction: FactList;
  comfortSamples: FactList;
  learning: Record<string, unknown> | null;
}

/**
 * Facts that satisfy the instance's own objective. Every tick is inside the authored window, so the
 * same generator proves the objective and the deadline.
 */
export function directorFacts(
  instance: ChallengeDirectorInstance,
  overrides: DirectorFactOverrides = {},
): DirectorFacts {
  const objective: ChallengeObjectiveSnapshot = instance.objective;
  const startedTick = instance.activatedAtTick ?? 0;
  const base: DirectorFacts = {
    tickHz: CHALLENGE_TICK_HZ,
    startedTick,
    endedTick: Math.max(startedTick, objective.deadlineTick - 1),
    sessionKind: instance.sessionKind,
    controlSource: objective.learningKey === null ? 'MANUAL' : 'LEARNING',
    passengerAboard: true,
    incidents: 0,
    zoneVisits: [],
    checkpoints: [],
    dropoffs: [],
    parked: [],
    driftSamples: [],
    destruction: [],
    comfortSamples: [],
    learning: null,
  };
  const zone = objective.zoneIds[0] ?? DIRECTOR_FALLBACK_DROPOFF;
  const at = (offset: number): number =>
    Math.min(startedTick + offset, Math.max(startedTick, objective.deadlineTick - 1));
  switch (objective.objectiveKind) {
    case 'TIMED_DROPOFF':
      return { ...base, dropoffs: [{ zoneId: zone, tick: at(600) }], ...overrides };
    case 'CHECKPOINTS':
      return {
        ...base,
        checkpoints: objective.zoneIds
          .slice(0, objective.target)
          .map((checkpointId, index) => ({ checkpointId, tick: at(600 * (index + 1)) })),
        ...overrides,
      };
    case 'ZONE_ORDER':
      return {
        ...base,
        zoneVisits: objective.zoneIds.slice(0, objective.target).map((zoneId, index) => ({
          zoneId,
          enteredTick: at(600 * (index + 1)),
          exitedTick: at(600 * (index + 1) + 120),
        })),
        ...overrides,
      };
    case 'COMFORT':
      return {
        ...base,
        comfortSamples: [
          { tick: at(600), accelerationMps2: 0.8, jerkMps3: 0.8 },
          { tick: at(601), accelerationMps2: -0.9, jerkMps3: 0.6 },
        ],
        dropoffs: [{ zoneId: DIRECTOR_FALLBACK_DROPOFF, tick: at(1_200) }],
        ...overrides,
      };
    case 'PARKING':
      return {
        ...base,
        parked: [
          { zoneId: zone, tick: at(1_200), speedMps: 0.1, headingErrorRad: 0.05, dwellTicks: 120 },
        ],
        ...overrides,
      };
    case 'DRIFT':
      return {
        ...base,
        driftSamples: Array.from({ length: 200 }, (_, index) => ({
          zoneId: zone,
          tick: at(600 + index),
          speedMps: 8,
          slipAngleRad: 0.4,
          collisionImpulseNs: 0,
        })),
        ...overrides,
      };
    case 'DISTRUCTION':
      return {
        ...base,
        destruction: Array.from({ length: objective.target }, (_, index) => ({
          objectId: `object:${String(index)}`,
          zoneId: zone,
          tick: at(600 + index * 60),
        })),
        ...overrides,
      };
    case 'LEARNING':
      return {
        ...base,
        learning: {
          key: objective.learningKey,
          activatedTick: at(600),
          observedTick: at(1_200),
          observedProfileId: 'profile:fixture-head',
        },
        ...overrides,
      };
  }
}
