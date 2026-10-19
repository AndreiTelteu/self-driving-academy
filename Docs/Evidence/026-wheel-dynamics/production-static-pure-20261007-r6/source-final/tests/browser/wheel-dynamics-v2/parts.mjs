/** Lossless transport proposal implemented as SOURCE ONLY. Each HTTP body stays <=4MiB. */
export const PART_BYTES = 512 * 1024;
export const LOGICAL_BYTES = 16 * 1024 * 1024;
export const MAX_PARTS = Math.ceil(LOGICAL_BYTES / PART_BYTES);
export function splitPayload(bytes) {
  if (bytes.length > LOGICAL_BYTES)
    throw new Error('Logical evidence capacity exceeded; preserve local bytes, fail unknown');
  return Array.from({ length: Math.ceil(bytes.length / PART_BYTES) }, (_, index) =>
    bytes.slice(index * PART_BYTES, (index + 1) * PART_BYTES),
  );
}
