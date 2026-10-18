import {
  contextFields,
  createStableId,
  fields,
  readContext,
  requireContract,
  tick as readTick,
} from '../sessions';
import type { ContractContext } from '../sessions';
import { FIXED_TICK_HZ, parseSimulationEvent } from '../simulation';
import type { EventBus, PublishResult, SimulationEvent } from '../simulation';
import { parseRoadMap } from './parser';
import { createIntersectionConflicts } from './intersection-conflicts';
import type { RoadSignal, SignalPhase } from './schema';
export type SignalState = 'RED' | 'YELLOW' | 'GREEN';
export interface MovementSignal {
  readonly tick: number;
  readonly signalId: string;
  readonly intersectionId: string;
  readonly phaseId: string;
  readonly movementId: string;
  readonly state: SignalState;
}
export interface SignalControllerSnapshot {
  readonly tick: number;
  readonly signalId: string;
  readonly intersectionId: string;
  readonly phaseId: string;
  readonly phaseStartedTick: number;
  readonly nextChangeTick: number;
}
export interface SignalControllerStep {
  readonly tick: number;
  readonly advanced: boolean;
  readonly eventIds: readonly string[];
  readonly publications: readonly PublishResult[];
}
export interface SignalControllerStats {
  readonly tick: number;
  readonly signals: number;
  readonly phases: number;
  readonly stateEntries: number;
  readonly pendingEvents: number;
  readonly disposed: boolean;
}
export interface SignalController {
  step(tick: number): SignalControllerStep;
  getMovementSignal(intersectionId: string, movementId: string): MovementSignal | null;
  getSignal(signalId: string): SignalControllerSnapshot | null;
  getStats(): SignalControllerStats;
  dispose(): void;
}
export interface SignalControllerOptions {
  readonly context: ContractContext;
  readonly eventBus: EventBus;
  readonly initialTick?: number;
}
interface RuntimeSignal {
  readonly program: RoadSignal;
  readonly durationTicks: readonly number[];
  readonly states: readonly ReadonlyMap<string, SignalState>[];
  phaseIndex: number;
  phaseStartedTick: number;
  nextChangeTick: number;
}
interface Transition {
  readonly owner: RuntimeSignal;
  readonly nextPhase: number;
  readonly nextChangeTick: number;
  readonly event: SimulationEvent;
}
/** Tick-addressed fixed-rate signals. No wall clock, renderer, vehicle scan or retained event history. */
export function createSignalController(
  input: unknown,
  options: SignalControllerOptions,
): SignalController {
  const context = Object.freeze(readContext(fields(options.context, contextFields)));
  requireContract(context.sessionId.length <= 256, 'Signal session identity exceeds256characters');
  const bus = options.eventBus;
  const map = parseRoadMap(input),
    conflicts = createIntersectionConflicts(map);
  const mapId = map.mapId;
  let currentTick = readTick(options.initialTick ?? 0),
    disposed = false,
    busy = false;
  let pending: {
    readonly tick: number;
    readonly transitions: readonly Transition[];
    readonly nextTicks: readonly { owner: RuntimeSignal; next: number }[];
    readonly publications: PublishResult[];
  } | null = null;
  const owners = new Map<string, RuntimeSignal>(),
    byIntersection = new Map<string, RuntimeSignal>();
  let phaseCount = 0,
    stateEntries = 0;
  const assertWorld = (tick: number) => {
    const stats = bus.getStats();
    requireContract(
      !stats.disposed && stats.worldEpoch === context.worldEpoch,
      'Signal event bus belongs to a stale/disposed world',
    );
    requireContract(stats.watermarkTick <= tick, 'Signal tick precedes event bus watermark');
  };
  assertWorld(currentTick);
  for (const program of [...map.signals].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const states: ReadonlyMap<string, SignalState>[] = [];
    const durations: number[] = [];
    for (const phase of program.phases) {
      validateGreen(program, phase);
      const duration = readTick(Math.ceil(phase.durationS * FIXED_TICK_HZ - 1e-9));
      requireContract(duration > 0, 'Signal phase duration must cover at least one tick');
      durations.push(duration);
      states.push(new Map(phase.movementStates.map((s) => [s.movementId, s.state])));
      phaseCount++;
      stateEntries += phase.movementStates.length;
    }
    const owner: RuntimeSignal = {
      program,
      durationTicks: Object.freeze(durations),
      states: Object.freeze(states),
      phaseIndex: 0,
      phaseStartedTick: currentTick,
      nextChangeTick: readTick(currentTick + durations[0]),
    };
    owners.set(program.id, owner);
    byIntersection.set(program.intersectionId, owner);
  }
  function validateGreen(program: RoadSignal, phase: SignalPhase) {
    const green = phase.movementStates.filter((s) => s.state === 'GREEN');
    for (let i = 0; i < green.length; i++)
      for (let j = i + 1; j < green.length; j++) {
        const relation = conflicts.getRelation(
          program.intersectionId,
          green[i].movementId,
          green[j].movementId,
        );
        requireContract(
          relation !== null && !relation.incompatible,
          `Unsafe GREEN phase ${program.id}/${phase.id}: ${green[i].movementId} conflicts with ${green[j].movementId} (${relation?.id ?? 'unknown movement'})`,
        );
      }
  }
  const empty = (tick: number): SignalControllerStep =>
    Object.freeze({
      tick,
      advanced: false,
      eventIds: Object.freeze([]),
      publications: Object.freeze([]),
    });
  return Object.freeze({
    step(value: number): SignalControllerStep {
      requireContract(!disposed && !busy, 'Signal controller disposed or reentrant');
      const next = readTick(value);
      assertWorld(next);
      if (next === currentTick && !pending) return empty(currentTick);
      requireContract(
        next === currentTick + 1,
        'Signal ticks must be consecutive; no skipped authoritative ticks',
      );
      if (pending) requireContract(pending.tick === next, 'Retry the same failed signal tick');
      else {
        const transitions: Transition[] = [],
          nextTicks: { owner: RuntimeSignal; next: number }[] = [];
        for (const owner of owners.values()) {
          if (next !== owner.nextChangeTick) continue;
          const nextPhase = (owner.phaseIndex + 1) % owner.program.phases.length;
          const nextChangeTick = readTick(next + owner.durationTicks[nextPhase]);
          if (owner.program.phases.length === 1) {
            nextTicks.push({ owner, next: nextChangeTick });
            continue;
          }
          const phase = owner.program.phases[nextPhase];
          const event = parseSimulationEvent({
            ...context,
            type: 'SIGNAL_PHASE_CHANGED',
            tick: next,
            eventId: createStableId('signal-phase', context.sessionId, [
              String(context.worldEpoch),
              mapId,
              owner.program.id,
              String(next),
            ]),
            entityIds: [owner.program.id],
            payload: {
              signalId: owner.program.id,
              intersectionId: owner.program.intersectionId,
              fromPhaseId: owner.program.phases[owner.phaseIndex].id,
              toPhaseId: phase.id,
              movementStates: [...phase.movementStates].sort((a, b) =>
                a.movementId < b.movementId ? -1 : 1,
              ),
            },
          });
          transitions.push(Object.freeze({ owner, nextPhase, nextChangeTick, event }));
        }
        pending = Object.freeze({
          tick: next,
          transitions: Object.freeze(transitions),
          nextTicks: Object.freeze(nextTicks),
          publications: [],
        });
      }
      busy = true;
      try {
        // Retain accepted-prefix results so retry preserves listener failures and never republishes it.
        while (pending.publications.length < pending.transitions.length) {
          const transition = pending.transitions[pending.publications.length];
          pending.publications.push(bus.publish(transition.event));
        }
        const publications = [...pending.publications];
        for (const transition of pending.transitions) {
          transition.owner.phaseIndex = transition.nextPhase;
          transition.owner.phaseStartedTick = next;
          transition.owner.nextChangeTick = transition.nextChangeTick;
        }
        for (const entry of pending.nextTicks) {
          entry.owner.phaseStartedTick = next;
          entry.owner.nextChangeTick = entry.next;
        }
        const eventIds = Object.freeze(pending.transitions.map((t) => t.event.eventId));
        currentTick = next;
        pending = null;
        return Object.freeze({
          tick: next,
          advanced: true,
          eventIds,
          publications: Object.freeze(publications),
        });
      } finally {
        busy = false;
      }
    },
    getMovementSignal(intersectionId: string, movementId: string): MovementSignal | null {
      requireContract(!disposed, 'Signal controller disposed');
      requireContract(
        pending === null && !busy,
        'Signal delivery pending; use event payload during publication or retry the failed tick',
      );
      const owner = byIntersection.get(intersectionId),
        state = owner?.states[owner.phaseIndex].get(movementId);
      if (!owner || state === undefined) return null;
      return Object.freeze({
        tick: currentTick,
        signalId: owner.program.id,
        intersectionId,
        phaseId: owner.program.phases[owner.phaseIndex].id,
        movementId,
        state,
      });
    },
    getSignal(signalId: string): SignalControllerSnapshot | null {
      requireContract(!disposed, 'Signal controller disposed');
      requireContract(
        pending === null && !busy,
        'Signal delivery pending; use event payload during publication or retry the failed tick',
      );
      const owner = owners.get(signalId);
      return owner
        ? Object.freeze({
            tick: currentTick,
            signalId,
            intersectionId: owner.program.intersectionId,
            phaseId: owner.program.phases[owner.phaseIndex].id,
            phaseStartedTick: owner.phaseStartedTick,
            nextChangeTick: owner.nextChangeTick,
          })
        : null;
    },
    getStats: () =>
      Object.freeze({
        tick: currentTick,
        signals: owners.size,
        phases: phaseCount,
        stateEntries,
        pendingEvents: pending?.transitions.length ?? 0,
        disposed,
      }),
    dispose() {
      if (disposed) return;
      requireContract(!busy, 'Signal disposal is reentrant');
      disposed = true;
      owners.clear();
      byIntersection.clear();
      pending = null;
      phaseCount = 0;
      stateEntries = 0;
    },
  });
}
