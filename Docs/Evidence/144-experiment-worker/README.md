# 144 — loturi de experimente în worker: progres și anulare

Dovezi pentru PBI 144 (modulul Experimente și indicatori, release V1). Contractul implementat este
`144-experiment-worker-v1` ([src/experiments/experiment-worker.ts](../../../src/experiments/experiment-worker.ts)),
cu adaptorul de admitere `144` spre coordonatorul 221
([src/experiments/experiment-worker-governor.ts](../../../src/experiments/experiment-worker-governor.ts)).
Descrierea contractului este în [Docs/14](../../14-experimente-si-indicatori.md) (secțiunea
„Loturi de experimente în worker, progres și anulare 144”), iar bugetele sunt cele fixate de
[Docs/25](../../25-performanta-contracte-si-benchmark.md) / `Docs/performance-budgets.json`
(`203-initial-1`, contract de worker `221-synthetic-1`).

## Ce s-a implementat

Un motor de execuție pentru loturi de experimente: un lot este o listă de **celule de rulare** (un
seed de scenariu pe felie), iar contractul deține admiterea prin 221, feliile, progresul incremental,
anularea cooperativă, întreruperea de learning și etichetarea modelului. Matematica experimentului
rămâne a contractelor livrate: fiecare felie este un `142-experiment-rerun-v1` real, executat de
compoziția de dovezi, iar rândul raportat este copiat din numerele returnate de 142.

- `src/experiments/experiment-worker.ts` (nou) — cititorul de bugete din manifest cu lacune
  raportate, registrul de lume unică, eticheta de model (`FULL`/`SIMPLIFIED`), `ExperimentBatchRunner`
  (felii secvențiale, progres, anulare, pauză/reluare de learning, refuzuri contorizate) și
  `experimentReportLabel`.
- `src/experiments/experiment-worker-governor.ts` (nou) — adaptorul 221: un job `optional` de operație
  `comparison` per felie, codificare strictă a descriptorului și a rezultatului, maparea exactă a
  rezultatului coordonatorului (`CAPACITY_INSUFFICIENT`, `SESSION_SUSPENDED`, `STALE`, `cancelled`,
  `error`) și raportarea preempțiunii măsurate (`preempted`, `cancellationMs`).
- `src/experiments/index.ts` — două `export *` adăugate la finalul listei.
- `tests/experiments/experiment-worker-harness.ts` (nou) — compoziția deterministă: stiva 221 reală
  (`WorkerResourceGovernor` + `WorkerClient` + `WorkerRuntime`) peste un transport în proces care
  livrează pe macrotask, ca `postMessage`; task-uri care rulează 142 real (o celulă per felie), o
  variantă cooperativă pentru proba de preempțiune, o sondă de capacitate a coordonatorului și un port
  determinist pentru testele de comportament.
- `tests/experiments/experiment-worker.test.ts` (nou) — 22 de teste țintă.
- `tests/experiments/experiment-worker-report.ts` (nou) — transcrierea deterministă (73 de verificări,
  10 scenarii) și proba de cost cu ceas de perete.
- `scripts/run-experiment-worker-report.mjs` (nou) — CLI `--check`, `--output`, `--cost`, `--samples`.
- `package.json` — `experiment:worker`, adăugat ca ultima intrare din `"scripts"`.
- `Docs/14-experimente-si-indicatori.md` — secțiunea contractului, la finalul fișierului.
- `Docs/Evidence/144-experiment-worker/README.md`, `report.json`, `report.md`, `cost.json`, `cost.md`.

## Cum funcționează

