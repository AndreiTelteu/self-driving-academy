import type { ProfileActivation } from '../fleet';
import { getParameterDefinition, parameterDefinitions } from '../profiles';
import type {
  DrivingProfile,
  ParameterDefinition,
  ParameterEvidence,
  ParameterUnit,
  ProfileStore,
  ProfileVersion,
} from '../profiles';
import { isProfilePanelReserved } from '../ui';
import type {
  LearningExplanationSnapshot,
  ProfileHistorySnapshot,
  ProfilePanelParameter,
  ProfilePanelSnapshot,
  ProfilePanelStatus,
} from '../ui';
import { readProfileHistorySnapshot } from './profile-history';
import { readProfilePanelSnapshot } from './profile-panel';

/**
 * 113 UI binding.
 *
 * One immutable 109 `ProfileVersion` is projected into the three real read models the player sees:
 * the 077 panel snapshot, the 078 history snapshot and the 110 active/pending target. When the host
 * also supplies the 104 explanation produced from the last 103 result, the same binding carries its
 * closed reason codes. Nothing here is illustrative: without a stored version the binding is empty
 * and reports `MISSING_VERSION` instead of falling back to the 077 catalog preview.
 *
 * A bare 109 version stores values but not per-key provenance or evidence. The binding therefore
 * never invents evidence: observed rows are `OBSERVED` with `PROFILE_VALUE_BASE`, evidence count `0`,
 * uncertainty `0` and the explicit `NO_EVIDENCE_RECORD` reason. Reserved (R/`extension`) keys stay
 * `RESERVED`/`null` even when the record contains a number, and absent keys stay `UNOBSERVED`/`null`
 * (a real `0` is never used for absence).
 *
 * `verifyProfileUiConsistency` re-checks the projections against the captured 109 truth and reports
 * closed mismatches. It never repairs a value, a version or a reason.
 */
export const PROFILE_UI_BINDING_VERSION = '113-profile-ui-binding-v1' as const;

/** Documented local context until the live session host injects its own identity. */
export const PROFILE_UI_BINDING_LOCAL_CONTEXT = Object.freeze({
  sessionId: 'profile:ui-binding:local',
  worldEpoch: 0,
});

export const profileUiMismatchCodes = [
  'VERSION_MISMATCH',
  'PANEL_VALUE_MISMATCH',
  'HISTORY_VALUE_MISMATCH',
  'ACTIVE_TARGET_MISMATCH',
  'DELTA_BASE_MISMATCH',
  'RESERVED_TREATED_AS_OBSERVED',
  'UNOBSERVED_TREATED_AS_ZERO',
  'REASON_CODE_MISMATCH',
  'MISSING_VERSION',
] as const;
export type ProfileUiMismatchCode = (typeof profileUiMismatchCodes)[number];

/** Closed reason vocabulary of one binding row, per key. */
export const profileUiReasonCodes = [
  'RESERVED_V1',
  'NOT_OBSERVED',
  'PROFILE_VALUE_BASE',
  'NO_EVIDENCE_RECORD',
  'CHANGED',
  'NOT_CHANGED',
  'DELTA_RECORDED',
  'EVIDENCE_APPLIED',
  'ZERO_OBSERVED',
  'NO_CHANGE',
  'NO_NEW_EVIDENCE',
  'WEAK_EVIDENCE',
  'BELOW_THRESHOLD',
  'UNCHANGED_ESTIMATE',
] as const;
export type ProfileUiReasonCode = (typeof profileUiReasonCodes)[number];

export const PROFILE_UI_BINDING_LIMITS = Object.freeze({
  version: PROFILE_UI_BINDING_VERSION,
  /** The 092 catalog is fixed at 80 keys; every key has exactly one row. */
  parameters: 80,
  retainedViews: 1,
  history: 0,
});

/** Structural view of a 109 delta change, kept free of the storage type. */
export interface ProfileUiBindingDeltaChange {
  readonly key: string;
  readonly unit: string;
  readonly previous: number;
  readonly next: number;
  readonly reason: string | null;
}

/**
 * The real 109 evidence captured once, at binding time. The verifier compares every projection
 * against this snapshot, so a tampered panel or history value is visible instead of trusted.
 */
export interface ProfileUiBindingSource {
  readonly versionId: string;
  readonly parentVersionId: string | null;
  readonly engineVersion: string;
  readonly parameters: Readonly<Record<string, number>>;
  readonly parentParameters: Readonly<Record<string, number>> | null;
  readonly selectedVersionId: string | null;
  readonly selectedParameters: Readonly<Record<string, number>> | null;
  readonly selectedIsParent: boolean;
  /** `false` for a bare 109 version: no per-key evidence record exists. */
  readonly hasEvidence: boolean;
  readonly delta: readonly ProfileUiBindingDeltaChange[];
  readonly deltaReason: string | null;
}

/** One recent 112 result, reduced to what the UI binding actually checks. */
export interface ProfileUiBindingPipelineSummary {
  readonly available: boolean;
  readonly segmentId: string | null;
  readonly status: string | null;
  readonly versionId: string | null;
  readonly reason: string | null;
  /** Composition key of the last result, used only for the 104 `NO_CHANGE` explanation. */
  readonly key: string | null;
}

export interface ProfileUiBindingExplanationChange {
  readonly key: string;
  readonly previous: number;
  readonly next: number;
  readonly reasonCode: string;
}

