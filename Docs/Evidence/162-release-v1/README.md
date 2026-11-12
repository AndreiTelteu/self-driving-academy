# Dovezi — PBI 162: gate și închiderea release-ului V1

Acest director conține checklist-ul executat al release-ului V1, verdictul agregat și artefactul de
livrare, produse de `npm run release:checklist`. Checklist-ul nu promite un release gata: măsoară
exact ce este dovedit pe revizia curentă și publică, fără să ascundă, ce a rămas `FAIL`,
`NOT_VALIDATED` sau `NOT_RUN`.

## Ce produce comanda

| Fișier | Conținut |
| --- | --- |
| [`checklist.json`](checklist.json) | 13 criterii cu verdict, comandă, rezultat real, 13 verificări executate și 26 de itemi deschiși |
| [`checklist.md`](checklist.md) | aceleași date, lizibil, cu tabele per criteriu, dependență și artefact |
| [`artifact.json`](artifact.json) | sinteza artefactului de livrare derivată din manifestul 160 (mărimi, checksum, livrare HTTP) |
| [`pipeline/ci-pipeline.json`](pipeline/ci-pipeline.json) | artefactul `npm run ci:verify` de pe această revizie, cu exit code per pas |

`npm run release:checklist` execută verificările și scrie cele trei fișiere. `npm run
release:checklist -- --check` le reexecută pe toate și compară rezultatul byte cu byte cu fișierele
comise. `npm run release:checklist -- --strict` transformă un release care nu este `PASS` în exit
code 1; rularea implicită scrie dovezile și iese 0, ca probele 155–159/224/235.

## Verdictul agregat

**Release V1: `NOT_VALIDATED`.** 13 criterii: **8 `PASS`**, **2 `FAIL`**, **1 `NOT_VALIDATED`**,
**2 `NOT_RUN`**; 13 verificări executate, 0 eșuate; **26 de itemi deschiși**, fiecare cu sursa și
motivul lui. Un criteriu `FAIL` nu este ascuns sub „nevalidat”: lista deschisă îl numește, iar
`summary.failed` este `true`.

| # | Criteriu | Verdict | Rezultat real |
| --- | --- | --- | --- |
| 1 | Dependențele V1 în Done, cu dovezi comise | `PASS` | 10/10 dependențe au fișier în `PBI/Done` și raport comis, fără „De completat” |
| 2 | Verificări statice obligatorii | `PASS` | 6/6 pași cu exit 0 (`typecheck`, `lint`, `format:check`, arhitectură, catalog, manifest de asseturi) |
| 3 | Suita completă de teste | `PASS` | 2 898 teste, 2 898 trecute, 0 eșuate |
| 4 | Board PBI valid, 162 într-o singură coloană | `PASS` | `Valid: true`, 235 de task-uri |
| 5 | Pipeline-ul CI 160 pe această revizie | `PASS` | bandă `verify`, `PASSED_WITH_PLAN_DEBT`; livrare `STATIC_VERIFIED`; datoria de plan în `PBI/Done/067-mode_toggle.md` este publicată, nu ascunsă |
| 6 | Gate-ul de performanță și soak 224 | `NOT_VALIDATED` | 17 rânduri: 16 `PASS`, 0 `FAIL`, 1 `NOT_VALIDATED` (`fps-hardware`); structural `PASS`, release `NOT_VALIDATED` |
| 7 | Gate-ul de experiență și revenire 235 | `FAIL` | 6 criterii: 4 `PASS`, 1 `FAIL` (C3), 1 `NOT_RUN` (C5); 16 sonde: 15 `PASS`, 1 `FAIL`; playtest 0/5 |
| 8 | QA vizual și accesibilitate 153 | `FAIL` | 22 capturi, 308 verificări, 300 trecute, 8 eșuate (5 de contract), 8 findings |
| 9 | Matricea de compatibilitate 154 | `PASS` | 9/9 combinații reale, 11/11 verificări deterministe, 11 combinații declarate `NOT_RUN` |
| 10 | Artefactul de livrare 160 | `PASS` | 130 artefacte, 6 172 078 B, JS+WASM 6 125 279 B = 73,02 % din 8 MiB, gzip 1 769 518 B, arbore SHA-256 `81e33b1d…`; 132 cereri HTTP, 130 payloaduri verificate |
| 11 | Documentație de release coerentă | `PASS` | 11 fișiere verificate, 0 linkuri locale rupte; indexul `Docs/README.md` leagă `Docs/18` și manualul |
| 12 | Demonstrație pe hardware-ul agreat | `NOT_RUN` | 0 rulări pe hardware agreat; doar probe Node și Chromium headless pe SwiftShader |
| 13 | Playtest uman și revenire | `NOT_RUN` | 0/5 participanți; retenția la 24 h / 7 zile nu este măsurată |

