# Evidence 078 - Istoric și restaurare profil

Functional/targeted validation for PBI 078. The evidence covers the pure history/preview/restore
contract, the DOM adapter with stable row identity and explicit confirmation, the real 109
`ProfileStore` composition, the deterministic transcript and the project checks. No browser capture
is claimed.

## What was delivered

- `src/ui/profile-history-format.ts` - `078-profile-history-v1`: strict snapshot parser (exact
  fields, bounded identities, finite tick, duplicate `versionId` rejection, deterministic ordering,
  parent/depth consistency, flag/restore cross-checks, reserved-change rejection), the pure
  `deriveProfileHistoryChanges` derivation from two immutable snapshots, the projection with stable
  row identities, labels, counts, summary and deterministic signature.
- `src/ui/profile-history.ts` - `createProfileHistoryPanel`: DOM built once, one row node per
  `versionId`, native `<ul role="listbox">` buttons, a preview section, `Restaurează` plus a visible
  `Confirmă restaurarea` step, disabled/blocked reason text, 10 Hz ceiling with
  selection/current/restore-state bypass, identical-frame no-write, rejected-frame DOM isolation,
  idempotent disposal and no global key listener.
- `src/app/profile-history.ts` - `readProfileHistorySnapshot`, `planProfileRestore`,
  `createProfileHistoryPorts` and `PROFILE_HISTORY_RESERVED_KEYS`: reads the real 109 versions,
  reports `NONE`/`AVAILABLE`/`BLOCKED` with closed reasons, derives the preview, and emits only the
  injected `select`/`restore` intents.
- `src/ui/index.ts`, `src/app/index.ts` - additive public exports.
- `src/style.css` - history list, preview, restore and disabled/focus styles consistent with 075/077.
- `tests/ui/profile-history-fixture.ts`, `tests/ui/profile-history.test.ts` - real 109-style store
  fixtures (chain, branching tie-break, reserved numeric key) and 19 tests.
- `tests/app/profile-history-report.ts`, `scripts/run-profile-history-report.mjs`,
  `npm run profile:history` - 7 deterministic scenarios and 58 checks with serialized DOM.
- `Docs/profile-history.md`, additive paragraphs in `Docs/08-interfata-camera-si-control.md` and
  `Docs/README.md`, and this evidence folder.

## Identity and immutability

`versionId` is the only row identity. Selecting a version, changing the current version or adding a
frame reuses the same `li`/`button` node; the stat `created` counts row creation. Entries are frozen
snapshots of already stored 109 versions, a duplicate `versionId` is rejected by the parser, and
there is no edit path in the contract. Selection and restore never change parameters, checksums or
the store history; the test compares `listVersions` before and after both actions.

Ordering is deterministic: `depth` ascending (base to tip) and `versionId` ascending as the tie-break
for versions at the same depth. The parser rejects an unordered list, a first entry that is not a
base, and a parent that is not at `depth - 1`.

## Preview rules

`ProfileHistoryPreview` carries `fromVersionId` (current), `toVersionId` (selection) and key-sorted
changes `{ key, previous, next, unit, source, reason }`. The list exists exactly when both versions
are in the history and differ.

- A key present in only one version shows `null` on the missing side; equal values and two `null`
  sides are rejected.
- `source: 'DELTA'` is used only when the target version's stored delta describes the exact
  transition (`previousValue`/`newValue` equal the compared values); the stored reason is then kept.
  Otherwise `source: 'SNAPSHOT'` and the reason is the explicit "Valoare diferită între versiuni".
- Reserved R (`extension`) keys are omitted consistently from the preview. The real composition
  passes the 092 reserved set; the parser rejects a frame that carries a reserved change. The report
  proves this with `speed_delta_arterial = 7` in the stored record.
- A real zero stays visible: `0 m/s → 0.5 m/s`.

## Restore and incompatibility

| `action` | `reason` | Condition |
| --- | --- | --- |
| `NONE` | `NO_SELECTION` | versions exist but nothing is selected |
| `AVAILABLE` | `null` | selection exists, differs from current, is compatible and unique |
| `BLOCKED` | `MISSING_VERSION` | empty history, missing current version or missing selection |
| `BLOCKED` | `SAME_VERSION` | the selection is the current version |
| `BLOCKED` | `PROFILE_MISMATCH` | the selection belongs to another profile |
| `BLOCKED` | `ENGINE_MISMATCH` | current or selected version belongs to another engine |
| `BLOCKED` | `DUPLICATE_VERSION_ID` | a corrupt/custom store reports duplicate IDs |

`explicit: true` and `confirmationRequired: true` are mandatory in every frame. The panel enables the
restore button only for `AVAILABLE`; the first click shows the `Confirmă restaurarea` control and
emits nothing, and only the second click calls the injected `restore` port once. A frame that changes
the selection, current version or restore state resets the confirmation step. A host rejection
reason is displayed verbatim.

## Scenarios and checks

The committed [report.json](report.json) and [report.md](report.md) contain 7 scenarios:

1. empty history;
2. multi-version chain;
3. delta preview with a real zero;
4. reserved key handling with a numeric R value in the record;
5. incompatible engine;
6. confirmed restore intent;
7. 60 frames under the 10 Hz ceiling.

The 58 checks cover the contract version, the empty state, deterministic order and branching
tie-break, preview source/reason rules, reserved-key exclusion and parser rejection, engine
incompatibility and visible text, selection not restoring, the two-step confirmation, the unchanged
store, the 10 Hz ceiling with selection bypass, identical-frame no-write, rejected-frame DOM
isolation, stable nodes, zero global listeners, planner/ports behavior and deterministic DOM.

## Commands and exact results

All commands ran in `C:\Users\aandr\Sites\self-driving-academy` on `main`.

| Command | Exact result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run format:check` | "All matched files use Prettier code style!" |
| `npm run check:architecture` | PASS, 209 TypeScript files, 6+4+3 negative probes PASS |
| `npm test` | 1368/1368 pass, 0 fail, 1 suite |
| `npm run profile:history` | 58/58 checks, 7 scenarios, overall PASS |
| `npm run profile:history -- --check` | "Profile history report is current: …\report.json" |
| `node --import ./scripts/register-typescript.mjs --test tests/ui/profile-history.test.ts` | 19/19 pass, 0 fail |

`report.json` and `report.md` are the committed transcript of the 58 checks and 7 scenarios.

## Limitations

- The production bootstrap has no live profile history/restore host yet. `readProfileHistorySnapshot`
  and `createProfileHistoryPorts` are the ready composition seam; wiring them to the 070/08 profile
  panel key and the 110/114 activation remains integration work. Until then the composition uses the
  documented `PROFILE_HISTORY_LOCAL_CONTEXT` scope, which the host can override.
- The module never creates, derives or validates a version or a delta numerically; 102/109 own that
  gate. It only reads stored versions and requests a restore.
- The panel does not publish, activate or persist anything; 109 owns storage, 110 publication and
  114 activation/restore semantics.
- Reserved R keys are omitted from the preview (the documented rule), not shown with a marker.
- `DUPLICATE_VERSION_ID` is a defensive closed reason from `planProfileRestore`; a valid frame cannot
  carry duplicate entries, so normal composition never reaches it.
- No browser capture or PNG is produced or claimed. The serialized DOM in the report is the visual
  evidence.
- No FPS, GPU, memory or hardware measurement is made; the report is a deterministic transcript.
