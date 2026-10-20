import { readMinimapGeometry } from '../../src/app';
import { createMinimap } from '../../src/ui';
import type {
  MinimapContext,
  MinimapFrame,
  MinimapFrameRoute,
  MinimapGeometry,
} from '../../src/ui';
import { createLaneGraph } from '../../src/world';
import type { RoadMap } from '../../src/world';
import { minimalMap } from '../world/fixture';
import { createHudDocument, createHudHost } from './hud-dom';
import type { HudDocument, HudElement } from './hud-dom';

/**
 * The 032 minimal map plus a second real service zone on `lane-b`. Both zones stay reachable for
 * TAXI over the declared cycle (lane-a -> lane-b -> lane-c -> lane-a), so the parser accepts it.
 */
export function twoZoneMap(): RoadMap {
  const base = minimalMap();
  return {
    ...base,
    geometry: {
      ...base.geometry,
      nodes: [
        ...base.geometry.nodes,
        { id: 'z2-a', positionM: { x: 19, y: 0, z: -2 } },
        { id: 'z2-b', positionM: { x: 21, y: 0, z: -2 } },
        { id: 'z2-c', positionM: { x: 21, y: 0, z: 2 } },
        { id: 'z2-d', positionM: { x: 19, y: 0, z: 2 } },
      ],
      areas: [
        ...base.geometry.areas,
        { id: 'g-zone2', vertexNodeIds: ['z2-a', 'z2-b', 'z2-c', 'z2-d'] },
      ],
    },
    serviceZones: [
      ...base.serviceZones,
      {
        id: 'service-2',
        geometryId: 'g-zone2',
        laneId: 'lane-b',
        anchorNodeId: 'n-d',
        access: ['TAXI', 'CIVIL'],
        kind: 'DROPOFF',
      },
    ],
  };
}

export interface MapScene {
  readonly map: RoadMap;
  readonly graph: ReturnType<typeof createLaneGraph>;
  readonly geometry: MinimapGeometry;
}

export function sceneOf(map: RoadMap): MapScene {
  const graph = createLaneGraph(map);
  return { map, graph, geometry: readMinimapGeometry({ map, graph }) };
}

export function route(overrides: Partial<MinimapFrameRoute> = {}): MinimapFrameRoute {
  return Object.freeze({
    status: 'NO_ROUTE',
    reason: null,
    laneIds: null,
    leg: null,
    progressFraction: null,
    remainingDistanceM: null,
    etaSeconds: null,
    etaMinSeconds: null,
    etaMaxSeconds: null,
    serviceState: null,
    ...overrides,
  });
}

export function readyRoute(
  laneIds: readonly string[],
  overrides: Partial<MinimapFrameRoute> = {},
): MinimapFrameRoute {
  return route({
    status: 'READY',
    laneIds: Object.freeze([...laneIds]),
    leg: 'PICKUP',
    progressFraction: 0.25,
    remainingDistanceM: 120,
    etaSeconds: 90,
    etaMinSeconds: 80,
    etaMaxSeconds: 100,
    serviceState: 'FREE_FLOW',
    ...overrides,
  });
}

export function frame(overrides: Partial<MinimapFrame> = {}): MinimapFrame {
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    version: '074-minimap-v1',
    sessionId: 'session:074',
    worldEpoch: 0,
    tick: 10,
    taxi: null,
    positionM: null,
    headingRad: null,
    ride: null,
    route: route(),
    ...overrides,
  });
}

export interface RecordedCall {
  readonly op: string;
  readonly args: readonly (string | number)[];
}

export interface RecordingContext {
  readonly context: MinimapContext;
  readonly calls: RecordedCall[];
  reset(): void;
  texts(): readonly string[];
}

/** Minimal deterministic 2D port; records drawing calls instead of pixels. */
export function createRecordingContext(): RecordingContext {
  const calls: RecordedCall[] = [],
    push = (op: string, ...args: (string | number)[]) => {
      calls.push(Object.freeze({ op, args: Object.freeze(args) }));
    };
  const context: MinimapContext = {
    clearRect: (x, y, width, height) => push('clearRect', x, y, width, height),
    beginPath: () => push('beginPath'),
    moveTo: (x, y) => push('moveTo', x, y),
    lineTo: (x, y) => push('lineTo', x, y),
    closePath: () => push('closePath'),
    stroke: () => push('stroke'),
    fill: () => push('fill'),
    arc: (x, y, radius, startAngle, endAngle) => push('arc', x, y, radius, startAngle, endAngle),
    fillText: (text, x, y) => push('fillText', text, x, y),
    setLineDash: (segments) => push('setLineDash', ...segments),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
  };
  return {
    context,
    calls,
    reset() {
      calls.length = 0;
    },
    texts() {
      return calls.filter((call) => call.op === 'fillText').map((call) => String(call.args[0]));
    },
  };
}

export interface MinimapHarness {
  readonly doc: HudDocument;
  readonly host: HudElement;
  readonly minimap: ReturnType<typeof createMinimap>;
  readonly staticLayer: RecordingContext;
  readonly dynamicLayer: RecordingContext;
}

export function createMinimapHarness(
  geometry: MinimapGeometry,
  maximumHz?: number,
): MinimapHarness {
  const doc = createHudDocument(),
    host = createHudHost(doc),
    staticLayer = createRecordingContext(),
    dynamicLayer = createRecordingContext(),
    minimap = createMinimap(host as unknown as HTMLElement, geometry, {
      maximumHz,
      contexts: { static: staticLayer.context, dynamic: dynamicLayer.context },
    });
  return { doc, host, minimap, staticLayer, dynamicLayer };
}

/** Calls after the latest clearRect, i.e. the last painted frame on one canvas. */
export function lastFrameCalls(layer: RecordingContext): readonly RecordedCall[] {
  let start = -1;
  for (let index = layer.calls.length - 1; index >= 0; index -= 1)
    if (layer.calls[index]!.op === 'clearRect') {
      start = index;
      break;
    }
  return start === -1 ? [] : layer.calls.slice(start);
}

export function root(minimapHost: MinimapHarness): HudElement {
  const element = minimapHost.host.children[0];
  if (!element) throw new Error('Minimap root is missing');
  return element;
}
