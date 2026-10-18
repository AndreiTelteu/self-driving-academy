import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { digest, immutable } from './wheel-capture-source.mjs';
const folder = 'Docs/Evidence/047-longitudinal-control/cpu-profile-v1';
const path = `${folder}/047-current.cpuprofile`;
assert((await stat(path)).size <= 32 * 1024 * 1024);
const bytes = await readFile(path),
  profile = JSON.parse(bytes);
assert(profile.nodes.length <= 100000 && profile.samples.length <= 1000000);
const nodes = new Map(profile.nodes.map((node) => [node.id, node])),
  parents = new Map();
for (const node of profile.nodes)
  for (const child of node.children ?? []) parents.set(child, node.id);
const own = (node) => node.callFrame.url.endsWith('/src/autonomy/longitudinal-control.ts');
function inStep(node) {
  for (let depth = 0; node; depth++, node = nodes.get(parents.get(node.id))) {
    assert(depth < 1000);
    if (own(node) && node.callFrame.functionName === 'step') return true;
  }
  return false;
}
const hits = new Map();
for (const id of profile.samples) {
  assert(nodes.has(id));
  hits.set(id, (hits.get(id) ?? 0) + 1);
}
const frames = new Map(),
  positions = new Map();
let stepSamples = 0;
for (const node of profile.nodes)
  if (inStep(node)) {
    const count = hits.get(node.id) ?? 0;
    stepSamples += count;
    const key = `${node.callFrame.functionName || '(anonymous)'}@${node.callFrame.url}`;
    frames.set(key, (frames.get(key) ?? 0) + count);
    if (own(node))
      for (const position of node.positionTicks ?? []) {
        const key = `${node.callFrame.functionName}:${position.line}`;
        positions.set(key, (positions.get(key) ?? 0) + position.ticks);
      }
  }
const binding = JSON.parse(
  await readFile('Docs/Evidence/047-longitudinal-control/cpu-profile-capture-v1/binding.json'),
);
const source = await readFile(
  'Docs/Evidence/047-longitudinal-control/cpu-profile-capture-v1/source/src/autonomy/longitudinal-control.ts',
);
const input = binding.inputs.find((input) => input.path === 'src/autonomy/longitudinal-control.ts');
assert.equal(digest(source), input.sha256);
const lines = source.toString('utf8').split(/\r?\n/);
const result = {
  status: 'DIAGNOSTIC_ONLY',
  sourceHash: binding.sourceHash,
  sourceFileHash: input.sha256,
  profileSha256: digest(bytes),
  bytes: bytes.length,
  nodes: profile.nodes.length,
  samples: profile.samples.length,
  stepSamples,
  frames: [...frames]
    .sort((a, b) => b[1] - a[1])
    .map(([frame, samples]) => ({ frame, samples, fractionOfStepSamples: samples / stepSamples })),
  positions: [...positions]
    .sort((a, b) => b[1] - a[1])
    .map(([position, samples]) => {
      const [name, line] = position.split(':');
      return { name, line: Number(line), samples, source: lines[Number(line) - 1]?.trim() };
    }),
  limitation:
    'Statistical V8 CPU samples and source-position attribution, not exact suboperation timing; optimized/inlined builtin work can be charged to its caller. No acceptance gate uses profiled timings.',
};
await immutable(`${folder}/analysis.json`, result);
await immutable(
  `${folder}/analysis-source.mjs`,
  await readFile('scripts/analyze-longitudinal-profile.mjs'),
);
console.log(
  JSON.stringify({
    ...result,
    frames: result.frames.slice(0, 12),
    positions: result.positions.slice(0, 18),
  }),
);
