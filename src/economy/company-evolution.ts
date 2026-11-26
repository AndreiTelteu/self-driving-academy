import { choice, number, requireContract, text, tick } from '../sessions';
import { FLEET_LIMITS } from '../fleet';
import type { CompanyFleetPort } from '../fleet';
import type {
  CompanyCostCategory,
  CompanyFinanceSnapshot,
  CompanyLedger,
  CompanyLedgerTotals,
} from './company-finance';
import { COMPANY_INVESTMENT_MODEL_VERSION } from './company-finance';
import { ECONOMY_CLOCK, economyPeriod } from './kpi';
import type { EconomyClock } from './kpi';

/**
 * PBI 269 company evolution over the 268 ledger.
 *
 * The module adds three things without creating a second ledger, a second fleet or a second XP store:
 *
 * - **Company level** is a pure function of the monotonic `reinvestedProfitMinorUnits` reported by
 *   the 268 ledger. It is not derived from XP and it never writes to the XP or driving-profile stores.
 * - **Vehicle purchases** spend real cash and add a real vehicle to the injected 057 fleet port. The
 *   returned vehicle identity and slot are stored; the same offer cannot be bought twice.
 * - **Upgrades** spend real cash and register a bounded, versioned cost modifier in the same ledger.
 *   The modifier starts at the next simulated month, so the current period is never rewritten and the
 *   next period shows the declared effect.
 *
 * The evolution is a projection plus a small command journal. It owns no clock, DOM, renderer,
 * profile store or XP ledger. Its `read()` model is the data PBI 270 will consume.
 */
export const COMPANY_EVOLUTION_VERSION = '269-company-evolution-v1' as const;
export const COMPANY_LEVEL_TABLE_VERSION = '269-company-levels-v1' as const;
export const COMPANY_VEHICLE_CATALOG_VERSION = '269-company-vehicle-catalog-v1' as const;
export const COMPANY_UPGRADE_CATALOG_VERSION = '269-company-upgrade-catalog-v1' as const;
export const COMPANY_EVOLUTION_SNAPSHOT_VERSION = '269-company-evolution-snapshot-v1' as const;
export const LIVE_COMPANY_EVOLUTION_VERSION = '269-live-company-evolution-v1' as const;

export const COMPANY_EVOLUTION_LIMITS = Object.freeze({
  version: COMPANY_EVOLUTION_VERSION,
  levels: 16,
  vehicleOffers: 16,
  upgrades: 16,
  purchases: 16,
  ownedUpgrades: 16,
  idCodeUnits: 1_024,
  versionCodeUnits: 64,
  maximumBasisPoints: 10_000,
  minimumBasisPoints: 5_000,
});

/** Monotonic thresholds over `reinvestedProfitMinorUnits`; level 1 is always available. */
export interface CompanyLevelThreshold {
  readonly level: number;
  readonly minimumReinvestedProfitMinorUnits: number;
}

/** Calibration proposal, not a certified economic value. */
export const COMPANY_LEVEL_THRESHOLDS: readonly CompanyLevelThreshold[] = Object.freeze([
  Object.freeze({ level: 1, minimumReinvestedProfitMinorUnits: 0 }),
  Object.freeze({ level: 2, minimumReinvestedProfitMinorUnits: 5_000 }),
  Object.freeze({ level: 3, minimumReinvestedProfitMinorUnits: 15_000 }),
  Object.freeze({ level: 4, minimumReinvestedProfitMinorUnits: 35_000 }),
  Object.freeze({ level: 5, minimumReinvestedProfitMinorUnits: 70_000 }),
  Object.freeze({ level: 6, minimumReinvestedProfitMinorUnits: 120_000 }),
]);

export interface CompanyLevelProgress {
  readonly level: number;
  readonly maxLevel: number;
  readonly tableVersion: typeof COMPANY_LEVEL_TABLE_VERSION;
  readonly reinvestedProfitMinorUnits: number;
  readonly currentThresholdMinorUnits: number;
  readonly nextThresholdMinorUnits: number | null;
  readonly toNextLevelMinorUnits: number;
  readonly progressBasisPoints: number;
}

export function companyLevelFor(reinvestedProfitMinorUnits: number): number {
  const value = Math.max(0, Math.floor(reinvestedProfitMinorUnits));
  let level = COMPANY_LEVEL_THRESHOLDS[0]!.level;
  for (const threshold of COMPANY_LEVEL_THRESHOLDS)
    if (value >= threshold.minimumReinvestedProfitMinorUnits) level = threshold.level;
  return level;
}

export function companyLevelProgress(reinvestedProfitMinorUnits: number): CompanyLevelProgress {
  const value = Math.max(0, Math.floor(reinvestedProfitMinorUnits)),
    level = companyLevelFor(value),
    index = COMPANY_LEVEL_THRESHOLDS.findIndex((entry) => entry.level === level),
    current = COMPANY_LEVEL_THRESHOLDS[index]!,
    next = COMPANY_LEVEL_THRESHOLDS[index + 1] ?? null,
    span =
      next === null
        ? 0
        : Math.max(
            1,
            next.minimumReinvestedProfitMinorUnits - current.minimumReinvestedProfitMinorUnits,
          ),
    progressBasisPoints =
      next === null
        ? COMPANY_EVOLUTION_LIMITS.maximumBasisPoints
        : Math.min(
            COMPANY_EVOLUTION_LIMITS.maximumBasisPoints,
            Math.max(
              0,
              Math.round(((value - current.minimumReinvestedProfitMinorUnits) * 10_000) / span),
            ),
          );
  return Object.freeze({
    level,
    maxLevel: COMPANY_LEVEL_THRESHOLDS.at(-1)!.level,
    tableVersion: COMPANY_LEVEL_TABLE_VERSION,
    reinvestedProfitMinorUnits: value,
    currentThresholdMinorUnits: current.minimumReinvestedProfitMinorUnits,
    nextThresholdMinorUnits: next?.minimumReinvestedProfitMinorUnits ?? null,
    toNextLevelMinorUnits:
      next === null ? 0 : Math.max(0, next.minimumReinvestedProfitMinorUnits - value),
    progressBasisPoints,
  });
}

export interface CompanyVehicleOffer {
  readonly offerId: string;
  readonly version: string;
  readonly classId: 'sedan' | 'compact';
  readonly driverKind: 'TAXI';
  readonly costMinorUnits: number;
  readonly requiredLevel: number;
  readonly catalogVersion: typeof COMPANY_VEHICLE_CATALOG_VERSION;
}

/** One-time purchase listings; the 057 taxi capacity is 30 and the live world starts at 24. */
export const COMPANY_VEHICLE_OFFERS: readonly CompanyVehicleOffer[] = Object.freeze([
  Object.freeze({
    offerId: 'offer-city-compact-1',
    version: '269-vehicle-compact-v1',
    classId: 'compact' as const,
    driverKind: 'TAXI' as const,
    costMinorUnits: 12_000,
    requiredLevel: 1,
    catalogVersion: COMPANY_VEHICLE_CATALOG_VERSION,
  }),
  Object.freeze({
    offerId: 'offer-city-compact-2',
    version: '269-vehicle-compact-v1',
    classId: 'compact' as const,
    driverKind: 'TAXI' as const,
    costMinorUnits: 16_000,
    requiredLevel: 1,
    catalogVersion: COMPANY_VEHICLE_CATALOG_VERSION,
  }),
  Object.freeze({
    offerId: 'offer-city-sedan-1',
    version: '269-vehicle-sedan-v1',
    classId: 'sedan' as const,
    driverKind: 'TAXI' as const,
    costMinorUnits: 22_000,
    requiredLevel: 2,
    catalogVersion: COMPANY_VEHICLE_CATALOG_VERSION,
  }),
  Object.freeze({
    offerId: 'offer-city-sedan-2',
    version: '269-vehicle-sedan-v1',
    classId: 'sedan' as const,
    driverKind: 'TAXI' as const,
    costMinorUnits: 26_000,
    requiredLevel: 2,
    catalogVersion: COMPANY_VEHICLE_CATALOG_VERSION,
  }),
  Object.freeze({
    offerId: 'offer-city-sedan-3',
    version: '269-vehicle-sedan-v1',
    classId: 'sedan' as const,
    driverKind: 'TAXI' as const,
    costMinorUnits: 32_000,
    requiredLevel: 3,
    catalogVersion: COMPANY_VEHICLE_CATALOG_VERSION,
  }),
  Object.freeze({
    offerId: 'offer-city-sedan-4',
    version: '269-vehicle-sedan-v1',
    classId: 'sedan' as const,
    driverKind: 'TAXI' as const,
    costMinorUnits: 40_000,
    requiredLevel: 4,
    catalogVersion: COMPANY_VEHICLE_CATALOG_VERSION,
  }),
]);

export interface CompanyUpgradeEffect {
  readonly kind: 'NEXT_PERIOD_COST_REDUCTION';
  readonly category: CompanyCostCategory;
  /** `5000` means the declared category cost is halved; `10000` is the unmodified price. */
  readonly basisPoints: number;
}

