import type { MinimapTransform } from './minimap-format';
import { projectMinimapPoint } from './minimap-format';

/**
 * PBI 281 incident marker layer. It draws only incidents produced by the real 065 health owner
 * (`COLLISION_DAMAGE` / `DAMAGED`) at the current authoritative position of the affected taxi.
 * The marker identity is the 065 `factId`; a moved taxi updates the same DOM node. No incident is
 * invented when the health owner is unavailable or the taxi position is unknown.
 */
export const MINIMAP_INCIDENTS_VERSION = '281-minimap-incidents-v1' as const;

export const MINIMAP_INCIDENT_LIMITS = Object.freeze({
  version: MINIMAP_INCIDENTS_VERSION,
  incidents: 64,
  maximumHz: 10,
  idCodeUnits: 512,
  labelCodeUnits: 256,
  idCodeUnitsPerSnapshot: 512,
});

export type MinimapIncidentKind = 'COLLISION_DAMAGE';
export type MinimapIncidentHealth = 'AVAILABLE' | 'UNAVAILABLE';

export interface MinimapIncident {
  /** Stable 065 `factId`; the DOM node is reused for the whole life of this identity. */
  readonly incidentId: string;
  readonly vehicleId: string;
  readonly kind: MinimapIncidentKind;
  readonly positionM: Readonly<{ x: number; z: number }>;
  /** Accepted 065 tick that produced the fact. */
  readonly tick: number;
  readonly label: string;
}

export interface MinimapIncidentSnapshot {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly version: typeof MINIMAP_INCIDENTS_VERSION;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly tick: number;
  /** `UNAVAILABLE` is the explicit absence of the 065 owner, never "zero incidents". */
  readonly health: MinimapIncidentHealth;
  readonly incidents: readonly MinimapIncident[];
}

export interface MinimapIncidentMarker {
  readonly incidentId: string;
  readonly vehicleId: string;
  readonly kind: MinimapIncidentKind;
  readonly x: number;
  readonly y: number;
  readonly tick: number;
  readonly label: string;
  readonly description: string;
}

export interface MinimapIncidentsProjection {
  readonly markers: readonly MinimapIncidentMarker[];
  readonly description: string;
  readonly signature: string;
}

function fail(message: string): never {
  throw new Error(message);
}

function plain(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${label} must be plain data`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${label} must be plain data`);
  return value as Record<string, unknown>;
}

