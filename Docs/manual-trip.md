# 072 Manual trip and short intervention

PBI 072 exports `createManualTrip` and `manualTripContractFacts` from `src/app/manual-trip.ts`
(versioned `072-manual-trip-v1`). It is the **composition root** of one real ride across a short
manual intervention: it drives the existing 061 lifecycle through the existing 062/063 service gate
while the existing 066 seat, 067 mode intents, 068 selection and 069 segment lifecycle are applied by
the existing 069 bridge (`createManualSegmentBridge`). It owns no ride, no body, no clock and no
physics: it orders the real modules and reads their accepted truth.

## Ownership

| Component | Owns | Must not |
| --- | --- | --- |
| 072 `createManualTrip` | the trip driver: one bound ride id, the accepted-tick gate, the MANUAL/LEARNING-then-AUTO sequence, the frozen result/statistics, the per-trip refusal counters | create a second ride, move the passenger, rewrite the profile, fabricate a tick, step physics or open a segment itself |
| 061 `createRideLifecycle` | the ride record, its state machine, terminal release and transitions | be re-begun on a mode change |
| 060 dispatcher | the taxi claim and its exact release | lose the claim because the player changed mode |
| 062/063 pickup/dropoff | the zone/dwell proofs and the single `PICKUP_COMPLETE`/`DROPOFF_COMPLETE` write | learn or branch on the control mode |
| 066 `createControlAuthority` | the single PLAYER seat, accepted physical tick and input clear | accept two mode requests in one tick |
| 067 `createModeControls` / 068 `createVehicleSelection` | the M/L intention ticket and its settlement | optimistically change the mode |
| 069 `createInterventionLifecycle` | the OPEN/CLOSED segment, learning eligibility and intake admission | admit a MANUAL record or publish an unobserved parameter |
| 071 `evaluateTakeoverContinuity` | the measured handover continuity and the close reason it certifies | repair, clamp or teleport the state |
| host / composition | authoritative `readState`, telemetry, observation, LEARNING eligibility, the physical readback and the pause decision | expect the trip driver to invent any of them |

## API

```ts
const trip = createManualTrip({
  context, lifecycle, pickup, dropoff, authority, modes, selection,
  taxiIdentity, profile, readState,           // required
  ownerId, readTelemetry, readObservation,
  readLearningEligibility, continuity,        // optional
});

trip.begin({ requestId, eventId, tick, taxiId });
trip.requestMode({ tick, mode: 'MANUAL', rideId? });
trip.step({ tick, packets });
trip.result();
trip.stats();
trip.dispose();
```

`begin` is the **only** call that touches the ride lifecycle. It refuses a second bind
(`DUPLICATE_RIDE` after a completed ride is `RIDE_TERMINAL`), a foreign taxi (`TAXI_MISMATCH`) or a
tick that is not the current accepted tick (`TICK_NOT_CURRENT`).

`requestMode` validates the current accepted tick, a live non-suspended authority, an empty 067
intention queue, the closed `AUTO`/`MANUAL`/`LEARNING` vocabulary, the exact taxi token selected in
068 and the explicit 069 LEARNING eligibility fact. It folds the requested mode into one real M/L
intention and returns `appliesAtTick = tick + 1`; the mode is still the old one until the next
accepted step.

`step` accepts exactly `currentTick + 1`. It advances the 061 ride once, hands the packets to the
069 bridge (which applies 068/067 through 066), then reads the authoritative 005 state, observes the
062/063 gate, records the host observation, appends one bounded 069 sample and measures the optional
071 handover. There is no catch-up path and no fabricated tick.

`result()` is a frozen read model: the ride record with its four cost/proof fields, the segment list,
the LEARNING publications, the unchanged profile values/proofs, the mode tick split, the handovers
and the refusal counters. `stats()` is the compact version. `dispose()` retires an open segment with
`SHUTDOWN`, disposes only the trip-owned store/transport/intake/bridge and never releases the host
ride or its 060 claim.

## Trip rules

- **One ride.** A mode change never calls `begin`. `rideId`, `requestId`, `assignmentId`, `taxiId`,
  `pickupZoneId`, `dropoffZoneId`, both lane routes, both cost values and `startedTick` are identical
  before, during and after the intervention; the 060 claim stays `ASSIGNED` until the real release.
- **Passenger and destination are preserved.** A mode switch changes only the control mode; the
  pickup/dropoff zones, the passenger and the destination are the same real assignment.
- **AUTO resumes the same ride.** Returning to AUTO resumes the same 061 record from its current
  state. It never creates a new ride, a new request or a new completion.
