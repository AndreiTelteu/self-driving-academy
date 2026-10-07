# Actual AFTER2 failure and proposed SOURCE-only next step

The single authorized AFTER2 capture failed the unchanged original relative CPU gate for70. No retry, AFTER3, browser build, runtime change or gate waiver followed. The acceptance readers were not run as PASS: the fail-stop command runner stopped on the capture's EXIT1 before either reader. All20 raw worlds are retained.

## Actual results

Exact commands/exits/stdout/stderr are in `native-after-checks-03`. Scoped launcher format/write/check, syntax and loader no-world check EXIT0. Capture start2026-10-07T01:29:23.178Z; archive completion01:29:32.061Z; first world01:29:32.082Z; failure completion01:30:54.102Z; command EXIT1 at01:30:54.153Z. Source141 inputs `b15f1890bbae9a099eadeebfa3a9557263cace422551a7105458a8b1f1cd7977`; native `02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0`,4,340,292 bytes.

The additive `failed-after-02-independent.json` rehashes all141 current/archive input bytes and independently checks all20 original physical/control/native-input/checkpoint/mechanics digests, exact780/600 ticks and zero cleanup with five owners attempted once. Its original-relative flags are5/5 for both populations. Normal absolute failures are0/5.

|Fleet|Pair|BEFORE p95 ms|AFTER2 p95 ms|Delta ms|Joint relative FAIL|
|---|---|---|---|---|---|
|70|0|3.1110|4.9722|1.8612|yes|
|70|1|3.0848|4.9205|1.8357|yes|
|70|2|2.9861|4.7852|1.7991|yes|
|70|3|2.9275|4.9346|2.0071|yes|
|70|4|2.9680|4.8463|1.8783|yes|
|110|0|3.7440|6.5661|2.8221|yes|
|110|1|3.8631|7.0023|3.1392|yes|
|110|2|3.8816|6.4772|2.5956|yes|
|110|3|3.6367|6.7256|3.0889|yes|
|110|4|3.3769|6.7398|3.3629|yes|

Raw controller-incremental p95 is3.2394–3.3652ms for70 and4.6794–5.0575ms for110; native-total p95 is1.7182–1.8262ms and1.9546–2.1443ms respectively. Recovery observation is included in the incremental/whole channel, not separately instrumented. These measurements locate remaining cost outside the timed native world step; they do not identify a particular function causally, and percentile subtraction is not used.

Ignored retained logs are listed exactly in `native-after-checks-03/ignored-owned-files.txt`. No new stdout/stderr logs in this attempt are ignored; historical `.log` files must later be explicitly staged by the parent.

## Read-only source findings and proposal; NOT IMPLEMENTED

Measured600ticks schedule each actor100times: exactly7000/11000 projections and initial fences, with at most12/19 actors per tick. Successful contact/upright/road branches add up to two more fences and one complete inspection each. Conditional inspection counts were not recorded; no actual count is invented. Each complete inspection traverses all fleet+68 colliders (138/178 here), retaining full counts and fresh state/serial checks. The code evaluates every eligible live intersection even after finding a blocker. No traversal, schedule, projection, native getter or query may be removed.

Two bounded source optimizations can preserve that exact work:

1. **Remove unused validation allocations inside full collider traversal.** Keep the current translation and rotation getter calls at the same point and reject the same nonfinite scalars, but compare each scalar directly. The existing translation guard constructs and freezes a second vector that is immediately discarded; both finite guards also allocate temporary arrays. Neither copied vector nor these arrays escape. This changes allocation only, with identical errors, full traversal and live `intersectsShape` calls.
2. **Avoid repeatedly reparsing a privately audited immutable transform.** `recoveryTransform` currently descriptor-audits/copies its nested transform in the road adapter, native request parser and footprint check. A private WeakSet may recognize only transforms produced by that strict parser, whose top-level/vector/quaternion own-data objects are deeply frozen. The owner would construct its candidate through that parser once; subsequent calls could return only that exact branded immutable object. Unbranded, mutable, inherited/accessor/extra-field and replacement objects retain the original complete parser. Every native request still validates its request envelope, context, token and serial; ground/road/shape queries and all post-host fences remain. No mutable context/pose/native geometry is cached, no caller-provided freeze alone creates trust, and no native results are cached.

Meaningful tests would cover all finite component failures on the direct guards, immutable audited transform reuse versus mutable replacement/getter/prototype/unknown-field refusal without accessor invocation, unchanged full native traversal and same-serial moved/resized/oriented/sensor blockers. Original baseline and both failed AFTER captures remain immutable. These changes are proposed for root review only; their likely benefit is unmeasured and may still be insufficient to satisfy the original joint relative gate.
