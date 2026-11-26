import {
  COMPANY_UPGRADES,
  COMPANY_VEHICLE_OFFERS,
  DEFAULT_COMPANY_COST_SCHEDULE,
  ECONOMY_CLOCK,
  createCompanyEvolution,
  createCompanyLedger,
  ticksPerMonth,
  type CompanyEvolution,
  type CompanyEvolutionOutcome,
  type CompanyEvolutionRead,
  type CompanyLedger,
  type CompanyCostSchedule,
} from '../../src/economy';
import { createFleetRegistry, type FleetRegistry } from '../../src/fleet';
import { createPauseFocusOwner, type PauseFocusMode, type PauseFocusOwner } from '../../src/app';
import { createCompanyDashboard, type CompanyDashboard } from '../../src/ui';
import { HudElement, type HudDocument, type HudEventInit } from './hud-dom';

export const COMPANY_MONTH_TICKS = ticksPerMonth(ECONOMY_CLOCK);
export const COMPANY_OFFER = COMPANY_VEHICLE_OFFERS[0]!;
export const COMPANY_UPGRADE = COMPANY_UPGRADES.find(
  (entry) => entry.upgradeId === 'upgrade-service-contract',
)!;
export const COMPANY_LOCKED_OFFER = COMPANY_VEHICLE_OFFERS.find(
  (entry) => entry.requiredLevel === 2,
)!;

export interface CompanyDashboardScenarioOptions {
  readonly initialCashMinorUnits?: number;
  readonly withHistory?: boolean;
  readonly namespace?: string;
}

export interface CompanyDashboardScenario {
  readonly fleet: FleetRegistry;
  readonly ledger: CompanyLedger;
  readonly evolution: CompanyEvolution;
  readonly clock: { tick: number };
  readonly rides: number;
  read(): CompanyEvolutionRead;
  purchase(offerId: string): CompanyEvolutionOutcome;
  upgrade(upgradeId: string): CompanyEvolutionOutcome;
  addNextMonthActivity(): void;
  dispose(): void;
}

function ride(
  ledger: CompanyLedger,
  index: number,
  tick: number,
  overrides: Record<string, unknown> = {},
): void {
  const outcome = ledger.postRide({
    rideId: `ride-270-${index}`,
    requestId: `request-270-${index}`,
    taxiId: 'taxi-270',
    tick,
    terminalState: 'COMPLETED',
    passengerAboard: true,
    plannedDistanceMeters: 1_000,
    revenueMinorUnits: 800,
    revenueSettlementId: `settlement-270-${index}`,
    ...overrides,
  });
  if (outcome.status !== 'ACCEPTED')
    throw new Error(`company fixture ride ${index} was rejected: ${outcome.reason ?? 'unknown'}`);
}

function failedRide(ledger: CompanyLedger, index: number, tick: number): void {
  const outcome = ledger.postRide({
    rideId: `ride-270-failed-${index}`,
    requestId: `request-270-failed-${index}`,
    taxiId: 'taxi-270',
    tick,
    terminalState: 'FAILED',
    passengerAboard: false,
    plannedDistanceMeters: 1_000,
    revenueMinorUnits: 0,
    revenueSettlementId: `settlement-270-failed-${index}`,
  });
  if (outcome.status !== 'ACCEPTED')
    throw new Error(`company fixture failed ride was rejected: ${outcome.reason ?? 'unknown'}`);
}

function schedule(initialCashMinorUnits: number): CompanyCostSchedule {
  return Object.freeze({
    ...DEFAULT_COMPANY_COST_SCHEDULE,
    initialCashMinorUnits,
  });
}

/**
 * Real 268 ledger + 269 evolution over a real 057 registry:
 *
 * - month 0: twenty completed rides and the fixed monthly costs (profit 9 100 SDA);
 * - month 1: no bucket at all, so the dashboard must print `fără date`;
 * - month 2: four failed rides and fixed costs, so revenue is a real `0` and profit `-4 000`;
 * - after a real purchase the company reaches level 2 and can buy the service upgrade; the next
 *   month's service cost is half of the pre-upgrade cost because the 269 modifier starts then.
 */
