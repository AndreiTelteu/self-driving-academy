import type { DrivingProfile, ParameterDefinition, ProfileVersionDelta } from '../profiles';
import type {
  ProfilePanelDelta,
  ProfilePanelDeltaChange,
  ProfilePanelParameter,
  ProfilePanelProfileIdentity,
  ProfilePanelSnapshot,
} from '../ui';
import {
  PROFILE_PANEL_LIMITS,
  createIllustrativeProfilePanel,
  isProfilePanelReserved,
  parseProfilePanelSnapshot,
} from '../ui';

/** The real catalog (092) and, optionally, the real session context of the host. */
export interface ProfilePanelSources {
  /** `parameterDefinitions` or `parameterRegistry`; both are accepted. */
  readonly catalog: readonly ParameterDefinition[] | Readonly<Record<string, ParameterDefinition>>;
}

/** One host frame: the accepted tick and the optional published profile version. */
export interface ProfilePanelFrame {
  readonly tick: number;
  /** Real 109 `DrivingProfile`; `null`/absent renders the explicit catalog preview. */
  readonly profile?: DrivingProfile | null;
  /** Optional 109 delta of the version in `profile`; filtered to learnable keys. */
  readonly delta?: ProfileVersionDelta | null;
  /** Only `true` is meaningful for a preview; `true` with a published profile is rejected. */
  readonly illustrative?: boolean;
  /** Local scope until 110 supplies the real publication context. */
  readonly sessionId?: string;
  readonly worldEpoch?: number;
}

/**
 * Documented local context for a profile panel that is not yet bound to a live publication host.
 * It is a scope label, not a world identity claim; the host can override it explicitly.
 */
export const PROFILE_PANEL_LOCAL_CONTEXT = Object.freeze({
  sessionId: 'profile:local',
  worldEpoch: 0,
});

/** Closed error messages: the composition root never invents a value or a version. */
export const PROFILE_PANEL_READ_ERRORS = Object.freeze({
  CATALOG: 'Profile panel catalog is empty',
  NO_PROFILE: 'Profile panel has no published profile to render as real',
  PROFILE: 'Profile panel profile has an unsupported schema or units',
  ILLUSTRATIVE_PROFILE: 'Profile panel cannot mark a published profile as illustrative',
  DELTA_WITHOUT_PROFILE: 'Profile panel delta requires a published profile',
  DELTA_BASE: 'Profile panel delta base does not match the profile parent',
  DELTA_UNIT: 'Profile panel delta unit does not match the catalog',
  DELTA_VALUE: 'Profile panel delta value does not match the published profile',
  UNKNOWN_KEY: 'Profile panel profile contains an unknown parameter',
  UNKNOWN_DELTA_KEY: 'Profile panel delta contains an unknown parameter',
  SOURCE: 'Profile panel profile has no provenance for an observed parameter',
  EVIDENCE: 'Profile panel evidence is inconsistent with its count',
  LEARNED_EVIDENCE: 'Profile panel learned parameter has no evidence',
});

const NO_DELTA_REASON = 'Motiv nespecificat';

function fail(message: string, detail: string): never {
  throw new Error(`${message}: ${detail}`);
}

function catalogList(catalog: ProfilePanelSources['catalog']): readonly ParameterDefinition[] {
  const list = Array.isArray(catalog)
    ? (catalog as readonly ParameterDefinition[])
    : Object.values(catalog);
  if (list.length === 0) throw new Error(PROFILE_PANEL_READ_ERRORS.CATALOG);
  return list;
}

function parametersOf(
  profile: DrivingProfile,
  catalog: readonly ParameterDefinition[],
): readonly ProfilePanelParameter[] {
  const byKey = new Map(catalog.map((definition) => [definition.key, definition]));
  for (const key of Object.keys(profile.parameters)) {
    if (!byKey.has(key)) fail(PROFILE_PANEL_READ_ERRORS.UNKNOWN_KEY, key);
  }
  const parameters: ProfilePanelParameter[] = [];
  for (const definition of catalog) {
    const key = definition.key,
      reserved = isProfilePanelReserved(definition),
      observed = !reserved && Object.hasOwn(profile.parameters, key),
      source = observed ? (profile.provenanceByParameter[key] ?? null) : null,
      evidence = observed ? (profile.evidenceByParameter[key] ?? null) : null;
    if (observed && source === null) fail(PROFILE_PANEL_READ_ERRORS.SOURCE, key);
    if (observed && source === 'LEARNED' && evidence === null)
      fail(PROFILE_PANEL_READ_ERRORS.LEARNED_EVIDENCE, key);
    const evidenceCount = evidence?.effectiveCount ?? 0;
    if (
      evidence !== null &&
      evidenceCount === 0 &&
      (evidence.quality > 0 || evidence.uncertainty > 0)
    )
      fail(PROFILE_PANEL_READ_ERRORS.EVIDENCE, key);
    const contexts = [
      ...new Set(
        (evidence?.contexts ?? []).map((context) =>
          context.slice(0, PROFILE_PANEL_LIMITS.contextCodeUnits),
        ),
      ),
    ].slice(0, PROFILE_PANEL_LIMITS.contextsPerParameter);
    const parameter: ProfilePanelParameter = {
      key,
      label: definition.description,
      category: definition.category,
      unit: definition.unit,
      status: reserved ? 'RESERVED' : observed ? 'OBSERVED' : 'UNOBSERVED',
      value: observed ? profile.parameters[key]! : null,
      defaultValue: definition.default,
      min: definition.min,
      max: definition.max,
      source: source as ProfilePanelParameter['source'],
      evidenceCount,
      quality: evidence?.quality ?? 0,
      uncertainty: evidence?.uncertainty ?? 0,
      contexts: Object.freeze(contexts),
      learnable: !reserved,
      reason: reserved
        ? 'RESERVED_V1'
        : observed
          ? source === 'LEARNED'
            ? 'PROFILE_VALUE_LEARNED'
            : source === 'MANUAL_TUNING'
              ? 'PROFILE_VALUE_MANUAL_TUNING'
              : source === 'IMPORTED'
                ? 'PROFILE_VALUE_IMPORTED'
                : 'PROFILE_VALUE_BASE'
          : 'NOT_OBSERVED',
    };
    parameters.push(Object.freeze(parameter));
  }
  return Object.freeze(parameters);
}

