# Dovezi PBI 201 — validare integrală V3

PBI 201 reexecută efectiv lanțul de personaj livrat de 191–200, dovedește prin digest că mersul nu
alterează catalogul și indicatorii și publică un verdict pe fiecare criteriu, nu un verdict global.
**Rezultatul acestei revizii: 2 criterii `PASS`, 0 `FAIL`, 1 `NOT_RUN`; toate cele 11 comenzi ale
raportului au exit code 0, iar suita completă are 3 408 teste trecute și 0 eșuate.**

Rapoartele generate: [report.json](report.json) și [report.md](report.md). Măsurătoarea gate-ului 224
reexecutată pe revizia curentă: [gate-measure/report.json](gate-measure/report.json).

## Ce s-a implementat

- `scripts/run-v3-validation-report.mjs` — comanda `npm run qa:v3-validation`. Rulează cele 11 comenzi
  (toate cu exit code real), importă suitele V3, definește workload-ul `201-workload-v3-1`, calculează
  verdictul pe cele trei criterii, verifică nemodificarea manifestului prin SHA-256 față de `HEAD` și
  scrie `report.json` + `report.md`. `--check` regenerează raportul și îl compară byte cu byte.
- `tests/qa/v3-validation-flow.ts` — criteriul 1: lanțul real 192 → 195 → 193 → 196 → 197 → 198 pentru
  `AUTO`, `MANUAL` și `LEARNING`, plus conducerea lungă pe 193/194.
- `tests/qa/v3-validation-digest.ts` — criteriul 2: 5 000 de tick-uri de mers real, digeste SHA-256
  înainte / după mers / după reload 200 pentru catalog, capabilități, KPI, ledger, XP, daily și sesiune.
- `tests/qa/v3-validation.test.ts` — poarta de execuție pentru ambele suite.
- `package.json` — intrarea `qa:v3-validation`, ultima din blocul `"scripts"`.
- `Docs/18-validare-si-release.md` — secțiune nouă la final: verdictul V3 și workload-ul versionat.
- `Docs/Evidence/201-v3-validation/` — raportul, măsurătoarea gate-ului și acest document.

`src/`, `Docs/25`, `Docs/performance-budgets.json`, `Docs/11`, `Docs/13`, `Docs/20`, `tests/qa/`
existent, bugetele și baseline-ul nu au fost modificate. Alte PBI-uri din board nu au fost atinse.

## Matricea criteriilor

| ID | Criteriu | Verdict | Dovada reală |
| --- | --- | --- | --- |
| C1 | Toate fluxurile manual/AUTO funcționează și după intrare/ieșire | **PASS** | `3/3` moduri și `3/3` conduceri lungi `PASS`; fiecare mod face FOCUS → TAKE → RETURN → FOCUS → TAKE → RETURN și apoi merge `1,226 m`; `0` comenzi către consumatorul inactiv, `0` corpuri create de walker, `0` entități clonate de cameră. Suport: 216 `27/29 PASS` (2 `NOT_RUN` declarate), 198 `16/16` scenarii, 200 `160/160` verificări și `18/18` refuzuri |
| C2 | Catalogul și indicatorii nu sunt alterați de mers | **PASS** | `9/9` digeste SHA-256 identice după `5 000` tick-uri de mers (`114,10 m`) și după reload 200: catalog 092 (fișier + date + registru), capabilități 187, KPI 209, ledger 209, XP 213, daily 211, sesiune 135. Reload `ACCEPTED`, checksum verificat, `0` corpuri create, al doilea reload identic |
| C3 | Cele trei moduri, personajul și streamingul vizual trec contractul 25; workload/bugete V3 versionate | **NOT_RUN** | 158 `PASS` cu `3/3` echivalențe `IDENTICAL`; 157 `STRUCTURAL_PASS` (`17 PASS`, `0 FAIL`, `2 NOT_MEASURED`); 159 `SOAK_PASS` (`60,002 min`, `20` cicluri); 224 reexecutat `structural PASS` (`16 PASS`, `0 FAIL`, `1 NOT_VALIDATED`); 154 `9/9`; 188 `40/40`. Manifest `203-initial-1` nemodificat. FPS/frame pe GPU real nu a putut fi măsurat |

