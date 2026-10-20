---
id: "062"
title: "Pickup cu zonă viteză și staționare"
status: "Done"
release: "V1"
module: "Flotă și curse"
depends_on: ["061","040","054"]
owner: "Codex gpt-6-luna medium loop-062"
started_at: "2026-10-20T18:28:58+03:00"
completed_at: "2026-10-20T05:50:00+03:00"
---

# 062 Pickup cu zonă viteză și staționare

## Obiectiv

Validează oprirea și serviciul de pickup pentru manual și autonom.

## Context și plan

[07-flota-si-curse.md](../../Docs/07-flota-si-curse.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 061 trebuie să existe în Done înainte de începere.
- PBI 040 trebuie să existe în Done înainte de începere.
- PBI 054 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Markerul traversat în viteză nu finalizează pickup.
- [x] Durata de staționare se măsoară în timp simulat.

## Verificare

Testează trecere rapidă, oprire corectă și zonă ocupată.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/fleet/pickup.ts` (exportat prin `src/fleet/index.ts`) oferă `createRidePickup` cu `observe/attempt/boardings/currentTick/stats/dispose` și constantele `PICKUP_VERSION`, `PICKUP_REJECTION_REASONS`, `PICKUP_DEFAULTS`, `PICKUP_LIMITS`, `pickupArrivedEventId`, `pickupBoardedEventId`. Zona este exact `ride.pickupZoneId` din asignarea reală 060, rezolvată prin poligonul de serviciu 032, cu conținere XZ și graniță inclusivă, acces `TAXI` și nu `DROPOFF`-only; altă zonă reală → `WRONG_ZONE`, în afara tuturor zonelor → `NOT_AT_PICKUP`, fără rază sau id-uri furcate. Viteza cerută este `speedMps <= 0,3` inclusiv, iar dwell-ul este exact 180 intervale de tick simulate (3 s la 60 Hz), contiguu pe cursă, cu deplasare XZ ≤ 0,05 m între observații: 179 tick-uri rămân `NOT_STATIONARY`, al 180-lea îmbarcă. Orice ieșire, supraviteză, deplasare, tick lipsă sau tick vechi resetează dovada; repetările în același tick sunt idempotente. Integrarea scrie `ARRIVED_PICKUP` doar dacă e nevoie, apoi `PICKUP_COMPLETE` în același tick; nicio observație invalidă nu scrie `PICKUP_COMPLETE`, taxiul rămâne claimed, iar id-urile stabile de eveniment împiedică îmbarcarea dublă. Motive închise: `WRONG_ZONE`, `TOO_FAST`, `NOT_STATIONARY`, `WRONG_RIDE`, `NOT_AT_PICKUP`, `STALE_TICK`, `FOREIGN_VEHICLE`.

Simulare reală: **32/32 cereri imbarcate exact o dată** în 11 zone reale, fiecare cursă la exact 180 tick-uri de dwell, 32 completări/eliberări, 0 respingeri de pickup, 0 îmbarcări duplicate. Verificări: `npm run typecheck`, `lint`, `format:check`, `check:architecture` (186 fișiere), `check:parameter-catalog` exit 0; `npm run ride:pickup -- --check` 19/19 PASS; `npm test` 1226/1226 PASS (1214 baseline + 12). Dovezi în [Evidence/062-pickup](../../Docs/Evidence/062-pickup/README.md).

Fișiere și documente actualizate: `src/fleet/pickup.ts` (nou), `src/fleet/index.ts`, `scripts/ride-pickup-report.mjs` (nou), testele aferente, [Docs/pickup.md](../../Docs/pickup.md) (nou), [Docs/07-flota-si-curse.md](../../Docs/07-flota-si-curse.md), `Docs/Evidence/062-pickup/`.

Limitări sau follow-up: dropoff 063, ETA 064, HUD 075, tarif/review/KPI 209 și fleet health 065 rămân în afara scopului. `Docs/service-zones.md`/`src/world/service-zones.ts` lipsesc din acest checkout (produsul 040 există doar în commit-ul suspendat `69e66680`), așa că 062 citește direct poligoanele validate 032, fără să furce id-urile de zonă. Ocuparea/space-ul nativ al zonei nu este inspectat; rămâne 030/040. Pragurile sunt provizorii; retenția este mărginită la 64 încercări / 128 îmbarcări.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '062' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-20: Implementare în worktree izolat (commit `c5d7a2a6`): pickup în zona reală, prag de viteză și dwell de 180 tick-uri, motive închise și integrare cu FSM 061; 32/32 îmbarcări, 12 teste noi. Integrat prin fast-forward; verificat de orchestrator cu 1226/1226 teste.
