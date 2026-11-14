# 189 — regresii de compatibilitate și performanță V2

Transcript determinist generat de `npm run qa:v2-regression`; verificarea este `npm run qa:v2-regression -- --check`.
Machine-readable: [report.json](report.json). Măsurătoarea gate-ului reexecutat: [gate-measure/report.json](gate-measure/report.json).
Workload versionat: `189-workload-v2-1`.

## Verdictele pe criterii

| Criteriu | Enunț | Verdict | Baza reală |
| --- | --- | --- | --- |
| **C1** | Suita V1 revizia 0.3 este reexecutată: moduri, civili, economie/reviews, daily, XP și checkpoint/replay | **PASS** | 29 rânduri: 27 PASS, 0 FAIL, 2 NOT_RUN; acoperire cerută 27/27; pierderi XP 0, debitări 0; rânduri declarate NOT_RUN în afara listei: C3, C4 |
| **C2** | Hardware-ul de referință trece țintele cu pietoni și catalog complet sau gate-ul rămâne deschis | **NOT_RUN** | fps-hardware NOT_VALIDATED: capturile hardware 220 sunt pe buildul 2d68b43c8cdf, iar măsurătoarea gate-ului reexecutat raportează structural PASS și release NOT_VALIDATED; pragurile absolute cer aceeași revizie. 155 raportează 85 PASS pe configurația laptop, dar fără pietoni/pericole în workload. Gate-ul rămâne deschis. |
| **C3** | Contractul 25 și gate-urile V1 sunt reexecutate pe workload V2 versionat; baseline-ul nu este relaxat tacit | **NOT_RUN** | Contractul 25 reexecutat: 158 PASS, 157 STRUCTURAL_PASS, 159 SOAK_PASS, 156 MEASURED_GATE_PASS, 224 structural PASS; manifest 203-initial-1 nemodificat. Workload-ul V2 are 0 referințe de pietoni/pericole în dovezile de performanță și 0 în `tests/harness`, deci gate-urile de timp nu îl pot rula: partea V2 rămâne NOT_RUN. |

Total: **1 PASS, 0 FAIL, 2 NOT_RUN**. Un verdict `NOT_RUN` lasă gate-ul deschis și nu este raportat ca `PASS`.

## Matricea executată: criteriu → comandă → exit code → verdict → cifră

Rândurile `compat`, `regressions` și `workload` sunt verificări de suport, nu criterii independente.

| Criteriu | Comandă | Exit | Verdict | Cifră / dovadă |
| --- | --- | ---: | --- | --- |
| C1 | `npm run qa:v1-regression -- --check` | 0 | PASS | 29 rânduri, 27 PASS, 0 FAIL, 2 NOT_RUN; pierderi XP 0, debitări 0 |
| compat | `npm run qa:compat -- --check` | 0 | PASS | 9/9 combinații reale PASS, 0 FAIL, 11/11 verificări deterministe, 11 combinații declarate NOT_RUN |
| C2 | `npm run perf:hardware-budget -- --check` | 0 | PASS | 155: 85 PASS, 0 FAIL, 6 NOT_MEASURED; laptop 8 configurații, hardwareGameplayGate NOT_VALIDATED |
| C3 | `npm run perf:simulation-budget -- --check` | 0 | PASS | 158: decizii PASS, estimare PASS, transferuri PASS, 3/3 echivalențe IDENTICAL |
| C3 | `npm run perf:render-budget -- --check` | 0 | PASS | 157: 17 PASS, 0 FAIL, 2 NOT_MEASURED, gate STRUCTURAL_PASS |
| C3 | `npm run perf:soak -- --check` | 0 | PASS | 159: SOAK_PASS, 60.002 min, 20 cicluri, 16 verificări |
| C3 | `npm run perf:traffic-benchmark -- --check` | 0 | PASS | 156: 36 PASS, 0 FAIL, 12 STRESS, 60 REPORTED, gate MEASURED_GATE_PASS |
| C3 | `npm run perf:gate -- --measure --out=Docs/Evidence/189-v2-regression/gate-measure` | 0 | PASS | 224 reexecutat: structural PASS, release NOT_VALIDATED, 16 PASS, 0 FAIL, 1 NOT_VALIDATED; bundle 5.97 MiB (6262960 B) din 8.00 MiB; JS 3616364 B + WASM 2646596 B, gzip 1805985 B, 130 artefacte |
| regressions | `npm run validate:parameters -- --check` | 0 | PASS | 187: 80 chei, 0 findings, verdict PASS |
| regressions | `npm run missions:challenges-v2 -- --check` | 0 | PASS | 188: 15 provocări, 5 familii, 40/40 verificări |
| workload | `npm run pedestrians:report -- --check` | 0 | PASS | 164: 96 pietoni, 80 treceri, 6 scenarii, 4 conflicte |
| workload | `npm run hazards:report -- --check` | 0 | PASS | 165: 96 obstacole, 11 stimuli, 7 scenarii, 10 reacții |
| regressions | `npm test` | 0 | PASS | 3250 teste, 3250 trecute, 0 eșuate |

