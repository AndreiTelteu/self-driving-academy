import type { BodyIdentity } from '../vehicles';
export interface RecoveryHudProjection {
  readonly identity: BodyIdentity | null;
  readonly mode: 'MANUAL' | 'LEARNING' | null;
  readonly available: boolean;
  readonly enabled: boolean;
  readonly pointId: string | null;
  readonly fault: string | null;
}
/** Host refreshes at10Hz. Visible exact seat token is passed to click, never latest selection. */
export function createRecoveryHud(options: {
  readonly container: HTMLElement;
  readonly read: () => RecoveryHudProjection;
  readonly click: (visibleSeat: BodyIdentity) => boolean;
}) {
  const doc = options.container.ownerDocument;
  if (options.container.childNodes.length)
    throw new Error('Recovery HUD requires its empty owned container');
  const button = doc.createElement('button'),
    status = doc.createElement('span');
  button.type = 'button';
  button.textContent = 'Deblochează mașina';
  status.setAttribute('role', 'status');
  let visible: BodyIdentity | null = null,
    disposed = false;
  const click = () => {
    if (!disposed && visible && !button.disabled) options.click(visible);
  };
  const sync = () => {
    if (disposed) return;
    const view = options.read();
    visible = view.identity;
    button.disabled = !view.enabled || !view.available || view.identity === null;
    status.textContent = view.fault
      ? `Recuperare oprită: ${view.fault}`
      : view.identity
        ? `${view.mode}: ${view.identity.entityId}. ${view.available ? 'Punct valid memorat.' : 'Fără punct valid.'}`
        : 'Nicio mașină controlată.';
  };
  try {
    options.container.append(button, status);
    button.addEventListener('click', click);
    sync();
  } catch (primary) {
    const errors: unknown[] = [primary];
    for (const cleanup of [
      () => button.removeEventListener('click', click),
      () => button.remove(),
      () => status.remove(),
    ])
      try {
        cleanup();
      } catch (error) {
        errors.push(error);
      }
    throw new AggregateError(errors, 'Recovery HUD setup failed');
  }
  return Object.freeze({
    sync,
    getStats: () =>
      Object.freeze({ nodes: disposed ? 0 : 2, listeners: disposed ? 0 : 1, disposed }),
    dispose() {
      if (disposed) return;
      disposed = true;
      visible = null;
      const errors: unknown[] = [];
      for (const cleanup of [
        () => button.removeEventListener('click', click),
        () => button.remove(),
        () => status.remove(),
      ])
        try {
          cleanup();
        } catch (error) {
          errors.push(error);
        }
      if (errors.length) throw new AggregateError(errors, 'Recovery HUD cleanup failed');
    },
  });
}
