import { getParameterDefinition } from '../profiles';
import type { ParameterKey } from '../profiles';
import type { TaskFactory } from '../workers';
import type { ConfidenceCandidate } from './evidence-confidence';
import type { ParameterEvidenceReadModel } from './parameter-evidence';
import { blendProfileValue } from './profile-blend';
import type { ProfileBlendEpisode } from './profile-blend';

/** Wire contract between the queue (main thread) and the learning estimator (worker). */
export const LEARNING_ESTIMATE_VERSION = '103-learning-estimate-v1' as const;

/** Bounds that keep one estimator step inside the provisional 10 ms slice proposal. */
export const learningEstimateLimits = Object.freeze({
  maxEpisodes: 4096,
  maxRequestBytes: 1024 * 1024,
});

export interface LearningEstimateRequest {
  readonly version: typeof LEARNING_ESTIMATE_VERSION;
  readonly key: ParameterKey;
  readonly baseVersionId: string;
  readonly segmentId: string;
  readonly learningEpoch: number;
  /**
   * Value of `key` at the epoch base version. The 101 learning weight does not depend on the
   * current value, so `estimate`/`learningWeight` remain valid when the caller recomposes this
   * proposal on top of a newer base.
   */
  readonly baseValue: number;
  readonly evidence: ParameterEvidenceReadModel;
  readonly episodes: readonly ProfileBlendEpisode[];
  readonly candidate: ConfidenceCandidate;
}

