import { functionalCheck as check } from './core-proof';
/** Driver transcript cross-binds actual observed DOM events; it never upgrades trust. */
export function validateDriverLedger(value: unknown) {
  const row = value as {
    generation: number;
    setupWrites: Record<string, unknown>[];
    keys: Record<string, unknown>[];
    hud: { pointer: Record<string, unknown> };
    staleHud: { pointer: Record<string, unknown> };
  };
  const ledgers = row.setupWrites.filter(write => write.stage === 'SYNTHETIC_DRIVER_LEDGER');
  check(ledgers.length === 1, 'Exactly one actual synthetic driver transcript');
  const ledger = ledgers[0]!;
  check(Object.keys(ledger).sort().join(',') === 'events,heldAtEnd,origin,physicalAcceptance,released,stage', 'Exact driver fields');
  check(ledger.origin === 'SYNTHETIC_DOM_DRIVER' && ledger.physicalAcceptance === false && ledger.released === true && Array.isArray(ledger.heldAtEnd) && ledger.heldAtEnd.length === 0, 'Diagnostic origin and genuine completed key release');
  check(Array.isArray(ledger.events) && ledger.events.length <= 64, 'Bounded lossless driver event count');
  const events = ledger.events as Record<string, unknown>[];
  for (const [ordinal, event] of events.entries()) {
    check(Object.keys(event).sort().join(',') === 'code,generation,isTrusted,ordinal,readMs,repeat,stage,tick,type', 'Exact event fields');
    check(event.ordinal === ordinal && event.isTrusted === false && event.generation === (event.stage === 'AUTO_REJECT' ? null : row.generation) && Number.isSafeInteger(event.tick) && (event.tick as number) >= 0 && (event.tick as number) <= 394 && Number.isFinite(event.readMs) && (event.readMs as number) >= 0 && typeof event.repeat === 'boolean', 'Actual untrusted finite event identity');
    check(['keydown', 'keyup', 'click'].includes(event.type as string) && ['KeyR', 'KeyT', 'KeyW', 'KeyD', 'HUD'].includes(event.code as string) && typeof event.stage === 'string' && event.stage.length <= 64, 'Bounded event shape');
    if (ordinal) check((event.readMs as number) >= (events[ordinal - 1]!.readMs as number), 'Monotonic driver event observation');
  }
  const keyEvents = events.filter(event => event.type !== 'click');
  check(keyEvents.length === row.keys.length, 'No missing or foreign observed keys');
  for (const [i, observed] of row.keys.entries()) {
    const emitted = keyEvents[i]!;
    for (const key of ['type', 'code', 'repeat', 'isTrusted', 'stage', 'tick', 'generation']) check(observed[key] === emitted[key], 'Driver-to-real-adapter event ' + key);
    check(Number.isFinite(observed.readMs) && (observed.readMs as number) >= (emitted.readMs as number), 'Capture follows actual dispatch');
  }
  const clicks = events.filter(event => event.type === 'click');
  check(clicks.length === 2, 'Actual current and stale HUD events');
  for (const [i, pointer] of [row.hud.pointer, row.staleHud.pointer].entries()) {
    const click = clicks[i]!;
    check(pointer.isTrusted === false && Number.isFinite(pointer.readMs) && (pointer.readMs as number) >= (click.readMs as number), 'Untrusted HUD observed after actual dispatch');
  }
}
