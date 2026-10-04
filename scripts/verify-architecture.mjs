import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createScanner, SyntaxKind } from 'typescript/unstable/ast';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const domain = new Set([
  'simulation',
  'world',
  'vehicles',
  'autonomy',
  'fleet',
  'telemetry',
  'learning',
  'profiles',
  'experiments',
  'missions',
  'economy',
  'progression',
  'sessions',
  'settings',
  'workers',
  'challenges',
  'destructibles',
]);
const files = readdirSync(src, { recursive: true }).filter((file) => file.endsWith('.ts'));
const errors = [];
const edges = new Map();
const expectedModules = ['app', ...domain, 'rendering', 'ui', 'input', 'persistence', 'audio'];
for (const name of expectedModules) {
  assert(existsSync(join(src, name, 'index.ts')), `Missing public entry point: ${name}`);
}
assert(existsSync(join(src, 'rendering/babylon/index.ts')), 'Missing Babylon adapter entry point');

function moduleFile(base) {
  return [base, `${base}.ts`, join(base, 'index.ts')].find(
    (candidate) => existsSync(candidate) && candidate.endsWith('.ts'),
  );
}

function inspect(file, source) {
  const owner = file.split(/[\\/]/)[0];
  const scanner = createScanner(true);
  scanner.setText(source);
  const tokens = [];
  while (scanner.scan() !== SyntaxKind.EndOfFile) {
    tokens.push({
      kind: scanner.getToken(),
      value: scanner.getTokenValue(),
      text: scanner.getTokenText(),
    });
  }
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (
      domain.has(owner) &&
      ['document', 'window', 'HTMLElement', 'HTMLCanvasElement'].includes(token.text)
    ) {
      errors.push(`${file}: browser/DOM identifier ${token.text} in domain`);
    }
    if (token.text === 'require')
      errors.push(`${file}: require is forbidden; use static ESM imports`);
    if (token.text === 'import' && tokens[index + 1]?.text === '(') {
      errors.push(`${file}: dynamic imports require an explicit architecture policy`);
    }
    if (token.kind !== SyntaxKind.StringLiteral) continue;
    const previous = tokens[index - 1]?.text;
    if (previous !== 'from' && previous !== 'import') continue;
    const specifier = token.value;
    if (file === 'main.ts' && specifier === './style.css') continue;
    if (!specifier.startsWith('.')) {
      if (!(
        file.replaceAll('\\', '/').startsWith('rendering/babylon/') &&
        specifier.startsWith('@babylonjs/')
      )) {
        errors.push(`${file}: external import ${specifier} outside Babylon adapter`);
      }
      continue;
    }
    const target = moduleFile(resolve(dirname(join(src, file)), specifier));
    if (!target || relative(src, target).startsWith('..')) {
      errors.push(`${file}: unresolved or out-of-src import ${specifier}`);
      continue;
    }
    const targetRelative = relative(src, target).replaceAll('\\', '/');
    const targetOwner = targetRelative.split('/')[0];
    const publicEntry = targetRelative === `${targetOwner}/index.ts`;
    const compositionAdapter =
      (owner === 'app' || file === 'main.ts') && targetRelative === 'rendering/babylon/index.ts';
    if (targetOwner !== owner && !publicEntry && !compositionAdapter) {
      errors.push(`${file}: cross-module import must use a public index.ts: ${specifier}`);
    }
    if (domain.has(owner) && !domain.has(targetOwner)) {
      errors.push(`${file}: domain imports adapter/composition module ${targetOwner}`);
    }
    // Public renderer/UI ports can consume domain types, but cannot execute domain services.
    const contractConsumer = owner === 'rendering' || owner === 'ui' || owner === 'input';
    if (contractConsumer && domain.has(targetOwner)) {
      let declarationStart = index - 1;
      while (
        declarationStart >= 0 &&
        !['import', 'export', ';'].includes(tokens[declarationStart].text)
      ) {
        declarationStart -= 1;
      }
      if (tokens[declarationStart + 1]?.text !== 'type') {
        errors.push(`${file}: presentation/input must use import type for domain contracts`);
      }
    }
    if (targetOwner !== owner) {
      const dependencies = edges.get(owner) ?? new Set();
      dependencies.add(targetOwner);
      edges.set(owner, dependencies);
    }
  }
}

