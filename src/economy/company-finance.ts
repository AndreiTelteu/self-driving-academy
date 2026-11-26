import { choice, createStableId, number, requireContract, text, tick } from '../sessions';
import { ECONOMY_CLOCK, economyPeriod } from './kpi';
import type { EconomyClock, KpiCompleteness } from './kpi';
import type { RideSettlement } from './ledger';
import { economyCurrencies } from './tariffs';
import type { EconomyCurrency, TariffOutcomeState } from './tariffs';
import { tariffOutcomeStates } from './tariffs';

/**
 * PBI 268 company finance.
 *
 * A company owns a cost ledger that is deliberately separate from the 209 revenue/review/KPI
 * ledger and from the 213 XP ledger:
 *
 * - revenue is copied from an accepted 209 settlement; this module never calls a 209 write method;
 * - every terminal ride produces exactly one immutable ride-cost entry keyed by `rideId`;
 * - refunds and cancellations are separate adjustment entries that reference the original entry, so
 *   the history is never rewritten;
 * - fixed monthly costs (insurance, salaries, licences) are versioned period entries, applied once
 *   per simulated month; a month with no rides therefore has a real negative profit, not `NO_DATA`;
 * - cash is a separate balance: `initialCash + profit`, clamped at zero with the uncovered loss
 *   reported explicitly. No purchase or upgrade operation exists here; that is PBI 269.
 *
 * The ledger has no clock, renderer, store, profile or XP dependency. It reads only the economic
 * clock for the simulated month and keeps incremental totals, so a read never rescans history
 * (`historyScans: 0`). The cost values are calibration proposals, versioned per category.
 */
export const COMPANY_LEDGER_VERSION = '268-company-ledger-v1' as const;
export const COMPANY_FINANCE_VERSION = '268-company-finance-v1' as const;
export const COMPANY_COST_MODEL_VERSION = '268-company-cost-model-v1' as const;

/** Closed ride-cost categories; every terminal ride has one line per category. */
export const companyRideCostCategories = ['ENERGY', 'MAINTENANCE', 'INCIDENT', 'SERVICE'] as const;
export type CompanyRideCostCategory = (typeof companyRideCostCategories)[number];

/** Closed fixed-cost categories; every simulated month has one entry per category. */
export const companyFixedCostCategories = ['INSURANCE', 'SALARIES', 'LICENSES'] as const;
export type CompanyFixedCostCategory = (typeof companyFixedCostCategories)[number];

export const companyCostCategories = [
  ...companyRideCostCategories,
  ...companyFixedCostCategories,
] as const;
export type CompanyCostCategory = (typeof companyCostCategories)[number];

export const companyCostKinds = ['PER_KM', 'PER_INCIDENT', 'PER_RIDE', 'PER_MONTH'] as const;
export type CompanyCostKind = (typeof companyCostKinds)[number];

const expectedCostKind: Readonly<Record<CompanyCostCategory, CompanyCostKind>> = Object.freeze({
  ENERGY: 'PER_KM',
  MAINTENANCE: 'PER_KM',
  INCIDENT: 'PER_INCIDENT',
  SERVICE: 'PER_RIDE',
  INSURANCE: 'PER_MONTH',
  SALARIES: 'PER_MONTH',
  LICENSES: 'PER_MONTH',
});

export const companyCostAdjustmentCauses = [
  'RIDE_REFUND',
  'RIDE_CANCELLED',
  'SERVICE_NOT_DELIVERED',
  'COST_CORRECTION',
] as const;
export type CompanyCostAdjustmentCause = (typeof companyCostAdjustmentCauses)[number];

export const companyRejectionReasons = [
  'INVALID_SHAPE',
  'UNKNOWN_FIELD',
  'INVALID_IDENTITY',
  'INVALID_NUMBER',
  'INCONSISTENT_STATE',
  'UNKNOWN_RIDE',
  'LIMIT_EXCEEDED',
] as const;
export type CompanyRejectionReason = (typeof companyRejectionReasons)[number];

export const companyDuplicateReasons = [
  'RIDE_ALREADY_COSTED',
  'ADJUSTMENT_ALREADY_APPLIED',
  'FIXED_COST_ALREADY_APPLIED',
] as const;
export type CompanyDuplicateReason = (typeof companyDuplicateReasons)[number];

export const COMPANY_LIMITS = Object.freeze({
  version: COMPANY_LEDGER_VERSION,
  retainedRideEntries: 4_096,
  retainedAdjustments: 4_096,
  retainedFixedEntries: 1_536,
  retainedMonths: 512,
  idCodeUnits: 1_024,
  versionCodeUnits: 64,
  maximumMinorUnits: Number.MAX_SAFE_INTEGER,
  maximumRideDistanceMeters: 1_000_000,
  maximumIncidentsPerRide: 1_000_000,
  maximumAdjustmentMinorUnits: 1_000_000_000,
});

export interface CompanyCategoryRate {
  readonly category: CompanyCostCategory;
  readonly kind: CompanyCostKind;
  /** Integer minor units: per kilometre, per incident, per ride or per simulated month. */
  readonly amountMinorUnits: number;
  readonly costModelVersion: string;
}

export interface CompanyCostSchedule {
  readonly version: string;
  readonly currency: EconomyCurrency;
  /** Starting company cash; the only balance a purchase could spend in PBI 269. */
  readonly initialCashMinorUnits: number;
  readonly categories: Readonly<Record<CompanyCostCategory, CompanyCategoryRate>>;
}

/**
 * Shipped V1 calibration proposal. The values are starting points, not a claim about a real
 * economy; each category carries its own version and a schedule change starts a new reporting
 * series without rewriting the entries already stored.
 */
export const DEFAULT_COMPANY_COST_SCHEDULE: CompanyCostSchedule = Object.freeze({
  version: COMPANY_COST_MODEL_VERSION,
  currency: 'SDA' as const,
  initialCashMinorUnits: 50_000,
  categories: Object.freeze({
    ENERGY: Object.freeze({
      category: 'ENERGY' as const,
      kind: 'PER_KM' as const,
      amountMinorUnits: 60,
      costModelVersion: COMPANY_COST_MODEL_VERSION,
    }),
    MAINTENANCE: Object.freeze({
      category: 'MAINTENANCE' as const,
      kind: 'PER_KM' as const,
      amountMinorUnits: 45,
      costModelVersion: COMPANY_COST_MODEL_VERSION,
    }),
    INCIDENT: Object.freeze({
      category: 'INCIDENT' as const,
      kind: 'PER_INCIDENT' as const,
      amountMinorUnits: 2_500,
      costModelVersion: COMPANY_COST_MODEL_VERSION,
    }),
    SERVICE: Object.freeze({
      category: 'SERVICE' as const,
      kind: 'PER_RIDE' as const,
      amountMinorUnits: 40,
      costModelVersion: COMPANY_COST_MODEL_VERSION,
    }),
    INSURANCE: Object.freeze({
      category: 'INSURANCE' as const,
      kind: 'PER_MONTH' as const,
      amountMinorUnits: 1_200,
      costModelVersion: COMPANY_COST_MODEL_VERSION,
    }),
    SALARIES: Object.freeze({
      category: 'SALARIES' as const,
      kind: 'PER_MONTH' as const,
      amountMinorUnits: 2_400,
      costModelVersion: COMPANY_COST_MODEL_VERSION,
    }),
    LICENSES: Object.freeze({
      category: 'LICENSES' as const,
      kind: 'PER_MONTH' as const,
      amountMinorUnits: 400,
      costModelVersion: COMPANY_COST_MODEL_VERSION,
    }),
  }),
});

export interface CompanyCostLine {
  readonly category: CompanyRideCostCategory;
  readonly kind: Exclude<CompanyCostKind, 'PER_MONTH'>;
  /** Distance in metres for PER_KM, incident count for PER_INCIDENT, `1` for PER_RIDE. */
  readonly quantity: number;
  readonly amountMinorUnits: number;
  readonly costModelVersion: string;
}