## Workload V2 versionat — `189-workload-v2-1`

| Componentă | Valoare | Sursă |
| --- | ---: | --- |
| Flotă | 30 taxiuri / 40 civili | Docs/performance-budgets.json workloads.maximumV1 |
| Pietoni | 96 entități, 80 treceri, 6 scenarii | Docs/Evidence/164-pedestrians/report.json |
| Pericole | 96 obstacole, 11 stimuli, 7 scenarii | Docs/Evidence/165-hazards/report.json |
| Catalog | 80 chei, 0 findings | Docs/Evidence/187-v2-parameter-gate/report.json |
| Provocări | 15 provocări în 5 familii, 40 verificări | Docs/Evidence/188-v2-challenges/report.json |
| Soak | 20 cicluri, 60.002 min | Docs/Evidence/159-soak/report.json |

Dovada funcțională a workload-ului: pedestrians-v2, hazards-v2, parameter-gate, challenges-v2.
Măsurarea de timp pe acest workload este **NOT_RUN**: Harness-ul de performanță nu are fixture cu pietoni/pericole: 33 fișiere în tests/harness, 0 referințe de pietoni și 0 de pericole; dovezile 155/156/158/224 au 0 referințe. Măsurarea frame/simulare pe workload-ul V2 cere o pagină de harness și un GPU real, indisponibile aici.

## Suita V1 revizia 0.3, rând cu rând

