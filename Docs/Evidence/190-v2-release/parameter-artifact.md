# Artefactul celor 80 de parametri (PBI 190)

> Fișier generat determinist de `npm run release:v2`. Nu edita manual.

**Verdict: PASS.** Artefactul este derivat din [catalogul de date](../../../Docs/driving-parameters.json), din tabelul de capabilități 187 și din dovezile comise ale grupurilor 167–186; efectele măsurate sunt citite din rapoartele grupurilor, iar livrarea în joc din raportul 188.

**Rezumat:** 80/80 chei; 24 CORE + 56 V2; 80 politici și 80 estimatori (0 NONE); 56 efecte măsurate + 24 consecințe M păstrate; 8 convenții canonice; 15 chei demonstrate de provocările 188; **56 chei certificate dar rezervate de etapa de plan**.

## Ce înseamnă „suport real” în acest artefact

- **24 chei CORE** sunt livrate în bucla V1 de politicile 046–053: o cheie are consumator de politică și estimator, iar estimarea și `LEARNED` sunt permise de tabelul 187.
- **56 chei V2** sunt certificate de poarta 187 (politică, estimator, dovezi, test independent), dar **încă rezervate** de etapa de plan: `candidate-validation` le refuză cu `KEY_EXTENSION_STAGE`, iar exportul le scrie `null` în `reservedParameters`. Certificarea nu le face livrabile end-to-end.
- **15 din 56** chei V2 au și o demonstrație de joc în provocările 188; celelalte 41 sunt certificate, dar fără provocare dedicată.
- Nicio cheie nu are estimator `NONE`: toate cele 80 sunt estimabile, dar asta descrie capabilitatea certificată, nu un parcurs de joc încheiat.

## Convențiile canonice ale ambiguităților

| Convenție | Chei acoperite | Regula canonică | Ancoră |
| --- | --- | --- | --- |
| `speed-delta` | `speed_delta_urban`, `speed_delta_residential`, `speed_delta_arterial` | speed_delta_* este o diferență în m/s față de limita de circulație (viteza liberă), adăugată țintei de drum, niciodată o viteză absolută; rezultatul rămâne plafonat de limita legală. | `tests/autonomy/speed-policy.test.ts` — 167 arterial delta is the only key that moves the arterial road target |
| `event-penalty-seconds` | `route_turn_penalty`, `route_signal_penalty` | route_*_penalty este un cost în secunde per eveniment (un viraj, respectiv un semafor), adăugat la costul rutei; unitatea canonică este s, iar numărul de evenimente vine din ruta evaluată. | `tests/autonomy/route-policy-v2.test.ts` — 181 gives every key its own observable effect, on comparable real alternatives |
| `route-share-weights` | `route_time_weight`, `route_distance_weight` | route_*_weight este o pondere normalizată: coeficienții sunt împărțiți la suma ponderilor, deci doar raportul contează, nu scara absolută; două seturi proporționale produc aceeași alegere. | `tests/autonomy/route-policy-v2.test.ts` — 181 normalizes the weights: shares of one budget, identical coefficients at every scale |
| `route-congestion-sensitivity` | `route_congestion_penalty` | route_congestion_penalty este o sensibilitate adimensională la aglomerație (factor peste costul de bază), nu o penalitate în secunde; este singura cheie route_*_penalty fără unitate de timp. | `tests/autonomy/route-policy-v2.test.ts` — 181 gives every key its own observable effect, on comparable real alternatives |
| `upstream-line-offset` | `red_stop_line_offset`, `stop_line_offset` | stop_line_offset și red_stop_line_offset sunt metri măsurați în amonte de linie (pozitiv înaintea liniei), nu o depășire a liniei; oprirea rămâne înaintea marcajului. | `tests/autonomy/stop-policy.test.ts` — 051 a free STOP approaches the offset point, holds until the authoritative proof and then releases |
| `probability-per-opportunity` | `red_stop_probability`, `yellow_stop_probability`, `stop_full_probability`, `blocked_intersection_entry_probability`, `signal_use_probability`, `pass_on_right_probability`, `u_turn_willingness`, `pedestrian_yield_probability`, `evasive_steer_willingness`, `horn_use_probability` | Cheile de tip probabilitate se aplică pe oportunitate, cu un singur eșantion determinist per oportunitate, nu per tick; valoarea 0 nu produce niciodată evenimentul, valoarea 1 îl produce mereu. | `tests/autonomy/hazard-policy-v2.test.ts` — 183 subordinates the horn to the world permission and samples once per opportunity |
| `occupied-scale-factor` | `occupied_acceleration_scale`, `occupied_lateral_accel_scale` | occupied_* este un factor multiplicativ peste valoarea M (accelerație longitudinală, respectiv laterală), aplicat numai cu pasager la bord și plafonat de confort și aderență; nu este o valoare absolută în m/s². | `tests/autonomy/pickup-policy-v2.test.ts` — 185 applies the occupied scales only with a passenger and caps them by comfort and adhesion |
| `approach-speed-ceiling` | `intersection_approach_speed`, `turn_entry_speed`, `crosswalk_approach_speed`, `pickup_approach_speed`, `dropoff_approach_speed` | Vitezele de apropiere (intersecție, trecere, pickup, dropoff) și viteza de intrare în viraj sunt plafoane superioare, limitate de distanța de oprire, geometrie și aderență; nu sunt ținte care cer accelerarea. | `tests/autonomy/hazard-policy-v2.test.ts` — 183 saturates the reaction delay at the room that is really there |

## Catalogul și capabilitatea celor 80 de chei

