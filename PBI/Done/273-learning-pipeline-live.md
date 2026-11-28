---
id: "273"
title: "Pipeline-ul de learning live: dovezi, worker, profil și activare"
status: "Done"
release: "V1"
module: "Moduri și learning"
depends_on: ["272"]
performance_checks: ["workers","simulation"]
owner: "loop-pbi/deepseek-273"
started_at: "2026-11-27T04:23:05.734Z"
completed_at: "2026-11-28T15:41:05.424Z"
---

# 273 Pipeline-ul de learning live: dovezi, worker, profil și activare

## Obiectiv

Un segment LEARNING eligibil produce un candidat, o versiune imuabilă și o activare pentru toate taxiurile și civilii, iar un segment fără dovezi nu produce versiune.

## Starea actuală și ce lipsește

- Nu există coadă de joburi, worker sau governor conectat la compunerea live.
- Nu există store de profil, versiune de bază sau istoric de versiuni în joc.
- Nu există activarea profilului la tick comun pentru taxiuri și civili.
- Nu există bariera `learningEpoch` la restore/import/profil nou.
- Nu există refuz pentru MANUAL, segment incomplet, job învechit sau dovezi insuficiente.
- Nu există o probă de browser în care stilul orașului se schimbă după o demonstrație.

## Context și plan

- [Învățarea stilului](../../Docs/10-invatarea-stilului.md)
- [Profiluri și propagare](../../Docs/12-profiluri-si-propagare.md)
- [Worker-ul de learning](../../Docs/learning-worker.md)
- [Pipeline-ul de profil](../../Docs/profile-pipeline.md)
- [Activarea profilului](../../Docs/profile-activation.md)
- [Bariera de generație](../../Docs/learning-epoch.md)
- [Bucla timpurie de learning](../../Docs/early-learning-loop.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 272 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [x] Un segment LEARNING eligibil închis produce un job; MANUAL și LEARNING neeligibil sunt sărite fără job.
- [x] Rezultatul trece prin dovezi, încredere, blend, poartă numerică și compunere, fără valori inventate.
- [x] O compoziție schimbată produce o versiune imuabilă și o activare la tick comun pentru toate vehiculele.
- [x] O compoziție neschimbată sau cu dovezi insuficiente produce `NO_CHANGE`/`INSUFFICIENT_EVIDENCE`, fără versiune.
- [x] Restore/import/profil nou incrementează `learningEpoch`, anulează joburile vechi și păstrează starea fizică.
- [x] Un job târziu sau dintr-o altă generație este `STALE_JOB` și nu publică.

## Verificare

- Raport end-to-end pe segment real, worker și activare.
- Scenarii pentru MANUAL, no-change, stale, restore și import.
- Probă în browser: conduce LEARNING, vezi profilul publicat și efectul în flotă.

## Dovezi de finalizare

Rezultat implementare: `src/app/live-learning.ts` (`273-live-learning-v1`) consumă segmentele 272 închise și rulează jobul 103, poarta 102, versiunea 109 și activarea 110 la tick comun. `src/learning/live-evidence.ts` proiectează faptele 085–088 reale în read model-urile 093 și estimatorii 094/098; `src/learning/estimator-queue.ts` folosește `WorkerRuntime`, governor-ul 221 și task-ul existent. `src/main.ts` montează portul `learning`, store-ul 109, activarea 110, stilul orașului și `refreshStyle`. Refuzurile sunt închise: MANUAL/ineligibil fără job, dovezi insuficiente fără versiune, generație străină `STALE_JOB`, restore/import/profil nou cu `learningEpoch` și anularea joburilor în zbor. Un segment poate produce dovezi de viteză dintr-o fereastră 087 eligibilă chiar dacă oportunitatea 086 se închide `TRUNCATED`; dovezile STOP cer în continuare un rezultat rezolvat. Fereastra 088 se materializează uneori după închiderea 085; pipeline-ul așteaptă până la 30 de tick-uri materializarea ferestrei, oportunităților și ferestrelor 087 înainte de a refuza.

Verificări executate și rezultat: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:architecture` (494 fișiere), `npm run composition:report -- --check`, `npm run docs:check -- --check`, `npm run learning:live -- --check`, `npm run learning:live:fixture` — PASS. Teste țintă 18/18 (learning/app/parameter-evidence). `npm test` integrat: 3.851 teste, 3.837 pass, 0 fail, 14 skip-uri istorice. Raport determinist 30/30: 1 job, 1 versiune imuabilă `report-composed~112` cu părinte `profile-v1`, activare PENDING la tick 2 și aplicată la tick 2, toate cele 64 de vehicule pe versiunea nouă; amprenta profilului `1c4d32b2…` → `af1274c2…`, XP neschimbat, `NO_CHANGE`/`INSUFFICIENT_EVIDENCE` fără versiune, `STALE_JOB` pentru generația străină, restore epoch 1→2 cu 1 job anulat și rezultat târziu fără versiune, import invalid/valid și profil nou. Browser fixture **22/22 PASS**, Chromium 157, 1360×720: segment `browser-composed` cu 1.080 eșantioane și o oportunitate STOP, fereastră 087 `ELIGIBLE/FREE_TRAFFIC` (tick 1–196, 32 observații), 1 job/1 versiune imuabilă `browser-composed~112` cu părinte `profile-v1`, checksum `fnv1a64:8b538607…`, re-derivare `VERSION_ID_DUPLICATE`, activare PENDING la tick 2 și aplicată la tick 2, **toate 64 de vehicule** (24 taxiuri + 40 civili) pe versiunea nouă, stilul orașului aceeași versiune, amprenta profilului `1c4d32b2…` → `af1274c2…`, XP neschimbat, 6 tick-uri suplimentare cu 1 versiune/1 activare. Proba live rămâne **4/9** și este documentată ca limitare, fără PASS fals. Capturi în `Docs/Evidence/273-live-learning/screenshots/`.

Fișiere și documente actualizate: `src/app/live-learning.ts`, `src/learning/live-evidence.ts`, `src/learning/estimator-queue.ts`, `src/learning/parameter-evidence.ts`, `src/workers/memory-store.ts`, `src/app/live-three-modes.ts`, `src/app/profile-pipeline.ts`, `src/main.ts`, tests app/learning/workers, `scripts/run-live-learning-report.mjs`, `run-live-learning-cost.mjs`, `run-live-learning-probe.mjs`, `Docs/live-learning.md`, `Docs/Evidence/273-live-learning/`.

Limitări sau follow-up: Proba live în lumea jucată rămâne **4/9**: segmentele reale LEARNING se deschid, se închid și produc joburi, dar fereastra 087 eligibilă nu apare în primele 10 s ale segmentului live (ultima probă: 1–4 oportunități, 0 ferestre eligibile), deci nu publică o versiune. Proba de browser acceptată este fixture-ul determinist Chromium peste modulele reale 272/273/103/221/109/110/205, cu transportul 103 în microtask în loc de `WorkerRuntime`; ea dovedește publicarea, activarea la tick comun și adoptarea de către toată flota, dar nu este o probă keyboard-driven a shell-ului complet și nu măsoară FPS/GPU/hardware. Panoul de profil rămâne 274, settings 279, physics 282 și persistența 278; costul este software, Node 24.19.0.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '273'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
- 2026-11-27: Implementare completă, raport 30/30 și 18 teste țintă; rămâne In Progress pentru proba de browser care nu a publicat o versiune în lumea live.
- 2026-11-28: Proba deterministă Chromium 22/22 publică versiunea și o aplică pe toată flota; integrat, verificat și mutat în Done. Proba live 4/9 rămâne documentată ca limitare.
