import { createMapSelectionOverlay, createMinimapTransform } from '../../src/ui';
import type { MapSelectionSnapshot, MapSelectionVehicle, MinimapTransform } from '../../src/ui';
import { createHudDocument, createHudHost, serializeHud } from './hud-dom';
import type { HudDocument, HudElement } from './hud-dom';

/** Deterministic transform over a 40 m square, matching the 074 north-up convention. */
export function mapTransform(widthPx = 240, heightPx = 240): MinimapTransform {
  return createMinimapTransform(
    { minM: { x: -10, z: -10 }, maxM: { x: 30, z: 30 } },
    { widthPx, heightPx, paddingPx: 10 },
  );
}

export function taxiIdOf(slot: number): string {
  return `vehicle:076:TAXI:${String(slot).padStart(2, '0')}`;
}

export function civilIdOf(slot: number): string {
  return `vehicle:076:CIVIL:${String(slot).padStart(2, '0')}`;
}

/** A deterministic position grid: taxis in the upper rows, civilians below. */
export function gridPosition(index: number): { x: number; y: number; z: number } {
  return Object.freeze({
    x: -8 + (index % 10) * 4,
    y: 0,
    z: 28 - Math.floor(index / 10) * 4,
  });
}

export function mapVehicle(overrides: Partial<MapSelectionVehicle> = {}): MapSelectionVehicle {
  return Object.freeze({
    vehicleId: taxiIdOf(1),
    kind: 'TAXI',
    slot: 1,
    label: null,
    positionM: { x: 0, y: 0, z: 0 },
    headingRad: null,
    available: true,
    selectable: true,
    ...overrides,
  });
}

export function mapSnapshot(overrides: Partial<MapSelectionSnapshot> = {}): MapSelectionSnapshot {
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    version: '076-map-selection-v1',
    sessionId: 'session:076',
    worldEpoch: 0,
    tick: 10,
    followedVehicleId: null,
    vehicles: Object.freeze([mapVehicle()]),
    ...overrides,
  });
}

/**
 * A deterministic frame with 30 taxis and 40 civilians on the real grid, plus one distant civilian
 * at the south-west corner. Slot 12 is the followed taxi.
 */
export function fleetMapSnapshot(
  overrides: Partial<MapSelectionSnapshot> = {},
): MapSelectionSnapshot {
  const vehicles: MapSelectionVehicle[] = [];
  for (let slot = 1; slot <= 30; slot += 1)
    vehicles.push(
      mapVehicle({
        vehicleId: taxiIdOf(slot),
        kind: 'TAXI',
        slot,
        positionM: gridPosition(slot - 1),
      }),
    );
  for (let slot = 1; slot <= 40; slot += 1)
    vehicles.push(
      mapVehicle({
        vehicleId: civilIdOf(slot),
        kind: 'CIVIL',
        slot,
        positionM: gridPosition(30 + slot - 1),
      }),
    );
  vehicles.push(
    mapVehicle({
      vehicleId: civilIdOf(41),
      kind: 'CIVIL',
      slot: 41,
      positionM: { x: -9.5, y: 0, z: -9.5 },
    }),
  );
  return mapSnapshot({
    followedVehicleId: taxiIdOf(12),
    vehicles: Object.freeze(vehicles),
    ...overrides,
  });
}

export interface MapSelectionHarness {
  readonly doc: HudDocument;
  readonly host: HudElement;
  readonly transform: MinimapTransform;
  readonly overlay: ReturnType<typeof createMapSelectionOverlay>;
  readonly selections: string[];
  root(): HudElement;
  markers(): HudElement[];
  markerFor(vehicleId: string): HudElement;
  dom(): string;
}

export function createMapSelectionHarness(
  options: { readonly maximumHz?: number; readonly transform?: MinimapTransform } = {},
): MapSelectionHarness {
  const doc = createHudDocument(),
    host = createHudHost(doc),
    selections: string[] = [],
    transform = options.transform ?? mapTransform(),
    overlay = createMapSelectionOverlay(host as unknown as HTMLElement, transform, {
      maximumHz: options.maximumHz,
      select: (vehicleId) => selections.push(vehicleId),
    }),
    requireRoot = (): HudElement => {
      const element = host.children[0];
      if (!element) throw new Error('Map selection root is missing');
      return element;
    },
    markers = (): HudElement[] => requireRoot().children.slice(1),
    markerFor = (vehicleId: string): HudElement => {
      const found = markers().find(
        (element) => element.getAttribute('data-vehicle-id') === vehicleId,
      );
      if (found === undefined) throw new Error(`Map marker is missing: ${vehicleId}`);
      return found;
    };
  return {
    doc,
    host,
    transform,
    overlay,
    selections,
    root: requireRoot,
    markers,
    markerFor,
    dom: () => serializeHud(requireRoot()),
  };
}