| # | Cheie | Categorie | Unitate | Interval | Default | Etapă | Politică | Estimator | Convenție |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `speed_delta_urban` | Viteză și ritm | `m/s` | `-8–15 m/s` | `0` | CORE (M) | CORE `evaluateCruiseTarget` | `estimateSpeedParameters` | `speed-delta` |
| 2 | `speed_delta_residential` | Viteză și ritm | `m/s` | `-8–12 m/s` | `0` | CORE (M) | CORE `evaluateCruiseTarget` | `estimateSpeedParameters` | `speed-delta` |
| 3 | `speed_delta_arterial` | Viteză și ritm | `m/s` | `-10–20 m/s` | `0` | V2 (R) | V2 `evaluateSpeedPolicy` | `estimateSpeedPolicyTempo` | `speed-delta` |
| 4 | `curve_lateral_accel` | Viteză și ritm | `m/s²` | `0.5–8 m/s²` | `2.5` | CORE (M) | CORE `evaluateCruiseTarget` | `estimateSpeedParameters` | — |
| 5 | `intersection_approach_speed` | Viteză și ritm | `m/s` | `1–20 m/s` | `6` | CORE (M) | CORE `evaluateCruiseTarget` | `estimateSpeedParameters` | `approach-speed-ceiling` |
| 6 | `cruise_speed_variability` | Viteză și ritm | `m/s` | `0–3 m/s` | `0.3` | V2 (R) | V2 `evaluateSpeedPolicy` | `estimateSpeedPolicyTempo` | — |
| 7 | `overtake_speed_bonus` | Viteză și ritm | `m/s` | `0–10 m/s` | `2` | V2 (R) | V2 `evaluateSpeedPolicy` | `estimateSpeedPolicyTempo` | — |
| 8 | `cruise_accel_deadband` | Viteză și ritm | `m/s` | `0.05–2 m/s` | `0.3` | V2 (R) | V2 `evaluateSpeedPolicy` | `estimateSpeedPolicyTempo` | — |
| 9 | `desired_acceleration` | Accelerație și frânare | `m/s²` | `0.2–6 m/s²` | `1.5` | CORE (M) | CORE `createLongitudinalController` | `estimateAccelerationParameters` | — |
| 10 | `comfort_deceleration` | Accelerație și frânare | `m/s²` | `0.3–8 m/s²` | `2` | CORE (M) | CORE `createLongitudinalController` | `estimateAccelerationParameters` | — |
| 11 | `acceleration_jerk` | Accelerație și frânare | `m/s³` | `0.2–15 m/s³` | `2` | CORE (M) | CORE `createLongitudinalController` | `estimateAccelerationParameters` | — |
| 12 | `braking_jerk` | Accelerație și frânare | `m/s³` | `0.2–20 m/s³` | `3` | V2 (R) | V2 `evaluateAccelPolicy` | `estimateAccelPolicyStyle` | — |
| 13 | `throttle_release_delay` | Accelerație și frânare | `s` | `0–3 s` | `0.2` | V2 (R) | V2 `evaluateAccelPolicy` | `estimateAccelPolicyStyle` | — |
| 14 | `brake_reaction_delay` | Accelerație și frânare | `s` | `0–3 s` | `0.5` | CORE (M) | CORE `createLongitudinalController` | `estimateAccelerationParameters` | — |
| 15 | `launch_intensity` | Accelerație și frânare | `raport` (`ratio`) | `0–1 raport` | `0.6` | V2 (R) | V2 `evaluateAccelPolicy` | `estimateAccelPolicyStyle` | — |
| 16 | `coasting_bias` | Accelerație și frânare | `raport` (`ratio`) | `0–1 raport` | `0.4` | V2 (R) | V2 `evaluateAccelPolicy` | `estimateAccelPolicyStyle` | — |
| 17 | `following_time_headway` | Urmărire și distanțe | `s` | `0.2–5 s` | `1.8` | CORE (M) | CORE `evaluateFollowingTarget` | `estimateFollowingParameters` | — |
| 18 | `following_min_gap` | Urmărire și distanțe | `m` | `0.2–15 m` | `3` | CORE (M) | CORE `evaluateFollowingTarget` | `estimateFollowingParameters` | — |
| 19 | `queue_standstill_gap` | Urmărire și distanțe | `m` | `0.2–10 m` | `2` | CORE (M) | CORE `evaluateFollowingTarget` | `estimateFollowingParameters` | — |
| 20 | `cutin_brake_response` | Urmărire și distanțe | `raport` (`ratio`) | `0–1 raport` | `0.7` | V2 (R) | V2 `evaluateFollowPolicy` | `estimateFollowPolicyStyle` | — |
| 21 | `following_speed_gain` | Urmărire și distanțe | `1/s` | `0.1–2 1/s` | `0.7` | CORE (M) | CORE `evaluateFollowingTarget` | `estimateFollowingParameters` | — |
| 22 | `closing_ttc_threshold` | Urmărire și distanțe | `s` | `0.3–8 s` | `3` | V2 (R) | V2 `evaluateFollowPolicy` | `estimateFollowPolicyStyle` | — |
| 23 | `leader_change_delay` | Urmărire și distanțe | `s` | `0–2 s` | `0.2` | V2 (R) | V2 `evaluateFollowPolicy` | `estimateFollowPolicyStyle` | — |
| 24 | `following_hysteresis` | Urmărire și distanțe | `m` | `0–5 m` | `1` | V2 (R) | V2 `evaluateFollowPolicy` | `estimateFollowPolicyStyle` | — |
| 25 | `red_stop_probability` | Semafoare | `probabilitate` (`probability`) | `0–1 probabilitate` | `1` | CORE (M) | CORE `evaluateSignalPolicy` | `estimateSignalParameters` | `probability-per-opportunity` |
| 26 | `yellow_stop_probability` | Semafoare | `probabilitate` (`probability`) | `0–1 probabilitate` | `0.8` | V2 (R) | V2 `evaluateSignalPolicyV2` | `estimateSignalPolicyStyleV2` | `probability-per-opportunity` |
| 27 | `green_start_delay` | Semafoare | `s` | `0–4 s` | `0.7` | CORE (M) | CORE `evaluateSignalPolicy` | `estimateSignalParameters` | — |
| 28 | `red_stop_line_offset` | Semafoare | `m` | `0–5 m` | `1` | CORE (M) | CORE `evaluateSignalPolicy` | `estimateSignalParameters` | `upstream-line-offset` |
| 29 | `red_run_gap_acceptance` | Semafoare | `s` | `0.1–8 s` | `2.5` | V2 (R) | V2 `evaluateSignalPolicyV2` | `estimateSignalPolicyStyleV2` | — |
| 30 | `yellow_commit_time` | Semafoare | `s` | `0.2–6 s` | `2` | V2 (R) | V2 `evaluateSignalPolicyV2` | `estimateSignalPolicyStyleV2` | — |
| 31 | `green_launch_acceleration` | Semafoare | `m/s²` | `0.2–6 m/s²` | `1.5` | V2 (R) | V2 `evaluateSignalPolicyV2` | `estimateSignalPolicyStyleV2` | — |
| 32 | `late_red_brake_threshold` | Semafoare | `s` | `0.2–6 s` | `2` | CORE (M) | CORE `evaluateSignalPolicy` | `estimateSignalParameters` | — |
| 33 | `stop_full_probability` | STOP și prioritate | `probabilitate` (`probability`) | `0–1 probabilitate` | `1` | CORE (M) | CORE `evaluateStopPolicy` | `estimateStopYieldParameters` | `probability-per-opportunity` |
| 34 | `stop_dwell_time` | STOP și prioritate | `s` | `0–4 s` | `1` | CORE (M) | CORE `evaluateStopPolicy` | `estimateStopYieldParameters` | — |
| 35 | `stop_line_offset` | STOP și prioritate | `m` | `0–5 m` | `1` | CORE (M) | CORE `evaluateStopPolicy` | `estimateStopYieldParameters` | `upstream-line-offset` |
| 36 | `yield_time_gap` | STOP și prioritate | `s` | `0.2–8 s` | `3` | CORE (M) | CORE `evaluateYieldPolicy` | `estimateStopYieldParameters` | — |
| 37 | `rolling_stop_speed` | STOP și prioritate | `m/s` | `0.2–5 m/s` | `1` | V2 (R) | V2 `evaluateStopPriorityPolicy` | `estimateStopPriorityStyle` | — |
| 38 | `priority_assertiveness` | STOP și prioritate | `raport` (`ratio`) | `0–1 raport` | `0.3` | V2 (R) | V2 `evaluateStopPriorityPolicy` | `estimateStopPriorityStyle` | — |
| 39 | `allway_stop_patience` | STOP și prioritate | `s` | `0–10 s` | `2` | V2 (R) | V2 `evaluateStopPriorityPolicy` | `estimateStopPriorityStyle` | — |
| 40 | `blocked_intersection_entry_probability` | STOP și prioritate | `probabilitate` (`probability`) | `0–1 probabilitate` | `0` | V2 (R) | V2 `evaluateStopPriorityPolicy` | `estimateStopPriorityStyle` | `probability-per-opportunity` |
| 41 | `lane_change_front_gap` | Schimbare de bandă și depășire | `m` | `0.5–40 m` | `12` | CORE (M) | CORE `evaluateLaneChange` | `estimateLaneChangeParameters` | — |
| 42 | `lane_change_back_gap` | Schimbare de bandă și depășire | `m` | `0.5–40 m` | `10` | CORE (M) | CORE `evaluateLaneChange` | `estimateLaneChangeParameters` | — |
| 43 | `lane_change_speed_gain` | Schimbare de bandă și depășire | `m/s` | `0–10 m/s` | `2` | CORE (M) | CORE `evaluateLaneChange` | `estimateLaneChangeParameters` | — |
| 44 | `lane_change_cooldown` | Schimbare de bandă și depășire | `s` | `0.5–30 s` | `6` | CORE (M) | CORE `evaluateLaneChange` | `estimateLaneChangeParameters` | — |
| 45 | `lane_change_duration` | Schimbare de bandă și depășire | `s` | `0.5–5 s` | `2` | V2 (R) | V2 `evaluateLanePolicyV2` | `estimateLaneV2Style` | — |
| 46 | `signal_lead_time` | Schimbare de bandă și depășire | `s` | `0–5 s` | `1` | V2 (R) | V2 `evaluateLanePolicyV2` | `estimateLaneV2Style` | — |
| 47 | `signal_use_probability` | Schimbare de bandă și depășire | `probabilitate` (`probability`) | `0–1 probabilitate` | `1` | V2 (R) | V2 `evaluateLanePolicyV2` | `estimateLaneV2Style` | `probability-per-opportunity` |
| 48 | `pass_on_right_probability` | Schimbare de bandă și depășire | `probabilitate` (`probability`) | `0–1 probabilitate` | `0` | V2 (R) | V2 `evaluateLanePolicyV2` | `estimateLaneV2Style` | `probability-per-opportunity` |
| 49 | `lane_center_offset` | Control lateral și viraje | `m` | `-1–1 m` | `0` | V2 (R) | V2 `evaluateLateralPolicyV2` | `estimateLateralV2Style` | — |
| 50 | `steering_response_time` | Control lateral și viraje | `s` | `0.05–1.5 s` | `0.3` | V2 (R) | V2 `evaluateLateralPolicyV2` | `estimateLateralV2Style` | — |
| 51 | `steering_rate_limit` | Control lateral și viraje | `rad/s` | `0.1–4 rad/s` | `1` | V2 (R) | V2 `evaluateLateralPolicyV2` | `estimateLateralV2Style` | — |
| 52 | `turn_entry_speed` | Control lateral și viraje | `m/s` | `1–18 m/s` | `5` | V2 (R) | V2 `evaluateLateralPolicyV2` | `estimateLateralV2Style` | `approach-speed-ceiling` |
| 53 | `turn_exit_acceleration` | Control lateral și viraje | `m/s²` | `0.2–6 m/s²` | `1.5` | V2 (R) | V2 `evaluateLateralPolicyV2` | `estimateLateralV2Style` | — |
| 54 | `corner_cutting_bias` | Control lateral și viraje | `raport` (`ratio`) | `0–1 raport` | `0` | V2 (R) | V2 `evaluateLateralPolicyV2` | `estimateLateralV2Style` | — |
| 55 | `lateral_clearance` | Control lateral și viraje | `m` | `0.1–3 m` | `0.8` | V2 (R) | V2 `evaluateLateralPolicyV2` | `estimateLateralV2Style` | — |
| 56 | `lateral_correction_deadband` | Control lateral și viraje | `m` | `0–0.6 m` | `0.1` | V2 (R) | V2 `evaluateLateralPolicyV2` | `estimateLateralV2Style` | — |
| 57 | `route_time_weight` | Trasee și recuperare | `pondere` (`weight`) | `0–1 pondere` | `0.6` | V2 (R) | V2 `evaluateRoutePolicyV2` | `estimateRouteV2Style` | `route-share-weights` |
| 58 | `route_distance_weight` | Trasee și recuperare | `pondere` (`weight`) | `0–1 pondere` | `0.3` | V2 (R) | V2 `evaluateRoutePolicyV2` | `estimateRouteV2Style` | `route-share-weights` |
| 59 | `route_turn_penalty` | Trasee și recuperare | `s/viraj` (`s`) | `0–20 s/viraj` | `2` | V2 (R) | V2 `evaluateRoutePolicyV2` | `estimateRouteV2Style` | `event-penalty-seconds` |
| 60 | `route_signal_penalty` | Trasee și recuperare | `s/semafor` (`s`) | `0–60 s/semafor` | `5` | V2 (R) | V2 `evaluateRoutePolicyV2` | `estimateRouteV2Style` | `event-penalty-seconds` |
| 61 | `route_congestion_penalty` | Trasee și recuperare | `raport` (`ratio`) | `0–2 raport` | `0.5` | V2 (R) | V2 `evaluateRoutePolicyV2` | `estimateRouteV2Style` | `route-congestion-sensitivity` |
| 62 | `reroute_patience` | Trasee și recuperare | `s` | `2–120 s` | `20` | V2 (R) | V2 `evaluateRoutePolicyV2` | `estimateRouteV2Style` | — |
| 63 | `u_turn_willingness` | Trasee și recuperare | `probabilitate` (`probability`) | `0–1 probabilitate` | `0` | V2 (R) | V2 `evaluateRoutePolicyV2` | `estimateRouteV2Style` | `probability-per-opportunity` |
| 64 | `reverse_recovery_duration` | Trasee și recuperare | `s` | `0–8 s` | `2` | V2 (R) | V2 `evaluateRoutePolicyV2` | `estimateRouteV2Style` | — |
| 65 | `pedestrian_yield_probability` | Pietoni și pericole | `probabilitate` (`probability`) | `0–1 probabilitate` | `1` | V2 (R) | V2 `evaluateHazardPolicyV2` | `estimateHazardV2Style` | `probability-per-opportunity` |
| 66 | `pedestrian_clearance` | Pietoni și pericole | `m` | `0.1–6 m` | `2` | V2 (R) | V2 `evaluateHazardPolicyV2` | `estimateHazardV2Style` | — |
| 67 | `hazard_reaction_delay` | Pietoni și pericole | `s` | `0–3 s` | `0.5` | V2 (R) | V2 `evaluateHazardPolicyV2` | `estimateHazardV2Style` | — |
| 68 | `obstacle_clearance` | Pietoni și pericole | `m` | `0.1–4 m` | `1` | V2 (R) | V2 `evaluateHazardPolicyV2` | `estimateHazardV2Style` | — |
| 69 | `emergency_brake_intensity` | Pietoni și pericole | `raport` (`ratio`) | `0–1 raport` | `1` | V2 (R) | V2 `evaluateHazardPolicyV2` | `estimateHazardV2Style` | — |
| 70 | `evasive_steer_willingness` | Pietoni și pericole | `probabilitate` (`probability`) | `0–1 probabilitate` | `0.3` | V2 (R) | V2 `evaluateHazardPolicyV2` | `estimateHazardV2Style` | `probability-per-opportunity` |
| 71 | `crosswalk_approach_speed` | Pietoni și pericole | `m/s` | `0.5–15 m/s` | `5` | V2 (R) | V2 `evaluateHazardPolicyV2` | `estimateHazardV2Style` | `approach-speed-ceiling` |
| 72 | `horn_use_probability` | Pietoni și pericole | `probabilitate` (`probability`) | `0–1 probabilitate` | `0.1` | V2 (R) | V2 `evaluateHazardPolicyV2` | `estimateHazardV2Style` | `probability-per-opportunity` |
| 73 | `pickup_approach_speed` | Pickup și confortul pasagerilor | `m/s` | `0.5–8 m/s` | `3` | V2 (R) | V2 `evaluatePickupPolicyV2` | `estimatePickupV2Style` | `approach-speed-ceiling` |
| 74 | `pickup_curb_distance` | Pickup și confortul pasagerilor | `m` | `0.1–2 m` | `0.5` | V2 (R) | V2 `evaluatePickupPolicyV2` | `estimatePickupV2Style` | — |
| 75 | `pickup_stop_precision` | Pickup și confortul pasagerilor | `m` | `0.2–5 m` | `1` | V2 (R) | V2 `evaluatePickupPolicyV2` | `estimatePickupV2Style` | — |
| 76 | `pickup_dwell_time` | Pickup și confortul pasagerilor | `s` | `1–10 s` | `3` | V2 (R) | V2 `evaluatePickupPolicyV2` | `estimatePickupV2Style` | — |
| 77 | `dropoff_approach_speed` | Pickup și confortul pasagerilor | `m/s` | `0.5–8 m/s` | `3` | V2 (R) | V2 `evaluatePickupPolicyV2` | `estimatePickupV2Style` | `approach-speed-ceiling` |
| 78 | `dropoff_curb_distance` | Pickup și confortul pasagerilor | `m` | `0.1–2 m` | `0.5` | V2 (R) | V2 `evaluatePickupPolicyV2` | `estimatePickupV2Style` | — |
| 79 | `occupied_acceleration_scale` | Pickup și confortul pasagerilor | `raport` (`ratio`) | `0.3–1.5 raport` | `0.85` | V2 (R) | V2 `evaluatePickupPolicyV2` | `estimatePickupV2Style` | `occupied-scale-factor` |
| 80 | `occupied_lateral_accel_scale` | Pickup și confortul pasagerilor | `raport` (`ratio`) | `0.3–1.5 raport` | `0.85` | V2 (R) | V2 `evaluatePickupPolicyV2` | `estimatePickupV2Style` | `occupied-scale-factor` |

