/** SOURCE proposal only. Root must review one immutable capture then pin its actual hashes.
 * Null means INCOMPLETE; neither environment nor caller-supplied identities can authorize PASS.
 * Never fill from the running capture automatically or relabel historical b696.
 */
export const CURRENT_NATIVE_REFERENCE = Object.freeze({
  version: '026-current-cleanup-native-1',
  afterCapture: 'after-integrated-20261011-r2',
  pairedCapture: 'laptop-integrated-paired-20261011-r3',
  pairedHash: '4399dc78323b016c6a9e85ae5d27f64ad3e43d22b3a4b247bf6ed84e69d85dbc',
  calibrationCapture: 'calibration-integrated-20261011-r1',
  afterSourceHash: '7ead3e32bd23c1d8ccaa78918521e401ed34e8f5b99797df1c8fcdd54d036ce0',
  afterReportHash: '0de2eed4a23c131d1b694d31e97657d5c564413355aa94258f657041fde9d069',
  calibrationSourceHash: '985e06b424a5976c1156a91d42d613bc11710fd1ba8ad6b146b5efb511a368e2',
  calibrationReportHash: '3b10d7a7112143acc04e0b6294d29d8db4e1811bbda3339962242154fb292d2a',
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
