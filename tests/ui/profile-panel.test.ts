import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { readProfilePanelSnapshot } from '../../src/app';
import { parameterDefinitions } from '../../src/profiles';
import type { DrivingProfile, ProfileVersionDelta } from '../../src/profiles';
import {
  PROFILE_PANEL_ILLUSTRATIVE_BANNER,
  PROFILE_PANEL_LIMITS,
  PROFILE_PANEL_VERSION,
  parseProfilePanelSnapshot,
  projectProfilePanel,
} from '../../src/ui';
import type { ProfilePanelSnapshot } from '../../src/ui';
import { runProfilePanelReport } from '../app/profile-panel-report';
import {
  PROFILE_PANEL_EPOCH,
  PROFILE_PANEL_SESSION,
  createProfilePanelHarness,
  illustrativeSnapshot,
  realProfile,
  realProfileDelta,
  realSnapshot,
} from './profile-panel-fixture';

function rowOf(snapshot: ProfilePanelSnapshot, key: string) {
  const row = projectProfilePanel(snapshot, parameterDefinitions).rows.find(
    (entry) => entry.key === key,
  );
  if (row === undefined) throw new Error(`Missing projected row: ${key}`);
  return row;
}

function parameterOf(snapshot: ProfilePanelSnapshot, key: string) {
  const parameter = snapshot.parameters.find((entry) => entry.key === key);
  if (parameter === undefined) throw new Error(`Missing parameter: ${key}`);
  return parameter;
}

function panelSnapshot(
  profile: DrivingProfile | null,
  delta: ProfileVersionDelta | null = null,
  tick = 10,
): ProfilePanelSnapshot {
  return readProfilePanelSnapshot(
    { catalog: parameterDefinitions },
    { tick, profile, delta, sessionId: PROFILE_PANEL_SESSION, worldEpoch: PROFILE_PANEL_EPOCH },
  );
}

