---
id: "147"
title: "Pasageri simplificați și markers"
status: "Done"
release: "V1"
module: "Asseturi și audio"
depends_on: ["062","063","015"]
owner: "opencode deepseek-v4.1-flash passenger-visual-01"
started_at: "2026-10-21T19:07:22.358Z"
completed_at: "2026-10-21T22:25:46+03:00"
---

# 147 Pasageri simplificați și markers

## Obiectiv

Reprezintă pickup/dropoff și ocuparea mașinii.

## Context și plan

[16-asseturi-vizual-si-audio.md](../../Docs/16-asseturi-vizual-si-audio.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 062 trebuie să existe în Done înainte de începere.
- PBI 063 trebuie să existe în Done înainte de începere.
- PBI 015 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Starea vizuală urmează cursa și nu declanșează ea însăși finalizarea.
- [x] Pasagerii simpli V1 nu generează dovezi fictive de pietoni în trafic.

## Verificare

Testează serviciu complet și reset de cursă.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Contractul `147-passenger-visual-v1` proiectează starea pasagerului exclusiv din cursa 061: `TO_PICKUP` → `WAITING_PICKUP` cu marker pickup, `PICKUP` → `BOARDING` cu pasager vizibil la pickup dar ocupare 0, `TO_DROPOFF` → `ONBOARD` cu ocupare 1 și marker dropoff, `DROPOFF` → `DROPPING_OFF`, iar cursa terminală, absentă sau străină → `NONE`, ocupare 0, fără markere rămase. Markerii poartă `zoneId` real 032 și poziția exactă a `anchorNodeId`; o zonă sau ancoră lipsă omite markerul cu `ZONE_MISSING`/`ANCHOR_MISSING`, niciodată cu o coordonată inventată. Identitatea markerului este `rideId + role`, schimbarea fazei elimină doar rolurile stale, cadrele identice nu scriu nimic, iar cadrele malformate/în urmă sunt respinse înainte de orice comandă. Presenterul consumă doar un port de patru metode (`setMarker`, `removeMarker`, `setPassengerVisible`, `clear`) și nu creează mesh-uri, nu atinge starea cursei și nu emite evenimente. Bridge-ul nu are port de dispatcher/pickup/dropoff/telemetry, nu apelează `begin`/`apply`/`advance`/`reset` și nu finalizează cursa; doar un `DROPOFF_COMPLETE` explicit 063 o face. `pedestrianActors: 0` și nicio dovadă de pieton nu este creată — V1 este doar reprezentare de marker/ocupare, pietonii rămân V2. Resetul terminal și `lifecycle.reset` golesc ocupanța și markerele.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (249 fișiere TypeScript, probe negative 6+4+3 PASS); `npm test` 1720/1720 pass, 0 fail; `npm run passenger:visual` 40/40 verificări, 7 scenarii, overall PASS; `npm run passenger:visual -- --check` „Passenger visual report is current”. Testele țintite 147: 16/16 pass (8 UI + 8 app). Raportul acoperă waiting, boarding, onboard, dropping off, completed/reset, taxi mixt și ancoră lipsă. Dovezi: [report.json](../../Docs/Evidence/147-passenger-visual/report.json), [report.md](../../Docs/Evidence/147-passenger-visual/report.md), [README](../../Docs/Evidence/147-passenger-visual/README.md).

Fișiere și documente actualizate: `src/ui/passenger-visual-format.ts`, `src/ui/passenger-visual.ts`, `src/app/passenger-visual.ts`, `src/ui/index.ts`, `src/app/index.ts`, `tests/ui/passenger-visual-fixture.ts`, `tests/ui/passenger-visual.test.ts`, `tests/app/passenger-visual.test.ts`, `tests/app/passenger-visual-report.ts`, `scripts/run-passenger-visual-report.mjs`, `package.json`, `Docs/passenger-visual.md`, `Docs/16-asseturi-vizual-si-audio.md`, `Docs/README.md` și `Docs/Evidence/147-passenger-visual/`.

Limitări sau follow-up: Nu există captură browser, screenshot sau pretenție de asset 3D final; verificarea este funcțională/deterministă, nu o certificare vizuală a unui mesh de pasager. V1 este doar marker/ocupare; nu creează actori pietoni, actori de trafic sau dovezi de pieton (V2 deține pietonii). Nu se pretinde FPS/GPU/memorie și nu se închide niciun gate de performanță. `worldEpoch` nu este deținut de 147; implicit 0 și poate fi furnizat de composition root. Hostul Babylon live trebuie să implementeze portul de markeri cu cele patru metode; aici sunt exercitate doar presenterul de comenzi și portul înregistrat.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '147' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-21: Implementare finalizată: proiecție pură a fazei/ocupanței din 061, markere pe ancore reale 032, reset fără markere stale, presenter fără efecte secundare și zero dovezi de pieton; 16 teste, raport cu 40 de verificări și documentație. Mutat fizic în Done după validare.
