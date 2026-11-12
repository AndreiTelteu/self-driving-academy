# PBI 159 — dovada soak-ului de 60 de minute

Sesiune lungă reală de memorie, cozi, retenție și stabilitatea flotei, cerută de `performance_checks`
(`soak`, `memory`, `storage`, `workers`) și de contractul din
[Docs/25-performanta-contracte-si-benchmark.md](../../25-performanta-contracte-si-benchmark.md).

## Ce s-a livrat

- `tests/harness/soak-session.ts` — sonda de soak: 20 de cicluri lifecycle (start → curse cu
  intervenții → reset cu verificare de scurgeri → reload), cadență reală de 60 Hz, eșantionare la
  30 s, retenție 132 cu cote, governor 221, pipeline 222, recorder 207, learning 103→112 și
  recuperarea blocajelor 054, plus seria de throttling citită din OS.
- `tests/harness/soak-report.ts` — analiza deterministă: tendințe pe fereastra finală, verificări
  citate din manifest, incidente, throttling, verdict `SOAK_PASS` / `SOAK_FAIL` / `DIAGNOSTIC` și
  `verifySoakReport`, care refuză un `PASS` fără măsurătoare.
- `scripts/run-soak-report.mjs` — comanda `perf:soak` (`--measure`, `--check`, `--minutes`,
  `--cycles`, `--interval`, `--stall-cycles`), care scrie `measurement.json`, `report.json`,
  `report.md` și jurnalul `soak-run.txt`.
- `tests/harness/soak-report.test.ts` — 14 teste deterministe pe fixture (fără browser, fără timp de
  perete).
- `package.json` — scriptul `perf:soak`, ultima intrare din blocul `scripts`.

## Cum se rulează

```powershell
npm run perf:soak -- --measure --commit=917a7de9   # soak real, 60 min, 20 cicluri
npm run perf:soak -- --check                       # compară artefactele derivate cu cele comise
```

O rulare scurtă (`--minutes 2`) rămâne diagnostic: raportul iese `DIAGNOSTIC`, iar `--check` nu îl
acceptă ca dovadă de soak.

## Rularea comisă

| Câmp | Valoare reală |
| --- | --- |
| Fereastră de timp de perete | 2026-11-12T08:43:38.281Z → 2026-11-12T09:43:38.375Z |
| Durată reală | 3 600 092 ms = **60,00 min** (cerut 60) |
| Cicluri lifecycle | **20** (cerute 20), 20 curate, 19 reload-uri cronometrate |
| Eșantioane | 120, la fiecare 30 s |
| Timp simulat | 3 590,572 s |
| Build | commit de bază `917a7de9` plus modificările PBI 159 din worktree (necomise în timpul rulării) |
| Mașină | AMD Ryzen 7 7735U (Radeon 680M), 16 fire logice, 15 702 026 752 B RAM măsurați, Windows 10.0.26300, Node v24.19.0 |
| Protocol | 24 taxiuri / 40 civili, seed `159001`, pacing `WALL_CLOCK_60HZ`, GC forțat înainte de citire |
| Verdict | **`SOAK_PASS`**, 0 eșecuri |

## Memorie: platou, nu creștere

Heap-ul după reset (aceeași fază a fiecărui ciclu, cu GC forțat) este baseline-ul comparabil;
baseline-ul procesului rece este raportat separat, pentru context.

| Moment | Heap folosit | RSS |
| --- | ---: | ---: |
| Baseline proces rece (înainte de prima lume) | 22,3 MiB | 96,2 MiB |
| Ciclul 1 după reset | 43,7 MiB | 315,0 MiB |
| Ciclul 10 după reset | 45,2 MiB | 320,4 MiB |
| Ciclul 20 după reset | 45,5 MiB | 319,4 MiB |
| Delta ciclul 1 → 20 | **+1,81 MiB** | +4,60 MiB |
| Prag aplicat | 5 MiB sau 10 % din mediană | max(5 MiB, 10 %) = 33,5 MB |

Seria din interiorul ciclurilor oscilează între 47,0 și 95,7 MiB (heap) și 285,6–323,8 MiB (RSS):
este dintele de ferăstrău al unei lumi active, nu o acumulare — la fiecare reset corpurile și
subscripțiile revin la 0 (`cleanupLeaked = false` pentru toate cele 20 de cicluri, `bodies = 0`).

## Tendințe pe fereastra finală (25 % din eșantioane)