test('077 parser rejects malformed, duplicated, out-of-catalog and contradictory frames', () => {
  const illustrative = illustrativeSnapshot(),
    real = realSnapshot(),
    parse = (value: unknown) => parseProfilePanelSnapshot(value, parameterDefinitions);
  assert.equal(parse(illustrative).parameters.length, 80);
  assert.equal(parse(real).tick, 10);
  assert.throws(() => parse({ ...illustrative, version: '076-map-selection-v1' }), /contract/);
  assert.throws(() => parse({ ...illustrative, units: 'IMPERIAL' }), /contract/);
  assert.throws(() => parse({ ...illustrative, extra: true }), /fields/);
  assert.throws(() => parse({ ...illustrative, sessionId: 'x'.repeat(513) }), /session identity/);
  assert.throws(() => parse({ ...illustrative, tick: -1 }), /tick/);
  assert.throws(() => parse({ ...illustrative, tick: 1.5 }), /tick/);
  const duplicated = Object.freeze([
    ...illustrative.parameters.slice(0, 79),
    illustrative.parameters[0]!,
  ]);
  assert.throws(() => parse({ ...illustrative, parameters: duplicated }), /duplicate parameter/);
  const wrongMetadata = Object.freeze(
    illustrative.parameters.map((parameter) =>
      parameter.key === 'speed_delta_urban'
        ? Object.freeze({ ...parameter, min: -100, defaultValue: -100 })
        : parameter,
    ),
  );
  assert.throws(() => parse({ ...illustrative, parameters: wrongMetadata }), /metadata/);
  const outsideRange = Object.freeze(
    real.parameters.map((parameter) =>
      parameter.key === 'speed_delta_urban'
        ? Object.freeze({ ...parameter, value: 99 })
        : parameter,
    ),
  );
  assert.throws(() => parse({ ...real, parameters: outsideRange }), /outside the catalog range/);
  const reservedValue = Object.freeze(
    real.parameters.map((parameter) =>
      parameter.key === 'speed_delta_arterial'
        ? Object.freeze({
            ...parameter,
            status: 'OBSERVED' as const,
            value: 5,
            source: 'BASE' as const,
            reason: 'PROFILE_VALUE_BASE' as const,
            learnable: true,
          })
        : parameter,
    ),
  );
  assert.throws(() => parse({ ...real, parameters: reservedValue }), /reserved status/);
  const unobservedValue = Object.freeze(
    illustrative.parameters.map((parameter) =>
      parameter.key === 'speed_delta_urban' ? Object.freeze({ ...parameter, value: 0 }) : parameter,
    ),
  );
  assert.throws(() => parse({ ...illustrative, parameters: unobservedValue }), /explicit null/);
  assert.throws(
    () => parse({ ...illustrative, profile: real.profile }),
    /must not publish a profile/,
  );
  const learnedWithoutEvidence = Object.freeze(
    real.parameters.map((parameter) =>
      parameter.key === 'curve_lateral_accel'
        ? Object.freeze({
            ...parameter,
            evidenceCount: 0,
            quality: 0,
            uncertainty: 0,
            contexts: Object.freeze([]),
          })
        : parameter,
    ),
  );
  assert.throws(() => parse({ ...real, parameters: learnedWithoutEvidence }), /requires evidence/);
  const negativeUncertainty = Object.freeze(
    real.parameters.map((parameter) =>
      parameter.key === 'curve_lateral_accel'
        ? Object.freeze({ ...parameter, uncertainty: -1 })
        : parameter,
    ),
  );
  assert.throws(() => parse({ ...real, parameters: negativeUncertainty }), /uncertainty/);
  const impossibleQuality = Object.freeze(
    real.parameters.map((parameter) =>
      parameter.key === 'curve_lateral_accel'
        ? Object.freeze({ ...parameter, quality: 2 })
        : parameter,
    ),
  );
  assert.throws(() => parse({ ...real, parameters: impossibleQuality }), /quality/);
  const wrongReason = Object.freeze(
    real.parameters.map((parameter) =>
      parameter.key === 'speed_delta_urban'
        ? Object.freeze({ ...parameter, reason: 'NOT_OBSERVED' as const })
        : parameter,
    ),
  );
  assert.throws(() => parse({ ...real, parameters: wrongReason }), /reason does not match/);
  const delta = real.delta!;
  assert.throws(
    () =>
      parse({
        ...real,
        delta: { ...delta, baseVersionId: real.profile!.versionId },
      }),
    /own version/,
  );
  assert.throws(
    () =>
      parse({
        ...real,
        delta: { ...delta, changes: Object.freeze([delta.changes[0]!, delta.changes[0]!]) },
      }),
    /duplicate delta key/,
  );
});

test('077 illustrative frame uses the real catalog defaults and never claims a publication', () => {
  const snapshot = illustrativeSnapshot(),
    view = projectProfilePanel(snapshot, parameterDefinitions),
    urbanParameter = parameterOf(snapshot, 'speed_delta_urban'),
    urban = rowOf(snapshot, 'speed_delta_urban');
  assert.equal(snapshot.profile, null);
  assert.equal(snapshot.illustrative, true);
  assert.equal(snapshot.delta, null);
  assert.equal(view.banner, PROFILE_PANEL_ILLUSTRATIVE_BANNER);
  assert.equal(view.counts.total, 80);
  assert.equal(view.counts.observed, 0);
  assert.equal(view.counts.unobserved, 24);
  assert.equal(view.counts.reserved, 56);
  assert.equal(view.counts.changed, 0);
  assert.equal(view.counts.learnable, 24);
  assert.equal(urbanParameter.defaultValue, 0);
  assert.equal(urbanParameter.min, -8);
  assert.equal(urbanParameter.max, 15);
  assert.equal(urban.value, null);
  assert.equal(urban.valueLabel, 'Neobservat');
  assert.equal(view.sections[0]!.category, 'Viteză și ritm');
  assert.equal(view.sections.at(-1)!.category, 'Pickup și confortul pasagerilor');
  assert.equal(view.signature, projectProfilePanel(snapshot, parameterDefinitions).signature);
  const harness = createProfilePanelHarness();
  harness.panel.update(snapshot, 0);
  assert.equal(harness.banner().hasAttribute('hidden'), false);
  assert.match(harness.banner().textContent, /Date ilustrative/);
  assert.equal(harness.badge().textContent, 'ILUSTRATIV');
  assert.equal(harness.badge().getAttribute('data-illustrative'), 'true');
  assert.equal(harness.root().getAttribute('data-illustrative'), 'true');
  assert.equal(harness.rows().length, 80);
  assert.match(harness.status().textContent, /0 observați, 24 neobservați, 56 rezervați/);
  harness.panel.dispose();
});

