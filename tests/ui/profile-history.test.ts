import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  createProfileHistoryPorts,
  planProfileRestore,
  PROFILE_HISTORY_RESERVED_KEYS,
  readProfileHistorySnapshot,
} from '../../src/app';
import type { ProfileHistoryFrame } from '../../src/app';
import type { ProfileStore } from '../../src/profiles';
import {
  PROFILE_HISTORY_CHANGE_WITHOUT_REASON,
  PROFILE_HISTORY_EMPTY_TEXT,
  PROFILE_HISTORY_LIMITS,
  PROFILE_HISTORY_VERSION,
  parseProfileHistorySnapshot,
  projectProfileHistory,
} from '../../src/ui';
import type { ProfileHistoryChange, ProfileHistorySnapshot } from '../../src/ui';
import { runProfileHistoryReport } from '../app/profile-history-report';
import {
  PROFILE_HISTORY_ENGINE,
  PROFILE_HISTORY_EPOCH,
  PROFILE_HISTORY_OTHER_PROFILE,
  PROFILE_HISTORY_SESSION,
  PROFILE_HISTORY_TICK,
  createHistoryStore,
  createProfileHistoryHarness,
  emptyHistoryStore,
  historySnapshot,
  profileHistoryPermissiveValidator,
  seedBranchingHistory,
  seedHistory,
  seedReservedKeyHistory,
} from './profile-history-fixture';

function chainStore(): ProfileStore {
  const store = createHistoryStore();
  seedHistory(store);
  return store;
}

function frame(overrides: Partial<ProfileHistoryFrame> = {}): ProfileHistoryFrame {
  return {
    tick: PROFILE_HISTORY_TICK,
    profileId: 'academy',
    sessionId: PROFILE_HISTORY_SESSION,
    worldEpoch: PROFILE_HISTORY_EPOCH,
    ...overrides,
  };
}

function changesOf(snapshot: ProfileHistorySnapshot): readonly ProfileHistoryChange[] {
  return snapshot.preview?.changes ?? [];
}

