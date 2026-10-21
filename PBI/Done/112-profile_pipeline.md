---
id: "112"
title: "Integrare intervenție estimator și publicare"
status: "Done"
release: "V1"
module: "Profiluri"
depends_on: ["111","103","204"]
owner: "opencode deepseek-v4.1-flash profile-pipeline-01"
started_at: "2026-10-21T17:28:56.009Z"
completed_at: "2026-10-21T20:53:08+03:00"
---

# 112 Integrare intervenție estimator și publicare

## Obiectiv

Integrează serviciile extinse de segment, estimator și activare; gate-ul final 108 nu blochează integrarea înainte de release.

## Context și plan

[12-profiluri-si-propagare.md](../../Docs/12-profiluri-si-propagare.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 111 trebuie să existe în Done înainte de începere.
- PBI 103 trebuie să existe în Done înainte de începere.
- PBI 204 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Segmentele LEARNING sunt analizate automat; MANUAL nu creează joburi de learning sau versiuni.
- [x] No-change nu creează profil; rezultatele depășite în aceeași generație sunt recompuse explicit.

## Verificare

Parcurge două intervenții consecutive și verifică versiunile.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Pipeline-ul `112-profile-pipeline-v1` leagă segmentele 069 de coada reală 103, validarea 102, store-ul 109 și activarea 110. Un segment LEARNING eligibil construiește jobul real, îl trimite în coadă și așteaptă outcome-ul terminal; o compoziție schimbată cu delta acceptat creează exact o versiune imuabilă cu părintele explicit și publică o comandă 110 pentru tick-ul următor. MANUAL și AUTO sunt `SKIPPED_MANUAL` înainte de admitere, fără job, versiune sau activare; LEARNING ineligibil este `SKIPPED_INELIGIBLE` cu aceleași efecte zero. O compoziție fără schimbare reală este `NO_CHANGE`, fără versiune și fără activare, iar duplicatele returnează `NO_CHANGE` fără un job nou. Un rezultat depășit în aceeași generație este `RECOMPOSED`, folosește ultima compoziție a cozii și produce o singură versiune; un epoch/base străin este `STALE_JOB`, fără versiune. Erorile, respingerile, invalidările, anulările și respingerea 102/109 sunt `FAILED` cu codul real, fără versiune. Două intervenții consecutive produc v1 (părinte = baza) și v2 (părinte = v1); duplicatele aceluiași `segmentId` sunt deduplicate de store fără un al doilea job sau activare. Istoricul este mărginit (16, maximum 64), vocabularele sunt închise, iar rezultatul este determinist și înghețat.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (243 fișiere TypeScript, probe negative 6+4+3 PASS); `npm test` 1662/1662 pass, 0 fail; `npm run profile:pipeline` 53/53 verificări, 7 scenarii, overall PASS; `npm run profile:pipeline -- --check` „Profile pipeline report is current”. Testele țintite 112: 19/19 pass. Raportul parcurge LEARNING → v1, LEARNING → v2 (părinte v1), MANUAL fără efecte, no-change fără versiune, recompoziție explicită, epoch stale și eroare fără versiune. Dovezi: [report.json](../../Docs/Evidence/112-profile-pipeline/report.json), [report.md](../../Docs/Evidence/112-profile-pipeline/report.md), [README](../../Docs/Evidence/112-profile-pipeline/README.md).

Fișiere și documente actualizate: `src/app/profile-pipeline.ts`, `src/app/index.ts`, `tests/app/profile-pipeline.test.ts`, `tests/app/profile-pipeline-report.ts`, `tests/harness/learning-queue-harness.ts`, `tests/harness/profile-pipeline-fixture.ts`, `scripts/run-profile-pipeline-report.mjs`, `package.json`, `Docs/profile-pipeline.md`, `Docs/12-profiluri-si-propagare.md`, `Docs/learning-worker.md`, `Docs/README.md` și `Docs/Evidence/112-profile-pipeline/`.

Limitări sau follow-up: Worker-ul este un port de transport documentat care răspunde cu rezultatul real al blend-ului 101; coada, governorul 221, compoziția 102, store-ul 109 și activarea 110 sunt reale, dar nu există un thread `worker_threads` sau browser. Flota este fixture-ul determinist 057 (24 taxiuri + 40 civile); nu există buclă de joc integrată, fizică, FPS/GPU sau participanți reali. Publicările consecutive cer tick-uri de la host; fără `advanceTick`, a doua publicare este raportată corect ca `ACTIVATION_PENDING` (versiunea există, nimic nu este șters). Gate-ul 108 nu este prerechizit și nu a fost exercitat.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '112' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-10-21: Implementare finalizată: pipeline LEARNING automat către 103/102/109/110, MANUAL/ineligibil fără job sau versiune, no-change fără profil, recompoziție explicită în aceeași generație, lanț v1→v2 și erori fără versiune; 19 teste, raport cu 53 de verificări și documentație. Mutat fizic în Done după validare.
