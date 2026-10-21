import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FEET_PER_METER,
  GAME_SETTINGS_AUDIO,
  GAME_SETTINGS_AUDIO_LABEL,
  GAME_SETTINGS_AUDIO_REASON,
  GAME_SETTINGS_CAMERA_LABELS,
  GAME_SETTINGS_COMFORT_FIELDS,
  GAME_SETTINGS_PANEL_LIMITS,
  GAME_SETTINGS_POLICY,
  GAME_SETTINGS_RANGES,
  GAME_SETTINGS_STYLE_EDITOR_SEPARATE,
  GAME_SETTINGS_VERSION,
  formatDistanceDisplay,
  formatSpeedDisplay,
  gameSettingsRangeIssues,
  gameSettingsRuntimeCandidate,
  parseGameSettingsDraft,
  projectGameSettings,
  resetGameSettingsDraft,
  revertGameSettingsDraft,
  setCameraMode,
  setComfortValues,
  setDisplayUnits,
  setGraphics,
  unitPreview,
} from '../../src/ui';
import { parseRuntimeSettings } from '../../src/settings';
import type { HudElement } from './hud-dom';
import {
  GAME_SETTINGS_PLAYER,
  createGameSettingsHarness,
  customGameDraft,
  customGameSettings,
  defaultGameDraft,
  gameSettings,
} from './game-settings-fixture';

function countElements(node: HudElement): number {
  let total = 1;
  for (const child of node.children) total += countElements(child);
  return total;
}

test('081 contract: policy, explicit unavailable audio and the 009 domains', () => {
  assert.equal(GAME_SETTINGS_VERSION, '081-game-settings-v1');
  assert.equal(
    GAME_SETTINGS_POLICY,
    'Setări dispozitiv · nu modifică profilul învățat, AI-ul sau stilul flotei',
  );
  assert.equal(GAME_SETTINGS_STYLE_EDITOR_SEPARATE, true);
  assert.deepEqual(GAME_SETTINGS_AUDIO, {
    state: 'UNAVAILABLE',
    reason: GAME_SETTINGS_AUDIO_REASON,
  });
  assert.equal(GAME_SETTINGS_AUDIO_LABEL, 'Indisponibil · 148');
  assert.equal(GAME_SETTINGS_RANGES.steeringSensitivity.min, 0);
  assert.equal(GAME_SETTINGS_RANGES.steeringSensitivity.max, 100);
  assert.equal(GAME_SETTINGS_RANGES.fov.min, 60);
  assert.equal(GAME_SETTINGS_RANGES.fov.max, 100);
  assert.equal(GAME_SETTINGS_RANGES.resolutionScale.min, 0.5);
  assert.equal(GAME_SETTINGS_RANGES.resolutionScale.max, 1);
  const draft = defaultGameDraft();
  assert.throws(
    () =>
      parseGameSettingsDraft({
        ...draft,
        audio: { ...GAME_SETTINGS_AUDIO, volume: 0.5 },
      }),
    /fields/,
  );
  assert.throws(
    () =>
      parseGameSettingsDraft({
        ...draft,
        proposed: { ...draft.proposed, units: { speed: 'kmh' } },
      }),
    /distance|fields|unit/,
  );
});

test('081 speed conversion is display-only, deterministic and keeps the SI value', () => {
  const kmh = formatSpeedDisplay(12.5, 'km/h'),
    mph = formatSpeedDisplay(12.5, 'mph'),
    zero = formatSpeedDisplay(0, 'mph'),
    invalid = formatSpeedDisplay(-1, 'km/h');
  assert.deepEqual([kmh.value, kmh.number, kmh.siMps, kmh.text], ['45', 45, 12.5, '45 km/h']);
  assert.deepEqual([mph.value, mph.number, mph.siMps, mph.text], ['28', 28, 12.5, '28 mph']);
  assert.equal(zero.value, '0');
  assert.equal(invalid.value, '—');
  assert.equal(invalid.siMps, null);
  const draft = defaultGameDraft(),
    before = JSON.stringify(draft);
  formatSpeedDisplay(30, 'mph');
  formatSpeedDisplay(30, 'km/h');
  assert.equal(JSON.stringify(draft), before, 'formatting mutates no draft field');
  assert.equal(draft.proposed.units.speed, 'km/h');
});