## Ce rămâne deschis, pe sursă

| Sursă | Itemi | Ce lipsește |
| --- | --- | --- |
| 224 | 1 | `fps-hardware`: FPS, frame p95/p99 și lucrul GPU pe hardware real, aceeași revizie, ambele backenduri |
| 235 | 3 | C3 `FAIL` (HUD/cameră/slidere), C5 `NOT_RUN` (playtest), playtest 0/5 participanți |
| 153 | 8 | cinci eșecuri de contract (D4–D8: text de 11,52 px pe cameră, 11 px și text tăiat în pop-up-ul KPI) plus trei findings de stres la 640×360 |
| 154 | 11 | combinații declarate `NOT_RUN`: Firefox, WebKit/Safari, Edge stable, Chrome stable separat, macOS/Metal, Linux/Vulkan, Android, iOS etc. |
| 216 | 2 | playtest în browser și frame p95/p99 pe hardware real, ambele `NOT_RUN` în suita deterministă |
| 151 | 1 | scenariul de browser al suitei V1, `NOT_RUN` |

Lista completă, cu motivul fiecărui item, este în [`checklist.json`](checklist.json) (cheia `open`)
și în [`checklist.md`](checklist.md). Ea nu conține estimări, procente de revenire sau valori
inventate.

## Artefactul de livrare

Artefactul nu este rescris aici: este buildul de producție al pipeline-ului 160, măsurat de
`npm run build:report -- --check` și rezumat în [`artifact.json`](artifact.json). Manifestul complet,
cu SHA-256 pentru fiecare dintre cele 130 de fișiere, este
[`Docs/Evidence/160-build-delivery/report.json`](../160-build-delivery/report.json).

- 130 de artefacte: 3 478 683 B JS, 2 646 596 B WASM, 43 917 B CSS, 2 882 B HTML.
- Total 6 172 078 B (5,89 MiB); JS+WASM critice 6 125 279 B, adică 73,02 % din capacitatea de
  8 MiB din `Docs/performance-budgets.json` (manifest `203-initial-1`, nemodificat).
- Două builduri independente produc același arbore: SHA-256
  `81e33b1d8c54a53b97087288dac3b7cf1f9f833f66eef07b108a23dc2042d3a9`.
- Livrare statică: 132 de cereri HTTP, 130 payloaduri verificate (status, mărime, SHA-256, MIME),
  0 eșuate.
- Checklist-ul compară bytes-ii JS+WASM cu rândul `bundle-critical-transfer` al gate-ului 224:
  ambii raportează 6 125 279 B, deci artefactul măsurat de livrare este cel măsurat de gate.

## Ce a rulat pe această mașină și ce ar fi nevoie pentru restul

Rulat efectiv aici: cele 13 verificări ale checklist-ului (Node 24, Windows 11), suita completă,
gate-ul 224 cu soak-ul comis de 60,001 minute / 20 de cicluri, probele 153 (raport comis, rederivat),
154 (raport comis, rederivat) și buildul de producție cu livrarea statică. Dovezile 154 includ o
sesiune Chromium headed 156 pe GPU AMD Radeon (RDNA-2) cu WebGPU și WebGL 2, dar pe un build
anterior; aici nu s-a rulat o demonstrație nouă pe GPU.