export interface CompanyUpgradeDefinition {
  readonly upgradeId: string;
  readonly version: string;
  readonly requiredLevel: number;
  readonly costMinorUnits: number;
  readonly effect: CompanyUpgradeEffect;
  readonly catalogVersion: typeof COMPANY_UPGRADE_CATALOG_VERSION;
}

/** Bounded (max 50% reduction) and versioned; each targets one cost category. */
export const COMPANY_UPGRADES: readonly CompanyUpgradeDefinition[] = Object.freeze([
  Object.freeze({
    upgradeId: 'upgrade-preventive-maintenance',
    version: '269-upgrade-preventive-maintenance-v1',
    requiredLevel: 2,
    costMinorUnits: 12_000,
    effect: Object.freeze({
      kind: 'NEXT_PERIOD_COST_REDUCTION' as const,
      category: 'MAINTENANCE' as const,
      basisPoints: 9_000,
    }),
    catalogVersion: COMPANY_UPGRADE_CATALOG_VERSION,
  }),
  Object.freeze({
    upgradeId: 'upgrade-service-contract',
    version: '269-upgrade-service-contract-v1',
    requiredLevel: 2,
    costMinorUnits: 8_000,
    effect: Object.freeze({
      kind: 'NEXT_PERIOD_COST_REDUCTION' as const,
      category: 'SERVICE' as const,
      basisPoints: 5_000,
    }),
    catalogVersion: COMPANY_UPGRADE_CATALOG_VERSION,
  }),
  Object.freeze({
    upgradeId: 'upgrade-energy-routing',
    version: '269-upgrade-energy-routing-v1',
    requiredLevel: 3,
    costMinorUnits: 18_000,
    effect: Object.freeze({
      kind: 'NEXT_PERIOD_COST_REDUCTION' as const,
      category: 'ENERGY' as const,
      basisPoints: 9_500,
    }),
    catalogVersion: COMPANY_UPGRADE_CATALOG_VERSION,
  }),
  Object.freeze({
    upgradeId: 'upgrade-insurance-bundle',
    version: '269-upgrade-insurance-bundle-v1',
    requiredLevel: 4,
    costMinorUnits: 25_000,
    effect: Object.freeze({
      kind: 'NEXT_PERIOD_COST_REDUCTION' as const,
      category: 'INSURANCE' as const,
      basisPoints: 8_000,
    }),
    catalogVersion: COMPANY_UPGRADE_CATALOG_VERSION,
  }),
  Object.freeze({
    upgradeId: 'upgrade-incident-response',
    version: '269-upgrade-incident-response-v1',
    requiredLevel: 4,
    costMinorUnits: 30_000,
    effect: Object.freeze({
      kind: 'NEXT_PERIOD_COST_REDUCTION' as const,
      category: 'INCIDENT' as const,
      basisPoints: 8_000,
    }),
    catalogVersion: COMPANY_UPGRADE_CATALOG_VERSION,
  }),
]);

export const companyEvolutionRefusalReasons = [
  'INSUFFICIENT_CASH',
  'LEVEL_REQUIRED',
  'ALREADY_OWNED',
  'FLEET_UNAVAILABLE',
  'FLEET_CAPACITY',
  'FLEET_REFUSED',
  'LEDGER_REJECTED',
  'INVALID_OFFER',
  'INVALID_INPUT',
] as const;
export type CompanyEvolutionRefusalReason = (typeof companyEvolutionRefusalReasons)[number];

export type CompanyOfferState =
  | 'AVAILABLE'
  | 'OWNED'
  | 'LEVEL_REQUIRED'
  | 'INSUFFICIENT_CASH'
  | 'FLEET_CAPACITY'
  | 'FLEET_UNAVAILABLE';

export interface CompanyVehiclePurchase {
  readonly offerId: string;
  readonly version: string;
  readonly vehicleId: string;
  readonly slot: number;
  readonly classId: 'sedan' | 'compact';
  readonly driverKind: 'TAXI';
  readonly costMinorUnits: number;
  readonly tick: number;
  readonly requiredLevel: number;
  readonly catalogVersion: typeof COMPANY_VEHICLE_CATALOG_VERSION;
  readonly investmentId: string;
}

export interface CompanyUpgradeOwnership {
  readonly upgradeId: string;
  readonly version: string;
  readonly costMinorUnits: number;
  readonly tick: number;
  readonly requiredLevel: number;
  readonly category: CompanyCostCategory;
  readonly basisPoints: number;
  readonly effectiveFromTick: number;
  readonly effectiveFromPeriodId: string;
  readonly catalogVersion: typeof COMPANY_UPGRADE_CATALOG_VERSION;
  readonly investmentId: string;
  readonly modifierId: string;
}

export interface CompanyVehicleOfferView {
  readonly offer: CompanyVehicleOffer;
  readonly state: CompanyOfferState;
  readonly purchase: CompanyVehiclePurchase | null;
  readonly refusal: CompanyEvolutionRefusalReason | null;
}

export interface CompanyUpgradeView {
  readonly upgrade: CompanyUpgradeDefinition;
  readonly state: CompanyOfferState;
  readonly ownership: CompanyUpgradeOwnership | null;
  readonly refusal: CompanyEvolutionRefusalReason | null;
  /** `true` once the current simulated tick has reached the next-period start. */
  readonly effective: boolean;
}

export interface CompanyEvolutionRefusal {
  readonly reason: CompanyEvolutionRefusalReason;
  readonly detail: string | null;
  readonly offerId: string | null;
  readonly tick: number;
}

export interface CompanyEvolutionRead {
  readonly version: typeof COMPANY_EVOLUTION_VERSION;
  readonly tick: number;
  readonly currency: string;
  readonly companyLevel: Readonly<{
    tableVersion: typeof COMPANY_LEVEL_TABLE_VERSION;
    level: number;
    maxLevel: number;
    reinvestedProfitMinorUnits: number;
    profitHighWaterMinorUnits: number;
    currentThresholdMinorUnits: number;
    nextThresholdMinorUnits: number | null;
    toNextLevelMinorUnits: number;
    progressBasisPoints: number;
    /** Explicit separation: the XP level is never an input to the company level. */
    xpLevelUsed: false;
  }>;
  readonly cash: Readonly<{
    currency: string;
    initialCashMinorUnits: number;
    revenueMinorUnits: number;
    profitMinorUnits: number;
    cashBeforeInvestmentMinorUnits: number;
    investmentMinorUnits: number;
    vehicleInvestmentMinorUnits: number;
    upgradeInvestmentMinorUnits: number;
    cashMinorUnits: number;
    uncoveredLossMinorUnits: number;
    formula: 'initialCash + profit - investments, clamped at zero';
  }>;
  readonly fleet: Readonly<{
    taxis: number;
    civilians: number;
    vehicles: number;
    purchasedTaxis: number;
    capacityTaxis: number;
    capacityRemaining: number;
    fleetValueMinorUnits: number;
    purchased: readonly Readonly<{
      vehicleId: string;
      slot: number;
      classId: 'sedan' | 'compact';
      offerId: string;
      simulated: boolean | null;
    }>[];
  }>;
  readonly offers: readonly CompanyVehicleOfferView[];
  readonly upgrades: readonly CompanyUpgradeView[];
  /** The next-period effects of owned upgrades, aggregated per category. */
  readonly pendingEffects: readonly Readonly<{
    category: CompanyCostCategory;
    basisPoints: number;
    effectiveFromTick: number;
    effectiveFromPeriodId: string;
    upgradeIds: readonly string[];
  }>[];
  readonly refusals: Readonly<{
    total: number;
    byReason: Readonly<Record<CompanyEvolutionRefusalReason, number>>;
    last: CompanyEvolutionRefusal | null;
  }>;
  readonly counters: Readonly<{
    purchases: number;
    ownedUpgrades: number;
    investmentWrites: number;
    duplicateOperations: number;
    rejectedOperations: number;
    xpWrites: 0;
    profileWrites: 0;
    styleOverrides: 0;
    economyWrites: 0;
    historyScans: 0;
  }>;
  /** The unchanged 268 finance read model; PBI 270 consumes the same data. */
  readonly finance: CompanyFinanceSnapshot;
  readonly historyScans: 0;
}

export interface CompanyEvolutionOutcome {
  readonly status: 'ACCEPTED' | 'REJECTED';
  readonly reason: CompanyEvolutionRefusalReason | null;
  readonly detail: string | null;
  readonly purchase: CompanyVehiclePurchase | null;
  readonly upgrade: CompanyUpgradeOwnership | null;
  readonly read: CompanyEvolutionRead;
}

