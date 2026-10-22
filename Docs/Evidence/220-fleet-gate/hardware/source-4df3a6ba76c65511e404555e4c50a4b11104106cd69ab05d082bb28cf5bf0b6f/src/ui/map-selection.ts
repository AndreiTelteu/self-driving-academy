import type {
  MapSelectionProjection,
  MapSelectionSnapshot,
  MapMarkerProjection,
} from './map-selection-format';
import type { MinimapTransform } from './minimap-format';
import {
  MAP_SELECTION_LIMITS,
  MAP_SELECTION_VERSION,
  parseMapSelectionSnapshot,
  projectMapSelection,
} from './map-selection-format';

export interface MapSelectionOptions {
  /** Marker write/reorder ceiling. Defaults to 10 Hz; never tied to the tick rate. */
  readonly maximumHz?: number;
  /** Selection intent port. The overlay never moves, switches or takes over a vehicle itself. */
  readonly select?: (vehicleId: string) => void;
}

interface MarkerNodes {
  readonly button: HTMLButtonElement;
  readonly vehicleId: string;
  readonly onClick: () => void;
  selectable: boolean;
}

const DESCRIPTION_ID = 'map-selection-description';

function percent(value: number, extentPx: number): string {
  return `${((value / extentPx) * 100).toFixed(4)}%`;
}

/**
 * 076 map-selection overlay. It appends one absolutely positioned native `<button>` per vehicle to
 * the given host and keeps that element for the whole life of the vehicle identity (`vehicleId`).
 *
 * The host must be a positioned box that exactly covers the 074 minimap map area. Marker positions
 * are written as percentages of that box, so the overlay follows the CSS size of the minimap without
 * reading pixels back from the canvas.
 *
 * A click (or the native Enter/Space activation of a button) emits exactly one injected selection
 * intention. No global key listener is installed: the browser's native button behaviour is the whole
 * keyboard contract, and driving keys keep working while the minimap is visible. The adapter calls
 * no physics, camera move, teleport, fleet mutation or authority takeover.
 */
