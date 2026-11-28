import { createAmbientTraffic } from '../../../src/app/ambient-traffic';
import { createCompositionWorld } from '../../../src/app/composition-world';
import type { CivilActorSnapshot } from '../../../src/fleet';
import type { DirectedLanePath, MovementSignal, StopLine } from '../../../src/world';

interface ProbeState {
  status: 'RUNNING' | 'AI_STOPPED' | 'VIOLATION' | 'PARTIAL' | 'FAIL';
  detail: string;
  tick: number;
  actorId: string | null;
  signal: MovementSignal | null;
  stopLineId: string | null;
  violation: Readonly<Record<string, unknown>> | null;
  report: unknown;
  error: string | null;
  trace?: string[];
}

const canvas = document.querySelector<HTMLCanvasElement>('#view')!,
  context = canvas.getContext('2d')!,
  phase = document.querySelector<HTMLElement>('#phase')!,
  line = document.querySelector<HTMLElement>('#line')!,
  notice = document.querySelector<HTMLElement>('#notice')!,
  reportNode = document.querySelector<HTMLElement>('#report')!,
  world = createCompositionWorld(),
  map = world.map,
  graph = world.graph,
  ambient = createAmbientTraffic({
    map,
    graph,
    context: { schemaVersion: 1, units: 'SI', sessionId: 'browser-283', worldEpoch: 1 },
    seed: 283,
    liveRules: true,
    focus: { x: world.spawn.x, z: world.spawn.z },
  });

const state: ProbeState = {
  status: 'RUNNING',
  detail: 'Se caută o mașină AI oprită la roșu.',
  tick: 0,
  actorId: null,
  signal: null,
  stopLineId: null,
  violation: null,
  report: null,
  error: null,
  trace: [],
};

function sample(path: DirectedLanePath, distanceM: number) {
  let remaining = Math.min(Math.max(distanceM, 0), path.lengthM);
  for (let index = 0; index < path.points.length - 1; index += 1) {
    const from = path.points[index]!,
      to = path.points[index + 1]!,
      length = Math.hypot(to.x - from.x, to.z - from.z);
    if (length <= 0) continue;
    if (remaining <= length || index === path.points.length - 2) {
      const fraction = Math.min(1, Math.max(0, remaining / length));
      return {
        positionM: {
          x: from.x + (to.x - from.x) * fraction,
          y: from.y + (to.y - from.y) * fraction,
          z: from.z + (to.z - from.z) * fraction,
        },
        headingRad: Math.atan2(to.z - from.z, to.x - from.x),
        lengthM: path.lengthM,
      };
    }
    remaining -= length;
  }
  const last = path.points[path.points.length - 1]!;
  return { positionM: last, headingRad: 0, lengthM: path.lengthM };
}

function signalLineFor(signal: MovementSignal): StopLine | null {
  return (
    map.stopLines.find(
      (candidate) =>
        candidate.kind === 'SIGNAL' &&
        candidate.signalId === signal.signalId &&
        candidate.laneId ===
          map.intersections
            .find((intersection) => intersection.id === signal.intersectionId)
            ?.movements.find((movement) => movement.id === signal.movementId)?.fromLaneId,
    ) ?? null
  );
}

function redStopCandidate(): {
  actor: CivilActorSnapshot;
  signal: MovementSignal;
  lane: StopLine;
} | null {
  if (state.tick < 180) return null;
  const signals = ambient.rules!.frame()?.signals ?? [];
  for (const signal of signals) {
    if (signal.state !== 'RED') continue;
    const stopLine = signalLineFor(signal);
    if (stopLine === null) continue;
    const anchor = map.geometry.nodes.find((node) => node.id === stopLine.anchorNodeId)?.positionM;
    if (anchor === undefined) continue;
    const actors = ambient
      .list()
      .filter((actor) => {
        if (actor.laneId !== stopLine.laneId || actor.authority !== 'AUTO') return false;
        if (actor.speedMps > 0.2) return false;
        const distance = Math.hypot(actor.positionM.x - anchor.x, actor.positionM.z - anchor.z);
        if (distance > 8) return false;
        const command = ambient.rules!.frame()?.commands.get(actor.vehicleId);
        return command?.holdKind === 'SIGNAL' && command.signalState === 'RED';
      })
      .sort((left, right) => left.speedMps - right.speedMps);
    if (actors.length > 0) return { actor: actors[0]!, signal, lane: stopLine };
  }
  return null;
}

