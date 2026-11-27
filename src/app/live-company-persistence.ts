import {
  createLiveCompanyEvolution,
  createLiveCompanyFinance,
  type CompanyCostAdjustment,
  type CompanyCostModifierEntry,
  type CompanyEvolutionSnapshot,
  type CompanyFinanceSnapshot,
  type CompanyLedgerSnapshot,
  type CompanyRideCostEntry,
  type EconomyClock,
  type LiveCompanyEvolution,
  type LiveCompanyFinance,
} from '../economy';
import type { CompanyFleetPort } from '../fleet';
import { canonicalizeJson } from '../persistence';

/**
 * PBI 278 company restore.
 *
 * The 268 ledger has no `restore` entry point and PBI 278 does not own the economy module, so this
 * composition adapter rebuilds a fresh 268 ledger by replaying the immutable entries the snapshot
 * already contains through the ledger's real public API. The 269 journal is then restored into a
 * fresh evolution over that ledger. Nothing is added: the replay is compared byte-for-byte with the
 * saved ledger snapshot and a mismatch is a failed restore, never a partially accepted company.
 */

export interface LiveCompanyPersistenceState {
  readonly finance: unknown;
  readonly ledger: unknown;
  readonly evolution: unknown;
}

export interface LiveCompanyRestoreOptions {
  readonly namespace: string;
  readonly clock: EconomyClock;
  readonly fleet?: CompanyFleetPort;
  readonly state: unknown;
}

export interface LiveCompanyRestored {
  readonly company: LiveCompanyFinance;
  readonly evolution: LiveCompanyEvolution;
  readonly fingerprint: string;
  readonly replay: Readonly<{
    investments: number;
    fixedCostTicks: number;
    rides: number;
    adjustments: number;
  }>;
}

export class LiveCompanyRestoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiveCompanyRestoreError';
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new LiveCompanyRestoreError(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new LiveCompanyRestoreError(`${label} must be a list`);
  return value;
}

function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new LiveCompanyRestoreError(`${label} must be a nonnegative integer`);
  return value;
}

function digest(value: unknown): string {
  const canonical = canonicalizeJson(value, { maxDepth: 32 });
  if (canonical.status === 'REJECTED')
    throw new LiveCompanyRestoreError(
      `Company snapshot is not canonical: ${canonical.rejection.message}`,
    );
  return canonical.text;
}

function readLedger(value: unknown): CompanyLedgerSnapshot {
  const data = record(value, 'company ledger snapshot');
  if (data.version !== '268-company-ledger-v1')
    throw new LiveCompanyRestoreError('Company ledger snapshot belongs to another contract');
  array(data.rideEntries, 'company ride entries');
  array(data.fixedEntries, 'company fixed entries');
  array(data.adjustments, 'company adjustments');
  array(data.investments, 'company investments');
  array(data.costModifiers, 'company cost modifiers');
  return value as CompanyLedgerSnapshot;
}

function readEvolution(value: unknown): CompanyEvolutionSnapshot {
  const data = record(value, 'company evolution snapshot');
  if (data.version !== '269-company-evolution-snapshot-v1')
    throw new LiveCompanyRestoreError('Company evolution snapshot belongs to another contract');
  array(data.purchases, 'company purchases');
  array(data.upgrades, 'company upgrades');
  return value as CompanyEvolutionSnapshot;
}

function modifierInput(
  modifiers: ReadonlyMap<string, CompanyCostModifierEntry>,
  modifierId: string | null,
): unknown {
  if (modifierId === null) return null;
  const modifier = modifiers.get(modifierId);
  if (modifier === undefined)
    throw new LiveCompanyRestoreError(`Missing company cost modifier ${modifierId}`);
  return {
    modifierId: modifier.modifierId,
    version: modifier.version,
    category: modifier.category,
    basisPoints: modifier.basisPoints,
    effectiveFromTick: modifier.effectiveFromTick,
  };
}

function rideInput(entry: CompanyRideCostEntry): unknown {
  const incident = entry.lines.find((line) => line.category === 'INCIDENT');
  return {
    rideId: entry.rideId,
    requestId: entry.requestId,
    taxiId: entry.taxiId,
    tick: entry.tick,
    terminalState: entry.terminalState,
    passengerAboard: entry.passengerAboard,
    plannedDistanceMeters: entry.plannedDistanceMeters,
    revenueMinorUnits: entry.revenueMinorUnits,
    revenueSettlementId: entry.revenueSettlementId,
    incidentCount: incident === undefined ? 0 : Math.round(incident.quantity),
    costModelVersion: entry.costModelVersion,
  };
}

function adjustmentInput(entry: CompanyCostAdjustment): unknown {
  return {
    adjustmentId: entry.adjustmentId,
    rideId: entry.rideId,
    cause: entry.cause,
    category: entry.category,
    amountMinorUnits: entry.amountMinorUnits,
    tick: entry.tick,
  };
}

interface ReplayEvent {
  readonly tick: number;
  readonly priority: number;
  readonly order: number;
  readonly apply: () => void;
}

/**
 * Rebuilds the exact 268 ledger and 269 journal from an exported live checkpoint and verifies the
 * rebuilt ledger against the saved snapshot before returning it.
 */
