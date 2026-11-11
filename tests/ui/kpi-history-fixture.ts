import {
  ECONOMY_CLOCK,
  createFleetKpi,
  selectKpiHistory,
  type FleetKpi,
  type FleetKpiSnapshot,
  type KpiHistorySelection,
  type RideReview,
  type RideSettlement,
  type TariffOutcomeState,
} from '../../src/economy';
import { createPauseFocusOwner, type PauseFocusMode, type PauseFocusOwner } from '../../src/app';
import { createKpiHistoryPanel, type KpiHistoryPanel } from '../../src/ui';
import { HudElement, type HudDocument, type HudEventInit } from './hud-dom';

/** One simulated day in ticks: 1 200 s × 60 Hz. */
export const KPI_HISTORY_DAY_TICKS = ECONOMY_CLOCK.secondsPerDay * ECONOMY_CLOCK.tickHz;
/** One simulated month in ticks: 30 simulated days. */
export const KPI_HISTORY_MONTH_TICKS = KPI_HISTORY_DAY_TICKS * ECONOMY_CLOCK.daysPerMonth;
/** The deterministic scenario clock: day 10 of month 11, mid-day. */
export const KPI_HISTORY_TICK = 11 * KPI_HISTORY_MONTH_TICKS + 10 * KPI_HISTORY_DAY_TICKS + 3_600;

export interface KpiHistoryScenario {
  readonly kpi: FleetKpi;
  readonly tick: number;
  readonly settlements: number;
  readonly reviews: number;
  snapshot(): FleetKpiSnapshot;
  selection(options?: { maximumDailyPoints?: number; months?: number }): KpiHistorySelection;
}

function settlement(
  index: number,
  tick: number,
  netMinorUnits: number,
  terminalState: TariffOutcomeState,
): RideSettlement {
  return Object.freeze({
    settlementId: `settlement-${index}`,
    rideId: `ride-${index}`,
    requestId: `request-${index}`,
    taxiId: 'taxi-01',
    terminalState,
    passengerAboard: terminalState !== 'CANCELLED',
    tick,
    currency: 'SDA',
    pricingVersion: '209-tariff-v1',
    policyVersion: '209-policy-v1',
    rule: 'COMPLETED_FULL_FARE',
    quotedMinorUnits: netMinorUnits,
    chargedMinorUnits: netMinorUnits,
    refundedMinorUnits: 0,
    netMinorUnits,
    chargeEntryId: `charge-${index}`,
    refundEntryId: null,
  });
}

function review(index: number, tick: number, rating: number): RideReview {
  return Object.freeze({
    reviewId: `review-${index}`,
    rideId: `ride-${index}`,
    customerId: `customer-${index}`,
    rating,
    reasonCodes: Object.freeze([]),
    tick,
    reviewModelVersion: '209-review-v1',
    exposureSeconds: 60,
    controlIntervals: 3,
    profileVersions: Object.freeze([]),
    preferenceAdjustment: 0,
    penalties: Object.freeze({ delay: 0, comfort: 0, incident: 0, failure: 0 }),
    evidence: Object.freeze({
      terminalState: 'COMPLETED' as const,
      passengerAboard: true,
      delaySeconds: 0,
      referenceTripDurationSeconds: 60,
      actualTripDurationSeconds: 60,
      comfortModelVersion: '139-comfort-v1',
      comfortPenalty: 0,
      impacts: 0,
      peakImpulseNs: 0,
      blockedSeconds: 0,
    }),
    supersedesReviewId: null,
    revision: 0,
  });
}

/**
 * Twelve simulated months of real 209 buckets built through the public incremental API:
 *
 * - months 0, 1, 2, 4, 5, 7, 8, 9, 10 are complete, one completed ride and one review per day,
 *   with the rating cycling 0–5 so every day has a different mean;
 * - month 3 has no event at all, so its slot must read `fără date`;
 * - month 6 is a real zero: cancelled rides with no charge, and only four reviews (all rated 0),
 *   so the revenue is `0` while most of its days have no review at all;
 * - month 11 is the current, partial month: ten completed rides rated 5.
 *
 * The result is 310 exact day buckets, 284 reviews and a weighted mean that differs from the mean
 * of the monthly means.
 */
