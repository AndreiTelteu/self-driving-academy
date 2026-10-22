// Independent PBI 220 evidence verifier. Reads exported JSON only: no browser, no build, no renderer.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  FLEET_BUDGETS,
  FLEET_WORKLOADS,
  evaluateRun,
  reproducibilityFindings,
  stressFindings,
  summarizeRepeats,
} from '../tests/browser/fleet-performance-gate/plan.ts';

const evidenceRoot = resolve('Docs/Evidence/220-fleet-gate/hardware');
const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith('--')));
const captureId = args[0];
const renderer = (args[1] ?? 'WEBGPU').toUpperCase();
if (!captureId) {
  const captures = existsSync(evidenceRoot)
    ? (await readdir(evidenceRoot)).filter((entry) => /^\d{8}T\d{6}\d{3}Z$/.test(entry))
    : [];
  console.error(
    `Usage: node --import ./scripts/register-typescript.mjs scripts/verify-fleet-gate-evidence.mjs <captureId> [WEBGPU|WEBGL2] [--current]`,
  );
  console.error(`Known captures: ${captures.join(', ') || '(none)'}`);
  process.exit(2);
}
if (!['WEBGPU', 'WEBGL2'].includes(renderer)) throw new Error('Unknown renderer');
const directory = resolve(evidenceRoot, captureId);
if (!existsSync(directory)) throw new Error(`Missing capture ${captureId}`);
const files = (await readdir(directory)).sort();
const failures = [];
const notes = [];
const read = async (name) => JSON.parse(await readFile(resolve(directory, name), 'utf8'));

const prefix = renderer.toLowerCase();
const hardware = await read('hardware.json');
const manifest = await read('build-manifest.json');
const budgetColumn = hardware.budgetColumn;
if (!budgetColumn) failures.push('hardware.json lacks a budget column');
const budgets = FLEET_BUDGETS[budgetColumn];

/* Source identity: the archived bytes must reproduce the manifest source hash. */
const archive = resolve(evidenceRoot, `source-${manifest.sourceHash}`);
if (!existsSync(archive)) failures.push(`Missing source archive for ${manifest.sourceHash}`);
else {
  const hash = createHash('sha256');
  for (const input of manifest.inputs) {
    const path = resolve(archive, input);
    if (!existsSync(path)) {
      failures.push(`Archived source missing ${input}`);
      continue;
    }
    hash.update(input).update(await readFile(path));
  }
  if (hash.digest('hex') !== manifest.sourceHash)
    failures.push('Archived source bytes do not reproduce the manifest source hash');
}
if (flags.has('--current')) {
  const hash = createHash('sha256');
  for (const input of manifest.inputs) hash.update(input).update(await readFile(input));
  if (hash.digest('hex') !== manifest.sourceHash)
    failures.push('Current working tree differs from the captured source');
}

const interpret = (run) => ({
  workload: run.workload,
  row: budgetColumn,
  frameP95Ms: run.frameMs?.p95 ?? Infinity,
  frameP99Ms: run.frameMs?.p99 ?? Infinity,
  mainThreadP95Ms: run.mainThreadMs?.p95 ?? Infinity,
  authoritativeTickP95Ms: run.authoritativeTickMs?.p95 ?? Infinity,
  rapierStepP95Ms: run.rapierStepMs?.p95 ?? Infinity,
  gpuP95Ms: run.optionalGpuMs?.p95 ?? null,
  inputToCommandP95Ms: run.inputToCommandMs?.p95 ?? null,
  learningEndToEndP95Ms: run.learningEndToEndMs?.p95 ?? null,
  simulationToWallRatio: run.simulatedToWallRatio,
  applicationLongTaskMaximumMs: run.longTasks?.maxMs ?? null,
  physicalVehicles: Number(run.counts?.vehicles),
  expectedVehicles:
    FLEET_WORKLOADS.find((spec) => spec.id === run.workload).taxis +
    FLEET_WORKLOADS.find((spec) => spec.id === run.workload).civilians,
  contacts: Number(run.counts?.contacts),
  collisions: Number(run.counts?.collisionEvents),
  cleanupLeaked: false,
  overloads: run.finalState?.overloads,
  status: run.finalState?.status,
  offscreenVehiclesRetained:
    Number(run.counts?.vehicles) ===
      FLEET_WORKLOADS.find((spec) => spec.id === run.workload).taxis +
        FLEET_WORKLOADS.find((spec) => spec.id === run.workload).civilians &&
    Number(run.counts?.bodies) >= Number(run.counts?.vehicles),
  aggressiveVehicles: Number(run.counts?.actors?.aggressive ?? 0),
  prudentVehicles: Number(run.counts?.actors?.prudent ?? 0),
  learningSegments: Number(run.counts?.learningSegments ?? 0),
});

