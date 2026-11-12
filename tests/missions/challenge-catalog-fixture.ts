import {
  CHALLENGE_TICK_HZ,
  createChallengeCapabilities,
  createChallengeTemplateCatalog,
  planChallengeAttempt,
} from '../../src/missions';
import type {
  ChallengeAttemptPlan,
  ChallengeCapabilities,
  ChallengeSessionKind,
  ChallengeTemplate,
  ChallengeTemplateCatalog,
  ChallengeZoneCapability,
} from '../../src/missions';

/**
 * Deterministic fixtures for PBI 231.
 *
 * Nothing here reads a clock, a browser, a renderer or a random source. The seed and the start tick
 * are explicit; every fact list is a plain document the evaluator validates with the real contract.
 */

export const CHALLENGE_FIXTURE_SEED = 12_345 as const;
export const CHALLENGE_FIXTURE_START_TICK = 0 as const;
export const CHALLENGE_FIXTURE_LEARNING_KEY = 'speed_delta_urban' as const;

export const CHALLENGE_FIXTURE_ZONES: readonly ChallengeZoneCapability[] = Object.freeze([
  Object.freeze({ zoneId: 'zone:hospital:central', kind: 'HOSPITAL' as const }),
  Object.freeze({ zoneId: 'zone:airport', kind: 'TERMINAL' as const }),
  Object.freeze({ zoneId: 'zone:toilet:market', kind: 'TOILET' as const }),
  Object.freeze({ zoneId: 'zone:toilet:park', kind: 'TOILET' as const }),
  Object.freeze({ zoneId: 'zone:toilet:garage', kind: 'TOILET' as const }),
  Object.freeze({ zoneId: 'zone:checkpoint:museum', kind: 'CHECKPOINT' as const }),
  Object.freeze({ zoneId: 'zone:checkpoint:tower', kind: 'CHECKPOINT' as const }),
  Object.freeze({ zoneId: 'zone:checkpoint:river', kind: 'CHECKPOINT' as const }),
  Object.freeze({ zoneId: 'zone:parking:opera', kind: 'PARKING' as const }),
  Object.freeze({ zoneId: 'zone:drift:playground', kind: 'DRIFT_PAD' as const }),
  Object.freeze({ zoneId: 'zone:alley:playground', kind: 'DEMOLITION_ALLEY' as const }),
  Object.freeze({ zoneId: 'zone:landmark:home', kind: 'LANDMARK' as const }),
  Object.freeze({ zoneId: 'zone:landmark:party', kind: 'LANDMARK' as const }),
]);

/** Every capability the delivered V1 systems offer. */
export function fullChallengeCapabilities(
  sessionKind: ChallengeSessionKind = 'ACADEMY',
): ChallengeCapabilities {
  return createChallengeCapabilities({
    sessionKind,
    controlModes: ['MANUAL', 'AUTO', 'LEARNING'],
    vehicleClasses: ['compact', 'sedan'],
    zones: [...CHALLENGE_FIXTURE_ZONES],
    capabilities: [
      'FREE_DRIVE',
      'MANUAL_CONTROL',
      'AUTO_CONTROL',
      'LEARNING',
      'DESTRUCTIBLE_DECOR',
      'WORLD_RESET',
      'SESSION_RECORDS',
    ],
    learningKeys: [CHALLENGE_FIXTURE_LEARNING_KEY],
    campaignCompleted: 2,
  });
}

/**
 * A lean but real snapshot: a compact car, no map zones, no learning key, no campaign progress and
 * no destructible decor. Every template that needs one of those is excluded by name.
 */
export function leanChallengeCapabilities(
  sessionKind: ChallengeSessionKind = 'ACADEMY',
): ChallengeCapabilities {
  return createChallengeCapabilities({
    sessionKind,
    controlModes: ['MANUAL', 'AUTO'],
    vehicleClasses: ['compact'],
    zones: [],
    capabilities: ['FREE_DRIVE', 'MANUAL_CONTROL', 'AUTO_CONTROL'],
    learningKeys: [],
    campaignCompleted: 0,
  });
}

export function challengeCatalog(): ChallengeTemplateCatalog {
  return createChallengeTemplateCatalog();
}

export function challengeTemplate(templateId: string): ChallengeTemplate {
  const template = createChallengeTemplateCatalog().templates.find(
    (entry) => entry.templateId === templateId,
  );
  if (template === undefined) throw new Error(`Unknown challenge fixture template: ${templateId}`);
  return template;
}

export interface ChallengePlanOptions {
  readonly seed?: number;
  readonly sessionKind?: ChallengeSessionKind;
  readonly capabilities?: ChallengeCapabilities;
}

