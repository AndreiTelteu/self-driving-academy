import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STYLE_SLIDER_FIELDS,
  STYLE_SLIDER_UNAVAILABLE,
  kmhToMs,
  percentToProbability,
  projectStyleSliders,
  setStyleSliderValue,
  styleSliderFromParameter,
  styleSliderToParameter,
} from '../../src/ui';
import { createStyleHarness, styleDraft } from './style-sliders-fixture';

test('230 UI: eight real sliders plus visible disabled catalog keys', () => {
  const harness = createStyleHarness();
  try {
    const view = harness.panel.getStyleView()!;
    assert.equal(view.rows.length, 8);
    assert.deepEqual(
      view.rows.map((row) => row.parameterKey),
      [
        'speed_delta_urban',
        'desired_acceleration',
        'comfort_deceleration',
        'following_time_headway',
        'following_min_gap',
        'red_stop_probability',
        'stop_full_probability',
        'green_start_delay',
      ],
    );
    for (const row of view.rows) {
      assert.equal(row.enabled, true, row.parameterKey);
      assert.equal(harness.styleControl(row.field).hasAttribute('disabled'), false);
    }
    // Unsupported keys stay visible and are explicitly disabled, never hidden.
    for (const entry of STYLE_SLIDER_UNAVAILABLE) {
      const node = harness.unavailable(entry.parameterKey);
      assert.equal(node.getAttribute('aria-disabled'), 'true');
      assert.equal(node.getAttribute('data-reason'), entry.reason);
      assert.equal(node.hasAttribute('hidden'), false);
      assert.ok(node.textContent.length > 0);
    }
    assert.equal(harness.styleRoot().getAttribute('data-save-state'), 'UNCHANGED');
  } finally {
    harness.panel.dispose();
  }
});

test('230 UI: city tab becomes functional, keeps the 229 tab when absent and routes the footer', () => {
  const withStyle = createStyleHarness();
  const withoutStyle = createStyleHarness({ withStyleTab: false });
  try {
    assert.equal(withStyle.cityTab().hasAttribute('disabled'), false);
    assert.equal(withStyle.cityTab().getAttribute('data-state'), 'AVAILABLE');
    assert.equal(withStyle.cityTab().getAttribute('aria-selected'), 'false');
    assert.equal(withStyle.panel.getActiveTab(), 'CONTROL');

    withStyle.click(withStyle.cityTab());
    assert.equal(withStyle.cityTab().getAttribute('aria-selected'), 'true');
    assert.equal(withStyle.controlTab().getAttribute('aria-selected'), 'false');
    assert.equal(withStyle.cityTab().hasAttribute('hidden'), false);
    assert.equal(withStyle.styleRoot().hasAttribute('hidden'), false);
    assert.equal(withStyle.panel.getActiveTab(), 'CITY');
    assert.equal(withStyle.applyButton().hasAttribute('disabled'), true);
    assert.equal(withStyle.resetButton().textContent, 'Revino la versiunea activă');
    assert.ok(withStyle.byClass('note').textContent.includes('MANUAL_TUNING'));

    // The 229-only host keeps the explicit placeholder, exactly as before 230.
    assert.equal(withoutStyle.cityTab().hasAttribute('disabled'), true);
    assert.equal(withoutStyle.cityTab().getAttribute('data-reason'), 'PBI_230_PENDING');
    assert.ok(withoutStyle.dom().includes('Indisponibil · 230'));
  } finally {
    withoutStyle.panel.dispose();
    withStyle.panel.dispose();
  }
});

