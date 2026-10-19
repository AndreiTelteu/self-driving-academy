# Evidence 090 — telemetry storage

Targeted validation for PBI 090 (`performance_checks: memory, workers, frame`). Runtime is Node
v24.21.0 and npm 11.19.0 via Volta. The fixture is the existing
`roadContextFixture(false)` from 044; BEFORE reads the same 085 recorder directly, while AFTER adds
090 compaction, rollover, incremental finalization and copy-transfer. Five repetitions ran
sequentially, one arm per process. Cost labels are native CPU-only and
`PROVISIONAL_UNCALIBRATED`.

## Results

| Measurement | Result |
| --- | --- |
| BEFORE direct 085 read p50/p95/p99 | median per-repetition percentiles: **0.8 / 1.4 / 2.0 µs** |
| AFTER `compactAvailable(32)` p50/p95/p99 | median per-repetition percentiles: **26.8 / 51.7 / 62.0 µs**; p95 range **43.0–291.0 µs** |
| AFTER `finalizeStep(4)` p50/p95/p99 | median per-repetition percentiles: **22.5 / 25.1 / 25.1 µs**; p95 range **14.3–131.6 µs** |
| Retained analysis samples | 400 from 1200 source ticks at 20 Hz; source tick sequence preserved exactly |
| Chunking | 7 chunks, 6 rollovers; payloads **544–2740 B**, each below the **4096 B** cap |
| Retained 090 payload counter | **15,446 B** (0.046% of `recorderRamBytes` = 33,554,432 B); typed-array backing bytes plus UTF-8 event metadata, excluding JS object/Map overhead |
| Transfer payload | **2,429 B** for the first chunk, below `pendingWorkerPayloadBytes` = 16,777,216 B |
| Ownership self-check | copied transfer handle detached (`copyDetached=true`); live 085 segment remained readable and accepted a subsequent segment/tick (`liveAfterTransfer=true`) |
| Worker transport | Native `structuredClone` transfer exercised; no real Worker/MessagePort round-trip |

The first AFTER repetition includes first-touch overhead and is retained in the report. Each finalization
step seals the one remaining chunk as one real work item; the probe reached FINALIZED in one call with
`maxStepItems=1`. The 090 byte counter is separate from 085 ownership and does not claim a whole-process
RAM bound.

## Tests and why they matter

`tests/telemetry/segment-compaction.test.ts` has eleven passing tests. Each catches a plausible faulty
implementation:

1. **Long rollover** would fail if a cadence counter replaced source ticks, chunk links skipped or
   repeated sequences, or an opportunity/event id was duplicated or omitted. It checks all 400 ticks,
   five opportunity ids and the exact STOP/reaction event ticks across seven chunks.
2. **DROP_OLDEST and DROP_NEWEST** would fail if overwritten/rejected 085 rows were reported as a
   complete compact segment, or if either policy's overflow counter were ignored. Both now terminate
   `INCOMPLETE/SOURCE_INCOMPLETE`.
3. **One- and two-tick segments** would fail if finalization required filling a full chunk or emitted
   an invalid zero-length chunk for a short segment.
4. **Open recorder** would fail if the compactor only consumed the sample count present at creation
   or treated an open source as final; it verifies rows can arrive in later bounded reads.
5. **Incremental finalization** would fail if one call consumed more than its item budget; the final
   chunk is asserted to be sealed by a step that reports one processed item.
6. **Transfer ownership** would fail if the handle referenced live 085 buffers, if one chunk could be
   acquired twice, or if transfer detached the recorder's readout.
7. **Dispose/misuse** would fail if live bytes/counters remained after disposal or new event admission
   and transfer continued after disposal.
8. **Conflicting event id** would fail if a repeated id with a different tick silently replaced the
   original fact instead of closing the segment as `INCOMPLETE/INVALID_SOURCE`.
9. **Late event after rollover** reproduces the 1200-tick/32-row compaction case: the late tick-4 event
   is refused, `eventsRejected` increments, and the segment reports `INCOMPLETE/LATE_FACT`.
10. **Late opportunity after rollover** verifies rejection with a counter and terminal `LATE_FACT`, so
    it cannot remain pending forever in `FINALIZING`.
11. **Final chunk work** verifies `finalizeStep(1)` creates the last chunk and reports one processed item.
The long-rollover test also preserves the exact tick-900 resolution of an opportunity admitted before
rollover in its original chunk.

Exact command output is preserved in `checks.txt`, `tests.txt`, `native-before-01.txt` and
`native-after-01.txt`; the orchestrator-style late fact reproduction is in
`late-fact-reproduction.txt`; machine-readable reports are in the matching JSON files.
The full suite passed **1019/1019**.

## Limitations

Native CPU, typed-array ownership and native structured-clone transfer only. No browser, GPU, FPS,
renderer or live-loop integration claim. The pending-worker comparison is per copied chunk payload;
there was no actual worker queue/transport. 085 remains independently owned. No persistence or 222
checkpoint behavior is implemented here.
