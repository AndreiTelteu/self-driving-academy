/** SOURCE proposal only. Root must review one immutable capture then pin its actual hashes.
 * Null means INCOMPLETE; neither environment nor caller-supplied identities can authorize PASS.
 * Never fill from the running capture automatically or relabel historical b696.
 */
export const CURRENT_NATIVE_REFERENCE = Object.freeze({
  version: '026-current-cleanup-native-1',
  afterCapture: 'after-cleanup-current-20261007-r1',
  calibrationCapture: 'calibration-cleanup-current-20261007-r1',
  afterSourceHash: 'c293c6f8baa9ec4279793a53a4a1c70d920976fe3cdb1208f6678852cec146a0',
  afterReportHash: '290484a09790afb731bc461917877fffaf4ff16a90b757d3e99a03d50fcf9fe8',
  calibrationSourceHash: 'c293c6f8baa9ec4279793a53a4a1c70d920976fe3cdb1208f6678852cec146a0',
  calibrationReportHash: '08e6eaaa2b299616bc8d03448f0950534faeb6b02ef6cacb4d634b70b084e7d3',
  nativeHash: '02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0',
  nativeBytes: 4340292,
});
export function requireCurrentPins() {
  for (const key of [
    'afterSourceHash',
    'afterReportHash',
    'calibrationSourceHash',
    'calibrationReportHash',
  ])
    if (!/^[a-f0-9]{64}$/.test(CURRENT_NATIVE_REFERENCE[key] ?? ''))
      throw new Error(`INCOMPLETE: root-reviewed current native pin missing: ${key}`);
  if (
    CURRENT_NATIVE_REFERENCE.afterSourceHash ===
    'b696b02d00956797b91e1cad5bc53263f9e765047b506f7ff73030cb26f7901f'
  )
    throw new Error('Historical AFTER cannot be relabelled current');
  return CURRENT_NATIVE_REFERENCE;
}
