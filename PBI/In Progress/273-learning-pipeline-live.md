---
id: "273"
title: "Pipeline-ul de learning live: dovezi, worker, profil și activare"
status: "In Progress"
release: "V1"
module: "Moduri și learning"
depends_on: ["272"]
performance_checks: ["workers","simulation"]
owner: "loop-pbi/deepseek-273"
started_at: "2026-11-27T04:23:05.734Z"
completed_at: null
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

Verificări executate și rezultat: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:architecture` (475 fișiere), `npm run composition:report -- --check`, `npm run docs:check -- --check`, `npm run learning:live -- --check` — PASS. Teste țintă 18/18 (learning/app/parameter-evidence). `npm test` integrat: 3.724 teste, 3.710 pass, 0 fail, 14 skip-uri istorice. Raport determinist 30/30: 1 job, 1 versiune imuabilă `report-composed~112` cu părinte `profile-v1`, activare PENDING la tick 2 și aplicată la tick 2, toate cele 64 de vehicule pe versiunea nouă; amprenta profilului `1c4d32b2…` → `af1274c2…`, XP neschimbat, `NO_CHANGE`/`INSUFFICIENT_EVIDENCE` fără versiune, `STALE_JOB` pentru generația străină, restore epoch 1→2 cu 1 job anulat și rezultat târziu fără versiune, import invalid/valid și profil nou. Browser probe: **4/9 PASS, NOT_DONE** — segmentul LEARNING real se deschide, se închide și produce un job, dar în probele live ferestrele 087 eligibile au apărut prea târziu sau au lipsit, deci nu s-a publicat o versiune; nu se pretinde PASS. Capturi în `Docs/Evidence/273-live-learning/screenshots/`.

Fișiere și documente actualizate: `src/app/live-learning.ts`, `src/learning/live-evidence.ts`, `src/learning/estimator-queue.ts`, `src/learning/parameter-evidence.ts`, `src/workers/memory-store.ts`, `src/app/live-three-modes.ts`, `src/app/profile-pipeline.ts`, `src/main.ts`, tests app/learning/workers, `scripts/run-live-learning-report.mjs`, `run-live-learning-cost.mjs`, `run-live-learning-probe.mjs`, `Docs/live-learning.md`, `Docs/Evidence/273-live-learning/`.

Limitări sau follow-up: **Blocaj de verificare în browser**: probele live pe Chrome headless (800×450, WEBGL2, `--disable-frame-rate-limit`) rulează lumea reală, dar fereastra 087 eligibilă a celui mai apropiat taxi nu apare în primele 10 s ale segmentului sau lipsește; ultima probă a produs 1 oportunitate cu 0 ferestre eligibile, deci 0 episoade și nicio versiune. Pipeline-ul determinist și testele dovedesc compunerea, activarea, epoch-ul și refuzurile, dar proba cerută de PBI („conduci LEARNING, vezi profilul publicat și efectul în flotă”) nu este îndeplinită. Următorul pas: fie o probă de browser cu fixture determinist peste modulele reale 272/273/109/110, fie calibrarea unei rute live cu o fereastră eligibilă garantată în primele 600 tick-uri; apoi re-rulare pe hardware real. Panoul de profil rămâne 274, settings 279, physics 282, persistence 278. Costul este software, Node 24.19.0, fără pretenție FPS/GPU/hardware.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [ ] Dovezi completate și documentație actualizată.
- [ ] Status Done și completed_at completat.
- [ ] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '273'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
- 2026-11-27: Implementare completă, raport 30/30 și 18 teste țintă; rămâne In Progress pentru proba de browser care nu a publicat o versiune în lumea live.
