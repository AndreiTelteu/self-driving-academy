import { createFunctionalStore } from './functional-store.mjs';
import { functionalHandler } from './functional-http.mjs';
import { createHandler } from './browser-http.mjs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { verifyBuild, createStore } from './build-binding.mjs';
assert.equal(
  resolve('.').replaceAll('\\', '/'),
  'F:/Sites/self-driving-academy/.worktrees/vehicle-recovery-01',
);
assert.equal(
  execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
  'loop-pbi/vehicle-recovery-01',
);
assert.equal(
  execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  'ad32db9c609cce1132669c95312ae202a62b87ed',
);
const build = await verifyBuild(process.argv[2], false),
  store = await createStore(build);
const functional = await createFunctionalStore(build);
const server = createServer(functionalHandler(createHandler(build, store), functional));
server.listen(5219, '127.0.0.1', () =>
  console.log('030 current AFTER+trustedR functional http://localhost:5219'),
);
process.on('SIGINT', () => server.close(() => process.exit(0)));
