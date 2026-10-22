// Unscheduled reference prepared before PBI219 production scheduling.
import { createFixedTickLoop } from '../../src/simulation/fixed-tick';
import { createRoadContext } from '../../src/autonomy';
import { createEventBus } from '../../src/simulation/event-bus';
import { createSignalController } from '../../src/world';
import { roadContextFixture } from '../autonomy/road-context-reference';

export interface ReferenceActor {
  readonly id: string;
  readonly incarnation: number;
}
export interface ReferencePorts {
  input(tick: number): void;
  decision(actor: ReferenceActor, tick: number, urgent: boolean): void;
  controller(actor: ReferenceActor, tick: number, dtSeconds: number): void;
  physics(tick: number, dtSeconds: number): void;
}

/** Existing conceptual all-in-phase10Hz calls; no production scheduler algorithm here. */
export function unscheduledStep(
  actors: readonly ReferenceActor[],
  tick: number,
  ports: ReferencePorts,
  urgent: ReadonlySet<string> = new Set(),
): undefined {
  ports.input(tick);
  for (const actor of actors)
    if (tick % 6 === 0 || urgent.has(actor.id)) ports.decision(actor, tick, urgent.has(actor.id));
  for (const actor of actors) ports.controller(actor, tick, 1 / 60);
  ports.physics(tick, 1 / 60);
  return undefined;
}

/** Bounded synthetic route work over actual033 successors; not implemented045 gameplay. */
export function syntheticRouteSearch(
  graph: ReturnType<typeof roadContextFixture>['graph'],
  from: string,
  to: string,
  blocked: ReadonlySet<string> = new Set(),
): readonly string[] | null {
  const queue: string[][] = [[from]],
    seen = new Set([from]);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const path = queue[cursor],
      lane = path[path.length - 1];
    if (blocked.has(lane)) continue;
    if (lane === to) return Object.freeze(path);
    for (const successor of graph.getSuccessors(lane, 'CIVIL')) {
      if (seen.has(successor.id) || blocked.has(successor.id)) continue;
      if (seen.size >= 64) throw new Error('Synthetic fixture route graph exceeds64nodes');
      seen.add(successor.id);
      queue.push([...path, successor.id]);
    }
  }
  return null;
}

