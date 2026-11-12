import assert from 'node:assert/strict';
import test from 'node:test';
import {
  UI_QA_CAPTURE_PLAN,
  UI_QA_MEASUREMENT_VERSION,
  UI_QA_MIN_FOCUS_OUTLINE_PX,
  UI_QA_SCENARIOS,
  UI_QA_SURFACES,
  UI_QA_VIEWPORTS,
  buildUiQaReport,
  evaluateUiQaMeasurement,
  parseUiQaMeasurement,
  uiQaReportMarkdown,
} from './ui-qa';
import type {
  UiQaCapture,
  UiQaCheckId,
  UiQaMeasurement,
  UiQaRect,
  UiQaSurfaceMeasurement,
} from './ui-qa';

const rect = (x: number, y: number, width: number, height: number): UiQaRect =>
  Object.freeze({
    x,
    y,
    width,
    height,
    right: Math.round((x + width) * 100) / 100,
    bottom: Math.round((y + height) * 100) / 100,
  });

function baseMeasurement(overrides: Partial<UiQaMeasurement> = {}): UiQaMeasurement {
  const surfaces: UiQaSurfaceMeasurement[] = [
    {
      id: 'hud',
      visible: true,
      hidden: false,
      rect: rect(16, 16, 352, 337),
      scroll: null,
      rows: null,
    },
    {
      id: 'minimap',
      visible: true,
      hidden: false,
      rect: rect(1024, 16, 240, 291),
      scroll: null,
      rows: null,
    },
    {
      id: 'fleet',
      visible: true,
      hidden: false,
      rect: rect(16, 364, 384, 324),
      scroll: { scrollHeight: 1715, clientHeight: 206, overflowY: 'auto', maxHeight: 'none' },
      rows: 30,
    },
    {
      id: 'notifications',
      visible: true,
      hidden: false,
      rect: rect(880, 320, 384, 152),
      scroll: { scrollHeight: 152, clientHeight: 152, overflowY: 'hidden', maxHeight: 'none' },
      rows: null,
    },
    {
      id: 'profile',
      visible: true,
      hidden: false,
      rect: rect(432, 36, 416, 648),
      scroll: { scrollHeight: 1489, clientHeight: 646, overflowY: 'auto', maxHeight: 'none' },
      rows: null,
    },
    { id: 'city', visible: false, hidden: true, rect: null, scroll: null, rows: null },
    { id: 'settings', visible: false, hidden: true, rect: null, scroll: null, rows: null },
    { id: 'camera', visible: false, hidden: true, rect: null, scroll: null, rows: null },
    { id: 'kpis', visible: false, hidden: true, rect: null, scroll: null, rows: null },
  ];
  const controls = [
    { surface: 'hud', descriptor: 'summary.taxi-hud__details "Detalii"', role: 'summary' },
    { surface: 'fleet', descriptor: 'select.fleet-panel__filter "Filtru"', role: 'select' },
    { surface: 'fleet', descriptor: 'button.fleet-panel__row "Taxi 1"', role: 'button' },
    { surface: 'profile', descriptor: 'summary "Checksum și dovezi"', role: 'summary' },
  ].map((control, index) => ({
    ...control,
    visible: true,
    enabled: true,
    rect: rect(440 + index, 48 + index * 24, 120, 20),
    insideViewport: true,
    hitTest: true,
    coveredBy: null,
    insideScrollable: index === 2,
  }));
  return {
    version: UI_QA_MEASUREMENT_VERSION,
    browser: 'Chromium 156.0.8078.4',
    scenario: 'profile',
    viewport: { id: '1280x720', widthPx: 1280, heightPx: 720, zoom: 1 },
    effectiveWidthPx: 1280,
    effectiveHeightPx: 720,
    region: 'STANDARD',
    mediaQueries: { compact: false, large: false },
    surfaces,
    controls,
    text: {
      minFontPx: 12,
      minFontDescriptor: 'span.profile-panel__summary "18 observați · 4 neobservați"',
      minLineHeightRatio: 1.4,
      minLineHeightDescriptor: 'p.fleet-panel__description "Selectarea schimbă doar ținta camerei"',
      textNodes: 120,
    },
    clipped: [],
    overlappingText: [],
    contrastFailures: [],
    overlaps: [],
    essentials: [
      {
        id: 'speed-output',
        descriptor: 'output "50"',
        visible: true,
        rect: rect(76, 31, 44, 38),
        owner: 'HARNESS',
        reason: null,
      },
      {
        id: 'mode-buttons',
        descriptor: 'div.taxi-hud__mode "AConduce AI-ul"',
        visible: true,
        rect: rect(33, 77, 206, 62),
        owner: 'OWNER_OUTSIDE_QA_HARNESS',
        reason: 'Butoanele M/L sunt compuse de 067 și poziționate de host.',
      },
      {
        id: 'minimap-status',
        descriptor: 'p.minimap__status',
        visible: true,
        rect: rect(473, 173, 142, 42),
        owner: 'HARNESS',
        reason: null,
      },
      {
        id: 'pause-control',
        descriptor: 'pause-control',
        visible: false,
        rect: null,
        owner: 'OWNER_OUTSIDE_QA_HARNESS',
        reason: 'Pauza este a meniului de aplicație.',
      },
      {
        id: 'recovery-control',
        descriptor: 'recovery-control',
        visible: false,
        rect: null,
        owner: 'OWNER_OUTSIDE_QA_HARNESS',
        reason: 'Recuperarea este montată de host.',
      },
    ],
    keyboard: {
      stops: [
        {
          order: 1,
          descriptor: 'summary "Checksum și dovezi"',
          surface: 'profile',
          outlineStyle: 'solid',
          outlineWidthPx: 3,
          native: true,
          insideDialog: true,
        },
        {
          order: 2,
          descriptor: 'button "Închide"',
          surface: 'profile',
          outlineStyle: 'solid',
          outlineWidthPx: 3,
          native: true,
          insideDialog: true,
        },
      ],
      escapeClosed: true,
      escapeReason: null,
      focusRestored: true,
      dialogOpenBefore: true,
      dialogOpenAfter: false,
      trapExpected: true,
    },
    document: { scrollWidth: 1280, scrollHeight: 720, horizontalOverflow: false },
    ...overrides,
  };
}