function identityOf(profile: DrivingProfile): ProfilePanelProfileIdentity {
  return Object.freeze({
    profileId: profile.profileId,
    versionId: profile.versionId,
    parentVersionId: profile.parentVersionId,
    engineVersion: profile.engineVersion,
    createdAt: profile.createdAt,
    checksum: profile.checksum,
  });
}

/**
 * Maps one 109 delta to the panel view. A delta must belong to the exact parent of the rendered
 * version; a foreign base or a value that does not match the published profile is rejected.
 * Reserved (R) keys can never become a learned change and are excluded explicitly.
 */
function deltaOf(
  profile: DrivingProfile,
  delta: ProfileVersionDelta | null | undefined,
  catalog: readonly ParameterDefinition[],
): ProfilePanelDelta | null {
  if (delta === null || delta === undefined) return null;
  if (delta.baseVersionId !== profile.parentVersionId)
    fail(PROFILE_PANEL_READ_ERRORS.DELTA_BASE, delta.baseVersionId);
  const byKey = new Map(catalog.map((definition) => [definition.key, definition])),
    changes: ProfilePanelDeltaChange[] = [];
  for (const change of delta.changes) {
    const definition = byKey.get(change.key);
    if (definition === undefined) fail(PROFILE_PANEL_READ_ERRORS.UNKNOWN_DELTA_KEY, change.key);
    if (isProfilePanelReserved(definition)) continue;
    if (change.unit !== definition.unit) fail(PROFILE_PANEL_READ_ERRORS.DELTA_UNIT, change.key);
    if (!Object.hasOwn(profile.parameters, change.key))
      fail(PROFILE_PANEL_READ_ERRORS.DELTA_VALUE, change.key);
    if (profile.parameters[change.key] !== change.newValue)
      fail(PROFILE_PANEL_READ_ERRORS.DELTA_VALUE, change.key);
    const evidence = profile.evidenceByParameter[change.key] ?? null;
    changes.push(
      Object.freeze({
        key: change.key,
        previous: change.previousValue,
        next: change.newValue,
        reason: delta.reason ?? NO_DELTA_REASON,
        evidenceCount: evidence?.effectiveCount ?? 0,
      }),
    );
  }
  if (changes.length === 0) return null;
  return Object.freeze({ baseVersionId: delta.baseVersionId, changes: Object.freeze(changes) });
}

/**
 * Composition root for 077. It reads a real `DrivingProfile` (109) and, without one, the real
 * catalog defaults with the explicit illustrative banner. It never mutates a profile, never learns,
 * never publishes or activates a version and never fabricates evidence: 110/112 remain the owners of
 * publication and propagation. Reserved keys are always `RESERVED`, `null` and not learnable.
 */
export function readProfilePanelSnapshot(
  sources: ProfilePanelSources,
  frame: ProfilePanelFrame,
): ProfilePanelSnapshot {
  const catalog = catalogList(sources.catalog),
    sessionId = frame.sessionId ?? PROFILE_PANEL_LOCAL_CONTEXT.sessionId,
    worldEpoch = frame.worldEpoch ?? PROFILE_PANEL_LOCAL_CONTEXT.worldEpoch,
    profile = frame.profile ?? null;
  if (profile === null) {
    if (frame.illustrative === false) throw new Error(PROFILE_PANEL_READ_ERRORS.NO_PROFILE);
    if (frame.delta !== null && frame.delta !== undefined)
      throw new Error(PROFILE_PANEL_READ_ERRORS.DELTA_WITHOUT_PROFILE);
    return createIllustrativeProfilePanel(catalog, { sessionId, worldEpoch, tick: frame.tick });
  }
  if (frame.illustrative === true) throw new Error(PROFILE_PANEL_READ_ERRORS.ILLUSTRATIVE_PROFILE);
  if (profile.schemaVersion !== 1 || profile.units !== 'SI')
    throw new Error(PROFILE_PANEL_READ_ERRORS.PROFILE);
  return parseProfilePanelSnapshot(
    {
      schemaVersion: 1,
      units: 'SI',
      version: '077-profile-panel-v1',
      sessionId,
      worldEpoch,
      tick: frame.tick,
      profile: identityOf(profile),
      illustrative: false,
      parameters: parametersOf(profile, catalog),
      delta: deltaOf(profile, frame.delta, catalog),
    },
    catalog,
  );
}
