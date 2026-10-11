import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, verifyFrozenArchive } from './wheel-capture-source.mjs';
import { readPortableCapture } from '../tests/browser/wheel-dynamics-v2/ledger.mjs';
import {
  readCurrentNative,
  verifyCaptureNumbers,
  percentile,
} from '../tests/browser/wheel-dynamics-v2/numeric-reader.mjs';

const root = 'Docs/Evidence/026-wheel-dynamics';
const budget = JSON.parse(await readFile('Docs/performance-budgets.json'));
const native = JSON.parse(await readFile(`${root}/laptop-20261011-native-01/summary.json`));
for (const item of native.binding.inputs) {
  const bytes = await readFile(`${root}/laptop-20261011-native-01/source/${item.path}`);
  if (bytes.length !== item.bytes || digest(bytes) !== item.sha256)
    throw new Error('Native archive drift');
  if (item.path.startsWith('src/') && digest(await readFile(item.path)) !== item.sha256)
    throw new Error('Measured native production drift');
}
const currentNative = await readCurrentNative();
const captures = [];
for (const [renderer, id] of [
  ['WEBGL2', 'd7406c27-54c6-49ec-ba5b-01dc724c8ecb'],
  ['WEBGPU', '0a218d84-545b-40c2-a80d-f03049ec620f'],
]) {
  const directory = `${root}/laptop-20261011-browser/${id}`;
  const capture = await readPortableCapture(directory);
  const binding = capture.start.binding;
  const archive = resolve(directory, '..', binding.archive);
  const manifest = JSON.parse(await readFile(`${archive}/build-manifest.json`));
  await verifyFrozenArchive({
    inputs: manifest.inputs,
    sourceHash: manifest.sourceHash,
    artifacts: manifest.artifacts,
    root: `${archive}/build`,
    archive,
    native: {
      ...currentNative.after.native,
      resolvedPath: fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat')),
    },
  });
  if (
    capture.backend.dto.renderer !== renderer ||
    capture.terminal.dto.report.runs.length !== 10 ||
    capture.raw.length !== 10 ||
    capture.terminal.dto.report.calibration.length !== 8
  )
    throw new Error('Incomplete laptop baseline');
  let verification;
  try {
    verification = verifyCaptureNumbers(capture, budget, 'laptop');
  } catch (error) {
    verification = { numericState: 'FAIL', reason: String(error) };
  }
  const report = capture.terminal.dto.report;
  const rows = report.runs.map((run, index) => {
    const raw = capture.raw.find((row) => row.dto.armIndex === index).dto;
    for (const key of ['frame', 'main', 'tick', 'projection', 'step']) {
      if (percentile(raw.channels[key], 0.95) !== run.stats[key].p95)
        throw new Error('Raw percentile mismatch');
    }
    if (!run.startup || run.startup.physicsSteps !== 0 || run.startup.renderCpuMs.length !== 30)
      throw new Error('First-use phase missing');
    return {
      pair: run.pair,
      current: run.current,
      frameP95Ms: run.stats.frame.p95,
      frameP99Ms: run.stats.frame.p99,
      mainP95Ms: run.stats.main.p95,
      tickP95Ms: run.stats.tick.p95,
      stepP95Ms: run.stats.step.p95,
      projectionP95Ms: run.stats.projection.p95,
      simulationRatio: run.simulationToActiveWallTime,
      longTasks: run.longTasks,
      startup: run.startup,
    };
  });
  const taskEvidence = report.runs.flatMap((run, index) => {
    const raw = capture.raw.find((row) => row.dto.armIndex === index).dto;
    return raw.longTaskEntries
      .filter(
        (entry) =>
          entry.startTime + entry.duration > run.measurementStartMs &&
          entry.startTime <= run.measurementEndMs,
      )
      .map((entry) => ({
        armIndex: index,
        pair: run.pair,
        current: run.current,
        ...entry,
        mainMaxMs: run.stats.main.max,
        tickMaxMs: run.stats.tick.max,
        stepMaxMs: run.stats.step.max,
        projectionMaxMs: run.stats.projection.max,
        frameMaxMs: run.stats.frame.max,
      }));
  });
  captures.push({
    renderer,
    id,
    sourceHash: binding.sourceHash,
    artifactHash: binding.artifactHash,
    terminalHash: digest(await readFile(`${directory}/terminal.json`)),
    verification,
    rows,
    taskEvidence,
    hardware: JSON.parse(await readFile(`${archive}/hardware.json`)),
    actualGpu: report.actualGpuInfo,
    resolution: report.internalResolution,
    dpr: report.dpr,
    cleanup: capture.terminal.dto.readbacks,
  });
}
if (
  captures[0].sourceHash !== captures[1].sourceHash ||
  captures[0].artifactHash !== captures[1].artifactHash
)
  throw new Error('Mixed browser build');
const summary = {
  state: 'LAPTOP_BASELINE_CAPTURED_ACCEPTANCE_BLOCKED',
  createdAt: new Date().toISOString(),
  historyCommit: 'bf37fd9',
  hardware: JSON.parse(await readFile(`${root}/laptop-20261011-hardware.json`)),
  native: { state: native.state, sourceHash: native.binding.sourceHash, pairs: native.pairs },
  budgets: {
    version: budget.budgetVersion,
    class: 'laptop',
    limits: budget.proposedBudgets.laptop,
    longTaskMaximumMs: budget.proposedBudgets.normalSteadyStateApplicationLongTaskMaximumMs,
  },
  captures,
  checks: {
    wheelOwnershipTransportTests: '21/21 PASS',
    numericAndSourceTests: '15 PASS, 1 pre-existing skip',
    typecheckAppAndTests: 'PASS',
    scopedLint: 'PASS',
    architecture: 'PASS',
  },
  limitations: [
    'WebGPU strict LongTask gate failed: 51ms in archived BEFORE arm8; cause unproven, no threshold waiver or identical retry.',
    'Native CPU and early70-car fixed-mesh fixture only; final-game LOW preset, GPU timer, exact total/native RAM, controlled cold navigation and release remain unvalidated.',
    'Runtime implementation remains isolated in wheel-dynamics-01; PBI026 remains In Progress, pending hardware gate and final integration.',
  ],
  nextStep:
    'Inspect a targeted WebGPU trace around the BEFORE frame (main49.3ms/tick22.9ms/step12ms) before selecting an optimization or justified new full capture. Retain WebGL2 PASS and every incomplete capture unchanged.',
};
await writeFile(`${root}/laptop-20261011-summary.json`, JSON.stringify(summary, null, 2), {
  flag: 'wx',
});
console.log(
  JSON.stringify({
    state: summary.state,
    captures: captures.map(({ renderer, verification }) => ({
      renderer,
      verification: verification.numericState,
      reason: verification.reason,
    })),
    path: `${root}/laptop-20261011-summary.json`,
  }),
);
