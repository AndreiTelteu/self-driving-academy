# 186 — învățare extinsă pentru pickup și confortul pasagerilor

Generat de `scripts/run-v2-pickup-learning-report.mjs` din contractul `186-pickup-estimator-v1`.
Fiecare cheie se estimează numai din scenariul ei eligibil; o cheie fără dovezi suficiente rămâne `UNOBSERVED`, nu primește o valoare inventată.

## Cheie → scenariu → context → estimare → incertitudine → validare independentă

| Cheie | Scenariu | Context eligibil | Estimare | Incertitudine | Prag de incertitudine | Validare pe date independente |
| --- | --- | --- | ---: | ---: | ---: | --- |
| `pickup_approach_speed` | `PICKUP_APPROACH` | un tick de fază PICKUP în care oprirea este permisă de pragurile obligatorii și în care plafonul cinematic nu leagă: comanda este `min(cheie, sqrt(2 · comfort_deceleration · distanță))`, deci viteza raportată este chiar cheia; o comandă pe plafon dovedește doar `cheie ≥ plafon` | 3.0000 m/s | ±0.0500 m/s | 0.5 m/s | VALIDATED, 2 episoade, valoare 3.0000, eroare 0.0000 ≤ 0.5 |
| `pickup_curb_distance` | `PICKUP_CURB` | un tick de fază PICKUP cu oprirea permisă, în care distanța efectivă la bordură este strict în interiorul benzii autorate: `clamp(cheie, 0,15 m, adâncime − ecartament)` este identitatea, deci valoarea raportată este cheia; o valoare pe oricare margine este unilaterală | 0.5000 m | ±0.0500 m | 0.15 m | VALIDATED, 8 episoade, valoare 0.5000, eroare 0.0000 ≤ 0.15 |
| `pickup_stop_precision` | `PICKUP_PRECISION` | un tick de fază PICKUP cu oprirea permisă, în care toleranța efectivă nu atinge nici podeaua fizică de 0,05 m, nici plafonul `min(punct, lungime − punct)`: valoarea este cheia, iar o valoare la plafon este ambiguă | 1.0000 m | ±0.0500 m | 0.25 m | VALIDATED, 8 episoade, valoare 1.0000, eroare 0.0000 ≤ 0.25 |
| `pickup_dwell_time` | `PICKUP_DWELL` | un tick de fază PICKUP cu oprirea permisă, în care staționarea efectivă este strict peste podeaua `max(3 s, M stop_dwell_time)`: valoarea raportată este cheia; pe podea, orice cheie sub ea produce aceeași durată | 5.0000 s | ±0.1500 s | 0.5 s | VALIDATED, 8 episoade, valoare 5.0000, eroare 0.0000 ≤ 0.5 |
| `dropoff_approach_speed` | `DROPOFF_APPROACH` | același plafon cinematic, pe un tick de fază DROPOFF cu oprirea permisă: viteza raportată sub plafon este a doua preferință de apropiere, distinctă de cea de pickup | 3.0000 m/s | ±0.0500 m/s | 0.5 m/s | VALIDATED, 2 episoade, valoare 3.0000, eroare 0.0000 ≤ 0.5 |
| `dropoff_curb_distance` | `DROPOFF_CURB` | aceeași bandă autorată a bordurii, pe un tick de fază DROPOFF cu oprirea permisă: distanța efectivă din interiorul benzii este a doua preferință de bordură | 0.5000 m | ±0.0500 m | 0.15 m | VALIDATED, 4 episoade, valoare 0.5000, eroare 0.0000 ≤ 0.15 |
| `occupied_acceleration_scale` | `OCCUPIED_ACCELERATION` | un tick cu pasager la bord (061 `TO_DROPOFF`/`DROPOFF`) în care scara este aplicată și niciun plafon nu leagă: `comandat / desired_acceleration` este cheia; sub plafonul de confort sau de aderență, comanda dovedește doar `cheie ≥ plafon / bază` | 0.8500 ratio | ±0.0200 ratio | 0.15 ratio | VALIDATED, 8 episoade, valoare 0.8500, eroare 0.0000 ≤ 0.15 |
| `occupied_lateral_accel_scale` | `OCCUPIED_LATERAL_ACCEL` | același tick cu pasager la bord, pe canalul lateral: `comandat / curve_lateral_accel` este cheia numai când `min(curve_lateral_accel, aderență)` nu taie cererea | 0.8500 ratio | ±0.0200 ratio | 0.12 ratio | VALIDATED, 8 episoade, valoare 0.8500, eroare 0.0000 ≤ 0.12 |