/** One immutable cost entry per terminal ride; the idempotency key is the real `rideId`. */
export interface CompanyRideCostEntry {
  readonly entryId: string;
  readonly rideId: string;
  readonly requestId: string;
  readonly taxiId: string;
  readonly tick: number;
  readonly terminalState: TariffOutcomeState;
  readonly passengerAboard: boolean;
  readonly plannedDistanceMeters: number;
  /** Copied read-only from the accepted 209 settlement; it is never written back. */
  readonly revenueMinorUnits: number;
  readonly revenueSettlementId: string;
  readonly lines: readonly CompanyCostLine[];
  readonly grossCostMinorUnits: number;
  /** `revenueMinorUnits - grossCostMinorUnits` before refund/cancellation adjustments. */
  readonly grossProfitMinorUnits: number;
  readonly currency: string;
  readonly costModelVersion: string;
}

/** One versioned fixed monthly cost entry, keyed by `(periodId, category)`. */
export interface CompanyFixedCostEntry {
  readonly entryId: string;
  readonly periodId: string;
  readonly category: CompanyFixedCostCategory;
  readonly amountMinorUnits: number;
  readonly tick: number;
  readonly currency: string;
  readonly costModelVersion: string;
}

/**
 * A refund or cancellation adjustment. `amountMinorUnits` is signed: a negative amount reduces the
 * ride cost (a cost refund), a positive amount adds a correction. The original ride entry is never
 * rewritten.
 */
export interface CompanyCostAdjustment {
  readonly adjustmentId: string;
  readonly rideId: string;
  readonly referencesEntryId: string;
  readonly cause: CompanyCostAdjustmentCause;
  readonly category: CompanyCostCategory;
  readonly amountMinorUnits: number;
  readonly tick: number;
  readonly currency: string;
  readonly costModelVersion: string;
}

export interface CompanyRideCostInput {
  readonly rideId: string;
  readonly requestId: string;
  readonly taxiId: string;
  readonly tick: number;
  readonly terminalState: TariffOutcomeState;
  readonly passengerAboard: boolean;
  readonly plannedDistanceMeters: number;
  readonly revenueMinorUnits: number;
  readonly revenueSettlementId: string;
  readonly incidentCount?: number;
  readonly costModelVersion?: string;
}

export interface CompanyCostAdjustmentInput {
  readonly rideId: string;
  readonly cause: CompanyCostAdjustmentCause;
  readonly category: CompanyCostCategory;
  readonly amountMinorUnits: number;
  readonly tick: number;
  readonly adjustmentId?: string;
}

export interface CompanyRideOutcome {
  readonly status: 'ACCEPTED' | 'DUPLICATE' | 'REJECTED';
  readonly reason: CompanyRejectionReason | null;
  readonly duplicateReason: CompanyDuplicateReason | null;
  readonly entry: CompanyRideCostEntry | null;
  /** The automatic service refund of a terminal ride without a passenger, when applicable. */
  readonly adjustment: CompanyCostAdjustment | null;
}

export interface CompanyAdjustmentOutcome {
  readonly status: 'ACCEPTED' | 'DUPLICATE' | 'REJECTED';
  readonly reason: CompanyRejectionReason | null;
  readonly duplicateReason: CompanyDuplicateReason | null;
  readonly adjustment: CompanyCostAdjustment | null;
}

export interface CompanyFixedCostOutcome {
  readonly status: 'ACCEPTED' | 'DUPLICATE' | 'REJECTED';
  readonly reason: CompanyRejectionReason | null;
  readonly duplicateReason: CompanyDuplicateReason | null;
  readonly applied: number;
  readonly duplicates: number;
  readonly entries: readonly CompanyFixedCostEntry[];
}

export type CompanyCostTotals = Readonly<Record<CompanyCostCategory, number>>;

export interface CompanyMonthReport {
  readonly periodId: string;
  readonly granularity: 'MONTH';
  readonly startTick: number;
  readonly endTick: number;
  readonly economyClockVersion: string;
  readonly currency: string;
  readonly completeness: KpiCompleteness;
  readonly revenueMinorUnits: number;
  readonly rideCostMinorUnits: number;
  readonly fixedCostMinorUnits: number;
  /** Signed: refunds and cancellation credits reduce the cost. */
  readonly adjustmentMinorUnits: number;
  /** `rideCost + fixedCost + adjustment`; never confused with a missing bucket. */
  readonly totalCostMinorUnits: number;
  /** `revenue - totalCost`; may be negative and is still real data. */
  readonly profitMinorUnits: number;
  readonly costByCategory: CompanyCostTotals;
  readonly completedRides: number;
  readonly failedRides: number;
  readonly cancelledRides: number;
  readonly terminalRides: number;
  readonly fixedCostsApplied: boolean;
  readonly hasRideData: boolean;
  readonly lastTick: number | null;
}

export interface CompanyLedgerTotals {
  readonly currency: string;
  readonly costModelVersion: string;
  readonly initialCashMinorUnits: number;
  readonly revenueMinorUnits: number;
  readonly grossCostMinorUnits: number;
  readonly adjustmentMinorUnits: number;
  readonly netCostMinorUnits: number;
  readonly profitMinorUnits: number;
  /** `max(0, initialCash + profit)`; operating losses never make cash negative. */
  readonly cashMinorUnits: number;
  /** The part of a negative balance that the starting cash could not cover. */
  readonly uncoveredLossMinorUnits: number;
  readonly costByCategory: CompanyCostTotals;
  readonly rideCostEntries: number;
  readonly fixedCostEntries: number;
  readonly adjustments: number;
  readonly completedRides: number;
  readonly failedRides: number;
  readonly cancelledRides: number;
  readonly terminalRides: number;
  readonly refundedRides: number;
  readonly historyScans: 0;
}

export interface CompanyFinanceCounters {
  readonly rideCostEntries: number;
  readonly fixedCostEntries: number;
  readonly adjustments: number;
  readonly duplicateRides: number;
  readonly rejectedRides: number;
  readonly refundedRides: number;
  readonly fixedCostDuplicates: number;
  /** Structural proof that the company ledger has no path to XP or to the 209 ledger. */
  readonly xpWrites: 0;
  readonly economyWrites: 0;
  readonly investmentWrites: 0;
}

export interface CompanyFinanceSnapshot {
  readonly version: typeof COMPANY_FINANCE_VERSION;
  readonly tick: number;
  readonly totals: CompanyLedgerTotals;
  /** The month of `tick`; `null` only when that month has no ride, fixed or adjustment entry. */
  readonly month: CompanyMonthReport | null;
  readonly months: readonly CompanyMonthReport[];
  readonly lastRide: CompanyRideCostEntry | null;
  readonly counters: CompanyFinanceCounters;
  readonly historyScans: 0;
  readonly disposed: boolean;
}

export interface CompanyLedgerSnapshot {
  readonly version: typeof COMPANY_LEDGER_VERSION;
  readonly tick: number;
  readonly totals: CompanyLedgerTotals;
  readonly rideEntries: readonly CompanyRideCostEntry[];
  readonly fixedEntries: readonly CompanyFixedCostEntry[];
  readonly adjustments: readonly CompanyCostAdjustment[];
  readonly months: readonly CompanyMonthReport[];
  readonly historyScans: 0;
}

export interface CompanyLedgerStats {
  readonly version: typeof COMPANY_LEDGER_VERSION;
  readonly namespace: string;
  readonly events: number;
  readonly acceptedRides: number;
  readonly duplicateRides: number;
  readonly rejectedRides: number;
  readonly fixedCostEntries: number;
  readonly fixedCostDuplicates: number;
  readonly adjustments: number;
  readonly retainedRideEntries: number;
  readonly droppedRideEntries: number;
  readonly retainedMonths: number;
  readonly historyScans: 0;
  readonly lastRejection: CompanyRejectionReason | null;
  readonly xpWrites: 0;
  readonly economyWrites: 0;
  readonly investmentWrites: 0;
  readonly disposed: boolean;
}

