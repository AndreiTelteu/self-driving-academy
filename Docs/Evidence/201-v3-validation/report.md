# 201 — validare integrală V3

Transcript determinist generat de `npm run qa:v3-validation`; verificarea este `npm run qa:v3-validation -- --check`.
Machine-readable: [report.json](report.json). Măsurătoarea gate-ului reexecutat: [gate-measure/report.json](gate-measure/report.json).
Workload versionat: `201-workload-v3-1`.

## Verdictele pe criterii

| Criteriu | Enunț | Verdict | Baza reală |
| --- | --- | --- | --- |
| **C1** | Toate fluxurile manual/AUTO funcționează și după intrare/ieșire | **PASS** | 3/3 moduri (AUTO/MANUAL/LEARNING) trec lanțul real 192→195→193→196→197→198 și 3/3 conduceri rămân cu o singură autoritate; fiecare mod se reia după ieșire (FOCUS+TAKE+RETURN) și personajul merge 1.226 m; 216 27/29 rânduri PASS cu 0 pierderi XP; 198 16/16 scenarii; 200 160/160 verificări de salvare/reload. |
| **C2** | Catalogul și indicatorii nu sunt alterați de mers | **PASS** | 9/9 digeste SHA-256 identice după 5000 tick-uri de mers (114.10 m) și după reload 200: catalog 092 (fișier + registru), capabilități 187, KPI 209 (1 zi), ledger 209 (3 decontări), XP 213 (2 intrări, 100.5 XP / nivel 2), daily 211 și sesiunea 135; reload ACCEPTED, checksum verificat, 0 corpuri create, al doilea reload identic. 187: 80 chei, 0 findings. |
| **C3** | Cele trei moduri, personajul și streamingul vizual trec contractul 25; workload/bugete V3 explicit versionate | **NOT_RUN** | Contractul 25 reexecutat pe workload-ul `201-workload-v3-1`: 158 PASS, 157 STRUCTURAL_PASS (17 PASS / 2 NOT_MEASURED), 159 SOAK_PASS, 224 structural PASS, 154 9/9 combinații. Manifest 203-initial-1 nemodificat (SHA-256 identic cu HEAD). FPS/frame pe GPU real rămâne NOT_RUN (fps-hardware NOT_VALIDATED): cei 2 pași vizuali NOT_MEASURED cer renderer real. |

Total: **2 PASS, 0 FAIL, 1 NOT_RUN**. Un verdict `NOT_RUN` lasă gate-ul deschis și nu este raportat ca `PASS`.

## Matricea executată: criteriu → comandă → exit code → verdict → cifră

| Criteriu | Comandă | Exit | Verdict | Cifră / dovadă |
| --- | --- | ---: | --- | --- |
| C1 | `suites 201 (tests/qa/v3-validation-flow.ts)` | 0 | PASS | 3/3 moduri (AUTO/MANUAL/LEARNING), 3/3 conducere; mers după ieșire 1.226 m |
| C1 | `npm run qa:v1-regression -- --check` | 0 | PASS | 29 rânduri, 27 PASS, 0 FAIL, 2 NOT_RUN; pierderi XP 0, debitări 0 |
| C1 | `npm run walking:segments -- --check` | 0 | PASS | 198: 3600 tick-uri de mers, 82.26 m, 0 segmente închise de mers, 16/16 scenarii |
| C1 | `npm run walking:save -- --check` | 0 | PASS | 200: 160/160 verificări, 4/4 scenarii, 18/18 refuzuri |
| C2 | `suites 201 (tests/qa/v3-validation-digest.ts)` | 0 | PASS | 9/9 digeste identice după 5000 tick-uri de mers și după reload 200; XP 100.5 / nivel 2 |
| C2 | `npm run validate:parameters -- --check` | 0 | PASS | 187: 80 chei, 0 findings, verdict PASS |
| C3 | `npm run perf:simulation-budget -- --check` | 0 | PASS | 158: decizii PASS, estimare PASS, transferuri PASS, 3/3 echivalențe IDENTICAL |
| C3 | `npm run perf:render-budget -- --check` | 0 | PASS | 157: 17 PASS, 0 FAIL, 2 NOT_MEASURED, gate STRUCTURAL_PASS |
| C3 | `npm run perf:soak -- --check` | 0 | PASS | 159: SOAK_PASS, 60.002 min, 20 cicluri, 16 verificări |
| C3 | `npm run perf:gate -- --measure --out=Docs/Evidence/201-v3-validation/gate-measure` | 0 | PASS | 224 reexecutat: structural PASS, release NOT_VALIDATED, 16 PASS, 0 FAIL, 1 NOT_VALIDATED |
| C3 | `npm run qa:compat -- --check` | 0 | PASS | 9/9 combinații reale, 11/11 verificări deterministe, 11 declarate NOT_RUN |
| C3 | `npm run missions:challenges-v2 -- --check` | 0 | PASS | 188: 15 provocări, 5 familii, 40/40 verificări |
| C3 | `npm test` | 0 | PASS | 3490 teste, 3490 trecute, 0 eșuate |