## Criteriul 1 — lanțul real, mod cu mod

| Mod | Tick-uri | Mers după ieșire | Re-intrare | Segmente închise M/L | Candidați 069 | Tranziții 193 | Comenzi C/V |
| --- | ---: | ---: | --- | --- | ---: | ---: | --- |
| `AUTO` | 66 | 1,226 m | `ACCEPTED` | 2 / 0 | 0 | 4 | 64 / 2 |
| `MANUAL` | 66 | 1,226 m | `ACCEPTED` | 2 / 0 | 0 | 4 | 64 / 2 |
| `LEARNING` | 66 | 1,226 m | `ACCEPTED` | 1 / 1 | 1 | 4 | 64 / 2 |

Fiecare rând pornește de la un walker 192 real pe harta autorată. Intrarea este decizia 195 (prin 197
TAKE), care impune `MANUAL` și păstrează poziția corpului bit-identică; ieșirea este decizia 196 (prin
197 RETURN), care eliberează mașina în `AUTO` și readuce autoritatea la personaj. Pentru `LEARNING`,
alegerea explicită 067 deschide segmentul `LEARNING`; la ieșire se închide cu `RETURN_TO_AUTO` și produce
exact un candidat 069. Pentru `AUTO` și `MANUAL` nu se produce niciun candidat.

Conducerea lungă rulează separat 193 + 194 pe `120` de tick-uri, fără 198 (read model-ul de segmente nu
primește un pas pentru fiecare tick petrecut în scaun):

| Mod | Tick-uri | Comenzi vehicul | Comenzi personaj | Refuzuri consumator inactiv | Tick-uri walker |
| --- | ---: | ---: | ---: | ---: | ---: |
| `AUTO` | 122 | 121 | 0 | 1 | 0 |
| `MANUAL` | 122 | 121 | 0 | 1 | 0 |
| `LEARNING` | 122 | 121 | 0 | 1 | 0 |

## Criteriul 2 — digeste înainte / după mers / după reload 200

Sesiunea de mers este reală: `5 000` tick-uri de walker (192), comandate de arbitrul 193, urmărite de
camera 194 și numărate de 198; au rezultat `114,10 m` și `0` segmente de driving închise de mers.

| Digest | Sursă | Prefix SHA-256 | După mers | După reload |
| --- | --- | --- | --- | --- |
| `catalog-092-file` | `Docs/driving-parameters.json` | `c75ba02c…` | identic | identic |
| `catalog-092-data` | `parameterCatalogData` | `416ab9d3…` | identic | identic |
| `registry-092` | `parameterRegistry` | `61d676c7…` | identic | identic |
| `capabilities-187` | `parameterCapabilities` | `ed17879b…` | identic | identic |
| `kpi-209` | KPI-ul sesiunii (`1` zi, `1` lună) | `615c8bce…` | identic | identic |
| `ledger-209` | ledgerul economic (`5` intrări, `3` decontări) | `db1d7787…` | identic | identic |
| `xp-213` | ledgerul XP (`2` intrări) | `5a63d7a2…` | identic | identic |
| `daily-211` | starea zilnică (`3` rânduri) | `ba23118b…` | identic | identic |
| `session-135` | documentul de sesiune | `ae5a8ffb…` | identic | identic |

Digestele complete de 64 de caractere sunt în [report.json](report.json), secțiunea `digest.digests`.
Reload-ul 200: `ACCEPTED`, autoritate `CHARACTER:character:player-1`, cameră `character:player-1`,
`71` entități (`1` personaj + `70` vehicule), `0` corpuri create, `0` segmente deschise, XP `100,5`
(nivel `2`, `100 500 000` micro-XP), o recompensă daily, `3` decontări și `1` tastă neutralizată.
Al doilea reload are același digest.

## Criteriul 3 — workload V3 și contractul 25

Workload-ul este derivat, nu copiat: fiecare componentă are o sursă comisă și un număr real.

