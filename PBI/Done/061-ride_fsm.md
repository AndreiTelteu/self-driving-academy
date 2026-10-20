---
id: "061"
title: "Lifecycle cursă și eșecuri"
status: "Done"
release: "V1"
module: "Flotă și curse"
depends_on: ["060","007"]
owner: "Codex gpt-6-luna medium loop-061"
started_at: "2026-10-20T17:40:41+03:00"
completed_at: "2026-10-20T05:30:00+03:00"
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

Rezultat implementare: `src/fleet/ride-fsm.ts` (exportat prin `src/fleet/index.ts`) oferă `createRideLifecycle` peste dispatcher-ul real 060, cu `begin/apply/advance/currentTick/ride/rideFor/active/terminal/snapshot/snapshotRide/restore/stats/dispose` și id-uri stabile 006 (`rideLifecycleId`, `rideTransitionId`). Tranzițiile sunt tabelate: `TO_PICKUP → PICKUP/FAILED/CANCELLED`, `PICKUP → TO_DROPOFF/FAILED/CANCELLED`, `TO_DROPOFF → DROPOFF/FAILED/CANCELLED`, `DROPOFF → COMPLETED/FAILED`, iar stările terminale nu au ieșiri. Evenimentele sunt `ASSIGNED`, `ARRIVED_PICKUP`, `PICKUP_COMPLETE`, `ARRIVED_DROPOFF`, `DROPOFF_COMPLETE`, `CANCELLED`, `FAILED`; motivele de eșec sunt `TAXI_BLOCKED`, `TAXI_DAMAGED`, `TAXI_REMOVED`, `ROUTE_UNAVAILABLE`, `SERVICE_TIMEOUT`, `PLAYER_ABANDONED`, `SCENARIO_RESET`, iar cele de anulare `PLAYER_CANCELLED`, `PASSENGER_CANCELLED`, `DISPATCH_WITHDRAWN`. Evenimentele terminale cer motiv potrivit, celelalte resping orice motiv.

Ordinea terminală este strictă: validează stare/muchie/motiv/tick → verifică `dispatcher.assignmentFor(requestId)` față de `assignmentId` și `taxiId` → `dispatcher.release(taxiId, COMPLETED|CANCELLED|FAILED, tick)` → cere asignarea exactă înapoi → abia apoi comite starea și `RideRelease`. Un claim lipsă/eliberat aruncă `Ride taxi claim is missing`, iar cursa rămâne non-terminală (fără completare fabricată). O a doua tranziție terminală este structural imposibilă; replay-ul idempotent al evenimentului terminal întoarce tranziția originală cu `duplicate: true`. Nu există API de retarget, iar un `taxiId` pe eveniment este respins, deci schimbarea selecției nu poate anula sau muta o cursă. `restore` este atomic, cere lifecycle gol, respinge intrări terminale, id-uri de tranziție furcate, curse fără claim și istorii discontinue; replay-urile rămân idempotente prin `appliedEventIds` restaurate. Fără ceas, timere, randomness, DOM, Babylon sau Rapier.

Raport: **32 curse, 32 eliberări**, 26/26 verificări PASS. Verificări: `npm run typecheck`, `lint`, `format:check`, `check:architecture` (185 fișiere + probe negative), `check:parameter-catalog` exit 0; `npm run ride:lifecycle -- --check` 26/26 PASS. `npm test` a rulat 1214 teste: 1213 pass, 1 fail — flake-ul cunoscut și fără legătură `tests/workers/protocol.test.ts` (cancellation-latency 142,4 ms peste prag). Re-rulat singur: **9/9 PASS, exit 0**. Implementatorul raportase 1214/1214 pe starea lui; flake-ul nu are legătură cu 061. Dovezi în [Evidence/061-ride-fsm](../../Docs/Evidence/061-ride-fsm/README.md).

Fișiere și documente actualizate: `src/fleet/ride-fsm.ts` (nou), `src/fleet/index.ts`, `scripts/ride-lifecycle-report.mjs` (nou), `tests/fleet/ride-fsm.test.ts` (nou), [Docs/ride-fsm.md](../../Docs/ride-fsm.md) (nou), [Docs/07-flota-si-curse.md](../../Docs/07-flota-si-curse.md), `Docs/Evidence/061-ride-fsm/`.

Limitări sau follow-up: pickup/dropoff fizic, viteza și validarea staționării rămân 062–063; ETA/HUD 064–065; tarif/review/KPI 209; persistența savefile 127–136. Înregistrările terminale peste 128 sunt evacuate cu `stats().droppedTerminal`; istoricul complet de curse închise aparține 063/209/210. Un taxi avariat la mijlocul cursei este închis `FAILED` (release îl readuce `AVAILABLE`); remarcarea `DAMAGED` aparține contractului 065. Raportul este un probe funcțional determinist, nu FPS/GPU/Rapier/hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '061' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-20: implementare lifecycle, teste, raport și documentație complete; verificările au trecut, PBI rămâne In Progress pentru mutarea în Done a orchestratorului.
- 2026-10-20: Implementare în worktree izolat (commit `6346e56b`): FSM de cursă cu tranziții tabelate, eliberare obligatorie a dispatcher-ului la starea terminală, idempotență și restore atomic; 32 curse/32 eliberări, 13 teste noi. Integrat prin fast-forward; suita completă a prins doar flake-ul cunoscut workers/protocol (re-rulat singur 9/9 PASS).