export function createCompanyDashboardScenario(
  options: CompanyDashboardScenarioOptions = {},
): CompanyDashboardScenario {
  const namespace = options.namespace ?? 'test:company:dashboard',
    fleet = createFleetRegistry({
      schemaVersion: 1,
      units: 'SI',
      sessionId: 'session-270',
      worldEpoch: 1,
      scenarioId: 'scenario-270',
      seed: 270,
      namespace: `${namespace}:fleet`,
      taxiCount: 20,
      civilianCount: 20,
      profile: { profileId: 'v3-city-style', versionId: 'v3-city-style-v1' },
    }),
    ledger = createCompanyLedger({
      namespace: `${namespace}:ledger`,
      schedule: schedule(options.initialCashMinorUnits ?? 50_000),
    }),
    evolution = createCompanyEvolution({
      ledger,
      fleet,
      namespace: `${namespace}:evolution`,
    }),
    clock = { tick: 2 * COMPANY_MONTH_TICKS + 200 };
  let rides = 0;
  if (options.withHistory !== false) {
    for (let index = 0; index < 20; index += 1) {
      ride(ledger, index, 60 + index);
      rides += 1;
    }
    ledger.accrueFixedCosts({ tick: 100 });
    for (let index = 0; index < 4; index += 1)
      failedRide(ledger, index, 2 * COMPANY_MONTH_TICKS + 100);
    ledger.accrueFixedCosts({ tick: 2 * COMPANY_MONTH_TICKS + 150 });
  }
  return Object.freeze({
    fleet,
    ledger,
    evolution,
    clock,
    rides,
    read: () => evolution.read(clock.tick),
    purchase: (offerId: string) => evolution.purchase(offerId, clock.tick),
    upgrade: (upgradeId: string) => evolution.upgrade(upgradeId, clock.tick),
    addNextMonthActivity(): void {
      clock.tick = 3 * COMPANY_MONTH_TICKS + 100;
      for (let index = 0; index < 4; index += 1) {
        ride(ledger, 100 + index, clock.tick + index, { revenueMinorUnits: 1_300 });
        rides += 1;
      }
      ledger.accrueFixedCosts({ tick: clock.tick });
    },
    dispose(): void {
      evolution.dispose();
      ledger.dispose();
      fleet.dispose();
    },
  });
}

/** A real zero-profit month (revenue equals cost) with no fixed costs. */
export function createCompanyZeroProfitScenario(): CompanyDashboardScenario {
  const scenario = createCompanyDashboardScenario({
    withHistory: false,
    namespace: 'test:company:dashboard:zero',
  });
  const outcome = scenario.ledger.postRide({
    rideId: 'ride-270-zero',
    requestId: 'request-270-zero',
    taxiId: 'taxi-270',
    tick: 60,
    terminalState: 'COMPLETED',
    passengerAboard: true,
    plannedDistanceMeters: 1_000,
    revenueMinorUnits: 145,
    revenueSettlementId: 'settlement-270-zero',
  });
  if (outcome.status !== 'ACCEPTED') throw new Error('zero-profit fixture was rejected');
  scenario.clock.tick = 120;
  return scenario;
}

// ---------------------------------------------------------------------------------------------
// Deterministic focus DOM: HudElement plus `focus()`, `tabIndex` and an owned `activeElement`.
// ---------------------------------------------------------------------------------------------

export interface CompanyDocument extends HudDocument {
  activeElement: CompanyElement | null;
  createElement(tagName: string): CompanyElement;
}

export class CompanyElement extends HudElement {
  tabIndex = -1;
  focusCount = 0;
  focus(): void {
    this.focusCount += 1;
    (this.ownerDocument as CompanyDocument).activeElement = this;
  }
  send(type: string, init: HudEventInit = {}): void {
    this.dispatchEvent(type, init);
  }
}

export function createCompanyDocument(): CompanyDocument {
  const document: CompanyDocument = {
    activeElement: null,
    createElement(tagName: string): CompanyElement {
      const element = new CompanyElement(tagName);
      element.ownerDocument = document;
      return element;
    },
  };
  return document;
}

export function byCompanyClass(root: HudElement, className: string): CompanyElement[] {
  const matches: CompanyElement[] = [];
  for (const child of root.children) {
    if (child.className.split(' ').includes(className)) matches.push(child as CompanyElement);
    matches.push(...byCompanyClass(child, className));
  }
  return matches;
}

export function byCompanyAction(root: HudElement, action: string): CompanyElement[] {
  return byCompanyClass(root, 'company-dashboard__card')
    .flatMap((card) => card.children)
    .filter((child) => child.getAttribute('data-company-action') === action) as CompanyElement[];
}

