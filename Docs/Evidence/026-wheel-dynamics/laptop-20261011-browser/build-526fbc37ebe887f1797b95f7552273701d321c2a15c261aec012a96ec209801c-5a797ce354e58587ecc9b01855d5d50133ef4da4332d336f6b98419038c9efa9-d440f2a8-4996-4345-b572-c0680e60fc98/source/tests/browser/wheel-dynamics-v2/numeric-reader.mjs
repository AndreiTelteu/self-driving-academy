/** SOURCE ONLY: strict offline reader, no native/browser execution and no automatic invocation. */
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readPortableCapture } from './ledger.mjs';
import { requireCurrentPins } from './current-native-reference.mjs';
import { localClosure } from '../../../scripts/wheel-capture-source.mjs';
export const BEFORE_SOURCE = '4f25789987ab81ad3bac1aa717ce11b351e9bb3860193e3772a199622e97d6e7';
export const AFTER_SOURCE = 'b696b02d00956797b91e1cad5bc53263f9e765047b506f7ff73030cb26f7901f';
export const NATIVE_HASH = '02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const need = (condition, label) => {
  if (!condition) throw new Error(label);
};
const finite = (value, label) => {
  need(typeof value === 'number' && Number.isFinite(value), label);
  return value;
};
const equal = (a, b, label) => need(JSON.stringify(a) === JSON.stringify(b), label);
const close = (a, b, label) =>
  need(Math.abs(finite(a, label) - finite(b, label)) <= 1e-9 * Math.max(1, Math.abs(b)), label);
const pathInside = (path) =>
  need(
    typeof path === 'string' &&
      !path.includes('..') &&
      !path.startsWith('/') &&
      !path.startsWith('\\') &&
      !path.includes(':'),
    'Unsafe source locator',
  );
export function percentile(values, proportion) {
  need(
    Array.isArray(values) &&
      values.length > 0 &&
      values.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0),
    'Missing/invalid raw values',
  );
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * proportion) - 1];
}
const regression = (a, b, budget) =>
  b - a > budget.p95AbsoluteIncreaseMs && b > a * (1 + budget.p95RelativeIncrease);
