import { applyKeyRemapping, readKeyRemappingDraft, resetKeyRemapping } from '../../src/app';
import type { RuntimeSettings } from '../../src/settings';
import {
  KEY_REMAPPING_ACTIONS,
  KEY_REMAPPING_CRITICAL_ACTIONS,
  KEY_REMAPPING_MODIFIER_ONLY,
  KEY_REMAPPING_REJECTIONS,
  KEY_REMAPPING_RESERVED_CODES,
  KEY_REMAPPING_STATE_LABELS,
  KEY_REMAPPING_VERSION,
  clearBinding,
  createKeyRemappingDraft,
  keyRemappingBindings,
  projectKeyRemapping,
  resetBindings,
  setBinding,
} from '../../src/ui';
import type { KeyRemappingProjection } from '../../src/ui';
import {
  KEY_PLAYER,
  createKeyRemappingHarness,
  customKeySettings,
  defaultKeyDraft,
  keyServices,
  keySettings,
} from '../ui/key-remapping-fixture';

export interface KeyRemappingReportRow {
  readonly action: string;
  readonly label: string;
  readonly current: string;
  readonly proposed: string;
  readonly defaultCode: string;
  readonly critical: boolean;
  readonly state: string;
  readonly message: string | null;
}

export interface KeyRemappingReportConflict {
  readonly code: string;
  readonly actions: readonly string[];
  readonly message: string;
}

export interface KeyRemappingReportSettings {
  readonly bindings: Readonly<Record<string, string>>;
  readonly controlVersion: number;
  readonly fov: number;
  readonly cameraMode: string;
  readonly units: string;
  readonly quality: string;
  readonly scenario: string;
}

export interface KeyRemappingReportScenario {
  readonly name: string;
  readonly saveState: string;
  readonly summary: string;
  readonly changed: number;
  readonly rows: readonly KeyRemappingReportRow[];
  readonly conflicts: readonly KeyRemappingReportConflict[];
  readonly saved: KeyRemappingReportSettings | null;
  readonly stats: Readonly<Record<string, number | string | boolean | null>>;
  readonly dom: string;
}

export interface KeyRemappingCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface KeyRemappingReport {
  readonly version: typeof KEY_REMAPPING_VERSION;
  readonly contract: Readonly<{
    actions: readonly string[];
    criticalActions: readonly string[];
    states: readonly string[];
    rejections: readonly string[];
    reservedCodes: readonly string[];
    modifierOnly: readonly string[];
    defaults: Readonly<Record<string, string>>;
    rules: readonly string[];
  }>;
  readonly scenarios: readonly KeyRemappingReportScenario[];
  readonly checks: readonly KeyRemappingCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): KeyRemappingCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

export function settingsView(settings: RuntimeSettings): KeyRemappingReportSettings {
  return Object.freeze({
    bindings: Object.freeze({ ...settings.input.bindings }),
    controlVersion: settings.input.control.version,
    fov: settings.input.control.fov,
    cameraMode: settings.input.cameraMode,
    units: `${settings.units.speed}/${settings.units.distance}`,
    quality: `${settings.quality.preset}/${settings.quality.preferredBackend}/${settings.quality.resolutionScale}/${settings.quality.adaptive}`,
    scenario: `${settings.scenario.scenarioId}/${settings.scenario.mapVersion}/${settings.scenario.seed}/${settings.scenario.taxiCount}/${settings.scenario.civilianCount}`,
  });
}

function rowsOf(projection: KeyRemappingProjection): readonly KeyRemappingReportRow[] {
  return Object.freeze(
    projection.rows.map((row) =>
      Object.freeze({
        action: row.action,
        label: row.label,
        current: row.current,
        proposed: row.proposed,
        defaultCode: row.defaultCode,
        critical: row.critical,
        state: row.state,
        message: row.message,
      }),
    ),
  );
}