Split explicit cu seed 186: 32 episoade admise, fără suprapunere între estimare și validare.

## Cazuri fără dovezi identificabile

| Cheie | Scenariu | Demonstrație | Stare | Motiv | Excluderi |
| --- | --- | --- | --- | --- | --- |
| `pickup_approach_speed` | `PICKUP_APPROACH` | cheie de 8 m/s pe apropierea reală de 7,75 m: plafonul cinematic de 5,567764 m/s o taie | UNOBSERVED | PICKUP_APPROACH_SPEED_SATURATED | PICKUP_APPROACH_SPEED_SATURATED×4 |
| `pickup_approach_speed` | `PICKUP_APPROACH` | ego oprit exact pe punctul marcat: plafonul este 0 m/s, un zero structural, nu o preferință | UNOBSERVED | PICKUP_APPROACH_SPEED_SATURATED | PICKUP_APPROACH_SPEED_SATURATED×4 |
| `pickup_curb_distance` | `PICKUP_CURB` | cheie de 0,10 m sub rezerva de caroserie: comanda este podeaua de 0,15 m | UNOBSERVED | CURB_DISTANCE_FLOOR_SATURATED | CURB_DISTANCE_FLOOR_SATURATED×4 |
| `pickup_curb_distance` | `PICKUP_CURB` | cheie de 2 m pe bay-ul real de 3,00 m: plafonul sedanului este 1,20 m | UNOBSERVED | CURB_DISTANCE_BAND_SATURATED | CURB_DISTANCE_BAND_SATURATED×4 |
| `pickup_stop_precision` | `PICKUP_PRECISION` | cheie de 1 m pe un punct marcat la 0,50 m de margine: plafonul este 0,50 m | UNOBSERVED | PICKUP_STOP_PRECISION_CAP_SATURATED | PICKUP_STOP_PRECISION_CAP_SATURATED×4 |
| `pickup_dwell_time` | `PICKUP_DWELL` | cheie de 1 s sub dovada de îmbarcare de 3 s: comanda este podeaua | UNOBSERVED | PICKUP_DWELL_FLOOR_SATURATED | PICKUP_DWELL_FLOOR_SATURATED×4 |
| `pickup_dwell_time` | `PICKUP_DWELL` | cheie de 3 s sub un M `stop_dwell_time` de 4 s: podeaua M urcă la 4 s | UNOBSERVED | PICKUP_DWELL_FLOOR_SATURATED | PICKUP_DWELL_FLOOR_SATURATED×4 |
| `occupied_acceleration_scale` | `OCCUPIED_ACCELERATION` | cheie de 1,5 cu `desired_acceleration` 1,5: confortul taie cererea de 2,25 m/s² la 2 m/s² | UNOBSERVED | OCCUPIED_ACCELERATION_SCALE_CAP_SATURATED | OCCUPIED_ACCELERATION_SCALE_CAP_SATURATED×4 |
| `occupied_acceleration_scale` | `OCCUPIED_ACCELERATION` | cheie de 1,5 pe `reduced-adhesion` cu `desired` 4: anvelopa taie la 4,46355 m/s² | UNOBSERVED | OCCUPIED_ACCELERATION_SCALE_CAP_SATURATED | OCCUPIED_ACCELERATION_SCALE_CAP_SATURATED×4 |
| `occupied_lateral_accel_scale` | `OCCUPIED_LATERAL_ACCEL` | cheie de 1,5 pe `reduced-adhesion` cu `curve_lateral_accel` 8: anvelopa taie la 4,46355 m/s² | UNOBSERVED | OCCUPIED_LATERAL_ACCEL_SCALE_CAP_SATURATED | OCCUPIED_LATERAL_ACCEL_SCALE_CAP_SATURATED×4 |
| `occupied_acceleration_scale` | `OCCUPIED_ACCELERATION` | cabină goală (`TO_PICKUP`): scara longitudinală este inertă | UNOBSERVED | PASSENGER_NOT_ABOARD | PASSENGER_NOT_ABOARD×4 |
| `occupied_lateral_accel_scale` | `OCCUPIED_LATERAL_ACCEL` | cabină goală (`TO_PICKUP`): scara laterală este inertă | UNOBSERVED | PASSENGER_NOT_ABOARD | PASSENGER_NOT_ABOARD×4 |
| `pickup_approach_speed` | `PICKUP_APPROACH` | zonă reală cu accesul TAXI refuzat: refuzul ascunde toate cele patru preferințe de pickup | UNOBSERVED | PREFERENCE_MASKED_BY_ZONE_ACCESS | PREFERENCE_MASKED_BY_ZONE_ACCESS×4, ZONE_NOT_TAXI×4 |
| `pickup_curb_distance` | `PICKUP_CURB` | zonă reală cu accesul TAXI refuzat: refuzul ascunde toate cele patru preferințe de pickup | UNOBSERVED | PREFERENCE_MASKED_BY_ZONE_ACCESS | PREFERENCE_MASKED_BY_ZONE_ACCESS×4, ZONE_NOT_TAXI×4 |
| `pickup_stop_precision` | `PICKUP_PRECISION` | zonă reală cu accesul TAXI refuzat: refuzul ascunde toate cele patru preferințe de pickup | UNOBSERVED | PREFERENCE_MASKED_BY_ZONE_ACCESS | PREFERENCE_MASKED_BY_ZONE_ACCESS×4, ZONE_NOT_TAXI×4 |
| `pickup_dwell_time` | `PICKUP_DWELL` | zonă reală cu accesul TAXI refuzat: refuzul ascunde toate cele patru preferințe de pickup | UNOBSERVED | PREFERENCE_MASKED_BY_ZONE_ACCESS | PREFERENCE_MASKED_BY_ZONE_ACCESS×4, ZONE_NOT_TAXI×4 |
| `dropoff_curb_distance` | `DROPOFF_CURB` | zona reală `sz:2-2`, numai CIVIL: cele două preferințe de dropoff sunt ascunse | UNOBSERVED | PREFERENCE_MASKED_BY_ZONE_ACCESS | PREFERENCE_MASKED_BY_ZONE_ACCESS×4, ZONE_NOT_TAXI×4 |
| `dropoff_approach_speed` | `DROPOFF_APPROACH` | fază DROPOFF pe o zonă autorată PICKUP: tipul zonei refuză oprirea | UNOBSERVED | PREFERENCE_MASKED_BY_ZONE_KIND | PREFERENCE_MASKED_BY_ZONE_KIND×4, ZONE_KIND_MISMATCH×4 |
| `pickup_approach_speed` | `PICKUP_APPROACH` | ego la 3,00 m după punctul marcat, deci după ieșirea din bay | UNOBSERVED | PREFERENCE_MASKED_BY_BEYOND_ZONE | PREFERENCE_MASKED_BY_BEYOND_ZONE×4, STOP_BEYOND_ZONE×4 |
| `pickup_curb_distance` | `PICKUP_CURB` | bay de 1,90 m, mai îngust decât ecartamentul plus rezerva de 0,15 m | UNOBSERVED | PREFERENCE_MASKED_BY_NARROW_BAY | BAY_TOO_NARROW×4, PREFERENCE_MASKED_BY_NARROW_BAY×4 |
| `pickup_stop_precision` | `PICKUP_PRECISION` | punct marcat la 0,02 m de marginea bay-ului: nicio toleranță admisibilă nu încape | UNOBSERVED | PREFERENCE_MASKED_BY_STOP_WINDOW | PREFERENCE_MASKED_BY_STOP_WINDOW×4, STOP_WINDOW_TOO_TIGHT×4 |
| `pickup_curb_distance` | `PICKUP_CURB` | demonstrații MANUAL, neeligibile | UNOBSERVED | NO_ELIGIBLE_EPISODES | — |
| `pickup_curb_distance` | `PICKUP_CURB` | demonstrații fără prefix utilizabil | UNOBSERVED | NO_ELIGIBLE_EPISODES | — |
| `pickup_curb_distance` | `PICKUP_CURB` | set fără episoade | UNOBSERVED | NO_ELIGIBLE_EPISODES | — |

