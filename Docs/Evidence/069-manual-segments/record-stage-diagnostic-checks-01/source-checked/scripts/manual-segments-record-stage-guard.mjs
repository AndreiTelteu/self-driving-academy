// Lightweight measured-parent boundary. AST proof lives solely in terminal child.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
export function guardCopyRuntime(run = spawnSync) {
  const result = run(
    process.execPath,
    ['scripts/verify-manual-segments-record-stage-preflight.mjs'],
    { timeout: 30000, maxBuffer: 524288, encoding: 'utf8', windowsHide: true },
  );
  const diagnostics = {
    status: result.status,
    signal: result.signal,
    stdout: typeof result.stdout === 'string' ? result.stdout.slice(0, 65536) : '',
    stderr: typeof result.stderr === 'string' ? result.stderr.slice(0, 65536) : '',
  };
  if (result.error || result.status !== 0) {
    const error = new AggregateError(
      result.error ? [result.error] : [],
      'COPY runtime/archive preflight failed',
    );
    error.diagnostics = diagnostics;
    throw error;
  }
  let value;
  try {
    value = JSON.parse(result.stdout);
    assert.equal(value.status, 'PASS_COPY_BYTES_AND_DERIVATION_ONLY');
  } catch (cause) {
    const error = new AggregateError([cause], 'COPY preflight output invalid');
    error.diagnostics = diagnostics;
    throw error;
  }
  return value;
}
