---
id: "077"
title: "Panou profil valori și dovezi"
status: "Done"
release: "V1"
module: "Interfață"
depends_on: ["073"]
owner: "opencode deepseek-v4.1-flash profile-panel-01"
started_at: "2026-10-21T00:14:47.731Z"
completed_at: "2026-10-21T04:13:02+03:00"
---

# 077 Panou profil valori și dovezi

## Obiectiv

Construiește UI pentru schema profilului, stări neobservate și delte.

## Context și plan

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 073 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Datele illustrative sunt marcate până la integrarea serviciului de profiluri.
- [x] Cheile rezervate nu sunt afișate ca deja învățabile.

## Verificare

Verifică neobservat, valoare zero, incertitudine și cheie R.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Panoul 077 afișează schema reală a catalogului de 80 de parametri, grupată pe categorii, cu valoarea curentă, unitatea, sursa, numărul de dovezi, calitatea și incertitudinea. Un parametru neobservat are `value:null` și textul „Neobservat”, niciodată `0`; o valoare zero reală este `OBSERVED` și se afișează „0”. Cheile R (`implemented:false`) rămân mereu `RESERVED`, cu valoare ascunsă, `learnable:false` și textul „Rezervat · neînvățabil V1”, chiar dacă un record ar conține un număr pentru ele, și sunt excluse din deltele învățate. Fără un profil publicat, panoul folosește valorile implicite reale ale catalogului și afișează bannerul „Date ilustrative — serviciul de profiluri nu a publicat încă o versiune” plus insigna ILUSTRATIV; cu un `DrivingProfile` real, bannerul dispare și apare PUBLICAT. Delta arată baza, cheia, valoarea anterioară și cea nouă, motivul și dovezile, cu respingere pentru bază străină, cheie necunoscută sau valoare neconformă.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (206 fișiere TypeScript, probe negative 6+4+3 PASS); `npm test` 1349/1349 pass, 0 fail; `npm run profile:panel` 51/51 verificări, 7 scenarii, overall PASS; `npm run profile:panel -- --check` „Profile panel report is current”. Raportul acoperă neobservat, zero, incertitudine, o cheie R, un delta, ilustrativ versus publicat și 60 de cadre plafonate. Dovezi: [report.json](../../Docs/Evidence/077-profile-panel/report.json), [report.md](../../Docs/Evidence/077-profile-panel/report.md), [README](../../Docs/Evidence/077-profile-panel/README.md).

Fișiere și documente actualizate: `src/ui/profile-panel-format.ts`, `src/ui/profile-panel.ts`, `src/app/profile-panel.ts`, `src/ui/index.ts`, `src/app/index.ts`, `src/style.css`, `tests/ui/profile-panel-fixture.ts`, `tests/ui/profile-panel.test.ts`, `tests/app/profile-panel-report.ts`, `scripts/run-profile-panel-report.mjs`, `package.json`, `Docs/profile-panel.md`, `Docs/08-interfata-camera-si-control.md`, `Docs/README.md` și `Docs/Evidence/077-profile-panel/`.

Limitări sau follow-up: Hostul de publicare live nu este încă legat; `readProfilePanelSnapshot` este seam-ul pregătit, iar contextul local implicit este documentat și se poate suprascrie până la integrarea 110/112. Compunerea citește un `DrivingProfile`; un `ProfileVersion` 109 simplu nu are harta de dovezi și trebuie îmbogățit de host sau așteaptă granița de publicare 110. Catalogul este injectat pentru a păstra regulile de arhitectură, iar compunerea reală folosește catalogul real. Nu se pretinde captură browser, FPS sau hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '077' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-21: Implementare finalizată: contract strict pentru valori/incertitudine/delte, marcaj ilustrativ explicit, chei R blocate ca rezervate, 15 teste, raport cu 51 de verificări și documentație; mutat fizic în Done după validare.
