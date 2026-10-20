import { createFleetPanel } from '../../src/ui';
import type {
  FleetPanelEta,
  FleetPanelRide,
  FleetPanelSnapshot,
  FleetPanelTaxi,
  FleetPanelView,
} from '../../src/ui';
import { createHudDocument, createHudHost, serializeHud } from './hud-dom';
import type { HudDocument, HudElement } from './hud-dom';

export function panelEta(overrides: Partial<FleetPanelEta> = {}): FleetPanelEta {
  return Object.freeze({
    status: 'ESTIMATED',
    reason: null,
    serviceState: 'FREE_FLOW',
    seconds: 90,
    minSeconds: 80,
    maxSeconds: 100,
    progressFraction: 0.42,
    remainingDistanceM: 320,
    ...overrides,
  });
}

export function panelRide(overrides: Partial<FleetPanelRide> = {}): FleetPanelRide {
  return Object.freeze({
    rideId: 'ride:075:1',
    state: 'TO_PICKUP',
    pickupZoneId: 'zone:pickup',
    dropoffZoneId: 'zone:dropoff',
    eta: panelEta(),
    ...overrides,
  });
}

export function panelTaxi(overrides: Partial<FleetPanelTaxi> = {}): FleetPanelTaxi {
  return Object.freeze({
    vehicleId: 'taxi:075:01',
    slot: 1,
    classId: 'sedan',
    profileId: 'style:075',
    appliedProfileVersion: 'v1',
    controlMode: 'AUTO',
    serviceState: null,
    blocked: false,
    ride: null,
    ...overrides,
  });
}

export function panelSnapshot(overrides: Partial<FleetPanelSnapshot> = {}): FleetPanelSnapshot {
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    version: '075-fleet-panel-v1',
    sessionId: 'session:075',
    worldEpoch: 0,
    tick: 10,
    followedTaxiId: null,
    taxis: Object.freeze([panelTaxi()]),
    ...overrides,
  });
}

export function taxiIdOf(slot: number): string {
  return `taxi:075:${String(slot).padStart(2, '0')}`;
}

const BUSY_STATES = ['TO_PICKUP', 'PICKUP', 'TO_DROPOFF', 'DROPOFF'] as const;

/**
 * A deterministic 30-taxi frame covering every row state:
 * slots 1-10 have an active ride with a certified ETA, slots 11-20 have no ride and no estimate,
 * slots 21-25 are blocked without a ride and slots 26-30 are blocked with an active ride and an
 * unavailable ETA. Slot 21 is therefore the first blockage and slot 12 the followed taxi.
 */
export function thirtyTaxiSnapshot(
  overrides: Partial<FleetPanelSnapshot> = {},
): FleetPanelSnapshot {
  const taxis: FleetPanelTaxi[] = [];
  for (let slot = 1; slot <= 30; slot += 1) {
    const vehicleId = taxiIdOf(slot),
      classId = slot % 2 === 0 ? 'compact' : 'sedan',
      base = {
        vehicleId,
        slot,
        classId,
        profileId: 'style:075',
        appliedProfileVersion: `v${1 + (slot % 3)}`,
        controlMode: slot % 5 === 0 ? ('MANUAL' as const) : ('AUTO' as const),
      };
    if (slot <= 10) {
      const seconds = 100 - slot * 7;
      taxis.push(
        panelTaxi({
          ...base,
          serviceState: slot % 2 === 0 ? 'CONGESTED' : 'FREE_FLOW',
          ride: panelRide({
            rideId: `ride:075:${slot}`,
            state: BUSY_STATES[slot % BUSY_STATES.length]!,
            pickupZoneId: `zone:pickup:${slot}`,
            dropoffZoneId: `zone:dropoff:${slot}`,
            eta: panelEta({
              seconds,
              minSeconds: seconds - 5,
              maxSeconds: seconds + 5,
              serviceState: slot % 2 === 0 ? 'CONGESTED' : 'FREE_FLOW',
              progressFraction: slot / 20,
              remainingDistanceM: 100 + slot * 10,
            }),
          }),
        }),
      );
      continue;
    }
    if (slot <= 20) {
      taxis.push(panelTaxi({ ...base, ride: null }));
      continue;
    }
    const blockedRide =
      slot <= 25
        ? null
        : panelRide({
            rideId: `ride:075:${slot}`,
            state: 'TO_PICKUP',
            pickupZoneId: `zone:pickup:${slot}`,
            dropoffZoneId: `zone:dropoff:${slot}`,
            eta: panelEta({
              status: 'UNAVAILABLE',
              reason: 'SERVICE_BLOCKED',
              serviceState: 'BLOCKED',
              seconds: null,
              minSeconds: null,
              maxSeconds: null,
              progressFraction: null,
              remainingDistanceM: null,
            }),
          });
    taxis.push(
      panelTaxi({
        ...base,
        serviceState: 'BLOCKED',
        blocked: true,
        ride: blockedRide,
      }),
    );
  }
  return panelSnapshot({ followedTaxiId: taxiIdOf(12), taxis: Object.freeze(taxis), ...overrides });
}

