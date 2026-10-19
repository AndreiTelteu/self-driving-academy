import assert from 'node:assert/strict';
import test from 'node:test';
import { segmentFixture } from './manual-segments-fixture';
import type { InterventionResultToken } from '../../src/telemetry';

test('069 mode boundary t samples belong only to new OPEN; eligibility is frozen', () => {
  const f = segmentFixture();
  let v = f.apply('MANUAL');
  const first = v.active!;
  f.store.appendSample(first.segmentId, f.actualSample(1, 'MANUAL'));
  f.setTarget(Object.freeze({ ...f.target(), learningEligible: false }));
  v = f.apply('LEARNING', 'MODE_CHANGE');
  assert.equal(f.store.port.read(first.segmentId)!.endTick, 2);
  assert.equal(f.store.port.read(first.segmentId)!.samples.at(-1)!.tick, 1);
  assert.equal(v.active!.startTick, 2);
  assert.equal(f.store.port.read(v.active!.segmentId)!.learningEligible, false);
  f.setTarget(Object.freeze({ ...f.target(), learningEligible: true }));
  f.store.appendSample(v.active!.segmentId, f.actualSample(2, 'LEARNING'));
  f.apply('MANUAL', 'MODE_CHANGE');
  assert.equal(f.intake.getStats().entries, 0);
});
test('069 CLOSED eligible LEARNING only queues real receipt, result token applies at most once', () => {
  const f = segmentFixture();
  const v = f.apply('LEARNING');
  f.store.appendSample(v.active!.segmentId, f.actualSample(1, 'LEARNING'));
  f.apply('MANUAL', 'MODE_CHANGE');
  assert.equal(f.intake.getStats().entries, 1);
  const descriptor = f.intake.read('tests:close:2')!;
  const token: InterventionResultToken = {
    ...f.context,
    version: '069-intake-result-token-v1',
    segmentId: descriptor.segmentId,
    operationId: descriptor.operationId,
    playerId: descriptor.playerId,
    profileId: descriptor.profileId,
    baseVersionId: descriptor.baseVersionId,
    learningEpoch: descriptor.learningEpoch,
  };
  assert.equal(f.owner.admitResult({ ...token, worldEpoch: 9 }), false);
  assert.equal(f.owner.admitResult(token), true);
  assert.equal(f.owner.admitResult(token), false);
});
test('069 same-mode trip boundary admitted before t, preserved sample prefix, no authority mutation', () => {
  const f = segmentFixture();
  const old = f.apply('LEARNING').active!;
  f.store.appendSample(old.segmentId, f.actualSample(1, 'LEARNING'));
  const before = f.authority(),
    c = f.cause('RIDE_COMPLETED'),
    ticket = f.owner.prepare(f.plan('LEARNING', 'RIDE_COMPLETED', c));
  assert.equal(f.authority(), before);
  f.accept(f.plan('LEARNING', 'RIDE_COMPLETED', c));
  f.owner.settle(ticket);
  const next = f.owner.observe().active!;
  assert.notEqual(old.segmentId, next.segmentId);
  assert.equal(next.mode, 'LEARNING');
  assert.equal(next.startTick, 2);
  assert.equal(f.store.port.read(old.segmentId)!.samples[0].tick, 1);
});
test('069 pause keeps OPEN/mode and cannot create a native tick or close event', () => {
  const f = segmentFixture();
  const old = f.apply('LEARNING').active!;
  const events = f.events.getStats().retainedEvents;
  f.setAuthority(Object.freeze({ ...f.authority(), suspended: true }));
  assert.equal(f.owner.observe().active, old);
  assert.throws(() => f.owner.prepare(f.plan('LEARNING')), /authority/);
  assert.equal(f.authority().tick, 1);
  assert.equal(f.events.getStats().retainedEvents, events);
  f.setAuthority(Object.freeze({ ...f.authority(), suspended: false }));
  assert.equal(f.owner.observe().active, old);
});
test('069068 close callback and authority observer consume one exact reservation/publication', () => {
  const f = segmentFixture();
  const old = f.apply('MANUAL').active!,
    p = f.plan('AUTO', 'VEHICLE_SWITCH'),
    ticket = f.owner.prepare(p);
  f.accept(p);
  f.owner.closeSelection({
    context: f.context,
    identity: f.identity,
    segmentId: old.segmentId,
    mode: 'MANUAL',
    tick: 2,
    reason: 'VEHICLE_SWITCH',
  });
  const count = f.events.getStats().retainedEvents;
  assert.equal(f.owner.settle(ticket), 'ACCEPTED');
  assert.equal(f.events.getStats().retainedEvents, count);
  assert.equal(f.owner.readBoundary(f.identity)!.completeness, 'CLOSED');
});
for (const reason of ['PROFILE_CHANGE', 'PROFILE_RESTORE', 'PROFILE_IMPORT'] as const)
  test(`069 ${reason} fences old result and preserves old fixed epoch`, () => {
    const f = segmentFixture();
    const old = f.apply('LEARNING').active!;
    const next = Object.freeze({ ...f.target(), learningEpoch: 2, baseVersionId: 'style-v2' }),
      change = f.change(reason, next);
    f.apply('LEARNING', reason, null, change);
    assert.equal(f.store.port.read(old.segmentId)!.learningEpoch, 1);
    assert.equal(f.owner.observe().active!.startTick, 2);
    assert.equal(f.intake.getStats().entries, 0);
  });
