import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '280-first-person-camera'),
  defaultOutput = join(directory, 'report.json'),
  reportMarkdown = join(directory, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  return sorted[
    Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))))
  ];
}

function summary(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  const mean = sorted.reduce((total, value) => total + value, 0) / sorted.length;
  return {
    samples: sorted.length,
    meanMs: mean,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: Math.max(percentile(sorted, 0.95), percentile(sorted, 0.5)),
    maxMs: sorted.at(-1) ?? 0,
  };
}

async function load() {
  const app = await import('../src/app/index.ts');
  const settings = await import('../src/settings/index.ts');
  return { app, settings };
}

const { app, settings } = await load();

const CONTEXT = Object.freeze({
  schemaVersion: 1,
  units: 'SI',
  sessionId: '280-first-person-camera-report',
  worldEpoch: 1,
});
const CONTROL = settings.createDefaultSettings('280-report').input.control;
const DEG = Math.PI / 180;

function makeFixture({ cameraMode = 'CHASE', withSegments = false } = {}) {
  const world = app.createCompositionWorld();
  const modelRef = { current: undefined };
  const segments = withSegments
    ? app.createLiveModeSegments({
        context: CONTEXT,
        playerId: 'player:280',
        profileId: 'profile:280',
        baseVersionId: 'profile:280@1',
        learningEpoch: 0,
        controlPreferencesVersion: 'control-1',
        engineVersion: 'engine-280',
        mapVersion: world.map.mapId,
        learningEligible: true,
        readAuthority: () => {
          if (modelRef.current === undefined)
            return { tick: 0, playerVehicleId: null, mode: 'AUTO', suspended: false };
          return modelRef.current.modeAuthority();
        },
      })
    : null;
  const model = app.createV3Composition({
    layout: world.layout,
    start: world.spawn,
    control: CONTROL,
    cameraMode,
    context: CONTEXT,
    vehicles: world.vehicles,
    map: world.map,
    graph: world.graph,
  });
  modelRef.current = model;
  if (segments !== null) model.attachModeSegments(segments);
  model.step({ tick: 1 });
  model.requestTakeover('taxi-01', 'MANUAL');
  model.step({ tick: 2 });
  model.step({ tick: 3 });
  return { world, model, segments, control: { ...CONTROL } };
}

function dispose(fixture) {
  fixture.segments?.dispose();
  fixture.model.dispose();
}

function vehicleOf(fixture, vehicleId) {
  return fixture.model.frame.vehicles.find((vehicle) => vehicle.vehicleId === vehicleId);
}

function rotatedLocal(point, yawRad) {
  const cos = Math.cos(yawRad),
    sin = Math.sin(yawRad);
  return {
    x: point.x * cos + point.z * sin,
    y: point.y,
    z: -point.x * sin + point.z * cos,
  };
}

function physical(fixture) {
  const vehicle = vehicleOf(fixture, 'taxi-01');
  return {
    authority: fixture.model.frame.authority,
    selectedVehicleId: fixture.model.frame.selectedVehicleId,
    playerVehicleId: fixture.model.frame.playerVehicleId,
    positionM: { ...vehicle.positionM },
    yawRad: vehicle.yawRad,
    speedMps: vehicle.speedMps,
    controlMode: vehicle.controlMode,
    modeAuthority: fixture.model.modeAuthority(),
    camera: fixture.model.frame.camera,
  };
}

function samePhysical(left, right) {
  return (
    JSON.stringify(left.authority) === JSON.stringify(right.authority) &&
    JSON.stringify(left.positionM) === JSON.stringify(right.positionM) &&
    left.yawRad === right.yawRad &&
    left.speedMps === right.speedMps &&
    left.controlMode === right.controlMode &&
    left.playerVehicleId === right.playerVehicleId &&
    left.selectedVehicleId === right.selectedVehicleId &&
    JSON.stringify(left.modeAuthority) === JSON.stringify(right.modeAuthority)
  );
}