export interface ProfileUiBindingExplanationSummary {
  readonly status: string;
  readonly versionId: string | null;
  readonly segmentId: string;
  readonly noChangeReason: string | null;
  readonly changes: readonly ProfileUiBindingExplanationChange[];
  readonly reasonCodes: Readonly<Record<string, string>>;
}

/** One catalog key as the panel, the history and the delta report it. */
export interface ProfileUiBindingRow {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly reserved: boolean;
  readonly observed: boolean;
  readonly panelVersionId: string | null;
  readonly panelStatus: ProfilePanelStatus | null;
  readonly panelValue: number | null;
  readonly panelEvidenceCount: number | null;
  readonly panelUncertainty: number | null;
  /** Explicit evidence absence; `null` when the row has evidence or no observed value. */
  readonly evidenceReason: 'NO_EVIDENCE_RECORD' | null;
  readonly historyVersionId: string | null;
  readonly historyStatus: ProfilePanelStatus;
  readonly historyValue: number | null;
  readonly deltaPrevious: number | null;
  readonly deltaNext: number | null;
  readonly deltaReason: string | null;
  readonly historyDeltaPrevious: number | null;
  readonly historyDeltaNext: number | null;
  readonly reasonCodes: readonly ProfileUiReasonCode[];
}

export interface ProfileUiBindingVersions {
  readonly panel: string | null;
  readonly history: string | null;
  readonly active: string | null;
  readonly parent: string | null;
  readonly selected: string | null;
}

export interface ProfileUiBinding {
  readonly version: typeof PROFILE_UI_BINDING_VERSION;
  readonly tick: number;
  readonly profileId: string;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly hasVersion: boolean;
  readonly hasActivation: boolean;
  readonly versions: ProfileUiBindingVersions;
  /** Captured 109 truth; `null` only for the explicit empty binding. */
  readonly source: ProfileUiBindingSource | null;
  readonly rows: readonly ProfileUiBindingRow[];
  readonly delta: ProfilePanelDeltaView | null;
  readonly explanation: ProfileUiBindingExplanationSummary | null;
  readonly pipeline: ProfileUiBindingPipelineSummary;
  readonly panel: ProfilePanelSnapshot | null;
  readonly history: ProfileHistorySnapshot | null;
  readonly mismatches: readonly ProfileUiMismatchCode[];
  readonly pass: boolean;
}

/** Structural subset of 077's delta so the binding keeps the real change list, excluding R keys. */
export type ProfilePanelDeltaView = NonNullable<ProfilePanelSnapshot['delta']>;

/** Structural 112 view; the real `ProfilePipeline` satisfies it. */
export interface ProfileUiBindingPipeline {
  history(): readonly {
    readonly segmentId: string;
    readonly status: string;
    readonly reason: string | null;
    readonly versionId: string | null;
    readonly composition: { readonly key: string } | null;
  }[];
}

/** Structural 110 view; the real controller satisfies it. */
export type ProfileUiBindingActivation = Pick<
  ProfileActivation,
  'profileId' | 'engineVersion' | 'activeProfile' | 'pending'
>;

export interface ProfileUiBindingSources {
  /** Real 109 store. It is only read. */
  readonly store: ProfileStore;
  /** Optional real 112 pipeline; its last result binds the 104 explanation. */
  readonly pipeline?: ProfileUiBindingPipeline;
  /** Optional real 110 controller; its active/pending target must match the panel version. */
  readonly activation?: ProfileUiBindingActivation;
  /** Optional real 104 snapshot produced by the host from the last 103 result. */
  readonly explanation?: LearningExplanationSnapshot | null;
}

export interface ProfileUiBindingFrame {
  readonly tick: number;
  readonly profileId: string;
  /** History selection; defaults to the parent of the shown version when it exists. */
  readonly selectedVersionId?: string | null;
  /** Host-pinned current version; defaults to the active target, then to the 109 tip. */
  readonly currentVersionId?: string | null;
}

export interface ProfileUiConsistency {
  readonly version: typeof PROFILE_UI_BINDING_VERSION;
  readonly pass: boolean;
  readonly mismatches: readonly ProfileUiMismatchCode[];
  readonly rowMismatches: readonly {
    readonly key: string;
    readonly codes: readonly ProfileUiMismatchCode[];
  }[];
  readonly counts: Readonly<Record<ProfileUiMismatchCode, number>>;
}

function fail(message: string, detail: string): never {
  throw new Error(`${message}: ${detail}`);
}

function hasOwn(record: Readonly<Record<string, number>>, key: string): boolean {
  return Object.hasOwn(record, key);
}

/** Explicit evidence absence: a bare 109 version has no per-key evidence record at all. */
function sourceOf(
  version: ProfileVersion,
  parent: ProfileVersion | null,
  selected: ProfileVersion | null,
  profileId: string,
): ProfileUiBindingSource {
  const delta = version.provenance.delta,
    selectedIsParent =
      selected !== null && version.parentVersionId !== null
        ? selected.versionId === version.parentVersionId
        : false;
  return Object.freeze({
    versionId: version.versionId,
    parentVersionId: version.parentVersionId,
    engineVersion: version.engineVersion,
    parameters: Object.freeze({ ...version.parameters }),
    parentParameters:
      parent !== null && parent.profileId === profileId
        ? Object.freeze({ ...parent.parameters })
        : null,
    selectedVersionId: selected?.versionId ?? null,
    selectedParameters:
      selected !== null && selected.profileId === profileId
        ? Object.freeze({ ...selected.parameters })
        : null,
    selectedIsParent,
    hasEvidence: false,
    delta:
      delta === null
        ? Object.freeze([])
        : Object.freeze(
            delta.changes.map((change) =>
              Object.freeze({
                key: change.key,
                unit: change.unit,
                previous: change.previousValue,
                next: change.newValue,
                reason: delta.reason,
              }),
            ),
          ),
    deltaReason: delta?.reason ?? null,
  });
}