## Constrângeri de grup

- `PICKUP_AND_DROPOFF_SHARE_ZONE_REFUSALS` (pickup_approach_speed, pickup_curb_distance, pickup_stop_precision, pickup_dwell_time, dropoff_approach_speed, dropoff_curb_distance): Pickup și dropoff folosesc aceeași zonă autorată 032 și aceleași praguri obligatorii: un refuz de acces TAXI, de tip de zonă sau de poziție ascunde simultan preferințele ambelor faze. Refuzul nu este o măsurătoare a preferinței și nu se extrapolează dintr-o fază în cealaltă, chiar dacă 185 raportează un număr și pe tick-ul blocat.
- `TAXI_REFUSAL_HIDES_ALL_FOUR_PICKUP_PREFERENCES` (pickup_approach_speed, pickup_curb_distance, pickup_stop_precision, pickup_dwell_time): Un singur refuz obligatoriu — zona fără acces TAXI — lasă neobservate toate cele patru preferințe de pickup deodată: apropierea, bordura, precizia și staționarea sunt calculate de 185 pe același tick, dar oprirea nu are loc, deci niciuna nu este demonstrată. Estimatorul numără refuzul o dată per episod și per cheie, nu patru valori.
- `PRECISION_AND_DWELL_BELONG_TO_PICKUP_PHASE` (pickup_stop_precision, pickup_dwell_time): Precizia opririi și staționarea aparțin fazei de pickup: 185 nu le calculează pe faza de dropoff, iar catalogul 092 nu are chei echivalente pentru dropoff. Un set de dropoff nu poate estima niciodată aceste două chei, iar un set de pickup nu poate estima viteza și bordura de dropoff.
- `APPROACH_CAP_DEPENDS_ON_COMFORT_AND_DISTANCE` (pickup_approach_speed, dropoff_approach_speed): Viteza de apropiere este `min(cheie, sqrt(2 · comfort_deceleration · distanță))`: când plafonul cinematic leagă, comanda dovedește doar `cheie ≥ plafon`, iar plafonul depinde de cheia M `comfort_deceleration` și de distanța până la punctul marcat, nu de preferință. Cele două chei de apropiere împart formula, dar nu și faptul: fiecare are faza ei.
- `CURB_BAND_CLAMP_SHARES_PICKUP_AND_DROPOFF` (pickup_curb_distance, dropoff_curb_distance): Ambele preferințe de bordură sunt tăiate de aceeași bandă autorată `[0,15 m, adâncime − ecartament]`. Podeaua de 0,15 m ascunde capătul de jos al catalogului (0,1–0,15 m), iar plafonul depinde de adâncimea bay-ului și de ecartamentul clasei: pe bay-ul real de 3,00 m un sedan are plafonul 1,20 m, deci cheile 1,20–2 m nu sunt identificabile pe acea zonă.
- `PRECISION_WINDOW_CLAMP_IS_AMBIGUOUS_AT_THE_CAP` (pickup_stop_precision): Toleranța de oprire este `clamp(cheie, 0,05 m, min(punct, lungime − punct))`. Plafonul este semilățimea ferestrei marcate: când comanda raportează exact plafonul cu flagul `capped`, cheia poate fi orice valoare mai mare, deci estimatorul raportează saturația, nu plafonul. O cheie exact egală cu plafonul rămâne observabilă, pentru că 185 nu o marchează `capped`.
- `DWELL_FLOOR_HIDES_SUB_FLOOR_KEYS` (pickup_dwell_time): Staționarea efectivă este `max(cheie, 3 s, M stop_dwell_time)`. Podeaua de îmbarcare de 3 s acoperă banda 1–3 s a catalogului, iar un M `stop_dwell_time` mai mare mută podeaua și mai sus: pe podea, nicio valoare a cheii nu este identificabilă, iar durata raportată nu este preferința.
- `OCCUPIED_SCALES_CAPPED_BY_COMFORT_AND_ADHESION` (occupied_acceleration_scale, occupied_lateral_accel_scale): Ambele scări sunt `min(cheie · M, plafon de confort, aderență)`. Când oricare plafon leagă — `comfort_deceleration` sau `curve_lateral_accel` pentru longitudinal, respectiv `curve_lateral_accel` sau `grip · tireGripScale · g` pentru lateral — comanda este chiar plafonul, iar cheia nu este separabilă de el. Estimatorul păstrează doar marginea `cheie ≥ plafon / bază` și nu raportează niciodată plafonul ca estimare.
- `OCCUPIED_SCALES_ONLY_WITH_PASSENGER` (occupied_acceleration_scale, occupied_lateral_accel_scale): Scările sunt inerte fără pasager: pe `TO_PICKUP`, `PICKUP` sau `COMPLETED` comanda raportează accelerația M livrată, indiferent de cheie. Numai starea 061 `TO_DROPOFF`/`DROPOFF` produce o demonstrație, deci un set fără pasager la bord lasă ambele chei neobservate chiar dacă raportează valori numerice.
- `PICKUP_KEYS_FROM_ONE_STOP` (pickup_approach_speed, pickup_curb_distance, pickup_stop_precision, pickup_dwell_time, dropoff_approach_speed, dropoff_curb_distance, occupied_acceleration_scale, occupied_lateral_accel_scale): Un tick de serviciu 185 raportează simultan apropierea, bordura, precizia și staționarea fazei lui, dar fiecare cheie are faptul ei: plafonul cinematic, banda bordurii, fereastra marcată și podeaua de îmbarcare. Un refuz obligatoriu le ascunde pe toate, iar un tick fără serviciu nu produce niciuna. Nicio cheie nu este dedusă din alta, iar scările cer un tick ocupat separat.

