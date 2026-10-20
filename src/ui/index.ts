import type { BootstrapView } from '../rendering';
export { createRenderingView } from './rendering-view';
export { createDiagnosticsPanel } from './diagnostics-panel';

export function createBootstrapView(root: HTMLDivElement): BootstrapView {
  const title = document.createElement('h1');
  title.textContent = 'Self Driving Academy';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const engine = document.createElement('p');
  root.append(title, status, engine);
  return {
    show: (presentation) => {
      status.textContent = presentation.status;
      engine.textContent = presentation.engineLabel;
    },
    dispose: () => {
      title.remove();
      status.remove();
      engine.remove();
    },
  };
}

export { createControlModeHud, CONTROL_MODE_HUD_LIMITS } from './control-mode-hud';
export type { ControlModeHudView } from './control-mode-hud';
export * from './recovery-hud';
export { createTaxiHud } from './taxi-hud';
export { createMinimap } from './minimap';
export type { MinimapOptions } from './minimap';
export { createFleetPanel } from './fleet-panel';
export type { FleetPanel, FleetPanelOptions } from './fleet-panel';
export {
  fleetPanelBlockedSignature,
  FLEET_PANEL_FILTERS,
  FLEET_PANEL_FILTER_LABELS,
  FLEET_PANEL_LIMITS,
  FLEET_PANEL_SORTS,
  FLEET_PANEL_SORT_LABELS,
  FLEET_PANEL_VERSION,
  parseFleetPanelSnapshot,
  projectFleetPanel,
} from './fleet-panel-format';
export type {
  FleetPanelCounts,
  FleetPanelEta,
  FleetPanelEtaStatus,
  FleetPanelFilter,
  FleetPanelProjectionOptions,
  FleetPanelRide,
  FleetPanelRow,
  FleetPanelRowState,
  FleetPanelServiceState,
  FleetPanelSnapshot,
  FleetPanelSort,
  FleetPanelTaxi,
  FleetPanelView,
} from './fleet-panel-format';
export {
  createMinimapScene,
  createMinimapTransform,
  MINIMAP_LIMITS,
  MINIMAP_ROUTE_REASONS,
  MINIMAP_VERSION,
  paintMinimapLayer,
  parseMinimapFrame,
  projectMinimap,
  projectMinimapPoint,
} from './minimap-format';
export type {
  MinimapAreaCommand,
  MinimapBounds,
  MinimapContext,
  MinimapDynamicCommand,
  MinimapFrame,
  MinimapFrameRide,
  MinimapFrameRoute,
  MinimapFrameTaxi,
  MinimapGeometry,
  MinimapIntersectionGeometry,
  MinimapLaneGeometry,
  MinimapLayer,
  MinimapLeg,
  MinimapMarker,
  MinimapMarkerRole,
  MinimapMovementGeometry,
  MinimapPointM,
  MinimapPointPx,
  MinimapPositionM,
  MinimapProjection,
  MinimapRoadCommand,
  MinimapRouteCommand,
  MinimapRouteReason,
  MinimapRouteStatus,
  MinimapScene,
  MinimapSceneStats,
  MinimapServiceState,
  MinimapStaticCommand,
  MinimapTransform,
  MinimapZoneGeometry,
} from './minimap-format';
export {
  formatDuration,
  formatDistanceM,
  formatEtaRange,
  formatSpeedKmh,
  modeView,
  parseTaxiHudSnapshot,
  projectTaxiHud,
  rideStageView,
  TAXI_HUD_LIMITS,
  TAXI_HUD_VERSION,
} from './taxi-hud-format';
export type {
  TaxiHudDetail,
  TaxiHudEta,
  TaxiHudEtaStatus,
  TaxiHudModeView,
  TaxiHudProjection,
  TaxiHudRide,
  TaxiHudServiceState,
  TaxiHudSnapshot,
  TaxiHudSpeedView,
  TaxiHudStageView,
  TaxiHudTaxi,
} from './taxi-hud-format';