function exact(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  const data = plain(value, label),
    names = Reflect.ownKeys(data);
  if (
    names.length !== keys.length ||
    names.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    fail(`${label} fields`);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(data, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      fail(`${label} descriptors`);
  }
  return data;
}

function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    fail(`${label} identity`);
  return value;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} must be finite`);
  return value;
}

function count(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    fail(`${label} must be a nonnegative integer`);
  return value;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Strict accepted frame; a malformed incident is rejected before any DOM write. */
export function parseMinimapIncidentSnapshot(value: unknown): MinimapIncidentSnapshot {
  const data = exact(
      value,
      [
        'schemaVersion',
        'units',
        'version',
        'sessionId',
        'worldEpoch',
        'tick',
        'health',
        'incidents',
      ],
      'Minimap incidents snapshot',
    ),
    incidents = data.incidents;
  if (
    data.schemaVersion !== 1 ||
    data.units !== 'SI' ||
    data.version !== MINIMAP_INCIDENTS_VERSION ||
    (data.health !== 'AVAILABLE' && data.health !== 'UNAVAILABLE')
  )
    fail('Minimap incidents contract');
  if (!Array.isArray(incidents)) fail('Minimap incidents must be an array');
  if (incidents.length > MINIMAP_INCIDENT_LIMITS.incidents) fail('Minimap incident ceiling');
  if (data.health === 'UNAVAILABLE' && incidents.length > 0)
    fail('Unavailable minimap incidents must be empty');
  const ids = new Set<string>(),
    parsed = incidents.map((entry, index) => {
      const incident = exact(
          entry,
          ['incidentId', 'vehicleId', 'kind', 'positionM', 'tick', 'label'],
          `Minimap incident[${index}]`,
        ),
        position = exact(incident.positionM, ['x', 'z'], `Minimap incident[${index}] position`),
        incidentId = text(
          incident.incidentId,
          `Minimap incident[${index}] id`,
          MINIMAP_INCIDENT_LIMITS.idCodeUnits,
        );
      if (ids.has(incidentId)) fail('Minimap incident identity is duplicated');
      ids.add(incidentId);
      if (incident.kind !== 'COLLISION_DAMAGE') fail('Minimap incident kind');
      return Object.freeze({
        incidentId,
        vehicleId: text(
          incident.vehicleId,
          `Minimap incident[${index}] vehicle`,
          MINIMAP_INCIDENT_LIMITS.idCodeUnits,
        ),
        kind: 'COLLISION_DAMAGE' as const,
        positionM: Object.freeze({
          x: finite(position.x, `Minimap incident[${index}] x`),
          z: finite(position.z, `Minimap incident[${index}] z`),
        }),
        tick: count(incident.tick, `Minimap incident[${index}] tick`),
        label: text(
          incident.label,
          `Minimap incident[${index}] label`,
          MINIMAP_INCIDENT_LIMITS.labelCodeUnits,
        ),
      });
    });
  parsed.sort((left, right) => compareText(left.incidentId, right.incidentId));
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    version: MINIMAP_INCIDENTS_VERSION,
    sessionId: text(
      data.sessionId,
      'Minimap incidents session',
      MINIMAP_INCIDENT_LIMITS.idCodeUnitsPerSnapshot,
    ),
    worldEpoch: count(data.worldEpoch, 'Minimap incidents world epoch'),
    tick: count(data.tick, 'Minimap incidents tick'),
    health: data.health as MinimapIncidentHealth,
    incidents: Object.freeze(parsed),
  });
}

function markerDescription(incident: MinimapIncident): string {
  return `Incident ${incident.kind} la ${incident.label}, tick ${incident.tick}`;
}

/** Pure projection: the same transform as the 074 minimap, no marker is snapped or invented. */
export function projectMinimapIncidents(
  transform: MinimapTransform,
  snapshot: MinimapIncidentSnapshot,
): MinimapIncidentsProjection {
  if (!Number.isFinite(transform.widthPx) || !Number.isFinite(transform.heightPx))
    fail('Minimap incident transform');
  const markers = snapshot.incidents.map((incident) => {
      const point = projectMinimapPoint(transform, incident.positionM);
      return Object.freeze({
        incidentId: incident.incidentId,
        vehicleId: incident.vehicleId,
        kind: incident.kind,
        x: point.x,
        y: point.y,
        tick: incident.tick,
        label: incident.label,
        description: markerDescription(incident),
      });
    }),
    description =
      snapshot.health === 'UNAVAILABLE'
        ? 'Incidentele nu sunt disponibile: 065 nu este montat.'
        : markers.length === 0
          ? 'Niciun incident activ.'
          : `${markers.length} incidente active.`;
  return Object.freeze({
    markers: Object.freeze(markers),
    description,
    signature: JSON.stringify([
      snapshot.health,
      markers.map((marker) => [
        marker.incidentId,
        marker.vehicleId,
        marker.kind,
        marker.x.toFixed(3),
        marker.y.toFixed(3),
        marker.tick,
      ]),
    ]),
  });
}

export interface MinimapIncidentLayerOptions {
  /** Marker write ceiling. Defaults to 10 Hz; never tied to the authoritative tick. */
  readonly maximumHz?: number;
}

interface IncidentNode {
  readonly element: HTMLSpanElement;
  readonly incidentId: string;
}

const DESCRIPTION_ID = 'minimap-incidents-description';

function percent(value: number, extentPx: number): string {
  return `${((value / extentPx) * 100).toFixed(4)}%`;
}

/**
 * DOM/canvas-free incident markers. One `<span role="img">` per 065 fact, absolutely positioned as
 * a percentage of the same map box as the 076 buttons. No listener, focus or keyboard capture is
 * installed; the layer is `pointer-events: none` so it never blocks a taxi marker.
 */
export function createMinimapIncidentLayer(
  host: HTMLElement,
  transform: MinimapTransform,
  options: MinimapIncidentLayerOptions = {},
) {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('Minimap incidents require an owned document');
  const maximumHz = options.maximumHz ?? MINIMAP_INCIDENT_LIMITS.maximumHz;
  if (!Number.isFinite(maximumHz) || maximumHz <= 0 || maximumHz > 60)
    throw new Error('Minimap incident write rate');
  if (
    !Number.isFinite(transform.widthPx) ||
    !Number.isFinite(transform.heightPx) ||
    transform.widthPx <= 0 ||
    transform.heightPx <= 0
  )
    throw new Error('Minimap incident transform');
  const interval = 1000 / maximumHz,
    root = doc.createElement('div'),
    description = doc.createElement('p');
  root.className = 'minimap-incidents';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Incidente pe hartă');
  root.setAttribute('aria-describedby', DESCRIPTION_ID);
  description.className = 'minimap-incidents__description';
  description.id = DESCRIPTION_ID;
  root.append(description);
  host.append(root);

  const markers = new Map<string, IncidentNode>();
  let disposed = false,
    busy = false,
    current: MinimapIncidentSnapshot | null = null,
    rendered: readonly MinimapIncidentMarker[] = Object.freeze([]),
    lastClock = -Infinity,
    lastWrite = -Infinity,
    lastSignature = '',
    lastIdentity = '',
    created = 0,
    removed = 0,
    writes = 0,
    skipped = 0,
    updates = 0;

  const mutate = (action: () => void) => {
    if (busy) throw new Error('Minimap incidents reentrant');
    busy = true;
    try {
      action();
    } finally {
      busy = false;
    }
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
  const createMarker = (incidentId: string): IncidentNode => {
    const element = doc.createElement('span');
    element.className = 'minimap-incidents__marker';
    element.setAttribute('role', 'img');
    element.setAttribute('data-incident-id', incidentId);
    created += 1;
    return { element, incidentId };
  };
  const render = (view: MinimapIncidentsProjection, snapshot: MinimapIncidentSnapshot) => {
    const wanted = new Set(view.markers.map((marker) => marker.incidentId));
    for (const [incidentId, nodes] of markers) {
      if (wanted.has(incidentId)) continue;
      nodes.element.remove();
      markers.delete(incidentId);
      removed += 1;
    }
    for (let index = 0; index < view.markers.length; index += 1) {
      const marker = view.markers[index]!;
      let nodes = markers.get(marker.incidentId);
      if (nodes === undefined) {
        nodes = createMarker(marker.incidentId);
        markers.set(marker.incidentId, nodes);
      }
      const currentChild = root.children[index + 1] ?? null;
      if (currentChild !== nodes.element) root.insertBefore(nodes.element, currentChild);
      attribute(
        nodes.element,
        'style',
        `left: ${percent(marker.x, transform.widthPx)}; top: ${percent(marker.y, transform.heightPx)};`,
      );
      set(nodes.element, '!');
      attribute(nodes.element, 'aria-label', marker.description);
      attribute(nodes.element, 'data-vehicle-id', marker.vehicleId);
      attribute(nodes.element, 'data-kind', marker.kind);
      attribute(nodes.element, 'data-tick', String(marker.tick));
    }
    set(description, view.description);
    attribute(root, 'data-tick', String(snapshot.tick));
    attribute(root, 'data-health', snapshot.health);
    attribute(root, 'data-count', String(view.markers.length));
    attribute(
      root,
      'aria-label',
      `Incidente pe hartă · ${view.markers.length} active · ${snapshot.health}`,
    );
    rendered = view.markers;
    lastSignature = view.signature;
    updates += 1;
  };
  const identityOf = (snapshot: MinimapIncidentSnapshot): string =>
    snapshot.incidents.map((incident) => incident.incidentId).join('|');

  return Object.freeze({
    update(candidate: MinimapIncidentSnapshot, nowMs: number) {
      mutate(() => {
        if (disposed) throw new Error('Minimap incidents disposed');
        const snapshot = parseMinimapIncidentSnapshot(candidate);
        if (!Number.isFinite(nowMs) || nowMs < lastClock)
          throw new Error('Minimap incidents clock');
        if (
          current !== null &&
          current.sessionId === snapshot.sessionId &&
          current.worldEpoch === snapshot.worldEpoch &&
          snapshot.tick < current.tick
        )
          throw new Error('Stale minimap incidents snapshot');
        lastClock = nowMs;
        const previousHealth = current?.health ?? null;
        current = snapshot;
        const view = projectMinimapIncidents(transform, snapshot),
          identity = identityOf(snapshot),
          bypass = identity !== lastIdentity || previousHealth !== snapshot.health;
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
    getStats: () =>
      Object.freeze({
        version: MINIMAP_INCIDENTS_VERSION,
        elements: disposed ? 0 : 2 + markers.size,
        markers: disposed ? 0 : markers.size,
        created,
        removed,
        writes,
        skipped,
        updates,
        listeners: 0,
        retainedFrames: disposed || current === null ? 0 : 1,
        disposed,
      }),
    getView: () =>
      disposed || current === null ? null : Object.freeze({ snapshot: current, markers: rendered }),
    dispose() {
      mutate(() => {
        if (disposed) return;
        disposed = true;
        for (const nodes of markers.values()) nodes.element.remove();
        markers.clear();
        current = null;
        rendered = Object.freeze([]);
        root.remove();
      });
    },
  });
}

export type MinimapIncidentLayer = ReturnType<typeof createMinimapIncidentLayer>;
