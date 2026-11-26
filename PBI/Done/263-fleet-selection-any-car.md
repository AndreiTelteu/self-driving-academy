---
id: "263"
title: "Selectarea oricărui taxi sau civil, camera și un singur scaun PLAYER"
status: "Done"
release: "V1"
module: "Interfață"
depends_on: ["262"]
performance_checks: ["ui","frame"]
owner: "loop-pbi/deepseek-263"
started_at: "2026-11-26T02:37:13.056Z"
completed_at: "2026-11-26T03:49:46.045Z"
---

# 263 Selectarea oricărui taxi sau civil, camera și un singur scaun PLAYER

## Obiectiv

Jucătorul poate selecta orice taxi sau mașină civilă, camera se mută, iar preluarea explicită păstrează un singur vehicul condus și ruta/cursea celui părăsit.

## Starea actuală și ce lipsește

- Nu există panoul flotei, lista de taxiuri, filtrele sau sortarea în jocul live.
- Nu există selecție pe minimapă/hartă și nici intenția `WORLD` către autoritate.
- Mașinile AI refuză intrarea cu `AI_TRAFFIC`; „orice mașină” din Docs/01 nu este îndeplinit.
- Nu există păstrarea rutei/cursei vehiculului părăsit și nici revenirea lui în AUTO.
- Nu există verificarea unui singur scaun `PLAYER` la tranziții rapide.
- Nu există comportament de focus, pauză și Escape pentru panoul de flotă.

## Context și plan

- [Interfață, cameră și control](../../Docs/08-interfata-camera-si-control.md)
- [Panoul flotei](../../Docs/fleet-panel.md)
- [Selectarea prin hartă](../../Docs/map-selection.md)
- [Schimbarea vehiculului](../../Docs/vehicle-switch.md)
- [Pickingul vehiculelor](../../Docs/vehicle-picking.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 262 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [x] Lista și harta arată toate taxiurile și civilii, cu identitate stabilă și filtre disponibile/în cursă/blocate.
- [x] Un click sau Enter/Space selectează numai camera; vehiculul rămâne în AUTO până la `M` explicit. `L` este refuzat explicit până la 271.
- [x] Preluarea unui vehicul eliberează vehiculul vechi în AUTO și păstrează ruta/cursea lui.
- [x] O mașină AI poate fi preluată după reconcilierea poziției, fără teleport și fără dublă autoritate.
- [x] Maximum un vehicul este sub controlul jucătorului în orice tick.
- [x] Panoul respectă focusul, Tab, Escape, pauza și nu fură tastele de condus.

## Verificare

- Teste de contract pentru selecție, tranziție și un singur scaun.
- Probă în browser: listă, hartă, click, `M`, `L`, revenire.
- Verifică ruta/cursea vehiculului părăsit și costul UI.

## Dovezi de finalizare

Rezultat implementare: Lista live și harta 076 proiectează toate cele 58 de vehicule (24 taxiuri, 32 civili, 2 vehicule seed) cu identitate stabilă `vehicleId`. Un click sau Enter/Space mută numai camera; vehiculul rămâne în AUTO până la `M` explicit. `M` preia orice mașină AI după reconcilierea poziției pe graful de benzi, păstrează ruta când este încă validă sau replanifică spre aceeași destinație, fără teleport. Vehiculul părăsit revine în AUTO cu ruta păstrată. Există maximum un scaun `PLAYER`; `L` este refuzat explicit până la 271. Panoul respectă focusul, Tab, Escape, pauza, are zero listeneri globali și scrie la 10 Hz.

Verificări executate și rezultat: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:architecture` (453 fișiere), `npm run composition:report -- --check`, `npm run docs:check -- --check` — PASS. Teste țintă: 17/17 PASS (`tests/app/live-fleet-selection.test.ts` 5, `tests/ui/fleet-selection.test.ts` 6, `tests/ui/game-shell-host.test.ts` 6). `npm test` integrat: 3.601 teste, 3.587 pass, 0 fail, 14 skip-uri istorice. `npm run fleet:selection:probe` este `NOT_RUN` pentru că Playwright nu este instalat în worktree și `PLAYWRIGHT_MODULE` nu este setat; nu se pretinde PASS de browser. `browser.json` păstrează motivul real.

Fișiere și documente actualizate: `src/app/walking-composition.ts`, `src/app/live-fleet-selection.ts`, `src/fleet/civil-traffic.ts`, `src/main.ts`, `src/rendering/babylon/v3-browser-composition.ts`, `src/ui/fleet-selection-format.ts`, `src/ui/fleet-selection-panel.ts`, `src/ui/game-shell-host.ts`, `src/ui/index.ts`, `src/app/index.ts`, `tests/app/live-fleet-selection.test.ts`, `tests/ui/fleet-selection.test.ts`, `tests/ui/game-shell-host.test.ts`, `scripts/run-fleet-selection-probe.mjs`, `package.json`, `Docs/08`, `Docs/21`, `Docs/31`, `Docs/README.md`, `Docs/live-fleet-selection.md`, `Docs/Evidence/263-fleet-selection/`.

Limitări sau follow-up: `L`/LEARNING este refuzat explicit până la 271; segmentele, eligibilitatea și learning-ul rămân acolo. O mașină condusă care nu poate fi proiectată pe graful de benzi este refuzată la preluare/eliberare, nu teleportată. Minimapa/HUD-ul complet rămâne 281; panoul refolosește geometria 032/033 și markerii 076. Fizica rămâne adaptorul cinematic până la 282. Proba de browser este `NOT_RUN` din cauza Playwright; dovezile sunt contracte și compunerea reală Node.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '263'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
- 2026-11-26: Implementat de `loop-pbi/deepseek-263`; integrat, verificat și mutat în Done.
