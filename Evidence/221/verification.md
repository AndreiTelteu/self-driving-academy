# Verificare PBI221

Scope: coordonator comun pentru joburi grele learning/encode/hash/comparison, cu transport și runtime serial, preempție cooperativă, admitere bounded și persistență protejată injectată. Nu implementează algoritmul learning, ledgerul XP, Rapier în worker sau IndexedDB.

## Protocol și resurse

`221-synthetic-1` păstrează 8 joburi/16 MiB de snapshoturi pending/active, separat 8 operații/16 MiB de ingress async, un singur job greu pe transport de maximum 8 MiB, un singur world token sintetic și 64 măsurători. Fixture store are 8 înregistrări/16 MiB inclusiv evidence și rezultate. Un store production trebuie să admită atomic/idempotent identitatea și capacitatea proprie finită și să ofere durabilitate crash-safe. Rezultatele și dovezile protejate rămân până la acknowledge după publicarea idempotentă.

16 MiB nu este RAM totală: ingressul, copia transportului, memoria algoritmului/WASM, store-ul, bufferele callerului și clonele temporare au ownership separat. Valorile process.memoryUsage RSS/heap/external sunt observații suprapuse, fără sumare. Transferul consumă numai copia tentativei; sursa live rămâne atașată. Datele protejate la capacitate insuficientă determină SESSION_SUSPENDED, păstrând ownershipul callerului. Governorul nu reduce și nu calculează credite XP.

## Comenzi executate

```powershell
node --import ./scripts/register-typescript.mjs --test tests/workers/*.test.ts
npm run typecheck
npx eslint src/workers tests/workers tests/harness/governor-*.ts tests/browser/worker-governor scripts/benchmark-worker-governor.mjs scripts/worker-governor-server.mjs scripts/verify-worker-governor-evidence.mjs --max-warnings 0
./scripts/Run-WorkerGovernorProbe.ps1
node --import ./scripts/register-typescript.mjs scripts/benchmark-worker-governor.mjs Evidence/221/cpu.json
node scripts/verify-worker-governor-evidence.mjs
```

20 teste workers PASS, incluzând 11 teste governor și 9 teste protocol existent. Typecheck, lint și formatarea fișierelor scope-ului PASS. Loguri: tests.txt, typecheck.txt, lint.txt și format.txt. Cazurile acoperă preempția comparison/encode, restart cu jobId nou și dedup logic, rezultat tardiv, recover completed fără execuție duplicată, pressure/idle, lease optional, limita joburi/bytes și ingress independent saturat, mutarea bufferului callerului în timpul retain async, dispose în retain/complete async, anularea în commit async și eroarea store-ului. Threadul real verifică detachmentul copiei și menținerea sursei live.

## Metodă și limite

Baseline-ul original `Docs/Evidence/010-workers/baseline.json` rămâne nemodificat: clone-4096x1000-v1, cinci repetări, mediana 5,5151 ms. CPU221 repetă aceeași probă și raportează separat costul nou al lifecycle-ului worker, cu startup, preempție și anulare; acestea nu sunt percentile de gameplay.

## Rezultate finale măsurate

Export browser 2026-10-05T09:00:36.415Z, CIM 2026-10-05T11:59:45.8527172+03:00 (aproximativ 51 s înaintea exportului). Desktop observat: AMD Ryzen 9 7950X3D, RAM 50.337.325.056 bytes, Windows10 build din raport, Chrome154.0.0.0; inventarul GPU/driver/alimentare este în browser.json și nu identifică un renderer utilizat de această probă CPU/rAF.