## Livrarea în joc și limitarea care rămâne

| # | Cheie | Provocare 188 | Efect verificat | Livrabilă end-to-end | Limitare |
| --- | --- | --- | --- | --- | --- |
| 1 | `speed_delta_urban` | — (politică V1) | M păstrat: 046 each of four parameters individually changes target in an unsaturated isolated scenario | DA | Livrată în bucla V1 prin politica M; estimarea și LEARNED sunt permise de tabelul 187. Nu are provocare dedicată în 188, care acoperă doar chei V2. |
| 2 | `speed_delta_residential` | — (politică V1) | M păstrat: 046 each of four parameters individually changes target in an unsaturated isolated scenario | DA | Livrată în bucla V1 prin politica M; estimarea și LEARNED sunt permise de tabelul 187. Nu are provocare dedicată în 188, care acoperă doar chei V2. |
| 3 | `speed_delta_arterial` | — (fără provocare) | -10 → 20 m/s: 3.9 → 30 (Δ 26.1) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 4 | `curve_lateral_accel` | — (politică V1) | M păstrat: 046 each of four parameters individually changes target in an unsaturated isolated scenario | DA | Livrată în bucla V1 prin politica M; estimarea și LEARNED sunt permise de tabelul 187. Nu are provocare dedicată în 188, care acoperă doar chei V2. |
| 5 | `intersection_approach_speed` | — (politică V1) | M păstrat: 046 each of four parameters individually changes target in an unsaturated isolated scenario | DA | Livrată în bucla V1 prin politica M; estimarea și LEARNED sunt permise de tabelul 187. Nu are provocare dedicată în 188, care acoperă doar chei V2. |
| 6 | `cruise_speed_variability` | — (fără provocare) | 0.3 → 3 m/s: 0.568843 → 5.944266 (Δ 5.375423) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 7 | `overtake_speed_bonus` | — (fără provocare) | 0 → 2 m/s: 10.9 → 12.9 (Δ 2) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 8 | `cruise_accel_deadband` | — (fără provocare) | 0.05 → 2 m/s: 10.9 → 10.5 (Δ 0.4) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 9 | `desired_acceleration` | — (politică V1) | M păstrat: 047 each of four parameters is individually observable; braking_jerk stays outside this contract | DA | Livrată în bucla V1 prin politica M; estimarea și LEARNED sunt permise de tabelul 187. Nu are provocare dedicată în 188, care acoperă doar chei V2. |
| 10 | `comfort_deceleration` | — (politică V1) | M păstrat: 047 each of four parameters is individually observable; braking_jerk stays outside this contract | DA | Livrată în bucla V1 prin politica M; estimarea și LEARNED sunt permise de tabelul 187. Nu are provocare dedicată în 188, care acoperă doar chei V2. |
| 11 | `acceleration_jerk` | — (politică V1) | M păstrat: 047 each of four parameters is individually observable; braking_jerk stays outside this contract | DA | Livrată în bucla V1 prin politica M; estimarea și LEARNED sunt permise de tabelul 187. Nu are provocare dedicată în 188, care acoperă doar chei V2. |
| 12 | `braking_jerk` | — (fără provocare) | 0.2 → 20 m/s²: 0.026667 → 2 (Δ 1.973333) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 13 | `throttle_release_delay` | — (fără provocare) | 0 → 3 ratio: 0 → 0.4 (Δ 0.4) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 14 | `brake_reaction_delay` | — (politică V1) | M păstrat: 047 each of four parameters is individually observable; braking_jerk stays outside this contract | DA | Livrată în bucla V1 prin politica M; estimarea și LEARNED sunt permise de tabelul 187. Nu are provocare dedicată în 188, care acoperă doar chei V2. |
| 15 | `launch_intensity` | — (fără provocare) | 0 → 1 m/s²: 0.525 → 1.5 (Δ 0.975) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 16 | `coasting_bias` | — (fără provocare) | 0 → 1 m/s²: 0.4 → 0 (Δ 0.4) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 17 | `following_time_headway` | — (politică V1) | M păstrat: 048 all four parameters individually effective, queue gap does not inherit moving minimum | DA | Livrată în bucla V1 prin politica M; estimarea și LEARNED sunt permise de tabelul 187. Nu are provocare dedicată în 188, care acoperă doar chei V2. |
| 18 | `following_min_gap` | — (politică V1) | M păstrat: 048 all four parameters individually effective, queue gap does not inherit moving minimum | DA | Livrată în bucla V1 prin politica M; estimarea și LEARNED sunt permise de tabelul 187. Nu are provocare dedicată în 188, care acoperă doar chei V2. |
| 19 | `queue_standstill_gap` | — (politică V1) | M păstrat: 048 all four parameters individually effective, queue gap does not inherit moving minimum | DA | Livrată în bucla V1 prin politica M; estimarea și LEARNED sunt permise de tabelul 187. Nu are provocare dedicată în 188, care acoperă doar chei V2. |
| 20 | `cutin_brake_response` | — (fără provocare) | 0.2 → 1 m/s: 9.94 → 1.7 (Δ -8.24) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 21 | `following_speed_gain` | — (politică V1) | M păstrat: 048 all four parameters individually effective, queue gap does not inherit moving minimum | DA | Livrată în bucla V1 prin politica M; estimarea și LEARNED sunt permise de tabelul 187. Nu are provocare dedicată în 188, care acoperă doar chei V2. |
| 22 | `closing_ttc_threshold` | — (fără provocare) | 0.3 → 8 m/s: 15.26 → 11.875 (Δ -3.385) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 23 | `leader_change_delay` | — (fără provocare) | 0 → 2 tick: 1 → 121 (Δ 120) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 24 | `following_hysteresis` | — (fără provocare) | 0 → 5 m/s: 30.8 → 0 (Δ -30.8) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 25 | `red_stop_probability` | — (politică V1) | M păstrat: 173 M keys keep their units, their 050 consequences and the yellow probability scaling | DA | Livrată în bucla V1 prin politica M; estimarea și LEARNED sunt permise de tabelul 187. Nu are provocare dedicată în 188, care acoperă doar chei V2. |
| 26 | `yellow_stop_probability` | `v2-challenge-yellow-decision` | 0.2 → 1 ratio: 0.158333 → 1 (Δ 0.841667) | NU | Certificată de 187 și demonstrată de o provocare 188, dar încă rezervată de etapa de plan: `candidate-validation` o refuză cu `KEY_EXTENSION_STAGE`, iar exportul o scrie `null` în `reservedParameters`. Nu este livrabilă end-to-end până la migrarea etapei. |
| 27 | `green_start_delay` | — (politică V1) | M păstrat: 173 M keys keep their units, their 050 consequences and the yellow probability scaling | DA | Livrată în bucla V1 prin politica M; estimarea și LEARNED sunt permise de tabelul 187. Nu are provocare dedicată în 188, care acoperă doar chei V2. |
| 28 | `red_stop_line_offset` | — (politică V1) | M păstrat: 173 M keys keep their units, their 050 consequences and the yellow probability scaling | DA | Livrată în bucla V1 prin politica M; estimarea și LEARNED sunt permise de tabelul 187. Nu are provocare dedicată în 188, care acoperă doar chei V2. |
| 29 | `red_run_gap_acceptance` | `v2-challenge-red-gap` | 0.1 → 8 ratio: 1 → 0 (Δ -1) | NU | Certificată de 187 și demonstrată de o provocare 188, dar încă rezervată de etapa de plan: `candidate-validation` o refuză cu `KEY_EXTENSION_STAGE`, iar exportul o scrie `null` în `reservedParameters`. Nu este livrabilă end-to-end până la migrarea etapei. |
| 30 | `yellow_commit_time` | — (fără provocare) | 0.2 → 6 ratio: 0 → 1 (Δ 1) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 31 | `green_launch_acceleration` | `v2-challenge-green-launch` | 0.2 → 6 m/s²: 0.2 → 6 (Δ 5.8) | NU | Certificată de 187 și demonstrată de o provocare 188, dar încă rezervată de etapa de plan: `candidate-validation` o refuză cu `KEY_EXTENSION_STAGE`, iar exportul o scrie `null` în `reservedParameters`. Nu este livrabilă end-to-end până la migrarea etapei. |
| 32 | `late_red_brake_threshold` | — (politică V1) | M păstrat: 173 M keys keep their units, their 050 consequences and the yellow probability scaling | DA | Livrată în bucla V1 prin politica M; estimarea și LEARNED sunt permise de tabelul 187. Nu are provocare dedicată în 188, care acoperă doar chei V2. |
| 33 | `stop_full_probability` | — (politică V1) | M păstrat: 175 M keys keep their units and their 051/052 consequences with neutral and active R keys | DA | Livrată în bucla V1 prin politica M; estimarea și LEARNED sunt permise de tabelul 187. Nu are provocare dedicată în 188, care acoperă doar chei V2. |
| 34 | `stop_dwell_time` | — (politică V1) | M păstrat: 175 M keys keep their units and their 051/052 consequences with neutral and active R keys | DA | Livrată în bucla V1 prin politica M; estimarea și LEARNED sunt permise de tabelul 187. Nu are provocare dedicată în 188, care acoperă doar chei V2. |
| 35 | `stop_line_offset` | — (politică V1) | M păstrat: 175 M keys keep their units and their 051/052 consequences with neutral and active R keys | DA | Livrată în bucla V1 prin politica M; estimarea și LEARNED sunt permise de tabelul 187. Nu are provocare dedicată în 188, care acoperă doar chei V2. |
| 36 | `yield_time_gap` | — (politică V1) | M păstrat: 175 M keys keep their units and their 051/052 consequences with neutral and active R keys | DA | Livrată în bucla V1 prin politica M; estimarea și LEARNED sunt permise de tabelul 187. Nu are provocare dedicată în 188, care acoperă doar chei V2. |
| 37 | `rolling_stop_speed` | — (fără provocare) | 0.2 → 5 m/s: 0.2 → 2.5 (Δ 2.3) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 38 | `priority_assertiveness` | — (fără provocare) | 0 → 1 ratio: 0 → 1 (Δ 1) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 39 | `allway_stop_patience` | — (fără provocare) | 0 → 10 ratio: 1 → 0 (Δ -1) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 40 | `blocked_intersection_entry_probability` | — (fără provocare) | 0 → 1 ratio: 0 → 1 (Δ 1) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 41 | `lane_change_front_gap` | — (politică V1) | M păstrat: 177 keeps the delivered 053 results with the four M keys unchanged | DA | Livrată în bucla V1 prin politica M; estimarea și LEARNED sunt permise de tabelul 187. Nu are provocare dedicată în 188, care acoperă doar chei V2. |
| 42 | `lane_change_back_gap` | — (politică V1) | M păstrat: 177 keeps the delivered 053 results with the four M keys unchanged | DA | Livrată în bucla V1 prin politica M; estimarea și LEARNED sunt permise de tabelul 187. Nu are provocare dedicată în 188, care acoperă doar chei V2. |
| 43 | `lane_change_speed_gain` | — (politică V1) | M păstrat: 177 keeps the delivered 053 results with the four M keys unchanged | DA | Livrată în bucla V1 prin politica M; estimarea și LEARNED sunt permise de tabelul 187. Nu are provocare dedicată în 188, care acoperă doar chei V2. |
| 44 | `lane_change_cooldown` | — (politică V1) | M păstrat: 177 keeps the delivered 053 results with the four M keys unchanged | DA | Livrată în bucla V1 prin politica M; estimarea și LEARNED sunt permise de tabelul 187. Nu are provocare dedicată în 188, care acoperă doar chei V2. |
| 45 | `lane_change_duration` | — (fără provocare) | 0.5 → 5 ratio: 0.5 → 0.1 (Δ -0.4) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 46 | `signal_lead_time` | — (fără provocare) | 0 → 5 ticks: 0 → 300 (Δ 300) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 47 | `signal_use_probability` | — (fără provocare) | 0 → 1 ratio: 0 → 1 (Δ 1) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 48 | `pass_on_right_probability` | — (fără provocare) | 0 → 1 ratio: 0 → 1 (Δ 1) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 49 | `lane_center_offset` | — (fără provocare) | -1 → 1 m: -0.9 → 0.9 (Δ 1.8) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 50 | `steering_response_time` | — (fără provocare) | 0.05 → 1.5 ticks: 3 → 90 (Δ 87) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 51 | `steering_rate_limit` | — (fără provocare) | 0.1 → 4 rad: 0.001667 → 0.025 (Δ 0.023333) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 52 | `turn_entry_speed` | — (fără provocare) | 1 → 18 m/s: 1 → 6.268769 (Δ 5.268769) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 53 | `turn_exit_acceleration` | — (fără provocare) | 0.2 → 6 m/s²: 0.2 → 1.5 (Δ 1.3) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 54 | `corner_cutting_bias` | — (fără provocare) | 0 → 1 m: 0 → 0.9 (Δ 0.9) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 55 | `lateral_clearance` | — (fără provocare) | 0.1 → 3 ratio: 1 → 0 (Δ -1) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 56 | `lateral_correction_deadband` | — (fără provocare) | 0 → 0.6 ratio: 1 → 0 (Δ -1) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 57 | `route_time_weight` | — (fără provocare) | 0 → 1 s: 113.29523 → 60.655781 (Δ -52.639449) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 58 | `route_distance_weight` | — (fără provocare) | 0 → 1 m: 1094.427191 → 666.476152 (Δ -427.951039) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 59 | `route_turn_penalty` | — (fără provocare) | 0 → 20 viraje: 4 → 1 (Δ -3) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 60 | `route_signal_penalty` | — (fără provocare) | 0 → 60 semafoare: 3 → 0 (Δ -3) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 61 | `route_congestion_penalty` | — (fără provocare) | 0 → 2 s: 20 → 0 (Δ -20) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 62 | `reroute_patience` | `v2-challenge-reroute-patience` | 2 → 120 ticks: 60 → 7140 (Δ 7080) | NU | Certificată de 187 și demonstrată de o provocare 188, dar încă rezervată de etapa de plan: `candidate-validation` o refuză cu `KEY_EXTENSION_STAGE`, iar exportul o scrie `null` în `reservedParameters`. Nu este livrabilă end-to-end până la migrarea etapei. |
| 63 | `u_turn_willingness` | `v2-challenge-u-turn-discipline` | 0 → 1 s: 66.055513 → 40.048766 (Δ -26.006746) | NU | Certificată de 187 și demonstrată de o provocare 188, dar încă rezervată de etapa de plan: `candidate-validation` o refuză cu `KEY_EXTENSION_STAGE`, iar exportul o scrie `null` în `reservedParameters`. Nu este livrabilă end-to-end până la migrarea etapei. |
| 64 | `reverse_recovery_duration` | `v2-challenge-reverse-recovery` | 0 → 8 s: 2.5 → 8 (Δ 5.5) | NU | Certificată de 187 și demonstrată de o provocare 188, dar încă rezervată de etapa de plan: `candidate-validation` o refuză cu `KEY_EXTENSION_STAGE`, iar exportul o scrie `null` în `reservedParameters`. Nu este livrabilă end-to-end până la migrarea etapei. |
| 65 | `pedestrian_yield_probability` | `v2-challenge-pedestrian-yield` | 0 → 1 decizie: 0 → 1 (Δ 1) | NU | Certificată de 187 și demonstrată de o provocare 188, dar încă rezervată de etapa de plan: `candidate-validation` o refuză cu `KEY_EXTENSION_STAGE`, iar exportul o scrie `null` în `reservedParameters`. Nu este livrabilă end-to-end până la migrarea etapei. |
| 66 | `pedestrian_clearance` | `v2-challenge-pedestrian-clearance` | 0.1 → 6 m/s: 6.228965 → 4.898979 (Δ -1.329985) | NU | Certificată de 187 și demonstrată de o provocare 188, dar încă rezervată de etapa de plan: `candidate-validation` o refuză cu `KEY_EXTENSION_STAGE`, iar exportul o scrie `null` în `reservedParameters`. Nu este livrabilă end-to-end până la migrarea etapei. |
| 67 | `hazard_reaction_delay` | `v2-challenge-hazard-reaction` | 0 → 3 m: 28 → 4 (Δ -24) | NU | Certificată de 187 și demonstrată de o provocare 188, dar încă rezervată de etapa de plan: `candidate-validation` o refuză cu `KEY_EXTENSION_STAGE`, iar exportul o scrie `null` în `reservedParameters`. Nu este livrabilă end-to-end până la migrarea etapei. |
| 68 | `obstacle_clearance` | `v2-challenge-obstacle-clearance` | 0.1 → 4 m/s: 6.324555 → 5.549775 (Δ -0.774781) | NU | Certificată de 187 și demonstrată de o provocare 188, dar încă rezervată de etapa de plan: `candidate-validation` o refuză cu `KEY_EXTENSION_STAGE`, iar exportul o scrie `null` în `reservedParameters`. Nu este livrabilă end-to-end până la migrarea etapei. |
| 69 | `emergency_brake_intensity` | `v2-challenge-emergency-brake` | 0 → 1 m/s²: 0 → 8 (Δ 8) | NU | Certificată de 187 și demonstrată de o provocare 188, dar încă rezervată de etapa de plan: `candidate-validation` o refuză cu `KEY_EXTENSION_STAGE`, iar exportul o scrie `null` în `reservedParameters`. Nu este livrabilă end-to-end până la migrarea etapei. |
| 70 | `evasive_steer_willingness` | — (fără provocare) | 0 → 1 m: 0 → 0.45 (Δ 0.45) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 71 | `crosswalk_approach_speed` | `v2-challenge-crosswalk-approach` | 0.5 → 15 m/s: 0.5 → 15 (Δ 14.5) | NU | Certificată de 187 și demonstrată de o provocare 188, dar încă rezervată de etapa de plan: `candidate-validation` o refuză cu `KEY_EXTENSION_STAGE`, iar exportul o scrie `null` în `reservedParameters`. Nu este livrabilă end-to-end până la migrarea etapei. |
| 72 | `horn_use_probability` | — (fără provocare) | 0 → 1 decizie: 0 → 1 (Δ 1) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 73 | `pickup_approach_speed` | — (fără provocare) | 0.5 → 8 m/s: 0.5 → 5.567764 (Δ 5.067764) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 74 | `pickup_curb_distance` | — (fără provocare) | 0.1 → 2 m: 0.15 → 1.2 (Δ 1.05) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 75 | `pickup_stop_precision` | `v2-challenge-pickup-precision` | 0.2 → 5 m: 0.2 → 2.75 (Δ 2.55) | NU | Certificată de 187 și demonstrată de o provocare 188, dar încă rezervată de etapa de plan: `candidate-validation` o refuză cu `KEY_EXTENSION_STAGE`, iar exportul o scrie `null` în `reservedParameters`. Nu este livrabilă end-to-end până la migrarea etapei. |
| 76 | `pickup_dwell_time` | `v2-challenge-pickup-dwell` | 1 → 10 s: 3 → 10 (Δ 7) | NU | Certificată de 187 și demonstrată de o provocare 188, dar încă rezervată de etapa de plan: `candidate-validation` o refuză cu `KEY_EXTENSION_STAGE`, iar exportul o scrie `null` în `reservedParameters`. Nu este livrabilă end-to-end până la migrarea etapei. |
| 77 | `dropoff_approach_speed` | — (fără provocare) | 0.5 → 8 m/s: 0.5 → 5.567764 (Δ 5.067764) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 78 | `dropoff_curb_distance` | `v2-challenge-dropoff-curb` | 0.1 → 2 m: 0.15 → 1.2 (Δ 1.05) | NU | Certificată de 187 și demonstrată de o provocare 188, dar încă rezervată de etapa de plan: `candidate-validation` o refuză cu `KEY_EXTENSION_STAGE`, iar exportul o scrie `null` în `reservedParameters`. Nu este livrabilă end-to-end până la migrarea etapei. |
| 79 | `occupied_acceleration_scale` | — (fără provocare) | 0.3 → 1.5 m/s²: 0.45 → 2 (Δ 1.55) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |
| 80 | `occupied_lateral_accel_scale` | — (fără provocare) | 0.3 → 1.5 m/s²: 0.75 → 2.5 (Δ 1.75) | NU | Certificată de 187, dar fără provocare dedicată în 188 și încă rezervată de etapa de plan (`KEY_EXTENSION_STAGE`, `reservedParameters`). Nu este livrabilă end-to-end. |

