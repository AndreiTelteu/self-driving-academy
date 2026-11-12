# Dovezi PBI 224 — gate de regresii de performanță și soak complet

Gate-ul de release rulează **o singură comandă** local (`npm run perf:gate`) și leagă probele portabile ale
reviziei curente cu măsurătorile hardware deja comise și cu soak-ul aceleiași revizii. Verdictul agregat
are trei stări — `PASS`, `FAIL`, `NOT_VALIDATED` — și fiecare probă are verdictul și motivul ei.
**Rezultatul acestei revizii: structural `PASS`, release `NOT_VALIDATED`**, pentru că FPS-ul pe hardware
real nu a fost măsurat pe commitul curent. Gate-ul nu închide un criteriu pe care nu l-a măsurat.

Rapoartele generate: [report.json](report.json) și [report.md](report.md). Măsurătoarea din care sunt
derivate: [measurement.json](measurement.json). Soak-ul reviziei: [soak/report.json](soak/report.json).
Jobul CI: [ci-job.json](ci-job.json). Regresia controlată: [regression-demo/summary.json](regression-demo/summary.json).

## Ce s-a implementat

- `tests/harness/performance-gate.ts` — contractul pur al gate-ului: citește bugetele din manifest,
  construiește rândurile (bundle, capacități, determinism, soak, FPS și 11 dovezi obligatorii),
  calculează verdictul structural și verdictul de release, verifică raportul și îl serializează în
  Markdown. Nu definește și nu relaxează niciun buget.
- `tests/harness/performance-gate.test.ts` — 14 teste deterministe: bugetele citite din manifest, PASS
  structural fără GPU, respingerea bundle-ului peste capacitate, regula relativă confirmată, regresia de
  capacități, determinismul celor cinci repetări, soak sub 60 de minute/fără platou, FPS închis numai pe
  capturi ale aceleiași revizii, refuzul unui PASS fals, dovezile lipsă și dovada comisă.
- `scripts/run-performance-gate.mjs` — comanda `npm run perf:gate`: `--measure` execută probele
  portabile (build de producție real, proba structurală 157, comenzile `--check` ale 155/156/157/158/159)
  și scrie măsurătoarea; rularea implicită derivează raportul; `--check` reexecută miezul portabil,
  refuză o măsurătoare învechită și compară raportul byte cu byte.
- `scripts/ci/run-gate-soak.mjs` — soak-ul reviziei curente, cu aceeași funcție `runSoak` a PBI 159
  (60 de minute, 20 de cicluri), scris în `soak/`.
- `scripts/ci/run-regression-demo.mjs` — demonstrația de regresie controlată (trei rulări, artefacte
  păstrate).
- `scripts/ci/run-performance-gate-job.mjs` — jobul CI: preflight static, `perf:gate --check`,
  `perf:gate --measure`, verdict și artefactul `ci-job.json`.
- `package.json` — intrarea `perf:gate`, ultima din blocul `"scripts"`.
- `Docs/25-performanta-contracte-si-benchmark.md` — secțiune nouă la final.

`src/` nu a fost modificat, `Docs/performance-budgets.json` nu a fost modificat, iar probele
155/156/157/158/159 sunt **apelate** cu `--check`, nu editate.

## Verdictul agregat

Revizia măsurată: `757e7168dfd641ea94fa7bcf95ae6841055e1244`, manifest `203-initial-1`, măsurat
`2026-11-12T11:39:11.741Z`. **17 rânduri: 16 `PASS`, 0 `FAIL`, 1 `NOT_VALIDATED`.**

