# 180 — învățare extinsă pentru control lateral și viraje

Generat de `scripts/run-v2-lateral-learning-report.mjs` din contractul `180-lateral-estimator-v2`.
Fiecare cheie se estimează numai din scenariul ei eligibil; o cheie fără dovezi suficiente rămâne `UNOBSERVED`, nu primește o valoare inventată.

## Cheie → scenariu → context → estimare → incertitudine → validare independentă

| Cheie | Scenariu | Context eligibil | Estimare | Incertitudine | Prag de incertitudine | Validare pe date independente |
| --- | --- | --- | ---: | ---: | ---: | --- |
| `lane_center_offset` | `LANE_OFFSET` | o comandă 179 activă în care deplasarea țintă este în interiorul coridorului 049: `clamp(cheie, ±coridor)` este identitatea, deci ținta este chiar cheia; o țintă pe coridor dovedește doar `|cheie| ≥ coridor` | 0.4000 m | ±0.0200 m | 0.15 m | VALIDATED, 16 episoade, valoare 0.4000, eroare 0.0000 ≤ 0.15 |
| `steering_response_time` | `STEERING_RESPONSE` | un latch proaspăt în care o țintă nouă de direcție produce o reacție: numărul de tick-uri de comandă ținută înainte de primul pas nenul inversează `max(1, ceil(cheie · 60))`, iar valoarea raportată confirmă măsurătoarea | 0.3417 s | ±0.0200 s | 0.2 s | VALIDATED, 4 episoade, valoare 0.3417, eroare 0.0000 ≤ 0.2 |
| `steering_rate_limit` | `STEERING_RATE` | un pas de direcție aplicat când ținta commitată este mai departe decât un pas, deci pasul este saturat: `|pas| · 60` este cheia, iar un pas pe plafonul de 1,5 rad/s dovedește doar `cheie ≥ 1,5` | 0.6000 rad/s | ±0.0500 rad/s | 0.25 rad/s | VALIDATED, 4 episoade, valoare 0.6000, eroare 0.0000 ≤ 0.25 |
| `turn_entry_speed` | `TURN_ENTRY_SPEED` | un tick real în viraj (rază locală ≤ 40 m) în care comanda raportează limita de viteză și plafonul de aderență: `min(cheie, plafon)` sub plafon este cheia, iar o limită pe plafon este doar o margine inferioară | 3.5000 m/s | ±0.0500 m/s | 0.8 m/s | VALIDATED, 10 episoade, valoare 3.5000, eroare 0.0000 ≤ 0.8 |
| `turn_exit_acceleration` | `TURN_EXIT_ACCELERATION` | primul tick după viraj, cu latch-ul de viraj purtat din tick-ul anterior: `min(cheie, desired_acceleration)` sub plafonul M este cheia, iar o valoare pe plafon este doar o margine inferioară; un zero în afara ieșirii este structural | 0.9000 m/s² | ±0.0500 m/s² | 0.25 m/s² | VALIDATED, 2 episoade, valoare 0.9000, eroare 0.0000 ≤ 0.25 |
| `corner_cutting_bias` | `CORNER_CUTTING` | un tick real în viraj cu coridor pozitiv: tăierea este `cheie · coridor`, deci `|cornerCutM| / coridor` este cheia; în afara virajului tăierea este structural zero, iar o tăiere zero în viraj este un zero demonstrat | 0.3000 ratio | ±0.0200 ratio | 0.15 ratio | VALIDATED, 10 episoade, valoare 0.3000, eroare 0.0000 ≤ 0.15 |
| `lateral_clearance` | `OBSTACLE_CLEARANCE` | un tick activ cu un obstacol declarat, în care spațiul lateral disponibil este raportat: `max(cheie, ecartament + 0,2 m)` peste podea este cheia, iar o valoare pe podea este doar o margine superioară | 2.4000 m | ±0.0500 m | 0.15 m | VALIDATED, 2 episoade, valoare 2.4000, eroare 0.0000 ≤ 0.15 |
| `lateral_correction_deadband` | `CORRECTION_DEADBAND` | un tick activ în care abaterea laterală este cunoscută: corecția este activă exact când `|eroare| > cheie`, deci fiecare eșantion este o inegalitate, iar estimarea este intersecția lor, niciodată o valoare exactă | 0.1000 m | ±0.0200 m | 0.12 m | VALIDATED, 16 episoade, valoare 0.1000, eroare 0.0000 ≤ 0.1 |

