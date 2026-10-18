import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { StoredHardwareBuild } from './hardware-store';
import { verifyFunctionalCases } from './hardware-functional-verifier';
import type { FunctionalCase } from './hardware-functional-verifier';
function check(value: boolean, reason: string): asserts value {
  if (!value) throw new Error(reason);
}
export function createFunctionalStore(
  build: StoredHardwareBuild & { captureRoot: string },
  guard: () => Promise<void>,
) {
  let active: { captureId: string; backend: string; completed: number; failed: boolean } | null =
    null;
  let queue: Promise<unknown> = Promise.resolve();
  const locked = <T>(fn: () => Promise<T>) => {
    const result = queue.then(fn);
    queue = result.catch(() => undefined);
    return result;
  };
  const file = (name: string) => resolve(build.captureRoot, 'functional', active!.captureId, name);
  const save = async (name: string, value: unknown) => {
    const bytes = Buffer.from(JSON.stringify(value));
    check(bytes.length <= 128 * 1024, 'Functional payload cap');
    await writeFile(file(name), bytes, { flag: 'wx' });
  };
  return {
    start: (preference: unknown) =>
      locked(async () => {
        check(active === null, 'One functional attempt per server');
        check(preference === 'AUTO' || preference === 'WEBGL2', 'Functional preference');
        await guard();
        active = {
          captureId: new Date().toISOString().replace(/[^0-9TZ]/g, ''),
          backend: preference === 'AUTO' ? 'WEBGPU' : 'WEBGL2',
          completed: 0,
          failed: false,
        };
        await mkdir(resolve(build.captureRoot, 'functional'), { recursive: true });
        await mkdir(resolve(build.captureRoot, 'functional', active.captureId), {
          recursive: false,
        });
        await save('start.json', {
          ...active,
          build,
          startedAt: new Date().toISOString(),
          protocol: '12 native collision/directional cases +20 ownership cycles',
        });
        return { captureId: active.captureId, backend: active.backend };
      }),
    case: (body: { captureId: string; ordinal: number; result: Record<string, unknown> }) =>
      locked(async () => {
        check(
          active !== null &&
            !active.failed &&
            body.captureId === active.captureId &&
            body.ordinal === active.completed &&
            body.ordinal < 32,
          'Functional immutable chronology',
        );
        try {
          await guard();
          const result = body.result;
          check(result.ordinal === body.ordinal, 'Functional ordinal');
          if (body.ordinal < 12) {
            check(
              result.classId === (body.ordinal < 6 ? 'sedan' : 'compact') &&
                result.source === (Math.floor(body.ordinal / 3) % 2 ? 'AUTONOMY' : 'PLAYER') &&
                result.impactSpeedMps === [0, 3, 12][body.ordinal % 3] &&
                result.backend === active.backend &&
                result.scriptedCommands === true,
              'Actual named case identity',
            );
          } else
            check(
              result.ownerCycle === true && result.cycle === body.ordinal - 12,
              'Exactly20 owner cycles',
            );
        } catch (error) {
          // Expected ordinal, not caller-controlled class/backend, names this one terminal raw file.
          active.failed = true;
          try {
            await save(`rejected-case-${active.completed}.json`, body);
            await save('rejected.json', {
              expectedOrdinal: active.completed,
              reason: String(error).slice(0, 2048),
            });
          } catch (exportError) {
            throw new AggregateError([error, exportError], 'Rejected case preservation failed');
          }
          throw error;
        }
        const result = body.result;
        await save(`case-${body.ordinal}.json`, body);
        active.completed++;
        if (result.passed !== true) active.failed = true;
        return { ordinal: body.ordinal, preserved: true };
      }),
    failure: (body: { captureId: string; ordinal: number; error: string }) =>
      locked(async () => {
        check(
          active !== null && active.captureId === body.captureId,
          'Functional failure identity',
        );
        await save('failure.json', body);
        active.failed = true;
        return { preserved: true };
      }),
    finish: (body: { captureId: string }) =>
      locked(async () => {
        check(
          active !== null &&
            !active.failed &&
            body.captureId === active.captureId &&
            active.completed === 32,
          'Full32case scoped protocol',
        );
        await guard();
        const cases = [];
        for (let ordinal = 0; ordinal < 32; ordinal++)
          cases.push(JSON.parse(await readFile(file(`case-${ordinal}.json`), 'utf8')).result);
        verifyFunctionalCases(cases as FunctionalCase[], active.backend);
        for (const row of cases) {
          check(row.passed === true, 'No discarded functional failure');
          const cleanup = row.cleanup;
          if (row.ownerCycle)
            check(
              cleanup.bodies.entities === 0 &&
                cleanup.bodies.subscriptions === 0 &&
                cleanup.collisions.colliders === 0 &&
                cleanup.controllerVehicles === 0 &&
                cleanup.damageVehicles === 0 &&
                cleanup.damageHistory === 0 &&
                cleanup.sceneDisposed &&
                cleanup.disposedReadRejected,
              'Scoped lifecycle actual cleanup',
            );
          else
            check(
              cleanup.bodies.entities === 0 &&
                cleanup.bodies.subscriptions === 0 &&
                cleanup.collisions.colliders === 0 &&
                cleanup.controller.vehicles === 0 &&
                cleanup.damage.vehicles === 0 &&
                cleanup.damage.historyRecords === 0 &&
                cleanup.sceneDisposed,
              'Native functional cleanup',
            );
        }
        for (let index = 0; index < 12; index += 3) {
          const available = cases[index].reverseDrive,
            damaged = cases[index + 1].reverseDrive;
          check(
            Math.abs(damaged.position.z) < Math.abs(available.position.z) &&
              damaged.speed < available.speed,
            'Damage reduces actual reverse displacement and speed under same setup/class/source',
          );
        }
        const result = {
          version: '029-current-functional-result-v1',
          captureId: active.captureId,
          backend: active.backend,
          sourceHash: build.sourceHash,
          artifactHash: build.artifactHash,
          nativeHash: build.nativeHash,
          nativeCases: 12,
          ownershipCycles: 20,
          passed: true,
          scope:
            'Scripted native direction/collision/mobility/recovery and scoped real lifecycle; not trusted keyboard or224soak/fullgameplay',
        };
        await save('comparison.json', result);
        return result;
      }),
  };
}
