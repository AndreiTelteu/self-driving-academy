import type { SelectVehicleIntent } from './vehicle-picking';
export interface VehiclePickingInputOptions {
  readonly canvas: HTMLCanvasElement;
  readonly pick: (x: number, y: number) => SelectVehicleIntent | null;
  readonly onSelect: (intent: SelectVehicleIntent) => void;
  readonly isModalOpen: () => boolean;
  readonly enabled?: () => boolean;
  readonly maxDragPx?: number;
  /** Opt-in. Default pointer movement never calls pick. */
  readonly onHover?: (intent: SelectVehicleIntent | null) => void;
}
/** Canvas-only input; UI outside canvas cannot propagate into this listener. */
export function bindVehiclePickingInput(options: VehiclePickingInputOptions): () => void {
  const canvas = options.canvas;
  const maxDrag = options.maxDragPx ?? 5;
  if (!Number.isFinite(maxDrag) || maxDrag < 0) throw new Error('Invalid drag threshold');
  let disposed = false;
  let down: { x: number; y: number; id: number; dragged: boolean } | null = null;
  let clickAllowed = false;
  const available = () =>
    !disposed &&
    !options.isModalOpen() &&
    (options.enabled?.() ?? true) &&
    canvas.ownerDocument.pointerLockElement !== canvas;
  const coordinates = (event: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = ((event.clientX - rect.left) * canvas.width) / rect.width;
    const y = ((event.clientY - rect.top) * canvas.height) / rect.height;
    return x >= 0 && y >= 0 && x < canvas.width && y < canvas.height ? { x, y } : null;
  };
  const start = (event: PointerEvent) => {
    clickAllowed = false;
    down =
      available() && event.button === 0 && event.isPrimary
        ? { x: event.clientX, y: event.clientY, id: event.pointerId, dragged: false }
        : null;
  };
  const move = (event: PointerEvent) => {
    if (
      down &&
      event.pointerId === down.id &&
      Math.hypot(event.clientX - down.x, event.clientY - down.y) > maxDrag
    )
      down.dragged = true;
    if (options.onHover && available() && !down && !event.defaultPrevented) {
      const p = coordinates(event);
      options.onHover(p ? options.pick(p.x, p.y) : null);
    }
  };
  const end = (event: PointerEvent) => {
    clickAllowed =
      !!down &&
      event.pointerId === down.id &&
      !down.dragged &&
      Math.hypot(event.clientX - down.x, event.clientY - down.y) <= maxDrag &&
      available();
    down = null;
  };
  const cancel = () => {
    down = null;
    clickAllowed = false;
  };
  // Normal pointerup releases Babylon's capture before the browser emits click.
  const lostCapture = () => {
    if (down) cancel();
  };
  const click = (event: MouseEvent) => {
    const allowed = clickAllowed;
    clickAllowed = false;
    if (options.isModalOpen()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (!allowed || !available() || event.defaultPrevented || event.button !== 0) return;
    const p = coordinates(event);
    const intent = p ? options.pick(p.x, p.y) : null;
    if (intent) options.onSelect(intent);
  };
  canvas.addEventListener('pointerdown', start, true);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', end, true);
  canvas.addEventListener('pointercancel', cancel);
  canvas.addEventListener('lostpointercapture', lostCapture);
  canvas.addEventListener('click', click);
  canvas.ownerDocument.defaultView?.addEventListener('blur', cancel);
  return () => {
    if (disposed) return;
    disposed = true;
    cancel();
    canvas.removeEventListener('pointerdown', start, true);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', end, true);
    canvas.removeEventListener('pointercancel', cancel);
    canvas.removeEventListener('lostpointercapture', lostCapture);
    canvas.removeEventListener('click', click);
    canvas.ownerDocument.defaultView?.removeEventListener('blur', cancel);
  };
}