export function challengePlan(
  templateId: string,
  options: ChallengePlanOptions = {},
): ChallengeAttemptPlan {
  const template = challengeTemplate(templateId);
  const sessionKind =
    options.sessionKind ?? (template.sessions[0] === 'CHAOS' ? 'CHAOS' : 'ACADEMY');
  return planChallengeAttempt({
    template,
    catalogVersion: challengeCatalog().version,
    capabilities: options.capabilities ?? fullChallengeCapabilities(sessionKind),
    sessionKind,
    seed: options.seed ?? CHALLENGE_FIXTURE_SEED,
    attempt: 1,
    startedTick: CHALLENGE_FIXTURE_START_TICK,
  });
}

type Facts = {
  tickHz: number;
  startedTick: number;
  endedTick: number;
  sessionKind: ChallengeSessionKind;
  controlSource: 'MANUAL' | 'LEARNING' | 'AUTO';
  passengerAboard: boolean;
  incidents: number;
  zoneVisits: readonly Record<string, unknown>[];
  checkpoints: readonly Record<string, unknown>[];
  dropoffs: readonly Record<string, unknown>[];
  parked: readonly Record<string, unknown>[];
  driftSamples: readonly Record<string, unknown>[];
  destruction: readonly Record<string, unknown>[];
  comfortSamples: readonly Record<string, unknown>[];
  learning: Record<string, unknown> | null;
};

export function challengeFacts(plan: ChallengeAttemptPlan, overrides: Partial<Facts> = {}): Facts {
  return {
    tickHz: CHALLENGE_TICK_HZ,
    startedTick: CHALLENGE_FIXTURE_START_TICK,
    endedTick: plan.objective.deadlineTick + 120,
    sessionKind: plan.sessionKind,
    controlSource: plan.objective.learningKey === null ? 'MANUAL' : 'LEARNING',
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
    ...overrides,
  };
}

/** Facts that satisfy each template's objective with the fixture seed. */
export function passingFacts(templateId: string): Facts {
  const plan = challengePlan(templateId);
  const zone = plan.objective.zoneIds[0] ?? null;
  const orderedZones = [...plan.objective.zoneIds];
  switch (plan.objective.objectiveKind) {
    case 'TIMED_DROPOFF':
      return challengeFacts(plan, { dropoffs: [{ zoneId: zone!, tick: 3_000 }] });
    case 'CHECKPOINTS':
      return challengeFacts(plan, {
        checkpoints: orderedZones
          .slice(0, plan.objective.target)
          .map((checkpointId, index) => ({ checkpointId, tick: 1_000 * (index + 1) })),
      });
    case 'ZONE_ORDER':
      return challengeFacts(plan, {
        zoneVisits: orderedZones.slice(0, plan.objective.target).map((zoneId, index) => ({
          zoneId,
          enteredTick: 1_000 * (index + 1),
          exitedTick: 1_000 * (index + 1) + 600,
        })),
      });
    case 'COMFORT':
      return challengeFacts(plan, {
        comfortSamples: [
          { tick: 1_000, accelerationMps2: 0.8, jerkMps3: 0.8 },
          { tick: 1_001, accelerationMps2: -0.9, jerkMps3: 0.6 },
        ],
        dropoffs: [{ zoneId: 'zone:destination', tick: 2_000 }],
      });
    case 'PARKING':
      return challengeFacts(plan, {
        parked: [
          { zoneId: zone!, tick: 2_000, speedMps: 0.1, headingErrorRad: 0.05, dwellTicks: 120 },
        ],
      });
    case 'DRIFT':
      return challengeFacts(plan, {
        driftSamples: Array.from({ length: 200 }, (_, index) => ({
          zoneId: zone!,
          tick: 1_000 + index,
          speedMps: 8,
          slipAngleRad: 0.4,
          collisionImpulseNs: 0,
        })),
      });
    case 'DISTRUCTION':
      return challengeFacts(plan, {
        destruction: Array.from({ length: 6 }, (_, index) => ({
          objectId: `object:${index < 5 ? index : 4}`,
          zoneId: zone!,
          tick: 1_000 + index * 100,
        })),
      });
    case 'LEARNING':
      return challengeFacts(plan, {
        learning: {
          key: plan.objective.learningKey,
          activatedTick: 1_000,
          observedTick: 2_000,
          observedProfileId: 'profile:fixture-head',
        },
      });
  }
}

export interface FailingFacts {
  readonly facts: Facts;
  readonly expectedStatus: 'FAILED' | 'EXCLUDED';
  readonly expectedReason: string;
}

