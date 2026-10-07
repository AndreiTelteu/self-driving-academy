import type { ContractContext } from '../sessions';
import type {
  BodyIdentity,
  ControlMode,
  VehicleController,
  VehicleControllerFrame,
  VehicleCommandPacket,
} from '../vehicles';

export const CONTROL_AUTHORITY_LIMITS = Object.freeze({
  version: '066-control-authority-v1' as const,
  vehicles: 110,
  requests: 110,
  idCodeUnits: 256,
  playerSeats: 1,
  retainedHistory: 0,
  retainedBatches: 0,
  hz: 60,
});
export interface ControlAuthorityPorts {
  readonly bodyIdentity: (entityId: string) => BodyIdentity | undefined;
  /** Clears only the departed body's input. Invoked AFTER accepted024 state, never retarget input. */
  readonly clearOldPlayer?: (identity: BodyIdentity) => void;
}
export interface ControlAuthorityTime extends ContractContext {
  readonly version: '066-control-authority-v1';
  readonly tick: number;
  readonly dtSeconds: number;
}
export interface ControlAuthorityRequest {
  readonly identity: BodyIdentity;
  readonly mode: ControlMode;
}
export interface PlayerAuthoritySeat {
  readonly identity: BodyIdentity;
  readonly mode: 'MANUAL' | 'LEARNING';
}
export interface ControlAuthorityFault {
  readonly attemptedTick: number;
  readonly acceptedTick: number;
  readonly stage: 'CONTROLLER_ACTUATION' | 'KEYBOARD_CLEAR';
  readonly physicalTickAccepted: boolean;
}
export interface ControlAuthorityResult {
  readonly frame: VehicleControllerFrame;
  readonly seat: PlayerAuthoritySeat | null;
}
export interface ControlAuthority {
  register(identity: BodyIdentity): void;
  remove(identity: BodyIdentity): boolean;
  step(
    time: ControlAuthorityTime,
    packets?: readonly VehicleCommandPacket[] | unknown,
    requests?: readonly ControlAuthorityRequest[] | unknown,
    measure?: boolean,
  ): ControlAuthorityResult;
  suspend(): void;
  resume(): void;
  reset(
    context: ContractContext,
    controller: VehicleController,
    ports: ControlAuthorityPorts,
  ): void;
  getStats(): Readonly<{
    context: ContractContext;
    tick: number;
    vehicles: number;
    players: number;
    seat: PlayerAuthoritySeat | null;
    suspended: boolean;
    disposed: boolean;
    fault: ControlAuthorityFault | null;
    retainedHistory: 0;
    retainedBatches: 0;
  }>;
  dispose(): void;
}
function contextData(value: unknown): ContractContext {
  const result = Object.freeze(readContext(fields(value, contextFields)));
  requireContract(
    result.sessionId.length <= CONTROL_AUTHORITY_LIMITS.idCodeUnits,
    'Authority context capacity',
  );
  return result;
}
function identityId(value: unknown): string {
  const data = fields(value, ['entityId', 'handle', 'generation']),
    id = text(data.entityId);
  requireContract(id.length <= CONTROL_AUTHORITY_LIMITS.idCodeUnits, 'Authority identity capacity');
  number(data.handle);
  requireContract(tick(data.generation) > 0, 'Authority identity generation');
  return id;
}
function matchingContext(a: ContractContext, b: ContractContext): boolean {
  return (
    a.schemaVersion === b.schemaVersion &&
    a.units === b.units &&
    a.sessionId === b.sessionId &&
    a.worldEpoch === b.worldEpoch
  );
}
function validateComposition(
  context: ContractContext,
  controller: VehicleController,
  ports: ControlAuthorityPorts,
) {
  requireContract(
    typeof ports.bodyIdentity === 'function' &&
      (ports.clearOldPlayer === undefined || typeof ports.clearOldPlayer === 'function'),
    'Authority ports',
  );
  const stats = controller.getStats();
  requireContract(matchingContext(context, stats.context), 'Foreign authority controller context');
  requireContract(
    !stats.disposed &&
      !stats.fault &&
      !stats.suspended &&
      stats.vehicles === 0 &&
      stats.players === 0,
    'Authority requires a fresh empty live controller',
  );
  return stats.tick;
}

