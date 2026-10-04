---
id: "001"
title: "Inițializare proiect TypeScript Vite și Babylon.js"
status: "Done"
release: "V1"
module: "Fundație"
depends_on: []
owner: "Codex gpt-6.1-sol / pbi001_bootstrap"
started_at: "2026-10-04T23:49:51.3547909+03:00"
completed_at: "2026-10-04T23:54:25.2713221+03:00"
---

# 001 Inițializare proiect TypeScript Vite și Babylon.js

## Obiectiv

Creează aplicația browser, scripturile de dezvoltare și build, pachetele ES modules Babylon și lockfile-ul.

## Context și plan

[02-arhitectura-si-contracte.md](../../Docs/02-arhitectura-si-contracte.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- Nu există dependențe de implementare. Acesta este primul task disponibil.

## Criterii de acceptare

- [x] Aplicația pornește local și buildul de producție este reproductibil din lockfile.
- [x] Versiunile runtime și comenzile sunt documentate; nu există dependență de CDN neversionat.

## Verificare

Instalare curată și pornire în browser, apoi build de producție.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Aplicație browser TypeScript/Vite cu intrare HTML ES module, import real Babylon Engine.Version, core/loaders versionate și package-lock.json. Scripturi dev/build/preview și versiuni runtime documentate. Bootstrapul afișează statusul și versiunea Babylon, fără inițializarea scenei sau gameplay.

Verificări executate și rezultat: npm install și npm ci exit 0 (20 pachete, 0 vulnerabilități); npm run build exit 0 (TypeScript și Vite); al doilea build a produs aceleași 22 fișiere cu SHA256 identice; npm ls --depth=0 și git diff --check exit 0. Browser real T3 tab_1 verificat pe dev 5173 și producție 4173: titlu, Bootstrap pregătit, Babylon.js 9.29.0; console fără erori, resurse producție exclusiv locale. [Raport și capturi](../../Docs/Evidence/001-bootstrap/verification.md). Validator la început: Valid true, 235 total, 234 To Do / 1 In Progress / 0 Done.

Fișiere și documente actualizate: package.json, package-lock.json, tsconfig.json, .node-version, index.html, src/main.ts, src/style.css, README.md, Docs/README.md, Docs/02-arhitectura-si-contracte.md, Docs/Evidence/001-bootstrap/verification.md și capturile dev.png/production.png; acest PBI.

Limitări sau follow-up: Niciuna pentru scope-ul bootstrapului. Backendul GPU/scena sunt în 011-render_boot; loaderul este instalat, integrarea asseturilor va fi verificată în PBI-urile ei. npm avertizează despre msvs-version din mediul gazdă, fără efect asupra comenzilor trecute.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '001' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-04: Codex gpt-6.1-sol a început implementarea după citirea workflow-ului și modulelor 02/03; mutare fizică în In Progress și validator trecut.
- 2026-10-04: Bootstrap implementat; instalare curată, build reproductibil și browser dev/producție verificate. Capturi și raport păstrate în Docs/Evidence/001-bootstrap.
- 2026-10-04: Mutat fizic în Done, checklist complet; Validate-Board.ps1 -RequireDone '001' exit 0, Valid true, 235 total, 234 To Do / 0 In Progress / 1 Done, RequiredDonePaths conține numai PBI/Done/001-bootstrap.md.
