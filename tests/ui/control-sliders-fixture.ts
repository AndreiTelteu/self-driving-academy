import { createControlSlidersPanel } from '../../src/ui';
import type {
  ControlSliderField,
  ControlSliderPreset,
  ControlSlidersDraft,
  ControlSlidersPanel,
} from '../../src/ui';
import { createControlSlidersDraft, projectControlSliders } from '../../src/ui';
import {
  createDefaultSettings,
  parseRuntimeSettings,
  type RuntimeSettings,
} from '../../src/settings';
import { serializeHud, HudElement } from './hud-dom';
import type { HudDocument, HudEventInit } from './hud-dom';
export const CONTROL_SLIDERS_PLAYER = 'player:229';

/** Real 009 defaults for the 229 fixture player. */
export function controlSlidersSettings(): RuntimeSettings {
  return createDefaultSettings(CONTROL_SLIDERS_PLAYER, 3);
}

/**
 * Every section customized, including two changed bindings and a non-default control revision, so an
 * apply can prove that bindings, scenario, player, camera mode, units and graphics survive.
 */
export function customControlSlidersSettings(): RuntimeSettings {
  const defaults = createDefaultSettings(CONTROL_SLIDERS_PLAYER);
  return parseRuntimeSettings({
    ...defaults,
    input: {
      ...defaults.input,
      bindings: { ...defaults.input.bindings, throttle: 'ArrowUp', brake: 'KeyZ' },
      cameraMode: 'FIRST_PERSON',
      control: {
        ...defaults.input.control,
        version: 4,
        fov: 92,
        cameraMotion: 20,
        steeringSensitivity: 65,
        returnRate: 35,
      },
    },
    units: { speed: 'mph', distance: 'ft' },
    quality: { preset: 'HIGH', preferredBackend: 'WEBGL2', resolutionScale: 0.75, adaptive: true },
    scenario: { ...defaults.scenario, seed: 7, taxiCount: 10, civilianCount: 12 },
  });
}

export function controlSlidersDraft(
  settings: RuntimeSettings = controlSlidersSettings(),
): ControlSlidersDraft {
  const defaults = createDefaultSettings(settings.playerId).input.control;
  return createControlSlidersDraft({
    playerId: settings.playerId,
    saved: settings.input.control,
    defaults: { ...defaults, version: settings.input.control.version },
  });
}

// ---------------------------------------------------------------------------------------------
// Fake DOM with real focus semantics (the panel owns its tab stops; no querySelectorAll needed).
// ---------------------------------------------------------------------------------------------

interface FocusDocument extends HudDocument {
  activeElement: FocusableElement | null;
  createElement(tagName: string): FocusableElement;
}

export class FocusableElement extends HudElement {
  focused = 0;
  focus(): void {
    this.focused += 1;
    (this.ownerDocument as unknown as FocusDocument).activeElement = this;
  }
}

function createFocusDocument(): FocusDocument {
  const doc: FocusDocument = {
    activeElement: null,
    createElement(tagName: string) {
      const element = new FocusableElement(tagName);
      element.ownerDocument = doc;
      return element;
    },
  };
  return doc;
}

export interface ControlSlidersHarnessOptions {
  readonly now?: () => number;
}

export interface ControlSlidersHarness {
  readonly doc: FocusDocument;
  readonly host: FocusableElement;
  readonly panel: ControlSlidersPanel;
  readonly drafts: ControlSlidersDraft[];
  readonly applied: ControlSlidersDraft[];
  readonly cancelled: ControlSlidersDraft[];
  readonly resets: ControlSlidersDraft[];
  readonly closed: string[];
  root(): FocusableElement;
  byClass(name: string): FocusableElement;
  control(field: ControlSliderField): FocusableElement;
  output(field: ControlSliderField): FocusableElement;
  end(field: ControlSliderField, which: 'min' | 'max'): FocusableElement;
  preset(preset: ControlSliderPreset): FocusableElement;
  applyButton(): FocusableElement;
  cancelButton(): FocusableElement;
  resetButton(): FocusableElement;
  closeButton(): FocusableElement;
  live(): FocusableElement;
  issues(): FocusableElement;
  controlTab(): FocusableElement;
  cityTab(): FocusableElement;
  setRange(field: ControlSliderField, value: number): void;
  drag(field: ControlSliderField, values: readonly number[]): void;
  click(node: FocusableElement): void;
  key(key: string, init?: HudEventInit): void;
  draft(): ControlSlidersDraft;
  view(): ReturnType<typeof projectControlSliders>;
  dom(): string;
}

