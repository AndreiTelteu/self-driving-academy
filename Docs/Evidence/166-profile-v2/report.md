# 166 — scheme și suport V2 pentru profile

Transcript determinist generat de `tests/profiles/profile-v2-suite.ts`; comanda comisă este `npm run profile:v2`.
Machine-readable: [report.json](report.json).

Regula oracolului: fiecare valoare provine din documentul V1 de fixture sau din catalogul 092;
niciun rând `DEFAULT`/`UNSET` nu are dovezi, încredere sau estimări.

## Sumar

| Indicator | Valoare |
| --- | ---: |
| Verificări | **15/15** |
| Chei în schemă | **80** (24 V1 + 56 R) |
| Chei setate de jucător | **5** |
| Chei moștenite din V1 | **4** |
| Chei default | **71** |
| Chei nesetate | **0** |
| Checksum V2 | `fnv1a64:ec54f338b21766a2` |
| Checksum V1 păstrat la rollback | `fixture:academy-style-v7` |
| Amprenta SHA-256 a raportului | `2eb61ea13463972d359f165539cc0e4adc7b3ebe6e941087216d1f09c884c455` |
| Verdict | **PASS** |

## Verificări

| Verificare | Rezultat | Ce dovedește | Detaliu |
| --- | --- | --- | --- |
| `CATALOG_80_24_56` | PASS | Catalogul 092 are 80 de chei: 24 V1 și 56 R, fără suprapunere. | 80 chei, 24 V1, 56 R |
| `MIGRATION_ACCEPTED` | PASS | Un profil V1 real este migrat explicit, cu schema 2 și catalogul curent. | schema 2, catalog 092-catalog-1@2026-10-04 |
| `V1_VALUES_PRESERVED` | PASS | Toate cheile V1 existente păstrează valoarea, unitatea și proveniența. | 9 chei verificate, 0 diferențe |
| `NEW_KEYS_DEFAULTED` | PASS | Cele 56 de chei R primesc defaultul din catalogul 092, nu o estimare. | 71 chei DEFAULT, 56 dintre ele R |
| `DEFAULTS_ARE_NOT_ESTIMATES` | PASS | Nicio valoare default nu are dovezi sau încredere fabricată. | toate rândurile DEFAULT au evidenceCount 0 și quality 0 |
| `UI_DECLARES_ALL_KEYS` | PASS | Proiecția pentru UI declară originea, sursa, suportul și dovezile fiecărei chei. | 80 rânduri, fiecare cu origine, suport, sursă de dovezi și motiv |
| `ROLLBACK_EXACT` | PASS | Rollback-ul întoarce exact profilul V1, cu checksum-ul lui. | 9 chei, checksum fixture:academy-style-v7 |
| `DETERMINISTIC` | PASS | Două migrări ale aceleiași intrări produc același checksum. | fnv1a64:ec54f338b21766a2 / fnv1a64:ec54f338b21766a2 |
| `SCHEMA_TOO_NEW_REFUSED` | PASS | O schemă mai nouă este refuzată explicit, nu interpretată. | SCHEMA_TOO_NEW |
| `CATALOG_TOO_NEW_REFUSED` | PASS | Un catalog mai nou este refuzat explicit. | CATALOG_TOO_NEW |
| `INVALID_ENTRY_REFUSED` | PASS | Un document V2 incomplet este refuzat. | INVALID_PROFILE |
| `RESERVED_KEY_IN_V1_REFUSED` | PASS | O cheie R într-un profil V1 este refuzată explicit. | RESERVED_KEY_IN_V1 |
| `CHECKSUM_MISMATCH_REFUSED` | PASS | Un document V2 modificat este refuzat la checksum. | CHECKSUM_MISMATCH |
| `UNSET_POLICY` | PASS | Politica UNSET lasă cele 56 de chei R nesetate, cu motiv, fără valoare. | 56 chei UNSET, 24 parametri purtați |
| `POST_MIGRATION_EDIT_NOT_REPRESENTABLE` | PASS | O valoare V2 reglată după migrare nu este pierdută tacit la rollback. | MIGRATION_NOT_REPRESENTABLE |

## Refuzuri explicite

| Caz | Cod |
| --- | --- |
| Schemă mai nouă | `SCHEMA_TOO_NEW` |
| Catalog mai nou | `CATALOG_TOO_NEW` |
| Intrare V2 invalidă | `INVALID_PROFILE` |
| Cheie R într-un profil V1 | `RESERVED_KEY_IN_V1` |
| Checksum modificat | `CHECKSUM_MISMATCH` |
| Reglaj V2 după migrare, la rollback | `MIGRATION_NOT_REPRESENTABLE` |

## Tabel cheie → sursă → valoare

