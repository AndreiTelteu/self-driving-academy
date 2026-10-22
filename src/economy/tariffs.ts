import { choice, number, record, requireContract, text } from '../sessions';

/**
 * 209 versioned tariffs: the quoted fare of a taxi ride and the explicit settlement of its terminal
 * outcome.
 *
 * The fare is fixed when the ride is accepted and is computed only from the planned trip: the real
 * route from the 060 assignment and the real route cost from the 061 ride record. A detour or a
 * deliberate wait therefore cannot raise the price of the same ride, and a faster drive cannot lower
 * it: speed only changes how many rides can be served, never the price of one ride.
 *
 * Every amount is an integer number of minor units of the fictional game currency, so a sum never
 * depends on floating-point addition. The schedule and the settlement rules carry an explicit
 * version; a settlement records the version it was produced with, so a later calibration cannot
 * silently reinterpret history.
 *
 * Three terminal outcomes are handled separately and explicitly:
 *
 * - `COMPLETED` charges the quoted fare once and refunds nothing.
 * - `FAILED` never keeps the whole fare: it refunds the full quoted amount, referencing the charge.
 * - `CANCELLED` refunds everything when the passenger never boarded and keeps only the versioned
 *   service fee when the passenger was already aboard.
 */
export const TARIFF_VERSION = '209-tariff-v1' as const;

/** Fictional game currency code. It is not a real-world currency and has no exchange rate. */
export const ECONOMY_CURRENCY = 'SDA' as const;

export const economyCurrencies = [ECONOMY_CURRENCY] as const;
export type EconomyCurrency = (typeof economyCurrencies)[number];

/** The terminal ride states that settle a fare, from the real 061 lifecycle. */
export const tariffOutcomeStates = ['COMPLETED', 'FAILED', 'CANCELLED'] as const;
export type TariffOutcomeState = (typeof tariffOutcomeStates)[number];

/** Closed settlement rules. A rule is stored with every settlement, never inferred later. */
export const fareSettlementRules = [
  'COMPLETED_FARE',
  'FAILED_FULL_REFUND',
  'CANCELLED_BEFORE_PASSENGER_FULL_REFUND',
  'CANCELLED_WITH_PASSENGER_SERVICE_FEE',
] as const;
export type FareSettlementRule = (typeof fareSettlementRules)[number];

export const TARIFF_LIMITS = Object.freeze({
  version: TARIFF_VERSION,
  /** Integer minor units; the quote is bounded so a corrupt plan cannot mint a huge fare. */
  maximumQuoteMinorUnits: 10_000_000,
  /** One planned trip cannot be longer than a full day of driving at road speed. */
  maximumPlannedDistanceMeters: 1_000_000,
  maximumReferenceDurationSeconds: 86_400,
  /** Code units per pricing or policy version label. */
  versionCodeUnits: 64,
});

export interface CancellationPolicy {
  readonly policyVersion: string;
  /** Share of the quoted fare kept when the passenger was already aboard, in basis points. */
  readonly afterPassengerFeeBasisPoints: number;
  /** A ride that never boarded the passenger refunds the whole quoted fare. */
  readonly beforePassengerFeeMinorUnits: 0;
  /** A failed ride refunds the whole quoted fare; it never keeps the full fare. */
  readonly failureRefundBasisPoints: 10_000;
}

export interface TariffSchedule {
  readonly pricingVersion: string;
  readonly currency: EconomyCurrency;
  readonly baseFareMinorUnits: number;
  readonly distanceRateMinorUnitsPerKm: number;
  readonly timeRateMinorUnitsPerMinute: number;
  readonly cancellation: CancellationPolicy;
}

/**
 * The shipped V1 calibration proposal. The values are a starting calibration of the module 22
 * formula, versioned with the schedule: `baseFare + distanceRate × plannedDistance + timeRate ×
 * referenceTripDuration`. They are not a claim about a real economy.
 */
export const DEFAULT_TARIFF_SCHEDULE: TariffSchedule = Object.freeze({
  pricingVersion: TARIFF_VERSION,
  currency: ECONOMY_CURRENCY,
  baseFareMinorUnits: 240,
  distanceRateMinorUnitsPerKm: 180,
  timeRateMinorUnitsPerMinute: 90,
  cancellation: Object.freeze({
    policyVersion: '209-cancellation-v1',
    afterPassengerFeeBasisPoints: 3_000,
    beforePassengerFeeMinorUnits: 0,
    failureRefundBasisPoints: 10_000,
  }),
});

