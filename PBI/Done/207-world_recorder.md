---
id: "207"
title: "Recorder pentru replay taxiuri civile și incidente AUTO"
status: "Done"
release: "V1"
module: "Experimente"
depends_on: ["014","065","028","007","206","221"]
performance_checks: ["memory", "storage", "frame"]
owner: "loop-pbi/recorder-207-01 (opencode/deepseek-v4.1-flash-free)"
started_at: "2026-10-22T21:21:14+03:00"
completed_at: "2026-11-11T05:04:22+02:00"
---

# 207 Recorder pentru replay taxiuri civile și incidente AUTO

## Obiectiv

Înregistrează întreaga lume într-un buffer limitat, cu chunkuri fixate în jurul incidentelor.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

- [14-experimente-si-indicatori.md](../../Docs/14-experimente-si-indicatori.md)
- [09-telemetrie-si-oportunitati.md](../../Docs/09-telemetrie-si-oportunitati.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 014 trebuie să existe în Done înainte de începere.
- PBI 065 trebuie să existe în Done înainte de începere.
- PBI 028 trebuie să existe în Done înainte de începere.
- PBI 007 trebuie să existe în Done înainte de începere.
- PBI 206 trebuie să existe în Done înainte de începere.
- PBI 221 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Entitățile nevizibile, AUTO, fazele și crearea/eliminarea au date suficiente pentru replay.
- [x] Evenimentele păstrează tick exact; interpolarea și ferestrele parțiale sunt declarate.
- [x] Bufferul circular și salvarea chunkurilor au limite de resurse și nu devin demonstrații LEARNING.

- [x] RAM, bytes/sec și rata de chunkuri sunt plafonate; presiunea nu oprește simularea vehiculelor nevizibile sau colectarea evenimentelor exacte.

## Verificare

Înregistrează un incident numai AUTO în afara camerei; verifică retenție, crash și chunk parțial.

Păstrează comenzile, scenariile și rezultatele reale; nu declara trecere fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/replay/world-recorder.ts` (contract `207-world-recorder-v1` + `207-world-replay-chunk-v1`) înregistrează lumea reală la fiecare tick autoritativ: toate taxiurile și civilele, inclusiv cele în `AUTO` și cele din afara camerei (indicatorul de cameră este înregistrat, niciodată folosit ca filtru), cu mod de control, stare FSM, cursă, faze de semafoare și fapte exacte de creare/eliminare. Transformările sunt decimate la 20 Hz pe tickuri de 60 Hz, iar chunkul declară cadența, alinierea, interpolarea (`LINEAR` pentru poziție, `NLERP` pentru rotație), `physicsFidelity: false` și `eventTicksExact: true`; evenimentele 007 păstrează tick-ul publicării, chiar dacă nu cade pe cadență. Inelul are 120 s × 20 Hz, capacitatea RAM implicită 24 MiB (sub bugetul `recorderRamBytes` de 32 MiB), rezervă de 8 MiB pentru chunkuri fixate și 1 MiB pentru evenimente scăzute din ea, rată de scriere 512 KiB pe secundă simulată, chunk de maximum 4 MiB, 8 chunkuri fixate și 6 incidente pe minută; fiecare refuz este contorizat și recorder-ul nu aruncă și nu blochează simularea. Fereastra de incident este de 15 s înainte și după, chunkul se ancorează pe snapshotul complet 206 (`checkpoint` + `anchor`, integritate `SDA-CJSON-1` + `SHA-256` peste payload-ul fără `checksum`/`bytes`) și orice fereastră incompletă este `PARTIAL`, cu vocabular închis de motive și intervalele exacte lipsă. Recorder-ul nu creează joburi, observații sau versiuni de profil, nu importă modulul de learning și refuză cu `LEARNING_ARTIFACT` un chunk care ar declara altceva.

Verificări executate și rezultat: în worktree-ul `.worktrees/recorder-207-01`, branch `loop-pbi/recorder-207-01`:

- `npm run typecheck` — PASS, fără erori în ambele configurații tsconfig.
- `npm run lint` — PASS, `eslint . --max-warnings 0`, fără avertismente.
- `npm run format:check` — PASS, `All matched files use Prettier code style!`.
- `npm run check:architecture` — PASS, `Architecture imports: PASS (307 TypeScript files)` plus cele patru seturi de probe negative.
- `npm run check:parameter-catalog` — PASS, `Parameter catalog is synchronized.`.
- `npm test` — PASS, `tests 2125`, `pass 2125`, `fail 0`, `cancelled 0`, `skipped 0`, `duration_ms 67870.9597`.
- `node --import ./scripts/register-typescript.mjs --test tests/replay/world-recorder.test.ts` — PASS, `tests 22`, `pass 22`, `fail 0`, `duration_ms 2649.3793`.
- `npm run world:recorder` — PASS, `SUMMARY checks 104/104, overall PASS`.
- `npm run world:recorder -- --check` — PASS, raport curent.
- `npm run world:recorder -- --cost --samples 15` — PASS, cost real scris în `Docs/Evidence/207-world-recorder/cost.json` și `cost.md`.

Scenariile cerute, acoperite de transcrierea deterministă: incident numai `AUTO` în afara camerei (`window.autoOnly: true`, `visibility: OUTSIDE_CAMERA`, `classifiedFromTick: 498`, 40 de vehicule decodate la tickul incidentului, inclusiv `taxi-02`); retenție de 468 eșantioane / 18 720 rânduri de vehicul în 1 894 464 bytes din plafonul de 15 728 640; crash care pierde doar bufferul RAM (`chunksBefore: 0`, `chunksAfterNewRecorder: 0`, `samplesAfterNewRecorder: 0`, `oldIncidentSealAfterRestart: UNKNOWN_INCIDENT`) și o sesiune nouă care se ancorează pe un checkpoint 206 nou și produce un chunk `ACCEPTED`; chunk parțial la închidere devreme (`CAPTURE_FINALIZED_EARLY`), la captură târzie (`CAPTURE_STARTED_LATE`) și la tăiere pe bytes (`CHUNK_BYTE_CAP`, 19 135 din 20 000 bytes); presiune cu 340/340 tickuri admise, 0 respinse, 74 rânduri aruncate, 50 evenimente înregistrate, 0 pierdute și 49 tickuri exacte păstrate, cu clipul declarat `PRESSURED_ROWS_EVICTED`.

Cost real (15 eșantioane, 1001 tickuri înregistrate cu 40 de vehicule, un `COLLISION` la tick 590, sigilare explicită la tick 1000, `performance.now`): înregistrare 36.009/40.915/65.237 ms (min/median/max, adică 0.041 ms per tick median), sigilarea unui chunk de 606 KB 50.134/65.385/85.4 ms, verificarea chunkului 28.378/38.298/66.197 ms. Costul pe tick este sub 1% din bugetul de tick autoritativ de 5.5 ms; sigilarea este operația scumpă, plătită o dată per incident, la cererea apelantului.

Fișiere și documente actualizate: `src/replay/world-recorder.ts` (nou), `src/replay/index.ts` (nou), `tests/replay/world-recorder-fixtures.ts` (nou), `tests/replay/world-recorder.test.ts` (nou), `tests/replay/world-recorder-report.ts` (nou), `scripts/run-world-recorder-report.mjs` (nou), `package.json` (scriptul `world:recorder`, ultima intrare din `scripts`), `Docs/09-telemetrie-si-oportunitati.md` (secțiunea contractului 207), `Docs/14-experimente-si-indicatori.md` (câmpurile reale ale chunkului), `Docs/Evidence/207-world-recorder/` (`README.md`, `report.json`, `report.md`, `cost.json`, `cost.md`).

Limitări sau follow-up: sigilarea este sincronă (50–85 ms pentru un chunk de 606 KB la 40 de vehicule), deci mutarea pe un worker rămâne ownership-ul 221/222; recorder-ul nu are încă un consumator în bucla de joc (integrarea cu fixed-tick, camera reală și bus-ul 007 rămâne la nivel de aplicație), iar verificarea este nativă, fără browser; nu există persistență durabilă a chunkurilor — `takeChunk` le predă, iar storage-ul (128 MiB) aparține modulelor de persistență/worker, deci un crash pierde bufferul RAM (comportament intenționat și testat); bugetele de RAM și rată sunt cele provizorii din `Docs/performance-budgets.json`, iar costul măsurat este al acestei mașini, nu al unei ținte de hardware și nu certifică performanța jocului integrat; contorizarea de memorie este un contor de proprietate (bytes facturați per rând), nu o citire a heap-ului.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '207'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-11-11: Implementare finalizată și verificată în `.worktrees/recorder-207-01`; 22 de teste țintă, raport determinist 104/104, cost local separat; fișier mutat în Done.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
