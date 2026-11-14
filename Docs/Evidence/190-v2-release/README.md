# PBI 190 — închiderea release-ului V2

Release-ul V2 se închide ca un release **documentat, derivat și verificat, dar nevalidat pe hardware**.
Acest PBI nu adaugă funcționalitate de joc: leagă cele 80 de chei de dovezile lor, publică notele de
compatibilitate față de 0.3 și un checklist executabil, astfel încât fiecare afirmație de suport să aibă
o referință și fiecare rând deschis să aibă un owner.

Comanda este `npm run release:v2`:

```bash
npm run release:v2           # scrie cele șase fișiere din acest director
npm run release:v2 -- --check # regenerează în memorie și compară byte cu byte
```

## Ce s-a livrat

| Fișier | Conținut |
| --- | --- |
| [parameter-artifact.json](parameter-artifact.json) / [.md](parameter-artifact.md) | artefactul celor 80 de chei: categorie, unitate, interval, default, politică, estimator, efect verificat, convenție canonică, livrare în joc și limitarea care rămâne |
| [compatibility-notes.json](compatibility-notes.json) / [.md](compatibility-notes.md) | 15 afirmații față de 0.3 (5 schimbări, 3 identice, 3 noutăți, 4 deschise), fiecare cu dovada care o susține |
| [release-checklist.json](release-checklist.json) / [.md](release-checklist.md) | 17 rânduri `PASS`/`FAIL`/`NOT_RUN` cu owner, plus dependențele V2 163–189 |
| [scripts/run-v2-release-artifact.mjs](../../../scripts/run-v2-release-artifact.mjs) | generatorul determinist, cu `--check`; intrarea `release:v2` din [package.json](../../../package.json) este ultima din `scripts` |
| [Docs/11-catalog-parametri.md](../../11-catalog-parametri.md) | corectarea afirmației false despre `LEARNED` și secțiunea „Suport real după 187" |
| [Docs/19-roadmap-si-decizii.md](../../19-roadmap-si-decizii.md) | secțiunea de închidere a release-ului V2, la final |

`src/`, `Docs/driving-parameters.json`, `Docs/performance-budgets.json`, `Docs/18`, bugetele și celelalte
dovezi comise nu au fost modificate.

## Cum derivă artefactul celor 80 (nu este scris de mână)

Lanțul este executabil, nu narativ:

1. **Catalogul** — `Docs/driving-parameters.json` trece prin `parseParameterCatalog`; 80 de definiții, 24
   `initial_learning_target` și 56 `extension`, cu unitatea canonică și `sourceUnit` păstrat.
2. **Capabilitățile** — `src/profiles/parameter-capabilities.ts` dă pentru fiecare cheie politica (modul +
   simbol), estimatorul, directorul de dovezi, ancorarea testului și scenariul.
3. **Verificarea** — aceeași funcție `evaluateParameterGate` ca poarta 187 rulează în generator, cu o sondă
   reală de fișiere: modulul exportă simbolul, dovada există, testul conține titlul declarat, scenariul are
   text, efectul măsurat există în raportul grupului. O declarație goală oprește artefactul.
4. **Livrarea în joc** — `Docs/Evidence/188-v2-challenges/report.json` dă `learningKeys`: cheia → provocarea
   care o demonstrează. 15 chei au provocare, 41 nu.
5. **Rezervarea** — `reservedParameterKeys` și `isReservedParameterKey` din registru decid dacă un rând este
   livrabil end-to-end. Toate cele 56 de chei V2 sunt rezervate, deci fiecare rând V2 spune „nu este livrabil
   end-to-end" și de ce.
6. **Efectul** — rândurile `MEASURED` vin din `report.json` al grupului de politică (valoare joasă → înaltă
   și diferența măsurată); cele 24 de chei CORE păstrează consecința M dovedită de testul de regresie.

Generatorul are 11 verificări fail-closed (`catalog-shape`, `gate-verdict`, `artifact-rows`,
`policy-and-estimator`, `reservation`, `challenge-coverage`, `conventions`, `style-transfer`,
`compatibility-evidence`, `dependencies-done`, `evidence-files`). Rezultatul rulării: **11/11 `PASS`,
verdict `PASS`**.

### Rezultatul real

