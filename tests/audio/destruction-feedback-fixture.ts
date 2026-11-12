import {
  attachDestructionFeedback,
  createAudioEngine,
  createDestructionCatalog,
  createFakeAudioBackend,
} from '../../src/audio';
import type {
  DestructionCatalog,
  DestructionFeedback,
  DestructionFeedbackSettings,
  FakeAudioBackend,
} from '../../src/audio';
import type { ContractContext } from '../../src/sessions';
import { createEventBus } from '../../src/simulation';
import type { EventBus } from '../../src/simulation';
import type { Vector3 } from '../../src/vehicles';
import { createDestructibleDecor } from '../../src/world';
import type { DestructibleDecor, DestructibleDefinition } from '../../src/world';
import {
  DESTRUCTIBLE_CONTEXT,
  createHarness,
  destructibleWorld,
} from '../world/destructible-decor-fixture';

export const DESTRUCTION_SESSION_ID = DESTRUCTIBLE_CONTEXT.sessionId;
export const DESTRUCTION_WORLD_EPOCH = DESTRUCTIBLE_CONTEXT.worldEpoch;

let catalog: DestructionCatalog | null = null;

/** The catalog built from the real 227 plan, never from a hand-authored stand-in. */
export function destructionCatalog(): DestructionCatalog {
  if (catalog === null) catalog = createDestructionCatalog(destructibleWorld().plan.definitions);
  return catalog;
}

export function definitionByArchetype(archetype: string): DestructibleDefinition {
  const found = destructibleWorld().plan.definitions.find(
    (candidate) => candidate.archetype === archetype,
  );
  if (!found) throw new Error(`No ${archetype} definition`);
  return found;
}

/** A contact that lands on the object from a fixed side, so the reaction is reproducible. */
export function contactFor(
  definition: DestructibleDefinition,
  impulseNs: number,
  tick: number,
  instigatorId: string | null = 'taxi-228',
) {
  const base = definition.initialTransform.positionM;
  return {
    tick,
    objectId: definition.objectId,
    impulseNs,
    pointM: { x: base.x - 0.6, y: 0.4, z: base.z },
    instigatorId,
    controlSource: 'MANUAL' as const,
  };
}

export interface DestructionHarnessOptions {
  readonly gesture?: boolean;
  readonly settings?: Partial<DestructionFeedbackSettings>;
  readonly listenerPositionM?: Vector3 | null;
  readonly fragmentPoolCapacity?: number;
  /** A world reset advances the epoch; the 228 replay then reads the new recording. */
  readonly worldEpoch?: number;
}

export interface DestructionHarness {
  readonly context: ContractContext;
  readonly bus: EventBus;
  readonly decor: DestructibleDecor;
  readonly plan: ReturnType<typeof destructibleWorld>['plan'];
  readonly layout: ReturnType<typeof destructibleWorld>['layout'];
  readonly backend: FakeAudioBackend;
  readonly engine: ReturnType<typeof createAudioEngine>;
  readonly feedback: DestructionFeedback;
  readonly catalog: DestructionCatalog;
}

/**
 * The live 228 harness: the real 227 world and bus, the real 148 engine on the deterministic fake
 * backend and the real 228 feedback. No browser, no wall clock and no random source.
 */
export function createDestructionHarness(
  options: DestructionHarnessOptions = {},
): DestructionHarness {
  const epoch = options.worldEpoch ?? DESTRUCTION_WORLD_EPOCH;
  const world = destructibleWorld();
  const base = epoch === DESTRUCTION_WORLD_EPOCH ? createHarness() : null;
  const plan = base?.plan ?? world.plan;
  const layout = base?.layout ?? world.layout;
  const context: ContractContext =
    epoch === DESTRUCTION_WORLD_EPOCH
      ? DESTRUCTIBLE_CONTEXT
      : Object.freeze({
          schemaVersion: 1 as const,
          units: 'SI' as const,
          sessionId: DESTRUCTION_SESSION_ID,
          worldEpoch: epoch,
        });
  const bus = base?.bus ?? createEventBus({ sessionId: DESTRUCTION_SESSION_ID, worldEpoch: epoch });
  const decor = base?.decor ?? createDestructibleDecor({ context, eventBus: bus, layout, plan });
  const catalog = destructionCatalog();
  const backend = createFakeAudioBackend();
  const engine = createAudioEngine({ backend });
  if (options.gesture === true) engine.startFromUserGesture('POINTER');
  const feedback = attachDestructionFeedback({
    context,
    eventBus: bus,
    catalog,
    engine,
    listenerPositionM: options.listenerPositionM ?? null,
    ...(options.settings === undefined ? {} : { settings: options.settings }),
    ...(options.fragmentPoolCapacity === undefined
      ? {}
      : { fragmentPoolCapacity: options.fragmentPoolCapacity }),
  });
  return { context, bus, decor, plan, layout, backend, engine, feedback, catalog };
}

/** Listener placed exactly at the object, so distance attenuation never decides the assertion. */
export function listenerAt(definition: DestructibleDefinition): Vector3 {
  return definition.initialTransform.positionM;
}
