# Acoperirea funcționalităților prin PBI

Versiune 0.5 · 4 octombrie 2026. Parte din [planul complet](README.md).

## Module și intervale de task-uri

ID-urile rămân stabile la mutarea între coloane. Găsește task-ul prin prefixul numeric în PBI; folderul lui este statusul curent. Indexul de mai jos nu copiază statusuri care ar putea deveni depășite.

| Funcționalitate | PBI de început și final | Plan |
| --- | --- | --- |
| Engine Babylon et lifecycle | 011 → 020 | [Document](03-babylon-engine.md) |
| Fizică realistă și clase | 021 → 031 | [Document](05-vehicule-si-fizica.md) |
| Oraș benzi și rutare | 032 → 043 | [Document](04-oras-si-retea-rutiera.md) |
| Autonomie și greșeli | 045 → 056 | [Document](06-autonomie-si-trafic.md) |
| Flotă și curse | 057 → 065 | [Document](07-flota-si-curse.md) |
| Orice mașină și hotkey | 066 → 072 | [Document](08-interfata-camera-si-control.md) |
| HUD flotă și accesibilitate | 073 → 084 | [Document](08-interfata-camera-si-control.md) |
| Demonstrații și oportunități | 085 → 091 | [Document](09-telemetrie-si-oportunitati.md) |
| Învățarea inițială | 092 → 108 | [Document](10-invatarea-stilului.md) |
| Profil comun și activare | 109 → 115 | [Document](12-profiluri-si-propagare.md) |
| Misiuni și campanie | 116 → 126 | [Document](13-misiuni-si-progres.md) |
| Salvare și export | 127 → 136 | [Document](15-salvare-si-import-export.md) |
| Statistici și comparații | 137 → 144 | [Document](14-experimente-si-indicatori.md) |
| Asseturi și audio | 145 → 150 | [Document](16-asseturi-vizual-si-audio.md) |
| QA performanță și V1 | 151 → 162 | [Document](18-validare-si-release.md) |
| Întregul catalog și V2 | 163 → 190 | [Document](20-extensii-si-mers-pe-jos.md) |
| Personaj și V3 | 191 → 202 | [Document](20-extensii-si-mers-pe-jos.md) |
| Hardware și prototip timpuriu | 203, 204 | [Document](24-milestone-timpuriu-si-contracte.md) |
| Barieră learning, checkpoint și recorder | 205, 206, 207 | [Document](15-salvare-si-import-export.md) |
| Stil comun pentru civili | 208 | [Document](12-profiluri-si-propagare.md) |
| Economie, reviews și grafice KPIs | 209, 210 | [Document](22-kpi-economie-si-review-uri.md) |
| Trei misiuni zilnice, credite XP și feedback fără pierderi | 211, 212, 213, 214 | [Document](23-misiuni-zilnice-si-experienta.md) |
| Salvare și QA ale reviziei V1 | 215, 216 | [Document](18-validare-si-release.md) |
| AUTO/MANUAL/LEARNING integrate | 217 | [Document](08-interfata-camera-si-control.md) |
| Harness, scheduler și gate timpuriu de flotă | 218, 219, 220 | [Document](25-performanta-contracte-si-benchmark.md) |
| Bugete workers, date și randare/asseturi | 221, 222, 223 | [Document](25-performanta-contracte-si-benchmark.md) |
| Gate CI și soak de performanță | 224 | [Document](25-performanta-contracte-si-benchmark.md) |
| Academie/Haos și recuperarea lumii | 225, 226 | [Document](26-joaca-libera-haos-si-distrugere.md) |
| Decor destructibil, sunet, efecte și replay | 227, 228 | [Document](26-joaca-libera-haos-si-distrugere.md) |
| Slidere de control și stil | 229, 230 | [Document](27-reglaje-hud-si-camera.md) |
| Cameră first-person și HUD simplu | 017, 073, 079, 081 | [Document](27-reglaje-hud-si-camera.md) |
| Catalog/director/UI provocări random | 231, 232, 233 | [Document](28-provocari-random-si-revenire.md) |
| Savefile complet cu checksum | 234 | [Document](29-savefile-si-integritate.md) |
| Regresii experiență și playtest | 235 | [Document](18-validare-si-release.md) |

## Acoperirea celor 80 de parametri

Fiecare cheie are un PBI de folosire în politică și unul de estimare. Gate-ul V1 verifică cele 24 M; gate-ul V2 verifică toate cele 80. Gruparea într-un PBI nu permite omiterea unei chei: criteriile și dovezile trebuie îndeplinite pentru fiecare.

