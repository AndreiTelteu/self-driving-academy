---
id: "120"
title: "Provocarea STOP roșu și verde"
status: "Done"
release: "V1"
module: "Misiuni"
depends_on: ["118","097","098"]
owner: "loop-pbi/missions-118-120-01 (opencode/deepseek-v4.1-flash-free)"
started_at: "2026-10-22T20:46:29+03:00"
completed_at: "2026-10-22T21:14:25+03:00"
---

# 120 Provocarea STOP roșu și verde

## Obiectiv

Creează oportunități dedicate regulilor și timpului de reacție.

## Context și plan

[13-misiuni-si-progres.md](../../Docs/13-misiuni-si-progres.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 118 trebuie să existe în Done înainte de începere.
- PBI 097 trebuie să existe în Done înainte de începere.
- PBI 098 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Încălcarea poate fi învățată și consecința este observabilă.
- [x] Oprirea de trafic și verdele blocat sunt explicate corect.

## Verificare

Parcurge cu stil regulamentar și neregulamentar.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/missions/signals.ts` implementează contractul `120-mission-signals-v1` (`campaign-4-stops-and-signals`) ca misiune cu obiectivul 116 de 2 opriri complete de minimum 1,5 s și zero încălcări imputabile. Runul regulamentar raportează `PROGRESS` (3 opriri complete, candidați reali 1 și 1); runul neregulamentar raportează `NO_PROGRESS` cu `VIOLATIONS_AND_INSUFFICIENT_FULL_STOPS` (4 încălcări: 2 `RED_CROSSED` și 2 `STOP_LINE_CROSSED`, candidați reali 1/3 fiecare); runul cu dwell scurt raportează `INSUFFICIENT_FULL_STOPS`. Fiecare încălcare este un `FAILURE` 086 cert și poartă consecința candidatului real 097/098. Oprirea din trafic (`LEADER`) și verdele blocat (`BLOCKED_GREEN`) sunt `EXTERNAL_CONSTRAINT`, nu încălcări: `respond` le refuză cu `EXTERNAL_CONSTRAINT`, `reaction.applicable` este `false`, oprirea din trafic este exclusă din numitorul `stop_full_probability` (3/3, nu 3/4), iar verdele blocat nu intră în `green_start_delay`. Contractul refuză candidați contrazisi, ferestre străine, oportunități duplicate și reacții acceptate pe ferestre constrânse.

Verificări executate și rezultat: `npm run typecheck` exit 0 (fără output, inclusiv `tsconfig.tests.json`); `npm run lint` exit 0, fără avertismente; `npm run format:check` „All matched files use Prettier code style!”, exit 0; `npm run check:architecture` PASS (301 fișiere TypeScript), probe negative PASS, exit 0; `npm run check:parameter-catalog` „Parameter catalog is synchronized.”, exit 0; `npm test` 2088 teste, 2088 pass, 0 fail, 76,4 s, exit 0; testul țintă `tests/missions/mission-signals.test.ts` 7/7 pass, 0 fail; `npm run missions:signals` „SUMMARY checks 53/53, runs 3, overall PASS”; `--check` raportează „Mission signals report is current”. Scenariile acoperă stilul regulamentar și neregulamentar prin fixture-ul real 086 → 087 → 088 → 093 → 097/098 din `tests/missions/mission-signals-fixture.ts`.

Fișiere și documente actualizate: `src/missions/signals.ts`, `src/missions/index.ts`, `tests/missions/mission-signals-fixture.ts`, `tests/missions/mission-signals.test.ts`, `tests/missions/mission-signals-report.ts`, `scripts/run-mission-signals-report.mjs`, `package.json` (scriptul `missions:signals`), `Docs/13-misiuni-si-progres.md`, `Docs/Evidence/120-mission-signals/README.md`, `Docs/Evidence/120-mission-signals/report.json`, `Docs/Evidence/120-mission-signals/report.md`, `tests/missions/mission-follow-report.ts` (eliminare a două declarații nefolosite semnalate de `tsc -p tsconfig.tests.json`) și acest fișier mutat în `PBI/Done`.

Limitări sau follow-up: rulare Node deterministă, fără browser, renderer sau sesiune umană; scenariul autorat alege faza, linia de STOP și durata reală a evenimentului `FULL_STOP`, restul fiind output-ul modulelor livrate; identitatea ferestrei 087 și cea a ferestrei 088 folosesc încă două scheme, iar fixture-ul leagă fereastra reală 088 de fereastra reală 087 a aceleiași oportunități fără a inventa valori; candidații sunt demonstrați la minimul de trei episoade, nu pe un eșantion mare de trafic înregistrat; nu se revendică FPS, GPU sau hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '120' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-22: Implementare începută (owner setat, status In Progress, fișier mutat în In Progress); contractul `120-mission-signals-v1`, fixture-ul real 086/087/088/093/097/098, cele 7 teste, raportul de 53 de verificări și documentația au fost livrate. Toate verificările obligatorii au trecut; status Done, completed_at completat și fișier mutat fizic în PBI/Done.