export function createKpiHistoryScenario(): KpiHistoryScenario {
  const kpi = createFleetKpi();
  let index = 0;
  for (let month = 0; month < 12; month += 1) {
    if (month === 3) continue;
    const monthStart = month * KPI_HISTORY_MONTH_TICKS,
      days = month === 11 ? 10 : 30;
    for (let day = 0; day < days; day += 1) {
      const tick = monthStart + day * KPI_HISTORY_DAY_TICKS + 60 + day;
      if (month === 6) {
        kpi.applySettlement(settlement(index, tick, 0, 'CANCELLED'));
        if (day < 4) kpi.applyReview(review(index, tick, 0));
      } else {
        kpi.applySettlement(settlement(index, tick, 100 + day, 'COMPLETED'));
        kpi.applyReview(review(index, tick, month === 11 ? 5 : day % 6));
      }
      index += 1;
    }
  }
  const tick = KPI_HISTORY_TICK;
  return Object.freeze({
    kpi,
    tick,
    settlements: index,
    reviews: 270 + 4 + 10,
    snapshot(): FleetKpiSnapshot {
      return kpi.snapshot(tick);
    },
    selection(options: { maximumDailyPoints?: number; months?: number } = {}): KpiHistorySelection {
      return selectKpiHistory(kpi.snapshot(tick), options);
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Deterministic focus DOM: HudElement plus `focus()`, `tabIndex` and an owned `activeElement`.
// ---------------------------------------------------------------------------------------------

export interface KpiDocument extends HudDocument {
  activeElement: KpiElement | null;
  createElement(tagName: string): KpiElement;
}

export class KpiElement extends HudElement {
  tabIndex = -1;
  focusCount = 0;
  focus(): void {
    this.focusCount += 1;
    (this.ownerDocument as KpiDocument).activeElement = this;
  }
  /** Deterministic key/click delivery with the same object shape `hud-dom` already provides. */
  send(type: string, init: HudEventInit = {}): void {
    this.dispatchEvent(type, init);
  }
}

export function createKpiDocument(): KpiDocument {
  const document: KpiDocument = {
    activeElement: null,
    createElement(tagName: string): KpiElement {
      const element = new KpiElement(tagName);
      element.ownerDocument = document;
      return element;
    },
  };
  return document;
}

export function byKpiClass(root: HudElement, className: string): KpiElement[] {
  const matches: KpiElement[] = [];
  for (const child of root.children) {
    if (child.className.split(' ').includes(className)) matches.push(child as KpiElement);
    matches.push(...byKpiClass(child, className));
  }
  return matches;
}

export interface KpiHistoryHarness {
  readonly document: KpiDocument;
  readonly host: KpiElement;
  readonly panel: KpiHistoryPanel;
  readonly scenario: KpiHistoryScenario;
  readonly pauseFocus: PauseFocusOwner;
  readonly suspensions: string[];
  readonly resumes: string[];
  setMode(mode: PauseFocusMode): void;
  trigger(): KpiElement;
  dialog(): KpiElement;
  reads(): number;
  closeByEscape(): void;
}

export interface KpiHistoryHarnessOptions {
  readonly open?: boolean;
  readonly mode?: PauseFocusMode;
  readonly maximumDailyPoints?: number;
  readonly selection?: () => KpiHistorySelection | null;
  /** Reuse an already built scenario instead of rebuilding the twelve months. */
  readonly scenario?: KpiHistoryScenario;
}

/** Composes the real 209 KPI, the real 070 pause owner and the 210 popup over a fake DOM. */
export function createKpiHistoryHarness(options: KpiHistoryHarnessOptions = {}): KpiHistoryHarness {
  const document = createKpiDocument(),
    host = document.createElement('div'),
    scenario = options.scenario ?? createKpiHistoryScenario(),
    suspensions: string[] = [],
    resumes: string[] = [],
    pauseFocus = createPauseFocusOwner({
      suspend: (cause) => {
        suspensions.push(cause);
      },
      resume: (cause) => {
        resumes.push(cause);
      },
    });
  pauseFocus.setMode(options.mode ?? 'AUTO');
  let reads = 0;
  const read = () => {
    reads += 1;
    return options.selection === undefined
      ? scenario.selection(
          options.maximumDailyPoints === undefined
            ? {}
            : { maximumDailyPoints: options.maximumDailyPoints },
        )
      : options.selection();
  };
  const panel = createKpiHistoryPanel(host as unknown as HTMLElement, {
    read,
    setSurface: (open) => pauseFocus.setSurface('panel', open),
    ...(options.open === true ? { open: true } : {}),
  });
  const trigger = () => host.children[0]?.children[0] as unknown as KpiElement;
  const dialog = () => host.children[0]?.children[1] as unknown as KpiElement;
  return Object.freeze({
    document,
    host,
    panel,
    scenario,
    pauseFocus,
    suspensions,
    resumes,
    setMode: (mode: PauseFocusMode) => pauseFocus.setMode(mode),
    trigger,
    dialog,
    reads: () => reads,
    closeByEscape: () => dialog().send('keydown', { key: 'Escape' }),
  });
}
