import {
  CHALLENGE_DIRECTOR_LIMITS,
  CHALLENGE_TICK_HZ,
  createChallengeDirector,
  createChallengeExperience,
  createPlayerProgress,
  parseDailyDate,
} from '../../src/missions';
import type {
  ChallengeCreditResult,
  ChallengeDirector,
  ChallengeDirectorInstance,
  ChallengeExperience,
  ChallengeRecordOutcome,
  ChallengeSessionKind,
  ChallengeWorldSnapshot,
  DailyCalendarInput,
  PlayerProgress,
} from '../../src/missions';
import {
  DIRECTOR_FALLBACK_DROPOFF,
  DIRECTOR_FIXTURE_SEED,
  DIRECTOR_TAXI_ID,
  directorRoutes,
  directorWorld,
} from './challenge-director-fixture';

/**
 * Deterministic fixtures for PBI 233.
 *
 * Nothing here reads a clock, a browser, a renderer or a random source: the director seed, the
 * explicit calendar instant and every fact list are plain documents the delivered contracts
 * validate. The XP ledger is the real 213 `createPlayerProgress` one, not a test double.
 */

export const EXPERIENCE_PLAYER_ID = 'player:233' as const;
export const EXPERIENCE_TIME_ZONE = 'Europe/Bucharest' as const;
export const EXPERIENCE_UTC_OFFSET_SECONDS = 7_200 as const;
export const EXPERIENCE_DAY_LENGTH_SECONDS = 86_400 as const;
export const EXPERIENCE_FIRST_DAY = '2026-11-12' as const;
export const EXPERIENCE_SECOND_DAY = '2026-11-13' as const;
export const EXPERIENCE_PREVIOUS_DAY = '2026-11-11' as const;

/** Local noon of a strict `YYYY-MM-DD` date under a fixed +02:00 offset; no wall clock. */
export function experienceCalendar(dailyDate: string): DailyCalendarInput {
  const dayIndex = parseDailyDate(dailyDate);
  return {
    timeZone: EXPERIENCE_TIME_ZONE,
    observedAtMs:
      dayIndex * EXPERIENCE_DAY_LENGTH_SECONDS * 1_000 +
      12 * 3_600 * 1_000 -
      EXPERIENCE_UTC_OFFSET_SECONDS * 1_000,
    utcOffsetSeconds: EXPERIENCE_UTC_OFFSET_SECONDS,
    dayLengthSeconds: EXPERIENCE_DAY_LENGTH_SECONDS,
  };
}

type FactList = readonly Record<string, unknown>[];

export interface ExperienceFactOverrides {
  readonly incidents?: number;
  readonly passengerAboard?: boolean;
  readonly zoneVisits?: FactList;
  readonly checkpoints?: FactList;
  readonly dropoffs?: FactList;
  readonly parked?: FactList;
  readonly driftSamples?: FactList;
  readonly destruction?: FactList;
  readonly comfortSamples?: FactList;
  readonly learning?: Record<string, unknown> | null;
}

/**
 * Facts that satisfy the instance's objective after `offsetTicks` of its own simulated window. The
 * offset is relative to the activation, so the same offset on two sessions is the same real result.
 */
