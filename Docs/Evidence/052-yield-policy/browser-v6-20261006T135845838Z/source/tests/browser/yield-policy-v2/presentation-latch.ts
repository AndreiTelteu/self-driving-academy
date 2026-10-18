import type { browserLifetime } from './lifetime';
/** Capture-scoped focus latch, acquired before any async start/backend work. */
export function installPresentationLatch(
  windowTarget: EventTarget,
  documentTarget: EventTarget & { readonly hidden: boolean; hasFocus(): boolean },
  lifetime: ReturnType<typeof browserLifetime>,
) {
  let lost = documentTarget.hidden || !documentTarget.hasFocus();
  const lose = () => {
    lost = true;
  };
  const hidden = () => {
    if (documentTarget.hidden) lose();
  };
  windowTarget.addEventListener('blur', lose);
  lifetime.own('blur', () => windowTarget.removeEventListener('blur', lose));
  documentTarget.addEventListener('visibilitychange', hidden);
  lifetime.own('visibility', () => documentTarget.removeEventListener('visibilitychange', hidden));
  return {
    lose,
    get lost() {
      return lost;
    },
  };
}
