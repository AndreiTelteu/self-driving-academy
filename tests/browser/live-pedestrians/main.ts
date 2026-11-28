import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { createCompositionWorld } from '../../../src/app/composition-world';
import {
  createLivePedestrianHazards,
  type LivePedestrianHazards,
} from '../../../src/app/live-pedestrian-hazards';
import { createLiveVehiclePhysics, type LiveVehicleCommand } from '../../../src/vehicles';
import type { LiveVehiclePhysics } from '../../../src/vehicles';
import { HAZARD_LANE_ID, hazardLane, hazardObstacle, lanePose } from '../../world/hazards-fixture';
import { lanePose as pedestrianLanePose, pedestrianTarget } from '../../world/pedestrians-fixture';

/**
 * PBI 286 browser fixture. It runs the real 164 population, the real 165 hazards and the real 282
 * Rapier world, but no second game loop: `advance(n)` performs exactly n fixed steps. The evidence
 * is the real physical speed, the real crossing phase and the real obstacle outcome.
 */
const canvas = document.querySelector<HTMLCanvasElement>('#stage');
const hud = document.querySelector<HTMLDivElement>('#hud');
if (!canvas || !hud) throw new Error('Missing probe elements');

const engine3d = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
const scene = new Scene(engine3d);
scene.clearColor = new Color3(0.04, 0.055, 0.07).toColor4();
const camera = new FreeCamera('probe-camera', new Vector3(0, 12, 0), scene);
camera.minZ = 0.1;
camera.maxZ = 800;
scene.activeCamera = camera;
const light = new HemisphericLight('probe-light', new Vector3(0.3, 1, 0.2), scene);
light.intensity = 1;
light.groundColor = new Color3(0.18, 0.2, 0.22);
const ground = CreateGround('probe-ground', { width: 260, height: 260 }, scene);
ground.position.set(20, -0.03, 120);
const roadMaterial = new StandardMaterial('road', scene);
roadMaterial.diffuseColor = new Color3(0.16, 0.17, 0.18);
ground.material = roadMaterial;

const pedestrianMaterial = new StandardMaterial('pedestrian', scene);
pedestrianMaterial.diffuseColor = new Color3(0.95, 0.62, 0.2);
pedestrianMaterial.emissiveColor = new Color3(0.25, 0.12, 0.02);
const pedestrianWaitingMaterial = new StandardMaterial('pedestrian-waiting', scene);
pedestrianWaitingMaterial.diffuseColor = new Color3(0.95, 0.85, 0.35);
const pedestrianCrossedMaterial = new StandardMaterial('pedestrian-crossed', scene);
pedestrianCrossedMaterial.diffuseColor = new Color3(0.3, 0.8, 0.45);
const carMaterial = new StandardMaterial('car', scene);
carMaterial.diffuseColor = new Color3(0.2, 0.55, 0.9);
carMaterial.emissiveColor = new Color3(0.04, 0.12, 0.22);
const hazardMaterial = new StandardMaterial('hazard', scene);
hazardMaterial.diffuseColor = new Color3(0.9, 0.2, 0.18);
hazardMaterial.emissiveColor = new Color3(0.3, 0.04, 0.03);
const walkStrip = CreateBox('crosswalk', { width: 3.2, height: 0.02, depth: 12 }, scene);
walkStrip.position.set(7.4, 0.02, 180);
const walkMaterial = new StandardMaterial('crosswalk-paint', scene);
walkMaterial.diffuseColor = new Color3(0.85, 0.85, 0.8);
walkStrip.material = walkMaterial;

const world = createCompositionWorld();
const context = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: '286-browser-probe',
  worldEpoch: 1,
});

type ScenarioKind = 'PEDESTRIAN' | 'OBSTACLE';

interface Scenario {
  readonly kind: ScenarioKind;
  readonly live: LivePedestrianHazards;
  readonly physics: LiveVehiclePhysics;
  readonly vehicleId: string;
  readonly laneId: string;
  tick: number;
  last: ReturnType<LiveVehiclePhysics['readVehicle']>;
  speedMps: number;
  brake: number;
  steering: number;
  crossingTick: number | null;
  yieldTick: number | null;
  yieldOutcome: string | null;
  obstacleOutcome: string | null;
  obstacleContact: number | null;
  minimumDistanceM: number | null;
}