export function restoreLiveCompany(options: LiveCompanyRestoreOptions): LiveCompanyRestored {
  const state = record(options.state, 'company state');
  const ledgerSnapshot = readLedger(state.ledger);
  const financeSnapshot = record(
    state.finance,
    'company finance snapshot',
  ) as unknown as CompanyFinanceSnapshot;
  const financeTotals = record(financeSnapshot.totals, 'company finance totals');
  const evolutionSnapshot = readEvolution(state.evolution);
  const company = createLiveCompanyFinance({
    namespace: options.namespace,
    clock: options.clock,
  });
  try {
    const modifiers = new Map(
      ledgerSnapshot.costModifiers.map((entry) => [entry.modifierId, entry] as const),
    );
    const events: ReplayEvent[] = [];
    let order = 0;
    const push = (tick: number, priority: number, apply: () => void): void => {
      events.push({ tick: integer(tick, 'replay tick'), priority, order: order++, apply });
    };
    for (const investment of ledgerSnapshot.investments)
      push(investment.tick, 0, () => {
        const outcome = company.ledger.invest({
          investmentId: investment.investmentId,
          kind: investment.kind,
          referenceId: investment.referenceId,
          amountMinorUnits: investment.amountMinorUnits,
          tick: investment.tick,
          investmentModelVersion: investment.investmentModelVersion,
          effect: modifierInput(modifiers, investment.modifierId),
        });
        if (outcome.status !== 'ACCEPTED' && outcome.status !== 'DUPLICATE')
          throw new LiveCompanyRestoreError(
            `Company investment replay was ${outcome.status}: ${outcome.reason ?? 'unknown'}`,
          );
      });
    const fixedTicks = [...new Set(ledgerSnapshot.fixedEntries.map((entry) => entry.tick))].sort(
      (left, right) => left - right,
    );
    for (const tick of fixedTicks)
      push(tick, 1, () => {
        const outcome = company.ledger.accrueFixedCosts({ tick });
        if (outcome.status !== 'ACCEPTED' && outcome.status !== 'DUPLICATE')
          throw new LiveCompanyRestoreError(
            `Company fixed cost replay was ${outcome.status}: ${outcome.reason ?? 'unknown'}`,
          );
      });
    const rides = [...ledgerSnapshot.rideEntries].sort(
      (left, right) => left.tick - right.tick || left.entryId.localeCompare(right.entryId),
    );
    for (const ride of rides)
      push(ride.tick, 2, () => {
        const outcome = company.ledger.postRide(rideInput(ride));
        if (outcome.status !== 'ACCEPTED' && outcome.status !== 'DUPLICATE')
          throw new LiveCompanyRestoreError(
            `Company ride replay was ${outcome.status}: ${outcome.reason ?? 'unknown'}`,
          );
      });
    const adjustments = [...ledgerSnapshot.adjustments].sort(
      (left, right) =>
        left.tick - right.tick || left.adjustmentId.localeCompare(right.adjustmentId),
    );
    for (const adjustment of adjustments)
      push(adjustment.tick, 3, () => {
        const outcome = company.ledger.adjustRide(adjustmentInput(adjustment));
        if (outcome.status !== 'ACCEPTED' && outcome.status !== 'DUPLICATE')
          throw new LiveCompanyRestoreError(
            `Company adjustment replay was ${outcome.status}: ${outcome.reason ?? 'unknown'}`,
          );
      });
    events.sort(
      (left, right) =>
        left.tick - right.tick || left.priority - right.priority || left.order - right.order,
    );
    for (const event of events) event.apply();
    const replayed = company.snapshot(ledgerSnapshot.tick);
    if (replayed === null)
      throw new LiveCompanyRestoreError('Company ledger snapshot could not be read back');
    if (digest(replayed) !== digest(ledgerSnapshot))
      throw new LiveCompanyRestoreError(
        'The replayed company ledger does not match the saved ledger snapshot',
      );
    if (digest(financeTotals) !== digest(replayed.totals))
      throw new LiveCompanyRestoreError(
        'The company finance totals do not match the replayed ledger',
      );
    let restoredRead: CompanyFinanceSnapshot | null = financeSnapshot;
    const evolution = createLiveCompanyEvolution({
      finance: {
        ledger: company.ledger,
        read: () => restoredRead ?? company.read(),
      },
      ...(options.fleet === undefined ? {} : { fleet: options.fleet }),
      namespace: options.namespace,
      clock: options.clock,
    });
    try {
      evolution.evolution.restore(evolutionSnapshot);
    } catch (error) {
      evolution.dispose();
      throw error;
    }
    const facade: LiveCompanyFinance = Object.freeze({
      version: company.version,
      ledger: company.ledger,
      step(value: unknown) {
        restoredRead = null;
        return company.step(value);
      },
      read() {
        return restoredRead ?? company.read();
      },
      snapshot(atTick?: number) {
        return company.snapshot(atTick);
      },
      stats() {
        return company.stats();
      },
      dispose() {
        company.dispose();
      },
    });
    return Object.freeze({
      company: facade,
      evolution,
      fingerprint: `${replayed.totals.cashMinorUnits}:${replayed.totals.revenueMinorUnits}:${
        replayed.totals.profitMinorUnits
      }`,
      replay: Object.freeze({
        investments: ledgerSnapshot.investments.length,
        fixedCostTicks: fixedTicks.length,
        rides: ledgerSnapshot.rideEntries.length,
        adjustments: ledgerSnapshot.adjustments.length,
      }),
    });
  } catch (error) {
    company.dispose();
    if (error instanceof LiveCompanyRestoreError) throw error;
    throw new LiveCompanyRestoreError(
      error instanceof Error ? error.message : 'Unknown company restore failure',
    );
  }
}
