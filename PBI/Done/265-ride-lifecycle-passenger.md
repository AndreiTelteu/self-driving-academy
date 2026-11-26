---
id: "265"
title: "Ciclul complet al cursei: pickup, dropoff, pasager, ETA și HUD"
status: "Done"
release: "V1"
module: "Flotă și curse"
depends_on: ["264"]
performance_checks: ["simulation","frame"]
owner: "loop-pbi/deepseek-265"
started_at: "2026-11-26T04:58:00.520Z"
completed_at: "2026-11-26T17:33:42.254Z"
---

# 265 Ciclul complet al cursei: pickup, dropoff, pasager, ETA și HUD

## Obiectiv

O cursă reală trece prin `TO_PICKUP → PICKUP → TO_DROPOFF → DROPOFF → COMPLETED`, cu pasager vizibil, ETA și motive terminale.

## Starea actuală și ce lipsește

- Modulele 061–064 și pasagerul 147 există, dar nu sunt compuse în browser.
- Nu există marcaje de pickup/dropoff, pasager, boarding sau dropoff în lume.
- Nu există HUD de cursă cu pickup, destinație, ETA, progres și stare.
- Nu există păstrarea cursei la schimbarea modului sau a vehiculului.
- Nu există rezultate `FAILED`/`CANCELLED` cu motive și eliberare de revendicare.
- Nu există o probă de browser pentru o cursă completă condusă manual și autonom.

## Context și plan

- [Flotă și curse](../../Docs/07-flota-si-curse.md)
- [Lifecycle-ul cursei](../../Docs/ride-fsm.md)
- [Pickup](../../Docs/pickup.md)
- [Dropoff](../../Docs/dropoff.md)
- [ETA și progres](../../Docs/eta.md)
- [Pasageri simplificați](../../Docs/passenger-visual.md)
- [HUD](../../Docs/hud.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 264 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [x] Pickup-ul și dropoff-ul se acceptă numai în zona reală, sub pragul de viteză și după durata cerută.
- [x] Pasagerul este vizibil la pickup, rămâne la bord și dispare la dropoff; markerii sunt proiectați la ancorele reale 032, iar unul lipsă este omisiune motivată.
- [x] Cursa supraviețuiește schimbării AUTO/MANUAL și selecției altui vehicul. LEARNING nu este încă disponibil (271), dar starea cursei este independentă de mod.
- [x] HUD-ul arată pickup, destinație, ETA, progres și motivul unei stări indisponibile, niciodată `0` inventat.
- [x] O cursă terminală eliberează exact o revendicare și nu poate fi închisă de două ori.
- [x] O probă în browser arată curse complete în AUTO și MANUAL, plus una eșuată cu motiv.

## Verificare

- Teste de contract pentru pickup/dropoff, pasager și ETA.
- Probă în browser: cursă completă în MANUAL și în AUTO.
- Verifică HUD-ul, pasagerul, revendicarea și cleanup-ul.

## Dovezi de finalizare

Rezultat implementare: `src/fleet/live-ride-lifecycle.ts` compune 061/062/063/064 peste claims 264, cu pickup/dropoff în zonele reale 032, dwell fizic, ETA și progres, motive terminale și eliberare exactă a revendicării. `src/app/live-ride-composition.ts` proiectează pasagerul 147 și HUD-ul 073 la ancorele reale; `src/ui/live-ride-markers.ts` afișează markerii. Taxiurile AI asignate primesc acum ruta reală pickup→dropoff prin 041/058: `civil-traffic.ts` execută ruta de serviciu, oprește în ancoră și ține dwell-ul, fără teleport și fără să re-ruteze un actor condus de jucător. O cursă terminală eliberează o singură revendicare; resetul închide cursele active cu `SCENARIO_RESET` și nu duplică cereri sau taxiuri.

Verificări executate și rezultat: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:architecture` (458 fișiere), `npm run composition:report -- --check`, `npm run docs:check -- --check`, `npm run ride:live -- --check`, `npm run ride:live:lifecycle -- --check`, `npm run civil:traffic -- --check` — PASS. Teste țintă 13/13 PASS (lifecycle 9, panel 2, marker 1, plus host integrate). `npm test` integrat: 3.625 teste, 3.611 pass, 0 fail, 14 skip-uri istorice. Raport determinist 66/66: cursă MANUAL completă, cursă AUTO completă (taxi `…0011`, pickup `sz:2-1` → dropoff `sz:0-1`, start 120, boarding 2682, completion 5079, dwell 180/180, 789,5 m, pas maxim 0,222 m/tick, release `COMPLETED`), cursă eșuată `BLOCKED → FAILED/TAXI_BLOCKED` cu o singură eliberare, player takeover păstrează cursa, ETA blocată `null`/`Indisponibil`, reset fără duplicate. Browser probe 40/40 PASS, Chrome 157, WEBGL2, 1440×900, 0 erori: AUTO `…0012` pickup `sz:1-1` → dropoff `sz:1-0`, boarding 1898, completion 6740, dwell 180/180, release `COMPLETED`, plus MANUAL, failed și panel; 10 capturi în `Docs/Evidence/265-ride-lifecycle/screenshots/`.

Fișiere și documente actualizate: `src/fleet/live-ride-lifecycle.ts`, `src/app/live-ride-composition.ts`, `src/fleet/live-rides.ts`, `src/fleet/civil-traffic.ts`, `src/main.ts`, `src/app/index.ts`, `src/ui/live-rides-panel.ts`, `src/ui/live-ride-markers.ts`, `src/ui/index.ts`, tests lifecycle/panel/marker/fixture/report, `scripts/run-live-ride-lifecycle-report.mjs`, `scripts/run-live-ride-lifecycle-probe.mjs`, `package.json`, `Docs/07`, `Docs/21`, `Docs/31`, `Docs/README.md`, `Docs/live-ride-lifecycle.md`, `Docs/live-rides.md`, `Docs/ride-fsm.md`, `Docs/pickup.md`, `Docs/dropoff.md`, `Docs/eta.md`, `Docs/passenger-visual.md`, `Docs/hud.md`, `Docs/Evidence/265-ride-lifecycle/`, `Docs/Evidence/058-civil-traffic/report.json`.

Limitări sau follow-up: Geometria 058 la jonctiuni rămâne discretă: poziția poate sări peste golul nepicat al intersecției (maxim observat 15,11 m), deși progresul rutei este continuu (≤0,222 m/tick) și nu există teleport la ancoră; netezirea conectorilor rămâne follow-up. Markerii pasagerului sunt un overlay DOM proiectat din ancorele reale, nu un asset 3D final. LEARNING nu este încă disponibil (271), dar cursa este independentă de mod. Economia, tariful, review-urile și KPI rămân 266. Proba de browser a folosit `playwright-core` instalat `--no-save` și `PLAYWRIGHT_MODULE`, nu o dependență commitată. Node local 24.19.0; copilul a rulat cu 24.21.0.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '265'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
- 2026-11-26: Implementat de `loop-pbi/deepseek-265`; repair AUTO de `loop-pbi/deepseek-265-repair`; integrat, verificat și mutat în Done.
