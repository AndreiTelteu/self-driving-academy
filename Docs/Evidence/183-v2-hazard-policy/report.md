# 183 — raport politică extinsă pentru pietoni și pericole

Generat de `scripts/run-v2-hazard-policy-report.mjs` din contractul `183-hazard-policy-v2`.
Fiecare rând compară aceeași scenă cu valoarea joasă și valoarea ridicată a unei singure chei.
Faptele de pieton vin dintr-o traversare reală `164-pedestrians-v1`, iar faptele de obstacol și
stimul din lumea reală `165-hazards-v1`; geometria și aderența vin din clasele `023` și suprafețele
`026`.

## Scenariile

| Scenariu | Descriere |
| --- | --- |
| cedarea la traversare | traversarea reală `cw:0-1:E` de pe banda `lane:01W0`: pietonul traversează pe 10.00 m la 1.464 m/s și are nevoie de 6.831 s să elibereze calea |
| spațiul față de pieton | același pieton real `id-v1:10:pedestrian21:pedestrians-164-tests1:724:neighbourhood-compact-v18:cw:0-1:E1:0` oprit la bordura trecerii `cw:0-1:E`, fără nicio oportunitate de traversare angajată |
| reacția la pericol | stimulul real 165 `id-v1:hazard-stimulus:hazards-165-tests|11|obstacle-1|vehicle-1|inc-1` apărut la 38.000 m, cu 8.000 m/s |
| spațiul față de obstacol | conul real `obstacle-1` (cutie autorată de 0,30 m jumătate de lățime) la 12 m, fără spațiu lateral declarat |
| frânarea de urgență | același stimul real 165 `id-v1:hazard-stimulus:hazards-165-tests|11|obstacle-1|vehicle-1|inc-1`, cu aderența suprafeței livrate `dry-asphalt` |
| ocolirea prin viraj | bariera reală la 20 m, cu 4,50 m de spațiu lateral declarat: ocolirea este posibilă fizic |
| viteza de apropiere de trecere | trecerea reală `cw:0-1:E`, fără pieton angajat, la 25 m de linia autorată |
| claxonul | oportunitate reală de claxon 165, cu claxonul permis de lume în acest loc |

## Efectul izolat al fiecărei chei

| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `pedestrian_yield_probability` | traversare | 0 | 0.000 | 1 | 1.000 | 1.000 | decizie |
| `pedestrian_clearance` | pieton la bordură | 0.1 | 6.229 | 6 | 4.899 | -1.330 | m/s |
| `hazard_reaction_delay` | reacție | 0 | 28.000 | 3 | 4.000 | -24.000 | m |
| `obstacle_clearance` | obstacol | 0.1 | 6.325 | 4 | 5.550 | -0.775 | m/s |
| `emergency_brake_intensity` | frânare de urgență | 0 | 0.000 | 1 | 8.000 | 8.000 | m/s² |
| `evasive_steer_willingness` | ocolire | 0 | 0.000 | 1 | 0.450 | 0.450 | m |
| `crosswalk_approach_speed` | apropiere de trecere | 0.5 | 0.500 | 15 | 15.000 | 14.500 | m/s |
| `horn_use_probability` | claxon | 0 | 0.000 | 1 | 1.000 | 1.000 | decizie |

## Separarea cheilor

Cheia scenariului rămâne la valoarea implicită din catalog, iar fiecare altă cheie este dusă de
la minim la maxim: **56/56** perechi sunt inerte în scenariul lor,
deci nicio cheie nu se amestecă în canalul alteia.

