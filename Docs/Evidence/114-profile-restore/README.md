# 114 — Restore, import and new profile evidence

This folder holds the deterministic evidence for PBI 114
(`114-profile-restore-v1`). The report is produced by
`npm run profile:restore` and verified byte-for-byte by
`npm run profile:restore -- --check`.

- [report.json](report.json) — machine-readable scenarios and checks.
- [report.md](report.md) — the same transcript in a readable table.

The probe runs seven scenarios over the real 109 profile store, the real 110
activation controller and the real 205 learning epoch barrier, with an
in-memory 069 segment port. It contains no browser capture, no wall clock, no
randomness, no FPS or hardware measurement.

Scenarios: restore, already active, valid import, invalid import, new profile,
style reset (zero XP/mission calls) and an active session whose old-generation
job is invalidated while the physical readback stays identical.

Limitations: the 109/110/205 integration is RAM-only; there is no savefile,
IndexedDB, crash recovery or live UI capture. A new profile id needs a pinned
205 barrier/110 controller supplied by the host (`barrierFor`), as documented in
[profile-restore](../../profile-restore.md).
