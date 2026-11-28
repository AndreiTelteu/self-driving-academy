import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createAmbientTraffic,
  createCompositionWorld,
  createRecoveryRoadProvider,
  createV3Composition,
} from '../src/app/index.ts';
import { createDefaultSettings } from '../src/settings/index.ts';
import { createLiveVehiclePhysics, issueRecoveryRoad } from '../src/vehicles/index.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = join(root, 'Docs', 'Evidence', '282-live-physics');
const context = Object.freeze({
  schemaVersion: 1,
  units: 'SI',
  sessionId: 'session-282-report',
  worldEpoch: 1,
});
const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass, detail: String(detail) });
const sha = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const command = (vehicleId, source, values = {}) => ({
  vehicleId,
  source,
  throttle: 0,
  brake: 0,
  steering: 0,
  handbrake: false,
  turnSignal: 'OFF',
  ...values,
});
const registration = (vehicleId, classId, z, extra = {}) => ({
  vehicleId,
  classId,
  positionM: { x: 0, y: 0, z },
  yawRad: 0,
  speedMps: 0,
  access: 'TAXI',
  isTraffic: false,
  ...extra,
});
async function withWorld(work, options = {}) {
  const physics = await createLiveVehiclePhysics({
    context,
    initialTick: 0,
    ...options,
  });
  try {
    return await work(physics);
  } finally {
    physics.dispose();
  }
}
function summarize(samples) {
  if (samples.length === 0) return { samples: 0, mean: 0, p50: 0, p95: 0, max: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (fraction) =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))))];
  return {
    samples: sorted.length,
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p50: at(0.5),
    p95: Math.max(at(0.95), at(0.5)),
    max: sorted[sorted.length - 1],
  };
}

// 1. Sedan/compact braking and turn on the same dry surface.
const classes = {};
for (const classId of ['sedan', 'compact']) {
  classes[classId] = await withWorld((physics) => {
    physics.registerVehicle(registration('brake', classId, 0, { speedMps: 20 }));
    physics.setAuthority('brake', 'MANUAL');
    const origin = physics.readVehicle('brake').positionM;
    let tick = 0;
    while (physics.readVehicle('brake').speedMps > 0.1 && tick < 1800) {
      tick++;
      physics.step({
        tick,
        commands: [command('brake', 'PLAYER', { brake: 1 })],
        traffic: [],
        measure: true,
      });
    }
    const stopped = physics.readVehicle('brake');
    return {
      brakeDistanceM: Math.hypot(stopped.positionM.x - origin.x, stopped.positionM.z - origin.z),
      brakeTicks: tick,
    };
  });
  const turn = await withWorld((physics) => {
    physics.registerVehicle(registration('turn', classId, 0, { speedMps: 12 }));
    physics.setAuthority('turn', 'MANUAL');
    const yawBefore = physics.readVehicle('turn').yawRad;
    for (let tick = 1; tick <= 180; tick++)
      physics.step({
        tick,
        commands: [command('turn', 'PLAYER', { steering: 0.35 })],
        traffic: [],
        measure: false,
      });
    const after = physics.readVehicle('turn');
    return {
      yawChangeRad: Math.abs(after.yawRad - yawBefore),
      finalSpeedMps: after.speedMps,
    };
  });
  classes[classId] = { ...classes[classId], ...turn };
}
check(
  'compact brakes shorter than sedan',
  classes.compact.brakeDistanceM < classes.sedan.brakeDistanceM,
  `${classes.compact.brakeDistanceM.toFixed(3)} < ${classes.sedan.brakeDistanceM.toFixed(3)} m`,
);
check(
  'compact turns tighter than sedan at the same steering command',
  classes.compact.yawChangeRad > classes.sedan.yawChangeRad,
  `${classes.compact.yawChangeRad.toFixed(4)} > ${classes.sedan.yawChangeRad.toFixed(4)} rad`,
);

