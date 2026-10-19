---
id: "103"
title: "Estimator în worker cu coadă serială"
status: "Done"
release: "V1"
module: "Învățare"
depends_on: ["102","010","221"]
performance_checks: ["workers", "memory", "frame"]
owner: "Codex gpt-6-luna medium learning-worker-01"
started_at: "2026-10-20T01:35:00+03:00"
completed_at: "2026-10-20T01:52:00+03:00"
---

# 103 Estimator în worker cu coadă serială

## Obiectiv

Rulează joburi în ordinea intervențiilor și verifică baza versionată.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 102 trebuie să existe în Done înainte de începere.
- PBI 010 trebuie să existe în Done înainte de începere.
- PBI 221 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Jobul include playerId/profileId/learningEpoch/baseVersionId/segmentId; se acceptă numai LEARNING eligibil.
- [x] Rezultatul vechi din aceeași generație este recompus serial; altă generație este invalidată.
- [x] Anularea și erorile lasă coada funcțională.

- [x] Estimatorul folosește admiterea/prioritățile din 221; latența end-to-end include coada și este măsurată când rulează un job secundar.

## Verificare

Testează două intervenții rapide, eroare și anulare.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/learning/estimator-worker.ts` și `estimator-task.ts` (exportate prin `src/learning/index.ts`) oferă `LearningEstimatorQueue` cu `submit/cancel/whenIdle/dispose`, plus parsarea jobului și task-ul de estimare. Jobul cere `playerId/profileId/learningEpoch/baseVersionId/segmentId` (și session/world/order/key/baseValue/evidence), iar admiterea acceptă exclusiv `mode: 'LEARNING'` cu `eligible: true`: MANUAL → `MANUAL_SEGMENT_NOT_LEARNABLE`, AUTO → `AUTO_SEGMENT_NOT_LEARNABLE`, segment neeligibil → `SEGMENT_INELIGIBLE`. Dispatch-ul este coalesced într-un microtask, sortat după `order` (nu după sosire) și trimis serial prin guvernorul real 221 cu operația `learning`. Generația este `playerId + profileId + learningEpoch + baseVersionId`: un job dintr-o altă generație invalidează joburile și rezultatele vechi, iar un rezultat întârziat din aceeași generație este recompus serial în ordinea intervențiilor, fără suprascriere paralelă. Anularea, eroarea și `COMPOSITION_REJECTED` eliberează ordinea și lasă următorul job rulabil; `maxPending/maxBytes/maxProposals` întorc `BACKPRESSURE`/`QUEUE_FULL`. Măsurătorile expun `queueMs`, `serviceMs`, `endToEndMs` (include coada, admiterea, coada guvernorului și serviciul), `governorQueueMs`, `governorServiceMs`, `payloadBytes`.

Verificări executate și rezultat: `npm run typecheck`, `lint`, `format:check`, `check:architecture` (174 fișiere + probe negative), `check:parameter-catalog` exit 0; `npm test` 1110/1110 PASS (1098 baseline + 12). Proba nativă (Node worker_threads, `PROVISIONAL_UNCALIBRATED`, 5 repetații × 25 joburi, rulată singură): queue p50/p95/p99 **3,286 / 22,323 / 24,101 ms**, end-to-end **4,304 / 22,609 / 24,529 ms**, service **0,338 / 0,682 / 14,676 ms**, cost main-thread per submit **0,037 / 0,173 / 0,173 ms**; 23 compuse, 1 eroare de task, 1 anulare pending, 22 recompuse, 0 invalidate; startup 165,4–192,8 ms; ownership maxim 61.341 B, payload total 125.061 B, maxim 5.173 B. `frameMs/gpuMs` și tick/simulation/input/checkpoint sunt explicit `unavailable`. Dovezi verbatim în [Evidence/103-learning-worker](../../Docs/Evidence/103-learning-worker/README.md).

Fișiere și documente actualizate: `src/learning/estimator-worker.ts`, `src/learning/estimator-task.ts` (noi), `src/learning/index.ts`, `tests/learning/estimator-worker.test.ts` (nou), [Docs/learning-worker.md](../../Docs/learning-worker.md) (nou), [Docs/10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md), `Docs/Evidence/103-learning-worker/`.

Limitări sau follow-up: fără măsurătoare browser rAF/FPS/GPU/laptop; `mainThreadMs` este doar costul sincron de submit/coalescing. Coada compune candidați în memorie; publicarea profilului, checksum, `LEARNED`, durabilitatea și `acknowledge` din 221 rămân în afara PBI-ului. Estimatorul este o singură felie sincronă mărginită (maximum 4096 episoade / 1 MiB); cererile mai mari sunt refuzate, nu segmentate. Fixture-ul de persistență are 64 de înregistrări; un store de producție trebuie să-și declare capacitatea finită.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '103' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
- 2026-10-20: Implementare în worktree izolat (commit `46a37bdf`): coadă serială de estimare cu job/generație, admitere 221, invalidare cross-generație, recompoziție serială și probe workers/memory/frame. Integrat prin fast-forward; verificat de orchestrator cu 1110/1110 teste și proba nativă rulată singură.
