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
  if (resolve('.').replaceAll('\\', '/') !== 'F:/Sites/self-driving-academy/.worktrees/wheel-dynamics-01')
    throw new Error('Wrong026 capture workdir');
  if (process.env.PBI026_CURRENT_NATIVE_EXECUTION_GRANT !== 'parent-serial-native-capture-approved')
    throw new Error('SOURCE proposal: separate parent serial native capture grant required');
}
export async function immutable(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const bytes = typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2);
  await writeFile(path, bytes, { flag: 'wx' });
  if (!(await readFile(path)).equals(Buffer.from(bytes))) throw new Error(`Immutable write readback mismatch: ${path}`);
}
export function causes(error, seen = new Set()) {
  if (seen.has(error)) return { circular: true };
  seen.add(error);
  return { name: error?.name, message: String(error?.message ?? error), stack: error?.stack,
    cause: error?.cause === undefined ? undefined : causes(error.cause, seen),
    errors: error?.errors ? Array.from(error.errors, (item) => causes(item, seen)) : undefined };
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
    const scanner = createScanner(true);
    scanner.setText(await readFile(absolute, 'utf8'));
    const tokens = [];
    while (scanner.scan() !== SyntaxKind.EndOfFile)
      tokens.push({ kind: scanner.getToken(), text: scanner.getTokenText(), value: scanner.getTokenValue() });
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
          const elements = clause.slice(1, -1).join(' ').split(',').map((x) => x.trim()).filter(Boolean);
          if (elements.length && elements.every((x) => /^type\s+(?!as\b)\S+/.test(x))) continue;
        }
      }
      if (!token.value.startsWith('.')) continue;
      const target = resolve(dirname(absolute), token.value.split('?')[0]);
      const candidate = [target, `${target}.ts`, `${target}.mjs`, `${target}.js`, resolve(target, 'index.ts')]
        .find((item) => existsSync(item) && extname(item));
      if (!candidate) throw new Error(`Unresolved consumed import: ${local}: ${token.value}`);
      await consume(candidate);
    }
  }
  for (const entry of entries) await consume(entry);
  return [...consumed].sort();
}
export const captureEntries = [
  'scripts/benchmark-wheel-dynamics.mjs', 'scripts/calibrate-wheel-dynamics.mjs',
  'scripts/register-typescript.mjs', 'tests/vehicles/physics-fixture.ts',
  'tests/vehicles/wheel-dynamics-fixture.ts', 'tests/browser/wheel-dynamics-v2/main.ts',
  'package.json', 'package-lock.json', 'Docs/performance-budgets.json',
];
export async function archiveCapture(folder, kind) {
  // Atomic directory claim; never reuse a failed or partial attempt.
  await mkdir(folder);
  try {
  await immutable(`${folder}/archive-started.json`, { kind, startedAt: new Date().toISOString() });
  const paths = await localClosure(captureEntries);
  const source = createHash('sha256'), inputs = [];
  for (const path of paths) {
    const bytes = await readFile(path);
    if (bytes.length > 8 * 1024 * 1024) throw new Error('Local source file exceeds8MiB');
    source.update(path).update(bytes);
    inputs.push({ path, bytes: bytes.length, sha256: digest(bytes) });
    await immutable(`${folder}/source/${path}`, bytes);
  }
  await immutable(`${folder}/source/.gitattributes`, '* -text\n');
  // Consumed Rapier entry embeds its WASM. Other third-party packages are lock-pinned,
  // not copied wholesale; this is a native source archive, not a built browser proof.
  const resolvedPath = fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat'));
  const bytes = await readFile(resolvedPath);
  if (bytes.length !== CURRENT_NATIVE_REFERENCE.nativeBytes || digest(bytes) !== CURRENT_NATIVE_REFERENCE.nativeHash)
    throw new Error('Installed original native artifact changed before first world');
  const native = { resolvedPath, bytes: bytes.length, sha256: digest(bytes), archive: `${folder}/rapier-native-artifact.mjs` };
  await immutable(native.archive, bytes);
  const binding = { kind, sourceHash: source.digest('hex'), inputs, native, completedAt: new Date().toISOString() };
  await immutable(`${folder}/archive-complete.json`, binding);
  await assertFrozen(binding);
  return binding;
  } catch (error) {
    await immutable(`${folder}/terminal.json`, { state: 'FAILED', stage: 'archive-before-world', causes: causes(error), finishedAt: new Date().toISOString(), worldAttempted: false });
    throw error;
  }
}
export async function assertFrozen(binding, root = '.') {
  for (const item of binding.inputs) {
    const bytes = await readFile(resolve(root, item.path));
    if (bytes.length !== item.bytes || digest(bytes) !== item.sha256) throw new Error(`Source changed: ${item.path}`);
  }
  const native = await readFile(binding.native.resolvedPath);
  if (native.length !== binding.native.bytes || digest(native) !== binding.native.sha256) throw new Error('Installed native changed');
}