for (const file of files) inspect(file, readFileSync(join(src, file), 'utf8'));
// Reject cycles among domain modules; adapter type contracts may reference domain read models.
function visit(owner, path = []) {
  assert(!path.includes(owner), `Domain dependency cycle: ${[...path, owner].join(' -> ')}`);
  for (const dependency of edges.get(owner) ?? []) {
    if (domain.has(dependency)) visit(dependency, [...path, owner]);
  }
}
for (const owner of domain) visit(owner);
assert.deepEqual(errors, [], 'Module dependency policy violations');
console.log(`Architecture imports: PASS (${files.length} TypeScript files)`);

// Prove the guard fails on both ordinary and re-exported forbidden dependencies.
for (const source of [
  "import { createBootstrapView } from '../ui';",
  "export * from '../rendering/babylon';",
  "import { Engine } from '@babylonjs/core/Engines/engine';",
  "const element = document.createElement('div');",
  "const module = import('../ui');",
]) {
  errors.length = 0;
  inspect('simulation/architecture-negative-probe.ts', source);
  assert(errors.length > 0, `Guard accepted forbidden dependency: ${source}`);
}
errors.length = 0;
inspect('ui/architecture-negative-probe.ts', "export * from '../rendering/babylon';");
assert(errors.some((error) => error.includes('public index.ts')));
errors.length = 0;
console.log('Architecture negative probes: PASS (6 forbidden dependencies rejected)');

// Execute the real public TypeScript entry points without DOM, Babylon, Vite or generated files.
const { hooks } = await import('./register-typescript.mjs');
try {
  const { createApplication } = await import(pathToFileURL(join(src, 'app/index.ts')).href);
  const { createMemorySnapshotStore } = await import(
    pathToFileURL(join(src, 'persistence/index.ts')).href
  );
  const { createProfileSnapshot } = await import(
    pathToFileURL(join(src, 'profiles/index.ts')).href
  );
  const store = createMemorySnapshotStore();
  assert.equal(await store.load(), null);
  const received = [];
  let disposalCount = 0;
  const application = createApplication({
    renderer: {
      present(snapshot) {
        received.push(snapshot);
      },
      dispose() {
        disposalCount += 1;
      },
    },
    snapshotStore: store,
  });
  application.start();
  application.start();
  assert.equal(received.length, 1);
  assert.equal(received[0].tick, 0);
  assert(Object.isFrozen(received[0]));
  assert(Object.isFrozen(received[0].profile));
  assert(Object.isFrozen(received[0].profile.parameters));
  assert.throws(() => {
    received[0].profile.parameters.speed = 100;
  }, TypeError);
  await application.saveSnapshot();
  const saved = await store.load();
  assert.deepEqual(saved, received[0]);
  assert.notEqual(saved.profile, received[0].profile);
  const mutable = { profileId: 'example', versionId: '1', parameters: { speed: 10 } };
  const immutable = createProfileSnapshot(mutable);
  mutable.parameters.speed = 20;
  assert.equal(immutable.parameters.speed, 10);
  await store.save({ tick: 4, profile: mutable });
  mutable.parameters.speed = 30;
  const persisted = await store.load();
  assert.equal(persisted.profile.parameters.speed, 20);
  assert.throws(() => {
    persisted.profile.parameters.speed = 99;
  }, TypeError);
  assert.equal((await store.load()).profile.parameters.speed, 20);
  application.dispose();
  application.dispose();
  assert.equal(disposalCount, 1);
  assert.throws(() => application.start(), /deja eliberată/);
  assert.throws(() => application.saveSnapshot(), /deja eliberată/);
  console.log('Renderer injection, readonly snapshots, defensive persistence and lifecycle: PASS');
} finally {
  hooks.deregister();
}