export interface CompanyLedgerOptions {
  readonly namespace?: string;
  readonly schedule?: CompanyCostSchedule;
  readonly clock?: EconomyClock;
  readonly retainedRideEntries?: number;
  readonly retainedAdjustments?: number;
  readonly retainedMonths?: number;
}

export interface CompanyLedger {
  readonly version: typeof COMPANY_LEDGER_VERSION;
  readonly namespace: string;
  readonly schedule: CompanyCostSchedule;
  readonly clock: EconomyClock;
  postRide(input: unknown): CompanyRideOutcome;
  adjustRide(input: unknown): CompanyAdjustmentOutcome;
  accrueFixedCosts(input: unknown): CompanyFixedCostOutcome;
  entry(rideId: string): CompanyRideCostEntry | undefined;
  adjustmentsFor(rideId: string): readonly CompanyCostAdjustment[];
  month(periodId: string): CompanyMonthReport | null;
  totals(): CompanyLedgerTotals;
  read(atTick: unknown): CompanyFinanceSnapshot;
  snapshot(atTick: unknown): CompanyLedgerSnapshot;
  getStats(): CompanyLedgerStats;
  reset(): void;
  dispose(): void;
}

interface MutableMonth {
  readonly periodId: string;
  readonly index: number;
  readonly startTick: number;
  readonly endTick: number;
  revenueMinorUnits: number;
  rideCostMinorUnits: number;
  fixedCostMinorUnits: number;
  adjustmentMinorUnits: number;
  readonly costByCategory: Record<CompanyCostCategory, number>;
  completedRides: number;
  failedRides: number;
  cancelledRides: number;
  fixedCostEntries: number;
  lastTick: number | null;
}

const scheduleFields = ['version', 'currency', 'initialCashMinorUnits', 'categories'] as const;
const categoryFields = ['category', 'kind', 'amountMinorUnits', 'costModelVersion'] as const;
const rideFields = [
  'rideId',
  'requestId',
  'taxiId',
  'tick',
  'terminalState',
  'passengerAboard',
  'plannedDistanceMeters',
  'revenueMinorUnits',
  'revenueSettlementId',
  'incidentCount',
  'costModelVersion',
] as const;
const requiredRideFields = rideFields.filter(
  (field) => field !== 'incidentCount' && field !== 'costModelVersion',
);
const adjustmentFields = [
  'rideId',
  'cause',
  'category',
  'amountMinorUnits',
  'tick',
  'adjustmentId',
] as const;
const requiredAdjustmentFields = adjustmentFields.filter((field) => field !== 'adjustmentId');
const fixedCostFields = ['tick'] as const;

function record(value: unknown, label: string): Record<string, unknown> {
  requireContract(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    `${label} must be an object`,
  );
  return value as Record<string, unknown>;
}

function exactFields(
  data: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(data))
    requireContract((allowed as readonly string[]).includes(key), `Unknown ${label} field: ${key}`);
  for (const key of required)
    requireContract(Object.hasOwn(data, key), `Missing ${label} field: ${key}`);
}

function identity(value: unknown, label: string): string {
  requireContract(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= COMPANY_LIMITS.idCodeUnits &&
      value.trim() === value,
    `Invalid company ${label} identity`,
  );
  return value;
}

function versionLabel(value: unknown, label: string): string {
  const result = text(value);
  requireContract(
    result.length > 0 &&
      result.length <= COMPANY_LIMITS.versionCodeUnits &&
      result.trim() === result,
    `Invalid company ${label} version`,
  );
  return result;
}

function integerMinorUnits(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  const result = number(value, minimum, maximum);
  requireContract(
    Number.isSafeInteger(result),
    `${label} must be an integer number of minor units`,
  );
  return result;
}

function rate(value: unknown, category: CompanyCostCategory): CompanyCategoryRate {
  const data = record(value, `company ${category} rate`);
  exactFields(data, categoryFields, categoryFields, `company ${category} rate`);
  requireContract(
    data.category === category,
    `Company ${category} rate carries the wrong category`,
  );
  const kind = choice(data.kind, companyCostKinds);
  requireContract(
    kind === expectedCostKind[category],
    `Company ${category} rate has the wrong cost kind`,
  );
  return Object.freeze({
    category,
    kind,
    amountMinorUnits: integerMinorUnits(
      data.amountMinorUnits,
      0,
      COMPANY_LIMITS.maximumAdjustmentMinorUnits,
      `Company ${category} rate`,
    ),
    costModelVersion: versionLabel(data.costModelVersion, `${category} cost model`),
  });
}

/** Strict reader of the versioned company cost schedule; the default uses the same reader. */
export function parseCompanyCostSchedule(value: unknown): CompanyCostSchedule {
  const data = record(value, 'company cost schedule');
  exactFields(data, scheduleFields, scheduleFields, 'company cost schedule');
  const categories = record(data.categories, 'company cost categories');
  const categorySet = new Set<string>(companyCostCategories);
  requireContract(
    Object.keys(categories).length === companyCostCategories.length &&
      Object.keys(categories).every((key) => categorySet.has(key)),
    'Company cost schedule must define each category exactly once',
  );
  const parsed = {} as Record<CompanyCostCategory, CompanyCategoryRate>;
  for (const category of companyCostCategories)
    parsed[category] = rate(categories[category], category);
  return Object.freeze({
    version: versionLabel(data.version, 'cost schedule'),
    currency: choice(data.currency, economyCurrencies),
    initialCashMinorUnits: integerMinorUnits(
      data.initialCashMinorUnits,
      0,
      COMPANY_LIMITS.maximumAdjustmentMinorUnits,
      'Company initial cash',
    ),
    categories: Object.freeze(parsed),
  });
}

function zeroCategories(): Record<CompanyCostCategory, number> {
  return {
    ENERGY: 0,
    MAINTENANCE: 0,
    INCIDENT: 0,
    SERVICE: 0,
    INSURANCE: 0,
    SALARIES: 0,
    LICENSES: 0,
  };
}

function add(current: number, delta: number, label: string): number {
  const next = current + delta;
  requireContract(
    Number.isSafeInteger(next) && Math.abs(next) <= COMPANY_LIMITS.maximumMinorUnits,
    `${label} exceeds the company ledger limit`,
  );
  return next;
}

function roundMinorUnits(value: number): number {
  return Math.round(value);
}

function perKilometre(rateMinorUnits: number, distanceMeters: number): number {
  const amount = roundMinorUnits((distanceMeters * rateMinorUnits) / 1_000);
  requireContract(
    Number.isSafeInteger(amount) && amount >= 0 && amount <= COMPANY_LIMITS.maximumMinorUnits,
    'Company per-kilometre cost is outside the contract',
  );
  return amount;
}

class CompanyLedgerRejection extends Error {
  readonly reason: CompanyRejectionReason;
  constructor(reason: CompanyRejectionReason) {
    super(`Company ledger rejected: ${reason}`);
    this.name = 'CompanyLedgerRejection';
    this.reason = reason;
  }
}

function reject(reason: CompanyRejectionReason): never {
  throw new CompanyLedgerRejection(reason);
}

