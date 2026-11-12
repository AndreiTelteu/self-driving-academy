import {
  computeResponsiveLayout,
  RESPONSIVE_MINIMUM_FONT_PX,
  RESPONSIVE_MINIMUM_LINE_HEIGHT,
} from '../../src/ui';
import type { ResponsiveRegion } from '../../src/ui';

/**
 * 153 UI QA contract.
 *
 * The module is pure data: it never reads the DOM, never starts a browser and never measures a
 * clock. The real page (`tests/browser/qa-ui-153/`) produces one measurement per scenario and
 * viewport; this contract validates the shape, renders one verdict per check and derives the
 * cross-viewport comparison. The same code is used by the deterministic test suite and by
 * `scripts/run-ui-qa-report.mjs`, so the committed report and the tests cannot disagree.
 *
 * Two tiers keep the weekly gate honest:
 * - `CONTRACT` — the documented PC resolutions (1280×720 and 1920×1080), the documented 150% zoom
 *   case and 200% zoom on the full-HD target. A failure here is a regression of the 084 layout
 *   contract and makes the PBI report fail.
 * - `STRESS` — viewports the 084 contract does not declare (200% zoom of a 1280×720 window →
 *   640×360 effective). They are measured and reported as findings, never silently dropped, but
 *   they do not pretend to be part of the declared band.
 */

export const UI_QA_VERSION = '153-ui-qa-v1';
export const UI_QA_MEASUREMENT_VERSION = '153-ui-qa-measurement-v1';

/** The 083/084 floors, reused instead of restating them. */
export const UI_QA_MIN_FONT_PX = RESPONSIVE_MINIMUM_FONT_PX;
export const UI_QA_MIN_LINE_HEIGHT = RESPONSIVE_MINIMUM_LINE_HEIGHT;
/** 083 declares a 3 px visible focus ring. */
export const UI_QA_MIN_FOCUS_OUTLINE_PX = 3;
/**
 * The 084 line-height floor targets body copy and rows. A display number at 24 CSS px or more (the
 * HUD speed, for instance) is large text: WCAG and 084 do not require 1.4 there, and flagging it
 * would be a false positive.
 */
export const UI_QA_LINE_HEIGHT_MAX_FONT_PX = 24;
/**
 * Screen-reader-only copy is authored at 1×1 px and clipped on purpose (`.minimap__description`).
 * It is measured as text, but it is never reported as clipped.
 */
export const UI_QA_SCREEN_READER_MAX_PX = 2;

export type UiQaTier = 'CONTRACT' | 'STRESS';

export interface UiQaSurfaceDefinition {
  readonly id: string;
  /** The PBI that owns the surface; the QA task never edits these files. */
  readonly owner: string;
  /** Stable selector used by the real page and by the report. */
  readonly selector: string;
  readonly kind: 'hud' | 'panel' | 'transient' | 'dialog';
  /** The 083 panel id used by the focus controller, when the surface is a modal panel. */
  readonly panelId: string | null;
}

export const UI_QA_SURFACES: readonly UiQaSurfaceDefinition[] = Object.freeze([
  Object.freeze({
    id: 'hud',
    owner: '073',
    selector: '.taxi-hud',
    kind: 'hud',
    panelId: 'taxiHud',
  }),
  Object.freeze({
    id: 'minimap',
    owner: '074',
    selector: '.minimap',
    kind: 'hud',
    panelId: 'minimap',
  }),
  Object.freeze({
    id: 'fleet',
    owner: '075',
    selector: '.fleet-panel',
    kind: 'panel',
    panelId: 'fleet',
  }),
  Object.freeze({
    id: 'notifications',
    owner: '079',
    selector: '.learning-notifications',
    kind: 'transient',
    panelId: 'learningNotifications',
  }),
  Object.freeze({
    id: 'profile',
    owner: '077',
    selector: '.profile-panel',
    kind: 'dialog',
    panelId: 'profile',
  }),
  Object.freeze({
    id: 'city',
    owner: '082',
    selector: '.city-dashboard',
    kind: 'dialog',
    panelId: 'cityDashboard',
  }),
  Object.freeze({
    id: 'settings',
    owner: '081',
    selector: '.game-settings',
    kind: 'dialog',
    panelId: 'gameSettings',
  }),
  Object.freeze({
    id: 'camera',
    owner: '229',
    selector: '.control-sliders',
    kind: 'dialog',
    panelId: null,
  }),
  Object.freeze({
    id: 'kpis',
    owner: '210',
    selector: '[data-qa-surface="kpis"]',
    kind: 'dialog',
    panelId: null,
  }),
]);

export interface UiQaViewport {
  readonly id: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly zoom: number;
  readonly tier: UiQaTier;
  readonly note: string | null;
}

/**
 * The four measured viewports. 1280×720 and 1920×1080 are the two PC targets from Docs/08 and
 * Docs/18; 150% is the documented zoom case (`innerWidth / zoom` → 853×480). The two 200% rows are
 * the zoom the PBI asks for: 960×540 is still inside the COMPACT band the 084 contract declares,
 * 640×360 is not, so it stays a stress row.
 */
export const UI_QA_VIEWPORTS: readonly UiQaViewport[] = Object.freeze([
  Object.freeze({
    id: '1280x720',
    widthPx: 1280,
    heightPx: 720,
    zoom: 1,
    tier: 'CONTRACT',
    note: null,
  }),
  Object.freeze({
    id: '1920x1080',
    widthPx: 1920,
    heightPx: 1080,
    zoom: 1,
    tier: 'CONTRACT',
    note: null,
  }),
  Object.freeze({
    id: 'zoom-150',
    widthPx: 1280,
    heightPx: 720,
    zoom: 1.5,
    tier: 'CONTRACT',
    note: 'Documented zoom case: 1280×720 at 150% is laid out as 853×480.',
  }),
  Object.freeze({
    id: 'zoom-200',
    widthPx: 1920,
    heightPx: 1080,
    zoom: 2,
    tier: 'CONTRACT',
    note: '200% zoom of the full-HD target: 960×540 effective, inside the COMPACT band.',
  }),
  Object.freeze({
    id: 'zoom-200-720',
    widthPx: 1280,
    heightPx: 720,
    zoom: 2,
    tier: 'STRESS',
    note: '200% zoom of the 720p window: 640×360 effective, below the 084 COMPACT band.',
  }),
]);

export interface UiQaScenario {
  readonly id: string;
  readonly title: string;
  /** The surface the scenario puts in front; `null` means only the driving surfaces are shown. */
  readonly surface: string | null;
  readonly viewpoint: string;
}

