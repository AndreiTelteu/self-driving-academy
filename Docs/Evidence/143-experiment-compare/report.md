# 143 — comparație A/B cu distribuții și dovezi

Contract `143-experiment-compare-v1`. Citește rezultatele `142-experiment-rerun-v1` fără să re-derive diferențele; sursa politicilor în acest strat: 0 evaluări.

## Distribuția cauzelor

| Măsură | Valoare |
| --- | --- |
| cohorte | 6 |
| evaluări | 288 |
| decizii comparate | 144 |
| diferențe | 43 |
| identice | 101 |
| prag de probabilitate | 37 |
| parametru de geometrie | 6 |
| divergențe din seed | 0 |
| neatribuite | 0 |
| cauze distincte | 2 |
| parametri distincți | 4 |
| cel mai frecvent parametru | red_stop_probability (20, 46.5%) |
| criteriu „nu un singur parametru” | îndeplinit |

### Pe parametri

| Parametru | Diferențe | Pondere |
| --- | --- | --- |
| red_stop_probability | 20 | 46.5% |
| stop_full_probability | 17 | 39.5% |
| stop_dwell_time | 4 | 9.3% |
| red_stop_line_offset | 2 | 4.7% |

### Pe categorii

| Categorie | Oportunități | Evaluări | Diferențe |
| --- | --- | --- | --- |
| SIGNAL | 72 | 144 | 22 |
| STOP | 72 | 144 | 21 |

### Cauze care coexistă

| Oportunitate | Tip | Cauze și parametri | Cauze distincte |
| --- | --- | --- | --- |
| opportunity-05 | SIGNAL | PROBABILITY_THRESHOLD/red_stop_probability + GEOMETRY_PARAMETER/red_stop_line_offset | 2 |
| opportunity-15 | SIGNAL | PROBABILITY_THRESHOLD/red_stop_probability + GEOMETRY_PARAMETER/red_stop_line_offset + PROBABILITY_THRESHOLD/red_stop_probability | 2 |
| opportunity-20 | STOP | PROBABILITY_THRESHOLD/stop_full_probability + PROBABILITY_THRESHOLD/stop_full_probability + GEOMETRY_PARAMETER/stop_dwell_time | 2 |

Total: 20 oportunități cu diferențe, 3 cu două cauze, 17 cu o singură cauză.

## Expunere

| Măsură | Valoare |
| --- | --- |
| evaluări | 288 |
| oportunități evaluate | 144 |
| vizibile | 96 |
| invizibile | 192 |
| fracție vizibilă | 33.3% |
| fereastră | tick 61–84 (24 tickuri, 6 cohorte) |
| sursa faptului de vizibilitate | CAMERA, CONTROLLED_FIXTURE |

| Cohortă | Evaluări | Vizibile | Invizibile |
| --- | --- | --- | --- |
| identical-pair | 48 | 16 | 32 |
| isolated-red-stop-probability | 48 | 16 | 32 |
| isolated-red-stop-line-offset | 48 | 16 | 32 |
| complex-seed-142000 | 48 | 16 | 32 |
| complex-seed-142001 | 48 | 16 | 32 |
| complex-seed-142002 | 48 | 16 | 32 |

## Seed-uri și incertitudine

| Seed de bază | Seed scenariu | Cohorte | Decizii | Diferențe | Parametri raportați |
| --- | --- | --- | --- | --- | --- |
| 142000 | 51107408 | 4 | 96 | 20 | red_stop_line_offset, red_stop_probability, stop_dwell_time, stop_full_probability |
| 142001 | 620e6961 | 1 | 24 | 13 | red_stop_probability, stop_dwell_time, stop_full_probability |
| 142002 | 75183992 | 1 | 24 | 10 | red_stop_probability, stop_dwell_time, stop_full_probability |

Seed-uri distincte: 3 de bază, 3 de scenariu, 72 de oportunitate.

**MULTI_SEED_SAMPLE** · diferențe pe seed între 10 și 20 (spread 10); generalizabil: false.

Eșantionul are 3 seed-uri distincte, 6 cohorte și 144 decizii comparate; numărătoarea divergențelor pe seed variază între 10 și 20. Rezultatul descrie exact aceste rulări; nu este o estimare pentru alte seed-uri, alte profiluri sau orașul live și nu se raportează un interval de încredere.

