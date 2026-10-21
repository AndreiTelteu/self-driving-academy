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
export { createProfilePanel } from './profile-panel';
export type { ProfilePanel, ProfilePanelOptions } from './profile-panel';
export { createLearningNotifications } from './learning-notifications';
export type {
  LearningNotificationAnnouncer,
  LearningNotifications,
  LearningNotificationsOptions,
  LearningNotificationPushResult,
  LearningNotificationPushStatus,
} from './learning-notifications';
export {
  LEARNING_NOTIFICATION_LIMITS,
  LEARNING_NOTIFICATION_POLICY,
  LEARNING_NOTIFICATION_VERSION,
  createLearningNotificationState,
  dismissLearningNotification,
  expireLearningNotifications,
  formatLearningNotificationNumber,
  isLearningNotificationStale,
  learningNotificationDedupeKey,
  learningNotificationFailureKinds,
  learningNotificationKindView,
  learningNotificationKinds,
  learningNotificationMissingStates,
  learningNotificationModes,
  learningNotificationSoundCues,
  parseLearningNotificationEvent,
  projectLearningNotifications,
  reduceLearningNotifications,
} from './learning-notification-format';
export type {
  LearningNotificationAnalyzing,
  LearningNotificationCancelled,
  LearningNotificationCounters,
  LearningNotificationCounts,
  LearningNotificationCurrentJob,
  LearningNotificationDedupeRow,
  LearningNotificationEntry,
  LearningNotificationError,
  LearningNotificationEvent,
  LearningNotificationIdentity,
  LearningNotificationInsufficientEvidence,
  LearningNotificationInvalidated,
  LearningNotificationItem,
  LearningNotificationKind,
  LearningNotificationKindView,
  LearningNotificationMissingObservation,
  LearningNotificationMissingState,
  LearningNotificationMissingView,
  LearningNotificationMode,
  LearningNotificationNoChange,
  LearningNotificationPolicy,
  LearningNotificationPublished,
  LearningNotificationRejected,
  LearningNotificationResult,
  LearningNotificationSoundCue,
  LearningNotificationStale,
  LearningNotificationState,
  LearningNotificationView,
} from './learning-notification-format';
export { createProfileHistoryPanel } from './profile-history';
export type {
  ProfileHistoryOptions,
  ProfileHistoryPanel,
  ProfileHistoryRestoreResult,
} from './profile-history';
export {
  PROFILE_HISTORY_AVAILABLE_TEXT,
  PROFILE_HISTORY_CHANGE_WITHOUT_REASON,
  PROFILE_HISTORY_CONFIRM_LABEL,
  PROFILE_HISTORY_CONFIRM_RULE,
  PROFILE_HISTORY_EMPTY_DETAIL,
  PROFILE_HISTORY_EMPTY_TEXT,
  PROFILE_HISTORY_INCOMPATIBILITY_LABELS,
  PROFILE_HISTORY_LIMITS,
  PROFILE_HISTORY_NO_CHANGES,
  PROFILE_HISTORY_NOT_CONNECTED,
  PROFILE_HISTORY_PREVIEW_EMPTY,
  PROFILE_HISTORY_PREVIEW_MISSING,
  PROFILE_HISTORY_PREVIEW_SAME,
  PROFILE_HISTORY_RESTORE_LABEL,
  PROFILE_HISTORY_RESTORE_REASON_LABELS,
  PROFILE_HISTORY_VERSION,
  deriveProfileHistoryChanges,
  parseProfileHistorySnapshot,
  projectProfileHistory,
  profileHistoryIncompatibilities,
  profileHistoryRestoreReasons,
} from './profile-history-format';
export type {
  ProfileHistoryAction,
  ProfileHistoryChange,
  ProfileHistoryChangeDerivation,
  ProfileHistoryChangeRow,
  ProfileHistoryChangeSource,
  ProfileHistoryCounts,
  ProfileHistoryEntry,
  ProfileHistoryIncompatibility,
  ProfileHistoryOrigin,
  ProfileHistoryPreview,
  ProfileHistoryPreviewView,
  ProfileHistoryRestoreReason,
  ProfileHistoryRestoreState,
  ProfileHistoryRestoreView,
  ProfileHistoryRow,
  ProfileHistorySnapshot,
  ProfileHistoryVersionValues,
  ProfileHistoryView,
} from './profile-history-format';
export { createMapSelectionOverlay } from './map-selection';
export type { MapSelectionOptions, MapSelectionOverlay } from './map-selection';
export {
  createKeyRemappingPanel,
  KEY_REMAPPING_CANCEL_LABEL,
  KEY_REMAPPING_CAPTURE_PROMPT,
  KEY_REMAPPING_NOTE,
  KEY_REMAPPING_PANEL_LIMITS,
  KEY_REMAPPING_RESET_CONFIRM_LABEL,
  KEY_REMAPPING_RESET_LABEL,
  KEY_REMAPPING_SAVE_LABEL,
} from './key-remapping';
export type { KeyRemappingPanel, KeyRemappingPanelOptions } from './key-remapping';
export {
  createKeyRemappingDraft,
  clearBinding,
  formatKeyCode,
  isCriticalKeyAction,
  isSupportedKeyCode,
  KEY_REMAPPING_ACTIONS,
  KEY_REMAPPING_CODE_PATTERN,
  KEY_REMAPPING_CRITICAL_ACTIONS,
  KEY_REMAPPING_LABELS,
  KEY_REMAPPING_LIMITS,
  KEY_REMAPPING_MODIFIER_ONLY,
  KEY_REMAPPING_REJECTIONS,
  KEY_REMAPPING_REJECTION_LABELS,
  KEY_REMAPPING_RESERVED_CODES,
  KEY_REMAPPING_STATE_LABELS,
  KEY_REMAPPING_STATE_SYMBOLS,
  KEY_REMAPPING_VERSION,
  keyRemappingBindings,
  keyRemappingHasChanges,
  normalizeKeyCode,
  parseKeyRemappingDraft,
  projectKeyRemapping,
  resetBindings,
  revertBindings,
  setBinding,
} from './key-remapping-format';
export type {
  KeyRemappingAction,
  KeyRemappingCodeAccepted,
  KeyRemappingCodeRejected,
  KeyRemappingCodeResult,
  KeyRemappingConflict,
  KeyRemappingDraft,
  KeyRemappingDraftInput,
  KeyRemappingProjection,
  KeyRemappingRejection,
  KeyRemappingResult,
  KeyRemappingRow,
  KeyRemappingRowState,
  KeyRemappingSaveState,
  KeyRemappingStatus,
} from './key-remapping-format';
export {
  hitTestMapMarker,
  MAP_SELECTION_LIMITS,
  MAP_SELECTION_VERSION,
  parseMapSelectionSnapshot,
  projectMapSelection,
} from './map-selection-format';
export type {
  MapMarkerHit,
  MapMarkerHitOptions,
  MapMarkerProjection,
  MapSelectionCounts,
  MapSelectionKind,
  MapSelectionPositionM,
  MapSelectionProjection,
  MapSelectionProjectionOptions,
  MapSelectionSnapshot,
  MapSelectionVehicle,
} from './map-selection-format';
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
  PROFILE_PANEL_ILLUSTRATIVE_BANNER,
  PROFILE_PANEL_LIMITS,
  PROFILE_PANEL_VERSION,
  createIllustrativeProfilePanel,
  formatProfilePanelNumber,
  isProfilePanelReserved,
  parseProfilePanelSnapshot,
  profilePanelUnitLabel,
  projectProfilePanel,
} from './profile-panel-format';
export type {
  ProfilePanelCounts,
  ProfilePanelDelta,
  ProfilePanelDeltaChange,
  ProfilePanelDeltaRow,
  ProfilePanelDeltaView,
  ProfilePanelIllustrativeInput,
  ProfilePanelParameter,
  ProfilePanelProfileIdentity,
  ProfilePanelReason,
  ProfilePanelRow,
  ProfilePanelSection,
  ProfilePanelSnapshot,
  ProfilePanelSource,
  ProfilePanelStatus,
  ProfilePanelView,
} from './profile-panel-format';
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
export { createCityDashboard } from './city-dashboard';
export type { CityDashboard, CityDashboardOptions } from './city-dashboard';
export {
  CITY_DASHBOARD_LIMITS,
  CITY_DASHBOARD_NO_INCIDENT,
  CITY_DASHBOARD_UNAVAILABLE_POSITION,
  CITY_DASHBOARD_UNAVAILABLE_VALUE,
  CITY_DASHBOARD_VERSION,
  CITY_FOCUS_UNAVAILABLE_REASONS,
  CITY_INCIDENT_KINDS,
  CITY_INCIDENT_KIND_LABELS,
  CITY_INCIDENT_SEVERITIES,
  CITY_INCIDENT_SEVERITY_LABELS,
  CITY_METRIC_IDS,
  CITY_METRIC_LABELS,
  CITY_METRIC_REASONS,
  CITY_METRIC_REASON_LABELS,
  CITY_METRIC_STATES,
  CITY_METRIC_STATE_LABELS,
  CITY_METRIC_UNITS,
  CITY_METRIC_UNIT_BY_ID,
  CITY_METRIC_UNIT_LABELS,
  cityDashboardIncidentSignature,
  cityExposureView,
  cityIncidentRow,
  cityMetricView,
  compareCityIncidents,
  parseCityDashboardSnapshot,
  projectCityDashboard,
  selectIncident,
} from './city-dashboard-format';
export type {
  CityDashboardCounts,
  CityDashboardSnapshot,
  CityDashboardView,
  CityDrilldownReason,
  CityDrilldownStatus,
  CityExposure,
  CityExposureView,
  CityFocusIntent,
  CityFocusUnavailableReason,
  CityIncident,
  CityIncidentDrilldown,
  CityIncidentKind,
  CityIncidentPositionM,
  CityIncidentRow,
  CityIncidentSelection,
  CityIncidentSeverity,
  CityMetric,
  CityMetricId,
  CityMetricObservation,
  CityMetricReason,
  CityMetricState,
  CityMetricUnit,
  CityMetricView,
} from './city-dashboard-format';
