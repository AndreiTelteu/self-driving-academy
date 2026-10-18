#069 implementation source handoff01

Status: SOURCE ONLY, unexecuted; review requested. Parent accepted chronological native BEFORE24worlds/source3f36/native02dc before these production changes. Original captured126inputs and raw archive are untouched. The new source changes make the old BEFORE CURRENT-reader incompatible by design; its HISTORICAL reader remains the reproducible baseline reader. No native AFTER, browser, tests, formatter, typecheck, lint, architecture or implementation commit has run for this new production snapshot.

## Actual source

[Snapshot](implementation-source-draft-01.json) lists16 source/doc paths and their current bytes/hash. New domain modules: intervention-ports, intervention-admission, intervention-validation, intervention-record-store, intervention-events, intervention-intake, intervention-lifecycle. New app composition: manual-segment-bridge. Modified production files are only telemetry/contracts (three explicit reasons), telemetry/index and app/index public exports. Input066/067/068, controller024/027, native physics, sessions, baseline runner and all original evidence inputs remain unchanged.

The lifecycle admits next-tick boundaries before actual066 physics, reserves the complete005 immutable record transition, actual007 event transport and eligible CLOSED intake capacity. After accepted physical tick it commits the prevalidated record map and verifies receipt/readbacks; external event/intake callbacks follow that physical truth. No record reparse is performed inside the concrete repository commit. A selection close callback consumes the same opaque reservation before068 readback; general observer sees the same completed ticket. Current records remain fixed at OPEN, samples at a mode/trip boundary belong exclusively to new tick t. Retire at last accepted tick preserves existing t and never manufactures AUTO/tick acceptance.

Dedicated event transport uses actual007 with capacity known by its own bus; no unknown third-party publishers race the reservation. Accepted listener failure never triggers listener replay. Concrete RAM intake returns a real accepted or explicit known-unaccepted reservation receipt. A missing/throwing receipt is unknown acceptance, blocks retry and retains primary+inspection errors. Result admission consumes one exact current-context/profile/epoch/base/segment operation token, without a trainer/profile activation claim. Protected repository history never evicts on a pointer-only acknowledgement. Saturation64refuses before physical admission.

App bridge passes exact caller packets to actual066, prepares067/068 tickets, and settles068 before general metadata. It supplies strict actual005 metadata readbacks to existing068. Controls, controller/native world, record store, bus and intake remain external resources with their own explicit disposal; bridge disposal does not destroy them. Its bounded faults retain strings, while thrown aggregate errors preserve original caller errors. Pausing preserves OPEN through actual066 suspension. A future world/savefile host provides admitted retirement operation facts; future134/234 is not implemented.

## Draft tests and remaining review

Three new testfiles (manual-segments, manual-segments-bridge, manual-segments-admission) plus fixture are authored and unexecuted. Tests distinguish injected accepted-authority DTOs from the real024/066/067/068 composition with an injected step port, and from future actual native/browser evidence. Cases cover eligibility freeze, sample t, all close reason families, empty/no-movement, trip/rollover, import/restore preview and epoch fencing, stale identity/ticket, pause, selection dedup, protected capacity, real007 listener failure, accepted/unaccepted/unknown intake callbacks, receipt failure aggregation, reentrancy,64KiB preflight and sample cap. Recovery is explicitly a host-committed receipt fixture, not native030 R proof.

Source peer should scrutinize hostile callback receipt shapes/ownership, callback-time generation replacement, boundary cause compatibility, exact sample provenance, disposal while pending, repository/intake/result retention and app ticket ownership. Ordinary observer reads one active identity and no fleet registry walk; admission may inspect bounded64metadata records. Record parser clones, prospective immutable repository map, owned sample copies and result descriptor references are named transient/retained allocations. No exact total RAM claim.

Potential host integration limits are deliberate: actualtrip/recovery/import receipt creation belongs to those feature owners, recorder087/090 supplies real continuous samples/chunk rollover, estimator095/205 owns computation/job cancellation and protected persistence. Pending native AFTER must preserve the original70/110180/600five-pair physical/input choreography and all original absolute/relative gates. Semantic new-reason cases are separate additional source tests, not replacements for the chronological CPU baseline. No substantive renderloop change or invented50minhardware gate is proposed.

## Commands proposed for a later finite CPU grant

From assigned worktree after cwd/root/branch guard:

1. Scoped formatter only the16snapshot source/doc paths plus this new handoff (never old captured archives/source inputs).
2. `npm run typecheck` (both production and test tsconfig).
3. Configured ESLint on owned new/modified TS files, maximum warnings0; report ignored Evidence/Markdown explicitly.
4. `npm run check:architecture` (confirm actual script name from package before execution).
5. `node --import ./scripts/register-typescript.mjs --test tests/telemetry/manual-segments.test.ts tests/telemetry/manual-segments-bridge.test.ts tests/telemetry/manual-segments-admission.test.ts`.
6. Preserve initial sources/command/error stdout/stderr via immutablewx logs before any routine scoped repair. New native AFTER/browser runs need their own reviewed harnesses and explicit serial grants; no conditional native execution is implied by these commands.

Ignored `.log` files require exact forced owned staging later. Evidence069 must retain raw bytes via scoped -text attributes before integration, with all historical failures/logs in stage manifest. Parent owns board/main/shared indexes/Git delivery; this source handoff is not Done or authorization for any future execution.
