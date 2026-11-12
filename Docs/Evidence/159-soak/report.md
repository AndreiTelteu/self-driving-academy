# PBI 159 — soak de memorie și stabilitatea flotei

Raport determinist derivat din măsurătoarea comisă (159-soak-report-v1); bugetele sunt citite din manifestul `203-initial-1` și **nu** sunt modificate.

- Build: `917a7de9`
- Verdict: `SOAK_PASS`
- Durată reală: **60.002 min** (cerut 60); 3590.572 s simulați
- Cicluri lifecycle: **20** (cerute 20), 20 curate, 19 reload-uri
- Mașină: AMD Ryzen 7 7735U with Radeon Graphics, 16 fire logice, v24.19.0

## Memorie

Baseline-ul comparabil este primul ciclu după reset (aceeași fază, GC forțat); baseline-ul procesului rece este raportat separat, pentru context.

| Moment | Heap folosit | RSS |
| --- | ---: | ---: |
| Baseline (primul ciclu după reset) | 43.7 MiB | 315.0 MiB |
| Final (ultimul ciclu după reset) | 45.5 MiB | 319.4 MiB |
| Delta | 1.8 MiB | 4.4 MiB |
| Baseline proces rece | 22.3 MiB | 96.2 MiB |

## Tendințe (fereastra finală)

| Metrică | Mediană | Interval | Creștere | Prag | Clasificare |
| --- | ---: | ---: | ---: | ---: | --- |
| heapUsedBytes | 47680184 B | 112048 B | 112048 B | 5242880 B | `PLATEAU` |
| rssBytes | 335159296 B | 3760128 B | 3760128 B | 33515930 B | `PLATEAU` |
| governorBytes | 0 B | 0 B | 0 B | 1048576 B | `PLATEAU` |
| governorJobs | 0 | 0 | 0 | 1 | `PLATEAU` |
| recorderChargedBytes | 18267355 B | 640 B | 640 B | 5242880 B | `PLATEAU` |
| retentionDbBytes | 127872125 B | 320 B | 320 B | 134217728 B | `PLATEAU` |
| retentionArtifacts | 7 | 0 | 0 | 8 | `PLATEAU` |

## Verificări

| Verificare | Observat | Buget | Verdict | Notă |
| --- | ---: | ---: | --- | --- |
| soak.duration | 60 | 60 | `PASS` | măsurată cu ceasul procesului, nu simulată |
| soak.cycles | 20 | 20 | `PASS` | minimul de 20 cicluri |
| soak.cleanup | 20 | 20 | `PASS` | din 20; corpurile revin la 0 după fiecare reset |
| soak.incidents | 87 | 87 | `PASS` | 87 incidente, 0 nerecuperate |
| memory.tracked | 112048 | 5242880 | `PASS` | heap JS măsurat după GC forțat; RSS este raportat separat, mai zgomotos |
| memory.totalHeapBytes | — | — | `NOT_MEASURED` | manifestul o lasă null; API-ul exact nu este portabil, se raportează heap/RSS și contoarele de ownership |
| retention.recorderRamBytes | 18267355 | 33554432 | `PASS` | chargedBytes/peakChargedBytes raportate de contractul 207 |
| retention.optionalReplayStorageBytes | 127872181 | 134217728 | `PASS` | ledger-ul 132 evacuează după export când cota este depășită |
| retention.diagnosticSamples | 2400 | 4096 | `PASS` | fereastra RAM a recorder-ului rămâne mărginită |
| workers.pendingWorkerPayloadBytes | 4 | 16777216 | `PASS` | coada de payloaduri a worker-ului |
| workers.heavyBackgroundJobs | 1 | 1 | `PASS` | cel mult un job greu simultan, conform 221 |
| workers.cancellationResponse | 84 | 100 | `PASS` | răspunsul la anularea explicită a unui job opțional aflat în execuție |
| storage.preparingCheckpoints | 0 | 1 | `PASS` | pipeline-ul 222 ține cel mult o generație în pregătire |
| storage.committingCheckpoints | 0 | 1 | `PASS` | pipeline-ul 222 ține cel mult o generație în commit |
| frame.renderFps | — | 30 | `NOT_MEASURED` | proba este headless, fără renderer; FPS-ul nu este măsurabil aici și nu se raportează ca 0 |
| frame.gpuP95Ms | — | 28 | `NOT_MEASURED` | fără renderer nu există timer GPU; valoarea rămâne null |

## Incidente

87 incidente, 87 recuperate, 0 nerecuperate.
- `FLEET_BLOCKED`: 72
- `WORKER_JOB_EXPIRED`: 2
- `RETENTION_OVER_QUOTA`: 13

## Throttling

Status: `OBSERVED`. Frecvență CPU min/median/max: 2695 / 2695 / 2695 MHz; variație 0. Tick p95 min/max: 5.158199999947101 / 8.850399999999354 ms (raport 1.7158); derivă maximă 77 ms.

> throttling-ul este raportat cu variația frecvenței citite din OS și cu variația p95 a tick-ului; absența unei variații nu dovedește absența throttling-ului termic