test('078 parser rejects malformed, duplicated, unordered and contradictory frames', () => {
  const store = chainStore(),
    snapshot = historySnapshot(store, { selectedVersionId: 'v2' }),
    parse = (value: unknown) => parseProfileHistorySnapshot(value, PROFILE_HISTORY_RESERVED_KEYS);
  assert.equal(parse(snapshot).entries.length, 3);
  assert.equal(parse(snapshot).selectedVersionId, 'v2');
  assert.throws(() => parse({ ...snapshot, version: '077-profile-panel-v1' }), /contract/);
  assert.throws(() => parse({ ...snapshot, units: 'IMPERIAL' }), /contract/);
  assert.throws(() => parse({ ...snapshot, extra: true }), /fields/);
  assert.throws(() => parse({ ...snapshot, sessionId: 'x'.repeat(513) }), /session identity/);
  assert.throws(() => parse({ ...snapshot, tick: -1 }), /tick/);
  assert.throws(() => parse({ ...snapshot, tick: 1.5 }), /tick/);
  assert.throws(() => parse({ ...snapshot, profileId: '' }), /profile identity/);
  const duplicated = Object.freeze([
    ...snapshot.entries.slice(0, 2),
    snapshot.entries[1]!,
    ...snapshot.entries.slice(2),
  ]);
  assert.throws(() => parse({ ...snapshot, entries: duplicated }), /duplicate versionId/);
  assert.throws(
    () => parse({ ...snapshot, entries: Object.freeze([...snapshot.entries].reverse()) }),
    /must start at a base version/,
  );
  const wrongCurrent = Object.freeze(
    snapshot.entries.map((entry) =>
      entry.versionId === 'v3'
        ? Object.freeze({ ...entry, current: false })
        : entry.versionId === 'v1'
          ? Object.freeze({ ...entry, current: true })
          : entry,
    ),
  );
  assert.throws(() => parse({ ...snapshot, entries: wrongCurrent }), /current flag/);
  const wrongSelected = Object.freeze(
    snapshot.entries.map((entry) =>
      entry.versionId === 'v1'
        ? Object.freeze({ ...entry, selected: true })
        : Object.freeze({ ...entry, selected: false }),
    ),
  );
  assert.throws(() => parse({ ...snapshot, entries: wrongSelected }), /selected flag/);
  const conflicting = Object.freeze(
    snapshot.entries.map((entry) =>
      entry.versionId === 'v2'
        ? Object.freeze({ ...entry, compatible: false, incompatibilityReason: null })
        : entry,
    ),
  );
  assert.throws(() => parse({ ...snapshot, entries: conflicting }), /compatibility flag/);
  assert.throws(
    () =>
      parse({
        ...snapshot,
        preview: { ...snapshot.preview!, fromVersionId: 'v1' },
      }),
    /preview must start at the current/,
  );
  assert.throws(() => parse({ ...snapshot, preview: null }), /does not match/);
  const reservedChange = Object.freeze({
    ...snapshot.preview!,
    changes: Object.freeze([
      Object.freeze({
        key: 'speed_delta_arterial',
        previous: 5,
        next: 6,
        unit: 'm/s',
        source: 'SNAPSHOT' as const,
        reason: PROFILE_HISTORY_CHANGE_WITHOUT_REASON,
      }),
    ]),
  });
  assert.throws(
    () => parse({ ...snapshot, preview: reservedChange }),
    /must not learn a reserved key/,
  );
  assert.throws(
    () => parse({ ...snapshot, restore: { ...snapshot.restore, explicit: false } }),
    /must be explicit/,
  );
  assert.throws(
    () =>
      parse({
        ...snapshot,
        restore: { ...snapshot.restore, action: 'AVAILABLE', reason: 'SAME_VERSION' },
      }),
    /cannot carry a reason/,
  );
  assert.throws(
    () => parse({ ...snapshot, restore: { ...snapshot.restore, action: 'BLOCKED', reason: null } }),
    /needs a closed reason/,
  );
  assert.throws(
    () => parse({ ...snapshot, currentVersionId: null, selectedVersionId: null }),
    /current flag/,
  );
  const branching = createHistoryStore();
  seedBranchingHistory(branching);
  const branchingSnapshot = historySnapshot(branching);
  assert.deepEqual(
    branchingSnapshot.entries.map((entry) => entry.versionId),
    ['base', 'a-sibling', 'b-sibling'],
    'same-depth versions use the versionId tie-break',
  );
  const reversed = Object.freeze([
    branchingSnapshot.entries[0]!,
    branchingSnapshot.entries[2]!,
    branchingSnapshot.entries[1]!,
  ]);
  assert.throws(() => parse({ ...branchingSnapshot, entries: reversed }), /tie-break/);
});

test('078 empty history is explicit, fabricates no row and blocks the restore', () => {
  const store = emptyHistoryStore(),
    snapshot = historySnapshot(store);
  assert.equal(snapshot.entries.length, 0);
  assert.equal(snapshot.currentVersionId, null);
  assert.equal(snapshot.selectedVersionId, null);
  assert.equal(snapshot.preview, null);
  assert.equal(snapshot.restore.action, 'BLOCKED');
  assert.equal(snapshot.restore.reason, 'MISSING_VERSION');
  assert.equal(snapshot.restore.explicit, true);
  assert.equal(snapshot.restore.confirmationRequired, true);
  const harness = createProfileHistoryHarness();
  harness.panel.update(snapshot, 0);
  assert.equal(harness.emptyNotice().hasAttribute('hidden'), false);
  assert.match(harness.emptyNotice().textContent, new RegExp(PROFILE_HISTORY_EMPTY_TEXT));
  assert.equal(harness.rows().length, 0, 'no version is invented');
  assert.equal(harness.panel.getStats().rows, 0);
  assert.equal(harness.root().getAttribute('data-empty'), 'true');
  assert.match(harness.restoreButton().getAttribute('aria-disabled') ?? '', /true/);
  assert.equal(harness.restoreButton().hasAttribute('disabled'), true);
  assert.match(harness.status().textContent, /restaurare blocată \(MISSING_VERSION\)/);
  assert.match(
    harness.root().textContent,
    /nu există în istoricul profilului|Nicio versiune de profil/,
  );
  harness.panel.dispose();
});