| Probă | Criteriu | Fel | Verdict | Detaliu |
| --- | --- | --- | --- | --- |
| `bundle-critical-transfer` | 1 | portabilă | PASS | 5,84 MiB (6 125 279 B: JS 3 478 683 + WASM 2 646 596) din 8,00 MiB; gzip 1 769 518 B; 130 artefacte |
| `bundle-regression` | 1 | portabilă | PASS | baseline 5,84 MiB (`f5fb79fd07c7`); 0/5 repetări peste >10 % și >5 MiB |
| `capacity-render` | 1 | portabilă | PASS | draw calls 48/128, instanțe thin 78/8192, batchuri 40/512, obiecte Babylon 12/4096, 923 elemente |
| `determinism` | 1 | portabilă | PASS | 5 builduri + 5 probe de randare, câte un singur digest |
| `probe-render-budget` | 1 | portabilă | PASS | 157: 17 PASS, 0 FAIL, 2 NOT_MEASURED; `--check` exit 0 |
| `probe-simulation-budget` | 2 | portabilă | PASS | 158: decizii/estimare/transferuri PASS, 3 echivalențe IDENTICAL; `--check` exit 0 |
| `probe-traffic-benchmark` | 2 | portabilă | PASS | 156: 36 PASS, 0 FAIL, 12 STRESS, 60 REPORTED; `--check` exit 0 |
| `probe-hardware-budget` | 2 | portabilă | PASS | 155: 85 PASS, 0 FAIL, 6 NOT_MEASURED declarate; `--check` exit 0 |
| `probe-soak-integrity` | 3 | portabilă | PASS | 159: `SOAK_PASS`, 60,002 min, 20 cicluri; `--check` exit 0 |
| `gameplay-systems-max-v1` | 2 | dovadă | PASS | 12 rânduri 30/40 GATE (BASELINE, LEARNING, RECORDER_AUTOSAVE, XP), tick p95 maxim 7,00 ms din 8 ms |
| `destruction-effects-audio` | 4 | dovadă | PASS | 227: 24/24, 20 cicluri de reset cu 35 corpuri; 228: 20/20, 4 voci impact, 24 reacții/incident; 149: 32/32, 1/14 voci |
| `challenge-director` | 4 | dovadă | PASS | 232: 56/56, istoric 24/24 intrări, 1071/4096 unități; 233: 55/55, 1 rând de ledger din 32, 0 listeners globali |
| `savefile-integrity` | 4 | dovadă | PASS | 234: 84/84, fișier 174 732 B din 12 285 272 B, payload 174 113 B din ingress 16 777 216 B, checksum 64 B |
| `academy-chaos-cycles` | 4 | dovadă | PASS | 225: 20 tranziții (10 Academie / 10 Haos), 773 B total (max 40 B), 0 lumi/joburi orfane; 226: 20 reseturi, 0 eșuate, corpuri 64 stabile |
| `backend-matrix` | 2/4 | dovadă | PASS | 154: 9/9 combinații reale, 11/11 verificări deterministe, 11 NOT_RUN declarate; WEBGPU și WEBGL 2 acoperite |
| `soak-60min` | 3 | dovadă | PASS | 60,001 min, 20 cicluri (20 curate), 7/7 tendințe PLATEAU, heap +1,82 MiB din 5,00 MiB, coadă max 1 job / 4 B |
| `fps-hardware` | 1 | dovadă | **NOT_VALIDATED** | capturile 220 sunt pe buildul `2d68b43c8cdf`; revizia curentă este `757e7168dfd6` |

Verdictul de release este `NOT_VALIDATED` exact din cauza ultimului rând. `openCriteria` conține un
singur criteriu: „Criteriul 1: gate-ul FPS se închide numai pe hardware real, aceeași revizie”.

## Criteriile de acceptare

1. **Depășiri de capacitate/bundle respinse; FPS neînchis fără GPU real.** Bundle-ul este măsurat pe
   buildul de producție al reviziei (nu pe o valoare comisă) și comparat cu
   `criticalJsWasmTransferBytes` (8 MiB); capacitățile structurale sunt măsurate din nou și comparate cu
   `resourceAdmissionContracts.rendering`. Rândul `fps-hardware` rămâne `NOT_VALIDATED` și
   `verifyPerformanceGateReport` respinge un raport care ar închide FPS fără măsurătoare hardware.
2. **Gameplay cu learning, recorder, autosave, KPI și XP pe workload maxim V1.** Rândurile 30/40 din 156
   acoperă cele patru sisteme și toate trec (tick p95 maxim 7,00 ms din 8 ms). Proba 156 rulează în Node,
   fără renderer, deci partea „pe ambele backenduri” nu este dovedită de ea: matricea 154 declară ambele
   backenduri, iar bugetele absolute pe backend rămân la rândul `fps-hardware` (`NOT_VALIDATED`).
