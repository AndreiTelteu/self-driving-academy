import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCESSIBILITY_TOKENS,
  CONTROL_SLIDER_ENDS,
  CONTROL_SLIDER_FIELDS,
  CONTROL_SLIDER_HINTS,
  CONTROL_SLIDER_LABELS,
  CONTROL_SLIDER_PRESETS,
  CONTROL_SLIDER_PRESET_VALUES,
  CONTROL_SLIDER_RANGES,
  CONTROL_SLIDERS_CITY_TAB_LABEL,
  CONTROL_SLIDERS_CITY_TAB_REASON,
  CONTROL_SLIDERS_LAYOUTS,
  CONTROL_SLIDERS_ROW_REM,
  CONTROL_SLIDERS_VERSION,
  CONTROL_SLIDERS_WRITE_HZ,
  applyControlSliderPreset,
  computeResponsiveLayout,
  contrastRatio,
  controlSliderText,
  controlSliderValueText,
  controlSlidersIssues,
  controlSlidersLayout,
  controlSlidersRuntimeCandidate,
  nudgeControlValue,
  projectControlSliders,
  requiredContrast,
  resetControlSlidersDraft,
  revertControlSlidersDraft,
  setControlSliderValue,
  shouldWriteControlSliders,
} from '../../src/ui';
import {
  CONTROL_SLIDERS_PLAYER,
  controlSlidersDraft,
  controlSlidersSettings,
  createControlSlidersHarness,
  customControlSlidersSettings,
} from './control-sliders-fixture';

// ---------------------------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------------------------

test('229 the popup edits exactly the seven 009 control fields with simple ends and values', () => {
  const harness = createControlSlidersHarness();
  assert.equal(harness.view().version, CONTROL_SLIDERS_VERSION);
  assert.equal(CONTROL_SLIDER_FIELDS.length, 7);
  assert.equal(harness.root().getAttribute('role'), 'dialog');
  assert.equal(harness.root().getAttribute('aria-modal'), 'true');
  assert.ok(harness.root().getAttribute('aria-labelledby'));
  assert.ok(harness.root().getAttribute('aria-describedby'));
  assert.equal(harness.byClass('label').textContent, CONTROL_SLIDER_LABELS.steeringSensitivity);
  for (const field of CONTROL_SLIDER_FIELDS) {
    const input = harness.control(field),
      range = CONTROL_SLIDER_RANGES[field],
      output = harness.output(field),
      initial = field === 'fov' ? 80 : 50;
    assert.equal(input.getAttribute('type'), 'range');
    assert.equal(input.getAttribute('min'), String(range.min));
    assert.equal(input.getAttribute('max'), String(range.max));
    assert.equal(input.getAttribute('step'), String(range.step));
    assert.equal(input.getAttribute('aria-describedby'), input.getAttribute('id') + '-hint');
    assert.equal(output.textContent, controlSliderText(field, initial));
    assert.equal(input.getAttribute('aria-valuetext'), controlSliderValueText(field, initial));
    assert.equal(harness.end(field, 'min').textContent, CONTROL_SLIDER_ENDS[field].min);
    assert.equal(harness.end(field, 'max').textContent, CONTROL_SLIDER_ENDS[field].max);
    const hint = CONTROL_SLIDER_HINTS[field];
    assert.ok(hint.length > 10 && hint.endsWith('.'), `${field} has one plain sentence`);
    assert.equal(CONTROL_SLIDER_LABELS[field].includes('_'), false);
  }
  assert.equal(harness.cityTab().hasAttribute('disabled'), true);
  assert.ok(harness.cityTab().textContent?.includes(CONTROL_SLIDERS_CITY_TAB_LABEL));
  assert.equal(harness.cityTab().getAttribute('data-reason'), CONTROL_SLIDERS_CITY_TAB_REASON);
  harness.panel.dispose();
});

