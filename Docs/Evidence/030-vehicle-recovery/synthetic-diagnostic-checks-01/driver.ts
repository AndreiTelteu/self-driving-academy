export interface DriverPorts {
  key(type: 'keydown' | 'keyup', code: string, repeat: boolean): Event;
  pointer(): Event;
  dispatch(target: EventTarget, event: Event): void;
  current(): { stage: string; tick: number; generation: number | null };
  now(): number;
}
/** Synthetic events stay isTrusted=false. Private event ownership cannot brand foreign input. */
export function createSyntheticDriver(canvas: EventTarget, ports: DriverPorts) {
  const owned = new WeakSet<Event>(), held = new Set<string>();
  const events: { ordinal: number; type: string; code: string; repeat: boolean; isTrusted: false; stage: string; tick: number; generation: number | null; readMs: number }[] = [];
  let released = false;
  const send = (target: EventTarget, event: Event, code: string, repeat: boolean) => {
    if (events.length >= 64) throw new Error('Synthetic diagnostic driver64event cap');
    if (event.isTrusted !== false) throw new Error('Diagnostic event must remain genuinely untrusted');
    const at = ports.current();
    owned.add(event);
    events.push({ ordinal: events.length, type: event.type, code, repeat, isTrusted: false, ...at, readMs: ports.now() });
    ports.dispatch(target, event);
  };
  const key = (type: 'keydown' | 'keyup', code: string, repeat = false) => {
    if (released) throw new Error('Disposed synthetic driver');
    if (type === 'keydown') held.add(code);
    send(canvas, ports.key(type, code, repeat), code, repeat);
    if (type === 'keyup') held.delete(code);
  };
  return {
    owns: (event: Event) => owned.has(event) && event.isTrusted === false,
    down: (code: string, repeat = false) => key('keydown', code, repeat),
    up: (code: string) => key('keyup', code),
    tap: (code: string) => { key('keydown', code); key('keyup', code); },
    click: (button: HTMLButtonElement) => { button.focus(); send(button, ports.pointer(), 'HUD', false); },
    release() {
      if (released) return;
      const errors: unknown[] = [];
      for (const code of [...held]) try { key('keyup', code); } catch (error) { errors.push(error); }
      released = true;
      if (errors.length) throw new AggregateError(errors, 'Independent synthetic held-key release causes');
    },
    snapshot: () => ({ origin: 'SYNTHETIC_DOM_DRIVER', physicalAcceptance: false, events: events.map(event => ({ ...event })), heldAtEnd: [...held], released }),
  };
}
