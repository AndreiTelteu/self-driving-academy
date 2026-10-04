---
id: "002"
title: "Structură modulară și reguli de dependență"
status: "Done"
release: "V1"
module: "Fundație"
depends_on: ["001"]
owner: "Codex /root/pbi002_layout"
started_at: "2026-10-04T23:55:56.2403667+03:00"
completed_at: "2026-10-05T00:04:48.3266559+03:00"
---

# 002 Structură modulară și reguli de dependență

## Obiectiv

Creează modulele proiectului și entry points pentru servicii și adaptoare.

## Context și plan

[02-arhitectura-si-contracte.md](../../Docs/02-arhitectura-si-contracte.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 001 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Simularea nu importă UI sau clase Babylon pentru regulile domeniului.
- [x] Rendererul și persistence folosesc contracte publice, fără acces mutabil direct la profil.

## Verificare

Verifică importurile și un exemplu de injecție a rendererului.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: entry points pentru toate modulele planificate; composition root și lifecycle cu renderer/store injectate; simulare fără Babylon/DOM; snapshot/profil readonly și înghețate la runtime; store volatil cu copiere defensivă.

Verificări executate și rezultat: npm run check — exit 0 (typecheck, lint, format:check, arhitectură); npm run build — exit 0; 23 fișiere TypeScript și 6 probe negative de import; exemplu real de injecție renderer, freeze/copie profil și persistence, lifecycle. Browser preview 4173 reîncărcat: bundle index-CBrWRo2K.js, un heading și un status, textul bootstrap corect. Validate-Board.ps1 -RequireDone '002' după mutarea fizică — exit 0, Valid true, Total 235, Done 2, In Progress 1, To Do 232, RequiredDonePaths conține numai PBI/Done/002-layout.md. Rezultate exacte și limite în [dovezi](../../Docs/Evidence/002-layout-validation.md).

Fișiere și documente actualizate: src/main.ts; src/app, simulation, profiles, rendering/babylon, rendering, ui, persistence și entry points ale modulelor viitoare; scripts/verify-architecture.mjs; Docs/02-arhitectura-si-contracte.md; Docs/module-layout.md; Docs/Evidence/002-layout-validation.md. Scriptul npm check:architecture este integrat de PBI 003.

Limitări sau follow-up: modulele viitoare au entry points rezervate; contractele complete aparțin 005, backendul GPU 011, persistența durabilă PBI-urilor dedicate. Nu există gameplay, tick loop sau IndexedDB în scope-ul 002. Node stripTypeScriptTypes emite avertisment experimental cu exit 0; avertismentul npm msvs-version provine din mediu.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '002' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-05T00:04:48.3266559+03:00: Implementare/verificări finalizate; npm run check repetat după npm ci — exit 0. Mutare fizică în Done, urmată de validarea obligatorie.
