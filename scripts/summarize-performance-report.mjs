import { readFile } from 'node:fs/promises';
import { createPerformanceReport } from '../src/telemetry/performance.ts';

if (process.argv.length !== 3)
  throw new Error(
    'Usage: node --import ./scripts/register-typescript.mjs scripts/summarize-performance-report.mjs <report.json>',
  );
const source = JSON.parse(await readFile(process.argv[2], 'utf8'));
if (source.schemaVersion !== 1 || !Number.isFinite(Date.parse(source.capturedAt)))
  throw new Error('Invalid report version/capture');
const input = {
  role: source.role,
  identity: source.identity,
  scope: source.scope,
  coldLoad: source.coldLoad,
  warmLoad: source.warmLoad,
  runs: source.runs,
  unavailable: source.unavailable,
  exclusions: source.exclusions,
};
// The creation validator verifies bounded pairs/protocol and re-computes raw paired overhead.
const report = createPerformanceReport(input);
if (
  JSON.stringify(report.overhead) !== JSON.stringify(source.overhead) ||
  source.gameplayGate !== 'NOT_VALIDATED'
)
  throw new Error('Derived overhead/scope mismatch');
const range = (values) => {
  const sorted = values.toSorted((a, b) => a - b);
  return { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted.at(-1) };
};
const modes = [false, true].map((enabled) => {
  const runs = report.runs.filter((run) => run.enabled === enabled);
  const frame = runs.map((run) => run.referenceFrameMs?.p95).filter((value) => value !== undefined);
  return {
    enabled,
    repeats: runs.length,
    cpuP95Ms: range(runs.map((run) => run.referenceCpuMs.p95)),
    frameP95Ms: frame.length ? range(frame) : null,
    simulationRatio: range(
      runs.map((run) => run.simulation.ratio).filter((value) => value !== null),
    ),
    collectorOwnedBytes: range(runs.map((run) => run.collector.bufferBytes)),
    dropped: runs.reduce((sum, run) => sum + run.collector.dropped, 0),
  };
});
console.log(
  JSON.stringify(
    {
      schemaVersion: 1,
      capturedAt: source.capturedAt,
      identity: report.identity,
      role: report.role,
      scope: report.scope,
      gameplayGate: report.gameplayGate,
      validationTier: report.identity.fixtureVersion.endsWith('-DEV')
        ? 'DEVELOPMENT_ONLY'
        : report.identity.fixtureVersion.endsWith('-SMOKE')
          ? 'PREFLIGHT_ONLY'
          : 'FULL_PROTOCOL_REQUIRES_HARDWARE_VERIFIER',
      modes,
      pairedCpuP95OverheadMs: range(report.overhead.map((run) => run.cpuP95DeltaMs)),
      overhead: report.overhead,
      coldLoad: report.coldLoad,
      warmLoad: report.warmLoad,
      unavailable: report.unavailable,
      exclusions: report.exclusions,
    },
    null,
    2,
  ),
);
