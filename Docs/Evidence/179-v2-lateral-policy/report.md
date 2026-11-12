# 179 — raport politică extinsă pentru control lateral și viraje

Generat de `scripts/run-v2-lateral-policy-report.mjs` din contractul `179-lateral-policy-v2`.
Fiecare rând compară aceeași scenă cu valoarea joasă și valoarea ridicată a unei singure chei,
peste proiecția reală `049-lateral-v1` a tick-ului.

## Scenariile

| Scenariu | Descriere |
| --- | --- |
| deplasare față de centrul benzii | bandă autorată de 4 m pe un drum drept, fără abatere laterală: deplasarea țintă față de centrul benzii, în metri |
| răspunsul comenzii de direcție | viraj autorat de 15,7 m, cu 049 cerând −0,170 rad la roată și starea pornind de la 0: numărul de tick-uri până la prima mișcare a direcției |
| limita de viteză a comenzii de direcție | același viraj, cu răspunsul la minim: pasul de unghi la roată aplicat la prima mișcare, în radiani pe tick |
| viteza de intrare în viraj | viraj autorat de 15,7 m cu `curve_lateral_accel` 2,5 m/s²: viteza de intrare comandată, în m/s |
| accelerația la ieșirea din viraj | ieșirea din viraj pe drumul drept, cu latch-ul de viraj purtat din tick-ul anterior: accelerația preferată la ieșire, în m/s² |
| tăierea virajului | viraj autorat de 15,7 m: deplasarea spre interiorul curbei, în metri (magnitudine) |
| spațiul lateral liber | obstacol declarat la 4 m de centrul benzii, lat de 1 m, deci 2,6 m liberi între caroserie și obstacol: dacă manevra laterală este permisă |
| banda moartă a corecției | viraj autorat cu abatere laterală de 0,3 m: dacă corecția de cross-track este activă |

## Efectul izolat al fiecărei chei

| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `lane_center_offset` | deplasare față de centrul benzii | -1 | -0.900 | 1 | 0.900 | 1.800 | m | coridorul 049 este `4/2 − 1,8/2 − 0,2 = 0,9 m`, deci și −1 m și +1 m sunt plafonate la ±0,9 m: roțile nu părăsesc banda autorată |
| `steering_response_time` | răspunsul comenzii de direcție | 0.05 | 3.000 | 1.5 | 90.000 | 87.000 | ticks | intervalul mort este `max(1, ceil(cheie · 60))`: 0,05 s ține comanda 3 tick-uri, 1,5 s o ține 90 de tick-uri, iar limita de rată nu schimbă momentul primei mișcări |
| `steering_rate_limit` | limita de viteză a comenzii de direcție | 0.1 | 0.002 | 4 | 0.025 | 0.023 | rad | pasul este `min(cheie, 1,5 rad/s) / 60`: 0,1 rad/s dă 0,001667 rad/tick, iar 4 rad/s este plafonat la 1,5 rad/s, adică 0,025 rad/tick |
| `turn_entry_speed` | viteza de intrare în viraj | 1 | 1.000 | 18 | 6.269 | 5.269 | m/s | plafonul de aderență este `min(sqrt(2,5 · 15,719), avizul 049)` = 6,269 m/s: cheia de 18 m/s nu poate intra în viraj peste limita fizică |
| `turn_exit_acceleration` | accelerația la ieșirea din viraj | 0.2 | 0.200 | 6 | 1.500 | 1.300 | m/s² | accelerația este plafonată de cheia M `desired_acceleration` (1,5 m/s²): cheia de 6 m/s² nu cere niciodată mai mult decât stilul deja livrat de 047 |
| `corner_cutting_bias` | tăierea virajului | 0 | 0.000 | 1 | 0.900 | 0.900 | m | tăierea este `cheie · coridor` (0,9 m) spre interiorul curbei, în același coridor ca deplasarea de bandă; virajul autorat este la stânga, deci deplasarea este negativă |
| `lateral_clearance` | spațiul lateral liber | 0.1 | 1.000 | 3 | 0.000 | -1.000 | ratio | spațiul efectiv este `max(cheie, 1,8 + 0,2)` = 2,0 m la minimum și 3,0 m la maximum; 2,6 m liberi permit trecerea la 2,0 m și o interzic la 3,0 m |
| `lateral_correction_deadband` | banda moartă a corecției | 0 | 1.000 | 0.6 | 0.000 | -1.000 | ratio | abaterea de 0,3 m este sub banda de 0,6 m, deci corecția se oprește; peste bandă rămâne numai urmărirea de geometrie a lui 049 |