const bounds = map.bounds;
function project(positionM: { x: number; z: number }) {
  const padding = 16;
  return {
    x:
      padding +
      ((positionM.x - bounds.minM.x) / (bounds.maxM.x - bounds.minM.x)) *
        (canvas.width - padding * 2),
    y:
      padding +
      ((positionM.z - bounds.minM.z) / (bounds.maxM.z - bounds.minM.z)) *
        (canvas.height - padding * 2),
  };
}

function draw(): void {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#12242c';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#2b414c';
  context.lineWidth = 2;
  for (const lane of map.lanes) {
    const path = graph.getDirectedPath(lane.id);
    if (path === null || path.points.length < 2) continue;
    context.beginPath();
    for (let index = 0; index < path.points.length; index += 1) {
      const point = project(path.points[index]!);
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    }
    context.stroke();
  }
  for (const stopLine of map.stopLines) {
    if (stopLine.kind !== 'SIGNAL' && stopLine.kind !== 'STOP') continue;
    const path = map.geometry.paths.find((candidate) => candidate.id === stopLine.geometryId);
    if (path === undefined) continue;
    const nodes = map.geometry.nodes.filter((node) => path.nodeIds.includes(node.id));
    if (nodes.length < 2) continue;
    const a = project(nodes[0]!.positionM),
      b = project(nodes[1]!.positionM);
    context.strokeStyle = stopLine.kind === 'SIGNAL' ? '#ff8a7a' : '#ffd28a';
    context.lineWidth = stopLine.id === state.stopLineId ? 5 : 2;
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.stroke();
  }
  for (const actor of ambient.list()) {
    const point = project(actor.positionM);
    context.beginPath();
    context.arc(point.x, point.y, actor.vehicleId === state.actorId ? 7 : 4, 0, Math.PI * 2);
    context.fillStyle =
      actor.vehicleId === state.actorId
        ? '#ffd166'
        : actor.authority === 'AUTO'
          ? '#7fd1e6'
          : '#ff9f80';
    context.fill();
    if (actor.vehicleId === state.actorId) {
      context.strokeStyle = '#fff';
      context.lineWidth = 2;
      context.stroke();
    }
  }
  context.fillStyle = '#e8f4f8';
  context.font = '16px system-ui, sans-serif';
  context.fillText(
    state.signal === null
      ? 'Se caută un semnal roșu cu trafic AI oprit...'
      : `Semnal ${state.signal.signalId}/${state.signal.movementId}: ${state.signal.state}`,
    20,
    32,
  );
  context.font = '13px system-ui, sans-serif';
  context.fillStyle = '#b9d7e2';
  context.fillText(state.detail, 20, 54);
}

function refreshReport(): void {
  state.report = ambient.trafficRules();
  phase.textContent = state.status;
  phase.className =
    state.status === 'VIOLATION'
      ? 'badge red'
      : state.status === 'AI_STOPPED'
        ? 'badge'
        : state.status === 'FAIL' || state.status === 'PARTIAL'
          ? 'badge red'
          : 'badge green';
  line.textContent = state.detail;
  reportNode.textContent = JSON.stringify(
    {
      status: state.status,
      tick: state.tick,
      actorId: state.actorId,
      signal: state.signal,
      stopLineId: state.stopLineId,
      violation: state.violation,
      report: state.report,
      error: state.error,
      trace: state.trace,
    },
    null,
    2,
  );
  (globalThis as unknown as { __trafficProbe?: ProbeState }).__trafficProbe = state;
  draw();
}

function stepOne(): void {
  state.tick += 1;
  ambient.traffic.step({ tick: state.tick, dtSeconds: 1 / 60 });
}