export const UI_QA_SCENARIOS: readonly UiQaScenario[] = Object.freeze([
  Object.freeze({
    id: 'hud',
    title: 'HUD, minimapă, flotă și notificări (niciun panou deschis)',
    surface: null,
    viewpoint: 'Conducere: HUD-ul și minimapa rămân vizibile lângă listă.',
  }),
  Object.freeze({
    id: 'fleet',
    title: 'Lista flotei cu 30 de taxiuri, deschisă',
    surface: 'fleet',
    viewpoint: 'Lista are scroll intern și 30 de rânduri reale.',
  }),
  Object.freeze({
    id: 'notifications',
    title: 'Notificări de învățare (3 mesaje simultane)',
    surface: 'notifications',
    viewpoint: 'Mesajele stau în coloana din dreapta, sub minimapă.',
  }),
  Object.freeze({
    id: 'profile',
    title: 'Panoul profilului (modal central)',
    surface: 'profile',
    viewpoint: 'Modal centrat, cu scroll intern și focus prins în panou.',
  }),
  Object.freeze({
    id: 'city',
    title: 'Tabloul orașului (modal central)',
    surface: 'city',
    viewpoint: 'Modal centrat, indicatori indisponibili marcați explicit.',
  }),
  Object.freeze({
    id: 'settings',
    title: 'Setările jocului: cameră, unități, confort',
    surface: 'settings',
    viewpoint: 'Modal centrat cu select-uri native și slidere de confort.',
  }),
  Object.freeze({
    id: 'camera',
    title: 'Reglajele camerei și ale confortului',
    surface: 'camera',
    viewpoint: 'Pop-up cu slidere native; tastatura trebuie să le poată mișca.',
  }),
  Object.freeze({
    id: 'kpis',
    title: 'Pop-up KPIs cu grafice istorice',
    surface: 'kpis',
    viewpoint: 'Dialog cu diagrame, tabele și propriul focus/Escape.',
  }),
]);

/**
 * The scenario × viewport matrix that is actually captured. Every CONTRACT viewport is exercised
 * for the two surfaces the comparison is about (HUD and profile); the remaining surfaces are
 * captured at the resolutions where they differ the most.
 */
export interface UiQaCapturePlanEntry {
  readonly scenario: string;
  readonly viewport: string;
}

export const UI_QA_CAPTURE_PLAN: readonly UiQaCapturePlanEntry[] = Object.freeze([
  Object.freeze({ scenario: 'hud', viewport: '1280x720' }),
  Object.freeze({ scenario: 'hud', viewport: '1920x1080' }),
  Object.freeze({ scenario: 'hud', viewport: 'zoom-150' }),
  Object.freeze({ scenario: 'hud', viewport: 'zoom-200' }),
  Object.freeze({ scenario: 'hud', viewport: 'zoom-200-720' }),
  Object.freeze({ scenario: 'fleet', viewport: '1280x720' }),
  Object.freeze({ scenario: 'fleet', viewport: 'zoom-200-720' }),
  Object.freeze({ scenario: 'notifications', viewport: '1280x720' }),
  Object.freeze({ scenario: 'notifications', viewport: 'zoom-150' }),
  Object.freeze({ scenario: 'profile', viewport: '1280x720' }),
  Object.freeze({ scenario: 'profile', viewport: '1920x1080' }),
  Object.freeze({ scenario: 'profile', viewport: 'zoom-150' }),
  Object.freeze({ scenario: 'profile', viewport: 'zoom-200' }),
  Object.freeze({ scenario: 'profile', viewport: 'zoom-200-720' }),
  Object.freeze({ scenario: 'city', viewport: '1280x720' }),
  Object.freeze({ scenario: 'city', viewport: '1920x1080' }),
  Object.freeze({ scenario: 'settings', viewport: '1280x720' }),
  Object.freeze({ scenario: 'settings', viewport: 'zoom-150' }),
  Object.freeze({ scenario: 'settings', viewport: 'zoom-200' }),
  Object.freeze({ scenario: 'camera', viewport: '1280x720' }),
  Object.freeze({ scenario: 'kpis', viewport: '1280x720' }),
  Object.freeze({ scenario: 'kpis', viewport: '1920x1080' }),
]);

// ---------------------------------------------------------------------------------------------
// Measurement shape produced by the real browser page.
// ---------------------------------------------------------------------------------------------

export interface UiQaRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly right: number;
  readonly bottom: number;
}

export interface UiQaScrollState {
  readonly scrollHeight: number;
  readonly clientHeight: number;
  readonly overflowY: string;
  readonly maxHeight: string;
}

export interface UiQaSurfaceMeasurement {
  readonly id: string;
  readonly visible: boolean;
  readonly hidden: boolean;
  readonly rect: UiQaRect | null;
  readonly scroll: UiQaScrollState | null;
  /** Rows rendered inside the surface (30 for the fleet list), `null` for surfaces without rows. */
  readonly rows: number | null;
}

export interface UiQaControlMeasurement {
  readonly surface: string;
  readonly descriptor: string;
  readonly role: string;
  readonly visible: boolean;
  readonly enabled: boolean;
  readonly rect: UiQaRect | null;
  readonly insideViewport: boolean;
  readonly hitTest: boolean;
  readonly insideScrollable: boolean;
  /** What the centre hit-test actually returned when the control lost it, for the report. */
  readonly coveredBy: string | null;
}

export interface UiQaTextMeasurement {
  readonly minFontPx: number | null;
  readonly minFontDescriptor: string;
  readonly minLineHeightRatio: number | null;
  readonly minLineHeightDescriptor: string;
  readonly textNodes: number;
}

export interface UiQClippedText {
  readonly surface: string;
  readonly descriptor: string;
  readonly text: string;
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly overflowX: string;
}

export interface UiQaTextOverlap {
  readonly surface: string;
  readonly a: string;
  readonly b: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly areaPx: number;
}

export interface UiQaContrastFailure {
  readonly surface: string;
  readonly descriptor: string;
  readonly foreground: string;
  readonly background: string;
  readonly ratio: number;
  readonly required: number;
  readonly fontPx: number;
}

