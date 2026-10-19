/** SOURCE DRAFT. Pure scheduling ports; never advances physics. */
export class CaptureLifetime {
  constructor(ports, capacity = 4096) {
    this.ports = ports;
    this.capacity = capacity;
    this.causes = [];
    this.journal = [];
    this.overflow = 0;
    this.pending = null;
    this.lastTrigger = null;
    this.disposers = [];
    this.readbacks = [];
    this.closed = false;
    this.failed = false;
    this.sequence = 0;
    this.boundaries = {};
    this.lateCount = 0;
    this.lateSink = null;
    this.lateQueue = Promise.resolve();
    this.scheduling = { requests: 0, callbacks: 0, continuations: 0, maxCallbackDelayMs: 0, maxContinuationDelayMs: 0 };
  }
  cause(stage, error) {
    this.failed = true;
    const text = String(error);
    if (this.causes.length < 128) this.causes.push({ stage: String(stage).slice(0, 128), error: text.slice(0, 1024), omittedCodeUnits: Math.max(0, text.length - 1024), at: this.ports.now() });
    else this.causeOverflow = (this.causeOverflow ?? 0) + 1;
  }
  record(kind, detail = {}) {
    const candidate = { kind, at: this.ports.now(), ...detail };
    if (new TextEncoder().encode(JSON.stringify(candidate)).length > 2048) {
      this.fail('journal-record-capacity', new Error('Event exceeds2048 encoded bytes; event rejected explicitly'));
      return;
    }
    if (this.journal.length >= this.capacity) {
      this.overflow++;
      if (this.overflow === 1) this.fail('journal-overflow', new Error('Journal capacity exceeded'));
      return;
    }
    this.journal.push(structuredClone(candidate));
  }
  own(name, dispose) {
    if (this.closed) throw new Error('Cannot acquire after teardown');
    this.disposers.push({ name, dispose });
  }
  readback(name, read) { this.readbacks.push({ name, read }); }
  boundary(name, counters) { this.boundaries[name] = { at: this.ports.now(), counters: { ...counters } }; }
  onLate(sink) { this.lateSink = sink; }
  late(trigger, entry) {
    trigger.lateCallbackEntryMs = entry;
    this.fail('late-callback', new Error('Callback after settlement; no native advance; cause unknown'));
    const sequence = this.lateCount++;
    if (sequence >= 64) { this.cause('late-overflow', 'Supplemental late-event capacity exceeded'); return; }
    const event = structuredClone({ sequence, entry, trigger, state: 'FAILED_UNKNOWN' });
    this.lateQueue = this.lateQueue.then(async () => {
      if (!this.lateSink) throw new Error('Late callback has no durable supplemental sink');
      await this.lateSink(event);
    }).catch((error) => this.cause('late-export-or-readback', error));
  }
  fail(stage, error) {
    this.cause(stage, error);
    this.cancelPending(error);
  }
  cancelPending(error = new Error('Capture cancelled')) {
    const pending = this.pending;
    if (!pending) return;
    pending.finish(error);
  }
  nextFrame(counters) {
    if (this.failed || this.closed) return Promise.reject(new Error('Capture inactive'));
    if (this.pending) return Promise.reject(new Error('Single pending RAF invariant'));
    const trigger = {
      sequence: ++this.sequence,
      requestEntryMs: this.ports.now(),
      requestCounters: null,
      callbackEntryMs: null,
      continuationEntryMs: null,
      callbackCounters: null,
      continuationCounters: null,
      rafTimestampMs: null,
      lateCallbackEntryMs: null,
      boundaries: structuredClone(this.boundaries),
    };
    this.lastTrigger = trigger;
    this.scheduling.requests++;
    try { trigger.requestCounters = { ...counters() }; }
    catch (error) { this.fail('raf-request-readback', error); return Promise.reject(error); }
    return new Promise((resolve, reject) => {
      let settled = false;
      const pending = { raf: null, timer: null, finish: null };
      const finish = (error, stamp) => {
        if (settled) return;
        settled = true;
        try { if (pending.raf !== null) this.ports.cancelRaf(pending.raf); }
        catch (cleanup) { this.cause('cancel-raf', cleanup); error ??= cleanup; }
        try { if (pending.timer !== null) this.ports.clearTimer(pending.timer); }
        catch (cleanup) { this.cause('cancel-watchdog', cleanup); error ??= cleanup; }
        this.pending = null;
        if (error) reject(error); else resolve(stamp);
      };
      pending.finish = finish;
      this.pending = pending;
      try {
        pending.raf = this.ports.requestRaf((stamp) => {
          // Record callback ENTRY before any predicate, counter read, or Promise continuation.
          const entry = this.ports.now();
          if (settled) { this.late(trigger, entry); return; }
          trigger.callbackEntryMs = entry;
          this.scheduling.callbacks++;
          this.scheduling.maxCallbackDelayMs = Math.max(this.scheduling.maxCallbackDelayMs, entry - trigger.requestEntryMs);
          trigger.rafTimestampMs = stamp;
          try {
            trigger.callbackCounters = { ...counters() };
            if (!this.ports.foreground()) throw new Error('Foreground lost at callback');
            if (entry - trigger.requestEntryMs > 250) throw new Error('RAF deadline exceeded');
            finish(null, stamp);
          } catch (error) { this.fail('raf-callback', error); }
        });
        // Injectable ports may invoke synchronously before returning ownership handles.
        if (settled) { this.ports.cancelRaf(pending.raf); return; }
        pending.timer = this.ports.setTimer(() => {
          if (settled) return;
          trigger.watchdogEntryMs = this.ports.now();
          try { trigger.watchdogCounters = { ...counters() }; }
          catch (error) { this.cause('watchdog-readback', error); }
          this.fail('raf-watchdog', new Error('Pending RAF deadline exceeded; cause unknown'));
        }, 250);
        if (settled) this.ports.clearTimer(pending.timer);
      } catch (error) { this.fail('raf-request', error); }
    }).then((stamp) => {
      trigger.continuationEntryMs = this.ports.now();
      this.scheduling.continuations++;
      this.scheduling.maxContinuationDelayMs = Math.max(this.scheduling.maxContinuationDelayMs, trigger.continuationEntryMs - trigger.requestEntryMs);
      try {
        trigger.continuationCounters = { ...counters() };
        if (this.failed || this.closed || !this.ports.foreground()) throw new Error('Capture inactive at continuation');
        if (trigger.continuationEntryMs - trigger.requestEntryMs > 250) throw new Error('RAF continuation deadline exceeded');
      } catch (error) { this.fail('raf-continuation', error); throw error; }
      return stamp;
    });
  }
  teardown() {
    if (this.teardownResult) return this.teardownResult;
    this.closed = true;
    // Publish the promise before calling any externally supplied disposer.
    this.teardownResult = Promise.resolve().then(async () => {
      this.cancelPending(new Error('Capture disposed'));
      for (const item of this.disposers.reverse()) {
        try { const result = item.dispose(); if (result !== this.teardownResult) await result; }
        catch (error) { this.cause(`dispose:${item.name}`, error); }
      }
      const readbacks = {};
      for (const item of this.readbacks) {
        try { readbacks[item.name] = await item.read(); }
        catch (error) { this.cause(`readback:${item.name}`, error); }
      }
      return readbacks;
    });
    return this.teardownResult;
  }
  snapshot() {
    return structuredClone({ failed: this.failed, closed: this.closed, causes: this.causes,
      causeOverflow: this.causeOverflow ?? 0, journal: this.journal, overflow: this.overflow,
      scheduling: this.scheduling, lateCount: this.lateCount, lastTrigger: this.lastTrigger, boundaries: this.boundaries, pending: this.pending !== null });
  }
}

export async function runOwned(lifetime, acquireAndRun, exportTerminal) {
  let result;
  try { result = await acquireAndRun(lifetime); }
  catch (error) { lifetime.fail('run', error); }
  const readbacks = await lifetime.teardown();
  const terminal = { result, readbacks, lifetime: lifetime.snapshot(), acceptance: 'UNVERIFIED' };
  try { await exportTerminal(terminal); }
  catch (error) { lifetime.cause('export', error); }
  return { ...terminal, lifetime: lifetime.snapshot(), exportState: lifetime.failed ? 'FAILED_UNKNOWN' : 'ACKNOWLEDGED' };
}