export interface CompanyEvolutionSnapshot {
  readonly version: typeof COMPANY_EVOLUTION_SNAPSHOT_VERSION;
  readonly evolutionVersion: typeof COMPANY_EVOLUTION_VERSION;
  readonly levelTableVersion: typeof COMPANY_LEVEL_TABLE_VERSION;
  readonly vehicleCatalogVersion: typeof COMPANY_VEHICLE_CATALOG_VERSION;
  readonly upgradeCatalogVersion: typeof COMPANY_UPGRADE_CATALOG_VERSION;
  readonly tick: number;
  readonly ledgerVersion: string;
  /** The 268 operating state must be restored by PBI 278 before this journal is replayed. */
  readonly ledger: Readonly<{
    cashBeforeInvestmentMinorUnits: number;
    profitHighWaterMinorUnits: number;
    investmentMinorUnits: number;
    vehiclePurchaseMinorUnits: number;
    upgradeInvestmentMinorUnits: number;
    cashMinorUnits: number;
  }>;
  readonly companyLevel: Readonly<{
    level: number;
    reinvestedProfitMinorUnits: number;
  }>;
  readonly purchases: readonly CompanyVehiclePurchase[];
  readonly upgrades: readonly CompanyUpgradeOwnership[];
  readonly refusals: Readonly<{
    total: number;
    byReason: Readonly<Record<CompanyEvolutionRefusalReason, number>>;
    last: CompanyEvolutionRefusal | null;
  }>;
  readonly counters: Readonly<{
    duplicateOperations: number;
    rejectedOperations: number;
  }>;
}

export interface CompanyEvolutionRestoreResult {
  readonly version: typeof COMPANY_EVOLUTION_VERSION;
  readonly restored: true;
  readonly purchases: number;
  readonly upgrades: number;
  readonly tick: number;
}

export interface CompanyEvolutionOptions {
  readonly ledger: CompanyLedger;
  /** The real 057 registry (or another port with the same shape); never a second registry. */
  readonly fleet?: CompanyFleetPort;
  readonly namespace?: string;
  readonly clock?: EconomyClock;
  readonly vehicleOffers?: readonly CompanyVehicleOffer[];
  readonly upgrades?: readonly CompanyUpgradeDefinition[];
}

export interface CompanyEvolution {
  readonly version: typeof COMPANY_EVOLUTION_VERSION;
  readonly ledger: CompanyLedger;
  readonly namespace: string;
  readonly clock: EconomyClock;
  readonly fleet: CompanyFleetPort | null;
  readonly vehicleOffers: readonly CompanyVehicleOffer[];
  readonly upgrades: readonly CompanyUpgradeDefinition[];
  purchase(offerId: unknown, atTick: unknown): CompanyEvolutionOutcome;
  upgrade(upgradeId: unknown, atTick: unknown): CompanyEvolutionOutcome;
  read(atTick?: unknown): CompanyEvolutionRead;
  snapshot(atTick: unknown): CompanyEvolutionSnapshot;
  /** Requires the 268 operating state to be restored first; see the snapshot documentation. */
  restore(snapshot: unknown): CompanyEvolutionRestoreResult;
  getStats(): Readonly<{
    version: typeof COMPANY_EVOLUTION_VERSION;
    purchases: number;
    upgrades: number;
    rejectedOperations: number;
    duplicateOperations: number;
    xpWrites: 0;
    profileWrites: 0;
    styleOverrides: 0;
    historyScans: 0;
    disposed: boolean;
  }>;
  dispose(): void;
}

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
  const result = text(value);
  requireContract(
    result.length > 0 &&
      result.length <= COMPANY_EVOLUTION_LIMITS.idCodeUnits &&
      result.trim() === result,
    `Invalid company evolution ${label}`,
  );
  return result;
}

function versionLabel(value: unknown, label: string): string {
  const result = text(value);
  requireContract(
    result.length > 0 &&
      result.length <= COMPANY_EVOLUTION_LIMITS.versionCodeUnits &&
      result.trim() === result,
    `Invalid company evolution ${label} version`,
  );
  return result;
}

function integer(value: unknown, minimum: number, maximum: number, label: string): number {
  const result = number(value, minimum, maximum);
  requireContract(Number.isSafeInteger(result), `${label} must be an integer`);
  return result;
}

function readCatalogOffer(value: unknown): CompanyVehicleOffer {
  const data = record(value, 'company vehicle offer');
  exactFields(
    data,
    [
      'offerId',
      'version',
      'classId',
      'driverKind',
      'costMinorUnits',
      'requiredLevel',
      'catalogVersion',
    ],
    ['offerId', 'version', 'classId', 'costMinorUnits', 'requiredLevel'],
    'company vehicle offer',
  );
  return Object.freeze({
    offerId: identity(data.offerId, 'vehicle offer'),
    version: versionLabel(data.version, 'vehicle offer'),
    classId: choice(data.classId, ['sedan', 'compact'] as const),
    driverKind: 'TAXI' as const,
    costMinorUnits: integer(data.costMinorUnits, 1, 1_000_000_000, 'Vehicle offer cost'),
    requiredLevel: integer(
      data.requiredLevel,
      1,
      COMPANY_EVOLUTION_LIMITS.levels,
      'Required level',
    ),
    catalogVersion:
      data.catalogVersion === undefined
        ? COMPANY_VEHICLE_CATALOG_VERSION
        : (versionLabel(
            data.catalogVersion,
            'vehicle catalog',
          ) as typeof COMPANY_VEHICLE_CATALOG_VERSION),
  });
}

function readUpgradeDefinition(value: unknown): CompanyUpgradeDefinition {
  const data = record(value, 'company upgrade definition');
  exactFields(
    data,
    ['upgradeId', 'version', 'requiredLevel', 'costMinorUnits', 'effect', 'catalogVersion'],
    ['upgradeId', 'version', 'requiredLevel', 'costMinorUnits', 'effect'],
    'company upgrade definition',
  );
  const effect = record(data.effect, 'company upgrade effect');
  exactFields(
    effect,
    ['kind', 'category', 'basisPoints'],
    ['kind', 'category', 'basisPoints'],
    'company upgrade effect',
  );
  requireContract(
    effect.kind === 'NEXT_PERIOD_COST_REDUCTION',
    'Company upgrade effect must be a next-period cost reduction',
  );
  const basisPoints = integer(
    effect.basisPoints,
    COMPANY_EVOLUTION_LIMITS.minimumBasisPoints,
    COMPANY_EVOLUTION_LIMITS.maximumBasisPoints,
    'Upgrade basis points',
  );
  return Object.freeze({
    upgradeId: identity(data.upgradeId, 'upgrade'),
    version: versionLabel(data.version, 'upgrade'),
    requiredLevel: integer(
      data.requiredLevel,
      1,
      COMPANY_EVOLUTION_LIMITS.levels,
      'Required level',
    ),
    costMinorUnits: integer(data.costMinorUnits, 1, 1_000_000_000, 'Upgrade cost'),
    effect: Object.freeze({
      kind: 'NEXT_PERIOD_COST_REDUCTION' as const,
      category: choice(effect.category, [
        'ENERGY',
        'MAINTENANCE',
        'INCIDENT',
        'SERVICE',
        'INSURANCE',
        'SALARIES',
        'LICENSES',
      ] as const),
      basisPoints,
    }),
    catalogVersion:
      data.catalogVersion === undefined
        ? COMPANY_UPGRADE_CATALOG_VERSION
        : (versionLabel(
            data.catalogVersion,
            'upgrade catalog',
          ) as typeof COMPANY_UPGRADE_CATALOG_VERSION),
  });
}

function zeroRefusals(): Record<CompanyEvolutionRefusalReason, number> {
  return {
    INSUFFICIENT_CASH: 0,
    LEVEL_REQUIRED: 0,
    ALREADY_OWNED: 0,
    FLEET_UNAVAILABLE: 0,
    FLEET_CAPACITY: 0,
    FLEET_REFUSED: 0,
    LEDGER_REJECTED: 0,
    INVALID_OFFER: 0,
    INVALID_INPUT: 0,
  };
}

function readPurchase(value: unknown): CompanyVehiclePurchase {
  const data = record(value, 'company vehicle purchase');
  exactFields(
    data,
    [
      'offerId',
      'version',
      'vehicleId',
      'slot',
      'classId',
      'driverKind',
      'costMinorUnits',
      'tick',
      'requiredLevel',
      'catalogVersion',
      'investmentId',
    ],
    [
      'offerId',
      'version',
      'vehicleId',
      'slot',
      'classId',
      'costMinorUnits',
      'tick',
      'requiredLevel',
      'investmentId',
    ],
    'company vehicle purchase',
  );
  requireContract(data.driverKind === 'TAXI', 'A company purchase must be a taxi');
  return Object.freeze({
    offerId: identity(data.offerId, 'purchase offer'),
    version: versionLabel(data.version, 'purchase offer'),
    vehicleId: identity(data.vehicleId, 'purchased vehicle'),
    slot: integer(data.slot, 1, FLEET_LIMITS.slotMaximum, 'Purchased vehicle slot'),
    classId: choice(data.classId, ['sedan', 'compact'] as const),
    driverKind: 'TAXI' as const,
    costMinorUnits: integer(data.costMinorUnits, 1, 1_000_000_000, 'Purchase cost'),
    tick: tick(data.tick),
    requiredLevel: integer(
      data.requiredLevel,
      1,
      COMPANY_EVOLUTION_LIMITS.levels,
      'Required level',
    ),
    catalogVersion:
      data.catalogVersion === undefined
        ? COMPANY_VEHICLE_CATALOG_VERSION
        : (versionLabel(
            data.catalogVersion,
            'vehicle catalog',
          ) as typeof COMPANY_VEHICLE_CATALOG_VERSION),
    investmentId: identity(data.investmentId, 'purchase investment'),
  });
}

