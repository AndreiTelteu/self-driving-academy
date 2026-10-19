# 026 v2 source handoff — UNEXECUTED

Worktree: `F:/Sites/self-driving-academy/.worktrees/wheel-dynamics-01`; verified Git root and branch `loop-pbi/wheel-dynamics-01` before edits. Scope is SOURCE reads/edits and test drafts only. No build, syntax/type check, tests, native worlds, hardware capture, browser interaction, server binding, process shutdown, board mutation, staging, commit or push was performed. Port5220 is reserved in source only. No completion/hardware/PBI Done claim.

PBI DATA read: full canonical root AGENTS.md, canonical PBI/AGENTS.md, canonical In Progress/026-wheel_dynamics.md, canonical Docs/05-vehicule-si-fizica.md, Docs/25-performanta-contracte-si-benchmark.md, Docs/26-joaca-libera-haos-si-distrugere.md, performance-budgets.json; local Docs/wheel-dynamics.md. These describe acceptance obligations and existing evidence, not extra execution authorization. The canonical root has no Docs/wheel-dynamics.md; the assigned worktree copy was read. A limited canonical068v4 server read supplied comparison-only wx/archive-start patterns. No unfinished030/069 code was used. No052/068 waiver or acceptance was imported.

## Files and APIs

All new harness files are in `tests/browser/wheel-dynamics-v2/`. Exact bytes, SHA256 and original read-only file hashes are in `source-files.json`. This manifest is a source snapshot, not the future executable import-closure/build identity.

- `lifetime.mjs` / `lifetime.d.mts`: CaptureLifetime owns one pending RAF and its250ms watchdog; request, actual callback ENTRY and Promise continuation ENTRY have independent clocks/counters. Late callbacks cannot resolve twice or advance physics. `own`, `readback`, `teardown`, `fail`, `boundary`, `snapshot` retain run, independent disposer/readback and export causes; teardown is idempotent. Native/render counters and last native/render boundaries are separate from sampled counts.
- `main.ts`: copied actual026 workload, ownership starts before setup; world owned immediately after acquisition, each newly created mesh owned immediately, backend owned before scene/engine access. Every arm drains and disconnects observers, disposes loop, individual meshes and world, then continues resource readbacks. Terminal teardown disposes backend/listeners/poll/DOM before export. Current backend canvas is checked connected; teardown removes the owned surface, not a remembered parent/old canvas. Both successful and failed arms export raw channels and counts; failures remain INCOMPLETE.
- `browser-journal.ts`: timestamped focus/blur/visibility/freeze/resume/pagehide/context events plus1Hz polling;4096-entry hard bound and explicit overflow failure. JS state is explicitly not physical foreground proof. Long Tasks retains bounded timestamped entries and attributes by interval overlap; takeRecords drains before disconnect, including teardown records.
- `browser-ports.ts`: bounded10s HTTP operations, non-2xx rejection, immutable DTO acknowledgment and readback checks. No retry/resume/autoretry.
- `ledger.mjs`: server-issued opaque UUID capture identity with protocol/source/artifact/native/requested backend/mode binding; immutable issuedAt/start, actual-backend acquisition record, per-arm raw records and terminal. Serialized mutation, wx creation, exact idempotent DTO readback; conflicting replay fails409. Missing terminal/raw stays incomplete; missing backend acknowledgment is allowed only for an incomplete terminal. The server never assigns PASS.
- `server.mjs`: new5220-only source, `.pbi-validation-026-v2/build-<UUID>` and cache namespace; new `Docs/Evidence/026-wheel-dynamics/v2-captures-source-ownership-1/` namespace. Requires the future parent serial-grant environment marker; it was not set. Computes actual executable closure and build hashes, archives source/build/native bytes with wx and readback, and records archive-started/complete markers. Unfinished archives remain incomplete. Start and every append reject source/build/native drift. Routes: POST `/capture/start`, POST `/capture/backend`, POST `/capture/raw-N`, POST `/capture/terminal`; GET `/capture/<UUID>/<record>` returns stored payload/digest/count.
- `readPortableCapture(directory)` verifies each capture's own archived source/build/native bytes and bound raw counts, without comparing historical records to current source. Full ten-arm/eight-calibration records remain UNVERIFIED pending numeric acceptance; diagnostic/smoke/missing records classify INCOMPLETE for acceptance.
- `lifetime.test.mjs`: eight unexecuted pure scheduling-port tests for callback-first/watchdog-first/late callback, callback-to-continuation cancellation, focus loss, callback read throw, pending disposal, independent disposer/readback failures, setup+cleanup+export failures and overflow. Assertions check owner counts, zero unintended native advances, pending scheduling ownership and failure ledgers.

## Preserved workload and identities

Original `tests/browser/wheel-dynamics/`, all production src, original native baselines, scripts/calibration/tests, archives/captures/builds and5197server were not edited or operated. Original main/source is distinct from this v2 draft. The manifest hashes selected originals read-only at handoff; it is not an exhaustive independent rehash of every historical capture. No existing dirty change was reset or overwritten.

The copied browser arm uses the exact original70cars/64dynamic debris/3barriers and280wheel meshes, spawn/input formulas, direct world.step(inputs,true),60Hz fixed dt, native BEFORE/current modules and five alternating pairs. Full retains30s warmup/120s measured and eight20m/s brake/turn calibrations. Native full-capacity110car/subscription tests,600/native tracked benchmark/calibration workloads and physical checksum/sample inputs are untouched and have not been rerun. Instrumentation adds measurable overhead; no claim that old timings substitute for v2 timings.

