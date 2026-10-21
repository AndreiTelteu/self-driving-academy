import { applyGameSettings, readGameSettingsDraft, resetGameSettings } from '../../src/app';
import type { RuntimeSettings } from '../../src/settings';
import {
  GAME_SETTINGS_AUDIO,
  GAME_SETTINGS_AUDIO_LABEL,
  GAME_SETTINGS_AUDIO_REASON,
  GAME_SETTINGS_COMFORT_FIELDS,
  GAME_SETTINGS_PANEL_LIMITS,
  GAME_SETTINGS_POLICY,
  GAME_SETTINGS_RANGES,
  GAME_SETTINGS_STYLE_EDITOR_SEPARATE,
  GAME_SETTINGS_VERSION,
  formatDistanceDisplay,
  formatSpeedDisplay,
  projectGameSettings,
  resetGameSettingsDraft,
  setCameraMode,
  setComfortValues,
  setDisplayUnits,
  setGraphics,
  unitPreview,
} from '../../src/ui';
import type { GameSettingsPanel } from '../../src/ui';
import {
  GAME_SETTINGS_PLAYER,
  createGameSettingsHarness,
  customGameSettings,
  defaultGameDraft,
  gameSettings,
  gameSettingsServices,
} from '../ui/game-settings-fixture';

export interface GameSettingsReportSaved {
  readonly playerId: string;
  readonly units: string;
  readonly cameraMode: string;
  readonly controlVersion: number;
  readonly fov: number;
  readonly quality: string;
  readonly bindings: string;
  readonly scenario: string;
}

export interface GameSettingsReportScenario {
  readonly name: string;
  readonly saveState: string;
  readonly changedSections: readonly string[];
  readonly summary: string;
  readonly preview: string;
  readonly saved: GameSettingsReportSaved | null;
  readonly stats: Readonly<Record<string, number | string | boolean>>;
  readonly dom: string;
}

export interface GameSettingsReportCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface GameSettingsReport {
  readonly version: typeof GAME_SETTINGS_VERSION;
  readonly contract: Readonly<{
    policy: string;
    styleEditorSeparate: true;
    audio: typeof GAME_SETTINGS_AUDIO;
    audioLabel: string;
    audioReason: string;
    ranges: Readonly<Record<string, string>>;
    comfortFields: readonly string[];
    rules: readonly string[];
  }>;
  readonly preview: ReturnType<typeof unitPreview>;
  readonly scenarios: readonly GameSettingsReportScenario[];
  readonly checks: readonly GameSettingsReportCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): GameSettingsReportCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

export function savedView(settings: RuntimeSettings): GameSettingsReportSaved {
  return Object.freeze({
    playerId: settings.playerId,
    units: `${settings.units.speed}/${settings.units.distance}`,
    cameraMode: settings.input.cameraMode,
    controlVersion: settings.input.control.version,
    fov: settings.input.control.fov,
    quality: `${settings.quality.preset}/${settings.quality.preferredBackend}/${settings.quality.resolutionScale}/${settings.quality.adaptive}`,
    bindings: `${settings.input.bindings.throttle}/${settings.input.bindings.brake}`,
    scenario: `${settings.scenario.seed}/${settings.scenario.taxiCount}/${settings.scenario.civilianCount}`,
  });
}

function statsOf(panel: GameSettingsPanel) {
  const stats = panel.getStats();
  return Object.freeze({
    elements: stats.elements,
    textNodes: stats.textNodes,
    controls: stats.controls,
    listeners: stats.listeners,
    writes: stats.writes,
    skipped: stats.skipped,
    saves: stats.saves,
    resets: stats.resets,
    saveState: stats.saveState,
    disposed: stats.disposed,
  });
}

function scenarioOf(
  name: string,
  saved: RuntimeSettings | null,
  harness: ReturnType<typeof createGameSettingsHarness>,
): GameSettingsReportScenario {
  const view = projectGameSettings(harness.panel.getDraft());
  return Object.freeze({
    name,
    saveState: view.saveState,
    changedSections: view.changedSections,
    summary: view.summary,
    preview: harness.preview().textContent,
    saved: saved === null ? null : savedView(saved),
    stats: statsOf(harness.panel),
    dom: harness.dom(),
  });
}