| ID | Categorie | Verdict | Scenariu |
| --- | --- | --- | --- |
| A1 | MODES | PASS | Toate cele șase tranziții pe taxi, cu un singur scaun PLAYER |
| A2 | MODES | PASS | Toate cele șase tranziții pe un vehicul civil |
| A3 | MODES | PASS | Tranziția păstrează viteza, direcția și pasul de poziție |
| A4 | MODES | PASS | Defecte injectate: salt de poziție și schimbare de viteză |
| A5 | MODES | PASS | Defecte injectate: două scaune, segment lipsă și segment străin |
| A6 | PROPAGATION | PASS | Taxiurile și civilii adoptă aceeași versiune de stil |
| A7 | PROPAGATION | PASS | Un segment MANUAL civil nu învață și nu publică |
| A8 | LEARNING_BARRIER | PASS | Restore cu un job în coadă: jobul este anulat, rezultatul târziu refuzat |
| A9 | LEARNING_BARRIER | PASS | Import invalid: refuz fără generație nouă |
| B1 | KPI | PASS | Venit și rating în ambele direcții, plus un incident real |
| B2 | KPI | PASS | Aceleași fapte, trei moduri de control |
| B3 | KPI | PASS | Douăsprezece luni sintetice, paginare vizuală și medie ponderată |
| B4 | KPI | PASS | Pop-up închis fără citiri, deschidere cu o singură citire, pauză în MANUAL |
| B5 | DAILY | PASS | Exact trei misiuni, obiectiv MANUAL îndeplinit și recompense unice pe obiectiv |
| B6 | DAILY | PASS | Eveniment străin, mod nepotrivit și ziua următoare |
| B7 | XP | PASS | Credite idempotente, fracții de minut și ferestre excluse |
| B8 | XP | PASS | Un credit negativ este refuzat, nu debitat |
| B9 | XP | PASS | Amprente înainte/după pe cele cinci căi de scădere |
| B10 | CHECKPOINT | PASS | Captură, commit, reluare și 60 de tick-uri identice cu oracolul |
| B11 | CHECKPOINT | PASS | Captură în interiorul tick-ului și snapshot modificat |
| B12 | REPLAY | PASS | Fereastră completă, checksum reproductibil și rând modificat refuzat |
| B13 | REPLAY | PASS | Seek și redare fără venit, review, reward sau XP |
| C1 | COMBINED | PASS | Conducere cu learning, recorder, autosave, KPI și XP în aceeași sesiune |
| C2 | BENCHMARK | PASS | Costurile noi ale stack-ului combinat, față de bugetele din manifest |
| C3 | PLAYTEST | NOT_RUN | Playtest în browser: explicații, senzație de condus, HUD |
| C4 | BENCHMARK | NOT_RUN | Frame p95/p99 pe hardware real |
| D1 | DEPENDENCIES | PASS | Gate separat pentru extensii, fără dependență inversă |
| D2 | DEPENDENCIES | PASS | Graful complet de dependențe nu are cicluri |
| D3 | DEPENDENCIES | PASS | Dependențele regresiei V1 sunt în Done |

## Matricea de compatibilitate 154

| Combinație | Scenariu | Backend | Verdict |
| --- | --- | --- | --- |
| production-headed-auto | AUTO | WEBGPU | PASS |
| production-headed-webgpu-off | WEBGPU_UNAVAILABLE | WEBGL2 | PASS |
| production-headed-no-backend | NO_BACKEND | NONE | PASS |
| production-headed-webgl1-only | WEBGL1_ONLY | NONE | PASS |
| production-headless-auto | AUTO | WEBGL2 | PASS |
| harness-headed-auto | AUTO | WEBGPU | PASS |
| harness-headless-auto | AUTO | WEBGL2 | PASS |
| harness-headed-recovery-webgpu | RECOVERY_LOSS | WEBGPU | PASS |
| harness-headless-recovery-webgl2 | RECOVERY_LOSS | WEBGL2 | PASS |

Verificări deterministe: **11/11**;
combinații declarate `NOT_RUN`: **11**. Verdict general: **PASS**.

## Regresii funcționale V2

3250 teste (0 eșuate); 187 80 chei/0 findings; 188 15 provocări/40 verificări; 164 PASS; 165 PASS. Verdict: **PASS**.
Suita completă: 3250 teste, 3250 trecute, 0 eșuate, exit 0.

## Baseline-ul nu este relaxat

| Indicator | Valoare |
| --- | --- |
| Fișier | `Docs/performance-budgets.json` |
| Versiune bugete | `203-initial-1` |
| `approvedGate` | `false` |
| `hardwareGameplayGate` | `NOT_VALIDATED` |
| SHA-256 în lucru | `10d78ab5c999215684c821a1f32fd7045392f0f6d8c140c54115d0f73475a21c` |
| SHA-256 în `HEAD` | `10d78ab5c999215684c821a1f32fd7045392f0f6d8c140c54115d0f73475a21c` |
| Nemodificat | **DA** |

## Constatări

- **committed-gate-staleness** (`npm run perf:gate -- --check` → exit 1, owner 224): Dovada comisă a gate-ului 224 este învechită față de sursă după revizia pe care a fost măsurată: `--check` raportează „măsurătoarea de build este învechită față de sursă”. PBI 189 nu suprascrie dovezile 224; gate-ul este reexecutat proaspăt în `gate-measure/` pentru revizia curentă (structural PASS).

## Ce a rămas NOT_RUN