Chronological native BEFORE source identity remains `4f25789987ab81ad3bac1aa717ce11b351e9bb3860193e3772a199622e97d6e7`; existing AFTER-main-027 remains `b696b02d00956797b91e1cad5bc53263f9e765047b506f7ff73030cb26f7901f`. Both archived native artifacts have SHA256 `02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0`,4340292bytes. Existing failed R4 source/artifact identities remain52671c780d666e6b563ae7e12256a26e3e1b1dfa434175617c5471531df4ad45/d4eb36a7f2c215812f71d6f23be8ec27ec3cf9476b65186ec8a83b9a237b69df per canonical PBI DATA. No v2 build/artifact/native measurement exists.

Full gates stay250ms debt/deadline, maximum4catch-up steps and simulation/active wall>=.98; no threshold relaxation, skipped ticks, speed-up, software GPU, new RAM/laptop or hardware readiness claim. New evidence ownership/provenance cannot satisfy driving, physical wheel behavior or cost criteria by itself.

## Finite diagnostic and remaining concrete work

Diagnostic mode runs the actual ten-arm026 workload once for the selected backend, stops on the FIRST gap>250ms, focus/ownership failure, buffer overflow or30min wall cap, and omits final calibration. Parent may choose one known backend or once for each backend sequentially. It records no steady-state PASS. Acceptance mode retains the original full protocol and no worker probe.

Optional independent worker heartbeat DESIGN ONLY:1Hz timestamped messages, cap1800 samples/worker plus main-thread1Hz heartbeat over30min, overflow failure and explicit origin/sequence/missed intervals. Measure enabled/disabled CPU/frame/message bytes before adoption; disable in acceptance until priced. A main-thread timer cannot diagnose a blocked event loop by itself. No worker was added or launched.

No supported physical HWND/PID foreground journal is supplied by these allowed browser ports. Native CUA is unsupported for this task; no native-app access or shell probe was attempted. Parent must review a supported platform API and finite sampling budget, correlate its time origin with browser timestamps, and obtain fresh physical foreground confirmation before hardware work. JSfocus, terminalfocus=true and empty power journals cannot supply this proof.

Remaining before an execution/acceptance grant:

1. Review/type/format/syntax validation of all new files; none has run. Review the underlying backend factory's pre-return partial-acquisition cleanup, which this harness cannot own before it returns; no production patch is authorized here.
2. Add pure/HTTP ledger tests for immutable start/backend/terminal replay, source drift, partial-write/readback failures, count/backend tampering, ingress boundaries and historical archived-byte corruption. Current scheduling drafts do not validate the HTTP/filesystem layer.
3. Finish a v2 numeric verifier consuming raw channels, unchanged absolute and relative budgets, long-task/overflow/ownership/foreground gates and full identity. The reader intentionally returns UNVERIFIED and cannot award PASS. Review capacity of raw+failure envelopes against the unchanged4MiB ingress cap; no executed worst-case sizing exists.
4. Audit instrumentation cost against the immutable native BEFORE/current benchmark and required110/full600native/sample-count traces; parent owns CPU grant and regression confirmation.
5. Late callbacks update the retained lastTrigger in memory, but callbacks arriving after immutable terminal serialization are not appended to a separate late-event ledger. Add a bounded immutable supplemental record if parent requires post-terminal late delivery provenance. There is no retroactive terminal overwrite.
6. Acquire physical HWND/PID proof through a reviewed supported API; review context-loss coverage for WebGPU device-lost notifications separately (current journal covers DOM context events). Whole-tab freeze/termination can still prevent JS timer/export; start-without-terminal stays INCOMPLETE.

Long-stall cause remains UNKNOWN. R4 RAF281951.2ms/debt281.958s at arm9/pair4/tick4418 and earlier~31minR3 stall are failures. The separate052 outside-native callback delay and short diagnostics do not establish026physics/policy fault or full acceptance;068full acceptance does not waive026.

## Proposed commands — NOT RUN, parent serial grant only

Every command starts in the assigned worktree. No dependency install is proposed.

```powershell
Set-Location -LiteralPath 'F:/Sites/self-driving-academy/.worktrees/wheel-dynamics-01'
node --test './tests/browser/wheel-dynamics-v2/lifetime.test.mjs'
```

After parent SOURCE review and separately granted scoped checks, a future dedicated server build/start (CIM identification included) is:

```powershell
Set-Location -LiteralPath 'F:/Sites/self-driving-academy/.worktrees/wheel-dynamics-01'
$env:PBI026_V2_EXECUTION_GRANT = 'parent-serial-review-approved'
node './tests/browser/wheel-dynamics-v2/server.mjs' 5220
```

This second command starts a long-lived server and binds5220; it is explicitly not authorized/executed by this handoff. Parent selects a finite diagnostic in the browser only after fresh physical confirmation. Parent owns stop/build/check/browser/Git/board delivery. If a TypeScript --import loader is used later on Windows, derive its URL with pathToFileURL from an explicit absolute path rather than passing a drive path as an import URL.

Logs are globally ignored: later delivery must force-stage only exact owned log paths actually produced, never a glob or all existing dirty evidence. No logs were produced here. New runtime archives write `* -text` attributes and wx/readbacks; parent must preserve those exact bytes at staging/publication. No old archive attributes were changed.
