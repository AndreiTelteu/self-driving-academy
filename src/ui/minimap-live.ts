import type { MinimapContext, MinimapFrame, MinimapGeometry } from './minimap-format';
import { createMinimap } from './minimap';
import type { MapSelectionSnapshot } from './map-selection-format';
import { createMapSelectionOverlay } from './map-selection';
import type { MinimapIncidentSnapshot } from './minimap-incidents';
import { createMinimapIncidentLayer } from './minimap-incidents';

export const LIVE_MINIMAP_VERSION = '281-live-minimap-v1' as const;

export interface LiveMinimapOptions {
  readonly geometry: MinimapGeometry;
  /** The 068/263 camera-only selection intention; this composition never moves or takes over a car. */
  readonly select: (vehicleId: string) => void;
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly paddingPx?: number;
  /** Shared ceiling for the three marker layers. Defaults to 10 Hz. */
  readonly maximumHz?: number;
  readonly contexts?: { readonly static: MinimapContext; readonly dynamic: MinimapContext };
}

/**
 * PBI 281 live minimap composition. It mounts the existing 074 map, the 076 selection overlay and
 * the 281 incident layer over one exact map box. Every layer keeps its own accepted snapshot and
 * stable identity; no route, vehicle, zone or incident is created here.
 */
export function createLiveMinimap(host: HTMLElement, options: LiveMinimapOptions) {
  if (typeof options.select !== 'function') throw new Error('Live minimap requires a select port');
  const maximumHz = options.maximumHz ?? 10;
  const minimap = createMinimap(host, options.geometry, {
    markerOverlay: true,
    maximumHz,
    ...(options.widthPx === undefined ? {} : { widthPx: options.widthPx }),
    ...(options.heightPx === undefined ? {} : { heightPx: options.heightPx }),
    ...(options.paddingPx === undefined ? {} : { paddingPx: options.paddingPx }),
    ...(options.contexts === undefined ? {} : { contexts: options.contexts }),
  });
  const mapHost = minimap.getMapHost(),
    transform = minimap.getTransform();
  if (mapHost === null || transform === null) {
    minimap.dispose();
    throw new Error('Live minimap requires the marker overlay box');
  }
  const selection = createMapSelectionOverlay(mapHost, transform, {
      maximumHz,
      select: options.select,
    }),
    incidents = createMinimapIncidentLayer(mapHost, transform, { maximumHz });
  let disposed = false,
    updates = 0;

  return Object.freeze({
    version: LIVE_MINIMAP_VERSION,
    update(
      frame: MinimapFrame,
      selectionSnapshot: MapSelectionSnapshot,
      incidentSnapshot: MinimapIncidentSnapshot,
      nowMs: number,
    ): void {
      if (disposed) throw new Error('Live minimap disposed');
      minimap.update(frame, nowMs);
      selection.update(selectionSnapshot, nowMs);
      incidents.update(incidentSnapshot, nowMs);
      updates += 1;
    },
    /** Presentation-only immediate followed marker; the next snapshot stays authoritative. */
    setFollowed(vehicleId: string | null): void {
      if (disposed) throw new Error('Live minimap disposed');
      selection.setFollowed(vehicleId);
    },
    getStats: () =>
      Object.freeze({
        version: LIVE_MINIMAP_VERSION,
        updates,
        disposed,
        map: minimap.getStats(),
        selection: selection.getStats(),
        incidents: incidents.getStats(),
        listeners: disposed ? 0 : selection.getStats().listeners,
        globalListeners: selection.getStats().globalListeners,
      }),
    getView: () => {
      if (disposed) return null;
      const map = minimap.getView(),
        selectionView = selection.getView(),
        incidentView = incidents.getView();
      return Object.freeze({
        map,
        selection: selectionView,
        incidents: incidentView,
      });
    },
    getRoot: () => minimap.getRoot(),
    getMapHost: () => minimap.getMapHost(),
    getTransform: () => minimap.getTransform(),
    dispose(): void {
      if (disposed) return;
      disposed = true;
      incidents.dispose();
      selection.dispose();
      minimap.dispose();
    },
  });
}

export type LiveMinimap = ReturnType<typeof createLiveMinimap>;
