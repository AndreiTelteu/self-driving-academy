import { check, digest } from './proof';
import { readAcknowledgment } from '../vehicle-selection-ack/response';
import type { SteadyArm } from './protocol';

export const STEADY_RECORD_LIMITS = Object.freeze({
  worlds: 20,
  partsPerWorld: 64,
  partBytes: 512 * 1024,
  bytesPerCapture: 112 * 1024 * 1024,
});
let active: {
  captureId: string;
  requestedBackend: string;
  world: number;
  bytes: number;
  inFlight: boolean;
} | null = null;
export function startWorldTransport(captureId: string, requestedBackend: string) {
  check(active === null, 'Capture transport already active');
  active = { captureId, requestedBackend, world: 0, bytes: 0, inFlight: false };
}
export function finishWorldTransport() {
  active = null;
}
async function acknowledged(path: string, value: unknown) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  return readAcknowledgment(response, path);
}
export async function beginWorld(metadata: SteadyArm) {
  check(
    active !== null && !active.inFlight && active.world < STEADY_RECORD_LIMITS.worlds,
    'World begin state/cap',
  );
  await acknowledged('/world-begin', {
    captureId: active.captureId,
    requestedBackend: active.requestedBackend,
    sequence: active.world,
    metadata,
    createdAt: new Date().toISOString(),
  });
  active.inFlight = true;
}
/** Export after each world, outside measured frames. Failed partial prefixes remain actual and bounded. */
export async function retainWorld(value: unknown, disposition: 'PASS' | 'FAILED') {
  check(
    active !== null && active.inFlight && active.world < STEADY_RECORD_LIMITS.worlds,
    'Capture world capacity/state',
  );
  const sequence = active.world++,
    bytes = new TextEncoder().encode(JSON.stringify(value));
  active.bytes += bytes.length;
  check(active.bytes <= STEADY_RECORD_LIMITS.bytesPerCapture, 'Capture evidence byte cap');
  const parts = Math.ceil(bytes.length / STEADY_RECORD_LIMITS.partBytes);
  check(parts > 0 && parts <= STEADY_RECORD_LIMITS.partsPerWorld, 'World evidence part cap');
  const worldSha256 = await digest(new TextDecoder().decode(bytes));
  await acknowledged('/world-start', {
    ...active,
    sequence,
    parts,
    worldBytes: bytes.length,
    worldSha256,
  });
  // The wire is UTF-8 JSON carried as base64; splitting bytes cannot corrupt surrogate pairs.
  for (let part = 0; part < parts; part++) {
    const chunk = bytes.subarray(
      part * STEADY_RECORD_LIMITS.partBytes,
      (part + 1) * STEADY_RECORD_LIMITS.partBytes,
    );
    let binary = '';
    for (let offset = 0; offset < chunk.length; offset += 8192)
      binary += String.fromCharCode(...chunk.subarray(offset, offset + 8192));
    const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', chunk))]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('');
    const ack = await acknowledged('/world-part', {
      captureId: active.captureId,
      requestedBackend: active.requestedBackend,
      sequence,
      part,
      bytes: chunk.length,
      sha256,
      base64: btoa(binary),
    });
    check(ack.sha256 === sha256, 'Part acknowledgment SHA mismatch');
  }
  const ack = await acknowledged('/world-terminal', {
    captureId: active.captureId,
    requestedBackend: active.requestedBackend,
    sequence,
    disposition,
    worldSha256,
  });
  check(ack.sha256 === worldSha256, 'World terminal acknowledgment SHA mismatch');
  active.inFlight = false;
}
