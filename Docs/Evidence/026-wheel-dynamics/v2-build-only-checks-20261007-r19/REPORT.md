# R19 single build-only verification

PASS: exactly one authorized build invocation exited 0 with BUILD_ARCHIVED_SERVER_NOT_STARTED. Independent read-only verification passed current/archived source, emitted artifacts, native and hardware metadata byte identities, aggregate hashes and all four reviewed native pins. The offline reader ran before the build and again afterward; build/archive chronology is recorded in verification.json. Grant removed in finally. No server/listener was created by the build-only entry, no HTTP request, UI/browser, native initialization/world/probe/calibration/capture, source repair, Git write, board movement or child task was performed.

This is build-only acceptance; no live Chrome or hardware acceptance. A future normal server invocation WILL rebuild with another UUID. Parent can plan a separately reviewed serve-existing frozen-identity helper; none was implemented or launched here. PBI026 is not Done.

Exact paths, counts, byte totals, hashes, UUID and current pins:

```json
{
  "state": "BUILD_ONLY_INDEPENDENT_VERIFY_PASS",
  "verifiedAt": "2026-10-07T03:30:50.373Z",
  "buildUUID": "66872ce5-696c-4c3f-9e6d-b849d38f0ee4",
  "buildPath": "F:\\Sites\\self-driving-academy\\.worktrees\\wheel-dynamics-01\\.pbi-validation-026-v2\\build-66872ce5-696c-4c3f-9e6d-b849d38f0ee4",
  "archivePath": "F:\\Sites\\self-driving-academy\\.worktrees\\wheel-dynamics-01\\Docs\\Evidence\\026-wheel-dynamics\\v2-captures-source-ownership-1\\build-7a3c2ca0c48e63ecd7b2bcc1edcb8658f2a4710b2c5203f77d775adc0230f3e8-8ce69f98824feb6fe39569fc2688656518ab1cc99717750f71a0be515a29f2f4-66872ce5-696c-4c3f-9e6d-b849d38f0ee4",
  "manifestPath": "F:\\Sites\\self-driving-academy\\.worktrees\\wheel-dynamics-01\\Docs\\Evidence\\026-wheel-dynamics\\v2-captures-source-ownership-1\\build-7a3c2ca0c48e63ecd7b2bcc1edcb8658f2a4710b2c5203f77d775adc0230f3e8-8ce69f98824feb6fe39569fc2688656518ab1cc99717750f71a0be515a29f2f4-66872ce5-696c-4c3f-9e6d-b849d38f0ee4\\build-manifest.json",
  "manifest": {
    "path": "F:\\Sites\\self-driving-academy\\.worktrees\\wheel-dynamics-01\\Docs\\Evidence\\026-wheel-dynamics\\v2-captures-source-ownership-1\\build-7a3c2ca0c48e63ecd7b2bcc1edcb8658f2a4710b2c5203f77d775adc0230f3e8-8ce69f98824feb6fe39569fc2688656518ab1cc99717750f71a0be515a29f2f4-66872ce5-696c-4c3f-9e6d-b849d38f0ee4\\build-manifest.json",
    "bytes": 29758,
    "sha256": "b0e0e120860da7ce730cb089b2b1b82c1a6299f19cad366151217e52d2777eae"
  },
  "archiveComplete": {
    "path": "F:\\Sites\\self-driving-academy\\.worktrees\\wheel-dynamics-01\\Docs\\Evidence\\026-wheel-dynamics\\v2-captures-source-ownership-1\\build-7a3c2ca0c48e63ecd7b2bcc1edcb8658f2a4710b2c5203f77d775adc0230f3e8-8ce69f98824feb6fe39569fc2688656518ab1cc99717750f71a0be515a29f2f4-66872ce5-696c-4c3f-9e6d-b849d38f0ee4\\archive-complete.json",
    "bytes": 6010,
    "sha256": "caa07ee1c1cbf40b90f27f9b9b4e3ade076603104eb21a7aea3bf55dbff4917d"
  },
  "sourceCount": 105,
  "sourceBytes": 6930954,
  "artifactCount": 142,
  "artifactBytes": 10424629,
  "sourceHash": "7a3c2ca0c48e63ecd7b2bcc1edcb8658f2a4710b2c5203f77d775adc0230f3e8",
  "artifactHash": "8ce69f98824feb6fe39569fc2688656518ab1cc99717750f71a0be515a29f2f4",
  "native": {
    "bytes": 4340292,
    "sha256": "02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0"
  },
  "hardware": {
    "bytes": 1900,
    "sha256": "7fbb27ac12af10c2e60453aa33da115f659646d21b39325ac95f49387387ac42"
  },
  "currentPins": {
    "version": "026-current-cleanup-native-1",
    "afterCapture": "after-cleanup-current-20261007-r1",
    "calibrationCapture": "calibration-cleanup-current-20261007-r1",
    "afterSourceHash": "c293c6f8baa9ec4279793a53a4a1c70d920976fe3cdb1208f6678852cec146a0",
    "afterReportHash": "290484a09790afb731bc461917877fffaf4ff16a90b757d3e99a03d50fcf9fe8",
    "calibrationSourceHash": "c293c6f8baa9ec4279793a53a4a1c70d920976fe3cdb1208f6678852cec146a0",
    "calibrationReportHash": "08e6eaaa2b299616bc8d03448f0950534faeb6b02ef6cacb4d634b70b084e7d3",
    "nativeHash": "02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0",
    "nativeBytes": 4340292
  },
  "chronology": {
    "prebuildReader": "2026-10-07T03:30:39.949Z",
    "buildStarted": "2026-10-07T03:30:41.273Z",
    "manifestWritten": "2026-10-07T03:30:46.154Z",
    "archiveStarted": "2026-10-07T03:30:46.156Z",
    "archiveCompleted": "2026-10-07T03:30:48.456Z",
    "buildExited": "2026-10-07T03:30:48.535Z"
  },
  "grantRemoved": true,
  "helperVerifyFrozenArchive": "PASS",
  "strictArchiveFileCount": 253,
  "noListenerCreated": true,
  "currentNativeInputCounts": {
    "after": 80,
    "calibration": 80
  },
  "acceptance": "BUILD_ONLY_NO_BROWSER_OR_HARDWARE_ACCEPTANCE",
  "normalServerWillRebuildWithAnotherUUID": true
}
```
