# Dovezi 108 — gate-ul de acoperire pentru cele 24 de chei M

Contract: `108-learning-gate24-v1`. Adapter de raport: `108-learning-gate24-app-v1`. Harness offline,
determinist, fără UI, worker, estimator propriu, publicare de profil, scriere în store sau mutare de
flotă. Gate-ul V1 este `CLOSED` numai la 24/24 chei validate.

## Fișiere

- `src/experiments/learning-gate24.ts` — matricea derivată din exporturile reale 092/093/086/094–099/
  105/107, regula de validare, motivele închise, semnătura deterministă și raportul înghețat.
- `src/app/learning-gate24.ts` — `readLearningGate24()` refolosește `runInverseLearningValidation()`
  și `runLearningEdgeCaseRegressions()`, plus `learningGate24Markdown()`; matricea poate fi injectată
  pentru teste.
- `tests/experiments/learning-gate24.test.ts` — 17 teste de contract.
- `tests/experiments/learning-gate24-report.ts` — raportul de dovezi cu 7 scenarii și verificările.
- `scripts/run-learning-gate24-report.mjs` — runnerul `npm run learning:gate24`.
- `Docs/learning-gate24.md` — contractul modulului.

## Comenzi și rezultate

| Comandă | Rezultat |
| --- | --- |
| `npm run learning:gate24` | gate `CLOSED`, 24/24 validate, 0 nevalidate, 48/48 verificări, 7 scenarii, overall PASS; scrie `report.json` și `report.md` |
| `npm run learning:gate24 -- --check` | raportul JSON și Markdown sunt actuale |
| `node --import ./scripts/register-typescript.mjs --test tests/experiments/learning-gate24.test.ts` | 17 teste, 17 pass |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run format:check` | PASS |
| `npm run check:architecture` | PASS (240 fișiere TypeScript) |
| `npm test` | 1622 teste, 1622 pass, 0 fail |

## Matricea reală

| Sursă | Rezultat citit |
| --- | --- |
| 092 `initial_learning_target` | exact 24 chei, niciun R/`extension` |
| 093 `parameterEvidenceSpecs` | 24 specificații, 7 canale, 2 contexte (`FREE_TRAFFIC`, `LEADER`) |
| 094–099 key sets | 6 proprietari, fiecare cheie cu exact un proprietar |
| 086 `opportunityKinds` | 5 tipuri; 12 chei `DEDICATED`, 12 chei `CARRIER` |
| 105 profile runs | 96 rezultate (24 chei × 4 profile), toate `WITHIN_TOLERANCE` |
| 107 cazuri | 13 cazuri; fiecare context are cel puțin un caz `POSITIVE` care trece |

Semnătura raportului real: `fnv1a64:a7dc00cd4e0dbc08`. Ea acoperă matricea, numărătorile, lista
nevalidată, defectele de matrice și statutul; un eșec injectat o schimbă.

## Dedicat versus carrier

- `DEDICATED` (12): `red_stop_probability`, `green_start_delay`, `red_stop_line_offset`,
  `late_red_brake_threshold`, `stop_full_probability`, `stop_dwell_time`, `stop_line_offset`,
  `yield_time_gap`, `lane_change_front_gap`, `lane_change_back_gap`, `lane_change_speed_gain`,
  `lane_change_cooldown`.
- `CARRIER` (12): `speed_delta_urban`, `speed_delta_residential`, `curve_lateral_accel`,
  `intersection_approach_speed`, `desired_acceleration`, `comfort_deceleration`, `acceleration_jerk`,
  `brake_reaction_delay`, `following_time_headway`, `following_min_gap`, `queue_standstill_gap`,
  `following_speed_gain`.

Vocabularul 086 nu are un tip dedicat pentru trafic liber sau urmărire. Cheile de viteză,
accelerație și urmărire sunt transportate de `GREEN`, iar coada oprită folosește și `STOP`; raportul
listează 16 relații carrier și nu pretinde o oportunitate dedicată. Cheile de semnal folosesc
`RED`/`GREEN`, cele de STOP/YIELD folosesc `STOP`/`YIELD`, iar cele de bandă folosesc `LANE_CHANGE`
ca oportunități dedicate.

## Chei nevalidate

Niciuna. Gate-ul real este `CLOSED` cu 24/24 chei validate. Raportul nu forțează închiderea: testele
demonstrează `OPEN` cu motive exacte pentru estimator lipsă (`NO_ESTIMATOR`), specificație 093 lipsă
(`NO_EVIDENCE_SPEC`), oportunitate lipsă (`NO_OPPORTUNITY`), scenariu lipsă (`NO_SCENARIO`), eșec 105
(`SCENARIO_FAILED`), context 107 lipsă (`NO_EDGE_CASE`) și proprietar duplicat (`DUPLICATE_OWNER`).
Un key set care nu este exact cele 24 ține gate-ul `OPEN` prin `M_KEY_SET_MISMATCH`/`FOREIGN_KEY`.

## Scenarii de dovezi

| Scenariu | Rezultat |
| --- | --- |
| `FULL_MATRIX` | `CLOSED`, 24/24, 12 verificări |
| `MISSING_ESTIMATOR` | `OPEN`, `NO_ESTIMATOR`, 5 verificări |
| `MISSING_OPPORTUNITY` | `OPEN`, `NO_OPPORTUNITY` pentru RED/LANE_CHANGE, 5 verificări |
| `FAILED_SCENARIO` | `OPEN`, `SCENARIO_FAILED`, 5 verificări |
| `CARRIER_TRANSPARENCY` | 12 carrier / 12 dedicated, 7 verificări |
| `DUPLICATE_INJECTED` | `OPEN` pentru owner duplicat, cheie străină și al 25-lea key, 8 verificări |
| `OPEN_VS_CLOSED` | invariantă de statut, numărători și motive, 6 verificări |

## Limitări

- Observațiile 105/107 sunt fixture-uri sintetice deterministe, nu sesiuni de gameplay capturate.
- Acoperirea 107 este la nivel de context: un caz pozitiv care observă `FREE_TRAFFIC` sau `LEADER`
  acoperă contextul cheii, dar nu produce el însuși estimarea. Estimarea independentă rămâne 105.
- Gate-ul citește rezultatele 105 existente; nu rulează estimatoare, worker-ul 103, blend-ul 101 sau
  validarea de delta 102.
- Nu există publicare, store, flotă, UI sau captură de browser; `effects` declară zero pentru toate
  cele trei operații, iar testul verifică faptul că registrul 092 rămâne neschimbat.
- `CLOSED` validează acoperirea celor 24 de chei M în acest harness, nu performanța jocului integrat
  și nu înlocuiește gate-urile 220/224.