const report = {
  captureId,
  renderer,
  budgetColumn,
  hardware: {
    model: hardware.model ?? null,
    cpu: hardware.cpu?.[0]?.Name ?? null,
    gpu: hardware.gpu?.[0]?.Name ?? null,
    driver: hardware.gpu?.[0]?.DriverVersion ?? null,
    os: hardware.os?.[0]?.Caption ?? null,
    build: hardware.os?.[0]?.BuildNumber ?? null,
    ramBytes: (hardware.memory ?? []).reduce((sum, row) => sum + Number(row.Capacity ?? 0), 0),
    powerScheme: hardware.powerScheme ?? null,
    display: [
      hardware.gpu?.[0]?.CurrentHorizontalResolution ?? null,
      hardware.gpu?.[0]?.CurrentVerticalResolution ?? null,
    ],
    refreshHz: hardware.gpu?.[0]?.CurrentRefreshRate ?? null,
    chromeVersion: hardware.chromeVersion ?? null,
  },
  workloads: {},
  failures,
  notes,
};

for (const spec of FLEET_WORKLOADS) {
  const runName = new RegExp(
    `^${`${prefix}-${spec.id}-`.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}${flags.has('--smoke') ? '\\d+-smoke' : '\\d+'}\\.json$`,
  );
  const runFiles = files.filter((name) => runName.test(name));
  const runs = [];
  for (const name of runFiles) {
    const report = await read(name);
    const payload = report.kind === 'run' ? report.run : report;
    const run = {
      ...payload,
      identity: report.identity,
      artifactHash: report.artifactHash,
      renderer: report.renderer,
      budgetColumn: report.budgetColumn,
      smoke: report.smoke,
      workload: payload.workload ?? report.workload,
    };
    if (run.identity.sourceHash !== manifest.sourceHash)
      failures.push(`${name}: source hash mismatch`);
    if (run.artifactHash !== manifest.artifactHash)
      failures.push(`${name}: artifact hash mismatch`);
    if (run.renderer !== renderer) failures.push(`${name}: renderer mismatch`);
    if (run.budgetColumn !== budgetColumn) failures.push(`${name}: budget column mismatch`);
    if (!(run.measuredRafSpanMs >= 120000) && !flags.has('--smoke'))
      failures.push(`${name}: measured span ${run.measuredRafSpanMs} ms below 120000 ms`);
    if (!(run.warmupElapsedMs >= 30000) && !flags.has('--smoke'))
      failures.push(`${name}: warmup ${run.warmupElapsedMs} ms below 30000 ms`);
    if (run.longTasks?.overflow) failures.push(`${name}: long-task overflow`);
    if (run.counts?.learningFailures > 0)
      failures.push(`${name}: ${run.counts.learningFailures} learning pipeline failures`);
    runs.push(run);
  }
  runs.sort((left, right) => left.repeat - right.repeat);
  const expected = flags.has('--smoke') ? 1 : 5;
  if (runs.length === 0 && flags.has('--smoke')) {
    notes.push(`${spec.id} not exercised by the smoke preflight`);
    continue;
  }
  if (runs.length !== expected)
    failures.push(`${spec.id}: ${runs.length} runs for ${renderer}, expected ${expected}`);
  if (new Set(runs.map((run) => run.repeat)).size !== runs.length)
    failures.push(`${spec.id}: duplicate repeat identities`);
  const interpreted = runs.map(interpret);
  const verdicts = runs.map((run) => ({
    repeat: run.repeat,
    failures: spec.normalGate ? evaluateRun(interpret(run)) : stressFindings(interpret(run)),
  }));
  const summaries = summarizeRepeats(
    runs.map((run) => ({
      frameP50Ms: run.frameMs?.p50 ?? null,
      frameP95Ms: run.frameMs?.p95 ?? null,
      frameP99Ms: run.frameMs?.p99 ?? null,
      mainThreadP95Ms: run.mainThreadMs?.p95 ?? null,
      authoritativeTickP95Ms: run.authoritativeTickMs?.p95 ?? null,
      rapierStepP95Ms: run.rapierStepMs?.p95 ?? null,
      gpuP95Ms: run.optionalGpuMs?.p95 ?? null,
      inputToCommandP95Ms: run.inputToCommandMs?.p95 ?? null,
      learningEndToEndP95Ms: run.learningEndToEndMs?.p95 ?? null,
    })),
  );
  const reproducibility = spec.normalGate
    ? reproducibilityFindings(summaries, budgets.repeatRelativeSpreadWarning)
    : [];
  if (!flags.has('--smoke') && verdicts.some((entry) => entry.failures.length))
    failures.push(`${spec.id}: budget failures retained in the report`);
  const acceptance = flags.has('--smoke')
    ? 'SMOKE_ONLY'
    : spec.normalGate
      ? verdicts.every((entry) => entry.failures.length === 0) && reproducibility.length === 0
        ? 'PASS'
        : 'FAIL'
      : verdicts.every((entry) => entry.failures.length === 0)
        ? 'STRESS_STRUCTURAL_PASS'
        : 'STRESS_STRUCTURAL_FAIL';
  report.workloads[spec.id] = {
    label: spec.label,
    stress: spec.stress,
    acceptance,
    verdicts,
    summaries,
    reproducibility,
    runs: interpreted,
    perRun: runs.map((run) => ({
      repeat: run.repeat,
      frameP95Ms: run.frameMs?.p95 ?? null,
      frameP99Ms: run.frameMs?.p99 ?? null,
      mainThreadP95Ms: run.mainThreadMs?.p95 ?? null,
      tickP95Ms: run.authoritativeTickMs?.p95 ?? null,
      rapierP95Ms: run.rapierStepMs?.p95 ?? null,
      gpuP95Ms: run.optionalGpuMs?.p95 ?? null,
      inputP95Ms: run.inputToCommandMs?.p95 ?? null,
      learningP95Ms: run.learningEndToEndMs?.p95 ?? null,
      ratio: run.simulatedToWallRatio,
      longTaskMaxMs: run.longTasks?.maxMs ?? null,
      heapBytes: run.memory?.pageHeapBytes ?? null,
      contacts: run.counts?.contacts ?? null,
      collisions: run.counts?.collisionEvents ?? null,
      learningSegments: run.counts?.learningSegments ?? null,
      framesOver35Ms: run.framesOver35Ms ?? null,
      framesOver50Ms: run.framesOver50Ms ?? null,
      phaseMs: run.phaseMs ?? null,
    })),
  };
}