function readUpgradeOwnership(value: unknown): CompanyUpgradeOwnership {
  const data = record(value, 'company upgrade ownership');
  exactFields(
    data,
    [
      'upgradeId',
      'version',
      'costMinorUnits',
      'tick',
      'requiredLevel',
      'category',
      'basisPoints',
      'effectiveFromTick',
      'effectiveFromPeriodId',
      'catalogVersion',
      'investmentId',
      'modifierId',
    ],
    [
      'upgradeId',
      'version',
      'costMinorUnits',
      'tick',
      'requiredLevel',
      'category',
      'basisPoints',
      'effectiveFromTick',
      'effectiveFromPeriodId',
      'investmentId',
      'modifierId',
    ],
    'company upgrade ownership',
  );
  return Object.freeze({
    upgradeId: identity(data.upgradeId, 'owned upgrade'),
    version: versionLabel(data.version, 'owned upgrade'),
    costMinorUnits: integer(data.costMinorUnits, 1, 1_000_000_000, 'Upgrade cost'),
    tick: tick(data.tick),
    requiredLevel: integer(
      data.requiredLevel,
      1,
      COMPANY_EVOLUTION_LIMITS.levels,
      'Required level',
    ),
    category: choice(data.category, [
      'ENERGY',
      'MAINTENANCE',
      'INCIDENT',
      'SERVICE',
      'INSURANCE',
      'SALARIES',
      'LICENSES',
    ] as const),
    basisPoints: integer(
      data.basisPoints,
      COMPANY_EVOLUTION_LIMITS.minimumBasisPoints,
      COMPANY_EVOLUTION_LIMITS.maximumBasisPoints,
      'Upgrade basis points',
    ),
    effectiveFromTick: tick(data.effectiveFromTick),
    effectiveFromPeriodId: identity(data.effectiveFromPeriodId, 'upgrade period'),
    catalogVersion:
      data.catalogVersion === undefined
        ? COMPANY_UPGRADE_CATALOG_VERSION
        : (versionLabel(
            data.catalogVersion,
            'upgrade catalog',
          ) as typeof COMPANY_UPGRADE_CATALOG_VERSION),
    investmentId: identity(data.investmentId, 'upgrade investment'),
    modifierId: identity(data.modifierId, 'upgrade modifier'),
  });
}

function readRefusal(value: unknown): CompanyEvolutionRefusal {
  const data = record(value, 'company evolution refusal');
  exactFields(
    data,
    ['reason', 'detail', 'offerId', 'tick'],
    ['reason', 'tick'],
    'company evolution refusal',
  );
  return Object.freeze({
    reason: choice(data.reason, companyEvolutionRefusalReasons),
    detail: data.detail === null || data.detail === undefined ? null : text(data.detail),
    offerId: data.offerId === null || data.offerId === undefined ? null : text(data.offerId),
    tick: tick(data.tick),
  });
}

function readRefusalCounts(value: unknown): Record<CompanyEvolutionRefusalReason, number> {
  const data = record(value, 'company evolution refusal counts'),
    counts = zeroRefusals();
  for (const key of Object.keys(data)) {
    requireContract(
      (companyEvolutionRefusalReasons as readonly string[]).includes(key),
      `Unknown company evolution refusal count: ${key}`,
    );
    counts[key as CompanyEvolutionRefusalReason] = integer(
      data[key],
      0,
      Number.MAX_SAFE_INTEGER,
      'Company evolution refusal count',
    );
  }
  return counts;
}

/** Next simulated month start; an upgrade never changes the period that paid for it. */
export function companyUpgradeEffectiveTick(atTick: number, clock: EconomyClock): number {
  return economyPeriod(atTick, 'MONTH', clock).endTick;
}

function periodIdFor(atTick: number, clock: EconomyClock): string {
  return economyPeriod(atTick, 'MONTH', clock).periodId;
}

function outcome(
  status: CompanyEvolutionOutcome['status'],
  reason: CompanyEvolutionRefusalReason | null,
  detail: string | null,
  purchase: CompanyVehiclePurchase | null,
  upgrade: CompanyUpgradeOwnership | null,
  read: CompanyEvolutionRead,
): CompanyEvolutionOutcome {
  return Object.freeze({ status, reason, detail, purchase, upgrade, read });
}

