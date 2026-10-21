import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  RESPONSIVE_BREAKPOINTS,
  RESPONSIVE_LAYOUTS,
  RESPONSIVE_LAYOUT_VERSION,
  RESPONSIVE_MINIMUM_FLEET_HEIGHT_PX,
  RESPONSIVE_MINIMUM_FONT_PX,
  RESPONSIVE_MINIMUM_LINE_HEIGHT,
  assertNoOverlap,
  computeResponsiveLayout,
  essentialControls,
  findOverlaps,
  responsiveRegion,
  scrollableRegion,
  textLegibility,
} from '../../src/ui';
import type { ResponsiveRect } from '../../src/ui';

const css = readFileSync(join(process.cwd(), 'src', 'style.css'), 'utf8');
const layout1280 = computeResponsiveLayout({ widthPx: 1280, heightPx: 720, zoom: 1 });
const layout1920 = computeResponsiveLayout({ widthPx: 1920, heightPx: 1080, zoom: 1 });
const layoutZoom = computeResponsiveLayout({ widthPx: 1280, heightPx: 720, zoom: 1.5 });
const criticalRects = (layout: typeof layout1280): ResponsiveRect[] =>
  layout.rects.filter((rect) => rect.id !== 'notifications');

test('084 version and breakpoints are frozen and explicit', () => {
  assert.equal(RESPONSIVE_LAYOUT_VERSION, '084-responsive-layout-v1');
  assert.equal(RESPONSIVE_BREAKPOINTS.compactMaxWidthPx, 1279);
  assert.equal(RESPONSIVE_BREAKPOINTS.compactMaxHeightPx, 719);
  assert.equal(RESPONSIVE_BREAKPOINTS.largeMinWidthPx, 1920);
  assert.equal(RESPONSIVE_BREAKPOINTS.largeMinHeightPx, 1080);
  assert.equal(RESPONSIVE_BREAKPOINTS.reducedViewportFromZoom, 1.5);
  assert.ok(Object.isFrozen(RESPONSIVE_BREAKPOINTS));
});

test('084 1279 px width is COMPACT and 1280 px is STANDARD', () => {
  assert.equal(responsiveRegion(1279, 720), 'COMPACT');
  assert.equal(responsiveRegion(1280, 720), 'STANDARD');
});

test('084 719 px height is COMPACT and 720 px height is STANDARD', () => {
  assert.equal(responsiveRegion(1280, 719), 'COMPACT');
  assert.equal(responsiveRegion(1280, 720), 'STANDARD');
});

test('084 LARGE starts exactly at 1920×1080', () => {
  assert.equal(responsiveRegion(1919, 1080), 'STANDARD');
  assert.equal(responsiveRegion(1920, 1079), 'STANDARD');
  assert.equal(responsiveRegion(1920, 1080), 'LARGE');
});

test('084 zoom reduces the effective CSS viewport and selects COMPACT', () => {
  assert.equal(layoutZoom.effectiveWidthPx, 853.33);
  assert.equal(layoutZoom.effectiveHeightPx, 480);
  assert.equal(layoutZoom.region, 'COMPACT');
  assert.equal(layoutZoom.viewport.zoom, 1.5);
});

test('084 invalid viewports are rejected with closed errors', () => {
  assert.throws(
    () => computeResponsiveLayout({ widthPx: 0, heightPx: 720, zoom: 1 }),
    /Responsive viewport: widthPx/,
  );
  assert.throws(
    () => computeResponsiveLayout({ widthPx: 1280, heightPx: -1, zoom: 1 }),
    /Responsive viewport: heightPx/,
  );
  assert.throws(
    () => computeResponsiveLayout({ widthPx: 1280, heightPx: 720, zoom: 0 }),
    /Responsive viewport: zoom/,
  );
  assert.throws(
    () => computeResponsiveLayout({ widthPx: 1280, heightPx: 720, zoom: Number.NaN }),
    /Responsive viewport: zoom/,
  );
});

test('084 regions keep their anchors, caps and shared gap', () => {
  assert.equal(layout1280.surfaces.hud.anchor, 'top-left');
  assert.equal(layout1280.surfaces.minimap.anchor, 'top-right');
  assert.equal(layout1280.surfaces.fleet.anchor, 'left-column');
  assert.equal(layout1280.surfaces.center.anchor, 'center');
  assert.equal(layout1280.surfaces.notifications.anchor, 'right-column');
  assert.equal(layout1280.gaps.insetPx, 16);
  assert.equal(layout1280.gaps.regionPx, 12);
  assert.equal(layout1280.surfaces.hud.widthPx, 352);
  assert.equal(layout1280.surfaces.minimap.widthPx, 240);
  assert.equal(layout1280.surfaces.fleet.widthPx, 384);
  assert.equal(layout1280.surfaces.center.widthPx, 416);
  for (const surface of Object.values(layout1280.surfaces)) {
    assert.ok(surface.widthPx > 0 && surface.maxWidthPx >= surface.widthPx);
    assert.ok(surface.maxHeightPx > 0);
  }
});