test('229 a drag writes the local read-out at most 10 Hz and commits one revision on release', () => {
  let clock = 0;
  const harness = createControlSlidersHarness(controlSlidersDraft(), { now: () => clock }),
    before = harness.panel.getStats().writes;
  for (let index = 0; index < 60; index += 1) {
    clock += 16;
    harness.setRange('steeringSensitivity', 50 + index);
  }
  const duringDrag = harness.panel.getStats(),
    writes = duringDrag.writes - before,
    seconds = (60 * 16) / 1000,
    flushes = Math.ceil(seconds * CONTROL_SLIDERS_WRITE_HZ) + 1;
  assert.equal(duringDrag.changes, 0, 'no draft revision during the drag');
  assert.equal(harness.drafts.length, 0, 'no change notification during the drag');
  assert.equal(duringDrag.inputEvents, 60);
  assert.ok(duringDrag.throttledReads <= flushes, `read-outs ${duringDrag.throttledReads}`);
  assert.ok(writes <= flushes * 2, `DOM writes ${writes} for ${flushes} read-out flushes`);
  assert.ok(duringDrag.throttledReads / seconds <= CONTROL_SLIDERS_WRITE_HZ);
  assert.equal(harness.draft().revision, 0, 'the draft is untouched while dragging');
  harness.setRange('steeringSensitivity', 110);
  harness.control('steeringSensitivity').dispatch('change');
  const after = harness.panel.getStats();
  assert.equal(after.changes, 1);
  assert.equal(harness.drafts.length, 1);
  assert.equal(harness.draft().revision, 1);
  assert.equal(harness.view().values.steeringSensitivity, 110);
  assert.equal(
    harness.view().saveState,
    'INVALID',
    'an out-of-range value is reported, not clamped',
  );
  assert.equal(harness.applyButton().hasAttribute('disabled'), true);
  harness.panel.dispose();
});

test('229 presets propose all seven values and never hide which preset is active', () => {
  const harness = createControlSlidersHarness();
  for (const preset of CONTROL_SLIDER_PRESETS) {
    harness.click(harness.preset(preset));
    const view = harness.view();
    assert.equal(view.activePreset, preset);
    for (const field of CONTROL_SLIDER_FIELDS)
      assert.equal(view.values[field], CONTROL_SLIDER_PRESET_VALUES[preset].values[field]);
    assert.equal(harness.preset(preset).getAttribute('aria-pressed'), 'true');
    for (const field of CONTROL_SLIDER_FIELDS)
      assert.ok(harness.control(field).getAttribute('aria-valuetext')?.includes('între'));
  }
  assert.equal(harness.panel.getStats().presetsUsed, CONTROL_SLIDER_PRESETS.length);
  harness.panel.dispose();
});

test('229 apply, cancel and reset only touch the local draft and stay explicit', () => {
  const harness = createControlSlidersHarness();
  assert.equal(harness.applyButton().hasAttribute('disabled'), true);
  harness.setRange('throttleRamp', 70);
  harness.control('throttleRamp').dispatch('change');
  assert.equal(harness.view().saveState, 'DIRTY');
  assert.equal(harness.applyButton().hasAttribute('disabled'), false);
  harness.click(harness.applyButton());
  assert.equal(harness.applied.length, 1, 'one apply intention per click');
  assert.equal(harness.applied[0]?.proposed.throttleRamp, 70);
  assert.equal(harness.draft().proposed.throttleRamp, 70, 'the panel never writes settings');

  harness.click(harness.cancelButton());
  assert.equal(harness.cancelled.length, 1);
  assert.equal(harness.view().saveState, 'UNCHANGED');
  assert.equal(harness.view().values.throttleRamp, 50);

  harness.click(harness.resetButton());
  assert.equal(harness.view().saveState, 'UNCHANGED', 'reset asks for confirmation first');
  assert.equal(harness.resetButton().textContent, 'Confirmă revenirea');
  harness.click(harness.resetButton());
  assert.equal(harness.resets.length, 1);
  for (const field of CONTROL_SLIDER_FIELDS)
    assert.equal(
      harness.view().values[field],
      field === 'fov' ? 80 : 50,
      `${field} returns to the 009 default`,
    );
  harness.panel.dispose();
});

