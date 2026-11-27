# Pipeline-ul de learning live — PBI 273

`src/app/live-learning.ts` (`273-live-learning-v1`) este composition root-ul care leagă segmentele
închise ale telemetriei live 272 de modulele reale deja livrate: adaptorul de dovezi
`src/learning/live-evidence.ts` (`273-live-evidence-v1`), coada serială 103, governorul 221,
estimatoarele 094/098, poarta 102, store-ul imuabil 109, activarea 110 și bariera de generație 205.
Nu creează o a doua simulare, un al doilea estimator, un al doilea ledger de profil sau un al doilea
store.

## Fluxul unui segment

Un segment este admis numai dacă este `CLOSED`, `mode: 'LEARNING'`, `learningEligible: true`,
aparține profilului și epocii curente și are un `readClosedSegment` materializabil. `MANUAL` și
`AUTO` sunt sărite cu `SKIPPED_MANUAL` și codul închis 103 (`MANUAL_SEGMENT_NOT_LEARNABLE` /
`AUTO_SEGMENT_NOT_LEARNABLE`); `LEARNING` neeligibil este `SKIPPED_INELIGIBLE`; un segment deschis
sau incomplet este `SKIPPED_INCOMPLETE`; un segment dintr-o altă epocă sau alt profil este
`STALE_JOB` (`EPOCH_MISMATCH` / `PROFILE_MISMATCH`) **înainte** de orice admitere în coadă.

Pentru un segment eligibil, adaptorul transformă faptele 085/086/087/088 în read model-ul 093:

- ferestrele 087 `ELIGIBLE`/`FREE_TRAFFIC` cu prefix 088 utilizabil hrănesc 094 (`speed_delta_urban`,
  `speed_delta_residential`, `intersection_approach_speed`);
- oportunitățile `STOP` rezolvate cu fapt de oprire hrănesc 098 (`stop_full_probability`,
  `stop_dwell_time`, `stop_line_offset`);
- numitorii STOP sunt numărați din oportunitățile 086 reale ale segmentului, nu din cadre;
- tipul de drum este derivat din limita postată a benzii (13,4 m/s arterial, 11,2 m/s rezidențial);
  orice altă limită rămâne `OTHER`, fără coercionare.

Singura adaptare structurală este fereastra 088: 272 păstrează o fereastră de artefact pe segment,
iar 093 cere identitatea ferestrei 087. Adaptorul re-cheiește prefixul și artefactele reale pe
identitatea ferestrei de eligibilitate, fără să schimbe tick-urile, completitudinea sau faptele
vehiculului. Nu inventează dovezi, eșantioane sau estimări.

Se selectează o singură cheie per segment, determinist: un fapt STOP real are prioritate, apoi
viteza urbană, apoi viteza rezidențială. Dacă niciun candidat nu e `READY`, segmentul produce tot un
job, cu `candidate.status = UNOBSERVED`/`REFUSED` și dovezi insuficiente; coada 103 răspunde
`NO_CHANGE`, iar pipeline-ul raportează `INSUFFICIENT_EVIDENCE` fără versiune. Astfel un segment
eligibil produce un job, dar lipsa dovezilor nu devine niciodată o valoare inventată.

## Versiune, activare și flotă

Jobul poartă `playerId`, `profileId`, `learningEpoch`, `baseVersionId`, `segmentId`, `sessionId`,
`worldEpoch`, `mode`, `eligible`, `order` (tick-ul de start al segmentului), cheia, valoarea de bază,
dovezile, episoadele și candidatul. Coada 103 rulează în runtime-ul real 103/221
(`src/learning/estimator-queue.ts`): același `WorkerRuntime`, același governor și aceeași sarcină
`createLearningEstimatorTask`. În browser transportul poate fi un port `Worker` dedicat sau loopback-ul
runtime-ului partajat; în Node raportul și proba de cost folosesc `WorkerRuntime` real.

