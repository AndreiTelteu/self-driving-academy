/**
 * 084 responsive contract for the driving HUD, minimap, fleet column and the centre panels.
 *
 * The module is pure geometry and policy: it never reads the DOM, never measures the browser and
 * never installs a listener. The host (or the capture fixture) supplies the real viewport; the
 * browser supplies the real rectangles. Everything here is deterministic so the same viewport
 * always produces byte-identical CSS variables and region caps.
 *
 * Zoom is handled the way the browser handles it: browser zoom reduces the effective CSS viewport
 * (`innerWidth / zoom`), so a 1280×720 window at 150% zoom is laid out as ~853×480. CSS media
 * queries see that reduced viewport directly; this contract reproduces the same arithmetic so tests
 * and reports can reason about it without a browser.
 */

export const RESPONSIVE_LAYOUT_VERSION = '084-responsive-layout-v1';

export const RESPONSIVE_BREAKPOINTS = Object.freeze({
  compactMaxWidthPx: 1279,
  compactMaxHeightPx: 719,
  standardMinWidthPx: 1280,
  standardMinHeightPx: 720,
  largeMinWidthPx: 1920,
  largeMinHeightPx: 1080,
  reducedViewportFromZoom: 1.5,
});

/** Effective CSS font size below which text stops being legible. Never scaled down by zoom. */
export const RESPONSIVE_MINIMUM_FONT_PX = 12;
/** Minimum line-height ratio for body copy and rows. */
export const RESPONSIVE_MINIMUM_LINE_HEIGHT = 1.4;
/** Root font size used to translate the rem caps into the pixels the browser reports. */
export const RESPONSIVE_ROOT_FONT_PX = 16;
/** A fleet column may not collapse below this height even on a very short viewport. */
export const RESPONSIVE_MINIMUM_FLEET_HEIGHT_PX = 96;

export type ResponsiveRegion = 'COMPACT' | 'STANDARD' | 'LARGE';
export type ResponsiveSurfaceId = 'hud' | 'minimap' | 'fleet' | 'center' | 'notifications';
export type ResponsiveAnchor =
  | 'top-left'
  | 'top-right'
  | 'left-column'
  | 'center'
  | 'right-column';
export type EssentialControlId =
  'speed-output' | 'mode-buttons' | 'minimap-status' | 'pause-control' | 'recovery-control';

export interface ResponsiveViewport {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly zoom: number;
}