| Indicator | Valoare |
| --- | ---: |
| Chei în artefact | **80** (24 CORE + 56 V2) |
| Politici / estimatori declarați | **80 / 80**, 0 `NONE` |
| Efecte măsurate / consecințe M păstrate | **56 / 24** |
| Convenții canonice derivate din catalog | **8** |
| Chei cu provocare 188 / fără provocare | **15 / 41** |
| Chei certificate dar rezervate de etapa de plan | **56** |
| Chei livrabile end-to-end | **24** (CORE) |
| Afirmații de compatibilitate susținute de dovezi | **15/15** |
| Dependențe V2 în Done, cu dovezi fără placeholder | **27/27** (163–189) |

## Demonstrația transferului stilului extins

Demonstrația este derivată din rapoartele comise ale celor zece familii: valoarea candidată vine din
estimatorul familiei (raportul de învățare), efectul vine din politica familiei (raportul de politică), iar
transferul către flotă se oprește la etapa de plan.

| Familie | Cheie | Valoare candidată | Efect măsurat în politică | Transfer către flotă |
| --- | --- | --- | --- | --- |
| Viteză și ritm | `speed_delta_arterial` | 4,075 m/s (`CANDIDATE`, `VALIDATED`) | −10 → 20 m/s: 3,9 → 30 (Δ 26,1) | BLOCAT (`KEY_EXTENSION_STAGE`) |
| Accelerație și frânare | `braking_jerk` | 3 m/s³ (`CANDIDATE`, `VALIDATED`) | 0,2 → 20 m/s²: 0,026667 → 2 (Δ 1,973333) | BLOCAT |
| Urmărire și distanțe | `cutin_brake_response` | 0,7 ratio (`CANDIDATE`, `VALIDATED`) | 0,2 → 1 m/s: 9,94 → 1,7 (Δ −8,24) | BLOCAT |
| Semafoare | `yellow_stop_probability` | 0,8875 probability (`CANDIDATE`, `VALIDATED`) | 0,2 → 1 ratio: 0,158333 → 1 (Δ 0,841667) | BLOCAT |
| STOP și prioritate | `rolling_stop_speed` | 1,2 m/s (`CANDIDATE`, `VALIDATED`) | 0,2 → 5 m/s: 0,2 → 2,5 (Δ 2,3) | BLOCAT |
| Schimbare de bandă | `lane_change_duration` | 1,991667 s (`CANDIDATE`, `VALIDATED`) | 0,5 → 5 ratio: 0,5 → 0,1 (Δ −0,4) | BLOCAT |
| Control lateral | `turn_entry_speed` | 3,5 m/s (`CANDIDATE`, `VALIDATED`) | 1 → 18 m/s: 1 → 6,268769 (Δ 5,268769) | BLOCAT |
| Trasee și recuperare | `route_time_weight` | 0,072436 weight (`CANDIDATE`, `VALIDATED`) | 0 → 1 s: 113,29523 → 60,655781 (Δ −52,639449) | BLOCAT |
| Pietoni și pericole | `pedestrian_yield_probability` | 0,5 probability (`CANDIDATE`, `VALIDATED`) | 0 → 1 decizie: 0 → 1 (Δ 1) | BLOCAT |
| Pickup și confort | `pickup_stop_precision` | 1 m (`CANDIDATE`, `VALIDATED`) | 0,2 → 5 m: 0,2 → 2,75 (Δ 2,55) | BLOCAT |

