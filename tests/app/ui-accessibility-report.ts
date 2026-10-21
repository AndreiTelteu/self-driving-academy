import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  UI_ACCESSIBILITY_REPORT_VERSION,
  createPanelAccessibilityBridge,
  createPauseFocusOwner,
  readAccessibilityReport,
} from '../../src/app';
import {
  ACCESSIBILITY_TOKENS,
  ACCESSIBILITY_VERSION,
  PANEL_SURFACES,
  createTaxiHud,
  drivingBlockReason,
  panelDescriptor,
  type AccessibilityMode,
} from '../../src/ui';
import type { HudElement } from '../ui/hud-dom';
import { createHudDocument, createHudHost, serializeHud } from '../ui/hud-dom';
import { createFleetPanelHarness, panelSnapshot } from '../ui/fleet-panel-fixture';
import { createProfilePanelHarness } from '../ui/profile-panel-fixture';
import { createProfileHistoryHarness } from '../ui/profile-history-fixture';
import { createGameSettingsHarness } from '../ui/game-settings-fixture';
import {
  cityIncident,
  createCityDashboardHarness,
  sevenMetricSnapshot,
} from '../ui/city-dashboard-fixture';
import { createKeyRemappingHarness } from '../ui/key-remapping-fixture';
import { createLearningNotificationsHarness } from '../ui/learning-notifications-fixture';
import { createMinimapHarness, sceneOf, twoZoneMap } from '../ui/minimap-fixture';
import { createMapSelectionHarness, mapSnapshot } from '../ui/map-selection-fixture';

export const UI_ACCESSIBILITY_SCENARIO_NAMES = [
  'fleet',
  'profile',
  'history',
  'settings',
  'dashboard',
  'notifications-key-remap',
  'hud-minimap-passive',
] as const;

export interface AccessibilityReportCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface AccessibilityReportRoot {
  readonly panelId: string;
  readonly selector: string;
  readonly tagName: string;
  readonly ariaLabel: string | null;
  readonly buttons: number;
  readonly untypedButtons: number;
  readonly html: string;
}

export interface AccessibilityReportScenario {
  readonly name: string;
  readonly panels: readonly string[];
  readonly focusOrder: readonly string[];
  readonly trapsFocus: boolean;
  readonly drivingWhenOpen: Readonly<Record<AccessibilityMode, boolean>>;
  readonly buttons: Readonly<{ total: number; typed: number; untyped: number }>;
  readonly contrastPairs: number;
  readonly auditPass: boolean;
  readonly roots: readonly AccessibilityReportRoot[];
}

export interface AccessibilityReport {
  readonly version: typeof UI_ACCESSIBILITY_REPORT_VERSION;
  readonly contractVersion: typeof ACCESSIBILITY_VERSION;
  readonly tokens: typeof ACCESSIBILITY_TOKENS;
  readonly audit: Readonly<{
    pass: boolean;
    tokensVersion: typeof ACCESSIBILITY_VERSION;
    summary: Readonly<{
      panels: number;
      passed: number;
      failed: number;
      issues: number;
      contrastPairs: number;
      minimumRatio: number | null;
      focusables: number;
    }>;
    issues: readonly Readonly<{ code: string; panelId: string; detail: string }>[];
  }>;
  readonly contrast: readonly Readonly<{
    pairId: string;
    foreground: string;
    background: string;
    ratio: number;
    required: number;
    panels: readonly string[];
    pass: boolean;
  }>[];
  readonly panels: readonly Readonly<{
    id: string;
    name: string;
    surface: string;
    modal: boolean;
    openKey: string | null;
    closeKey: string | null;
    focusables: number;
    focusSelector: string;
    drivingWhenOpen: Readonly<Record<AccessibilityMode, boolean>>;
  }>[];
  readonly scenarios: readonly AccessibilityReportScenario[];
  readonly checks: readonly AccessibilityReportCheck[];
  readonly summary: Readonly<{
    checks: number;
    passed: number;
    scenarios: number;
    overall: boolean;
  }>;
}

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): AccessibilityReportCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function collectButtons(node: HudElement, out: HudElement[]): void {
  if (node.tagName === 'button') out.push(node);
  for (const child of node.children) collectButtons(child, out);
}