## Criteriul 1 — lanțul real, pe fiecare mod

Fiecare rând pornește de la un walker 192 real, intră prin 195, trece prin 193 pe VEHICLE, iese prin 196,
se reia prin 197 FOCUS+TAKE și se închide prin 198. „Închise M/L/cand" numără segmentele MANUAL, LEARNING
și candidații 069.

| Mod | Verdict | Tick-uri | Mers după ieșire (m) | Re-intrare | Închise M/L/cand | Tranziții 193 | Comenzi C/V |
| --- | --- | ---: | ---: | --- | --- | ---: | --- |
| `AUTO` | PASS | 66 | 1.226 | ACCEPTED | 2/0/0 | 4 | 64/2 |
| `MANUAL` | PASS | 66 | 1.226 | ACCEPTED | 2/0/0 | 4 | 64/2 |
| `LEARNING` | PASS | 66 | 1.226 | ACCEPTED | 1/1/1 | 4 | 64/2 |

Conducerea lungă (193 + 194, fără 198) dovedește că inputul rămâne singular cât timp corpul este suspendat:

| Mod | Verdict | Tick-uri | Comenzi vehicul | Comenzi personaj | Refuzuri consumator inactiv | Tick-uri walker |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `AUTO` | PASS | 122 | 121 | 0 | 1 | 0 |
| `MANUAL` | PASS | 122 | 121 | 0 | 1 | 0 |
| `LEARNING` | PASS | 122 | 121 | 0 | 1 | 0 |

## Criteriul 2 — digeste înainte / după mers / după reload 200

5000 tick-uri de mers real, 114.10 m; apoi arhiva v2 este migrată la v3 prin 200,
citită strict și reluată. Fiecare digest este SHA-256 peste octeții canonici.

| Digest | Sursă | Înainte | După mers | După reload |
| --- | --- | --- | --- | --- |
| `catalog-092-file` | Docs/driving-parameters.json | `c75ba02c0555bd94…` | DA | DA |
| `catalog-092-data` | src/profiles/parameter-catalog.generated.ts | `416ab9d3d64488ed…` | DA | DA |
| `registry-092` | src/profiles/parameter-registry.ts | `61d676c73d352d25…` | DA | DA |
| `capabilities-187` | src/profiles/parameter-capabilities.ts | `ed17879b6fac932d…` | DA | DA |
| `kpi-209` | componenta economy din arhiva 215, secțiunea kpi | `615c8bce50041b49…` | DA | DA |
| `ledger-209` | componenta economy din arhiva 215, secțiunea ledger | `db1d7787f1e613ee…` | DA | DA |
| `xp-213` | componenta economy din arhiva 215, secțiunea player | `5a63d7a22b03e336…` | DA | DA |
| `daily-211` | componenta economy din arhiva 215, secțiunea daily | `ba23118b5a51819a…` | DA | DA |
| `session-135` | components.session din arhiva v2/v3 | `ae5a8ffb1660e00f…` | DA | DA |

Reload: **ACCEPTED**, checksum **verificat**, autoritate
`CHARACTER:character:player-1`, cameră `character:player-1`, 71 entități
(1 personaj + 70 vehicule), **0** corpuri create,
XP **100.5** / nivel 2, 1 recompensă daily,
3 decontări, 1 tastă neutralizată. Al doilea reload are același digest:
**DA**.

## Workload V3 versionat — `201-workload-v3-1`

| Componentă | Valoare | Sursă |
| --- | ---: | --- |
| Personaj | 1 entitate, 10 contracte 191–200 | Docs/Evidence/191-v3-character/report.json … 200-v3-walking-save/report.json |
| Flotă | 30 taxiuri / 40 civili | Docs/performance-budgets.json workloads.maximumV1 |
| Pietoni | 96 entități, 80 treceri, 6 scenarii | Docs/Evidence/164-pedestrians/report.json |
| Pericole | 96 obstacole, 11 stimuli, 7 scenarii | Docs/Evidence/165-hazards/report.json |
| Catalog | 80 chei, 0 findings | Docs/Evidence/187-v2-parameter-gate/report.json |
| Provocări | 15 provocări în 5 familii, 40 verificări | Docs/Evidence/188-v2-challenges/report.json |
| Bugete | moștenite nemodificat din `203-initial-1` | Docs/performance-budgets.json proposedBudgets |