test('229 project/runtime candidate bump the control revision once and copy the rest untouched', () => {
  const settings = customControlSlidersSettings(),
    draft = setControlSliderValue(controlSlidersDraft(settings), 'fov', 96),
    view = projectControlSliders(draft),
    candidate = controlSlidersRuntimeCandidate(draft, settings, settings.input.control.version + 1);
  assert.equal(view.controlVersionBump, 1);
  assert.equal(candidate.input.control.version, 5);
  assert.equal(candidate.input.control.fov, 96);
  assert.equal(candidate.input.control.mappingVersion, settings.input.control.mappingVersion);
  assert.deepEqual(candidate.input.bindings, settings.input.bindings);
  assert.equal(candidate.input.cameraMode, 'FIRST_PERSON');
  assert.deepEqual(candidate.units, settings.units);
  assert.deepEqual(candidate.quality, settings.quality);
  assert.deepEqual(candidate.scenario, settings.scenario);
  assert.equal(candidate.playerId, CONTROL_SLIDERS_PLAYER);
  assert.throws(
    () => controlSlidersRuntimeCandidate(draft, { ...settings, playerId: 'other' }, 5),
    /another player/,
  );
});

test('229 preset, reset and revert are pure draft operations', () => {
  const settings = controlSlidersSettings(),
    draft = controlSlidersDraft(settings),
    preset = applyControlSliderPreset(draft, 'DIRECT'),
    reset = resetControlSlidersDraft(preset),
    reverted = revertControlSlidersDraft(preset);
  assert.equal(draft.revision, 0);
  assert.equal(preset.revision, 1);
  assert.equal(projectControlSliders(preset).activePreset, 'DIRECT');
  assert.equal(projectControlSliders(reset).saveState, 'UNCHANGED');
  assert.equal(projectControlSliders(reverted).saveState, 'UNCHANGED');
  assert.equal(reverted.proposed.steeringSensitivity, draft.saved.steeringSensitivity);
  assert.equal(reset.proposed.fov, 80);
  assert.equal(reset.proposed.version, draft.saved.version);
});

test('229 keyboard steps are native-compatible, clamped and reversible at both ends', () => {
  assert.equal(nudgeControlValue('fov', 80, 1), 81);
  assert.equal(nudgeControlValue('fov', 100, 1), 100);
  assert.equal(nudgeControlValue('fov', 60, -10), 60);
  assert.equal(nudgeControlValue('steeringSensitivity', 0, -1), 0);
  assert.equal(nudgeControlValue('steeringSensitivity', 100, 10), 100);
  assert.equal(nudgeControlValue('returnRate', 50, 10), 60);
  assert.throws(() => nudgeControlValue('fov', Number.NaN, 1));
  assert.equal(shouldWriteControlSliders(-Infinity, 0), true);
  assert.equal(shouldWriteControlSliders(0, 99), false);
  assert.equal(shouldWriteControlSliders(0, 100), true);
  assert.equal(shouldWriteControlSliders(0, Number.NaN), false);
});

// ---------------------------------------------------------------------------------------------
// Focus, Escape and frame budget
// ---------------------------------------------------------------------------------------------