/** Bounded synchronous player-seat coordinator;024 remains the only command arbiter and physics owner. */
export function createControlAuthority(
  context: ContractContext,
  initialController: VehicleController,
  initialPorts: ControlAuthorityPorts,
): ControlAuthority {
  let world = contextData(context),
    controller: VehicleController | undefined = initialController,
    ports: ControlAuthorityPorts | undefined = initialPorts,
    currentTick = validateComposition(world, initialController, initialPorts);
  let registrations = new Map<string, BodyIdentity>(),
    seat: PlayerAuthoritySeat | null = null,
    fault: ControlAuthorityFault | null = null,
    busy = false,
    disposed = false,
    suspended = false;
  function mutate<T>(action: () => T, allowFault = false): T {
    requireContract(!busy, 'Authority mutation is reentrant');
    requireContract(!disposed, 'Authority disposed');
    requireContract(allowFault || fault === null, 'Authority fault is terminal');
    busy = true;
    try {
      return action();
    } finally {
      busy = false;
    }
  }
  function clearDeparted(prior: PlayerAuthoritySeat | null, physicalTickAccepted = false) {
    if (!prior || prior.identity === seat?.identity) return;
    try {
      const returned: unknown = ports!.clearOldPlayer?.(prior.identity);
      requireContract(returned === undefined, 'Authority clear callback must be synchronous void');
    } catch (error) {
      fault = Object.freeze({
        attemptedTick: currentTick,
        acceptedTick: currentTick,
        stage: 'KEYBOARD_CLEAR',
        physicalTickAccepted,
      });
      throw error;
    }
  }
  function token(value: unknown): BodyIdentity {
    const id = identityId(value);
    requireContract(
      registrations.get(id) === value && ports!.bodyIdentity(id) === value,
      'Stale authority body identity',
    );
    return value as BodyIdentity;
  }
  return {
    register(identity) {
      mutate(() => {
        const id = identityId(identity);
        requireContract(ports!.bodyIdentity(id) === identity, 'Stale authority body identity');
        const next = new Map<string, BodyIdentity>();
        for (const [key, value] of registrations)
          if (ports!.bodyIdentity(key) === value) next.set(key, value);
        requireContract(!next.has(id), 'Authority vehicle already registered');
        requireContract(
          next.size < CONTROL_AUTHORITY_LIMITS.vehicles,
          'Authority vehicle capacity',
        );
        controller!.register(identity);
        const prior = seat;
        next.set(id, identity);
        registrations = next;
        if (seat && registrations.get(seat.identity.entityId) !== seat.identity) seat = null;
        clearDeparted(prior);
      });
    },
    remove(identity) {
      return mutate(() => {
        const id = identityId(identity);
        if (registrations.get(id) !== identity) return false;
        const accepted = controller!.remove(identity);
        requireContract(accepted, 'Authority controller registration diverged');
        const prior = seat;
        registrations.delete(id);
        if (seat?.identity === identity) seat = null;
        clearDeparted(prior);
        return true;
      });
    },
    step(time, packets = [], requests = [], measure = false) {
      return mutate(() => {
        requireContract(!suspended, 'Authority suspended');
        const frame = fields(time, [...contextFields, 'version', 'tick', 'dtSeconds']),
          incoming = contextData(Object.fromEntries(contextFields.map((key) => [key, frame[key]])));
        requireContract(
          frame.version === CONTROL_AUTHORITY_LIMITS.version && matchingContext(world, incoming),
          'Foreign authority time/version',
        );
        const nextTick = tick(frame.tick);
        requireContract(nextTick === currentTick + 1, 'Authority tick must be next physical tick');
        number(frame.dtSeconds, 1 / 60, 1 / 60);
        requireContract(
          Array.isArray(requests) && requests.length <= CONTROL_AUTHORITY_LIMITS.requests,
          'Authority request capacity',
        );
        const changes = list(requests, (value) => {
          const data = fields(value, ['identity', 'mode']);
          return Object.freeze({
            identity: token(data.identity),
            mode: choice(data.mode, ['AUTO', 'MANUAL', 'LEARNING']),
          });
        });
        const changed = new Set<BodyIdentity>();
        let nextSeat = seat;
        // Resolve the final simultaneous state; release-old+claim-new is independent of request order.
        for (const change of changes) {
          requireContract(!changed.has(change.identity), 'Duplicate authority request');
          changed.add(change.identity);
          if (nextSeat?.identity === change.identity) nextSeat = null;
        }
        for (const change of changes)
          if (change.mode !== 'AUTO') {
            requireContract(nextSeat === null, 'Contradictory PLAYER claims');
            nextSeat = Object.freeze({ identity: change.identity, mode: change.mode });
          }
        let accepted: VehicleControllerFrame;
        try {
          accepted = controller!.step(
            { tick: nextTick, dtSeconds: 1 / 60 },
            packets,
            changes,
            measure,
          );
        } catch (error) {
          const actual = controller!.getStats();
          if (actual.fault)
            fault = Object.freeze({
              attemptedTick: nextTick,
              acceptedTick: actual.tick,
              stage: 'CONTROLLER_ACTUATION',
              physicalTickAccepted: false,
            });
          throw error;
        }
        // The published024 frame is authoritative: never commit a speculative request before physics accepts.
        let actualSeat: PlayerAuthoritySeat | null = null;
        const active = new Map<string, BodyIdentity>();
        for (const control of accepted.controls) {
          active.set(control.identity.entityId, control.identity);
          if (control.mode !== 'AUTO')
            actualSeat = Object.freeze({ identity: control.identity, mode: control.mode });
        }
        const prior = seat;
        registrations = active;
        seat = actualSeat;
        currentTick = accepted.tick;
        clearDeparted(prior, true);
        return Object.freeze({ frame: accepted, seat });
      });
    },
    suspend() {
      mutate(() => {
        controller!.suspend();
        suspended = true;
      });
    },
    resume() {
      mutate(() => {
        controller!.resume();
        suspended = false;
      });
    },
    reset(nextContext, nextController, nextPorts) {
      mutate(() => {
        const next = contextData(nextContext);
        requireContract(
          next.sessionId !== world.sessionId || next.worldEpoch > world.worldEpoch,
          'Authority reset requires real new lifecycle',
        );
        requireContract(
          nextController !== controller,
          'Authority reset needs replacement controller',
        );
        const initialTick = validateComposition(next, nextController, nextPorts);
        world = next;
        controller = nextController;
        ports = nextPorts;
        currentTick = initialTick;
        registrations = new Map();
        seat = null;
        fault = null;
        suspended = false;
      }, true);
    },
    getStats() {
      return Object.freeze({
        context: world,
        tick: currentTick,
        vehicles: registrations.size,
        players: seat ? 1 : 0,
        seat,
        suspended,
        disposed,
        fault,
        retainedHistory: 0 as const,
        retainedBatches: 0 as const,
      });
    },
    dispose() {
      requireContract(!busy, 'Authority mutation is reentrant');
      if (disposed) return;
      disposed = true;
      registrations.clear();
      seat = null;
      controller = undefined;
      ports = undefined;
    },
  };
}

