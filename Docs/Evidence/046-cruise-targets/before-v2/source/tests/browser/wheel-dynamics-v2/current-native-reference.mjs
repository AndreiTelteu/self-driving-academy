/** SOURCE proposal only. Root must review one immutable capture then pin its actual hashes.
 * Null means INCOMPLETE; neither environment nor caller-supplied identities can authorize PASS.
 * Never fill from the running capture automatically or relabel historical b696.
 */
export const CURRENT_NATIVE_REFERENCE = Object.freeze({
  version: '026-current-cleanup-native-1',
  afterCapture: 'after-visual-query-20261011-r1',
  pairedCapture: 'laptop-visual-query-paired-20261011-r1',
  pairedHash: '135baa5fb84c5bda6f3a977af2fb9d10da5a9c813dd592f8399375f092344117',
  calibrationCapture: 'calibration-visual-query-20261011-r1',
  afterSourceHash: 'dab5e9457a975d9c6bc5c73ec1c2c776469a9ddc8bab4984a948786b0af56a00',
  afterReportHash: '5c58506caf56c7832c4ec351177475a820db9bd2b155d4186cdbae38e3c86645',
  calibrationSourceHash: 'dab5e9457a975d9c6bc5c73ec1c2c776469a9ddc8bab4984a948786b0af56a00',
  calibrationReportHash: '45db556d5d8a7561d6483f30c96ee1275f4cad36506c4ee46b43e9de72a0f702',
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
