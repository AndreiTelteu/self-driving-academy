# Dovezi de învățare pe parametru — PBI 093

`createParameterEvidenceLedger()` din `src/learning/parameter-evidence.ts` acumulează fapte agregate
și unice per apariție pentru exact cele 24 de chei `initial_learning_target`. Specificațiile sunt
înghețate în `parameterEvidenceSpecs`; unitățile și limitele sunt preluate din registrul PBI 092.
Toate intrările cer oportunitate 086 rezolvată și eligibilă pentru learning, fereastră 087 ELIGIBLE
și potrivire 087/088/086. Nu există o cale pentru a transforma o etichetă externă sau exclusă în
trafic liber.

| Cheie | Context 087 | Canal | Prag episoade | Prag timp/viteză | Proprietar estimator |
| --- | --- | --- | ---: | --- | --- |
| speed_delta_urban | FREE_TRAFFIC urban | speed sample | 1 | 10 s libere | 094 |
| speed_delta_residential | FREE_TRAFFIC residential | speed sample | 1 | 10 s libere | 094 |
| curve_lateral_accel | FREE_TRAFFIC curbă | accelerație | 3 | — | 094 |
| intersection_approach_speed | FREE_TRAFFIC apropiere | speed sample | 3 | — | 094 |
| desired_acceleration | FREE_TRAFFIC | accelerație | 3 | — | 095 |
| comfort_deceleration | FREE_TRAFFIC | decelerație | 3 | — | 095 |
| acceleration_jerk | FREE_TRAFFIC | accelerație | 3 | — | 095 |
| brake_reaction_delay | FREE_TRAFFIC stimul observabil | decelerație | 3 | — | 095 |
| following_time_headway | LEADER / urmărire | pereche headway | 3 | viteze variate | 096 |
| following_min_gap | LEADER / urmărire | pereche headway | 3 | viteze variate | 096 |
| queue_standstill_gap | LEADER / coadă | pereche headway | 3 | — | 096 |
| following_speed_gain | LEADER / urmărire | pereche headway | 3 | viteze variate | 096 |
| red_stop_probability | STOP/RED eligibil | rezultat STOP | 3 | — | 097 |
| green_start_delay | GREEN neblocat | întârziere plecare | 2 | — | 097 |
| red_stop_line_offset | RED eligibil | rezultat STOP | 3 | — | 097 |
| late_red_brake_threshold | RED eligibil | decelerație | 3 | — | 097 |
| stop_full_probability | STOP eligibil | rezultat STOP | 3 | — | 098 |
| stop_dwell_time | STOP eligibil | rezultat STOP | 3 | — | 098 |
| stop_line_offset | STOP eligibil | rezultat STOP | 3 | — | 098 |
| yield_time_gap | YIELD cu prioritate observată | pereche headway | 3 | — | 098 |
| lane_change_front_gap | schimbare completă | rezultat lane change | 3 | — | 099 |
| lane_change_back_gap | schimbare completă | rezultat lane change | 3 | — | 099 |
| lane_change_speed_gain | schimbare completă | rezultat lane change | 3 | — | 099 |
| lane_change_cooldown | schimbare completă | rezultat lane change | 3 | — | 099 |

Unitatea și intervalul fiecărui rând sunt sincronizate automat din catalogul 092; testul verifică
acoperirea exactă, fără extensii sau duplicate. Canalele numerice accelerație/decelerație cer
normalizare 089 intenționată, nu o limită inferioară `CAPABILITY_LIMITED`. Viteza este admisă numai
în FREE_TRAFFIC și cu minimum zece secunde utilizabile. `LEADER` și `BLOCKED_GREEN` nu devin viteză
preferată; sunt contexte explicite doar pentru dovezile relaționale/plecare cărora le aparțin.

Deduplicarea folosește perechea `opportunity.id + opportunity.occurrence`. Apeluri repetate asupra
aceluiași fapt și cadre corelate actualizează același episod; o re-apariție cu occurrence nou este
episod nou, în acord cu 086. Numărul de cadre, `observationCount` și cadența nu intră în identitate.
Pentru 088 `PREFIX_ELIGIBLE` se acceptă numai prefix utilizabil; un `TRUNCATED` cu prefix contribuie
doar pentru acel prefix, iar `FULLY_SUPPRESSED` nu contribuie. O caracteristică 089
`CAPABILITY_LIMITED` nu furnizează viteză preferată. Contextul verifică ID-ul oportunității,
fereastra, segmentul, vehiculul, incarnation-ul și tipul înainte de agregare.

Stările read model sunt `NO_EVIDENCE`, `INSUFFICIENT`, `READY`, `EXCLUDED`. Dovezile lipsă produc
`unchanged: true`, motiv `NO_QUALIFYING_EVIDENCE` și fără valoare sau delta. Chiar și `READY` înseamnă
doar prag de dovezi satisfăcut; motivul este `ESTIMATOR_NOT_IMPLEMENTED` și profilul rămâne
neschimbat.

## Ce NU este

Nu este estimator, nu calculează valoare/delta, nu activează `implemented` ori `estimable`, nu
publică profiluri și nu implementează comportamentul 094–108. PBI 093 nu schimbă flagurile 092;
`estimable` rămâne false. Catalogul păstrează valorile `implemented` existente și independente,
deoarece unele politici au deja suport de reglaj manual înainte de 093.