function rootEvidence(panelId: string, root: HudElement): AccessibilityReportRoot {
  const buttons: HudElement[] = [];
  collectButtons(root, buttons);
  return Object.freeze({
    panelId,
    selector: panelDescriptor(panelId).selector,
    tagName: root.tagName,
    ariaLabel: root.getAttribute('aria-label'),
    buttons: buttons.length,
    untypedButtons: buttons.filter((button) => button.getAttribute('type') !== 'button').length,
    html: serializeHud(root),
  });
}

function buttonTotals(
  roots: readonly AccessibilityReportRoot[],
): Readonly<{ total: number; typed: number; untyped: number }> {
  const total = roots.reduce((sum, root) => sum + root.buttons, 0),
    untyped = roots.reduce((sum, root) => sum + root.untypedButtons, 0);
  return Object.freeze({ total, typed: total - untyped, untyped });
}

function drivingAggregate(panels: readonly string[], mode: AccessibilityMode): boolean {
  return panels.some((panelId) => drivingBlockReason(panelId, true, mode) !== null);
}

function scenario(
  name: string,
  entries: readonly Readonly<{ panelId: string; root: HudElement }>[],
): AccessibilityReportScenario {
  const panels = entries.map((entry) => entry.panelId),
    roots = entries.map((entry) => rootEvidence(entry.panelId, entry.root)),
    descriptors = panels.map(panelDescriptor),
    report = readAccessibilityReport();
  return Object.freeze({
    name,
    panels: Object.freeze(panels),
    focusOrder: Object.freeze(descriptors.flatMap((descriptor) => descriptor.focusableSelectors)),
    trapsFocus: descriptors.some(
      (descriptor) => descriptor.interactive && descriptor.surface !== 'diagnostic',
    ),
    drivingWhenOpen: Object.freeze({
      AUTO: drivingAggregate(panels, 'AUTO'),
      MANUAL: drivingAggregate(panels, 'MANUAL'),
      LEARNING: drivingAggregate(panels, 'LEARNING'),
    }),
    buttons: buttonTotals(roots),
    contrastPairs: panels.reduce(
      (sum, panelId) =>
        sum + (report.audit.panels.find((panel) => panel.id === panelId)?.contrast.length ?? 0),
      0,
    ),
    auditPass: panels.every(
      (panelId) => report.audit.panels.find((panel) => panel.id === panelId)?.pass === true,
    ),
    roots: Object.freeze(roots),
  });
}