// Adapter-local descriptor snapshot readers. Input consumes domain types only.
/** Small boundary readers shared by session-scoped domain contracts. */
class ContractValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractValidationError';
  }
}

function requireContract(condition: boolean, message: string): asserts condition {
  if (!condition) throw new ContractValidationError(message);
}

function record(value: unknown): Record<string, unknown> {
  requireContract(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    'Expected object',
  );
  const prototype: unknown = Object.getPrototypeOf(value);
  requireContract(
    prototype === Object.prototype || prototype === null,
    'Expected plain data object',
  );
  const result: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    requireContract(typeof key === 'string', 'Symbol fields are unsupported');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    requireContract(
      descriptor !== undefined && 'value' in descriptor && descriptor.enumerable === true,
      'Expected enumerable data fields',
    );
    const field: unknown = descriptor.value;
    result[key] = field;
  }
  return result;
}

function fields(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  const data = record(value);
  requireContract(
    Object.keys(data).length === allowed.length && allowed.every((key) => Object.hasOwn(data, key)),
    'Missing or unknown contract fields',
  );
  return data;
}

function number(value: unknown, minimum = -Infinity, maximum = Infinity): number {
  requireContract(
    typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum,
    'Expected finite number in range',
  );
  return value;
}

function tick(value: unknown): number {
  const result = number(value, 0, Number.MAX_SAFE_INTEGER);
  requireContract(Number.isSafeInteger(result), 'Expected safe nonnegative integer');
  return result;
}

function text(value: unknown): string {
  requireContract(typeof value === 'string' && value.trim().length > 0, 'Expected nonempty string');
  return value;
}

function choice<const T extends readonly string[]>(value: unknown, options: T): T[number] {
  for (const option of options) if (value === option) return option;
  throw new ContractValidationError('Unsupported enum value');
}

function list<T>(value: unknown, read: (value: unknown) => T): readonly T[] {
  requireContract(Array.isArray(value), 'Expected array');
  requireContract(
    Object.getPrototypeOf(value) === Array.prototype &&
      Reflect.ownKeys(value).length === value.length + 1,
    'Expected dense array without extra fields',
  );
  const result: T[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    requireContract(
      descriptor !== undefined && 'value' in descriptor && descriptor.enumerable === true,
      'Expected array data entries without accessors',
    );
    const entry: unknown = descriptor.value;
    result.push(read(entry));
  }
  return Object.freeze(result);
}

const contextFields = ['schemaVersion', 'units', 'sessionId', 'worldEpoch'] as const;

function readContext(data: Record<string, unknown>): ContractContext {
  requireContract(
    data.schemaVersion === 1 && data.units === 'SI',
    'Unsupported schema version or units',
  );
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: text(data.sessionId),
    worldEpoch: tick(data.worldEpoch),
  };
}