function failedChecks(measurement: UiQaMeasurement): readonly UiQaCheckId[] {
  return evaluateUiQaMeasurement(measurement).failed;
}

function withSurfaces(
  measurement: UiQaMeasurement,
  mutate: (surfaces: UiQaSurfaceMeasurement[]) => UiQaSurfaceMeasurement[],
): UiQaMeasurement {
  return { ...measurement, surfaces: mutate([...measurement.surfaces]) };
}

test('153 declares four contract viewports and one documented stress zoom', () => {
  const contract = UI_QA_VIEWPORTS.filter((viewport) => viewport.tier === 'CONTRACT');
  const stress = UI_QA_VIEWPORTS.filter((viewport) => viewport.tier === 'STRESS');
  assert.equal(contract.length, 4);
  assert.equal(stress.length, 1);
  assert.deepEqual(
    contract.map((viewport) => viewport.id),
    ['1280x720', '1920x1080', 'zoom-150', 'zoom-200'],
  );
  assert.equal(stress[0]!.id, 'zoom-200-720');
  assert.equal(new Set(UI_QA_VIEWPORTS.map((viewport) => viewport.id)).size, 5);
  assert.ok(UI_QA_VIEWPORTS.every((viewport) => Object.isFrozen(viewport)));
});

test('153 the capture plan references declared scenarios and viewports', () => {
  const scenarioIds = new Set(UI_QA_SCENARIOS.map((scenario) => scenario.id));
  const viewportIds = new Set(UI_QA_VIEWPORTS.map((viewport) => viewport.id));
  assert.ok(UI_QA_CAPTURE_PLAN.length >= 20);
  for (const entry of UI_QA_CAPTURE_PLAN) {
    assert.ok(scenarioIds.has(entry.scenario), `unknown scenario ${entry.scenario}`);
    assert.ok(viewportIds.has(entry.viewport), `unknown viewport ${entry.viewport}`);
  }
  const keys = UI_QA_CAPTURE_PLAN.map((entry) => `${entry.scenario}@${entry.viewport}`);
  assert.equal(new Set(keys).size, keys.length, 'duplicate capture');
  for (const viewport of UI_QA_VIEWPORTS)
    for (const scenario of ['hud', 'profile'])
      assert.ok(
        keys.includes(`${scenario}@${viewport.id}`),
        `${scenario} is not captured at ${viewport.id}`,
      );
});