function anchorError(fixture, vehicleId, classId) {
  const vehicle = vehicleOf(fixture, vehicleId);
  const eye = rotatedLocal(app.vehicleDriverEyeM(classId), vehicle.yawRad);
  const camera = fixture.model.frame.camera;
  return {
    vehicleId,
    classId,
    expectedM: {
      x: vehicle.positionM.x + eye.x,
      y: vehicle.positionM.y + eye.y,
      z: vehicle.positionM.z + eye.z,
    },
    actualM: { ...camera.positionM },
    errorM: Math.hypot(
      camera.positionM.x - (vehicle.positionM.x + eye.x),
      camera.positionM.y - (vehicle.positionM.y + eye.y),
      camera.positionM.z - (vehicle.positionM.z + eye.z),
    ),
    lookDotForward:
      camera.lookAtM.x * Math.sin(vehicle.yawRad) +
      camera.lookAtM.z * Math.cos(vehicle.yawRad) -
      (camera.positionM.x * Math.sin(vehicle.yawRad) +
        camera.positionM.z * Math.cos(vehicle.yawRad)),
  };
}

const scenarios = [];

// 1. C from CHASE to FIRST_PERSON and back, with the 069 boundary attached.
{
  const fixture = makeFixture({ cameraMode: 'CHASE', withSegments: true });
  try {
    const before = physical(fixture);
    const activeBefore = fixture.segments.observe().active;
    const toFirst = fixture.model.toggleCameraMode();
    const immediate = physical(fixture);
    const noWrites = samePhysical(before, immediate);
    const segmentUntouched =
      JSON.stringify(activeBefore) === JSON.stringify(fixture.segments.observe().active);
    const first = fixture.model.step({ tick: fixture.model.frame.tick + 1 });
    const firstState = physical(fixture);
    const activeFirst = fixture.segments.observe().active;
    const sameSegment =
      activeFirst?.segmentId === activeBefore?.segmentId &&
      activeFirst?.startTick === activeBefore?.startTick;
    const fov = first.camera.fovRadians;
    const toChase = fixture.model.toggleCameraMode();
    const chase = fixture.model.step({ tick: fixture.model.frame.tick + 1 });
    const chaseState = physical(fixture);
    scenarios.push({
      id: 'switch-and-back',
      label: 'C: CHASE → FIRST_PERSON → CHASE',
      pass:
        toFirst === 'FIRST_PERSON' &&
        toChase === 'CHASE' &&
        noWrites &&
        segmentUntouched &&
        first.camera.mode === 'FIRST_PERSON' &&
        first.camera.distanceM === 0 &&
        first.camera.entityId === 'taxi-01' &&
        sameSegment &&
        firstState.authority.consumer === 'VEHICLE' &&
        firstState.speedMps === 0 &&
        Math.abs(fov - 60 * DEG) < 1e-9 &&
        chase.camera.mode === 'CHASE' &&
        chase.camera.entityId === 'taxi-01' &&
        chaseState.authority.consumer === 'VEHICLE',
      firstPerson: {
        mode: first.camera.mode,
        positionM: first.camera.positionM,
        lookAtM: first.camera.lookAtM,
        distanceM: first.camera.distanceM,
        fovDegrees: fov / DEG,
      },
      chase: {
        mode: chase.camera.mode,
        positionM: chase.camera.positionM,
        distanceM: chase.camera.distanceM,
      },
      authority: before.authority,
      speedMps: firstState.speedMps,
      positionM: firstState.positionM,
      segment: activeBefore,
      untouchedByToggle: noWrites,
      segmentUnchangedByToggle: segmentUntouched,
      segmentUnchangedOnNextTick: sameSegment,
    });
  } finally {
    dispose(fixture);
  }
}

// 2. The saved FOV is the field of view of the driver camera.
{
  const rows = [];
  let pass = true;
  for (const fov of [60, 75, 100]) {
    const fixture = makeFixture({ cameraMode: 'FIRST_PERSON' });
    try {
      fixture.model.setControlPreferences({
        ...CONTROL,
        version: CONTROL.version + 1,
        fov,
      });
      const frame = fixture.model.step({ tick: fixture.model.frame.tick + 1 });
      const actual = frame.camera.fovRadians / DEG;
      rows.push({ settingDegrees: fov, measuredDegrees: actual, mode: frame.camera.mode });
      if (frame.camera.mode !== 'FIRST_PERSON' || Math.abs(actual - fov) > 1e-9) pass = false;
    } finally {
      dispose(fixture);
    }
  }
  scenarios.push({
    id: 'fov',
    label: 'ControlPreferences.fov → first-person FOV',
    pass,
    rows,
    note: 'At rest; the existing 017 speed extension is not part of the saved base FOV.',
  });
}

