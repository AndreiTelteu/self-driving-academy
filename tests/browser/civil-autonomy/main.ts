import { createAmbientTraffic } from '../../../src/app/ambient-traffic';
import { createCompositionWorld } from '../../../src/app/composition-world';
import { createV3Composition } from '../../../src/app/walking-composition';
import type { CompositionFrame } from '../../../src/app/walking-composition';
import type { CivilActorSnapshot } from '../../../src/fleet';
import { createDefaultSettings } from '../../../src/settings';
import type { DirectedLanePath, RoadMap } from '../../../src/world';

interface ProbeCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

interface ProbeState {
  status: 'RUNNING' | 'STOPPED' | 'TAKEN_OVER' | 'DRIVEN' | 'EXITED' | 'PASS' | 'PARTIAL' | 'FAIL';
  detail: string;
  tick: number;
  vehicleId: string | null;
  routeBefore: readonly string[];
  routeAfter: readonly string[];
  destinationBefore: string | null;
  destinationAfter: string | null;
  frozenDeltaM: number;
  drivenM: number;
  ambientMoveM: number;
  exitJumpM: number;
  exitDetail: string | null;
  resumedM: number;
  actorCountBefore: number;
  actorCountAfter: number;
  authority: string | null;
  takeoverAccepted: boolean;
  manualSeat: boolean;
  checks: readonly ProbeCheck[];
  trace: string[];
  error: string | null;
}

const CONTEXT = Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    sessionId: 'browser-284-civil-autonomy',
    worldEpoch: 1,
  }),
  world = createCompositionWorld(),
  map = world.map,
  ambient = createAmbientTraffic({
    map,
    graph: world.graph,
    context: CONTEXT,
    seed: 284,
    taxiCount: 20,
    civilianCount: 24,
    liveRules: true,
    focus: { x: world.spawn.x, z: world.spawn.z },
    avoid: [
      { x: world.spawn.x, z: world.spawn.z },
      ...world.vehicles.map((vehicle) => ({
        x: vehicle.positionM.x,
        z: vehicle.positionM.z,
      })),
    ],
  }),
  composition = createV3Composition({
    layout: world.layout,
    start: world.spawn,
    control: createDefaultSettings('284-probe').input.control,
    context: CONTEXT,
    vehicles: world.vehicles,
    traffic: ambient.traffic,
    map,
    graph: world.graph,
  }),
  canvas = document.querySelector<HTMLCanvasElement>('#view')!,
  context = canvas.getContext('2d')!,
  phaseNode = document.querySelector<HTMLElement>('#phase')!,
  lineNode = document.querySelector<HTMLElement>('#line')!,
  noticeNode = document.querySelector<HTMLElement>('#notice')!,
  reportNode = document.querySelector<HTMLElement>('#report')!;

const state: ProbeState = {
  status: 'RUNNING',
  detail: 'Se caută un civil AI oprit în trafic.',
  tick: 0,
  vehicleId: null,
  routeBefore: [],
  routeAfter: [],
  destinationBefore: null,
  destinationAfter: null,
  frozenDeltaM: 0,
  drivenM: 0,
  ambientMoveM: 0,
  exitJumpM: 0,
  exitDetail: null,
  resumedM: 0,
  actorCountBefore: 0,
  actorCountAfter: 0,
  authority: null,
  takeoverAccepted: false,
  manualSeat: false,
  checks: [],
  trace: [],
  error: null,
};

const stoppedTicks = new Map<string, number>();
let target: CivilActorSnapshot | null = null;
let frame: CompositionFrame = composition.step({ tick: 1 });
state.tick = 1;

function step(): CompositionFrame {
  state.tick += 1;
  frame = composition.step({ tick: state.tick });
  return frame;
}

function vehicleOf(id: string) {
  return frame.vehicles.find((vehicle) => vehicle.vehicleId === id) ?? null;
}

function pushTrace(detail: string): void {
  if (state.trace.length < 80) state.trace.push(`${state.tick}: ${detail}`);
}