let active: Scenario | null = null;
const pedestrianMeshes = new Map<string, Mesh>();
const hazardMeshes = new Map<string, Mesh>();
const carMesh = CreateBox('probe-car', { width: 1.7, height: 0.6, depth: 4 }, scene);
carMesh.material = carMaterial;
carMesh.isVisible = false;

function clearView(): void {
  for (const mesh of pedestrianMeshes.values()) mesh.dispose();
  for (const mesh of hazardMeshes.values()) mesh.dispose();
  pedestrianMeshes.clear();
  hazardMeshes.clear();
}

function disposeScenario(): void {
  clearView();
  active?.live.dispose();
  active?.physics.dispose();
  active = null;
  carMesh.isVisible = false;
}

async function start(kind: ScenarioKind): Promise<boolean> {
  disposeScenario();
  const physics = await createLiveVehiclePhysics({ context, initialTick: 0 });
  if (kind === 'PEDESTRIAN') {
    const live = createLivePedestrianHazards({
      context,
      map: world.map,
      graph: world.graph,
      seed: 286,
      physics,
      maxPedestrians: 96,
    });
    const target = pedestrianTarget(live.getLinks());
    const pose = pedestrianLanePose(target.graph, target.laneId, target.longitudinalM - 35);
    physics.registerVehicle({
      vehicleId: 'yield-car',
      classId: 'sedan',
      positionM: pose.positionM,
      yawRad: Math.PI / 2 - pose.headingRad,
      speedMps: 5,
      access: 'CIVIL',
      isTraffic: false,
    });
    active = {
      kind,
      live,
      physics,
      vehicleId: 'yield-car',
      laneId: target.laneId,
      tick: 0,
      last: physics.readVehicle('yield-car'),
      speedMps: 5,
      brake: 0,
      steering: 0,
      crossingTick: null,
      yieldTick: null,
      yieldOutcome: null,
      obstacleOutcome: null,
      obstacleContact: null,
      minimumDistanceM: null,
    };
  } else {
    const live = createLivePedestrianHazards({
      context,
      map: world.map,
      graph: world.graph,
      seed: 286,
      physics,
      maxPedestrians: 4,
      obstacles: [hazardObstacle({ distanceM: 100, type: 'BARRIER' })],
    });
    const lane = hazardLane();
    const pose = lanePose(lane.graph, HAZARD_LANE_ID, 60);
    physics.registerVehicle({
      vehicleId: 'obstacle-car',
      classId: 'sedan',
      positionM: pose.positionM,
      yawRad: Math.PI / 2 - pose.headingRad,
      speedMps: 6,
      access: 'CIVIL',
      isTraffic: false,
    });
    active = {
      kind,
      live,
      physics,
      vehicleId: 'obstacle-car',
      laneId: HAZARD_LANE_ID,
      tick: 0,
      last: physics.readVehicle('obstacle-car'),
      speedMps: 6,
      brake: 0,
      steering: 0,
      crossingTick: null,
      yieldTick: null,
      yieldOutcome: null,
      obstacleOutcome: null,
      obstacleContact: null,
      minimumDistanceM: null,
    };
  }
  carMesh.isVisible = true;
  syncView();
  return true;
}

