---
id: "063"
title: "Dropoff și finalizarea cursei"
status: "Done"
release: "V1"
module: "Flotă și curse"
depends_on: ["062"]
owner: "Codex gpt-6-luna medium loop-063"
started_at: "2026-10-20T19:22:44+03:00"
completed_at: "2026-10-20T06:10:00+03:00"
---

# 063 Dropoff și finalizarea cursei

## Obiectiv

Finalizează livrarea prin aceleași reguli de zonă și viteză.

## Context și plan

[07-flota-si-curse.md](../../Docs/07-flota-si-curse.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 062 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] O cursă manuală integrală și una autonomă folosesc aceeași evaluare.
- [x] Finalizarea este idempotentă și păstrează metricile cursei.

## Verificare

Testează finalizare, duplicate și întrerupere înainte de oprire.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/fleet/dropoff.ts` (exportat prin `src/fleet/index.ts`) oferă `createRideDropoff` cu `observe/attempt/completions/currentTick/stats/dispose`, plus `dropoffArrivedEventId`, `dropoffCompleteEventId`, `DROPOFF_REJECTION_REASONS`, `DROPOFF_DEFAULTS`, `DROPOFF_LIMITS`. Zona este exact `ride.dropoffZoneId`, rezolvată prin poligonul 032 (XZ, graniță inclusivă), cu acces `TAXI` și refuz pentru o zonă `PICKUP`-only; în afara tuturor zonelor → `NOT_AT_DROPOFF`, altă zonă reală sau id incompatibil → `WRONG_ZONE`. Viteza cerută este `speedMps <= 0,3`, dwell-ul este contiguu pe aceeași cursă și taxi, cu deplasare XZ ≤ 0,05 m, iar finalizarea se produce exact la 180 intervale de tick (3 s la 60 Hz); 179 rămâne `NOT_STATIONARY`. Ieșirea din zonă, viteza, deplasarea, golul de tick sau tick-ul vechi resetează dovada; valorile sunt asertate egale cu `PICKUP_DEFAULTS`. Motive închise: `WRONG_ZONE`, `TOO_FAST`, `NOT_STATIONARY`, `WRONG_RIDE` (cursă necunoscută/terminală), `NOT_AT_DROPOFF`, `STALE_TICK`, `FOREIGN_VEHICLE`, `RIDE_NOT_ON_TRIP` (TO_PICKUP/PICKUP). Un dropoff valid scrie `ARRIVED_DROPOFF` (dacă e nevoie) apoi `DROPOFF_COMPLETE` în același tick prin 061; 061 eliberează claim-ul 060 cu `COMPLETED` → taxi `AVAILABLE`. Fără dwell valid, după cancel/fail, pe altă cursă/vehicul sau fără claim nu există completare (061 aruncă, cursa rămâne `DROPOFF`, nimic înregistrat). Replay-urile întorc `duplicate: true` cu o singură tranziție, un event id și o singură eliberare; metricile cursei sunt păstrate verbatim. Fără ceas, timere, `Math.random`, DOM, Babylon sau Rapier; fără input de control-mode, deci cursele manuale și autonome folosesc același predicat.

Simulare reală: **32/32 cereri livrate exact o dată** în 8 zone reale, dwell de 180 tick-uri. Verificări: `npm run typecheck`, `lint`, `format:check`, `check:architecture` (187 fișiere), `check:parameter-catalog` exit 0; `npm test` 1239/1239 PASS (1226 baseline + 13); `npm run ride:dropoff -- --check` 22/22 PASS. Dovezi în [Evidence/063-dropoff](../../Docs/Evidence/063-dropoff/README.md).

Fișiere și documente actualizate: `src/fleet/dropoff.ts` (nou), `src/fleet/index.ts`, `scripts/ride-dropoff-report.mjs` (nou), testele aferente, [Docs/dropoff.md](../../Docs/dropoff.md) (nou), [Docs/07-flota-si-curse.md](../../Docs/07-flota-si-curse.md), `Docs/Evidence/063-dropoff/`.

Limitări sau follow-up: ETA 064, HUD 075, tarif/review/KPI 209 și fleet health 065 rămân. Catalogul de zone de serviciu 040 lipsește, așa că 063 citește direct poligoanele validate 032; ocuparea nativă a zonei și calibrarea reală de condus rămân 030/040/playtest. Pragurile sunt provizorii. Retenția este mărginită la 64 încercări / 128 completări, iar replay-ul este reconstruit din tranziția 061 cât timp cursa terminală este păstrată. Raportul este un probe funcțional determinist, nu FPS/GPU/Rapier/hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '063' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-20: Implementare în worktree izolat (commit `3399c6ef`): dropoff în zona reală, dwell 180 tick-uri, finalizare exactly-once prin FSM 061 cu eliberare dispatcher și 13 teste noi; 32/32 livrări în 8 zone. Integrat prin fast-forward; verificat de orchestrator cu 1239/1239 teste.