| Componentă | Valoare | Sursă |
| --- | ---: | --- |
| Personaj | 1 entitate, 10 contracte 191–200 | dovezile 191–200 |
| Flotă | 30 taxiuri / 40 civili | `Docs/performance-budgets.json` → `workloads.maximumV1` |
| Pietoni | 96 entități, 80 treceri, 6 scenarii | `Docs/Evidence/164-pedestrians/report.json` |
| Pericole | 96 obstacole, 11 stimuli, 7 scenarii | `Docs/Evidence/165-hazards/report.json` |
| Catalog | 80 chei, 0 findings | `Docs/Evidence/187-v2-parameter-gate/report.json` |
| Provocări | 15 provocări, 5 familii, 40 verificări | `Docs/Evidence/188-v2-challenges/report.json` |
| Bugete | moștenite nemodificat din `203-initial-1` | `Docs/performance-budgets.json` → `proposedBudgets` |

Contractele V3 citite din rapoartele proprii: `191-character-v1`, `192-walker-v1`,
`193-input-authority-v1`, `194-character-camera-v1`, `195-enter-vehicle-v1`, `196-exit-vehicle-v1`,
`197-fleet-switch-v1`, `198-walking-segments-v1`, `199-walking-tutorial-v1`, `200-walking-save-v1`.

