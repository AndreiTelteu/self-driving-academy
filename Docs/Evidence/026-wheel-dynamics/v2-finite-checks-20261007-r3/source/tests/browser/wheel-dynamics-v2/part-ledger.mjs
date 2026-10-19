import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LOGICAL_BYTES, PART_BYTES, MAX_PARTS } from './parts.mjs';
import { EvidenceTransportError } from './transport.mjs';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const valid = (ok, message) => {
  if (!ok) throw new EvidenceTransportError(400, message);
};
/** The count/hash is frozen before the first part. No truncation, no partial commit. */
export function createPartLedger(destination, ledger, verifyFrozen) {
  let queue = Promise.resolve();
  const serial = (operation) => {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  };
  const locate = (dto) => {
    valid(/^(raw-[0-9]|terminal|terminal-error)$/.test(dto.name), 'Invalid logical record');
    valid(/^[a-f0-9-]{36}$/.test(dto.binding?.captureId), 'Invalid capture');
    return resolve(destination, dto.binding.captureId, `parts-${dto.name}`);
  };
  const immutable = async (path, bytes) => {
    try {
      await writeFile(path, bytes, { flag: 'wx' });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const stored = await readFile(path);
    if (!stored.equals(bytes))
      throw new EvidenceTransportError(409, 'Part replay/readback conflict');
    return { bytes: stored.length, sha256: hash(stored) };
  };
  const identity = async (dto) => {
    const start = await ledger.read(dto.binding?.captureId, 'start');
    valid(
      JSON.stringify(dto.binding) === JSON.stringify(start.record.binding),
      'Part binding changed',
    );
    if (dto.name !== 'terminal-error') await verifyFrozen();
  };
  return {
    append: (dto) =>
      serial(async () => {
        await identity(dto);
        const directory = locate(dto);
        if (dto.operation === 'manifest') {
          valid(
            Number.isInteger(dto.bytes) &&
              dto.bytes > 0 &&
              dto.bytes <= LOGICAL_BYTES &&
              dto.count === Math.ceil(dto.bytes / PART_BYTES) &&
              dto.count <= MAX_PARTS &&
              /^[a-f0-9]{64}$/.test(dto.sha256),
            'Invalid part manifest',
          );
          await mkdir(directory, { recursive: true });
          return immutable(resolve(directory, 'manifest.json'), Buffer.from(JSON.stringify(dto)));
        }
        const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
        if (dto.operation === 'part') {
          valid(
            Number.isInteger(dto.index) &&
              dto.index >= 0 &&
              dto.index < manifest.count &&
              typeof dto.base64 === 'string' &&
              /^[A-Za-z0-9+/]*={0,2}$/.test(dto.base64),
            'Invalid part',
          );
          const bytes = Buffer.from(dto.base64, 'base64');
          valid(
            bytes.toString('base64') === dto.base64 &&
              bytes.length === Math.min(PART_BYTES, manifest.bytes - dto.index * PART_BYTES),
            'Part size/encoding mismatch',
          );
          return immutable(resolve(directory, `${dto.index}.bin`), bytes);
        }
        valid(dto.operation === 'commit', 'Unknown part operation');
        const chunks = [];
        for (let i = 0; i < manifest.count; i++)
          chunks.push(await readFile(resolve(directory, `${i}.bin`)));
        const bytes = Buffer.concat(chunks);
        valid(
          bytes.length === manifest.bytes && hash(bytes) === manifest.sha256,
          'Part hash/count mismatch',
        );
        let payload;
        try {
          payload = JSON.parse(bytes.toString('utf8'));
        } catch {
          throw new EvidenceTransportError(400, 'Malformed joined JSON');
        }
        valid(
          JSON.stringify(payload.binding) === JSON.stringify(dto.binding),
          'Joined identity mismatch',
        );
        return ledger.append(payload, dto.name);
      }),
  };
}