function stepOnce(): void {
  const scenario = active;
  if (scenario === null || scenario.last === null) return;
  const base: LiveVehicleCommand = {
    vehicleId: scenario.vehicleId,
    source: 'AUTONOMY',
    throttle:
      scenario.kind === 'PEDESTRIAN'
        ? scenario.speedMps > 6.5
          ? 0
          : 0.35
        : scenario.speedMps > 5.5
          ? 0
          : 0.3,
    brake: 0,
    steering: 0,
    handbrake: false,
    turnSignal: 'OFF',
  };
  const command = scenario.live.adjustCommand(scenario.vehicleId, base, {
    tick: scenario.tick + 1,
    speedMps: Math.abs(scenario.last.speedMps),
    positionM: scenario.last.positionM,
    yawRad: scenario.last.yawRad,
  });
  const frame = scenario.physics.step({
    tick: scenario.tick + 1,
    commands: [command],
    traffic: [],
    measure: true,
  });
  const last = scenario.physics.readVehicle(scenario.vehicleId);
  if (last === null) return;
  scenario.tick += 1;
  scenario.last = last;
  scenario.speedMps = Math.abs(last.speedMps);
  scenario.brake = command.brake;
  scenario.steering = command.steering;
  scenario.live.observe({
    tick: scenario.tick,
    vehicles: [
      {
        vehicleId: scenario.vehicleId,
        driverKind: 'CIVILIAN',
        classId: 'sedan',
        controlMode: 'AUTO',
        positionM: last.positionM,
        yawRad: last.yawRad,
        speedMps: scenario.speedMps,
        speedLimitMps: 8,
        laneId: scenario.laneId,
        blocked: false,
        maneuverState: 'IDLE',
      },
    ],
    commands: [command],
    incidents: frame.collisions.incidents > 0 ? scenario.physics.readIncidents() : [],
    vehiclesComplete: true,
  });
  if (scenario.kind === 'PEDESTRIAN') {
    const crossing = scenario.live
      .getPedestrians()
      .find(
        (pedestrian) =>
          pedestrian.state === 'CROSSING' &&
          pedestrian.positionM.x > 0 &&
          pedestrian.crosswalkId === 'cw:0-1:E',
      );
    if (scenario.crossingTick === null && crossing !== undefined)
      scenario.crossingTick = scenario.tick;
    const stop = scenario.live.getStops().find((entry) => entry.duringCrossing);
    if (scenario.yieldTick === null && stop !== undefined) {
      scenario.yieldTick = stop.tick;
      scenario.yieldOutcome =
        scenario.live.getConflicts().find((entry) => entry.stopTick === stop.tick)?.outcome ?? null;
    }
  } else {
    const encounter = scenario.live.getHazardEncounters()[0];
    if (encounter !== undefined) {
      scenario.obstacleOutcome = encounter.outcome;
      scenario.obstacleContact = encounter.contactTick;
      scenario.minimumDistanceM = encounter.minimumDistanceM;
    }
  }
}