export interface UiQaOverlap {
  readonly a: string;
  readonly b: string;
  readonly severity: 'critical' | 'transient';
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface UiQaEssentialMeasurement {
  readonly id: string;
  readonly descriptor: string;
  readonly visible: boolean;
  readonly rect: UiQaRect | null;
  /** `HARNESS` when a real control is mounted, `OWNER_OUTSIDE_QA_HARNESS` when the app shell owns it. */
  readonly owner: 'HARNESS' | 'OWNER_OUTSIDE_QA_HARNESS';
  readonly reason: string | null;
}

export interface UiQaKeyboardStop {
  readonly order: number;
  readonly descriptor: string;
  readonly surface: string | null;
  /** True for a native control; false for a scroll container the browser made tabbable. */
  readonly native: boolean;
  readonly outlineStyle: string;
  readonly outlineWidthPx: number;
  readonly insideDialog: boolean;
}

export interface UiQaKeyboardResult {
  readonly stops: readonly UiQaKeyboardStop[];
  /** The 083 contract: Escape closes the open panel and returns focus. */
  readonly escapeClosed: boolean;
  readonly escapeReason: string | null;
  readonly focusRestored: boolean;
  readonly dialogOpenBefore: boolean;
  readonly dialogOpenAfter: boolean;
  /** True when the surface in front is a modal that must trap focus. */
  readonly trapExpected: boolean;
}

export interface UiQaMeasurement {
  readonly version: typeof UI_QA_MEASUREMENT_VERSION;
  readonly browser: string;
  readonly scenario: string;
  readonly viewport: {
    readonly id: string;
    readonly widthPx: number;
    readonly heightPx: number;
    readonly zoom: number;
  };
  readonly effectiveWidthPx: number;
  readonly effectiveHeightPx: number;
  readonly region: string;
  readonly mediaQueries: { readonly compact: boolean; readonly large: boolean };
  readonly surfaces: readonly UiQaSurfaceMeasurement[];
  readonly controls: readonly UiQaControlMeasurement[];
  readonly text: UiQaTextMeasurement;
  readonly clipped: readonly UiQClippedText[];
  readonly overlappingText: readonly UiQaTextOverlap[];
  readonly contrastFailures: readonly UiQaContrastFailure[];
  readonly overlaps: readonly UiQaOverlap[];
  readonly essentials: readonly UiQaEssentialMeasurement[];
  readonly keyboard: UiQaKeyboardResult;
  readonly document: {
    readonly scrollWidth: number;
    readonly scrollHeight: number;
    readonly horizontalOverflow: boolean;
  };
}

// ---------------------------------------------------------------------------------------------
// Evaluation.
// ---------------------------------------------------------------------------------------------

export type UiQaCheckId =
  | 'viewport-mapping'
  | 'text-legible'
  | 'text-not-clipped'
  | 'text-not-overlapping'
  | 'contrast-aa'
  | 'controls-visible'
  | 'controls-hit-testable'
  | 'essentials-visible'
  | 'no-critical-overlap'
  | 'scroll-policy'
  | 'surface-inside-viewport'
  | 'tab-order'
  | 'focus-visible'
  | 'escape-closes';

export interface UiQaCheck {
  readonly id: UiQaCheckId;
  readonly pass: boolean;
  readonly actual: unknown;
  readonly detail: string;
}

export type UiQVerdict = 'PASS' | 'FAIL';

export interface UiQaEvaluation {
  readonly scenario: string;
  readonly viewport: string;
  readonly tier: UiQaTier;
  readonly surface: string | null;
  readonly checks: readonly UiQaCheck[];
  readonly verdict: UiQVerdict;
  readonly failed: readonly UiQaCheckId[];
}

const SURFACE_IDS = new Set(UI_QA_SURFACES.map((surface) => surface.id));

const round = (value: number): number => Math.round(value * 100) / 100;

function requireFiniteNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`UI QA measurement: ${name} must be a finite number`);
  return value;
}

function requireRect(value: unknown, name: string): UiQaRect {
  if (typeof value !== 'object' || value === null) throw new Error(`UI QA measurement: ${name}`);
  const rect = value as Partial<UiQaRect>;
  for (const field of ['x', 'y', 'width', 'height', 'right', 'bottom'] as const)
    requireFiniteNumber(rect[field], `${name}.${field}`);
  return rect as UiQaRect;
}

function requireArray(value: unknown, name: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`UI QA measurement: ${name} must be an array`);
  return value;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`UI QA measurement: ${name} must be a non-empty string`);
  return value;
}