- Divergențele sunt cele raportate de 142 pentru oportunitățile scenariului; traiectoriile divergente pot produce oportunități diferite în lumea reală.
- Vizibilitatea este un fapt declarat de apelant (camera reală sau fixture controlat), nu o rază trasată de acest modul.
- Eșantionul este mic și controlat: numerele sunt exacte pentru aceste rulări, nu rate pentru populație.
- Reproductibilitatea este promisă numai pe aceeași platformă, cu același snapshot și același seed de bază.

## Scenarii izolate

| Cohortă | Parametru țintă | Valori | Diferențe | Doar ținta | Alți parametri raportați | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| isolated-red-stop-probability | red_stop_probability | 1 → 0 probability | 10 | da | — | atribuit țintei |
| isolated-red-stop-line-offset | red_stop_line_offset | 1,2 → 5 m | 2 | da | — | atribuit țintei |

## Indicatori 138/139

| Indicator | Sursă | Stânga | Dreapta | Diferență | Stare |
| --- | --- | --- | --- | --- | --- |
| overall.violationRate | BEHAVIOR_138 | 0 | 50 | +50 | DELTA |
| overall.meanAccelerationAbsMps2 | COMFORT_139 | 1,2 | 2,1 | +0,9 | DELTA |

## Toate diferențele raportate de 142