test('078 multiple versions have a deterministic base-to-tip order and stable identities', () => {
  const store = chainStore(),
    snapshot = historySnapshot(store),
    view = projectProfileHistory(snapshot);
  assert.deepEqual(
    snapshot.entries.map((entry) => entry.versionId),
    ['v1', 'v2', 'v3'],
  );
  assert.deepEqual(
    snapshot.entries.map((entry) => entry.depth),
    [0, 1, 2],
  );
  assert.equal(snapshot.entries[0]!.origin, 'BASE');
  assert.equal(snapshot.entries[1]!.origin, 'DERIVED');
  assert.equal(snapshot.currentVersionId, 'v3');
  assert.equal(snapshot.entries.at(-1)!.current, true);
  assert.equal(snapshot.restore.action, 'NONE');
  assert.equal(snapshot.restore.reason, 'NO_SELECTION');
  assert.equal(snapshot.preview, null);
  assert.deepEqual(
    view.rows.map((row) => row.rowId),
    ['v1', 'v2', 'v3'],
  );
  assert.match(view.rows[2]!.stateLabel, /Curent/);
  assert.equal(view.rows[0]!.sourceLabel, 'Fără segmente sursă');
  assert.match(view.rows[2]!.sourceLabel, /segmente sursă/);
  const harness = createProfileHistoryHarness();
  harness.panel.update(snapshot, 0);
  assert.deepEqual(
    harness.rows().map((row) => row.getAttribute('data-version-id')),
    ['v1', 'v2', 'v3'],
  );
  assert.equal(harness.rowFor('v3').getAttribute('aria-selected'), 'false');
  assert.equal(harness.root().getAttribute('data-current'), 'v3');
  harness.panel.dispose();
});

test('078 selecting a version previews the change list without restoring it', () => {
  const store = chainStore(),
    snapshot = historySnapshot(store, { selectedVersionId: 'v2' }),
    preview = snapshot.preview!;
  assert.equal(preview.fromVersionId, 'v3');
  assert.equal(preview.toVersionId, 'v2');
  assert.deepEqual(
    preview.changes.map((change) => change.key),
    ['following_time_headway', 'speed_delta_urban'],
  );
  const speed = preview.changes.find((change) => change.key === 'speed_delta_urban')!,
    headway = preview.changes.find((change) => change.key === 'following_time_headway')!;
  assert.equal(speed.previous, 0, 'v3 has a real zero');
  assert.equal(speed.next, 0.5);
  assert.equal(speed.source, 'DELTA', "v2's stored delta describes this exact transition");
  assert.equal(speed.reason, 'Distanță mai mică în mers');
  assert.equal(headway.previous, 1.2);
  assert.equal(headway.next, 1.4);
  assert.equal(headway.source, 'SNAPSHOT');
  assert.equal(headway.reason, PROFILE_HISTORY_CHANGE_WITHOUT_REASON);
  assert.equal(snapshot.restore.action, 'AVAILABLE');
  const harness = createProfileHistoryHarness();
  harness.panel.update(historySnapshot(store), 0);
  harness.panel.update(snapshot, 16);
  assert.equal(harness.rowFor('v2').getAttribute('aria-selected'), 'true');
  assert.equal(harness.rowFor('v3').getAttribute('aria-selected'), 'false');
  assert.equal(harness.changeRows().length, 2);
  assert.match(harness.changeRows()[1]!.textContent, /0 m\/s → 0.5 m\/s/);
  harness.panel.update(snapshot, 32);
  assert.equal(harness.calls.restore.length, 0, 'a frame update never restores');
  assert.equal(harness.restoreButton().hasAttribute('disabled'), false);
  harness.panel.dispose();
});

