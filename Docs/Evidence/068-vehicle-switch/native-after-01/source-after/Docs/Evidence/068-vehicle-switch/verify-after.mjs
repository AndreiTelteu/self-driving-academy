// Independent full AFTER acceptance, with original historical BEFORE and strict inventory proof.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { validateAfterReports } from './after-numeric-checks.mjs';
const root = fileURLToPath(new URL('../../..', import.meta.url));
assert(process.argv.slice(2).every((v) => v === '--historical'));
const historical = process.argv.includes('--historical');
execFileSync(
  process.execPath,
  ['Docs/Evidence/068-vehicle-switch/verify-baseline-v2.mjs', '--historical'],
  { cwd: root, stdio: 'inherit' },
);
execFileSync(
  process.execPath,
  [
    'Docs/Evidence/068-vehicle-switch/verify-after-inventory.mjs',
    ...(historical ? ['--historical'] : []),
  ],
  { cwd: root, stdio: 'inherit' },
);
const after = JSON.parse(
  await readFile(resolve(root, 'Docs/Evidence/068-vehicle-switch/native-after-01/after.json')),
);
const before = JSON.parse(
  await readFile(
    resolve(root, 'Docs/Evidence/068-vehicle-switch/corrected-reference-v2/before.json'),
  ),
);
const summary = validateAfterReports(after, before);
console.log(
  JSON.stringify({
    status: 'PASS',
    scope: historical ? 'HISTORICAL strict AFTER' : 'CURRENT strict AFTER',
    sourceHash: after.sourceHash,
    nativeSha256: after.nativeArtifact.sha256,
    ...summary,
  }),
);
