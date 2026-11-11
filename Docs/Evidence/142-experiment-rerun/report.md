# 142 — rerulare din snapshot cu profil ales

Contract `142-experiment-rerun-v1`. Rerulare deterministă din snapshotul 140, cu seed de bază explicit și două profile reale.

## Starea de start

| Fapt | Valoare |
| --- | --- |
| tick | 60 |
| bytes | 64378 |
| checksum SHA-256 | c5a0738c0be1b8a149726738b9b9cccad5655229c542396b04d8aa9d24d8bcb5 |
| intrări de secțiune comparate de 140 | 287 |
| câmpuri frunză comparate de 140 | 3080 |
| diferențe stocate vs restaurate | 0 |
| worldEpoch / profileId / learningEpoch | 1 / profile-1 / 2 |
| seed RNG din snapshot | 6221086 |

## Seed explicit

| Nivel | Zecimal | Hex |
| --- | --- | --- |
| seed de bază | 142000 | 00022ab0 |
| seed de scenariu | 1360032776 | 51107408 |

Derivare: deriveScenarioSeed(baseSeed, scenarioId) -> scenarioSeed → deriveVehicleSeed(scenarioSeed, vehicleId) -> vehicleSeed → deriveOpportunitySeed(vehicleSeed, opportunityKey) -> opportunitySeed (the 050/051 sample). Identitatea profilului nu intră în seed (`profileIdentityInSeed: false`), deci cele două rulări folosesc exact aceleași numere aleatoare pentru fiecare pereche (taxi, eveniment).

## Cele două profile

| Profil | Decizii | Cer stop | Continuă | Pe acțiune | Digest trasare |
| --- | --- | --- | --- | --- | --- |
| prudent-142@1 | 24 | 20 | 4 | APPROACH 7, HOLD 3, PROCEED 2, RELEASE 2, STOP 10 | daf459fc |
| impulsive-142@1 | 24 | 12 | 12 | APPROACH 5, PROCEED 5, RELEASE 3, ROLL_THROUGH 4, STOP 7 | 525ff680 |

## Divergența oportunităților

| Măsură | Valoare |
| --- | --- |
| oportunități comparate | 24 |
| identice | 16 |
| divergente | 8 |
| aceeași cerere / seed / stare | true / true / true |
| divergențe din seed | 0 |
| divergențe neatribuite | 0 |
| bit-exactitate între platforme promisă | false |

| Oportunitate | Tip | Tick | Vehicul | Stânga | Dreapta | Cauză | Parametru | Prag stânga | Prag dreapta | Eșantion |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| opportunity-04 | STOP | 65 | taxi-05 | HOLD/DWELL_IN_PROGRESS | ROLL_THROUGH/ROLLING_STOP_BY_PROFILE | PROBABILITY_THRESHOLD | stop_full_probability | 1 | 0.6 | 0.923773 |
| opportunity-06 | STOP | 67 | taxi-07 | APPROACH/STOP_APPROACH | ROLL_THROUGH/ROLLING_STOP_BY_PROFILE | PROBABILITY_THRESHOLD | stop_full_probability | 1 | 0.6 | 0.733001 |
| opportunity-07 | SIGNAL | 68 | taxi-08 | STOP/STOP_LINE_APPROACH | PROCEED/CROSS_RED_BY_PROFILE | PROBABILITY_THRESHOLD | red_stop_probability | 1 | 0.75 | 0.881389 |
| opportunity-08 | STOP | 69 | taxi-09 | APPROACH/STOP_APPROACH | ROLL_THROUGH/ROLLING_STOP_BY_PROFILE | PROBABILITY_THRESHOLD | stop_full_probability | 1 | 0.6 | 0.788191 |
| opportunity-12 | STOP | 73 | taxi-13 | HOLD/DWELL_IN_PROGRESS | RELEASE/DWELL_SATISFIED | GEOMETRY_PARAMETER | stop_dwell_time | 1 | 0.6 | 0.246634 |
| opportunity-15 | SIGNAL | 76 | taxi-16 | STOP/STOP_LINE_APPROACH | PROCEED/CROSS_RED_BY_PROFILE | PROBABILITY_THRESHOLD | red_stop_probability | 1 | 0.75 | 0.848123 |
| opportunity-20 | STOP | 81 | taxi-21 | HOLD/DWELL_IN_PROGRESS | ROLL_THROUGH/ROLLING_STOP_BY_PROFILE | PROBABILITY_THRESHOLD | stop_full_probability | 1 | 0.6 | 0.833924 |
| opportunity-21 | SIGNAL | 82 | taxi-22 | STOP/STOP_LINE_APPROACH | PROCEED/CROSS_RED_BY_PROFILE | PROBABILITY_THRESHOLD | red_stop_probability | 1 | 0.75 | 0.983588 |

