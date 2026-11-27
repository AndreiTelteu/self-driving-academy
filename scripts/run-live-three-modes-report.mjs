import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createAmbientTraffic,
  createCompositionWorld,
  createLiveModeSegments,
  createV3Composition,
  readLiveModeHud,
} from '../src/app/index.ts';
import { createDefaultSettings } from '../src/settings/index.ts';

/**
 * PBI 271 deterministic six-transition transcript over the real V3 composition and the real 069
 * lifecycle. It writes no timeline, no random value and no wall clock; the same input produces the
 * same report bytes.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '271-live-three-modes');
const CONTEXT = Object.freeze({
  schemaVersion: 1,
  units: 'SI',
  sessionId: '271-live-three-modes-report',
  worldEpoch: 1,
});

function createFixture() {
  const world = createCompositionWorld();
  const ambient = createAmbientTraffic({
    map: world.map,
    graph: world.graph,
    context: CONTEXT,
    seed: 271,
    focus: { x: world.spawn.x, z: world.spawn.z },
    avoid: [
      { x: world.spawn.x, z: world.spawn.z },
      ...world.vehicles.map((vehicle) => ({
        x: vehicle.positionM.x,
        z: vehicle.positionM.z,
      })),
    ],
  });
  const modelRef = { current: undefined };
  const segments = createLiveModeSegments({
    context: CONTEXT,
    playerId: 'player:271',
    profileId: 'profile:271',
    baseVersionId: 'profile:271@1',
    learningEpoch: 0,
    controlPreferencesVersion: 'control-1',
    engineVersion: 'engine-271',
    mapVersion: world.map.mapId,
    learningEligible: true,
    readAuthority: () =>
      modelRef.current === undefined
        ? { tick: 0, playerVehicleId: null, mode: 'AUTO', suspended: false }
        : modelRef.current.modeAuthority(),
  });
  const model = createV3Composition({
    layout: world.layout,
    start: world.spawn,
    control: createDefaultSettings('271-report').input.control,
    context: CONTEXT,
    vehicles: world.vehicles,
    traffic: ambient.traffic,
    map: world.map,
    graph: world.graph,
  });
  modelRef.current = model;
  model.attachModeSegments(segments);
  return { world, ambient, model, segments };
}

function physicalOf(model, vehicleId) {
  const vehicle = model.frame.vehicles.find((entry) => entry.vehicleId === vehicleId);
  return {
    positionM: { ...vehicle.positionM },
    speedMps: Math.abs(vehicle.speedMps),
    yawRad: vehicle.yawRad,
  };
}

function headingDelta(before, after) {
  return Math.atan2(Math.sin(after - before), Math.cos(after - before));
}

function run(kind, vehicleId) {
  const fixture = createFixture();
  const { model, ambient, segments } = fixture;
  const rows = [];
  try {
    model.step({ tick: 1 });
    if (kind === 'TAXI') {
      model.selectVehicle(vehicleId);
      for (let tick = 2; tick <= 20; tick += 1) model.step({ tick });
    } else {
      model.selectVehicle(vehicleId);
      for (let tick = 2; tick <= 5; tick += 1) model.step({ tick });
    }
    const transition = (action) => {
      const before = physicalOf(model, vehicleId);
      const beforeMode =
        model.playerVehicleId() === vehicleId
          ? model.frame.vehicles.find((entry) => entry.vehicleId === vehicleId).controlMode
          : 'AUTO';
      const atTick = model.frame.tick + 1;
      model.requestModeAction(action);
      model.step({ tick: atTick });
      const state = segments.observe();
      const after = physicalOf(model, vehicleId);
      const expected =
        action === 'M'
          ? beforeMode === 'AUTO'
            ? 'MANUAL'
            : 'AUTO'
          : beforeMode === 'LEARNING'
            ? 'MANUAL'
            : 'LEARNING';
      const stepM = Math.hypot(
        after.positionM.x - before.positionM.x,
        after.positionM.z - before.positionM.z,
      );
      rows.push({
        kind,
        transition: `${beforeMode}->${expected}`,
        action,
        atTick,
        closed:
          state.lastClosed === null || state.lastClosed.endTick !== atTick
            ? null
            : {
                segmentId: state.lastClosed.segmentId,
                mode: state.lastClosed.mode,
                endTick: state.lastClosed.endTick,
                closeReason: state.lastClosed.closeReason,
                completeness: state.lastClosed.completeness,
              },
        opened:
          state.active === null
            ? null
            : {
                segmentId: state.active.segmentId,
                mode: state.active.mode,
                startTick: state.active.startTick,
                learningEligible: state.active.learningEligible,
                completeness: state.active.completeness,
                playerId: state.active.playerId,
                profileId: state.active.profileId,
                baseVersionId: state.active.baseVersionId,
                classId: state.active.context?.classId ?? null,
                routeLanes: state.active.context?.routeLaneIds.length ?? 0,
                positionM: state.active.context?.positionM ?? null,
              },
        playerSeats: model.frame.vehicles.filter((entry) => entry.controlMode !== 'AUTO').length,
        speedBeforeMps: before.speedMps,
        speedAfterMps: after.speedMps,
        headingDeltaRad: headingDelta(before.yawRad, after.yawRad),
        positionStepM: stepM,
        expectedPositionStepM: before.speedMps / 60,
      });
    };
    transition('M');
    model.port.setAction('throttle', true);
    for (let tick = 0; tick < 20; tick += 1) model.step({ tick: model.frame.tick + 1 });
    model.port.setAction('throttle', false);
    transition('M');
    transition('L');
    transition('L');
    transition('L');
    transition('M');
    const final = segments.observe();
    return {
      kind,
      vehicleId,
      rows,
      segments: final.segments.map((segment) => ({
        segmentId: segment.segmentId,
        mode: segment.mode,
        learningEligible: segment.learningEligible,
        startTick: segment.startTick,
        endTick: segment.endTick,
        completeness: segment.completeness,
        closeReason: segment.closeReason,
        context: segment.context,
      })),
      learning: final.learning,
      profilePublications: final.dispatch.profilePublications,
      hud: readLiveModeHud('LEARNING', true),
    };
  } finally {
    segments.dispose();
    model.dispose();
    ambient.dispose();
  }
}

const taxiId = 'taxi-01';
const taxiFixture = createFixture();
const civilId = taxiFixture.ambient
  .list()
  .find((actor) => actor.driverKind === 'CIVILIAN').vehicleId;
taxiFixture.segments.dispose();
taxiFixture.model.dispose();
taxiFixture.ambient.dispose();

const matrix = Object.freeze([run('TAXI', taxiId), run('CIVIL', civilId)]);
const failures = [];
for (const entry of matrix) {
  if (entry.rows.length !== 6) failures.push(`${entry.kind}: ${entry.rows.length} transitions`);
  for (const row of entry.rows) {
    if (row.playerSeats > 1)
      failures.push(`${entry.kind} ${row.transition}: ${row.playerSeats} seats`);
    if (Math.abs(row.speedAfterMps - row.speedBeforeMps) > 0.05)
      failures.push(
        `${entry.kind} ${row.transition}: speed jump ${row.speedAfterMps - row.speedBeforeMps}`,
      );
    if (Math.abs(row.headingDeltaRad) > 1e-6)
      failures.push(`${entry.kind} ${row.transition}: heading jump ${row.headingDeltaRad}`);
    if (
      Math.abs(row.positionStepM - row.expectedPositionStepM) >
      Math.max(1e-3, row.expectedPositionStepM * 0.02)
    )
      failures.push(`${entry.kind} ${row.transition}: position step ${row.positionStepM}`);
    if (row.closed !== null && row.opened !== null && row.closed.endTick !== row.opened.startTick)
      failures.push(`${entry.kind} ${row.transition}: boundary ticks differ`);
    if (row.opened !== null && row.opened.learningEligible !== (row.opened.mode === 'LEARNING'))
      failures.push(`${entry.kind} ${row.transition}: eligibility mismatch`);
  }
  if (entry.profilePublications !== 0)
    failures.push(`${entry.kind}: ${entry.profilePublications} profile publications`);
}
const report = Object.freeze({
  version: '271-live-three-modes-report-v1',
  matrix,
  hud: matrix[0].hud,
  checks: Object.freeze({
    transitions: matrix.reduce((total, entry) => total + entry.rows.length, 0),
    kinds: matrix.length,
    learningExposed: matrix.reduce((total, entry) => total + entry.learning.segments.length, 0),
    profilePublications: 0,
    failures: Object.freeze(failures),
    pass: failures.length === 0,
  }),
});

const md = `# 271 — transcriptul determinist al celor trei moduri live

Generat de \`npm run modes:live\`.

| Clasă | Tranziție | Tick | Închis | Motiv | Deschis | Eligibil | Scaune | Δv (m/s) | pas (m) |
| --- | --- | ---: | --- | --- | --- | --- | ---: | ---: | ---: |
${matrix
  .flatMap((entry) =>
    entry.rows.map(
      (row) =>
        `| ${entry.kind} | ${row.transition} (${row.action}) | ${row.atTick} | ${row.closed?.mode ?? '—'} | ${row.closed?.closeReason ?? '—'} | ${row.opened?.mode ?? '—'} | ${row.opened?.learningEligible ?? '—'} | ${row.playerSeats} | ${(row.speedAfterMps - row.speedBeforeMps).toFixed(6)} | ${row.positionStepM.toFixed(6)} |`,
    ),
  )
  .join('\n')}

- Tranziții: ${report.checks.transitions}
- Segmente LEARNING expuse pentru 272: ${report.checks.learningExposed}
- Publicări de profil: ${report.checks.profilePublications}
- HUD LEARNING: „${report.hud.label}” (${report.hud.symbol})
- Eșecuri: ${failures.length === 0 ? 'niciunul' : failures.join('; ')}
- Limitare: AUTO revine din poziția/viteza fizică curentă; reproiectarea pe graful de benzi începe în tickul următor, iar reintrarea completă rămâne 054/282.
`;

await mkdir(directory, { recursive: true });
await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
await writeFile(join(directory, 'report.md'), md);
if (!report.checks.pass) {
  console.error(`271 live three modes report FAILED: ${failures.join('; ')}`);
  process.exit(1);
}
console.log(
  `271 live three modes report: ${report.checks.transitions} transitions, ${report.checks.learningExposed} learning segments, 0 profile publications`,
);
