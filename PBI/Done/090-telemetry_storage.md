---
id: "090"
title: "Compactare buffer și finalizare segment"
status: "Done"
release: "V1"
module: "Telemetrie"
depends_on: ["089","010"]
performance_checks: ["memory", "workers", "frame"]
owner: "Codex gpt-6-luna medium telemetry-storage-01"
started_at: "2026-10-19T15:19:48+03:00"
completed_at: "2026-10-19T16:02:29+03:00"
---

# 090 Compactare buffer și finalizare segment

## Obiectiv

Compactează la frecvența de analiză și păstrează timpii evenimentelor.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[09-telemetrie-si-oportunitati.md](../../Docs/09-telemetrie-si-oportunitati.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 089 trebuie să existe în Done înainte de începere.
- PBI 010 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Bufferul are limite și finalizează segmentul fără a bloca frame-ul.
- [x] Evenimentele de oprire și reacție nu pierd rezoluția tick-ului.

- [x] Chunkurile/rollover-ul păstrează continuitatea și oportunitățile; se măsoară bytes și transferul fără detașarea datelor live.

## Verificare

Testează intervenție lungă, buffer plin și segment foarte scurt.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `createSegmentCompaction` în `src/telemetry/segment-compaction.ts`, exportat prin `src/telemetry/index.ts`, consumă incremental segmentul 085 real (fără să copieze bufferele lui și fără să reimplementeze validarea) și faptele 086. Retenția de analiză este la 20 Hz implicit (`analysisHz` configurabil, divizor întreg al `tickHz`), cu tick-ul sursă păstrat exact într-o proiecție numerică de 32 B/eșantion (tick, viteză, throttle, brake, steering, accelerații longitudinală/laterală). Chunkurile au plafon de 4 KiB (maximum 256 KiB), 64 chunkuri / 4 MiB reținute, 4096 oportunități și 4096 evenimente; depășirea este refuzată și raportată, nu ștearsă tacit. Rollover-ul declară `sequence`, `previousSequence`, `nextSequence`, `firstTick`, `lastTick`, `hasGap` și `gapCount`. După sigilarea unui chunk, `lastTick` devine watermark de admitere: un eveniment sau o oportunitate nouă la sau sub el este refuzată, contorizată și închide segmentul `INCOMPLETE/LATE_FACT`; rezolvarea unei oportunități deja admise actualizează chunkul original cu `resolvedTick` exact. `FINALIZED` nu este atins cât timp există fapte în așteptare. Finalizarea urmează `OPEN → FINALIZING → FINALIZED/INCOMPLETE`; fiecare `finalizeStep` sigilează cel mult un chunk, ca o unitate reală de lucru (buget implicit 32, maximum 256), iar sursa trebuie să fie `CLOSED` și citită integral, altfel `SOURCE_INCOMPLETE`. `acquireTransfer` produce un `TRANSFER_COPY` exactly-once cu typed arrays copiate; `structuredClone(..., { transfer })` detașează doar copia, iar 085 live rămâne lizibil și acceptă tickuri ulterioare. `dispose()` readuce contoarele live la zero, iar apelurile ulterioare eșuează închis.

Verificări executate și rezultat:
- Implementator (worktree izolat, Node 24.21.0/npm 11.19.0 prin Volta): `npm run typecheck`, `lint`, `format:check`, `check:architecture`, `check:parameter-catalog` exit 0; `npm test` 1019/1019 PASS; testele țintă `tests/telemetry/segment-compaction.test.ts` 11/11 PASS.
- Orchestrator, re-rulare independentă pe starea integrată (`2c7c2011`): `npm run check` EXIT 0 — 1019 teste, 1019 pass, 0 fail; `npm run check:parameter-catalog` EXIT 0 („Parameter catalog is synchronized.").
- Probe native re-rulate de orchestrator, secvențial și singure, cu Node 24.21.0: BEFORE (`--baseline`) EXIT 0, citire directă 085 p95 0.7–2.3 µs (mediană 1.0); AFTER EXIT 0, `selfCheck` true pentru `continuity`, `eventTickEquality`, `stopAndReactionTickEquality`, `noDuplicateEvents`, `exactAnalysisTicks`, `detachedFalse`, `copyDetached`, `liveAfterTransfer`; 7 chunkuri, 6 rollover-uri, 400 eșantioane reținute din 1200 tickuri, 13 opportunity id-uri, 2 fapte de eveniment, `retainedBytes` 15.446 B din `recorderRamBytes` 33.554.432 B, transfer 2.429 B din `pendingWorkerPayloadBytes` 16.777.216 B. Percentilele mele: `compactAvailable(32)` p50/p95/p99 median 22,8/62,8/78,0 µs (p95 42,8–246,5 µs, outlier de first-touch), `finalizeStep(4)` p95 median 16,8 µs (14,6–106,3 µs, first-touch); valorile înregistrate de implementator în dovezi sunt 26,8/51,7/62,0 µs și 22,5/25,1/25,1 µs.
- Reproducerea „late fact" re-rulată de orchestrator după reparație: evenimentul întârziat (`tick 4` după watermark 1152) întoarce `false`, `eventsRejected=1`, starea `INCOMPLETE`, motiv `LATE_FACT`; singurul eveniment emis este cel timpuriu (`tick 5`). Înainte de reparație, aceeași reproducere arăta `true` și `FINALIZED` cu evenimentul lipsă — defectul este acoperit acum de testul `late events after rollover are refused with a counter and LATE_FACT`.
- Dovezile complete, inclusiv ieșirile verbatim și rapoartele JSON: [Evidence/090-telemetry-storage](../../Docs/Evidence/090-telemetry-storage/README.md).

Fișiere și documente actualizate: `src/telemetry/segment-compaction.ts` (nou), `src/telemetry/index.ts`, `tests/telemetry/segment-compaction.test.ts` (nou, 11 teste), `scripts/benchmark-telemetry-storage.mjs` (nou), [Docs/telemetry-storage.md](../../Docs/telemetry-storage.md) (nou), [Docs/09-telemetrie-si-oportunitati.md](../../Docs/09-telemetrie-si-oportunitati.md), `Docs/Evidence/090-telemetry-storage/` (README, checks, tests, ambele arme native, reproducerea late-fact).

Limitări sau follow-up: Măsurătorile sunt native CPU și memorie deținută; nu se pretinde browser, renderer, GPU, FPS sau integrare în bucla live (compactorul nu este încă legat de composition root; 095/069 dețin cablarea). Nu s-a exercitat un Worker/MessagePort real, doar forma transferabilă și `structuredClone` pe copie; bugetul `pendingWorkerPayloadBytes` este comparat per chunk. Proiecția compactă păstrează doar cele 7 câmpuri numerice analitice; banda, semnalul și clasa rămân în 085. Contorul de bytes al 090 este o categorie separată de ownership și exclude overhead-ul JS object/Map, deci nu este RAM totală. Percentilele depind de host și păstrează outlierii de first-touch; `PROVISIONAL_UNCALIBRATED`.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '090' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-10-19: Implementare în worktree izolat (commit `50f39b46`): compactare 20 Hz cu tick exact, chunkuri plafonate, rollover cu continuitate, finalizare incrementală și transfer-copy. Revizia orchestratorului a găsit două defecte reale (fapte întârziate pierdute tacit la `FINALIZED`; `finalizeStep` fără muncă efectivă), reparate în `2c7c2011` cu `LATE_FACT`, watermark de admitere, sigilare de chunk per pas și 3 teste de regresie. Integrat prin fast-forward în `main`.

- 2026-10-19: Modelul implicit cerut pentru subagent (`Codex 6.1-Sol`) nu există în catalogul providerului Codex; s-a folosit `gpt-6-luna` (reasoning medium), iar prima încercare pe providerul `opencode` a eșuat cu `401 Unauthorized`. Boardul, verificările și mutarea fizică rămân ale orchestratorului.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
