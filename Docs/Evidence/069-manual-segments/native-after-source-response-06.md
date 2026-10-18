# Native AFTER SOURCE06 finding response

SOURCE only; all new checks, injected tests, CLI child, native capture and calibration remain UNEXECUTED.

R5 subprocess diagnostic loss: the archive proof helper now wraps spawn, parse and status failures in AggregateError retaining the exact original thrown value. A private branded, frozen processDiagnostics receipt carries actual observed status/signal and bounded UTF-8 stdout/stderr, availability, original byte counts and truncation flags. Signals are bounded to 128 characters; streams to 65,536 bytes each. Unknown fields remain explicitly unobserved. Own-data descriptor inspection avoids getters and arbitrary conversions.

Both AFTER and owner-calibration ARCHIVED_IMPORT_CLOSURE failure artifacts export this dedicated receipt through preflightFailureArtifact, alongside bounded safe original-cause serialization. Exit-zero malformed JSON or wrong proof status retain their actual parse/assertion cause and the captured process metadata. Failure export aggregation retains the original wrapper and export error references.

Five new pure injected-result tests cover nonzero/unresolved controller, timeout/signal and thrown undefined, exit-zero malformed JSON/wrong status, UTF-8 stream bounds/hostile diagnostic getters, and export failure preserving original references plus receipt identity. No subprocess is launched by these tests. Intended total across four draft suites: 31 cases; actual execution pending.

Scope: helper, two producers, one test file and additive SOURCE06 documentation only. Approved 18 product bytes, original BEFORE and prior SOURCE01–05 snapshots are unchanged. No validator gate, physics, admission protocol or production seam changed.
