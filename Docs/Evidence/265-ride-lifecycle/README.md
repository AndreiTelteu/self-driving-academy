# Evidence 265 — ride lifecycle, passenger, ETA and HUD

PBI 265 local validation on the real live fleet. No canonical board file, PBI move or push is part of
this evidence.

## What was delivered

- `src/fleet/live-ride-lifecycle.ts` — composition of 061 lifecycle, 062 pickup, 063 dropoff and 064
  ETA over the real 264 claims. It starts from `dispatcher.assignmentFor(requestId)`, closes
  unavailable rides before the 264 release, records one terminal receipt and one real release.
- `src/app/live-ride-composition.ts` — app composition with the 147 passenger frame and the 073 HUD.
- `src/fleet/live-rides.ts` — additive `keepPlayerClaims`, `healthStatus`, `registry`, `graph` and
  `planner` ports. The default `keepPlayerClaims: false` preserves the 264 behavior and evidence.
- `src/ui/live-rides-panel.ts` — optional 265 ride section: stage, passenger, ETA, progress and
  terminal reason; the 264 two-argument contract still works.
- `src/ui/live-ride-markers.ts` — 147 port that projects P/D/S markers at the validated 032 anchors
  and hides markers behind the camera without inventing coordinates.
- `src/main.ts` — mounts the rides port, the combined panel read model, the 073 HUD and the world
  marker layer; exposes read-only debug snapshots and a DEV/capture health fact port for the probe.
- `tests/fleet/live-ride-lifecycle.test.ts` — 7 targeted tests.
- `tests/ui/live-rides-panel.test.ts` — 1 new 265 panel test.
- `tests/ui/live-ride-markers.test.ts` — 1 new marker projection test.
- `tests/fleet/live-ride-lifecycle-report.ts` + `scripts/run-live-ride-lifecycle-report.mjs` —
  deterministic 53-check transcript.
- `scripts/run-live-ride-lifecycle-probe.mjs` — browser probe with a manually driven complete ride
  and a real `FAILED/TAXI_BLOCKED` terminal.
- `Docs/live-ride-lifecycle.md` and the 07/31/README/061–064/147/073 integration notes.

## Real sequence

1. A live 059 request is admitted and the 060 dispatcher claims a real taxi.
2. The player takes over that claimed taxi. The ride survives (`keepPlayerClaims`), the 060 claim
   stays, and the taxi is excluded only from new assignments.
3. The player drives to the validated 032 pickup anchor, stops, and the real 180-tick dwell runs.
   `ARRIVED_PICKUP` is published at the start of the dwell, so 147 shows `BOARDING` with `P`+`S`.
4. `PICKUP_COMPLETE` moves the ride to `TO_DROPOFF`; 147 shows `ONBOARD`, occupancy 1 and `D`.
   The 073 HUD shows `Spre destinație`, the objective, ETA and certified progress.
5. The player drives to the validated dropoff anchor and stops for the real dwell.
   `ARRIVED_DROPOFF` shows `DROPPING_OFF`; `DROPOFF_COMPLETE` writes `COMPLETED` and releases exactly
   one 060 claim.
6. Another claimed taxi receives the real `BLOCKED` health fact. The lifecycle closes its ride with
   `FAILED/TAXI_BLOCKED` before 264 releases the claim; the panel shows the terminal reason.
7. A scenario reset closes every remaining active ride with `SCENARIO_RESET`, releases the claims and
   leaves zero duplicate requests or taxis.

## Deterministic report

`npm run ride:live:lifecycle` → [report.json](report.json), [report.md](report.md): **53/53 checks
PASS** on the real 24/32 fleet, 180/180 dwell ticks, `COMPLETED` release, `FAILED/TAXI_BLOCKED`, a
player takeover that keeps the ride, `SERVICE_BLOCKED` with `etaSeconds: null`, and a clean reset.

`npm run ride:live:lifecycle -- --check` fails if the committed transcript differs.

## Browser probe

`npm run ride:live:lifecycle:probe` → [browser.json](browser.json), [browser.md](browser.md) and six
screenshots. The measured run used installed Chrome 157 headless through `PLAYWRIGHT_MODULE`
(`playwright-core`, installed with `--no-save`), backend WEBGL2, viewport 1440×900:

- **25/25 checks PASS**, zero page errors and zero console errors.
- Completed ride: `w0005·r0000`, taxi `…:0003`, pickup `sz:2-3`, dropoff `sz:3-2`, boarding tick
  2359, completion tick 10552, release `COMPLETED`.
- Passenger: `BOARDING` with `P`+`S`, `ONBOARD` occupancy 1 with `D`, `DROPPING_OFF` with `D`,
  `NONE` + reset after completion.
- HUD: `La pasager` and `100% · 0 m` at pickup, `Spre destinație`, `~1 min 28 s`, `7% · 1.2 km` on
  the trip, `La destinație` at dropoff.
- Failed ride: `w0005·r0001`, taxi `…:0006`, `BLOCKED` health fact, terminal `FAILED`,
  `TAXI_BLOCKED`, one receipt and the claim removed.
- Panel: completed row `Cursă încheiată` and failed row `Cursă eșuată` + `TAXI_BLOCKED`.

## Commands

All commands run in the worktree with Node 24.21.0 through Volta.

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run format:check` | PASS |
| `npm run check:architecture` | PASS (458 TypeScript files; negative probes 6 + 4 + 3) |
| `npm run docs:check -- --check` | PASS (29 tasks, 32 module docs, 1811 local links) |
| `npm test` | 3610 passed, 0 failed, 14 skipped (3624 tests) |
| `npm run build` | PASS (Vite build; existing large-chunk warning only) |
| `npm run composition:report -- --check` | PASS (236 transcript current) |
| `npm run ride:live -- --check` | PASS (264 transcript unchanged) |
| `npm run ride:live:lifecycle -- --check` | PASS (265 transcript current) |
| `npm run ride:live:lifecycle:probe` | PASS 25/25 (Chrome 157, WEBGL2) |

## Limitations

1. The browser probe drives the player's claimed taxi manually. A complete autonomous ride is not
   yet possible because the AI traffic composition does not receive ride routes; that remains an
   explicit follow-up.
2. The probe's driving controller is a probe helper, not gameplay code; it uses real keyboard input
   and real authoritative positions.
3. Economy, fare, reviews and KPI remain PBI 266.
4. The marker layer is a projected DOM overlay, not a final 3D passenger asset; 147's contract calls
   for a marker and occupancy, not a mesh.
5. No FPS/GPU/hardware measurement is claimed; the browser probe is functional evidence, not a
   performance certificate.