3. **Soak de minimum 60 de minute, 20 de cicluri, platou, baseline neschimbat.** Soak-ul acestei revizii
   (rulat în acest worktree, nu copiat din 159) are 60,001 min, 20 cicluri curate, 19 reload-uri, 640 de
   curse, 701 segmente/activări de learning, 2 380 de checkpointuri oferite și comise, 85 de incidente
   toate recuperate. Toate cele 7 tendințe sunt `PLATEAU`: heap +1,82 MiB din pragul de 5 MiB, RSS
   +13,46 MiB din 33,85 MiB, cozi 1 job / 4 B, retenție 121,95 MiB stabilă. Manifestul de bugete este
   verificat ca nemodificat (`modified: false`), deci baseline-ul nu se actualizează automat; gate-ul
   refuză un soak sub 60 de minute, sub 20 de cicluri, cu tendință în creștere sau cu manifest modificat.
4. **Distrugere/efecte/audio, director random, encode/hash savefile, 20 de schimbări Academie/Haos/reset.**
   Dovezile 227/228/149, 232/233, 234 și 225/226 sunt verificate pe conținut (nu doar pe un verdict
   generic): plafonul de 4 voci impact, 24 de reacții per incident, 20 de tranziții 10 Academie + 10 Haos
   cu 0 lumi/joburi orfane, 20 de reseturi cu corpuri/listeners/jobs stabile, savefile de 174 732 B din
   12 285 272 B cu checksum de 64 B. Niciuna dintre aceste probe nu pretinde FPS sau cost hardware
   (227 declară explicit `NOT_MEASURED`); partea „pe ambele backenduri” este declarată la rândul FPS.

## Cele cinci repetări și stabilitatea

Gate-ul rulează miezul portabil de cinci ori și păstrează fiecare rezultat în `measurement.json`:

| Repetare | Bytes JS+WASM | Digest build | Digest randare |
| ---: | ---: | --- | --- |
| 1 | 6 125 279 | `3ac5f69c276c` | `b6c188a777eb626e` |
| 2 | 6 125 279 | `3ac5f69c276c` | `b6c188a777eb626e` |
| 3 | 6 125 279 | `3ac5f69c276c` | `b6c188a777eb626e` |
| 4 | 6 125 279 | `3ac5f69c276c` | `b6c188a777eb626e` |
| 5 | 6 125 279 | `3ac5f69c276c` | `b6c188a777eb626e` |

Variația este **0** pentru partea structurală: aceiași bytes, aceleași 923 elemente, aceleași 48 de draw
calls, același digest. Pentru probele cronometrate, cele cinci repetări rămân cele ale probei de origine,
păstrate în dovezi: 155 are 5 repetări × 8 configurații (30 s warmup + 120 s măsurare), 156 are 2 repetări
per rând plus condiția cold, iar 159 are 120 de eșantioane pe 60 de minute. Gate-ul nu inventează o a
șasea serie pentru ele și nu selectează repetarea convenabilă: raportul păstrează toate valorile.

## Regresia controlată și revenirea

Demonstrația ([regression-demo/](regression-demo/)) rulează gate-ul de trei ori pe aceeași revizie. Nu
modifică `src/`: adaugă în entry-ul buildului un modul generat de 3 300 000 B, în `.pbi-validation-224/`
(ignorat de git), pe care gate-ul îl șterge după fiecare rulare.

| Rulare | Build | Structural | Bundle | Bytes JS+WASM | Motiv |
| --- | --- | --- | --- | ---: | --- |
| `01-baseline` | curat | PASS | PASS | 6 125 279 | — |
| `02-regression` | +3 300 000 B | **FAIL** | **FAIL** | 9 425 362 | „bundle-ul depășește capacitatea de 8,00 MiB cu 0,99 MiB” |
| `03-restored` | curat | PASS | PASS | 6 125 279 | — |

Detecția și revenirea sunt verificate automat (`detected: true`, `recovered: true`), inclusiv egalitatea
bytes-ilor și a digest-urilor dintre `01-baseline` și `03-restored`. Cele trei rapoarte și măsurătorile lor
sunt păstrate integral, deci se vede atât eșecul, cât și revenirea. Regresia nu rămâne în commit: singurul
artefact este buildul din directorul temporar, șters la final.

## Soak-ul reviziei curente

