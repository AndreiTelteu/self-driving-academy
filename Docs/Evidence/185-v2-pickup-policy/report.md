# 185 — raport politică pentru pickup și confortul pasagerilor

Generat de `scripts/run-v2-pickup-policy-report.mjs` din contractul `185-pickup-policy-v2`.
Fiecare rând compară aceeași scenă cu valoarea joasă și valoarea ridicată a unei singure chei.
Zonele de serviciu, punctul de oprire și adâncimea bay-ului vin din harta autorată 032; starea
ocupată vine din ciclul real 061; geometria și aderența din clasele 023 și suprafețele 026.

## Scenariile

| Scenariu | Descriere |
| --- | --- |
| viteza de apropiere de pickup | zona reală `sz:0-0` (PICKUP, TAXI) pe banda `lane:00W0`, cu 5.50 m lungime și 3.00 m adâncime; ego la 5,00 m înainte de intrare, 7.75 m până la punctul de oprire |
| distanța la bordură (pickup) | ego oprit pe punctul de oprire din zona reală de pickup, caroseria la 0,50 m de bordură |
| precizia opririi | același punct de oprire marcat, cu 1,00 s de staționare acumulată |
| staționarea la pickup | ego oprit în zonă, cu 1,00 s de staționare și îmbarcarea încă neconfirmată de 061 |
| viteza de apropiere de dropoff | zona reală `sz:1-0` (DROPOFF) pe banda `lane:10W0`, cu pasager la bord, la 5,00 m înainte de intrare |
| distanța la bordură (dropoff) | ego oprit pe punctul de oprire din zona reală de dropoff, cu pasager la bord |
| accelerația cu pasager | pasager la bord (061 `TO_DROPOFF`) pe drum liber, fără serviciu în curs |
| accelerația laterală cu pasager | același pasager la bord, fără serviciu în curs: numai plafonul lateral |

## Efectul izolat al fiecărei chei

| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `pickup_approach_speed` | apropiere pickup | 0.5 | 0.500 | 8 | 5.568 | 5.068 | m/s |
| `pickup_curb_distance` | distanța la bordură (pickup) | 0.1 | 0.150 | 2 | 1.200 | 1.050 | m |
| `pickup_stop_precision` | precizia opririi | 0.2 | 0.200 | 5 | 2.750 | 2.550 | m |
| `pickup_dwell_time` | staționarea la pickup | 1 | 3.000 | 10 | 10.000 | 7.000 | s |
| `dropoff_approach_speed` | apropiere dropoff | 0.5 | 0.500 | 8 | 5.568 | 5.068 | m/s |
| `dropoff_curb_distance` | distanța la bordură (dropoff) | 0.1 | 0.150 | 2 | 1.200 | 1.050 | m |
| `occupied_acceleration_scale` | accelerația cu pasager | 0.3 | 0.450 | 1.5 | 2.000 | 1.550 | m/s² |
| `occupied_lateral_accel_scale` | accelerația laterală cu pasager | 0.3 | 0.750 | 1.5 | 2.500 | 1.750 | m/s² |

## Pragurile obligatorii ale opririi

| Zonă | Tip | TAXI | Lungime (m) | Punct (m) | Bandă bordură (m) | Bordură min/max (m) | Dwell min (s) | Precizie min/max (m) |
| --- | --- | --- | ---: | ---: | ---: | --- | ---: | --- |
| `sz:0-0` | PICKUP | da | 5.5 | 2.75 | 3 | 0.15 / 1.2 | 3 | 0.05 / 2.75 |
| `sz:1-0` | DROPOFF | da | 5.5 | 2.75 | 3 | 0.15 / 1.2 | 3 | 0.05 / 2.75 |

## Preferința nu mută pragul obligatoriu

| Cheie | Scenariu | Joasă | Ridicată | Bloc identic | Oprire permisă la ambele | Motiv blocat |
| --- | --- | ---: | ---: | --- | --- | --- |
| `pickup_approach_speed` | distanța la bordură (pickup) | 0.5 | 8 | da | da | — |
| `pickup_curb_distance` | distanța la bordură (pickup) | 0.1 | 2 | da | da | — |
| `pickup_stop_precision` | distanța la bordură (pickup) | 0.2 | 5 | da | da | — |
| `pickup_dwell_time` | distanța la bordură (pickup) | 1 | 10 | da | da | — |

