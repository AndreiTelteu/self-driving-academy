---
id: "012"
title: "Stările aplicației și lifecycle"
status: "Done"
release: "V1"
module: "Babylon"
depends_on: ["011","008"]
owner: "Codex /root/pbi012"
started_at: "2026-10-05T02:51:04.5721167+03:00"
completed_at: "2026-10-05T02:58:20.6864173+03:00"
performance_checks: ["frame", "simulation", "memory", "loading", "ui"]
---

# 012 Stările aplicației și lifecycle

## Obiectiv

Implementează loading, ready, playing, paused, error și disposal.

## Context și plan

[03-babylon-engine.md](../../Docs/03-babylon-engine.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 011 trebuie să existe în Done înainte de începere.
- PBI 008 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Doar starea playing avansează tick-urile; UI rămâne funcțional în pauză.
- [x] Reîncărcarea nu dublează bucle sau listeners.

## Verificare

Verifică start, pauză, resume, eroare și două încărcări succesive.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: owner unic pentru backend Babylon, RAF, buclă fixă 60Hz și resize/visibility; LOADING/READY/PLAYING/PAUSED/ERROR/DISPOSED, controale bootstrap și port present frozen.

Verificări executate și rezultat: 7 teste lifecycle PASS; typecheck/lint/architecture/npm test/build PASS; Prettier pe toate fișierele 012 PASS. Browser T3: bootstrap WebGPU și fixture WebGL2, start/pause/resume, două reloaduri, eroare/retry; RAF1/listeners2 după reload și RAF0/listeners0 la eroare. Baseline+cost CPU măsurate: p95 median lifecycle 0.0026ms în fixture compact. Detalii și capturi: Docs/Evidence/012-app-lifecycle/verification.md. Validatorul final este salvat în Docs/Evidence/012-app-lifecycle/board-validation.json.

Fișiere și documente actualizate: src/app/application-lifecycle.ts, src/app/index.ts, src/main.ts, src/ui/rendering-view.ts; tests/app/lifecycle.test.ts, tests/browser/app-lifecycle/*; scripts/benchmark-app-lifecycle.mjs; Docs/app-lifecycle.md, Docs/Evidence/012-app-lifecycle/* și acest PBI.

Limitări sau follow-up: bootstrap numără tick-uri fără fizică/gameplay. Probele CPU nu închid gate hardware/FPS/soak. Device loss/checkpoint/export rămân pentru contractele ulterioare. Global format:check a detectat fișiere 015 în lucru; toate fișierele 012 trec. Integrarea linkurilor în documentele comune și verificarea globală finală aparțin parentului.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '012' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.


- 2026-10-05T02:58:20.6889129+03:00: lifecycle implementat și verificat; probe CPU și browser păstrate; tranziție fizică în Done urmată de RequireDone 012.



- 2026-10-05T02:59:06.5578591+03:00: Validare integrată de părinte: npm run check PASS (172 teste), npm run build PASS; Validate-Board -RequireDone 012 PASS. Logurile integration-check.txt/integration-build.txt sunt în Evidence/012-app-lifecycle. Avertismentul bundle Vite >500 kB rămâne documentat.