/** Strict shape check; the report never trusts a hand-edited or truncated measurement. */
export function parseUiQaMeasurement(value: unknown): UiQaMeasurement {
  if (typeof value !== 'object' || value === null) throw new Error('UI QA measurement: object');
  const input = value as Partial<UiQaMeasurement>;
  if (input.version !== UI_QA_MEASUREMENT_VERSION)
    throw new Error(`UI QA measurement: version must be ${UI_QA_MEASUREMENT_VERSION}`);
  const viewport = input.viewport;
  if (typeof viewport !== 'object' || viewport === null)
    throw new Error('UI QA measurement: viewport');
  const viewportShape = viewport as UiQaMeasurement['viewport'];
  const measurement: UiQaMeasurement = {
    version: UI_QA_MEASUREMENT_VERSION,
    browser: requireString(input.browser, 'browser'),
    scenario: requireString(input.scenario, 'scenario'),
    viewport: {
      id: requireString(viewportShape.id, 'viewport.id'),
      widthPx: requireFiniteNumber(viewportShape.widthPx, 'viewport.widthPx'),
      heightPx: requireFiniteNumber(viewportShape.heightPx, 'viewport.heightPx'),
      zoom: requireFiniteNumber(viewportShape.zoom, 'viewport.zoom'),
    },
    effectiveWidthPx: requireFiniteNumber(input.effectiveWidthPx, 'effectiveWidthPx'),
    effectiveHeightPx: requireFiniteNumber(input.effectiveHeightPx, 'effectiveHeightPx'),
    region: requireString(input.region, 'region'),
    mediaQueries: {
      compact: (input.mediaQueries as { compact?: unknown } | undefined)?.compact === true,
      large: (input.mediaQueries as { large?: unknown } | undefined)?.large === true,
    },
    surfaces: requireArray(input.surfaces, 'surfaces').map((entry, index) => {
      if (typeof entry !== 'object' || entry === null)
        throw new Error(`UI QA measurement: surfaces[${index}]`);
      const surface = entry as Partial<UiQaSurfaceMeasurement>;
      const id = requireString(surface.id, `surfaces[${index}].id`);
      if (!SURFACE_IDS.has(id)) throw new Error(`UI QA measurement: unknown surface ${id}`);
      return {
        id,
        visible: surface.visible === true,
        hidden: surface.hidden === true,
        rect:
          surface.rect === null || surface.rect === undefined
            ? null
            : requireRect(surface.rect, `surfaces[${index}].rect`),
        scroll:
          surface.scroll === null || surface.scroll === undefined
            ? null
            : (surface.scroll as UiQaScrollState),
        rows:
          surface.rows === null || surface.rows === undefined
            ? null
            : requireFiniteNumber(surface.rows, `surfaces[${index}].rows`),
      };
    }),
    controls: requireArray(input.controls, 'controls').map((entry, index) => {
      if (typeof entry !== 'object' || entry === null)
        throw new Error(`UI QA measurement: controls[${index}]`);
      const control = entry as Partial<UiQaControlMeasurement>;
      return {
        surface: requireString(control.surface, `controls[${index}].surface`),
        descriptor: requireString(control.descriptor, `controls[${index}].descriptor`),
        role: typeof control.role === 'string' ? control.role : 'unknown',
        visible: control.visible === true,
        enabled: control.enabled !== false,
        rect:
          control.rect === null || control.rect === undefined
            ? null
            : requireRect(control.rect, `controls[${index}].rect`),
        insideViewport: control.insideViewport === true,
        hitTest: control.hitTest === true,
        insideScrollable: control.insideScrollable === true,
        coveredBy: typeof control.coveredBy === 'string' ? control.coveredBy : null,
      };
    }),
    text: {
      minFontPx:
        input.text?.minFontPx === null || input.text?.minFontPx === undefined
          ? null
          : requireFiniteNumber(input.text.minFontPx, 'text.minFontPx'),
      minFontDescriptor:
        typeof input.text?.minFontDescriptor === 'string' ? input.text.minFontDescriptor : '',
      minLineHeightRatio:
        input.text?.minLineHeightRatio === null || input.text?.minLineHeightRatio === undefined
          ? null
          : requireFiniteNumber(input.text.minLineHeightRatio, 'text.minLineHeightRatio'),
      minLineHeightDescriptor:
        typeof input.text?.minLineHeightDescriptor === 'string'
          ? input.text.minLineHeightDescriptor
          : '',
      textNodes: requireFiniteNumber(input.text?.textNodes ?? 0, 'text.textNodes'),
    },
    clipped: requireArray(input.clipped, 'clipped').map((entry, index) => {
      if (typeof entry !== 'object' || entry === null)
        throw new Error(`UI QA measurement: clipped[${index}]`);
      const clipped = entry as Partial<UiQClippedText>;
      return {
        surface: requireString(clipped.surface, `clipped[${index}].surface`),
        descriptor: requireString(clipped.descriptor, `clipped[${index}].descriptor`),
        text: typeof clipped.text === 'string' ? clipped.text : '',
        scrollWidth: requireFiniteNumber(clipped.scrollWidth, `clipped[${index}].scrollWidth`),
        clientWidth: requireFiniteNumber(clipped.clientWidth, `clipped[${index}].clientWidth`),
        overflowX: typeof clipped.overflowX === 'string' ? clipped.overflowX : 'visible',
      };
    }),
    overlappingText: requireArray(input.overlappingText ?? [], 'overlappingText').map(
      (entry, index) => {
        if (typeof entry !== 'object' || entry === null)
          throw new Error(`UI QA measurement: overlappingText[${index}]`);
        const overlap = entry as Partial<UiQaTextOverlap>;
        return {
          surface: requireString(overlap.surface, `overlappingText[${index}].surface`),
          a: requireString(overlap.a, `overlappingText[${index}].a`),
          b: requireString(overlap.b, `overlappingText[${index}].b`),
          widthPx: requireFiniteNumber(overlap.widthPx, `overlappingText[${index}].widthPx`),
          heightPx: requireFiniteNumber(overlap.heightPx, `overlappingText[${index}].heightPx`),
          areaPx: requireFiniteNumber(overlap.areaPx, `overlappingText[${index}].areaPx`),
        };
      },
    ),
    contrastFailures: requireArray(input.contrastFailures, 'contrastFailures').map(
      (entry, index) => {
        if (typeof entry !== 'object' || entry === null)
          throw new Error(`UI QA measurement: contrastFailures[${index}]`);
        const failure = entry as Partial<UiQaContrastFailure>;
        return {
          surface: requireString(failure.surface, `contrastFailures[${index}].surface`),
          descriptor: requireString(failure.descriptor, `contrastFailures[${index}].descriptor`),
          foreground: requireString(failure.foreground, `contrastFailures[${index}].foreground`),
          background: requireString(failure.background, `contrastFailures[${index}].background`),
          ratio: requireFiniteNumber(failure.ratio, `contrastFailures[${index}].ratio`),
          required: requireFiniteNumber(failure.required, `contrastFailures[${index}].required`),
          fontPx: requireFiniteNumber(failure.fontPx, `contrastFailures[${index}].fontPx`),
        };
      },
    ),
    overlaps: requireArray(input.overlaps, 'overlaps').map((entry, index) => {
      if (typeof entry !== 'object' || entry === null)
        throw new Error(`UI QA measurement: overlaps[${index}]`);
      const overlap = entry as Partial<UiQaOverlap>;
      return {
        a: requireString(overlap.a, `overlaps[${index}].a`),
        b: requireString(overlap.b, `overlaps[${index}].b`),
        severity: overlap.severity === 'transient' ? 'transient' : 'critical',
        widthPx: requireFiniteNumber(overlap.widthPx, `overlaps[${index}].widthPx`),
        heightPx: requireFiniteNumber(overlap.heightPx, `overlaps[${index}].heightPx`),
      };
    }),
    essentials: requireArray(input.essentials, 'essentials').map((entry, index) => {
      if (typeof entry !== 'object' || entry === null)
        throw new Error(`UI QA measurement: essentials[${index}]`);
      const essential = entry as Partial<UiQaEssentialMeasurement>;
      return {
        id: requireString(essential.id, `essentials[${index}].id`),
        descriptor: requireString(essential.descriptor, `essentials[${index}].descriptor`),
        visible: essential.visible === true,
        rect:
          essential.rect === null || essential.rect === undefined
            ? null
            : requireRect(essential.rect, `essentials[${index}].rect`),
        owner: essential.owner === 'HARNESS' ? 'HARNESS' : 'OWNER_OUTSIDE_QA_HARNESS',
        reason: typeof essential.reason === 'string' ? essential.reason : null,
      };
    }),
    keyboard: {
      stops: requireArray(input.keyboard?.stops, 'keyboard.stops').map((entry, index) => {
        if (typeof entry !== 'object' || entry === null)
          throw new Error(`UI QA measurement: keyboard.stops[${index}]`);
        const stop = entry as Partial<UiQaKeyboardStop>;
        return {
          order: requireFiniteNumber(stop.order, `keyboard.stops[${index}].order`),
          descriptor: requireString(stop.descriptor, `keyboard.stops[${index}].descriptor`),
          surface: typeof stop.surface === 'string' ? stop.surface : null,
          native: stop.native !== false,
          outlineStyle: typeof stop.outlineStyle === 'string' ? stop.outlineStyle : 'none',
          outlineWidthPx: requireFiniteNumber(
            stop.outlineWidthPx,
            `keyboard.stops[${index}].outlineWidthPx`,
          ),
          insideDialog: stop.insideDialog === true,
        };
      }),
      escapeClosed: input.keyboard?.escapeClosed === true,
      escapeReason:
        typeof input.keyboard?.escapeReason === 'string' ? input.keyboard.escapeReason : null,
      focusRestored: input.keyboard?.focusRestored === true,
      dialogOpenBefore: input.keyboard?.dialogOpenBefore === true,
      dialogOpenAfter: input.keyboard?.dialogOpenAfter === true,
      trapExpected: input.keyboard?.trapExpected === true,
    },
    document: {
      scrollWidth: requireFiniteNumber(input.document?.scrollWidth ?? 0, 'document.scrollWidth'),
      scrollHeight: requireFiniteNumber(input.document?.scrollHeight ?? 0, 'document.scrollHeight'),
      horizontalOverflow: input.document?.horizontalOverflow === true,
    },
  };
  return Object.freeze(measurement);
}

