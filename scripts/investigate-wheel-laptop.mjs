import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readPortableCapture } from '../tests/browser/wheel-dynamics-v2/ledger.mjs';

const directory =
  'Docs/Evidence/026-wheel-dynamics/laptop-20261011-browser/0a218d84-545b-40c2-a80d-f03049ec620f';
const capture = await readPortableCapture(directory);
const findings = [];
for (const [armIndex, run] of capture.terminal.dto.report.runs.entries()) {
  const raw = capture.raw.find((row) => row.dto.armIndex === armIndex).dto;
  const firstRaf = run.measurementEndMs - run.activeSeconds * 1000;
  const rafs = new Array(raw.channels.frame.length);
  let now = run.measurementEndMs;
  for (let i = rafs.length - 1; i >= 0; i--) {
    rafs[i] = now;
    now -= raw.channels.frame[i];
  }
  const tickAt = (raf) => Math.floor((raf - firstRaf + 1e-7) / (1000 / 60));
  let previousTick = tickAt(now),
    tickIndex = 0,
    maxSteps = 0;
  const frames = rafs.map((raf, index) => {
    const nextTick = tickAt(raf);
    const steps = nextTick - previousTick;
    if (steps < 0 || steps > 4) throw new Error('Clock reconstruction incompatible');
    const ticks = raw.channels.tick.slice(tickIndex, tickIndex + steps);
    const solver = raw.channels.step.slice(tickIndex, tickIndex + steps);
    const tickCpuMs = ticks.reduce((sum, value) => sum + value, 0);
    const solverCpuMs = solver.reduce((sum, value) => sum + value, 0);
    const mainMs = raw.channels.main[index],
      projectionMs = raw.channels.projection[index];
    const row = {
      index,
      rafMs: raf,
      frameMs: raw.channels.frame[index],
      steps,
      tickIndex,
      ticks,
      solver,
      mainMs,
      projectionMs,
      tickCpuMs,
      solverCpuMs,
      tickOutsideSolverMs: tickCpuMs - solverCpuMs,
      remainingMainMs: mainMs - tickCpuMs - projectionMs,
    };
    tickIndex += steps;
    previousTick = nextTick;
    maxSteps = Math.max(maxSteps, steps);
    return row;
  });
  if (
    tickIndex !== run.ticks ||
    maxSteps !== run.maxSteps ||
    frames.some((row) => row.remainingMainMs < -0.001)
  )
    throw new Error(`Reconstruction mismatch arm ${armIndex}`);
  const tasks = raw.longTaskEntries.filter(
    (entry) =>
      entry.startTime + entry.duration > run.measurementStartMs &&
      entry.startTime <= run.measurementEndMs,
  );
  findings.push({
    armIndex,
    current: run.current,
    validatedTickCount: tickIndex,
    validatedMaxSteps: maxSteps,
    tasks: tasks.map((task) => ({
      task,
      nearbyFrames: frames.filter(
        (row) =>
          row.rafMs >= task.startTime - 100 && row.rafMs <= task.startTime + task.duration + 100,
      ),
    })),
  });
}
const result = {
  state: 'OFFLINE_DIAGNOSTIC_ONLY_ACCEPTANCE_UNCHANGED',
  createdAt: new Date().toISOString(),
  captureId: '0a218d84-545b-40c2-a80d-f03049ec620f',
  terminalSha256: createHash('sha256')
    .update(await readFile(`${directory}/terminal.json`))
    .digest('hex'),
  method:
    'Reverse cumulative raw frame intervals from final RAF; infer fixed 60 Hz ticks from first RAF, retaining every interval. Validate tick count, maximum steps and nonnegative remaining main for all ten arms.',
  limitations:
    'RAF timestamps are reconstructed, not CPU callback entry timestamps. Remaining main includes render, loop, boundaries and other work; it is not an isolated GPU timer. Controller/query/bridge and GC/OS/driver attribution are unavailable in this capture.',
  findings,
};
await writeFile(
  'Docs/Evidence/026-wheel-dynamics/laptop-20261011-stall-investigation.json',
  JSON.stringify(result, null, 2) + '\n',
  { flag: 'wx' },
);
console.log(JSON.stringify(result, null, 2));
