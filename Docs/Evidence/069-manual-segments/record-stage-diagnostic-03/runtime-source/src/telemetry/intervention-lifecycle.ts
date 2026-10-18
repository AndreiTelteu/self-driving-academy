import { recordStage } from '../../scripts/manual-segments-record-stage-observer.mjs';
import { fields, contextFields, readContext, requireContract, tick, choice } from '../sessions';
import type { ContractContext } from '../sessions';
import type { BodyIdentity } from '../vehicles';
import type { SimulationEvent } from '../simulation';
import { segmentCloseReasons } from './contracts';
import type { InterventionSegment, TelemetrySample } from './contracts';
import { admitInterventionRecord } from './intervention-admission';
import { INTERVENTION_LIMITS } from './intervention-ports';
import type {
  InterventionPorts,
  InterventionAuthority,
  InterventionBoundaryPlan,
  InterventionBoundaryTicket,
  InterventionBoundaryView,
  InterventionRecordReservation,
  InterventionEventReservation,
  InterventionIntakeDescriptor,
  InterventionFault,
  InterventionResultToken,
  InterventionCause,
  InterventionTarget,
} from './intervention-ports';
import {
  interventionAuthority,
  interventionTarget,
  interventionTargetChange,
  interventionCause,
  interventionIdentity,
  interventionText,
  sameInterventionContext,
  sameInterventionTarget,
} from './intervention-validation';
import {
  sameInterventionRecord,
  readInterventionRecordReservation,
  readInterventionRecordReceipt,
  readInterventionEventReservation,
  readInterventionEventReceipt,
  readInterventionIntakeReceipt,
} from './intervention-receipts';
type Fence = {
  authority: InterventionAuthority;
  target: InterventionTarget;
  identities: readonly BodyIdentity[];
};
type DeliveryState =
  'NOT_ATTEMPTED' | 'KNOWN_UNACCEPTED' | 'ACCEPTED_PREFIX' | 'ACCEPTED' | 'UNKNOWN';