function viewportById(id: string): UiQaViewport {
  const entry = UI_QA_VIEWPORTS.find((viewport) => viewport.id === id);
  if (entry === undefined) throw new Error(`UI QA viewport is not declared: ${id}`);
  return entry;
}

/**
 * One verdict per measurable rule. Every rule names the real number it compared, so a failure is
 * reproducible from the report alone.
 */
export function evaluateUiQaMeasurement(candidate: unknown): UiQaEvaluation {
  const measurement = parseUiQaMeasurement(candidate);
  const declared = viewportById(measurement.viewport.id);
  const layout = computeResponsiveLayout({
    widthPx: measurement.viewport.widthPx,
    heightPx: measurement.viewport.heightPx,
    zoom: measurement.viewport.zoom,
  });
  const expectedRegion: ResponsiveRegion = layout.region;
  const declaredEffectiveWidthPx = round(measurement.viewport.widthPx / measurement.viewport.zoom);
  const declaredEffectiveHeightPx = round(
    measurement.viewport.heightPx / measurement.viewport.zoom,
  );
  // The zoomed viewport is the effective CSS viewport: that is what the browser paints and what the
  // media queries see, so containment is measured against it, not against the nominal window.
  const viewportWidth = measurement.effectiveWidthPx;
  const viewportHeight = measurement.effectiveHeightPx;
  const visibleSurfaces = measurement.surfaces.filter((surface) => surface.visible);
  const insideViewport = (rect: UiQaRect): boolean =>
    rect.x >= -0.5 &&
    rect.y >= -0.5 &&
    rect.right <= viewportWidth + 0.5 &&
    rect.bottom <= viewportHeight + 0.5;
  const outside = visibleSurfaces
    .filter((surface) => surface.rect !== null && !insideViewport(surface.rect))
    .map((surface) => ({
      id: surface.id,
      rect: surface.rect,
      bottomOverflowPx: surface.rect === null ? 0 : round(surface.rect.bottom - viewportHeight),
    }));
  const criticalOverlaps = measurement.overlaps.filter(
    (overlap) => overlap.severity === 'critical',
  );
  const harnessEssentials = measurement.essentials.filter(
    (essential) => essential.owner === 'HARNESS',
  );
  const missingEssentials = harnessEssentials
    .filter((essential) => !essential.visible || essential.rect === null)
    .map((essential) => essential.id);
  const invisibleControls = measurement.controls
    .filter(
      (control) =>
        !control.visible ||
        control.rect === null ||
        control.rect.width <= 0 ||
        control.rect.height <= 0,
    )
    .map((control) => `${control.surface}:${control.descriptor}`);
  const blockedControls = measurement.controls
    .filter(
      (control) =>
        control.visible &&
        control.enabled &&
        control.insideViewport &&
        !control.insideScrollable &&
        !control.hitTest,
    )
    .map(
      (control) =>
        `${control.surface}:${control.descriptor}${control.coveredBy === null ? '' : ` (acoperit de ${control.coveredBy})`}`,
    );
  const scrollingSurfaces = visibleSurfaces.filter(
    (surface) =>
      surface.scroll !== null && surface.scroll.scrollHeight > surface.scroll.clientHeight + 1,
  );
  const brokenScroll = scrollingSurfaces
    .filter(
      (surface) =>
        surface.scroll !== null && !['auto', 'scroll'].includes(surface.scroll.overflowY),
    )
    .map((surface) => surface.id);
  const dialogStops = measurement.keyboard.stops.filter((stop) => stop.insideDialog);
  const tabOrderOutsideDialog = measurement.keyboard.trapExpected
    ? measurement.keyboard.stops.filter((stop) => !stop.insideDialog).map((stop) => stop.descriptor)
    : [];
  const duplicateStops = measurement.keyboard.stops
    .map((stop) => stop.descriptor)
    .filter((descriptor, index, all) => all.indexOf(descriptor) !== index);
  const dimFocusStops = measurement.keyboard.stops
    .filter((stop) =>
      stop.native
        ? stop.outlineStyle === 'none' || stop.outlineWidthPx < UI_QA_MIN_FOCUS_OUTLINE_PX
        : stop.outlineStyle === 'none' || stop.outlineWidthPx <= 0,
    )
    .map(
      (stop) =>
        `${stop.descriptor} (${stop.outlineStyle} ${stop.outlineWidthPx}px, ${stop.native ? 'control' : 'scroll container'})`,
    );
  const checks: UiQaCheck[] = [
    {
      id: 'viewport-mapping',
      pass:
        measurement.region === expectedRegion &&
        Math.abs(measurement.effectiveWidthPx - declaredEffectiveWidthPx) <= 1 &&
        Math.abs(measurement.effectiveHeightPx - declaredEffectiveHeightPx) <= 1 &&
        measurement.mediaQueries.compact === (expectedRegion === 'COMPACT') &&
        measurement.mediaQueries.large === (expectedRegion === 'LARGE'),
      actual: {
        region: measurement.region,
        expectedRegion,
        effectiveWidthPx: measurement.effectiveWidthPx,
        expectedEffectiveWidthPx: declaredEffectiveWidthPx,
        effectiveHeightPx: measurement.effectiveHeightPx,
        expectedEffectiveHeightPx: declaredEffectiveHeightPx,
        compact: measurement.mediaQueries.compact,
        large: measurement.mediaQueries.large,
      },
      detail: `viewport ${measurement.viewport.widthPx}×${measurement.viewport.heightPx} at ${measurement.viewport.zoom * 100}% is laid out as ${declaredEffectiveWidthPx}×${declaredEffectiveHeightPx} (${expectedRegion}).`,
    },
    {
      id: 'text-legible',
      pass:
        measurement.text.minFontPx !== null &&
        measurement.text.minFontPx >= UI_QA_MIN_FONT_PX &&
        measurement.text.minLineHeightRatio !== null &&
        measurement.text.minLineHeightRatio >= UI_QA_MIN_LINE_HEIGHT,
      actual: {
        minFontPx: measurement.text.minFontPx,
        minFontDescriptor: measurement.text.minFontDescriptor,
        minLineHeightRatio: measurement.text.minLineHeightRatio,
        minLineHeightDescriptor: measurement.text.minLineHeightDescriptor,
      },
      detail: `smallest visible text is ${measurement.text.minFontPx ?? 'NOT_RUN'} px with a ${measurement.text.minLineHeightRatio ?? 'NOT_RUN'} line-height ratio; the floor is ${UI_QA_MIN_FONT_PX} px and ${UI_QA_MIN_LINE_HEIGHT}.`,
    },
    {
      id: 'text-not-clipped',
      pass: measurement.clipped.length === 0,
      actual: measurement.clipped,
      detail:
        measurement.clipped.length === 0
          ? 'No visible text is clipped horizontally.'
          : `${measurement.clipped.length} text nodes overflow their box: ${measurement.clipped.map((entry) => `${entry.surface}:${entry.descriptor}`).join(', ')}.`,
    },
    {
      id: 'text-not-overlapping',
      pass: measurement.overlappingText.length === 0,
      actual: measurement.overlappingText,
      detail:
        measurement.overlappingText.length === 0
          ? 'No two text boxes in the same row overlap.'
          : `${measurement.overlappingText.length} text pairs overlap: ${measurement.overlappingText
              .slice(0, 6)
              .map((entry) => `${entry.surface}:${entry.a} × ${entry.b} (${entry.areaPx} px²)`)
              .join(', ')}.`,
    },
    {
      id: 'contrast-aa',
      pass: measurement.contrastFailures.length === 0,
      actual: measurement.contrastFailures,
      detail:
        measurement.contrastFailures.length === 0
          ? 'Every measured text pair reaches the WCAG AA ratio for its size.'
          : `${measurement.contrastFailures.length} pairs are below AA: ${measurement.contrastFailures.map((failure) => `${failure.surface}:${failure.descriptor} ${failure.ratio} < ${failure.required}`).join(', ')}.`,
    },
    {
      id: 'controls-visible',
      pass: invisibleControls.length === 0,
      actual: invisibleControls,
      detail:
        invisibleControls.length === 0
          ? `${measurement.controls.length} controls have a non-zero rectangle.`
          : `Controls without a rectangle: ${invisibleControls.join(', ')}.`,
    },
    {
      id: 'controls-hit-testable',
      pass: blockedControls.length === 0,
      actual: blockedControls,
      detail:
        blockedControls.length === 0
          ? 'Every enabled control inside the viewport wins its own centre hit-test.'
          : `Covered controls: ${blockedControls.join(', ')}.`,
    },
    {
      id: 'essentials-visible',
      pass: missingEssentials.length === 0,
      actual: {
        missing: missingEssentials,
        outsideHarness: measurement.essentials
          .filter((essential) => essential.owner === 'OWNER_OUTSIDE_QA_HARNESS')
          .map(
            (essential) => `${essential.id}: ${essential.reason ?? 'owner outside the harness'}`,
          ),
      },
      detail:
        missingEssentials.length === 0
          ? `${harnessEssentials.length} essential controls mounted by the harness are visible.`
          : `Missing essential controls: ${missingEssentials.join(', ')}.`,
    },
    {
      id: 'no-critical-overlap',
      pass: criticalOverlaps.length === 0,
      actual: criticalOverlaps,
      detail:
        criticalOverlaps.length === 0
          ? 'No two measured surfaces overlap.'
          : `Overlaps: ${criticalOverlaps.map((overlap) => `${overlap.a} × ${overlap.b}`).join(', ')}.`,
    },
    {
      id: 'scroll-policy',
      pass: brokenScroll.length === 0,
      actual: scrollingSurfaces.map((surface) => ({ id: surface.id, scroll: surface.scroll })),
      detail:
        brokenScroll.length === 0
          ? `${scrollingSurfaces.length} overflowing surfaces scroll vertically with \`overflow-y: auto\`.`
          : `Surfaces that overflow without a scrollbar: ${brokenScroll.join(', ')}.`,
    },
    {
      id: 'surface-inside-viewport',
      pass: outside.length === 0,
      actual: outside,
      detail:
        outside.length === 0
          ? 'Every visible surface stays inside the viewport.'
          : `Surfaces outside the viewport: ${outside.map((entry) => `${entry.id} (bottom ${entry.rect?.bottom} > ${viewportHeight})`).join(', ')}.`,
    },
    {
      id: 'tab-order',
      pass:
        measurement.keyboard.stops.length > 0 &&
        tabOrderOutsideDialog.length === 0 &&
        (!measurement.keyboard.trapExpected || measurement.keyboard.dialogOpenBefore),
      actual: {
        stops: measurement.keyboard.stops.length,
        order: measurement.keyboard.stops.map((stop) => `${stop.order}:${stop.descriptor}`),
        duplicates: duplicateStops,
        outsideDialog: tabOrderOutsideDialog,
        dialogOpenBefore: measurement.keyboard.dialogOpenBefore,
      },
      detail:
        measurement.keyboard.stops.length === 0
          ? 'Tab never reached a control.'
          : `${measurement.keyboard.stops.length} tab stops, ${duplicateStops.length} duplicates, ${tabOrderOutsideDialog.length} escapes from the open panel, dialog open before: ${measurement.keyboard.dialogOpenBefore}.`,
    },
    {
      id: 'focus-visible',
      pass: measurement.keyboard.stops.length > 0 && dimFocusStops.length === 0,
      actual: dimFocusStops,
      detail:
        dimFocusStops.length === 0
          ? `Every keyboard stop draws a visible focus ring of at least ${UI_QA_MIN_FOCUS_OUTLINE_PX} px.`
          : `Stops without a visible ring of at least ${UI_QA_MIN_FOCUS_OUTLINE_PX} px: ${dimFocusStops.join(', ')}.`,
    },
    {
      id: 'escape-closes',
      pass: !measurement.keyboard.trapExpected
        ? true
        : measurement.keyboard.escapeClosed &&
          measurement.keyboard.focusRestored &&
          measurement.keyboard.dialogOpenAfter === false,
      actual: {
        trapExpected: measurement.keyboard.trapExpected,
        escapeReason: measurement.keyboard.escapeReason,
        dialogOpenBefore: measurement.keyboard.dialogOpenBefore,
        dialogOpenAfter: measurement.keyboard.dialogOpenAfter,
        focusRestored: measurement.keyboard.focusRestored,
        dialogStops: dialogStops.length,
      },
      detail: !measurement.keyboard.trapExpected
        ? 'No modal dialog is in front, so Escape has nothing to close.'
        : `Escape closed the dialog: ${measurement.keyboard.escapeClosed}; focus restored: ${measurement.keyboard.focusRestored}.`,
    },
  ];
  const failed = checks.filter((check) => !check.pass).map((check) => check.id);
  return Object.freeze({
    scenario: measurement.scenario,
    viewport: measurement.viewport.id,
    tier: declared.tier,
    surface:
      UI_QA_SCENARIOS.find((scenario) => scenario.id === measurement.scenario)?.surface ?? null,
    checks: Object.freeze(checks),
    verdict: failed.length === 0 ? 'PASS' : 'FAIL',
    failed: Object.freeze(failed),
  });
}

