# 108 learning gate — 24 M keys

Contract: `108-learning-gate24-v1` · app adapter: `108-learning-gate24-app-v1` · gate: **CLOSED**.

The matrix is derived from the real 092 M keys, 093 evidence specs, 094–099 key sets, 086
opportunity vocabulary, 105 profile results and 107 edge cases. A key is validated only when all
five sources agree; the gate is never forced closed.

## Summary

- Gate: CLOSED
- M keys in the 092 registry: 24
- Matrix rows / validated / unvalidated: 24 / 24 / 0
- Estimator owners: 6
- Channels / contexts: 7 / 2
- Dedicated keys (12): red_stop_probability, green_start_delay, red_stop_line_offset, late_red_brake_threshold, stop_full_probability, stop_dwell_time, stop_line_offset, yield_time_gap, lane_change_front_gap, lane_change_back_gap, lane_change_speed_gain, lane_change_cooldown
- 105 scenario rows: 96
- 107 cases read: 13
- Matrix errors: None.
- Signature: `fnv1a64:a7dc00cd4e0dbc08`

## Dedicated versus carrier opportunities

Dedicated keys (12): red_stop_probability, green_start_delay, red_stop_line_offset, late_red_brake_threshold, stop_full_probability, stop_dwell_time, stop_line_offset, yield_time_gap, lane_change_front_gap, lane_change_back_gap, lane_change_speed_gain, lane_change_cooldown.
Carrier keys (12): speed_delta_urban, speed_delta_residential, curve_lateral_accel, intersection_approach_speed, desired_acceleration, comfort_deceleration, acceleration_jerk, brake_reaction_delay, following_time_headway, following_min_gap, queue_standstill_gap, following_speed_gain.

The 086 vocabulary has no dedicated free-flow or following opportunity kind. Speed,
acceleration and following keys are therefore carried by GREEN (and STOP for queue standstill);
signal keys use RED/GREEN, stop/yield keys use STOP/YIELD, and lane keys use LANE_CHANGE as
dedicated opportunities. The carrier relation is a limitation of the 086 vocabulary, not evidence
that a dedicated free-flow opportunity exists.

## Coverage matrix

