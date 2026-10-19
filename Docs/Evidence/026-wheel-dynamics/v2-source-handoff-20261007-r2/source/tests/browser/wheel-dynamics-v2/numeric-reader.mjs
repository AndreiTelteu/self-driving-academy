/** SOURCE ONLY: strict offline reader, no native/browser execution and no automatic invocation. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { readPortableCapture } from './ledger.mjs';
export const BEFORE_SOURCE = '4f25789987ab81ad3bac1aa717ce11b351e9bb3860193e3772a199622e97d6e7';
export const AFTER_SOURCE = 'b696b02d00956797b91e1cad5bc53263f9e765047b506f7ff73030cb26f7901f';
export const NATIVE_HASH = '02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const need = (condition, label) => { if (!condition) throw new Error(label); };
const finite = (value, label) => { need(typeof value === 'number' && Number.isFinite(value), label); return value; };
const equal = (a, b, label) => need(JSON.stringify(a) === JSON.stringify(b), label);
const close = (a, b, label) => need(Math.abs(finite(a, label) - finite(b, label)) <= 1e-9 * Math.max(1, Math.abs(b)), label);
const pathInside = path => need(typeof path === 'string' && !path.includes('..') && !/^[\/]|:/.test(path), 'Unsafe source locator');
export function percentile(values, proportion) {
  need(Array.isArray(values) && values.length > 0 && values.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0), 'Missing/invalid raw values');
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * proportion) - 1];
}
const regression = (a, b, budget) => b - a > budget.p95AbsoluteIncreaseMs && b > a * (1 + budget.p95RelativeIncrease);
function clean(life, label) {
  need(life && life.closed === true && life.failed === false && life.pending === false && life.overflow === 0 && life.causeOverflow === 0 && life.lateCount === 0 && Array.isArray(life.causes) && life.causes.length === 0, `${label}: lifecycle failure`);
}
function nativeClean(value, label) {
  need(value?.bodies?.entities === 0 && value.bodies.subscriptions === 0 && value?.collisions?.colliders === 0 && value.collisions.disposed === true, `${label}: native cleanup`);
}
export async function readNative(directory, phase, expectedSource) {
  const reportBytes = await readFile(resolve(directory, 'node.json'));
  need(hash(reportBytes) === (phase === 'before' ? 'a4631d4add9b2bf6eab8b7a791164302bfb7aa86ab68aad8c9213873477ddbaf' :
    '859e93a2141bbd2e3cda6b156dc73e9a8344ae501447e7c3f42ca2195b73e241'), 'Original immutable native report bytes changed');
  const report = JSON.parse(reportBytes);
  need(report.phase === phase && report.fixture === '026-many-contact-projection-v1' && report.sourceHash === expectedSource, 'Native original provenance');
  need(Array.isArray(report.inputs) && report.inputs.length > 0 && new Set(report.inputs.map(x => x.path)).size === report.inputs.length, 'Native input manifest');
  const source = createHash('sha256');
  for (const item of report.inputs) {
    pathInside(item.path);
    const bytes = await readFile(resolve(directory, 'source', item.path));
    need(bytes.length === item.bytes && hash(bytes) === item.sha256, 'Native archived source tamper');
    source.update(item.path).update(bytes);
  }
  need(source.digest('hex') === expectedSource, 'Native aggregate source hash');
  const bytes = await readFile(resolve(directory, 'rapier-native-artifact.mjs'));
  need(bytes.length === report.native.bytes && bytes.length === 4340292 && hash(bytes) === report.native.sha256 && report.native.sha256 === NATIVE_HASH, 'Native artifact hash/count');
  need(report.runs?.length === 10, 'Native ten arms missing');
  for (let i = 0; i < 10; i++) {
    const run = report.runs[i], pair = Math.floor(i / 2);
    need(run.pair === pair && run.observe === (pair % 2 ? i % 2 === 0 : i % 2 === 1) && run.warmupTicks === 180 && run.measuredTicks === 600, 'Native order/ticks');
    equal(run.physics, { vehicles: 70, bodies: 134, colliders: 138 }, 'Native workload');
    nativeClean(run.cleanup, 'native'); need(run.cleanup.disposedReadRejected === true, 'Disposed native access');
    need(run.sampleBytes === (run.observe ? 33600 : 0), 'Native seven-channel600 sample capacity');
    need(/^[a-f0-9]{64}$/.test(run.inputHash) && /^[a-f0-9]{64}$/.test(run.physicalHash), 'Native parity hashes missing');
    for (const metric of Object.values(run.metrics)) for (const value of Object.values(metric))
      run.observe ? finite(value, 'Native measured percentile') : need(value === null, 'Unobserved native timing must be null');
  }
  return report;
}
export function verifyNativeParity(before, after, budgets) {
  const confirmations = { tick: 0, projection: 0 };
  for (let i = 0; i < 10; i++) {
    const a = before.runs[i], b = after.runs[i];
    need(a.inputHash === b.inputHash && a.physicalHash === b.physicalHash && a.pair === b.pair && a.observe === b.observe, 'Original native parity changed');
    if (b.observe) for (const key of Object.keys(confirmations)) {
      const av = finite(a.metrics[key].p95, key), bv = finite(b.metrics[key].p95, key);
      if (regression(av, bv, budgets.regressionProposal)) confirmations[key]++;
      if (key === 'tick') need(bv <= budgets.proposedBudgets.desktop.authoritativeTickP95Ms, 'Native tick absolute budget');
    }
  }
  for (const count of Object.values(confirmations)) need(count < budgets.regressionProposal.confirmationsOutOfFive, 'Confirmed original native regression');
  return { confirmations, rawNativeTimings: 'NOT_ARCHIVED_BY_ORIGINAL_PROTOCOL', originalBaseline: BEFORE_SOURCE };
}
function validateCalibration(calibration) {
  need(Array.isArray(calibration) && calibration.length === 8, 'Eight20m/s browser calibration records required');
  for (const classId of ['sedan', 'compact']) {
    const get = (surface, scenario) => {
      const matches = calibration.filter(x => x.classId === classId && x.surface === surface && x.scenario === scenario && x.speedMps === 20);
      need(matches.length === 1, 'Calibration identity duplicate/missing'); return matches[0];
    };
    for (const surface of ['dry-asphalt', 'reduced-adhesion']) for (const scenario of ['braking', 'turning']) {
      const value = get(surface, scenario);
      need(value.geometricRadiusM === 17 && value.mechanics?.surface?.id === surface, 'Original calibration formula/material');
      need(value.curve?.length > 0 && value.curve.length <= (scenario === 'braking' ? 300 : 30), 'Calibration curve bounds');
      need(value.curve.every(point => point.wheels?.length === 4 && point.wheels.every(wheel => Number.isFinite(wheel.suspensionLengthM))), 'Physical wheel suspension data');
      finite(value.maxWheelLateralMps, 'Actual wheel lateral velocity'); finite(value.brakingDistanceM, 'Actual stopping distance');
      clean(value.lifetime, 'calibration'); nativeClean(value.readbacks?.['native-resources'], 'calibration');
    }
    const dry = get('dry-asphalt', 'braking'), reduced = get('reduced-adhesion', 'braking');
    need(dry.stopped === true && reduced.stopped === true && reduced.brakingDistanceM > dry.brakingDistanceM * 1.1 && reduced.mechanics.grip < dry.mechanics.grip, 'Original stopping/grip gate');
  }
}
export function verifyCaptureNumbers(capture, budgets) {
  need(capture.state !== 'INCOMPLETE', 'INCOMPLETE: full protocol unavailable');
  const report = capture.terminal.dto.report, binding = capture.start.binding;
  need(capture.terminal.dto.state === 'CAPTURE_COMPLETE' && binding.mode === 'full', 'Diagnostic/smoke cannot satisfy acceptance');
  need(report.renderer === capture.backend.dto.renderer && ['WEBGPU', 'WEBGL2'].includes(report.renderer), 'Actual backend binding');
  need(report.identity.sourceHash === binding.sourceHash && report.identity.budgetVersion === budgets.budgetVersion, 'Report source/budget mismatch');
  need(report.dpr === 1, 'DPR'); equal(report.cssResolution, [1920, 1080], 'CSS resolution'); equal(report.internalResolution, [1920, 1080], 'Internal resolution');
  need(!/swiftshader|llvmpipe|software rasterizer/i.test(JSON.stringify(report.actualGpuInfo)), 'Software renderer cannot satisfy hardware');
  clean(capture.terminal.dto.lifetime, 'terminal');
  const journal = capture.terminal.dto.lifetime.journal;
  need(Array.isArray(journal) && journal.length <= 4096 && journal.some(event => event.kind === 'journal-start') && journal.some(event => event.kind === 'focus-poll'), 'Bounded actual browser continuity journal');
  for (const event of journal) {
    need(Number.isFinite(event.at) && !['blur','freeze','pagehide','webglcontextlost','webgpu-device-lost'].includes(event.kind) &&
      event.focused === true && event.hidden === false && event.connected === true && event.visibility === 'visible', 'Recorded JS continuity loss');
  }
  need(capture.terminal.dto.readbacks?.surface?.connected === false && capture.terminal.dto.readbacks?.backend?.sceneDisposed === true &&
    capture.terminal.dto.readbacks?.engine?.engineDisposed === true, 'Backend/surface/engine cleanup');
  need(capture.late?.length === 0, 'Supplemental late callback invalidates completed protocol');
  const confirmations = { frame: 0, main: 0, trackedJsHeap: 0 }, recomputed = [];
  const cap = budgets.proposedBudgets.desktop;
  for (let index = 0; index < 10; index++) {
    const raw = capture.raw.find(x => x.dto.armIndex === index)?.dto, run = report.runs[index], pair = Math.floor(index / 2);
    need(raw && raw.pair === pair && run.pair === pair && raw.current === run.current && run.current === (pair % 2 ? index % 2 === 0 : index % 2 === 1), 'Alternating ten-arm order');
    need(run.warmupSeconds === 30 && run.measuredSeconds === 120 && run.activeSeconds >= 150, 'Original full durations');
    need(raw.frames === run.frames && raw.ticks === run.ticks && raw.frames > 0 && raw.ticks > 0 && raw.frames <= 30000 && raw.ticks <= 30000, 'Raw arm counts');
    need(run.overloadCount === 0 && finite(run.maxDebtMs, 'Actual debt') <= 250 && finite(run.maxSteps, 'Actual catchup') <= 4, 'Debt/max4 gate');
    equal(run.gates, { fixedDtSeconds: 1 / 60, maxCatchupSteps: 4, overloadDebtMs: 250, simulationMinimum: 0.98 }, 'Original fixed-tick gates');
    const ratio = raw.ticks / 60 / (run.activeSeconds - 30);
    close(run.simulationToActiveWallTime, ratio, 'Raw simulation/wall ratio'); need(ratio >= budgets.proposedBudgets.simulationToActiveWallTimeMinimum, 'Simulation throughput .98');
    equal(run.physics, { vehicles: 70, bodies: 134, colliders: 138 }, 'Original70/64/3 workload');
    clean(raw.lifetime, 'arm'); nativeClean(raw.readbacks?.['native-resources'], 'arm');
    const scheduling = raw.lifetime.scheduling;
    need(scheduling?.requests === scheduling.callbacks && scheduling.callbacks === scheduling.continuations && scheduling.callbacks >= raw.frames && scheduling.maxCallbackDelayMs <= 250 && scheduling.maxContinuationDelayMs <= 250, 'Actual RAF ENTRY/continuation counters');
    need(raw.lifetime.boundaries?.['native-exit']?.counters?.nativeCount === raw.lifetime.boundaries?.['render-exit']?.counters?.nativeCount && raw.lifetime.boundaries['render-exit'].counters.renderCount >= raw.frames, 'Native/render boundary counts');
    const trigger = raw.lifetime.lastTrigger;
    need(trigger && trigger.callbackEntryMs >= trigger.requestEntryMs && trigger.continuationEntryMs >= trigger.callbackEntryMs &&
      trigger.callbackEntryMs - trigger.requestEntryMs <= 250 && trigger.continuationEntryMs - trigger.requestEntryMs <= 250, 'Actual callback/continuation ENTRY clocks');
    for (const key of ['nativeCount','renderCount']) need(trigger.requestCounters[key] === trigger.callbackCounters[key] &&
      trigger.callbackCounters[key] === trigger.continuationCounters[key], 'No native/render work inside scheduling callback');
    const end = raw.lifetime.boundaries['render-exit'].counters;
    need(end.nativeCount - trigger.continuationCounters.nativeCount >= 0 && end.nativeCount - trigger.continuationCounters.nativeCount <= 4 &&
      end.renderCount - trigger.continuationCounters.renderCount === 1, 'Last actual frame native/render advancement');
    const stats = {};
    equal(Object.keys(raw.channels).sort(), ['frame','main','projection','step','tick'], 'Raw five channels');
    for (const [key, values] of Object.entries(raw.channels)) {
      need(values.length === (['tick','step'].includes(key) ? raw.ticks : raw.frames), 'Raw channel sample count');
      const actual = { count: values.length, p50: percentile(values, .5), p95: percentile(values, .95), p99: percentile(values, .99), max: Math.max(...values) };
      for (const [field, value] of Object.entries(actual)) close(run.stats[key][field], value, `Recomputed ${key}.${field}`);
      stats[key] = actual;
    }
    need(stats.frame.p95 <= cap.frameP95Ms && stats.frame.p99 <= cap.frameP99Ms && stats.main.p95 <= cap.mainThreadP95Ms && stats.tick.p95 <= cap.authoritativeTickP95Ms && stats.step.p95 <= cap.rapierStepP95Ms, 'Absolute frame/main/tick/step budget');
    need(raw.longTaskEntries.length <= 4096, 'LongTask bounded');
    const tasks = raw.longTaskEntries.filter(entry => finite(entry.startTime, 'LongTask start') + finite(entry.duration, 'LongTask duration') > run.measurementStartMs && entry.startTime <= run.measurementEndMs);
    if (run.longTasks.supported) {
      need(tasks.length === run.longTasks.count, 'LongTask takeRecords count');
      close(run.longTasks.maxMs, Math.max(0, ...tasks.map(x => x.duration)), 'LongTask max');
      need(run.longTasks.maxMs <= budgets.proposedBudgets.normalSteadyStateApplicationLongTaskMaximumMs, 'LongTask budget');
    } else need(raw.longTaskEntries.length === 0, 'Unsupported LongTask data');
    need(run.memory.worlds === 1 && run.memory.retainedWheelHistory === 0 && run.memory.wheelMeshes === 280 && run.memory.chassisMeshes === 70 && run.sampleBytes === 30000 * 8 * 5, 'Original resource capacity');
    if (run.gpuP95Ms !== null) need(finite(run.gpuP95Ms, 'GPU') <= cap.gpuP95Ms, 'Available GPU budget');
    for (const key of ['exactPageHeapBytes','exactWasmBytes']) if (run.memory[key] !== null) finite(run.memory[key], key);
    for (const key of ['trackedJsHeapStartBytes','trackedJsHeapEndBytes']) if (run.memory[key] !== null) need(finite(run.memory[key], key) >= 0, 'Available tracked JS memory');
    recomputed.push(stats);
  }
  for (let pair = 0; pair < 5; pair++) {
    const a = report.runs.find(x => x.pair === pair && !x.current), b = report.runs.find(x => x.pair === pair && x.current);
    for (const metric of ['frame','main']) if (regression(a.stats[metric].p95, b.stats[metric].p95, budgets.regressionProposal)) confirmations[metric]++;
    const av = a.memory.trackedJsHeapEndBytes, bv = b.memory.trackedJsHeapEndBytes;
    if (av !== null && bv !== null && bv - av > budgets.regressionProposal.memoryAbsoluteIncreaseBytes && bv > av * (1 + budgets.regressionProposal.memoryRelativeIncrease)) confirmations.trackedJsHeap++;
  }
  for (const count of Object.values(confirmations)) need(count < budgets.regressionProposal.confirmationsOutOfFive, 'Confirmed original hardware/memory regression');
  validateCalibration(report.calibration);
  return { renderer: report.renderer, confirmations, recomputed, numericState: 'NUMERIC_PASS', scope: 'Early026 fixture only; optional exactRAM/WASM/GPU may be unmeasured; physical driving/foreground and instrumentation review remain separate' };
}
/** Prior failed legacy reports stay FAIL/INCOMPLETE; no source-current mismatch can erase history. */
export function classifyLegacy(report) {
  if (report?.error || report?.failure || report?.state === 'FAILED' || report?.diagnostic?.overloadCount > 0) return { state: 'FAIL', reason: 'Historical recorded failure' };
  return { state: 'INCOMPLETE', reason: 'Legacy lacks bound raw ten-arm protocol; no retroactive PASS' };
}
export async function verifySuite({ webgpu, webgl2, beforeDirectory, afterDirectory, calibrationPath, budgetPath, currentSourceHash }) {
  try {
    need(/^[a-f0-9]{64}$/.test(currentSourceHash), 'Explicit current source identity required for historical/current distinction');
    const budgets = JSON.parse(await readFile(budgetPath, 'utf8'));
    need(budgets.budgetVersion === '203-initial-1' && budgets.regressionProposal.p95RelativeIncrease === .1 && budgets.regressionProposal.p95AbsoluteIncreaseMs === 1 && budgets.regressionProposal.confirmationsOutOfFive === 3, 'Original budget revision/formula');
    const before = await readNative(beforeDirectory, 'before', BEFORE_SOURCE), after = await readNative(afterDirectory, 'after', AFTER_SOURCE);
    const calibrationBytes = await readFile(calibrationPath);
    need(hash(calibrationBytes) === 'd8f7d9022f00d26399baba91ee9591132ac89d818c1c4711108c243e06b47e6c', 'Original28-scenario calibration bytes changed');
    const originalCalibration = JSON.parse(calibrationBytes);
    need(originalCalibration.fixture === '026-flat-surfaces-calibration-v1' && originalCalibration.runs.length === 28, 'Original28 scenarios');
    for (const classId of ['sedan','compact']) {
      const get = (surface,speed,scenario) => originalCalibration.runs.find(x => x.classId === classId && x.surface === surface && x.speedMps === speed && x.scenario === scenario);
      for (const speed of [10,20,30]) {
        const dry = get('dry-asphalt',speed,'braking'), reduced = get('reduced-adhesion',speed,'braking');
        need(dry?.stopped && reduced?.stopped && reduced.brakingDistanceM > dry.brakingDistanceM * 1.1, 'Original stopping speed/material gate');
      }
      need(get('dry-asphalt',20,'turning').maxWheelLateralMps > get('dry-asphalt',8,'turning').maxWheelLateralMps + .5, 'Original high-speed slip gate');
      for (const surface of ['dry-asphalt','reduced-adhesion']) {
        const airborne = get(surface,10,'airborne');
        need(airborne.minContacts === 0 && airborne.maxContacts === 4 && airborne.curve.every(point => point.wheels.every(wheel => Number.isFinite(wheel.suspensionLengthM))), 'Original airborne suspension/recontact');
      }
    }
    const native = verifyNativeParity(before, after, budgets), captures = [];
    for (const [directory, renderer] of [[webgpu,'WEBGPU'],[webgl2,'WEBGL2']]) {
      const capture = await readPortableCapture(directory);
      need(capture.backend?.dto.renderer === renderer, 'BOTH actual native browser backends required');
      need(capture.start.binding.native.sha256 === NATIVE_HASH && capture.start.binding.native.bytes === 4340292, 'Browser native original artifact binding');
      captures.push({ ...verifyCaptureNumbers(capture, budgets), sourceClass: capture.start.binding.sourceHash === currentSourceHash ? 'CURRENT_SOURCE' : 'HISTORICAL_SOURCE' });
    }
    need(captures[0].sourceClass === captures[1].sourceClass, 'Mixed current/historical source');
    const a = (await readPortableCapture(webgpu)).start.binding, b = (await readPortableCapture(webgl2)).start.binding;
    need(a.sourceHash === b.sourceHash && a.artifactHash === b.artifactHash, 'BOTH backend source/artifact identity');
    return { state: 'NUMERIC_PASS', native, captures, hardwareAcceptance: 'REQUIRES_PARENT_PHYSICAL_FOREGROUND_DRIVING_AND_INSTRUMENTATION_REVIEW' };
  } catch (error) { return { state: /INCOMPLETE|ENOENT/.test(String(error)) ? 'INCOMPLETE' : 'FAIL', reason: String(error) }; }
}
