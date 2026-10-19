# Telemetry segment storage — PBI 090

`createSegmentCompaction(input)` in `src/telemetry/segment-compaction.ts` consumes the open 085 segment incrementally as rows arrive, then finalizes it after 085 closes. It receives immutable 086 opportunity records and accepts discrete event facts with `recordEvent({ id, kind, tick })`. It owns compact output chunks and finalization state; it does not validate or re-identify either source contract.

## Public API

| Symbol | Meaning |
| --- | --- |
| `createSegmentCompaction(input)` | Creates bounded compaction for one 085 segment. |
| `recordOpportunity(record)` | Admits/updates one real 086 fact by its stable id; duplicate ids do not create duplicate evidence. |
| `recordEvent({ id, kind, tick })` | Retains a STOP, reaction or other event fact once at its exact source tick. |
| `compactAvailable(maxItems?)` | Reads at most the requested number of 085 rows and retains rows on the configured analysis cadence. |
| `beginFinalize()` | Moves a fully read, closed, complete 085 source to `FINALIZING`; incomplete 085 sources fail closed. |
| `finalizeStep(maxItems?)` | Performs at most the configured number of item operations and continues on later calls. |
| `getChunks()` | Returns immutable descriptors with typed-array read copies. |
| `acquireTransfer(sequence)` | Returns an exactly-once `TRANSFER_COPY` handle, with copied typed arrays safe to transfer. |
| `getStats()` / `dispose()` | Reports cumulative/live counters and releases all live owned data. |

## Cadence and continuity

The default analysis cadence is 20 Hz derived from 60 Hz (`analysisHz` must divide `tickHz`); retained samples keep their source tick unchanged. Opportunity `openedTick` and `resolvedTick`, and event `tick`, remain exact source facts independent of the analysis cadence. Chunks use a fixed 32-byte numeric sample layout and a 4 KiB total payload cap (64 samples reserved for each chunk before event metadata); actual payload size is checked before admission. Chunks link by monotonically increasing sequence with `previousSequence`, `nextSequence`, `firstTick`, `lastTick`, `hasGap` and `gapCount`. Event ids are retained once; unresolved and truncated opportunity counts remain explicit. Empty short segments finalize as an empty result, while one- and two-tick inputs may produce a shorter valid chunk.

## State and capacities

Terminal path: `OPEN → FINALIZING → FINALIZED`; source loss, capacity breach, disposal or a fact that cannot be placed ends in `INCOMPLETE` with `SOURCE_INCOMPLETE`, `CAPACITY_EXCEEDED`, `INVALID_SOURCE`, `DISPOSED` or `LATE_FACT`. Each finalization step seals at most one remaining chunk as one actual work item; the default item budget is 32 (maximum configurable 256), and every source read call is capped at 256 rows. A caller must continue stepping until a terminal state.

Admission order is explicit: after a chunk seals, its `lastTick` is the committed watermark. A new event or opportunity with a tick at or below that watermark is refused, increments the corresponding rejected counter and closes the segment as `INCOMPLETE/LATE_FACT`. Updates resolving an already-admitted opportunity remain accepted and update its original chunk, including the exact `resolvedTick`. Finalization never reports `FINALIZED` while pending facts remain; if a pending fact cannot be emitted, the segment ends `INCOMPLETE/LATE_FACT`.

| Resource | Default | Maximum | Ceiling / policy |
| --- | ---: | ---: | --- |
| Analysis cadence | 20 Hz | tick rate | Integer divisor of tickHz (default 60 Hz) |
| Chunk payload | 4 KiB | 256 KiB | Fixed typed-array bytes plus UTF-8 opportunity metadata |
| Retained chunks | 64 | 64 | Refuse further chunks; report incomplete and dropped sample count |
| Retained bytes | 4 MiB | 4 MiB | Under `recorderRamBytes` 33,554,432 B; does not include 085 ownership |
| Opportunities | 4096 | 4096 | Refuse excess ids and report capacity failure |
| Discrete event facts | 4096 | 4096 | Refuse excess ids and report capacity failure |
| Pending worker payload | 16 MiB | 16 MiB | Each handle checked against `pendingWorkerPayloadBytes` |
| Finalization items per call | 32 | 256 | Further calls required for remainder |

085 remains the only per-tick recorder and retains its own 4096-row ring. The 090 retained-byte counter sums typed-array backing bytes and UTF-8 serialized event metadata; it excludes JavaScript object/Map overhead and is not total process RAM. The 090 chunk cap is a separate, additional ownership category and is not summed with 085 or 086 overlapping categories.

## Transfer semantics

`getChunks()` returns read copies. `acquireTransfer` makes a separate copy of every typed-array buffer into a structured-clone-compatible handle and advances an exactly-once sequence watermark. Passing the copied arrays' buffers to native `structuredClone(..., { transfer })` or `postMessage` can detach the handle copy while leaving the original 090 chunk and live 085 recorder intact. The native probe exercises structured-clone transfer and verifies that live 085 data remains readable; it does not claim a real Worker/MessagePort round-trip.

## Measured added cost

See [090 evidence](Evidence/090-telemetry-storage/README.md) for paired native CPU-only BEFORE/AFTER measurements, per-call compaction/finalization percentiles, chunk bytes and transfer payload. These measurements are `PROVISIONAL_UNCALIBRATED`; no browser, GPU or FPS claim is made.

## What this is NOT

This is not the 069 lifecycle owner, 222 checkpoint/autosave, persistence, a worker scheduler or live-loop wiring. It does not replace 085 validation or 086 identity, refuses and reports rather than silently deleting on overflow, and makes no browser, renderer, GPU or FPS claim.