test('153 every scenario points at a declared surface and every surface has an owner', () => {
  const surfaceIds = new Set(UI_QA_SURFACES.map((surface) => surface.id));
  for (const surface of UI_QA_SURFACES) {
    assert.match(surface.owner, /^\d{3}$/);
    assert.ok(surface.selector.length > 0);
    if (surface.kind === 'dialog')
      assert.ok(surface.panelId !== null || surface.id !== 'placeholder');
  }
  for (const scenario of UI_QA_SCENARIOS)
    if (scenario.surface !== null)
      assert.ok(surfaceIds.has(scenario.surface), `unknown surface ${scenario.surface}`);
});

test('153 a clean measurement passes every check', () => {
  const evaluation = evaluateUiQaMeasurement(baseMeasurement());
  assert.deepEqual(evaluation.failed, []);
  assert.equal(evaluation.verdict, 'PASS');
  assert.equal(evaluation.checks.length, 14);
  assert.equal(evaluation.tier, 'CONTRACT');
  assert.equal(evaluation.surface, 'profile');
});

test('153 text below 12 px or 1.4 line-height fails legibility with the real numbers', () => {
  const small = evaluateUiQaMeasurement(
    baseMeasurement({
      text: { ...baseMeasurement().text, minFontPx: 11.9 },
    }),
  );
  assert.deepEqual(small.failed, ['text-legible']);
  assert.equal(small.checks.find((check) => check.id === 'text-legible')!.pass, false);
  const tight = evaluateUiQaMeasurement(
    baseMeasurement({ text: { ...baseMeasurement().text, minLineHeightRatio: 1.39 } }),
  );
  assert.deepEqual(tight.failed, ['text-legible']);
  const missing = evaluateUiQaMeasurement(
    baseMeasurement({ text: { ...baseMeasurement().text, minFontPx: null } }),
  );
  assert.deepEqual(missing.failed, ['text-legible']);
});

test('153 clipped text and a WCAG AA failure are reported, not rounded away', () => {
  const clipped = evaluateUiQaMeasurement(
    baseMeasurement({
      clipped: [
        {
          surface: 'fleet',
          descriptor: 'span.fleet-panel__slot "Taxi 27"',
          text: 'Taxi 27',
          scrollWidth: 96,
          clientWidth: 61,
          overflowX: 'hidden',
        },
      ],
    }),
  );
  assert.deepEqual(clipped.failed, ['text-not-clipped']);
  const contrast = evaluateUiQaMeasurement(
    baseMeasurement({
      contrastFailures: [
        {
          surface: 'city',
          descriptor: 'span.city-dashboard__metric-sample "3 ferestre"',
          foreground: '#9bb3a8',
          background: '#3b4a44',
          ratio: 2.31,
          required: 4.5,
          fontPx: 12,
        },
      ],
    }),
  );
  assert.deepEqual(contrast.failed, ['contrast-aa']);
});

test('153 overlapping text boxes are reported with their intersection area', () => {
  const clean = evaluateUiQaMeasurement(baseMeasurement());
  assert.deepEqual(clean.failed, []);
  const overlapped = evaluateUiQaMeasurement(
    baseMeasurement({
      overlappingText: [
        {
          surface: 'fleet',
          a: 'span.fleet-panel__slot "Taxi 27"',
          b: 'span.fleet-panel__state "Blocat"',
          widthPx: 12,
          heightPx: 14,
          areaPx: 168,
        },
      ],
    }),
  );
  assert.deepEqual(overlapped.failed, ['text-not-overlapping']);
  assert.match(
    overlapped.checks.find((check) => check.id === 'text-not-overlapping')!.detail,
    /168 px/,
  );
});

test('153 a surface outside the viewport fails with the overflowing edge', () => {
  const measurement = withSurfaces(
    baseMeasurement({
      viewport: { id: 'zoom-200-720', widthPx: 1280, heightPx: 720, zoom: 2 },
      effectiveWidthPx: 640,
      effectiveHeightPx: 360,
      region: 'COMPACT',
      mediaQueries: { compact: true, large: false },
      document: { scrollWidth: 640, scrollHeight: 360, horizontalOverflow: false },
    }),
    (surfaces) =>
      surfaces.map((surface) =>
        surface.id === 'fleet' ? { ...surface, rect: rect(16, 380, 224, 96) } : surface,
      ),
  );
  const evaluation = evaluateUiQaMeasurement(measurement);
  assert.deepEqual(evaluation.failed, ['surface-inside-viewport']);
  assert.equal(evaluation.tier, 'STRESS');
  const check = evaluation.checks.find((entry) => entry.id === 'surface-inside-viewport')!;
  assert.match(check.detail, /fleet \(bottom 476 > 360\)/);
});

