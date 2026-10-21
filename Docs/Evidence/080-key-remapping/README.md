# Evidence 080 - Remaparea comenzilor și conflicte

Targeted/functional validation for PBI 080. The evidence covers the pure draft contract, conflict and
unsupported-code handling, the DOM adapter with explicit key capture, the real 009 settings
composition and the deterministic transcript. No browser or trusted-input capture is claimed.

## What was delivered

- `src/ui/key-remapping-format.ts` - `080-key-remapping-v1`: strict frozen draft, the 15 public 009
  actions with Romanian labels and critical flags, the 009 keyboard-code grammar, the closed
  `UNSUPPORTED_CODE`/`MODIFIER_ONLY`/`RESERVED_BROWSER_CODE`/`EMPTY` rejections, conflict detection
  on code -> actions, row/save states, summary, signature and the pure `setBinding`, `clearBinding`,
  `resetBindings`, `revertBindings` and `projectKeyRemapping` operations.
- `src/ui/key-remapping.ts` - `createKeyRemappingPanel`: DOM built once, one stable row per action,
  inline conflict/unsupported messages, a polite live region, a two-step reset confirmation, save
  disabled unless `DIRTY`, explicit cancel, capture state „Apasă o tastă…”, an escape-cancelled
  capture listener attached only to the capturing button, stable `Tab`/`Enter`/`Space` capture,
  `isCapturing()`, `cancelCapture()`, bounded writes, `getStats()` and idempotent `dispose()`.
- `src/app/key-remapping.ts` - `readKeyRemappingDraft`, `applyKeyRemapping`, `resetKeyRemapping`.
  Defaults come from the real `createDefaultSettings(playerId)`; only `input.bindings` changes and
  `input.control.version` is never bumped. No profile module is imported or touched.
- `src/ui/index.ts`, `src/app/index.ts` - additive public exports.
- `src/style.css` - row layout, conflict/unsupported text and symbols, capture state, disabled save,
  keyboard focus, live region text.
- `tests/ui/key-remapping-fixture.ts`, `tests/ui/key-remapping.test.ts` - deterministic settings
  fixture, fake-DOM harness and 16 tests.
- `tests/app/key-remapping.test.ts` - 6 composition/separation tests.
- `tests/app/key-remapping-report.ts`, `scripts/run-key-remapping-report.mjs`, `npm run key:remapping`
  - 7 deterministic scenarios and 51 checks with serialized DOM and adapter statistics.
- `tests/ui/hud-dom.ts` - additive deterministic `dispatchEvent(type, { code, ... })` support with
  `preventDefault()`/`stopPropagation()` observation; existing click/change behaviour unchanged.
- `Docs/key-remapping.md`, an additive paragraph in
  `Docs/08-interfata-camera-si-control.md`, an additive paragraph in `Docs/README.md`, and this
  evidence folder.

## Rules validated

| Rule | Implementation |
| --- | --- |
| All 15 important actions stay accessible | Every action always has a row and a key; clearing or rejecting a code leaves an explicit invalid row |
| Conflicts are visible and blocking | Every code bound to more than one action is listed, both rows are `CONFLICT`, save stays disabled |
| Unsupported input is explicit | Only `KeyboardEvent.code` in the 009 grammar is accepted; `event.key`, printable letters, bare modifiers and reserved browser keys get closed reasons |
| Reset is real and local | `resetBindings` proposes `createDefaultSettings(playerId)` bindings; the panel asks for a second confirmation; nothing persists without save |
| Save is one explicit intention | `save(bindings)` is emitted once per click, only for `DIRTY` |
| Capture owns one keydown | The listener exists only on the capturing button; the next keydown is prevented and stopped; `Escape` cancels without closing |
| Focus does not leak to driving | No listener on `window`, `document` or the host; the adapter interprets only explicit capture |
| Settings stay distinct from the profile | Bindings live in `RuntimeSettings.input.bindings`; no profile/learning import, no profile state mutation, only the injected `SettingsStore` |

## Real bindings

| Panel value | Real source | Rule |
| --- | --- | --- |
| Current and default codes | `settings.input.bindings` and `createDefaultSettings(playerId)` | read, never duplicated by hand |
| Applied bindings | `applyKeyRemapping` -> `SettingsStore.replace` | atomic complete settings record |
| Reset bindings | `createDefaultSettings(playerId).input.bindings` | exact defaults |
| Control revision | `input.control.version` | preserved on binding save/reset (no artificial bump) |
| Units/quality/scenario/camera | `RuntimeSettings` | copied untouched |

## Commands and exact results

All commands ran in `C:\Users\aandr\Sites\self-driving-academy` on `main`, Windows, Node v24.19.0,
npm 11.17.0.

| Command | Exact result |
| --- | --- |
| `npm run typecheck` | exit 0 (`tsc --noEmit && tsc -p tsconfig.tests.json --noEmit`, no diagnostics) |
| `npm run lint` | exit 0 (`eslint . --max-warnings 0`, no diagnostics) |
| `npm run format:check` | "All matched files use Prettier code style!" |
| `npm run check:architecture` | PASS, 215 TypeScript files, 6+4+3 negative probes PASS |
| `npm test` | 1411 tests, 1411 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo, duration_ms 49776.5038 |
| `npm run key:remapping` | 51/51 checks, 7 scenarios, overall PASS; wrote `report.json` and `report.md` |
| `npm run key:remapping -- --check` | "Key remapping report is current: …\Docs\Evidence\080-key-remapping\report.json" |
| `node --import ./scripts/register-typescript.mjs --test tests/ui/key-remapping.test.ts tests/app/key-remapping.test.ts` | 22 tests, 22 pass, 0 fail |

`report.json` and `report.md` are the committed transcript of the 51 checks and 7 scenarios:
defaults, conflict, resolved conflict, unsupported codes, reset, save-preserving-other-settings and
focus capture.

One intermediate `npm test` run failed only the unrelated
`tests/workers/protocol.test.ts` cancellation timing assertion (`cancel 101.0015ms`, threshold
100 ms). The immediate rerun with the same sources passed 1411/1411. No 080 test failed in any run.

## Limitations

- No browser or trusted physical-key capture was produced: the keydown events in the transcript are
  synthetic adapter events (`isTrusted: false` by construction). The serialized DOM is the visual
  evidence.
- The production bootstrap does not yet host this panel. `createKeyRemappingPanel`,
  `readKeyRemappingDraft` and `applyKeyRemapping` are the composition seam; wiring them into the live
  settings menu and the 070 pause rule remains integration work.
- `Escape` is reserved for cancelling a capture, so it cannot be captured as a new binding. It remains
  valid as the persisted pause default.
- The reserved-browser list is a closed UI policy (`F1`, `F3`, `F5`, `F6`, `F7`, `F10`, `F11`,
  `F12`). A browser or operating system may still intercept other shortcuts before the page sees
  them.
- Remapping covers keyboard `code` values only; gamepad and hardware remapping require an explicit
  future schema. There is no persistence beyond the injected `SettingsStore`.
- No FPS, GPU, memory or hardware measurement is made; the report is a deterministic transcript.