Split explicit cu seed 180: 32 episoade admise, fără suprapunere între estimare și validare.

## Cazuri fără dovezi identificabile

| Cheie | Scenariu | Demonstrație | Stare | Motiv | Excluderi |
| --- | --- | --- | --- | --- | --- |
| `lane_center_offset` | `LANE_OFFSET` | deplasări de +1 m pe o bandă de 4 m: coridorul de 0,9 m le plafonează | UNOBSERVED | OFFSET_CORRIDOR_SATURATED | OFFSET_CORRIDOR_SATURATED×4 |
| `steering_response_time` | `STEERING_RESPONSE` | fereastră tăiată înainte de reacție: timpul mort este cenzat | UNOBSERVED | RESPONSE_CENSORED | RESPONSE_CENSORED×4 |
| `steering_response_time` | `STEERING_RESPONSE` | fereastră care începe după recunoașterea țintei: latch-ul lipsește | UNOBSERVED | RESPONSE_LATCH_MISSING | RESPONSE_LATCH_MISSING×4 |
| `steering_rate_limit` | `STEERING_RATE` | cheie de 4 rad/s: pasul este plafonat la 1,5 rad/s | UNOBSERVED | STEERING_RATE_CEILING_SATURATED | STEERING_RATE_CEILING_SATURATED×4 |
| `turn_entry_speed` | `TURN_ENTRY_SPEED` | cheie de 18 m/s: intrarea este plafonată de aderență la 6,269 m/s | UNOBSERVED | TURN_ENTRY_ADHERENCE_SATURATED | TURN_ENTRY_ADHERENCE_SATURATED×4 |
| `turn_exit_acceleration` | `TURN_EXIT_ACCELERATION` | cheie de 6 m/s²: ieșirea este plafonată de cheia M la 1,5 m/s² | UNOBSERVED | TURN_EXIT_ACCELERATION_SATURATED | TURN_EXIT_ACCELERATION_SATURATED×4 |
| `turn_exit_acceleration` | `TURN_EXIT_ACCELERATION` | fereastră care nu conține tick-ul de după viraj | UNOBSERVED | NO_TURN_EXIT_EPISODE | NO_TURN_EXIT_EPISODE×4 |
| `lateral_clearance` | `OBSTACLE_CLEARANCE` | chei de 0,5–1,2 m: podeaua de 2,0 m a sedanului le ascunde | UNOBSERVED | LATERAL_CLEARANCE_FLOOR_SATURATED | LATERAL_CLEARANCE_FLOOR_SATURATED×4 |
| `lateral_correction_deadband` | `CORRECTION_DEADBAND` | corecție care nu se activează niciodată: doar limita inferioară | UNOBSERVED | DEADBAND_UPPER_BOUND_UNOBSERVED | — |
| `lateral_correction_deadband` | `CORRECTION_DEADBAND` | corecție care se activează mereu: doar limita superioară | UNOBSERVED | DEADBAND_LOWER_BOUND_UNOBSERVED | — |
| `lateral_correction_deadband` | `CORRECTION_DEADBAND` | inactivă la eroarea de 0,2 m și activă la 0,02 m: limite incompatibile | UNOBSERVED | CONTRADICTORY_DEADBAND_BOUNDS | CONTRADICTORY_DEADBAND_BOUNDS×4 |
| `lateral_correction_deadband` | `CORRECTION_DEADBAND` | interval real, dar prea larg (0–0,55 m) pentru un prag de 0,12 m | UNOBSERVED | UNCERTAINTY_ABOVE_THRESHOLD | — |
| `lane_center_offset` | `LANE_OFFSET` | demonstrații MANUAL, neeligibile | UNOBSERVED | NO_ELIGIBLE_EPISODES | — |
| `lane_center_offset` | `LANE_OFFSET` | demonstrații fără prefix utilizabil | UNOBSERVED | NO_ELIGIBLE_EPISODES | — |
| `lane_center_offset` | `LANE_OFFSET` | set fără episoade | UNOBSERVED | NO_ELIGIBLE_EPISODES | — |

## Constrângeri de grup