let found: ReturnType<typeof redStopCandidate> = null;
let searchTicks = 0;
function search(): void {
  if (found === null && searchTicks < 12000) {
    for (let index = 0; index < 240 && found === null; index += 1) {
      stepOne();
      searchTicks += 1;
      found = redStopCandidate();
    }
    if (found === null) {
      state.detail = `Caut trafic oprit la roșu (${searchTicks}/12000 tick-uri simulate).`;
      refreshReport();
      setTimeout(search, 0);
      return;
    }
  }
  if (found === null) {
    state.status = 'FAIL';
    state.detail = 'Nicio mașină AI oprită la un semnal roșu în fereastra probei.';
    refreshReport();
    return;
  }
  state.status = 'AI_STOPPED';
  state.actorId = found.actor.vehicleId;
  state.signal = found.signal;
  state.stopLineId = found.lane.id;
  state.detail = `${found.actor.vehicleId} oprit la ${found.signal.signalId}/${found.signal.movementId} (${found.actor.speedMps.toFixed(2)} m/s), linia ${found.lane.id}.`;
  refreshReport();
  setTimeout(crossRed, 2000);
}

let crossingTicks = 0;
function crossRed(): void {
  if (found === null || state.actorId === null) return;
  const actor = ambient.get(state.actorId);
  if (actor === undefined) {
    state.status = 'FAIL';
    state.detail = 'Actorul oprit la roșu a dispărut.';
    refreshReport();
    return;
  }
  ambient.traffic.setAuthority(state.actorId, 'MANUAL', state.tick);
  const path = graph.getDirectedPath(actor.laneId);
  const projectAccess = actor.driverKind === 'TAXI' ? 'TAXI' : 'CIVIL';
  const projection = graph.projectOnLane(actor.laneId, {
    positionM: actor.positionM,
    access: projectAccess,
  });
  if (path === null || projection === null) {
    state.status = 'FAIL';
    state.detail = 'Proiecția pe bandă a actorului a eșuat.';
    refreshReport();
    return;
  }
  const startM = projection.longitudinalM;
  const advance = (): void => {
    if (state.actorId === null || crossingTicks >= 360) {
      state.status = 'PARTIAL';
      state.detail =
        'Jucătorul a fost preluat, dar evenimentul de roșu nu a apărut în fereastra de traversare.';
      refreshReport();
      return;
    }
    for (let index = 0; index < 4; index += 1) {
      crossingTicks += 1;
      const distanceM = startM + crossingTicks * 0.1;
      const samplePoint = sample(path, distanceM);
      ambient.traffic.reconcile(
        state.actorId,
        {
          positionM: samplePoint.positionM,
          headingRad: samplePoint.headingRad,
          speedMps: 6,
        },
        state.tick,
      );
      stepOne();
      const current = (ambient.rules!.frame()?.signals ?? []).find(
        (signal) =>
          state.signal !== null &&
          signal.signalId === state.signal.signalId &&
          signal.movementId === state.signal.movementId,
      );
      if (current !== undefined) state.signal = current;
      const moved = ambient.get(state.actorId);
      state.detail = `cross t=${state.tick} pos=${moved?.positionM.x.toFixed(2)},${moved?.positionM.z.toFixed(2)} v=${moved?.speedMps.toFixed(2)} auth=${moved?.authority} sig=${current?.state ?? 'none'} cmd=${ambient.rules!.frame()?.commands.get(state.actorId)?.reason ?? 'none'}`;
      if (state.trace !== undefined && crossingTicks % 30 === 0) state.trace.push(state.detail);
      const violation = ambient
        .violations()
        .find((event) => event.vehicleId === state.actorId && event.kind === 'RED_LIGHT');
      if (violation !== undefined) {
        state.status = 'VIOLATION';
        state.violation = violation as unknown as Readonly<Record<string, unknown>>;
        state.detail = `Încălcare reală: ${violation.stopLineId ?? ''} la tick ${violation.tick}, ${violation.frontDistanceBeforeM.toFixed(2)} -> ${violation.frontDistanceAfterM.toFixed(2)} m.`;
        notice.style.display = 'block';
        notice.textContent = `Încălcare: trecere pe roșu la ${violation.stopLineId ?? 'linia de semnal'} (tic ${violation.tick})`;
        refreshReport();
        return;
      }
      refreshReport();
    }
    setTimeout(advance, 0);
  };
  advance();
}

refreshReport();
setTimeout(search, 0);