| Metrică | Browser, 5 perechi | Node CPU, 5 repetări | Contract provizoriu |
| --- | --- | --- | --- |
| Felie maximă observată în jobul comparison complet | 3,100 ms | 2,0784 ms | ≤10 ms |
| Acknowledgement anulare maxim | 5,300 ms | 6,720 ms | ≤100 ms |
| Learning end-to-end maxim | 3,200 ms | 7,1388 ms | ≤2000 ms |
| rAF p95 baseline / worker | 7,100 / 7,100 ms în toate perechile | Indisponibil | Burst sintetic; fără gate FPS |
| Delta rAF p95 worker-baseline | 0 ms la precizia raportată; reziduuri float ≤3,64e-12 ms | Indisponibil | Fără regresie burst observată |
| Governor jobs/bytes și store după ack | 0 / 0, toate repetările | 0 / 0, toate repetările | Cleanup finit |

Clone baseline curent: 4,1238 / 4,0466 / 6,6493 / 4,3650 / 3,1786 ms; mediana 4,1238 ms față de original 5,5151 ms, aproximativ −25,23%. Nicio regresie a aceleiași probe nu este observată; reducerea nu dovedește o îmbunătățire cauzală a governorului. Costul nou separat al lifecycle-ului complet CPU este 475,727–486,671 ms, incluzând comparison120 felii, learning, restart, cancel și startup40,976–47,533 ms. Nu îl comparăm ca overhead al clonării.

Commitul de bază este `01b595a96d777064e82461e558f2f6473684e4fb`, cu modificări necomise identificate prin hash browser `65c2ea53d7ec002156c7f00f4f66d8ae059c86100267512e28d69da94855bea2` și CPU `f277666ce0ef2cc9d178f8e8d38e1ddcea2b1517819408a70e4822397627b764`. Digestul artefactelor production este `6c33fe0cdb318bab7626b31c3c9ccd5933821ea9add25651b68d67091138904b`. Verifier PASS compară sursele și bytes reali ai artefactelor cu aceste identități. Rapoarte: browser.json, browser-build.json, cpu.json, summary.json și verifier.txt; captură UI `output/playwright/221-final.png`. Consola conține numai cererea favicon.ico neimplementată (HTTP400), fără eroare de execuție worker.

Browserul Chrome headed rulează cinci perechi de ferestre rAF 1 s baseline și 1 s cu un burst worker long/short. Sunt măsurări de eveniment/lifecycle, fără warmup 30 s sau steady-state 120 s; estimările p95/p99 dintr-o secundă sunt grosiere. Focusul și visibility sunt verificate la fiecare frame și la finalul ferestrei. Backendul este Native Worker + rAF, fără renderer/GPU. Rezoluția CSS și DPR sunt observate, fără promisiune de gameplay 1080p. Exportul include commit, hashul surselor și digestul artefactelor production. Snapshotul CIM/alimentare are capturedAt înaintea probei; este proveniență punctuală, fără monitorizare continuă sau pretinderea unui adaptor GPU de randare selectat.

Contractele provizorii sunt felie ≤10 ms, acknowledgement anulare ≤100 ms, progres ≤5 Hz și learning end-to-end ≤2 s. Callbackul taskului trebuie să respecte deadline: JavaScript sincron blocant nu este preemptabil de governor/runtime. Reluarea preemptată reîncepe unitatea jobului, nu continuarea internă a algoritmului. Callerul publică idempotent profil/XP/ledger la tick.

Memoria exactă pagină/GPU, Long Tasks și lumea Rapier nu sunt măsurate. Payloadul de 4 bytes al lifecycle-ului nu calibrează copierea unui savefile maxim. Capacitățile sunt finite și versionate, dar sintetice/provizorii; integrarea și calibrarea learning/A/B/savefile urmează în 103/144/234/224, persistența production în 222/234. GameplayGate rămâne NOT_VALIDATED și laptop NOT_MEASURED; derogarea 203 nu elimină gate-urile ulterioare.

PBI221 mutat fizic în `PBI/Done/221-worker_resource_governor.md`, absent din To Do/In Progress. `PBI/Validate-Board.ps1 -RequireDone '221'` PASS (Valid:true), log board.txt. Commit/push sunt realizate de ownerul root după integrare.