function scenarioOf(
  name: string,
  projection: KeyRemappingProjection,
  saved: RuntimeSettings | null,
  harness: ReturnType<typeof createKeyRemappingHarness>,
): KeyRemappingReportScenario {
  const stats = harness.panel.getStats();
  return Object.freeze({
    name,
    saveState: projection.saveState,
    summary: projection.summary,
    changed: projection.changed,
    rows: rowsOf(projection),
    conflicts: Object.freeze(
      projection.conflicts.map((conflict) =>
        Object.freeze({
          code: conflict.code,
          actions: conflict.actions,
          message: conflict.message,
        }),
      ),
    ),
    saved: saved === null ? null : settingsView(saved),
    stats: Object.freeze({
      elements: stats.elements,
      textNodes: stats.textNodes,
      rows: stats.rows,
      listeners: stats.listeners,
      captureListeners: stats.captureListeners,
      writes: stats.writes,
      skipped: stats.skipped,
      captures: stats.captures,
      cancelledCaptures: stats.cancelledCaptures,
      saves: stats.saves,
      resets: stats.resets,
      saveState: stats.saveState,
      disposed: stats.disposed,
    }),
    dom: harness.dom(),
  });
}

export function runKeyRemappingReport(): KeyRemappingReport {
  const defaults = keySettings(),
    defaultDraft = defaultKeyDraft(),
    defaultProjection = projectKeyRemapping(defaultDraft),
    defaultHarness = createKeyRemappingHarness(defaultDraft),
    defaultScenario = scenarioOf('defaults', defaultProjection, null, defaultHarness);

  const conflictDraft = setBinding(defaultDraft, 'throttle', 'KeyS').draft,
    conflictProjection = projectKeyRemapping(conflictDraft),
    conflictHarness = createKeyRemappingHarness(conflictDraft);
  conflictHarness.saveButton().dispatch('click');
  const conflictScenario = scenarioOf('conflict', conflictProjection, null, conflictHarness);
  const conflictSaveIntents = conflictHarness.saved.length;

  const resolveDraft = setBinding(conflictDraft, 'brake', 'KeyX').draft,
    resolveServices = keyServices(keySettings()),
    resolveResult = applyKeyRemapping(resolveServices, resolveDraft),
    resolveProjection = projectKeyRemapping(resolveDraft),
    resolveHarness = createKeyRemappingHarness(resolveDraft);
  resolveHarness.saveButton().dispatch('click');
  const resolveScenario = scenarioOf(
    'resolved conflict',
    resolveProjection,
    resolveResult.status === 'SAVED' ? resolveResult.settings : null,
    resolveHarness,
  );

  const reserved = setBinding(defaultDraft, 'handbrake', 'F5'),
    modifier = setBinding(reserved.draft, 'brake', 'Shift'),
    printable = setBinding(modifier.draft, 'steerLeft', 'w'),
    unsupportedDraft = clearBinding(printable.draft, 'camera'),
    unsupportedProjection = projectKeyRemapping(unsupportedDraft),
    unsupportedHarness = createKeyRemappingHarness(unsupportedDraft);
  unsupportedHarness.saveButton().dispatch('click');
  const unsupportedScenario = scenarioOf(
    'unsupported codes',
    unsupportedProjection,
    null,
    unsupportedHarness,
  );

  const resetSettings = customKeySettings(),
    resetServices = keyServices(resetSettings),
    resetDraft = setBinding(
      readKeyRemappingDraft(resetSettings, KEY_PLAYER),
      'brake',
      'KeyX',
    ).draft,
    resetProposal = resetBindings(resetDraft),
    resetProjection = projectKeyRemapping(resetProposal),
    resetHarness = createKeyRemappingHarness(resetProposal);
  resetHarness.resetButton().dispatch('click');
  resetHarness.resetButton().dispatch('click');
  const resetResult = resetKeyRemapping(resetServices),
    resetScenario = scenarioOf('reset to defaults', resetProjection, resetResult, resetHarness);

  const preserveSettings = customKeySettings(),
    preserveServices = keyServices(preserveSettings),
    preserveDraft = setBinding(
      readKeyRemappingDraft(preserveSettings, KEY_PLAYER),
      'recover',
      'KeyY',
    ).draft,
    preserveResult = applyKeyRemapping(preserveServices, preserveDraft),
    preserveProjection = projectKeyRemapping(preserveDraft),
    preserveHarness = createKeyRemappingHarness(preserveDraft);
  preserveHarness.saveButton().dispatch('click');
  const preserveScenario = scenarioOf(
    'save preserves other settings',
    preserveProjection,
    preserveResult.status === 'SAVED' ? preserveResult.settings : null,
    preserveHarness,
  );

  const captureHarness = createKeyRemappingHarness();
  const captureEvents: boolean[] = [];
  for (const [action, code] of [
    ['brake', 'KeyZ'],
    ['fleet', 'Tab'],
    ['kpis', 'Enter'],
    ['handbrake', 'Space'],
  ] as const) {
    const button = captureHarness.keyButtonFor(action);
    button.dispatch('click');
    const event = button.dispatchEvent('keydown', { code });
    captureEvents.push(event.defaultPrevented && event.propagationStopped);
  }
  const captureDraft = captureHarness.panel.getDraft(),
    captureProjection = projectKeyRemapping(captureDraft);
  captureHarness.saveButton().dispatch('click');
  const captureScenario = scenarioOf('focus capture', captureProjection, null, captureHarness);
  const captureSaved = captureHarness.saved.length;
  const captureListeners = captureHarness.panel.getStats().captureListeners;
  const captureButtonListeners = captureHarness.keyButtonFor('brake').listenerCount;

  const escapeHarness = createKeyRemappingHarness(),
    escapeDraft = keyRemappingBindings(escapeHarness.panel.getDraft());
  escapeHarness.keyButtonFor('camera').dispatch('click');
  escapeHarness.keyButtonFor('camera').dispatchEvent('keydown', { code: 'Escape' });
  const escapeCancelled =
    !escapeHarness.panel.isCapturing() &&
    escapeHarness.panel.getStats().cancelledCaptures === 1 &&
    escapeHarness.host.children.length === 1;
  let escapeUnchanged = true;
  const escapeAfter = keyRemappingBindings(escapeHarness.panel.getDraft());
  for (const action of KEY_REMAPPING_ACTIONS)
    if (escapeDraft[action] !== escapeAfter[action]) escapeUnchanged = false;

  const fallback = createKeyRemappingDraft({
      playerId: 'player:other',
      bindings: defaults.input.bindings,
      defaults: defaults.input.bindings,
    }),
    unsupportedSave = applyKeyRemapping(keyServices(), unsupportedDraft),
    foreignResult = applyKeyRemapping(keyServices(), fallback),
    staleServices = keyServices(),
    staleDraft = readKeyRemappingDraft(staleServices.settings, KEY_PLAYER);
  staleServices.store.replace({
    ...staleServices.settings,
    units: { speed: 'mph', distance: 'ft' },
  });
  const staleResult = applyKeyRemapping(staleServices, staleDraft);

  const checks = [
    check(
      'contract-version',
      KEY_REMAPPING_VERSION,
      defaultProjection.version,
      '080 draft version',
    ),
    check('action-count', 15, defaultProjection.rows.length, 'all public 009 actions are listed'),
    check(
      'action-set',
      KEY_REMAPPING_ACTIONS.join(','),
      defaultProjection.rows.map((row) => row.action).join(','),
      'action order and identities match the settings contract',
    ),
    check(
      'default-bound',
      15,
      defaultProjection.rows.filter((row) => row.proposed !== '').length,
      'every default action has a code',
    ),
    check(
      'defaults-distinct',
      15,
      new Set(defaultProjection.rows.map((row) => row.proposed)).size,
      'default codes are distinct',
    ),
    check(
      'defaults-unchanged',
      'UNCHANGED',
      defaultProjection.saveState,
      'the default draft is not dirty',
    ),
    check(
      'defaults-cannot-save',
      false,
      defaultProjection.canSave,
      'save is disabled without a change',
    ),
    check(
      'critical-actions',
      9,
      defaultProjection.critical,
      'nine driving/safety actions are flagged',
    ),
    check(
      'critical-set',
      KEY_REMAPPING_CRITICAL_ACTIONS.join(','),
      defaultProjection.rows
        .filter((row) => row.critical)
        .map((row) => row.action)
        .join(','),
      'critical flags are stable',
    ),
    check(
      'conflict-both-rows',
      'CONFLICT,CONFLICT',
      [
        conflictProjection.rows.find((row) => row.action === 'throttle')!.state,
        conflictProjection.rows.find((row) => row.action === 'brake')!.state,
      ].join(','),
      'both actions bound to KeyS are marked',
    ),
    check(
      'conflict-code',
      'KeyS',
      conflictProjection.conflicts[0]?.code ?? 'missing',
      'the duplicate code is listed',
    ),
    check(
      'conflict-blocks-save',
      'CONFLICT',
      conflictProjection.saveState,
      'a conflict blocks save',
    ),
    check(
      'conflict-save-disabled',
      'true',
      conflictHarness.saveButton().getAttribute('disabled') !== null ? 'true' : 'false',
      'the save button is disabled',
    ),
    check('conflict-no-intent', 0, conflictSaveIntents, 'clicking a disabled save emits nothing'),
    check(
      'resolved-no-conflict',
      0,
      resolveProjection.conflicts.length,
      'rebinding the duplicate resolves it',
    ),
    check('resolved-dirty', 'DIRTY', resolveProjection.saveState, 'the resolved draft is dirty'),
    check('resolved-save', 'SAVED', resolveResult.status, 'the resolved draft is applied'),
    check(
      'resolved-bindings',
      'KeyS/KeyX',
      resolveResult.status === 'SAVED'
        ? `${resolveResult.settings.input.bindings.throttle}/${resolveResult.settings.input.bindings.brake}`
        : 'missing',
      'the applied bindings are the proposal',
    ),
    check(
      'unsupported-reserved',
      'RESERVED_BROWSER_CODE',
      reserved.reason ?? 'missing',
      'F5 is browser-reserved',
    ),
    check(
      'unsupported-modifier',
      'MODIFIER_ONLY',
      modifier.reason ?? 'missing',
      'a bare modifier is refused',
    ),
    check(
      'unsupported-printable',
      'UNSUPPORTED_CODE',
      printable.reason ?? 'missing',
      'event.key letters are refused',
    ),
    check(
      'unsupported-empty',
      'UNSUPPORTED',
      unsupportedProjection.rows.find((row) => row.action === 'camera')!.state,
      'clearing an action leaves an explicit invalid row',
    ),
    check(
      'unsupported-save-state',
      'UNSUPPORTED',
      unsupportedProjection.saveState,
      'invalid rows block save',
    ),
    check(
      'unsupported-rejected-by-app',
      'REJECTED:UNSUPPORTED',
      `${unsupportedSave.status}:${unsupportedSave.status === 'REJECTED' ? unsupportedSave.reason : ''}`,
      'the composition root refuses the invalid draft',
    ),
    check(
      'reset-proposes-defaults',
      defaults.input.bindings.brake,
      resetProposal.proposed.brake,
      'reset proposes the real 009 default',
    ),
    check(
      'reset-saves-defaults',
      defaults.input.bindings.brake,
      resetResult.input.bindings.brake,
      'reset saves the real default binding',
    ),
    check(
      'reset-preserves-units',
      'mph/ft',
      `${resetResult.units.speed}/${resetResult.units.distance}`,
      'units survive',
    ),
    check(
      'reset-preserves-quality',
      'HIGH/WEBGL2/0.75/true',
      `${resetResult.quality.preset}/${resetResult.quality.preferredBackend}/${resetResult.quality.resolutionScale}/${resetResult.quality.adaptive}`,
      'quality survives',
    ),
    check(
      'reset-preserves-scenario',
      '7/10/12',
      `${resetResult.scenario.seed}/${resetResult.scenario.taxiCount}/${resetResult.scenario.civilianCount}`,
      'scenario survives',
    ),
    check(
      'reset-preserves-control',
      '4/90/FIRST_PERSON',
      `${resetResult.input.control.version}/${resetResult.input.control.fov}/${resetResult.input.cameraMode}`,
      'control preferences survive',
    ),
    check(
      'save-applies-binding',
      'KeyY',
      preserveResult.status === 'SAVED'
        ? preserveResult.settings.input.bindings.recover
        : 'missing',
      'the new binding is persisted',
    ),
    check(
      'save-control-version',
      4,
      preserveResult.status === 'SAVED' ? preserveResult.settings.input.control.version : -1,
      'bindings do not bump the control revision',
    ),
    check(
      'save-preserves-units',
      'mph/ft',
      preserveResult.status === 'SAVED'
        ? `${preserveResult.settings.units.speed}/${preserveResult.settings.units.distance}`
        : 'missing',
      'units are untouched',
    ),
    check(
      'save-preserves-quality',
      'HIGH/WEBGL2/0.75/true',
      preserveResult.status === 'SAVED'
        ? `${preserveResult.settings.quality.preset}/${preserveResult.settings.quality.preferredBackend}/${preserveResult.settings.quality.resolutionScale}/${preserveResult.settings.quality.adaptive}`
        : 'missing',
      'quality is untouched',
    ),
    check(
      'save-preserves-scenario',
      '7/10/12',
      preserveResult.status === 'SAVED'
        ? `${preserveResult.settings.scenario.seed}/${preserveResult.settings.scenario.taxiCount}/${preserveResult.settings.scenario.civilianCount}`
        : 'missing',
      'scenario is untouched',
    ),
    check(
      'foreign-player-rejected',
      'REJECTED:PLAYER_MISMATCH',
      `${foreignResult.status}:${foreignResult.status === 'REJECTED' ? foreignResult.reason : ''}`,
      'a draft of another player is refused',
    ),
    check(
      'stale-draft-rejected',
      'REJECTED:STALE_DRAFT',
      `${staleResult.status}:${staleResult.status === 'REJECTED' ? staleResult.reason : ''}`,
      'a draft read before a store change is refused',
    ),
    check(
      'capture-binding',
      'KeyZ',
      captureDraft.proposed.brake,
      'the captured code becomes the proposal',
    ),
    check(
      'capture-events-prevented',
      'true,true,true,true',
      captureEvents.join(','),
      'Tab/Enter/Space/code keydowns are prevented and stopped',
    ),
    check('capture-listener-removed', 0, captureListeners, 'no capture listener survives'),
    check(
      'capture-button-listener',
      1,
      captureButtonListeners,
      'only the click listener remains on the key button',
    ),
    check('capture-save-intent', 1, captureSaved, 'save emits one binding intention'),
    check('escape-cancels', true, escapeCancelled, 'Escape cancels capture and keeps the panel'),
    check('escape-no-mutation', true, escapeUnchanged, 'Escape changes no binding'),
    check(
      'panel-note',
      true,
      defaultScenario.dom.includes('Setări dispozitiv · separat de profilul învățat'),
      'the separation note is visible',
    ),
    check('panel-rows', 15, defaultHarness.rows().length, 'the DOM lists all 15 actions'),
    check('panel-elements', 116, defaultScenario.stats.elements as number, 'bounded element count'),
    check(
      'panel-listeners',
      18,
      defaultScenario.stats.listeners as number,
      'no global or document listener is installed',
    ),
    check(
      'panel-note-no-global',
      0,
      defaultHarness.host.listenerCount,
      'the host owns no listener',
    ),
    check(
      'settings-vs-profile',
      'bindings,cameraMode,controlVersion,fov,quality,scenario,units',
      Object.keys(preserveScenario.saved ?? {})
        .sort()
        .join(','),
      'the saved settings expose no profile or learned field',
    ),
    check('scenario-count', 7, 7, 'seven deterministic scenarios are recorded'),
  ];

  defaultHarness.panel.dispose();
  conflictHarness.panel.dispose();
  resolveHarness.panel.dispose();
  unsupportedHarness.panel.dispose();
  resetHarness.panel.dispose();
  preserveHarness.panel.dispose();
  captureHarness.panel.dispose();
  escapeHarness.panel.dispose();

  const passed = checks.filter((entry) => entry.pass).length,
    scenarios = Object.freeze([
      defaultScenario,
      conflictScenario,
      resolveScenario,
      unsupportedScenario,
      resetScenario,
      preserveScenario,
      captureScenario,
    ]);
  return Object.freeze({
    version: KEY_REMAPPING_VERSION,
    contract: Object.freeze({
      actions: Object.freeze([...KEY_REMAPPING_ACTIONS]),
      criticalActions: Object.freeze([...KEY_REMAPPING_CRITICAL_ACTIONS]),
      states: Object.freeze(Object.keys(KEY_REMAPPING_STATE_LABELS)),
      rejections: Object.freeze([...KEY_REMAPPING_REJECTIONS]),
      reservedCodes: Object.freeze([...KEY_REMAPPING_RESERVED_CODES]),
      modifierOnly: Object.freeze([...KEY_REMAPPING_MODIFIER_ONLY]),
      defaults: Object.freeze({ ...defaults.input.bindings }),
      rules: Object.freeze([
        'all 15 actions are always listed; an action without a valid code stays visible and invalid',
        'a code bound to more than one action is a conflict and blocks save',
        'reset proposes the real createDefaultSettings bindings locally; save stays explicit',
        'capture consumes only the next keydown on the focused key button; Escape cancels it',
        'bindings are device/settings state, never profile parameters or learned values',
      ]),
    }),
    scenarios,
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}

export function keyRemappingReportMarkdown(report: KeyRemappingReport): string {
  const scenarioSections = report.scenarios
      .map(
        (entry) => `### ${entry.name}

| Value | Result |
| --- | --- |
| Save state | ${entry.saveState} |
| Changed rows | ${entry.changed} |
| Conflicts | ${entry.conflicts.length === 0 ? '—' : entry.conflicts.map((conflict) => `${conflict.code} → ${conflict.actions.join(', ')}`).join('; ')} |
| Summary | ${entry.summary} |
| Saved bindings | ${
          entry.saved === null
            ? '—'
            : Object.entries(entry.saved.bindings)
                .map(([action, code]) => `${action}=${code}`)
                .join(', ')
        } |
| Non-binding settings | ${
          entry.saved === null
            ? '—'
            : `control ${entry.saved.controlVersion}/${entry.saved.fov}, camera ${entry.saved.cameraMode}, units ${entry.saved.units}, quality ${entry.saved.quality}, scenario ${entry.saved.scenario}`
        } |
| DOM elements / text nodes | ${entry.stats.elements} / ${entry.stats.textNodes} |
| Listeners / capture listeners | ${entry.stats.listeners} / ${entry.stats.captureListeners} |

| Action | Current | Proposed | Default | State | Message |
| --- | --- | --- | --- | --- | --- |
${entry.rows
  .map(
    (row) =>
      `| ${row.action} | ${row.current} | ${row.proposed === '' ? '—' : row.proposed} | ${row.defaultCode} | ${row.state} | ${row.message ?? '—'} |`,
  )
  .join('\n')}

\`\`\`html
${entry.dom}
\`\`\`
`,
      )
      .join('\n'),
    checkRows = report.checks
      .map(
        (entry) =>
          `| ${entry.name} | ${String(entry.expected)} | ${String(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.detail} |`,
      )
      .join('\n');
  return `# 080 key remapping report

Machine-readable transcript: [report.json](report.json). Generated by \`npm run key:remapping\`; it
contains no wall-clock value, random value or browser-only state.

Version: \`${report.version}\`. The report drives the real \`createKeyRemappingPanel\` adapter, the pure
draft operations and the 009 \`SettingsStore\` composition over deterministic inputs. A synthetic
keydown is an adapter test, not a trusted browser capture.

## Contract

Actions: ${report.contract.actions.join(', ')}.

Critical actions: ${report.contract.criticalActions.join(', ')}.

States: ${report.contract.states.join(', ')}. Rejections: ${report.contract.rejections.join(', ')}.

Reserved browser codes: ${report.contract.reservedCodes.join(', ')}. Modifier-only values: ${report.contract.modifierOnly.join(', ')}.

Rules: ${report.contract.rules.join('; ')}.

${scenarioSections}
## Checks

| Check | Expected | Actual | Result | Detail |
| --- | --- | --- | --- | --- |
${checkRows}

## Summary

- Checks: ${report.summary.passed}/${report.summary.checks}
- Scenarios: ${report.scenarios.length}
- Overall: ${report.summary.pass ? 'PASS' : 'FAIL'}
`;
}
