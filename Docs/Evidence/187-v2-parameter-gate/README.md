# 187 — poarta de validare a celor 80 de parametri

Poarta certifică faptul că fiecare dintre cele 80 de chei ale catalogului are un consumator real în
politică, un estimator, o dovadă comisă și un test independent. Verdictul este derivat din catalog și
din fișierele livrate, nu scris de mână: `npm run validate:parameters` scrie
[report.json](report.json) și [report.md](report.md), iar `--check` compară exact bytes cu fișierele
comise.

## Rezultatul real

| Indicator | Valoare |
| --- | --- |
| Verdict | **PASS**, 80/80 chei |
| Verificări ale porții | 12 `PASS`, 0 findings |
| Chei `CORE` (046–053) / `V2` (167–186) | 24 / 56 |
| Estimatori declarați / `NONE` | 80 / 0 |
| Efecte măsurate (V2) / consecințe M păstrate | 56 / 24 |
| Convenții canonice derivate din catalog | 8 |
| Probe fail-closed respinse | 2 |
| Teste ale suitei complete | 3 234 trecute, 0 eșuate (102,2 s) |
| Teste țintă ale porții | 8 trecute, 0 eșuate |

## Cum derivă capabilitățile (sursă unică)

`src/profiles/parameter-capabilities.ts` este singura sursă: o intrare per cheie, cu `policy`
(`CORE` sau `V2`, modul + simbolul exportat care consumă cheia), `estimator` (modul + simbol, sau
`null` = `NONE`), `evidence` (directorul din `Docs/Evidence/…`) și `test` (cale + titlul exact al
testului care verifică scenariul și efectul). `src/profiles/parameter-registry.ts` derivă
`implemented = policy !== null` și `estimable = estimator !== null`; lista paralelă `policyKeys` a
fost eliminată. Catalogul de date rămâne fail-closed (`parseParameterCatalog` cere în continuare
`implemented === false` în JSON), deci o cheie nu poate fi declarată învățată doar pentru că apare în
`Docs/driving-parameters.json`.

## Cum respinge poarta o cheie declarată fără consumator

`evaluateParameterGate` primește catalogul, tabelul și o sondă de fișiere injectată și verifică pentru
fiecare cheie: intrarea în tabel (exact o dată, numai chei din catalog), existența modulului de
politică și a simbolului exportat, existența estimatorului (sau `NONE`), existența documentului de
dovezi, existența testului și prezența titlului declarat în fișier, textul scenariului, efectul
măsurat în raportul grupului, respectiv derivarea registrului. Orice lipsă este finding și verdict
`FAIL`.

Probele negative sunt rulate de fiecare execuție a porții și, independent, de testul
`tests/validation/parameter-gate.test.ts`:

| Probă | Inserție (în memorie, nu în fișier) | Finding așteptat | Rezultat |
| --- | --- | --- | --- |
| `declared-key-without-consumer` | `speed_delta_urban` declarat cu `src/autonomy/__missing_case_sensitivity_probe__.ts` | `policy-consumer-missing` | RESPINS |
| `catalog-key-without-declaration` | intrarea `speed_delta_urban` eliminată din tabel | `capability-missing` | RESPINS |

Testul mai acoperă, cu aceeași funcție: simbol de politică neexportat, modul de estimator lipsă,
estimator `null` (⇒ `registry-estimable-mismatch`), dovezi lipsă, test lipsă, titlu lipsă, scenariu
gol, duplicat, cheie străină de catalog și efect măsurat lipsă. Niciuna dintre aceste inserții nu este
scrisă în tabelul comis.

## Convențiile canonice ale ambiguităților

Convențiile sunt selectori derivați din catalog (prefix, sufix, unitate, unitate-sursă, listă
explicită), deci o cheie nouă care intră într-un tipar este acoperită automat sau poarta o semnalează.

