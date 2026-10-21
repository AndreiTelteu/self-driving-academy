import {
  createProfileHistoryPorts,
  planProfileRestore,
  PROFILE_HISTORY_RESERVED_KEYS,
} from '../../src/app';
import type { ProfileStore } from '../../src/profiles';
import {
  PROFILE_HISTORY_CHANGE_WITHOUT_REASON,
  PROFILE_HISTORY_EMPTY_TEXT,
  PROFILE_HISTORY_LIMITS,
  PROFILE_HISTORY_VERSION,
  parseProfileHistorySnapshot,
  projectProfileHistory,
} from '../../src/ui';
import type { ProfileHistorySnapshot, ProfileHistoryView } from '../../src/ui';
import {
  PROFILE_HISTORY_ENGINE,
  PROFILE_HISTORY_TICK,
  createHistoryStore,
  createProfileHistoryHarness,
  emptyHistoryStore,
  historySnapshot,
  profileHistoryPermissiveValidator,
  seedHistory,
  seedReservedKeyHistory,
} from '../ui/profile-history-fixture';
import type { ProfileHistoryHarness } from '../ui/profile-history-fixture';

export interface ProfileHistoryReportRow {
  readonly versionId: string;
  readonly state: string;
  readonly origin: string;
  readonly depth: number;
  readonly engine: string;
  readonly source: string;
  readonly current: boolean;
  readonly selected: boolean;
  readonly compatible: boolean;
  readonly incompatibility: string;
}

export interface ProfileHistoryReportChange {
  readonly key: string;
  readonly change: string;
  readonly source: string;
  readonly reason: string;
}

export interface ProfileHistoryReportRestore {
  readonly action: string;
  readonly reason: string;
  readonly disabled: boolean;
  readonly reasonLabel: string;
}

export interface ProfileHistoryReportScenario {
  readonly name: string;
  readonly profileId: string;
  readonly currentVersionId: string;
  readonly selectedVersionId: string;
  readonly empty: boolean;
  readonly rows: readonly ProfileHistoryReportRow[];
  readonly changes: readonly ProfileHistoryReportChange[];
  readonly restore: ProfileHistoryReportRestore;
  readonly summary: string;
  readonly dom: string | null;
  readonly stats: Readonly<Record<string, number | boolean | string>>;
}

export interface ProfileHistoryCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface ProfileHistoryReport {
  readonly version: typeof PROFILE_HISTORY_VERSION;
  readonly contract: Readonly<{
    rules: readonly string[];
    limits: Readonly<Record<string, number>>;
  }>;
  readonly scenarios: readonly ProfileHistoryReportScenario[];
  readonly checks: readonly ProfileHistoryCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): ProfileHistoryCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function rowsOf(view: ProfileHistoryView): ProfileHistoryReportRow[] {
  return view.rows.map((row) =>
    Object.freeze({
      versionId: row.versionId,
      state: row.stateLabel,
      origin: row.origin,
      depth: row.depth,
      engine: row.engineVersion,
      source: row.sourceLabel,
      current: row.current,
      selected: row.selected,
      compatible: row.compatible,
      incompatibility: row.incompatibilityLabel,
    }),
  );
}

function changesOf(view: ProfileHistoryView): ProfileHistoryReportChange[] {
  return (view.preview?.rows ?? []).map((row) =>
    Object.freeze({
      key: row.key,
      change: row.changeLabel,
      source: row.source,
      reason: row.reason,
    }),
  );
}

function restoreOf(view: ProfileHistoryView): ProfileHistoryReportRestore {
  return Object.freeze({
    action: view.restore.action,
    reason: view.restore.reason ?? '—',
    disabled: view.restore.disabled,
    reasonLabel: view.restore.reasonLabel,
  });
}

function scenarioOf(
  name: string,
  snapshot: ProfileHistorySnapshot,
  harness: ProfileHistoryHarness,
  withDom = false,
): ProfileHistoryReportScenario {
  const view = projectProfileHistory(snapshot);
  return Object.freeze({
    name,
    profileId: snapshot.profileId,
    currentVersionId: snapshot.currentVersionId ?? '—',
    selectedVersionId: snapshot.selectedVersionId ?? '—',
    empty: view.empty,
    rows: Object.freeze(rowsOf(view)),
    changes: Object.freeze(changesOf(view)),
    restore: restoreOf(view),
    summary: view.summary,
    dom: withDom ? harness.dom() : null,
    stats: harness.panel.getStats(),
  });
}

