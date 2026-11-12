# 144 — experiment batches in a worker: progress and cancellation

Contract: `144-experiment-worker-v1`.

## Budgets read from the manifest

| Budget | Value |
| --- | --- |
| status | READY |
| version | 221-synthetic-1 |
| resident experiment worlds | 1 |
| heavy jobs at a time | 1 |
| execution jobs | 8 |
| slice maximum (ms) | 10 |
| progress interval (ms) | 200 |
| progress maximum (Hz) | 5 |
| cancellation target (ms) | 100 |
| owned pending payload (bytes) | 16777216 |

Gaps reported, not invented: workerSchedulingProposal.queueCountAndAge, proposedCapacities.totalHeapBytes, proposedCapacities.wasmBytes, capacityValidation.additionalSuballocations.

## Scenarios

| Scenario | Status | Slices | Complete rows | Partial rows | Partial reason | Codes | Learning |
| --- | --- | --- | --- | --- | --- | --- | --- |
| complete | COMPLETED | 5/5 | 5 | 0 | — | — | pause 0 / resume 0 / preempted 0 |
| cancel | CANCELLED | 2/5 | 0 | 2 | CANCELLED_BY_REQUEST | — | pause 0 / resume 0 / preempted 0 |
| learning | COMPLETED | 4/4 | 4 | 0 | — | — | pause 1 / resume 1 / preempted 0 |
| world | REFUSED | 0/2 | 0 | 0 | — | WORLD_RESERVED | pause 0 / resume 0 / preempted 0 |
| simplified | COMPLETED | 2/2 | 2 | 0 | — | — | pause 0 / resume 0 / preempted 0 |
| slice-budget | COMPLETED | 3/3 | 3 | 0 | — | — | pause 0 / resume 0 / preempted 0 |
| live-221 | COMPLETED | 3/3 | 3 | 0 | — | — | pause 0 / resume 0 / preempted 0 |
| refused-221 | REFUSED | 0/1 | 0 | 0 | CAPACITY_INSUFFICIENT | CAPACITY_INSUFFICIENT | pause 0 / resume 0 / preempted 0 |
| worker-error | FAILED | 1/3 | 0 | 1 | SLICE_FAILED | SLICE_FAILED | pause 0 / resume 0 / preempted 0 |
| learning-preemption | COMPLETED | 2/2 | 2 | 0 | — | — | pause 1 / resume 1 / preempted 1 |

## Checks

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| budget.manifest.status | READY | READY | PASS |
| budget.manifest.version | 221-synthetic-1 | 221-synthetic-1 | PASS |
| budget.manifest.residentWorlds | 1 | 1 | PASS |
| budget.manifest.sliceMaximumMs | 10 | 10 | PASS |
| budget.manifest.progressHzMaximum | 5 | 5 | PASS |
| budget.manifest.cancellationTargetMaximumMs | 100 | 100 | PASS |
| budget.manifest.gaps | 4 | 4 | PASS |
| budget.missing.status | REFUSED | REFUSED | PASS |
| budget.missing.code | BUDGET_MISSING | BUDGET_MISSING | PASS |
| budget.missing.path | true | true | PASS |
| complete.status | COMPLETED | COMPLETED | PASS |
| complete.slices | 5 | 5 | PASS |
| complete.completed | 5 | 5 | PASS |
| complete.fraction | 1 | 1 | PASS |
| complete.rows | 5 | 5 | PASS |
| complete.partialRows | 0 | 0 | PASS |
| complete.progressSequence | 0,1,2,3,4,5 | 0,1,2,3,4,5 | PASS |
| complete.labels | COMPLETE,COMPLETE,COMPLETE,COMPLETE,COMPLETE | COMPLETE,COMPLETE,COMPLETE,COMPLETE,COMPLETE | PASS |
| complete.decisions | 120 | 120 | PASS |
| complete.refusals | 0 | 0 | PASS |
| complete.worldReleased | false | false | PASS |
| complete.fixtureRuns | 5 | 5 | PASS |
| cancel.status | CANCELLED | CANCELLED | PASS |
| cancel.completed | 2 | 2 | PASS |
| cancel.completeRows | 0 | 0 | PASS |
| cancel.partialRows | 2 | 2 | PASS |
| cancel.partialReason | CANCELLED_BY_REQUEST | CANCELLED_BY_REQUEST | PASS |
| cancel.labels | PARTIAL,PARTIAL | PARTIAL,PARTIAL | PASS |
| cancel.discarded | 1 | 1 | PASS |
| cancel.progressStates | true | true | PASS |
| learning.status | COMPLETED | COMPLETED | PASS |
| learning.pauseCount | 1 | 1 | PASS |
| learning.resumeCount | 1 | 1 | PASS |
| learning.atSlice | 1 | 1 | PASS |
| learning.resumeAt | 2 | 2 | PASS |
| learning.interruptStatus | RESUMED | RESUMED | PASS |
| learning.rows | 4 | 4 | PASS |
| world.status | REFUSED | REFUSED | PASS |
| world.code | WORLD_RESERVED | WORLD_RESERVED | PASS |
| world.holder | true | true | PASS |
| world.refusals | 1 | 1 | PASS |
| model.simplifiedStatus | COMPLETED | COMPLETED | PASS |
| model.kind | SIMPLIFIED | SIMPLIFIED | PASS |
| model.physicsFidelity | false | false | PASS |
| model.reportFidelity | false | false | PASS |
| model.disclaimer | true | true | PASS |
| model.claimedStatus | REFUSED | REFUSED | PASS |
| model.claimedCode | SIMPLIFIED_CLAIMS_FIDELITY | SIMPLIFIED_CLAIMS_FIDELITY | PASS |
| sliceBudget.overruns | 3 | 3 | PASS |
| sliceBudget.stepMs | 12 | 12 | PASS |
| sliceBudget.allocated | 10 | 10 | PASS |
| live.status | COMPLETED | COMPLETED | PASS |
| live.rows | 3 | 3 | PASS |
| live.decisions | 72 | 72 | PASS |
| live.divergent | true | true | PASS |
| live.causes | true | true | PASS |
| live.refusals | 0 | 0 | PASS |
| live.admitted | 3 | 3 | PASS |
| refusal.status | REFUSED | REFUSED | PASS |
| refusal.code | CAPACITY_INSUFFICIENT | CAPACITY_INSUFFICIENT | PASS |
| refusal.count | 1 | 1 | PASS |
| refusal.rows | 0 | 0 | PASS |
| error.status | FAILED | FAILED | PASS |
| error.code | SLICE_FAILED | SLICE_FAILED | PASS |
| error.completed | 1 | 1 | PASS |
| error.partialRows | 1 | 1 | PASS |
| error.partialReason | SLICE_FAILED | SLICE_FAILED | PASS |
| preemption.status | COMPLETED | COMPLETED | PASS |
| preemption.preempted | 1 | 1 | PASS |
| preemption.pause | 1 | 1 | PASS |
| preemption.resume | 1 | 1 | PASS |
| preemption.inFlight | true | true | PASS |
| preemption.rows | 2 | 2 | PASS |

Summary: 73/73 checks, overall PASS.