test('081 distance conversion: metres, kilometres and feet stay deterministic', () => {
  assert.equal(formatDistanceDisplay(120, 'm').text, '120 m');
  assert.equal(formatDistanceDisplay(120, 'ft').text, '394 ft');
  assert.equal(formatDistanceDisplay(1500, 'm').text, '1.5 km');
  assert.equal(formatDistanceDisplay(1500, 'ft').number, Math.round(1500 * FEET_PER_METER));
  assert.equal(formatDistanceDisplay(0, 'ft').text, '0 ft');
  assert.equal(formatDistanceDisplay(Number.NaN, 'm').value, '—');
  assert.equal(formatDistanceDisplay(120, 'ft').siM, 120);
});

test('081 unit preview shows SI and both speed units exactly', () => {
  const preview = unitPreview();
  assert.equal(preview.speedText, '12.5 m/s = 45 km/h = 28 mph');
  assert.equal(preview.distanceText, '120 m = 394 ft');
  assert.equal(preview.siSpeed, '12.5 m/s');
  assert.ok(preview.text.includes('12.5 m/s = 45 km/h = 28 mph'));
  assert.ok(preview.text.includes('120 m = 394 ft'));
  assert.equal(unitPreview(10, 30).speedText, '10 m/s = 36 km/h = 22 mph');
  assert.equal(unitPreview(10, 30).distanceText, '30 m = 98 ft');
});

test('081 a draft read from real settings starts unchanged', () => {
  const settings = customGameSettings(),
    draft = customGameDraft(),
    view = projectGameSettings(draft);
  assert.equal(draft.playerId, GAME_SETTINGS_PLAYER);
  assert.deepEqual(draft.saved, draft.proposed);
  assert.equal(draft.saved.comfort.version, 4);
  assert.equal(draft.saved.comfort.mappingVersion, '025-keyboard-v1');
  assert.equal(draft.defaults.comfort.version, 4);
  assert.equal(draft.defaults.comfort.mappingVersion, '025-keyboard-v1');
  assert.equal(draft.defaults.units.speed, 'km/h');
  assert.equal(draft.defaults.cameraMode, 'CHASE');
  assert.equal(draft.defaults.graphics.preset, 'MEDIUM');
  assert.equal(view.saveState, 'UNCHANGED');
  assert.equal(view.canSave, false);
  assert.equal(view.changedCount, 0);
  assert.deepEqual(view.changedSections, []);
  assert.equal(view.policy.text, GAME_SETTINGS_POLICY);
  assert.equal(view.policy.styleEditorSeparate, true);
  assert.equal(view.policy.simulationUnits, 'SI');
  assert.equal(view.audio.state, 'UNAVAILABLE');
  assert.equal(settings.units.speed, 'mph');
});

test('081 display units are dirty, section-flagged and never touch the control record', () => {
  const draft = customGameDraft(),
    changed = setDisplayUnits(draft, { speed: 'km/h', distance: 'm' }),
    view = projectGameSettings(changed);
  assert.equal(view.saveState, 'DIRTY');
  assert.equal(view.canSave, true);
  assert.equal(view.changedCount, 1);
  assert.deepEqual(view.changedSections, ['units']);
  assert.equal(view.values.units.speed, 'km/h');
  assert.equal(view.values.comfort.version, 4);
  assert.equal(view.values.comfort.fov, 90);
  assert.equal(view.controlVersionBump, 0);
  assert.match(view.summary, /unități/i);
  assert.ok(view.preview.speedText.includes('45 km/h'));
});

test('081 comfort edits flag only comfort and keep the panel revision untouched', () => {
  const draft = customGameDraft(),
    changed = setComfortValues(draft, { fov: 95, brakeRamp: 30 }),
    view = projectGameSettings(changed);
  assert.equal(view.changed.comfort, true);
  assert.equal(view.changed.units, false);
  assert.equal(view.changed.camera, false);
  assert.equal(view.changed.graphics, false);
  assert.equal(view.controlVersionBump, 1);
  assert.equal(view.values.comfort.fov, 95);
  assert.equal(view.values.comfort.version, 4, 'the panel never bumps the revision');
  assert.equal(view.saveState, 'DIRTY');
  assert.equal(gameSettingsRangeIssues(view.values).length, 0);
});

