# Evidence 265 — ride lifecycle, passenger, ETA and HUD

PBI 265 local validation on the real live fleet. No canonical board file, PBI move or push is part of
this evidence.

## What was delivered

- `src/fleet/live-ride-lifecycle.ts` — composition of 061 lifecycle, 062 pickup, 063 dropoff and 064
  ETA over the real 264 claims. It starts from `dispatcher.assignmentFor(requestId)`, closes
  unavailable rides before the 264 release, records one terminal receipt and one real release.
- `src/fleet/civil-traffic.ts` — additive 058 service-route execution: a real 041 route from the
  actor's lane to a 032 zone, a stop point at the zone anchor, a held dwell and a clean release. It
  never teleports the actor and never re-routes a player-driven car.
- `src/app/live-ride-composition.ts` — app composition with the 147 passenger frame, the 073 HUD, the
  058 actor-route port and the `actorRoutes` read model.
- `src/fleet/live-rides.ts` — additive `keepPlayerClaims`, `healthStatus`, `registry`, `graph` and
  `planner` ports. The default `keepPlayerClaims: false` preserves the 264 behavior and evidence.
- `src/ui/live-rides-panel.ts` — optional 265 ride section: stage, passenger, ETA, progress and
  terminal reason; the 264 two-argument contract still works.
- `src/ui/live-ride-markers.ts` — 147 port that projects P/D/S markers at the validated 032 anchors
  and hides markers behind the camera without inventing coordinates.
- `src/main.ts` — mounts the rides port, the combined panel read model, the 073 HUD, the world marker
  layer and the real 058 actor port; exposes read-only debug snapshots.
- `tests/fleet/live-ride-lifecycle.test.ts` — 9 targeted tests, including a complete AUTO ride.
- `tests/ui/live-rides-panel.test.ts` — 1 new 265 panel test.
- `tests/ui/live-ride-markers.test.ts` — 1 new marker projection test.
- `tests/fleet/live-ride-lifecycle-report.ts` + `scripts/run-live-ride-lifecycle-report.mjs` —
  deterministic 66-check transcript.
- `scripts/run-live-ride-lifecycle-probe.mjs` — browser probe with one complete AUTO ride, one
  complete MANUAL ride and a real `FAILED/TAXI_BLOCKED` terminal.
- `Docs/live-ride-lifecycle.md` and the 265 evidence.
- `Docs/Evidence/058-civil-traffic/report.json` — regenerated after the additive service-route limits.

## Real sequence

AUTO session (no takeover, no observation override):

1. A live 059 request is admitted and the 060 dispatcher claims a real taxi.
2. The 265 composition gives the 058 actor a real 041 route to the pickup zone. The actor drives it,
   decelerates and holds exactly at the 032 anchor for the 180-tick dwell.
3. `PICKUP_COMPLETE` moves the ride to `TO_DROPOFF`; the composition commands the real 041 dropoff
   route. The passenger is `ONBOARD`, occupancy 1 and only `D` remains.
4. The actor holds at the dropoff anchor for the second 180-tick dwell. `DROPOFF_COMPLETE` writes
   `COMPLETED` and releases exactly one 060 claim.

MANUAL session (fresh real session):

1. The player takes over the claimed taxi. The ride survives (`keepPlayerClaims`), the 060 claim
   stays, and the taxi is excluded only from new assignments.
2. The player drives to the validated 032 pickup anchor, stops, and the real 180-tick dwell runs.
   `ARRIVED_PICKUP` is published at the start of the dwell, so 147 shows `BOARDING` with `P`+`S`.
3. `PICKUP_COMPLETE` moves the ride to `TO_DROPOFF`; 147 shows `ONBOARD`, occupancy 1 and `D`.
   The 073 HUD shows `Spre destinație`, the objective, ETA and certified progress.
4. The player drives to the validated dropoff anchor and stops for the real dwell.
   `ARRIVED_DROPOFF` shows `DROPPING_OFF`; `DROPOFF_COMPLETE` writes `COMPLETED` and releases exactly
   one 060 claim.
5. Another claimed taxi receives the real `BLOCKED` health fact. The lifecycle closes its ride with
   `FAILED/TAXI_BLOCKED` before 264 releases the claim; the panel shows the terminal reason.

