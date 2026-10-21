import { readGameSettingsDraft } from '../../src/app';
import type { GameSettingsSettingsServices } from '../../src/app';
import {
  createDefaultSettings,
  createSettingsStore,
  parseRuntimeSettings,
  type RuntimeSettings,
} from '../../src/settings';
import { createGameSettingsPanel } from '../../src/ui';
import type { GameSettingsComfortField, GameSettingsDraft } from '../../src/ui';
import { createHudDocument, createHudHost, serializeHud } from './hud-dom';
import type { HudDocument, HudElement } from './hud-dom';

export const GAME_SETTINGS_PLAYER = 'player:081';

/** Real 009 defaults for the 081 fixture player. */
export function gameSettings(): RuntimeSettings {
  return createDefaultSettings(GAME_SETTINGS_PLAYER);
}

/**
 * Every settings section customized, including two changed bindings, so save/reset can prove that
 * bindings, scenario, player and the untouched sections survive.
 */
export function customGameSettings(): RuntimeSettings {
  const defaults = createDefaultSettings(GAME_SETTINGS_PLAYER);
  return parseRuntimeSettings({
    ...defaults,
    input: {
      ...defaults.input,
      bindings: {
        ...defaults.input.bindings,
        throttle: 'ArrowUp',
        brake: 'KeyZ',
      },
      cameraMode: 'FIRST_PERSON',
      control: {
        ...defaults.input.control,
        version: 4,
        fov: 90,
        cameraMotion: 0,
        steeringSensitivity: 65,
      },
    },
    units: { speed: 'mph', distance: 'ft' },
    quality: {
      preset: 'HIGH',
      preferredBackend: 'WEBGL2',
      resolutionScale: 0.75,
      adaptive: true,
    },
    scenario: {
      ...defaults.scenario,
      seed: 7,
      taxiCount: 10,
      civilianCount: 12,
    },
  });
}

export function gameSettingsServices(
  settings: RuntimeSettings = gameSettings(),
): GameSettingsSettingsServices {
  return { store: createSettingsStore(settings), settings };
}

export function defaultGameDraft(): GameSettingsDraft {
  return readGameSettingsDraft(gameSettings(), GAME_SETTINGS_PLAYER);
}

export function customGameDraft(): GameSettingsDraft {
  return readGameSettingsDraft(customGameSettings(), GAME_SETTINGS_PLAYER);
}

export { applyGameSettings, resetGameSettings } from '../../src/app';

// ---------------------------------------------------------------------------------------------
// Fake-DOM harness
// ---------------------------------------------------------------------------------------------

export interface GameSettingsHarness {
  readonly doc: HudDocument;
  readonly host: HudElement;
  readonly panel: ReturnType<typeof createGameSettingsPanel>;
  readonly saved: GameSettingsDraft[];
  readonly cancelled: GameSettingsDraft[];
  readonly changed: GameSettingsDraft[];
  root(): HudElement;
  section(name: string): HudElement;
  control(name: string): HudElement;
  output(name: string): HudElement;
  speedSelect(): HudElement;
  distanceSelect(): HudElement;
  cameraSelect(): HudElement;
  presetSelect(): HudElement;
  backendSelect(): HudElement;
  resolutionRange(): HudElement;
  adaptiveCheckbox(): HudElement;
  comfortRange(field: GameSettingsComfortField): HudElement;
  comfortOutput(field: GameSettingsComfortField): HudElement;
  audio(): HudElement;
  preview(): HudElement;
  live(): HudElement;
  policy(): HudElement;
  issues(): HudElement;
  resetButton(): HudElement;
  saveButton(): HudElement;
  cancelButton(): HudElement;
  setSelect(name: string, value: string): void;
  setRange(name: string, value: number): void;
  setCheckbox(name: string, value: boolean): void;
  dom(): string;
  draft(): GameSettingsDraft;
}

function walk(root: HudElement, visit: (node: HudElement) => boolean): HudElement | null {
  if (visit(root)) return root;
  for (const child of root.children) {
    const found = walk(child, visit);
    if (found !== null) return found;
  }
  return null;
}

