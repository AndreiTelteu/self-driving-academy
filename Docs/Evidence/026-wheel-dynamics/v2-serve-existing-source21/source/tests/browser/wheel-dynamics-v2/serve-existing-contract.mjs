/** SOURCE20: pure guards; no filesystem, server, native initialization or build. */
import { createHash } from 'node:crypto';
import { resolve, relative, isAbsolute } from 'node:path';

export const WORKDIR = 'F:/Sites/self-driving-academy/.worktrees/wheel-dynamics-01';
export const UUID = '66872ce5-696c-4c3f-9e6d-b849d38f0ee4';
export const SOURCE = '7a3c2ca0c48e63ecd7b2bcc1edcb8658f2a4710b2c5203f77d775adc0230f3e8';
export const ARTIFACT = '8ce69f98824feb6fe39569fc2688656518ab1cc99717750f71a0be515a29f2f4';
export const ARCHIVE_NAME = `build-${SOURCE}-${ARTIFACT}-${UUID}`;
export const DESTINATION = `${WORKDIR}/Docs/Evidence/026-wheel-dynamics/v2-captures-source-ownership-1`;
export const ARCHIVE = `${DESTINATION}/${ARCHIVE_NAME}`;
export const MANIFEST = `${ARCHIVE}/build-manifest.json`;
export const BUILD = `${WORKDIR}/.pbi-validation-026-v2/build-${UUID}`;
export const PROOF_ROOT = `${WORKDIR}/Docs/Evidence/026-wheel-dynamics/v2-serve-existing-source21`;
export const SERVICE_PATHS = Object.freeze([
  'tests/browser/wheel-dynamics-v2/serve-existing-contract.mjs',
  'tests/browser/wheel-dynamics-v2/serve-existing.mjs',
]);
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function need(condition, message) {
  if (!condition) throw new Error(message);
}
export function exactBytes(bytes, count, sha256, label) {
  need(bytes.length === count && hash(bytes) === sha256, `${label}: byte/count/hash mismatch`);
}
export function inside(root, locator) {
  need(
    typeof locator === 'string' &&
      locator.length > 0 &&
      !locator.includes('\\') &&
      !locator.includes(':') &&
      !locator.includes('\0') &&
      !locator.split('/').some((p) => !p || p === '.' || p === '..') &&
      !isAbsolute(locator),
    'Unsafe relative locator',
  );
  const path = resolve(root, locator);
  const delta = relative(resolve(root), path);
  need(delta && !delta.startsWith('..') && !isAbsolute(delta), 'Path escape');
  return path;
}
export function identity(manifest, binding) {
  need(binding.archive === ARCHIVE_NAME, 'Wrong build UUID/archive');
  need(manifest.sourceHash === SOURCE && binding.sourceHash === SOURCE, 'Wrong source pin');
  need(
    manifest.artifactHash === ARTIFACT && binding.artifactHash === ARTIFACT,
    'Wrong artifact pin',
  );
  need(
    manifest.commit === 'e52e10b1170db7b8882d6581bdbd4027d2149fb6' &&
      binding.commit === manifest.commit,
    'Wrong original owner commit',
  );
  for (const key of ['inputs', 'budgetVersion', 'physicsVersion', 'engineVersion'])
    need(JSON.stringify(binding[key]) === JSON.stringify(manifest[key]), `Original binding ${key}`);
  need(
    manifest.inputs.length === 105 && new Set(manifest.inputs).size === 105,
    '105 unique inputs',
  );
  need(
    manifest.artifacts.length === 142 &&
      new Set(manifest.artifacts.map((x) => x.path)).size === 142,
    '142 unique artifacts',
  );
  need(hash(JSON.stringify(manifest.artifacts)) === ARTIFACT, 'Artifact index hash');
  need(manifest.artifacts.reduce((n, x) => n + x.bytes, 0) === 10424629, 'Artifact byte total');
  for (const path of manifest.inputs) inside(WORKDIR, path);
  for (const item of manifest.artifacts) inside(BUILD, item.path);
}
