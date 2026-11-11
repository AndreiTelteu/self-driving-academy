# Raport determinist PBI 226 — deblocare, resetul orașului și stil păstrat

Contract: `226-world-recovery-v1` · fixture: `226-world-recovery-v1` · ceas fix: `2026-11-11T21:00:00.000Z`.

## Structura

- Operații separate: VEHICLE_RECOVERY, CITY_RESET, STYLE_RESTORE.
- Coduri de refuz închise: 31.
- Motive publicate: reset `SCENARIO_RESET`, pasager `RECOVERED_WITH_PASSENGER`.
- Vocabularul 207 confirmat: finalize=true, discontinuitate=true, tip eveniment=true.

## R (numai deblocarea)

- Punct validat: `recovery-point:map-1:taxi-01:1:lane-1:10` pe banda `lane-1` (TAXI).
- Collidere la plasare: 0; mobilitate publicată: true (viteză după 3 m/s).
- Tick-uri până la mobilitate: 0; etape sincrone: 5.
- XP: 500000 → 500000 micro-XP (delta 0).
- Epoce schimbate: false; profil schimbat: false; lume repornită: false; checkpoint scris: false; serie economică deschisă: false.

## R cu pasager

- Închideri la primul R: 1 (`RECOVERED_WITH_PASSENGER`, revenue 0, terminal true).
- Al doilea R închide: 0; istoric rămâne 1.
- O singură încheiere FAILED: true; XP 500000 → 500000.

## Haos

- Provocare închisă: 1; reluări: 1 (AVAILABLE) la tick 10, așteptare 0.
- Academia nu declară reluare: 0.

## Resetul orașului

- Plan fără efecte secundare: true; activități: challenge-1, ride-1.
- Epoce: 1/0/1 → 2/1/2.
- Activități închise: 2 (SCENARIO_RESET, SCENARIO_RESET), revenue 0, 0.
- Segmente închise 1, joburi invalidate 2, inputuri eliberate 2.
- Lume nouă: 64 corpuri, 40 vehicule de trafic, 1 listener, 2 joburi, 1 lume vie, lansare PAUSED_AUTO.
- Serie economică: 1 → 2 (`economy-series:2`, istoric 2).
- Replay: `replay-event:reset:session-226-academy:2`, discontinuitate true, motiv WORLD_RESET.
- Checkpoint: `reset:session-226-academy:2`, 612 bytes, checksum 71 caractere, anterior null.
- Păstrate: profil true, XP true, daily true, rewards true, misiuni true, dovezi true.
- Finalizări de misiune: 0; recompense acordate: 0.

## Douăzeci de reseturi

- Reseturi: 20; epoce 21/20/21.
- Închideri de scenă: 1; duplicate: 0.
- Checkpointuri 20, fapte de replay 20, serii economice 21.
- Corpuri 64, listeners 1, joburi 2, lumi vii 1, porniri 21.
- XP 500000 (scăzut: false), profil stabil true, rewards neschimbate true.

## Eșec și reluare

- Commit refuzat: `CHECKPOINT_COMMIT_FAILED`; checkpointuri 0; epoce 1/0/1; închideri 0; serii 1; porniri 1.
- Reîncercare: RESET, checkpointuri 1, epoce 2/1/2.
- Reset parțial: etapa `WORLD_REBUILD`, fault true, reluare RESET, checkpointuri 1, închideri 1, serii 2, duplicate 0.

## Stilul

- Versiune: `profile-1@1` → `profile-1@2`; checksum valid true.
- Barieră LEARNING_EPOCH: learningEpoch 0 → 1; worldEpoch 1, economyEpoch 1.
- Lume neatinsă: true; închideri 0, checkpointuri 0, fapte replay 0, serii 1.
- XP păstrat true (500000); a doua activare refuzată true.

## Performanță și nivel de validare

- Nivel: `targeted`; playtest: NOT_PERFORMED; afirmație de playtest uman: false.
- Ținta propusă de 2000 ms: NOT_MEASURED.
- Determinist: 0 tick-uri până la mobilitate, 5 etape sincrone, 0 muncă în tickul resetului, 1 reset pregătit, 1 commit simultan.
- Storage: checkpoint 612 bytes; twoSessionCheckpointBytes rămâne `null` în manifest (nemăsurat, nu inventat).
- Nemăsurat: human playtest of the two-second return to driving; FPS, frame p95/p99 and input-to-command latency on the real workload; decor integration (PBI 227) and its body/effect budgets.
- Heap exact: `null` (No portable exact heap API; ownership counters are reported instead of guessing).