| Metrică | Mediană | Interval | Creștere | Prag | Clasificare |
| --- | ---: | ---: | ---: | ---: | --- |
| heapUsedBytes | 47 680 184 B | 47 626 904–47 738 952 B | 112 048 B | 5 242 880 B | `PLATEAU` |
| rssBytes | 335 159 296 B | 334 807 040–338 567 168 B | 3 760 128 B | 33 515 930 B | `PLATEAU` |
| governorBytes | 0 B | 0–0 B | 0 B | 1 048 576 B | `PLATEAU` |
| governorJobs | 0 | 0–0 | 0 | 1 | `PLATEAU` |
| recorderChargedBytes | 18 267 355 B | 18 267 035–18 267 675 B | 640 B | 5 242 880 B | `PLATEAU` |
| retentionDbBytes | 127 872 125 B | 127 871 805–127 872 125 B | 320 B | 134 217 728 B | `PLATEAU` |
| retentionArtifacts | 7 | 7–7 | 0 | 8 | `PLATEAU` |

## Cozi, retenție și lifecycle

- Governor 221: cel mult **1** job și **4 B** în așteptare, **0** joburi la închiderea fiecărui ciclu;
  cel mult 1 job greu simultan.
- Pipeline 222: **2 380** de checkpoint-uri oferite și **2 380** comise, 0 eșecuri, cel mult o
  generație în pregătire sau în commit.
- Recorder 207: vârf de **18 267 675 B (17,4 MiB)** din capacitatea de 32 MiB, **2 400** eșantioane
  reținute din plafonul de 4 096.
- Retenție 132: crește cu 17,4 MiB pe ciclu până la 121,9 MiB (7 artefacte), apoi **13 evacuări**
  (câte un artefact pe ciclu, ciclurile 8–20), rămânând la 121,9 MiB sub cota de 128 MiB.
- Reset 1–2 ms, reload 391–572 ms, 0 scurgeri, 0 corpuri după cleanup, la toate cele 20 de cicluri.
- Volum de lucru: 640 de curse dispecerizate, 120 de intervenții MANUAL, 701 segmente de learning cu
  701 activări, 2 770 de joburi de worker, 64 de vehicule (24 taxiuri + 40 civili) în fiecare ciclu.

## Incidente: raportate și recuperabile

**87 de incidente, 87 recuperate, 0 nerecuperate.**

| Tip | Număr | Recuperare |
| --- | ---: | --- |
| `FLEET_BLOCKED` | 72 | 3–5 taxiuri nemișcate 60 s per ciclu (`NO_PROGRESS_OFF_GRAPH` 52, `NO_PROGRESS_UNEXPLAINED` 20), toate repoziționate pe banda succesoare prin decizia 054 `REQUEST_REROUTE`; blocajul nu se repetă pentru același actor |
| `WORKER_JOB_EXPIRED` | 2 | joburile opționale induse în ciclurile 6 și 14 (14,92 min și 38,91 min) au depășit lease-ul de 30 000 ms, au ieșit `stale`, iar governor-ul a revenit la 0 joburi |
| `RETENTION_OVER_QUOTA` | 13 | contractul 132 a exportat și a evacuat câte 1 artefact (17,4 MiB) pe ciclu, în cotă |

Răspunsul maxim la anularea explicită a unui job aflat în execuție: **84 ms** din bugetul de
**100 ms**.

## Throttling

Status raportat: **`OBSERVED`**.

- Frecvența CPU citită din OS: min/median/max **2 695 / 2 695 / 2 695 MHz**, variație 0.
- Tick p95: min **5,16 ms**, max **8,85 ms**, raport **1,72** (prag 1,25); tick p50 maxim 5,78 ms;
  cel mai lung tick 127,2 ms; deriva maximă 77 ms.
- Nota raportului: absența variației de frecvență nu dovedește absența throttling-ului termic.
  Variația de p95 este dovada unei încărcări reale a mașinii în timpul sesiunii (alte procese pe
  aceeași mașină), nu o dovadă de throttling termic; frecvența raportată de OS nu o confirmă separat.

## Verificările raportului

| Verificare | Observat | Buget | Verdict |
| --- | ---: | ---: | --- |
| `soak.duration` | 60,00 min | 60 | `PASS` |
| `soak.cycles` | 20 | 20 | `PASS` |
| `soak.cleanup` | 20 | 20 | `PASS` |
| `soak.incidents` | 87 | 87 | `PASS` |
| `memory.tracked` | 112 048 B | 5 242 880 B | `PASS` |
| `memory.totalHeapBytes` | — | null în manifest | `NOT_MEASURED` |
| `retention.recorderRamBytes` | 18 267 355 B | 33 554 432 B | `PASS` |
| `retention.optionalReplayStorageBytes` | 127 872 181 B | 134 217 728 B | `PASS` |
| `retention.diagnosticSamples` | 2 400 | 4 096 | `PASS` |
| `workers.pendingWorkerPayloadBytes` | 4 B | 16 777 216 B | `PASS` |
| `workers.heavyBackgroundJobs` | 1 | 1 | `PASS` |
| `workers.cancellationResponse` | 84 ms | 100 ms | `PASS` |
| `storage.preparingCheckpoints` | 0 | 1 | `PASS` |
| `storage.committingCheckpoints` | 0 | 1 | `PASS` |
| `frame.renderFps` | — | 30 | `NOT_MEASURED` |
| `frame.gpuP95Ms` | — | 28 | `NOT_MEASURED` |

