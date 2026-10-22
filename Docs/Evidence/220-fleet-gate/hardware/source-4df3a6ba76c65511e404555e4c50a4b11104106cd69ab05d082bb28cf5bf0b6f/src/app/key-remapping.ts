import { createDefaultSettings, type RuntimeSettings, type SettingsStore } from '../settings';
import type { KeyRemappingAction, KeyRemappingDraft } from '../ui';
import {
  createKeyRemappingDraft,
  keyRemappingBindings,
  parseKeyRemappingDraft,
  projectKeyRemapping,
} from '../ui';

export type KeyRemappingApplyRejection =
  'INVALID_DRAFT' | 'PLAYER_MISMATCH' | 'STALE_DRAFT' | 'UNSUPPORTED' | 'CONFLICT';

export type KeyRemappingApplyResult =
  | { readonly status: 'SAVED'; readonly settings: RuntimeSettings }
  | { readonly status: 'REJECTED'; readonly reason: KeyRemappingApplyRejection };

/** Injected 009 owner plus the settings record read at the same moment. */
export interface KeyRemappingSettingsServices {
  readonly store: SettingsStore;
  readonly settings: RuntimeSettings;
}

function rejected(reason: KeyRemappingApplyRejection): KeyRemappingApplyResult {
  return Object.freeze({ status: 'REJECTED' as const, reason });
}

function withBindings(
  settings: RuntimeSettings,
  bindings: Readonly<Record<KeyRemappingAction, string>>,
): RuntimeSettings {
  return {
    ...settings,
    input: { ...settings.input, bindings: { ...bindings } },
  };
}

function sameBindings(
  left: Readonly<Record<KeyRemappingAction, string>>,
  right: Readonly<Record<KeyRemappingAction, string>>,
): boolean {
  return (Object.keys(left) as KeyRemappingAction[]).every(
    (action) => left[action] === right[action],
  );
}

function sameSettings(left: RuntimeSettings, right: RuntimeSettings): boolean {
  const leftControl = left.input.control,
    rightControl = right.input.control;
  return (
    left.schemaVersion === right.schemaVersion &&
    left.playerId === right.playerId &&
    left.input.cameraMode === right.input.cameraMode &&
    sameBindings(left.input.bindings, right.input.bindings) &&
    leftControl.schemaVersion === rightControl.schemaVersion &&
    leftControl.version === rightControl.version &&
    leftControl.mappingVersion === rightControl.mappingVersion &&
    leftControl.steeringSensitivity === rightControl.steeringSensitivity &&
    leftControl.returnRate === rightControl.returnRate &&
    leftControl.speedAttenuation === rightControl.speedAttenuation &&
    leftControl.throttleRamp === rightControl.throttleRamp &&
    leftControl.brakeRamp === rightControl.brakeRamp &&
    leftControl.cameraMotion === rightControl.cameraMotion &&
    leftControl.fov === rightControl.fov &&
    left.units.speed === right.units.speed &&
    left.units.distance === right.units.distance &&
    left.quality.preset === right.quality.preset &&
    left.quality.preferredBackend === right.quality.preferredBackend &&
    left.quality.resolutionScale === right.quality.resolutionScale &&
    left.quality.adaptive === right.quality.adaptive &&
    left.scenario.scenarioId === right.scenario.scenarioId &&
    left.scenario.mapVersion === right.scenario.mapVersion &&
    left.scenario.seed === right.scenario.seed &&
    left.scenario.taxiCount === right.scenario.taxiCount &&
    left.scenario.civilianCount === right.scenario.civilianCount
  );
}

/**
 * 080 composition root.
 *
 * The draft is built from the real `settings.input.bindings` and the real
 * `createDefaultSettings(playerId).input.bindings`; nothing is duplicated by hand. These bindings
 * are device/settings state. The module never imports `src/profiles`, never reads or writes a
 * `DrivingProfile`, a learned parameter, telemetry or XP, and persistence is only the injected
 * `SettingsStore`.
 */
export function readKeyRemappingDraft(
  settings: RuntimeSettings,
  currentPlayerId: string,
): KeyRemappingDraft {
  if (typeof currentPlayerId !== 'string' || currentPlayerId.trim() === '')
    throw new Error('Key remapping requires a current player');
  if (settings.playerId !== currentPlayerId)
    throw new Error('Key remapping settings belong to another player');
  const defaults = createDefaultSettings(settings.playerId).input.bindings;
  return createKeyRemappingDraft({
    playerId: settings.playerId,
    bindings: settings.input.bindings,
    defaults,
  });
}

/**
 * Applies one validated draft to the complete settings record.
 *
 * Only `input.bindings` changes. `input.control` (and therefore `input.control.version`) is preserved
 * exactly: the 009 store requires a newer revision only when a control *preference* changes, not when
 * a key binding changes. Units, quality, scenario and camera mode are copied untouched.
 */
export function applyKeyRemapping(
  services: KeyRemappingSettingsServices,
  draft: KeyRemappingDraft,
): KeyRemappingApplyResult {
  let parsed: KeyRemappingDraft;
  try {
    parsed = parseKeyRemappingDraft(draft);
  } catch {
    return rejected('INVALID_DRAFT');
  }
  const stored = services.store.getSnapshot();
  if (parsed.playerId !== services.settings.playerId || parsed.playerId !== stored.playerId)
    return rejected('PLAYER_MISMATCH');
  if (
    !sameBindings(parsed.bindings, services.settings.input.bindings) ||
    !sameBindings(stored.input.bindings, services.settings.input.bindings)
  )
    return rejected('STALE_DRAFT');
  if (!sameSettings(stored, services.settings)) return rejected('STALE_DRAFT');
  const view = projectKeyRemapping(parsed);
  if (view.saveState === 'UNSUPPORTED') return rejected('UNSUPPORTED');
  if (view.saveState === 'CONFLICT') return rejected('CONFLICT');
  const saved = services.store.replace(
    withBindings(services.settings, keyRemappingBindings(parsed)),
  );
  return Object.freeze({ status: 'SAVED' as const, settings: saved });
}

/**
 * Restores exactly the defaults of `input.bindings` for the current player while preserving units,
 * quality, scenario, camera mode and the whole `input.control` preference record. Saving is atomic
 * through the injected store; a failure keeps the previous snapshot intact.
 */
export function resetKeyRemapping(services: KeyRemappingSettingsServices): RuntimeSettings {
  if (!sameSettings(services.store.getSnapshot(), services.settings))
    throw new Error('Key remapping stale settings');
  const defaults = createDefaultSettings(services.settings.playerId).input.bindings;
  return services.store.replace(withBindings(services.settings, defaults));
}