function pointAt(
  path: DirectedLanePath,
  distanceM: number,
): Readonly<{ x: number; y: number; z: number }> {
  let remaining = Math.min(Math.max(distanceM, 0), path.lengthM);
  for (let index = 0; index < path.points.length - 1; index += 1) {
    const from = path.points[index]!,
      to = path.points[index + 1]!,
      length = Math.hypot(to.x - from.x, to.z - from.z);
    if (length <= 0) continue;
    if (remaining <= length || index === path.points.length - 2) {
      const fraction = Math.min(1, Math.max(0, remaining / length));
      return {
        x: from.x + (to.x - from.x) * fraction,
        y: from.y + (to.y - from.y) * fraction,
        z: from.z + (to.z - from.z) * fraction,
      };
    }
    remaining -= length;
  }
  return path.points[path.points.length - 1]!;
}

function routePoint(actor: CivilActorSnapshot, aheadM: number) {
  let remaining = actor.distanceAlongRouteM + aheadM;
  for (const laneId of actor.route.path) {
    const path = world.graph.getDirectedPath(laneId);
    if (path === null) continue;
    if (remaining <= path.lengthM || laneId === actor.route.path.at(-1))
      return pointAt(path, Math.min(remaining, path.lengthM));
    remaining -= path.lengthM;
  }
  return null;
}