test('069 invalid restore preview/foreign receipt changes nothing', () => {
  const f = segmentFixture();
  const active = f.apply('MANUAL').active!,
    before = f.authority();
  const change = f.change('PROFILE_RESTORE', Object.freeze({ ...f.target(), learningEpoch: 2 }));
  assert.throws(
    () => f.owner.prepare(f.plan('MANUAL', 'PROFILE_RESTORE', null, { ...change })),
    /admission/,
  );
  assert.equal(f.owner.observe().active, active);
  assert.equal(f.authority(), before);
  assert.equal(f.target().learningEpoch, 1);
});
test('069 STATE_IMPORT retirement at last accepted t keeps already recorded t and adds no physics', () => {
  const f = segmentFixture();
  const active = f.apply('LEARNING').active!;
  f.store.appendSample(active.segmentId, f.actualSample(1, 'LEARNING'));
  const before = f.authority(),
    cause = f.cause('STATE_IMPORT', 'AT_LAST_ACCEPTED_TICK');
  assert.throws(() => f.owner.prepare(f.plan('LEARNING', 'STATE_IMPORT', cause)), /Retirement/);
  f.owner.retire(cause);
  const closed = f.store.port.read(active.segmentId)!;
  assert.equal(closed.samples[0].tick, 1);
  assert.equal(closed.endTick, 1);
  assert.equal(closed.closeReason, 'STATE_IMPORT');
  assert.equal(f.authority(), before);
  assert.equal(f.owner.observe().retired, true);
  assert.throws(() => f.owner.prepare(f.plan('LEARNING')), /lifecycle/);
  assert.equal(f.intake.getStats().entries, 0);
});
test('069 stale generation and copied ticket cannot mutate protected OPEN', () => {
  const f = segmentFixture(),
    p = f.plan('MANUAL'),
    ticket = f.owner.prepare(p);
  assert.throws(() => f.owner.settle({ ...ticket }), /ticket/);
  f.owner.reject(ticket);
  f.identities.set(f.identity.entityId, Object.freeze({ ...f.identity, generation: 2 }));
  assert.throws(() => f.owner.prepare(p), /Stale/);
  assert.equal(f.authority().tick, 0);
  assert.equal(f.store.getStats().records, 0);
});
test('069 prephysical event capacity rejects without record loss or authority change', () => {
  const f = segmentFixture({}, 1),
    old = f.apply('MANUAL').active!,
    before = f.authority();
  assert.throws(() => f.owner.prepare(f.plan('LEARNING', 'MODE_CHANGE')), /backpressure/);
  assert.equal(f.authority(), before);
  assert.equal(f.store.port.read(old.segmentId)!.completeness, 'OPEN');
  assert.equal(f.store.getStats().reservations, 0);
});
test('069 accepted007 failing listener is preserved and never delivered twice on retry', () => {
  const f = segmentFixture();
  let count = 0;
  f.events.subscribe(() => {
    count++;
    throw Error('listener failed');
  });
  const p = f.plan('MANUAL'),
    ticket = f.owner.prepare(p);
  f.accept(p);
  assert.throws(() => f.owner.settle(ticket), /listener failures/);
  assert.equal(f.owner.observe().acceptedTick, 1);
  assert.equal(f.store.getStats().open, 1);
  assert.equal(count, 1);
  assert.equal(f.owner.retryDelivery(ticket), true);
  assert.equal(count, 1);
});
test('069 accepted repository throw retains inspected physical prefix and original cause', () => {
  const f = segmentFixture();
  const original = f.ports.records.commit; // Port object is frozen; use another composition with wrapper.
  const g = segmentFixture({
    records: {
      ...f.ports.records,
      commit(r) {
        original(r);
        throw Error('postcommit failure');
      },
    },
  });
  const p = g.plan('MANUAL'),
    ticket = g.owner.prepare(p);
  g.accept(p);
  assert.throws(() => g.owner.settle(ticket), /postcommit failure/);
  assert.equal(g.owner.observe().acceptedTick, 1);
  assert.equal(g.owner.observe().fault!.physicalTickAccepted, true);
  assert.equal(g.owner.retryDelivery(ticket), true);
});
test('069 intake throw after accepted acknowledgement retains exact job and retry never duplicates', () => {
  const f = segmentFixture({
    acceptIntake(d) {
      f.intake.accept(d);
      throw Error('accepted intake callback failed');
    },
  });
  f.apply('LEARNING');
  const p = f.plan('MANUAL', 'MODE_CHANGE'),
    ticket = f.owner.prepare(p);
  f.accept(p);
  assert.throws(() => f.owner.settle(ticket), /callback failed/);
  assert.equal(f.intake.getStats().entries, 1);
  assert.equal(f.owner.retryDelivery(ticket), true);
  assert.equal(f.intake.getStats().entries, 1);
});
test('069 intake acceptance unknown prohibits blind retry but retains accepted CLOSED record', () => {
  const f = segmentFixture({
    acceptIntake() {
      throw Error('transport lost');
    },
    inspectIntake: () => null,
  });
  const old = f.apply('LEARNING').active!,
    p = f.plan('MANUAL', 'MODE_CHANGE'),
    ticket = f.owner.prepare(p);
  f.accept(p);
  assert.throws(
    () => f.owner.settle(ticket),
    (e) =>
      e instanceof AggregateError &&
      e.errors.some((x) => x instanceof Error && x.message === 'transport lost'),
  );
  assert.equal(f.store.port.read(old.segmentId)!.completeness, 'CLOSED');
  assert.throws(() => f.owner.retryDelivery(ticket), /known accepted|unknown/);
  assert.equal(f.authority().tick, 2);
});
test('069 intake confirmed unaccepted can retry same reservation without another physics tick', () => {
  let attempts = 0;
  const f = segmentFixture({
    acceptIntake(d) {
      if (attempts++ === 0) throw Error('known preacceptance');
      return f.intake.accept(d);
    },
  });
  f.apply('LEARNING');
  const p = f.plan('MANUAL', 'MODE_CHANGE'),
    ticket = f.owner.prepare(p);
  f.accept(p);
  assert.throws(() => f.owner.settle(ticket), /known preacceptance/);
  assert.equal(f.owner.retryDelivery(ticket), true);
  assert.equal(f.intake.getStats().entries, 1);
  assert.equal(f.authority().tick, 2);
});
test('069 preferences split records at same epoch with frozen old version', () => {
  const f = segmentFixture(),
    old = f.apply('LEARNING').active!,
    change = f.change(
      'CONTROL_PREFERENCES_CHANGE',
      Object.freeze({ ...f.target(), controlPreferencesVersion: 'keys-2' }),
    );
  f.apply('LEARNING', 'CONTROL_PREFERENCES_CHANGE', null, change);
  assert.equal(f.store.port.read(old.segmentId)!.controlPreferencesVersion, 'keys-1');
  assert.equal(
    f.store.port.read(f.owner.observe().active!.segmentId)!.controlPreferencesVersion,
    'keys-2',
  );
  assert.equal(f.target().learningEpoch, 1);
});
test('069 sample cap rejects without truncating and explicit rollover preserves eligible context', () => {
  const f = segmentFixture(),
    old = f.apply('LEARNING').active!;
  for (let t = 1; t <= 32; t++) {
    if (t > 1) f.apply('LEARNING');
    f.store.appendSample(old.segmentId, f.actualSample(t, 'LEARNING'));
  }
  assert.throws(() => f.store.appendSample(old.segmentId, f.actualSample(33, 'LEARNING')));
  assert.equal(f.store.port.read(old.segmentId)!.samples.length, 32);
  const c = f.cause('ROLLOVER');
  f.apply('LEARNING', 'ROLLOVER', c);
  const closed = f.store.port.read(old.segmentId)!,
    next = f.store.port.read(f.owner.observe().active!.segmentId)!;
  assert.equal(closed.samples.length, 32);
  assert.equal(next.learningEligible, closed.learningEligible);
  assert.equal(next.learningEpoch, closed.learningEpoch);
});
test('069 receipt readback failure retains both primary and inspection causes, blocks retry', () => {
  const f = segmentFixture({
    acceptIntake() {
      throw Error('original delivery');
    },
    inspectIntake() {
      throw Error('readback failure');
    },
  });
  f.apply('LEARNING');
  const p = f.plan('MANUAL', 'MODE_CHANGE'),
    t = f.owner.prepare(p);
  f.accept(p);
  assert.throws(
    () => f.owner.settle(t),
    (e) =>
      e instanceof AggregateError &&
      e.errors.length === 2 &&
      e.errors[0].message === 'original delivery' &&
      e.errors[1].message === 'readback failure',
  );
  assert.match(f.owner.observe().fault!.causes.join('|'), /original delivery.*readback failure/);
  assert.throws(() => f.owner.retryDelivery(t), /known accepted|unknown/);
});
test('069 owner sample admission rejects future/stale/nonaccepted subject without metadata loss', () => {
  const f = segmentFixture(),
    active = f.apply('LEARNING').active!;
  assert.throws(
    () => f.owner.appendSample(f.identity, f.actualSample(2, 'LEARNING')),
    /provenance/,
  );
  assert.equal(f.store.port.read(active.segmentId)!.samples.length, 0);
  f.owner.appendSample(f.identity, f.actualSample(1, 'LEARNING'));
  assert.equal(f.store.port.read(active.segmentId)!.samples.length, 1);
  assert.throws(() => f.owner.appendSample(f.identity, f.actualSample(1, 'LEARNING')));
  assert.equal(f.store.port.read(active.segmentId)!.samples.length, 1);
});
for (const reason of ['SESSION_CHANGE', 'WORLD_RESET', 'SHUTDOWN', 'DATA_LOSS'] as const)
  test(`069 ${reason} explicitly retires without fabricated AUTO physical acceptance`, () => {
    const f = segmentFixture(),
      old = f.apply('MANUAL').active!,
      a = f.authority();
    f.owner.retire(f.cause(reason, 'AT_LAST_ACCEPTED_TICK'));
    const closed = f.store.port.read(old.segmentId)!;
    assert.equal(closed.closeReason, reason);
    assert.equal(closed.endTick, 1);
    assert.equal(closed.completeness, reason === 'DATA_LOSS' ? 'INCOMPLETE' : 'CLOSED');
    assert.equal(f.authority(), a);
    assert.equal(f.owner.observe().active, null);
    assert.equal(f.owner.observe().retired, true);
  });