test('229 Tab cycles inside the popup, Escape closes it and restores the previous focus', () => {
  const harness = createControlSlidersHarness(),
    outside = harness.doc.createElement('button');
  outside.focus();
  assert.equal(harness.panel.getStats().listeners, 21, 'no keydown listener before opening');
  harness.panel.openPanel();
  assert.equal(harness.panel.isOpen(), true);
  assert.equal(harness.panel.getStats().listeners, 22, 'one panel keydown listener');
  assert.equal(harness.doc.activeElement, harness.controlTab(), 'focus moves into the popup');

  const first = harness.doc.activeElement;
  harness.key('Tab');
  assert.notEqual(harness.doc.activeElement, first, 'Tab moves to the next control');
  harness.key('Tab', { shiftKey: true });
  assert.equal(harness.doc.activeElement, first, 'Shift+Tab moves back');
  harness.key('Tab', { shiftKey: true });
  assert.equal(harness.doc.activeElement, harness.closeButton(), 'Shift+Tab wraps to the last');

  const event = harness.root().dispatchEvent('keydown', { key: 'Escape' });
  assert.equal(event.defaultPrevented, true, 'Escape is consumed by the popup');
  assert.deepEqual(harness.closed, ['ESCAPE']);
  assert.equal(harness.panel.isOpen(), false);
  assert.equal(harness.panel.getStats().listeners, 21, 'the panel listener is removed');
  assert.equal(harness.panel.getStats().globalListeners, 0);
  assert.equal(outside.focused, 2, 'previous focus restored');
  harness.panel.dispose();
});

test('229 the visible close button uses the same host port and never a global listener', () => {
  const harness = createControlSlidersHarness();
  harness.panel.openPanel();
  harness.click(harness.closeButton());
  assert.deepEqual(harness.closed, ['CLOSE']);
  assert.equal(harness.panel.isOpen(), false);
  assert.equal(harness.panel.getStats().globalListeners, 0);
  for (const button of [
    harness.applyButton(),
    harness.cancelButton(),
    harness.resetButton(),
    harness.closeButton(),
    harness.controlTab(),
    harness.cityTab(),
    ...CONTROL_SLIDER_PRESETS.map((preset) => harness.preset(preset)),
  ])
    assert.equal(button.getAttribute('type'), 'button', 'every button is explicit');
  harness.panel.dispose();
});

test('229 a 60 Hz host update writes nothing for an identical draft and coalesces changes', () => {
  const harness = createControlSlidersHarness();
  const draft = harness.draft(),
    before = harness.panel.getStats().writes,
    started = performance.now();
  for (let frame = 0; frame < 600; frame += 1) harness.panel.update(draft, frame * 16);
  const elapsed = performance.now() - started,
    idle = harness.panel.getStats();
  assert.equal(idle.writes, before, 'no DOM write for an identical projection');
  assert.equal(idle.renders, 1, 'the initial render only');
  assert.ok(idle.skipped >= 600, 'every identical frame is skipped');
  assert.ok(elapsed < 250, `600 identical frames cost ${elapsed.toFixed(1)} ms`);

  const changed = setControlSliderValue(draft, 'brakeRamp', 75);
  harness.panel.update(changed, 10_000);
  assert.equal(harness.panel.getView().values.brakeRamp, 75);
  const again = setControlSliderValue(harness.panel.getDraft(), 'brakeRamp', 76),
    writes = harness.panel.getStats().writes;
  harness.panel.update(again, 10_050);
  assert.equal(harness.panel.getStats().writes, writes, 'inside 100 ms the read-out waits');
  harness.panel.update(again, 10_100);
  assert.equal(harness.panel.getView().values.brakeRamp, 76);
  assert.throws(() => harness.panel.update(again, 10_000), /clock/);
  harness.panel.dispose();
});

test('229 an invalid draft is announced with a visible reason and cannot be applied', () => {
  const harness = createControlSlidersHarness(),
    invalid = setControlSliderValue(harness.draft(), 'fov', 120);
  harness.panel.setDraft(invalid);
  const view = harness.view();
  assert.equal(view.saveState, 'INVALID');
  assert.equal(view.canApply, false);
  assert.equal(harness.issues().hasAttribute('hidden'), false);
  assert.ok(harness.issues().textContent?.includes('60'));
  assert.equal(harness.applyButton().hasAttribute('disabled'), true);
  harness.click(harness.applyButton());
  assert.equal(harness.applied.length, 0);
  assert.ok(harness.live().textContent?.includes('afara limitelor'));
  assert.equal(controlSlidersIssues(invalid.proposed).length, 1);
  harness.panel.dispose();
});

// ---------------------------------------------------------------------------------------------
// Contrast and layout
// ---------------------------------------------------------------------------------------------