| Cheie | Stadiu | Origine | Sursă | Suport | Dovezi | Valoare | Dovezi efective |
| --- | --- | --- | --- | --- | --- | ---: | ---: |
| `speed_delta_urban` | V1 | PLAYER_SET | v1:MANUAL_TUNING | SUPPORTED | V1_PROVENANCE | 1.5 | 0 |
| `speed_delta_residential` | V1 | INHERITED_V1 | v1:BASE | SUPPORTED | V1_PROVENANCE | 0.4 | 0 |
| `speed_delta_arterial` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0 | 0 |
| `curve_lateral_accel` | V1 | PLAYER_SET | v1:IMPORTED | SUPPORTED | V1_PROVENANCE | 3.1 | 0 |
| `intersection_approach_speed` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 6 | 0 |
| `cruise_speed_variability` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.3 | 0 |
| `overtake_speed_bonus` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 2 | 0 |
| `cruise_accel_deadband` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.3 | 0 |
| `desired_acceleration` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 1.5 | 0 |
| `comfort_deceleration` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 2 | 0 |
| `acceleration_jerk` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 2 | 0 |
| `braking_jerk` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 3 | 0 |
| `throttle_release_delay` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.2 | 0 |
| `brake_reaction_delay` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 0.5 | 0 |
| `launch_intensity` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.6 | 0 |
| `coasting_bias` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.4 | 0 |
| `following_time_headway` | V1 | PLAYER_SET | v1:MANUAL_TUNING | SUPPORTED | PROFILE_EVIDENCE | 2.1 | 6 |
| `following_min_gap` | V1 | INHERITED_V1 | v1:BASE | SUPPORTED | V1_PROVENANCE | 2.6 | 0 |
| `queue_standstill_gap` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 2 | 0 |
| `cutin_brake_response` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.7 | 0 |
| `following_speed_gain` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 0.7 | 0 |
| `closing_ttc_threshold` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 3 | 0 |
| `leader_change_delay` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.2 | 0 |
| `following_hysteresis` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 1 | 0 |
| `red_stop_probability` | V1 | PLAYER_SET | v1:MANUAL_TUNING | SUPPORTED | V1_PROVENANCE | 1 | 0 |
| `yellow_stop_probability` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.8 | 0 |
| `green_start_delay` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 0.7 | 0 |
| `red_stop_line_offset` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 1 | 0 |
| `red_run_gap_acceptance` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 2.5 | 0 |
| `yellow_commit_time` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 2 | 0 |
| `green_launch_acceleration` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 1.5 | 0 |
| `late_red_brake_threshold` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 2 | 0 |
| `stop_full_probability` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 1 | 0 |
| `stop_dwell_time` | V1 | INHERITED_V1 | v1:BASE | SUPPORTED | V1_PROVENANCE | 1.9 | 0 |
| `stop_line_offset` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 1 | 0 |
| `yield_time_gap` | V1 | INHERITED_V1 | v1:BASE | SUPPORTED | V1_PROVENANCE | 4 | 0 |
| `rolling_stop_speed` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 1 | 0 |
| `priority_assertiveness` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.3 | 0 |
| `allway_stop_patience` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 2 | 0 |
| `blocked_intersection_entry_probability` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0 | 0 |
| `lane_change_front_gap` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 12 | 0 |
| `lane_change_back_gap` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 10 | 0 |
| `lane_change_speed_gain` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 2 | 0 |
| `lane_change_cooldown` | V1 | PLAYER_SET | v1:MANUAL_TUNING | SUPPORTED | V1_PROVENANCE | 3.2 | 0 |
| `lane_change_duration` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 2 | 0 |
| `signal_lead_time` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 1 | 0 |
| `signal_use_probability` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 1 | 0 |
| `pass_on_right_probability` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0 | 0 |
| `lane_center_offset` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0 | 0 |
| `steering_response_time` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.3 | 0 |
| `steering_rate_limit` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 1 | 0 |
| `turn_entry_speed` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 5 | 0 |
| `turn_exit_acceleration` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 1.5 | 0 |
| `corner_cutting_bias` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0 | 0 |
| `lateral_clearance` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.8 | 0 |
| `lateral_correction_deadband` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.1 | 0 |
| `route_time_weight` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.6 | 0 |
| `route_distance_weight` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.3 | 0 |
| `route_turn_penalty` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 2 | 0 |
| `route_signal_penalty` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 5 | 0 |
| `route_congestion_penalty` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.5 | 0 |
| `reroute_patience` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 20 | 0 |
| `u_turn_willingness` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0 | 0 |
| `reverse_recovery_duration` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 2 | 0 |
| `pedestrian_yield_probability` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 1 | 0 |
| `pedestrian_clearance` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 2 | 0 |
| `hazard_reaction_delay` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.5 | 0 |
| `obstacle_clearance` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 1 | 0 |
| `emergency_brake_intensity` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 1 | 0 |
| `evasive_steer_willingness` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.3 | 0 |
| `crosswalk_approach_speed` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 5 | 0 |
| `horn_use_probability` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.1 | 0 |
| `pickup_approach_speed` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 3 | 0 |
| `pickup_curb_distance` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.5 | 0 |
| `pickup_stop_precision` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 1 | 0 |
| `pickup_dwell_time` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 3 | 0 |
| `dropoff_approach_speed` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 3 | 0 |
| `dropoff_curb_distance` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.5 | 0 |
| `occupied_acceleration_scale` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.85 | 0 |
| `occupied_lateral_accel_scale` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.85 | 0 |

## Limitări

- Niciun controler nu consumă încă valorile R: proiecția declară RESERVED, iar 092 rămâne fail-closed.
- Catalogul livrat nu are nicio cheie estimabilă, deci un profil V1 real nu poate conține LEARNED; ramura LEARNED a migrării este acoperită doar structural.
- Documentul V2 este un read model derivat; persistarea lui într-un rând 127 nou nu este cerută de criterii și nu a fost adăugată.
