# SOURCE20 — serve existing R19, source only

No helper invocation, tests, syntax/type/lint/format checks, build, server, HTTP,
browser, CIM, native acquisition/world, board mutation, Git write or child work
was performed. New source and its immutable byte snapshot are preparation only.
Root review must precede any execution. PBI026 remains In Progress on the shared
root board; the isolated worktree's historical To Do file is not the root board
and was not changed. No hardware acceptance is awarded.

## Binding and bounds

Use only the R19 manifest path recorded in `source20-manifest.json`. R19 logs
record one build invocation, actual exit 0 and BUILD_ARCHIVED_SERVER_NOT_STARTED;
`v2-build-only-checks-20261007-r19/verification.json` records independent PASS.
This handoff does not rerun those checks. UUID is
66872ce5-696c-4c3f-9e6d-b849d38f0ee4; source is
7a3c2ca0c48e63ecd7b2bcc1edcb8658f2a4710b2c5203f77d775adc0230f3e8;
artifact is 8ce69f98824feb6fe39569fc2688656518ab1cc99717750f71a0be515a29f2f4.

The draft checks original manifest/binding byte pins, 105 unique live/archived
inputs (6,930,954 bytes), 142 unique emitted files (10,424,629 bytes), strict
253-file archive set, original built root, installed/archived native and R19
hardware metadata (1,900 bytes, SHA256
7fbb27ac12af10c2e60453aa33da115f659646d21b39325ac95f49387387ac42).
Readiness calls existing `readCurrentNative()` with current checking enabled and
`verifyFrozenArchive()`, checks both 80-input references against the original
binding, and reuses original native pin
02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0 / 4,340,292 bytes.
All original 105 inputs and R19 archive remain untouched.

Static responses come only from manifest-listed emitted artifacts in the known
built root, with byte verification before 200 headers. Relative paths, alternate
streams, symlinks/reparse redirection and paths outside that root fail closed.
No Vite import/build, subprocess, CIM, new build UUID, unsafe eval or browser hook
exists in the new helper. Current hardware is UNKNOWN: CIM was not recaptured.

The exact parsed `archive-complete.json` binding is passed unchanged to existing
`createLedger`, `createPartLedger` and `createEvidenceHandler`. Original binding
has no separate serverUUID/serverOwnerIdentity fields; its archive UUID and
commit/source/artifact/native/hardware owner fields remain original. New capture
UUIDs, when explicitly launched later, are issued by the original ledger, not a
new build identity. The original namespace, wx/readback, duplicate ACK/conflict,
4MiB ingress, 512KiB chunks, 16MiB logical bound, terminal/late handling and
INCOMPLETE/UNVERIFIED semantics remain in the reused modules.

Frozen verification is supplied at the original ledger/part-ledger call sites:
normal mutation failures reject; original diagnostic supplements retain their
FAILED_UNKNOWN frozen status policy (terminal-error parts remain its original
exception). Auxiliary source verification is additionally required before every
POST, including these exceptions; auxiliary drift rejects with 409. This does
not convert a diagnostic exception into acceptance. Original contract tests are
archived evidence, not newly executed tests. The truncated-chunk draft exercises
the pure decoded-length/hash predicate plus real ingress parser on an in-memory
iterator; it does not claim part-ledger filesystem integration coverage.

## Separate service source proof

`service-proof.json` pins exactly two runtime source files and their archived
copies under this new directory. Runtime reads it and hashes live and archived
auxiliary code before readiness and before mutations. Caller must supply its
root-reviewed SHA256, recorded in `source20-manifest.json`; missing/wrong pin
fails closed. The sidecar and copies were created with exclusive create and
byte readback; the helper never writes them. The test draft is also snapshotted
but is outside the two-file runtime closure. Existing reused logic is already
inside R19's frozen 105; no wholesale copy or original manifest rewrite occurs.
Hashes establish reviewed bytes, not a hostile-filesystem security boundary;
as with the original protocol, root must keep the worktree quiescent while serving.

## Proposed finite sequence — all unexecuted

1. Root reviews the source, exact SOURCE20 file pins, dependency reuse and R19
   manifest binding. Grant finite pure fault-test execution separately if desired:
   `node --test tests/browser/wheel-dynamics-v2/serve-existing.test.mjs` (7 cases).
2. Under a separate read-only execution grant, from the exact worktree, invoke:
   `node tests/browser/wheel-dynamics-v2/serve-existing.mjs --check-only <exactManifestPath> <serviceProofSha256>`.
   It reads/validates and returns before createLedger, HTTP import/listen or writes.
   Failures require root review; no repair, rebuild or repinning is automatic.
3. Only after separate explicit root server-launch authorization, root supplies
   `PBI026_SERVE_EXISTING_GRANT=root-reviewed-r19-source20-serve-only` to that one
   process and uses the same arguments with `--serve`. Listener is exclusively
   127.0.0.1:5220. This value is a launch interlock, not authorization by itself.
   Browser/HTTP/capture permission remains separate. Do not invoke original
   server.mjs: it rebuilds and changes UUID.

Root should retain the launched tool session identifier and READY JSON PID,
exact command, source-proof hash and R19 UUID as process ownership evidence;
the PID is runtime lifecycle metadata, not browser binding identity. Remove the
grant from the parent environment immediately after creating that process.
Shutdown only that owned session/PID using Ctrl+C/SIGINT, retaining exit/readback.
The draft closes idle connections and allows 5 seconds before closing remaining
connections, with failure exit status on forced close. On Windows, if graceful
session shutdown fails, root may separately authorize terminating only the
recorded owned PID; never broad process/port kills. Startup errors set exit 1;
no automatic restart. Root must review exit and separately check listener release
under its execution grant. No PID/session exists for SOURCE20 yet.

Stop here for root review. No server/build/browser continuation is authorized.