export function experienceFacts(
  instance: ChallengeDirectorInstance,
  offsetTicks = 600,
  overrides: ExperienceFactOverrides = {},
) {
  const started = instance.activatedAtTick ?? 0;
  const at = (offset: number): number =>
    Math.min(started + offset, Math.max(started, instance.objective.deadlineTick - 1));
  const zone = instance.objective.zoneIds[0] ?? DIRECTOR_FALLBACK_DROPOFF;
  const base = {
    tickHz: CHALLENGE_TICK_HZ,
    startedTick: started,
    endedTick: at(offsetTicks + 600),
    sessionKind: instance.sessionKind,
    controlSource: instance.objective.learningKey === null ? 'MANUAL' : 'LEARNING',
    passengerAboard: true,
    incidents: 0,
    zoneVisits: [] as FactList,
    checkpoints: [] as FactList,
    dropoffs: [] as FactList,
    parked: [] as FactList,
    driftSamples: [] as FactList,
    destruction: [] as FactList,
    comfortSamples: [] as FactList,
    learning: null as Record<string, unknown> | null,
    ...overrides,
  };
  switch (instance.objective.objectiveKind) {
    case 'TIMED_DROPOFF':
      return { ...base, dropoffs: [{ zoneId: zone, tick: at(offsetTicks) }] };
    case 'CHECKPOINTS':
      return {
        ...base,
        checkpoints: instance.objective.zoneIds
          .slice(0, instance.objective.target)
          .map((checkpointId, index) => ({
            checkpointId,
            tick: at(offsetTicks + index * 60),
          })),
      };
    case 'ZONE_ORDER':
      return {
        ...base,
        zoneVisits: instance.objective.zoneIds
          .slice(0, instance.objective.target)
          .map((zoneId, index) => ({
            zoneId,
            enteredTick: at(offsetTicks + index * 60),
            exitedTick: at(offsetTicks + index * 60 + 120),
          })),
      };
    case 'COMFORT':
      return {
        ...base,
        comfortSamples: [
          { tick: at(offsetTicks), accelerationMps2: 0.8, jerkMps3: 0.8 },
          { tick: at(offsetTicks + 1), accelerationMps2: -0.9, jerkMps3: 0.6 },
        ],
        dropoffs: [{ zoneId: DIRECTOR_FALLBACK_DROPOFF, tick: at(offsetTicks + 300) }],
      };
    case 'PARKING':
      return {
        ...base,
        parked: [
          {
            zoneId: zone,
            tick: at(offsetTicks),
            speedMps: 0.1,
            headingErrorRad: 0.05,
            dwellTicks: 120,
          },
        ],
      };
    case 'DRIFT':
      return {
        ...base,
        driftSamples: Array.from({ length: 200 }, (_, index) => ({
          zoneId: zone,
          tick: at(offsetTicks + index),
          speedMps: 8,
          slipAngleRad: 0.4,
          collisionImpulseNs: 0,
        })),
      };
    case 'DISTRUCTION':
      return {
        ...base,
        destruction: Array.from({ length: instance.objective.target }, (_, index) => ({
          objectId: `object:${String(index)}`,
          zoneId: zone,
          tick: at(offsetTicks + index * 60),
        })),
      };
    case 'LEARNING':
      return {
        ...base,
        learning: {
          key: instance.objective.learningKey,
          activatedTick: at(offsetTicks),
          observedTick: at(offsetTicks + 120),
          observedProfileId: 'profile:233-head',
        },
      };
  }
}

export interface ExperienceHarnessOptions {
  readonly seed?: number;
  readonly sessionKind?: ChallengeSessionKind;
  readonly playerId?: string;
  /** Share one experience (records + reward calendar) across several director sessions. */
  readonly experience?: ChallengeExperience;
  /** Share the real 213 ledger with another harness. */
  readonly ledger?: PlayerProgress;
}

export interface ExperienceHarness {
  readonly director: ChallengeDirector;
  readonly ledger: PlayerProgress;
  readonly experience: ChallengeExperience;
  readonly sessionKind: ChallengeSessionKind;
  tick(): number;
  offer(seed?: number): ChallengeDirectorInstance;
  /** Move the simulated clock past the real 232 cooldown so a new independent offer can appear. */
  skipCooldown(): void;
  accept(instanceId: string): ChallengeDirectorInstance;
  activate(instanceId: string): ChallengeDirectorInstance;
  complete(instanceId: string, offsetTicks?: number): ChallengeDirectorInstance;
  fail(instanceId: string): ChallengeDirectorInstance;
  decline(instanceId: string): ChallengeDirectorInstance;
  credit(instance: ChallengeDirectorInstance, dailyDate?: string): ChallengeCreditResult;
  record(instance: ChallengeDirectorInstance, dailyDate?: string): ChallengeRecordOutcome;
  world(): ChallengeWorldSnapshot;
}

function fail(message: string): never {
  throw new Error(message);
}

