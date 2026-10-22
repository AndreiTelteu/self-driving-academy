/**
 * 083 shared accessibility contract. See Docs/ui-accessibility.md.
 *
 * The contract is declarative: every audited panel is described by the same descriptor shape, and
 * `auditPanelAccessibility` derives closed issues from those descriptors and the real colour tokens.
 * Nothing here reads the DOM, drives the car, changes a panel contract or claims a visual pass: the
 * audit only measures what the descriptors declare, so a broken descriptor is reported, not hidden.
 *
 * Colours mirror the literals in `src/style.css` (no redesign). Alpha borders are kept as the real
 * CSS value and are not fed to `contrastRatio`, which accepts only solid `#rgb`/`#rrggbb` colours.
 */
export const ACCESSIBILITY_VERSION = '083-ui-accessibility-v1';

export const PANEL_IDS = [
  'fleet',
  'profile',
  'profileHistory',
  'gameSettings',
  'cityDashboard',
  'keyRemapping',
  'learningNotifications',
  'minimap',
  'mapSelection',
  'taxiHud',
] as const;

export type PanelId = (typeof PANEL_IDS)[number];

/** WCAG 2.1 AA thresholds used by the audit. */
export const ACCESSIBILITY_CONTRAST_REQUIREMENTS = Object.freeze({
  normalText: 4.5,
  largeText: 3,
  nonText: 3,
});

export type ContrastTarget = 'text' | 'largeText' | 'nonText';

export interface AccessibilityTokens {
  readonly version: typeof ACCESSIBILITY_VERSION;
  /** Panel body text: `#f3f7fb`. */
  readonly text: string;
  /** Secondary/muted text: `#b9cfc5`. */
  readonly textMuted: string;
  /** Supporting text: `#c6dbd1`. */
  readonly textSecondary: string;
  /** Emphasised label text: `#dbe8e2`. */
  readonly textStrong: string;
  /** Small supporting text (city dashboard sample): `#9bb3a8`. */
  readonly textSmall: string;
  /** Panel background: `#0d1714` (the CSS value is `#0d1714f2`, alpha removed for measurement). */
  readonly surface: string;
  /** Raised row/card background: `#13251f`. */
  readonly surfaceRaised: string;
  /** Sunken block background: `#101f1a`. */
  readonly surfaceSunken: string;
  /** Control background: `#1c332b`. */
  readonly control: string;
  /** Alpha border exactly as authored in CSS; never measured by `contrastRatio`. */
  readonly border: string;
  /** Visible focus ring: `#9edbb5`. */
  readonly focus: string;
  readonly success: string;
  readonly warning: string;
  readonly error: string;
  readonly selected: string;
  /** Ink used on the light taxi/civilian marker: `#07110d`. */
  readonly markerInk: string;
  readonly sizes: Readonly<{ normalTextPx: number; smallTextPx: number; largeTextPx: number }>;
}

export const ACCESSIBILITY_TOKENS: AccessibilityTokens = Object.freeze({
  version: ACCESSIBILITY_VERSION,
  text: '#f3f7fb',
  textMuted: '#b9cfc5',
  textSecondary: '#c6dbd1',
  textStrong: '#dbe8e2',
  textSmall: '#9bb3a8',
  surface: '#0d1714',
  surfaceRaised: '#13251f',
  surfaceSunken: '#101f1a',
  control: '#1c332b',
  border: '#ffffff2b',
  focus: '#9edbb5',
  success: '#9edbb5',
  warning: '#ffd27f',
  error: '#ffb3a7',
  selected: '#7fd7ff',
  markerInk: '#07110d',
  sizes: Object.freeze({ normalTextPx: 14, smallTextPx: 12, largeTextPx: 24 }),
});

const HEX_DIGITS = '0123456789abcdefABCDEF';

/** Solid `#rgb`/`#rrggbb` only; alpha and named colours are rejected by contract. */
function isHexColour(value: unknown): value is string {
  if (typeof value !== 'string' || value[0] !== '#') return false;
  if (value.length !== 4 && value.length !== 7) return false;
  for (let index = 1; index < value.length; index += 1)
    if (!HEX_DIGITS.includes(value[index]!)) return false;
  return true;
}

function channel(hex: string, index: number): number {
  const start = hex.length === 4 ? index + 1 : 1 + index * 2,
    width = hex.length === 4 ? 1 : 2,
    value = Number.parseInt(hex.slice(start, start + width), 16);
  return (width === 1 ? value * 17 : value) / 255;
}

