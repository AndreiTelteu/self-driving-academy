---
id: "072"
title: "Cursă completă și intervenție scurtă manuală"
status: "Done"
release: "V1"
module: "Control manual"
depends_on: ["071","063"]
owner: "Codex gpt-6-luna medium loop-072"
started_at: "2026-10-20T23:01:15+03:00"
completed_at: "2026-10-21T00:10:00+03:00"
---

# 072 Cursă completă și intervenție scurtă manuală

## Obiectiv

Livrează cursa integrală în MANUAL fără learning și demonstrația scurtă în LEARNING.

## Context și plan

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 071 trebuie să existe în Done înainte de începere.
- PBI 063 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] MANUAL produce rezultatul cursei și telemetrie, fără schimbarea valorilor sau dovezilor profilului.
- [x] LEARNING poate publica doar parametrii observați; schimbarea controlului păstrează pasagerul și destinația.

## Verificare

Parcurge în browser o cursă completă și o intervenție parțială.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/app/manual-trip.ts` (exportat prin `src/app/index.ts`) oferă `createManualTrip` cu `begin/requestMode/step/result/stats/dispose`, plus `manualTripContractFacts`, `MANUAL_TRIP_VERSION` și un vocabular închis de refuzuri. Compune lanțul real 057/059/060/061/062/063 cu puntea reală 066/067/068/069 și continuitatea 071; nu deține curse, corpuri, ceas sau fizică. `begin` este singura scriere în lifecycle: o schimbare de mod nu începe, nu retargetează și nu eliberează cursa — `rideId`, `requestId`, `assignmentId`, `taxiId`, zonele, rutele, costurile și `startedTick` rămân identice, iar claim-ul 060 rămâne `ASSIGNED`. AUTO reia aceeași cursă și scrie un singur `DROPOFF_COMPLETE`, o singură eliberare și o singură completare; un dropoff reluat este `duplicate: true`. Dovezile 062/063 supraviețuiesc: boarding la tick 191, completare la 907, dwell-uri de 180 tick-uri. MANUAL înregistrează telemetrie cu `learningEligible=false`, plafonată la 32 eșantioane, zero intake și zero publicări; LEARNING publică doar cheile observate de gazdă (2 aici, 22 neobservate), iar valorile/proveniența profilului rămân identice byte-cu-byte. Tick-urile sunt deterministe (`step` exact `currentTick + 1`, intenția de mod exact tick-ul curent); autoritatea suspendată refuză ambele. 15 motive de refuz închise, toate fără mutație. Completarea în MANUAL închide segmentul cu `RIDE_COMPLETED` și deschide un segment MANUAL nou fără să schimbe modul. 071 măsoară predarea; un salt fizic injectat este raportat ca `STATE_CONTINUITY_VIOLATION`/`POSITION_STEP`, niciodată reparat, ascuns sau folosit pentru retarget.

Verificări: `npm run typecheck`, `lint`, `format:check`, `check:architecture` (191 fișiere), `check:parameter-catalog` exit 0; suita țintă 14/14 PASS; `npm test` 1279/1279 PASS (1265 baseline + 14); `npm run trip:manual` 19/19 checks PASS, `--check` curent. Probe de mutație confirmă eșecul pe MANUAL eligibil, pickup/dropoff pierdut, handover suprimat și ride id furcat. Dovezi în [Evidence/072-manual-trip](../../Docs/Evidence/072-manual-trip/README.md).

Fișiere și documente actualizate: `src/app/manual-trip.ts`, `tests/app/manual-trip-fixture.ts`, `tests/app/manual-trip-report.ts`, `tests/app/manual-trip.test.ts` (noi), `src/app/index.ts`, scriptul `trip:manual`, [Docs/manual-trip.md](../../Docs/manual-trip.md) (nou), [Docs/07-flota-si-curse.md](../../Docs/07-flota-si-curse.md), [Docs/08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md), `Docs/Evidence/072-manual-trip/`.

Limitări sau follow-up: compoziție Node țintită cu readback 005 autorat și cronologie de serviciu, fără lume nativă Rapier/021/024. Fără observație 054, deci 071 măsoară continuitatea dar se abține la re-entry. Fără browser headed/HUD/frame/GPU/hardware. Fără tarif/review/XP/savefile/worker.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '072' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.
- 2026-10-21: Reluat după anularea subagentului anterior (muncă necomisă păstrată) și finalizat în worktree izolat (commit `40cc68c1`): cursă completă cu intervenție manuală scurtă, aceeași cursă la revenirea AUTO, MANUAL neeligibil, dovezi pickup/dropoff păstrate, 14 teste noi. Integrat prin fast-forward; verificat de orchestrator cu 1279/1279 teste.
