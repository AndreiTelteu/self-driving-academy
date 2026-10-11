/** Bounded SOURCE proposal. Importing this helper creates no world or native initialization. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createScanner, SyntaxKind } from 'typescript/unstable/ast';
import { CURRENT_NATIVE_REFERENCE } from '../tests/browser/wheel-dynamics-v2/current-native-reference.mjs';

export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function requireCaptureGrant() {
  if (
    resolve('.').replaceAll('\\', '/') !==
    'F:/Sites/self-driving-academy/.worktrees/wheel-dynamics-01'
  )
    throw new Error('Wrong026 capture workdir');
  if (process.env.PBI026_CURRENT_NATIVE_EXECUTION_GRANT !== 'parent-serial-native-capture-approved')
    throw new Error('SOURCE proposal: separate parent serial native capture grant required');
}
export async function immutable(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const bytes =
    typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2);
  await writeFile(path, bytes, { flag: 'wx' });
  if (!(await readFile(path)).equals(Buffer.from(bytes)))
    throw new Error(`Immutable write readback mismatch: ${path}`);
}
/** Never call thrown-value getters, iterators, toJSON or conversion hooks. */
export function causes(error, seen = new Set(), depth = 0, budget = { nodes: 0 }) {
  if (depth >= 8 || budget.nodes++ >= 64) return { truncated: true };
  const primitiveText = (value) => {
    if (typeof value === 'string')
      return value.length > 8192 ? { text: value.slice(0, 8192), truncated: true } : value;
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'boolean' || typeof value === 'number') return String(value);
    // BigInt can have unbounded decimal length; symbols/functions/objects may have hooks.
    return { unknown: true, type: typeof value };
  };
  if ((typeof error !== 'object' || error === null) && typeof error !== 'function')
    return { thrownType: error === null ? 'null' : typeof error, message: primitiveText(error) };
  if (seen.has(error)) return { circular: true };
  seen.add(error);
  const own = (value, key) => {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor) return { absent: true };
      if (!Object.hasOwn(descriptor, 'value'))
        return { unknown: true, reason: 'accessor not invoked' };
      return { value: descriptor.value };
    } catch {
      return { unknown: true, reason: 'descriptor inspection failed' };
    }
  };
  const result = { thrownType: typeof error };
  for (const key of ['name', 'message', 'stack']) {
    const field = own(error, key);
    if (!field.absent) result[key] = field.unknown ? field : primitiveText(field.value);
  }
  if (!Object.hasOwn(result, 'message'))
    result.message = { unknown: true, reason: 'no own data message' };
  const cause = own(error, 'cause');
  if (!cause.absent)
    result.cause = cause.unknown ? cause : causes(cause.value, seen, depth + 1, budget);
  const errors = own(error, 'errors');
  if (!errors.absent) {
    if (errors.unknown) result.errors = errors;
    else {
      let array = false;
      try {
        array = Array.isArray(errors.value);
      } catch {
        /* revoked proxy: unknown */
      }
      const length = array ? own(errors.value, 'length') : { unknown: true };
      if (length.unknown || !Number.isSafeInteger(length.value) || length.value < 0)
        result.errors = { unknown: true, reason: 'errors is not an inspectable array' };
      else {
        result.errors = [];
        for (let index = 0; index < Math.min(length.value, 64); index++) {
          const item = own(errors.value, String(index));
          result.errors.push(
            item.unknown || item.absent
              ? { unknown: true, reason: 'unreadable error element' }
              : causes(item.value, seen, depth + 1, budget),
          );
        }
        if (length.value > 64) result.errorsTruncated = true;
      }
    }
  }
  return result;
}
/** Recording errors cannot replace pending causes; aggregates retain original references. */
export async function recordEvidence(path, payload, pending = [], writer = immutable) {
  try {
    await writer(path, payload);
  } catch (recording) {
    throw new AggregateError([...pending, recording], 'Evidence recording failed', {
      cause: recording,
    });
  }
}
/** Shared factory seam; successful recording still rethrows the exact thrown value. */
export async function recordFactoryFailure(path, error, writer = immutable) {
  await recordEvidence(
    path,
    {
      state: 'FAILED',
      stage: 'factory',
      causes: causes(error),
      cleanup: 'UNKNOWN: factory did not return',
    },
    [error],
    writer,
  );
  throw error;
}
export async function recordRun(rawPath, failurePath, payload, failures, writer = immutable) {
  const pending = failures.map((item) => item.cause);
  const serialized = () =>
    failures.map((item) => ({ stage: item.stage, cause: causes(item.cause) }));
  try {
    await writer(rawPath, { ...payload, failures: serialized() });
  } catch (error) {
    pending.push(error);
    failures.push({ stage: 'raw-write', cause: error });
  }
  if (pending.length) {
    try {
      await writer(failurePath, { state: 'FAILED', failures: serialized() });
    } catch (error) {
      pending.push(error);
    }
    throw new AggregateError(pending, 'Native run or recording failed', { cause: pending[0] });
  }
}
export async function failTerminal(path, error, extra = {}, writer = immutable) {
  await recordEvidence(
    path,
    { state: 'FAILED', causes: causes(error), finishedAt: new Date().toISOString(), ...extra },
    [error],
    writer,
  );
  throw error;
}
export const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
export async function readSourceBytes(path) {
  const bytes = await readFile(path);
  if (bytes.length > MAX_SOURCE_BYTES) throw new Error('Local source file exceeds8MiB');
  return bytes;
}
/** Rehash both sides of the copy, after build and before completion/success. */
export async function verifyFrozenArchive({
  inputs,
  sourceHash,
  artifacts,
  root,
  archive,
  native,
}) {
  for (const sourceRoot of ['.', resolve(archive, 'source')]) {
    const source = createHash('sha256');
    for (const path of inputs)
      source.update(path).update(await readFile(resolve(sourceRoot, path)));
    if (source.digest('hex') !== sourceHash) throw new Error('Source changed during build/archive');
  }
  for (const buildRoot of [root, resolve(archive, 'build')])
    for (const item of artifacts) {
      const bytes = await readFile(resolve(buildRoot, item.path));
      if (bytes.length !== item.bytes || digest(bytes) !== item.sha256)
        throw new Error('Build changed during archive');
    }
  for (const path of [native.resolvedPath, resolve(archive, 'native/rapier-native-artifact.mjs')]) {
    const bytes = await readFile(path);
    if (bytes.length !== native.bytes || digest(bytes) !== native.sha256)
      throw new Error('Native changed during archive');
  }
}
export async function localClosure(entries) {
  const consumed = new Set();
  async function consume(path) {
    const absolute = resolve(path);
    const local = relative(resolve('.'), absolute).replaceAll('\\', '/');
    if (local.startsWith('../') || local.includes(':')) throw new Error('Closure outside worktree');
    if (consumed.has(local)) return;
    if (consumed.size >= 512) throw new Error('Local closure exceeds512 files');
    consumed.add(local);
    if (!['.ts', '.mjs', '.js'].includes(extname(absolute))) return;
    const sourceBytes = await readSourceBytes(absolute);
    const scanner = createScanner(true);
    scanner.setText(sourceBytes.toString('utf8'));
    const tokens = [];
    while (scanner.scan() !== SyntaxKind.EndOfFile)
      tokens.push({
        kind: scanner.getToken(),
        text: scanner.getTokenText(),
        value: scanner.getTokenValue(),
      });
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      if (token.kind !== SyntaxKind.StringLiteral) continue;
      const dynamic = tokens[index - 1]?.text === '(' && tokens[index - 2]?.text === 'import';
      if (!dynamic && !['from', 'import'].includes(tokens[index - 1]?.text)) continue;
      let start = index - 1;
      if (!dynamic) {
        while (start >= 0 && !['import', 'export', ';'].includes(tokens[start].text)) start--;
        if (start < 0 || !['import', 'export'].includes(tokens[start].text)) continue;
        const clause = tokens.slice(start + 1, index - 1).map((item) => item.text);
        if (clause[0] === 'type') continue;
        if (clause[0] === '{' && clause.at(-1) === '}') {
          const elements = clause
            .slice(1, -1)
            .join(' ')
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean);
          if (elements.length && elements.every((x) => /^type\s+(?!as\b)\S+/.test(x))) continue;
        }
      }
      if (!token.value.startsWith('.')) continue;
      const target = resolve(dirname(absolute), token.value.split('?')[0]);
      const candidate = [
        target,
        `${target}.ts`,
        `${target}.mjs`,
        `${target}.js`,
        resolve(target, 'index.ts'),
      ].find((item) => existsSync(item) && extname(item));
      if (!candidate) throw new Error(`Unresolved consumed import: ${local}: ${token.value}`);
      await consume(candidate);
    }
  }
  for (const entry of entries) await consume(entry);
  return [...consumed].sort();
}
export const captureEntries = [
  'scripts/benchmark-wheel-dynamics.mjs',
  'scripts/calibrate-wheel-dynamics.mjs',
  'scripts/register-typescript.mjs',
  'tests/vehicles/physics-fixture.ts',
  'tests/vehicles/wheel-dynamics-fixture.ts',
  'tests/browser/wheel-dynamics-v2/main.ts',
  'package.json',
  'package-lock.json',
  'Docs/performance-budgets.json',
];
export async function archiveCapture(folder, kind) {
  // Atomic directory claim; never reuse a failed or partial attempt.
  await mkdir(folder);
  try {
    await immutable(`${folder}/archive-started.json`, {
      kind,
      startedAt: new Date().toISOString(),
    });
    const paths = await localClosure(captureEntries);
    const source = createHash('sha256'),
      inputs = [];
    for (const path of paths) {
      const bytes = await readSourceBytes(path);
      source.update(path).update(bytes);
      inputs.push({ path, bytes: bytes.length, sha256: digest(bytes) });
      await immutable(`${folder}/source/${path}`, bytes);
    }
    await immutable(`${folder}/source/.gitattributes`, '* -text\n');
    // Consumed Rapier entry embeds its WASM. Other third-party packages are lock-pinned,
    // not copied wholesale; this is a native source archive, not a built browser proof.
    const resolvedPath = fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat'));
    const bytes = await readFile(resolvedPath);
    if (
      bytes.length !== CURRENT_NATIVE_REFERENCE.nativeBytes ||
      digest(bytes) !== CURRENT_NATIVE_REFERENCE.nativeHash
    )
      throw new Error('Installed original native artifact changed before first world');
    const native = {
      resolvedPath,
      bytes: bytes.length,
      sha256: digest(bytes),
      archive: `${folder}/rapier-native-artifact.mjs`,
    };
    await immutable(native.archive, bytes);
    const binding = {
      kind,
      sourceHash: source.digest('hex'),
      inputs,
      native,
      completedAt: new Date().toISOString(),
    };
    await immutable(`${folder}/archive-complete.json`, binding);
    await assertFrozen(binding);
    return binding;
  } catch (error) {
    await failTerminal(`${folder}/terminal.json`, error, {
      stage: 'archive-before-world',
      worldAttempted: false,
    });
  }
}
export async function assertFrozen(binding, root = '.') {
  for (const item of binding.inputs) {
    const bytes = await readFile(resolve(root, item.path));
    if (bytes.length !== item.bytes || digest(bytes) !== item.sha256)
      throw new Error(`Source changed: ${item.path}`);
  }
  const native = await readFile(binding.native.resolvedPath);
  if (native.length !== binding.native.bytes || digest(native) !== binding.native.sha256)
    throw new Error('Installed native changed');
}