function syncView(): void {
  const scenario = active;
  if (scenario === null || scenario.last === null) return;
  carMesh.position.set(
    scenario.last.positionM.x,
    scenario.last.positionM.y + 0.4,
    scenario.last.positionM.z,
  );
  carMesh.rotation.y = -scenario.last.yawRad;
  const visual = scenario.live.visual();
  for (const pedestrian of visual.pedestrians) {
    let mesh = pedestrianMeshes.get(pedestrian.pedestrianId);
    if (mesh === undefined) {
      mesh = CreateBox(`pedestrian-${pedestrian.pedestrianId}`, { size: 0.42 }, scene);
      mesh.scaling.set(0.8, 4.1, 0.8);
      pedestrianMeshes.set(pedestrian.pedestrianId, mesh);
    }
    mesh.position.set(
      pedestrian.positionM.x,
      pedestrian.positionM.y + 0.86,
      pedestrian.positionM.z,
    );
    mesh.material =
      pedestrian.state === 'CROSSING'
        ? pedestrianMaterial
        : pedestrian.state === 'WAITING'
          ? pedestrianWaitingMaterial
          : pedestrianCrossedMaterial;
    mesh.isVisible = pedestrian.state !== 'WITHDRAWN';
  }
  for (const hazard of visual.hazards) {
    let mesh = hazardMeshes.get(hazard.obstacleId);
    if (mesh === undefined) {
      mesh = CreateBox(`hazard-${hazard.obstacleId}`, { size: 1 }, scene);
      mesh.material = hazardMaterial;
      hazardMeshes.set(hazard.obstacleId, mesh);
    }
    mesh.position.set(hazard.positionM.x, hazard.positionM.y, hazard.positionM.z);
    mesh.scaling.set(hazard.halfSizeM.x * 2, hazard.halfSizeM.y * 2, hazard.halfSizeM.z * 2);
    mesh.isVisible = hazard.active;
  }
  const forward = { x: Math.sin(scenario.last.yawRad), z: Math.cos(scenario.last.yawRad) };
  camera.position.set(
    scenario.last.positionM.x - forward.x * 12 - 4,
    scenario.last.positionM.y + 7,
    scenario.last.positionM.z - forward.z * 12,
  );
  camera.setTarget(
    new Vector3(
      scenario.last.positionM.x + forward.x * 12,
      scenario.last.positionM.y + 0.8,
      scenario.last.positionM.z + forward.z * 12,
    ),
  );
  const stop = scenario.live.getStops().find((entry) => entry.duringCrossing);
  hud!.textContent = [
    `PBI 286 · ${scenario.kind}`,
    `tick ${scenario.tick} · speed ${scenario.speedMps.toFixed(2)} m/s`,
    `command brake ${scenario.brake.toFixed(2)} · steering ${scenario.steering.toFixed(2)}`,
    scenario.kind === 'PEDESTRIAN'
      ? `crossing since ${scenario.crossingTick ?? '—'} · yield ${scenario.yieldOutcome ?? '—'} at ${scenario.yieldTick ?? '—'}`
      : `obstacle ${scenario.obstacleOutcome ?? '—'} · clearance ${scenario.minimumDistanceM?.toFixed(2) ?? '—'} m`,
    `physical hazards ${scenario.live.getStats().physicalHazards} · incidents ${scenario.physics.readIncidents().length}`,
    stop === undefined
      ? 'no pedestrian stop yet'
      : `stop ${stop.tick} during crossing at ${stop.distanceM.toFixed(2)} m`,
  ].join('\n');
}

function advance(steps: number): number {
  let completed = 0;
  for (let index = 0; index < steps; index += 1) {
    stepOnce();
    if (active === null) break;
    completed += 1;
    if (active.kind === 'PEDESTRIAN' && active.yieldTick !== null) break;
    if (
      active.kind === 'OBSTACLE' &&
      active.obstacleOutcome !== null &&
      active.obstacleOutcome !== 'PENDING'
    )
      break;
  }
  syncView();
  return completed;
}

const read = () => {
  const scenario = active;
  if (scenario === null) return null;
  const inspection = scenario.live.getPedestrianInspection();
  return {
    kind: scenario.kind,
    tick: scenario.tick,
    speedMps: scenario.speedMps,
    brake: scenario.brake,
    steering: scenario.steering,
    crossingTick: scenario.crossingTick,
    yieldTick: scenario.yieldTick,
    yieldOutcome: scenario.yieldOutcome,
    obstacleOutcome: scenario.obstacleOutcome,
    obstacleContact: scenario.obstacleContact,
    minimumDistanceM: scenario.minimumDistanceM,
    physicalHazards: scenario.live.getStats().physicalHazards,
    physicsObstacles: scenario.physics.getStats().obstacles,
    incidents: scenario.physics.readIncidents().length,
    crossings: inspection.counts,
    stops: scenario.live.getStops().filter((entry) => entry.duringCrossing).length,
    pedestrians: scenario.live
      .getPedestrians()
      .filter((pedestrian) => pedestrian.state === 'WAITING' || pedestrian.state === 'CROSSING')
      .length,
    hazardReactions: scenario.live.getHazardReactions().length,
    encounter: scenario.live.getHazardEncounters()[0] ?? null,
    meshes: {
      pedestrians: pedestrianMeshes.size,
      hazards: hazardMeshes.size,
      carVisible: carMesh.isVisible,
    },
    hud: hud?.textContent ?? '',
  };
};

engine3d.runRenderLoop(() => {
  syncView();
  scene.render();
});

Object.defineProperty(globalThis, '__livePedestriansProbe', {
  value: Object.freeze({
    ready: true,
    version: '286-live-pedestrians-browser-v1',
    start,
    advance,
    read,
    dispose: () => {
      disposeScenario();
      engine3d.dispose();
    },
  }),
});
