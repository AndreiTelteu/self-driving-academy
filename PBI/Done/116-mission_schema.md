---
id: "116"
title: "Definiții și lifecycle de misiuni"
status: "Done"
release: "V1"
module: "Misiuni"
depends_on: ["115","007","005","220"]
owner: "loop-pbi/mission-schema-116-01 (cpa/deepseek/deepseek-v4.1-flash)"
started_at: "2026-10-22T08:07:34+03:00"
completed_at: "2026-10-22T08:39:18+03:00"
---

# 116 Definiții și lifecycle de misiuni

## Obiectiv

Definește ID, versiune, obiective, stare, recompense și reluare.

## Context și plan

[13-misiuni-si-progres.md](../../Docs/13-misiuni-si-progres.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 115 trebuie să existe în Done înainte de începere.
- PBI 007 trebuie să existe în Done înainte de începere.
- PBI 005 trebuie să existe în Done înainte de începere.
- PBI 220 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Misiunile consumă evenimente și valori reale ale simulării.
- [x] Evenimentele duplicate nu acordă progres sau recompensă de două ori.

## Verificare

Testează start, progress, failure, completion și replay.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Modulul `src/missions` livrează schema `116-mission-schema-v1` cu definiții versionate, catalogul celor opt misiuni de campanie (`campaign-1-first-taxi` … `campaign-8-fleet-challenge`), obiective calculate exclusiv din evenimente 007 validate și un tracker sincron de lifecycle. Definiția are `missionId`, `version`, `title`, obiective cu praguri pe dificultate, recompense XP/deblocare, politică de reluare `CURRENT`/`SNAPSHOT` cu snapshot/scenariu/profiluri de comparație, fereastră de evaluare în tick-uri autoritare, buget de incidente și prerechizite. Obiectivele consumă valorile reale ale evenimentelor `DROPOFF`, `MANUAL_START`, `COLLISION`, `PROFILE_ACTIVATE`, `FULL_STOP`, `LANE_CHANGE_COMPLETED` și `LEADER_ACQUIRED`; `attachBus(bus)` leagă trackerul la transportul 007 real, iar `ingest` validează aceleași valori. Stările `ACTIVE`/`COMPLETED`/`FAILED` sunt terminale după rezultat; eșecul are motive închise (`EVALUATION_WINDOW_EXPIRED`, `INCIDENT_BUDGET_EXCEEDED`, `SCENARIO_RESET`, `PLAYER_ABANDONED`), fereastra se măsoară pe `advance(tick)`, iar un eveniment terminal tardiv nu mai completează. Idempotența are două chei explicite: registru mărginit de evenimente (eventId + fingerprint) pentru progres și registru separat de identități stabile `(namespace, missionId, version, rewardId)` pentru recompense; duplicatul este `DUPLICATE` și nu schimbă progresul, starea sau recompensele, iar reutilizarea unui `eventId` cu alt payload este refuzată. `replay` creează încercarea următoare cu ID stabil și progres 0 fără să recompenseze din nou, `snapshot`/`restore` păstrează progresul, faptele pe vehicul și registrele, iar `reset` păstrează evenimentele procesate și recompensele. Limitele sunt fixe: 8192 identități de eveniment și 1.048.576 unități UTF-16, 4096 recompense, 16 instanțe active, 64 reținute, 8 încercări pe misiune și 16 ID-uri recente pe instanță. Proba de simulare reală folosește flota 057, programul 059, asignările 060, lifecycle-ul 061 și deciziile 063 (toate `COMPLETED`) pentru a publica trei evenimente `DROPOFF` reale pe bus-ul 007 și închide o misiune cu prag 3.

Verificări executate și rezultat: `npm run typecheck` exit 0 (tsc aplicație + teste, fără diagnostice); `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!” exit 0; `npm run check:architecture` PASS (263 fișiere TypeScript, probe negative 6+4+3) exit 0; `npm test` 1885/1885 pass, 0 fail (27 teste noi 116); `node --import ./scripts/register-typescript.mjs --test "tests/missions/*.test.ts"` 27/27 pass; `node --import ./scripts/register-typescript.mjs scripts/run-mission-schema-report.mjs` 23/23 verificări, 8 misiuni, 3 curse reale, overall PASS; aceeași comandă cu `--check` raportează „Mission schema report is current”, exit 0. Raportul acoperă start/progress/completion prin bus real, cele opt tipuri de obiectiv, deduplicarea evenimentelor, conflictul de `eventId`, eșecul prin fereastră și buget de incidente, reluarea cu recompense refuzate, identitatea/versiunea, snapshot/restore, resetul, simularea reală 057/059/060/061/063, limita de istoric (8256 evenimente → 4462 reținute, 1048570 unități, 3794 eliminate, duplicat vechi respins ca stale) și absența ceasului de perete/DOM/renderer. Dovezi: [README](../../Docs/Evidence/116-mission-schema/README.md), [report.json](../../Docs/Evidence/116-mission-schema/report.json), [report.md](../../Docs/Evidence/116-mission-schema/report.md), [tests.txt](../../Docs/Evidence/116-mission-schema/tests.txt), [checks.txt](../../Docs/Evidence/116-mission-schema/checks.txt). Board: `pwsh -NoProfile -File ./PBI/Validate-Board.ps1 -RequireDone '116'` Valid true după mutarea fizică.

Fișiere și documente actualizate: `src/missions/contracts.ts`, `src/missions/definitions.ts`, `src/missions/lifecycle.ts`, `src/missions/index.ts`, `tests/missions/mission-fixture.ts`, `tests/missions/mission-schema.test.ts`, `tests/missions/mission-lifecycle.test.ts`, `tests/missions/mission-schema-report.ts`, `scripts/run-mission-schema-report.mjs`, `Docs/13-misiuni-si-progres.md` (secțiunea contractului implementat), `Docs/Evidence/116-mission-schema/` (README, report.json, report.md, tests.txt, checks.txt). `package.json` nu a fost modificat; scriptul propus este `"missions:schema": "node --import ./scripts/register-typescript.mjs scripts/run-mission-schema-report.mjs"`.

Limitări sau follow-up: Nu există UI/HUD de misiuni și nicio legare la `main.ts`; un root de compoziție trebuie să apeleze `attachBus` pe transportul 007. Obiectivele de confort/rating/ETA/fidelitate lipsesc până la agregatele KPI (022/023/209); misiunea 5 folosește „cursă fără incident”, iar misiunea 3 numără `LEADER_ACQUIRED`, nu analiza diferenței dintre profiluri. Recompensele sunt înregistrate în registrul misiunilor, dar nu sunt aplicate în XP/nivel (modulele economy/progression sunt încă goale; ledgerul XP aparține contractului 23). Registrele de idempotență sunt doar în memorie și mărginite; un duplicat foarte vechi este respins ca stale datorită tick-ului monoton, însă teoretic un duplicat cu același tick livrat după peste 8192 evenimente cu același tick ar putea scăpa (scenariu nemenționat de transportul 007). `snapshot` este o valoare pură; persistarea în savefile aparține 127–136. Pragurile, ferestrele, bugetele de incidente și sumele XP sunt propuneri de calibrare, fără playtest uman, browser, FPS sau măsurători hardware. Trackerul nu validează dacă `PROFILE_ACTIVATE` a fost într-adevăr aplicat flotei; consumă evenimentul publicat de pipeline-ul real.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Corectitudine izolată și cost local, cu integrare scurtă pe transportul real 007 și lanțul real 057/059/060/061/063. Nu se revendică browser, FPS, soak, Rapier sau hardware; PBI-ul nu are `performance_checks` și nu introduce muncă pe frame (trackerul consumă doar evenimente și `advance(tick)`, peste cel mult 16 instanțe active, cu istoric mărginit).

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '116' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-10-22: Implementare finalizată în worktree-ul `mission-schema-116-01`: definiții versionate pentru cele opt misiuni de campanie, obiective din evenimente 007 reale, lifecycle start/progress/failure/completion/replay, idempotență pe eventId și pe identitatea recompensei, snapshot/restore/reset, raport determinist 23/23 și 27 teste țintite. Mutat fizic în Done după validarea boardului.