/** One deterministic invalid fixture per template, each with the verdict it must produce. */
export function failingFacts(templateId: string): FailingFacts {
  const plan = challengePlan(templateId);
  const zone = plan.objective.zoneIds[0] ?? null;
  const expired = plan.objective.deadlineTick + 120;
  switch (templateId) {
    case 'challenge-maternity-run':
      return {
        facts: challengeFacts(plan, { incidents: plan.objective.incidentBudget + 1 }),
        expectedStatus: 'FAILED',
        expectedReason: 'INCIDENT_BUDGET_EXCEEDED',
      };
    case 'challenge-last-minute-airport':
      return {
        facts: challengeFacts(plan, { endedTick: expired }),
        expectedStatus: 'FAILED',
        expectedReason: 'DEADLINE_EXPIRED',
      };
    case 'challenge-influencer-no-spill':
      return {
        facts: challengeFacts(plan, {
          comfortSamples: [
            { tick: 1_000, accelerationMps2: 0.8, jerkMps3: 0.8 },
            { tick: 1_001, accelerationMps2: 3, jerkMps3: 2.5 },
          ],
          dropoffs: [{ zoneId: 'zone:destination', tick: 2_000 }],
        }),
        expectedStatus: 'FAILED',
        expectedReason: 'COMFORT_LIMIT',
      };
    case 'challenge-cake-delivery':
      return {
        facts: challengeFacts(plan, {
          comfortSamples: [{ tick: 1_000, accelerationMps2: 1.8, jerkMps3: 1.8 }],
          dropoffs: [{ zoneId: 'zone:destination', tick: 2_000 }],
        }),
        expectedStatus: 'FAILED',
        expectedReason: 'COMFORT_LIMIT',
      };
    case 'challenge-influencer-single-frame':
    case 'challenge-city-tour-backwards':
      return {
        facts: challengeFacts(plan, {
          checkpoints: [
            { checkpointId: plan.objective.zoneIds[1]!, tick: 1_000 },
            { checkpointId: plan.objective.zoneIds[0]!, tick: 2_000 },
          ],
        }),
        expectedStatus: 'FAILED',
        expectedReason: 'ORDER_VIOLATION',
      };
    case 'challenge-forgot-something':
      return {
        facts: challengeFacts(plan, {
          zoneVisits: [
            { zoneId: plan.objective.zoneIds[1]!, enteredTick: 1_000, exitedTick: 1_500 },
            { zoneId: plan.objective.zoneIds[0]!, enteredTick: 2_000, exitedTick: 2_500 },
          ],
        }),
        expectedStatus: 'FAILED',
        expectedReason: 'ORDER_VIOLATION',
      };
    case 'challenge-toilet-sos':
      return {
        facts: challengeFacts(plan, { endedTick: expired }),
        expectedStatus: 'FAILED',
        expectedReason: 'WRONG_ZONE',
      };
    case 'challenge-influencer-parking-drift':
      return {
        facts: challengeFacts(plan, {
          endedTick: expired,
          driftSamples: [
            ...Array.from({ length: 200 }, (_, index) => ({
              zoneId: zone!,
              tick: 1_000 + index,
              speedMps: 0.3,
              slipAngleRad: 1.2,
              collisionImpulseNs: 0,
            })),
            { zoneId: zone!, tick: 1_400, speedMps: 9, slipAngleRad: 0.8, collisionImpulseNs: 60 },
          ],
        }),
        expectedStatus: 'FAILED',
        expectedReason: 'NO_VALID_DRIFT',
      };
    case 'challenge-influencer-demolition':
      return {
        facts: challengeFacts(plan, { sessionKind: 'ACADEMY' }),
        expectedStatus: 'EXCLUDED',
        expectedReason: 'SESSION_NOT_ALLOWED',
      };
    case 'challenge-valet-with-style':
      return {
        facts: challengeFacts(plan, {
          endedTick: expired,
          parked: [
            { zoneId: zone!, tick: 2_000, speedMps: 1.5, headingErrorRad: 0.05, dwellTicks: 120 },
          ],
        }),
        expectedStatus: 'FAILED',
        expectedReason: 'PARKING_SPEED',
      };
    case 'challenge-city-copies-me':
      return {
        facts: challengeFacts(plan, {
          endedTick: expired,
          learning: {
            key: plan.objective.learningKey,
            activatedTick: 1_000,
            observedTick: null,
            observedProfileId: null,
          },
        }),
        expectedStatus: 'FAILED',
        expectedReason: 'EFFECT_NOT_OBSERVED',
      };
    default:
      throw new Error(`No failing fixture for ${templateId}`);
  }
}

/** A fixed, valid single-template document used to prove the catalog refuses contradictions. */
export function rawTemplate(templateId = 'challenge-maternity-run'): Record<string, unknown> {
  return JSON.parse(JSON.stringify(challengeTemplate(templateId))) as Record<string, unknown>;
}
