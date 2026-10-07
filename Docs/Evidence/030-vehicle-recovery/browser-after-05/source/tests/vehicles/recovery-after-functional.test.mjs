// SOURCE ONLY: pure/adversarial draft. Synthetic DTOs are never hardware evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, relative, basename, isAbsolute, join } from 'node:path';
import {
  trustedEdge,
  validateFunctional,
  FUNCTIONAL,
  actualRecoveryOperationId,
  actualRecoveryPointId,
  actualCollisionIncidentId,
} from '../browser/vehicle-recovery-after/functional-proof.ts';
import {
  encodeDiagnosticText,
  decodeDiagnosticText,
  functionalPrimaryCause,
} from '../browser/vehicle-recovery-after/functional-diagnostic.ts';
import { functionalJsonBoundary } from '../browser/vehicle-recovery-after/functional-dto.ts';
import { createFunctionalStore } from '../browser/vehicle-recovery-after/functional-store.mjs';
import { functionalHandler } from '../browser/vehicle-recovery-after/functional-http.mjs';
import { createHarnessLifetime } from '../browser/vehicle-damage/hardware-lifetime.ts';
const expected = { tick: 41, vehicleId: 'subject', generation: 3 };
test('lossless bounded diagnostic encoding preserves code units and rejects noncanonical/counter tampering', () => {
  for (const text of [
    'ASCII',
    '\0\n\r\t"\\',
    'ă漢🙂',
    '\ud800',
    '\udfff',
    '\ud800A\udfff',
    '\0'.repeat(2048),
  ]) {
    const encoded = encodeDiagnosticText(text);
    assert.equal(decodeDiagnosticText(encoded), text);
    assert.throws(() =>
      decodeDiagnosticText({ ...encoded, codeUnitCount: encoded.codeUnitCount + 1 }),
    );
    assert.throws(() => decodeDiagnosticText({ ...encoded, data: encoded.data + '\n' }));
    assert.throws(() => decodeDiagnosticText({ ...encoded, extra: 1 }));
  }
  assert.throws(() => encodeDiagnosticText('x'.repeat(2049)));
  assert.throws(() =>
    decodeDiagnosticText({ encoding: 'UTF16LE_BASE64', codeUnitCount: 1, data: 'QQ==' }),
  );
  // Nonzero ignored padding bits are not canonical even if a permissive decoder accepts them.
  assert.throws(() =>
    decodeDiagnosticText({ encoding: 'UTF16LE_BASE64', codeUnitCount: 1, data: 'QQB=' }),
  );
});
test('functional string capacities reject overflow and foreign fixture context without normalization', () => {
  assert.equal(functionalJsonBoundary({ incidentId: '\0'.repeat(512) }).incidentId.length, 512);
  assert.throws(() => functionalJsonBoundary({ incidentId: '\0'.repeat(513) }));
  assert.throws(() => functionalJsonBoundary({ sessionId: 'foreign-context' }));
  assert.throws(() => functionalJsonBoundary({ entityId: 'foreign-actor' }));
  assert.throws(() => functionalJsonBoundary({ historyBefore: '漢'.repeat(30000) }));
  const text = functionalPrimaryCause('漢'.repeat(4097));
  assert.equal(decodeDiagnosticText(text.text, 4096), '漢'.repeat(4096));
  assert.equal(text.omittedCodeUnits, 1);
  assert.equal(text.prefixOnly, true);
});
test('codec and JSON boundary reject getters and inherited encodings before reading any field', () => {
  let reads = 0;
  const valid = encodeDiagnosticText('exact');
  for (const field of ['encoding', 'data', 'codeUnitCount']) {
    const hostile = { ...valid };
    Object.defineProperty(hostile, field, {
      enumerable: true,
      get() {
        reads++;
        return valid[field];
      },
    });
    assert.throws(() => decodeDiagnosticText(hostile));
    assert.throws(() => functionalJsonBoundary({ message: hostile }));
    assert.equal(reads, 0);
  }
  const inherited = Object.create({
    get encoding() {
      reads++;
      return 'UTF16LE_BASE64';
    },
  });
  Object.assign(inherited, { data: valid.data, codeUnitCount: valid.codeUnitCount });
  assert.throws(() => decodeDiagnosticText(inherited));
  assert.throws(() => functionalJsonBoundary(inherited));
  assert.equal(reads, 0);
  const getterAfterCodec = { ...valid };
  Object.defineProperty(getterAfterCodec, 'later', {
    enumerable: true,
    get() {
      reads++;
      return 1;
    },
  });
  assert.throws(() => functionalJsonBoundary(getterAfterCodec));
  assert.equal(reads, 0);
  assert.throws(() => functionalJsonBoundary({ ['x'.repeat(65)]: 1 }));
  assert.throws(() =>
    functionalJsonBoundary(Object.fromEntries(Array.from({ length: 129 }, (_, i) => ['k' + i, 1]))),
  );
});
const edge = { ...expected, isTrusted: true, code: 'KeyR', type: 'keydown', repeat: false };
const identity = {
  sourceHash: 'a'.repeat(64),
  artifactHash: 'b'.repeat(64),
  nativeHash: 'c'.repeat(64),
};
async function isolated(run) {
  const root = resolve(await mkdtemp(join(tmpdir(), '030-functional-unit-')));
  const relativeRoot = relative(resolve(tmpdir()), root);
  assert(
    relativeRoot &&
      !relativeRoot.startsWith('..') &&
      !isAbsolute(relativeRoot) &&
      basename(root).startsWith('030-functional-unit-'),
  );
  try {
    await mkdir(join(root, 'captures'));
    return await run({
      ...identity,
      functionalRoot: join(root, 'captures'),
      archivedAt: '2026-10-06T00:00:00.000Z',
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test('physical R requires trusted nonrepeat keydown, not synthetic/held input', () => {
  trustedEdge(edge, expected);
  for (const patch of [{ isTrusted: false }, { repeat: true }, { type: 'keyup' }, { code: 'KeyW' }])
    assert.throws(() => trustedEdge({ ...edge, ...patch }, expected));
});
test('R seat/generation and last accepted tick are exact', () => {
  for (const patch of [{ tick: 42 }, { vehicleId: 'other' }, { generation: 4 }])
    assert.throws(() => trustedEdge({ ...edge, ...patch }, expected));
});
test('partial case never becomes functional completion', () => {
  assert.throws(
    () =>
      validateFunctional(
        { version: FUNCTIONAL.version, status: 'INCOMPLETE', identity, cases: [] },
        identity,
      ),
    /Complete functional/,
  );
});
test('submitted raw survives wrong source and rejected terminal cannot be overwritten', async () =>
  isolated(async (build) => {
    const store = await createFunctionalStore(build),
      start = await store.start({ ...identity, preference: 'AUTO' });
    const raw = Buffer.from(
      JSON.stringify({
        identity: {
          ...identity,
          captureId: start.captureId,
          backend: 'WEBGPU',
          nativeHash: 'x'.repeat(64),
        },
        status: 'COMPLETE',
      }),
    );
    await assert.rejects(store.receive(start.captureId, 'report', raw));
    assert.deepEqual(await store.raw(start.captureId), raw);
    const folder = join(build.functionalRoot, start.captureId);
    assert((await readdir(folder)).includes('rejected.json'));
    await assert.rejects(store.receive(start.captureId, 'report', Buffer.from('{}')));
    assert.deepEqual(await readFile(join(folder, 'submitted.json')), raw);
  }));
test('second backend attempt retained as rejection without replacing first start', async () =>
  isolated(async (build) => {
    const store = await createFunctionalStore(build),
      first = await store.start({ ...identity, preference: 'AUTO' });
    // Capture IDs are distinct; fixture test supplies monotonic ISO clock, never native time.
    const OriginalDate = globalThis.Date;
    let n = 0;
    globalThis.Date = class extends OriginalDate {
      constructor(...args) {
        super(
          ...(args.length
            ? args
            : ['2026-10-06T00:00:' + String(10 + n++).padStart(2, '0') + '.000Z']),
        );
      }
    };
    try {
      await assert.rejects(store.start({ ...identity, preference: 'AUTO' }), /One immutable/);
    } finally {
      globalThis.Date = OriginalDate;
    }
    assert.equal((await readdir(build.functionalRoot)).length, 2);
    assert.equal(
      JSON.parse(await readFile(join(build.functionalRoot, first.captureId, 'started.json')))
        .backend,
      'WEBGPU',
    );
  }));
test('oversize body rejected boundedly with attempted identity and no partial raw blob', async () =>
  isolated(async (build) => {
    const store = await createFunctionalStore(build),
      start = await store.start({ ...identity, preference: 'AUTO' });
    const handler = functionalHandler(() => assert.fail('Unexpected delegation'), store);
    const request = {
      url: '/functional/' + start.captureId + '/report',
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:5218' },
      async *[Symbol.asyncIterator]() {
        yield Buffer.alloc(FUNCTIONAL.reportBytes);
        yield Buffer.alloc(1);
      },
    };
    const response = {
      headersSent: false,
      status: null,
      writeHead(status) {
        this.headersSent = true;
        this.status = status;
      },
      end() {},
    };
    await handler(request, response);
    assert.equal(response.status, 413);
    const files = await readdir(join(build.functionalRoot, start.captureId));
    assert(!files.includes('submitted.json'));
    const rejection = JSON.parse(
      await readFile(join(build.functionalRoot, start.captureId, 'rejected.json')),
    );
    assert.equal(rejection.captureId, start.captureId);
    assert.equal(rejection.request.receivedBytes, FUNCTIONAL.reportBytes + 1);
    assert.equal(rejection.request.rawBodyRetained, false);
  }));
test('foreign origin cannot poison an existing functional attempt', async () =>
  isolated(async (build) => {
    const store = await createFunctionalStore(build),
      start = await store.start({ ...identity, preference: 'AUTO' });
    const handler = functionalHandler(() => assert.fail(), store);
    const request = {
      url: '/functional/' + start.captureId + '/report',
      method: 'POST',
      headers: { origin: 'http://foreign.invalid' },
      async *[Symbol.asyncIterator]() {
        assert.fail('Must not read body');
      },
    };
    const response = {
      headersSent: false,
      writeHead(status) {
        this.headersSent = true;
        assert.equal(status, 400);
      },
      end() {},
    };
    await handler(request, response);
    assert(!(await readdir(join(build.functionalRoot, start.captureId))).includes('rejected.json'));
  }));
test('primary, disposer and DOM removal causes remain while all independent releases run once', () => {
  const owner = createHarnessLifetime();
  let releases = 0;
  owner.own('independent', () => releases++);
  owner.own('DOM', () => {
    throw new Error('DOM removal');
  });
  owner.own('native', () => {
    throw new Error('native disposer');
  });
  owner.record('primary', new Error('original'));
  owner.dispose();
  owner.dispose();
  assert.equal(releases, 1);
  const state = owner.snapshot();
  assert.equal(state.attempted, 3);
  assert.equal(state.totalCauses, 3);
  assert.match(
    state.causes.map((c) => c.message).join('|'),
    /original.*native disposer.*DOM removal/,
  );
});
function validPureReport(build = identity) {
  const native = {
    physicsStepSerial: 221,
    transform: { positionM: { x: 0, y: 0, z: 0 }, rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 } },
    velocityMps: { x: 0, y: 0, z: 0 },
    angularVelocityRadS: { x: 0, y: 0, z: 0 },
  };
  const boundary = { subject: native, other: native },
    placement = { attempted: 5, completed: 5, after: native };
  const completed = {
    status: 'COMPLETED',
    kind: 'TELEPORT',
    learningEligible: false,
    origin: 'R',
    acceptedTick: 41,
    placement,
  };
  const denied = { status: 'DENIED', placement: { attempted: 0, status: 'BLOCKED' } };
  const operation = {
    edge,
    acceptedTick: 41,
    serialBefore: 221,
    serialAfter: 221,
    before: boundary,
    after: boundary,
    otherBefore: native,
    otherAfter: native,
  };
  const mechanics = (classId) => ({
    classId,
    version: 'pure',
    massKg: 1000,
    powerW: 100,
    grip: 1,
    brakeAccelerationMps2: 8,
    wheels: { radiusM: 0.3, wheelbaseM: 2.5, trackM: 1.5 },
    turningRadiusM: 5,
  });
  const rows = Array.from({ length: 394 }, (_, i) => ({
    tick: i + 1,
    nativeSerial: 181 + i,
    heightM: 1,
    speedMps: 0,
    wheelContacts: 4,
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    suspension: [0.1, 0.1, 0.1, 0.1],
    raw: { throttle: 0, brake: 0, steering: 0 },
    effective: { throttle: 0, brake: 0, steering: 0 },
  }));
  const segmentBefore = { completeness: 'OPEN', closeReason: null, endTick: null };
  const cases = ['sedan', 'compact'].map((classId) => ({
    classId,
    status: 'COMPLETE',
    vehicleId: 'subject',
    generation: 3,
    rows,
    keys: [
      { stage: 'TRUSTED_DRIVING', isTrusted: true, type: 'keydown', code: 'KeyW' },
      { stage: 'TRUSTED_DRIVING', isTrusted: true, type: 'keydown', code: 'KeyA' },
    ],
    supportCurve: Array.from({ length: 4 }, () => ({
      heightM: 1,
      upDot: 1,
      nativeSerial: 180,
      suspension: [0.1, 0.1, 0.1, 0.1],
      wheelContacts: 4,
      accepted: true,
    })),
    nativeImpulseNs: 1,
    incidents: [{ vehicleId: 'subject', otherEntityId: 'wall', impulseNs: 1 }],
    mechanicsBefore: mechanics(classId),
    mechanicsAfter: mechanics(classId),
    unsupported: Array.from({ length: 3 }, () => ({
      result: { inspection: { status: 'INVALID_SUPPORT' }, attempted: 0 },
    })),
    noPoint: { ...operation, result: 'NO_VALID_POINT' },
    recovered: { ...operation, record: completed },
    blocked: { ...operation, record: denied },
    segmentBefore,
    segmentAfter: {
      ...segmentBefore,
      completeness: 'CLOSED',
      closeReason: 'RECOVERY',
      endTick: 41,
    },
    damageBefore: [{ id: 'impact' }],
    damageAfter: [{ id: 'impact' }, { id: 'recovery' }],
    lastIncidentBefore: 'impact',
    lastIncidentAfter: 'impact',
    availabilityAfter: 'AVAILABLE',
    deliveryOrder: ['027', '025', '005', '007'],
    events: [{ id: 'once' }],
    neutral: { heldKeys: 0, raw: { throttle: 0, brake: 0, steering: 0 } },
    history: [completed, denied],
    historyBytes: Buffer.byteLength(JSON.stringify([completed, denied])),
    lifetimes: Array.from({ length: 20 }, () => ({
      activePorts: 1,
      afterPorts: 0,
      listeners: 0,
      nodes: 0,
      serialBefore: 221,
      serialAfter: 221,
    })),
    cleanup: {
      nativeBodies: 0,
      nativeColliders: 0,
      nativeSubscriptions: 0,
      recoveryPorts: 0,
      driveListeners: 0,
      recoveryListeners: 0,
      recoveryNodes: 0,
      domConnected: false,
      totalCauses: 0,
      resources: 20,
      attempted: 20,
    },
  }));
  const report = structuredClone({
    version: FUNCTIONAL.version,
    status: 'COMPLETE',
    identity: build,
    firstWorldAt: '2026-10-06T00:00:01Z',
    completedAt: '2026-10-06T00:01:00Z',
    cases,
    backendCleanup: { sceneDisposed: true, meshes: 0, materials: 0, engineScenes: 0 },
    ownership: { totalCauses: 0, resources: 4, attempted: 4 },
  });
  // Class contexts must never alias another class's retained record instances.
  report.cases = report.cases.map((row) => structuredClone(row));
  for (const [ordinal, row] of report.cases.entries()) {
    row.setupWrites = [];
    row.context = {
      schemaVersion: 1,
      units: 'SI',
      sessionId: '030-trusted-functional',
      worldEpoch: ordinal,
    };
    row.keys.push(
      { isTrusted: true, type: 'keydown', repeat: true, code: 'KeyR' },
      { isTrusted: true, type: 'keyup', code: 'KeyR' },
      { isTrusted: true, type: 'keyup', code: 'KeyR' },
      { isTrusted: true, type: 'keyup', code: 'KeyR' },
    );

    for (const sample of row.rows)
      for (const key of ['raw', 'effective'])
        sample[key] = {
          ...row.context,
          vehicleId: 'subject',
          tick: sample.tick,
          source: key === 'effective' && sample.tick === 392 ? 'AUTONOMY' : 'PLAYER',
          ...sample[key],
          handbrake: false,
          turnSignal: 'OFF',
        };
    for (const [operation, id] of [
      [row.recovered, 'recover'],
      [row.blocked, 'blocked'],
    ]) {
      Object.assign(operation.record, {
        context: row.context,
        operationId: id,
        vehicleId: 'subject',
        bodyGeneration: 3,
        mode: 'MANUAL',
        pointId: 'point',
        requestedTick: 41,
        acceptedTick: 41,
        origin: 'R',
        kind: 'TELEPORT',
        learningEligible: false,
        before: operation.before.subject,
      });
      Object.assign(operation.record.placement, {
        after: operation.after.subject,
        physicsStepSerial: 221,
      });
    }
    row.repeat = {
      edge,
      acceptedTick: 41,
      serialBefore: 221,
      serialAfter: 221,
      before: row.blocked.before,
      after: row.blocked.after,
      historyBefore: 'retained',
      historyAfter: 'retained',
      eventsBefore: 1,
      eventsAfter: 1,
      keysStart: 2,
      keysEnd: 4,
    };
    row.remapOld = {
      before: row.blocked.before,
      after: row.blocked.after,
      historyBefore: 'retained',
      historyAfter: 'retained',
      keysStart: 4,
      keysEnd: 5,
    };
    row.remapped = structuredClone(row.blocked);
    row.remapped.edge.code = 'KeyT';
    row.remapped.record.operationId = 'blocked';
    const hudRecord = structuredClone(row.blocked.record);
    hudRecord.operationId = 'hud';
    hudRecord.origin = 'HUD';
    row.hud = {
      ...structuredClone(row.blocked),
      record: hudRecord,
      pointer: { isTrusted: true, tick: 41 },
      focusedOwnButton: true,
    };
    row.staleHud = {
      pointer: { isTrusted: true, actualSeat: null },
      before: row.blocked.before,
      after: row.blocked.after,
      historyBefore: 'same',
      historyAfter: 'same',
    };
    row.auto = {
      seat: null,
      before: row.blocked.before,
      after: row.blocked.after,
      historyBefore: 'same',
      historyAfter: 'same',
      keysStart: 5,
      keysEnd: 6,
    };
    row.staleGeneration = { rejected: true, before: row.blocked.before, after: row.blocked.after };
    const partialNative = structuredClone(row.blocked.record);
    Object.assign(partialNative, {
      operationId: 'nativeFault',
      status: 'PARTIAL',
      pointId: 'point',
    });
    Object.assign(partialNative.placement, {
      status: 'SAFE',
      colliderCount: 3,
      attempted: 2,
      completed: 1,
      failure: 'actual injected setter',
    });
    row.nativeSetterFault = {
      scope: 'ACTUAL030_OWNER_TRUSTED_R_NATIVE_PARTIAL',
      operation: { ...structuredClone(row.blocked), record: partialNative },
      before: row.blocked.before,
      after: row.blocked.after,
      serialBefore: 221,
      serialAfter: 221,
      result: partialNative.placement,
      injectedSetterAttempts: 1,
      retryRejected: true,
    };
    row.deliveryRetry = {
      scope: 'ACTUAL030_OWNER_SUFFIX_RETRY_NO_NATIVE_REPLAY',
      partial: { ...row.recovered.record, status: 'PARTIAL', deliveredStages: 2 },
      completed: row.recovered.record,
      before: row.recovered.before,
      after: row.recovered.after,
      serialBefore: 221,
      serialAfter: 221,
      segmentAttempts: 2,
    };
    row.history = [row.recovered.record, row.blocked.record, hudRecord, partialNative];
    for (const [index, operation] of [
      row.recovered,
      row.blocked,
      row.hud,
      row.nativeSetterFault.operation,
    ].entries()) {
      const at = index === 0 ? 41 : index === 3 ? 43 : 42;
      operation.acceptedTick = at;
      operation.edge = { ...operation.edge, tick: at };
      operation.serialBefore = operation.serialAfter = 180 + at;
      for (const phase of ['before', 'after']) {
        operation[phase] = structuredClone(operation[phase]);
        operation[phase].subject.physicsStepSerial = 180 + at;
        operation[phase].other.physicsStepSerial = 180 + at;
      }
      operation.otherBefore = operation.before.other;
      operation.otherAfter = operation.after.other;
      operation.record.before = operation.before.subject;
      operation.record.placement.after = operation.after.subject;
      operation.record.placement.physicsStepSerial = 180 + at;
      Object.assign(operation.record, {
        requestedTick: at,
        acceptedTick: at,
        validatedTick: 12,
        mapId: '030-authored-road-v1',
        laneId: 'lane-0',
      });
      operation.record.operationId = actualRecoveryOperationId(row.context, operation.record);
      operation.record.pointId = actualRecoveryPointId(operation.record);
    }
    row.remapped = structuredClone(row.blocked);
    row.remapped.edge.code = 'KeyT';
    row.nativeSetterFault.result = row.nativeSetterFault.operation.record.placement;
    Object.assign(row.nativeSetterFault, {
      before: row.nativeSetterFault.operation.before,
      after: row.nativeSetterFault.operation.after,
      serialBefore: row.nativeSetterFault.operation.serialBefore,
      serialAfter: row.nativeSetterFault.operation.serialAfter,
    });
    row.deliveryRetry.partial = { ...row.recovered.record, status: 'PARTIAL', deliveredStages: 2 };
    row.deliveryRetry.completed = row.recovered.record;
    row.collisionIdentities = [
      { entityId: 'subject', kind: 'VEHICLE', serial: 1, colliderHandle: 1 },
      { entityId: 'other', kind: 'VEHICLE', serial: 2, colliderHandle: 2 },
      { entityId: 'wall', kind: 'OBSTACLE', serial: 3, colliderHandle: 3 },
    ];
    row.incidents = [
      {
        ...row.context,
        tick: 40,
        vehicleId: 'subject',
        otherEntityId: 'wall',
        impulseNs: 1,
        first: row.collisionIdentities[0],
        second: row.collisionIdentities[2],
      },
    ];
    row.incidents[0].incidentId = actualCollisionIncidentId(row.context, row.incidents[0]);
    row.damageBefore = [
      {
        ...row.context,
        kind: 'INCIDENT',
        operationId: row.incidents[0].incidentId,
        tick: 40,
        vehicleIds: ['subject'],
        bodyGenerations: [3],
        collisionSerials: [1, 3],
        impulseNs: 1,
        otherEntityId: 'wall',
      },
    ];
    row.damageAfter = [
      ...row.damageBefore,
      {
        ...row.context,
        kind: 'RECOVERY',
        operationId: row.recovered.record.operationId,
        tick: 41,
        vehicleIds: ['subject'],
        bodyGenerations: [3],
        collisionSerials: [],
        impulseNs: null,
        otherEntityId: null,
      },
    ];
    row.lastIncidentBefore = row.lastIncidentAfter = row.incidents[0].incidentId;
    row.historyBytes = Buffer.byteLength(JSON.stringify(row.history));
    row.events = [
      {
        ...row.context,
        type: 'VEHICLE_RECOVERED',
        eventId: row.recovered.record.operationId,
        tick: 41,
        entityIds: ['subject'],
        payload: { vehicleId: 'subject', recoveryPointId: row.recovered.record.pointId },
      },
    ];
  }
  return report;
}
test('full synthetic schema accepts structure but rejects missing setter, tampered native row and broken prefix', () => {
  const build = { ...identity, archivedAt: '2026-10-06T00:00:00Z' };
  assert.equal(validateFunctional(validPureReport(build), build).performanceAcceptance, false);
  for (const alter of [
    (r) => (r.cases[0].recovered.record.placement.completed = 4),
    (r) => r.cases[0].rows[20].nativeSerial++,
    (r) => (r.cases[0].rows[20].raw.throttle = NaN),
    (r) => (r.cases[0].damageAfter[0].operationId = 'tampered'),
    (r) => (r.cases[0].cleanup.recoveryPorts = 1),
    (r) => r.cases[0].recovered.record.acceptedTick++,
    (r) => (r.cases[0].events[0].eventId = 'foreign'),
    (r) => r.cases[0].history.pop(),
    (r) => (r.cases[0].rows[0].unknown = 'extra'),
    (r) => (r.cases[0].rows[2] = r.cases[0].rows[1]),
  ]) {
    const report = validPureReport(build);
    alter(report);
    assert.throws(() => validateFunctional(report, build));
  }
});
test('derived production identities reject coordinated copy tampering without changing native/context fields', () => {
  const build = { ...identity, archivedAt: '2026-10-06T00:00:00Z' };
  for (const field of ['operationId', 'pointId', 'incidentId']) {
    const report = validPureReport(build);
    const original =
      field === 'incidentId'
        ? report.cases[0].incidents[0][field]
        : report.cases[0].recovered.record[field];
    const altered = JSON.parse(
      JSON.stringify(report).replaceAll(
        JSON.stringify(original),
        JSON.stringify(original + 'forged'),
      ),
    );
    assert.throws(() => validateFunctional(altered, build), /derived028|derived030/);
  }
});
test('declared finite functional channel caps fit transport including native/history and bounded cause ledger', () => {
  const report = validPureReport({ ...identity, archivedAt: '2026-10-06T00:00:00Z' }),
    // Shortest binary64 decimal JSON: signed near-1e-6 normal form reaches25 chars;
    // scientific signedMAX_VALUE is only24. Counter fields remain safe integers.
    max = -0.0000012345678901234567;
  assert.equal(JSON.stringify(max).length, 25);
  for (const row of report.cases) {
    const sample = {
      heightM: max,
      speedMps: max,
      wheelContacts: 4,
      rotation: { x: max, y: max, z: max, w: max },
      suspension: Array(4).fill(max),
      raw: { throttle: max, brake: max, steering: max },
      effective: { throttle: max, brake: max, steering: max },
    };
    row.rows = Array.from({ length: FUNCTIONAL.maximumRows }, (_, i) => ({
      ...sample,
      tick: i + 1,
      nativeSerial: 181 + i,
      availability: 'IMMOBILIZED',
      raw: { ...row.rows[0].raw, ...sample.raw, tick: i + 1 },
      effective: { ...row.rows[0].effective, ...sample.effective, tick: i + 1 },
    }));
    row.keys = Array.from({ length: FUNCTIONAL.maximumKeys }, () => ({
      type: 'keydown',
      code: 'KeyW',
      repeat: false,
      isTrusted: true,
      readMs: max,
      tick: 600,
      vehicleId: 'subject',
      generation: 3,
      stage: 'LABELED_MOVING_BLOCKER_SETUP',
    }));
    row.supportCurve = Array.from({ length: FUNCTIONAL.maximumCurve }, () => ({
      requestedDegrees: max,
      heightM: max,
      upDot: max,
      wheelContacts: 4,
      nativeSerial: 780,
      suspension: Array(4).fill(max),
      accepted: false,
      trackingQuery: {
        nativeSerial: 780,
        status: 'INVALID_SUPPORT',
        transform: {
          positionM: { x: max, y: max, z: max },
          rotationQuaternion: { x: max, y: max, z: max, w: max },
        },
      },
    }));
    row.incidents = Array.from({ length: 32 }, () => ({
      ...row.context,
      vehicleId: 'subject',
      otherEntityId: 'wall',
      first: {
        entityId: 'subject',
        serial: Number.MAX_SAFE_INTEGER - 1,
        colliderHandle: Number.MAX_SAFE_INTEGER,
        kind: 'VEHICLE',
      },
      second: {
        entityId: 'wall',
        serial: Number.MAX_SAFE_INTEGER,
        colliderHandle: Number.MAX_SAFE_INTEGER,
        kind: 'OBSTACLE',
      },
      impulseNs: Math.abs(max),
      tick: 394,
    }));
    for (const incident of row.incidents)
      incident.incidentId = actualCollisionIncidentId(row.context, incident);
    row.collisionIdentities = [
      row.incidents[0].first,
      row.incidents[0].second,
      {
        entityId: 'other',
        kind: 'VEHICLE',
        serial: Number.MAX_SAFE_INTEGER - 2,
        colliderHandle: Number.MAX_SAFE_INTEGER,
      },
    ];
    row.events = Array.from({ length: 8 }, () => ({
      ...row.events[0],
      eventId: row.recovered.record.operationId,
    }));
    row.damageBefore = Array.from({ length: 64 }, () => ({
      ...row.context,
      operationId: row.incidents[0].incidentId,
      kind: 'INCIDENT',
      tick: Number.MAX_SAFE_INTEGER,
      vehicleIds: ['subject', 'other'],
      bodyGenerations: [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
      collisionSerials: [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
      impulseNs: Math.abs(max),
      otherEntityId: 'wall',
    }));
    row.damageAfter = structuredClone(row.damageBefore);
    row.setupWrites = Array.from({ length: 20 }, () => ({
      stage: 'LABELED_MOVING_BLOCKER_SETUP',
      nativeSerial: Number.MAX_SAFE_INTEGER,
      velocityMps: { x: max, y: max, z: max },
      degrees: max,
    }));
    row.nativeIdentity = {
      entityId: 'subject',
      handle: Number.MAX_SAFE_INTEGER,
      generation: Number.MAX_SAFE_INTEGER,
    };
    row.movingBlocker = row.blocked.before.other;
    row.history = Array.from({ length: 4 }, (_, index) => ({
      ...row.history[0],
      requestedTick: 391 + index,
      acceptedTick: 391 + index,
      bodyGeneration: Number.MAX_SAFE_INTEGER,
      validatedTick: 390,
      before: row.noPoint.before.subject,
      placement: {
        ...row.recovered.record.placement,
        after: row.recovered.after.subject,
        failure: '\0'.repeat(512),
      },
    }));
    for (const record of row.history) {
      record.operationId = actualRecoveryOperationId(row.context, record);
      record.pointId = actualRecoveryPointId(record);
    }
    row.historyBytes = Buffer.byteLength(JSON.stringify(row.history));
    row.cleanup.causes = Array.from({ length: 32 }, () => ({
      category: '\0'.repeat(64),
      message: encodeDiagnosticText('\0'.repeat(2048)),
    }));
    row.latestCallback = {
      stage: 'LABELED_MOVING_BLOCKER_SETUP',
      requestMs: max,
      stamp: max,
      readMs: max,
      previousStamp: max,
      nativeBefore: 780,
      nativeAfter: 780,
    };
  }
  for (const row of report.cases) {
    row.error = functionalPrimaryCause('\0'.repeat(4096));
    row.staleGeneration.error = functionalPrimaryCause('\0'.repeat(4096));
    for (const boundary of ['repeat', 'remapOld', 'auto', 'staleHud']) {
      row[boundary].historyBefore = JSON.stringify(
        row.history.slice(0, boundary === 'auto' || boundary === 'staleHud' ? 3 : 2),
      );
      row[boundary].historyAfter = row[boundary].historyBefore;
    }
  }
  report.error = functionalPrimaryCause('\0'.repeat(4096));
  report.ownership.causes = Array.from({ length: 32 }, () => ({
    category: '\0'.repeat(64),
    message: encodeDiagnosticText('\0'.repeat(2048)),
  }));
  report.gpu = '\0'.repeat(4096);
  report.startedAt = '2026-10-07T01:02:58.457Z';
  Object.assign(report.identity, { captureId: '20261007T010258457Z', backend: 'WEBGL2' });
  for (const row of report.cases) {
    row.firstWorldAt = '2026-10-07T01:02:58.457Z';
    Object.assign(row.cleanup, {
      controllerVehicles: 0,
      authorityVehicles: 0,
      damageHistory: 0,
      filterDisposed: true,
      omittedCauses: 0,
    });
  }
  report.css = [1920, 1080];
  report.internal = [1920, 1080];
  report.foreground = true;
  report.dpr = 1;
  const caseReadbacks = [
    'driveListeners',
    'recoveryListeners',
    'recoveryNodes',
    'nativeBodies',
    'nativeSubscriptions',
    'nativeColliders',
    'recoveryPorts',
    'controllerVehicles',
    'authorityVehicles',
    'damageHistory',
    'filterDisposed',
    'domConnected',
  ];
  assert.equal(caseReadbacks.length, 12);
  for (const capturedCases of [1, 2]) {
    const supported = structuredClone(report);
    supported.status = 'INCOMPLETE';
    supported.cases = supported.cases.slice(0, capturedCases);
    // runtime records every primary/dispose/readback cause then throws life.failed:
    // the next class cannot start. Intentionally caught staleGeneration.error remains.
    if (capturedCases === 2) {
      supported.cases[0].cleanup.causes = [];
      supported.cases[0].cleanup.totalCauses = 0;
      supported.cases[0].cleanup.omittedCauses = 0;
      delete supported.cases[0].error; // Only the case's outer failing catch writes this field.
    }
    const last = supported.cases.at(-1);
    last.status = 'INCOMPLETE';
    for (const name of caseReadbacks)
      last.cleanup[name] = { readbackError: functionalPrimaryCause('\0'.repeat(4096)) };
    for (const name of ['sceneDisposed', 'meshes', 'materials', 'engineScenes'])
      supported.backendCleanup[name] = { readbackError: functionalPrimaryCause('\0'.repeat(4096)) };
    const bytes = Buffer.byteLength(JSON.stringify(supported));
    console.log(
      JSON.stringify({
        kind: '030_PURE_SUPPORTED_FAILURE_WORST_DTO_NOT_HARDWARE',
        capturedCases,
        caseReadbacks: caseReadbacks.length,
        backendReadbacks: 4,
        bytes,
        cap: FUNCTIONAL.reportBytes,
        rowsPerClass: FUNCTIONAL.maximumRows,
        keysPerClass: FUNCTIONAL.maximumKeys,
        curvePerClass: FUNCTIONAL.maximumCurve,
        caseKeys: Object.keys(last).sort(),
      }),
    );
    functionalJsonBoundary(supported);
    assert(
      bytes < FUNCTIONAL.reportBytes,
      'Supported complete raw failure DTO exceeds2MiB: ' + bytes,
    );
  }
  // Channel overflow is explicit failure, never a dropped observation.
  const over = validPureReport({ ...identity, archivedAt: '2026-10-06T00:00:00Z' });
  over.cases[0].rows.push(over.cases[0].rows[0]);
  assert.throws(() =>
    validateFunctional(over, { ...identity, archivedAt: '2026-10-06T00:00:00Z' }),
  );
});

test('callback endpoint survives guard failure with full actual prefix, no clipped invalid delta', async () => {
  const { observeFunctionalCallback } =
    await import('../browser/vehicle-recovery-after/functional-callback.ts');
  let captured = null,
    clock = 100;
  await assert.rejects(async () => {
    const row = await observeFunctionalCallback(
      {
        now: () => clock++,
        nativeSerial: () => 574,
        next: async () => 1900,
        retain: (value) => {
          captured = value;
        },
      },
      'NATIVE_FAULT',
      1000,
    );
    assert(row.stamp - row.previousStamp <= 250, 'Actual debt guard');
  });
  assert.equal(captured.stamp, 1900);
  assert.equal(captured.previousStamp, 1000);
  assert.equal(captured.nativeBefore, 574);
  assert.equal(captured.nativeAfter, 574);
});
test('acquired backend is owned before throwing engine read; disposal and readback errors retain original', () => {
  const life = createHarnessLifetime();
  let disposed = 0,
    readbacks = 0;
  const backend = {
    dispose() {
      disposed++;
    },
    getEngine() {
      throw new Error('engine read');
    },
  };
  try {
    life.own('backend', () => backend.dispose());
    backend.getEngine();
  } catch (error) {
    life.record('primary', error);
  }
  life.dispose();
  try {
    readbacks++;
    throw new Error('cleanup readback');
  } catch (error) {
    life.record('readback', error);
  }
  life.dispose();
  assert.equal(disposed, 1);
  assert.equal(readbacks, 1);
  assert.equal(life.snapshot().totalCauses, 2);
  assert.match(life.snapshot().causes[0].message, /engine read/);
});
