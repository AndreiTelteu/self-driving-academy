const check = (value: boolean, message: string) => {
  if (!value) throw new Error(message);
};

export type Binding = {
  captureId: string;
  protocol: string;
  sourceHash: string;
  artifactHash: string;
  [key: string]: unknown;
};
export const ports = (active: () => boolean) => ({
  now: () => performance.now(),
  foreground: () => active() && document.hasFocus() && !document.hidden,
  requestRaf: (callback: (stamp: number) => void) => requestAnimationFrame(callback),
  cancelRaf: (id: number) => cancelAnimationFrame(id),
  setTimer: (callback: () => void, ms: number) => window.setTimeout(callback, ms),
  clearTimer: (id: number) => window.clearTimeout(id),
});
export async function checkedJson(path: string, body?: unknown) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(path, {
      signal: controller.signal,
      ...(body === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
    });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${await response.text()}`);
    return await response.json();
  } finally {
    window.clearTimeout(timer);
  }
}
export async function appendBound(binding: Binding, name: string, dto: object) {
  const payload = { ...dto, binding };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = async (value: Uint8Array) =>
    Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', value as BufferSource)),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('');
  let acknowledgment;
  if (/^(raw-[0-9]|terminal|terminal-error)$/.test(name)) {
    check(bytes.length <= 16 * 1024 * 1024, 'Logical evidence capacity exceeded; no truncation');
    const size = 512 * 1024,
      count = Math.ceil(bytes.length / size);
    const manifest = {
      operation: 'manifest',
      binding,
      name,
      bytes: bytes.length,
      count,
      sha256: await digest(bytes),
    };
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
    const manifestAck = await checkedJson('/capture/parts', manifest);
    check(
      manifestAck.bytes === manifestBytes.length &&
        manifestAck.sha256 === (await digest(manifestBytes)),
      'Immutable part count/hash acknowledgment mismatch',
    );
    for (let index = 0; index < count; index++) {
      const part = bytes.slice(index * size, (index + 1) * size);
      let binary = '';
      for (let offset = 0; offset < part.length; offset += 8192)
        binary += String.fromCharCode(...part.subarray(offset, offset + 8192));
      const ack = await checkedJson('/capture/parts', {
        operation: 'part',
        binding,
        name,
        index,
        base64: btoa(binary),
      });
      check(
        ack.bytes === part.length && ack.sha256 === (await digest(part)),
        'Part acknowledgment mismatch',
      );
    }
    acknowledgment = await checkedJson('/capture/parts', { operation: 'commit', binding, name });
  } else acknowledgment = await checkedJson(`/capture/${name}`, payload);
  const readback = await checkedJson(`/capture/${binding.captureId}/${name}`);
  const returnedDto = { ...readback.record.dto };
  if (name.startsWith('late-') || name === 'terminal-error') delete returnedDto.frozenStatus;
  check(
    acknowledgment.captureId === binding.captureId &&
      acknowledgment.name === name &&
      acknowledgment.sha256 === readback.sha256 &&
      acknowledgment.bytes === readback.bytes &&
      readback.sha256 === (await digest(new TextEncoder().encode(readback.payload))) &&
      readback.bytes === new TextEncoder().encode(readback.payload).length &&
      JSON.stringify(returnedDto) === JSON.stringify(payload),
    'Capture acknowledgment/readback mismatch',
  );
  return acknowledgment;
}