// ---------------------------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------------------------

export interface UiQaComparisonRow {
  readonly viewport: string;
  readonly region: string;
  readonly tier: UiQaTier;
  readonly surface: string;
  readonly widthPx: number | null;
  readonly heightPx: number | null;
  readonly fontPx: number | null;
  readonly lineHeightRatio: number | null;
  readonly visibleRows: number | null;
  readonly scrollHeight: number | null;
  readonly clientHeight: number | null;
  readonly verdict: UiQVerdict;
}

export interface UiQaFinding {
  readonly id: string;
  readonly severity: 'MEDIUM' | 'LOW';
  readonly tier: UiQaTier;
  readonly surface: string;
  readonly viewport: string;
  readonly check: UiQaCheckId;
  readonly summary: string;
  readonly repro: readonly string[];
}

export interface UiQaReportScenario {
  readonly screenshot: string;
  readonly bytes: number;
  readonly scenario: string;
  readonly viewport: string;
  readonly tier: UiQaTier;
  readonly surface: string | null;
  readonly region: string;
  readonly verdict: UiQVerdict;
  readonly checks: readonly UiQaCheck[];
  readonly failed: readonly UiQaCheckId[];
  readonly numbers: {
    readonly effectiveWidthPx: number;
    readonly effectiveHeightPx: number;
    readonly minFontPx: number | null;
    readonly minLineHeightRatio: number | null;
    readonly controls: number;
    readonly surfaces: number;
    readonly tabStops: number;
    readonly overlaps: number;
  };
}