| Convenție | Chei | Regula canonică | Ancoră |
| --- | --- | --- | --- |
| `speed-delta` | `speed_delta_urban`, `speed_delta_residential`, `speed_delta_arterial` | delta în m/s față de limita de circulație, adăugată țintei de drum, plafonată legal; niciodată o viteză absolută | `tests/autonomy/speed-policy.test.ts` |
| `event-penalty-seconds` | `route_turn_penalty`, `route_signal_penalty` | secunde per eveniment (viraj / semafor), adăugate la costul rutei; unitatea canonică `s` | `tests/autonomy/route-policy-v2.test.ts` |
| `route-share-weights` | `route_time_weight`, `route_distance_weight` | pondere normalizată la un buget unic; doar raportul contează, nu scara | `tests/autonomy/route-policy-v2.test.ts` |
| `route-congestion-sensitivity` | `route_congestion_penalty` | sensibilitate adimensională la aglomerație, nu o penalitate în secunde | `tests/autonomy/route-policy-v2.test.ts` |
| `upstream-line-offset` | `red_stop_line_offset`, `stop_line_offset` | metri în amonte de linie (pozitiv înaintea marcajului), nu o depășire | `tests/autonomy/stop-policy.test.ts` |
| `probability-per-opportunity` | cele 10 chei cu unitatea `probability` | un singur eșantion determinist per oportunitate, nu per tick; 0 niciodată, 1 mereu | `tests/autonomy/hazard-policy-v2.test.ts` |
| `occupied-scale-factor` | `occupied_acceleration_scale`, `occupied_lateral_accel_scale` | factor multiplicativ peste valoarea M, doar cu pasager, plafonat de confort și aderență | `tests/autonomy/pickup-policy-v2.test.ts` |
| `approach-speed-ceiling` | `intersection_approach_speed`, `turn_entry_speed`, `crosswalk_approach_speed`, `pickup_approach_speed`, `dropoff_approach_speed` | plafon superior limitat de distanța de oprire, geometrie și aderență; nu cere accelerarea | `tests/autonomy/hazard-policy-v2.test.ts` |

## Tabelul celor 80 de chei

Fiecare rând este derivat din tabel și din raportul grupului; `M păstrat` înseamnă că efectul izolat
este dovedit de testul de regresie al politicii 046–053, iar celelalte rânduri au valori măsurate în
`report.json` al grupului.

