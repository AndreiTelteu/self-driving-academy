---
id: "025"
title: "Input de tastatură și filtrare"
status: "Done"
release: "V1"
module: "Vehicule și fizică"
depends_on: ["024","009"]
performance_checks: ["simulation","memory"]
owner: "Codex gpt-6.1-sol medium keyboard-input-01"
started_at: "2026-10-05T15:08:52.522Z"
completed_at: "2026-10-05T18:13:17.678Z"
---

# 025 Input de tastatură și filtrare

## Obiectiv

Implementează W/S/A/D, revenirea direcției și sensibilitatea la viteză.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) guvernează costul filtrării per tick și retenția inputului; baseline-ul disponibil se păstrează înaintea algoritmului nou.

- [27-reglaje-hud-si-camera.md](../../Docs/27-reglaje-hud-si-camera.md)

[05-vehicule-si-fizica.md](../../Docs/05-vehicule-si-fizica.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 024 trebuie să existe în Done înainte de începere.
- PBI 009 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Inputul brut și comanda filtrată sunt disponibile separat.
- [x] Pierderea focusului eliberează comenzile fără tastă rămasă activă.

- [x] Filtrarea are ControlPreferences versionat cu limite calibrate, pregătit pentru popup-ul 229; input brut/comandă efectivă rămân distincte.

## Verificare

Testează apăsare, menținere, eliberare, focus și viteză mare.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Input PLAYER W/S/A/D, Space și Q/E prin portul comun024, cu raw/held/comandă filtrată distincte la60Hz. Maparea025-keyboard-v1 este calibrată pe sedan/compact și cere upgrade explicit pentru provisional-v1. Adaptorul DOM bounded eliberează imediat comenzile la blur/visibility/editable/dialog și elimină șase listeners la dispose. Modificările sunt integrate în main; popup229 și marșarier027 rămân scope separat.

Verificări executate: 22 teste semantice ale implementării și calibrare nativă6scenarii PASS; full npm run check pe integrarea219+025 PASS429/429 teste, typecheck/lint/format/architecture PASS. BEFORE cronologic10lumi Rapier hash a0ef628dc98484a7e4161a64ef442ab45ffc02afe8d71210cf7161c8ff46d151; AFTER10lumi21f9f003cbd2939505305de4b9a221b89db5e2d4d6ae59a5ee89c3b27497d9b6 păstrează exact fizica implicită. Calibrare2bcb9efaafffc7669705a1e510b5c911f5b69455058a8c38c5479fae9dfecef5; throttle60/20/12ticks, brake31/11/7, revenire48/15/7. P95 diagnostic tickON înainte1.9243ms/după1.8374ms, filtru incremental0.0079ms; fără afirmație de optimizare ori FPS.

Browser manual real Chrome154 AMD WebGPU și WebGL2 PASS: ambele clase660ticks (~11s/clasă),1920×1080CSS/intern,DPR1,foreground,zerooverload; focus/editable/blur/resume verificate. Toate tastele W/S/A/D trusted,6eliberări și2apăsări în editable, raw și filtered observate la tick. Încercarea incompletă cu taste native scurte și blocajele URL sunt păstrate; utilizatorul a executat menținerea fizică finală. Verifier current/historical PASS în checkout-ul capturii; strict historical și auditul indexului Git integrat107/107 PASS în main, cu diferența EOL explicită de mai jos; source-at-capture f8664f09aff9d010b99b6af0e1a601d1ed07f390c42e767519342d8fceecbe48. [Dovezi](../../Docs/Evidence/025-keyboard-input/README.md), [contract](../../Docs/keyboard-input.md).

Fișiere: src/settings/control-mapping.ts și contracte/store, src/vehicles/keyboard-filter.ts, src/input/keyboard-drive.ts, exports, teste/fixture și Docs/runtime-settings.md/keyboard-input.md/module05/module27/README. Commit implementare izolat c771a342e56ca08c9b46934eaad1cd1e96dca1b0; integrare parent serială fără pierderea arhivelor byte-exact.

Limitări: SinglePLAYER cu70mașini în proba CPU, calibrare pe două clase și fixture browser disponibil. Nu validează FPS-ul flotei complete, heap-ul total, hardware laptop, reverse027, popup229 sau learning. Ratele reprezintă asistența inputului, fără schimbarea mecanicii vehiculului. Arhivele păstrează bytes și probele istorice219 rămân verificabile după integrare.
## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '025' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.5 actualizează scope-ul și verificările; implementarea rămâne în To Do.

- 2026-10-05T18:08:52.1354391+03:00: Scope simulation/memory adăugat înaintea filtrării per tick și listenerilor input. Dependențele 024/009 sunt Done; implementare izolată de captura hardware 219.

- Reluare cu același subagent: AUTO protocol DOM pe ambele clase PASS. API sky permite doar apăsări scurte; două încercări native au fost respinse de gate-ul neschimbat de input trusted menținut. Dovezi browser-native-taps-incomplete.json în worktree. Este necesar input fizic menținut manual pe AUTO și WEBGL2; fără Done. Slotul browser a fost eliberat către 219.

- Verificare integrare: npm run check429/429 PASS. Gate-ul current-source strict a oprit finalizarea din cauza checkout-ului CRLF al Docs/performance-budgets.json (279CR suplimentare față de captura LF). Audit107rânduri:105byte-exact și2rânduri pentru același buget diferă doar EOL; toate107blobs din indexul Git sunt byte-exact cu arhivele, fără diferențe semantice. Verifierul original rămâne neschimbat; acceptarea folosește arhivele istorice strict verificate și audit separat al sursei integrate.
