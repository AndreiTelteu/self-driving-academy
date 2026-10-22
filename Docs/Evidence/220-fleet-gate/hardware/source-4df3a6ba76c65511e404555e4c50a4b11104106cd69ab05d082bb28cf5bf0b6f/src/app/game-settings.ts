import {
  createDefaultSettings,
  parseRuntimeSettings,
  type ControlPreferences,
  type RuntimeSettings,
  type SettingsStore,
} from '../settings';
import {
  GAME_SETTINGS_COMFORT_FIELDS,
  createGameSettingsDraft,
  gameSettingsRuntimeCandidate,
  parseGameSettingsDraft,
  projectGameSettings,
  resetGameSettingsDraft,
  type GameSettingsDraft,
  type GameSettingsValues,
} from '../ui';

export type GameSettingsApplyRejection =
  'INVALID_DRAFT' | 'PLAYER_MISMATCH' | 'STALE_DRAFT' | 'CONTROL_VERSION';

export type GameSettingsApplyResult =
  | { readonly status: 'SAVED'; readonly settings: RuntimeSettings }
  | { readonly status: 'REJECTED'; readonly reason: GameSettingsApplyRejection };

/** Injected 009 owner plus the settings record read at the same moment. */
export interface GameSettingsSettingsServices {
  readonly store: SettingsStore;
  readonly settings: RuntimeSettings;
}

/**
 * 081 settings composition.
 *
 * Display units are presentation only: the authoritative physics, telemetry and profile values stay
 * SI (m/s, m). This module never imports `src/profiles`, `src/fleet` or an autonomy module, never
 * reads or writes a learned parameter, a fleet style or AI behaviour, and its only persistence is
 * the injected `SettingsStore`.
 */

function rejected(reason: GameSettingsApplyRejection): GameSettingsApplyResult {
  return Object.freeze({ status: 'REJECTED' as const, reason });
}

/** Reads the four persisted sections exactly as 009 stores them. */
export function gameSettingsValuesFrom(settings: RuntimeSettings): GameSettingsValues {
  return Object.freeze({
    units: Object.freeze({ speed: settings.units.speed, distance: settings.units.distance }),
    cameraMode: settings.input.cameraMode,
    comfort: Object.freeze({ ...settings.input.control }),
    graphics: Object.freeze({ ...settings.quality }),
  });
}

/**
 * Real 009 defaults for display/camera/comfort/graphics. The persisted control revision and input
 * mapping are kept on purpose: a reset proposes slider/camera defaults without silently upgrading a
 * legacy keyboard mapping or reusing revision 0.
 */
export function gameSettingsDefaults(
  playerId: string,
  control: Readonly<ControlPreferences>,
): GameSettingsValues {
  const defaults = createDefaultSettings(playerId);
  return Object.freeze({
    units: Object.freeze({ speed: defaults.units.speed, distance: defaults.units.distance }),
    cameraMode: defaults.input.cameraMode,
    comfort: Object.freeze({
      ...defaults.input.control,
      version: control.version,
      mappingVersion: control.mappingVersion,
    }),
    graphics: Object.freeze({ ...defaults.quality }),
  });
}

function sameComfort(
  left: Readonly<ControlPreferences>,
  right: Readonly<ControlPreferences>,
): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.version === right.version &&
    left.mappingVersion === right.mappingVersion &&
    GAME_SETTINGS_COMFORT_FIELDS.every((field) => left[field] === right[field])
  );
}

function sameValues(left: GameSettingsValues, right: GameSettingsValues): boolean {
  return (
    left.units.speed === right.units.speed &&
    left.units.distance === right.units.distance &&
    left.cameraMode === right.cameraMode &&
    sameComfort(left.comfort, right.comfort) &&
    left.graphics.preset === right.graphics.preset &&
    left.graphics.preferredBackend === right.graphics.preferredBackend &&
    left.graphics.resolutionScale === right.graphics.resolutionScale &&
    left.graphics.adaptive === right.graphics.adaptive
  );
}

function sameBindings(
  left: RuntimeSettings['input']['bindings'],
  right: RuntimeSettings['input']['bindings'],
): boolean {
  return Object.keys(left).every(
    (action) => left[action as keyof typeof left] === right[action as keyof typeof right],
  );
}

