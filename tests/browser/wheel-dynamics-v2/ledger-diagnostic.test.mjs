// SOURCE16 draft: in-memory filesystem only, no server/build/native work.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLedger } from './ledger.mjs';

test('frozen verification hostile failure persists FAILED_UNKNOWN supplement and original rejection', async () => {
  for (const value of [
    undefined,
    false,
    null,
    Object.create(null),
    new Proxy(
      {},
      {
        get() {
          throw new Error('get trap');
        },
        getOwnPropertyDescriptor() {
          throw new Error('descriptor trap');
        },
      },
    ),
  ]) {
    const files = new Map();
    const filesystem = {
      mkdir: async () => {},
      readFile: async (path) => {
        if (!files.has(path)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
        return files.get(path);
      },
      writeFile: async (path, bytes) => {
        if (files.has(path)) throw Object.assign(new Error('exists'), { code: 'EEXIST' });
        files.set(path, bytes);
      },
    };
    let fail = false;
    const ledger = createLedger(
      'source16-memory-only',
      { sourceHash: 'a'.repeat(64) },
      () => {
        if (fail) throw value;
      },
      filesystem,
    );
    const { binding } = await ledger.start({
      launchKey: '12345678-1234-1234-1234-123456789012',
      requestedBackend: 'AUTO',
      mode: 'full',
    });
    fail = true;
    await ledger.append({ binding, renderer: null, state: 'FAILED_UNKNOWN' }, 'terminal-error');
    const saved = (await ledger.read(binding.captureId, 'terminal-error')).record.dto;
    assert.equal(saved.state, 'FAILED_UNKNOWN');
    assert.match(saved.frozenStatus, /^FAILED_UNKNOWN: /);
    assert(saved.frozenStatus.length <= 1040);
    await ledger.append({ binding, renderer: null }, 'backend').then(
      () => {
        assert.fail('normal append accepted frozen drift');
      },
      (error) => {
        assert.equal(error, value);
      },
    );
  }
});