export function createCompanyEvolution(options: CompanyEvolutionOptions): CompanyEvolution {
  const ledger = options.ledger,
    fleet = options.fleet ?? null,
    clock = options.clock ?? ledger.clock ?? ECONOMY_CLOCK,
    namespace =
      options.namespace === undefined
        ? 'city:company:evolution'
        : identity(options.namespace, 'namespace'),
    vehicleOffers = Object.freeze(
      (options.vehicleOffers ?? COMPANY_VEHICLE_OFFERS).map(readCatalogOffer),
    ),
    upgrades = Object.freeze((options.upgrades ?? COMPANY_UPGRADES).map(readUpgradeDefinition));
  requireContract(
    vehicleOffers.length <= COMPANY_EVOLUTION_LIMITS.vehicleOffers,
    'Company vehicle offer catalog is too large',
  );
  requireContract(
    upgrades.length <= COMPANY_EVOLUTION_LIMITS.upgrades,
    'Company upgrade catalog is too large',
  );
  requireContract(
    new Set(vehicleOffers.map((offer) => offer.offerId)).size === vehicleOffers.length,
    'Company vehicle offer catalog contains duplicates',
  );
  requireContract(
    new Set(upgrades.map((upgrade) => upgrade.upgradeId)).size === upgrades.length,
    'Company upgrade catalog contains duplicates',
  );
  const offerById = new Map(vehicleOffers.map((offer) => [offer.offerId, offer])),
    upgradeById = new Map(upgrades.map((upgrade) => [upgrade.upgradeId, upgrade])),
    purchases = new Map<string, CompanyVehiclePurchase>(),
    purchaseOrder: string[] = [],
    ownedUpgrades = new Map<string, CompanyUpgradeOwnership>(),
    upgradeOrder: string[] = [],
    refusalCounts = zeroRefusals();
  let lastRefusal: CompanyEvolutionRefusal | null = null,
    rejectedOperations = 0,
    duplicateOperations = 0,
    disposed = false,
    lastTick = 0;

  function assertLive(): void {
    if (disposed) throw new Error('Company evolution disposed');
  }

  function totals(): CompanyLedgerTotals {
    return ledger.totals();
  }

  function levelOf(totalsValue: CompanyLedgerTotals = totals()): CompanyLevelProgress {
    return companyLevelProgress(totalsValue.reinvestedProfitMinorUnits);
  }

  function noteTick(atTick: number): void {
    lastTick = Math.max(lastTick, atTick);
  }

  function refusal(
    reason: CompanyEvolutionRefusalReason,
    detail: string | null,
    offerId: string | null,
    atTick: number,
    duplicate = false,
  ): void {
    if (duplicate) duplicateOperations += 1;
    else rejectedOperations += 1;
    refusalCounts[reason] += 1;
    lastRefusal = Object.freeze({ reason, detail, offerId, tick: atTick });
  }

  function purchaseState(
    offer: CompanyVehicleOffer,
    totalsValue: CompanyLedgerTotals,
  ): CompanyOfferState {
    if (purchases.has(offer.offerId)) return 'OWNED';
    if (levelOf(totalsValue).level < offer.requiredLevel) return 'LEVEL_REQUIRED';
    if (totalsValue.cashMinorUnits < offer.costMinorUnits) return 'INSUFFICIENT_CASH';
    if (fleet === null) return 'FLEET_UNAVAILABLE';
    if (fleet.counts().taxis >= FLEET_LIMITS.taxisMaximum) return 'FLEET_CAPACITY';
    return 'AVAILABLE';
  }

  function upgradeState(
    upgrade: CompanyUpgradeDefinition,
    totalsValue: CompanyLedgerTotals,
  ): CompanyOfferState {
    if (ownedUpgrades.has(upgrade.upgradeId)) return 'OWNED';
    if (levelOf(totalsValue).level < upgrade.requiredLevel) return 'LEVEL_REQUIRED';
    if (totalsValue.cashMinorUnits < upgrade.costMinorUnits) return 'INSUFFICIENT_CASH';
    return 'AVAILABLE';
  }

  function read(atTickValue: unknown = lastTick): CompanyEvolutionRead {
    assertLive();
    const at = tick(atTickValue),
      totalsValue = totals(),
      level = levelOf(totalsValue),
      finance = ledger.read(at),
      offerViews = vehicleOffers.map((offer) => {
        const purchase = purchases.get(offer.offerId) ?? null,
          state = purchaseState(offer, totalsValue);
        return Object.freeze({
          offer,
          state,
          purchase,
          refusal:
            state === 'OWNED'
              ? ('ALREADY_OWNED' as const)
              : state === 'LEVEL_REQUIRED'
                ? ('LEVEL_REQUIRED' as const)
                : state === 'INSUFFICIENT_CASH'
                  ? ('INSUFFICIENT_CASH' as const)
                  : state === 'FLEET_CAPACITY'
                    ? ('FLEET_CAPACITY' as const)
                    : state === 'FLEET_UNAVAILABLE'
                      ? ('FLEET_UNAVAILABLE' as const)
                      : null,
        });
      }),
      upgradeViews = upgrades.map((upgrade) => {
        const ownership = ownedUpgrades.get(upgrade.upgradeId) ?? null,
          state = upgradeState(upgrade, totalsValue);
        return Object.freeze({
          upgrade,
          state,
          ownership,
          refusal:
            state === 'OWNED'
              ? ('ALREADY_OWNED' as const)
              : state === 'LEVEL_REQUIRED'
                ? ('LEVEL_REQUIRED' as const)
                : state === 'INSUFFICIENT_CASH'
                  ? ('INSUFFICIENT_CASH' as const)
                  : null,
          effective: ownership !== null && at >= ownership.effectiveFromTick,
        });
      }),
      pending = new Map<
        CompanyCostCategory,
        {
          basisPoints: number;
          effectiveFromTick: number;
          effectiveFromPeriodId: string;
          upgradeIds: string[];
        }
      >();
    for (const ownership of ownedUpgrades.values()) {
      if (at >= ownership.effectiveFromTick) continue;
      const entry = pending.get(ownership.category) ?? {
        basisPoints: COMPANY_EVOLUTION_LIMITS.maximumBasisPoints,
        effectiveFromTick: ownership.effectiveFromTick,
        effectiveFromPeriodId: ownership.effectiveFromPeriodId,
        upgradeIds: [],
      };
      entry.basisPoints = Math.min(entry.basisPoints, ownership.basisPoints);
      entry.effectiveFromTick = Math.min(entry.effectiveFromTick, ownership.effectiveFromTick);
      entry.upgradeIds.push(ownership.upgradeId);
      pending.set(ownership.category, entry);
    }
    return Object.freeze({
      version: COMPANY_EVOLUTION_VERSION,
      tick: at,
      currency: totalsValue.currency,
      companyLevel: Object.freeze({
        tableVersion: COMPANY_LEVEL_TABLE_VERSION,
        level: level.level,
        maxLevel: level.maxLevel,
        reinvestedProfitMinorUnits: level.reinvestedProfitMinorUnits,
        profitHighWaterMinorUnits: totalsValue.profitHighWaterMinorUnits,
        currentThresholdMinorUnits: level.currentThresholdMinorUnits,
        nextThresholdMinorUnits: level.nextThresholdMinorUnits,
        toNextLevelMinorUnits: level.toNextLevelMinorUnits,
        progressBasisPoints: level.progressBasisPoints,
        xpLevelUsed: false as const,
      }),
      cash: Object.freeze({
        currency: totalsValue.currency,
        initialCashMinorUnits: totalsValue.initialCashMinorUnits,
        revenueMinorUnits: totalsValue.revenueMinorUnits,
        profitMinorUnits: totalsValue.profitMinorUnits,
        cashBeforeInvestmentMinorUnits: totalsValue.cashBeforeInvestmentMinorUnits,
        investmentMinorUnits: totalsValue.investmentMinorUnits,
        vehicleInvestmentMinorUnits: totalsValue.vehiclePurchaseMinorUnits,
        upgradeInvestmentMinorUnits: totalsValue.upgradeInvestmentMinorUnits,
        cashMinorUnits: totalsValue.cashMinorUnits,
        uncoveredLossMinorUnits: totalsValue.uncoveredLossMinorUnits,
        formula: 'initialCash + profit - investments, clamped at zero' as const,
      }),
      fleet: Object.freeze({
        taxis: fleet?.counts().taxis ?? 0,
        civilians: fleet?.counts().civilians ?? 0,
        vehicles: fleet?.counts().vehicles ?? 0,
        purchasedTaxis: purchases.size,
        capacityTaxis: FLEET_LIMITS.taxisMaximum,
        capacityRemaining:
          fleet === null ? 0 : Math.max(0, FLEET_LIMITS.taxisMaximum - fleet.counts().taxis),
        fleetValueMinorUnits: totalsValue.vehiclePurchaseMinorUnits,
        purchased: Object.freeze(
          [...purchases.values()].map((purchase) =>
            Object.freeze({
              vehicleId: purchase.vehicleId,
              slot: purchase.slot,
              classId: purchase.classId,
              offerId: purchase.offerId,
              simulated: fleet?.hasActor === undefined ? null : fleet.hasActor(purchase.vehicleId),
            }),
          ),
        ),
      }),
      offers: Object.freeze(offerViews),
      upgrades: Object.freeze(upgradeViews),
      pendingEffects: Object.freeze(
        [...pending.entries()].map(([category, effect]) =>
          Object.freeze({
            category,
            basisPoints: effect.basisPoints,
            effectiveFromTick: effect.effectiveFromTick,
            effectiveFromPeriodId: effect.effectiveFromPeriodId,
            upgradeIds: Object.freeze([...effect.upgradeIds].sort()),
          }),
        ),
      ),
      refusals: Object.freeze({
        total: Object.values(refusalCounts).reduce((sum, value) => sum + value, 0),
        byReason: Object.freeze({ ...refusalCounts }),
        last: lastRefusal,
      }),
      counters: Object.freeze({
        purchases: purchases.size,
        ownedUpgrades: ownedUpgrades.size,
        investmentWrites: totalsValue.investments,
        duplicateOperations,
        rejectedOperations,
        xpWrites: 0 as const,
        profileWrites: 0 as const,
        styleOverrides: 0 as const,
        economyWrites: 0 as const,
        historyScans: 0 as const,
      }),
      finance,
      historyScans: 0 as const,
    });
  }

  function applyPurchase(
    offer: CompanyVehicleOffer,
    atTick: number,
    restoreMode: boolean,
    expectedVehicle: CompanyVehiclePurchase | null = null,
  ): CompanyVehiclePurchase {
    const totalsValue = totals();
    if (!restoreMode && levelOf(totalsValue).level < offer.requiredLevel)
      throw new RangeError('Company level required for vehicle purchase');
    if (totalsValue.cashMinorUnits < offer.costMinorUnits)
      throw new RangeError('Insufficient company cash for vehicle purchase');
    if (fleet === null) throw new RangeError('Company fleet port is unavailable');
    if (purchases.has(offer.offerId)) throw new RangeError('Vehicle offer already owned');
    // A 278 reload may restore the live fleet with the purchased taxi already present. In that case
    // the journal is adopted against the real vehicle; a fresh fleet still receives the new taxi.
    const existing =
      restoreMode && expectedVehicle !== null ? fleet.get?.(expectedVehicle.vehicleId) : undefined;
    if (existing !== undefined) {
      requireContract(
        existing.driverKind === 'TAXI' &&
          existing.slot === expectedVehicle!.slot &&
          existing.classId === offer.classId,
        'Restored fleet vehicle differs from the saved purchase',
      );
    } else if (fleet.counts().taxis >= FLEET_LIMITS.taxisMaximum)
      throw new RangeError('Company fleet taxi capacity exceeded');
    const vehicle = existing ?? fleet.addVehicle(offer.driverKind, offer.classId, { tick: atTick }),
      vehicleAdded = existing === undefined;
    try {
      const investment = ledger.invest({
        kind: 'VEHICLE_PURCHASE',
        referenceId: offer.offerId,
        amountMinorUnits: offer.costMinorUnits,
        tick: atTick,
        investmentModelVersion: COMPANY_INVESTMENT_MODEL_VERSION,
      });
      if (investment.status !== 'ACCEPTED' || investment.investment === null)
        throw new RangeError(
          `Company ledger refused the purchase: ${investment.reason ?? 'UNKNOWN'}`,
        );
      const purchase: CompanyVehiclePurchase = Object.freeze({
        offerId: offer.offerId,
        version: offer.version,
        vehicleId: identity(vehicle.vehicleId, 'purchased vehicle'),
        slot: integer(vehicle.slot, 1, FLEET_LIMITS.slotMaximum, 'Purchased vehicle slot'),
        classId: offer.classId,
        driverKind: 'TAXI' as const,
        costMinorUnits: offer.costMinorUnits,
        tick: atTick,
        requiredLevel: offer.requiredLevel,
        catalogVersion: offer.catalogVersion,
        investmentId: investment.investment.investmentId,
      });
      purchases.set(purchase.offerId, purchase);
      purchaseOrder.push(purchase.offerId);
      noteTick(atTick);
      return purchase;
    } catch (error) {
      if (vehicleAdded) fleet.removeVehicle?.(vehicle.vehicleId);
      throw error;
    }
  }

  function applyUpgrade(
    upgrade: CompanyUpgradeDefinition,
    atTick: number,
    restoreMode: boolean,
  ): CompanyUpgradeOwnership {
    const totalsValue = totals();
    if (!restoreMode && levelOf(totalsValue).level < upgrade.requiredLevel)
      throw new RangeError('Company level required for upgrade');
    if (totalsValue.cashMinorUnits < upgrade.costMinorUnits)
      throw new RangeError('Insufficient company cash for upgrade');
    if (ownedUpgrades.has(upgrade.upgradeId)) throw new RangeError('Company upgrade already owned');
    const effectiveFromTick = companyUpgradeEffectiveTick(atTick, clock),
      investment = ledger.invest({
        kind: 'UPGRADE',
        referenceId: upgrade.upgradeId,
        amountMinorUnits: upgrade.costMinorUnits,
        tick: atTick,
        investmentModelVersion: COMPANY_INVESTMENT_MODEL_VERSION,
        effect: {
          version: upgrade.version,
          category: upgrade.effect.category,
          basisPoints: upgrade.effect.basisPoints,
          effectiveFromTick,
        },
      });
    if (
      investment.status !== 'ACCEPTED' ||
      investment.investment === null ||
      investment.modifier === null
    )
      throw new RangeError(`Company ledger refused the upgrade: ${investment.reason ?? 'UNKNOWN'}`);
    const ownership: CompanyUpgradeOwnership = Object.freeze({
      upgradeId: upgrade.upgradeId,
      version: upgrade.version,
      costMinorUnits: upgrade.costMinorUnits,
      tick: atTick,
      requiredLevel: upgrade.requiredLevel,
      category: upgrade.effect.category,
      basisPoints: upgrade.effect.basisPoints,
      effectiveFromTick,
      effectiveFromPeriodId: periodIdFor(effectiveFromTick, clock),
      catalogVersion: upgrade.catalogVersion,
      investmentId: investment.investment.investmentId,
      modifierId: investment.modifier.modifierId,
    });
    ownedUpgrades.set(ownership.upgradeId, ownership);
    upgradeOrder.push(ownership.upgradeId);
    noteTick(atTick);
    return ownership;
  }

  function purchase(offerIdValue: unknown, atTickValue: unknown): CompanyEvolutionOutcome {
    assertLive();
    const atTick = tick(atTickValue);
    if (atTick < lastTick) {
      refusal('INVALID_INPUT', 'Stale company evolution tick', null, atTick);
      return outcome(
        'REJECTED',
        'INVALID_INPUT',
        'Stale company evolution tick',
        null,
        null,
        read(atTick),
      );
    }
    noteTick(atTick);
    const offerId = typeof offerIdValue === 'string' ? offerIdValue : '',
      offer = offerById.get(offerId);
    if (offer === undefined) {
      refusal('INVALID_OFFER', `Unknown vehicle offer: ${offerId || '<empty>'}`, null, atTick);
      return outcome(
        'REJECTED',
        'INVALID_OFFER',
        'Unknown vehicle offer',
        null,
        null,
        read(atTick),
      );
    }
    const state = purchaseState(offer, totals());
    if (state !== 'AVAILABLE') {
      refusal(
        state === 'OWNED'
          ? 'ALREADY_OWNED'
          : state === 'LEVEL_REQUIRED'
            ? 'LEVEL_REQUIRED'
            : state === 'INSUFFICIENT_CASH'
              ? 'INSUFFICIENT_CASH'
              : state === 'FLEET_CAPACITY'
                ? 'FLEET_CAPACITY'
                : 'FLEET_UNAVAILABLE',
        null,
        offer.offerId,
        atTick,
        state === 'OWNED',
      );
      return outcome('REJECTED', lastRefusal!.reason, null, null, null, read(atTick));
    }
    try {
      const purchaseEntry = applyPurchase(offer, atTick, false);
      return outcome('ACCEPTED', null, null, purchaseEntry, null, read(atTick));
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error),
        reason: CompanyEvolutionRefusalReason = detail.includes('cash')
          ? 'INSUFFICIENT_CASH'
          : detail.includes('level')
            ? 'LEVEL_REQUIRED'
            : detail.includes('ledger')
              ? 'LEDGER_REJECTED'
              : 'FLEET_REFUSED';
      refusal(reason, detail, offer.offerId, atTick);
      return outcome('REJECTED', reason, detail, null, null, read(atTick));
    }
  }

  function upgrade(upgradeIdValue: unknown, atTickValue: unknown): CompanyEvolutionOutcome {
    assertLive();
    const atTick = tick(atTickValue);
    if (atTick < lastTick) {
      refusal('INVALID_INPUT', 'Stale company evolution tick', null, atTick);
      return outcome(
        'REJECTED',
        'INVALID_INPUT',
        'Stale company evolution tick',
        null,
        null,
        read(atTick),
      );
    }
    noteTick(atTick);
    const upgradeId = typeof upgradeIdValue === 'string' ? upgradeIdValue : '',
      definition = upgradeById.get(upgradeId);
    if (definition === undefined) {
      refusal('INVALID_OFFER', `Unknown upgrade: ${upgradeId || '<empty>'}`, null, atTick);
      return outcome('REJECTED', 'INVALID_OFFER', 'Unknown upgrade', null, null, read(atTick));
    }
    const state = upgradeState(definition, totals());
    if (state !== 'AVAILABLE') {
      refusal(
        state === 'OWNED'
          ? 'ALREADY_OWNED'
          : state === 'LEVEL_REQUIRED'
            ? 'LEVEL_REQUIRED'
            : 'INSUFFICIENT_CASH',
        null,
        definition.upgradeId,
        atTick,
        state === 'OWNED',
      );
      return outcome('REJECTED', lastRefusal!.reason, null, null, null, read(atTick));
    }
    try {
      const ownership = applyUpgrade(definition, atTick, false);
      return outcome('ACCEPTED', null, null, null, ownership, read(atTick));
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error),
        reason: CompanyEvolutionRefusalReason = detail.includes('cash')
          ? 'INSUFFICIENT_CASH'
          : detail.includes('level')
            ? 'LEVEL_REQUIRED'
            : 'LEDGER_REJECTED';
      refusal(reason, detail, definition.upgradeId, atTick);
      return outcome('REJECTED', reason, detail, null, null, read(atTick));
    }
  }

  function snapshot(atTickValue: unknown): CompanyEvolutionSnapshot {
    assertLive();
    const at = tick(atTickValue),
      totalsValue = totals(),
      level = levelOf(totalsValue);
    return Object.freeze({
      version: COMPANY_EVOLUTION_SNAPSHOT_VERSION,
      evolutionVersion: COMPANY_EVOLUTION_VERSION,
      levelTableVersion: COMPANY_LEVEL_TABLE_VERSION,
      vehicleCatalogVersion: COMPANY_VEHICLE_CATALOG_VERSION,
      upgradeCatalogVersion: COMPANY_UPGRADE_CATALOG_VERSION,
      tick: at,
      ledgerVersion: ledger.version,
      ledger: Object.freeze({
        cashBeforeInvestmentMinorUnits: totalsValue.cashBeforeInvestmentMinorUnits,
        profitHighWaterMinorUnits: totalsValue.profitHighWaterMinorUnits,
        investmentMinorUnits: totalsValue.investmentMinorUnits,
        vehiclePurchaseMinorUnits: totalsValue.vehiclePurchaseMinorUnits,
        upgradeInvestmentMinorUnits: totalsValue.upgradeInvestmentMinorUnits,
        cashMinorUnits: totalsValue.cashMinorUnits,
      }),
      companyLevel: Object.freeze({
        level: level.level,
        reinvestedProfitMinorUnits: level.reinvestedProfitMinorUnits,
      }),
      purchases: Object.freeze([...purchases.values()]),
      upgrades: Object.freeze([...ownedUpgrades.values()]),
      refusals: Object.freeze({
        total: Object.values(refusalCounts).reduce((sum, value) => sum + value, 0),
        byReason: Object.freeze({ ...refusalCounts }),
        last: lastRefusal,
      }),
      counters: Object.freeze({ duplicateOperations, rejectedOperations }),
    });
  }

  function restore(value: unknown): CompanyEvolutionRestoreResult {
    assertLive();
    const data = record(value, 'company evolution snapshot');
    exactFields(
      data,
      [
        'version',
        'evolutionVersion',
        'levelTableVersion',
        'vehicleCatalogVersion',
        'upgradeCatalogVersion',
        'tick',
        'ledgerVersion',
        'ledger',
        'companyLevel',
        'purchases',
        'upgrades',
        'refusals',
        'counters',
      ],
      [
        'version',
        'evolutionVersion',
        'levelTableVersion',
        'vehicleCatalogVersion',
        'upgradeCatalogVersion',
        'tick',
        'ledgerVersion',
        'ledger',
        'companyLevel',
        'purchases',
        'upgrades',
      ],
      'company evolution snapshot',
    );
    requireContract(
      data.version === COMPANY_EVOLUTION_SNAPSHOT_VERSION,
      'Unknown company evolution snapshot version',
    );
    requireContract(
      data.evolutionVersion === COMPANY_EVOLUTION_VERSION &&
        data.levelTableVersion === COMPANY_LEVEL_TABLE_VERSION &&
        data.vehicleCatalogVersion === COMPANY_VEHICLE_CATALOG_VERSION &&
        data.upgradeCatalogVersion === COMPANY_UPGRADE_CATALOG_VERSION,
      'Company evolution snapshot belongs to another contract',
    );
    requireContract(
      data.ledgerVersion === ledger.version,
      'Company evolution snapshot belongs to another company ledger',
    );
    requireContract(
      purchases.size === 0 && ownedUpgrades.size === 0,
      'Company evolution restore requires an empty journal',
    );
    const at = tick(data.tick),
      ledgerState = record(data.ledger, 'company evolution ledger state'),
      levelState = record(data.companyLevel, 'company evolution level state');
    exactFields(
      ledgerState,
      [
        'cashBeforeInvestmentMinorUnits',
        'profitHighWaterMinorUnits',
        'investmentMinorUnits',
        'vehiclePurchaseMinorUnits',
        'upgradeInvestmentMinorUnits',
        'cashMinorUnits',
      ],
      [
        'cashBeforeInvestmentMinorUnits',
        'profitHighWaterMinorUnits',
        'investmentMinorUnits',
        'vehiclePurchaseMinorUnits',
        'upgradeInvestmentMinorUnits',
        'cashMinorUnits',
      ],
      'company evolution ledger state',
    );
    exactFields(
      levelState,
      ['level', 'reinvestedProfitMinorUnits'],
      ['level', 'reinvestedProfitMinorUnits'],
      'company evolution level state',
    );
    const expectedCashBefore = integer(
        ledgerState.cashBeforeInvestmentMinorUnits,
        0,
        Number.MAX_SAFE_INTEGER,
        'Restored cash before investments',
      ),
      expectedHighWater = integer(
        ledgerState.profitHighWaterMinorUnits,
        0,
        Number.MAX_SAFE_INTEGER,
        'Restored profit high-water',
      ),
      expectedInvestment = integer(
        ledgerState.investmentMinorUnits,
        0,
        Number.MAX_SAFE_INTEGER,
        'Restored investment total',
      ),
      expectedVehicleInvestment = integer(
        ledgerState.vehiclePurchaseMinorUnits,
        0,
        Number.MAX_SAFE_INTEGER,
        'Restored vehicle investment',
      ),
      expectedUpgradeInvestment = integer(
        ledgerState.upgradeInvestmentMinorUnits,
        0,
        Number.MAX_SAFE_INTEGER,
        'Restored upgrade investment',
      ),
      expectedCash = integer(
        ledgerState.cashMinorUnits,
        0,
        Number.MAX_SAFE_INTEGER,
        'Restored cash',
      ),
      expectedLevel = integer(
        levelState.level,
        1,
        COMPANY_EVOLUTION_LIMITS.levels,
        'Restored level',
      ),
      expectedReinvested = integer(
        levelState.reinvestedProfitMinorUnits,
        0,
        Number.MAX_SAFE_INTEGER,
        'Restored reinvested profit',
      ),
      current = totals(),
      ledgerAlreadyInvested = current.investmentMinorUnits > 0;
    requireContract(
      current.cashBeforeInvestmentMinorUnits === expectedCashBefore &&
        current.profitHighWaterMinorUnits === expectedHighWater,
      'The 268 ledger operating state must be restored before the company evolution',
    );
    if (ledgerAlreadyInvested)
      requireContract(
        current.investmentMinorUnits === expectedInvestment &&
          current.vehiclePurchaseMinorUnits === expectedVehicleInvestment &&
          current.upgradeInvestmentMinorUnits === expectedUpgradeInvestment &&
          current.cashMinorUnits === expectedCash,
        'Company evolution restore ledger investments do not match the snapshot',
      );
    requireContract(Array.isArray(data.purchases), 'Company evolution purchases must be a list');
    requireContract(Array.isArray(data.upgrades), 'Company evolution upgrades must be a list');
    requireContract(
      data.purchases.length <= COMPANY_EVOLUTION_LIMITS.purchases &&
        data.upgrades.length <= COMPANY_EVOLUTION_LIMITS.ownedUpgrades,
      'Company evolution snapshot journal is too large',
    );
    const restoredPurchases = data.purchases.map(readPurchase),
      restoredUpgrades = data.upgrades.map(readUpgradeOwnership);
    for (const entry of restoredPurchases) {
      const offer = offerById.get(entry.offerId);
      requireContract(
        offer !== undefined,
        `Restored purchase has no catalog offer: ${entry.offerId}`,
      );
      requireContract(
        offer.costMinorUnits === entry.costMinorUnits &&
          offer.classId === entry.classId &&
          offer.requiredLevel === entry.requiredLevel,
        `Restored purchase differs from the catalog: ${entry.offerId}`,
      );
    }
    for (const entry of restoredUpgrades) {
      const definition = upgradeById.get(entry.upgradeId);
      requireContract(
        definition !== undefined,
        `Restored upgrade has no catalog definition: ${entry.upgradeId}`,
      );
      requireContract(
        definition.costMinorUnits === entry.costMinorUnits &&
          definition.requiredLevel === entry.requiredLevel &&
          definition.effect.category === entry.category &&
          definition.effect.basisPoints === entry.basisPoints,
        `Restored upgrade differs from the catalog: ${entry.upgradeId}`,
      );
    }
    const totalSpend =
      restoredPurchases.reduce((sum, entry) => sum + entry.costMinorUnits, 0) +
      restoredUpgrades.reduce((sum, entry) => sum + entry.costMinorUnits, 0);
    requireContract(
      totalSpend === expectedInvestment && totalSpend <= expectedCashBefore,
      'Restored company evolution spend does not match the ledger state',
    );
    if (ledgerAlreadyInvested) {
      if (fleet === null && restoredPurchases.length > 0)
        throw new RangeError('Company evolution restore needs the real fleet port');
      for (const entry of restoredPurchases) {
        const investment = ledger.investmentFor(entry.offerId),
          vehicle = fleet?.get?.(entry.vehicleId);
        requireContract(
          investment !== undefined &&
            investment.kind === 'VEHICLE_PURCHASE' &&
            investment.amountMinorUnits === entry.costMinorUnits &&
            investment.investmentId === entry.investmentId,
          `Restored purchase ledger entry differs: ${entry.offerId}`,
        );
        requireContract(
          vehicle !== undefined &&
            vehicle.driverKind === 'TAXI' &&
            vehicle.slot === entry.slot &&
            vehicle.classId === entry.classId,
          `Restored fleet vehicle is missing or differs: ${entry.vehicleId}`,
        );
        purchases.set(entry.offerId, entry);
        purchaseOrder.push(entry.offerId);
      }
      for (const entry of restoredUpgrades) {
        const investment = ledger.investmentFor(entry.upgradeId),
          modifier = ledger.costModifier(entry.modifierId);
        requireContract(
          investment !== undefined &&
            investment.kind === 'UPGRADE' &&
            investment.amountMinorUnits === entry.costMinorUnits &&
            investment.investmentId === entry.investmentId,
          `Restored upgrade ledger entry differs: ${entry.upgradeId}`,
        );
        requireContract(
          modifier !== undefined &&
            modifier.version === entry.version &&
            modifier.category === entry.category &&
            modifier.basisPoints === entry.basisPoints &&
            modifier.effectiveFromTick === entry.effectiveFromTick &&
            modifier.investmentId === entry.investmentId,
          `Restored upgrade modifier differs: ${entry.upgradeId}`,
        );
        ownedUpgrades.set(entry.upgradeId, entry);
        upgradeOrder.push(entry.upgradeId);
      }
    }
    if (!ledgerAlreadyInvested && fleet === null && restoredPurchases.length > 0)
      throw new RangeError('Company evolution restore needs the real fleet port');
    if (!ledgerAlreadyInvested && fleet !== null) {
      const alreadyRestored = restoredPurchases.map((entry) => fleet.get?.(entry.vehicleId)),
        present = alreadyRestored.filter((vehicle) => vehicle !== undefined).length;
      requireContract(
        present === 0 || present === restoredPurchases.length,
        'Company evolution restore received a partially restored fleet',
      );
      if (present === restoredPurchases.length) {
        restoredPurchases.forEach((entry, index) => {
          const vehicle = alreadyRestored[index]!;
          requireContract(
            vehicle.driverKind === 'TAXI' &&
              vehicle.slot === entry.slot &&
              vehicle.classId === entry.classId,
            `Restored fleet vehicle differs from the saved purchase: ${entry.vehicleId}`,
          );
        });
      } else {
        const existing = fleet.list?.() ?? [];
        let nextSlot =
            existing
              .filter((vehicle) => vehicle.driverKind === 'TAXI')
              .reduce((maximum, vehicle) => Math.max(maximum, vehicle.slot), 0) + 1,
          spend = 0;
        for (const entry of restoredPurchases) {
          requireContract(
            fleet.counts().taxis + 1 <= FLEET_LIMITS.taxisMaximum,
            'Company evolution restore exceeds the 057 taxi capacity',
          );
          requireContract(
            entry.slot === nextSlot,
            `Restored vehicle slot ${entry.slot} does not follow the real fleet slot ${nextSlot}`,
          );
          nextSlot += 1;
          spend += entry.costMinorUnits;
        }
        for (const entry of restoredUpgrades) spend += entry.costMinorUnits;
        requireContract(
          spend <= expectedCashBefore,
          'Company evolution restore spends more cash than the restored ledger holds',
        );
      }
    }
    if (!ledgerAlreadyInvested) {
      const sortedPurchases = [...restoredPurchases].sort((left, right) => left.tick - right.tick),
        sortedUpgrades = [...restoredUpgrades].sort((left, right) => left.tick - right.tick);
      for (const entry of sortedPurchases) {
        const offer = offerById.get(entry.offerId)!;
        try {
          const created = applyPurchase(offer, entry.tick, true, entry);
          requireContract(
            created.vehicleId === entry.vehicleId && created.slot === entry.slot,
            'Restored vehicle identity/slot differs from the saved purchase',
          );
        } catch (error: unknown) {
          throw new Error(
            `Company evolution restore failed for ${entry.offerId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      for (const entry of sortedUpgrades) {
        const definition = upgradeById.get(entry.upgradeId)!;
        try {
          const created = applyUpgrade(definition, entry.tick, true);
          requireContract(
            created.effectiveFromTick === entry.effectiveFromTick &&
              created.effectiveFromPeriodId === entry.effectiveFromPeriodId &&
              created.modifierId === entry.modifierId,
            'Restored upgrade effect differs from the saved effect',
          );
        } catch (error: unknown) {
          throw new Error(
            `Company evolution restore failed for ${entry.upgradeId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }
    const after = totals(),
      afterLevel = levelOf(after);
    requireContract(
      after.investmentMinorUnits === expectedInvestment &&
        after.vehiclePurchaseMinorUnits === expectedVehicleInvestment &&
        after.upgradeInvestmentMinorUnits === expectedUpgradeInvestment &&
        after.cashMinorUnits === expectedCash &&
        afterLevel.level === expectedLevel &&
        afterLevel.reinvestedProfitMinorUnits === expectedReinvested,
      'Company evolution restore does not reproduce the saved cash and level',
    );
    if (data.refusals !== undefined) {
      const refusals = record(data.refusals, 'company evolution refusals');
      if (refusals.byReason !== undefined)
        Object.assign(refusalCounts, readRefusalCounts(refusals.byReason));
      if (refusals.last !== undefined && refusals.last !== null)
        lastRefusal = readRefusal(refusals.last);
    }
    if (data.counters !== undefined) {
      const counters = record(data.counters, 'company evolution counters');
      if (counters.duplicateOperations !== undefined)
        duplicateOperations = integer(
          counters.duplicateOperations,
          0,
          Number.MAX_SAFE_INTEGER,
          'Duplicate operations',
        );
      if (counters.rejectedOperations !== undefined)
        rejectedOperations = integer(
          counters.rejectedOperations,
          0,
          Number.MAX_SAFE_INTEGER,
          'Rejected operations',
        );
    }
    noteTick(at);
    return Object.freeze({
      version: COMPANY_EVOLUTION_VERSION,
      restored: true as const,
      purchases: purchases.size,
      upgrades: ownedUpgrades.size,
      tick: at,
    });
  }

  return Object.freeze({
    version: COMPANY_EVOLUTION_VERSION,
    ledger,
    namespace,
    clock,
    fleet,
    vehicleOffers,
    upgrades,
    purchase,
    upgrade,
    read,
    snapshot,
    restore,
    getStats(): Readonly<{
      version: typeof COMPANY_EVOLUTION_VERSION;
      purchases: number;
      upgrades: number;
      rejectedOperations: number;
      duplicateOperations: number;
      xpWrites: 0;
      profileWrites: 0;
      styleOverrides: 0;
      historyScans: 0;
      disposed: boolean;
    }> {
      return Object.freeze({
        version: COMPANY_EVOLUTION_VERSION,
        purchases: disposed ? 0 : purchases.size,
        upgrades: disposed ? 0 : ownedUpgrades.size,
        rejectedOperations: disposed ? 0 : rejectedOperations,
        duplicateOperations: disposed ? 0 : duplicateOperations,
        xpWrites: 0 as const,
        profileWrites: 0 as const,
        styleOverrides: 0 as const,
        historyScans: 0 as const,
        disposed,
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      purchases.clear();
      purchaseOrder.length = 0;
      ownedUpgrades.clear();
      upgradeOrder.length = 0;
      Object.assign(refusalCounts, zeroRefusals());
      lastRefusal = null;
    },
  });
}

export interface LiveCompanyEvolutionOptions {
  readonly finance: Readonly<{
    readonly ledger: CompanyLedger;
    readonly read: () => CompanyFinanceSnapshot | null;
  }>;
  readonly fleet?: CompanyFleetPort;
  readonly namespace?: string;
  readonly clock?: EconomyClock;
  readonly vehicleOffers?: readonly CompanyVehicleOffer[];
  readonly upgrades?: readonly CompanyUpgradeDefinition[];
}

export interface LiveCompanyEvolution {
  readonly version: typeof LIVE_COMPANY_EVOLUTION_VERSION;
  readonly evolution: CompanyEvolution;
  purchase(offerId: unknown): CompanyEvolutionOutcome;
  upgrade(upgradeId: unknown): CompanyEvolutionOutcome;
  read(): CompanyEvolutionRead;
  snapshot(): CompanyEvolutionSnapshot;
  stats(): Readonly<{
    version: typeof LIVE_COMPANY_EVOLUTION_VERSION;
    tick: number;
    purchases: number;
    upgrades: number;
    rejectedOperations: number;
    xpWrites: 0;
    profileWrites: 0;
    styleOverrides: 0;
    historyScans: 0;
    disposed: boolean;
  }>;
  dispose(): void;
}

/**
 * Live port over the already-fed 268 finance. It reads the authoritative tick from the same finance
 * read model, so a purchase cannot be stamped with an invented clock. It never owns the ledger or the
 * fleet registry and never creates a second one.
 */
export function createLiveCompanyEvolution(
  options: LiveCompanyEvolutionOptions,
): LiveCompanyEvolution {
  const finance = options.finance,
    evolution = createCompanyEvolution({
      ledger: finance.ledger,
      ...(options.fleet === undefined ? {} : { fleet: options.fleet }),
      ...(options.namespace === undefined ? {} : { namespace: options.namespace }),
      ...(options.clock === undefined ? {} : { clock: options.clock }),
      ...(options.vehicleOffers === undefined ? {} : { vehicleOffers: options.vehicleOffers }),
      ...(options.upgrades === undefined ? {} : { upgrades: options.upgrades }),
    });
  let disposed = false;

  function assertLive(): void {
    if (disposed) throw new Error('Live company evolution disposed');
  }

  function currentTick(): number {
    return finance.read()?.tick ?? 0;
  }

  return Object.freeze({
    version: LIVE_COMPANY_EVOLUTION_VERSION,
    evolution,
    purchase(offerId: unknown): CompanyEvolutionOutcome {
      assertLive();
      return evolution.purchase(offerId, currentTick());
    },
    upgrade(upgradeId: unknown): CompanyEvolutionOutcome {
      assertLive();
      return evolution.upgrade(upgradeId, currentTick());
    },
    read(): CompanyEvolutionRead {
      assertLive();
      return evolution.read(currentTick());
    },
    snapshot(): CompanyEvolutionSnapshot {
      assertLive();
      return evolution.snapshot(currentTick());
    },
    stats(): Readonly<{
      version: typeof LIVE_COMPANY_EVOLUTION_VERSION;
      tick: number;
      purchases: number;
      upgrades: number;
      rejectedOperations: number;
      xpWrites: 0;
      profileWrites: 0;
      styleOverrides: 0;
      historyScans: 0;
      disposed: boolean;
    }> {
      const state = evolution.getStats();
      return Object.freeze({
        version: LIVE_COMPANY_EVOLUTION_VERSION,
        tick: disposed ? 0 : currentTick(),
        purchases: state.purchases,
        upgrades: state.upgrades,
        rejectedOperations: state.rejectedOperations,
        xpWrites: 0 as const,
        profileWrites: 0 as const,
        styleOverrides: 0 as const,
        historyScans: 0 as const,
        disposed,
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      evolution.dispose();
    },
  });
}