/**
 * A 109 `ProfileVersion` is not a `DrivingProfile`: it has no per-key provenance or evidence. The
 * projection therefore marks every present value as `BASE` and every evidence slot as `null`; 077
 * then renders `OBSERVED` with evidence `0`, which is the explicit absence marker it already owns.
 */
function drivingProfileOf(version: ProfileVersion): DrivingProfile {
  const parameters: Record<string, number> = {},
    unitsByParameter: Record<string, ParameterUnit> = {},
    provenanceByParameter: Record<string, 'BASE'> = {},
    evidenceByParameter: Record<string, ParameterEvidence | null> = {};
  for (const key of Object.keys(version.parameters)) {
    const definition = getParameterDefinition(key);
    parameters[key] = version.parameters[key]!;
    unitsByParameter[key] = definition.unit;
    provenanceByParameter[key] = 'BASE';
    evidenceByParameter[key] = null;
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    profileId: version.profileId,
    versionId: version.versionId,
    parentVersionId: version.parentVersionId,
    engineVersion: version.engineVersion,
    parameters: Object.freeze(parameters),
    unitsByParameter: Object.freeze(unitsByParameter),
    provenanceByParameter: Object.freeze(provenanceByParameter),
    evidenceByParameter: Object.freeze(evidenceByParameter),
    sourceSegmentIds: Object.freeze([...version.sourceSegmentIds]),
    createdAt: version.createdAt,
    checksum: version.checksum,
  });
}

function explanationSummary(
  snapshot: LearningExplanationSnapshot | null,
): ProfileUiBindingExplanationSummary | null {
  if (snapshot === null) return null;
  const changes = snapshot.changes.map((change) =>
    Object.freeze({
      key: change.key,
      previous: change.previous,
      next: change.next,
      reasonCode: change.reason,
    }),
  );
  const reasonCodes: Record<string, string> = {};
  for (const change of changes) reasonCodes[change.key] = change.reasonCode;
  return Object.freeze({
    status: snapshot.status,
    versionId: snapshot.versionId,
    segmentId: snapshot.segmentId,
    noChangeReason: snapshot.noChangeReason,
    changes: Object.freeze(changes),
    reasonCodes: Object.freeze(reasonCodes),
  });
}

/** Expected closed codes for one row; shared by the producer and the verifier. */
export function profileUiExpectedReasonCodes(input: {
  readonly reserved: boolean;
  readonly observed: boolean;
  readonly changed: boolean;
  readonly explanationCode: string | null;
  readonly noChangeReason: string | null;
}): readonly ProfileUiReasonCode[] {
  if (input.reserved) return Object.freeze(['RESERVED_V1']);
  if (!input.observed) return Object.freeze(['NOT_OBSERVED']);
  const codes: ProfileUiReasonCode[] = ['PROFILE_VALUE_BASE', 'NO_EVIDENCE_RECORD'];
  if (input.changed) {
    codes.push('CHANGED');
    codes.push(
      input.explanationCode === 'EVIDENCE_APPLIED' || input.explanationCode === 'ZERO_OBSERVED'
        ? input.explanationCode
        : 'DELTA_RECORDED',
    );
  } else if (input.noChangeReason !== null) {
    codes.push('NO_CHANGE');
    const reason = input.noChangeReason as ProfileUiReasonCode;
    if (profileUiReasonCodes.includes(reason)) codes.push(reason);
  } else {
    codes.push('NOT_CHANGED');
  }
  return Object.freeze(codes);
}

function panelParameterOf(
  panel: ProfilePanelSnapshot,
  key: string,
): ProfilePanelParameter | undefined {
  return panel.parameters.find((parameter) => parameter.key === key);
}

