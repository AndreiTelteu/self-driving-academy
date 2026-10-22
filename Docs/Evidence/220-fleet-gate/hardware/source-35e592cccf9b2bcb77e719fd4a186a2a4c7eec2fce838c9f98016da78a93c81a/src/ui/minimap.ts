import type {
  MinimapContext,
  MinimapFrame,
  MinimapGeometry,
  MinimapProjection,
  MinimapScene,
} from './minimap-format';
import {
  createMinimapScene,
  MINIMAP_LIMITS,
  MINIMAP_VERSION,
  paintMinimapLayer,
  parseMinimapFrame,
  projectMinimap,
} from './minimap-format';

export interface MinimapOptions {
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly paddingPx?: number;
  /** Repaint ceiling for markers and route. Defaults to 10 Hz; never tied to the tick rate. */
  readonly maximumHz?: number;
  /** Test/renderer port. The browser default is the two canvases' own 2D contexts. */
  readonly contexts?: { readonly static: MinimapContext; readonly dynamic: MinimapContext };
}

const DESCRIPTION_ID = 'minimap-description';

/**
 * 074 minimap adapter. Static road geometry is projected once onto a background canvas; the route
 * and markers live on a second canvas and are repainted at a capped rate, independent of the
 * authoritative tick. It draws no Babylon scene, opens no second camera and adds no listeners.
 */
export function createMinimap(
  host: HTMLElement,
  geometry: MinimapGeometry,
  options: MinimapOptions = {},
) {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('Minimap requires an owned document');
  const maximumHz = options.maximumHz ?? MINIMAP_LIMITS.maximumHz;
  if (!Number.isFinite(maximumHz) || maximumHz <= 0 || maximumHz > 60)
    throw new Error('Minimap repaint rate');
  let scene: MinimapScene | null = createMinimapScene(geometry, options);
  let elementCount = 0;
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    elementCount += 1;
    return node;
  };
  const root = element('section'),
    staticCanvas = element('canvas'),
    dynamicCanvas = element('canvas'),
    status = element('p'),
    routeValue = element('span'),
    etaValue = element('span'),
    progressValue = element('span'),
    description = element('p');
  root.className = 'minimap';
  root.setAttribute('aria-label', 'Minimapă nord-sus');
  staticCanvas.className = 'minimap__static';
  dynamicCanvas.className = 'minimap__dynamic';
  for (const canvas of [staticCanvas, dynamicCanvas]) {
    canvas.width = scene.transform.widthPx;
    canvas.height = scene.transform.heightPx;
    canvas.setAttribute('width', String(scene.transform.widthPx));
    canvas.setAttribute('height', String(scene.transform.heightPx));
    canvas.setAttribute('aria-hidden', 'true');
  }
  status.className = 'minimap__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  routeValue.className = 'minimap__route';
  etaValue.className = 'minimap__eta';
  progressValue.className = 'minimap__progress';
  status.append(routeValue, etaValue, progressValue);
  description.className = 'minimap__description';
  description.id = DESCRIPTION_ID;
  root.setAttribute('aria-describedby', DESCRIPTION_ID);
  root.append(staticCanvas, dynamicCanvas, status, description);
  host.append(root);

  const contextFor = (canvas: HTMLCanvasElement): MinimapContext => {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Minimap requires a 2D canvas context');
    return context;
  };
  const staticContext = options.contexts?.static ?? contextFor(staticCanvas),
    dynamicContext = options.contexts?.dynamic ?? contextFor(dynamicCanvas);

  let disposed = false,
    busy = false,
    staticPainted = false,
    staticPaints = 0,
    dynamicPaints = 0,
    updates = 0,
    writes = 0,
    skipped = 0,
    lastClock = -Infinity,
    lastPaint = -Infinity,
    lastIdentity = '',
    lastSignature = '',
    current: MinimapFrame | null = null,
    projection: MinimapProjection | null = null;
  const mutate = (action: () => void) => {
    if (busy) throw new Error('Minimap reentrant');
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
  const identityOf = (frame: MinimapFrame, view: MinimapProjection): string =>
    [
      frame.sessionId,
      frame.worldEpoch,
      frame.taxi?.vehicleId ?? '',
      frame.ride?.rideId ?? '',
      frame.ride?.state ?? '',
      frame.ride?.taxiId ?? '',
      frame.ride?.pickupZoneId ?? '',
      frame.ride?.dropoffZoneId ?? '',
      view.route.status,
      view.route.laneIds?.join(',') ?? '',
      view.route.reason ?? '',
    ].join('|');
  return Object.freeze({
    update(candidate: MinimapFrame, nowMs: number) {
      mutate(() => {
        if (disposed || scene === null) throw new Error('Minimap disposed');
        const frame = parseMinimapFrame(candidate);
        if (!Number.isFinite(nowMs) || nowMs < lastClock) throw new Error('Minimap clock');
        if (
          current !== null &&
          current.sessionId === frame.sessionId &&
          current.worldEpoch === frame.worldEpoch &&
          frame.tick < current.tick
        )
          throw new Error('Stale minimap frame');
        lastClock = nowMs;
        const view = projectMinimap(scene, frame),
          identity = identityOf(frame, view),
          identityChanged = current === null || identity !== lastIdentity;
        current = frame;
        lastIdentity = identity;
        if (!identityChanged && view.signature === lastSignature) {
          skipped += 1;
          return;
        }
        if (!identityChanged && nowMs - lastPaint < 1000 / maximumHz) {
          skipped += 1;
          return;
        }
        if (!staticPainted) {
          paintMinimapLayer(staticContext, view, 'static');
          staticPainted = true;
          staticPaints += 1;
        }
        paintMinimapLayer(dynamicContext, view, 'dynamic');
        dynamicPaints += 1;
        updates += 1;
        lastPaint = nowMs;
        lastSignature = view.signature;
        projection = view;
        set(routeValue, view.routeText);
        set(etaValue, view.etaText);
        set(progressValue, view.progressText);
        set(description, view.description);
        attribute(root, 'aria-label', `Minimapă nord-sus · ${view.routeText} · ${view.etaText}`);
        attribute(root, 'data-route', view.route.status);
        attribute(root, 'data-position', frame.positionM === null ? 'MISSING' : 'AVAILABLE');
        attribute(root, 'data-tick', String(frame.tick));
      });
    },
    getStats: () =>
      Object.freeze({
        version: MINIMAP_VERSION,
        elements: disposed ? 0 : elementCount,
        textNodes: disposed ? 0 : 4,
        listeners: 0,
        updates,
        writes,
        skipped,
        staticPaints,
        dynamicPaints,
        lanes: scene?.stats.lanes ?? 0,
        roads: scene?.stats.roads ?? 0,
        routeLanes: projection?.route.laneIds?.length ?? 0,
        retainedFrames: disposed ? 0 : current === null ? 0 : 1,
        disposed,
      }),
    dispose() {
      mutate(() => {
        if (disposed) return;
        disposed = true;
        scene = null;
        current = null;
        projection = null;
        root.remove();
      });
    },
  });
}