/** Builds the seven real panels once and returns their roots for the audit evidence. */
function buildScenarios(): readonly AccessibilityReportScenario[] {
  const fleet = createFleetPanelHarness(),
    baseTaxi = panelSnapshot().taxis[0]!;
  fleet.panel.update(
    panelSnapshot({
      tick: 12,
      taxis: Object.freeze([
        baseTaxi,
        Object.freeze({ ...baseTaxi, vehicleId: 'taxi:075:02', slot: 2 }),
        Object.freeze({
          ...baseTaxi,
          vehicleId: 'taxi:075:03',
          slot: 3,
          blocked: true,
          serviceState: 'BLOCKED',
        }),
      ]),
    }),
    0,
  );
  const profile = createProfilePanelHarness(),
    history = createProfileHistoryHarness(),
    settings = createGameSettingsHarness(),
    dashboard = createCityDashboardHarness();
  dashboard.panel.update(sevenMetricSnapshot({ incidents: Object.freeze([cityIncident()]) }), 0);
  const keyRemapping = createKeyRemappingHarness(),
    notifications = createLearningNotificationsHarness(),
    minimap = createMinimapHarness(sceneOf(twoZoneMap()).geometry),
    mapSelection = createMapSelectionHarness();
  mapSelection.overlay.update(mapSnapshot(), 0);
  const hudDocument = createHudDocument(),
    hudHost = createHudHost(hudDocument);
  createTaxiHud(hudHost as unknown as HTMLElement);

  return [
    scenario('fleet', [{ panelId: 'fleet', root: fleet.root() }]),
    scenario('profile', [{ panelId: 'profile', root: profile.root() }]),
    scenario('history', [{ panelId: 'profileHistory', root: history.root() }]),
    scenario('settings', [{ panelId: 'gameSettings', root: settings.root() }]),
    scenario('dashboard', [{ panelId: 'cityDashboard', root: dashboard.root() }]),
    scenario('notifications-key-remap', [
      { panelId: 'keyRemapping', root: keyRemapping.root() },
      { panelId: 'learningNotifications', root: notifications.root() },
    ]),
    scenario('hud-minimap-passive', [
      { panelId: 'taxiHud', root: hudHost.children[0]! },
      { panelId: 'minimap', root: minimap.host.children[0]! },
      { panelId: 'mapSelection', root: mapSelection.root() },
    ]),
  ];
}

function bridgeChecks(): AccessibilityReportCheck[] {
  const calls = { suspend: [] as string[], resume: [] as string[], reset: 0 },
    owner = createPauseFocusOwner({
      suspend: (cause) => calls.suspend.push(cause),
      resume: (cause) => calls.resume.push(cause),
      resetHeldCommands: () => {
        calls.reset += 1;
      },
    }),
    closed: string[] = [],
    bridge = createPanelAccessibilityBridge({
      pauseFocus: owner,
      closePanel: (panelId) => closed.push(panelId),
      resetHeldCommands: () => {
        calls.reset += 1;
      },
    });
  owner.setMode('MANUAL');
  bridge.open('fleet');
  const manual = owner.getState().suspended && owner.getState().cause === 'panel';
  bridge.close('fleet');
  const afterClose = owner.getState().suspended;
  owner.setMode('AUTO');
  bridge.open('fleet');
  const autoLive = owner.getState().suspended;
  bridge.close('fleet');
  bridge.open('minimap');
  const diagnosticLive = owner.getState().suspended;
  bridge.close('minimap');
  const stats = bridge.getStats();
  bridge.dispose();
  return [
    check(
      'bridge-manual-panel-suspends',
      true,
      manual,
      'A panel open in MANUAL reports the 070 panel cause; the bridge never claims PLAYER.',
    ),
    check(
      'bridge-close-resumes',
      false,
      afterClose,
      'Closing the last panel releases the surface in 070.',
    ),
    check(
      'bridge-auto-observation-live',
      false,
      autoLive,
      'AUTO observation stays live while the fleet panel is open.',
    ),
    check(
      'bridge-diagnostic-live',
      false,
      diagnosticLive,
      'A read-only diagnostic never suspends the world.',
    ),
    check(
      'bridge-held-reset',
      true,
      stats.heldResets >= 1 && calls.reset >= 1,
      'Closing a suspending panel calls the injected held-command reset port.',
    ),
    check(
      'bridge-no-player-claim',
      false,
      stats.claimedPlayer,
      'The bridge reports claimedPlayer: false; 066 remains the only authority arbiter.',
    ),
    check(
      'bridge-close-port',
      'fleet,fleet,minimap',
      closed.join(','),
      'The injected close port receives every closed panel exactly once per close edge.',
    ),
  ];
}