function rowOf(
  definition: ParameterDefinition,
  panel: ProfilePanelSnapshot,
  versions: ProfileUiBindingVersions,
  delta: ProfilePanelDeltaView | null,
  history: ProfileHistorySnapshot | null,
  explanation: ProfileUiBindingExplanationSummary | null,
  pipelineKey: string | null,
): ProfileUiBindingRow {
  const key = definition.key,
    reserved = isProfilePanelReserved(definition),
    panelParameter = panelParameterOf(panel, key),
    panelRowValue = panelParameter?.value ?? null,
    panelObserved = panelParameter?.status === 'OBSERVED' && panelRowValue !== null,
    deltaChange = delta?.changes.find((change) => change.key === key) ?? null,
    historyChange = history?.preview?.changes.find((change) => change.key === key) ?? null,
    explanationChange = explanation?.changes.find((change) => change.key === key) ?? null,
    noChangeReason =
      pipelineKey === key && explanation !== null && explanation.status === 'NO_CHANGE'
        ? explanation.noChangeReason
        : null;
  return Object.freeze({
    key,
    label: definition.description,
    unit: definition.unit,
    reserved,
    observed: panelObserved,
    panelVersionId: versions.panel,
    panelStatus: panelParameter?.status ?? null,
    panelValue: panelRowValue,
    panelEvidenceCount: panelParameter?.evidenceCount ?? null,
    panelUncertainty: panelParameter?.uncertainty ?? null,
    evidenceReason: panelObserved ? 'NO_EVIDENCE_RECORD' : null,
    historyVersionId: versions.history,
    historyStatus: reserved ? 'RESERVED' : panelObserved ? 'OBSERVED' : 'UNOBSERVED',
    historyValue: panelObserved ? panelRowValue : null,
    deltaPrevious: deltaChange?.previous ?? null,
    deltaNext: deltaChange?.next ?? null,
    deltaReason: deltaChange?.reason ?? null,
    historyDeltaPrevious: historyChange?.previous ?? null,
    historyDeltaNext: historyChange?.next ?? null,
    reasonCodes: profileUiExpectedReasonCodes({
      reserved,
      observed: panelObserved,
      changed: deltaChange !== null,
      explanationCode: explanationChange?.reasonCode ?? null,
      noChangeReason,
    }),
  });
}

function mismatchCounts(
  mismatches: readonly ProfileUiMismatchCode[],
): Readonly<Record<ProfileUiMismatchCode, number>> {
  const counts = Object.fromEntries(profileUiMismatchCodes.map((code) => [code, 0])) as Record<
    ProfileUiMismatchCode,
    number
  >;
  for (const code of mismatches) counts[code] += 1;
  return Object.freeze(counts);
}

function orderedMismatches(
  set: ReadonlySet<ProfileUiMismatchCode>,
): readonly ProfileUiMismatchCode[] {
  return Object.freeze(profileUiMismatchCodes.filter((code) => set.has(code)));
}

function sameValue(left: number | null, right: number | null): boolean {
  return left === right;
}

function sameCodes(
  left: readonly ProfileUiReasonCode[],
  right: readonly ProfileUiReasonCode[],
): boolean {
  return left.length === right.length && left.every((code, index) => code === right[index]);
}

/**
 * Verifies the binding against its captured 109 truth and the attached 104 explanation. Every
 * mismatch is reported explicitly and nothing is repaired. `pass` is true only with zero mismatches.
 */
