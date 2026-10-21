import { createBootstrapSimulation } from '../simulation';
export { createVehicleRecoveryFeature } from './vehicle-recovery';
import type { SnapshotStore } from '../persistence';
import type { Renderer } from '../rendering';
export { createRenderingLifecycle, type RenderingState } from './rendering-lifecycle';
export {
  createRendererRecovery,
  ownRecoverySnapshot,
  type RecoveryRenderer,
  type RendererRecoveryState,
  type RendererRecoveryServices,
} from './renderer-recovery';

export interface ApplicationServices {
  readonly renderer: Renderer;
  readonly snapshotStore: SnapshotStore;
}

export interface Application {
  start(): void;
  saveSnapshot(): Promise<void>;
  dispose(): void;
}

/** Composition/lifecycle owns adapters; domain modules do not know them. */
export function createApplication(services: ApplicationServices): Application {
  const simulation = createBootstrapSimulation();
  let started = false;
  let disposed = false;
  const assertActive = (): void => {
    if (disposed) throw new Error('Aplicația este deja eliberată.');
  };
  return {
    start: () => {
      assertActive();
      if (started) return;
      services.renderer.present(simulation.getSnapshot());
      started = true;
    },
    saveSnapshot: () => {
      assertActive();
      return services.snapshotStore.save(simulation.getSnapshot());
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      services.renderer.dispose();
    },
  };
}
export {
  createApplicationLifecycle,
  type ApplicationPauseReason,
  type ApplicationState,
} from './application-lifecycle';
export {
  createPauseFocusOwner,
  PAUSE_FOCUS_MAX_HELD_COMMANDS,
  PAUSE_FOCUS_VERSION,
  type PauseFocusCause,
  type PauseFocusMode,
  type PauseFocusOwner,
  type PauseFocusPorts,
  type PauseFocusState,
  type PauseFocusStats,
  type PauseFocusSurface,
} from './pause-focus';
export { createManualSegmentBridge, type ManualSegmentStepCause } from './manual-segment-bridge';
export { readTaxiHudSnapshot, type TaxiHudFrame, type TaxiHudSources } from './taxi-hud';
export {
  createFleetPanelSelectPort,
  readFleetPanelSnapshot,
  type FleetPanelFrame,
  type FleetPanelSelectionSources,
  type FleetPanelSources,
} from './fleet-panel';
export {
  CITY_COLLISION_SEVERITY_BANDS,
  createCityCollisionLog,
  createCityDashboardFocusPort,
  readCityDashboardSnapshot,
  type CityCollisionLog,
  type CityCollisionLogStats,
  type CityCollisionSource,
  type CityDashboardExposureProvider,
  type CityDashboardFrame,
  type CityDashboardMetricsProvider,
  type CityDashboardSources,
  type CityExposureObservation,
  type CityFocusMapPort,
} from './city-dashboard';
export {
  PROFILE_PANEL_LOCAL_CONTEXT,
  PROFILE_PANEL_READ_ERRORS,
  readProfilePanelSnapshot,
  type ProfilePanelFrame,
  type ProfilePanelSources,
} from './profile-panel';
export {
  createProfileHistoryPorts,
  planProfileRestore,
  PROFILE_HISTORY_LOCAL_CONTEXT,
  PROFILE_HISTORY_READ_ERRORS,
  PROFILE_HISTORY_RESERVED_KEYS,
  readProfileHistorySnapshot,
  type ProfileHistoryFrame,
  type ProfileHistoryPortOptions,
  type ProfileHistoryPorts,
  type ProfileHistoryRestoreHandler,
  type ProfileHistoryRestoreOutcome,
  type ProfileHistoryRestoreRequest,
  type ProfileHistorySources,
  type ProfileRestorePlan,
  type ProfileRestorePlanInput,
} from './profile-history';
export {
  createCityProfileSource,
  profileActivationAppErrors,
  PROFILE_ACTIVATION_APP_VERSION,
  publishProfileVersion,
  readProfileActivation,
  type ProfileActivationAppError,
  type ProfileActivationAppRejection,
  type ProfileActivationPublishAccepted,
  type ProfileActivationPublishRejected,
  type ProfileActivationPublishRequest,
  type ProfileActivationPublishResult,
  type ProfileActivationPublishSources,
  type ProfileActivationReadAccepted,
  type ProfileActivationReadRejected,
  type ProfileActivationReadRequest,
  type ProfileActivationReadResult,
  type ProfileActivationReadSources,
} from './profile-activation';
export {
  readMinimapFrame,
  readMinimapGeometry,
  type MinimapFrameInput,
  type MinimapGeometrySources,
  type MinimapSources,
} from './minimap';
export {
  createMapSelectionPort,
  readMapSelectionSnapshot,
  type MapSelectionCamera,
  type MapSelectionFrame,
  type MapSelectionPortSources,
  type MapSelectionSources,
} from './map-selection';
export {
  createManualTrip,
  manualTripContractFacts,
  MANUAL_TRIP_LIMITS,
  MANUAL_TRIP_REFUSAL_REASONS,
  MANUAL_TRIP_VERSION,
  type ManualTrip,
  type ManualTripBegin,
  type ManualTripContinuityPorts,
  type ManualTripMode,
  type ManualTripModeRequest,
  type ManualTripObservation,
  type ManualTripOptions,
  type ManualTripProfile,
  type ManualTripPublication,
  type ManualTripRefusal,
  type ManualTripRefusalReason,
  type ManualTripResult,
  type ManualTripRideResult,
  type ManualTripSegmentResult,
  type ManualTripStats,
  type ManualTripStep,
  type ManualTripTelemetry,
} from './manual-trip';
export {
  applyKeyRemapping,
  readKeyRemappingDraft,
  resetKeyRemapping,
  type KeyRemappingApplyRejection,
  type KeyRemappingApplyResult,
  type KeyRemappingSettingsServices,
} from './key-remapping';
export {
  applyGameSettings,
  gameSettingsDefaults,
  gameSettingsValuesFrom,
  readGameSettingsDraft,
  resetGameSettings,
  sameGameSettings,
  type GameSettingsApplyRejection,
  type GameSettingsApplyResult,
  type GameSettingsSettingsServices,
} from './game-settings';
export {
  isStaleNotification,
  learningNotificationEventId,
  learningNotificationGenerationKey,
  learningNotificationJobKey,
  missingObservationsFromEvidence,
  notificationCurrentJob,
  notificationFromAdmission,
  notificationFromMissingEvidence,
  notificationFromOutcome,
  notificationFromPublication,
  LEARNING_NOTIFICATION_ADAPTER_VERSION,
  type LearningNotificationContext,
  type LearningNotificationEvidenceInput,
  type LearningNotificationEvidenceSource,
  type LearningNotificationPublicationPayload,
} from './learning-notification';
export {
  LEARNING_EXPLANATION_ADAPTER_VERSION,
  LEARNING_EXPLANATION_READ_ERRORS,
  learningExplanationCurrentJob,
  learningExplanationGenerationKey,
  learningExplanationJobKey,
  readLearningExplanation,
  type LearningExplanationCurrent,
  type LearningExplanationInput,
  type LearningExplanationSource,
} from './learning-explanation';
export {
  PANEL_ACCESSIBILITY_BRIDGE_CLAIMS_PLAYER,
  UI_ACCESSIBILITY_BLOCKING_CODES,
  UI_ACCESSIBILITY_REPORT_VERSION,
  createPanelAccessibilityBridge,
  readAccessibilityReport,
  requireAccessibleUi,
  type AccessibilityContrastRow,
  type PanelAccessibilityBridge,
  type PanelAccessibilityBridgeOptions,
  type PanelAccessibilityBridgeState,
  type PanelAccessibilityBridgeStats,
  type UiAccessibilityPanelReport,
  type UiAccessibilityReport,
} from './ui-accessibility';
