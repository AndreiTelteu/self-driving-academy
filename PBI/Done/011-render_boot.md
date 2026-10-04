---
id: "011"
title: "Bootstrap Babylon WebGPU și WebGL 2"
status: "Done"
release: "V1"
module: "Babylon"
depends_on: ["001","009"]
owner: "Codex gpt-6.1-sol / PBI011 implementation"
started_at: "2026-10-05T00:44:54.9548776+03:00"
completed_at: "2026-10-05T00:59:44.2861239+03:00"
performance_checks: ["loading", "memory"]
---

# 011 Bootstrap Babylon WebGPU și WebGL 2

## Obiectiv

Implementează createRenderingBackend și inițializarea asincronă cu cleanup la eșec.

## Context și plan

[03-babylon-engine.md](../../Docs/03-babylon-engine.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 001 trebuie să existe în Done înainte de începere.
- PBI 009 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] WebGPU este preferat; lipsa sau eșecul lui conduce la WebGL 2 verificat.
- [x] Eșecul ambelor backenduri produce o stare de eroare recuperabilă.

## Verificare

Testează succes WebGPU, indisponibilitate, init eșuat și fallback real.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: createRenderingBackend asincron cu WebGPU preferat, fallback pe context WebGL2 și versiune efectivă verificate, canvas nou/scenă reconstruită per tentativă, cleanup inclusiv init parțial, render/resize/dispose; lifecycle LOADING/READY/ERROR și retry accesibil.

Verificări executate și rezultat: npm run check PASS (87 teste, 11 rendering), npm run build PASS, git diff --check PASS; T3 preview WebGPU și WebGL2 reale, 20 cicluri/backend fără retenție de engine/scenă, faults injectate și retry cu click real PASS. Baseline/final și cost nou loading/memory în Docs/Evidence/011-render-boot/dovezi.txt, JSON și loguri exacte. Validate-Board și Validate-Plan PASS. Rezultatul RequireDone 011 după mutare: board-final.txt.

Fișiere și documente actualizate: src/rendering/**, src/app/**, src/main.ts, src/ui/**, src/style.css, tests/rendering/**, tests/browser/rendering/**, Docs/rendering-backend.md, contractul implementat Docs03, PBI011 și Docs/Evidence/011-render-boot/**. Fișierele parent nu au fost editate de agent.

Limitări sau follow-up: Fără gameplay, camere de vehicul, asset registry, export UI sau device-loss session recovery. Memoria GPU exactă și bugetele/FPS hardware nu sunt măsurate; heap aproximativ și cache diferit sunt raportate explicit. Cost nou: o scenă/engine/cameră, zero meshes/textures, cleanup la baseline după 20 cicluri. Pragurile sunt provizorii până la 203. Detalii și avertismentul bundle în dovezi.txt.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '011' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.


- 2026-10-05T00:59:44.2861239+03:00: Implementare și probe reale/injectate executate; mutare fizică în Done și RequireDone 011 conform logului final.



- 2026-10-05T01:02:26.4011557+03:00: Validare integrată de părinte pentru lotul 007/010/011: npm run check PASS (87 teste), npm run build PASS; Validate-Board -RequireDone 007,010,011 și Validate-Plan PASS. Loguri: Docs/Evidence/011-render-boot/integration-check.txt și integration-build.txt. Avertismentul Vite pentru bundle >500 kB rămâne documentat, fără suprimare.