test('153 two non-modal surfaces overlapping is critical, a dialog is transient', () => {
  const critical = evaluateUiQaMeasurement(
    baseMeasurement({
      overlaps: [{ a: 'hud', b: 'fleet', severity: 'critical', widthPx: 12, heightPx: 40 }],
    }),
  );
  assert.deepEqual(critical.failed, ['no-critical-overlap']);
  const transient = evaluateUiQaMeasurement(
    baseMeasurement({
      overlaps: [
        { a: 'camera', b: 'notifications', severity: 'transient', widthPx: 48, heightPx: 120 },
      ],
    }),
  );
  assert.deepEqual(transient.failed, []);
});

test('153 a control without a rectangle or covered by a panel fails', () => {
  const hidden = evaluateUiQaMeasurement(
    baseMeasurement({
      controls: baseMeasurement().controls.map((control, index) =>
        index === 0 ? { ...control, visible: false, rect: null } : control,
      ),
    }),
  );
  assert.deepEqual(hidden.failed, ['controls-visible']);
  const covered = evaluateUiQaMeasurement(
    baseMeasurement({
      controls: baseMeasurement().controls.map((control, index) =>
        index === 1 ? { ...control, hitTest: false } : control,
      ),
    }),
  );
  assert.deepEqual(covered.failed, ['controls-hit-testable']);
});

test('153 essential controls outside the harness are declared, not silently dropped', () => {
  const evaluation = evaluateUiQaMeasurement(baseMeasurement());
  const check = evaluation.checks.find((entry) => entry.id === 'essentials-visible')!;
  assert.equal(check.pass, true);
  const actual = check.actual as { outsideHarness: string[] };
  assert.equal(actual.outsideHarness.length, 3);
  assert.match(actual.outsideHarness.join(' '), /pause-control/);
  const missing = evaluateUiQaMeasurement(
    baseMeasurement({
      essentials: baseMeasurement().essentials.map((essential) =>
        essential.id === 'speed-output' ? { ...essential, visible: false, rect: null } : essential,
      ),
    }),
  );
  assert.deepEqual(missing.failed, ['essentials-visible']);
});

test('153 an overflowing surface without a scrollbar fails the scroll policy', () => {
  const measurement = withSurfaces(baseMeasurement(), (surfaces) =>
    surfaces.map((surface) =>
      surface.id === 'profile' && surface.scroll !== null
        ? { ...surface, scroll: { ...surface.scroll, overflowY: 'hidden' } }
        : surface,
    ),
  );
  assert.deepEqual(failedChecks(measurement), ['scroll-policy']);
});

test('153 the tab order must reach controls and stay inside an open panel', () => {
  const cycle = evaluateUiQaMeasurement(
    baseMeasurement({
      keyboard: {
        ...baseMeasurement().keyboard,
        stops: [
          ...baseMeasurement().keyboard.stops,
          { ...baseMeasurement().keyboard.stops[0]!, order: 3 },
        ],
      },
    }),
  );
  // A trap wraps by design, so the repeated stop is recorded, not treated as an error.
  assert.deepEqual(cycle.failed, []);
  const recorded = cycle.checks.find((check) => check.id === 'tab-order')!.actual as {
    duplicates: string[];
  };
  assert.equal(recorded.duplicates.length, 1);
  const escaped = evaluateUiQaMeasurement(
    baseMeasurement({
      keyboard: {
        ...baseMeasurement().keyboard,
        stops: [
          ...baseMeasurement().keyboard.stops,
          {
            order: 3,
            descriptor: 'button.fleet-panel__row "Taxi 2"',
            surface: 'fleet',
            native: true,
            outlineStyle: 'solid',
            outlineWidthPx: 3,
            insideDialog: false,
          },
        ],
      },
    }),
  );
  assert.deepEqual(escaped.failed, ['tab-order']);
  const notOpen = evaluateUiQaMeasurement(
    baseMeasurement({
      keyboard: { ...baseMeasurement().keyboard, dialogOpenBefore: false },
    }),
  );
  assert.deepEqual(notOpen.failed, ['tab-order']);
  const nothing = evaluateUiQaMeasurement(
    baseMeasurement({ keyboard: { ...baseMeasurement().keyboard, stops: [] } }),
  );
  assert.deepEqual(nothing.failed, ['tab-order', 'focus-visible']);
});

