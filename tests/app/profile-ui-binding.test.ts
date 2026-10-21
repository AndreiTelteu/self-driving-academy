import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PROFILE_UI_BINDING_VERSION,
  profileUiBindingReport,
  profileUiExpectedReasonCodes,
  profileUiMismatchCodes,
  readProfileUiBinding,
  verifyProfileUiConsistency,
} from '../../src/app';
import type { ProfileUiBinding, ProfileUiBindingRow } from '../../src/app';
import { parameterDefinitions } from '../../src/profiles';
import {
  BINDING_BASE,
  BINDING_CURRENT,
  BINDING_ENGINE,
  BINDING_HEADWAY_KEY,
  BINDING_NO_CHANGE_KEY,
  BINDING_NO_CHANGE_SEGMENT,
  BINDING_PROFILE,
  BINDING_RESERVED_KEY,
  BINDING_SEGMENT,
  BINDING_TARGET_KEYS,
  BINDING_TICK,
  BINDING_UNOBSERVED_KEY,
  BINDING_ZERO_KEY,
  baseParameters,
  bindingOf,
  bindingPipeline,
  changedExplanation,
  createBindingActivation,
  createBindingStore,
  currentParameters,
  noChangeExplanation,
  rowFor,
} from './profile-ui-binding-fixture';

interface ReadyBinding {
  readonly binding: ProfileUiBinding;
  readonly dispose: () => void;
}

function readyBinding(
  options: {
    readonly empty?: boolean;
    readonly withActivation?: boolean;
    readonly withExplanation?: boolean;
    readonly currentVersionId?: string | null;
    readonly selectedVersionId?: string | null;
  } = {},
): ReadyBinding {
  const store = createBindingStore({ empty: options.empty === true }),
    activation = options.withActivation === false ? null : createBindingActivation(BINDING_CURRENT),
    pipeline =
      options.withExplanation === true
        ? bindingPipeline({
            status: 'COMPOSED',
            versionId: BINDING_CURRENT,
            segmentId: BINDING_SEGMENT,
            key: BINDING_ZERO_KEY,
          })
        : undefined,
    binding = bindingOf({
      store,
      ...(activation === null ? {} : { activation: activation.activation }),
      ...(pipeline === undefined ? {} : { pipeline }),
      ...(options.withExplanation === true ? { explanation: changedExplanation() } : {}),
      ...(options.currentVersionId === undefined
        ? {}
        : { currentVersionId: options.currentVersionId }),
      ...(options.selectedVersionId === undefined
        ? {}
        : { selectedVersionId: options.selectedVersionId }),
    });
  return {
    binding,
    dispose: () => activation?.dispose(),
  };
}

function copyRows(
  binding: ProfileUiBinding,
  key: string,
  patch: Partial<ProfileUiBindingRow>,
): readonly ProfileUiBindingRow[] {
  return binding.rows.map((row) => (row.key === key ? Object.freeze({ ...row, ...patch }) : row));
}

test('113 the real 109 version is the same in panel, history and active target', () => {
  const ready = readyBinding();
  try {
    const { binding } = ready;
    assert.equal(PROFILE_UI_BINDING_VERSION, '113-profile-ui-binding-v1');
    assert.equal(binding.hasVersion, true);
    assert.equal(binding.versions.panel, BINDING_CURRENT);
    assert.equal(binding.versions.history, BINDING_CURRENT);
    assert.equal(binding.versions.active, BINDING_CURRENT);
    assert.equal(binding.panel?.profile?.versionId, BINDING_CURRENT);
    assert.equal(binding.history?.currentVersionId, BINDING_CURRENT);
    assert.equal(binding.panel?.illustrative, false);
    assert.equal(binding.pass, true);
    assert.deepEqual(binding.mismatches, []);
  } finally {
    ready.dispose();
  }
});

test('113 all 24 M keys report the same real value in panel and history', () => {
  const ready = readyBinding();
  try {
    const { binding } = ready,
      version = createBindingStore().getVersion(BINDING_CURRENT)!,
      observed = BINDING_TARGET_KEYS.filter(
        (definition) => definition.key !== BINDING_UNOBSERVED_KEY,
      );
    assert.equal(BINDING_TARGET_KEYS.length, 24);
    for (const definition of observed) {
      const row = rowFor(binding, definition.key);
      assert.equal(row.panelStatus, 'OBSERVED', definition.key);
      assert.equal(row.historyStatus, 'OBSERVED', definition.key);
      assert.equal(row.panelValue, version.parameters[definition.key], definition.key);
      assert.equal(row.historyValue, version.parameters[definition.key], definition.key);
      assert.equal(row.panelVersionId, BINDING_CURRENT);
      assert.equal(row.historyVersionId, BINDING_CURRENT);
    }
    assert.equal(observed.length, 23);
  } finally {
    ready.dispose();
  }
});