function readRide(value: unknown): CompanyRideCostInput {
  const data = record(value, 'company ride cost input');
  exactFields(data, rideFields, requiredRideFields, 'company ride cost input');
  const terminalState = choice(data.terminalState, tariffOutcomeStates),
    passengerAboard = data.passengerAboard;
  requireContract(typeof passengerAboard === 'boolean', 'Company ride requires passenger presence');
  if (terminalState === 'COMPLETED')
    requireContract(passengerAboard, 'A completed ride must have carried the passenger');
  return Object.freeze({
    rideId: identity(data.rideId, 'ride'),
    requestId: identity(data.requestId, 'request'),
    taxiId: identity(data.taxiId, 'taxi'),
    tick: tick(data.tick),
    terminalState,
    passengerAboard,
    plannedDistanceMeters: number(
      data.plannedDistanceMeters,
      0,
      COMPANY_LIMITS.maximumRideDistanceMeters,
    ),
    revenueMinorUnits: integerMinorUnits(
      data.revenueMinorUnits,
      0,
      COMPANY_LIMITS.maximumMinorUnits,
      'Company ride revenue',
    ),
    revenueSettlementId: identity(data.revenueSettlementId, 'settlement'),
    incidentCount:
      data.incidentCount === undefined
        ? 0
        : integerMinorUnits(
            data.incidentCount,
            0,
            COMPANY_LIMITS.maximumIncidentsPerRide,
            'Company ride incident count',
          ),
    ...(data.costModelVersion === undefined
      ? {}
      : { costModelVersion: versionLabel(data.costModelVersion, 'ride cost model') }),
  });
}

function readAdjustment(value: unknown): CompanyCostAdjustmentInput {
  const data = record(value, 'company adjustment input');
  exactFields(data, adjustmentFields, requiredAdjustmentFields, 'company adjustment input');
  const amountMinorUnits = integerMinorUnits(
    data.amountMinorUnits,
    -COMPANY_LIMITS.maximumAdjustmentMinorUnits,
    COMPANY_LIMITS.maximumAdjustmentMinorUnits,
    'Company adjustment',
  );
  requireContract(amountMinorUnits !== 0, 'A company adjustment cannot be zero');
  return Object.freeze({
    rideId: identity(data.rideId, 'adjustment ride'),
    cause: choice(data.cause, companyCostAdjustmentCauses),
    category: choice(data.category, companyCostCategories),
    amountMinorUnits,
    tick: tick(data.tick),
    ...(data.adjustmentId === undefined
      ? {}
      : { adjustmentId: identity(data.adjustmentId, 'adjustment') }),
  });
}

function readFixedCostTick(value: unknown): number {
  const data = record(value, 'company fixed cost input');
  exactFields(data, fixedCostFields, fixedCostFields, 'company fixed cost input');
  return tick(data.tick);
}

