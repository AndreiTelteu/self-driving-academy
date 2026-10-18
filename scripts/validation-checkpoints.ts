import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface PairCheckpoint {
  sessionId: string;
  identity: Record<string, unknown>;
  pair: number;
  payload: unknown;
}

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function sessionDirectory(root: string, sessionId: string): string {
  if (!/^[a-f0-9-]{36}$/.test(sessionId)) throw new Error('Invalid checkpoint session');
  return resolve(root, sessionId);
}

/** A checkpoint is diagnostic evidence until the full scenario-specific verifier passes. */
export async function readPairCheckpoints(root: string, sessionId: string) {
  const directory = sessionDirectory(root, sessionId);
  const records: PairCheckpoint[] = [];
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return records;
    throw error;
  }
  if (
    names.length > 5 ||
    names.some((name) => !/^[1-5]\.json$/.test(name)) ||
    names.some((_, index) => !names.includes(`${index + 1}.json`))
  )
    throw new Error('Checkpoint gap or unexpected file');
  for (let pair = 1; pair <= names.length; pair++) {
    const encoded = await readFile(resolve(directory, `${pair}.json`), 'utf8');
    const stored = JSON.parse(encoded) as { record: PairCheckpoint; sha256: string };
    if (
      stored.sha256 !== digest(stored.record) ||
      stored.record.pair !== pair ||
      stored.record.sessionId !== sessionId
    )
      throw new Error('Checkpoint content changed');
    if (records.length && digest(records[0].identity) !== digest(stored.record.identity))
      throw new Error('Checkpoint identity changed');
    records.push(stored.record);
  }
  return records;
}

/** Exclusive writes preserve accepted pairs. A failed pair must restart both OFF/ON arms. */
export async function savePairCheckpoint(root: string, record: PairCheckpoint) {
  const directory = sessionDirectory(root, record.sessionId);
  if (!Number.isInteger(record.pair) || record.pair < 1 || record.pair > 5)
    throw new Error('Invalid checkpoint pair');
  const records = await readPairCheckpoints(root, record.sessionId);
  if (records.length && digest(records[0].identity) !== digest(record.identity))
    throw new Error('Checkpoint identity changed');
  if (record.pair !== records.length + 1) {
    if (records[record.pair - 1] && digest(records[record.pair - 1]) === digest(record)) return; // identical retry only
    throw new Error('Checkpoint order or content changed');
  }
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, `${record.pair}.json`),
    JSON.stringify({ record, sha256: digest(record) }),
    { flag: 'wx' },
  );
}
