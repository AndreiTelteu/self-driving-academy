---
id: "059"
title: "Cereri de curse și program de scenariu"
status: "In Progress"
release: "V1"
module: "Flotă și curse"
depends_on: ["057","040","006"]
owner: "Codex gpt-6-luna medium loop-059"
started_at: "2026-10-20T15:59:21+03:00"
completed_at: null
---

# 059 Cereri de curse și program de scenariu

## Obiectiv

Generează cereri cu pickup, destinație și moment de apariție.

## Context și plan

[07-flota-si-curse.md](../../Docs/07-flota-si-curse.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 057 trebuie să existe în Done înainte de începere.
- PBI 040 trebuie să existe în Done înainte de începere.
- PBI 006 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Cererea poate fi reprodusă din schedule și seed.
- [x] Cereri imposibile sunt validate înainte de alocare.

## Verificare

Testează schedule fix, seed diferit și destinație invalidă.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/fleet/ride-demand.ts` generează determinist 32 de cereri din 3 ferestre și seed (12 `NORMAL`, 12 `HIGH`, 8 `LOW`), cu ID stabil 006, zone reale 032 pickup/dropoff accesibile `TAXI`, tick de apariție în fereastră și nivel de cerere. Fiecare cerere este validată cu plannerul real 041 înainte de admiterea în coada FIFO plafonată la 64; cererile imposibile sunt raportate cu motive închise, iar overflow-ul este explicit `REJECT_NEWEST`. Export public în `src/fleet/index.ts`.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` PASS; `npm run check:architecture` PASS (183 fișiere, probe negative 6+4+3); `npm run check:parameter-catalog` sincronizat; `npm test` 1190/1190 PASS (baseline 1179/1179); `npm run ride:demand -- --check` 31/31 verificări PASS, 32 cereri, overflow 96, raport curent. Teste țintite 11/11 PASS. Logurile exacte sunt în [checks.txt](../../Docs/Evidence/059-ride-demand/checks.txt) și [tests.txt](../../Docs/Evidence/059-ride-demand/tests.txt).

Fișiere și documente actualizate: `src/fleet/ride-demand.ts`, `src/fleet/index.ts`, `tests/fleet/ride-demand.test.ts`, `tests/fleet/ride-demand-fixture.ts`, `tests/fleet/ride-demand-report.ts`, `scripts/run-ride-demand-report.mjs`, `package.json`, [Docs/ride-demand.md](../../Docs/ride-demand.md), [Docs/07-flota-si-curse.md](../../Docs/07-flota-si-curse.md), [Docs/README.md](../../Docs/README.md), [Docs/Evidence/059-ride-demand](../../Docs/Evidence/059-ride-demand/README.md).

Limitări sau follow-up: Validarea de rută este un snapshot la crearea generatorului; 060 trebuie să replanifice la asignare. Modulul nu este dispecer, nu creează `Ride`, pickup/dropoff fizic, ETA, review-uri sau revenue. Nu are corpuri Rapier, mesh-uri, DOM, Babylon, ceas de perete sau măsurători hardware.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '059' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-20: Implementare funcțională finalizată în worktree (`loop-pbi/pbi-059`): generator determinist, validare 041, coadă plafonată, teste, raport și documentație. Boardul/Done rămân părintelui.
