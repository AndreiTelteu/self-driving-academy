import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readPortableCapture } from '../tests/browser/wheel-dynamics-v2/ledger.mjs';

const id = '91e876ed-d3c9-4873-83ed-51db3027903d';
const directory = `Docs/Evidence/026-wheel-dynamics/laptop-20261011-browser/${id}`;
const capture = await readPortableCapture(directory);
const arms = capture.raw.map(({ dto }) => {
  const trace = dto.diagnosticTrace;
  if (!trace || trace.values.length !== trace.frames * trace.columns.length)
    throw new Error('Trace shape mismatch');
  const rows = Array.from({ length: trace.frames }, (_, index) => {
    const row = Object.fromEntries(
      trace.columns.map((key, column) => [
        key,
        trace.values[index * trace.columns.length + column],
      ]),
    );
    if (!Object.values(row).every(Number.isFinite) || row.steps > 4 || row.cpuEnd < row.cpuStart)
      throw new Error('Invalid stage values');
    row.mainMs = row.cpuEnd - row.cpuStart;
    row.rafToCpuMs = row.cpuStart - row.raf;
    row.remainingMainMs = row.mainMs - row.tick - row.projection - row.render;
    if (row.remainingMainMs < -0.5) throw new Error('Stage conservation failed');
    return row;
  });
  return {
    armIndex: dto.armIndex,
    current: dto.current,
    traceFrames: trace.frames,
    allocatedBytes: trace.allocatedBytes,
    completed: !dto.lifetime.failed,
    maxima: Object.fromEntries(
      [
        'mainMs',
        'rafToCpuMs',
        'tick',
        'controller',
        'solver',
        'query',
        'bridge',
        'projection',
        'render',
      ].map((key) => [key, Math.max(...rows.map((row) => row[key]))]),
    ),
    slowFrames: rows.filter((row) => row.mainMs > 30 || row.rafToCpuMs > 50),
    longTasks: dto.longTaskEntries.map((task) => ({
      ...task,
      overlappingFrameCpu: rows
        .filter(
          (row) => row.cpuStart < task.startTime + task.duration && row.cpuEnd > task.startTime,
        )
        .map((row) => ({
          raf: row.raf,
          cpuStart: row.cpuStart,
          cpuEnd: row.cpuEnd,
          measuring: row.measuring,
        })),
    })),
    cleanup: dto.readbacks,
  };
});
const summary = {
  state: 'DIAGNOSTIC_INCOMPLETE_OVERLOAD_NO_ACCEPTANCE',
  captureId: id,
  createdAt: new Date().toISOString(),
  binding: capture.start.binding,
  terminalSha256: createHash('sha256')
    .update(await readFile(`${directory}/terminal.json`))
    .digest('hex'),
  protocol: '3 alternating pairs, 15s warmup/30s measure; instrumented DEV; stopped at arm3',
  preflight:
    '04a41a52-7822-4b0a-8aaa-bdbdac83ad7d: 10 arms, trace/export/readback/cleanup verified',
  earlierPreflightFailure:
    '69c36d6c-4aad-4bd7-b67d-f6234795af45: first authoritative RAF watchdog before tick0; retained',
  completedArms: capture.terminal.dto.completedArms.length,
  failedArm: capture.terminal.dto.failedArm,
  arms,
  conclusion:
    '129ms Long Task at412929.8 has no overlap with recorded arm CPU intervals. Subsequent frame starts lag RAF by140.6ms and130ms; 4-step catchup cannot drain debt before overload. Separate warmup55ms task overlaps bridge34.7ms. Attribution to script/GC/driver/OS remains unavailable.',
  limitations:
    'CPU elapsed measurements include scheduling/GC. Render is CPU submission, not GPU duration. Diagnostic overhead is included; no full acceptance or baseline replacement.',
};
await writeFile(
  'Docs/Evidence/026-wheel-dynamics/laptop-20261011-stage-trace-summary.json',
  JSON.stringify(summary, null, 2) + '\n',
  { flag: 'wx' },
);
console.log(
  JSON.stringify(
    {
      state: summary.state,
      completedArms: summary.completedArms,
      arms: arms.map(({ armIndex, maxima }) => ({ armIndex, maxima })),
    },
    null,
    2,
  ),
);
