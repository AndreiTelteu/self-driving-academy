# Evidence 082 - Tabloul orașului și drilldown de incidente

Targeted/functional validation for PBI 082. The evidence covers the pure dashboard contract, the
unavailable-vs-zero rule, the DOM adapter with stable metric cards and incident rows, the real
061/028/065 composition, the deterministic transcript and the project checks. No browser capture is
claimed.

## What was delivered

- `src/ui/city-dashboard-format.ts` - `082-city-dashboard-v1`: strict snapshot parser, closed metric id
  / unit / reason / incident kind vocabularies, deterministic incident order (tick descending, then id),
  metric/exposure/row views, `selectIncident` with a map-focus intent, counts, summary and signature.
- `src/ui/city-dashboard.ts` - `createCityDashboard`: DOM built once, one stable card per metric id and
  one `li`+`button[role="option"]` per incident id, 10 Hz write ceiling with incident-set/selection
  bypass, polite live status, idempotent disposal, no global key listener.
- `src/app/city-dashboard.ts` - `readCityDashboardSnapshot` (real 061 completed rides and cash cost,
  real 028 collision incidents, real 065 blockage facts, optional 137-style provider, optional real
  position/distance reads), `createCityDashboardFocusPort` (map drilldown only) and
  `createCityCollisionLog` (bounded sink for the real 028 `drain`).
- `src/ui/index.ts`, `src/app/index.ts` - additive public exports.
- `src/style.css` - cards, exposure block, incident list, drilldown, dashed unavailable state, keyboard
  focus.
- `tests/ui/city-dashboard-fixture.ts`, `tests/ui/city-dashboard.test.ts` - deterministic frames,
  fake-DOM harness and 16 tests.
- `tests/app/city-dashboard-world.ts` - real 061+028+065 world: one completed ride, one `TRAFFIC_BLOCK`
  with a failed ride and one real 028 collision episode.
- `tests/app/city-dashboard-report.ts`, `scripts/run-city-dashboard-report.mjs`, `npm run city:dashboard`
  - 7 deterministic scenarios and 47 checks, with serialized DOM and adapter statistics.
- `Docs/city-dashboard.md`, a paragraph in `Docs/08-interfata-camera-si-control.md`, a paragraph in
  `Docs/README.md`, and this evidence folder.

## Unavailable vs zero

| Situation | Contract | Text | `data-state` |
| --- | --- | --- | --- |
| Missing source (137 not Done) | `state: 'UNAVAILABLE'`, `value: null`, `reason: 'SOURCE_MISSING'` | "Indisponibil" + "Sursă lipsă" | `UNAVAILABLE` |
| No exposure for an average | `state: 'UNAVAILABLE'`, `value: null`, `reason: 'NO_EXPOSURE'` | "Indisponibil" + "Fără expunere" | `UNAVAILABLE` |
| Truncated 061/065 history | `state: 'UNAVAILABLE'`, `value: null`, `reason: 'NOT_CERTIFIED'` | "Indisponibil" + "Necertificat" | `UNAVAILABLE` |
| Real zero | `state: 'AVAILABLE'`, `value: 0` | "0" | `AVAILABLE` |

The parser rejects an `UNAVAILABLE` metric that carries a value and an `AVAILABLE` metric without one.
Exposure follows the same rule: an unreadable window is `windows/observations/durationSeconds = null`
with a reason, while a known window with zero rides stays `AVAILABLE` with zeros.

## Incident focus and profile rule

`selectIncident(snapshot, id)` returns the selected view plus exactly one of:

```ts
{ status: 'AVAILABLE', incidentId, positionM }
{ status: 'UNAVAILABLE', reason: 'MISSING_INCIDENT' | 'MISSING_POSITION' }
```

A click on a located incident emits exactly one `focus(incidentId, positionM)` intention; an incident
without a point shows "Poziție indisponibilă" and emits nothing (`focusSkipped`). `createCityDashboardFocusPort`
refuses a non-finite point without calling the host. None of the three 082 source files imports a
profile module or reads `appliedProfileVersion`; the tests assert that statically, so a selection cannot
change a profile, camera mode, authority or physics by construction.

## Real bindings

| Dashboard value | Real source | Rule |
| --- | --- | --- |
| `completedRides` | 061 `lifecycle.terminal()` with `state === 'COMPLETED'` | real zero when nothing completed |
| `averageRideSeconds` | 061 `totalCostSeconds` of completed rides | average only with a positive sample; `NO_EXPOSURE` otherwise |
| `totalDistanceM` | optional `rideDistanceM` read | no port or no measurement -> `UNAVAILABLE` |
| `violations`, `comfortScore` | optional 137-style provider | absent -> `SOURCE_MISSING`, never `0` |
| `collisions` | real 028 `CollisionIncident` in `createCityCollisionLog` | real zero when the window is complete |
| `blockages` | 065 `health.history()` `TRAFFIC_BLOCK`/`IMMOBILIZATION` | `rideId` from the real `releasedRideId` |
| `exposure` | host window counters or 061 retention | `droppedTerminal > 0` -> `NOT_CERTIFIED` |

The real world used by the report completes one ride through the five 061 events, blocks the second
taxi through 065 `TRAFFIC_BLOCK` (which closes its ride as `FAILED` with `TAXI_BLOCKED`) and feeds one
real 028 collision episode at tick 65. The collision keeps the real 028 stable `incidentId`, tick and
vehicle; its position comes from the injected host read, never from the contract.

## Commands and exact results

All commands ran in `C:\Users\aandr\Sites\self-driving-academy` on `main`, Windows, Node 24.

| Command | Exact result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run format:check` | "All matched files use Prettier code style!" |
| `npm run check:architecture` | PASS, 218 TypeScript files, 6+4+3 negative probes PASS |
| `npm test` | 1427 tests, 1427 pass, 0 fail |
| `npm run city:dashboard` | 47/47 checks, 7 scenarios, overall PASS |
| `npm run city:dashboard -- --check` | "City dashboard report is current: …\Docs\Evidence\082-city-dashboard\report.json" |
| `node --test tests/ui/city-dashboard.test.ts` | 16/16 pass, 0 fail |

`report.json` and `report.md` are the committed transcript of the 47 checks and 7 scenarios.

## Limitations

- 137 (violations/comfort) is not Done, so `violations` and `comfortScore` are `SOURCE_MISSING`; a real
  provider can be injected through `sources.metrics` without changing the contract.
- 028 collision incidents and 065 blockage facts carry no coordinate. `positionM` is `null` unless the
  host supplies a real `positions(vehicleId)` read, which is why the fixture only locates the colliding
  taxi. No coordinate is invented.
- 028 does not associate a collision with a ride, so a collision `rideId` stays `null`; a blockage keeps
  the real ride id that 065 closed.
- The retained 028/065 windows are bounded. A truncated window is reported as `NOT_CERTIFIED` instead of
  silently under-counting; the retained incidents are still listed.
- The production bootstrap does not mount the dashboard yet. `readCityDashboardSnapshot`,
  `createCityCollisionLog` and `createCityDashboardFocusPort` are the ready composition seam; wiring them
  into the live driving host (and the real 074/076 map focus) remains integration work.
- No browser capture was produced; the serialized DOM in the report is the visual evidence.
- No FPS, GPU, memory or hardware measurement is made; the report is a deterministic functional
  transcript.