export interface UiQaReport {
  readonly version: typeof UI_QA_VERSION;
  readonly generatedBy: string;
  readonly command: string;
  readonly oracleRule: string;
  readonly browser: string;
  readonly viewports: readonly (UiQaViewport & { readonly region: string })[];
  readonly scenarios: readonly UiQaReportScenario[];
  readonly comparisons: readonly UiQaComparisonRow[];
  readonly findings: readonly UiQaFinding[];
  readonly summary: {
    readonly captures: number;
    readonly contractCaptures: number;
    readonly stressCaptures: number;
    readonly checks: number;
    readonly passed: number;
    readonly failed: number;
    readonly contractFailed: number;
    readonly contractPass: boolean;
    readonly findings: number;
    readonly verdict: UiQVerdict;
  };
}

export interface UiQaCapture {
  readonly screenshot: string;
  readonly bytes: number;
  readonly measurement: UiQaMeasurement;
}

const FINDING_SEVERITY: Readonly<Record<UiQaCheckId, 'MEDIUM' | 'LOW'>> = Object.freeze({
  'viewport-mapping': 'MEDIUM',
  'text-legible': 'MEDIUM',
  'text-not-clipped': 'MEDIUM',
  'text-not-overlapping': 'MEDIUM',
  'contrast-aa': 'MEDIUM',
  'controls-visible': 'MEDIUM',
  'controls-hit-testable': 'MEDIUM',
  'essentials-visible': 'MEDIUM',
  'no-critical-overlap': 'MEDIUM',
  'scroll-policy': 'MEDIUM',
  'surface-inside-viewport': 'MEDIUM',
  'tab-order': 'LOW',
  'focus-visible': 'LOW',
  'escape-closes': 'MEDIUM',
});

const FINDING_SUMMARIES: Readonly<Record<UiQaCheckId, string>> = Object.freeze({
  'viewport-mapping': 'The browser did not lay the page out for the declared viewport and zoom.',
  'text-legible': 'Visible text falls below the 12 CSS px / 1.4 line-height floor.',
  'text-not-clipped': 'Visible text overflows or is clipped by its own box.',
  'text-not-overlapping': 'Two text boxes overlap and make each other harder to read.',
  'contrast-aa': 'A measured text pair is below WCAG AA for its size.',
  'controls-visible': 'A control has no visible rectangle.',
  'controls-hit-testable': 'A control is covered by another surface.',
  'essentials-visible': 'An essential control is missing at this viewport.',
  'no-critical-overlap': 'Two surfaces overlap.',
  'scroll-policy': 'An overflowing surface does not scroll.',
  'surface-inside-viewport': 'A surface is positioned outside the viewport.',
  'tab-order': 'The tab order repeats a stop or leaves the open panel.',
  'focus-visible': 'A keyboard stop has no visible focus ring of at least 3 px.',
  'escape-closes': 'Escape did not close the panel or did not restore focus.',
});

/**
 * Deterministic report derivation. Every input is a committed capture; nothing is timed, sampled or
 * environment-dependent, so two runs over the same `measurements.json` produce the same bytes.
 */
