import { number, record, requireContract, tick as readTick } from '../sessions';

export const FIXED_TICK_HZ = 60;
export const FIXED_DT_SECONDS = 1 / FIXED_TICK_HZ;
export const MAX_STEPS_PER_FRAME = 4;
export const OVERLOAD_DEBT_MS = 250;
const STEP_MS = 1000 / FIXED_TICK_HZ;
// A sub-nanosecond tolerance prevents representational error from losing a boundary tick.
const BOUNDARY_EPSILON_MS = 1e-7;

export type SnapshotReadonly<T> = T extends object
  ? { readonly [K in keyof T]: SnapshotReadonly<T[K]> }
  : T;
export type FixedTickStatus =
  'running' | 'manual' | 'background' | 'overload' | 'recovering' | 'fault' | 'disposed';
export interface FixedTickStep {
  readonly tick: number;
  readonly dtSeconds: number;
}
export interface FixedTickFault {
  readonly stage: 'step' | 'capture' | 'interpolate';
  readonly attemptedTick: number;
  readonly error: unknown;
}
export interface FixedTickState<T> {
  readonly status: FixedTickStatus;
  readonly tick: number;
  readonly simulatedSeconds: number;
  readonly activeRealSeconds: number;
  readonly debtSeconds: number;
  readonly alpha: number;
  readonly overloadCount: number;
  readonly fault: FixedTickFault | null;
  readonly snapshots: {
    readonly previous: SnapshotReadonly<T>;
    readonly current: SnapshotReadonly<T>;
  } | null;
}
export interface FixedTickFrame<T, View> {
  readonly state: FixedTickState<T>;
  readonly steps: number;
  readonly interpolated: SnapshotReadonly<View> | null;
}
export interface FixedTickOptions<T, View> {
  readonly initialTick?: number;
  /** Return a finite plain-data tree; the loop owns a frozen defensive copy. */
  readonly captureSnapshot: () => T;
  /** Synchronous, tick-addressed commands only; callbacks must return undefined. */
  readonly step: (step: FixedTickStep) => undefined;
  readonly interpolate: (
    previous: SnapshotReadonly<T>,
    current: SnapshotReadonly<T>,
    alpha: number,
  ) => View;
}
export interface FixedTickLoop<T, View> {
  frame(nowMs: number): FixedTickFrame<T, View>;
  pause(nowMs: number, reason?: 'manual' | 'background'): void;
  /** Explicit overload resumption drains debt without admitting additional wall time. */
  resume(nowMs: number): void;
  getState(): FixedTickState<T>;
  dispose(): void;
}

/** Copy plain data without reading getters or retaining references to mutable simulation state. */
function ownSnapshot<T>(value: T): SnapshotReadonly<T> {
  const ancestors = new Set<object>();
  function copy(input: unknown, depth: number): unknown {
    requireContract(depth <= 64, 'Snapshot tree exceeds maximum depth');
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
    if (typeof input === 'number') return number(input);
    requireContract(
      typeof input === 'object' && input !== null,
      'Snapshot must be a plain data tree',
    );
    requireContract(!ancestors.has(input), 'Cyclic snapshot is unsupported');
    ancestors.add(input);
    let result: unknown;
    if (Array.isArray(input)) {
      requireContract(
        Object.getPrototypeOf(input) === Array.prototype &&
          Reflect.ownKeys(input).length === input.length + 1,
        'Expected dense snapshot array',
      );
      const values: unknown[] = [];
      for (let index = 0; index < input.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
        requireContract(
          descriptor !== undefined && 'value' in descriptor && descriptor.enumerable === true,
          'Snapshot accessors or sparse arrays are unsupported',
        );
        values.push(copy(descriptor.value, depth + 1));
      }
      result = Object.freeze(values);
    } else {
      const fields = record(input);
      const output: Record<string, unknown> = {};
      for (const key of Object.keys(fields)) {
        Object.defineProperty(output, key, {
          value: copy(fields[key], depth + 1),
          enumerable: true,
        });
      }
      result = Object.freeze(output);
    }
    ancestors.delete(input);
    return result;
  }
  return copy(value, 0) as SnapshotReadonly<T>;
}

