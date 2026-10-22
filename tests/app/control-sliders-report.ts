import {
  CONTROL_SLIDERS_SESSION_VERSION,
  createControlSlidersSession,
  createPauseFocusOwner,
} from '../../src/app';
import {
  createDefaultSettings,
  createSettingsStore,
  getControlPreferencesVersion,
  KEYBOARD_MAPPING,
  type ControlPreferences,
  type RuntimeSettings,
} from '../../src/settings';
import { createKeyboardFilter, vehicleClass } from '../../src/vehicles';
import { mechanicalCapabilities } from '../../src/telemetry';
import type { InterventionTarget } from '../../src/telemetry';
import { VehicleCameraController } from '../../src/rendering/vehicle-camera';
import type { CameraPreferences, CameraTarget } from '../../src/rendering/vehicle-camera';
import {
  ACCESSIBILITY_TOKENS,
  CONTROL_SLIDER_ENDS,
  CONTROL_SLIDER_FIELDS,
  CONTROL_SLIDER_HINTS,
  CONTROL_SLIDER_PRESETS,
  CONTROL_SLIDER_PRESET_VALUES,
  CONTROL_SLIDER_RANGES,
  CONTROL_SLIDERS_LAYOUTS,
  CONTROL_SLIDERS_PANEL_LIMITS,
  CONTROL_SLIDERS_POLICY,
  CONTROL_SLIDERS_VERSION,
  CONTROL_SLIDERS_WRITE_HZ,
  contrastRatio,
  controlSlidersLayout,
  projectControlSliders,
  setControlSliderValue,
  requiredContrast,
  type ControlSliderField,
} from '../../src/ui';
import { segmentFixture } from '../telemetry/manual-segments-fixture';
import {
  controlSlidersDraft,
  createControlSlidersHarness,
  customControlSlidersSettings,
} from '../ui/control-sliders-fixture';

export interface ControlSlidersReportCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface ControlSlidersReportScenario {
  readonly name: string;
  readonly saveState: string;
  readonly activePreset: string | null;
  readonly changedFields: readonly string[];
  readonly summary: string;
  readonly values: string;
  readonly stats: Readonly<Record<string, number | string | boolean>>;
}

export interface ControlSlidersReportSaved {
  readonly playerId: string;
  readonly controlVersion: number;
  readonly values: string;
  readonly cameraMode: string;
  readonly bindings: string;
  readonly scenario: string;
}

export interface ControlSlidersReport {
  readonly version: typeof CONTROL_SLIDERS_VERSION;
  readonly contract: Readonly<{
    policy: string;
    fields: readonly string[];
    ranges: Readonly<Record<string, string>>;
    presets: Readonly<Record<string, Readonly<Record<string, number>>>>;
    ends: Readonly<Record<string, string>>;
    hints: readonly string[];
    writeHz: number;
    writeIntervalMs: number;
    keyboard: readonly string[];
    layout: Readonly<Record<string, string | number | boolean>>;
    contrast: readonly Readonly<{ pair: string; ratio: number; required: number; pass: boolean }>[];
  }>;
  readonly scenarios: readonly ControlSlidersReportScenario[];
  readonly applied: ControlSlidersReportSaved | null;
  readonly telemetry: Readonly<{
    closedReason: string | null;
    closedVersion: string;
    openedVersion: string;
    learningEpochUnchanged: boolean;
    changeReason: string;
    changeTick: number;
    operationId: string;
  }>;
  readonly checks: readonly ControlSlidersReportCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): ControlSlidersReportCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

const PLAYER = 'player';
const VERSION = 4;

function targetFor(version: number, playerId = PLAYER): InterventionTarget {
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI' as const,
    sessionId: '229-report',
    worldEpoch: 1,
    version: '069-intervention-target-v1' as const,
    playerId,
    profileId: 'profile',
    baseVersionId: 'style-v1',
    learningEpoch: 2,
    controlPreferencesVersion: `["${playerId}","025-keyboard-v1",${version}]`,
    engineVersion: 'engine',
    mapVersion: 'map',
    inputType: 'KEYBOARD' as const,
    learningEligible: true,
  });
}