test('078 restoring the current version is blocked with SAME_VERSION', () => {
  const store = chainStore(),
    snapshot = historySnapshot(store, { selectedVersionId: 'v3' });
  assert.equal(snapshot.preview, null);
  assert.equal(snapshot.restore.action, 'BLOCKED');
  assert.equal(snapshot.restore.reason, 'SAME_VERSION');
  const harness = createProfileHistoryHarness();
  harness.panel.update(snapshot, 0);
  assert.equal(harness.restoreButton().hasAttribute('disabled'), true);
  assert.match(harness.root().textContent, /deja curentă/);
  harness.restoreButton().dispatch('click');
  assert.equal(harness.calls.restore.length, 0);
  harness.panel.dispose();
});

test('078 a selection outside the stored history is MISSING_VERSION, never invented', () => {
  const store = chainStore(),
    snapshot = historySnapshot(store, { selectedVersionId: 'v9' });
  assert.equal(snapshot.entries.length, 3);
  assert.equal(
    snapshot.entries.some((entry) => entry.selected),
    false,
  );
  assert.equal(snapshot.preview, null);
  assert.equal(snapshot.restore.action, 'BLOCKED');
  assert.equal(snapshot.restore.reason, 'MISSING_VERSION');
  const view = projectProfileHistory(snapshot);
  assert.match(view.previewEmptyLabel, /nu este în istoricul curent/);
  const harness = createProfileHistoryHarness();
  harness.panel.update(snapshot, 0);
  assert.equal(harness.rows().length, 3);
  assert.match(harness.previewEmpty().textContent, /nu este în istoricul curent/);
  assert.equal(harness.restoreButton().hasAttribute('disabled'), true);
  harness.panel.dispose();
});

test('078 an incompatible engine blocks the restore and is carried by visible text', () => {
  const store = chainStore(),
    snapshot = historySnapshot(store, {
      selectedVersionId: 'v2',
      engineVersion: 'engine:078.2',
    });
  assert.equal(
    snapshot.entries.every((entry) => entry.compatible === false),
    true,
  );
  assert.equal(
    snapshot.entries.every((entry) => entry.incompatibilityReason === 'ENGINE_MISMATCH'),
    true,
  );
  assert.equal(snapshot.restore.action, 'BLOCKED');
  assert.equal(snapshot.restore.reason, 'ENGINE_MISMATCH');
  assert.ok(snapshot.preview, 'the values can still be compared');
  assert.equal(changesOf(snapshot).length, 2);
  const harness = createProfileHistoryHarness();
  harness.panel.update(snapshot, 0);
  const row = harness.rows().find((entry) => entry.getAttribute('data-version-id') === 'v2')!;
  assert.equal(row.parent!.getAttribute('data-compatible'), 'false');
  assert.match(row.textContent, /Incompatibil/);
  assert.match(harness.root().textContent, /altă versiune de motor/);
  assert.equal(harness.restoreButton().hasAttribute('disabled'), true);
  harness.panel.dispose();
});

test('078 a version from another profile is PROFILE_MISMATCH and never listed', () => {
  const store = chainStore();
  const foreign = store.createBase({
    profileId: PROFILE_HISTORY_OTHER_PROFILE,
    versionId: 'h1',
    parameters: Object.freeze({ speed_delta_urban: 1, following_time_headway: 2 }),
    createdAt: '2026-10-20T00:00:00.000Z',
  });
  assert.equal(foreign.status, 'ACCEPTED');
  const snapshot = historySnapshot(store, { selectedVersionId: 'h1' });
  assert.deepEqual(
    snapshot.entries.map((entry) => entry.versionId),
    ['v1', 'v2', 'v3'],
    'another profile never leaks into the list',
  );
  assert.equal(snapshot.selectedVersionId, 'h1');
  assert.equal(
    snapshot.entries.some((entry) => entry.versionId === 'h1'),
    false,
  );
  assert.equal(snapshot.preview, null);
  assert.equal(snapshot.restore.action, 'BLOCKED');
  assert.equal(snapshot.restore.reason, 'PROFILE_MISMATCH');
  const harness = createProfileHistoryHarness();
  harness.panel.update(snapshot, 0);
  assert.match(harness.root().textContent, /aparține altui profil/);
  harness.panel.dispose();
});

