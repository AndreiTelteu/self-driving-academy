/// <reference types="node" />
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { fullBackendSequence } from './hardware-protocol';
import { validatePartIdentity, metricPartId, verifyMetricPart } from './hardware-parts';
import type { HardwarePartIdentity, MetricPart } from './hardware-parts';
import type { FrozenHardwareBuild, HardwareRunManifest } from './hardware-run-manifest';
import { verifyCompleteRun, compareBackend } from './hardware-verifier';
import type { HeapPart, TracePart, VerifiedRun } from './hardware-verifier';
function check(value: boolean, reason: string): asserts value {
  if (!value) throw new Error(reason);
}
export interface StoredHardwareBuild extends FrozenHardwareBuild {
  readonly inputs: readonly { path: string; bytes: number; sha256: string }[];
  readonly artifacts: readonly { path: string; bytes: number; sha256: string }[];
  readonly archiveRoot: string;
  readonly artifactRoot: string;
  readonly nativePath: string;
  readonly nativeArchivePath: string;
  readonly nativeBytes: number;
}
/** Only loopback server calls this store. Every operation is serialized; final verifier also reads immutable files independently. */
export function createHardwareStore(build: StoredHardwareBuild, outputRoot: string) {
  let active: {
    captureId: string;
    backend: 'WEBGPU' | 'WEBGL2';
    completed: number;
    parts: number;
    failed: boolean;
  } | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const locked = <T>(operation: () => Promise<T>) => {
    const result = queue.then(operation);
    queue = result.catch(() => undefined);
    return result;
  };
  const directory = (captureId: string) => {
    check(/^[0-9TZ_-]{1,64}$/.test(captureId), 'Capture path');
    const path = resolve(outputRoot, captureId);
    check(path.startsWith(resolve(outputRoot) + sep), 'Capture contained');
    return path;
  };
  const immutable = async (captureId: string, name: string, value: unknown) => {
    check(/^[a-zA-Z0-9_-]+\.json$/.test(name), 'Immutable filename');
    const bytes = Buffer.from(JSON.stringify(value));
    check(bytes.byteLength <= 128 * 1024, 'Stored payload cap');
    await writeFile(resolve(directory(captureId), name), bytes, { flag: 'wx' });
  };
  const guard = async () => {
    const source = createHash('sha256'),
      artifactCombined = createHash('sha256');
    for (const input of build.inputs) {
      const current = await readFile(input.path),
        archived = await readFile(resolve(build.archiveRoot, input.path));
      check(
        current.length === input.bytes &&
          archived.length === input.bytes &&
          createHash('sha256').update(current).digest('hex') === input.sha256 &&
          createHash('sha256').update(archived).digest('hex') === input.sha256,
        `Current/archive source drift:${input.path}`,
      );
      source.update(input.path).update(archived);
    }
    for (const artifact of build.artifacts) {
      const bytes = await readFile(resolve(build.artifactRoot, artifact.path));
      check(
        bytes.length === artifact.bytes &&
          createHash('sha256').update(bytes).digest('hex') === artifact.sha256,
        `Archive artifact drift:${artifact.path}`,
      );
      artifactCombined.update(artifact.path).update(bytes);
    }
    check(
      source.digest('hex') === build.sourceHash &&
        artifactCombined.digest('hex') === build.artifactHash,
      'Combined source/artifact identity',
    );
    const native = await readFile(build.nativePath);
    check(
      native.length === build.nativeBytes &&
        createHash('sha256').update(native).digest('hex') === build.nativeHash,
      'Current native dependency drift',
    );
    const archivedNative = await readFile(build.nativeArchivePath);
    check(
      archivedNative.length === build.nativeBytes &&
        createHash('sha256').update(archivedNative).digest('hex') === build.nativeHash,
      'Archived native dependency drift',
    );
  };
  const expected = (): HardwarePartIdentity => {
    check(
      active !== null && !active.failed && active.completed < 20,
      'Active normal full sequence',
    );
    const spec = fullBackendSequence()[active.completed];
    return {
      captureId: active.captureId,
      backend: active.backend,
      pair: spec.pair,
      observer: spec.observer,
      arm: spec.arm,
      runOrdinal: spec.runOrdinal,
      sourceHash: build.sourceHash,
      artifactHash: build.artifactHash,
      nativeHash: build.nativeHash,
    };
  };
  return {
    verifySources: guard,
    start: (preference: unknown) =>
      locked(async () => {
        check(active === null, 'One capture per server; no automatic retry/resume');
        check(preference === 'AUTO' || preference === 'WEBGL2', 'Backend preference');
        await guard();
        const captureId = new Date().toISOString().replace(/[^0-9TZ]/g, '');
        active = {
          captureId,
          backend: preference === 'AUTO' ? 'WEBGPU' : 'WEBGL2',
          completed: 0,
          parts: 0,
          failed: false,
        };
        await mkdir(directory(captureId), { recursive: false });
        await immutable(captureId, 'start.json', {
          version: '029-capture-start-v1',
          ...active,
          build,
          startedAt: new Date().toISOString(),
          sequence: fullBackendSequence(),
        });
        return { captureId, backend: active.backend };
      }),
    part: (body: { partId: string; part: MetricPart | HeapPart | TracePart }) =>
      locked(async () => {
        const identity = expected();
        validatePartIdentity(body.part.identity);
        for (const key of Object.keys(identity) as (keyof HardwarePartIdentity)[])
          check(body.part.identity[key] === identity[key], `Incoming expected sequence:${key}`);
        check(active!.parts < 320, 'Backend320part cap');
        if (body.part.version === '029-metric-part-v1') {
          check(body.partId === metricPartId(body.part), 'Deterministic metric ID');
          verifyMetricPart(body.part, identity);
        } else
          check(
            body.partId ===
              `${identity.captureId}-${identity.backend}-${identity.runOrdinal}-${body.part.version === '029-trace-part-v1' ? 'trace' : body.part.version === '029-heap-part-v1' ? 'heap' : 'INVALID'}` &&
              body.part.partId === body.partId,
            'Deterministic ancillary ID',
          );
        const files = await readdir(directory(identity.captureId));
        check(
          files.filter((file) =>
            file.startsWith(`${identity.captureId}-${identity.backend}-${identity.runOrdinal}-`),
          ).length < 16,
          'Per-run16part cap',
        );
        await immutable(identity.captureId, `${body.partId}.json`, body.part);
        active!.parts++;
        return { partId: body.partId, saved: true };
      }),
    complete: (run: HardwareRunManifest) =>
      locked(async () => {
        const identity = expected();
        await guard();
        check(run.partIds.length <= 16, 'Manifest16part cap');
        const parts = [];
        for (const id of run.partIds) {
          check(/^[a-zA-Z0-9_-]+$/.test(id), 'Part identifier');
          parts.push(
            JSON.parse(
              await readFile(resolve(directory(identity.captureId), `${id}.json`), 'utf8'),
            ) as MetricPart | HeapPart | TracePart,
          );
        }
        const metrics = parts.filter(
          (part): part is MetricPart => part.version === '029-metric-part-v1',
        );
        const trace = parts.find((part): part is TracePart => part.version === '029-trace-part-v1'),
          heap = parts.find((part): part is HeapPart => part.version === '029-heap-part-v1');
        check(trace !== undefined && heap !== undefined, 'Trace/heap complete');
        const verified = verifyCompleteRun(run, metrics, trace, heap, identity, build);
        await immutable(identity.captureId, `run-${identity.runOrdinal}-manifest.json`, run);
        await immutable(identity.captureId, `run-${identity.runOrdinal}-verified.json`, verified);
        active!.completed++;
        return {
          runOrdinal: identity.runOrdinal,
          parts: run.partIds.length,
          memoryAvailability: verified.memoryAvailability,
        };
      }),
    failure: (failure: {
      captureId: string;
      identity: HardwarePartIdentity | null;
      error: string;
    }) =>
      locked(async () => {
        check(
          active !== null && failure.captureId === active.captureId,
          'Failure capture identity',
        );
        await immutable(active.captureId, 'failure.json', failure);
        active.failed = true;
        return { preserved: true, policy: 'No selective resume; review original attempt' };
      }),
    finish: (body: { captureId: string; backend: string }) =>
      locked(async () => {
        check(
          active !== null &&
            !active.failed &&
            active.completed === 20 &&
            active.captureId === body.captureId &&
            active.backend === body.backend,
          'Normal20run completion',
        );
        await guard();
        const runs: VerifiedRun[] = [];
        for (let index = 0; index < 20; index++)
          runs.push(
            JSON.parse(
              await readFile(
                resolve(directory(active.captureId), `run-${index}-verified.json`),
                'utf8',
              ),
            ),
          );
        const result = compareBackend(runs);
        await immutable(active.captureId, 'comparison.json', result);
        return result;
      }),
  };
}
