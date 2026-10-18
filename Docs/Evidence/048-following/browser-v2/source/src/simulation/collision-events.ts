import { contextFields, fields, readContext, requireContract, tick } from '../sessions';
import type { ContractContext } from '../sessions';
import { createCollisionEpisodes } from '../vehicles';
import type {
  CollisionEpisodeOptions,
  CollisionIncident,
  CollisionReadback,
  PhysicsCollisionPort,
} from '../vehicles';
import type { EventBus } from './event-bus';

export const COLLISION_FAILURE_SAMPLE_CAPACITY = 64;
export interface CollisionFailureSample {
  readonly eventId: string;
  readonly listenerId: number;
  /** No arbitrary listener-owned error graph is retained. */
  readonly errorType: string;
}
export interface CollisionPublicationReport {
  readonly status: 'drained' | 'blocked';
  readonly accepted: number;
  readonly discarded: number;
  readonly pending: number;
  readonly blocked: unknown;
  readonly listenerFailures: number;
  readonly failureSamples: readonly CollisionFailureSample[];
  readonly omittedListenerFailures: number;
}
export type CollisionCapturePort = Pick<
  PhysicsCollisionPort,
  'collisionSource' | 'collisionStepSerial' | 'readCollisionContacts'
>;
export interface CollisionEventAdapterOptions {
  readonly context: ContractContext;
  readonly physics: CollisionCapturePort;
  readonly eventBus: EventBus;
  readonly episodes?: CollisionEpisodeOptions;
}

