import { modeBoolean, modeContext, modeFields, modeInteger, modeText, requireMode, sameModeWorld } from './mode-boundary';
export const VEHICLE_SELECTION_LIMITS = Object.freeze({
    version: '068-vehicle-selection-v1',
    vehicles: 110,
    pending: 1,
    tickets: 1,
    projections: 1,
    idCodeUnits: 256,
    history: 0,
    hz: 60
});
function identityId(value) {
    const d = modeFields(value, [
        'entityId',
        'handle',
        'generation'
    ]);
    const id = modeText(d.entityId);
    requireMode(typeof d.handle === 'number' && Number.isFinite(d.handle), 'Invalid selection native handle');
    requireMode(modeInteger(d.generation) > 0, 'Invalid selection native generation');
    return id;
}
function kind(value) {
    requireMode(value === 'TAXI' || value === 'CIVIL', 'Unknown selection kind');
    return value;
}
function portsData(value) {
    const d = modeFields(value, [
        'readAuthority',
        'bodyIdentity',
        'readPresentation',
        'readCameraTarget',
        'selectCamera',
        'clearInput',
        'readAssignment',
        'readBoundary',
        'closeBoundary'
    ]);
    requireMode(Object.values(d).every((v)=>typeof v === 'function'), 'Synchronous selection ports required');
    return Object.freeze(d);
}
export function createVehicleSelection(context, initialPorts) {
    const world = modeContext(context);
    let ports = portsData(initialPorts);
    const registrations = new Map();
    let pending = null;
    let inFlight = null;
    let projection = null, terminal = null, busy = false, disposed = false, conflict = false, sequence = 0;
    function mutate(operation, allowFault = false) {
        requireMode(!busy, 'Selection mutation reentrant');
        requireMode(!disposed, 'Selection disposed');
        requireMode(allowFault || terminal === null, 'Selection fault terminal');
        busy = true;
        try {
            return operation();
        } finally{
            busy = false;
        }
    }
    function token(value) {
        const id = identityId(value);
        requireMode(registrations.get(id)?.identity === value && ports.bodyIdentity(id) === value, 'Stale/unregistered selection identity');
        return value;
    }
    function actual() {
        const d = modeFields(ports.readAuthority(), [
            'context',
            'tick',
            'vehicles',
            'players',
            'seat',
            'suspended',
            'disposed',
            'fault',
            'retainedHistory',
            'retainedBatches'
        ]);
        const c = modeContext(d.context), tick = modeInteger(d.tick);
        requireMode(sameModeWorld(world, c), 'Foreign selection authority context');
        requireMode(modeInteger(d.vehicles) <= 110 && modeInteger(d.players) <= 1 && d.retainedHistory === 0 && d.retainedBatches === 0, 'Invalid selection authority capacity');
        const suspended = modeBoolean(d.suspended), ownerDisposed = modeBoolean(d.disposed);
        let fault = null;
        if (d.fault !== null) {
            const f = modeFields(d.fault, [
                'attemptedTick',
                'acceptedTick',
                'stage',
                'physicalTickAccepted'
            ]);
            modeInteger(f.attemptedTick);
            requireMode(modeInteger(f.acceptedTick) === tick, 'Authority fault accepted tick mismatch');
            modeBoolean(f.physicalTickAccepted);
            requireMode(f.stage === 'KEYBOARD_CLEAR' || f.stage === 'CONTROLLER_ACTUATION', 'Unknown selection authority fault');
            fault = f.stage;
        }
        let seat = null;
        if (d.seat !== null) {
            const s = modeFields(d.seat, [
                'identity',
                'mode'
            ]);
            identityId(s.identity);
            requireMode(s.mode === 'MANUAL' || s.mode === 'LEARNING', 'Invalid selection player mode');
            seat = Object.freeze({
                identity: s.identity,
                mode: s.mode
            });
        }
        requireMode(d.players === (seat ? 1 : 0), 'Authority selection seat mismatch');
        return {
            context: c,
            tick,
            seat,
            suspended,
            disposed: ownerDisposed,
            fault
        };
    }
    function publish(state) {
        if (state.fault || state.disposed) terminal = state.fault ?? 'AUTHORITY_DISPOSED';
        let selected = null;
        try {
            const candidate = ports.readCameraTarget();
            if (candidate !== null) {
                identityId(candidate);
                selected = candidate;
            }
        } catch  {
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
            fault: terminal
        });
        return projection;
    }
    function admissible(identity, source) {
        token(identity);
        const d = modeFields(ports.readPresentation(identity), [
            'identity',
            'kind',
            'visible',
            'selectable'
        ]);
        requireMode(d.identity === identity && kind(d.kind) === registrations.get(identityId(identity)).kind, 'Selection presentation/native kind mismatch');
        const visible = modeBoolean(d.visible), selectable = modeBoolean(d.selectable);
        token(identity);
        return source === 'FLEET' ? d.kind === 'TAXI' : visible && selectable;
    }
    function assignment(identity) {
        token(identity);
        const d = modeFields(ports.readAssignment(identity), [
            'context',
            'identity',
            'routeFingerprint',
            'tripFingerprint'
        ]);
        const c = modeContext(d.context);
        requireMode(sameModeWorld(world, c) && d.identity === identity, 'Selection assignment identity/context mismatch');
        token(identity);
        return Object.freeze({
            context: c,
            identity,
            routeFingerprint: modeText(d.routeFingerprint),
            tripFingerprint: d.tripFingerprint === null ? null : modeText(d.tripFingerprint)
        });
    }
    function boundary(identity) {
        token(identity);
        const d = modeFields(ports.readBoundary(identity), [
            'context',
            'identity',
            'segmentId',
            'mode',
            'startTick',
            'endTick',
            'completeness',
            'closeReason'
        ]);
        const c = modeContext(d.context);
        requireMode(sameModeWorld(world, c) && d.identity === identity, 'Selection segment identity/context mismatch');
        requireMode(d.mode === 'MANUAL' || d.mode === 'LEARNING', 'Selection segment control mode');
        requireMode(d.completeness === 'OPEN' || d.completeness === 'CLOSED', 'Selection segment completeness');
        const startTick = modeInteger(d.startTick), endTick = d.endTick === null ? null : modeInteger(d.endTick);
        requireMode(d.closeReason === null || d.closeReason === 'VEHICLE_SWITCH', 'Selection segment close reason');
        requireMode(d.completeness === 'OPEN' ? endTick === null && d.closeReason === null : endTick !== null && endTick >= startTick && d.closeReason === 'VEHICLE_SWITCH', 'Selection segment lifecycle mismatch');
        token(identity);
        return Object.freeze({
            context: c,
            identity,
            segmentId: modeText(d.segmentId),
            mode: d.mode,
            startTick,
            endTick,
            completeness: d.completeness,
            closeReason: d.closeReason
        });
    }
    function fail(stage, state) {
        terminal = stage;
        pending = null;
        inFlight = null;
        publish(state);
        return 'FAULT';
    }
    function callbackFailure(stage, error, prior) {
        let latest = prior;
        try {
            latest = actual();
        } catch  {}
        return fail(stage + ': ' + String(error).slice(0, 256), latest);
    }
    return {
        register (identity, classification) {
            mutate(()=>{
                const id = identityId(identity), type = kind(classification);
                requireMode(!inFlight && !pending && ports.bodyIdentity(id) === identity, 'Selection registration state/token');
                const prior = registrations.get(id);
                requireMode(!prior || prior.identity === identity, 'Remove old selection incarnation first');
                requireMode(prior !== undefined || registrations.size < 110, 'Selection registration capacity');
                requireMode(!prior || prior.kind === type, 'Selection registered kind cannot change');
                registrations.set(id, {
                    identity,
                    kind: type
                });
            });
        },
        remove (identity) {
            return mutate(()=>{
                const id = identityId(identity);
                requireMode(!inFlight && pending?.identity !== identity, 'Selection identity has pending ticket');
                if (registrations.get(id)?.identity !== identity) return false;
                requireMode(actual().seat?.identity !== identity, 'Release controlled selection before removal');
                return registrations.delete(id);
            });
        },
        enqueue (identity, source) {
            return mutate(()=>{
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
                if (projection.selectedIdentity === identity && (!state.seat || state.seat.identity === identity)) return true;
                pending = {
                    identity,
                    source
                };
                publish(state);
                return true;
            });
        },
        prepare (time) {
            return mutate(()=>{
                requireMode(!inFlight, 'Settle selection ticket first');
                const t = modeFields(time, [
                    'schemaVersion',
                    'units',
                    'sessionId',
                    'worldEpoch',
                    'version',
                    'tick',
                    'dtSeconds'
                ]);
                const c = modeContext({
                    schemaVersion: t.schemaVersion,
                    units: t.units,
                    sessionId: t.sessionId,
                    worldEpoch: t.worldEpoch
                });
                requireMode(sameModeWorld(world, c) && t.version === VEHICLE_SELECTION_LIMITS.version && t.dtSeconds === 1 / 60, 'Foreign selection tick');
                const state = actual();
                publish(state);
                requireMode(!terminal && modeInteger(t.tick) === state.tick + 1, 'Selection next tick required');
                if (state.suspended || !pending || conflict) return null;
                const target = pending;
                requireMode(admissible(target.identity, target.source), 'Selection target no longer admitted');
                const departure = state.seat && state.seat.identity !== target.identity ? state.seat : null;
                let open = null;
                const assignments = [
                    assignment(target.identity)
                ];
                if (departure) {
                    token(departure.identity);
                    open = boundary(departure.identity);
                    requireMode(open.completeness === 'OPEN' && open.mode === departure.mode && open.startTick <= state.tick, 'Controlled departure requires actual OPEN segment');
                    assignments.push(assignment(departure.identity));
                }
                try {
                    requireMode(ports.clearInput() === undefined, 'Selection clearInput synchronous void required');
                    const afterClear = actual();
                    requireMode(afterClear.tick === state.tick && afterClear.seat?.identity === state.seat?.identity && afterClear.seat?.mode === state.seat?.mode && afterClear.suspended === state.suspended && !afterClear.fault && !afterClear.disposed, 'Selection clearInput changed authority');
                    requireMode(admissible(target.identity, target.source), 'Selection target changed during clearInput');
                    for (const before of assignments){
                        const now = assignment(before.identity);
                        requireMode(now.routeFingerprint === before.routeFingerprint && now.tripFingerprint === before.tripFingerprint, 'Input clear changed selection assignment');
                    }
                    if (departure && open) {
                        const now = boundary(departure.identity);
                        requireMode(now.segmentId === open.segmentId && now.startTick === open.startTick && now.mode === open.mode && now.completeness === 'OPEN', 'Input clear changed departure boundary');
                    }
                } catch (error) {
                    callbackFailure('INPUT_CLEAR', error, state);
                    throw error;
                }
                requireMode(sequence < Number.MAX_SAFE_INTEGER, 'Selection ticket sequence exhausted');
                const ticket = Object.freeze({
                    ...world,
                    version: '068-selection-ticket-v1',
                    sequence: ++sequence,
                    tick: t.tick,
                    baseTick: state.tick,
                    identity: target.identity,
                    source: target.source,
                    requests: Object.freeze(departure ? [
                        Object.freeze({
                            identity: departure.identity,
                            mode: 'AUTO'
                        })
                    ] : [])
                });
                inFlight = {
                    ticket,
                    priorState: state,
                    priorSeat: state.seat,
                    departure,
                    boundary: open,
                    assignments
                };
                return ticket;
            });
        },
        settle (ticket) {
            return mutate(()=>{
                requireMode(inFlight?.ticket === ticket, 'Foreign/stale selection ticket');
                const prepared = inFlight;
                let state;
                try {
                    state = actual();
                } catch (error) {
                    return fail('AUTHORITY_READBACK_UNAVAILABLE: ' + String(error).slice(0, 256), prepared.priorState);
                }
                publish(state);
                if (state.fault || state.disposed) return fail(state.fault ?? 'AUTHORITY_DISPOSED', state);
                if (state.tick === ticket.baseTick) return 'PENDING';
                if (state.tick !== ticket.tick || state.suspended || (prepared.departure ? state.seat !== null : state.seat?.identity !== prepared.priorSeat?.identity || state.seat?.mode !== prepared.priorSeat?.mode)) return fail('ACCEPTED_AUTHORITY_MISMATCH', state);
                try {
                    const fenceRetainedIdentities = ()=>{
                        token(ticket.identity);
                        if (prepared.departure) token(prepared.departure.identity);
                    };
                    requireMode(admissible(ticket.identity, ticket.source), 'Accepted selection target expired');
                    if (prepared.departure) {
                        requireMode(prepared.boundary !== null, 'Missing departure boundary');
                        const current = boundary(prepared.departure.identity);
                        requireMode(current.segmentId === prepared.boundary.segmentId && current.startTick === prepared.boundary.startTick && current.mode === prepared.departure.mode && current.completeness === 'OPEN', 'Departure boundary changed before close');
                        const event = Object.freeze({
                            ...world,
                            version: '068-selection-close-v1',
                            identity: prepared.departure.identity,
                            segmentId: current.segmentId,
                            mode: prepared.departure.mode,
                            tick: state.tick,
                            reason: 'VEHICLE_SWITCH'
                        });
                        requireMode(ports.closeBoundary(event) === undefined, 'Selection closeBoundary synchronous void required');
                        fenceRetainedIdentities();
                        const closed = boundary(prepared.departure.identity);
                        requireMode(closed.segmentId === current.segmentId && closed.startTick === current.startTick && closed.mode === current.mode && closed.completeness === 'CLOSED' && closed.endTick === state.tick && closed.closeReason === 'VEHICLE_SWITCH', 'Actual CLOSED selection boundary required');
                    }
                    for (const before of prepared.assignments){
                        const now = assignment(before.identity);
                        requireMode(now.routeFingerprint === before.routeFingerprint && now.tripFingerprint === before.tripFingerprint, 'Selection route/trip assignment changed');
                    }
                    requireMode(ports.selectCamera(ticket.identity) === undefined, 'Selection camera synchronous void required');
                    fenceRetainedIdentities();
                    requireMode(ports.readCameraTarget() === ticket.identity, 'Actual accepted camera target required');
                    fenceRetainedIdentities();
                    for (const before of prepared.assignments){
                        const now = assignment(before.identity);
                        requireMode(now.routeFingerprint === before.routeFingerprint && now.tripFingerprint === before.tripFingerprint, 'Camera changed selection route/trip');
                    }
                    const afterCallbacks = actual();
                    requireMode(afterCallbacks.tick === state.tick && afterCallbacks.seat?.identity === state.seat?.identity && afterCallbacks.seat?.mode === state.seat?.mode && !afterCallbacks.fault && !afterCallbacks.disposed && afterCallbacks.suspended === state.suspended, 'Selection callback changed accepted authority');
                    fenceRetainedIdentities();
                    publish(state);
                    fenceRetainedIdentities();
                    pending = null;
                    inFlight = null;
                    projection = Object.freeze({
                        ...projection,
                        pendingIdentity: null
                    });
                    return 'ACCEPTED';
                } catch (error) {
                    return callbackFailure('SELECTION_SETTLEMENT', error, state);
                }
            });
        },
        reject (ticket) {
            mutate(()=>{
                requireMode(inFlight?.ticket === ticket, 'Foreign/stale selection ticket');
                requireMode(actual().tick === ticket.baseTick, 'Cannot reject accepted physical selection');
                inFlight = null;
                pending = null;
            });
        },
        clearPending () {
            mutate(()=>{
                requireMode(!inFlight || actual().tick === inFlight.ticket.baseTick, 'Cannot discard accepted physical selection');
                pending = null;
                inFlight = null;
                conflict = false;
            });
        },
        observe () {
            return mutate(()=>publish(actual()), true);
        },
        getStats () {
            return Object.freeze({
                vehicles: registrations.size,
                pending: pending ? 1 : 0,
                inFlight: inFlight ? 1 : 0,
                projection,
                conflict,
                disposed,
                fault: terminal,
                retainedHistory: 0
            });
        },
        dispose () {
            if (disposed) return;
            requireMode(!busy, 'Selection disposal reentrant');
            registrations.clear();
            pending = null;
            inFlight = null;
            projection = null;
            ports = undefined;
            conflict = false;
            disposed = true;
        }
    };
}
