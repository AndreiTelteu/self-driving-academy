---
id: "222"
title: "Pipeline plafonat pentru recorder checkpoint și autosave"
status: "Done"
release: "V1"
module: "Persistență"
depends_on: ["090","206","207","221","218"]
performance_checks: ["storage", "memory", "frame"]
owner: "loop-pbi/pipeline-222-01"
started_at: "2026-11-11T11:28:23.524+02:00"
completed_at: "2026-11-11T11:59:36.757+02:00"
---

# 222 Pipeline plafonat pentru recorder checkpoint și autosave

## Obiectiv

Integrează chunkuri, captură coerentă măsurată, encode/commit etapizat și backpressure fără blocări periodice ale condusului.

## Context și plan

- [Contracte de performanță și benchmark](../../Docs/25-performanta-contracte-si-benchmark.md)
- [WebGPU și performanță](../../Docs/17-webgpu-si-performanta.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 090 trebuie să existe în Done înainte de începere.
- PBI 206 trebuie să existe în Done înainte de începere.
- PBI 207 trebuie să existe în Done înainte de începere.
- PBI 221 trebuie să existe în Done înainte de începere.
- PBI 218 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Captura sincronă a fizicii/stării la un tick și costul de encode/copie/transfer/commit sunt măsurate separat în buget.
- [x] Există cel mult o generație în pregătire și una în commit; coalescingul nu pierde evenimente comerciale, rewards sau invalidări de learning.
- [x] Buffer-ele și retenția au limite în bytes; replay-ul opțional poate deveni parțial, iar datele protejate și tick-urile oportunităților rămân intacte.

## Verificare

Condu cu recorder/autosave simultan, intervenție lungă, 30/40 vehicule, stocare lentă, quota plină și crash între generații; măsoară sacadarea, memorie și vârsta commitului.

Păstrează comenzile, configurația, rapoartele și limitările reale. Nu declara verificări fără execuție.

## Dovezi de finalizare

Rezultat implementare: `222-bounded-pipeline-v1` implementat în `src/persistence/bounded-pipeline.ts` și `src/persistence/bounded-pipeline-store.ts`. Pipeline-ul măsoară separat cele cinci etape (`capture`, `encode`, `copy`, `transfer`, `commit`) cu ceas injectat, ține cel mult o generație în pregătire și una în commit (`IDLE`/`PREPARING`/`COMMITTING`/`DISPOSED`), coalescează tick-urile într-un singur slot `pending` și păstrează evenimentele comerciale, recompensele, invalidările de learning și tick-urile oportunităților într-un registru protejat plafonat în bytes, eliberat numai după un commit durabil. Bufferele au limite reale din `Docs/performance-budgets.json` (transfer 16 MiB, replay 128 MiB, o generație 1 MiB, registru 256 KiB); replay-ul evacuează determinist și se declară parțial, iar adaptorul durabil scrie faptele protejate înaintea checkpointului și expune `recoverBoundedPipeline` pentru crash-ul între generații.

Verificări executate și rezultat: `npm run typecheck` PASS; `npm run lint` PASS; `npm run format:check` PASS; `npm run check:architecture` PASS (325 fișiere TypeScript, plus probele negative); `npm run check:parameter-catalog` PASS; `npm test` PASS — 2299 teste, 2299 trecute, 0 eșecuri, `duration_ms 78485.5386`; testele țintă `tests/persistence/bounded-pipeline.test.ts` PASS — 22/22, `duration_ms 810.1684`; `npm run pipeline:bounded` PASS — `SUMMARY checks 67/67, overall PASS`; `--check` PASS; `--cost --samples 20` a scris `cost.json`/`cost.md`. Scenarii reale din `report.json`: autosave cu recorder pe 900 tick-uri → 15 generații comise, 966 677 bytes, 60 fapte, 1 chunk, vârsta commitului 0; intervenție lungă 1 800 tick-uri → 1 890 fapte comise, 0 pierdute, vârf registru 116 872/262 144 bytes, replay `PARTIAL` cu 2 evacuări; stocare lentă → 5 tick-uri coalesced, 420 tick-uri nesalvate, 0 tick-uri blocate, vârsta finală 0; quota plină → 2 refuzuri `STORAGE_FULL`, 5/5 fapte comise după retry; crash → generația durabilă 1 (tick 60), 0 generații parțiale, 3 fapte orfane raportate. Cost real (20 eșantioane, 70 vehicule): capture 0,014/0,017/0,027 ms, encode 3,481/3,918/6,219 ms, copy 1,042/1,111/2,360 ms, transfer 0,003/0,003/0,038 ms, commit 0,001/0,001/0,003 ms.

Fișiere și documente actualizate: `src/persistence/bounded-pipeline.ts` (nou), `src/persistence/bounded-pipeline-store.ts` (nou), `src/persistence/index.ts` (append), `tests/persistence/bounded-pipeline-fixtures.ts` (nou), `tests/persistence/bounded-pipeline.test.ts` (nou), `tests/persistence/bounded-pipeline-report.ts` (nou), `scripts/run-bounded-pipeline-report.mjs` (nou), `package.json` (scriptul `pipeline:bounded`), `Docs/15-salvare-si-import-export.md` (secțiunea contractului 222), `Docs/Evidence/222-bounded-pipeline/README.md`, `report.json`, `report.md`, `cost.json`, `cost.md`.

Limitări sau follow-up: Nivel `targeted`, fără browser, backend GPU sau hardware țintă; costurile sunt o singură mașină și 20 de eșantioane, nu un p95, iar commitul măsoară dublul din memorie, nu un IndexedDB real. Encode-ul rulează sincron în microtask, nu feliat pe worker (integrarea cu `WorkerResourceGovernor` din 221 rămâne adaptor al portului). Schema 127 nu are store de replay, deci chunkurile sunt doar în fereastra RAM plafonată; persistența durabilă a replay-ului rămâne la 228/234. `twoSessionCheckpointBytes` este `null` în manifest: pipeline-ul îl măsoară (64 378 bytes per sesiune pe același tick) și îl raportează ca lacună, fără să inventeze un plafon; `totalHeapBytes` rămâne indisponibil și contorii sunt de proprietate, nu citiri de heap.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate, inclusiv rapoartele performance_checks.
- [x] Contracte/documentație actualizate.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '222'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.4; implementarea nu a început.
- 2026-11-11: Implementare finalizată pe branch-ul `loop-pbi/pipeline-222-01`; contract `222-bounded-pipeline-v1`, 22 teste țintă, transcriere deterministă 67/67, suita completă 2299/2299, dovezi în `Docs/Evidence/222-bounded-pipeline/`.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
