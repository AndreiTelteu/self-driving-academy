# Evidence 077 - Panoul profilului

Functional/targeted validation for PBI 077. The evidence covers the pure snapshot/state/delta
contract, the DOM adapter with stable row identity, the real 109-style `DrivingProfile` composition,
the deterministic transcript and the project checks. No browser capture is claimed.

## What was delivered

- `src/ui/profile-panel-format.ts` - `077-profile-panel-v1`: strict snapshot parser (exact fields,
  catalog metadata, duplicate keys, ranges, thresholds, illustrative consistency), the
  `createIllustrativeProfilePanel` builder over the real catalog defaults, the pure projection with
  catalog-order sections, display texts, counts, summary and deterministic signature.
- `src/ui/profile-panel.ts` - `createProfilePanel`: DOM built once, one row element per catalog key
  reused across content/value/version updates and reopening, a native `<details>` for
  evidence/checksum, illustrative badge/banner, reserved rows carried by text and `data-status`,
  10 Hz write ceiling with version/delta/illustrative bypass, idempotent disposal, zero listeners and
  no controls that could mutate a profile.
- `src/app/profile-panel.ts` - `readProfilePanelSnapshot`: a real `DrivingProfile` (109) with
  observed values/evidence/provenance, an optional 109 `ProfileVersionDelta` filtered to learnable
  keys, or the explicit catalog preview with `illustrative: true` and the exact banner. Reserved
  keys are forced to `RESERVED`/`null`/not learnable even when the record carries a number. Closed
  errors for a foreign base, an unknown key, a mismatched delta value/unit or an inconsistent
  evidence count.
- `src/ui/index.ts`, `src/app/index.ts` - additive public exports.
- `src/style.css` - panel layout consistent with the HUD/minimap/fleet panel, illustrative and
  published badges, dashed reserved rows, delta rows, native focus.
- `tests/ui/profile-panel-fixture.ts`, `tests/ui/profile-panel.test.ts` - a real 109-style profile
  fixture (learned zero, uncertainty, reserved key with a numeric value, omitted key), a fake-DOM
  harness and 15 tests.
- `tests/app/profile-panel-report.ts`, `scripts/run-profile-panel-report.mjs`,
  `npm run profile:panel` - 7 deterministic scenarios and 51 checks with serialized DOM for the
  illustrative, real and delta scenarios.
- `Docs/profile-panel.md`, additive paragraphs in `Docs/08-interfata-camera-si-control.md` and
  `Docs/README.md`, and this evidence folder.

## State rules

| State | Condition | `value` | Display |
| --- | --- | --- | --- |
| `OBSERVED` | the published record has the key | real number, including `0` | `0 m/s`, `2.5 m/s²` |
| `UNOBSERVED` | the record has no value for the key | `null` | `Neobservat` |
| `RESERVED` | R (`extension`) catalog key | `null` | `Rezervat · neînvățabil V1` |

- A real zero is `OBSERVED`, shown as `0`; it is never confused with a missing value.
- An unobserved key is `null`, never `0`; the catalog default is only `defaultValue`.
- An R key is always `RESERVED`, `null`, `source: null`, `evidenceCount: 0`, `learnable: false`
  and says it is not learnable in V1, even when the record carries a number. The report proves this
  with `speed_delta_arterial = 12` in the record.
- The parser rejects a frame that would mark an R key `OBSERVED`, put a value on an `UNOBSERVED`
  key, change the catalog metadata, or carry a learned delta change for a reserved key.

## Illustrative versus published

Without a `DrivingProfile`, `readProfilePanelSnapshot` returns a frame built from the real catalog
defaults with `profile: null`, `illustrative: true` and the banner:

> Date ilustrative — serviciul de profiluri nu a publicat încă o versiune

The preview has zero `OBSERVED` rows and never uses the words learned or certified. With a real
profile, `illustrative` is `false`, the banner is removed from the visible flow (`hidden`) and the
badge reads `PUBLICAT`. Switching either way reuses all 80 row elements.

## Delta rules

`ProfilePanelDelta` carries `baseVersionId` and `{ key, previous, next, reason, evidenceCount }`.
The delta must target the exact parent of the rendered version; a foreign base, an unknown key, a
unit mismatch or a `next` value that differs from the published profile are closed errors. Reserved
keys are excluded from learned changes, and a delta composed only of reserved keys produces no delta
rows. A real zero remains visible as `0.5 m/s → 0 m/s`.

## Scenarios and checks

The committed [report.json](report.json) and [report.md](report.md) contain 7 scenarios:

1. illustrative catalog preview without a published profile;
2. real profile with a learned zero, uncertainty, evidence and an unobserved key;
3. a derived version with a two-key delta;
4. a reserved key that carries a numeric value in the record;
5. an identical frame that writes nothing;
6. 60 frames at 16 ms under the 10 Hz ceiling;
7. a malformed/stale frame that never touches the DOM.

The 51 checks cover the contract version and catalog coverage, the illustrative banner and zero
observed rows, counts summing to 80, the real profile clearing the preview, a real zero shown as `0`,
an unobserved `null`, `±0.25` uncertainty, `4 dovezi`, the learned source, the R key `RESERVED` with
`null` value and no learnability, parser rejection of a reserved observed frame, delta
previous/next/reason, the R change excluded from the learned delta, a foreign base rejected, stable
row nodes, identical-frame no-write and byte-identical DOM, the 10 Hz ceiling and version bypass,
rejected-frame DOM isolation, zero listeners, no profile-mutating controls, catalog order, the
80-row DOM and a deterministic transcript.

## Commands and exact results

All commands ran in `C:\Users\aandr\Sites\self-driving-academy` on `main`.

| Command | Exact result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run format:check` | "All matched files use Prettier code style!" |
| `npm run check:architecture` | PASS, 206 TypeScript files, 6+4+3 negative probes PASS |
| `npm run profile:panel` | 51/51 checks, 7 scenarios, overall PASS |
| `npm run profile:panel -- --check` | "Profile panel report is current: …\report.json" |
| `node --import ./scripts/register-typescript.mjs --test tests/ui/profile-panel.test.ts` | 15/15 pass, 0 fail |
| `npm test` | 1349/1349 pass, 0 fail, 1 suite |

`report.json` and `report.md` are the committed transcript of the 51 checks and 7 scenarios.

## Limitations

- The production bootstrap has no profile publication host yet. `readProfilePanelSnapshot` is the
  ready composition seam; wiring it to the live 110 publication, 112 propagation and the 070/08
  profile panel key remains integration work. Until then the composition uses the documented
  `PROFILE_PANEL_LOCAL_CONTEXT` scope, which the host can override explicitly.
- The panel reads a `DrivingProfile`. The 109 `ProfileVersion` record has the same values but no
  evidence map; a host that only holds a `ProfileVersion` must enrich it or wait for the 110
  publication boundary.
- The panel does not create, derive or validate a version or a delta numerically; 102/109 own that
  gate.
- No browser capture or PNG is produced or claimed. The serialized DOM in the report is the visual
  evidence.
- No FPS, GPU, memory or hardware measurement is made; the report is a deterministic transcript.
