import type { RenderingBackend } from '../../../src/rendering/babylon';
import { createFixedTickLoop } from '../../../src/simulation/fixed-tick';
import type { actualSelectionHost } from '../vehicle-selection-actual/selection-host';
import { referenceSelectionPhase } from './historical-reference';
import { steadyHost } from './host';
import { browserScope, check, immutableMechanics, snapshot, unchanged } from './proof';
import { STEADY, steadyActions, rawQuantiles, type SteadyArm } from './protocol';
import { binary64, bodyNumbers, numericChecksum, settlementTuple } from './codec';
import { errorEvidence } from './diagnostics';
import { warmObservation } from './warm-observation';
import { boundedRaf, windowRafPorts, type EntryCallback } from './initial-callback';
const raf = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
const plain = <T>(value: T): T => structuredClone(value);
const heap = (phase: string, tick: number) => {
  const readStarted = performance.now();
  let value:
    { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } | undefined;
  let reason: string | null = null;
  try {
    value = (performance as Performance & { memory?: typeof value }).memory;
  } catch (error) {
    reason = String(error).slice(0, 256);
  }
  const valid =
    value &&
    [value.usedJSHeapSize, value.totalJSHeapSize, value.jsHeapSizeLimit].every(
      (v) => Number.isFinite(v) && v >= 0,
    ) &&
    value.usedJSHeapSize <= value.totalJSHeapSize &&
    value.totalJSHeapSize <= value.jsHeapSizeLimit;
  return {
    phase,
    tick,
    readStarted,
    readEnded: performance.now(),
    support: valid ? 'REPORTED' : value || reason ? 'UNVALIDATED' : 'UNAVAILABLE',
    precision: valid ? 'browser-reported-nonstandard-not-exact' : 'unknown',
    usedBytes: valid ? value!.usedJSHeapSize : null,
    totalBytes: valid ? value!.totalJSHeapSize : null,
    limitBytes: valid ? value!.jsHeapSizeLimit : null,
    reason: valid ? null : (reason ?? (value ? 'Malformed browser heap ordering/values' : null)),
  };
};
/** One70-body arm. All current-state/stream evidence is bounded and retained on failure.
 * Complete-tick timings include fixture assertions/checksums/stage clocks; not pure068 cost. */