- `RATE_CEILING_HIDES_HIGH_KEYS` (steering_rate_limit): Plafonul explicit al politicii, `maximumSteeringRateRadPerS = 1,5 rad/s`, face ca fiecare cheie din intervalul 1,5–4 rad/s al catalogului să producă exact același pas de 0,025 rad/tick: un pas pe plafon dovedește doar `cheie ≥ 1,5`, deci banda 1,5–4 rămâne neidentificabilă din comportament și cheia rămâne neobservată în loc să primească plafonul.
- `CLEARANCE_FLOOR_HIDES_LOW_KEYS` (lateral_clearance): Podeaua de siguranță `ecartament + 0,2 m` (2,0 m pentru sedan, 1,8 m pentru compact) transformă orice cheie sub ea în aceeași comandă: spațiul efectiv raportat este podeaua, deci tot intervalul 0,1–2,0 m al catalogului este ascuns și cheia rămâne neobservată.
- `ENTRY_SPEED_ADHERENCE_CEILING` (turn_entry_speed): Viteza de intrare este plafonată de aderență, `min(sqrt(curve_lateral_accel · rază), avizul 049)`: pe virajul de 15,7 m cu 2,5 m/s² plafonul este 6,269 m/s, deci nicio cheie peste el (catalogul merge până la 18 m/s) nu poate fi observată. Plafonul depinde de geometrie și de cheia M `curve_lateral_accel`, nu de stilul șoferului.
- `EXIT_ACCELERATION_M_CAP` (turn_exit_acceleration): Accelerația de ieșire este plafonată de cheia M `desired_acceleration` a lui 047: cu 1,5 m/s² orice cheie de la 1,5 la 6 m/s² produce aceeași comandă. Ea este și singura cheie măsurată pe un singur tick de tranziție, deci fereastra trebuie să conțină ambele tick-uri ale ieșirii; altfel ieșirea este cenzată, nu zero.
- `CORRIDOR_CLAMP_SHARES_OFFSET_AND_CUT` (lane_center_offset, corner_cutting_bias): Deplasarea de bandă și tăierea virajului împart același coridor 049 (`lățime/2 − ecartament/2 − 0,2 m`) și aceeași ordine de ramuri: tăierea se adaugă peste deplasarea deja plafonată și suma este plafonată din nou. O țintă sau o tăiere pe coridor nu distinge cheia de orice valoare mai mare, iar o tăiere este observabilă numai în viraj.
- `DEAD_TIME_AND_CORRECTION_SHARE_LATCH` (steering_response_time, lateral_correction_deadband): Timpul mort și corecția depind de continuitatea latch-ului purtat de apelant: timpul mort se numără numai dintr-o țintă nouă recunoscută după ce latch-ul s-a golit, iar corecția depinde de eroarea de cross-track a aceluiași tick. O fereastră care începe în mijlocul unui hold nu are reacție de măsurat, iar una tăiată înainte de reacție cenzează timpul mort.
- `LATERAL_KEYS_FROM_ONE_TICK` (lane_center_offset, steering_response_time, steering_rate_limit, turn_entry_speed, turn_exit_acceleration, corner_cutting_bias, lateral_clearance, lateral_correction_deadband): Cele opt chei pot apărea în aceeași călătorie, dar nu din același fapt: ordinea ramurilor 179 dă fiecărui tick o singură situație — refuz de proiecție, deplasare de bandă, tăiere, timp mort și pas de direcție, plafon de aderență în viraj, accelerație de ieșire, spațiu lateral sau corecție. Un set cu un singur tip de demonstrație lasă celelalte șapte chei neobservate.

## Intrări refuzate

- `key-lane_center_offset-1`: NOT_LEARNING_ELIGIBLE
- `key-lane_center_offset-2`: NOT_LEARNING_ELIGIBLE
- `key-lane_center_offset-3`: NOT_LEARNING_ELIGIBLE
- `key-lane_center_offset-4`: NOT_LEARNING_ELIGIBLE
- `key-lane_center_offset-1`: DUPLICATE_EPISODE

## Compatibilitate cu 179

- Coridorul 049 al benzii de 4 m: **0.9000 m**; deplasarea estimată 0.4000 m este chiar ținta raportată, iar cheia de 1 m este plafonată la 0.9000 m.
- Timpul mort: **21 tick-uri** până la prima reacție, adică `ceil(cheie · 60)` pentru cheia estimată.
- Rata: pasul aplicat este **0.0100 rad/tick** = 0.6000 rad/s; cheia de 4 rad/s produce 0.0250 rad/tick, adică plafonul de 1.5 rad/s.
- Intrarea în viraj: **3.5000 m/s** sub plafonul de aderență 6.2688 m/s.
- Ieșirea din viraj: **0.9000 m/s²**, sub plafonul M `desired_acceleration` de 1.5000 m/s².
- Tăierea virajului: **-0.2700 m** = cheie · coridor.
- Spațiul lateral: **2.4000 m** peste podeaua de 2.0000 m; manevra permisă true.
- Banda moartă: inactivă la eroarea de 0.1000 m (false) și activă imediat peste ea (true).
- Versiune politică: `179-lateral-policy-v2`, candidat-only true, semantică schimbată false, rată de tick 60 Hz.

