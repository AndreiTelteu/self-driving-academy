// SOURCE-only separately namespaced CURRENT_OWNER_SUPPORTED calibration; never originalbaseline data.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import {
  createVehicleController,
  parseVehicleCommand,
  vehicleClass,
  tractiveForceN,
} from '../src/vehicles/index.ts';
import { createRapierProbe } from '../src/vehicles/rapier/index.ts';
import {
  createControlAuthority,
  createModeControls,
  createVehicleSelection,
} from '../src/input/index.ts';
import { createManualSegmentBridge } from '../src/app/index.ts';
import {
  createInterventionRecordStore,
  createInterventionEventTransport,
  createInterventionIntake,
  parseTelemetrySample,
} from '../src/telemetry/index.ts';
import {
  bodySnapshot,
  sameNativeSnapshot,
} from '../tests/input/vehicle-selection-native-guard-v2.ts';
import {
  nativeReferenceSample,
  referenceTime,
} from '../tests/telemetry/manual-segments-reference.ts';
import {
  createAfterResourceScope,
  retireHealthyAfterFailure,
} from '../tests/telemetry/manual-segments-after.ts';
import {
  immutableJson,
  sha256,
  PINNED_BEFORE,
  validateSuccessfulDiagnostics,
} from './manual-segments-after-records.mjs';
import {
  CALIBRATION_CLOSURE,
  validateCheckedProduct,
  REUSE_PRODUCT_SHA,
  REUSE_PRODUCT_RECEIPT,
  validateCalibrationClosure,
  validateOwnerIntake,
  validateOwnerTiming,
  serializeDiagnostic,
} from './manual-segments-calibration-proof.mjs';
const checked = JSON.parse(
  await readFile('Docs/Evidence/069-manual-segments/optimization-checks-01/results-final.json'),
);
validateCheckedProduct(checked, REUSE_PRODUCT_SHA);
for (const row of checked.source) {
  const bytes = await readFile(row.path);
  assert.equal(bytes.length, row.bytes);
  assert.equal(sha256(bytes), row.sha256, 'Checked product binding before native acquisition');
}
import {
  verifyArchiveProofChild,
  preflightFailureArtifact,
} from './manual-segments-archive-closure.mjs';
const expected = 'C:/Users/aandr/Sites/self-driving-academy/.worktrees/manual-segments-01';
assert.equal(resolve('.').replaceAll('\\', '/'), expected);
assert.equal(
  execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
  'loop-pbi/manual-segments-01',
);
assert.equal(
  execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' })
    .trim()
    .replaceAll('\\', '/'),
  expected,
);
assert.equal(
  execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  'd8e5756c9e06ab091587b58aa6549f2a977c30aa',
);
const root = 'Docs/Evidence/069-manual-segments/native-owner-calibration-01';
await mkdir(root, { recursive: false });
const startedAt = new Date().toISOString();
await immutableJson(root + '/started.json', {
  startedAt,
  scope: 'CURRENT_OWNER_SUPPORTED_32_SAMPLES_0_EVENTS_SYNTHETIC_CONTEXT_NATIVE_PHYSICAL_FIELDS',
});
const paths = [
  ...new Set([
    ...execFileSync('rg', ['--files', 'src'], { encoding: 'utf8' })
      .trim()
      .split(/\r?\n/)
      .map((p) => p.replaceAll('\\', '/')),
    ...CALIBRATION_CLOSURE,
    REUSE_PRODUCT_RECEIPT,
    ...checked.source.map((row) => row.path),
  ]),
].sort();
validateCalibrationClosure(paths, checked);
const inputs = [],
  hash = createHash('sha256');
