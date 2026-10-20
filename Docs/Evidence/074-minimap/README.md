# Evidence 074 - Minimapă și traseul curent

Targeted validation (`targeted-validation-v1`) for PBI 074. The evidence covers the pure minimap
contract and world-to-map transform, the real 032/033 geometry, the 041 route certified through 064,
the 057/061/064 composition, the two-canvas adapter, the committed deterministic transcript and an
optional Chromium capture of the exact drawing commands.

## What was delivered

- `src/ui/minimap-format.ts` - `074-minimap-v1`: strict frame parser, north-up uniform transform,
  static scene extraction, route tracing, marker projection, accessible description and the drawing
  command port/`paintMinimapLayer`.
- `src/ui/minimap.ts` - `createMinimap`: one static canvas painted once, one dynamic canvas repainted
  at a 10 Hz ceiling with identity-change bypass, fixed DOM, zero listeners and idempotent disposal.
- `src/app/minimap.ts` - `readMinimapGeometry` (real 032 map + 033 directed graph) and
  `readMinimapFrame` (real 057 registry + 061 lifecycle + 064 ETA). No route, taxi, zone, ETA or map
  is invented.
- `src/ui/index.ts`, `src/app/index.ts` - additive public exports.
- `src/style.css` - minimap layout; the static canvas owns the background, the dynamic canvas stays
  transparent so roads remain visible under the route.
- `tests/ui/minimap-fixture.ts`, `tests/ui/minimap.test.ts` - deterministic DOM/recording-2D harness
  and 12 tests (baseline 1291 -> 1303).
- `tests/app/minimap-report.ts`, `scripts/run-minimap-report.mjs`, `npm run hud:minimap` -
  deterministic 6-scenario transcript with 25 checks, drawing commands and serialized DOM.
- `scripts/capture-minimap.mjs` - optional Playwright capture of the emitted commands.
- `Docs/minimap.md`, paragraph in `Docs/27-reglaje-hud-si-camera.md`.
- `report.json`, `report.md`, `checks.txt`, `tests.txt`, `tests-full-raw.txt`, `capture.json` and
  five PNG captures in this folder.

## Real bindings

| Minimap value | Real source | Rule |
| --- | --- | --- |
| Roads, intersections, movements | 032 `RoadMap`, 033 `LaneGraph` | directed lane polylines, real intersection areas, declared Movement paths |
| Service-zone anchors | 032 `serviceZones[].anchorNodeId` | real node position; no marker if the zone is absent |
| Current route | 064 `EtaSnapshot.routeLaneIds` | drawn only for the matching ride/taxi/state/leg and `READY`; never a ride-record fallback |
| Progress and ETA | 064 `EtaSnapshot` | certified values only; unavailable is explicit, never `0` |
| Taxi identity | 057 `FleetVehicle` | selected taxi, slot and machine id in the accessible text |
| Ride and zone ids | 061 `RideRecord` | pickup/dropoff roles follow the ride record |
| Position and heading | host 005 readback | projected as-is; the marker is never snapped to the route |

## Projection and route rules

```text
scale = min((width - 2·padding)/(maxX − minX), (height - 2·padding)/(maxZ − minZ))
xPx   = width/2 + (xM − centerXM)·scale
yPx   = height/2 − (zM − centerZM)·scale      // +Z is north, so it moves up
```

The transform is uniform, deterministic and derived only from `map.bounds`; it is documented in
`Docs/minimap.md` and asserted with exact pixels. The route is the exact certified 064 lane
sequence; consecutive lanes are joined by the real Movement path when one exists and otherwise keep
the real junction gap. A lane without geometry fails the whole route closed (`NO_ROUTE`), so no
partial or invented route can be drawn. `ROUTE_MISSING`, `ROUTE_STALE` and `ROUTE_INVALID` never fall
back to the ride record. `OFF_ROUTE`/`POSITION_INVALID` keep the readable route and the last
certified progress, but no taxi marker when the position is missing.

## Explicit states

- No 064 estimate: `Fără rută: 064 nu a observat încă o estimare`, ETA `Fără estimare`.
- Stale/missing route: `Fără rută: ruta nu mai corespunde planului 041 (ROUTE_STALE)`.
- No position: `Poziția taxiului nu este disponibilă`; the route may still be shown.
- Taxi change: the old ride and route are dropped; the new taxi marker is immediate.
- Foreign ride: `FOREIGN_VEHICLE`, no P/D markers and no route.
- Missing service zone: no marker plus `zona lipsește din hartă`.

## Test sensitivity (real mutation probes)

Each probe was applied temporarily to the named source file, the named test was executed alone, and
the original file was restored byte-for-byte. The observed failure is recorded verbatim.