test('078 selection and restore never reuse, edit or drop a stored version', () => {
  const store = chainStore(),
    before = JSON.stringify(store.listVersions('academy')),
    checksum = store.getVersion('v2')!.checksum,
    harness = createProfileHistoryHarness();
  harness.panel.update(historySnapshot(store, { selectedVersionId: 'v2' }), 0);
  const firstV1 = harness.rowFor('v1'),
    firstV2 = harness.rowFor('v2'),
    created = harness.panel.getStats().created;
  harness.panel.update(historySnapshot(store, { selectedVersionId: 'v1' }), 16);
  assert.equal(harness.rowFor('v1'), firstV1, 'the v1 node is reused');
  assert.equal(harness.rowFor('v2'), firstV2, 'the v2 node is reused');
  assert.equal(harness.panel.getStats().created, created, 'no row is created for a selection');
  harness.rowFor('v1').dispatch('click');
  harness.restoreButton().dispatch('click');
  harness.confirmButton().dispatch('click');
  assert.equal(JSON.stringify(store.listVersions('academy')), before);
  assert.equal(store.getVersion('v2')!.checksum, checksum);
  assert.equal(store.getHistory('academy').length, 3);
  harness.panel.dispose();
});

test('078 restoration is an explicit two-step action with a visible confirmation', () => {
  const store = chainStore(),
    snapshot = historySnapshot(store, { selectedVersionId: 'v2' }),
    harness = createProfileHistoryHarness();
  harness.panel.update(snapshot, 0);
  assert.equal(harness.restoreButton().hasAttribute('disabled'), false);
  assert.equal(harness.confirmButton().hasAttribute('hidden'), true);
  harness.restoreButton().dispatch('click');
  assert.equal(harness.calls.restore.length, 0, 'the first click only opens the confirmation');
  assert.equal(harness.confirmButton().hasAttribute('hidden'), false);
  assert.match(harness.status().textContent, /Confirmă restaurarea/);
  assert.equal(harness.panel.getStats().confirming, true);
  harness.restoreButton().dispatch('click');
  assert.equal(harness.calls.restore.length, 0, 'a repeated first click never restores');
  harness.confirmButton().dispatch('click');
  assert.deepEqual(harness.calls.restore, ['v2']);
  assert.equal(harness.confirmButton().hasAttribute('hidden'), true);
  assert.equal(harness.panel.getStats().confirming, false);
  assert.match(harness.status().textContent, /Restaurare solicitată pentru v2/);
  harness.restoreButton().dispatch('click');
  assert.equal(harness.panel.getStats().confirming, true);
  harness.panel.update(historySnapshot(store, { selectedVersionId: 'v1' }), 32);
  assert.equal(harness.panel.getStats().confirming, false, 'a new selection resets the step');
  assert.equal(harness.confirmButton().hasAttribute('hidden'), true);
  assert.equal(harness.calls.restore.length, 1);
  harness.panel.dispose();
});

test('078 a click only selects; restore stays untouched and host rejection is displayed', () => {
  const store = chainStore(),
    harness = createProfileHistoryHarness({
      restoreResult: Object.freeze({ accepted: false, reason: 'ENGINE_MISMATCH' }),
    });
  harness.panel.update(historySnapshot(store), 0);
  harness.rowFor('v1').dispatch('click');
  harness.rowFor('v2').dispatch('click');
  harness.rowFor('v3').dispatch('click');
  assert.deepEqual(harness.calls.select, ['v1', 'v2', 'v3']);
  assert.equal(harness.calls.restore.length, 0);
  assert.equal(store.getHistory('academy').length, 3);
  harness.panel.update(historySnapshot(store, { selectedVersionId: 'v2' }), 16);
  harness.restoreButton().dispatch('click');
  harness.confirmButton().dispatch('click');
  assert.match(harness.status().textContent, /Restaurare refuzată pentru v2: ENGINE_MISMATCH/);
  harness.panel.dispose();
});