## Demonstrația transferului stilului extins

Pentru fiecare dintre cele 10 familii V2, valoarea candidată vine din estimatorul familiei (raportul de învățare), efectul vine din politica familiei (raportul de politică), iar transferul către flotă se oprește la etapa de plan: **10/10 familii demonstrate până la politică, 10 blocate înainte de flotă**.

| Familie | Cheie | Valoare candidată | Validare | Efect măsurat în politică | Provocare 188 | Transfer către flotă |
| --- | --- | --- | --- | --- | --- | --- |
| Viteză și ritm | `speed_delta_arterial` | `4.075 m/s` (CANDIDATE) | VALIDATED | -10 → 20 m/s: 3.9 → 30 (Δ 26.1) | — | BLOCAT (`KEY_EXTENSION_STAGE`) |
| Accelerație și frânare | `braking_jerk` | `3 m/s³` (CANDIDATE) | VALIDATED | 0.2 → 20 m/s²: 0.026667 → 2 (Δ 1.973333) | — | BLOCAT (`KEY_EXTENSION_STAGE`) |
| Urmărire și distanțe | `cutin_brake_response` | `0.7 ratio` (CANDIDATE) | VALIDATED | 0.2 → 1 m/s: 9.94 → 1.7 (Δ -8.24) | — | BLOCAT (`KEY_EXTENSION_STAGE`) |
| Semafoare | `yellow_stop_probability` | `0.8875 probability` (CANDIDATE) | VALIDATED | 0.2 → 1 ratio: 0.158333 → 1 (Δ 0.841667) | `v2-challenge-yellow-decision` | BLOCAT (`KEY_EXTENSION_STAGE`) |
| STOP și prioritate | `rolling_stop_speed` | `1.2 m/s` (CANDIDATE) | VALIDATED | 0.2 → 5 m/s: 0.2 → 2.5 (Δ 2.3) | — | BLOCAT (`KEY_EXTENSION_STAGE`) |
| Schimbare de bandă și depășire | `lane_change_duration` | `1.991667 s` (CANDIDATE) | VALIDATED | 0.5 → 5 ratio: 0.5 → 0.1 (Δ -0.4) | — | BLOCAT (`KEY_EXTENSION_STAGE`) |
| Control lateral și viraje | `turn_entry_speed` | `3.5 m/s` (CANDIDATE) | VALIDATED | 1 → 18 m/s: 1 → 6.268769 (Δ 5.268769) | — | BLOCAT (`KEY_EXTENSION_STAGE`) |
| Trasee și recuperare | `route_time_weight` | `0.072436 weight` (CANDIDATE) | VALIDATED | 0 → 1 s: 113.29523 → 60.655781 (Δ -52.639449) | — | BLOCAT (`KEY_EXTENSION_STAGE`) |
| Pietoni și pericole | `pedestrian_yield_probability` | `0.5 probability` (CANDIDATE) | VALIDATED | 0 → 1 decizie: 0 → 1 (Δ 1) | `v2-challenge-pedestrian-yield` | BLOCAT (`KEY_EXTENSION_STAGE`) |
| Pickup și confortul pasagerilor | `pickup_stop_precision` | `1 m` (CANDIDATE) | VALIDATED | 0.2 → 5 m: 0.2 → 2.75 (Δ 2.55) | `v2-challenge-pickup-precision` | BLOCAT (`KEY_EXTENSION_STAGE`) |