Grilă de preferințe: **162/162** cazuri respectă pragul obligatoriu; 0 schimbări ale blocului obligatoriu

| Blocaj | Scenariu | Motiv | Oprire permisă | Inerție la orice preferință |
| --- | --- | --- | --- | --- |
| civil-only | zonă fără acces TAXI | `ZONE_NOT_TAXI` | nu | da |
| beyond-zone | oprire peste zona marcată | `STOP_BEYOND_ZONE` | nu | da |
| kind-mismatch | serviciu incompatibil cu zona | `ZONE_KIND_MISMATCH` | nu | da |

## Cele șase limite de siguranță

| Limită | Cheie | Scenariu | Joasă | Rezultat joasă | Ridicată | Rezultat ridicată | Unitate | Verdict |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| banda autorată a bordurii | `pickup_curb_distance` | distanța la bordură (pickup) | 0.1 | 0.150 | 2 | 1.200 | m | minimul de 0,10 m este ridicat la 0,15 m, iar maximul de 2,00 m este plafonat la 1,20 m: caroseria rămâne în bay, nu pe bordură și nu în banda de circulație |
| fereastra de oprire în zona marcată | `pickup_stop_precision` | precizia opririi | 0.2 | 0.200 | 5 | 2.750 | m | toleranța efectivă nu coboară sub 0,05 m (dovada 062) și nu depășește semilățimea punctului marcat (2,75 m), deci fereastra rămâne în bay |
| plafonul cinematic de apropiere | `pickup_approach_speed` | apropiere pickup | 0.5 | 0.500 | 8 | 5.568 | m/s | viteza este `min(cheie, sqrt(2 · comfort · distanță))`: distanța de oprire nu depășește distanța până la punctul marcat |
| minimul de staționare | `pickup_dwell_time` | staționarea la pickup | 1 | 3.000 | 10 | 10.000 | s | 1 s este ridicat la 3 s (dwell-ul de îmbarcare 062); nicio valoare nu permite plecarea fără confirmarea 061 |
| plafonul de aderență (accelerație) | `occupied_acceleration_scale` | accelerația cu pasager | 0.3 | 1.200 | 1.5 | 4.464 | m/s² | cu pasager la bord, scara cere 1,5 × 4 m/s², dar aderența redusă a anvelopei oprește la 4,463550 m/s² |
| plafonul de aderență (lateral) | `occupied_lateral_accel_scale` | accelerația laterală cu pasager | 0.3 | 2.400 | 1.5 | 4.464 | m/s² | cu pasager la bord, scara cere 1,5 × 8 m/s², dar aderența redusă oprește la 4,463550 m/s² |

Poarta de plecare: neconfirmat la 10 s → `false` (SERVICE_NOT_CONFIRMED); confirmat la 3,2 s → cheie 1 `true`, cheie 10 `false` (DWELL_PENDING); în mișcare `false`.

## Separarea cheilor

Cheia scenariului rămâne la valoarea implicită din catalog, iar fiecare altă cheie este dusă de
la minim la maxim: **56/56** perechi sunt inerte în scenariul lor.