export function createMapSelectionOverlay(
  host: HTMLElement,
  transform: MinimapTransform,
  options: MapSelectionOptions = {},
) {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('Map selection requires an owned document');
  const maximumHz = options.maximumHz ?? MAP_SELECTION_LIMITS.maximumHz;
  if (!Number.isFinite(maximumHz) || maximumHz <= 0 || maximumHz > 60)
    throw new Error('Map selection write rate');
  if (!Number.isFinite(transform.widthPx) || !Number.isFinite(transform.heightPx))
    throw new Error('Map selection transform');
  if (transform.widthPx <= 0 || transform.heightPx <= 0) throw new Error('Map selection transform');
  const interval = 1000 / maximumHz;

  const root = doc.createElement('div'),
    description = doc.createElement('p');
  root.className = 'map-selection';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Selectare vehicule pe hartă');
  root.setAttribute('aria-describedby', DESCRIPTION_ID);
  description.className = 'map-selection__description';
  description.id = DESCRIPTION_ID;
  root.append(description);
  host.append(root);

  const markers = new Map<string, MarkerNodes>();
  let disposed = false,
    busy = false,
    emitting = false,
    current: MapSelectionSnapshot | null = null,
    rendered: readonly MapMarkerProjection[] = Object.freeze([]),
    lastClock = -Infinity,
    lastWrite = -Infinity,
    lastSignature = '',
    lastIdentity = '',
    created = 0,
    removed = 0,
    writes = 0,
    skipped = 0,
    updates = 0,
    listeners = 0;

  const mutate = (action: () => void) => {
    if (busy) throw new Error('Map selection reentrant');
    busy = true;
    try {
      action();
    } finally {
      busy = false;
    }
  };
  const assertLive = () => {
    if (disposed) throw new Error('Map selection disposed');
  };
  const set = (node: HTMLElement, value: string) => {
    if (node.textContent === value) return;
    node.textContent = value;
    writes += 1;
  };
  const attribute = (node: HTMLElement, name: string, value: string) => {
    if (node.getAttribute(name) === value) return;
    node.setAttribute(name, value);
    writes += 1;
  };
  const emit = (vehicleId: string) => {
    if (disposed || emitting) return;
    const nodes = markers.get(vehicleId);
    if (nodes === undefined || !nodes.selectable || options.select === undefined) return;
    emitting = true;
    try {
      options.select(vehicleId);
    } finally {
      emitting = false;
    }
  };
  const createMarker = (vehicleId: string): MarkerNodes => {
    const button = doc.createElement('button'),
      onClick = () => emit(vehicleId);
    button.className = 'map-selection__marker';
    button.setAttribute('type', 'button');
    button.setAttribute('data-vehicle-id', vehicleId);
    button.setAttribute('data-marker-id', vehicleId);
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('data-selected', 'false');
    button.addEventListener('click', onClick);
    listeners += 1;
    created += 1;
    return { button, vehicleId, onClick, selectable: true };
  };
  const renderMarker = (nodes: MarkerNodes, marker: MapMarkerProjection) => {
    nodes.selectable = marker.selectable;
    attribute(
      nodes.button,
      'style',
      `left: ${percent(marker.x, transform.widthPx)}; top: ${percent(marker.y, transform.heightPx)};`,
    );
    set(nodes.button, marker.symbol);
    attribute(nodes.button, 'aria-label', marker.description);
    attribute(nodes.button, 'aria-pressed', marker.selected ? 'true' : 'false');
    attribute(nodes.button, 'data-selected', marker.selected ? 'true' : 'false');
    attribute(nodes.button, 'data-kind', marker.kind);
    attribute(nodes.button, 'data-slot', String(marker.slot));
    attribute(nodes.button, 'data-label', marker.label);
    attribute(nodes.button, 'data-selectable', marker.selectable ? 'true' : 'false');
    if (marker.selectable && nodes.button.hasAttribute('disabled')) {
      nodes.button.removeAttribute('disabled');
      writes += 1;
    } else if (!marker.selectable && !nodes.button.hasAttribute('disabled')) {
      nodes.button.setAttribute('disabled', '');
      writes += 1;
    }
  };
  const render = (view: MapSelectionProjection, snapshot: MapSelectionSnapshot) => {
    const wanted = new Set(view.markers.map((marker) => marker.markerId));
    for (const [vehicleId, nodes] of markers) {
      if (wanted.has(vehicleId)) continue;
      nodes.button.removeEventListener('click', nodes.onClick);
      listeners -= 1;
      nodes.button.remove();
      markers.delete(vehicleId);
      removed += 1;
    }
    for (let index = 0; index < view.markers.length; index += 1) {
      const marker = view.markers[index]!;
      let nodes = markers.get(marker.markerId);
      if (nodes === undefined) {
        nodes = createMarker(marker.markerId);
        markers.set(marker.markerId, nodes);
      }
      const currentChild = root.children[index + 1] ?? null;
      if (currentChild !== nodes.button) root.insertBefore(nodes.button, currentChild);
      renderMarker(nodes, marker);
    }
    set(description, view.description);
    attribute(root, 'data-tick', String(snapshot.tick));
    attribute(root, 'data-followed', snapshot.followedVehicleId ?? '');
    attribute(root, 'data-markers', String(view.counts.total));
    attribute(root, 'data-taxis', String(view.counts.taxis));
    attribute(root, 'data-civilians', String(view.counts.civilians));
    attribute(
      root,
      'aria-label',
      `Selectare vehicule pe hartă · ${view.counts.taxis} taxiuri · ${view.counts.civilians} civile`,
    );
    rendered = view.markers;
    lastSignature = view.signature;
    updates += 1;
  };
  const identityOf = (snapshot: MapSelectionSnapshot): string =>
    JSON.stringify([
      snapshot.followedVehicleId,
      snapshot.vehicles.map((vehicle) => [vehicle.vehicleId, vehicle.kind, vehicle.selectable]),
    ]);

  return Object.freeze({
    update(candidate: MapSelectionSnapshot, nowMs: number) {
      mutate(() => {
        assertLive();
        const snapshot = parseMapSelectionSnapshot(candidate);
        if (!Number.isFinite(nowMs) || nowMs < lastClock) throw new Error('Map selection clock');
        if (
          current !== null &&
          current.sessionId === snapshot.sessionId &&
          current.worldEpoch === snapshot.worldEpoch &&
          snapshot.tick < current.tick
        )
          throw new Error('Stale map selection snapshot');
        lastClock = nowMs;
        const previous = current;
        current = snapshot;
        const view = projectMapSelection(transform, snapshot, { previous: rendered }),
          identity = identityOf(snapshot),
          bypass =
            previous === null ||
            (previous.followedVehicleId ?? null) !== (snapshot.followedVehicleId ?? null) ||
            identity !== lastIdentity;
        lastIdentity = identity;
        if (view.signature === lastSignature) {
          skipped += 1;
          return;
        }
        if (!bypass && nowMs - lastWrite < interval) {
          skipped += 1;
          return;
        }
        lastWrite = nowMs;
        render(view, snapshot);
      });
    },
    /** Immediate followed-marker update; the next accepted snapshot stays authoritative. */
    setFollowed(vehicleId: string | null) {
      mutate(() => {
        assertLive();
        if (vehicleId !== null && (typeof vehicleId !== 'string' || !vehicleId.trim()))
          throw new Error('Map selection followed vehicle');
        if (current === null) return;
        if (current.followedVehicleId === vehicleId) return;
        const snapshot: MapSelectionSnapshot = Object.freeze({
            ...current,
            followedVehicleId: vehicleId,
          }),
          view = projectMapSelection(transform, snapshot, { previous: rendered });
        current = snapshot;
        lastWrite = lastClock;
        lastIdentity = identityOf(snapshot);
        render(view, snapshot);
      });
    },
    getStats: () =>
      Object.freeze({
        version: MAP_SELECTION_VERSION,
        elements: disposed ? 0 : MAP_SELECTION_LIMITS.fixedElements + markers.size,
        textNodes: disposed ? 0 : 1 + markers.size,
        markers: disposed ? 0 : markers.size,
        created,
        removed,
        writes,
        skipped,
        updates,
        listeners,
        globalListeners: MAP_SELECTION_LIMITS.globalListeners,
        retainedFrames: disposed || current === null ? 0 : 1,
        disposed,
      }),
    /** The retained snapshot and its current projection; `null` before the first accepted update. */
    getView: () =>
      disposed || current === null ? null : Object.freeze({ snapshot: current, markers: rendered }),
    dispose() {
      mutate(() => {
        if (disposed) return;
        disposed = true;
        for (const nodes of markers.values()) {
          nodes.button.removeEventListener('click', nodes.onClick);
          nodes.button.remove();
        }
        markers.clear();
        listeners = 0;
        current = null;
        rendered = Object.freeze([]);
        root.remove();
      });
    },
  });
}

export type MapSelectionOverlay = ReturnType<typeof createMapSelectionOverlay>;