| Cheie | Scenariu | Valoare joasă | Valoare ridicată | Diferență | Separată |
| --- | --- | ---: | ---: | ---: | --- |
| `pedestrian_clearance` | cedarea la traversare | 0.1 | 6 | 0.000 | inertă |
| `hazard_reaction_delay` | cedarea la traversare | 0 | 3 | 0.000 | inertă |
| `obstacle_clearance` | cedarea la traversare | 0.1 | 4 | 0.000 | inertă |
| `emergency_brake_intensity` | cedarea la traversare | 0 | 1 | 0.000 | inertă |
| `evasive_steer_willingness` | cedarea la traversare | 0 | 1 | 0.000 | inertă |
| `crosswalk_approach_speed` | cedarea la traversare | 0.5 | 15 | 0.000 | inertă |
| `horn_use_probability` | cedarea la traversare | 0 | 1 | 0.000 | inertă |
| `pedestrian_yield_probability` | spațiul față de pieton | 0 | 1 | 0.000 | inertă |
| `hazard_reaction_delay` | spațiul față de pieton | 0 | 3 | 0.000 | inertă |
| `obstacle_clearance` | spațiul față de pieton | 0.1 | 4 | 0.000 | inertă |
| `emergency_brake_intensity` | spațiul față de pieton | 0 | 1 | 0.000 | inertă |
| `evasive_steer_willingness` | spațiul față de pieton | 0 | 1 | 0.000 | inertă |
| `crosswalk_approach_speed` | spațiul față de pieton | 0.5 | 15 | 0.000 | inertă |
| `horn_use_probability` | spațiul față de pieton | 0 | 1 | 0.000 | inertă |
| `pedestrian_yield_probability` | reacția la pericol | 0 | 1 | 0.000 | inertă |
| `pedestrian_clearance` | reacția la pericol | 0.1 | 6 | 0.000 | inertă |
| `obstacle_clearance` | reacția la pericol | 0.1 | 4 | 0.000 | inertă |
| `emergency_brake_intensity` | reacția la pericol | 0 | 1 | 0.000 | inertă |
| `evasive_steer_willingness` | reacția la pericol | 0 | 1 | 0.000 | inertă |
| `crosswalk_approach_speed` | reacția la pericol | 0.5 | 15 | 0.000 | inertă |
| `horn_use_probability` | reacția la pericol | 0 | 1 | 0.000 | inertă |
| `pedestrian_yield_probability` | spațiul față de obstacol | 0 | 1 | 0.000 | inertă |
| `pedestrian_clearance` | spațiul față de obstacol | 0.1 | 6 | 0.000 | inertă |
| `hazard_reaction_delay` | spațiul față de obstacol | 0 | 3 | 0.000 | inertă |
| `emergency_brake_intensity` | spațiul față de obstacol | 0 | 1 | 0.000 | inertă |
| `evasive_steer_willingness` | spațiul față de obstacol | 0 | 1 | 0.000 | inertă |
| `crosswalk_approach_speed` | spațiul față de obstacol | 0.5 | 15 | 0.000 | inertă |
| `horn_use_probability` | spațiul față de obstacol | 0 | 1 | 0.000 | inertă |
| `pedestrian_yield_probability` | frânarea de urgență | 0 | 1 | 0.000 | inertă |
| `pedestrian_clearance` | frânarea de urgență | 0.1 | 6 | 0.000 | inertă |
| `hazard_reaction_delay` | frânarea de urgență | 0 | 3 | 0.000 | inertă |
| `obstacle_clearance` | frânarea de urgență | 0.1 | 4 | 0.000 | inertă |
| `evasive_steer_willingness` | frânarea de urgență | 0 | 1 | 0.000 | inertă |
| `crosswalk_approach_speed` | frânarea de urgență | 0.5 | 15 | 0.000 | inertă |
| `horn_use_probability` | frânarea de urgență | 0 | 1 | 0.000 | inertă |
| `pedestrian_yield_probability` | ocolirea prin viraj | 0 | 1 | 0.000 | inertă |
| `pedestrian_clearance` | ocolirea prin viraj | 0.1 | 6 | 0.000 | inertă |
| `hazard_reaction_delay` | ocolirea prin viraj | 0 | 3 | 0.000 | inertă |
| `obstacle_clearance` | ocolirea prin viraj | 0.1 | 4 | 0.000 | inertă |
| `emergency_brake_intensity` | ocolirea prin viraj | 0 | 1 | 0.000 | inertă |
| `crosswalk_approach_speed` | ocolirea prin viraj | 0.5 | 15 | 0.000 | inertă |
| `horn_use_probability` | ocolirea prin viraj | 0 | 1 | 0.000 | inertă |
| `pedestrian_yield_probability` | viteza de apropiere de trecere | 0 | 1 | 0.000 | inertă |
| `pedestrian_clearance` | viteza de apropiere de trecere | 0.1 | 6 | 0.000 | inertă |
| `hazard_reaction_delay` | viteza de apropiere de trecere | 0 | 3 | 0.000 | inertă |
| `obstacle_clearance` | viteza de apropiere de trecere | 0.1 | 4 | 0.000 | inertă |
| `emergency_brake_intensity` | viteza de apropiere de trecere | 0 | 1 | 0.000 | inertă |
| `evasive_steer_willingness` | viteza de apropiere de trecere | 0 | 1 | 0.000 | inertă |
| `horn_use_probability` | viteza de apropiere de trecere | 0 | 1 | 0.000 | inertă |
| `pedestrian_yield_probability` | claxonul | 0 | 1 | 0.000 | inertă |
| `pedestrian_clearance` | claxonul | 0.1 | 6 | 0.000 | inertă |
| `hazard_reaction_delay` | claxonul | 0 | 3 | 0.000 | inertă |
| `obstacle_clearance` | claxonul | 0.1 | 4 | 0.000 | inertă |
| `emergency_brake_intensity` | claxonul | 0 | 1 | 0.000 | inertă |
| `evasive_steer_willingness` | claxonul | 0 | 1 | 0.000 | inertă |
| `crosswalk_approach_speed` | claxonul | 0.5 | 15 | 0.000 | inertă |