function chainStore(): ProfileStore {
  const store = createHistoryStore();
  seedHistory(store);
  return store;
}

export function runProfileHistoryReport(): ProfileHistoryReport {
  const emptyHarness = createProfileHistoryHarness({ open: true }),
    chainHarness = createProfileHistoryHarness({ open: true }),
    previewHarness = createProfileHistoryHarness({ open: true }),
    reservedHarness = createProfileHistoryHarness({ open: true }),
    engineHarness = createProfileHistoryHarness({ open: true }),
    restoreHarness = createProfileHistoryHarness({ open: true }),
    throttleHarness = createProfileHistoryHarness(),
    identicalHarness = createProfileHistoryHarness(),
    rejectedHarness = createProfileHistoryHarness(),
    stableHarness = createProfileHistoryHarness();
  try {
    const emptyStore = emptyHistoryStore(),
      historyStore = chainStore(),
      reservedStore = createHistoryStore({ validator: profileHistoryPermissiveValidator });
    seedReservedKeyHistory(reservedStore);

    const empty = historySnapshot(emptyStore),
      chain = historySnapshot(historyStore),
      preview = historySnapshot(historyStore, { selectedVersionId: 'v2' }),
      reserved = historySnapshot(reservedStore, { selectedVersionId: 'r1' }),
      engine = historySnapshot(historyStore, {
        selectedVersionId: 'v2',
        engineVersion: 'engine:078.2',
      });

    emptyHarness.panel.update(empty, 0);
    chainHarness.panel.update(chain, 0);
    previewHarness.panel.update(preview, 0);
    reservedHarness.panel.update(reserved, 0);
    engineHarness.panel.update(engine, 0);

    const storeBeforeRestore = JSON.stringify(historyStore.listVersions('academy'));
    restoreHarness.panel.update(preview, 0);
    restoreHarness.rowFor('v2').dispatch('click');
    const restoreCallsAfterSelection = restoreHarness.calls.restore.length;
    restoreHarness.restoreButton().dispatch('click');
    const restoreCallsAfterFirstClick = restoreHarness.calls.restore.length,
      confirmationVisible = restoreHarness.confirmButton().hasAttribute('hidden') === false,
      confirmingStats = restoreHarness.panel.getStats().confirming;
    restoreHarness.confirmButton().dispatch('click');
    const restoreCallsAfterConfirm = [...restoreHarness.calls.restore],
      storeAfterRestore = JSON.stringify(historyStore.listVersions('academy')),
      restoreStatus = restoreHarness.status().textContent;

    identicalHarness.panel.update(preview, 0);
    const identicalWrites = identicalHarness.panel.getStats().writes,
      identicalUpdates = identicalHarness.panel.getStats().updates,
      identicalDom = identicalHarness.dom();
    identicalHarness.panel.update(preview, 500);
    const identicalAfterWrites = identicalHarness.panel.getStats().writes,
      identicalSkipped = identicalHarness.panel.getStats().skipped,
      identicalDomAfter = identicalHarness.dom();

    throttleHarness.panel.update(preview, 0);
    const throttleFirstWrites = throttleHarness.panel.getStats().writes;
    for (let index = 0; index < 60; index += 1) {
      const target = preview.preview!,
        changes = target.changes.map((change) =>
          change.key === 'speed_delta_urban'
            ? Object.freeze({
                ...change,
                next: 0.5 + index / 1000,
                source: 'SNAPSHOT' as const,
                reason: PROFILE_HISTORY_CHANGE_WITHOUT_REASON,
              })
            : change,
        );
      throttleHarness.panel.update(
        parseProfileHistorySnapshot(
          {
            ...preview,
            tick: PROFILE_HISTORY_TICK + 1 + index,
            preview: { ...target, changes },
          },
          PROFILE_HISTORY_RESERVED_KEYS,
        ),
        16 * (index + 1),
      );
    }
    const throttledStats = throttleHarness.panel.getStats(),
      throttledUpdates = throttledStats.updates as number,
      throttledSkipped = throttledStats.skipped as number;
    throttleHarness.panel.update(
      historySnapshot(historyStore, { selectedVersionId: 'v1', tick: PROFILE_HISTORY_TICK + 61 }),
      961,
    );
    const bypassUpdates = throttleHarness.panel.getStats().updates as number;

    rejectedHarness.panel.update(preview, 0);
    const rejectedDom = rejectedHarness.dom(),
      rejectedWrites = rejectedHarness.panel.getStats().writes;
    let rejectedFrames = 0;
    for (const attempt of [
      () =>
        rejectedHarness.panel.update(
          { ...preview, version: '077-profile-panel-v1' } as unknown as ProfileHistorySnapshot,
          10,
        ),
      () => rejectedHarness.panel.update({ ...preview, tick: PROFILE_HISTORY_TICK - 1 }, 20),
      () => rejectedHarness.panel.update({ ...preview, tick: PROFILE_HISTORY_TICK + 1 }, -1),
    ]) {
      try {
        attempt();
      } catch {
        rejectedFrames += 1;
      }
    }
    const rejectedDomAfter = rejectedHarness.dom(),
      rejectedWritesAfter = rejectedHarness.panel.getStats().writes;

    stableHarness.panel.update(chain, 0);
    const stableNodes = ['v1', 'v2', 'v3'].map((versionId) => stableHarness.rowFor(versionId));
    stableHarness.panel.update(preview, 16);
    const stableCreated = stableHarness.panel.getStats().created,
      stableSame = ['v1', 'v2', 'v3'].every(
        (versionId, index) => stableHarness.rowFor(versionId) === stableNodes[index],
      );

    const branching = createHistoryStore();
    const branchingSeed = branching.createBase({
      profileId: 'academy',
      versionId: 'base',
      parameters: Object.freeze({ speed_delta_urban: 0, following_time_headway: 1.8 }),
      createdAt: '2026-10-20T00:00:00.000Z',
    });
    if (branchingSeed.status !== 'ACCEPTED') throw new Error('Branching seed failed');
    for (const versionId of ['b-sibling', 'a-sibling']) {
      const result = branching.derive({
        profileId: 'academy',
        versionId,
        parentVersionId: 'base',
        segmentId: `segment:078:${versionId}`,
        createdAt: '2026-10-20T00:01:00.000Z',
        delta: {
          profileVersionId: versionId,
          parentVersionId: 'base',
          engineVersion: PROFILE_HISTORY_ENGINE,
          schemaVersion: 1,
          units: 'SI',
          values: [
            {
              key: 'following_time_headway',
              unit: 's',
              value: versionId === 'a-sibling' ? 1.3 : 1.5,
            },
          ],
        },
      });
      if (result.status !== 'ACCEPTED') throw new Error(`Branching seed failed: ${versionId}`);
    }
    const branchingSnapshot = historySnapshot(branching),
      branchingOrder = branchingSnapshot.entries.map((entry) => entry.versionId).join(' → ');

    const reservedRecordValue = reservedStore.getVersion('r2')!.parameters.speed_delta_arterial,
      reservedChanges = reserved.preview?.changes ?? [],
      reservedPolluted = Object.freeze({
        ...reserved,
        preview: {
          ...reserved.preview!,
          changes: Object.freeze([
            ...reserved.preview!.changes,
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
    let reservedParserRejected = false;
    try {
      parseProfileHistorySnapshot(reservedPolluted, PROFILE_HISTORY_RESERVED_KEYS);
    } catch {
      reservedParserRejected = true;
    }
    const ports = createProfileHistoryPorts({
        store: historyStore,
        restore: () => Object.freeze({ status: 'ACCEPTED' as const, reason: null }),
      }),
      blockedPort = ports.restore('v3'),
      availablePort = ports.restore('v2'),
      selectKnown = ports.select('v2'),
      selectMissing = ports.select('missing'),
      plan = planProfileRestore({
        store: historyStore,
        profileId: 'academy',
        currentVersionId: 'v3',
        selectedVersionId: 'v2',
        engineVersion: PROFILE_HISTORY_ENGINE,
      });

    const scenarios = Object.freeze([
      scenarioOf('istoric gol', empty, emptyHarness, true),
      scenarioOf('lanț multi-versiune', chain, chainHarness, true),
      scenarioOf('previzualizare delta', preview, previewHarness, true),
      scenarioOf('cheie rezervată', reserved, reservedHarness),
      scenarioOf('motor incompatibil', engine, engineHarness, true),
      scenarioOf('restaurare confirmată', preview, restoreHarness),
      scenarioOf('60 cadre · plafon 10 Hz', preview, throttleHarness),
    ]);

    const checks = [
      check('contract-version', PROFILE_HISTORY_VERSION, PROFILE_HISTORY_VERSION, '078 contract'),
      check('empty-entries', 0, empty.entries.length, 'no version is fabricated'),
      check('empty-current', '—', empty.currentVersionId ?? '—', 'no current version'),
      check(
        'empty-restore-reason',
        'MISSING_VERSION',
        empty.restore.reason ?? '—',
        'no version to restore',
      ),
      check(
        'empty-restore-disabled',
        true,
        projectProfileHistory(empty).restore.disabled,
        'the control is disabled',
      ),
      check('empty-dom-rows', 0, emptyHarness.rows().length, 'the listbox has no option'),
      check(
        'empty-dom-text',
        true,
        emptyHarness.emptyNotice().textContent.includes(PROFILE_HISTORY_EMPTY_TEXT),
        'the explicit empty state is visible',
      ),
      check(
        'chain-order',
        'v1 → v2 → v3',
        chain.entries.map((entry) => entry.versionId).join(' → '),
        'base to tip',
      ),
      check(
        'chain-depths',
        '0,1,2',
        chain.entries.map((entry) => entry.depth).join(','),
        'depths increase',
      ),
      check(
        'chain-origins',
        'BASE,DERIVED,DERIVED',
        chain.entries.map((entry) => entry.origin).join(','),
        'provenance is kept',
      ),
      check('chain-current', 'v3', chain.currentVersionId ?? '—', 'current is the history tip'),
      check('chain-idle', 'NONE', chain.restore.action, 'nothing is requested without a selection'),
      check('chain-idle-reason', 'NO_SELECTION', chain.restore.reason ?? '—', 'closed idle reason'),
      check('chain-no-preview', true, chain.preview === null, 'no comparison without a selection'),
      check(
        'branching-order',
        'base → a-sibling → b-sibling',
        branchingOrder,
        'same depth uses the versionId tie-break',
      ),
      check(
        'preview-from-to',
        'v3 → v2',
        `${preview.preview?.fromVersionId} → ${preview.preview?.toVersionId}`,
        'current to selection',
      ),
      check('preview-change-count', 2, preview.preview?.changes.length ?? -1, 'two values differ'),
      check(
        'preview-zero-change',
        '0 m/s → 0.5 m/s',
        projectProfileHistory(preview).preview?.rows[1]?.changeLabel ?? 'missing',
        'a real zero stays visible',
      ),
      check(
        'preview-delta-source',
        'DELTA',
        preview.preview?.changes[1]?.source ?? 'missing',
        'the stored delta describes the exact transition',
      ),
      check(
        'preview-delta-reason',
        'Distanță mai mică în mers',
        preview.preview?.changes[1]?.reason ?? 'missing',
        'the stored reason is kept',
      ),
      check(
        'preview-snapshot-source',
        'SNAPSHOT',
        preview.preview?.changes[0]?.source ?? 'missing',
        'other keys use the snapshot comparison',
      ),
      check(
        'preview-snapshot-reason',
        PROFILE_HISTORY_CHANGE_WITHOUT_REASON,
        preview.preview?.changes[0]?.reason ?? 'missing',
        'no reason is invented',
      ),
      check(
        'preview-available',
        'AVAILABLE',
        preview.restore.action,
        'an explicit restore is possible',
      ),
      check(
        'preview-dom-changes',
        2,
        previewHarness.changeRows().length,
        'the preview rows are rendered',
      ),
      check(
        'reserved-record-value',
        7,
        reservedRecordValue,
        'the record carries a numeric R value',
      ),
      check(
        'reserved-excluded',
        'speed_delta_urban',
        reservedChanges.map((change) => change.key).join(','),
        'the R key is omitted from learnable changes',
      ),
      check(
        'reserved-parser-rejects',
        true,
        reservedParserRejected,
        'a reserved preview change is rejected',
      ),
      check(
        'engine-incompatible',
        3,
        engine.entries.filter((entry) => !entry.compatible).length,
        'every version is incompatible',
      ),
      check(
        'engine-restore',
        'ENGINE_MISMATCH',
        engine.restore.reason ?? '—',
        'the restore reports incompatibility',
      ),
      check(
        'engine-preview-present',
        true,
        engine.preview !== null,
        'values can still be compared',
      ),
      check(
        'engine-reason-text',
        true,
        engineHarness.root().textContent.includes('altă versiune de motor'),
        'the incompatibility is visible text',
      ),
      check(
        'engine-disabled',
        true,
        projectProfileHistory(engine).restore.disabled,
        'the restore control is disabled',
      ),
      check(
        'selection-does-not-restore',
        0,
        restoreCallsAfterSelection,
        'a row click only selects',
      ),
      check(
        'restore-first-click',
        0,
        restoreCallsAfterFirstClick,
        'the first click only opens the confirmation',
      ),
      check(
        'restore-confirmation-visible',
        true,
        confirmationVisible,
        'the confirm control is visible',
      ),
      check(
        'restore-confirming-stats',
        true,
        confirmingStats,
        'the adapter reports the confirmation step',
      ),
      check(
        'restore-confirm-call',
        'v2',
        restoreCallsAfterConfirm.join(','),
        'the explicit confirmation emits one intent',
      ),
      check(
        'restore-status',
        true,
        restoreStatus.includes('Restaurare solicitată pentru v2'),
        'the request is reported',
      ),
      check(
        'restore-store-unchanged',
        storeBeforeRestore,
        storeAfterRestore,
        'nothing is written to the store',
      ),
      check(
        'throttled-updates',
        true,
        throttledUpdates <= 10,
        `60 frames produced ${throttledUpdates} updates`,
      ),
      check(
        'throttled-skipped',
        true,
        throttledSkipped >= 45,
        'the ceiling skips the frames it cannot write',
      ),
      check(
        'throttled-writes',
        true,
        (throttledStats.writes as number) > (throttleFirstWrites as number),
        'accepted frames wrote text',
      ),
      check(
        'version-bypass',
        throttledUpdates + 1,
        bypassUpdates,
        'a selection change bypasses the ceiling',
      ),
      check(
        'identical-writes',
        identicalWrites,
        identicalAfterWrites,
        'an identical frame writes nothing',
      ),
      check(
        'identical-updates',
        identicalUpdates,
        identicalHarness.panel.getStats().updates,
        'an identical frame is not a render',
      ),
      check('identical-skipped', 1, identicalSkipped, 'the repeated frame is skipped'),
      check('identical-dom', identicalDom, identicalDomAfter, 'the DOM stays byte-identical'),
      check('rejected-frames', 3, rejectedFrames, 'three malformed/stale frames throw'),
      check(
        'rejected-dom',
        rejectedDom,
        rejectedDomAfter,
        'a rejected frame never touches the DOM',
      ),
      check(
        'rejected-writes',
        rejectedWrites,
        rejectedWritesAfter,
        'a rejected frame writes nothing',
      ),
      check('stable-nodes', true, stableSame, 'row nodes are reused per versionId'),
      check(
        'stable-created',
        stableCreated,
        stableHarness.panel.getStats().created,
        'no row is recreated',
      ),
      check('no-global-listeners', 0, chainHarness.host.listenerCount, 'no global key listener'),
      check('plan-available', 'AVAILABLE', plan.action, 'the planner accepts a compatible restore'),
      check(
        'ports-select',
        true,
        selectKnown && !selectMissing,
        'select reports whether the version exists',
      ),
      check(
        'ports-blocked',
        'SAME_VERSION',
        blockedPort.reason ?? '—',
        'a blocked plan never reaches the host',
      ),
      check('ports-accepted', true, availablePort.accepted, 'the host outcome is propagated'),
      check(
        'deterministic-dom',
        previewHarness.dom(),
        (() => {
          const repeat = createProfileHistoryHarness({ open: true });
          repeat.panel.update(preview, 0);
          const dom = repeat.dom();
          repeat.panel.dispose();
          return dom;
        })(),
        'the same frame renders byte-identical DOM',
      ),
    ];
    const passed = checks.filter((entry) => entry.pass).length;
    return Object.freeze({
      version: PROFILE_HISTORY_VERSION,
      contract: Object.freeze({
        rules: Object.freeze([
          'versionId is the only row identity; a stored version is never edited or reused',
          'the change list is derived from two immutable snapshots and never written back',
          'reserved R keys never appear as learnable preview changes',
          'a selection only previews; restoration needs the restore button and a second confirmation',
          'an incompatible engine or profile blocks the restore with a closed reason',
          'the adapter never reads or writes the store; 109/110/114 own persistence and activation',
        ]),
        limits: Object.freeze({
          maximumHz: PROFILE_HISTORY_LIMITS.maximumHz,
          versions: PROFILE_HISTORY_LIMITS.versions,
          changes: PROFILE_HISTORY_LIMITS.changes,
          idCodeUnits: PROFILE_HISTORY_LIMITS.idCodeUnits,
          decimals: PROFILE_HISTORY_LIMITS.decimals,
        }),
      }),
      scenarios,
      checks: Object.freeze(checks),
      summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
    });
  } finally {
    for (const harness of [
      emptyHarness,
      chainHarness,
      previewHarness,
      reservedHarness,
      engineHarness,
      restoreHarness,
      throttleHarness,
      identicalHarness,
      rejectedHarness,
      stableHarness,
    ])
      harness.panel.dispose();
  }
}

export function profileHistoryReportMarkdown(report: ProfileHistoryReport): string {
  const scenarioSections = report.scenarios
      .map(
        (entry) => `### ${entry.name}

| Value | Result |
| --- | --- |
| Profile | ${entry.profileId} |
| Current / selected | ${entry.currentVersionId} / ${entry.selectedVersionId} |
| Empty | ${entry.empty} |
| Restore | ${entry.restore.action} (${entry.restore.reason}) · disabled: ${entry.restore.disabled} |
| Changes | ${entry.changes.length} |
| Summary | ${entry.summary} |

| # | Version | State | Depth | Origin | Engine | Compatible |
| ---: | --- | --- | ---: | --- | --- | --- |
${entry.rows
  .map(
    (row, index) =>
      `| ${index + 1} | ${row.versionId} | ${row.state} | ${row.depth} | ${row.origin} | ${row.engine} | ${row.compatible ? 'yes' : `no (${row.incompatibility})`} |`,
  )
  .join('\n')}

${entry.changes.length === 0 ? 'No preview changes.' : ''}
${entry.changes
  .map((row) => `- ${row.key}: ${row.change}; ${row.source}; ${row.reason}`)
  .join('\n')}

${
  entry.dom === null
    ? ''
    : `\`\`\`html
${entry.dom}
\`\`\`
`
}
`,
      )
      .join('\n'),
    checkRows = report.checks
      .map(
        (entry) =>
          `| ${entry.name} | ${String(entry.expected)} | ${String(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.detail} |`,
      )
      .join('\n');
  return `# 078 profile history report

Machine-readable transcript: [report.json](report.json). Generated by \`npm run profile:history\`; it
contains no wall-clock value, random value or browser-only state.

Version: \`${report.version}\`. The report drives the real \`createProfileHistoryPanel\` adapter over a
real 109 \`ProfileStore\` chain and the real 092 reserved keys.

## Contract

Rules: ${report.contract.rules.join('; ')}.

Limits: ${report.contract.limits.maximumHz} Hz write ceiling, ${report.contract.limits.versions}
versions, ${report.contract.limits.changes} preview changes and ${report.contract.limits.decimals}
decimals.

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