/** Composition owns event delivery; before/capture phases fence a single real native step. */
export function createCollisionEventAdapter(options: CollisionEventAdapterOptions) {
  let context = Object.freeze(readContext(fields(options.context, contextFields)));
  let physics = options.physics;
  const bus = options.eventBus;
  const assertBus = (expected = context) => {
    const state = bus.getStats();
    requireContract(
      !state.disposed &&
        state.sessionId === expected.sessionId &&
        state.worldEpoch === expected.worldEpoch,
      'Collision bus has stale or foreign context',
    );
    return state;
  };
  assertBus();
  const episodes = createCollisionEpisodes(context, physics.collisionSource, options.episodes);
  let lastCapturedSerial = tick(physics.collisionStepSerial());
  let lastPhysicsTick = -1,
    preparedTick: number | null = null,
    preparedSerial: number | null = null;
  let busy = false,
    disposed = false,
    faulted = false;
  const idle = () => {
    requireContract(!disposed && !busy, 'Collision adapter disposed or busy');
  };
  const publishPending = (): CollisionPublicationReport => {
    let listenerFailures = 0;
    const failureSamples: CollisionFailureSample[] = [];
    const result = episodes.drain((incident: CollisionIncident) => {
      const published = bus.publish(
        Object.freeze({
          schemaVersion: incident.schemaVersion,
          units: incident.units,
          sessionId: incident.sessionId,
          worldEpoch: incident.worldEpoch,
          eventId: incident.incidentId,
          tick: incident.tick,
          entityIds: Object.freeze([incident.vehicleId, incident.otherEntityId]),
          type: 'COLLISION',
          payload: Object.freeze({
            vehicleId: incident.vehicleId,
            otherEntityId: incident.otherEntityId,
            impulseNs: incident.impulseNs,
          }),
        }),
      );
      // Both delivered and duplicate consume the exact pending identity. Listener errors are accepted effects.
      for (const failure of published.failures) {
        listenerFailures++;
        if (failureSamples.length < COLLISION_FAILURE_SAMPLE_CAPACITY)
          failureSamples.push(
            Object.freeze({
              eventId: incident.incidentId,
              listenerId: failure.listenerId,
              errorType: typeof failure.error,
            }),
          );
      }
    });
    return Object.freeze({
      ...result,
      listenerFailures,
      failureSamples: Object.freeze(failureSamples),
      omittedListenerFailures: listenerFailures - failureSamples.length,
    });
  };
  return Object.freeze({
    beforePhysicsStep(nextTick: number): CollisionPublicationReport & { readonly ready: boolean } {
      idle();
      busy = true;
      try {
        requireContract(!faulted, 'Partial collision tick requires explicit owner recovery');
        const at = tick(nextTick);
        requireContract(
          preparedTick === null || preparedTick === at,
          'An admitted collision tick cannot be overwritten',
        );
        requireContract(
          lastPhysicsTick < 0 || at === lastPhysicsTick + 1,
          'Collision physics ticks must be consecutive; never replay an advanced step',
        );
        requireContract(
          physics.collisionStepSerial() === lastCapturedSerial,
          'Physics advanced outside collision admission',
        );
        assertBus();
        const publication = publishPending();
        if (publication.status === 'blocked') {
          preparedTick = null;
          preparedSerial = null;
          return Object.freeze({ ...publication, ready: false });
        }
        requireContract(
          physics.collisionStepSerial() === lastCapturedSerial,
          'Physics advanced during collision publication',
        );
        requireContract(
          assertBus().watermarkTick <= at,
          'Collision tick precedes event bus watermark',
        );
        preparedTick = at;
        preparedSerial = lastCapturedSerial;
        return Object.freeze({ ...publication, ready: true });
      } finally {
        busy = false;
      }
    },
    captureAfterPhysicsStep(atTick: number): {
      readonly tick: number;
      readonly emitted: number;
      readonly readback: CollisionReadback;
      readonly publication: CollisionPublicationReport;
    } {
      idle();
      busy = true;
      try {
        const at = tick(atTick);
        requireContract(
          !faulted && preparedTick === at && preparedSerial !== null,
          'Collision tick was not admitted before physics',
        );
        const expectedSerial = preparedSerial + 1;
        preparedTick = null;
        preparedSerial = null;
        // The caller has already completed physical mutation. Any capture failure is explicit partial-tick state.
        lastPhysicsTick = at;
        let readback: CollisionReadback, emitted: number;
        try {
          assertBus();
          requireContract(
            physics.collisionStepSerial() === expectedSerial,
            'Collision capture requires exactly one real physics step',
          );
          readback = physics.readCollisionContacts();
          requireContract(
            readback.physicsStepSerial === expectedSerial,
            'Stale native collision snapshot',
          );
          emitted = episodes.update(at, readback.contacts);
          lastCapturedSerial = expectedSerial;
        } catch (error) {
          faulted = true;
          throw error;
        }
        return Object.freeze({ tick: at, emitted, readback, publication: publishPending() });
      } finally {
        busy = false;
      }
    },
    retryPublications(): CollisionPublicationReport {
      idle();
      busy = true;
      try {
        requireContract(!faulted, 'Partial collision tick requires explicit owner recovery');
        assertBus();
        return publishPending();
      } finally {
        busy = false;
      }
    },
    getStats() {
      return Object.freeze({
        ...episodes.getStats(),
        lastPhysicsTick,
        physicsStepSerial: lastCapturedSerial,
        preparedTick,
        faulted,
        disposed,
      });
    },
    reset(nextContext: ContractContext, nextPhysics: CollisionCapturePort): void {
      idle();
      busy = true;
      try {
        const parsed = Object.freeze(readContext(fields(nextContext, contextFields)));
        assertBus(parsed);
        const serial = tick(nextPhysics.collisionStepSerial());
        episodes.reset(parsed, nextPhysics.collisionSource);
        context = parsed;
        physics = nextPhysics;
        lastCapturedSerial = serial;
        lastPhysicsTick = -1;
        preparedTick = null;
        preparedSerial = null;
        faulted = false;
      } finally {
        busy = false;
      }
    },
    dispose(): void {
      if (disposed) return;
      idle();
      episodes.dispose();
      disposed = true;
      preparedTick = null;
      preparedSerial = null;
    },
  });
}
