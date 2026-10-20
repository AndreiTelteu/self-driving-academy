---
id: "059"
title: "Cereri de curse și program de scenariu"
status: "Done"
release: "V1"
module: "Flotă și curse"
depends_on: ["057","040","006"]
owner: "Codex gpt-6-luna medium loop-059"
started_at: "2026-10-20T15:59:21+03:00"
completed_at: "2026-10-20T04:45:00+03:00"
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

Rezultat implementare: `src/fleet/ride-demand.ts` (exportat prin `src/fleet/index.ts`) oferă `createRideDemand`/`parseRideDemandPlan`, `rideRequestId`, `rideRequestSpawnTick`, plus `requests/validation/rejections/pending/dequeue/advance/stats/dispose`. Ferestrele planului sunt canonicalizate după `startTick` și `windowId`, deci ordinea array-ului nu contează; id-ul cererii este `createStableId('ride-request', namespace, [windowId, 'rNNNN'])`, stabil între seed-uri și ordinea de admitere; tick-ul de spawn rămâne în `[startTick, endTick)` prin distribuție quotient/remainder fără drift de virgulă mobilă; zonele sunt id-uri reale din `map.serviceZones`, alese cu `deriveScenarioSeed` plus eșantioane adresate per fereastră. `plan.mapId` trebuie să coincidă cu `map.mapId`. Fiecare cerere este validată cu planner-ul real 041 înainte de coadă, cu status închis (`READY`, `UNKNOWN_ORIGIN`, `UNKNOWN_DESTINATION`, `NOT_PICKUP_ZONE`, `NOT_DROPOFF_ZONE`, `ACCESS_MISMATCH`, `SAME_ZONE`, `NO_ROUTE`); doar `READY` devine pending. Coada este plafonată la 64 cu `REJECT_NEWEST`, overflow-ul respins nu este reînviat, iar `advance` cere un tick întreg monoton și aruncă pe tick vechi. Sursa nu conține `Date`, `performance.now`, timere, `Math.random`, DOM, Babylon sau Rapier.

Raport fix: 3 ferestre, **32 cereri** (12 NORMAL, 12 HIGH, 8 LOW), 32 id-uri unice, 32 valide, 32 căutări de planner, tick-uri de spawn 0–1425. Proba de overflow: 100 cereri scadente, limită 4 → 4 admise, 96 respinse.

Verificări executate și rezultat: `npm run typecheck`, `lint`, `format:check`, `check:architecture` (183 fișiere), `check:parameter-catalog` exit 0; `npm test` 1190/1190 PASS (1179 baseline + 11); suita țintă 11/11; `npm run ride:demand -- --check` 31/31 PASS, raport curent. Dovezi în [Evidence/059-ride-demand](../../Docs/Evidence/059-ride-demand/README.md).

Fișiere și documente actualizate: `src/fleet/ride-demand.ts` (nou), `src/fleet/index.ts`, `scripts/ride-demand-report.mjs` (nou), testele aferente, [Docs/ride-demand.md](../../Docs/ride-demand.md) (nou), [Docs/07-flota-si-curse.md](../../Docs/07-flota-si-curse.md), `Docs/README.md`, `Docs/Evidence/059-ride-demand/`.

Limitări sau follow-up: validarea rutei este un snapshot la creare; 060 trebuie să replanifice la alocare, deoarece benzile blocate, traficul și versiunile de graf/cost se pot schimba. Modulul nu este dispatcher și nu creează ciclul `Ride`, pickup/dropoff, ETA, review sau venit; fără corpuri Rapier, mesh-uri sau resurse de renderer. Fără FPS/GPU/soak/hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '059' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-20: Implementare funcțională finalizată în worktree (`loop-pbi/pbi-059`): generator determinist, validare 041, coadă plafonată, teste, raport și documentație. Boardul/Done rămân părintelui.
- 2026-10-20: Implementare în worktree izolat (commit `0217004e`): generator determinist de cereri peste zonele reale, plan canonicalizat, validare 041, coadă mărginită și 11 teste noi; 32 cereri, overflow 4/96. Integrat prin fast-forward; verificat de orchestrator cu 1190/1190 teste.