/** The company cost ledger; it owns no clock, renderer, store, profile or XP ledger. */
export function createCompanyLedger(options: CompanyLedgerOptions = {}): CompanyLedger {
  const namespace = options.namespace === undefined ? 'city:company' : text(options.namespace),
    schedule = parseCompanyCostSchedule(options.schedule ?? DEFAULT_COMPANY_COST_SCHEDULE),
    clock = options.clock ?? ECONOMY_CLOCK,
    retainedRideEntries = options.retainedRideEntries ?? COMPANY_LIMITS.retainedRideEntries,
    retainedAdjustments = options.retainedAdjustments ?? COMPANY_LIMITS.retainedAdjustments,
    retainedMonths = options.retainedMonths ?? COMPANY_LIMITS.retainedMonths;
  requireContract(
    namespace.length > 0 && namespace.trim() === namespace,
    'Invalid company namespace',
  );
  requireContract(
    Number.isSafeInteger(retainedRideEntries) &&
      retainedRideEntries >= 1 &&
      retainedRideEntries <= COMPANY_LIMITS.retainedRideEntries,
    'Company ride retention capacity is invalid',
  );
  requireContract(
    Number.isSafeInteger(retainedAdjustments) &&
      retainedAdjustments >= 1 &&
      retainedAdjustments <= COMPANY_LIMITS.retainedAdjustments,
    'Company adjustment retention capacity is invalid',
  );
  requireContract(
    Number.isSafeInteger(retainedMonths) &&
      retainedMonths >= 1 &&
      retainedMonths <= COMPANY_LIMITS.retainedMonths,
    'Company month retention capacity is invalid',
  );
  const rideEntries = new Map<string, CompanyRideCostEntry>(),
    rideOrder: string[] = [],
    fixedEntries = new Map<string, CompanyFixedCostEntry>(),
    fixedOrder: string[] = [],
    adjustments = new Map<string, CompanyCostAdjustment>(),
    adjustmentOrder: string[] = [],
    months = new Map<string, MutableMonth>(),
    monthOrder: string[] = [],
    totals = {
      revenueMinorUnits: 0,
      grossCostMinorUnits: 0,
      adjustmentMinorUnits: 0,
      completedRides: 0,
      failedRides: 0,
      cancelledRides: 0,
      refundedRides: 0,
      costByCategory: zeroCategories(),
    };
  let events = 0,
    acceptedRides = 0,
    duplicateRides = 0,
    rejectedRides = 0,
    fixedCostEntries = 0,
    fixedCostDuplicates = 0,
    adjustmentCount = 0,
    droppedRideEntries = 0,
    lastRejection: CompanyRejectionReason | null = null,
    disposed = false;

  function assertLive(): void {
    if (disposed) throw new Error('Company ledger disposed');
  }

  function nextSum(current: number, delta: number, label: string): number {
    const next = add(current, delta, label);
    if (next < 0) reject('LIMIT_EXCEEDED');
    return next;
  }

  function bucketFor(atTick: number): MutableMonth {
    const period = economyPeriod(atTick, 'MONTH', clock);
    let bucket = months.get(period.periodId);
    if (bucket === undefined) {
      bucket = {
        periodId: period.periodId,
        index: period.index,
        startTick: period.startTick,
        endTick: period.endTick,
        revenueMinorUnits: 0,
        rideCostMinorUnits: 0,
        fixedCostMinorUnits: 0,
        adjustmentMinorUnits: 0,
        costByCategory: zeroCategories(),
        completedRides: 0,
        failedRides: 0,
        cancelledRides: 0,
        fixedCostEntries: 0,
        lastTick: null,
      };
      months.set(period.periodId, bucket);
      monthOrder.push(period.periodId);
      while (months.size > retainedMonths) {
        const oldest = monthOrder.shift();
        if (oldest === undefined) break;
        months.delete(oldest);
      }
    }
    return bucket;
  }

  function noteTick(bucket: MutableMonth, atTick: number): void {
    bucket.lastTick = bucket.lastTick === null ? atTick : Math.max(bucket.lastTick, atTick);
  }

  function addCategory(bucket: MutableMonth, category: CompanyCostCategory, amount: number): void {
    bucket.costByCategory[category] = add(
      bucket.costByCategory[category],
      amount,
      `Company ${category}`,
    );
  }

  function freezeMonth(bucket: MutableMonth, atTick: number): CompanyMonthReport {
    const totalCostMinorUnits =
        bucket.rideCostMinorUnits + bucket.fixedCostMinorUnits + bucket.adjustmentMinorUnits,
      terminalRides = bucket.completedRides + bucket.failedRides + bucket.cancelledRides;
    return Object.freeze({
      periodId: bucket.periodId,
      granularity: 'MONTH' as const,
      startTick: bucket.startTick,
      endTick: bucket.endTick,
      economyClockVersion: clock.version,
      currency: schedule.currency,
      completeness: atTick < bucket.endTick ? ('PARTIAL' as const) : ('COMPLETE' as const),
      revenueMinorUnits: bucket.revenueMinorUnits,
      rideCostMinorUnits: bucket.rideCostMinorUnits,
      fixedCostMinorUnits: bucket.fixedCostMinorUnits,
      adjustmentMinorUnits: bucket.adjustmentMinorUnits,
      totalCostMinorUnits,
      profitMinorUnits: bucket.revenueMinorUnits - totalCostMinorUnits,
      costByCategory: Object.freeze({ ...bucket.costByCategory }),
      completedRides: bucket.completedRides,
      failedRides: bucket.failedRides,
      cancelledRides: bucket.cancelledRides,
      terminalRides,
      fixedCostsApplied: bucket.fixedCostEntries > 0,
      hasRideData: terminalRides > 0,
      lastTick: bucket.lastTick,
    });
  }

  function sortedMonths(atTick: number): readonly CompanyMonthReport[] {
    return Object.freeze(
      [...months.values()]
        .sort((left, right) => left.index - right.index)
        .map((bucket) => freezeMonth(bucket, atTick)),
    );
  }

  function totalsSnapshot(): CompanyLedgerTotals {
    const netCostMinorUnits = totals.grossCostMinorUnits + totals.adjustmentMinorUnits,
      profitMinorUnits = totals.revenueMinorUnits - netCostMinorUnits,
      liquidMinorUnits = schedule.initialCashMinorUnits + profitMinorUnits,
      cashMinorUnits = Math.max(0, liquidMinorUnits),
      uncoveredLossMinorUnits = Math.max(0, -liquidMinorUnits);
    return Object.freeze({
      currency: schedule.currency,
      costModelVersion: schedule.version,
      initialCashMinorUnits: schedule.initialCashMinorUnits,
      revenueMinorUnits: totals.revenueMinorUnits,
      grossCostMinorUnits: totals.grossCostMinorUnits,
      adjustmentMinorUnits: totals.adjustmentMinorUnits,
      netCostMinorUnits,
      profitMinorUnits,
      cashMinorUnits,
      uncoveredLossMinorUnits,
      costByCategory: Object.freeze({ ...totals.costByCategory }),
      rideCostEntries: rideEntries.size,
      fixedCostEntries,
      adjustments: adjustmentCount,
      completedRides: totals.completedRides,
      failedRides: totals.failedRides,
      cancelledRides: totals.cancelledRides,
      terminalRides: totals.completedRides + totals.failedRides + totals.cancelledRides,
      refundedRides: totals.refundedRides,
      historyScans: 0 as const,
    });
  }

  function counters(): CompanyFinanceCounters {
    return Object.freeze({
      rideCostEntries: rideEntries.size,
      fixedCostEntries,
      adjustments: adjustmentCount,
      duplicateRides,
      rejectedRides,
      refundedRides: totals.refundedRides,
      fixedCostDuplicates,
      xpWrites: 0 as const,
      economyWrites: 0 as const,
      investmentWrites: 0 as const,
    });
  }

  function rideOutcome(
    status: CompanyRideOutcome['status'],
    reason: CompanyRejectionReason | null,
    duplicateReason: CompanyDuplicateReason | null,
    entry: CompanyRideCostEntry | null,
    adjustment: CompanyCostAdjustment | null,
  ): CompanyRideOutcome {
    return Object.freeze({ status, reason, duplicateReason, entry, adjustment });
  }

  function adjustmentOutcome(
    status: CompanyAdjustmentOutcome['status'],
    reason: CompanyRejectionReason | null,
    duplicateReason: CompanyDuplicateReason | null,
    adjustment: CompanyCostAdjustment | null,
  ): CompanyAdjustmentOutcome {
    return Object.freeze({ status, reason, duplicateReason, adjustment });
  }

  function storeRide(entry: CompanyRideCostEntry): void {
    rideEntries.set(entry.rideId, entry);
    rideOrder.push(entry.rideId);
    while (rideEntries.size > retainedRideEntries) {
      const oldest = rideOrder.shift();
      if (oldest === undefined) break;
      rideEntries.delete(oldest);
      droppedRideEntries += 1;
    }
  }

  function appendAdjustment(input: {
    readonly rideId: string;
    readonly referencesEntryId: string;
    readonly cause: CompanyCostAdjustmentCause;
    readonly category: CompanyCostCategory;
    readonly amountMinorUnits: number;
    readonly tick: number;
    readonly adjustmentId?: string;
  }): Readonly<{ adjustment: CompanyCostAdjustment; created: boolean }> {
    const adjustmentId =
      input.adjustmentId ??
      createStableId('company-adjustment', namespace, [
        input.rideId,
        input.cause,
        input.category,
        `${input.amountMinorUnits}`,
      ]);
    const existing = adjustments.get(adjustmentId);
    if (existing !== undefined) return Object.freeze({ adjustment: existing, created: false });
    const adjustment: CompanyCostAdjustment = Object.freeze({
      adjustmentId,
      rideId: input.rideId,
      referencesEntryId: input.referencesEntryId,
      cause: input.cause,
      category: input.category,
      amountMinorUnits: input.amountMinorUnits,
      tick: input.tick,
      currency: schedule.currency,
      costModelVersion: schedule.version,
    });
    adjustments.set(adjustmentId, adjustment);
    adjustmentOrder.push(adjustmentId);
    while (adjustments.size > retainedAdjustments) {
      const oldest = adjustmentOrder.shift();
      if (oldest === undefined) break;
      adjustments.delete(oldest);
    }
    totals.adjustmentMinorUnits = add(
      totals.adjustmentMinorUnits,
      input.amountMinorUnits,
      'Company cost adjustment',
    );
    totals.costByCategory[input.category] = add(
      totals.costByCategory[input.category],
      input.amountMinorUnits,
      `Company ${input.category}`,
    );
    const bucket = bucketFor(input.tick);
    bucket.adjustmentMinorUnits = add(
      bucket.adjustmentMinorUnits,
      input.amountMinorUnits,
      'Company month adjustment',
    );
    addCategory(bucket, input.category, input.amountMinorUnits);
    noteTick(bucket, input.tick);
    adjustmentCount += 1;
    return Object.freeze({ adjustment, created: true });
  }

  function postRide(value: unknown): CompanyRideOutcome {
    assertLive();
    events += 1;
    try {
      const input = readRide(value);
      const existing = rideEntries.get(input.rideId);
      if (existing !== undefined) {
        duplicateRides += 1;
        return rideOutcome('DUPLICATE', null, 'RIDE_ALREADY_COSTED', existing, null);
      }
      if (input.costModelVersion !== undefined && input.costModelVersion !== schedule.version)
        reject('INCONSISTENT_STATE');
      const incidentCount = input.incidentCount ?? 0,
        distanceMeters = input.passengerAboard ? input.plannedDistanceMeters : 0,
        energy = schedule.categories.ENERGY,
        maintenance = schedule.categories.MAINTENANCE,
        incident = schedule.categories.INCIDENT,
        service = schedule.categories.SERVICE,
        lines: CompanyCostLine[] = [
          Object.freeze({
            category: 'ENERGY' as const,
            kind: 'PER_KM' as const,
            quantity: distanceMeters,
            amountMinorUnits: perKilometre(energy.amountMinorUnits, distanceMeters),
            costModelVersion: energy.costModelVersion,
          }),
          Object.freeze({
            category: 'MAINTENANCE' as const,
            kind: 'PER_KM' as const,
            quantity: distanceMeters,
            amountMinorUnits: perKilometre(maintenance.amountMinorUnits, distanceMeters),
            costModelVersion: maintenance.costModelVersion,
          }),
          Object.freeze({
            category: 'INCIDENT' as const,
            kind: 'PER_INCIDENT' as const,
            quantity: incidentCount,
            amountMinorUnits: add(
              0,
              incidentCount * incident.amountMinorUnits,
              'Company incident cost',
            ),
            costModelVersion: incident.costModelVersion,
          }),
          Object.freeze({
            category: 'SERVICE' as const,
            kind: 'PER_RIDE' as const,
            quantity: 1,
            amountMinorUnits: service.amountMinorUnits,
            costModelVersion: service.costModelVersion,
          }),
        ],
        grossCostMinorUnits = lines.reduce(
          (sum, line) => add(sum, line.amountMinorUnits, 'Company gross ride cost'),
          0,
        );
      const entry: CompanyRideCostEntry = Object.freeze({
        entryId: createStableId('company-ride-cost', namespace, [input.rideId]),
        rideId: input.rideId,
        requestId: input.requestId,
        taxiId: input.taxiId,
        tick: input.tick,
        terminalState: input.terminalState,
        passengerAboard: input.passengerAboard,
        plannedDistanceMeters: input.plannedDistanceMeters,
        revenueMinorUnits: input.revenueMinorUnits,
        revenueSettlementId: input.revenueSettlementId,
        lines: Object.freeze(lines),
        grossCostMinorUnits,
        grossProfitMinorUnits: input.revenueMinorUnits - grossCostMinorUnits,
        currency: schedule.currency,
        costModelVersion: schedule.version,
      });
      storeRide(entry);
      totals.revenueMinorUnits = nextSum(
        totals.revenueMinorUnits,
        input.revenueMinorUnits,
        'Company revenue',
      );
      totals.grossCostMinorUnits = nextSum(
        totals.grossCostMinorUnits,
        grossCostMinorUnits,
        'Company gross cost',
      );
      for (const line of lines) {
        totals.costByCategory[line.category] = add(
          totals.costByCategory[line.category],
          line.amountMinorUnits,
          `Company ${line.category}`,
        );
      }
      if (input.terminalState === 'COMPLETED')
        totals.completedRides = nextSum(totals.completedRides, 1, 'Company completed rides');
      else if (input.terminalState === 'FAILED')
        totals.failedRides = nextSum(totals.failedRides, 1, 'Company failed rides');
      else totals.cancelledRides = nextSum(totals.cancelledRides, 1, 'Company cancelled rides');
      const bucket = bucketFor(input.tick);
      bucket.revenueMinorUnits = nextSum(
        bucket.revenueMinorUnits,
        input.revenueMinorUnits,
        'Company month revenue',
      );
      bucket.rideCostMinorUnits = nextSum(
        bucket.rideCostMinorUnits,
        grossCostMinorUnits,
        'Company month ride cost',
      );
      for (const line of lines) addCategory(bucket, line.category, line.amountMinorUnits);
      if (input.terminalState === 'COMPLETED')
        bucket.completedRides = nextSum(bucket.completedRides, 1, 'Company month completed rides');
      else if (input.terminalState === 'FAILED')
        bucket.failedRides = nextSum(bucket.failedRides, 1, 'Company month failed rides');
      else
        bucket.cancelledRides = nextSum(bucket.cancelledRides, 1, 'Company month cancelled rides');
      noteTick(bucket, input.tick);
      acceptedRides += 1;
      let adjustment: CompanyCostAdjustment | null = null;
      if (!input.passengerAboard && service.amountMinorUnits > 0) {
        // The service line was still recorded gross; the explicit credit below proves that the entry
        // is immutable and that a cancellation is an adjustment, not a rewrite.
        const appliedAdjustment = appendAdjustment({
          rideId: input.rideId,
          referencesEntryId: entry.entryId,
          cause: 'SERVICE_NOT_DELIVERED',
          category: 'SERVICE',
          amountMinorUnits: -service.amountMinorUnits,
          tick: input.tick,
        });
        adjustment = appliedAdjustment.adjustment;
        if (appliedAdjustment.created)
          totals.refundedRides = nextSum(totals.refundedRides, 1, 'Company refunded rides');
      }
      return rideOutcome('ACCEPTED', null, null, entry, adjustment);
    } catch (error: unknown) {
      if (error instanceof CompanyLedgerRejection) {
        rejectedRides += 1;
        lastRejection = error.reason;
        return rideOutcome('REJECTED', error.reason, null, null, null);
      }
      if (error instanceof Error && error.name === 'ContractValidationError') {
        rejectedRides += 1;
        lastRejection = 'INVALID_SHAPE';
        return rideOutcome('REJECTED', 'INVALID_SHAPE', null, null, null);
      }
      throw error;
    }
  }

  function adjustRide(value: unknown): CompanyAdjustmentOutcome {
    assertLive();
    try {
      const input = readAdjustment(value),
        entry = rideEntries.get(input.rideId);
      if (entry === undefined) reject('UNKNOWN_RIDE');
      const adjustmentId =
        input.adjustmentId ??
        createStableId('company-adjustment', namespace, [
          input.rideId,
          input.cause,
          input.category,
          `${input.amountMinorUnits}`,
        ]);
      const existing = adjustments.get(adjustmentId);
      if (existing !== undefined)
        return adjustmentOutcome('DUPLICATE', null, 'ADJUSTMENT_ALREADY_APPLIED', existing);
      if (totals.grossCostMinorUnits + totals.adjustmentMinorUnits + input.amountMinorUnits < 0)
        reject('INCONSISTENT_STATE');
      const appliedAdjustment = appendAdjustment({
        ...input,
        referencesEntryId: entry.entryId,
        adjustmentId,
      });
      return adjustmentOutcome('ACCEPTED', null, null, appliedAdjustment.adjustment);
    } catch (error: unknown) {
      if (error instanceof CompanyLedgerRejection) {
        lastRejection = error.reason;
        return adjustmentOutcome('REJECTED', error.reason, null, null);
      }
      if (error instanceof Error && error.name === 'ContractValidationError') {
        lastRejection = 'INVALID_SHAPE';
        return adjustmentOutcome('REJECTED', 'INVALID_SHAPE', null, null);
      }
      throw error;
    }
  }

  function accrueFixedCosts(value: unknown): CompanyFixedCostOutcome {
    assertLive();
    try {
      const atTick = readFixedCostTick(value),
        period = economyPeriod(atTick, 'MONTH', clock),
        entries: CompanyFixedCostEntry[] = [];
      let applied = 0,
        duplicates = 0;
      for (const category of companyFixedCostCategories) {
        const rate = schedule.categories[category],
          entryId = createStableId('company-fixed-cost', namespace, [period.periodId, category]);
        const existing = fixedEntries.get(entryId);
        if (existing !== undefined) {
          duplicates += 1;
          continue;
        }
        const entry: CompanyFixedCostEntry = Object.freeze({
          entryId,
          periodId: period.periodId,
          category,
          amountMinorUnits: rate.amountMinorUnits,
          tick: atTick,
          currency: schedule.currency,
          costModelVersion: rate.costModelVersion,
        });
        fixedEntries.set(entryId, entry);
        fixedOrder.push(entryId);
        while (fixedEntries.size > COMPANY_LIMITS.retainedFixedEntries) {
          const oldest = fixedOrder.shift();
          if (oldest === undefined) break;
          fixedEntries.delete(oldest);
        }
        totals.grossCostMinorUnits = nextSum(
          totals.grossCostMinorUnits,
          entry.amountMinorUnits,
          'Company fixed cost',
        );
        totals.costByCategory[category] = add(
          totals.costByCategory[category],
          entry.amountMinorUnits,
          `Company ${category}`,
        );
        const bucket = bucketFor(atTick);
        bucket.fixedCostMinorUnits = nextSum(
          bucket.fixedCostMinorUnits,
          entry.amountMinorUnits,
          'Company month fixed cost',
        );
        bucket.fixedCostEntries = nextSum(
          bucket.fixedCostEntries,
          1,
          'Company month fixed entries',
        );
        addCategory(bucket, category, entry.amountMinorUnits);
        noteTick(bucket, atTick);
        entries.push(entry);
        applied += 1;
      }
      fixedCostEntries += applied;
      fixedCostDuplicates += duplicates;
      if (applied > 0)
        return Object.freeze({
          status: 'ACCEPTED' as const,
          reason: null,
          duplicateReason: null,
          applied,
          duplicates,
          entries: Object.freeze(entries),
        });
      return Object.freeze({
        status: 'DUPLICATE' as const,
        reason: null,
        duplicateReason: 'FIXED_COST_ALREADY_APPLIED' as const,
        applied,
        duplicates,
        entries: Object.freeze(entries),
      });
    } catch (error: unknown) {
      if (error instanceof CompanyLedgerRejection) {
        lastRejection = error.reason;
        return Object.freeze({
          status: 'REJECTED' as const,
          reason: error.reason,
          duplicateReason: null,
          applied: 0,
          duplicates: 0,
          entries: Object.freeze([]),
        });
      }
      if (error instanceof Error && error.name === 'ContractValidationError') {
        lastRejection = 'INVALID_SHAPE';
        return Object.freeze({
          status: 'REJECTED' as const,
          reason: 'INVALID_SHAPE' as const,
          duplicateReason: null,
          applied: 0,
          duplicates: 0,
          entries: Object.freeze([]),
        });
      }
      throw error;
    }
  }

  function read(atTick: unknown): CompanyFinanceSnapshot {
    assertLive();
    const at = tick(atTick),
      period = economyPeriod(at, 'MONTH', clock),
      bucket = months.get(period.periodId) ?? null,
      lastRideId = rideOrder.at(-1),
      lastRide = lastRideId === undefined ? null : (rideEntries.get(lastRideId) ?? null);
    return Object.freeze({
      version: COMPANY_FINANCE_VERSION,
      tick: at,
      totals: totalsSnapshot(),
      month: bucket === null ? null : freezeMonth(bucket, at),
      months: sortedMonths(at),
      lastRide,
      counters: counters(),
      historyScans: 0 as const,
      disposed: false,
    });
  }

  function snapshot(atTick: unknown): CompanyLedgerSnapshot {
    assertLive();
    const at = tick(atTick);
    return Object.freeze({
      version: COMPANY_LEDGER_VERSION,
      tick: at,
      totals: totalsSnapshot(),
      rideEntries: Object.freeze(
        [...rideEntries.values()].sort(
          (left, right) =>
            left.tick - right.tick ||
            (left.entryId < right.entryId ? -1 : left.entryId > right.entryId ? 1 : 0),
        ),
      ),
      fixedEntries: Object.freeze(
        [...fixedEntries.values()].sort(
          (left, right) =>
            left.tick - right.tick ||
            (left.entryId < right.entryId ? -1 : left.entryId > right.entryId ? 1 : 0),
        ),
      ),
      adjustments: Object.freeze(
        [...adjustments.values()].sort(
          (left, right) =>
            left.tick - right.tick ||
            (left.adjustmentId < right.adjustmentId
              ? -1
              : left.adjustmentId > right.adjustmentId
                ? 1
                : 0),
        ),
      ),
      months: sortedMonths(at),
      historyScans: 0 as const,
    });
  }

  return Object.freeze({
    version: COMPANY_LEDGER_VERSION,
    namespace,
    schedule,
    clock,
    postRide,
    adjustRide,
    accrueFixedCosts,
    entry(rideId: string): CompanyRideCostEntry | undefined {
      return disposed ? undefined : rideEntries.get(rideId);
    },
    adjustmentsFor(rideId: string): readonly CompanyCostAdjustment[] {
      if (disposed) return Object.freeze([]);
      return Object.freeze(
        [...adjustments.values()]
          .filter((adjustment) => adjustment.rideId === rideId)
          .sort((left, right) =>
            left.tick !== right.tick
              ? left.tick - right.tick
              : left.adjustmentId < right.adjustmentId
                ? -1
                : left.adjustmentId > right.adjustmentId
                  ? 1
                  : 0,
          ),
      );
    },
    month(periodId: string): CompanyMonthReport | null {
      if (disposed) return null;
      const bucket = months.get(periodId);
      return bucket === undefined ? null : freezeMonth(bucket, bucket.endTick);
    },
    totals: totalsSnapshot,
    read,
    snapshot,
    getStats(): CompanyLedgerStats {
      return Object.freeze({
        version: COMPANY_LEDGER_VERSION,
        namespace,
        events: disposed ? 0 : events,
        acceptedRides: disposed ? 0 : acceptedRides,
        duplicateRides: disposed ? 0 : duplicateRides,
        rejectedRides: disposed ? 0 : rejectedRides,
        fixedCostEntries: disposed ? 0 : fixedCostEntries,
        fixedCostDuplicates: disposed ? 0 : fixedCostDuplicates,
        adjustments: disposed ? 0 : adjustmentCount,
        retainedRideEntries: disposed ? 0 : rideEntries.size,
        droppedRideEntries: disposed ? 0 : droppedRideEntries,
        retainedMonths: disposed ? 0 : months.size,
        historyScans: 0 as const,
        lastRejection: disposed ? null : lastRejection,
        xpWrites: 0 as const,
        economyWrites: 0 as const,
        investmentWrites: 0 as const,
        disposed,
      });
    },
    reset(): void {
      assertLive();
      rideEntries.clear();
      rideOrder.length = 0;
      fixedEntries.clear();
      fixedOrder.length = 0;
      adjustments.clear();
      adjustmentOrder.length = 0;
      months.clear();
      monthOrder.length = 0;
      totals.revenueMinorUnits = 0;
      totals.grossCostMinorUnits = 0;
      totals.adjustmentMinorUnits = 0;
      totals.completedRides = 0;
      totals.failedRides = 0;
      totals.cancelledRides = 0;
      totals.refundedRides = 0;
      Object.assign(totals.costByCategory, zeroCategories());
      events = 0;
      acceptedRides = 0;
      duplicateRides = 0;
      rejectedRides = 0;
      fixedCostEntries = 0;
      fixedCostDuplicates = 0;
      adjustmentCount = 0;
      droppedRideEntries = 0;
      lastRejection = null;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      rideEntries.clear();
      rideOrder.length = 0;
      fixedEntries.clear();
      fixedOrder.length = 0;
      adjustments.clear();
      adjustmentOrder.length = 0;
      months.clear();
      monthOrder.length = 0;
      totals.revenueMinorUnits = 0;
      totals.grossCostMinorUnits = 0;
      totals.adjustmentMinorUnits = 0;
      totals.completedRides = 0;
      totals.failedRides = 0;
      totals.cancelledRides = 0;
      totals.refundedRides = 0;
      Object.assign(totals.costByCategory, zeroCategories());
      events = 0;
      acceptedRides = 0;
      duplicateRides = 0;
      rejectedRides = 0;
      fixedCostEntries = 0;
      fixedCostDuplicates = 0;
      adjustmentCount = 0;
      droppedRideEntries = 0;
      lastRejection = null;
    },
  });
}

