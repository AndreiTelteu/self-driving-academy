# 180 — învățare extinsă pentru control lateral și viraje

Dovezile PBI 180 pentru contractul `180-lateral-estimator-v2` din
[`src/learning/lateral-v2-estimator.ts`](../../../src/learning/lateral-v2-estimator.ts).

Estimatorul inversează aritmetica deja livrată de `179-lateral-policy-v2`: cele opt chei R se
măsoară numai din faptele pe care comanda 179 reală le raportează în tick-ul ei, niciodată din
profil. Este candidat-only: nu publică profile, nu scrie în store, nu schimbă semantica 179 și nu
flipă flagurile `implemented` din catalogul 092.

## Tabelul celor opt chei

Sursa numerelor: `Docs/Evidence/180-v2-lateral-learning/report.json`, generat determinist cu seed
180 din 32 de episoade reale (comenzi 049 + 179), dintre care 16 de estimare și 16 de validare, fără
suprapunere.

| Cheie | Scenariu | Cum se măsoară (faptul din comanda 179) | Estimare | Incertitudine / prag | Validare independentă |
| --- | --- | --- | ---: | ---: | --- |
| `lane_center_offset` | `LANE_OFFSET` | ținta de deplasare în interiorul coridorului 049, unde `clamp` este identitatea | **0,4000 m** | ±0,0200 / 0,15 m | VALIDATED, 16 episoade, eroare 0,0000 |
| `steering_response_time` | `STEERING_RESPONSE` | tick-urile de comandă ținută înainte de primul pas nenul, confirmate de `responseTicks = 21` | **0,3417 s** (20,5/60) | ±0,0200 / 0,2 s | VALIDATED, 4 episoade, eroare 0,0000 |
| `steering_rate_limit` | `STEERING_RATE` | pasul saturat aplicat față de ținta commitată, `pas · 60` | **0,6000 rad/s** | ±0,0500 / 0,25 rad/s | VALIDATED, 4 episoade, eroare 0,0000 |
| `turn_entry_speed` | `TURN_ENTRY_SPEED` | limita de viteză în viraj sub plafonul de aderență | **3,5000 m/s** | ±0,0500 / 0,8 m/s | VALIDATED, 10 episoade, eroare 0,0000 |
| `turn_exit_acceleration` | `TURN_EXIT_ACCELERATION` | accelerația de pe primul tick după viraj, sub plafonul M | **0,9000 m/s²** | ±0,0500 / 0,25 m/s² | VALIDATED, 2 episoade, eroare 0,0000 |
| `corner_cutting_bias` | `CORNER_CUTTING` | `\|cornerCutM\| / coridor` într-un viraj real | **0,3000** | ±0,0200 / 0,15 | VALIDATED, 10 episoade, eroare 0,0000 |
| `lateral_clearance` | `OBSTACLE_CLEARANCE` | spațiul efectiv față de un obstacol declarat, peste podeaua vehiculului | **2,4000 m** | ±0,0500 / 0,15 m | VALIDATED, 2 episoade, eroare 0,0000 |
| `lateral_correction_deadband` | `CORRECTION_DEADBAND` | intersecția inegalităților `\|eroare\| > cheie` (inactiv la 0,09 m, activ la 0,11 m) | **0,1000 m** | ±0,0200 / 0,12 m | VALIDATED, 16 episoade, eroare 0,0000 |

Fiecare cheie are propriul context eligibil, propriul prag de incertitudine și propria validare pe
episoade ținute deoparte. Un zero demonstrat rămâne candidat: ținta exact pe centrul benzii
(`lane_center_offset = 0`) și tăierea de 0 m într-un viraj real (`corner_cutting_bias = 0`) produc
`CANDIDATE` cu valoarea `0` și validare `VALIDATED`.

## Cazuri neidentificabile (15 demonstrații `UNOBSERVED`)

| Cheie | Demonstrație | Motiv raportat |
| --- | --- | --- |
| `lane_center_offset` | chei de ±1 m pe o bandă de 4 m | `OFFSET_CORRIDOR_SATURATED` (coridorul de 0,9 m ascunde tot peste el) |
| `steering_response_time` | fereastră tăiată înainte de reacție | `RESPONSE_CENSORED` |
| `steering_response_time` | fereastră care începe după recunoașterea țintei | `RESPONSE_LATCH_MISSING` |
| `steering_rate_limit` | cheie de 4 rad/s | `STEERING_RATE_CEILING_SATURATED` (pasul rămâne 0,025 rad/tick) |
| `turn_entry_speed` | cheie de 18 m/s | `TURN_ENTRY_ADHERENCE_SATURATED` (plafon 6,2688 m/s) |
| `turn_exit_acceleration` | cheie de 6 m/s² | `TURN_EXIT_ACCELERATION_SATURATED` (plafon M 1,5 m/s²) |
| `turn_exit_acceleration` | fereastră fără tick-ul de după viraj | `NO_TURN_EXIT_EPISODE` |
| `lateral_clearance` | chei de 0,5–1,2 m pe sedan | `LATERAL_CLEARANCE_FLOOR_SATURATED` (podeaua de 2,0 m) |
| `lateral_correction_deadband` | corecție care nu se activează niciodată | `DEADBAND_UPPER_BOUND_UNOBSERVED` |
| `lateral_correction_deadband` | corecție care se activează mereu | `DEADBAND_LOWER_BOUND_UNOBSERVED` |
| `lateral_correction_deadband` | inactivă la 0,2 m și activă la 0,02 m | `CONTRADICTORY_DEADBAND_BOUNDS` |
| `lateral_correction_deadband` | interval real, dar prea larg (0–0,55 m) | `UNCERTAINTY_ABOVE_THRESHOLD` (prag 0,12 m) |
| `lane_center_offset` | episoade `MANUAL` | `NO_ELIGIBLE_EPISODES` (refuzate `NOT_LEARNING_ELIGIBLE`) |
| `lane_center_offset` | episoade fără prefix utilizabil | `NO_ELIGIBLE_EPISODES` (refuzate `NO_USABLE_PREFIX`) |
| `lane_center_offset` | set fără episoade | `NO_ELIGIBLE_EPISODES` |