export interface ResponsiveRect {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ResponsiveOverlap {
  readonly a: string;
  readonly b: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly areaPx: number;
}

export interface ResponsiveScrollRules {
  readonly maxHeight: string;
  readonly maxHeightPx: number;
  readonly overflowY: 'auto';
  readonly overflowX: 'hidden';
  readonly scrollbarWidth: 'thin';
  readonly scrollbarVisible: true;
  readonly css: Readonly<Record<string, string>>;
}

export interface ResponsiveSurface {
  readonly id: ResponsiveSurfaceId;
  readonly anchor: ResponsiveAnchor;
  /** Declared width cap in CSS pixels. */
  readonly widthPx: number;
  readonly maxWidthPx: number;
  readonly maxHeightPx: number;
  readonly overflow: 'hidden' | 'scroll';
  readonly scroll: ResponsiveScrollRules | null;
  readonly maxVisibleRows: number | null;
  /** Transient surfaces are stacked above the panels instead of displacing them. */
  readonly transient: boolean;
}

export interface ResponsiveLayout {
  readonly version: typeof RESPONSIVE_LAYOUT_VERSION;
  readonly region: ResponsiveRegion;
  readonly viewport: ResponsiveViewport;
  readonly effectiveWidthPx: number;
  readonly effectiveHeightPx: number;
  readonly gaps: Readonly<{ insetPx: number; regionPx: number }>;
  readonly fontScale: number;
  readonly hudFontRem: number;
  readonly minimapFontRem: number;
  readonly surfaces: Readonly<Record<ResponsiveSurfaceId, ResponsiveSurface>>;
  readonly fleet: Readonly<{
    maxVisibleRows: number;
    visibleRows: number;
    rowHeightPx: number;
    chromePx: number;
    scrollable: true;
  }>;
  readonly panels: Readonly<{
    maxHeightRule: string;
    maxHeightPx: number;
    overflowY: 'auto';
    minWidth: '0';
  }>;
  /** Declared rectangles derived from the same caps as the CSS; the browser reports the real ones. */
  readonly rects: readonly ResponsiveRect[];
  readonly cssVariables: Readonly<Record<string, string>>;
}

export interface EssentialControl {
  readonly id: EssentialControlId;
  readonly label: string;
  readonly surface: 'hud' | 'minimap';
  readonly testId: string;
  /** Essential controls are never hidden by a breakpoint. */
  readonly alwaysVisible: true;
}

export interface TextLegibility {
  readonly viewport: Readonly<{ widthPx: number; zoom: number; effectiveWidthPx: number }>;
  readonly fontSizePx: number;
  readonly deviceFontPx: number;
  readonly minimumFontPx: typeof RESPONSIVE_MINIMUM_FONT_PX;
  readonly lineHeightRatio: number;
  readonly lineHeightPx: number;
  readonly minimumLineHeight: typeof RESPONSIVE_MINIMUM_LINE_HEIGHT;
  readonly fontPass: boolean;
  readonly lineHeightPass: boolean;
  readonly legible: boolean;
}

interface RegionRules {
  readonly gapRem: number;
  readonly hudWidthRem: number;
  readonly hudReserveRem: number;
  readonly hudFontRem: number;
  readonly minimapWidthRem: number;
  readonly minimapFontRem: number;
  readonly fleetWidthRem: number;
  readonly fleetRowRem: number;
  readonly fleetChromeRem: number;
  readonly fleetMaxRows: number;
  readonly panelWidthRem: number;
  readonly panelMaxHeightRem: number;
  readonly panelMaxHeightRule: string;
  readonly notificationsWidthRem: number;
  readonly fontScale: number;
}

/**
 * One table, three regions. The `:root` defaults in `src/style.css` mirror STANDARD; the two media
 * queries override exactly these names with the COMPACT and LARGE values.
 */
const REGION_RULES: Readonly<Record<ResponsiveRegion, RegionRules>> = Object.freeze({
  COMPACT: Object.freeze({
    gapRem: 0.75,
    hudWidthRem: 15,
    hudReserveRem: 22,
    hudFontRem: 0.85,
    minimapWidthRem: 10,
    minimapFontRem: 0.75,
    fleetWidthRem: 14,
    fleetRowRem: 2.5,
    fleetChromeRem: 5,
    fleetMaxRows: 8,
    panelWidthRem: 24,
    panelMaxHeightRem: 30,
    panelMaxHeightRule: 'min(90vh, calc(100vh - 2rem))',
    notificationsWidthRem: 10,
    fontScale: 0.9,
  }),
  STANDARD: Object.freeze({
    gapRem: 0.75,
    hudWidthRem: 22,
    hudReserveRem: 22,
    hudFontRem: 0.95,
    minimapWidthRem: 15,
    minimapFontRem: 0.8,
    fleetWidthRem: 24,
    fleetRowRem: 2.75,
    fleetChromeRem: 5.5,
    fleetMaxRows: 10,
    panelWidthRem: 26,
    panelMaxHeightRem: 42,
    panelMaxHeightRule: 'min(90vh, 42rem)',
    notificationsWidthRem: 24,
    fontScale: 1,
  }),
  LARGE: Object.freeze({
    gapRem: 0.75,
    hudWidthRem: 22,
    hudReserveRem: 22,
    hudFontRem: 1,
    minimapWidthRem: 15,
    minimapFontRem: 0.85,
    fleetWidthRem: 26,
    fleetRowRem: 2.875,
    fleetChromeRem: 6,
    fleetMaxRows: 14,
    panelWidthRem: 32,
    panelMaxHeightRem: 54,
    panelMaxHeightRule: 'min(90vh, 54rem)',
    notificationsWidthRem: 26,
    fontScale: 1.05,
  }),
});

export const RESPONSIVE_SURFACE_IDS: readonly ResponsiveSurfaceId[] = Object.freeze([
  'hud',
  'minimap',
  'fleet',
  'center',
  'notifications',
]);

const round = (value: number): number => Math.round(value * 100) / 100;
const rem = (value: number): number => round(value * RESPONSIVE_ROOT_FONT_PX);
const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

function requireViewport(input: ResponsiveViewport): ResponsiveViewport {
  if (typeof input !== 'object' || input === null) throw new Error('Responsive viewport: object');
  if (!positive(input.widthPx)) throw new Error('Responsive viewport: widthPx');
  if (!positive(input.heightPx)) throw new Error('Responsive viewport: heightPx');
  if (!positive(input.zoom)) throw new Error('Responsive viewport: zoom');
  return Object.freeze({ widthPx: input.widthPx, heightPx: input.heightPx, zoom: input.zoom });
}

/** COMPACT wins over everything, then LARGE, then the standard 1280×720–1919×1079 band. */
export function responsiveRegion(widthPx: number, heightPx: number): ResponsiveRegion {
  if (!positive(widthPx)) throw new Error('Responsive viewport: widthPx');
  if (!positive(heightPx)) throw new Error('Responsive viewport: heightPx');
  if (
    widthPx <= RESPONSIVE_BREAKPOINTS.compactMaxWidthPx ||
    heightPx <= RESPONSIVE_BREAKPOINTS.compactMaxHeightPx
  )
    return 'COMPACT';
  if (
    widthPx >= RESPONSIVE_BREAKPOINTS.largeMinWidthPx &&
    heightPx >= RESPONSIVE_BREAKPOINTS.largeMinHeightPx
  )
    return 'LARGE';
  return 'STANDARD';
}

function scrollRules(rules: RegionRules, maxHeightPx: number): ResponsiveScrollRules {
  return Object.freeze({
    maxHeight: rules.panelMaxHeightRule,
    maxHeightPx,
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
    scrollbarWidth: 'thin' as const,
    scrollbarVisible: true as const,
    css: Object.freeze({
      'max-height': rules.panelMaxHeightRule,
      'max-height-px': `${maxHeightPx}px`,
      'overflow-y': 'auto',
      'overflow-x': 'hidden',
      'scrollbar-width': 'thin',
      'min-width': '0',
      'overflow-wrap': 'anywhere',
    }),
  });
}

export function computeResponsiveLayout(input: ResponsiveViewport): ResponsiveLayout {
  const viewport = requireViewport(input),
    effectiveWidthPx = round(viewport.widthPx / viewport.zoom),
    effectiveHeightPx = round(viewport.heightPx / viewport.zoom),
    region = responsiveRegion(effectiveWidthPx, effectiveHeightPx),
    rules = REGION_RULES[region],
    insetPx = rem(1),
    gapPx = rem(rules.gapRem),
    hudWidthPx = rem(rules.hudWidthRem),
    hudReservePx = rem(rules.hudReserveRem),
    minimapWidthPx = rem(rules.minimapWidthRem),
    minimapHeightPx = round(minimapWidthPx + rem(3)),
    fleetWidthPx = rem(rules.fleetWidthRem),
    fleetRowPx = rem(rules.fleetRowRem),
    fleetChromePx = rem(rules.fleetChromeRem),
    panelWidthCapPx = rem(rules.panelWidthRem),
    panelMaxHeightPx = round(
      Math.min(
        effectiveHeightPx * 0.9,
        rem(rules.panelMaxHeightRem),
        Math.max(0, effectiveHeightPx - insetPx * 2),
      ),
    ),
    // COMPACT reserves the HUD column on both sides so the centre panel never covers an essential
    // control; STANDARD/LARGE centre the panel in the free middle band.
    centerLeftPx = region === 'COMPACT' ? hudWidthPx + gapPx * 2 : insetPx + gapPx,
    centerRightPx = region === 'COMPACT' ? minimapWidthPx + gapPx * 2 : insetPx + gapPx,
    centerBandPx = Math.max(1, effectiveWidthPx - centerLeftPx - centerRightPx),
    panelWidthPx = round(Math.min(panelWidthCapPx, centerBandPx)),
    panelX = round(centerLeftPx + (centerBandPx - panelWidthPx) / 2),
    panelY = region === 'COMPACT' ? insetPx : round((effectiveHeightPx - panelMaxHeightPx) / 2),
    fleetTopPx = insetPx + hudReservePx + gapPx,
    fleetCapPx = round(rules.fleetMaxRows * fleetRowPx + fleetChromePx),
    fleetAvailablePx = Math.max(0, effectiveHeightPx - fleetTopPx - insetPx),
    fleetHeightPx = round(
      Math.max(RESPONSIVE_MINIMUM_FLEET_HEIGHT_PX, Math.min(fleetCapPx, fleetAvailablePx)),
    ),
    fleetVisibleRows = Math.max(
      0,
      Math.floor(Math.max(0, fleetHeightPx - fleetChromePx) / fleetRowPx),
    ),
    notificationsWidthPx = rem(rules.notificationsWidthRem),
    notificationsHeightPx = rem(9.5),
    centerScroll = scrollRules(rules, panelMaxHeightPx),
    rects: ResponsiveRect[] = [
      Object.freeze({
        id: 'hud',
        x: insetPx,
        y: insetPx,
        width: Math.min(hudWidthPx, Math.max(1, effectiveWidthPx - insetPx * 2)),
        height: Math.min(hudReservePx, Math.max(1, effectiveHeightPx - insetPx * 2)),
      }),
      Object.freeze({
        id: 'minimap',
        x: round(effectiveWidthPx - insetPx - minimapWidthPx),
        y: insetPx,
        width: minimapWidthPx,
        height: minimapHeightPx,
      }),
      Object.freeze({
        id: 'fleet',
        x: insetPx,
        y: fleetTopPx,
        width: Math.min(fleetWidthPx, Math.max(1, effectiveWidthPx - insetPx * 2)),
        height: fleetHeightPx,
      }),
      Object.freeze({
        id: 'center',
        x: panelX,
        y: panelY,
        width: panelWidthPx,
        height: panelMaxHeightPx,
      }),
      Object.freeze({
        id: 'notifications',
        x: round(effectiveWidthPx - insetPx - Math.min(notificationsWidthPx, effectiveWidthPx - insetPx * 2)),
        y: round(insetPx + minimapHeightPx + gapPx),
        width: Math.min(notificationsWidthPx, Math.max(1, effectiveWidthPx - insetPx * 2)),
        height: notificationsHeightPx,
      }),
    ],
    cssVariables = Object.freeze({
      '--layout-inset': '1rem',
      '--layout-gap': `${rules.gapRem}rem`,
      '--layout-hud-width': `${rules.hudWidthRem}rem`,
      '--layout-hud-reserve': `${rules.hudReserveRem}rem`,
      '--layout-hud-font': `${rules.hudFontRem}rem`,
      '--layout-minimap-width': `${rules.minimapWidthRem}rem`,
      '--layout-minimap-font': `${rules.minimapFontRem}rem`,
      '--layout-fleet-width': `${rules.fleetWidthRem}rem`,
      '--layout-fleet-row': `${rules.fleetRowRem}rem`,
      '--layout-fleet-chrome': `${rules.fleetChromeRem}rem`,
      '--layout-fleet-min-height': region === 'COMPACT' ? '6rem' : '0rem',
      '--layout-fleet-max-rows': String(rules.fleetMaxRows),
      '--layout-panel-width': `${rules.panelWidthRem}rem`,
      '--layout-panel-max-height': rules.panelMaxHeightRule,
      '--layout-notifications-width': `${rules.notificationsWidthRem}rem`,
      '--layout-font-scale': String(rules.fontScale),
    });

  const scrollSurface = (
    id: ResponsiveSurfaceId,
    anchor: ResponsiveAnchor,
    widthPx: number,
    maxHeightPx: number,
    overflow: 'hidden' | 'scroll',
    scroll: ResponsiveScrollRules | null,
    maxVisibleRows: number | null,
    transient = false,
  ): ResponsiveSurface =>
    Object.freeze({
      id,
      anchor,
      widthPx,
      maxWidthPx: widthPx,
      maxHeightPx,
      overflow,
      scroll,
      maxVisibleRows,
      transient,
    });

  const surfaces = Object.freeze({
    hud: scrollSurface('hud', 'top-left', hudWidthPx, hudReservePx, 'hidden', null, null),
    minimap: scrollSurface(
      'minimap',
      'top-right',
      minimapWidthPx,
      minimapHeightPx,
      'hidden',
      null,
      null,
    ),
    fleet: scrollSurface(
      'fleet',
      'left-column',
      fleetWidthPx,
      Math.min(fleetCapPx, fleetHeightPx),
      'scroll',
      scrollRules(rules, fleetHeightPx),
      rules.fleetMaxRows,
    ),
    center: scrollSurface(
      'center',
      'center',
      panelWidthPx,
      panelMaxHeightPx,
      'scroll',
      centerScroll,
      null,
    ),
    notifications: scrollSurface(
      'notifications',
      'right-column',
      notificationsWidthPx,
      notificationsHeightPx,
      'hidden',
      null,
      null,
      true,
    ),
  });

  return Object.freeze({
    version: RESPONSIVE_LAYOUT_VERSION,
    region,
    viewport,
    effectiveWidthPx,
    effectiveHeightPx,
    gaps: Object.freeze({ insetPx, regionPx: gapPx }),
    fontScale: rules.fontScale,
    hudFontRem: rules.hudFontRem,
    minimapFontRem: rules.minimapFontRem,
    surfaces,
    fleet: Object.freeze({
      maxVisibleRows: rules.fleetMaxRows,
      visibleRows: fleetVisibleRows,
      rowHeightPx: fleetRowPx,
      chromePx: fleetChromePx,
      scrollable: true as const,
    }),
    panels: Object.freeze({
      maxHeightRule: rules.panelMaxHeightRule,
      maxHeightPx: panelMaxHeightPx,
      overflowY: 'auto' as const,
      minWidth: '0' as const,
    }),
    rects: Object.freeze(rects),
    cssVariables,
  });
}

/** The controls that no breakpoint may cover or hide. */
export function essentialControls(viewport: ResponsiveViewport): readonly EssentialControl[] {
  requireViewport(viewport);
  return Object.freeze([
    Object.freeze({
      id: 'speed-output' as const,
      label: 'Viteză',
      surface: 'hud' as const,
      testId: 'essential-speed',
      alwaysVisible: true as const,
    }),
    Object.freeze({
      id: 'mode-buttons' as const,
      label: 'Butoane AUTO/MANUAL/LEARNING',
      surface: 'hud' as const,
      testId: 'essential-mode-buttons',
      alwaysVisible: true as const,
    }),
    Object.freeze({
      id: 'minimap-status' as const,
      label: 'Stare minimapă',
      surface: 'minimap' as const,
      testId: 'essential-minimap-status',
      alwaysVisible: true as const,
    }),
    Object.freeze({
      id: 'pause-control' as const,
      label: 'Pauză',
      surface: 'hud' as const,
      testId: 'essential-pause',
      alwaysVisible: true as const,
    }),
    Object.freeze({
      id: 'recovery-control' as const,
      label: 'Recuperare',
      surface: 'hud' as const,
      testId: 'essential-recovery',
      alwaysVisible: true as const,
    }),
  ]);
}

function requireRect(rect: ResponsiveRect): ResponsiveRect {
  if (typeof rect !== 'object' || rect === null) throw new Error('Responsive rect: object');
  if (typeof rect.id !== 'string' || rect.id.trim() === '') throw new Error('Responsive rect: id');
  for (const field of ['x', 'y', 'width', 'height'] as const)
    if (typeof rect[field] !== 'number' || !Number.isFinite(rect[field]))
      throw new Error(`Responsive rect ${rect.id}: ${field}`);
  if (rect.width <= 0) throw new Error(`Responsive rect ${rect.id}: width`);
  if (rect.height <= 0) throw new Error(`Responsive rect ${rect.id}: height`);
  return rect;
}

/** All positive-area intersections between the supplied rectangles. */
export function findOverlaps(rects: readonly ResponsiveRect[]): readonly ResponsiveOverlap[] {
  const valid = rects.map(requireRect),
    seen = new Set<string>(),
    overlaps: ResponsiveOverlap[] = [];
  for (const rect of valid) {
    if (seen.has(rect.id)) throw new Error(`Responsive rect ${rect.id}: duplicate id`);
    seen.add(rect.id);
  }
  for (let left = 0; left < valid.length; left += 1)
    for (let right = left + 1; right < valid.length; right += 1) {
      const a = valid[left]!,
        b = valid[right]!,
        widthPx = round(Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)),
        heightPx = round(Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
      if (widthPx <= 0 || heightPx <= 0) continue;
      overlaps.push(
        Object.freeze({ a: a.id, b: b.id, widthPx, heightPx, areaPx: round(widthPx * heightPx) }),
      );
    }
  return Object.freeze(overlaps);
}

export function assertNoOverlap(rects: readonly ResponsiveRect[]): readonly ResponsiveRect[] {
  const overlaps = findOverlaps(rects);
  if (overlaps.length > 0)
    throw new Error(
      `Responsive layout overlap: ${overlaps.map((entry) => `${entry.a} × ${entry.b}`).join(', ')}`,
    );
  return rects;
}

/**
 * Scroll policy for the fleet list and the centre panels: at most 90% of the viewport (or the
 * region cap), a visible thin scrollbar and vertical-only scrolling.
 */
export function scrollableRegion(viewport: ResponsiveViewport): ResponsiveScrollRules {
  const input = requireViewport(viewport),
    effectiveWidthPx = round(input.widthPx / input.zoom),
    effectiveHeightPx = round(input.heightPx / input.zoom),
    region = responsiveRegion(effectiveWidthPx, effectiveHeightPx),
    rules = REGION_RULES[region],
    maxHeightPx = round(
      Math.min(
        effectiveHeightPx * 0.9,
        rem(rules.panelMaxHeightRem),
        Math.max(0, effectiveHeightPx - rem(1) * 2),
      ),
    );
  return scrollRules(rules, maxHeightPx);
}

/**
 * Legibility check for the resolved CSS font size. Browser zoom multiplies the device pixels
 * (`deviceFontPx`) but leaves the CSS size alone, so the 12 CSS px floor is zoom-independent.
 */
export function textLegibility(input: {
  readonly widthPx: number;
  readonly zoom: number;
  readonly fontSizePx: number;
  readonly lineHeightRatio?: number;
}): TextLegibility {
  if (typeof input !== 'object' || input === null) throw new Error('Responsive text: object');
  if (!positive(input.widthPx)) throw new Error('Responsive text: widthPx');
  if (!positive(input.zoom)) throw new Error('Responsive text: zoom');
  if (!positive(input.fontSizePx)) throw new Error('Responsive text: fontSizePx');
  const lineHeightRatio = input.lineHeightRatio ?? RESPONSIVE_MINIMUM_LINE_HEIGHT;
  if (!positive(lineHeightRatio)) throw new Error('Responsive text: lineHeightRatio');
  const fontPass = input.fontSizePx >= RESPONSIVE_MINIMUM_FONT_PX,
    lineHeightPass = lineHeightRatio >= RESPONSIVE_MINIMUM_LINE_HEIGHT;
  return Object.freeze({
    viewport: Object.freeze({
      widthPx: input.widthPx,
      zoom: input.zoom,
      effectiveWidthPx: round(input.widthPx / input.zoom),
    }),
    fontSizePx: round(input.fontSizePx),
    deviceFontPx: round(input.fontSizePx * input.zoom),
    minimumFontPx: RESPONSIVE_MINIMUM_FONT_PX,
    lineHeightRatio,
    lineHeightPx: round(input.fontSizePx * lineHeightRatio),
    minimumLineHeight: RESPONSIVE_MINIMUM_LINE_HEIGHT,
    fontPass,
    lineHeightPass,
    legible: fontPass && lineHeightPass,
  });
}

/** The three named layouts the PBI requires: both PC resolutions and the 150% zoom case. */
export const RESPONSIVE_LAYOUTS = Object.freeze(
  [
    Object.freeze({ id: '1280x720', widthPx: 1280, heightPx: 720, zoom: 1 }),
    Object.freeze({ id: '1920x1080', widthPx: 1920, heightPx: 1080, zoom: 1 }),
    Object.freeze({ id: 'zoom-150', widthPx: 1280, heightPx: 720, zoom: 1.5 }),
  ].map((entry) =>
    Object.freeze({
      ...entry,
      layout: computeResponsiveLayout(entry),
    }),
  ),
);
