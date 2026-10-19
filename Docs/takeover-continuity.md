# Takeover and return continuity (071)

PBI 071 exports `evaluateTakeoverContinuity` and `takeoverContinuityBehaviorFacts` from
`src/autonomy/takeover-continuity.ts` (versioned `071-takeover-continuity-v1`). It is the **continuity
layer on top of 054**, not a second copy of it: the re-entry decision stays 054's
`evaluateAuthorityReentry` and 071 re-exposes it verbatim in `reentryReason`/`reentry`. What 071 adds
is the measurement and the frozen outcome the dependencies deliberately leave out:

- it **measures and bounds** the authoritative physical channels across one handover step and reports
  every excess instead of clamping it;
- it **measures and bounds** the command/target step between the last MANUAL command and the first
  AUTONOMY target;
- it **raises the existing 045 BLOCKED fact** (`BehaviorFacts.routeBlocked`) exactly when no feasible
  in-graph re-entry exists, so the 045 reason set is not duplicated.

The module is a pure, deterministic function of its inputs. It owns no clock, no body, no
authoritative pose writer, no planner and no route search, and it retains no history.

## Ownership

| Component | Owns | Must not |
| --- | --- | --- |
| 071 `evaluateTakeoverContinuity` | measuring/bounding the physical and command continuity, mapping 054's action onto the 045 fact, the frozen outcome and the 069 close reason | write, clamp, repair or re-initialise any body; decide the re-entry; own the clock or the seat |
| 024 `createVehicleController` + 021 physics | the physical command arbitration and the authoritative pose/velocity integration | let a handover teleport or re-initialise a body |
| 066 `createControlAuthority` | the single PLAYER seat, the accepted physical tick and the input clear of the departed body | read or write the continuity bounds |
| 069 `createInterventionLifecycle` | the MANUAL/LEARNING segment open/close and its close reason | reopen or double-close a segment at a handover |
| 054 `evaluateAuthorityReentry` | the re-entry decision: locate the real 033 lane, prove the drive-back route through 041, or request 030 | own the physical move or the 045 state |
| 030 vehicle recovery | the physical placement and its native inspection/footprint/occupancy checks | be bypassed by a re-entry plan |
| 045 behavior FSM | the `BLOCKED` state and its closed reason set | be re-implemented as a second state machine |
| 070 pause/focus | whether the world is suspended | be suspected of turning paused wall time into ticks |
| caller (composition root) | supplying the authoritative before/after states, the last MANUAL and first AUTONOMY commands, the 054 observation and the `collisionObserved` flag | assume a clean handover without reading `statePreserved` |

**When the two disagree**, the physical producer (021/024) stays authoritative: if a reported state
does not fit the documented step bound, 071 reports `reason: STATE_CONTINUITY_VIOLATION` with the
enumerated `violations` and refuses to certify `statePreserved`. It never repairs the state, never
clamps the measurement, and **never raises BLOCKED by itself** — the block comes only from 054's
re-entry decision. The caller must treat `statePreserved: false` as a contract failure
(`TAKEOVER_CONTINUITY_OWNERSHIP.disagreement` publishes exactly this).

## Continuity bounds

`before` is the authoritative state at the last MANUAL/LEARNING tick and `after` at the handover tick;
the module rejects anything that is not exactly one authoritative step (`after.tick === decisionTick`,
`before.tick + 1 === after.tick`). Each channel is compared against a bound **derived from the reported
physical truth**, so a legitimate one-tick advance is never flagged while a reset or teleport is:
a re-initialised body keeps zero speed but shows a large pose jump; a shifted/repared body changes a
channel that physics cannot change within one tick.

| Channel | Bound | Notes |
| --- | --- | --- |
| position | `max(speedBefore, speedAfter) · dt + 1e-3 m` | the pose may never move faster than the vehicle is actually travelling |
| heading | `max(yawRateBefore, yawRateAfter) · dt + 1e-3 rad` | an **in-curve** handover legitimately moves the heading by ten times the flat epsilon and is still reported preserved |
| velocity | `12 m/s² · dt + 1e-3 m/s` | exempted when the caller declares a real 028 collision (a physical impulse, not a re-initialisation); the magnitude is still reported |
| yaw rate | `12 rad/s² · dt + 1e-3 rad/s` | same collision exemption |
| drivetrain direction | exact equality | a handover may never fabricate a shift (027) |
| damage | exact equality | a handover may never fabricate a repair (029) |

The measurement is always reported (`measured`, `bounds`) even when it violates a bound: nothing is
silently accepted.

## Command continuity