| Cheie | Scenariu | Valoare joasă | Valoare ridicată | Diferență | Separată |
| --- | --- | ---: | ---: | ---: | --- |
| `pickup_curb_distance` | viteza de apropiere de pickup | 0.1 | 2 | 0.000 | inerță |
| `pickup_stop_precision` | viteza de apropiere de pickup | 0.2 | 5 | 0.000 | inerță |
| `pickup_dwell_time` | viteza de apropiere de pickup | 1 | 10 | 0.000 | inerță |
| `dropoff_approach_speed` | viteza de apropiere de pickup | 0.5 | 8 | 0.000 | inerță |
| `dropoff_curb_distance` | viteza de apropiere de pickup | 0.1 | 2 | 0.000 | inerță |
| `occupied_acceleration_scale` | viteza de apropiere de pickup | 0.3 | 1.5 | 0.000 | inerță |
| `occupied_lateral_accel_scale` | viteza de apropiere de pickup | 0.3 | 1.5 | 0.000 | inerță |
| `pickup_approach_speed` | distanța la bordură (pickup) | 0.5 | 8 | 0.000 | inerță |
| `pickup_stop_precision` | distanța la bordură (pickup) | 0.2 | 5 | 0.000 | inerță |
| `pickup_dwell_time` | distanța la bordură (pickup) | 1 | 10 | 0.000 | inerță |
| `dropoff_approach_speed` | distanța la bordură (pickup) | 0.5 | 8 | 0.000 | inerță |
| `dropoff_curb_distance` | distanța la bordură (pickup) | 0.1 | 2 | 0.000 | inerță |
| `occupied_acceleration_scale` | distanța la bordură (pickup) | 0.3 | 1.5 | 0.000 | inerță |
| `occupied_lateral_accel_scale` | distanța la bordură (pickup) | 0.3 | 1.5 | 0.000 | inerță |
| `pickup_approach_speed` | precizia opririi | 0.5 | 8 | 0.000 | inerță |
| `pickup_curb_distance` | precizia opririi | 0.1 | 2 | 0.000 | inerță |
| `pickup_dwell_time` | precizia opririi | 1 | 10 | 0.000 | inerță |
| `dropoff_approach_speed` | precizia opririi | 0.5 | 8 | 0.000 | inerță |
| `dropoff_curb_distance` | precizia opririi | 0.1 | 2 | 0.000 | inerță |
| `occupied_acceleration_scale` | precizia opririi | 0.3 | 1.5 | 0.000 | inerță |
| `occupied_lateral_accel_scale` | precizia opririi | 0.3 | 1.5 | 0.000 | inerță |
| `pickup_approach_speed` | staționarea la pickup | 0.5 | 8 | 0.000 | inerță |
| `pickup_curb_distance` | staționarea la pickup | 0.1 | 2 | 0.000 | inerță |
| `pickup_stop_precision` | staționarea la pickup | 0.2 | 5 | 0.000 | inerță |
| `dropoff_approach_speed` | staționarea la pickup | 0.5 | 8 | 0.000 | inerță |
| `dropoff_curb_distance` | staționarea la pickup | 0.1 | 2 | 0.000 | inerță |
| `occupied_acceleration_scale` | staționarea la pickup | 0.3 | 1.5 | 0.000 | inerță |
| `occupied_lateral_accel_scale` | staționarea la pickup | 0.3 | 1.5 | 0.000 | inerță |
| `pickup_approach_speed` | viteza de apropiere de dropoff | 0.5 | 8 | 0.000 | inerță |
| `pickup_curb_distance` | viteza de apropiere de dropoff | 0.1 | 2 | 0.000 | inerță |
| `pickup_stop_precision` | viteza de apropiere de dropoff | 0.2 | 5 | 0.000 | inerță |
| `pickup_dwell_time` | viteza de apropiere de dropoff | 1 | 10 | 0.000 | inerță |
| `dropoff_curb_distance` | viteza de apropiere de dropoff | 0.1 | 2 | 0.000 | inerță |
| `occupied_acceleration_scale` | viteza de apropiere de dropoff | 0.3 | 1.5 | 0.000 | inerță |
| `occupied_lateral_accel_scale` | viteza de apropiere de dropoff | 0.3 | 1.5 | 0.000 | inerță |
| `pickup_approach_speed` | distanța la bordură (dropoff) | 0.5 | 8 | 0.000 | inerță |
| `pickup_curb_distance` | distanța la bordură (dropoff) | 0.1 | 2 | 0.000 | inerță |
| `pickup_stop_precision` | distanța la bordură (dropoff) | 0.2 | 5 | 0.000 | inerță |
| `pickup_dwell_time` | distanța la bordură (dropoff) | 1 | 10 | 0.000 | inerță |
| `dropoff_approach_speed` | distanța la bordură (dropoff) | 0.5 | 8 | 0.000 | inerță |
| `occupied_acceleration_scale` | distanța la bordură (dropoff) | 0.3 | 1.5 | 0.000 | inerță |
| `occupied_lateral_accel_scale` | distanța la bordură (dropoff) | 0.3 | 1.5 | 0.000 | inerță |
| `pickup_approach_speed` | accelerația cu pasager | 0.5 | 8 | 0.000 | inerță |
| `pickup_curb_distance` | accelerația cu pasager | 0.1 | 2 | 0.000 | inerță |
| `pickup_stop_precision` | accelerația cu pasager | 0.2 | 5 | 0.000 | inerță |
| `pickup_dwell_time` | accelerația cu pasager | 1 | 10 | 0.000 | inerță |
| `dropoff_approach_speed` | accelerația cu pasager | 0.5 | 8 | 0.000 | inerță |
| `dropoff_curb_distance` | accelerația cu pasager | 0.1 | 2 | 0.000 | inerță |
| `occupied_lateral_accel_scale` | accelerația cu pasager | 0.3 | 1.5 | 0.000 | inerță |
| `pickup_approach_speed` | accelerația laterală cu pasager | 0.5 | 8 | 0.000 | inerță |
| `pickup_curb_distance` | accelerația laterală cu pasager | 0.1 | 2 | 0.000 | inerță |
| `pickup_stop_precision` | accelerația laterală cu pasager | 0.2 | 5 | 0.000 | inerță |
| `pickup_dwell_time` | accelerația laterală cu pasager | 1 | 10 | 0.000 | inerță |
| `dropoff_approach_speed` | accelerația laterală cu pasager | 0.5 | 8 | 0.000 | inerță |
| `dropoff_curb_distance` | accelerația laterală cu pasager | 0.1 | 2 | 0.000 | inerță |
| `occupied_acceleration_scale` | accelerația laterală cu pasager | 0.3 | 1.5 | 0.000 | inerță |