## Intrări refuzate

- `key-pickup_curb_distance-1`: NOT_LEARNING_ELIGIBLE
- `key-pickup_curb_distance-2`: NOT_LEARNING_ELIGIBLE
- `key-pickup_curb_distance-3`: NOT_LEARNING_ELIGIBLE
- `key-pickup_curb_distance-4`: NOT_LEARNING_ELIGIBLE
- `key-pickup_approach_speed-1`: DUPLICATE_EPISODE

## Compatibilitate cu 185

- Zonele reale: pickup `sz:0-0`, dropoff `sz:1-0`; bay de **5.50 m**, punct marcat la 2.75 m, adâncime 3.00 m.
- Apropiere: **3.0000 m/s**, plafonul cinematic 5.5678 m/s la 7.7500 m; distanța de oprire 2.2500 m, proiecția opririi -2.7500 m.
- Bordură: **0.5000 m** în banda [0.1500, 1.2000] m.
- Precizie: **1.0000 m**, fereastra [1.7500, 3.7500] m.
- Staționare: **5.0000 s** peste podeaua de 3.0000 s.
- Dropoff: **3.0000 m/s** și **0.5000 m**.
- Accelerația ocupată: **1.2750 m/s²** = cheie · 1.5000 m/s², plafon `NONE`.
- Accelerația laterală ocupată: **5.1000 m/s²** = cheie · 6.0000 m/s², plafon `NONE`.
- Versiune politică: `185-pickup-policy-v2`, candidat-only true, semantică schimbată false, rată de tick 60 Hz, dovada de poziție 0.05 m, rezerva de caroserie 0.15 m.