export function verifyProfileUiConsistency(binding: ProfileUiBinding): ProfileUiConsistency {
  const mismatches = new Set<ProfileUiMismatchCode>(),
    rowMismatches = new Map<string, Set<ProfileUiMismatchCode>>(),
    add = (code: ProfileUiMismatchCode, key?: string): void => {
      mismatches.add(code);
      if (key === undefined) return;
      const row = rowMismatches.get(key) ?? new Set<ProfileUiMismatchCode>();
      row.add(code);
      rowMismatches.set(key, row);
    };
  if (!binding.hasVersion || binding.source === null) {
    add('MISSING_VERSION');
  } else {
    const source = binding.source;
    if (
      binding.versions.panel !== source.versionId ||
      binding.versions.history !== source.versionId ||
      binding.versions.parent !== source.parentVersionId
    )
      add('VERSION_MISMATCH');
    if (binding.versions.selected !== source.selectedVersionId) add('VERSION_MISMATCH');
    if (binding.hasActivation) {
      if (binding.versions.active !== source.versionId) add('ACTIVE_TARGET_MISMATCH');
    } else if (binding.versions.active !== null) add('ACTIVE_TARGET_MISMATCH');
    if (
      binding.panel === null ||
      binding.history === null ||
      binding.panel.profile?.versionId !== source.versionId ||
      binding.history.currentVersionId !== source.versionId
    )
      add('MISSING_VERSION');

    const rows = new Map<string, ProfileUiBindingRow>();
    for (const row of binding.rows) {
      if (rows.has(row.key)) add('PANEL_VALUE_MISMATCH', row.key);
      rows.set(row.key, row);
    }
    if (rows.size !== parameterDefinitions.length) add('PANEL_VALUE_MISMATCH');

    for (const definition of parameterDefinitions) {
      const key = definition.key,
        row = rows.get(key),
        catalogReserved = isProfilePanelReserved(definition),
        observed = !catalogReserved && hasOwn(source.parameters, key),
        expectedPanelStatus: ProfilePanelStatus = catalogReserved
          ? 'RESERVED'
          : observed
            ? 'OBSERVED'
            : 'UNOBSERVED',
        expectedValue = observed ? source.parameters[key]! : null;
      if (row === undefined) {
        add('PANEL_VALUE_MISMATCH', key);
        continue;
      }
      if (row.reserved !== catalogReserved) add('RESERVED_TREATED_AS_OBSERVED', key);
      if (row.observed !== observed) {
        if (!observed && row.panelValue === 0) add('UNOBSERVED_TREATED_AS_ZERO', key);
        else add('PANEL_VALUE_MISMATCH', key);
      }
      if (row.panelStatus !== expectedPanelStatus) {
        if (expectedPanelStatus === 'RESERVED') add('RESERVED_TREATED_AS_OBSERVED', key);
        else if (expectedPanelStatus === 'UNOBSERVED' && row.panelValue === 0)
          add('UNOBSERVED_TREATED_AS_ZERO', key);
        else add('PANEL_VALUE_MISMATCH', key);
      }
      if (!sameValue(row.panelValue, expectedValue)) {
        if (catalogReserved) add('RESERVED_TREATED_AS_OBSERVED', key);
        else if (expectedValue === null && row.panelValue === 0)
          add('UNOBSERVED_TREATED_AS_ZERO', key);
        else add('PANEL_VALUE_MISMATCH', key);
      }
      if (row.panelVersionId !== source.versionId) add('VERSION_MISMATCH', key);
      if (observed) {
        if (row.evidenceReason !== 'NO_EVIDENCE_RECORD') add('REASON_CODE_MISMATCH', key);
        if (row.panelEvidenceCount !== 0 || row.panelUncertainty !== 0)
          add('PANEL_VALUE_MISMATCH', key);
      } else if (row.evidenceReason !== null || row.panelEvidenceCount !== 0) {
        add('PANEL_VALUE_MISMATCH', key);
      }
      const panelParameter =
        binding.panel === null ? undefined : panelParameterOf(binding.panel, key);
      if (
        panelParameter === undefined ||
        panelParameter.status !== row.panelStatus ||
        panelParameter.value !== row.panelValue
      )
        add('PANEL_VALUE_MISMATCH', key);

      const expectedHistoryValue = observed ? source.parameters[key]! : null;
      if (row.historyVersionId !== source.versionId) add('VERSION_MISMATCH', key);
      if (row.historyStatus !== expectedPanelStatus)
        add(
          expectedPanelStatus === 'UNOBSERVED'
            ? 'UNOBSERVED_TREATED_AS_ZERO'
            : catalogReserved
              ? 'RESERVED_TREATED_AS_OBSERVED'
              : 'HISTORY_VALUE_MISMATCH',
          key,
        );
      if (!sameValue(row.historyValue, expectedHistoryValue)) {
        if (catalogReserved) add('RESERVED_TREATED_AS_OBSERVED', key);
        else if (expectedHistoryValue === null && row.historyValue === 0)
          add('UNOBSERVED_TREATED_AS_ZERO', key);
        else add('HISTORY_VALUE_MISMATCH', key);
      }

      const expectedDelta = catalogReserved
          ? null
          : (source.delta.find((change) => change.key === key) ?? null),
        actualDelta =
          row.deltaPrevious === null && row.deltaNext === null
            ? null
            : { previous: row.deltaPrevious, next: row.deltaNext };
      if (catalogReserved && actualDelta !== null) add('RESERVED_TREATED_AS_OBSERVED', key);
      if (expectedDelta === null) {
        if (actualDelta !== null) add('PANEL_VALUE_MISMATCH', key);
      } else if (
        row.deltaPrevious !== expectedDelta.previous ||
        row.deltaNext !== expectedDelta.next
      ) {
        add('PANEL_VALUE_MISMATCH', key);
      }
      if (
        expectedDelta !== null &&
        row.deltaReason !== (source.deltaReason ?? 'Motiv nespecificat')
      )
        add('REASON_CODE_MISMATCH', key);

      const expectedHistoryDelta =
        source.selectedParameters === null
          ? null
          : {
              previous: hasOwn(source.parameters, key) ? source.parameters[key]! : null,
              next: hasOwn(source.selectedParameters, key) ? source.selectedParameters[key]! : null,
            };
      const historyDeltaHasValue =
        expectedHistoryDelta !== null &&
        (expectedHistoryDelta.previous !== expectedHistoryDelta.next ||
          (expectedHistoryDelta.previous === null) !== (expectedHistoryDelta.next === null))
          ? expectedHistoryDelta
          : null;
      const actualHistoryDelta =
        row.historyDeltaPrevious === null && row.historyDeltaNext === null
          ? null
          : { previous: row.historyDeltaPrevious, next: row.historyDeltaNext };
      if (catalogReserved && actualHistoryDelta !== null) add('RESERVED_TREATED_AS_OBSERVED', key);
      if (historyDeltaHasValue === null) {
        if (actualHistoryDelta !== null) add('HISTORY_VALUE_MISMATCH', key);
      } else if (
        row.historyDeltaPrevious !== historyDeltaHasValue.previous ||
        row.historyDeltaNext !== historyDeltaHasValue.next
      ) {
        const nullSide =
          historyDeltaHasValue.previous === null || historyDeltaHasValue.next === null;
        if (nullSide && (row.historyDeltaPrevious === 0 || row.historyDeltaNext === 0))
          add('UNOBSERVED_TREATED_AS_ZERO', key);
        else add('HISTORY_VALUE_MISMATCH', key);
      }

      const explanationCode = binding.explanation?.reasonCodes[key] ?? null,
        noChangeReason =
          binding.pipeline.key === key &&
          binding.explanation !== null &&
          binding.explanation.status === 'NO_CHANGE'
            ? binding.explanation.noChangeReason
            : null,
        expectedCodes = profileUiExpectedReasonCodes({
          reserved: catalogReserved,
          observed,
          changed: expectedDelta !== null,
          explanationCode,
          noChangeReason,
        });
      if (!sameCodes(row.reasonCodes, expectedCodes)) add('REASON_CODE_MISMATCH', key);
    }

    if (binding.rows.length !== parameterDefinitions.length) add('PANEL_VALUE_MISMATCH');

    const expectedDeltaChanges = source.delta.filter((change) => !isReservedKey(change.key));
    if (binding.delta === null) {
      if (expectedDeltaChanges.length > 0) add('DELTA_BASE_MISMATCH');
    } else {
      if (binding.delta.baseVersionId !== source.parentVersionId) add('DELTA_BASE_MISMATCH');
      if (binding.delta.changes.length !== expectedDeltaChanges.length) add('PANEL_VALUE_MISMATCH');
      for (const expected of expectedDeltaChanges) {
        const actual = binding.delta.changes.find((change) => change.key === expected.key);
        if (
          actual === undefined ||
          actual.previous !== expected.previous ||
          actual.next !== expected.next
        )
          add('PANEL_VALUE_MISMATCH', expected.key);
        else if (actual.reason !== (source.deltaReason ?? 'Motiv nespecificat'))
          add('REASON_CODE_MISMATCH', expected.key);
      }
    }

    const preview = binding.history?.preview ?? null;
    if (preview !== null && source.selectedIsParent) {
      if (preview.toVersionId !== binding.delta?.baseVersionId) add('DELTA_BASE_MISMATCH');
      if (preview.toVersionId !== source.parentVersionId) add('DELTA_BASE_MISMATCH');
    }
    if (preview !== null) {
      if (preview.fromVersionId !== source.versionId) add('VERSION_MISMATCH');
      if (preview.toVersionId !== source.selectedVersionId) add('VERSION_MISMATCH');
      const expectedHistory = historyChangesOf(source);
      if (preview.changes.length !== expectedHistory.length) add('HISTORY_VALUE_MISMATCH');
      for (const expected of expectedHistory) {
        const actual = preview.changes.find((change) => change.key === expected.key);
        if (
          actual === undefined ||
          actual.previous !== expected.previous ||
          actual.next !== expected.next
        )
          add('HISTORY_VALUE_MISMATCH', expected.key);
      }
    }
  }

  const explanation = binding.explanation,
    pipeline = binding.pipeline;
  if (explanation !== null) {
    const expectedPipeline =
      explanation.status === 'CHANGED'
        ? explanation.versionId !== null &&
          explanation.versionId === pipeline.versionId &&
          pipeline.available
        : explanation.status === 'NO_CHANGE'
          ? pipeline.available &&
            pipeline.status === 'NO_CHANGE' &&
            pipeline.versionId === null &&
            explanation.versionId === null
          : pipeline.available && pipeline.segmentId === explanation.segmentId;
    if (!expectedPipeline) add('REASON_CODE_MISMATCH');
    if (
      pipeline.available &&
      pipeline.segmentId !== null &&
      explanation.segmentId !== pipeline.segmentId
    )
      add('REASON_CODE_MISMATCH');
    if (explanation.status === 'CHANGED' && binding.source !== null) {
      if (explanation.versionId !== binding.source.versionId) add('REASON_CODE_MISMATCH');
      const changedKeys = explanation.changes.map((change) => change.key).sort(),
        deltaKeys = binding.source.delta
          .map((change) => change.key)
          .filter((key) => !isReservedKey(key))
          .sort();
      if (changedKeys.join(',') !== deltaKeys.join(',')) add('REASON_CODE_MISMATCH');
      for (const change of explanation.changes) {
        const expected = binding.source.delta.find((entry) => entry.key === change.key);
        if (
          expected === undefined ||
          change.previous !== expected.previous ||
          change.next !== expected.next
        )
          add('REASON_CODE_MISMATCH', change.key);
      }
    }
  }

  const ordered = orderedMismatches(mismatches),
    serializedRows = [...rowMismatches.entries()]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, codes]) => Object.freeze({ key, codes: orderedMismatches(codes) }));
  return Object.freeze({
    version: PROFILE_UI_BINDING_VERSION,
    pass: ordered.length === 0,
    mismatches: ordered,
    rowMismatches: Object.freeze(serializedRows),
    counts: mismatchCounts(ordered),
  });
}