/** The worker proposes parameters, never a profile or a delta; composition stays serial. */
export interface LearningEstimateResult {
  readonly version: typeof LEARNING_ESTIMATE_VERSION;
  readonly key: ParameterKey;
  readonly baseVersionId: string;
  readonly segmentId: string;
  readonly learningEpoch: number;
  readonly estimate: number | null;
  readonly learningWeight: number;
  readonly resolution: string;
  readonly changed: boolean;
  readonly min: number;
  readonly max: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const evidenceStatuses = ['NO_EVIDENCE', 'INSUFFICIENT', 'READY', 'EXCLUDED'] as const;

function fail(path: string, reason: string): never {
  throw new Error(`Invalid learning estimate request: ${path} ${reason}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object');
  return value as Record<string, unknown>;
}

function textValue(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128)
    fail(path, 'must be a non-empty string of at most 128 characters');
  return value;
}

function integer(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    fail(path, 'must be a non-negative integer');
  return value as number;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'must be a finite number');
  return value;
}

/**
 * Structural check of the request the worker received. It deliberately rejects unknown versions
 * and oversized episode lists instead of coercing them, so a stale producer cannot smuggle a
 * partially valid estimation into the learning loop.
 */
export function parseLearningEstimateRequest(value: unknown): LearningEstimateRequest {
  const data = record(value, 'request');
  if (data.version !== LEARNING_ESTIMATE_VERSION) fail('version', 'is not supported');
  const key = textValue(data.key, 'key') as ParameterKey;
  getParameterDefinition(key);
  const baseVersionId = textValue(data.baseVersionId, 'baseVersionId');
  const segmentId = textValue(data.segmentId, 'segmentId');
  const learningEpoch = integer(data.learningEpoch, 'learningEpoch');
  const baseValue = finite(data.baseValue, 'baseValue');
  if (!Array.isArray(data.episodes)) fail('episodes', 'must be an array');
  if (data.episodes.length > learningEstimateLimits.maxEpisodes)
    fail('episodes', `must contain at most ${learningEstimateLimits.maxEpisodes} entries`);

  const evidence = record(data.evidence, 'evidence');
  if (evidence.key !== key) fail('evidence.key', 'must match the requested key');
  if (!evidenceStatuses.includes(evidence.status as (typeof evidenceStatuses)[number]))
    fail('evidence.status', 'is not a known 093 status');
  if (!Number.isSafeInteger(evidence.distinctEpisodes) || (evidence.distinctEpisodes as number) < 0)
    fail('evidence.distinctEpisodes', 'must be a non-negative integer');

  const candidate = record(data.candidate, 'candidate');
  if (candidate.key !== key) fail('candidate.key', 'must match the requested key');
  if (candidate.value !== null && candidate.value !== undefined)
    finite(candidate.value, 'candidate.value');

  return Object.freeze({
    version: LEARNING_ESTIMATE_VERSION,
    key,
    baseVersionId,
    segmentId,
    learningEpoch,
    baseValue,
    evidence: evidence as unknown as ParameterEvidenceReadModel,
    episodes: data.episodes as unknown as readonly ProfileBlendEpisode[],
    candidate: candidate as unknown as ConfidenceCandidate,
  });
}

export function encodeLearningEstimateRequest(request: LearningEstimateRequest): ArrayBuffer {
  const parsed = parseLearningEstimateRequest(request);
  const bytes = encoder.encode(JSON.stringify(parsed));
  if (bytes.byteLength > learningEstimateLimits.maxRequestBytes)
    fail('request', `must be at most ${learningEstimateLimits.maxRequestBytes} bytes`);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function decodeLearningEstimateRequest(buffer: ArrayBuffer): LearningEstimateRequest {
  if (
    !(buffer instanceof ArrayBuffer) ||
    buffer.byteLength > learningEstimateLimits.maxRequestBytes
  )
    fail('request', 'is not a bounded ArrayBuffer');
  let value: unknown;
  try {
    value = JSON.parse(decoder.decode(buffer));
  } catch {
    fail('request', 'is not valid UTF-8 JSON');
  }
  return parseLearningEstimateRequest(value);
}

export function encodeLearningEstimateResult(result: LearningEstimateResult): ArrayBuffer {
  const bytes = encoder.encode(JSON.stringify(result));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function decodeLearningEstimateResult(buffer: ArrayBuffer): LearningEstimateResult {
  if (!(buffer instanceof ArrayBuffer)) fail('result', 'is not an ArrayBuffer');
  let value: unknown;
  try {
    value = JSON.parse(decoder.decode(buffer));
  } catch {
    fail('result', 'is not valid UTF-8 JSON');
  }
  const data = record(value, 'result');
  if (data.version !== LEARNING_ESTIMATE_VERSION) fail('result.version', 'is not supported');
  const key = textValue(data.key, 'result.key') as ParameterKey;
  const baseVersionId = textValue(data.baseVersionId, 'result.baseVersionId');
  const segmentId = textValue(data.segmentId, 'result.segmentId');
  const learningEpoch = integer(data.learningEpoch, 'result.learningEpoch');
  const estimate = data.estimate === null ? null : finite(data.estimate, 'result.estimate');
  const learningWeight = finite(data.learningWeight, 'result.learningWeight');
  if (learningWeight < 0 || learningWeight > 1)
    fail('result.learningWeight', 'must be within [0,1]');
  const min = finite(data.min, 'result.min');
  const max = finite(data.max, 'result.max');
  if (!(min <= max)) fail('result.min', 'must not exceed max');
  if (typeof data.resolution !== 'string' || data.resolution.length === 0)
    fail('result.resolution', 'must be a non-empty string');
  if (typeof data.changed !== 'boolean') fail('result.changed', 'must be a boolean');
  return Object.freeze({
    version: LEARNING_ESTIMATE_VERSION,
    key,
    baseVersionId,
    segmentId,
    learningEpoch,
    estimate,
    learningWeight,
    resolution: data.resolution,
    changed: data.changed,
    min,
    max,
  });
}

/**
 * Produces `estimate` and `learningWeight` for one parameter with the real 101 blend, then returns
 * them as a proposal. It runs one bounded synchronous slice: the request caps episodes at 4096 and
 * bytes at 1 MiB, so the synchronously measured step stays small. It never publishes a profile,
 * marks a value LEARNED or mutates the 092 registry.
 */
export function createLearningEstimatorTask(): TaskFactory {
  return (job) => ({
    step() {
      const request = decodeLearningEstimateRequest(job.buffer);
      const blended = blendProfileValue({
        key: request.key,
        oldValue: request.baseValue,
        evidence: request.evidence,
        episodes: request.episodes,
        candidate: request.candidate,
      });
      const definition = getParameterDefinition(request.key);
      const result = encodeLearningEstimateResult({
        version: LEARNING_ESTIMATE_VERSION,
        key: request.key,
        baseVersionId: request.baseVersionId,
        segmentId: request.segmentId,
        learningEpoch: request.learningEpoch,
        estimate: blended.estimate,
        learningWeight: blended.learningWeight,
        resolution: blended.resolution,
        changed: blended.changed,
        min: definition.min,
        max: definition.max,
      });
      return { done: true, progress: 1, result };
    },
    dispose() {},
  });
}