Ar fi nevoie pentru restul: o stație cu GPU real (desktopul de referință sau laptopul cu GPU
integrat) și Chrome/Edge stable pe Windows, plus macOS/Metal, Linux/Vulkan, Firefox, WebKit/Safari
și dispozitive Android/iOS pentru combinațiile declarate `NOT_RUN`; o pagină de joc completă pentru
„prima comandă acceptată”; minimum cinci participanți cu observator pentru playtest și o sesiune de
revenire la 24 h (ideal 7 zile). FPS-ul headless pe SwiftShader nu înlocuiește hardware-ul.

## Comenzi și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run release:checklist` | exit 0; 13 criterii, 8 `PASS`, 2 `FAIL`, 1 `NOT_VALIDATED`, 2 `NOT_RUN`; 26 de itemi deschiși |
| `npm run release:checklist -- --check` | exit 0; cele trei fișiere generate sunt curente |
| `npm run ci:verify -- --out=Docs/Evidence/162-release-v1/pipeline` | exit 0; `PASSED_WITH_PLAN_DEBT`, gate 224 structural `PASS`, release `NOT_VALIDATED`, livrare `STATIC_VERIFIED`, 12 pași cu exit 0 (planul este `DEBT`) |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0, 0 warning-uri |
| `npm run format:check` | exit 0 |
| `npm run check:architecture` | exit 0 |
| `npm run check:parameter-catalog` | exit 0 |
| `npm test` | exit 0; 2 898 teste, 2 898 trecute, 0 eșuate |
| `npm run assets:manifest -- --check` | exit 0 |
| `npm run perf:gate -- --check` | exit 0; 16 `PASS`, 0 `FAIL`, 1 `NOT_VALIDATED` |
| `npm run qa:fun -- --check` | exit 0; 4 `PASS`, 1 `FAIL`, 1 `NOT_RUN` |
| `npm run qa:ui -- --check` | exit 0; raport curent, verdict `FAIL` (300/308, 5 eșecuri de contract) |
| `npm run qa:compat -- --check` | exit 0; 9/9 combinații, 11 `NOT_RUN` declarate |
| `npm run build:report -- --check` | exit 0; 130 artefacte, digest `81e33b1d…` |
| `pwsh ./PBI/Validate-Board.ps1` | `Valid: true`, 235 de task-uri |

## Fișiere atinse

- `scripts/run-release-checklist.mjs` — checklist-ul executat (nou).
- `scripts/ci/run-release-pipeline.mjs` — parserul datoriei de plan este robust la mesajul PowerShell
  împachetat pe mai multe linii; comportamentul documentat (link rupt într-un fișier neatins = `DEBT`)
  funcționează acum și pentru `PBI/Done/067-mode_toggle.md`.
- `package.json` — intrarea `release:checklist`, ultima din blocul `scripts`.
- `Docs/18-validare-si-release.md` — secțiune nouă la final.
- `Docs/Evidence/162-release-v1/` — acest README, `checklist.json`, `checklist.md`, `artifact.json`,
  `pipeline/ci-pipeline.json`.
- Fișierul PBI mutat fizic din `PBI/To Do` în `PBI/In Progress`, apoi în `PBI/Done`.
- `src/` și `Docs/performance-budgets.json` nu au fost modificate.

## Limitări

- Checklist-ul rulează comenzile reale, deci durează câteva minute (suita completă plus buildul de
  două ori); `--check` reexecută tot, nu doar compară fișiere.
- FPS-ul pe hardware real, demonstrația pe hardware-ul agreat și playtestul uman rămân
  `NOT_VALIDATED`/`NOT_RUN`; checklist-ul nu le poate produce și nu le simulează.
- Defectele de text din 153 sunt reale și rămân `FAIL`: repararea lor cere un PBI care deține
  `src/ui`, iar acest PBI nu are voie să modifice `src/`.
- Datoria de plan preexistentă (`PBI/Done/067-mode_toggle.md` → un `.log` necomis, plus celelalte
  linkuri documentate de 160) rămâne `DEBT`; nu a fost reparată aici.
- Banda `ci:release` nu a fost executată aici: jobul ei rulează `perf:gate --measure`, care
  reîmprospătează dovezile 224 din afara ownership-ului acestui PBI. Refuzul de livrare fără
  hardware este dovedit de verdictul 224 (`release: NOT_VALIDATED`) și de checklist.
- `dist/` nu este comis; artefactul este reproductibil din pipeline-ul 160.