test('084 declared regions never overlap at 1280×720 and 1920×1080', () => {
  assert.deepEqual(findOverlaps(criticalRects(layout1280)), []);
  assert.deepEqual(findOverlaps(criticalRects(layout1920)), []);
  assert.equal(assertNoOverlap(criticalRects(layout1280)).length, 4);
});

test('084 declared regions never overlap at the 150% zoom viewport', () => {
  assert.deepEqual(findOverlaps(criticalRects(layoutZoom)), []);
  // The centre panel is placed between the compact HUD and minimap columns, not over them.
  const hud = layoutZoom.rects.find((rect) => rect.id === 'hud')!;
  const minimap = layoutZoom.rects.find((rect) => rect.id === 'minimap')!;
  const center = layoutZoom.rects.find((rect) => rect.id === 'center')!;
  assert.ok(center.x >= hud.x + hud.width);
  assert.ok(center.x + center.width <= minimap.x);
});

test('084 fleet max rows and height follow the region caps', () => {
  assert.equal(layout1280.fleet.maxVisibleRows, 10);
  assert.equal(layout1920.fleet.maxVisibleRows, 14);
  assert.equal(layoutZoom.fleet.maxVisibleRows, 8);
  assert.ok(layout1920.fleet.visibleRows > layout1280.fleet.visibleRows);
  assert.ok(layout1280.fleet.visibleRows < 30);
  assert.equal(layout1280.fleet.scrollable, true);
  for (const layout of [layout1280, layout1920, layoutZoom]) {
    const fleet = layout.rects.find((rect) => rect.id === 'fleet')!;
    assert.ok(fleet.height >= RESPONSIVE_MINIMUM_FLEET_HEIGHT_PX);
  }
});

test('084 essential controls are listed as always visible', () => {
  const controls = essentialControls({ widthPx: 1280, heightPx: 720, zoom: 1 });
  assert.deepEqual(
    controls.map((control) => control.id),
    ['speed-output', 'mode-buttons', 'minimap-status', 'pause-control', 'recovery-control'],
  );
  assert.ok(controls.every((control) => control.alwaysVisible === true));
  assert.equal(new Set(controls.map((control) => control.testId)).size, 5);
});

test('084 findOverlaps reports positive-area intersections only', () => {
  const overlaps = findOverlaps([
    { id: 'hud', x: 0, y: 0, width: 100, height: 100 },
    { id: 'fleet', x: 90, y: 10, width: 100, height: 40 },
    { id: 'minimap', x: 200, y: 0, width: 100, height: 100 },
    { id: 'profile', x: 120, y: 120, width: 10, height: 10 },
  ]);
  assert.equal(overlaps.length, 1);
  assert.equal(overlaps[0]!.a, 'hud');
  assert.equal(overlaps[0]!.b, 'fleet');
  assert.equal(overlaps[0]!.widthPx, 10);
  assert.equal(overlaps[0]!.heightPx, 40);
  assert.equal(findOverlaps([{ id: 'a', x: 0, y: 0, width: 10, height: 10 }]).length, 0);
});

test('084 invalid rectangles fail closed', () => {
  assert.throws(
    () => findOverlaps([{ id: '', x: 0, y: 0, width: 10, height: 10 }]),
    /Responsive rect: id/,
  );
  assert.throws(
    () => findOverlaps([{ id: 'x', x: 0, y: 0, width: 0, height: 10 }]),
    /Responsive rect x: width/,
  );
  assert.throws(
    () => findOverlaps([{ id: 'x', x: 0, y: 0, width: 10, height: -2 }]),
    /Responsive rect x: height/,
  );
  assert.throws(
    () => findOverlaps([{ id: 'x', x: Number.NaN, y: 0, width: 10, height: 10 }]),
    /Responsive rect x: x/,
  );
  assert.throws(
    () =>
      findOverlaps([
        { id: 'dup', x: 0, y: 0, width: 10, height: 10 },
        { id: 'dup', x: 50, y: 50, width: 10, height: 10 },
      ]),
    /Responsive rect dup: duplicate id/,
  );
});

test('084 assertNoOverlap names the colliding rectangles', () => {
  assert.throws(
    () =>
      assertNoOverlap([
        { id: 'fleet', x: 0, y: 0, width: 100, height: 100 },
        { id: 'profile', x: 50, y: 50, width: 100, height: 100 },
      ]),
    /Responsive layout overlap: fleet × profile/,
  );
});