test('078 row nodes stay stable per versionId across selection and current changes', () => {
  const store = chainStore(),
    harness = createProfileHistoryHarness();
  harness.panel.update(historySnapshot(store), 0);
  const nodes = ['v1', 'v2', 'v3'].map((versionId) => harness.rowFor(versionId));
  harness.panel.update(historySnapshot(store, { selectedVersionId: 'v2' }), 16);
  const elements = harness.panel.getStats().elements;
  harness.panel.update(
    historySnapshot(store, { selectedVersionId: 'v1', currentVersionId: 'v2' }),
    32,
  );
  assert.deepEqual(
    ['v1', 'v2', 'v3'].map((versionId) => harness.rowFor(versionId)),
    nodes,
  );
  assert.equal(harness.panel.getStats().created, 3);
  assert.equal(harness.panel.getStats().elements, elements);
  assert.equal(harness.root().getAttribute('data-current'), 'v2');
  harness.panel.dispose();
});

test('078 writes are capped at 10 Hz while a selection change bypasses the ceiling', () => {
  const store = chainStore(),
    base = historySnapshot(store, { selectedVersionId: 'v2' }),
    harness = createProfileHistoryHarness();
  harness.panel.update(base, 0);
  const firstWrites = harness.panel.getStats().writes;
  for (let index = 0; index < 60; index += 1) {
    const preview = base.preview!,
      changes = preview.changes.map((change) =>
        change.key === 'speed_delta_urban'
          ? Object.freeze({
              ...change,
              next: 0.5 + index / 1000,
              source: 'SNAPSHOT' as const,
              reason: PROFILE_HISTORY_CHANGE_WITHOUT_REASON,
            })
          : change,
      );
    harness.panel.update(
      parseProfileHistorySnapshot(
        {
          ...base,
          tick: PROFILE_HISTORY_TICK + 1 + index,
          preview: { ...preview, changes },
        },
        PROFILE_HISTORY_RESERVED_KEYS,
      ),
      16 * (index + 1),
    );
  }
  const throttled = harness.panel.getStats();
  assert.ok((throttled.updates as number) <= 10, `updates ${throttled.updates}`);
  assert.ok((throttled.updates as number) >= 2);
  assert.ok((throttled.skipped as number) >= 45);
  assert.ok((throttled.writes as number) > (firstWrites as number));
  const beforeBypass = throttled.updates as number;
  harness.panel.update(
    historySnapshot(store, { selectedVersionId: 'v1', tick: PROFILE_HISTORY_TICK + 61 }),
    961,
  );
  assert.equal(harness.panel.getStats().updates, beforeBypass + 1);
  assert.equal(harness.root().getAttribute('data-selected'), 'v1');
  harness.panel.dispose();
});

test('078 an identical frame writes nothing, even when only the tick advanced', () => {
  const store = chainStore(),
    snapshot = historySnapshot(store, { selectedVersionId: 'v2' }),
    harness = createProfileHistoryHarness();
  harness.panel.update(snapshot, 0);
  const writes = harness.panel.getStats().writes,
    updates = harness.panel.getStats().updates,
    dom = harness.dom();
  harness.panel.update(snapshot, 500);
  assert.equal(harness.panel.getStats().writes, writes);
  assert.equal(harness.panel.getStats().updates, updates);
  assert.equal(harness.panel.getStats().skipped, 1);
  assert.equal(harness.dom(), dom);
  harness.panel.update({ ...snapshot, tick: PROFILE_HISTORY_TICK + 1 }, 600);
  assert.equal(harness.panel.getStats().writes, writes);
  assert.equal(harness.panel.getStats().skipped, 2);
  assert.equal(harness.dom(), dom);
  harness.panel.dispose();
});