### Parametrii care diferă

| Parametru | prudent-142@1 | impulsive-142@1 |
| --- | --- | --- |
| red_stop_probability | 1 | 0.75 |
| green_start_delay | 0.9 | 0.35 |
| red_stop_line_offset | 1.2 | 0.6 |
| late_red_brake_threshold | 2.6 | 1.4 |
| stop_full_probability | 1 | 0.6 |
| stop_dwell_time | 1.4 | 0.5 |
| stop_line_offset | 1.1 | 0.8 |

## Izolarea ledger-elor

| Ledger | Amprentă / valoare |
| --- | --- |
| learning | 5f9bdd0d3962f6e8f25b1d4264d0cccb4bcde4f22369479e7fe1aaeac1409a51 |
| rewards | 719e691629d32c21b2582bfa63ce9ef292e9a500f4848beb29374aa133bbf1b6 |
| kpi (înainte) | 0be4b6ba31b22957f3141cbab7b433423604e0aa7373b597be4fbbed8b94d10c |
| kpi (după) | 0be4b6ba31b22957f3141cbab7b433423604e0aa7373b597be4fbbed8b94d10c |
| neschimbat | true |
| liveWrites | 0 |
| scriere refuzată / copie | 0 / 0 |
| proba de control | detectată (LEDGER_CHANGED) |

## Probe de refuz

| Probă | Etapă | Coduri | Căi |
| --- | --- | --- | --- |
| incompatible-snapshot | SNAPSHOT | SNAPSHOT_REFUSED | — |
| profile-incomplete | PROFILE | PROFILE_INCOMPLETE | profiles[0].profile.parameters.stop_full_probability |
| scenario-horizon | SCENARIO | TICK_OUT_OF_HORIZON | scenario.opportunities[0].decisionTick |
| profile-duplicate | PROFILE | PROFILE_DUPLICATE | profiles[1].profile.versionId |
| ledger-changed | LEDGER | LEDGER_CHANGED | ledger.KPI |

## Verificări

| Verificare | Așteptat | Real | Rezultat |
| --- | --- | --- | --- |
| snapshot-tick | 60 | 60 | PASS |
| snapshot-bytes | 64378 | 64378 | PASS |
| snapshot-checksum | c5a0738c0be1b8a149726738b9b9cccad5655229c542396b04d8aa9d24d8bcb5 | c5a0738c0be1b8a149726738b9b9cccad5655229c542396b04d8aa9d24d8bcb5 | PASS |
| snapshot-fields | 3080 | 3080 | PASS |
| snapshot-entities | 287 | 287 | PASS |
| snapshot-mismatches | 0 | 0 | PASS |
| snapshot-ticks-advanced | 0 | 0 | PASS |
| scenario-seed | 1360032776 | 1360032776 | PASS |
| seed-profile-independent | false | false | PASS |
| request-identical | true | true | PASS |
| state-identical | true | true | PASS |
| seed-identical | true | true | PASS |
| opportunities | 24 | 24 | PASS |
| decisions-per-profile | 24 | 24 | PASS |
| divergent | 8 | 8 | PASS |
| identical | 16 | 16 | PASS |
| seed-divergences | 0 | 0 | PASS |
| unattributed-divergences | 0 | 0 | PASS |
| prudent-trace | daf459fc | daf459fc | PASS |
| impulsive-trace | 525ff680 | 525ff680 | PASS |
| repeatable | true | true | PASS |
| ledger-unchanged | true | true | PASS |
| ledger-live-writes | 0 | 0 | PASS |
| cross-platform-bit-exactness | false | false | PASS |
| ledger-control-detected | LEDGER_CHANGED | LEDGER_CHANGED | PASS |

Rezumat: 25/25 verificări, 5 probe de refuz, PASS.