// 3. Exit, re-enter, switch vehicle; the same 069 boundary closes and reopens.
{
  const fixture = makeFixture({ cameraMode: 'FIRST_PERSON', withSegments: true });
  try {
    const first = physical(fixture);
    const openBefore = fixture.segments.observe().active;
    fixture.model.requestExit();
    const walking = fixture.model.step({ tick: fixture.model.frame.tick + 1 });
    const exitRead = fixture.segments.observe();
    const walked = {
      authority: walking.authority.consumer,
      mode: walking.camera.mode,
      cameraEntityId: walking.camera.entityId,
      characterEntityId: walking.character.entityId,
      selectedVehicleId: walking.selectedVehicleId,
      activeSegment: exitRead.active,
      closedSegment: exitRead.lastClosed,
    };
    fixture.model.requestEntry('taxi-01');
    const reentered = fixture.model.step({ tick: walking.tick + 1 });
    const entryRead = fixture.segments.observe();
    const taxiEntry = {
      authority: reentered.authority.consumer,
      mode: reentered.camera.mode,
      cameraEntityId: reentered.camera.entityId,
      activeSegment: entryRead.active,
    };
    fixture.model.requestTakeover('civil-01', 'MANUAL');
    const switched = fixture.model.step({ tick: reentered.tick + 1 });
    const switchRead = fixture.segments.observe();
    const civil = anchorError(fixture, 'civil-01', 'compact');
    scenarios.push({
      id: 'exit-reenter-switch',
      label: 'exit → walk → re-enter → switch taxi/civil',
      pass:
        first.camera.mode === 'FIRST_PERSON' &&
        walked.authority === 'CHARACTER' &&
        walked.mode === 'CHASE' &&
        walked.cameraEntityId === walked.characterEntityId &&
        walked.selectedVehicleId === null &&
        walked.activeSegment === null &&
        walked.closedSegment?.closeReason === 'RETURN_TO_AUTO' &&
        walked.closedSegment?.endTick === walking.tick &&
        taxiEntry.authority === 'VEHICLE' &&
        taxiEntry.mode === 'FIRST_PERSON' &&
        taxiEntry.cameraEntityId === 'taxi-01' &&
        taxiEntry.activeSegment?.mode === 'MANUAL' &&
        taxiEntry.activeSegment?.segmentId !== openBefore?.segmentId &&
        switched.camera.mode === 'FIRST_PERSON' &&
        switched.camera.entityId === 'civil-01' &&
        switched.playerVehicleId === 'civil-01' &&
        switchRead.lastClosed?.closeReason === 'VEHICLE_SWITCH' &&
        civil.errorM < 1e-9,
      walked,
      taxiEntry,
      switched: {
        authority: switched.authority,
        playerVehicleId: switched.playerVehicleId,
        camera: {
          entityId: switched.camera.entityId,
          mode: switched.camera.mode,
          positionM: switched.camera.positionM,
        },
        activeSegment: switchRead.active,
        closedSegment: switchRead.lastClosed,
        anchor: civil,
      },
    });
  } finally {
    dispose(fixture);
  }
}

// 4. Camera anchor inside the real cabin, both classes.
{
  const fixture = makeFixture({ cameraMode: 'FIRST_PERSON' });
  try {
    const taxi = anchorError(fixture, 'taxi-01', 'sedan');
    scenarios.push({
      id: 'anchor-taxi',
      label: 'sedan driver anchor',
      pass: taxi.errorM < 1e-9 && taxi.lookDotForward > 0.999999,
      anchor: taxi,
    });
  } finally {
    dispose(fixture);
  }
  const civilFixture = makeFixture({ cameraMode: 'FIRST_PERSON' });
  try {
    civilFixture.model.requestTakeover('civil-01', 'MANUAL');
    civilFixture.model.step({ tick: civilFixture.model.frame.tick + 1 });
    const civil = anchorError(civilFixture, 'civil-01', 'compact');
    scenarios.push({
      id: 'anchor-civil',
      label: 'compact driver anchor',
      pass: civil.errorM < 1e-9 && civil.lookDotForward > 0.999999,
      anchor: civil,
    });
  } finally {
    dispose(civilFixture);
  }
}