export function schedulingFixture(dense: boolean) {
  const fixture = roadContextFixture(dense),
    { frame, map, policy, graph } = fixture;
  // Normal maximumV1 is70; retain all110 for the separate overload fixture.
  if (!dense) {
    const denseActors = roadContextFixture(true).frame.vehicles;
    frame.vehicles = denseActors.slice(0, 70);
  }
  const actors = frame.vehicles
    .map(({ id, incarnation }) => Object.freeze({ id, incarnation }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const context = createRoadContext(map, { priorityPolicy: policy });
  const eventBus = createEventBus({ sessionId: frame.sessionId, worldEpoch: frame.worldEpoch });
  const signals = createSignalController(map, {
    context: {
      schemaVersion: 1,
      units: 'SI',
      sessionId: frame.sessionId,
      worldEpoch: frame.worldEpoch,
    },
    eventBus,
  });
  let decisions = 0,
    controllers = 0,
    physics = 0,
    routeCalls = 0,
    checksum = 0;
  const ports: ReferencePorts = {
    input() {},
    decision(actor, tick, urgent) {
      if (urgent) context.invalidate(actor.id, actor.incarnation);
      const result = context.getContext(actor.id, { force: true })!;
      if (result.tick !== tick) throw new Error('Reference context tick mismatch');
      checksum +=
        result.nearbyVehicleIds.length + result.obstacleIds.length + result.zoneIds.length;
      decisions++;
    },
    controller(_actor, _tick, dt) {
      if (dt !== 1 / 60) throw new Error('Changed controller dt');
      controllers++;
    },
    physics(_tick, dt) {
      if (dt !== 1 / 60) throw new Error('Changed physics dt');
      physics++;
    },
  };
  function prepare(tick: number) {
    signals.step(tick);
    frame.tick = tick;
    frame.signals = map.intersections[0].movements.map((movement) =>
      signals.getMovementSignal('junction', movement.id)!,
    );
    context.updateFrame(frame);
  }
  function route(blocked: ReadonlySet<string> = new Set()) {
    routeCalls++;
    return syntheticRouteSearch(graph, 'west-in', 'west-out', blocked);
  }
  return {
    actors,
    frame,
    context,
    ports,
    prepare,
    route,
    counters: () => ({ decisions, controllers, physics, routeCalls, checksum }),
    dispose() {
      context.dispose();
      signals.dispose();
      eventBus.dispose();
    },
  };
}

export function referenceClockScenario(fps: 30 | 60 | 120) {
  const events: string[] = [],
    actors = [
      { id: 'a', incarnation: 1 },
      { id: 'b', incarnation: 1 },
    ];
  const ports: ReferencePorts = {
    input(tick) {
      if (tick === 7) events.push(`input:${tick}:b`);
    },
    decision(actor, tick, urgent) {
      if (urgent) events.push(`urgent:${tick}:${actor.id}`);
    },
    controller(actor, tick, dt) {
      if (dt !== 1 / 60) throw new Error('dt');
      if (tick === 7) events.push(`control:${tick}:${actor.id}`);
    },
    physics(tick, dt) {
      if (dt !== 1 / 60) throw new Error('dt');
      events.push(`physics:${tick}`);
    },
  };
  const loop = createFixedTickLoop({
    step: ({ tick }) =>
      unscheduledStep(actors, tick, ports, tick === 7 ? new Set(['b']) : new Set()),
    captureSnapshot: () => ({ count: events.length }),
    interpolate: (_a, b) => b,
  });
  loop.frame(0);
  for (let frame = 1; frame <= fps * 2; frame++) loop.frame((frame * 1000) / fps);
  const state = loop.getState();
  loop.dispose();
  return {
    events,
    tick: state.tick,
    simulatedSeconds: state.simulatedSeconds,
    activeRealSeconds: state.activeRealSeconds,
    debtSeconds: state.debtSeconds,
  };
}

export function referenceStressScenario(
  kind: 'hitch' | 'background' | 'urgent-selection-blockage',
) {
  const events: string[] = [],
    decisions: string[] = [],
    actors = [
      { id: 'a', incarnation: 1 },
      { id: 'b', incarnation: 1 },
    ];
  let graphVersion = 1,
    selected = 'a';
  const ports: ReferencePorts = {
    input(tick) {
      if (tick === 7) {
        selected = 'b';
        events.push(`selection:${tick}:${selected}`);
        events.push(`input:${tick}:${selected}`);
      }
      if (tick === 14) {
        graphVersion++;
        events.push(`blocked:${tick}:v${graphVersion}`);
      }
    },
    decision(actor, tick, urgent) {
      decisions.push(`${tick}:${actor.id}:${urgent ? 'urgent' : 'periodic'}:v${graphVersion}`);
    },
    controller(actor, tick, dt) {
      if (dt !== 1 / 60) throw new Error('dt');
      if (tick === 7 && actor.id === selected) events.push(`input-applied:${tick}:${actor.id}`);
    },
    physics(tick, dt) {
      if (dt !== 1 / 60) throw new Error('dt');
      events.push(`physics:${tick}`);
    },
  };
  const loop = createFixedTickLoop({
    step: ({ tick }) =>
      unscheduledStep(actors, tick, ports, tick === 7 || tick === 14 ? new Set(['b']) : new Set()),
    captureSnapshot: () => ({ events: events.length }),
    interpolate: (_a, b) => b,
  });
  const maxSteps: number[] = [];
  loop.frame(0);
  if (kind === 'hitch') {
    const overloaded = loop.frame(1000);
    if (overloaded.state.status !== 'overload' || overloaded.steps !== 0)
      throw new Error('Hitch must pause explicitly');
    loop.resume(1000);
    for (let frame = 1; frame <= 15; frame++) maxSteps.push(loop.frame(1000 + frame).steps);
  } else if (kind === 'background') {
    loop.frame(100);
    loop.pause(100, 'background');
    loop.frame(10000);
    loop.resume(10000);
    for (let frame = 1; frame <= 114; frame++)
      maxSteps.push(loop.frame(10000 + (frame * 1000) / 60).steps);
  } else
    for (let frame = 1; frame <= 120; frame++) maxSteps.push(loop.frame((frame * 1000) / 60).steps);
  const state = loop.getState();
  loop.dispose();
  if (maxSteps.some((steps) => steps > 4)) throw new Error('Recovery limit changed');
  return {
    kind,
    events,
    decisions,
    tick: state.tick,
    debtSeconds: state.debtSeconds,
    overloadCount: state.overloadCount,
    simulatedSeconds: state.simulatedSeconds,
    activeRealSeconds: state.activeRealSeconds,
    maximumSteps: Math.max(...maxSteps),
  };
}