| # | Cheie | Politică | Estimator | Efect verificat | Test independent |
| --- | --- | --- | --- | --- | --- |
| 1 | `speed_delta_urban` | CORE `evaluateCruiseTarget` | `estimateSpeedParameters` | M păstrat (test de regresie 046–053) | `tests/autonomy/cruise-targets.test.ts` |
| 2 | `speed_delta_residential` | CORE `evaluateCruiseTarget` | `estimateSpeedParameters` | M păstrat (test de regresie 046–053) | `tests/autonomy/cruise-targets.test.ts` |
| 3 | `speed_delta_arterial` | V2 `evaluateSpeedPolicy` | `estimateSpeedPolicyTempo` | -10 → 20 m/s: 3.9 → 30 (Δ 26.1) | `tests/autonomy/speed-policy.test.ts` |
| 4 | `curve_lateral_accel` | CORE `evaluateCruiseTarget` | `estimateSpeedParameters` | M păstrat (test de regresie 046–053) | `tests/autonomy/cruise-targets.test.ts` |
| 5 | `intersection_approach_speed` | CORE `evaluateCruiseTarget` | `estimateSpeedParameters` | M păstrat (test de regresie 046–053) | `tests/autonomy/cruise-targets.test.ts` |
| 6 | `cruise_speed_variability` | V2 `evaluateSpeedPolicy` | `estimateSpeedPolicyTempo` | 0.3 → 3 m/s: 0.568843 → 5.944266 (Δ 5.375423) | `tests/autonomy/speed-policy.test.ts` |
| 7 | `overtake_speed_bonus` | V2 `evaluateSpeedPolicy` | `estimateSpeedPolicyTempo` | 0 → 2 m/s: 10.9 → 12.9 (Δ 2) | `tests/autonomy/speed-policy.test.ts` |
| 8 | `cruise_accel_deadband` | V2 `evaluateSpeedPolicy` | `estimateSpeedPolicyTempo` | 0.05 → 2 m/s: 10.9 → 10.5 (Δ 0.4) | `tests/autonomy/speed-policy.test.ts` |
| 9 | `desired_acceleration` | CORE `createLongitudinalController` | `estimateAccelerationParameters` | M păstrat (test de regresie 046–053) | `tests/autonomy/longitudinal-control.test.ts` |
| 10 | `comfort_deceleration` | CORE `createLongitudinalController` | `estimateAccelerationParameters` | M păstrat (test de regresie 046–053) | `tests/autonomy/longitudinal-control.test.ts` |
| 11 | `acceleration_jerk` | CORE `createLongitudinalController` | `estimateAccelerationParameters` | M păstrat (test de regresie 046–053) | `tests/autonomy/longitudinal-control.test.ts` |
| 12 | `braking_jerk` | V2 `evaluateAccelPolicy` | `estimateAccelPolicyStyle` | 0.2 → 20 m/s²: 0.026667 → 2 (Δ 1.973333) | `tests/autonomy/accel-policy.test.ts` |
| 13 | `throttle_release_delay` | V2 `evaluateAccelPolicy` | `estimateAccelPolicyStyle` | 0 → 3 ratio: 0 → 0.4 (Δ 0.4) | `tests/autonomy/accel-policy.test.ts` |
| 14 | `brake_reaction_delay` | CORE `createLongitudinalController` | `estimateAccelerationParameters` | M păstrat (test de regresie 046–053) | `tests/autonomy/longitudinal-control.test.ts` |
| 15 | `launch_intensity` | V2 `evaluateAccelPolicy` | `estimateAccelPolicyStyle` | 0 → 1 m/s²: 0.525 → 1.5 (Δ 0.975) | `tests/autonomy/accel-policy.test.ts` |
| 16 | `coasting_bias` | V2 `evaluateAccelPolicy` | `estimateAccelPolicyStyle` | 0 → 1 m/s²: 0.4 → 0 (Δ 0.4) | `tests/autonomy/accel-policy.test.ts` |
| 17 | `following_time_headway` | CORE `evaluateFollowingTarget` | `estimateFollowingParameters` | M păstrat (test de regresie 046–053) | `tests/autonomy/following.test.ts` |
| 18 | `following_min_gap` | CORE `evaluateFollowingTarget` | `estimateFollowingParameters` | M păstrat (test de regresie 046–053) | `tests/autonomy/following.test.ts` |
| 19 | `queue_standstill_gap` | CORE `evaluateFollowingTarget` | `estimateFollowingParameters` | M păstrat (test de regresie 046–053) | `tests/autonomy/following.test.ts` |
| 20 | `cutin_brake_response` | V2 `evaluateFollowPolicy` | `estimateFollowPolicyStyle` | 0.2 → 1 m/s: 9.94 → 1.7 (Δ -8.24) | `tests/autonomy/follow-policy.test.ts` |
| 21 | `following_speed_gain` | CORE `evaluateFollowingTarget` | `estimateFollowingParameters` | M păstrat (test de regresie 046–053) | `tests/autonomy/following.test.ts` |
| 22 | `closing_ttc_threshold` | V2 `evaluateFollowPolicy` | `estimateFollowPolicyStyle` | 0.3 → 8 m/s: 15.26 → 11.875 (Δ -3.385) | `tests/autonomy/follow-policy.test.ts` |
| 23 | `leader_change_delay` | V2 `evaluateFollowPolicy` | `estimateFollowPolicyStyle` | 0 → 2 tick: 1 → 121 (Δ 120) | `tests/autonomy/follow-policy.test.ts` |
| 24 | `following_hysteresis` | V2 `evaluateFollowPolicy` | `estimateFollowPolicyStyle` | 0 → 5 m/s: 30.8 → 0 (Δ -30.8) | `tests/autonomy/follow-policy.test.ts` |
| 25 | `red_stop_probability` | CORE `evaluateSignalPolicy` | `estimateSignalParameters` | M păstrat (test de regresie 046–053) | `tests/autonomy/signal-policy-v2.test.ts` |
| 26 | `yellow_stop_probability` | V2 `evaluateSignalPolicyV2` | `estimateSignalPolicyStyleV2` | 0.2 → 1 ratio: 0.158333 → 1 (Δ 0.841667) | `tests/autonomy/signal-policy-v2.test.ts` |
| 27 | `green_start_delay` | CORE `evaluateSignalPolicy` | `estimateSignalParameters` | M păstrat (test de regresie 046–053) | `tests/autonomy/signal-policy-v2.test.ts` |
| 28 | `red_stop_line_offset` | CORE `evaluateSignalPolicy` | `estimateSignalParameters` | M păstrat (test de regresie 046–053) | `tests/autonomy/signal-policy-v2.test.ts` |
| 29 | `red_run_gap_acceptance` | V2 `evaluateSignalPolicyV2` | `estimateSignalPolicyStyleV2` | 0.1 → 8 ratio: 1 → 0 (Δ -1) | `tests/autonomy/signal-policy-v2.test.ts` |
| 30 | `yellow_commit_time` | V2 `evaluateSignalPolicyV2` | `estimateSignalPolicyStyleV2` | 0.2 → 6 ratio: 0 → 1 (Δ 1) | `tests/autonomy/signal-policy-v2.test.ts` |
| 31 | `green_launch_acceleration` | V2 `evaluateSignalPolicyV2` | `estimateSignalPolicyStyleV2` | 0.2 → 6 m/s²: 0.2 → 6 (Δ 5.8) | `tests/autonomy/signal-policy-v2.test.ts` |
| 32 | `late_red_brake_threshold` | CORE `evaluateSignalPolicy` | `estimateSignalParameters` | M păstrat (test de regresie 046–053) | `tests/autonomy/signal-policy-v2.test.ts` |
| 33 | `stop_full_probability` | CORE `evaluateStopPolicy` | `estimateStopYieldParameters` | M păstrat (test de regresie 046–053) | `tests/autonomy/stop-priority-policy.test.ts` |
| 34 | `stop_dwell_time` | CORE `evaluateStopPolicy` | `estimateStopYieldParameters` | M păstrat (test de regresie 046–053) | `tests/autonomy/stop-priority-policy.test.ts` |
| 35 | `stop_line_offset` | CORE `evaluateStopPolicy` | `estimateStopYieldParameters` | M păstrat (test de regresie 046–053) | `tests/autonomy/stop-priority-policy.test.ts` |
| 36 | `yield_time_gap` | CORE `evaluateYieldPolicy` | `estimateStopYieldParameters` | M păstrat (test de regresie 046–053) | `tests/autonomy/stop-priority-policy.test.ts` |
| 37 | `rolling_stop_speed` | V2 `evaluateStopPriorityPolicy` | `estimateStopPriorityStyle` | 0.2 → 5 m/s: 0.2 → 2.5 (Δ 2.3) | `tests/autonomy/stop-priority-policy.test.ts` |
| 38 | `priority_assertiveness` | V2 `evaluateStopPriorityPolicy` | `estimateStopPriorityStyle` | 0 → 1 ratio: 0 → 1 (Δ 1) | `tests/autonomy/stop-priority-policy.test.ts` |
| 39 | `allway_stop_patience` | V2 `evaluateStopPriorityPolicy` | `estimateStopPriorityStyle` | 0 → 10 ratio: 1 → 0 (Δ -1) | `tests/autonomy/stop-priority-policy.test.ts` |
| 40 | `blocked_intersection_entry_probability` | V2 `evaluateStopPriorityPolicy` | `estimateStopPriorityStyle` | 0 → 1 ratio: 0 → 1 (Δ 1) | `tests/autonomy/stop-priority-policy.test.ts` |
| 41 | `lane_change_front_gap` | CORE `evaluateLaneChange` | `estimateLaneChangeParameters` | M păstrat (test de regresie 046–053) | `tests/autonomy/lane-policy-v2.test.ts` |
| 42 | `lane_change_back_gap` | CORE `evaluateLaneChange` | `estimateLaneChangeParameters` | M păstrat (test de regresie 046–053) | `tests/autonomy/lane-policy-v2.test.ts` |
| 43 | `lane_change_speed_gain` | CORE `evaluateLaneChange` | `estimateLaneChangeParameters` | M păstrat (test de regresie 046–053) | `tests/autonomy/lane-policy-v2.test.ts` |
| 44 | `lane_change_cooldown` | CORE `evaluateLaneChange` | `estimateLaneChangeParameters` | M păstrat (test de regresie 046–053) | `tests/autonomy/lane-policy-v2.test.ts` |
| 45 | `lane_change_duration` | V2 `evaluateLanePolicyV2` | `estimateLaneV2Style` | 0.5 → 5 ratio: 0.5 → 0.1 (Δ -0.4) | `tests/autonomy/lane-policy-v2.test.ts` |
| 46 | `signal_lead_time` | V2 `evaluateLanePolicyV2` | `estimateLaneV2Style` | 0 → 5 ticks: 0 → 300 (Δ 300) | `tests/autonomy/lane-policy-v2.test.ts` |
| 47 | `signal_use_probability` | V2 `evaluateLanePolicyV2` | `estimateLaneV2Style` | 0 → 1 ratio: 0 → 1 (Δ 1) | `tests/autonomy/lane-policy-v2.test.ts` |
| 48 | `pass_on_right_probability` | V2 `evaluateLanePolicyV2` | `estimateLaneV2Style` | 0 → 1 ratio: 0 → 1 (Δ 1) | `tests/autonomy/lane-policy-v2.test.ts` |
| 49 | `lane_center_offset` | V2 `evaluateLateralPolicyV2` | `estimateLateralV2Style` | -1 → 1 m: -0.9 → 0.9 (Δ 1.8) | `tests/autonomy/lateral-policy-v2.test.ts` |
| 50 | `steering_response_time` | V2 `evaluateLateralPolicyV2` | `estimateLateralV2Style` | 0.05 → 1.5 ticks: 3 → 90 (Δ 87) | `tests/autonomy/lateral-policy-v2.test.ts` |
| 51 | `steering_rate_limit` | V2 `evaluateLateralPolicyV2` | `estimateLateralV2Style` | 0.1 → 4 rad: 0.001667 → 0.025 (Δ 0.023333) | `tests/autonomy/lateral-policy-v2.test.ts` |
| 52 | `turn_entry_speed` | V2 `evaluateLateralPolicyV2` | `estimateLateralV2Style` | 1 → 18 m/s: 1 → 6.268769 (Δ 5.268769) | `tests/autonomy/lateral-policy-v2.test.ts` |
| 53 | `turn_exit_acceleration` | V2 `evaluateLateralPolicyV2` | `estimateLateralV2Style` | 0.2 → 6 m/s²: 0.2 → 1.5 (Δ 1.3) | `tests/autonomy/lateral-policy-v2.test.ts` |
| 54 | `corner_cutting_bias` | V2 `evaluateLateralPolicyV2` | `estimateLateralV2Style` | 0 → 1 m: 0 → 0.9 (Δ 0.9) | `tests/autonomy/lateral-policy-v2.test.ts` |
| 55 | `lateral_clearance` | V2 `evaluateLateralPolicyV2` | `estimateLateralV2Style` | 0.1 → 3 ratio: 1 → 0 (Δ -1) | `tests/autonomy/lateral-policy-v2.test.ts` |
| 56 | `lateral_correction_deadband` | V2 `evaluateLateralPolicyV2` | `estimateLateralV2Style` | 0 → 0.6 ratio: 1 → 0 (Δ -1) | `tests/autonomy/lateral-policy-v2.test.ts` |
| 57 | `route_time_weight` | V2 `evaluateRoutePolicyV2` | `estimateRouteV2Style` | 0 → 1 s: 113.29523 → 60.655781 (Δ -52.639449) | `tests/autonomy/route-policy-v2.test.ts` |
| 58 | `route_distance_weight` | V2 `evaluateRoutePolicyV2` | `estimateRouteV2Style` | 0 → 1 m: 1094.427191 → 666.476152 (Δ -427.951039) | `tests/autonomy/route-policy-v2.test.ts` |
| 59 | `route_turn_penalty` | V2 `evaluateRoutePolicyV2` | `estimateRouteV2Style` | 0 → 20 viraje: 4 → 1 (Δ -3) | `tests/autonomy/route-policy-v2.test.ts` |
| 60 | `route_signal_penalty` | V2 `evaluateRoutePolicyV2` | `estimateRouteV2Style` | 0 → 60 semafoare: 3 → 0 (Δ -3) | `tests/autonomy/route-policy-v2.test.ts` |
| 61 | `route_congestion_penalty` | V2 `evaluateRoutePolicyV2` | `estimateRouteV2Style` | 0 → 2 s: 20 → 0 (Δ -20) | `tests/autonomy/route-policy-v2.test.ts` |
| 62 | `reroute_patience` | V2 `evaluateRoutePolicyV2` | `estimateRouteV2Style` | 2 → 120 ticks: 60 → 7140 (Δ 7080) | `tests/autonomy/route-policy-v2.test.ts` |
| 63 | `u_turn_willingness` | V2 `evaluateRoutePolicyV2` | `estimateRouteV2Style` | 0 → 1 s: 66.055513 → 40.048766 (Δ -26.006746) | `tests/autonomy/route-policy-v2.test.ts` |
| 64 | `reverse_recovery_duration` | V2 `evaluateRoutePolicyV2` | `estimateRouteV2Style` | 0 → 8 s: 2.5 → 8 (Δ 5.5) | `tests/autonomy/route-policy-v2.test.ts` |
| 65 | `pedestrian_yield_probability` | V2 `evaluateHazardPolicyV2` | `estimateHazardV2Style` | 0 → 1 decizie: 0 → 1 (Δ 1) | `tests/autonomy/hazard-policy-v2.test.ts` |
| 66 | `pedestrian_clearance` | V2 `evaluateHazardPolicyV2` | `estimateHazardV2Style` | 0.1 → 6 m/s: 6.228965 → 4.898979 (Δ -1.329985) | `tests/autonomy/hazard-policy-v2.test.ts` |
| 67 | `hazard_reaction_delay` | V2 `evaluateHazardPolicyV2` | `estimateHazardV2Style` | 0 → 3 m: 28 → 4 (Δ -24) | `tests/autonomy/hazard-policy-v2.test.ts` |
| 68 | `obstacle_clearance` | V2 `evaluateHazardPolicyV2` | `estimateHazardV2Style` | 0.1 → 4 m/s: 6.324555 → 5.549775 (Δ -0.774781) | `tests/autonomy/hazard-policy-v2.test.ts` |
| 69 | `emergency_brake_intensity` | V2 `evaluateHazardPolicyV2` | `estimateHazardV2Style` | 0 → 1 m/s²: 0 → 8 (Δ 8) | `tests/autonomy/hazard-policy-v2.test.ts` |
| 70 | `evasive_steer_willingness` | V2 `evaluateHazardPolicyV2` | `estimateHazardV2Style` | 0 → 1 m: 0 → 0.45 (Δ 0.45) | `tests/autonomy/hazard-policy-v2.test.ts` |
| 71 | `crosswalk_approach_speed` | V2 `evaluateHazardPolicyV2` | `estimateHazardV2Style` | 0.5 → 15 m/s: 0.5 → 15 (Δ 14.5) | `tests/autonomy/hazard-policy-v2.test.ts` |
| 72 | `horn_use_probability` | V2 `evaluateHazardPolicyV2` | `estimateHazardV2Style` | 0 → 1 decizie: 0 → 1 (Δ 1) | `tests/autonomy/hazard-policy-v2.test.ts` |
| 73 | `pickup_approach_speed` | V2 `evaluatePickupPolicyV2` | `estimatePickupV2Style` | 0.5 → 8 m/s: 0.5 → 5.567764 (Δ 5.067764) | `tests/autonomy/pickup-policy-v2.test.ts` |
| 74 | `pickup_curb_distance` | V2 `evaluatePickupPolicyV2` | `estimatePickupV2Style` | 0.1 → 2 m: 0.15 → 1.2 (Δ 1.05) | `tests/autonomy/pickup-policy-v2.test.ts` |
| 75 | `pickup_stop_precision` | V2 `evaluatePickupPolicyV2` | `estimatePickupV2Style` | 0.2 → 5 m: 0.2 → 2.75 (Δ 2.55) | `tests/autonomy/pickup-policy-v2.test.ts` |
| 76 | `pickup_dwell_time` | V2 `evaluatePickupPolicyV2` | `estimatePickupV2Style` | 1 → 10 s: 3 → 10 (Δ 7) | `tests/autonomy/pickup-policy-v2.test.ts` |
| 77 | `dropoff_approach_speed` | V2 `evaluatePickupPolicyV2` | `estimatePickupV2Style` | 0.5 → 8 m/s: 0.5 → 5.567764 (Δ 5.067764) | `tests/autonomy/pickup-policy-v2.test.ts` |
| 78 | `dropoff_curb_distance` | V2 `evaluatePickupPolicyV2` | `estimatePickupV2Style` | 0.1 → 2 m: 0.15 → 1.2 (Δ 1.05) | `tests/autonomy/pickup-policy-v2.test.ts` |
| 79 | `occupied_acceleration_scale` | V2 `evaluatePickupPolicyV2` | `estimatePickupV2Style` | 0.3 → 1.5 m/s²: 0.45 → 2 (Δ 1.55) | `tests/autonomy/pickup-policy-v2.test.ts` |
| 80 | `occupied_lateral_accel_scale` | V2 `evaluatePickupPolicyV2` | `estimatePickupV2Style` | 0.3 → 1.5 m/s²: 0.75 → 2.5 (Δ 1.75) | `tests/autonomy/pickup-policy-v2.test.ts` |

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run validate:parameters` | 12/12 verificări `PASS`, 80/80 chei, 0 findings, verdict `PASS` |
| `npm run validate:parameters -- --check` | `report.json` și `report.md` curente |
| `node --import ./scripts/register-typescript.mjs --test tests/validation/parameter-gate.test.ts` | 8 teste, 8 trecute, 0 eșuate |
| `npm run typecheck` | 0 erori (`tsc --noEmit` și `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | 0 erori, 0 warnings |
| `npm run format:check` | toate fișierele formatate |
| `npm run check:architecture` | PASS, 390 fișiere TypeScript, toate probele negative |
| `npm run check:parameter-catalog` | catalog sincronizat |
| `npm test` | 3 234 teste, 3 234 trecute, 0 eșuate (102,2 s) |