## Verificări

| Rezultat | Verificare | Valoare |
| --- | --- | --- |
| PASS | recovery.pointIsColliderFree | `0` |
| PASS | recovery.mobilityRestored | `true` |
| PASS | recovery.ticksToMobility | `0` |
| PASS | recovery.stages | `5` |
| PASS | recovery.xpNeverDecreases | `true` |
| PASS | recovery.epochsUnchanged | `true` |
| PASS | recovery.profileUnchanged | `true` |
| PASS | recovery.noCheckpoint | `true` |
| PASS | passenger.singleFailedClosure | `1` |
| PASS | passenger.incidentRetained | `1` |
| PASS | passenger.secondRecoveryClosesNothing | `0` |
| PASS | passenger.xpUnchanged | `500000` |
| PASS | haos.retryImmediate | `0` |
| PASS | haos.noAcademyRetry | `0` |
| PASS | reset.epochsAdvanced | `2` |
| PASS | reset.learningEpochAdvanced | `1` |
| PASS | reset.economyEpochAdvanced | `2` |
| PASS | reset.activitiesClosedOnce | `2` |
| PASS | reset.noDuplicateClosures | `0` |
| PASS | reset.missionsNotCompleted | `0` |
| PASS | reset.noRewardsGranted | `0` |
| PASS | reset.profilePreserved | `true` |
| PASS | reset.missionSnapshotPreserved | `true` |
| PASS | reset.xpPreserved | `true` |
| PASS | reset.dailyPreserved | `true` |
| PASS | reset.rewardsPreserved | `true` |
| PASS | reset.missionsPreserved | `true` |
| PASS | reset.evidencePreserved | `true` |
| PASS | reset.replayDiscontinuity | `true` |
| PASS | reset.checkpointWritten | `1` |
| PASS | reset.bodiesAtBaseline | `64` |
| PASS | reset.trafficRebuilt | `40` |
| PASS | repeated.sceneClosedOnce | `1` |
| PASS | repeated.noDuplicateClosures | `0` |
| PASS | repeated.bodiesConstant | `[64]` |
| PASS | repeated.listenersConstant | `[1]` |
| PASS | repeated.jobsConstant | `[2]` |
| PASS | repeated.oneLiveWorld | `1` |
| PASS | repeated.checkpoints | `20` |
| PASS | repeated.economySeries | `21` |
| PASS | repeated.xpUnchanged | `500000` |
| PASS | repeated.profileUnchanged | `"fnv1a64:0ed612cdcb47c703"` |
| PASS | repeated.rewardsUnchanged | `"sha256:3d6a9a9564694a7e2532ece3e726fff144dc1a3d9b089056e29199cc3c555abd"` |
| PASS | failure.previousCheckpointKept | `0` |
| PASS | failure.epochsUnchanged | `1` |
| PASS | failure.sceneUntouched | `0` |
| PASS | failure.retryCommitsOnce | `"RESET"` |
| PASS | failure.oneCheckpointAfterRetry | `1` |
| PASS | partial.stage | `"WORLD_REBUILD"` |
| PASS | partial.faultBlocksOtherOperations | `true` |
| PASS | partial.resumed | `"RESET"` |
| PASS | partial.noDuplicateCheckpoint | `1` |
| PASS | partial.noDuplicateSeries | `2` |
| PASS | partial.noDuplicateClosure | `0` |
| PASS | style.barrier | `"LEARNING_EPOCH"` |
| PASS | style.worldUntouched | `true` |
| PASS | style.noWorldRebuild | `1` |
| PASS | style.noRideClosure | `0` |
| PASS | style.noCheckpoint | `0` |
| PASS | style.noReplayFact | `0` |
| PASS | style.xpPreserved | `500000` |
| PASS | style.secondActivationRefused | `true` |
| PASS | distinct.recoveryEffects | `true` |
| PASS | distinct.resetEffects | `true` |
| PASS | distinct.styleEffects | `true` |

Rezumat: 65/65 verificări, PASS.
