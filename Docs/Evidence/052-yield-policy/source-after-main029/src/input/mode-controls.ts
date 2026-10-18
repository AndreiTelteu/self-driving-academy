import type { ContractContext } from '../sessions';
import type { BodyIdentity, ControlMode } from '../vehicles';
import type { ControlAuthority, ControlAuthorityRequest } from './control-authority';
import {
  modeBoolean,
  modeContext,
  modeFields,
  modeInteger,
  modeText,
  requireMode,
  sameModeWorld,
} from './mode-boundary';

export const MODE_CONTROLS_LIMITS = Object.freeze({
  version: '067-mode-controls-v1' as const,
  intents: 16,
  inFlight: 1,
  heldCodes: 2,
  hz: 60,
  history: 0,
  idCodeUnits: 256,
});
export type ModeAction = 'M' | 'L';
export interface ModeEligibilityFact extends ContractContext {
  readonly version: '067-mode-eligibility-v1';
  readonly tick: number;
  readonly identity: BodyIdentity;
  readonly eligible: boolean | null;
}
export interface ModeControlsPorts {
  readonly readAuthority: ControlAuthority['getStats'];
  readonly selectedIdentity: () => BodyIdentity | null;
  readonly bodyIdentity: (id: string) => BodyIdentity | undefined;
  /** A current host eligibility fact, not inference from mode or a trainer activity claim. */
  readonly eligibility?: (
    identity: BodyIdentity,
    context: ContractContext,
    tick: number,
  ) => unknown;
}
export interface ModeControlsTime extends ContractContext {
  readonly version: '067-mode-controls-v1';
  readonly tick: number;
  readonly dtSeconds: number;
}
export interface ModeTickTicket extends ContractContext {
  readonly version: '067-mode-ticket-v1';
  readonly sequence: number;
  readonly tick: number;
  readonly baseTick: number;
  readonly identity: BodyIdentity | null;
  readonly mode: ControlMode;
  readonly requests: readonly ControlAuthorityRequest[];
}
export interface ControlModeView extends ContractContext {
  readonly version: '067-control-mode-view-v1';
  readonly tick: number;
  readonly identity: BodyIdentity | null;
  readonly mode: ControlMode;
  readonly actionIdentity: BodyIdentity | null;
  readonly learningEligible: boolean | null;
  readonly suspended: boolean;
  readonly fault: string | null;
}
export interface ModeControls {
  enqueue(action: ModeAction, expectedIdentity?: BodyIdentity): boolean;
  prepare(time: ModeControlsTime): ModeTickTicket;
  settle(ticket: ModeTickTicket): 'ACCEPTED' | 'PENDING' | 'FAULT';
  reject(ticket: ModeTickTicket): void;
  /** Root calls on focus/pause/remap/selection lifecycle changes, without advancing physics. */
  clear(): void;
  observe(): ControlModeView;
  reset(context: ContractContext, ports: ModeControlsPorts): void;
  getStats(): Readonly<{
    intents: number;
    inFlight: number;
    disposed: boolean;
    fault: string | null;
    projection: ControlModeView | null;
    retainedHistory: 0;
  }>;
  dispose(): void;
}
function action(value: unknown): ModeAction {
  requireMode(value === 'M' || value === 'L', 'Unknown mode action');
  return value;
}
function mode(value: unknown): ControlMode {
  requireMode(
    value === 'AUTO' || value === 'MANUAL' || value === 'LEARNING',
    'Unknown control mode',
  );
  return value;
}
function fold(from: ControlMode, key: ModeAction): ControlMode {
  return key === 'M'
    ? from === 'AUTO'
      ? 'MANUAL'
      : 'AUTO'
    : from === 'LEARNING'
      ? 'MANUAL'
      : 'LEARNING';
}
function nativeId(value: unknown): string {
  const d = modeFields(value, ['entityId', 'handle', 'generation']);
  const id = modeText(d.entityId);
  requireMode(typeof d.handle === 'number' && Number.isFinite(d.handle), 'Invalid native handle');
  requireMode(modeInteger(d.generation) > 0, 'Invalid native generation');
  return id;
}
function validatePorts(value: ModeControlsPorts): ModeControlsPorts {
  const names = Reflect.ownKeys(value);
  const d = modeFields(
    value,
    names.includes('eligibility')
      ? ['readAuthority', 'selectedIdentity', 'bodyIdentity', 'eligibility']
      : ['readAuthority', 'selectedIdentity', 'bodyIdentity'],
  );
  requireMode(
    typeof d.readAuthority === 'function' &&
      typeof d.selectedIdentity === 'function' &&
      typeof d.bodyIdentity === 'function' &&
      (d.eligibility === undefined || typeof d.eligibility === 'function'),
    'Synchronous mode ports required',
  );
  return Object.freeze(d) as unknown as ModeControlsPorts;
}
/** Input intentions only. Host applies ticket.requests through066 and then settles using actual066 state. */
export function createModeControls(
  context: ContractContext,
  initialPorts: ModeControlsPorts,
): ModeControls {
  let world = modeContext(context),
    ports: ModeControlsPorts | undefined = validatePorts(initialPorts);
  let queue: { action: ModeAction; identity: BodyIdentity; tick: number }[] = [],
    inFlight: ModeTickTicket | null = null,
    projection: ControlModeView | null = null,
    terminal: string | null = null,
    busy = false,
    disposed = false,
    sequence = 0;
  function mutate<T>(operation: () => T, allowFault = false): T {
    requireMode(!busy, 'Mode controls mutation reentrant');
    requireMode(!disposed, 'Mode controls disposed');
    requireMode(allowFault || terminal === null, 'Mode controls fault terminal');
    busy = true;
    try {
      return operation();
    } finally {
      busy = false;
    }
  }
  function native(value: unknown): BodyIdentity {
    const id = nativeId(value);
    requireMode(ports!.bodyIdentity(id) === value, 'Stale mode target identity');
    return value as BodyIdentity;
  }
  function read() {
    const d = modeFields(ports!.readAuthority(), [
      'context',
      'tick',
      'vehicles',
      'players',
      'seat',
      'suspended',
      'disposed',
      'fault',
      'retainedHistory',
      'retainedBatches',
    ]);
    const actualContext = modeContext(d.context);
    requireMode(sameModeWorld(world, actualContext), 'Foreign authority mode context');
    const tick = modeInteger(d.tick);
    requireMode(
      modeInteger(d.vehicles) <= 110 && modeInteger(d.players) <= 1,
      'Authority mode capacity',
    );
    requireMode(
      d.retainedHistory === 0 && d.retainedBatches === 0,
      'Unexpected authority retention',
    );
    const suspended = modeBoolean(d.suspended),
      ownerDisposed = modeBoolean(d.disposed);
    let seat: { identity: BodyIdentity; mode: 'MANUAL' | 'LEARNING' } | null = null;
    if (d.seat !== null) {
      const s = modeFields(d.seat, ['identity', 'mode']),
        m = mode(s.mode);
      requireMode(m !== 'AUTO', 'AUTO cannot occupy player seat');
      // Fault/disposal reports the last accepted seat; it is not a new native lookup/admission.
      if (d.fault !== null || ownerDisposed) nativeId(s.identity);
      seat = Object.freeze({
        identity:
          d.fault !== null || ownerDisposed ? (s.identity as BodyIdentity) : native(s.identity),
        mode: m,
      });
    }
    requireMode((seat ? 1 : 0) === d.players, 'Authority seat/player mismatch');
    let ownerFault: string | null = null;
    if (d.fault !== null) {
      const f = modeFields(d.fault, [
        'attemptedTick',
        'acceptedTick',
        'stage',
        'physicalTickAccepted',
      ]);
      modeInteger(f.attemptedTick);
      requireMode(modeInteger(f.acceptedTick) === tick, 'Authority fault tick mismatch');
      modeBoolean(f.physicalTickAccepted);
      requireMode(
        f.stage === 'KEYBOARD_CLEAR' || f.stage === 'CONTROLLER_ACTUATION',
        'Unknown authority fault',
      );
      ownerFault = f.stage;
    }
    return {
      context: actualContext,
      tick,
      seat,
      suspended,
      disposed: ownerDisposed,
      fault: ownerFault,
    };
  }
  function target() {
    const selected = ports!.selectedIdentity();
    return selected === null ? null : native(selected);
  }
  function publish(actual: ReturnType<typeof read>) {
    // Publish physical truth before consulting optional informational host data.
    if (actual.fault || actual.disposed) {
      terminal = actual.fault ?? 'AUTHORITY_DISPOSED';
      queue = [];
      inFlight = null;
    }
    let selected: BodyIdentity | null = null;
    try {
      selected = target();
    } catch {
      selected = null;
    }
    const identity = actual.seat?.identity ?? selected;
    const currentMode = actual.seat?.mode ?? 'AUTO';
    const base: ControlModeView = Object.freeze({
      ...actual.context,
      version: '067-control-mode-view-v1',
      tick: actual.tick,
      identity,
      actionIdentity: selected,
      mode: currentMode,
      learningEligible: currentMode === 'LEARNING' ? null : false,
      suspended: actual.suspended,
      fault: terminal,
    });
    projection = base;
    if (currentMode === 'LEARNING' && !terminal) {
      try {
        const value = ports!.eligibility?.(identity!, actual.context, actual.tick);
        if (value !== undefined && value !== null) {
          const f = modeFields(value, [
            'schemaVersion',
            'units',
            'sessionId',
            'worldEpoch',
            'version',
            'tick',
            'identity',
            'eligible',
          ]);
          const c = modeContext({
            schemaVersion: f.schemaVersion,
            units: f.units,
            sessionId: f.sessionId,
            worldEpoch: f.worldEpoch,
          });
          const eligible = f.eligible === null ? null : modeBoolean(f.eligible);
          if (
            f.version === '067-mode-eligibility-v1' &&
            sameModeWorld(world, c) &&
            modeInteger(f.tick) === actual.tick &&
            f.identity === identity
          ) {
            projection = Object.freeze({ ...base, learningEligible: eligible });
          }
        }
      } catch {
        // Optional stale, malformed, asynchronous or failed eligibility is unavailable.
        // It cannot hide an accepted authority state or become a training-status claim.
      }
    }
    return projection;
  }
  const initial = read();
  requireMode(!initial.disposed && !initial.fault, 'Mode controls need live nonfaulted authority');
  return {
    enqueue(key, expectedIdentity) {
      return mutate(() => {
        const value = action(key),
          actual = read();
        if (actual.disposed || actual.fault) {
          publish(actual);
          return false;
        }
        if (actual.suspended) {
          queue = [];
          inFlight = null;
          publish(actual);
          return false;
        }
        requireMode(inFlight === null, 'Mode tick awaiting settle');
        const selected = target();
        if (!selected || (expectedIdentity !== undefined && expectedIdentity !== selected))
          return false;
        if (
          queue.length >= MODE_CONTROLS_LIMITS.intents ||
          queue.some((v) => v.identity !== selected || v.tick !== actual.tick)
        ) {
          queue = [];
          throw Error('Mode burst capacity/target conflict; entire burst rejected');
        }
        queue.push({ action: value, identity: selected, tick: actual.tick });
        return true;
      });
    },
    prepare(time) {
      return mutate(() => {
        requireMode(inFlight === null, 'Mode tick awaiting settle');
        const d = modeFields(time, [
          'schemaVersion',
          'units',
          'sessionId',
          'worldEpoch',
          'version',
          'tick',
          'dtSeconds',
        ]);
        const c = modeContext({
          schemaVersion: d.schemaVersion,
          units: d.units,
          sessionId: d.sessionId,
          worldEpoch: d.worldEpoch,
        });
        requireMode(
          sameModeWorld(world, c) &&
            d.version === MODE_CONTROLS_LIMITS.version &&
            d.dtSeconds === 1 / 60,
          'Invalid mode physical time',
        );
        const actual = read();
        if (actual.fault || actual.disposed) {
          publish(actual);
          throw Error('Authority mode fault terminal');
        }
        requireMode(!actual.suspended, 'Authority mode suspended');
        const tick = modeInteger(d.tick);
        requireMode(tick === actual.tick + 1, 'Mode tick must be next actual tick');
        const identity = queue[0]?.identity ?? null;
        let requested: ControlMode =
          identity === actual.seat?.identity ? actual.seat!.mode : 'AUTO';
        if (identity) {
          native(identity);
          requireMode(
            queue.every((v) => v.identity === identity && v.tick === actual.tick),
            'Expired mode event tick',
          );
          for (const v of queue) requested = fold(requested, v.action);
        }
        const requests: ControlAuthorityRequest[] = [];
        const current = identity === actual.seat?.identity ? actual.seat!.mode : 'AUTO';
        if (identity && requested !== current) {
          if (requested !== 'AUTO' && actual.seat && actual.seat.identity !== identity)
            requests.push({ identity: actual.seat.identity, mode: 'AUTO' });
          requests.push({ identity, mode: requested });
        }
        requireMode(sequence < Number.MAX_SAFE_INTEGER, 'Mode ticket sequence exhausted');
        inFlight = Object.freeze({
          ...world,
          version: '067-mode-ticket-v1',
          sequence: ++sequence,
          tick,
          baseTick: actual.tick,
          identity,
          mode: requested,
          requests: Object.freeze(requests.map((r) => Object.freeze(r))),
        });
        queue = [];
        return inFlight;
      });
    },
    settle(ticket) {
      return mutate(() => {
        requireMode(inFlight === ticket, 'Foreign/expired mode ticket');
        const actual = read();
        if (actual.fault || actual.disposed) {
          publish(actual);
          return 'FAULT';
        }
        requireMode(
          actual.tick === ticket.baseTick || actual.tick === ticket.tick,
          'Host skipped mode settlement tick',
        );
        if (actual.tick === ticket.baseTick) return 'PENDING';
        publish(actual);
        inFlight = null;
        return 'ACCEPTED';
      });
    },
    reject(ticket) {
      mutate(() => {
        requireMode(inFlight === ticket, 'Foreign/expired mode ticket');
        const actual = read();
        requireMode(actual.tick === ticket.baseTick, 'Cannot reject accepted physical tick');
        inFlight = null;
        publish(actual);
      });
    },
    clear() {
      mutate(() => {
        queue = [];
        inFlight = null;
        publish(read());
      }, true);
    },
    observe() {
      return mutate(() => publish(read()), true);
    },
    reset(nextContext, nextPorts) {
      mutate(() => {
        const next = modeContext(nextContext);
        requireMode(
          next.sessionId !== world.sessionId || next.worldEpoch > world.worldEpoch,
          'Mode reset requires new lifecycle',
        );
        const validatedPorts = validatePorts(nextPorts);
        const previousWorld = world,
          previousPorts = ports;
        world = next;
        ports = validatedPorts;
        try {
          const actual = read();
          requireMode(!actual.disposed && !actual.fault, 'Replacement authority must be live');
          queue = [];
          inFlight = null;
          projection = null;
          terminal = null;
          sequence = 0;
        } catch (error) {
          world = previousWorld;
          ports = previousPorts;
          throw error;
        }
      }, true);
    },
    getStats() {
      return Object.freeze({
        intents: queue.length,
        inFlight: inFlight ? 1 : 0,
        disposed,
        fault: terminal,
        projection,
        retainedHistory: 0 as const,
      });
    },
    dispose() {
      requireMode(!busy, 'Mode controls mutation reentrant');
      if (disposed) return;
      disposed = true;
      queue = [];
      inFlight = null;
      projection = null;
      ports = undefined;
    },
  };
}