| Cohortă | Oportunitate | Tip | Tick | Stânga | Dreapta | Cauză | Parametru |
| --- | --- | --- | --- | --- | --- | --- | --- |
| isolated-red-stop-probability | opportunity-03 | SIGNAL | 64 | STOP | PROCEED | PROBABILITY_THRESHOLD | red_stop_probability |
| isolated-red-stop-probability | opportunity-05 | SIGNAL | 66 | STOP | PROCEED | PROBABILITY_THRESHOLD | red_stop_probability |
| isolated-red-stop-probability | opportunity-07 | SIGNAL | 68 | STOP | PROCEED | PROBABILITY_THRESHOLD | red_stop_probability |
| isolated-red-stop-probability | opportunity-09 | SIGNAL | 70 | STOP | PROCEED | PROBABILITY_THRESHOLD | red_stop_probability |
| isolated-red-stop-probability | opportunity-11 | SIGNAL | 72 | STOP | PROCEED | PROBABILITY_THRESHOLD | red_stop_probability |
| isolated-red-stop-probability | opportunity-13 | SIGNAL | 74 | STOP | PROCEED | PROBABILITY_THRESHOLD | red_stop_probability |
| isolated-red-stop-probability | opportunity-15 | SIGNAL | 76 | STOP | PROCEED | PROBABILITY_THRESHOLD | red_stop_probability |
| isolated-red-stop-probability | opportunity-17 | SIGNAL | 78 | STOP | PROCEED | PROBABILITY_THRESHOLD | red_stop_probability |
| isolated-red-stop-probability | opportunity-21 | SIGNAL | 82 | STOP | PROCEED | PROBABILITY_THRESHOLD | red_stop_probability |
| isolated-red-stop-probability | opportunity-23 | SIGNAL | 84 | STOP | PROCEED | PROBABILITY_THRESHOLD | red_stop_probability |
| isolated-red-stop-line-offset | opportunity-05 | SIGNAL | 66 | STOP | STOP | GEOMETRY_PARAMETER | red_stop_line_offset |
| isolated-red-stop-line-offset | opportunity-15 | SIGNAL | 76 | STOP | STOP | GEOMETRY_PARAMETER | red_stop_line_offset |
| complex-seed-142000 | opportunity-04 | STOP | 65 | HOLD | ROLL_THROUGH | PROBABILITY_THRESHOLD | stop_full_probability |
| complex-seed-142000 | opportunity-06 | STOP | 67 | APPROACH | ROLL_THROUGH | PROBABILITY_THRESHOLD | stop_full_probability |
| complex-seed-142000 | opportunity-07 | SIGNAL | 68 | STOP | PROCEED | PROBABILITY_THRESHOLD | red_stop_probability |
| complex-seed-142000 | opportunity-08 | STOP | 69 | APPROACH | ROLL_THROUGH | PROBABILITY_THRESHOLD | stop_full_probability |
| complex-seed-142000 | opportunity-12 | STOP | 73 | HOLD | RELEASE | GEOMETRY_PARAMETER | stop_dwell_time |
| complex-seed-142000 | opportunity-15 | SIGNAL | 76 | STOP | PROCEED | PROBABILITY_THRESHOLD | red_stop_probability |
| complex-seed-142000 | opportunity-20 | STOP | 81 | HOLD | ROLL_THROUGH | PROBABILITY_THRESHOLD | stop_full_probability |
| complex-seed-142000 | opportunity-21 | SIGNAL | 82 | STOP | PROCEED | PROBABILITY_THRESHOLD | red_stop_probability |
| complex-seed-142001 | opportunity-00 | STOP | 61 | APPROACH | ROLL_THROUGH | PROBABILITY_THRESHOLD | stop_full_probability |
| complex-seed-142001 | opportunity-02 | STOP | 63 | APPROACH | ROLL_THROUGH | PROBABILITY_THRESHOLD | stop_full_probability |
| complex-seed-142001 | opportunity-03 | SIGNAL | 64 | STOP | PROCEED | PROBABILITY_THRESHOLD | red_stop_probability |
| complex-seed-142001 | opportunity-04 | STOP | 65 | HOLD | ROLL_THROUGH | PROBABILITY_THRESHOLD | stop_full_probability |
| complex-seed-142001 | opportunity-07 | SIGNAL | 68 | STOP | PROCEED | PROBABILITY_THRESHOLD | red_stop_probability |
| complex-seed-142001 | opportunity-08 | STOP | 69 | APPROACH | ROLL_THROUGH | PROBABILITY_THRESHOLD | stop_full_probability |
| complex-seed-142001 | opportunity-09 | SIGNAL | 70 | STOP | STOP | PROBABILITY_THRESHOLD | red_stop_probability |
| complex-seed-142001 | opportunity-12 | STOP | 73 | HOLD | RELEASE | GEOMETRY_PARAMETER | stop_dwell_time |
| complex-seed-142001 | opportunity-14 | STOP | 75 | APPROACH | ROLL_THROUGH | PROBABILITY_THRESHOLD | stop_full_probability |
| complex-seed-142001 | opportunity-18 | STOP | 79 | APPROACH | ROLL_THROUGH | PROBABILITY_THRESHOLD | stop_full_probability |
| complex-seed-142001 | opportunity-20 | STOP | 81 | HOLD | ROLL_THROUGH | PROBABILITY_THRESHOLD | stop_full_probability |
| complex-seed-142001 | opportunity-21 | SIGNAL | 82 | STOP | PROCEED | PROBABILITY_THRESHOLD | red_stop_probability |
| complex-seed-142001 | opportunity-23 | SIGNAL | 84 | STOP | PROCEED | PROBABILITY_THRESHOLD | red_stop_probability |
| complex-seed-142002 | opportunity-00 | STOP | 61 | APPROACH | ROLL_THROUGH | PROBABILITY_THRESHOLD | stop_full_probability |
| complex-seed-142002 | opportunity-04 | STOP | 65 | HOLD | ROLL_THROUGH | PROBABILITY_THRESHOLD | stop_full_probability |
| complex-seed-142002 | opportunity-06 | STOP | 67 | APPROACH | ROLL_THROUGH | PROBABILITY_THRESHOLD | stop_full_probability |
| complex-seed-142002 | opportunity-11 | SIGNAL | 72 | STOP | PROCEED | PROBABILITY_THRESHOLD | red_stop_probability |
| complex-seed-142002 | opportunity-12 | STOP | 73 | HOLD | RELEASE | GEOMETRY_PARAMETER | stop_dwell_time |
| complex-seed-142002 | opportunity-14 | STOP | 75 | APPROACH | ROLL_THROUGH | PROBABILITY_THRESHOLD | stop_full_probability |
| complex-seed-142002 | opportunity-16 | STOP | 77 | APPROACH | ROLL_THROUGH | PROBABILITY_THRESHOLD | stop_full_probability |
| complex-seed-142002 | opportunity-17 | SIGNAL | 78 | STOP | PROCEED | PROBABILITY_THRESHOLD | red_stop_probability |
| complex-seed-142002 | opportunity-18 | STOP | 79 | APPROACH | ROLL_THROUGH | PROBABILITY_THRESHOLD | stop_full_probability |
| complex-seed-142002 | opportunity-20 | STOP | 81 | HOLD | RELEASE | GEOMETRY_PARAMETER | stop_dwell_time |

