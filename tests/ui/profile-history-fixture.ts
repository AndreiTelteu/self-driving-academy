import { getParameterDefinition, createProfileStore } from '../../src/profiles';
import type { ProfileDeltaValidator, ProfileStore, ProfileStoreResult } from '../../src/profiles';
import { createCandidateProfileStore } from '../../src/learning';
import { PROFILE_HISTORY_RESERVED_KEYS, readProfileHistorySnapshot } from '../../src/app';
import type { ProfileHistoryFrame } from '../../src/app';
import { createProfileHistoryPanel } from '../../src/ui';
import type { ProfileHistoryRestoreResult, ProfileHistorySnapshot } from '../../src/ui';
import { createHudDocument, createHudHost, serializeHud } from './hud-dom';
import type { HudDocument, HudElement } from './hud-dom';

export const PROFILE_HISTORY_SESSION = 'session:078';
export const PROFILE_HISTORY_EPOCH = 7;
export const PROFILE_HISTORY_TICK = 10;
export const PROFILE_HISTORY_PROFILE = 'academy';
export const PROFILE_HISTORY_OTHER_PROFILE = 'haos';
export const PROFILE_HISTORY_ENGINE = 'engine:078.1';

export const PROFILE_HISTORY_BASE_PARAMETERS = Object.freeze({
  speed_delta_urban: 0,
  following_time_headway: 1.8,
  stop_full_probability: 1,
});

function entry(key: string, value: number) {
  return Object.freeze({ key, value, unit: getParameterDefinition(key).unit });
}

function deltaOf(
  versionId: string,
  parentVersionId: string,
  values: readonly { readonly key: string; readonly value: number; readonly unit: string }[],
  engineVersion: string,
) {
  return Object.freeze({
    profileVersionId: versionId,
    parentVersionId,
    engineVersion,
    schemaVersion: 1,
    units: 'SI',
    values,
  });
}

/** A permissive delta gate used only to store a change on a reserved (R) key. */
export const profileHistoryPermissiveValidator: ProfileDeltaValidator = (input) => {
  const values = Array.isArray(input.values)
      ? (input.values as readonly {
          readonly key: string;
          readonly unit: string;
          readonly value: number;
        }[])
      : [],
    mapped = values.map((value) =>
      Object.freeze({ key: value.key, unit: value.unit, value: value.value }),
    );
  return Object.freeze({
    status: 'ACCEPTED' as const,
    version: '078-test-validator-v1',
    delta: Object.freeze({
      profileVersionId: String(input.profileVersionId),
      parentVersionId: input.parentVersionId === null ? null : String(input.parentVersionId),
      engineVersion: input.engineVersion === undefined ? null : String(input.engineVersion),
      values: Object.freeze(mapped),
      keyCount: mapped.length,
    }),
  });
};

export interface HistoryStoreOptions {
  readonly engineVersion?: string;
  readonly validator?: ProfileDeltaValidator;
}

export function createHistoryStore(options: HistoryStoreOptions = {}): ProfileStore {
  const engineVersion = options.engineVersion ?? PROFILE_HISTORY_ENGINE,
    now = () => '2026-10-20T00:00:00.000Z';
  if (options.validator === undefined) return createCandidateProfileStore({ engineVersion, now });
  return createProfileStore({ engineVersion, validateDelta: options.validator, now });
}

function accepted(result: ProfileStoreResult): void {
  if (result.status !== 'ACCEPTED')
    throw new Error(`History seed rejected: ${result.rejection.code}`);
}

export interface HistorySeedOptions {
  readonly profileId?: string;
  readonly engineVersion?: string;
}

/**
 * Base `v1` → `v2` (speed 0→0.5, headway 1.8→1.4) → `v3` (speed 0.5→0, headway 1.4→1.2).
 * `v3` deliberately restores a real zero on the speed key.
 */
export function seedHistory(store: ProfileStore, options: HistorySeedOptions = {}): void {
  const profileId = options.profileId ?? PROFILE_HISTORY_PROFILE,
    engineVersion = options.engineVersion ?? PROFILE_HISTORY_ENGINE;
  accepted(
    store.createBase({
      profileId,
      versionId: 'v1',
      parameters: PROFILE_HISTORY_BASE_PARAMETERS,
      sourceSegmentIds: [],
      createdAt: '2026-10-20T00:00:00.000Z',
    }),
  );
  accepted(
    store.derive({
      profileId,
      versionId: 'v2',
      parentVersionId: 'v1',
      segmentId: 'segment:078:2',
      reason: 'Distanță mai mică în mers',
      createdAt: '2026-10-20T00:01:00.000Z',
      delta: deltaOf(
        'v2',
        'v1',
        [entry('speed_delta_urban', 0.5), entry('following_time_headway', 1.4)],
        engineVersion,
      ),
    }),
  );
  accepted(
    store.derive({
      profileId,
      versionId: 'v3',
      parentVersionId: 'v2',
      segmentId: 'segment:078:3',
      reason: 'Reacție mai rapidă la verde',
      createdAt: '2026-10-20T00:02:00.000Z',
      delta: deltaOf(
        'v3',
        'v2',
        [entry('speed_delta_urban', 0), entry('following_time_headway', 1.2)],
        engineVersion,
      ),
    }),
  );
}