/** Pure fixed-rate core; clock/visibility/RAF and world services are injected by its caller. */
export function createFixedTickLoop<T, View>(
  options: FixedTickOptions<T, View>,
): FixedTickLoop<T, View> {
  const initialTick = readTick(options.initialTick ?? 0);
  let tick = initialTick;
  let status: FixedTickStatus = 'running';
  let clockMs: number | null = null;
  let activeRealMs = 0;
  let debtMs = 0;
  let overloadCount = 0;
  let recoveryPending = false;
  let fault: FixedTickFault | null = null;
  const initialSnapshot = ownSnapshot(options.captureSnapshot());
  let snapshots: FixedTickState<T>['snapshots'] = Object.freeze({
    previous: initialSnapshot,
    current: initialSnapshot,
  });
  let busy = false;
  const assertAvailable = () => {
    requireContract(!busy, 'Reentrant fixed-tick operation is unsupported');
    requireContract(status !== 'disposed', 'Fixed-tick loop is disposed');
    requireContract(
      status !== 'fault',
      'Fixed-tick loop is faulted; recover the authoritative world explicitly',
    );
  };
  const validateClock = (nowMs: number) => {
    const now = number(nowMs, 0, Number.MAX_SAFE_INTEGER);
    requireContract(clockMs === null || now >= clockMs, 'Clock cannot regress');
    return now;
  };
  const admitTime = (now: number) => {
    const elapsed = clockMs === null ? 0 : now - clockMs;
    const nextReal = number(activeRealMs + elapsed, 0, Number.MAX_SAFE_INTEGER);
    const nextDebt = number(debtMs + elapsed, 0, Number.MAX_SAFE_INTEGER);
    activeRealMs = nextReal;
    debtMs = nextDebt;
  };
  const getState = (): FixedTickState<T> =>
    Object.freeze({
      status,
      tick,
      simulatedSeconds: (tick - initialTick) * FIXED_DT_SECONDS,
      activeRealSeconds: activeRealMs / 1000,
      debtSeconds: debtMs / 1000,
      alpha: Math.min(1, debtMs / STEP_MS),
      overloadCount,
      fault,
      snapshots,
    });
  return Object.freeze({
    frame(nowMs: number): FixedTickFrame<T, View> {
      assertAvailable();
      const now = validateClock(nowMs);
      if (status === 'running') admitTime(now);
      clockMs = now;
      if (status === 'running' && debtMs > OVERLOAD_DEBT_MS) {
        status = 'overload';
        recoveryPending = true;
        overloadCount += 1;
      }
      let steps = 0;
      let interpolated: SnapshotReadonly<View> | null = null;
      let stage: FixedTickFault['stage'] = 'step';
      let attemptedTick = tick;
      busy = true;
      try {
        if (status === 'running' || status === 'recovering') {
          while (steps < MAX_STEPS_PER_FRAME && debtMs + BOUNDARY_EPSILON_MS >= STEP_MS) {
            stage = 'step';
            attemptedTick = readTick(tick + 1);
            const result: unknown = options.step(
              Object.freeze({ tick: attemptedTick, dtSeconds: FIXED_DT_SECONDS }),
            );
            requireContract(
              result === undefined,
              'Fixed step must be synchronous and return undefined',
            );
            stage = 'capture';
            const captured = ownSnapshot(options.captureSnapshot());
            requireContract(snapshots !== null, 'Snapshots unavailable');
            snapshots = Object.freeze({ previous: snapshots.current, current: captured });
            tick = attemptedTick;
            debtMs = Math.max(0, debtMs - STEP_MS);
            steps += 1;
          }
          if (status === 'recovering' && debtMs + BOUNDARY_EPSILON_MS < STEP_MS) {
            status = 'running';
            recoveryPending = false;
          }
        }
        stage = 'interpolate';
        attemptedTick = tick;
        requireContract(snapshots !== null, 'Snapshots unavailable');
        interpolated = ownSnapshot(
          options.interpolate(snapshots.previous, snapshots.current, getState().alpha),
        );
      } catch (error: unknown) {
        fault = Object.freeze({ stage, attemptedTick, error });
        status = 'fault';
      } finally {
        busy = false;
      }
      return Object.freeze({ state: getState(), steps, interpolated });
    },
    pause(nowMs: number, reason: 'manual' | 'background' = 'manual') {
      assertAvailable();
      requireContract(reason === 'manual' || reason === 'background', 'Invalid pause reason');
      const now = validateClock(nowMs);
      if (status === 'running') admitTime(now);
      clockMs = now;
      if (debtMs > OVERLOAD_DEBT_MS && !recoveryPending) {
        recoveryPending = true;
        overloadCount += 1;
      }
      status = reason;
    },
    resume(nowMs: number) {
      assertAvailable();
      requireContract(status !== 'running' && status !== 'recovering', 'Loop is already active');
      clockMs = validateClock(nowMs);
      status = recoveryPending ? 'recovering' : 'running';
    },
    getState,
    dispose() {
      if (status === 'disposed') return;
      requireContract(!busy, 'Reentrant fixed-tick disposal is unsupported');
      status = 'disposed';
      snapshots = null;
    },
  });
}
