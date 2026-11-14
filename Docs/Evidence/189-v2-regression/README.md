# Dovezi PBI 189 — regresii de compatibilitate și performanță V2

PBI 189 reexecută efectiv suita V1 revizia 0.3, matricea de compatibilitate și gate-urile de performanță
ale reviziei curente, leagă rezultatul de un workload V2 versionat (`189-workload-v2-1`) și publică un
verdict pe fiecare criteriu. **Rezultatul acestei revizii: 1 criteriu `PASS`, 0 `FAIL`, 2 `NOT_RUN`; toate
cele 13 comenzi executate au exit code 0.** `NOT_RUN` este declarat, nu ascuns: fără GPU real și fără un
fixture de harness cu pietoni/pericole, gate-ul de hardware și partea de timp a workload-ului V2 rămân
deschise.

Rapoartele generate: [report.json](report.json) și [report.md](report.md). Măsurătoarea gate-ului 224
reexecutată pe revizia curentă: [gate-measure/report.json](gate-measure/report.json).

## Ce s-a implementat

- `scripts/run-v2-regression-report.mjs` — comanda `npm run qa:v2-regression`. Rulează cele 13 comenzi
  (toate cu exit code real), definește workload-ul `189-workload-v2-1` din manifest și din dovezile
  comise ale componentelor V2, calculează verdictul pe cele trei criterii ale PBI-ului, verifică
  nemodificarea manifestului prin SHA-256 față de `HEAD` și scrie `report.json` + `report.md`.
  `--check` regenerează raportul și îl compară byte cu byte; `--strict` transformă un criteriu care nu
  este `PASS` în exit code 1.
- `package.json` — intrarea `qa:v2-regression`, ultima din blocul `"scripts"`.
- `Docs/18-validare-si-release.md` — secțiune nouă la final: verdictul V2 al reviziei 0.3 + workload V2.
- `Docs/Evidence/189-v2-regression/` — raportul, măsurătoarea gate-ului reexecutat și acest document.

`src/`, `Docs/25`, `Docs/performance-budgets.json`, `Docs/11`, `Docs/13`, `tests/qa/` existent și
baseline-ul nu au fost modificate. Alte PBI-uri din board nu au fost atinse.

## Matricea criteriilor

| ID | Criteriu | Verdict | Dovada reală |
| --- | --- | --- | --- |
| C1 | Suita V1 revizia 0.3 este reexecutată: cele trei moduri, civili, economie/reviews, daily, XP și checkpoint/replay | **PASS** | `qa:v1-regression -- --check` exit 0: 29 rânduri, 27 `PASS`, 0 `FAIL`, 2 `NOT_RUN` declarate (C3 playtest, C4 frame); cele 27 de rânduri cerute de criteriu (A1–A9, B1–B13, C1, C2, D1–D3) sunt `PASS`; pierderi XP 0, debitări 0 |
| C2 | Hardware-ul de referință trece țintele cu pietoni și catalog complet sau gate-ul rămâne deschis | **NOT_RUN** | `fps-hardware` = `NOT_VALIDATED`: capturile hardware 220 sunt pe buildul `2d68b43c8cdf`, pragurile absolute cer aceeași revizie. 155 raportează 85 `PASS` / 0 `FAIL` / 6 `NOT_MEASURED` pe configurația laptop, dar fără pietoni/pericole. Gate-ul rămâne deschis, nu se inventează FPS |
| C3 | Contractul 25 și gate-urile V1 sunt reexecutate pe workload V2 versionat; baseline-ul nu este relaxat tacit | **NOT_RUN** | Contractul 25 reexecutat pe revizia curentă: 158 `PASS`, 157 `STRUCTURAL_PASS`, 159 `SOAK_PASS`, 156 `MEASURED_GATE_PASS`, 224 reexecutat `structural PASS` cu 16 `PASS` / 0 `FAIL` / 1 `NOT_VALIDATED`. Manifest `203-initial-1` nemodificat (SHA-256 identic cu `HEAD`). Partea „pe workload V2 versionat” rămâne `NOT_RUN`: harness-ul nu are fixture cu pietoni/pericole |

## Workload V2 versionat — `189-workload-v2-1`

Workload-ul este derivat, nu copiat: fiecare componentă are o sursă comisă și un număr real.

| Componentă | Valoare | Sursă |
| --- | ---: | --- |
| Flotă | 30 taxiuri / 40 civili | `Docs/performance-budgets.json` → `workloads.maximumV1` |
| Pietoni | 96 entități, 80 treceri, 6 scenarii | `Docs/Evidence/164-pedestrians/report.json` |
| Pericole | 96 obstacole, 11 stimuli, 7 scenarii | `Docs/Evidence/165-hazards/report.json` |
| Catalog | 80 chei, 0 findings | `Docs/Evidence/187-v2-parameter-gate/report.json` |
| Provocări | 15 provocări, 5 familii, 40 verificări | `Docs/Evidence/188-v2-challenges/report.json` |
| Soak | 20 cicluri, 60,002 min | `Docs/Evidence/159-soak/report.json` |