## Verificările artefactului

| Verificare | Rezultat | Detaliu |
| --- | --- | --- |
| `catalog-shape` | PASS | 80 definiții, 24 ținte M, 56 chei de extensie |
| `gate-verdict` | PASS | poarta 187: 80/80 chei, 0 findings, verdict PASS |
| `artifact-rows` | PASS | 80 de rânduri, în ordinea catalogului, fără duplicate |
| `policy-and-estimator` | PASS | 80 politici, 80 estimatori, 0 NONE |
| `reservation` | PASS | 56 chei V2 rezervate (`reservedParameterKeys`), 24 chei CORE utilizabile |
| `challenge-coverage` | PASS | 15 chei livrate prin provocările 188, 41 neacoperite |
| `conventions` | PASS | 8 convenții canonice, fiecare cu cel puțin o cheie |
| `style-transfer` | PASS | 10/10 familii cu valoare candidată estimată și efect măsurat în politică; transferul către flotă este blocat de etapa de plan |
| `compatibility-evidence` | PASS | 14/14 afirmații cu dovadă existentă și literal verificat |
| `dependencies-done` | PASS | 27/27 PBI-uri 163–189 în Done, cu dovezi fără placeholder |
| `evidence-files` | PASS | directorul de dovezi al release-ului există |