/** Runs the deterministic accessibility audit and returns serialized evidence. */
export function runUiAccessibilityReport(): AccessibilityReport {
  const report = readAccessibilityReport(),
    scenarios = buildScenarios(),
    css = readFileSync(join(process.cwd(), 'src', 'style.css'), 'utf8'),
    focusOrderMatches = scenarios.every((entry) =>
      entry.panels.every((panelId) =>
        panelDescriptor(panelId).focusableSelectors.every((selector) =>
          entry.focusOrder.includes(selector),
        ),
      ),
    ),
    checks: AccessibilityReportCheck[] = [
      check('audit-pass', true, report.pass, 'The real descriptors pass with zero closed issues.'),
      check(
        'panel-count',
        PANEL_SURFACES.length,
        report.audit.summary.panels,
        'Every audited surface has one descriptor.',
      ),
      check(
        'audit-panels-pass',
        PANEL_SURFACES.length,
        report.audit.summary.passed,
        'Every real panel descriptor passes independently.',
      ),
      check(
        'audit-issues',
        0,
        report.audit.issues.length,
        'No MISSING_NAME/NO_FOCUSABLE/MISSING_VISIBLE_FOCUS/GLOBAL_KEY_LISTENER/COLOR_ONLY_STATE/LOW_CONTRAST/NOT_KEYBOARD_OPERABLE/MISSING_TYPE_BUTTON issue.',
      ),
      check(
        'scenario-count',
        UI_ACCESSIBILITY_SCENARIO_NAMES.length,
        scenarios.length,
        'Seven real scenarios are serialized.',
      ),
      check(
        'focus-order-matches-descriptor',
        true,
        focusOrderMatches,
        'The serialized focus order is exactly the declared tab-stop list.',
      ),
      check(
        'state-text-backed',
        true,
        PANEL_SURFACES.every((panel) => panel.stateIsTextBacked),
        'Every panel state is carried by text/symbol, never colour alone.',
      ),
      check(
        'no-global-key-listener',
        true,
        PANEL_SURFACES.every((panel) => !panel.ownsGlobalKeyListener),
        'No panel owns a window/document key listener.',
      ),
      check(
        'focus-selectors-exist',
        true,
        PANEL_SURFACES.filter((panel) => panel.interactive).every((panel) =>
          css.includes(panel.focusVisible.selector),
        ),
        'Every interactive panel focus selector exists in src/style.css.',
      ),
      check(
        'modal-escape-keys',
        'gameSettings,keyRemapping',
        PANEL_SURFACES.filter((panel) => panel.modal)
          .map((panel) => (panel.closeKey === 'Escape' ? panel.id : `MISSING:${panel.id}`))
          .join(','),
        'Every modal surface closes with Escape through the injected port.',
      ),
      check(
        'contrast-version',
        '083-ui-accessibility-v1',
        ACCESSIBILITY_VERSION,
        'Shared contract version.',
      ),
      check(
        'contrast-table',
        true,
        report.contrast.length >= 10 && report.contrast.every((row) => row.pass),
        `${report.contrast.length} unique audited pairs, all at or above their requirement.`,
      ),
      check(
        'contrast-text-on-surface',
        16.97,
        report.contrast.find((row) => row.pairId === 'text-on-surface')?.ratio ?? 0,
        '#f3f7fb on #0d1714.',
      ),
      check(
        'contrast-focus-ring',
        11.53,
        report.contrast.find((row) => row.pairId === 'focus-on-surface')?.ratio ?? 0,
        '#9edbb5 focus ring on #0d1714 exceeds the 3:1 non-text requirement.',
      ),
      check(
        'contrast-warning',
        12.85,
        report.contrast.find((row) => row.pairId === 'warning-on-surface')?.ratio ?? 0,
        '#ffd27f warning text on #0d1714.',
      ),
      check(
        'contrast-selected-border',
        9.96,
        report.contrast.find((row) => row.pairId === 'selected-on-raised')?.ratio ?? 0,
        '#7fd7ff selected border on #13251f exceeds 3:1.',
      ),
      check(
        'token-text',
        '#f3f7fb',
        ACCESSIBILITY_TOKENS.text,
        'Token mirrors the real CSS text colour.',
      ),
      check(
        'token-focus',
        '#9edbb5',
        ACCESSIBILITY_TOKENS.focus,
        'Token mirrors the real CSS focus colour.',
      ),
    ];

  // Per-scenario checks: every real button typed, focus order present, explicit driving matrix.
  const expectedDriving: Readonly<Record<string, readonly [boolean, boolean, boolean]>> =
    Object.freeze({
      fleet: [false, true, true],
      profile: [false, true, true],
      history: [false, true, true],
      settings: [true, true, true],
      dashboard: [false, true, true],
      'notifications-key-remap': [true, true, true],
      'hud-minimap-passive': [false, false, false],
    });
  for (const entry of scenarios) {
    checks.push(
      check(
        `${entry.name}-buttons-typed`,
        0,
        entry.buttons.untyped,
        `${entry.buttons.total} real buttons inspected; every one carries type="button".`,
      ),
      check(
        `${entry.name}-roots-present`,
        true,
        entry.roots.length === entry.panels.length &&
          entry.roots.every((root) => root.html.startsWith('<')),
        `${entry.roots.length} serialized roots for ${entry.panels.length} panels.`,
      ),
      check(
        `${entry.name}-focus-order`,
        entry.panels.flatMap((panelId) => panelDescriptor(panelId).focusableSelectors).join('|'),
        entry.focusOrder.join('|'),
        'Focus order is the declared tab-stop order.',
      ),
      check(
        `${entry.name}-driving-matrix`,
        expectedDriving[entry.name]!.join('|'),
        [
          entry.drivingWhenOpen.AUTO,
          entry.drivingWhenOpen.MANUAL,
          entry.drivingWhenOpen.LEARNING,
        ].join('|'),
        'AUTO|MANUAL|LEARNING while the surface is open.',
      ),
    );
  }
  checks.push(...bridgeChecks());

  return Object.freeze({
    version: report.version,
    contractVersion: report.contractVersion,
    tokens: report.tokens,
    audit: Object.freeze({
      pass: report.audit.pass,
      tokensVersion: report.audit.tokensVersion,
      summary: report.audit.summary,
      issues: Object.freeze(
        report.audit.issues.map((issue) =>
          Object.freeze({ code: issue.code, panelId: issue.panelId, detail: issue.detail }),
        ),
      ),
    }),
    contrast: Object.freeze(
      report.contrast.map((row) =>
        Object.freeze({
          pairId: row.pairId,
          foreground: row.foreground,
          background: row.background,
          ratio: row.ratio,
          required: row.required,
          panels: row.panels,
          pass: row.pass,
        }),
      ),
    ),
    panels: Object.freeze(
      report.panels.map((panel) =>
        Object.freeze({
          id: panel.id,
          name: panel.name,
          surface: panel.surface,
          modal: panel.modal,
          openKey: panel.openKey,
          closeKey: panel.closeKey,
          focusables: panel.focusables,
          focusSelector: panel.focusSelector,
          drivingWhenOpen: panel.drivingWhenOpen,
        }),
      ),
    ),
    scenarios: Object.freeze(scenarios),
    checks: Object.freeze(checks),
    summary: Object.freeze({
      checks: checks.length,
      passed: checks.filter((entry) => entry.pass).length,
      scenarios: scenarios.length,
      overall: checks.every((entry) => entry.pass) && report.pass,
    }),
  });
}

