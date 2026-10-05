# PBI033 verification — 2026-10-05

The pure lane graph validates and owns its input, respects directed connections and access classes, and identifies a lane from world geometry without a renderer. Twelve dedicated tests cover one-way streets, parallel lanes, allowed/omitted turns, reversed paths, sloped bridges, intersection gaps, finite endpoints, heading wrap, deterministic ties, input ownership, invalid queries, the schema lane limit, spatial fallback and shared geometry.

Executed checks:
- `node --import ./scripts/register-typescript.mjs --test tests/world/lane-graph.test.ts`: 12/12 PASS.
- Scoped ESLint and project typecheck: PASS.
- `npm run check`: PASS, 208/208 tests, architecture/typecheck/lint/format PASS ([exact output](project-check.txt)).
- `npm run build`: PASS ([exact output](build.txt)); existing large-chunk warning remains. A concurrent recovery-test inference error was corrected by its owning agent before this successful build.
- `PBI/Validate-Board.ps1 -RequireDone '033'`: see [exact board result](board.json), captured after physical movement.

Performance was measured on AMD Ryzen 9 7950X3D, Node v24.21.0, Windows 10.0.26200, CPU only. There is no GPU/backend/preset/FPS claim. Benchmark revision HEAD at measurement is embedded in each JSON; uncommitted source hashes are recorded in [source hashes](source-hashes.txt).

[Before](baseline.json): existing parser, 1,000 iterations, five repetitions plus warmup, median 115.9836 ms. [After](after.json): same parser median 117.5391 ms (+1.34%, timing noise; parser unchanged). New graph cost is reported separately: 3/256/2,048-lane construction medians 0.238/4.074/36.323 ms; localization p95 medians 0.0007/0.0009/0.0016 ms and p99 medians 0.0011/0.0018/0.0021 ms. Each run executed 10,000 queries with correct matches. Observer-on/off totals are separate; instrumentation is bounded to the run, not retained in runtime graph state.

The [initial full-scan probe](after-scan.json) is preserved. Its 2,048-lane p95 was approximately 0.095 ms; the final implementation adds a bounded spatial index with complete fallback and shares immutable geometry variants. It does not replace the baseline to conceal that finding. Final statistics remained unchanged throughout queries. Twenty 2,048-lane rebuilds with forced GC reached a stable approximately 25 MB heap plateau; raw samples are in after.json. This is a Node heap diagnostic, not a browser/GPU/WASM soak or exact per-graph memory estimate.

The pre203 whole-tick p95 proposal is 5.5 ms; no isolated lane-query budget has been fixed. These CPU fixture costs do not certify a whole simulation tick or hardware gate. Very large overlapping paths intentionally use complete fallback and may cost more; real-map calibration remains necessary. No routing, live signal admission or vehicle physics is introduced.

Parent integration validated the exact staged checkout independently: 198/198 tests and full check PASS, production build PASS, RequireDone033 and Validate-Plan PASS. Logs: [staged check](staged-check.txt), [staged build](staged-build.txt). Generated validation directories are excluded from ESLint traversal; tracked source and browser fixtures remain checked.
