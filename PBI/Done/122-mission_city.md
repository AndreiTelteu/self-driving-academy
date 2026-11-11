---
id: "122"
title: "Misiunea orașul te copiază"
status: "Done"
release: "V1"
module: "Misiuni"
depends_on: ["119","120","115"]
owner: "loop-pbi/mission-city-122-01"
started_at: "2026-11-11T03:12:46+02:00"
completed_at: "2026-11-11T04:54:25+02:00"
---

# 122 Misiunea orașul te copiază

## Obiectiv

Evaluează întreaga flotă cu profilul jucătorului.

## Context și plan

[13-misiuni-si-progres.md](../../Docs/13-misiuni-si-progres.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 119 trebuie să existe în Done înainte de începere.
- PBI 120 trebuie să existe în Done înainte de începere.
- PBI 115 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Rezultatul include taxiurile nevizibile și expunerea lor.
- [x] Consecințele sunt distincte de succesul imitației.

## Verificare

Observă o rulare de flotă prudentă și una riscantă.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/missions/city.ts` cu schema `122-mission-city-v1` evaluează întreaga flotă (20 de taxiuri și 20 de civili în fixture) cu profilul jucătorului. Intrarea este refuzată dacă lista de vehicule nu acoperă exact populația declarată, dacă o versiune aplicată aparține altui profil sau are alt set de chei 092, dacă o cursă nu aparține unui taxi evaluat, dacă o cursă este încă activă ori dacă activarea 110 nu este exact versiunea jucătorului. Camera este doar un set de observație: vehiculele din afara ei rămân evaluate, iar expunerea lor este raportată separat în secunde reale 061 (`totalCostSeconds`), inclusiv pentru cursele eșuate. Imitația (potrivirea valorilor 109 cu versiunea publicată, verdict `EXACT`/`PARTIAL`/`NONE`) și consecințele (serviciu livrat, serviciu ratat, eșecuri imputabile `TAXI_DAMAGED`/`TAXI_BLOCKED`, verdict `CLEAN`/`HARMFUL`/`NO_SERVICE`) au valori și verdicte proprii, fără scor comun. Rularea riscantă copiază profilul `EXACT` și produce `HARMFUL` (5 eșecuri imputabile, 4 invizibile), iar rularea parțial actualizată are fidelitate `PARTIAL` și consecințe `CLEAN` (8 curse livrate).

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (316 fișiere TypeScript) cu probe negative PASS; `npm run check:parameter-catalog` sincronizat; `npm test` 2204 teste, 2204 pass, 0 fail, 75,6 s; testul țintă `tests/missions/mission-city.test.ts` 9 teste, 9 pass; `npm run missions:city` 58/58 verificări, 3 rulări, PASS; `npm run missions:city -- --check` raport curent.

Fișiere și documente actualizate: `src/missions/city.ts`, `src/missions/index.ts`, `tests/missions/mission-city-fixture.ts`, `tests/missions/mission-city.test.ts`, `tests/missions/mission-city-report.ts`, `scripts/run-mission-city-report.mjs`, `package.json` (scriptul `missions:city`), `Docs/13-misiuni-si-progres.md`, `Docs/Evidence/122-mission-city/README.md`, `report.json` și `report.md`.

Limitări sau follow-up: rulare Node deterministă, fără browser, renderer sau sesiune umană; planul de curse este autorat (ce taxi ia cursa și dacă se încheie livrată, avariată sau anulată), iar costurile, identitățile, versiunile și tranzițiile sunt output-uri reale 057/059/060/061/109/110; setul de cameră este o listă declarată, pentru că 122 nu deține renderer; eșecurile imputabile sunt limitate la `TAXI_DAMAGED` și `TAXI_BLOCKED`; nu se revendică FPS, GPU, Rapier sau hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '122' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-11: preluat pe branch-ul `loop-pbi/mission-city-122-01`, mutat fizic în In Progress; implementarea nu începuse.
- 2026-11-11: implementat contractul 122 (flotă completă, expunere invizibilă, imitație și consecințe separate), teste deterministe, raport cu `--check` și dovezi; toate verificările obligatorii au trecut.