## Cele patru limite de siguranță

| Limită | Cheie | Scenariu | Joasă | Rezultat joasă | Ridicată | Rezultat ridicată | Unitate | Verdict |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| mandatory-yield | `pedestrian_yield_probability` | traversare | 0 | 1.000 | 1 | 1.000 | decizie | un pieton care nu poate elibera calea în timpul M `yield_time_gap` este o cedare obligatorie la orice valoare a cheii |
| pedestrian-floor | `pedestrian_clearance` | pieton la bordură | 0.1 | 2.300 | 6 | 6.000 | m | minimul de catalog de 0,10 m este ridicat la lățimea vehiculului plus rezervă (2,30 m pentru sedan) |
| obstacle-floor | `obstacle_clearance` | obstacol în marjă | 0.1 | 3.400 | 4 | 4.000 | m | marja fizică a cutiei late (3,40 m) nu poate fi coborâtă de nicio valoare de catalog |
| reaction-cap | `hazard_reaction_delay` | reacție plafonată | 0 | 0.500 | 3 | 1.000 | s | întârzierea este saturată la maximul fezabil: frânarea mai poate opri în spațiul rămas |
| adhesion-cap | `emergency_brake_intensity` | frânare pe aderență redusă | 0 | 0.000 | 1 | 4.464 | m/s² | frânarea de urgență nu depășește aderența disponibilă, oricare ar fi intensitatea |
| evasion-no-space | `evasive_steer_willingness` | ocolire fără spațiu | 0 | 0.000 | 1 | 0.000 | m | fără spațiul lateral verificat, cheia este inertă la ambele extremități |
| horn-forbidden | `horn_use_probability` | claxon interzis | 0 | 0.000 | 1 | 0.000 | decizie | unde claxonul este interzis, eșantionul nu se trage și cheia este inertă |

