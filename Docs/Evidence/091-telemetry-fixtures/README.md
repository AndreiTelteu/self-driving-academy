# Evidence 091 — telemetry demonstration fixtures

## Validator runs

The valid and corrupted corpus commands are recorded verbatim in `fixtures-run.txt`. The default CLI
checks both halves together. The valid run has 24 valid contexts and no failures; the corrupted run
has 11 refused variants and no unexpected accepts.

## Corpus table

| Coverage | Fixtures |
| --- | --- |
| 087 labels/classes | FREE_TRAFFIC/ELIGIBLE, LEADER/BLOCKED_GREEN/MECHANICAL_LIMIT/IMPACT as EXTERNAL_CONSTRAINT, and PAUSE/FOCUS_LOST/MANUAL_SEGMENT/AUTO_SEGMENT/NOT_OBSERVABLE as EXCLUDED |
| 086 resolved and truncated kinds | STOP, RED, GREEN, YIELD, LANE_CHANGE |
| 088 artefacts | collision, recovery placement, incomplete segment |
| Missing STOP | explicit `STOP/NOT_OBSERVED` marker and refused compliance ratio |
| Corruption cases | non-monotonic tick, foreign and duplicate entity, non-finite value, command range, unknown kind/state, duplicate opportunity ID, contradictory eligibility, truncated segment claiming COMPLETE, missing STOP marker |

## Checks and tests

`checks.txt` and `tests.txt` preserve the command output, including exit results. The suite adds five
tests (baseline 1019, final 1024). The focused suite additionally reports 5/5 for the new file. The
CLI runs as subprocesses from the test and is also recorded separately in `fixtures-run.txt`.

## Limitations

- This is deterministic native fixture composition. It does not validate live application wiring,
  renderer observations, or gameplay behavior.
- The 087 visibility cases use the documented controlled-fixture visibility input; no browser camera
  or occlusion raycast is claimed.
- The 088 recovery fixture carries a contract-valid 030 placement record; it does not execute a live
  recovery placement.
- 090 compaction verifies the closed segment path and local typed-array handling; it does not claim
  worker transport, persistence, memory performance, browser, GPU, or FPS results.

## Files

- `../../telemetry-fixtures.md` — API, reason vocabulary, coverage matrix, and missing-STOP rule.
- `../../..` source corpus and validator are listed in the module doc.
- `checks.txt`, `tests.txt`, `fixtures-run.txt` — captured verification output.