## Cheile rezervate

56 chei `extension`, în ordinea catalogului:

- `speed_delta_arterial`
- `cruise_speed_variability`
- `overtake_speed_bonus`
- `cruise_accel_deadband`
- `braking_jerk`
- `throttle_release_delay`
- `launch_intensity`
- `coasting_bias`
- `cutin_brake_response`
- `closing_ttc_threshold`
- `leader_change_delay`
- `following_hysteresis`
- `yellow_stop_probability`
- `red_run_gap_acceptance`
- `yellow_commit_time`
- `green_launch_acceleration`
- `rolling_stop_speed`
- `priority_assertiveness`
- `allway_stop_patience`
- `blocked_intersection_entry_probability`
- `lane_change_duration`
- `signal_lead_time`
- `signal_use_probability`
- `pass_on_right_probability`
- `lane_center_offset`
- `steering_response_time`
- `steering_rate_limit`
- `turn_entry_speed`
- `turn_exit_acceleration`
- `corner_cutting_bias`
- `lateral_clearance`
- `lateral_correction_deadband`
- `route_time_weight`
- `route_distance_weight`
- `route_turn_penalty`
- `route_signal_penalty`
- `route_congestion_penalty`
- `reroute_patience`
- `u_turn_willingness`
- `reverse_recovery_duration`
- `pedestrian_yield_probability`
- `pedestrian_clearance`
- `hazard_reaction_delay`
- `obstacle_clearance`
- `emergency_brake_intensity`
- `evasive_steer_willingness`
- `crosswalk_approach_speed`
- `horn_use_probability`
- `pickup_approach_speed`
- `pickup_curb_distance`
- `pickup_stop_precision`
- `pickup_dwell_time`
- `dropoff_approach_speed`
- `dropoff_curb_distance`
- `occupied_acceleration_scale`
- `occupied_lateral_accel_scale`

## Comenzi

```bash
npm run release:v2
npm run release:v2 -- --check
npm run validate:parameters -- --check
```
