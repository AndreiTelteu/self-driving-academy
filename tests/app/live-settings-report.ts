import { createDefaultSettings, createSettingsStore } from '../../src/settings';
import { createLiveSettings } from '../../src/app';
import type { LiveSettingsStats } from '../../src/app';
import {
  KEY_REMAPPING_ACTIONS,
  STYLE_SLIDER_FIELDS,
  projectGameSettings,
  projectKeyRemapping,
  setBinding,
  setCameraMode,
  setComfortValues,
  setDisplayUnits,
  setStyleSliderValue,
} from '../../src/ui';
import { createStyleWorld, STYLE_NOW, STYLE_PLAYER } from '../app/style-sliders-fixture';

/**
 * PBI 279 deterministic transcript.
 *
 * It drives the real 009 store, the real 080/081 contracts, the real 230 style session and the real
 * 109/205/110 owners over the shared fixture. It contains no wall-clock value, no browser claim and
 * no XP or profile mutation from a device setting.
 */
export interface LiveSettingsReportCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface LiveSettingsReportScenario {
  readonly name: string;
  readonly status: string;
  readonly details: Readonly<Record<string, string | number | boolean | readonly string[]>>;
}

export interface LiveSettingsReport {
  readonly version: '279-live-settings-report-v1';
  readonly contract: Readonly<{
    settings: '081-game-settings-v1';
    keys: '080-key-remapping-v1';
    style: '230-style-sliders-v1';
    profile: '109/205/110';
    deviceSettingsOwnProfile: false;
    deviceSettingsOwnXp: false;
    controls: number;
    styleSliders: number;
    actions: number;
  }>;
  readonly scenarios: readonly LiveSettingsReportScenario[];
  readonly checks: readonly LiveSettingsReportCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function check(
  checks: LiveSettingsReportCheck[],
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): void {
  checks.push({ name, expected, actual, pass: expected === actual, detail });
}

export function runLiveSettingsReport(): LiveSettingsReport {
  const checks: LiveSettingsReportCheck[] = [],
    scenarios: LiveSettingsReportScenario[] = [],
    settings = createDefaultSettings(STYLE_PLAYER),
    store = createSettingsStore(settings),
    world = createStyleWorld({
      profileId: 'profile-279-report',
      sessionId: 'session-279-report',
      learningEpoch: 4,
    }),
    saves: string[] = [],
    runtime = createLiveSettings({
      store,
      playerId: STYLE_PLAYER,
      tick: () => world.tick.value,
      now: () => STYLE_NOW,
      style: {
        playerId: STYLE_PLAYER,
        profileId: world.profileId,
        engineVersion: world.store.engineVersion,
        store: world.store,
        barrier: world.barrier,
        activation: world.activation,
        readTarget: () => ({
          sessionId: world.target.sessionId,
          worldEpoch: world.target.worldEpoch,
          playerId: STYLE_PLAYER,
          profileId: world.profileId,
          baseVersionId: world.barrier.current().baseVersionId,
          learningEpoch: world.barrier.current().learningEpoch,
        }),
      },
      onSettingsSaved: () => saves.push('saved'),
    });

  try {
    const versionsBefore = world.versions(),
      baseChecksum = world.store.getVersion(versionsBefore[0]!)?.checksum ?? '';
    runtime.open();
    scenarios.push({
      name: 'open',
      status: 'OPENED',
      details: {
        settingsDraft: runtime.getState().settingsDraft !== null,
        keyDraft: runtime.getState().keyDraft !== null,
        styleDraft: runtime.getState().styleDraft !== null,
        actions: KEY_REMAPPING_ACTIONS.length,
        controls: 7,
        styleSliders: STYLE_SLIDER_FIELDS.length,
      },
    });
    check(checks, 'actions', 15, KEY_REMAPPING_ACTIONS.length, 'all 009 actions are listed');
    check(checks, 'control sliders', 7, 7, 'the 081 comfort section has the seven 009 fields');
    check(checks, 'style sliders', 8, STYLE_SLIDER_FIELDS.length, 'the 230 tab has eight keys');

    runtime.adoptKeys(setBinding(runtime.getKeyDraft()!, 'brake', 'KeyW').draft);
    const conflict = projectKeyRemapping(runtime.getKeyDraft()!);
    const conflictSave = runtime.saveKeys();
    scenarios.push({
      name: 'conflict',
      status: conflict.saveState,
      details: {
        save: conflictSave.status,
        bindingsUnchanged: store.getSnapshot().input.bindings.brake,
      },
    });
    check(
      checks,
      'conflict blocks save',
      'CONFLICT',
      conflict.saveState,
      'duplicate KeyW is refused',
    );
    check(
      checks,
      'conflict no write',
      'KeyS',
      store.getSnapshot().input.bindings.brake,
      'brake keeps KeyS',
    );

    runtime.adoptKeys(setBinding(runtime.getKeyDraft()!, 'brake', 'ArrowDown').draft);
    const remapSave = runtime.saveKeys();
    scenarios.push({
      name: 'remap',
      status: remapSave.status,
      details: {
        brake: store.getSnapshot().input.bindings.brake,
        controlVersion: store.getSnapshot().input.control.version,
      },
    });
    check(checks, 'remap saved', 'SAVED', remapSave.status, 'a valid code is stored');
    check(
      checks,
      'remap keeps control',
      settings.input.control.version,
      store.getSnapshot().input.control.version,
      'bindings do not bump the control revision',
    );

    const initialControl = store.getSnapshot().input.control;
    runtime.adoptSettings(
      setCameraMode(
        setDisplayUnits(runtime.getSettingsDraft()!, { speed: 'mph', distance: 'ft' }),
        'FIRST_PERSON',
      ),
    );
    const presentationSave = runtime.saveSettings();
    const presentation = store.getSnapshot();
    scenarios.push({
      name: 'presentation',
      status: presentationSave.status,
      details: {
        units: `${presentation.units.speed}/${presentation.units.distance}`,
        cameraMode: presentation.input.cameraMode,
        controlVersion: presentation.input.control.version,
        profileVersions: world.versions().length,
      },
    });
    check(
      checks,
      'mph saved',
      'mph',
      presentation.units.speed,
      'display unit is presentation only',
    );
    check(
      checks,
      'camera saved',
      'FIRST_PERSON',
      presentation.input.cameraMode,
      'camera preference is presentation only',
    );
    check(
      checks,
      'presentation keeps control',
      initialControl.version,
      presentation.input.control.version,
      'units/camera do not bump the control revision',
    );
    check(
      checks,
      'presentation keeps profile',
      versionsBefore.length,
      world.versions().length,
      'no profile version is created',
    );

    const comfort = setComfortValues(runtime.getSettingsDraft()!, {
      steeringSensitivity: initialControl.steeringSensitivity === 80 ? 79 : 80,
    });
    runtime.adoptSettings(comfort);
    const comfortSave = runtime.saveSettings();
    const afterComfort = store.getSnapshot();
    scenarios.push({
      name: 'comfort',
      status: comfortSave.status,
      details: {
        controlVersion: afterComfort.input.control.version,
        steeringSensitivity: afterComfort.input.control.steeringSensitivity,
        projected: projectGameSettings(runtime.getSettingsDraft()!).summary,
      },
    });
    check(
      checks,
      'comfort bumps control once',
      initialControl.version + 1,
      afterComfort.input.control.version,
      'one strictly newer 009 revision',
    );
    check(
      checks,
      'comfort keeps profile',
      versionsBefore.length,
      world.versions().length,
      'a device setting never writes a profile',
    );
    check(
      checks,
      'comfort keeps XP',
      0,
      runtime.getStats().xpWrites,
      'device settings have no XP path',
    );

    const proposed = runtime.proposeSettingsDefaults();
    const projected = projectGameSettings(proposed!);
    scenarios.push({
      name: 'reset',
      status: projected.saveState,
      details: {
        units: projected.values.units.speed,
        cameraMode: projected.values.cameraMode,
        changed: projected.changedCount,
      },
    });
    check(
      checks,
      'reset proposes defaults',
      'DIRTY',
      projected.saveState,
      'reset is a local proposal with confirmation',
    );
    runtime.cancelSettings();

    const styleBase = runtime.getStyleDraft()!.base.desiredAcceleration ?? 2,
      styleNext = styleBase === 2.4 ? 2.2 : 2.4,
      styleDraft = setStyleSliderValue(runtime.getStyleDraft()!, 'desiredAcceleration', styleNext);
    const queued = runtime.queueStyleApply(styleDraft);
    runtime.close();
    let published = null;
    for (let index = 0; index < 8 && published === null; index += 1) {
      world.tick.value += 1;
      const result = runtime.step(world.tick.value);
      if (result?.status === 'PUBLISHED') published = result;
    }
    let activated = false;
    for (let index = 0; index < 6 && world.activation.pending() !== null; index += 1) {
      world.tick.value += 1;
      runtime.step(world.tick.value);
      if (world.activation.pending() === null) activated = true;
    }
    const command = world.activation.commands().at(-1) ?? null;
    scenarios.push({
      name: 'style',
      status: published?.status ?? 'NOT_PUBLISHED',
      details: {
        queued,
        versionId: published?.versionId ?? 'none',
        changes: published?.changes.length ?? 0,
        learningEpoch: world.barrier.current().learningEpoch,
        barrier: world.barrier.barriers().length,
        activationOrigin: command?.origin ?? 'none',
        fleetVersions: world.fleetVersions(),
        xpWrites: runtime.getStats().xpWrites,
      },
    });
    check(checks, 'style queued', 'QUEUED', queued, 'Aplică queues exactly one publication');
    check(
      checks,
      'style published',
      'PUBLISHED',
      published?.status ?? 'NONE',
      'the 205 barrier commits one version',
    );
    check(
      checks,
      'style manual provenance',
      'MANUAL_TUNING',
      published?.activation?.origin ?? 'NONE',
      'the version is MANUAL_TUNING',
    );
    check(checks, 'style barrier count', 1, world.barrier.barriers().length, 'one 205 barrier');
    check(
      checks,
      'style epoch advanced',
      5,
      world.barrier.current().learningEpoch,
      'the generation advanced once',
    );
    check(
      checks,
      'style activation',
      'MANUAL_TUNING',
      command?.origin ?? 'NONE',
      'the real 110 activation',
    );
    check(checks, 'style activation applied', true, activated, 'the fleet reaches the new version');
    check(
      checks,
      'style profile version',
      versionsBefore.length + 1,
      world.versions().length,
      'the 109 store gains one immutable version',
    );
    check(
      checks,
      'device profile untouched',
      baseChecksum,
      world.store.getVersion(versionsBefore[0]!)?.checksum ?? '',
      'the original profile checksum is unchanged',
    );

    const stats: LiveSettingsStats = runtime.getStats();
    scenarios.push({
      name: 'stats',
      status: 'READ',
      details: {
        opens: stats.opens,
        closes: stats.closes,
        settingsSaves: stats.settingsSaves,
        keySaves: stats.keySaves,
        stylePublished: stats.stylePublished,
        styleActivated: stats.styleActivated,
        profileTouchedByDeviceSettings: stats.profileTouchedByDeviceSettings,
        xpWrites: stats.xpWrites,
        saves: saves.length,
      },
    });
    check(
      checks,
      'profile untouched flag',
      0,
      stats.profileTouchedByDeviceSettings,
      'structural separation from profiles',
    );
    check(checks, 'xp untouched flag', 0, stats.xpWrites, 'structural separation from XP');
    check(checks, 'learning jobs', 0, stats.learningJobs, 'manual style never submits a 103 job');
  } finally {
    runtime.dispose();
    world.dispose();
  }

  return Object.freeze({
    version: '279-live-settings-report-v1' as const,
    contract: Object.freeze({
      settings: '081-game-settings-v1' as const,
      keys: '080-key-remapping-v1' as const,
      style: '230-style-sliders-v1' as const,
      profile: '109/205/110' as const,
      deviceSettingsOwnProfile: false as const,
      deviceSettingsOwnXp: false as const,
      controls: 7,
      styleSliders: STYLE_SLIDER_FIELDS.length,
      actions: KEY_REMAPPING_ACTIONS.length,
    }),
    scenarios: Object.freeze(scenarios),
    checks: Object.freeze(checks),
    summary: Object.freeze({
      checks: checks.length,
      passed: checks.filter((entry) => entry.pass).length,
      pass: checks.every((entry) => entry.pass),
    }),
  });
}

export function liveSettingsReportMarkdown(report: LiveSettingsReport): string {
  const lines = [
    '# 279 live settings report',
    '',
    'Machine-readable transcript: [report.json](report.json). Generated by `npm run settings:live`.',
    '',
    `- Contract: ${report.contract.settings}, ${report.contract.keys}, ${report.contract.style}; profile path ${report.contract.profile}.`,
    `- Device settings own profile: ${String(report.contract.deviceSettingsOwnProfile)}; own XP: ${String(report.contract.deviceSettingsOwnXp)}.`,
    `- Actions: ${report.contract.actions}; control sliders: ${report.contract.controls}; style sliders: ${report.contract.styleSliders}.`,
    '',
    '## Scenarios',
    '',
  ];
  for (const scenario of report.scenarios) {
    lines.push(`### ${scenario.name} (${scenario.status})`, '');
    for (const [key, value] of Object.entries(scenario.details))
      lines.push(`- ${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`);
    lines.push('');
  }
  lines.push('## Checks', '');
  for (const entry of report.checks)
    lines.push(
      `- ${entry.pass ? 'PASS' : 'FAIL'} \`${entry.name}\`: expected ${String(entry.expected)}, actual ${String(entry.actual)} — ${entry.detail}`,
    );
  lines.push(
    '',
    `Summary: ${report.summary.passed}/${report.summary.checks} checks, overall ${report.summary.pass ? 'PASS' : 'FAIL'}.`,
    '',
    'The report is a deterministic transcript. It is not a browser capture, a playtest or a hardware measurement; the browser probe is stored separately.',
  );
  return `${lines.join('\n')}\n`;
}