test('113 a reserved R key stays RESERVED/null even when the record holds a number', () => {
  const ready = readyBinding();
  try {
    const { binding } = ready,
      record = createBindingStore().getVersion(BINDING_CURRENT)!.parameters[BINDING_RESERVED_KEY];
    assert.equal(typeof record, 'number');
    const row = rowFor(binding, BINDING_RESERVED_KEY);
    assert.equal(row.reserved, true);
    assert.equal(row.panelStatus, 'RESERVED');
    assert.equal(row.panelValue, null);
    assert.equal(row.historyStatus, 'RESERVED');
    assert.equal(row.historyValue, null);
    assert.equal(row.deltaPrevious, null);
    assert.deepEqual(row.reasonCodes, ['RESERVED_V1']);
    assert.equal(binding.panel?.parameters.length, 80);
    assert.equal(
      binding.panel?.parameters.find((parameter) => parameter.key === BINDING_RESERVED_KEY)?.value,
      null,
    );
  } finally {
    ready.dispose();
  }
});

test('113 an unobserved key stays UNOBSERVED/null, never zero', () => {
  const ready = readyBinding();
  try {
    const { binding } = ready,
      version = createBindingStore().getVersion(BINDING_CURRENT)!;
    assert.equal(Object.hasOwn(version.parameters, BINDING_UNOBSERVED_KEY), false);
    const row = rowFor(binding, BINDING_UNOBSERVED_KEY);
    assert.equal(row.panelStatus, 'UNOBSERVED');
    assert.equal(row.panelValue, null);
    assert.equal(row.historyStatus, 'UNOBSERVED');
    assert.equal(row.historyValue, null);
    assert.deepEqual(row.reasonCodes, ['NOT_OBSERVED']);
    const report = profileUiBindingReport(binding);
    const reportRow = report.rows.find((entry) => entry.key === BINDING_UNOBSERVED_KEY)!;
    assert.equal(reportRow.unobserved, true);
    assert.equal(reportRow.history.value, null);
  } finally {
    ready.dispose();
  }
});

test('113 a real zero is OBSERVED/0 in panel and history, not a missing value', () => {
  const ready = readyBinding();
  try {
    const row = rowFor(ready.binding, BINDING_ZERO_KEY);
    assert.equal(row.panelStatus, 'OBSERVED');
    assert.equal(row.panelValue, 0);
    assert.equal(row.historyStatus, 'OBSERVED');
    assert.equal(row.historyValue, 0);
    assert.equal(row.deltaPrevious, 0.5);
    assert.equal(row.deltaNext, 0);
    assert.equal(row.historyDeltaPrevious, 0);
    assert.equal(row.historyDeltaNext, 0.5);
    assert.equal(row.reasonCodes.includes('ZERO_OBSERVED'), false);
  } finally {
    ready.dispose();
  }
});

test('113 the panel delta is the real parent→child delta and history compares both versions', () => {
  const ready = readyBinding();
  try {
    const { binding } = ready,
      versionBase = baseParameters(),
      versionCurrent = currentParameters();
    assert.equal(binding.versions.parent, BINDING_BASE);
    assert.equal(binding.versions.selected, BINDING_BASE);
    assert.equal(binding.delta?.baseVersionId, BINDING_BASE);
    const keys = binding.delta?.changes.map((change) => change.key).sort();
    assert.deepEqual(keys, [BINDING_HEADWAY_KEY, BINDING_ZERO_KEY]);
    for (const change of binding.delta?.changes ?? []) {
      assert.equal(change.previous, versionBase[change.key]);
      assert.equal(change.next, versionCurrent[change.key]);
    }
    assert.equal(binding.history?.preview?.fromVersionId, BINDING_CURRENT);
    assert.equal(binding.history?.preview?.toVersionId, BINDING_BASE);
    const zero = binding.history?.preview?.changes.find(
      (change) => change.key === BINDING_ZERO_KEY,
    );
    assert.equal(zero?.previous, 0);
    assert.equal(zero?.next, 0.5);
  } finally {
    ready.dispose();
  }
});