## Separarea cheilor (fiecare cheie inertă în celelalte scenarii)

| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `steering_response_time` | deplasare față de centrul benzii | 0.05 | 0.000 | 1.5 | 0.000 | 0.000 | m | `steering_response_time` este inertă în scenariul deplasare față de centrul benzii |
| `steering_rate_limit` | deplasare față de centrul benzii | 0.1 | 0.000 | 4 | 0.000 | 0.000 | m | `steering_rate_limit` este inertă în scenariul deplasare față de centrul benzii |
| `turn_entry_speed` | deplasare față de centrul benzii | 1 | 0.000 | 18 | 0.000 | 0.000 | m | `turn_entry_speed` este inertă în scenariul deplasare față de centrul benzii |
| `turn_exit_acceleration` | deplasare față de centrul benzii | 0.2 | 0.000 | 6 | 0.000 | 0.000 | m | `turn_exit_acceleration` este inertă în scenariul deplasare față de centrul benzii |
| `corner_cutting_bias` | deplasare față de centrul benzii | 0 | 0.000 | 1 | 0.000 | 0.000 | m | `corner_cutting_bias` este inertă în scenariul deplasare față de centrul benzii |
| `lateral_clearance` | deplasare față de centrul benzii | 0.1 | 0.000 | 3 | 0.000 | 0.000 | m | `lateral_clearance` este inertă în scenariul deplasare față de centrul benzii |
| `lateral_correction_deadband` | deplasare față de centrul benzii | 0 | 0.000 | 0.6 | 0.000 | 0.000 | m | `lateral_correction_deadband` este inertă în scenariul deplasare față de centrul benzii |
| `lane_center_offset` | răspunsul comenzii de direcție | -1 | 3.000 | 1 | 3.000 | 0.000 | ticks | `lane_center_offset` este inertă în scenariul răspunsul comenzii de direcție |
| `steering_rate_limit` | răspunsul comenzii de direcție | 0.1 | 3.000 | 4 | 3.000 | 0.000 | ticks | `steering_rate_limit` este inertă în scenariul răspunsul comenzii de direcție |
| `turn_entry_speed` | răspunsul comenzii de direcție | 1 | 3.000 | 18 | 3.000 | 0.000 | ticks | `turn_entry_speed` este inertă în scenariul răspunsul comenzii de direcție |
| `turn_exit_acceleration` | răspunsul comenzii de direcție | 0.2 | 3.000 | 6 | 3.000 | 0.000 | ticks | `turn_exit_acceleration` este inertă în scenariul răspunsul comenzii de direcție |
| `corner_cutting_bias` | răspunsul comenzii de direcție | 0 | 3.000 | 1 | 3.000 | 0.000 | ticks | `corner_cutting_bias` este inertă în scenariul răspunsul comenzii de direcție |
| `lateral_clearance` | răspunsul comenzii de direcție | 0.1 | 3.000 | 3 | 3.000 | 0.000 | ticks | `lateral_clearance` este inertă în scenariul răspunsul comenzii de direcție |
| `lateral_correction_deadband` | răspunsul comenzii de direcție | 0 | 3.000 | 0.6 | 3.000 | 0.000 | ticks | `lateral_correction_deadband` este inertă în scenariul răspunsul comenzii de direcție |
| `lane_center_offset` | limita de viteză a comenzii de direcție | -1 | 0.002 | 1 | 0.002 | 0.000 | rad | `lane_center_offset` este inertă în scenariul limita de viteză a comenzii de direcție |
| `steering_response_time` | limita de viteză a comenzii de direcție | 0.05 | 0.002 | 1.5 | 0.002 | 0.000 | rad | `steering_response_time` este inertă în scenariul limita de viteză a comenzii de direcție |
| `turn_entry_speed` | limita de viteză a comenzii de direcție | 1 | 0.002 | 18 | 0.002 | 0.000 | rad | `turn_entry_speed` este inertă în scenariul limita de viteză a comenzii de direcție |
| `turn_exit_acceleration` | limita de viteză a comenzii de direcție | 0.2 | 0.002 | 6 | 0.002 | 0.000 | rad | `turn_exit_acceleration` este inertă în scenariul limita de viteză a comenzii de direcție |
| `corner_cutting_bias` | limita de viteză a comenzii de direcție | 0 | 0.002 | 1 | 0.002 | 0.000 | rad | `corner_cutting_bias` este inertă în scenariul limita de viteză a comenzii de direcție |
| `lateral_clearance` | limita de viteză a comenzii de direcție | 0.1 | 0.002 | 3 | 0.002 | 0.000 | rad | `lateral_clearance` este inertă în scenariul limita de viteză a comenzii de direcție |
| `lateral_correction_deadband` | limita de viteză a comenzii de direcție | 0 | 0.002 | 0.6 | 0.002 | 0.000 | rad | `lateral_correction_deadband` este inertă în scenariul limita de viteză a comenzii de direcție |
| `lane_center_offset` | viteza de intrare în viraj | -1 | 1.000 | 1 | 1.000 | 0.000 | m/s | `lane_center_offset` este inertă în scenariul viteza de intrare în viraj |
| `steering_response_time` | viteza de intrare în viraj | 0.05 | 1.000 | 1.5 | 1.000 | 0.000 | m/s | `steering_response_time` este inertă în scenariul viteza de intrare în viraj |
| `steering_rate_limit` | viteza de intrare în viraj | 0.1 | 1.000 | 4 | 1.000 | 0.000 | m/s | `steering_rate_limit` este inertă în scenariul viteza de intrare în viraj |
| `turn_exit_acceleration` | viteza de intrare în viraj | 0.2 | 1.000 | 6 | 1.000 | 0.000 | m/s | `turn_exit_acceleration` este inertă în scenariul viteza de intrare în viraj |
| `corner_cutting_bias` | viteza de intrare în viraj | 0 | 1.000 | 1 | 1.000 | 0.000 | m/s | `corner_cutting_bias` este inertă în scenariul viteza de intrare în viraj |
| `lateral_clearance` | viteza de intrare în viraj | 0.1 | 1.000 | 3 | 1.000 | 0.000 | m/s | `lateral_clearance` este inertă în scenariul viteza de intrare în viraj |
| `lateral_correction_deadband` | viteza de intrare în viraj | 0 | 1.000 | 0.6 | 1.000 | 0.000 | m/s | `lateral_correction_deadband` este inertă în scenariul viteza de intrare în viraj |
| `lane_center_offset` | accelerația la ieșirea din viraj | -1 | 0.200 | 1 | 0.200 | 0.000 | m/s² | `lane_center_offset` este inertă în scenariul accelerația la ieșirea din viraj |
| `steering_response_time` | accelerația la ieșirea din viraj | 0.05 | 0.200 | 1.5 | 0.200 | 0.000 | m/s² | `steering_response_time` este inertă în scenariul accelerația la ieșirea din viraj |
| `steering_rate_limit` | accelerația la ieșirea din viraj | 0.1 | 0.200 | 4 | 0.200 | 0.000 | m/s² | `steering_rate_limit` este inertă în scenariul accelerația la ieșirea din viraj |
| `turn_entry_speed` | accelerația la ieșirea din viraj | 1 | 0.200 | 18 | 0.200 | 0.000 | m/s² | `turn_entry_speed` este inertă în scenariul accelerația la ieșirea din viraj |
| `corner_cutting_bias` | accelerația la ieșirea din viraj | 0 | 0.200 | 1 | 0.200 | 0.000 | m/s² | `corner_cutting_bias` este inertă în scenariul accelerația la ieșirea din viraj |
| `lateral_clearance` | accelerația la ieșirea din viraj | 0.1 | 0.200 | 3 | 0.200 | 0.000 | m/s² | `lateral_clearance` este inertă în scenariul accelerația la ieșirea din viraj |
| `lateral_correction_deadband` | accelerația la ieșirea din viraj | 0 | 0.200 | 0.6 | 0.200 | 0.000 | m/s² | `lateral_correction_deadband` este inertă în scenariul accelerația la ieșirea din viraj |
| `lane_center_offset` | tăierea virajului | -1 | 0.000 | 1 | 0.000 | 0.000 | m | `lane_center_offset` este inertă în scenariul tăierea virajului |
| `steering_response_time` | tăierea virajului | 0.05 | 0.000 | 1.5 | 0.000 | 0.000 | m | `steering_response_time` este inertă în scenariul tăierea virajului |
| `steering_rate_limit` | tăierea virajului | 0.1 | 0.000 | 4 | 0.000 | 0.000 | m | `steering_rate_limit` este inertă în scenariul tăierea virajului |
| `turn_entry_speed` | tăierea virajului | 1 | 0.000 | 18 | 0.000 | 0.000 | m | `turn_entry_speed` este inertă în scenariul tăierea virajului |
| `turn_exit_acceleration` | tăierea virajului | 0.2 | 0.000 | 6 | 0.000 | 0.000 | m | `turn_exit_acceleration` este inertă în scenariul tăierea virajului |
| `lateral_clearance` | tăierea virajului | 0.1 | 0.000 | 3 | 0.000 | 0.000 | m | `lateral_clearance` este inertă în scenariul tăierea virajului |
| `lateral_correction_deadband` | tăierea virajului | 0 | 0.000 | 0.6 | 0.000 | 0.000 | m | `lateral_correction_deadband` este inertă în scenariul tăierea virajului |
| `lane_center_offset` | spațiul lateral liber | -1 | 1.000 | 1 | 1.000 | 0.000 | ratio | `lane_center_offset` este inertă în scenariul spațiul lateral liber |
| `steering_response_time` | spațiul lateral liber | 0.05 | 1.000 | 1.5 | 1.000 | 0.000 | ratio | `steering_response_time` este inertă în scenariul spațiul lateral liber |
| `steering_rate_limit` | spațiul lateral liber | 0.1 | 1.000 | 4 | 1.000 | 0.000 | ratio | `steering_rate_limit` este inertă în scenariul spațiul lateral liber |
| `turn_entry_speed` | spațiul lateral liber | 1 | 1.000 | 18 | 1.000 | 0.000 | ratio | `turn_entry_speed` este inertă în scenariul spațiul lateral liber |
| `turn_exit_acceleration` | spațiul lateral liber | 0.2 | 1.000 | 6 | 1.000 | 0.000 | ratio | `turn_exit_acceleration` este inertă în scenariul spațiul lateral liber |
| `corner_cutting_bias` | spațiul lateral liber | 0 | 1.000 | 1 | 1.000 | 0.000 | ratio | `corner_cutting_bias` este inertă în scenariul spațiul lateral liber |
| `lateral_correction_deadband` | spațiul lateral liber | 0 | 1.000 | 0.6 | 1.000 | 0.000 | ratio | `lateral_correction_deadband` este inertă în scenariul spațiul lateral liber |
| `lane_center_offset` | banda moartă a corecției | -1 | 1.000 | 1 | 1.000 | 0.000 | ratio | `lane_center_offset` este inertă în scenariul banda moartă a corecției |
| `steering_response_time` | banda moartă a corecției | 0.05 | 1.000 | 1.5 | 1.000 | 0.000 | ratio | `steering_response_time` este inertă în scenariul banda moartă a corecției |
| `steering_rate_limit` | banda moartă a corecției | 0.1 | 1.000 | 4 | 1.000 | 0.000 | ratio | `steering_rate_limit` este inertă în scenariul banda moartă a corecției |
| `turn_entry_speed` | banda moartă a corecției | 1 | 1.000 | 18 | 1.000 | 0.000 | ratio | `turn_entry_speed` este inertă în scenariul banda moartă a corecției |
| `turn_exit_acceleration` | banda moartă a corecției | 0.2 | 1.000 | 6 | 1.000 | 0.000 | ratio | `turn_exit_acceleration` este inertă în scenariul banda moartă a corecției |
| `corner_cutting_bias` | banda moartă a corecției | 0 | 1.000 | 1 | 1.000 | 0.000 | ratio | `corner_cutting_bias` este inertă în scenariul banda moartă a corecției |
| `lateral_clearance` | banda moartă a corecției | 0.1 | 1.000 | 3 | 1.000 | 0.000 | ratio | `lateral_clearance` este inertă în scenariul banda moartă a corecției |

