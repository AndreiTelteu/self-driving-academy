/** SOURCE proposal only. Root must review one immutable capture then pin its actual hashes.
 * Null means INCOMPLETE; neither environment nor caller-supplied identities can authorize PASS.
 * Never fill from the running capture automatically or relabel historical b696.
 */
export const CURRENT_NATIVE_REFERENCE = Object.freeze({
  version: '026-current-cleanup-native-1',
  afterCapture: 'after-scalar-20261011-r3',
  pairedCapture: 'laptop-scalar-paired-20261011-r1',
  pairedHash: '5216f386586c3822d6738e867b177ab9ad6c3677c910e571a9dd38628e1aff6e',
  calibrationCapture: 'calibration-scalar-20261011-r1',
  afterSourceHash: '940a917c2cf829aaeb768ded1eb5e8f68de1069a7258cc073518aa307873a576',
  afterReportHash: '5bfc0484bdf70822dd0713f09d635e0f2f2340e69f4a0711f8bcc05a0e11d6b9',
  calibrationSourceHash: 'bcfe8d6bc2a4420c35d99ff73cd351deb727925e52b1d4e6b775b85049839ff9',
  calibrationReportHash: 'c174169dd1605d49ff60dd5ee00fc35ae4405927a82e2e71f80a7b832c4af7f8',
  nativeHash: '02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0',
  nativeBytes: 4340292,
});
export function requireCurrentPins() {
  for (const key of [
    'afterSourceHash',
    'afterReportHash',
    'calibrationSourceHash',
    'calibrationReportHash',
    'pairedHash',
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