function valuesText(control: Readonly<Record<ControlSliderField, number>>): string {
  return CONTROL_SLIDER_FIELDS.map((field) => `${field}=${control[field]}`).join(',');
}

function scenarioOf(
  name: string,
  harness: ReturnType<typeof createControlSlidersHarness>,
): ControlSlidersReportScenario {
  const view = projectControlSliders(harness.panel.getDraft()),
    stats = harness.panel.getStats();
  return Object.freeze({
    name,
    saveState: view.saveState,
    activePreset: view.activePreset,
    changedFields: view.changedFields,
    summary: view.summary,
    values: valuesText(view.values),
    stats: Object.freeze({
      controls: stats.controls,
      writes: stats.writes,
      renders: stats.renders,
      skipped: stats.skipped,
      inputEvents: stats.inputEvents,
      throttledReads: stats.throttledReads,
      changes: stats.changes,
      presetsUsed: stats.presetsUsed,
      applies: stats.applies,
      cancels: stats.cancels,
      resets: stats.resets,
      listeners: stats.listeners,
      globalListeners: stats.globalListeners,
    }),
  });
}

function savedView(settings: RuntimeSettings): ControlSlidersReportSaved {
  return Object.freeze({
    playerId: settings.playerId,
    controlVersion: settings.input.control.version,
    values: valuesText(settings.input.control),
    cameraMode: settings.input.cameraMode,
    bindings: `${settings.input.bindings.throttle}/${settings.input.bindings.steerRight}`,
    scenario: `${settings.scenario.seed}/${settings.scenario.taxiCount}/${settings.scenario.civilianCount}`,
  });
}

function extremes(values: 'min' | 'max'): ControlPreferences {
  const base = createDefaultSettings(PLAYER, VERSION).input.control;
  return Object.freeze({
    ...base,
    steeringSensitivity: values === 'min' ? 0 : 100,
    returnRate: values === 'min' ? 0 : 100,
    speedAttenuation: values === 'min' ? 0 : 100,
    throttleRamp: values === 'min' ? 0 : 100,
    brakeRamp: values === 'min' ? 0 : 100,
    cameraMotion: values === 'min' ? 0 : 100,
    fov: values === 'min' ? 60 : 100,
  });
}

