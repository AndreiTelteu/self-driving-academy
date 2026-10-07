import type { VehicleCameraController, VehicleCameraMode } from '../vehicle-camera';

export interface VehicleCameraInputOptions {
  readonly canvas: HTMLCanvasElement;
  readonly captureButton: HTMLElement;
  readonly recenterButton: HTMLElement;
  readonly controller: VehicleCameraController;
  readonly toggleCode?: string;
  readonly enabled?: () => boolean;
  readonly onModeChanged?: (mode: VehicleCameraMode) => void;
  readonly onCaptureChanged?: (captured: boolean) => void;
  readonly onCaptureError?: (error: unknown) => void;
}

/** Captures the pointer only from an explicit button gesture. Owns and releases all listeners. */
export function bindVehicleCameraInput(options: VehicleCameraInputOptions): () => void {
  const document = options.canvas.ownerDocument,
    win = document.defaultView;
  if (!win) throw new Error('Camera input requires a live window');
  let disposed = false;
  const enabled = () => !disposed && (options.enabled?.() ?? true);
  const release = () => {
    if (document.pointerLockElement === options.canvas) document.exitPointerLock();
  };
  const capture = () => {
    if (!enabled()) return;
    try {
      const request = options.canvas.requestPointerLock();
      request?.catch((error) => options.onCaptureError?.(error));
    } catch (error: unknown) {
      options.onCaptureError?.(error);
    }
  };
  const recenter = () => {
    if (enabled()) options.controller.recenter();
  };
  const lockChanged = () =>
    options.onCaptureChanged?.(document.pointerLockElement === options.canvas);
  const mouse = (event: MouseEvent) => {
    if (!enabled()) {
      release();
      return;
    }
    if (document.pointerLockElement === options.canvas)
      options.controller.look(event.movementX, event.movementY);
  };
  const keys = (event: KeyboardEvent) => {
    if (event.code === 'Escape') {
      release();
      return;
    }
    const target = event.target;
    if (
      !enabled() ||
      event.repeat ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      (target instanceof win.HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)))
    )
      return;
    if (event.code === (options.toggleCode ?? 'KeyC')) {
      event.preventDefault();
      const mode = options.controller.toggleMode();
      options.onModeChanged?.(mode);
    }
  };
  const blur = () => release();
  const visibility = () => {
    if (document.hidden) release();
  };
  options.captureButton.addEventListener('click', capture);
  options.recenterButton.addEventListener('click', recenter);
  document.addEventListener('keydown', keys);
  document.addEventListener('mousemove', mouse);
  document.addEventListener('pointerlockchange', lockChanged);
  document.addEventListener('visibilitychange', visibility);
  win.addEventListener('blur', blur);
  return () => {
    if (disposed) return;
    disposed = true;
    release();
    options.captureButton.removeEventListener('click', capture);
    options.recenterButton.removeEventListener('click', recenter);
    document.removeEventListener('keydown', keys);
    document.removeEventListener('mousemove', mouse);
    document.removeEventListener('pointerlockchange', lockChanged);
    document.removeEventListener('visibilitychange', visibility);
    win.removeEventListener('blur', blur);
  };
}
