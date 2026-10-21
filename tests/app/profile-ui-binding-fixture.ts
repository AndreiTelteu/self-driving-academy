import {
  DEFAULT_FLEET_COUNTS,
  createFleetRegistry,
  createProfileActivation,
  createProfileActivationSource,
} from '../../src/fleet';
import type { ProfileActivation } from '../../src/fleet';
import { CANDIDATE_LEARNING_KEYS, createCandidateProfileStore } from '../../src/learning';
import { getParameterDefinition, parameterDefinitions } from '../../src/profiles';
import type { ParameterDefinition, ProfileStore } from '../../src/profiles';
import { createLearningExplanationSnapshot } from '../../src/ui';
import type { LearningExplanationSnapshot } from '../../src/ui';
import { readProfileUiBinding } from '../../src/app';
import type {
  ProfileUiBinding,
  ProfileUiBindingPipeline,
  ProfileUiBindingSources,
} from '../../src/app';

export const BINDING_ENGINE = 'engine:113.1';
export const BINDING_PROFILE = 'academy';
export const BINDING_OTHER_PROFILE = 'haos';
export const BINDING_SESSION = 'session:113';
export const BINDING_EPOCH = 3;
export const BINDING_TICK = 10;
export const BINDING_NOW = '2026-10-21T00:00:00.000Z';
export const BINDING_BASE = 'v1';
export const BINDING_CURRENT = 'v2';
export const BINDING_SEGMENT = 'segment:113:2';
export const BINDING_NO_CHANGE_SEGMENT = 'segment:113:3';
export const BINDING_NO_CHANGE_KEY = 'following_min_gap';
export const BINDING_UNOBSERVED_KEY = 'lane_change_cooldown';
export const BINDING_ZERO_KEY = 'speed_delta_urban';
export const BINDING_HEADWAY_KEY = 'following_time_headway';
export const BINDING_RESERVED_KEY = 'speed_delta_arterial';

export const BINDING_TARGET_KEYS: readonly ParameterDefinition[] = Object.freeze(
  parameterDefinitions.filter(
    (definition) => definition.implementationStage === 'initial_learning_target',
  ),
);

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function fixtureValue(definition: ParameterDefinition, index: number): number {
  return round(definition.min + (definition.max - definition.min) * (0.2 + (index % 5) * 0.1));
}

/** The real 109 base: all M keys except one, one real zero, and a reserved key with a number. */
export function baseParameters(): Readonly<Record<string, number>> {
  const parameters: Record<string, number> = {};
  BINDING_TARGET_KEYS.forEach((definition, index) => {
    if (definition.key === BINDING_UNOBSERVED_KEY) return;
    parameters[definition.key] =
      definition.key === BINDING_ZERO_KEY
        ? 0.5
        : definition.key === BINDING_HEADWAY_KEY
          ? 1.8
          : fixtureValue(definition, index);
  });
  const reserved = getParameterDefinition(BINDING_RESERVED_KEY);
  parameters[BINDING_RESERVED_KEY] = round(reserved.min + (reserved.max - reserved.min) * 0.5);
  return Object.freeze(parameters);
}

/** The real 109 child: a real zero and a changed headway against `v1`. */
export function currentParameters(): Readonly<Record<string, number>> {
  return Object.freeze({
    ...baseParameters(),
    [BINDING_ZERO_KEY]: 0,
    [BINDING_HEADWAY_KEY]: 1.4,
  });
}

function deltaValue(key: string, value: number) {
  return Object.freeze({ key, unit: getParameterDefinition(key).unit, value });
}