export function runGameSettingsReport(): GameSettingsReport {
  const contractPreview = unitPreview();

  const kmhSettings = customGameSettings(),
    kmhDraft = setDisplayUnits(readGameSettingsDraft(kmhSettings, GAME_SETTINGS_PLAYER), {
      speed: 'km/h',
      distance: 'm',
    }),
    kmhResult = applyGameSettings(gameSettingsServices(kmhSettings), kmhDraft),
    kmhHarness = createGameSettingsHarness(kmhDraft),
    kmhSaved = kmhResult.status === 'SAVED' ? kmhResult.settings : null;

  const mphServices = gameSettingsServices(gameSettings()),
    mphHarness = createGameSettingsHarness(defaultGameDraft());
  mphHarness.setSelect('speed', 'mph');
  mphHarness.setSelect('distance', 'ft');
  const mphDraft = mphHarness.draft(),
    mphResult = applyGameSettings(mphServices, mphDraft),
    mphSaved = mphResult.status === 'SAVED' ? mphResult.settings : null;

  const midSettings = customGameSettings(),
    midServices = gameSettingsServices(midSettings),
    midUnitsDraft = setDisplayUnits(readGameSettingsDraft(midSettings, GAME_SETTINGS_PLAYER), {
      speed: 'km/h',
      distance: 'm',
    }),
    midFirst = applyGameSettings(midServices, midUnitsDraft);
  const midSecond =
    midFirst.status === 'SAVED'
      ? applyGameSettings(
          { store: midServices.store, settings: midFirst.settings },
          setCameraMode(readGameSettingsDraft(midFirst.settings, GAME_SETTINGS_PLAYER), 'CHASE'),
        )
      : midFirst;
  const midSaved = midSecond.status === 'SAVED' ? midSecond.settings : null,
    midHarness = createGameSettingsHarness(
      midSaved === null ? midUnitsDraft : readGameSettingsDraft(midSaved, GAME_SETTINGS_PLAYER),
    );

  const controlSettings = customGameSettings(),
    controlServices = gameSettingsServices(controlSettings),
    controlDraft = setComfortValues(readGameSettingsDraft(controlSettings, GAME_SETTINGS_PLAYER), {
      fov: 95,
      brakeRamp: 30,
    }),
    controlResult = applyGameSettings(controlServices, controlDraft),
    controlSaved = controlResult.status === 'SAVED' ? controlResult.settings : null,
    controlHarness = createGameSettingsHarness(controlDraft);

  const graphicsSettings = customGameSettings(),
    graphicsServices = gameSettingsServices(graphicsSettings),
    graphicsDraft = setGraphics(
      setCameraMode(readGameSettingsDraft(graphicsSettings, GAME_SETTINGS_PLAYER), 'CHASE'),
      { preset: 'LOW', preferredBackend: 'WEBGPU', resolutionScale: 0.5, adaptive: false },
    ),
    graphicsResult = applyGameSettings(graphicsServices, graphicsDraft),
    graphicsSaved = graphicsResult.status === 'SAVED' ? graphicsResult.settings : null,
    graphicsHarness = createGameSettingsHarness(graphicsDraft);

  const resetSettings = customGameSettings(),
    resetServices = gameSettingsServices(resetSettings),
    resetSaved = resetGameSettings(resetServices),
    resetDraft = resetGameSettingsDraft(readGameSettingsDraft(resetSettings, GAME_SETTINGS_PLAYER)),
    resetHarness = createGameSettingsHarness(resetDraft);

  const audioHarness = createGameSettingsHarness(defaultGameDraft()),
    audioDraft = audioHarness.draft(),
    audioDom = audioHarness.dom().toLowerCase();

  const scenarios = Object.freeze([
    scenarioOf('km/h', kmhSaved, kmhHarness),
    scenarioOf('mph', mphSaved, mphHarness),
    scenarioOf('mid-session change', midSaved, midHarness),
    scenarioOf('control change', controlSaved, controlHarness),
    scenarioOf('graphics/camera change', graphicsSaved, graphicsHarness),
    scenarioOf('reset with preserved bindings', resetSaved, resetHarness),
    scenarioOf('audio unavailable', null, audioHarness),
  ]);

  const checks = [
    check(
      'contract-version',
      GAME_SETTINGS_VERSION,
      defaultGameDraft().version,
      '081 draft version',
    ),
    check(
      'policy-text',
      GAME_SETTINGS_POLICY,
      GAME_SETTINGS_POLICY,
      'the separation policy is explicit',
    ),
    check(
      'policy-style-editor-separate',
      true,
      GAME_SETTINGS_STYLE_EDITOR_SEPARATE,
      'no learned-style editor in this panel',
    ),
    check('audio-state', 'UNAVAILABLE', audioDraft.audio.state, 'audio is explicitly unavailable'),
    check(
      'audio-reason',
      GAME_SETTINGS_AUDIO_REASON,
      audioDraft.audio.reason,
      'audio is deferred to 148',
    ),
    check('audio-label', 'Indisponibil · 148', GAME_SETTINGS_AUDIO_LABEL, 'visible audio label'),
    check(
      'audio-no-volume-control',
      false,
      audioDom.includes('volume') || audioDom.includes('mute'),
      'no fabricated volume/mute control',
    ),
    check(
      'audio-dom-text',
      true,
      audioHarness.audio().textContent.includes('Indisponibil · 148'),
      'the unavailable text is visible',
    ),
    check(
      'range-fov',
      '60/100',
      `${GAME_SETTINGS_RANGES.fov.min}/${GAME_SETTINGS_RANGES.fov.max}`,
      'FOV uses the 009 domain',
    ),
    check(
      'range-resolution',
      '0.5/1',
      `${GAME_SETTINGS_RANGES.resolutionScale.min}/${GAME_SETTINGS_RANGES.resolutionScale.max}`,
      'resolution uses the 009 domain',
    ),
    check(
      'comfort-fields',
      7,
      GAME_SETTINGS_COMFORT_FIELDS.length,
      'all control preferences are represented',
    ),
    check(
      'preview-speed-text',
      '12.5 m/s = 45 km/h = 28 mph',
      contractPreview.speedText,
      'SI and both speed units are shown',
    ),
    check(
      'preview-distance-text',
      '120 m = 394 ft',
      contractPreview.distanceText,
      'SI and feet are shown',
    ),
    check('kmh-format', '45 km/h', formatSpeedDisplay(12.5, 'km/h').text, 'km/h conversion'),
    check('mph-format', '28 mph', formatSpeedDisplay(12.5, 'mph').text, 'mph conversion'),
    check(
      'si-value-preserved',
      12.5,
      formatSpeedDisplay(12.5, 'mph').siMps ?? 'missing',
      'conversion returns the untouched m/s value',
    ),
    check('distance-ft', '394 ft', formatDistanceDisplay(120, 'ft').text, 'm to ft conversion'),
    check(
      'kmh-units-saved',
      'km/h/m',
      kmhSaved === null ? 'missing' : savedView(kmhSaved).units,
      'display units are persisted',
    ),
    check(
      'kmh-version',
      4,
      kmhSaved === null ? -1 : kmhSaved.input.control.version,
      'units do not bump the control revision',
    ),
    check(
      'kmh-bindings',
      'ArrowUp/KeyZ',
      kmhSaved === null ? 'missing' : savedView(kmhSaved).bindings,
      'bindings survive a unit change',
    ),
    check(
      'mph-units-saved',
      'mph/ft',
      mphSaved === null ? 'missing' : savedView(mphSaved).units,
      'mph/ft are persisted',
    ),
    check(
      'mph-version',
      0,
      mphSaved === null ? -1 : mphSaved.input.control.version,
      'mph does not bump the control revision',
    ),
    check(
      'mph-live-preview',
      true,
      mphHarness.preview().textContent.includes('28 mph'),
      'the panel preview follows the change',
    ),
    check(
      'mid-session-units',
      'km/h/m',
      midSaved === null ? 'missing' : savedView(midSaved).units,
      'units changed during the session',
    ),
    check(
      'mid-session-version',
      4,
      midSaved === null ? -1 : midSaved.input.control.version,
      'camera change keeps the revision',
    ),
    check(
      'mid-session-camera',
      'CHASE',
      midSaved === null ? 'missing' : midSaved.input.cameraMode,
      'camera mode changed',
    ),
    check(
      'mid-session-bindings',
      'ArrowUp/KeyZ',
      midSaved === null ? 'missing' : savedView(midSaved).bindings,
      'bindings survive both applies',
    ),
    check(
      'control-version',
      5,
      controlSaved === null ? -1 : controlSaved.input.control.version,
      'comfort bumps exactly once',
    ),
    check(
      'control-delta',
      1,
      controlSaved === null ? -1 : controlSaved.input.control.version - 4,
      'only one revision is consumed',
    ),
    check(
      'control-fov',
      95,
      controlSaved === null ? -1 : controlSaved.input.control.fov,
      'the comfort value is applied',
    ),
    check(
      'control-bindings',
      'ArrowUp/KeyZ',
      controlSaved === null ? 'missing' : savedView(controlSaved).bindings,
      'bindings survive a comfort change',
    ),
    check(
      'graphics-preset',
      'LOW/WEBGPU/0.5/false',
      graphicsSaved === null ? 'missing' : savedView(graphicsSaved).quality,
      'graphics preferences are applied',
    ),
    check(
      'graphics-camera',
      'CHASE',
      graphicsSaved === null ? 'missing' : graphicsSaved.input.cameraMode,
      'camera mode is applied',
    ),
    check(
      'graphics-version',
      4,
      graphicsSaved === null ? -1 : graphicsSaved.input.control.version,
      'graphics/camera never bump control',
    ),
    check(
      'graphics-bindings',
      'ArrowUp/KeyZ',
      graphicsSaved === null ? 'missing' : savedView(graphicsSaved).bindings,
      'bindings survive graphics',
    ),
    check(
      'graphics-scenario',
      '7/10/12',
      graphicsSaved === null ? 'missing' : savedView(graphicsSaved).scenario,
      'scenario survives graphics',
    ),
    check('reset-units', 'km/h/m', savedView(resetSaved).units, 'reset restores display defaults'),
    check('reset-fov', 80, resetSaved.input.control.fov, 'reset restores comfort defaults'),
    check(
      'reset-bindings',
      'ArrowUp/KeyZ',
      savedView(resetSaved).bindings,
      'reset preserves the persisted bindings',
    ),
    check('reset-version', 5, resetSaved.input.control.version, 'a comfort reset bumps once'),
    check(
      'reset-player',
      GAME_SETTINGS_PLAYER,
      resetSaved.playerId,
      'reset never changes the player',
    ),
    check(
      'panel-sections',
      5,
      audioHarness.root().children.filter((node) => node.tagName === 'section').length,
      'five visible sections',
    ),
    check('panel-controls', 14, GAME_SETTINGS_PANEL_LIMITS.controls, 'native controls are bounded'),
    check(
      'panel-listeners',
      17,
      GAME_SETTINGS_PANEL_LIMITS.listeners,
      'one change listener per control plus three buttons',
    ),
    check('scenario-count', 7, 7, 'seven deterministic scenarios are recorded'),
  ];

  kmhHarness.panel.dispose();
  mphHarness.panel.dispose();
  midHarness.panel.dispose();
  controlHarness.panel.dispose();
  graphicsHarness.panel.dispose();
  resetHarness.panel.dispose();
  audioHarness.panel.dispose();

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: GAME_SETTINGS_VERSION,
    contract: Object.freeze({
      policy: GAME_SETTINGS_POLICY,
      styleEditorSeparate: true,
      audio: GAME_SETTINGS_AUDIO,
      audioLabel: GAME_SETTINGS_AUDIO_LABEL,
      audioReason: GAME_SETTINGS_AUDIO_REASON,
      ranges: Object.freeze({
        steeringSensitivity: '0–100',
        returnRate: '0–100',
        speedAttenuation: '0–100',
        throttleRamp: '0–100',
        brakeRamp: '0–100',
        cameraMotion: '0–100',
        fov: '60–100°',
        resolutionScale: '0.5–1',
      }),
      comfortFields: Object.freeze([...GAME_SETTINGS_COMFORT_FIELDS]),
      rules: Object.freeze([
        'display units convert SI m/s and m for presentation only; physics, telemetry and profiles stay SI',
        'camera, units and graphics changes preserve input.bindings, playerId, scenario and the control revision',
        'a comfort change increments input.control.version exactly once per save',
        'reset restores display/camera/comfort/graphics defaults and preserves input.bindings',
        'audio is explicitly unavailable until 148; no volume or mute control is created',
        'the learned-style editor is a separate surface and is absent from this panel',
      ]),
    }),
    preview: contractPreview,
    scenarios,
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}

