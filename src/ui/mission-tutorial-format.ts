import type { TutorialState, TutorialStepId } from '../missions';

/**
 * 117 tutorial panel format. The panel is a pure projection of one accepted tutorial progress
 * snapshot; it never reads the tutorial, the input system, the profile store or the renderer.
 *
 * Keyboard and mouse both work through the same path: every action is a native `<button>`, so the
 * browser activates it with a click or with the standard Enter/Space activation of the focused
 * button. No global key listener is installed, therefore driving keys keep working while the panel
 * is visible, and the tutorial never takes over the keyboard.
 */
export const TUTORIAL_PANEL_VERSION = '117-mission-tutorial-ui-v1' as const;

export const TUTORIAL_PANEL_LIMITS = Object.freeze({
  version: TUTORIAL_PANEL_VERSION,
  /** Fixed DOM budget: one section, heading, six status lines, four buttons. */
  elements: 12,
  textNodes: 12,
  listeners: 4,
  globalListeners: 0,
  maximumHz: 10,
  retainedProjections: 1,
  titleCodeUnits: 160,
  instructionCodeUnits: 512,
  idCodeUnits: 512,
});

export const tutorialPanelActions = ['PAUSE', 'RESUME', 'SKIP_STEP', 'SKIP_ALL'] as const;
export type TutorialPanelAction = (typeof tutorialPanelActions)[number];

export interface TutorialPanelSnapshot {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly version: typeof TUTORIAL_PANEL_VERSION;
  readonly tick: number;
  readonly state: TutorialState;
  /** Current step, `null` once the tutorial is complete. */
  readonly stepId: TutorialStepId | null;
  readonly stepIndex: number;
  readonly stepCount: number;
  readonly title: string;
  readonly instruction: string;
  readonly taxiId: string | null;
}

export interface TutorialPanelButton {
  readonly action: TutorialPanelAction;
  readonly label: string;
  readonly disabled: boolean;
  /** Native buttons are activated by the browser with either key. */
  readonly ariaKeyshortcuts: 'Enter Space';
}

export interface TutorialPanelProjection {
  readonly signature: string;
  readonly heading: string;
  readonly progress: string;
  readonly status: string;
  readonly title: string;
  readonly instruction: string;
  readonly taxi: string;
  readonly learning: string;
  readonly taxiAccess: string;
  readonly buttons: readonly TutorialPanelButton[];
  readonly ariaLabel: string;
  readonly complete: boolean;
}

export const TUTORIAL_PANEL_TEXT = Object.freeze({
  heading: 'Tutorial · Primul taxi',
  learning: 'LEARNING: eligibilitate oprită în tutorial, fără job sau versiune de profil',
  taxiAccess: 'Toate taxiurile rămân disponibile indiferent de progresul tutorialului',
  none: 'Niciun taxi selectat',
  complete: 'Tutorial finalizat',
});

function plain(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Tutorial panel requires plain data');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new Error('Tutorial panel requires plain data');
  const names = Reflect.ownKeys(value);
  if (
    names.length !== keys.length ||
    names.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    throw new Error('Tutorial panel fields');
  const data: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      throw new Error('Tutorial panel descriptor');
    data[key] = descriptor.value;
  }
  return data;
}

const snapshotFields = [
  'schemaVersion',
  'units',
  'sessionId',
  'worldEpoch',
  'version',
  'tick',
  'state',
  'stepId',
  'stepIndex',
  'stepCount',
  'title',
  'instruction',
  'taxiId',
] as const;

const stepIds = [
  'SELECT_TAXI',
  'MODE_MANUAL',
  'MODE_LEARNING',
  'MODE_AUTO',
  'COMPLETE_RIDE',
] as const;

function identifier(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > TUTORIAL_PANEL_LIMITS.idCodeUnits
  )
    throw new Error(`Tutorial panel ${label}`);
  return value;
}

function boundedText(value: unknown, maximum: number, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum)
    throw new Error(`Tutorial panel ${label}`);
  return value;
}

