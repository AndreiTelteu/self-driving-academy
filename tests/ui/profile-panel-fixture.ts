import {
  getParameterDefinition,
  parameterDefinitions,
  parameterSources,
  parseDrivingProfile,
} from '../../src/profiles';
import type {
  DrivingProfile,
  ParameterEvidence,
  ProfileDeltaChange,
  ProfileVersionDelta,
} from '../../src/profiles';
import { readProfilePanelSnapshot } from '../../src/app';
import { createProfilePanel, createIllustrativeProfilePanel } from '../../src/ui';
import type { ProfilePanelSnapshot } from '../../src/ui';
import { createHudDocument, createHudHost, serializeHud } from './hud-dom';
import type { HudDocument, HudElement } from './hud-dom';

export const PROFILE_PANEL_SESSION = 'session:077';
export const PROFILE_PANEL_EPOCH = 3;
export const PROFILE_PANEL_TICK = 10;

type ParameterSource = (typeof parameterSources)[number];

/** Explicit catalog preview: real defaults, no profile identity, `illustrative: true`. */
export function illustrativeSnapshot(
  overrides: {
    readonly sessionId?: string;
    readonly worldEpoch?: number;
    readonly tick?: number;
  } = {},
): ProfilePanelSnapshot {
  return createIllustrativeProfilePanel(parameterDefinitions, {
    sessionId: PROFILE_PANEL_SESSION,
    worldEpoch: PROFILE_PANEL_EPOCH,
    tick: PROFILE_PANEL_TICK,
    ...overrides,
  });
}

const DEFAULT_VALUES: Readonly<Record<string, number>> = Object.freeze({
  speed_delta_urban: 0,
  curve_lateral_accel: 2.5,
  following_time_headway: 1.4,
  speed_delta_arterial: 5,
});

const DEFAULT_LEARNED: readonly string[] = Object.freeze([
  'speed_delta_urban',
  'curve_lateral_accel',
  'following_time_headway',
]);

const DEFAULT_EVIDENCE: Readonly<Record<string, Partial<ParameterEvidence>>> = Object.freeze({
  speed_delta_urban: { effectiveCount: 4, uncertainty: 0.25, quality: 0.8, contexts: ['urban'] },
  curve_lateral_accel: {
    effectiveCount: 4,
    uncertainty: 0.25,
    quality: 0.75,
    contexts: ['curbă'],
  },
  following_time_headway: {
    effectiveCount: 6,
    uncertainty: 0.1,
    quality: 0.9,
    contexts: ['urmărire'],
  },
});

export interface RealProfileOptions {
  readonly profileId?: string;
  readonly versionId?: string;
  readonly parentVersionId?: string | null;
  readonly engineVersion?: string;
  readonly createdAt?: string;
  readonly checksum?: string;
  readonly values?: Readonly<Record<string, number>>;
  readonly sources?: Readonly<Record<string, ParameterSource>>;
  readonly evidence?: Readonly<Record<string, Partial<ParameterEvidence>>>;
  /** Keys left out of the record; the panel must render them as unobserved. */
  readonly omit?: readonly string[];
}

/**
 * A real 005/109 `DrivingProfile`: every catalog default, a learned speed/curve/headway, a real zero
 * and a reserved key that still carries a number in the record (as BASE provenance allows).
 */
export function realProfile(options: RealProfileOptions = {}): DrivingProfile {
  const omitted = new Set(options.omit ?? []),
    parameters: Record<string, number> = Object.create(null),
    unitsByParameter: Record<string, string> = Object.create(null),
    provenanceByParameter: Record<string, ParameterSource> = Object.create(null),
    evidenceByParameter: Record<string, ParameterEvidence | null> = Object.create(null),
    segments: string[] = [];
  for (const definition of parameterDefinitions) {
    const key = definition.key;
    if (omitted.has(key)) continue;
    parameters[key] = options.values?.[key] ?? DEFAULT_VALUES[key] ?? definition.default;
    unitsByParameter[key] = definition.unit;
    const source = options.sources?.[key] ?? (DEFAULT_LEARNED.includes(key) ? 'LEARNED' : 'BASE');
    provenanceByParameter[key] = source;
    const configured = options.evidence?.[key],
      base = DEFAULT_EVIDENCE[key];
    if (configured === undefined && base === undefined && source !== 'LEARNED') {
      evidenceByParameter[key] = null;
      continue;
    }
    const sourceSegmentIds = Object.freeze([`segment:077:${key}`]),
      evidence: ParameterEvidence = Object.freeze({
        key,
        effectiveCount: configured?.effectiveCount ?? base?.effectiveCount ?? 4,
        contexts: Object.freeze([...(configured?.contexts ?? base?.contexts ?? ['urban'])]),
        quality: configured?.quality ?? base?.quality ?? 0.8,
        uncertainty: configured?.uncertainty ?? base?.uncertainty ?? 0.2,
        sourceSegmentIds,
        estimatorVersion: configured?.estimatorVersion ?? '077-estimator-v1',
      });
    evidenceByParameter[key] = evidence;
    segments.push(...sourceSegmentIds);
  }
  return parseDrivingProfile({
    schemaVersion: 1,
    units: 'SI',
    profileId: options.profileId ?? 'style:077',
    versionId: options.versionId ?? 'style:077:v2',
    parentVersionId:
      options.parentVersionId === undefined ? 'style:077:v1' : options.parentVersionId,
    engineVersion: options.engineVersion ?? 'engine:077.1',
    parameters,
    unitsByParameter,
    provenanceByParameter,
    evidenceByParameter,
    sourceSegmentIds: Object.freeze([...new Set(segments)]),
    createdAt: options.createdAt ?? '2026-10-20T10:00:00.000Z',
    checksum: options.checksum ?? 'fnv1a64:077aaaa',
  });
}