/** A base plus two siblings at depth 1, created in the reverse of the expected tie-break order. */
export function seedBranchingHistory(store: ProfileStore): void {
  accepted(
    store.createBase({
      profileId: PROFILE_HISTORY_PROFILE,
      versionId: 'base',
      parameters: PROFILE_HISTORY_BASE_PARAMETERS,
      createdAt: '2026-10-20T00:00:00.000Z',
    }),
  );
  for (const versionId of ['b-sibling', 'a-sibling']) {
    accepted(
      store.derive({
        profileId: PROFILE_HISTORY_PROFILE,
        versionId,
        parentVersionId: 'base',
        segmentId: `segment:078:${versionId}`,
        createdAt: '2026-10-20T00:01:00.000Z',
        delta: deltaOf(
          versionId,
          'base',
          [entry('following_time_headway', versionId === 'a-sibling' ? 1.3 : 1.5)],
          PROFILE_HISTORY_ENGINE,
        ),
      }),
    );
  }
}

/** A profile whose base and derived version both carry a reserved key with a numeric value. */
export function seedReservedKeyHistory(store: ProfileStore): void {
  accepted(
    store.createBase({
      profileId: PROFILE_HISTORY_PROFILE,
      versionId: 'r1',
      parameters: Object.freeze({
        speed_delta_urban: 0,
        speed_delta_arterial: 5,
        following_time_headway: 1.8,
      }),
      createdAt: '2026-10-20T00:00:00.000Z',
    }),
  );
  accepted(
    store.derive({
      profileId: PROFILE_HISTORY_PROFILE,
      versionId: 'r2',
      parentVersionId: 'r1',
      segmentId: 'segment:078:reserved',
      reason: 'Reglaj rezervat',
      createdAt: '2026-10-20T00:01:00.000Z',
      delta: deltaOf(
        'r2',
        'r1',
        [entry('speed_delta_arterial', 7), entry('speed_delta_urban', 0.5)],
        PROFILE_HISTORY_ENGINE,
      ),
    }),
  );
}

export function emptyHistoryStore(): ProfileStore {
  return createHistoryStore();
}

export function historySnapshot(
  store: ProfileStore,
  overrides: Partial<ProfileHistoryFrame> = {},
): ProfileHistorySnapshot {
  return readProfileHistorySnapshot(
    { store },
    {
      tick: PROFILE_HISTORY_TICK,
      profileId: PROFILE_HISTORY_PROFILE,
      sessionId: PROFILE_HISTORY_SESSION,
      worldEpoch: PROFILE_HISTORY_EPOCH,
      ...overrides,
    },
  );
}

export interface ProfileHistoryHarness {
  readonly doc: HudDocument;
  readonly host: HudElement;
  readonly panel: ReturnType<typeof createProfileHistoryPanel>;
  readonly calls: { readonly select: string[]; readonly restore: string[] };
  root(): HudElement;
  rows(): HudElement[];
  rowFor(versionId: string): HudElement;
  changeRows(): HudElement[];
  emptyNotice(): HudElement;
  restoreButton(): HudElement;
  confirmButton(): HudElement;
  status(): HudElement;
  previewEmpty(): HudElement;
  dom(): string;
}

function byClass(root: HudElement, className: string): HudElement | null {
  if (root.className.split(' ').includes(className)) return root;
  for (const child of root.children) {
    const found = byClass(child, className);
    if (found !== null) return found;
  }
  return null;
}

export function createProfileHistoryHarness(
  options: {
    readonly maximumHz?: number;
    readonly open?: boolean;
    readonly reservedKeys?: boolean;
    readonly restoreResult?: ProfileHistoryRestoreResult;
  } = {},
): ProfileHistoryHarness {
  const calls: { readonly select: string[]; readonly restore: string[] } = {
      select: [],
      restore: [],
    },
    doc = createHudDocument(),
    host = createHudHost(doc),
    panel = createProfileHistoryPanel(host as unknown as HTMLElement, {
      maximumHz: options.maximumHz,
      open: options.open,
      ...(options.reservedKeys === false ? {} : { reservedKeys: PROFILE_HISTORY_RESERVED_KEYS }),
      select: (versionId: string) => {
        calls.select.push(versionId);
        return true;
      },
      restore: (versionId: string) => {
        calls.restore.push(versionId);
        return options.restoreResult ?? Object.freeze({ accepted: true, reason: null });
      },
    }),
    requireRoot = (): HudElement => {
      const element = host.children[0];
      if (!element) throw new Error('Profile history root is missing');
      return element;
    },
    select = (className: string): HudElement => {
      const element = byClass(requireRoot(), className);
      if (element === null) throw new Error(`Profile history element is missing: ${className}`);
      return element;
    },
    rows = (): HudElement[] => {
      const list = select('profile-history__versions');
      return list.children.map((item) => item.children[0]!);
    },
    rowFor = (versionId: string): HudElement => {
      for (const button of rows())
        if (button.getAttribute('data-version-id') === versionId) return button;
      throw new Error(`Profile history row is missing: ${versionId}`);
    };
  return {
    doc,
    host,
    panel,
    calls,
    root: requireRoot,
    rows,
    rowFor,
    changeRows: () => select('profile-history__changes').children,
    emptyNotice: () => select('profile-history__empty'),
    restoreButton: () => select('profile-history__restore-button'),
    confirmButton: () => select('profile-history__confirm-button'),
    status: () => select('profile-history__status'),
    previewEmpty: () => select('profile-history__preview-empty'),
    dom: () => serializeHud(requireRoot()),
  };
}