// 2. PLAYER/AUTONOMY parity through the same controller.
async function parityRun(source, mode) {
  return withWorld((physics) => {
    physics.registerVehicle(registration('parity', 'sedan', 0));
    physics.setAuthority('parity', mode);
    const trace = [];
    for (let tick = 1; tick <= 420; tick++) {
      const frame = physics.step({
        tick,
        commands: [
          command('parity', source, {
            throttle: tick < 120 ? 0.8 : 0,
            brake: tick >= 180 && tick < 240 ? 0.9 : 0,
            steering: tick >= 120 && tick < 180 ? 0.35 : tick >= 260 && tick < 300 ? -0.4 : 0,
          }),
        ],
        traffic: [],
        measure: false,
      });
      const vehicle = frame.vehicles[0];
      trace.push([
        vehicle.positionM.x,
        vehicle.positionM.z,
        vehicle.yawRad,
        vehicle.speedMps,
        vehicle.wheelContacts,
        ...vehicle.wheels.map((wheel) => wheel.spinRad),
      ]);
    }
    return trace;
  });
}
const playerTrace = await parityRun('PLAYER', 'MANUAL');
const autonomyTrace = await parityRun('AUTONOMY', 'AUTO');
const parityHash = sha(playerTrace);
const autonomyHash = sha(autonomyTrace);
const parityMaxDiff = Math.max(
  ...playerTrace.flatMap((row, index) =>
    row.map((value, column) => Math.abs(value - autonomyTrace[index][column])),
  ),
);
check(
  'PLAYER and AUTONOMY physics traces are exact',
  parityHash === autonomyHash && parityMaxDiff === 0,
  `${parityHash} / max diff ${parityMaxDiff}`,
);

// 3. Real contact, damage and no pass-through.
const contact = await withWorld((physics) => {
  physics.registerVehicle(registration('rear', 'sedan', 0, { speedMps: 14 }));
  physics.registerVehicle(registration('front', 'compact', 10));
  physics.setAuthority('rear', 'MANUAL');
  let tick = 0,
    incidentTick = -1;
  for (let index = 0; index < 300 && incidentTick < 0; index++) {
    tick++;
    const frame = physics.step({
      tick,
      commands: [command('rear', 'PLAYER', { throttle: 0.2 })],
      traffic: [],
      measure: true,
    });
    if (frame.collisions.incidents > 0) incidentTick = tick;
  }
  const rear = physics.readVehicle('rear');
  const front = physics.readVehicle('front');
  const history = physics.readDamageHistory();
  return {
    incidentTick,
    rear: {
      availability: rear.availability,
      positionM: rear.positionM,
      contacts: rear.wheelContacts,
    },
    front: {
      availability: front.availability,
      positionM: front.positionM,
      contacts: front.wheelContacts,
    },
    centerGapM: Math.abs(front.positionM.z - rear.positionM.z),
    incidents: history.filter((record) => record.kind === 'INCIDENT').length,
    impulseNs: history
      .filter((record) => record.kind === 'INCIDENT')
      .reduce((sum, record) => sum + (record.impulseNs ?? 0), 0),
  };
});
check(
  'contact produced at least one 028/029 incident',
  contact.incidents > 0,
  `${contact.incidents}`,
);
check(
  'both real cars are damaged',
  contact.rear.availability !== 'AVAILABLE' && contact.front.availability !== 'AVAILABLE',
  `${contact.rear.availability}/${contact.front.availability}`,
);
check(
  'real bodies did not pass through',
  contact.centerGapM > 3.7,
  `${contact.centerGapM.toFixed(3)} m center gap`,
);
check(
  'both cars retain four wheel contacts',
  contact.rear.contacts === 4 && contact.front.contacts === 4,
  `${contact.rear.contacts}/${contact.front.contacts}`,
);