test('077 an R key stays reserved and not learnable even when the record carries a number', () => {
  const profile = realProfile(),
    snapshot = panelSnapshot(profile),
    arterial = snapshot.parameters.find((parameter) => parameter.key === 'speed_delta_arterial')!,
    row = rowOf(snapshot, 'speed_delta_arterial');
  assert.equal(profile.parameters.speed_delta_arterial, 5, 'the record does carry a number');
  assert.equal(arterial.status, 'RESERVED');
  assert.equal(arterial.value, null);
  assert.equal(arterial.learnable, false);
  assert.equal(arterial.source, null);
  assert.equal(arterial.evidenceCount, 0);
  assert.equal(arterial.reason, 'RESERVED_V1');
  assert.equal(row.valueLabel, 'Rezervat · neînvățabil V1');
  assert.equal(row.displayValue, 'Rezervat · neînvățabil V1');
  assert.match(row.description, /Neînvățabil V1/);
  assert.match(row.description, /nu este învățabilă în V1/);
  const harness = createProfilePanelHarness();
  harness.panel.update(snapshot, 0);
  const item = harness.rowFor('speed_delta_arterial');
  assert.equal(item.getAttribute('data-status'), 'RESERVED');
  assert.equal(item.getAttribute('data-learnable'), 'false');
  assert.match(item.textContent, /Rezervat/);
  harness.panel.dispose();
});

test('077 an unobserved key is an explicit null, never a zero', () => {
  const snapshot = panelSnapshot(realProfile({ omit: ['speed_delta_residential'] })),
    row = rowOf(snapshot, 'speed_delta_residential'),
    illustrative = rowOf(illustrativeSnapshot(), 'speed_delta_urban'),
    illustrativeParameter = parameterOf(illustrativeSnapshot(), 'speed_delta_urban');
  assert.equal(row.status, 'UNOBSERVED');
  assert.equal(row.value, null);
  assert.equal(row.valueLabel, 'Neobservat');
  assert.equal(row.displayValue, 'Neobservat');
  assert.doesNotMatch(row.displayValue, /^0/);
  assert.equal(
    illustrativeParameter.defaultValue,
    0,
    'the default is zero, but the value is not observed',
  );
  assert.equal(illustrative.value, null);
  assert.equal(illustrative.valueLabel, 'Neobservat');
  assert.notEqual(illustrative.valueLabel, '0');
  const harness = createProfilePanelHarness();
  harness.panel.update(snapshot, 0);
  assert.equal(harness.rowFor('speed_delta_residential').getAttribute('data-status'), 'UNOBSERVED');
  assert.equal(harness.rowFor('speed_delta_residential').children[1]!.textContent, 'Neobservat');
  harness.panel.dispose();
});

test('077 a real zero is observed and displayed as 0 with its unit', () => {
  const snapshot = realSnapshot(),
    row = rowOf(snapshot, 'speed_delta_urban');
  assert.equal(row.status, 'OBSERVED');
  assert.equal(row.value, 0);
  assert.equal(row.valueLabel, '0');
  assert.equal(row.displayValue, '0 m/s');
  assert.equal(row.sourceLabel, 'Învățat');
  const harness = createProfilePanelHarness();
  harness.panel.update(snapshot, 0);
  assert.equal(harness.rowFor('speed_delta_urban').children[1]!.textContent, '0 m/s');
  assert.equal(harness.rowFor('speed_delta_urban').getAttribute('data-status'), 'OBSERVED');
  harness.panel.dispose();
});

