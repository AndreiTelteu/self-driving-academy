# Regresii pentru intervenții și dovezi — PBI 107

Contract: `107-learning-edgecases-v1`. Adapter de admitere: `107-learning-edgecase-adapter-v1`.
Adapter de raport: `107-learning-edgecases-app-v1`. Codul trăiește în
`src/experiments/learning-edgecases.ts`, iar compoziția fără efecte secundare în
`src/app/learning-edgecases.ts`.

Harness-ul este offline și determinist: nu are UI, worker, estimator, store, publicare de profil sau
mutare de flotă. El construiește intrări reale 088, fapte reale 087, un record real 030 citit prin
ledger-ul de recuperare și observații reale 093; nu reimplementează filtrul, eligibilitatea sau
ledger-ul și nu inventează valori.

## Setul închis de cazuri

| Caz | Tip | Ce verifică |
| --- | --- | --- |
| `PAUSE` | negativ | un panou suspendat produce `PAUSE`/`SUSPENSION_PAUSE`, prefix utilizabil, zero dovezi |
| `FOCUS_LOSS_PAUSE` | negativ | focusul pierdut este `PAUSE`/`SUSPENSION_FOCUS_LOST`, inclusiv `FULLY_SUPPRESSED` |
| `RECOVERY_ADMITTED` | negativ | `TELEPORT`/`RECOVERY_TELEPORT` cu dovada 030; prefixul rămâne dovezi, teleportul nu |
| `RECOVERY_DENIED` | negativ | `TELEPORT`/`RECOVERY_DENIED`, zero chei învățate |
| `RECOVERY_PARTIAL` | negativ | `TELEPORT`/`RECOVERY_PARTIAL`, zero chei învățate |
| `INCOMPLETE_SEGMENT` | negativ | `SEGMENT_INCOMPLETE`, `CLOSE_REASON_DATA_LOSS` și `CHECKPOINT_LOST`, toate `TRUNCATED` |
| `OPEN_SEGMENT` | negativ | `PARTIAL`/`OPEN_SEGMENT`, fără valoare fabricată |
| `OBSERVATION_GAP` | negativ | `PARTIAL`/`OBSERVATION_GAP`, intervalul pierdut refuzat |
| `MANY_STREETS` | pozitiv | trei oportunități distincte, deduplicare pe oportunitate + occurrence, contexte separate |
| `SHORT_INTERVENTION` | pozitiv | `READY` doar pentru cheile de viteză din contextul observat; MANUAL nu învață |
| `CLEAN_FREE_TRAFFIC` | control pozitiv | traficul liber produce `READY` la viteză |
| `CLEAN_LEADER` | control pozitiv | liderul produce `READY` doar la cheile de urmărire |
| `CLEAN_BLOCKED_GREEN` | control pozitiv | verdele blocat rămâne constrângere externă, fără dovezi de plecare |

Raportul are exact aceste 13 cazuri, 7 scenarii de dovezi și un rezumat înghețat.

## Pauză și focus loss

Un interval suspendat este un artefact `PAUSE`, niciodată `INCOMPLETE_SAMPLE`. Filtrul 088 taie
fereastra la `fromTick`-ul suspendării: tick-urile de dinainte rămân în prefixul utilizabil, iar
intervalul suspendat și tot ce urmează sunt suprimate. Completitudinea este `PARTIAL` cu motivul
`TRUNCATED_BY_ARTIFACT`.

Adapterul 107 refuză fereastra înainte de 093, cu motiv explicit:

- `ELIGIBILITY_EXCLUDED` când fereastra 087 este `PAUSE` sau `FOCUS_LOST`;
- `WINDOW_FULLY_SUPPRESSED` când suspendarea începe la primul tick și nu există prefix.

Prin urmare nicio cheie nu devine `READY`, nu există valoare/delta și profilul nu se schimbă. O
suspendare nu este citită nici ca reacție lentă: 087 nu deschide fereastră de reacție pentru ea.

## Recuperare

Fiecare record 030 este citit prin ledger-ul real de recuperare și transformat în fapt 088. Filtrul
produce `TELEPORT` cu cauza exactă (`RECOVERY_TELEPORT`, `RECOVERY_DENIED`, `RECOVERY_PARTIAL`) și
păstrează dovada: `operationId`, `pointId`, `mapId`, `laneId`, `mode`, `validatedTick`. Un record
marcat `learningEligible: true` este refuzat de 088.

Regula de prefix rămâne cea a lui 088: partea de dinaintea primului artefact este utilizabilă cu
propriul numitor, iar tick-ul plasării și tot ce urmează nu sunt niciodată dovezi. Cazul admis
păstrează un prefix de 689 tick-uri (suficient pentru viteza preferată) și refuză fereastra de după
recuperare cu `OBSERVATION_OUTSIDE_USABLE_PREFIX`. Recuperarea în sine nu produce nicio cheie
învățată; un `DENIED` sau `PARTIAL` nu produce nicio cheie `READY`.