function normalizeAngle(value: number): number {
  return ((((value + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
}

/** Follows the suspended 058 route without changing it; only the PLAYER steering input changes. */
function steerToRoute(
  vehicle: Readonly<{ positionM: Readonly<{ x: number; y: number; z: number }>; yawRad: number }>,
  actor: CivilActorSnapshot,
): void {
  const target = routePoint(actor, 8);
  if (target === null) {
    composition.port.setAction('steerLeft', false);
    composition.port.setAction('steerRight', false);
    return;
  }
  const dx = target.x - vehicle.positionM.x,
    dz = target.z - vehicle.positionM.z;
  if (Math.hypot(dx, dz) < 0.5) return;
  const desiredYaw = Math.atan2(dx, dz),
    error = normalizeAngle(desiredYaw - vehicle.yawRad);
  composition.port.setAction('steerRight', error > 0.02);
  composition.port.setAction('steerLeft', error < -0.02);
}

function findStoppedCivil(): CivilActorSnapshot | null {
  if (state.tick < 600) return null;
  const seen = new Set<string>();
  const commands = ambient.rules?.frame()?.commands;
  for (const actor of ambient.list()) {
    if (actor.driverKind !== 'CIVILIAN' || actor.authority !== 'AUTO') continue;
    // A front-of-queue stop (no leader) leaves a clear path for the player to drive and exit.
    if (actor.leader !== null) continue;
    if (commands?.get(actor.vehicleId)?.holdKind === null) continue;
    seen.add(actor.vehicleId);
    if (actor.speedMps > 0.2) {
      stoppedTicks.delete(actor.vehicleId);
      continue;
    }
    if (actor.speedMps > 0.08) continue;
    const count = (stoppedTicks.get(actor.vehicleId) ?? 0) + 1;
    stoppedTicks.set(actor.vehicleId, count);
    if (count >= 30) return actor;
  }
  for (const id of [...stoppedTicks.keys()]) if (!seen.has(id)) stoppedTicks.delete(id);
  return null;
}

function finish(status: ProbeState['status'], detail: string): void {
  state.status = status;
  state.detail = detail;
  if (status === 'PASS' || status === 'PARTIAL' || status === 'FAIL') {
    state.actorCountAfter = ambient.list().length;
    state.authority =
      state.vehicleId === null ? null : (ambient.get(state.vehicleId)?.authority ?? null);
  }
  refresh();
}

function fail(detail: string): void {
  state.error = detail;
  finish('FAIL', detail);
}

const bounds = map.bounds;
function project(positionM: Readonly<{ x: number; z: number }>) {
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
  context.lineWidth = 1.5;
  for (const lane of map.lanes as RoadMap['lanes']) {
    const path = world.graph.getDirectedPath(lane.id);
    if (path === null || path.points.length < 2) continue;
    context.beginPath();
    for (let index = 0; index < path.points.length; index += 1) {
      const point = project(path.points[index]!);
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    }
    context.stroke();
  }
  for (const actor of ambient.list()) {
    const point = project(actor.positionM);
    context.beginPath();
    context.arc(point.x, point.y, actor.vehicleId === state.vehicleId ? 8 : 4, 0, Math.PI * 2);
    context.fillStyle =
      actor.vehicleId === state.vehicleId
        ? '#ffd166'
        : actor.authority === 'AUTO'
          ? actor.driverKind === 'TAXI'
            ? '#7fd1e6'
            : '#9ee6c8'
          : '#ff9f80';
    context.fill();
    if (actor.vehicleId === state.vehicleId) {
      context.strokeStyle = '#fff';
      context.lineWidth = 2;
      context.stroke();
    }
  }
  context.fillStyle = '#e8f4f8';
  context.font = '16px system-ui, sans-serif';
  context.fillText(
    state.vehicleId === null
      ? 'Se caută un civil AI oprit...'
      : `Civil ${state.vehicleId} · ${state.status}`,
    20,
    32,
  );
  context.font = '13px system-ui, sans-serif';
  context.fillStyle = '#b9d7e2';
  context.fillText(state.detail, 20, 54);
}

function refresh(): void {
  phaseNode.textContent = state.status;
  phaseNode.className =
    state.status === 'PASS'
      ? 'badge green'
      : state.status === 'FAIL' || state.status === 'PARTIAL'
        ? 'badge red'
        : 'badge';
  lineNode.textContent = state.detail;
  noticeNode.style.display = state.status === 'PASS' ? 'block' : 'none';
  noticeNode.textContent =
    state.status === 'PASS'
      ? `Reluare fără teleport: ${state.exitJumpM.toFixed(3)} m, ruta ${state.routeAfter.length} benzi, ${state.resumedM.toFixed(2)} m după AUTO.`
      : '';
  reportNode.textContent = JSON.stringify(
    {
      status: state.status,
      tick: state.tick,
      vehicleId: state.vehicleId,
      routeBefore: state.routeBefore,
      routeAfter: state.routeAfter,
      destinationBefore: state.destinationBefore,
      destinationAfter: state.destinationAfter,
      frozenDeltaM: state.frozenDeltaM,
      drivenM: state.drivenM,
      ambientMoveM: state.ambientMoveM,
      exitJumpM: state.exitJumpM,
      exitDetail: state.exitDetail,
      resumedM: state.resumedM,
      actorCountBefore: state.actorCountBefore,
      actorCountAfter: state.actorCountAfter,
      authority: state.authority,
      checks: state.checks,
      trace: state.trace,
      error: state.error,
    },
    null,
    2,
  );
  (globalThis as unknown as { __civilAutonomyProbe?: ProbeState }).__civilAutonomyProbe = state;
  draw();
}

let searchTicks = 0;
function search(): void {
  if (target === null) {
    for (let index = 0; index < 180 && target === null; index += 1) {
      step();
      searchTicks += 1;
      target = findStoppedCivil();
      if (searchTicks >= 9000) break;
    }
    if (target === null) {
      if (searchTicks >= 9000) {
        fail('Niciun civil AI nu a rămas oprit 30 de tick-uri în fereastra probei.');
        return;
      }
      state.detail = `Caut un civil AI oprit (${searchTicks}/9000 tick-uri simulate).`;
      refresh();
      setTimeout(search, 0);
      return;
    }
  }
  state.vehicleId = target.vehicleId;
  state.routeBefore = target.route.path;
  state.destinationBefore = target.route.destinationLaneId;
  state.actorCountBefore = ambient.list().length;
  state.status = 'STOPPED';
  state.detail = `${target.vehicleId} oprit la ${target.speedMps.toFixed(2)} m/s pe ${target.laneId}.`;
  pushTrace(state.detail);
  refresh();
  setTimeout(takeOver, 400);
}

function takeOver(): void {
  if (target === null) return;
  const id = target.vehicleId;
  composition.requestTakeover(id, 'MANUAL');
  for (let index = 0; index < 4 && frame.playerVehicleId !== id; index += 1) step();
  if (frame.playerVehicleId !== id) {
    fail(`Preluarea a fost refuzată: ${frame.events.at(-1)?.detail ?? 'no event'}`);
    return;
  }
  if (frame.vehicles.filter((vehicle) => vehicle.vehicleId === id).length !== 1) {
    fail('Preluarea a creat un al doilea vehicul cu același ID.');
    return;
  }
  state.takeoverAccepted = true;
  state.manualSeat = ambient.get(id)?.authority === 'MANUAL';
  state.status = 'TAKEN_OVER';
  const frozen = ambient.get(id)!;
  const frozenDistance = frozen.distanceAlongRouteM;
  for (let index = 0; index < 45; index += 1) step();
  const afterFreeze = ambient.get(id)!;
  state.frozenDeltaM = Math.abs(afterFreeze.distanceAlongRouteM - frozenDistance);
  state.detail = `Preluat MANUAL; ruta suspendată, derivă ${state.frozenDeltaM.toFixed(4)} m în 45 tick-uri.`;
  pushTrace(state.detail);
  refresh();
  setTimeout(drive, 400);
}

function drive(): void {
  if (target === null) return;
  const id = target.vehicleId;
  const before = ambient.get(id)!;
  const startPosition = { ...before.positionM };
  composition.port.setAction('throttle', true);
  for (let index = 0; index < 480; index += 1) {
    const current = vehicleOf(id),
      actor = ambient.get(id);
    if (current !== null && actor !== undefined) steerToRoute(current, actor);
    step();
    const vehicle = vehicleOf(id);
    if (
      vehicle !== null &&
      Math.hypot(vehicle.positionM.x - startPosition.x, vehicle.positionM.z - startPosition.z) > 20
    )
      break;
  }
  composition.port.setAction('throttle', false);
  composition.port.setAction('steerLeft', false);
  composition.port.setAction('steerRight', false);
  const driven = ambient.get(id)!;
  state.drivenM = Math.hypot(
    driven.positionM.x - startPosition.x,
    driven.positionM.z - startPosition.z,
  );
  if (state.drivenM <= 2) {
    fail(`Jucătorul nu a mișcat civilul: ${state.drivenM.toFixed(3)} m.`);
    return;
  }
  state.status = 'DRIVEN';
  state.detail = `Condus ${state.drivenM.toFixed(2)} m; opresc pentru ieșire.`;
  pushTrace(state.detail);
  refresh();
  brake();
}

function brake(): void {
  if (target === null) return;
  const id = target.vehicleId;
  for (let index = 0; index < 180; index += 1) {
    composition.port.setAction('brake', true);
    step();
    const vehicle = vehicleOf(id);
    if (vehicle !== null && Math.abs(vehicle.speedMps) <= 0.05) break;
  }
  composition.port.setAction('brake', false);
  setTimeout(exitVehicle, 200);
}

function exitVehicle(): void {
  if (target === null) return;
  const id = target.vehicleId;
  const beforeExit = ambient.get(id)!;
  const compositionBefore = vehicleOf(id);
  const beforeExitPosition = compositionBefore
    ? { ...compositionBefore.positionM }
    : { ...beforeExit.positionM };
  state.ambientMoveM = Math.hypot(
    beforeExit.positionM.x - target.positionM.x,
    beforeExit.positionM.z - target.positionM.z,
  );
  composition.requestExit();
  for (let index = 0; index < 4 && frame.playerVehicleId !== null; index += 1) step();
  state.exitDetail =
    frame.events.filter((event) => event.kind === 'EXIT_ACCEPTED').at(-1)?.detail ?? null;
  if (frame.playerVehicleId !== null) {
    const refusal = frame.events.filter((event) => event.kind === 'EXIT_REFUSED').at(-1);
    finish(
      'PARTIAL',
      `Ieșirea a fost refuzată: ${refusal?.detail ?? frame.events.at(-1)?.detail ?? 'no event'}.`,
    );
    return;
  }
  const resumed = ambient.get(id)!;
  state.routeAfter = resumed.route.path;
  state.destinationAfter = resumed.route.destinationLaneId;
  state.exitJumpM = Math.hypot(
    resumed.positionM.x - beforeExitPosition.x,
    resumed.positionM.z - beforeExitPosition.z,
  );
  state.actorCountAfter = ambient.list().length;
  state.authority = resumed.authority;
  state.status = 'EXITED';
  state.detail = `Ieșire AUTO; salt ${state.exitJumpM.toFixed(4)} m, ruta ${state.routeAfter.length} benzi.`;
  pushTrace(state.detail);
  refresh();
  setTimeout(resumeAndCheck, 300);
}

function resumeAndCheck(): void {
  if (target === null) return;
  const id = target.vehicleId;
  const resumed = ambient.get(id)!;
  const startDistance = resumed.distanceAlongRouteM;
  const startPosition = { ...resumed.positionM };
  for (let index = 0; index < 900; index += 1) {
    step();
    const current = ambient.get(id)!;
    if (
      Math.hypot(current.positionM.x - startPosition.x, current.positionM.z - startPosition.z) >
        2 ||
      current.distanceAlongRouteM > startDistance + 2
    )
      break;
  }
  const moving = ambient.get(id)!;
  state.resumedM = Math.hypot(
    moving.positionM.x - startPosition.x,
    moving.positionM.z - startPosition.z,
  );
  const checks: ProbeCheck[] = [
    {
      name: 'civil-stopped',
      pass: state.vehicleId !== null && target !== null,
      detail: `${state.vehicleId ?? 'none'} was stopped before takeover`,
    },
    {
      name: 'manual-seat',
      pass: state.takeoverAccepted && state.manualSeat && frame.playerVehicleId === null,
      detail: 'the civil was taken over as MANUAL and the seat was released',
    },
    {
      name: 'route-suspended',
      pass: state.frozenDeltaM < 0.01,
      detail: `route progressed ${state.frozenDeltaM.toFixed(6)} m while suspended`,
    },
    {
      name: 'player-drove',
      pass: state.drivenM > 2,
      detail: `the player moved the civil ${state.drivenM.toFixed(3)} m`,
    },
    {
      name: 'exit-auto',
      pass: moving.authority === 'AUTO' && state.authority === 'AUTO',
      detail: `authority after exit is ${state.authority}`,
    },
    {
      name: 'route-preserved',
      pass: JSON.stringify(state.routeBefore) === JSON.stringify(state.routeAfter),
      detail: `route ${state.routeBefore.length} -> ${state.routeAfter.length} lanes`,
    },
    {
      name: 'destination-preserved',
      pass: state.destinationBefore === state.destinationAfter,
      detail: `${state.destinationBefore} -> ${state.destinationAfter}`,
    },
    {
      name: 'no-teleport',
      pass: state.exitJumpM < 1,
      detail: `first AUTO pose is ${state.exitJumpM.toFixed(6)} m from the driven pose`,
    },
    {
      name: 'route-resumes',
      pass: moving.distanceAlongRouteM > startDistance + 1 || state.resumedM > 1,
      detail: `resumed ${state.resumedM.toFixed(3)} m and ${(moving.distanceAlongRouteM - startDistance).toFixed(3)} m of route`,
    },
    {
      name: 'no-duplicate',
      pass:
        state.actorCountBefore === state.actorCountAfter &&
        frame.vehicles.filter((vehicle) => vehicle.vehicleId === id).length === 1,
      detail: `${state.actorCountBefore} -> ${state.actorCountAfter} actors, one frame row`,
    },
  ];
  state.checks = Object.freeze(checks);
  const failed = checks.filter((check) => !check.pass);
  if (failed.length === 0) finish('PASS', 'Preluare, condus și reluare AUTO fără teleport.');
  else
    finish(
      'PARTIAL',
      `Verificări eșuate: ${failed.map((check) => `${check.name} (${check.detail})`).join('; ')}`,
    );
}

refresh();
setTimeout(search, 0);