## Siguranță: coridor, rată, minim de spațiu, aderență și dominanța 049

| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `plafonul deplasării de bandă` | banda de 4 m, cheia +1 m, sedan (coridor 0,9 m) | 0 | 0.000 | 1 | 0.900 | 0.900 | m | deplasarea este plafonată la coridorul 049 de 0.900000 m; pe clasa compact coridorul este 1.000000 m, deci cheia de 1 m încape fără plafonare |
| `plafonul de rată al direcției` | cheia 0,1 rad/s și cheia 4 rad/s, răspuns la minim: pasul aplicat | 0.1 | 0.002 | 4 | 0.025 | 0.023 | rad | rata efectivă la cheia 4 rad/s este 1.5 rad/s, deci pasul rămâne 0.025000 rad/tick, nu 0.066667; comanda nu devine un salt |
| `minimul de spațiu lateral (sedan)` | cheia minimă 0,1 m și maximă 3 m, clasa sedan: spațiul efectiv | 0.1 | 2.000 | 3 | 3.000 | 1.000 | m | minimul este lățimea de cale plus marjă (1,8 + 0,2 = 2,0 m): cheia de 0,1 m nu poate coborî sub el, iar 3 m urcă peste |
| `minimul de spațiu lateral (compact)` | cheia minimă 0,1 m, clasa compact: spațiul efectiv | 0.1 | 1.800 | 0.1 | 1.800 | 0.000 | m | pentru compact minimul este 1,6 + 0,2 = 1,8 m, derivat din geometria clasei și nu dintr-o constantă globală |
| `vetoul de spațiu lateral` | 1,5 m liberi între caroserie și obstacol, cheia minimă 0,1 m | 0.1 | 0.000 | 3 | 0.000 | 0.000 | ratio | CLEARANCE_HOLD: 1.500 m liberi sub minimul efectiv 2.000 m, deci nici cheia minimă nu permite trecerea |
| `plafonul de aderență la intrarea în viraj` | grilă de 18 valori ale cheii pe virajul de 15,7 m | 1 | 1.000 | 18 | 6.269 | 5.269 | m/s | niciuna din cele 18 valori nu depășește plafonul de aderență 6.268769 m/s, sub cheia maximă de 18 m/s |
| `proiecția 049 inutilizabilă` | observație discontinuă, toate cheile la maxim | 0 | 0.000 | 1 | 1.000 | 1.000 | ratio | PROJECTION_UNUSABLE (OBSERVATION_DISCONTINUITY); direcția rămâne 0.000000 rad și nicio cheie nu inventează o comandă |
| `proiecție veche refuzată` | proiecția 049 din alt tick, cheile neutre | 0 | 0.000 | 1 | 1.000 | 1.000 | ratio | FOREIGN_OR_STALE_PROJECTION; un rezultat 049 care nu aparține tick-ului nu este acceptat |
| `proiecție străină refuzată` | proiecția 049 a altui actor, cheile neutre | 0 | 0.000 | 1 | 1.000 | 1.000 | ratio | FOREIGN_OR_STALE_PROJECTION; actorul proiecției trebuie să fie subiectul deciziei |
| `banda moartă nu oprește urmărirea` | abatere 0,3 m, banda moartă 0 și 0,6 m, 12 tick-uri | 0 | -0.220 | 0.6 | -0.170 | 0.050 | rad | cu banda 0,6 m corecția este false și direcția urmărește exact geometria 049 (-0.170107 rad); cu banda 0 corecția adaugă deviația și direcția ajunge la -0.219927 rad |
| `valorile din afara catalogului` | cheia `lane_center_offset` la 2 m și la 1 m | 2 | 0.000 | 1 | 1.000 | 1.000 | ratio | 2 m este refuzat de catalog înainte de orice efect; 1 m este admis și plafonat la coridor |