/** WCAG relative luminance of a solid `#rgb`/`#rrggbb` colour. */
export function relativeLuminance(hex: string): number {
  if (!isHexColour(hex)) throw new Error(`Unsupported hex colour: ${String(hex)}`);
  const linear = (value: number): number =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  const r = linear(channel(hex, 0)),
    g = linear(channel(hex, 1)),
    b = linear(channel(hex, 2));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG contrast ratio between two solid colours, rounded to two decimals so the audit, the tests and
 * the evidence report agree bit-for-bit. Symmetric: the lighter colour is always the numerator.
 */
export function contrastRatio(foregroundHex: string, backgroundHex: string): number {
  const foreground = relativeLuminance(foregroundHex),
    background = relativeLuminance(backgroundHex),
    ratio = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  return Math.round(ratio * 100) / 100;
}

/**
 * Required ratio for a text size/weight, or for a non-text indicator when `sizePx` is `0`.
 * WCAG AA: 4.5:1 normal text, 3:1 large text (>= 24px, or >= 18.66px bold) and 3:1 non-text/focus.
 */
export function requiredContrast(sizePx: number, weight = 400): number {
  if (!Number.isFinite(sizePx) || sizePx < 0) throw new Error('Contrast size must be non-negative');
  if (!Number.isFinite(weight) || weight <= 0) throw new Error('Contrast weight must be positive');
  if (sizePx === 0) return ACCESSIBILITY_CONTRAST_REQUIREMENTS.nonText;
  if (sizePx >= 24) return ACCESSIBILITY_CONTRAST_REQUIREMENTS.largeText;
  if (sizePx >= 18.66 && weight >= 700) return ACCESSIBILITY_CONTRAST_REQUIREMENTS.largeText;
  return ACCESSIBILITY_CONTRAST_REQUIREMENTS.normalText;
}

export type PanelSurfaceKind = 'panel' | 'menu' | 'diagnostic';
export type PanelRole = 'region' | 'dialog' | 'status' | 'group';
export type PanelControlRole = 'button' | 'select' | 'input' | 'summary';

export interface PanelControlDescriptor {
  readonly selector: string;
  readonly role: PanelControlRole;
  /** The browser handles Enter/Space/arrow keys for this native control. */
  readonly keyboardNative: boolean;
  /** Every matched `<button>` carries an explicit `type="button"` (always true for non-buttons). */
  readonly explicitTypeButton: boolean;
  /** Exact count for chrome controls, `'dynamic'` for rows created from real data. */
  readonly count: number | 'dynamic';
}

export interface PanelFocusVisible {
  /** Real selector that carries the visible focus indicator; empty for non-interactive surfaces. */
  readonly selector: string;
  readonly outlineStyle: 'solid';
  readonly outlineWidthPx: number;
  readonly outlineOffsetPx: number;
}

export interface PanelContrastPair {
  readonly id: string;
  readonly foreground: string;
  readonly background: string;
  /** 0 marks a non-text indicator (focus ring, selected border) with a 3:1 requirement. */
  readonly sizePx: number;
  readonly weight: number;
}

export interface PanelSurfaceDescriptor {
  readonly id: PanelId;
  /** Accessible name, exactly the visible/`aria-label` name of the real root. */
  readonly name: string;
  readonly role: PanelRole;
  readonly landmark: string;
  readonly surface: PanelSurfaceKind;
  /** A modal surface traps focus and owns an Escape close key. */
  readonly modal: boolean;
  /** Keyboard shortcut that opens the surface, or `null` when the host opens it another way. */
  readonly openKey: string | null;
  readonly closeKey: string | null;
  readonly closeEffect: string;
  /** Root selector of the real adapter element. */
  readonly selector: string;
  readonly interactive: boolean;
  /** Tab stops in tab order. A `tabindex="-1"` dismiss button is not a tab stop. */
  readonly focusableSelectors: readonly string[];
  readonly focusVisible: PanelFocusVisible;
  readonly controls: readonly PanelControlDescriptor[];
  readonly ownsGlobalKeyListener: boolean;
  readonly stateIsTextBacked: boolean;
  readonly keyboardOperable: boolean;
  readonly contrast: readonly PanelContrastPair[];
  readonly source: string;
  readonly documentedIn: string;
}

const tokens = ACCESSIBILITY_TOKENS;

interface PairInput {
  readonly foreground: string;
  readonly background: string;
  readonly sizePx?: number;
  readonly weight?: number;
}

function pair(id: string, input: PairInput): PanelContrastPair {
  return Object.freeze({
    id,
    foreground: input.foreground,
    background: input.background,
    sizePx: input.sizePx ?? tokens.sizes.normalTextPx,
    weight: input.weight ?? 400,
  });
}

/** Shared pairs reused by the descriptors; each panel lists only the pairs it really renders. */
const PAIRS = Object.freeze({
  text: pair('text-on-surface', { foreground: tokens.text, background: tokens.surface }),
  textRaised: pair('text-on-raised', { foreground: tokens.text, background: tokens.surfaceRaised }),
  muted: pair('muted-on-surface', {
    foreground: tokens.textMuted,
    background: tokens.surface,
    sizePx: tokens.sizes.smallTextPx,
  }),
  mutedRaised: pair('muted-on-raised', {
    foreground: tokens.textMuted,
    background: tokens.surfaceRaised,
    sizePx: tokens.sizes.smallTextPx,
  }),
  secondary: pair('secondary-on-surface', {
    foreground: tokens.textSecondary,
    background: tokens.surface,
    sizePx: tokens.sizes.smallTextPx,
  }),
  secondaryRaised: pair('secondary-on-raised', {
    foreground: tokens.textSecondary,
    background: tokens.surfaceRaised,
    sizePx: tokens.sizes.smallTextPx,
  }),
  strong: pair('strong-on-raised', {
    foreground: tokens.textStrong,
    background: tokens.surfaceRaised,
    sizePx: tokens.sizes.smallTextPx,
  }),
  small: pair('small-on-raised', {
    foreground: tokens.textSmall,
    background: tokens.surfaceRaised,
    sizePx: tokens.sizes.smallTextPx,
  }),
  success: pair('success-on-raised', {
    foreground: tokens.success,
    background: tokens.surfaceRaised,
    sizePx: tokens.sizes.smallTextPx,
  }),
  successSurface: pair('success-on-surface', {
    foreground: tokens.success,
    background: tokens.surface,
    sizePx: tokens.sizes.smallTextPx,
  }),
  warning: pair('warning-on-surface', {
    foreground: tokens.warning,
    background: tokens.surface,
    sizePx: tokens.sizes.smallTextPx,
  }),
  warningRaised: pair('warning-on-raised', {
    foreground: tokens.warning,
    background: tokens.surfaceRaised,
    sizePx: tokens.sizes.smallTextPx,
  }),
  errorRaised: pair('error-on-raised', {
    foreground: tokens.error,
    background: tokens.surfaceRaised,
    sizePx: tokens.sizes.smallTextPx,
  }),
  selectedRaised: pair('selected-on-raised', {
    foreground: tokens.selected,
    background: tokens.surfaceRaised,
    sizePx: 0,
  }),
  focusSurface: pair('focus-on-surface', {
    foreground: tokens.focus,
    background: tokens.surface,
    sizePx: 0,
  }),
  focusRaised: pair('focus-on-raised', {
    foreground: tokens.focus,
    background: tokens.surfaceRaised,
    sizePx: 0,
  }),
  selectedSurface: pair('selected-on-surface', {
    foreground: tokens.selected,
    background: tokens.surface,
    sizePx: 0,
  }),
  markerInk: pair('marker-ink-on-selected', {
    foreground: tokens.markerInk,
    background: tokens.selected,
    sizePx: tokens.sizes.smallTextPx,
  }),
});

const FOCUS_3PX = (selector: string): PanelFocusVisible =>
  Object.freeze({ selector, outlineStyle: 'solid', outlineWidthPx: 3, outlineOffsetPx: 2 });

const NO_FOCUS: PanelFocusVisible = Object.freeze({
  selector: '',
  outlineStyle: 'solid',
  outlineWidthPx: 0,
  outlineOffsetPx: 0,
});

const BUTTON_ROW = (selector: string): PanelControlDescriptor =>
  Object.freeze({
    selector,
    role: 'button',
    keyboardNative: true,
    explicitTypeButton: true,
    count: 'dynamic',
  });

const native = (
  selector: string,
  role: PanelControlRole,
  count: number | 'dynamic',
): PanelControlDescriptor =>
  Object.freeze({
    selector,
    role,
    keyboardNative: true,
    explicitTypeButton: true,
    count,
  });

/**
 * The real panels of the dark UI. Declared order is the canonical audit order. A change to a panel's
 * keyboard contract or colours belongs here in the same change as the adapter.
 */
export const PANEL_SURFACES: readonly PanelSurfaceDescriptor[] = Object.freeze([
  Object.freeze({
    id: 'fleet',
    name: 'Lista taxiurilor',
    role: 'region',
    landmark: 'complementary',
    surface: 'panel',
    modal: false,
    openKey: 'Tab',
    closeKey: 'Escape',
    closeEffect:
      'Escape closes the list through the injected close port; the camera stays untouched.',
    selector: '.fleet-panel',
    interactive: true,
    focusableSelectors: Object.freeze([
      'select.fleet-panel__filter',
      'select.fleet-panel__sort',
      'button.fleet-panel__row',
    ]),
    focusVisible: FOCUS_3PX('.fleet-panel__row:focus-visible'),
    controls: Object.freeze([
      native('select.fleet-panel__filter', 'select', 1),
      native('select.fleet-panel__sort', 'select', 1),
      BUTTON_ROW('button.fleet-panel__row'),
    ]),
    ownsGlobalKeyListener: false,
    stateIsTextBacked: true,
    keyboardOperable: true,
    contrast: Object.freeze([
      PAIRS.text,
      PAIRS.textRaised,
      PAIRS.muted,
      PAIRS.mutedRaised,
      PAIRS.secondaryRaised,
      PAIRS.success,
      PAIRS.warningRaised,
      PAIRS.errorRaised,
      PAIRS.selectedRaised,
      PAIRS.focusSurface,
    ]),
    source: 'src/ui/fleet-panel.ts',
    documentedIn: 'Docs/fleet-panel.md',
  }),
  Object.freeze({
    id: 'profile',
    name: 'Panoul profilului',
    role: 'region',
    landmark: 'complementary',
    surface: 'panel',
    modal: false,
    openKey: 'P',
    closeKey: 'Escape',
    closeEffect: 'Escape closes the read-only profile panel; no profile value is written.',
    selector: '.profile-panel',
    interactive: true,
    focusableSelectors: Object.freeze(['.profile-panel__details summary']),
    focusVisible: FOCUS_3PX('.profile-panel__details summary:focus-visible'),
    controls: Object.freeze([native('.profile-panel__details summary', 'summary', 1)]),
    ownsGlobalKeyListener: false,
    stateIsTextBacked: true,
    keyboardOperable: true,
    contrast: Object.freeze([
      PAIRS.text,
      PAIRS.textRaised,
      PAIRS.muted,
      PAIRS.mutedRaised,
      PAIRS.secondary,
      PAIRS.successSurface,
      PAIRS.warning,
      PAIRS.selectedRaised,
      PAIRS.focusSurface,
    ]),
    source: 'src/ui/profile-panel.ts',
    documentedIn: 'Docs/profile-panel.md',
  }),
  Object.freeze({
    id: 'profileHistory',
    name: 'Istoricul profilului',
    role: 'region',
    landmark: 'complementary',
    surface: 'panel',
    modal: false,
    openKey: 'P',
    closeKey: 'Escape',
    closeEffect: 'Escape closes the history; the pending restore confirmation is dropped.',
    selector: '.profile-history',
    interactive: true,
    focusableSelectors: Object.freeze([
      'button.profile-history__row',
      'button.profile-history__restore-button',
      'button.profile-history__confirm-button',
    ]),
    focusVisible: FOCUS_3PX('.profile-history__row:focus-visible'),
    controls: Object.freeze([
      BUTTON_ROW('button.profile-history__row'),
      native('button.profile-history__restore-button', 'button', 1),
      native('button.profile-history__confirm-button', 'button', 1),
    ]),
    ownsGlobalKeyListener: false,
    stateIsTextBacked: true,
    keyboardOperable: true,
    contrast: Object.freeze([
      PAIRS.text,
      PAIRS.textRaised,
      PAIRS.muted,
      PAIRS.mutedRaised,
      PAIRS.secondary,
      PAIRS.successSurface,
      PAIRS.warning,
      PAIRS.errorRaised,
      PAIRS.selectedRaised,
      PAIRS.focusSurface,
    ]),
    source: 'src/ui/profile-history.ts',
    documentedIn: 'Docs/profile-history.md',
  }),
  Object.freeze({
    id: 'gameSettings',
    name: 'Setările jocului',
    role: 'dialog',
    landmark: 'dialog',
    surface: 'menu',
    modal: true,
    openKey: null,
    closeKey: 'Escape',
    closeEffect:
      'Escape closes the settings popup through its close port; the draft is not applied.',
    selector: '.game-settings',
    interactive: true,
    focusableSelectors: Object.freeze([
      'select.game-settings__select',
      'input.game-settings__range',
      'input.game-settings__checkbox',
      '.game-settings__footer button',
    ]),
    focusVisible: FOCUS_3PX('.game-settings__footer button:focus-visible'),
    controls: Object.freeze([
      native('select.game-settings__select', 'select', 5),
      native('input.game-settings__range', 'input', 8),
      native('input.game-settings__checkbox', 'input', 1),
      native('.game-settings__footer button', 'button', 3),
    ]),
    ownsGlobalKeyListener: false,
    stateIsTextBacked: true,
    keyboardOperable: true,
    contrast: Object.freeze([
      PAIRS.text,
      PAIRS.textRaised,
      PAIRS.muted,
      PAIRS.secondaryRaised,
      PAIRS.strong,
      PAIRS.success,
      PAIRS.warning,
      PAIRS.errorRaised,
      PAIRS.focusRaised,
    ]),
    source: 'src/ui/game-settings.ts',
    documentedIn: 'Docs/game-settings.md',
  }),
  Object.freeze({
    id: 'cityDashboard',
    name: 'Tabloul orașului',
    role: 'region',
    landmark: 'complementary',
    surface: 'panel',
    modal: false,
    openKey: null,
    closeKey: 'Escape',
    closeEffect: 'Escape closes the dashboard; no incident, profile or camera state changes.',
    selector: '.city-dashboard',
    interactive: true,
    focusableSelectors: Object.freeze(['button.city-dashboard__incident-row']),
    focusVisible: FOCUS_3PX('.city-dashboard__incident-row:focus-visible'),
    controls: Object.freeze([BUTTON_ROW('button.city-dashboard__incident-row')]),
    ownsGlobalKeyListener: false,
    stateIsTextBacked: true,
    keyboardOperable: true,
    contrast: Object.freeze([
      PAIRS.text,
      PAIRS.textRaised,
      PAIRS.muted,
      PAIRS.mutedRaised,
      PAIRS.secondary,
      PAIRS.small,
      PAIRS.warning,
      PAIRS.warningRaised,
      PAIRS.errorRaised,
      PAIRS.selectedRaised,
      PAIRS.focusSurface,
    ]),
    source: 'src/ui/city-dashboard.ts',
    documentedIn: 'Docs/city-dashboard.md',
  }),
  Object.freeze({
    id: 'keyRemapping',
    name: 'Remaparea comenzilor',
    role: 'dialog',
    landmark: 'dialog',
    surface: 'menu',
    modal: true,
    openKey: null,
    closeKey: 'Escape',
    closeEffect:
      'Escape cancels an active key capture first (the button stops propagation); otherwise it closes the dialog.',
    selector: '.key-remapping',
    interactive: true,
    focusableSelectors: Object.freeze([
      'button.key-remapping__key',
      'button.key-remapping__actions button',
    ]),
    focusVisible: FOCUS_3PX('.key-remapping__key:focus-visible'),
    controls: Object.freeze([
      BUTTON_ROW('button.key-remapping__key'),
      native('button.key-remapping__actions button', 'button', 3),
    ]),
    ownsGlobalKeyListener: false,
    stateIsTextBacked: true,
    keyboardOperable: true,
    contrast: Object.freeze([
      PAIRS.text,
      PAIRS.textRaised,
      PAIRS.muted,
      PAIRS.mutedRaised,
      PAIRS.secondaryRaised,
      PAIRS.success,
      PAIRS.warningRaised,
      PAIRS.errorRaised,
      PAIRS.focusSurface,
    ]),
    source: 'src/ui/key-remapping.ts',
    documentedIn: 'Docs/key-remapping.md',
  }),
  Object.freeze({
    id: 'learningNotifications',
    name: 'Notificări de analiză',
    role: 'status',
    landmark: 'status',
    surface: 'diagnostic',
    modal: false,
    openKey: null,
    closeKey: null,
    closeEffect: 'Notifications expire with the injected clock; they are never a focus trap.',
    selector: '.learning-notifications',
    interactive: false,
    focusableSelectors: Object.freeze([]),
    focusVisible: NO_FOCUS,
    controls: Object.freeze([
      Object.freeze({
        selector: 'button.learning-notifications__dismiss',
        role: 'button',
        keyboardNative: true,
        explicitTypeButton: true,
        count: 'dynamic',
      }),
    ]),
    ownsGlobalKeyListener: false,
    stateIsTextBacked: true,
    keyboardOperable: true,
    contrast: Object.freeze([
      PAIRS.text,
      PAIRS.muted,
      PAIRS.secondary,
      PAIRS.successSurface,
      PAIRS.warning,
      PAIRS.errorRaised,
    ]),
    source: 'src/ui/learning-notifications.ts',
    documentedIn: 'Docs/learning-notifications.md',
  }),
  Object.freeze({
    id: 'minimap',
    name: 'Minimapă nord-sus',
    role: 'region',
    landmark: 'complementary',
    surface: 'diagnostic',
    modal: false,
    openKey: null,
    closeKey: null,
    closeEffect: 'The minimap has no controls and never captures focus or keys.',
    selector: '.minimap',
    interactive: false,
    focusableSelectors: Object.freeze([]),
    focusVisible: NO_FOCUS,
    controls: Object.freeze([]),
    ownsGlobalKeyListener: false,
    stateIsTextBacked: true,
    keyboardOperable: true,
    contrast: Object.freeze([PAIRS.text, PAIRS.muted, PAIRS.secondary]),
    source: 'src/ui/minimap.ts',
    documentedIn: 'Docs/minimap.md',
  }),
  Object.freeze({
    id: 'mapSelection',
    name: 'Selectare vehicule pe hartă',
    role: 'group',
    landmark: 'group',
    surface: 'diagnostic',
    modal: false,
    openKey: null,
    closeKey: null,
    closeEffect: 'Markers use the native tab order; Enter/Space select the focused marker.',
    selector: '.map-selection',
    interactive: true,
    focusableSelectors: Object.freeze(['button.map-selection__marker']),
    focusVisible: FOCUS_3PX('.map-selection__marker:focus-visible'),
    controls: Object.freeze([BUTTON_ROW('button.map-selection__marker')]),
    ownsGlobalKeyListener: false,
    stateIsTextBacked: true,
    keyboardOperable: true,
    contrast: Object.freeze([
      PAIRS.text,
      PAIRS.markerInk,
      PAIRS.selectedSurface,
      PAIRS.focusSurface,
    ]),
    source: 'src/ui/map-selection.ts',
    documentedIn: 'Docs/map-selection.md',
  }),
  Object.freeze({
    id: 'taxiHud',
    name: 'HUD de condus',
    role: 'region',
    landmark: 'complementary',
    surface: 'diagnostic',
    modal: false,
    openKey: null,
    closeKey: null,
    closeEffect: 'The native details summary toggles with Enter/Space; the HUD captures no keys.',
    selector: '.taxi-hud',
    interactive: true,
    focusableSelectors: Object.freeze(['.taxi-hud__details summary']),
    focusVisible: FOCUS_3PX('.taxi-hud__details summary:focus-visible'),
    controls: Object.freeze([native('.taxi-hud__details summary', 'summary', 1)]),
    ownsGlobalKeyListener: false,
    stateIsTextBacked: true,
    keyboardOperable: true,
    contrast: Object.freeze([
      PAIRS.text,
      PAIRS.muted,
      PAIRS.successSurface,
      PAIRS.warning,
      PAIRS.errorRaised,
      PAIRS.focusSurface,
    ]),
    source: 'src/ui/taxi-hud.ts',
    documentedIn: 'Docs/hud.md',
  }),
]);

export const ACCESSIBILITY_ISSUE_CODES = [
  'MISSING_NAME',
  'NO_FOCUSABLE',
  'MISSING_VISIBLE_FOCUS',
  'GLOBAL_KEY_LISTENER',
  'COLOR_ONLY_STATE',
  'LOW_CONTRAST',
  'NOT_KEYBOARD_OPERABLE',
  'MISSING_TYPE_BUTTON',
] as const;

export type AccessibilityIssueCode = (typeof ACCESSIBILITY_ISSUE_CODES)[number];

export interface AccessibilityIssue {
  readonly code: AccessibilityIssueCode;
  readonly panelId: string;
  readonly detail: string;
  readonly ratio: number | null;
  readonly required: number | null;
}

export interface AccessibilityContrastMeasurement {
  readonly pairId: string;
  readonly foreground: string;
  readonly background: string;
  readonly sizePx: number;
  readonly weight: number;
  readonly target: ContrastTarget;
  readonly ratio: number;
  readonly required: number;
  readonly pass: boolean;
}

export interface AccessibilityPanelAudit {
  readonly id: string;
  readonly name: string;
  readonly pass: boolean;
  readonly issues: readonly AccessibilityIssue[];
  readonly contrast: readonly AccessibilityContrastMeasurement[];
  readonly focusables: number;
  readonly minimumRatio: number | null;
}

export interface AccessibilityAudit {
  readonly version: typeof ACCESSIBILITY_VERSION;
  /** Version of the colour tokens the measurements were taken against. */
  readonly tokensVersion: typeof ACCESSIBILITY_VERSION;
  readonly pass: boolean;
  readonly panels: readonly AccessibilityPanelAudit[];
  readonly issues: readonly AccessibilityIssue[];
  readonly summary: Readonly<{
    panels: number;
    passed: number;
    failed: number;
    issues: number;
    contrastPairs: number;
    minimumRatio: number | null;
    focusables: number;
  }>;
}

function targetOf(sizePx: number, weight: number): ContrastTarget {
  if (sizePx === 0) return 'nonText';
  return requiredContrast(sizePx, weight) === ACCESSIBILITY_CONTRAST_REQUIREMENTS.largeText
    ? 'largeText'
    : 'text';
}

function ratioText(value: number): string {
  return value.toFixed(2);
}

const PANEL_ORDER = new Map<PanelId, number>(PANEL_IDS.map((id, index) => [id, index]));

function orderOf(id: string): number {
  return PANEL_ORDER.get(id as PanelId) ?? Number.MAX_SAFE_INTEGER;
}

function comparePanels(left: AccessibilityPanelAudit, right: AccessibilityPanelAudit): number {
  const byOrder = orderOf(left.id) - orderOf(right.id);
  if (byOrder !== 0) return byOrder;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function auditPanel(descriptor: PanelSurfaceDescriptor): AccessibilityPanelAudit {
  const issues: AccessibilityIssue[] = [];
  const issue = (
    code: AccessibilityIssueCode,
    detail: string,
    ratio: number | null = null,
    required: number | null = null,
  ): void => {
    issues.push(Object.freeze({ code, panelId: descriptor.id, detail, ratio, required }));
  };

  if (typeof descriptor.name !== 'string' || descriptor.name.trim().length === 0)
    issue('MISSING_NAME', 'panel has no accessible name');
  if (descriptor.ownsGlobalKeyListener !== false)
    issue('GLOBAL_KEY_LISTENER', 'panel owns a window/document key listener');
  if (descriptor.stateIsTextBacked !== true)
    issue('COLOR_ONLY_STATE', 'panel state is carried by colour only');
  if (descriptor.keyboardOperable !== true)
    issue('NOT_KEYBOARD_OPERABLE', 'panel declares itself not keyboard operable');

  const focusables = descriptor.focusableSelectors.length;
  if (descriptor.interactive) {
    if (focusables === 0) issue('NO_FOCUSABLE', 'interactive panel declares no tab stop');
    if (
      descriptor.focusVisible.selector.trim().length === 0 ||
      descriptor.focusVisible.outlineStyle !== 'solid' ||
      descriptor.focusVisible.outlineWidthPx < 2
    )
      issue(
        'MISSING_VISIBLE_FOCUS',
        `visible focus needs a solid outline of at least 2px, declared ${descriptor.focusVisible.outlineWidthPx}px on "${descriptor.focusVisible.selector}"`,
      );
    if (descriptor.modal && descriptor.closeKey === null)
      issue('NOT_KEYBOARD_OPERABLE', 'modal panel has no Escape close key');
  }

  for (const control of descriptor.controls) {
    if (control.role === 'button' && control.explicitTypeButton !== true)
      issue('MISSING_TYPE_BUTTON', `button "${control.selector}" lacks type="button"`);
    if (control.keyboardNative !== true)
      issue('NOT_KEYBOARD_OPERABLE', `control "${control.selector}" is not keyboard native`);
  }

  const contrast: AccessibilityContrastMeasurement[] = [];
  for (const measured of descriptor.contrast) {
    const ratio = contrastRatio(measured.foreground, measured.background),
      required = requiredContrast(measured.sizePx, measured.weight),
      pass = ratio >= required;
    contrast.push(
      Object.freeze({
        pairId: measured.id,
        foreground: measured.foreground,
        background: measured.background,
        sizePx: measured.sizePx,
        weight: measured.weight,
        target: targetOf(measured.sizePx, measured.weight),
        ratio,
        required,
        pass,
      }),
    );
    if (!pass)
      issue(
        'LOW_CONTRAST',
        `${measured.id}: ${measured.foreground} on ${measured.background} is ${ratioText(ratio)}:1, requires ${ratioText(required)}:1`,
        ratio,
        required,
      );
  }

  return Object.freeze({
    id: descriptor.id,
    name: descriptor.name,
    pass: issues.length === 0,
    issues: Object.freeze(issues),
    contrast: Object.freeze(contrast),
    focusables,
    minimumRatio:
      contrast.length === 0
        ? null
        : contrast.reduce((lowest, entry) => Math.min(lowest, entry.ratio), Infinity),
  });
}

/**
 * Deterministic audit of the supplied descriptors. Every issue is derived from a declared fact, so an
 * injected broken descriptor can never pass and a real descriptor can never be assumed to pass.
 */
export function auditPanelAccessibility(
  descriptors: readonly PanelSurfaceDescriptor[],
  colorTokens: AccessibilityTokens = tokens,
): AccessibilityAudit {
  if (!Array.isArray(descriptors)) throw new Error('Panel descriptors must be an array');
  const panels = descriptors.map(auditPanel).sort(comparePanels),
    issues = panels.flatMap((panel) => panel.issues),
    contrastPairs = panels.reduce((total, panel) => total + panel.contrast.length, 0),
    ratios = panels.flatMap((panel) => panel.contrast.map((entry) => entry.ratio));
  return Object.freeze({
    version: ACCESSIBILITY_VERSION,
    tokensVersion: colorTokens.version,
    pass: issues.length === 0,
    panels: Object.freeze(panels),
    issues: Object.freeze(issues),
    summary: Object.freeze({
      panels: panels.length,
      passed: panels.filter((panel) => panel.pass).length,
      failed: panels.filter((panel) => !panel.pass).length,
      issues: issues.length,
      contrastPairs,
      minimumRatio: ratios.length === 0 ? null : Math.min(...ratios),
      focusables: panels.reduce((total, panel) => total + panel.focusables, 0),
    }),
  });
}

export function panelDescriptor(panelId: string): PanelSurfaceDescriptor {
  const found = PANEL_SURFACES.find((panel) => panel.id === panelId);
  if (found === undefined) throw new Error(`Unknown panel: ${panelId}`);
  return found;
}

export interface PanelTraversalStep {
  readonly order: number;
  readonly key: 'Tab' | 'Shift+Tab' | 'Escape' | 'Enter' | 'Space';
  readonly scope: 'panel' | 'focused-control';
  readonly effect: string;
}

export interface PanelTraversalPlan {
  readonly version: typeof ACCESSIBILITY_VERSION;
  readonly panelId: string;
  readonly modal: boolean;
  readonly trapsFocus: boolean;
  readonly closeKey: string | null;
  readonly openKey: string | null;
  readonly focusOrder: readonly Readonly<{ order: number; selector: string }>[];
  readonly steps: readonly PanelTraversalStep[];
}

/**
 * Expected keyboard order and effect of every relevant key. A surface opened through the 083 focus
 * controller traps Tab/Shift+Tab; a read-only diagnostic surface never does.
 */
export function planPanelTraversal(panelId: string): PanelTraversalPlan {
  const panel = panelDescriptor(panelId),
    trapsFocus = panel.interactive && panel.surface !== 'diagnostic',
    steps: PanelTraversalStep[] = [
      Object.freeze({
        order: 1,
        key: 'Tab',
        scope: 'panel',
        effect: trapsFocus
          ? 'Moves to the next control inside the panel; the last control wraps to the first.'
          : 'Follows the browser tab order; the surface never traps focus.',
      }),
      Object.freeze({
        order: 2,
        key: 'Shift+Tab',
        scope: 'panel',
        effect: trapsFocus
          ? 'Moves to the previous control inside the panel; the first control wraps to the last.'
          : 'Follows the browser tab order in reverse; the surface never traps focus.',
      }),
      Object.freeze({
        order: 3,
        key: 'Escape',
        scope: 'panel',
        effect:
          panel.closeKey === null
            ? 'No close key: the surface is passive and Escape keeps its browser meaning.'
            : `Closes the panel through the injected close port and restores the previous focus. ${panel.closeEffect}`,
      }),
      Object.freeze({
        order: 4,
        key: 'Enter',
        scope: 'focused-control',
        effect:
          'The focused native control runs its own activation; the controller emits no synthetic click.',
      }),
      Object.freeze({
        order: 5,
        key: 'Space',
        scope: 'focused-control',
        effect:
          'The focused native control runs its own activation; the controller emits no synthetic click.',
      }),
    ];
  return Object.freeze({
    version: ACCESSIBILITY_VERSION,
    panelId: panel.id,
    modal: panel.modal,
    trapsFocus,
    closeKey: panel.closeKey,
    openKey: panel.openKey,
    focusOrder: Object.freeze(
      panel.focusableSelectors.map((selector, index) =>
        Object.freeze({ order: index + 1, selector }),
      ),
    ),
    steps: Object.freeze(steps),
  });
}

export type DrivingBlockReason = 'SUSPENDS_PANEL' | 'SUSPENDS_MENU';
export type AccessibilityMode = 'AUTO' | 'MANUAL' | 'LEARNING';

const MODES: readonly AccessibilityMode[] = ['AUTO', 'MANUAL', 'LEARNING'];

/**
 * Composes the 070 surface rules into the keyboard question: while the surface is open, are driving
 * keys blocked? Panel surfaces block only in MANUAL/LEARNING, menu surfaces block in every mode and
 * read-only diagnostics never block. 070 remains the owner of the actual suspension.
 */
export function drivingBlockReason(
  panelId: string,
  open: boolean,
  mode: AccessibilityMode,
): DrivingBlockReason | null {
  const panel = panelDescriptor(panelId);
  if (typeof open !== 'boolean') throw new Error('Panel open flag must be boolean');
  if (!MODES.includes(mode)) throw new Error(`Unsupported driving mode: ${String(mode)}`);
  if (!open) return null;
  if (panel.surface === 'diagnostic') return null;
  if (panel.surface === 'menu') return 'SUSPENDS_MENU';
  return mode === 'AUTO' ? null : 'SUSPENDS_PANEL';
}

/** `true` exactly when `drivingBlockReason` names a 070 suspension cause. */
export function drivingKeysBlocked(
  panelId: string,
  open: boolean,
  mode: AccessibilityMode,
): boolean {
  return drivingBlockReason(panelId, open, mode) !== null;
}
