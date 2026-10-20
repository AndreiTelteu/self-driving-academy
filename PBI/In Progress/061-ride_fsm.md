---
id: "061"
title: "Lifecycle cursă și eșecuri"
status: "In Progress"
release: "V1"
module: "Flotă și curse"
depends_on: ["060","007"]
owner: "Codex gpt-6-luna medium loop-061"
started_at: "2026-10-20T17:40:41+03:00"
completed_at: null
---

# 061 Lifecycle cursă și eșecuri

## Obiectiv

Implementează TO_PICKUP până la COMPLETED plus FAILED și CANCELLED.

## Context și plan

[07-flota-si-curse.md](../../Docs/07-flota-si-curse.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 060 trebuie să existe în Done înainte de începere.
- PBI 007 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Tranzițiile au evenimente unice și motive pentru rezultate terminale.
- [x] Schimbarea taxiului selectat nu anulează cursa.

## Verificare

Testează cursă completă, anulare și eveniment duplicat.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/fleet/ride-fsm.ts` implementează lifecycle-ul pur peste asignările reale 060: stări `TO_PICKUP` → `PICKUP` → `TO_DROPOFF` → `DROPOFF` → `COMPLETED` plus `FAILED`/`CANCELLED`, tranziții închise, evenimente idempotente după `eventId` cu `transitionId` stabil 006, tick monoton fără ceas de perete, ownership-ul taxiului asignat și eliberare explicită `dispatcher.release(...)` cu `COMPLETED`/`CANCELLED`/`FAILED` la fiecare stare terminală. Motivele sunt vocabulare închise, un al doilea terminal este imposibil, iar restaurările acceptă numai curse active cu revendicare reală. Export public în `src/fleet/index.ts`; documentație în `Docs/ride-fsm.md` și paragraf în `Docs/07-flota-si-curse.md`; raport în `Docs/Evidence/061-ride-fsm/`.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` exit 0; `npm run check:architecture` PASS (185 fișiere TS, probe negative 6+4+3); `npm run check:parameter-catalog` sincronizat; `npm test` 1214/1214 pass (baseline 1201/1201); `npm run ride:lifecycle -- --check` 26/26 verificări PASS, 32 curse, 32 eliberări, raport curent. Testele țintite: 13/13 pass.

Fișiere și documente actualizate: `src/fleet/ride-fsm.ts`, `src/fleet/index.ts`, `tests/fleet/ride-fsm.test.ts`, `tests/fleet/ride-fsm-fixture.ts`, `tests/fleet/ride-fsm-report.ts`, `scripts/run-ride-fsm-report.mjs`, `package.json` (script `ride:lifecycle`), `Docs/ride-fsm.md`, `Docs/07-flota-si-curse.md`, `Docs/Evidence/061-ride-fsm/{README.md,checks.txt,tests.txt,report.json,report.md}`.

Limitări sau follow-up: pickup/dropoff fizic rămâne 062–063; ETA/HUD 064/075; tarif/review/KPI 209; sănătatea flotei 065 (remarkarea `DAMAGED` după un `FAILED`). Persistarea snapshot-ului în savefile aparține 127–136. Înregistrările terminale peste 128 sunt eliminate cu `stats().droppedTerminal`. Boardul, mutarea în Done și Validatorul rămân orchestratorului.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '061' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-20: implementare lifecycle, teste, raport și documentație complete; verificările au trecut, PBI rămâne In Progress pentru mutarea în Done a orchestratorului.