**Bugetele se citesc din manifest, iar lacunele se raportează.** `readExperimentWorkerBudgets` cere
numerele din `resourceAdmissionContracts.workers` și le compară cu `workerSchedulingProposal`
(`residentExperimentWorlds`, `sliceMaximumMs`, `cancellationResponseMaximumMs`) plus frecvența de
progres (`progressIntervalMinimumMs` 200 → `progressHzMaximum` 5). Rezultatul pe manifestul real:
`READY`, `version` `221-synthetic-1`, `residentWorlds` 1, `activeHeavyJobs` 1, `executionJobs` 8,
`sliceMaximumMs` 10, `progressIntervalMinimumMs` 200, `progressHzMaximum` 5,
`cancellationTargetMaximumMs` 100, `ownedPendingPayloadBytes` 16 777 216. Patru valori rămân
necalibrate și sunt raportate ca lacune, nu inventate: `workerSchedulingProposal.queueCountAndAge`,
`proposedCapacities.totalHeapBytes`, `proposedCapacities.wasmBytes`,
`capacityValidation.additionalSuballocations`. Un manifest fără contractul de worker este refuzat cu
`BUDGET_MISSING` și calea lipsă; un manifest care ar admite două lumi sau două joburi grele este
refuzat cu `BUDGET_INVALID`.

**Admiterea trece prin 221, iar refuzul este explicit și contorizat.** Fiecare felie este un singur
job trimis lui `WorkerResourceGovernor` (operație `comparison`, prioritate `optional`). Nu există o
coadă paralelă: un refuz al coordonatorului oprește lotul cu `CAPACITY_INSUFFICIENT` (sau
`SESSION_SUSPENDED`/`STALE_ADMISSION`), iar refuzul intră în `refusals.byCode` al lotului și în
`usage.refusals` al runner-ului. Proba din transcriere umple bugetul de payload al coordonatorului cu
două joburi de 8 MiB și obține exact un refuz: 1 submisie, 1 refuz, 0 rânduri. O singură lume de
experiment este activă: `ExperimentWorldRegistry` are capacitatea 1 din manifest, iar al doilea lot
este refuzat cu `WORLD_RESERVED`, numind deținătorul (`batch-a`), fără clonare tacită a lumii.

**Progresul este incremental, după fiecare felie.** Lotul emite un eveniment înainte de prima felie și
apoi după fiecare felie terminată: `0,1,2,3,4,5` pentru cinci felii, cu fracția
`completedSlices / totalSlices`. Fiecare felie este `await`-uită, deci apelantul nu primește nicio
buclă sincronă; un test pornește bucla de UI în paralel și arată că ea rulează cel puțin atâtea
rânduri câte felii are lotul. Progresul nu este raportat mai des decât permite manifestul, pentru că
sursa lui sunt granițele de felie, nu un timer.

**Anularea se oprește la următoarea graniță de felie.** `cancel` marchează lotul și cere portului să
se oprească la următorul pas; lotul se încheie cu `CANCELLED`, `results.complete` rămâne gol, iar
rândurile produse trec în `results.partial`, fiecare cu `label: PARTIAL` și
`partialReason: CANCELLED_BY_REQUEST`. Felia aflată în zbor este aruncată și contorizată
(`discardedSlices`). În scenariul din transcriere: 2 din 5 felii terminate, 2 rânduri păstrate
`PARTIAL`, 1 felie aruncată, 0 rânduri prezentate ca complete. O anulare în timpul pauzei păstrează
rândurile și raportează `CANCELLED_WHILE_PAUSED`.

**Learning-ul poate întrerupe un lot.** `interruptForLearning` trece lotul în `PAUSED` la granița de
felie și înregistrează epoch-ul, segmentul, indexul feliei, dacă întreruperea a prins o felie în zbor
și momentul reluării; `resumeAfterLearning` continuă de la graniță. În transcriere: pauză la felia 1,
reluare la felia 2, toate cele 4 rânduri produse. Independent, 221 preemptează jobul de comparație când
sosește un job de learning interactiv: proba cu task cooperativ arată 1 felie preemptată
(`preempted: true`, `cancellationMs` măsurat de coordonator), 1 pauză, 1 reluare și 2 rânduri finale.

**Modelul simplificat este etichetat, nu deghizat.** `SIMPLIFIED` cere aproximarea și lista a ce nu
este validat; rezultatul raportează structural `physicsFidelity: false` și un text
`SIMPLIFIED: …; not validated for …`. O cerere care declară `physicsFidelity: true` pentru o
aproximare este refuzată cu `SIMPLIFIED_CLAIMS_FIDELITY`, iar `experimentReportLabel` nu poate ridica
fidelitatea la raportare. `FULL` raportează `physicsFidelity: true`; o declarație `FULL` care pretinde
că nu are fidelitate este refuzată cu `MODEL_INCONSISTENT`.