export function parseTutorialPanelSnapshot(value: unknown): TutorialPanelSnapshot {
  const data = plain(value, snapshotFields);
  if (data.schemaVersion !== 1 || data.units !== 'SI' || data.version !== TUTORIAL_PANEL_VERSION)
    throw new Error('Tutorial panel contract version');
  const sessionId = identifier(data.sessionId, 'session');
  const worldEpoch = data.worldEpoch;
  if (typeof worldEpoch !== 'number' || !Number.isSafeInteger(worldEpoch) || worldEpoch < 0)
    throw new Error('Tutorial panel world epoch');
  const tick = data.tick;
  if (typeof tick !== 'number' || !Number.isSafeInteger(tick) || tick < 0)
    throw new Error('Tutorial panel tick');
  const state = data.state;
  if (state !== 'ACTIVE' && state !== 'PAUSED' && state !== 'COMPLETED')
    throw new Error('Tutorial panel state');
  const stepIndex = data.stepIndex;
  const stepCount = data.stepCount;
  if (
    typeof stepIndex !== 'number' ||
    !Number.isSafeInteger(stepIndex) ||
    typeof stepCount !== 'number' ||
    !Number.isSafeInteger(stepCount) ||
    stepCount !== stepIds.length ||
    stepIndex < 0 ||
    stepIndex > stepCount
  )
    throw new Error('Tutorial panel progress');
  let stepId: TutorialStepId | null = null;
  if (state === 'COMPLETED') {
    if (stepIndex !== stepCount || data.stepId !== null)
      throw new Error('Completed tutorial panel carries a pending step');
  } else {
    if (stepIndex >= stepCount) throw new Error('Active tutorial panel has no current step');
    if (typeof data.stepId !== 'string' || !(stepIds as readonly string[]).includes(data.stepId))
      throw new Error('Tutorial panel step id');
    stepId = data.stepId as TutorialStepId;
  }
  const taxiId = data.taxiId === null ? null : identifier(data.taxiId, 'taxi');
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    sessionId,
    worldEpoch,
    version: TUTORIAL_PANEL_VERSION,
    tick,
    state,
    stepId,
    stepIndex,
    stepCount,
    title: boundedText(data.title, TUTORIAL_PANEL_LIMITS.titleCodeUnits, 'title'),
    instruction: boundedText(
      data.instruction,
      TUTORIAL_PANEL_LIMITS.instructionCodeUnits,
      'instruction',
    ),
    taxiId,
  });
}

function button(
  action: TutorialPanelAction,
  label: string,
  disabled: boolean,
): TutorialPanelButton {
  return Object.freeze({ action, label, disabled, ariaKeyshortcuts: 'Enter Space' as const });
}

export function projectTutorialPanel(snapshot: TutorialPanelSnapshot): TutorialPanelProjection {
  const active = snapshot.state === 'ACTIVE';
  const complete = snapshot.state === 'COMPLETED';
  const progress = complete
    ? TUTORIAL_PANEL_TEXT.complete
    : `Pasul ${snapshot.stepIndex + 1} din ${snapshot.stepCount}`;
  const status = complete
    ? 'Finalizat'
    : snapshot.state === 'PAUSED'
      ? 'Pauză · reia când vrei'
      : 'În desfășurare';
  const buttons = Object.freeze([
    button('PAUSE', 'Pauză', !active),
    button('RESUME', 'Reia', snapshot.state !== 'PAUSED'),
    button('SKIP_STEP', 'Sari peste pas', !active || snapshot.stepId === null),
    button('SKIP_ALL', 'Sari peste tutorial', !active),
  ]);
  const projection: TutorialPanelProjection = Object.freeze({
    signature: JSON.stringify([
      snapshot.state,
      snapshot.stepId,
      snapshot.stepIndex,
      snapshot.taxiId,
      snapshot.title,
      snapshot.instruction,
    ]),
    heading: TUTORIAL_PANEL_TEXT.heading,
    progress,
    status,
    title: complete ? TUTORIAL_PANEL_TEXT.complete : snapshot.title,
    instruction: complete
      ? 'Poți continua cu orice taxi; accesul nu a fost restricționat.'
      : snapshot.instruction,
    taxi: snapshot.taxiId === null ? TUTORIAL_PANEL_TEXT.none : `Taxi: ${snapshot.taxiId}`,
    learning: TUTORIAL_PANEL_TEXT.learning,
    taxiAccess: TUTORIAL_PANEL_TEXT.taxiAccess,
    buttons,
    ariaLabel: `${TUTORIAL_PANEL_TEXT.heading} · ${progress} · ${status}`,
    complete,
  });
  return projection;
}
