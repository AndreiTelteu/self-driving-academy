export interface JobIdentity {
  readonly jobId: string;
  readonly segmentId: string;
  readonly baseVersionId: string;
  readonly profileId: string;
  readonly learningEpoch: number;
  readonly sessionId: string;
  readonly worldEpoch: number;
}
export type Priority = 'interactive' | 'protected' | 'optional';
export interface Packet extends JobIdentity {
  readonly type: 'start' | 'progress' | 'result' | 'cancel' | 'cancelled' | 'error';
  readonly sequence: number;
  readonly payloadBytes: number;
  readonly ownership: 'copy' | 'transfer';
  readonly priority: Priority;
  readonly buffer: ArrayBuffer;
  readonly progress?: number;
  readonly error?: string;
}
export const limits = Object.freeze({
  jobs: 8,
  bytes: 8 * 1024 * 1024,
  ageMs: 30_000,
  history: 64,
  progressMs: 200,
  sliceMs: 10,
});
const identityKeys = [
  'jobId',
  'segmentId',
  'baseVersionId',
  'profileId',
  'learningEpoch',
  'sessionId',
  'worldEpoch',
] as const;
export function sameIdentity(a: JobIdentity, b: JobIdentity): boolean {
  return identityKeys.every((key) => a[key] === b[key]);
}
export function parsePacket(value: unknown): Packet {
  if (!value || typeof value !== 'object') throw new Error('Invalid packet');
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    throw new Error('Invalid prototype');
  if (
    Reflect.ownKeys(value).some(
      (key) =>
        typeof key !== 'string' ||
        !('value' in Object.getOwnPropertyDescriptor(value, key)!) ||
        !Object.getOwnPropertyDescriptor(value, key)!.enumerable,
    )
  )
    throw new Error('Invalid data property');
  const p = value as Record<string, unknown>;
  if (
    typeof p.jobId !== 'string' ||
    !/^[1-9][0-9]*$/.test(p.jobId) ||
    !Number.isSafeInteger(Number(p.jobId))
  )
    throw new Error('Invalid monotonic jobId');
  const allowed = [
    ...identityKeys,
    'type',
    'sequence',
    'payloadBytes',
    'ownership',
    'priority',
    'buffer',
    'progress',
    'error',
  ];
  if (Reflect.ownKeys(p).some((key) => !allowed.includes(key as (typeof allowed)[number])))
    throw new Error('Unknown field');
  for (const key of ['jobId', 'segmentId', 'baseVersionId', 'profileId', 'sessionId']) {
    if (typeof p[key] !== 'string' || !(p[key] as string).length || (p[key] as string).length > 128)
      throw new Error('Invalid identity');
  }
  for (const key of ['learningEpoch', 'worldEpoch', 'sequence', 'payloadBytes']) {
    if (!Number.isSafeInteger(p[key]) || (p[key] as number) < 0) throw new Error('Invalid integer');
  }
  if (
    !['start', 'progress', 'result', 'cancel', 'cancelled', 'error'].includes(p.type as string) ||
    !['interactive', 'protected', 'optional'].includes(p.priority as string) ||
    !['copy', 'transfer'].includes(p.ownership as string)
  )
    throw new Error('Invalid discriminant');
  if (
    !(p.buffer instanceof ArrayBuffer) ||
    p.buffer.byteLength !== p.payloadBytes ||
    p.buffer.byteLength > limits.bytes ||
    (p.buffer as ArrayBuffer & { detached?: boolean; resizable?: boolean }).detached ||
    (p.buffer as ArrayBuffer & { resizable?: boolean }).resizable
  )
    throw new Error('Invalid bytes');
  if (
    p.type === 'progress'
      ? typeof p.progress !== 'number' ||
        !Number.isFinite(p.progress) ||
        p.progress < 0 ||
        p.progress > 1
      : p.progress !== undefined
  )
    throw new Error('Invalid progress');
  if (
    p.type === 'error'
      ? typeof p.error !== 'string' || !p.error.length || p.error.length > 256
      : p.error !== undefined
  )
    throw new Error('Invalid error');
  if (
    ['cancel', 'cancelled', 'progress', 'error'].includes(p.type as string) &&
    p.payloadBytes !== 0
  )
    throw new Error('Control payload must be empty');
  if (p.type === 'start' && p.sequence !== 0) throw new Error('Start sequence must be zero');
  return Object.freeze({ ...p }) as unknown as Packet;
}
export interface Transport {
  send(packet: Packet, transfer: readonly ArrayBuffer[]): void;
  listen(message: (value: unknown) => void, error: (reason: string) => void): () => void;
}
export function sendPacket(port: Transport, packet: Packet): void {
  const p = parsePacket(packet);
  port.send(p, p.ownership === 'transfer' && p.payloadBytes > 0 ? [p.buffer] : []);
}
export function control(
  job: Packet,
  type: 'cancel' | 'cancelled' | 'progress' | 'error',
  sequence: number,
  detail?: number | string,
): Packet {
  const { progress: _progress, error: _error, ...base } = job;
  return parsePacket({
    ...base,
    type,
    sequence,
    payloadBytes: 0,
    buffer: new ArrayBuffer(0),
    ownership: 'copy',
    ...(type === 'progress' ? { progress: detail } : {}),
    ...(type === 'error' ? { error: detail } : {}),
  });
}