## Determinism

- Seed 180: `fnv1a32:de102d60`.
- Rulare repetată: `fnv1a32:de102d60`.

## Catalog 092

| Cheie | Interval | Implicit | Unitate |
| --- | ---: | ---: | --- |
| `lane_center_offset` | -1–1 | 0 | m |
| `steering_response_time` | 0.05–1.5 | 0.3 | s |
| `steering_rate_limit` | 0.1–4 | 1 | rad/s |
| `turn_entry_speed` | 1–18 | 5 | m/s |
| `turn_exit_acceleration` | 0.2–6 | 1.5 | m/s² |
| `corner_cutting_bias` | 0–1 | 0 | ratio |
| `lateral_clearance` | 0.1–3 | 0.8 | m |
| `lateral_correction_deadband` | 0–0.6 | 0.1 | m |

## Verificări

- PASS `contexts-eight-distinct`: opt chei și opt scenarii distincte: lane_center_offset=LANE_OFFSET, steering_response_time=STEERING_RESPONSE, steering_rate_limit=STEERING_RATE, turn_entry_speed=TURN_ENTRY_SPEED, turn_exit_acceleration=TURN_EXIT_ACCELERATION, corner_cutting_bias=CORNER_CUTTING, lateral_clearance=OBSTACLE_CLEARANCE, lateral_correction_deadband=CORRECTION_DEADBAND
- PASS `scenario-offset`: bandă dreaptă: offset 0.4000 m; turn_entry_speed=UNOBSERVED, corner_cutting_bias=UNOBSERVED, turn_exit_acceleration=UNOBSERVED, lateral_clearance=UNOBSERVED
- PASS `scenario-response`: țintă de cross-track pe drum drept: 0.3417 s = 20,5/60; turn_entry_speed=UNOBSERVED, corner_cutting_bias=UNOBSERVED, turn_exit_acceleration=UNOBSERVED, lateral_clearance=UNOBSERVED
- PASS `scenario-rate`: pas saturat în viraj: 0.6000 rad/s; turn_exit_acceleration=UNOBSERVED, lateral_clearance=UNOBSERVED
- PASS `scenario-entry`: viraj de 15,7 m: intrare 3.5000 m/s; turn_exit_acceleration=UNOBSERVED, lateral_clearance=UNOBSERVED, steering_response_time=UNOBSERVED
- PASS `scenario-exit`: tick-ul de după viraj: ieșire 0.9000 m/s²; lateral_clearance=UNOBSERVED, steering_response_time=UNOBSERVED
- PASS `scenario-cut`: tăiere în viraj: 0.3000; turn_exit_acceleration=UNOBSERVED, lateral_clearance=UNOBSERVED, steering_response_time=UNOBSERVED
- PASS `scenario-clearance`: obstacol declarat la 6 m: spațiu 2.4000 m; turn_exit_acceleration=UNOBSERVED, steering_response_time=UNOBSERVED
- PASS `scenario-deadband`: inactivă la 0,09 m și activă la 0,11 m: bandă 0.1000 m; turn_entry_speed=UNOBSERVED, corner_cutting_bias=UNOBSERVED, turn_exit_acceleration=UNOBSERVED, lateral_clearance=UNOBSERVED
- PASS `uncertainty-reported`: lane_center_offset ±0.0200 ≤ 0.15 m, steering_response_time ±0.0200 ≤ 0.2 s, steering_rate_limit ±0.0500 ≤ 0.25 rad/s, turn_entry_speed ±0.0500 ≤ 0.8 m/s, turn_exit_acceleration ±0.0500 ≤ 0.25 m/s², corner_cutting_bias ±0.0200 ≤ 0.15 ratio, lateral_clearance ±0.0500 ≤ 0.15 m, lateral_correction_deadband ±0.0200 ≤ 0.12 m
- PASS `uncertainty-per-key-threshold`: lane_center_offset ±0.1643 > 0.15, steering_response_time ±0.2628 > 0.2, steering_rate_limit ±0.2957 > 0.25, turn_entry_speed ±1.1170 > 0.8, turn_exit_acceleration ±0.2628 > 0.25, corner_cutting_bias ±0.1971 > 0.15, lateral_clearance ±0.1971 > 0.15, lateral_correction_deadband ±0.2750 > 0.12
- PASS `validation-split`: seed 180: fiecare cheie se validează pe episoade ținute deoparte (lane_center_offset 16+16, steering_response_time 4+4, steering_rate_limit 4+4, turn_entry_speed 10+10, turn_exit_acceleration 2+2, corner_cutting_bias 10+10, lateral_clearance 2+2, lateral_correction_deadband 16+16)
- PASS `validation-too-small`: trei episoade lasă 1 episod de validare, raportat TOO_SMALL
- PASS `zero-offset-demostrat`: o țintă exact pe centrul benzii este un zero demonstrat, nu dovezi lipsă
- PASS `zero-cut-demostrat`: o tăiere de 0 m într-un viraj real este un zero demonstrat, distinct de lipsa virajului
- PASS `rate-ceiling`: patru chei de 4 rad/s produc același pas de 0.0250 rad/tick, adică 1.5000 rad/s: cheia rămâne neobservată
- PASS `clearance-floor`: cheile de 0,5–1,2 m sunt ascunse de podeaua de 2.0000 m a sedanului
- PASS `clearance-floor-follows-class`: aceeași comandă de 1,9 m este exactă pe clasa compact (podeaua 1,8 m) și plafonată pe sedan (2,0 m)
- PASS `entry-adherence-ceiling`: cheia de 18 m/s este plafonată de aderență la 6.2688 m/s: intrarea peste plafon nu este observabilă
- PASS `exit-m-cap`: cheia de 6 m/s² este plafonată de cheia M `desired_acceleration` la 1,5 m/s²: valoarea de ieșire rămâne doar o margine
- PASS `offset-corridor`: cheile de +1 m sunt plafonate la coridorul de 0.9000 m: ținta dovedește doar |cheie| ≥ coridor
- PASS `response-latch`: o fereastră tăiată înainte de reacție cenzează timpul mort, iar una care începe după recunoașterea țintei nu are latch de măsurat
- PASS `exit-window`: ieșirea se măsoară numai pe tick-ul de tranziție; o fereastră care se oprește în viraj nu are ieșire
- PASS `deadband-bounds`: o singură latură este doar o margine, două limite incompatibile nu au valoare, iar un interval prea larg rămâne neobservat
- PASS `no-fabricated-values`: 15 demonstrații neobservate au valoare null și motiv explicit
- PASS `group-constraints`: RATE_CEILING_HIDES_HIGH_KEYS, CLEARANCE_FLOOR_HIDES_LOW_KEYS, ENTRY_SPEED_ADHERENCE_CEILING, EXIT_ACCELERATION_M_CAP, CORRIDOR_CLAMP_SHARES_OFFSET_AND_CUT, DEAD_TIME_AND_CORRECTION_SHARE_LATCH, LATERAL_KEYS_FROM_ONE_TICK
- PASS `invalid-input-refused`: o valoare NaN este refuzată; key-lane_center_offset-1:NOT_LEARNING_ELIGIBLE, key-lane_center_offset-2:NOT_LEARNING_ELIGIBLE, key-lane_center_offset-3:NOT_LEARNING_ELIGIBLE, key-lane_center_offset-4:NOT_LEARNING_ELIGIBLE, key-lane_center_offset-1:DUPLICATE_EPISODE
- PASS `determinism`: digest fnv1a32:de102d60
- PASS `catalog-ranges`: lane_center_offset 0.4000 m, steering_response_time 0.3417 s, steering_rate_limit 0.6000 rad/s, turn_entry_speed 3.5000 m/s, turn_exit_acceleration 0.9000 m/s², corner_cutting_bias 0.3000 ratio, lateral_clearance 2.4000 m, lateral_correction_deadband 0.1000 m
- PASS `policy-compatibility`: 179 citește estimarea fără schimbare de semantică: offset 0.4000 m, 21 tick-uri până la reacție, pas 0.0100 rad/tick (0.6000 rad/s), intrare 3.5000 m/s sub plafonul 6.2688 m/s, ieșire 0.9000 m/s², tăiere -0.2700 m, spațiu 2.4000 m, bandă moartă inactivă la 0.5000 m și activă la 0.5010 m, 30 tick-uri sub limita de 0.0100 rad/tick

**Sumar: 30/30 verificări, 8 chei candidate, 15 demonstrații neobservate, PASS.**