test('081 out-of-range comfort or resolution values make the draft invalid', () => {
  const fovDraft = setComfortValues(customGameDraft(), { fov: 120 }),
    fovView = projectGameSettings(fovDraft),
    scaleDraft = setGraphics(customGameDraft(), { resolutionScale: 0.4 }),
    scaleView = projectGameSettings(scaleDraft);
  assert.equal(fovDraft.proposed.comfort.fov, 120, 'the invalid value is reported, not clamped');
  assert.equal(fovView.saveState, 'INVALID');
  assert.equal(fovView.canSave, false);
  assert.equal(fovView.issues.length, 1);
  assert.equal(fovView.issues[0]!.field, 'FOV');
  assert.match(fovView.issues[0]!.message, /60 și 100/);
  assert.match(fovView.summary, /blocat/i);
  assert.equal(scaleView.saveState, 'INVALID');
  assert.equal(scaleView.issues[0]!.field, 'RESOLUTION_SCALE');
  assert.equal(projectGameSettings(setComfortValues(fovDraft, { fov: 80 })).saveState, 'DIRTY');
});

test('081 camera and graphics changes leave the other sections untouched', () => {
  const camera = setCameraMode(customGameDraft(), 'CHASE'),
    cameraView = projectGameSettings(camera);
  assert.equal(cameraView.values.cameraMode, 'CHASE');
  assert.equal(cameraView.values.units.speed, 'mph');
  assert.equal(cameraView.controlVersionBump, 0);
  const graphics = setGraphics(camera, {
      preset: 'LOW',
      preferredBackend: 'WEBGL2',
      resolutionScale: 0.5,
      adaptive: false,
    }),
    view = projectGameSettings(graphics);
  assert.equal(view.changed.graphics, true);
  assert.equal(view.changed.camera, true);
  assert.equal(view.changed.comfort, false);
  assert.equal(view.values.graphics.resolutionScale, 0.5);
  assert.equal(view.values.comfort.steeringSensitivity, 65);
  assert.equal(view.controlVersionBump, 0);
  assert.match(view.summary, /Cameră, Grafică/);
  assert.equal(GAME_SETTINGS_CAMERA_LABELS.CHASE, 'Din spate');
});

test('081 reset proposes real defaults and revert restores the persisted sections', () => {
  const draft = customGameDraft(),
    reset = resetGameSettingsDraft(draft),
    view = projectGameSettings(reset);
  assert.equal(view.values.units.speed, 'km/h');
  assert.equal(view.values.units.distance, 'm');
  assert.equal(view.values.cameraMode, 'CHASE');
  assert.equal(view.values.comfort.fov, 80);
  assert.equal(view.values.comfort.steeringSensitivity, 50);
  assert.equal(view.values.comfort.cameraMotion, 50);
  assert.equal(view.values.comfort.version, 4);
  assert.equal(view.values.graphics.preset, 'MEDIUM');
  assert.equal(view.values.graphics.resolutionScale, 1);
  assert.equal(view.values.graphics.adaptive, false);
  assert.equal(view.saveState, 'DIRTY');
  assert.equal(view.changedCount, 4);
  const reverted = projectGameSettings(revertGameSettingsDraft(reset));
  assert.equal(reverted.saveState, 'UNCHANGED');
  assert.deepEqual(reverted.values, draft.proposed);
});

test('081 candidate round-trips to a valid RuntimeSettings shape without a revision bump', () => {
  const settings = customGameSettings(),
    draft = setCameraMode(
      setDisplayUnits(setComfortValues(customGameDraft(), { fov: 95 }), {
        speed: 'km/h',
        distance: 'm',
      }),
      'CHASE',
    ),
    candidate = parseRuntimeSettings(gameSettingsRuntimeCandidate(draft, settings));
  assert.equal(candidate.playerId, GAME_SETTINGS_PLAYER);
  assert.deepEqual(candidate.input.bindings, settings.input.bindings);
  assert.deepEqual(candidate.scenario, settings.scenario);
  assert.equal(candidate.units.speed, 'km/h');
  assert.equal(candidate.units.distance, 'm');
  assert.equal(candidate.quality.preset, 'HIGH');
  assert.equal(candidate.input.cameraMode, 'CHASE');
  assert.equal(candidate.input.control.fov, 95);
  assert.equal(candidate.input.control.version, 4, 'the composition root owns the bump');
  assert.equal(candidate.input.control.mappingVersion, '025-keyboard-v1');
  assert.ok(Object.isFrozen(candidate.input.bindings));
});

