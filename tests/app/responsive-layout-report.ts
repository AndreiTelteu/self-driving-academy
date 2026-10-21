import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  RESPONSIVE_BREAKPOINTS,
  RESPONSIVE_LAYOUT_VERSION,
  RESPONSIVE_MINIMUM_FLEET_HEIGHT_PX,
  computeResponsiveLayout,
  essentialControls,
  findOverlaps,
  scrollableRegion,
  textLegibility,
} from '../../src/ui';
import type { ResponsiveLayout, ResponsiveRect, ResponsiveViewport } from '../../src/ui';

export interface ResponsiveCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface ResponsiveScenario {
  readonly name: string;
  readonly viewport: ResponsiveViewport;
  readonly region: string;
  readonly effectiveWidthPx: number;
  readonly effectiveHeightPx: number;
  readonly hudWidthPx: number;
  readonly minimapWidthPx: number;
  readonly fleetWidthPx: number;
  readonly panelWidthPx: number;
  readonly panelMaxHeightPx: number;
  readonly panelMaxHeightRule: string;
  readonly gapPx: number;
  readonly fleetVisibleRows: number;
  readonly fleetMaxRows: number;
  readonly fleetHeightPx: number;
  readonly rectHeights: readonly number[];
  readonly overlaps: readonly string[];
  readonly notes: readonly string[];
}

export interface ResponsiveLayoutReport {
  readonly version: string;
  readonly contract: Readonly<{
    breakpoints: Readonly<typeof RESPONSIVE_BREAKPOINTS>;
    minimumFontPx: number;
    minimumLineHeight: number;
    essentialControls: readonly string[];
    regions: Readonly<Record<string, Readonly<Record<string, string | number>>>>;
  }>;
  readonly scenarios: readonly ResponsiveScenario[];
  readonly checks: readonly ResponsiveCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

const critical = (layout: ResponsiveLayout): ResponsiveRect[] =>
  layout.rects.filter((rect) => rect.id !== 'notifications');

const overlapNames = (layout: ResponsiveLayout): string[] =>
  findOverlaps(critical(layout)).map((entry) => `${entry.a} × ${entry.b}`);

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): ResponsiveCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function scenarioOf(
  name: string,
  viewport: ResponsiveViewport,
  notes: readonly string[],
): ResponsiveScenario {
  const layout = computeResponsiveLayout(viewport);
  return Object.freeze({
    name,
    viewport,
    region: layout.region,
    effectiveWidthPx: layout.effectiveWidthPx,
    effectiveHeightPx: layout.effectiveHeightPx,
    hudWidthPx: layout.surfaces.hud.widthPx,
    minimapWidthPx: layout.surfaces.minimap.widthPx,
    fleetWidthPx: layout.surfaces.fleet.widthPx,
    panelWidthPx: layout.surfaces.center.widthPx,
    panelMaxHeightPx: layout.panels.maxHeightPx,
    panelMaxHeightRule: layout.panels.maxHeightRule,
    gapPx: layout.gaps.regionPx,
    fleetVisibleRows: layout.fleet.visibleRows,
    fleetMaxRows: layout.fleet.maxVisibleRows,
    fleetHeightPx: layout.surfaces.fleet.maxHeightPx,
    rectHeights: Object.freeze(layout.rects.map((rect) => rect.height)),
    overlaps: Object.freeze(overlapNames(layout)),
    notes,
  });
}