test('078 malformed, stale and out-of-clock frames never touch the DOM', () => {
  const store = chainStore(),
    snapshot = historySnapshot(store, { selectedVersionId: 'v2' }),
    harness = createProfileHistoryHarness();
  harness.panel.update(snapshot, 0);
  const dom = harness.dom(),
    writes = harness.panel.getStats().writes,
    updates = harness.panel.getStats().updates;
  assert.throws(
    () =>
      harness.panel.update(
        { ...snapshot, version: '077-profile-panel-v1' } as unknown as ProfileHistorySnapshot,
        10,
      ),
    /contract/,
  );
  assert.throws(
    () => harness.panel.update({ ...snapshot, tick: PROFILE_HISTORY_TICK - 1 }, 20),
    /Stale/,
  );
  assert.throws(
    () => harness.panel.update({ ...snapshot, tick: PROFILE_HISTORY_TICK + 1 }, -1),
    /clock/,
  );
  assert.throws(
    () => harness.panel.update({ ...snapshot, tick: PROFILE_HISTORY_TICK + 1, sessionId: '' }, 30),
    /session identity/,
  );
  assert.equal(harness.dom(), dom);
  assert.equal(harness.panel.getStats().writes, writes);
  assert.equal(harness.panel.getStats().updates, updates);
  harness.panel.dispose();
});

test('078 lifecycle is bounded, idempotent, keyboard-native and owns no global listener', () => {
  const store = chainStore(),
    harness = createProfileHistoryHarness();
  harness.panel.update(historySnapshot(store, { selectedVersionId: 'v2' }), 0);
  assert.equal(harness.host.children.length, 1);
  assert.equal(harness.host.listenerCount, 0, 'no global listener');
  assert.equal(harness.panel.getStats().listeners, 5);
  for (const row of harness.rows()) {
    assert.equal(row.tagName, 'button', 'keyboard-native option');
    assert.equal(row.getAttribute('type'), 'button');
  }
  assert.equal(harness.emptyNotice().hasAttribute('hidden'), true);
  assert.equal(harness.confirmButton().hasAttribute('hidden'), true);
  const restoreButton = harness.restoreButton(),
    confirmButton = harness.confirmButton(),
    rowButtons = harness.rows();
  harness.panel.dispose();
  assert.equal(restoreButton.listenerCount, 0);
  assert.equal(confirmButton.listenerCount, 0);
  for (const button of rowButtons) assert.equal(button.listenerCount, 0);
  harness.panel.dispose();
  assert.equal(harness.host.children.length, 0);
  const stats = harness.panel.getStats();
  assert.equal(stats.elements, 0);
  assert.equal(stats.rows, 0);
  assert.equal(stats.listeners, 0);
  assert.equal(stats.retainedViews, 0);
  assert.equal(stats.disposed, true);
  assert.throws(() => harness.panel.update(historySnapshot(store), 10), /disposed/);
  assert.throws(() => harness.panel.open(), /disposed/);
  for (let index = 0; index < 10; index += 1) {
    const local = createProfileHistoryHarness();
    local.panel.update(historySnapshot(store), 0);
    local.panel.dispose();
    assert.equal(local.host.children.length, 0);
    assert.equal(local.panel.getStats().created, 3);
  }
});

test('078 a reserved key never appears as a learnable preview change', () => {
  const store = createHistoryStore({ validator: profileHistoryPermissiveValidator });
  seedReservedKeyHistory(store);
  const snapshot = historySnapshot(store, { selectedVersionId: 'r2' });
  assert.equal(store.getVersion('r2')!.parameters.speed_delta_arterial, 7);
  assert.equal(store.getVersion('r1')!.parameters.speed_delta_arterial, 5);
  assert.equal(snapshot.preview, null, 'r2 is the current version');
  const backwards = historySnapshot(store, { selectedVersionId: 'r1' });
  assert.deepEqual(
    changesOf(backwards).map((change) => change.key),
    ['speed_delta_urban'],
    'the R key is omitted from the learnable preview consistently',
  );
  const polluted = Object.freeze({
    ...backwards,
    preview: {
      ...backwards.preview!,
      changes: Object.freeze([
        ...backwards.preview!.changes,
        Object.freeze({
          key: 'speed_delta_arterial',
          previous: 7,
          next: 5,
          unit: 'm/s',
          source: 'SNAPSHOT' as const,
          reason: PROFILE_HISTORY_CHANGE_WITHOUT_REASON,
        }),
      ]),
    },
  });
  assert.throws(
    () => parseProfileHistorySnapshot(polluted, PROFILE_HISTORY_RESERVED_KEYS),
    /reserved key/,
  );
});

