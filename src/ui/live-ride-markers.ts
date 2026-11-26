import type { PassengerMarkerCommand, PassengerVisualPort } from './passenger-visual';

export const LIVE_RIDE_MARKERS_VERSION = '265-live-ride-markers-v1' as const;

export interface LiveRideMarkerCamera {
  readonly positionM: Readonly<{ x: number; y: number; z: number }>;
  readonly lookAtM: Readonly<{ x: number; y: number; z: number }>;
  readonly up: Readonly<{ x: number; y: number; z: number }>;
  readonly fovRadians: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface LiveRideMarkerLayerStats {
  readonly version: typeof LIVE_RIDE_MARKERS_VERSION;
  readonly markers: number;
  readonly projected: number;
  readonly hidden: number;
  readonly passengerVisible: boolean;
  readonly writes: number;
  readonly listeners: number;
  readonly disposed: boolean;
}

export interface LiveRideMarkerLayer {
  readonly version: typeof LIVE_RIDE_MARKERS_VERSION;
  /** The exact 147 port; setMarker/removeMarker are the only marker writers. */
  readonly port: PassengerVisualPort;
  /** Projects every retained marker with the accepted camera frame; no marker is invented. */
  project(camera: LiveRideMarkerCamera): void;
  getStats(): LiveRideMarkerLayerStats;
  dispose(): void;
}

interface MarkerNode {
  readonly command: PassengerMarkerCommand;
  readonly element: HTMLElement;
  visible: boolean;
}

const ROLE_TEXT = Object.freeze({
  PICKUP: 'ridicare',
  DROPOFF: 'predare',
  PASSENGER: 'pasager',
} as const);

const ROLE_CLASS: Readonly<Record<PassengerMarkerCommand['role'], string>> = Object.freeze({
  PICKUP: 'live-ride-marker--pickup',
  DROPOFF: 'live-ride-marker--dropoff',
  PASSENGER: 'live-ride-marker--passenger',
});

const STYLE_TEXT = `
.live-ride-markers { position: fixed; inset: 0; z-index: 30; pointer-events: none;
  overflow: hidden; font: 700 0.95rem/1 system-ui, -apple-system, "Segoe UI", sans-serif; }
.live-ride-markers[hidden] { display: none; }
.live-ride-marker { position: absolute; display: grid; place-items: center;
  width: 1.8rem; height: 1.8rem; border-radius: 50%; border: 2px solid #0b1a16;
  color: #07110d; background: #9fe0c5; transform: translate(-50%, -50%);
  box-shadow: 0 0.15rem 0.5rem rgba(0, 0, 0, 0.55); }
.live-ride-marker[data-role="DROPOFF"] { background: #ffd28a; }
.live-ride-marker[data-role="PASSENGER"] { background: #b8ecff; }
.live-ride-marker[data-visible="false"] { display: none; }
.live-ride-markers[data-passenger-visible="true"] .live-ride-marker--passenger { outline: 2px solid #f3f7fb; }
`;

function vec(x: number, y: number, z: number): Readonly<{ x: number; y: number; z: number }> {
  return Object.freeze({ x, y, z });
}

function subtract(
  left: Readonly<{ x: number; y: number; z: number }>,
  right: Readonly<{ x: number; y: number; z: number }>,
): Readonly<{ x: number; y: number; z: number }> {
  return vec(left.x - right.x, left.y - right.y, left.z - right.z);
}

function dot(
  left: Readonly<{ x: number; y: number; z: number }>,
  right: Readonly<{ x: number; y: number; z: number }>,
): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function cross(
  left: Readonly<{ x: number; y: number; z: number }>,
  right: Readonly<{ x: number; y: number; z: number }>,
): Readonly<{ x: number; y: number; z: number }> {
  return vec(
    left.y * right.z - left.z * right.y,
    left.z * right.x - left.x * right.z,
    left.x * right.y - left.y * right.x,
  );
}

function normalize(
  value: Readonly<{ x: number; y: number; z: number }>,
): Readonly<{ x: number; y: number; z: number }> | null {
  const length = Math.hypot(value.x, value.y, value.z);
  if (!Number.isFinite(length) || length < 1e-9) return null;
  return vec(value.x / length, value.y / length, value.z / length);
}

/**
 * PBI 265 world marker overlay. The layer is only a 147 marker port plus a camera projection of the
 * real 032 anchors: it never reads the lifecycle, never chooses a marker and never creates a point.
 * A marker behind the camera or outside the frame is hidden, not moved to an invented coordinate.
 */
export function createLiveRideMarkerLayer(host: HTMLElement): LiveRideMarkerLayer {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('Live ride markers require an owned document');
  const root = doc.createElement('div');
  root.className = 'live-ride-markers';
  root.setAttribute('data-live-ride-markers', LIVE_RIDE_MARKERS_VERSION);
  root.setAttribute('aria-hidden', 'true');
  root.hidden = true;
  host.append(root);
  const style = doc.createElement('style');
  style.setAttribute('data-live-ride-markers-style', LIVE_RIDE_MARKERS_VERSION);
  style.textContent = STYLE_TEXT;
  doc.head?.append(style);
  const nodes = new Map<string, MarkerNode>();
  let passengerVisible = false,
    writes = 0,
    disposed = false;

  function remove(markerId: string): void {
    const node = nodes.get(markerId);
    if (node === undefined) return;
    node.element.remove();
    nodes.delete(markerId);
    writes += 1;
  }

  const port: PassengerVisualPort = Object.freeze({
    setMarker(command: PassengerMarkerCommand): void {
      if (disposed) return;
      let node = nodes.get(command.markerId);
      if (node === undefined) {
        const element = doc.createElement('div');
        element.className = `live-ride-marker ${ROLE_CLASS[command.role]}`;
        element.setAttribute('data-marker-id', command.markerId);
        element.setAttribute('data-role', command.role);
        element.setAttribute('data-visible', 'false');
        const label = doc.createElement('span');
        label.textContent = command.label;
        label.setAttribute('aria-hidden', 'true');
        element.append(label);
        element.title = `${ROLE_TEXT[command.role]} · ${command.zoneId}`;
        root.append(element);
        node = { command, element, visible: false };
        nodes.set(command.markerId, node);
        writes += 1;
      }
      const element = node.element;
      if (element.getAttribute('data-zone') !== command.zoneId) {
        element.setAttribute('data-zone', command.zoneId);
        writes += 1;
      }
      const description = `${command.label} — ${ROLE_TEXT[command.role]} · ${command.zoneId}`;
      if (element.getAttribute('aria-label') !== description) {
        element.setAttribute('aria-label', description);
        writes += 1;
      }
      root.hidden = nodes.size === 0;
    },
    removeMarker(markerId: string): void {
      if (disposed) return;
      remove(markerId);
      root.hidden = nodes.size === 0;
    },
    setPassengerVisible(visible: boolean): void {
      if (disposed || passengerVisible === visible) return;
      passengerVisible = visible;
      root.setAttribute('data-passenger-visible', String(visible));
      writes += 1;
    },
    clear(): void {
      if (disposed) return;
      for (const markerId of [...nodes.keys()]) remove(markerId);
      if (passengerVisible) {
        passengerVisible = false;
        root.setAttribute('data-passenger-visible', 'false');
        writes += 1;
      }
      root.hidden = true;
    },
  });

  return Object.freeze({
    version: LIVE_RIDE_MARKERS_VERSION,
    port,
    project(camera: LiveRideMarkerCamera): void {
      if (disposed || nodes.size === 0) return;
      const forward = normalize(subtract(camera.lookAtM, camera.positionM));
      if (forward === null) return;
      const right = normalize(cross(forward, camera.up)) ?? vec(1, 0, 0);
      const up = normalize(cross(right, forward)) ?? vec(0, 1, 0);
      const tanHalf = Math.tan(Math.max(0.01, camera.fovRadians) / 2),
        width = Math.max(1, camera.widthPx),
        height = Math.max(1, camera.heightPx),
        aspect = width / height;
      for (const node of nodes.values()) {
        const rel = subtract(vec(node.command.x, 1.2, node.command.z), camera.positionM),
          depth = dot(rel, forward);
        let visible = false;
        if (depth > 0.25) {
          const ndcX = dot(rel, right) / (depth * tanHalf * aspect),
            ndcY = dot(rel, up) / (depth * tanHalf);
          if (Math.abs(ndcX) <= 1.4 && Math.abs(ndcY) <= 1.4) {
            const xPx = (ndcX * 0.5 + 0.5) * width,
              yPx = (0.5 - ndcY * 0.5) * height;
            const transform = `translate(-50%, -50%) translate(${xPx.toFixed(1)}px, ${yPx.toFixed(1)}px)`;
            if (node.element.style.transform !== transform) {
              node.element.style.transform = transform;
              writes += 1;
            }
            visible = true;
          }
        }
        if (node.visible !== visible) {
          node.visible = visible;
          node.element.setAttribute('data-visible', String(visible));
          writes += 1;
        }
      }
    },
    getStats: () => {
      let projected = 0;
      for (const node of nodes.values()) if (node.visible) projected += 1;
      return Object.freeze({
        version: LIVE_RIDE_MARKERS_VERSION,
        markers: disposed ? 0 : nodes.size,
        projected: disposed ? 0 : projected,
        hidden: disposed ? 0 : nodes.size - projected,
        passengerVisible: disposed ? false : passengerVisible,
        writes,
        listeners: 0,
        disposed,
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      nodes.clear();
      style.remove();
      root.remove();
    },
  });
}