## Fișiere atinse

- Creat: `src/profiles/parameter-capabilities.ts` (tabelul, convențiile, `evaluateParameterGate`).
- Modificat: `src/profiles/parameter-registry.ts` (derivarea din tabel, `policyKeys` eliminat).
- Creat: `scripts/run-v2-parameter-gate.mjs` și scriptul `validate:parameters` din `package.json`.
- Creat: `tests/validation/parameter-gate.test.ts` (8 teste, inclusiv probele negative).
- Actualizate: `Docs/18-validare-si-release.md` (secțiune nouă la final) și acest director de dovezi.
- Actualizate aserțiuni care fixau starea fail-closed dinainte de 187 (justificate mai jos):
  `tests/parameters/registry.test.ts`, `tests/autonomy/decision-explanation.test.ts`,
  `tests/autonomy/cruise-targets.test.ts`, `tests/autonomy/longitudinal-control.test.ts`,
  `tests/autonomy/lane-change-policy.test.ts`, `tests/autonomy/lane-policy-v2.test.ts`,
  `tests/autonomy/lateral-policy-v2.test.ts`, `tests/autonomy/hazard-policy-v2.test.ts`,
  `tests/autonomy/pickup-policy-v2.test.ts`, `tests/autonomy/route-policy-v2.test.ts`,
  `tests/autonomy/signal-policy.test.ts`, `tests/autonomy/signal-policy-v2.test.ts`,
  `tests/autonomy/stop-policy.test.ts`, `tests/autonomy/stop-priority-policy.test.ts`,
  `tests/autonomy/yield-policy.test.ts`, `tests/experiments/cross-class-fidelity.test.ts`,
  `tests/experiments/inverse-learning.test.ts`, `tests/experiments/learning-edgecases.test.ts`,
  `tests/experiments/learning-gate24.test.ts`, `tests/learning/candidate-validation.test.ts`,
  `tests/learning/parameter-evidence.test.ts`, `tests/learning/route-v2-estimator.test.ts`,
  `tests/missions/mission-daily.test.ts`, `tests/profiles/profile-store.test.ts`,
  `tests/profiles/profile-v2.test.ts`.