Contractele V3, fiecare citit din raportul propriu:

| Contract | Dovezi |
| --- | --- |
| `191-character-v1` | `Docs/Evidence/191-v3-character/report.json` |
| `192-walker-v1` | `Docs/Evidence/192-v3-walker/report.json` |
| `193-input-authority-v1` | `Docs/Evidence/193-v3-authority/report.json` |
| `194-character-camera-v1` | `Docs/Evidence/194-v3-camera/report.json` |
| `195-enter-vehicle-v1` | `Docs/Evidence/195-v3-enter/report.json` |
| `196-exit-vehicle-v1` | `Docs/Evidence/196-v3-exit/report.json` |
| `197-fleet-switch-v1` | `Docs/Evidence/197-v3-fleet-switch/report.json` |
| `198-walking-segments-v1` | `Docs/Evidence/198-v3-walking-segments/report.json` |
| `199-walking-tutorial-v1` | `Docs/Evidence/199-v3-walking-tutorial/report.json` |
| `200-walking-save-v1` | `Docs/Evidence/200-v3-walking-save/report.json` |

Măsurarea de timp pe acest workload este **NOT_RUN**: Harness-ul de performanță (155/156/158/220/224) exprimă flota și civilii; nu are fixture cu personaj, pietoni sau pericole. Măsurarea frame/simulare pe `201-workload-v3-1` cere o pagină de harness cu GPU real, care nu există în ownership-ul acestui PBI. Cifrele de FPS/tick pentru V3 nu sunt inventate.

## Baseline-ul nu este relaxat

| Indicator | Valoare |
| --- | --- |
| Fișier | `Docs/performance-budgets.json` |
| Versiune bugete | `203-initial-1` |
| `status` | `FIXED_INITIAL_CONTRACT_WITH_PROVISIONAL_GAMEPLAY_BUDGETS` |
| `approvedGate` | `false` |
| `hardwareGameplayGate` | `NOT_VALIDATED` |
| SHA-256 în lucru | `10d78ab5c999215684c821a1f32fd7045392f0f6d8c140c54115d0f73475a21c` |
| SHA-256 în `HEAD` | `10d78ab5c999215684c821a1f32fd7045392f0f6d8c140c54115d0f73475a21c` |
| Nemodificat | **DA** |

## Constatări

- **gate-release-open** (owner 224 / operator): Gate-ul reexecutat raportează structural PASS, dar release NOT_VALIDATED; dovada comisă a lui 224 nu este suprascrisă.
- **render-not-measured** (owner 157 / 223): 2 pași de streaming vizual nu au măsurătoare; gate-ul lor rămâne deschis.

## Ce a rămas NOT_RUN

- **hardware-fps-v3** (owner 224 / operator cu GPU real): fps-hardware = NOT_VALIDATED: capturile hardware 220 sunt pe alt build, iar pragurile absolute cer aceeași revizie. Fără o sesiune Chrome/Babylon pe GPU real, pe ambele backenduri, FPS și frame p95/p99 rămân deschise.
- **harness-v3-timing** (owner 220 / 224): Workload-ul 201-workload-v3-1 este definit și dovedit funcțional, dar nu are probe de timp: harness-ul 155/156/158/220 nu cunoaște personajul, pietonii sau pericolele.
- **visual-streaming-257** (owner 157 / 223): 157 raportează 2 pași NOT_MEASURED pentru streamingul vizual; ei cer un renderer real, nu doar probe structurale. Gate-ul de release rămâne deschis.
- **soak-v3** (owner 159 / 224): Soak-ul de 60 de minute este citit din măsurătoarea comisă 159/224, nu reexecutat aici; nu are variantă cu personaj, pietoni și pericole.
- **playtest-human** (owner 235 / 216): Playtestul uman (rândul C3 al regresiei 216) rămâne NOT_RUN: cere jucători reali și nu este înlocuit de scenarii deterministe.

## Limitări