## Determinism

- Seed 186: `fnv1a32:2f6c0cae`.
- Rulare repetată: `fnv1a32:2f6c0cae`.

## Catalog 092

| Cheie | Interval | Implicit | Unitate |
| --- | ---: | ---: | --- |
| `pickup_approach_speed` | 0.5–8 | 3 | m/s |
| `pickup_curb_distance` | 0.1–2 | 0.5 | m |
| `pickup_stop_precision` | 0.2–5 | 1 | m |
| `pickup_dwell_time` | 1–10 | 3 | s |
| `dropoff_approach_speed` | 0.5–8 | 3 | m/s |
| `dropoff_curb_distance` | 0.1–2 | 0.5 | m |
| `occupied_acceleration_scale` | 0.3–1.5 | 0.85 | ratio |
| `occupied_lateral_accel_scale` | 0.3–1.5 | 0.85 | ratio |

## Verificări

- PASS `contexts-eight-distinct`: opt chei și opt scenarii distincte: pickup_approach_speed=PICKUP_APPROACH, pickup_curb_distance=PICKUP_CURB, pickup_stop_precision=PICKUP_PRECISION, pickup_dwell_time=PICKUP_DWELL, dropoff_approach_speed=DROPOFF_APPROACH, dropoff_curb_distance=DROPOFF_CURB, occupied_acceleration_scale=OCCUPIED_ACCELERATION, occupied_lateral_accel_scale=OCCUPIED_LATERAL_ACCEL
- PASS `scenario-pickup-approach`: apropiere reală de 7,75 m: 3.0000 m/s; faza de dropoff și scările rămân neobservate
- PASS `scenario-pickup-curb`: oprit pe punctul marcat: bordură 0.5000 m; a doua preferință de bordură rămâne neobservată
- PASS `scenario-pickup-precision`: fereastră marcată de 2,75 m: toleranță 1.0000 m
- PASS `scenario-pickup-dwell`: peste podeaua de 3 s: staționare 5.0000 s
- PASS `scenario-dropoff-approach`: apropiere de dropoff 3.0000 m/s; preferințele de pickup rămân neobservate
- PASS `scenario-dropoff-curb`: bordură de dropoff 0.5000 m; bordură de pickup neobservată
- PASS `scenario-occupied-acceleration`: pasager la bord, fără serviciu: scară 0.8500; niciun fapt de oprire
- PASS `scenario-occupied-lateral`: același pasager, canalul lateral: scară 0.8500
- PASS `uncertainty-reported`: pickup_approach_speed ±0.0500 ≤ 0.5 m/s, pickup_curb_distance ±0.0500 ≤ 0.15 m, pickup_stop_precision ±0.0500 ≤ 0.25 m, pickup_dwell_time ±0.1500 ≤ 0.5 s, dropoff_approach_speed ±0.0500 ≤ 0.5 m/s, dropoff_curb_distance ±0.0500 ≤ 0.15 m, occupied_acceleration_scale ±0.0200 ≤ 0.15 ratio, occupied_lateral_accel_scale ±0.0200 ≤ 0.12 ratio
- PASS `uncertainty-per-key-threshold`: pickup_approach_speed ±0.5256 > 0.5, pickup_curb_distance ±0.3942 > 0.15, pickup_stop_precision ±0.5913 > 0.25, pickup_dwell_time ±0.5913 > 0.5, dropoff_approach_speed ±0.5256 > 0.5, dropoff_curb_distance ±0.3942 > 0.15, occupied_acceleration_scale ±0.1971 > 0.15, occupied_lateral_accel_scale ±0.1511 > 0.12
- PASS `validation-split`: seed 186: fiecare cheie se validează pe episoade ținute deoparte (pickup_approach_speed 2+2, pickup_curb_distance 8+8, pickup_stop_precision 8+8, pickup_dwell_time 8+8, dropoff_approach_speed 2+2, dropoff_curb_distance 4+4, occupied_acceleration_scale 8+8, occupied_lateral_accel_scale 8+8)
- PASS `validation-too-small`: trei episoade lasă 1 episod de validare, raportat TOO_SMALL
- PASS `low-band-is-honest`: minimul catalogului rămâne candidat demonstrat (0,5 m/s, 0,2 m, 0,3), iar benzile ascunse de podea sunt raportate saturate, nu ca valori
- PASS `structural-zero-not-a-preference`: un plafon de 0 m/s la punctul marcat este structural: nu devine o preferință de 0 m/s
- PASS `refusal-taxi-masks-four`: accesul TAXI refuzat lasă neobservate simultan toate cele patru preferințe de pickup, deși comanda 185 raportează în continuare un număr pe tick-ul blocat
- PASS `refusal-civil-only-dropoff`: zona reală `sz:2-2` fără TAXI ascunde ambele preferințe de dropoff
- PASS `refusal-kind-mismatch`: o fază de dropoff pe o zonă PICKUP este refuzată de tipul zonei, nu de preferință
- PASS `refusal-beyond-zone`: un ego după ieșirea din bay nu demonstrează nicio preferință de oprire
- PASS `refusal-narrow-bay`: un bay mai îngust decât ecartamentul plus rezervă refuză oprirea înainte de orice cheie
- PASS `refusal-tight-window`: o fereastră de oprire sub toleranța fizică refuză oprirea, deci și precizia
- PASS `precision-cap-ambiguous`: cheia de 1 m pe un plafon de 0,5 m rămâne saturată; cheia exact 0,5 m rămâne observabilă (0.5000 m)
- PASS `curb-both-sides`: banda autorată este un clamp cu două laturi: podeaua de 0,15 m și plafonul de 1,20 m sunt raportate ca saturații, nu ca valori
- PASS `dwell-floor`: podeaua de îmbarcare de 3 s și un M `stop_dwell_time` de 4 s ascund banda de sub ele
- PASS `occupied-comfort-cap`: cheia de 1,5 cere 2,25 m/s², dar confortul comandă 2 m/s²: plafonul nu este estimarea cheii
- PASS `occupied-adhesion-cap`: pe `reduced-adhesion` anvelopa de 4,46355 m/s² taie înaintea scării, pe ambele canale
- PASS `occupied-inert-without-passenger`: fără pasager la bord scara nu se aplică, deci valorile raportate nu sunt dovezi
- PASS `no-fabricated-values`: 24 demonstrații neobservate au valoare null și motiv explicit
- PASS `group-constraints`: PICKUP_AND_DROPOFF_SHARE_ZONE_REFUSALS, TAXI_REFUSAL_HIDES_ALL_FOUR_PICKUP_PREFERENCES, PRECISION_AND_DWELL_BELONG_TO_PICKUP_PHASE, APPROACH_CAP_DEPENDS_ON_COMFORT_AND_DISTANCE, CURB_BAND_CLAMP_SHARES_PICKUP_AND_DROPOFF, PRECISION_WINDOW_CLAMP_IS_AMBIGUOUS_AT_THE_CAP, DWELL_FLOOR_HIDES_SUB_FLOOR_KEYS, OCCUPIED_SCALES_CAPPED_BY_COMFORT_AND_ADHESION, OCCUPIED_SCALES_ONLY_WITH_PASSENGER, PICKUP_KEYS_FROM_ONE_STOP
- PASS `invalid-input-refused`: o valoare NaN este refuzată; key-pickup_curb_distance-1:NOT_LEARNING_ELIGIBLE, key-pickup_curb_distance-2:NOT_LEARNING_ELIGIBLE, key-pickup_curb_distance-3:NOT_LEARNING_ELIGIBLE, key-pickup_curb_distance-4:NOT_LEARNING_ELIGIBLE, key-pickup_approach_speed-1:DUPLICATE_EPISODE
- PASS `determinism`: digest fnv1a32:2f6c0cae
- PASS `catalog-ranges`: pickup_approach_speed 3.0000 m/s, pickup_curb_distance 0.5000 m, pickup_stop_precision 1.0000 m, pickup_dwell_time 5.0000 s, dropoff_approach_speed 3.0000 m/s, dropoff_curb_distance 0.5000 m, occupied_acceleration_scale 0.8500 ratio, occupied_lateral_accel_scale 0.8500 ratio
- PASS `policy-compatibility`: 185 citește estimarea fără schimbare de semantică: apropiere 3.0000 m/s, bordură 0.5000 m, precizie 1.0000 m, staționare 5.0000 s, dropoff 3.0000 m/s și 0.5000 m, accelerație 1.2750 m/s² (NONE), lateral 5.1000 m/s² (NONE)

**Sumar: 33/33 verificări, 8 chei candidate, 24 demonstrații neobservate, PASS.**