export function createExperienceHarness(options: ExperienceHarnessOptions = {}): ExperienceHarness {
  const sessionKind = options.sessionKind ?? 'ACADEMY';
  const ledger =
    options.ledger ?? createPlayerProgress({ playerId: options.playerId ?? EXPERIENCE_PLAYER_ID });
  const experience = options.experience ?? createChallengeExperience({ ledger });
  const director = createChallengeDirector({
    seed: options.seed ?? DIRECTOR_FIXTURE_SEED,
    routes: directorRoutes(),
  });
  const world = (): ChallengeWorldSnapshot =>
    directorWorld({ sessionKind, simulatedTick: director.stats().simulatedTick });
  return Object.freeze({
    director,
    ledger,
    experience,
    sessionKind,
    tick: () => director.stats().simulatedTick,
    world,
    offer(seed?: number): ChallengeDirectorInstance {
      const result = director.offer({
        world: world(),
        ...(seed === undefined ? {} : { seed }),
      });
      if (result.status !== 'OFFERED') fail(`Expected an offer, got ${result.code}`);
      return result.instance;
    },
    skipCooldown(): void {
      director.advance({ ticks: CHALLENGE_DIRECTOR_LIMITS.cooldownTicks, paused: false });
    },
    accept(instanceId: string): ChallengeDirectorInstance {
      const result = director.accept({
        instanceId,
        taxi: { taxiId: DIRECTOR_TAXI_ID, status: 'AVAILABLE', freeTaxis: 3 },
        assignment: null,
        passengerAboard: false,
      });
      if (result.status !== 'ACCEPTED') fail(`Expected an acceptance, got ${result.code}`);
      return result.instance;
    },
    activate(instanceId: string): ChallengeDirectorInstance {
      const result = director.activate({ instanceId });
      if (result.status !== 'ACTIVE') fail(`Expected activation, got ${result.code}`);
      return result.instance;
    },
    complete(instanceId: string, offsetTicks = 600): ChallengeDirectorInstance {
      const instance = director.instance(instanceId);
      if (instance === undefined) fail(`Unknown instance ${instanceId}`);
      const result = director.evaluate({
        instanceId,
        facts: experienceFacts(instance, offsetTicks),
      });
      if (result.status !== 'COMPLETED')
        fail(
          `Expected a completion, got ${result.status} (${
            'verdict' in result && result.verdict !== null ? result.verdict.reason : '—'
          })`,
        );
      return result.instance;
    },
    fail(instanceId: string): ChallengeDirectorInstance {
      const instance = director.instance(instanceId);
      if (instance === undefined) fail(`Unknown instance ${instanceId}`);
      director.advance({ ticks: instance.objective.deadlineTick, paused: false });
      const failed = director.instance(instanceId);
      if (failed === undefined || failed.state !== 'FAILED')
        fail(`Expected a deadline failure for ${instanceId}`);
      return failed;
    },
    decline(instanceId: string): ChallengeDirectorInstance {
      const result = director.decline({ instanceId });
      if (result.status !== 'DECLINED') fail(`Expected a decline, got ${result.code}`);
      return result.instance;
    },
    credit(instance: ChallengeDirectorInstance, dailyDate = EXPERIENCE_FIRST_DAY) {
      return experience.credit({ instance, calendar: experienceCalendar(dailyDate) });
    },
    record(instance: ChallengeDirectorInstance, dailyDate = EXPERIENCE_FIRST_DAY) {
      return experience.record({ instance, calendar: experienceCalendar(dailyDate) });
    },
  });
}

/** Offer → accept → activate → complete one challenge end to end. */
export function completedChallenge(
  harness: ExperienceHarness,
  offsetTicks = 600,
): ChallengeDirectorInstance {
  const offer = harness.offer();
  harness.accept(offer.instanceId);
  harness.activate(offer.instanceId);
  return harness.complete(offer.instanceId, offsetTicks);
}

/** Offer → accept → activate → deadline failure. */
export function failedChallenge(harness: ExperienceHarness): ChallengeDirectorInstance {
  const offer = harness.offer();
  harness.accept(offer.instanceId);
  harness.activate(offer.instanceId);
  return harness.fail(offer.instanceId);
}

/** Offer → decline one visible offer, separated by the real cooldown from any earlier result. */
export function declinedChallenge(
  harness: ExperienceHarness,
  seed = 987,
): ChallengeDirectorInstance {
  const offer = harness.offer(seed);
  harness.decline(offer.instanceId);
  return harness.director.instance(offer.instanceId)!;
}