export function runControlSlidersReport(): ControlSlidersReport {
  let clock = 0;

  // One harness per scenario so the panel ids and the DOM order stay deterministic.
  const defaultHarness = createControlSlidersHarness(controlSlidersDraft(), { now: () => clock }),
    presetHarness = createControlSlidersHarness(controlSlidersDraft(), { now: () => clock }),
    minHarness = createControlSlidersHarness(controlSlidersDraft(), { now: () => clock }),
    maxHarness = createControlSlidersHarness(controlSlidersDraft(), { now: () => clock }),
    invalidHarness = createControlSlidersHarness(controlSlidersDraft(), { now: () => clock }),
    cancelHarness = createControlSlidersHarness(controlSlidersDraft(), { now: () => clock }),
    resetHarness = createControlSlidersHarness(controlSlidersDraft(), { now: () => clock }),
    writeHarness = createControlSlidersHarness(controlSlidersDraft(), { now: () => clock });

  presetHarness.click(presetHarness.preset('DIRECT'));
  for (const field of CONTROL_SLIDER_FIELDS) {
    minHarness.panel.setDraft(
      setControlSliderValue(minHarness.panel.getDraft(), field, extremes('min')[field]),
    );
    maxHarness.panel.setDraft(
      setControlSliderValue(maxHarness.panel.getDraft(), field, extremes('max')[field]),
    );
  }
  invalidHarness.panel.setDraft(setControlSliderValue(invalidHarness.panel.getDraft(), 'fov', 120));
  cancelHarness.setRange('brakeRamp', 80);
  cancelHarness.control('brakeRamp').dispatch('change');
  cancelHarness.click(cancelHarness.cancelButton());
  resetHarness.click(resetHarness.resetButton());
  resetHarness.click(resetHarness.resetButton());

  const writeStart = writeHarness.panel.getStats().writes;
  for (let index = 0; index < 60; index += 1) {
    clock += 16;
    writeHarness.setRange('throttleRamp', 30 + index);
  }
  const writeStats = writeHarness.panel.getStats(),
    writeSeconds = (60 * 16) / 1000,
    writeDelta = writeStats.writes - writeStart;

  // Session composition: real 009 store, real 070 owner, fake clock-free ticks.
  const sessionSettings = customControlSlidersSettings(),
    store = createSettingsStore(sessionSettings),
    pauseCalls: string[] = [];
  let held = 0;
  const pauseFocus = createPauseFocusOwner({
      suspend: (cause) => pauseCalls.push(`suspend:${cause}`),
      resume: (cause) => pauseCalls.push(`resume:${cause}`),
      resetHeldCommands: () => {
        held += 1;
      },
    }),
    session = createControlSlidersSession({
      store,
      readSettings: () => store.getSnapshot(),
      pauseFocus,
      resetHeldCommands: () => {
        held += 1;
      },
      readTarget: () => targetFor(VERSION, sessionSettings.playerId),
    });
  session.open();
  session.observeTick(9);
  session.setValue('fov', 96);
  const queued = session.queueApply(),
    sameTick = session.applyAtTick(9),
    applied = session.applyAtTick(10);
  const appliedSettings = applied.settings,
    appliedView = appliedSettings === null ? null : savedView(appliedSettings);

  // 069 segment split through the real lifecycle.
  const segmentSettings = createDefaultSettings('player', 3),
    segmentStore = createSettingsStore(segmentSettings),
    holder: { current: ReturnType<typeof createControlSlidersSession> | null } = { current: null },
    segment = segmentFixture({
      preparedTarget: (operationId) => holder.current?.preparedTarget(operationId) ?? null,
    }),
    oldSegment = segment.apply('LEARNING').active!;
  holder.current = createControlSlidersSession({
    store: segmentStore,
    readSettings: () => segmentStore.getSnapshot(),
    pauseFocus: createPauseFocusOwner({ suspend: () => {}, resume: () => {} }),
    resetHeldCommands: () => {},
    readTarget: () => segment.target(),
  });
  const segmentSession = holder.current;
  segmentSession.open();
  segmentSession.observeTick(1);
  segmentSession.setValue('steeringSensitivity', 80);
  segmentSession.queueApply();
  const segmentApplied = segmentSession.applyAtTick(2),
    segmentView =
      segmentApplied.change === null
        ? null
        : segment.apply('LEARNING', 'CONTROL_PREFERENCES_CHANGE', null, segmentApplied.change),
    closed = segmentView === null ? null : segment.store.port.read(oldSegment.segmentId),
    opened =
      segmentView === null || segmentView.active === null
        ? null
        : segment.store.port.read(segmentView.active.segmentId);

  // Extremes and mechanics on both classes.
  const mechanicsBefore = (['sedan', 'compact'] as const).map((classId) =>
      mechanicalCapabilities(classId),
    ),
    context = Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      sessionId: '229-report-extremes',
      worldEpoch: 1,
    }),
    finite = { sedan: true, compact: true };
  for (const [index, classId] of (['sedan', 'compact'] as const).entries()) {
    for (const values of ['min', 'max'] as const) {
      const filter = createKeyboardFilter(context, `taxi-${classId}`, extremes(values), 0);
      filter.setAction('throttle', true);
      filter.setAction('steerRight', true);
      let tick = 0;
      for (const speedMps of [0, 40]) {
        for (let step = 0; step < 120; step += 1) {
          tick += 1;
          const frame = filter.step({ tick, dtSeconds: 1 / KEYBOARD_MAPPING.hz, speedMps });
          if (
            !Number.isFinite(frame.command.steering) ||
            frame.command.steering < -1 ||
            frame.command.steering > 1 ||
            frame.command.throttle < 0 ||
            frame.command.throttle > 1 ||
            Math.abs(frame.command.steering) > frame.steeringFactor + 1e-9
          )
            finite[classId] = false;
        }
      }
      filter.dispose();
    }
    if (JSON.stringify(mechanicalCapabilities(classId)) !== JSON.stringify(mechanicsBefore[index]))
      finite[classId] = false;
  }

  // Camera extremes.
  const cameraTarget: CameraTarget = Object.freeze({
      entityId: 'taxi-1',
      incarnation: 'inc-1',
      transform: Object.freeze({
        positionM: Object.freeze({ x: 0, y: 0, z: 0 }),
        rotationQuaternion: Object.freeze({ x: 0, y: 0, z: 0, w: 1 }),
      }),
      speedMps: 12,
      driverEyeM: Object.freeze({ x: 0, y: 1.2, z: 0.2 }),
    }),
    camera = (preferences: CameraPreferences, stable = false) => {
      const controller = new VehicleCameraController(preferences);
      controller.select('taxi-1');
      const first = controller.update(cameraTarget, 1 / 60),
        second = stable ? controller.update(cameraTarget, 1 / 60) : null;
      return { first, second };
    },
    narrowCamera = camera({ mode: 'FIRST_PERSON', fovDegrees: 60, motion: 0, distanceM: 5 }),
    wideCamera = camera({ mode: 'FIRST_PERSON', fovDegrees: 100, motion: 100, distanceM: 5 }),
    chaseCamera = camera({ mode: 'CHASE', fovDegrees: 80, motion: 0, distanceM: 5 }, true),
    cameraFinite = [narrowCamera.first, wideCamera.first, chaseCamera.first].every(
      (pose) =>
        pose !== null &&
        [pose.positionM, pose.lookAtM, pose.up].every((point) =>
          [point.x, point.y, point.z].every((value) => Number.isFinite(value)),
        ) &&
        pose.fovRadians >= Math.PI / 3 - 1e-9 &&
        pose.fovRadians <= (100 * Math.PI) / 180 + 1e-9,
    ),
    chaseStable =
      chaseCamera.first !== null &&
      chaseCamera.second !== null &&
      JSON.stringify(chaseCamera.first.positionM) === JSON.stringify(chaseCamera.second.positionM);

  const layout1280 = controlSlidersLayout({ widthPx: 1280, heightPx: 720, zoom: 1 }),
    layout1920 = CONTROL_SLIDERS_LAYOUTS.find((entry) => entry.id === '1920x1080')!.layout,
    layoutZoom = CONTROL_SLIDERS_LAYOUTS.find((entry) => entry.id === 'zoom-150')!.layout,
    contrast = [
      {
        pair: 'text-on-surface',
        ratio: contrastRatio(ACCESSIBILITY_TOKENS.text, ACCESSIBILITY_TOKENS.surface),
        required: requiredContrast(14, 400),
      },
      {
        pair: 'muted-on-surface',
        ratio: contrastRatio(ACCESSIBILITY_TOKENS.textMuted, ACCESSIBILITY_TOKENS.surface),
        required: requiredContrast(12, 400),
      },
      {
        pair: 'strong-on-raised',
        ratio: contrastRatio(ACCESSIBILITY_TOKENS.textStrong, ACCESSIBILITY_TOKENS.surfaceRaised),
        required: requiredContrast(14, 400),
      },
      {
        pair: 'focus-on-surface',
        ratio: contrastRatio(ACCESSIBILITY_TOKENS.focus, ACCESSIBILITY_TOKENS.surface),
        required: requiredContrast(0, 400),
      },
      {
        pair: 'warning-on-surface',
        ratio: contrastRatio(ACCESSIBILITY_TOKENS.warning, ACCESSIBILITY_TOKENS.surface),
        required: requiredContrast(12, 400),
      },
    ].map((entry) => Object.freeze({ ...entry, pass: entry.ratio >= entry.required }));

  const scenarios = Object.freeze([
    scenarioOf('default', defaultHarness),
    scenarioOf('preset DIRECT', presetHarness),
    scenarioOf('extreme min', minHarness),
    scenarioOf('extreme max', maxHarness),
    scenarioOf('invalid fov 120', invalidHarness),
    scenarioOf('cancel', cancelHarness),
    scenarioOf('reset (confirmed)', resetHarness),
    scenarioOf('60 input events at 16 ms', writeHarness),
  ]);

  const checks = [
    check('version', CONTROL_SLIDERS_VERSION, defaultHarness.view().version, '229 draft version'),
    check(
      'policy',
      CONTROL_SLIDERS_POLICY,
      defaultHarness.view().policy.text,
      'the policy is explicit and declared once',
    ),
    check('fields', 7, CONTROL_SLIDER_FIELDS.length, 'seven 009 control fields'),
    check(
      'fov-range',
      '60/100',
      `${CONTROL_SLIDER_RANGES.fov.min}/${CONTROL_SLIDER_RANGES.fov.max}`,
      'FOV uses the 009 domain',
    ),
    check(
      'slider-range',
      '0/100',
      `${CONTROL_SLIDER_RANGES.steeringSensitivity.min}/${CONTROL_SLIDER_RANGES.steeringSensitivity.max}`,
      'the six 0–100 sliders use the 009 domain',
    ),
    check('presets', 3, CONTROL_SLIDER_PRESETS.length, 'Accesibil / Echilibrat / Direct'),
    check(
      'presets-in-domain',
      true,
      CONTROL_SLIDER_PRESETS.every((preset) =>
        CONTROL_SLIDER_FIELDS.every((field) => {
          const value = CONTROL_SLIDER_PRESET_VALUES[preset].values[field],
            range = CONTROL_SLIDER_RANGES[field];
          return value >= range.min && value <= range.max;
        }),
      ),
      'no preset leaves the 009 domains',
    ),
    check(
      'ends',
      14,
      CONTROL_SLIDER_FIELDS.filter(
        (field) =>
          CONTROL_SLIDER_ENDS[field].min.length > 0 && CONTROL_SLIDER_ENDS[field].max.length > 0,
      ).length * 2,
      'every slider has two simple ends',
    ),
    check(
      'hints',
      7,
      CONTROL_SLIDER_FIELDS.filter((field) => CONTROL_SLIDER_HINTS[field].endsWith('.')).length,
      'one plain sentence per slider',
    ),
    check('write-hz', 10, CONTROL_SLIDERS_WRITE_HZ, 'read-out write ceiling'),
    check(
      'panel-controls',
      16,
      CONTROL_SLIDERS_PANEL_LIMITS.controls,
      'two tabs, three presets, seven sliders, four buttons',
    ),
    check(
      'panel-listeners',
      22,
      CONTROL_SLIDERS_PANEL_LIMITS.listeners,
      'two listeners per slider plus presets, buttons and the panel key handler',
    ),
    check(
      'global-listeners',
      0,
      defaultHarness.panel.getStats().globalListeners,
      'no listener on window/document',
    ),
    check('layout-1280-region', 'STANDARD', layout1280.region, '1280×720 is the standard band'),
    check('layout-1280-fits', true, layout1280.fits, 'the popup fits with the declared caps'),
    check(
      'layout-1280-scrolls',
      true,
      layout1280.scrolls,
      'the slider list scrolls while the footer stays fixed',
    ),
    check(
      'layout-1280-visible-rows',
      4,
      layout1280.visibleRows,
      'four slider rows are visible before scrolling',
    ),
    check('layout-1920-region', 'LARGE', layout1920.region, '1920×1080 is the large band'),
    check(
      'layout-150-zoom',
      true,
      layoutZoom.region === 'COMPACT' && layoutZoom.fits,
      '150% zoom keeps two rows and a fixed footer',
    ),
    check(
      'default-unchanged',
      'UNCHANGED',
      scenarios[0]?.saveState ?? 'missing',
      'the initial draft equals the saved preferences',
    ),
    check(
      'preset-direct',
      valuesText(CONTROL_SLIDER_PRESET_VALUES.DIRECT.values),
      scenarios[1]?.values ?? 'missing',
      'DIRECT proposes all seven values',
    ),
    check(
      'extreme-min',
      valuesText(extremes('min')),
      scenarios[2]?.values ?? 'missing',
      'all minima',
    ),
    check(
      'extreme-max',
      valuesText(extremes('max')),
      scenarios[3]?.values ?? 'missing',
      'all maxima',
    ),
    check(
      'invalid-reported',
      'INVALID',
      scenarios[4]?.saveState ?? 'missing',
      'an out-of-range value is reported, never clamped',
    ),
    check(
      'cancel-reverts',
      'UNCHANGED',
      scenarios[5]?.saveState ?? 'missing',
      'Anulează returns to the saved preferences',
    ),
    check(
      'reset-proposes',
      'UNCHANGED',
      scenarios[6]?.saveState ?? 'missing',
      'reset needs confirmation and proposes the 009 defaults',
    ),
    check(
      'write-budget',
      true,
      writeStats.throttledReads / writeSeconds <= CONTROL_SLIDERS_WRITE_HZ,
      `${writeStats.throttledReads} read-outs in ${writeSeconds}s (${writeDelta} DOM writes)`,
    ),
    check(
      'drag-commits-once',
      true,
      writeStats.changes <= 1 && writeStats.inputEvents === 60,
      'one draft revision after the gesture',
    ),
    check('queue', 'QUEUED', queued, 'Aplică queues one application'),
    check('same-tick', 'NOT_DUE', sameTick.status, 'never applied inside the current tick'),
    check('applied', 'APPLIED', applied.status, 'applied at the next tick'),
    check(
      'applied-version',
      VERSION + 1,
      appliedView?.controlVersion ?? -1,
      'exactly one new control revision',
    ),
    check('applied-fov', 96, appliedSettings?.input.control.fov ?? -1, 'the slider value is saved'),
    check(
      'applied-bindings',
      'ArrowUp/KeyD',
      appliedView?.bindings ?? 'missing',
      'key bindings survive the apply',
    ),
    check(
      'applied-scenario',
      '7/10/12',
      appliedView?.scenario ?? 'missing',
      'the scenario survives the apply',
    ),
    check(
      'telemetry-version',
      true,
      applied.change?.target.controlPreferencesVersion ===
        (appliedSettings === null ? 'missing' : getControlPreferencesVersion(appliedSettings)),
      'the segment target carries the new controlPreferencesVersion',
    ),
    check(
      'telemetry-epoch',
      2,
      applied.change?.target.learningEpoch ?? -1,
      'preferences never bump the learning epoch',
    ),
    check(
      'segment-close-reason',
      'CONTROL_PREFERENCES_CHANGE',
      closed?.closeReason ?? 'missing',
      'the old segment closes with the preferences reason',
    ),
    check(
      'segment-version-split',
      true,
      closed !== null &&
        opened !== null &&
        closed.controlPreferencesVersion !== opened.controlPreferencesVersion,
      'the old segment keeps its version and the new one gets the new version',
    ),
    check(
      'segment-opens-at-tick',
      2,
      opened?.startTick ?? -1,
      'the new segment starts at the applying tick',
    ),
    check(
      'segment-learning-epoch',
      true,
      closed !== null && opened !== null && closed.learningEpoch === opened.learningEpoch,
      'only the control version changes',
    ),
    check(
      'pause-menu',
      'suspend:menu',
      pauseCalls[0] ?? 'missing',
      'the popup opens the 070 menu surface',
    ),
    check('held-released', 1, held, 'held driving commands are released when the popup opens'),
    check(
      'resume-on-close',
      'resume:menu',
      (() => {
        session.close();
        return pauseCalls.at(-1) ?? 'missing';
      })(),
      'closing the popup resumes the clock',
    ),
    check(
      'sedan-extremes',
      true,
      finite.sedan,
      'commands stay finite and inside the envelope on the sedan',
    ),
    check(
      'compact-extremes',
      true,
      finite.compact,
      'commands stay finite and inside the envelope on the compact',
    ),
    check(
      'mechanics-unchanged',
      true,
      JSON.stringify(mechanicalCapabilities('sedan')) === JSON.stringify(mechanicsBefore[0]) &&
        JSON.stringify(mechanicalCapabilities('compact')) === JSON.stringify(mechanicsBefore[1]),
      'control preferences never change mass, power, brake or grip',
    ),
    check(
      'vehicle-class-frozen',
      true,
      Object.isFrozen(vehicleClass('sedan')) && Object.isFrozen(vehicleClass('compact')),
      '023 class definitions stay immutable',
    ),
    check('camera-extremes', true, cameraFinite, 'FOV 60/100 and motion 0/100 stay finite'),
    check('camera-stable', true, chaseStable, 'motion 0 keeps the chase camera stable'),
    check(
      'contrast',
      true,
      contrast.every((entry) => entry.pass),
      'every measured pair meets WCAG AA',
    ),
    check(
      'session-ownership',
      false,
      session.getStats().changesDrivingProfile ||
        session.getStats().changesVehicleMechanics ||
        session.getStats().changesLearnedAi,
      'the session owns no profile, mechanics or AI',
    ),
    check(
      'session-version',
      CONTROL_SLIDERS_SESSION_VERSION,
      session.getStats().version,
      'session contract version',
    ),
  ];

  for (const harness of [
    defaultHarness,
    presetHarness,
    minHarness,
    maxHarness,
    invalidHarness,
    cancelHarness,
    resetHarness,
    writeHarness,
  ])
    harness.panel.dispose();
  session.dispose();
  segmentSession.dispose();

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: CONTROL_SLIDERS_VERSION,
    contract: Object.freeze({
      policy: CONTROL_SLIDERS_POLICY,
      fields: Object.freeze([...CONTROL_SLIDER_FIELDS]),
      ranges: Object.freeze(
        Object.fromEntries(
          CONTROL_SLIDER_FIELDS.map((field: ControlSliderField) => [
            field,
            `${CONTROL_SLIDER_RANGES[field].min}–${CONTROL_SLIDER_RANGES[field].max}`,
          ]),
        ),
      ),
      presets: Object.freeze(
        Object.fromEntries(
          CONTROL_SLIDER_PRESETS.map((preset) => [
            preset,
            Object.freeze({ ...CONTROL_SLIDER_PRESET_VALUES[preset].values }),
          ]),
        ),
      ),
      ends: Object.freeze(
        Object.fromEntries(
          CONTROL_SLIDER_FIELDS.map((field) => [
            field,
            `${CONTROL_SLIDER_ENDS[field].min}–${CONTROL_SLIDER_ENDS[field].max}`,
          ]),
        ),
      ),
      hints: Object.freeze(CONTROL_SLIDER_FIELDS.map((field) => CONTROL_SLIDER_HINTS[field])),
      writeHz: CONTROL_SLIDERS_WRITE_HZ,
      writeIntervalMs: 1000 / CONTROL_SLIDERS_WRITE_HZ,
      keyboard: Object.freeze([
        'ArrowLeft/ArrowRight step one unit',
        'ArrowDown/ArrowUp step one unit',
        'PageDown/PageUp step ten units',
        'Home/End jump to the domain ends',
      ]),
      layout: Object.freeze({
        region: layout1280.region,
        widthPx: layout1280.widthPx,
        maxHeightPx: layout1280.maxHeightPx,
        listMaxHeightPx: layout1280.listMaxHeightPx,
        visibleRows: layout1280.visibleRows,
        totalRows: layout1280.totalRows,
        scrolls: layout1280.scrolls,
      }),
      contrast: Object.freeze(contrast),
    }),
    scenarios,
    applied: appliedView,
    telemetry: Object.freeze({
      closedReason: closed?.closeReason ?? null,
      closedVersion: closed?.controlPreferencesVersion ?? 'missing',
      openedVersion: opened?.controlPreferencesVersion ?? 'missing',
      learningEpochUnchanged:
        closed !== null && opened !== null && closed.learningEpoch === opened.learningEpoch,
      changeReason: applied.change?.reason ?? 'missing',
      changeTick: applied.change?.tick ?? -1,
      operationId: applied.change?.operationId ?? 'missing',
    }),
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}

