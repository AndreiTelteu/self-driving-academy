# Gate-ul de acoperire 108 — cele 24 de chei M

Contract: `108-learning-gate24-v1`. Adapter de raport: `108-learning-gate24-app-v1`. Codul trăiește în
`src/experiments/learning-gate24.ts`, iar compunerea fără efecte secundare în
`src/app/learning-gate24.ts`. Gate-ul V1 se închide numai dacă toate cele 24 de chei
`initial_learning_target` au estimator, specificație de dovezi, oportunitate, scenariu independent și
acoperire 107.

## Matricea și sursele reale

Matricea nu este o listă scrisă de mână. Fiecare coloană este citită din exporturile modulelor reale:

| Coloană | Sursă |
| --- | --- |
| cele 24 de chei M | `parameterDefinitions` 092 filtrat pe `implementationStage === 'initial_learning_target'` |
| unitatea canonică | `parameterEvidenceSpecs` 093, care o preia din registrul 092 |
| canalul și contextele | `parameterEvidenceSpecs` 093 (`channel`, `contexts`) |
| proprietarul estimatorului | seturile reale `SPEED_ESTIMATOR_KEYS` … `LANE_ESTIMATOR_KEYS` din 094–099 |
| oportunitatea 086 | `opportunityKinds` plus regula dedicat/carrier de mai jos |
| scenariul independent | `runInverseLearningValidation()` 105, numai rândurile `PROFILE_PRUDENT`…`PROFILE_MIXED` |
| acoperirea 107 | cazurile `evaluateLearningEdgeCases()` 107, numai cazurile `POSITIVE` cu `status === 'PASS'` |

Cheile R/`extension` nu intră în matrice. Orice cheie străină din sursele injectate este raportată în
`foreignKeys`, iar orice abatere de la setul exact 092 este raportată în `matrixErrors`; ambele țin
gate-ul `OPEN`.

## Regula de validare

O cheie este `validated` numai dacă toate condițiile următoare sunt adevărate simultan:

1. are exact un proprietar în seturile reale 094–099;
2. are o specificație 093 cu canal și context cunoscute și unitatea canonică;
3. are cel puțin o oportunitate 086 permisă;
4. are câte un rezultat 105 pentru fiecare dintre cele patru profile, toate `WITHIN_TOLERANCE`;
5. contextul ei este acoperit de cel puțin un caz 107 `POSITIVE` care a trecut.

Altfel cheia rămâne în `unvalidated` cu motive închise, în ordinea din contract:
`NO_ESTIMATOR`, `NO_EVIDENCE_SPEC`, `NO_OPPORTUNITY`, `NO_SCENARIO`, `SCENARIO_FAILED`,
`NO_EDGE_CASE`, `DUPLICATE_OWNER`. Un eșec 105 (`OUTSIDE_TOLERANCE`, `NO_ESTIMATE`,
`NOT_IDENTIFIABLE`) este păstrat ca `SCENARIO_FAILED`; nu este convertit în lipsă de dovezi și nu
este ascuns de un agregat. Acoperirea 107 este la nivel de context, nu o dovadă a cheii: un caz
pozitiv care observă `FREE_TRAFFIC` sau `LEADER` acoperă contextul, dar nu produce el însuși estimarea.

## Dedicat versus carrier

Vocabularul 086 are exact cinci tipuri: `STOP`, `RED`, `GREEN`, `YIELD`, `LANE_CHANGE`. Nu există un
tip dedicat pentru trafic liber sau urmărire, deci relația este explicită în fiecare rând:

- **DEDICATED** — cheile de semnal folosesc `RED`/`GREEN`, cheile de STOP/YIELD folosesc
  `STOP`/`YIELD`, iar cheile de bandă folosesc `LANE_CHANGE`. Sunt 12 chei.
- **CARRIER** — cheile de viteză, accelerație și urmărire sunt transportate de `GREEN`, iar coada
  oprită folosește și `STOP`. Sunt 12 chei și 16 relații carrier.

Raportul listează separat `dedicatedKeys` și `carrierKeys`, numără ambele roluri și afișează
`(CARRIER)` în tabel. O cheie carrier nu este prezentată ca având o oportunitate dedicată; această
limitare a vocabularului 086 rămâne vizibilă, nu este ascunsă într-un agregat.

## Gate OPEN sau CLOSED

`gateStatus` este `CLOSED` numai când matricea are exact cele 24 de chei 092, nu există erori de
matrice și `unvalidated.length === 0`. În orice alt caz este `OPEN`. Gate-ul nu este forțat niciodată
`CLOSED`: dacă datele reale lasă chei nevalidate, raportul rămâne `OPEN` și le listează cu motive.
Semnătura deterministă `fnv1a64:…` acoperă matricea, numărătorile, lista nevalidată, defectele de
matrice și statutul, deci două rapoarte identice au aceeași semnătură, iar un eșec injectat o
schimbă.

Raportul include `effects` cu zero publicări de profil, zero scrieri în store și zero mutații de
flotă. Harness-ul nu are nicio cale către aceste operații.

## Ce NU este

- Nu este un estimator 094–099 și nu rulează estimatoare: citește rezultatele 105 existente.
- Nu este un al doilea ledger 093, filtru 088, vocabular 086 sau raport 107; apelează exporturile reale.
- Nu publică profiluri, nu creează versiuni, nu scrie în store, nu mutează flota și nu activează
  `implemented`/`estimable`.
- Nu inventează o oportunitate dedicată pentru trafic liber sau urmărire; o raportează ca `CARRIER`.
- Nu este o probă de browser, FPS, GPU sau hardware; observațiile 105/107 sunt fixture-uri deterministe.
- Nu certifică gameplay-ul integrat și nu înlocuiește gate-urile 220/224.

## Verificare

`npm run learning:gate24` scrie raportul determinist, iar `npm run learning:gate24 -- --check`
verifică faptul că JSON-ul și Markdown-ul sunt actuale. Testele sunt în
`tests/experiments/learning-gate24.test.ts` și `tests/experiments/learning-gate24-report.ts`.
Dovezile și rezultatele exacte sunt în
[Evidence/108-learning-gate24](Evidence/108-learning-gate24/README.md).