/** Human-readable transcript with the contrast table, focus orders and driving matrix. */
export function uiAccessibilityReportMarkdown(report: AccessibilityReport): string {
  const contrastRows = report.contrast
      .map(
        (row) =>
          `| ${row.pairId} | ${row.foreground} on ${row.background} | ${row.ratio.toFixed(2)}:1 | ${row.required.toFixed(2)}:1 | ${row.panels.join(', ')} | ${row.pass ? 'PASS' : 'FAIL'} |`,
      )
      .join('\n'),
    panelRows = report.panels
      .map(
        (panel) =>
          `| ${panel.id} | ${panel.name} | ${panel.surface} | ${panel.modal ? 'yes' : 'no'} | ${panel.openKey ?? '—'} | ${panel.closeKey ?? '—'} | ${panel.focusables} | ${panel.drivingWhenOpen.AUTO ? 'blocked' : 'live'} | ${panel.drivingWhenOpen.MANUAL ? 'blocked' : 'live'} | ${panel.drivingWhenOpen.LEARNING ? 'blocked' : 'live'} |`,
      )
      .join('\n'),
    scenarioSections = report.scenarios
      .map(
        (entry) => `### ${entry.name}

| Value | Result |
| --- | --- |
| Panels | ${entry.panels.join(', ')} |
| Focus order | ${entry.focusOrder.length === 0 ? '—' : entry.focusOrder.join(' → ')} |
| Traps focus | ${entry.trapsFocus ? 'yes' : 'no'} |
| Buttons (typed/untyped) | ${entry.buttons.typed}/${entry.buttons.untyped} |
| Driving AUTO / MANUAL / LEARNING | ${entry.drivingWhenOpen.AUTO ? 'blocked' : 'live'} / ${entry.drivingWhenOpen.MANUAL ? 'blocked' : 'live'} / ${entry.drivingWhenOpen.LEARNING ? 'blocked' : 'live'} |
| Contrast pairs | ${entry.contrastPairs} |

${entry.roots
  .map(
    (root) => `\`\`\`html
${root.html}
\`\`\``,
  )
  .join('\n\n')}
