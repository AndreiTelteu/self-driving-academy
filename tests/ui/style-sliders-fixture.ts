import { createControlSlidersPanel, createStyleSlidersDraft } from '../../src/ui';
import type { ControlSlidersPanel, StyleSliderField, StyleSlidersDraft } from '../../src/ui';
import { HudElement, serializeHud } from './hud-dom';
import type { HudDocument, HudEventInit } from './hud-dom';
import {
  controlSlidersDraft,
  createControlSlidersDraft,
  FocusableElement,
} from './control-sliders-fixture';

export const STYLE_PLAYER = 'player:230';
export const STYLE_PROFILE = 'city-profile';
export const STYLE_SESSION = 'session-academia';
export const STYLE_BASE = 'profile-v1';

export const STYLE_BASE_PARAMETERS: Readonly<Record<string, number>> = Object.freeze({
  speed_delta_urban: 0,
  desired_acceleration: 1.5,
  comfort_deceleration: 2,
  following_time_headway: 1.8,
  following_min_gap: 3,
  red_stop_probability: 1,
  stop_full_probability: 1,
  green_start_delay: 0.7,
});

export const STYLE_AVAILABLE_KEYS = Object.freeze(Object.keys(STYLE_BASE_PARAMETERS));

interface FocusDocument extends HudDocument {
  activeElement: FocusableElement | null;
  createElement(tagName: string): FocusableElement;
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

export function styleDraft(
  overrides: Partial<{
    headVersionId: string;
    baseVersionId: string;
    sessionActive: boolean;
    history: readonly {
      versionId: string;
      createdAt: string;
      changedKeys: number;
      current: boolean;
    }[];
  }> = {},
): StyleSlidersDraft {
  return createStyleSlidersDraft({
    playerId: STYLE_PLAYER,
    profileId: STYLE_PROFILE,
    sessionId: STYLE_SESSION,
    worldEpoch: 1,
    baseVersionId: overrides.baseVersionId ?? STYLE_BASE,
    headVersionId: overrides.headVersionId ?? STYLE_BASE,
    learningEpoch: 1,
    baseParameters: STYLE_BASE_PARAMETERS,
    availableKeys: STYLE_AVAILABLE_KEYS,
    history: overrides.history ?? [
      {
        versionId: 'profile-v3',
        createdAt: '2026-10-22T00:00:02Z',
        changedKeys: 2,
        current: false,
      },
      {
        versionId: 'profile-v2',
        createdAt: '2026-10-22T00:00:01Z',
        changedKeys: 1,
        current: false,
      },
      { versionId: STYLE_BASE, createdAt: '2026-10-22T00:00:00Z', changedKeys: 0, current: true },
    ],
    sessionActive: overrides.sessionActive ?? true,
  });
}

export interface StyleHarnessOptions {
  readonly draft?: StyleSlidersDraft;
  readonly now?: () => number;
  /** When false the popup is created exactly like 229, without a style tab. */
  readonly withStyleTab?: boolean;
}

export interface StyleHarness {
  readonly doc: FocusDocument;
  readonly host: FocusableElement;
  readonly panel: ControlSlidersPanel;
  readonly drafts: StyleSlidersDraft[];
  readonly applied: StyleSlidersDraft[];
  readonly cancelled: StyleSlidersDraft[];
  readonly resets: StyleSlidersDraft[];
  readonly rebased: StyleSlidersDraft[];
  readonly restored: string[];
  readonly closed: string[];
  root(): FocusableElement;
  styleRoot(): FocusableElement;
  byClass(name: string): FocusableElement;
  option(name: string): FocusableElement;
  styleControl(field: StyleSliderField): FocusableElement;
  styleOutput(field: StyleSliderField): FocusableElement;
  unavailable(parameterKey: string): FocusableElement;
  restoreSelect(): FocusableElement;
  restoreButton(): FocusableElement;
  confirmButton(): FocusableElement;
  rebaseButton(): FocusableElement;
  controlTab(): FocusableElement;
  cityTab(): FocusableElement;
  applyButton(): FocusableElement;
  cancelButton(): FocusableElement;
  resetButton(): FocusableElement;
  closeButton(): FocusableElement;
  drag(field: StyleSliderField, values: readonly number[]): void;
  click(node: FocusableElement): void;
  key(key: string, init?: HudEventInit): void;
  draft(): StyleSlidersDraft;
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
  if (found === null) throw new Error(`Style sliders control is missing: ${label}`);
  return found as FocusableElement;
}

function idSuffix(node: HudElement, suffix: string): boolean {
  const id = node.getAttribute('id');
  return id !== null && id.endsWith(`-${suffix}`);
}

export function createStyleHarness(options: StyleHarnessOptions = {}): StyleHarness {
  const doc = createFocusDocument(),
    host = doc.createElement('div') as FocusableElement,
    draft = options.draft ?? styleDraft(),
    drafts: StyleSlidersDraft[] = [],
    applied: StyleSlidersDraft[] = [],
    cancelled: StyleSlidersDraft[] = [],
    resets: StyleSlidersDraft[] = [],
    rebased: StyleSlidersDraft[] = [],
    restored: string[] = [],
    closed: string[] = [],
    panel = createControlSlidersPanel(host as unknown as HTMLElement, controlSlidersDraft(), {
      close: (reason) => {
        closed.push(reason);
      },
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.withStyleTab === false
        ? {}
        : {
            style: {
              draft,
              onChange: (next) => drafts.push(next),
              apply: (next) => applied.push(next),
              cancel: (next) => cancelled.push(next),
              reset: (next) => resets.push(next),
              rebase: (next) => rebased.push(next),
              restore: (versionId) => restored.push(versionId),
              ...(options.now === undefined ? {} : { now: options.now }),
            },
          }),
    }),
    root = (): FocusableElement => {
      const element = host.children[0];
      if (!element) throw new Error('Control sliders root is missing');
      return element as FocusableElement;
    },
    styleRoot = (): FocusableElement =>
      requireElement(
        root(),
        (node) => (node.getAttribute('class') ?? '').includes('style-sliders'),
        'style root',
      ),
    byClass = (name: string): FocusableElement =>
      requireElement(
        root(),
        (node) => (node.getAttribute('class') ?? '').includes(`control-sliders__${name}`),
        name,
      ),
    styleByClass = (name: string): FocusableElement =>
      requireElement(
        styleRoot(),
        (node) => (node.getAttribute('class') ?? '').includes(`style-sliders__${name}`),
        name,
      ),
    styleControl = (field: StyleSliderField): FocusableElement =>
      requireElement(
        styleRoot(),
        (node) => node.tagName === 'input' && idSuffix(node, field),
        field,
      ),
    styleOutput = (field: StyleSliderField): FocusableElement =>
      requireElement(
        styleRoot(),
        (node) =>
          node.tagName === 'output' && node.getAttribute('for')?.endsWith(`-${field}`) === true,
        `output ${field}`,
      ),
    unavailable = (parameterKey: string): FocusableElement =>
      requireElement(
        styleRoot(),
        (node) => node.getAttribute('data-parameter-key') === parameterKey,
        parameterKey,
      ),
    dispatch = (node: FocusableElement, type: string) => {
      node.dispatch(type);
    },
    drag = (field: StyleSliderField, values: readonly number[]) => {
      const node = styleControl(field);
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
      root().dispatchEvent('keydown', { key: keyName, ...init });
    };
  return {
    doc,
    host,
    panel,
    drafts,
    applied,
    cancelled,
    resets,
    rebased,
    restored,
    closed,
    root,
    styleRoot,
    byClass,
    option: (name) => requireElement(styleRoot(), (node) => node.tagName === 'option', name),
    styleControl,
    styleOutput,
    unavailable,
    restoreSelect: () => styleByClass('restore-select'),
    restoreButton: () => styleByClass('restore-button'),
    confirmButton: () => styleByClass('confirm-button'),
    rebaseButton: () => styleByClass('rebase'),
    controlTab: () =>
      requireElement(root(), (node) => idSuffix(node, 'tab-control'), 'tab control'),
    cityTab: () => requireElement(root(), (node) => idSuffix(node, 'tab-city'), 'tab city'),
    applyButton: () => byClass('apply'),
    cancelButton: () => byClass('cancel'),
    resetButton: () => byClass('reset'),
    closeButton: () => byClass('close'),
    drag,
    click,
    key,
    draft: () => panel.getStyleDraft() ?? draft,
    dom: () => serializeHud(root()),
  };
}

export { createControlSlidersDraft };