Dovada funcțională este reexecutată: `pedestrians:report -- --check` exit 0 (6/6 scenarii, 96 pietoni),
`hazards:report -- --check` exit 0 (7/7 scenarii, 96 obstacole), `validate:parameters -- --check` exit 0
(80/80 chei, 0 findings), `missions:challenges-v2 -- --check` exit 0 (15 provocări, 40/40 verificări).

**De ce timpul este `NOT_RUN`.** Harness-ul de performanță are 33 de fișiere în `tests/harness`, cu **0**
referințe la pietoni și **0** la pericole; dovezile 155/156/158/224 au și ele 0 referințe. Workload-ul
exprimat de harness este doar flotă + civili. O măsurare de frame/simulare pe pietoni + pericole ar cere
un fixture nou și o pagină de harness cu GPU real, care nu există și nu pot fi create în ownership-ul
acestui PBI. Raportul nu inventează cifre de timp pentru V2.

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run qa:v2-regression` | exit 0; 13/13 comenzi exit 0; criterii 1 `PASS` / 0 `FAIL` / 2 `NOT_RUN`; regresii `PASS`; compatibilitate `PASS`; baseline nemodificat |
| `npm run qa:v2-regression -- --check` | exit 0; „Raportul V2 este curent” + „Markdown-ul V2 este curent” |
| `npm run qa:v1-regression -- --check` | exit 0; 29 rânduri, 27 `PASS`, 0 `FAIL`, 2 `NOT_RUN`; pierderi XP 0 |
| `npm run qa:compat -- --check` | exit 0; 9/9 combinații reale, 11/11 verificări deterministe, 11 combinații declarate `NOT_RUN` |
| `npm run perf:simulation-budget -- --check` | exit 0; decizii/estimare/transfer `PASS`, 3/3 echivalențe `IDENTICAL` |
| `npm run perf:render-budget -- --check` | exit 0; 17 `PASS`, 0 `FAIL`, 2 `NOT_MEASURED`, `STRUCTURAL_PASS` |
| `npm run perf:soak -- --check` | exit 0; `SOAK_PASS`, 60,002 min, 20 cicluri, 16 verificări, 7/7 tendințe `PLATEAU` |
| `npm run perf:traffic-benchmark -- --check` | exit 0; 36 `PASS`, 0 `FAIL`, 12 `STRESS`, 60 `REPORTED` |
| `npm run perf:hardware-budget -- --check` | exit 0; 155: 85 `PASS`, 0 `FAIL`, 6 `NOT_MEASURED`, `hardwareGameplayGate NOT_VALIDATED` |
| `npm run perf:gate -- --measure --out=Docs/Evidence/189-v2-regression/gate-measure` | exit 0; structural `PASS`, release `NOT_VALIDATED`, 16 `PASS` / 0 `FAIL` / 1 `NOT_VALIDATED`, commit `41c9b3aa9f2d` |
| `npm run perf:gate -- --check` | **exit 1**; `ISSUE măsurătoarea de build este învechită față de sursă` — dovada comisă a lui 224 descrie o revizie anterioară; nu a fost suprascrisă |
| `npm run validate:parameters -- --check` | exit 0; 80 chei, 0 findings, verdict `PASS` |
| `npm run missions:challenges-v2 -- --check` | exit 0; 15 provocări, 5 familii, 40/40 verificări |
| `npm run pedestrians:report -- --check` | exit 0; 96 pietoni, 80 treceri, 6 scenarii, 4 conflicte |
| `npm run hazards:report -- --check` | exit 0; 96 obstacole, 11 stimuli, 7 scenarii, 10 reacții |
| `npm test` | exit 0; **3 250 teste, 3 250 trecute, 0 eșuate** (≈108 s) |
| `npm run typecheck` | exit 0 (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | exit 0, 0 erori, 0 warning-uri |
| `npm run format:check` | exit 0, „All matched files use Prettier code style!” |
| `npm run check:architecture` | exit 0; probe negative 6 + 4 + 3 respinse |
| `npm run check:parameter-catalog` | exit 0, „Parameter catalog is synchronized.” |

Rezultatul gate-ului reexecutat pe revizia curentă: bundle **6 262 960 B** (5,97 MiB din capacitatea de
8 MiB), JS 3 616 364 B + WASM 2 646 596 B, gzip 1 805 985 B, 130 artefacte, 48/128 draw calls, 78/8192
instanțe thin, 40/512 batchuri, 12/4096 obiecte Babylon; `gameplay-systems-max-v1` raportează tick p95
maxim **7,00 ms** din bugetul de 8 ms.

## Dovada că baseline-ul nu s-a relaxat

| Indicator | Valoare |
| --- | --- |
| Fișier | `Docs/performance-budgets.json` |
| Versiune | `203-initial-1` |
| `approvedGate` | `false` |
| `hardwareGameplayGate` | `NOT_VALIDATED` |
| SHA-256 în lucru | `10d78ab5c999215684c821a1f32fd7045392f0f6d8c140c54115d0f73475a21c` |
| SHA-256 în `HEAD` | `10d78ab5c999215684c821a1f32fd7045392f0f6d8c140c54115d0f73475a21c` |
| Nemodificat | **DA** |

Raportul recalculează hash-ul la fiecare rulare și îl compară cu `git show HEAD:Docs/performance-budgets.json`.
Dacă manifestul ar fi editat, criteriul C3 ar deveni `FAIL`, nu ar primi un buget nou. `git status` nu
raportează modificări pe manifest.

## Constatări

- **`committed-gate-staleness` (owner 224).** `npm run perf:gate -- --check` iese cu exit 1:
  „măsurătoarea de build este învechită față de sursă”. Dovezile comise ale lui 224 au fost măsurate pe
  commitul `757e7168`, iar sursa a avansat (187/188). PBI 189 nu are voie să rescrie dovezile 224, deci
  gate-ul a fost reexecutat proaspăt, cu `--measure --out` în directorul acestui PBI. Rezultatul proaspăt
  este `structural PASS`, `release NOT_VALIDATED`. Repararea dovezii comise aparține proprietarului 224.
- **Bugetul de tick este aproape de plafon pe revizia curentă.** `gameplay-systems-max-v1` raportează
  7,00 ms p95 din 8 ms pe workload-ul maxim V1 (30/40); nu este o depășire, dar marja s-a redus față de
  cele 5,8 ms raportate de 155 pe laptop. Este o observație, nu o regresie dovedită: probele nu sunt
  aceeași configurație.

## Ce nu a putut rula și de ce

- **Hardware real cu pietoni și catalog complet (C2).** Nu există sesiune de browser cu GPU pe această
  revizie și nici un fixture hardware cu pietoni/pericole. Capturile 220 aparțin buildului
  `2d68b43c8cdf`, deci `fps-hardware` rămâne `NOT_VALIDATED`. Nu s-a raportat niciun FPS.
- **Timp pe workload-ul V2 (C3).** Harness-ul 155/156/158/220 exprimă doar flotă + civili (0 referințe la
  pietoni/pericole în 33 de fișiere `tests/harness`). Un fixture V2 cere un PBI care deține harness-ul.
- **Soak V2.** Soak-ul de 60 de minute este citit din măsurătoarea comisă 159/224 (commit `917a7de9`);
  nu a fost reexecutat aici și nu are variantă cu pietoni/pericole.
- **Playtestul moștenit din 216.** Rândul C3 al regresiei V1 rămâne `NOT_RUN`; cere jucători reali și nu
  este înlocuit de scenarii deterministe.

## Cine deblochează gate-ul

1. **Proprietarul 224** trebuie să re-măsoare dovezile comise (`perf:gate -- --measure`) după 187/188,
   ca `--check` să redevine verde pe revizia curentă.
2. **Proprietarul harness-ului de performanță (220/224)** trebuie să adauge un fixture versionat cu
   pietoni + pericole + catalog complet, ca `189-workload-v2-1` să aibă probe de timp, nu doar funcționale.
3. **Operatorul cu hardware real** trebuie să ruleze gate-ul pe aceeași revizie, pe ambele backenduri,
   pentru FPS/frame p95/p99/GPU. Fără această rulare, C2 rămâne `NOT_RUN` și release-ul rămâne
   `NOT_VALIDATED`.
4. **Playtestul uman** rămâne la PBI-ul care îl deține (235/162); nu poate fi acoperit de acest raport.

## Limitări

- Probele de timp rulează în Node, fără renderer, GPU sau input uman; ele nu dovedesc FPS, frame p95/p99
  sau latența pe hardware.
- Workload-ul V2 este dovedit funcțional, nu ca timp de execuție; cifrele de timp pentru V2 nu există.
- Soak-ul este citit din dovezi comise, nu reexecutat; o rulare reală durează o oră și aparține gate-ului
  complet.
- Raportul nu include commitul `HEAD`, ca `--check` să rămână valabil după commit; proveniența intrărilor
  este dată de SHA-256-ul fiecărui fișier de dovezi.