/**
 * The live company port consumes the accepted terminal results of the 209 economy. It never calls
 * the 209 ledger, the review ledger or the KPI aggregator; it copies the settlement identity and the
 * net revenue, and reads the real 028 impact count from the emitted review evidence.
 */
export const LIVE_COMPANY_FINANCE_VERSION = '268-live-company-finance-v1' as const;

export interface CompanySettlementOutcome {
  readonly rideId: string;
  readonly requestId: string;
  readonly taxiId: string;
  readonly terminalState: TariffOutcomeState;
  readonly terminalTick: number;
  readonly passengerAboard: boolean;
  readonly plannedDistanceMeters: number;
}

export interface CompanyReviewOutcome {
  readonly review: Readonly<{ readonly evidence: Readonly<{ readonly impacts: number }> }> | null;
}

/** The subset of one accepted 209 result the company needs; a full `EconomyRideResult` is assignable. */
export interface CompanyEconomyResult {
  readonly settlement: Readonly<{
    readonly status: 'ACCEPTED' | 'DUPLICATE' | 'REJECTED';
    readonly settlement: RideSettlement | null;
  }>;
  readonly outcome: CompanySettlementOutcome;
  readonly review: CompanyReviewOutcome | null;
}

export interface LiveCompanyStepInput {
  readonly atTick: number;
  readonly settlements: readonly CompanyEconomyResult[];
}