- **Proofs are preserved.** `boardingTick`, `completionTick` and their dwell ticks come from the real
  062/063 receipts and are unchanged by the intervention. `DROPOFF_COMPLETE` is written once; a
  repeated observation is a `duplicate: true` readback, not a second release.
- **Deterministic ticks.** A step for any other tick is `TICK_NOT_NEXT`; a mode intent for any other
  tick is `TICK_NOT_CURRENT`; a refused call advances nothing.
- **Pause is not time.** A suspended 066 rejects both a mode intent and a step; no suspended wall
  time becomes a tick.

## Segment rules

| Mode | `learningEligible` | Telemetry | 069 intake | Publication |
| --- | --- | --- | --- | --- |
| MANUAL | `false` (069) | recorded in the MANUAL record, capped at 32 samples | never admitted | none |
| LEARNING | `true` only from the explicit eligibility fact | recorded while OPEN | one descriptor per closed eligible record | only the parameter keys the host actually observed in that segment |

A closed eligible LEARNING segment publishes the intersection of its host-observed keys and the 24
`initial_learning_target` parameters; every other parameter is reported as `unobserved`. MANUAL is
service evidence, not learning evidence: it is never counted as a LEARNING segment, never enters the
intake and never republishes an old value. The trip never writes the profile `values` or `proofs`;
`result().profile.unchanged` proves the host read model is byte-identical after the whole trip.

Close reasons are the real 069 vocabulary used by this driver: `RETURN_TO_AUTO` (back to autonomy),
`MODE_CHANGE` (MANUAL ↔ LEARNING), `RIDE_COMPLETED` (the ride finished while the player was still
manual), `VEHICLE_SWITCH` (the host switched the selected body) and `SHUTDOWN` (disposal retires an
open segment). If the rider stays MANUAL/LEARNING after delivery, a new segment opens at the
completion boundary **without changing the control mode**.

## Continuity

The optional `continuity` port supplies the real 033 graph, the host authoritative physical readback
and an optional 054 re-entry observation. On the first MANUAL/LEARNING → AUTO step 072 calls the real
071 `evaluateTakeoverContinuity` with the last MANUAL command and the first AUTONOMY command. The
decision is recorded in `result().handovers` and its `segmentCloseReason` is the reason the real 069
segment closes with. A physical producer that reports a jump is reported as
`STATE_CONTINUITY_VIOLATION`/`statePreserved: false` with the enumerated violations; the trip never
repairs, clamps or teleports the state and never retargets the ride because of it. When no 054
observation is supplied, 071 abstains (`REENTRY_ABSTAINED`) and the state measurement is still
reported.

## What it is NOT

- **Not a second ride lifecycle, dispatcher or pickup/dropoff.** 061/060/062/063 keep their contracts.
- **Not a second authority, mode adapter or segment owner.** 066/067/068/069 are used unchanged.
- **Not a physics controller, a clock or a pause mechanism.** 024/021 own the body, 012/008 the clock
  and 070 the suspension decision.
- **Not a renderer, HUD, camera or input binding.** No Babylon, DOM or Rapier import exists in the
  module; 073–075 own the screen.
- **Not learning.** It never trains, activates a profile version, estimates style or starts a worker.
- **Not persistence, fare, review, XP or KPI.** Those remain 083+/209.

## Verification

`tests/app/manual-trip.test.ts` (14 tests) composes the real 057/059/060/061/062/063 chain with the
real 066/067/068/069/071 modules and covers: one ride across AUTO → MANUAL → AUTO; MANUAL telemetry
that never becomes learning evidence; a complete MANUAL trip with unchanged profile values and
proofs; a short LEARNING demonstration that publishes only the observed keys; the real pickup/dropoff
proofs and claim preserved across the switch; AUTO resuming the same ride without a second release; a
duplicate completion observation; every closed refusal; deterministic tick gaps; the completion
boundary while MANUAL; a reported physical discontinuity that is never repaired or hidden; disposal;
and the committed evidence transcript.

`npm run trip:manual` writes the deterministic 19-check transcript and the human table in
[Evidence/072-manual-trip](Evidence/072-manual-trip/README.md). The report runs two identical mixed
scenarios and compares them; it contains no wall-clock value.

Limitations: the evidence fixture authors the 005 physical state and the service timeline instead of
using a native Rapier world; the 054 re-entry observation is not supplied, so 071 abstains on
re-entry while still measuring the state; and no headed browser, frame, GPU or hardware probe is
included, so visual/HUD acceptance stays owed to 153/224/235.