export function companyCard(
  root: HudElement,
  action: 'purchase' | 'upgrade',
  key: string,
): CompanyElement | null {
  return (
    byCompanyClass(root, 'company-dashboard__card').find(
      (card) =>
        card.getAttribute('data-key') === key &&
        card.children.some((child) => child.getAttribute('data-company-action') === action),
    ) ?? null
  );
}

export interface CompanyDashboardHarness {
  readonly document: CompanyDocument;
  readonly host: CompanyElement;
  readonly trigger: CompanyElement;
  readonly panel: CompanyDashboard;
  readonly scenario: CompanyDashboardScenario;
  readonly pauseFocus: PauseFocusOwner;
  readonly suspensions: string[];
  readonly resumes: string[];
  readonly closes: number;
  setMode(mode: PauseFocusMode): void;
  setNow(value: number): void;
  dialog(): CompanyElement;
  closeButton(): CompanyElement;
  body(): CompanyElement;
  card(action: 'purchase' | 'upgrade', key: string): CompanyElement | null;
  clickAction(action: string, key?: string): boolean;
  confirm(): void;
  cancel(): void;
  closeByEscape(): void;
}

export interface CompanyDashboardHarnessOptions {
  readonly scenario?: CompanyDashboardScenario;
  readonly mode?: PauseFocusMode;
  readonly read?: () => CompanyEvolutionRead | null;
  readonly purchase?: (offerId: string) => CompanyEvolutionOutcome | null;
  readonly upgrade?: (upgradeId: string) => CompanyEvolutionOutcome | null;
  readonly onClose?: () => void;
}

/** Composes the real 268/269 company ports and the 270 panel over a deterministic focus DOM. */
export function createCompanyDashboardHarness(
  options: CompanyDashboardHarnessOptions = {},
): CompanyDashboardHarness {
  const document = createCompanyDocument(),
    host = document.createElement('div'),
    trigger = document.createElement('button'),
    scenario = options.scenario ?? createCompanyDashboardScenario(),
    suspensions: string[] = [],
    resumes: string[] = [];
  trigger.textContent = 'Companie';
  trigger.setAttribute('data-shell-action', 'company');
  trigger.tabIndex = 0;
  host.append(trigger);
  const pauseFocus = createPauseFocusOwner({
      suspend: (cause) => {
        suspensions.push(cause);
      },
      resume: (cause) => {
        resumes.push(cause);
      },
    }),
    state = { closes: 0, now: 1_000 };
  pauseFocus.setMode(options.mode ?? 'MANUAL');
  const panel = createCompanyDashboard(host as unknown as HTMLElement, {
    read: options.read ?? (() => scenario.read()),
    ...(options.purchase === undefined
      ? { purchase: (offerId: string) => scenario.purchase(offerId) }
      : { purchase: options.purchase }),
    ...(options.upgrade === undefined
      ? { upgrade: (upgradeId: string) => scenario.upgrade(upgradeId) }
      : { upgrade: options.upgrade }),
    setSurface: (open) => pauseFocus.setSurface('panel', open),
    now: () => state.now,
    onClose: () => {
      state.closes += 1;
      options.onClose?.();
    },
  });
  const dialog = () => host.children[1] as CompanyElement;
  const closeButton = () => byCompanyClass(dialog(), 'company-dashboard__close')[0]!;
  const body = () => byCompanyClass(dialog(), 'company-dashboard__body')[0]!;
  return Object.freeze({
    document,
    host,
    trigger,
    panel,
    scenario,
    pauseFocus,
    suspensions,
    resumes,
    get closes() {
      return state.closes;
    },
    setMode: (mode: PauseFocusMode) => pauseFocus.setMode(mode),
    setNow: (value: number) => {
      state.now = value;
    },
    dialog,
    closeButton,
    body,
    card: (action: 'purchase' | 'upgrade', key: string) => companyCard(dialog(), action, key),
    clickAction(action: string, key = ''): boolean {
      if (action === 'close') return panel.close();
      const card = companyCard(dialog(), action as 'purchase' | 'upgrade', key);
      if (card === null) return false;
      const button = card.children[1] as HudElement & { disabled?: boolean };
      if (button.disabled === true) return false;
      const result =
        action === 'purchase'
          ? panel.requestPurchase(key.replace(/^offer:/, ''))
          : panel.requestUpgrade(key.replace(/^upgrade:/, ''));
      return result.status === 'PENDING';
    },
    confirm(): void {
      panel.confirm();
    },
    cancel(): void {
      panel.cancel();
    },
    closeByEscape: () => dialog().send('keydown', { key: 'Escape' }),
  });
}