export async function runSteadyArm(
  backend: RenderingBackend,
  arm: SteadyArm,
  selectionFactory: typeof actualSelectionHost | null,
  surface: () => void,
  retain: (record: unknown, disposition: 'PASS' | 'FAILED') => Promise<void>,
  onWorldCreated: () => void,
) {
  check(
    (arm.treatment === 'CURRENT_068') === (selectionFactory !== null),
    'Treatment constructor mismatch',
  );
  const heapBeforeAllocation = heap('beforeAllocation', 0);
  const warmDiagnostic = warmObservation();
  let initialRafProof: unknown = null;
  const initialWarmCallbacks: EntryCallback[] = [];
  let entryDuplicateUsed = false;
  let actualCallbackCount = 0;
  let rejectedCallback: unknown = null;
  let latestMeasuredCallback: unknown = null;
  const scope = browserScope(),
    frameMs = new Float64Array(STEADY.maxMeasuredRaf),
    workMs = new Float64Array(STEADY.maxMeasuredRaf),
    nativeCounters = new Float64Array(STEADY.maxMeasuredRaf),
    tickMs = new Float64Array(STEADY.maxMeasuredTicks),
    rapierMs = new Float64Array(STEADY.maxMeasuredTicks),
    uiMs = arm.observer ? new Float64Array(STEADY.maxMeasuredRaf) : null,
    selectionMs = arm.observer ? new Float64Array(STEADY.maxMeasuredTicks) : null;
  const allocatedRawBytes =
    frameMs.byteLength +
    workMs.byteLength +
    nativeCounters.byteLength +
    tickMs.byteLength +
    rapierMs.byteLength +
    (uiMs?.byteLength ?? 0) +
    (selectionMs?.byteLength ?? 0);
  const checksums = {
    packets: numericChecksum(),
    effective: numericChecksum(),
    native: numericChecksum(),
    physical: numericChecksum(),
  };
  const selectionProofs: unknown[] = [],
    modeProofs: unknown[] = [],
    checkpoints: unknown[] = [],
    longTasks: { startTime: number; duration: number; name: string }[] = [];
  let h: Awaited<ReturnType<typeof steadyHost>> | null = null,
    primary: unknown = null,
    tick = 0,
    frames = 0,
    measuredTicks = 0,
    warmFrames = 0,
    nativeCounterSamples = 0,
    initialNativeCounter: number | null = null,
    maxWarmRafGapMs = 0,
    warmTicks = 0,
    warmSerial = 0,
    measuredEndTick = 0,
    measuredEndSerial = 0,
    measuring = false,
    measurementStarted = 0,
    measurementEnded = 0,
    previous = 0,
    warmStarted = 0,
    warmEnded = 0,
    lastHud = -Infinity,
    hudWrites = 0,
    maxRafGapMs = 0,
    maxSpeedMps = 0,
    maxDisplacementM = 0,
    maximumPlayers = 0,
    asynchronousFailure: unknown = null,
    firstWorldAt: string | null = null,
    finalMechanics: unknown = null,
    initialMechanics: unknown = null,
    clockState: unknown = null,
    live: unknown = null,
    liveHeap: unknown = null,
    beforeDisposeHeap: unknown = null,
    longTaskSupported = false;
  let heapBeforeWarmup: unknown = null,
    heapAfterWarmup: unknown = null;
  try {
    if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      const record = (entry: PerformanceEntry) => {
        if (
          entry.startTime < measurementStarted ||
          !measurementStarted ||
          (measurementEnded && entry.startTime > measurementEnded)
        )
          return;
        check(longTasks.length < STEADY.maxLongTasks, 'LongTask evidence cap');
        longTasks.push({ startTime: entry.startTime, duration: entry.duration, name: entry.name });
      };
      const observer = new PerformanceObserver((list) => {
        try {
          for (const entry of list.getEntries()) record(entry);
        } catch (error) {
          asynchronousFailure ??= error;
        }
      });
      scope.own('longtasks', () => {
        for (const entry of observer.takeRecords()) record(entry);
        observer.disconnect();
      });
      observer.observe({ entryTypes: ['longtask'] });
      longTaskSupported = true;
    }
    firstWorldAt = new Date().toISOString();
    h = await steadyHost(
      backend,
      1000 + arm.pair * 2 + Number(arm.observer),
      scope,
      selectionFactory,
      onWorldCreated,
    );
    const host = h,
      c = host.c;
    initialMechanics = host.ids.map((id) => plain(host.world.readVehicleMechanics(id.entityId)));
    const prior = host.ids.map((id) => host.world.project(id.entityId).position);
    const loop = createFixedTickLoop({
      captureSnapshot: () => ({ tick }),
      interpolate: (_a, b) => b,
      step(time) {
        const start = performance.now();
        tick = time.tick;
        check(tick <= STEADY.maxTotalTicks, 'Actual physics tick cap');
        const phase = referenceSelectionPhase(tick),
          old = host.authority.getStats().seat;
        let modeTicket: ReturnType<typeof host.modes.prepare> | null = null,
          selectionTicket: ReturnType<typeof host.prepareSelection> | null = null,
          requests: Parameters<typeof host.authority.step>[2] = [];
        const stageStart = arm.observer ? performance.now() : null;
        if (phase.claim && phase.mode !== 'AUTO') {
          check(
            host.modes.enqueue(phase.mode === 'MANUAL' ? 'M' : 'L'),
            'Explicit steady mode rejected',
          );
          modeTicket = host.modes.prepare({
            ...c,
            version: '067-mode-controls-v1',
            tick,
            dtSeconds: 1 / 60,
          });
          requests = modeTicket.requests;
        }
        if (phase.depart || phase.returnCamera) {
          selectionTicket = host.prepareSelection(tick, host.ids[phase.depart ? 1 : 0]!, 'FLEET');
          requests = selectionTicket.requests;
        }
        const preparingMs = stageStart === null ? null : performance.now() - stageStart;
        const actions = steadyActions(tick);
        for (const [action, value] of Object.entries(actions))
          host.keyboard.setAction(action as keyof typeof actions, value);
        const body = host.world.readBody(host.ids[0]!),
          filtered = host.keyboard.step({
            tick,
            dtSeconds: 1 / 60,
            speedMps: Math.hypot(body.velocityMps.x, body.velocityMps.y, body.velocityMps.z),
          });
        const values = {
          throttle: filtered.command.throttle,
          brake: filtered.command.brake,
          steering: filtered.command.steering,
          handbrake: filtered.command.handbrake,
        };
        const packets = host.ids.flatMap((identity) =>
          (['AUTONOMY', 'PLAYER'] as const).map((source) => ({
            identity,
            command: {
              ...c,
              vehicleId: identity.entityId,
              tick,
              source,
              turnSignal: 'OFF' as const,
              ...values,
            },
          })),
        );
        const frame = host.authority.step(
          { ...c, version: '066-control-authority-v1', tick, dtSeconds: 1 / 60 },
          packets,
          requests,
          true,
        ).frame;
        const settlementStart = arm.observer ? performance.now() : null;
        if (modeTicket) {
          const serial = host.world.collisionStepSerial(),
            before = snapshot(host.world, host.ids);
          host.guard.phase = 'SETTLEMENT';
          check(host.modes.settle(modeTicket) === 'ACCEPTED', 'Steady mode settlement');
          const seat = host.authority.getStats().seat;
          check(seat, 'Accepted controlled seat missing');
          host.segments.open(seat.identity, seat.mode, tick);
          host.present();
          const after = unchanged(host.world, host.ids, before, serial);
          check(modeProofs.length < STEADY.maxModeProofs, 'Mode proof cap');
          modeProofs.push({
            tick,
            serial,
            serialAfter: host.world.collisionStepSerial(),
            identity: plain(seat.identity),
            mode: seat.mode,
            segment: plain(host.segments.read()),
            bodies: settlementTuple(
              before.map((v) => v.body),
              after.map((v) => v.body),
            ),
          });
          host.guard.phase = 'DRIVING';
        }
        if (selectionTicket) {
          const proof = host.settleSelection(
            tick,
            selectionTicket.identity,
            old,
            'FLEET',
            selectionTicket,
          );
          check(selectionProofs.length < STEADY.maxSelectionProofs, 'Selection proof cap');
          const { before, after, assignmentBefore, assignmentAfter, assignmentText, ...metadata } =
            proof;
          check(
            assignmentBefore === host.assignmentText &&
              assignmentAfter === host.assignmentText &&
              assignmentText === host.assignmentText,
            'Actual retained route/trip text',
          );
          selectionProofs.push({
            ...metadata,
            assignmentBeforeRef: 'arm-assignment-v1',
            assignmentAfterRef: 'arm-assignment-v1',
            bodies: settlementTuple(before, after),
          });
        }
        const settlingMs = settlementStart === null ? null : performance.now() - settlementStart;
        const nativeInputs = host.guard.nativeInputs;
        check(
          nativeInputs?.length === 70 && frame.controls.length === 70,
          'All70 actuation channels',
        );
        for (let index = 0; index < 70; index++) {
          const id = host.ids[index]!,
            state = host.world.readBody(id),
            projection = host.world.project(id.entityId),
            control = frame.controls[index]!;
          check(
            control.identity === id && host.world.bodyIdentity(id.entityId) === id,
            'Exact live native/control binding',
          );
          const p = projection.position,
            q = projection.rotation,
            v = projection.velocity;
          for (const value of [
            id.handle,
            id.generation,
            p.x,
            p.y,
            p.z,
            q.x,
            q.y,
            q.z,
            q.w,
            v.x,
            v.y,
            v.z,
          ])
            checksums.physical.add(value);
          maxSpeedMps = Math.max(maxSpeedMps, projection.speed);
          maxDisplacementM = Math.max(
            maxDisplacementM,
            Math.hypot(p.x - prior[index]!.x, p.y - prior[index]!.y, p.z - prior[index]!.z),
          );
          prior[index] = { ...p };
          for (const source of [0, 1]) {
            const raw = packets[index * 2 + source]!;
            for (const value of [
              tick,
              id.handle,
              id.generation,
              source,
              raw.command.throttle,
              raw.command.brake,
              raw.command.steering,
              Number(raw.command.handbrake),
            ])
              checksums.packets.add(value);
          }
          for (const value of [
            tick,
            id.handle,
            id.generation,
            control.mode === 'AUTO' ? 0 : control.mode === 'MANUAL' ? 1 : 2,
            control.command.throttle,
            control.command.brake,
            control.command.steering,
            Number(control.command.handbrake),
          ])
            checksums.effective.add(value);
          const native = nativeInputs[index]![1] as {
            throttle: number;
            brake: number;
            steering: number;
            handbrake?: boolean;
          };
          check(
            nativeInputs[index]![0] === id.entityId && state.identity === id,
            'Native input exact body order',
          );
          for (const value of [
            tick,
            id.handle,
            id.generation,
            native.throttle,
            native.brake,
            native.steering,
            Number(native.handbrake ?? false),
          ])
            checksums.native.add(value);
        }
        const actual = host.authority.getStats();
        check(actual.players <= 1, 'MultiplePLAYER');
        maximumPlayers = Math.max(maximumPlayers, actual.players);
        check(
          host.modes.observe().tick === tick &&
            host.camera.controller.selectedEntityId === host.selected().entityId,
          'Actual accepted mode/camera projection',
        );
        if (tick % 300 === 0 && tick <= 8700) {
          check(checkpoints.length < STEADY.maxCheckpoints, 'Checkpoint cap');
          checkpoints.push({
            tick,
            serial: host.world.collisionStepSerial(),
            bodies: binary64(bodyNumbers(snapshot(host.world, host.ids).map((v) => v.body))),
            sampled: [0, 1, 69].map((index) => ({
              identity: plain(host.ids[index]),
              packets: plain(packets.slice(index * 2, index * 2 + 2)),
              control: plain(frame.controls[index]),
              nativeInput: plain(nativeInputs[index]),
            })),
            selected: host.selected().entityId,
            seat: plain(actual.seat),
            boundary: plain(host.segments.read()),
            checksums: Object.fromEntries(
              Object.entries(checksums).map(([key, value]) => [key, value.read()]),
            ),
          });
        }
        if (measuring) {
          check(measuredTicks < STEADY.maxMeasuredTicks, 'Measured tick sample cap');
          rapierMs[measuredTicks] = frame.physics.stepMs;
          if (selectionMs) selectionMs[measuredTicks] = preparingMs! + settlingMs!;
          tickMs[measuredTicks++] = performance.now() - start;
        }
      },
    });
    const retainClock = (phase: 'warmup' | 'measurement') => {
      const state = loop.getState();
      clockState = {
        ...plain({ ...state, fault: null }),
        phase,
        fault: state.fault
          ? {
              stage: state.fault.stage,
              attemptedTick: state.fault.attemptedTick,
              error: errorEvidence(state.fault.error),
            }
          : null,
      };
      if (state.fault)
        throw new Error(
          'Fixed-clock ' + phase + ':' + state.fault.stage + ':' + state.fault.attemptedTick,
          { cause: state.fault.error },
        );
      check(state.overloadCount === 0, 'Fixed-clock overload:' + phase);
    };
    scope.own('loop', () => loop.dispose());
    backend.canvas.focus();
    await backend.scene.whenReadyAsync();
    surface();
    const actualNativePoint = () => ({
      nativeSerial: host.world.collisionStepSerial(),
      controllerTick: host.controller.getStats().tick,
    });
    heapBeforeWarmup = heap('beforeWarmup', tick);
    const requestStartedAt = performance.now(),
      counterBefore = actualNativePoint();
    warmDiagnostic.wait({ phase: 'INITIAL', requestStartedAt, previousStamp: null, counterBefore });
    previous = await raf();
    actualCallbackCount++;
    const callbackObservedAt = performance.now(),
      counterAfter = actualNativePoint();
    warmDiagnostic.returned({
      returnedStamp: previous,
      callbackObservedAt,
      gapMs: null,
      counterAfter,
    });
    initialRafProof = {
      requestStartedAt,
      callbackObservedAt,
      stampMs: previous,
      counterBefore,
      counterAfter,
      initializedCounter: null,
    };
    surface();
    loop.frame(previous);
    initialNativeCounter = host.world.collisionStepSerial();
    (initialRafProof as Record<string, unknown>).initializedCounter = actualNativePoint();
    check(initialNativeCounter === 0 && tick === 0, 'Actual warm-entry native counter/tick');
    retainClock('warmup');
    warmStarted = previous;
    while (previous - warmStarted < STEADY.warmupMs) {
      const requestStartedAt = performance.now(),
        counterBefore = actualNativePoint();
      warmDiagnostic.wait({
        phase: 'WARM',
        requestStartedAt,
        previousStamp: previous,
        counterBefore,
      });
      const entry = warmFrames === 0;
      const stateBefore = loop.getState();
      const entryRow: EntryCallback | null = entry
        ? {
            requestStartedAt,
            previousStamp: previous,
            returnedStamp: null,
            callbackObservedAt: null,
            timeoutObservedAt: null,
            counterBefore,
            counterAfter: null,
            debtSecondsBefore: stateBefore.debtSeconds,
            activeRealSecondsBefore: stateBefore.activeRealSeconds,
            outcome: 'PENDING',
          }
        : null;
      if (entryRow) {
        check(initialWarmCallbacks.length < 2, 'Initial callback proof capacity');
        initialWarmCallbacks.push(entryRow);
      }
      const now =
          entryDuplicateUsed && entry
            ? await boundedRaf(windowRafPorts(window), () => {
                if (entryRow) {
                  entryRow.outcome = 'TIMEOUT';
                  entryRow.timeoutObservedAt = performance.now();
                }
              })
            : await raf(),
        callbackObservedAt = performance.now(),
        counterAfter = actualNativePoint(),
        warmGap = now - previous;
      actualCallbackCount++;
      if (entryRow) {
        entryRow.returnedStamp = now;
        entryRow.callbackObservedAt = callbackObservedAt;
        entryRow.counterAfter = counterAfter;
        entryRow.outcome = 'RETURNED';
      }
      warmDiagnostic.returned({
        returnedStamp: now,
        callbackObservedAt,
        counterAfter,
        gapMs: warmGap,
      });
      const frameReadStartedAt = performance.now();
      surface();
      check(
        asynchronousFailure === null,
        'LongTasks async failure: ' + String(asynchronousFailure),
      );
      maxWarmRafGapMs = Math.max(maxWarmRafGapMs, warmGap);
      check(warmGap >= 0, 'Warm RAF timestamp regressed');
      if (warmGap === 0) {
        check(
          entry &&
            !entryDuplicateUsed &&
            previous === warmStarted &&
            tick === 0 &&
            counterBefore.nativeSerial === 0 &&
            counterBefore.controllerTick === 0 &&
            counterAfter.nativeSerial === 0 &&
            counterAfter.controllerTick === 0 &&
            stateBefore.debtSeconds === 0 &&
            stateBefore.activeRealSeconds === 0,
          'Repeated RAF stamp outside single initial zero-debt allowance',
        );
        entryDuplicateUsed = true;
        continue;
      }
      check(warmGap <= 250, 'Warm actual RAF debt bound');
      if (entryDuplicateUsed && entry)
        check(
          callbackObservedAt - requestStartedAt <= 250,
          'Initial repeated RAF followup actual delivery bound',
        );
      check(nativeCounterSamples < nativeCounters.length, 'Actual allRAF counter cap');
      loop.frame(now);
      nativeCounters[nativeCounterSamples++] = host.world.collisionStepSerial();
      warmFrames++;
      retainClock('warmup');
      host.present();
      const renderStartedAt = performance.now();
      backend.render();
      const renderEndedAt = performance.now();
      warmDiagnostic.completed({
        stampMs: now,
        readStartedAt: frameReadStartedAt,
        readEndedAt: renderEndedAt,
        counter: actualNativePoint(),
        frameWorkMs: renderEndedAt - frameReadStartedAt,
        renderWorkMs: renderEndedAt - renderStartedAt,
      });
      previous = now;
    }
    warmEnded = previous;
    warmTicks = tick;
    warmSerial = host.world.collisionStepSerial();
    check(
      warmTicks / 60 / ((warmEnded - warmStarted) / 1000) >= STEADY.minSimulationRatio,
      'Warm actual active/simulation ratio',
    );
    heapAfterWarmup = heap('afterWarmup', tick);
    measurementStarted = previous;
    measuring = true;
    while (previous - measurementStarted < STEADY.measuredMs) {
      const requestStartedAt = performance.now(),
        counterBefore = actualNativePoint();
      const now = await raf(),
        callbackObservedAt = performance.now(),
        counterAfter = actualNativePoint();
      actualCallbackCount++;
      latestMeasuredCallback = {
        phase: 'MEASUREMENT',
        requestStartedAt,
        previousStamp: previous,
        returnedStamp: now,
        callbackObservedAt,
        counterBefore,
        counterAfter,
        gapMs: now - previous,
      };
      if (now <= previous) rejectedCallback = latestMeasuredCallback;
      surface();
      check(
        asynchronousFailure === null,
        'LongTasks async failure: ' + String(asynchronousFailure),
      );
      check(frames < STEADY.maxMeasuredRaf, 'Measured RAF cap');
      check(
        now - measurementStarted <= STEADY.measuredMs + STEADY.endpointDebtMs,
        'Measured endpoint debt bound',
      );
      const started = performance.now(),
        gap = now - previous;
      check(
        Number.isFinite(gap) && gap > 0,
        gap === 0 ? 'Repeated measured RAF stamp rejected' : 'Measured RAF timestamp regressed',
      );
      maxRafGapMs = Math.max(maxRafGapMs, gap);
      check(gap <= 250, 'Actual RAF gap debt bound');
      check(nativeCounterSamples < nativeCounters.length, 'Actual allRAF counter cap');
      loop.frame(now);
      nativeCounters[nativeCounterSamples++] = host.world.collisionStepSerial();
      retainClock('measurement');
      host.present();
      const uiStart = arm.observer ? performance.now() : null;
      if (now - lastHud >= 100) {
        const seat = host.authority.getStats().seat;
        document.getElementById('selected')!.textContent = 'Cameră: ' + host.selected().entityId;
        document.getElementById('seat')!.textContent =
          'PLAYER: ' + (seat ? seat.identity.entityId + ' ' + seat.mode : '— AUTO');
        document.getElementById('boundary')!.textContent =
          'Segment: ' + (host.segments.read()?.segment.completeness ?? '—');
        lastHud = now;
        hudWrites++;
      }
      backend.render();
      frameMs[frames] = gap;
      workMs[frames] = performance.now() - started;
      if (uiMs) uiMs[frames] = performance.now() - uiStart!;
      frames++;
      previous = now;
    }
    measurementEnded = previous;
    measuredEndTick = tick;
    measuredEndSerial = host.world.collisionStepSerial();
    measuring = false;
    liveHeap = heap('liveHeap', tick);
    const frameDistribution = rawQuantiles(Array.from(frameMs.subarray(0, frames))),
      workDistribution = rawQuantiles(Array.from(workMs.subarray(0, frames)));
    check(
      frameDistribution.p95 <= 18.5 && frameDistribution.p99 <= 25,
      'Required steady frame budget',
    );
    if (arm.observer) check(workDistribution.p95 <= 10, 'Required ON main-work budget');
    check(
      rawQuantiles(Array.from(tickMs.subarray(0, measuredTicks))).p95 <= 5.5,
      'Required normal70 full-tick budget',
    );
    check(
      rawQuantiles(Array.from(rapierMs.subarray(0, measuredTicks))).p95 <= 3,
      'Required actual Rapier budget',
    );
    check(
      measuredTicks / 60 / ((measurementEnded - measurementStarted) / 1000) >=
        STEADY.minSimulationRatio,
      'Actual active/simulation ratio',
    );
    finalMechanics = host.ids.map((id) => plain(host.world.readVehicleMechanics(id.entityId)));
    check(
      JSON.stringify(
        (initialMechanics as ReturnType<typeof host.world.readVehicleMechanics>[]).map(
          immutableMechanics,
        ),
      ) ===
        JSON.stringify(
          (finalMechanics as ReturnType<typeof host.world.readVehicleMechanics>[]).map(
            immutableMechanics,
          ),
        ),
      'Immutable mechanics changed',
    );
    for (const value of Object.values(host.guard.drivingCalls))
      check(value === 0, 'Driving native mutation');
    check(
      host.guard.selectionStepAttempts === 0 && host.guard.nativeSteps === tick,
      'Native step count/settlement',
    );
    live = {
      body: host.world.bodyResources(),
      collision: host.world.collisionResources(),
      controller: host.controller.getStats(),
      authority: host.authority.getStats(),
      keyboard: host.keyboard.getStats(),
      mode: host.modes.getStats(),
      selection: host.actual?.selection.getStats() ?? null,
      segment: host.segments.getStats(),
      registry: host.registry.size,
      scene: {
        meshes: backend.scene.meshes.length,
        materials: backend.scene.materials.length,
        cameras: backend.scene.cameras.length,
      },
      guard: plain(host.guard),
    };
    beforeDisposeHeap = heap('beforeDispose', tick);
  } catch (error) {
    primary = error instanceof Error ? error : Error('Non-Error thrown: ' + String(error));
  }
  const resourceReadErrors: unknown[] = [];
  if (h && !live) {
    const readbacks: Record<string, unknown> = {};
    const reads: Record<string, () => unknown> = {
      body: () => h!.world.bodyResources(),
      collision: () => h!.world.collisionResources(),
      controller: () => h!.controller.getStats(),
      authority: () => h!.authority.getStats(),
      keyboard: () => h!.keyboard.getStats(),
      mode: () => h!.modes.getStats(),
      selection: () => h!.actual?.selection.getStats() ?? null,
      segment: () => h!.segments.getStats(),
      registry: () => h!.registry.size,
      guard: () => plain(h!.guard),
    };
    for (const [name, read] of Object.entries(reads))
      try {
        readbacks[name] = read();
      } catch (error) {
        readbacks[name] = null;
        resourceReadErrors.push(error);
      }
    live = readbacks;
  }
  const cleanup = scope.close();
  if (longTaskSupported && longTasks.some((entry) => entry.duration > 50))
    primary ??= Error('Application LongTask >50ms');
  const errors = [
    ...resourceReadErrors,
    ...(primary ? [primary] : []),
    ...(asynchronousFailure ? [asynchronousFailure] : []),
    ...cleanup.errors.map((error) => Error(error.resource + ': ' + error.message)),
  ];
  try {
    const after = cleanup.snapshots as Record<string, Record<string, unknown>>;
    check(
      after.body?.entities === 0 &&
        after.body.subscriptions === 0 &&
        after.collision?.colliders === 0,
      'Native cleanup readback',
    );
    for (const field of ['vehicles', 'players', 'targets', 'projections'])
      check(after.controller?.[field] === 0, 'Controller cleanup:' + field);
    check(
      after.authority?.vehicles === 0 &&
        after.authority.players === 0 &&
        after.keyboard?.heldKeys === 0 &&
        after.mode?.intents === 0 &&
        after.mode.inFlight === 0 &&
        after.mode.projection === null,
      'Input cleanup',
    );
    check(
      after.segment?.retainedSegments === 0 &&
        after.registry?.bindings === 0 &&
        after.camera?.disposed === true &&
        after.camera.selected === null,
      'Camera/segment cleanup',
    );
    if (selectionFactory)
      check(
        after.selection?.vehicles === 0 &&
          after.selection.pending === 0 &&
          after.selection.inFlight === 0 &&
          after.selection.projection === null &&
          after.selection.disposed === true,
        'Actual068 cleanup',
      );
    for (const [name, value] of Object.entries(after))
      if (name.startsWith('mesh-') || name.startsWith('material-'))
        check(value.disposed === true, 'Presentation cleanup:' + name);
  } catch (error) {
    errors.push(error);
  }
  const record = {
    version: STEADY.version,
    disposition: errors.length ? 'FAILED' : 'PASS',
    arm,
    context: h?.c ?? null,
    firstWorldAt,
    createdAt: new Date().toISOString(),
    identities: h ? plain(h.ids) : null,
    profiles: h?.profiles ?? null,
    kinds: h?.kinds ?? null,
    tick,
    initialRafProof,
    initialWarmCallbacks,
    initialDuplicateCallbacks: Number(entryDuplicateUsed),
    actualCallbackCount,
    rejectedCallback,
    latestMeasuredCallback,
    warmDiagnostic: warmDiagnostic.snapshot(),
    warmFrames,
    maxWarmRafGapMs,
    nativeCounterSamples,
    initialNativeCounter,
    warmTicks,
    warmSerial,
    measuredEndTick,
    measuredEndSerial,
    measuredTicks,
    frames,
    clockState,
    warmStarted,
    warmEnded,
    measurementStarted,
    measurementEnded,
    raw: {
      nativeCounters: binary64(nativeCounters.subarray(0, nativeCounterSamples)),
      frameMs: binary64(frameMs.subarray(0, frames)),
      workMs: binary64(workMs.subarray(0, frames)),
      tickMs: binary64(tickMs.subarray(0, measuredTicks)),
      rapierMs: binary64(rapierMs.subarray(0, measuredTicks)),
      uiMs: uiMs ? binary64(uiMs.subarray(0, frames)) : null,
      selectionMs: selectionMs ? binary64(selectionMs.subarray(0, measuredTicks)) : null,
    },
    distributions: errors.length
      ? null
      : {
          frame: rawQuantiles(Array.from(frameMs.subarray(0, frames))),
          work: rawQuantiles(Array.from(workMs.subarray(0, frames))),
          tick: rawQuantiles(Array.from(tickMs.subarray(0, measuredTicks))),
          rapier: rawQuantiles(Array.from(rapierMs.subarray(0, measuredTicks))),
        },
    allocatedRawBytes,
    selectionProofs,
    modeProofs,
    checkpoints,
    checksums: Object.fromEntries(
      Object.entries(checksums).map(([key, value]) => [key, value.read()]),
    ),
    maxSpeedMps,
    maxDisplacementM,
    maxRafGapMs,
    maximumPlayers,
    hudWrites,
    hudNodes: 4,
    hudListeners: 0,
    initialMechanics,
    finalMechanics,
    assignmentText: h?.assignmentText ?? null,
    heap: { heapBeforeAllocation, heapBeforeWarmup, heapAfterWarmup, liveHeap, beforeDisposeHeap },
    longTasks: longTaskSupported ? longTasks : null,
    gpuTimer: { status: 'NOT_COLLECTED', value: null },
    live,
    cleanup,
    causes: errors.map(String),
    causeDetails: errors.map((error) => errorEvidence(error)),
    scope:
      '70 retained native bodies30TAXI40CIVIL, mixedsedan/compact, bounded straight-placement pulse/brake fixture; historical comparison captured after production. Complete tick includes evidence assertions/checksums. Selection channel measures host prepare/settle bracket including callbacks/invariance reads, not purealgorithm. Synthetic scripted modes/list selection, no trustedkeys/fullgame/training/exactheap claim.',
  };
  try {
    await retain(record, errors.length ? 'FAILED' : 'PASS');
  } catch (error) {
    errors.push(error);
  }
  if (errors.length)
    throw new AggregateError(errors, 'Steady arm/cleanup/immutable evidence causes');
  return record;
}
