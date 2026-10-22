import { choice, createStableId, number, requireContract, text, tick } from '../sessions';
import { DEFAULT_TARIFF_SCHEDULE, quoteFare, settleFare, tariffOutcomeStates } from './tariffs';
import type { TariffOutcomeState, TariffSchedule } from './tariffs';

/**
 * 209 commercial ledger: the only place where a ride turns into money.
 *
 * One terminal ride settles exactly once. The settlement keeps the quoted fare, the explicit charge,
 * the explicit refund (when the versioned rule returns part of it), the economic tick and the cause.
 * A refund is a separate entry that references the charge entry and the ride, so a review can always
 * be inspected together with the money it explains.
 *
 * Three rules are structural:
 *
 * 1. Only taxi rides are billable. A civilian vehicle is rejected with `CIVILIAN_NOT_BILLABLE`
 *    before any quote exists, so civilians cannot reach revenue, rides or reviews.
 * 2. A second terminal event for the same ride â€” a duplicate id, a reload or another id â€” never
 *    charges twice: the ledger returns the stored settlement.
 * 3. Totals are incremental counters, so a read never rescans the ledger (`historyScans: 0`).
 */
export const LEDGER_VERSION = '209-fleet-ledger-v1' as const;

/** Only a real taxi can be billed. The civilian fleet contributes traffic, never revenue. */
export const billableVehicleKinds = ['TAXI'] as const;
export type BillableVehicleKind = (typeof billableVehicleKinds)[number];

export const ledgerVehicleKinds = ['TAXI', 'CIVILIAN'] as const;
export type LedgerVehicleKind = (typeof ledgerVehicleKinds)[number];

export const ledgerEntryKinds = ['CHARGE', 'REFUND'] as const;
export type LedgerEntryKind = (typeof ledgerEntryKinds)[number];

export const ledgerEntryCauses = [
  'RIDE_FARE_CHARGE',
  'RIDE_FAILED_REFUND',
  'RIDE_CANCELLED_REFUND',
] as const;
export type LedgerEntryCause = (typeof ledgerEntryCauses)[number];

export const ledgerRejectionReasons = [
  'INVALID_SHAPE',
  'UNKNOWN_FIELD',
  'INVALID_IDENTITY',
  'INVALID_NUMBER',
  'CIVILIAN_NOT_BILLABLE',
  'LIMIT_EXCEEDED',
] as const;
export type LedgerRejectionReason = (typeof ledgerRejectionReasons)[number];

export const ledgerDuplicateReasons = ['EVENT_REPLAY', 'RIDE_ALREADY_SETTLED'] as const;
export type LedgerDuplicateReason = (typeof ledgerDuplicateReasons)[number];

export const LEDGER_LIMITS = Object.freeze({
  version: LEDGER_VERSION,
  /** Retained settlements; the oldest is retired first, totals survive. */
  retainedSettlements: 4_096,
  /** Bounded idempotency memory. */
  retainedKeys: 8_192,
  /** Code units per accepted identity. */
  idCodeUnits: 1_024,
  /** Upper bound of every accumulated sum/counter. */
  maximumSum: Number.MAX_SAFE_INTEGER,
});

export interface LedgerEntry {
  readonly entryId: string;
  readonly rideId: string;
  readonly requestId: string;
  readonly taxiId: string;
  readonly kind: LedgerEntryKind;
  readonly cause: LedgerEntryCause;
  readonly amountMinorUnits: number;
  readonly currency: string;
  readonly pricingVersion: string;
  readonly policyVersion: string;
  /** Economic tick of the terminal ride transition. */
  readonly tick: number;
  /** The refund always references the charge it returns; a charge references nothing. */
  readonly referencesEntryId: string | null;
}

/** One terminal settlement: the quoted fare, the charge, the refund and the resulting revenue. */
export interface RideSettlement {
  readonly settlementId: string;
  readonly rideId: string;
  readonly requestId: string;
  readonly taxiId: string;
  readonly terminalState: TariffOutcomeState;
  readonly passengerAboard: boolean;
  readonly tick: number;
  readonly currency: string;
  readonly pricingVersion: string;
  readonly policyVersion: string;
  readonly rule: string;
  readonly quotedMinorUnits: number;
  readonly chargedMinorUnits: number;
  readonly refundedMinorUnits: number;
  /** Revenue contribution: `chargedMinorUnits âˆ’ refundedMinorUnits`. */
  readonly netMinorUnits: number;
  readonly chargeEntryId: string;
  readonly refundEntryId: string | null;
}