test('230 UI: conversions, read-out ceiling and one draft revision per gesture', () => {
  let clock = 0;
  const harness = createStyleHarness({ now: () => clock });
  try {
    harness.click(harness.cityTab());
    const urban = harness.styleControl('speedDeltaUrban');
    assert.equal(urban.getAttribute('min'), '-28.8');
    assert.equal(urban.getAttribute('max'), '54');
    assert.equal(urban.getAttribute('step'), '0.1');

    // Ten input events inside the same 100 ms window write the read-out once.
    const output = harness.styleOutput('speedDeltaUrban');
    for (const value of [1, 2, 3, 4, 5, 6, 7, 8, 9, 18]) {
      urban.value = String(value);
      urban.dispatch('input');
    }
    assert.equal(output.textContent, '+1 km/h');
    clock = 120;
    urban.value = '18';
    urban.dispatch('input');
    assert.equal(output.textContent, '+18 km/h');
    urban.dispatch('change');

    const draft = harness.panel.getStyleDraft()!;
    assert.equal(draft.proposed.speedDeltaUrban, kmhToMs(18));
    assert.equal(harness.drafts.length, 1);

    // 600 identical frame updates write nothing and cannot exceed the 10 Hz ceiling.
    const statsBefore = harness.panel.getStyleTab()!.getStats();
    const current = harness.panel.getStyleDraft()!;
    for (let index = 0; index < 600; index += 1)
      harness.panel.updateStyle(current, 1000 + index * 16.5);
    const statsAfter = harness.panel.getStyleTab()!.getStats();
    assert.equal(statsAfter.writes, statsBefore.writes);
    assert.equal(statsAfter.renders, statsBefore.renders);
    assert.equal(statsAfter.writeHz, 10);
    assert.equal(statsAfter.globalListeners, 0);

    // Probability conversion is exact in both directions.
    harness.drag('redStopProbability', [40]);
    const view = harness.panel.getStyleView()!;
    assert.equal(view.rows.find((row) => row.field === 'redStopProbability')!.parameterValue, 0.4);
    assert.equal(percentToProbability(40), 0.4);
    assert.equal(styleSliderToParameter('speedDeltaUrban', 54), 15);
    assert.equal(styleSliderFromParameter('redStopProbability', 0.6), 60);
  } finally {
    harness.panel.dispose();
  }
});

test('230 UI: apply is one intention and closes the popup so the tick can publish', () => {
  const harness = createStyleHarness();
  try {
    harness.click(harness.cityTab());
    harness.drag('desiredAcceleration', [3.5]);
    assert.equal(harness.applyButton().hasAttribute('disabled'), false);
    harness.click(harness.applyButton());
    assert.equal(harness.applied.length, 1);
    assert.equal(harness.applied[0].proposed.desiredAcceleration, 3.5);
    assert.deepEqual(harness.closed, ['CLOSE']);
    // A no-op apply never reaches the port.
    const unchanged = createStyleHarness();
    try {
      unchanged.click(unchanged.cityTab());
      unchanged.click(unchanged.applyButton());
      assert.equal(unchanged.applied.length, 0);
    } finally {
      unchanged.panel.dispose();
    }
  } finally {
    harness.panel.dispose();
  }
});

test('230 UI: cancel and reset only touch the local proposal', () => {
  const harness = createStyleHarness();
  try {
    harness.click(harness.cityTab());
    harness.drag('followingMinGap', [8]);
    assert.equal(harness.panel.getStyleView()!.changedCount, 1);
    harness.click(harness.cancelButton());
    assert.equal(harness.panel.getStyleView()!.changedCount, 0);
    assert.equal(harness.panel.getStyleView()!.saveState, 'UNCHANGED');
    assert.equal(harness.cancelled.length, 1);

    harness.drag('followingMinGap', [8]);
    harness.click(harness.resetButton());
    assert.equal(harness.resets.length, 0);
    assert.equal(harness.panel.getStyleTab()!.getStats().resets, 0);
    harness.click(harness.resetButton());
    assert.equal(harness.resets.length, 1);
    assert.equal(harness.panel.getStyleView()!.changedCount, 0);
  } finally {
    harness.panel.dispose();
  }
});

