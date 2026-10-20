# Evidence 073 - HUD viteză, mod taxi și cursă

Targeted validation (`targeted-validation-v1`) for PBI 073. The evidence covers the pure HUD
contract, the DOM adapter, the real 057/061/064 composition, the committed deterministic transcript
and an optional Chromium capture of the exact HUD DOM.

## What was delivered

- `src/ui/taxi-hud-format.ts` - `073-taxi-hud-v1`: snapshot contract, strict parser, mode/stage
  mapping and the only number formats (km/h, duration, distance, ETA interval, progress).
- `src/ui/taxi-hud.ts` - `createTaxiHud`: one-time DOM creation, 10 Hz text writes, identity-change
  bypass, native `<details>` for profile/ride details, no listeners.
- `src/app/taxi-hud.ts` - `readTaxiHudSnapshot`: composition of the real 057 fleet registry, 061 ride
  lifecycle and 064 ETA; no ride, taxi, speed, profile or ETA is invented.
- `src/ui/index.ts`, `src/app/index.ts` - additive public exports.
- `src/style.css` - readable HUD layout; text/symbol remain the mode indicator, colour only
  reinforces it.
- `tests/ui/hud-dom.ts` - minimal deterministic DOM/serializer shared by tests and report.
- `tests/ui/taxi-hud.test.ts` - 12 tests (baseline 1279 -> 1291).
- `tests/app/taxi-hud-report.ts`, `scripts/run-taxi-hud-report.mjs`, `npm run hud:taxi` -
  deterministic 7-scenario transcript with 23 checks and serialized DOM.
- `scripts/capture-taxi-hud.mjs` - optional Playwright capture of the generated DOM.
- `Docs/hud.md`, paragraph in `Docs/27-reglaje-hud-si-camera.md`.
- `report.json`, `report.md`, `tests.txt`, `tests-full-raw.txt`, `checks.txt`, `capture.json` and
  four PNG captures in this folder.

## Real bindings

| HUD value | Real source | Rule |
| --- | --- | --- |
| Speed | host physical 005 readback, m/s magnitude | finite nonnegative or `null`; `round(m/s x 3.6)` km/h |
| Taxi slot | 057 `FleetVehicle.slot` | default row `#<slot>`; full machine id only in details |
| Class / profile / profile version | 057 `FleetVehicle` + `FleetVehicleState` | details; applied version is the simulation state |
| Mode | accepted 066/067 projection | exact `AUTO`/`MANUAL`/`LEARNING` labels plus `A`/`M`/`L` |
| Ride stage and zones | 061 `RideRecord` | all seven states; no retargeting |
| ETA, interval and progress | 064 `EtaSnapshot` | only when state/leg/taxi still match the 061 record |
| Service state | 064 snapshot | `FREE_FLOW`, `CONGESTED`, `BLOCKED` |

The source drops a 064 estimate whose ride, taxi, state or leg no longer matches the 061 record.
This prevents a previous pickup ETA from surviving boarding, completion or a taxi switch.

## Formatting and explicit states

- Speed: `12.5 m/s` -> `45 km/h`; `null`, `NaN`, `Infinity` or a negative value -> `—` + accessible
  "Viteză indisponibilă".
- Duration: `59.6 s` -> `1 min`; `125.4 s` -> `2 min 05 s`; interval `55 s – 1 min 05 s`.
- Distance: `<1000 m` in metres, otherwise one decimal in km (`1234.5 m` -> `1.2 km`).
- Progress: `42% · 320 m`; ETA nominal: `~1 min 30 s`.
- `ARRIVED` -> "La pasager" at pickup, "La destinație" at dropoff; never "0 s".
- `UNAVAILABLE` -> "Indisponibil"; the closed 064 reason stays in details.
- No ride -> "Nicio cursă activă", "Fără estimare", progress `—`; never "Cursă încheiată".
- Foreign ride -> "Cursă a altui taxi"; its ETA and progress are not shown.
- Completed -> "Cursă încheiată", ETA `—`, progress `100% · 0 m`; no active estimate.
- `SERVICE_BLOCKED` -> "Indisponibil" plus "Serviciu blocat"; never a zero-second promise.

A lower tick in the same session/epoch throws `Stale taxi HUD snapshot`; a lower display clock throws
`Taxi HUD clock`. A malformed snapshot is rejected before any DOM write. Text is written only when it
changes, so an identical 10 Hz frame writes nothing. A mode/taxi/ride/stage change bypasses the
throttle so no stale label survives inside the 100 ms window.

## Test sensitivity (real mutation probes)

Each probe was applied temporarily to the named source file, the named test was executed alone, and
the original file was restored byte-for-byte. The output below is the observed failure.