// 5. Cost: the same composition with the camera preference off vs. on.
const COST_WARMUP = 120;
const COST_MEASURE = 600;
const COST_REPEATS = 3;
const costRuns = [];
for (let repeat = 0; repeat < COST_REPEATS; repeat += 1) {
  for (const mode of ['CHASE', 'FIRST_PERSON']) {
    const fixture = makeFixture({ cameraMode: mode });
    try {
      for (let index = 0; index < COST_WARMUP; index += 1)
        fixture.model.step({ tick: fixture.model.frame.tick + 1 });
      const samples = [];
      for (let index = 0; index < COST_MEASURE; index += 1) {
        const started = process.hrtime.bigint();
        fixture.model.step({ tick: fixture.model.frame.tick + 1 });
        samples.push(Number(process.hrtime.bigint() - started) / 1e6);
      }
      costRuns.push({ mode, repeat, ...summary(samples) });
    } finally {
      dispose(fixture);
    }
  }
}
const median = (values) =>
  [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];
const cost = {
  method: `Node ${process.version}, one V3 composition with one driven taxi, no ambient traffic; ${COST_WARMUP} warmup + ${COST_MEASURE} measured fixed ticks × ${COST_REPEATS} alternating repetitions.`,
  scope: 'Local tick CPU only; not a frame/FPS/GPU measurement and not the 203/287 hardware gate.',
  chase: {
    p50MsMedian: median(costRuns.filter((run) => run.mode === 'CHASE').map((run) => run.p50Ms)),
    p95MsMedian: median(costRuns.filter((run) => run.mode === 'CHASE').map((run) => run.p95Ms)),
    meanMsMedian: median(costRuns.filter((run) => run.mode === 'CHASE').map((run) => run.meanMs)),
  },
  firstPerson: {
    p50MsMedian: median(
      costRuns.filter((run) => run.mode === 'FIRST_PERSON').map((run) => run.p50Ms),
    ),
    p95MsMedian: median(
      costRuns.filter((run) => run.mode === 'FIRST_PERSON').map((run) => run.p95Ms),
    ),
    meanMsMedian: median(
      costRuns.filter((run) => run.mode === 'FIRST_PERSON').map((run) => run.meanMs),
    ),
  },
  incrementalP95Ms:
    median(costRuns.filter((run) => run.mode === 'FIRST_PERSON').map((run) => run.p95Ms)) -
    median(costRuns.filter((run) => run.mode === 'CHASE').map((run) => run.p95Ms)),
  budgetReferenceMs: 18.5,
  runs: costRuns,
};

const summaryValue = {
  scenarios: scenarios.length,
  passed: scenarios.filter((scenario) => scenario.pass).length,
  allPassed: scenarios.every((scenario) => scenario.pass),
};
function deterministicProbe() {
  const fixture = makeFixture({ cameraMode: 'FIRST_PERSON' });
  try {
    const toFirst = fixture.model.setCameraMode('FIRST_PERSON');
    const first = fixture.model.step({ tick: fixture.model.frame.tick + 1 });
    const second = fixture.model.step({ tick: first.tick + 1 });
    const toChase = fixture.model.toggleCameraMode();
    const third = fixture.model.step({ tick: second.tick + 1 });
    return JSON.stringify({
      toFirst,
      toChase,
      cameras: [first.camera, second.camera, third.camera],
      authority: [first.authority, second.authority, third.authority],
      modeAuthority: fixture.model.modeAuthority(),
    });
  } finally {
    dispose(fixture);
  }
}
const deterministicFirst = deterministicProbe();
const deterministicSecond = deterministicProbe();
const deterministic = deterministicFirst === deterministicSecond;
const transcript = {
  scenarios,
  anchor: {
    sedan: app.vehicleDriverEyeM('sedan'),
    compact: app.vehicleDriverEyeM('compact'),
  },
  cost: {
    chase: cost.chase,
    firstPerson: cost.firstPerson,
    incrementalP95Ms: cost.incrementalP95Ms,
  },
  deterministicDigest: createHash('sha256').update(deterministicFirst).digest('hex'),
};
const digest = createHash('sha256').update(JSON.stringify(transcript)).digest('hex');