## Compatibilitate cu cheile M

- Proiecții 049 identice cu cheile R neutre vs active: **60/60 tick-uri**.
- Comenzi neutre care reproduc exact direcția 049 pe drumul drept: **60 tick-uri**.
- Tick-uri active care diferă de comanda neutră: **60**, diferență maximă de unghi **0.100000 rad**.
- Plafonul de aderență urmează `curve_lateral_accel`: 2.5 m/s² -> 6.268769 m/s, 8 m/s² -> 7.483315 m/s.
- Plafonul de ieșire urmează `desired_acceleration`: 1.5 m/s² -> 1.500000 m/s², 4 m/s² -> 4.000000 m/s².
- Unități M: `curve_lateral_accel` m/s², `desired_acceleration` m/s².
- Unități R: `lane_center_offset` m, `steering_response_time` s, `steering_rate_limit` rad/s, `turn_entry_speed` m/s, `turn_exit_acceleration` m/s², `corner_cutting_bias` ratio, `lateral_clearance` m, `lateral_correction_deadband` m.

## Parametrii din catalog

| Cheie | Unitate | Minim | Maxim | Default |
| --- | --- | ---: | ---: | ---: |
| `lane_center_offset` | m | -1 | 1 | 0 |
| `steering_response_time` | s | 0.05 | 1.5 | 0.3 |
| `steering_rate_limit` | rad/s | 0.1 | 4 | 1 |
| `turn_entry_speed` | m/s | 1 | 18 | 5 |
| `turn_exit_acceleration` | m/s² | 0.2 | 6 | 1.5 |
| `corner_cutting_bias` | ratio | 0 | 1 | 0 |
| `lateral_clearance` | m | 0.1 | 3 | 0.8 |
| `lateral_correction_deadband` | m | 0 | 0.6 | 0.1 |