function requireElement(root: HudElement, predicate: (node: HudElement) => boolean, label: string) {
  const found = walk(root, predicate);
  if (found === null) throw new Error(`Game settings control is missing: ${label}`);
  return found;
}

function idSuffix(node: HudElement, suffix: string): boolean {
  const id = node.getAttribute('id');
  return id !== null && id.endsWith(`-${suffix}`);
}

export function createGameSettingsHarness(
  draft: GameSettingsDraft = defaultGameDraft(),
): GameSettingsHarness {
  const doc = createHudDocument(),
    host = createHudHost(doc),
    saved: GameSettingsDraft[] = [],
    cancelled: GameSettingsDraft[] = [],
    changed: GameSettingsDraft[] = [],
    panel = createGameSettingsPanel(host as unknown as HTMLElement, draft, {
      save: (next) => {
        saved.push(next);
      },
      cancel: (next) => {
        cancelled.push(next);
      },
      onChange: (next) => {
        changed.push(next);
      },
    }),
    root = (): HudElement => {
      const element = host.children[0];
      if (!element) throw new Error('Game settings root is missing');
      return element;
    },
    section = (name: string): HudElement =>
      requireElement(
        root(),
        (node) => node.tagName === 'section' && node.getAttribute('data-section') === name,
        `section ${name}`,
      ),
    control = (name: string): HudElement =>
      requireElement(
        root(),
        (node) => idSuffix(node, name) && ['select', 'input', 'button'].includes(node.tagName),
        `control ${name}`,
      ),
    output = (name: string): HudElement => {
      const found = walk(
        root(),
        (node) =>
          node.tagName === 'output' && node.getAttribute('for')?.endsWith(`-${name}`) === true,
      );
      if (found === null) throw new Error(`Game settings output is missing: ${name}`);
      return found;
    };
  return {
    doc,
    host,
    panel,
    saved,
    cancelled,
    changed,
    root,
    section,
    control,
    output,
    speedSelect: () => control('speed'),
    distanceSelect: () => control('distance'),
    cameraSelect: () => control('camera'),
    presetSelect: () => control('preset'),
    backendSelect: () => control('backend'),
    resolutionRange: () => control('resolution'),
    adaptiveCheckbox: () => control('adaptive'),
    comfortRange: (field) => control(field),
    comfortOutput: (field) => output(field),
    audio: () =>
      requireElement(
        root(),
        (node) => node.tagName === 'section' && node.getAttribute('data-section') === 'audio',
        'audio',
      ),
    preview: () =>
      requireElement(
        root(),
        (node) => node.getAttribute('class')?.includes('game-settings__preview') === true,
        'preview',
      ),
    live: () =>
      requireElement(
        root(),
        (node) => node.getAttribute('class')?.includes('game-settings__live') === true,
        'live',
      ),
    policy: () =>
      requireElement(
        root(),
        (node) => node.getAttribute('class')?.includes('game-settings__policy') === true,
        'policy',
      ),
    issues: () =>
      requireElement(
        root(),
        (node) => node.getAttribute('class')?.includes('game-settings__issues') === true,
        'issues',
      ),
    resetButton: () =>
      requireElement(
        root(),
        (node) => node.getAttribute('class')?.includes('game-settings__reset') === true,
        'reset',
      ),
    saveButton: () =>
      requireElement(
        root(),
        (node) => node.getAttribute('class')?.includes('game-settings__save') === true,
        'save',
      ),
    cancelButton: () =>
      requireElement(
        root(),
        (node) => node.getAttribute('class')?.includes('game-settings__cancel') === true,
        'cancel',
      ),
    setSelect(name, value) {
      const node = control(name);
      node.value = value;
      node.dispatch('change');
    },
    setRange(name, value) {
      const node = control(name);
      node.value = String(value);
      node.dispatch('change');
    },
    setCheckbox(name, value) {
      const node = control(name) as unknown as { checked: boolean };
      node.checked = value;
      control(name).dispatch('change');
    },
    dom: () => serializeHud(root()),
    draft: () => panel.getDraft(),
  };
}