/** Real 109 store seeded with `v1 → v2`; nothing else is written. */
export function createBindingStore(options: { readonly empty?: boolean } = {}): ProfileStore {
  const store = createCandidateProfileStore({
    engineVersion: BINDING_ENGINE,
    now: () => BINDING_NOW,
  });
  if (options.empty === true) return store;
  const base = store.createBase({
    profileId: BINDING_PROFILE,
    versionId: BINDING_BASE,
    parameters: baseParameters(),
    createdAt: BINDING_NOW,
  });
  if (base.status !== 'ACCEPTED') throw new Error(`Binding base rejected: ${base.rejection.code}`);
  const derived = store.derive({
    profileId: BINDING_PROFILE,
    versionId: BINDING_CURRENT,
    parentVersionId: BINDING_BASE,
    segmentId: BINDING_SEGMENT,
    reason: 'Distanță mai mică în mers',
    createdAt: BINDING_NOW,
    delta: {
      profileVersionId: BINDING_CURRENT,
      parentVersionId: BINDING_BASE,
      engineVersion: BINDING_ENGINE,
      schemaVersion: 1,
      units: 'SI',
      values: [deltaValue(BINDING_ZERO_KEY, 0), deltaValue(BINDING_HEADWAY_KEY, 1.4)],
    },
  });
  if (derived.status !== 'ACCEPTED')
    throw new Error(`Binding derivation rejected: ${derived.rejection.code}`);
  return store;
}

function configuration(profileId: string, versionId: string): Record<string, unknown> {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: BINDING_SESSION,
    worldEpoch: 1,
    scenarioId: 'city-fixture',
    seed: 20261103,
    namespace: 'city:harness:ui-binding',
    taxiCount: DEFAULT_FLEET_COUNTS.taxis,
    civilianCount: DEFAULT_FLEET_COUNTS.civilians,
    profile: { profileId, versionId },
  };
}

export interface BindingActivationWorld {
  readonly activation: ProfileActivation;
  readonly dispose: () => void;
}

/**
 * Real 110 controller whose active/pending target is `targetVersionId`. The profile source is set
 * by the controller itself; the binding only reads `activeProfile()`.
 */
export function createBindingActivation(
  targetVersionId: string = BINDING_CURRENT,
): BindingActivationWorld {
  const source = createProfileActivationSource({
      profileId: BINDING_PROFILE,
      versionId: BINDING_BASE,
    }),
    registry = createFleetRegistry(configuration(BINDING_PROFILE, BINDING_BASE), {
      profileSource: source,
    }),
    activation = createProfileActivation({
      registry,
      source,
      engineVersion: BINDING_ENGINE,
      clock: () => 0,
      now: () => BINDING_NOW,
    });
  if (targetVersionId !== BINDING_BASE) {
    const published = activation.publish({
      profileId: BINDING_PROFILE,
      versionId: targetVersionId,
      engineVersion: BINDING_ENGINE,
      publishedAtTick: 0,
      activateAtTick: 1,
      reason: 'țintă reală 113',
      origin: 'LEARNED',
      idempotencyKey: `113:${targetVersionId}`,
    });
    if (published.status !== 'ACCEPTED')
      throw new Error(`Binding activation rejected: ${published.rejection?.code ?? 'unknown'}`);
  }
  return Object.freeze({
    activation,
    dispose: () => {
      activation.dispose();
      registry.dispose();
    },
  });
}

export interface BindingPipelineOptions {
  readonly status: string;
  readonly versionId: string | null;
  readonly segmentId?: string;
  readonly reason?: string | null;
  readonly key?: string | null;
}

/** Structural last 112 result; the real pipeline satisfies the same shape. */
export function bindingPipeline(options: BindingPipelineOptions): ProfileUiBindingPipeline {
  return Object.freeze({
    history: () =>
      Object.freeze([
        Object.freeze({
          segmentId: options.segmentId ?? BINDING_SEGMENT,
          status: options.status,
          reason: options.reason ?? null,
          versionId: options.versionId,
          composition:
            options.key === null || options.key === undefined
              ? null
              : Object.freeze({ key: options.key }),
        }),
      ]),
  });
}

function change(key: string, previous: number, next: number, confidence: 'OBSERVED' | 'ZERO') {
  const definition = getParameterDefinition(key);
  return Object.freeze({
    key,
    label: definition.description,
    unit: definition.unit,
    previous,
    next,
    delta: next - previous,
    evidenceCount: 16,
    contexts: Object.freeze(['urban']),
    quality: confidence === 'ZERO' ? 1 : 0.8,
    uncertainty: 'LOW' as const,
    confidence,
    sourceSegmentIds: Object.freeze([BINDING_SEGMENT]),
    reason: confidence === 'ZERO' ? 'ZERO_OBSERVED' : 'EVIDENCE_APPLIED',
  });
}