function isReservedKey(key: string): boolean {
  try {
    return isProfilePanelReserved(getParameterDefinition(key));
  } catch {
    return false;
  }
}

function historyChangesOf(source: ProfileUiBindingSource): readonly {
  readonly key: string;
  readonly previous: number | null;
  readonly next: number | null;
}[] {
  if (source.selectedParameters === null) return Object.freeze([]);
  const keys = new Set<string>([
      ...Object.keys(source.parameters),
      ...Object.keys(source.selectedParameters),
    ]),
    changes: { key: string; previous: number | null; next: number | null }[] = [];
  for (const key of [...keys].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))) {
    if (isReservedKey(key)) continue;
    const previous = hasOwn(source.parameters, key) ? source.parameters[key]! : null,
      next = hasOwn(source.selectedParameters, key) ? source.selectedParameters[key]! : null;
    if (previous === next) continue;
    changes.push({ key, previous, next });
  }
  return Object.freeze(changes);
}

function pipelineSummaryOf(
  pipeline: ProfileUiBindingPipeline | undefined,
): ProfileUiBindingPipelineSummary {
  if (pipeline === undefined) {
    return Object.freeze({
      available: false,
      segmentId: null,
      status: null,
      versionId: null,
      reason: null,
      key: null,
    });
  }
  const last = pipeline.history().at(-1);
  if (last === undefined) {
    return Object.freeze({
      available: false,
      segmentId: null,
      status: null,
      versionId: null,
      reason: null,
      key: null,
    });
  }
  return Object.freeze({
    available: true,
    segmentId: last.segmentId,
    status: last.status,
    versionId: last.versionId,
    reason: last.reason,
    key: last.composition?.key ?? null,
  });
}