## Teste existente actualizate și de ce

- **Polaritatea `implemented`/`estimable`** (24 de fișiere): aserțiunile fixau starea „registrul nu
  acordă nimic”, care era adevărată înainte de 187. Ele verifică acum exact ce certifică tabelul
  (`implemented = policy !== null`, `estimable = estimator !== null`), iar invariantul fail-closed
  real — catalogul JSON nu acordă nimic — este păstrat explicit în `registry.test.ts` și în testul
  porții. Nu a fost eliminată nicio aserțiune.
- **`LEARNED` pentru cheile certificate** (`cruise-targets`, `longitudinal-control`): refuzul
  `LEARNED` venea din `estimable=false`; acum cheia este certificată, deci profilul este acceptat, iar
  testul păstrează refuzul când dovezile lipsesc. „Dovada pozitivă nu acordă capabilitate” rămâne
  adevărat: capabilitatea vine din tabel.
- **`profile-v2`**: `yield_time_gap` trece de la `DEFAULT_ONLY` la `SUPPORTED` și numărul de chei
  `SUPPORTED` de la 23 la 24; cele 56 de chei `extension` rămân `RESERVED`.
- **`055`**: cheile certificate sunt acum influențe explicite; refuzul cheilor necunoscute și
  duplicate rămâne neschimbat.
