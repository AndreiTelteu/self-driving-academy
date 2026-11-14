/**
 * PBI 193 — DOM minim pentru proba de focus.
 *
 * Refolosește exact contractul pe care îl citește adaptorul 066 (`bindKeyboardDriveInput`):
 * `ownerDocument`, `defaultView.HTMLElement`, `activeElement`, `hasFocus()`, `hidden` și
 * `querySelector` pentru dialoguri modale. Nu este un browser și nu are ceas: evenimentele sunt
 * dispatch-uite explicit, deci proba este deterministă.
 */
class FakeEvents extends EventTarget {
  listeners = 0;
  override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void {
    super.addEventListener(type, callback, options);
    this.listeners += 1;
  }
  override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ): void {
    super.removeEventListener(type, callback, options);
    this.listeners -= 1;
  }
}

/** Element cu două stări de focus folosite de 066: conținut editabil și câmp/dialog strămoș. */
export class FakeElement extends FakeEvents {
  isContentEditable = false;
  blocked = false;
  ownerDocument!: Document;
  closest(): FakeElement | null {
    return this.blocked ? this : null;
  }
}

export interface FocusFixture {
  readonly doc: FakeEvents & {
    defaultView: unknown;
    hidden: boolean;
    activeElement: unknown;
    hasFocus: () => boolean;
    querySelector: () => unknown;
  };
  readonly win: FakeEvents & { HTMLElement: typeof FakeElement };
  readonly surface: FakeElement;
  /** `true` simulează focusul într-un câmp de text sau dialog. */
  setBlocked(value: boolean): void;
  setFocus(value: boolean): void;
  setModal(value: boolean): void;
  setHidden(value: boolean): void;
  /** Numărul de listeneri încă înregistrați pe document și fereastră. */
  listeners(): number;
  key(type: 'keydown' | 'keyup', code: string, values?: Record<string, unknown>): Event;
}

export function createFocusFixture(): FocusFixture {
  const doc = new FakeEvents() as FocusFixture['doc'];
  const win = new FakeEvents() as FocusFixture['win'];
  win.HTMLElement = FakeElement;
  doc.defaultView = win;
  doc.hidden = false;
  let focus = true;
  let modal = false;
  doc.hasFocus = () => focus;
  doc.querySelector = () => (modal ? { tagName: 'DIALOG' } : null);
  const surface = new FakeElement();
  surface.ownerDocument = doc as unknown as Document;
  doc.activeElement = surface;
  return {
    doc,
    win,
    surface,
    setBlocked: (value) => {
      surface.blocked = value;
    },
    setFocus: (value) => {
      focus = value;
    },
    setModal: (value) => {
      modal = value;
    },
    setHidden: (value) => {
      doc.hidden = value;
    },
    listeners: () => doc.listeners + win.listeners,
    key: (type, code, values = {}) => {
      const event = new Event(type, { cancelable: true });
      Object.assign(event, {
        code,
        repeat: false,
        isComposing: false,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        shiftKey: false,
        ...values,
      });
      doc.dispatchEvent(event);
      return event;
    },
  };
}