export interface LedgerFacts {
  readonly eventId: string;
  readonly rideId: string;
  readonly requestId: string;
  readonly taxiId: string;
  readonly vehicleKind: LedgerVehicleKind;
  readonly terminalState: TariffOutcomeState;
  readonly terminalTick: number;
  readonly passengerAboard: boolean;
  /** Planned trip distance of the real 060/061 route. */
  readonly plannedDistanceMeters: number;
  /** Reference trip duration of the real 061 ride record. */
  readonly referenceTripDurationSeconds: number;
}

export interface LedgerOutcome {
  readonly status: 'ACCEPTED' | 'DUPLICATE' | 'REJECTED';
  readonly reason: LedgerRejectionReason | null;
  readonly duplicateReason: LedgerDuplicateReason | null;
  readonly settlement: RideSettlement | null;
}

export interface LedgerTotals {
  readonly currency: string;
  readonly pricingVersion: string;
  readonly quotedMinorUnits: number;
  readonly chargedMinorUnits: number;
  readonly refundedMinorUnits: number;
  /** Revenue after refunds; civilians are structurally absent from every term. */
  readonly netRevenueMinorUnits: number;
  readonly settlements: number;
  readonly completedRides: number;
  readonly failedRides: number;
  readonly cancelledRides: number;
  readonly completedRevenueMinorUnits: number;
  readonly failedRevenueMinorUnits: number;
  readonly cancellationRevenueMinorUnits: number;
  /** Civilian terminal outcomes refused before any quote. */
  readonly civilianOutcomesRejected: number;
}

export interface LedgerSnapshot {
  readonly version: string;
  readonly tick: number;
  readonly totals: LedgerTotals;
  readonly settlements: readonly RideSettlement[];
  readonly entries: readonly LedgerEntry[];
  /** Structural proof that a read never rescanned the ledger. */
  readonly historyScans: 0;
}

export interface LedgerStats {
  readonly version: string;
  readonly events: number;
  readonly accepted: number;
  readonly duplicates: number;
  readonly rejected: number;
  readonly civilians: number;
  readonly retainedSettlements: number;
  readonly droppedSettlements: number;
  readonly entries: number;
  readonly historyScans: 0;
  readonly lastRejection: LedgerRejectionReason | null;
  readonly disposed: boolean;
}

export interface FleetLedgerOptions {
  readonly namespace?: string;
  readonly schedule?: TariffSchedule;
  readonly retainedSettlements?: number;
}

export interface FleetLedger {
  readonly version: string;
  readonly namespace: string;
  readonly schedule: TariffSchedule;
  ingest(input: unknown): LedgerOutcome;
  settlement(rideId: string): RideSettlement | undefined;
  snapshot(atTick: unknown): LedgerSnapshot;
  totals(): LedgerTotals;
  getStats(): LedgerStats;
  reset(): void;
  dispose(): void;
}

const factFields = [
  'eventId',
  'rideId',
  'requestId',
  'taxiId',
  'vehicleKind',
  'terminalState',
  'terminalTick',
  'passengerAboard',
  'plannedDistanceMeters',
  'referenceTripDurationSeconds',
] as const;

function readIdentity(value: unknown, label: string): string {
  requireContract(
    typeof value === 'string' && value.length > 0 && value.length <= LEDGER_LIMITS.idCodeUnits,
    `Invalid ${label} identity`,
  );
  requireContract(value.trim() === value, `Invalid ${label} identity whitespace`);
  return value;
}

function readFacts(value: unknown): LedgerFacts {
  requireContract(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    'Ledger outcome must be an object',
  );
  const data = value as Record<string, unknown>;
  requireContract(
    Object.keys(data).length === factFields.length &&
      factFields.every((key) => Object.hasOwn(data, key)),
    'Missing or unknown ledger outcome field',
  );
  for (const key of Object.keys(data))
    requireContract(
      (factFields as readonly string[]).includes(key),
      `Unknown ledger field: ${key}`,
    );
  return Object.freeze({
    eventId: readIdentity(data.eventId, 'ledger event'),
    rideId: readIdentity(data.rideId, 'ledger ride'),
    requestId: readIdentity(data.requestId, 'ledger request'),
    taxiId: readIdentity(data.taxiId, 'ledger taxi'),
    vehicleKind: choice(data.vehicleKind, ledgerVehicleKinds),
    terminalState: choice(data.terminalState, tariffOutcomeStates),
    terminalTick: tick(data.terminalTick),
    passengerAboard: (() => {
      requireContract(
        typeof data.passengerAboard === 'boolean',
        'Ledger outcome requires the real passenger presence',
      );
      return data.passengerAboard;
    })(),
    plannedDistanceMeters: number(data.plannedDistanceMeters, 0, 1_000_000),
    referenceTripDurationSeconds: number(data.referenceTripDurationSeconds, 0, 86_400),
  });
}

