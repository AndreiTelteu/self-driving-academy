import { writeFile } from 'node:fs/promises';
export const EVIDENCE_BODY_LIMIT_BYTES = 4 * 1024 * 1024;
export class EvidenceTransportError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export async function readEvidenceJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length;
    if (bytes > EVIDENCE_BODY_LIMIT_BYTES) {
      request.resume();
      throw new EvidenceTransportError(413, '052 evidence exceeds4MiB');
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new EvidenceTransportError(400, 'Malformed052evidence JSON');
  }
}
export async function writeImmutableEvidence(path, report) {
  try {
    await writeFile(path, JSON.stringify(report, null, 2), { flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') throw new EvidenceTransportError(409, 'Immutable052report exists');
    throw error;
  }
}
