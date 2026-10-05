import {
  boolean,
  choice,
  contextFields,
  fields,
  list,
  number,
  readContext,
  requireContract,
  text,
  tick,
} from '../sessions';
import type { ContractContext } from '../sessions';
import { controlModes, parseVehicleCommand } from './contracts';
import type { ControlMode, VehicleCommand } from './contracts';
import type { BodyIdentity } from './body-port';
import type { PhysicsCosts } from './physics';
import { CONTROLLER_LIMITS } from './controller-port';
import type {
  VehicleActuationInput,
  VehicleActuationPort,
  VehicleControlProjection,
  VehicleController,
  VehicleControllerFrame,
} from './controller-port';

interface Entry {
  readonly identity: BodyIdentity;
  mode: ControlMode;
  target: VehicleCommand | null;
  control: VehicleControlProjection | null;
}
const sourceFor = (mode: ControlMode): VehicleCommand['source'] =>
  mode === 'AUTO' ? 'AUTONOMY' : 'PLAYER';
function boundedId(value: unknown): string {
  const result = text(value);
  requireContract(result.length <= CONTROLLER_LIMITS.idCodeUnits, 'Controller identity capacity');
  return result;
}
function identityId(identity: unknown): string {
  const data = fields(identity, ['entityId', 'handle', 'generation']);
  const id = boundedId(data.entityId);
  number(data.handle);
  requireContract(tick(data.generation) > 0, 'Controller identity generation');
  return id;
}
function batch<T>(value: unknown, maximum: number, read: (value: unknown) => T): readonly T[] {
  requireContract(Array.isArray(value) && value.length <= maximum, 'Controller batch capacity');
  return list(value, read);
}
function copyCosts(value: unknown): PhysicsCosts {
  const data = fields(value, [
    'controllerMs',
    'stepMs',
    'queryMs',
    'bridgeMs',
    'totalMs',
    'queryCount',
    'bridgeCalls',
  ]);
  return Object.freeze({
    controllerMs: number(data.controllerMs, 0),
    stepMs: number(data.stepMs, 0),
    queryMs: number(data.queryMs, 0),
    bridgeMs: number(data.bridgeMs, 0),
    totalMs: number(data.totalMs, 0),
    queryCount: tick(data.queryCount),
    bridgeCalls: tick(data.bridgeCalls),
  });
}

