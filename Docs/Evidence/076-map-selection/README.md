# Evidence 076 - Selectarea vehiculelor prin hartă

Functional/targeted validation for PBI 076. The evidence covers the pure snapshot/marker/hit-test
contract, the DOM overlay with stable marker identity, the real 057 registry composition, the
deterministic transcript and the project checks. No browser capture is claimed.

## What was delivered

- `src/ui/map-selection-format.ts` - `076-map-selection-v1`: strict snapshot parser, marker projection
  through the 074 `MinimapTransform`, `T`/`C` symbols, accessible descriptions, counts, signature and
  the deterministic `hitTestMapMarker`.
- `src/ui/map-selection.ts` - `createMapSelectionOverlay`: one native `<button>` per `vehicleId`,
  percent positioning over the minimap area, reuse on position/label/kind changes, removal only when
  the vehicle disappears, 10 Hz ceiling with followed/kind bypass, optional `setFollowed`, idempotent
  disposal and zero global listeners.
- `src/app/map-selection.ts` - `readMapSelectionSnapshot` (real 057 taxis and civilians, host position
  readback, 068 camera target, unknown positions omitted) and `createMapSelectionPort` (one `WORLD`
  intention of 068 per marker, unknown identity returns `false`).
- `src/ui/index.ts`, `src/app/index.ts` - additive public exports.
- `src/style.css` - overlay layout, above-canvas marker layer, round taxi/square civilian shapes,
  `T`/`C` text, selection check plus double ring, keyboard focus and label tooltip.
- `tests/ui/map-selection-fixture.ts`, `tests/ui/map-selection.test.ts` - deterministic 30-taxi plus
  41-civilian frame, distant civilian, fake-DOM harness and 13 tests.
- `tests/app/map-selection-report.ts`, `scripts/run-map-selection-report.mjs`, `npm run map:selection`
  - 8 deterministic scenarios and 43 checks, with serialized DOM and adapter statistics.
- `Docs/map-selection.md`, additive pointers in `Docs/minimap.md`, `Docs/08-interfata-camera-si-control.md`
  and `Docs/README.md`, and this evidence folder.

## Identity decision

The marker identity is the 057 fleet `vehicleId`, exposed as both `markerId` and `data-vehicle-id` (and
`data-marker-id`). It is never an array index, a Babylon mesh, a body handle or a render order. A
representation update - new position, new label, `TAXI` -> `CIVIL` - reuses the exact same button
element. `created` therefore stays constant while the element is moved and its text/attributes are
updated. A marker element and its click listener are destroyed only when the vehicle disappears from
the snapshot; the projection reports that case as `counts.removed` relative to the last rendered
projection.

## Hit-test decision

`hitTestMapMarker(markers, pointPx, options?)` is pure and only considers selectable markers with
finite coordinates. The effective radius is the caller's value or 12 px, clamped to 64 px; a distance
equal to the radius is a hit. The nearest marker wins; an exact tie is broken by the lexicographically
smaller `vehicleId`, independent of array order. Invalid pointer coordinates, invalid marker
coordinates and clicks outside the radius return `null`. This is a 2D marker hit test, not 018 Babylon
picking and not a raycast against the 3D scene.

## Real bindings

| Marker value | Real source | Rule |
| --- | --- | --- |
| Taxi identity, slot, label | 057 `FleetVehicle` with `driverKind: TAXI` | stable `vehicleId`, real slot |
| Civilian identity, slot, label | 057 `FleetVehicle` with `driverKind: CIVILIAN` | civilians keep their own real `vehicleId` |
| Position | injected host readback `(vehicleId) => {x,y,z} | null` | omitted when missing or non-finite |
| Followed vehicle | 068/017 camera target readback | explicit frame override otherwise |
| Selection intent | 068 `enqueue(identity, 'WORLD')` | unknown identity is `false`, never invented |

The module reads no physics, writes no body, calls no camera absolute move and never performs an
authority takeover. The overlay `select` port is the only effect of a click.

## Scenarios and checks

The committed [report.json](report.json) and [report.md](report.md) contain 8 scenarios:

1. 30 taxis + 41 civilians, including the followed taxi;
2. a distant civilian projected at its real coordinates and hit-testable;
3. a civilian click followed by an immediate followed-marker change;
4. one removed marker with its element/listener cleanup;
5. stable identity across position, label and kind updates;
6. 60 changing frames under the 10 Hz ceiling;
7. a non-selectable marker that cannot be picked;
8. the real 057 registry binding with one vehicle omitted for an unknown position.

The 43 checks cover the parser contract, taxi/civilian/distant projection, stable marker identity,
removed-marker cleanup, nearest/tie/outside/invalid hit tests, one `WORLD` intention per click,
`aria-pressed`, the write ceiling and bypass, identical-frame no-write, rejected-frame DOM isolation,
deterministic DOM, bounded elements, zero global listeners and the real fleet binding.

## Commands and exact results

All commands ran in `C:\Users\aandr\Sites\self-driving-academy` on `main`, Node v24.19.0, npm 11.17.0.

| Command | Exact result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run format:check` | "All matched files use Prettier code style!" |
| `npm run check:architecture` | PASS, 203 TypeScript files, 6+4+3 negative probes PASS, lifecycle PASS |
| `npm run map:selection` | 43/43 checks, 8 scenarios, overall PASS |
| `npm run map:selection -- --check` | "Map selection report is current: …\report.json" |
| `node --import ./scripts/register-typescript.mjs --test tests/ui/map-selection.test.ts` | 13/13 pass, 0 fail |
| `npm test` | 1334/1334 pass, 0 fail, 1 suite |

## Limitations

- The production bootstrap has no fleet/ride session yet. `readMapSelectionSnapshot` and
  `createMapSelectionPort` are the ready composition seam; wiring them into the live driving host,
  the 068 selection view, the 070 pause rule and the minimap DOM remains integration work.
- The overlay host must be a positioned box that exactly covers the minimap map area. The adapter
  writes percent positions and does not measure the canvas or the device pixel ratio.
- Civilian positions come from the host readback (005/058). The report uses the real 057 civilian
  registry members, but it does not spawn or drive 058 traffic actors and does not claim a live
  civilian simulation frame.
- The hit test is marker-based 2D geometry; it does not replace 018 nearest-hit occlusion picking for
  the 3D scene. Both can feed the same 068 `WORLD` intention through their own host ports.
- The 30-taxi plus 41-civilian frame is deterministic synthetic input for the adapter; the real
  binding scenario uses the actual 057 registry fixture (24 taxis and 20 civilians).
- No browser capture or PNG is produced or claimed. The serialized DOM in the report is the visual
  evidence.
- No FPS, GPU, memory or hardware measurement is made; the report is a deterministic transcript.