| # | Key | Owner | Channel | Contexts | Opportunity | Role | 105 within | 105 scenario result | 107 context cases | Status | Reasons |
| ---: | --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- |
| 1 | speed_delta_urban | 094 | SPEED_SAMPLE | FREE_TRAFFIC | GREEN (CARRIER) | CARRIER | 4/4 | PRUDENT=WITHIN_TOLERANCE<br>IMPULSIVE=WITHIN_TOLERANCE<br>RECKLESS=WITHIN_TOLERANCE<br>MIXED=WITHIN_TOLERANCE | MANY_STREETS, SHORT_INTERVENTION, CLEAN_FREE_TRAFFIC | VALIDATED | — |
| 2 | speed_delta_residential | 094 | SPEED_SAMPLE | FREE_TRAFFIC | GREEN (CARRIER) | CARRIER | 4/4 | PRUDENT=WITHIN_TOLERANCE<br>IMPULSIVE=WITHIN_TOLERANCE<br>RECKLESS=WITHIN_TOLERANCE<br>MIXED=WITHIN_TOLERANCE | MANY_STREETS, SHORT_INTERVENTION, CLEAN_FREE_TRAFFIC | VALIDATED | — |
| 3 | curve_lateral_accel | 094 | ACCELERATION | FREE_TRAFFIC | GREEN (CARRIER) | CARRIER | 4/4 | PRUDENT=WITHIN_TOLERANCE<br>IMPULSIVE=WITHIN_TOLERANCE<br>RECKLESS=WITHIN_TOLERANCE<br>MIXED=WITHIN_TOLERANCE | MANY_STREETS, SHORT_INTERVENTION, CLEAN_FREE_TRAFFIC | VALIDATED | — |
| 4 | intersection_approach_speed | 094 | SPEED_SAMPLE | FREE_TRAFFIC | GREEN (CARRIER) | CARRIER | 4/4 | PRUDENT=WITHIN_TOLERANCE<br>IMPULSIVE=WITHIN_TOLERANCE<br>RECKLESS=WITHIN_TOLERANCE<br>MIXED=WITHIN_TOLERANCE | MANY_STREETS, SHORT_INTERVENTION, CLEAN_FREE_TRAFFIC | VALIDATED | — |
| 5 | desired_acceleration | 095 | ACCELERATION | FREE_TRAFFIC | GREEN (CARRIER) | CARRIER | 4/4 | PRUDENT=WITHIN_TOLERANCE<br>IMPULSIVE=WITHIN_TOLERANCE<br>RECKLESS=WITHIN_TOLERANCE<br>MIXED=WITHIN_TOLERANCE | MANY_STREETS, SHORT_INTERVENTION, CLEAN_FREE_TRAFFIC | VALIDATED | — |
| 6 | comfort_deceleration | 095 | DECELERATION | FREE_TRAFFIC | GREEN (CARRIER) | CARRIER | 4/4 | PRUDENT=WITHIN_TOLERANCE<br>IMPULSIVE=WITHIN_TOLERANCE<br>RECKLESS=WITHIN_TOLERANCE<br>MIXED=WITHIN_TOLERANCE | MANY_STREETS, SHORT_INTERVENTION, CLEAN_FREE_TRAFFIC | VALIDATED | — |
| 7 | acceleration_jerk | 095 | ACCELERATION | FREE_TRAFFIC | GREEN (CARRIER) | CARRIER | 4/4 | PRUDENT=WITHIN_TOLERANCE<br>IMPULSIVE=WITHIN_TOLERANCE<br>RECKLESS=WITHIN_TOLERANCE<br>MIXED=WITHIN_TOLERANCE | MANY_STREETS, SHORT_INTERVENTION, CLEAN_FREE_TRAFFIC | VALIDATED | — |
| 8 | brake_reaction_delay | 095 | DECELERATION | FREE_TRAFFIC | GREEN (CARRIER) | CARRIER | 4/4 | PRUDENT=WITHIN_TOLERANCE<br>IMPULSIVE=WITHIN_TOLERANCE<br>RECKLESS=WITHIN_TOLERANCE<br>MIXED=WITHIN_TOLERANCE | MANY_STREETS, SHORT_INTERVENTION, CLEAN_FREE_TRAFFIC | VALIDATED | — |
| 9 | following_time_headway | 096 | HEADWAY_PAIR | LEADER | GREEN (CARRIER) + STOP (CARRIER) | CARRIER | 4/4 | PRUDENT=WITHIN_TOLERANCE<br>IMPULSIVE=WITHIN_TOLERANCE<br>RECKLESS=WITHIN_TOLERANCE<br>MIXED=WITHIN_TOLERANCE | MANY_STREETS, CLEAN_LEADER | VALIDATED | — |
| 10 | following_min_gap | 096 | HEADWAY_PAIR | LEADER | GREEN (CARRIER) + STOP (CARRIER) | CARRIER | 4/4 | PRUDENT=WITHIN_TOLERANCE<br>IMPULSIVE=WITHIN_TOLERANCE<br>RECKLESS=WITHIN_TOLERANCE<br>MIXED=WITHIN_TOLERANCE | MANY_STREETS, CLEAN_LEADER | VALIDATED | — |
| 11 | queue_standstill_gap | 096 | HEADWAY_PAIR | LEADER | GREEN (CARRIER) + STOP (CARRIER) | CARRIER | 4/4 | PRUDENT=WITHIN_TOLERANCE<br>IMPULSIVE=WITHIN_TOLERANCE<br>RECKLESS=WITHIN_TOLERANCE<br>MIXED=WITHIN_TOLERANCE | MANY_STREETS, CLEAN_LEADER | VALIDATED | — |
| 12 | following_speed_gain | 096 | HEADWAY_PAIR | LEADER | GREEN (CARRIER) + STOP (CARRIER) | CARRIER | 4/4 | PRUDENT=WITHIN_TOLERANCE<br>IMPULSIVE=WITHIN_TOLERANCE<br>RECKLESS=WITHIN_TOLERANCE<br>MIXED=WITHIN_TOLERANCE | MANY_STREETS, CLEAN_LEADER | VALIDATED | — |
| 13 | red_stop_probability | 097 | STOP_OUTCOME | FREE_TRAFFIC | RED (DEDICATED) | DEDICATED | 4/4 | PRUDENT=WITHIN_TOLERANCE<br>IMPULSIVE=WITHIN_TOLERANCE<br>RECKLESS=WITHIN_TOLERANCE<br>MIXED=WITHIN_TOLERANCE | MANY_STREETS, SHORT_INTERVENTION, CLEAN_FREE_TRAFFIC | VALIDATED | — |
| 14 | green_start_delay | 097 | GREEN_START_DELAY | FREE_TRAFFIC | GREEN (DEDICATED) | DEDICATED | 4/4 | PRUDENT=WITHIN_TOLERANCE<br>IMPULSIVE=WITHIN_TOLERANCE<br>RECKLESS=WITHIN_TOLERANCE<br>MIXED=WITHIN_TOLERANCE | MANY_STREETS, SHORT_INTERVENTION, CLEAN_FREE_TRAFFIC | VALIDATED | — |
| 15 | red_stop_line_offset | 097 | STOP_OUTCOME | FREE_TRAFFIC | RED (DEDICATED) | DEDICATED | 4/4 | PRUDENT=WITHIN_TOLERANCE<br>IMPULSIVE=WITHIN_TOLERANCE<br>RECKLESS=WITHIN_TOLERANCE<br>MIXED=WITHIN_TOLERANCE | MANY_STREETS, SHORT_INTERVENTION, CLEAN_FREE_TRAFFIC | VALIDATED | — |
| 16 | late_red_brake_threshold | 097 | DECELERATION | FREE_TRAFFIC | RED (DEDICATED) | DEDICATED | 4/4 | PRUDENT=WITHIN_TOLERANCE<br>IMPULSIVE=WITHIN_TOLERANCE<br>RECKLESS=WITHIN_TOLERANCE<br>MIXED=WITHIN_TOLERANCE | MANY_STREETS, SHORT_INTERVENTION, CLEAN_FREE_TRAFFIC | VALIDATED | — |
| 17 | stop_full_probability | 098 | STOP_OUTCOME | FREE_TRAFFIC | STOP (DEDICATED) | DEDICATED | 4/4 | PRUDENT=WITHIN_TOLERANCE<br>IMPULSIVE=WITHIN_TOLERANCE<br>RECKLESS=WITHIN_TOLERANCE<br>MIXED=WITHIN_TOLERANCE | MANY_STREETS, SHORT_INTERVENTION, CLEAN_FREE_TRAFFIC | VALIDATED | — |
| 18 | stop_dwell_time | 098 | STOP_OUTCOME | FREE_TRAFFIC | STOP (DEDICATED) | DEDICATED | 4/4 | PRUDENT=WITHIN_TOLERANCE<br>IMPULSIVE=WITHIN_TOLERANCE<br>RECKLESS=WITHIN_TOLERANCE<br>MIXED=WITHIN_TOLERANCE | MANY_STREETS, SHORT_INTERVENTION, CLEAN_FREE_TRAFFIC | VALIDATED | — |
| 19 | stop_line_offset | 098 | STOP_OUTCOME | FREE_TRAFFIC | STOP (DEDICATED) | DEDICATED | 4/4 | PRUDENT=WITHIN_TOLERANCE<br>IMPULSIVE=WITHIN_TOLERANCE<br>RECKLESS=WITHIN_TOLERANCE<br>MIXED=WITHIN_TOLERANCE | MANY_STREETS, SHORT_INTERVENTION, CLEAN_FREE_TRAFFIC | VALIDATED | — |
| 20 | yield_time_gap | 098 | HEADWAY_PAIR | LEADER | YIELD (DEDICATED) | DEDICATED | 4/4 | PRUDENT=WITHIN_TOLERANCE<br>IMPULSIVE=WITHIN_TOLERANCE<br>RECKLESS=WITHIN_TOLERANCE<br>MIXED=WITHIN_TOLERANCE | MANY_STREETS, CLEAN_LEADER | VALIDATED | — |
| 21 | lane_change_front_gap | 099 | LANE_CHANGE_OUTCOME | FREE_TRAFFIC | LANE_CHANGE (DEDICATED) | DEDICATED | 4/4 | PRUDENT=WITHIN_TOLERANCE<br>IMPULSIVE=WITHIN_TOLERANCE<br>RECKLESS=WITHIN_TOLERANCE<br>MIXED=WITHIN_TOLERANCE | MANY_STREETS, SHORT_INTERVENTION, CLEAN_FREE_TRAFFIC | VALIDATED | — |
| 22 | lane_change_back_gap | 099 | LANE_CHANGE_OUTCOME | FREE_TRAFFIC | LANE_CHANGE (DEDICATED) | DEDICATED | 4/4 | PRUDENT=WITHIN_TOLERANCE<br>IMPULSIVE=WITHIN_TOLERANCE<br>RECKLESS=WITHIN_TOLERANCE<br>MIXED=WITHIN_TOLERANCE | MANY_STREETS, SHORT_INTERVENTION, CLEAN_FREE_TRAFFIC | VALIDATED | — |
| 23 | lane_change_speed_gain | 099 | LANE_CHANGE_OUTCOME | FREE_TRAFFIC | LANE_CHANGE (DEDICATED) | DEDICATED | 4/4 | PRUDENT=WITHIN_TOLERANCE<br>IMPULSIVE=WITHIN_TOLERANCE<br>RECKLESS=WITHIN_TOLERANCE<br>MIXED=WITHIN_TOLERANCE | MANY_STREETS, SHORT_INTERVENTION, CLEAN_FREE_TRAFFIC | VALIDATED | — |
| 24 | lane_change_cooldown | 099 | LANE_CHANGE_OUTCOME | FREE_TRAFFIC | LANE_CHANGE (DEDICATED) | DEDICATED | 4/4 | PRUDENT=WITHIN_TOLERANCE<br>IMPULSIVE=WITHIN_TOLERANCE<br>RECKLESS=WITHIN_TOLERANCE<br>MIXED=WITHIN_TOLERANCE | MANY_STREETS, SHORT_INTERVENTION, CLEAN_FREE_TRAFFIC | VALIDATED | — |