O compoziție schimbată este validată de 102, scrisă de 109 ca versiune imuabilă cu părinte explicit și
publicată de 110 pentru `tick + 1`. La tick-ul comun, toate taxiurile și civilii primesc aceeași
referință, inclusiv vehiculele `MANUAL`/`LEARNING`, selectate sau ascunse. Composition root-ul live
actualizează apoi sursa de stil a orașului și apelează `refreshStyle()` pe traficul 058; vehiculele
noi citesc versiunea activă. O compoziție neschimbată este `NO_CHANGE`, iar un segment duplicat este
`DEDUPLICATED`; niciuna nu creează o a doua versiune sau o a doua activare.

XP, misiunile, banii și KPI nu sunt atinse de acest modul. Profilul este singura publicare.

## Bariera `learningEpoch`

Restore, import validat și profil nou trec prin bariera reală 205. La limita tick-ului:

1. segmentul de generație este închis cu `PROFILE_CHANGE`;
2. joburile 103 capturate din generația veche sunt anulate;
3. `learningEpoch` crește cu exact un pas;
4. ținta este publicată în 110 pentru tick-ul următor;
5. pipeline-ul este recreat pe noua epocă și noua bază.

Starea fizică este citită înainte și după rotație ca snapshot exact (poziție, viteză, mod, versiune
aplicată); bariera raportează `physicalPreserved`, iar o schimbare fizică produce rollback. Un import
invalid este `REJECTED` înainte de orice efect: nu închide segmentul, nu anulează joburi și nu
incrementează epoca. Un rezultat târziu din generația veche este `STALE_JOB`, are `versionId: null` și
nu publică nimic. Pipeline-ul își verifică și starea de `disposed` înainte de commit, astfel încât un
rezultat care sosește după schimbarea generației să nu poată crea o versiune.

## Statusuri închise

| Status | Când | Job | Versiune |
| --- | --- | --- | --- |
| `COMPOSED` | segment eligibil, compoziție schimbată, delta 102 acceptat | da | exact una |
| `RECOMPOSED` | rezultat depășit în aceeași generație, ledger-ul 103 acoperă lanțul | da | exact una |
| `NO_CHANGE` | compoziție acceptată, nicio valoare diferită | da | nu |
| `INSUFFICIENT_EVIDENCE` | dovezi 093 insuficiente sau candidat neobservat | da | nu |
| `DEDUPLICATED` | segment deja publicat | nu (reluare) | existenta |
| `SKIPPED_MANUAL` | `MANUAL` sau `AUTO` | nu | nu |
| `SKIPPED_INELIGIBLE` | `LEARNING` cu `learningEligible: false` | nu | nu |
| `SKIPPED_INCOMPLETE` | segment deschis/incomplet | nu | nu |
| `STALE_JOB` | epocă/profil/bază străină sau job invalidat | nu / da | nu |
| `FAILED` | eroare 103/102/109, dovezi invalide | da | nu |

Motivele sunt un vocabular închis; codul domeniului 102/103/109/110 rămâne în `code`, iar textul în
`detail`.

## Ce nu este

Nu este UI de profil (274), setări (279), fizică (282), reguli de trafic (283) sau persistență
(278). Nu decide singur ce înseamnă un stil bun, nu corectează KPI-uri și nu scrie XP. Nu înlocuiește
simularea: fiecare faptă provine din cadrul autoritar V3 și din segmentele 069/272.

## Verificare

```powershell
npm run learning:live
npm run learning:live -- --check
npm run learning:live:cost
node --import ./scripts/register-typescript.mjs --test tests/learning/live-evidence.test.ts
node --import ./scripts/register-typescript.mjs --test tests/app/live-learning.test.ts
node --import ./scripts/register-typescript.mjs --test tests/learning/estimator-queue.test.ts
```

Raportul determinist este în [Evidence/273-live-learning](Evidence/273-live-learning/README.md).
Proba de browser folosește Playwright când este disponibil și scrie `browser.json`; în lipsa lui este
`NOT_RUN`, nu PASS simulat.