test('069 injected committed RECOVERY host fact reopens same mode, absent/failed fact does nothing', () => {
  const f = segmentFixture(),
    old = f.apply('LEARNING').active!,
    before = f.authority();
  assert.throws(() => f.owner.prepare(f.plan('LEARNING', 'RECOVERY')), /cause required/);
  assert.equal(f.authority(), before);
  assert.equal(f.owner.observe().active, old);
  const fact = f.cause('RECOVERY');
  f.apply('LEARNING', 'RECOVERY', fact);
  assert.equal(f.store.port.read(old.segmentId)!.closeReason, 'RECOVERY');
  assert.equal(f.owner.observe().active!.mode, 'LEARNING');
  assert.equal(f.owner.observe().active!.startTick, 2);
});
test('069 saturated protected history refuses before authority, retains every previous CLOSED/OPEN', () => {
  const f = segmentFixture();
  f.apply('MANUAL');
  for (let t = 2; t <= 64; t++) f.apply(t % 2 === 0 ? 'LEARNING' : 'MANUAL', 'MODE_CHANGE');
  const old = f.owner.observe().active!,
    a = f.authority();
  assert.equal(f.store.getStats().records, 64);
  assert.throws(() => f.owner.prepare(f.plan('MANUAL', 'MODE_CHANGE')), /capacity/);
  assert.equal(f.authority(), a);
  assert.equal(f.store.port.read(old.segmentId)!.completeness, 'OPEN');
  assert.equal(f.store.getStats().records, 64);
});
test('069 reentrant publication cannot create a second accepted boundary or steal reservation', () => {
  const f = segmentFixture();
  f.events.subscribe(() => {
    f.owner.prepare(f.plan('MANUAL'));
    return undefined;
  });
  const p = f.plan('MANUAL'),
    ticket = f.owner.prepare(p);
  f.accept(p);
  assert.throws(() => f.owner.settle(ticket), /listener failures/);
  assert.equal(f.authority().tick, 1);
  assert.equal(f.store.getStats().open, 1);
  assert.equal(f.events.getStats().retainedEvents, 1);
  assert.equal(f.owner.retryDelivery(ticket), true);
});
