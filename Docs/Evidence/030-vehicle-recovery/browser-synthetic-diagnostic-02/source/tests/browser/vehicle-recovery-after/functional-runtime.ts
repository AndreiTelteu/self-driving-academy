import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { createRapierProbe } from '../../../src/vehicles/rapier';
import {
  createVehicleController,
  createVehicleDamage,
  createCollisionEpisodes,
  createKeyboardFilter,
  vehicleClass,
} from '../../../src/vehicles';
import { createControlAuthority, bindKeyboardDriveInput } from '../../../src/input';
import { createVehicleRecoveryFeature } from '../../../src/app';
import { createRecoveryRoadProvider } from '../../../src/app/vehicle-recovery-road';
import { createEventBus } from '../../../src/simulation';
import { createDefaultSettings } from '../../../src/settings';
import { parseInterventionSegment } from '../../../src/telemetry';
import { createRenderingBackend } from '../../../src/rendering/babylon/backend';
import { createHarnessLifetime } from '../vehicle-damage/hardware-lifetime';
import { ownPresentationLatch } from './browser-observation';
import { recoveryRoadFixture } from './road-fixture';
import { FUNCTIONAL, trustedEdge, functionalCheck as check } from './functional-proof';
import { encodeDiagnosticOwnership, functionalPrimaryCause } from './functional-diagnostic';
import { acquireFunctionalNative } from './functional-native-instrumentation';
import { observeFunctionalCallback } from './functional-callback';