## Determinism

- 8 tick-uri: `fnv1a32:3a40c2b1`.
- Rulare repetată: `fnv1a32:3a40c2b1`.

## Verificări

- PASS `key-lane-center-offset`: deplasare țintă -0.900 -> 0.900 m
- PASS `key-steering-response-time`: prima mișcare după 3 -> 90 tick-uri
- PASS `key-steering-rate-limit`: pas 0.001667 -> 0.025000 rad/tick
- PASS `key-turn-entry-speed`: viteză 1.000 -> 6.269 m/s
- PASS `key-turn-exit-acceleration`: accelerație 0.200 -> 1.500 m/s²
- PASS `key-corner-cutting-bias`: tăiere 0.000 -> 0.900 m
- PASS `key-lateral-clearance`: manevră permisă 1 -> 0
- PASS `key-lateral-correction-deadband`: corecție activă 1 -> 0
- PASS `safety-offset-corridor`: sedan 0.900 m din 1 m; compact 1.000 m din 1 m
- PASS `safety-steering-rate-ceiling`: 4 rad/s este plafonat: pas 0.025000 rad/tick, nu 0.066667
- PASS `safety-clearance-floor`: minim 2 m sedan / 1.8 m compact; 1,5 m liberi sunt refuzați
- PASS `safety-adherence-ceiling`: maxim pe grilă 6.268769 m/s; cu curve_lateral_accel 8 m/s² plafonul urcă la 7.483315 m/s, tot sub 18
- PASS `safety-projection-dominant`: proiecția inutilizabilă, veche sau străină este refuzată înaintea oricărei chei
- PASS `safety-deadband-keeps-tracking`: corecția este oprită, dar direcția atinge -0.170107 rad, exact geometria 049
- PASS `keys-separated`: 56 perechi de separare, toate cu diferența 0
- PASS `catalog-ranges`: lane_center_offset -1-1 m, steering_response_time 0.05-1.5 s, steering_rate_limit 0.1-4 rad/s, turn_entry_speed 1-18 m/s, turn_exit_acceleration 0.2-6 m/s², corner_cutting_bias 0-1 ratio, lateral_clearance 0.1-3 m, lateral_correction_deadband 0-0.6 m
- PASS `units`: lane_center_offset m, steering_response_time s, steering_rate_limit rad/s, turn_entry_speed m/s, turn_exit_acceleration m/s², corner_cutting_bias ratio, lateral_clearance m, lateral_correction_deadband m
- PASS `m-compatible`: 60/60 proiecții 049 identice; 60/60 comenzi neutre reproduc direcția 049; 60 tick-uri active diferă; plafonul de ieșire urmează cheia M 1,5 -> 4 m/s²
- PASS `determinism`: digest fnv1a32:3a40c2b1

**Sumar: 19/19 verificări, PASS.**
