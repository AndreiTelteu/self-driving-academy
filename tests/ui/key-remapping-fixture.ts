import {
  applyKeyRemapping,
  readKeyRemappingDraft,
  resetKeyRemapping,
  type KeyRemappingSettingsServices,
} from '../../src/app';
import {
  createDefaultSettings,
  createSettingsStore,
  parseRuntimeSettings,
  type RuntimeSettings,
} from '../../src/settings';
import { createKeyRemappingPanel } from '../../src/ui';
import type { KeyRemappingAction, KeyRemappingDraft } from '../../src/ui';
import { createHudDocument, createHudHost, serializeHud } from './hud-dom';
import type { HudDocument, HudElement } from './hud-dom';

export const KEY_PLAYER = 'player:080';

/** Real 009 defaults for the 080 fixture player. */
export function keySettings(): RuntimeSettings {
  return createDefaultSettings(KEY_PLAYER);
}

/**
 * A settings record with every non-binding section customized, plus two changed bindings. It is the
 * probe that save/reset preserve units, quality, scenario, camera mode and the control preferences.
 */
export function customKeySettings(): RuntimeSettings {
  const defaults = createDefaultSettings(KEY_PLAYER);
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

export function keyServices(
  settings: RuntimeSettings = keySettings(),
): KeyRemappingSettingsServices {
  return { store: createSettingsStore(settings), settings };
}

export function defaultKeyDraft(): KeyRemappingDraft {
  return readKeyRemappingDraft(keySettings(), KEY_PLAYER);
}

export function customKeyDraft(): KeyRemappingDraft {
  return readKeyRemappingDraft(customKeySettings(), KEY_PLAYER);
}

export const keyOf = (draft: KeyRemappingDraft, action: KeyRemappingAction): string =>
  draft.proposed[action];

export const currentOf = (draft: KeyRemappingDraft, action: KeyRemappingAction): string =>
  draft.bindings[action];

export { applyKeyRemapping, resetKeyRemapping, readKeyRemappingDraft };

// ---------------------------------------------------------------------------------------------
// Fake-DOM harness
// ---------------------------------------------------------------------------------------------

export interface KeyRemappingHarness {
  readonly doc: HudDocument;
  readonly host: HudElement;
  readonly panel: ReturnType<typeof createKeyRemappingPanel>;
  readonly saved: Readonly<Record<KeyRemappingAction, string>>[];
  readonly cancelled: KeyRemappingDraft[];
  root(): HudElement;
  list(): HudElement;
  rows(): HudElement[];
  rowFor(action: KeyRemappingAction): HudElement;
  keyButtonFor(action: KeyRemappingAction): HudElement;
  resetButton(): HudElement;
  saveButton(): HudElement;
  cancelButton(): HudElement;
  live(): HudElement;
  dom(): string;
  draft(): KeyRemappingDraft;
}

function byClass(root: HudElement, className: string): HudElement | null {
  if (root.className.split(' ').includes(className)) return root;
  for (const child of root.children) {
    const found = byClass(child, className);
    if (found !== null) return found;
  }
  return null;
}

export function createKeyRemappingHarness(
  draft: KeyRemappingDraft = defaultKeyDraft(),
): KeyRemappingHarness {
  const doc = createHudDocument(),
    host = createHudHost(doc),
    saved: Readonly<Record<KeyRemappingAction, string>>[] = [],
    cancelled: KeyRemappingDraft[] = [],
    panel = createKeyRemappingPanel(host as unknown as HTMLElement, draft, {
      save: (bindings) => {
        saved.push(bindings);
      },
      cancel: (next) => {
        cancelled.push(next);
      },
    }),
    requireRoot = (): HudElement => {
      const element = host.children[0];
      if (!element) throw new Error('Key remapping root is missing');
      return element;
    },
    select = (className: string): HudElement => {
      const element = byClass(requireRoot(), className);
      if (element === null) throw new Error(`Key remapping control is missing: ${className}`);
      return element;
    },
    list = (): HudElement => select('key-remapping__rows'),
    rowFor = (action: KeyRemappingAction): HudElement => {
      for (const item of list().children) {
        if (item.getAttribute('data-action') === action) return item;
      }
      throw new Error(`Key remapping row is missing: ${action}`);
    },
    keyButtonFor = (action: KeyRemappingAction): HudElement => {
      const button = rowFor(action).children[2];
      if (button === undefined) throw new Error(`Key remapping key button is missing: ${action}`);
      return button;
    };
  return {
    doc,
    host,
    panel,
    saved,
    cancelled,
    root: requireRoot,
    list,
    rows: () => [...list().children],
    rowFor,
    keyButtonFor,
    resetButton: () => select('key-remapping__reset'),
    saveButton: () => select('key-remapping__save'),
    cancelButton: () => select('key-remapping__cancel'),
    live: () => select('key-remapping__live'),
    dom: () => serializeHud(requireRoot()),
    draft: () => panel.getDraft(),
  };
}