test('153 a keyboard stop without a 3 px focus ring fails visibility', () => {
  const measurement = baseMeasurement({
    keyboard: {
      ...baseMeasurement().keyboard,
      stops: baseMeasurement().keyboard.stops.map((stop, index) =>
        index === 1 ? { ...stop, outlineStyle: 'none', outlineWidthPx: 0 } : stop,
      ),
    },
  });
  const evaluation = evaluateUiQaMeasurement(measurement);
  assert.deepEqual(evaluation.failed, ['focus-visible']);
  assert.match(
    evaluation.checks.find((check) => check.id === 'focus-visible')!.detail,
    new RegExp(`at least ${UI_QA_MIN_FOCUS_OUTLINE_PX} px`),
  );
});

test('153 Escape must close the panel and restore focus', () => {
  const kept = evaluateUiQaMeasurement(
    baseMeasurement({
      keyboard: {
        ...baseMeasurement().keyboard,
        escapeClosed: false,
        dialogOpenAfter: true,
      },
    }),
  );
  assert.deepEqual(kept.failed, ['escape-closes']);
  const lost = evaluateUiQaMeasurement(
    baseMeasurement({
      keyboard: { ...baseMeasurement().keyboard, focusRestored: false },
    }),
  );
  assert.deepEqual(lost.failed, ['escape-closes']);
  const noDialog = evaluateUiQaMeasurement(
    baseMeasurement({
      keyboard: {
        stops: baseMeasurement().keyboard.stops,
        escapeClosed: false,
        escapeReason: 'Scenariul nu are un dialog modal de închis.',
        focusRestored: false,
        dialogOpenBefore: false,
        dialogOpenAfter: false,
        trapExpected: false,
      },
    }),
  );
  assert.deepEqual(noDialog.failed, []);
});

test('153 a wrong region, a mismatched zoom or an undeclared viewport is rejected', () => {
  const wrongRegion = evaluateUiQaMeasurement(baseMeasurement({ region: 'COMPACT' }));
  assert.deepEqual(wrongRegion.failed, ['viewport-mapping']);
  const wrongZoom = evaluateUiQaMeasurement(baseMeasurement({ effectiveWidthPx: 960 }));
  assert.ok(wrongZoom.failed.includes('viewport-mapping'));
  assert.ok(wrongZoom.failed.includes('surface-inside-viewport'));
  assert.throws(
    () =>
      evaluateUiQaMeasurement(
        baseMeasurement({ viewport: { id: '800x600', widthPx: 800, heightPx: 600, zoom: 1 } }),
      ),
    /UI QA viewport is not declared: 800x600/,
  );
});

test('153 a truncated or hand-edited measurement fails closed', () => {
  assert.throws(
    () => parseUiQaMeasurement({ version: '153-ui-qa-measurement-v0' }),
    /version must be/,
  );
  assert.throws(
    () =>
      parseUiQaMeasurement({ ...baseMeasurement(), surfaces: [{ id: 'unknown', visible: true }] }),
    /unknown surface unknown/,
  );
  assert.throws(
    () =>
      parseUiQaMeasurement({
        ...baseMeasurement(),
        surfaces: [
          {
            id: 'hud',
            visible: true,
            hidden: false,
            rect: { x: 0, y: 0, width: 1 },
            scroll: null,
            rows: null,
          },
        ],
      }),
    /surfaces\[0\]\.rect\.height/,
  );
  assert.throws(
    () => parseUiQaMeasurement({ ...baseMeasurement(), clipped: 'none' }),
    /clipped must be an array/,
  );
});

function capture(
  scenario: string,
  viewport: string,
  overrides: Partial<UiQaMeasurement> = {},
): UiQaCapture {
  const viewportEntry = UI_QA_VIEWPORTS.find((entry) => entry.id === viewport)!;
  const region =
    viewportEntry.id === '1920x1080'
      ? 'LARGE'
      : viewportEntry.id === '1280x720'
        ? 'STANDARD'
        : 'COMPACT';
  const measurement = baseMeasurement({
    scenario,
    viewport: {
      id: viewport,
      widthPx: viewportEntry.widthPx,
      heightPx: viewportEntry.heightPx,
      zoom: viewportEntry.zoom,
    },
    effectiveWidthPx: Math.round(viewportEntry.widthPx / viewportEntry.zoom),
    effectiveHeightPx: Math.round(viewportEntry.heightPx / viewportEntry.zoom),
    region,
    mediaQueries: { compact: region === 'COMPACT', large: region === 'LARGE' },
    ...overrides,
  });
  return {
    screenshot: `capture-${scenario}-${viewport}.png`,
    bytes: 1024,
    measurement,
  };
}