// 4. Physical recovery after an incident.
const road = issueRecoveryRoad({
  mapId: '282-report-map',
  laneId: 'report-lane',
  access: 'TAXI',
  start: { x: -50, y: 0, z: 0 },
  end: { x: 50, y: 0, z: 0 },
  widthM: 7,
});
const recovery = await withWorld(
  (physics) => {
    physics.registerVehicle(
      registration('recover', 'sedan', 0, { yawRad: Math.PI / 2, speedMps: 9 }),
    );
    physics.setAuthority('recover', 'MANUAL');
    let tick = 0;
    for (; tick < 40; tick++)
      physics.step({
        tick: tick + 1,
        commands: [command('recover', 'PLAYER', { throttle: 0.4, steering: 0.25 })],
        traffic: [],
        measure: false,
      });
    const before = physics.readVehicle('recover');
    const request = physics.requestRecovery({
      vehicleId: 'recover',
      mode: 'MANUAL',
      tick,
      origin: 'R',
    });
    const outcome = physics.commitRecovery(tick);
    const after = physics.readVehicle('recover');
    return {
      request: request !== null,
      status: outcome?.status ?? null,
      before: { positionM: before.positionM, speedMps: before.speedMps },
      after: {
        positionM: after.positionM,
        speedMps: after.speedMps,
        availability: after.availability,
      },
      record: outcome?.record
        ? {
            kind: outcome.record.kind,
            status: outcome.record.status,
            learningEligible: outcome.record.learningEligible,
            laneId: outcome.record.laneId,
            completed: outcome.record.placement?.completed ?? 0,
          }
        : null,
      history: physics.readRecoveryHistory().length,
    };
  },
  { recovery: { locate: () => road } },
);
check(
  'recovery completed on the real native port',
  recovery.status === 'COMPLETED' && recovery.record?.status === 'COMPLETED',
  `${recovery.status}/${recovery.record?.status}`,
);
check(
  'recovery is a labeled excluded teleport and zeroes velocity',
  recovery.record?.kind === 'TELEPORT' &&
    recovery.record.learningEligible === false &&
    Math.abs(recovery.after.speedMps) < 0.01,
  `kind ${recovery.record?.kind}, speed ${recovery.after.speedMps}`,
);
check(
  'recovery restores 029 availability and is recorded once',
  recovery.after.availability === 'AVAILABLE' && recovery.history === 1,
  `${recovery.after.availability}/${recovery.history}`,
);

// 5. Mode/vehicle continuity on a full live composition.
const continuityWorld = createCompositionWorld();
const continuityTraffic = createAmbientTraffic({
  map: continuityWorld.map,
  graph: continuityWorld.graph,
  context,
  seed: 256,
  focus: { x: continuityWorld.spawn.x, z: continuityWorld.spawn.z },
  avoid: [
    { x: continuityWorld.spawn.x, z: continuityWorld.spawn.z },
    ...continuityWorld.vehicles.map((vehicle) => ({
      x: vehicle.positionM.x,
      z: vehicle.positionM.z,
    })),
  ],
});
const staticBoxesOf = (world) =>
  world.walkWorld.blockers.map((blocker) => {
    const bounds = blocker.polygon.bounds;
    return {
      id: blocker.id,
      centerM: {
        x: (bounds.minX + bounds.maxX) / 2,
        y: (blocker.bottomM + blocker.topM) / 2,
        z: (bounds.minZ + bounds.maxZ) / 2,
      },
      halfExtentsM: {
        x: Math.max(0.05, (bounds.maxX - bounds.minX) / 2),
        y: Math.max(0.05, (blocker.topM - blocker.bottomM) / 2),
        z: Math.max(0.05, (bounds.maxZ - bounds.minZ) / 2),
      },
    };
  });