test('113 the changed reason codes match the real 104 explanation', () => {
  const ready = readyBinding({ withExplanation: true });
  try {
    const { binding } = ready,
      zero = rowFor(binding, BINDING_ZERO_KEY),
      headway = rowFor(binding, BINDING_HEADWAY_KEY);
    assert.equal(binding.explanation?.status, 'CHANGED');
    assert.equal(binding.explanation?.versionId, BINDING_CURRENT);
    assert.deepEqual(zero.reasonCodes, [
      'PROFILE_VALUE_BASE',
      'NO_EVIDENCE_RECORD',
      'CHANGED',
      'ZERO_OBSERVED',
    ]);
    assert.deepEqual(headway.reasonCodes, [
      'PROFILE_VALUE_BASE',
      'NO_EVIDENCE_RECORD',
      'CHANGED',
      'EVIDENCE_APPLIED',
    ]);
    assert.equal(binding.explanation?.reasonCodes[BINDING_ZERO_KEY], 'ZERO_OBSERVED');
    assert.equal(binding.pass, true);
  } finally {
    ready.dispose();
  }
});

test('113 a NO_CHANGE result explains the row without creating a version', () => {
  const store = createBindingStore(),
    activation = createBindingActivation(BINDING_CURRENT),
    before = JSON.stringify(store.listVersions(BINDING_PROFILE));
  try {
    const binding = bindingOf({
      store,
      activation: activation.activation,
      pipeline: bindingPipeline({
        status: 'NO_CHANGE',
        versionId: null,
        reason: 'NO_CHANGE',
        segmentId: BINDING_NO_CHANGE_SEGMENT,
        key: BINDING_NO_CHANGE_KEY,
      }),
      explanation: noChangeExplanation(),
    });
    const row = rowFor(binding, BINDING_NO_CHANGE_KEY);
    assert.equal(binding.explanation?.status, 'NO_CHANGE');
    assert.equal(binding.explanation?.versionId, null);
    assert.equal(binding.explanation?.noChangeReason, 'UNCHANGED_ESTIMATE');
    assert.deepEqual(row.reasonCodes, [
      'PROFILE_VALUE_BASE',
      'NO_EVIDENCE_RECORD',
      'NO_CHANGE',
      'UNCHANGED_ESTIMATE',
    ]);
    assert.equal(binding.pass, true);
    assert.equal(JSON.stringify(store.listVersions(BINDING_PROFILE)), before);
  } finally {
    activation.dispose();
  }
});

test('113 an injected version mismatch is reported and fails the binding', () => {
  const ready = readyBinding();
  try {
    const injected = Object.freeze({
      ...ready.binding,
      versions: Object.freeze({ ...ready.binding.versions, panel: 'v9' }),
    });
    const consistency = verifyProfileUiConsistency(injected);
    assert.equal(consistency.pass, false);
    assert.equal(consistency.mismatches.includes('VERSION_MISMATCH'), true);
    assert.equal(consistency.counts.VERSION_MISMATCH > 0, true);
  } finally {
    ready.dispose();
  }
});

test('113 an injected panel value mismatch is reported and fails the binding', () => {
  const ready = readyBinding();
  try {
    const original = rowFor(ready.binding, BINDING_HEADWAY_KEY);
    const injected = Object.freeze({
      ...ready.binding,
      rows: copyRows(ready.binding, BINDING_HEADWAY_KEY, {
        panelValue: (original.panelValue as number) + 0.25,
      }),
    });
    const consistency = verifyProfileUiConsistency(injected);
    assert.equal(consistency.pass, false);
    assert.equal(consistency.mismatches.includes('PANEL_VALUE_MISMATCH'), true);
    assert.equal(
      consistency.rowMismatches.some(
        (entry) =>
          entry.key === BINDING_HEADWAY_KEY && entry.codes.includes('PANEL_VALUE_MISMATCH'),
      ),
      true,
    );
  } finally {
    ready.dispose();
  }
});

test('113 an injected reserved-as-observed row is reported', () => {
  const ready = readyBinding();
  try {
    const injected = Object.freeze({
      ...ready.binding,
      rows: copyRows(ready.binding, BINDING_RESERVED_KEY, {
        reserved: false,
        observed: true,
        panelStatus: 'OBSERVED',
        panelValue: 5,
        panelEvidenceCount: 0,
        panelUncertainty: 0,
        evidenceReason: 'NO_EVIDENCE_RECORD',
        historyStatus: 'OBSERVED',
        historyValue: 5,
        reasonCodes: ['PROFILE_VALUE_BASE', 'NO_EVIDENCE_RECORD', 'NOT_CHANGED'],
      }),
    });
    const consistency = verifyProfileUiConsistency(injected);
    assert.equal(consistency.pass, false);
    assert.equal(consistency.mismatches.includes('RESERVED_TREATED_AS_OBSERVED'), true);
  } finally {
    ready.dispose();
  }
});