/** Synthetic setup is labeled. R requests originate exclusively in actual production key binding. */
export async function runTrustedFunctional(
  preference: 'AUTO' | 'WEBGL2',
  progress: (text: string) => void,
) {
  const root = createHarnessLifetime(),
    presentation = ownPresentationLatch(window, document, (label, release) =>
      root.own(label, release),
    );
  const post = async (path: string, value: unknown) => {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    check(bytes.byteLength <= FUNCTIONAL.reportBytes, 'Bounded functional2MiB body');
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bytes,
    });
    if (!response.ok)
      throw new Error('Functional export ' + response.status + ' ' + (await response.text()));
    return response.json();
  };
  let captureId: string | undefined,
    backend: Awaited<ReturnType<typeof createRenderingBackend>> | undefined;
  const cases: Record<string, unknown>[] = [],
    report: Record<string, unknown> = {
      version: FUNCTIONAL.version,
      status: 'INCOMPLETE',
      cases,
      startedAt: new Date().toISOString(),
    };
  try {
    const build = await (await fetch('/build')).json();
    const start = await post('/functional/start', {
      preference,
      sourceHash: build.sourceHash,
      artifactHash: build.artifactHash,
      nativeHash: build.nativeHash,
    });
    captureId = start.captureId;
    report.identity = {
      captureId,
      backend: start.backend,
      sourceHash: build.sourceHash,
      artifactHash: build.artifactHash,
      nativeHash: build.nativeHash,
    };
    backend = await createRenderingBackend(
      document.getElementById('canvas') as HTMLCanvasElement,
      preference,
    );
    const owned = backend;
    root.own('backend', () => {
      owned.dispose();
    });
    const engine = owned.scene.getEngine();
    let lost = false;
    const observer = engine.onContextLostObservable.add(() => {
      lost = true;
    });
    root.own('contextObserver', () => engine.onContextLostObservable.remove(observer));
    engine.setHardwareScalingLevel(1);
    owned.resize();
    const gpu = JSON.stringify(
      'getInfo' in engine ? (engine as unknown as { getInfo(): unknown }).getInfo() : null,
    );
    check(gpu.length <= 4096, 'Bounded actual GPU metadata, no silent clipping');
    const guard = () =>
      check(
        !presentation.lost &&
          !lost &&
          document.hasFocus() &&
          document.visibilityState === 'visible' &&
          devicePixelRatio === 1 &&
          owned.canvas.clientWidth === 1920 &&
          owned.canvas.clientHeight === 1080 &&
          engine.getRenderWidth() === 1920 &&
          engine.getRenderHeight() === 1080,
        'Actual functional presentation',
      );
    check(
      owned.rendererKind === start.backend &&
        /AMD/i.test(gpu) &&
        !/swiftshader|llvmpipe/i.test(gpu),
      'Actual requested AMD backend',
    );
    Object.assign(report, {
      gpu,
      dpr: devicePixelRatio,
      css: [owned.canvas.clientWidth, owned.canvas.clientHeight],
      internal: [engine.getRenderWidth(), engine.getRenderHeight()],
      foreground: true,
    });
    for (const [ordinal, classId] of (['sedan', 'compact'] as const).entries()) {
      const life = createHarnessLifetime(),
        row: Record<string, unknown> = {
          classId,
          status: 'INCOMPLETE',
          setupWrites: [],
          rows: [],
          keys: [],
          supportCurve: [],
          lifetimes: [],
        };
      cases.push(row);
      let world: Awaited<ReturnType<typeof createRapierProbe>> | undefined;
      let feature: ReturnType<typeof createVehicleRecoveryFeature> | undefined;
      let controller: ReturnType<typeof createVehicleController> | undefined;
      let authority: ReturnType<typeof createControlAuthority> | undefined;
      let damage: ReturnType<typeof createVehicleDamage> | undefined;
      let filter: ReturnType<typeof createKeyboardFilter> | undefined;
      let container: HTMLDivElement | undefined;
      const caseReaders: Record<string, () => unknown> = {};
      const rows: Record<string, unknown>[] = [],
        keys: Record<string, unknown>[] = [],
        curve: Record<string, unknown>[] = [],
        lifetimes: Record<string, unknown>[] = [];
      Object.assign(row, { rows, keys, supportCurve: curve, lifetimes });
      try {
        guard();
        const firstWorldAt = new Date().toISOString();
        report.firstWorldAt ??= firstWorldAt;
        row.firstWorldAt = firstWorldAt;
        const nativeAcquisition = await acquireFunctionalNative();
        world = nativeAcquisition.world;
        const physics = world;
        life.own('world', () => physics.dispose());
        physics.addClassCar('subject', { x: 0, y: 0.75, z: 0 }, classId);
        physics.addClassCar('other', { x: 8, y: 0.75, z: 0 }, classId);
        const wall = physics.addNamedBox('wall', { x: 0, y: 1, z: 10 }, { x: 4, y: 1, z: 0.05 });
        row.collisionIdentities = ['subject', 'other', 'wall'].map((id) =>
          physics.collisionIdentity(id),
        );
        // Explicit setup settling; not a measured performance window or nominal cadence assertion.
        for (let i = 0; i < 180; i++) physics.step(new Map(), false);
        const context = {
          schemaVersion: 1 as const,
          units: 'SI' as const,
          sessionId: '030-trusted-functional',
          worldEpoch: ordinal,
        };
        const subject = physics.bodyIdentity('subject')!,
          other = physics.bodyIdentity('other')!;
        Object.assign(row, {
          vehicleId: subject.entityId,
          generation: subject.generation,
          nativeIdentity: subject,
          context,
        });
        damage = createVehicleDamage(context, physics);
        const d = damage;
        life.own('damage', () => d.dispose());
        d.register(subject, vehicleClass(classId).massKg);
        controller = createVehicleController(context, physics, 0, { availability: d });
        const c = controller;
        life.own('controller', () => c.dispose());
        authority = createControlAuthority(context, c, physics);
        const a = authority;
        life.own('authority', () => a.dispose());
        a.register(subject);
        const episodes = createCollisionEpisodes(context, physics.collisionSource);
        life.own('episodes', () => episodes.dispose());
        const bus = createEventBus(context);
        life.own('eventBus', () => bus.dispose());
        const settings = createDefaultSettings('030-trusted-functional');
        filter = createKeyboardFilter(context, subject.entityId, settings.input.control);
        const input = filter;
        life.own('025filter', () => input.dispose());
        let allowDriving = false,
          allowR = false,
          at = 0,
          stage = 'SETUP',
          recoveryCode = 'KeyR',
          pendingEdge: Record<string, unknown> | null = null;
        const drive = bindKeyboardDriveInput({
          surface: owned.canvas,
          bindings: settings.input.bindings,
          port: input,
          enabled: () => allowDriving,
        });
        life.own('025binding', () => drive.dispose());
        caseReaders.driveListeners = () => drive.getStats().listeners;
        const captureKey = (event: KeyboardEvent) => {
          if (keys.length >= FUNCTIONAL.maximumKeys) {
            life.record('keyCapacity', 'Bounded key ledger exhausted');
            return;
          }
          const seat = a.getStats().seat;
          const edge = {
            type: event.type,
            code: event.code,
            repeat: event.repeat,
            isTrusted: event.isTrusted,
            readMs: performance.now(),
            tick: a.getStats().tick,
            vehicleId: seat?.identity.entityId ?? null,
            generation: seat?.identity.generation ?? null,
            stage,
          };
          keys.push(edge);
          if (
            allowR &&
            stage !== 'AUTO_REJECT' &&
            event.type === 'keydown' &&
            event.code === recoveryCode &&
            !event.repeat
          ) {
            try {
              trustedEdge(
                edge,
                { tick: at, vehicleId: subject.entityId, generation: subject.generation },
                recoveryCode,
              );
              pendingEdge = edge;
            } catch (error) {
              life.record('trustedInput', error);
            }
          }
        };
        document.addEventListener('keydown', captureKey, true);
        life.own('trustedKeyDown', () => document.removeEventListener('keydown', captureKey, true));
        document.addEventListener('keyup', captureKey, true);
        life.own('trustedKeyUp', () => document.removeEventListener('keyup', captureKey, true));
        container = document.createElement('div');
        const dom = container;
        life.own('container', () => dom.remove());
        dom.style.cssText =
          'position:fixed;left:8px;bottom:8px;z-index:20;background:white;padding:8px';
        document.body.append(dom);
        let segment = parseInterventionSegment({
          ...context,
          segmentId: 'actual-open-' + classId,
          vehicleId: 'subject',
          controlMode: 'MANUAL',
          learningEligible: false,
          playerId: 'operator',
          profileId: 'profile',
          baseVersionId: 'base',
          learningEpoch: 0,
          controlPreferencesVersion: '025-keyboard-v1',
          startTick: 0,
          endTick: null,
          closeReason: null,
          engineVersion: '030-current',
          mapVersion: recoveryRoadFixture().graph.mapId,
          inputType: 'KEYBOARD',
          samples: [],
          events: [],
          completeness: 'OPEN',
        });
        const order: string[] = [],
          events: unknown[] = [];
        row.deliveryOrder = order;
        row.events = events;
        let injectedDeliveryFailure = false,
          deliveryAttempts = 0;
        const observed = Object.freeze({
          ...c,
          invalidateRealization: (
            ...args: Parameters<NonNullable<typeof c.invalidateRealization>>
          ) => {
            order.push('027');
            c.invalidateRealization!(...args);
          },
        });
        let latestTracking: { nativeSerial: number; status: string; transform: unknown } | null =
          null;
        const observedPhysics = {
          ...physics,
          createRecoveryPort: (ctx: typeof context) => {
            const port = physics.createRecoveryPort!(ctx);
            return Object.freeze({
              ...port,
              inspectPlacement: (request: Parameters<typeof port.inspectPlacement>[0]) => {
                const result = port.inspectPlacement(request);
                latestTracking = {
                  nativeSerial: result.physicsStepSerial,
                  status: result.status,
                  transform: request.transform,
                };
                return result;
              },
            });
          },
        };
        const createFeature = () =>
          createVehicleRecoveryFeature({
            context,
            physics: observedPhysics,
            controller: observed,
            authority: a,
            damage: d,
            eventBus: bus,
            graph: recoveryRoadFixture().graph,
            segment: {
              read: () => segment,
              write: (_token, closed) => {
                deliveryAttempts++;
                if (injectedDeliveryFailure) {
                  injectedDeliveryFailure = false;
                  throw new Error('030 explicit005 before-acceptance delivery fault');
                }
                order.push('005');
                check(
                  c.readControl(subject) === undefined,
                  'Actual addressed invalidation precedes005',
                );
                check(
                  d.readDamage(subject).availability !== 'AVAILABLE',
                  '005 precedes029 restore',
                );
                segment = closed;
              },
            },
            clearAddressedInput: (token) => {
              check(token === subject, 'Exact025seat clear');
              order.push('025');
              input.clear();
            },
            surface: owned.canvas,
            bindings: settings.input.bindings,
            container: dom,
            enabled: () => allowR,
          });
        feature = createFeature();
        const actual = feature,
          releaseFeature = life.own('030feature', () => actual.dispose());
        caseReaders.recoveryListeners = () =>
          actual.getStats().input.listeners + actual.getStats().hud.listeners;
        caseReaders.recoveryNodes = () => actual.getStats().hud.nodes;
        actual.register(subject, 'TAXI');
        bus.subscribe((event) => {
          if (event.type === 'VEHICLE_RECOVERED') {
            check(events.length < 8, 'Bounded event observations');
            order.push('007');
            events.push(event);
            check(
              d.readDamage(subject).availability === 'AVAILABLE' &&
                segment.closeReason === 'RECOVERY',
              'Actual029/005 accepted before007',
            );
          }
        });
        const camera = new FreeCamera(
          '030-functional-camera',
          new Vector3(14, 12, -16),
          owned.scene,
        );
        life.own('camera', () => camera.dispose());
        camera.setTarget(new Vector3(0, 0, 4));
        owned.scene.activeCamera = camera;
        const meshes: ReturnType<typeof MeshBuilder.CreateBox>[] = [];
        for (const id of ['subject', 'other']) {
          const mesh = MeshBuilder.CreateBox(
            id,
            { width: 1.8, height: 0.8, depth: 4 },
            owned.scene,
          );
          life.own('mesh:' + id, () => mesh.dispose());
          meshes.push(mesh);
        }
        await owned.scene.whenReadyAsync();
        const draw = () => {
          for (const [index, id] of ['subject', 'other'].entries()) {
            const p = physics.project(id);
            meshes[index].position.set(p.position.x, p.position.y, p.position.z);
            meshes[index].rotationQuaternion = new Quaternion(
              p.rotation.x,
              p.rotation.y,
              p.rotation.z,
              p.rotation.w,
            );
          }
          owned.render();
        };
        let lastRaf: number | null = null;
        const raf = async () => {
          guard();
          const latest = await observeFunctionalCallback(
            {
              now: () => performance.now(),
              nativeSerial: () => physics.collisionStepSerial(),
              next: () => new Promise<number>((resolve) => window.requestAnimationFrame(resolve)),
              retain: (value) => {
                row.latestCallback = value;
              },
            },
            stage,
            lastRaf,
          );
          const stamp = latest.stamp;
          guard();
          if (lastRaf !== null)
            check(stamp - lastRaf >= 0 && stamp - lastRaf <= 250, 'Functional RAF gap');
          lastRaf = stamp;
          draw();
          life.throwIfFailed();
          return stamp;
        };
        let maxImpulse = 0;
        const incidents: unknown[] = [];
        row.incidents = incidents;
        const step = (requestedMode?: 'AUTO' | 'MANUAL') => {
          check(rows.length < FUNCTIONAL.maximumRows, 'Bounded actual native row ledger');
          drive.sync();
          actual.beforePhysicsTick();
          at++;
          const keyboard = input.step({
            tick: at,
            dtSeconds: 1 / 60,
            speedMps: physics.project('subject').speed,
          });
          const command =
            requestedMode === 'AUTO'
              ? { ...keyboard.command, source: 'AUTONOMY' as const }
              : keyboard.command;
          a.step(
            { ...context, version: '066-control-authority-v1', tick: at, dtSeconds: 1 / 60 },
            [{ identity: subject, command }],
            requestedMode
              ? [{ identity: subject, mode: requestedMode }]
              : at === 1
                ? [{ identity: subject, mode: 'MANUAL' }]
                : [],
          );
          const contacts = physics.readCollisionContacts();
          for (const contact of contacts.contacts)
            if (
              (contact.first.entityId === 'subject' && contact.second.entityId === 'wall') ||
              (contact.second.entityId === 'subject' && contact.first.entityId === 'wall')
            )
              maxImpulse = Math.max(maxImpulse, contact.impulseNs);
          episodes.update(at, contacts.contacts);
          const drain = episodes.drain((incident) => {
            check(incidents.length < 32, 'Bounded actual incident observations');
            incidents.push(incident);
            d.applyIncident(incident);
          });
          check(drain.status === 'drained', '028actualincident delivery');
          actual.afterPhysicsTick(at);
          if (at % 6 === 0) actual.syncHud();
          const p = physics.project('subject');
          rows.push({
            tick: at,
            nativeSerial: physics.collisionStepSerial(),
            heightM: p.position.y,
            speedMps: p.speed,
            wheelContacts: p.wheelContacts,
            rotation: p.rotation,
            suspension: p.suspension,
            raw: keyboard.raw,
            effective: c.readControl(subject)?.command,
            availability: d.readDamage(subject).availability,
          });
          return keyboard;
        };
        const advance = async (count: number) => {
          for (let i = 0; i < count; i++) {
            await raf();
            step();
          }
        };
        const native = physics.createRecoveryPort!(context); // Existing owner-bound alias, not a second owned port.
        const states = () => ({
          subject: native.readNative(subject),
          other: native.readNative(other),
        });
        const waitR = async (text: string) => {
          allowR = true;
          pendingEdge = null;
          progress(
            classId + ': ' + text + ' Click canvas; press and release ' + recoveryCode + '.',
          );
          const deadline = performance.now() + FUNCTIONAL.maximumWaitMs;
          while (pendingEdge === null) {
            check(performance.now() < deadline, 'Bounded trusted R wait');
            await raf();
          }
          const edge = pendingEdge as Record<string, unknown>;
          const before = states(),
            serialBefore = physics.collisionStepSerial();
          const result = actual.beforePhysicsTick();
          const after = states(),
            serialAfter = physics.collisionStepSerial();
          allowR = false;
          actual.syncHud();
          return {
            edge,
            acceptedTick: at,
            serialBefore,
            serialAfter,
            before,
            after,
            otherBefore: before.other,
            otherAfter: after.other,
            record: result,
            result,
          };
        };
        stage = 'NO_POINT';
        await advance(1);
        row.noPoint = await waitR('No safe point yet');
        check(
          (row.noPoint as { result: unknown }).result === 'NO_VALID_POINT',
          'Actual no-point accepted',
        );
        stage = 'SUPPORT';
        await advance(11);
        const observeSupport = (requestedDegrees: number | null) => {
          check(curve.length < FUNCTIONAL.maximumCurve, 'Bounded support curve');
          const p = physics.project('subject'),
            q = p.rotation;
          curve.push({
            requestedDegrees,
            heightM: p.position.y,
            upDot: 1 - 2 * (q.x * q.x + q.z * q.z),
            wheelContacts: p.wheelContacts,
            suspension: [...p.suspension],
            nativeSerial: physics.collisionStepSerial(),
            accepted:
              latestTracking !== null &&
              latestTracking.nativeSerial === physics.collisionStepSerial() &&
              latestTracking.status === 'SAFE',
            trackingQuery: latestTracking,
          });
        };
        observeSupport(null);
        const stable = physics.readBody(subject).transform;
        row.mechanicsBefore = physics.readVehicleMechanics('subject');
        for (const degrees of [4, 6, 0]) {
          stage = 'LABELED_SUPPORT_SETUP';
          (row.setupWrites as unknown[]).push({
            stage,
            nativeSerial: physics.collisionStepSerial(),
            degrees,
          });
          physics.setPose(subject, {
            positionM: { ...stable.positionM },
            rotationQuaternion: {
              x: 0,
              y: 0,
              z: Math.sin((degrees * Math.PI) / 360),
              w: Math.cos((degrees * Math.PI) / 360),
            },
          });
          physics.setBodyVelocity(subject, { x: 0, y: 0, z: 0 });
          await advance(6);
          observeSupport(degrees);
        }
        stage = 'TRUSTED_DRIVING';
        allowDriving = true;
        progress(classId + ': hold W and A or D until STOP, then release every key.');
        const driveDeadline = performance.now() + FUNCTIONAL.maximumWaitMs;
        while (!(
          keys.some(
            (k) => k.stage === stage && k.isTrusted && k.type === 'keydown' && k.code === 'KeyW',
          ) &&
          keys.some(
            (k) =>
              k.stage === stage &&
              k.isTrusted &&
              k.type === 'keydown' &&
              (k.code === 'KeyA' || k.code === 'KeyD'),
          )
        )) {
          check(performance.now() < driveDeadline, 'Bounded actual driving-key wait');
          await raf();
        }
        await advance(180);
        allowDriving = false;
        drive.sync();
        progress(classId + ': STOP driving. Release every key.');
        check(
          keys.some((k) => k.isTrusted && k.type === 'keydown' && k.code === 'KeyW') &&
            keys.some(
              (k) =>
                k.isTrusted && k.type === 'keydown' && (k.code === 'KeyA' || k.code === 'KeyD'),
            ),
          'Actual trusted driving/turn keys observed',
        );
        stage = 'LABELED_COLLISION_LAUNCH';
        (row.setupWrites as unknown[]).push({
          stage,
          nativeSerial: physics.collisionStepSerial(),
          velocityMps: { x: 0, y: 0, z: 45 },
        });
        physics.setPose(subject, stable);
        physics.setVelocity('subject', { x: 0, y: 0, z: 45 });
        await advance(180);
        check(
          maxImpulse > 0 &&
            d.readHistory().length > 0 &&
            d.readDamage(subject).availability !== 'AVAILABLE',
          'Actual wall impact damage',
        );
        const fullDamageHistory = () => {
          check(d.getStats().historyRecords <= 64, 'Declared full damage prefix page capacity');
          const history = d.readHistory();
          check(history.length === d.getStats().historyRecords, 'Actual complete damage prefix');
          check(
            new TextEncoder().encode(JSON.stringify(history)).byteLength <= 65536,
            'Bounded full damage history bytes',
          );
          return history;
        };
        row.nativeImpulseNs = maxImpulse;
        row.damageBefore = fullDamageHistory();
        row.lastIncidentBefore = d.readDamage(subject).lastIncidentId;
        row.segmentBefore = segment;
        stage = 'LABELED_ROLLOVER_SETUP';
        const p = physics.readBody(subject).transform.positionM;
        (row.setupWrites as unknown[]).push({ stage, nativeSerial: physics.collisionStepSerial() });
        physics.setPose(subject, {
          positionM: { ...p },
          rotationQuaternion: { x: 0, y: 0, z: 1, w: 0 },
        });
        stage = 'RECOVER';
        injectedDeliveryFailure = true;
        row.recovered = await waitR(
          'Release all driving keys; recover actual wall damage/rollover (one explicit005 delivery fault)',
        );
        const partial = (row.recovered as { record: { status: string; deliveredStages: number } })
          .record;
        check(
          partial.status === 'PARTIAL' && partial.deliveredStages === 2,
          'Actual owner retained accepted027/025 prefix',
        );
        const retryBefore = states(),
          retrySerial = physics.collisionStepSerial(),
          retryRecord = actual.retryDelivery();
        row.deliveryRetry = {
          partial,
          completed: retryRecord,
          before: retryBefore,
          after: states(),
          serialBefore: retrySerial,
          serialAfter: physics.collisionStepSerial(),
          segmentAttempts: deliveryAttempts,
          scope: 'ACTUAL030_OWNER_SUFFIX_RETRY_NO_NATIVE_REPLAY',
        };
        (row.recovered as { record: unknown }).record = retryRecord;
        check(
          (row.recovered as { record: { status: string } }).record.status === 'COMPLETED',
          'Actual030 recovery completed',
        );
        row.segmentAfter = segment;
        row.mechanicsAfter = physics.readVehicleMechanics('subject');
        row.damageAfter = fullDamageHistory();
        row.lastIncidentAfter = d.readDamage(subject).lastIncidentId;
        row.availabilityAfter = d.readDamage(subject).availability;
        const neutral = step();
        row.neutral = {
          heldKeys: input.getStats().heldKeys,
          raw: neutral.raw,
          command: neutral.command,
        };
        const restored = native.readNative(subject).transform;
        stage = 'LABELED_MOVING_BLOCKER_SETUP';
        physics.setPose(other, restored);
        physics.setBodyVelocity(other, { x: 3, y: 0, z: 0 });
        row.movingBlocker = native.readNative(other);
        stage = 'BLOCKED';
        row.blocked = await waitR('Current moving other-car blocker must deny placement');
        // No native step in these bounded input-only intervals. Actual repeats/keyup are observed.
        stage = 'HELD_REPEAT';
        allowR = true;
        pendingEdge = null;
        const repeatStart = keys.length;
        progress(classId + ': hold R until repeat is reported, then release R.');
        const repeatDeadline = performance.now() + FUNCTIONAL.maximumWaitMs;
        while (pendingEdge === null) {
          check(performance.now() < repeatDeadline, 'Bounded repeat first edge');
          await raf();
        }
        const repeatEdge = pendingEdge,
          repeatBefore = states(),
          repeatSerial = physics.collisionStepSerial(),
          repeatEventsBefore = events.length;
        actual.beforePhysicsTick();
        const repeatHistory = JSON.stringify(actual.readHistory(0, 64));
        while (!(
          keys
            .slice(repeatStart)
            .some((k) => k.isTrusted && k.code === 'KeyR' && k.type === 'keydown' && k.repeat) &&
          keys
            .slice(repeatStart)
            .some((k) => k.isTrusted && k.code === 'KeyR' && k.type === 'keyup')
        )) {
          check(performance.now() < repeatDeadline, 'Actual repeat and release required');
          await raf();
          actual.beforePhysicsTick();
        }
        row.repeat = {
          edge: repeatEdge,
          acceptedTick: at,
          serialBefore: repeatSerial,
          serialAfter: physics.collisionStepSerial(),
          before: repeatBefore,
          after: states(),
          historyBefore: repeatHistory,
          historyAfter: JSON.stringify(actual.readHistory(0, 64)),
          eventsBefore: repeatEventsBefore,
          eventsAfter: events.length,
          keysStart: repeatStart,
          keysEnd: keys.length,
        };
        allowR = false;
        const remappedBindings = { ...settings.input.bindings, recover: 'KeyT' };
        actual.remap(remappedBindings);
        recoveryCode = 'KeyT';
        stage = 'REMAP_OLD_KEY';
        allowR = true;
        const oldStart = keys.length,
          oldBefore = states(),
          oldHistory = JSON.stringify(actual.readHistory(0, 64));
        progress(
          classId + ': press and release OLD R. It must not queue recovery after remap to T.',
        );
        const oldDeadline = performance.now() + FUNCTIONAL.maximumWaitMs;
        while (
          !keys.slice(oldStart).some((k) => k.isTrusted && k.code === 'KeyR' && k.type === 'keyup')
        ) {
          check(performance.now() < oldDeadline, 'Bounded old-key observation');
          await raf();
          actual.beforePhysicsTick();
        }
        row.remapOld = {
          before: oldBefore,
          after: states(),
          historyBefore: oldHistory,
          historyAfter: JSON.stringify(actual.readHistory(0, 64)),
          keysStart: oldStart,
          keysEnd: keys.length,
        };
        allowR = false;
        stage = 'REMAP_NEW_KEY';
        row.remapped = await waitR(
          'Remapped T must address the actual seat and freshly deny the moving blocker',
        );
        actual.remap(settings.input.bindings);
        recoveryCode = 'KeyR';
        stage = 'TRUSTED_HUD';
        allowR = true;
        actual.syncHud();
        const hudButton = dom.querySelector('button')!;
        let actualPointer: Record<string, unknown> | null = null;
        const pointer = (event: MouseEvent) => {
          if (event.target === hudButton) {
            check(event.isTrusted, 'Actual trusted HUD pointer required');
            actualPointer = {
              isTrusted: event.isTrusted,
              readMs: performance.now(),
              tick: at,
              vehicleId: a.getStats().seat?.identity.entityId,
              generation: a.getStats().seat?.identity.generation,
            };
          }
        };
        dom.addEventListener('click', pointer, true);
        const removePointer = life.own('trustedHudPointer', () =>
          dom.removeEventListener('click', pointer, true),
        );
        const hudBefore = states(),
          hudSerial = physics.collisionStepSerial();
        progress(classId + ': click the real Deblocheaza masina HUD button once.');
        const hudDeadline = performance.now() + FUNCTIONAL.maximumWaitMs;
        while (actualPointer === null) {
          check(performance.now() < hudDeadline, 'Bounded actual HUD wait');
          await raf();
        }
        const hudRecord = actual.beforePhysicsTick();
        row.hud = {
          pointer: actualPointer,
          record: hudRecord,
          acceptedTick: at,
          before: hudBefore,
          after: states(),
          otherBefore: hudBefore.other,
          otherAfter: states().other,
          serialBefore: hudSerial,
          serialAfter: physics.collisionStepSerial(),
          focusedOwnButton: document.activeElement === hudButton,
        };
        removePointer();
        allowR = false;
        owned.canvas.focus();
        stage = 'AUTO_REJECT';
        await raf();
        step('AUTO');
        allowR = true;
        const autoBefore = states(),
          autoHistory = JSON.stringify(actual.readHistory(0, 64)),
          autoStart = keys.length;
        let staleHudPointer: Record<string, unknown> | null = null;
        const staleClick = (event: MouseEvent) => {
          if (event.target === hudButton) {
            if (!event.isTrusted) {
              life.record('staleHudPointer', 'Actual pointer required');
              return;
            }
            staleHudPointer = {
              isTrusted: event.isTrusted,
              visibleVehicleId: subject.entityId,
              visibleGeneration: subject.generation,
              actualSeat: a.getStats().seat,
              readMs: performance.now(),
            };
          }
        };
        dom.addEventListener('click', staleClick, true);
        const releaseStaleClick = life.own('staleHudPointer', () =>
          dom.removeEventListener('click', staleClick, true),
        );
        progress(
          classId +
            ': AUTO has no seat. Click the stale real HUD button once; then click canvas and press/release R.',
        );
        const staleDeadline = performance.now() + FUNCTIONAL.maximumWaitMs;
        while (staleHudPointer === null) {
          check(performance.now() < staleDeadline, 'Bounded stale HUD wait');
          await raf();
        }
        actual.beforePhysicsTick();
        row.staleHud = {
          pointer: staleHudPointer,
          before: autoBefore,
          after: states(),
          historyBefore: autoHistory,
          historyAfter: JSON.stringify(actual.readHistory(0, 64)),
        };
        releaseStaleClick();
        progress(
          classId + ': AUTO has no PLAYER seat. Press and release R; placement must not occur.',
        );
        const autoDeadline = performance.now() + FUNCTIONAL.maximumWaitMs;
        while (
          !keys
            .slice(autoStart)
            .some((key) => key.isTrusted && key.code === 'KeyR' && key.type === 'keyup')
        ) {
          check(performance.now() < autoDeadline, 'Bounded AUTO R observation');
          await raf();
          actual.beforePhysicsTick();
        }
        row.auto = {
          before: autoBefore,
          after: states(),
          historyBefore: autoHistory,
          historyAfter: JSON.stringify(actual.readHistory(0, 64)),
          seat: a.getStats().seat,
          keysStart: autoStart,
          keysEnd: keys.length,
        };
        allowR = false;
        await raf();
        step('MANUAL');
        const stale = { ...subject, generation: subject.generation + 1 };
        const staleBefore = states();
        let staleError: string | null = null;
        try {
          actual.register(stale, 'TAXI');
        } catch (error) {
          staleError = String(error);
        }
        row.staleGeneration = {
          scope: 'HOST_FORGED_TOKEN_ADMISSION_NOT_TRUSTED_KEY',
          rejected: staleError !== null,
          error: staleError,
          before: staleBefore,
          after: states(),
        };
        row.history = actual.readHistory(0, 64);
        row.historyBytes = new TextEncoder().encode(JSON.stringify(row.history)).byteLength;
        const road = createRecoveryRoadProvider(recoveryRoadFixture().graph).locate(
          restored,
          'TAXI',
        )!;
        const unsupported = [];
        for (const [kind, positionM] of [
          ['AIRBORNE', { ...restored.positionM, y: 10 }],
          ['OFFROAD', { ...restored.positionM, x: 499 }],
          ['BELOWGROUND', { ...restored.positionM, y: -1 }],
        ] as const) {
          const request = {
            identity: subject,
            context,
            expectedPhysicsSerial: physics.collisionStepSerial(),
            transform: { ...restored, positionM },
            road,
          };
          const before = native.readNative(subject),
            result = native.applyPlacement(request);
          unsupported.push({ kind, before, result });
          check(
            result.inspection.status === 'INVALID_SUPPORT' && result.attempted === 0,
            'Actual unsupported road has zero setters',
          );
        }
        row.unsupported = unsupported;
        // Explicit actual-native seam fault, separate from trusted-R owner acceptance.
        stage = 'LABELED_NATIVE_SETTER_FAULT';
        physics.setPose(other, {
          positionM: { x: 30, y: 0.75, z: 30 },
          rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
        });
        await advance(1);
        segment = parseInterventionSegment({
          ...segment,
          segmentId: 'actual-native-fault-' + classId,
          startTick: at,
          endTick: null,
          closeReason: null,
          completeness: 'OPEN',
        });
        const faultRequest = {
          identity: subject,
          context,
          expectedPhysicsSerial: physics.collisionStepSerial(),
          transform: {
            ...restored,
            positionM: { ...restored.positionM, z: restored.positionM.z + 1 },
          },
          road,
        };
        check(
          native.inspectPlacement(faultRequest).status === 'SAFE',
          'Actual native fault fixture fresh safe placement',
        );
        const faultBefore = states(),
          faultSerial = physics.collisionStepSerial(),
          injection = nativeAcquisition.injectRotationFailure(subject, (label, release) =>
            life.own(label, release),
          );
        let faultOperation;
        try {
          faultOperation = await waitR(
            'Actual030 owner native fault: R must retain partial placement and stop',
          );
        } finally {
          injection.restore();
        }
        const faultRecord = (
          faultOperation as {
            record: {
              status: string;
              placement: { attempted: number; completed: number; failure: string | null };
            };
          }
        ).record;
        let retryRejected = false;
        try {
          actual.retryDelivery();
        } catch {
          retryRejected = true;
        }
        row.nativeSetterFault = {
          scope: 'ACTUAL030_OWNER_TRUSTED_R_NATIVE_PARTIAL',
          operation: faultOperation,
          before: faultBefore,
          after: states(),
          serialBefore: faultSerial,
          serialAfter: physics.collisionStepSerial(),
          result: faultRecord.placement,
          injectedSetterAttempts: injection.readAttempts(),
          retryRejected,
        };
        check(
          faultRecord.status === 'PARTIAL' &&
            faultRecord.placement.attempted === 2 &&
            faultRecord.placement.completed === 1 &&
            faultRecord.placement.failure !== null &&
            injection.readAttempts() === 1 &&
            retryRejected,
          'Actual owner partial setter preserved without rollback/retry',
        );
        row.history = actual.readHistory(0, 64);
        row.historyBytes = new TextEncoder().encode(JSON.stringify(row.history)).byteLength;
        a.register(other);
        check(physics.removeCollisionEntity(wall), 'Retire wall only outside operation brackets');
        releaseFeature();
        stage = 'LIFECYCLE_SETUP';
        for (let i = 2; i < 110; i++) {
          physics.addClassCar(
            'parked-' + i,
            { x: 60 + (i % 10) * 4, y: 0.8, z: 40 + Math.floor(i / 10) * 5 },
            i % 2 ? 'compact' : 'sedan',
          );
          const token = physics.bodyIdentity('parked-' + i)!;
          a.register(token);
          d.register(token, physics.readVehicleMechanics(token.entityId).massKg);
        }
        for (let i = 0; i < 20; i++) {
          const serialBefore = physics.collisionStepSerial(),
            one = createFeature();
          const release = life.own('030life-' + i, () => one.dispose());
          for (const id of [
            'subject',
            'other',
            ...Array.from({ length: 108 }, (_, j) => 'parked-' + (j + 2)),
          ]) {
            const token = physics.bodyIdentity(id)!;
            one.register(token, 'TAXI');
          }
          const activePorts = physics.recoveryResources!().activePorts;
          release();
          lifetimes.push({
            activePorts,
            afterPorts: physics.recoveryResources!().activePorts,
            serialBefore,
            serialAfter: physics.collisionStepSerial(),
            listeners: one.getStats().input.listeners + one.getStats().hud.listeners,
            nodes: dom.childNodes.length,
          });
        }
        row.status = 'COMPLETE';
      } catch (error) {
        life.record('primary', error);
        row.error = functionalPrimaryCause(error);
      } finally {
        life.dispose();
        const reads: Record<string, unknown> = {};
        for (const [name, read] of Object.entries({
          ...caseReaders,
          nativeBodies: () => world?.bodyResources().entities ?? null,
          nativeSubscriptions: () => world?.bodyResources().subscriptions ?? null,
          nativeColliders: () => world?.collisionResources().colliders ?? null,
          recoveryPorts: () => world?.recoveryResources?.().activePorts ?? null,
          controllerVehicles: () => controller?.getStats().vehicles ?? null,
          authorityVehicles: () => authority?.getStats().vehicles ?? null,
          damageHistory: () => damage?.getStats().historyRecords ?? null,
          filterDisposed: () => filter?.getStats().disposed ?? null,
          domConnected: () => container?.isConnected ?? null,
        })) {
          try {
            reads[name] = read();
          } catch (error) {
            life.record('readback:' + name, error);
            reads[name] = { readbackError: functionalPrimaryCause(error) };
          }
        }
        row.cleanup = { ...reads, ...encodeDiagnosticOwnership(life.snapshot()) };
      }
      if (life.failed)
        throw Object.assign(new Error('Functional case failed'), { causes: life.snapshot() });
    }
    report.status = 'COMPLETE';
  } catch (error) {
    root.record('primary', error);
    report.error = functionalPrimaryCause(error);
  } finally {
    root.dispose();
    const cleanup: Record<string, unknown> = {};
    for (const [name, read] of Object.entries({
      sceneDisposed: () => backend?.scene.isDisposed ?? null,
      meshes: () => backend?.scene.meshes.length ?? null,
      materials: () => backend?.scene.materials.length ?? null,
      engineScenes: () => backend?.scene.getEngine().scenes.length ?? null,
    })) {
      try {
        cleanup[name] = read();
      } catch (error) {
        root.record('backendReadback:' + name, error);
        cleanup[name] = { readbackError: functionalPrimaryCause(error) };
      }
    }
    report.backendCleanup = cleanup;
    report.ownership = encodeDiagnosticOwnership(root.snapshot());
    report.completedAt = new Date().toISOString();
    if (root.failed) report.status = 'INCOMPLETE';
    if (captureId) {
      await root.attempt('functionalRawExport', () =>
        post('/functional/' + captureId + '/report', report),
      );
      if (root.failed)
        await root.attempt('functionalFailureExport', () =>
          post('/functional/' + captureId + '/failure', {
            identity: report.identity,
            failedAt: new Date().toISOString(),
            causes: encodeDiagnosticOwnership(root.snapshot()),
            backendCleanup: cleanup,
          }),
        );
    }
  }
  root.throwIfFailed();
  progress('Functional raw saved; strict independent verification required, no performance PASS');
}