const continuityPhysics = await createLiveVehiclePhysics({
  context,
  initialTick: 0,
  staticBoxes: staticBoxesOf(continuityWorld),
  recovery: createRecoveryRoadProvider(continuityWorld.graph),
});
const continuity = createV3Composition({
  layout: continuityWorld.layout,
  start: continuityWorld.spawn,
  control: createDefaultSettings('282-report').input.control,
  context,
  vehicles: continuityWorld.vehicles,
  traffic: continuityTraffic.traffic,
  map: continuityWorld.map,
  graph: continuityWorld.graph,
  physics: continuityPhysics,
});
let continuityTick = 0;
const continuityStep = () => continuity.step({ tick: ++continuityTick });
const continuityVehicle = (id) => continuity.frame.vehicles.find((entry) => entry.vehicleId === id);
let modeDeltaM;
let modeSpeedDelta;
let modeYawDelta;
let vehicleDeltaM;
let vehicleSpeedDelta;
let vehicleYawDelta;
try {
  continuity.requestEntry('taxi-01');
  continuityStep();
  continuity.port.setAction('throttle', true);
  for (let index = 0; index < 120; index++) continuityStep();
  continuity.port.setAction('throttle', false);
  const beforeMode = continuityVehicle('taxi-01');
  continuity.requestModeAction('M');
  continuityStep();
  const afterMode = continuityVehicle('taxi-01');
  modeDeltaM = Math.hypot(
    afterMode.positionM.x - beforeMode.positionM.x,
    afterMode.positionM.z - beforeMode.positionM.z,
  );
  modeSpeedDelta = Math.abs(afterMode.speedMps - beforeMode.speedMps);
  modeYawDelta = Math.abs(afterMode.yawRad - beforeMode.yawRad);
  check(
    'MANUAL to AUTO has no pose/speed/yaw jump',
    modeDeltaM <= beforeMode.speedMps / 60 + 0.05 && modeSpeedDelta < 0.25 && modeYawDelta < 0.01,
    `${modeDeltaM.toFixed(4)} m/${modeSpeedDelta.toFixed(4)} m/s/${modeYawDelta.toFixed(5)} rad`,
  );
  const civilBefore = continuityVehicle('civil-01');
  continuity.requestTakeover('civil-01', 'MANUAL');
  continuityStep();
  const civilAfter = continuityVehicle('civil-01');
  vehicleDeltaM = Math.hypot(
    civilAfter.positionM.x - civilBefore.positionM.x,
    civilAfter.positionM.z - civilBefore.positionM.z,
  );
  vehicleSpeedDelta = Math.abs(civilAfter.speedMps - civilBefore.speedMps);
  vehicleYawDelta = Math.abs(civilAfter.yawRad - civilBefore.yawRad);
  check(
    'vehicle takeover preserves the target pose/speed/yaw',
    vehicleDeltaM < 1e-6 && vehicleSpeedDelta < 1e-6 && vehicleYawDelta < 1e-6,
    `${vehicleDeltaM}/${vehicleSpeedDelta}/${vehicleYawDelta}`,
  );
} finally {
  continuity.dispose();
  continuityPhysics.dispose();
  continuityTraffic.dispose();
}