## Segmente incomplete, deschise și goluri

| Situație | Completitudine | Motiv |
| --- | --- | --- |
| `segmentCompleteness: INCOMPLETE` | `TRUNCATED` | `SEGMENT_INCOMPLETE` |
| `closeReason: DATA_LOSS` | `TRUNCATED` | `DATA_LOSS` |
| `lostCheckpointTick` raportat | `TRUNCATED` | `CHECKPOINT_LOST` |
| segment încă `OPEN` | `PARTIAL` | `OPEN_SEGMENT` |
| `observationLoss` 085 | `PARTIAL` | `OBSERVATION_GAP` |

Niciun caz nu este raportat `COMPLETE`. O fereastră examinată în coada trunchiată sau în intervalul
pierdut este refuzată cu `OBSERVATION_OUTSIDE_USABLE_PREFIX`; un segment deschis poate contribui doar
la dovezi descriptive insuficiente, niciodată la o valoare sau un `READY` fabricat.

## Multe străzi și deduplicare

Trei oportunități 086 distincte, cu ID-uri distincte pe trei străzi, produc trei episoade separate.
Aceeași oportunitate observată pe cadre repetate rămâne **un** episod, pentru că 093 dedupă după
`opportunity.id + occurrence`. Numărul de cadre, `observationCount` și cadența nu intră în identitate.

Contextele rămân separate: `FREE_TRAFFIC` alimentează doar cheile de viteză, `LEADER` doar cheile
relaționale de urmărire, iar `BLOCKED_GREEN` este `EXTERNAL_CONSTRAINT` și nu produce nicio
preferință. Adapterul îl refuză explicit cu `CONTEXT_NOT_EVIDENCE`; nu există spillover între
contexte.

## Intervenție scurtă

O fereastră `LEARNING` eligibilă de exact 600 tick-uri (10 s) în `FREE_TRAFFIC` produce `READY`
pentru `speed_delta_urban` și doar atât. `intersection_approach_speed` rămâne `INSUFFICIENT` la un
singur episod, iar cheile de urmărire, semnal și bandă rămân `NO_EVIDENCE`. Nu se rulează niciun
estimator, deci nu se produce niciun candidat.

Partea `MANUAL` a aceleiași intervenții este `MANUAL_SEGMENT`/`EXCLUDED` în 087, este refuzată cu
`ELIGIBILITY_EXCLUDED` și nu adaugă niciun episod. `MANUAL` nu produce învățare.

## Adapterul 107

`admitLearningEdgeCaseObservation` transformă o fereastră 088 plus o fereastră 087 într-o observație
093 numai dacă:

1. fereastra 088 este `PREFIX_ELIGIBLE` cu prefix nenul;
2. fereastra 087 nu este `EXCLUDED` și este fie `FREE_TRAFFIC`, fie `LEADER`;
3. oportunitatea 086 este `RESOLVED` și `learningEligible`;
4. ID-urile, segmentul, vehiculul și incarnation-ul concordă;
5. observația 087 se află în întregime în prefixul utilizabil.

Orice altă situație produce un motiv închis din `learningEdgeCaseExclusionReasons`. 087 și 088 au
namespace-uri diferite pentru `windowId`; adapterul leagă ID-ul ferestrei 087 pe recordul 088 citit de
093, fără să modifice prefixul, clasa sau completitudinea 088.

## Ce NU este

- Nu este un estimator 094–099 și nu produce valoare, delta sau candidat.
- Nu este un owner de profil, store sau flotă: nu publică, nu scrie și nu mută nimic.
- Nu este un al doilea filtru 088, o a doua eligibilitate 087 sau un al doilea ledger 093; apelează
  funcțiile reale.
- Nu este un arbiter de pauză/focus sau de recuperare: consumă faptele 070/030 și le etichetează.
- Nu este o probă de browser, FPS, GPU sau hardware; observațiile sunt fixture-uri deterministe.

## Verificare

`tests/experiments/learning-edgecases.test.ts` (17 teste) acoperă setul închis, fiecare tip și cauză
088, pauza/focus loss fără dovezi, prefixul de recuperare păstrat și teleportul exclus, recuperările
refuzate/parțiale, segmentele incomplete/deschise/golurile, deduplicarea și separarea contextelor,
intervenția scurtă și MANUAL, controalele pozitive, determinismul, lipsa mutărilor și numărătorile
raportului. `npm run learning:edgecases` scrie raportul determinist cu 56 de verificări pe 7
scenarii; `--check` îl validează. Dovezile sunt în
[Evidence/107-learning-edgecases](Evidence/107-learning-edgecases/README.md).