class LedgerRejection extends Error {
  readonly reason: LedgerRejectionReason;
  constructor(reason: LedgerRejectionReason) {
    super(`Ledger outcome rejected: ${reason}`);
    this.name = 'LedgerRejection';
    this.reason = reason;
  }
}

function reject(reason: LedgerRejectionReason): never {
  throw new LedgerRejection(reason);
}

function zeroTotals(): {
  quotedMinorUnits: number;
  chargedMinorUnits: number;
  refundedMinorUnits: number;
  settlements: number;
  completedRides: number;
  failedRides: number;
  cancelledRides: number;
  completedRevenueMinorUnits: number;
  failedRevenueMinorUnits: number;
  cancellationRevenueMinorUnits: number;
  civilianOutcomesRejected: number;
} {
  return {
    quotedMinorUnits: 0,
    chargedMinorUnits: 0,
    refundedMinorUnits: 0,
    settlements: 0,
    completedRides: 0,
    failedRides: 0,
    cancelledRides: 0,
    completedRevenueMinorUnits: 0,
    failedRevenueMinorUnits: 0,
    cancellationRevenueMinorUnits: 0,
    civilianOutcomesRejected: 0,
  };
}

/** The single commercial ledger. It owns no clock, world, store, renderer or profile. */
export function createFleetLedger(options: FleetLedgerOptions = {}): FleetLedger {
  const namespace = options.namespace === undefined ? 'city:economy' : text(options.namespace),
    schedule = options.schedule ?? DEFAULT_TARIFF_SCHEDULE,
    retainedSettlements = options.retainedSettlements ?? LEDGER_LIMITS.retainedSettlements;
  requireContract(namespace.trim() === namespace, 'Invalid ledger namespace');
  requireContract(
    Number.isSafeInteger(retainedSettlements) &&
      retainedSettlements >= 1 &&
      retainedSettlements <= LEDGER_LIMITS.retainedSettlements,
    'Ledger retention capacity is invalid',
  );
  const settlements = new Map<string, RideSettlement>(),
    entries = new Map<string, LedgerEntry>(),
    keys = new Map<string, string>(),
    totals = zeroTotals();
  let events = 0,
    accepted = 0,
    duplicates = 0,
    rejected = 0,
    droppedSettlements = 0,
    lastTick = 0,
    lastRejection: LedgerRejectionReason | null = null,
    disposed = false;

  function assertLive(): void {
    if (disposed) throw new Error('Fleet ledger disposed');
  }

  function nextSum(current: number, delta: number): number {
    const next = current + delta;
    if (!Number.isSafeInteger(next) || next > LEDGER_LIMITS.maximumSum) reject('LIMIT_EXCEEDED');
    return next;
  }

  function outcome(
    status: 'ACCEPTED' | 'DUPLICATE' | 'REJECTED',
    reason: LedgerRejectionReason | null,
    duplicateReason: LedgerDuplicateReason | null,
    settlement: RideSettlement | null,
  ): LedgerOutcome {
    return Object.freeze({ status, reason, duplicateReason, settlement });
  }

  function storeSettlement(
    settlement: RideSettlement,
    charge: LedgerEntry,
    refund: LedgerEntry | null,
  ): void {
    settlements.set(settlement.rideId, settlement);
    entries.set(charge.entryId, charge);
    if (refund !== null) entries.set(refund.entryId, refund);
    while (settlements.size > retainedSettlements) {
      const oldest = settlements.keys().next().value;
      if (oldest === undefined) break;
      const victim = settlements.get(oldest)!;
      settlements.delete(oldest);
      entries.delete(victim.chargeEntryId);
      if (victim.refundEntryId !== null) entries.delete(victim.refundEntryId);
      droppedSettlements += 1;
    }
  }

  function settle(facts: LedgerFacts): RideSettlement {
    const quote = quoteFare(
      {
        plannedDistanceMeters: facts.plannedDistanceMeters,
        referenceTripDurationSeconds: facts.referenceTripDurationSeconds,
      },
      schedule,
    );
    const fare = settleFare(
        { terminalState: facts.terminalState, passengerAboard: facts.passengerAboard },
        quote,
        schedule,
      ),
      chargeEntryId = createStableId('economy-entry', namespace, [
        facts.rideId,
        facts.eventId,
        'CHARGE',
      ]),
      refundEntryId =
        fare.refundedMinorUnits > 0
          ? createStableId('economy-entry', namespace, [facts.rideId, facts.eventId, 'REFUND'])
          : null,
      pricingVersion = quote.pricingVersion,
      policyVersion = fare.policyVersion;
    const charge: LedgerEntry = Object.freeze({
      entryId: chargeEntryId,
      rideId: facts.rideId,
      requestId: facts.requestId,
      taxiId: facts.taxiId,
      kind: 'CHARGE',
      cause: 'RIDE_FARE_CHARGE',
      amountMinorUnits: fare.chargedMinorUnits,
      currency: quote.currency,
      pricingVersion,
      policyVersion,
      tick: facts.terminalTick,
      referencesEntryId: null,
    });
    const refund: LedgerEntry | null =
      refundEntryId === null
        ? null
        : Object.freeze({
            entryId: refundEntryId,
            rideId: facts.rideId,
            requestId: facts.requestId,
            taxiId: facts.taxiId,
            kind: 'REFUND' as const,
            cause:
              facts.terminalState === 'FAILED'
                ? ('RIDE_FAILED_REFUND' as const)
                : ('RIDE_CANCELLED_REFUND' as const),
            amountMinorUnits: fare.refundedMinorUnits,
            currency: quote.currency,
            pricingVersion,
            policyVersion,
            tick: facts.terminalTick,
            referencesEntryId: chargeEntryId,
          });
    const settlement: RideSettlement = Object.freeze({
      settlementId: createStableId('ride-settlement', namespace, [facts.rideId]),
      rideId: facts.rideId,
      requestId: facts.requestId,
      taxiId: facts.taxiId,
      terminalState: facts.terminalState,
      passengerAboard: facts.passengerAboard,
      tick: facts.terminalTick,
      currency: quote.currency,
      pricingVersion,
      policyVersion,
      rule: fare.rule,
      quotedMinorUnits: fare.quotedMinorUnits,
      chargedMinorUnits: fare.chargedMinorUnits,
      refundedMinorUnits: fare.refundedMinorUnits,
      netMinorUnits: fare.netMinorUnits,
      chargeEntryId,
      refundEntryId,
    });
    storeSettlement(settlement, charge, refund);

    totals.quotedMinorUnits = nextSum(totals.quotedMinorUnits, fare.quotedMinorUnits);
    totals.chargedMinorUnits = nextSum(totals.chargedMinorUnits, fare.chargedMinorUnits);
    totals.refundedMinorUnits = nextSum(totals.refundedMinorUnits, fare.refundedMinorUnits);
    totals.settlements = nextSum(totals.settlements, 1);
    if (facts.terminalState === 'COMPLETED') {
      totals.completedRides = nextSum(totals.completedRides, 1);
      totals.completedRevenueMinorUnits = nextSum(
        totals.completedRevenueMinorUnits,
        fare.netMinorUnits,
      );
    } else if (facts.terminalState === 'FAILED') {
      totals.failedRides = nextSum(totals.failedRides, 1);
      totals.failedRevenueMinorUnits = nextSum(totals.failedRevenueMinorUnits, fare.netMinorUnits);
    } else {
      totals.cancelledRides = nextSum(totals.cancelledRides, 1);
      totals.cancellationRevenueMinorUnits = nextSum(
        totals.cancellationRevenueMinorUnits,
        fare.netMinorUnits,
      );
    }
    if (facts.terminalTick > lastTick) lastTick = facts.terminalTick;
    return settlement;
  }

  function ingest(input: unknown): LedgerOutcome {
    assertLive();
    events += 1;
    try {
      const facts = readFacts(input);
      if (facts.vehicleKind !== 'TAXI') {
        // The civilian fleet is rejected before the quote exists: no revenue can ever include it.
        totals.civilianOutcomesRejected = nextSum(totals.civilianOutcomesRejected, 1);
        throw new LedgerRejection('CIVILIAN_NOT_BILLABLE');
      }
      const knownRide = keys.get(facts.eventId);
      if (knownRide !== undefined) {
        duplicates += 1;
        return outcome('DUPLICATE', null, 'EVENT_REPLAY', settlements.get(knownRide) ?? null);
      }
      const prior = settlements.get(facts.rideId);
      if (prior !== undefined) {
        keys.set(facts.eventId, facts.rideId);
        duplicates += 1;
        return outcome('DUPLICATE', null, 'RIDE_ALREADY_SETTLED', prior);
      }
      const settlement = settle(facts);
      keys.set(facts.eventId, facts.rideId);
      while (keys.size > LEDGER_LIMITS.retainedKeys) {
        const oldest = keys.keys().next().value;
        if (oldest === undefined) break;
        keys.delete(oldest);
      }
      accepted += 1;
      return outcome('ACCEPTED', null, null, settlement);
    } catch (error: unknown) {
      if (error instanceof LedgerRejection) {
        rejected += 1;
        lastRejection = error.reason;
        return outcome('REJECTED', error.reason, null, null);
      }
      if (error instanceof Error && error.name === 'ContractValidationError') {
        rejected += 1;
        lastRejection = 'INVALID_SHAPE';
        return outcome('REJECTED', 'INVALID_SHAPE', null, null);
      }
      throw error;
    }
  }

  function totalsSnapshot(): LedgerTotals {
    return Object.freeze({
      currency: schedule.currency,
      pricingVersion: schedule.pricingVersion,
      quotedMinorUnits: totals.quotedMinorUnits,
      chargedMinorUnits: totals.chargedMinorUnits,
      refundedMinorUnits: totals.refundedMinorUnits,
      netRevenueMinorUnits: totals.chargedMinorUnits - totals.refundedMinorUnits,
      settlements: totals.settlements,
      completedRides: totals.completedRides,
      failedRides: totals.failedRides,
      cancelledRides: totals.cancelledRides,
      completedRevenueMinorUnits: totals.completedRevenueMinorUnits,
      failedRevenueMinorUnits: totals.failedRevenueMinorUnits,
      cancellationRevenueMinorUnits: totals.cancellationRevenueMinorUnits,
      civilianOutcomesRejected: totals.civilianOutcomesRejected,
    });
  }

  return Object.freeze({
    version: LEDGER_VERSION,
    namespace,
    schedule,
    ingest,
    settlement(rideId: string): RideSettlement | undefined {
      return disposed ? undefined : settlements.get(rideId);
    },
    snapshot(atTick: unknown): LedgerSnapshot {
      assertLive();
      const at = tick(atTick);
      const retained = [...settlements.values()].sort(
        (left, right) =>
          left.tick - right.tick ||
          (left.rideId < right.rideId ? -1 : left.rideId > right.rideId ? 1 : 0),
      );
      return Object.freeze({
        version: LEDGER_VERSION,
        tick: at,
        totals: totalsSnapshot(),
        settlements: Object.freeze(retained),
        entries: Object.freeze(
          [...entries.values()].sort(
            (left, right) =>
              left.tick - right.tick ||
              (left.entryId < right.entryId ? -1 : left.entryId > right.entryId ? 1 : 0),
          ),
        ),
        historyScans: 0 as const,
      });
    },
    totals: totalsSnapshot,
    getStats(): LedgerStats {
      return Object.freeze({
        version: LEDGER_VERSION,
        events: disposed ? 0 : events,
        accepted: disposed ? 0 : accepted,
        duplicates: disposed ? 0 : duplicates,
        rejected: disposed ? 0 : rejected,
        civilians: disposed ? 0 : totals.civilianOutcomesRejected,
        retainedSettlements: disposed ? 0 : settlements.size,
        droppedSettlements: disposed ? 0 : droppedSettlements,
        entries: disposed ? 0 : entries.size,
        historyScans: 0 as const,
        lastRejection: disposed ? null : lastRejection,
        disposed,
      });
    },
    reset(): void {
      assertLive();
      settlements.clear();
      entries.clear();
      keys.clear();
      Object.assign(totals, zeroTotals());
      events = 0;
      accepted = 0;
      duplicates = 0;
      rejected = 0;
      droppedSettlements = 0;
      lastTick = 0;
      lastRejection = null;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      settlements.clear();
      entries.clear();
      keys.clear();
      Object.assign(totals, zeroTotals());
      events = 0;
      accepted = 0;
      duplicates = 0;
      rejected = 0;
      droppedSettlements = 0;
      lastTick = 0;
      lastRejection = null;
    },
  });
}