/** Full record equality, including bindings, scenario and the control revision. */
export function sameGameSettings(left: RuntimeSettings, right: RuntimeSettings): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.playerId === right.playerId &&
    left.input.cameraMode === right.input.cameraMode &&
    sameBindings(left.input.bindings, right.input.bindings) &&
    sameComfort(left.input.control, right.input.control) &&
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
 * Reads the real 009 settings into a local draft. A foreign or missing current player is refused;
 * defaults always come from `createDefaultSettings`, never from a hand-written copy.
 */
export function readGameSettingsDraft(
  settings: RuntimeSettings,
  currentPlayerId: string,
): GameSettingsDraft {
  if (typeof currentPlayerId !== 'string' || currentPlayerId.trim() === '')
    throw new Error('Game settings requires a current player');
  if (settings.playerId !== currentPlayerId)
    throw new Error('Game settings belong to another player');
  return createGameSettingsDraft({
    playerId: settings.playerId,
    saved: gameSettingsValuesFrom(settings),
    defaults: gameSettingsDefaults(settings.playerId, settings.input.control),
  });
}

function comfortChanged(settings: RuntimeSettings, draft: GameSettingsDraft): boolean {
  return GAME_SETTINGS_COMFORT_FIELDS.some(
    (field) => draft.proposed.comfort[field] !== settings.input.control[field],
  );
}

function withControlVersion(candidate: RuntimeSettings, version: number): RuntimeSettings {
  return {
    ...candidate,
    input: {
      ...candidate.input,
      control: { ...candidate.input.control, version },
    },
  };
}

/**
 * Applies one validated draft to the complete settings record.
 *
 * Only units, camera mode, the comfort sliders and quality change; `input.bindings`, `playerId` and
 * `scenario` are copied untouched. A comfort change increments `input.control.version` exactly once
 * because 009 requires a strictly newer revision for changed control preferences. Units, camera and
 * graphics changes never bump it. Failures are closed and leave the store unchanged.
 */
export function applyGameSettings(
  services: GameSettingsSettingsServices,
  draft: GameSettingsDraft,
): GameSettingsApplyResult {
  let parsed: GameSettingsDraft;
  try {
    parsed = parseGameSettingsDraft(draft);
  } catch {
    return rejected('INVALID_DRAFT');
  }
  const stored = services.store.getSnapshot();
  if (parsed.playerId !== services.settings.playerId || parsed.playerId !== stored.playerId)
    return rejected('PLAYER_MISMATCH');
  if (!sameGameSettings(stored, services.settings)) return rejected('STALE_DRAFT');
  if (!sameValues(parsed.saved, gameSettingsValuesFrom(services.settings)))
    return rejected('STALE_DRAFT');
  const view = projectGameSettings(parsed);
  if (view.saveState === 'INVALID') return rejected('INVALID_DRAFT');
  if (view.saveState === 'UNCHANGED')
    return Object.freeze({ status: 'SAVED' as const, settings: stored });

  const base = gameSettingsRuntimeCandidate(parsed, services.settings),
    changed = comfortChanged(services.settings, parsed),
    nextVersion = services.settings.input.control.version + 1;
  if (changed && !Number.isSafeInteger(nextVersion)) return rejected('CONTROL_VERSION');
  const complete = changed ? withControlVersion(base, nextVersion) : base;
  try {
    const saved = services.store.replace(parseRuntimeSettings(complete));
    return Object.freeze({ status: 'SAVED' as const, settings: saved });
  } catch (error) {
    if (error instanceof Error && /control|version/i.test(error.message))
      return rejected('CONTROL_VERSION');
    return rejected('INVALID_DRAFT');
  }
}

/**
 * Restores the real display/camera/comfort/graphics defaults while preserving `input.bindings`,
 * `playerId` and the scenario. Saving is atomic through the injected store; a stale `settings`
 * record is refused so newer settings are never overwritten.
 */
export function resetGameSettings(services: GameSettingsSettingsServices): RuntimeSettings {
  if (!sameGameSettings(services.store.getSnapshot(), services.settings))
    throw new Error('Game settings stale settings');
  const draft = resetGameSettingsDraft(
      readGameSettingsDraft(services.settings, services.settings.playerId),
    ),
    base = gameSettingsRuntimeCandidate(draft, services.settings),
    changed = comfortChanged(services.settings, draft),
    nextVersion = services.settings.input.control.version + 1;
  if (changed && !Number.isSafeInteger(nextVersion))
    throw new Error('Game settings control version exhausted');
  return services.store.replace(
    parseRuntimeSettings(changed ? withControlVersion(base, nextVersion) : base),
  );
}