/** One real 109 delta against the profile parent, with catalog units. */
export function realProfileDelta(
  profile: DrivingProfile,
  changes: readonly { readonly key: string; readonly previous: number; readonly next: number }[],
  overrides: Partial<Omit<ProfileVersionDelta, 'changes' | 'keyCount'>> = {},
): ProfileVersionDelta {
  const mapped: ProfileDeltaChange[] = changes.map((change) =>
    Object.freeze({
      key: change.key,
      unit: getParameterDefinition(change.key).unit,
      previousValue: change.previous,
      newValue: change.next,
    }),
  );
  return Object.freeze({
    baseVersionId: profile.parentVersionId ?? 'style:077:v1',
    validationVersion: '102-candidate-validation-v1',
    segmentId: 'segment:077:delta',
    interventionId: null,
    reason: 'Distanță mai mică în mers',
    ...overrides,
    keyCount: mapped.length,
    changes: Object.freeze(mapped),
  });
}

/** The version panel frame used by the tests, including a two-key delta. */
export function realSnapshot(): ProfilePanelSnapshot {
  const profile = realProfile(),
    delta = realProfileDelta(profile, [
      { key: 'speed_delta_urban', previous: 0.5, next: 0 },
      { key: 'following_time_headway', previous: 1.8, next: 1.4 },
    ]);
  return readProfilePanelSnapshot(
    { catalog: parameterDefinitions },
    {
      tick: PROFILE_PANEL_TICK,
      profile,
      delta,
      sessionId: PROFILE_PANEL_SESSION,
      worldEpoch: PROFILE_PANEL_EPOCH,
    },
  );
}

export interface ProfilePanelHarness {
  readonly doc: HudDocument;
  readonly host: HudElement;
  readonly panel: ReturnType<typeof createProfilePanel>;
  root(): HudElement;
  rows(): HudElement[];
  rowFor(key: string): HudElement;
  sectionFor(category: string): HudElement;
  status(): HudElement;
  badge(): HudElement;
  banner(): HudElement;
  deltaRows(): HudElement[];
  dom(): string;
}

export function byClass(root: HudElement, className: string): HudElement | null {
  if (root.className.split(' ').includes(className)) return root;
  for (const child of root.children) {
    const found = byClass(child, className);
    if (found !== null) return found;
  }
  return null;
}

export function createProfilePanelHarness(
  options: {
    readonly maximumHz?: number;
    readonly open?: boolean;
    readonly catalog?: boolean;
  } = {},
): ProfilePanelHarness {
  const doc = createHudDocument(),
    host = createHudHost(doc),
    panel = createProfilePanel(host as unknown as HTMLElement, {
      maximumHz: options.maximumHz,
      open: options.open,
      ...(options.catalog === false ? {} : { catalog: parameterDefinitions }),
    }),
    requireRoot = (): HudElement => {
      const element = host.children[0];
      if (!element) throw new Error('Profile panel root is missing');
      return element;
    },
    rows = (): HudElement[] => {
      const container = byClass(requireRoot(), 'profile-panel__sections');
      if (container === null) throw new Error('Profile panel sections are missing');
      const result: HudElement[] = [];
      for (const section of container.children) {
        const list = byClass(section, 'profile-panel__rows');
        if (list !== null) result.push(...list.children);
      }
      return result;
    },
    rowFor = (key: string): HudElement => {
      for (const item of rows()) if (item.getAttribute('data-key') === key) return item;
      throw new Error(`Profile panel row is missing: ${key}`);
    },
    sectionFor = (category: string): HudElement => {
      const container = byClass(requireRoot(), 'profile-panel__sections');
      if (container === null) throw new Error('Profile panel sections are missing');
      for (const section of container.children)
        if (section.getAttribute('data-category') === category) return section;
      throw new Error(`Profile panel section is missing: ${category}`);
    },
    select = (className: string): HudElement => {
      const element = byClass(requireRoot(), className);
      if (element === null) throw new Error(`Profile panel element is missing: ${className}`);
      return element;
    };
  return {
    doc,
    host,
    panel,
    root: requireRoot,
    rows,
    rowFor,
    sectionFor,
    status: () => select('profile-panel__summary'),
    badge: () => select('profile-panel__badge'),
    banner: () => select('profile-panel__banner'),
    deltaRows: () => select('profile-panel__delta-rows').children,
    dom: () => serializeHud(requireRoot()),
  };
}