[soak/report.json](soak/report.json) și jurnalul [soak/soak-run.txt](soak/soak-run.txt) sunt produse de
`runSoak` din `tests/harness/soak-session.ts` — aceeași funcție ca la 159 — la commitul curent, cu
20 de cicluri de 3 minute (start → curse → intervenții → reset → reload). Bugetele sunt citite din
manifestul `203-initial-1`. Memoria și cozile ajung la platou, iar baseline-ul rămâne cel fixat:
`report.manifest.budgetVersion` este `203-initial-1` și gate-ul verifică separat că fișierul de bugete nu
este modificat.

Throttling-ul este raportat, nu ascuns: status `OBSERVED`, tick p95 între 5,14 ms și 9,44 ms pe ferestrele
de 30 s (raport 1,84), derivă maximă 83 ms, frecvența raportată de OS constantă la 2 695 MHz. Proba nu are
senzor termic; cauza termică nu poate fi dovedită sau exclusă aici.

## Ambele backenduri

- **Structural:** 154 acoperă 9 combinații reale (WEBGPU, WEBGL 2, plus cazurile de fallback) cu 11
  verificări deterministe și 11 combinații declarate `NOT_RUN`; 157 măsoară scena în `NullEngine`, fără
  backend hardware.
- **Hardware:** singurele capturi reale pe ambele backenduri sunt cele ale gate-ului 220, păstrate în
  `Docs/Evidence/220-fleet-gate` și sumarizate în 155: 5 repetări × 30/40 pe WEBGPU și WEBGL 2, frame p95
  16,9 ms (buget 35), GPU `null` pe WEBGPU și 1,109 ms pe WEBGL 2. Ele sunt însă pe buildul
  `2d68b43c8cdf` (22 octombrie 2026), nu pe revizia curentă, deci gate-ul le folosește ca dovadă
  istorică, nu ca închidere a criteriului.
- **Ce nu s-a putut rula:** o sesiune Chrome reală pe commitul curent (fără GPU real disponibil pentru
  această revizie în worktree). Nu este raportată ca 0 și nu este dedusă din `NullEngine`.

## Ce rămâne `NOT_VALIDATED` și de ce

