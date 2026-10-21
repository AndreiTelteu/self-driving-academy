# Dovezi 106 — fidelitate între clase și condus liber

Contract: `106-cross-class-fidelity-v1`. Adapter de raport: `106-cross-class-fidelity-app-v1`.
Harness offline, determinist, fără UI, worker, publicare de profil, scriere în store sau mutare de
flotă.

## Fișiere

- `src/experiments/cross-class-fidelity.ts` — stilurile 105, demonstrațiile pe clasele 023,
  normalizarea reală 089, recuperarea 094/095, profilul comun, detectorul de copiere mecanică,
  fidelitatea `MANUAL`/`LEARNING` și cazurile `UNREPRESENTABLE`.
- `src/app/cross-class-fidelity.ts` — `runCrossClassFidelityValidation()` și randarea Markdown.
- `tests/experiments/cross-class-fidelity.test.ts` — 18 teste de contract.
- `tests/experiments/cross-class-fidelity-report.ts` — raportul de dovezi și 47 de verificări.
- `scripts/run-cross-class-fidelity-report.mjs` — runnerul `npm run learning:cross-class`.

## Comenzi și rezultate

| Comandă | Rezultat |
| --- | --- |
| `npm run learning:cross-class` | 47/47 verificări, 7 scenarii, overall PASS; scrie `report.json` și `report.md` |
| `npm run learning:cross-class -- --check` | raportul JSON și Markdown sunt actuale |
| `node --import ./scripts/register-typescript.mjs --test tests/experiments/cross-class-fidelity.test.ts` | 18 teste, 18 pass |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run format:check` | PASS |
| `npm run check:architecture` | PASS (236 fișiere TypeScript) |
| `npm test` | 1588 teste, 1588 pass, 0 fail |

## Scenarii

| Scenariu | Rezultat |
| --- | --- |
| `SEDAN_CAUTIOUS` | PASS |
| `SEDAN_ASSERTIVE` | PASS |
| `COMPACT_CAUTIOUS` | PASS |
| `COMPACT_ASSERTIVE` | PASS |
| `COMMON_PROFILE_BOTH_FLEETS` | PASS |
| `SAME_ROUTE_MANUAL_VS_LEARNING` | PASS |
| `UNREPRESENTABLE_MANOEUVRE` | PASS |

## Mecanic versus normalizat

Clasele reale 023 au plafoane diferite; aceeași fracțiune de stil produce cereri brute diferite, iar
089 le împarte la plafonul propriei clase.

| Stil | Clasă | Plafon accel | Plafon decel | Plafon lateral | Raw p50 accel | Raw p50 decel | Raw p50 lateral | Normalizat accel | Normalizat decel | Normalizat lateral |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `CAUTIOUS` | `sedan` | 4,6429 | 8 | 12,753 | 1,2132 | 2,2243 | 1,8296 | 0,2613 | 0,2780 | 0,1435 |
| `CAUTIOUS` | `compact` | 6,3636 | 9 | 14,715 | 1,6621 | 2,5020 | 2,1112 | 0,2612 | 0,2780 | 0,1435 |
| `ASSERTIVE` | `sedan` | 4,6429 | 8 | 12,753 | 2,8284 | 3,4445 | 3,6605 | 0,6092 | 0,4306 | 0,2870 |
| `ASSERTIVE` | `compact` | 6,3636 | 9 | 14,715 | 3,8864 | 3,8675 | 4,2162 | 0,6107 | 0,4297 | 0,2865 |

Diferența normalizată pentru canalele longitudinale este sub 0,002; diferența brută este de ordinul
zecilor de procente. `curve_lateral_accel` păstrează diferența reală de reconstrucție a estimatorului
094 și este raportată separat.

## Tendință și acord între clase

| Cheie | Direcție | Sedan cautious | Sedan assertive | Compact cautious | Compact assertive | Diferență max | Toleranță | Ordine | Acord |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `speed_delta_urban` | ASCENDING | −1,9977 | 3,4948 | −2,0093 | 3,5034 | 0,0116 | 0,3750 | PASS | PASS |
| `speed_delta_residential` | ASCENDING | −1,4947 | 2,4965 | −1,5021 | 2,4983 | 0,0074 | 0,3250 | PASS | PASS |
| `curve_lateral_accel` | ASCENDING | 1,8306 | 3,6548 | 2,1092 | 4,2182 | 0,5634 | 0,9700 | PASS | PASS |
| `intersection_approach_speed` | ASCENDING | 7,5005 | 10,9848 | 7,4904 | 11,0050 | 0,0202 | 0,7300 | PASS | PASS |
| `desired_acceleration` | ASCENDING | 1,2132 | 2,8284 | 1,2127 | 2,8355 | 0,0072 | 0,2900 | PASS | PASS |
| `comfort_deceleration` | ASCENDING | 2,2243 | 3,4445 | 2,2240 | 3,4378 | 0,0067 | 0,3700 | PASS | PASS |
| `acceleration_jerk` | ASCENDING | 1,5 | 3,8 | 1,5 | 3,8 | 0 | 0,6800 | PASS | PASS |
| `brake_reaction_delay` | DESCENDING | 0,45 | 0,25 | 0,45 | 0,25 | 0 | 0,0290 | PASS | PASS |

`trendPreserved = true`, `normalizedAgreement = true`, `mechanicalCopied = false`.

## Profilul comun

Profilul `CAUTIOUS`: `speed_delta_urban=-1,9977`, `speed_delta_residential=-1,4947`,
`curve_lateral_accel=1,8306`, `intersection_approach_speed=7,5005`, `desired_acceleration=1,2132`,
`comfort_deceleration=2,2243`, `acceleration_jerk=1,5`, `brake_reaction_delay=0,45`.

Profilul `ASSERTIVE`: `speed_delta_urban=3,4948`, `speed_delta_residential=2,4965`,
`curve_lateral_accel=3,6548`, `intersection_approach_speed=10,9848`, `desired_acceleration=2,8284`,
`comfort_deceleration=3,4445`, `acceleration_jerk=3,8`, `brake_reaction_delay=0,25`.

Ambele profile se aplică identic pe `TAXI` și `CIVILIAN`, pentru `sedan` și `compact`, cu zero
override-uri specifice clasei. Un override injectat cu plafonul de accelerație al sedanului
(4,642857 m/s²) este detectat ca `MECHANICAL_CAPABILITY_COPIED` și face raportul `FAIL`; verificarea
este păstrată în raport, nu ascunsă.

## MANUAL versus LEARNING

Aceeași rută și aceleași observații au fost folosite pentru ambele moduri; digestul rutei și
digestul observațiilor sunt identice.

| Mod | Eligibil | Profil schimbat | Candidat | Versiune | Motiv | Poarta 103 reală |
| --- | --- | --- | --- | --- | --- | --- |
| `MANUAL` | nu | nu | — | — | `MANUAL_NO_LEARNING` | `MANUAL_SEGMENT_NOT_LEARNABLE` |
| `LEARNING` | da | da | `desired_acceleration=2,828355` | candidat | `LEARNING_ACCEPTED` | `VALID` |
| `LEARNING` | nu | nu | — | — | `INELIGIBLE` | `SEGMENT_INELIGIBLE` |

Pentru `LEARNING` eligibil, dovada 093 este `READY` cu 4 episoade și calitate 1. Blend-ul 101 produce
`newValue=2,1642` din `oldValue=1,5`, cu `learningWeight=0,5`, `resolution=APPLIED`, `published=false`
și `learned=false`. Nu se publică și nu se scrie în store.

## Comportamente nereprezentabile

| Comportament | Rezultat | Estimare | Cheie | Valoare | Motiv |
| --- | --- | --- | --- | --- | --- |
| `PASSENGER_MODIFIER` | `UNREPRESENTABLE` | `null` | `null` | `null` | `PASSENGER_CONTEXT_NOT_COMPARABLE` |
| `HAZARD_AVOIDANCE` | `UNREPRESENTABLE` | `null` | `null` | `null` | `EVASIVE_MANOEUVRE_OUTSIDE_LEARNING_TARGETS` |
| `OFF_ROAD` | `UNREPRESENTABLE` | `null` | `null` | `null` | `SURFACE_EXCLUDED_BY_ELIGIBILITY` |
| `EXTERNAL_COMMAND` | `UNREPRESENTABLE` | `null` | `null` | `null` | `SOURCE_NOT_A_DRIVER_CHOICE` |

Manevra în afara scopului este `EVASIVE_SWERVE_AROUND_HAZARD`: ruta este măsurabilă, dar nu se
inventează nicio cheie sau valoare de preferință.

## Limitări

- Observațiile sunt sintetice și deterministe, nu sesiuni de gameplay capturate.
- Harness-ul construiește faptele 086/087/088 și rulează normalizatorul real 089 plus estimatoarele
  reale 094/095; nu exercită worker-ul 103, store-ul, publicarea 110 sau o flotă reală.
- Estimatorul 094 reconstruiește candidatul de curbă cu plafonul clasei observate; de aceea
  `curve_lateral_accel` are toleranța 106 documentată mai largă, nu toleranța inversă 105.
- Toleranțele sunt limite de calibrare documentate, nu intervale de încredere statistice.
- Nu există captură de browser, măsurătoare FPS/GPU sau pretenție hardware.
