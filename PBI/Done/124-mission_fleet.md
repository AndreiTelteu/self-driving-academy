---
id: "124"
title: "Provocarea finală de serviciu și incidente"
status: "Done"
release: "V1"
module: "Misiuni"
depends_on: ["123","121"]
owner: "loop-pbi/fleet-124-01"
started_at: "2026-11-11T11:26:08+02:00"
completed_at: "2026-11-11T11:52:07+02:00"
---

# 124 Provocarea finală de serviciu și incidente

## Obiectiv

Definește cerere de curse, ținte de serviciu și buget de incidente.

## Context și plan

[13-misiuni-si-progres.md](../../Docs/13-misiuni-si-progres.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 123 trebuie să existe în Done înainte de începere.
- PBI 121 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Condițiile și fereastra de evaluare sunt afișate înainte de start.
- [x] Rezultatul nu comprima confortul, serviciul și fidelitatea într-un singur scor opac.

## Verificare

Playtest succes, eșec și reluare cu alt profil.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/missions/fleet.ts` livrează schema `124-mission-fleet-v1` pentru etapa 8 (`campaign-8-fleet-challenge`). `fleetChallengeBriefing` produce **înainte de start** fereastra `[startTick, endTick]` inclusivă (21.600 tick-uri din definiția 116), cele patru condiții, ținta de serviciu rezolvată din obiectivul 116 pe dificultate, pragurile 121 de confort, ținta 122 de fidelitate și bugetul numeric de incidente; refuză orice câmp de rezultat, iar `evaluated` este structural zero. `evaluateFleetMission` embeduiește același briefing și judecă cererile reale 059 (plus promisiunea `promiseTick`), cursele terminale 061, cursele de confort 121, fidelitatea reală 122 și evenimentele 007 `COLLISION`, numărate o dată pe `eventId`. Serviciul, confortul și fidelitatea au valori, praguri, verdicte și dovezi separate; verdictul compozit este conjuncția explicită `ALL_DIMENSIONS_WITHIN_BUDGET` (`SUCCESS`/`FAILURE`/`INCOMPLETE`), cu `failingDimensions` și motive închise, fără compensare între dimensiuni. Scenariile simulate determinist: succes (`SUCCESS`, 32/32 curse, 3200/3200 fidelitate), eșec (`FAILURE`, 2/32 curse, confort `FAILED`), reluare cu alt profil (încercarea 2, `fleet-124-v2`, fidelitate `PARTIAL` 3194/3200), buget depășit (1/0 incidente) și fereastră incompletă (`INCOMPLETE`, 30 cereri în așteptare).

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!", exit 0; `npm run check:architecture` PASS (324 fișiere TypeScript), probe negative PASS; `npm run check:parameter-catalog` „Parameter catalog is synchronized.", exit 0; `npm test` 2290 teste, 2290 pass, 0 fail, 76,42 s; testul țintă 13/13 pass; `npm run missions:fleet` 77/77 verificări, 5 rulări, overall PASS; raportul `--check` este curent. Detalii în [Docs/Evidence/124-mission-fleet/README.md](../../Docs/Evidence/124-mission-fleet/README.md).

Fișiere și documente actualizate: `src/missions/fleet.ts` (nou), `src/missions/index.ts`, `tests/missions/mission-fleet-fixture.ts` (nou), `tests/missions/mission-fleet.test.ts` (nou), `tests/missions/mission-fleet-report.ts` (nou), `scripts/run-mission-fleet-report.mjs` (nou), `package.json`, `Docs/13-misiuni-si-progres.md`, `Docs/Evidence/124-mission-fleet/README.md`, `Docs/Evidence/124-mission-fleet/report.json`, `Docs/Evidence/124-mission-fleet/report.md`.

Limitări sau follow-up: Validarea este deterministă în Node, nu un playtest uman în browser; „playtest-ul" succes/eșec/reluare este simulat prin contractele reale 057/059/060/061/109/110/121/122 cu evenimente 007 în forma publicată de adaptorul 028. Nu există UI, panou sau compoziție în `main.ts`; briefingul este contractul pe care un panou îl poate randa. Țintele `minimumServedFraction = 1`, `maximumLateRides = 0` și fidelitatea `100% / EXACT` sunt propuneri de calibrare V1, nu valori calibrate pe jucători reali. Nu se revendică FPS, GPU, Rapier sau hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '124' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-11: Implementat în `src/missions/fleet.ts` cu briefing înainte de start, cerere 059, ținte de serviciu, buget 007 de incidente și trei dimensiuni separate cu verdict compozit explicit; 13 teste țintă și raport determinist 77/77 trec; mutat fizic în Done.