/** Real 104 snapshot for the changed `v1 → v2` transition. */
export function changedExplanation(): LearningExplanationSnapshot {
  return createLearningExplanationSnapshot(
    {
      schemaVersion: 1,
      units: 'SI',
      sessionId: BINDING_SESSION,
      worldEpoch: 1,
      tick: BINDING_TICK + 1,
      segmentId: BINDING_SEGMENT,
      jobKey: `job:104:${BINDING_SEGMENT}:2`,
      generationKey: `gen:104:${BINDING_PROFILE}:${BINDING_EPOCH}:${BINDING_BASE}`,
      profileId: BINDING_PROFILE,
      learningEpoch: BINDING_EPOCH,
      mode: 'LEARNING',
      order: 2,
      status: 'CHANGED',
      versionId: BINDING_CURRENT,
      changes: [
        change(BINDING_HEADWAY_KEY, 1.8, 1.4, 'OBSERVED'),
        change(BINDING_ZERO_KEY, 0.5, 0, 'ZERO'),
      ],
      noChangeReason: null,
      missingContexts: [],
      detail: null,
    },
    CANDIDATE_LEARNING_KEYS,
  );
}

/** Real 104 snapshot for a composition that produced no new version. */
export function noChangeExplanation(
  reason:
    | 'NO_NEW_EVIDENCE'
    | 'WEAK_EVIDENCE'
    | 'BELOW_THRESHOLD'
    | 'UNCHANGED_ESTIMATE' = 'UNCHANGED_ESTIMATE',
): LearningExplanationSnapshot {
  return createLearningExplanationSnapshot(
    {
      schemaVersion: 1,
      units: 'SI',
      sessionId: BINDING_SESSION,
      worldEpoch: 1,
      tick: BINDING_TICK + 2,
      segmentId: BINDING_NO_CHANGE_SEGMENT,
      jobKey: `job:104:${BINDING_NO_CHANGE_SEGMENT}:3`,
      generationKey: `gen:104:${BINDING_PROFILE}:${BINDING_EPOCH}:${BINDING_CURRENT}`,
      profileId: BINDING_PROFILE,
      learningEpoch: BINDING_EPOCH,
      mode: 'LEARNING',
      order: 3,
      status: 'NO_CHANGE',
      versionId: null,
      changes: [],
      noChangeReason: reason,
      missingContexts: [],
      detail: null,
    },
    CANDIDATE_LEARNING_KEYS,
  );
}

export interface BindingFixtureOptions {
  readonly store: ProfileStore;
  readonly activation?: ProfileActivation;
  readonly pipeline?: ProfileUiBindingPipeline;
  readonly explanation?: LearningExplanationSnapshot | null;
  readonly selectedVersionId?: string | null;
  readonly currentVersionId?: string | null;
  readonly tick?: number;
}

/** One real binding over the supplied 109 store and optional 110/112/104 services. */
export function bindingOf(options: BindingFixtureOptions): ProfileUiBinding {
  const sources: ProfileUiBindingSources = {
    store: options.store,
    ...(options.activation === undefined ? {} : { activation: options.activation }),
    ...(options.pipeline === undefined ? {} : { pipeline: options.pipeline }),
    ...(options.explanation === undefined ? {} : { explanation: options.explanation }),
  };
  return readProfileUiBinding(sources, {
    tick: options.tick ?? BINDING_TICK,
    profileId: BINDING_PROFILE,
    ...(options.selectedVersionId === undefined
      ? {}
      : { selectedVersionId: options.selectedVersionId }),
    ...(options.currentVersionId === undefined
      ? {}
      : { currentVersionId: options.currentVersionId }),
  });
}

/** Row lookup that fails loudly instead of returning `undefined` into an assertion. */
export function rowFor(binding: ProfileUiBinding, key: string) {
  const row = binding.rows.find((entry) => entry.key === key);
  if (row === undefined) throw new Error(`Binding row is missing: ${key}`);
  return row;
}