**10/10 familii demonstrate până la politică, 10/10 blocate înainte de flotă.** Estimarea și efectul sunt
reale; publicarea către taxiuri și civili nu este posibilă, pentru că `candidate-validation` refuză cheile
`extension` cu `KEY_EXTENSION_STAGE`, iar exportul le scrie în `reservedParameters`. Tabelul complet, cu
modulele și ancorările, este în [parameter-artifact.md](parameter-artifact.md#demonstrația-transferului-stilului-extins).

## Notele de compatibilitate și dovada fiecărei afirmații

Fiecare afirmație are cel puțin o cale de dovadă comisă și un detaliu derivat din fișier la generare. Dacă
un fișier dispare sau un literal verificat nu mai există, `compatibility-evidence` pică și release-ul nu se
închide. Exemple:

- **Schimbat (jucător):** 15 provocări extinse în 5 familii, publicate în catalogul compus 12 + 15 = 27
  ([188](../../Evidence/188-v2-challenges/report.json)); 96 de pietoni pe 80 de treceri și 11 stimuli de
  pericol ([164](../../Evidence/164-pedestrians/report.json), [165](../../Evidence/165-hazards/report.json)).
- **Identic (jucător):** progresul V1 — 27 de rânduri PASS, 0 eșecuri, pierderi XP 0
  ([216](../../Evidence/216-v1-regression/report.json)) și același digest de import înainte/după, cu 0
  scrieri de profil ([188](../../Evidence/188-v2-challenges/report.json)); accesul la vehicule — 64/64
  conduse, 24/24 taxiuri selectabile, 0 revocări; acordurile de salvare — 53/53 export, 53/53 import, 56 de
  chei rezervate `null` ([133](../../Evidence/133-export-profile/report.json),
  [134](../../Evidence/134-import-profile/report.json)) și restartul sesiunii în 104 verificări
  ([152](../../Evidence/152-e2e-session/report.json)).
- **Nou (integrator):** 56 de straturi de politică, poarta executabilă și workload-ul `189-workload-v2-1`
  ([187](../../Evidence/187-v2-parameter-gate/report.json), [189](../../Evidence/189-v2-regression/report.json)).
- **Deschis:** cele 56 de chei rezervate (`KEY_EXTENSION_STAGE` în
  [`candidate-validation`](../../../src/learning/candidate-validation.ts), `reservedParameters` în
  [`profile-export`](../../../src/persistence/profile-export.ts)), acoperirea 15/56 a provocărilor,
  performanța V2 `NOT_RUN` și contradicția din `Docs/parameter-registry.md`.

## Verificarea dependențelor V2

Validatorul de board a raportat la început `Valid: true`, 235 de task-uri (12 To Do, 1 In Progress, 222
Done). Generatorul verifică apoi fiecare PBI al lanțului **163–189** (27 de task-uri): fișierul există în
`PBI/Done`, frontmatterul are `status: "Done"` și `completed_at` completat, iar README-ul de dovezi există
și nu conține „De completat". Rezultat: **27/27 `PASS`**, publicat rând cu rând în
[release-checklist.md](release-checklist.md#dependențele-v2-163189).

## Corectarea din Docs/11 și de ce

Secțiunea „Suport runtime pentru viteze" afirma: „Estimarea și publicarea LEARNED rămân dezactivate până la
implementarea estimatorilor." **Afirmația era falsă după 187**: estimatorii sunt livrați și certificați
(`estimateSpeedParameters` acoperă cele patru chei), iar registrul derivă `estimable = estimator !== null`,
adică `true` pentru toate cele 80 de chei; `parsePublishableDrivingProfile` permite `LEARNED` pentru orice
cheie certificată. Corectarea are două părți:

1. paragraful despre 046 spune acum că registrul derivă `implemented`/`estimable` din tabelul 187 și că
   `LEARNED` este permis pentru cheile certificate;
2. secțiunea nouă „Suport real după 187" separă explicit cele 24 de chei CORE livrate în bucla V1, cele 56
   certificate dar rezervate (`KEY_EXTENSION_STAGE`, `reservedParameters`) și cele 15 cu provocare 188, și
   trimite la dovezile 187 și la artefactul acestui PBI.

Nu s-a modificat nicio valoare, unitate sau interval din catalog și nicio afirmație despre performanță.
Catalogul de date rămâne fail-closed: `implemented: false` în JSON pentru toate cele 80 de chei, verificat de
rândul `catalog-fail-closed` al checklist-ului (80/80 intrări JSON, 80/80 derivate runtime).

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run release:v2` | exit 0; 6 fișiere scrise; 11/11 verificări `PASS`; verdict `PASS`; `SUMMARY keys 80 (24 CORE / 56 V2), estimators 80, challenges 15/56, reserved 56, checklist 10 PASS / 2 FAIL / 5 NOT_RUN, release NOT_VALIDATED` |
| `npm run release:v2 -- --check` | exit 0; „Release artifacts V2 are current." |
| `npm run typecheck` | exit 0 (`tsc --noEmit` și `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | exit 0, 0 erori, 0 warnings |
| `npm run format:check` | exit 0, „All matched files use Prettier code style!" |
| `npm run check:architecture` | exit 0; PASS, 391 fișiere TypeScript, probe negative 6 + 4 + 3 respinse |
| `npm run check:parameter-catalog` | exit 0, „Parameter catalog is synchronized." |
| `npm test` | exit 0; **3 250 teste, 3 250 trecute, 0 eșuate**, 0 sărite (109,8 s) |
| `npm run profile:v2 -- --check` | exit 0; raportul 166 este curent (contrazice limitarea declarată de 187, vezi mai jos) |
| `npm run learning:gate24 -- --check` | exit 0; raportul 108 este curent (idem) |
| `pwsh ./PBI/Validate-Board.ps1` | `Valid: true`, 235 task-uri (12 To Do, 1 In Progress, 222 Done) |
| `pwsh ./PBI/Validate-Board.ps1 -RequireDone '190'` | `Valid: true`, 235 task-uri (12 To Do, 0 In Progress, 223 Done), `RequiredDonePaths` = `PBI/Done/190-release_v2.md` |

Ieșirea exactă a validatorului final:

```json
{
  "Valid": true,
  "Total": 235,
  "Columns": {
    "To Do": 12,
    "In Progress": 0,
    "Done": 223
  },
  "FirstId": "001",
  "LastId": "235",
  "RequiredDonePaths": [
    "C:\\Users\\aandr\\Sites\\self-driving-academy\\.worktrees\\v2-release-190-01\\PBI\\Done\\190-release_v2.md"
  ]
}
```

## Ce rămâne deschis (și cine deblochează)

Checklist-ul are **10 `PASS`, 2 `FAIL`, 5 `NOT_RUN`** și verdict `NOT_VALIDATED`; fiecare rând deschis are
owner:

| Rând | Verdict | Owner | Ce lipsește |
| --- | --- | --- | --- |
| `fps-hardware` | `NOT_RUN` | operator cu hardware real + proprietarul 224 | FPS, frame p95/p99 și lucru GPU pe aceeași revizie, ambele backenduri; capturile 220 sunt pe alt build |
| `harness-v2` | `NOT_RUN` | proprietarul harness-ului 220/224 | fixture versionat cu pietoni, pericole și catalog complet; 33 de fișiere în `tests/harness` au 0 referințe |
| `soak-v2` | `NOT_RUN` | proprietarul 159/224 | soak de 60 de minute pe workload-ul V2; cel comis este pe V1 și nu a fost reexecutat |
| `playtest-human` | `NOT_RUN` | proprietarul 216/235 | playtest uman, 0/5 participanți; senzația de condus și revenirea nu sunt măsurate |
| `remeasure-224` | `NOT_RUN` | proprietarul 224 | `npm run perf:gate -- --check` iese cu exit 1 (măsurătoarea comisă este învechită față de sursă); 189 a reexecutat doar structural |
| `docs-registry-v1-rule` | `FAIL` | proprietarul `Docs/parameter-registry.md` | documentul afirmă încă regula V1 (`estimable=false`, `LEARNED` respins pentru toate cheile), contrazisă de cei 80 de estimatori certificați |
| `inherited-v1-gates` | `FAIL` | proprietarul 235 (experiență) și 153 (QA vizual) | checklist-ul V1 162 are 2 `FAIL` și 2 `NOT_RUN` (26 de itemi deschiși), moștenite neschimbate |

Limitările suplimentare, în afara checklist-ului:

- **`Docs/parameter-registry.md` este în afara ownership-ului acestui PBI.** A fost citit și raportat ca
  rând `FAIL` cu owner, nu corectat pe ascuns; `Docs/11`, care era în ownership, a fost corectat.
- **`PBI/Validate-Plan.ps1` eșuează preexistent la PBI 188**, nu din cauza acestui PBI: titlul din
  `PBI/README.md` are `Provocări` (caracterul 259), iar frontmatterul lui 188 are `Provocari` (caracterul
  97). Indexul și fișierul 188 aparțin orchestratorului/altui PBI și nu au fost atinse.
- **Limitarea din 187 despre rapoartele 108/166 este depășită**: ambele `--check` ies cu exit 0 pe această
  revizie, deci cele două rapoarte sunt curente. Nu am rescris documentul 187; constatarea este consemnată
  aici, cu rezultatul real.
- Generatorul citește dovezile comise și nu reexecută gate-urile grele (224, soak, browser); un rând `PASS`
  înseamnă că dovada comisă spune `PASS`, nu că proba a fost reexecutată aici. Reexecutarea aparține
  comenzilor citate și este legată de rândurile de mai sus.
- Artefactul descrie capabilitatea certificată, nu un parcurs de joc încheiat: 41 de chei V2 nu au provocare,
  iar toate cele 56 rămân rezervate până la migrarea etapei de plan.