## Probe de refuz

| Probă | Coduri | Căi |
| --- | --- | --- |
| exposure-incomplete | EXPOSURE_INCOMPLETE | cohorts[0].visibility.facts.opportunity-00 |
| exposure-tick-mismatch | EXPOSURE_TICK_MISMATCH | cohorts[0].visibility.facts.opportunity-00.decisionTick |
| cohort-duplicate | COHORT_DUPLICATE | cohorts[1].cohortId |
| isolated-two-parameters | ISOLATED_PARAMETER_NOT_ISOLATED | cohorts[0].targetParameter |
| refused-rerun | RERUN_NOT_READY | cohorts[0].rerun.status |

## Verificări

| Verificare | Așteptat | Real | Rezultat |
| --- | --- | --- | --- |
| version | 143-experiment-compare-v1 | 143-experiment-compare-v1 | PASS |
| rerun-source | 142-experiment-rerun-v1 | 142-experiment-rerun-v1 | PASS |
| policies-evaluated | 0 | 0 | PASS |
| cohorts | 6 | 6 | PASS |
| evaluations | 288 | 288 | PASS |
| decisions | 144 | 144 | PASS |
| divergent | 43 | 43 | PASS |
| identical | 101 | 101 | PASS |
| divergent-equals-142-sum | 43 | 43 | PASS |
| identical-control | 0 | 0 | PASS |
| cause-threshold | 37 | 37 | PASS |
| cause-geometry | 6 | 6 | PASS |
| distinct-causes | 2 | 2 | PASS |
| distinct-parameters | 4 | 4 | PASS |
| dominant-share-below-one | true | true | PASS |
| criterion-satisfied | true | true | PASS |
| unattributed | 0 | 0 | PASS |
| signal-divergences | 22 | 22 | PASS |
| stop-divergences | 21 | 21 | PASS |
| coexisting | 3 | 3 | PASS |
| coexistence-example | 2 | 2 | PASS |
| evaluated-opportunities | 144 | 144 | PASS |
| visible | 96 | 96 | PASS |
| invisible | 192 | 192 | PASS |
| exposure-window | 61-84/24 | 61-84/24 | PASS |
| base-seeds | 3 | 3 | PASS |
| scenario-seeds | 3 | 3 | PASS |
| opportunity-seeds | 72 | 72 | PASS |
| seed-spread | 10-20 | 10-20 | PASS |
| multi-seed | MULTI_SEED_SAMPLE | MULTI_SEED_SAMPLE | PASS |
| not-generalizable | false | false | PASS |
| isolated-probability-only-target | true | true | PASS |
| isolated-probability-divergences | 10 | 10 | PASS |
| isolated-probability-attributed | true | true | PASS |
| isolated-offset-only-target | true | true | PASS |
| isolated-offset-divergences | 2 | 2 | PASS |
| isolated-offset-attributed | true | true | PASS |
| metric-pairs | 2 | 2 | PASS |
| behavior-delta | 50 | 50 | PASS |
| comfort-delta | 0.9 | 0.9 | PASS |
| repeat-signature | f6006a31 | f6006a31 | PASS |
| rerun-not-mutated | true | true | PASS |
| refusal-probes | 5 | 5 | PASS |
| refusal-exposure | EXPOSURE_INCOMPLETE | EXPOSURE_INCOMPLETE | PASS |
| refusal-tick | EXPOSURE_TICK_MISMATCH | EXPOSURE_TICK_MISMATCH | PASS |
| refusal-duplicate | COHORT_DUPLICATE | COHORT_DUPLICATE | PASS |
| refusal-isolation | true | true | PASS |
| refusal-rerun | RERUN_NOT_READY | RERUN_NOT_READY | PASS |
| refusal-metric | true | true | PASS |

Rezumat: 49/49 verificări, 5 probe de refuz, PASS.