export interface LiveCompanyStepResult {
  readonly version: typeof LIVE_COMPANY_FINANCE_VERSION;
  readonly tick: number;
  readonly duplicate: boolean;
  readonly applied: number;
  readonly duplicates: number;
  readonly rejected: number;
  readonly fixedCostsApplied: number;
  readonly fixedCostsDuplicate: number;
  readonly settlements: readonly CompanyRideOutcome[];
}

export interface LiveCompanyFinanceStats {
  readonly version: typeof LIVE_COMPANY_FINANCE_VERSION;
  readonly tick: number;
  readonly applied: number;
  readonly duplicates: number;
  readonly rejected: number;
  readonly fixedCostsApplied: number;
  readonly fixedCostsDuplicate: number;
  readonly historyScans: 0;
  readonly xpWrites: 0;
  readonly economyWrites: 0;
  readonly investmentWrites: 0;
  readonly disposed: boolean;
}

export interface LiveCompanyFinanceOptions {
  readonly namespace?: string;
  readonly schedule?: CompanyCostSchedule;
  readonly clock?: EconomyClock;
  readonly retainedRideEntries?: number;
  readonly retainedAdjustments?: number;
  readonly retainedMonths?: number;
}

export interface LiveCompanyFinance {
  readonly version: typeof LIVE_COMPANY_FINANCE_VERSION;
  readonly ledger: CompanyLedger;
  step(input: unknown): LiveCompanyStepResult;
  read(): CompanyFinanceSnapshot | null;
  snapshot(atTick?: number): CompanyLedgerSnapshot | null;
  stats(): LiveCompanyFinanceStats;
  dispose(): void;
}