function boundedVersion(value: unknown, label: string): string {
  const result = text(value);
  requireContract(
    result.length <= TARIFF_LIMITS.versionCodeUnits && result.trim() === result,
    `Invalid ${label} version label`,
  );
  return result;
}

function minorUnits(value: unknown, maximum: number, label: string): number {
  const result = number(value, 0, maximum);
  requireContract(
    Number.isSafeInteger(result),
    `${label} must be an integer number of minor units`,
  );
  return result;
}

function readCancellation(value: unknown): CancellationPolicy {
  requireContract(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    'Tariff cancellation policy must be an object',
  );
  const data = record(value);
  const allowed = [
    'policyVersion',
    'afterPassengerFeeBasisPoints',
    'beforePassengerFeeMinorUnits',
    'failureRefundBasisPoints',
  ] as const;
  requireContract(
    Object.keys(data).length === allowed.length && allowed.every((key) => Object.hasOwn(data, key)),
    'Missing or unknown tariff cancellation field',
  );
  const basisPoints = minorUnits(
    data.afterPassengerFeeBasisPoints,
    10_000,
    'Cancellation fee basis points',
  );
  requireContract(
    data.beforePassengerFeeMinorUnits === 0,
    'A ride cancelled before boarding cannot keep a fee',
  );
  requireContract(
    data.failureRefundBasisPoints === 10_000,
    'A failed ride must refund the whole quoted fare',
  );
  return Object.freeze({
    policyVersion: boundedVersion(data.policyVersion, 'cancellation policy'),
    afterPassengerFeeBasisPoints: basisPoints,
    beforePassengerFeeMinorUnits: 0 as const,
    failureRefundBasisPoints: 10_000 as const,
  });
}

/** Strict reader of a tariff schedule; the default schedule is validated by the same code. */
export function parseTariffSchedule(value: unknown): TariffSchedule {
  requireContract(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    'Tariff schedule must be an object',
  );
  const data = record(value);
  const allowed = [
    'pricingVersion',
    'currency',
    'baseFareMinorUnits',
    'distanceRateMinorUnitsPerKm',
    'timeRateMinorUnitsPerMinute',
    'cancellation',
  ] as const;
  requireContract(
    Object.keys(data).length === allowed.length && allowed.every((key) => Object.hasOwn(data, key)),
    'Missing or unknown tariff schedule field',
  );
  const currency = choice(data.currency, economyCurrencies);
  return Object.freeze({
    pricingVersion: boundedVersion(data.pricingVersion, 'pricing'),
    currency,
    baseFareMinorUnits: minorUnits(
      data.baseFareMinorUnits,
      TARIFF_LIMITS.maximumQuoteMinorUnits,
      'Base fare',
    ),
    distanceRateMinorUnitsPerKm: minorUnits(
      data.distanceRateMinorUnitsPerKm,
      TARIFF_LIMITS.maximumQuoteMinorUnits,
      'Distance rate',
    ),
    timeRateMinorUnitsPerMinute: minorUnits(
      data.timeRateMinorUnitsPerMinute,
      TARIFF_LIMITS.maximumQuoteMinorUnits,
      'Time rate',
    ),
    cancellation: readCancellation(data.cancellation),
  });
}

/** The real planned leg of a ride, from the 060 assignment and the 061 ride record. */
export interface FarePlanInput {
  /** Planned trip distance of the real 060/061 route, in metres. */
  readonly plannedDistanceMeters: number;
  /** Reference trip duration of the real 061 ride record, in simulated seconds. */
  readonly referenceTripDurationSeconds: number;
}

export interface FareQuote {
  readonly currency: EconomyCurrency;
  readonly pricingVersion: string;
  readonly plannedDistanceMeters: number;
  readonly referenceTripDurationSeconds: number;
  readonly baseFareMinorUnits: number;
  readonly distanceFareMinorUnits: number;
  readonly timeFareMinorUnits: number;
  /** The full fixed fare, in integer minor units. */
  readonly totalMinorUnits: number;
}

function roundMinorUnits(value: number): number {
  return Math.round(value);
}

/**
 * The single quote function. Distance and time are the planned values, so a longer real drive, a
 * detour or a wait leave the price unchanged.
 */