Cele trei `NOT_MEASURED` au motiv scris în raport: proba este headless, fără renderer (deci fără FPS
și fără timer GPU, care nu se raportează ca 0), iar memoria exactă a paginii nu are API portabil, iar
manifestul lasă `totalHeapBytes` null.

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run perf:soak -- --measure --commit=917a7de9` | rulare reală de 60,00 min, 20 cicluri, 120 eșantioane, măsurătoare scrisă |
| `npm run perf:soak -- --check` | exit 0; `VERDICT SOAK_PASS`; `Soak report is current: Docs/Evidence/159-soak/report.json`; `Soak markdown is current: Docs/Evidence/159-soak/report.md` |
| `node --import ./scripts/register-typescript.mjs --test "tests/harness/soak-report.test.ts"` | 14 teste, 14 pass, 0 fail |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0, 0 warnings (`--max-warnings 0`) |
| `npm run format:check` | exit 0 |
| `npm run check:architecture` | exit 0; `Architecture imports: PASS (365 TypeScript files)`, 6 + 4 + 3 probe negative respinse, renderer/readonly/lifecycle `PASS` |
| `npm run check:parameter-catalog` | exit 0; `Parameter catalog is synchronized.` |
| `npm test` | 2 874 teste, 2 874 pass, 0 fail, 0 skipped, 95 343 ms |

## Fișiere atinse

- Adăugate: `tests/harness/soak-session.ts`, `tests/harness/soak-report.ts`,
  `tests/harness/soak-report.test.ts`, `scripts/run-soak-report.mjs`,
  `Docs/Evidence/159-soak/` (acest README, `measurement.json`, `report.json`, `report.md`,
  `soak-run.txt`, `.gitattributes`).
- Modificate: `package.json` (scriptul `perf:soak`, ultima intrare din `scripts`),
  `Docs/25-performanta-contracte-si-benchmark.md` (secțiune nouă la final).
- Nemodificate intenționat: `Docs/performance-budgets.json` și tot `src/`.

## Limitări

- Proba este headless: FPS-ul de render, lucrul GPU și memoria exactă a paginii rămân
  `NOT_MEASURED`, cu motiv. Nu înlocuiesc un gate hardware de joc complet.
- Camera, panourile și asseturile finale nu fac parte din această probă; soak-ul integrat cerut de
  224/235 rămâne de executat. Ciclurile de aici reconstruiesc lumea fizică și epoch-ul, fără renderer
  și fără UI real.
- Transportul worker-ului este un loopback în proces peste `WorkerRuntime` real, nu un `Worker` de
  browser; felia de 2 ms și cedarea event loop-ului sunt reale, dar prioritatea OS nu este simulată.
- Store-ul de commit al pipeline-ului 222 este un dublu de test cu graniță asincronă reală
  (`setTimeout`), nu IndexedDB durabil. Recorder-ul nu a sigilat chunk-uri de incident: retenția
  durabilă este fereastra deținută a recorder-ului, predată ledger-ului 132 la reset (mapping
  declarat).
- Intervenția este la nivel de comandă (`PLAYER` timp de 300 tick-uri) plus segmente 112; stiva
  005/066/067 de UI și moduri nu este exercitată aici. Recuperarea blocajelor aplică plasarea la
  portul 030 al fixture-ului, pentru că 054 doar cere rerutarea.
- Istoricul rulărilor: prima sesiune completă (începută la 07:40Z, ora locală 09:40) a rulat
  **59,901 min** și a ieșit `DIAGNOSTIC`, sub minimul de 60 de minute. Defectul de cadență (somnul de
  50 ms din bucla de pacing permitea ~120 tick-uri/s) și rezerva de reset scăzută și la ultimul ciclu
  au fost corectate, iar artefactele acelei rulări au fost suprascrise de o rulare diagnostic de
  1,5 min (08:41Z). Dovada comisă provine dintr-o **sesiune nouă, de la zero** (08:43:38Z →
  09:43:38Z, ora locală 10:43–11:43), nu dintr-o reluare a sesiunii anterioare; politica de validare
  nu permite reluarea unui soak întrerupt.
- Variația de p95 a tick-ului (5,16–8,85 ms) include încărcarea altor procese de pe mașină în timpul
  sesiunii; throttling-ul este raportat `OBSERVED` pe această variație, cu nota că frecvența din OS a
  rămas constantă.