`lastManualCommand` (the last effective PLAYER command) and `firstAutonomyCommand` (the first
AUTONOMY target) are compared channel-wise (`throttle`, `brake`, `steering`, `handbrake`) against the
documented jerk bound `maximumCommandStepPerTick` = **0.5**. The verdict is `WITHIN_BOUND`,
`EXCEEDS_BOUND` or `UNKNOWN` (when the driver never commanded). An excess is reported
(`commandHandling: 'REPORTED'`) and is **not** clamped or rewritten: 024 remains the command arbiter
and owns any rate limit.

## Transition table

| Transition | Physical continuity | Re-entry (054) | 045 outcome | 069 close reason |
| --- | --- | --- | --- | --- |
| **In a curve** (yaw rate ≠ 0), on lane | pose/heading advance one integrated step; gear/damage carried | `ON_LANE` → `CONTINUE` | not blocked | `RETURN_TO_AUTO` |
| **Off the lane centre** (driven off but on a 033 corridor) with a proven route | same physical carry | `OFF_CENTRE_LANE` → `DRIVE_TO_LANE` with the target lane, real lateral offset and heading error | not blocked | `RETURN_TO_AUTO` |
| **Off the 033 graph** (driven off-road), host permits 030 | same physical carry | `RECOVERY_REQUESTED` → `REQUEST_RECOVERY` with 030's `RecoveryRoadProof` | **BLOCKED** + the explicit recovery offered | `RETURN_TO_AUTO` |
| **Off the 033 graph**, no 030 permission / no target / route not proven | same physical carry | `RECOVERY_DISALLOWED` / `NO_RECOVERY_TARGET` / `ROUTE_NOT_PROVEN` → `REENTRY_IMPOSSIBLE` | **BLOCKED** with the distinguishable cause | `RETURN_TO_AUTO` |
| **In collision** (damaged, rolling) | pose bounded by the pre-impact speed; velocity/yaw-rate impulse declared and reported; gear/damage carried; **no repair, no fabricated recovery** | whatever 054 decides on the real graph | unchanged by the collision | `RETURN_TO_AUTO` |
| MANUAL/LEARNING → MANUAL/LEARNING | same physical carry | `MANUAL_AUTHORITY` → `CONTINUE` (the human is never planned over) | not blocked | `MODE_CHANGE` |

`blocked` is true exactly for `REQUEST_RECOVERY` and `REENTRY_IMPOSSIBLE`, matching
[Docs/08](08-interfata-camera-si-control.md): the taxi is marked BLOCKED and the explicit recovery is
offered together with the block. `takeoverContinuityBehaviorFacts` raises `routeBlocked` and nothing
else; an abstention (`reentry: UNKNOWN` for a missing observation or graph) returns `null` so the
caller's own fact is left untouched.

## What it is NOT

- **Not a second re-entry policy.** It does not locate a lane, search a route or build a recovery
  target: 054 and 041/033/030 do, and 071 re-exposes their decision verbatim.
- **Not a physics controller or a pose owner.** There is no transform/velocity setter, the decision
  carries `teleportsVehicle: false`, and the module has no write path into anything it is given.
- **Not a second state machine.** 045 keeps the `BLOCKED` state and the closed reason set; 071 only
  raises `routeBlocked`.
- **Not a command arbiter.** It measures and reports the handover command step; 024 owns the command.
- **Not a segment owner.** It reports the 069 close reason the caller must use; 069 opens and closes.
- **Not a clock or a pause mechanism.** 012/008 own the clock and 070 owns suspension; 071 receives
  the real accepted ticks and never fabricates one.
- **Not a repair, a respawn or a reset.** A collision or a BLOCKED outcome never changes the damage,
  the gear or the pose through this module.

## Verification

`tests/autonomy/takeover-continuity.test.ts` (9 tests) composes the real 033 lane graph, the real 044
context, the real 045 FSM, the real 041 planner and 054's real `evaluateAuthorityReentry`: an
**in-curve** takeover whose heading moves ten times the flat epsilon yet stays inside the yaw-rate
bound and whose deep-frozen authoritative state is proven unmutated; a **teleport/re-initialisation**
that is reported with its real 10 m step and still not turned into a BLOCKED state; the command bound
including the pathological hard-brake-to-full-throttle step that is reported, not clamped; an
**off-centre** re-entry whose `DRIVE_TO_LANE` offset equals the real 033 projection; an
**impossible** re-entry that becomes BLOCKED with the 054 cause, deterministic over 100 calls, plus the
030 escalation, the `NO_RECOVERY_TARGET` and the `ROUTE_NOT_PROVEN` cases; a **collision** takeover
that preserves a damaged rolling vehicle and fabricates neither a repair nor a recovery; the
abstention paths; the atomic rejection of malformed handovers; and a real 066/070 composition across a
MANUAL→AUTO handover whose close reason the real 069 lifecycle accepts. Measured before/after cost and
the owned-memory envelope are in [Evidence/071-takeover-continuity](Evidence/071-takeover-continuity/README.md).
No headed browser/frame probe is included: it stays owed to 153/224/235.