**Bugetul fiecărei felii este verificat, iar depășirea este raportată.** Portul primește
`sliceBudgetMs` din manifest (10 ms) și returnează cel mai lung pas sincron; lotul marchează
`overBudget` și păstrează valoarea reală în `slices[].stepMs`. Proba deterministă arată ambele cazuri:
4 ms → 0 depășiri, 12 ms → 3 depășiri din 3 felii.

## Comenzi executate și rezultat real

Toate comenzile au rulat în worktree-ul `.worktrees/exp-worker-144-01`, pe branch-ul
`loop-pbi/exp-worker-144-01`, cu Node 24.19.0.

| Comandă | Rezultat real |
| --- | --- |
| `npm run typecheck` | PASS (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`), fără erori |
| `npm run lint` | PASS (`eslint . --max-warnings 0`), fără erori și fără warnings |
| `npm run format:check` | PASS, „All matched files use Prettier code style!” |
| `npm run check:architecture` | PASS — „Architecture imports: PASS (355 TypeScript files)”, plus cele 6 + 4 + 3 sonde negative |
| `npm run check:parameter-catalog` | PASS, „Parameter catalog is synchronized.” |
| `npm test` | PASS — `tests 2607`, `pass 2607`, `fail 0`, `cancelled 0`, `skipped 0`, `duration_ms 69048.1396` |
| `node --import ./scripts/register-typescript.mjs --test tests/experiments/experiment-worker.test.ts` | PASS — `tests 22`, `pass 22`, `fail 0`, `duration_ms 1383.4038` |
| `npm run experiment:worker` | PASS — `SUMMARY checks 73/73, scenarios 10, … overall PASS`; a scris `report.json` și `report.md` |
| `npm run experiment:worker -- --check` | PASS — „Experiment worker report is current: …\Docs\Evidence\144-experiment-worker\report.json” (fișierul este byte-identic la două rulări) |
| `npm run experiment:worker -- --cost --samples 5` | PASS — `COST slices 15, slice ms 24.449/25.458/29.699, over budget 15, batch ms 77.46/77.685/88.158` |

Cele 22 de teste țintă acoperă: bugetele citite din manifestul real plus cele patru lacune, refuzul
`BUDGET_MISSING` pe un manifest fără contractul de worker, refuzul `BUDGET_INVALID` pentru două lumi
sau două joburi grele, un lot complet cu progres după fiecare felie, păstrarea rândului de către
apelant, anularea la graniță cu rezultate `PARTIAL`, anularea în pauză, pauza/reluarea de learning,
eroarea de worker, refuzul și suspendarea 221, a doua lume refuzată, id-ul de lot duplicat, modelul
simplificat etichetat, pretenția de fidelitate refuzată, modelul `FULL` raportat ca fizică completă,
bugetul de felie (4 ms vs 12 ms), refuzul real de capacitate al coordonatorului 221, lotul real de
celule 142, anularea lotului real și preempțiunea reală de learning prin 221.

## Numerele suitei de referință

| Măsură | Valoare |
| --- | --- |
| scenarii în transcriere | 10 |
| verificări | 73/73 PASS |
| lot complet (5 felii) | 5 rânduri `COMPLETE`, 120 de decizii, progres `0,1,2,3,4,5` |
| anulare la graniță (5 felii) | 2 felii terminate, 2 rânduri `PARTIAL`, 1 felie aruncată, motiv `CANCELLED_BY_REQUEST` |
| learning (4 felii) | pauză la felia 1, reluare la felia 2, 4 rânduri `COMPLETE` |
| lume unică | 1 concesiune, 1 refuz `WORLD_RESERVED` (deținător `batch-a`) |
| buget de felie | 4 ms → 0 depășiri; 12 ms → 3/3 depășiri, alocare 10 ms din manifest |
| lot real prin 221 (3 seed-uri) | 3 rânduri, 72 de decizii, 31 diferențe (27 de prag, 4 de geometrie), 41 identice |
| parametri numiți de 142 | `red_stop_probability`, `stop_dwell_time`, `stop_full_probability` |
| refuz 221 (payload plin) | 1 submisie, 1 refuz, 0 rânduri, cod `CAPACITY_INSUFFICIENT` |
| eroare de worker (seed 142902) | 1 felie terminată, 1 rând `PARTIAL`, cod `SLICE_FAILED` |
| preempțiune de learning | 1 felie preemptată de 221, 1 pauză, 1 reluare, 2 rânduri finale |
| model simplificat | `physicsFidelity: false`, disclaimer cu „not validated”; pretenția de fidelitate → `SIMPLIFIED_CLAIMS_FIDELITY` |
| lacune de manifest raportate | 4 |

## Cost real (singura măsurătoare cu ceas de perete)

[cost.json](cost.json) și [cost.md](cost.md): 5 loturi × 3 felii = 15 celule reale 142, rulare locală
(`2026-11-11T21:37:40Z`), Node 24.19.0, `win32 x64`.

| Măsură | Min (ms) | Median (ms) | Max (ms) |
| --- | --- | --- | --- |
| o celulă de rulare (o felie) | 24.449 | 25.458 | 29.699 |
| un lot întreg (3 felii) | 77.46 | 77.685 | 88.158 |

Toate cele 15 felii depășesc bugetul de 10 ms al manifestului (`overBudgetSlices: 15`), pentru că 142
nu expune încă o evaluare incrementală: o celulă de rulare este atomică, iar costul dominant este
restaurarea snapshotului 140. Lotul nu ascunde depășirea — o raportează per felie — și nu pretinde
FPS: proba este despre worker, nu despre frame.

## Fișiere atinse

- `src/experiments/experiment-worker.ts` (nou)
- `src/experiments/experiment-worker-governor.ts` (nou)
- `src/experiments/index.ts` (două exporturi la final)
- `tests/experiments/experiment-worker-harness.ts` (nou)
- `tests/experiments/experiment-worker.test.ts` (nou)
- `tests/experiments/experiment-worker-report.ts` (nou)
- `scripts/run-experiment-worker-report.mjs` (nou)
- `package.json` — `experiment:worker`, ultima intrare din `"scripts"`
- `Docs/14-experimente-si-indicatori.md` — secțiunea contractului, la final
- `Docs/Evidence/144-experiment-worker/README.md`, `report.json`, `report.md`, `cost.json`, `cost.md`
- `PBI/In Progress/144-experiment_worker.md` → `PBI/Done/144-experiment_worker.md` (mutare fizică)

## Limitări

- Nivelul de validare este `targeted` (politica 2026-10-08): corectitudine izolată în Node, fără
  browser real, fără GPU și fără hardware țintă. Nu este un gate `full` și nu certifică performanța
  jocului integrat.
- O felie este o celulă de rulare 142 atomică de ~25 ms, peste bugetul de 10 ms al manifestului.
  Depășirea este raportată per felie, nu ascunsă; felii sub 10 ms cer ca 142 să expună o evaluare
  incrementală (urmează în modulele care dețin rerularea, nu în 144).
- Stiva 221 din dovezi rulează în același proces, peste un transport care livrează pe macrotask, nu
  peste un `Worker` de sistem. Protocolul, admiterea, prioritățile și preempțiunea sunt cele reale;
  izolarea de thread și timpul de `postMessage` nu sunt măsurate aici.
- Proba de cost este o singură mașină, 5 loturi, fără p95 și fără certificare de hardware. Memoria este
  raportată ca proprietate (bytes de payload, contoare de joburi), nu ca heap: `totalHeapBytes` și
  `wasmBytes` rămân `null` în manifest și sunt listate ca lacune.
- Nu se pretinde FPS: dovada de „UI operabil” este structurală (mesaje, `await` între felii, transport
  asincron) și un test care arată că bucla apelantului rulează între felii; nu există măsurătoare de
  frame pentru un lot de experimente.
- Modelul `SIMPLIFIED` este o etichetă de contract: 144 nu validează fizica aproximată și nu o poate
  promova la `FULL`. Validarea propriu-zisă rămâne a modulelor care dețin fizica și comparația.