function walk(root: HudElement, visit: (node: HudElement) => boolean): HudElement | null {
  if (visit(root)) return root;
  for (const child of root.children) {
    const found = walk(child, visit);
    if (found !== null) return found;
  }
  return null;
}

function requireElement(
  root: HudElement,
  predicate: (node: HudElement) => boolean,
  label: string,
): FocusableElement {
  const found = walk(root, predicate);
  if (found === null) throw new Error(`Control sliders control is missing: ${label}`);
  return found as FocusableElement;
}

function idSuffix(node: HudElement, suffix: string): boolean {
  const id = node.getAttribute('id');
  return id !== null && id.endsWith(`-${suffix}`);
}

export function createControlSlidersHarness(
  draft: ControlSlidersDraft = controlSlidersDraft(),
  options: ControlSlidersHarnessOptions = {},
): ControlSlidersHarness {
  const doc = createFocusDocument(),
    host = doc.createElement('div') as FocusableElement,
    drafts: ControlSlidersDraft[] = [],
    applied: ControlSlidersDraft[] = [],
    cancelled: ControlSlidersDraft[] = [],
    resets: ControlSlidersDraft[] = [],
    closed: string[] = [],
    panel = createControlSlidersPanel(host as unknown as HTMLElement, draft, {
      close: (reason) => {
        closed.push(reason);
      },
      onChange: (next) => {
        drafts.push(next);
      },
      apply: (next) => {
        applied.push(next);
      },
      cancel: (next) => {
        cancelled.push(next);
      },
      reset: (next) => {
        resets.push(next);
      },
      ...(options.now === undefined ? {} : { now: options.now }),
    }),
    root = (): FocusableElement => {
      const element = host.children[0];
      if (!element) throw new Error('Control sliders root is missing');
      return element as FocusableElement;
    },
    byClass = (name: string): FocusableElement =>
      requireElement(
        root(),
        (node) => (node.getAttribute('class') ?? '').includes(`control-sliders__${name}`),
        name,
      ),
    control = (field: ControlSliderField): FocusableElement =>
      requireElement(root(), (node) => idSuffix(node, field) && node.tagName === 'input', field),
    output = (field: ControlSliderField): FocusableElement =>
      requireElement(
        root(),
        (node) =>
          node.tagName === 'output' && node.getAttribute('for')?.endsWith(`-${field}`) === true,
        `output ${field}`,
      ),
    end = (field: ControlSliderField, which: 'min' | 'max'): FocusableElement => {
      const row = requireElement(
          root(),
          (node) => node.getAttribute('data-field') === field,
          `row ${field}`,
        ),
        ends = requireElement(
          row,
          (node) => (node.getAttribute('class') ?? '').includes('control-sliders__ends'),
          `ends ${field}`,
        ),
        span = ends.children[which === 'min' ? 0 : 1];
      if (!span) throw new Error(`Control sliders end is missing: ${field}/${which}`);
      return span as FocusableElement;
    },
    preset = (name: ControlSliderPreset): FocusableElement =>
      requireElement(
        root(),
        (node) => node.tagName === 'button' && node.getAttribute('data-preset') === name,
        `preset ${name}`,
      ),
    dispatch = (node: FocusableElement, type: string) => {
      node.dispatch(type);
    },
    setRange = (field: ControlSliderField, value: number) => {
      const node = control(field);
      node.value = String(value);
      dispatch(node, 'input');
    },
    drag = (field: ControlSliderField, values: readonly number[]) => {
      const node = control(field);
      for (const value of values) {
        node.value = String(value);
        dispatch(node, 'input');
      }
      dispatch(node, 'change');
    },
    click = (node: FocusableElement) => {
      dispatch(node, 'click');
    },
    key = (keyName: string, init: HudEventInit = {}) => {
      const event = root().dispatchEvent('keydown', { key: keyName, ...init });
      return event;
    };
  return {
    doc,
    host,
    panel,
    drafts,
    applied,
    cancelled,
    resets,
    closed,
    root,
    byClass,
    control,
    output,
    end,
    preset,
    applyButton: () => byClass('apply'),
    cancelButton: () => byClass('cancel'),
    resetButton: () => byClass('reset'),
    closeButton: () => byClass('close'),
    live: () => byClass('live'),
    issues: () => byClass('issues'),
    controlTab: () =>
      requireElement(root(), (node) => idSuffix(node, 'tab-control'), 'tab control'),
    cityTab: () => requireElement(root(), (node) => idSuffix(node, 'tab-city'), 'tab city'),
    setRange,
    drag,
    click,
    key,
    draft: () => panel.getDraft(),
    view: () => panel.getView(),
    dom: () => serializeHud(root()),
  };
}

export { createControlSlidersDraft };