type Pending = {
  ticket: InterventionBoundaryTicket;
  plan: InterventionBoundaryPlan;
  target: InterventionTarget;
  before: Fence;
  after: Fence | null;
  oldIdentity: BodyIdentity | null;
  recordOpaque: InterventionRecordReservation | null;
  record: InterventionRecordReservation | null;
  eventsOpaque: InterventionEventReservation | null;
  events: InterventionEventReservation | null;
  intake: InterventionIntakeDescriptor | null;
  intakeReserved: boolean;
  committed: boolean;
  eventsDone: boolean;
  intakeDone: boolean;
  eventDelivery: DeliveryState;
  intakeDelivery: DeliveryState;
  quarantined: boolean;
  cleanupAttempted: Set<string>;
};
const terminalReasons = [
  'STATE_IMPORT',
  'SESSION_CHANGE',
  'WORLD_RESET',
  'SHUTDOWN',
  'DATA_LOSS',
] as const;
const causedReasons = ['RIDE_COMPLETED', 'RECOVERY', 'ROLLOVER'] as const;
/** Metadata only. Every external effect is bracketed by phase-correct actual authority/target/token readbacks. */
export function createInterventionLifecycle(
  initialContext: ContractContext,
  ownerId: string,
  ports: InterventionPorts,
) {
  const context = Object.freeze(readContext(fields(initialContext, contextFields))),
    id = interventionText(ownerId);
  let target = interventionTarget(ports.readTarget());
  requireContract(sameInterventionContext(target, context), 'Intervention initial target context');
  const initial = interventionAuthority(ports.readAuthority(), ports.bodyIdentity);
  requireContract(
    sameInterventionContext(initial, context) &&
      initial.identity === null &&
      !initial.disposed &&
      initial.fault === null,
    'Intervention requires fresh AUTO authority',
  );
  let acceptedTick = initial.tick,
    sequence = 0,
    segmentSequence = 0,
    active: InterventionBoundaryView | null = null,
    activeMetadata: InterventionSegment | null = null,
    lastClosed: InterventionBoundaryView | null = null;
  let pending: Pending | null = null,
    completed: Pending | null = null,
    fault: InterventionFault | null = null,
    busy = false,
    disposed = false,
    retired = false;
  const results = new Map<
    string,
    { descriptor: InterventionIntakeDescriptor; identity: BodyIdentity; consumed: boolean }
  >();
  function run<T>(action: () => T, allowFault = false, allowRetired = false): T {
    requireContract(
      !busy && !disposed && (allowRetired || !retired) && (allowFault || fault === null),
      'Intervention owner lifecycle',
    );
    busy = true;
    try {
      return action();
    } finally {
      busy = false;
    }
  }
  function authority() {
    const a = interventionAuthority(ports.readAuthority(), ports.bodyIdentity);
    requireContract(
      sameInterventionContext(a, context) && !a.disposed,
      'Intervention authority context/lifecycle',
    );
    return a;
  }
  function fail(stage: InterventionFault['stage'], error: unknown, t: number, physical: boolean) {
    const cause = (
      error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    ).slice(0, 1024);
    fault = Object.freeze({
      stage,
      attemptedTick: t,
      acceptedTick,
      physicalTickAccepted: physical,
      physicalAcceptance: physical ? 'ACCEPTED' : 'NOT_ACCEPTED',
      causes: Object.freeze([...(fault?.causes ?? []).slice(-7), cause]),
    });
  }
  function sameAuthority(a: InterventionAuthority, b: InterventionAuthority) {
    return (
      sameInterventionContext(a, b) &&
      a.tick === b.tick &&
      a.identity === b.identity &&
      a.mode === b.mode &&
      a.suspended === b.suspended &&
      a.disposed === b.disposed &&
      a.fault === b.fault
    );
  }
  function fence(f: Fence) {
    const a = authority();
    requireContract(sameAuthority(a, f.authority), 'Intervention phase authority changed');
    requireContract(
      sameInterventionTarget(interventionTarget(ports.readTarget()), f.target),
      'Intervention phase target changed',
    );
    for (const identity of f.identities) interventionIdentity(identity, ports.bodyIdentity);
    const final = authority();
    requireContract(sameAuthority(final, a), 'Intervention readback changed authority');
    requireContract(
      sameInterventionTarget(interventionTarget(ports.readTarget()), f.target),
      'Intervention readback changed target',
    );
  }
  function currentFence(): Fence {
    const a = authority();
    requireContract(
      a.tick === acceptedTick &&
        a.identity === (active?.identity ?? null) &&
        a.mode === (active?.mode ?? 'AUTO'),
      'Intervention unobserved physical advance/ownership',
    );
    const identities = active ? [active.identity] : [];
    const f = { authority: a, target, identities };
    fence(f);
    return f;
  }
  function external<T>(p: Pending, phase: 'before' | 'after', action: () => T): T {
    const f = phase === 'before' ? p.before : p.after;
    requireContract(f !== null, 'Intervention missing accepted phase');
    try {
      fence(f);
    } catch (e) {
      p.quarantined = true;
      throw e;
    }
    let value: T | undefined,
      error: unknown = null;
    try {
      value = action();
    } catch (e) {
      error = e;
    }
    try {
      fence(f);
    } catch (e) {
      p.quarantined = true;
      throw error === null
        ? e
        : new AggregateError([error, e], 'Intervention primary and callback-fence errors');
    }
    if (error !== null) throw error;
    return value as T;
  }
  function callAt<T>(f: Fence, action: () => T): T {
    fence(f);
    let value: T | undefined,
      error: unknown = null;
    try {
      value = action();
    } catch (e) {
      error = e;
    }
    try {
      fence(f);
    } catch (e) {
      fail('AUTHORITY', e, f.authority.tick, f.authority.tick === acceptedTick);
      if (pending) pending.quarantined = true;
      if (completed) completed.quarantined = true;
      throw error === null
        ? e
        : new AggregateError([error, e], 'Intervention callback and freshness failures');
    }
    if (error !== null) throw error;
    return value as T;
  }
  function bindPhysicalPhase(p: Pending): Fence {
    requireContract(!p.quarantined, 'Intervention accepted phase quarantined');
    const a = authority();
    const expected = Object.freeze({
      ...p.before.authority,
      tick: p.plan.tick,
      identity: p.plan.nextIdentity,
      mode: p.plan.nextMode,
      suspended: false,
      fault: null,
    });
    if (a.tick === p.plan.tick) acceptedTick = a.tick;
    const f = p.after ?? {
      authority: expected,
      target: p.target,
      identities: Object.freeze([
        ...new Set(
          [p.oldIdentity, p.plan.nextIdentity].filter((v): v is BodyIdentity => v !== null),
        ),
      ]),
    };
    try {
      requireContract(
        sameAuthority(a, f.authority),
        'Intervention accepted physical phase mismatch',
      );
      fence(f);
    } catch (error) {
      p.quarantined = true;
      fail('AUTHORITY', error, p.plan.tick, a.tick === p.plan.tick);
      if (a.tick !== p.plan.tick)
        fault = Object.freeze({ ...fault!, physicalAcceptance: 'UNKNOWN' });
      throw error;
    }
    p.after = f;
    return f;
  }
  function readPhase(): Fence {
    if (pending) {
      const a = authority();
      if (a.tick === pending.ticket.baseTick) {
        fence(pending.before);
        return pending.before;
      }
      requireContract(
        !pending.quarantined &&
          a.tick === pending.plan.tick &&
          a.identity === pending.plan.nextIdentity &&
          a.mode === pending.plan.nextMode,
        'Intervention readback unexpected accepted authority',
      );
      acceptedTick = a.tick;
      return bindPhysicalPhase(pending);
    }
    return currentFence();
  }
  function openRecord(value: unknown): InterventionSegment {
    requireContract(
      active !== null && activeMetadata !== null,
      'Intervention absent OPEN metadata',
    );
    const row = admitInterventionRecord(value).record;
    const metadata = (r: InterventionSegment) => {
      const { samples, events, ...rest } = r;
      void samples;
      void events;
      return rest;
    };
    requireContract(
      JSON.stringify(metadata(row)) === JSON.stringify(metadata(activeMetadata)),
      'Intervention OPEN frozen metadata substitution',
    );
    return row;
  }
  function view(record: InterventionSegment, identity: BodyIdentity): InterventionBoundaryView {
    return Object.freeze({
      context,
      identity,
      segmentId: record.segmentId,
      mode: record.controlMode as 'MANUAL' | 'LEARNING',
      startTick: record.startTick,
      endTick: record.endTick,
      completeness: record.completeness,
      closeReason: record.closeReason,
    });
  }
  function descriptor(
    record: InterventionSegment,
    operationId: string,
    nextTarget: InterventionTarget,
  ): InterventionIntakeDescriptor | null {
    if (
      record.controlMode !== 'LEARNING' ||
      !record.learningEligible ||
      record.completeness !== 'CLOSED' ||
      !sameInterventionContext(record, nextTarget) ||
      record.playerId !== nextTarget.playerId ||
      record.profileId !== nextTarget.profileId ||
      record.learningEpoch !== nextTarget.learningEpoch ||
      record.baseVersionId !== nextTarget.baseVersionId
    )
      return null;
    requireContract(
      results.size < INTERVENTION_LIMITS.descriptors,
      'Intervention protected result capacity',
    );
    const d: InterventionIntakeDescriptor = Object.freeze({
      ...context,
      version: '069-closed-learning-intake-v1',
      segmentId: record.segmentId,
      playerId: record.playerId,
      profileId: record.profileId,
      learningEpoch: record.learningEpoch,
      baseVersionId: record.baseVersionId,
      endTick: record.endTick!,
      recordBytes: admitInterventionRecord(record).bytes,
      operationId,
    });
    const bytes =
      2 +
      results.size +
      [...results.values()].reduce(
        (n, e) => n + new TextEncoder().encode(JSON.stringify(e.descriptor)).length,
        0,
      ) +
      new TextEncoder().encode(JSON.stringify(d)).length;
    requireContract(
      bytes <= INTERVENTION_LIMITS.descriptorBytes,
      'Intervention protected result descriptor byte capacity',
    );
    return d;
  }
  function event(
    type: 'MANUAL_START' | 'MANUAL_END',
    record: InterventionSegment,
    t: number,
  ): SimulationEvent {
    return Object.freeze({
      ...context,
      eventId: interventionText(`${id}:${sequence}:${type}`),
      tick: t,
      entityIds: Object.freeze([record.vehicleId]),
      type,
      payload: Object.freeze({ vehicleId: record.vehicleId, controlMode: record.controlMode }),
    });
  }
  function rejectResources(p: Pending) {
    const errors: unknown[] = [];
    for (const [key, needed, action] of [
      ['intake', p.intakeReserved, () => ports.rejectIntake(p.intake!.operationId)],
      ['events', p.eventsOpaque !== null, () => ports.events.reject(p.eventsOpaque!)],
      ['record', p.recordOpaque !== null, () => ports.records.reject(p.recordOpaque!)],
    ] as const) {
      if (!needed || p.cleanupAttempted.has(key)) continue;
      p.cleanupAttempted.add(key);
      try {
        requireContract(
          external(p, 'before', action) === undefined,
          'Intervention rejection must return void',
        );
        if (key === 'intake') p.intakeReserved = false;
        if (key === 'events') {
          p.eventsOpaque = null;
          p.events = null;
          p.eventsDone = true;
        }
        if (key === 'record') {
          p.recordOpaque = null;
          p.record = null;
        }
      } catch (e) {
        errors.push(e);
      }
    }
    if (errors.length) {
      p.quarantined = true;
      for (const e of errors) fail('ADMISSION', e, p.plan.tick, false);
      throw new AggregateError(
        errors,
        'Intervention rejected reservation cleanup failed; resources retained/quarantined',
      );
    }
  }
  function reserve(
    plan: InterventionBoundaryPlan,
    nextTarget: InterventionTarget,
    before: Fence,
  ): Pending {
    const p: Pending = {
      ticket: Object.freeze({
        ...context,
        version: '069-boundary-ticket-v1',
        sequence,
        tick: plan.tick,
        baseTick: acceptedTick,
      }),
      plan,
      target: nextTarget,
      before,
      after: null,
      oldIdentity: active?.identity ?? null,
      recordOpaque: null,
      record: null,
      eventsOpaque: null,
      events: null,
      intake: null,
      intakeReserved: false,
      committed: false,
      eventsDone: true,
      intakeDone: true,
      eventDelivery: 'ACCEPTED',
      intakeDelivery: 'ACCEPTED',
      quarantined: false,
      cleanupAttempted: new Set(),
    };
    pending = p;
    try {
      const old =
        active === null
          ? null
          : openRecord(external(p, 'before', () => ports.records.read(active!.segmentId)));
      requireContract(
        active === null || old?.completeness === 'OPEN',
        'Intervention real OPEN readback',
      );
      if (old && plan.timing === 'PREPARED_BEFORE_NEXT_TICK')
        requireContract(
          old.samples.every((s) => s.tick < plan.tick) &&
            old.events.every((e) => e.tick <= plan.tick),
          'Intervention boundary sample t belongs exclusively to new segment',
        );
      const changed =
        plan.timing === 'AT_LAST_ACCEPTED_TICK' ||
        (active?.identity ?? null) !== plan.nextIdentity ||
        (active?.mode ?? 'AUTO') !== plan.nextMode ||
        plan.reason !== null;
      if (!changed) return p;
      requireContract(old === null || plan.reason !== null, 'Intervention close reason required');
      const closed =
        old === null
          ? null
          : admitInterventionRecord({
              ...old,
              endTick: plan.tick,
              closeReason: plan.reason,
              completeness: plan.reason === 'DATA_LOSS' ? 'INCOMPLETE' : 'CLOSED',
            }).record;
      let opened: InterventionSegment | null = null;
      if (plan.nextIdentity !== null && plan.timing !== 'AT_LAST_ACCEPTED_TICK') {
        requireContract(
          plan.nextMode !== 'AUTO' && segmentSequence < Number.MAX_SAFE_INTEGER,
          'Intervention new segment identity',
        );
        opened = admitInterventionRecord({
          ...context,
          segmentId: interventionText(`${id}:segment:${++segmentSequence}`),
          vehicleId: plan.nextIdentity.entityId,
          controlMode: plan.nextMode,
          learningEligible:
            plan.reason === 'ROLLOVER' && old !== null
              ? old.learningEligible
              : plan.nextMode === 'LEARNING' && nextTarget.learningEligible,
          playerId: nextTarget.playerId,
          profileId: nextTarget.profileId,
          baseVersionId: nextTarget.baseVersionId,
          learningEpoch: nextTarget.learningEpoch,
          controlPreferencesVersion: nextTarget.controlPreferencesVersion,
          startTick: plan.tick,
          endTick: null,
          closeReason: null,
          engineVersion: nextTarget.engineVersion,
          mapVersion: nextTarget.mapVersion,
          inputType: nextTarget.inputType,
          samples: [],
          events: [],
          completeness: 'OPEN',
        }).record;
      }
      if (closed !== null || opened !== null) {
        external(p, 'before', () => {
          p.recordOpaque = ports.records.reserve(closed, opened);
        });
        p.record = readInterventionRecordReservation(p.recordOpaque, closed, opened);
      }
      const expected = Object.freeze([
        ...(closed ? [event('MANUAL_END', closed, plan.tick)] : []),
        ...(opened ? [event('MANUAL_START', opened, plan.tick)] : []),
      ]);
      external(p, 'before', () => {
        p.eventsOpaque = ports.events.reserve(expected);
      });
      p.events = readInterventionEventReservation(p.eventsOpaque, expected);
      p.eventsDone = false;
      p.eventDelivery = 'NOT_ATTEMPTED';
      p.intake =
        closed === null || plan.timing === 'AT_LAST_ACCEPTED_TICK'
          ? null
          : descriptor(closed, interventionText(`${id}:close:${sequence}`), nextTarget);
      if (p.intake) {
        p.intakeReserved = true;
        requireContract(
          external(p, 'before', () => ports.reserveIntake(p.intake!)) === undefined,
          'Intervention intake reservation void',
        );
        p.intakeDone = false;
        p.intakeDelivery = 'NOT_ATTEMPTED';
      }
      return p;
    } catch (error) {
      let cleanup: unknown = null;
      try {
        rejectResources(p);
      } catch (e) {
        cleanup = e;
      }
      if (cleanup === null && !p.quarantined) pending = null;
      else {
        p.quarantined = true;
        fail('ADMISSION', error, plan.tick, false);
      }
      throw cleanup === null
        ? error
        : new AggregateError([error, cleanup], 'Intervention admission and cleanup failures');
    }
  }
  function completeRecord(p: Pending) {
    if (p.committed) return;
    requireContract(!p.quarantined, 'Intervention record acceptance quarantined');
    if (p.record && p.recordOpaque) {
      let error: unknown = null,
        returned = false,
        receipt: ReturnType<typeof readInterventionRecordReceipt> | null = null;
      try {
        receipt = readInterventionRecordReceipt(
          external(p, 'after', () => {
            const raw = ports.records.commit(p.recordOpaque!);
            returned = true;
            return raw;
          }),
          p.record,
        );
      } catch (e) {
        error = e;
        if (returned) p.quarantined = true;
      }
      if (p.quarantined) {
        fail('RECORD_COMMIT', error, p.plan.tick, true);
        throw error;
      }
      try {
        const raw = external(p, 'after', () => ports.records.inspectReceipt(p.recordOpaque!));
        requireContract(raw !== null, 'Unknown intervention record acceptance');
        const inspected = readInterventionRecordReceipt(raw, p.record);
        if (receipt)
          requireContract(
            JSON.stringify(receipt) === JSON.stringify(inspected),
            'Conflicting commit/readback receipt',
          );
        receipt = inspected;
        requireContract(receipt.accepted === true, 'Unaccepted intervention record');
        if (p.record.closed)
          sameInterventionRecord(
            external(p, 'after', () => ports.records.read(p.record!.closed!.segmentId)),
            p.record.closed,
          );
        if (p.record.opened)
          sameInterventionRecord(
            external(p, 'after', () => ports.records.read(p.record!.opened!.segmentId)),
            p.record.opened,
          );
      } catch (inspectError) {
        p.quarantined = true;
        fail('RECORD_COMMIT', error ?? inspectError, p.plan.tick, true);
        if (error !== null) fail('RECORD_COMMIT', inspectError, p.plan.tick, true);
        throw error === null
          ? inspectError
          : new AggregateError(
              [error, inspectError],
              'Intervention commit and receipt/readback failures',
            );
      }
      if (p.record.closed) lastClosed = view(p.record.closed, p.oldIdentity!);
      active = p.record.opened ? view(p.record.opened, p.plan.nextIdentity!) : null;
      activeMetadata = p.record.opened;
      p.committed = true;
      target = p.target;
      if (error !== null) {
        fail('RECORD_COMMIT', error, p.plan.tick, true);
        throw error;
      }
    } else {
      p.committed = true;
      target = p.target;
    }
  }
  function acceptedFence(p: Pending) {
    requireContract(p.after !== null, 'Intervention missing accepted fence');
    try {
      fence(p.after);
    } catch (error) {
      p.quarantined = true;
      fail('AUTHORITY', error, p.plan.tick, true);
      throw error;
    }
  }
  function flush(p: Pending) {
    requireContract(!p.quarantined && p.after !== null, 'Intervention delivery quarantined');
    acceptedFence(p);
    if (!p.eventsDone && p.events && p.eventsOpaque) {
      let original: unknown = null,
        returned = false;
      p.eventDelivery = 'UNKNOWN';
      try {
        const r = readInterventionEventReceipt(
          external(p, 'after', () => {
            const raw = ports.events.commit(p.eventsOpaque!, () => acceptedFence(p));
            returned = true;
            return raw;
          }),
          p.events,
        );
        requireContract(r.complete, 'Incomplete intervention event commit');
        p.eventsDone = true;
        p.eventDelivery = 'ACCEPTED';
        requireContract(r.listenerFailures === 0, 'Accepted event listener failures');
      } catch (e) {
        original = e;
        if (returned) p.quarantined = true;
      }
      if (original !== null) {
        p.eventDelivery = 'UNKNOWN';
        if (!p.quarantined)
          try {
            const raw = external(p, 'after', () => ports.events.inspectReceipt(p.eventsOpaque!));
            requireContract(raw !== null, 'Unknown event acceptance');
            const r = readInterventionEventReceipt(raw, p.events);
            p.eventsDone = r.complete;
            p.eventDelivery = r.complete
              ? 'ACCEPTED'
              : r.acceptedCount > 0
                ? 'ACCEPTED_PREFIX'
                : 'KNOWN_UNACCEPTED';
          } catch (inspectError) {
            p.quarantined = true;
            fail('EVENT_DELIVERY', original, p.plan.tick, true);
            fail('EVENT_DELIVERY', inspectError, p.plan.tick, true);
            throw new AggregateError(
              [original, inspectError],
              'Intervention event original/inspection failures',
            );
          }
        fail('EVENT_DELIVERY', original, p.plan.tick, true);
        throw original;
      }
    }
    acceptedFence(p); // No intake following an event callback that changed target/native ownership.
    if (!p.intakeDone && p.intake) {
      let original: unknown = null,
        returned = false;
      p.intakeDelivery = 'UNKNOWN';
      try {
        const r = readInterventionIntakeReceipt(
          external(p, 'after', () => {
            const raw = ports.acceptIntake(p.intake!);
            returned = true;
            return raw;
          }),
          p.intake,
        );
        requireContract(r.accepted === true, 'Unaccepted intake callback');
        p.intakeDone = true;
        p.intakeDelivery = 'ACCEPTED';
      } catch (e) {
        original = e;
        if (returned) p.quarantined = true;
      }
      if (original !== null) {
        p.intakeDelivery = 'UNKNOWN';
        if (!p.quarantined)
          try {
            const raw = external(p, 'after', () => ports.inspectIntake(p.intake!.operationId));
            requireContract(raw !== null, 'Unknown intake acceptance');
            const r = readInterventionIntakeReceipt(raw, p.intake);
            p.intakeDone = r.accepted;
            p.intakeDelivery = r.accepted ? 'ACCEPTED' : 'KNOWN_UNACCEPTED';
          } catch (inspectError) {
            p.quarantined = true;
            fail('INTAKE', original, p.plan.tick, true);
            fail('INTAKE', inspectError, p.plan.tick, true);
            throw new AggregateError(
              [original, inspectError],
              'Intervention intake original/inspection failures',
            );
          }
      }
      if (p.intakeDone)
        results.set(p.intake.operationId, {
          descriptor: p.intake,
          identity: p.oldIdentity!,
          consumed: false,
        });
      if (original !== null) {
        fail('INTAKE', original, p.plan.tick, true);
        throw original;
      }
    }
    acceptedFence(p);
    if (p.eventsDone && p.intakeDone) {
      completed = p;
      pending = null;
      if (p.plan.timing === 'AT_LAST_ACCEPTED_TICK') {
        retired = true;
        results.clear();
      }
    }
  }
  function settleOwned(ticket: InterventionBoundaryTicket) {
    if (completed?.ticket === ticket) {
      requireContract(completed.after !== null, 'Missing completed boundary fence');
      try {
        fence(completed.after);
      } catch (e) {
        completed.quarantined = true;
        fail('AUTHORITY', e, ticket.tick, true);
        throw e;
      }
      requireContract(!completed.quarantined, 'Completed boundary quarantined');
      return 'ACCEPTED' as const;
    }
    requireContract(pending?.ticket === ticket, 'Intervention exact ticket identity');
    const p = pending,
      a = authority();
    requireContract(!p.quarantined, 'Intervention pending quarantined');
    if (a.tick === p.ticket.baseTick) {
      fence(p.before);
      return 'PENDING' as const;
    }
    if (
      a.tick !== p.plan.tick ||
      a.identity !== p.plan.nextIdentity ||
      a.mode !== p.plan.nextMode
    ) {
      p.quarantined = true;
      const e = new Error('Intervention accepted physical authority mismatch');
      fail('AUTHORITY', e, p.plan.tick, false);
      fault = Object.freeze({ ...fault!, physicalAcceptance: 'UNKNOWN' });
      throw e;
    }
    acceptedTick = a.tick;
    const physicalFence = bindPhysicalPhase(p);
    try {
      fence(physicalFence);
      completeRecord(p);
      flush(p);
    } catch (e) {
      if (p.quarantined || fault === null) fail('RECORD_COMMIT', e, p.plan.tick, true);
      throw e;
    }
    if (a.fault !== null) {
      fail('AUTHORITY', a.fault, p.plan.tick, true);
      throw new Error('Intervention physical authority accepted with fault');
    }
    return 'ACCEPTED' as const;
  }
  return Object.freeze({
    prepare(value: InterventionBoundaryPlan) {
      return run(() => {
        requireContract(pending === null, 'Intervention pending boundary');
        const before = currentFence(),
          a = before.authority;
        requireContract(
          a.tick === acceptedTick && !a.suspended && a.fault === null,
          'Intervention preparation authority',
        );
        const d = fields(value, [
          ...contextFields,
          'version',
          'tick',
          'timing',
          'nextIdentity',
          'nextMode',
          'reason',
          'cause',
          'targetChange',
        ]);
        requireContract(
          d.version === '069-boundary-plan-v1' &&
            d.timing === 'PREPARED_BEFORE_NEXT_TICK' &&
            sameInterventionContext(readContext(d), context) &&
            tick(d.tick) === acceptedTick + 1,
          'Intervention next tick boundary',
        );
        const identity =
            d.nextIdentity === null
              ? null
              : interventionIdentity(d.nextIdentity, ports.bodyIdentity),
          mode = choice(d.nextMode, ['AUTO', 'MANUAL', 'LEARNING']);
        requireContract((identity === null) === (mode === 'AUTO'), 'Intervention planned seat');
        const cause = d.cause === null ? null : interventionCause(d.cause, ports.bodyIdentity),
          change = d.targetChange === null ? null : interventionTargetChange(d.targetChange);
        const reason = d.reason === null ? null : choice(d.reason, segmentCloseReasons);
        requireContract(
          reason === null || !terminalReasons.includes(reason as (typeof terminalReasons)[number]),
          'Retirement cause cannot be next-tick mode boundary',
        );
        if (cause)
          requireContract(
            callAt(before, () => ports.preparedCause(cause.operationId)) === d.cause &&
              sameInterventionContext(cause, context) &&
              cause.tick === d.tick &&
              cause.timing === d.timing &&
              cause.reason === reason &&
              cause.identity === a.identity,
            'Intervention cause host admission',
          );
        if (causedReasons.includes(reason as (typeof causedReasons)[number]))
          requireContract(
            cause !== null,
            'Intervention real ride/recovery/rollover/preferences cause required',
          );
        if (change) {
          requireContract(
            callAt(before, () => ports.preparedTarget(change.operationId)) === d.targetChange &&
              sameInterventionContext(change, context) &&
              change.tick === d.tick &&
              change.reason === reason &&
              change.reason !== 'STATE_IMPORT' &&
              (change.reason === 'CONTROL_PREFERENCES_CHANGE'
                ? change.target.learningEpoch === target.learningEpoch &&
                  change.target.controlPreferencesVersion !== target.controlPreferencesVersion
                : change.target.learningEpoch > target.learningEpoch),
            'Intervention profile target admission',
          );
        } else
          requireContract(
            reason !== 'PROFILE_CHANGE' &&
              reason !== 'PROFILE_RESTORE' &&
              reason !== 'PROFILE_IMPORT' &&
              reason !== 'CONTROL_PREFERENCES_CHANGE',
            'Intervention target change receipt required',
          );
        const nextTarget =
          change?.target ?? interventionTarget(callAt(before, () => ports.readTarget()));
        requireContract(
          change !== null || sameInterventionTarget(nextTarget, target),
          'Unadmitted target change',
        );
        if (a.identity === identity && a.mode !== mode)
          requireContract(reason === 'MODE_CHANGE', 'Intervention mode close cause');
        if (a.identity !== identity && a.identity !== null)
          requireContract(
            identity === null
              ? reason === 'RETURN_TO_AUTO' || reason === 'VEHICLE_SWITCH'
              : reason === 'VEHICLE_SWITCH',
            'Intervention authority departure cause',
          );
        requireContract(sequence < Number.MAX_SAFE_INTEGER, 'Intervention sequence capacity');
        sequence++;
        const plan = Object.freeze({
          ...context,
          version: '069-boundary-plan-v1' as const,
          tick: tick(d.tick),
          timing: 'PREPARED_BEFORE_NEXT_TICK' as const,
          nextIdentity: identity,
          nextMode: mode,
          reason,
          cause,
          targetChange: change,
        });
        return reserve(plan, nextTarget, {
          ...before,
          identities: Object.freeze([
            ...new Set([...before.identities, ...(identity ? [identity] : [])]),
          ]),
        }).ticket;
      });
    },
    bindAcceptedPhase(ticket: InterventionBoundaryTicket) {
      return run(() => {
        requireContract(pending?.ticket === ticket, 'Intervention exact physical phase ticket');
        bindPhysicalPhase(pending);
      });
    },
    assertAcceptedPhase(ticket: InterventionBoundaryTicket) {
      return run(() => {
        const p =
          pending?.ticket === ticket ? pending : completed?.ticket === ticket ? completed : null;
        requireContract(
          p !== null && p.after !== null && !p.quarantined,
          'Intervention missing/quarantined fixed physical phase',
        );
        acceptedFence(p);
      });
    },
    settle(ticket: InterventionBoundaryTicket) {
      return run(() => settleOwned(ticket));
    },
    retryDelivery(ticket: InterventionBoundaryTicket) {
      return run(() => {
        requireContract(
          pending?.ticket === ticket && pending.committed && !pending.quarantined,
          'Intervention retry requires known accepted record prefix',
        );
        requireContract(
          pending.eventDelivery !== 'UNKNOWN' && pending.intakeDelivery !== 'UNKNOWN',
          'Intervention delivery acceptance unknown; retry forbidden',
        );
        requireContract(pending.after !== null, 'Missing retry fence');
        acceptedFence(pending);
        flush(pending);
        return completed?.ticket === ticket;
      }, true);
    },
    reject(ticket: InterventionBoundaryTicket) {
      run(() => {
        requireContract(
          pending?.ticket === ticket && !pending.committed && !pending.quarantined,
          'Cannot reject accepted/quarantined intervention',
        );
        fence(pending.before);
        const p = pending;
        rejectResources(p);
        pending = null;
      });
    },
    readBoundary(identity: BodyIdentity) {
      return run(() => {
        requireContract(!pending?.quarantined, 'Intervention boundary acceptance unknown');
        const f = readPhase();
        callAt(f, () => interventionIdentity(identity, ports.bodyIdentity));
        return active?.identity === identity
          ? active
          : lastClosed?.identity === identity
            ? lastClosed
            : null;
      }, true);
    },
    closeSelection(value: {
      context: ContractContext;
      identity: BodyIdentity;
      segmentId: string;
      mode: 'MANUAL' | 'LEARNING';
      tick: number;
      reason: 'VEHICLE_SWITCH';
    }) {
      run(() => {
        const d = fields(value, ['context', 'identity', 'segmentId', 'mode', 'tick', 'reason']);
        requireContract(
          pending !== null &&
            active !== null &&
            sameInterventionContext(readContext(fields(d.context, contextFields)), context) &&
            d.identity === active?.identity &&
            d.segmentId === active.segmentId &&
            d.mode === active.mode &&
            d.tick === pending.plan.tick &&
            pending.plan.reason === 'VEHICLE_SWITCH' &&
            d.reason === 'VEHICLE_SWITCH',
          'Intervention selection callback identity',
        );
        settleOwned(pending.ticket);
      });
    },
    retire(value: InterventionCause) {
      run(() => {
        requireContract(
          pending === null && sequence < Number.MAX_SAFE_INTEGER,
          'Intervention retirement pending/sequence capacity',
        );
        const before = currentFence(),
          a = before.authority,
          cause = interventionCause(value, ports.bodyIdentity);
        requireContract(
          callAt(before, () => ports.preparedCause(cause.operationId)) === value &&
            sameInterventionContext(cause, context) &&
            cause.timing === 'AT_LAST_ACCEPTED_TICK' &&
            cause.tick === a.tick &&
            a.tick === acceptedTick &&
            cause.identity === a.identity &&
            terminalReasons.includes(cause.reason as (typeof terminalReasons)[number]),
          'Intervention retirement admission',
        );
        sequence++;
        const plan = Object.freeze({
            ...context,
            version: '069-boundary-plan-v1' as const,
            tick: a.tick,
            timing: 'AT_LAST_ACCEPTED_TICK' as const,
            nextIdentity: null,
            nextMode: 'AUTO' as const,
            reason: cause.reason,
            cause,
            targetChange: null,
          }),
          p = reserve(plan, target, before);
        p.after = before;
        try {
          completeRecord(p);
          flush(p);
        } catch (e) {
          fail('RECORD_COMMIT', e, a.tick, true);
          throw e;
        }
      });
    },
    admitResult(value: InterventionResultToken) {
      return run(() => {
        requireContract(pending === null, 'Intervention result requires settled generation');
        const f = currentFence();
        requireContract(f.authority.fault === null, 'Intervention result authority fault');
        const d = fields(value, [
          ...contextFields,
          'version',
          'segmentId',
          'operationId',
          'playerId',
          'profileId',
          'baseVersionId',
          'learningEpoch',
        ]);
        requireContract(d.version === '069-intake-result-token-v1', 'Intervention result version');
        const operationId = interventionText(d.operationId),
          segmentId = interventionText(d.segmentId),
          playerId = interventionText(d.playerId),
          profileId = interventionText(d.profileId),
          baseVersionId = interventionText(d.baseVersionId),
          epoch = tick(d.learningEpoch),
          e = results.get(operationId);
        if (
          !e ||
          e.consumed ||
          !sameInterventionContext(readContext(d), e.descriptor) ||
          segmentId !== e.descriptor.segmentId ||
          playerId !== e.descriptor.playerId ||
          profileId !== e.descriptor.profileId ||
          epoch !== e.descriptor.learningEpoch ||
          baseVersionId !== e.descriptor.baseVersionId ||
          playerId !== target.playerId ||
          profileId !== target.profileId ||
          epoch !== target.learningEpoch ||
          baseVersionId !== target.baseVersionId
        )
          return false;
        const resultFence = {
          ...f,
          identities: Object.freeze([...new Set([...f.identities, e.identity])]),
        };
        callAt(resultFence, () => interventionIdentity(e.identity, ports.bodyIdentity));
        const raw = callAt(resultFence, () => ports.inspectIntake(operationId));
        requireContract(
          raw !== null && readInterventionIntakeReceipt(raw, e.descriptor).accepted === true,
          'Intervention result requires actual retained queue acceptance',
        );
        fence(resultFence);
        e.consumed = true;
        return true;
      });
    },
    appendSample(identity: BodyIdentity, value: TelemetrySample) {
return recordStage('append', () => {
      run(() => {
        requireContract(
          pending === null && active?.identity === identity,
          'Intervention sample requires settled current OPEN',
        );
        const f = currentFence();
        requireContract(
          f.authority.identity === identity &&
            f.authority.mode === active.mode &&
            !f.authority.suspended &&
            f.authority.fault === null,
          'Intervention host sample accepted authority',
        );
        callAt(f, () => interventionIdentity(identity, ports.bodyIdentity));
        const old = openRecord(callAt(f, () => ports.records.read(active!.segmentId)));
        requireContract(
          old.samples.length < INTERVENTION_LIMITS.samples,
          'Intervention sample capacity',
        );
        const admitted = admitInterventionRecord({
            ...old,
            samples: [...old.samples, value],
          }).record,
          sample = admitted.samples.at(-1)!;
        requireContract(
          sample.tick === acceptedTick &&
            sample.state.controlMode === active.mode &&
            sample.state.vehicleId === identity.entityId &&
            sample.command.vehicleId === identity.entityId &&
            sample.command.source === 'PLAYER' &&
            sample.state.appliedProfileVersion === target.baseVersionId &&
            sameInterventionContext(sample.state, context),
          'Intervention host sample metadata provenance',
        );
        requireContract(
          callAt(f, () => ports.records.appendSample(active!.segmentId, sample)) === undefined,
          'Intervention append sample void',
        );
        sameInterventionRecord(
          callAt(f, () => ports.records.read(active!.segmentId)),
          admitted,
        );
        fence(f);
      });
    
});
},
    acknowledgeResult(operationId: string) {
      run(() => {
        requireContract(pending === null, 'Intervention acknowledgement pending');
        const f = currentFence(),
          e = results.get(interventionText(operationId));
        requireContract(
          e !== undefined &&
            (e.consumed ||
              e.descriptor.playerId !== target.playerId ||
              e.descriptor.profileId !== target.profileId ||
              e.descriptor.learningEpoch !== target.learningEpoch ||
              e.descriptor.baseVersionId !== target.baseVersionId),
          'Unconsumed current intervention result',
        );
        function released() {
          const raw = callAt(f, () => ports.inspectIntakeRelease(operationId));
          if (raw === null) return false;
          const d = fields(raw, ['version', 'operationId', 'segmentId', 'released']);
          requireContract(
            d.version === '069-intake-release-v1' &&
              d.operationId === operationId &&
              d.segmentId === e!.descriptor.segmentId &&
              d.released === true,
            'Unknown intake release receipt',
          );
          return true;
        }
        const raw = callAt(f, () => ports.inspectIntake(operationId));
        if (raw === null) {
          requireContract(released(), 'Intervention intake acknowledgement unknown');
          fence(f);
          results.delete(operationId);
          return;
        }
        requireContract(
          readInterventionIntakeReceipt(raw, e.descriptor).accepted === true,
          'Unaccepted intake acknowledgement',
        );
        let primary: unknown = null;
        try {
          requireContract(
            callAt(f, () => ports.acknowledgeIntake(operationId)) === undefined,
            'Intervention intake acknowledgement void',
          );
        } catch (error) {
          primary = error;
        }
        try {
          requireContract(released(), 'Unknown intake release receipt');
          fence(f);
          results.delete(operationId);
        } catch (error) {
          if (primary !== null)
            throw new AggregateError(
              [primary, error],
              'Intervention acknowledgement primary/receipt failures',
            );
          throw error;
        }
        if (primary !== null) throw primary;
      });
    },
    quarantineAuthority(error: unknown, attemptedTick: number) {
      requireContract(!busy && !disposed, 'Intervention quarantine lifecycle');
      if (pending) pending.quarantined = true;
      if (completed) completed.quarantined = true;
      const knownAccepted = pending?.plan.tick === attemptedTick && acceptedTick === attemptedTick;
      fail('AUTHORITY', error, tick(attemptedTick), knownAccepted);
      if (!knownAccepted) fault = Object.freeze({ ...fault!, physicalAcceptance: 'UNKNOWN' });
    },
    inspectTicket(ticket: InterventionBoundaryTicket) {
      requireContract(!disposed, 'Intervention disposed');
      const p =
        pending?.ticket === ticket ? pending : completed?.ticket === ticket ? completed : null;
      return p === null
        ? null
        : Object.freeze({
            committed: p.committed,
            eventsDone: p.eventsDone,
            intakeDone: p.intakeDone,
            eventDelivery: p.eventDelivery,
            intakeDelivery: p.intakeDelivery,
            quarantined: p.quarantined,
            completed: completed === p,
            recordReservationReferenceRetained: p.recordOpaque !== null,
            eventReservationReferenceRetained: p.eventsOpaque !== null,
            intakeReservationAttemptRetained: p.intakeReserved,
            cleanupAttempted: Object.freeze([...p.cleanupAttempted]),
          });
    },
    observe() {
      return run(
        () => {
          const quarantined =
            pending?.quarantined ??
            completed?.quarantined ??
            fault?.physicalAcceptance === 'UNKNOWN';
          const f =
            retired || quarantined ? (completed?.after ?? pending?.after ?? null) : readPhase();
          if (f !== null && !retired && !quarantined) fence(f);
          return Object.freeze({
            context,
            acceptedTick,
            active,
            lastClosed,
            suspended: quarantined ? null : (f?.authority.suspended ?? false),
            authorityReadback: quarantined
              ? 'UNVALIDATED'
              : retired
                ? 'RETIRED_SNAPSHOT'
                : 'CURRENT',
            metadataAcceptance: quarantined && !pending?.committed ? 'UNKNOWN' : 'ACCEPTED',
            retired,
            fault,
            pending: pending?.ticket ?? null,
            quarantined: pending?.quarantined ?? completed?.quarantined ?? false,
            results: results.size,
          });
        },
        true,
        true,
      );
    },
    dispose() {
      requireContract(
        !busy && pending === null,
        'Intervention cannot dispose pending protected admission',
      );
      if (disposed) return;
      requireContract(
        retired || active === null,
        'Intervention explicit shutdown retirement required',
      );
      disposed = true;
      active = null;
      activeMetadata = null;
      lastClosed = null;
      completed = null;
      results.clear();
    },
  });
}
export type InterventionLifecycle = ReturnType<typeof createInterventionLifecycle>;