for (const path of paths) {
  const data = await readFile(path);
  hash.update(path).update(data);
  const archiveRelativePath = 'source/' + path;
  await mkdir(dirname(root + '/' + archiveRelativePath), { recursive: true });
  await writeFile(root + '/' + archiveRelativePath, data, { flag: 'wx' });
  inputs.push({ path, archiveRelativePath, bytes: data.length, sha256: sha256(data) });
}
const nativeData = await readFile(fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat')));
assert.equal(sha256(nativeData), PINNED_BEFORE.nativeSha256);
assert.equal(nativeData.length, PINNED_BEFORE.nativeBytes);
await mkdir(root + '/native');
await writeFile(root + '/native/rapier.mjs', nativeData, { flag: 'wx' });
const sourceHash = hash.digest('hex'),
  archivedAt = new Date().toISOString();
await immutableJson(root + '/manifest.json', {
  checkedProductReceipt: REUSE_PRODUCT_RECEIPT,
  checkedProductFingerprint: REUSE_PRODUCT_SHA,
  startedAt,
  archivedAt,
  sourceHash,
  inputs,
  native: {
    sha256: sha256(nativeData),
    bytes: nativeData.length,
    archiveRelativePath: 'native/rapier.mjs',
  },
  classes: ['sedan', 'compact'],
  worldCars: 70,
  ticks: 34,
  samples: 32,
  recordEvents: 0,
  scope: 'CURRENT_OWNER_SUPPORTED_NOT_ORIGINAL24WORLD_COMPARISON',
  recordCap: 65536,
  boundaryGateMs: 5.5,
});
await mkdir(root + '/worlds');
function fill(sample, sizeOf, cap) {
  const s = structuredClone(sample);
  s.context.conflictEntityIds = Array.from({ length: 8 }, (_, i) => 'synthetic-slot-' + i);
  for (let i = 0; i < 8; i++) {
    const prefix = s.context.conflictEntityIds[i];
    let low = 0,
      high = 256 - prefix.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      s.context.conflictEntityIds[i] = prefix + '"'.repeat(mid);
      if (sizeOf(s) <= cap) low = mid;
      else high = mid - 1;
    }
    s.context.conflictEntityIds[i] = prefix + '"'.repeat(low);
  }
  for (let i = 0; i < 8; i++)
    while (s.context.conflictEntityIds[i].length < 256 && sizeOf(s) < cap) {
      s.context.conflictEntityIds[i] += 'x';
      if (sizeOf(s) > cap) {
        s.context.conflictEntityIds[i] = s.context.conflictEntityIds[i].slice(0, -1);
        break;
      }
    }
  assert(sizeOf(s) <= cap);
  return parseTelemetrySample(s);
}
try {
  verifyArchiveProofChild(root);
} catch (error) {
  try {
    await immutableJson(root + '/failure.json', {
      stage: 'ARCHIVED_IMPORT_CLOSURE',
      sourceHash,
      failedAt: new Date().toISOString(),
      ...preflightFailureArtifact(error),
    });
  } catch (exportError) {
    throw new AggregateError([error, exportError], 'Calibration closure/export failure', {
      cause: exportError,
    });
  }
  throw error;
}
let firstWorldAt = null;
try {
  for (const classId of ['sedan', 'compact']) {
    const resources = createAfterResourceScope(),
      progress = {
        classId,
        sourceHash,
        startedAt: new Date().toISOString(),
        phase: 'RUNNING',
        attemptedTick: 0,
        acceptedTick: 0,
        nativeSerial: 0,
        samples: [],
        record: null,
        primary: null,
        cleanup: null,
        boundary: null,
      };
    await immutableJson(root + '/worlds/' + classId + '.started.json', {
      classId,
      sourceHash,
      startedAt: progress.startedAt,
    });
    let world = null,
      bridge = null,
      authority = null,
      cause = null,
      primary,
      failed = false,
      retainedDescriptor = null,
      acceptedReceipt = null;
    try {
      if (firstWorldAt === null) {
        firstWorldAt = new Date().toISOString();
        await immutableJson(root + '/first-world.json', { firstWorldAt, sourceHash });
      }
      world = await createRapierProbe();
      resources.own(
        'world',
        () => world.dispose(),
        () => ({ body: world.bodyResources(), collision: world.collisionResources() }),
      );
      for (let i = 0; i < 70; i++)
        world.addClassCar(
          'car-' + i,
          { x: (i % 10) * 3, y: 0.8, z: Math.floor(i / 10) * 6 },
          classId,
        );
      const ids = Array.from({ length: 70 }, (_, i) => world.bodyIdentity('car-' + i)),
        identity = ids[0],
        context = {
          schemaVersion: 1,
          units: 'SI',
          sessionId: 'owner-calibration-' + classId,
          worldEpoch: 0,
        };
      const controller = createVehicleController(context, world, 0, {
        drivetrainVersion: '027-braking-reverse-v1',
      });
      resources.own(
        'controller',
        () => controller.dispose(),
        () => controller.getStats(),
      );
      authority = createControlAuthority(context, controller, {
        bodyIdentity: (id) => world.bodyIdentity(id),
        clearOldPlayer: () => undefined,
      });
      resources.own(
        'authority',
        () => authority.dispose(),
        () => authority.getStats(),
      );
      for (const id of ids) authority.register(id);
      const store = createInterventionRecordStore(context);
      resources.own(
        'store',
        () => store.dispose(),
        () => store.getStats(),
      );
      const events = createInterventionEventTransport(context);
      resources.own(
        'events',
        () => events.dispose(),
        () => events.getStats(),
      );
      const intake = createInterventionIntake(context);
      resources.own(
        'intake',
        () => intake.dispose(),
        () => intake.getStats(),
      );
      const target = {
        ...context,
        version: '069-intervention-target-v1',
        playerId: 'player',
        profileId: 'profile',
        baseVersionId: 'base',
        learningEpoch: 0,
        controlPreferencesVersion: 'keys',
        engineVersion: 'engine',
        mapVersion: 'map',
        inputType: 'KEYBOARD',
        learningEligible: true,
      };
      bridge = createManualSegmentBridge(context, 'calibration', authority, {
        bodyIdentity: (id) => world.bodyIdentity(id),
        readTarget: () => target,
        preparedTarget: () => null,
        preparedCause: (id) => (cause?.operationId === id ? cause : null),
        records: store.port,
        events: events.port,
        reserveIntake: (d) => {
          intake.reserve(d);
          retainedDescriptor = d;
        },
        rejectIntake: (id) => intake.reject(id),
        acceptIntake: (d) => {
          acceptedReceipt = intake.accept(d);
          return acceptedReceipt;
        },
        inspectIntake: (id) => intake.inspect(id),
        acknowledgeIntake(id) {
          const r = intake.inspect(id);
          assert(r?.accepted);
          intake.acknowledge(r);
        },
        inspectIntakeRelease: (id) => intake.inspectRelease(id),
      });
      resources.own(
        'bridge',
        () => bridge.dispose(),
        () => bridge.getStats(),
      );
      const modes = createModeControls(context, {
        readAuthority: () => authority.getStats(),
        selectedIdentity: () => identity,
        bodyIdentity: (id) => world.bodyIdentity(id),
      });
      resources.own(
        'modes',
        () => modes.dispose(),
        () => modes.getStats(),
      );
      const selection = createVehicleSelection(context, {
        readAuthority: () => authority.getStats(),
        bodyIdentity: (id) => world.bodyIdentity(id),
        readPresentation: (id) => ({ identity: id, kind: 'TAXI', visible: true, selectable: true }),
        readCameraTarget: () => identity,
        selectCamera: () => {
          throw Error('No camera switch calibration');
        },
        clearInput: () => modes.clear(),
        readAssignment: (id) => ({
          context,
          identity: id,
          routeFingerprint: 'calibration',
          tripFingerprint: 'calibration',
        }),
        ...bridge.selectionBoundary,
      });
      resources.own(
        'selection',
        () => selection.dispose(),
        () => selection.getStats(),
      );
      selection.register(identity, 'TAXI');
      bridge.bind(modes, selection);
      let authorityMs = 0,
        postPhysical = null,
        priorVelocity = world.readBody(identity).velocityMps;
      const step = authority.step;
      authority.step = (...args) => {
        const begin = performance.now();
        const result = step(...args);
        authorityMs = performance.now() - begin;
        postPhysical = bodySnapshot(world, ids);
        return result;
      };
      for (let t = 1; t <= 34; t++) {
        progress.attemptedTick = t;
        if (t === 1) modes.enqueue('L');
        if (t === 34) modes.enqueue('L');
        const packet = {
          identity,
          command: parseVehicleCommand({
            ...context,
            vehicleId: identity.entityId,
            tick: t,
            source: 'PLAYER',
            throttle: 0,
            brake: 0,
            steering: 0,
            handbrake: false,
            turnSignal: 'OFF',
          }),
        };
        const begin = performance.now(),
          result = bridge.step(
            referenceTime(context, t, '066-control-authority-v1'),
            [packet],
            undefined,
            true,
          ),
          end = performance.now();
        progress.acceptedTick = result.frame.tick;
        progress.nativeSerial = world.collisionStepSerial();
        assert.equal(progress.nativeSerial, t);
        assert(postPhysical);
        sameNativeSnapshot(world, ids, postPhysical, t);
        const currentBody = world.readBody(identity),
          q = currentBody.transform.rotationQuaternion,
          delta = {
            x: (currentBody.velocityMps.x - priorVelocity.x) * 60,
            y: (currentBody.velocityMps.y - priorVelocity.y) * 60,
            z: (currentBody.velocityMps.z - priorVelocity.z) * 60,
          };
        priorVelocity = currentBody.velocityMps;
        const forward = {
            x: 2 * (q.x * q.z + q.w * q.y),
            y: 2 * (q.y * q.z - q.w * q.x),
            z: 1 - 2 * (q.x * q.x + q.y * q.y),
          },
          right = {
            x: 1 - 2 * (q.y * q.y + q.z * q.z),
            y: 2 * (q.x * q.y + q.w * q.z),
            z: 2 * (q.x * q.z - q.w * q.y),
          };
        if (t === 34) {
          const closed = bridge.lifecycle.observe().lastClosed;
          assert(closed);
          progress.record = store.port.read(closed.segmentId);
          progress.boundary = {
            timingScope:
              'ACTUAL_BRIDGE_OPERATION_MINUS_AUTHORITY_WITH_INCLUDED_NATIVE_READBACK_OBSERVER',
            bridgeStartedAtMs: begin,
            bridgeEndedAtMs: end,
            bridgeTotalMs: end - begin,
            actualAuthorityMs: authorityMs,
            wholeOwnerMs: end - begin - authorityMs,
            closed: closed,
            recordBytes: Buffer.byteLength(JSON.stringify(progress.record)),
            supportedMaximum:
              Buffer.byteLength(JSON.stringify(progress.record)) === 65536
                ? 'EXACT64KIB'
                : 'HIGHEST_LEGAL_REACHED_NOT_ASSUMED64KIB',
            intake: intake.getStats(),
            descriptor: intake.read(retainedDescriptor?.operationId),
            receipt: intake.inspect(retainedDescriptor?.operationId),
            reservedDescriptor: retainedDescriptor,
            acceptedReceipt,
            events: events.getStats(),
            owner: bridge.lifecycle.observe(),
          };
          validateOwnerTiming(progress.boundary);
          validateOwnerIntake(
            progress.record,
            progress.boundary.descriptor,
            progress.boundary.receipt,
            progress.boundary.owner,
          );
          assert.deepEqual(progress.boundary.descriptor, retainedDescriptor);
          assert.equal(progress.boundary.receipt, acceptedReceipt);
          break;
        }
        if (t >= 2) {
          const native = world.readBody(identity),
            config = vehicleClass(classId),
            command = result.frame.controls.find((c) => c.identity === identity).command;
          let sample = nativeReferenceSample(context, {
            tick: t,
            identity,
            mode: 'LEARNING',
            classId,
            baseVersionId: 'base',
            transform: native.transform,
            velocityMps: native.velocityMps,
            command,
            rawInput: { throttle: 0, brake: 0, steering: 0, handbrake: false },
            longitudinalAccelerationMps2:
              delta.x * forward.x + delta.y * forward.y + delta.z * forward.z,
            lateralAccelerationMps2: delta.x * right.x + delta.y * right.y + delta.z * right.z,
            capabilities: {
              maxAccelerationMps2:
                tractiveForceN(config, Math.hypot(...Object.values(native.velocityMps))) /
                config.massKg,
              maxDecelerationMps2: config.brakeAcceleration,
              maxLateralAccelerationMps2: config.grip * 9.81,
            },
            incident: world.contacts() > 0,
          });
          const current = store.port.read(bridge.lifecycle.observe().active.segmentId);
          sample = fill(
            sample,
            (s) =>
              t === 33
                ? Buffer.byteLength(
                    JSON.stringify({
                      ...current,
                      samples: [...current.samples, s],
                      endTick: 34,
                      closeReason: 'MODE_CHANGE',
                      completeness: 'CLOSED',
                    }),
                  )
                : Buffer.byteLength(JSON.stringify(s)),
            t === 33 ? 65536 : 1950,
          );
          bridge.lifecycle.appendSample(identity, sample);
          progress.samples.push({
            tick: t,
            nativeSerial: world.collisionStepSerial(),
            body: native,
            command,
            syntheticContext: sample.context,
          });
        }
      }
      cause = {
        ...context,
        version: '069-admitted-cause-v1',
        operationId: 'shutdown',
        timing: 'AT_LAST_ACCEPTED_TICK',
        tick: 34,
        identity: authority.getStats().seat.identity,
        reason: 'SHUTDOWN',
      };
      bridge.lifecycle.retire(cause);
      assert.equal(world.collisionStepSerial(), 34);
      progress.phase = 'COLLECTED';
    } catch (error) {
      primary = error;
      failed = true;
      progress.primary = serializeDiagnostic(error);
    } finally {
      if (failed && bridge)
        try {
          progress.failureRetirement = retireHealthyAfterFailure(bridge, () => {
            const a = authority.getStats();
            cause = {
              ...a.context,
              version: '069-admitted-cause-v1',
              operationId: 'failure-shutdown',
              timing: 'AT_LAST_ACCEPTED_TICK',
              tick: a.tick,
              identity: a.seat?.identity ?? null,
              reason: 'SHUTDOWN',
            };
            return cause;
          });
        } catch (error) {
          primary = new AggregateError([primary, error], 'Calibration original/retirement');
        }
      try {
        progress.cleanup = resources.close();
      } catch (error) {
        primary = new AggregateError(
          [...(failed ? [primary] : []), error],
          'Calibration original/scope cleanup',
        );
        failed = true;
        progress.cleanup = {
          attempts: [],
          snapshots: {},
          errors: [serializeDiagnostic(error)],
          causes: [],
        };
      }
      if (progress.cleanup.causes.length) {
        primary = new AggregateError(
          [...(failed ? [primary] : []), ...progress.cleanup.causes],
          'Calibration original/cleanup',
        );
        failed = true;
      }
      progress.terminalErrors = failed ? serializeDiagnostic(primary) : null;
      progress.completedAt = new Date().toISOString();
      progress.phase = failed ? 'FAIL' : 'COLLECTED';
      try {
        await immutableJson(root + '/worlds/' + classId + '.raw.json', progress);
      } catch (exportError) {
        primary = new AggregateError(
          [...(failed ? [primary] : []), exportError],
          'Calibration original/cleanup/raw-export',
        );
        failed = true;
      }
    }
    if (failed) throw primary;
    validateSuccessfulDiagnostics(progress, 'phase', 'COLLECTED');
    assert.equal(progress.record.samples.length, 32);
    assert.equal(progress.record.events.length, 0);
    validateOwnerTiming(progress.boundary);
    assert.equal(progress.boundary.intake.entries, 1);
    assert.equal(progress.cleanup.errors.length, 0);
  }
  await immutableJson(root + '/complete.json', {
    status: 'PASS_CURRENT_OWNER_SUPPORTED',
    sourceHash,
    startedAt,
    archivedAt,
    firstWorldAt,
    completedAt: new Date().toISOString(),
    worlds: 2,
  });
} catch (error) {
  try {
    await immutableJson(root + '/failure.json', {
      failedAt: new Date().toISOString(),
      sourceHash,
      error: serializeDiagnostic(error),
    });
  } catch (exportError) {
    throw new AggregateError([error, exportError], 'Calibration original/export', {
      cause: exportError,
    });
  }
  throw error;
}
