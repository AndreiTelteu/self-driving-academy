import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertCaptureInventory,
  checkpoints,
  proofs,
  assignment,
  hash,
} from '../../../Docs/Evidence/068-vehicle-switch/browser-evidence-checks.mjs';
const c = { schemaVersion: 1, units: 'SI', sessionId: '068-browser-before', worldEpoch: 1 },
  ids = [
    { entityId: 'car-0', handle: 1, generation: 1 },
    { entityId: 'car-1', handle: 2, generation: 2 },
  ];
function fixture() {
  const body = ids.map((identity) => ({
    identity,
    transform: { positionM: { x: 0, y: 0, z: 0 }, rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 } },
    velocityMps: { x: 0, y: 0, z: 0 },
  }));
  const packets = (tick) =>
    ids.flatMap((identity) =>
      ['AUTONOMY', 'PLAYER'].map((source) => ({
        identity,
        command: {
          ...c,
          vehicleId: identity.entityId,
          tick,
          source,
          throttle: 0.5,
          brake: 0,
          steering: 0,
          handbrake: false,
          turnSignal: 'OFF',
        },
      })),
    );
  const native = ids.map((id) => [
    id.entityId,
    { throttle: 0.5, brake: 0, steering: 0, handbrake: false },
  ]);
  const rawPacketsJsonl = Array.from(
      { length: 60 },
      (_, i) => JSON.stringify(packets(i + 1)) + '\n',
    ).join(''),
    rawNativeInputsJsonl = Array.from({ length: 60 }, () => JSON.stringify(native) + '\n').join('');
  const cp = {
    tick: 60,
    context: c,
    bodies: body,
    packets: packets(60),
    nativeInputs: native,
    physical: ids.map((id) => ({
      id: id.entityId,
      position: body[0].transform.positionM,
      rotation: body[0].transform.rotationQuaternion,
      velocity: body[0].velocityMps,
      speed: 0,
      suspension: [0, 0, 0, 0],
      wheelContacts: 0,
    })),
    controls: ids.map((identity, i) => ({
      identity,
      tick: 60,
      mode: 'AUTO',
      targetTick: 60,
      raw: packets(60)[i * 2].command,
      command: packets(60)[i * 2].command,
    })),
    seat: null,
    selected: 'car-0',
    segment: null,
  };
  const rawControlsJsonl = Array.from(
    { length: 60 },
    (_, j) =>
      JSON.stringify(
        ids.map((identity, i) => ({
          identity,
          tick: j + 1,
          mode: 'AUTO',
          targetTick: j + 1,
          raw: packets(j + 1)[i * 2].command,
          command: packets(j + 1)[i * 2].command,
        })),
      ) + '\n',
  ).join('');
  return {
    rawControlsJsonl,
    controlDigest: hash(rawControlsJsonl),
    ticks: 60,
    context: c,
    identities: ids,
    rawPacketsJsonl,
    rawNativeInputsJsonl,
    packetDigest: hash(rawPacketsJsonl),
    nativeInputDigest: hash(rawNativeInputsJsonl),
    checkpoints: [cp],
  };
}
test('068 finite inventory rejects unfinished/failed/rejected even beside later PASS filenames', () => {
  const names = [
    'capture-webgpu-started.json',
    'capture-webgpu-terminal.json',
    'capture-webgl2-started.json',
    'capture-webgl2-terminal.json',
  ];
  assertCaptureInventory(names);
  assert.throws(() => assertCaptureInventory(names.slice(0, 3)));
  for (const name of ['failure-webgpu.json', 'capture-webgpu-rejected.json', 'incomplete.json'])
    assert.throws(() => assertCaptureInventory([...names, name]));
});
test('068 checkpoint validator binds canonical tick, rawcontext, effectivecontrol and actualnative inputs', () => {
  checkpoints(fixture());
  for (const key of ['tick', 'rawcontext', 'effective', 'native', 'body']) {
    const r = fixture();
    if (key === 'tick') r.checkpoints[0].tick = 59;
    if (key === 'rawcontext') {
      const rows = r.rawPacketsJsonl.trimEnd().split('\n').map(JSON.parse);
      rows[0][0].command.worldEpoch = 9;
      r.rawPacketsJsonl = rows.map((v) => JSON.stringify(v) + '\n').join('');
      r.packetDigest = hash(r.rawPacketsJsonl);
    }
    if (key === 'effective')
      r.checkpoints[0].controls[0].command = {
        ...r.checkpoints[0].controls[0].command,
        throttle: 0.2,
      };
    if (key === 'native')
      ((r.checkpoints[0].nativeInputs = structuredClone(r.checkpoints[0].nativeInputs)),
        (r.checkpoints[0].nativeInputs[0][1].throttle = 0.2));
    if (key === 'body')
      ((r.checkpoints[0].bodies = structuredClone(r.checkpoints[0].bodies)),
        (r.checkpoints[0].bodies[0].identity.generation = 3));
    assert.throws(() => checkpoints(r), key);
  }
});
test('068 empty selection proofs cannot pass guard flags and route digest cannot hide foreign trip context', () => {
  assert.throws(() => proofs({ events: [], selectionProofs: [] }));
  const rides = ids.map((id) => ({
    ...c,
    vehicleId: id.entityId,
    kind: 'TAXI',
    routeLaneIds: ['fixture-authored-lane'],
    trip: {
      ...c,
      taxiId: id.entityId,
      routeLaneIds: ['fixture-authored-lane'],
      status: 'TO_DROPOFF',
      completedTick: null,
    },
  }));
  const run = {
    context: c,
    identities: ids,
    kinds: ['TAXI', 'TAXI'],
    assignmentText: JSON.stringify(rides),
    assignmentDigest: hash(JSON.stringify(rides)),
  };
  assignment(run);
  rides[0].worldEpoch = 9;
  run.assignmentText = JSON.stringify(rides);
  run.assignmentDigest = hash(run.assignmentText);
  assert.throws(() => assignment(run));
});