function emptyBinding(input: {
  readonly frame: ProfileUiBindingFrame;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly hasActivation: boolean;
  readonly active: string | null;
  readonly pipeline: ProfileUiBindingPipelineSummary;
}): ProfileUiBinding {
  return Object.freeze({
    version: PROFILE_UI_BINDING_VERSION,
    tick: input.frame.tick,
    profileId: input.frame.profileId,
    sessionId: input.sessionId,
    worldEpoch: input.worldEpoch,
    hasVersion: false,
    hasActivation: input.hasActivation,
    versions: Object.freeze({
      panel: null,
      history: null,
      active: input.active,
      parent: null,
      selected: input.frame.selectedVersionId ?? null,
    }),
    source: null,
    rows: Object.freeze([]),
    delta: null,
    explanation: null,
    pipeline: input.pipeline,
    panel: null,
    history: null,
    mismatches: Object.freeze(['MISSING_VERSION'] as const),
    pass: false,
  });
}

function activeTargetOf(sources: ProfileUiBindingSources): {
  readonly id: string | null;
  readonly profileId: string | null;
} {
  if (sources.activation === undefined) return { id: null, profileId: null };
  try {
    const reference = sources.activation.activeProfile();
    return { id: reference.versionId, profileId: reference.profileId };
  } catch {
    return { id: null, profileId: null };
  }
}

/**
 * Reads the real 109 version (explicit pin, then the 110 active/pending target, then the history
 * tip), builds 077/078 from that immutable record and binds the optional 104 explanation to the last
 * 112 result. It never writes the store, the fleet or the pipeline. Without a stored version it
 * returns the explicit empty binding, never the illustrative catalogue preview.
 */
export function readProfileUiBinding(
  sources: ProfileUiBindingSources,
  frame: ProfileUiBindingFrame,
): ProfileUiBinding {
  const sessionId = PROFILE_UI_BINDING_LOCAL_CONTEXT.sessionId,
    worldEpoch = PROFILE_UI_BINDING_LOCAL_CONTEXT.worldEpoch,
    hasActivation = sources.activation !== undefined,
    active = activeTargetOf(sources),
    pipeline = pipelineSummaryOf(sources.pipeline),
    empty = (): ProfileUiBinding =>
      emptyBinding({
        frame,
        sessionId,
        worldEpoch,
        hasActivation,
        active: active.id,
        pipeline,
      });
  if (typeof frame.profileId !== 'string' || frame.profileId.trim().length === 0)
    fail('Profile UI binding has no profile id', 'profileId');

  let target: ProfileVersion | null = null;
  if (frame.currentVersionId !== undefined && frame.currentVersionId !== null) {
    target = sources.store.getVersion(frame.currentVersionId);
  } else if (active.id !== null) {
    target = sources.store.getVersion(active.id);
    if (target === null || target.profileId !== frame.profileId) return empty();
  } else {
    target = sources.store.getHistory(frame.profileId).at(-1) ?? null;
  }
  if (target === null || target.profileId !== frame.profileId) return empty();
  if (active.id !== null && active.profileId !== frame.profileId) return empty();

  const parent =
      target.parentVersionId === null ? null : sources.store.getVersion(target.parentVersionId),
    selectedVersionId =
      frame.selectedVersionId !== undefined
        ? frame.selectedVersionId
        : (target.parentVersionId ?? null),
    selected = selectedVersionId === null ? null : sources.store.getVersion(selectedVersionId),
    versions: ProfileUiBindingVersions = Object.freeze({
      panel: target.versionId,
      history: target.versionId,
      active: active.id,
      parent: target.parentVersionId,
      selected: selectedVersionId,
    });

  const panel = readProfilePanelSnapshot(
    { catalog: parameterDefinitions },
    {
      tick: frame.tick,
      profile: drivingProfileOf(target),
      delta: target.provenance.delta,
      sessionId,
      worldEpoch,
    },
  );
  const history = readProfileHistorySnapshot(
    { store: sources.store },
    {
      tick: frame.tick,
      profileId: frame.profileId,
      currentVersionId: target.versionId,
      selectedVersionId,
      engineVersion: sources.store.engineVersion,
      sessionId,
      worldEpoch,
    },
  );
  const explanation = explanationSummary(sources.explanation ?? null),
    source = sourceOf(target, parent, selected, frame.profileId),
    rows = parameterDefinitions.map((definition) =>
      rowOf(definition, panel, versions, panel.delta, history, explanation, pipeline.key),
    ),
    binding: ProfileUiBinding = Object.freeze({
      version: PROFILE_UI_BINDING_VERSION,
      tick: frame.tick,
      profileId: frame.profileId,
      sessionId,
      worldEpoch,
      hasVersion: true,
      hasActivation,
      versions,
      source,
      rows: Object.freeze(rows),
      delta: panel.delta,
      explanation,
      pipeline,
      panel,
      history,
      mismatches: Object.freeze([]),
      pass: false,
    }),
    consistency = verifyProfileUiConsistency(binding);
  return Object.freeze({
    ...binding,
    mismatches: consistency.mismatches,
    pass: consistency.pass,
  });
}