## Starea ocupată

| Stare 061 | Pasager la bord | Scală minimă (m/s²) | Scală maximă (m/s²) | Inertă fără pasager | Plafon |
| --- | --- | ---: | ---: | --- | --- |
| TO_PICKUP | nu | 1.5 | 1.5 | da | NONE |
| PICKUP | nu | 1.5 | 1.5 | da | NONE |
| TO_DROPOFF | da | 0.45 | 2 | nu | COMFORT |
| DROPOFF | da | 0.45 | 2 | nu | COMFORT |
| COMPLETED | nu | 1.5 | 1.5 | da | NONE |

## Compatibilitate cu cheile M

| `comfort_deceleration` (m/s²) | Plafon cinematic de apropiere (m/s) |
| ---: | ---: |
| 2 | 5.567764 |
| 2.5 | 6.22495 |
| 8 | 11.135529 |

| `stop_dwell_time` (s) | Efectiv la cheie 1 s | Efectiv la cheie 10 s |
| ---: | ---: | ---: |
| 0 | 3 | 10 |
| 1 | 3 | 10 |
| 4 | 4 | 10 |

| `desired_acceleration` (m/s²) | Scară 0,85 | Comandat (m/s²) | Plafon |
| ---: | ---: | ---: | --- |
| 0.5 | 0.85 | 0.425 | NONE |
| 1.5 | 0.85 | 1.275 | NONE |
| 4 | 0.85 | 2 | COMFORT |

| `curve_lateral_accel` (m/s²) | Scară 0,85 | Comandat (m/s²) | Plafon |
| ---: | ---: | ---: | --- |
| 1 | 0.85 | 0.85 | NONE |
| 2.5 | 0.85 | 2.125 | NONE |
| 8 | 0.85 | 6.8 | NONE |

- Unități M: `desired_acceleration` m/s², `comfort_deceleration` m/s², `curve_lateral_accel` m/s², `stop_dwell_time` s.
- Unități R: `pickup_approach_speed` m/s, `pickup_curb_distance` m, `pickup_stop_precision` m, `pickup_dwell_time` s, `dropoff_approach_speed` m/s, `dropoff_curb_distance` m, `occupied_acceleration_scale` ratio, `occupied_lateral_accel_scale` ratio.

## Parametrii din catalog

| Cheie | Unitate | Minim | Maxim | Default |
| --- | --- | ---: | ---: | ---: |
| `pickup_approach_speed` | m/s | 0.5 | 8 | 3 |
| `pickup_curb_distance` | m | 0.1 | 2 | 0.5 |
| `pickup_stop_precision` | m | 0.2 | 5 | 1 |
| `pickup_dwell_time` | s | 1 | 10 | 3 |
| `dropoff_approach_speed` | m/s | 0.5 | 8 | 3 |
| `dropoff_curb_distance` | m | 0.1 | 2 | 0.5 |
| `occupied_acceleration_scale` | ratio | 0.3 | 1.5 | 0.85 |
| `occupied_lateral_accel_scale` | ratio | 0.3 | 1.5 | 0.85 |

## Determinism