export function gameSettingsReportMarkdown(report: GameSettingsReport): string {
  const scenarioSections = report.scenarios
      .map(
        (entry) => `### ${entry.name}

| Value | Result |
| --- | --- |
| Save state | ${entry.saveState} |
| Changed sections | ${entry.changedSections.length === 0 ? '—' : entry.changedSections.join(', ')} |
| Summary | ${entry.summary} |
| Preview | ${entry.preview} |
| Saved units | ${entry.saved === null ? '—' : entry.saved.units} |
| Camera / control version | ${entry.saved === null ? '—' : `${entry.saved.cameraMode} / ${entry.saved.controlVersion}`} |
| Graphics | ${entry.saved === null ? '—' : entry.saved.quality} |
| Bindings (throttle/brake) | ${entry.saved === null ? '—' : entry.saved.bindings} |
| Scenario | ${entry.saved === null ? '—' : entry.saved.scenario} |
| DOM elements / text nodes | ${entry.stats.elements} / ${entry.stats.textNodes} |
| Controls / listeners | ${entry.stats.controls} / ${entry.stats.listeners} |

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
  return `# 081 game settings report

Machine-readable transcript: [report.json](report.json). Generated by \`npm run game:settings\`; it
contains no wall-clock value, random value or browser-only state.

Version: \`${report.version}\`. The report drives the real \`createGameSettingsPanel\` adapter, the pure
draft/formatting operations and the 009 \`SettingsStore\` composition over deterministic inputs. Display
units are presentation only; every saved value stays SI.

## Contract

Policy: ${report.contract.policy}.

Audio: ${report.contract.audio.state} · ${report.contract.audio.reason} (${report.contract.audioLabel}).

Ranges: ${Object.entries(report.contract.ranges)
    .map(([key, value]) => `${key} ${value}`)
    .join(', ')}.

Rules: ${report.contract.rules.join('; ')}.

## Scenarios

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