/** One row of the deterministic evidence report. */
export interface ProfileUiBindingReportRow {
  readonly key: string;
  readonly reserved: boolean;
  readonly observed: boolean;
  readonly unobserved: boolean;
  readonly versions: Readonly<{
    panel: string | null;
    history: string | null;
    active: string | null;
  }>;
  readonly panel: Readonly<{
    status: ProfilePanelStatus | null;
    value: number | null;
    evidenceCount: number | null;
    uncertainty: number | null;
  }>;
  readonly history: Readonly<{ status: ProfilePanelStatus; value: number | null }>;
  readonly delta: Readonly<{ previous: number; next: number; reason: string | null }> | null;
  readonly historyDelta: Readonly<{ previous: number | null; next: number | null }> | null;
  readonly reasonCodes: readonly ProfileUiReasonCode[];
  readonly mismatches: readonly ProfileUiMismatchCode[];
}

export interface ProfileUiBindingReport {
  readonly version: typeof PROFILE_UI_BINDING_VERSION;
  readonly contract: Readonly<{
    rules: readonly string[];
    mismatchCodes: readonly ProfileUiMismatchCode[];
    reasonCodes: readonly ProfileUiReasonCode[];
  }>;
  readonly profileId: string;
  readonly tick: number;
  readonly hasVersion: boolean;
  readonly hasActivation: boolean;
  readonly versions: ProfileUiBindingVersions;
  readonly pipeline: ProfileUiBindingPipelineSummary;
  readonly explanation: ProfileUiBindingExplanationSummary | null;
  readonly rows: readonly ProfileUiBindingReportRow[];
  readonly mismatches: readonly ProfileUiMismatchCode[];
  readonly counts: Readonly<{
    rows: number;
    observed: number;
    unobserved: number;
    reserved: number;
    changed: number;
    mismatchedRows: number;
  }>;
  readonly pass: boolean;
}

/**
 * Deterministic per-key report of one binding. It is the comparison surface for the acceptance
 * criterion: the same version, the same value and the same closed reason for every key.
 */
export function profileUiBindingReport(binding: ProfileUiBinding): ProfileUiBindingReport {
  const consistency = verifyProfileUiConsistency(binding),
    rowMismatch = new Map(consistency.rowMismatches.map((entry) => [entry.key, entry.codes])),
    rows = binding.rows.map((row) =>
      Object.freeze({
        key: row.key,
        reserved: row.reserved,
        observed: row.observed,
        unobserved: !row.reserved && !row.observed,
        versions: Object.freeze({
          panel: row.panelVersionId,
          history: row.historyVersionId,
          active: binding.versions.active,
        }),
        panel: Object.freeze({
          status: row.panelStatus,
          value: row.panelValue,
          evidenceCount: row.panelEvidenceCount,
          uncertainty: row.panelUncertainty,
        }),
        history: Object.freeze({ status: row.historyStatus, value: row.historyValue }),
        delta:
          row.deltaPrevious === null && row.deltaNext === null
            ? null
            : Object.freeze({
                previous: row.deltaPrevious as number,
                next: row.deltaNext as number,
                reason: row.deltaReason,
              }),
        historyDelta:
          row.historyDeltaPrevious === null && row.historyDeltaNext === null
            ? null
            : Object.freeze({
                previous: row.historyDeltaPrevious,
                next: row.historyDeltaNext,
              }),
        reasonCodes: row.reasonCodes,
        mismatches: rowMismatch.get(row.key) ?? Object.freeze([]),
      }),
    );
  let observed = 0,
    unobserved = 0,
    reserved = 0,
    changed = 0;
  for (const row of binding.rows) {
    if (row.reserved) reserved += 1;
    else if (row.observed) observed += 1;
    else unobserved += 1;
    if (row.deltaPrevious !== null || row.deltaNext !== null) changed += 1;
  }
  return Object.freeze({
    version: PROFILE_UI_BINDING_VERSION,
    contract: Object.freeze({
      rules: Object.freeze([
        'one immutable 109 version feeds 077, 078 and the 110 active target; no illustrative frame',
        'a real zero stays OBSERVED with value 0 in both panel and history; absence stays null',
        'reserved R keys stay RESERVED/null and never appear as a learnable delta',
        'a bare 109 version has no evidence record: count 0, uncertainty 0, NO_EVIDENCE_RECORD',
        'the panel delta is the real parent→child delta; the history preview compares the two versions',
        'the 104 explanation is bound to the last 112 result and keeps its closed reason codes',
        'every mismatch is explicit and nothing is repaired automatically',
      ]),
      mismatchCodes: Object.freeze([...profileUiMismatchCodes]),
      reasonCodes: Object.freeze([...profileUiReasonCodes]),
    }),
    profileId: binding.profileId,
    tick: binding.tick,
    hasVersion: binding.hasVersion,
    hasActivation: binding.hasActivation,
    versions: binding.versions,
    pipeline: binding.pipeline,
    explanation: binding.explanation,
    rows: Object.freeze(rows),
    mismatches: consistency.mismatches,
    counts: Object.freeze({
      rows: binding.rows.length,
      observed,
      unobserved,
      reserved,
      changed,
      mismatchedRows: consistency.rowMismatches.length,
    }),
    pass: consistency.pass,
  });
}