test('230 UI: a stale draft is visible, blocked and rebased only by an explicit click', () => {
  const harness = createStyleHarness({ draft: styleDraft({ headVersionId: 'profile-v3' }) });
  try {
    harness.click(harness.cityTab());
    const view = harness.panel.getStyleView()!;
    assert.equal(view.saveState, 'STALE');
    assert.equal(view.canApply, false);
    assert.equal(harness.applyButton().hasAttribute('disabled'), true);
    const stale = harness
      .styleRoot()
      .children.find((node) =>
        (node.getAttribute('class') ?? '').includes('style-sliders__stale'),
      )!;
    assert.equal(stale.hasAttribute('hidden'), false);
    harness.click(harness.rebaseButton());
    assert.equal(harness.rebased.length, 1);
    assert.equal(harness.applied.length, 0);
    assert.equal(harness.panel.getStyleDraft()!.proposed.speedDeltaUrban, 0);
  } finally {
    harness.panel.dispose();
  }
});

test('230 UI: restore needs a second explicit confirmation and lists a bounded history', () => {
  const harness = createStyleHarness();
  try {
    harness.click(harness.cityTab());
    const select = harness.restoreSelect();
    assert.equal(select.children.length, 2);
    select.value = 'profile-v2';
    select.dispatch('change');
    assert.equal(harness.restoreButton().textContent, 'Restaurează');
    harness.click(harness.restoreButton());
    assert.equal(harness.restored.length, 0);
    assert.equal(harness.restoreButton().textContent, 'Renunță');
    assert.equal(harness.confirmButton().hasAttribute('hidden'), false);
    harness.click(harness.confirmButton());
    assert.deepEqual(harness.restored, ['profile-v2']);
    const stats = harness.panel.getStyleTab()!.getStats();
    assert.equal(stats.restoreConfirms, 1);
    // The current version is not offered for restore.
    const options = select.children.map((node) => node.value);
    assert.deepEqual(options, ['profile-v3', 'profile-v2']);
  } finally {
    harness.panel.dispose();
  }
});

test('230 UI: focus stays inside the dialog on both tabs and Escape closes through the port', () => {
  const harness = createStyleHarness();
  try {
    harness.panel.openPanel();
    harness.key('Tab');
    for (let index = 0; index < 25; index += 1) harness.key('Tab');
    const active = harness.doc.activeElement;
    assert.notEqual(active, null);
    let inside = false;
    for (let node: unknown = active; node !== null; node = (node as { parent: unknown }).parent)
      inside = inside || node === (harness.root() as unknown);
    assert.equal(inside, true);

    harness.click(harness.cityTab());
    harness.key('Tab');
    harness.key('Tab', { shiftKey: true });
    harness.key('Escape');
    assert.deepEqual(harness.closed, ['ESCAPE']);
    assert.equal(harness.panel.getStats().globalListeners, 0);
  } finally {
    harness.panel.dispose();
  }
});

test('230 draft contract: unavailable keys are refused, invalid values are reported', () => {
  const draft = styleDraft();
  const outOfRange = setStyleSliderValue(draft, 'speedDeltaUrban', 100);
  const outOfRangeView = projectStyleSliders(outOfRange);
  assert.equal(outOfRangeView.saveState, 'INVALID');
  assert.equal(outOfRangeView.canApply, false);
  assert.equal(outOfRangeView.issues.length, 1);

  const unavailable = {
    ...draft,
    available: { ...draft.available, followingMinGap: false },
  };
  assert.throws(() => setStyleSliderValue(unavailable, 'followingMinGap', 8), /unavailable/);
  const unavailableView = projectStyleSliders(unavailable);
  assert.equal(unavailableView.rows.find((row) => row.field === 'followingMinGap')!.enabled, false);

  // An out-of-domain injected value is reported, never silently clamped.
  const invalid = { ...draft, proposed: { ...draft.proposed, greenStartDelay: 9 } };
  const projection = projectStyleSliders(invalid);
  assert.equal(projection.saveState, 'INVALID');
  assert.equal(projection.canApply, false);
  assert.equal(projection.issues.length, 1);
  assert.ok(projection.rows.every((row) => STYLE_SLIDER_FIELDS.includes(row.field)));
});