test('084 text legibility enforces 12 CSS px and a 1.4 line height', () => {
  const legible = textLegibility({ widthPx: 1280, zoom: 1.5, fontSizePx: 12 });
  assert.equal(legible.legible, true);
  assert.equal(legible.deviceFontPx, 18);
  assert.equal(legible.viewport.effectiveWidthPx, 853.33);
  assert.equal(legible.minimumFontPx, RESPONSIVE_MINIMUM_FONT_PX);
  assert.equal(legible.minimumLineHeight, RESPONSIVE_MINIMUM_LINE_HEIGHT);
  const small = textLegibility({ widthPx: 1280, zoom: 1, fontSizePx: 11.9 });
  assert.equal(small.fontPass, false);
  assert.equal(small.legible, false);
  const tight = textLegibility({ widthPx: 1280, zoom: 1, fontSizePx: 14, lineHeightRatio: 1.39 });
  assert.equal(tight.fontPass, true);
  assert.equal(tight.lineHeightPass, false);
  assert.equal(tight.legible, false);
  const exact = textLegibility({ widthPx: 1280, zoom: 1, fontSizePx: 12, lineHeightRatio: 1.4 });
  assert.equal(exact.legible, true);
});

test('084 scrollable region uses 90vh, auto overflow and a visible scrollbar', () => {
  const scroll = scrollableRegion({ widthPx: 1280, heightPx: 720, zoom: 1 });
  assert.match(scroll.maxHeight, /90vh/);
  assert.equal(scroll.overflowY, 'auto');
  assert.equal(scroll.overflowX, 'hidden');
  assert.equal(scroll.scrollbarWidth, 'thin');
  assert.equal(scroll.scrollbarVisible, true);
  assert.ok(scroll.maxHeightPx <= 720 * 0.9);
  assert.equal(scroll.css['min-width'], '0');
  assert.equal(scroll.css['overflow-y'], 'auto');
});

test('084 layouts table covers 1280×720, 1920×1080 and 150% zoom', () => {
  assert.equal(RESPONSIVE_LAYOUTS.length, 3);
  assert.deepEqual(
    RESPONSIVE_LAYOUTS.map((entry) => [entry.id, entry.layout.region]),
    [
      ['1280x720', 'STANDARD'],
      ['1920x1080', 'LARGE'],
      ['zoom-150', 'COMPACT'],
    ],
  );
  assert.equal(RESPONSIVE_LAYOUTS[2]!.layout.effectiveWidthPx, 853.33);
});

test('084 CSS variables are deterministic and mirror the layout', () => {
  const first = computeResponsiveLayout({ widthPx: 1280, heightPx: 720, zoom: 1 });
  const second = computeResponsiveLayout({ widthPx: 1280, heightPx: 720, zoom: 1 });
  assert.deepEqual(first.cssVariables, second.cssVariables);
  assert.deepEqual(Object.keys(first.cssVariables), Object.keys(second.cssVariables));
  assert.equal(first.cssVariables['--layout-hud-width'], '22rem');
  assert.equal(layout1920.cssVariables['--layout-fleet-max-rows'], '14');
  assert.equal(layoutZoom.cssVariables['--layout-panel-width'], '24rem');
  assert.equal(first.cssVariables['--layout-panel-max-height'], first.panels.maxHeightRule);
});

test('084 every CSS variable and breakpoint rule exists in src/style.css', () => {
  for (const name of Object.keys(layout1280.cssVariables)) {
    assert.ok(css.includes(name), `${name} must be declared in src/style.css`);
  }
  assert.match(css, /@media \(max-width: 1279px\), \(max-height: 719px\)/);
  assert.match(css, /@media \(min-width: 1920px\) and \(min-height: 1080px\)/);
  for (const selector of [
    '.fleet-panel__rows',
    '.profile-panel__header',
    '.city-dashboard__header',
    '.game-settings__header',
  ])
    assert.ok(css.includes(selector), `${selector} must exist in src/style.css`);
  assert.match(css, /\.fleet-panel \{[\s\S]*?overflow: hidden;/);
  assert.match(css, /scrollbar-width: thin/);
  assert.match(css, /overflow-wrap: anywhere/);
  // Essential controls are never hidden by a breakpoint.
  assert.doesNotMatch(css, /\.taxi-hud(?:__speed|__mode)?[^{]*\{[^}]*display:\s*none/);
  assert.doesNotMatch(css, /\.minimap[^{]*\{[^}]*display:\s*none/);
});

test('084 compact panel typography stays at or above 0.75rem', () => {
  const compactBlock = css.slice(css.indexOf('@media (max-width: 1279px)'));
  assert.match(compactBlock, /--layout-hud-font: 0\.85rem/);
  assert.match(compactBlock, /--layout-minimap-font: 0\.75rem/);
  const hudFont = layoutZoom.hudFontRem;
  const minimapFont = layoutZoom.minimapFontRem;
  assert.ok(hudFont * 16 >= 12);
  assert.ok(minimapFont * 16 >= 12);
});