## Unvalidated keys

None.

## Matrix defects

- 092 M-key set exactly matched: `true`
- Duplicate M keys: none
- Foreign keys (outside the 24 M keys): none

## Effects

- Profile publications: 0
- Store writes: 0
- Fleet mutations: 0

The harness only reads frozen exports: it has no estimator execution of its own and no profile,
store or fleet write path.

## Evidence scenarios

| Scenario | Gate | Validated | Unvalidated | Detail |
| --- | --- | ---: | --- | --- |
| FULL_MATRIX | CLOSED | 24 | — | real 092/093/086/094–099/105/107 exports |
| MISSING_ESTIMATOR | OPEN | 23 | lane_change_cooldown:NO_ESTIMATOR | lane_change_cooldown removed from the 099 key set |
| MISSING_OPPORTUNITY | OPEN | 17 | red_stop_probability:NO_OPPORTUNITY, red_stop_line_offset:NO_OPPORTUNITY, late_red_brake_threshold:NO_OPPORTUNITY, lane_change_front_gap:NO_OPPORTUNITY, lane_change_back_gap:NO_OPPORTUNITY, lane_change_speed_gain:NO_OPPORTUNITY, lane_change_cooldown:NO_OPPORTUNITY | RED and LANE_CHANGE removed from the 086 vocabulary |
| FAILED_SCENARIO | OPEN | 23 | speed_delta_urban:SCENARIO_FAILED | PROFILE_PRUDENT/speed_delta_urban forced OUTSIDE_TOLERANCE |
| CARRIER_TRANSPARENCY | CLOSED | 24 | — | dedicated versus carrier opportunity roles |
| DUPLICATE_INJECTED | OPEN | 23 | speed_delta_urban:DUPLICATE_OWNER | duplicate owner, foreign key and injected 25th key |
| OPEN_VS_CLOSED | CLOSED | 24 | — | gate derived from rows and matrix defects |

