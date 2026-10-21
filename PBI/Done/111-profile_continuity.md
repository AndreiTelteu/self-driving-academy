---
id: "111"
title: "Manevre în curs și profil publicat"
status: "Done"
release: "V1"
module: "Profiluri"
depends_on: ["110","053","050","066"]
owner: "opencode deepseek-v4.1-flash profile-continuity-01"
started_at: "2026-10-21T16:25:40.376Z"
completed_at: "2026-10-21T19:49:41+03:00"
---

# 111 Manevre în curs și profil publicat

## Obiectiv

Păstrează continuitatea manevrei și prioritatea comenzilor manuale.

## Context și plan

[12-profiluri-si-propagare.md](../../Docs/12-profiluri-si-propagare.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 110 trebuie să existe în Done înainte de începere.
- PBI 053 trebuie să existe în Done înainte de începere.
- PBI 050 trebuie să existe în Done înainte de începere.
- PBI 066 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Publicarea nu resetează viteză sau poziție.
- [x] Oportunitatea deja evaluată nu este reeșantionată după activare.

## Verificare

Testează activare în viraj, schimbare de bandă și la roșu.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Garda `111-profile-continuity-v1` compară snapshotul manevrei înainte și după activarea 110 și permite să difere exclusiv `appliedProfileVersion` și `tick`; poziția, viteza, headingul, `controlMode`, starea schimbării de bandă, oportunitatea de semafor și comanda manuală ținută sunt comparate cu egalitate exactă (`Object.is`, toleranță 0). O schimbare de bandă în curs își păstrează faza, ținta, tick-ul de start, progresul și cooldown-ul; anularea, repornirea sau modificarea progresului este `LANE_CHANGE_CANCELLED`. `OpportunityDecisionMemo` este cheiat pe `vehicleId + opportunityId + occurrence`, exclude tick-ul și versiunea, eșantionează o singură dată și returnează decizia cache și după activare; o oportunitate nouă este miss și folosește versiunea nouă. Seat-ul `PLAYER`, modul și comanda ținută sunt read-only; orice modificare este `MANUAL_COMMAND_OVERRIDDEN`, iar activarea nu este takeover. Violările sunt închise (`POSITION_CHANGED`, `SPEED_CHANGED`, `HEADING_CHANGED`, `CONTROL_MODE_CHANGED`, `LANE_CHANGE_CANCELLED`, `MANUAL_COMMAND_OVERRIDDEN`, `OPPORTUNITY_RESAMPLED`, `VERSION_NOT_APPLIED`) și nu sunt reparate silențios: rezultatul este `BLOCKED` cu raportul 110 real păstrat. Sunt acoperite activarea în viraj, în schimbarea de bandă și la roșu, inclusiv proba că o oportunitate nouă folosește versiunea nouă.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (242 fișiere TypeScript, probe negative 6+4+3 PASS); `npm test` 1643/1643 pass, 0 fail; `npm run profile:continuity` 45/45 verificări, 7 scenarii, overall PASS; `npm run profile:continuity -- --check` „Profile continuity report is current”. Testele țintite 111: 21/21 pass (11 fleet + 10 app). Raportul acoperă virajul, schimbarea de bandă, oportunitatea de roșu cache-uită, oportunitatea nouă, prioritatea manuală, resetarea injectată a vitezei și 60 de cadre fără drift. Dovezi: [report.json](../../Docs/Evidence/111-profile-continuity/report.json), [report.md](../../Docs/Evidence/111-profile-continuity/report.md), [README](../../Docs/Evidence/111-profile-continuity/README.md).

Fișiere și documente actualizate: `src/fleet/profile-continuity.ts`, `src/app/profile-continuity.ts`, `src/fleet/index.ts`, `src/app/index.ts`, `tests/fleet/profile-continuity.test.ts`, `tests/app/profile-continuity.test.ts`, `tests/app/profile-continuity-fixture.ts`, `tests/app/profile-continuity-report.ts`, `scripts/run-profile-continuity-report.mjs`, `package.json`, `Docs/profile-continuity.md`, `Docs/12-profiluri-si-propagare.md`, `Docs/profile-activation.md`, `Docs/README.md` și `Docs/Evidence/111-profile-continuity/`.

Limitări sau follow-up: Citirea mișcării este un port SI injectat (aceeași convenție ca 047), fără fixture fizic Babylon/Rapier sau captură browser. Egalitatea este exactă pentru float-uri, deci o variație legitimă între citiri ar fi raportată ca violare, nu tolerată. Memo-ul este doar în memorie; după evicția FIFO o oportunitate foarte veche ar fi eșantionată din nou. `BLOCKED` nu anulează scrierile 110 deja aplicate; raportul real este păstrat. Nu este injectat un profile store, deci „store neatins” este structural, nu verificat prin checksum.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '111' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-21: Implementare finalizată: snapshot de continuitate cu egalitate exactă, memo de oportunități fără reeșantionare după activare, prioritate manuală păstrată, violări închise fără reparare silențioasă; 21 teste, raport cu 45 de verificări și documentație. Mutat fizic în Done după validare.