test('229 the popup colours meet WCAG AA against its real surface colours', () => {
  const pairs: readonly (readonly [string, string, number])[] = [
    [ACCESSIBILITY_TOKENS.text, ACCESSIBILITY_TOKENS.surface, 14],
    [ACCESSIBILITY_TOKENS.textMuted, ACCESSIBILITY_TOKENS.surface, 12],
    [ACCESSIBILITY_TOKENS.textStrong, ACCESSIBILITY_TOKENS.surfaceRaised, 14],
    [ACCESSIBILITY_TOKENS.textSecondary, ACCESSIBILITY_TOKENS.surfaceRaised, 12],
    [ACCESSIBILITY_TOKENS.focus, ACCESSIBILITY_TOKENS.surface, 0],
    [ACCESSIBILITY_TOKENS.success, ACCESSIBILITY_TOKENS.surfaceRaised, 12],
    [ACCESSIBILITY_TOKENS.warning, ACCESSIBILITY_TOKENS.surface, 12],
    [ACCESSIBILITY_TOKENS.error, ACCESSIBILITY_TOKENS.surfaceRaised, 12],
    [ACCESSIBILITY_TOKENS.selected, ACCESSIBILITY_TOKENS.surfaceRaised, 0],
  ];
  for (const [foreground, background, size] of pairs) {
    const ratio = contrastRatio(foreground, background),
      required = requiredContrast(size, 400);
    assert.ok(ratio >= required, `${foreground} on ${background} is ${ratio}:1 < ${required}:1`);
  }
});

test('229 the popup fits 1280x720 with a scrollable list and a fixed footer', () => {
  const layout = controlSlidersLayout({ widthPx: 1280, heightPx: 720, zoom: 1 });
  assert.equal(layout.region, 'STANDARD');
  assert.equal(layout.fits, true);
  assert.ok(layout.widthPx >= 360, `width ${layout.widthPx}`);
  assert.ok(layout.maxHeightPx <= 720 * 0.9);
  assert.ok(layout.visibleRows >= layout.minimumVisibleRows);
  assert.ok(layout.visibleRows < layout.totalRows);
  assert.equal(layout.scrolls, true);
  assert.equal(layout.footerInside, true);
  assert.equal(layout.rowHeightPx, CONTROL_SLIDERS_ROW_REM * 16);
  assert.ok(
    Math.abs(layout.chromePx + layout.listMaxHeightPx - layout.maxHeightPx) <= 1,
    'list + chrome fills the panel exactly',
  );
  assert.ok(layout.listMaxHeightPx >= layout.visibleRows * layout.rowHeightPx);
  const at1920 = CONTROL_SLIDERS_LAYOUTS.find((entry) => entry.id === '1920x1080')!.layout;
  assert.equal(at1920.region, 'LARGE');
  assert.ok(at1920.widthPx >= layout.widthPx);
  const zoomed = CONTROL_SLIDERS_LAYOUTS.find((entry) => entry.id === 'zoom-150')!.layout;
  assert.equal(zoomed.region, 'COMPACT');
  assert.equal(zoomed.fits, true);
  assert.equal(zoomed.minimumVisibleRows, 2);
  assert.equal(
    computeResponsiveLayout({ widthPx: 1280, heightPx: 720, zoom: 1 }).region,
    'STANDARD',
  );
});

test('229 rows are projected once each and the panel reports bounded resources', () => {
  const harness = createControlSlidersHarness();
  assert.equal(harness.view().rows.length, 7);
  assert.deepEqual(
    harness.view().rows.map((row) => row.field),
    [...CONTROL_SLIDER_FIELDS],
  );
  const stats = harness.panel.getStats();
  assert.equal(stats.controls, 16);
  assert.equal(stats.presets, 3);
  assert.equal(stats.writeHz, 10);
  assert.equal(stats.renders, 1);
  harness.panel.dispose();
  assert.equal(harness.panel.getStats().disposed, true);
  assert.equal(harness.panel.getStats().listeners, 0);
});