function clean(life, label) {
  need(
    life &&
      life.closed === true &&
      life.failed === false &&
      life.pending === false &&
      life.overflow === 0 &&
      life.causeOverflow === 0 &&
      life.lateCount === 0 &&
      Array.isArray(life.causes) &&
      life.causes.length === 0,
    `${label}: lifecycle failure`,
  );
}
function nativeClean(value, label) {
  need(
    value?.bodies?.entities === 0 &&
      value.bodies.subscriptions === 0 &&
      value?.collisions?.colliders === 0 &&
      value.collisions.disposed === true,
    `${label}: native cleanup`,
  );
}
export async function readNative(directory, phase, expectedSource, proposal = {}) {
  const reportBytes = await readFile(resolve(directory, 'node.json'));
  if (!proposal.freshCapture)
    need(
      hash(reportBytes) ===
        (phase === 'before'
          ? 'a4631d4add9b2bf6eab8b7a791164302bfb7aa86ab68aad8c9213873477ddbaf'
          : '859e93a2141bbd2e3cda6b156dc73e9a8344ae501447e7c3f42ca2195b73e241'),
      'Original immutable native report bytes changed',
    );
  if (!proposal.freshCapture)
    need(
      expectedSource === (phase === 'before' ? BEFORE_SOURCE : AFTER_SOURCE),
      'Historical reference source pin',
    );
  const report = JSON.parse(reportBytes);
  need(
    report.phase === phase &&
      report.fixture === '026-many-contact-projection-v1' &&
      report.sourceHash === expectedSource,
    'Native original provenance',
  );
  need(
    Array.isArray(report.inputs) &&
      report.inputs.length > 0 &&
      new Set(report.inputs.map((x) => x.path)).size === report.inputs.length,
    'Native input manifest',
  );
  const source = createHash('sha256');
  for (const item of report.inputs) {
    pathInside(item.path);
    const bytes = await readFile(resolve(directory, 'source', item.path));
    need(
      bytes.length === item.bytes && hash(bytes) === item.sha256,
      'Native archived source tamper',
    );
    source.update(item.path).update(bytes);
  }
  need(source.digest('hex') === expectedSource, 'Native aggregate source hash');
  const bytes = await readFile(resolve(directory, 'rapier-native-artifact.mjs'));
  need(
    bytes.length === report.native.bytes &&
      bytes.length === 4340292 &&
      hash(bytes) === report.native.sha256 &&
      report.native.sha256 === NATIVE_HASH,
    'Native artifact hash/count',
  );
  need(report.runs?.length === 10, 'Native ten arms missing');
  for (let i = 0; i < 10; i++) {
    const run = report.runs[i],
      pair = Math.floor(i / 2);
    need(
      run.pair === pair &&
        run.observe === (pair % 2 ? i % 2 === 0 : i % 2 === 1) &&
        run.warmupTicks === 180 &&
        run.measuredTicks === 600,
      'Native order/ticks',
    );
    equal(run.physics, { vehicles: 70, bodies: 134, colliders: 138 }, 'Native workload');
    nativeClean(run.cleanup, 'native');
    need(run.cleanup.disposedReadRejected === true, 'Disposed native access');
    need(run.sampleBytes === (run.observe ? 33600 : 0), 'Native seven-channel600 sample capacity');
    need(
      /^[a-f0-9]{64}$/.test(run.inputHash) && /^[a-f0-9]{64}$/.test(run.physicalHash),
      'Native parity hashes missing',
    );
    for (const metric of Object.values(run.metrics))
      for (const value of Object.values(metric))
        run.observe
          ? finite(value, 'Native measured percentile')
          : need(value === null, 'Unobserved native timing must be null');
    if (proposal.freshCapture) {
      const started = JSON.parse(
        await readFile(resolve(directory, `run-${i}-started.json`), 'utf8'),
      );
      const raw = JSON.parse(await readFile(resolve(directory, `run-${i}-raw.json`), 'utf8'));
      need(
        Date.parse(started.worldAttemptAt) >= Date.parse(report.archiveCompletedAt),
        'Archive before native world attempt',
      );
      need(started.archiveCompletedAt === report.archiveCompletedAt, 'Native chronology binding');
      need(
        raw.warmupCompleted === 180 && raw.measuredCompleted === 600 && raw.failures.length === 0,
        'Complete raw native run',
      );
      equal(raw.report, run, 'Native raw/report binding');
      equal(raw.cleanup, run.cleanup, 'Native raw cleanup binding');
      for (const key of [
        'tick',
        'controllerMs',
        'stepMs',
        'queryMs',
        'bridgeMs',
        'totalMs',
        'projection',
      ]) {
        need(raw.channels[key]?.length === (run.observe ? 600 : 0), 'Native raw capacity');
        if (run.observe)
          for (const p of [0.5, 0.95, 0.99])
            close(
              percentile(raw.channels[key], p),
              run.metrics[key][`p${p * 100}`],
              'Native raw percentile',
            );
      }
    }
  }
  if (proposal.freshCapture) {
    const archive = JSON.parse(await readFile(resolve(directory, 'archive-complete.json'), 'utf8'));
    need(
      archive.completedAt === report.archiveCompletedAt && archive.sourceHash === report.sourceHash,
      'Native archive completion binding',
    );
    equal(archive.inputs, report.inputs, 'Native complete closure binding');
    equal(archive.native, report.native, 'Native completion artifact binding');
  }
  return report;
}
/** Explicit reviewed pins only; no caller claims, generated hashes, or historical fallback. */
export async function readCurrentNative(root = '.', { assertCurrent = true } = {}) {
  const pins = requireCurrentPins();
  const base = resolve(root, 'Docs/Evidence/026-wheel-dynamics');
  const directory = resolve(base, pins.afterCapture);
  const afterBytes = await readFile(resolve(directory, 'node.json'));
  need(hash(afterBytes) === pins.afterReportHash, 'Pinned current AFTER report');
  const after = await readNative(directory, 'after', pins.afterSourceHash, { freshCapture: true });
  const originalBefore = await readNative(resolve(base, 'before'), 'before', BEFORE_SOURCE);
  await readNative(resolve(base, 'after-main-027'), 'after', AFTER_SOURCE);
  need(
    hash(await readFile(resolve(base, 'calibration-v2.json'))) ===
      'd8f7d9022f00d26399baba91ee9591132ac89d818c1c4711108c243e06b47e6c',
    'Original calibration retained',
  );
  const budgets = JSON.parse(
    await readFile(resolve(root, 'Docs/performance-budgets.json'), 'utf8'),
  );
  need(
    budgets.budgetVersion === '203-initial-1' &&
      budgets.regressionProposal.p95RelativeIncrease === 0.1 &&
      budgets.regressionProposal.p95AbsoluteIncreaseMs === 1 &&
      budgets.regressionProposal.confirmationsOutOfFive === 3 &&
      budgets.proposedBudgets.desktop.authoritativeTickP95Ms === 5.5,
    'Fixed native thresholds',
  );
  verifyNativeParity(originalBefore, after, budgets);
  const terminal = JSON.parse(await readFile(resolve(directory, 'terminal.json'), 'utf8'));
  need(
    terminal.state === 'NATIVE_NUMERIC_PASS' &&
      terminal.reportHash === pins.afterReportHash &&
      terminal.sourceHash === pins.afterSourceHash,
    'Native terminal missing/failed',
  );
  const calibrationDirectory = resolve(base, pins.calibrationCapture);
  const calibrationBytes = await readFile(resolve(calibrationDirectory, 'calibration.json'));
  need(hash(calibrationBytes) === pins.calibrationReportHash, 'Pinned fresh calibration report');
  const calibration = JSON.parse(calibrationBytes);
  need(
    calibration.sourceHash === pins.calibrationSourceHash &&
      calibration.fixture === '026-flat-surfaces-calibration-v1' &&
      calibration.runs.length === 28,
    'Fresh28 calibration provenance',
  );
  const calibrationTerminal = JSON.parse(
    await readFile(resolve(calibrationDirectory, 'terminal.json'), 'utf8'),
  );
  need(
    calibrationTerminal.state === 'NATIVE_CALIBRATION_NUMERIC_PASS' &&
      calibrationTerminal.reportHash === pins.calibrationReportHash &&
      calibrationTerminal.sourceHash === pins.calibrationSourceHash,
    'Fresh calibration terminal',
  );
  const calibrationArchive = JSON.parse(
    await readFile(resolve(calibrationDirectory, 'archive-complete.json'), 'utf8'),
  );
  need(
    calibrationArchive.sourceHash === calibration.sourceHash &&
      calibrationArchive.completedAt === calibration.archiveCompletedAt,
    'Calibration archive chronology binding',
  );
  equal(calibrationArchive.inputs, calibration.inputs, 'Calibration closure');
  equal(calibrationArchive.native, calibration.native, 'Calibration native');
  need(
    calibration.native.sha256 === NATIVE_HASH && calibration.native.bytes === pins.nativeBytes,
    'Calibration original native',
  );
  need(
    hash(await readFile(resolve(calibrationDirectory, 'rapier-native-artifact.mjs'))) ===
      NATIVE_HASH,
    'Calibration archived native',
  );
  validateNativeCalibration(calibration, await readPinnedCalibration(root));
  for (let i = 0; i < 28; i++) {
    const record = JSON.parse(
      await readFile(resolve(calibrationDirectory, `run-${i}-raw.json`), 'utf8'),
    );
    need(
      record.failures.length === 0 &&
        Date.parse(record.worldAttemptAt) >= Date.parse(calibration.archiveCompletedAt),
      'Calibration raw chronology/failure',
    );
    equal(record.report, calibration.runs[i], 'Calibration raw report');
    nativeClean(record.cleanup, 'Calibration');
    need(record.cleanup.disposedReadRejected === true, 'Calibration disposed access');
  }
  // All archived inputs rehashed; every production module consumed by the browser must
  // also occur in native/calibration archives with identical bytes (including barrels).
  const browserProduction = (
    await localClosure(['tests/browser/wheel-dynamics-v2/main.ts'])
  ).filter((path) => path.startsWith('src/'));
  for (const [captureDirectory, report] of [
    [directory, after],
    [calibrationDirectory, calibration],
  ]) {
    need(
      new Set(report.inputs.map((item) => item.path)).size === report.inputs.length,
      'Unique current input paths',
    );
    const aggregate = createHash('sha256');
    for (const item of report.inputs) {
      pathInside(item.path);
      const bytes = await readFile(resolve(captureDirectory, 'source', item.path));
      need(
        bytes.length === item.bytes && hash(bytes) === item.sha256,
        'Fresh archived input bytes',
      );
      aggregate.update(item.path).update(bytes);
      if (
        assertCurrent &&
        (item.path.startsWith('src/') ||
          item.path === 'package-lock.json' ||
          item.path === 'package.json')
      )
        need(
          hash(await readFile(resolve(root, item.path))) === item.sha256,
          'Fresh native/current production mismatch',
        );
    }
    need(aggregate.digest('hex') === report.sourceHash, 'Fresh aggregate source');
    for (const path of browserProduction) {
      const input = report.inputs.find((item) => item.path === path);
      need(input, `Native missing browser production: ${path}`);
      need(
        input.sha256 === after.inputs.find((item) => item.path === path)?.sha256,
        'Native/calibration production mismatch',
      );
    }
  }
  if (assertCurrent) {
    const installed = await readFile(
      fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat')),
    );
    need(
      installed.length === pins.nativeBytes && hash(installed) === NATIVE_HASH,
      'Current installed native binding',
    );
  }
  return { after, calibration, pins };
}
export function verifyProductionManifests(browserInputs, afterInputs, calibrationInputs) {
  for (const item of browserInputs.filter((item) => item.path.startsWith('src/'))) {
    const a = afterInputs.filter((input) => input.path === item.path);
    const c = calibrationInputs.filter((input) => input.path === item.path);
    need(a.length === 1 && c.length === 1, `Complete production input required: ${item.path}`);
    need(
      item.sha256 === a[0].sha256 && item.sha256 === c[0].sha256,
      'Browser/native/calibration production bytes differ',
    );
  }
  need(
    browserInputs.some((item) => item.path.startsWith('src/')),
    'Empty production manifest',
  );
}
export async function readPinnedCalibration(root = '.') {
  const bytes = await readFile(
    resolve(root, 'Docs/Evidence/026-wheel-dynamics/calibration-v2.json'),
  );
  need(
    hash(bytes) === 'd8f7d9022f00d26399baba91ee9591132ac89d818c1c4711108c243e06b47e6c',
    'Original calibration retained',
  );
  return JSON.parse(bytes);
}
function exactDeterministic(actual, original, label) {
  if (typeof original === 'number') {
    finite(actual, label);
    need(actual === original, `${label}: deterministic output changed`);
  } else if (original && typeof original === 'object') {
    need(
      actual && typeof actual === 'object' && Array.isArray(actual) === Array.isArray(original),
      label,
    );
    equal(Object.keys(actual).sort(), Object.keys(original).sort(), `${label}: output shape`);
    for (const key of Object.keys(original))
      exactDeterministic(actual[key], original[key], `${label}.${key}`);
  } else need(actual === original, label);
}
export function validateNativeCalibration(calibration, original) {
  need(
    calibration.fixture === '026-flat-surfaces-calibration-v1' && calibration.runs?.length === 28,
    'Native28 scenarios',
  );
  need(
    original?.fixture === calibration.fixture && original.runs?.length === 28,
    'Pinned original calibration required',
  );
  for (const [index, value] of calibration.runs.entries()) {
    const reference = original.runs.filter(
      (r) =>
        r.classId === value.classId &&
        r.surface === value.surface &&
        r.speedMps === value.speedMps &&
        r.scenario === value.scenario,
    );
    need(reference.length === 1, 'Original scenario identity');
    need(reference[0] === original.runs[index], 'Original28 scenario order');
    need(
      value.geometricRadiusM === 17 &&
        value.mechanics?.classId === value.classId &&
        value.mechanics?.surface?.id === value.surface,
      'Original native formula/material',
    );
    need(
      value.steeringRadians === Math.atan((value.classId === 'sedan' ? 2.7 : 2.4) / 17),
      'Original native steering formula',
    );
    const braking = value.scenario === 'braking';
    need(
      Number.isInteger(value.ticks) &&
        value.ticks >= 1 &&
        value.ticks <= (braking ? 1801 : 181) &&
        (braking || value.ticks === 181),
      'Original native tick convention',
    );
    need(
      Array.isArray(value.curve) &&
        value.curve.length === Math.ceil(Math.min(value.ticks, braking ? 1800 : 180) / 6),
      'Original native curve capacity',
    );
    const fourWheels = (wheels) => {
      need(Array.isArray(wheels) && wheels.length === 4, 'Exactly four native wheels');
      for (const wheel of wheels)
        need(
          finite(wheel.suspensionLengthM, 'Native suspension finite') >= 0,
          'Native suspension nonnegative',
        );
    };
    fourWheels(value.settled?.wheels);
    fourWheels(value.final?.wheels);
    for (const [index, point] of value.curve.entries()) {
      need(point.tick === index * 6 + 1, 'Original native sampled tick');
      fourWheels(point.wheels);
      need(
        Array.isArray(point.wheelLateralMps) && point.wheelLateralMps.length === 4,
        'Four wheel lateral speeds',
      );
      for (const speed of point.wheelLateralMps)
        need(finite(speed, 'Native lateral speed') >= 0, 'Native lateral speed nonnegative');
    }
    need(
      Number.isInteger(value.minContacts) &&
        Number.isInteger(value.maxContacts) &&
        value.minContacts >= 0 &&
        value.maxContacts <= 4 &&
        value.minContacts <= value.maxContacts,
      'Native contact bounds',
    );
    // Compare every deterministic field, vector, material, wheel and curve point;
    // timestamps/source provenance belong to the envelope, never these outputs.
    exactDeterministic(value, reference[0], 'Native calibration');
  }
  for (const classId of ['sedan', 'compact']) {
    const get = (surface, speed, scenario) => {
      const matches = calibration.runs.filter(
        (r) =>
          r.classId === classId &&
          r.surface === surface &&
          r.speedMps === speed &&
          r.scenario === scenario,
      );
      need(matches.length === 1, 'Unique native calibration scenario');
      return matches[0];
    };
    for (const surface of ['dry-asphalt', 'reduced-adhesion']) {
      for (const speed of [10, 20, 30]) {
        const value = get(surface, speed, 'braking');
        need(
          value.stopped && value.mechanics.surface.id === surface,
          'Native stopping/material gate',
        );
      }
      for (const speed of [8, 20]) get(surface, speed, 'turning');
      for (const scenario of ['curb', 'airborne']) {
        const value = get(surface, 10, scenario);
        need(
          value.curve.length > 0 &&
            value.curve.every((point) =>
              point.wheels.every((wheel) => Number.isFinite(wheel.suspensionLengthM)),
            ),
          'Native suspension finite',
        );
        if (scenario === 'airborne')
          need(value.minContacts === 0 && value.maxContacts === 4, 'Native airborne recontact');
      }
    }
    for (const speed of [10, 20, 30]) {
      const dry = get('dry-asphalt', speed, 'braking'),
        reduced = get('reduced-adhesion', speed, 'braking');
      need(
        reduced.brakingDistanceM > dry.brakingDistanceM * 1.1 &&
          reduced.mechanics.grip < dry.mechanics.grip,
        'Native original reduced adhesion gate',
      );
    }
    need(
      get('dry-asphalt', 20, 'turning').maxWheelLateralMps >
        get('dry-asphalt', 8, 'turning').maxWheelLateralMps + 0.5,
      'Native original slip gate',
    );
  }
}
export function verifyNativeParity(before, after, budgets) {
  const confirmations = { tick: 0, projection: 0 };
  for (let i = 0; i < 10; i++) {
    const a = before.runs[i],
      b = after.runs[i];
    need(
      a.inputHash === b.inputHash &&
        a.physicalHash === b.physicalHash &&
        a.pair === b.pair &&
        a.observe === b.observe,
      'Original native parity changed',
    );
    if (b.observe)
      for (const key of Object.keys(confirmations)) {
        const av = finite(a.metrics[key].p95, key),
          bv = finite(b.metrics[key].p95, key);
        if (regression(av, bv, budgets.regressionProposal)) confirmations[key]++;
        if (key === 'tick')
          need(
            bv <= budgets.proposedBudgets.desktop.authoritativeTickP95Ms,
            'Native tick absolute budget',
          );
      }
  }
  for (const count of Object.values(confirmations))
    need(
      count < budgets.regressionProposal.confirmationsOutOfFive,
      'Confirmed original native regression',
    );
  return {
    confirmations,
    rawNativeTimings: 'NOT_ARCHIVED_BY_ORIGINAL_PROTOCOL',
    originalBaseline: BEFORE_SOURCE,
  };
}
function validateCalibration(calibration) {
  // Read/hash the immutable original independently of capture-supplied data.
  const bytes = readFileSync(resolve('Docs/Evidence/026-wheel-dynamics/calibration-v2.json'));
  need(
    hash(bytes) === 'd8f7d9022f00d26399baba91ee9591132ac89d818c1c4711108c243e06b47e6c',
    'Pinned browser calibration original bytes',
  );
  const original = JSON.parse(bytes);
  validateNativeCalibration(original, original);
  need(
    Array.isArray(calibration) && calibration.length === 8,
    'Eight20m/s browser calibration records required',
  );
  for (const classId of ['sedan', 'compact']) {
    const get = (surface, scenario) => {
      const matches = calibration.filter(
        (x) =>
          x.classId === classId &&
          x.surface === surface &&
          x.scenario === scenario &&
          x.speedMps === 20,
      );
      need(matches.length === 1, 'Calibration identity duplicate/missing');
      return matches[0];
    };
    for (const surface of ['dry-asphalt', 'reduced-adhesion'])
      for (const scenario of ['braking', 'turning']) {
        const value = get(surface, scenario);
        const matches = original.runs.filter(
          (run) =>
            run.classId === classId &&
            run.surface === surface &&
            run.scenario === scenario &&
            run.speedMps === 20,
        );
        need(matches.length === 1, 'Pinned browser scenario identity');
        // Only actual browser lifecycle metadata differs from native deterministic output.
        const { lifetime, readbacks, ...deterministic } = value;
        exactDeterministic(deterministic, matches[0], 'Browser calibration');
        need(
          value.geometricRadiusM === 17 && value.mechanics?.surface?.id === surface,
          'Original calibration formula/material',
        );
        need(
          value.curve?.length > 0 && value.curve.length <= (scenario === 'braking' ? 300 : 30),
          'Calibration curve bounds',
        );
        need(
          value.curve.every(
            (point) =>
              point.wheels?.length === 4 &&
              point.wheels.every((wheel) => Number.isFinite(wheel.suspensionLengthM)),
          ),
          'Physical wheel suspension data',
        );
        finite(value.maxWheelLateralMps, 'Actual wheel lateral velocity');
        finite(value.brakingDistanceM, 'Actual stopping distance');
        clean(value.lifetime, 'calibration');
        nativeClean(value.readbacks?.['native-resources'], 'calibration');
      }
    const dry = get('dry-asphalt', 'braking'),
      reduced = get('reduced-adhesion', 'braking');
    need(
      dry.stopped === true &&
        reduced.stopped === true &&
        reduced.brakingDistanceM > dry.brakingDistanceM * 1.1 &&
        reduced.mechanics.grip < dry.mechanics.grip,
      'Original stopping/grip gate',
    );
  }
}
export function verifyCaptureNumbers(capture, budgets, hardwareClass = 'desktop') {
  need(['desktop', 'laptop'].includes(hardwareClass), 'Unknown hardware budget class');
  need(capture.state !== 'INCOMPLETE', 'INCOMPLETE: full protocol unavailable');
  const report = capture.terminal.dto.report,
    binding = capture.start.binding;
  need(
    capture.terminal.dto.state === 'CAPTURE_COMPLETE' && binding.mode === 'full',
    'Diagnostic/smoke cannot satisfy acceptance',
  );
  need(
    report.renderer === capture.backend.dto.renderer &&
      ['WEBGPU', 'WEBGL2'].includes(report.renderer),
    'Actual backend binding',
  );
  need(
    report.identity.sourceHash === binding.sourceHash &&
      report.identity.budgetVersion === budgets.budgetVersion,
    'Report source/budget mismatch',
  );
  need(
    hardwareClass === 'desktop'
      ? report.dpr === 1
      : Number.isFinite(report.dpr) && report.dpr > 0 && report.dpr <= 4,
    'DPR',
  );
  equal(report.cssResolution, [1920, 1080], 'CSS resolution');
  equal(report.internalResolution, [1920, 1080], 'Internal resolution');
  need(
    !/swiftshader|llvmpipe|software rasterizer/i.test(JSON.stringify(report.actualGpuInfo)),
    'Software renderer cannot satisfy hardware',
  );
  clean(capture.terminal.dto.lifetime, 'terminal');
  const journal = capture.terminal.dto.lifetime.journal;
  need(
    Array.isArray(journal) &&
      journal.length <= 4096 &&
      journal.some((event) => event.kind === 'journal-start') &&
      journal.some((event) => event.kind === 'focus-poll'),
    'Bounded actual browser continuity journal',
  );
  for (const event of journal) {
    need(
      Number.isFinite(event.at) &&
        !['blur', 'freeze', 'pagehide', 'webglcontextlost', 'webgpu-device-lost'].includes(
          event.kind,
        ) &&
        event.focused === true &&
        event.hidden === false &&
        event.connected === true &&
        event.visibility === 'visible',
      'Recorded JS continuity loss',
    );
  }
  need(
    capture.terminal.dto.readbacks?.surface?.connected === false &&
      capture.terminal.dto.readbacks?.backend?.sceneDisposed === true &&
      capture.terminal.dto.readbacks?.engine?.engineDisposed === true,
    'Backend/surface/engine cleanup',
  );
  need(capture.late?.length === 0, 'Supplemental late callback invalidates completed protocol');
  const confirmations = { frame: 0, main: 0, trackedJsHeap: 0 },
    recomputed = [];
  const cap = budgets.proposedBudgets[hardwareClass];
  for (let index = 0; index < 10; index++) {
    const raw = capture.raw.find((x) => x.dto.armIndex === index)?.dto,
      run = report.runs[index],
      pair = Math.floor(index / 2);
    need(
      raw &&
        raw.pair === pair &&
        run.pair === pair &&
        raw.current === run.current &&
        run.current === (pair % 2 ? index % 2 === 0 : index % 2 === 1),
      'Alternating ten-arm order',
    );
    need(
      run.warmupSeconds === 30 && run.measuredSeconds === 120 && run.activeSeconds >= 150,
      'Original full durations',
    );
    need(
      raw.frames === run.frames &&
        raw.ticks === run.ticks &&
        raw.frames > 0 &&
        raw.ticks > 0 &&
        raw.frames <= 30000 &&
        raw.ticks <= 30000,
      'Raw arm counts',
    );
    need(
      run.overloadCount === 0 &&
        finite(run.maxDebtMs, 'Actual debt') <= 250 &&
        finite(run.maxSteps, 'Actual catchup') <= 4,
      'Debt/max4 gate',
    );
    equal(
      run.gates,
      { fixedDtSeconds: 1 / 60, maxCatchupSteps: 4, overloadDebtMs: 250, simulationMinimum: 0.98 },
      'Original fixed-tick gates',
    );
    const ratio = raw.ticks / 60 / (run.activeSeconds - 30);
    close(run.simulationToActiveWallTime, ratio, 'Raw simulation/wall ratio');
    need(
      ratio >= budgets.proposedBudgets.simulationToActiveWallTimeMinimum,
      'Simulation throughput .98',
    );
    equal(run.physics, { vehicles: 70, bodies: 134, colliders: 138 }, 'Original70/64/3 workload');
    clean(raw.lifetime, 'arm');
    nativeClean(raw.readbacks?.['native-resources'], 'arm');
    const scheduling = raw.lifetime.scheduling;
    need(
      scheduling?.requests === scheduling.callbacks &&
        scheduling.callbacks === scheduling.continuations &&
        scheduling.callbacks >= raw.frames &&
        scheduling.maxCallbackDelayMs <= 250 &&
        scheduling.maxContinuationDelayMs <= 250,
      'Actual RAF ENTRY/continuation counters',
    );
    need(
      raw.lifetime.boundaries?.['native-exit']?.counters?.nativeCount ===
        raw.lifetime.boundaries?.['render-exit']?.counters?.nativeCount &&
        raw.lifetime.boundaries['render-exit'].counters.renderCount >= raw.frames,
      'Native/render boundary counts',
    );
    const trigger = raw.lifetime.lastTrigger;
    need(
      trigger &&
        trigger.callbackEntryMs >= trigger.requestEntryMs &&
        trigger.continuationEntryMs >= trigger.callbackEntryMs &&
        trigger.callbackEntryMs - trigger.requestEntryMs <= 250 &&
        trigger.continuationEntryMs - trigger.requestEntryMs <= 250,
      'Actual callback/continuation ENTRY clocks',
    );
    for (const key of ['nativeCount', 'renderCount'])
      need(
        trigger.requestCounters[key] === trigger.callbackCounters[key] &&
          trigger.callbackCounters[key] === trigger.continuationCounters[key],
        'No native/render work inside scheduling callback',
      );
    const end = raw.lifetime.boundaries['render-exit'].counters;
    need(
      end.nativeCount - trigger.continuationCounters.nativeCount >= 0 &&
        end.nativeCount - trigger.continuationCounters.nativeCount <= 4 &&
        end.renderCount - trigger.continuationCounters.renderCount === 1,
      'Last actual frame native/render advancement',
    );
    const stats = {};
    equal(
      Object.keys(raw.channels).sort(),
      ['frame', 'main', 'projection', 'step', 'tick'],
      'Raw five channels',
    );
    for (const [key, values] of Object.entries(raw.channels)) {
      need(
        values.length === (['tick', 'step'].includes(key) ? raw.ticks : raw.frames),
        'Raw channel sample count',
      );
      const actual = {
        count: values.length,
        p50: percentile(values, 0.5),
        p95: percentile(values, 0.95),
        p99: percentile(values, 0.99),
        max: Math.max(...values),
      };
      for (const [field, value] of Object.entries(actual))
        close(run.stats[key][field], value, `Recomputed ${key}.${field}`);
      stats[key] = actual;
    }
    need(
      stats.frame.p95 <= cap.frameP95Ms &&
        stats.frame.p99 <= cap.frameP99Ms &&
        stats.main.p95 <= cap.mainThreadP95Ms &&
        stats.tick.p95 <= cap.authoritativeTickP95Ms &&
        stats.step.p95 <= cap.rapierStepP95Ms,
      'Absolute frame/main/tick/step budget',
    );
    need(raw.longTaskEntries.length <= 4096, 'LongTask bounded');
    const tasks = raw.longTaskEntries.filter(
      (entry) =>
        finite(entry.startTime, 'LongTask start') + finite(entry.duration, 'LongTask duration') >
          run.measurementStartMs && entry.startTime <= run.measurementEndMs,
    );
    if (run.longTasks.supported) {
      need(tasks.length === run.longTasks.count, 'LongTask takeRecords count');
      close(run.longTasks.maxMs, Math.max(0, ...tasks.map((x) => x.duration)), 'LongTask max');
      need(
        run.longTasks.maxMs <=
          budgets.proposedBudgets.normalSteadyStateApplicationLongTaskMaximumMs,
        'LongTask budget',
      );
    } else need(raw.longTaskEntries.length === 0, 'Unsupported LongTask data');
    need(
      run.memory.worlds === 1 &&
        run.memory.retainedWheelHistory === 0 &&
        run.memory.wheelMeshes === 280 &&
        run.memory.chassisMeshes === 70 &&
        run.sampleBytes === 30000 * 8 * 5,
      'Original resource capacity',
    );
    if (run.gpuP95Ms !== null)
      need(finite(run.gpuP95Ms, 'GPU') <= cap.gpuP95Ms, 'Available GPU budget');
    for (const key of ['exactPageHeapBytes', 'exactWasmBytes'])
      if (run.memory[key] !== null) finite(run.memory[key], key);
    for (const key of ['trackedJsHeapStartBytes', 'trackedJsHeapEndBytes'])
      if (run.memory[key] !== null)
        need(finite(run.memory[key], key) >= 0, 'Available tracked JS memory');
    recomputed.push(stats);
  }
  for (let pair = 0; pair < 5; pair++) {
    const a = report.runs.find((x) => x.pair === pair && !x.current),
      b = report.runs.find((x) => x.pair === pair && x.current);
    for (const metric of ['frame', 'main'])
      if (regression(a.stats[metric].p95, b.stats[metric].p95, budgets.regressionProposal))
        confirmations[metric]++;
    const av = a.memory.trackedJsHeapEndBytes,
      bv = b.memory.trackedJsHeapEndBytes;
    if (
      av !== null &&
      bv !== null &&
      bv - av > budgets.regressionProposal.memoryAbsoluteIncreaseBytes &&
      bv > av * (1 + budgets.regressionProposal.memoryRelativeIncrease)
    )
      confirmations.trackedJsHeap++;
  }
  for (const count of Object.values(confirmations))
    need(
      count < budgets.regressionProposal.confirmationsOutOfFive,
      'Confirmed original hardware/memory regression',
    );
  validateCalibration(report.calibration);
  return {
    renderer: report.renderer,
    confirmations,
    recomputed,
    numericState: 'NUMERIC_PASS',
    scope:
      'Early026 fixture only; optional exactRAM/WASM/GPU may be unmeasured; physical driving/foreground and instrumentation review remain separate',
  };
}
/** Prior failed legacy reports stay FAIL/INCOMPLETE; no source-current mismatch can erase history. */
export function classifyLegacy(report) {
  if (
    report?.error ||
    report?.failure ||
    report?.state === 'FAILED' ||
    report?.diagnostic?.overloadCount > 0
  )
    return { state: 'FAIL', reason: 'Historical recorded failure' };
  return {
    state: 'INCOMPLETE',
    reason: 'Legacy lacks bound raw ten-arm protocol; no retroactive PASS',
  };
}
export async function verifySuite({
  webgpu,
  webgl2,
  beforeDirectory,
  afterDirectory,
  calibrationPath,
  budgetPath,
  currentSourceHash,
  nativeReference = 'historical',
}) {
  try {
    need(
      /^[a-f0-9]{64}$/.test(currentSourceHash),
      'Explicit current source identity required for historical/current distinction',
    );
    const budgets = JSON.parse(await readFile(budgetPath, 'utf8'));
    need(
      budgets.budgetVersion === '203-initial-1' &&
        budgets.regressionProposal.p95RelativeIncrease === 0.1 &&
        budgets.regressionProposal.p95AbsoluteIncreaseMs === 1 &&
        budgets.regressionProposal.confirmationsOutOfFive === 3,
      'Original budget revision/formula',
    );
    need(['historical', 'current'].includes(nativeReference), 'Explicit native reference class');
    const current = nativeReference === 'current' ? await readCurrentNative() : null;
    if (current)
      need(
        resolve(afterDirectory) ===
          resolve('Docs/Evidence/026-wheel-dynamics', current.pins.afterCapture),
        'Fixed current AFTER namespace',
      );
    const before = await readNative(beforeDirectory, 'before', BEFORE_SOURCE),
      after = current?.after ?? (await readNative(afterDirectory, 'after', AFTER_SOURCE));
    const calibrationBytes = await readFile(calibrationPath);
    need(
      hash(calibrationBytes) === 'd8f7d9022f00d26399baba91ee9591132ac89d818c1c4711108c243e06b47e6c',
      'Original28-scenario calibration bytes changed',
    );
    const originalCalibration = JSON.parse(calibrationBytes);
    validateNativeCalibration(originalCalibration, originalCalibration);
    need(
      originalCalibration.fixture === '026-flat-surfaces-calibration-v1' &&
        originalCalibration.runs.length === 28,
      'Original28 scenarios',
    );
    for (const classId of ['sedan', 'compact']) {
      const get = (surface, speed, scenario) =>
        originalCalibration.runs.find(
          (x) =>
            x.classId === classId &&
            x.surface === surface &&
            x.speedMps === speed &&
            x.scenario === scenario,
        );
      for (const speed of [10, 20, 30]) {
        const dry = get('dry-asphalt', speed, 'braking'),
          reduced = get('reduced-adhesion', speed, 'braking');
        need(
          dry?.stopped && reduced?.stopped && reduced.brakingDistanceM > dry.brakingDistanceM * 1.1,
          'Original stopping speed/material gate',
        );
      }
      need(
        get('dry-asphalt', 20, 'turning').maxWheelLateralMps >
          get('dry-asphalt', 8, 'turning').maxWheelLateralMps + 0.5,
        'Original high-speed slip gate',
      );
      for (const surface of ['dry-asphalt', 'reduced-adhesion']) {
        const airborne = get(surface, 10, 'airborne');
        need(
          airborne.minContacts === 0 &&
            airborne.maxContacts === 4 &&
            airborne.curve.every((point) =>
              point.wheels.every((wheel) => Number.isFinite(wheel.suspensionLengthM)),
            ),
          'Original airborne suspension/recontact',
        );
      }
    }
    const native = verifyNativeParity(before, after, budgets),
      captures = [];
    for (const [directory, renderer] of [
      [webgpu, 'WEBGPU'],
      [webgl2, 'WEBGL2'],
    ]) {
      const capture = await readPortableCapture(directory);
      need(
        capture.backend?.dto.renderer === renderer,
        'BOTH actual native browser backends required',
      );
      need(
        capture.start.binding.native.sha256 === NATIVE_HASH &&
          capture.start.binding.native.bytes === 4340292,
        'Browser native original artifact binding',
      );
      if (current) {
        equal(
          capture.start.binding.currentNative,
          current.pins,
          'Browser reviewed current native binding',
        );
        const archive = resolve(directory, '..', capture.start.binding.archive, 'source');
        const browserInputs = [];
        for (const path of capture.start.binding.inputs.filter((path) => path.startsWith('src/'))) {
          browserInputs.push({ path, sha256: hash(await readFile(resolve(archive, path))) });
          const input = after.inputs.find((item) => item.path === path);
          need(
            input && hash(await readFile(resolve(archive, path))) === input.sha256,
            'Complete browser/current native production match',
          );
        }
        verifyProductionManifests(browserInputs, after.inputs, current.calibration.inputs);
        for (const path of (await localClosure(['tests/browser/wheel-dynamics-v2/main.ts'])).filter(
          (path) => path.startsWith('src/'),
        ))
          need(
            capture.start.binding.inputs.includes(path),
            'Browser archive missing production closure',
          );
        need(
          capture.start.binding.sourceHash === currentSourceHash,
          'Current browser source identity required',
        );
      }
      captures.push({
        ...verifyCaptureNumbers(capture, budgets),
        sourceClass:
          current && capture.start.binding.sourceHash === currentSourceHash
            ? 'CURRENT_SOURCE'
            : 'HISTORICAL_SOURCE',
      });
    }
    need(captures[0].sourceClass === captures[1].sourceClass, 'Mixed current/historical source');
    const a = (await readPortableCapture(webgpu)).start.binding,
      b = (await readPortableCapture(webgl2)).start.binding;
    need(
      a.sourceHash === b.sourceHash && a.artifactHash === b.artifactHash,
      'BOTH backend source/artifact identity',
    );
    return {
      state: 'NUMERIC_PASS',
      native,
      nativeReference,
      captures,
      hardwareAcceptance: 'REQUIRES_PARENT_PHYSICAL_FOREGROUND_DRIVING_AND_INSTRUMENTATION_REVIEW',
    };
  } catch (error) {
    return {
      state: /INCOMPLETE|ENOENT/.test(String(error)) ? 'INCOMPLETE' : 'FAIL',
      reason: String(error),
    };
  }
}