export function buildUiQaReport(input: {
  readonly generatedBy: string;
  readonly command: string;
  readonly captures: readonly UiQaCapture[];
}): UiQaReport {
  const declared: unknown = input.captures;
  if (!Array.isArray(declared) || declared.length === 0)
    throw new Error('UI QA report needs at least one capture');
  const captures = input.captures,
    evaluations = captures.map((capture) => ({
      capture,
      evaluation: evaluateUiQaMeasurement(capture.measurement),
    }));
  const browsers = new Set(input.captures.map((capture) => capture.measurement.browser));
  if (browsers.size !== 1) throw new Error('UI QA report mixes browser versions');
  const scenarios: UiQaReportScenario[] = evaluations.map(({ capture, evaluation }) => {
    const measurement = capture.measurement;
    const visibleSurfaces = measurement.surfaces.filter((surface) => surface.visible);
    return {
      screenshot: capture.screenshot,
      bytes: capture.bytes,
      scenario: evaluation.scenario,
      viewport: evaluation.viewport,
      tier: evaluation.tier,
      surface: evaluation.surface,
      region: measurement.region,
      verdict: evaluation.verdict,
      checks: evaluation.checks,
      failed: evaluation.failed,
      numbers: {
        effectiveWidthPx: measurement.effectiveWidthPx,
        effectiveHeightPx: measurement.effectiveHeightPx,
        minFontPx: measurement.text.minFontPx,
        minLineHeightRatio: measurement.text.minLineHeightRatio,
        controls: measurement.controls.length,
        surfaces: visibleSurfaces.length,
        tabStops: measurement.keyboard.stops.length,
        overlaps: measurement.overlaps.length,
      },
    };
  });
  const comparisonRows: UiQaComparisonRow[] = [];
  for (const { capture, evaluation } of evaluations) {
    const measurement = capture.measurement;
    const surface = evaluation.surface ?? 'hud';
    const measured = measurement.surfaces.find((entry) => entry.id === surface);
    comparisonRows.push({
      viewport: evaluation.viewport,
      region: measurement.region,
      tier: evaluation.tier,
      surface,
      widthPx:
        measured?.rect === null || measured?.rect === undefined ? null : round(measured.rect.width),
      heightPx:
        measured?.rect === null || measured?.rect === undefined
          ? null
          : round(measured.rect.height),
      fontPx: measurement.text.minFontPx,
      lineHeightRatio: measurement.text.minLineHeightRatio,
      visibleRows: measured?.rows ?? null,
      scrollHeight: measured?.scroll?.scrollHeight ?? null,
      clientHeight: measured?.scroll?.clientHeight ?? null,
      verdict: evaluation.verdict,
    });
  }
  const findings: UiQaFinding[] = [];
  for (const { capture, evaluation } of evaluations)
    for (const check of evaluation.checks) {
      if (check.pass) continue;
      findings.push(
        Object.freeze({
          id: `D${findings.length + 1}`,
          severity: FINDING_SEVERITY[check.id],
          tier: evaluation.tier,
          surface: evaluation.surface ?? 'hud',
          viewport: evaluation.viewport,
          check: check.id,
          summary: `${FINDING_SUMMARIES[check.id]} (${check.detail})`,
          repro: Object.freeze([
            `npm run qa:ui -- --browser`,
            `Deschide captura Docs/Evidence/153-ui-qa/${capture.screenshot}.`,
            `Viewport ${capture.measurement.viewport.widthPx}×${capture.measurement.viewport.heightPx} la ${capture.measurement.viewport.zoom * 100}% zoom (${capture.measurement.effectiveWidthPx}×${capture.measurement.effectiveHeightPx} CSS px efectivi).`,
            `Scenariul „${evaluation.scenario}”, verificarea \`${check.id}\`: ${check.detail}`,
          ]),
        }),
      );
    }
  const checks = scenarios.reduce((total, scenario) => total + scenario.checks.length, 0);
  const passedChecks = scenarios.reduce(
    (total, scenario) => total + scenario.checks.filter((check) => check.pass).length,
    0,
  );
  const contract = scenarios.filter((scenario) => scenario.tier === 'CONTRACT');
  return Object.freeze({
    version: UI_QA_VERSION,
    generatedBy: input.generatedBy,
    command: input.command,
    oracleRule:
      'Un rezultat este PASS numai dacă fiecare verificare a scenariului are numărul real în limitele declarate; un scenariu STRESS nu este ascuns, ci raportat ca finding.',
    browser: [...browsers][0]!,
    viewports: UI_QA_VIEWPORTS.map((viewport) =>
      Object.freeze({
        ...viewport,
        region: computeResponsiveLayout({
          widthPx: viewport.widthPx,
          heightPx: viewport.heightPx,
          zoom: viewport.zoom,
        }).region,
      }),
    ),
    scenarios: Object.freeze(scenarios),
    comparisons: Object.freeze(comparisonRows),
    findings: Object.freeze(findings),
    summary: Object.freeze({
      captures: scenarios.length,
      contractCaptures: contract.length,
      stressCaptures: scenarios.length - contract.length,
      checks,
      passed: passedChecks,
      failed: checks - passedChecks,
      contractFailed: contract.reduce(
        (total, scenario) => total + scenario.checks.filter((check) => !check.pass).length,
        0,
      ),
      contractPass: contract.every((scenario) => scenario.verdict === 'PASS'),
      findings: findings.length,
      verdict: contract.every((scenario) => scenario.verdict === 'PASS') ? 'PASS' : 'FAIL',
    }),
  });
}

/** Markdown mirror of the report: one table per component and the findings with their repro. */
export function uiQaReportMarkdown(report: UiQaReport): string {
  const scenarioRows = report.scenarios
    .map(
      (scenario) =>
        `| ${scenario.scenario} | ${scenario.viewport} (${scenario.region}) | ${scenario.tier} | ${scenario.screenshot} | ${scenario.verdict} | ${scenario.checks.filter((check) => check.pass).length}/${scenario.checks.length} |`,
    )
    .join('\n');
  const comparisonBySurface = [...new Set(report.comparisons.map((row) => row.surface))].map(
    (surface) => {
      const rows = report.comparisons
        .filter((row) => row.surface === surface)
        .map(
          (row) =>
            `| ${row.viewport} | ${row.region} | ${row.widthPx ?? '—'} | ${row.heightPx ?? '—'} | ${row.fontPx ?? '—'} | ${row.lineHeightRatio ?? '—'} | ${row.scrollHeight ?? '—'} / ${row.clientHeight ?? '—'} | ${row.verdict} |`,
        )
        .join('\n');
      return `### ${surface}\n\n| Viewport | Regiune | Lățime | Înălțime | Font minim | Line-height | Scroll (conținut / vizibil) | Verdict |\n| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |\n${rows}`;
    },
  );
  const checkRows = report.scenarios
    .map(
      (scenario) =>
        `### ${scenario.scenario} · ${scenario.viewport}\n\n${scenario.checks
          .map(
            (check) =>
              `- \`${check.id}\`: ${check.pass ? 'PASS' : 'FAIL'} — ${check.detail} (\`${JSON.stringify(check.actual)}\`)`,
          )
          .join('\n')}`,
    )
    .join('\n\n');
  const findingBlocks =
    report.findings.length === 0
      ? 'Niciun finding: toate scenariile STRESS au trecut.'
      : report.findings
          .map(
            (finding) =>
              `### ${finding.id} · ${finding.surface} · ${finding.viewport} (${finding.tier}, ${finding.severity})\n\n${finding.summary}\n\nPași de reproducere:\n\n${finding.repro.map((step, index) => `${index + 1}. ${step}`).join('\n')}`,
          )
          .join('\n\n');
  return `# 153 — QA vizual și accesibilitate V1

Raport determinist generat de \`${report.generatedBy}\` cu \`${report.command}\`.
Capturile provin din **${report.browser}**; numerele de mai jos sunt măsurători reale de DOM, nu
estimări. Regula oracolului: ${report.oracleRule}

## Matricea

| Scenariu | Viewport (regiune) | Nivel | Captură | Verdict | Verificări |
| --- | --- | --- | --- | --- | ---: |
${scenarioRows}

Total: ${report.summary.captures} capturi (${report.summary.contractCaptures} CONTRACT,
${report.summary.stressCaptures} STRESS), ${report.summary.checks} verificări,
${report.summary.passed} trecute, ${report.summary.failed} eșuate (${report.summary.contractFailed} în
nivelul CONTRACT), ${report.summary.findings} findings, verdict CONTRACT **${report.summary.verdict}**.

Un finding este o verificare reală care a picat, cu captura și pașii de reproducere alături; PBI 153
nu repară \`src/\`, deci findings-urile rămân pentru PBI-urile proprietare. Rularea raportului reușește
când raportul este coerent; \`npm run qa:ui -- --strict\` transformă un finding CONTRACT în exit code 1.

## Comparația aceleiași componente la rezoluții diferite

${comparisonBySurface.join('\n\n')}

## Verificări per scenariu

${checkRows}

## Findings

${findingBlocks}
`;
}