export function runResponsiveLayoutReport(): ResponsiveLayoutReport {
  const css = readFileSync(join(process.cwd(), 'src', 'style.css'), 'utf8'),
    viewport1280 = Object.freeze({ widthPx: 1280, heightPx: 720, zoom: 1 }),
    viewport1920 = Object.freeze({ widthPx: 1920, heightPx: 1080, zoom: 1 }),
    viewportZoom = Object.freeze({ widthPx: 1280, heightPx: 720, zoom: 1.5 }),
    viewportShort = Object.freeze({ widthPx: 1920, heightPx: 700, zoom: 1 }),
    layout1280 = computeResponsiveLayout(viewport1280),
    layout1920 = computeResponsiveLayout(viewport1920),
    layoutZoom = computeResponsiveLayout(viewportZoom),
    layoutShort = computeResponsiveLayout(viewportShort),
    hud1280 = layout1280.rects.find((rect) => rect.id === 'hud')!,
    fleet1280 = layout1280.rects.find((rect) => rect.id === 'fleet')!,
    centerZoom = layoutZoom.rects.find((rect) => rect.id === 'center')!,
    hudZoom = layoutZoom.rects.find((rect) => rect.id === 'hud')!,
    minimapZoom = layoutZoom.rects.find((rect) => rect.id === 'minimap')!,
    scrollZoom = scrollableRegion(viewportZoom),
    basedCss = (needle: string) => css.includes(needle),
    mediaCompact = /@media \(max-width: 1279px\), \(max-height: 719px\)/.test(css),
    mediaLarge = /@media \(min-width: 1920px\) and \(min-height: 1080px\)/.test(css),
    cssVariables = layout1280.cssVariables,
    missingVariables = Object.keys(cssVariables).filter((name) => !css.includes(name)),
    compactBlock = css.slice(css.indexOf('@media (max-width: 1279px)')),
    legibleTwelve = textLegibility({ widthPx: 1280, zoom: 1.5, fontSizePx: 12 }),
    legibleEleven = textLegibility({ widthPx: 1280, zoom: 1, fontSizePx: 11.5 }),
    controls = essentialControls(viewport1280),
    essentialFree = [
      findOverlaps(critical(layout1280)),
      findOverlaps(critical(layout1920)),
      findOverlaps(critical(layoutZoom)),
      findOverlaps(critical(layoutShort)),
    ].every((overlaps) => overlaps.length === 0);

  const checks = [
    check(
      'contract-version',
      RESPONSIVE_LAYOUT_VERSION,
      layout1280.version,
      '084 layout contract version',
    ),
    check('1280-region', 'STANDARD', layout1280.region, '1280×720 is the standard PC band'),
    check('1280-hud-width', 352, layout1280.surfaces.hud.widthPx, '22rem HUD cap'),
    check('1280-minimap-width', 240, layout1280.surfaces.minimap.widthPx, '15rem minimap cap'),
    check('1280-fleet-width', 384, layout1280.surfaces.fleet.widthPx, '24rem fleet column'),
    check('1280-panel-width', 416, layout1280.surfaces.center.widthPx, '26rem centre panel'),
    check('1280-gap', 12, layout1280.gaps.regionPx, '0.75rem region gap'),
    check(
      '1280-fleet-below-hud',
      true,
      fleet1280.y >= hud1280.y + hud1280.height + layout1280.gaps.regionPx - 0.01,
      'the fleet column starts under the HUD with the shared gap',
    ),
    check(
      '1280-overlap-free',
      0,
      overlapNames(layout1280).length,
      'declared HUD/minimap/fleet/centre regions do not overlap',
    ),
    check('1920-region', 'LARGE', layout1920.region, '1920×1080 is the large band'),
    check('1920-panel-width', 512, layout1920.surfaces.center.widthPx, '32rem centre panel'),
    check('1920-fleet-width', 416, layout1920.surfaces.fleet.widthPx, '26rem fleet column'),
    check(
      '1920-more-rows',
      true,
      layout1920.fleet.visibleRows > layout1280.fleet.visibleRows,
      `${layout1920.fleet.visibleRows} visible rows at 1080p vs ${layout1280.fleet.visibleRows} at 720p`,
    ),
    check(
      '1920-overlap-free',
      0,
      overlapNames(layout1920).length,
      'large layout keeps the same anchors',
    ),
    check('zoom-region', 'COMPACT', layoutZoom.region, '150% zoom reduces the CSS viewport'),
    check('zoom-effective-width', 853.33, layoutZoom.effectiveWidthPx, '1280 / 1.5'),
    check('zoom-effective-height', 480, layoutZoom.effectiveHeightPx, '720 / 1.5'),
    check(
      'zoom-overlap-free',
      0,
      overlapNames(layoutZoom).length,
      'no panel covers an essential control when zoomed',
    ),
    check(
      'zoom-panel-between-columns',
      true,
      centerZoom.x >= hudZoom.x + hudZoom.width && centerZoom.x + centerZoom.width <= minimapZoom.x,
      'the centre panel sits strictly between the HUD and minimap columns',
    ),
    check(
      'compact-height-region',
      'COMPACT',
      layoutShort.region,
      '1920×700 is COMPACT because the height is 700',
    ),
    check(
      'compact-height-fleet-scrolls',
      true,
      layoutShort.surfaces.fleet.overflow === 'scroll' &&
        layoutShort.surfaces.fleet.maxHeightPx >= RESPONSIVE_MINIMUM_FLEET_HEIGHT_PX,
      'the fleet keeps its own scroll above the 6rem floor',
    ),
    check(
      'fleet-thirty-rows-scroll',
      true,
      layout1280.fleet.visibleRows < 30 && layout1280.fleet.scrollable,
      '30 rows always exceed the visible box',
    ),
    check('fleet-standard-max-rows', 10, layout1280.fleet.maxVisibleRows, 'STANDARD row cap'),
    check('fleet-large-max-rows', 14, layout1920.fleet.maxVisibleRows, 'LARGE row cap'),
    check(
      'panel-max-height-90vh',
      true,
      /90vh/.test(layout1280.panels.maxHeightRule),
      layout1280.panels.maxHeightRule,
    ),
    check(
      'panel-scroll-policy',
      'auto',
      layout1280.panels.overflowY,
      'centre panels scroll vertically',
    ),
    check(
      'panel-css-overflow',
      true,
      /\.profile-panel \{[\s\S]*?overflow-y: auto;/.test(css),
      'the profile panel CSS scrolls',
    ),
    check(
      'panel-css-sticky',
      true,
      basedCss('.profile-panel__header {') && /position: sticky/.test(css),
      'profile header stays visible while scrolling',
    ),
    check(
      'panel-css-min-width',
      true,
      /\.profile-panel \{[\s\S]*?min-width: 0;/.test(css),
      'grid/flex panels may shrink',
    ),
    check(
      'panel-css-wrap',
      true,
      basedCss('overflow-wrap: anywhere'),
      'text wraps instead of overflowing',
    ),
    check(
      'settings-css-centre',
      true,
      /\.game-settings \{[\s\S]*?transform: translate\(-50%, -50%\);/.test(css),
      'settings is the centre modal',
    ),
    check(
      'city-css-centre',
      true,
      /\.city-dashboard \{[\s\S]*?transform: translate\(-50%, -50%\);/.test(css),
      'city dashboard is the centre modal',
    ),
    check('media-compact', true, mediaCompact, '1279px/719px media query present'),
    check('media-large', true, mediaLarge, '1920×1080 media query present'),
    check(
      'css-variables',
      0,
      missingVariables.length,
      `all ${Object.keys(cssVariables).length} layout variables exist in style.css`,
    ),
    check('text-legible-12', true, legibleTwelve.legible, '12 CSS px at 150% zoom is legible'),
    check(
      'text-legible-device',
      18,
      legibleTwelve.deviceFontPx,
      '12 CSS px renders as 18 device px at 150% zoom',
    ),
    check(
      'text-not-legible-11-5',
      false,
      legibleEleven.legible,
      'sizes below 12 CSS px are rejected',
    ),
    check(
      'essential-controls',
      5,
      controls.length,
      'speed, mode, minimap status, pause and recovery',
    ),
    check(
      'essential-controls-free',
      true,
      essentialFree,
      'no declared panel overlaps the HUD/minimap surfaces',
    ),
    check(
      'hud-font-floor',
      true,
      [layout1280, layout1920, layoutZoom].every((layout) => layout.hudFontRem >= 0.75),
      'the HUD font never falls below 0.75rem',
    ),
    check(
      'zoom-font-floor',
      true,
      compactBlock.includes('--layout-minimap-font: 0.75rem') && scrollZoom.overflowY === 'auto',
      'the compact minimap font stays at 0.75rem and panels keep scrolling',
    ),
  ];

  const scenarios = Object.freeze([
    scenarioOf('1280×720 profile', viewport1280, [
      'STANDARD band: HUD 22rem top-left, minimap 15rem top-right, fleet 24rem below the HUD.',
      `The contract reserves room for ${layout1280.fleet.visibleRows} rows; text wrapping may show fewer. The 30-row list scrolls inside the column.`,
    ]),
    scenarioOf('1920×1080 profile', viewport1920, [
      'LARGE band: wider centre panel and fleet column, same anchors.',
      `Visible rows rise to ${layout1920.fleet.visibleRows} (cap ${layout1920.fleet.maxVisibleRows}).`,
    ]),
    scenarioOf('150% zoom (853×480 effective)', viewportZoom, [
      'Zoom is modelled as innerWidth/zoom, exactly what CSS media queries see.',
      'The centre panel is placed between the compact HUD and minimap columns.',
    ]),
    scenarioOf('1920×700 compact height', viewportShort, [
      'A short viewport is COMPACT even when the width is large.',
      'Panels cap at calc(100vh - 2rem) and keep their internal scroll.',
    ]),
    scenarioOf('fleet 30 rows', viewport1280, [
      'The fleet list keeps one scroll container; the row cap is a ceiling, not a promise of 30 visible rows.',
    ]),
    scenarioOf('profile scroll', viewport1280, [
      `Profile/city/settings cap at ${layout1280.panels.maxHeightRule} with overflow-y auto and a sticky header.`,
    ]),
    scenarioOf('overlap-free essentials', viewportZoom, [
      'Speed output, mode buttons, minimap status, pause and recovery stay unobstructed at the tightest supported viewport.',
    ]),
  ]);

  const passed = checks.filter((entry) => entry.pass).length;

  return Object.freeze({
    version: RESPONSIVE_LAYOUT_VERSION,
    contract: Object.freeze({
      breakpoints: RESPONSIVE_BREAKPOINTS,
      minimumFontPx: 12,
      minimumLineHeight: 1.4,
      essentialControls: Object.freeze(controls.map((control) => control.id)),
      regions: Object.freeze({
        COMPACT: Object.freeze({
          condition: 'width <= 1279 px or height <= 719 px',
          hudWidth: '15rem',
          minimapWidth: '10rem',
          fleetWidth: '14rem',
          panelWidth: '24rem',
          fleetMaxRows: 8,
        }),
        STANDARD: Object.freeze({
          condition: '1280×720 up to 1919×1079',
          hudWidth: '22rem',
          minimapWidth: '15rem',
          fleetWidth: '24rem',
          panelWidth: '26rem',
          fleetMaxRows: 10,
        }),
        LARGE: Object.freeze({
          condition: 'width >= 1920 px and height >= 1080 px',
          hudWidth: '22rem',
          minimapWidth: '15rem',
          fleetWidth: '26rem',
          panelWidth: '32rem',
          fleetMaxRows: 14,
        }),
      }),
    }),
    scenarios,
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}

export function responsiveLayoutReportMarkdown(report: ResponsiveLayoutReport): string {
  const scenarioRows = report.scenarios
      .map(
        (entry) =>
          `| ${entry.name} | ${entry.region} | ${entry.effectiveWidthPx}×${entry.effectiveHeightPx} | ${entry.hudWidthPx} / ${entry.minimapWidthPx} / ${entry.fleetWidthPx} | ${entry.panelWidthPx} | ${entry.panelMaxHeightRule} | ${entry.fleetVisibleRows} / ${entry.fleetMaxRows} | ${entry.overlaps.length} |`,
      )
      .join('\n'),
    noteRows = report.scenarios
      .map((entry) => `### ${entry.name}\n\n${entry.notes.map((note) => `- ${note}`).join('\n')}\n`)
      .join('\n'),
    checkRows = report.checks
      .map(
        (entry) =>
          `| ${entry.name} | ${String(entry.expected)} | ${String(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.detail} |`,
      )
      .join('\n');
  return `# 084 responsive layout report

Machine-readable transcript: [report.json](report.json). Generated by
\`npm run ui:responsive\`; it contains no wall-clock value, random value or browser-only state.

Version: \`${report.version}\`. The report evaluates the pure contract against the CSS in
\`src/style.css\`. Real browser rectangles and PNGs are a separate optional artifact produced by
\`node scripts/capture-responsive.mjs\`; this transcript is not a browser measurement.

## Contract

Breakpoints: COMPACT at width <= ${report.contract.breakpoints.compactMaxWidthPx} px or height <=
${report.contract.breakpoints.compactMaxHeightPx} px; STANDARD from 1280×720; LARGE from
${report.contract.breakpoints.largeMinWidthPx}×${report.contract.breakpoints.largeMinHeightPx}.
Zoom ${report.contract.breakpoints.reducedViewportFromZoom}× or more reduces the effective CSS
viewport (\`innerWidth / zoom\`). Text floor: ${report.contract.minimumFontPx} CSS px with a
${report.contract.minimumLineHeight} line height. Essential controls:
${report.contract.essentialControls.join(', ')}.

| Region | Condition | HUD | Minimap | Fleet | Centre panel | Max rows |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
${Object.entries(report.contract.regions)
  .map(
    ([region, rules]) =>
      `| ${region} | ${String(rules.condition)} | ${String(rules.hudWidth)} | ${String(rules.minimapWidth)} | ${String(rules.fleetWidth)} | ${String(rules.panelWidth)} | ${String(rules.fleetMaxRows)} |`,
  )
  .join('\n')}

## Scenarios

| Scenario | Region | Effective viewport | HUD / minimap / fleet caps (px) | Panel width (px) | Panel max height | Visible / max rows | Declared overlaps |
| --- | --- | --- | --- | ---: | --- | --- | ---: |
${scenarioRows}

${noteRows}
## Checks

| Check | Expected | Actual | Result | Detail |
| --- | --- | --- | --- | --- |
${checkRows}

## Summary

- Checks: ${report.summary.passed}/${report.summary.checks}
- Overall: ${report.summary.pass ? 'PASS' : 'FAIL'}
`;
}