| Plausible wrong implementation | Mutation | Test that failed | Observed failure |
| --- | --- | --- | --- |
| Fake/wrong speed unit conversion | `speedMps * 3.6` -> `speedMps * 3` | `073 real 057/061/064 binding drives taxi, profile, stage, speed, ETA and progress` | actual `'38'`, expected `'45'` |
| Missing ride rendered as completed | no-ride stage -> "Cursă încheiată" | `073 a taxi without a ride shows explicit empty state and never a fake completion` | actual `'Cursă încheiată'`, expected `'Nicio cursă activă'` |
| Stale mode label after a change inside the throttle window | removed `mode` from identity change | `073 a taxi change drops the old ride and a mode change is never stale` | actual `'Conduce AI-ul'`, expected `'Conduci · învățare oprită'` |
| Missing ETA shown as `0 s` | no-ride ETA -> `'0 s'` | `073 a taxi without a ride shows explicit empty state and never a fake completion` | actual `'0 s'`, expected `'Fără estimare'` |

The real 064 fixture also protects "fake ETA": `073 real 057/061/064 binding...` compares the displayed
`~duration` with `estimate.etaSeconds`, and `073 a BLOCKED service...` asserts the real
`SERVICE_BLOCKED` reason and no zero value.

## Browser capture

Playwright is not a project dependency. A cached Playwright 1.62.1 installation and its Chromium
browser were used explicitly; the committed script skips with a clear message when Playwright is not
available.

```powershell
$env:PLAYWRIGHT_MODULE = "$env:LOCALAPPDATA\npm-cache\_npx\e41f203b7505f1fb\node_modules\playwright\index.mjs"
volta run --node 24.21.0 -- node --import ./scripts/register-typescript.mjs scripts/capture-taxi-hud.mjs
```

Result: 4 captures, 28/28 checks, Chromium 151.0.7922.34, viewport 1280x720, DPR 1.

| Capture | File | What it proves |
| --- | --- | --- |
| AUTO · TO_PICKUP | `capture-auto-to-pickup.png` | `A` + "Conduce AI-ul", speed 29 km/h, real route/ETA/progress, details closed |
| MANUAL · TO_PICKUP | `capture-manual-to-pickup.png` | `M` + "Conduci · învățare oprită" is a text/symbol difference, not colour only |
| AUTO · SERVICE_BLOCKED | `capture-auto-service-blocked.png` | "Indisponibil"/"Serviciu blocat", no zero ETA |
| AUTO · no ride | `capture-auto-no-ride.png` | "Nicio cursă activă"/"Fără estimare", never a fake completion |

Each capture also checks one HUD in the document, mode/stage text, speed font size greater than body
text (>=30 px), collapsed details, HUD fully inside the viewport and a real PNG signature. See
`capture.json`.

Important limitation: the capture renders the exact DOM snapshot produced by `createTaxiHud` over the
real 057/061/064 fixture. It is **not** a live simulation frame, does not include the 3D city, camera,
minimap, traffic or a real playtest, and is not an FPS/GPU/hardware measurement. Visual driving
acceptance remains with 153/224/235.

## Commands and exact results

All commands ran in
`C:\Users\aandr\Sites\self-driving-academy\.worktrees\pbi-073` on branch `loop-pbi/pbi-073`, Node
v24.21.0 via `volta run --node 24.21.0`.

| Command | Exact result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run format:check` | "All matched files use Prettier code style!" |
| `npm run check:architecture` | PASS, 194 TypeScript files, all negative probes PASS |
| `npm run check:parameter-catalog` | "Parameter catalog is synchronized." |
| `npm run hud:taxi -- --check` | 23/23 checks, 7 scenarios, PASS, transcript current |
| `scripts/capture-taxi-hud.mjs` | 4 captures, 28/28 checks, PASS |
| `node --test tests/ui/taxi-hud.test.ts` | 12/12 pass, 0 fail |
| `npm test` | 1291/1291 pass, 0 fail, 1 suite, 48982.9709 ms |

`tests-full-raw.txt` keeps the full `npm test` transcript. The known unrelated
`tests/workers/protocol.test.ts` flake did not occur.

## Limitations

- The production bootstrap has no fleet/ride session yet. `readTaxiHudSnapshot` is the ready
  composition seam; wiring it into the live driving host remains 074/075/153.
- The default HUD has no minimap drawing. It shows the real route as pickup -> dropoff zone ids and
  the next objective; 074 owns the map.
- The DOM test harness is a deterministic fake, not a browser. The Chromium capture covers layout and
  text of the generated DOM, not live simulation input.
- Playwright is not installed as a project dependency, so the capture is an optional local tool and
  is not part of `npm test`.
- No performance, FPS, GPU, camera, audio or hardware claim is made or measured here.
