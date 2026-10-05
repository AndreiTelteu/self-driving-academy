/** Finite ingress cap: bounded calibration curves dominate the report, not frame buffers. */
export const EVIDENCE_BODY_LIMIT_BYTES = 4 * 1024 * 1024;
export class EvidenceTransportError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export async function readEvidenceJson(request, limitBytes = EVIDENCE_BODY_LIMIT_BYTES) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length;
    if (bytes > limitBytes) {
      request.resume();
      throw new EvidenceTransportError(413, `Evidence body exceeds ${limitBytes} bytes`);
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new EvidenceTransportError(400, 'Malformed evidence JSON');
  }
}
export async function writeImmutableEvidence(path, report) {
  try {
    await writeFile(path, JSON.stringify(report, null, 2), { flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') throw new EvidenceTransportError(409, 'Immutable report exists');
    throw error;
  }
}
import { writeFile } from 'node:fs/promises';