The deterministic report also closes every remaining active ride with `SCENARIO_RESET`, releases the
claims and leaves zero duplicate requests or taxis.

## Deterministic report

`npm run ride:live:lifecycle` → [report.json](report.json), [report.md](report.md): **66/66 checks
PASS** on the real 24/32 fleet, with two complete rides:

- MANUAL: 180/180 dwell ticks, `COMPLETED` release, player takeover that keeps the ride,
  `SERVICE_BLOCKED` with `etaSeconds: null`, clean reset.
- AUTO: taxi `…0011` follows the assignment's 3-lane pickup and 3-lane trip paths exactly, stops with
  `remainingToStopM = 0` and speed 0 in both zones, boards after 180 ticks and completes at tick 5079
  with `COMPLETED`, 0 fixture overrides and a cleared 058 service route. The largest route advance is
  0.222 m/tick at 13.30 m/s.

`npm run ride:live:lifecycle -- --check` fails if the committed transcript differs.

## Browser probe

`npm run ride:live:lifecycle:probe` → [browser.json](browser.json), [browser.md](browser.md) and ten
screenshots. The measured run used installed Chrome 157.0.8103.51 headless through
`PLAYWRIGHT_MODULE` (`playwright-core`, installed with `--no-save`), backend WEBGL2, viewport
1440×900:

- **40/40 checks PASS**, zero page errors and zero console errors.
- AUTO ride: `w0005·r0005`, taxi `…0012`, pickup `sz:1-1`, dropoff `sz:1-0`, route 2/6 lanes,
  boarding tick 1898, completion tick 6740, dwell 180/180, control `AUTO`, release `COMPLETED`.
  At the pickup hold the camera saw `S`; at dropoff it saw `D`; after completion the marker and
  service route were gone.
- MANUAL ride: `w0005·r0000`, taxi `…0003`, pickup `sz:2-3`, dropoff `sz:3-2`, boarding tick 2344,
  completion tick 10519, release `COMPLETED`.
- Failed ride: `w0035·r0000`, taxi `…0012`, `BLOCKED` health fact, terminal `FAILED`,
  `TAXI_BLOCKED`, one receipt and the claim removed.
- Panel: completed row `Cursă încheiată` and failed row `Cursă eșuată` + `TAXI_BLOCKED`.

Screenshots: `01-auto-pickup`, `02-auto-onboard`, `03-auto-dropoff`, `04-auto-completed`,
`05-pickup`, `06-onboard`, `07-dropoff`, `08-completed`, `09-failed`, `10-panel`.

## Commands

All commands run in the worktree with Node 24.21.0 through Volta.

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run format:check` | PASS |
| `npm run check:architecture` | PASS |
| `npm run docs:check -- --check` | PASS (29 tasks, 32 module docs, 1811 local links) |
| `npm test` | 3611 passed, 0 failed, 14 skipped (3625 tests) |
| `npm run build` | PASS (Vite build; existing large-chunk warning only) |
| `npm run composition:report -- --check` | PASS (236 transcript current) |
| `npm run ride:live -- --check` | PASS (264 transcript unchanged) |
| `npm run ride:live:lifecycle -- --check` | PASS (265 transcript current) |
| `npm run civil:traffic` | PASS (058 transcript regenerated with the additive limits) |
| `npm run ride:live:lifecycle:probe` | PASS 40/40 (Chrome 157, WEBGL2) |

## Limitations

1. The AUTO actor uses the existing 058 discrete lane-junction geometry: at an intersection the
   position may step across the unpainted gap between lane centerlines. Route progress stays
   continuous (0.222 m/tick), no observation override is used and there is no teleport to the zone
   anchor; smoothing intersection connectors is outside this PBI.
2. The probe's manual controller is a probe helper, not gameplay code; it uses real keyboard input
   and real authoritative positions.
3. Economy, fare, reviews and KPI remain PBI 266.
4. The marker layer is a projected DOM overlay, not a final 3D passenger asset; 147's contract calls
   for a marker and occupancy, not a mesh.
5. No FPS/GPU/hardware measurement is claimed; the browser probe is functional evidence, not a
   performance certificate.
