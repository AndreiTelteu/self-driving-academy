# 107 — learning edge cases

- Contract: `107-learning-edgecases-v1`
- Admission adapter: `107-learning-edgecase-adapter-v1`
- App adapter: `107-learning-edgecases-app-v1`
- Cases: 13
- Checks: 56/56
- Overall: PASS

The harness reuses the real 087 eligibility windows, the real 088 artifact filter, the real 030
recovery ledger and the real 093 parameter-evidence ledger. It never estimates, publishes a
profile, writes a store or mutates a fleet.

## Scenario matrix

| Scenario | Cases | Result |
| --- | --- | --- |
| PAUSE | PAUSE, FOCUS_LOSS_PAUSE | PASS |
| RECOVERY_ADMITTED | RECOVERY_ADMITTED | PASS |
| RECOVERY_DENIED_PARTIAL | RECOVERY_DENIED, RECOVERY_PARTIAL | PASS |
| INCOMPLETE_GAP | INCOMPLETE_SEGMENT, OPEN_SEGMENT, OBSERVATION_GAP | PASS |
| MANY_STREETS | MANY_STREETS | PASS |
| SHORT_INTERVENTION | SHORT_INTERVENTION | PASS |
| POSITIVE_CONTROLS | CLEAN_FREE_TRAFFIC, CLEAN_LEADER, CLEAN_BLOCKED_GREEN | PASS |

## Cases

| Case | Kind | Result | Artifact causes | Completeness | Learned keys | Contexts observed | Profile changes |
| --- | --- | --- | --- | --- | --- | --- | ---: |
| PAUSE | NEGATIVE | PASS | SUSPENSION_PAUSE | PARTIAL/TRUNCATED_BY_ARTIFACT | none | none | 0 |
| FOCUS_LOSS_PAUSE | NEGATIVE | PASS | SUSPENSION_FOCUS_LOST, SUSPENSION_FOCUS_LOST | PARTIAL/TRUNCATED_BY_ARTIFACT, PARTIAL/TRUNCATED_BY_ARTIFACT | none | none | 0 |
| RECOVERY_ADMITTED | NEGATIVE | PASS | COLLISION_IMPULSE, RECOVERY_TELEPORT | PARTIAL/RECOVERY | speed_delta_urban | FREE_TRAFFIC | 0 |
| RECOVERY_DENIED | NEGATIVE | PASS | RECOVERY_DENIED | PARTIAL/RECOVERY | none | FREE_TRAFFIC | 0 |
| RECOVERY_PARTIAL | NEGATIVE | PASS | RECOVERY_PARTIAL | PARTIAL/RECOVERY | none | FREE_TRAFFIC | 0 |
| INCOMPLETE_SEGMENT | NEGATIVE | PASS | SEGMENT_INCOMPLETE, CLOSE_REASON_DATA_LOSS, CHECKPOINT_LOST | TRUNCATED/SEGMENT_INCOMPLETE, TRUNCATED/DATA_LOSS, TRUNCATED/CHECKPOINT_LOST | none | FREE_TRAFFIC | 0 |
| OPEN_SEGMENT | NEGATIVE | PASS | none | PARTIAL/OPEN_SEGMENT | none | FREE_TRAFFIC | 0 |
| OBSERVATION_GAP | NEGATIVE | PASS | OBSERVATION_GAP | PARTIAL/OBSERVATION_GAP | none | FREE_TRAFFIC | 0 |
| MANY_STREETS | POSITIVE | PASS | none | COMPLETE/SEGMENT_CLOSED | speed_delta_urban, intersection_approach_speed | FREE_TRAFFIC, LEADER, BLOCKED_GREEN | 0 |
| SHORT_INTERVENTION | POSITIVE | PASS | none | COMPLETE/SEGMENT_CLOSED, COMPLETE/SEGMENT_CLOSED | speed_delta_urban | FREE_TRAFFIC | 0 |
| CLEAN_FREE_TRAFFIC | POSITIVE | PASS | none | COMPLETE/SEGMENT_CLOSED | speed_delta_urban | FREE_TRAFFIC | 0 |
| CLEAN_LEADER | POSITIVE | PASS | none | COMPLETE/SEGMENT_CLOSED | following_time_headway, following_min_gap, queue_standstill_gap, following_speed_gain, yield_time_gap | LEADER | 0 |
| CLEAN_BLOCKED_GREEN | POSITIVE | PASS | none | COMPLETE/SEGMENT_CLOSED | none | BLOCKED_GREEN | 0 |