test('081 panel builds every native section once with an unavailable audio row', () => {
  const harness = createGameSettingsHarness(),
    dom = harness.dom();
  assert.equal(harness.root().getAttribute('aria-label'), 'Setări joc');
  for (const name of ['units', 'camera', 'comfort', 'graphics', 'audio'])
    assert.equal(harness.section(name).getAttribute('data-section'), name);
  assert.equal(harness.speedSelect().tagName, 'select');
  assert.equal(harness.distanceSelect().tagName, 'select');
  assert.equal(harness.cameraSelect().tagName, 'select');
  assert.equal(harness.presetSelect().tagName, 'select');
  assert.equal(harness.backendSelect().tagName, 'select');
  for (const field of GAME_SETTINGS_COMFORT_FIELDS) {
    assert.equal(harness.comfortRange(field).getAttribute('type'), 'range');
    assert.equal(harness.comfortRange(field).getAttribute('min'), field === 'fov' ? '60' : '0');
    assert.equal(harness.comfortRange(field).getAttribute('max'), field === 'fov' ? '100' : '100');
    assert.ok(harness.comfortOutput(field).textContent.endsWith(field === 'fov' ? '°' : ''));
  }
  assert.equal(harness.resolutionRange().getAttribute('step'), '0.05');
  assert.equal(harness.adaptiveCheckbox().getAttribute('type'), 'checkbox');
  assert.match(harness.audio().textContent, /Indisponibil · 148/);
  assert.equal(harness.audio().getAttribute('aria-disabled'), 'true');
  assert.equal(JSON.stringify(dom).toLowerCase().includes('volume'), false);
  assert.equal(JSON.stringify(dom).toLowerCase().includes('mute'), false);
  assert.match(harness.policy().textContent, /nu modifică profilul învățat/);
  assert.equal(countElements(harness.root()), GAME_SETTINGS_PANEL_LIMITS.elements);
  const stats = harness.panel.getStats();
  assert.equal(stats.controls, 14);
  assert.equal(stats.listeners, 17);
  assert.equal(stats.elements, GAME_SETTINGS_PANEL_LIMITS.elements);
  assert.equal(stats.saveState, 'UNCHANGED');
  harness.panel.dispose();
});

test('081 live unit change updates the draft, preview and one save intention', () => {
  const harness = createGameSettingsHarness();
  assert.notEqual(harness.saveButton().getAttribute('disabled'), null);
  harness.saveButton().dispatch('click');
  assert.equal(harness.saved.length, 0, 'an unchanged draft emits no save intention');
  harness.setSelect('speed', 'mph');
  harness.setSelect('distance', 'ft');
  assert.equal(harness.draft().proposed.units.speed, 'mph');
  assert.match(harness.preview().textContent, /28 mph/);
  assert.match(harness.preview().textContent, /394 ft/);
  assert.match(harness.preview().textContent, /45 km\/h/);
  assert.match(harness.preview().textContent, /12.5 m\/s/);
  assert.match(harness.live().textContent, /unități/i);
  assert.equal(harness.saveButton().getAttribute('disabled'), null);
  harness.saveButton().dispatch('click');
  assert.equal(harness.saved.length, 1);
  assert.equal(harness.saved[0]!.proposed.units.speed, 'mph');
  assert.equal(harness.saved[0]!.proposed.comfort.version, 0);
  assert.equal(harness.panel.getStats().saves, 1);
  harness.panel.dispose();
});