| Cheie | Etapă | Politică | Estimare | Gate |
| --- | --- | --- | --- | --- |
| speed_delta_urban | V1 | 046 | 094 | 108 |
| speed_delta_residential | V1 | 046 | 094 | 108 |
| speed_delta_arterial | V2 | 167 | 168 | 187 |
| curve_lateral_accel | V1 | 046 | 094 | 108 |
| intersection_approach_speed | V1 | 046 | 094 | 108 |
| cruise_speed_variability | V2 | 167 | 168 | 187 |
| overtake_speed_bonus | V2 | 167 | 168 | 187 |
| cruise_accel_deadband | V2 | 167 | 168 | 187 |
| desired_acceleration | V1 | 047 | 095 | 108 |
| comfort_deceleration | V1 | 047 | 095 | 108 |
| acceleration_jerk | V1 | 047 | 095 | 108 |
| braking_jerk | V2 | 169 | 170 | 187 |
| throttle_release_delay | V2 | 169 | 170 | 187 |
| brake_reaction_delay | V1 | 047 | 095 | 108 |
| launch_intensity | V2 | 169 | 170 | 187 |
| coasting_bias | V2 | 169 | 170 | 187 |
| following_time_headway | V1 | 048 | 096 | 108 |
| following_min_gap | V1 | 048 | 096 | 108 |
| queue_standstill_gap | V1 | 048 | 096 | 108 |
| cutin_brake_response | V2 | 171 | 172 | 187 |
| following_speed_gain | V1 | 048 | 096 | 108 |
| closing_ttc_threshold | V2 | 171 | 172 | 187 |
| leader_change_delay | V2 | 171 | 172 | 187 |
| following_hysteresis | V2 | 171 | 172 | 187 |
| red_stop_probability | V1 | 050 | 097 | 108 |
| yellow_stop_probability | V2 | 173 | 174 | 187 |
| green_start_delay | V1 | 050 | 097 | 108 |
| red_stop_line_offset | V1 | 050 | 097 | 108 |
| red_run_gap_acceptance | V2 | 173 | 174 | 187 |
| yellow_commit_time | V2 | 173 | 174 | 187 |
| green_launch_acceleration | V2 | 173 | 174 | 187 |
| late_red_brake_threshold | V1 | 050 | 097 | 108 |
| stop_full_probability | V1 | 051 | 098 | 108 |
| stop_dwell_time | V1 | 051 | 098 | 108 |
| stop_line_offset | V1 | 051 | 098 | 108 |
| yield_time_gap | V1 | 052 | 098 | 108 |
| rolling_stop_speed | V2 | 175 | 176 | 187 |
| priority_assertiveness | V2 | 175 | 176 | 187 |
| allway_stop_patience | V2 | 175 | 176 | 187 |
| blocked_intersection_entry_probability | V2 | 175 | 176 | 187 |
| lane_change_front_gap | V1 | 053 | 099 | 108 |
| lane_change_back_gap | V1 | 053 | 099 | 108 |
| lane_change_speed_gain | V1 | 053 | 099 | 108 |
| lane_change_cooldown | V1 | 053 | 099 | 108 |
| lane_change_duration | V2 | 177 | 178 | 187 |
| signal_lead_time | V2 | 177 | 178 | 187 |
| signal_use_probability | V2 | 177 | 178 | 187 |
| pass_on_right_probability | V2 | 177 | 178 | 187 |
| lane_center_offset | V2 | 179 | 180 | 187 |
| steering_response_time | V2 | 179 | 180 | 187 |
| steering_rate_limit | V2 | 179 | 180 | 187 |
| turn_entry_speed | V2 | 179 | 180 | 187 |
| turn_exit_acceleration | V2 | 179 | 180 | 187 |
| corner_cutting_bias | V2 | 179 | 180 | 187 |
| lateral_clearance | V2 | 179 | 180 | 187 |
| lateral_correction_deadband | V2 | 179 | 180 | 187 |
| route_time_weight | V2 | 181 | 182 | 187 |
| route_distance_weight | V2 | 181 | 182 | 187 |
| route_turn_penalty | V2 | 181 | 182 | 187 |
| route_signal_penalty | V2 | 181 | 182 | 187 |
| route_congestion_penalty | V2 | 181 | 182 | 187 |
| reroute_patience | V2 | 181 | 182 | 187 |
| u_turn_willingness | V2 | 181 | 182 | 187 |
| reverse_recovery_duration | V2 | 181 | 182 | 187 |
| pedestrian_yield_probability | V2 | 183 | 184 | 187 |
| pedestrian_clearance | V2 | 183 | 184 | 187 |
| hazard_reaction_delay | V2 | 183 | 184 | 187 |
| obstacle_clearance | V2 | 183 | 184 | 187 |
| emergency_brake_intensity | V2 | 183 | 184 | 187 |
| evasive_steer_willingness | V2 | 183 | 184 | 187 |
| crosswalk_approach_speed | V2 | 183 | 184 | 187 |
| horn_use_probability | V2 | 183 | 184 | 187 |
| pickup_approach_speed | V2 | 185 | 186 | 187 |
| pickup_curb_distance | V2 | 185 | 186 | 187 |
| pickup_stop_precision | V2 | 185 | 186 | 187 |
| pickup_dwell_time | V2 | 185 | 186 | 187 |
| dropoff_approach_speed | V2 | 185 | 186 | 187 |
| dropoff_curb_distance | V2 | 185 | 186 | 187 |
| occupied_acceleration_scale | V2 | 185 | 186 | 187 |
| occupied_lateral_accel_scale | V2 | 185 | 186 | 187 |

## Închiderea completă

V1 este închis de PBI 162, V2 de 190 și V3 de 202. Aceste gates depind de întregul lanț de livrare și nu pot fi mutate în Done înaintea verificărilor. Task-urile de release produc artefacte și dovada criteriilor; nu execută implicit o publicare externă necerută.

## Metadate și gates

PBI-urile de politică/estimare declară parameter_role și parameter_keys în frontmatter. Validate-Plan.ps1 verifică fiecare cheie din matrice față de aceste metadate și că gate-ul depinde tranzitiv de ambele task-uri. Toate cheile rămân implemented=false în catalogul de proiectare până la implementarea verificată. Gate-ul 162 include 203–217; V2 și V3 păstrează regresiile. ID-urile noi sunt stabile și pot fi dependențe ale celor vechi fără renumerotare.
