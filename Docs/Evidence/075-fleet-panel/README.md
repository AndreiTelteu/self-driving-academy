# Evidence 075 - Lista taxiurilor, filtre și sortare

Targeted/functional validation for PBI 075. The evidence covers the pure panel contract, the DOM
adapter with stable row identity, the real 057/061/064 composition, the deterministic transcript and
the project checks. No browser capture is claimed.

## What was delivered

- `src/ui/fleet-panel-format.ts` - `075-fleet-panel-v1`: strict snapshot parser, the four filters, the
  three sorts, the followed-taxi/blockage pinning rule, row/accessible text, counts and a
  deterministic signature.
- `src/ui/fleet-panel.ts` - `createFleetPanel`: DOM built once, one `li`+`button` row per `vehicleId`
  reused and moved on filter/sort/reopen, 10 Hz write/reorder ceiling with identity bypass, polite
  live summary, idempotent disposal.
- `src/app/fleet-panel.ts` - `readFleetPanelSnapshot` (real 057 registry + 061 lifecycle + 064 ETA,
  TAXI members only, ETA dropped on ride/taxi/state/leg mismatch) and `createFleetPanelSelectPort`
  (maps a clicked row to a `FLEET` intention of 068 without owning selection state).
- `src/ui/index.ts`, `src/app/index.ts` - additive public exports.
- `src/style.css` - panel layout, text/symbol states, followed-row outline, keyboard focus.
- `tests/ui/hud-dom.ts` - additive `insertBefore`, `addEventListener`/`removeEventListener`,
  `dispatch` and `value` support for the existing fake DOM (no test behaviour changed).
- `tests/ui/fleet-panel-fixture.ts`, `tests/ui/fleet-panel.test.ts` - deterministic 30-taxi frame,
  fake-DOM harness and 18 tests.
- `tests/app/fleet-panel-report.ts`, `scripts/run-fleet-panel-report.mjs`, `npm run fleet:panel` -
  7 deterministic scenarios and 44 checks, with serialized DOM and adapter statistics.
- `Docs/fleet-panel.md`, a paragraph in `Docs/27-reglaje-hud-si-camera.md`, a paragraph in
  `Docs/README.md`, and this evidence folder.

## Real bindings

| Panel value | Real source | Rule |
| --- | --- | --- |
| Taxi identity, slot, class, profile | 057 `FleetVehicle` | `driverKind: TAXI` only; civilians belong to 076 |
| Applied profile version, control mode | 057 `FleetVehicleState` | read back, never defaulted |
| Active ride and stage | 061 `RideRecord` from `lifecycle.active()` | `null` when the taxi has no active ride |
| ETA, service state, progress | 064 `EtaSnapshot` | kept only when ride/taxi/state/leg match |
| Blockage | 064 `serviceState === 'BLOCKED'` | `blocked` must equal that value or the frame is rejected |
| Followed taxi | host camera target | pins a row only when it is a taxi in the list |

## Filter, sort and pinning rules

Filters: `ALL` (default), `BUSY` (active ride), `FREE` (no active ride), `BLOCKED` (certified blocked
service). After the filter decides membership, two rows are always kept:

1. the followed taxi, when it exists in the taxi list (a civilian selection pins nothing);
2. the first blocked taxi, by lowest slot, while any blocked taxi exists.

`counts.pinned` counts only rows added by these rules. Sorts run afterwards, so they never duplicate
or drop a row: `SLOT` (slot, then id), `STATE` (blocked, `TO_PICKUP`, `PICKUP`, `TO_DROPOFF`,
`DROPOFF`, no ride, terminal, then slot) and `ETA` (certified seconds ascending, unavailable last,
then slot).

On the deterministic frame: `ALL` 30/30, `BUSY` 17 (2 pinned), `FREE` 15 (0 pinned), `BLOCKED` 11
(1 pinned). The followed taxi is slot 12 and the first blockage is slot 21.

## Stable identity, writes and disposal

`createdRows` grows once per `vehicleId`; filtering detaches rows instead of destroying them, and a
row is removed only when the taxi disappears from the snapshot. Reopening a closed panel reuses the
exact element objects (`createdRows` unchanged). `close()` only sets `hidden`; `open()` re-renders the
retained view.

Writes and reorders are capped at `10 Hz`. A followed-taxi change, a filter change, a sort change or a
changed blocked/service signature bypasses the ceiling. An identical frame writes nothing
(`signature` unchanged). Malformed, stale or out-of-clock frames are rejected by the parser/guards
before any DOM mutation. `dispose()` is idempotent, removes every node and listener and resets the
retained view.

## Accessibility

`section[aria-label]` + `aria-describedby` describe the filter, sort, counts and the pinning rules.
The list is `ul[role="listbox"]`; each row is a native `button` with `role="option"`,
`aria-selected="true"` only on the followed taxi and a full `aria-label`. The summary is
`role="status"` with `aria-live="polite"` and `aria-atomic="true"`. There is no global key listener,
so driving keys keep working; two `change` listeners and one `click` listener per row are reported by
`getStats().listeners`.

## Commands and exact results

All commands ran in `C:\Users\aandr\Sites\self-driving-academy` on `main`, Node v24.19.0, npm 11.17.0.

| Command | Exact result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run format:check` | "All matched files use Prettier code style!" |
| `npm run check:architecture` | PASS, 200 TypeScript files, 6+4+3 negative probes PASS |
| `npm run fleet:panel` | 44/44 checks, 7 scenarios, overall PASS |
| `npm run fleet:panel -- --check` | "Fleet panel report is current: …\report.json" |
| `node --test tests/ui/fleet-panel.test.ts` | 18/18 pass, 0 fail |
| `npm test` | 1321/1321 pass, 0 fail, 1 suite |

`report.json` and `report.md` are the committed transcript of the 44 checks and 7 scenarios.

## Limitations

- The production bootstrap has no fleet/ride session yet. `readFleetPanelSnapshot` and
  `createFleetPanelSelectPort` are the ready composition seam; wiring them into the live driving host,
  the pause rule 070 and the key binding `Tab` remains 075/153 integration work.
- The panel lists taxis only; civilian rows and the civilian panel are 076.
- `blocked` comes from the certified 064 service state. The 045 `routeBlocked` flag is not read here,
  so a route blockage detected only by 045 still reaches the panel through 064 once an estimate is
  published.
- No browser capture was produced: no Playwright capture script is added for this PBI and no PNG is
  claimed. The serialized DOM in the report is the visual evidence.
- No FPS, GPU, memory or hardware measurement is made; the report is a deterministic transcript.