// ---------------------------------------------------------------------------------------------
// Fake-DOM harness
// ---------------------------------------------------------------------------------------------

export interface FleetPanelHarness {
  readonly doc: HudDocument;
  readonly host: HudElement;
  readonly panel: ReturnType<typeof createFleetPanel>;
  readonly selections: string[];
  root(): HudElement;
  rows(): HudElement[];
  buttonFor(vehicleId: string): HudElement;
  filterSelect(): HudElement;
  sortSelect(): HudElement;
  status(): HudElement;
  dom(): string;
}

export function byClass(root: HudElement, className: string): HudElement | null {
  if (root.className.split(' ').includes(className)) return root;
  for (const child of root.children) {
    const found = byClass(child, className);
    if (found !== null) return found;
  }
  return null;
}

export function createFleetPanelHarness(
  options: {
    readonly maximumHz?: number;
    readonly open?: boolean;
    readonly filter?: 'ALL' | 'BUSY' | 'FREE' | 'BLOCKED';
    readonly sort?: 'SLOT' | 'STATE' | 'ETA';
  } = {},
): FleetPanelHarness {
  const doc = createHudDocument(),
    host = createHudHost(doc),
    selections: string[] = [],
    panel = createFleetPanel(host as unknown as HTMLElement, {
      ...options,
      select: (vehicleId) => selections.push(vehicleId),
    }),
    requireRoot = (): HudElement => {
      const element = host.children[0];
      if (!element) throw new Error('Fleet panel root is missing');
      return element;
    },
    rows = (): HudElement[] => {
      const list = byClass(requireRoot(), 'fleet-panel__rows');
      if (list === null) throw new Error('Fleet panel list is missing');
      return [...list.children];
    },
    buttonFor = (vehicleId: string): HudElement => {
      for (const item of rows()) {
        const button = item.children[0];
        if (button?.getAttribute('data-vehicle-id') === vehicleId) return button;
      }
      throw new Error(`Fleet panel row is missing: ${vehicleId}`);
    },
    select = (className: string): HudElement => {
      const element = byClass(requireRoot(), className);
      if (element === null) throw new Error(`Fleet panel control is missing: ${className}`);
      return element;
    };
  return {
    doc,
    host,
    panel,
    selections,
    root: requireRoot,
    rows,
    buttonFor,
    filterSelect: () => select('fleet-panel__filter'),
    sortSelect: () => select('fleet-panel__sort'),
    status: () => select('fleet-panel__status'),
    dom: () => serializeHud(requireRoot()),
  };
}

export function viewOf(panel: ReturnType<typeof createFleetPanel>): FleetPanelView {
  const view = panel.getView();
  if (view === null) throw new Error('Fleet panel has no retained view');
  return view;
}