- Minimul de spațiu: `max(cheie, trackM + 0.5 m)` pentru un pieton și `max(cheie, trackM / 2 + halfWidth + 0.5 m)` pentru un obstacol; un hazard deja în marjă comandă 0 m/s la orice valoare.
- Plafonul de reacție: întârzierea este `min(cheie + M brake_reaction_delay, (cameră − v² / (2 · capability)) / v)`; o valoare peste plafon este saturată și raportată.
- Plafonul de aderență: decelerația este `min(cheie · brakeAcceleration, grip · tireGripScale · g)`; pe `reduced-adhesion` limita fizică este 4,463550 m/s², sub capacitatea de 8 m/s².
- Subordonarea: fără spațiul lateral verificat, `evasive_steer_willingness` este inertă; unde claxonul este interzis, `horn_use_probability` este inertă și eșantionul nu se trage.

## Compatibilitate cu cheile M

| `comfort_deceleration` (m/s²) | Plafon de viteză la pieton (m/s) |
| ---: | ---: |
| 2 | 6.228965 |
| 2.5 | 6.964194 |
| 8 | 12.457929 |

| `brake_reaction_delay` (s) | Moștenit (s) | Cerut cu 0,5 s R (s) | Tick-uri | Saturație |
| ---: | ---: | ---: | ---: | --- |
| 0 | 0 | 0.5 | 30 | nu |
| 0.5 | 0.5 | 1 | 60 | nu |
| 3 | 3 | 3.5 | 210 | nu |

| `curve_lateral_accel` (m/s²) | Accelerație laterală folosită | Deplasare realizabilă (m) | Deplasare commitată (m) |
| ---: | ---: | ---: | ---: |
| 2.5 | 2.5 | 0.45 | 0.45 |
| 8 | 8 | 1.44 | 1.1 |

| `yield_time_gap` (s) | Marjă reală (s) | Cedare obligatorie | Cedare la 0 | Cedare la 1 |
| ---: | ---: | --- | --- | --- |
| 3 | 3.169097 | nu | nu | da |
| 8 | 3.169097 | da | da | da |

- Unități M: `comfort_deceleration` m/s², `brake_reaction_delay` s, `curve_lateral_accel` m/s², `yield_time_gap` s.
- Unități R: `pedestrian_yield_probability` probability, `pedestrian_clearance` m, `hazard_reaction_delay` s, `obstacle_clearance` m, `emergency_brake_intensity` ratio, `evasive_steer_willingness` probability, `crosswalk_approach_speed` m/s, `horn_use_probability` probability.

## Geometria și aderența livrate

| Clasă | Suprafață | Lățime (m) | Frânare (m/s²) | Aderență (m/s²) | Capacitate (m/s²) | Marja pieton (m) | Marja con (m) | Marja barieră (m) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| sedan | dry-asphalt | 1.8 | 8 | 12.753 | 8 | 2.3 | 1.7 | 3.4 |
| compact | dry-asphalt | 1.6 | 9 | 14.715 | 9 | 2.1 | 1.6 | 3.3 |
| sedan | reduced-adhesion | 1.8 | 8 | 4.46355 | 4.46355 | 2.3 | 1.7 | 3.4 |

## Eșantioane per oportunitate

- Reevaluarea aceleiași oportunități dă aceleași eșantioane: **true**.
- Altă oportunitate diferă: **true**; alt seed diferă: **true**.
- Fără permisiune de claxon eșantionul este `null`, fără spațiu lateral `null`, iar la un pieton care așteaptă `null`.

## Parametrii din catalog

| Cheie | Unitate | Minim | Maxim | Default |
| --- | --- | ---: | ---: | ---: |
| `pedestrian_yield_probability` | probability | 0 | 1 | 1 |
| `pedestrian_clearance` | m | 0.1 | 6 | 2 |
| `hazard_reaction_delay` | s | 0 | 3 | 0.5 |
| `obstacle_clearance` | m | 0.1 | 4 | 1 |
| `emergency_brake_intensity` | ratio | 0 | 1 | 1 |
| `evasive_steer_willingness` | probability | 0 | 1 | 0.3 |
| `crosswalk_approach_speed` | m/s | 0.5 | 15 | 5 |
| `horn_use_probability` | probability | 0 | 1 | 0.1 |

