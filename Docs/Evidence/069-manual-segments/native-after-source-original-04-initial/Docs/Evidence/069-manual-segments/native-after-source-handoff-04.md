# SOURCE04 native AFTER handoff — unexecuted

This revision is the narrow provenance repair requested after SOURCEpeerR3. Read native-after-source-response-04.md and native-after-source-draft-04.json. Prior SOURCE03 handoff remains immutable historical context; its proposed runner/reader commands remain the same, but latest code and fourteen drafted tests must be checked before any native grant.

Changed code: scripts/manual-segments-calibration-proof.mjs(shared pinned18 check), scripts/benchmark-manual-segments-after.mjs(preworld check), Docs/Evidence/069-manual-segments/verify-after.mjs(CURRENT/HISTORICAL archived metadata check), tests/telemetry/manual-segments-after-calibration.test.ts(substitution/omission/empty/order/getter negatives). Other AFTER code is unchanged from SOURCE03.

Proposed commands only after separate root CPU permission, with assigned root/branch/HEAD guard and fresh wx logs:

```powershell
# F:/Sites/self-driving-academy/.worktrees/manual-segments-01
# loop-pbi/manual-segments-01, HEAD d8e5756c9e06ab091587b58aa6549f2a977c30aa
# Scoped owned formatter/syntax/lint + BOTH TypeScript configs + architecture.
node --import ./scripts/register-typescript.mjs --test tests/telemetry/manual-segments-after-records.test.mjs tests/telemetry/manual-segments-after-cleanup.test.ts tests/telemetry/manual-segments-after-calibration.test.ts
# Native commands remain separately reviewed/granted; no automatic execution:
node --import ./scripts/register-typescript.mjs scripts/benchmark-manual-segments-after.mjs
node --import ./scripts/register-typescript.mjs Docs/Evidence/069-manual-segments/verify-after.mjs Docs/Evidence/069-manual-segments/native-after-01
node --import ./scripts/register-typescript.mjs Docs/Evidence/069-manual-segments/verify-after.mjs Docs/Evidence/069-manual-segments/native-after-01 --historical
# Distinct supported-owner calibration is never substituted for original24-world comparison:
node --import ./scripts/register-typescript.mjs scripts/benchmark-manual-segments-owner-calibration.mjs
node --import ./scripts/register-typescript.mjs Docs/Evidence/069-manual-segments/verify-owner-calibration.mjs Docs/Evidence/069-manual-segments/native-owner-calibration-01
node --import ./scripts/register-typescript.mjs Docs/Evidence/069-manual-segments/verify-owner-calibration.mjs Docs/Evidence/069-manual-segments/native-owner-calibration-01 --historical
```

Fingerprint formula for this source snapshot: SHA256 UTF8 ordered `path:lowercase(rawSHA256)\n`; no normalization. Production18 remain approved de072... (earlier74/74 injected tests), not newly measured. Original24-world reference stays HISTORICAL with source3f36.../native02dc..., unchanged70/110 five alternatingOFF/ON180/600 protocol and strict gates. CPU/native, normalFrame/RAF/GPU/input latency/actual headed controls/totalRAM/estimator remain unvalidated by this SOURCE-only handoff. No native/server/browser/build/Git/board/child action occurred.