export function quoteFare(
  input: FarePlanInput,
  schedule: TariffSchedule = DEFAULT_TARIFF_SCHEDULE,
): FareQuote {
  requireContract(
    typeof input === 'object' && input !== null && !Array.isArray(input),
    'Fare plan must be an object',
  );
  const data = record(input);
  const allowed = ['plannedDistanceMeters', 'referenceTripDurationSeconds'] as const;
  requireContract(
    Object.keys(data).length === allowed.length && allowed.every((key) => Object.hasOwn(data, key)),
    'Missing or unknown fare plan field',
  );
  const plannedDistanceMeters = number(
    data.plannedDistanceMeters,
    0,
    TARIFF_LIMITS.maximumPlannedDistanceMeters,
  );
  const referenceTripDurationSeconds = number(
    data.referenceTripDurationSeconds,
    0,
    TARIFF_LIMITS.maximumReferenceDurationSeconds,
  );
  const distanceFareMinorUnits = roundMinorUnits(
      (plannedDistanceMeters / 1_000) * schedule.distanceRateMinorUnitsPerKm,
    ),
    timeFareMinorUnits = roundMinorUnits(
      (referenceTripDurationSeconds / 60) * schedule.timeRateMinorUnitsPerMinute,
    ),
    totalMinorUnits = schedule.baseFareMinorUnits + distanceFareMinorUnits + timeFareMinorUnits;
  requireContract(
    Number.isSafeInteger(totalMinorUnits) &&
      totalMinorUnits <= TARIFF_LIMITS.maximumQuoteMinorUnits,
    'Quoted fare exceeds the tariff limit',
  );
  return Object.freeze({
    currency: schedule.currency,
    pricingVersion: schedule.pricingVersion,
    plannedDistanceMeters,
    referenceTripDurationSeconds,
    baseFareMinorUnits: schedule.baseFareMinorUnits,
    distanceFareMinorUnits,
    timeFareMinorUnits,
    totalMinorUnits,
  });
}

export interface FareSettlementInput {
  readonly terminalState: TariffOutcomeState;
  /** `true` only when the real 061 chain ended after `PICKUP_COMPLETE`. */
  readonly passengerAboard: boolean;
}

export interface FareSettlement {
  readonly rule: FareSettlementRule;
  readonly policyVersion: string;
  /** The quoted fare fixed at acceptance. */
  readonly quotedMinorUnits: number;
  /**
   * The charge issued at the terminal tick. The fare was fixed at acceptance, so the terminal
   * settlement always books the charge and expresses every exception as an explicit refund.
   */
  readonly chargedMinorUnits: number;
  /** What the refund adjustment returns; it always references the charge. */
  readonly refundedMinorUnits: number;
  /** `chargedMinorUnits − refundedMinorUnits`; this is what revenue counts. */
  readonly netMinorUnits: number;
}

/**
 * The single settlement function of the three terminal outcomes. A completed ride keeps the whole
 * fare; a failed or a pre-boarding cancellation refunds it entirely; a post-boarding cancellation
 * keeps only the versioned service fee.
 */
export function settleFare(
  input: FareSettlementInput,
  quote: FareQuote,
  schedule: TariffSchedule = DEFAULT_TARIFF_SCHEDULE,
): FareSettlement {
  const data = record(input);
  const terminalState = choice(data.terminalState, tariffOutcomeStates);
  requireContract(
    typeof data.passengerAboard === 'boolean',
    'Fare settlement requires the real passenger presence',
  );
  const quotedMinorUnits = quote.totalMinorUnits;
  let rule: FareSettlementRule, keptMinorUnits: number;
  if (terminalState === 'COMPLETED') {
    requireContract(data.passengerAboard, 'A completed ride must have carried the passenger');
    rule = 'COMPLETED_FARE';
    keptMinorUnits = quotedMinorUnits;
  } else if (terminalState === 'FAILED') {
    rule = 'FAILED_FULL_REFUND';
    keptMinorUnits = 0;
  } else if (data.passengerAboard) {
    rule = 'CANCELLED_WITH_PASSENGER_SERVICE_FEE';
    keptMinorUnits = roundMinorUnits(
      (quotedMinorUnits * schedule.cancellation.afterPassengerFeeBasisPoints) / 10_000,
    );
  } else {
    rule = 'CANCELLED_BEFORE_PASSENGER_FULL_REFUND';
    keptMinorUnits = 0;
  }
  const chargedMinorUnits = quotedMinorUnits,
    refundedMinorUnits = quotedMinorUnits - keptMinorUnits;
  return Object.freeze({
    rule,
    policyVersion: schedule.cancellation.policyVersion,
    quotedMinorUnits,
    chargedMinorUnits,
    refundedMinorUnits,
    netMinorUnits: chargedMinorUnits - refundedMinorUnits,
  });
}
