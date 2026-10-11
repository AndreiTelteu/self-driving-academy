import type { CaptureLifetime } from './lifetime.mjs';

/** JS state only: never proof of physical HWND/PID foreground. */
export function ownBrowserJournal(life: CaptureLifetime, canvas: HTMLCanvasElement) {
  const record = (kind: string) =>
    life.record(kind, {
      focused: document.hasFocus(),
      hidden: document.hidden,
      connected: canvas.isConnected,
      visibility: document.visibilityState,
    });
  const bindings: [EventTarget, string][] = [
    [window, 'focus'],
    [window, 'blur'],
    [document, 'visibilitychange'],
    [document, 'freeze'],
    [document, 'resume'],
    [window, 'pagehide'],
    [canvas, 'webglcontextlost'],
    [canvas, 'webglcontextrestored'],
  ];
  for (const [target, kind] of bindings) {
    const handler = () => {
      record(kind);
      if (
        ['blur', 'freeze', 'pagehide', 'webglcontextlost'].includes(kind) ||
        document.hidden ||
        !document.hasFocus()
      )
        life.fail(kind, new Error('Capture continuity lost'));
    };
    target.addEventListener(kind, handler);
    life.own(`listener:${kind}`, () => target.removeEventListener(kind, handler));
  }
  record('journal-start');
  const timer = window.setInterval(() => {
    record('focus-poll');
    if (!canvas.isConnected || document.hidden || !document.hasFocus())
      life.fail('focus-poll', new Error('Surface/foreground invariant lost'));
  }, 1000);
  life.own('focus-poll', () => window.clearInterval(timer));
}

/** Real GPUDevice.lost promise, injected so pure drafts need no GPU. Promise cannot be detached. */
export function ownDeviceLoss(
  life: CaptureLifetime,
  lost: Promise<{ reason: string; message: string }>,
) {
  let active = true;
  life.own('device-loss-fence', () => {
    active = false;
  });
  lost.then(
    (info) => {
      if (!active) return; // expected device.destroy() after teardown is not a capture loss
      life.record('webgpu-device-lost', {
        reason: info.reason.slice(0, 128),
        message: info.message.slice(0, 1024),
      });
      life.fail('webgpu-device-lost', new Error('Real GPUDevice.lost resolved during capture'));
    },
    (error) => {
      if (active) life.fail('webgpu-device-lost-read', error);
    },
  );
}