test('153 the report separates contract failures from reported stress findings', () => {
  const report = buildUiQaReport({
    generatedBy: 'tests/ui/ui-qa.test.ts',
    command: 'npm run qa:ui',
    captures: [
      capture('hud', '1280x720', { scenario: 'hud' }),
      capture('profile', 'zoom-200-720', {
        scenario: 'profile',
        effectiveWidthPx: 640,
        effectiveHeightPx: 360,
        region: 'COMPACT',
        mediaQueries: { compact: true, large: false },
        overlaps: [],
      }),
    ],
  });
  assert.equal(report.summary.captures, 2);
  assert.equal(report.summary.contractCaptures, 1);
  assert.equal(report.summary.stressCaptures, 1);
  assert.equal(report.summary.contractPass, true);
  assert.equal(report.summary.verdict, 'PASS');
  assert.equal(report.browser, 'Chromium 156.0.8078.4');
});

test('153 a stress failure becomes a finding with reproduction steps', () => {
  const surfaces = baseMeasurement().surfaces.map((surface) =>
    surface.id === 'fleet' ? { ...surface, rect: rect(16, 380, 224, 96) } : surface,
  );
  const report = buildUiQaReport({
    generatedBy: 'tests/ui/ui-qa.test.ts',
    command: 'npm run qa:ui',
    captures: [
      capture('hud', '1280x720', { scenario: 'hud' }),
      capture('hud', 'zoom-200-720', {
        scenario: 'hud',
        surfaces,
        effectiveWidthPx: 640,
        effectiveHeightPx: 360,
        region: 'COMPACT',
        mediaQueries: { compact: true, large: false },
      }),
    ],
  });
  assert.equal(report.findings.length, 1);
  const finding = report.findings[0]!;
  assert.equal(finding.id, 'D1');
  assert.equal(finding.severity, 'MEDIUM');
  assert.equal(finding.check, 'surface-inside-viewport');
  assert.equal(finding.viewport, 'zoom-200-720');
  assert.match(finding.summary, /outside the viewport/);
  assert.equal(finding.repro.length, 4);
  assert.match(finding.repro[0]!, /npm run qa:ui -- --browser/);
  assert.equal(report.summary.verdict, 'PASS');
  assert.equal(report.summary.findings, 1);
});

test('153 a contract failure also fails the report and becomes a finding', () => {
  const report = buildUiQaReport({
    generatedBy: 'tests/ui/ui-qa.test.ts',
    command: 'npm run qa:ui',
    captures: [
      capture('hud', '1280x720', {
        scenario: 'hud',
        text: { ...baseMeasurement().text, minFontPx: 10 },
      }),
    ],
  });
  assert.equal(report.summary.contractPass, false);
  assert.equal(report.summary.verdict, 'FAIL');
  assert.equal(report.summary.contractFailed, 1);
  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0]!.tier, 'CONTRACT');
  assert.equal(report.findings[0]!.severity, 'MEDIUM');
  assert.deepEqual(report.scenarios[0]!.failed, ['text-legible']);
});

test('153 the report is deterministic and the markdown keeps the comparison and repro', () => {
  const input = {
    generatedBy: 'tests/ui/ui-qa.test.ts',
    command: 'npm run qa:ui',
    captures: [capture('hud', '1280x720'), capture('hud', '1920x1080')],
  };
  const first = buildUiQaReport(input);
  const second = buildUiQaReport(input);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  const markdown = uiQaReportMarkdown(first);
  assert.match(markdown, /## Comparația aceleiași componente la rezoluții diferite/);
  assert.match(markdown, /### hud/);
  assert.match(markdown, /\| 1280x720 \| STANDARD \|/);
  assert.match(markdown, /verdict CONTRACT \*\*PASS\*\*/);
  assert.throws(
    () => buildUiQaReport({ generatedBy: 'x', command: 'y', captures: [] }),
    /at least one capture/,
  );
});

test('153 mixed browser versions are rejected instead of merged', () => {
  assert.throws(
    () =>
      buildUiQaReport({
        generatedBy: 'x',
        command: 'y',
        captures: [
          capture('hud', '1280x720'),
          capture('hud', '1920x1080', { browser: 'Chromium 1' }),
        ],
      }),
    /mixes browser versions/,
  );
});
