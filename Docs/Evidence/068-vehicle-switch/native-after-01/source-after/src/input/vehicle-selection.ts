import type { ContractContext } from '../sessions';
import type { BodyIdentity } from '../vehicles/body-port';
import type {
  ControlAuthority,
  ControlAuthorityRequest,
  PlayerAuthoritySeat,
} from './control-authority';
import {
  modeBoolean,
  modeContext,
  modeFields,
  modeInteger,
  modeText,
  requireMode,
  sameModeWorld,
} from './mode-boundary';

export const VEHICLE_SELECTION_LIMITS = Object.freeze({
  version: '068-vehicle-selection-v1' as const,
  vehicles: 110,
  pending: 1,
  tickets: 1,
  projections: 1,
  idCodeUnits: 256,
  history: 0,
  hz: 60,
});
export type VehicleSelectionKind = 'TAXI' | 'CIVIL';
export type VehicleSelectionSource = 'WORLD' | 'FLEET';
export interface SelectionPresentation {
  readonly identity: BodyIdentity;
  readonly kind: VehicleSelectionKind;
  readonly visible: boolean;
  readonly selectable: boolean;
}
export interface SelectionAssignment {
  readonly context: ContractContext;
  readonly identity: BodyIdentity;
  readonly routeFingerprint: string;
  readonly tripFingerprint: string | null;
}
/** Compact actual005 metadata readback; the host owns its complete segment and samples. */
export interface SelectionSegmentBoundary {
  readonly context: ContractContext;
  readonly identity: BodyIdentity;
  readonly segmentId: string;
  readonly mode: 'MANUAL' | 'LEARNING';
  readonly startTick: number;
  readonly endTick: number | null;
  readonly completeness: 'OPEN' | 'CLOSED';
  readonly closeReason: 'VEHICLE_SWITCH' | null;
}
export interface SelectionCloseEvent extends ContractContext {
  readonly version: '068-selection-close-v1';
  readonly identity: BodyIdentity;
  readonly segmentId: string;
  readonly mode: 'MANUAL' | 'LEARNING';
  readonly tick: number;
  readonly reason: 'VEHICLE_SWITCH';
}
export interface VehicleSelectionPorts {
  readonly readAuthority: ControlAuthority['getStats'];
  readonly bodyIdentity: (id: string) => BodyIdentity | undefined;
  /** WORLD callers supply an actual018 nearest-hit token; this port reads its current presentation. */
  readonly readPresentation: (identity: BodyIdentity) => SelectionPresentation;
  readonly readCameraTarget: () => BodyIdentity | null;
  readonly selectCamera: (identity: BodyIdentity) => void;
  /** Clears067 mode-key held/pending/UI intentions before another mode ticket is prepared.
   * Full025 driving-held/filter reset stays in existing066.clearOldPlayer AFTER accepted physics;
   * invoking it here would reset current-tick ramps and change physical command provenance. */
  readonly clearInput: () => void;
  readonly readAssignment: (identity: BodyIdentity) => SelectionAssignment;
  readonly readBoundary: (identity: BodyIdentity) => SelectionSegmentBoundary | null;
  readonly closeBoundary: (event: SelectionCloseEvent) => void;
}
export interface VehicleSelectionTime extends ContractContext {
  readonly version: '068-vehicle-selection-v1';
  readonly tick: number;
  readonly dtSeconds: number;
}
export interface VehicleSelectionTicket extends ContractContext {
  readonly version: '068-selection-ticket-v1';
  readonly sequence: number;
  readonly tick: number;
  readonly baseTick: number;
  readonly identity: BodyIdentity;
  readonly source: VehicleSelectionSource;
  readonly requests: readonly ControlAuthorityRequest[];
}
export interface VehicleSelectionView extends ContractContext {
  readonly version: '068-selection-view-v1';
  readonly tick: number;
  readonly selectedIdentity: BodyIdentity | null;
  readonly pendingIdentity: BodyIdentity | null;
  readonly seat: PlayerAuthoritySeat | null;
  readonly suspended: boolean;
  readonly fault: string | null;
}
export interface VehicleSelection {
  register(identity: BodyIdentity, kind: VehicleSelectionKind): void;
  remove(identity: BodyIdentity): boolean;
  enqueue(identity: BodyIdentity, source: VehicleSelectionSource): boolean;
  prepare(time: VehicleSelectionTime): VehicleSelectionTicket | null;
  settle(ticket: VehicleSelectionTicket): 'ACCEPTED' | 'PENDING' | 'FAULT';
  reject(ticket: VehicleSelectionTicket): void;
  clearPending(): void;
  observe(): VehicleSelectionView;
  getStats(): Readonly<{
    vehicles: number;
    pending: number;
    inFlight: number;
    projection: VehicleSelectionView | null;
    conflict: boolean;
    disposed: boolean;
    fault: string | null;
    retainedHistory: 0;
  }>;
  dispose(): void;
}
function identityId(value: unknown): string {
  const d = modeFields(value, ['entityId', 'handle', 'generation']);
  const id = modeText(d.entityId);
  requireMode(
    typeof d.handle === 'number' && Number.isFinite(d.handle),
    'Invalid selection native handle',
  );
  requireMode(modeInteger(d.generation) > 0, 'Invalid selection native generation');
  return id;
}
function kind(value: unknown): VehicleSelectionKind {
  requireMode(value === 'TAXI' || value === 'CIVIL', 'Unknown selection kind');
  return value;
}
function portsData(value: VehicleSelectionPorts): VehicleSelectionPorts {
  const d = modeFields(value, [
    'readAuthority',
    'bodyIdentity',
    'readPresentation',
    'readCameraTarget',
    'selectCamera',
    'clearInput',
    'readAssignment',
    'readBoundary',
    'closeBoundary',
  ]);
  requireMode(
    Object.values(d).every((v) => typeof v === 'function'),
    'Synchronous selection ports required',
  );
  return Object.freeze(d) as unknown as VehicleSelectionPorts;
}
/** Selection intentions only; host applies one exact ticket through existing066, then settles actual state. */
export function createVehicleSelection(
  context: ContractContext,
  initialPorts: VehicleSelectionPorts,
): VehicleSelection {
  const world = modeContext(context);
  let ports: VehicleSelectionPorts | undefined = portsData(initialPorts);
  const registrations = new Map<string, { identity: BodyIdentity; kind: VehicleSelectionKind }>();
  let pending: { identity: BodyIdentity; source: VehicleSelectionSource } | null = null;
  let inFlight: {
    ticket: VehicleSelectionTicket;
    priorState: ReturnType<typeof actual>;
    priorSeat: PlayerAuthoritySeat | null;
    departure: PlayerAuthoritySeat | null;
    boundary: SelectionSegmentBoundary | null;
    assignments: readonly SelectionAssignment[];
  } | null = null;
  let projection: VehicleSelectionView | null = null,
    terminal: string | null = null,
    busy = false,
    disposed = false,
    conflict = false,
    sequence = 0;
  function mutate<T>(operation: () => T, allowFault = false): T {
    requireMode(!busy, 'Selection mutation reentrant');
    requireMode(!disposed, 'Selection disposed');
    requireMode(allowFault || terminal === null, 'Selection fault terminal');
    busy = true;
    try {
      return operation();
    } finally {
      busy = false;
    }
  }
  function token(value: unknown): BodyIdentity {
    const id = identityId(value);
    requireMode(
      registrations.get(id)?.identity === value && ports!.bodyIdentity(id) === value,
      'Stale/unregistered selection identity',
    );
    return value as BodyIdentity;
  }
  function actual() {
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
    const c = modeContext(d.context),
      tick = modeInteger(d.tick);
    requireMode(sameModeWorld(world, c), 'Foreign selection authority context');
    requireMode(
      modeInteger(d.vehicles) <= 110 &&
        modeInteger(d.players) <= 1 &&
        d.retainedHistory === 0 &&
        d.retainedBatches === 0,
      'Invalid selection authority capacity',
    );
    const suspended = modeBoolean(d.suspended),
      ownerDisposed = modeBoolean(d.disposed);
    let fault: string | null = null;
    if (d.fault !== null) {
      const f = modeFields(d.fault, [
        'attemptedTick',
        'acceptedTick',
        'stage',
        'physicalTickAccepted',
      ]);
      modeInteger(f.attemptedTick);
      requireMode(modeInteger(f.acceptedTick) === tick, 'Authority fault accepted tick mismatch');
      modeBoolean(f.physicalTickAccepted);
      requireMode(
        f.stage === 'KEYBOARD_CLEAR' || f.stage === 'CONTROLLER_ACTUATION',
        'Unknown selection authority fault',
      );
      fault = f.stage;
    }
    let seat: PlayerAuthoritySeat | null = null;
    if (d.seat !== null) {
      const s = modeFields(d.seat, ['identity', 'mode']);
      identityId(s.identity);
      requireMode(s.mode === 'MANUAL' || s.mode === 'LEARNING', 'Invalid selection player mode');
      seat = Object.freeze({ identity: s.identity as BodyIdentity, mode: s.mode });
    }
    requireMode(d.players === (seat ? 1 : 0), 'Authority selection seat mismatch');
    return { context: c, tick, seat, suspended, disposed: ownerDisposed, fault };
  }
  function publish(state: ReturnType<typeof actual>) {
    if (state.fault || state.disposed) terminal = state.fault ?? 'AUTHORITY_DISPOSED';
    let selected: BodyIdentity | null = null;
    // Informational teardown camera failures cannot hide accepted physical tick/seat.
    try {
      const candidate = ports!.readCameraTarget();
      if (candidate !== null) {
        identityId(candidate);
        selected = candidate;
      }
    } catch {
      selected = null;
    }
    projection = Object.freeze({
      ...state.context,
      version: '068-selection-view-v1',
      tick: state.tick,
      selectedIdentity: selected,
      pendingIdentity: pending?.identity ?? null,
      seat: state.seat,
      suspended: state.suspended,
      fault: terminal,
    });
    return projection;
  }
  function admissible(identity: BodyIdentity, source: VehicleSelectionSource) {
    token(identity);
    const d = modeFields(ports!.readPresentation(identity), [
      'identity',
      'kind',
      'visible',
      'selectable',
    ]);
    requireMode(
      d.identity === identity && kind(d.kind) === registrations.get(identityId(identity))!.kind,
      'Selection presentation/native kind mismatch',
    );
    const visible = modeBoolean(d.visible),
      selectable = modeBoolean(d.selectable);
    token(identity);
    return source === 'FLEET' ? d.kind === 'TAXI' : visible && selectable;
  }
  function assignment(identity: BodyIdentity): SelectionAssignment {
    token(identity);
    const d = modeFields(ports!.readAssignment(identity), [
      'context',
      'identity',
      'routeFingerprint',
      'tripFingerprint',
    ]);
    const c = modeContext(d.context);
    requireMode(
      sameModeWorld(world, c) && d.identity === identity,
      'Selection assignment identity/context mismatch',
    );
    token(identity);
    return Object.freeze({
      context: c,
      identity,
      routeFingerprint: modeText(d.routeFingerprint),
      tripFingerprint: d.tripFingerprint === null ? null : modeText(d.tripFingerprint),
    });
  }
  function boundary(identity: BodyIdentity): SelectionSegmentBoundary {
    token(identity);
    const d = modeFields(ports!.readBoundary(identity), [
      'context',
      'identity',
      'segmentId',
      'mode',
      'startTick',
      'endTick',
      'completeness',
      'closeReason',
    ]);
    const c = modeContext(d.context);
    requireMode(
      sameModeWorld(world, c) && d.identity === identity,
      'Selection segment identity/context mismatch',
    );
    requireMode(d.mode === 'MANUAL' || d.mode === 'LEARNING', 'Selection segment control mode');
    requireMode(
      d.completeness === 'OPEN' || d.completeness === 'CLOSED',
      'Selection segment completeness',
    );
    const startTick = modeInteger(d.startTick),
      endTick = d.endTick === null ? null : modeInteger(d.endTick);
    requireMode(
      d.closeReason === null || d.closeReason === 'VEHICLE_SWITCH',
      'Selection segment close reason',
    );
    requireMode(
      d.completeness === 'OPEN'
        ? endTick === null && d.closeReason === null
        : endTick !== null && endTick >= startTick && d.closeReason === 'VEHICLE_SWITCH',
      'Selection segment lifecycle mismatch',
    );
    token(identity);
    return Object.freeze({
      context: c,
      identity,
      segmentId: modeText(d.segmentId),
      mode: d.mode,
      startTick,
      endTick,
      completeness: d.completeness,
      closeReason: d.closeReason,
    });
  }
  function fail(stage: string, state: ReturnType<typeof actual>) {
    terminal = stage;
    pending = null;
    inFlight = null;
    publish(state);
    return 'FAULT' as const;
  }
  function callbackFailure(stage: string, error: unknown, prior: ReturnType<typeof actual>) {
    let latest = prior;
    try {
      latest = actual();
    } catch {
      /* Last readable accepted truth remains explicitly historical. */
    }
    return fail(stage + ': ' + String(error).slice(0, 256), latest);
  }
  return {
    register(identity, classification) {
      mutate(() => {
        const id = identityId(identity),
          type = kind(classification);
        requireMode(
          !inFlight && !pending && ports!.bodyIdentity(id) === identity,
          'Selection registration state/token',
        );
        const prior = registrations.get(id);
        requireMode(
          !prior || prior.identity === identity,
          'Remove old selection incarnation first',
        );
        requireMode(
          prior !== undefined || registrations.size < 110,
          'Selection registration capacity',
        );
        requireMode(!prior || prior.kind === type, 'Selection registered kind cannot change');
        registrations.set(id, { identity, kind: type });
      });
    },
    remove(identity) {
      return mutate(() => {
        const id = identityId(identity);
        requireMode(
          !inFlight && pending?.identity !== identity,
          'Selection identity has pending ticket',
        );
        if (registrations.get(id)?.identity !== identity) return false;
        requireMode(
          actual().seat?.identity !== identity,
          'Release controlled selection before removal',
        );
        return registrations.delete(id);
      });
    },
    enqueue(identity, source) {
      return mutate(() => {
        requireMode(source === 'WORLD' || source === 'FLEET', 'Unknown selection source');
        requireMode(!inFlight, 'Settle selection ticket first');
        const state = actual();
        publish(state);
        requireMode(!terminal, 'Selection authority unavailable');
        if (!admissible(identity, source) || conflict) return false;
        if (pending) {
          if (pending.identity === identity) return true;
          pending = null;
          conflict = true;
          publish(state);
          return false;
        }
        if (
          projection!.selectedIdentity === identity &&
          (!state.seat || state.seat.identity === identity)
        )
          return true;
        pending = { identity, source };
        publish(state);
        return true;
      });
    },
    prepare(time) {
      return mutate(() => {
        requireMode(!inFlight, 'Settle selection ticket first');
        const t = modeFields(time, [
          'schemaVersion',
          'units',
          'sessionId',
          'worldEpoch',
          'version',
          'tick',
          'dtSeconds',
        ]);
        const c = modeContext({
          schemaVersion: t.schemaVersion,
          units: t.units,
          sessionId: t.sessionId,
          worldEpoch: t.worldEpoch,
        });
        requireMode(
          sameModeWorld(world, c) &&
            t.version === VEHICLE_SELECTION_LIMITS.version &&
            t.dtSeconds === 1 / 60,
          'Foreign selection tick',
        );
        const state = actual();
        publish(state);
        requireMode(
          !terminal && modeInteger(t.tick) === state.tick + 1,
          'Selection next tick required',
        );
        if (state.suspended || !pending || conflict) return null;
        const target = pending;
        requireMode(
          admissible(target.identity, target.source),
          'Selection target no longer admitted',
        );
        const departure = state.seat && state.seat.identity !== target.identity ? state.seat : null;
        let open: SelectionSegmentBoundary | null = null;
        const assignments = [assignment(target.identity)];
        if (departure) {
          token(departure.identity);
          open = boundary(departure.identity);
          requireMode(
            open.completeness === 'OPEN' &&
              open.mode === departure.mode &&
              open.startTick <= state.tick,
            'Controlled departure requires actual OPEN segment',
          );
          assignments.push(assignment(departure.identity));
        }
        try {
          requireMode(
            ports!.clearInput() === undefined,
            'Selection clearInput synchronous void required',
          );
          // Clearing other input adapters cannot silently mutate native admission or accepted authority.
          const afterClear = actual();
          requireMode(
            afterClear.tick === state.tick &&
              afterClear.seat?.identity === state.seat?.identity &&
              afterClear.seat?.mode === state.seat?.mode &&
              afterClear.suspended === state.suspended &&
              !afterClear.fault &&
              !afterClear.disposed,
            'Selection clearInput changed authority',
          );
          requireMode(
            admissible(target.identity, target.source),
            'Selection target changed during clearInput',
          );
          for (const before of assignments) {
            const now = assignment(before.identity);
            requireMode(
              now.routeFingerprint === before.routeFingerprint &&
                now.tripFingerprint === before.tripFingerprint,
              'Input clear changed selection assignment',
            );
          }
          if (departure && open) {
            const now = boundary(departure.identity);
            requireMode(
              now.segmentId === open.segmentId &&
                now.startTick === open.startTick &&
                now.mode === open.mode &&
                now.completeness === 'OPEN',
              'Input clear changed departure boundary',
            );
          }
        } catch (error) {
          callbackFailure('INPUT_CLEAR', error, state);
          throw error;
        }
        requireMode(sequence < Number.MAX_SAFE_INTEGER, 'Selection ticket sequence exhausted');
        const ticket: VehicleSelectionTicket = Object.freeze({
          ...world,
          version: '068-selection-ticket-v1',
          sequence: ++sequence,
          tick: t.tick as number,
          baseTick: state.tick,
          identity: target.identity,
          source: target.source,
          requests: Object.freeze(
            departure
              ? [Object.freeze({ identity: departure.identity, mode: 'AUTO' as const })]
              : [],
          ),
        });
        inFlight = {
          ticket,
          priorState: state,
          priorSeat: state.seat,
          departure,
          boundary: open,
          assignments,
        };
        return ticket;
      });
    },
    settle(ticket) {
      return mutate(() => {
        requireMode(inFlight?.ticket === ticket, 'Foreign/stale selection ticket');
        const prepared = inFlight;
        let state: ReturnType<typeof actual>;
        try {
          state = actual();
        } catch (error) {
          return fail(
            'AUTHORITY_READBACK_UNAVAILABLE: ' + String(error).slice(0, 256),
            prepared.priorState,
          );
        }
        publish(state);
        if (state.fault || state.disposed) return fail(state.fault ?? 'AUTHORITY_DISPOSED', state);
        if (state.tick === ticket.baseTick) return 'PENDING';
        if (
          state.tick !== ticket.tick ||
          state.suspended ||
          (prepared.departure
            ? state.seat !== null
            : state.seat?.identity !== prepared.priorSeat?.identity ||
              state.seat?.mode !== prepared.priorSeat?.mode)
        )
          return fail('ACCEPTED_AUTHORITY_MISMATCH', state);
        try {
          const fenceRetainedIdentities = () => {
            token(ticket.identity);
            if (prepared.departure) token(prepared.departure.identity);
          };
          requireMode(
            admissible(ticket.identity, ticket.source),
            'Accepted selection target expired',
          );
          if (prepared.departure) {
            requireMode(prepared.boundary !== null, 'Missing departure boundary');
            const current = boundary(prepared.departure.identity);
            requireMode(
              current.segmentId === prepared.boundary.segmentId &&
                current.startTick === prepared.boundary.startTick &&
                current.mode === prepared.departure.mode &&
                current.completeness === 'OPEN',
              'Departure boundary changed before close',
            );
            const event: SelectionCloseEvent = Object.freeze({
              ...world,
              version: '068-selection-close-v1',
              identity: prepared.departure.identity,
              segmentId: current.segmentId,
              mode: prepared.departure.mode,
              tick: state.tick,
              reason: 'VEHICLE_SWITCH',
            });
            requireMode(
              ports!.closeBoundary(event) === undefined,
              'Selection closeBoundary synchronous void required',
            );
            fenceRetainedIdentities();
            const closed = boundary(prepared.departure.identity);
            requireMode(
              closed.segmentId === current.segmentId &&
                closed.startTick === current.startTick &&
                closed.mode === current.mode &&
                closed.completeness === 'CLOSED' &&
                closed.endTick === state.tick &&
                closed.closeReason === 'VEHICLE_SWITCH',
              'Actual CLOSED selection boundary required',
            );
          }
          for (const before of prepared.assignments) {
            const now = assignment(before.identity);
            requireMode(
              now.routeFingerprint === before.routeFingerprint &&
                now.tripFingerprint === before.tripFingerprint,
              'Selection route/trip assignment changed',
            );
          }
          requireMode(
            ports!.selectCamera(ticket.identity) === undefined,
            'Selection camera synchronous void required',
          );
          fenceRetainedIdentities();
          requireMode(
            ports!.readCameraTarget() === ticket.identity,
            'Actual accepted camera target required',
          );
          fenceRetainedIdentities();
          for (const before of prepared.assignments) {
            const now = assignment(before.identity);
            requireMode(
              now.routeFingerprint === before.routeFingerprint &&
                now.tripFingerprint === before.tripFingerprint,
              'Camera changed selection route/trip',
            );
          }
          const afterCallbacks = actual();
          requireMode(
            afterCallbacks.tick === state.tick &&
              afterCallbacks.seat?.identity === state.seat?.identity &&
              afterCallbacks.seat?.mode === state.seat?.mode &&
              !afterCallbacks.fault &&
              !afterCallbacks.disposed &&
              afterCallbacks.suspended === state.suspended,
            'Selection callback changed accepted authority',
          );
          fenceRetainedIdentities();
          // Informational camera readback in publication is still an injected callback.
          publish(state);
          fenceRetainedIdentities();
          pending = null;
          inFlight = null;
          projection = Object.freeze({ ...projection!, pendingIdentity: null });
          return 'ACCEPTED';
        } catch (error) {
          return callbackFailure('SELECTION_SETTLEMENT', error, state);
        }
      });
    },
    reject(ticket) {
      mutate(() => {
        requireMode(inFlight?.ticket === ticket, 'Foreign/stale selection ticket');
        requireMode(actual().tick === ticket.baseTick, 'Cannot reject accepted physical selection');
        inFlight = null;
        pending = null;
      });
    },
    clearPending() {
      mutate(() => {
        requireMode(
          !inFlight || actual().tick === inFlight.ticket.baseTick,
          'Cannot discard accepted physical selection',
        );
        pending = null;
        inFlight = null;
        conflict = false;
      });
    },
    observe() {
      return mutate(() => publish(actual()), true);
    },
    getStats() {
      return Object.freeze({
        vehicles: registrations.size,
        pending: pending ? 1 : 0,
        inFlight: inFlight ? 1 : 0,
        projection,
        conflict,
        disposed,
        fault: terminal,
        retainedHistory: 0,
      });
    },
    dispose() {
      if (disposed) return;
      requireMode(!busy, 'Selection disposal reentrant');
      registrations.clear();
      pending = null;
      inFlight = null;
      projection = null;
      ports = undefined;
      conflict = false;
      disposed = true;
    },
  };
}