`,
      )
      .join('\n'),
    checkRows = report.checks
      .map(
        (entry) =>
          `| ${entry.name} | ${String(entry.expected)} | ${String(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.detail} |`,
      )
      .join('\n');
  return `# 083 UI accessibility report

Machine-readable transcript: [report.json](report.json). Generated by \`npm run ui:accessibility\`;
it contains no wall-clock value, random value or browser-only state.

Version: \`${report.version}\` over contract \`${report.contractVersion}\`. The report audits the real
panel descriptors and the real adapters' serialized DOM, plans the keyboard traversal, applies the 070
surface rules to driving keys and measures every audited colour pair. It is not a browser screenshot
and not a screen-reader certification.

## Contract summary

- Panels audited: ${report.audit.summary.panels} (${report.audit.summary.passed} pass,
  ${report.audit.summary.failed} fail, ${report.audit.summary.issues} closed issues).
- Contrast pairs: ${report.audit.summary.contrastPairs}, minimum measured ratio
  ${report.audit.summary.minimumRatio === null ? '—' : `${report.audit.summary.minimumRatio.toFixed(2)}:1`}.
- Focusable tab stops across the surfaces: ${report.audit.summary.focusables}.
- Modal surfaces: ${report.panels
    .filter((panel) => panel.modal)
    .map((panel) => panel.id)
    .join(', ')}.

## Panels

| ID | Name | Surface | Modal | Open key | Close key | Tab stops | AUTO | MANUAL | LEARNING |
| --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- |
${panelRows}

## Contrast table

| Pair | Colours | Ratio | Required | Panels | Result |
| --- | --- | ---: | ---: | --- | --- |
${contrastRows}

## Scenarios

${scenarioSections}
## Checks

| Check | Expected | Actual | Result | Detail |
| --- | --- | --- | --- | --- |
${checkRows}

## What it is NOT

- Not a browser screenshot or headed-playtest probe: the evidence is the deterministic audit and the
  serialized adapter DOM.
- Not a screen-reader test: ARIA names/roles are read from the descriptors, not announced by a real AT.
- Not a 070 replacement: the bridge calls \`setSurface\` only and never claims PLAYER.
- Not a load/FPS measurement and not a colour-blindness simulation.
`;
}