test('077 uncertainty, quality and evidence are explicit and deterministic', () => {
  const snapshot = realSnapshot(),
    curve = rowOf(snapshot, 'curve_lateral_accel'),
    headway = rowOf(snapshot, 'following_time_headway');
  assert.equal(curve.uncertaintyLabel, '±0.25');
  assert.equal(curve.evidenceLabel, '4 dovezi');
  assert.equal(curve.sourceLabel, 'Învățat');
  assert.equal(curve.qualityLabel, '75%');
  assert.equal(headway.uncertaintyLabel, '±0.1');
  assert.equal(headway.evidenceLabel, '6 dovezi');
  const harness = createProfilePanelHarness();
  harness.panel.update(snapshot, 0);
  const item = harness.rowFor('curve_lateral_accel');
  assert.equal(item.children[2]!.textContent, '±0.25');
  assert.equal(item.children[3]!.textContent, '4 dovezi');
  assert.equal(item.children[4]!.textContent, 'Învățat');
  harness.panel.dispose();
});

test('077 delta rows carry previous, next and reason and a real zero stays visible', () => {
  const snapshot = realSnapshot(),
    view = projectProfilePanel(snapshot, parameterDefinitions);
  assert.equal(snapshot.delta!.baseVersionId, 'style:077:v1');
  assert.equal(view.counts.changed, 2);
  assert.equal(view.delta!.baseVersionId, 'style:077:v1');
  assert.equal(view.delta!.summary, '2 modificări față de style:077:v1.');
  const zero = view.delta!.rows.find((row) => row.key === 'speed_delta_urban')!,
    headway = view.delta!.rows.find((row) => row.key === 'following_time_headway')!;
  assert.equal(zero.previousLabel, '0.5 m/s');
  assert.equal(zero.nextLabel, '0 m/s');
  assert.equal(zero.changeLabel, '0.5 m/s → 0 m/s');
  assert.equal(zero.reason, 'Distanță mai mică în mers');
  assert.equal(zero.evidenceLabel, '4 dovezi');
  assert.equal(headway.changeLabel, '1.8 s → 1.4 s');
  assert.equal(headway.evidenceLabel, '6 dovezi');
  const harness = createProfilePanelHarness();
  harness.panel.update(snapshot, 0);
  assert.equal(harness.deltaRows().length, 2);
  assert.equal(harness.deltaRows()[0]!.getAttribute('data-key'), 'speed_delta_urban');
  assert.match(harness.deltaRows()[0]!.textContent, /0\.5 m\/s → 0 m\/s/);
  assert.match(harness.deltaRows()[0]!.textContent, /Distanță mai mică în mers/);
  harness.panel.dispose();
});

test('077 a reserved key is excluded from learned delta rows and cannot be parsed as a change', () => {
  const profile = realProfile({
      values: { speed_delta_arterial: 6, following_time_headway: 1.2 },
    }),
    delta = realProfileDelta(profile, [
      { key: 'speed_delta_arterial', previous: 5, next: 6 },
      { key: 'following_time_headway', previous: 1.8, next: 1.2 },
    ]),
    snapshot = panelSnapshot(profile, delta),
    view = projectProfilePanel(snapshot, parameterDefinitions);
  assert.equal(snapshot.delta!.changes.length, 1);
  assert.equal(snapshot.delta!.changes[0]!.key, 'following_time_headway');
  assert.equal(view.delta!.rows.length, 1);
  assert.equal(
    view.delta!.rows.some((row) => row.key === 'speed_delta_arterial'),
    false,
  );
  const polluted = Object.freeze({
    ...snapshot,
    delta: Object.freeze({
      baseVersionId: 'style:077:v1',
      changes: Object.freeze([
        Object.freeze({
          key: 'speed_delta_arterial',
          previous: 5,
          next: 6,
          reason: 'Schimbare rezervată',
          evidenceCount: 0,
        }),
      ]),
    }),
  });
  assert.throws(
    () => parseProfilePanelSnapshot(polluted, parameterDefinitions),
    /must not learn a reserved key/,
  );
  const onlyReserved = Object.freeze(
    realProfileDelta(profile, [{ key: 'speed_delta_arterial', previous: 5, next: 6 }]),
  );
  assert.equal(panelSnapshot(profile, onlyReserved).delta, null);
  assert.throws(
    () =>
      panelSnapshot(
        profile,
        realProfileDelta(profile, [{ key: 'following_time_headway', previous: 1.8, next: 1.2 }], {
          baseVersionId: 'style:077:v0',
        }),
      ),
    /delta base/,
  );
});