- 16 decizii: `fnv1a32:f9043488`.
- Rulare repetată: `fnv1a32:f9043488`.

## Verificări

- PASS `mandatory-stability`: `pickup_approach_speed` 0.5 / 8 → bloc obligatoriu identic; `pickup_curb_distance` 0.1 / 2 → bloc obligatoriu identic; `pickup_stop_precision` 0.2 / 5 → bloc obligatoriu identic; `pickup_dwell_time` 1 / 10 → bloc obligatoriu identic
- PASS `preference-grid`: **162/162** cazuri respectă pragul obligatoriu; 0 schimbări ale blocului obligatoriu
- PASS `blockers`: civil-only: oprit=false, inerție=true; beyond-zone: oprit=false, inerție=true; kind-mismatch: oprit=false, inerție=true
- PASS `curb-and-precision`: 0.15 → 1.2 m; precizie 0.2 → 2.75 m
- PASS `approach-cap`: 0.5 → 5.567764 m/s (plafon cinematic 5.567764)
- PASS `dwell-floor`: 3 → 10 s
- PASS `occupied-caps`: accelerație 1.2 → 4.46355 m/s²; lateral 2.4 → 4.46355 m/s²
- PASS `departure-gate`: neconfirmat la 10 s: false (SERVICE_NOT_CONFIRMED); confirmat 3,2 s: cheie 1 → true, cheie 10 → false (DWELL_PENDING); în mișcare → false
- PASS `occupancy`: TO_PICKUP: 1.5 / 1.5 m/s²; PICKUP: 1.5 / 1.5 m/s²; TO_DROPOFF: 0.45 / 2 m/s²; DROPOFF: 0.45 / 2 m/s²; COMPLETED: 1.5 / 1.5 m/s²
- PASS `m-comfort`: 2 → 5.567764 / 2.5 → 6.22495 / 8 → 11.135529
- PASS `m-dwell`: M 0 s → 3 / 10 s; M 1 s → 3 / 10 s; M 4 s → 4 / 10 s
- PASS `m-acceleration`: 0.5 → 0.425 (NONE); 1.5 → 1.275 (NONE); 4 → 2 (COMFORT)
- PASS `m-lateral`: 1 → 0.85; 2.5 → 2.125; 8 → 6.8
- PASS `effects`: pickup_approach_speed 0.500 → 5.568; pickup_curb_distance 0.150 → 1.200; pickup_stop_precision 0.200 → 2.750; pickup_dwell_time 3.000 → 10.000; dropoff_approach_speed 0.500 → 5.568; dropoff_curb_distance 0.150 → 1.200; occupied_acceleration_scale 0.450 → 2.000; occupied_lateral_accel_scale 0.750 → 2.500
- PASS `separation`: 56/56 perechi inerte, 0 cuplaje
- PASS `determinism`: digest fnv1a32:f9043488
- PASS `admission`: manual NO_AUTO_AUTHORITY, vechi FOREIGN_OR_STALE_OBSERVATION, actor FOREIGN_OR_STALE_OBSERVATION, sesiune FOREIGN_OR_STALE_OBSERVATION, profil lipsă MISSING_PROFILE; refuzuri: foreignProfile REFUSED, wrongObservation REFUSED, wrongMechanics REFUSED, unknownRideState REFUSED, phaseMismatch REFUSED, negativeDistance REFUSED, stopOffsetOutsideBay REFUSED
- PASS `units`: R: pickup_approach_speed m/s, pickup_curb_distance m, pickup_stop_precision m, pickup_dwell_time s, dropoff_approach_speed m/s, dropoff_curb_distance m, occupied_acceleration_scale ratio, occupied_lateral_accel_scale ratio; M: desired_acceleration m/s², comfort_deceleration m/s², curve_lateral_accel m/s², stop_dwell_time s
- PASS `catalog`: pickup_approach_speed 0.5-8 → 3, pickup_curb_distance 0.1-2 → 0.5, pickup_stop_precision 0.2-5 → 1, pickup_dwell_time 1-10 → 3, dropoff_approach_speed 0.5-8 → 3, dropoff_curb_distance 0.1-2 → 0.5, occupied_acceleration_scale 0.3-1.5 → 0.85, occupied_lateral_accel_scale 0.3-1.5 → 0.85

**Sumar: 19/19 verificări, PASS.**
