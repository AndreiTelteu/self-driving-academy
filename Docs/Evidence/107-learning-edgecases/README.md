# Dovezi 107 — regresii pentru intervenții și dovezi

Contract: `107-learning-edgecases-v1`. Adapter de admitere: `107-learning-edgecase-adapter-v1`.
Adapter de raport: `107-learning-edgecases-app-v1`. Harness offline, determinist, fără UI, worker,
estimator, publicare de profil, scriere în store sau mutare de flotă.

## Fișiere

- `src/experiments/learning-edgecases.ts` — setul închis de 13 cazuri, adapterul explicit
  fereastră 088 + eligibilitate 087 → observație 093, verificările și raportul înghețat.
- `src/app/learning-edgecases.ts` — `runLearningEdgeCaseRegressions()` și
  `admitLearningWindowForRegression()`, cu porturi injectabile pentru teste.
- `tests/experiments/learning-edgecases.test.ts` — 17 teste de contract.
- `tests/experiments/learning-edgecases-report.ts` — raportul de dovezi și verificările agregate.
- `scripts/run-learning-edgecases-report.mjs` — runnerul `npm run learning:edgecases`.

## Comenzi și rezultate

| Comandă | Rezultat |
| --- | --- |
| `npm run learning:edgecases` | 56/56 verificări, 7 scenarii, overall PASS; scrie `report.json` și `report.md` |
| `npm run learning:edgecases -- --check` | raportul JSON și Markdown sunt actuale |
| `node --import ./scripts/register-typescript.mjs --test tests/experiments/learning-edgecases.test.ts` | 17 teste, 17 pass |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run format:check` | PASS |
| `npm run check:architecture` | PASS (238 fișiere TypeScript) |
| `npm test` | 1605 teste, 1605 pass, 0 fail |

## Scenarii

| Scenariu | Cazuri | Rezultat |
| --- | --- | --- |
| `PAUSE` | `PAUSE`, `FOCUS_LOSS_PAUSE` | PASS |
| `RECOVERY_ADMITTED` | `RECOVERY_ADMITTED` | PASS |
| `RECOVERY_DENIED_PARTIAL` | `RECOVERY_DENIED`, `RECOVERY_PARTIAL` | PASS |
| `INCOMPLETE_GAP` | `INCOMPLETE_SEGMENT`, `OPEN_SEGMENT`, `OBSERVATION_GAP` | PASS |
| `MANY_STREETS` | `MANY_STREETS` | PASS |
| `SHORT_INTERVENTION` | `SHORT_INTERVENTION` | PASS |
| `POSITIVE_CONTROLS` | `CLEAN_FREE_TRAFFIC`, `CLEAN_LEADER`, `CLEAN_BLOCKED_GREEN` | PASS |

## Reguli demonstrate

- **Pauză și focus loss.** Un interval suspendat produce un artefact `PAUSE` cu cauza 070
  (`SUSPENSION_PAUSE`/`SUSPENSION_FOCUS_LOST`), prefixul de dinaintea suspendării rămâne utilizabil,
  iar fereastra examinată în interval este exclusă explicit. Nicio cheie nu devine `READY`, iar o
  suspendare de la primul tick produce `FULLY_SUPPRESSED`.
- **Recuperare.** `ADMITTED`/`COMPLETED`, `DENIED` și `PARTIAL` produc `TELEPORT` cu cauza și dovada
  030 (`operationId`, `pointId`, `mapId`, `laneId`, `mode`, `validatedTick`). Prefixul utilizabil de
  dinaintea artefactului poate rămâne dovezi (cazul admis are 689 tick-uri), dar intervalul teleport
  și tot ce urmează sunt refuzate; recuperarea în sine nu produce nicio cheie învățată.
- **Segmente incomplete.** `SEGMENT_INCOMPLETE`, `CLOSE_REASON_DATA_LOSS` și `CHECKPOINT_LOST` produc
  `TRUNCATED` cu motivul lor explicit; `OPEN_SEGMENT` și `OBSERVATION_GAP` produc `PARTIAL` cu
  motivul lor. Nicio valoare nu este fabricată, iar coada trunchiată nu devine dovezi.
- **Multe străzi.** Trei oportunități distincte pe trei străzi produc trei episoade; aceeași
  oportunitate observată pe cadre repetate rămâne un singur episod, pentru că 093 deduplică după
  `opportunity.id + occurrence`, niciodată după cadru. Contextele `FREE_TRAFFIC`, `LEADER` și
  `BLOCKED_GREEN` rămân separate, fără spillover.
- **Intervenție scurtă.** Zece secunde eligibile în `FREE_TRAFFIC` produc `READY` doar pentru
  `speed_delta_urban`; urmărirea, semnalul și banda rămân `NO_EVIDENCE`/`INSUFFICIENT`. Parte MANUAL
  a aceleiași intervenții este refuzată explicit și nu adaugă episoade.
- **Controale pozitive.** Traficul liber produce `READY` la viteză, liderul produce `READY` doar la
  cheile de urmărire, iar verdele blocat rămâne constrângere externă fără dovezi de plecare.

## Limitări

- Observațiile sunt fixture-uri sintetice deterministe, modelate după contractele reale 086/087/088/093,
  nu sesiuni de gameplay capturate.
- Harness-ul nu rulează estimatoarele 094–099, worker-ul 103, store-ul 109/110 sau o flotă live.
  `READY` înseamnă doar suficiență descriptivă a dovezilor, nu estimare sau publicare.
- Faptele de pauză/focus sunt intrări reale 088 cu cauzele documentate 070; nu există probă headed de
  browser pentru pauză/focus.
- Nu există captură de browser, măsurătoare FPS/GPU sau pretenție hardware.