export function controlSlidersReportMarkdown(report: ControlSlidersReport): string {
  const scenarioSections = report.scenarios
      .map(
        (entry) => `### ${entry.name}

| Value | Result |
| --- | --- |
| Save state | ${entry.saveState} |
| Active preset | ${entry.activePreset ?? '—'} |
| Changed fields | ${entry.changedFields.length === 0 ? '—' : entry.changedFields.join(', ')} |
| Summary | ${entry.summary} |
| Values | ${entry.values} |
| Controls / listeners | ${entry.stats.controls} / ${entry.stats.listeners} |
| Writes / renders / skipped | ${entry.stats.writes} / ${entry.stats.renders} / ${entry.stats.skipped} |
`,
      )
      .join('\n'),
    checkRows = report.checks
      .map(
        (entry) =>
          `| ${entry.name} | ${String(entry.expected)} | ${String(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.detail} |`,
      )
      .join('\n'),
    contrastRows = report.contract.contrast
      .map(
        (entry) =>
          `| ${entry.pair} | ${entry.ratio}:1 | ${entry.required}:1 | ${entry.pass ? 'PASS' : 'FAIL'} |`,
      )
      .join('\n');
  return `# 229 control and comfort sliders report

Machine-readable transcript: [report.json](report.json). Generated by \`npm run ui:control-sliders\`; it
contains no wall-clock value, random value or browser-only state.

Version: \`${report.version}\`. The report drives the real \`createControlSlidersPanel\` adapter, the pure
draft/preset/layout operations, the 009 settings store, the 025 keyboard filter, the 023 class
definitions and the 069 telemetry lifecycle over deterministic inputs. Only the read-out throttling
uses an injected 16 ms clock.

## Contract

Policy: ${report.contract.policy}.

Fields: ${report.contract.fields.join(', ')}.

Ranges: ${Object.entries(report.contract.ranges)
    .map(([key, value]) => `${key} ${value}`)
    .join(', ')}.

Ends: ${Object.entries(report.contract.ends)
    .map(([key, value]) => `${key} ${value}`)
    .join(', ')}.

Write ceiling: ${report.contract.writeHz} Hz (${report.contract.writeIntervalMs.toFixed(0)} ms).

Keyboard: ${report.contract.keyboard.join('; ')}.

Layout at 1280×720: ${report.contract.layout.widthPx}×${report.contract.layout.maxHeightPx} px,
${report.contract.layout.visibleRows}/${report.contract.layout.totalRows} rows visible,
list scrolls: ${String(report.contract.layout.scrolls)}.

### Contrast

| Pair | Measured | Required | Result |
| --- | --- | --- | --- |
${contrastRows}

## Applied settings

${report.applied === null ? '—' : `Player ${report.applied.playerId}, control revision ${report.applied.controlVersion}, ${report.applied.values}; bindings ${report.applied.bindings}; scenario ${report.applied.scenario}.`}

## Telemetry split

Closed segment: ${report.telemetry.closedReason ?? '—'} with \`${report.telemetry.closedVersion}\`.
Opened segment: \`${report.telemetry.openedVersion}\`; learning epoch unchanged:
${String(report.telemetry.learningEpochUnchanged)}. Change \`${report.telemetry.changeReason}\` at tick
${report.telemetry.changeTick} (operation \`${report.telemetry.operationId}\`).

## Scenarios

${scenarioSections}
## Checks

| Check | Expected | Actual | Result | Detail |
| --- | --- | --- | --- | --- |
${checkRows}

## Summary

- Checks: ${report.summary.passed}/${report.summary.checks}
- Overall: ${report.summary.pass ? 'PASS' : 'FAIL'}
`;
}