- **hardware-v2**: Țintele FPS/frame/GPU pe hardware real cu pietoni și catalog complet nu au fost măsurate: nu există sesiune de browser cu GPU pe această revizie, iar fixture-ul 220 nu include pietoni/pericole. Gate-ul rămâne deschis.
- **workload-v2-timing**: Workload-ul 189-workload-v2-1 este definit și dovedit funcțional, dar nu are probe de timp: harness-ul existent (155/156/158/220) exprimă doar flotă + civili.
- **soak-v2**: Soak-ul de 60 de minute este dovedit de măsurătoarea comisă 159/224 (commit 917a7de9), nu reexecutat aici; soak-ul V2 cu pietoni/pericole nu are fixture.

## Limitări

- Probele de timp rulează în Node, fără renderer, GPU sau input uman; ele nu dovedesc FPS, frame p95/p99 sau latența pe hardware.
- Workload-ul V2 nu poate fi exprimat de harness-ul existent: 155/156/158/220 acoperă flotă și civili, fără pietoni sau pericole. Cifrele de timp pentru V2 nu sunt inventate.
- Soak-ul de 60 de minute este citit din măsurătoarea comisă a lui 159/224, nu reexecutat; o rulare reală durează o oră și aparține gate-ului complet.
- Capturile hardware 220 sunt pe buildul 2d68b43c8cdf, iar măsurătoarea 224 pe 757e7168; pragurile absolute cer aceeași revizie, deci FPS rămâne NOT_VALIDATED.
- Raportul nu include commitul HEAD, ca `--check` să rămână valabil după commit; proveniența intrărilor este dată de SHA-256.

## Intrări verificate (SHA-256)

| Fișier | SHA-256 |
| --- | --- |
| `Docs/performance-budgets.json` | `10d78ab5c999215684c821a1f32fd7045392f0f6d8c140c54115d0f73475a21c` |
| `Docs/Evidence/216-v1-regression/report.json` | `b9ac66fdb82a7ef2951dcd9a16351032e1292d7ca1731dba81900d95fdd16593` |
| `Docs/Evidence/154-compat-matrix/report.json` | `92136164b1e176831c49b96d2f319dfe2976db860aa5cde12a41ac17304e925e` |
| `Docs/Evidence/155-hardware-budget/report.json` | `e35c6f5d2ccb3a243fcba52e2a7ea6b481a30b551b561a27d18f1ae129b98653` |
| `Docs/Evidence/156-traffic-benchmark/report.json` | `1d02e17af747d32c2a3fd9c35afdd3ff1e7df460983c32c164f3d5a5936e6553` |
| `Docs/Evidence/157-render-budget/report.json` | `04e9075c82283834487603217639985736ccdbe0364367c5de1d72701317d759` |
| `Docs/Evidence/158-simulation-budget/report.json` | `eee9479bf4cc0086c4519fd0b1d8c1c14deac97943aebea0792035c5f2bd26f7` |
| `Docs/Evidence/159-soak/report.json` | `59c8b2b649c96af728bcf2df9a34ae0bd18277ffea1529c8595d0f0540d2fe5d` |
| `Docs/Evidence/187-v2-parameter-gate/report.json` | `2a6b7e6ac7dc51d5bab7c8c8ce133653d3a55403f92a7d6405723d6a094909fe` |
| `Docs/Evidence/188-v2-challenges/report.json` | `a1ae6cb49ea0b95ca58769660bfb33a282288b700e5e35c062b6e7a9979601d0` |
| `Docs/Evidence/164-pedestrians/report.json` | `b43d4361d2ee2156176dad1f877a6b313be7dafffbea014915d593e816f5c5bf` |
| `Docs/Evidence/165-hazards/report.json` | `567b0052fed43b219ca9e82350321c88b36319aeb1fb85a9919f864d34c0534d` |
| `Docs/Evidence/224-performance-gate/report.json` | `baac4afce8a573ca8141a1cd3aebdd953eacb9208de87a6729ed6b217020dc7f` |
