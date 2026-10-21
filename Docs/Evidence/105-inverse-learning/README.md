# Dovezi 105 — validare inversă pe profile cunoscute

Contract: `105-inverse-learning-v1`. Adapter de raport: `105-inverse-learning-app-v1`.
Harness offline, determinist, fără UI, worker, publicare de profil sau scriere în store.

## Fișiere

- `src/experiments/inverse-learning.ts` — profilele cunoscute, toleranțele, regulile de
  identificabilitate, generatorul de demonstrații, evaluarea și raportul înghețat.
- `src/app/inverse-learning.ts` — `runInverseLearningValidation()` și randarea Markdown.
- `tests/experiments/inverse-learning.test.ts` — 17 teste de contract.
- `tests/experiments/inverse-learning-report.ts` — raportul de dovezi și 46 de verificări.
- `scripts/run-inverse-learning-report.mjs` — runnerul `npm run learning:inverse`.

## Comenzi și rezultate

| Comandă | Rezultat |
| --- | --- |
| `npm run learning:inverse` | 46/46 verificări, 7 scenarii, overall PASS; scrie `report.json` și `report.md` |
| `npm run learning:inverse -- --check` | raportul JSON și Markdown sunt actuale |
| `node --import ./scripts/register-typescript.mjs --test tests/experiments/inverse-learning.test.ts` | 17 teste, 17 pass |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run format:check` | PASS |
| `npm run check:architecture` | PASS |
| `npm test` | PASS |

## Rezultate per profil

Fiecare profil rulează cele șase scenarii independente prin estimatoarele reale 094–099. Toate cele
24 de chei M sunt evaluate; nicio cheie R nu este inclusă.

| Scenariu | În toleranță | În afara | Neidentificabil | Fără estimare | Rezultat |
| --- | ---: | ---: | ---: | ---: | --- |
| `PROFILE_PRUDENT` | 24 | 0 | 0 | 0 | PASS |
| `PROFILE_IMPULSIVE` | 24 | 0 | 0 | 0 | PASS |
| `PROFILE_RECKLESS` | 24 | 0 | 0 | 0 | PASS |
| `PROFILE_MIXED` | 24 | 0 | 0 | 0 | PASS |
| `SPARSE_EVIDENCE` | 0 | 0 | 24 | 0 | PASS (nicio estimare fabricată) |
| `CONTRADICTORY_EVIDENCE` | 6 | 0 | 18 | 0 | PASS (pragurile contradictorii rămân neidentificate) |
| `OUT_OF_TOLERANCE_PROBE` | 23 | 1 | 0 | 0 | PASS (detectorul păstrează eșecul) |

Total: 168 rânduri per cheie — 125 `WITHIN_TOLERANCE`, 1 `OUTSIDE_TOLERANCE` (sondajul intenționat),
42 `NOT_IDENTIFIABLE`, 0 `NO_ESTIMATE`. `overall.profileFailures = 0`; `retainedProbeFailures = 1`.

Exemple de recuperare (țintă → estimare):

- `PRUDENT`: `speed_delta_urban` −2 → −1,996; `following_time_headway` 2,4 → 2,4002;
  `desired_acceleration` 1,2 → 1,2; `red_stop_probability` 1 → 1.
- `IMPULSIVE`: `speed_delta_urban` 3,5 → 3,5027; `following_time_headway` 1,1 → 1,1006;
  `stop_full_probability` 0,6 → 0,6.
- `RECKLESS`: `speed_delta_urban` 9 → 9,0029; `following_time_headway` 0,6 → 0,6005;
  `red_stop_probability` 0,35 → 0,35.
- `MIXED`: `speed_delta_urban` 1,5 → 1,497; `following_time_headway` 1,6 → 1,5999;
  `stop_full_probability` 0,85 → 0,85.

Cheile de interval (`yield_time_gap`, `lane_change_front_gap`, `lane_change_back_gap`,
`lane_change_speed_gain`) sunt raportate ca interval observat, cu `estimate: null`; de exemplu
`PRUDENT/yield_time_gap` țintă 4,5 → `[4,10, 4,90]`. Nicio valoare de mijloc nu este pretinsă a fi
prag exact.

## Sondajul intenționat în afara toleranței

`OUT_OF_TOLERANCE_PROBE` refolosește fluxul `PRUDENT` și injectează prin portul 094 valoarea
`speed_delta_urban = 2` pentru ținta −2. Raportul păstrează rândul ca `OUTSIDE_TOLERANCE`
(`absoluteError = 4`, toleranță efectivă 0,3) și îl listează în `retainedFailures`. Scenariul este marcat ca eșec așteptat: `passed` este adevărat numai pentru că eșecul a fost detectat și afișat.

## Reguli verificate

- Patru profile × 24 ținte explicite, în intervalele 092, fără chei R.
- 24 de toleranțe distincte, fiecare cu context și justificare concretă; limita efectivă este
  `absolute + relative × |target|`.
- 24 de reguli de identificabilitate, derivate din specificațiile 093.
- Șase scenarii independente, seed-uri derivate și observații deterministe (`randomUnit`, fără
  `Math.random`).
- `NOT_IDENTIFIABLE` are întotdeauna `estimate: null` și `interval: null`; o valoare injectată pentru
  o cheie neidentificabilă este anulată cu `UNIDENTIFIABLE_ESTIMATOR_VALUE_REJECTED`.
- Dovezile contradictorii nu sunt mediate: interval inversat sau pantă negativă rămân
  `NOT_IDENTIFIABLE`/`CONTRADICTORY_EVIDENCE`.
- Agregatele sunt calculate din rândurile per cheie; raportul este byte-identic la două rulări.

## Limitări

- Observațiile sunt sintetice și deterministe, nu sesiuni de gameplay capturate.
- Harness-ul construiește faptele 086/087/088 și read model-ul 093; nu exercită worker-ul 103,
  publicarea, store-ul sau o cale `MANUAL`/`AUTO`.
- Vocabularul 086 nu are un tip `FOLLOWING`; episoadele de lider/coadă sunt atașate unor oportunități
  `GREEN`/`STOP`, folosite aici doar ca identitate.
- Toleranțele sunt valori de pornire documentate pentru calibrare, nu intervale de încredere
  statistice.
- Nu există captură de browser, măsurătoare FPS/GPU sau pretenție hardware.
