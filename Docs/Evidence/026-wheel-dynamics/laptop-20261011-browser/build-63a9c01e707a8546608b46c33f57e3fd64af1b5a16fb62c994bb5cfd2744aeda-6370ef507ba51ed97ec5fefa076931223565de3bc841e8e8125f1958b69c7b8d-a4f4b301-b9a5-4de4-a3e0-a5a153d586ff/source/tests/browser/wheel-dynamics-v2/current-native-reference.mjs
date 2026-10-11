/** SOURCE proposal only. Root must review one immutable capture then pin its actual hashes.
 * Null means INCOMPLETE; neither environment nor caller-supplied identities can authorize PASS.
 * Never fill from the running capture automatically or relabel historical b696.
 */
export const CURRENT_NATIVE_REFERENCE = Object.freeze({
  version: '026-current-cleanup-native-1',
  afterCapture: 'after-optimized-20261011-r1',
  pairedCapture: 'laptop-optimized-paired-20261011-r1',
  pairedHash: '19d5f569dc1c117b0412f354fae915c06823b3505c179465fc8615b4c4774272',
  calibrationCapture: 'calibration-optimized-20261011-r1',
  afterSourceHash: 'e94532040dcf3f7e7efd3540b749d5de995ca2d9fd9820644ac286fe114c8eff',
  afterReportHash: '91629c84559f817acaf79b433f1549deea7392ac7d64a00d983d8cc8773549e4',
  calibrationSourceHash: 'e94532040dcf3f7e7efd3540b749d5de995ca2d9fd9820644ac286fe114c8eff',
  calibrationReportHash: '900e5bb7e34022b1787a728114addcf255de196cb336d2227434b7c3a9d5718c',
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