## Determinism

- 16 decizii: `fnv1a32:76d1c68d`.
- Rulare repetată: `fnv1a32:76d1c68d`.

## Verificări

- PASS `catalog`: pedestrian_yield_probability 0-1 probability, pedestrian_clearance 0.1-6 m, hazard_reaction_delay 0-3 s, obstacle_clearance 0.1-4 m, emergency_brake_intensity 0-1 ratio, evasive_steer_willingness 0-1 probability, crosswalk_approach_speed 0.5-15 m/s, horn_use_probability 0-1 probability
- PASS `units`: R: pedestrian_yield_probability probability, pedestrian_clearance m, hazard_reaction_delay s, obstacle_clearance m, emergency_brake_intensity ratio, evasive_steer_willingness probability, crosswalk_approach_speed m/s, horn_use_probability probability; M: comfort_deceleration m/s², brake_reaction_delay s, curve_lateral_accel m/s², yield_time_gap s
- PASS `effects`: pedestrian_yield_probability 0.000 → 1.000; pedestrian_clearance 6.229 → 4.899; hazard_reaction_delay 28.000 → 4.000; obstacle_clearance 6.325 → 5.550; emergency_brake_intensity 0.000 → 8.000; evasive_steer_willingness 0.000 → 0.450; crosswalk_approach_speed 0.500 → 15.000; horn_use_probability 0.000 → 1.000
- PASS `separation`: 56/56 perechi inerte, 0 cuplaje
- PASS `safety-clearance`: 0,10 m → 2.3 m (ridicat), 6 m → 6 m; viteza comandată 0 / 0 m/s; 0,10 m → 3.4 m (ridicat), 4 m → 4 m; viteza comandată 0 / 0 m/s
- PASS `safety-reaction`: 0 s → 0.5 s (marjă 4 m), 3 s → 1 s (saturat, marjă 0 m)
- PASS `safety-adhesion`: aderență redusă: 0,5 → 4 m/s², 1 → 4.46355 m/s² (cerut 8); uscat 1 → 8 m/s²
- PASS `safety-evasion`: fără spațiu (3,00 m < 3.4 m): 0 / 0 m; cu spațiu: 0 → 0.45 m
- PASS `safety-horn`: interzis: eșantion null, folosit false; permis: 0 → false, 1 → true
- PASS `mandatory-yield`: obligatoriu (marjă -4.831 s < 3 s): cedare true la 0; discreționar (marjă 3.169 s): false → true
- PASS `m-compatible`: comfort_deceleration 2 / 2,5 / 8 m/s² → plafon 6.228965 / 6.964194 / 12.457929 m/s; delay M 0 / 0,5 / 3 s + 0,5 s R → 0.5 s (30 tick-uri) / 1 s (60 tick-uri) / 3.5 s (210 tick-uri); curve_lateral_accel 2,5 → 0.45 m, 8 → 1.1 m; yield_time_gap 3 s → obligatoriu false (0 → false, 1 → true); 8 s → obligatoriu true (0 → true)
- PASS `geometry`: lățimi 1.8 / 1.6 m; aderență 12.753 / 14.715 / 4.46355 m/s²; capacitate 8 / 9 m/s²
- PASS `samples`: repetare identică true, altă oportunitate diferă true, alt seed diferă true, eșantioane absente: claxon null, ocolire null, așteptare null
- PASS `determinism`: digest fnv1a32:76d1c68d
- PASS `admission`: manual NO_AUTO_AUTHORITY, vechi FOREIGN_OR_STALE_OBSERVATION, actor FOREIGN_OR_STALE_OBSERVATION, sesiune FOREIGN_OR_STALE_OBSERVATION, profil lipsă MISSING_PROFILE; refuzate: token REFUSED, versiune REFUSED, traversare inconsistentă REFUSED, distanță negativă REFUSED, mecanică REFUSED

**Sumar: 15/15 verificări, PASS.**