/* The stress probe may never be the evidence for a normal V1 workload. */
if (!flags.has('--smoke')) {
  for (const id of ['scaling-20', 'normal-24', 'maximum-30'])
    if (!report.workloads[id]) failures.push(`Missing normal workload ${id}`);
  if (!report.workloads['overload-30-80']) failures.push('Missing separate stress workload');
}
if (report.workloads['overload-30-80']?.acceptance === 'PASS')
  failures.push('Stress workload must not be reported as a normal V1 pass');

const matrixFiles = files.filter((name) => new RegExp(`^${prefix}-matrix`).test(name));
if (matrixFiles.length !== 1 && !flags.has('--smoke')) failures.push('Missing matrix report');
else if (matrixFiles.length === 1) {
  const matrix = await read(matrixFiles[0]);
  for (const spec of FLEET_WORKLOADS)
    if (!Array.isArray(matrix.workloads?.[spec.id]) || matrix.workloads[spec.id].length !== 5)
      failures.push(`Matrix does not retain five ${spec.id} runs`);
}

report.valid = failures.length === 0;
report.variant = flags.has('--smoke') ? 'SMOKE' : 'FULL';
report.checkedAt = new Date().toISOString();
const output = resolve(
  directory,
  `${prefix}-independent-verification${flags.has('--smoke') ? '-smoke' : ''}.json`,
);
await writeFile(output, JSON.stringify(report, null, 2));
const summary = Object.entries(report.workloads).map(([id, workload]) => ({
  workload: id,
  acceptance: workload.acceptance,
  frameP95: workload.summaries.find((entry) => entry.metric === 'frameP95Ms')?.median ?? null,
  tickP95:
    workload.summaries.find((entry) => entry.metric === 'authoritativeTickP95Ms')?.median ?? null,
  rapierP95: workload.summaries.find((entry) => entry.metric === 'rapierStepP95Ms')?.median ?? null,
  inputP95:
    workload.summaries.find((entry) => entry.metric === 'inputToCommandP95Ms')?.median ?? null,
  learningP95:
    workload.summaries.find((entry) => entry.metric === 'learningEndToEndP95Ms')?.median ?? null,
  gpuP95: workload.summaries.find((entry) => entry.metric === 'gpuP95Ms')?.median ?? null,
  ratio: Math.min(...workload.runs.map((run) => run.simulationToWallRatio)),
  reproducibility: workload.reproducibility,
}));
console.log(
  JSON.stringify(
    { captureId, renderer, budgetColumn, valid: report.valid, failures, summary },
    null,
    2,
  ),
);
if (!report.valid) process.exitCode = 1;
