# Evidence 081 - Setări unități, cameră, grafică și audio

Targeted/functional validation for PBI 081. The evidence covers the strict preferences draft, the
display-only SI conversion, the DOM adapter with native controls, the real 009 settings composition
and the deterministic transcript. No browser capture, rendered audio or hardware measurement is
claimed.

## What was delivered

- `src/ui/game-settings-format.ts` - `081-game-settings-v1`: strict frozen draft (`saved`,
  `proposed`, `defaults`, `audio`, `revision`), the 009 domains for the seven comfort sliders and
  graphics, display-only `formatSpeedDisplay`/`formatDistanceDisplay`/`unitPreview`, dirty section
  flags, `INVALID` reasons, summary/signature and the pure setters, reset and revert operations.
- `src/ui/game-settings.ts` - `createGameSettingsPanel`: DOM built once with native `select`,
  `input[type=range]` and checkbox controls, one `change` listener per control, visible numeric
  values, live unit preview, a two-step reset confirmation, cancel, save disabled unless `DIRTY`,
  `update(draft, nowMs)`, `getStats()` and idempotent `dispose()`.
- `src/app/game-settings.ts` - `readGameSettingsDraft`, `applyGameSettings`, `resetGameSettings`,
  `gameSettingsValuesFrom`, `gameSettingsDefaults` and `sameGameSettings`. Only units, camera, comfort
  and graphics change; bindings, player and scenario are preserved and the control revision is
  bumped exactly once for a comfort change.
- `src/ui/index.ts`, `src/app/index.ts` - additive public exports.
- `src/style.css` - settings sections, range rows, visible values, unavailable audio, issue text,
  policy note, disabled save and focus.
- `tests/ui/game-settings-fixture.ts`, `tests/ui/game-settings.test.ts` - deterministic settings
  fixture, fake-DOM harness and 17 tests.
- `tests/app/game-settings.test.ts` - 8 composition, revision, reset and separation tests.
- `tests/app/game-settings-report.ts`, `scripts/run-game-settings-report.mjs`,
  `npm run game:settings` - 7 deterministic scenarios and 45 checks with serialized DOM.
- `Docs/game-settings.md`, additive paragraphs in `Docs/27-reglaje-hud-si-camera.md`,
  `Docs/08-interfata-camera-si-control.md` and `Docs/README.md`, and this evidence folder.

## Rules validated

| Rule | Implementation |
| --- | --- |
| Display units never change SI | `formatSpeedDisplay`/`formatDistanceDisplay` take m/s and m, return a display view plus the untouched `siMps`/`siM`; no function writes physics, profile or style |
| Units are visible and persisted | `km/h`/`mph` and `m`/`ft` selects update only `RuntimeSettings.units`; the preview shows `12.5 m/s = 45 km/h = 28 mph` |
| Camera/graphics do not touch the fleet | Only `input.cameraMode` and `quality` change; no `src/profiles` or `src/fleet` import or mutation exists |
| Comfort is persistable | All seven control preferences map to `ControlPreferences` with the 009 domains 0–100 and FOV 60–100° |
| Control revision is exact | Units/camera/graphics keep `input.control.version`; a comfort change sets `current + 1` exactly once |
| Reset is real and local | Defaults come from `createDefaultSettings`; the panel asks for confirmation and nothing persists before Salvează |
| Bindings survive | `input.bindings` is copied from the real settings on apply and reset; the draft does not contain bindings |
| Audio is unavailable | The section renders `Indisponibil · 148` with `aria-disabled="true"`; no volume, mute or other audio control is created |
| Style editor is separate | The panel has no learned-parameter slider; the policy text is `Setări dispozitiv · nu modifică profilul învățat, AI-ul sau stilul flotei` |
| Invalid values are visible | Out-of-range proposed numbers are retained, reported with closed reasons and block save; the app rejects them with `INVALID_DRAFT` |

## Real sources

| Panel value | Real source | Rule |
| --- | --- | --- |
| Saved units/camera/comfort/graphics | `RuntimeSettings.units`, `.input.cameraMode`, `.input.control`, `.quality` | read, never duplicated by hand |
| Defaults | `createDefaultSettings(playerId)` | real 009 values; control revision/mapping preserved |
| Applied candidate | `applyGameSettings` -> `SettingsStore.replace` | atomic complete settings record |
| Reset | `resetGameSettings` | defaults for four sections, bindings/player/scenario preserved |
| Control revision | `input.control.version` | `+1` once only when a comfort field changes |
| Audio | `GAME_SETTINGS_AUDIO` | explicit `UNAVAILABLE`/`PBI_148_PENDING` until 148 |

## Commands and exact results

All commands ran in `C:\Users\aandr\Sites\self-driving-academy` on `main`, Windows, Node v24.19.0,
npm 11.17.0.

| Command | Exact result |
| --- | --- |
| `npm run typecheck` | exit 0 (`tsc --noEmit && tsc -p tsconfig.tests.json --noEmit`, no diagnostics) |
| `npm run lint` | exit 0 (`eslint . --max-warnings 0`, no diagnostics) |
| `npm run format:check` | "All matched files use Prettier code style!" |
| `npm run check:architecture` | PASS, 221 TypeScript files, 6+4+3 negative probes PASS, renderer/persistence lifecycle PASS |
| `npm test` | 1452 tests, 1452 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo, duration_ms 50336.4193 |
| `npm run game:settings` | 45/45 checks, 7 scenarios, overall PASS; wrote `report.json` and `report.md` |
| `npm run game:settings -- --check` | "Game settings report is current: …\Docs\Evidence\081-game-settings\report.json" |
| `node --import ./scripts/register-typescript.mjs --test tests/ui/game-settings.test.ts tests/app/game-settings.test.ts` | 25 tests, 25 pass, 0 fail |

`report.json` and `report.md` are the committed transcript of the 45 checks and 7 scenarios:
`km/h`, `mph`, `mid-session change`, `control change`, `graphics/camera change`,
`reset with preserved bindings` and `audio unavailable`.

## Limitations

- No browser capture or rendered audio was produced. The panel is driven through the deterministic
  fake DOM (`tests/ui/hud-dom.ts`), so the serialized DOM is the visual evidence. The audio section
  is asserted as unavailable; nothing is played.
- The production settings menu does not host this panel yet. `createGameSettingsPanel`,
  `readGameSettingsDraft` and `applyGameSettings` are the composition seam; wiring them into the live
  pause/menu surface remains integration work (229/235).
- Display conversion covers speed and distance only; temperature, volume and other units are out of
  scope.
- The panel does not create renderer, camera, shadows or audio resources. `preferredBackend` remains
  a preference, not proof of backend support, and `resolutionScale` keeps the provisional 0.5–1
  domain from 009.
- Audio preferences, volume and mute controls remain in 148; no schema extension is invented here.
- No FPS, GPU, memory or hardware measurement is made; the report is a deterministic transcript.