test('081 comfort range and graphics controls update visible values locally', () => {
  const harness = createGameSettingsHarness();
  harness.setRange('fov', 95);
  harness.setRange('brakeRamp', 30);
  harness.setSelect('backend', 'WEBGL2');
  harness.setSelect('preset', 'LOW');
  harness.setRange('resolution', 0.5);
  harness.setCheckbox('adaptive', true);
  const draft = harness.draft(),
    view = harness.panel.getView();
  assert.equal(draft.proposed.comfort.fov, 95);
  assert.equal(draft.proposed.comfort.brakeRamp, 30);
  assert.equal(draft.proposed.graphics.preferredBackend, 'WEBGL2');
  assert.equal(draft.proposed.graphics.preset, 'LOW');
  assert.equal(draft.proposed.graphics.resolutionScale, 0.5);
  assert.equal(draft.proposed.graphics.adaptive, true);
  assert.equal(harness.comfortOutput('fov').textContent, '95°');
  assert.equal(harness.comfortOutput('brakeRamp').textContent, '30');
  assert.equal(harness.output('resolution').textContent, '50%');
  assert.equal(view.changed.comfort, true);
  assert.equal(view.changed.graphics, true);
  assert.equal(view.controlVersionBump, 1);
  harness.cancelButton().dispatch('click');
  assert.equal(harness.draft().proposed.comfort.fov, 80);
  assert.equal(harness.cancelled.length, 1);
  harness.panel.dispose();
});

test('081 invalid values show visible reasons and block the save intention', () => {
  const harness = createGameSettingsHarness();
  harness.setRange('fov', 120);
  const stats = harness.panel.getStats();
  assert.equal(harness.panel.getView().saveState, 'INVALID');
  assert.equal(stats.saveState, 'INVALID');
  assert.notEqual(harness.saveButton().getAttribute('disabled'), null);
  assert.equal(harness.issues().hasAttribute('hidden'), false);
  assert.match(harness.issues().textContent, /60 și 100/);
  harness.saveButton().dispatch('click');
  assert.equal(harness.saved.length, 0);
  harness.setRange('fov', 80);
  assert.equal(harness.panel.getView().saveState, 'UNCHANGED');
  assert.equal(harness.issues().hasAttribute('hidden'), true);
  harness.panel.dispose();
});

test('081 reset needs confirmation, stays local and keeps bindings out of the draft', () => {
  const harness = createGameSettingsHarness(customGameDraft());
  harness.setSelect('speed', 'km/h');
  assert.equal(harness.panel.getView().saveState, 'DIRTY');
  harness.resetButton().dispatch('click');
  assert.equal(harness.resetButton().textContent, 'Confirmă resetarea');
  assert.equal(harness.draft().proposed.units.speed, 'km/h', 'first click changes nothing');
  harness.resetButton().dispatch('click');
  const draft = harness.draft();
  assert.equal(harness.resetButton().textContent, 'Resetează');
  assert.equal(draft.proposed.units.speed, 'km/h');
  assert.equal(draft.proposed.cameraMode, 'CHASE');
  assert.equal(draft.proposed.comfort.fov, 80);
  assert.equal(draft.proposed.graphics.preset, 'MEDIUM');
  assert.equal(draft.proposed.comfort.version, 4);
  assert.equal(draft.saved.comfort.version, 4);
  assert.equal(
    Object.hasOwn(draft.proposed as unknown as Record<string, unknown>, 'bindings'),
    false,
  );
  harness.saveButton().dispatch('click');
  assert.equal(harness.saved.length, 1);
  assert.equal(harness.panel.getStats().resets, 1);
  harness.panel.dispose();
});

test('081 update is stable, monotone and dispose is idempotent', () => {
  const harness = createGameSettingsHarness(),
    draft = harness.draft();
  harness.panel.update(draft, 0);
  harness.panel.update(draft, 16);
  assert.equal(harness.panel.getStats().skipped, 2, 'identical signatures write nothing');
  const changed = setComfortValues(draft, { fov: 88 });
  harness.panel.update(changed, 32);
  assert.equal(harness.draft().proposed.comfort.fov, 88);
  assert.equal(harness.panel.getStats().updates, 3);
  assert.throws(() => harness.panel.update(draft, 10), /clock/);
  harness.panel.dispose();
  harness.panel.dispose();
  assert.equal(harness.panel.getStats().disposed, true);
  assert.equal(harness.panel.getStats().listeners, 0);
  assert.equal(harness.host.children.length, 0);
  assert.throws(() => harness.panel.update(draft, 64), /disposed/);
  assert.equal(customGameSettings().units.speed, 'mph');
  assert.equal(gameSettings().units.speed, 'km/h');
});
