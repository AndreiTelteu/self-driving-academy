import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
export const BODY_CAP = 16 * 1024 * 1024;
export async function readDiagnosticBody(request) {
  const chunks = [];
  let bytes = 0;
  for await (const c of request.iterator({ destroyOnReturn: false })) {
    bytes += c.length;
    if (bytes > BODY_CAP) {
      request.resume();
      throw Object.assign(Error('diagnostic bounded16MiB body exceeded'), {
        status: 413,
        bytesObserved: bytes,
        captureId: String(request.headers['x-diagnostic-capture-id'] ?? '').slice(0, 64),
      });
    }
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}
export function diagnosticStore(root, build, guard) {
  const states = new Map();
  let rejected = 0,
    queue = Promise.resolve();
  const save = (name, b) => writeFile(resolve(root, name), b, { flag: 'wx' });
  const locked = (action) => {
    const pending = queue.then(action);
    queue = pending.catch(() => undefined);
    return pending;
  };
  return {
    rejectBody(error) {
      return locked(async () => {
        const state = [...states.values()].find((v) => v.captureId === error.captureId);
        const record = {
          captureId: state?.captureId ?? error.captureId ?? null,
          reason: String(error).slice(0, 2048),
          bytesObserved: error.bytesObserved ?? null,
          capBytes: BODY_CAP,
          receivedAt: new Date().toISOString(),
          status: 'INCOMPLETE_TRANSPORT',
        };
        if (state) {
          if (state.terminal)
            throw Object.assign(Error('immutable terminal already exists'), { status: 409 });
          state.terminal = true;
          await writeFile(resolve(state.folder, 'body-read-failure.json'), JSON.stringify(record), {
            flag: 'wx',
          });
        } else if (rejected < 4) {
          await save('body-read-failure-' + rejected++ + '.json', JSON.stringify(record));
        }
        return record;
      });
    },
    handle(path, bytes) {
      return locked(async () => {
        let request;
        try {
          request = JSON.parse(bytes.toString('utf8'));
        } catch (error) {
          if (rejected < 4)
            await save(
              'rejected-' + rejected++ + '.json',
              JSON.stringify({
                reason: String(error),
                receivedAt: new Date().toISOString(),
                bytes: bytes.length,
                sha256: createHash('sha256').update(bytes).digest('hex'),
              }),
            );
          throw Object.assign(Error('diagnostic malformed JSON'), { status: 400 });
        }
        if (path === '/start') {
          await guard();
          if (
            !['AUTO', 'WEBGL2'].includes(request.preference) ||
            request.sourceHash !== build.sourceHash ||
            request.nativeHash !== build.nativeHash
          )
            throw Error('diagnostic start identity');
          if (states.has(request.preference))
            throw Object.assign(Error('immutable diagnostic attempt exists'), { status: 409 });
          if (states.size >= 2) throw Error('diagnostic attempt capacity');
          const captureId = randomUUID(),
            folder = resolve(root, request.preference);
          await mkdir(folder);
          const state = { captureId, folder, preference: request.preference, terminal: false };
          states.set(request.preference, state);
          await writeFile(
            resolve(folder, 'started.json'),
            JSON.stringify({
              captureId,
              preference: request.preference,
              sourceHash: build.sourceHash,
              artifactHash: build.artifactHash,
              nativeHash: build.nativeHash,
              createdAt: new Date().toISOString(),
            }),
            { flag: 'wx' },
          );
          return {
            captureId,
            sourceHash: build.sourceHash,
            artifactHash: build.artifactHash,
            nativeHash: build.nativeHash,
          };
        }
        const state = [...states.values()].find((v) => v.captureId === request.captureId);
        if (!state) throw Error('unknown diagnostic capture');
        if (state.terminal)
          throw Object.assign(Error('diagnostic already terminal'), { status: 409 });
        state.terminal = true;
        await writeFile(resolve(state.folder, 'submitted.json'), bytes, { flag: 'wx' });
        await writeFile(
          resolve(state.folder, 'submitted-envelope.json'),
          JSON.stringify({
            receivedAt: new Date().toISOString(),
            bytes: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'),
          }),
          { flag: 'wx' },
        );
        try {
          await guard();
          if (
            request.build.sourceHash !== build.sourceHash ||
            request.build.artifactHash !== build.artifactHash ||
            request.build.nativeHash !== build.nativeHash ||
            request.performanceAcceptance !== false ||
            request.hardwareFullAcceptance !== false ||
            !['COMPLETE_DIAGNOSTIC', 'INCOMPLETE_DIAGNOSTIC'].includes(request.status)
          )
            throw Error('diagnostic identity/scope');
          for (const [key, cap] of [
            ['waits', 30000],
            ['heartbeats', 4000],
            ['longTasks', 4096],
            ['stages', 20],
          ])
            if (!Array.isArray(request[key]) || request[key].length > cap)
              throw Error('diagnostic array cap');
          await writeFile(
            resolve(state.folder, 'terminal.json'),
            JSON.stringify({
              status: request.status,
              captureId: state.captureId,
              createdAt: new Date().toISOString(),
              performanceAcceptance: false,
            }),
            { flag: 'wx' },
          );
          return { status: 'DIAGNOSTIC_SAVED', performanceAcceptance: false };
        } catch (error) {
          await writeFile(
            resolve(state.folder, 'rejected.json'),
            JSON.stringify({ reason: String(error), createdAt: new Date().toISOString() }),
            { flag: 'wx' },
          );
          throw error;
        }
      });
    },
  };
}