test('077 row nodes stay stable per catalog key across content updates and reopening', () => {
  const harness = createProfilePanelHarness(),
    base = panelSnapshot(realProfile());
  harness.panel.update(base, 0);
  const before = harness.rowFor('curve_lateral_accel'),
    elements = harness.panel.getStats().elements,
    first = harness.panel.getView()!;
  const changed = panelSnapshot(
    realProfile({ evidence: { curve_lateral_accel: { uncertainty: 0.4 } } }),
  );
  harness.panel.update(changed, 2_000);
  assert.equal(harness.rowFor('curve_lateral_accel'), before);
  assert.equal(harness.rowFor('curve_lateral_accel').children[2]!.textContent, '±0.4');
  assert.equal(harness.panel.getStats().createdRows, 80);
  assert.equal(harness.panel.getStats().elements, elements);
  assert.equal(harness.rows().length, 80);
  assert.notEqual(harness.panel.getView()!.signature, first.signature);
  harness.panel.close();
  assert.equal(harness.root().hasAttribute('hidden'), true);
  assert.equal(harness.rows().length, 80, 'closing never clears rows');
  harness.panel.open();
  assert.equal(harness.rowFor('curve_lateral_accel'), before);
  assert.equal(harness.panel.getStats().createdRows, 80);
  harness.panel.dispose();
});

test('077 writes are capped at 10 Hz while a profile version change bypasses the ceiling', () => {
  const harness = createProfilePanelHarness(),
    base = realSnapshot();
  harness.panel.update(base, 0);
  const firstWrites = harness.panel.getStats().writes;
  for (let index = 0; index < 60; index += 1) {
    harness.panel.update(
      {
        ...base,
        tick: 11 + index,
        parameters: Object.freeze(
          base.parameters.map((parameter) =>
            parameter.key === 'curve_lateral_accel'
              ? Object.freeze({ ...parameter, uncertainty: 0.25 + index / 1000 })
              : parameter,
          ),
        ),
      },
      16 * (index + 1),
    );
  }
  const throttled = harness.panel.getStats();
  assert.ok((throttled.updates as number) <= 10, `updates ${throttled.updates}`);
  assert.ok((throttled.updates as number) >= 2);
  assert.ok((throttled.skipped as number) >= 45);
  assert.ok((throttled.writes as number) > (firstWrites as number));
  const beforeBypass = throttled.updates as number,
    next = panelSnapshot(
      realProfile({ versionId: 'style:077:v3', parentVersionId: 'style:077:v2' }),
      null,
      100,
    );
  harness.panel.update(next, 961);
  assert.equal(harness.panel.getStats().updates as number, beforeBypass + 1);
  assert.equal(harness.root().getAttribute('data-version'), 'style:077:v3');
  harness.panel.dispose();
});

test('077 an identical frame writes nothing, even when only the tick advanced', () => {
  const harness = createProfilePanelHarness(),
    snapshot = realSnapshot();
  harness.panel.update(snapshot, 0);
  const writes = harness.panel.getStats().writes,
    updates = harness.panel.getStats().updates,
    dom = harness.dom();
  harness.panel.update(snapshot, 500);
  assert.equal(harness.panel.getStats().writes, writes);
  assert.equal(harness.panel.getStats().updates, updates);
  assert.equal(harness.panel.getStats().skipped, 1);
  assert.equal(harness.dom(), dom);
  harness.panel.update({ ...snapshot, tick: 11 }, 600);
  assert.equal(harness.panel.getStats().writes, writes);
  assert.equal(harness.panel.getStats().updates, updates);
  assert.equal(harness.panel.getStats().skipped, 2);
  assert.equal(harness.dom(), dom);
  harness.panel.dispose();
});