test('113 an injected unobserved-as-zero row is reported', () => {
  const ready = readyBinding();
  try {
    const injected = Object.freeze({
      ...ready.binding,
      rows: copyRows(ready.binding, BINDING_UNOBSERVED_KEY, {
        observed: true,
        panelStatus: 'OBSERVED',
        panelValue: 0,
        panelEvidenceCount: 0,
        panelUncertainty: 0,
        evidenceReason: 'NO_EVIDENCE_RECORD',
        historyStatus: 'OBSERVED',
        historyValue: 0,
        reasonCodes: ['PROFILE_VALUE_BASE', 'NO_EVIDENCE_RECORD', 'NOT_CHANGED'],
      }),
    });
    const consistency = verifyProfileUiConsistency(injected);
    assert.equal(consistency.pass, false);
    assert.equal(consistency.mismatches.includes('UNOBSERVED_TREATED_AS_ZERO'), true);
  } finally {
    ready.dispose();
  }
});

test('113 an injected delta base mismatch is reported', () => {
  const ready = readyBinding();
  try {
    const delta = ready.binding.delta!;
    const injected = Object.freeze({
      ...ready.binding,
      delta: Object.freeze({ ...delta, baseVersionId: 'v0' }),
    });
    const consistency = verifyProfileUiConsistency(injected);
    assert.equal(consistency.pass, false);
    assert.equal(consistency.mismatches.includes('DELTA_BASE_MISMATCH'), true);
  } finally {
    ready.dispose();
  }
});

test('113 an injected reason code mismatch is reported', () => {
  const ready = readyBinding({ withExplanation: true });
  try {
    const injected = Object.freeze({
      ...ready.binding,
      rows: copyRows(ready.binding, BINDING_ZERO_KEY, {
        reasonCodes: ['PROFILE_VALUE_BASE', 'NO_EVIDENCE_RECORD', 'CHANGED', 'EVIDENCE_APPLIED'],
      }),
    });
    const consistency = verifyProfileUiConsistency(injected);
    assert.equal(consistency.pass, false);
    assert.equal(consistency.mismatches.includes('REASON_CODE_MISMATCH'), true);
  } finally {
    ready.dispose();
  }
});

test('113 an injected history value mismatch is reported', () => {
  const ready = readyBinding();
  try {
    const history = ready.binding.history!,
      preview = history.preview!;
    const injected = Object.freeze({
      ...ready.binding,
      history: Object.freeze({
        ...history,
        preview: Object.freeze({
          ...preview,
          changes: Object.freeze(
            preview.changes.map((change) =>
              change.key === BINDING_ZERO_KEY
                ? Object.freeze({ ...change, previous: 0.25 })
                : change,
            ),
          ),
        }),
      }),
    });
    const consistency = verifyProfileUiConsistency(injected);
    assert.equal(consistency.pass, false);
    assert.equal(consistency.mismatches.includes('HISTORY_VALUE_MISMATCH'), true);
  } finally {
    ready.dispose();
  }
});

test('113 an injected active target mismatch is reported', () => {
  const ready = readyBinding();
  try {
    const injected = Object.freeze({
      ...ready.binding,
      versions: Object.freeze({ ...ready.binding.versions, active: BINDING_BASE }),
    });
    const consistency = verifyProfileUiConsistency(injected);
    assert.equal(consistency.pass, false);
    assert.equal(consistency.mismatches.includes('ACTIVE_TARGET_MISMATCH'), true);
  } finally {
    ready.dispose();
  }
});

test('113 no real version returns an explicit empty binding, not the illustrative preview', () => {
  const store = createBindingStore({ empty: true }),
    binding = bindingOf({ store });
  assert.equal(binding.hasVersion, false);
  assert.equal(binding.panel, null);
  assert.equal(binding.history, null);
  assert.equal(binding.rows.length, 0);
  assert.deepEqual(binding.mismatches, ['MISSING_VERSION']);
  assert.equal(binding.pass, false);
  assert.equal(JSON.stringify(binding).includes('Date ilustrative'), false);
  assert.equal(verifyProfileUiConsistency(binding).counts.MISSING_VERSION, 1);
});