| Plausible wrong implementation | Mutation | Test that failed | Observed failure |
| --- | --- | --- | --- |
| South-up / inverted projection | `centerYPx − …` -> `centerYPx + …` | `074 north-up world-to-map transform is one deterministic uniform projection` | `10 != 230` |
| Pickup/dropoff markers swapped | `addZone` called with dropoff as PICKUP and pickup as DROPOFF | `074 pickup and dropoff markers come from the ride zones and are never swapped` | actual `service-2`, expected `service` |
| Taxi snapped onto the route | taxi point became `route.points[0]` before the projected readback | `074 taxi marker uses the real position and heading, never snapping to the route` | `46.66666666666667 != 156.66666666666666` |
| Stale route survives a replan | `NO_ROUTE` returned before clearing/repainting the dynamic canvas | `074 a replanned or stale route replaces the drawn route instead of leaving it behind` | actual `READY`, expected `NO_ROUTE` |
| Unbounded redraw | removed the 10 Hz throttle branch | `074 markers repaint at a bounded rate, bypass identity changes and reuse static geometry` | `dynamic paints 60` |
| Route invented without a certified 041 path | `NO_ROUTE` fell back to `['lane-a', 'lane-b']` | `074 no-route and no-position are explicit states and never crash` | actual `READY`, expected `NO_ROUTE` |

The real 064 fixture also protects ETA/progress: the report compares `~duration` and
`progress% · distance` with the real `EtaSnapshot`, and the stale scenario asserts that a blocked
planner input produces `ROUTE_STALE` with no route lanes.

## Browser capture

Playwright is not a project dependency. A cached Playwright 1.62.1 installation and its Chromium
browser were used explicitly; the committed script skips with a clear message when Playwright is not
available. The capture replays the exact command lists committed in the report, so it does not run a
second projection.

```powershell
$env:PLAYWRIGHT_MODULE = "$env:LOCALAPPDATA\npm-cache\_npx\e41f203b7505f1fb\node_modules\playwright\index.mjs"
volta run --node 24.21.0 -- node --import ./scripts/register-typescript.mjs scripts/capture-minimap.mjs
```

Result: 5 captures, 45/45 checks, Chromium 151.0.7922.34, viewport 1280x720, DPR 1.

| Capture | File | What it proves |
| --- | --- | --- |
| TO_PICKUP · start | `capture-to-pickup-start.png` | real street grid, route, taxi at start, P/D markers, ETA/progress |
| TO_PICKUP · progress | `capture-to-pickup-progress.png` | taxi advanced along the certified route and progress changed |
| TO_PICKUP · no position | `capture-to-pickup-no-position.png` | route stays, taxi marker absent, explicit position state |
| taxi switch · no ride | `capture-taxi-switch-no-ride.png` | old route dropped, new taxi marker only |
| TO_PICKUP · stale after replan | `capture-to-pickup-stale-after-replan.png` | stale route removed, explicit `ROUTE_STALE` text |

Each capture also checks one minimap, two canvases, non-empty static and dynamic pixel counts, the
visible route state, explicit position state, north-up accessible text, viewport fit and a real PNG
signature. See `capture.json`.

Important limitation: the capture replays deterministic commands over the real map/route fixture. It
is **not** a live simulation frame, does not include the 3D city, camera, traffic or a real
playtest, and is not an FPS/GPU/hardware measurement.

## Commands and exact results

All commands ran in `C:\Users\aandr\Sites\self-driving-academy\.worktrees\pbi-074` on branch
`loop-pbi/pbi-074`, Node v24.21.0 via `volta run --node 24.21.0 --`.

| Command | Exact result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run format:check` | "All matched files use Prettier code style!" |
| `npm run check:architecture` | PASS, 197 TypeScript files, negative probes PASS |
| `npm run check:parameter-catalog` | "Parameter catalog is synchronized." |
| `npm run hud:minimap -- --check` | 25/25 checks, 6 scenarios, PASS, transcript current |
| `scripts/capture-minimap.mjs` | 5 captures, 45/45 checks, PASS |
| `node --test tests/ui/minimap.test.ts` | 12/12 pass, 0 fail |
| `npm test` | 1303/1303 pass, 0 fail, 1 suite, 51042.9383 ms |

`tests-full-raw.txt` keeps the full `npm test` transcript. The known unrelated
`tests/workers/protocol.test.ts` flake did not occur.

## Limitations

- The production bootstrap has no fleet/ride session yet. `readMinimapGeometry` and
  `readMinimapFrame` are the ready composition seam; wiring them into the live driving host remains
  074/075/153 integration work.
- The minimap is north-up only; heading-up rotation and manual zoom are not part of V1 here.
- The map geometry is drawn at 240x240 CSS pixels without device-pixel-ratio scaling; a future
  responsive host may add a larger backing store.
- The optional Chromium capture is a local tool, not part of `npm test`, and is not a live gameplay
  or hardware measurement.
- No performance, FPS, GPU, camera, audio or hardware claim is made or measured here.