| Ce | De ce |
| --- | --- |
| FPS / frame p95 / frame p99 pe hardware real, ambele backenduri | Capturile 220 sunt pe alt build (`2d68b43c8cdf`); pragurile absolute cer aceeași revizie. Rândul `fps-hardware` rămâne `NOT_VALIDATED`, iar release-ul nu poate fi `PASS`. |
| Lucrul GPU pe WEBGPU | 155/220 declară timerul indisponibil (`null`), nu 0; contractul permite `null` numai ca „nemăsurat”. |
| Memoria exactă a paginii și a GPU | `totalHeapBytes` este `null` în manifest; soak-ul raportează heap JS + contoare de ownership, nu RAM totală. |
| Layout/paint DOM și Long Tasks cu randare | Probele 155/156 rulează în browser doar pe capturile istorice; soak-ul și gate-ul rulează în Node, fără DOM. |
| `qa:ui` (153) | Nu este o probă de performanță: măsoară layout, contrast și accesibilitate. Verdictul ei comis este `FAIL` pe 8 verificări de contract UI (raportate de 153, care nu are voie să modifice `src/`); gate-ul de performanță nu îl folosește și nu îl ascunde. |
| Trace-uri Chrome pentru FPS | Nu există pe această revizie; trace-urile hardware aparțin probei 220. Gate-ul păstrează în schimb amprentele celor cinci repetări (digest de build și de randare) și jurnalul complet al soak-ului. |

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0 (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | exit 0, 0 warnings |
| `npm run format:check` | exit 0, „All matched files use Prettier code style!” |
| `npm run check:architecture` | exit 0, 6 + 4 + 3 sonde negative respinse, punctele de intrare reale executate |
| `npm run check:parameter-catalog` | exit 0, „Parameter catalog is synchronized.” |
| `npm test` | 2 888 teste, 2 887 pass, 1 fail (testul dovezii comise, înainte de generarea ei); după generare: `tests/harness/performance-gate.test.ts` 14/14 pass |
| `npm run perf:gate -- --measure` | exit 0, 17 rânduri, structural `PASS`, release `NOT_VALIDATED`, 5/5 repetări identice |
| `npm run perf:gate -- --check` | exit 0, „Gate report is current” + „Gate markdown is current” |
| `node --expose-gc --import ./scripts/register-typescript.mjs scripts/ci/run-gate-soak.mjs --measure` | exit 0, `SOAK_PASS`, 60,001 min, 20 cicluri, 85 incidente recuperate |
| `node --import ./scripts/register-typescript.mjs scripts/ci/run-regression-demo.mjs` | exit 0, `detected: true`, `recovered: true` |
| `node --import ./scripts/register-typescript.mjs scripts/ci/run-performance-gate-job.mjs` | exit 0, `CI job: PASSED`, 7 pași cu exit 0 |
| `npm run perf:render-budget -- --check` | exit 0 (17 PASS, 0 FAIL, 2 NOT_MEASURED) |
| `npm run perf:simulation-budget -- --check` | exit 0 (overall PASS, 3 echivalențe IDENTICAL) |
| `npm run perf:traffic-benchmark -- --check` | exit 0 (36 PASS, 0 FAIL) |
| `npm run perf:hardware-budget -- --check` | exit 0 (85 PASS, 0 FAIL, 6 NOT_MEASURED) |
| `npm run perf:soak -- --check` | exit 0 (SOAK_PASS, 60,002 min, 20 cicluri) |

Jobul CI, măsurat de la început la sfârșit: typecheck 6,1 s, lint 33,3 s, format 38,8 s, arhitectură
1,9 s, catalog de parametri 0,6 s, `perf:gate --check` 12,4 s, `perf:gate --measure` 18,5 s. Artefactul
[ci-job.json](ci-job.json) păstrează codurile de ieșire, duratele, verdictul și lista criteriilor deschise.

Mediul: AMD Ryzen 7 7735U, 16 fire logice, 14 GiB RAM, Windows 10.0.26300, Node v24.19.0; soak-ul și
probele numerice rulează în Node, fără browser.

## Baseline-ul

`Docs/performance-budgets.json` a fost citit la fiecare rulare și **nu** a fost modificat: raportul
conține `manifest.modified: false`, `baselineReplacedAutomatically: false`, iar
`automaticBaselineReplacement` este `false` în manifest. O depășire se raportează (vezi demonstrația de
regresie), nu se repară prin schimbarea pragului. Baseline-ul de build folosit pentru regula relativă
este cel comis de 155 (`build-transfer.json`, commit `f5fb79fd07c7`).

## Fișiere atinse

- `tests/harness/performance-gate.ts` (nou), `tests/harness/performance-gate.test.ts` (nou)
- `scripts/run-performance-gate.mjs` (nou)
- `scripts/ci/run-gate-soak.mjs`, `scripts/ci/run-regression-demo.mjs`,
  `scripts/ci/run-performance-gate-job.mjs` (noi)
- `package.json` (o intrare: `perf:gate`, ultima din `"scripts"`)
- `Docs/25-performanta-contracte-si-benchmark.md` (secțiune nouă)
- `PBI/Done/224-performance_regression_gate.md`
- `Docs/Evidence/224-performance-gate/` (acest README, `measurement.json`, `report.json`, `report.md`,
  `ci-job.json`, `soak/`, `regression-demo/`)

## Limitări

- FPS/GPU rămân `NOT_VALIDATED` pe această revizie; închiderea lor cere o rulare Chrome reală, pe
  hardware identificat, pe commitul de release, cu ambele backenduri.
- Regula relativă de regresie (>10 % și >5 MiB, 3/5 confirmări) nu poate declanșa singură sub capacitatea
  absolută de 8 MiB: baseline-ul +5 MiB depășește deja capacitatea, deci detectorul efectiv pentru bundle
  este capacitatea absolută. Regula este păstrată pentru viitoare baseline-uri mai mici și este raportată
  explicit, nu folosită ca să mascheze o creștere.
- Gate-ul nu măsoară timp de perete pentru probele 155/156/158; le verifică artefactele cu `--check` și
  folosește repetările lor comise. Miezul portabil (build + proba structurală 157) este singurul reexecutat
  de cinci ori aici.
- Soak-ul este al acestei revizii, dar rulează în Node; transportul worker-ului este loopback în proces, iar
  store-ul de commit al pipeline-ului este un dublu de test cu graniță asincronă, nu IndexedDB durabil.
- Fără trace-uri Chrome pe această revizie; pentru FPS, trace-urile rămân cele ale probei 220.