test('078 restore planning and ports validate without writing a version', () => {
  const store = chainStore(),
    available = planProfileRestore({
      store,
      profileId: 'academy',
      currentVersionId: 'v3',
      selectedVersionId: 'v2',
      engineVersion: PROFILE_HISTORY_ENGINE,
    });
  assert.deepEqual(available, { action: 'AVAILABLE', reason: null });
  assert.equal(
    planProfileRestore({
      store,
      profileId: 'academy',
      currentVersionId: 'v3',
      selectedVersionId: 'v3',
      engineVersion: PROFILE_HISTORY_ENGINE,
    }).reason,
    'SAME_VERSION',
  );
  assert.equal(
    planProfileRestore({
      store,
      profileId: 'academy',
      currentVersionId: 'v3',
      selectedVersionId: 'v9',
      engineVersion: PROFILE_HISTORY_ENGINE,
    }).reason,
    'MISSING_VERSION',
  );
  assert.equal(
    planProfileRestore({
      store,
      profileId: 'academy',
      currentVersionId: 'v3',
      selectedVersionId: 'v2',
      engineVersion: 'engine:078.2',
    }).reason,
    'ENGINE_MISMATCH',
  );
  const duplicateStore: ProfileStore = {
    ...store,
    listVersions: (profileId?: string) => {
      const versions = store.listVersions(profileId);
      return Object.freeze([...versions, versions[0]!]);
    },
  };
  assert.equal(
    planProfileRestore({
      store: duplicateStore,
      profileId: 'academy',
      currentVersionId: 'v3',
      selectedVersionId: 'v2',
      engineVersion: PROFILE_HISTORY_ENGINE,
    }).reason,
    'DUPLICATE_VERSION_ID',
  );
  const requests: {
      profileId: string;
      fromVersionId: string;
      versionId: string;
      engineVersion: string;
    }[] = [],
    ports = createProfileHistoryPorts({
      store,
      restore: (request) => {
        requests.push(request);
        return Object.freeze({ status: 'REJECTED' as const, reason: 'HOST_REFUSED' });
      },
    });
  assert.equal(ports.select('v2'), true);
  assert.equal(ports.select('missing'), false);
  assert.equal(ports.restore('missing').accepted, false);
  assert.deepEqual(ports.restore('v3'), { accepted: false, reason: 'SAME_VERSION' });
  assert.equal(requests.length, 0, 'a blocked plan never reaches the host');
  assert.deepEqual(ports.restore('v2'), { accepted: false, reason: 'HOST_REFUSED' });
  assert.deepEqual(requests, [
    {
      profileId: 'academy',
      fromVersionId: 'v3',
      versionId: 'v2',
      engineVersion: PROFILE_HISTORY_ENGINE,
    },
  ]);
  assert.equal(store.getHistory('academy').length, 3);
  assert.throws(
    () => readProfileHistorySnapshot({ store }, frame({ currentVersionId: 'v9' })),
    /current version does not exist/,
  );
  assert.equal(
    readProfileHistorySnapshot({ store }, frame({ currentVersionId: 'v2' })).currentVersionId,
    'v2',
  );
  assert.equal(PROFILE_HISTORY_LIMITS.maximumHz, 10);
});

test('078 committed evidence report is the current deterministic transcript', () => {
  const report = runProfileHistoryReport(),
    saved = readFileSync(
      join(process.cwd(), 'Docs', 'Evidence', '078-profile-history', 'report.json'),
      'utf8',
    );
  assert.equal(report.summary.pass, true);
  assert.equal(saved, `${JSON.stringify(report, null, 2)}\n`);
  assert.ok(report.scenarios.length >= 7);
  assert.ok(report.checks.length >= 25);
  assert.equal(report.version, PROFILE_HISTORY_VERSION);
  assert.equal(report.contract.limits.maximumHz, PROFILE_HISTORY_LIMITS.maximumHz);
});