const liveFields = ['atTick', 'settlements'] as const;

function readLiveResult(value: unknown): CompanyEconomyResult {
  const data = record(value, 'live company settlement'),
    settlement = record(data.settlement, 'live company settlement result'),
    outcome = record(data.outcome, 'live company ride outcome'),
    status = choice(settlement.status, ['ACCEPTED', 'DUPLICATE', 'REJECTED'] as const),
    passengerAboard = outcome.passengerAboard;
  requireContract(
    typeof passengerAboard === 'boolean',
    'Live company ride requires passenger presence',
  );
  let review: CompanyReviewOutcome | null = null;
  if (data.review !== null) {
    const reviewData = record(data.review, 'live company review');
    if (reviewData.review !== null) {
      const reviewValue = record(reviewData.review, 'live company emitted review'),
        evidence = record(reviewValue.evidence, 'live company review evidence');
      review = Object.freeze({
        review: Object.freeze({
          evidence: Object.freeze({
            impacts: integerMinorUnits(
              evidence.impacts,
              0,
              COMPANY_LIMITS.maximumIncidentsPerRide,
              'Live company review impacts',
            ),
          }),
        }),
      });
    } else review = Object.freeze({ review: null });
  }
  requireContract(
    settlement.settlement === null ||
      (typeof settlement.settlement === 'object' && !Array.isArray(settlement.settlement)),
    'Live company settlement is invalid',
  );
  return Object.freeze({
    settlement: Object.freeze({
      status,
      settlement: settlement.settlement as RideSettlement | null,
    }),
    outcome: Object.freeze({
      rideId: identity(outcome.rideId, 'live ride'),
      requestId: identity(outcome.requestId, 'live request'),
      taxiId: identity(outcome.taxiId, 'live taxi'),
      terminalState: choice(outcome.terminalState, tariffOutcomeStates),
      terminalTick: tick(outcome.terminalTick),
      passengerAboard,
      plannedDistanceMeters: number(
        outcome.plannedDistanceMeters,
        0,
        COMPANY_LIMITS.maximumRideDistanceMeters,
      ),
    }),
    review,
  });
}

export function createLiveCompanyFinance(
  options: LiveCompanyFinanceOptions = {},
): LiveCompanyFinance {
  const ledger = createCompanyLedger(options);
  let lastTick = 0,
    applied = 0,
    duplicates = 0,
    rejected = 0,
    fixedCostsApplied = 0,
    fixedCostsDuplicate = 0,
    disposed = false;

  function assertLive(): void {
    if (disposed) throw new Error('Live company finance disposed');
  }

  function step(value: unknown): LiveCompanyStepResult {
    assertLive();
    const data = record(value, 'live company step');
    exactFields(data, liveFields, liveFields, 'live company step');
    const atTick = tick(data.atTick);
    requireContract(atTick >= lastTick, 'Live company refuses a tick before its clock');
    requireContract(Array.isArray(data.settlements), 'Live company settlements must be a list');
    requireContract(data.settlements.length <= 4_096, 'Live company settlement frame is too large');
    const duplicateTick = atTick === lastTick,
      fixed = ledger.accrueFixedCosts({ tick: atTick }),
      outcomes: CompanyRideOutcome[] = [];
    fixedCostsApplied += fixed.applied;
    fixedCostsDuplicate += fixed.duplicates;
    let appliedNow = 0,
      duplicatesNow = 0,
      rejectedNow = 0;
    for (const raw of data.settlements) {
      const result = readLiveResult(raw);
      if (result.settlement.status === 'DUPLICATE') {
        duplicates += 1;
        duplicatesNow += 1;
        continue;
      }
      if (result.settlement.status === 'REJECTED' || result.settlement.settlement === null) {
        rejected += 1;
        rejectedNow += 1;
        continue;
      }
      const settlement = result.settlement.settlement,
        incidentCount = result.review?.review?.evidence.impacts ?? 0,
        outcome = ledger.postRide({
          rideId: result.outcome.rideId,
          requestId: result.outcome.requestId,
          taxiId: result.outcome.taxiId,
          tick: result.outcome.terminalTick,
          terminalState: result.outcome.terminalState,
          passengerAboard: result.outcome.passengerAboard,
          plannedDistanceMeters: result.outcome.plannedDistanceMeters,
          revenueMinorUnits: settlement.netMinorUnits,
          revenueSettlementId: settlement.settlementId,
          incidentCount,
        });
      outcomes.push(outcome);
      if (outcome.status === 'ACCEPTED') {
        applied += 1;
        appliedNow += 1;
      } else if (outcome.status === 'DUPLICATE') {
        duplicates += 1;
        duplicatesNow += 1;
      } else {
        rejected += 1;
        rejectedNow += 1;
      }
    }
    lastTick = Math.max(lastTick, atTick);
    return Object.freeze({
      version: LIVE_COMPANY_FINANCE_VERSION,
      tick: atTick,
      duplicate: duplicateTick && data.settlements.length === 0,
      applied: appliedNow,
      duplicates: duplicatesNow,
      rejected: rejectedNow,
      fixedCostsApplied: fixed.applied,
      fixedCostsDuplicate: fixed.duplicates,
      settlements: Object.freeze(outcomes),
    });
  }

  return Object.freeze({
    version: LIVE_COMPANY_FINANCE_VERSION,
    ledger,
    step,
    read(): CompanyFinanceSnapshot | null {
      return disposed ? null : ledger.read(lastTick);
    },
    snapshot(atTick?: number): CompanyLedgerSnapshot | null {
      return disposed ? null : ledger.snapshot(atTick ?? lastTick);
    },
    stats(): LiveCompanyFinanceStats {
      return Object.freeze({
        version: LIVE_COMPANY_FINANCE_VERSION,
        tick: disposed ? 0 : lastTick,
        applied: disposed ? 0 : applied,
        duplicates: disposed ? 0 : duplicates,
        rejected: disposed ? 0 : rejected,
        fixedCostsApplied: disposed ? 0 : fixedCostsApplied,
        fixedCostsDuplicate: disposed ? 0 : fixedCostsDuplicate,
        historyScans: 0 as const,
        xpWrites: 0 as const,
        economyWrites: 0 as const,
        investmentWrites: 0 as const,
        disposed,
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      ledger.dispose();
    },
  });
}