/** Synchronous, bounded command owner; composition root supplies every physical tick. */
export function createVehicleController(
  context: ContractContext,
  port: VehicleActuationPort,
  initialTick = 0,
): VehicleController {
  const world = Object.freeze(readContext(fields(context, contextFields)));
  boundedId(world.sessionId);
  requireContract(
    typeof port.bodyIdentity === 'function' && typeof port.step === 'function',
    'Controller actuation port',
  );
  let actuationPort: VehicleActuationPort | undefined = port;
  let entries = new Map<string, Entry>();
  let currentTick = tick(initialTick),
    busy = false,
    suspended = false,
    disposed = false;
  let lastIgnoredCount = 0;
  let fault: { readonly attemptedTick: number; readonly stage: 'ACTUATION' } | null = null;
  function mutate<T>(work: () => T): T {
    if (busy) throw new Error('Controller mutation is reentrant');
    if (disposed) throw new Error('Controller disposed');
    if (fault) throw new Error('Controller fault is terminal');
    busy = true;
    try {
      return work();
    } finally {
      busy = false;
    }
  }
  function activeCopy(): Map<string, Entry> {
    const result = new Map<string, Entry>();
    for (const [id, entry] of entries) {
      if (actuationPort!.bodyIdentity(id) === entry.identity) result.set(id, { ...entry });
    }
    return result;
  }
  return {
    register(identity) {
      mutate(() => {
        const id = identityId(identity);
        requireContract(
          actuationPort!.bodyIdentity(id) === identity,
          'Stale controller body identity',
        );
        const active = activeCopy();
        requireContract(!active.has(id), 'Controller vehicle already registered');
        requireContract(active.size < CONTROLLER_LIMITS.vehicles, 'Controller vehicle capacity');
        active.set(id, { identity, mode: 'AUTO', target: null, control: null });
        entries = active;
      });
    },
    remove(identity) {
      return mutate(() => {
        const id = identityId(identity);
        if (entries.get(id)?.identity !== identity) return false;
        entries.delete(id);
        return true;
      });
    },
    step(frame, packets = [], authorityChanges = [], measure = false) {
      return mutate(() => {
        if (suspended) throw new Error('Controller suspended');
        const time = fields(frame, ['tick', 'dtSeconds']);
        const nextTick = tick(time.tick);
        number(time.dtSeconds, 1 / CONTROLLER_LIMITS.hz, 1 / CONTROLLER_LIMITS.hz);
        requireContract(nextTick === currentTick + 1, 'Controller tick must be next physical tick');
        boolean(measure);
        const active = activeCopy();
        const changes = batch(authorityChanges, CONTROLLER_LIMITS.authorityChanges, (value) => {
          const data = fields(value, ['identity', 'mode']);
          const id = identityId(data.identity);
          requireContract(
            active.get(id)?.identity === data.identity,
            'Stale controller authority identity',
          );
          return { id, mode: choice(data.mode, controlModes) };
        });
        const changed = new Set<string>();
        for (const change of changes) {
          requireContract(!changed.has(change.id), 'Duplicate controller authority change');
          changed.add(change.id);
          const entry = active.get(change.id)!;
          if (sourceFor(entry.mode) !== sourceFor(change.mode)) entry.target = null;
          entry.mode = change.mode;
        }
        requireContract(
          [...active.values()].filter((entry) => entry.mode !== 'AUTO').length <= 1,
          'Only one PLAYER vehicle',
        );
        const addressed = batch(packets, CONTROLLER_LIMITS.packets, (value) => {
          const data = fields(value, ['identity', 'command']);
          const command = parseVehicleCommand(data.command);
          boundedId(command.vehicleId);
          boundedId(command.sessionId);
          requireContract(
            command.sessionId === world.sessionId && command.worldEpoch === world.worldEpoch,
            'Controller command world',
          );
          requireContract(command.tick === nextTick, 'Controller command tick');
          requireContract(
            active.get(command.vehicleId)?.identity === data.identity,
            'Stale controller command identity',
          );
          return command;
        });
        const candidates = new Map<string, Map<VehicleCommand['source'], VehicleCommand>>();
        for (const command of addressed) {
          const sources = candidates.get(command.vehicleId) ?? new Map();
          requireContract(!sources.has(command.source), 'Duplicate controller source command');
          sources.set(command.source, command);
          candidates.set(command.vehicleId, sources);
        }
        const controls: VehicleControlProjection[] = [];
        const ignoredCommands: VehicleControllerFrame['ignoredCommands'][number][] = [];
        const physicalInputs = new Map<string, VehicleActuationInput>();
        for (const [id, entry] of active) {
          const source = sourceFor(entry.mode),
            sources = candidates.get(id);
          const submitted = sources?.get(source);
          for (const candidate of sources?.values() ?? []) {
            if (candidate.source !== source)
              ignoredCommands.push(
                Object.freeze({
                  vehicleId: id,
                  source: candidate.source,
                  reason: 'NO_AUTHORITY' as const,
                }),
              );
          }
          if (entry.mode === 'AUTO' && submitted) entry.target = submitted;
          if (entry.target && nextTick - entry.target.tick >= CONTROLLER_LIMITS.targetTicks)
            entry.target = null;
          const raw = submitted ?? (entry.mode === 'AUTO' ? entry.target : null);
          const command: VehicleCommand = Object.freeze({
            ...world,
            vehicleId: id,
            tick: nextTick,
            source,
            throttle: raw && raw.brake === 0 && !raw.handbrake ? raw.throttle : 0,
            brake: raw?.brake ?? 0,
            steering: raw?.steering ?? 0,
            handbrake: raw?.handbrake ?? false,
            turnSignal: raw?.turnSignal ?? 'OFF',
          });
          const signalStartedTick =
            command.turnSignal === 'OFF'
              ? null
              : entry.control?.turnSignal === command.turnSignal
                ? entry.control.signalStartedTick
                : nextTick;
          const on =
            signalStartedTick !== null && Math.floor((nextTick - signalStartedTick) / 30) % 2 === 0;
          const control: VehicleControlProjection = Object.freeze({
            identity: entry.identity,
            mode: entry.mode,
            tick: nextTick,
            targetTick: raw?.tick ?? null,
            raw,
            command,
            turnSignal: command.turnSignal,
            signalStartedTick,
            leftIndicatorOn:
              on && (command.turnSignal === 'LEFT' || command.turnSignal === 'HAZARD'),
            rightIndicatorOn:
              on && (command.turnSignal === 'RIGHT' || command.turnSignal === 'HAZARD'),
          });
          entry.control = control;
          controls.push(control);
          physicalInputs.set(
            id,
            Object.freeze({
              throttle: command.throttle,
              brake: command.brake,
              steering: command.steering,
              handbrake: command.handbrake,
            }),
          );
        }
        // Untrusted descriptor/proxy reads above may have replaced a native body.
        // Reject the whole batch before ID-based actuation can reach its replacement.
        for (const [id, entry] of active)
          requireContract(
            actuationPort!.bodyIdentity(id) === entry.identity,
            'Controller body changed during admission',
          );
        let physics: PhysicsCosts;
        try {
          physics = copyCosts(actuationPort!.step(physicalInputs, measure));
        } catch (error) {
          fault = Object.freeze({ attemptedTick: nextTick, stage: 'ACTUATION' });
          throw error;
        }
        entries = active;
        currentTick = nextTick;
        lastIgnoredCount = ignoredCommands.length;
        return Object.freeze({
          tick: nextTick,
          controls: Object.freeze(controls),
          ignoredCommands: Object.freeze(ignoredCommands),
          physics,
        });
      });
    },
    readControl(identity) {
      if (disposed) return undefined;
      const id = identityId(identity),
        entry = entries.get(id);
      return entry?.identity === identity && actuationPort!.bodyIdentity(id) === identity
        ? (entry.control ?? undefined)
        : undefined;
    },
    suspend() {
      mutate(() => {
        suspended = true;
        for (const entry of entries.values()) entry.target = null;
      });
    },
    resume() {
      mutate(() => {
        suspended = false;
      });
    },
    getStats() {
      return Object.freeze({
        context: world,
        tick: currentTick,
        vehicles: entries.size,
        targets: [...entries.values()].filter((entry) => entry.target !== null).length,
        projections: [...entries.values()].filter((entry) => entry.control !== null).length,
        players: [...entries.values()].filter((entry) => entry.mode !== 'AUTO').length,
        retainedBatches: 0 as const,
        lastIgnoredCount,
        suspended,
        disposed,
        fault,
      });
    },
    dispose() {
      if (busy) throw new Error('Controller mutation is reentrant');
      if (disposed) return;
      disposed = true;
      entries.clear();
      actuationPort = undefined;
      lastIgnoredCount = 0;
    },
  };
}