## Checks

| Check | Expected | Actual | Result | Detail |
| --- | --- | --- | --- | --- |
| contract-version | 107-learning-edgecases-v1 | 107-learning-edgecases-v1 | PASS | 107 harness version |
| adapter-version | 107-learning-edgecase-adapter-v1 | 107-learning-edgecase-adapter-v1 | PASS | frozen admission adapter version |
| app-adapter-version | 107-learning-edgecases-app-v1 | 107-learning-edgecases-app-v1 | PASS | frozen report adapter version |
| closed-case-set | PAUSE,FOCUS_LOSS_PAUSE,RECOVERY_ADMITTED,RECOVERY_DENIED,RECOVERY_PARTIAL,INCOMPLETE_SEGMENT,OPEN_SEGMENT,OBSERVATION_GAP,MANY_STREETS,SHORT_INTERVENTION,CLEAN_FREE_TRAFFIC,CLEAN_LEADER,CLEAN_BLOCKED_GREEN | PAUSE,FOCUS_LOSS_PAUSE,RECOVERY_ADMITTED,RECOVERY_DENIED,RECOVERY_PARTIAL,INCOMPLETE_SEGMENT,OPEN_SEGMENT,OBSERVATION_GAP,MANY_STREETS,SHORT_INTERVENTION,CLEAN_FREE_TRAFFIC,CLEAN_LEADER,CLEAN_BLOCKED_GREEN | PASS | the closed case set is exactly the declared one |
| scenarios | 7 | 7 | PASS | seven evidence scenarios |
| cases | 13 | 13 | PASS | thirteen closed cases |
| all-cases-pass | true | true | PASS | every case satisfies its checks |
| deterministic | true | true | PASS | two runs produce byte-identical reports |
| coverage-kinds | COLLISION,TELEPORT,PAUSE,INCOMPLETE_SAMPLE | COLLISION,TELEPORT,PAUSE,INCOMPLETE_SAMPLE | PASS | every 088 artifact kind is exercised |
| coverage-causes | COLLISION_IMPULSE,RECOVERY_TELEPORT,RECOVERY_DENIED,RECOVERY_PARTIAL,SUSPENSION_PAUSE,SUSPENSION_FOCUS_LOST,SEGMENT_INCOMPLETE,CLOSE_REASON_DATA_LOSS,CHECKPOINT_LOST,OBSERVATION_GAP | COLLISION_IMPULSE,RECOVERY_TELEPORT,RECOVERY_DENIED,RECOVERY_PARTIAL,SUSPENSION_PAUSE,SUSPENSION_FOCUS_LOST,SEGMENT_INCOMPLETE,CLOSE_REASON_DATA_LOSS,CHECKPOINT_LOST,OBSERVATION_GAP | PASS | every 088 artifact cause is exercised |
| coverage-window-classes | PREFIX_ELIGIBLE,FULLY_SUPPRESSED | PREFIX_ELIGIBLE,FULLY_SUPPRESSED | PASS | both 088 split classes are exercised |
| coverage-completeness | COMPLETE,PARTIAL,TRUNCATED | COMPLETE,PARTIAL,TRUNCATED | PASS | all three 088 completeness degrees are exercised |
| pause-cause | SUSPENSION_PAUSE | SUSPENSION_PAUSE | PASS | a pause has its own cause |
| pause-zero-learned | 0 | 0 | PASS | a pause learns nothing |
| pause-zero-no-evidence | true | true | PASS | no ledger key receives pause evidence |
| focus-cause | SUSPENSION_FOCUS_LOST | SUSPENSION_FOCUS_LOST | PASS | focus loss is distinct from a panel pause |
| focus-zero-learned | 0 | 0 | PASS | focus loss learns nothing |
| focus-fully-suppressed | FULLY_SUPPRESSED | FULLY_SUPPRESSED | PASS | a suspension from tick one leaves no prefix |
| recovery-teleport-cause | RECOVERY_TELEPORT | RECOVERY_TELEPORT | PASS | an admitted/completed recovery is a TELEPORT |
| recovery-proof-operation | op-completed | op-completed | PASS | the 030 operation proof is preserved |
| recovery-prefix-speed | READY | READY | PASS | the long usable prefix remains evidence |
| recovery-post-refused | OBSERVATION_OUTSIDE_USABLE_PREFIX | OBSERVATION_OUTSIDE_USABLE_PREFIX | PASS | the teleport interval never becomes evidence |
| recovery-collision-retained | true | true | PASS | the real collision fact is retained |
| denied-cause | RECOVERY_DENIED | RECOVERY_DENIED | PASS | denied recovery keeps its cause |
| denied-zero-learned | 0 | 0 | PASS | a denied recovery learns nothing |
| partial-cause | RECOVERY_PARTIAL | RECOVERY_PARTIAL | PASS | partial recovery keeps its cause |
| partial-zero-learned | 0 | 0 | PASS | a partial recovery learns nothing |
| incomplete-truncated | 3 | 3 | PASS | incomplete, data-loss and checkpoint-loss are all TRUNCATED |
| incomplete-zero-learned | 0 | 0 | PASS | a truncated tail never becomes learned behaviour |
| open-reason | OPEN_SEGMENT | OPEN_SEGMENT | PASS | an open segment is explicit |
| open-zero-learned | 0 | 0 | PASS | an open segment does not fabricate a value |
| gap-reason | OBSERVATION_GAP | OBSERVATION_GAP | PASS | a lost observation window is explicit |
| gap-refused | OBSERVATION_OUTSIDE_USABLE_PREFIX | OBSERVATION_OUTSIDE_USABLE_PREFIX | PASS | the lost span never becomes evidence |
| many-distinct-episodes | 3 | 3 | PASS | three distinct street opportunities count separately |
| many-repeated-frames-deduped | 3 | 3 | PASS | repeated frames of the same opportunity add no episode |
| many-contexts | FREE_TRAFFIC,LEADER,BLOCKED_GREEN | FREE_TRAFFIC,LEADER,BLOCKED_GREEN | PASS | the three contexts remain represented |
| many-blocked-green-refused | CONTEXT_NOT_EVIDENCE | CONTEXT_NOT_EVIDENCE | PASS | blocked green is not preference evidence |
| many-no-green-spill | NO_EVIDENCE | NO_EVIDENCE | PASS | blocked green adds no green-start evidence |
| short-ready-keys | speed_delta_urban | speed_delta_urban | PASS | only the observed speed context reaches READY |
| short-within-context | 1 | 1 | PASS | a ten-second short intervention contributes exactly one episode |
| short-following-no-evidence | NO_EVIDENCE | NO_EVIDENCE | PASS | no following evidence is fabricated |
| short-signal-no-evidence | NO_EVIDENCE | NO_EVIDENCE | PASS | no signal evidence is fabricated |
| short-manual-refused | ELIGIBILITY_EXCLUDED | ELIGIBILITY_EXCLUDED | PASS | the MANUAL part of the short intervention is refused explicitly |
| short-manual-no-episode | 1 | 1 | PASS | MANUAL does not inflate the eligible episode count |
| positive-free-ready | READY | READY | PASS | free traffic produces a speed control |
| positive-leader-ready | READY | READY | PASS | varied leader speeds produce following evidence |
| positive-leader-no-speed | NO_EVIDENCE | NO_EVIDENCE | PASS | a leader never becomes preferred speed |
| positive-green-no-delay | NO_EVIDENCE | NO_EVIDENCE | PASS | blocked green produces no green-start delay |
| no-profile-changes | 0 | 0 | PASS | no profile value changed |
| no-profile-publication | 0 | 0 | PASS | no profile version was published |
| no-store-writes | 0 | 0 | PASS | no store was written |
| no-fleet-mutations | 0 | 0 | PASS | no fleet vehicle was mutated |
| no-candidates | 0 | 0 | PASS | no estimator candidate was produced |
| ledger-keys-complete | 312 | 312 | PASS | each case reads all 24 M keys |
| checks-all-pass | true | true | PASS | every per-case check passes |
| overall-pass | true | true | PASS | the aggregate is PASS |

## Summary

- Scenarios: 7
- Checks: 56/56
- Overall: PASS
- Learned keys across positive controls: following_min_gap, following_speed_gain, following_time_headway, intersection_approach_speed, queue_standstill_gap, speed_delta_urban, yield_time_gap
- Profile changes: 0
- Profile publications: 0
- Store writes: 0
- Fleet mutations: 0

## Limits

- Observations are deterministic synthetic fixtures shaped like the real 086/087/088/093 records;
  they are not captured gameplay sessions.
- The harness does not run the 094–099 estimators, the 103 worker, the 109/110 profile store or a
  live fleet. A READY key is evidence sufficiency only, never an estimate or a publication.
- Pause and focus-loss facts are built as real 088 suspension inputs with the documented 070
  causes; no headed browser pause/focus probe is included.
- No FPS, GPU, frame-time or hardware claim is made.
