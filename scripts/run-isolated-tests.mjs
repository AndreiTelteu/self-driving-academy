import { spawn } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

// Explicit correctness suites only. Timing collectors and browser probes are never scheduled here.
const args = process.argv.slice(2);
const concurrency = args[0]?.startsWith('--concurrency=') ? Number(args.shift().split('=')[1]) : 2;
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4 || !args.length)
  throw new Error(
    'Usage: node scripts/run-isolated-tests.mjs [--concurrency=1..4] tests/...test.ts ...',
  );
const root = await realpath('tests');
const files = await Promise.all(
  args.map(async (file) => {
    const path = await realpath(resolve(file));
    if (
      !path.startsWith(root + sep) ||
      !path.endsWith('.test.ts') ||
      path.includes(`${sep}browser${sep}`)
    )
      throw new Error('Only explicit isolated correctness test files are allowed');
    return path;
  }),
);
if (new Set(files).size !== files.length) throw new Error('Duplicate test file');
const child = spawn(
  process.execPath,
  [
    '--import',
    './scripts/register-typescript.mjs',
    '--test',
    `--test-concurrency=${concurrency}`,
    ...files,
  ],
  { stdio: 'inherit', shell: false },
);
child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