**De ce timpul este `NOT_RUN`.** Harness-ul de performanță (155/156/158/220/224) exprimă flota, civilii
și decorul; nu are fixture cu personaj, pietoni sau pericole. Măsurarea de frame/simulare pe
`201-workload-v3-1` ar cere o pagină de harness cu GPU real, care nu există și nu poate fi creată în
ownership-ul acestui PBI. Raportul nu inventează cifre de FPS sau tick pentru V3.

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run qa:v3-validation` | exit 0; 11/11 comenzi exit 0; criterii 2 `PASS` / 0 `FAIL` / 1 `NOT_RUN`; moduri 3/3; digeste 9/9; baseline nemodificat |
| `npm run qa:v3-validation -- --check` | exit 0; „Raportul V3 este curent” + „Markdown-ul V3 este curent” |
| `npm run qa:v1-regression -- --check` | exit 0; 29 rânduri, 27 `PASS`, 0 `FAIL`, 2 `NOT_RUN`; pierderi XP 0, debitări 0 |
| `npm run qa:compat -- --check` | exit 0; 9/9 combinații reale, 11/11 verificări deterministe, 11 declarate `NOT_RUN` |
| `npm run perf:simulation-budget -- --check` | exit 0; decizii/estimare/transfer `PASS`, 3/3 echivalențe `IDENTICAL` |
| `npm run perf:render-budget -- --check` | exit 0; 17 `PASS`, 0 `FAIL`, 2 `NOT_MEASURED`, `STRUCTURAL_PASS` |
| `npm run perf:soak -- --check` | exit 0; `SOAK_PASS`, 60,002 min, 20 cicluri, 16 verificări |
| `npm run perf:gate -- --measure --out=Docs/Evidence/201-v3-validation/gate-measure` | exit 0; structural `PASS`, release `NOT_VALIDATED`, 16 `PASS` / 0 `FAIL` / 1 `NOT_VALIDATED` |
| `npm run validate:parameters -- --check` | exit 0; 80 chei, 0 findings, verdict `PASS` |
| `npm run missions:challenges-v2 -- --check` | exit 0; 15 provocări, 5 familii, 40/40 verificări |
| `npm run walking:segments -- --check` | exit 0; 3600 tick-uri de mers, 82,26 m, 16/16 scenarii |
| `npm run walking:save -- --check` | exit 0; 160/160 verificări, 4/4 scenarii, 18/18 refuzuri |
| `npm test` | exit 0; **3 408 teste, 3 408 trecute, 0 eșuate** |
| `npm run typecheck` | exit 0 (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | exit 0, 0 erori, 0 warning-uri |
| `npm run format:check` | exit 0, „All matched files use Prettier code style!” |
| `npm run check:architecture` | exit 0; 410 fișiere TypeScript, probe negative 6 + 4 + 3 respinse |
| `npm run check:parameter-catalog` | exit 0, „Parameter catalog is synchronized.” |

Măsurătoarea gate-ului reexecutat: bundle **6 125 279 B** (5,84 MiB din capacitatea de 8 MiB),
JS 3 478 683 B + WASM 2 646 596 B, gzip 1 769 518 B, 130 artefacte, 48/128 draw calls, 78/8192
instanțe thin, 40/512 batchuri, 12/4096 obiecte Babylon. Rezultatul este `structural PASS`,
`release NOT_VALIDATED`; dovada comisă a lui 224 nu a fost suprascrisă.

## Dovada că baseline-ul nu s-a relaxat

| Indicator | Valoare |
| --- | --- |
| Fișier | `Docs/performance-budgets.json` |
| Versiune | `203-initial-1` |
| `status` | `FIXED_INITIAL_CONTRACT_WITH_PROVISIONAL_GAMEPLAY_BUDGETS` |
| `approvedGate` | `false` |
| `hardwareGameplayGate` | `NOT_VALIDATED` |
| SHA-256 în lucru | `10d78ab5c999215684c821a1f32fd7045392f0f6d8c140c54115d0f73475a21c` |
| SHA-256 în `HEAD` | `10d78ab5c999215684c821a1f32fd7045392f0f6d8c140c54115d0f73475a21c` |
| Nemodificat | **DA** |

Raportul recalculează hash-ul la fiecare rulare și îl compară cu `git show HEAD:Docs/performance-budgets.json`.
Dacă manifestul ar fi editat, criteriul C3 ar deveni `FAIL`, nu ar primi un buget nou.

## Constatări și rânduri deschise

Raportul nu a găsit niciun defect funcțional în lanțul 191–200: toate cele 10 contracte V3, cele trei
moduri, camera, intrarea/ieșirea, flota și segmentele trec. Rândurile deschise sunt de măsurare, nu de
corectitudine dovedită:

- **`hardware-fps-v3` (owner 224 / operator).** `fps-hardware` = `NOT_VALIDATED`; capturile hardware 220
  sunt pe alt build, iar pragurile absolute cer aceeași revizie. Fără o sesiune Chrome/Babylon pe GPU
  real, pe ambele backenduri, FPS și frame p95/p99 rămân deschise.
- **`harness-v3-timing` (owner 220/224).** Workload-ul `201-workload-v3-1` este definit și dovedit
  funcțional, dar nu are probe de timp.
- **`visual-streaming-257` (owner 157/223).** Doi pași ai streamingului vizual sunt `NOT_MEASURED`; ei cer
  renderer real, nu doar probe structurale.
- **`soak-v3` (owner 159/224).** Soak-ul de 60 de minute este citit din măsurătoarea comisă, nu reexecutat;
  nu are variantă cu personaj, pietoni și pericole.
- **`playtest-human` (owner 235/216).** Rândul C3 al regresiei 216 rămâne `NOT_RUN`; cere jucători reali.

## Fișiere atinse

| Fișier | Schimbare |
| --- | --- |
| `scripts/run-v3-validation-report.mjs` | nou — generatorul raportului cu `--check` |
| `tests/qa/v3-validation-flow.ts` | nou — criteriul 1, lanțul real pe cele trei moduri |
| `tests/qa/v3-validation-digest.ts` | nou — criteriul 2, digeste și reload 200 |
| `tests/qa/v3-validation.test.ts` | nou — poarta de execuție |
| `package.json` | o intrare nouă, ultima din `scripts`: `qa:v3-validation` |
| `Docs/18-validare-si-release.md` | secțiune nouă la final |
| `Docs/Evidence/201-v3-validation/` | nou — raport, măsurătoare gate, acest document |

## Limitări

- Suitele V3 rulează în Node, fără renderer, GPU sau input uman; ele dovedesc contractele, nu FPS-ul,
  frame p95/p99 sau latența.
- Workload-ul V3 este dovedit funcțional, nu ca timp de execuție; cifrele de timp pentru V3 nu există.
- Soak-ul este citit din dovezile comise, nu reexecutat; o rulare reală durează o oră și aparține
  gate-ului complet.
- Reload-ul 200 este o reluare de contract (citire strictă + expectanțe), nu o repornire de browser; el
  dovedește octeții și coerența, nu timpul de încărcare.
- Raportul nu include commitul `HEAD`, ca `--check` să rămână valabil după commit; proveniența intrărilor
  este dată de SHA-256-ul fiecărui fișier de dovezi.