test('113 missing evidence is explicit: count 0, uncertainty 0, NO_EVIDENCE_RECORD', () => {
  const ready = readyBinding();
  try {
    const observed = ready.binding.rows.filter((row) => row.observed);
    assert.equal(observed.length, 23);
    for (const row of observed) {
      assert.equal(row.panelEvidenceCount, 0, row.key);
      assert.equal(row.panelUncertainty, 0, row.key);
      assert.equal(row.evidenceReason, 'NO_EVIDENCE_RECORD', row.key);
      assert.equal(
        (row.reasonCodes as readonly string[]).includes('PROFILE_VALUE_LEARNED'),
        false,
        row.key,
      );
    }
    assert.equal(
      ready.binding.rows.some((row) => row.reasonCodes.includes('NO_EVIDENCE_RECORD')),
      true,
    );
  } finally {
    ready.dispose();
  }
});

test('113 the binding is deterministic and does not mutate the store or the fleet', () => {
  const ready = readyBinding({ withExplanation: true });
  try {
    const store = createBindingStore(),
      activation = createBindingActivation(BINDING_CURRENT),
      beforeVersions = JSON.stringify(store.listVersions(BINDING_PROFILE)),
      beforeActivation = JSON.stringify(activation.activation.stats());
    try {
      const first = readProfileUiBinding(
          {
            store,
            activation: activation.activation,
            pipeline: bindingPipeline({
              status: 'COMPOSED',
              versionId: BINDING_CURRENT,
              segmentId: BINDING_SEGMENT,
              key: BINDING_ZERO_KEY,
            }),
            explanation: changedExplanation(),
          },
          { tick: BINDING_TICK, profileId: BINDING_PROFILE },
        ),
        second = readProfileUiBinding(
          {
            store,
            activation: activation.activation,
            pipeline: bindingPipeline({
              status: 'COMPOSED',
              versionId: BINDING_CURRENT,
              segmentId: BINDING_SEGMENT,
              key: BINDING_ZERO_KEY,
            }),
            explanation: changedExplanation(),
          },
          { tick: BINDING_TICK, profileId: BINDING_PROFILE },
        );
      assert.equal(JSON.stringify(first), JSON.stringify(second));
      assert.equal(JSON.stringify(store.listVersions(BINDING_PROFILE)), beforeVersions);
      assert.equal(JSON.stringify(activation.activation.stats()), beforeActivation);
    } finally {
      activation.dispose();
    }
  } finally {
    ready.dispose();
  }
});

test('113 the per-key report exposes panel, history, active, delta and counts', () => {
  const ready = readyBinding();
  try {
    const report = profileUiBindingReport(ready.binding);
    assert.equal(report.rows.length, 80);
    assert.equal(report.counts.rows, 80);
    assert.equal(report.counts.observed, 23);
    assert.equal(report.counts.unobserved, 1);
    assert.equal(report.counts.reserved, 56);
    assert.equal(report.counts.changed, 2);
    assert.equal(report.counts.mismatchedRows, 0);
    assert.equal(report.pass, true);
    assert.deepEqual(report.mismatches, []);
    for (const row of report.rows) {
      assert.equal(row.versions.panel, BINDING_CURRENT);
      assert.equal(row.versions.history, BINDING_CURRENT);
      assert.equal(row.versions.active, BINDING_CURRENT);
    }
    const zero = report.rows.find((row) => row.key === BINDING_ZERO_KEY)!;
    assert.equal(zero.panel.value, 0);
    assert.equal(zero.history.value, 0);
    assert.equal(zero.delta?.previous, 0.5);
    assert.equal(zero.delta?.next, 0);
    assert.equal(zero.historyDelta?.previous, 0);
    assert.equal(zero.historyDelta?.next, 0.5);
  } finally {
    ready.dispose();
  }
});

test('113 a pinned current version is honoured and the catalog defines the reason vocabulary', () => {
  const ready = readyBinding({ withActivation: false, currentVersionId: BINDING_BASE });
  try {
    assert.equal(ready.binding.versions.panel, BINDING_BASE);
    assert.equal(ready.binding.versions.selected, null);
    assert.equal(ready.binding.delta, null);
    assert.equal(ready.binding.history?.preview, null);
    assert.equal(ready.binding.pass, true);
  } finally {
    ready.dispose();
  }
  assert.deepEqual(
    profileUiExpectedReasonCodes({
      reserved: false,
      observed: true,
      changed: false,
      explanationCode: null,
      noChangeReason: null,
    }),
    ['PROFILE_VALUE_BASE', 'NO_EVIDENCE_RECORD', 'NOT_CHANGED'],
  );
  assert.equal(profileUiMismatchCodes.length, 9);
  assert.equal(parameterDefinitions.length, 80);
  assert.equal(BINDING_ENGINE, 'engine:113.1');
});
