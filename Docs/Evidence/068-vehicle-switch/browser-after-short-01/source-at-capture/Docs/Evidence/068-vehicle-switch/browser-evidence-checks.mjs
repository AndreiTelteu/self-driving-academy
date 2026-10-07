import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export function assertCaptureInventory(files) {
  assert.ok(
    !files.some((name) => /failure|rejected|incomplete/i.test(name)),
    'Failed/rejected/incomplete attempt must remain disqualifying',
  );
  assert.deepEqual(
    files.filter((name) => name.startsWith('capture-')).sort(),
    [
      'capture-webgl2-started.json',
      'capture-webgl2-terminal.json',
      'capture-webgpu-started.json',
      'capture-webgpu-terminal.json',
    ],
    'Exact finite two-backend capture lifecycle',
  );
}
export const context = (value, expected) => {
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.units, 'SI');
  assert.equal(value.sessionId, '068-browser-before');
  assert.equal(value.worldEpoch, expected.worldEpoch);
  assert.equal(value.sessionId, expected.sessionId);
};
export function identity(value) {
  assert.ok(['car-0', 'car-1'].includes(value.entityId));
  assert.ok(Number.isFinite(value.handle));
  assert.ok(Number.isInteger(value.generation) && value.generation > 0);
}
export function bodies(values, ids) {
  assert.equal(values.length, 2);
  for (let i = 0; i < 2; i++) {
    const b = values[i];
    identity(b.identity);
    assert.deepEqual(b.identity, ids[i]);
    for (const name of ['positionM', 'rotationQuaternion']) {
      const v = b.transform[name];
      assert.ok(['x', 'y', 'z'].every((k) => Number.isFinite(v[k])));
      if (name === 'rotationQuaternion') {
        assert.ok(Number.isFinite(v.w));
        assert.ok(Math.abs(Math.hypot(v.x, v.y, v.z, v.w) - 1) <= 1e-6);
      }
    }
    assert.ok(['x', 'y', 'z'].every((k) => Number.isFinite(b.velocityMps[k])));
  }
}
export function assignment(run) {
  assert.equal(hash(run.assignmentText), run.assignmentDigest);
  const records = JSON.parse(run.assignmentText);
  assert.equal(records.length, 2);
  assert.deepEqual(run.kinds, run.events ? ['TAXI', 'CIVIL'] : ['TAXI', 'TAXI']);
  for (let i = 0; i < 2; i++) {
    const record = records[i];
    context(record, run.context);
    assert.equal(record.vehicleId, run.identities[i].entityId);
    assert.equal(record.kind, run.kinds[i]);
    assert.deepEqual(record.routeLaneIds, ['fixture-authored-lane']);
    if (record.kind === 'TAXI') {
      const trip = record.trip;
      context(trip, run.context);
      assert.equal(trip.taxiId, record.vehicleId);
      assert.deepEqual(trip.routeLaneIds, record.routeLaneIds);
      assert.equal(trip.status, 'TO_DROPOFF');
      assert.equal(trip.completedTick, null);
    } else assert.equal(record.trip, null);
  }
}
export function segment(boundary, run, mode, start, end) {
  assert.ok(boundary);
  assert.deepEqual(boundary.identity, run.identities[0]);
  const v = boundary.segment;
  context(v, run.context);
  assert.equal(v.vehicleId, 'car-0');
  assert.equal(v.controlMode, mode);
  assert.equal(v.startTick, start);
  assert.equal(v.endTick, end);
  assert.equal(v.completeness, end === null ? 'OPEN' : 'CLOSED');
  assert.equal(v.closeReason, end === null ? null : 'VEHICLE_SWITCH');
  assert.deepEqual(v.samples, []);
  assert.deepEqual(v.events, []);
  assert.equal(v.learningEligible, false);
}
export function modeProofs(run, expected) {
  assert.deepEqual(
    run.modeSettlementProofs.map((p) => ({ tick: p.tick, mode: p.mode })),
    expected,
  );
  for (const p of run.modeSettlementProofs) {
    context(p.context, run.context);
    assert.deepEqual(p.identity, run.identities[0]);
    assert.equal(p.serialAfter, p.serial);
    assert.equal(p.serial, p.tick);
    bodies(p.before, run.identities);
    assert.deepEqual(p.after, p.before);
    assert.equal(p.authority.tick, p.tick);
    assert.equal(p.authority.players, 1);
    assert.equal(p.authority.seat.mode, p.mode);
    assert.deepEqual(p.authority.seat.identity, run.identities[0]);
    segment(p.segment, run, p.mode, p.tick, null);
  }
}
export function checkpoints(run) {
  const expected = Array.from({ length: Math.floor(run.ticks / 60) }, (_, i) => (i + 1) * 60);
  assert.deepEqual(
    run.checkpoints.map((c) => c.tick),
    expected,
  );
  const raw = run.rawPacketsJsonl.trimEnd().split('\n').map(JSON.parse),
    native = run.rawNativeInputsJsonl.trimEnd().split('\n').map(JSON.parse);
  assert.equal(raw.length, run.ticks);
  assert.equal(native.length, run.ticks);
  const controls = run.rawControlsJsonl.trimEnd().split('\n').map(JSON.parse);
  assert.equal(controls.length, run.ticks);
  assert.equal(hash(run.rawControlsJsonl), run.controlDigest);
  assert.ok(run.rawControlsJsonl.length <= 16 * 1024 * 1024);
  assert.equal(hash(run.rawPacketsJsonl), run.packetDigest);
  assert.equal(hash(run.rawNativeInputsJsonl), run.nativeInputDigest);
  assert.ok(
    run.rawPacketsJsonl.length <= 16 * 1024 * 1024 &&
      run.rawNativeInputsJsonl.length <= 4 * 1024 * 1024,
  );
  for (let t = 1; t <= run.ticks; t++) {
    assert.equal(raw[t - 1].length, 4);
    assert.equal(native[t - 1].length, 2);
    for (let i = 0; i < 4; i++) {
      const packet = raw[t - 1][i],
        cmd = packet.command;
      assert.deepEqual(packet.identity, run.identities[Math.floor(i / 2)]);
      context(cmd, run.context);
      assert.equal(cmd.tick, t);
      assert.equal(cmd.vehicleId, packet.identity.entityId);
      assert.equal(cmd.source, i % 2 === 0 ? 'AUTONOMY' : 'PLAYER');
      assert.ok(Number.isFinite(cmd.throttle) && cmd.throttle >= 0 && cmd.throttle <= 1);
      assert.ok(Number.isFinite(cmd.brake) && cmd.brake >= 0 && cmd.brake <= 1);
      assert.ok(Number.isFinite(cmd.steering) && Math.abs(cmd.steering) <= 1);
      assert.equal(typeof cmd.handbrake, 'boolean');
      assert.equal(cmd.turnSignal, 'OFF');
    }
    assert.deepEqual(
      native[t - 1].map((v) => v[0]),
      ['car-0', 'car-1'],
    );
    assert.equal(controls[t - 1].length, 2);
    for (let i = 0; i < 2; i++) {
      const control = controls[t - 1][i],
        cycle = Math.floor((t - 1) / 60),
        mode = i === 0 && (t - 1) % 60 < 20 ? ['AUTO', 'MANUAL', 'LEARNING'][cycle % 3] : 'AUTO',
        source = mode === 'AUTO' ? 'AUTONOMY' : 'PLAYER';
      assert.deepEqual(control.identity, run.identities[i]);
      assert.equal(control.tick, t);
      assert.equal(control.targetTick, t);
      assert.equal(control.mode, mode);
      assert.deepEqual(control.raw, raw[t - 1][i * 2 + (source === 'PLAYER' ? 1 : 0)].command);
      context(control.command, run.context);
      assert.equal(control.command.vehicleId, control.identity.entityId);
      assert.equal(control.command.source, source);
      assert.equal(control.command.tick, t);
      assert.equal(
        control.command.throttle,
        control.raw.brake === 0 && !control.raw.handbrake ? control.raw.throttle : 0,
      );
      for (const key of ['brake', 'steering', 'handbrake', 'turnSignal'])
        assert.equal(control.command[key], control.raw[key]);
      assert.deepEqual(native[t - 1][i][1], {
        throttle: control.command.throttle,
        brake: control.command.brake,
        steering: control.command.steering,
        handbrake: control.command.handbrake,
      });
    }
  }
  for (const cp of run.checkpoints) {
    context(cp.context, run.context);
    bodies(cp.bodies, run.identities);
    assert.deepEqual(cp.packets, raw[cp.tick - 1]);
    assert.deepEqual(cp.controls, controls[cp.tick - 1]);
    assert.deepEqual(cp.nativeInputs, native[cp.tick - 1]);
    assert.equal(cp.physical.length, 2);
    assert.equal(cp.controls.length, 2);
    assert.equal(cp.seat, null);
    assert.equal(cp.selected, 'car-0');
    for (let i = 0; i < 2; i++) {
      const p = cp.physical[i],
        b = cp.bodies[i],
        ctrl = cp.controls[i];
      assert.equal(p.id, run.identities[i].entityId);
      assert.deepEqual(p.position, b.transform.positionM);
      assert.deepEqual(p.rotation, b.transform.rotationQuaternion);
      assert.deepEqual(p.velocity, b.velocityMps);
      assert.ok(Number.isFinite(p.speed) && p.speed >= 0);
      assert.equal(p.speed, Math.hypot(p.velocity.x, p.velocity.z));
      assert.ok(p.suspension.length === 4 && p.suspension.every(Number.isFinite));
      assert.ok(Number.isInteger(p.wheelContacts) && p.wheelContacts >= 0 && p.wheelContacts <= 4);
      assert.deepEqual(ctrl.identity, run.identities[i]);
      assert.equal(ctrl.tick, cp.tick);
      assert.equal(ctrl.mode, 'AUTO');
      assert.equal(ctrl.targetTick, cp.tick);
      assert.deepEqual(ctrl.raw, cp.packets[i * 2].command);
      context(ctrl.command, run.context);
      assert.equal(ctrl.command.tick, cp.tick);
      assert.equal(ctrl.command.vehicleId, ctrl.identity.entityId);
      assert.equal(ctrl.command.source, 'AUTONOMY');
      assert.equal(
        ctrl.command.throttle,
        ctrl.raw.brake === 0 && !ctrl.raw.handbrake ? ctrl.raw.throttle : 0,
      );
      for (const key of ['brake', 'steering', 'handbrake', 'turnSignal'])
        assert.equal(ctrl.command[key], ctrl.raw[key]);
      assert.deepEqual(cp.nativeInputs[i][1], {
        throttle: ctrl.command.throttle,
        brake: ctrl.command.brake,
        steering: ctrl.command.steering,
        handbrake: ctrl.command.handbrake,
      });
    }
    let cycle = Math.floor((cp.tick - 1) / 60);
    while (cycle >= 0 && cycle % 3 === 0) cycle--;
    if (cycle < 0) assert.equal(cp.segment, null);
    else
      segment(
        cp.segment,
        run,
        ['AUTO', 'MANUAL', 'LEARNING'][cycle % 3],
        1 + 60 * cycle,
        21 + 60 * cycle,
      );
  }
}
export function distribution(values) {
  assert.equal(values.length, 600);
  assert.ok(values.every((v) => Number.isFinite(v) && v >= 0));
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: sorted[Math.floor(599 * 0.5)],
    p95: sorted[Math.floor(599 * 0.95)],
    p99: sorted[Math.floor(599 * 0.99)],
  };
}
export function owned(run) {
  const c = run.cleanup;
  assert.ok(c && c.errors.length === 0);
  assert.deepEqual(
    [...c.attempts].sort(),
    [
      'world',
      'controller',
      'keyboard',
      'authority',
      'mode',
      'segment',
      'mesh-0',
      'mesh-1',
      'material-0',
      'material-1',
      'camera',
      'registry',
      'picker',
      run.events ? 'occluder' : 'loop',
    ].sort(),
  );
  assert.equal(c.resourceCap, 32);
  assert.equal(c.readerCap, 32);
  const s = c.snapshots;
  assert.equal(s.body.entities, 0);
  assert.equal(s.body.subscriptions, 0);
  assert.equal(s.collision.colliders, 0);
  for (const key of ['vehicles', 'players', 'targets', 'projections'])
    assert.equal(s.controller[key], 0);
  assert.equal(s.controller.disposed, true);
  assert.equal(s.authority.vehicles, 0);
  assert.equal(s.authority.players, 0);
  assert.equal(s.keyboard.heldKeys, 0);
  assert.equal(s.keyboard.disposed, true);
  assert.equal(s.mode.intents, 0);
  assert.equal(s.mode.inFlight, 0);
  assert.equal(s.mode.projection, null);
  assert.equal(s.segment.retainedSegments, 0);
  assert.equal(s.registry.bindings, 0);
  assert.equal(s.camera.disposed, true);
  assert.equal(s.camera.selected, null);
  for (const [name, value] of Object.entries(s))
    if (name.startsWith('mesh-') || name.startsWith('material-') || name === 'occluder')
      assert.equal(value.disposed, true);
  const g = run.owned.guard;
  assert.equal(g.selectionStepAttempts, 0);
  assert.deepEqual(
    Object.keys(g.drivingCalls).sort(),
    [
      'setPose',
      'setBodyVelocity',
      'setVelocity',
      'addCar',
      'addClassCar',
      'addBox',
      'addNamedBox',
      'removeBody',
      'removeCollisionEntity',
      'subscribeBody',
      'publishBodies',
      'dispose',
    ].sort(),
  );
  assert.ok(Object.values(g.drivingCalls).every((v) => v === 0));
  assert.deepEqual(
    g.setupCalls,
    run.events
      ? ['addClassCar', 'addClassCar', 'removeBody', 'addClassCar']
      : ['addClassCar', 'addClassCar'],
  );
}
export function immutable(m) {
  return {
    classId: m.classId,
    version: m.version,
    massKg: m.massKg,
    powerW: m.powerW,
    grip: m.grip,
    brakeAccelerationMps2: m.brakeAccelerationMps2,
    wheels: m.wheels,
    turningRadiusM: m.turningRadiusM,
  };
}
export function proofs(run) {
  const expected = run.events
    ? [1, 2, 4, 5, 7, 8].map((tick) => ({
        tick,
        selected: [1, 4, 7].includes(tick) ? 'car-1' : 'car-0',
      }))
    : Array.from({ length: run.ticks }, (_, i) => i + 1)
        .filter((t) => t % 60 === 21 || t % 60 === 41)
        .map((tick) => ({ tick, selected: tick % 60 === 21 ? 'car-1' : 'car-0' }));
  assert.deepEqual(
    run.selectionProofs.map((p) => ({ tick: p.tick, selected: p.selected })),
    expected,
  );
  for (const proof of run.selectionProofs) {
    assert.equal(proof.before.length, 2);
    assert.deepEqual(proof.after, proof.before);
    assert.ok(Number.isInteger(proof.serial));
    assert.ok(['car-0', 'car-1'].includes(proof.selected));
    context(proof.context, run.context);
    bodies(proof.before, run.identities);
    assert.equal(proof.serialAfter, proof.serial);
    assert.equal(proof.serial, proof.tick);
    assert.deepEqual(proof.selectedIdentity, run.identities[proof.selected === 'car-0' ? 0 : 1]);
    assert.equal(proof.cameraSelected, proof.selected);
    assert.equal(proof.selectedKind, run.kinds[proof.selected === 'car-0' ? 0 : 1]);
    assert.equal(
      proof.selectionSource,
      run.events && proof.selected === 'car-1' ? 'WORLD' : 'FLEET',
    );
    if (proof.selectionSource === 'FLEET') assert.equal(proof.selectedKind, 'TAXI');
    assert.equal(proof.authority.tick, proof.tick);
    assert.equal(proof.authority.players, 0);
    assert.equal(proof.authority.seat, null);
    assert.equal(proof.assignmentText, run.assignmentText);
    assert.equal(proof.assignmentBefore, run.assignmentText);
    assert.equal(proof.assignmentAfter, run.assignmentText);
    if (proof.oldSeat) {
      assert.deepEqual(proof.oldSeat.identity, run.identities[0]);
      const open = proof.segmentBefore.segment;
      segment(proof.segmentBefore, run, proof.oldSeat.mode, open.startTick, null);
      segment(proof.segmentAfter, run, proof.oldSeat.mode, open.startTick, proof.tick);
    } else assert.deepEqual(proof.segmentAfter, proof.segmentBefore);
  }
  assert.ok(run.selectionProofs.length <= 80);
}