- **`211` (daily)**: cheia de test pentru „cheie neimplementată” este una necertificată
  (`speed_delta_moon`), pentru că toate cele 80 de chei de catalog sunt acum certificate; regula
  „cheia de învățare trebuie să fie în registru” este neschimbată.

## Limitări

- Cele 56 de chei `extension` sunt certificate, dar etapa de plan le păstrează rezervate:
  `candidate-validation` le refuză cu `KEY_EXTENSION_STAGE` și exportul le scrie în
  `reservedParameters`. Migrarea etapei ține de catalog/plan, nu de acest PBI.
- `Docs/Evidence/108-learning-gate24/report.json` și `Docs/Evidence/166-profile-v2/report.json`
  embed-uiesc starea registrului și devin inconsecvente până la regenerare (`--check` semnalează);
  aparțin PBI-urilor 108/166 și nu au fost rescrise aici.
- `Docs/parameter-registry.md` descrie încă regula V1 (`estimable=false` pentru toate cheile).
- Poarta dovedește contracte, nu comportament integrat: straturile V2 nu sunt montate în bucla live,
  iar browserul, FPS-ul și playtestul rămân la gate-urile 188/189.
- Timpul de execuție al suitei complete variază cu încărcarea mașinii; testele de timp de perete pot
  fi reluate o singură dată conform politicii.