const report = {
  version: '280-first-person-camera-report-v1',
  generatedAt: new Date().toISOString(),
  generatedBy: 'npm run camera:first-person',
  contract: '280-first-person-camera-v1',
  settings: {
    defaultCameraMode: 'CHASE',
    controlVersion: CONTROL.version,
    controlMappingVersion: CONTROL.mappingVersion,
    fovDegrees: CONTROL.fov,
    cameraMotion: CONTROL.cameraMotion,
  },
  summary: { ...summaryValue, digest, deterministic },
  anchor: transcript.anchor,
  scenarios,
  cost,
  limitations: [
    'The report is a local Node tick measurement, not a browser frame/FPS/GPU result and not the 203/287 hardware gate.',
    'The live first-person view is a presentation choice of the driven car; a camera-only selection of another car stays in CHASE until that car is explicitly taken over.',
    'The live V3 car has no modelled cabin interior, so the whole exterior shell of the driven car is hidden in first person; the road, traffic, city and lights remain rendered.',
    'Mouse look/recenter and pointer capture remain the 017 fixture contract; PBI 280 only mounts C, the driver anchor and the saved presentation preference.',
  ],
};

const output = argument('--output') ?? defaultOutput;
await mkdir(directory, { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
await writeFile(
  reportMarkdown,
  `# 280 — camera first-person din poziția șoferului

Transcript determinist generat de \`${report.generatedBy}\`; contract \`${report.contract}\`.
Machine-readable: [report.json](report.json).

## Sumar

- Scenarii: **${summaryValue.passed}/${summaryValue.scenarios}** PASS.
- Verdict: **${summaryValue.allPassed ? 'PASS' : 'FAIL'}**.
- Digest SHA-256: \`${digest}\`.
- Cost local tick p95: CHASE ${cost.chase.p95MsMedian.toFixed(3)} ms, FIRST_PERSON ${cost.firstPerson.p95MsMedian.toFixed(3)} ms, delta ${cost.incrementalP95Ms.toFixed(3)} ms.

| Scenariu | Verdict | Detaliu |
| --- | --- | --- |
${scenarios
  .map(
    (scenario) => `| \`${scenario.id}\` | ${scenario.pass ? 'PASS' : 'FAIL'} | ${scenario.label} |`,
  )
  .join('\n')}

## Ancore reale

- Sedan: \`(${app.vehicleDriverEyeM('sedan').x.toFixed(3)}, ${app.vehicleDriverEyeM('sedan').y.toFixed(3)}, ${app.vehicleDriverEyeM('sedan').z.toFixed(3)})\` m, stânga, în cabina 145.
- Compact: \`(${app.vehicleDriverEyeM('compact').x.toFixed(3)}, ${app.vehicleDriverEyeM('compact').y.toFixed(3)}, ${app.vehicleDriverEyeM('compact').z.toFixed(3)})\` m, stânga, în cabina 145.

## FOV

${scenarios
  .find((scenario) => scenario.id === 'fov')
  .rows.map(
    (row) =>
      `- setare ${row.settingDegrees}° → măsurat ${row.measuredDegrees.toFixed(4)}° (${row.mode})`,
  )
  .join('\n')}

## Cost

${cost.method}

${cost.scope}

| Mod | p50 median (ms) | p95 median (ms) | mean median (ms) |
| --- | ---: | ---: | ---: |
| CHASE | ${cost.chase.p50MsMedian.toFixed(4)} | ${cost.chase.p95MsMedian.toFixed(4)} | ${cost.chase.meanMsMedian.toFixed(4)} |
| FIRST_PERSON | ${cost.firstPerson.p50MsMedian.toFixed(4)} | ${cost.firstPerson.p95MsMedian.toFixed(4)} | ${cost.firstPerson.meanMsMedian.toFixed(4)} |

## Limitări

${report.limitations.map((entry) => `- ${entry}`).join('\n')}
`,
);
console.log(
  `First-person camera report: ${summaryValue.passed}/${summaryValue.scenarios} scenarios PASS, digest ${digest}`,
);
if (!summaryValue.allPassed) process.exitCode = 1;
