---
id: "271"
title: "Cele trei moduri live: AUTO, MANUAL, LEARNING și toate tranzițiile"
status: "Done"
release: "V1"
module: "Moduri și learning"
depends_on: ["260","263"]
performance_checks: ["simulation","frame"]
owner: "loop-pbi/deepseek-271"
started_at: "2026-11-27T00:18:11.392Z"
completed_at: "2026-11-27T02:06:02.675Z"
---

# 271 Cele trei moduri live: AUTO, MANUAL, LEARNING și toate tranzițiile

## Obiectiv

Jucătorul comută între AUTO, MANUAL și LEARNING cu `M`/`L`, iar fiecare tranziție deschide sau închide segmentul corect, fără teleport și fără gol de input.

## Starea actuală și ce lipsește

- `applyVehicleMode` acceptă numai `AUTO` și `MANUAL`; nu există `L` sau `LEARNING`.
- Segmentele live sunt 198 de walking/takeover, nu 069 de intervenție la volan.
- Intrarea în mașină forțează `MANUAL`; nu există eligibilitate sau segment LEARNING.
- Nu există păstrarea rutei/cursei la tranziție și nici reluarea stării fizice la AUTO.
- Nu există raport de continuitate, autoritate unică sau verificare de tick pentru cele șase tranziții.
- Nu există HUD cu textele și simbolurile AUTO/MANUAL/LEARNING.

## Context și plan

- [Interfață, cameră și control](../../Docs/08-interfata-camera-si-control.md)
- [Învățarea stilului](../../Docs/10-invatarea-stilului.md)
- [Comenzile de mod](../../Docs/mode-controls.md)
- [Integrarea celor trei moduri](../../Docs/three-modes.md)
- [Cursa completă și intervenția](../../Docs/manual-trip.md)
- [Continuitatea la preluare](../../Docs/takeover-continuity.md)
- [Autoritatea de control](../../Docs/control-authority.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 260 trebuie să fie Done înainte de începere.
- 263 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [x] Toate cele șase tranziții AUTO/MANUAL/LEARNING funcționează din tastele reale și din butoanele HUD.
- [x] AUTO → MANUAL/LEARNING deschide un segment cu mod, eligibilitate, poziție, rută, clasă și profil.
- [x] MANUAL ↔ LEARNING închide și deschide segmentul la același tick, fără salt fizic sau gol de input.
- [x] LEARNING → AUTO închide segmentul și permite pipeline-ului să decidă; MANUAL nu produce job.
- [x] Maximum un scaun `PLAYER` există la orice tick, iar un vehicul părăsit revine în AUTO cu ruta/cursea păstrată.
- [x] Pauza, focusul și reload-ul nu creează segmente orfane sau comenzi ținute.

## Verificare

- Matricea celor șase tranziții pe taxi și civil, în Node și browser.
- Verifică poziția, viteza, yaw-ul și ruta înainte/după fiecare tranziție.
- Verifică numărul de segmente, joburi și scaune `PLAYER`.

## Dovezi de finalizare

Rezultat implementare: `src/app/live-three-modes.ts` (`271-live-three-modes-v1`) deține segmentele 069 peste compunerea V3: toate cele șase tranziții AUTO/MANUAL/LEARNING pentru taxi și civil, deschise/închise la tick-ul acceptat, cu mod, eligibilitate, poziție, rută, clasă și profil. `M`/`L` sunt pliate în planul per tick din `walking-composition.ts`, cu un singur scaun `PLAYER`, continuitate de poziție/viteză/yaw și reluare AUTO din starea fizică curentă. LEARNING expune descriptori pentru 272 fără să publice profil; MANUAL nu produce intake. HUD-ul afișează etichetele cerute, iar butonul live LEARNING este activ în panoul de flotă. Pauza, focusul și reload-ul nu inventează tick-uri și nu lasă segmente orfane sau comenzi ținute.

Verificări executate și rezultat: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:architecture` (469 fișiere), `npm run composition:report -- --check`, `npm run docs:check -- --check`, `npm run modes:live -- --check` — PASS după eliminarea unei variabile nefolosite din scriptul de probe. Teste țintă 13/13. `npm test` integrat: 3.704 teste, 3.690 pass, 0 fail, 14 skip-uri istorice. Raport `modes:live` 12/12: șase tranziții pe taxi și șase pe civil, 4 segmente LEARNING expuse, 0 publicări de profil, 0 eșecuri; tick-uri de închidere/deschidere, motive, eligibilitate, context, un singur scaun `PLAYER`, continuitate poziție/viteză/yaw. Browser probe 11/11 PASS, Chrome 157 / WEBGL2, 1440×900: taxi real selectat din panoul de flotă, taste reale `M`/`L`, buton HUD `L`, etichete corecte; capturi în `Docs/Evidence/271-live-three-modes/screenshots/`.

Fișiere și documente actualizate: `src/app/live-three-modes.ts`, `src/app/walking-composition.ts`, `src/app/vehicle-auto-drive.ts`, `src/main.ts`, `src/ui/rendering-view.ts`, `src/ui/fleet-selection-panel.ts`, `src/rendering/babylon/v3-browser-composition.ts`, `src/style.css`, tests app, `scripts/run-live-three-modes-report.mjs`, `scripts/run-live-three-modes-probe.mjs`, `package.json`, `Docs/08`, `Docs/21`, `Docs/26`, `Docs/31`, `Docs/README.md`, `Docs/game-shell.md`, `Docs/live-fleet-selection.md`, `Docs/mode-controls.md`, `Docs/three-modes.md`, `Docs/Evidence/271-live-three-modes/`.

Limitări sau follow-up: Intrarea/ieșirea cu `G` rămâne calea 195/196/198 și nu creează un segment 069 separat. AUTO reia exact pe primul tick, dar reproiectarea completă pe bandă/off-lane rămâne 054/282. Capacitatea ciclului 069 este 64 de segmente per sesiune. Telemetria 272, pipeline-ul de learning 273 și setările 279 rămân separate. Browser probe folosește Chrome 157 / WEBGL2, fără pretenție FPS/GPU/hardware. Node local 24.19.0.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '271'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