## Checks

| Check | Expected | Actual | Result | Detail |
| --- | --- | --- | --- | --- |
| gate-status | CLOSED | CLOSED | PASS | all 24 M keys validated |
| registry-m-keys | 24 | 24 | PASS | 092 initial_learning_target count |
| matrix-rows | 24 | 24 | PASS | one row per M key |
| validated-rows | 24 | 24 | PASS | every key passed all five sources |
| unvalidated-rows | 0 | 0 | PASS | no unvalidated key remains |
| estimator-owners | 6 | 6 | PASS | 094–099 all own at least one key |
| channels | 7 | 7 | PASS | all 093 channels are represented |
| contexts | 2 | 2 | PASS | FREE_TRAFFIC and LEADER contexts |
| scenario-results | 96 | 96 | PASS | 24 keys × 4 profiles |
| edge-cases | 13 | 13 | PASS | closed 107 case set |
| units-from-093 | true | true | PASS | every row carries the 092 unit through its 093 spec |
| reasons-empty | true | true | PASS | validated rows carry no residual reason |
| gate-status | OPEN | OPEN | PASS | a missing owner cannot close the gate |
| unvalidated-rows | 1 | 1 | PASS | only the affected key remains |
| unvalidated-key | lane_change_cooldown | lane_change_cooldown | PASS | the key removed from the 099 set |
| reason | NO_ESTIMATOR | NO_ESTIMATOR | PASS | the reason is closed and exact |
| validated-rows | 23 | 23 | PASS | the other keys are unaffected |
| gate-status | OPEN | OPEN | PASS | a missing 086 kind opens the gate |
| red-reason | NO_OPPORTUNITY | NO_OPPORTUNITY | PASS | RED is no longer available |
| lane-reason | NO_OPPORTUNITY | NO_OPPORTUNITY | PASS | LANE_CHANGE is no longer available |
| green-start-still-valid | true | true | PASS | GREEN remains a dedicated opportunity for green_start_delay |
| dedicated-keys | 5 | 5 | PASS | only green start plus the four STOP/YIELD keys stay dedicated |
| gate-status | OPEN | OPEN | PASS | a retained failure cannot close the gate |
| reason | SCENARIO_FAILED | SCENARIO_FAILED | PASS | outside tolerance is a closed failure reason |
| within-tolerance | 3 | 3 | PASS | three profiles remain inside tolerance |
| retained-failure | OUTSIDE_TOLERANCE | OUTSIDE_TOLERANCE | PASS | the real 105 status is preserved, not rewritten |
| signature-changes | true | true | PASS | the deterministic signature covers the failure |
| carrier-keys | 12 | 12 | PASS | 094–096 keys have no dedicated 086 kind |
| dedicated-keys | 12 | 12 | PASS | 097–099 keys have dedicated kinds |
| carrier-list | speed_delta_urban,speed_delta_residential,curve_lateral_accel,intersection_approach_speed,desired_acceleration,comfort_deceleration,acceleration_jerk,brake_reaction_delay,following_time_headway,following_min_gap,queue_standstill_gap,following_speed_gain | speed_delta_urban,speed_delta_residential,curve_lateral_accel,intersection_approach_speed,desired_acceleration,comfort_deceleration,acceleration_jerk,brake_reaction_delay,following_time_headway,following_min_gap,queue_standstill_gap,following_speed_gain | PASS | carrier keys are listed explicitly |
| roles-uniform | true | true | PASS | a row never mixes dedicated and carrier roles |
| carrier-kinds | GREEN,STOP | GREEN,STOP | PASS | 086 has no dedicated free-flow/following kind |
| carrier-no-dedicated-kind | true | true | PASS | RED/YIELD/LANE_CHANGE are never presented as carriers |
| carrier-opportunities | 16 | 16 | PASS | 12 single-kind carriers plus four following keys with GREEN+STOP |
| duplicate-open | OPEN | OPEN | PASS | duplicate ownership opens the gate |
| duplicate-reason | DUPLICATE_OWNER | DUPLICATE_OWNER | PASS | the key has two estimator owners |
| duplicate-owners | 094,095 | 094,095 | PASS | both real owners are reported |
| foreign-open | OPEN | OPEN | PASS | a foreign key opens the gate |
| foreign-keys | speed_delta_arterial | speed_delta_arterial | PASS | an R key is never accepted as an M key |
| foreign-matrix-error | FOREIGN_KEY | FOREIGN_KEY | PASS | the defect is reported at report level |
| extra-key-open | OPEN | OPEN | PASS | an injected 25th key opens the gate |
| extra-key-mismatch | true | true | PASS | the M-key set must be exactly the 092 24 |
| closed-only-at-24 | true | true | PASS | the real data closes the gate at 24/24 |
| missing-edge-open | OPEN | OPEN | PASS | a missing 107 context opens it |
| missing-edge-reason | NO_EDGE_CASE | NO_EDGE_CASE | PASS | the LEADER context lost its positive 107 coverage |
| status-invariant | true | true | PASS | the gate is derived from rows and matrix defects |
| counts-invariant | true | true | PASS | validated plus unvalidated always equals the matrix rows |
| reasons-invariant | true | true | PASS | validated rows have no reasons and unvalidated rows always do |

## Summary

- Scenarios: 7
- Checks: 48/48
- Real gate: CLOSED
- Carrier keys: 12
- Unvalidated keys: 0
- Overall: PASS