Aceeași comandă de 1,9 m este exactă pe clasa compact (podeaua 1,8 m) și plafonată pe sedan
(podeaua 2,0 m), deci podeaua urmează mecanica livrată, nu o constantă a estimatorului.

## Constrângeri de grup explicate

1. `RATE_CEILING_HIDES_HIGH_KEYS` — plafonul explicit de 1,5 rad/s face identice toate cheile din
   banda 1,5–4 rad/s.
2. `CLEARANCE_FLOOR_HIDES_LOW_KEYS` — podeaua `ecartament + 0,2 m` ascunde banda 0,1–2,0 m.
3. `ENTRY_SPEED_ADHERENCE_CEILING` — `min(sqrt(curve_lateral_accel · rază), avizul 049)` ascunde tot
   peste 6,2688 m/s pe virajul de 15,7 m.
4. `EXIT_ACCELERATION_M_CAP` — cheia M `desired_acceleration` plafonează ieșirea, iar ieșirea
   trăiește pe un singur tick de tranziție.
5. `CORRIDOR_CLAMP_SHARES_OFFSET_AND_CUT` — deplasarea de bandă și tăierea împart coridorul și
   ordinea ramurilor.
6. `DEAD_TIME_AND_CORRECTION_SHARE_LATCH` — timpul mort și corecția depind de continuitatea
   latch-ului purtat de apelant.
7. `LATERAL_KEYS_FROM_ONE_TICK` — ordinea ramurilor 179 hotărăște ce fapte există într-un tick, iar
   un tick poate purta simultan deplasarea, tăierea și corecția, fără derivare între ele.

## Compatibilitate cu 179 (citire fără schimbare de semantică)

Cu valorile estimate, comanda reală 179 raportează: coridor 0,9000 m, țintă 0,4000 m, 21 de tick-uri
până la prima reacție, pas 0,0100 rad/tick (0,6000 rad/s), intrare 3,5000 m/s sub plafonul de
6,2688 m/s, ieșire 0,9000 m/s², tăiere −0,2700 m (0,3000 · 0,9000), spațiu efectiv 2,4000 m peste
podeaua de 2,0000 m cu manevra permisă, corecție inactivă la 0,5000 m și activă la 0,5010 m. O
rulare de 30 de tick-uri păstrează fiecare pas sub limita de 0,0100 rad/tick.

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`, fără erori) |
| `npm run lint` | PASS (`eslint . --max-warnings 0`, fără avertismente) |
| `npm run format:check` | PASS („All matched files use Prettier code style!") |
| `npm run check:architecture` | PASS (383 fișiere TypeScript, 6 + 4 + 3 probe negative respinse) |
| `npm run check:parameter-catalog` | PASS („Parameter catalog is synchronized.") |
| `npm test` | PASS: 3118 teste, 3118 trecute, 0 eșecuri, 100923,76 ms |
| `node --import ./scripts/register-typescript.mjs --test tests/learning/lateral-v2-estimator.test.ts` | PASS: 16 teste, 16 trecute, 0 eșecuri |
| `npm run lateral:learning` | 30/30 verificări PASS, 8 chei candidate, 15 demonstrații neobservate, digest `fnv1a32:de102d60`, overall PASS |
| `npm run lateral:learning -- --check` | PASS: `report.json` și `report.md` sunt actuale, cod de ieșire 0 |

## Fișiere atinse

- Creat: `src/learning/lateral-v2-estimator.ts` (contractul `180-lateral-estimator-v2`).
- Creat: `tests/learning/lateral-v2-estimator-reference.ts` (fixturi deterministe din comenzile 049 + 179 reale).
- Creat: `tests/learning/lateral-v2-estimator-report.ts` (raportul determinist și tabelul din `report.md`).
- Creat: `tests/learning/lateral-v2-estimator.test.ts` (16 teste deterministe).
- Creat: `scripts/run-v2-lateral-learning-report.mjs` (scriptul de raport cu `--check`).
- Creat: `Docs/Evidence/180-v2-lateral-learning/report.json`, `report.md`, `README.md`.
- Modificat: `src/learning/index.ts` (export nou la finalul listei).
- Modificat: `package.json` (intrarea `lateral:learning` la finalul blocului `scripts`).
- Modificat: `Docs/10-invatarea-stilului.md` (secțiune nouă la final).
- Modificat: `PBI/To Do/180-v2_learn_7.md` → `PBI/Done/180-v2_learn_7.md` (mutare fizică).

## Limitări

- Valorile din fixturi sunt demonstrații plauzibile, nu date măsurate pe jucători: dovezile validează
  contractul de context, incertitudine, împărțire și refuz, nu calibrarea finală a stilului.
- Banda moartă a corecției este un prag strict, deci nu poate fi fixată exact: rezultatul este
  întotdeauna un interval, iar incertitudinea este jumătatea lățimii lui.
- Benzile ascunse de plafoane (1,5–4 rad/s, 0,1–2,0 m, peste 6,2688 m/s, 1,5–6 m/s², ±0,9 m coridor)
  rămân neobservate prin construcție; estimatorul nu le inventează și nu le raportează ca valori.
- Episoadele de ieșire și de spațiu lateral au nevoie de două familii de demonstrații fiecare, deci
  validarea lor se sprijină pe exact două episoade ținute deoparte.