// 6. Paired cost on the same 58-vehicle fixture as the pre-282 baseline.
async function measureCost(withPhysics) {
  const world = createCompositionWorld();
  const traffic = createAmbientTraffic({
    map: world.map,
    graph: world.graph,
    context,
    seed: 256,
    focus: { x: world.spawn.x, z: world.spawn.z },
    avoid: [
      { x: world.spawn.x, z: world.spawn.z },
      ...world.vehicles.map((vehicle) => ({
        x: vehicle.positionM.x,
        z: vehicle.positionM.z,
      })),
    ],
  });
  const physics = withPhysics
    ? await createLiveVehiclePhysics({
        context,
        initialTick: 0,
        staticBoxes: staticBoxesOf(world),
        recovery: createRecoveryRoadProvider(world.graph),
      })
    : null;
  const composition = createV3Composition({
    layout: world.layout,
    start: world.spawn,
    control: createDefaultSettings('282-cost').input.control,
    context,
    vehicles: world.vehicles,
    traffic: traffic.traffic,
    map: world.map,
    graph: world.graph,
    ...(physics === null ? {} : { physics }),
  });
  let tick = 0;
  const step = () => composition.step({ tick: ++tick });
  try {
    composition.requestEntry('taxi-01');
    step();
    composition.port.setAction('throttle', true);
    for (let index = 0; index < 180; index++) step();
    const tickSamples = [];
    const physicsSamples = [];
    for (let index = 0; index < 600; index++) {
      if (index === 240) composition.port.setAction('steerRight', true);
      if (index === 300) composition.port.setAction('steerRight', false);
      const started = performance.now();
      step();
      tickSamples.push(performance.now() - started);
      if (physics !== null) physicsSamples.push(composition.physicsCostMs() ?? 0);
    }
    const stats = composition.physicsStats();
    return {
      tick: summarize(tickSamples),
      physics: summarize(physicsSamples),
      vehicles: composition.frame.vehicles.length,
      physicalCars: physics?.getStats().vehicles ?? 0,
      staticBuildings: physics?.getStats().staticBoxes ?? 0,
      correctionCount: stats?.corrections ?? 0,
      maxCorrectionM: stats?.maxCorrectionM ?? 0,
    };
  } finally {
    composition.dispose();
    physics?.dispose();
    traffic.dispose();
  }
}
const costBaseline = JSON.parse(
  await (await import('node:fs/promises')).readFile(join(evidence, 'baseline.json'), 'utf8'),
);
const pairs = [];
for (let repetition = 0; repetition < 3; repetition += 1)
  pairs.push({
    repetition,
    baseline: await measureCost(false),
    physics: await measureCost(true),
  });
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const tickCost = Object.freeze({
  repetitions: pairs.length,
  p50: median(pairs.map((pair) => pair.physics.tick.p50)),
  p95: median(pairs.map((pair) => pair.physics.tick.p95)),
  max: Math.max(...pairs.map((pair) => pair.physics.tick.max)),
});
const pairedBaseline = Object.freeze({
  p50: median(pairs.map((pair) => pair.baseline.tick.p50)),
  p95: median(pairs.map((pair) => pair.baseline.tick.p95)),
});
const physicsCost = Object.freeze({
  p50: median(pairs.map((pair) => pair.physics.physics.p50)),
  p95: median(pairs.map((pair) => pair.physics.physics.p95)),
  max: Math.max(...pairs.map((pair) => pair.physics.physics.max)),
});
const deltaP95Ms = tickCost.p95 - pairedBaseline.p95;
const lastPair = pairs.at(-1).physics;
check(
  'authoritative composition tick stays within the 8 ms normal-V1 fixture budget',
  tickCost.p95 <= 8,
  `${tickCost.p95.toFixed(3)} ms median p95 (paired baseline ${pairedBaseline.p95.toFixed(3)} ms, historical ${costBaseline.tickMs.p95.toFixed(3)} ms)`,
);
check(
  'live physics incremental p95 stays within 1 ms',
  deltaP95Ms <= 1,
  `${deltaP95Ms.toFixed(3)} ms over the paired baseline`,
);
check(
  'Rapier live step stays within the 3 ms desktop budget',
  physicsCost.p95 <= 3,
  `${physicsCost.p95.toFixed(3)} ms`,
);
const report = {
  version: '282-live-physics-report-v1',
  generatedAt: new Date().toISOString(),
  commit: process.env.GIT_COMMIT ?? null,
  node: process.version,
  platform: process.platform,
  hardware: (await import('node:os')).cpus()[0]?.model ?? 'unknown',
  fixture: {
    trafficVehicles: lastPair.vehicles,
    physicalCars: lastPair.physicalCars,
    staticBuildings: lastPair.staticBuildings,
    warmupTicks: 180,
    measuredTicks: 600,
    repetitions: pairs.length,
  },
  classes,
  parity: {
    source: ['PLAYER/MANUAL', 'AUTONOMY/AUTO'],
    playerHash: parityHash,
    autonomyHash,
    maxDiff: parityMaxDiff,
  },
  contact,
  recovery,
  modeChange: { modeDeltaM, modeSpeedDelta, modeYawDelta },
  vehicleSwitch: { vehicleDeltaM, vehicleSpeedDelta, vehicleYawDelta },
  costs: {
    historicalBaselineMs: costBaseline.tickMs,
    pairedBaselineMs: pairedBaseline,
    compositionTickMs: tickCost,
    physicsStepMs: physicsCost,
    deltaP95Ms,
    pairs: pairs.map((pair) => ({
      repetition: pair.repetition,
      baseline: { p50: pair.baseline.tick.p50, p95: pair.baseline.tick.p95 },
      physics: {
        tickP50: pair.physics.tick.p50,
        tickP95: pair.physics.tick.p95,
        physicsP50: pair.physics.physics.p50,
        physicsP95: pair.physics.physics.p95,
      },
    })),
    budget: {
      normalV1FixtureP95Ms: 8,
      desktopTickTargetP95Ms: 5.5,
      rapierStepP95Ms: 3,
      physicsIncrementP95Ms: 1,
    },
    desktopTickTargetMet: tickCost.p95 <= 5.5,
    correction: lastPair.maxCorrectionM,
    correctionCount: lastPair.correctionCount,
  },
  checks,
  pass: checks.every((entry) => entry.pass),
};
await mkdir(evidence, { recursive: true });
await writeFile(join(evidence, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const markdown = [
  '# 282 — live Rapier physics report',
  '',
  `Generated by \`npm run physics:live\` at ${report.generatedAt}.`,
  '',
  `**${report.pass ? 'PASS' : 'FAIL'}** — ${checks.filter((entry) => entry.pass).length}/${checks.length} checks.`,
  '',
  `Fixture: ${report.fixture.trafficVehicles} composition vehicles, ${report.fixture.physicalCars} physical cars, ${report.fixture.staticBuildings} named building colliders, ${report.fixture.warmupTicks} warmup / ${report.fixture.measuredTicks} measured ticks × ${report.fixture.repetitions} paired repetitions.`,
  '',
  '| Check | Result | Detail |',
  '| --- | --- | --- |',
  ...checks.map(
    (entry) =>
      `| ${entry.name.replaceAll('|', '\\|')} | ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.detail.replaceAll('|', '\\|')} |`,
  ),
  '',
  '## Measurements',
  '',
  `- Sedan braking from 20 m/s: ${classes.sedan.brakeDistanceM.toFixed(3)} m; compact: ${classes.compact.brakeDistanceM.toFixed(3)} m.`,
  `- Sedan yaw change at 12 m/s, 0.35 steering, 180 ticks: ${classes.sedan.yawChangeRad.toFixed(4)} rad; compact: ${classes.compact.yawChangeRad.toFixed(4)} rad.`,
  `- Contact center gap: ${contact.centerGapM.toFixed(3)} m; impulses: ${contact.impulseNs.toFixed(3)} N*s over ${contact.incidents} incident(s).`,
  `- Recovery: ${recovery.status}; ${recovery.record?.laneId ?? 'no lane'}; final speed ${recovery.after.speedMps.toFixed(6)} m/s.`,
  `- Mode boundary: ${modeDeltaM.toFixed(4)} m, ${modeSpeedDelta.toFixed(4)} m/s, ${modeYawDelta.toFixed(5)} rad.`,
  `- Vehicle switch: ${vehicleDeltaM} m, ${vehicleSpeedDelta} m/s, ${vehicleYawDelta} rad.`,
  `- Paired composition tick p50/p95: ${tickCost.p50.toFixed(3)} / ${tickCost.p95.toFixed(3)} ms (paired baseline ${pairedBaseline.p50.toFixed(3)} / ${pairedBaseline.p95.toFixed(3)} ms; historical p95 ${costBaseline.tickMs.p95.toFixed(3)} ms).`,
  `- Rapier live step p50/p95: ${physicsCost.p50.toFixed(3)} / ${physicsCost.p95.toFixed(3)} ms; incremental tick p95 ${deltaP95Ms.toFixed(3)} ms.`,
  `- Static-world correction count/max: ${report.costs.correctionCount} / ${report.costs.correction.toFixed(4)} m.`,
  `- Desktop 5.5 ms target: ${report.costs.desktopTickTargetMet ? 'met' : 'not met on this run'}; the accepted normal-V1 fixture budget is 8 ms.`,
  '',
  '## Limits',
  '',
  '- The cost fixture is Node on the high-end desktop; it is not a GPU/FPS measurement and not the full laptop gate.',
  '- 058 traffic is represented by stable kinematic proxies; its route remains the 058 owner (284 owns civil autonomy).',
  '- The 026 decor collision remains the composition static resolver; named live colliders cover buildings and vehicles.',
  '- The browser probe and its screenshots are in `browser.json` / `browser.md`; they are not part of this deterministic report.',
  '',
].join('\n');
await writeFile(join(evidence, 'report.md'), markdown);
console.log(
  `Live physics report: ${report.pass ? 'PASS' : 'FAIL'} (${checks.filter((entry) => entry.pass).length}/${checks.length})`,
);
if (!report.pass) process.exitCode = 1;