- Suitele V3 rulează headless, în Node, fără renderer, GPU sau input uman; ele dovedesc contractele, nu FPS, frame p95/p99 sau latența.
- Workload-ul 201-workload-v3-1 este dovedit funcțional, nu ca timp de execuție; harness-ul nu are fixture cu personaj, pietoni sau pericole.
- Soak-ul de 60 de minute este citit din măsurătoarea comisă 159/224, nu reexecutat; o rulare reală durează o oră și aparține gate-ului complet.
- Capturile hardware 220 sunt pe alt build decât revizia curentă; pragurile absolute cer aceeași revizie, deci FPS rămâne NOT_VALIDATED.
- Raportul nu include commitul HEAD, ca `--check` să rămână valabil după commit; proveniența intrărilor este dată de SHA-256.

## Intrări verificate (SHA-256)

| Fișier | SHA-256 |
| --- | --- |
| `Docs/performance-budgets.json` | `10d78ab5c999215684c821a1f32fd7045392f0f6d8c140c54115d0f73475a21c` |
| `Docs/Evidence/216-v1-regression/report.json` | `fa2ae11b14e7b77f057fffc9a7173c566c353401dfb7401214dd983c998c9942` |
| `Docs/Evidence/154-compat-matrix/report.json` | `92136164b1e176831c49b96d2f319dfe2976db860aa5cde12a41ac17304e925e` |
| `Docs/Evidence/158-simulation-budget/report.json` | `eee9479bf4cc0086c4519fd0b1d8c1c14deac97943aebea0792035c5f2bd26f7` |
| `Docs/Evidence/157-render-budget/report.json` | `eb7abbd05893c0bd88ef06302418faceba3e31c4a4bddb3e6978862f91e53aa6` |
| `Docs/Evidence/159-soak/report.json` | `59c8b2b649c96af728bcf2df9a34ae0bd18277ffea1529c8595d0f0540d2fe5d` |
| `Docs/Evidence/187-v2-parameter-gate/report.json` | `2a6b7e6ac7dc51d5bab7c8c8ce133653d3a55403f92a7d6405723d6a094909fe` |
| `Docs/Evidence/188-v2-challenges/report.json` | `a1ae6cb49ea0b95ca58769660bfb33a282288b700e5e35c062b6e7a9979601d0` |
| `Docs/Evidence/164-pedestrians/report.json` | `b43d4361d2ee2156176dad1f877a6b313be7dafffbea014915d593e816f5c5bf` |
| `Docs/Evidence/165-hazards/report.json` | `567b0052fed43b219ca9e82350321c88b36319aeb1fb85a9919f864d34c0534d` |
| `Docs/Evidence/198-v3-walking-segments/report.json` | `ec3250ca5b0acda6a8e10cc7ca598aea5f49232374d0fe63fd10dcc4faf0ebd8` |
| `Docs/Evidence/200-v3-walking-save/report.json` | `3ace80c7c9386900f0f4708f2a319d16152d559af5779885bf267918f982a526` |
| `Docs/Evidence/224-performance-gate/report.json` | `baac4afce8a573ca8141a1cd3aebdd953eacb9208de87a6729ed6b217020dc7f` |
| `Docs/Evidence/191-v3-character/report.json` | `8a2bacb23027d63f907ecbee1a708eb9037457d5ce02d7614987c0e3b87d9ed4` |
| `Docs/Evidence/192-v3-walker/report.json` | `36954fbe31df95f5002439bd6fa183b9f22883bb1c75a355ee057e2211c39882` |
| `Docs/Evidence/193-v3-authority/report.json` | `f28d33e9a24c22866ae9c1bb119f9c9543240292ed3a2f8a478c79cdfb857ad1` |
| `Docs/Evidence/194-v3-camera/report.json` | `af2fe8b219ccf0399347dbf78e75b3287bdd9cf7bc6228f453169e6829b2d1f8` |
| `Docs/Evidence/195-v3-enter/report.json` | `776c1e9188840c86e5227eb0af78ba7ad0b22527820955f1d9b3eb65fe66f653` |
| `Docs/Evidence/196-v3-exit/report.json` | `e77ed165ae5a66c772e81ec84ca2699e180e6cc79046227c7bac112dc376c5be` |
| `Docs/Evidence/197-v3-fleet-switch/report.json` | `e7ba242ee61f13a884acfe0c2f517b100c0dff0de50fc02bace1d7ff4ec160a6` |
| `Docs/Evidence/199-v3-walking-tutorial/report.json` | `6f3b40af8c1996371d69345f5586eae25c5b2a011a0cf419f5152e92cf364873` |