test('077 malformed, stale and out-of-clock frames never touch the DOM', () => {
  const harness = createProfilePanelHarness(),
    snapshot = realSnapshot();
  harness.panel.update(snapshot, 0);
  const dom = harness.dom(),
    writes = harness.panel.getStats().writes,
    updates = harness.panel.getStats().updates;
  assert.throws(
    () =>
      harness.panel.update(
        { ...snapshot, version: '076-map-selection-v1' } as unknown as ProfilePanelSnapshot,
        10,
      ),
    /contract/,
  );
  assert.throws(() => harness.panel.update({ ...snapshot, tick: 9 }, 20), /Stale/);
  assert.throws(() => harness.panel.update({ ...snapshot, tick: 11 }, -1), /clock/);
  assert.throws(
    () => harness.panel.update({ ...snapshot, tick: 11, sessionId: '' }, 30),
    /session identity/,
  );
  assert.equal(harness.dom(), dom);
  assert.equal(harness.panel.getStats().writes, writes);
  assert.equal(harness.panel.getStats().updates, updates);
  harness.panel.dispose();
});

test('077 real and illustrative frames switch the badge and banner without rebuilding rows', () => {
  const harness = createProfilePanelHarness(),
    illustrative = illustrativeSnapshot();
  harness.panel.update(illustrative, 0);
  assert.equal(harness.badge().textContent, 'ILUSTRATIV');
  assert.equal(harness.banner().hasAttribute('hidden'), false);
  const real = realSnapshot();
  harness.panel.update(real, 16);
  assert.equal(harness.badge().textContent, 'PUBLICAT');
  assert.equal(harness.badge().getAttribute('data-illustrative'), 'false');
  assert.equal(harness.root().getAttribute('data-illustrative'), 'false');
  assert.equal(harness.banner().hasAttribute('hidden'), true);
  assert.equal(harness.root().getAttribute('data-version'), 'style:077:v2');
  assert.equal(harness.panel.getStats().createdRows, 80);
  harness.panel.update(illustrative, 32);
  assert.equal(harness.badge().textContent, 'ILUSTRATIV');
  assert.equal(harness.banner().hasAttribute('hidden'), false);
  assert.equal(harness.panel.getStats().createdRows, 80);
  harness.panel.dispose();
});

test('077 lifecycle is bounded, idempotent, keyboard-native and owns no global listener', () => {
  const harness = createProfilePanelHarness();
  harness.panel.update(realSnapshot(), 0);
  assert.equal(harness.host.children.length, 1);
  assert.equal(harness.host.listenerCount, 0);
  assert.equal(harness.root().listenerCount, 0);
  assert.equal(harness.panel.getStats().listeners, 0);
  const details = harness.root().children.find((child) => child.tagName === 'details');
  assert.ok(details, 'evidence/checksum details are native');
  assert.equal(details!.children[0]!.tagName, 'summary');
  assert.equal(
    harness.rows().some((row) => row.children.some((child) => child.tagName === 'button')),
    false,
    'no control mutates a profile',
  );
  harness.panel.dispose();
  harness.panel.dispose();
  assert.equal(harness.host.children.length, 0);
  const stats = harness.panel.getStats();
  assert.equal(stats.elements, 0);
  assert.equal(stats.rows, 0);
  assert.equal(stats.retainedViews, 0);
  assert.equal(stats.disposed, true);
  assert.throws(() => harness.panel.update(realSnapshot(), 10), /disposed/);
  assert.throws(() => harness.panel.open(), /disposed/);
  for (let index = 0; index < 20; index += 1) {
    const local = createProfilePanelHarness();
    local.panel.update(illustrativeSnapshot(), 0);
    local.panel.dispose();
    assert.equal(local.host.children.length, 0);
    assert.equal(local.panel.getStats().createdRows, 80);
  }
});

test('077 committed evidence report is the current deterministic transcript', () => {
  const report = runProfilePanelReport(),
    saved = readFileSync(
      join(process.cwd(), 'Docs', 'Evidence', '077-profile-panel', 'report.json'),
      'utf8',
    );
  assert.equal(report.summary.pass, true);
  assert.equal(saved, `${JSON.stringify(report, null, 2)}\n`);
  assert.ok(report.scenarios.length >= 7);
  assert.ok(report.checks.length >= 25);
  assert.equal(report.version, PROFILE_PANEL_VERSION);
  assert.equal(report.contract.limits.maximumHz, PROFILE_PANEL_LIMITS.maximumHz);
});
