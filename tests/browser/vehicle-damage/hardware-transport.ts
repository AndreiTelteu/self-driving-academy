export const IMMUTABLE_PART_MAXIMUM_BYTES = 128 * 1024;
export class PartCapacityError extends Error {
  readonly status = 413;
}
export function validateLoopbackPost(origin: unknown, contentType: unknown, port: number) {
  if (origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`)
    throw new Error('Loopback same-origin POST only');
  if (contentType !== 'application/json') throw new Error('JSON POST content type');
}
export async function readBoundedJson(chunks: AsyncIterable<Uint8Array>) {
  const kept: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of chunks) {
    total += chunk.byteLength;
    if (total > IMMUTABLE_PART_MAXIMUM_BYTES)
      throw new PartCapacityError('128KiB immutable payload capacity');
    kept.push(chunk);
  }
  return JSON.parse(Buffer.concat(kept).toString('utf8')) as unknown;
}
